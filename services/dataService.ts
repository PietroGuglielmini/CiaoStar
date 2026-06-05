
import { db, storage, auth } from '../firebaseConfig';
import { 
  collection, addDoc, getDocs, query, where, updateDoc, doc, getDoc, setDoc, 
  orderBy, limit, serverTimestamp, increment, onSnapshot, deleteDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, SettableMetadata, deleteObject, uploadBytesResumable } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Talent, User, UserRole, VideoRequest, RequestStatus, AdminSettings, AuditLog, ChatMessage, Conversation, VerificationStatus, DisputeCategory, InAppNotification, Review, EmailSettings } from '../types';
import { ADMIN_EMAIL, DEFAULT_ADMIN_SETTINGS, DB_CATEGORIES_SEED } from '../constants';
import { addWatermarkToVideo } from './videoUtils';

// --- SETTINGS ---

export const getAdminSettings = async (): Promise<AdminSettings> => {
    const settingsRef = doc(db, 'settings', 'global_config');
    const snap = await getDoc(settingsRef);
    if (snap.exists()) return snap.data() as AdminSettings;
    await setDoc(settingsRef, { ...DEFAULT_ADMIN_SETTINGS });
    return DEFAULT_ADMIN_SETTINGS;
};

export const updateAdminSettings = async (data: Partial<AdminSettings>) => {
    const settingsRef = doc(db, 'settings', 'global_config');
    await updateDoc(settingsRef, data);
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const getEmailSettings = async (): Promise<EmailSettings | null> => {
    try {
        const settingsRef = doc(db, 'system_settings', 'payment_and_email');
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
            return snap.data() as EmailSettings;
        }
        return null;
    } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'system_settings/payment_and_email');
        return null;
    }
};

export const updateEmailSettings = async (data: EmailSettings) => {
    try {
        const settingsRef = doc(db, 'system_settings', 'payment_and_email');
        await setDoc(settingsRef, {
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'system_settings/payment_and_email');
    }
};

// --- USER & VERIFICATION ---

export const syncUserToDB = async (user: Partial<User>) => {
  const userRef = doc(db, 'users', user.id!);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    // Verifica se esiste un talento pre-creato con questa email
    const preCreatedRef = doc(db, 'users', user.email!.toLowerCase());
    const preCreatedSnap = await getDoc(preCreatedRef);
    
    let baseRole = UserRole.FAN;
    let extraData = {};
    
    if (preCreatedSnap.exists()) {
      const data = preCreatedSnap.data();
      baseRole = data.role || UserRole.TALENT;
      extraData = data;
      // Elimina il documento temporaneo basato sul nome/email
      await deleteDoc(preCreatedRef);
    } else {
      // Come backup, eseguiamo anche una query per email per essere sicuri al 100%
      const q = query(collection(db, 'users'), where('email', '==', user.email!.toLowerCase()), where('role', '==', UserRole.TALENT));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const foundDoc = qSnap.docs[0];
        baseRole = foundDoc.data().role || UserRole.TALENT;
        extraData = foundDoc.data();
        await deleteDoc(doc(db, 'users', foundDoc.id));
      }
    }

    const newUser = {
      ...user,
      ...extraData,
      id: user.id!, // assicura l'ID di autenticazione reale
      role: user.email === ADMIN_EMAIL ? UserRole.ADMIN : baseRole,
      lastAcceptedTermsVersion: 0,
      isApproved: user.email === ADMIN_EMAIL || (extraData as any).isApproved || false,
      createdAt: new Date().toISOString(),
      instagramVerificationCode: (extraData as any).instagramVerificationCode || `CS-${Math.floor(1000 + Math.random() * 9000)}`,
      isInstagramVerified: (extraData as any).isInstagramVerified || false,
      verificationStatus: (extraData as any).verificationStatus || ('unverified' as VerificationStatus)
    };
    await setDoc(userRef, newUser);
    return newUser as User;
  }
  return { ...user, ...userSnap.data() } as User;
};

export const createPreCreatedTalent = async (email: string, name: string) => {
    const docId = email.trim().toLowerCase();
    const userRef = doc(db, 'users', docId);
    
    const newPreTalent = {
        email: docId,
        name: name.trim(),
        role: UserRole.TALENT,
        isApproved: true,
        isInstagramVerified: true,
        verificationStatus: 'verified' as VerificationStatus,
        createdAt: new Date().toISOString(),
        instagramVerificationCode: `CS-${Math.floor(1000 + Math.random() * 9000)}`,
        category: 'Influencer',
        price: 50,
        bio: `Ciao! Sono ${name.trim()} e sono una Star di CiaoStar! Prenota un mio video messaggio personalizzato.`,
        tags: ['vip', 'creator'],
        responseTimeDays: 7,
        rating: 5,
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=800'
    };
    
    await setDoc(userRef, newPreTalent);
    return newPreTalent;
};

export const getUserById = async (userId: string): Promise<User | null> => {
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as User : null;
};

export const getAllUsersAdmin = async (): Promise<User[]> => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
};

export const updateUserApprovalStatus = async (userId: string, isApproved: boolean) => {
    await updateDoc(doc(db, 'users', userId), { isApproved });
};

export const updateUserDisabledStatus = async (userId: string, isDisabled: boolean) => {
    await updateDoc(doc(db, 'users', userId), { isDisabled });
};

export const updateTalentCustomCommission = async (userId: string, commissionPercent: number | null) => {
    await updateDoc(doc(db, 'users', userId), { customCommissionPercent: commissionPercent });
};

export const verifyInstagramAdmin = async (userId: string, status: boolean) => {
    await updateDoc(doc(db, 'users', userId), { isInstagramVerified: status });
};

export const uploadVerificationVideo = async (file: File, userId: string): Promise<string> => {
    const storageRef = ref(storage, `verification-proofs/${userId}_proof.webm`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'users', userId), { 
        verificationVideoUrl: url,
        verificationStatus: 'pending' as VerificationStatus
    });
    return url;
};

export const updateVerificationStatus = async (userId: string, status: VerificationStatus) => {
    await updateDoc(doc(db, 'users', userId), { 
        verificationStatus: status,
        isApproved: status === 'verified'
    });
};

export const uploadIntroVideo = async (file: File, userId: string): Promise<string> => {
    const settings = await getAdminSettings();
    
    let fileToUpload: Blob = file;
    let finalExtension = file.name.split('.').pop() || 'mp4';

    try {
        const processed = await addWatermarkToVideo(file, settings);
        fileToUpload = processed.blob;
        finalExtension = processed.extension;
    } catch (e) {
        console.error("Intro video formatting/watermarking failed, uploading original:", e);
    }

    const storageRef = ref(storage, `intro-videos/${userId}_intro.${finalExtension}`);
    const metadata = {
        contentType: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        cacheControl: 'public,max-age=3600'
    };
    await uploadBytes(storageRef, fileToUpload, metadata);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'users', userId), { 
        introVideoUrl: url
    });
    return url;
};

