// ===== BOOKING MODULE =====

let currentParking = null;
let bookingType    = 'hourly';
let selectedPayMethod = 'bit';

// ── Detail Page ───────────────────────────────────────────────────────────────

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
        <div class="detail-rating"><span style="color:#f59e0b;font-size:1.1rem">★</span><span>${p.rating}</span></div>
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
          <div class="amenities-grid">${p.amenities.map(a => `<div class="amenity-item">${a}</div>`).join('')}</div>
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
          </div>` : ''}
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
                  <div><div class="review-name">${r.name}</div><div class="review-date">${r.date}</div></div>
                  <div class="review-stars" style="margin-right:auto">${'★'.repeat(r.stars)}</div>
                </div>
                <p class="review-text">${r.text}</p>
              </div>`).join('')}
          </div>
        </div>

        <div class="detail-section">
          <h3>🛡️ ביטוח וכיסוי</h3>
          <div class="insurance-card">
            <div class="insurance-header">
              <div class="insurance-shield">🛡️</div>
              <div><div class="insurance-title">כיסוי ביטוחי מלא — כולל בכל הזמנה</div><div class="insurance-sub">מופעל אוטומטית · ללא תוספת תשלום</div></div>
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
      </div>

      <div class="detail-sidebar">
        <div class="booking-card" id="booking-card">
          <div class="booking-card-handle" onclick="toggleBookingCard()"></div>
          <div class="booking-price" id="booking-price-display">₪${p.price_hour} <span>לשעה</span></div>
          <div class="booking-rating">★ ${p.rating} · ${p.reviews_count} ביקורות</div>

          <div class="booking-type-tabs">
            <button class="bt-tab active" id="btab-hourly"   onclick="setBookingType('hourly',this)">שעתי</button>
            <button class="bt-tab"        id="btab-daily"    onclick="setBookingType('daily',this)">יומי</button>
            <button class="bt-tab"        id="btab-monthly"  onclick="setBookingType('monthly',this)">חודשי</button>
            <button class="bt-tab"        id="btab-yearly"   onclick="setBookingType('yearly',this)">שנתי</button>
          </div>

          <div id="bform-hourly" class="booking-type-form active">
            <div class="booking-field"><label>תאריך ושעת כניסה</label><input type="datetime-local" id="book-start" onchange="calcTotal()" /></div>
            <div class="booking-field"><label>תאריך ושעת יציאה</label><input type="datetime-local" id="book-end"   onchange="calcTotal()" /></div>
          </div>

          <div id="bform-daily" class="booking-type-form">
            <div class="booking-field"><label>יום כניסה</label><input type="date" id="book-start-day" onchange="calcTotal()" /></div>
            <div class="booking-field"><label>מספר ימים</label>
              <select id="book-days" onchange="calcTotal()">
                <option value="1">יום 1</option><option value="2">2 ימים</option><option value="3">3 ימים</option>
                <option value="7" selected>שבוע</option><option value="14">שבועיים</option>
              </select>
            </div>
          </div>

          <div id="bform-monthly" class="booking-type-form">
            <div class="booking-field"><label>תאריך התחלה</label><input type="date" id="book-start-month" onchange="calcTotal()" /></div>
            <div class="booking-field"><label>מספר חודשים</label>
              <select id="book-months" onchange="calcTotal()">
                <option value="1">חודש 1</option><option value="3" selected>3 חודשים</option>
                <option value="6">6 חודשים</option><option value="12">שנה (12 חודשים)</option>
              </select>
            </div>
            <div class="longterm-saving" id="monthly-saving"></div>
          </div>

          <div id="bform-yearly" class="booking-type-form">
            <div class="booking-field"><label>תאריך התחלה</label><input type="date" id="book-start-year" onchange="calcTotal()" /></div>
            <div class="booking-field"><label>מספר שנים</label>
              <select id="book-years" onchange="calcTotal()">
                <option value="1" selected>שנה</option><option value="2">2 שנים</option><option value="3">3 שנים</option>
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
    </div>`;

  bookingType = 'hourly';
  const now   = new Date();
  const end   = new Date(now.getTime() + 7200000);
  const today = now.toISOString().slice(0,10);
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('book-start',       now.toISOString().slice(0,16));
  setVal('book-end',         end.toISOString().slice(0,16));
  setVal('book-start-month', today);
  setVal('book-start-year',  today);
  setVal('book-start-day',   today);

  calcTotal();
  showPage('detail');
}

// ── Booking Type ──────────────────────────────────────────────────────────────

function setBookingType(type, btn) {
  bookingType = type;
  document.querySelectorAll('.bt-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.booking-type-form').forEach(f => f.classList.remove('active'));
  document.getElementById('bform-' + type)?.classList.add('active');

  const p            = currentParking;
  const priceDisplay = document.getElementById('booking-price-display');
  if (!p || !priceDisplay) return;
  const labels = { hourly:`₪${p.price_hour} <span>לשעה</span>`, daily:`₪${p.price_day} <span>ליום</span>`, monthly:`₪${p.price_month} <span>לחודש</span>`, yearly:`₪${p.price_year?.toLocaleString() || '—'} <span>לשנה</span>` };
  priceDisplay.innerHTML = labels[type] || '';
  calcTotal();
}

// ── Price Calculation ─────────────────────────────────────────────────────────

function calcTotal() {
  const p = currentParking;
  if (!p) return;

  let subtotal = 0, qtyText = '—', rateText = '—', rateLabel = 'מחיר', qtyLabel = 'כמות';

  if (bookingType === 'hourly') {
    const start = new Date(document.getElementById('book-start')?.value);
    const end   = new Date(document.getElementById('book-end')?.value);
    if (!start || !end || isNaN(start) || isNaN(end) || end <= start) return;
    const hours = Math.max(1, Math.ceil((end - start) / 3600000));
    subtotal = hours * p.price_hour;
    qtyText  = hours + ' שעות'; rateText = '₪' + p.price_hour; rateLabel = 'מחיר לשעה'; qtyLabel = 'מספר שעות';

  } else if (bookingType === 'daily') {
    const days = parseInt(document.getElementById('book-days')?.value || 7);
    subtotal = days * p.price_day;
    qtyText  = days + ' ימים'; rateText = '₪' + p.price_day; rateLabel = 'מחיר ליום'; qtyLabel = 'מספר ימים';

  } else if (bookingType === 'monthly') {
    const months   = parseInt(document.getElementById('book-months')?.value || 3);
    const discount = months >= 12 ? 10 : months >= 6 ? 5 : months >= 3 ? 3 : 0;
    subtotal = months * p.price_month;
    qtyText  = months + ' חודשים'; rateText = '₪' + p.price_month; rateLabel = 'מחיר לחודש'; qtyLabel = 'מספר חודשים';
    const saving = document.getElementById('monthly-saving');
    if (saving && discount > 0) {
      const saved = Math.round(subtotal * discount / 100);
      saving.innerHTML = `🎉 חיסכון של ${discount}% על מנוי ארוך — חוסך ₪${saved}`;
      subtotal -= saved;
    } else if (saving) saving.innerHTML = '';

  } else if (bookingType === 'yearly') {
    const years     = parseInt(document.getElementById('book-years')?.value || 1);
    const priceYear = p.price_year || p.price_month * 11;
    subtotal = years * priceYear;
    qtyText  = years + (years === 1 ? ' שנה' : ' שנים'); rateText = '₪' + priceYear.toLocaleString(); rateLabel = 'מחיר לשנה'; qtyLabel = 'מספר שנים';
    const saving = document.getElementById('yearly-saving');
    if (saving) saving.innerHTML = `🎉 חיסכון של ₪${(p.price_month * 12 * years - subtotal).toLocaleString()} לעומת תשלום חודשי!`;
  }

  const fee   = Math.round(subtotal * 0.15);
  const total = subtotal + fee;

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('bs-rate',       rateText);
  setEl('bs-rate-label', rateLabel);
  setEl('bs-hours',      qtyText);
  setEl('bs-qty-label',  qtyLabel);
  setEl('bs-fee',        '₪' + fee.toLocaleString());
  setEl('bs-total',      '₪' + total.toLocaleString());
}

// ── Booking Sheet ─────────────────────────────────────────────────────────────

function openBookingSheet() {
  const p = currentParking;
  if (!p) return;

  let subtotal = 0, summaryLine = '', typeLabel = '';

  if (bookingType === 'hourly') {
    const start = document.getElementById('book-start')?.value;
    const end   = document.getElementById('book-end')?.value;
    const hours = start && end ? Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 3600000)) : 2;
    subtotal    = hours * p.price_hour;
    summaryLine = `${hours} שעות × ₪${p.price_hour}`;
    typeLabel   = 'שעתי';
  } else if (bookingType === 'daily') {
    const days  = parseInt(document.getElementById('book-days')?.value || 7);
    subtotal    = days * p.price_day;
    summaryLine = `${days} ימים × ₪${p.price_day}`;
    typeLabel   = 'יומי';
  } else if (bookingType === 'monthly') {
    const months   = parseInt(document.getElementById('book-months')?.value || 3);
    const discount = months >= 12 ? 10 : months >= 6 ? 5 : months >= 3 ? 3 : 0;
    subtotal    = Math.round(months * p.price_month * (1 - discount / 100));
    summaryLine = `${months} חודשים × ₪${p.price_month}${discount ? ` (${discount}% הנחה)` : ''}`;
    typeLabel   = 'חודשי';
  } else if (bookingType === 'yearly') {
    const years     = parseInt(document.getElementById('book-years')?.value || 1);
    const priceYear = p.price_year || p.price_month * 11;
    subtotal    = years * priceYear;
    summaryLine = `${years} ${years === 1 ? 'שנה' : 'שנים'} × ₪${priceYear.toLocaleString()}`;
    typeLabel   = 'שנתי';
  }

  const total = subtotal + Math.round(subtotal * 0.15);

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
    <div class="bs-breakdown">
      <div class="bsb-row"><span>${summaryLine}</span><span>₪${subtotal.toLocaleString()}</span></div>
      <div class="bsb-row"><span>עמלת שירות (15%)</span><span>₪${Math.round(subtotal*0.15).toLocaleString()}</span></div>
      <div class="bsb-row total"><span>סה"כ לתשלום</span><span>₪${total.toLocaleString()}</span></div>
    </div>
    <div class="pay-section">
      <div class="pay-label">בחר אמצעי תשלום</div>
      <div class="pay-methods">
        <button class="pay-method active" onclick="selectPayMethod(this,'bit')"><span class="pm-logo pm-bit">bit</span><span class="pm-name">Bit</span></button>
        <button class="pay-method" onclick="selectPayMethod(this,'paybox')"><span class="pm-logo pm-paybox">Pay</span><span class="pm-name">PayBox</span></button>
        <button class="pay-method" onclick="selectPayMethod(this,'apple')"><span class="pm-logo pm-apple"> Pay</span><span class="pm-name">Apple Pay</span></button>
        <button class="pay-method" onclick="selectPayMethod(this,'google')"><span class="pm-logo pm-google">G</span><span class="pm-name">Google Pay</span></button>
        <button class="pay-method" onclick="selectPayMethod(this,'card')"><span class="pm-logo pm-card">💳</span><span class="pm-name">כרטיס</span></button>
      </div>
      <div id="pay-form-bit" class="pay-form active">
        <div class="pay-form-center">
          <div class="pf-icon pf-bit">bit</div>
          <p class="pf-desc">נשלח לך בקשת תשלום ב-Bit</p>
          <input class="modal-input" type="tel" placeholder="05X-XXXXXXX" autocomplete="tel" style="text-align:center;font-size:1.1rem;letter-spacing:3px;font-weight:700" />
        </div>
      </div>
      <div id="pay-form-paybox" class="pay-form">
        <div class="pay-form-center">
          <div class="pf-icon pf-paybox">P</div>
          <p class="pf-desc">נשלח לך בקשת תשלום ב-PayBox</p>
          <input class="modal-input" type="tel" placeholder="05X-XXXXXXX" autocomplete="tel" style="text-align:center;font-size:1.1rem;letter-spacing:3px;font-weight:700" />
        </div>
      </div>
      <div id="pay-form-apple" class="pay-form">
        <div class="pay-form-center">
          <div class="pf-icon pf-apple"> </div>
          <p class="pf-desc">תשלום מאובטח עם Face ID / Touch ID</p>
          <button class="apple-pay-btn" onclick="confirmBooking()"> Pay · ₪${total.toLocaleString()}</button>
        </div>
      </div>
      <div id="pay-form-google" class="pay-form">
        <div class="pay-form-center">
          <div class="pf-icon pf-google">G</div>
          <p class="pf-desc">תשלום מהיר עם חשבון Google</p>
          <button class="google-pay-btn" onclick="confirmBooking()">G Pay · ₪${total.toLocaleString()}</button>
        </div>
      </div>
      <div id="pay-form-card" class="pay-form">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="font-size:.82rem;color:var(--gray-500);text-align:center">🔒 מאובטח על ידי Stripe — PCI DSS Level 1</div>
          <div id="stripe-card-element" style="padding:14px;border:1.5px solid var(--gray-200);border-radius:12px;background:white;min-height:44px"></div>
          <div id="stripe-error" style="color:#ef4444;font-size:.83rem;min-height:18px;text-align:center"></div>
        </div>
      </div>
    </div>
    <button class="btn-book" onclick="confirmBooking()" style="margin-top:18px">🔒 שלם ₪${total.toLocaleString()}</button>
    <div class="pay-security-row">
      <span>🔒 מוצפן</span><span>·</span><span>Stripe PCI DSS</span><span>·</span><span>לא נשמר מידע כרטיס</span>
    </div>`;

  selectedPayMethod = 'bit';
  document.getElementById('booking-sheet').classList.add('open');
  document.getElementById('booking-overlay').classList.add('open');
}

