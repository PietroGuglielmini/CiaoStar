
import { Talent, UserRole, AdminSettings } from './types';

export const ADMIN_EMAIL = 'petyguglix02@gmail.com';

// Fix properties to satisfy updated AdminSettings interface
export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  refundWindowMinutes: 30,
  deliveryDeadlineDays: 7,
  disputeWindowHours: 24,
  maintenanceMode: false,
  platformFeePercent: 20,
  maxDeliveryDays: 7,
  termsVersion: 1,
  videoAutoDeleteDays: 30,
  messageLimitPerHour: 10,
  talentAcceptanceThresholdDays: 3,
  talentDeliveryThresholdDays: 7,
  talentCorrectionThresholdDays: 3,
  fanApprovalThresholdDays: 3,
  enabledNotifications: {
    orderCreated: true,
    orderAccepted: true,
    orderRejected: true,
    videoUploaded: true,
    disputeOpened: true,
    disputeResolved: true,
    orderCompleted: true
  },
  nonNegotiableNotifications: {
    orderCreated: false,
    orderAccepted: false,
    orderRejected: false,
    videoUploaded: false,
    disputeOpened: false,
    disputeResolved: false,
    orderCompleted: false
  },
  legalBusinessName: 'CIAOSTAR S.R.L. a socio unico',
  legalRegisteredOffice: 'Via dell\'Innovazione 42, 20126 Milano (MI), Italia',
  legalVatNumber: 'IT12345678901',
  legalCapitalValue: '€100.000,00 i.v.',
  legalReaNumber: 'MI-9876543',
  legalContactEmail: 'info@ciaostar.it',
  legalPecEmail: 'legal@pec.ciaostar.it',
  googleAnalyticsId: '',
  facebookPixelId: '',
  logoUrl: '',
  faviconUrl: '',
  emailLogoUrl: '',
  seoDefaultTitle: 'CiaoStar - Videomessaggi personalizzati dalle tue star preferite',
  seoDefaultDescription: 'Ordina video auguri e messaggi personalizzati dai tuoi influencer e talenti preferiti.',
  seoOgImage: '',
  seoIndexTalents: true
};

export const MOCK_TALENTS: Talent[] = [
  {
    id: 't1',
    name: 'Chef Carlo',
    email: 'chef@example.com',
    role: UserRole.TALENT,
    category: 'Cucina',
    bio: 'Chef stellato noto per la sua severità ma dal cuore d\'oro. Richiedi un consiglio culinario o un augurio saporito!',
    price: 80,
    responseTimeDays: 3,
    rating: 4.9,
    tags: ['TV', 'Food', 'Masterchef'],
    avatarUrl: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?q=80&w=800&auto=format&fit=crop',
    lastAcceptedTermsVersion: 1
  },
  {
    id: 't2',
    name: 'Capitan Marco',
    email: 'marco@example.com',
    role: UserRole.TALENT,
    category: 'Sport',
    bio: 'Ex numero 10 della Nazionale. Pronto a motivare la tua squadra o fare gli auguri a un vero tifoso sfegatato.',
    price: 150,
    responseTimeDays: 7,
    rating: 5.0,
    tags: ['Calcio', 'Serie A', 'Leggenda'],
    avatarUrl: 'https://images.unsplash.com/photo-1570498839593-e565b39455fc?q=80&w=800&auto=format&fit=crop',
    lastAcceptedTermsVersion: 1
  },
  {
    id: 't3',
    name: 'DJ Electra',
    email: 'laura@example.com',
    role: UserRole.TALENT,
    category: 'Musica',
    bio: 'La regina della console di Ibiza. Ti farò un video pieno di bassi, energia e vibrazioni positive!',
    price: 45,
    responseTimeDays: 2,
    rating: 4.8,
    tags: ['DJ', 'Radio', 'Party'],
    avatarUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=800&auto=format&fit=crop',
    lastAcceptedTermsVersion: 1
  },
  {
    id: 't4',
    name: 'Mago Silvano',
    email: 'mago@example.com',
    role: UserRole.TALENT,
    category: 'Intrattenimento',
    bio: 'Illusionista e comico. Un video magico per sorprendere i tuoi amici, dove farò sparire... la tristezza!',
    price: 30,
    responseTimeDays: 1,
    rating: 4.6,
    tags: ['Magia', 'Cabaret', 'Humor'],
    avatarUrl: 'https://images.unsplash.com/photo-1627329806083-d9633ce09875?q=80&w=800&auto=format&fit=crop',
    lastAcceptedTermsVersion: 1
  }
];

// Questa lista serve come "Seme" iniziale per il database
export const DB_CATEGORIES_SEED = [
    'Sport', 
    'Musica', 
    'Cucina', 
    'Intrattenimento', 
    'Attori',
    'Influencer',
    'Comici',
    'Moda',
    'Business'
];

export const OCCASIONS = [
  'Nessuna occasione specifica',
  'Compleanno',
  'Laurea',
  'Anniversario',
  'Matrimonio',
  'Incoraggiamento',
  'Scherzo'
];