export const recalculateTalentRating = async (talentId: string) => {
    try {
        const reviewsRef = collection(db, 'reviews');
        const q = query(reviewsRef, where('talentId', '==', talentId));
        const snap = await getDocs(q);
        let total = 0;
        let count = 0;
        snap.forEach(d => {
            const data = d.data();
            if (!data.isHidden) {
                total += data.rating;
                count++;
            }
        });
        const avg = count > 0 ? Number((total / count).toFixed(1)) : 5;
        await updateDoc(doc(db, 'users', talentId), {
            rating: avg
        });
    } catch (err) {
        console.error("Errore ricalcolo rating talent:", err);
    }
};

export const submitReview = async (review: Omit<Review, 'createdAt'>) => {
    const reviewDoc = doc(collection(db, 'reviews'));
    const newReview = {
        ...review,
        createdAt: new Date().toISOString()
    };
    await setDoc(reviewDoc, newReview);

    try {
        await updateDoc(doc(db, 'requests', review.orderId), { 
            reviewSubmitted: true,
            rating: review.rating,
            reviewComment: review.comment
        });
    } catch (e) {
        console.error("Errore aggiornamento flag recensione in richiesta:", e);
    }

    await recalculateTalentRating(review.talentId);
};

export const getReviewsForTalent = async (talentId: string): Promise<Review[]> => {
    try {
        const q = query(collection(db, 'reviews'), where('talentId', '==', talentId));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
        const active = list.filter(r => !r.isHidden);
        return active.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
    } catch (e) {
        console.error("Errore fetch recensioni:", e);
        return [];
    }
};

export const getAllReviewsAdmin = async (): Promise<Review[]> => {
    try {
        const snap = await getDocs(collection(db, 'reviews'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Review));
        return list.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
    } catch (e) {
        console.error("Errore recupero recensioni admin:", e);
        return [];
    }
};

export const updateReviewModeration = async (reviewId: string, isHidden: boolean, talentId: string) => {
    await updateDoc(doc(db, 'reviews', reviewId), { isHidden });
    await recalculateTalentRating(talentId);
};

export const publishSampleVideo = async (order: VideoRequest) => {
    try {
        if (!order.videoUrl) return;
        const sampleRef = doc(db, 'public_samples', order.id);
        await setDoc(sampleRef, {
            id: order.id,
            talentId: order.talentId,
            videoUrl: order.videoUrl,
            recipientName: order.recipientName || '',
            occasion: order.occasion || '',
            createdAt: new Date().toISOString()
        });
        console.log(`Video dell'ordine #${order.id} pubblicato come esempio per talent ${order.talentId}`);
    } catch (err) {
        console.error("Errore salvataggio campione pubblico:", err);
    }
};

export const getPublicSamplesForTalent = async (talentId: string): Promise<any[]> => {
    try {
        const q = query(collection(db, 'public_samples'), where('talentId', '==', talentId));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => d.data());
        return list.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
    } catch (err) {
        console.error("Errore getPublicSamplesForTalent:", err);
        return [];
    }
};

export const getAllTalentsForAdmin = async (): Promise<User[]> => {
    const q = query(collection(db, 'users'), where('role', '==', UserRole.TALENT));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        isApproved: d.data().isApproved ?? false,
        isInstagramVerified: d.data().isInstagramVerified ?? false
    } as User));
};

export const getPendingTalents = async (): Promise<User[]> => {
    const q = query(collection(db, 'users'), where('role', '==', UserRole.TALENT), where('verificationStatus', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
};

// --- IN-APP NOTIFICATIONS ---

export type NotificationType = 'orderCreated' | 'orderAccepted' | 'orderRejected' | 'videoUploaded' | 'disputeOpened' | 'disputeResolved' | 'orderCompleted';

export const createNotification = async (
    recipientId: string,
    title: string,
    message: string,
    orderId?: string,
    type?: NotificationType
) => {
    try {
        let recipientUser: User | null = null;
        if (type) {
            const settings = await getAdminSettings();
            const config = settings.enabledNotifications;
            if (config && config[type] === false) {
                console.log(`Notifica di tipo ${type} disabilitata dall'amministratore.`);
                return;
            }

            const isNonNegotiable = settings.nonNegotiableNotifications?.[type] === true;
            if (!isNonNegotiable && recipientId !== 'ADMIN') {
                recipientUser = await getUserById(recipientId);
                if (recipientUser) {
                    const userPrefs = recipientUser.notificationPreferences;
                    if (userPrefs && userPrefs[type] === false) {
                        console.log(`L'utente ${recipientId} ha disattivato le notifiche di tipo ${type}.`);
                        return;
                    }
                }
            }
        }

        await addDoc(collection(db, 'notifications'), {
            recipientId,
            title,
            message,
            orderId: orderId || null,
            createdAt: new Date().toISOString(),
            read: false
        });

        // Invio e-mail simulata
        let emailAddress = "";
        if (recipientId === 'ADMIN') {
            emailAddress = ADMIN_EMAIL;
        } else {
            if (!recipientUser) {
                recipientUser = await getUserById(recipientId);
            }
            if (recipientUser && recipientUser.email) {
                emailAddress = recipientUser.email;
            }
        }

        if (emailAddress) {
            try {
                await addDoc(collection(db, 'sent_emails'), {
                    to: emailAddress,
                    subject: `[CiaoStar] ${title}`,
                    body: message,
                    createdAt: new Date().toISOString()
                });
                console.log(`[SIMULATION EMAIL SENT] To: ${emailAddress} | Title: ${title}`);
            } catch (mailErr) {
                console.error("Errore invio e-mail:", mailErr);
            }
        }
    } catch (e) {
        console.error("Errore durante la creazione della notifica:", e);
    }
};

export const listenNotifications = (userId: string, role: UserRole, callback: (notifications: InAppNotification[]) => void) => {
    let q;
    if (role === UserRole.ADMIN) {
        q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', 'ADMIN')
        );
    } else {
        q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', userId)
        );
    }
    return onSnapshot(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as InAppNotification));
        // Sort client-side to avoid requiring composite indexes in Firestore
        const sortedList = list.sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
        });
        callback(sortedList);
    }, (error) => {
        console.error("Errore nell'ascolto delle notifiche:", error);
    });
};

export const markNotificationRead = async (notificationId: string, read: boolean = true) => {
    try {
        await updateDoc(doc(db, 'notifications', notificationId), { read });
    } catch (e) {
        console.error("Errore nell'aggiornamento della notifica:", e);
    }
};

export const markAllNotificationsRead = async (userId: string, role: UserRole) => {
    try {
        let q;
        if (role === UserRole.ADMIN) {
            q = query(collection(db, 'notifications'), where('recipientId', '==', 'ADMIN'), where('read', '==', false));
        } else {
            q = query(collection(db, 'notifications'), where('recipientId', '==', userId), where('read', '==', false));
        }
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => updateDoc(doc(db, 'notifications', d.id), { read: true })));
    } catch (e) {
        console.error("Errore nel segnare tutte le notifiche come lette:", e);
    }
};

// --- ORDERS & DISPUTES ---