function selectPayMethod(btn, method) {
  selectedPayMethod = method;
  document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.pay-form').forEach(f => f.classList.remove('active'));
  document.getElementById('pay-form-' + method)?.classList.add('active');

  // Mount the Stripe card element only once its tab is actually visible —
  // Stripe Elements can't render its iframe into a hidden (display:none) container,
  // which is why the card number/expiry/CVC fields didn't show up before.
  if (method === 'card') {
    setTimeout(() => mountStripeCard('stripe-card-element'), 50);
  }
}

function closeBooking() {
  document.getElementById('booking-sheet').classList.remove('open');
  document.getElementById('booking-overlay').classList.remove('open');
}

async function confirmBooking() {
  const p = currentParking;
  if (!p) return;

  // ── כרטיס אשראי — Stripe אמיתי ──────────────────────────────────────────
  if (selectedPayMethod === 'card') {
    const payBtn = document.querySelector('#booking-sheet-content .btn-book');
    if (payBtn) { payBtn.textContent = '⏳ מעבד תשלום...'; payBtn.disabled = true; }

    try {
      // חשב סכום
      let totalILS = 0;
      if (bookingType === 'hourly') {
        const s = document.getElementById('book-start')?.value;
        const e = document.getElementById('book-end')?.value;
        const h = s && e ? Math.max(1, Math.ceil((new Date(e) - new Date(s)) / 3600000)) : 2;
        totalILS = h * p.price_hour;
      } else if (bookingType === 'daily') {
        totalILS = parseInt(document.getElementById('book-days')?.value || 7) * p.price_day;
      } else if (bookingType === 'monthly') {
        const m = parseInt(document.getElementById('book-months')?.value || 3);
        const d = m >= 12 ? 10 : m >= 6 ? 5 : m >= 3 ? 3 : 0;
        totalILS = Math.round(m * p.price_month * (1 - d / 100));
      } else if (bookingType === 'yearly') {
        totalILS = parseInt(document.getElementById('book-years')?.value || 1) * (p.price_year || p.price_month * 11);
      }
      totalILS = totalILS + Math.round(totalILS * 0.15); // + עמלה 15%

      const paymentIntent = await processStripePayment(totalILS, p.id, bookingType);
      unmountStripeCard();
      closeBooking();
      _showBookingSuccess(p, paymentIntent.id);

    } catch (err) {
      const errEl = document.getElementById('stripe-error');
      if (errEl) errEl.textContent = err.message || 'שגיאה בתשלום — נסה שנית';
      if (payBtn) { payBtn.textContent = `🔒 שלם`; payBtn.disabled = false; }
    }
    return;
  }

  // ── שאר אמצעי תשלום (Bit, PayBox, Apple Pay, Google Pay) — demo flow ──────
  unmountStripeCard();
  closeBooking();

  _showBookingSuccess(p);
}

