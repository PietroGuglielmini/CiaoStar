import { useState, useEffect } from 'react';
import { db, messaging } from '../firebaseConfig';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';

export const usePushNotifications = (userId: string | undefined) => {
  const [token, setToken] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  const requestPermissionAndSaveToken = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn("Questo browser o sandbox non supporta le notifiche push.");
      return null;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        if (!messaging) {
          console.warn("Il modulo Firebase Messaging non è stato inizializzato (unsupported o iframe sandbox).");
          return null;
        }

        // Tenta di ottenere il token FCM
        // Recupera VAPID key da env. In caso di mancanza, usa il flusso automatico associato al sender ID
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || import.meta.env.VITE_VAPID_KEY || undefined;
        
        // Risolve l'installazione del service worker
        const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.ready;
        
        const fcmToken = await getToken(messaging, { 
          vapidKey,
          serviceWorkerRegistration: registration
        });

        if (fcmToken) {
          setToken(fcmToken);
          console.log("FCM Token acquisito con successo:", fcmToken);

          if (userId) {
            const userRef = doc(db, 'users', userId);
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(fcmToken)
            });
            console.log("FCM Token sincronizzato su Firestore per l'utente:", userId);
          }
          return fcmToken;
        } else {
          console.warn("Nessun FCM token disponibile.");
        }
      } else {
        console.warn("Permesso per le notifiche rifiutato.");
      }
    } catch (err) {
      console.error("Errore durante recupero FCM Token:", err);
    }
    return null;
  };

  // Autoload token se il permesso è già attivo sul dispositivo per l'utente loggato
  useEffect(() => {
    if (userId && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      requestPermissionAndSaveToken();
    }
  }, [userId]);

  return {
    token,
    permission,
    requestPermissionAndSaveToken
  };
};
