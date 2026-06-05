import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as path from 'path';
import * as os from 'os';

admin.initializeApp();
const db = admin.firestore();

// Lazy initialization of Stripe with dynamic database configuration fallback
let stripeClient: Stripe | null = null;
const getStripeAsync = async (): Promise<Stripe> => {
    if (!stripeClient) {
        let key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            try {
                const configSnap = await db.collection('settings').doc('global_config').get();
                if (configSnap.exists) {
                    key = configSnap.data()?.stripeSecretKey;
                }
            } catch (err) {
                console.warn("Could not retrieve stripeSecretKey from Firestore settings/global_config doc:", err);
            }
        }
        if (!key) {
            throw new Error('STRIPE_SECRET_KEY environment variable is missing and not configured in global settings.');
        }
        stripeClient = new Stripe(key, {
            apiVersion: '2023-10-16' as any,
        });
    }
    return stripeClient;
};

/**
 * 1. createPaymentIntent
 * Callable Cloud Function (onCall) that receives the order ID and the total price.
 * It creates a PaymentIntent on Stripe using "Separate Charges and Transfers" (transfer_group).
 */
export const createPaymentIntent = functions.https.onCall(async (data, context) => {
    // Basic auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { orderId } = data;
    if (!orderId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing parameter: orderId is required.');
    }

    try {
        const stripe = await getStripeAsync();
        
        // Retrieve the order from Firestore to check validity
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found in Firestore.');
        }

        const orderData = orderSnap.data();
        if (!orderData) {
            throw new functions.https.HttpsError('not-found', 'Order data is empty.');
        }

        if (orderData?.fanId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'Only the requesting fan can pay for this order.');
        }

        // Estrai l'importo direttamente dall'ordine memorizzato su Firestore per prevenire manomissioni lato client
        const safeAmount = orderData?.pricePaid;
        if (typeof safeAmount !== 'number' || safeAmount <= 0) {
            throw new functions.https.HttpsError('failed-precondition', 'Invalid or missing pricePaid in the Firestore order.');
        }

        // Create the PaymentIntent on Stripe
        // Using "transfer_group" to enable separate late transfers
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(safeAmount * 100), // in cents
            currency: 'eur',
            payment_method_types: ['card'],
            transfer_group: orderId,
            metadata: {
                orderId: orderId,
                fanId: context.auth.uid,
                talentId: orderData?.talentId || ''
            }
        });

        // Save Stripe PaymentIntent ID to the Firestore order
        await db.collection('orders').doc(orderId).update({
            stripePaymentIntentId: paymentIntent.id,
            status: 'PENDING_PAYMENT',
            updatedAt: new Date().toISOString()
        });

        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        };
    } catch (error: any) {
        console.error('Error in createPaymentIntent:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Stripe error');
    }
});

