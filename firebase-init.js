/**
 * HubSpace Firebase Initialization & Configuration
 */

const firebaseConfig = {
  apiKey: "AIzaSyDFr7qzwz_SLm6Jqt_C51WDjKowChfAfzg",
  authDomain: "hubspace-sync.firebaseapp.com",
  projectId: "hubspace-sync",
  storageBucket: "hubspace-sync.firebasestorage.app",
  messagingSenderId: "63137472554",
  appId: "1:63137472554:web:fe6ac12297b3f85a33e353"
};

const vapidKey = "BPE7xUkDJcDpEPFphcx0HhHDOfZJvJTMXLg8WEgaSyoJCtvQ3jqSLI9RnGt2kGy3VhMaP1X7Mrd_af8iB_x5ldQ";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence for Firestore to handle network disconnects gracefully
db.enablePersistence().catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn("Firestore persistence failed: Multiple tabs open.");
  } else if (err.code == 'unimplemented') {
    console.warn("Firestore persistence is not supported by this browser.");
  }
});

let messaging = null;
try {
  if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
  }
} catch (e) {
  console.warn("Firebase Messaging not supported in this context.", e);
}

// Export references globally
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseMessaging = messaging;
window.firebaseVapidKey = vapidKey;
