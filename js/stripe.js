// ===== STRIPE FRONTEND MODULE =====
// Real card payment via Stripe Elements

// ── Config ────────────────────────────────────────────────────────────────────
// REPLACE with your real Stripe Publishable Key from https://dashboard.stripe.com/apikeys
const STRIPE_PUBLIC_KEY = 'pk_test_51TdaabGW6O8qRyDGX8ab9Esal9wA0KovYewDe0GfFlECzuUYB7eVvg4w6tP2sgyYE93q3r2Vx3f4FbmWrRzbl3ZQ00v8Dxp04G';

// Firebase Cloud Function URL — set after deploying functions
// Format: https://europe-west1-prkint-749da.cloudfunctions.net/createPaymentIntent
const PAYMENT_FUNCTION_URL = 'https://europe-west1-prkint-749da.cloudfunctions.net/createPaymentIntent';

let stripeInstance  = null;
let stripeElements  = null;
let cardElement     = null;

// ── Init Stripe ───────────────────────────────────────────────────────────────
function initStripe() {
  if (!window.Stripe) { console.error('[stripe] Stripe.js not loaded'); return null; }
  if (!stripeInstance) stripeInstance = window.Stripe(STRIPE_PUBLIC_KEY);
  return stripeInstance;
}

// ── Mount Stripe Card Element into a container ────────────────────────────────
function mountStripeCard(containerId) {
  // Avoid double-mounting (e.g. user re-selects the "card" tab)
  if (cardElement) return;

  const s = initStripe();
  if (!s) return;

  const container = document.getElementById(containerId);
  // Stripe Elements needs a *visible* container with real dimensions to render
  // its iframe correctly — mounting into a display:none tab silently fails,
  // which is why the card fields didn't appear before.
  if (!container || container.offsetParent === null) {
    setTimeout(() => mountStripeCard(containerId), 100);
    return;
  }

  stripeElements = s.elements({
    locale: 'he',
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary:       '#e91e8c',
        colorBackground:    '#ffffff',
        colorText:          '#1e293b',
        colorDanger:        '#ef4444',
        fontFamily:         'Heebo, sans-serif',
        borderRadius:       '12px',
        fontSizeBase:       '16px',
      },
    },
  });

  cardElement = stripeElements.create('card', {
    hidePostalCode: true,
    style: {
      base: {
        fontSize: '16px',
        fontFamily: 'Heebo, sans-serif',
        color: '#1e293b',
        '::placeholder': { color: '#94a3b8' },
      },
    },
  });

  {
    cardElement.mount('#' + containerId);
    cardElement.on('change', e => {
      const errEl = document.getElementById('stripe-error');
      if (errEl) errEl.textContent = e.error ? e.error.message : '';
    });
  }
}

// ── Create Payment Intent on backend, then confirm with card ──────────────────
async function processStripePayment(amountILS, parkingId, bookingType) {
  const s = initStripe();
  if (!s || !cardElement) throw new Error('Stripe not initialized');

  const user = firebase.auth().currentUser;
  if (!user) throw new Error('auth/not-logged-in');

  // Get Firebase ID token to authenticate with Cloud Function
  const idToken = await user.getIdToken();

  // Step 1: Create PaymentIntent on backend
  const resp = await fetch(PAYMENT_FUNCTION_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + idToken,
    },
    body: JSON.stringify({
      amount:      Math.round(amountILS * 100), // ILS → agorot
      currency:    'ils',
      parkingId:   String(parkingId),
      bookingType,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'payment_intent_failed');
  }

  const { clientSecret } = await resp.json();

  // Step 2: Confirm payment with card details
  const result = await s.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: {
        name: userName || 'NitPark User',
        email: userEmail || undefined,
      },
    },
  });

  if (result.error) throw new Error(result.error.message);
  return result.paymentIntent;
}

// ── Unmount card element (call when closing payment sheet) ────────────────────
function unmountStripeCard() {
  if (cardElement) { try { cardElement.unmount(); } catch(e) {} cardElement = null; }
  stripeElements = null;
}
