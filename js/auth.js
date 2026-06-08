// ===== AUTH MODULE =====

let fbConfirmationResult = null;
let fbRecaptchaVerifier  = null;

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('atab-' + tab).classList.add('active');
  document.getElementById('auth-form-phone').style.display = tab === 'phone' ? '' : 'none';
  document.getElementById('auth-form-email').style.display = tab === 'email' ? '' : 'none';
  document.getElementById('auth-otp-step').style.display   = 'none';
}

function formatAuthPhone(inp) {
  let v = inp.value.replace(/\D/g, '');
  if (v.startsWith('972')) v = '0' + v.slice(3);
  if (v.length > 3 && v.length <= 7)  v = v.slice(0,3) + '-' + v.slice(3);
  else if (v.length > 7)              v = v.slice(0,3) + '-' + v.slice(3,10);
  inp.value = v;
}

function shakeInput(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.animation = 'shake .4s ease';
  setTimeout(() => el.style.animation = '', 400);
}

function initRecaptcha() {
  try {
    if (fbRecaptchaVerifier) { try { fbRecaptchaVerifier.clear(); } catch(e) {} fbRecaptchaVerifier = null; }
  } catch(e) {}

  const old = document.getElementById('recaptcha-container');
  if (old) old.remove();
  const fresh = document.createElement('div');
  fresh.id = 'recaptcha-container';
  document.body.appendChild(fresh);

  try {
    fbRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => { fbRecaptchaVerifier = null; }
    });
    return fbRecaptchaVerifier.render();
  } catch(e) {
    console.error('[auth] reCAPTCHA init:', e.code || e.message);
    fbRecaptchaVerifier = null;
    return Promise.resolve(null);
  }
}

async function submitAuth(method) {
  if (method === 'google') { await loginWithGoogle(); return; }
  if (method === 'apple')  { await loginWithApple();  return; }

  if (method === 'phone') {
    const raw = document.getElementById('auth-phone').value.replace(/\D/g, '');
    if (raw.length < 9) { shakeInput('auth-phone'); return; }

    userPhone      = document.getElementById('auth-phone').value;
    const intl     = '+972' + (raw.startsWith('0') ? raw.slice(1) : raw);
    const btn      = document.querySelector('#auth-form-phone .auth-submit-btn');
    btn.textContent = '📤 שולח קוד...';
    btn.disabled    = true;

    try {
      await initRecaptcha();
      if (!fbRecaptchaVerifier) throw { code: 'auth/captcha-check-failed' };
      fbConfirmationResult = await firebase.auth().signInWithPhoneNumber(intl, fbRecaptchaVerifier);
      btn.textContent = 'המשך עם SMS ←';
      btn.disabled    = false;
      showOtpStep(`שלחנו SMS עם קוד ל-${userPhone} 📱`);
    } catch (err) {
      btn.textContent = 'המשך עם SMS ←';
      btn.disabled    = false;
      fbRecaptchaVerifier  = null;
      fbConfirmationResult = null;

      const KNOWN = {
        'auth/invalid-phone-number':  'מספר טלפון לא תקין — נסה שוב',
        'auth/too-many-requests':     'יותר מדי ניסיונות — המתן כמה דקות',
        'auth/operation-not-allowed': 'SMS לא מופעל — פנה לתמיכה',
        'auth/unauthorized-domain':   'הדומיין לא מאושר',
      };
      showToast(KNOWN[err.code] || 'שגיאה בשליחת SMS — נסה שוב', 'error');
    }

  } else if (method === 'email') {
    const email = document.getElementById('auth-email').value.trim();
    if (!email || !email.includes('@')) { shakeInput('auth-email'); return; }
    userEmail = email;
    showToast('שליחת קוד לאימייל — בקרוב', 'success');
    showOtpStep(`הכנס את הקוד שנשלח ל-${email} 📧`);
  }
}

function showOtpStep(desc) {
  document.getElementById('auth-form-phone').style.display  = 'none';
  document.getElementById('auth-form-email').style.display  = 'none';
  document.querySelectorAll('.auth-tab').forEach(t => t.style.display = 'none');
  document.getElementById('otp-desc').textContent           = desc;
  document.getElementById('auth-otp-step').style.display    = 'block';
  document.querySelector('.otp-box').focus();
}

function otpNext(inp, idx) {
  const boxes = document.querySelectorAll('.otp-box');
  const v = inp.value.replace(/\D/g, '').slice(-1);
  inp.value = v;
  if (v && idx < 5) boxes[idx + 1].focus();
  if (idx === 5 && v) verifyOtp();
}

function otpBack(inp, idx, e) {
  if (e.key === 'Backspace' && !inp.value && idx > 0) {
    const boxes = document.querySelectorAll('.otp-box');
    boxes[idx - 1].focus();
  }
}

async function resendOtp() {
  document.querySelectorAll('.otp-box').forEach(b => b.value = '');
  document.querySelector('.otp-box').focus();

  if (userPhone) {
    fbRecaptchaVerifier  = null;
    fbConfirmationResult = null;
    try {
      await initRecaptcha();
      const raw  = userPhone.replace(/\D/g, '');
      const intl = '+972' + (raw.startsWith('0') ? raw.slice(1) : raw);
      fbConfirmationResult = await firebase.auth().signInWithPhoneNumber(intl, fbRecaptchaVerifier);
      showToast('קוד חדש נשלח 📱', 'success');
    } catch(e) {
      showToast('שגיאה בשליחה — נסה שוב', 'error');
    }
  }
}

