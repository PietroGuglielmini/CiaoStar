// Scripts compat per Firebase Cloud Messaging in Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Inizializza l'applicazione Firebase nel Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyDfxbgRK1enRIE3COMsODX9NsXG1V2JGbg",
  authDomain: "ciaostar-aada9.firebaseapp.com",
  projectId: "ciaostar-aada9",
  storageBucket: "ciaostar-aada9.firebasestorage.app",
  messagingSenderId: "863364735253",
  appId: "1:863364735253:web:ddea6b41066c6b14d2491c"
});

const messaging = firebase.messaging();

// Gestione dei messaggi ricevuti quando l'app è in background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Ricevuto messaggio in background: ', payload);
  
  const notificationTitle = payload.notification ? payload.notification.title : 'Nuovo messaggio in CiaoStar';
  const notificationOptions = {
    body: payload.notification ? payload.notification.body : 'Hai ricevuto un aggiornamento su CiaoStar.',
    icon: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=192&h=192',
    badge: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=192&h=192',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
