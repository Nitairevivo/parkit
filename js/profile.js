// ===== PROFILE & BOOKINGS MODULE =====

function renderProfilePage() {
  const el = document.getElementById('profile-content');
  if (!el) return;

  if (!isLoggedIn) {
    el.innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:3rem;margin-bottom:16px">👤</div>
        <h3 style="margin-bottom:8px">לא מחובר</h3>
        <p style="color:var(--gray-500);margin-bottom:24px">התחבר כדי לראות את הפרופיל שלך</p>
        <button class="btn-primary" style="padding:12px 28px" onclick="openModal('login')">התחברות</button>
      </div>`;
    return;
  }

  const user    = firebase.auth().currentUser;
  const initial = (userName || 'מ')[0].toUpperCase();

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:16px;margin-bottom:32px">
      <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--pink),var(--purple));display:flex;align-items:center;justify-content:center;color:white;font-size:2rem;font-weight:800">${initial}</div>
      <div style="text-align:center">
        <div style="font-size:1.3rem;font-weight:800">${userName}</div>
        <div style="color:var(--gray-500);font-size:.9rem">${user?.email || user?.phoneNumber || ''}</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="padding:16px;background:var(--gray-50);border-radius:14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600">📋 ההזמנות שלי</span>
        <button class="btn-ghost" style="padding:6px 14px;font-size:.85rem" onclick="sidebarNav('bookings')">צפה</button>
      </div>
      <div style="padding:16px;background:var(--gray-50);border-radius:14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:600">➕ פרסם חניה</span>
        <button class="btn-ghost" style="padding:6px 14px;font-size:.85rem" onclick="sidebarNav('host')">פרסם</button>
      </div>
    </div>
    <div style="padding:16px;background:var(--gray-50);border-radius:14px;display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <span style="font-weight:600">📄 תקנון האפליקציה</span>
        <button class="btn-ghost" style="padding:6px 14px;font-size:.85rem" onclick="window.open('terms-of-service.html','_blank')">צפה</button>
      </div>
    <button class="sidebar-logout-btn" style="margin-top:24px" onclick="logoutUser()">🚪 התנתקות</button>`;
}

async function renderBookingsPage() {
  const el = document.getElementById('bookings-list');
  if (!el) return;

  if (!isLoggedIn) {
    el.innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:3rem;margin-bottom:16px">📋</div>
        <h3 style="margin-bottom:8px">לא מחובר</h3>
        <button class="btn-primary" style="padding:12px 28px" onclick="openModal('login')">התחברות</button>
      </div>`;
    return;
  }

  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400)">⏳ טוען הזמנות...</div>';

  const uid      = firebase.auth().currentUser?.uid;
  const bookings = await fetchUserBookings(uid);

  if (bookings.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 0">
        <div style="font-size:3rem;margin-bottom:16px">📭</div>
        <h3 style="margin-bottom:8px">אין הזמנות עדיין</h3>
        <p style="color:var(--gray-500);margin-bottom:24px">לחץ "חפש חניה" כדי להתחיל</p>
        <button class="btn-primary" style="padding:12px 28px" onclick="showPage('search')">חפש חניה</button>
      </div>`;
    return;
  }

  el.innerHTML = bookings.map(b => {
    const date = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleDateString('he-IL') : '—';
    const statusColor = b.status === 'confirmed' ? '#16a34a' : '#64748b';
    const statusLabel = b.status === 'confirmed' ? '✓ אושרה' : b.status;
    return `
      <div style="padding:16px;background:white;border:1px solid var(--gray-100);border-radius:14px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div style="font-weight:700;font-size:.95rem">${b.parkingTitle || '—'}</div>
          <span style="font-size:.8rem;color:${statusColor};font-weight:600">${statusLabel}</span>
        </div>
        <div style="color:var(--gray-500);font-size:.85rem;margin-bottom:4px">📍 ${b.address || '—'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span style="font-size:.82rem;color:var(--gray-400)">${date}</span>
          <span style="font-weight:800;color:var(--pink)">₪${(b.total || 0).toLocaleString()}</span>
        </div>
      </div>`;
  }).join('');
}
