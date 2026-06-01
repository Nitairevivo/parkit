// ===== STATE =====
let currentPage = 'home';
let currentParking = null;
let filteredListings = [...PARKINGS];
let minRating = 0;
let selectedType = 'פרטית בבניין';
let hostStep = 1;
let bookingType = 'hourly';

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

  if (name === 'search') {
    renderSearchResults(filteredListings);
    setTimeout(() => {
      initLeafletMap();
      renderLeafletMarkers(filteredListings);
      if (leafletMap) leafletMap.invalidateSize();
    }, 50);
  }
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
        ${p.ev_charger ? '<div class="ev-badge">⚡ EV</div>' : ''}
      </div>
      <div class="listing-body">
        <div class="listing-rating">
          <span class="stars">★★★★★</span>
          <span>${p.rating} (${p.reviews_count} ביקורות)</span>
        </div>
        <div class="listing-title">${p.title}</div>
        <div class="listing-location">📍 ${p.address}</div>
        <div class="listing-tags">
          ${p.tags.map(t => `<span class="listing-tag">${t === 'טעינת חשמל' ? '⚡ ' + t : t}</span>`).join('')}
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

  filteredListings = PARKINGS.filter(p => {
    if (p.price_hour < min || p.price_hour > max) return false;
    if (p.rating < minRating) return false;
    if (evOnly && !p.ev_charger) return false;
    if (rentalType === 'longterm' && !p.price_month) return false;
    if (activeCategory === 'ev' && !p.ev_charger) return false;
    if (activeCategory !== 'all' && activeCategory !== 'ev' && !(p.categories || []).includes(activeCategory)) return false;
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
function filterByCategory(cat, btn) {
  activeCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
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
  if (list.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400)"><div style="font-size:3rem;margin-bottom:16px">🔍</div><p>לא נמצאו חניות. נסה חיפוש אחר.</p></div>';
    return;
  }

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

  el.innerHTML = list.map(p => {
    const lt = ltPrice(p);
    return `
    <div class="search-card" id="card-${p.id}"
         onclick="openDetail(${p.id})"
         onmouseenter="hoverMarker(${p.id},true)"
         onmouseleave="hoverMarker(${p.id},false)">
      <div class="sc-img">
        <span class="sc-emoji">${p.emoji}</span>
        <span class="sc-type">${p.type}</span>
        ${p.ev_charger ? '<span class="sc-ev">⚡ EV</span>' : ''}
      </div>
      <div class="sc-body">
        <div class="sc-top">
          <div class="sc-title">${p.title}</div>
          <div class="sc-price">${isLongTerm
            ? `₪${lt.price.toLocaleString()}<span>/${lt.label}</span>`
            : `₪${p.price_hour}<span>/שעה</span>`}</div>
        </div>
        <div class="sc-loc">📍 ${p.address}</div>
        <div class="sc-rating">
          <span class="sc-stars">★★★★★</span>
          <span class="sc-rating-num">${p.rating}</span>
          <span class="sc-reviews">(${p.reviews_count})</span>
          ${p.ev_charger ? '<span class="sc-ev-chip">⚡</span>' : ''}
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
  if (!leafletMap) return;
  leafletMarkers.forEach((m, i) => {
    const el = m.getElement();
    if (!el) return;
    const marker = el.querySelector('.lf-host-marker');
    if (!marker) return;
    const pid = PARKINGS[i]?.id;
    if (pid === id) marker.classList.toggle('hovered', on);
  });
}

// ===== LEAFLET MAP =====
let leafletMap = null;
let leafletMarkers = [];

// Real GPS coords for each parking
const PARKING_COORDS = {
  1: [32.0853, 34.7818],  // Tel Aviv, Hayarkon
  2: [32.0800, 34.8100],  // Ramat Gan, Jabotinsky
  3: [32.0791, 34.7676],  // Tel Aviv, Herbert Samuel
  4: [32.1640, 34.8440],  // Herzliya
  5: [31.7767, 35.2345],  // Jerusalem, Mamilla
  6: [32.8154, 34.9890],  // Haifa, Ben Gurion
};

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

  // Zoom control on left
  L.control.zoom({ position: 'topleft' }).addTo(leafletMap);
}

function renderLeafletMarkers(list) {
  if (!leafletMap) initLeafletMap();
  if (!leafletMap) return;

  // Clear old markers
  leafletMarkers.forEach(m => leafletMap.removeLayer(m));
  leafletMarkers = [];

  const bounds = [];

  list.forEach(p => {
    const coords = PARKING_COORDS[p.id];
    if (!coords) return;
    bounds.push(coords);

    // Custom circular host avatar icon
    const html = `
      <div class="lf-host-marker" onclick="openDetail(${p.id})" id="lf-marker-${p.id}">
        <div class="lf-avatar" style="background:${p.host.avatar}">${p.host.letter}</div>
        <div class="lf-price">₪${p.price_hour}</div>
        ${p.ev_charger ? '<div class="lf-ev">⚡</div>' : ''}
      </div>`;

    const icon = L.divIcon({ html, className: '', iconSize: [56, 66], iconAnchor: [28, 66] });
    const marker = L.marker(coords, { icon })
      .addTo(leafletMap)
      .bindPopup(`
        <div class="lf-popup" onclick="openDetail(${p.id})" style="cursor:pointer;min-width:180px">
          <div style="font-size:1.8rem;text-align:center;margin-bottom:8px">${p.emoji}</div>
          <div style="font-weight:800;font-size:.95rem;margin-bottom:4px">${p.title}</div>
          <div style="font-size:.8rem;color:#64748b;margin-bottom:8px">📍 ${p.address}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#e91e8c;font-weight:800;font-size:1.1rem">₪${p.price_hour}<small style="font-weight:400">/שעה</small></span>
            <span style="color:#f59e0b;font-size:.9rem">★ ${p.rating}</span>
          </div>
          ${p.ev_charger ? '<div style="margin-top:8px;background:#dcfce7;color:#15803d;border-radius:8px;padding:4px 10px;font-size:.78rem;font-weight:700;text-align:center">⚡ עמדת טעינה</div>' : ''}
          <div style="margin-top:10px;background:linear-gradient(135deg,#e91e8c,#764ba2);color:white;border-radius:10px;padding:8px;text-align:center;font-weight:700;font-size:.88rem">פרטים והזמנה →</div>
        </div>
      `, { direction: 'top', className: 'lf-popup-wrap' });

    marker.on('click', () => {
      highlightCard(p.id);
    });

    leafletMarkers.push(marker);
  });

  if (bounds.length) leafletMap.fitBounds(bounds, { padding: [60, 60] });
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
  if (q) {
    filteredListings = PARKINGS.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q)
    );
  } else {
    filteredListings = [...PARKINGS];
  }
  renderSearchResults(filteredListings);
  renderLeafletMarkers(filteredListings);
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
          ${p.ev_charger ? `
          <div class="ev-charger-card">
            <div class="ev-charger-icon">⚡</div>
            <div class="ev-charger-info">
              <div class="ev-charger-title">עמדת טעינת רכב חשמלי</div>
              <div class="ev-charger-details">
                <span class="ev-detail-chip">${p.ev_charger.type}</span>
                <span class="ev-detail-chip">${p.ev_charger.speed_kw} kW</span>
                <span class="ev-detail-chip">${p.ev_charger.price_per_kwh > 0 ? '₪' + p.ev_charger.price_per_kwh + '/kWh' : 'טעינה כלולה'}</span>
              </div>
              <div class="ev-charger-note">זמן טעינה משוער: ${Math.round(60 / p.ev_charger.speed_kw * 40)} דקות ל-40kWh</div>
            </div>
          </div>
          ` : ''}
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
              <div class="insurance-item">
                <span class="ins-icon">🚗</span>
                <div>
                  <strong>נזקי רכב</strong>
                  <p>כיסוי עד ₪50,000 לנזק ישיר לרכב בזמן חניה</p>
                </div>
              </div>
              <div class="insurance-item">
                <span class="ins-icon">🔒</span>
                <div>
                  <strong>גניבה ופריצה</strong>
                  <p>כיסוי חלקי לנזקי פריצה לרכב במהלך ההזמנה</p>
                </div>
              </div>
              <div class="insurance-item">
                <span class="ins-icon">⚖️</span>
                <div>
                  <strong>אחריות כלפי צד שלישי</strong>
                  <p>הגנה משפטית בסכסוכים הנוגעים להזמנה</p>
                </div>
              </div>
              <div class="insurance-item">
                <span class="ins-icon">📞</span>
                <div>
                  <strong>תמיכה 24/7</strong>
                  <p>קו חירום לדיווח על נזק — תוך שעה</p>
                </div>
              </div>
            </div>
            <div class="insurance-note">
              לדיווח על נזק: <strong>*6060</strong> או דרך האפליקציה תוך 24 שעות מסיום ההזמנה.
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3>מדיניות ביטול</h3>
          <p style="color:var(--gray-600);line-height:1.8">ביטול עד 24 שעות לפני ההזמנה — החזר מלא. ביטול בפחות מ-24 שעות — החזר 50%. ביטול לאחר תחילת ההזמנה — ללא החזר.</p>
        </div>
      </div>

      <div class="detail-sidebar">
        <div class="booking-card" id="booking-card">
          <div class="booking-price" id="booking-price-display">₪${p.price_hour} <span>לשעה</span></div>
          <div class="booking-rating">★ ${p.rating} · ${p.reviews_count} ביקורות</div>

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
            <div class="bs-row"><span id="bs-rate-label">מחיר לשעה</span><span id="bs-rate">₪${p.price_hour}</span></div>
            <div class="bs-row"><span id="bs-qty-label">מספר שעות</span><span id="bs-hours">—</span></div>
            <div class="bs-row"><span>עמלת שירות (15%)</span><span id="bs-fee">—</span></div>
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
  bookingType = 'hourly';
  const now = new Date();
  const end = new Date(now.getTime() + 7200000);
  const startEl = document.getElementById('book-start');
  const endEl = document.getElementById('book-end');
  if (startEl) startEl.value = now.toISOString().slice(0,16);
  if (endEl) endEl.value = end.toISOString().slice(0,16);

  const today = now.toISOString().slice(0,10);
  const smEl = document.getElementById('book-start-month');
  const syEl = document.getElementById('book-start-year');
  const sdEl = document.getElementById('book-start-day');
  if (smEl) smEl.value = today;
  if (syEl) syEl.value = today;
  if (sdEl) sdEl.value = today;

  calcTotal();
  showPage('detail');
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

  if (type === 'hourly') priceDisplay.innerHTML = `₪${p.price_hour} <span>לשעה</span>`;
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
    if (!start || !end || isNaN(start) || isNaN(end) || end <= start) return;
    const hours = Math.max(1, Math.ceil((end - start) / 3600000));
    subtotal = hours * p.price_hour;
    qtyText = hours + ' שעות';
    rateText = '₪' + p.price_hour;
    rateLabel = 'מחיר לשעה';
    qtyLabel = 'מספר שעות';

  } else if (bookingType === 'daily') {
    const days = parseInt(document.getElementById('book-days')?.value || 7);
    subtotal = days * p.price_day;
    qtyText = days + ' ימים';
    rateText = '₪' + p.price_day;
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

  const fee = Math.round(subtotal * 0.15);
  const total = subtotal + fee;

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
    const hours = start && end ? Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 3600000)) : 2;
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

  document.getElementById('booking-sheet-content').innerHTML = `
    <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:20px">אישור הזמנה · ${typeLabel}</h2>
    <div style="display:flex;gap:16px;align-items:center;background:var(--gray-50);border-radius:14px;padding:16px;margin-bottom:24px">
      <div style="font-size:2.5rem">${p.emoji}</div>
      <div>
        <div style="font-weight:700;font-size:1rem">${p.title}</div>
        <div style="font-size:.85rem;color:var(--gray-600)">📍 ${p.address}</div>
        <div style="font-size:.85rem;color:var(--pink);font-weight:700;margin-top:4px">₪${total.toLocaleString()} לתשלום</div>
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
      <div class="bs-row"><span>פירוט</span><span style="font-size:.82rem">${summaryLine}</span></div>
      <div class="bs-row"><span>עמלת שירות (15%)</span><span>₪${Math.round(subtotal * 0.15).toLocaleString()}</span></div>
      <div class="bs-row total"><span><strong>סה"כ</strong></span><span><strong>₪${total.toLocaleString()}</strong></span></div>
    </div>

    <button class="btn-book" onclick="confirmBooking()">
      🔒 אשר תשלום ₪${total.toLocaleString()}
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