function _showBookingSuccess(p, stripePaymentId = null) {
  const gateType     = p.gate_type     || 'pin';
  const gateCode     = p.gate_code     || p.intercom_code || Math.floor(1000 + Math.random() * 9000).toString();
  const intercomPhone = p.intercom_phone || '';
  const iotUrl       = p.iot_url       || '';
  const iotToken     = p.iot_token     || '';
  const gateIcon     = gateType === 'intercom' ? '📞' : gateType === 'iot' ? '🌐' : gateType === 'none' ? '🚗' : gateType === 'key' ? '🔑' : '🔢';

  // Save to Firestore if logged in
  const uid = firebase.auth().currentUser?.uid;
  if (uid) {
    const startVal = document.getElementById('book-start')?.value || null;
    const endVal   = document.getElementById('book-end')?.value   || null;

    // Calculate current subtotal for saving
    let subtotal = 0;
    if (bookingType === 'hourly' && startVal && endVal) {
      subtotal = Math.max(1, Math.ceil((new Date(endVal) - new Date(startVal)) / 3600000)) * p.price_hour;
    } else if (bookingType === 'daily') {
      subtotal = parseInt(document.getElementById('book-days')?.value || 7) * p.price_day;
    } else if (bookingType === 'monthly') {
      const m = parseInt(document.getElementById('book-months')?.value || 3);
      const d = m >= 12 ? 10 : m >= 6 ? 5 : m >= 3 ? 3 : 0;
      subtotal = Math.round(m * p.price_month * (1 - d / 100));
    } else if (bookingType === 'yearly') {
      subtotal = parseInt(document.getElementById('book-years')?.value || 1) * (p.price_year || p.price_month * 11);
    }

    createBooking(uid, {
      parkingId: p.id, parkingTitle: p.title, address: p.address,
      bookingType, subtotal, fee: Math.round(subtotal * 0.15),
      total: subtotal + Math.round(subtotal * 0.15),
      payMethod: selectedPayMethod, gateCode,
      startTime: startVal, endTime: endVal,
      paymentIntentId: stripePaymentId || null,
    }).catch(err => console.error('[booking] save failed:', err.code));
  }

  setTimeout(() => {
    openModal('success');
    document.getElementById('modal-content').innerHTML = `
      <div style="text-align:center;padding:10px 0">
        <div style="font-size:3.5rem;margin-bottom:12px">🎉</div>
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:8px">ההזמנה אושרה!</h2>
        <p style="color:var(--gray-600);font-size:.92rem;line-height:1.6;margin-bottom:20px">
          ${p.title} הוזמנה בהצלחה.<br/>שלחנו לך אישור + קוד גישה ב-SMS.
        </p>
        <div class="gate-code-card">
          <div class="gcc-header"><span>${gateIcon}</span><span>${_gateCardTitle(gateType)}</span></div>
          ${_gateCardBody(gateType, gateCode, intercomPhone, iotUrl, iotToken)}
          <div class="gcc-validity">תקף להזמנה זו בלבד</div>
          <button class="gcc-open-btn"
            data-gate-type="${gateType}"
            data-gate-code="${gateCode}"
            data-gate-phone="${intercomPhone}"
            data-iot-url="${iotUrl}"
            data-iot-token="${iotToken}"
            onclick="openGateNow(this)">
            ${_gateOpenBtnLabel(gateType)}
          </button>
          <div class="gcc-tip" id="gcc-tip">${_gateOpenTip(gateType)}</div>
          <div id="gcc-proximity" style="display:none;margin-top:8px;padding:8px;background:#dcfce7;border-radius:10px;font-size:.82rem;color:#16a34a;font-weight:700">
            📍 הגעת לשטח החניה — לחץ לפתיחה!
          </div>
        </div>
        <div class="booking-confirm-info">
          <div class="bci-row"><span>📍 כתובת</span><span>${p.address}</span></div>
          <div class="bci-row"><span>📱 SMS נשלח ל</span><span>מספרך הרשום</span></div>
          <div class="bci-row"><span>🛡️ ביטוח</span><span style="color:#16a34a;font-weight:600">פעיל ✓</span></div>
        </div>
        <button class="btn-primary" style="width:100%;padding:13px;font-size:.98rem;margin-top:16px" onclick="closeModal();showPage('home')">סיום</button>
        <p style="font-size:.75rem;color:var(--gray-400);margin-top:10px">לתמיכה: 0526760039 או nitaizx123@gmail.com</p>
      </div>`;
    // Start geofence after modal renders
    if (p.address && gateType !== 'none' && gateType !== 'key') {
      setTimeout(() => _startGeoFence(p.address), 800);
    }
  }, 300);
}

