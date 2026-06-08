// ===== LEAFLET MAP MODULE =====

let leafletMap     = null;
let leafletMarkers = [];

const PARKING_COORDS = {
  1: [32.0853, 34.7818],
  2: [32.0800, 34.8100],
  3: [32.0791, 34.7676],
  4: [32.1640, 34.8440],
  5: [31.7767, 35.2345],
  6: [32.8154, 34.9890],
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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap © CARTO',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(leafletMap);

  L.control.zoom({ position: 'topleft' }).addTo(leafletMap);
}

function renderLeafletMarkers(list) {
  if (!leafletMap) initLeafletMap();
  if (!leafletMap) return;

  leafletMarkers.forEach(m => leafletMap.removeLayer(m));
  leafletMarkers = [];

  const bounds = [];

  list.forEach(p => {
    const coords = PARKING_COORDS[p.id];
    if (!coords) return;
    bounds.push(coords);

    const html = `
      <div class="lf-host-marker" onclick="openDetail(${p.id})" id="lf-marker-${p.id}">
        <div class="lf-avatar" style="background:${p.host.avatar}">${p.host.letter}</div>
        <div class="lf-price">₪${p.price_hour}</div>
        ${p.ev_charger ? '<div class="lf-ev">⚡</div>' : ''}
      </div>`;

    const icon   = L.divIcon({ html, className: '', iconSize: [56, 66], iconAnchor: [28, 66] });
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

    marker.on('click', () => highlightCard(p.id));
    leafletMarkers.push(marker);
  });

  if (bounds.length) leafletMap.fitBounds(bounds, { padding: [60, 60] });
}

function highlightCard(id) {
  document.querySelectorAll('.search-card').forEach(c => c.classList.remove('highlighted'));
  const card = document.getElementById('card-' + id);
  if (card) { card.classList.add('highlighted'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function hoverMarker(id, on) {
  if (!leafletMap) return;
  leafletMarkers.forEach((m, i) => {
    const el = m.getElement();
    if (!el) return;
    const marker = el.querySelector('.lf-host-marker');
    if (!marker) return;
    if (PARKINGS[i]?.id === id) marker.classList.toggle('hovered', on);
  });
}