async function verifyOtp() {
  const boxes = document.querySelectorAll('.otp-box');
  const code  = Array.from(boxes).map(b => b.value).join('');
  if (code.length < 6) { showToast('הכנס 6 ספרות', 'error'); return; }

  if (!fbConfirmationResult) {
    showToast('שגיאה — שלח את הקוד מחדש', 'error');
    return;
  }

  const btn      = document.querySelector('#auth-otp-step .auth-submit-btn');
  btn.textContent = '⏳ מאמת...';
  btn.disabled    = true;

  try {
    const result = await fbConfirmationResult.confirm(code);
    const user   = result.user;
    sessionStorage.setItem('nitpark_user',  user.uid);
    sessionStorage.setItem('nitpark_phone', user.phoneNumber || userPhone);
    isLoggedIn = true;
    document.getElementById('auth-screen').style.display = 'none';
    await saveUserProfile(user.uid, { phone: user.phoneNumber || userPhone });
    startOnboarding();
  } catch (err) {
    btn.textContent = 'אמת קוד ✓';
    btn.disabled    = false;
    if (err.code === 'auth/invalid-verification-code') {
      showToast('קוד שגוי — נסה שוב', 'error');
      boxes.forEach(b => { b.value = ''; b.style.borderColor = '#ef4444'; });
      boxes[0].focus();
      setTimeout(() => boxes.forEach(b => b.style.borderColor = ''), 1500);
    } else if (err.code === 'auth/code-expired') {
      showToast('הקוד פג תוקף — לחץ "שלח שוב"', 'error');
    } else {
      showToast('שגיאה — נסה שוב', 'error');
    }
  }
}

async function loginWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await firebase.auth().signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('שגיאה בכניסה עם Google', 'error');
    }
  }
}

async function loginWithApple() {
  try {
    const provider = new firebase.auth.OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    await firebase.auth().signInWithPopup(provider);
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      showToast('שגיאה בכניסה עם Apple', 'error');
    }
  }
}

async function loginWithGoogleModal() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await firebase.auth().signInWithPopup(provider);
    userName   = result.user.displayName || result.user.email?.split('@')[0] || 'משתמש';
    isLoggedIn = true;
    closeModal();
    updateNavbar();
    showToast(`ברוך הבא, ${userName}! 👋`, 'success');
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') showToast('שגיאה בכניסה עם Google', 'error');
  }
}

async function loginWithEmail() {
  const overlay  = document.getElementById('modal-overlay');
  const isSignup = !!overlay.querySelector('[placeholder="שם פרטי"]');
  const inputs   = overlay.querySelectorAll('input');

  let firstName = '', email = '', password = '';
  inputs.forEach(inp => {
    if (inp.placeholder === 'שם פרטי') firstName = inp.value.trim();
    if (inp.type === 'email')           email     = inp.value.trim();
    if (inp.type === 'password')        password  = inp.value;
  });

  if (isSignup && !firstName)                          { showToast('נא להכניס שם פרטי', 'error'); return; }
  if (!email || !email.includes('@'))                  { showToast('נא להכניס אימייל תקין', 'error'); return; }
  if (!password || (isSignup && password.length < 8)) {
    showToast(isSignup ? 'סיסמה חייבת להכיל לפחות 8 תווים' : 'נא להכניס סיסמה', 'error'); return;
  }

  const btn      = overlay.querySelector('.btn-modal-primary');
  const origText = btn.textContent;
  btn.textContent = '⏳ מתחבר...';
  btn.disabled    = true;

  try {
    if (isSignup) {
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: firstName });
      await saveUserProfile(cred.user.uid, { displayName: firstName, email });
      userName = firstName;
    } else {
      const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
      userName = cred.user.displayName || email.split('@')[0];
    }
    isLoggedIn = true;
    closeModal();
    updateNavbar();
    showToast(`ברוך הבא, ${userName}! 👋`, 'success');
  } catch (err) {
    btn.textContent = origText;
    btn.disabled    = false;
    const MSGS = {
      'auth/email-already-in-use': 'האימייל כבר רשום — נסה להתחבר',
      'auth/user-not-found':       'משתמש לא נמצא',
      'auth/wrong-password':       'סיסמה שגויה',
      'auth/invalid-email':        'אימייל לא תקין',
      'auth/weak-password':        'סיסמה חלשה (מינ׳ 6 תווים)',
      'auth/invalid-credential':   'אימייל או סיסמה שגויים',
      'auth/too-many-requests':    'יותר מדי ניסיונות — נסה מאוחר יותר',
    };
    showToast(MSGS[err.code] || 'שגיאה — נסה שוב', 'error');
  }
}

async function logoutUser() {
  try {
    await firebase.auth().signOut();
    sessionStorage.clear();
    isLoggedIn = false;
    userName   = '';
    updateNavbar();
    showToast('התנתקת בהצלחה', 'success');
    document.getElementById('auth-screen').style.display = 'flex';
  } catch (err) {
    showToast('שגיאה בהתנתקות', 'error');
  }
}
