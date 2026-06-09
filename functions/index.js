const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin  = require('firebase-admin');
const stripe = require('stripe');

if (!admin.apps.length) admin.initializeApp();
setGlobalOptions({ region: 'us-central1' });

const db = admin.firestore();
const NITPARK_FEE = 0.15;
const STARS_PER_MONTH   = 40;   // stars awarded each premium billing cycle
const STARS_PER_SHEKEL  = 2.5;  // 10 stars = ₪4  →  1 star = ₪0.40  →  1 ₪ = 2.5 stars

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

  const { amountILS, parkingId, bookingType, description, starsToRedeem = 0 } = req.data;
  if (!amountILS || amountILS < 5) throw new HttpsError('invalid-argument', 'סכום לא תקין');

  // ── Stars redemption ─────────────────────────────────────────────
  let starDiscount = 0;
  let finalAmountILS = amountILS;
  if (starsToRedeem > 0) {
    const userDoc = await db.collection('users').doc(uid).get();
    const balance = userDoc.data()?.starBalance || 0;
    const starsUsed = Math.min(starsToRedeem, balance);
    if (starsUsed > 0) {
      starDiscount   = Math.floor(starsUsed / 10) * 4; // 10 stars = ₪4
      finalAmountILS = Math.max(1, amountILS - starDiscount);
      // Deduct stars atomically
      await db.collection('users').doc(uid).update({
        starBalance: admin.firestore.FieldValue.increment(-starsUsed),
      });
    }
  }

  const s              = getStripe();
  const amountAgorot   = Math.round(finalAmountILS * 100);
  const feeAgorot      = Math.round(amountAgorot * NITPARK_FEE);

  const parkingDoc          = await db.collection('parkings').doc(String(parkingId)).get();
  const hostStripeAccountId = parkingDoc.exists ? parkingDoc.data()?.hostStripeAccountId : null;

  const params = {
    amount:      amountAgorot,
    currency:    'ils',
    description: description || `הזמנת חניה #${parkingId} — NitPark`,
    metadata: {
      parkingId:    String(parkingId),
      userId:       uid,
      bookingType:  bookingType || 'hourly',
      starDiscount: String(starDiscount),
      starsUsed:    String(starsToRedeem),
      nitparkFee:   String(Math.round(finalAmountILS * NITPARK_FEE)),
      hostAmount:   String(Math.round(finalAmountILS * (1 - NITPARK_FEE))),
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
    amountILS:       finalAmountILS,
    starDiscount,
    nitparkFee:  Math.round(finalAmountILS * NITPARK_FEE),
    hostAmount:  Math.round(finalAmountILS * (1 - NITPARK_FEE)),
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
    const pi = event.data.object;

    // ── Booking payment ───────────────────────────────────────────
    const bookingSnap = await db.collection('bookings')
      .where('paymentIntentId', '==', pi.id).limit(1).get();
    if (!bookingSnap.empty) {
      await bookingSnap.docs[0].ref.update({
        status:       'confirmed',
        paidAt:       admin.firestore.FieldValue.serverTimestamp(),
        stripeAmount: pi.amount_received / 100,
      });
    }

    // ── Credit purchase ───────────────────────────────────────────
    if (pi.metadata?.type === 'credit_purchase') {
      const creditSnap = await db.collection('credit_purchases')
        .where('paymentIntentId', '==', pi.id).limit(1).get();
      if (!creditSnap.empty) {
        const purchase = creditSnap.docs[0].data();
        const starsToAdd = parseInt(purchase.stars) || 0;
        if (starsToAdd > 0 && purchase.userId) {
          await db.collection('users').doc(purchase.userId).update({
            starBalance: admin.firestore.FieldValue.increment(starsToAdd),
          });
        }
        await creditSnap.docs[0].ref.update({
          status:  'confirmed',
          paidAt:  admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  if (event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated') {
    const sub        = event.data.object;
    const customerId = sub.customer;
    const snap       = await db.collection('users')
      .where('stripeCustomerId', '==', customerId).limit(1).get();
    if (!snap.empty) {
      const isActive  = sub.status === 'active' || sub.status === 'trialing';
      const periodEnd = new Date(sub.current_period_end * 1000);
      await snap.docs[0].ref.update({
        isPremium:                isActive,
        premiumUntil:             admin.firestore.Timestamp.fromDate(periodEnd),
        premiumCancelAtPeriodEnd: sub.cancel_at_period_end || false,
        premiumPlan:              sub.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly',
      });
    }
  }

  // Award stars on every successful subscription renewal invoice
  if (event.type === 'invoice.payment_succeeded') {
    const invoice    = event.data.object;
    const customerId = invoice.customer;
    // Only award for subscription renewals (not the first invoice — handled at creation)
    if (invoice.billing_reason === 'subscription_cycle') {
      const snap = await db.collection('users')
        .where('stripeCustomerId', '==', customerId).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.update({
          starBalance: admin.firestore.FieldValue.increment(STARS_PER_MONTH),
          monthlyLateCancelCount: 0, // reset late-cancel counter each cycle
        });
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub        = event.data.object;
    const customerId = sub.customer;
    const snap       = await db.collection('users')
      .where('stripeCustomerId', '==', customerId).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        isPremium:                false,
        premiumCancelAtPeriodEnd: false,
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

// ── createPremiumSubscription ─────────────────────────────────────
// Accepts a Stripe PaymentMethod ID (obtained via SetupIntent on client),
// attaches it to the customer, and creates a recurring subscription.
// Uses inline price_data so no pre-configured Price IDs are needed.
exports.createPremiumSubscription = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');

  const { plan, paymentMethodId, email, name } = req.data || {};
  if (!['monthly', 'yearly'].includes(plan))
    throw new HttpsError('invalid-argument', 'תוכנית לא תקינה');
  if (!paymentMethodId)
    throw new HttpsError('invalid-argument', 'חסר מזהה אמצעי תשלום');

  const s          = getStripe();
  const customerId = await getOrCreateCustomer(s, req.auth.uid, email, name);

  // Attach the payment method and set it as default
  try {
    await s.paymentMethods.attach(paymentMethodId, { customer: customerId });
  } catch (e) {
    // Already attached — fine, continue
  }
  await s.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  // Check if user already has an active subscription — cancel it first
  const userDoc = await db.collection('users').doc(req.auth.uid).get();
  const existingSubId = userDoc.data()?.stripeSubscriptionId;
  if (existingSubId) {
    try {
      const existing = await s.subscriptions.retrieve(existingSubId);
      if (existing.status === 'active' || existing.status === 'trialing') {
        await s.subscriptions.cancel(existingSubId);
      }
    } catch (e) { /* already gone */ }
  }

  const unitAmount = plan === 'yearly' ? 24900 : 2900; // agorot
  const interval   = plan === 'yearly' ? 'year' : 'month';

  const subscription = await s.subscriptions.create({
    customer: customerId,
    items: [{
      price_data: {
        currency:     'ils',
        product_data: { name: 'NitPark Premium' },
        recurring:    { interval },
        unit_amount:  unitAmount,
      },
    }],
    default_payment_method: paymentMethodId,
    expand: ['latest_invoice.payment_intent'],
  });

  const periodEnd = new Date(subscription.current_period_end * 1000);
  const isActive  = subscription.status === 'active' || subscription.status === 'trialing';

  await db.collection('users').doc(req.auth.uid).set({
    isPremium:                isActive,
    premiumUntil:             admin.firestore.Timestamp.fromDate(periodEnd),
    premiumPlan:              plan,
    stripeSubscriptionId:     subscription.id,
    premiumCancelAtPeriodEnd: false,
    monthlyLateCancelCount:   0,
  }, { merge: true });

  // Award first month's stars immediately
  if (isActive) {
    await db.collection('users').doc(req.auth.uid).update({
      starBalance: admin.firestore.FieldValue.increment(STARS_PER_MONTH),
    });
  }

  return {
    success:        true,
    subscriptionId: subscription.id,
    status:         subscription.status,
    premiumUntil:   periodEnd.toISOString(),
  };
});

// ── purchaseCredits ───────────────────────────────────────────────
// Creates a Stripe PaymentIntent for a one-time star/credit purchase.
// On success the webhook (payment_intent.succeeded) credits the user's
// starBalance atomically — the client can also read the returned stars count.
exports.purchaseCredits = onCall({ secrets: [] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר כדי לקנות קרדיטים');

  const { packageId, amountILS, stars, email, name } = req.data || {};
  if (!amountILS || amountILS < 1)   throw new HttpsError('invalid-argument', 'סכום לא תקין');
  if (!stars     || stars < 1)       throw new HttpsError('invalid-argument', 'כמות כוכבים לא תקינה');

  const s          = getStripe();
  const customerId = await getOrCreateCustomer(s, req.auth.uid, email, name);
  const amountAgorot = Math.round(amountILS * 100);

  const pi = await s.paymentIntents.create({
    amount:   amountAgorot,
    currency: 'ils',
    customer: customerId,
    description: `NitPark Credits — ${stars} stars (pkg: ${packageId || 'custom'})`,
    metadata: {
      type:      'credit_purchase',
      userId:    req.auth.uid,
      packageId: String(packageId || ''),
      stars:     String(stars),
    },
  });

  // Record pending purchase (webhook will mark confirmed + credit user)
  await db.collection('credit_purchases').add({
    userId:          req.auth.uid,
    packageId:       packageId || 'custom',
    amountILS,
    stars,
    status:          'pending',
    paymentIntentId: pi.id,
    createdAt:       admin.firestore.FieldValue.serverTimestamp(),
  });

  return { clientSecret: pi.client_secret, stars, amountILS };
});

// ── saveFcmToken ──────────────────────────────────────────────────
exports.saveFcmToken = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');
  const { token } = req.data || {};
  if (!token) throw new HttpsError('invalid-argument', 'חסר טוקן');
  await db.collection('users').doc(req.auth.uid).set({ fcmToken: token }, { merge: true });
  return { success: true };
});

// ── notifyPremiumUsersAboutListing ───────────────────────────────
// Called from the client right after a new listing is published.
// Sends a push notification to all premium users who have FCM tokens.
exports.notifyPremiumUsersAboutListing = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');

  const { listingId, address, priceHour } = req.data || {};
  if (!listingId) throw new HttpsError('invalid-argument', 'חסר מזהה חניה');

  const now  = new Date();
  const snap = await db.collection('users')
    .where('isPremium', '==', true)
    .where('premiumUntil', '>', admin.firestore.Timestamp.fromDate(now))
    .get();

  const tokens = snap.docs.map(d => d.data().fcmToken).filter(Boolean);
  if (tokens.length === 0) return { sent: 0 };

  const price = priceHour ? `₪${priceHour}/שעה` : '';
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    try {
      await admin.messaging().sendEachForMulticast({
        tokens: batch,
        notification: {
          title: '⚡ חניה חדשה קרובה אליך!',
          body:  `${address || 'חניה חדשה'}${price ? ' · ' + price : ''} — זמינה 30 דקות לפני כולם`,
        },
        data: { listingId: String(listingId) },
        webpush: { notification: { icon: '/icons/icon-192.png' } },
      });
    } catch (e) { /* non-fatal */ }
  }
  return { sent: tokens.length };
});

// ── cancelPremiumSubscription ─────────────────────────────────────
// Cancels at period end — the user keeps premium until the paid period expires.
exports.cancelPremiumSubscription = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'יש להתחבר');

  const s       = getStripe();
  const userDoc = await db.collection('users').doc(req.auth.uid).get();
  const subId   = userDoc.data()?.stripeSubscriptionId;

  if (!subId) throw new HttpsError('not-found', 'לא נמצא מנוי פעיל');

  await s.subscriptions.update(subId, { cancel_at_period_end: true });
  await db.collection('users').doc(req.auth.uid)
    .set({ premiumCancelAtPeriodEnd: true }, { merge: true });

  return { success: true };
});