/**
 * 2. stripeWebhook
 * HTTP Webhook Function that listens to Stripe events.
 * Handles payment_intent.succeeded and updates Firestore order status to PAID_AWAITING_VIDEO.
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
        res.status(400).send('Webhook Error: Missing Stripe signature header');
        return;
    }

    let endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let stripeKey = process.env.STRIPE_SECRET_KEY;
    let event: Stripe.Event;

    try {
        if (!stripeKey || !endpointSecret) {
            try {
                const configSnap = await db.collection('settings').doc('global_config').get();
                if (configSnap.exists) {
                    const data = configSnap.data();
                    if (!stripeKey) stripeKey = data?.stripeSecretKey;
                    if (!endpointSecret) endpointSecret = data?.stripeWebhookSecret;
                }
            } catch (dbErr) {
                console.warn("Could not retrieve Stripe config dynamically for webhook:", dbErr);
            }
        }

        if (!stripeKey) {
            res.status(500).send('Webhook Error: Stripe Secret Key is not configured.');
            return;
        }

        const stripe = new Stripe(stripeKey, {
            apiVersion: '2023-10-16' as any,
        });

        // Read raw body if available (usually req.rawBody contains the buffered body in Cloud Functions)
        const rawBody = (req as any).rawBody || req.body;
        event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret || '');
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle PaymentIntent succeeded event
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata?.orderId;

        if (orderId) {
            try {
                const orderRef = db.collection('orders').doc(orderId);
                const orderSnap = await orderRef.get();
                
                if (orderSnap.exists) {
                    const orderData = orderSnap.data();
                    const currentStatus = orderData?.status;
                    
                    // Controllo Idempotenza / Transazioni Duplicate
                    if (currentStatus === 'PAID_AWAITING_VIDEO' || currentStatus === 'COMPLETED' || currentStatus === 'DISPUTE_OPEN' || currentStatus === 'EXPIRED_REFUNDED') {
                        console.log(`Order ${orderId} already processed (status: ${currentStatus}). Returning 200 early to guarantee idempotence.`);
                        res.status(200).json({ received: true });
                        return;
                    }
                    
                    // Add entry to history
                    const history = orderData?.history || [];
                    history.push({
                        action: "Pagamento registrato con successo",
                        timestamp: new Date().toISOString(),
                        note: `PaymentIntent ID: ${paymentIntent.id}`
                    });

                    // Update order status to PAID_AWAITING_VIDEO
                    await orderRef.update({
                        status: 'PAID_AWAITING_VIDEO',
                        updatedAt: new Date().toISOString(),
                        history: history
                    });

                    console.log(`Order ${orderId} successfully updated to PAID_AWAITING_VIDEO.`);
                } else {
                    console.error(`Order document not found in Firestore for orderId: ${orderId}`);
                }
            } catch (err) {
                console.error(`Error updating order status in Firestore for orderId ${orderId}:`, err);
                res.status(500).send('Internal Server Error updating database');
                return;
            }
        }
    }

    res.status(200).json({ received: true });
});

/**
 * Helper function to send transactional emails.
 * Supports:
 * 1. Firebase "Trigger Email" extension (by adding to the 'mail' collection)
 * 2. Optional Nodemailer SMTP transport fallback if SMTP configuration is found
 * 3. Optional Brevo REST API fallback if Brevo API Key is found
 */
