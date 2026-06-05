
export enum UserRole {
  FAN = 'FAN',
  TALENT = 'TALENT',
  ADMIN = 'ADMIN'
}

export enum RequestStatus {
  PENDING = 'PENDING', 
  ACCEPTED = 'ACCEPTED', 
  COMPLETED = 'COMPLETED', 
  EXPIRED = 'EXPIRED', 
  CANCELED = 'CANCELED', 
  CANCELED_BY_FAN = 'CANCELED_BY_FAN',
  REFUNDED = 'REFUNDED', 
  IN_REVIEW = 'IN_REVIEW',
  DISPUTE_OPEN = 'DISPUTE_OPEN',
  CORRECTION_NEEDED = 'CORRECTION_NEEDED',
  REJECTED = 'REJECTED'
}

export type DisputeCategory = 'TECH_ISSUE' | 'CONTENT_ERROR' | 'DURATION' | 'OTHER';

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

export interface InAppNotificationSettings {
  orderCreated: boolean;
  orderAccepted: boolean;
  orderRejected: boolean;
  videoUploaded: boolean;
  disputeOpened: boolean;
  disputeResolved: boolean;
  orderCompleted: boolean;
}

export interface AdminSettings {
  maxDeliveryDays: number;
  termsVersion: number;
  platformFeePercent: number;
  maintenanceMode: boolean;
  watermarkUrl?: string;
  watermarkText?: string;
  watermarkFontSize?: number;
  watermarkHAlign?: 'leftaligned' | 'centeraligned' | 'rightaligned';
  watermarkVAlign?: 'topaligned' | 'centreallinement' | 'bottomalligned';
  watermarkTypingSpeed?: number;
  watermarkOpacity?: number;
  watermarkColor?: string;
  talentAcceptanceThresholdDays?: number;
  talentDeliveryThresholdDays?: number;
  talentCorrectionThresholdDays?: number;
  fanApprovalThresholdDays?: number;
  refundWindowMinutes: number;
  disputeWindowHours: number;
  deliveryDeadlineDays: number;
  videoAutoDeleteDays?: number;
  enabledNotifications?: InAppNotificationSettings;
  nonNegotiableNotifications?: InAppNotificationSettings;
  messageLimitPerHour?: number;
  domainName?: string;
  firebaseProjectId?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  stripeAccountId?: string;
  stripeSecretKey?: string;
  stripePublishableKey?: string;
  stripeWebhookSecret?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  stripeAccountId?: string;
  lastAcceptedTermsVersion: number;
  isApproved?: boolean;
  isAvailable?: boolean;
  createdAt?: string;
  instagramHandle?: string;
  instagramVerificationCode?: string;
  isInstagramVerified?: boolean;
  verificationStatus?: VerificationStatus;
  verificationVideoUrl?: string;
  introVideoUrl?: string;
  isDisabled?: boolean;
  sentStaffMessageTimestamps?: string[];
  notificationPreferences?: InAppNotificationSettings;
  customCommissionPercent?: number | null;
}

export interface Talent extends User {
  category: string;
  bio: string;
  price: number;
  tags: string[];
  responseTimeDays: number;
  rating: number;
  fastDeliveryEnabled?: boolean;
  fastDeliveryPriceIncrease?: number;
}

export interface OrderHistoryEvent {
  action: string;
  timestamp: string;
  note?: string;
}

export interface VideoRequest {
  id: string;
  talentId: string;
  talentName?: string; // Nome della star salvato al momento dell'ordine
  fanId: string;
  fanName: string;
  recipientName: string;
  instructions: string;
  occasion: string;
  status: RequestStatus;
  pricePaid: number;
  applicationFee: number;
  createdAt: string;
  updatedAt: string;
  expirationTimestamp: string; 
  expiresAt?: string;
  maxDeliveryDaysSnapshot: number;
  videoUrl?: string;
  videoId?: string;
  stripePaymentIntentId?: string;
  isFastDelivery?: boolean;
  adminNoteFan?: string;
  adminNoteTalent?: string;
  disputeReason?: string;
  disputeCategory?: DisputeCategory;
  rejectionReason?: string;
  correctionCount?: number;
  isVideoDeleted?: boolean;
  videoDeletedReason?: string;
  acceptedByFan?: boolean;
  acceptedByFanAt?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  talentQualityCheck?: {
      nameSaid: boolean;
      durationOk: boolean;
      audioClear: boolean;
  };
  allowPublicSample?: boolean;
  reviewSubmitted?: boolean;
  rating?: number;
  reviewComment?: string;
  history?: OrderHistoryEvent[];
}

export interface Review {
  id?: string;
  orderId: string;
  talentId: string;
  fanId: string;
  fanName: string;
  rating: number;
  comment: string;
  createdAt?: string;
  isHidden?: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  isAdmin: boolean;
  timestamp: any; 
  isEdited?: boolean;
}

export interface Conversation {
  id: string; 
  userName: string;
  userAvatar?: string;
  userRole: UserRole;
  lastMessage: string;
  lastMessageAt: any; 
  unreadCountAdmin: number;
  unreadCountUser: number;
}

export interface InAppNotification {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  orderId?: string;
  createdAt: string;
  read: boolean;
}

