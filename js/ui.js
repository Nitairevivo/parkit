// ===== UI MODULE =====
// Navigation, navbar, toast, modals, sidebar

// ── Page Navigation ───────────────────────────────────────────────────────────

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (!page) return;
  page.classList.add('active');
  currentPage = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const slink = document.getElementById('slink-' + name);
  if (slink) slink.classList.add('active');

  if (name === 'search')   { renderSearchResults(filteredListings); initLeafletMap(); setTimeout(() => { renderLeafletMarkers(filteredListings); if (leafletMap) leafletMap.invalidateSize(); }, 50); }
  if (name === 'host')     renderHostSummary();
  if (name === 'profile')  renderProfilePage();
  if (name === 'bookings') renderBookingsPage();
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function sidebarNav(page) { showPage(page); closeSidebar(); }
function toggleMenu()     { toggleSidebar(); }
function mbnNav(page)     { sidebarNav(page); }

function toggleBookingCard() {
  document.getElementById('booking-card')?.classList.toggle('expanded');
}

// ── Navbar ────────────────────────────────────────────────────────────────────

function updateNavbar() {
  const userCard     = document.getElementById('sidebar-user-card');
  const authDiv      = document.getElementById('sidebar-auth');
  const topbarActions = document.getElementById('topbar-actions');

  if (isLoggedIn) {
    const initial = (userName || 'מ')[0].toUpperCase();
    if (userCard) userCard.innerHTML = `
      <div class="sidebar-avatar">${initial}</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${userName || 'משתמש'}</div>
        <div class="sidebar-user-sub"><span class="sidebar-status-dot"></span> מחובר</div>
      </div>`;
    if (authDiv) authDiv.innerHTML = `
      <button class="sidebar-logout-btn" onclick="logoutUser()">🚪 התנתקות</button>`;
    if (topbarActions) topbarActions.innerHTML = `
      <button class="topbar-avatar" onclick="sidebarNav('profile')">${initial}</button>`;
  } else {
    if (userCard) userCard.innerHTML = `
      <div style="text-align:center;width:100%">
        <div style="font-size:.85rem;color:var(--gray-500);margin-bottom:4px">לא מחובר</div>
      </div>`;
    if (authDiv) authDiv.innerHTML = `
      <button class="btn-primary" onclick="openModal('signup')">הצטרפות חינם</button>
      <button class="btn-ghost"   onclick="openModal('login')">התחברות</button>`;
    if (topbarActions) topbarActions.innerHTML = `
      <button class="btn-primary" style="padding:7px 14px;font-size:.82rem" onclick="openModal('signup')">הצטרף</button>`;
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className   = 'toast' + (type ? ' ' + type : '');
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(type) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  overlay.classList.add('open');

  if (type === 'login') {
    content.innerHTML = `
      <h2 class="modal-title">ברוך הבא חזרה</h2>
      <p class="modal-subtitle">התחבר לחשבון NitPark שלך</p>
      <div class="modal-form">
        <button class="btn-social-login" onclick="loginWithGoogleModal()">🌐 המשך עם Google</button>
        <div class="modal-divider">או</div>
        <input class="modal-input" type="email"    placeholder="כתובת אימייל" autocomplete="email" />
        <input class="modal-input" type="password" placeholder="סיסמה" autocomplete="current-password" />
        <button class="btn-modal-primary" onclick="loginWithEmail()">התחברות</button>
      </div>
      <div class="modal-switch">אין לך חשבון? <a onclick="openModal('signup')">הרשם חינם</a></div>`;

  } else if (type === 'signup') {
    content.innerHTML = `
      <h2 class="modal-title">הצטרף ל-NitPark</h2>
      <p class="modal-subtitle">הרשמה חינמית · בלי כרטיס אשראי</p>
      <div class="modal-form">
        <button class="btn-social-login" onclick="loginWithGoogleModal()">🌐 הרשמה עם Google</button>
        <div class="modal-divider">או</div>
        <div style="display:flex;gap:10px">
          <input class="modal-input" placeholder="שם פרטי"   style="flex:1" autocomplete="given-name" />
          <input class="modal-input" placeholder="שם משפחה"  style="flex:1" autocomplete="family-name" />
        </div>
        <input class="modal-input" type="email"    placeholder="כתובת אימייל" autocomplete="email" />
        <input class="modal-input" type="tel"      placeholder="מספר טלפון"   autocomplete="tel" />
        <input class="modal-input" type="password" placeholder="סיסמה (מינ׳ 8 תווים)" autocomplete="new-password" />
        <button class="btn-modal-primary" onclick="loginWithEmail()">הצטרף חינם</button>
      </div>
      <div class="modal-switch">כבר יש לך חשבון? <a onclick="openModal('login')">התחבר</a></div>`;

  } else if (type === 'terms') {
    content.innerHTML = `
      <h2 class="modal-title">תקנון השימוש</h2>
      <div style="color:var(--gray-600);font-size:.9rem;line-height:1.8;max-height:400px;overflow-y:auto">
        <p><strong>1. כללי</strong><br/>NitPark היא פלטפורמת תיווך בין בעלי חניות לנהגים. NitPark אינה צד לעסקה.</p>
        <p><strong>2. אחריות</strong><br/>המשתמש אחראי לוודא שיש לו זכות חוקית להשכיר את החניה. NitPark מספקת ביטוח לנזקי רכב ישירים בזמן חניה.</p>
        <p><strong>3. תשלומים</strong><br/>התשלום מעובד ע"י Stripe. NitPark גובה עמלה של 20% מהמשכיר.</p>
        <p><strong>4. ביטולים</strong><br/>עד 24 שעות לפני — החזר מלא. פחות מ-24 שעות — 50%. לאחר תחילה — אין החזר.</p>
        <p><strong>5. רגולציה</strong><br/>השכרת חניה בבית משותף מחייבת הסכמת הדיירים ו/או הצמדה לדירה. ההכנסה חייבת במס.</p>
      </div>`;

  } else if (type === 'privacy') {
    content.innerHTML = `
      <h2 class="modal-title">מדיניות פרטיות</h2>
      <div style="color:var(--gray-600);font-size:.9rem;line-height:1.8;max-height:400px;overflow-y:auto">
        <p><strong>מה אנו אוספים:</strong> שם, אימייל, טלפון, מיקום, היסטוריית הזמנות.</p>
        <p><strong>שימוש במידע:</strong> לצורך אספקת השירות, שיפורו, ותמיכה.</p>
        <p><strong>שיתוף:</strong> לא מוכרים מידע אישי לצדדים שלישיים.</p>
        <p><strong>אבטחה:</strong> הצפנה מלאה, פרטי תשלום מנוהלים ע"י Stripe בלבד.</p>
        <p><strong>זכויות:</strong> ניתן לבקש מחיקת נתונים בכל עת.</p>
      </div>`;
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeBooking(); }
});
