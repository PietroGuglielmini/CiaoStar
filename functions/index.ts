import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as path from 'path';
import * as os from 'os';

admin.initializeApp();
const db = admin.firestore();

// Lazy initialization of Stripe with dynamic database configuration fallback
let stripeClient: Stripe | null = null;
let currentStripeKey: string | null = null;

const getStripeAsync = async (): Promise<Stripe> => {
    let key = process.env.STRIPE_SECRET_KEY;
    
    try {
        // Try the new secure _platform_secrets collection first
        const platformSnap = await db.collection('_platform_secrets').doc('stripe_config').get();
        if (platformSnap.exists) {
            const pc = platformSnap.data();
            const mode = pc?.mode || 'test';
            if (mode === 'test') {
                key = pc?.testSecretKey;
            } else {
                key = pc?.liveSecretKey;
            }
        }
    } catch (err) {
        console.warn("Could not retrieve Stripe dynamic config from _platform_secrets:", err);
    }

    if (!key) {
        try {
            // First try the secrets collection
            const secretsSnap = await db.collection('secrets').doc('stripe').get();
            if (secretsSnap.exists) {
                key = secretsSnap.data()?.stripeSecretKey;
            }
            
            // Fallback to legacy settings/global_config
            if (!key) {
                const configSnap = await db.collection('settings').doc('global_config').get();
                if (configSnap.exists) {
                    key = configSnap.data()?.stripeSecretKey;
                }
            }
        } catch (err) {
            console.warn("Could not retrieve legacy stripeSecretKey from Firestore index:", err);
        }
    }

    if (!key) {
        throw new Error('STRIPE_SECRET_KEY environment variable is missing and not configured in global settings.');
    }

    if (!stripeClient || currentStripeKey !== key) {
        stripeClient = new Stripe(key, {
            apiVersion: '2023-10-16' as any,
        });
        currentStripeKey = key;
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

    // Rate Limiting Check
    const ipLimitAllowed = await checkoutRateLimit(context.auth.uid, 15, 60 * 1000 * 15);
    if (!ipLimitAllowed) {
        throw new functions.https.HttpsError('resource-exhausted', 'Troppe richieste di pagamento in sequenza. Riprova tra 15 minuti.');
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

        const talentId = orderData.talentId;
        if (!talentId) {
            throw new functions.https.HttpsError('failed-precondition', 'Missing talentId in the Firestore order.');
        }

        const talentSnap = await db.collection('users').doc(talentId).get();
        if (!talentSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Talent user document not found.');
        }

        const talentData = talentSnap.data();
        const taxRegime = talentData?.tax_regime || 'forfettario';

        // Retrieve the platform fee setting (or custom fee rate)
        let commissionPercent = 20;
        try {
            const configSnap = await db.collection('settings').doc('global_config').get();
            if (configSnap.exists) {
                const configData = configSnap.data();
                if (configData?.platformFeePercent !== undefined) {
                    commissionPercent = configData.platformFeePercent;
                }
            }
        } catch (settingsError) {
            console.warn("Could not retrieve global_config platformFeePercent:", settingsError);
        }

        if (talentData?.customCommissionPercent !== undefined && talentData?.customCommissionPercent !== null) {
            commissionPercent = talentData.customCommissionPercent;
        }

        // Estrai l'importo base direttamente dall'ordine memorizzato su Firestore per prevenire manomissioni lato client
        const basePrice = orderData?.basePrice || orderData?.pricePaid || talentData?.price || 0;
        if (typeof basePrice !== 'number' || basePrice <= 0) {
            throw new functions.https.HttpsError('failed-precondition', 'Invalid or missing price in the Firestore order.');
        }

        let finalPricePaid = basePrice;
        let finalApplicationFee = 0;

        const baseFee = (basePrice * commissionPercent) / 100;
        if (taxRegime === 'ordinario') {
            // Caso A (Ordinario): Fan pays base price + 22% VAT. CiaoStar keeps platform fee + 22% VAT.
            finalPricePaid = Number((basePrice * 1.22).toFixed(2));
            finalApplicationFee = Number((baseFee * 1.22).toFixed(2));
        } else {
            // Caso B (Forfettario): Fan pays base price. CiaoStar keeps platform fee + 22% VAT.
            finalPricePaid = Number(basePrice.toFixed(2));
            finalApplicationFee = Number((baseFee * 1.22).toFixed(2));
        }

        // Create the PaymentIntent on Stripe
        // Using "transfer_group" to enable separate late transfers
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(finalPricePaid * 100), // in cents
            currency: 'eur',
            capture_method: 'manual', // Set capture_method to manual for Auth & Capture
            automatic_payment_methods: {
                enabled: true
            },
            transfer_group: orderId,
            metadata: {
                orderId: orderId,
                fanId: context.auth.uid,
                talentId: talentId,
                taxRegime: taxRegime,
                basePrice: String(basePrice),
                finalPricePaid: String(finalPricePaid),
                finalApplicationFee: String(finalApplicationFee)
            }
        });

        // Save Stripe PaymentIntent ID and resolved pricing values to the Firestore order
        await db.collection('orders').doc(orderId).update({
            stripePaymentIntentId: paymentIntent.id,
            status: 'PENDING_PAYMENT',
            pricePaid: finalPricePaid,
            applicationFee: finalApplicationFee,
            taxRegime: taxRegime,
            tax_regime: taxRegime,
            basePrice: basePrice,
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
    const sig = req.headers['stripe-signature'];
    if (!sig) {
        res.status(400).send('Webhook Error: Missing Stripe signature header');
        return;
    }

    let endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let stripeKey = process.env.STRIPE_SECRET_KEY;
    let event: Stripe.Event;

    try {
        // Try the new secure _platform_secrets collection first
        const platformSnap = await db.collection('_platform_secrets').doc('stripe_config').get();
        if (platformSnap.exists) {
            const pc = platformSnap.data();
            const mode = pc?.mode || 'test';
            if (mode === 'test') {
                stripeKey = pc?.testSecretKey;
                endpointSecret = pc?.testWebhookSecret;
            } else {
                stripeKey = pc?.liveSecretKey;
                endpointSecret = pc?.liveWebhookSecret;
            }
        }
    } catch (err) {
        console.warn("Could not retrieve Stripe dynamic config for webhook from _platform_secrets:", err);
    }

    try {
        if (!stripeKey || !endpointSecret) {
            try {
                // First try direct secrets collection
                const secretsSnap = await db.collection('secrets').doc('stripe').get();
                if (secretsSnap.exists) {
                    const data = secretsSnap.data();
                    if (!stripeKey) stripeKey = data?.stripeSecretKey;
                    if (!endpointSecret) endpointSecret = data?.stripeWebhookSecret;
                }
                
                // Fallback to legacy settings/global_config
                if (!stripeKey || !endpointSecret) {
                    const configSnap = await db.collection('settings').doc('global_config').get();
                    if (configSnap.exists) {
                        const data = configSnap.data();
                        if (!stripeKey) stripeKey = data?.stripeSecretKey;
                        if (!endpointSecret) endpointSecret = data?.stripeWebhookSecret;
                    }
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

        // Use req.rawBody or raw buffer fallback to validate high-fidelity crypto signature
        const rawBody = (req as any).rawBody || req.body;
        event = stripe.webhooks.constructEvent(rawBody, sig as string, endpointSecret || '');
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle PaymentIntent succeeded, Checkout Session completed, and pre-authorizations (requires capture) events
    if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed' || event.type === 'payment_intent.amount_capturable_updated') {
        const stripeObject = event.data.object as any;
        const orderId = stripeObject.metadata?.orderId;
        const paymentId = stripeObject.id;

        if (orderId) {
            try {
                const orderRef = db.collection('orders').doc(orderId);
                const orderSnap = await orderRef.get();
                
                if (orderSnap.exists) {
                    const orderData = orderSnap.data();
                    const currentStatus = orderData?.status;
                    
                    // Controllo Idempotenza / Transazioni Duplicate
                    if (currentStatus === 'PAID_AWAITING_VIDEO' || currentStatus === 'ACCEPTED' || currentStatus === 'COMPLETED' || currentStatus === 'DISPUTE_OPEN' || currentStatus === 'EXPIRED_REFUNDED') {
                        console.log(`Order ${orderId} already processed (status: ${currentStatus}). Returning 200 early to guarantee idempotence.`);
                        res.status(200).json({ received: true });
                        return;
                    }
                    
                    // Add entry to history
                    const history = orderData?.history || [];
                    history.push({
                        action: "Pagamento registrato con successo",
                        timestamp: new Date().toISOString(),
                        note: `Event: ${event.type}, ID: ${paymentId}`
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
            // Genera e invia fattura d'acquisto in modo asincrono (completamente non bloccante)
            generateAndSendInvoice(orderId, newValue).catch(invoiceError => {
                console.error(`[Invoice Generator Error] Failed to auto-generate and email invoice for order ${orderId}:`, invoiceError);
            });

            const talentId = newValue.talentId;

            // Create in-app notification for the Talent (now sent ONLY on actual payment confirmation)
            try {
                await db.collection('notifications').add({
                    recipientId: talentId,
                    title: "Nuova richiesta ricevuta!",
                    message: `Hai ricevuto una nuova richiesta da parte di ${newValue.fanName || 'un fan'} per ${newValue.recipientName || 'un destinatario'}!`,
                    orderId: orderId,
                    createdAt: new Date().toISOString(),
                    read: false,
                    type: 'orderCreated'
                });
                console.log(`[Notification] In-app notification created successfully for talent ${talentId} for paid order ${orderId}`);
            } catch (notifErr) {
                console.error(`Error creating in-app notification for talent ${talentId}:`, notifErr);
            }

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
                            
                            // Capture the pre-authorized PaymentIntent first
                            const piId = newValue.stripePaymentIntentId;
                            if (piId) {
                                try {
                                    const pi = await stripe.paymentIntents.retrieve(piId);
                                    if (pi.status === 'requires_capture') {
                                        console.log(`[Stripe Capture] Capturing authorized PaymentIntent ${piId}...`);
                                        await stripe.paymentIntents.capture(piId);
                                        console.log(`[Stripe Capture] PaymentIntent ${piId} successfully captured!`);
                                    } else {
                                        console.log(`[Stripe Capture] PaymentIntent ${piId} status is ${pi.status}, capture skipped.`);
                                    }
                                } catch (captureErr: any) {
                                    console.error(`[Stripe Capture Error] Failed to capture payment intent ${piId}:`, captureErr);
                                }
                            }

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

        // C. Trigger when status changes to REJECTED, CANCELED, CANCELED_BY_FAN or EXPIRED_REFUNDED (Void/Release pre-authorized funds or issue refund)
        if (
            (newValue.status === 'REJECTED' || newValue.status === 'CANCELED' || newValue.status === 'CANCELED_BY_FAN' || newValue.status === 'EXPIRED_REFUNDED') &&
            (oldValue.status !== newValue.status)
        ) {
            const piId = newValue.stripePaymentIntentId;
            if (piId) {
                try {
                    const stripe = await getStripeAsync();
                    const pi = await stripe.paymentIntents.retrieve(piId);
                    if (pi.status === 'requires_capture') {
                        console.log(`[Stripe Void] Cancelling/Voiding authorized PaymentIntent ${piId} (Order status: ${newValue.status})...`);
                        await stripe.paymentIntents.cancel(piId);
                        console.log(`[Stripe Void] PaymentIntent ${piId} successfully voided.`);
                    } else if (pi.status === 'succeeded') {
                        console.log(`[Stripe Refund] PaymentIntent ${piId} has already been captured. Issuing standard refund (Order status: ${newValue.status})...`);
                        await stripe.refunds.create({
                            payment_intent: piId,
                        });
                        console.log(`[Stripe Refund] PaymentIntent ${piId} successfully refunded.`);
                    }
                } catch (cancelErr: any) {
                    console.error(`[Stripe Void/Refund Error] Failed to process cancel/refund for PaymentIntent ${piId}:`, cancelErr);
                }
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

    // Rate Limiting Check
    const onboardAllowed = await checkoutRateLimit(context.auth.uid, 5, 60 * 1000 * 15);
    if (!onboardAllowed) {
        throw new functions.https.HttpsError('resource-exhausted', 'Troppe richieste di onboarding in sequenza. Riprova tra poco.');
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

/**
 * 8. generateAndSendInvoice
 * Helper to compute split fees, save a receipt/invoice document on Firestore, and email an elegant invoice document to the Fan.
 */
async function generateAndSendInvoice(orderId: string, orderData: any) {
    try {
        console.log(`[Invoice Generator] Generating invoice for orderId ${orderId}...`);
        
        // 1. Legge dati dell'admin per intestazione societaria
        let bizName = 'CIAOSTAR S.R.L. a socio unico';
        let office = "Via dell'Innovazione 42, 20126 Milano (MI), Italia";
        let pIva = 'IT12345678901';
        let capital = '€100.000,00 i.v.';
        let rea = 'MI-9876543';
        let emailContact = 'info@ciaostar.it';

        let ficApiKey = '';
        let ficCompanyId = '';

        const configSnap = await db.collection('settings').doc('global_config').get();
        if (configSnap.exists) {
            const data = configSnap.data();
            bizName = data?.legalBusinessName || bizName;
            office = data?.legalRegisteredOffice || office;
            pIva = data?.legalVatNumber || pIva;
            capital = data?.legalCapitalValue || capital;
            rea = data?.legalReaNumber || rea;
            emailContact = data?.legalContactEmail || emailContact;
            ficApiKey = data?.fattureInCloudApiKey || '';
            ficCompanyId = data?.fattureInCloudCompanyId || '';
        }

        // 2. Legge e-mail del fan
        const fanId = orderData.fanId;
        let fanEmail = '';
        let fanName = orderData.fanName || 'Cliente CiaoStar';
        if (fanId) {
            const fanSnap = await db.collection('users').doc(fanId).get();
            if (fanSnap.exists) {
                const fanData = fanSnap.data();
                fanEmail = fanData?.email || '';
                fanName = fanData?.name || fanName;
            }
        }

        if (!fanEmail) {
            console.warn(`[Invoice Generator] No email found for fan ${fanId}, cannot send invoice email.`);
            return;
        }

        // 3. Calcola importi
        const totalPaid = orderData.pricePaid || 0;
        const platformFeePercent = 20; // 20%
        const marketplaceFee = Number((totalPaid * (platformFeePercent / 100)).toFixed(2));
        const talentShare = Number((totalPaid - marketplaceFee).toFixed(2));

        // Genera identificativo ricevuta univoco
        const year = new Date().getFullYear();
        const randomNum = Math.floor(10000 + Math.random() * 90000);
        const invoiceNumber = `CS-INV-${year}-${randomNum}`;

        // 4. Salva sul DB Firestore la fattura/ricevuta
        const invoiceData = {
            invoiceNumber,
            orderId,
            fanId,
            fanName,
            fanEmail,
            totalPaid,
            marketplaceFee,
            talentShare,
            platformFeePercent,
            createdAt: new Date().toISOString(),
            status: 'ISSUED',
            issuer: {
                bizName,
                office,
                pIva,
                capital,
                rea,
                emailContact
            }
        };

        await db.collection('invoices').doc(invoiceNumber).set(invoiceData);
        console.log(`[Invoice Generator] Saving invoice receipt ${invoiceNumber} to Firestore.`);

        // 5. Invia email con fattura/ricevuta HTML super elegante
        const subject = `Ricevuta d'Acquisto #${invoiceNumber} - Ordine su CiaoStar`;
        const textContent = `Grazie per il tuo acquisto! Ricevuta numero: ${invoiceNumber}. Importo totale: €${totalPaid.toFixed(2)}. Quota stella: €${talentShare.toFixed(2)}. Fee intermediazione marketplace: €${marketplaceFee.toFixed(2)}. Emessa da: ${bizName}.`;
        
        const htmlContent = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #f1f5f9; border-radius: 24px; background-color: #ffffff; color: #1e293b;">
            <div style="text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
              <h1 style="color: #7c3aed; margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.025em;">CIAOSTAR</h1>
              <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.1em; display: block; margin-top: 4px;">Ricevuta d'Acquisto</span>
              <p style="margin: 10px 0 0 0; color: #64748b; font-size: 11px; font-weight: 600;">RICEVUTA N. <strong>${invoiceNumber}</strong> &bull; Data: ${new Date().toLocaleDateString('it-IT')}</p>
            </div>

            <div style="margin-bottom: 24px; line-height: 1.5; font-size: 12px; color: #475569;">
              <div style="width: 48%; float: left; margin-bottom: 20px;">
                <p style="margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase; color: #020617; font-size: 10px; letter-spacing: 0.05em;">Fornitore della Piattaforma</p>
                <p style="margin: 0; font-weight: 800; color: #0f172a;">${bizName}</p>
                <p style="margin: 2px 0 0 0;">Sede Legale: ${office}</p>
                <p style="margin: 2px 0 0 0;">P. IVA: ${pIva}</p>
                <p style="margin: 2px 0 0 0;">Cap. Soc.: ${capital}</p>
                <p style="margin: 2px 0 0 0;">R.E.A.: ${rea}</p>
              </div>
              <div style="width: 48%; float: right; margin-bottom: 20px; text-align: right;">
                <p style="margin: 0 0 4px 0; font-weight: bold; text-transform: uppercase; color: #020617; font-size: 10px; letter-spacing: 0.05em;">Intestatario dell'Ordine</p>
                <p style="margin: 0; font-weight: 800; color: #0f172a;">${fanName}</p>
                <p style="margin: 2px 0 0 0;">Email: ${fanEmail}</p>
                <p style="margin: 2px 0 0 0;">ID Ordine: #${orderId.substring(0, 8).toUpperCase()}</p>
              </div>
              <div style="clear: both;"></div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0; background-color: #fafafa; text-align: left;">
                  <th style="padding: 10px; font-weight: bold; color: #0f172a;">Descrizione Servizio</th>
                  <th style="padding: 10px; text-align: right; font-weight: bold; color: #0f172a;">Prezzo Lordo</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 12px 10px;">
                    <strong>Commissione video-colloquio personalizzato on-demand</strong><br/>
                    <span style="font-size: 11px; color: #64748b;">Realizzato dalla Star: <strong>${orderData.talentName || 'VIP CiaoStar'}</strong></span>
                  </td>
                  <td style="padding: 12px 10px; text-align: right; font-weight: bold;">€${totalPaid.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div style="background-color: #f5f3ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 15px; margin-bottom: 24px; font-size: 11px; color: #6b21a8; line-height: 1.5;">
              <p style="margin: 0 0 5px 0; font-weight: bold; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">Dettaglio Split Transazione / Connect Fee</p>
              <table style="width: 100%; font-size: 11px; border: none;">
                <tr>
                  <td>Quota di spettanza destinata all'Artista (80%):</td>
                  <td style="text-align: right; font-weight: bold;">€${talentShare.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Platform Fee / Costi di intermediazione CiaoStar (20%):</td>
                  <td style="text-align: right; font-weight: bold;">€${marketplaceFee.toFixed(2)}</td>
                </tr>
              </table>
            </div>

            <div style="border-top: 2px solid #f1f5f9; padding-top: 15px; margin-top: 15px; text-align: right;">
              <span style="font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase;">Totale Addebitato (3D Secure)</span>
              <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 900; color: #020617;">€${totalPaid.toFixed(2)}</p>
            </div>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px; font-size: 10px; color: #94a3b8; line-height: 1.6; text-align: center;">
              <p style="margin: 0; font-weight: bold;">INFORMAZIONI DI ESCLUSIONE FISCALE</p>
              <p style="margin: 3px 0 0 0;">Operazione fuori campo IVA ai sensi dell'intermediazione tecnica. Il compenso netto viene girato in automatico tramite Stripe Connect all'Artista.</p>
              <p style="margin: 3px 0 0 0;">Per qualsiasi chiarimento d'acquisto, contatta l'assistenza all'indirizzo <a href="mailto:${emailContact}" style="color: #7c3aed; text-decoration: none;">${emailContact}</a></p>
            </div>
          </div>
        `;

        await sendTransactionalEmail(fanEmail, subject, textContent, htmlContent);
        console.log(`[Invoice Generator] Invoice ${invoiceNumber} successfully emailed to ${fanEmail}.`);

        // FattureInCloud API Integration (for Platform Fee commission invoices)
        if (ficApiKey && ficCompanyId) {
            try {
                const https = require('https');
                const ficData = JSON.stringify({
                    data: {
                        type: "invoice",
                        entity: {
                            name: fanName,
                            vat_number: "",
                            email: fanEmail
                        },
                        date: new Date().toISOString().split('T')[0],
                        payment_method: { name: "Stripe" },
                        items_list: [
                            {
                                name: "Commissione intermediazione video-colloquio CiaoStar",
                                net_price: marketplaceFee,
                                vat: { id: 0, value: 22, description: "IVA 22%" }
                            }
                        ]
                    }
                });
                
                const options = {
                    hostname: 'api-v2.fattureincloud.it',
                    port: 443,
                    path: `/c/${ficCompanyId}/issued_documents`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${ficApiKey}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(ficData)
                    }
                };
                
                const ficReq = https.request(options, (ficRes: any) => {
                    let ficBody = '';
                    ficRes.on('data', (chunk: any) => ficBody += chunk);
                    ficRes.on('end', () => {
                        console.log(`[FattureInCloud API] Response: status=${ficRes.statusCode}, body=${ficBody}`);
                    });
                });
                ficReq.on('error', (e: any) => console.error(`[FattureInCloud API Error]:`, e));
                ficReq.write(ficData);
                ficReq.end();
            } catch (ficErr: any) {
                console.error("[FattureInCloud Error] Failed to export invoice:", ficErr.message || ficErr);
            }
        }
    } catch (invoiceErr) {
        console.error(`[Invoice Generator] Error generating or sending invoice for order ${orderId}:`, invoiceErr);
    }
}

/**
 * 9. sendRemindersCron
 * Scheduled cloud function that checks for orders in PAID_AWAITING_VIDEO that have passed the 5th day since creation, and sends them an automated email alert.
 */
export const sendRemindersCron = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const now = new Date();
    console.log(`[Cron: Order Reminders] Started at ${now.toISOString()}`);
    try {
        const snapshot = await db.collection('orders')
            .where('status', '==', 'PAID_AWAITING_VIDEO')
            .get();
            
        if (snapshot.empty) {
            console.log(`[Cron: Order Reminders] No orders in 'PAID_AWAITING_VIDEO'.`);
            return null;
        }

        let sentReminders = 0;
        for (const docSnap of snapshot.docs) {
            const orderData = docSnap.data();
            const orderId = docSnap.id;

            // Se il sollecito è già stato inviato, saltiamo
            if (orderData.reminderSent) {
                continue;
            }

            const createdAt = new Date(orderData.createdAt || orderData.updatedAt);
            const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

            // Se creato più di 5 giorni fa
            if (createdAt < fiveDaysAgo) {
                console.log(`[Cron: Order Reminders] Order ${orderId} is over 5 days old. Sending reminder to Talent.`);

                const talentId = orderData.talentId;
                if (talentId) {
                    const talentSnap = await db.collection('users').doc(talentId).get();
                    if (talentSnap.exists) {
                        const talentData = talentSnap.data();
                        const talentEmail = talentData?.email;

                        if (talentEmail) {
                            const talentName = talentData?.name || 'Star';
                            const fanName = orderData.fanName || 'un fan';
                            const subject = `Sollecito: Ti rimangono 2 giorni per registrare il video per ${fanName}!`;
                            const textContent = `Ciao ${talentName}, ti ricordiamo che hai tempo fino a 7 giorni per caricare il videomessaggio richiesto da ${fanName}. Mancano solo 2 giorni! Scaduto questo termine, l'ordine verrà rimborsato automaticamente.`;
                            const htmlContent = `
                              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #fbd23e; border-radius: 16px; background-color: #ffffff; color: #334155;">
                                <h1 style="color: #ea580c; font-size: 24px; font-weight: 850; margin-top: 0;">⏳ CiaoStar - Sollecito Video</h1>
                                <p>Ciao <strong>${talentName}</strong>,</p>
                                <p>Ti ricordiamo che l'ordine richiesto da <strong>${fanName}</strong> scadrà tra sole <strong>48 ore (2 giorni)</strong>.</p>
                                <p style="margin-top: 10px;">Se non carichi il video in tempo, la transazione verrà stornata e il fan riceverà un rimborso automatico dell'intero importo.</p>
                                <div style="background-color: #fffbeb; border-left: 4px solid #ea580c; padding: 15px; margin: 20px 0; border-radius: 8px;">
                                  <p style="margin: 0;"><strong>Istruzioni del fan:</strong> "${orderData.instructions || 'Nessuna istruzione particolare.'}"</p>
                                </div>
                                <p>Accedi subito alla tua bacheca per completare la registrazione e incassare il compenso!</p>
                                <div style="text-align: center; margin: 25px 0;">
                                  <a href="https://ciaostar.it/dashboard" style="background-color: #ea580c; color: #ffffff; padding: 12px 24px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(234, 88, 12, 0.3);">Registra Ora</a>
                                </div>
                                <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;">
                                <p style="font-size: 11px; color: #94a3b8; text-align: center;">Team CiaoStar</p>
                              </div>
                            `;

                            await sendTransactionalEmail(talentEmail, subject, textContent, htmlContent);
                            
                            // Segna come inviato
                            await db.collection('orders').doc(orderId).update({
                                reminderSent: true
                            });

                            sentReminders++;
                        }
                    }
                }
            }
        }
        console.log(`[Cron: Order Reminders] Completed. Reminders sent: ${sentReminders}`);
    } catch (err) {
        console.error('[Cron: Order Reminders] Error:', err);
    }
    return null;
});

/**
 * Helper: Rate limiting for Cloud Functions
 * Store request times dynamically per user UID with a sliding window
 */
async function checkoutRateLimit(uid: string, limit: number, windowMs: number): Promise<boolean> {
    try {
        const now = Date.now();
        const limRef = db.collection('rate_limits').doc(uid);
        const limSnap = await limRef.get();
        let list: number[] = [];
        if (limSnap.exists) {
            list = limSnap.data()?.times || [];
        }
        list = list.filter(t => now - t < windowMs);
        if (list.length >= limit) {
            return false;
        }
        list.push(now);
        await limRef.set({ times: list });
        return true;
    } catch (e) {
        console.error("Rate limiting error (fail-open):", e);
        return true;
    }
}

/**
 * 10. partialRefundOrder
 * Callable Admin Cloud Function to process partial refunds on an order
 */
export const partialRefundOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    
    const userId = context.auth.uid;
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists || userSnap.data()?.role !== 'ADMIN') {
        throw new functions.https.HttpsError('permission-denied', 'Only admins can perform partial refunds.');
    }
    
    const { orderId, amount } = data;
    if (!orderId || typeof amount !== 'number' || amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Parameters orderId and a positive decimal amount are required.');
    }
    
    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found.');
        }
        const orderData = orderSnap.data();
        const piId = orderData?.stripePaymentIntentId;
        if (!piId) {
            throw new functions.https.HttpsError('failed-precondition', 'This order has no Stripe PaymentIntent associated.');
        }
        
        const stripe = await getStripeAsync();
        const refund = await stripe.refunds.create({
            payment_intent: piId,
            amount: Math.round(amount * 100), // convert to cents
        });
        
        const history = orderData.history || [];
        history.push({
            action: "Rimborso Parziale Eseguito",
            timestamp: new Date().toISOString(),
            note: `Rimborso parziale di €${amount.toFixed(2)} stornato tramite Stripe API (Refund ID: ${refund.id}).`
        });
        
        const refundsList = orderData.refundsList || [];
        refundsList.push({
            refundId: refund.id,
            amount: amount,
            timestamp: new Date().toISOString()
        });
        
        const totalRefunded = (orderData.totalRefunded || 0) + amount;
        const currentStatus = totalRefunded >= (orderData.pricePaid || 0) ? 'REFUNDED' : orderData.status;

        await orderRef.update({
            status: currentStatus,
            totalRefunded: totalRefunded,
            refundsList: refundsList,
            history: history,
            updatedAt: new Date().toISOString()
        });
        
        return { success: true, refundId: refund.id, totalRefunded };
    } catch (error: any) {
        console.error('Error in partialRefundOrder:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Stripe Refund API error');
    }
});

/**
 * 11. deleteUserAccount
 * Callable Cloud Function (onCall) that securely deletes a user's account and anonymizes database records for GDPR compliance.
 */
export const deleteUserAccount = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const userId = context.auth.uid;

    try {
        const batch = db.batch();

        // A. Delete user document from 'users'
        const userRef = db.collection('users').doc(userId);
        batch.delete(userRef);

        // B. Anonymize user orders (fanId)
        const fanOrdersSnap = await db.collection('orders').where('fanId', '==', userId).get();
        fanOrdersSnap.forEach(docSnap => {
            batch.update(docSnap.ref, {
                fanName: '[Deleted User]',
                fanEmail: '[Deleted User]',
                recipientName: '[Deleted User]',
                billingName: '[Deleted User]',
                billingEmail: '[Deleted User]',
                updatedAt: new Date().toISOString()
            });
        });

        // C. Anonymize user orders (talentId)
        const talentOrdersSnap = await db.collection('orders').where('talentId', '==', userId).get();
        talentOrdersSnap.forEach(docSnap => {
            batch.update(docSnap.ref, {
                talentName: '[Deleted User]',
                updatedAt: new Date().toISOString()
            });
        });

        // D. Delete message history under /conversations/{userId}/messages
        const conversationRef = db.collection('conversations').doc(userId);
        const messagesSnap = await conversationRef.collection('messages').get();
        messagesSnap.forEach(docSnap => {
            batch.delete(docSnap.ref);
        });
        batch.delete(conversationRef);

        // Commit all firestore deletions and anonymizations
        await batch.commit();

        // E. Delete the user from Firebase Auth
        await admin.auth().deleteUser(userId);

        return { success: true };
    } catch (error: any) {
        console.error('Error in deleteUserAccount:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Error executing GDPR account deletion');
    }
});

/**
 * 12. generateVideoSignedUrl
 * Callable Cloud Function (onCall) that checks authentication and ownership permissions,
 * then generates a time-limited (2 hours) signed Storage URL for video playback.
 */
export const generateVideoSignedUrl = functions.https.onCall(async (data, context) => {
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

        // Verify if the active user is the fan who purchased, the talent who made it, or an admin
        let isAuthorized = false;
        if (orderData.fanId === userId || orderData.talentId === userId) {
            isAuthorized = true;
        } else {
            const userSnap = await db.collection('users').doc(userId).get();
            if (userSnap.exists && userSnap.data()?.role === 'ADMIN') {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            throw new functions.https.HttpsError('permission-denied', 'Unauthorized access to this video.');
        }

        const videoUrl = orderData.videoUrl;
        if (!videoUrl) {
            throw new functions.https.HttpsError('not-found', 'Video URL not found in order.');
        }

        let decodedPath = '';
        if (videoUrl.includes('firebasestorage.googleapis.com')) {
            // Parse path out of firebasestorage url
            decodedPath = decodeURIComponent(videoUrl.split('/o/')[1].split('?')[0]);
        } else if (videoUrl.startsWith('videos/')) {
            decodedPath = videoUrl;
        } else {
            // direct / other url fallback
            return { signedUrl: videoUrl };
        }

        const bucket = admin.storage().bucket();
        const file = bucket.file(decodedPath);

        // Generate Signed URL valid for 2 hours (2 * 60 * 60 * 1000)
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 2 * 60 * 60 * 1000
        });

        return { signedUrl };
    } catch (error: any) {
        console.error('Error in generateVideoSignedUrl:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Error generating signed URL');
    }
});

/**
 * 8. onMessageCreated
 * Cloud Function trigger on chat message creation to send real-time Push Notifications via FCM.
 */
export const onMessageCreated = functions.firestore
    .document('conversations/{conversationId}/messages/{messageId}')
    .onCreate(async (snapshot, context) => {
        const messageData = snapshot.data();
        if (!messageData) {
            console.log("No message data found.");
            return null;
        }

        const conversationId = context.params.conversationId;
        const { senderId, text, isAdmin } = messageData;

        console.log(`[onMessageCreated] New message in conversation: ${conversationId}, sender: ${senderId}, isAdmin: ${isAdmin}`);

        let recipientIds: string[] = [];

        if (isAdmin) {
            // Se l'invio è dell'admin, il destinatario è l'utente-proprietario della conversazione
            recipientIds.push(conversationId);
        } else {
            // Se l'invio è dell'utente, inviamo a tutti gli amministratori del sistema
            try {
                const adminsSnap = await db.collection('users').where('role', '==', 'ADMIN').get();
                adminsSnap.forEach((doc: any) => {
                    recipientIds.push(doc.id);
                });
            } catch (err) {
                console.error("Errore nel recuperare gli amministratori:", err);
            }
        }

        if (recipientIds.length === 0) {
            console.log("Nessun destinatario individuato.");
            return null;
        }

        // Raccogliamo tutti i token FCM unici dei destinatari
        const tokens: string[] = [];
        for (const recipientId of recipientIds) {
            try {
                const userSnap = await db.collection('users').doc(recipientId).get();
                if (userSnap.exists) {
                    const userData = userSnap.data();
                    const fcmTokens: string[] = userData?.fcmTokens || [];
                    fcmTokens.forEach((tk: string) => {
                        if (tk && typeof tk === 'string' && !tokens.includes(tk)) {
                            tokens.push(tk);
                        }
                    });
                }
            } catch (err) {
                console.error(`Errore nel caricamento dei token FCM per l'utente ${recipientId}:`, err);
            }
        }

        if (tokens.length === 0) {
            console.log("Nessun token FCM trovato per i destinatari.");
            return null;
        }

        // Invio notifica Multicast FCM tramite l'SDK admin
        const payload = {
            tokens: tokens,
            notification: {
                title: "Nuovo messaggio in CiaoStar",
                body: text || "Hai ricevuto un nuovo messaggio."
            },
            data: {
                conversationId: conversationId,
                click_action: "FLUTTER_NOTIFICATION_CLICK"
            }
        };

        try {
            const response = await admin.messaging().sendEachForMulticast(payload);
            console.log(`Notifiche Push inviate con successo a ${response.successCount}/${tokens.length} token.`);
            if (response.failureCount > 0) {
                console.warn(`${response.failureCount} notifiche hanno fallito l'invio.`);
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.error(`Token fallito a indice ${idx}:`, resp.error);
                    }
                });
            }
            return response;
        } catch (error) {
            console.error("Errore nell'invio della notifica multicast FCM:", error);
            return null;
        }
    });


