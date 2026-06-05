import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

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

    const { orderId, amount } = data;
    if (!orderId || !amount) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing parameters: orderId and amount are required.');
    }

    try {
        const stripe = await getStripeAsync();
        
        // Retrieve the order from Firestore to check validity
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found in Firestore.');
        }

        const orderData = orderSnap.data();
        if (orderData?.fanId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'Only the requesting fan can pay for this order.');
        }

        // Create the PaymentIntent on Stripe
        // Using "transfer_group" to enable separate late transfers
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // in cents
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

                        await sendTransactionalEmail(talentEmail, subjectTalent, textTalent, htmlTalent);
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

                        await sendTransactionalEmail(fanEmail, subjectFan, textFan, htmlFan);
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