/* ─── Gate helper functions ─── */

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

/* ─── Main gate open function ─── */

function openGateNow(btn) {
  const type    = btn.dataset.gateType;
  const code    = btn.dataset.gateCode;
  const phone   = btn.dataset.gatePhone;
  const iotUrl  = btn.dataset.iotUrl;
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
    // DTMF: tel:NUMBER,,CODE — commas = 2-second pauses before sending tones
    const dtmfPauses = ',,,'; // ~3 sec wait for intercom to pick up
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
    fetch(iotUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'open', timestamp: Date.now() }),
    })
    .then(r => {
      if (r.ok) _gateFeedback(btn, '✅ פקודה נשלחה — השער נפתח!', '#16a34a', _gateOpenBtnLabel(type));
      else      _gateFeedback(btn, `⚠️ שגיאת שרת (${r.status})`, '#ef4444', _gateOpenBtnLabel(type));
    })
    .catch(() => _gateFeedback(btn, '⚠️ שגיאת חיבור — בדוק אינטרנט', '#ef4444', _gateOpenBtnLabel(type)));
    return; // feedback handled inside promise

  } else if (type === 'key') {
    _gateFeedback(btn, '📋 פנה למשכיר לקבלת מפתח', '#f59e0b', _gateOpenBtnLabel(type));

  } else {
    _gateFeedback(btn, '✅ כניסה חופשית — הכנס', '#16a34a', _gateOpenBtnLabel(type));
  }
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

