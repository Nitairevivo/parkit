// ===== STRIPE =====
// להחליף במפתח האמיתי שלך מ: https://dashboard.stripe.com/test/apikeys
const STRIPE_PK = 'pk_test_51TdaabGW6O8qRyDGX8ab9Esal9wA0KovYewDe0GfFlECzuUYB7eVvg4w6tP2sgyYE93q3r2Vx3f4FbmWrRzbl3ZQ00v8Dxp04G';
let stripeClient = null;
let stripeCardElement = null;
let stripeCardExpiry = null;
let stripeCardCvc = null;

function initStripe() {
  if (stripeClient || STRIPE_PK.includes('REPLACE')) return;
  stripeClient = Stripe(STRIPE_PK);
}

function mountStripeCardElement() {
  if (!stripeClient) return;
  const elements = stripeClient.elements({ locale: 'he' });
  const style = {
    base: {
      fontFamily: 'Heebo, sans-serif',
      fontSize: '16px',
      color: '#1f2937',
      '::placeholder': { color: '#9ca3af' },
      direction: 'ltr'
    }
  };
  // Split into three separate fields (number / expiry / CVC) so all of them
  // are always fully visible — a single combined "card" field was getting
  // cut off on narrow screens, leaving the expiry and CVC inputs hidden.
  stripeCardElement = elements.create('cardNumber', { style, placeholder: '1234 1234 1234 1234' });
  stripeCardExpiry = elements.create('cardExpiry', { style });
  stripeCardCvc = elements.create('cardCvc', { style, placeholder: 'CVC' });
  stripeCardElement.mount('#stripe-card-number');
  stripeCardExpiry.mount('#stripe-card-expiry');
  stripeCardCvc.mount('#stripe-card-cvc');
}

// ===== AUTH & ONBOARDING =====
let userName = '';
let userPhone = '';
let userEmail = '';
let isLoggedIn = false;
let userIsPremium = false;
let userPremiumUntil = null;
let userPremiumCancelAtEnd = false;
let userStarBalance = 0;
let userFcmToken = null;

// ── Stars / Credits constants ────────────────────────────────────
const STARS_RATE = 0.40;            // 1 star = ₪0.40 when paying
const STARS_PER_ILS_BUY = 2.5;     // baseline: 1 ₪ = 2.5 stars (no bonus)
function ilsToStars(ils) { return Math.ceil(ils / STARS_RATE); }
function starsToIls(stars) { return Math.floor(stars * STARS_RATE * 100) / 100; }

// Hardcoded fallback packages (overridden by Firestore credit_packages collection)
const DEFAULT_CREDIT_PACKAGES = [
  { id: 'starter', name: 'Starter',     price: 10,  stars: 30,  bonus: 20, badge: null,          color: '#6366f1', emoji: '⭐' },
  { id: 'popular', name: 'Popular',     price: 25,  stars: 80,  bonus: 28, badge: '🔥 מומלץ',    color: '#e91e8c', emoji: '⭐⭐' },
  { id: 'pro',     name: 'Pro',         price: 50,  stars: 175, bonus: 40, badge: '🏆 הכי משתלם', color: '#f59e0b', emoji: '⭐⭐⭐' },
  { id: 'max',     name: 'Max',         price: 100, stars: 400, bonus: 60, badge: null,          color: '#10b981', emoji: '⭐⭐⭐⭐' },
];
let _creditPackages = null; // cached from Firestore

async function loadCreditPackages() {
  if (_creditPackages) return _creditPackages;
  try {
    const snap = await firebase.firestore().collection('credit_packages').orderBy('price').get();
    if (!snap.empty) {
      _creditPackages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      return _creditPackages;
    }
  } catch(e) {}
  _creditPackages = DEFAULT_CREDIT_PACKAGES;
  return _creditPackages;
}
let userFavorites = new Set(); // set of listing IDs the user has favorited

function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => { splash.style.display = 'none'; }, 420);
}

async function loadPremiumStatus() {
  const uid = firebase.auth().currentUser?.uid || localStorage.getItem('nitpark_user');
  if (!uid || uid.startsWith('local_')) { userIsPremium = false; return; }
  try {
    const db   = firebase.firestore();
    const doc  = await db.collection('users').doc(uid).get();
    const data = doc.data() || {};
    const until = data.premiumUntil ? data.premiumUntil.toDate() : null;
    userIsPremium          = data.isPremium === true && (until ? until > new Date() : false);
    userPremiumUntil       = until;
    userPremiumCancelAtEnd = data.premiumCancelAtPeriodEnd === true;
    userStarBalance        = data.starBalance || 0;
    // Load favorites
    const favSnap = await db.collection('users').doc(uid).collection('favorites').get();
    userFavorites = new Set(favSnap.docs.map(d => d.id));
    // Request push notification permission for premium users
    if (userIsPremium) requestPushPermission(uid);
    // Show premium filter row in search
    const pfRow = document.getElementById('premium-filter-row');
    if (pfRow) pfRow.style.display = userIsPremium ? 'flex' : 'none';
    // Update stars balance display
    if (typeof updateStarsBalanceDisplay === 'function') updateStarsBalanceDisplay();
  } catch (e) { userIsPremium = false; userStarBalance = 0; }
}

async function requestPushPermission(uid) {
  try {
    if (!('Notification' in window) || !firebase.messaging) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: window.FIREBASE_VAPID_KEY });
    if (token && token !== userFcmToken) {
      userFcmToken = token;
      await firebase.firestore().collection('users').doc(uid).set({ fcmToken: token }, { merge: true });
    }
  } catch (e) { /* messaging not configured or blocked */ }
}

function initApp() {
  const bar = document.getElementById('splash-bar');
  if (bar) {
    setTimeout(() => { bar.style.width = '100%'; }, 50);
    setTimeout(hideSplash, 1300);
  } else {
    hideSplash();
  }

  const loggedIn = localStorage.getItem('nitpark_user');
  if (loggedIn) {
    isLoggedIn = true;
    userName = localStorage.getItem('nitpark_name') || '';
    loadPremiumStatus();
    hideAuthScreens();
  } else {
    const tb = document.getElementById('topbar'); if (tb) tb.style.display = 'none';
    document.getElementById('bottomNav').style.display = 'none';
    startOnboarding();
  }
}

function hideAuthScreens() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('onboarding-screen').style.display = 'none';
  const tb = document.getElementById('topbar'); if (tb) tb.style.display = '';
  document.getElementById('bottomNav').style.display = '';
  restoreActiveSessions();
  updateNavbar();
  showChatbotFab();
  initFirestoreListings();
  startLocationTracking();
  initStripe();
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('atab-' + tab).classList.add('active');
  document.getElementById('auth-form-phone').style.display = tab === 'phone' ? '' : 'none';
  document.getElementById('auth-form-email').style.display = tab === 'email' ? '' : 'none';
  document.getElementById('auth-otp-step').style.display = 'none';
}

function formatAuthPhone(inp) {
  let v = inp.value.replace(/\D/g, '');
  if (v.startsWith('972')) v = '0' + v.slice(3);
  if (v.length > 3 && v.length <= 7) v = v.slice(0,3) + '-' + v.slice(3);
  else if (v.length > 7) v = v.slice(0,3) + '-' + v.slice(3,10);
  inp.value = v;
}

// Firebase auth state
let fbConfirmationResult = null;
let fbRecaptchaVerifier = null;

function initRecaptcha() {
  if (fbRecaptchaVerifier) return;
  fbRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    size: 'invisible',
    callback: () => {}
  });
}

async function submitAuth(method) {
  if (method === 'google') { loginWithGoogle(); return; }
  if (method === 'apple')  { loginWithApple();  return; }

  if (method === 'phone') {
    const raw = document.getElementById('auth-phone').value.replace(/\D/g,'');
    if (raw.length < 9) { shakeInput('auth-phone'); return; }

    // Convert to international format +972
    let intl = raw.startsWith('0') ? '+972' + raw.slice(1) : '+972' + raw;
    userPhone = document.getElementById('auth-phone').value;

    const btn = document.querySelector('#auth-form-phone .auth-submit-btn');
    btn.textContent = '📤 שולח קוד...';
    btn.disabled = true;

    try {
      initRecaptcha();
      fbConfirmationResult = await firebase.auth().signInWithPhoneNumber(intl, fbRecaptchaVerifier);
      showOtpStep(`שלחנו SMS עם קוד ל-${userPhone} 📱`);
    } catch (err) {
      btn.textContent = 'המשך עם SMS ←';
      btn.disabled = false;
      fbRecaptchaVerifier = null; // reset for retry
      if (err.code === 'auth/invalid-phone-number') {
        showToast('מספר טלפון לא תקין', 'error');
      } else if (err.code === 'auth/too-many-requests') {
        showToast('יותר מדי ניסיונות — נסה מאוחר יותר', 'error');
      } else {
        showToast('שגיאה בשליחת SMS: ' + err.message, 'error');
      }
    }

  } else if (method === 'email') {
    const email = document.getElementById('auth-email').value;
    if (!email || !email.includes('@')) { shakeInput('auth-email'); return; }
    userEmail = email;
    showOtpStep(`שלחנו קוד לאימייל ${email} 📧`);
  }
}

function showOtpStep(desc) {
  document.getElementById('auth-form-phone').style.display = 'none';
  document.getElementById('auth-form-email').style.display = 'none';
  document.querySelectorAll('.auth-tab').forEach(t => t.style.display = 'none');
  document.getElementById('otp-desc').textContent = desc;
  document.getElementById('auth-otp-step').style.display = 'block';
  document.querySelector('.otp-box').focus();
}

function shakeInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'shake .4s ease';
  setTimeout(() => el.style.animation = '', 400);
}

function otpNext(inp, idx) {
  const boxes = document.querySelectorAll('.otp-box');
  const v = inp.value.replace(/\D/g,'').slice(-1);
  inp.value = v;
  if (v && idx < 5) boxes[idx + 1].focus();
  if (idx === 5 && v) verifyOtp();
}

async function resendOtp() {
  document.querySelectorAll('.otp-box').forEach(b => b.value = '');
  document.querySelector('.otp-box').focus();
  if (userPhone) {
    fbRecaptchaVerifier = null;
    fbConfirmationResult = null;
    try {
      initRecaptcha();
      const raw = userPhone.replace(/\D/g,'');
      const intl = raw.startsWith('0') ? '+972' + raw.slice(1) : '+972' + raw;
      fbConfirmationResult = await firebase.auth().signInWithPhoneNumber(intl, fbRecaptchaVerifier);
      showToast('קוד חדש נשלח 📱', 'success');
    } catch(e) {
      showToast('שגיאה בשליחה חוזרת', 'error');
    }
  } else {
    showToast('קוד חדש נשלח 📧', 'success');
  }
}

async function verifyOtp() {
  const boxes = document.querySelectorAll('.otp-box');
  const code = Array.from(boxes).map(b => b.value).join('');
  if (code.length < 6) { showToast('הכנס 6 ספרות', 'error'); return; }

  const btn = document.querySelector('#auth-otp-step .auth-submit-btn');
  btn.textContent = '⏳ מאמת...';
  btn.disabled = true;

  try {
    if (!fbConfirmationResult) {
      showToast('שלח את הקוד מחדש', 'error');
      btn.textContent = 'אמת קוד ✓';
      btn.disabled = false;
      return;
    }
    const result = await fbConfirmationResult.confirm(code);
    const user = result.user;
    localStorage.setItem('nitpark_user', user.uid);
    localStorage.setItem('nitpark_phone', user.phoneNumber || userPhone);
    isLoggedIn = true;
    document.getElementById('auth-screen').style.display = 'none';
    loadPremiumStatus();
    startOnboarding();

  } catch (err) {
    btn.textContent = 'אמת קוד ✓';
    btn.disabled = false;
    if (err.code === 'auth/invalid-verification-code') {
      showToast('קוד שגוי — נסה שוב', 'error');
      boxes.forEach(b => { b.value = ''; b.style.borderColor = '#ef4444'; });
      boxes[0].focus();
      setTimeout(() => boxes.forEach(b => b.style.borderColor = ''), 1500);
    } else {
      showToast('שגיאה: ' + err.message, 'error');
    }
  }
}


// ===== ONBOARDING BOT =====
const BOT_FLOW = [
  {
    id: 'welcome',
    msg: ['שלום! ברוך הבא ל-NitPark 🚗', 'אני ParkBot — אעזור לך להתחיל תוך דקה.', 'מה שמך?'],
    type: 'input',
    placeholder: 'הכנס שם...',
    field: 'name',
    next: 'email'
  },
  {
    id: 'email',
    msg: ['נעים מאוד {name}! 📧', 'מה כתובת האימייל שלך? (כדי שנשמור לך את הפרטים ותוכל להתחבר בקלות בפעם הבאה)'],
    type: 'input',
    placeholder: 'name@example.com',
    field: 'email',
    next: 'role'
  },
  {
    id: 'role',
    msg: ['נעים מאוד {name}! 😊', 'האם יש לך חניה פנויה שאתה רוצה לפרסם?'],
    options: [
      { text: '🏠 כן, יש לי חניה!', next: 'host_type' },
      { text: '🔍 לא, מחפש חניה', next: 'search_area' }
    ]
  },
  // HOST FLOW
  {
    id: 'host_type',
    msg: ['מעולה! 🎉', 'איזה סוג חניה יש לך?'],
    options: [
      { text: '🏢 פרטית בבניין', next: 'host_city' },
      { text: '🔽 תת-קרקעית', next: 'host_city' },
      { text: '☀️ חיצונית / חצר', next: 'host_city' }
    ]
  },
  {
    id: 'host_city',
    msg: ['באיזה עיר נמצאת החניה?'],
    options: [
      { text: '📍 תל אביב', next: 'host_price' },
      { text: '📍 רמת גן', next: 'host_price' },
      { text: '📍 הרצליה', next: 'host_price' },
      { text: '📍 עיר אחרת', next: 'host_price' }
    ]
  },
  {
    id: 'host_price',
    msg: ['כמה אתה רוצה לקבל לשעה?'],
    options: [
      { text: '₪8–12 לשעה', next: 'host_done' },
      { text: '₪12–20 לשעה', next: 'host_done' },
      { text: '₪20+ לשעה', next: 'host_done' }
    ]
  },
  {
    id: 'host_done',
    msg: ['נהדר! {name}, כל מה שצריך נשמר. 🚀', 'עכשיו בוא נפרסם את החניה שלך — ייקח רק 3 דקות!'],
    options: [
      { text: '🚀 פרסם עכשיו!', action: 'host' },
      { text: '👀 קודם תראה לי את האפליקציה', action: 'home' }
    ]
  },
  // SEARCH FLOW
  {
    id: 'search_area',
    msg: ['מגניב! 🔍', 'באיזה אזור אתה בדרך כלל מחפש חניה?'],
    options: [
      { text: '📍 תל אביב', next: 'search_freq' },
      { text: '📍 רמת גן', next: 'search_freq' },
      { text: '📍 הרצליה', next: 'search_freq' },
      { text: '📍 אזור אחר', next: 'search_freq' }
    ]
  },
  {
    id: 'search_freq',
    msg: ['כמה פעמים בשבוע אתה צריך חניה?'],
    options: [
      { text: '📅 כל יום', next: 'search_pref' },
      { text: '📅 2–3 פעמים', next: 'search_pref' },
      { text: '🎲 לפעמים', next: 'search_pref' }
    ]
  },
  {
    id: 'search_pref',
    msg: ['מה הכי חשוב לך בחניה?'],
    options: [
      { text: '💰 מחיר זול', next: 'search_done' },
      { text: '📍 קרוב ליעד', next: 'search_done' },
      { text: '🛡️ מאובטח ומקורה', next: 'search_done' },
      { text: '⚡ עמדת טעינה EV', next: 'search_done' }
    ]
  },
  {
    id: 'search_done',
    msg: ['מצוין {name}! 🎉', 'מצאתי עשרות חניות שמתאימות לך באזורך. בוא נחפש!'],
    options: [
      { text: '🔍 חפש חניה עכשיו!', action: 'search' },
      { text: '🏠 קח אותי לדף הבית', action: 'home' }
    ]
  }
];

let obHistory = [];
let obUserName = '';

function startOnboarding() {
  // Skip onboarding for returning users
  if (localStorage.getItem('nitpark_onboarding_done')) {
    hideAuthScreens();
    updateNavbar();
    showChatbotFab();
    return;
  }
  const ob = document.getElementById('onboarding-screen');
  ob.style.display = 'flex';
  const tb2 = document.getElementById('topbar'); if (tb2) tb2.style.display = 'none';
  document.getElementById('bottomNav').style.display = 'none';
  document.getElementById('ob-chat').innerHTML = '';
  document.getElementById('ob-options').innerHTML = '';
  obHistory = [];
  setTimeout(() => runStep('welcome'), 400);
}

function runStep(stepId) {
  const step = BOT_FLOW.find(s => s.id === stepId);
  if (!step) return;

  const msgs = step.msg.map(m => m.replace('{name}', obUserName || 'חבר'));
  showBotMessages(msgs, () => {
    if (step.type === 'input') {
      showBotInput(step.placeholder, step.next, step.field);
    } else if (step.options) {
      showBotOptions(step.options);
    }
  });
}

function showBotMessages(msgs, cb) {
  const chat = document.getElementById('ob-chat');
  if (!chat) { if (cb) cb(); return; }
  let i = 0;
  function next() {
    if (i >= msgs.length) { if (cb) cb(); return; }
    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'ob-bubble bot typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    setTimeout(() => {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      const bubble = document.createElement('div');
      bubble.className = 'ob-bubble bot';
      bubble.textContent = msgs[i];
      chat.appendChild(bubble);
      chat.scrollTop = chat.scrollHeight;
      i++;
      setTimeout(next, 600);
    }, 900 + msgs[i].length * 18);
  }
  next();
}

function showBotOptions(options) {
  const el = document.getElementById('ob-options');
  el.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'ob-option-btn';
    btn.textContent = opt.text;
    btn.onclick = () => {
      // Show user's choice as bubble
      addUserBubble(opt.text);
      el.innerHTML = '';
      if (opt.action) {
        // Done — enter app
        setTimeout(() => finishOnboarding(opt.action), 600);
      } else if (opt.next) {
        setTimeout(() => runStep(opt.next), 500);
      }
    };
    el.appendChild(btn);
  });
}

function showBotInput(placeholder, next, field) {
  const el = document.getElementById('ob-options');
  const inputType = field === 'email' ? 'email' : 'text';
  el.innerHTML = `
    <div class="ob-input-row">
      <input type="${inputType}" class="ob-text-input" placeholder="${placeholder}" id="ob-input-field" />
      <button class="ob-send-btn" onclick="submitBotInput('${next}', '${field || ''}')">שלח →</button>
    </div>`;
  document.getElementById('ob-input-field').focus();
  document.getElementById('ob-input-field').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitBotInput(next, field);
  });
}

function submitBotInput(next, field) {
  const val = document.getElementById('ob-input-field')?.value?.trim();
  if (!val) return;

  if (field === 'email') {
    if (!val.includes('@')) { shakeInput('ob-input-field'); return; }
    userEmail = val;
    localStorage.setItem('nitpark_email', val);
  } else {
    obUserName = val;
    userName = val;
    localStorage.setItem('nitpark_name', val);
  }

  addUserBubble(val);
  document.getElementById('ob-options').innerHTML = '';
  setTimeout(() => runStep(next), 500);
}

function addUserBubble(text) {
  const chat = document.getElementById('ob-chat');
  if (!chat) return;
  const b = document.createElement('div');
  b.className = 'ob-bubble user';
  b.textContent = text;
  chat.appendChild(b);
  chat.scrollTop = chat.scrollHeight;
}

function finishOnboarding(destination) {
  localStorage.setItem('nitpark_onboarding_done', '1');

  // Save the user's details collected by the bot and "log them in" locally
  if (!localStorage.getItem('nitpark_user')) {
    const localId = 'local_' + Date.now();
    localStorage.setItem('nitpark_user', localId);
  }
  if (userEmail) localStorage.setItem('nitpark_email', userEmail);
  isLoggedIn = true;
  loadPremiumStatus();
  // Show stars promo banner 5s after login (once per session)
  setTimeout(showStarsBanner, 5000);

  const ob = document.getElementById('onboarding-screen');
  ob.style.opacity = '0';
  ob.style.transition = 'opacity .4s';
  setTimeout(() => {
    ob.style.display = 'none';
    ob.style.opacity = '';
    const tb3 = document.getElementById('topbar'); if (tb3) tb3.style.display = '';
    document.getElementById('bottomNav').style.display = '';
    showPage(destination);
    showChatbotFab();
    updateNavbar();
    initFirestoreListings();
    startLocationTracking();
    initStripe();
    restoreActiveSessions();
    showToast(`ברוך הבא ${obUserName || ''}! 🎉`, 'success');
  }, 400);
}

// ===== STATE =====
let currentPage = 'home';
let currentParking = null;
let filteredListings = [];
let minRating = 0;
let selectedType = 'פרטית בבניין';
let hostStep = 1;
let hostImageCount = 0;
let availabilityMode = 'now';

function setAvailabilityMode(mode, el) {
  availabilityMode = mode;
  document.querySelectorAll('#avail-now-btn, #avail-later-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const wrap = document.getElementById('avail-date-wrap');
  if (wrap) wrap.style.display = mode === 'later' ? 'block' : 'none';
}
let bookingType = 'hourly';
let userLatLng = null;
let userLocationMarker = null;

// Entry/exit time the user is searching for — carried over to pre-fill the booking form
let searchEntryTime = '';
let searchExitTime = '';

// Star rating currently selected in the "rate this listing" widget
let reviewStars = 0;
function setReviewStars(n) {
  reviewStars = n;
  document.querySelectorAll('#rate-stars .rate-star').forEach(el => {
    el.style.color = parseInt(el.dataset.val) <= n ? '#f59e0b' : 'var(--gray-300)';
  });
}
function onSearchTimesChanged() {
  searchEntryTime = document.getElementById('searchEntryTime')?.value || '';
  searchExitTime  = document.getElementById('searchExitTime')?.value || '';
}

// Custom per-hour pricing for the listing currently being published.
// hourTierPrices[i] = price for hour (i+1); hourExtraPrice = rate for every hour beyond that.
let hourTierPrices = [15];
let hourExtraPrice = 15;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  showPage('home');
  renderHomeListings();
  updateEarningsPreview();

  // Set default datetime to now + 1hr
  const dt = document.getElementById('searchDate');
  if (dt) {
    const d = new Date(Date.now() + 3600000);
    dt.value = d.toISOString().slice(0, 16);
  }

  // Topbar scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('topbar')?.classList.toggle('scrolled', window.scrollY > 20);
  });

  // Per-hour pricing tiers (publish form)
  renderHourTiers();
});

// ===== NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (!page) return;
  page.classList.add('active');
  currentPage = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Sync bottom nav
  document.querySelectorAll('.mbn-btn').forEach(b => b.classList.remove('active'));
  const mbnBtn = document.getElementById('mbn-' + name);
  if (mbnBtn) mbnBtn.classList.add('active');

  if (name === 'profile') { isLoggedIn ? openModal('profile') : openModal('login'); return; }
  if (name === 'search') {
    setSearchView('map');
    renderSearchResults(filteredListings);
    setTimeout(async () => {
      initLeafletMap();
      renderLeafletMarkers(filteredListings);
    }, 50);
  }
  if (name === 'host') renderHostSummary();
  if (name === 'bookings') loadUserBookings('active');
  if (name === 'stars') { if (typeof renderStarsPage === 'function') renderStarsPage(); }
}

function toggleMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.classList.toggle('open');
}