export const createRequest = async (
    requestData: Omit<VideoRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'expirationTimestamp' | 'maxDeliveryDaysSnapshot' | 'applicationFee'>,
    customDeadlineDays?: number
) => {
    const settings = await getAdminSettings();
    const now = new Date();
    
    const daysToExpiration = customDeadlineDays || settings.maxDeliveryDays || 7;
    const expirationDate = new Date(now.getTime() + daysToExpiration * 24 * 60 * 60 * 1000);
    
    let commissionPercent = settings.platformFeePercent !== undefined ? settings.platformFeePercent : 20;
    try {
        const talentDoc = await getDoc(doc(db, 'users', requestData.talentId));
        if (talentDoc.exists()) {
            const talentData = talentDoc.data() as User;
            if (talentData.customCommissionPercent !== undefined && talentData.customCommissionPercent !== null) {
                commissionPercent = talentData.customCommissionPercent;
            }
        }
    } catch (e) {
        console.error("Errore nel recuperare la commissione personalizzata del talent:", e);
    }
    
    const appFee = (requestData.pricePaid * commissionPercent) / 100;

    const finalOrder: Omit<VideoRequest, 'id'> = {
        ...requestData,
        status: RequestStatus.PENDING,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        applicationFee: appFee,
        maxDeliveryDaysSnapshot: daysToExpiration,
        expirationTimestamp: expirationDate.toISOString(),
        history: [{
            action: "Richiesta creata dal Fan",
            timestamp: now.toISOString(),
            note: `Destinatario: ${requestData.recipientName}, Occasione: ${requestData.occasion}`
        }]
    };

    const docRef = await addDoc(collection(db, 'orders'), finalOrder);
    
    // Notifica per la Star ricevente
    await createNotification(
        requestData.talentId,
        "Nuova richiesta ricevuta!",
        `Hai ricevuto una nuova richiesta da parte di ${requestData.fanName} per ${requestData.recipientName}!`,
        docRef.id,
        'orderCreated'
    );

    return docRef.id;
};

export const updateRequestStatus = async (requestId: string, status: RequestStatus, extraData: any = {}) => {
    const orderDocRef = doc(db, 'orders', requestId);
    const snap = await getDoc(orderDocRef);
    let history: OrderHistoryEvent[] = [];
    if (snap.exists()) {
        const data = snap.data() as VideoRequest;
        history = data.history || [];
    }

    const nowStr = new Date().toISOString();
    let actionName = `Stato modificato in ${status}`;
    let note = "";
    if (status === RequestStatus.ACCEPTED) {
        actionName = "Richiesta accettata dalla Star";
    } else if (status === RequestStatus.REJECTED) {
        actionName = "Richiesta rifiutata dalla Star";
        note = extraData?.rejectionReason || "";
    } else if (status === RequestStatus.CANCELED) {
        actionName = "Richiesta annullata";
        note = extraData?.rejectionReason || "";
    } else if (status === RequestStatus.REFUNDED) {
        actionName = "Richiesta rimborsata";
        note = extraData?.rejectionReason || "";
    }

    const newEvent: OrderHistoryEvent = {
        action: actionName,
        timestamp: nowStr,
        note
    };

    const fieldsToUpdate: any = { 
        status, 
        ...extraData,
        history: [...history, newEvent],
        updatedAt: nowStr 
    };
    if (status === RequestStatus.ACCEPTED) {
        fieldsToUpdate.acceptedAt = nowStr;
    }
    await updateDoc(orderDocRef, fieldsToUpdate);

    try {
        const orderSnap = await getDoc(orderDocRef);
        if (orderSnap.exists()) {
            const order = orderSnap.data() as VideoRequest;
            const shortId = requestId.substring(0, 6).toUpperCase();
            if (status === RequestStatus.ACCEPTED) {
                await createNotification(
                    order.fanId,
                    "Richiesta Accettata!",
                    `Grande notizia! ${order.talentName || 'La stella'} ha accettato la tua richiesta #${shortId}. Riceverai il video a breve!`,
                    requestId,
                    'orderAccepted'
                );
            } else if (status === RequestStatus.REJECTED) {
                const reason = extraData?.rejectionReason || "Nessun motivo specificato";
                await createNotification(
                    order.fanId,
                    "Richiesta Rifiutata",
                    `Spiacenti, ${order.talentName || 'La stella'} ha rifiutato la tua richiesta #${shortId}. Motivo: ${reason}`,
                    requestId,
                    'orderRejected'
                );
            }
        }
    } catch (e) {
        console.error("Errore nell'invio della notifica di aggiornamento stato ordine:", e);
    }
};

export const correctVideoRequest = async (
    requestId: string, 
    data: { recipientName: string; instructions: string; occasion: string }
) => {
    const orderDoc = doc(db, 'orders', requestId);
    const snap = await getDoc(orderDoc);
    if (!snap.exists()) {
        throw new Error("Ordine non trovato");
    }
    const currentOrder = snap.data() as VideoRequest;
    const correctionCount = (currentOrder.correctionCount || 0) + 1;
    const history = currentOrder.history || [];

    const newEvent: OrderHistoryEvent = {
        action: "Richiesta corretta dal Fan",
        timestamp: new Date().toISOString(),
        note: `Istruzioni aggiornate (correzioni: ${correctionCount}).`
    };

    const fieldsToUpdate = {
        recipientName: data.recipientName.trim(),
        instructions: data.instructions.trim(),
        occasion: data.occasion.trim(),
        status: RequestStatus.PENDING,
        correctionCount,
        history: [...history, newEvent],
        updatedAt: new Date().toISOString()
    };

    await updateDoc(orderDoc, fieldsToUpdate);

    try {
        await createNotification(
            currentOrder.talentId,
            "Richiesta corretta!",
            `Il fan ${currentOrder.fanName} ha corretto la sua richiesta #${requestId.substring(0, 6).toUpperCase()}. Controlla le istruzioni aggiornate!`,
            requestId,
            'orderCreated'
        );
    } catch (e) {
        console.error("Errore notifica correzione:", e);
    }
};

