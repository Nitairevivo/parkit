// ===== STATE =====
let currentPage = 'home';
let currentParking = null;
let filteredListings = [...PARKINGS];
let minRating = 0;
let selectedType = 'פרטית בבניין';
let hostStep = 1;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  showPage('home');
  renderHomeListings();
  updateEarningsPreview();

  // Set default datetime to now + 1hr
  const dt = document.getElementById('searchDate');
  if (dt) {
    const d = new Date(Date.now() + 3600000);
    dt.value = d.toISOString().slice(0, 16);
  }

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
  });

  // Price input live update
  const priceHour = document.getElementById('h-price-hour');
  if (priceHour) priceHour.addEventListener('input', updateEarningsPreview);
});

// ===== NAVIGATION =====
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (!page) return;
  page.classList.add('active');
  currentPage = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'search') renderSearchResults(filteredListings);
  if (name === 'host') renderHostSummary();
}

function toggleMenu() {
  const m = document.getElementById('mobileMenu');
  m.classList.toggle('open');
}

// ===== HOME LISTINGS =====
function renderHomeListings() {
  const el = document.getElementById('home-listings');
  if (!el) return;
  const top = PARKINGS.slice(0, 6);
  el.innerHTML = top.map(p => renderCard(p)).join('');
}

function renderCard(p) {
  return `
    <div class="listing-card" onclick="openDetail(${p.id})">
      <div class="listing-img">
        <div class="listing-img-bg">${p.emoji}</div>
        <div class="listing-badge">${p.type}</div>
      </div>
      <div class="listing-body">
        <div class="listing-rating">
          <span class="stars">★★★★★</span>
          <span>${p.rating} (${p.reviews_count} ביקורות)</span>
        </div>
        <div class="listing-title">${p.title}</div>
        <div class="listing-location">📍 ${p.address}</div>
        <div class="listing-tags">
          ${p.tags.map(t => `<span class="listing-tag">${t}</span>`).join('')}
        </div>
        <div class="listing-footer">
          <div class="listing-price">₪${p.price_hour}<span>/שעה</span></div>
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
  if (q) {
    filteredListings = PARKINGS.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q)
    );
  } else {
    filteredListings = [...PARKINGS];
  }
  showPage('search');
}

function filterListings() {
  const min = parseFloat(document.getElementById('priceMin')?.value || 0);
  const max = parseFloat(document.getElementById('priceMax')?.value || 9999);
  filteredListings = PARKINGS.filter(p =>
    p.price_hour >= min && p.price_hour <= max && p.rating >= minRating
  );
  renderSearchResults(filteredListings);
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

function renderSearchResults(list) {
  const el = document.getElementById('search-results');
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = `${list.length} חניות נמצאו`;
  if (!el) return;
  if (list.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400)"><div style="font-size:3rem;margin-bottom:16px">🔍</div><p>לא נמצאו חניות. נסה חיפוש אחר.</p></div>';
    return;
  }
  el.innerHTML = list.map(p => `
    <div class="listing-card-horizontal" onclick="openDetail(${p.id})">
      <div class="listing-card-h-img">
        ${p.emoji}
        <div class="listing-badge" style="position:absolute;top:10px;right:10px">${p.type}</div>
      </div>
      <div class="listing-card-h-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div class="listing-title">${p.title}</div>
          <div class="listing-price">₪${p.price_hour}<span>/שעה</span></div>
        </div>
        <div class="listing-location">📍 ${p.address}</div>
        <div class="listing-rating" style="margin:8px 0">
          <span class="stars">★★★★★</span>
          <span style="font-size:.82rem;color:var(--gray-600)">${p.rating} · ${p.reviews_count} ביקורות</span>
        </div>
        <div class="listing-tags">
          ${p.tags.map(t => `<span class="listing-tag">${t}</span>`).join('')}
        </div>
        <div class="listing-card-h-footer">
          <div style="font-size:.85rem;color:var(--gray-400)">📅 יום: ₪${p.price_day} · 🗓️ חודשי: ₪${p.price_month}</div>
          <button class="btn-view">הזמן</button>
        </div>
      </div>
    </div>
  `).join('');

  // Map pins
  renderMapPins(list);
}

let currentView = 'list';
function setView(view, btn) {
  currentView = view;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('search-results').style.display = view === 'list' ? '' : 'none';
  document.getElementById('map-view').style.display = view === 'map' ? '' : 'none';
  if (view === 'map') renderMapPins(filteredListings);
}

function renderMapPins(list) {
  const pinsEl = document.getElementById('map-pins');
  const sideList = document.getElementById('map-side-list');
  if (!pinsEl) return;
  pinsEl.innerHTML = list.map(p => `
    <div class="map-pin" style="top:${p.lat_pct}%;right:${p.lng_pct}%" onclick="openDetail(${p.id})">
      ₪${p.price_hour}
    </div>
  `).join('');
  if (sideList) {
    sideList.innerHTML = list.map(p => `
      <div class="listing-card" onclick="openDetail(${p.id})" style="margin:0">
        <div class="listing-img" style="height:120px"><div class="listing-img-bg">${p.emoji}</div></div>
        <div class="listing-body" style="padding:12px">
          <div class="listing-title" style="font-size:.9rem">${p.title}</div>
          <div class="listing-location" style="font-size:.8rem">📍 ${p.city}</div>
          <div class="listing-price" style="font-size:1rem;margin-top:8px">₪${p.price_hour}<span>/שעה</span></div>
        </div>
      </div>
    `).join('');
  }
}

// ===== DETAIL PAGE =====
function openDetail(id) {
  currentParking = PARKINGS.find(p => p.id === id);
  if (!currentParking) return;
  const p = currentParking;

  document.getElementById('detail-content').innerHTML = `
    <div class="detail-header">
      <div class="detail-breadcrumb">
        <a href="#" onclick="showPage('home')">דף הבית</a> ›
        <a href="#" onclick="showPage('search')">חיפוש</a> ›
        ${p.title}
      </div>
      <h1 class="detail-title">${p.title}</h1>
      <div class="detail-meta">
        <div class="detail-rating">
          <span style="color:#f59e0b;font-size:1.1rem">★</span>
          <span>${p.rating}</span>
        </div>
        <span class="detail-reviews">${p.reviews_count} ביקורות</span>
        <span style="color:var(--gray-400)">·</span>
        <span style="color:var(--gray-600);font-size:.9rem">📍 ${p.address}</span>
      </div>
    </div>

    <div class="gallery">
      <div class="listing-img gallery-img main" style="background:linear-gradient(135deg,#e0e7ff,#fce7f3)">${p.emoji}</div>
      <div class="listing-img gallery-img" style="background:linear-gradient(135deg,#fce7f3,#ede9fe);font-size:2rem">🚗</div>
      <div class="listing-img gallery-img" style="background:linear-gradient(135deg,#d1fae5,#a7f3d0);font-size:2rem">🏙️</div>
    </div>

    <div class="detail-layout">
      <div class="detail-main">
        <div class="detail-section">
          <h3>על החניה</h3>
          <p style="color:var(--gray-600);line-height:1.8">${p.description}</p>
        </div>

        <div class="detail-section">
          <h3>שירותים ומאפיינים</h3>
          <div class="amenities-grid">
            ${p.amenities.map(a => `<div class="amenity-item">${a}</div>`).join('')}
          </div>
        </div>

        <div class="detail-section">
          <h3>המארח</h3>
          <div class="host-info">
            <div class="host-avatar" style="background:${p.host.avatar}">${p.host.letter}</div>
            <div>
              <div class="host-name">${p.host.name}</div>
              <div class="host-since">חבר מ-${p.host.since}</div>
              <div class="host-rating">★ ${p.host.rating} · ${p.host.reviews} ביקורות</div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>ביקורות (${p.reviews_count})</h3>
          <div class="reviews-list">
            ${p.reviews.map(r => `
              <div class="review-item">
                <div class="review-header">
                  <div class="review-avatar" style="background:${r.color}">${r.letter}</div>
                  <div>
                    <div class="review-name">${r.name}</div>
                    <div class="review-date">${r.date}</div>
                  </div>
                  <div class="review-stars" style="margin-right:auto">${'★'.repeat(r.stars)}</div>
                </div>
                <p class="review-text">${r.text}</p>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="detail-section">
          <h3>מדיניות ביטול</h3>
          <p style="color:var(--gray-600);line-height:1.8">ביטול עד 24 שעות לפני ההזמנה — החזר מלא. ביטול בפחות מ-24 שעות — החזר 50%. ביטול לאחר תחילת ההזמנה — ללא החזר.</p>
        </div>
      </div>

      <div class="detail-sidebar">
        <div class="booking-card" id="booking-card">
          <div class="booking-price">₪${p.price_hour} <span>לשעה</span></div>
          <div class="booking-rating">★ ${p.rating} · ${p.reviews_count} ביקורות</div>

          <div class="booking-form">
            <div class="booking-field">
              <label>תאריך ושעת כניסה</label>
              <input type="datetime-local" id="book-start" onchange="calcTotal()" />
            </div>
            <div class="booking-field">
              <label>תאריך ושעת יציאה</label>
              <input type="datetime-local" id="book-end" onchange="calcTotal()" />
            </div>
          </div>

          <div class="booking-summary" id="booking-summary">
            <div class="bs-row"><span>מחיר לשעה</span><span>₪${p.price_hour}</span></div>
            <div class="bs-row"><span>מספר שעות</span><span id="bs-hours">—</span></div>
            <div class="bs-row"><span>עמלת שירות</span><span id="bs-fee">—</span></div>
            <div class="bs-row total"><span>סה"כ לתשלום</span><span id="bs-total">—</span></div>
          </div>

          <button class="btn-book" onclick="openBookingSheet()">הזמן עכשיו</button>
          <p class="booking-note">לא תחויב עד לאישור ✓</p>
        </div>

        <div style="background:var(--gray-50);border-radius:14px;padding:20px;margin-top:16px">
          <h4 style="font-size:.9rem;font-weight:700;margin-bottom:14px">מחירים</h4>
          <div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">שעתי</span><span style="font-weight:700">₪${p.price_hour}/שעה</span></div>
          <div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">יומי</span><span style="font-weight:700">₪${p.price_day}/יום</span></div>
          <div class="bs-row"><span style="color:var(--gray-600);font-size:.88rem">חודשי</span><span style="font-weight:700">₪${p.price_month}/חודש</span></div>
        </div>
      </div>
    </div>
  `;

  // Set default booking times
  const now = new Date();
  const end = new Date(now.getTime() + 7200000);
  const startEl = document.getElementById('book-start');
  const endEl = document.getElementById('book-end');
  if (startEl) startEl.value = now.toISOString().slice(0,16);
  if (endEl) endEl.value = end.toISOString().slice(0,16);
  calcTotal();

  showPage('detail');
}

function calcTotal() {
  const start = new Date(document.getElementById('book-start')?.value);
  const end = new Date(document.getElementById('book-end')?.value);
  if (!start || !end || isNaN(start) || isNaN(end) || end <= start) return;
  const hours = Math.max(1, Math.ceil((end - start) / 3600000));
  const rate = currentParking?.price_hour || 15;
  const subtotal = hours * rate;
  const fee = Math.round(subtotal * 0.15);
  const total = subtotal + fee;
  document.getElementById('bs-hours').textContent = hours + ' שעות';
  document.getElementById('bs-fee').textContent = '₪' + fee;
  document.getElementById('bs-total').textContent = '₪' + total;
}

// ===== BOOKING SHEET =====
function openBookingSheet() {
  const p = currentParking;
  if (!p) return;
  const start = document.getElementById('book-start')?.value;
  const end = document.getElementById('book-end')?.value;
  const hours = start && end ? Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 3600000)) : 2;
  const total = hours * p.price_hour + Math.round(hours * p.price_hour * 0.15);

  document.getElementById('booking-sheet-content').innerHTML = `
    <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:20px">אישור הזמנה</h2>
    <div style="display:flex;gap:16px;align-items:center;background:var(--gray-50);border-radius:14px;padding:16px;margin-bottom:24px">
      <div style="font-size:2.5rem">${p.emoji}</div>
      <div>
        <div style="font-weight:700;font-size:1rem">${p.title}</div>
        <div style="font-size:.85rem;color:var(--gray-600)">📍 ${p.address}</div>
        <div style="font-size:.85rem;color:var(--pink);font-weight:700;margin-top:4px">₪${total} לתשלום</div>
      </div>
    </div>

    <div style="margin-bottom:20px">
      <label style="font-size:.8rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:8px">פרטי תשלום</label>
      <input class="modal-input" placeholder="שם על הכרטיס" style="margin-bottom:10px" />
      <input class="modal-input" placeholder="מספר כרטיס אשראי" style="margin-bottom:10px" />
      <div style="display:flex;gap:10px">
        <input class="modal-input" placeholder="MM/YY" style="flex:1" />
        <input class="modal-input" placeholder="CVV" style="flex:1" />
      </div>
    </div>

    <div style="background:var(--gray-50);border-radius:12px;padding:16px;margin-bottom:20px">
      <div class="bs-row"><span>שעות</span><span>${hours}</span></div>
      <div class="bs-row"><span>מחיר לשעה</span><span>₪${p.price_hour}</span></div>
      <div class="bs-row"><span>עמלת שירות (15%)</span><span>₪${Math.round(hours * p.price_hour * 0.15)}</span></div>
      <div class="bs-row total"><span><strong>סה"כ</strong></span><span><strong>₪${total}</strong></span></div>
    </div>

    <button class="btn-book" onclick="confirmBooking()">
      🔒 אשר תשלום ₪${total}
    </button>
    <p style="text-align:center;font-size:.78rem;color:var(--gray-400);margin-top:12px">
      🔒 מאובטח ע"י Stripe · לא נשמר מידע כרטיס
    </p>
  `;

  document.getElementById('booking-sheet').classList.add('open');
  document.getElementById('booking-overlay').classList.add('open');
}