// ===== SIDEBAR =====
function toggleSidebar() {
  const s = document.getElementById('sidebar');
  if (!s) return;
  s.classList.contains('open') ? closeSidebar() : openSidebar();
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('open');
  updateSidebarCard();
  updateSidebarAuth();
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

function sidebarNav(page) {
  closeSidebar();
  showPage(page);
}

async function updateSidebarCard() {
  if (!isLoggedIn) return;
  if (cachedSavedCard === undefined) await loadAndRenderSavedCard();
  const card = cachedSavedCard;
  const sub = document.getElementById('sidebar-card-sub');
  const badge = document.getElementById('sidebar-card-badge');
  if (sub) sub.textContent = card ? card.brand + ' •••• ' + card.last4 : 'לא שמור';
  if (badge) badge.style.display = card ? 'inline-block' : 'none';
}

function updateSidebarAuth() {
  const auth = document.getElementById('sidebar-auth');
  if (!auth) return;
  const user = window.currentUser || null;
  if (user) {
    auth.innerHTML = `
      <div style="font-size:.85rem;color:var(--gray-600);padding:4px 0">מחובר: <strong>${user.displayName || user.email || 'משתמש'}</strong></div>
      <button class="btn-ghost" style="width:100%;margin-top:8px" onclick="signOutUser();closeSidebar()">התנתקות</button>
    `;
  } else {
    auth.innerHTML = `
      <button class="btn-ghost" style="width:100%" onclick="openModal('login');closeSidebar()">התחברות</button>
      <button class="btn-primary" style="width:100%;margin-top:8px" onclick="openModal('signup');closeSidebar()">הצטרפות חינם</button>
    `;
  }
}

function openCreditCardPanel() {
  openModal('profile');
}

function mbnNav(page) {
  if (page === 'profile') {
    isLoggedIn ? openModal('profile') : openModal('login');
    return;
  }
  document.querySelectorAll('.mbn-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('mbn-' + page);
  if (btn) btn.classList.add('active');
  showPage(page);
}

function toggleBookingCard() {
  const card = document.getElementById('booking-card');
  if (card) card.classList.toggle('expanded');
}

function safeId(id) { return String(id || '').replace(/[^a-zA-Z0-9_-]/g, ''); }

// ===== HOME LISTINGS =====
function renderHomeListings() {
  updateHostCta();
  const el = document.getElementById('home-listings');
  if (!el) return;
  const top = visibleParkings().slice(0, 6);
  if (!top.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--gray-400);grid-column:1/-1">
      <div style="font-size:3rem;margin-bottom:12px">🅿️</div>
      <div style="font-weight:700;font-size:1rem;color:var(--gray-500)">עדיין אין חניות באזורך</div>
      <div style="font-size:.85rem;margin-top:6px">היה הראשון לפרסם!</div>
      <button class="btn-primary" onclick="showPage('host')" style="margin-top:20px;padding:12px 28px">פרסם חניה ←</button>
    </div>`;
    return;
  }
  el.innerHTML = top.map(p => renderCard(p)).join('');
}

function renderCard(p) {
  return `
    <div class="listing-card" onclick="openDetail('${safeId(p.id)}')">
      <div class="listing-img">
        <div class="listing-img-bg">🅿️</div>
        <div class="listing-badge">${p.type || 'פרטית'}</div>
        ${p.status === 'pending' ? '<div class="ev-badge" style="background:#f59e0b">⏳ ממתין</div>' : ''}
      </div>
      <div class="listing-body">
        <div class="listing-title">${p.title || p.address}</div>
        <div class="listing-location">📍 ${p.address}</div>
        <div class="listing-tags">
          <span class="listing-tag">${p.city || ''}</span>
          ${p.status === 'pending' ? '<span class="listing-tag" style="color:#f59e0b;border-color:#fde68a">ממתין לאישור</span>' : ''}
        </div>
        <div class="listing-footer">
          <div class="listing-price">
            <span class="lp-ils">₪${p.price_hour}<span>/שעה</span></span>
            <span class="lp-sep">|</span>
            <span class="lp-stars">${typeof ilsToStars==='function' ? ilsToStars(p.price_hour) : Math.ceil(p.price_hour/0.4)} ⭐/שעה</span>
          </div>
          <button class="btn-view">צפה</button>
        </div>
      </div>
    </div>
  `;
}

// ===== SEARCH =====
function switchTab(tab) {
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('find-form').style.display = tab === 'find' ? '' : 'none';
  document.getElementById('host-form').style.display = tab === 'host' ? '' : 'none';
}

function doSearch() {
  const q = document.getElementById('searchLocation').value.trim().toLowerCase();
  const pool = visibleParkings();
  if (q) {
    filteredListings = pool.filter(p =>
      (p.title||'').toLowerCase().includes(q) ||
      (p.address||'').toLowerCase().includes(q) ||
      (p.city||'').toLowerCase().includes(q)
    );
  } else {
    filteredListings = [...pool];
  }
  // Copy query to inline search bar too
  const inline = document.getElementById('searchInline');
  if (inline) inline.value = document.getElementById('searchLocation')?.value || '';
  showPage('search');
}

function filterListings() {
  const min = parseFloat(document.getElementById('priceMin')?.value || 0);
  const max = parseFloat(document.getElementById('priceMax')?.value || 9999);
  const evOnly = document.getElementById('filter-ev')?.checked;
  const rentalType = document.querySelector('input[name="rental-type"]:checked')?.value || 'all';

  // Show/hide long-term sub-options
  const ltOptions = document.getElementById('longterm-options');
  if (ltOptions) ltOptions.style.display = rentalType === 'longterm' ? 'flex' : 'none';

  const ltPeriod = document.querySelector('input[name="lt-period"]:checked')?.value || 'month';

  // Premium exclusive filters
  const guardedOnly   = document.getElementById('filter-guarded')?.checked && userIsPremium;
  const coveredOnly   = document.getElementById('filter-covered')?.checked && userIsPremium;
  const camerasOnly   = document.getElementById('filter-cameras')?.checked && userIsPremium;
  const newOnly       = document.getElementById('filter-new')?.checked && userIsPremium;

  const now = new Date();
  filteredListings = visibleParkings().filter(p => {
    if (p.price_hour < min || p.price_hour > max) return false;
    if (minRating > 0 && (p.rating || 0) < minRating) return false;
    if (evOnly && !p.ev_charger) return false;
    if (rentalType === 'longterm' && !p.price_month) return false;
    if (activeCategory === 'ev' && !p.ev_charger) return false;
    if (activeCategory !== 'all' && activeCategory !== 'ev' && !(p.categories || []).includes(activeCategory)) return false;
    // Premium exclusive filters
    if (guardedOnly && !(p.tags || []).includes('שמירה')) return false;
    if (coveredOnly && !(p.tags || []).includes('מקורה')) return false;
    if (camerasOnly && !p.hasCameras) return false;
    if (newOnly && !(p.premiumAccessUntil && p.premiumAccessUntil > now)) return false;
    return true;
  });

  const countEl = document.getElementById('results-count');
  const ltLabels = { week: 'שבועי', twoweeks: 'דו-שבועי', month: 'חודשי', year: 'שנתי' };
  const label = rentalType === 'longterm'
    ? `חניות לטווח ארוך (${ltLabels[ltPeriod]}) נמצאו`
    : 'חניות נמצאו';
  if (countEl) countEl.textContent = `${filteredListings.length} ${label}`;

  renderSearchResults(filteredListings, rentalType, ltPeriod);
}

let activeCategory = 'all';
function setSearchView(view) {
  const layout = document.getElementById('search-map-layout');
  const mapArea = document.querySelector('.search-map-area');
  const sidebar = document.getElementById('search-sidebar');
  if (!layout) return;

  document.getElementById('vt-list')?.classList.toggle('active', view === 'list');
  document.getElementById('vt-map')?.classList.toggle('active', view === 'map');
  layout.classList.toggle('list-view', view === 'list');

  // On wide screens the map and list sit side-by-side and their sizing comes from CSS —
  // only override inline styles on narrow/stacked layouts (mobile/tablet).
  const stacked = window.innerWidth <= 900;
  if (mapArea) {
    mapArea.style.display = view === 'list' ? 'none' : '';
    mapArea.style.flex = stacked ? (view === 'map' ? '1 1 auto' : '') : '';
  }
  if (sidebar) {
    if (stacked) {
      sidebar.style.flex = '1';
      sidebar.style.width = '100%';
      sidebar.style.overflow = 'auto';
    } else {
      sidebar.style.flex = '';
      sidebar.style.width = '';
      sidebar.style.overflow = '';
    }
  }

  if (view === 'map') {
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 100);
  }
}

// Jump from a homepage shortcut card straight into search with a filter pre-applied
function goToSearchWithFilter(filter) {
  showPage('search');
  setTimeout(() => {
    if (filter === 'ev') {
      const pill = document.getElementById('ev-highlight-pill');
      if (pill) filterByCategory('ev', pill);
    } else {
      const btn = [...document.querySelectorAll('.cat-pill')].find(b => b.getAttribute('onclick')?.includes(`'${filter}'`));
      if (btn) filterByCategory(filter, btn);
    }
  }, 80);
}

function filterByCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  document.getElementById('ev-highlight-pill')?.classList.remove('active');
  btn.classList.add('active');
  filterListings();
}

function setMinRating(r, btn) {
  minRating = r;
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterListings();
}

function sortListings(by) {
  const arr = [...filteredListings];
  if (by === 'price_asc') arr.sort((a,b) => a.price_hour - b.price_hour);
  else if (by === 'price_desc') arr.sort((a,b) => b.price_hour - a.price_hour);
  else if (by === 'rating') arr.sort((a,b) => b.rating - a.rating);
  else if (by === 'distance') arr.sort(() => Math.random() - .5);
  filteredListings = arr;
  renderSearchResults(arr);
}

function renderSearchResults(list, rentalType = 'all', ltPeriod = 'month') {
  const el = document.getElementById('search-results');
  const countEl = document.getElementById('results-count');
  if (countEl && countEl.textContent === 'טוען...') countEl.textContent = `${list.length} חניות נמצאו`;
  if (!el) return;

  // Upsell strip for non-premium users when there are early-access listings
  const earlyCount = earlyAccessCount();
  const upsellStrip = (!userIsPremium && earlyCount > 0) ? `
    <div onclick="openPremiumModal()" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border:1.5px solid #f59e0b;border-radius:14px;padding:12px 16px;margin-bottom:12px;cursor:pointer;display:flex;align-items:center;gap:10px;text-align:right">
      <span style="font-size:1.4rem">⚡</span>
      <div style="flex:1">
        <div style="font-weight:800;font-size:.88rem;color:#92400e">${earlyCount} חניות חדשות זמינות לפרימיום בלבד</div>
        <div style="font-size:.78rem;color:#b45309;margin-top:2px">משתמשי פרימיום רואים חניות חדשות 30 דקות לפני כולם</div>
      </div>
      <span style="font-size:.8rem;font-weight:700;color:#92400e;white-space:nowrap">שדרג →</span>
    </div>` : '';

  if (list.length === 0) {
    el.innerHTML = upsellStrip + `<div class="search-empty-state">
      <div class="empty-icon">🅿️</div>
      <h3>אין חניות באזור זה עדיין</h3>
      <p>היה הראשון לפרסם חניה!</p>
      <button class="btn-primary" onclick="showPage('host')" style="padding:11px 24px;font-size:.9rem">פרסם חניה ←</button>
    </div>`;
    if (countEl) countEl.textContent = '0 חניות';
    return;
  }
  if (countEl) countEl.textContent = `${list.length} חניות`;

  const isLongTerm = rentalType === 'longterm';

  // Compute displayed price based on period
  function ltPrice(p) {
    const week = Math.round(p.price_day * 6.5);
    const twoweeks = Math.round(p.price_day * 12);
    switch(ltPeriod) {
      case 'week':      return { price: week, label: 'שבוע', sub: `חיסכון לעומת יומי: ₪${p.price_day * 7 - week}` };
      case 'twoweeks':  return { price: twoweeks, label: 'שבועיים', sub: `חיסכון לעומת יומי: ₪${p.price_day * 14 - twoweeks}` };
      case 'year':      return { price: p.price_year || p.price_month * 11, label: 'שנה', sub: `חיסכון: ₪${Math.round(p.price_month * 12 - (p.price_year || p.price_month * 11))}` };
      default:          return { price: p.price_month, label: 'חודש', sub: `שנתי: ₪${(p.price_year || p.price_month * 11).toLocaleString()}` };
    }
  }

  const now = new Date();
  el.innerHTML = upsellStrip + list.map(p => {
    const lt = ltPrice(p);
    const isNew = p.premiumAccessUntil && p.premiumAccessUntil > now;
    const isFav = userFavorites.has(String(p.id));
    const minsLeft = isNew ? Math.ceil((p.premiumAccessUntil - now) / 60000) : 0;
    return `
    <div class="search-card" id="card-${p.id}"
         onclick="openDetail('${safeId(p.id)}')"
         onmouseenter="hoverMarker('${safeId(p.id)}',true)"
         onmouseleave="hoverMarker('${safeId(p.id)}',false)">
      <div class="sc-img">
        <span class="sc-emoji">${p.emoji || '🅿️'}</span>
        <span class="sc-type">${p.type || 'פרטית'}</span>
        ${p.ev_charger ? '<span class="sc-ev">⚡ EV</span>' : ''}
        ${isNew && userIsPremium ? `<span class="sc-ev" style="background:#f59e0b;color:#fff">⚡ חדש! ${minsLeft} דק'</span>` : ''}
        ${isFav ? '<span class="sc-ev" style="background:#e91e8c;color:#fff">❤️</span>' : ''}
      </div>
      <div class="sc-body">
        <div class="sc-top">
          <div class="sc-title">${p.title || p.address}</div>
          <div class="sc-price">
            ${isLongTerm
              ? `₪${lt.price.toLocaleString()}<span>/${lt.label}</span>`
              : `₪${(p.price_hour_tiers && p.price_hour_tiers[0]) || p.price_hour}<span>/שעה</span>`}
            ${!isLongTerm ? `<span class="sc-price-stars">${typeof ilsToStars==='function' ? ilsToStars((p.price_hour_tiers && p.price_hour_tiers[0]) || p.price_hour) : Math.ceil(((p.price_hour_tiers && p.price_hour_tiers[0]) || p.price_hour)/0.4)} ⭐</span>` : ''}
          </div>
        </div>
        <div class="sc-loc">📍 ${p.address}</div>
        <div class="sc-rating">
          <span class="sc-stars">★★★★★</span>
          <span class="sc-rating-num">${p.rating || 'חדש'}</span>
          <span class="sc-reviews">${p.reviews_count ? '(' + p.reviews_count + ')' : ''}</span>
          ${p.ev_charger ? '<span class="sc-ev-chip">⚡</span>' : ''}
          ${p.wheelchairAccessible ? '<span class="sc-ev-chip" title="נגיש לנכים">♿</span>' : ''}
          ${p.hasCameras ? '<span class="sc-ev-chip" title="מצלמות אבטחה">📹</span>' : ''}
        </div>
        <div class="sc-footer">
          <span class="sc-sub">${isLongTerm ? `💰 ${lt.sub}` : `יום ₪${p.price_day} · חודש ₪${p.price_month}`}</span>
          <button class="sc-btn">הזמן →</button>
        </div>
      </div>
    </div>
  `}).join('');

  setTimeout(() => renderLeafletMarkers(list), 10);
}

function hoverMarker(id, on) {
  const markerEl = document.getElementById('lf-marker-' + id);
  if (markerEl) markerEl.classList.toggle('hovered', on);
}

// ===== LEAFLET MAP =====
let leafletMap = null;
let leafletMarkers = [];

// Geocode cache (address → [lat, lng]) — uses the free OpenStreetMap Nominatim service
const geocodeCache = {};

function initLeafletMap() {
  if (leafletMap) return;
  const el = document.getElementById('leaflet-map');
  if (!el || typeof L === 'undefined') return;

  leafletMap = L.map('leaflet-map', {
    center: [32.0853, 34.8000],
    zoom: 11,
    zoomControl: false,
  });

  // CartoDB Positron — light gray minimal style (like Pink Park)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(leafletMap);

  L.control.zoom({ position: 'topleft' }).addTo(leafletMap);
}

async function geocodeAddress(address) {
  if (geocodeCache[address]) return geocodeCache[address];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=${encodeURIComponent(address + ', ישראל')}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'he' } });
    const results = await res.json();
    if (results?.[0]) {
      const coords = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
      geocodeCache[address] = coords;
      return coords;
    }
  } catch (e) {}
  return null;
}

async function renderLeafletMarkers(list) {
  if (!leafletMap) initLeafletMap();
  if (!leafletMap) return;

  leafletMarkers.forEach(m => leafletMap.removeLayer(m));
  leafletMarkers = [];

  const bounds = [];

  for (const p of list) {
    let coords = p.coords || null;
    if (!coords && p.address) {
      coords = await geocodeAddress(p.address);
      if (coords) p.coords = coords;
    }
    if (!coords) continue;
    bounds.push(coords);

    const html = `
      <div class="lf-host-marker" onclick="openDetail('${safeId(p.id)}')" id="lf-marker-${p.id}">
        <div class="lf-price">₪${p.price_hour}</div>
        ${p.ev_charger ? '<div class="lf-ev">⚡</div>' : ''}
      </div>`;

    const icon = L.divIcon({ html, className: '', iconSize: [56, 40], iconAnchor: [28, 40] });
    const marker = L.marker(coords, { icon })
      .addTo(leafletMap)
      .bindPopup(`
        <div class="lf-popup" onclick="openDetail('${safeId(p.id)}')" style="cursor:pointer;min-width:180px">
          <div style="font-weight:800;font-size:.95rem;margin-bottom:4px">${p.title || p.address}</div>
          <div style="font-size:.8rem;color:#64748b;margin-bottom:8px">📍 ${p.address}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#e91e8c;font-weight:800;font-size:1.1rem">₪${p.price_hour}<small style="font-weight:400">/שעה</small></span>
          </div>
          ${p.ev_charger ? '<div style="margin-top:8px;background:#dcfce7;color:#15803d;border-radius:8px;padding:4px 10px;font-size:.78rem;font-weight:700;text-align:center">⚡ עמדת טעינה</div>' : ''}
          <div style="margin-top:10px;background:linear-gradient(135deg,#e91e8c,#764ba2);color:white;border-radius:10px;padding:8px;text-align:center;font-weight:700;font-size:.88rem">פרטים והזמנה →</div>
        </div>
      `, { direction: 'top', className: 'lf-popup-wrap' });

    marker.on('click', () => highlightCard(p.id));
    leafletMarkers.push(marker);
  }

  if (bounds.length) leafletMap.fitBounds(bounds, { padding: [60, 60] });
  else if (userLatLng) leafletMap.setView(userLatLng, 13);
}

function highlightCard(id) {
  document.querySelectorAll('.search-card').forEach(c => c.classList.remove('highlighted'));
  const card = document.getElementById('card-' + id);
  if (card) {
    card.classList.add('highlighted');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function doSearchInline() {
  const q = document.getElementById('searchInline').value.trim().toLowerCase();
  const pool = visibleParkings();
  if (q) {
    filteredListings = pool.filter(p =>
      (p.title||'').toLowerCase().includes(q) ||
      (p.address||'').toLowerCase().includes(q) ||
      (p.city||'').toLowerCase().includes(q)
    );
  } else {
    filteredListings = [...pool];
  }
  renderSearchResults(filteredListings);
  renderLeafletMarkers(filteredListings);
}

// ===== DETAIL PAGE =====
function openDetail(id) {
  currentParking = PARKINGS.find(p => String(p.id) === String(id));
  if (!currentParking) return;
  // Hosts can't view/book their own listing as a renter — send them to their own dashboard instead
  if (currentParking.ownerId && currentParking.ownerId === myUid()) {
    showToast('זו החניה שלך — לא ניתן להזמין את החניה של עצמך 🙂', '');
    openMyListingDetail(currentParking.id);
    return;
  }
  const p = currentParking;
  const address = encodeURIComponent(p.address || '');
  const wazeUrl = p.coords
    ? `https://waze.com/ul?ll=${p.coords[0]},${p.coords[1]}&navigate=yes`
    : `https://waze.com/ul?q=${address}&navigate=yes`;

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header">
      <div class="detail-breadcrumb">
        <a href="#" onclick="showPage('home')">דף הבית</a> ›
        <a href="#" onclick="showPage('search')">חיפוש</a> ›
        ${p.title || p.address}
      </div>
      <h1 class="detail-title">${p.title || p.address}</h1>
      <div class="detail-meta">
        <div class="detail-rating">
          <span style="color:#f59e0b;font-size:1.1rem">★</span>
          <span>חדש</span>
        </div>
        <span style="color:var(--gray-400)">·</span>
        <span style="color:var(--gray-600);font-size:.9rem">📍 ${p.address}</span>
      </div>
      <!-- Waze navigation + Favorite -->
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <a href="${wazeUrl}" target="_blank" rel="noopener" class="waze-nav-btn">
          <img src="https://www.waze.com/favicon.ico" width="20" height="20" alt="Waze" style="border-radius:4px"/>
          נווט עם Waze
        </a>
        ${userIsPremium ? `<button id="fav-btn-${safeId(p.id)}" onclick="toggleFavorite('${safeId(p.id)}')" style="background:${userFavorites.has(String(p.id)) ? 'linear-gradient(135deg,#fce7f3,#f9a8d4)' : 'var(--gray-100)'};border:1.5px solid ${userFavorites.has(String(p.id)) ? '#e91e8c' : 'var(--gray-300)'};border-radius:10px;padding:8px 14px;cursor:pointer;font-size:.85rem;font-weight:700;color:${userFavorites.has(String(p.id)) ? '#be185d' : 'var(--gray-600)'};display:flex;align-items:center;gap:6px">
          ${userFavorites.has(String(p.id)) ? '❤️ שמור במועדפים' : '🤍 הוסף למועדפים'}
        </button>` : ''}
      </div>
    </div>

    <div class="gallery">
      <div class="listing-img gallery-img main" style="background:linear-gradient(135deg,#e0e7ff,#fce7f3);font-size:4rem">🅿️</div>
      <div class="listing-img gallery-img" style="background:linear-gradient(135deg,#fce7f3,#ede9fe);font-size:2rem">🚗</div>
      <div class="listing-img gallery-img" style="background:linear-gradient(135deg,#d1fae5,#a7f3d0);font-size:2rem">🏙️</div>
    </div>

    <div class="detail-layout">
      <div class="detail-main">

        <div class="detail-section">
          <h3>פרטי החניה</h3>
          <div class="amenities-grid">
            <div class="amenity-item">🏠 ${p.type || 'פרטית'}</div>
            <div class="amenity-item">📍 ${p.city || ''}</div>
            ${p.wheelchairAccessible ? '<div class="amenity-item">♿ נגיש לנכים</div>' : ''}
            ${p.hasCameras ? '<div class="amenity-item">📹 מצלמות אבטחה</div>' : ''}
            ${(p.tags || []).filter(t => t !== 'נגיש' && t !== 'מצלמות' && t !== 'טעינת חשמל').map(t => `<div class="amenity-item">✓ ${t}</div>`).join('')}
            ${p.description ? `<div class="amenity-item" style="grid-column:1/-1">📝 ${p.description}</div>` : ''}
          </div>
        </div>

        <div class="detail-section">
          <h3>בעל החניה</h3>
          <div class="host-info" onclick="openOwnerProfile('${safeId(p.ownerId||'')}','${(p.ownerName||'בעל חניה').replace(/'/g,"\\'")}')" style="cursor:pointer">
            <div class="host-avatar" style="background:var(--pink)">${(p.ownerName||'ב').charAt(0).toUpperCase()}</div>
            <div>
              <div class="host-name">${p.ownerName || 'בעל חניה'}</div>
              <div class="host-since">חבר NitPark · לצפייה בפרופיל ←</div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>🛡️ ביטוח וכיסוי</h3>
          <div class="insurance-card">
            <div class="insurance-header">
              <div class="insurance-shield">🛡️</div>
              <div>
                <div class="insurance-title">כיסוי ביטוחי מלא — כולל בכל הזמנה</div>
                <div class="insurance-sub">מופעל אוטומטית · ללא תוספת תשלום</div>
              </div>
            </div>
            <div class="insurance-grid">
              <div class="insurance-item"><span class="ins-icon">🚗</span><div><strong>נזקי רכב</strong><p>כיסוי עד ₪50,000 לנזק ישיר לרכב בזמן חניה</p></div></div>
              <div class="insurance-item"><span class="ins-icon">🔒</span><div><strong>גניבה ופריצה</strong><p>כיסוי חלקי לנזקי פריצה לרכב במהלך ההזמנה</p></div></div>
              <div class="insurance-item"><span class="ins-icon">⚖️</span><div><strong>אחריות כלפי צד שלישי</strong><p>הגנה משפטית בסכסוכים הנוגעים להזמנה</p></div></div>
              <div class="insurance-item"><span class="ins-icon">📞</span><div><strong>תמיכה 24/7</strong><p>קו חירום לדיווח על נזק — תוך שעה</p></div></div>
            </div>
            <div class="insurance-note">לדיווח על נזק: <strong>0526760039</strong> או דרך האפליקציה תוך 24 שעות מסיום ההזמנה.</div>
          </div>
        </div>

        <div class="detail-section">
          <h3>מדיניות ביטול</h3>
          <p style="color:var(--gray-600);line-height:1.8">ביטול עד 24 שעות לפני ההזמנה — החזר מלא. ביטול בפחות מ-24 שעות — החזר 50%. ביטול לאחר תחילת ההזמנה — ללא החזר.</p>
        </div>

        <div class="detail-section">
          <h3>⭐ דירוגים וביקורות</h3>
          <div id="listing-rating-summary" style="margin-bottom:16px;color:var(--gray-600)">טוען דירוגים...</div>
          <div style="background:var(--gray-50);border-radius:14px;padding:16px;margin-bottom:16px">
            <div style="font-weight:700;font-size:.9rem;margin-bottom:10px">דרג את החניה</div>
            <div id="rate-stars" style="display:flex;gap:6px;font-size:1.6rem;margin-bottom:10px">
              ${[1,2,3,4,5].map(n => `<span class="rate-star" data-val="${n}" onclick="setReviewStars(${n})" style="cursor:pointer;color:var(--gray-300)">★</span>`).join('')}
            </div>
            <textarea id="review-comment" rows="2" placeholder="ספר על החוויה שלך (אופציונלי)" style="width:100%;border:1px solid var(--gray-200);border-radius:10px;padding:10px;font-family:inherit;font-size:.88rem;resize:vertical"></textarea>
            <button class="btn-secondary" style="margin-top:10px;padding:10px 20px" onclick="submitListingReview()">שלח דירוג</button>
          </div>
          <div id="listing-reviews-list" style="display:flex;flex-direction:column;gap:12px"></div>
        </div>
      </div>

      <div class="detail-sidebar">
        <div class="booking-card" id="booking-card">
          <div class="booking-card-handle" onclick="toggleBookingCard()"></div>
          <div class="booking-price" id="booking-price-display">₪${p.price_hour} <span>לשעה</span></div>
          <div class="booking-rating">${p.rating ? '★ ' + p.rating + ' · ' + p.reviews_count + ' ביקורות' : 'חניה חדשה'}</div>

          <!-- Booking type tabs -->
          <div class="booking-type-tabs">
            <button class="bt-tab active" id="btab-hourly" onclick="setBookingType('hourly',this)">שעתי</button>
            <button class="bt-tab" id="btab-daily" onclick="setBookingType('daily',this)">יומי</button>
            <button class="bt-tab" id="btab-monthly" onclick="setBookingType('monthly',this)">חודשי</button>
            <button class="bt-tab" id="btab-yearly" onclick="setBookingType('yearly',this)">שנתי</button>
          </div>

          <!-- Hourly form -->
          <div id="bform-hourly" class="booking-type-form active">
            <div class="booking-field">
              <label>תאריך ושעת כניסה</label>
              <input type="datetime-local" id="book-start" onchange="calcTotal()" />
            </div>
            <div class="booking-field">
              <label>תאריך ושעת יציאה</label>
              <input type="datetime-local" id="book-end" onchange="calcTotal()" />
            </div>
          </div>

          <!-- Daily form -->
          <div id="bform-daily" class="booking-type-form">
            <div class="booking-field">
              <label>יום כניסה</label>
              <input type="date" id="book-start-day" onchange="calcTotal()" />
            </div>
            <div class="booking-field">
              <label>מספר ימים</label>
              <select id="book-days" onchange="calcTotal()">
                <option value="1">יום 1</option>
                <option value="2">2 ימים</option>
                <option value="3">3 ימים</option>
                <option value="7" selected>שבוע</option>
                <option value="14">שבועיים</option>
              </select>
            </div>
          </div>

          <!-- Monthly form -->
          <div id="bform-monthly" class="booking-type-form">
            <div class="booking-field">
              <label>תאריך התחלה</label>
              <input type="date" id="book-start-month" onchange="calcTotal()" />
            </div>
            <div class="booking-field">
              <label>מספר חודשים</label>
              <select id="book-months" onchange="calcTotal()">
                <option value="1">חודש 1</option>
                <option value="3" selected>3 חודשים</option>
                <option value="6">6 חודשים</option>
                <option value="12">שנה (12 חודשים)</option>
              </select>
            </div>
            <div class="longterm-saving" id="monthly-saving"></div>
          </div>

          <!-- Yearly form -->
          <div id="bform-yearly" class="booking-type-form">
            <div class="booking-field">
              <label>תאריך התחלה</label>
              <input type="date" id="book-start-year" onchange="calcTotal()" />
            </div>
            <div class="booking-field">
              <label>מספר שנים</label>
              <select id="book-years" onchange="calcTotal()">
                <option value="1" selected>שנה</option>
                <option value="2">2 שנים</option>
                <option value="3">3 שנים</option>
              </select>
            </div>
            <div class="longterm-saving" id="yearly-saving"></div>
          </div>

          <div class="booking-summary" id="booking-summary">
            <div class="bs-row"><span id="bs-rate-label">מחיר לשעה</span><span id="bs-rate">₪${(p.price_hour_tiers && p.price_hour_tiers[0]) || p.price_hour}</span></div>
            <div class="bs-row"><span id="bs-qty-label">מספר שעות</span><span id="bs-hours">—</span></div>
            <div class="bs-row" id="bs-stars-row" style="display:none;color:#f59e0b;font-weight:700"><span id="bs-stars-label">⭐ הנחת כוכבים</span><span id="bs-stars-discount">—</span></div>
            <div class="bs-row"><span>עמלת שירות (15%)</span><span id="bs-fee">—</span></div>
            <div class="bs-row total"><span>סה"כ לתשלום</span><span id="bs-total">—</span></div>
          </div>

          <button class="btn-book" onclick="openBookingSheet()">הזמן עכשיו</button>
          <p class="booking-note">לא תחויב עד לאישור ✓</p>
        </div>

        <div style="background:var(--gray-50);border-radius:14px;padding:20px;margin-top:16px">
          <h4 style="font-size:.9rem;font-weight:700;margin-bottom:14px">מחירים</h4>
          ${p.price_hour_tiers
            ? p.price_hour_tiers.map((pr,i)=>`<div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">שעה ${i+1}</span><span style="font-weight:700">₪${pr}</span></div>`).join('')
              + `<div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">כל שעה נוספת</span><span style="font-weight:700">₪${p.price_hour_extra}</span></div>`
            : `<div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">שעתי</span><span style="font-weight:700">₪${p.price_hour}/שעה</span></div>`}
          ${p.price_day ? `<div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">יומי</span><span style="font-weight:700">₪${p.price_day}/יום</span></div>` : ''}
          ${p.price_week ? `<div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">שבועי</span><span style="font-weight:700">₪${p.price_week}/שבוע</span></div>` : ''}
          ${p.price_month ? `<div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">חודשי</span><span style="font-weight:700">₪${p.price_month}/חודש</span></div>` : ''}
        </div>
      </div>
    </div>
  `;

  // Set default booking times
  bookingType = 'hourly';
  const now = new Date();
  const end = new Date(now.getTime() + 7200000);
  const startEl = document.getElementById('book-start');
  const endEl = document.getElementById('book-end');
  // Use the entry/exit time the user searched for, if they set one
  if (startEl) startEl.value = searchEntryTime || now.toISOString().slice(0,16);
  if (endEl)   endEl.value   = searchExitTime  || end.toISOString().slice(0,16);

  const today = now.toISOString().slice(0,10);
  const smEl = document.getElementById('book-start-month');
  const syEl = document.getElementById('book-start-year');
  const sdEl = document.getElementById('book-start-day');
  if (smEl) smEl.value = today;
  if (syEl) syEl.value = today;
  if (sdEl) sdEl.value = today;

  calcTotal();
  reviewStars = 0;
  loadListingReviews(p.firestoreId || p.id);
  showPage('detail');
}

// ── Listing reviews — read & write to listings/{id}/reviews ───────────────────
function loadListingReviews(listingId) {
  const summaryEl = document.getElementById('listing-rating-summary');
  const listEl    = document.getElementById('listing-reviews-list');
  if (!summaryEl || !listEl) return;

  firebase.firestore().collection('listings').doc(String(listingId)).collection('reviews')
    .orderBy('createdAt', 'desc').limit(20).get()
    .then(snap => {
      const reviews = snap.docs.map(d => d.data());
      if (reviews.length === 0) {
        summaryEl.innerHTML = 'אין עדיין דירוגים — היה הראשון לדרג!';
        listEl.innerHTML = '';
        return;
      }
      const avg = reviews.reduce((sum, r) => sum + (r.stars || 0), 0) / reviews.length;
      summaryEl.innerHTML = `<span style="color:#f59e0b;font-weight:800;font-size:1.1rem">★ ${avg.toFixed(1)}</span> מתוך ${reviews.length} ביקורות`;
      listEl.innerHTML = reviews.map(r => `
        <div style="border:1px solid var(--gray-200);border-radius:12px;padding:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-weight:700;font-size:.88rem">${r.userName || 'משתמש NitPark'}</span>
            <span style="color:#f59e0b;font-size:.9rem">${'★'.repeat(r.stars || 0)}${'☆'.repeat(5 - (r.stars || 0))}</span>
          </div>
          ${r.comment ? `<p style="color:var(--gray-600);font-size:.86rem;line-height:1.6;margin:0">${r.comment}</p>` : ''}
        </div>`).join('');
    })
    .catch(err => { console.error('[reviews] load failed:', err.code); summaryEl.innerHTML = 'אין עדיין דירוגים — היה הראשון לדרג!'; });
}

function submitListingReview() {
  if (!isLoggedIn || !firebase.auth().currentUser) { showToast('יש להתחבר כדי לדרג חניה', 'error'); openModal('login'); return; }
  if (!reviewStars) { showToast('בחר דירוג בכוכבים', 'error'); return; }
  const p = currentParking;
  if (!p) return;
  const comment = document.getElementById('review-comment')?.value.trim() || '';
  const listingId = String(p.firestoreId || p.id);

  firebase.firestore().collection('listings').doc(listingId).collection('reviews').add({
    userId: firebase.auth().currentUser.uid,
    userName: localStorage.getItem('nitpark_name') || userName || 'משתמש NitPark',
    stars: reviewStars,
    comment: comment,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    showToast('תודה על הדירוג! ⭐', 'success');
    document.getElementById('review-comment').value = '';
    setReviewStars(0);
    loadListingReviews(listingId);
  }).catch(err => {
    console.error('[reviews] submit failed:', err.code);
    showToast('שגיאה בשליחת הדירוג', 'error');
  });
}

// ── Owner public profile — shows who's behind a listing and their other parkings ──
function openOwnerProfile(ownerId, ownerName) {
  const ownerListings = PARKINGS.filter(p => ownerId && p.ownerId === ownerId);
  const rated = ownerListings.filter(p => p.rating);
  const avgRating = rated.length
    ? (rated.reduce((sum, p) => sum + p.rating, 0) / rated.length).toFixed(1)
    : null;
  const totalReviews = ownerListings.reduce((sum, p) => sum + (p.reviews_count || 0), 0);

  openModal('owner-profile');
  document.getElementById('modal-content').innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div class="host-avatar" style="background:var(--pink);width:72px;height:72px;font-size:1.8rem;margin:0 auto 14px">${(ownerName||'ב').charAt(0).toUpperCase()}</div>
      <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:4px">${ownerName || 'בעל חניה'}</h2>
      <div style="color:var(--gray-500);font-size:.9rem">חבר NitPark</div>
      ${avgRating ? `<div style="margin-top:10px;color:#f59e0b;font-weight:700">★ ${avgRating} <span style="color:var(--gray-500);font-weight:500">· ${totalReviews} ביקורות</span></div>` : ''}
    </div>
    <div style="border-top:1px solid var(--gray-200);padding-top:16px">
      <h4 style="font-size:.95rem;font-weight:700;margin-bottom:12px">חניות שפרסם (${ownerListings.length})</h4>
      ${ownerListings.length === 0
        ? `<p style="color:var(--gray-500);font-size:.88rem;text-align:center;padding:20px 0">אין עדיין חניות פעילות מבעל חניה זה.</p>`
        : `<div style="display:flex;flex-direction:column;gap:10px">
            ${ownerListings.map(p => `
              <div onclick="closeModal();openDetail('${safeId(p.id)}')" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--gray-200);border-radius:14px;cursor:pointer">
                <span style="font-size:1.6rem">${p.emoji}</span>
                <div style="flex:1;text-align:right">
                  <div style="font-weight:700;font-size:.92rem">${p.title}</div>
                  <div style="color:var(--gray-500);font-size:.8rem">📍 ${p.address}</div>
                </div>
                <div style="font-weight:800;color:var(--pink);font-size:.9rem">₪${p.price_hour}<span style="font-weight:500;color:var(--gray-400)">/שעה</span></div>
              </div>`).join('')}
          </div>`}
    </div>
  `;
}

// ── Current user id (works whether logged in via Firebase Auth or local-only) ──
function myUid() {
  return firebase.auth().currentUser?.uid || localStorage.getItem('nitpark_user') || '';
}

// Listings visible for browsing/booking — a host never sees their own spots in search/home,
// since you obviously can't park in (or pay for) your own parking.
function visibleParkings() {
  const uid = myUid();
  const now = new Date();
  return PARKINGS.filter(p => {
    if (uid && p.ownerId === uid) return false; // hide own listings
    if (!userIsPremium && p.premiumAccessUntil && p.premiumAccessUntil > now) return false; // early-access
    return true;
  });
}

// Count how many listings are currently in the premium early-access window
function earlyAccessCount() {
  const now = new Date();
  return PARKINGS.filter(p => p.premiumAccessUntil && p.premiumAccessUntil > now).length;
}

// ── "Publish" CTA ⇄ "My Parking" toggle ───────────────────────────────────────
// The moment a user has at least one published listing, every "פרסם חניה" entry
// point morphs into "החניה שלי" — tapping it opens their own dashboard instead
// (full details + everyone who booked/entered), with a clear way to add another spot.
function myListings() {
  const uid = myUid();
  return uid ? PARKINGS.filter(p => p.ownerId === uid) : [];
}

function updateHostCta() {
  const mine = myListings();
  const hasListings = mine.length > 0;

  const hero = document.getElementById('hero-host-cta');
  if (hero) {
    hero.querySelector('.hero-cta-card-icon').textContent = hasListings ? '🅿️' : '🏠';
    hero.querySelector('.hero-cta-card-title').textContent = hasListings ? 'החניה שלי' : 'פרסם חניה';
    hero.querySelector('.hero-cta-card-sub').textContent = hasListings ? 'צפה בפרטים, בכניסות ובהזמנות' : 'הרוויח כסף מהחניה שלך';
    hero.setAttribute('onclick', hasListings ? 'openMyListings()' : "showPage('host')");
  }

  const navBtn = document.getElementById('mbn-host');
  if (navBtn) {
    navBtn.querySelector('.mbn-icon').textContent = hasListings ? '🅿️' : '➕';
    navBtn.querySelector('.mbn-label').textContent = hasListings ? 'החניה שלי' : 'פרסם';
    navBtn.setAttribute('onclick', hasListings ? 'openMyListings()' : "mbnNav('host')");
  }

  const bigBtn = document.getElementById('host-cta-btn');
  if (bigBtn) bigBtn.textContent = hasListings ? '➕ פרסם חניה נוספת' : 'פרסם חניה עכשיו →';
  if (bigBtn) bigBtn.setAttribute('onclick', hasListings ? "showPage('host')" : "showPage('host')");
}

// ── "החניה שלי" — list of the host's own published spots ──────────────────────
function openMyListings() {
  const mine = myListings();
  openModal('my-listings');
  document.getElementById('modal-content').innerHTML = `
    <h2 class="modal-title">🅿️ החניה שלי</h2>
    <p class="modal-subtitle">הפרטים, ההזמנות ומי שנכנס לחניות שפרסמת</p>
    ${mine.length === 0
      ? `<p style="color:var(--gray-500);font-size:.9rem;text-align:center;padding:24px 0">עדיין לא פרסמת חניה.</p>`
      : `<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px">
          ${mine.map(p => `
            <div onclick="openMyListingDetail('${safeId(p.id)}')" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--gray-200);border-radius:14px;cursor:pointer">
              <span style="font-size:1.6rem">${p.emoji || '🅿️'}</span>
              <div style="flex:1;text-align:right">
                <div style="font-weight:700;font-size:.92rem">${p.title}</div>
                <div style="color:var(--gray-500);font-size:.8rem">📍 ${p.address}</div>
              </div>
              <div style="color:var(--gray-400);font-size:1.1rem">‹</div>
            </div>`).join('')}
        </div>`}
    <button class="btn-primary" style="width:100%;margin-top:18px;padding:13px" onclick="closeModal();showPage('host')">
      ➕ פרסם עוד חניה
    </button>
  `;
}

// ── Full owner view of a single listing: details + everyone who booked/entered ─
function openMyListingDetail(id) {
  const p = PARKINGS.find(x => String(x.id) === String(id));
  if (!p) return;

  const sched = p.weeklySchedule;
  const schedHtml = sched
    ? Object.entries(sched).filter(([,v]) => v.enabled)
        .map(([day,v]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--gray-100)"><span style="font-weight:600">${day}</span><span style="color:var(--gray-600)">${v.open} – ${v.close}</span></div>`).join('')
        || '<div style="color:var(--gray-400);font-size:.85rem">אין ימים פעילים</div>'
    : '<div style="color:var(--gray-400);font-size:.85rem">לא הוגדר לוח זמינות</div>';

  const durLabel = { unlimited:'ללא הגבלה', '1d':'יום אחד', '1w':'שבוע', '1m':'חודש' };
  const durText = p.publishDuration
    ? (p.publishDuration.type === 'custom' ? 'עד ' + (p.publishDuration.until||'—') : durLabel[p.publishDuration.type] || '—')
    : 'ללא הגבלה';

  openModal('my-listing-detail');
  document.getElementById('modal-content').innerHTML = `
    <button onclick="openMyListings()" style="background:none;border:none;color:var(--gray-500);font-size:.85rem;cursor:pointer;margin-bottom:6px">← חזרה לחניות שלי</button>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <h2 class="modal-title" style="margin:0">${p.emoji || '🅿️'} ${p.title}</h2>
      <button onclick="openEditListing('${safeId(p.id)}')" style="background:var(--gray-100);border:none;border-radius:10px;padding:8px 14px;font-size:.82rem;font-weight:700;cursor:pointer;color:var(--gray-700)">✏️ ערוך</button>
    </div>
    <p class="modal-subtitle">📍 ${p.address}</p>
    <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:14px;padding:16px;margin:12px 0;text-align:right">
      <div class="summary-row"><span>סוג חניה</span><span>${p.type || '—'}</span></div>
      <div class="summary-row"><span>מחיר לשעה</span><span>₪${p.price_hour}</span></div>
      <div class="summary-row"><span>מחיר יומי</span><span>${p.price_day ? '₪'+p.price_day : '—'}</span></div>
      <div class="summary-row"><span>מחיר חודשי</span><span>${p.price_month ? '₪'+p.price_month : '—'}</span></div>
      <div class="summary-row"><span>משך פרסום</span><span>${durText}</span></div>
      <div class="summary-row"><span>סטטוס</span><span style="color:#16a34a;font-weight:700">פעילה ✓</span></div>
    </div>
    <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:14px;padding:14px;margin-bottom:14px">
      <h4 style="font-size:.88rem;font-weight:700;margin-bottom:10px">📅 לוח זמינות שבועי</h4>
      ${schedHtml}
    </div>
    <h4 style="font-size:.95rem;font-weight:700;margin-bottom:10px">🚗 מי נכנס ומי הזמין</h4>
    <div id="my-listing-bookings" style="display:flex;flex-direction:column;gap:10px">
      <div style="text-align:center;color:var(--gray-400);font-size:.85rem;padding:16px 0">טוען נתונים...</div>
    </div>
  `;
  loadMyListingBookings(p);
}

// ── Edit a published listing ──────────────────────────────────────────────────
function openEditListing(id) {
  const p = PARKINGS.find(x => String(x.id) === String(id));
  if (!p) return;
  const fid = p.firestoreId || p.id;

  const sched = p.weeklySchedule || {};
  const DAYS = [
    { key:'א׳', label:'א׳ ראשון' }, { key:'ב׳', label:'ב׳ שני' },
    { key:'ג׳', label:'ג׳ שלישי' }, { key:'ד׳', label:'ד׳ רביעי' },
    { key:'ה׳', label:'ה׳ חמישי' }, { key:'ו׳', label:'ו׳ שישי' },
    { key:'ש׳', label:'ש׳ שבת' }
  ];

  const durLabels = { unlimited:'ללא הגבלה', '1d':'יום אחד', '1w':'שבוע', '1m':'חודש' };
  const curDur = p.publishDuration?.type || 'unlimited';
  const durBtns = Object.entries(durLabels).map(([k, lbl]) =>
    `<button type="button" class="dur-btn${curDur===k?' active':''}" data-dur="${k}" onclick="this.closest('.edit-dur-row').querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${lbl}</button>`
  ).join('') + `<button type="button" class="dur-btn${curDur==='custom'?' active':''}" data-dur="custom" onclick="this.closest('.edit-dur-row').querySelectorAll('.dur-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.getElementById('edit-dur-custom').style.display='block'">תאריך מדויק</button>`;

  const schedRows = DAYS.map(({ key, label }) => {
    const d = sched[key] || { enabled: false, open:'07:00', close:'19:00' };
    return `
      <div class="sched-row" data-day="${key}">
        <span class="sched-day-name">${label}</span>
        <label class="sched-toggle">
          <input type="checkbox" ${d.enabled?'checked':''} onchange="toggleSchedDay(this)"/>
          <span class="sched-toggle-track"></span>
        </label>
        <input type="time" class="sched-time sched-open"  value="${d.open}"  ${d.enabled?'':'disabled'}/>
        <input type="time" class="sched-time sched-close" value="${d.close}" ${d.enabled?'':'disabled'}/>
      </div>`;
  }).join('');

  openModal('edit-listing');
  document.getElementById('modal-content').innerHTML = `
    <button onclick="openMyListingDetail('${safeId(id)}')" style="background:none;border:none;color:var(--gray-500);font-size:.85rem;cursor:pointer;margin-bottom:8px">← חזרה לפרטים</button>
    <h2 class="modal-title">✏️ עריכת חניה</h2>
    <p class="modal-subtitle">📍 ${p.address}</p>

    <div class="modal-form" style="gap:14px">
      <label style="font-weight:700;font-size:.88rem">מחיר לשעה (₪)</label>
      <div class="price-input-wrap"><span>₪</span>
        <input type="number" id="edit-price-hour" class="modal-input" value="${p.price_hour}" min="0" />
      </div>

      <label style="font-weight:700;font-size:.88rem">מחיר יומי (₪)</label>
      <div class="price-input-wrap"><span>₪</span>
        <input type="number" id="edit-price-day" class="modal-input" value="${p.price_day||''}" min="0" placeholder="אופציונלי" />
      </div>

      <label style="font-weight:700;font-size:.88rem">מחיר חודשי (₪)</label>
      <div class="price-input-wrap"><span>₪</span>
        <input type="number" id="edit-price-month" class="modal-input" value="${p.price_month||''}" min="0" placeholder="אופציונלי" />
      </div>

      <label style="font-weight:700;font-size:.88rem">⏱️ משך פרסום</label>
      <div class="publish-duration-row edit-dur-row">${durBtns}</div>
      <div id="edit-dur-custom" style="display:${curDur==='custom'?'block':'none'};margin-top:6px">
        <input type="date" id="edit-dur-until" class="modal-input" value="${p.publishDuration?.until||''}" />
      </div>

      <label style="font-weight:700;font-size:.88rem">📅 לוח זמינות שבועי</label>
      <div class="weekly-schedule" id="edit-weekly-schedule">${schedRows}</div>

      <button class="btn-modal-primary" style="margin-top:8px" onclick="saveListingEdit('${fid}','${safeId(id)}')">💾 שמור שינויים</button>
    </div>
  `;
}

async function saveListingEdit(firestoreId, localId) {
  const btn = document.querySelector('#modal-content .btn-modal-primary');
  if (btn) { btn.textContent = 'שומר...'; btn.disabled = true; }

  // Read new weekly schedule from the edit modal
  const rows = document.querySelectorAll('#edit-weekly-schedule .sched-row:not(.header-row)');
  const newSched = {};
  rows.forEach(row => {
    const day = row.dataset.day;
    const enabled = row.querySelector('input[type=checkbox]')?.checked || false;
    newSched[day] = { enabled, open: row.querySelector('.sched-open')?.value||'07:00', close: row.querySelector('.sched-close')?.value||'19:00' };
  });

  // Read duration from edit modal
  const activeDur = document.querySelector('.edit-dur-row .dur-btn.active');
  const durType = activeDur?.dataset.dur || 'unlimited';
  const newDur = durType === 'custom'
    ? { type:'custom', until: document.getElementById('edit-dur-until')?.value||null }
    : { type: durType };

  const updates = {
    priceHour:  parseFloat(document.getElementById('edit-price-hour')?.value)  || 0,
    priceDay:   parseFloat(document.getElementById('edit-price-day')?.value)   || null,
    priceMonth: parseFloat(document.getElementById('edit-price-month')?.value) || null,
    weeklySchedule: newSched,
    publishDuration: newDur,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await firebase.firestore().collection('listings').doc(firestoreId).update(updates);
    showToast('✅ השינויים נשמרו בהצלחה!', 'success');
    closeModal();
  } catch (err) {
    console.error('[edit-listing] save failed:', err);
    showToast('שגיאה בשמירה — נסה שוב', 'error');
    if (btn) { btn.textContent = '💾 שמור שינויים'; btn.disabled = false; }
  }
}

async function loadMyListingBookings(p) {
  const wrap = document.getElementById('my-listing-bookings');
  if (!wrap) return;
  try {
    const snap = await firebase.firestore().collection('bookings')
      .where('parkingId', '==', p.id || p.firestoreId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    if (snap.empty) {
      wrap.innerHTML = `<p style="color:var(--gray-500);font-size:.85rem;text-align:center;padding:16px 0">עדיין אין הזמנות לחניה הזו.</p>`;
      return;
    }
    const typeLabel = { hourly: 'לפי שעה', daily: 'יומי', monthly: 'חודשי', yearly: 'שנתי' };
    wrap.innerHTML = snap.docs.map(doc => {
      const b = doc.data();
      const when = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString('he-IL') : '';
      const statusLabel = b.status === 'active' ? '🟢 פעיל' : b.status === 'completed' ? '✅ הסתיים' : b.status || '';
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--gray-200);border-radius:14px">
          <div class="host-avatar" style="background:var(--pink);width:40px;height:40px;font-size:1rem">${(b.userName||'א').charAt(0).toUpperCase()}</div>
          <div style="flex:1;text-align:right">
            <div style="font-weight:700;font-size:.9rem">${b.userName || 'משתמש NitPark'}</div>
            <div style="color:var(--gray-500);font-size:.78rem">${when} · ${typeLabel[b.bookingType] || b.bookingType || ''}</div>
          </div>
          <div style="text-align:left">
            <div style="font-weight:800;color:var(--pink);font-size:.88rem">₪${b.totalWithFee ?? '—'}</div>
            <div style="font-size:.75rem;color:var(--gray-500)">${statusLabel}</div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('[my-listings] load bookings failed:', err.code || err);
    wrap.innerHTML = `<p style="color:var(--gray-500);font-size:.85rem;text-align:center;padding:16px 0">לא ניתן לטעון את ההזמנות כרגע.</p>`;
  }
}

function setBookingType(type, btn) {
  bookingType = type;
  document.querySelectorAll('.bt-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.booking-type-form').forEach(f => f.classList.remove('active'));
  const form = document.getElementById('bform-' + type);
  if (form) form.classList.add('active');

  const priceDisplay = document.getElementById('booking-price-display');
  const p = currentParking;
  if (!p || !priceDisplay) return;

  if (type === 'hourly') priceDisplay.innerHTML = p.price_hour_tiers
    ? `₪${p.price_hour_tiers[0]} <span>לשעה הראשונה</span>`
    : `₪${p.price_hour} <span>לשעה</span>`;
  else if (type === 'daily') priceDisplay.innerHTML = `₪${p.price_day} <span>ליום</span>`;
  else if (type === 'monthly') priceDisplay.innerHTML = `₪${p.price_month} <span>לחודש</span>`;
  else if (type === 'yearly') priceDisplay.innerHTML = `₪${p.price_year?.toLocaleString() || '—'} <span>לשנה</span>`;

  calcTotal();
}

function calcTotal() {
  const p = currentParking;
  if (!p) return;

  let subtotal = 0;
  let qtyText = '—';
  let rateText = '—';
  let rateLabel = 'מחיר';
  let qtyLabel = 'כמות';

  if (bookingType === 'hourly') {
    const start = new Date(document.getElementById('book-start')?.value);
    const end = new Date(document.getElementById('book-end')?.value);
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (end <= start) { showToast('שעת היציאה חייבת להיות אחרי שעת הכניסה', 'error'); return; }
    const hours = Math.max(1, Math.ceil((end - start) / 3600000));
    if (p.price_hour_tiers) {
      subtotal = calcTieredHourlyPrice(p.price_hour_tiers, p.price_hour_extra, hours);
      rateText = p.price_hour_tiers.map((pr, i) => `שעה ${i+1}: ₪${pr}`).join(' · ') + ` · נוספת: ₪${p.price_hour_extra}`;
    } else {
      subtotal = hours * p.price_hour;
      rateText = '₪' + p.price_hour;
    }
    qtyText = hours + ' שעות';
    rateLabel = 'מחיר לשעה';
    qtyLabel = 'מספר שעות';

  } else if (bookingType === 'daily') {
    const days = parseInt(document.getElementById('book-days')?.value || 7);
    // If the host defined a weekly rate and the stay is whole weeks, use it — usually cheaper than days × daily rate
    if (p.price_week && days % 7 === 0) {
      const weeks = days / 7;
      subtotal = weeks * p.price_week;
      qtyText = days + ' ימים (' + weeks + (weeks === 1 ? ' שבוע' : ' שבועות') + ')';
      rateText = '₪' + p.price_week + ' לשבוע';
    } else {
      subtotal = days * p.price_day;
      qtyText = days + ' ימים';
      rateText = '₪' + p.price_day;
    }
    rateLabel = 'מחיר ליום';
    qtyLabel = 'מספר ימים';

  } else if (bookingType === 'monthly') {
    const months = parseInt(document.getElementById('book-months')?.value || 3);
    subtotal = months * p.price_month;
    qtyText = months + ' חודשים';
    rateText = '₪' + p.price_month;
    rateLabel = 'מחיר לחודש';
    qtyLabel = 'מספר חודשים';
    const saving = document.getElementById('monthly-saving');
    if (saving && months >= 3) {
      const discount = months >= 12 ? 10 : months >= 6 ? 5 : months >= 3 ? 3 : 0;
      if (discount > 0) {
        const saved = Math.round(subtotal * discount / 100);
        saving.innerHTML = `🎉 חיסכון של ${discount}% על מנוי ארוך — חוסך ₪${saved}`;
        subtotal = subtotal - saved;
      } else { saving.innerHTML = ''; }
    } else if (saving) { saving.innerHTML = ''; }

  } else if (bookingType === 'yearly') {
    const years = parseInt(document.getElementById('book-years')?.value || 1);
    const priceYear = p.price_year || p.price_month * 11;
    subtotal = years * priceYear;
    qtyText = years + (years === 1 ? ' שנה' : ' שנים');
    rateText = '₪' + priceYear.toLocaleString();
    rateLabel = 'מחיר לשנה';
    qtyLabel = 'מספר שנים';
    const saving = document.getElementById('yearly-saving');
    if (saving) {
      const monthlyEquiv = p.price_month * 12 * years;
      const saved = monthlyEquiv - subtotal;
      saving.innerHTML = `🎉 חיסכון של ₪${saved.toLocaleString()} לעומת תשלום חודשי!`;
    }
  }

  // Stars redemption preview — update live as user adjusts the stars slider
  const starsInput  = document.getElementById('stars-redeem-input');
  const starsToUse  = starsInput ? Math.min(parseInt(starsInput.value) || 0, userStarBalance) : 0;
  const starDiscount = Math.floor(starsToUse / 10) * 4; // 10 stars = ₪4
  const discountedBase = subtotal - starDiscount;
  const fee   = Math.round(Math.max(0, discountedBase) * 0.15);
  const total = Math.max(0, discountedBase) + fee;

  const starsRow   = document.getElementById('bs-stars-row');
  const starsDisEl = document.getElementById('bs-stars-discount');
  const starsLabel = document.getElementById('bs-stars-label');
  if (starsRow) starsRow.style.display = starDiscount > 0 ? '' : 'none';
  if (starsDisEl) starsDisEl.textContent = '-₪' + starDiscount.toLocaleString();
  if (starsLabel) starsLabel.textContent = `⭐ ${starsToUse} כוכבים`;

  const rateEl = document.getElementById('bs-rate');
  const rateLabelEl = document.getElementById('bs-rate-label');
  const qtyEl = document.getElementById('bs-hours');
  const qtyLabelEl = document.getElementById('bs-qty-label');
  if (rateEl) rateEl.textContent = rateText;
  if (rateLabelEl) rateLabelEl.textContent = rateLabel;
  if (qtyEl) qtyEl.textContent = qtyText;
  if (qtyLabelEl) qtyLabelEl.textContent = qtyLabel;
  document.getElementById('bs-fee').textContent = '₪' + fee.toLocaleString();
  document.getElementById('bs-total').textContent = '₪' + total.toLocaleString();
}

// ===== BOOKING SHEET =====
function openBookingSheet() {
  const p = currentParking;
  if (!p) return;

  let subtotal = 0, summaryLine = '', typeLabel = '';
  if (bookingType === 'hourly') {
    const start = document.getElementById('book-start')?.value;
    const end = document.getElementById('book-end')?.value;
    const startD = new Date(start), endD = new Date(end);
    if (start && end && endD <= startD) { showToast('שעת היציאה חייבת להיות אחרי שעת הכניסה', 'error'); return; }
    const hours = start && end ? Math.max(1, Math.ceil((endD - startD) / 3600000)) : 2;
    subtotal = hours * p.price_hour;
    summaryLine = `${hours} שעות × ₪${p.price_hour}`;
    typeLabel = 'שעתי';
  } else if (bookingType === 'daily') {
    const days = parseInt(document.getElementById('book-days')?.value || 7);
    subtotal = days * p.price_day;
    summaryLine = `${days} ימים × ₪${p.price_day}`;
    typeLabel = 'יומי';
  } else if (bookingType === 'monthly') {
    const months = parseInt(document.getElementById('book-months')?.value || 3);
    const discount = months >= 12 ? 10 : months >= 6 ? 5 : months >= 3 ? 3 : 0;
    subtotal = Math.round(months * p.price_month * (1 - discount / 100));
    summaryLine = `${months} חודשים × ₪${p.price_month}${discount ? ` (${discount}% הנחה)` : ''}`;
    typeLabel = 'חודשי';
  } else if (bookingType === 'yearly') {
    const years = parseInt(document.getElementById('book-years')?.value || 1);
    const priceYear = p.price_year || p.price_month * 11;
    subtotal = years * priceYear;
    summaryLine = `${years} ${years === 1 ? 'שנה' : 'שנים'} × ₪${priceYear.toLocaleString()}`;
    typeLabel = 'שנתי';
  }

  const total = subtotal + Math.round(subtotal * 0.15);

  // Stars section HTML — shown only if user has stars
  const starsSection = userStarBalance > 0 ? `
    <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:12px;padding:12px 14px;margin-bottom:12px;border:1.5px solid #fde68a">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:700;font-size:.88rem;color:#92400e">⭐ יתרת כוכבים: <strong>${userStarBalance}</strong> (= ₪${(Math.floor(userStarBalance/10)*4).toLocaleString()})</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <label style="font-size:.82rem;color:#a16207;font-weight:600">השתמש בכוכבים:</label>
        <input id="stars-redeem-input" type="range" min="0" max="${Math.floor(userStarBalance/10)*10}" step="10" value="0"
          style="flex:1;accent-color:#f59e0b"
          oninput="document.getElementById('stars-redeem-val').textContent=this.value+' כוכבים = ₪'+(Math.floor(this.value/10)*4);calcTotal()" />
        <span id="stars-redeem-val" style="font-size:.82rem;font-weight:700;color:#92400e;white-space:nowrap;min-width:70px">0 כוכבים</span>
      </div>
    </div>` : '';

  document.getElementById('booking-sheet-content').innerHTML = `
    <h2 class="bs-title">הזמנה · ${typeLabel}</h2>

    <div class="bs-parking-row">
      <div class="bs-parking-emoji">${p.emoji}</div>
      <div class="bs-parking-info">
        <div class="bs-parking-name">${p.title}</div>
        <div class="bs-parking-addr">📍 ${p.address}</div>
        <div class="bs-parking-price">סה"כ ₪${total.toLocaleString()}</div>
      </div>
    </div>

    ${starsSection}

    <div class="bs-breakdown" id="bs-breakdown-live">
      <div class="bsb-row"><span>${summaryLine}</span><span>₪${subtotal.toLocaleString()}</span></div>
      <div class="bsb-row" id="bsb-stars-row" style="display:none;color:#f59e0b;font-weight:700"><span id="bsb-stars-label">⭐ כוכבים</span><span id="bsb-stars-val">—</span></div>
      <div class="bsb-row"><span>עמלת שירות (15%)</span><span id="bsb-fee-live">₪${Math.round(subtotal*0.15).toLocaleString()}</span></div>
      <div class="bsb-row total"><span>סה"כ לתשלום</span><span id="bsb-total-live">₪${total.toLocaleString()}</span></div>
    </div>

    <div class="pay-section">
      <div class="pay-label">בחר אמצעי תשלום</div>
      <div class="pay-methods">
        <button class="pay-method active" onclick="selectPayMethod(this,'bit')">
          <span class="pm-logo pm-bit">bit</span><span class="pm-name">Bit</span>
        </button>
        <button class="pay-method" onclick="selectPayMethod(this,'paybox')">
          <span class="pm-logo pm-paybox">Pay</span><span class="pm-name">PayBox</span>
        </button>
        <button class="pay-method" onclick="selectPayMethod(this,'apple')">
          <span class="pm-logo pm-apple"> Pay</span><span class="pm-name">Apple Pay</span>
        </button>
        <button class="pay-method" onclick="selectPayMethod(this,'google')">
          <span class="pm-logo pm-google">G</span><span class="pm-name">Google Pay</span>
        </button>
        <button class="pay-method" onclick="selectPayMethod(this,'card')">
          <span class="pm-logo pm-card">💳</span><span class="pm-name">כרטיס</span>
        </button>
        <button class="pay-method pay-method--stars" onclick="selectPayMethod(this,'stars')">
          <span class="pm-logo pm-stars">⭐</span><span class="pm-name">כוכבים</span>
        </button>
      </div>

      <div id="pay-form-bit" class="pay-form active">
        <div class="pay-form-center">
          <div class="pf-icon pf-bit">bit</div>
          <p class="pf-desc">נשלח לך בקשת תשלום ב-Bit</p>
          <input class="modal-input" type="tel" placeholder="05X-XXXXXXX" style="text-align:center;font-size:1.1rem;letter-spacing:3px;font-weight:700" />
        </div>
      </div>

      <div id="pay-form-paybox" class="pay-form">
        <div class="pay-form-center">
          <div class="pf-icon pf-paybox">P</div>
          <p class="pf-desc">נשלח לך בקשת תשלום ב-PayBox</p>
          <input class="modal-input" type="tel" placeholder="05X-XXXXXXX" style="text-align:center;font-size:1.1rem;letter-spacing:3px;font-weight:700" />
        </div>
      </div>

      <div id="pay-form-apple" class="pay-form">
        <div class="pay-form-center">
          <div class="pf-icon pf-apple"> </div>
          <p class="pf-desc">תשלום מאובטח עם Face ID / Touch ID</p>
          <button class="apple-pay-btn" onclick="showBookingWarning()"> Pay · ₪${total.toLocaleString()}</button>
        </div>
      </div>

      <div id="pay-form-google" class="pay-form">
        <div class="pay-form-center">
          <div class="pf-icon pf-google">G</div>
          <p class="pf-desc">תשלום מהיר עם חשבון Google</p>
          <button class="google-pay-btn" onclick="showBookingWarning()">G Pay · ₪${total.toLocaleString()}</button>
        </div>
      </div>

      <div id="pay-form-card" class="pay-form">
        <div style="display:flex;flex-direction:column;gap:10px">
          <input class="modal-input" placeholder="שם על הכרטיס" />
          <div style="position:relative">
            <input class="modal-input" placeholder="1234  5678  9012  3456" maxlength="19"
              oninput="this.value=this.value.replace(/[^0-9]/g,'').replace(/(.{4})/g,'$1 ').trim()" style="width:100%;padding-left:44px" />
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:1.2rem">💳</span>
          </div>
          <div style="display:flex;gap:10px">
            <input class="modal-input" placeholder="MM/YY" style="flex:1" maxlength="5" />
            <input class="modal-input" placeholder="CVV" style="flex:1;max-width:90px" maxlength="4" type="password" />
          </div>
        </div>
      </div>

      <div id="pay-form-stars" class="pay-form">
        ${(() => {
          const starsNeeded = typeof ilsToStars === 'function' ? ilsToStars(total) : Math.ceil(total / 0.5);
          const balance     = typeof userStars !== 'undefined' ? userStars : 0;
          const hasEnough   = balance >= starsNeeded;
          return `
            <div class="pay-stars-panel">
              <div class="psp-icon">⭐</div>
              <div class="psp-cost">${starsNeeded.toLocaleString()} כוכבים</div>
              <div class="psp-value">שווה ₪${total.toLocaleString()}</div>
              <div class="psp-balance ${hasEnough ? 'psp-ok' : 'psp-low'}">
                יתרה שלך: ${balance.toLocaleString()} ⭐
                ${!hasEnough ? `<br/><small>חסרים ${(starsNeeded - balance).toLocaleString()} כוכבים</small>` : ''}
              </div>
              ${!hasEnough ? `<button class="psp-buy-btn" onclick="closeBooking();setTimeout(showStarsShop,200)">קנה כוכבים ⭐</button>` : ''}
            </div>`;
        })()}
      </div>
    </div>

    <button class="btn-book" id="booking-pay-btn" onclick="confirmBookingPay()" style="margin-top:18px">
      🔒 שלם ₪${total.toLocaleString()}
    </button>
    <div class="pay-security-row">
      <span>🔒 מוצפן</span><span>·</span>
      <span>Stripe PCI DSS</span><span>·</span>
      <span>לא נשמר מידע כרטיס</span>
    </div>
  `;

  document.getElementById('booking-sheet').classList.add('open');
  document.getElementById('booking-overlay').classList.add('open');

  // Wire up the stars slider to update the breakdown live
  const slider = document.getElementById('stars-redeem-input');
  if (slider) {
    slider.addEventListener('input', () => {
      const used       = Math.min(parseInt(slider.value) || 0, userStarBalance);
      const disc       = Math.floor(used / 10) * 4;
      const base       = Math.max(0, subtotal - disc);
      const fee        = Math.round(base * 0.15);
      const newTotal   = base + fee;
      const starsRowEl = document.getElementById('bsb-stars-row');
      if (starsRowEl) starsRowEl.style.display = disc > 0 ? '' : 'none';
      const starsLbl   = document.getElementById('bsb-stars-label');
      const starsVal   = document.getElementById('bsb-stars-val');
      if (starsLbl) starsLbl.textContent = `⭐ ${used} כוכבים`;
      if (starsVal) starsVal.textContent = `-₪${disc.toLocaleString()}`;
      const feeEl  = document.getElementById('bsb-fee-live');
      const totEl  = document.getElementById('bsb-total-live');
      if (feeEl) feeEl.textContent = `₪${fee.toLocaleString()}`;
      if (totEl) totEl.textContent = `₪${newTotal.toLocaleString()}`;
      // Update pay button text
      const payBtn = document.querySelector('#booking-sheet-content .btn-book');
      if (payBtn) payBtn.textContent = `🔒 שלם ₪${newTotal.toLocaleString()}`;
    });
  }
}

function selectPayMethod(btn, method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.pay-form').forEach(f => f.classList.remove('active'));
  const form = document.getElementById('pay-form-' + method);
  if (form) form.classList.add('active');

  const payBtn = document.getElementById('booking-pay-btn');
  if (payBtn) {
    if (method === 'stars') {
      const totalEl = document.querySelector('.bsb-row.total span:last-child');
      const totalILS = parseFloat((totalEl?.textContent || '0').replace(/[₪,]/g,'')) || 0;
      const starsNeeded = typeof ilsToStars === 'function' ? ilsToStars(totalILS) : Math.ceil(totalILS / 0.5);
      payBtn.textContent = `⭐ שלם ${starsNeeded.toLocaleString()} כוכבים`;
    } else {
      const totalEl = document.querySelector('.bsb-row.total span:last-child');
      payBtn.textContent = `🔒 שלם ${totalEl?.textContent || ''}`;
    }
  }
}

async function confirmBookingPay() {
  if (selectedPayMethod === 'stars') {
    const totalEl  = document.querySelector('.bsb-row.total span:last-child');
    const totalILS = parseFloat((totalEl?.textContent || '0').replace(/[₪,]/g,'')) || 0;
    const starsNeeded = typeof ilsToStars === 'function' ? ilsToStars(totalILS) : Math.ceil(totalILS / 0.5);
    const balance     = typeof userStars !== 'undefined' ? userStars : 0;

    if (balance < starsNeeded) {
      showToast(`אין מספיק כוכבים — חסרים ${(starsNeeded - balance).toLocaleString()} ⭐`);
      return;
    }
    if (!firebase.auth().currentUser) { showToast('יש להתחבר תחילה'); return; }

    const btn = document.getElementById('booking-pay-btn');
    if (btn) { btn.textContent = '⏳ מעבד...'; btn.disabled = true; }

    try {
      const uid = firebase.auth().currentUser.uid;
      await firebase.firestore().collection('users').doc(uid).set(
        { stars: firebase.firestore.FieldValue.increment(-starsNeeded) },
        { merge: true }
      );
      if (typeof userStars !== 'undefined') { userStars -= starsNeeded; updateStarsDisplay(); }
      closeBooking();
      showBookingSuccess();
      showToast(`שולם ${starsNeeded.toLocaleString()} ⭐ — הזמנה אושרה!`);
      if (typeof unlockAchievement === 'function') unlockAchievement('first_booking');
    } catch (e) {
      showToast('שגיאה — נסה שנית');
      if (btn) { btn.textContent = `⭐ שלם ${starsNeeded.toLocaleString()} כוכבים`; btn.disabled = false; }
    }
    return;
  }
  showBookingWarning();
}

function closeBooking() {
  document.getElementById('booking-sheet').classList.remove('open');
  document.getElementById('booking-overlay').classList.remove('open');
}

function showBookingWarning() {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (!overlay || !content) { confirmBooking(); return; }
  content.innerHTML = `
    <div style="text-align:center;padding:8px 0 4px">
      <div style="font-size:3rem;margin-bottom:12px">⚠️</div>
      <h2 style="font-size:1.3rem;font-weight:900;color:#1a1a2e;margin-bottom:10px">שים לב לפני ההזמנה!</h2>
      <div style="background:linear-gradient(135deg,#fff5f5,#fff0f0);border-radius:14px;padding:16px 18px;margin-bottom:20px;text-align:right;border:1.5px solid #fecaca">
        <p style="margin:0 0 10px;font-size:.95rem;line-height:1.8;color:#1a1a2e">
          🚗 <strong>יש לפנות את הרכב בדיוק בסיום הזמן שהוזמן.</strong>
        </p>
        <p style="margin:0;font-size:.9rem;line-height:1.8;color:#64748b">
          רכב שלא יפונה בזמן עלול <strong style="color:#ef4444">להיגרר</strong> על חשבון הנהג,
          ובנוסף יחויב <strong style="color:#ef4444">קנס כספי</strong> בהתאם לנזק שנגרם לבעל הנכס.
          NitPark לא תישא באחריות לעלות הגרירה.
        </p>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="closeModal()" style="flex:1;padding:13px;border-radius:12px;border:1.5px solid var(--gray-200);background:white;font-size:.95rem;font-weight:600;cursor:pointer;color:var(--gray-600)">ביטול</button>
        <button onclick="closeModal();confirmBooking()" style="flex:2;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#e91e8c,#8b5cf6);color:white;font-size:.95rem;font-weight:800;cursor:pointer">הבנתי, המשך להזמנה ←</button>
      </div>
    </div>
  `;
  overlay.classList.add('open');
}

async function confirmBooking() {
  if (cachedSavedCard === undefined) await loadAndRenderSavedCard();
  const savedCard = cachedSavedCard;
  if (!savedCard) {
    closeBooking();
    showToast('יש להוסיף כרטיס אשראי לפני הזמנה', 'error');
    setTimeout(() => openModal('profile'), 600);
    return;
  }
  closeBooking();
  const p = currentParking;

  // Calculate amount
  let amountILS = p?.price_hour || 15;
  let bookedMinutes = 60;
  if (bookingType === 'hourly') {
    const start = new Date(document.getElementById('book-start')?.value);
    const end = new Date(document.getElementById('book-end')?.value);
    if (start && end && !isNaN(start) && !isNaN(end) && end > start) {
      bookedMinutes = Math.ceil((end - start) / 60000);
      amountILS = Math.ceil((bookedMinutes / 60) * (p?.price_hour || 15));
    }
  } else if (bookingType === 'daily') {
    const days = parseInt(document.getElementById('book-days')?.value || 1);
    bookedMinutes = days * 24 * 60;
    amountILS = days * (p?.price_day || 80);
  } else if (bookingType === 'monthly') {
    const months = parseInt(document.getElementById('book-months')?.value || 1);
    bookedMinutes = months * 30 * 24 * 60;
    amountILS = months * (p?.price_month || 800);
  }

  // Stars redemption
  const starsSlider  = document.getElementById('stars-redeem-input');
  const starsToRedeem = starsSlider ? Math.min(parseInt(starsSlider.value) || 0, userStarBalance) : 0;
  const starDiscount  = Math.floor(starsToRedeem / 10) * 4;
  const discountedBase = Math.max(1, amountILS - starDiscount);
  const totalWithFee   = Math.ceil(discountedBase * 1.15);

  // Show processing overlay
  showToast('⏳ מעבד תשלום...', '');

  const hasStripe = stripeClient && savedCard?.id;

  if (hasStripe) {
    try {
      // Call Firebase Function to create PaymentIntent
      const createPI = firebase.functions().httpsCallable('createPaymentIntent');
      const result = await createPI({
        amountILS:      totalWithFee,
        parkingId:      p?.id || p?.firestoreId || 'unknown',
        bookingType,
        starsToRedeem,
        description:    `חניה: ${p?.address || p?.title || 'NitPark'}`
      });
      // Deduct stars from local state immediately (server already deducted)
      if (starsToRedeem > 0) userStarBalance = Math.max(0, userStarBalance - starsToRedeem);
      const { clientSecret } = result.data;

      // Confirm payment with the saved (tokenized) card on file
      const { paymentIntent, error } = await stripeClient.confirmCardPayment(clientSecret, {
        payment_method: savedCard.id
      });

      if (error) {
        showToast('❌ ' + (error.message || 'שגיאה בתשלום'), 'error');
        return;
      }

      if (paymentIntent.status !== 'succeeded') {
        showToast('התשלום לא הושלם — נסה שוב', 'error');
        return;
      }
    } catch (err) {
      if (!err.message?.includes('Stripe not configured')) {
        showToast('שגיאה: ' + (err.message || 'בעיה בתשלום'), 'error');
        return;
      }
    }
  }

  // The usage timer doesn't start at booking time — it starts only once the
  // driver actually arrives at the parking (detected via geofence below), and
  // stops automatically the moment they leave the area.
  if (p) _pendingParkingSession = { parking: p, bookedMinutes };

  // Save booking to Firestore
  if (p && isLoggedIn) {
    try {
      const uid = firebase.auth().currentUser?.uid || localStorage.getItem('nitpark_user') || 'anonymous';
      firebase.firestore().collection('bookings').add({
        userId: uid,
        userName: userName || localStorage.getItem('nitpark_name') || '',
        userPhone: localStorage.getItem('nitpark_phone') || '',
        parkingId: p.id || p.firestoreId || '',
        parkingTitle: p.title || '',
        parkingAddress: p.address || '',
        bookingType,
        totalWithFee,
        startTime: firebase.firestore.FieldValue.serverTimestamp(),
        endTimeMs: Date.now() + bookedMinutes * 60 * 1000,
        bookedMinutes,
        status: 'active',
        gateCode: p?.gate_code || Math.floor(1000 + Math.random() * 9000).toString(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e) { console.error('שגיאה בשמירת הזמנה:', e); }
  }

  const _gt      = p?.gate_type      || 'pin';
  const _gc      = p?.gate_code      || p?.intercom_code || Math.floor(1000 + Math.random() * 9000).toString();
  const _gphone  = p?.intercom_phone || '';
  const _iotUrl  = p?.iot_url        || '';
  const _iotTok  = p?.iot_token      || '';
  const _gicon   = _gt === 'intercom' ? '📞' : _gt === 'iot' ? '🌐' : _gt === 'none' ? '🚗' : _gt === 'key' ? '🔑' : '🔢';

  setTimeout(() => {
    openModal('success');
    document.getElementById('modal-content').innerHTML = `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:3.5rem;margin-bottom:12px">🎉</div>
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:8px">ההזמנה אושרה!</h2>
        <p style="color:var(--gray-600);font-size:.92rem;line-height:1.6;margin-bottom:8px">
          ${p?.title || 'החניה'} הוזמנה בהצלחה.<br/>
          שלחנו לך אישור + קוד גישה ב-SMS.
        </p>
        <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:10px 16px;margin-bottom:16px;font-size:.85rem">
          <span style="color:#16a34a;font-weight:700">✓ חויב: ₪${totalWithFee}</span>
          <span style="color:#6b7280;margin-right:8px">(כולל דמי שירות 15%)</span>
        </div>

        <div class="gate-code-card">
          <div class="gcc-header">
            <span>${_gicon}</span>
            <span>${_gateCardTitle(_gt)}</span>
          </div>
          ${_gateCardBody(_gt, _gc, _gphone, _iotUrl, _iotTok)}
          <div class="gcc-validity">תקף להזמנה זו בלבד</div>
          <button class="gcc-open-btn"
            data-gate-type="${_gt}"
            data-gate-code="${_gc}"
            data-gate-phone="${_gphone}"
            data-iot-url="${_iotUrl}"
            data-iot-token="${_iotTok}"
            onclick="openGateNow(this)">
            ${_gateOpenBtnLabel(_gt)}
          </button>
          <div class="gcc-tip" id="gcc-tip">${_gateOpenTip(_gt)}</div>
          <div id="gcc-proximity" style="display:none;margin-top:8px;padding:8px;background:#dcfce7;border-radius:10px;font-size:.82rem;color:#16a34a;font-weight:700">
            📍 הגעת לשטח החניה — לחץ לפתיחה!
          </div>
        </div>

        <div class="booking-confirm-info">
          <div class="bci-row">
            <span>📍 כתובת</span>
            <span>${p?.address || '—'}</span>
          </div>
          <div class="bci-row">
            <span>💳 כרטיס</span>
            <span>${savedCard.brand} •••• ${savedCard.last4}</span>
          </div>
          <div class="bci-row">
            <span>🛡️ ביטוח</span>
            <span style="color:#16a34a;font-weight:600">פעיל ✓</span>
          </div>
        </div>

        <button class="btn-primary" style="width:100%;padding:13px;font-size:.98rem;margin-top:16px"
          onclick="closeModal();showPage('home')">
          סיום
        </button>
        <p style="font-size:.75rem;color:var(--gray-400);margin-top:10px">
          לתמיכה: 0526760039 או nitaizx123@gmail.com
        </p>
        <p style="font-size:.75rem;color:#dc2626;margin-top:6px;cursor:pointer" onclick="showFinePolicy()">
          ⚠️ <u>מדיניות קנסות וגרירה</u>
        </p>
      </div>
    `;
    if (p?.address && _gt !== 'none' && _gt !== 'key') {
      setTimeout(() => _startGeoFence(p.address), 800);
    }
  }, 300);
}

// ===== GATE CODE =====
let gateType = 'pin';

function selectGateType(el, type) {
  gateType = type;
  document.querySelectorAll('.gate-type-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.querySelectorAll('.gate-fields').forEach(f => f.style.display = 'none');
  const f = document.getElementById('gate-' + type + '-fields');
  if (f) f.style.display = 'block';
}

function toggleGateCode(btn) {
  const inp = document.getElementById('h-gate-code');
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text'; btn.textContent = '🙈 הסתר';
  } else {
    inp.type = 'password'; btn.textContent = '👁 הצג';
  }
}

// ===== EV FIELDS TOGGLE =====
function toggleEVFields(checkbox) {
  const fields = document.getElementById('ev-fields');
  if (fields) fields.style.display = checkbox.checked ? 'flex' : 'none';
}

// ===== HOST FORM =====
function selectType(el, val) {
  document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedType = val;
}

function toggleDay(btn) {
  btn.classList.toggle('active');
  updateEarningsPreview();
}

// ── Publish duration ──────────────────────────────────────────────────────────
let publishDuration = 'unlimited';

function setPublishDuration(btn) {
  publishDuration = btn.dataset.dur;
  document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('h-duration-custom-wrap').style.display =
    publishDuration === 'custom' ? 'block' : 'none';
}

function getPublishDuration() {
  if (publishDuration === 'custom') {
    const until = document.getElementById('h-duration-until')?.value;
    return { type: 'custom', until: until || null };
  }
  const map = { unlimited: null, '1d': 1, '1w': 7, '1m': 30 };
  return { type: publishDuration, days: map[publishDuration] };
}

// ── Weekly schedule ───────────────────────────────────────────────────────────
function toggleSchedDay(cb) {
  const row = cb.closest('.sched-row');
  row.querySelectorAll('.sched-time').forEach(t => t.disabled = !cb.checked);
}

function getWeeklySchedule() {
  const rows = document.querySelectorAll('#weekly-schedule .sched-row:not(.header-row)');
  const schedule = {};
  rows.forEach(row => {
    const day = row.dataset.day;
    const enabled = row.querySelector('input[type=checkbox]')?.checked || false;
    const open  = row.querySelector('.sched-open')?.value  || '07:00';
    const close = row.querySelector('.sched-close')?.value || '19:00';
    schedule[day] = { enabled, open, close };
  });
  return schedule;
}

function scheduleText(schedule) {
  if (!schedule) return '—';
  const days = Object.entries(schedule)
    .filter(([, v]) => v.enabled)
    .map(([day, v]) => `${day} ${v.open}–${v.close}`);
  return days.length ? days.join(' · ') : 'לא נבחרו ימים';
}

// ===== PER-HOUR PRICING TIERS (publish form) =====
const HOUR_TIER_LABELS = ['ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית', 'שישית'];

function renderHourTiers() {
  const list = document.getElementById('hour-tiers-list');
  if (!list) return;
  let html = '';
  hourTierPrices.forEach((price, i) => {
    const label = HOUR_TIER_LABELS[i] || (i + 1) + '-';
    html += `<div style="display:flex;align-items:center;gap:8px">
      <span style="min-width:96px;font-size:.85rem;font-weight:600">שעה ${label}</span>
      <div class="price-input-wrap" style="flex:1"><span>₪</span><input type="number" min="0" value="${price}" oninput="setHourTierPrice(${i}, this.value)" /></div>
      ${i > 0 ? `<button type="button" onclick="removeHourTier(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:1.1rem;padding:4px 6px" title="הסר שעה">✕</button>` : '<span style="width:28px"></span>'}
    </div>`;
  });
  html += `<div style="display:flex;align-items:center;gap:8px">
    <span style="min-width:96px;font-size:.85rem;font-weight:600">כל שעה נוספת</span>
    <div class="price-input-wrap" style="flex:1"><span>₪</span><input type="number" min="0" value="${hourExtraPrice}" oninput="setHourExtraPrice(this.value)" /></div>
    <span style="width:28px"></span>
  </div>`;
  list.innerHTML = html;
}

function setHourTierPrice(i, val) {
  hourTierPrices[i] = parseFloat(val) || 0;
  updateEarningsPreview();
}

function setHourExtraPrice(val) {
  hourExtraPrice = parseFloat(val) || 0;
  updateEarningsPreview();
}

function addHourTier() {
  hourTierPrices.push(hourExtraPrice);
  renderHourTiers();
  updateEarningsPreview();
}

function removeHourTier(i) {
  if (hourTierPrices.length <= 1) return;
  hourTierPrices.splice(i, 1);
  renderHourTiers();
  updateEarningsPreview();
}

// Total price for a stay of `hours` hours, given the tiered per-hour pricing.
function calcTieredHourlyPrice(tiers, extra, hours) {
  let total = 0;
  for (let h = 1; h <= hours; h++) {
    total += (tiers && h <= tiers.length) ? tiers[h - 1] : extra;
  }
  return total;
}

function updateEarningsPreview() {
  const ph = hourTierPrices[0] || 15;
  const activeDays = document.querySelectorAll('.day-btn.active').length || 5;
  const hoursPerDay = 8;
  const monthly = ph * hoursPerDay * activeDays * 4;
  const net = v => '₪' + Math.round(v * 0.8).toLocaleString();
  const el50 = document.getElementById('earn-50');
  const el75 = document.getElementById('earn-75');
  const el100 = document.getElementById('earn-100');
  if (el50) el50.textContent = net(monthly * 0.5);
  if (el75) el75.textContent = net(monthly * 0.75);
  if (el100) el100.textContent = net(monthly);
}

function nextStep(n) {
  if (n === 2) {
    const addr = document.getElementById('h-address')?.value.trim();
    if (!addr) { showToast('נא להזין כתובת', 'error'); return; }
    if (hostImageCount === 0) { showToast('נא להעלות לפחות תמונה אחת של החניה', 'error'); return; }
  }
  if (n === 3) renderHostSummary();
  document.querySelectorAll('.host-step').forEach(s => s.classList.remove('active'));
  document.getElementById('host-step-' + n).classList.add('active');
  document.querySelectorAll('.form-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    else if (i + 1 === n) s.classList.add('active');
  });
  hostStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prevStep(n) {
  document.querySelectorAll('.host-step').forEach(s => s.classList.remove('active'));
  document.getElementById('host-step-' + n).classList.add('active');
  document.querySelectorAll('.form-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    else if (i + 1 === n) s.classList.add('active');
  });
  hostStep = n;
}

function renderHostSummary() {
  const el = document.getElementById('host-summary');
  if (!el) return;
  const addr = document.getElementById('h-address')?.value || '—';
  const tiersText = hourTierPrices.map((p, i) => `שעה ${HOUR_TIER_LABELS[i] || (i+1)+'-'}: ₪${p}`).join(' · ') + ` · נוספת: ₪${hourExtraPrice}`;
  const pd = document.getElementById('h-price-day')?.value || '—';
  const pw = document.getElementById('h-price-week')?.value || '—';
  const pm = document.getElementById('h-price-month')?.value || '—';

  const durLabels = { unlimited: 'ללא הגבלה', '1d': 'יום אחד', '1w': 'שבוע', '1m': 'חודש' };
  const dur = publishDuration === 'custom'
    ? 'עד ' + (document.getElementById('h-duration-until')?.value || '—')
    : (durLabels[publishDuration] || '—');

  const sched = getWeeklySchedule();
  const schedRows = Object.entries(sched)
    .filter(([, v]) => v.enabled)
    .map(([day, v]) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--gray-100)"><span>${day}</span><span style="color:var(--gray-600);font-size:.82rem">${v.open} – ${v.close}</span></div>`)
    .join('') || '<div style="color:var(--gray-400);font-size:.85rem">לא נבחרו ימים</div>';

  el.innerHTML = `
    <div class="summary-row"><span>כתובת</span><span>${addr}</span></div>
    <div class="summary-row"><span>סוג חניה</span><span>${selectedType}</span></div>
    <div class="summary-row"><span>משך פרסום</span><span>${dur}</span></div>
    <div class="summary-row"><span>מחירון שעות</span><span style="font-size:.8rem">${tiersText}</span></div>
    <div class="summary-row"><span>מחיר יומי</span><span>${pd !== '—' ? '₪'+pd : '—'}</span></div>
    <div class="summary-row"><span>מחיר שבועי</span><span>${pw !== '—' ? '₪'+pw : '—'}</span></div>
    <div class="summary-row"><span>מחיר חודשי</span><span>${pm !== '—' ? '₪'+pm : '—'}</span></div>
    <div class="summary-row" style="align-items:flex-start"><span>לוח זמינות</span><div style="flex:1;text-align:right">${schedRows}</div></div>
    <div class="summary-row"><span>עמלת NitPark</span><span>20%</span></div>
  `;
}

let _publishInProgress = false;
function publishListing() {
  if (_publishInProgress) return;
  const agreed = document.getElementById('agree-terms')?.checked;
  if (!agreed) { showToast('נא לאשר את התנאים', 'error'); return; }
  _publishInProgress = true;
  document.querySelector('.btn-publish')?.setAttribute('disabled', 'true');
  openModal('publish-success');
  document.getElementById('modal-content').innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:4rem;margin-bottom:20px">🚀</div>
      <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:12px">החניה פורסמה בהצלחה! 🎉</h2>
      <p style="color:var(--gray-600);line-height:1.7;margin-bottom:24px">
        החניה שלך פעילה כבר עכשיו וגלויה לכל המשתמשים בחיפוש.<br/>
        ברגע שיגיע מזמין ראשון — תקבל התראה מיידית.
      </p>
      <div style="background:var(--pink-light);border-radius:14px;padding:20px;margin-bottom:24px">
        <div style="font-size:.85rem;color:var(--pink);font-weight:700">הכנסה חודשית משוערת</div>
        <div style="font-size:2rem;font-weight:900;color:var(--pink);margin-top:8px" id="expected-earn">מחשב...</div>
      </div>
      <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:14px;padding:18px;margin-bottom:20px;text-align:right">
        <div style="font-weight:700;margin-bottom:6px">💳 קבלת תשלומים</div>
        <p style="color:var(--gray-600);font-size:.9rem;line-height:1.6;margin-bottom:12px">
          כדי שנוכל להעביר אליך את ההכנסות מהחניה, יש לחבר חשבון לקבלת תשלומים. אפשר לעשות את זה עכשיו או בכל שלב מאוחר יותר — לפני התשלום הראשון.
        </p>
        <button class="btn-secondary" style="width:100%;padding:12px" onclick="connectPayoutAccount()">
          🔗 חבר חשבון לקבלת תשלומים
        </button>
      </div>
      <button class="btn-primary" style="width:100%;padding:14px;font-size:1rem;margin-bottom:10px" onclick="closeModal();showPage('home')">
        מעולה, אעשה את זה אחר כך
      </button>
      <button class="btn-secondary" style="width:100%;padding:13px" onclick="closeModal();showPage('host')">
        ➕ פרסם עוד חניה
      </button>
    </div>
  `;
  const ph = hourTierPrices[0] || 15;
  const earn = Math.round(ph * 8 * 22 * 0.8 * 0.75);
  setTimeout(() => {
    const el = document.getElementById('expected-earn');
    if (el) el.textContent = '₪' + earn.toLocaleString() + '/חודש';
  }, 100);

  // Save to Firestore listings collection
  const db = firebase.firestore();
  const addr = document.getElementById('h-address')?.value || '';
  const pd = parseFloat(document.getElementById('h-price-day')?.value || ph * 8);
  const pw = parseFloat(document.getElementById('h-price-week')?.value || 0) || null;
  const pm = parseFloat(document.getElementById('h-price-month')?.value || ph * 160);
  const nearbyCategories = [...document.querySelectorAll('#nearby-categories input[type="checkbox"]:checked')].map(c => c.value);
  const features = [...document.querySelectorAll('.tags-selector input[type="checkbox"]:checked')].map(c => c.value);
  const hasEV = !!document.getElementById('has-ev')?.checked;
  db.collection('listings').add({
    ownerId: firebase.auth().currentUser?.uid || localStorage.getItem('nitpark_user') || '',
    ownerName: localStorage.getItem('nitpark_name') || userName,
    address: addr,
    city: addr.split(',').pop()?.trim() || 'ישראל',
    type: selectedType,
    priceHour: ph,                      // legacy/simple flat rate (= price for hour 1)
    priceHourTiers: hourTierPrices.slice(),  // custom price per specific hour, set by the host
    priceHourExtra: hourExtraPrice,          // rate for every hour beyond the defined tiers
    priceDay: pd,
    priceWeek: pw,
    priceMonth: pm,
    categories: nearbyCategories,   // points of interest the host marked as nearby (mall, airport, etc.)
    tags: features,                       // special features the host marked (covered, guarded, cameras, accessible, EV...)
    hasCameras: features.includes('מצלמות'),
    wheelchairAccessible: features.includes('נגיש'),
    hasEV: hasEV,
    evType: hasEV ? (document.getElementById('h-ev-type')?.value || '') : '',
    evKw: hasEV ? (parseFloat(document.getElementById('h-ev-kw')?.value) || 7) : null,
    weeklySchedule: getWeeklySchedule(),
    publishDuration: getPublishDuration(),
    status: 'active', // listings go live immediately — no manual approval needed
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    // Premium early-access window: non-premium users see this listing 30 min after creation
    premiumAccessUntil: new Date(Date.now() + 30 * 60 * 1000)
  }).then(docRef => {
    // Notify premium users about the new listing (non-blocking)
    if (docRef) {
      const notify = firebase.functions().httpsCallable('notifyPremiumUsersAboutListing');
      notify({ listingId: docRef.id, address: addr, priceHour: ph }).catch(() => {});
    }
  }).catch(err => console.error('[host] Firestore save failed:', err.code))
    .finally(() => {
      _publishInProgress = false;
      document.querySelector('.btn-publish')?.removeAttribute('disabled');
    });
}

// ── Connect a Stripe account so the host can receive payouts ──────────────────
// Triggered from the publish-success screen (or later from the host dashboard) —
// publishing itself never requires payment details up front.
async function connectPayoutAccount() {
  if (!firebase.auth().currentUser) {
    showToast('יש להתחבר כדי לחבר חשבון לתשלומים', 'error');
    return;
  }
  showToast('⏳ פותח את עמוד החיבור...', '');
  try {
    const createConnect = firebase.functions().httpsCallable('createConnectAccount');
    const result = await createConnect();
    const url = result?.data?.url;
    if (url) window.location.href = url;
    else showToast('שגיאה ביצירת קישור לחיבור', 'error');
  } catch (err) {
    console.error('[host] connectPayoutAccount failed:', err);
    showToast('שגיאה בחיבור חשבון התשלומים', 'error');
  }
}

function previewImages(input) {
  const grid = document.getElementById('image-preview');
  if (!grid) return;
  grid.innerHTML = '';
  const files = Array.from(input.files).slice(0, 6);
  hostImageCount = files.length;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'img-preview';
      grid.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

// ===== MODALS =====
function openModal(type) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  overlay.classList.add('open');

  if (type === 'login') {
    const savedEmail = localStorage.getItem('nitpark_email') || '';
    content.innerHTML = `
      <h2 class="modal-title">ברוך הבא חזרה</h2>
      <p class="modal-subtitle">התחבר לחשבון NitPark שלך</p>
      <div class="modal-form">
        <button class="btn-social-login" onclick="loginWithGoogleModal()">🌐 המשך עם Google</button>
        <div class="modal-divider">או</div>
        <input class="modal-input" type="email" placeholder="כתובת אימייל" value="${savedEmail}" />
        <input class="modal-input" type="password" placeholder="סיסמה" />
        <button class="btn-modal-primary" onclick="loginWithEmail()">התחברות</button>
      </div>
      <div class="modal-switch">
        אין לך חשבון? <a onclick="openModal('signup')">הרשם חינם</a>
      </div>
    `;
  } else if (type === 'signup') {
    const savedEmail2 = localStorage.getItem('nitpark_email') || '';
    const savedPhone2 = localStorage.getItem('nitpark_phone') || '';
    content.innerHTML = `
      <h2 class="modal-title">הצטרף ל-NitPark</h2>
      <p class="modal-subtitle">הרשמה חינמית · בלי כרטיס אשראי</p>
      <div class="modal-form">
        <button class="btn-social-login" onclick="loginWithGoogleModal()">🌐 הרשמה עם Google</button>
        <div class="modal-divider">או</div>
        <div style="display:flex;gap:10px">
          <input class="modal-input" placeholder="שם פרטי" style="flex:1" />
          <input class="modal-input" placeholder="שם משפחה" style="flex:1" />
        </div>
        <input class="modal-input" type="email" placeholder="כתובת אימייל" value="${savedEmail2}" />
        <input class="modal-input" type="tel" placeholder="מספר טלפון" value="${savedPhone2}" />
        <input class="modal-input" type="password" placeholder="סיסמה (מינ׳ 8 תווים)" />
        <button class="btn-modal-primary" onclick="loginWithEmail()">הצטרף חינם</button>
      </div>
      <div class="modal-switch">
        כבר יש לך חשבון? <a onclick="openModal('login')">התחבר</a>
      </div>
    `;
  } else if (type === 'terms') {
    content.innerHTML = `
      <h2 class="modal-title">תקנון השימוש</h2>
      <div style="color:var(--gray-600);font-size:.9rem;line-height:1.8;max-height:400px;overflow-y:auto">
        <p><strong>1. כללי</strong><br/>NitPark היא פלטפורמת תיווך בין בעלי חניות לנהגים. NitPark אינה צד לעסקה.</p>
        <p><strong>2. אחריות</strong><br/>המשתמש אחראי לוודא שיש לו זכות חוקית להשכיר את החניה. NitPark מספקת ביטוח לנזקי רכב ישירים בזמן חניה.</p>
        <p><strong>3. תשלומים</strong><br/>התשלום מעובד ע"י Stripe. NitPark גובה עמלה של 20% מהמשכיר.</p>
        <p><strong>4. ביטולים</strong><br/>עד 24 שעות לפני — החזר מלא. פחות מ-24 שעות — 50%. לאחר תחילה — אין החזר.</p>
        <p><strong>5. רגולציה</strong><br/>השכרת חניה בבית משותף מחייבת הסכמת הדיירים ו/או הצמדה לדירה. ההכנסה חייבת במס.</p>
      </div>
    `;
  } else if (type === 'profile') {
    const name = userName || localStorage.getItem('nitpark_name') || 'משתמש';
    const savedEmail = localStorage.getItem('nitpark_email') || localStorage.getItem('nitpark_user') || '';
    const savedPhone = localStorage.getItem('nitpark_phone') || '';
    const displayEmail = savedEmail.includes('@') ? savedEmail : '';
    const cardSection = `<div id="profile-card-section">${renderCardSectionHTML(undefined)}</div>`;
    content.innerHTML = `
      <div style="text-align:center;padding:8px 0 20px;position:relative">
        <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--pink),var(--purple));display:flex;align-items:center;justify-content:center;font-size:2.2rem;margin:0 auto 12px;color:white;font-weight:800;box-shadow:0 4px 16px rgba(236,72,153,.35)">${name.charAt(0).toUpperCase()}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px">
          <h2 id="profile-name-display" style="font-size:1.3rem;font-weight:800">${name}</h2>
          <button onclick="toggleEditName()" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:.85rem;padding:2px 6px;border-radius:6px;transition:.2s" title="ערוך שם">✏️</button>
        </div>
        <div id="profile-name-edit" style="display:none;justify-content:center;gap:8px;margin-bottom:4px">
          <input id="profile-name-input" class="modal-input" value="${name}" style="text-align:center;font-size:1rem;font-weight:700;max-width:200px;margin:0 auto" />
          <button onclick="saveProfileName()" style="background:var(--pink);color:white;border:none;border-radius:10px;padding:6px 14px;cursor:pointer;font-weight:700;font-size:.85rem">שמור</button>
        </div>
        ${displayEmail ? `<p style="color:var(--gray-500);font-size:.85rem;margin-bottom:2px">📧 ${displayEmail}</p>` : ''}
        ${savedPhone ? `<p style="color:var(--gray-500);font-size:.85rem;margin-bottom:2px">📱 ${savedPhone}</p>` : ''}
        <span style="background:var(--pink-light);color:var(--pink);font-size:.75rem;font-weight:700;padding:3px 12px;border-radius:100px;display:inline-block;margin-top:8px">✓ חבר NitPark מאומת</span>
        ${userIsPremium
          ? `<span style="background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;font-size:.75rem;font-weight:800;padding:3px 14px;border-radius:100px;display:inline-block;margin-top:6px;margin-right:6px">👑 פרימיום פעיל</span>`
          : ''}
      </div>
      <div style="margin-bottom:14px">
        ${userIsPremium ? `
          <div style="background:linear-gradient(135deg,#fef9c3,#fef3c7);border:1.5px solid #fde68a;border-radius:14px;padding:13px 16px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:800;font-size:.9rem;color:#92400e">👑 NitPark Premium פעיל</div>
              <div style="font-size:.78rem;color:#a16207;margin-top:2px">${userPremiumUntil ? 'פעיל עד ' + userPremiumUntil.toLocaleDateString('he-IL') : ''}${userPremiumCancelAtEnd ? ' · יבוטל בסוף התקופה' : ''}</div>
            </div>
            <button onclick="openPremiumModal()" style="background:white;border:1.5px solid #fde68a;color:#92400e;border-radius:10px;padding:6px 12px;cursor:pointer;font-weight:700;font-size:.78rem">ניהול</button>
          </div>` : `
          <button onclick="openPremiumModal()" style="width:100%;background:linear-gradient(135deg,#fef3c7,#fde68a);border:none;border-radius:14px;padding:14px 16px;cursor:pointer;text-align:right;display:flex;align-items:center;gap:10px">
            <span style="font-size:1.5rem">👑</span>
            <div style="flex:1">
              <div style="font-weight:800;font-size:.92rem;color:#92400e">שדרג לפרימיום</div>
              <div style="font-size:.78rem;color:#a16207;margin-top:1px">40 כוכבים/חודש · ביטול מאוחר · עדיפות · גישה מוקדמת</div>
            </div>
            <span style="font-weight:800;color:#92400e;font-size:.85rem">₪29/חודש ←</span>
          </button>`}
      </div>
      ${cardSection}
      <div style="background:var(--gray-50);border-radius:14px;overflow:hidden;margin-bottom:16px">
        <div style="padding:13px 16px;border-bottom:1px solid var(--gray-200)">
          <div id="profile-email-display-row" style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:.9rem">📧 אימייל</span>
            <div style="display:flex;align-items:center;gap:6px">
              <span id="profile-email-value" style="color:${displayEmail ? 'var(--gray-700)' : 'var(--gray-400)'};font-size:.85rem;font-weight:600">${displayEmail || '— לא הוגדר'}</span>
              <button onclick="toggleEditEmail()" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:.85rem;padding:2px 6px;border-radius:6px" title="ערוך אימייל">✏️</button>
            </div>
          </div>
          <div id="profile-email-edit" style="display:none;gap:8px;margin-top:10px">
            <input id="profile-email-input" class="modal-input" type="email" value="${displayEmail}" placeholder="כתובת אימייל" style="flex:1;font-size:.9rem" />
            <button onclick="saveProfileEmail()" style="background:var(--pink);color:white;border:none;border-radius:10px;padding:6px 14px;cursor:pointer;font-weight:700;font-size:.85rem">שמור</button>
          </div>
        </div>
        <div style="padding:13px 16px;border-bottom:1px solid var(--gray-200)">
          <div id="profile-phone-display-row" style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:600;font-size:.9rem">📱 טלפון</span>
            <div style="display:flex;align-items:center;gap:6px">
              <span id="profile-phone-value" style="color:${savedPhone ? 'var(--gray-700)' : 'var(--gray-400)'};font-size:.85rem;font-weight:600">${savedPhone || '— לא הוגדר'}</span>
              <button onclick="toggleEditPhone()" style="background:none;border:none;cursor:pointer;color:var(--gray-400);font-size:.85rem;padding:2px 6px;border-radius:6px" title="ערוך טלפון">✏️</button>
            </div>
          </div>
          <div id="profile-phone-edit" style="display:none;gap:8px;margin-top:10px">
            <input id="profile-phone-input" class="modal-input" type="tel" value="${savedPhone}" placeholder="050-1234567" dir="ltr" style="flex:1;font-size:.9rem;text-align:right" />
            <button onclick="saveProfilePhone()" style="background:var(--pink);color:white;border:none;border-radius:10px;padding:6px 14px;cursor:pointer;font-weight:700;font-size:.85rem">שמור</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid var(--gray-200)">
          <span style="font-weight:600;font-size:.9rem">💳 כרטיס אשראי</span>
          <span id="profile-card-status" style="color:var(--gray-400);font-size:.9rem;font-weight:700">⏳ בודק...</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px">
          <span style="font-weight:600;font-size:.9rem">🔐 כניסות שמורות</span>
          <span style="color:#22c55e;font-size:.9rem;font-weight:700">✓ פעיל</span>
        </div>
      </div>
      <div id="profile-bookings-summary" style="margin-bottom:16px"></div>
      <button class="btn-modal-primary" onclick="closeModal();mbnNav('bookings')" style="width:100%;margin-bottom:10px">📋 ההזמנות שלי</button>
      <button style="width:100%;padding:11px;background:none;border:1.5px solid #ef4444;border-radius:12px;cursor:pointer;color:#ef4444;font-weight:700;font-size:.9rem" onclick="logoutUser();closeModal()">יציאה מהחשבון</button>
    `;
    // Load the saved card live from Stripe (we keep no copy of it ourselves)
    loadAndRenderSavedCard();
    // Load bookings summary in profile
    loadProfileBookingsSummary();
  } else if (type === 'premium') {
    _renderPremiumModal(content);
  } else if (type === 'privacy') {
    content.innerHTML = `
      <h2 class="modal-title">מדיניות פרטיות</h2>
      <div style="color:var(--gray-600);font-size:.9rem;line-height:1.8;max-height:400px;overflow-y:auto">
        <p><strong>מה אנו אוספים:</strong> שם, אימייל, טלפון, מיקום, היסטוריית הזמנות.</p>
        <p><strong>שימוש במידע:</strong> לצורך אספקת השירות, שיפורו, ותמיכה.</p>
        <p><strong>שיתוף:</strong> לא מוכרים מידע אישי לצדדים שלישיים.</p>
        <p><strong>אבטחה:</strong> הצפנה מלאה, פרטי תשלום מנוהלים ע"י Stripe בלבד.</p>
        <p><strong>זכויות:</strong> ניתן לבקש מחיקת נתונים בכל עת.</p>
      </div>
    `;
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function toggleEditName() {
  const display = document.getElementById('profile-name-display');
  const edit = document.getElementById('profile-name-edit');
  if (!display || !edit) return;
  const isHidden = edit.style.display === 'none';
  display.style.display = isHidden ? 'none' : '';
  edit.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) document.getElementById('profile-name-input').focus();
}

function saveProfileName() {
  const inp = document.getElementById('profile-name-input');
  if (!inp) return;
  const newName = inp.value.trim();
  if (!newName) { showToast('נא להכניס שם', 'error'); return; }
  userName = newName;
  localStorage.setItem('nitpark_name', newName);
  const uid = firebase.auth().currentUser?.uid;
  if (uid) {
    firebase.firestore().collection('users').doc(uid).set(
      { displayName: newName, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ).catch(e => { console.error('שגיאה בעדכון שם:', e); });
  }
  updateNavbar();
  showToast('השם עודכן בהצלחה ✓', 'success');
  toggleEditName();
  const display = document.getElementById('profile-name-display');
  if (display) display.textContent = newName;
}

function toggleEditEmail() {
  const display = document.getElementById('profile-email-display-row');
  const edit = document.getElementById('profile-email-edit');
  if (!display || !edit) return;
  const isHidden = edit.style.display === 'none';
  edit.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) document.getElementById('profile-email-input').focus();
}

function saveProfileEmail() {
  const inp = document.getElementById('profile-email-input');
  if (!inp) return;
  const newEmail = inp.value.trim();
  if (!newEmail || !newEmail.includes('@')) { showToast('נא להכניס כתובת אימייל תקינה', 'error'); return; }
  userEmail = newEmail;
  localStorage.setItem('nitpark_email', newEmail);
  const uid = firebase.auth().currentUser?.uid;
  if (uid) {
    firebase.firestore().collection('users').doc(uid).set(
      { email: newEmail, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ).catch(e => { console.error('שגיאה בעדכון אימייל:', e); });
  }
  showToast('האימייל עודכן בהצלחה ✓', 'success');
  toggleEditEmail();
  const valueEl = document.getElementById('profile-email-value');
  if (valueEl) { valueEl.textContent = newEmail; valueEl.style.color = 'var(--gray-700)'; }
}

function toggleEditPhone() {
  const display = document.getElementById('profile-phone-display-row');
  const edit = document.getElementById('profile-phone-edit');
  if (!display || !edit) return;
  const isHidden = edit.style.display === 'none';
  edit.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) document.getElementById('profile-phone-input').focus();
}

function saveProfilePhone() {
  const inp = document.getElementById('profile-phone-input');
  if (!inp) return;
  const newPhone = inp.value.trim();
  if (!newPhone || newPhone.replace(/\D/g, '').length < 9) { showToast('נא להכניס מספר טלפון תקין', 'error'); return; }
  userPhone = newPhone;
  localStorage.setItem('nitpark_phone', newPhone);
  const uid = firebase.auth().currentUser?.uid;
  if (uid) {
    firebase.firestore().collection('users').doc(uid).set(
      { phone: newPhone, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ).catch(e => { console.error('שגיאה בעדכון טלפון:', e); });
  }
  showToast('הטלפון עודכן בהצלחה ✓', 'success');
  toggleEditPhone();
  const valueEl = document.getElementById('profile-phone-value');
  if (valueEl) { valueEl.textContent = newPhone; valueEl.style.color = 'var(--gray-700)'; }
}

function updateNavbar() {
  // Update topbar actions
  const topbarActions = document.getElementById('topbar-actions');
  if (topbarActions) {
    topbarActions.innerHTML = isLoggedIn
      ? `<button class="topbar-stars-btn" onclick="showStarsShop()">⭐ <span class="stars-balance">${userStarBalance}</span></button>
         <button class="topbar-profile-btn" onclick="openModal('profile')">
           <span class="topbar-avatar">${(userName||'מ').charAt(0).toUpperCase()}</span>
         </button>`
      : `<button class="btn-ghost" style="font-size:.85rem;padding:7px 14px" onclick="openModal('login')">כניסה</button>`;
  }
  // Update sidebar user card
  const card = document.getElementById('sidebar-user-card');
  if (card) {
    card.innerHTML = isLoggedIn
      ? `<div class="sidebar-user-info">
           <div class="sidebar-user-avatar">${(userName||'מ').charAt(0).toUpperCase()}</div>
           <div>
             <div class="sidebar-user-name">${userName || 'משתמש'}</div>
             <div class="sidebar-user-email">${localStorage.getItem('nitpark_email') || localStorage.getItem('nitpark_phone') || ''}</div>
           </div>
         </div>`
      : '';
  }
  // Update sidebar auth buttons
  const auth = document.getElementById('sidebar-auth');
  if (auth) {
    auth.innerHTML = isLoggedIn
      ? `<button class="btn-ghost" style="width:100%" onclick="logoutUser();closeSidebar()">יציאה מהחשבון</button>`
      : `<button class="btn-ghost" style="width:100%" onclick="openModal('login');closeSidebar()">התחברות</button>
         <button class="btn-primary" style="width:100%;margin-top:8px" onclick="openModal('signup');closeSidebar()">הצטרפות חינם</button>`;
  }
  updateSidebarCard();
}

function logoutUser() {
  firebase.auth().signOut().catch(() => {});
  localStorage.removeItem('nitpark_user');
  localStorage.removeItem('nitpark_name');
  isLoggedIn = false;
  userName = '';
  updateNavbar();
  showToast('התנתקת בהצלחה', 'success');
}

// ===== TOAST =====
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ===== INSTALL PWA =====
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});

function showInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
  } else {
    showToast('פתח את הדפדפן > "הוסף למסך הבית" להתקנה 📱');
  }
}

/* ─── Gate helper functions (shown on the booking-confirmed screen) ─── */

function _gateCardTitle(type) {
  return type === 'intercom' ? 'חיוג DTMF אוטומטי'
       : type === 'iot'      ? 'שליטה חכמה IoT'
       : type === 'key'      ? 'מפתח פיזי'
       : type === 'none'     ? 'כניסה חופשית'
       : 'קוד פתיחת שער';
}

function _gateCardBody(type, code, phone, iotUrl, iotToken) {
  if (type === 'pin') {
    return `<div class="gcc-code" id="gcc-display">${code}</div>`;
  }
  if (type === 'intercom') {
    return `<div class="gcc-code" id="gcc-display" style="font-size:1.5rem;letter-spacing:4px">${code}</div>
            <div style="font-size:.8rem;color:var(--gray-500);margin-top:4px">מספר: ${phone || 'לא הוגדר'}</div>`;
  }
  if (type === 'iot') {
    return `<div style="font-size:.85rem;color:var(--gray-600);padding:8px 0">פקודת פתיחה תישלח לבקר החכם</div>`;
  }
  if (type === 'key') {
    return `<div style="font-size:.85rem;color:var(--gray-600);padding:8px 0">תאם מסירת מפתח עם בעל החניה</div>`;
  }
  return `<div style="font-size:.85rem;color:#16a34a;padding:8px 0">החניה פתוחה לכניסה ישירה</div>`;
}

function _gateOpenBtnLabel(type) {
  return type === 'intercom' ? '📞 חייג ופתח שער'
       : type === 'iot'      ? '🌐 שלח פקודת פתיחה'
       : type === 'key'      ? '📋 הוראות קבלת מפתח'
       : type === 'none'     ? '✅ כניסה ישירה'
       : '🚪 פתח שער עכשיו';
}

function _gateOpenTip(type) {
  return type === 'intercom' ? 'האפליקציה תחייג ותזין את הקוד אוטומטית'
       : type === 'iot'      ? 'לחץ כשאתה ליד השער — הפקודה תישלח לבקר'
       : type === 'key'      ? 'מפתח נמסר בתיאום מראש עם המשכיר'
       : type === 'none'     ? 'אין צורך בקוד — כניסה חופשית'
       : 'לחץ "פתח שער" כשאתה ממש ליד הכניסה';
}

function _gateFeedback(btn, msg, color, resetLabel) {
  btn.textContent = msg;
  btn.disabled    = true;
  btn.style.background = color;
  setTimeout(() => {
    btn.textContent = resetLabel;
    btn.disabled    = false;
    btn.style.background = '';
  }, 4000);
}

function openGateNow(btn) {
  const type     = btn.dataset.gateType;
  const code     = btn.dataset.gateCode;
  const phone    = btn.dataset.gatePhone;
  const iotUrl   = btn.dataset.iotUrl;
  const iotToken = btn.dataset.iotToken;

  if (type === 'pin') {
    _gateFeedback(btn, '✅ הקוד מוצג — הזן בלוח המקשים', '#16a34a', _gateOpenBtnLabel(type));
    const codeEl = document.getElementById('gcc-display');
    if (codeEl) {
      codeEl.style.animation = 'none';
      codeEl.style.transform = 'scale(1.15)';
      setTimeout(() => { codeEl.style.transform = ''; }, 500);
    }

  } else if (type === 'intercom') {
    if (!phone) {
      _gateFeedback(btn, '⚠️ מספר טלפון לא הוגדר', '#ef4444', _gateOpenBtnLabel(type));
      return;
    }
    const dtmfPauses = ',,,';
    window.location.href = `tel:${phone}${dtmfPauses}${code}`;
    _gateFeedback(btn, '📞 מחייג...', '#3b82f6', _gateOpenBtnLabel(type));

  } else if (type === 'iot') {
    if (!iotUrl) {
      _gateFeedback(btn, '⚠️ כתובת IoT לא הוגדרה', '#ef4444', _gateOpenBtnLabel(type));
      return;
    }
    btn.textContent = '⏳ שולח פקודה...';
    btn.disabled    = true;
    btn.style.background = '#94a3b8';
    const headers = { 'Content-Type': 'application/json' };
    if (iotToken) headers['Authorization'] = `Bearer ${iotToken}`;
    fetch(iotUrl, { method: 'POST', headers, body: JSON.stringify({ action: 'open', timestamp: Date.now() }) })
      .then(r => {
        if (r.ok) _gateFeedback(btn, '✅ פקודה נשלחה — השער נפתח!', '#16a34a', _gateOpenBtnLabel(type));
        else      _gateFeedback(btn, `⚠️ שגיאת שרת (${r.status})`, '#ef4444', _gateOpenBtnLabel(type));
      })
      .catch(() => _gateFeedback(btn, '⚠️ שגיאת חיבור — בדוק אינטרנט', '#ef4444', _gateOpenBtnLabel(type)));
    return;

  } else if (type === 'key') {
    _gateFeedback(btn, '📋 פנה למשכיר לקבלת מפתח', '#f59e0b', _gateOpenBtnLabel(type));

  } else {
    _gateFeedback(btn, '✅ כניסה חופשית — הכנס', '#16a34a', _gateOpenBtnLabel(type));
  }
}

/* ─── Geofence — starts the usage timer on arrival, ends it on departure ─── */

let _geoWatchId  = null;
let _geoInside   = false;
let _pendingParkingSession = null; // { parking, bookedMinutes } — set right after a booking is confirmed

function _startGeoFence(address) {
  if (!navigator.geolocation) return;
  fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', ישראל')}&format=json&limit=1`)
    .then(r => r.json())
    .then(data => {
      if (!data || !data[0]) return;
      const targetLat = parseFloat(data[0].lat);
      const targetLng = parseFloat(data[0].lon);
      if (_geoWatchId !== null) navigator.geolocation.clearWatch(_geoWatchId);
      _geoInside = false;
      _geoWatchId = navigator.geolocation.watchPosition(
        pos => {
          const dist = _haversineMeters(pos.coords.latitude, pos.coords.longitude, targetLat, targetLng);
          const proximityEl = document.getElementById('gcc-proximity');
          const tipEl       = document.getElementById('gcc-tip');

          if (dist < 150 && !_geoInside) {
            // Arrived → start the usage timer
            _geoInside = true;
            if (proximityEl) proximityEl.style.display = 'block';
            if (tipEl) tipEl.style.display = 'none';
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            if (_pendingParkingSession) {
              startParkingSession(_pendingParkingSession.parking, _pendingParkingSession.bookedMinutes);
              _pendingParkingSession = null;
              showToast('🅿️ נכנסת לחניה — השעון התחיל לרוץ', 'success');
            }

          } else if (dist >= 150 && _geoInside) {
            // Left → stop the timer and charge for actual time used
            _geoInside = false;
            if (proximityEl) proximityEl.style.display = 'none';
            if (tipEl) tipEl.style.display = '';
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            if (localStorage.getItem('nitpark_parker_session')) {
              showToast('🚗 יצאת מהחניה — השעון נעצר', 'success');
              setTimeout(() => endParkingSessionConfirm(), 400);
            }
            if (_geoWatchId !== null) { navigator.geolocation.clearWatch(_geoWatchId); _geoWatchId = null; }
          }
        },
        null,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    })
    .catch(() => {}); // silent fail — geofence is a bonus feature
}

function _haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ===== ACTIVE PARKING SESSION =====
let sessionInterval = null;
let hostInterval = null;
let notifTimeouts = [];

function startParkingSession(parking, bookedMinutes) {
  const now = Date.now();
  const session = {
    parkingId: parking.id || '',
    title: parking.title || 'חניה פרטית',
    address: parking.address || '',
    priceHour: parking.price_hour || 0,
    startTime: now,
    endTime: now + bookedMinutes * 60 * 1000,
    bookedMinutes
  };
  localStorage.setItem('nitpark_parker_session', JSON.stringify(session));

  const hostSession = {
    title: parking.title || 'חניה פרטית',
    address: parking.address || '',
    priceHour: parking.price_hour || 0,
    startTime: now,
    endTime: session.endTime
  };
  localStorage.setItem('nitpark_host_session', JSON.stringify(hostSession));

  requestNotifPermission(() => scheduleSessionNotifications(session));
  renderSessionWidget();
  renderHostWidget();
}

function renderSessionWidget() {
  const raw = localStorage.getItem('nitpark_parker_session');
  if (!raw) return;
  const s = JSON.parse(raw);
  const widget = document.getElementById('parking-session-widget');
  if (!widget) return;
  widget.style.display = 'block';
  document.getElementById('psw-location').textContent = s.address;

  if (sessionInterval) clearInterval(sessionInterval);
  sessionInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.max(0, now - s.startTime);
    const remaining = Math.max(0, s.endTime - now);
    const total = s.endTime - s.startTime;
    const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
    const cost = (elapsed / 3600000) * s.priceHour;
    const bar = document.getElementById('psw-progress-bar');

    document.getElementById('psw-timer').textContent = formatDuration(elapsed);
    document.getElementById('psw-cost').textContent = '₪' + cost.toFixed(2);
    document.getElementById('psw-remain').textContent = remaining > 0 ? formatDuration(remaining) : '⚠️ זמן!';
    if (bar) {
      bar.style.width = progress + '%';
      bar.style.background = progress > 80 ? 'linear-gradient(90deg,#ef4444,#dc2626)' : 'linear-gradient(90deg,#e91e8c,#8b5cf6)';
    }

    if (remaining <= 0) {
      document.getElementById('psw-timer').style.color = '#ef4444';
      document.getElementById('psw-remain').style.color = '#ef4444';
    }
  }, 1000);
}

function renderHostWidget() {
  const raw = localStorage.getItem('nitpark_host_session');
  if (!raw) return;
  const s = JSON.parse(raw);
  const widget = document.getElementById('host-session-widget');
  if (!widget) return;

  // Push parker widget up so host widget fits below
  const psw = document.getElementById('parking-session-widget');
  if (psw && psw.style.display !== 'none') {
    psw.style.bottom = 'calc(136px + env(safe-area-inset-bottom))';
  }
  widget.style.display = 'block';
  document.getElementById('hsw-location').textContent = s.address;

  if (hostInterval) clearInterval(hostInterval);
  hostInterval = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.max(0, now - s.startTime);
    const income = (elapsed / 3600000) * s.priceHour * 0.8;
    document.getElementById('hsw-timer').textContent = formatDuration(elapsed);
    document.getElementById('hsw-income').textContent = '₪' + income.toFixed(2);
  }, 1000);
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function endParkingSessionConfirm() {
  const raw = localStorage.getItem('nitpark_parker_session');
  if (!raw) { endParkingSession(); return; }
  const s = JSON.parse(raw);
  const elapsed = Date.now() - s.startTime;
  const cost = ((elapsed / 3600000) * s.priceHour).toFixed(2);

  openModal('success');
  document.getElementById('modal-content').innerHTML = `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:3rem;margin-bottom:12px">🏁</div>
      <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:8px">סיום חניה</h2>
      <p style="color:var(--gray-600);font-size:.9rem;margin-bottom:20px">${s.title}</p>
      <div style="background:var(--gray-50);border-radius:14px;padding:16px 20px;margin-bottom:20px;text-align:right">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:var(--gray-500)">⏱ זמן חניה</span>
          <span style="font-weight:700">${formatDuration(elapsed)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:var(--gray-500)">💰 עלות</span>
          <span style="font-weight:800;color:var(--primary)">₪${cost}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:var(--gray-500)">📍 מיקום</span>
          <span style="font-weight:600;font-size:.85rem">${s.address}</span>
        </div>
      </div>
      <button class="btn-primary" style="width:100%;padding:13px;margin-bottom:10px" onclick="endParkingSession();closeModal()">
        סיום ותשלום ₪${cost}
      </button>
      <button style="width:100%;padding:11px;background:none;border:1px solid var(--gray-200);border-radius:12px;cursor:pointer;color:var(--gray-600)"
        onclick="closeModal()">חזור לחניה</button>
    </div>
  `;
}

function endParkingSession() {
  clearInterval(sessionInterval);
  clearInterval(hostInterval);
  notifTimeouts.forEach(t => clearTimeout(t));
  notifTimeouts = [];
  sessionInterval = null;
  hostInterval = null;
  localStorage.removeItem('nitpark_parker_session');
  localStorage.removeItem('nitpark_host_session');
  const w = document.getElementById('parking-session-widget');
  const h = document.getElementById('host-session-widget');
  if (w) { w.style.display = 'none'; w.style.bottom = ''; }
  if (h) h.style.display = 'none';
  showToast('החניה הסתיימה. נסיעה בטוחה! 🚗', 'success');
}

function toggleHostWidget() {
  const body = document.getElementById('hsw-body');
  const btn = document.querySelector('.hsw-toggle');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'flex';
  if (btn) btn.textContent = isOpen ? '▼' : '▲';
}

function requestNotifPermission(cb) {
  if (!('Notification' in window)) { cb && cb(); return; }
  if (Notification.permission === 'granted') { cb && cb(); return; }
  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => { if (p === 'granted' && cb) cb(); });
  }
}