export const uploadVideo = async (file: File, requestId: string, qualityCheck: VideoRequest['talentQualityCheck']) => {
    const settings = await getAdminSettings();
    
    let fileToUpload: Blob = file;
    let finalExtension = file.name.split('.').pop() || 'mp4';

    try {
        const processed = await addWatermarkToVideo(file, settings);
        fileToUpload = processed.blob;
        finalExtension = processed.extension;
    } catch (e) {
        console.error("Video formatting/watermarking failed, uploading original:", e);
    }

    const fileName = `${requestId}_${Date.now()}.${finalExtension}`;
    const storageRef = ref(storage, `videos/${fileName}`);
    
    // Metadati cruciali per il download
    const metadata: SettableMetadata = {
        contentDisposition: `attachment; filename="ciaostar_video_${requestId}.${finalExtension}"`,
        contentType: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        cacheControl: 'public,max-age=3600'
    };

    // 1. Caricamento su Firebase Storage
    const uploadResult = await uploadBytes(storageRef, fileToUpload, metadata);
    const url = await getDownloadURL(storageRef);
    
    // 2. Recupero info ordine
    const orderRef = doc(db, 'orders', requestId);
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? (orderSnap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent: OrderHistoryEvent = {
        action: "Video caricato dalla Star",
        timestamp: new Date().toISOString(),
        note: "Video caricato nel database."
    };

    // 3. Creazione record nella collezione 'videos' (Richiesta screenshot)
    await addDoc(collection(db, 'videos'), {
        createdAt: new Date().toISOString(),
        format: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        requestId: requestId,
        sizeBytes: uploadResult.metadata.size,
        talentId: orderData.talentId || 'unknown',
        url: url,
        views: 0
    });
    
    // 4. Aggiornamento dell'ordine
    await updateDoc(orderRef, { 
        videoUrl: url, 
        status: RequestStatus.COMPLETED,
        updatedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        talentQualityCheck: qualityCheck,
        history: [...history, newEvent]
    });
};

export const uploadVideoOnly = async (file: File, requestId: string): Promise<string> => {
    const settings = await getAdminSettings();
    
    let fileToUpload: Blob = file;
    let finalExtension = file.name.split('.').pop() || 'mp4';

    try {
        const processed = await addWatermarkToVideo(file, settings);
        fileToUpload = processed.blob;
        finalExtension = processed.extension;
    } catch (e) {
        console.error("Video formatting/watermarking failed, uploading original:", e);
    }

    const fileName = `${requestId}_${Date.now()}.${finalExtension}`;
    const storageRef = ref(storage, `videos/${fileName}`);
    
    const metadata: SettableMetadata = {
        contentDisposition: `attachment; filename="ciaostar_video_${requestId}.${finalExtension}"`,
        contentType: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        cacheControl: 'public,max-age=3600'
    };

    const uploadResult = await uploadBytes(storageRef, fileToUpload, metadata);
    const url = await getDownloadURL(storageRef);
    
    const orderRef = doc(db, 'orders', requestId);
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? (orderSnap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent: OrderHistoryEvent = {
        action: "Bozza caricata dalla Star",
        timestamp: new Date().toISOString()
    };

    await addDoc(collection(db, 'videos'), {
        createdAt: new Date().toISOString(),
        format: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        requestId: requestId,
        sizeBytes: uploadResult.metadata.size,
        talentId: orderData.talentId || 'unknown',
        url: url,
        views: 0
    });
    
    await updateDoc(orderRef, { 
        videoUrl: url, 
        history: [...history, newEvent],
        updatedAt: new Date().toISOString()
    });

    return url;
};

export const deliverVideo = async (requestId: string, qualityCheck: VideoRequest['talentQualityCheck']) => {
    const orderRef = doc(db, 'orders', requestId);
    const snap = await getDoc(orderRef);
    const orderData = snap.exists() ? (snap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent: OrderHistoryEvent = {
        action: "Video consegnato al Fan",
        timestamp: new Date().toISOString(),
        note: "Verifica qualità effettuata dalla Star."
    };

    await updateDoc(orderRef, {
        status: RequestStatus.COMPLETED,
        updatedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        talentQualityCheck: qualityCheck,
        acceptedByFan: false,
        acceptedByFanAt: null,
        history: [...history, newEvent]
    });

    try {
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
            const order = snap.data() as VideoRequest;
            const shortId = requestId.substring(0, 6).toUpperCase();
            await createNotification(
                order.fanId,
                "Video caricato!",
                `${order.talentName || 'La stella'} ha caricato il tuo video messaggio #${shortId}! Guardalo ora nella tua dashboard.`,
                requestId,
                'videoUploaded'
            );
        }
    } catch (e) {
        console.error("Errore notifica consegna video:", e);
    }
};

export const openDispute = async (requestId: string, category: DisputeCategory, reason: string) => {
    const orderRef = doc(db, 'orders', requestId);
    const snap = await getDoc(orderRef);
    const orderData = snap.exists() ? (snap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent: OrderHistoryEvent = {
        action: "Disputa aperta dal Fan",
        timestamp: new Date().toISOString(),
        note: `Categoria: ${category}. Motivo: ${reason}`
    };

    await updateDoc(orderRef, { 
        status: RequestStatus.DISPUTE_OPEN, 
        disputeCategory: category,
        disputeReason: reason,
        history: [...history, newEvent],
        updatedAt: new Date().toISOString()
    });

    try {
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
            const order = orderSnap.data() as VideoRequest;
            const shortId = requestId.substring(0, 6).toUpperCase();
            
            // Notifica per l'Admin
            await createNotification(
                'ADMIN',
                "Disputa Aperta",
                `Il fan ${order.fanName} ha aperto una disputa per l'ordine #${shortId} (Motivo: ${reason}).`,
                requestId,
                'disputeOpened'
            );

            // Notifica per il VIP
            await createNotification(
                order.talentId,
                "Ordine Contestato",
                `Il fan ha aperto una contestazione per l'ordine #${shortId}. Lo Staff sta esaminando il video.`,
                requestId,
                'disputeOpened'
            );
        }
    } catch (e) {
        console.error("Errore notifica apertura disputa:", e);
    }
};

export const resolveDispute = async (requestId: string, action: 'REFUND' | 'CORRECTION' | 'FORCE_ACCEPT') => {
    const orderRef = doc(db, 'orders', requestId);
    const snap = await getDoc(orderRef);
    const orderData = snap.exists() ? (snap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    let actionLabel = "";
    if (action === 'REFUND') {
        actionLabel = "Disputa risolta: rimborsata dallo Staff";
    } else if (action === 'CORRECTION') {
        actionLabel = "Disputa risolta: richiesta correzione dallo Staff";
    } else if (action === 'FORCE_ACCEPT') {
        actionLabel = "Disputa risolta: accettazione forzata dallo Staff";
    }

    const newEvent: OrderHistoryEvent = {
        action: actionLabel,
        timestamp: new Date().toISOString()
    };

    if (action === 'REFUND') {
        await updateDoc(orderRef, {
            status: RequestStatus.REFUNDED,
            history: [...history, newEvent],
            updatedAt: new Date().toISOString()
        });
    } else if (action === 'CORRECTION') {
        await updateDoc(orderRef, {
            status: RequestStatus.CORRECTION_NEEDED,
            acceptedByFan: false,
            acceptedByFanAt: null,
            history: [...history, newEvent],
            updatedAt: new Date().toISOString()
        });
    } else if (action === 'FORCE_ACCEPT') {
        await updateDoc(orderRef, {
            status: RequestStatus.COMPLETED,
            acceptedByFan: true,
            acceptedByFanAt: new Date().toISOString(),
            history: [...history, newEvent],
            updatedAt: new Date().toISOString()
        });
    }

    try {
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
            const order = snap.data() as VideoRequest;
            const shortId = requestId.substring(0, 6).toUpperCase();
            if (action === 'REFUND') {
                await createNotification(
                    order.fanId,
                    "Rimborso Eseguito",
                    `La disputa per l'ordine #${shortId} è stata risolta a tuo favore. L'importo è stato rimborsato interamente.`,
                    requestId,
                    'disputeResolved'
                );
                await createNotification(
                    order.talentId,
                    "Ordine Rimborsato",
                    `La disputa per l'ordine #${shortId} è stata chiusa a favore del Fan. L'importo è stato rimborsato.`,
                    requestId,
                    'disputeResolved'
                );
            } else if (action === 'CORRECTION') {
                await createNotification(
                    order.fanId,
                    "Correzione Approvata",
                    `La disputa per l'ordine #${shortId} è stata risolta a tuo favore. È stata richiesta una correzione al VIP.`,
                    requestId,
                    'disputeResolved'
                );
                await createNotification(
                    order.talentId,
                    "Correzione Richiesta dello Staff",
                    `Lo Staff ti richiede di correggere/ricaricare il video messaggio #${shortId} per allinearlo alle istruzioni del Fan.`,
                    requestId,
                    'disputeResolved'
                );
            } else if (action === 'FORCE_ACCEPT') {
                await createNotification(
                    order.fanId,
                    "Disputa Chiusa dallo Staff",
                    `La disputa per l'ordine #${shortId} è stata chiusa. Lo Staff ha ritenuto il video valido e idoneo.`,
                    requestId,
                    'disputeResolved'
                );
                await createNotification(
                    order.talentId,
                    "Disputa Chiusa a tuo favore",
                    `Ottime notizie! La contestazione per l'ordine #${shortId} è stata chiusa a tuo favore. L'ordine è ora completato.`,
                    requestId,
                    'disputeResolved'
                );

                if (order.allowPublicSample) {
                    await publishSampleVideo(order);
                }
            }
        }
    } catch (e) {
        console.error("Errore notifica risoluzione disputa:", e);
    }
};

export const acceptVideoDefinitively = async (requestId: string) => {
    const orderRef = doc(db, 'orders', requestId);
    const snap = await getDoc(orderRef);
    const orderData = snap.exists() ? (snap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent: OrderHistoryEvent = {
        action: "Video approvato definitivamente dal Fan",
        timestamp: new Date().toISOString()
    };

    await updateDoc(orderRef, {
        acceptedByFan: true,
        acceptedByFanAt: new Date().toISOString(),
        status: RequestStatus.COMPLETED,
        history: [...history, newEvent],
        updatedAt: new Date().toISOString()
    });

    try {
        const snap = await getDoc(orderRef);
        if (snap.exists()) {
            const order = snap.data() as VideoRequest;
            const shortId = requestId.substring(0, 6).toUpperCase();
            await createNotification(
                order.talentId,
                "Video Accettato definitivamente",
                `Il fan ${order.fanName} ha accettato definitivamente il tuo video per l'ordine #${shortId}!`,
                requestId,
                'orderCompleted'
            );

            if (order.allowPublicSample) {
                await publishSampleVideo(order);
            }
        }
    } catch (e) {
        console.error("Errore notifica accettazione definitiva:", e);
    }
};


export const getAllOrdersAdmin = async (): Promise<VideoRequest[]> => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoRequest));
    return await checkAndApplyAutoDeletion(results);
};