function closeBooking() {
  document.getElementById('booking-sheet').classList.remove('open');
  document.getElementById('booking-overlay').classList.remove('open');
}

function confirmBooking() {
  closeBooking();
  setTimeout(() => {
    openModal('success');
    document.getElementById('modal-content').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:4rem;margin-bottom:20px">🎉</div>
        <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:10px">ההזמנה אושרה!</h2>
        <p style="color:var(--gray-600);line-height:1.7;margin-bottom:24px">
          ה${currentParking?.title} הוזמנה בהצלחה.<br/>
          שלחנו לך אישור + קוד גישה ב-SMS.
        </p>
        <div style="background:var(--gray-50);border-radius:14px;padding:20px;margin-bottom:24px;text-align:center">
          <div style="font-size:.8rem;color:var(--gray-600);margin-bottom:8px">קוד גישה לשער</div>
          <div style="font-size:2.5rem;font-weight:900;color:var(--pink);letter-spacing:6px">4721</div>
        </div>
        <button class="btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="closeModal();showPage('home')">
          לדף הבית
        </button>
      </div>
    `;
  }, 300);
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

function updateEarningsPreview() {
  const ph = parseFloat(document.getElementById('h-price-hour')?.value || 15);
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
  const ph = document.getElementById('h-price-hour')?.value || '15';
  const pd = document.getElementById('h-price-day')?.value || '—';
  const pm = document.getElementById('h-price-month')?.value || '—';
  const open = document.getElementById('h-open')?.value || '08:00';
  const close = document.getElementById('h-close')?.value || '22:00';
  el.innerHTML = `
    <div class="summary-row"><span>כתובת</span><span>${addr}</span></div>
    <div class="summary-row"><span>סוג חניה</span><span>${selectedType}</span></div>
    <div class="summary-row"><span>מחיר לשעה</span><span>₪${ph}</span></div>
    <div class="summary-row"><span>מחיר יומי</span><span>${pd !== '—' ? '₪'+pd : '—'}</span></div>
    <div class="summary-row"><span>מחיר חודשי</span><span>${pm !== '—' ? '₪'+pm : '—'}</span></div>
    <div class="summary-row"><span>שעות זמינות</span><span>${open} – ${close}</span></div>
    <div class="summary-row"><span>עמלת ParkIt</span><span>20%</span></div>
  `;
}

function publishListing() {
  const agreed = document.getElementById('agree-terms')?.checked;
  if (!agreed) { showToast('נא לאשר את התנאים', 'error'); return; }
  openModal('publish-success');
  document.getElementById('modal-content').innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:4rem;margin-bottom:20px">🚀</div>
      <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:12px">החניה הוגשה לאישור!</h2>
      <p style="color:var(--gray-600);line-height:1.7;margin-bottom:24px">
        קיבלנו את הבקשה שלך. הצוות שלנו יבדוק ויאשר תוך 24-48 שעות.<br/>
        תקבל SMS כשהחניה תהיה פעילה.
      </p>
      <div style="background:var(--pink-light);border-radius:14px;padding:20px;margin-bottom:24px">
        <div style="font-size:.85rem;color:var(--pink);font-weight:700">הכנסה משוערת לאחר אישור</div>
        <div style="font-size:2rem;font-weight:900;color:var(--pink);margin-top:8px" id="expected-earn">מחשב...</div>
      </div>
      <button class="btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="closeModal();showPage('home')">
        מעולה!
      </button>
    </div>
  `;
  const ph = parseFloat(document.getElementById('h-price-hour')?.value || 15);
  const earn = Math.round(ph * 8 * 22 * 0.8 * 0.75);
  setTimeout(() => {
    const el = document.getElementById('expected-earn');
    if (el) el.textContent = '₪' + earn.toLocaleString() + '/חודש';
  }, 100);
}

function previewImages(input) {
  const grid = document.getElementById('image-preview');
  if (!grid) return;
  grid.innerHTML = '';
  Array.from(input.files).slice(0, 6).forEach(file => {
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
    content.innerHTML = `
      <h2 class="modal-title">ברוך הבא חזרה</h2>
      <p class="modal-subtitle">התחבר לחשבון ParkIt שלך</p>
      <div class="modal-form">
        <button class="btn-social-login">🌐 המשך עם Google</button>
        <button class="btn-social-login">🔵 המשך עם Facebook</button>
        <div class="modal-divider">או</div>
        <input class="modal-input" type="email" placeholder="כתובת אימייל" />
        <input class="modal-input" type="password" placeholder="סיסמה" />
        <button class="btn-modal-primary" onclick="fakeLogin()">התחברות</button>
      </div>
      <div class="modal-switch">
        אין לך חשבון? <a onclick="openModal('signup')">הרשם חינם</a>
      </div>
    `;
  } else if (type === 'signup') {
    content.innerHTML = `
      <h2 class="modal-title">הצטרף ל-ParkIt</h2>
      <p class="modal-subtitle">הרשמה חינמית · בלי כרטיס אשראי</p>
      <div class="modal-form">
        <button class="btn-social-login">🌐 הרשמה עם Google</button>
        <div class="modal-divider">או</div>
        <div style="display:flex;gap:10px">
          <input class="modal-input" placeholder="שם פרטי" style="flex:1" />
          <input class="modal-input" placeholder="שם משפחה" style="flex:1" />
        </div>
        <input class="modal-input" type="email" placeholder="כתובת אימייל" />
        <input class="modal-input" type="tel" placeholder="מספר טלפון" />
        <input class="modal-input" type="password" placeholder="סיסמה (מינ׳ 8 תווים)" />
        <button class="btn-modal-primary" onclick="fakeLogin()">הצטרף חינם</button>
      </div>
      <div class="modal-switch">
        כבר יש לך חשבון? <a onclick="openModal('login')">התחבר</a>
      </div>
    `;
  } else if (type === 'terms') {
    content.innerHTML = `
      <h2 class="modal-title">תקנון השימוש</h2>
      <div style="color:var(--gray-600);font-size:.9rem;line-height:1.8;max-height:400px;overflow-y:auto">
        <p><strong>1. כללי</strong><br/>ParkIt היא פלטפורמת תיווך בין בעלי חניות לנהגים. ParkIt אינה צד לעסקה.</p>
        <p><strong>2. אחריות</strong><br/>המשתמש אחראי לוודא שיש לו זכות חוקית להשכיר את החניה. ParkIt מספקת ביטוח לנזקי רכב ישירים בזמן חניה.</p>
        <p><strong>3. תשלומים</strong><br/>התשלום מעובד ע"י Stripe. ParkIt גובה עמלה של 20% מהמשכיר.</p>
        <p><strong>4. ביטולים</strong><br/>עד 24 שעות לפני — החזר מלא. פחות מ-24 שעות — 50%. לאחר תחילה — אין החזר.</p>
        <p><strong>5. רגולציה</strong><br/>השכרת חניה בבית משותף מחייבת הסכמת הדיירים ו/או הצמדה לדירה. ההכנסה חייבת במס.</p>
      </div>
    `;
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

function fakeLogin() {
  closeModal();
  showToast('ברוך הבא ל-ParkIt! 👋', 'success');
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

// Close modals on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeBooking(); }
});