function scheduleSessionNotifications(session) {
  const msLeft = session.endTime - Date.now();
  if (msLeft <= 0) return;

  // 15 min warning
  const warn15 = msLeft - 15 * 60 * 1000;
  if (warn15 > 0) {
    notifTimeouts.push(setTimeout(() => {
      sendNotif('⏰ נותרו 15 דקות', 'הגיע הזמן לאסוף את הרכב מ-' + session.title);
    }, warn15));
  }
  // 5 min warning
  const warn5 = msLeft - 5 * 60 * 1000;
  if (warn5 > 0) {
    notifTimeouts.push(setTimeout(() => {
      sendNotif('🚨 נותרו 5 דקות!', 'צא עכשיו כדי למנוע קנס של ₪200 — ' + session.title);
    }, warn5));
  }
  // Time's up
  notifTimeouts.push(setTimeout(() => {
    sendNotif('🛑 זמן החניה נגמר!', 'חריגה מחויבת ₪200/שעה — ' + session.title + '. הרכב עשוי להיגרר.');
  }, msLeft));
}

function sendNotif(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
  } else {
    showToast(title + ' — ' + body, 'error');
  }
}

function showFinePolicy() {
  document.getElementById('fine-policy-overlay').style.display = 'block';
  document.getElementById('fine-policy-modal').style.display = 'block';
}