export const getRequestsForUser = async (userId: string, role: UserRole): Promise<VideoRequest[]> => {
    const field = role === UserRole.FAN ? 'fanId' : 'talentId';
    try {
        const q = query(
            collection(db, 'orders'), 
            where(field, '==', userId), 
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoRequest));
        return await checkAndApplyAutoDeletion(results);
    } catch (e) {
        const q = query(
            collection(db, 'orders'), 
            where(field, '==', userId)
        );
        const snap = await getDocs(q);
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoRequest));
        const sorted = results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return await checkAndApplyAutoDeletion(sorted);
    }
};

export const subscribeToRequestsForUser = (
    userId: string, 
    role: UserRole, 
    callback: (orders: VideoRequest[]) => void
) => {
    const field = role === UserRole.FAN ? 'fanId' : 'talentId';
    const q = query(
        collection(db, 'orders'), 
        where(field, '==', userId), 
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, async (snap) => {
        const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoRequest));
        const processed = await checkAndApplyAutoDeletion(results);
        callback(processed);
    }, (error) => {
        console.warn("Retrying query without orderBy because of missing index:", error);
        const q2 = query(
            collection(db, 'orders'), 
            where(field, '==', userId)
        );
        onSnapshot(q2, async (snap) => {
            const results = snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoRequest));
            results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const processed = await checkAndApplyAutoDeletion(results);
            callback(processed);
        });
    });
};

export const getTalents = async (): Promise<Talent[]> => {
    const q = query(collection(db, 'users'), where('role', '==', UserRole.TALENT));
    const snap = await getDocs(q);
    
    return snap.docs.map(d => {
        const data = d.data();
        return { 
            id: d.id, 
            ...data,
            isApproved: data.isApproved ?? false,
            isInstagramVerified: data.isInstagramVerified ?? false,
            category: data.category || 'Influencer',
            price: data.price || 0,
            tags: data.tags || [],
            rating: data.rating || 5,
            responseTimeDays: data.responseTimeDays || 7,
            avatarUrl: data.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=800'
        } as Talent;
    }).filter(t => t.isApproved && t.isInstagramVerified && !t.isDisabled); 
};

export const getTalentById = async (id: string): Promise<Talent | undefined> => {
    const docSnap = await getDoc(doc(db, 'users', id));
    if (!docSnap.exists()) return undefined;
    const data = docSnap.data();
    if (data.isDisabled === true) return undefined;
    return { 
        id: docSnap.id, 
        ...data,
        isApproved: data.isApproved ?? false,
        isInstagramVerified: data.isInstagramVerified ?? false,
        tags: data.tags || [],
        price: data.price || 0,
        category: data.category || 'Influencer'
    } as Talent;
};

export const acceptNewTerms = async (userId: string, version: number) => {
    await updateDoc(doc(db, 'users', userId), { lastAcceptedTermsVersion: version });
};

export const getCategories = async (): Promise<string[]> => {
    return DB_CATEGORIES_SEED;
};

export const updateTalentProfile = async (userId: string, data: Partial<Talent>) => {
    await updateDoc(doc(db, 'users', userId), data);
};