/* ─── Geofence — auto-alert when approaching the parking ─── */

let _geoWatchId = null;
let _geoInside  = false;

function _startGeoFence(address) {
  if (!navigator.geolocation) return;
  // Geocode address via free OpenStreetMap Nominatim
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
          const dist = _haversineMeters(
            pos.coords.latitude, pos.coords.longitude,
            targetLat, targetLng
          );
          const proximityEl = document.getElementById('gcc-proximity');
          const tipEl       = document.getElementById('gcc-tip');

          if (dist < 150 && !_geoInside) {
            // Entered the parking area → start the usage timer
            _geoInside = true;
            if (proximityEl) proximityEl.style.display = 'block';
            if (tipEl) tipEl.style.display = 'none';
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            _startParkingTimer(currentParking);

          } else if (dist >= 150 && _geoInside) {
            // Left the parking area → stop the timer and charge for actual usage
            _geoInside = false;
            if (proximityEl) proximityEl.style.display = 'none';
            if (tipEl) tipEl.style.display = '';
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            _endParkingTimer();
            if (_geoWatchId !== null) { navigator.geolocation.clearWatch(_geoWatchId); _geoWatchId = null; }
          }
        },
        null,
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    })
    .catch(() => {}); // silent fail — geofence is a bonus feature
}

