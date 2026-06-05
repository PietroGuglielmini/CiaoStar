import { initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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

// Initialize Firestore with experimentalForceLongPolling and persistent offline local cache to fix WebSocket / connection blockings in secure sandbox iframe environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export const storage = getStorage(app);