export const uploadAvatar = async (file: File, userId: string): Promise<string> => {
    const storageRef = ref(storage, `avatars/${userId}_${Date.now()}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
};

export const getAuditLogs = async (): Promise<AuditLog[]> => {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
};

// --- CHAT SYSTEM ---

export const sendMessage = async (conversationId: string, senderId: string, text: string, isAdmin: boolean) => {
    if (!isAdmin) {
        const userRef = doc(db, 'users', senderId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const userData = userSnap.data();
            const nowMs = Date.now();
            const oneHourAgoMs = nowMs - 60 * 60 * 1000;
            let timestamps = (userData.sentStaffMessageTimestamps || []) as string[];
            // Pulisce timestamp più vecchi di un'ora
            timestamps = timestamps.filter(t => new Date(t).getTime() > oneHourAgoMs);
            
            // Trova soglia impostata dall'admin
            const adminSettingsRef = doc(db, 'settings', 'global_config');
            const settingsSnap = await getDoc(adminSettingsRef);
            const settings = settingsSnap.exists() ? settingsSnap.data() as AdminSettings : null;
            const limit = settings?.messageLimitPerHour ?? 10;
            
            if (timestamps.length >= limit) {
                throw new Error(`Hai superato la limitazione di messaggi con lo staff. Massimo ${limit} messaggi ogni ora.`);
            }
            
            timestamps.push(new Date().toISOString());
            await updateDoc(userRef, { sentStaffMessageTimestamps: timestamps });
        }
    }

    const msgData = {
        senderId,
        text,
        isAdmin,
        timestamp: serverTimestamp(),
        isEdited: false
    };
    
    await addDoc(collection(db, 'conversations', conversationId, 'messages'), msgData);
    
    const convRef = doc(db, 'conversations', conversationId);
    const convSnap = await getDoc(convRef);
    
    const updateData: any = {
        lastMessage: text,
        lastMessageAt: serverTimestamp()
    };
    
    if (isAdmin) {
        updateData.unreadCountUser = increment(1);
    } else {
        updateData.unreadCountAdmin = increment(1);
    }
    
    if (!convSnap.exists()) {
        const userRef = doc(db, 'users', conversationId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        
        await setDoc(convRef, {
            ...updateData,
            userName: userData.name || 'Utente',
            userAvatar: userData.avatarUrl || '',
            userRole: userData.role || UserRole.FAN,
            unreadCountAdmin: isAdmin ? 0 : 1,
            unreadCountUser: isAdmin ? 1 : 0
        });
    } else {
        await updateDoc(convRef, updateData);
    }
};

export const subscribeToMessages = (conversationId: string, callback: (msgs: ChatMessage[]) => void) => {
    const q = query(collection(db, 'conversations', conversationId, 'messages'), orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
};

export const subscribeToMyConversation = (userId: string, callback: (conv: Conversation | null) => void) => {
    return onSnapshot(doc(db, 'conversations', userId), (snap) => {
        if (snap.exists()) {
            callback({ id: snap.id, ...snap.data() } as Conversation);
        } else {
            callback(null);
        }
    });
};

export const markConversationAsRead = async (conversationId: string, role: UserRole) => {
    const field = role === UserRole.ADMIN ? 'unreadCountAdmin' : 'unreadCountUser';
    const convRef = doc(db, 'conversations', conversationId);
    const snap = await getDoc(convRef);
    if (snap.exists()) {
        await updateDoc(convRef, { [field]: 0 });
    }
};

export const updateChatMessage = async (conversationId: string, messageId: string, text: string) => {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
        text,
        isEdited: true
    });
};

export const deleteChatMessage = async (conversationId: string, messageId: string) => {
    await deleteDoc(doc(db, 'conversations', conversationId, 'messages', messageId));
};

export const subscribeToConversations = (callback: (convs: Conversation[]) => void) => {
    const q = query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation)));
    });
};

// --- WATERMARK ---

export const uploadWatermark = async (file: File): Promise<string> => {
    const storageRef = ref(storage, `settings/watermark_${Date.now()}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, 'settings', 'global_config'), { watermarkUrl: url });
    return url;
};

export const deleteWatermark = async () => {
    await updateDoc(doc(db, 'settings', 'global_config'), { watermarkUrl: null });
};

// --- MODERAZIONE MEDIA ---

export const updateVideoDeletedStatus = async (requestId: string, isDeleted: boolean, reason: string = '') => {
    const orderRef = doc(db, 'orders', requestId);
    await updateDoc(orderRef, {
        isVideoDeleted: isDeleted,
        videoDeletedReason: isDeleted ? reason : '',
        status: isDeleted ? RequestStatus.CANCELED : RequestStatus.COMPLETED,
        updatedAt: new Date().toISOString()
    });
};

export const deleteOrderAllData = async (orderId: string, videoUrl?: string) => {
    try {
        console.log(`Eliminazione totale dell'ordine #${orderId}`);
        
        // 1. Delete video from Firebase Storage if videoUrl is present, UNLESS it is a public sample
        if (videoUrl) {
            try {
                const sampleSnap = await getDoc(doc(db, 'public_samples', orderId));
                if (sampleSnap.exists()) {
                    console.log(`Video per ordine #${orderId} conservato in Storage perché è un esempio pubblico`);
                } else {
                    const storageRef = ref(storage, videoUrl);
                    await deleteObject(storageRef);
                    console.log(`Video eliminato da Storage per ordine #${orderId}`);
                }
            } catch (err) {
                console.warn(`Impossibile eliminare file da Storage per ordine #${orderId}:`, err);
            }
        }

        // 2. Delete notifications linked to this order
        try {
            const notifSnap = await getDocs(query(collection(db, 'notifications'), where('orderId', '==', orderId)));
            await Promise.all(notifSnap.docs.map(docSnapshot => deleteDoc(docSnapshot.ref)));
            console.log(`Notifiche eliminate per ordine #${orderId}`);
        } catch (err) {
            console.error(`Errore durante l'eliminazione delle notifiche per ordine #${orderId}:`, err);
        }

        // 3. Delete records from 'videos' collection
        try {
            const videoSnap = await getDocs(query(collection(db, 'videos'), where('requestId', '==', orderId)));
            await Promise.all(videoSnap.docs.map(docSnapshot => deleteDoc(docSnapshot.ref)));
            console.log(`Records 'videos' eliminati per ordine #${orderId}`);
        } catch (err) {
            console.error(`Errore durante l'eliminazione dei records 'videos' per ordine #${orderId}:`, err);
        }

        // 4. Delete the order document itself
        await deleteDoc(doc(db, 'orders', orderId));
        console.log(`Documento ordine #${orderId} eliminato definitivamente`);
        
    } catch (e) {
        console.error(`Errore critico durante l'eliminazione dell'ordine #${orderId}:`, e);
    }
};

