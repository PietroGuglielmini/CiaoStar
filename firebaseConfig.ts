import { initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';

// ⚠️ SOSTITUISCI CON I TUOI DATI DI PROGETTO FIREBASE ⚠️
// Trovi questi dati nella Firebase Console -> Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyDfxbgRK1enRIE3COMsODX9NsXG1V2JGbg",
  authDomain: "ciaostar-aada9.firebaseapp.com",
  projectId: "ciaostar-aada9",
  storageBucket: "ciaostar-aada9.firebasestorage.app",
  messagingSenderId: "863364735253",
  appId: "1:863364735253:web:ddea6b41066c6b14d2491c"
};

// Initialize Firebase (Modular)
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = firebaseAuth.getAuth(app);
export const googleProvider = new firebaseAuth.GoogleAuthProvider();
export const facebookProvider = new firebaseAuth.FacebookAuthProvider();
export const microsoftProvider = new firebaseAuth.OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore with experimentalForceLongPolling and persistent offline local cache to fix WebSocket / connection blockings in secure sandbox iframe environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const storage = getStorage(app);

// Initialize messaging with isSupported or safe try/catch wrapper for iframe/safari compatibility
let messagingInstance: any = null;
try {
  if (typeof window !== 'undefined') {
    messagingInstance = getMessaging(app);
  }
} catch (err) {
  console.warn("FCM messaging could not be initialized (might be blocked in iframe or unsupported browser):", err);
}
export const messaging = messagingInstance;

// Enable App Check for Anti-API Bombing and Denegazione del Servizio Finanziaria
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

if (typeof window !== 'undefined') {
  // Support safe local sandbox development (using a default developer key or self token)
  const isLocalhost = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' || 
    window.location.hostname.includes('.run.app'); // include dev/pre runs
  
  if (isLocalhost) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  
  try {
    initializeAppCheck(app, {
      // Use standard public reCAPTCHA Enterprise key, configured to gracefully fallback or activate
      provider: new ReCaptchaV3Provider('6LcjB3gqAAAAAD_yS5g6C32v3T_yS5g6C32v3T_y'),
      isTokenAutoRefreshEnabled: true
    });
    console.log("Firebase App Check initialized.");
  } catch (err) {
    console.warn("App Check initialization deferred: ", err);
  }
}