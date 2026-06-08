const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin  = require('firebase-admin');
const stripe = require('stripe');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1' });

const db = admin.firestore();
const NITPARK_FEE = 0.15;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('REPLACE')) throw new HttpsError('failed-precondition', 'Stripe not configured');
  return stripe(key, { apiVersion: '2024-04-10' });
}

// ── createPaymentIntent ──────────────────────────────────────────
exports.createPaymentIntent = onCall({ secrets: [] }, async (req) => {
  // Allow anonymous Firebase auth (signInAnonymously) as well as real users
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'יש להתחבר כדי לבצע הזמנה');

  const { amountILS, parkingId, bookingType, description } = req.data;
  if (!amountILS || amountILS < 5) throw new HttpsError('invalid-argument', 'סכום לא תקין');

  const s              = getStripe();
  const amountAgorot   = Math.round(amountILS * 100);
  const feeAgorot      = Math.round(amountAgorot * NITPARK_FEE);

  const parkingDoc          = await db.collection('parkings').doc(String(parkingId)).get();
  const hostStripeAccountId = parkingDoc.exists ? parkingDoc.data()?.hostStripeAccountId : null;

  const params = {
    amount:      amountAgorot,
    currency:    'ils',
    description: description || `הזמנת חניה #${parkingId} — NitPark`,
    metadata: {
      parkingId:   String(parkingId),
      userId:      uid,
      bookingType: bookingType || 'hourly',
      nitparkFee:   String(Math.round(amountILS * NITPARK_FEE)),
      hostAmount:  String(Math.round(amountILS * (1 - NITPARK_FEE))),
    },
  };

  if (hostStripeAccountId) {
    params.application_fee_amount = feeAgorot;
    params.transfer_data = { destination: hostStripeAccountId };
  }

  const pi = await s.paymentIntents.create(params);

  await db.collection('bookings').add({
    parkingId:       String(parkingId),
    userId:          uid,
    amountTotal:     amountILS,
    amountParkitFee: Math.round(amountILS * NITPARK_FEE),
    amountToHost:    Math.round(amountILS * (1 - NITPARK_FEE)),
    bookingType:     bookingType || 'hourly',
    status:          'pending',
    paymentIntentId: pi.id,
    createdAt:       admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    clientSecret:    pi.client_secret,
    paymentIntentId: pi.id,
    amountILS,
    nitparkFee:  Math.round(amountILS * NITPARK_FEE),
    hostAmount: Math.round(amountILS * (1 - NITPARK_FEE)),
  };
});

// ── Helper: get-or-create a Stripe Customer for a Firebase user ───
// We never store card data ourselves — only a pointer (stripeCustomerId)
// to the Stripe Customer object. Stripe is the PCI-compliant vault.
async function getOrCreateCustomer(s, uid, email, name) {
  const userRef = db.collection('users').doc(uid);
  const userDoc = await userRef.get();
  const existingId = userDoc.exists ? userDoc.data()?.stripeCustomerId : null;

  if (existingId) {
    try {
      const existing = await s.customers.retrieve(existingId);
      if (!existing.deleted) return existingId;
    } catch (e) { /* fall through and create a fresh customer */ }
  }

  const customer = await s.customers.create({
    email,
    name,
    metadata: { firebaseUID: uid },
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// ── createSetupIntent ─────────────────────────────────────────────
// Issues a SetupIntent so the client can securely tokenize a card via
// Stripe Elements (card digits go straight to Stripe — never touch our
// servers or database, keeping NitPark out of PCI-DSS scope).
exports.createSetupIntent = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר כדי להוסיף אמצעי תשלום');

  const s = getStripe();
  const { email, name } = req.data || {};
  const customerId = await getOrCreateCustomer(s, req.auth.uid, email, name);

  const setupIntent = await s.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
  });

  return { clientSecret: setupIntent.client_secret };
});

// ── listSavedCards ────────────────────────────────────────────────
// Reads cards live from Stripe — we keep no copy of card numbers/CVCs,
// only the masked metadata Stripe is willing to return (brand/last4/exp).
exports.listSavedCards = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');

  const s        = getStripe();
  const userDoc  = await db.collection('users').doc(req.auth.uid).get();
  const customerId = userDoc.exists ? userDoc.data()?.stripeCustomerId : null;
  if (!customerId) return { cards: [] };

  const pms = await s.paymentMethods.list({ customer: customerId, type: 'card' });
  return {
    cards: pms.data.map(pm => ({
      id:       pm.id,
      brand:    pm.card.brand,
      last4:    pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear:  pm.card.exp_year,
    })),
  };
});

// ── deleteSavedCard ───────────────────────────────────────────────
exports.deleteSavedCard = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');

  const { paymentMethodId } = req.data || {};
  if (!paymentMethodId) throw new HttpsError('invalid-argument', 'חסר מזהה כרטיס');

  const s       = getStripe();
  const userDoc = await db.collection('users').doc(req.auth.uid).get();
  const customerId = userDoc.exists ? userDoc.data()?.stripeCustomerId : null;
  if (!customerId) throw new HttpsError('not-found', 'לא נמצא לקוח תשלומים');

  // Verify ownership before detaching — never trust a client-supplied ID blindly
  const pm = await s.paymentMethods.retrieve(paymentMethodId);
  if (pm.customer !== customerId) throw new HttpsError('permission-denied', 'הכרטיס אינו שייך לחשבון זה');

  await s.paymentMethods.detach(paymentMethodId);
  return { success: true };
});

// ── stripeWebhook ────────────────────────────────────────────────
exports.stripeWebhook = onRequest(async (req, res) => {
  const sig           = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const s             = getStripe();

  let event;
  try {
    event = s.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi   = event.data.object;
    const snap = await db.collection('bookings')
      .where('paymentIntentId', '==', pi.id).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        status:       'confirmed',
        paidAt:       admin.firestore.FieldValue.serverTimestamp(),
        stripeAmount: pi.amount_received / 100,
      });
    }
  }

  res.json({ received: true });
});

// ── createConnectAccount ─────────────────────────────────────────
exports.createConnectAccount = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');

  const s                    = getStripe();
  const { email, parkingId } = req.data;

  const userDoc = await db.collection('users').doc(req.auth.uid).get();
  if (userDoc.exists && userDoc.data()?.stripeAccountId) {
    const id   = userDoc.data().stripeAccountId;
    const link = await s.accountLinks.create({
      account: id,
      refresh_url: 'https://prkint-749da.web.app/host',
      return_url:  'https://prkint-749da.web.app/host?connected=1',
      type: 'account_onboarding',
    });
    return { url: link.url, accountId: id };
  }

  const account = await s.accounts.create({
    type: 'express', country: 'IL', email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_type: 'individual',
    settings: { payouts: { schedule: { interval: 'weekly', weekly_anchor: 'monday' } } },
  });

  await db.collection('users').doc(req.auth.uid)
    .set({ stripeAccountId: account.id, stripeConnectedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  if (parkingId) {
    await db.collection('parkings').doc(String(parkingId))
      .set({ hostStripeAccountId: account.id }, { merge: true });
  }

  const link = await s.accountLinks.create({
    account: account.id,
    refresh_url: 'https://prkint-749da.web.app/host',
    return_url:  'https://prkint-749da.web.app/host?connected=1',
    type: 'account_onboarding',
  });

  return { url: link.url, accountId: account.id };
});
