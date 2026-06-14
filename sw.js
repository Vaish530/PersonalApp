importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyDFr7qzwz_SLm6Jqt_C51WDjKowChfAfzg",
  authDomain: "hubspace-sync.firebaseapp.com",
  projectId: "hubspace-sync",
  storageBucket: "hubspace-sync.firebasestorage.app",
  messagingSenderId: "63137472554",
  appId: "1:63137472554:web:fe6ac12297b3f85a33e353"
};

// Initialize Firebase in Service Worker
firebase.initializeApp(firebaseConfig);

let messaging = null;
try {
  if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
  }
} catch (e) {
  console.warn("Firebase Messaging not supported in Service Worker context.", e);
}

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title || "HubSpace Reminder";
    const notificationOptions = {
      body: payload.notification.body,
      icon: 'logo.png',
      badge: 'logo.png',
      tag: payload.notification.tag || 'hubspace-task-reminder',
      data: payload.data || {}
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

const CACHE_NAME = 'hubspace-cache-v14';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './dome-gallery.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Intercept Event
self.addEventListener('fetch', (event) => {
  // Let the browser handle standard non-GET queries directly
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // Skip caching for Firebase APIs and Serverless functions
  if (url.origin.includes('firebase') || 
      url.origin.includes('googleapis') || 
      url.pathname.includes('/api/')) {
    return;
  }

  // Check if it's a local code asset (html, js, css)
  const isLocalCodeAsset = url.origin === self.location.origin && 
                           (url.pathname === '/' || 
                            url.pathname === '/index.html' || 
                            url.pathname.endsWith('.js') || 
                            url.pathname.endsWith('.css') || 
                            url.pathname.endsWith('.html'));

  if (isLocalCodeAsset) {
    // Network-First Strategy
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return new Response("Offline mode. Some elements could not be loaded.", {
              status: 503,
              statusText: "Offline"
            });
          });
        })
    );
  } else {
    // Stale-While-Revalidate Strategy for external assets / resources
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse.status === 200) {
                  caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                }
              })
              .catch(() => {});
            return cachedResponse;
          }
          return fetch(event.request);
        })
    );
  }
});
