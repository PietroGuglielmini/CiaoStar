import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

admin.initializeApp();
const db = admin.firestore();

// Lazy initialization of Stripe using environment variable
let stripeClient: Stripe | null = null;
const getStripe = (): Stripe => {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new Error('STRIPE_SECRET_KEY environment variable is required');
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
        const stripe = getStripe();
        
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

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Stripe.Event;

    try {
        const stripe = getStripe();
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
 * 3. completeOrderAndSplit
 * Cloud Function triggered on order document update in Firestore.
 * When status changes to COMPLETED, it creates a Stripe transfer to the Talent (Connected Account).
 * Transfers 80% (or the pricePaid minus applicationFee) to the Stripe Connect account.
 */
export const completeOrderAndSplit = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const orderId = context.params.orderId;
        const newValue = change.after.data();
        const oldValue = change.before.data();

        // Trigger only when order status changes to COMPLETED
        if (newValue.status === 'COMPLETED' && oldValue.status !== 'COMPLETED') {
            const talentId = newValue.talentId;
            const pricePaid = newValue.pricePaid || 0;
            const appFee = newValue.applicationFee || (pricePaid * 0.2); // Default to 20% platform fee if not defined

            try {
                // 1. Get the Talent's Connected Stripe Account ID from users collection
                const talentSnap = await db.collection('users').doc(talentId).get();
                if (!talentSnap.exists) {
                    console.error(`User (Talent) ${talentId} not found.`);
                    return;
                }

                const talentData = talentSnap.data();
                const stripeAccountId = talentData?.stripeAccountId;

                if (!stripeAccountId) {
                    console.error(`Talent ${talentId} has no stripeAccountId linked for Stripe Connect.`);
                    return;
                }

                // 2. Calculate final payout to the talent
                const payoutAmount = pricePaid - appFee;
                if (payoutAmount <= 0) {
                    console.error(`Invalid payout amount calculated for order ${orderId}: ${payoutAmount}`);
                    return;
                }

                const stripe = getStripe();

                // 3. Create Stripe Transfer (Separate Charge and Transfer mechanism)
                // Transferring the talent's share into their Connected account
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

                // 4. Register the successful payout transfer ID in the order history
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

            } catch (err: any) {
                console.error(`Error processing split payment for order ${orderId}:`, err);
                
                // Add error details to order history
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
        const stripe = getStripe();
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