function closeFinePolicy() {
  document.getElementById('fine-policy-overlay').style.display = 'none';
  document.getElementById('fine-policy-modal').style.display = 'none';
}

// Restore sessions on page load
function restoreActiveSessions() {
  const parker = localStorage.getItem('nitpark_parker_session');
  const host = localStorage.getItem('nitpark_host_session');
  if (parker) {
    const s = JSON.parse(parker);
    if (s.endTime > Date.now() - 3600000) { // grace: 1hr after end
      renderSessionWidget();
      scheduleSessionNotifications(s);
    } else {
      localStorage.removeItem('nitpark_parker_session');
    }
  }
  if (host) {
    const s = JSON.parse(host);
    if (s.endTime > Date.now() - 3600000) {
      renderHostWidget();
    } else {
      localStorage.removeItem('nitpark_host_session');
    }
  }
}

// Close modals on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeBooking(); closeFinePolicy(); }
});

// ===== CREDIT CARD =====
// Card numbers are typed straight into Stripe's hosted iframe and tokenized
// by Stripe — they never reach NitPark's servers, browser storage, or database.
// We only ever keep a Stripe Customer ID (server-side) and masked brand/last4
// for display, fetched live from Stripe on each profile view.
let cachedSavedCard; // undefined = not loaded yet, null = none, object = card

