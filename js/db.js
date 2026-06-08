// ===== FIRESTORE DATABASE LAYER =====
// All Firestore reads/writes go through this file.

const db = firebase.firestore();

// ── Sanitize user input to prevent XSS ──────────────────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── PARKINGS ─────────────────────────────────────────────────────────────────

async function fetchParkings() {
  try {
    const snap = await db.collection('parkings')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    if (snap.empty) return null; // will fall back to mock data
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[db] fetchParkings:', err.code, err.message);
    return null;
  }
}

async function fetchParking(id) {
  try {
    const doc = await db.collection('parkings').doc(String(id)).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (err) {
    console.error('[db] fetchParking:', err.code);
    return null;
  }
}

// ── Geocode an address via free OpenStreetMap Nominatim ─────────────────────
async function geocodeAddress(address) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', ישראל')}&format=json&limit=1`);
    const data = await res.json();
    if (!data || !data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) {
    console.error('[db] geocodeAddress:', err.message);
    return null;
  }
}

// ── PUBLISH A NEW PARKING (goes live immediately, visible to everyone) ──────

async function submitListing(uid, formData) {
  if (!uid) throw new Error('auth/not-logged-in');

  const address = sanitize(formData.address);
  const coords  = await geocodeAddress(formData.address);
  const city    = formData.address.split(',').map(s => s.trim()).filter(Boolean).pop() || '';

  const parking = {
    ownerId:    uid,
    active:     true,
    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    title:      sanitize(formData.type) + ' · ' + address,
    address:    address,
    city:       sanitize(city),
    lat:        coords ? coords.lat : null,
    lng:        coords ? coords.lng : null,
    rating:     5.0,
    type:       sanitize(formData.type),
    priceHour:  Number(formData.priceHour)  || 0,
    priceDay:   Number(formData.priceDay)   || 0,
    priceMonth: Number(formData.priceMonth) || 0,
    openTime:   sanitize(formData.openTime),
    closeTime:  sanitize(formData.closeTime),
    days:       formData.days || [],
    hasEV:      Boolean(formData.hasEV),
    evType:     sanitize(formData.evType   || ''),
    evKw:       Number(formData.evKw)       || 0,
    gateType:      sanitize(formData.gateType      || 'pin'),
    gateCode:      sanitize(formData.gateCode      || ''),
    intercomPhone: sanitize(formData.intercomPhone  || ''),
    intercomCode:  sanitize(formData.intercomCode   || ''),
    iotUrl:        sanitize(formData.iotUrl         || ''),
    iotToken:      sanitize(formData.iotToken       || ''),
    description:   sanitize(formData.description    || ''),
  };

  const ref = await db.collection('parkings').add(parking);
  return ref.id;
}

// ── BOOKINGS ─────────────────────────────────────────────────────────────────

async function createBooking(uid, bookingData) {
  if (!uid) throw new Error('auth/not-logged-in');

  const booking = {
    userId:     uid,
    parkingId:  String(bookingData.parkingId),
    parkingTitle: sanitize(bookingData.parkingTitle),
    address:    sanitize(bookingData.address),
    type:       sanitize(bookingData.bookingType),
    subtotal:   Number(bookingData.subtotal) || 0,
    fee:        Number(bookingData.fee)      || 0,
    total:      Number(bookingData.total)    || 0,
    payMethod:  sanitize(bookingData.payMethod),
    gateCode:   bookingData.gateCode || '',
    status:     'confirmed',
    createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
    startTime:  bookingData.startTime || null,
    endTime:    bookingData.endTime   || null,
  };

  const ref = await db.collection('bookings').add(booking);
  return ref.id;
}

async function fetchUserBookings(uid) {
  if (!uid) return [];
  try {
    const snap = await db.collection('bookings')
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('[db] fetchUserBookings:', err.code);
    return [];
  }
}

// ── USER PROFILE ─────────────────────────────────────────────────────────────

async function saveUserProfile(uid, data) {
  if (!uid) return;
  try {
    await db.collection('users').doc(uid).set({
      displayName: sanitize(data.displayName || ''),
      email:       sanitize(data.email || ''),
      phone:       sanitize(data.phone || ''),
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('[db] saveUserProfile:', err.code);
  }
}