/* ─── Usage-based parking timer — starts on arrival, stops on departure ─── */

let _parkingSession = null; // { p, start, intervalId }

function _startParkingTimer(p) {
  if (_parkingSession || !p) return;
  _parkingSession = { p, start: Date.now(), intervalId: null };

  const proximityEl = document.getElementById('gcc-proximity');
  const container   = proximityEl?.parentElement;
  if (container && !document.getElementById('parking-timer')) {
    const box = document.createElement('div');
    box.id = 'parking-timer';
    box.style.cssText = 'margin-top:8px;padding:12px;background:#eff6ff;border-radius:10px;text-align:center';
    box.innerHTML = `
      <div style="font-size:.8rem;color:#3b82f6;font-weight:700">🅿️ החניה שלך פעילה — השעון רץ</div>
      <div id="parking-timer-clock" style="font-size:1.6rem;font-weight:900;color:#1e40af;margin-top:4px;font-variant-numeric:tabular-nums">00:00:00</div>
      <div id="parking-timer-cost" style="font-size:.8rem;color:var(--gray-500);margin-top:2px">עלות משוערת: ₪0</div>`;
    container.appendChild(box);
  }

  _parkingSession.intervalId = setInterval(_tickParkingTimer, 1000);
  _tickParkingTimer();
  showToast('🅿️ נכנסת לחניה — השעון התחיל לרוץ', 'success');
}

