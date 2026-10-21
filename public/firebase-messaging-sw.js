importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  projectId: "integral-blend-p6rpq",
  appId: "1:245634302066:web:2c3b789867f72859ebc2eb",
  apiKey: "AIzaSyAdTDpmAxtfMlnKlnhfBWOspWSOcX_td_g",
  authDomain: "integral-blend-p6rpq.firebaseapp.com",
  storageBucket: "integral-blend-p6rpq.firebasestorage.app",
  messagingSenderId: "245634302066"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);
  const notificationTitle = payload.notification?.title || 'NOVA TENTATIVA DE LOGIN';
  const notificationOptions = {
    body: payload.notification?.body || 'Uma tentativa de acesso requer sua aprovação.',
    icon: '/favicon.png',
    data: payload.data || {},
    actions: [
      { action: 'approve', title: 'PERMITIR' },
      { action: 'reject', title: 'RECUSAR' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickAction = event.action;
  const requestId = event.notification.data?.requestId;

  if (clickAction === 'approve') {
    // Open app and trigger approval
    event.waitUntil(
      clients.openWindow('/?action=approve&requestId=' + encodeURIComponent(requestId || ''))
    );
  } else if (clickAction === 'reject') {
    // Open app and trigger rejection
    event.waitUntil(
      clients.openWindow('/?action=reject&requestId=' + encodeURIComponent(requestId || ''))
    );
  } else {
    // Just focus/open the window
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});