function renderCardSectionHTML(card) {
  if (card === undefined) {
    return `<div style="text-align:center;padding:24px;color:var(--gray-400);font-size:.85rem">⏳ טוען פרטי כרטיס...</div>`;
  }
  if (card) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:14px;padding:16px 20px;margin-bottom:16px">
         <div>
           <div style="color:#aaa;font-size:.75rem;margin-bottom:4px">כרטיס אשראי שמור</div>
           <div style="color:white;font-weight:700;font-size:1rem">${card.brand} •••• ${card.last4}</div>
           <div style="color:#888;font-size:.8rem">תפוגה: ${card.exp}</div>
         </div>
         <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
           <span style="background:#22c55e;color:white;font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:100px">✓ פעיל</span>
           <button onclick="removeCard('${card.id}')" style="background:none;border:none;color:#ef4444;font-size:.8rem;cursor:pointer;font-weight:600">הסר</button>
         </div>
       </div>`;
  }
  return `<div style="border:2px dashed var(--gray-200);border-radius:14px;padding:20px;margin-bottom:16px;text-align:center">
         <div style="font-size:2rem;margin-bottom:8px">💳</div>
         <div style="font-weight:700;margin-bottom:4px">אין כרטיס אשראי שמור</div>
         <div style="color:var(--gray-500);font-size:.85rem;margin-bottom:4px">נדרש להזמנה ולפרסום חניה</div>
         <div style="color:var(--gray-400);font-size:.78rem;margin-bottom:16px">🔒 הפרטים מוצפנים ונשלחים ישירות ל-Stripe — NitPark לא רואה ולא שומר את מספר הכרטיס</div>
         <div style="display:flex;flex-direction:column;gap:10px;text-align:right">
           <input id="cc-name" class="modal-input" placeholder="שם בעל הכרטיס" />
           <div id="stripe-card-number" dir="ltr" style="border:1.5px solid var(--gray-200);border-radius:12px;padding:13px 14px;background:white;font-size:16px;text-align:left"></div>
           <div style="display:flex;gap:10px" dir="ltr">
             <div id="stripe-card-expiry" style="flex:1;border:1.5px solid var(--gray-200);border-radius:12px;padding:13px 14px;background:white;font-size:16px"></div>
             <div id="stripe-card-cvc" style="flex:1;border:1.5px solid var(--gray-200);border-radius:12px;padding:13px 14px;background:white;font-size:16px"></div>
           </div>
           <div id="stripe-card-error" style="color:#ef4444;font-size:.82rem;min-height:18px"></div>
           <button class="btn-modal-primary" onclick="saveCard()">💳 שמור כרטיס</button>
         </div>
       </div>`;
}

function applyCardSectionToDOM(card) {
  const section = document.getElementById('profile-card-section');
  if (section) section.innerHTML = renderCardSectionHTML(card);

  const status = document.getElementById('profile-card-status');
  if (status) {
    status.style.color = card ? '#22c55e' : 'var(--gray-400)';
    status.textContent = card ? '✓ שמור' : '— לא הוגדר';
  }

  if (!card) setTimeout(() => mountStripeCardElement(), 50);
}

async function loadAndRenderSavedCard(forceRefresh) {
  if (cachedSavedCard !== undefined && !forceRefresh) {
    applyCardSectionToDOM(cachedSavedCard);
    return;
  }
  try {
    const listSavedCards = firebase.functions().httpsCallable('listSavedCards');
    const { data } = await listSavedCards();
    const c = (data.cards || [])[0];
    cachedSavedCard = c
      ? { id: c.id, brand: c.brand.charAt(0).toUpperCase() + c.brand.slice(1), last4: c.last4,
          exp: `${String(c.expMonth).padStart(2,'0')}/${String(c.expYear).slice(-2)}` }
      : null;
  } catch (e) {
    cachedSavedCard = null;
  }
  applyCardSectionToDOM(cachedSavedCard);
}

async function saveCard() {
  const holderName = document.getElementById('cc-name')?.value.trim();
  if (!holderName) { showToast('נא להזין שם בעל הכרטיס', 'error'); return; }
  if (!stripeClient || !stripeCardElement) { showToast('⚠️ Stripe לא מוגדר — הכנס publishable key', 'error'); return; }

  const btn = document.querySelector('#modal-content .btn-modal-primary:last-of-type');
  if (btn) { btn.textContent = '⏳ שומר...'; btn.disabled = true; }
  const errEl = document.getElementById('stripe-card-error');
  if (errEl) errEl.textContent = '';

  try {
    // 1) Ask our backend to open a SetupIntent for this user's Stripe Customer
    //    (no money moves — this just authorizes tokenizing & storing a card).
    const createSetupIntent = firebase.functions().httpsCallable('createSetupIntent');
    const { data } = await createSetupIntent({ email: userEmail || undefined, name: holderName });

    // 2) Confirm directly against Stripe — the PAN goes from the card element
    //    straight into Stripe's iframe, completely bypassing our servers.
    const { setupIntent, error } = await stripeClient.confirmCardSetup(data.clientSecret, {
      payment_method: { card: stripeCardElement, billing_details: { name: holderName, email: userEmail || undefined } }
    });

    if (error) throw new Error(error.message);

    showToast('כרטיס נשמר בהצלחה ✓', 'success');
    cachedSavedCard = undefined; // force a fresh fetch so brand/last4 come from Stripe
    openModal('profile');
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'שמירת הכרטיס נכשלה';
    if (btn) { btn.textContent = '💳 שמור כרטיס'; btn.disabled = false; }
  }
}

async function removeCard(paymentMethodId) {
  if (!confirm('להסיר את הכרטיס השמור?')) return;
  try {
    const deleteSavedCard = firebase.functions().httpsCallable('deleteSavedCard');
    await deleteSavedCard({ paymentMethodId });
    cachedSavedCard = undefined;
    showToast('הכרטיס הוסר', 'success');
    openModal('profile');
  } catch (err) {
    showToast(err.message || 'הסרת הכרטיס נכשלה', 'error');
  }
}


// ===== FIRESTORE LISTINGS SYNC (real-time) =====
function initFirestoreListings() {
  try {
    const db = firebase.firestore();
    db.collection('listings').onSnapshot(snap => {
      // Rebuild PARKINGS from Firestore only
      PARKINGS.length = 0;
      snap.forEach(doc => {
        const d = doc.data();
        if (d.status !== 'active') return; // only show approved listings
        PARKINGS.push({
          id: doc.id,
          firestoreId: doc.id,
          title: d.address || 'חניה פרטית',
          address: d.address || '',
          city: d.city || '',
          type: d.type || 'פרטית',
          price_hour: d.priceHour || 15,
          price_hour_tiers: (Array.isArray(d.priceHourTiers) && d.priceHourTiers.length) ? d.priceHourTiers : null,
          price_hour_extra: d.priceHourExtra || d.priceHour || 15,
          price_day: d.priceDay || 80,
          price_week: d.priceWeek || null,
          price_month: d.priceMonth || 800,
          price_year: d.priceYear || null,
          ownerId: d.ownerId || '',
          ownerName: d.ownerName || 'בעל חניה',
          description: d.description || '',
          status: d.status,
          rating: d.rating || null,
          reviews_count: d.reviewsCount || 0,
          emoji: d.emoji || '🅿️',
          ev_charger: d.hasEV ? { type: d.evType || 'AC', speed_kw: d.evKw || 7, price_per_kwh: 0 } : null,
          coords: d.lat && d.lng ? [d.lat, d.lng] : null,
          categories: d.categories || [],
          tags: Array.isArray(d.tags) ? d.tags : [],
          hasCameras: !!d.hasCameras,
          wheelchairAccessible: !!d.wheelchairAccessible,
          premiumAccessUntil: d.premiumAccessUntil instanceof Date ? d.premiumAccessUntil
            : d.premiumAccessUntil?.toDate ? d.premiumAccessUntil.toDate() : null
        });
      });
      filteredListings = [...visibleParkings()];
      renderHomeListings();
      updateHostCta();
      if (currentPage === 'search') {
        renderSearchResults(filteredListings);
        renderLeafletMarkers(filteredListings);
      }
      // Remind user once per session if they have an active listing
      if (!sessionStorage.getItem('_hostReminderShown')) {
        const mine = myListings();
        if (mine.length > 0) {
          sessionStorage.setItem('_hostReminderShown', '1');
          setTimeout(() => {
            showToast(`🅿️ יש לך ${mine.length > 1 ? mine.length + ' חניות פעילות' : 'חניה פעילה'}! לחץ על "החניה שלי" לניהול`, 'success');
          }, 1500);
        }
      }
    }, () => {});
  } catch(e) {}
}

// ===== REAL-TIME LOCATION =====
function startLocationTracking() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    userLatLng = [lat, lng];

    if (!leafletMap) return;

    const icon = L.divIcon({
      html: '<div style="width:20px;height:20px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',
      className: '',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    if (userLocationMarker) {
      userLocationMarker.setLatLng([lat, lng]);
    } else {
      userLocationMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(leafletMap);
    }
  }, null, { enableHighAccuracy: true, maximumAge: 5000 });
}

function centerOnUser() {
  if (!userLatLng) {
    showToast('מאתר מיקום...', '');
    navigator.geolocation?.getCurrentPosition(pos => {
      userLatLng = [pos.coords.latitude, pos.coords.longitude];
      if (leafletMap) leafletMap.setView(userLatLng, 15);
    }, () => showToast('לא ניתן לאתר מיקום', 'error'));
    return;
  }
  if (leafletMap) leafletMap.setView(userLatLng, 15);
}

// ===== CHATBOT =====
let chatbotOpen = false;
let chatbotGreeted = false;

const CHAT_RESPONSES = [
  { keys: ['שלום','היי','הי','בוקר','ערב'], reply: 'שלום! 👋 אני ParkBot, העוזר החכם של NitPark. איך אוכל לעזור?' },
  { keys: ['חפש','מצא','חניה','איפה','קרוב'], reply: 'כדי למצוא חניה — לחץ על 🔍 חפש בתפריט התחתון. תוכל לסנן לפי אזור, קטגוריה ומחיר!' },
  { keys: ['פרסם','להרוויח','בעל','השכר','להשכיר'], reply: 'פרסום חניה פשוט ומהיר! לחץ ➕ בתפריט, מלא את הפרטים ותגיש. לאחר אישור (24-48 שעות) החניה שלך תופיע לכולם.' },
  { keys: ['כרטיס','תשלום','לשלם','אשראי'], reply: 'לתשלום ורישום כרטיס — פתח 👤 פרופיל ולחץ "הוסף כרטיס". הכרטיס מוצפן ומאובטח. נדרש כרטיס לפני הזמנה או פרסום.' },
  { keys: ['ביטול','לבטל','החזר'], reply: 'מדיניות ביטולים: עד 24 שעות לפני — החזר מלא. פחות מ-24 שעות — 50%. לאחר תחילת חניה — אין החזר.' },
  { keys: ['ביטוח','מאובטח','בטוח','נזק'], reply: 'כל חניה ב-NitPark מכוסה בביטוח לנזקי רכב. הפלטפורמה בוחנת ומאמתת כל חניה לפני אישור.' },
  { keys: ['מחיר','עלות','כמה','תשלום'], reply: 'המחירים משתנים לפי חניה — שעתי (₪12-25), יומי (₪60-120), חודשי (₪700-1,200). NitPark גובה 20% עמלה מהמשכיר בלבד.' },
  { keys: ['קוד','שער','פתח','כניסה'], reply: 'קוד פתיחת שער נשלח ב-SMS לאחר אישור הזמנה. ניתן גם לראותו במסך הסיכום של ההזמנה.' },
  { keys: ['תמיכה','עזרה','בעיה','תקלה','שגיאה'], reply: 'לתמיכה ישירה: שלח מייל ל-nitaizx123@gmail.com או פתח שיחה בצ\'אט זה ואתאר את הבעיה.' },
  { keys: ['זמן','שעה','מתי','לוח זמנים'], reply: 'ניתן להזמין חניה לפי שעה, יום, שבועיים, חודש או שנה. הזמינות של כל חניה מוצגת בעמוד הפרטים.' },
];

function showChatbotFab() {
  const btn = document.getElementById('chatbot-btn');
  if (btn) btn.style.display = 'flex';
}

function toggleChatbot() {
  const widget = document.getElementById('chatbot-widget');
  const btn = document.getElementById('chatbot-btn');
  chatbotOpen = !chatbotOpen;
  widget.style.display = chatbotOpen ? 'flex' : 'none';
  if (chatbotOpen) {
    document.getElementById('chatbot-badge').style.display = 'none';
    if (!chatbotGreeted) {
      chatbotGreeted = true;
      setTimeout(() => addBotMessage('שלום! 👋 אני ParkBot — העוזר הדיגיטלי של NitPark.\nאוכל לעזור לך למצוא חניה, לפרסם, לשאלות תשלום ועוד. מה השאלה?'), 300);
      setTimeout(() => showQuickReplies(['🔍 חיפוש חניה', '📝 פרסום חניה', '💳 תשלום וכרטיס', '⭐ ביטוח ואמינות']), 800);
    }
    setTimeout(() => document.getElementById('chatbot-input')?.focus(), 100);
  }
}

function addBotMessage(text) {
  const msgs = document.getElementById('chatbot-messages');
  if (!msgs) return;
  const d = document.createElement('div');
  d.className = 'cb-msg bot';
  d.innerHTML = `<div class="cb-avatar">🤖</div><div class="cb-bubble">${text.replace(/\n/g,'<br/>')}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserChatMessage(text) {
  const msgs = document.getElementById('chatbot-messages');
  if (!msgs) return;
  const d = document.createElement('div');
  d.className = 'cb-msg user';
  d.innerHTML = `<div class="cb-bubble">${text}</div>`;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}

function showQuickReplies(options) {
  const el = document.getElementById('chatbot-quick');
  if (!el) return;
  el.innerHTML = options.map(o => `<button class="cb-quick-btn" onclick="quickReply('${o}')">${o}</button>`).join('');
}

function quickReply(text) {
  document.getElementById('chatbot-quick').innerHTML = '';
  processChat(text);
}

function sendChatMessage() {
  const inp = document.getElementById('chatbot-input');
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = '';
  processChat(text);
}

function processChat(text) {
  addUserChatMessage(text);
  document.getElementById('chatbot-quick').innerHTML = '';
  const lower = text.toLowerCase();
  let response = null;
  for (const rule of CHAT_RESPONSES) {
    if (rule.keys.some(k => lower.includes(k))) { response = rule.reply; break; }
  }
  if (!response) {
    response = 'שאלה מעולה! 🤔 לא מצאתי תשובה מדויקת. נסה לשאול על: חיפוש חניה, פרסום, תשלום, ביטוח, ביטולים או קוד גישה.';
  }
  setTimeout(() => {
    addBotMessage(response);
    showQuickReplies(['🔍 חיפוש חניה', '💳 תשלום', '📝 פרסום', '❓ עוד שאלה']);
  }, 500);
}

// ===== BOOKINGS PAGE =====
let currentBookingsTab = 'active';
let allUserBookings = [];

function switchBookingsTab(tab) {
  currentBookingsTab = tab;
  document.querySelectorAll('.bk-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.bk-tab[onclick*="${tab}"]`);
  if (activeTab) activeTab.classList.add('active');
  renderBookingsList();
}

async function loadUserBookings(tab) {
  tab = tab || currentBookingsTab || 'active';
  currentBookingsTab = tab;

  // sync tab UI
  document.querySelectorAll('.bk-tab').forEach(t => t.classList.remove('active'));
  const activeTabEl = document.querySelector(`.bk-tab[onclick*="${tab}"]`);
  if (activeTabEl) activeTabEl.classList.add('active');

  const loading = document.getElementById('bk-loading');
  const empty   = document.getElementById('bk-empty');
  const list    = document.getElementById('bk-list');
  if (!list) return;

  if (loading) loading.style.display = 'block';
  if (empty)   empty.style.display   = 'none';
  list.innerHTML = '';

  // Also include active session from localStorage
  const lsRaw = localStorage.getItem('nitpark_parker_session');
  const lsSession = lsRaw ? JSON.parse(lsRaw) : null;

  try {
    if (!isLoggedIn) {
      allUserBookings = lsSession ? [localSessionToBooking(lsSession)] : [];
    } else {
      const uid = firebase.auth().currentUser?.uid || localStorage.getItem('nitpark_user') || '';
      if (!uid) { allUserBookings = []; }
      else {
        const snap = await firebase.firestore()
          .collection('bookings')
          .where('userId', '==', uid)
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
        allUserBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Merge local session if not in Firestore
        if (lsSession && !allUserBookings.find(b => b.status === 'active')) {
          allUserBookings.unshift(localSessionToBooking(lsSession));
        }
      }
    }
  } catch(e) {
    // Firestore error — fallback to localStorage only
    allUserBookings = lsSession ? [localSessionToBooking(lsSession)] : [];
  }

  if (loading) loading.style.display = 'none';
  renderBookingsList();
}

function localSessionToBooking(s) {
  return {
    id: 'local',
    status: Date.now() < s.endTime ? 'active' : 'past',
    parkingTitle: s.title || 'חניה',
    parkingAddress: s.address || '',
    bookingType: 'hourly',
    totalWithFee: Math.ceil((s.bookedMinutes / 60) * (s.priceHour || 0) * 1.15),
    endTimeMs: s.endTime,
    bookedMinutes: s.bookedMinutes,
    gateCode: '',
    createdAt: { toDate: () => new Date(s.startTime) }
  };
}

function renderBookingsList() {
  const empty = document.getElementById('bk-empty');
  const list  = document.getElementById('bk-list');
  if (!list) return;

  const now = Date.now();
  let filtered = allUserBookings.filter(b => {
    const endMs = b.endTimeMs || 0;
    if (currentBookingsTab === 'active')   return b.status === 'active' && endMs > now;
    if (currentBookingsTab === 'upcoming') return b.status === 'upcoming' || (b.status === 'active' && endMs > now + 3600000);
    if (currentBookingsTab === 'past')     return b.status === 'past' || (b.endTimeMs && b.endTimeMs < now);
    return true;
  });

  // For simplicity: active = endTimeMs > now, past = endTimeMs < now
  if (currentBookingsTab === 'active')   filtered = allUserBookings.filter(b => b.endTimeMs > now);
  if (currentBookingsTab === 'upcoming') filtered = allUserBookings.filter(b => b.status === 'upcoming');
  if (currentBookingsTab === 'past')     filtered = allUserBookings.filter(b => !b.endTimeMs || b.endTimeMs < now);

  list.innerHTML = '';

  if (!filtered.length) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  filtered.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bk-card';

    const isActive = b.endTimeMs && b.endTimeMs > now;
    const badgeClass = isActive ? 'bk-badge-active' : (b.status === 'upcoming' ? 'bk-badge-upcoming' : 'bk-badge-past');
    const badgeText  = isActive ? '⏱ פעילה' : (b.status === 'upcoming' ? '🔜 עתידית' : '✓ הסתיימה');

    const typeMap = { hourly: 'שעתי', daily: 'יומי', monthly: 'חודשי' };
    const createdStr = b.createdAt?.toDate
      ? b.createdAt.toDate().toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '';

    const endStr = b.endTimeMs
      ? new Date(b.endTimeMs).toLocaleDateString('he-IL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '';

    const gateSection = (b.gateCode && isActive) ? `
      <div class="bk-gate-code">
        <div>
          <div class="bk-gate-code-label">🔢 קוד כניסה</div>
          <div class="bk-gate-code-val">${b.gateCode}</div>
        </div>
        <button onclick="navigator.clipboard?.writeText('${b.gateCode}');showToast('קוד הועתק ✓','success')"
          style="background:rgba(255,255,255,.1);border:none;color:white;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:700;font-size:.85rem">העתק</button>
      </div>` : '';

    card.innerHTML = `
      <div class="bk-card-header">
        <div>
          <div class="bk-card-title">${b.parkingTitle || 'חניה'}</div>
          <div class="bk-card-addr">📍 ${b.parkingAddress || ''}</div>
        </div>
        <span class="bk-badge ${badgeClass}">${badgeText}</span>
      </div>
      ${createdStr ? `<div class="bk-card-row"><span>תאריך</span><span>${createdStr}</span></div>` : ''}
      ${endStr ? `<div class="bk-card-row"><span>סיום</span><span>${endStr}</span></div>` : ''}
      <div class="bk-card-row"><span>סוג</span><span>${typeMap[b.bookingType] || b.bookingType || '—'}</span></div>
      ${b.totalWithFee ? `<div class="bk-card-row"><span>סכום</span><span style="color:var(--pink);font-weight:800">₪${b.totalWithFee}</span></div>` : ''}
      ${gateSection}
    `;
    list.appendChild(card);
  });
}

// ===== PROFILE BOOKINGS SUMMARY =====
async function loadProfileBookingsSummary() {
  const el = document.getElementById('profile-bookings-summary');
  if (!el) return;
  if (!isLoggedIn) return;

  try {
    const uid = firebase.auth().currentUser?.uid || localStorage.getItem('nitpark_user') || '';
    if (!uid) return;

    const snap = await firebase.firestore()
      .collection('bookings')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    const bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = bookings.reduce((s, b) => s + (b.totalWithFee || 0), 0);
    const active = bookings.filter(b => b.endTimeMs && b.endTimeMs > Date.now());

    if (!bookings.length) return;

    el.innerHTML = `
      <div style="background:var(--gray-50);border-radius:14px;padding:14px 16px;margin-bottom:4px">
        <div style="font-weight:700;font-size:.85rem;margin-bottom:10px;color:var(--gray-500)">📊 סיכום פעילות</div>
        <div style="display:flex;gap:10px">
          <div style="flex:1;background:white;border-radius:10px;padding:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
            <div style="font-size:1.4rem;font-weight:900;color:var(--pink)">${bookings.length}</div>
            <div style="font-size:.75rem;color:var(--gray-500);font-weight:600">הזמנות</div>
          </div>
          <div style="flex:1;background:white;border-radius:10px;padding:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
            <div style="font-size:1.4rem;font-weight:900;color:#8b5cf6">₪${total}</div>
            <div style="font-size:.75rem;color:var(--gray-500);font-weight:600">שולם</div>
          </div>
          <div style="flex:1;background:white;border-radius:10px;padding:10px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)">
            <div style="font-size:1.4rem;font-weight:900;color:#22c55e">${active.length}</div>
            <div style="font-size:.75rem;color:var(--gray-500);font-weight:600">פעילות</div>
          </div>
        </div>
      </div>`;
  } catch(e) { console.error('שגיאה בטעינת סיכום הזמנות:', e); }
}

// ===== PREMIUM MODULE =====

let _premiumPlan           = 'monthly';
let _premiumStripeElements = null;
let _premiumCardEl         = null;

function openPremiumModal() {
  if (!isLoggedIn) { openModal('login'); return; }
  openModal('premium');
}

function _renderPremiumModal(content) {
  if (!content) content = document.getElementById('modal-content');
  if (!content) return;

  if (userIsPremium) {
    const until = userPremiumUntil ? userPremiumUntil.toLocaleDateString('he-IL') : '—';
    content.innerHTML = `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:3rem;margin-bottom:8px">👑</div>
        <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:6px">NitPark Premium פעיל!</h2>
        <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:12px;padding:14px;margin:12px 0;font-size:.9rem;color:#92400e">
          <strong>פעיל עד:</strong> ${until}
          ${userPremiumCancelAtEnd ? '<br/><span style="color:#ef4444;font-size:.82rem">יבוטל בסוף התקופה הנוכחית</span>' : ''}
        </div>
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border-radius:12px;padding:12px;margin:12px 0;text-align:right">
          <div style="font-weight:800;font-size:.85rem;color:#92400e;margin-bottom:8px">⭐ יתרת כוכבים: ${userStarBalance} (= ₪${Math.floor(userStarBalance/10)*4})</div>
        </div>
        <div style="text-align:right;margin:16px 0;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border-radius:10px"><span>⭐</span><span style="font-size:.88rem"><strong>40 כוכבים/חודש</strong> = ₪16 ערך להמרה בהזמנות</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border-radius:10px"><span>🔝</span><span style="font-size:.88rem"><strong>עדיפות בהזמנות</strong> — ראשון לקבל מקום חניה נדרש</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border-radius:10px"><span>🕐</span><span style="font-size:.88rem"><strong>ביטול מאוחר</strong> עד 15 דק׳ לפני — ללא קנס (3×/חודש)</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--gray-50);border-radius:10px"><span>🎯</span><span style="font-size:.88rem"><strong>גישה מוקדמת</strong> לחניות חדשות לפני כולם</span></div>
        </div>
        ${!userPremiumCancelAtEnd
          ? `<button onclick="cancelPremiumFlow()" style="width:100%;padding:11px;background:none;border:1.5px solid #fecaca;border-radius:12px;cursor:pointer;color:#ef4444;font-weight:700;font-size:.88rem;margin-bottom:10px">ביטול מנוי</button>`
          : `<p style="font-size:.82rem;color:var(--gray-400);margin-bottom:10px">המנוי לא יתחדש אוטומטית.</p>`}
        <button class="btn-modal-primary" onclick="closeModal()">סגור</button>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div style="padding:4px 0">
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:2.4rem;margin-bottom:6px">👑</div>
        <h2 style="font-size:1.25rem;font-weight:800;margin-bottom:4px">NitPark Premium</h2>
        <p style="color:var(--gray-500);font-size:.88rem">חסוך כסף בכל הזמנה וקבל יתרונות בלעדיים</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <button id="plan-monthly" onclick="selectPremiumPlan('monthly')"
          style="position:relative;padding:14px;border:2px solid var(--pink);border-radius:14px;background:var(--pink-light);cursor:pointer;transition:.2s">
          <div style="font-size:.75rem;color:var(--gray-500);margin-bottom:2px">חודשי</div>
          <div style="font-size:1.5rem;font-weight:900;color:var(--pink)">₪29</div>
          <div style="font-size:.72rem;color:var(--gray-400)">לחודש</div>
        </button>
        <button id="plan-yearly" onclick="selectPremiumPlan('yearly')"
          style="position:relative;padding:14px;border:2px solid var(--gray-200);border-radius:14px;background:white;cursor:pointer;transition:.2s">
          <div style="position:absolute;top:-10px;right:50%;transform:translateX(50%);background:#16a34a;color:white;font-size:.65rem;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">חסוך 28%</div>
          <div style="font-size:.75rem;color:var(--gray-500);margin-bottom:2px">שנתי</div>
          <div style="font-size:1.5rem;font-weight:900;color:var(--pink)">₪249</div>
          <div style="font-size:.72rem;color:var(--gray-400)">לשנה</div>
        </button>
      </div>

      <div style="background:var(--gray-50);border-radius:12px;padding:12px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:.86rem"><span>⭐</span><span><strong>40 כוכבים/חודש</strong> — כל 10 כוכבים = ₪4 הנחה בהזמנה</span></div>
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:.86rem"><span>🔝</span><span><strong>עדיפות בהזמנות</strong> — ראשון לקבל מקום חניה פופולרי</span></div>
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:.86rem"><span>🕐</span><span><strong>ביטול מאוחר</strong> עד 15 דק׳ לפני — ללא קנס (3×/חודש)</span></div>
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:.86rem"><span>🎯</span><span><strong>גישה מוקדמת</strong> לחניות חדשות לפני כולם</span></div>
      </div>

      <div style="font-size:.8rem;color:var(--gray-500);margin-bottom:8px;text-align:center">🔒 תשלום מאובטח · Stripe PCI DSS Level 1</div>
      <div id="premium-card-wrap" style="padding:14px;border:1.5px solid var(--gray-200);border-radius:12px;background:white;min-height:46px;margin-bottom:8px"></div>
      <div id="premium-card-error" style="color:#ef4444;font-size:.82rem;min-height:18px;text-align:center;margin-bottom:8px"></div>

      <button id="premium-subscribe-btn" class="btn-modal-primary" onclick="confirmPremiumSubscription()" style="width:100%;padding:14px">
        👑 הפוך לפרימיום — ₪29/חודש
      </button>
      <p style="text-align:center;font-size:.75rem;color:var(--gray-400);margin-top:8px">ניתן לביטול בכל עת · ללא התחייבות</p>
    </div>`;

  _premiumPlan = 'monthly';
  setTimeout(_mountPremiumCard, 80);
}

function selectPremiumPlan(plan) {
  _premiumPlan = plan;
  const monthly = document.getElementById('plan-monthly');
  const yearly  = document.getElementById('plan-yearly');
  if (monthly) {
    monthly.style.border        = plan === 'monthly' ? '2px solid var(--pink)' : '2px solid var(--gray-200)';
    monthly.style.background    = plan === 'monthly' ? 'var(--pink-light)' : 'white';
  }
  if (yearly) {
    yearly.style.border         = plan === 'yearly' ? '2px solid var(--pink)' : '2px solid var(--gray-200)';
    yearly.style.background     = plan === 'yearly' ? 'var(--pink-light)' : 'white';
  }
  const btn = document.getElementById('premium-subscribe-btn');
  if (btn) btn.textContent = `👑 הפוך לפרימיום — ${plan === 'yearly' ? '₪249/שנה' : '₪29/חודש'}`;
}

function _mountPremiumCard() {
  if (_premiumCardEl) return;
  const s = window.Stripe ? window.Stripe(STRIPE_PK) : null;
  if (!s) return;

  const container = document.getElementById('premium-card-wrap');
  if (!container || container.offsetParent === null) {
    setTimeout(_mountPremiumCard, 100);
    return;
  }

  _premiumStripeElements = s.elements({
    locale: 'he',
    appearance: {
      theme: 'stripe',
      variables: { colorPrimary: '#e91e8c', fontFamily: 'Heebo, sans-serif', borderRadius: '12px' },
    },
  });

  _premiumCardEl = _premiumStripeElements.create('card', {
    hidePostalCode: true,
    style: { base: { fontSize: '16px', fontFamily: 'Heebo, sans-serif', color: '#1e293b', '::placeholder': { color: '#94a3b8' } } },
  });
  _premiumCardEl.mount('#premium-card-wrap');
  _premiumCardEl.on('change', e => {
    const err = document.getElementById('premium-card-error');
    if (err) err.textContent = e.error ? e.error.message : '';
  });
}

async function confirmPremiumSubscription() {
  const btn  = document.getElementById('premium-subscribe-btn');
  const errEl = document.getElementById('premium-card-error');
  if (!_premiumCardEl) { if (errEl) errEl.textContent = 'Stripe לא נטען — רענן את הדף'; return; }

  btn.textContent = '⏳ מעבד...';
  btn.disabled    = true;
  if (errEl) errEl.textContent = '';

  try {
    const s = window.Stripe ? window.Stripe(STRIPE_PK) : null;
    if (!s) throw new Error('Stripe not loaded');

    // Step 1: Get SetupIntent from backend
    const createSI = firebase.functions().httpsCallable('createSetupIntent');
    const { data: siData } = await createSI({ email: userEmail, name: userName });

    // Step 2: Confirm card with Stripe
    const result = await s.confirmCardSetup(siData.clientSecret, {
      payment_method: {
        card:            _premiumCardEl,
        billing_details: { name: userName || 'NitPark User', email: userEmail || undefined },
      },
    });
    if (result.error) throw new Error(result.error.message);
    const paymentMethodId = result.setupIntent.payment_method;

    // Step 3: Create subscription on backend
    const createSub = firebase.functions().httpsCallable('createPremiumSubscription');
    await createSub({ plan: _premiumPlan, paymentMethodId, email: userEmail, name: userName });

    // Step 4: Update local state
    userIsPremium = true;

    if (_premiumCardEl) { try { _premiumCardEl.unmount(); } catch(e){} _premiumCardEl = null; }
    _premiumStripeElements = null;

    closeModal();
    showToast('👑 ברוך הבא לפרימיום! ההנחה פעילה מיד.', 'success');
    await loadPremiumStatus();

  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'שגיאה — נסה שנית';
    btn.textContent = `👑 הפוך לפרימיום`;
    btn.disabled    = false;
  }
}

// ── Favorites ──────────────────────────────────────────────────────
async function toggleFavorite(listingId) {
  if (!userIsPremium) { openPremiumModal(); return; }
  const uid = myUid();
  if (!uid) return;
  const db  = firebase.firestore();
  const ref = db.collection('users').doc(uid).collection('favorites').doc(String(listingId));
  const isFav = userFavorites.has(String(listingId));
  if (isFav) {
    await ref.delete();
    userFavorites.delete(String(listingId));
    showToast('הוסר מהמועדפים', '');
  } else {
    const p = PARKINGS.find(x => String(x.id) === String(listingId));
    await ref.set({
      listingId: String(listingId),
      address: p?.address || '',
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    userFavorites.add(String(listingId));
    showToast('❤️ נשמר במועדפים!', 'success');
  }
  // Refresh the button in the detail view if open
  const btn = document.getElementById('fav-btn-' + listingId);
  if (btn) {
    const nowFav = userFavorites.has(String(listingId));
    btn.style.background = nowFav ? 'linear-gradient(135deg,#fce7f3,#f9a8d4)' : 'var(--gray-100)';
    btn.style.border     = `1.5px solid ${nowFav ? '#e91e8c' : 'var(--gray-300)'}`;
    btn.style.color      = nowFav ? '#be185d' : 'var(--gray-600)';
    btn.innerHTML        = nowFav ? '❤️ שמור במועדפים' : '🤍 הוסף למועדפים';
  }
}

async function openFavoritesModal() {
  if (!userIsPremium) { openPremiumModal(); return; }
  const uid = myUid();
  if (!uid) return;
  const db       = firebase.firestore();
  const snap     = await db.collection('users').doc(uid).collection('favorites').orderBy('addedAt', 'desc').get();
  const favItems = snap.docs.map(d => d.data());
  openModal('favorites');
  document.getElementById('modal-content').innerHTML = `
    <h2 class="modal-title">❤️ חניות מועדפות</h2>
    <p class="modal-subtitle">החניות שסימנת כמועדפות — לגישה מהירה</p>
    ${favItems.length === 0
      ? `<p style="text-align:center;color:var(--gray-500);padding:24px 0">עדיין לא הוספת מועדפים.<br/>לחץ 🤍 בעמוד חניה כדי לשמור אותה.</p>`
      : `<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          ${favItems.map(f => `
            <div onclick="closeModal();openDetail('${safeId(f.listingId)}')" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--gray-200);border-radius:14px;cursor:pointer;background:white">
              <span style="font-size:1.5rem">🅿️</span>
              <div style="flex:1;text-align:right">
                <div style="font-weight:700;font-size:.9rem">${f.address || f.listingId}</div>
                <div style="color:var(--gray-400);font-size:.78rem">לחץ לפרטים</div>
              </div>
              <span style="color:var(--gray-400)">›</span>
            </div>`).join('')}
        </div>`}
    <button class="btn-secondary" style="width:100%;margin-top:16px;padding:12px" onclick="closeModal()">סגור</button>
  `;
}

// ══════════════════════════════════════════════════════════════════
// ── STARS / CREDITS SHOP ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

let _starsStripeElements = null;
let _starsCardEl         = null;
let _selectedStarsPkg    = null;

function openShopFromBanner() { dismissStarsBanner(); showStarsShop(); }

function showStarsBanner() {
  const b = document.getElementById('stars-promo-banner');
  if (!b || sessionStorage.getItem('nitpark_stars_banner_dismissed')) return;
  b.style.transform = 'translateY(0)';
  b.style.opacity   = '1';
  b.style.pointerEvents = 'auto';
}

function dismissStarsBanner() {
  const b = document.getElementById('stars-promo-banner');
  if (b) { b.style.transform = 'translateY(120px)'; b.style.opacity = '0'; b.style.pointerEvents = 'none'; }
  sessionStorage.setItem('nitpark_stars_banner_dismissed', '1');
}

async function showStarsShop() {
  if (!isLoggedIn) { openModal('login'); return; }

  const pkgs = await loadCreditPackages();
  openModal('stars-shop');

  const content = document.getElementById('modal-content');
  if (!content) return;

  const balance = userStarBalance;
  const balanceIls = starsToIls(balance).toFixed(2);

  content.innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:2rem;margin-bottom:4px">⭐</div>
      <h2 style="font-size:1.3rem;font-weight:800;margin:0 0 4px">חנות הכוכבים</h2>
      <p style="color:var(--gray-500);font-size:.85rem;margin:0">קנה קרדיטים ושלם בחניות — חסוך עד 60%</p>
      ${balance > 0 ? `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;border-radius:12px;padding:10px 16px;margin-top:12px;display:inline-flex;align-items:center;gap:8px">
          <span style="font-size:1.1rem">⭐</span>
          <span style="font-weight:800;font-size:.95rem;color:#92400e">יתרה: ${balance} כוכבים</span>
          <span style="color:#a16207;font-size:.82rem">(= ₪${balanceIls})</span>
        </div>` : ''}
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px" id="stars-packages-list">
      ${pkgs.map(pkg => {
        const valueIls = starsToIls(pkg.stars).toFixed(0);
        return `
        <div id="spkg-${pkg.id}" onclick="selectStarsPkg('${pkg.id}')"
          style="border:2px solid var(--gray-200);border-radius:16px;padding:14px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;position:relative;transition:all .2s;background:white">
          ${pkg.badge ? `<div style="position:absolute;top:-10px;right:14px;background:${pkg.color};color:white;font-size:.72rem;font-weight:800;padding:3px 10px;border-radius:20px">${pkg.badge}</div>` : ''}
          <div style="font-size:1.6rem;min-width:36px;text-align:center">${pkg.emoji || '⭐'}</div>
          <div style="flex:1;text-align:right">
            <div style="font-weight:800;font-size:.95rem">${pkg.stars} כוכבים</div>
            <div style="font-size:.8rem;color:var(--gray-500)">ערך ₪${valueIls} · חיסכון ${pkg.bonus}%</div>
          </div>
          <div style="text-align:left">
            <div style="font-weight:800;font-size:1.05rem;color:#1e293b">₪${pkg.price}</div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div id="stars-payment-section" style="display:none">
      <div style="font-weight:700;font-size:.88rem;color:var(--gray-700);margin-bottom:8px;text-align:right">פרטי כרטיס אשראי:</div>
      <div id="stars-card-wrap" style="padding:14px;border:1.5px solid var(--gray-200);border-radius:12px;background:white;min-height:46px;margin-bottom:8px"></div>
      <div id="stars-card-error" style="color:#ef4444;font-size:.82rem;min-height:18px;text-align:center;margin-bottom:8px"></div>
    </div>

    <button id="stars-buy-btn" class="btn-modal-primary" onclick="confirmStarsPurchase()"
      style="width:100%;padding:14px;background:linear-gradient(135deg,#e91e8c,#8b5cf6);border:none;border-radius:14px;color:white;font-size:1rem;font-weight:800;cursor:pointer;opacity:.5;pointer-events:none">
      בחר חבילה לרכישה ⭐
    </button>

    <div style="text-align:center;margin-top:10px;font-size:.76rem;color:var(--gray-400)">
      1 כוכב = ₪0.40 בתשלום חניה · תוקף: 12 חודשים
    </div>
  `;
}

function selectStarsPkg(pkgId) {
  _selectedStarsPkg = (_creditPackages || DEFAULT_CREDIT_PACKAGES).find(p => p.id === pkgId);
  if (!_selectedStarsPkg) return;

  // Reset all borders
  document.querySelectorAll('[id^="spkg-"]').forEach(el => {
    el.style.border = '2px solid var(--gray-200)';
    el.style.background = 'white';
  });

  // Highlight selected
  const selected = document.getElementById('spkg-' + pkgId);
  if (selected) {
    selected.style.border = `2px solid ${_selectedStarsPkg.color}`;
    selected.style.background = `${_selectedStarsPkg.color}10`;
  }

  // Show payment section
  const paySection = document.getElementById('stars-payment-section');
  if (paySection) paySection.style.display = 'block';

  // Update buy button
  const btn = document.getElementById('stars-buy-btn');
  if (btn) {
    btn.textContent = `קנה ${_selectedStarsPkg.stars} כוכבים ב-₪${_selectedStarsPkg.price} ⭐`;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.style.background = `linear-gradient(135deg,${_selectedStarsPkg.color},${_selectedStarsPkg.color}cc)`;
  }

  // Mount Stripe card
  setTimeout(_mountStarsCard, 80);
}

function _mountStarsCard() {
  if (_starsCardEl) return;
  const s = window.Stripe ? window.Stripe(STRIPE_PK) : null;
  if (!s) return;

  const container = document.getElementById('stars-card-wrap');
  if (!container || container.offsetParent === null) {
    setTimeout(_mountStarsCard, 100);
    return;
  }

  _starsStripeElements = s.elements({
    locale: 'he',
    appearance: { theme: 'stripe', variables: { colorPrimary: '#e91e8c', fontFamily: 'Heebo, sans-serif', borderRadius: '12px' } },
  });
  _starsCardEl = _starsStripeElements.create('card', {
    hidePostalCode: true,
    style: { base: { fontSize: '16px', fontFamily: 'Heebo, sans-serif', color: '#1e293b', '::placeholder': { color: '#94a3b8' } } },
  });
  _starsCardEl.mount('#stars-card-wrap');
  _starsCardEl.on('change', e => {
    const err = document.getElementById('stars-card-error');
    if (err) err.textContent = e.error ? e.error.message : '';
  });
}

async function confirmStarsPurchase() {
  if (!_selectedStarsPkg) return;
  const btn   = document.getElementById('stars-buy-btn');
  const errEl = document.getElementById('stars-card-error');
  if (!_starsCardEl) { if (errEl) errEl.textContent = 'Stripe לא נטען — רענן את הדף'; return; }

  btn.textContent = '⏳ מעבד...';
  btn.disabled    = true;
  if (errEl) errEl.textContent = '';

  try {
    const s = window.Stripe ? window.Stripe(STRIPE_PK) : null;
    if (!s) throw new Error('Stripe not loaded');

    // Step 1: Create PaymentIntent on backend
    const purchaseFn = firebase.functions().httpsCallable('purchaseCredits');
    const { data: piData } = await purchaseFn({
      packageId:  _selectedStarsPkg.id,
      amountILS:  _selectedStarsPkg.price,
      stars:      _selectedStarsPkg.stars,
      email:      userEmail,
      name:       userName,
    });

    // Step 2: Confirm card
    const result = await s.confirmCardPayment(piData.clientSecret, {
      payment_method: {
        card:            _starsCardEl,
        billing_details: { name: userName || 'NitPark User', email: userEmail || undefined },
      },
    });
    if (result.error) throw new Error(result.error.message);

    // Step 3: Update local balance (Firestore webhook will set the real value)
    userStarBalance += _selectedStarsPkg.stars;
    updateStarsBalanceDisplay();

    if (_starsCardEl) { try { _starsCardEl.unmount(); } catch(e){} _starsCardEl = null; }
    _starsStripeElements = null;
    _selectedStarsPkg = null;

    closeModal();
    showToast(`🎉 נוספו ${piData.stars} כוכבים לחשבון שלך!`, 'success');
    await loadPremiumStatus(); // refresh balance from Firestore

  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'שגיאה — נסה שנית';
    btn.textContent = `קנה ${_selectedStarsPkg.stars} כוכבים ב-₪${_selectedStarsPkg.price} ⭐`;
    btn.disabled    = false;
  }
}

function updateStarsBalanceDisplay() {
  document.querySelectorAll('.stars-balance').forEach(el => {
    el.textContent = userStarBalance;
  });
}

async function cancelPremiumFlow() {
  if (!confirm('לבטל את מנוי הפרימיום? הוא יישאר פעיל עד סוף התקופה.')) return;
  try {
    const cancelSub = firebase.functions().httpsCallable('cancelPremiumSubscription');
    await cancelSub({});
    userPremiumCancelAtEnd = true;
    closeModal();
    showToast('המנוי בוטל — יישאר פעיל עד סוף התקופה הנוכחית', 'success');
    await loadPremiumStatus();
  } catch (err) {
    showToast('שגיאה בביטול: ' + (err.message || 'נסה שנית'), 'error');
  }
}
