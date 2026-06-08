// ===== SEARCH & LISTINGS MODULE =====

let activeCategory = 'all';
let minRating      = 0;

function switchTab(tab) {
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('find-form').style.display = tab === 'find' ? '' : 'none';
  document.getElementById('host-form').style.display = tab === 'host' ? '' : 'none';
}

function doSearch() {
  const q = document.getElementById('searchLocation').value.trim().toLowerCase();
  filteredListings = q
    ? PARKINGS.filter(p => p.title.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
    : [...PARKINGS];

  const inline = document.getElementById('searchInline');
  if (inline) inline.value = document.getElementById('searchLocation')?.value || '';
  showPage('search');
}

function doSearchInline() {
  const q = document.getElementById('searchInline').value.trim().toLowerCase();
  filteredListings = q
    ? PARKINGS.filter(p => p.title.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
    : [...PARKINGS];
  renderSearchResults(filteredListings);
  renderLeafletMarkers(filteredListings);
}

function filterListings() {
  const min        = parseFloat(document.getElementById('priceMin')?.value || 0);
  const max        = parseFloat(document.getElementById('priceMax')?.value || 9999);
  const evOnly     = document.getElementById('filter-ev')?.checked;
  const rentalType = document.querySelector('input[name="rental-type"]:checked')?.value || 'all';

  const ltOptions = document.getElementById('longterm-options');
  if (ltOptions) ltOptions.style.display = rentalType === 'longterm' ? 'flex' : 'none';

  const ltPeriod = document.querySelector('input[name="lt-period"]:checked')?.value || 'month';

  filteredListings = PARKINGS.filter(p => {
    if (p.price_hour < min || p.price_hour > max)          return false;
    if (p.rating < minRating)                              return false;
    if (evOnly && !p.ev_charger)                           return false;
    if (rentalType === 'longterm' && !p.price_month)       return false;
    if (activeCategory === 'ev' && !p.ev_charger)          return false;
    if (activeCategory !== 'all' && activeCategory !== 'ev' && !(p.categories || []).includes(activeCategory)) return false;
    return true;
  });

  const countEl  = document.getElementById('results-count');
  const ltLabels = { week:'שבועי', twoweeks:'דו-שבועי', month:'חודשי', year:'שנתי' };
  const label    = rentalType === 'longterm' ? `חניות לטווח ארוך (${ltLabels[ltPeriod]}) נמצאו` : 'חניות נמצאו';
  if (countEl) countEl.textContent = `${filteredListings.length} ${label}`;

  renderSearchResults(filteredListings, rentalType, ltPeriod);
}

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
  if (by === 'price_asc')  arr.sort((a,b) => a.price_hour - b.price_hour);
  if (by === 'price_desc') arr.sort((a,b) => b.price_hour - a.price_hour);
  if (by === 'rating')     arr.sort((a,b) => b.rating - a.rating);
  if (by === 'distance')   arr.sort(() => Math.random() - .5);
  filteredListings = arr;
  renderSearchResults(arr);
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
    </div>`;
}

function renderHomeListings() {
  const el = document.getElementById('home-listings');
  if (!el) return;
  if (PARKINGS.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--gray-400);grid-column:1/-1">
        <div style="font-size:3rem;margin-bottom:16px">🅿️</div>
        <p style="font-size:1rem;font-weight:600">החניות הראשונות בדרך!</p>
        <p style="font-size:.88rem;margin-top:8px">פרסם את החניה שלך והיה הראשון</p>
        <button class="btn-primary" style="margin-top:20px;padding:12px 28px" onclick="showPage('host')">פרסם חניה ←</button>
      </div>`;
    return;
  }
  el.innerHTML = PARKINGS.slice(0, 6).map(p => renderCard(p)).join('');
}

function renderSearchResults(list, rentalType = 'all', ltPeriod = 'month') {
  const el      = document.getElementById('search-results');
  const countEl = document.getElementById('results-count');
  if (countEl && countEl.textContent === 'טוען...') countEl.textContent = `${list.length} חניות נמצאו`;
  if (!el) return;

  if (list.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--gray-400)"><div style="font-size:3rem;margin-bottom:16px">🔍</div><p>לא נמצאו חניות. נסה חיפוש אחר.</p></div>';
    return;
  }

  const isLongTerm = rentalType === 'longterm';

  function ltPrice(p) {
    const week     = Math.round(p.price_day * 6.5);
    const twoweeks = Math.round(p.price_day * 12);
    switch(ltPeriod) {
      case 'week':      return { price: week,              label: 'שבוע',    sub: `חיסכון לעומת יומי: ₪${p.price_day * 7 - week}` };
      case 'twoweeks':  return { price: twoweeks,          label: 'שבועיים', sub: `חיסכון לעומת יומי: ₪${p.price_day * 14 - twoweeks}` };
      case 'year':      return { price: p.price_year || p.price_month * 11, label: 'שנה', sub: `חיסכון: ₪${Math.round(p.price_month * 12 - (p.price_year || p.price_month * 11))}` };
      default:          return { price: p.price_month,     label: 'חודש',   sub: `שנתי: ₪${(p.price_year || p.price_month * 11).toLocaleString()}` };
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
          <div class="sc-price">${isLongTerm ? `₪${lt.price.toLocaleString()}<span>/${lt.label}</span>` : `₪${p.price_hour}<span>/שעה</span>`}</div>
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
    </div>`;
  }).join('');

  setTimeout(() => renderLeafletMarkers(list), 10);
}