export const checkAndApplyAutoDeletion = async (orders: VideoRequest[]): Promise<VideoRequest[]> => {
    try {
        const settings = await getAdminSettings();
        const now = Date.now();

        // 1. Soglie di tempo
        const acceptanceDays = settings.talentAcceptanceThresholdDays ?? 3;
        const deliveryDays = settings.talentDeliveryThresholdDays ?? 7;
        const correctionDays = settings.talentCorrectionThresholdDays ?? 3;
        const approvalDays = settings.fanApprovalThresholdDays ?? 3;
        const autoDeleteDays = settings.videoAutoDeleteDays;

        const updatedOrders = await Promise.all(orders.map(async (order) => {
            let updatedOrder = { ...order };

            // A) Check PENDING deadline -> Mark as REJECTED due to inactivity
            if (order.status === RequestStatus.PENDING) {
                const ageMs = now - new Date(order.createdAt).getTime();
                const limitMs = acceptanceDays * 24 * 60 * 60 * 1000;
                if (ageMs > limitMs) {
                    try {
                        const reason = "Tempo scaduto per l'accettazione (Rifiuto automatico per inattività)";
                        const orderRef = doc(db, 'orders', order.id);
                        await updateDoc(orderRef, {
                            status: RequestStatus.REJECTED,
                            rejectionReason: reason,
                            updatedAt: new Date().toISOString()
                        });
                        updatedOrder.status = RequestStatus.REJECTED;
                        updatedOrder.rejectionReason = reason;
                    } catch (err) {
                        console.error("Errore auto-scadenza accettazione:", err);
                    }
                }
            }

            // B1) Check ACCEPTED deadline -> Mark as REJECTED due to late delivery
            if (order.status === RequestStatus.ACCEPTED) {
                const baseTimeStr = order.acceptedAt || order.createdAt;
                const ageMs = now - new Date(baseTimeStr).getTime();
                const limitMs = deliveryDays * 24 * 60 * 60 * 1000;
                if (ageMs > limitMs) {
                    try {
                        const reason = "Tempo scaduto per il caricamento del video (Rifiuto automatico per superamento limite di consegna)";
                        const orderRef = doc(db, 'orders', order.id);
                        await updateDoc(orderRef, {
                            status: RequestStatus.REJECTED,
                            rejectionReason: reason,
                            updatedAt: new Date().toISOString()
                        });
                        updatedOrder.status = RequestStatus.REJECTED;
                        updatedOrder.rejectionReason = reason;
                    } catch (err) {
                        console.error("Errore auto-scadenza consegna:", err);
                    }
                }
            }

            // B2) Check CORRECTION_NEEDED deadline -> Mark as CANCELED due to missed correction deadline
            if (order.status === RequestStatus.CORRECTION_NEEDED) {
                const baseTimeStr = order.updatedAt || order.createdAt;
                const ageMs = now - new Date(baseTimeStr).getTime();
                const limitMs = correctionDays * 24 * 60 * 60 * 1000;
                if (ageMs > limitMs) {
                    try {
                        const reason = `Tempo scaduto per la riconsegna del video modificato (Annullato automaticamente dopo ${correctionDays} giorni)`;
                        const orderRef = doc(db, 'orders', order.id);
                        await updateDoc(orderRef, {
                            status: RequestStatus.CANCELED,
                            rejectionReason: reason,
                            updatedAt: new Date().toISOString()
                        });
                        updatedOrder.status = RequestStatus.CANCELED;
                        updatedOrder.rejectionReason = reason;
                    } catch (err) {
                        console.error("Errore auto-annullamento correzione non consegnata:", err);
                    }
                }
            }

            // C) Check COMPLETED & !acceptedByFan -> Auto-accept by Fan
            if (order.status === RequestStatus.COMPLETED && !order.acceptedByFan) {
                const baseTimeStr = order.deliveredAt || order.updatedAt || order.createdAt;
                const ageMs = now - new Date(baseTimeStr).getTime();
                const limitMs = approvalDays * 24 * 60 * 60 * 1000;
                if (ageMs > limitMs) {
                    try {
                        const orderRef = doc(db, 'orders', order.id);
                        const autoAcceptTime = new Date().toISOString();
                        await updateDoc(orderRef, {
                            acceptedByFan: true,
                            acceptedByFanAt: autoAcceptTime,
                            updatedAt: autoAcceptTime
                        });
                        updatedOrder.acceptedByFan = true;
                        updatedOrder.acceptedByFanAt = autoAcceptTime;

                        if (order.allowPublicSample) {
                            await publishSampleVideo(order);
                        }
                    } catch (err) {
                        console.error("Errore auto-accettazione fan:", err);
                    }
                }
            }

            // D) Full Order Deletion from Storage and DB after autoDeleteDays (for completed/acceptedByFan or canceled/rejected)
            if (autoDeleteDays !== undefined && autoDeleteDays !== null && autoDeleteDays > 0) {
                const isConfirmed = updatedOrder.status === RequestStatus.COMPLETED && updatedOrder.acceptedByFan;
                const isCanceledOrRejected = [
                    RequestStatus.CANCELED,
                    RequestStatus.CANCELED_BY_FAN,
                    RequestStatus.REJECTED,
                    RequestStatus.REFUNDED,
                    RequestStatus.EXPIRED
                ].includes(updatedOrder.status);

                if (isConfirmed || isCanceledOrRejected) {
                    const baseTimeStr = updatedOrder.acceptedByFanAt || updatedOrder.updatedAt || updatedOrder.createdAt;
                    const baseTime = new Date(baseTimeStr).getTime();
                    const maxAgeMs = autoDeleteDays * 24 * 60 * 60 * 1000;
                    if (now - baseTime > maxAgeMs) {
                        try {
                            await deleteOrderAllData(updatedOrder.id, updatedOrder.videoUrl);
                            (updatedOrder as any).isPermanentlyDeleted = true;
                        } catch (err) {
                            console.error(`Errore auto-eliminazione ordine #${updatedOrder.id}:`, err);
                        }
                    }
                }
            }

            return updatedOrder;
        }));

        const filteredOrders = updatedOrders.filter(order => !(order as any).isPermanentlyDeleted);
        return filteredOrders;
    } catch (e) {
        console.error("Errore checkAndApplyAutoDeletion:", e);
        return orders;
    }
};

export const deleteUserAccount = async (userId: string) => {
    try {
        console.log(`Eliminazione dell'account utente #${userId}`);
        
        // 1. Recupero informazioni utente
        const userDocRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
            throw new Error("Utente non trovato nel database.");
        }
        
        const userData = userSnap.data() as User;
        const role = userData.role;
        const label = role === UserRole.FAN ? "Il fan" : "La Star";
        
        // 2. Recupero e aggiornamento ordini attivi "in corso"
        let ordersQuery;
        if (role === UserRole.FAN) {
            ordersQuery = query(collection(db, 'orders'), where('fanId', '==', userId));
        } else {
            ordersQuery = query(collection(db, 'orders'), where('talentId', '==', userId));
        }
        
        const ordersSnap = await getDocs(ordersQuery);
        const inProgressStatuses = [
            RequestStatus.PENDING,
            RequestStatus.ACCEPTED,
            RequestStatus.IN_REVIEW,
            RequestStatus.DISPUTE_OPEN,
            RequestStatus.CORRECTION_NEEDED
        ];
        
        for (const orderDoc of ordersSnap.docs) {
            const order = orderDoc.data() as VideoRequest;
            if (inProgressStatuses.includes(order.status)) {
                // Ordine in corso -> Annulla
                const history = order.history || [];
                const reason = `${label} si è cancellato dalla app.`;
                const newEvent = {
                    action: "Ordine annullato",
                    timestamp: new Date().toISOString(),
                    note: reason
                };
                
                await updateDoc(orderDoc.ref, {
                    status: RequestStatus.CANCELED,
                    rejectionReason: reason,
                    history: [...history, newEvent],
                    updatedAt: new Date().toISOString()
                });
            }
        }
        
        // 3. Eliminazione delle notifiche dell'utente
        const notifsQuery = query(collection(db, 'notifications'), where('recipientId', '==', userId));
        const notifsSnap = await getDocs(notifsQuery);
        for (const notifDoc of notifsSnap.docs) {
            await deleteDoc(notifDoc.ref);
        }
        
        // 4. Eliminazione delle recensioni dell'utente (o dell'utente Star)
        let reviewsQuery;
        if (role === UserRole.FAN) {
            reviewsQuery = query(collection(db, 'reviews'), where('fanId', '==', userId));
        } else {
            reviewsQuery = query(collection(db, 'reviews'), where('talentId', '==', userId));
        }
        const reviewsSnap = await getDocs(reviewsQuery);
        for (const reviewDoc of reviewsSnap.docs) {
            await deleteDoc(reviewDoc.ref);
        }
        
        // 5. Eliminazione dei public_samples (se Talent)
        if (role === UserRole.TALENT) {
            const samplesQuery = query(collection(db, 'public_samples'), where('talentId', '==', userId));
            const samplesSnap = await getDocs(samplesQuery);
            for (const sampleDoc of samplesSnap.docs) {
                await deleteDoc(sampleDoc.ref);
            }
            
            // Eliminazione dei campioni video correlati
            const videosQuery = query(collection(db, 'videos'), where('talentId', '==', userId));
            const videosSnap = await getDocs(videosQuery);
            for (const videoDoc of videosSnap.docs) {
                await deleteDoc(videoDoc.ref);
            }
        }
        
        // 6. Eliminazione delle conversazioni / chat
        const convsSnap = await getDocs(collection(db, 'conversations'));
        for (const convDoc of convsSnap.docs) {
            if (convDoc.id === userId || convDoc.id.includes(userId)) {
                // Elimina sottocollezione messaggi prima
                const msgsSnap = await getDocs(collection(db, 'conversations', convDoc.id, 'messages'));
                for (const msgDoc of msgsSnap.docs) {
                    await deleteDoc(msgDoc.ref);
                }
                await deleteDoc(convDoc.ref);
            }
        }
        
        // 7. Eliminazione del documento utente
        await deleteDoc(userDocRef);
        console.log(`Documento utente #${userId} rimosso con successo`);
        
    } catch (e) {
        console.error("Errore durante l'eliminazione dell'account utente:", e);
        throw e;
    }
};

