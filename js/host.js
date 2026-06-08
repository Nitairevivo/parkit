// ===== HOST FORM MODULE =====

let hostStep     = 1;
let selectedType = 'פרטית בבניין';
let gateType     = 'pin';
let availabilityMode = 'now';

function setAvailabilityMode(mode, el) {
  availabilityMode = mode;
  document.querySelectorAll('#avail-now-btn, #avail-later-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  const wrap = document.getElementById('avail-date-wrap');
  if (wrap) wrap.style.display = mode === 'later' ? 'block' : 'none';
}

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
  const ph        = parseFloat(document.getElementById('h-price-hour')?.value || 15);
  const activeDays = document.querySelectorAll('.day-btn.active').length || 5;
  const monthly   = ph * 8 * activeDays * 4;
  const net       = v => '₪' + Math.round(v * 0.8).toLocaleString();
  const setEl     = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('earn-50',  net(monthly * 0.5));
  setEl('earn-75',  net(monthly * 0.75));
  setEl('earn-100', net(monthly));
}

function nextStep(n) {
  if (n === 2) {
    const addr = document.getElementById('h-address')?.value.trim();
    if (!addr) { showToast('נא להזין כתובת', 'error'); return; }
    if (hostImages.length === 0) { showToast('נא להעלות לפחות תמונה אחת של החניה', 'error'); return; }
  }
  if (n === 3) renderHostSummary();
  _setHostStep(n);
}

function prevStep(n) { _setHostStep(n); }

function _setHostStep(n) {
  document.querySelectorAll('.host-step').forEach(s => s.classList.remove('active'));
  document.getElementById('host-step-' + n)?.classList.add('active');
  document.querySelectorAll('.form-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n)      s.classList.add('done');
    else if (i + 1 === n) s.classList.add('active');
  });
  hostStep = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHostSummary() {
  const el = document.getElementById('host-summary');
  if (!el) return;
  const get = (id, def = '—') => document.getElementById(id)?.value || def;
  const availText = availabilityMode === 'later'
    ? 'החל מ־' + (get('h-available-from') !== '—' ? new Date(get('h-available-from')).toLocaleString('he-IL') : '—')
    : 'זמינה מיד';
  el.innerHTML = `
    <div class="summary-row"><span>כתובת</span><span>${get('h-address')}</span></div>
    <div class="summary-row"><span>זמינה החל מ</span><span>${availText}</span></div>
    <div class="summary-row"><span>סוג חניה</span><span>${selectedType}</span></div>
    <div class="summary-row"><span>מחיר לשעה</span><span>₪${get('h-price-hour','15')}</span></div>
    <div class="summary-row"><span>מחיר יומי</span><span>${get('h-price-day') !== '—' ? '₪'+get('h-price-day') : '—'}</span></div>
    <div class="summary-row"><span>מחיר חודשי</span><span>${get('h-price-month') !== '—' ? '₪'+get('h-price-month') : '—'}</span></div>
    <div class="summary-row"><span>שעות זמינות</span><span>${get('h-open','08:00')} – ${get('h-close','22:00')}</span></div>
    <div class="summary-row"><span>עמלת NitPark</span><span>20%</span></div>`;
}