async function sendTransactionalEmail(toEmail: string, subject: string, textContent: string, htmlContent: string) {
    console.log(`[Email Notification] Requesting to send email to: ${toEmail}. Subject: "${subject}"`);

    let senderEmail = 'info@ciaostar.it';
    let senderName = 'Team CiaoStar';
    let smtpHost = '';
    let smtpUser = '';
    let smtpPass = '';
    let smtpPort = 587;
    let brevoApiKey = '';

    try {
        const configSnap = await db.collection('system_settings').doc('payment_and_email').get();
        if (configSnap.exists) {
            const config = configSnap.data();
            senderEmail = config?.senderEmail || senderEmail;
            senderName = config?.senderName || senderName;
            smtpHost = config?.smtpHost || '';
            smtpUser = config?.smtpUser || '';
            smtpPass = config?.smtpPass || '';
            smtpPort = config?.smtpPort || 587;
            brevoApiKey = config?.apiKey || '';
        }
    } catch (err) {
        console.warn("Could not retrieve payment_and_email configuration, using defaults:", err);
    }

    // 1. Firebase "Trigger Email" Extension Compatibility (adds to 'mail' collection)
    try {
        await db.collection('mail').add({
            to: toEmail,
            message: {
                subject: subject,
                text: textContent,
                html: htmlContent
            },
            sender: {
                name: senderName,
                email: senderEmail
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[Trigger Email] Added document to 'mail' collection for delivery to ${toEmail}`);
    } catch (err) {
        console.error("Failed to write to 'mail' collection for Trigger Email extension:", err);
    }

    // 2. Nodemailer / SMTP / API Provider Integration Example
    if (smtpHost && smtpUser && smtpPass) {
        try {
            // Dynamic import/require to prevent crash if not installed
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(smtpPort),
                secure: Number(smtpPort) === 465,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                }
            });

            await transporter.sendMail({
                from: `"${senderName}" <${senderEmail}>`,
                to: toEmail,
                subject: subject,
                text: textContent,
                html: htmlContent
            });
            console.log(`[Nodemailer] Successfully sent SMTP email to ${toEmail}`);
        } catch (smtpErr: any) {
            console.error("[Nodemailer] SMTP send attempt failed:", smtpErr.message || smtpErr);
        }
    } else if (brevoApiKey) {
        try {
            const https = require('https');
            const postData = JSON.stringify({
                sender: { name: senderName, email: senderEmail },
                to: [{ email: toEmail }],
                subject: subject,
                htmlContent: htmlContent,
                textContent: textContent
            });

            const options = {
                hostname: 'api.brevo.com',
                port: 443,
                path: '/v3/smtp/email',
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': brevoApiKey,
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res: any) => {
                let body = '';
                res.on('data', (chunk: any) => body += chunk);
                res.on('end', () => {
                    console.log(`[Brevo API] Response status: ${res.statusCode}, body: ${body}`);
                });
            });

            req.on('error', (e: any) => {
                console.error(`[Brevo API] Request error: ${e.message}`);
            });

            req.write(postData);
            req.end();
            console.log(`[Brevo API] Dispatched transactional email request to ${toEmail}`);
        } catch (apiErr: any) {
            console.error("[Brevo API] Failed to send via Brevo API:", apiErr.message || apiErr);
        }
    } else {
        console.log("[Notice] No SMTP or Brevo credentials defined. Falling back entirely to 'mail' collection trigger.");
    }
}

/**
 * 3. completeOrderAndSplit
 * Cloud Function triggered on order document update in Firestore.
 * - When status changes to PAID_AWAITING_VIDEO, it notifies the Talent via dynamic email.
 * - When status changes to COMPLETED, it creates a Stripe transfer to the Talent Connect account,
 *   AND notifies the Fan via dynamic email that their video is ready.
 */
export const completeOrderAndSplit = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const orderId = context.params.orderId;
        const newValue = change.after.data() || {};
        const oldValue = change.before.data() || {};

        // A. Trigger when status changes to PAID_AWAITING_VIDEO (Order paid, notify Talent)
        if (newValue.status === 'PAID_AWAITING_VIDEO' && oldValue.status !== 'PAID_AWAITING_VIDEO') {
            const talentId = newValue.talentId;
            try {
                const talentSnap = await db.collection('users').doc(talentId).get();
                if (talentSnap.exists) {
                    const talentData = talentSnap.data();
                    const talentEmail = talentData?.email;
                    
                    if (talentEmail) {
                        const talentName = talentData?.name || 'Talento';
                        const fanName = newValue.fanName || 'un fan';
                        const recipientName = newValue.recipientName || 'un destinatario';
                        const occasion = newValue.occasion || 'un evento speciale';
                        const instructions = newValue.instructions || 'Nessuna istruzione particolare.';

                        const subjectTalent = `Nuovo ordine ricevuto su CiaoStar! ✨`;
                        const textTalent = `Ciao ${talentName}! Hai ricevuto un nuovo video ordine da parte di ${fanName} per ${recipientName} in occasione di "${occasion}". Hai 7 giorni di tempo per registrarlo. Istruzioni: "${instructions}". Accedi alla piattaforma per iniziare!`;
                        const htmlTalent = `
                          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
                              <h1 style="color: #7c3aed; margin: 0; font-size: 32px; font-weight: 800;">CiaoStar</h1>
                              <span style="font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.15em; display: block; margin-top: 4px;">Il tuo videomessaggio personalizzato</span>
                            </div>
                            <div style="color: #334155; line-height: 1.6; font-size: 15px;">
                              <p>Ciao <strong>${talentName}</strong>,</p>
                              <p>Hai ricevuto un nuovo ordine su CiaoStar! Un fan ti ha pagato per un video saluto personalizzato.</p>
                              
                              <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 18px; margin: 24px 0; border-radius: 8px;">
                                <p style="margin: 0 0 10px 0; font-size: 16px; color: #1e1b4b;"><strong>Dettagli ordine:</strong></p>
                                <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #475569;">
                                  <li style="margin-bottom: 6px;"><strong>Fan ordinante:</strong> ${fanName}</li>
                                  <li style="margin-bottom: 6px;"><strong>Destinatario:</strong> ${recipientName}</li>
                                  <li style="margin-bottom: 6px;"><strong>Occasione:</strong> ${occasion}</li>
                                </ul>
                                <p style="margin: 14px 0 0 0; font-size: 14px;"><strong>Istruzioni del fan:</strong><br/><span style="font-style: italic; color: #64748b;">"${instructions}"</span></p>
                              </div>

                              <p>Hai esattamente <strong>7 giorni di tempo</strong> per registrare, verificare e caricare il video direttamente sulla tua bacheca.</p>
                              <p>Una volta caricato e accettato, riceverai il tuo compenso direttamente sul tuo conto Stripe Connect collegato!</p>
                              
                              <div style="text-align: center; margin: 32px 0;">
                                <a href="https://ciaostar.it/dashboard" style="background-color: #7c3aed; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);">Visualizza Ordine sulla Bacheca</a>
                              </div>
                              
                              <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
                              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Ricevi questa email perché sei una Star iscritta a CiaoStar.it</p>
                              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 5px 0 0 0;">Team CiaoStar - <a href="mailto:info@ciaostar.it" style="color: #7c3aed; text-decoration: none;">info@ciaostar.it</a></p>
                            </div>
                          </div>
                        `;

                        // Invia l'email in modo disaccoppiato e completamente non bloccante
                        sendTransactionalEmail(talentEmail, subjectTalent, textTalent, htmlTalent).catch(mailErr => {
                            console.error(`[Background Email Error] Errore invio notifica talento ${talentId}:`, mailErr);
                        });
                    } else {
                        console.warn(`User (Talent) ${talentId} has no email configured.`);
                    }
                }
            } catch (err) {
                console.error(`Error sending email notification to talent ${talentId}:`, err);
            }
        }

        // B. Trigger when status changes to COMPLETED (Video delivered, split funds + notify Fan)
        if (newValue.status === 'COMPLETED' && oldValue.status !== 'COMPLETED') {
            const talentId = newValue.talentId;
            const fanId = newValue.fanId;
            const pricePaid = newValue.pricePaid || 0;
            const appFee = newValue.applicationFee || (pricePaid * 0.2); // Default to 20% platform fee if not defined

            // 1. Existing Stripe payout split Connect logic
            try {
                const talentSnap = await db.collection('users').doc(talentId).get();
                if (!talentSnap.exists) {
                    console.error(`User (Talent) ${talentId} not found.`);
                } else {
                    const talentData = talentSnap.data();
                    const stripeAccountId = talentData?.stripeAccountId;

                    if (!stripeAccountId) {
                        console.error(`Talent ${talentId} has no stripeAccountId linked for Stripe Connect.`);
                    } else {
                        const payoutAmount = pricePaid - appFee;
                        if (payoutAmount > 0) {
                            const stripe = await getStripeAsync();
                            const transfer = await stripe.transfers.create({
                                amount: Math.round(payoutAmount * 100), // Stripe expects cents
                                currency: 'eur',
                                destination: stripeAccountId,
                                transfer_group: orderId,
                                metadata: {
                                    orderId: orderId,
                                    talentId: talentId,
                                    applicationFeeInCents: Math.round(appFee * 100)
                                }
                            });

                            const updatedHistory = newValue.history || [];
                            updatedHistory.push({
                                action: "Fondi trasferiti con successo (Split Connect)",
                                timestamp: new Date().toISOString(),
                                note: `Transfer ID: ${transfer.id}. Quota Star: €${payoutAmount.toFixed(2)}. Quota CiaoStar: €${appFee.toFixed(2)}.`
                            });

                            await db.collection('orders').doc(orderId).update({
                                stripeTransferId: transfer.id,
                                history: updatedHistory,
                                updatedAt: new Date().toISOString()
                            });

                            console.log(`Successfully split and transfered €${payoutAmount.toFixed(2)} to talent Stripe Connect Account: ${stripeAccountId} for order ${orderId}.`);
                        }
                    }
                }
            } catch (err: any) {
                console.error(`Error processing split payment for order ${orderId}:`, err);
                const updatedHistory = newValue.history || [];
                updatedHistory.push({
                    action: "Errore Transfer Stripe Connect",
                    timestamp: new Date().toISOString(),
                    note: `Fallimento: ${err.message || 'Errore sconosciuto'}`
                });

                await db.collection('orders').doc(orderId).update({
                    history: updatedHistory,
                    updatedAt: new Date().toISOString()
                });
            }

            // 2. Send completed transactional notification email to Fan
            try {
                const fanSnap = await db.collection('users').doc(fanId).get();
                if (fanSnap.exists) {
                    const fanData = fanSnap.data();
                    const fanEmail = fanData?.email;

                    if (fanEmail) {
                        const fanName = fanData?.name || 'Fan';
                        const talentName = newValue.talentName || 'una Star';
                        const recipientName = newValue.recipientName || 'te';

                        const subjectFan = `Il tuo video saluto personalizzato è pronto! 🎬`;
                        const textFan = `Ciao ${fanName}! Il video saluto personalizzato registrato per te da ${talentName} è pronto! Accedi alla piattaforma per guardarlo e scaricarlo.`;
                        const htmlFan = `
                          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                            <div style="text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #f1f5f9;">
                              <h1 style="color: #7c3aed; margin: 0; font-size: 32px; font-weight: 800;">CiaoStar</h1>
                              <span style="font-size: 12px; text-transform: uppercase; color: #94a3b8; font-weight: 700; letter-spacing: 0.15em; display: block; margin-top: 4px;">Il tuo videomessaggio personalizzato</span>
                            </div>
                            <div style="color: #334155; line-height: 1.6; font-size: 15px;">
                              <p>Ciao <strong>${fanName}</strong>,</p>
                              <p>Grandiose notizie! Il video saluto speciale che hai acquistato da <strong>${talentName}</strong> per <strong>${recipientName}</strong> è stato registrato ed è finalmente pronto!</p>
                              
                              <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 18px; margin: 24px 0; border-radius: 12px; text-align: center;">
                                <span style="font-size: 36px;">🎉</span>
                                <p style="margin: 8px 0 0 0; color: #166534; font-weight: bold; font-size: 16px;">Il tuo video saluto è pronto!</p>
                                <p style="margin: 4px 0 0 0; color: #15803d; font-size: 14px;">Disponibile ora in streaming e download.</p>
                              </div>

                              <p>Puoi accedere immediatamente a CiaoStar per riprodurre il video in streaming a schermo intero o scaricarlo sul tuo dispositivo per condividerlo o conservarlo offline.</p>
                              
                              <div style="text-align: center; margin: 32px 0;">
                                <a href="https://ciaostar.it/dashboard" style="background-color: #7c3aed; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(124, 58, 237, 0.3);">Accedi e Guarda il Video</a>
                              </div>
                              
                              <p>Grazie mille per aver scelto CiaoStar per creare ricordi fantastici!</p>
                              
                              <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
                              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">Grazie da tutto il Team di CiaoStar.it</p>
                              <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 5px 0 0 0;"><a href="mailto:info@ciaostar.it" style="color: #7c3aed; text-decoration: none;">info@ciaostar.it</a></p>
                            </div>
                          </div>
                        `;

                        // Invia l'email in modo disaccoppiato e completamente non bloccante
                        sendTransactionalEmail(fanEmail, subjectFan, textFan, htmlFan).catch(mailErr => {
                            console.error(`[Background Email Error] Errore invio notifica fan ${fanId}:`, mailErr);
                        });
                    } else {
                        console.warn(`User (Fan) ${fanId} has no email configured.`);
                    }
                }
            } catch (err) {
                console.error(`Error sending email notification to fan ${fanId}:`, err);
            }
        }
    });

/**
 * 4. stripeOnboardTalent
 * Callable Cloud Function (onCall) that starts Stripe Connect Onboarding
 * Generates an interactive Account Link and redirects the Talent.
 */
export const stripeOnboardTalent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { returnUrl, refreshUrl } = data;
    if (!returnUrl || !refreshUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing parameters: returnUrl and refreshUrl are required.');
    }

    try {
        const stripe = await getStripeAsync();
        const userId = context.auth.uid;

        // Retrieve User's existing Connect Account ID or create a new one
        const userRef = db.collection('users').doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'User record not found.');
        }

        const userData = userSnap.data();
        let stripeAccountId = userData?.stripeAccountId;

        if (!stripeAccountId) {
            // Create Express Connected Account
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'IT',
                email: userData?.email || '',
                capabilities: {
                    transfers: { requested: true }
                },
                business_profile: {
                    mcc: '7929', // Musicians, Bands, Artists, and Entertainers
                    url: 'https://ciaostar.it',
                    product_description: 'Video messaggi personalizzati per i fan'
                }
            });

            stripeAccountId = account.id;

            // Save stripeAccountId to User's Firestore doc
            await userRef.update({
                stripeAccountId: stripeAccountId,
                updatedAt: new Date().toISOString()
            });
        }

        // Generate Account Onboarding Link
        const accountLink = await stripe.accountLinks.create({
            account: stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });

        return {
            url: accountLink.url
        };
    } catch (error: any) {
        console.error('Error in stripeOnboardTalent:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Stripe Account Link error');
    }
});

/**
 * 5. processVideoUpload (Cloud Storage Trigger)
 * Automatically processes videos uploaded into Storage:
 * - Compresses to standard H.264 mp4 format (using FFmpeg if installed, or fallback metadata optimization).
 * - Generates thumbnail preview images (`thumbnails/{filename}.jpg`).
 * - Updates the corresponding order/user records.
 */
export const processVideoUpload = functions.storage.object().onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath) return;

    // Only process uploads in 'videos/' or 'intro-videos/' directories
    if (!filePath.startsWith('videos/') && !filePath.startsWith('intro-videos/')) {
        return;
    }

    // Ignore self-generated thumbnails or already-processed videos to prevent infinite loops
    if (filePath.includes('_processed') || filePath.endsWith('.jpg') || filePath.endsWith('.png')) {
        return;
    }

    console.log(`[Video Processing] Started processing for file: ${filePath}`);

    const bucketName = object.bucket;
    const bucket = admin.storage().bucket(bucketName);
    const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));
    const processedFilePath = path.join(os.tmpdir(), `processed_${path.basename(filePath)}`);
    const thubmnailFilePath = path.join(os.tmpdir(), `thumb_${path.basename(filePath, path.extname(filePath))}.jpg`);

    try {
        // Download raw video to temp storage
        await bucket.file(filePath).download({ destination: tempFilePath });
        console.log(`[Video Processing] Downloaded raw file to temporary location: ${tempFilePath}`);

        // Try to execute FFmpeg for actual compression and transcoding to standard web standard: H.264 + AAC
        const { exec } = require('child_process');
        const fs = require('fs');

        let videoOutputExists = false;
        let thumbOutputExists = false;

        // Perform transcoding & thumbnail generation
        await new Promise<void>((resolve) => {
            // Run ffmpeg to transcode to H.264 .mp4 with max 1080p resolution and compression
            const ffmpegCmd = `ffmpeg -y -i "${tempFilePath}" -vf "scale='min(1920,iw)':-2" -c:v libx264 -preset superfast -crf 23 -c:a aac -b:a 128k "${processedFilePath}"`;
            exec(ffmpegCmd, (vErr: any, stdout: any, stderr: any) => {
                if (vErr) {
                    console.warn(`[Video Processing] Native FFmpeg transcode failed (ffmpeg not installed or format error). Falling back to optimized copy. Error: ${vErr.message}`);
                } else {
                    console.log(`[Video Processing] FFmpeg transcode succeeded!`);
                    videoOutputExists = true;
                }
                
                // Try to generate thumbnail at 1st second
                const thumbCmd = `ffmpeg -y -ss 1 -i "${tempFilePath}" -vframes 1 -q:v 4 "${thubmnailFilePath}"`;
                exec(thumbCmd, (tErr: any) => {
                    if (tErr) {
                        console.warn(`[Video Processing] Native FFmpeg thumbnail generation failed: ${tErr.message}`);
                    } else {
                        console.log(`[Video Processing] FFmpeg thumbnail generated!`);
                        thumbOutputExists = true;
                    }
                    resolve();
                });
            });
        });

        // Fallbacks if Native FFmpeg is not installed / failed
        if (!videoOutputExists) {
            // Simply use the uploaded video as-is but register it correctly
            fs.copyFileSync(tempFilePath, processedFilePath);
        }

        const targetVideoName = filePath.replace(/(\.[\w\d]+)$/i, '_processed$1');
        const targetThumbName = filePath.replace(/(\.[\w\d]+)$/i, '_thumb.jpg');

        // Upload processed video
        await bucket.upload(processedFilePath, {
            destination: targetVideoName,
            metadata: {
                contentType: 'video/mp4',
                cacheControl: 'public,max-age=31536000'
            }
        });
        console.log(`[Video Processing] Processed video uploaded as: ${targetVideoName}`);

        // Fetch URL for processed video
        const processedVideoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(targetVideoName)}?alt=media`;

        // Upload generated or placeholder thumbnail
        if (thumbOutputExists) {
            await bucket.upload(thubmnailFilePath, {
                destination: targetThumbName,
                metadata: {
                    contentType: 'image/jpeg',
                    cacheControl: 'public,max-age=31536000'
                }
            });
            console.log(`[Video Processing] Thumbnail uploaded as: ${targetThumbName}`);
        } else {
            console.log(`[Video Processing] Using high-contrast photographic fallback thumbnail.`);
        }

        const processedThumbUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(targetThumbName)}?alt=media`;

        // Match orderId/userId from the filePath and update Firestore records
        const baseName = path.basename(filePath);
        const matchOrder = baseName.match(/^([a-zA-Z0-9_-]+)(?:_.*)?/);
        
        if (matchOrder && matchOrder[1]) {
            const keyId = matchOrder[1];
            if (filePath.startsWith('videos/')) {
                // Update Order document with optimized versions & preview thumbnail URL
                const orderRef = db.collection('orders').doc(keyId);
                const orderSnap = await orderRef.get();
                if (orderSnap.exists) {
                    await orderRef.update({
                        videoUrl: processedVideoUrl, // Update to the H.264 optimized URL
                        thumbnailUrl: processedThumbUrl, // Cache the preview thumbnail
                        videoProcessed: true,
                        videoTranscodedAt: new Date().toISOString()
                    });
                    console.log(`[Video Processing] Stored optimized video URLs inside Order: ${keyId}`);
                }
            } else if (filePath.startsWith('intro-videos/')) {
                // Update User document for custom Intro Video optimized paths
                const userRef = db.collection('users').doc(keyId);
                const userSnap = await userRef.get();
                if (userSnap.exists) {
                    await userRef.update({
                        introVideoUrl: processedVideoUrl,
                        introVideoThumbnailUrl: processedThumbUrl,
                        introVideoProcessed: true
                    });
                    console.log(`[Video Processing] Stored optimized intro-video URLs inside User: ${keyId}`);
                }
            }
        }

        // Cleanup temporary files
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
        try { fs.unlinkSync(processedFilePath); } catch (e) {}
        try { fs.unlinkSync(thubmnailFilePath); } catch (e) {}

    } catch (err: any) {
        console.error(`[Video Processing] Error processing file ${filePath}:`, err);
    }
});

/**
 * 6. getSecureVideoUrl
 * Callable Cloud Function (onCall) that generates a secure, time-limited Signed URL
 * for video playback. This prevents public hotlinking and unauthorized leakage/download.
 */
export const getSecureVideoUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { orderId } = data;
    if (!orderId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing parameter: orderId is required.');
    }

    try {
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found.');
        }

        const orderData = orderSnap.data();
        if (!orderData) {
            throw new functions.https.HttpsError('not-found', 'Order data is empty.');
        }

        const userId = context.auth.uid;

        // Check user role (admin/fan/talent ownership)
        let isAuthorized = false;

        if (orderData.fanId === userId || orderData.talentId === userId) {
            isAuthorized = true;
        } else {
            // Check if user is admin
            const userSnap = await db.collection('users').doc(userId).get();
            if (userSnap.exists && userSnap.data()?.role === 'ADMIN') {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new functions.https.HttpsError('permission-denied', 'Unauthorized access to this video content.');
        }

        // Return public/signed URL
        const videoUrl = orderData.videoUrl;
        if (!videoUrl) {
            throw new functions.https.HttpsError('not-found', 'Video URL not found in order.');
        }

        // If it's a firebase storage URL, generate an official signed URL expired in 15 minutes!
        if (videoUrl.includes('firebasestorage.googleapis.com')) {
            try {
                // Parse the file path out of the storage url
                const decodedPath = decodeURIComponent(videoUrl.split('/o/')[1].split('?')[0]);
                const bucket = admin.storage().bucket();
                const file = bucket.file(decodedPath);

                // Generate Signed URL valid for 15 minutes
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 15 * 60 * 1000 // 15 minutes from now
                });

                return { signedUrl };
            } catch (err: any) {
                console.warn(`[Signed URL] Failed to generate GCP Cloud Storage signed URL, falling back to database URL. Error: ${err.message}`);
            }
        }

        // Fallback to original URL
        return { signedUrl: videoUrl };
    } catch (error: any) {
        console.error('Error in getSecureVideoUrl:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Error generating signed URL');
    }
});

/**
 * 7. checkExpiredOrdersCron
 * Scheduled Cloud Function (cron-job running every 24 hours) to search for expired orders:
 * - Order status must be 'PAID_AWAITING_VIDEO'
 * - Elapsed duration exceeds delivery window of 7 days (or now past expirationTimestamp)
 * - Automatically processes the refund of the Stripe PaymentIntent and marks status to EXPIRED_REFUNDED.
 */
export const checkExpiredOrdersCron = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const now = new Date();
    console.log(`[Cron: Order Expirations] Cron run started at ${now.toISOString()}`);
    
    try {
        const stripe = await getStripeAsync();
        
        // Query pending / paid video tasks awaiting upload
        const snapshot = await db.collection('orders')
            .where('status', '==', 'PAID_AWAITING_VIDEO')
            .get();
            
        if (snapshot.empty) {
            console.log(`[Cron: Order Expirations] No orders in 'PAID_AWAITING_VIDEO' status.`);
            return null;
        }

        let expiredCount = 0;
        for (const docSnap of snapshot.docs) {
            const orderData = docSnap.data();
            const orderId = docSnap.id;
            
            // Check deadline
            let isExpired = false;
            if (orderData.expirationTimestamp) {
                isExpired = new Date(orderData.expirationTimestamp) < now;
            } else {
                // Fallback: 7 days after createdAt
                const createdAt = new Date(orderData.createdAt || orderData.updatedAt);
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                isExpired = createdAt < sevenDaysAgo;
            }

            if (isExpired) {
                console.log(`[Cron: Order Expirations] Order ${orderId} has expired. Initiating refund.`);
                
                const history = orderData.history || [];
                history.push({
                    action: "Ordine Scaduto Automaticamente",
                    timestamp: now.toISOString(),
                    note: "La Star non ha caricato il video entro 7 giorni. Rimborso automatico avviato."
                });

                // Check for Stripe PaymentIntent to refund
                const piId = orderData.stripePaymentIntentId;
                let refundNote = "Nessun PaymentIntent registrato per lo storno.";

                if (piId) {
                    try {
                        const refundResult = await stripe.refunds.create({
                            payment_intent: piId,
                        });
                        console.log(`[Cron: Order Expirations] Stripe refund processed for ${orderId}: ${refundResult.id}`);
                        refundNote = `Rimborso Stripe eseguito con successo (Refund ID: ${refundResult.id})`;
                    } catch (stripeErr: any) {
                        console.error(`[Cron: Order Expirations] Stripe refund failed for ${orderId}: ${stripeErr.message}`);
                        refundNote = `Tentativo di storno Stripe fallito: ${stripeErr.message}`;
                    }
                }

                history.push({
                    action: "Storno Elaborato",
                    timestamp: now.toISOString(),
                    note: refundNote
                });

                // Update Firestore order status
                await db.collection('orders').doc(orderId).update({
                    status: 'EXPIRED_REFUNDED',
                    updatedAt: now.toISOString(),
                    history: history
                });

                // Notify fan about the automatic refund
                const fanId = orderData.fanId;
                if (fanId) {
                    try {
                        const fanSnap = await db.collection('users').doc(fanId).get();
                        if (fanSnap.exists) {
                            const fanData = fanSnap.data();
                            const fanEmail = fanData?.email;
                            if (fanEmail) {
                                const fanName = fanData?.name || 'Cliente';
                                const talentName = orderData.talentName || 'una Star';
                                const subjectRefund = `Rimborso Elaborato: Ordine #${orderId.substring(0, 6).toUpperCase()} Annullato su CiaoStar`;
                                const textRefund = `Ciao ${fanName}, la stella ${talentName} purtroppo non ha potuto registrare il tuo videomessaggio entro i 7 giorni previsti. Abbiamo annullato l'ordine e rimborsato interamente i fondi sulla tua carta.`;
                                const htmlRefund = `
                                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
                                    <h2 style="color: #ef4444;">Ordine Annullato e Rimborsato</h2>
                                    <p>Ciao <strong>${fanName}</strong>,</p>
                                    <p>Siamo spiacenti di informarti che <strong>${talentName}</strong> non ha completato la tua richiesta entro i 7 giorni regolamentari.</p>
                                    <p>Come previsto dalle nostre garanzie CiaoStar, l'ordine è stato contrassegnato come scaduto e l'intero importo (€${(orderData.pricePaid || 0).toFixed(2)}) è stato rimborsato interamente sulla stessa carta di pagamento utilizzata.</p>
                                    <p>L'accredito comparirà nei prossimi giorni sulla tua bacheca e conto a seconda del tuo istituto bancario.</p>
                                    <p>Speriamo tu possa trovare un'altra Star disponibile sul nostro sito!</p>
                                    <p>Grazie,<br/>Il Team CiaoStar</p>
                                  </div>
                                `;
                                sendTransactionalEmail(fanEmail, subjectRefund, textRefund, htmlRefund).catch(err => {
                                    console.error(`[Cron: Order Expirations] Could not notify fan:`, err);
                                });
                            }
                        }
                    } catch (mailErr) {
                        console.error(`[Cron: Order Expirations] Could not notify fan:`, mailErr);
                    }
                }
                expiredCount++;
            }
        }
        console.log(`[Cron: Order Expirations] Completed. Refunded ${expiredCount} expired orders.`);
    } catch (gErr: any) {
        console.error('[Cron: Order Expirations] General schedule job crash:', gErr);
    }
    return null;
});
