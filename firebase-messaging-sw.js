// firebase-messaging-sw.js — NitPark Push Notifications
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC4lgkPwQWLBDPWEGComfS636oLlIJAgZY",
  authDomain: "prkint-749da.firebaseapp.com",
  projectId: "prkint-749da",
  storageBucket: "prkint-749da.firebasestorage.app",
  messagingSenderId: "789519548650",
  appId: "1:789519548650:web:8930690887d3a86bf2d793"
});

const messaging = firebase.messaging();

// התראות ברקע (כשהאפליקציה סגורה)
messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'NitPark', {
    body:  body  || 'התראה חדשה מ-NitPark',
    icon:  icon  || '/icon-192.png',
    badge: '/icon-192.png',
    dir:   'rtl',
    lang:  'he',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'פתח' },
      { action: 'dismiss', title: 'סגור' }
    ]
  });
});

// לחיצה על התראה — פתח את האפליקציה
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      if (wins.length > 0) { wins[0].focus(); return; }
      return clients.openWindow('https://prkint-749da.web.app');
    })
  );
});