async function publishListing() {
  const agreed = document.getElementById('agree-terms')?.checked;
  if (!agreed) { showToast('נא לאשר את התנאים', 'error'); return; }

  const uid = firebase.auth().currentUser?.uid;

  const formData = {
    address:     document.getElementById('h-address')?.value     || '',
    type:        selectedType,
    priceHour:   document.getElementById('h-price-hour')?.value  || '0',
    priceDay:    document.getElementById('h-price-day')?.value   || '0',
    priceMonth:  document.getElementById('h-price-month')?.value || '0',
    openTime:    document.getElementById('h-open')?.value        || '08:00',
    closeTime:   document.getElementById('h-close')?.value       || '22:00',
    days:        Array.from(document.querySelectorAll('.day-btn.active')).map(b => b.textContent),
    availableFrom: availabilityMode === 'later' ? (document.getElementById('h-available-from')?.value || null) : null,
    hasEV:       document.getElementById('h-has-ev')?.checked    || false,
    evType:      document.getElementById('h-ev-type')?.value     || '',
    evKw:        document.getElementById('h-ev-kw')?.value       || '0',
    gateType,
    gateCode:       document.getElementById('h-gate-code')?.value        || '',
    intercomPhone:  document.getElementById('h-intercom-phone')?.value   || '',
    intercomCode:   document.getElementById('h-intercom-code')?.value    || '',
    iotUrl:         document.getElementById('h-iot-url')?.value          || '',
    iotToken:       document.getElementById('h-iot-token')?.value        || '',
    description:    document.getElementById('h-description')?.value      || '',
  };

  try {
    if (uid) {
      await submitListing(uid, formData);
    } else {
      showToast('יש להתחבר לפני פרסום חניה', 'error');
      return;
    }
  } catch(err) {
    console.error('[host] submitListing:', err.message);
    showToast('שגיאה בשמירת החניה — נסה שוב', 'error');
    return;
  }

  openModal('publish-success');
  document.getElementById('modal-content').innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:4rem;margin-bottom:20px">🚀</div>
      <h2 style="font-size:1.5rem;font-weight:800;margin-bottom:12px">החניה פורסמה בהצלחה!</h2>
      <p style="color:var(--gray-600);line-height:1.7;margin-bottom:24px">
        החניה שלך פעילה כעת וגלויה לכל המשתמשים בחיפוש ובמפה.
      </p>
      <div style="background:var(--pink-light);border-radius:14px;padding:20px;margin-bottom:24px">
        <div style="font-size:.85rem;color:var(--pink);font-weight:700">הכנסה משוערת</div>
        <div style="font-size:2rem;font-weight:900;color:var(--pink);margin-top:8px" id="expected-earn">מחשב...</div>
      </div>
      <button class="btn-primary" style="width:100%;padding:14px;font-size:1rem" onclick="closeModal();showPage('home')">מעולה!</button>
    </div>`;

  const ph   = parseFloat(document.getElementById('h-price-hour')?.value || 15);
  const earn = Math.round(ph * 8 * 22 * 0.8 * 0.75);
  setTimeout(() => {
    const el = document.getElementById('expected-earn');
    if (el) el.textContent = '₪' + earn.toLocaleString() + '/חודש';
  }, 100);
}

// ── Image marker editor ──────────────────────────────────────────────────────
// Each uploaded photo gets a movable/resizable square that the host drags onto
// the exact spot of the parking, so drivers know precisely where to park.
let hostImages  = [];                 // [{ src }]
let hostMarkers = [];                 // [{ x, y, w, h }]  — all in % of the image
let _markerDrag = null;               // active drag/resize state for the editor

const DEFAULT_MARKER = { x: 30, y: 30, w: 40, h: 40 };

function previewImages(input) {
  const grid = document.getElementById('image-preview');
  if (!grid) return;

  Array.from(input.files).slice(0, 6 - hostImages.length).forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const idx = hostImages.length;
      hostImages.push({ src: e.target.result });
      hostMarkers.push({ ...DEFAULT_MARKER });
      _renderImageThumb(idx);
    };
    reader.readAsDataURL(file);
  });

  input.value = ''; // allow re-selecting/re-shooting the same photo
}

function _renderImageThumb(idx) {
  const grid = document.getElementById('image-preview');
  if (!grid) return;

  let cell = document.getElementById('img-thumb-' + idx);
  if (!cell) {
    cell = document.createElement('div');
    cell.id = 'img-thumb-' + idx;
    cell.className = 'img-preview-cell';
    cell.style.cssText = 'position:relative;border-radius:12px;overflow:hidden;cursor:pointer;aspect-ratio:1;';
    cell.onclick = () => openImageMarkerEditor(idx);
    grid.appendChild(cell);
  }

  const m = hostMarkers[idx];
  cell.innerHTML = `
    <img src="${hostImages[idx].src}" class="img-preview" style="width:100%;height:100%;object-fit:cover;display:block" />
    <div style="position:absolute;border:3px solid #e91e8c;border-radius:6px;box-shadow:0 0 0 2000px rgba(0,0,0,.25);
                left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%;pointer-events:none"></div>
    <div style="position:absolute;bottom:6px;right:6px;left:6px;background:rgba(0,0,0,.55);color:#fff;
                font-size:.72rem;text-align:center;border-radius:8px;padding:3px 6px">📍 לחץ לסימון מיקום מדויק</div>`;
}

