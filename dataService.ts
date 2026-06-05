
import { db, storage, auth } from './firebaseConfig';
import { 
  collection, addDoc, getDocs, query, where, updateDoc, doc, getDoc, setDoc, 
  orderBy, limit, serverTimestamp, increment 
} from 'firebase/firestore';
import { Talent, User, UserRole, VideoRequest, RequestStatus, AdminSettings, AuditLog } from './types';
import { ADMIN_EMAIL, DEFAULT_ADMIN_SETTINGS } from './constants';

// --- SETTINGS & CONFIG ---

export const getAdminSettings = async (): Promise<AdminSettings> => {
    const settingsRef = doc(db, 'settings', 'global_config');
    const snap = await getDoc(settingsRef);
    if (snap.exists()) return snap.data() as AdminSettings;
    await setDoc(settingsRef, { ...DEFAULT_ADMIN_SETTINGS, maxDeliveryDays: 7, termsVersion: 1 });
    return { ...DEFAULT_ADMIN_SETTINGS, maxDeliveryDays: 7, termsVersion: 1 } as AdminSettings;
};

// --- USER & TERMS ---

export const syncUserToDB = async (user: Partial<User>) => {
  const userRef = doc(db, 'users', user.id!);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    const newUser = {
      ...user,
      role: user.email === ADMIN_EMAIL ? UserRole.ADMIN : UserRole.FAN,
      lastAcceptedTermsVersion: 0,
      isApproved: user.email === ADMIN_EMAIL,
      createdAt: new Date().toISOString()
    };
    await setDoc(userRef, newUser);
    return newUser as User;
  }
  return { ...user, ...userSnap.data() } as User;
};

export const acceptNewTerms = async (userId: string, version: number) => {
    await updateDoc(doc(db, 'users', userId), {
        lastAcceptedTermsVersion: version
    });
};

// --- STRIPE CONNECT SIMULATION ---
export const getStripeOnboardingLink = async (userId: string) => {
    // In produzione: chiama una Cloud Function
    return `https://connect.stripe.com/express/onboarding/${userId}`;
};

// --- ORDER LOGIC (SNAPSHOT RULE) ---

// FIX: Added 'updatedAt' to omitted fields and ensured it's included in finalOrder
export const createRequest = async (requestData: Omit<VideoRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'expirationTimestamp' | 'maxDeliveryDaysSnapshot' | 'applicationFee'>) => {
    const settings = await getAdminSettings();
    const now = new Date();
    
    // SNAPSHOT RULE: Calcoliamo la scadenza basandoci sui parametri ATTUALI
    const expirationDate = new Date(now.getTime() + settings.maxDeliveryDays * 24 * 60 * 60 * 1000);
    
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
        maxDeliveryDaysSnapshot: settings.maxDeliveryDays,
        expirationTimestamp: expirationDate.toISOString()
    };

    const docRef = await addDoc(collection(db, 'orders'), finalOrder);
    return docRef.id;
};

export const getRequestsForUser = async (userId: string, role: UserRole): Promise<VideoRequest[]> => {
    const field = role === UserRole.FAN ? 'fanId' : 'talentId';
    const q = query(collection(db, 'orders'), where(field, '==', userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoRequest));
};

export const forceRequestStatus = async (orderId: string, status: RequestStatus) => {
    await updateDoc(doc(db, 'orders', orderId), { status });
};

export const getTalents = async (): Promise<Talent[]> => {
    const q = query(collection(db, 'users'), where('role', '==', UserRole.TALENT), where('isApproved', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Talent)).filter(t => !t.isDisabled);
};

export const getTalentById = async (id: string): Promise<Talent | undefined> => {
    const docSnap = await getDoc(doc(db, 'users', id));
    if (!docSnap.exists()) return undefined;
    const data = docSnap.data();
    if (data.isDisabled === true) return undefined;
    return { id: docSnap.id, ...data } as Talent;
};