/**
 * CLIENT-SIDE STRIPE CONNECT HELPERS
 */

export const callCreatePaymentIntent = async (orderId: string, amount: number): Promise<{ clientSecret: string, paymentIntentId: string }> => {
    const functions = getFunctions();
    const createIntentFn = httpsCallable<{ orderId: string, amount: number }, { clientSecret: string, paymentIntentId: string }>(functions, 'createPaymentIntent');
    const result = await createIntentFn({ orderId, amount });
    return result.data;
};

export const callStripeOnboardTalent = async (returnUrl: string, refreshUrl: string): Promise<{ url: string }> => {
    const functions = getFunctions();
    const onboardFn = httpsCallable<{ returnUrl: string, refreshUrl: string }, { url: string }>(functions, 'stripeOnboardTalent');
    const result = await onboardFn({ returnUrl, refreshUrl });
    return result.data;
};

export const subscribeToOrderChanges = (orderId: string, callback: (order: VideoRequest) => void): () => void => {
    return onSnapshot(doc(db, 'orders', orderId), (snapshot) => {
        if (snapshot.exists()) {
            callback({ id: snapshot.id, ...snapshot.data() } as VideoRequest);
        }
    });
};

export const uploadVideoResumable = async (
    file: File, 
    requestId: string, 
    onProgress: (progress: number) => void
): Promise<string> => {
    const settings = await getAdminSettings();
    let fileToUpload: Blob = file;
    let finalExtension = file.name.split('.').pop() || 'mp4';

    try {
        const processed = await addWatermarkToVideo(file, settings);
        fileToUpload = processed.blob;
        finalExtension = processed.extension;
    } catch (e) {
        console.error("Video formatting/watermarking failed, uploading original:", e);
    }

    const fileName = `${requestId}_${Date.now()}.${finalExtension}`;
    const storageRef = ref(storage, `videos/${fileName}`);
    
    const metadata: SettableMetadata = {
        contentDisposition: `attachment; filename="ciaostar_video_${requestId}.${finalExtension}"`,
        contentType: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        cacheControl: 'public,max-age=3600'
    };

    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, fileToUpload, metadata);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress(Math.round(progress));
            }, 
            (error) => {
                console.error("Resumable upload failed:", error);
                reject(error);
            }, 
            async () => {
                try {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(url);
                } catch (urlErr) {
                    reject(urlErr);
                }
            }
        );
    });
};

export const uploadAndDeliverVideoResumable = async (
    file: File, 
    requestId: string, 
    qualityCheck: VideoRequest['talentQualityCheck'],
    onProgress: (pct: number) => void
): Promise<void> => {
    const url = await uploadVideoResumable(file, requestId, onProgress);
    
    const orderRef = doc(db, 'orders', requestId);
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? (orderSnap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent = {
        action: "Video consegnato via caricamento resiliente",
        timestamp: new Date().toISOString(),
        note: "Video caricato ed elaborato con successo in modalità a prova di disconnessione."
    };

    let finalExtension = file.name.split('.').pop() || 'mp4';
    await addDoc(collection(db, 'videos'), {
        createdAt: new Date().toISOString(),
        format: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        requestId: requestId,
        sizeBytes: file.size,
        talentId: orderData.talentId || 'unknown',
        url: url,
        views: 0
    });

    await updateDoc(orderRef, { 
        videoUrl: url, 
        status: RequestStatus.COMPLETED,
        updatedAt: new Date().toISOString(),
        deliveredAt: new Date().toISOString(),
        talentQualityCheck: qualityCheck,
        history: [...history, newEvent]
    });
};

export const uploadVideoOnlyResumable = async (
    file: File, 
    requestId: string, 
    onProgress: (pct: number) => void
): Promise<string> => {
    const url = await uploadVideoResumable(file, requestId, onProgress);

    const orderRef = doc(db, 'orders', requestId);
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? (orderSnap.data() as VideoRequest) : {} as VideoRequest;
    const history = orderData.history || [];

    const newEvent = {
        action: "Bozza caricata in modalità resiliente",
        timestamp: new Date().toISOString()
    };

    let finalExtension = file.name.split('.').pop() || 'mp4';
    await addDoc(collection(db, 'videos'), {
        createdAt: new Date().toISOString(),
        format: `video/${finalExtension === 'mp4' ? 'mp4' : 'webm'}`,
        requestId: requestId,
        sizeBytes: file.size,
        talentId: orderData.talentId || 'unknown',
        url: url,
        views: 0
    });
    
    await updateDoc(orderRef, { 
        videoUrl: url, 
        history: [...history, newEvent],
        updatedAt: new Date().toISOString()
    });

    return url;
};

// -- SEEDING AND STRUCTURE INITIALIZATION FLOW --
export const seedDatabaseAndStructure = async (): Promise<boolean> => {
    try {
        // 1. Inizializza settings/global_config se non esiste
        const settingsRef = doc(db, 'settings', 'global_config');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) {
            await setDoc(settingsRef, { ...DEFAULT_ADMIN_SETTINGS });
        } else {
            // Unisci i campi mancanti
            await setDoc(settingsRef, { ...DEFAULT_ADMIN_SETTINGS, ...settingsSnap.data() }, { merge: true });
        }

        // 2. Inizializza system_settings/payment_and_email se non esiste
        const emailRef = doc(db, 'system_settings', 'payment_and_email');
        const emailSnap = await getDoc(emailRef);
        if (!emailSnap.exists()) {
            await setDoc(emailRef, {
                senderEmail: 'info@ciaostar.it',
                senderName: 'Team CiaoStar',
                smtpHost: '',
                smtpUser: '',
                smtpPass: '',
                smtpPort: 587,
                apiKey: '',
                updatedAt: new Date().toISOString()
            });
        }

        // 3. Inizializza categorie se mancano
        const catRef = doc(db, 'settings', 'talent_categories');
        const catSnap = await getDoc(catRef);
        if (!catSnap.exists()) {
            await setDoc(catRef, { categories: DB_CATEGORIES_SEED || ['Attori', 'Musicisti', 'Influencer', 'Sportivi', 'Comici', 'Chef', 'Doppiatori'] });
        }

        console.log("Database initialized and configured with robust schema settings successfully.");
        return true;
    } catch (err) {
        console.error("Errore durante il seeding della struttura del database: ", err);
        throw err;
    }
};