function _tickParkingTimer() {
  if (!_parkingSession) return;
  const elapsedMs = Date.now() - _parkingSession.start;
  const totalSec  = Math.floor(elapsedMs / 1000);
  const pad = n => String(n).padStart(2, '0');
  const clockEl = document.getElementById('parking-timer-clock');
  if (clockEl) clockEl.textContent = `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;

  const cost   = Math.max(0, Math.ceil((elapsedMs / 3600000) * (_parkingSession.p.price_hour || 0)));
  const costEl = document.getElementById('parking-timer-cost');
  if (costEl) costEl.textContent = `עלות משוערת: ₪${cost.toLocaleString()}`;
}

function _endParkingTimer() {
  if (!_parkingSession) return;
  clearInterval(_parkingSession.intervalId);
  const elapsedMs = Date.now() - _parkingSession.start;
  const p         = _parkingSession.p;
  const charge    = Math.max(1, Math.ceil((elapsedMs / 3600000) * (p.price_hour || 0)));
  _parkingSession = null;

  document.getElementById('parking-timer')?.remove();
  showToast('🚗 יצאת מהחניה — השעון נעצר', 'success');
  setTimeout(() => _showParkingChargeSummary(p, elapsedMs, charge), 400);
}

function _showParkingChargeSummary(p, elapsedMs, charge) {
  const totalMin = Math.max(1, Math.round(elapsedMs / 60000));
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const durText = hh > 0 ? `${hh} שעות ו-${mm} דקות` : `${mm} דקות`;

  openModal('parking-charge');
  document.getElementById('modal-content').innerHTML = `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:3rem;margin-bottom:10px">🏁</div>
      <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:8px">סיימת לחנות!</h2>
      <p style="color:var(--gray-600);font-size:.9rem;margin-bottom:18px">חנית ב${p.title} במשך ${durText}.</p>
      <div style="background:var(--pink-light);border-radius:14px;padding:18px;margin-bottom:20px">
        <div style="font-size:.82rem;color:var(--pink);font-weight:700">סכום לחיוב לפי זמן השימוש בפועל</div>
        <div style="font-size:1.9rem;font-weight:900;color:var(--pink);margin-top:6px">₪${charge.toLocaleString()}</div>
      </div>
      <button class="btn-primary" style="width:100%;padding:13px;font-size:.98rem" onclick="closeModal();showToast('התשלום בוצע — תודה שהשתמשת ב-NitPark! 🎉','success')">אשר ושלם ₪${charge.toLocaleString()}</button>
    </div>`;
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
