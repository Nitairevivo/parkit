// ===== MAIN APP =====
// Global state & initialization

let userName   = '';
let userPhone  = '';
let userEmail  = '';
let isLoggedIn = false;

let currentPage      = 'home';
let filteredListings = [...PARKINGS];

// ── PWA Install ───────────────────────────────────────────────────────────────

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

// ── Firebase Auth Listener ────────────────────────────────────────────────────

function initApp() {
  updateNavbar();

  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      isLoggedIn = true;
      userName   = user.displayName || user.email?.split('@')[0] || sessionStorage.getItem('nitpark_name') || 'משתמש';
      userEmail  = user.email || '';

      const isNewUser         = !localStorage.getItem('nitpark_onboarded_' + user.uid);
      const onboardingVisible = document.getElementById('onboarding-screen').style.display === 'flex';

      sessionStorage.setItem('nitpark_user', user.uid);
      sessionStorage.setItem('nitpark_name', userName);

      document.getElementById('auth-screen').style.display = 'none';

      // אם האונבורדינג כבר פועל — לא להפריע לו
      if (!onboardingVisible) {
        if (isNewUser) {
          // משתמש חדש — הצג אונבורדינג ושמור שהוא כבר עשה אונבורדינג
          localStorage.setItem('nitpark_onboarded_' + user.uid, '1');
          startOnboarding();
        } else {
          // משתמש חוזר — ישר לאפליקציה
          document.getElementById('onboarding-screen').style.display = 'none';
        }
      }

      updateNavbar();
    } else {
      isLoggedIn = false;
      userName   = '';
      document.getElementById('auth-screen').style.display = 'flex';
      updateNavbar();
    }
  });
}

// ── DOM Ready ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  initApp();
  showPage('home');
  await loadParkings();
  renderHomeListings();
  updateEarningsPreview();

  const dt = document.getElementById('searchDate');
  if (dt) {
    const d = new Date(Date.now() + 3600000);
    dt.value = d.toISOString().slice(0, 16);
  }

  window.addEventListener('scroll', () => {
    const tb = document.getElementById('topbar');
    if (tb) tb.classList.toggle('scrolled', window.scrollY > 20);
  });

  const priceHour = document.getElementById('h-price-hour');
  if (priceHour) priceHour.addEventListener('input', updateEarningsPreview);
});

// ── Load Parkings from Firestore ──────────────────────────────────────────────

async function loadParkings() {
  try {
    const data = await fetchParkings();
    PARKINGS.length = 0;
    if (data && data.length > 0) {
      data.forEach(p => PARKINGS.push(p));
    }
    filteredListings = [...PARKINGS];
  } catch (err) {
    console.error('[app] loadParkings error:', err.message);
  }
}