// Opens a full-screen editor with a draggable + resizable square overlaid on
// the photo, so the host can mark exactly where the parking spot is.
function openImageMarkerEditor(idx) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  overlay.classList.add('open');

  const m = hostMarkers[idx];
  content.innerHTML = `
    <h2 class="modal-title">סמן את מיקום החניה</h2>
    <p class="modal-subtitle">גרור והזז את הריבוע בדיוק על מקום החניה בתמונה</p>
    <div id="marker-stage" style="position:relative;width:100%;aspect-ratio:1;border-radius:14px;overflow:hidden;touch-action:none;user-select:none">
      <img src="${hostImages[idx].src}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none" />
      <div id="marker-box" style="position:absolute;border:3px solid #e91e8c;border-radius:6px;box-shadow:0 0 0 2000px rgba(0,0,0,.25);cursor:move;
                  left:${m.x}%;top:${m.y}%;width:${m.w}%;height:${m.h}%">
        <div id="marker-handle" style="position:absolute;width:26px;height:26px;right:-13px;bottom:-13px;
                    background:#e91e8c;border:3px solid #fff;border-radius:50%;cursor:nwse-resize"></div>
      </div>
    </div>
    <button class="btn-modal-primary" style="margin-top:16px" onclick="confirmImageMarker(${idx})">✓ אישור מיקום</button>`;

  _initMarkerDrag(idx);
}

function _initMarkerDrag(idx) {
  const stage  = document.getElementById('marker-stage');
  const box    = document.getElementById('marker-box');
  const handle = document.getElementById('marker-handle');
  if (!stage || !box || !handle) return;

  const start = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const p = e.touches ? e.touches[0] : e;
    const rect = stage.getBoundingClientRect();
    _markerDrag = {
      mode, rect,
      startX: p.clientX, startY: p.clientY,
      orig: { ...hostMarkers[idx] },
    };
  };

  const move = e => {
    if (!_markerDrag) return;
    e.preventDefault();
    const p = e.touches ? e.touches[0] : e;
    const dxPct = (p.clientX - _markerDrag.startX) / _markerDrag.rect.width  * 100;
    const dyPct = (p.clientY - _markerDrag.startY) / _markerDrag.rect.height * 100;
    const m = hostMarkers[idx];
    const o = _markerDrag.orig;

    if (_markerDrag.mode === 'move') {
      m.x = Math.min(Math.max(o.x + dxPct, 0), 100 - o.w);
      m.y = Math.min(Math.max(o.y + dyPct, 0), 100 - o.h);
    } else { // resize
      m.w = Math.min(Math.max(o.w + dxPct, 10), 100 - o.x);
      m.h = Math.min(Math.max(o.h + dyPct, 10), 100 - o.y);
    }
    box.style.left   = m.x + '%';
    box.style.top    = m.y + '%';
    box.style.width  = m.w + '%';
    box.style.height = m.h + '%';
  };

  const end = () => { _markerDrag = null; };

  box.addEventListener('mousedown',  e => start(e, 'move'));
  box.addEventListener('touchstart', e => start(e, 'move'), { passive: false });
  handle.addEventListener('mousedown',  e => start(e, 'resize'));
  handle.addEventListener('touchstart', e => start(e, 'resize'), { passive: false });

  window.addEventListener('mousemove', move);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);
}

function confirmImageMarker(idx) {
  closeModal();
  _renderImageThumb(idx);
  showToast('מיקום החניה סומן ✓', 'success');
}

function selectGateType(el, type) {
  gateType = type;
  document.querySelectorAll('.gate-type-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.querySelectorAll('.gate-fields').forEach(f => f.style.display = 'none');
  document.getElementById('gate-' + type + '-fields')?.classList.remove('hidden');
  const f = document.getElementById('gate-' + type + '-fields');
  if (f) f.style.display = 'block';
}

function toggleGateCode(btn) {
  const inp = document.getElementById('h-gate-code');
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈 הסתר'; }
  else                         { inp.type = 'password'; btn.textContent = '👁 הצג'; }
}

function toggleEVFields(checkbox) {
  const fields = document.getElementById('ev-fields');
  if (fields) fields.style.display = checkbox.checked ? 'flex' : 'none';
}
