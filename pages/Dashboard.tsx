
import React, { useEffect, useState, useRef } from 'react';
import { User, UserRole, VideoRequest, RequestStatus, AdminSettings } from '../types';
import { getRequestsForUser, updateRequestStatus, uploadVideo, getTalents, uploadVideoOnly, deliverVideo, acceptVideoDefinitively, openDispute, correctVideoRequest, getAdminSettings, submitReview, subscribeToRequestsForUser, updateTalentProfile, syncUserToDB, deleteUserAccount, uploadVideoResumable, uploadAndDeliverVideoResumable, uploadVideoOnlyResumable } from '../services/dataService';
import { auth } from '../firebaseConfig';
import { deleteUser } from 'firebase/auth';
import VideoPlayer from '../components/VideoPlayer';
import { 
  Loader2, CheckCircle, Package, Clock, RefreshCw,
  Download, Gift, PlayCircle, Check, X, Upload, Video, ShieldCheck, AlertCircle, TrendingUp, ArrowDownRight, MessageSquare, CornerUpLeft, Info, ExternalLink, AlertTriangle,
  Star, Bell, Trash2
} from 'lucide-react';

const REJECTION_OPTIONS = [
  {
    id: 'INFO_INSUFFICIENT',
    label: 'Informazioni insufficienti o istruzioni poco chiare',
    isCorrectable: true
  },
  {
    id: 'NAME_PRONUNCIATION',
    label: 'Pronuncia o nome difficile / Richiesta chiarimento',
    isCorrectable: true
  },
  {
    id: 'OFFENSIVE_CONTENT',
    label: 'Linguaggio offensivo o inappropriato (Rifiuto definitivo)',
    isCorrectable: false
  },
  {
    id: 'UNACCEPTABLE_REQUEST',
    label: 'Richiesta non consona / Contraria ai termini (Rifiuto definitivo)',
    isCorrectable: false
  },
  {
    id: 'NOT_AVAILABLE',
    label: 'La star non è disponibile al momento per questa richiesta (Rifiuto definitivo)',
    isCorrectable: false
  }
];

interface OrderCountdownProps {
  order: VideoRequest;
  isTalent: boolean;
  settings: AdminSettings | null;
  onRefresh: () => void;
}

const OrderCountdown: React.FC<OrderCountdownProps> = ({ order, isTalent, settings, onRefresh }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [expired, setExpired] = useState<boolean>(false);

  useEffect(() => {
    const acceptanceDays = settings?.talentAcceptanceThresholdDays ?? 3;
    const deliveryDays = settings?.talentDeliveryThresholdDays ?? 7;
    const correctionDays = settings?.talentCorrectionThresholdDays ?? 3;
    const approvalDays = settings?.fanApprovalThresholdDays ?? 3;

    let targetDateMs = 0;

    if (order.status === RequestStatus.PENDING) {
      const baseTimeMs = new Date(order.createdAt).getTime();
      targetDateMs = baseTimeMs + acceptanceDays * 24 * 60 * 60 * 1000;
    } else if (order.status === RequestStatus.ACCEPTED) {
      const baseTimeStr = order.acceptedAt || order.createdAt;
      const baseTimeMs = new Date(baseTimeStr).getTime();
      targetDateMs = baseTimeMs + deliveryDays * 24 * 60 * 60 * 1000;
    } else if (order.status === RequestStatus.CORRECTION_NEEDED) {
      const baseTimeStr = order.updatedAt || order.createdAt;
      const baseTimeMs = new Date(baseTimeStr).getTime();
      targetDateMs = baseTimeMs + correctionDays * 24 * 60 * 60 * 1000;
    } else if (order.status === RequestStatus.COMPLETED && !order.acceptedByFan) {
      const baseTimeStr = order.deliveredAt || order.updatedAt || order.createdAt;
      const baseTimeMs = new Date(baseTimeStr).getTime();
      targetDateMs = baseTimeMs + approvalDays * 24 * 60 * 60 * 1000;
    }

    if (targetDateMs === 0) return;

    const updateTimer = () => {
      const now = Date.now();
      const diffMs = targetDateMs - now;

      if (diffMs <= 0) {
        setTimeLeft('Tempo scaduto!');
        setExpired(true);
        onRefresh();
        return;
      }

      const totalSecs = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSecs / (24 * 3600));
      const hours = Math.floor((totalSecs % (24 * 3600)) / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;

      let timeParts: string[] = [];
      if (days > 0) timeParts.push(`${days}g`);
      if (days > 0 || hours > 0) timeParts.push(`${hours}h`);
      timeParts.push(`${mins}m`);
      timeParts.push(`${secs}s`);

      setTimeLeft(timeParts.join(' '));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [order, isTalent, settings, onRefresh]);

  if (!timeLeft) return null;

  return (
    <div className={`mt-2 mb-4 p-4 rounded-2xl flex items-center justify-between border ${
      expired 
        ? 'bg-red-50 border-red-100 text-red-700' 
        : order.status === RequestStatus.PENDING 
          ? 'bg-amber-50/70 border-amber-100/70 text-amber-805' 
          : order.status === RequestStatus.COMPLETED
            ? 'bg-indigo-50/70 border-indigo-100/70 text-indigo-805'
            : 'bg-emerald-50/70 border-emerald-100/70 text-emerald-805'
    }`}>
      <div className="flex items-center gap-3">
        <Clock className={`w-4 h-4 mr-0.5 ${expired ? 'text-red-500' : 'text-slate-400 font-bold'}`} />
        <div className="text-left">
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">
            {order.status === RequestStatus.PENDING && isTalent && "Decidi prima del rifiuto automatico"}
            {order.status === RequestStatus.PENDING && !isTalent && "La star deve decidere entro"}
            {order.status === RequestStatus.ACCEPTED && isTalent && "Azione richiesta: Carica video entro" }
            {order.status === RequestStatus.ACCEPTED && !isTalent && "Consegna video attesa entro" }
            {order.status === RequestStatus.CORRECTION_NEEDED && isTalent && "Azione richiesta: Riconsegna video corretto entro" }
            {order.status === RequestStatus.CORRECTION_NEEDED && !isTalent && "Riconsegna video corretto attesa entro" }
            { order.status === RequestStatus.COMPLETED && !order.acceptedByFan && isTalent && "La conferma o contestazione del fan scadrà tra" }
            { order.status === RequestStatus.COMPLETED && !order.acceptedByFan && !isTalent && "Approva o contesta il video entro" }
          </p>
          <p className="text-xs font-bold font-sans">
            {order.status === RequestStatus.PENDING && isTalent && `Tra ${timeLeft} l'ordine verrà automaticamente rifiutato, hai ancora questo tempo per decidere`}
            {order.status === RequestStatus.PENDING && !isTalent && `La star ha ${timeLeft} di tempo per accettare/rifiutare il tuo ordine`}
            {order.status === RequestStatus.ACCEPTED && isTalent && `Tra ${timeLeft} l'ordine verrà automaticamente rifiutato, hai ancora questo tempo per consegnare` }
            {order.status === RequestStatus.ACCEPTED && !isTalent && `La star ha ancora ${timeLeft} per caricare il tuo video prima dell'annullamento automatico` }
            {order.status === RequestStatus.CORRECTION_NEEDED && isTalent && `Tra ${timeLeft} l'ordine verrà automaticamente annullato, hai ancora questo tempo per riconsegnare il video corretto` }
            {order.status === RequestStatus.CORRECTION_NEEDED && !isTalent && `La star ha ancora ${timeLeft} per riconsegnare il video corretto prima dell'annullamento automatico dell'ordine` }
            { order.status === RequestStatus.COMPLETED && !order.acceptedByFan && isTalent && `Il fan ha ancora ${timeLeft} per approvare o contestare l'ordine prima che diventi definitivo` }
            { order.status === RequestStatus.COMPLETED && !order.acceptedByFan && !isTalent && `Hai ancora ${timeLeft} per confermare la bontà del video o aprire una contestazione, dopodiché non potrai più farlo` }
          </p>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const [requests, setRequests] = useState<VideoRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELED'>('ALL');
  const [talents, setTalents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showDownloadHelp, setShowDownloadHelp] = useState(false);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  
  // Rejection States
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [selectedRejectOptionId, setSelectedRejectOptionId] = useState('');

  // Correction States
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctedRecipient, setCorrectedRecipient] = useState('');
  const [correctedInstructions, setCorrectedInstructions] = useState('');
  const [correctedOccasion, setCorrectedOccasion] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);

  // Upload States
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [forceShowSelectorId, setForceShowSelectorId] = useState<string | null>(null);
  const [qualityCheck, setQualityCheck] = useState({
      nameSaid: false,
      durationOk: false,
      audioClear: false
  });
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Camera Recorder States
  const [activeTab, setActiveTab] = useState<'upload' | 'record'>('upload');
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const liveVideoRef = React.useRef<HTMLVideoElement>(null);

  // Stop all camera tracks helper
  const stopCamera = (stream: MediaStream | null = mediaStream) => {
      if (stream) {
          stream.getTracks().forEach(track => track.stop());
      }
      setMediaStream(null);
      setMediaRecorder(null);
      setIsRecording(false);
  };

  // Clean up when leaving active modal/card
  useEffect(() => {
      return () => {
          stopCamera();
          if (recordedUrl) {
              window.URL.revokeObjectURL(recordedUrl);
          }
      };
  }, []);

  useEffect(() => {
      // If we stop uploading standard id, reset the recording states
      if (!uploadingId) {
          stopCamera();
          setRecordedBlob(null);
          if (recordedUrl) {
              window.URL.revokeObjectURL(recordedUrl);
              setRecordedUrl(null);
          }
          setActiveTab('upload');
          setRecordingSeconds(0);
          setCameraError(null);
      }
  }, [uploadingId]);

  useEffect(() => {
      let interval: any = null;
      if (isRecording) {
          interval = setInterval(() => {
              setRecordingSeconds(prev => prev + 1);
          }, 1000);
      }
      return () => {
          if (interval) clearInterval(interval);
      };
  }, [isRecording]);

  useEffect(() => {
      if (liveVideoRef.current && mediaStream) {
          liveVideoRef.current.srcObject = mediaStream;
      }
  }, [mediaStream]);

  const startCamera = async () => {
      setCameraError(null);
      try {
          const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                  facingMode: 'user',
                  width: { ideal: 1280 },
                  height: { ideal: 720 }
              },
              audio: true
          });
          setMediaStream(stream);
          setRecordedBlob(null);
          if (recordedUrl) {
              window.URL.revokeObjectURL(recordedUrl);
              setRecordedUrl(null);
          }
      } catch (err: any) {
          console.error("Errore accesso fotocamera:", err);
          setCameraError(
              "Impossibile accedere alla fotocamera o al microfono. " +
              "Verifica i permessi del browser per questo sito."
          );
      }
  };

  const startRecording = () => {
      if (!mediaStream) return;
      
      setRecordedChunks([]);
      setRecordedBlob(null);
      if (recordedUrl) {
          window.URL.revokeObjectURL(recordedUrl);
          setRecordedUrl(null);
      }
      setRecordingSeconds(0);

      // check standard types for MediaRecorder
      let mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ''; 
      }

      try {
          const options = mimeType ? { mimeType } : undefined;
          const recorder = new MediaRecorder(mediaStream, options);
          const chunks: Blob[] = [];

          recorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                  chunks.push(e.data);
              }
          };

          recorder.onstop = () => {
              const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
              setRecordedBlob(blob);
              const url = window.URL.createObjectURL(blob);
              setRecordedUrl(url);
              stopCamera();
          };

          recorder.start(250); 
          setMediaRecorder(recorder);
          setIsRecording(true);
      } catch (err: any) {
          console.error("Errore avviamento MediaRecorder:", err);
          alert("Impossibile avviare la registrazione: " + err.message);
      }
  };

  const stopRecording = () => {
      if (mediaRecorder && isRecording) {
          mediaRecorder.stop();
          setIsRecording(false);
      }
  };

  const handleUseRecording = (orderId: string) => {
      if (!recordedBlob) return;
      const file = new File([recordedBlob], `registrazione_${orderId}.webm`, { type: recordedBlob.type || 'video/webm' });
      setUploadFile(file);
      setActiveTab('upload');
      alert("Registrazione in-app impostata come file video pronto per il caricamento!");
  };

  // Dispute States
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeCategory, setDisputeCategory] = useState<'TECH_ISSUE' | 'CONTENT_ERROR' | 'DURATION' | 'OTHER'>('TECH_ISSUE');
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false);

  // Review States
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingOrderId, setReviewingOrderId] = useState<string | null>(null);
  const [reviewingTalentId, setReviewingTalentId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Notification Preferences States
  const [showNotificationPrefsModal, setShowNotificationPrefsModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState<any>({
    orderCreated: true,
    orderAccepted: true,
    orderRejected: true,
    videoUploaded: true,
    disputeOpened: true,
    disputeResolved: true,
    orderCompleted: true
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    const fetchUserPrefs = async () => {
        try {
            const dbUser = await syncUserToDB(user);
            if (dbUser && dbUser.notificationPreferences) {
                setNotificationPrefs(prev => ({
                    ...prev,
                    ...dbUser.notificationPreferences
                }));
            }
        } catch (e) {
            console.error("Errore recupero preferenze notifiche utente:", e);
        }
    };
    if (user) {
        fetchUserPrefs();
    }
  }, [user]);

  const handleSaveNotificationPrefs = async () => {
    setIsSavingPrefs(true);
    try {
        await updateTalentProfile(user.id, {
            notificationPreferences: notificationPrefs
        });
        showToast("Preferenze notifiche salvate con successo!", "success", "Impostazioni Aggiornate");
        setShowNotificationPrefsModal(false);
    } catch (err) {
        console.error("Errore salvataggio preferenze notifiche:", err);
        alert("Errore durante il salvataggio.");
    } finally {
        setIsSavingPrefs(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "ELIMINA") {
        setDeleteError("Attenzione: scrivi correttamente la parola 'ELIMINA' per procedere.");
        return;
    }
    setIsDeletingAccount(true);
    setDeleteError("");
    try {
        await deleteUserAccount(user.id);
        
        // Prima eliminiamo l'utente autenticato Firebase reale se presente
        if (auth.currentUser) {
            try {
                await deleteUser(auth.currentUser);
            } catch (err) {
                console.warn("Dettagli cancellazione auth bypassata o richiede riautenticazione:", err);
            }
        }
        
        sessionStorage.clear();
        window.location.href = '#/';
        window.location.reload();
    } catch (err) {
        console.error("Errore account deletion:", err);
        setDeleteError("Impossibile completare l'operazione. Riprova più tardi.");
    } finally {
        setIsDeletingAccount(false);
    }
  };

  const statusMap: Record<RequestStatus, string> = {
    [RequestStatus.PENDING]: 'In attesa',
    [RequestStatus.ACCEPTED]: 'Accettato',
    [RequestStatus.COMPLETED]: 'Consegnato',
    [RequestStatus.REJECTED]: 'Rifiutato',
    [RequestStatus.EXPIRED]: 'Scaduto',
    [RequestStatus.REFUNDED]: 'Rimborsato',
    [RequestStatus.CANCELED]: 'Annullato',
    [RequestStatus.CANCELED_BY_FAN]: 'Annullato da te',
    [RequestStatus.IN_REVIEW]: 'In revisione',
    [RequestStatus.DISPUTE_OPEN]: 'Disputa aperta',
    [RequestStatus.CORRECTION_NEEDED]: 'Correzione richiesta'
  };

  // System for Toast Notifications
  interface ToastNotification {
    id: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    title?: string;
    subText?: string;
  }
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info', title?: string, subText?: string) => {
    const newToast: ToastNotification = {
      id: Math.random().toString(36).substring(2, 9),
      message,
      type,
      title,
      subText
    };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, 5000);
  };

  const requestsRef = useRef<VideoRequest[]>([]);
  const talentsRef = useRef<Record<string, string>>({});
  const isInitialRef = useRef(true);

  // Manteniamo requestsRef e talentsRef sempre allineati
  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    talentsRef.current = talents;
  }, [talents]);

  const refresh = async () => {
    try {
        const [talentsData, settingsData] = await Promise.all([
            getTalents(),
            getAdminSettings()
        ]);
        
        const tMap: Record<string, string> = {};
        talentsData.forEach(t => { tMap[t.id] = t.name; });
        
        setTalents(tMap);
        setAdminSettings(settingsData);
    } catch (err: any) {
        console.error(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    
    // Caricamento dati iniziali di configurazione e talenti
    refresh();

    isInitialRef.current = true;
    const unsub = subscribeToRequestsForUser(user.id, user.role, (updatedRequests) => {
        if (isInitialRef.current) {
            setRequests(updatedRequests);
            isInitialRef.current = false;
            setLoading(false);
        } else {
            const prevRequests = requestsRef.current;
            const isTalentUser = user.role === UserRole.TALENT;
            
            updatedRequests.forEach(req => {
                const prevReq = prevRequests.find(r => r.id === req.id);
                if (prevReq && req.status !== prevReq.status) {
                    const starName = req.talentName || talentsRef.current[req.talentId] || "una Star";
                    const targetName = req.recipientName || "qualcuno";
                    const oldLabel = statusMap[prevReq.status] || prevReq.status;
                    const newLabel = statusMap[req.status] || req.status;
                    
                    const title = isTalentUser ? "Stato Ordine Aggiornato" : "Aggiornamento del tuo Ordine";
                    const message = isTalentUser
                        ? `L'ordine per ${targetName} è passato da "${oldLabel}" a "${newLabel}"!`
                        : `Il tuo ordine per ${starName} è passato da "${oldLabel}" a "${newLabel}"!`;
                    
                    let type: 'success' | 'info' | 'warning' | 'error' = 'info';
                    if (req.status === RequestStatus.COMPLETED) {
                        type = 'success';
                    } else if ([RequestStatus.REJECTED, RequestStatus.EXPIRED, RequestStatus.CANCELED, RequestStatus.CANCELED_BY_FAN, RequestStatus.REFUNDED].includes(req.status)) {
                        type = 'error';
                    } else if (req.status === RequestStatus.CORRECTION_NEEDED || req.status === RequestStatus.DISPUTE_OPEN) {
                        type = 'warning';
                    }
                    
                    showToast(message, type, title, `Aggiornato ora`);
                }
            });
            
            setRequests(updatedRequests);
        }
    });

    return () => unsub();
  }, [user.id, user.role]);

  const handleDownload = async (videoUrl: string, fileName: string, requestId: string) => {
    setDownloadingId(requestId);
    setShowDownloadHelp(false);

    try {
        // Forza il download tentando di leggere il file come Blob
        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error('CORS_OR_NETWORK_ERROR');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName.replace(/\s+/g, '_')}.mp4`;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 200);

    } catch (error) {
        console.warn('Download programmato fallito. Uso fallback link diretto.');
        // Fallback: se il CORS fallisce o il browser blocca il blob, apriamo il link
        // Firebase Storage onorerà il Content-Disposition: attachment se impostato sui metadati
        window.open(videoUrl, '_blank');
        setShowDownloadHelp(true);
    } finally {
        setDownloadingId(null);
    }
  };

  const handleAccept = async (orderId: string) => {
      if (confirm("Accetti di realizzare questo video messaggio?")) {
          try {
              await updateRequestStatus(orderId, RequestStatus.ACCEPTED);
              refresh();
          } catch (e) {
              alert("Errore accettazione.");
          }
      }
  };

  const handleAcceptDefinitively = async (orderId: string) => {
      if (confirm("Sei sicuro di voler accettare definitivamente questo video messaggio? Inizierà il periodo di conservazione del file e non potrai più contestarlo.")) {
          try {
              await acceptVideoDefinitively(orderId);
              alert("Video messaggio accettato con successo!");
              refresh();
          } catch (e) {
              console.error(e);
              alert("Errore durante l'accettazione definitiva.");
          }
      }
  };

  const handleContestInitiate = (orderId: string) => {
      setDisputeId(orderId);
      setDisputeReason('');
      setDisputeCategory('TECH_ISSUE');
  };

  const handleSubmitDispute = async () => {
      if (!disputeId) return;
      if (!disputeReason.trim()) {
          alert("Per favore, inserisci un motivo per la contestazione.");
          return;
      }
      setIsSubmittingDispute(true);
      try {
          await openDispute(disputeId, disputeCategory, disputeReason.trim());
          alert("La tua contestazione è stata inviata allo Staff. L'amministratore controllerà l'ordine.");
          setDisputeId(null);
          setDisputeReason('');
          refresh();
      } catch (e) {
          console.error(e);
          alert("Errore durante l'invio della contestazione.");
      } finally {
          setIsSubmittingDispute(false);
      }
  };

  const handleSubmitReview = async () => {
    if (!reviewingOrderId || !reviewingTalentId) return;
    if (!reviewComment.trim()) {
      alert("Per favore inserisci un commento per la star!");
      return;
    }

    setIsSubmittingReview(true);
    try {
      await submitReview({
        orderId: reviewingOrderId,
        talentId: reviewingTalentId,
        fanId: user.id,
        fanName: user.name,
        rating: reviewRating,
        comment: reviewComment.trim()
      });
      alert("Recensione inviata con successo! Grazie del tuo feedback.");
      setShowReviewModal(false);
      setReviewingOrderId(null);
      setReviewingTalentId(null);
      setReviewComment('');
      refresh();
    } catch (e) {
      console.error(e);
      alert("Errore durante l'invio della recensione.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const submitRejection = async () => {
      if (!rejectingId) return;
      if (!selectedRejectOptionId) {
          alert("Per favore, seleziona un motivo per il rifiuto.");
          return;
      }
      
      const option = REJECTION_OPTIONS.find(o => o.id === selectedRejectOptionId);
      if (!option) return;

      const prefix = option.isCorrectable ? '[CORREGGIBILE]' : '[DEFINITIVO]';
      const detailText = rejectionReason.trim();
      const finalRejectionReason = `${prefix} ${option.label}${detailText ? `: ${detailText}` : ''}`;
      
      setIsRejecting(true);
      try {
          await updateRequestStatus(rejectingId, RequestStatus.REJECTED, { rejectionReason: finalRejectionReason });
          setRejectingId(null);
          setRejectionReason('');
          setSelectedRejectOptionId('');
          refresh();
      } catch (e) {
          alert("Errore rifiuto.");
      } finally {
          setIsRejecting(false);
      }
  };

  const handleInitiateCorrection = (req: VideoRequest) => {
      setCorrectingId(req.id);
      setCorrectedRecipient(req.recipientName || '');
      setCorrectedOccasion(req.occasion || '');
      setCorrectedInstructions(req.instructions || '');
  };

  const handleSendCorrection = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!correctingId) return;
      if (!correctedRecipient.trim() || !correctedInstructions.trim() || !correctedOccasion.trim()) {
          alert("Tutti i campi sono obbligatori.");
          return;
      }
      setIsSubmittingCorrection(true);
      try {
          await correctVideoRequest(correctingId, {
              recipientName: correctedRecipient,
              instructions: correctedInstructions,
              occasion: correctedOccasion
          });
          alert("Richiesta corretta inviata con successo! La Star riceverà le istruzioni aggiornate.");
          setCorrectingId(null);
          refresh();
      } catch (err) {
          console.error(err);
          alert("Errore durante l'invio della correzione.");
      } finally {
          setIsSubmittingCorrection(false);
      }
  };

  const handleUploadOnly = async (orderId: string) => {
      if (!uploadFile) return;
      setIsUploading(true);
      setUploadProgress(0);
      try {
          await uploadVideoOnlyResumable(uploadFile, orderId, (pct) => {
              setUploadProgress(pct);
          });
          setUploadFile(null);
          setForceShowSelectorId(null);
          alert("Video caricato con successo in modalità RESILIENTE! Verifica l'anteprima, conferma i requisiti di qualità e clicca su 'Consegna al Fan' per completare.");
          refresh();
      } catch (e: any) {
          console.error(e);
          alert("Errore durante il caricamento resiliente del video: " + (e.message || "riprova."));
      } finally {
          setIsUploading(false);
          setUploadProgress(0);
      }
  };

  const handleDeliverSubmit = async (orderId: string) => {
      if (!qualityCheck.nameSaid || !qualityCheck.durationOk || !qualityCheck.audioClear) {
          alert("Per favore, conferma tutti i requisiti di qualità prima di procedere con la consegna.");
          return;
      }
      setIsUploading(true);
      try {
          await deliverVideo(orderId, qualityCheck);
          setUploadingId(null);
          setQualityCheck({ nameSaid: false, durationOk: false, audioClear: false });
          alert("Video consegnato al Fan con successo!");
          refresh();
      } catch (e: any) {
          console.error(e);
          alert("Errore durante la consegna del video.");
      } finally {
          setIsUploading(false);
      }
  };

  const handleUploadSubmit = async (orderId: string) => {
      if (!uploadFile) return;
      if (!qualityCheck.nameSaid || !qualityCheck.durationOk || !qualityCheck.audioClear) {
          alert("Per favore, conferma tutti i requisiti di qualità prima di caricare.");
          return;
      }

      setIsUploading(true);
      setUploadProgress(0);
      try {
          await uploadAndDeliverVideoResumable(uploadFile, orderId, qualityCheck, (pct) => {
              setUploadProgress(pct);
          });
          setUploadingId(null);
          setUploadFile(null);
          setQualityCheck({ nameSaid: false, durationOk: false, audioClear: false });
          alert("Video caricato ed elaborato con successo in modalità RESILIENTE! Fondi trasferiti ed ordine completato.");
          refresh();
      } catch (e: any) {
          console.error(e);
          alert("Errore durante il caricamento resiliente del video: " + (e.message || "riprova."));
      } finally {
          setIsUploading(false);
          setUploadProgress(0);
      }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin w-10 h-10 text-indigo-600 mb-4" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Sincronizzazione Dashboard...</p>
    </div>
  );

  const completedRequests = requests.filter(r => r.status === RequestStatus.COMPLETED);
  const isTalent = user.role === UserRole.TALENT;

  const filteredRequests = requests.filter(req => {
      if (activeFilter === 'ALL') return true;
      if (activeFilter === 'PENDING') {
          return [
              RequestStatus.PENDING,
              RequestStatus.ACCEPTED,
              RequestStatus.CORRECTION_NEEDED,
              RequestStatus.IN_REVIEW,
              RequestStatus.DISPUTE_OPEN
          ].includes(req.status);
      }
      if (activeFilter === 'COMPLETED') {
          return req.status === RequestStatus.COMPLETED;
      }
      if (activeFilter === 'CANCELED') {
          return [
              RequestStatus.REJECTED,
              RequestStatus.EXPIRED,
              RequestStatus.REFUNDED,
              RequestStatus.CANCELED,
              RequestStatus.CANCELED_BY_FAN
          ].includes(req.status);
      }
      return true;
  });

  const stats = {
      total: requests.length,
      pending: requests.filter(r => r.status === RequestStatus.PENDING).length,
      completed: completedRequests.length,
      grossEarnings: completedRequests.reduce((acc, r) => acc + r.pricePaid, 0),
      totalFees: completedRequests.reduce((acc, r) => acc + (r.applicationFee || 0), 0),
      netEarnings: completedRequests.reduce((acc, r) => acc + (r.pricePaid - (r.applicationFee || 0)), 0)
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
                <h1 className="text-3xl font-extrabold text-slate-900 mb-1">
                    {isTalent ? 'Console Star' : 'La tua Dashboard'}
                </h1>
                <p className="text-slate-500 font-medium">
                    {isTalent ? 'Gestisci le tue richieste e monitora i tuoi guadagni.' : 'Qui trovi tutti i tuoi video messaggi e lo stato dei tuoi ordini.'}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setShowNotificationPrefsModal(true)} className="btn-secondary bg-indigo-50/80 border-indigo-100 text-indigo-600 hover:bg-indigo-100/90 hover:border-indigo-200">
                    <Bell className="w-4 h-4 mr-2" /> Preferenze Notifiche
                </button>
                <button onClick={() => setShowDeleteAccountModal(true)} className="btn-secondary bg-rose-50/80 border-rose-100 text-rose-600 hover:bg-rose-100/90 hover:border-rose-200">
                    <Trash2 className="w-4 h-4 mr-2" /> Elimina Account
                </button>
                <button onClick={refresh} className="btn-secondary">
                    <RefreshCw className="w-4 h-4 mr-2" /> Aggiorna
                </button>
            </div>
        </div>

        {/* Stats Grid */}
        <div className={`grid grid-cols-2 ${isTalent ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-10`}>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                <div className="bg-indigo-50 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center mb-4"><Package className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ordini Totali</p>
                <p className="text-2xl font-black text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                <div className="bg-amber-50 text-amber-600 w-10 h-10 rounded-xl flex items-center justify-center mb-4"><Clock className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">In attesa</p>
                <p className="text-2xl font-black text-slate-900">{stats.pending}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                <div className="bg-emerald-50 text-emerald-600 w-10 h-10 rounded-xl flex items-center justify-center mb-4"><CheckCircle className="w-5 h-5" /></div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Completati</p>
                <p className="text-2xl font-black text-slate-900">{stats.completed}</p>
            </div>
            
            {isTalent && (
                <div className="bg-indigo-600 p-6 rounded-2xl shadow-xl shadow-indigo-100 text-white flex flex-col justify-between relative overflow-hidden group">
                    <TrendingUp className="absolute -bottom-2 -right-2 w-16 h-16 text-white/10 group-hover:scale-110 transition-transform" />
                    <div>
                        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">Guadagno Netto</p>
                        <p className="text-3xl font-black">€{stats.netEarnings.toFixed(2)}</p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10 text-[9px] font-bold uppercase tracking-widest text-indigo-100">
                        <div className="flex justify-between">
                            <span>Lordo:</span>
                            <span>€{stats.grossEarnings.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between mt-1 text-pink-300">
                            <span>Commissioni:</span>
                            <span>-€{stats.totalFees.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Visibility & Conversions Insights for Talent */}
        {isTalent && (
            <div className="bg-slate-900 text-white rounded-[2rem] p-8 mb-10 border border-slate-950 shadow-xl text-left space-y-6">
                <div>
                    <h3 className="text-sm font-black uppercase text-indigo-400 tracking-wider">Statistiche di Visibilità & Conversioni (Insights)</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Analizza l'andamento del tuo profilo e trova suggerimenti utili per massimizzare le tue vendite.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Impression (Risultati di Ricerca)</div>
                        <div className="text-3xl font-black text-white">{user.impressionsCount ?? 0}</div>
                        <div className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                            Numero di volte che la tua scheda Star è comparsa nei risultati di ricerca o nella galleria dei filtri della homepage.
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
                        <div className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Visualizzazioni Profilo</div>
                        <div className="text-3xl font-black text-white">{user.profileViews ?? 0}</div>
                        <div className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                            Numero di visite uniche sul tuo profilo personale. Questa metrica indica quanti utenti si sono interessati ai tuoi dettagli.
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
                        <div className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">CTR / Conversione Vendite</div>
                        <div className="text-3xl font-black text-white">
                            {user.profileViews ? ((stats.total / user.profileViews) * 100).toFixed(1) : '0.0'}%
                        </div>
                        <div className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                            Percentuale di clic e ordini iniziati rispetto alle visualizzazioni reali del tuo profilo. Un tasso medio sano è tra il 2% e l'8%.
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] text-slate-400 font-semibold leading-relaxed">
                    💡 Suggerimento: Se il tuo CTR è basso, ti consigliamo di caricare un video di invito/benvenuto stimolante per convincere i visitatori o di regolare la tua fascia di prezzo per allinearti alla domanda.
                </div>
            </div>
        )}

        {/* Requests List */}
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <h2 className="text-xl font-extrabold text-slate-900">
                    {isTalent ? 'Richieste da gestire' : 'I tuoi video messaggi'}
                </h2>
                
                {/* Filtri Rapidi */}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveFilter('ALL')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeFilter === 'ALL'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50'
                        }`}
                    >
                        Tutti ({requests.length})
                    </button>
                    <button
                        onClick={() => setActiveFilter('PENDING')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeFilter === 'PENDING'
                                ? 'bg-amber-500 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50'
                        }`}
                    >
                        In Attesa ({requests.filter(r => [RequestStatus.PENDING, RequestStatus.ACCEPTED, RequestStatus.CORRECTION_NEEDED, RequestStatus.IN_REVIEW, RequestStatus.DISPUTE_OPEN].includes(r.status)).length})
                    </button>
                    <button
                        onClick={() => setActiveFilter('COMPLETED')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeFilter === 'COMPLETED'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50'
                        }`}
                    >
                        Completati ({requests.filter(r => r.status === RequestStatus.COMPLETED).length})
                    </button>
                    <button
                        onClick={() => setActiveFilter('CANCELED')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            activeFilter === 'CANCELED'
                                ? 'bg-rose-500 text-white shadow-md'
                                : 'bg-white text-slate-600 border border-gray-200 hover:bg-slate-50'
                        }`}
                    >
                        Annullati ({requests.filter(r => [RequestStatus.REJECTED, RequestStatus.EXPIRED, RequestStatus.REFUNDED, RequestStatus.CANCELED, RequestStatus.CANCELED_BY_FAN].includes(r.status)).length})
                    </button>
                </div>
            </div>
            
            {requests.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-3xl border border-gray-100">
                    <Gift className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">Nessun ordine trovato. {isTalent ? 'Appena riceverai una richiesta la vedrai qui!' : 'Inizia subito a richiedere un video alle tue Star!'}</p>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
                    <Gift className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold">Nessun ordine trovato con questo filtro.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredRequests.map(req => {
                        const resolvedTalentName = req.talentName || talents[req.talentId] || 'Star di CiaoStar';
                        const statusItalian = statusMap[req.status] || req.status;

                        return (
                            <div key={req.id} className={`bg-white rounded-3xl border p-8 shadow-sm transition-all hover:shadow-md ${
                                req.status === RequestStatus.PENDING && isTalent ? 'border-amber-200 ring-2 ring-amber-50' : 'border-gray-100'
                            }`}>
                                <div className="flex justify-between items-start mb-6">
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                        req.status === RequestStatus.COMPLETED ? 'bg-emerald-100 text-emerald-600' :
                                        req.status === RequestStatus.PENDING ? 'bg-amber-100 text-amber-600' :
                                        req.status === RequestStatus.ACCEPTED ? 'bg-blue-100 text-blue-600' :
                                        req.status === RequestStatus.REJECTED ? 'bg-red-100 text-red-600' :
                                        'bg-gray-100 text-slate-400'
                                    }`}>{statusItalian}</div>
                                    <span className="text-[10px] text-slate-300 font-bold uppercase">#ORD-{req.id.substring(0,6).toUpperCase()}</span>
                                </div>
                                
                                <div className="flex justify-between items-end mb-6">
                                    <div>
                                        <h3 className="text-2xl font-extrabold text-slate-900 mb-1">
                                            {isTalent ? `Per: ${req.recipientName}` : `Da: ${resolvedTalentName}`}
                                        </h3>
                                        <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider">{req.occasion}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PREZZO</p>
                                        <p className="text-xl font-black text-slate-900">
                                            €{isTalent ? (req.pricePaid - (req.applicationFee || 0)).toFixed(2) : req.pricePaid.toFixed(2)}
                                        </p>
                                        {isTalent && (
                                            <div className="flex items-center gap-1 justify-end text-[9px] font-bold text-slate-400 uppercase mt-1">
                                                <ArrowDownRight className="w-2.5 h-2.5" />
                                                Lordo €{req.pricePaid.toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <OrderCountdown key={req.id + '-' + req.status} order={req} isTalent={isTalent} settings={adminSettings} onRefresh={refresh} />

                                <div className="bg-gray-50 p-5 rounded-2xl mb-8 italic text-slate-600 text-sm leading-relaxed border-l-4 border-indigo-200 relative">
                                    <div className="absolute -top-3 left-4 bg-white px-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border border-gray-100 rounded">Istruzioni</div>
                                    "{req.instructions}"
                                </div>

                                {/* Azioni per la Star */}
                                {isTalent && (
                                    <div className="space-y-4">
                                        {req.status === RequestStatus.PENDING && (
                                            <div className="grid grid-cols-2 gap-3">
                                                <button 
                                                    onClick={() => setRejectingId(req.id)}
                                                    className="flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-red-50 text-red-600 font-bold text-sm hover:bg-red-50 transition-all"
                                                >
                                                    <X className="w-4 h-4" /> Rifiuta
                                                </button>
                                                <button 
                                                    onClick={() => handleAccept(req.id)}
                                                    className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                                                >
                                                    <Check className="w-4 h-4" /> Accetta
                                                </button>
                                            </div>
                                        )}

                                        { (req.status === RequestStatus.ACCEPTED || req.status === RequestStatus.CORRECTION_NEEDED) && (
                                            <div className="space-y-4">
                                                <div className="flex justify-end">
                                                    <button 
                                                        onClick={async () => {
                                                             if (confirm("Sei sicuro di voler disdire questo ordine già accettato? Questa operazione annullerà l'ordine.")) {
                                                                 try {
                                                                     await updateRequestStatus(req.id, RequestStatus.CANCELED, { 
                                                                         rejectionReason: "Ordine disdetto dal Talent dopo l'accettazione." 
                                                                     });
                                                                     alert("Ordine disdetto con successo.");
                                                                     refresh();
                                                                 } catch (err) {
                                                                     alert("Errore durante la disdetta.");
                                                                 }
                                                             }
                                                        }}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 font-extrabold text-[10px] uppercase hover:bg-red-50 transition-colors cursor-pointer"
                                                    >
                                                        <X className="w-3.5 h-3.5" /> Disdici Ordine
                                                    </button>
                                                </div>
                                                {uploadingId === req.id || req.videoUrl ? (
                                                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-6">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="font-black text-xs uppercase tracking-widest text-slate-900">Gestione Consegna Video</h4>
                                                            <button onClick={() => { setUploadingId(null); setUploadFile(null); setForceShowSelectorId(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4"/></button>
                                                        </div>

                                                        {/* SEZIONE 1: ANTEPRIMA VIDEO SE GIÀ CARICATO */}
                                                        {req.videoUrl && forceShowSelectorId !== req.id ? (
                                                            <div className="space-y-4">
                                                                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2">
                                                                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                                                    <span className="text-xs font-bold text-emerald-800">Video pronto ed elaborato con successo! Guarda l'anteprima sotto prima di procedere alla consegna:</span>
                                                                </div>
                                                                <div className="rounded-2xl overflow-hidden shadow-inner bg-black aspect-[9/16] max-w-[280px] mx-auto relative group">
                                                                    <VideoPlayer src={req.videoUrl} canDownload={false} isVideoDeleted={req.isVideoDeleted} videoDeletedReason={req.videoDeletedReason} />
                                                                </div>
                                                                <button 
                                                                    onClick={() => {
                                                                        setForceShowSelectorId(req.id);
                                                                        setUploadFile(null);
                                                                    }}
                                                                    className="w-full text-center text-xs font-extrabold text-indigo-600 hover:text-indigo-800 py-3 border border-dashed border-indigo-200 rounded-xl bg-white hover:bg-slate-50 transition-colors"
                                                                >
                                                                    Sostituisci questo video con un altro file
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            /* SEZIONE 1B: FILE SELECTOR + UPLOAD BUTTON / IN-APP VIDEO RECORDER */
                                                            <div className="space-y-4 text-left">
                                                                {/* Tab Navigation */}
                                                                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setActiveTab('upload');
                                                                            stopCamera();
                                                                        }}
                                                                        className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                                                            activeTab === 'upload' 
                                                                                ? 'bg-white text-indigo-600 shadow-sm' 
                                                                                : 'text-slate-500 hover:text-slate-800'
                                                                        }`}
                                                                    >
                                                                        <Upload className="w-3.5 h-3.5" />
                                                                        Carica file video
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setActiveTab('record');
                                                                            startCamera();
                                                                        }}
                                                                        className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                                                                            activeTab === 'record' 
                                                                                ? 'bg-white text-indigo-600 shadow-sm' 
                                                                                : 'text-slate-500 hover:text-slate-800'
                                                                        }`}
                                                                    >
                                                                        <Video className="w-3.5 h-3.5" />
                                                                        Registra in-app
                                                                    </button>
                                                                </div>

                                                                {activeTab === 'upload' ? (
                                                                    <div className="space-y-4">
                                                                        <label className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:bg-white transition-all group">
                                                                            <Upload className="w-8 h-8 text-slate-300 group-hover:text-indigo-600 mb-2 transition-colors" />
                                                                            <span className="text-sm font-bold text-slate-500">
                                                                                {uploadFile ? uploadFile.name : 'Seleziona file video o trascinalo qui'}
                                                                            </span>
                                                                            <input type="file" className="hidden" accept="video/*" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                                                                        </label>

                                                                        {uploadFile && (
                                                                            <div className="space-y-3">
                                                                                <button 
                                                                                    disabled={isUploading}
                                                                                    onClick={() => handleUploadOnly(req.id)}
                                                                                    className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg transition-all disabled:opacity-50"
                                                                                >
                                                                                    {isUploading ? (
                                                                                        <><Loader2 className="animate-spin w-4 h-4" /> Caricamento Resiliente ({uploadProgress}%) ...</>
                                                                                    ) : (
                                                                                        <><Upload className="w-4 h-4" /> Carica ed Elabora Video</>
                                                                                    )}
                                                                                </button>
                                                                                {isUploading && (
                                                                                    <div className="space-y-1">
                                                                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                                                                            <div 
                                                                                                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                                                                                                style={{ width: `${uploadProgress}%` }}
                                                                                            />
                                                                                        </div>
                                                                                        <span className="text-[10px] text-slate-400 font-bold block text-center uppercase tracking-wider">
                                                                                            Connessione stabile: {uploadProgress}% caricato
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    /* REGISTRAZIONE IN-APP */
                                                                    <div className="space-y-4 bg-white p-4 rounded-2xl border border-gray-100">
                                                                        {cameraError && (
                                                                            <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-xs rounded-xl flex items-start gap-2">
                                                                                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                                                                <div>
                                                                                    <p className="font-bold">Permessi fotocamera mancanti</p>
                                                                                    <p className="mt-1 text-[11px] leading-normal">{cameraError}</p>
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={startCamera}
                                                                                        className="mt-2 px-2.5 py-1 bg-red-100 text-red-900 border border-red-300 font-bold rounded-lg text-[10px] hover:bg-red-200 transition-all"
                                                                                    >
                                                                                        Riprova ad abilitare
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* Live Camera View o Preview della registrazione */}
                                                                        {recordedUrl ? (
                                                                            <div className="space-y-3">
                                                                                <div className="text-xs font-bold text-slate-500 mb-1">Registrazione completata:</div>
                                                                                <div className="rounded-2xl overflow-hidden bg-black aspect-[9/16] max-w-[240px] mx-auto relative">
                                                                                    <video src={recordedUrl} controls className="w-full h-full object-contain" />
                                                                                </div>
                                                                                {recordingSeconds > 0 && (
                                                                                    <div className="text-xs text-slate-500 font-medium">
                                                                                        Durata stimata: <span className="font-bold text-slate-800">{recordingSeconds}s</span> 
                                                                                        {recordingSeconds < 20 ? (
                                                                                            <span className="text-amber-600 font-bold ml-1">(Consigliati almeno 20 secondi!)</span>
                                                                                        ) : (
                                                                                            <span className="text-emerald-600 font-bold ml-1">(Durata ottimale! ✓)</span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                <div className="grid grid-cols-2 gap-2 mt-4">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={startCamera}
                                                                                        className="py-2.5 px-3 rounded-xl border border-gray-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                                                                                    >
                                                                                        Registra di nuovo
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleUseRecording(req.id)}
                                                                                        className="py-2.5 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
                                                                                    >
                                                                                        Usa questa registrazione
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            mediaStream && (
                                                                                <div className="space-y-4">
                                                                                    <div className="rounded-2xl overflow-hidden bg-black aspect-[9/16] max-w-[240px] mx-auto relative">
                                                                                        <video 
                                                                                            ref={liveVideoRef}
                                                                                            autoPlay 
                                                                                            playsInline 
                                                                                            muted 
                                                                                            className="w-full h-full object-contain scale-x-[-1]" 
                                                                                        />
                                                                                        {isRecording && (
                                                                                            <div className="absolute top-3 left-3 bg-red-600/90 text-white font-black text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                                                                                                <span className="w-2 h-2 rounded-full bg-white block animate-ping" />
                                                                                                REC {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex justify-center gap-2">
                                                                                        {!isRecording ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={startRecording}
                                                                                                className="py-3 px-6 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-50"
                                                                                            >
                                                                                                <span className="w-2.5 h-2.5 rounded-full bg-white block" />
                                                                                                Inizia Registrazione
                                                                                            </button>
                                                                                        ) : (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={stopRecording}
                                                                                                className="py-3 px-6 rounded-2xl bg-black hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg"
                                                                                            >
                                                                                                <span className="w-2.5 h-2.5 bg-red-500 rounded-sm block" />
                                                                                                Ferma Registrazione
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        )}

                                                                        {!mediaStream && !recordedUrl && !cameraError && (
                                                                            <button 
                                                                                type="button"
                                                                                onClick={startCamera}
                                                                                className="w-full py-8 border-2 border-dashed border-gray-200 rounded-2xl hover:bg-slate-50 transition-all flex flex-col items-center justify-center gap-2 text-slate-500 group"
                                                                            >
                                                                                <Video className="w-8 h-8 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                                                                                <span className="text-sm font-bold">Attiva la Fotocamera per registrare in-app</span>
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {req.videoUrl && (
                                                                    <button 
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setForceShowSelectorId(null);
                                                                            setUploadFile(null);
                                                                            stopCamera();
                                                                        }}
                                                                        className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-700 mt-2"
                                                                    >
                                                                        Mantieni il video precedente
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}


                                                        {/* SEZIONE 2: REQUISITI DI QUALITÀ + BOTTONE CONSEGNA FINALE */}
                                                        {req.videoUrl && forceShowSelectorId !== req.id && (
                                                            <div className="space-y-4 pt-4 border-t border-gray-100 text-left">
                                                                <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-100">
                                                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-3 flex items-center gap-2">
                                                                        <ShieldCheck className="w-3 h-3" /> Requisiti di Qualità obbligatori:
                                                                    </p>
                                                                    {[
                                                                        { key: 'nameSaid', label: 'Ho detto il nome del destinatario' },
                                                                        { key: 'durationOk', label: 'Il video dura almeno 20 secondi' },
                                                                        { key: 'audioClear', label: 'L\'audio è chiaro e senza rumori' }
                                                                    ].map(item => (
                                                                        <label key={item.key} className="flex items-center gap-3 cursor-pointer group text-left">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                checked={(qualityCheck as any)[item.key]} 
                                                                                onChange={(e) => setQualityCheck({...qualityCheck, [item.key]: e.target.checked})}
                                                                                className="sr-only"
                                                                            />
                                                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                                                                (qualityCheck as any)[item.key] ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 group-hover:border-indigo-300'
                                                                            }`}>
                                                                                {(qualityCheck as any)[item.key] && <Check className="w-3 h-3 text-white stroke-[3px]" />}
                                                                            </div>
                                                                            <span className="text-xs font-bold text-slate-600 font-sans">{item.label}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>

                                                                <button 
                                                                    disabled={isUploading || !qualityCheck.nameSaid || !qualityCheck.durationOk || !qualityCheck.audioClear}
                                                                    onClick={() => handleDeliverSubmit(req.id)}
                                                                    className="btn-primary w-full py-4 text-sm disabled:opacity-50"
                                                                >
                                                                    {isUploading ? (
                                                                        <><Loader2 className="animate-spin w-4 h-4" /> Consegna in corso...</>
                                                                    ) : (
                                                                        <><Video className="w-4 h-4" /> Consegna al Fan</>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <button 
                                                        onClick={() => {
                                                            setUploadingId(req.id);
                                                            setUploadFile(null);
                                                            setForceShowSelectorId(null);
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 shadow-lg shadow-emerald-50 transition-all"
                                                    >
                                                        <Upload className="w-4 h-4" /> Gestisci consegna video
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Video e Download per il Fan */}
                                {req.videoUrl && req.status !== RequestStatus.ACCEPTED ? (
                                    <div className="space-y-4">
                                        <div className="rounded-2xl overflow-hidden shadow-inner bg-black aspect-[9/16] max-w-[280px] mx-auto relative group">
                                            <VideoPlayer src={req.videoUrl} canDownload={false} isVideoDeleted={req.isVideoDeleted} videoDeletedReason={req.videoDeletedReason} />
                                        </div>
                                        {!isTalent && (
                                            <div className="space-y-4">
                                                <button 
                                                    disabled={downloadingId === req.id}
                                                    onClick={() => handleDownload(req.videoUrl!, `CiaoStar_Video_${resolvedTalentName.replace(/\s+/g, '_')}`, req.id)}
                                                    className="btn-primary w-full py-4 disabled:opacity-70 flex items-center justify-center gap-2"
                                                >
                                                    {downloadingId === req.id ? (
                                                        <><Loader2 className="animate-spin w-4 h-4" /> Preparazione download...</>
                                                    ) : (
                                                        <><Download className="w-4 h-4" /> Scarica il tuo regalo</>
                                                    )}
                                                </button>
                                                
                                                {showDownloadHelp && (
                                                    <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
                                                        <div className="flex gap-3">
                                                            <Info className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                                                            <div className="text-xs text-indigo-900 font-medium leading-relaxed">
                                                                <strong>Il download non parte?</strong> Se il video si è solo aperto in una nuova scheda, il tuo browser sta bloccando lo scaricamento automatico.
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row gap-3">
                                                            <a 
                                                                href={req.videoUrl} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white border border-indigo-200 text-indigo-700 text-[10px] font-black uppercase hover:bg-indigo-50 transition-colors"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" /> Apri link diretto
                                                            </a>
                                                            <div className="flex-1 text-[10px] text-indigo-500 font-bold bg-white/50 p-3 rounded-xl italic">
                                                                Poi premi col tasto destro sul video e scegli "Salva video come..."
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Azioni di Accettazione/Contestazione per il Fan */}
                                                {(() => {
                                                    if (req.status !== RequestStatus.COMPLETED || req.acceptedByFan || req.isVideoDeleted) return null;
                                                    const baseTimeStr = req.deliveredAt || req.updatedAt || req.createdAt;
                                                    const baseTimeMs = new Date(baseTimeStr).getTime();
                                                    const limitMs = (adminSettings?.fanApprovalThresholdDays ?? 3) * 24 * 60 * 60 * 1000;
                                                    const hasExpired = Date.now() - baseTimeMs > limitMs;
                                                    if (hasExpired) return null;

                                                    return (
                                                        <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100 text-center space-y-3">
                                                            <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Accetti questo video messaggio?</p>
                                                            <p className="text-[11px] text-slate-500 font-medium leading-normal">
                                                                Confermando l'accettazione, sbloccherai l'ordine definitivamente. Se riscontri gravi discrepanze con le istruzioni, puoi contestarlo.
                                                            </p>
                                                            <div className="grid grid-cols-2 gap-2 pt-1">
                                                                <button 
                                                                    onClick={() => handleContestInitiate(req.id)}
                                                                    className="py-2.5 px-3 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                                                                >
                                                                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Contesta
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleAcceptDefinitively(req.id)}
                                                                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100"
                                                                >
                                                                    <Check className="w-3.5 h-3.5" /> Accetta
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {req.status === RequestStatus.COMPLETED && req.acceptedByFan && (
                                                    <div className="space-y-3">
                                                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-center text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                                                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                                                            Video messaggio accettato definitivamente ✓
                                                        </div>
                                                        {!req.reviewSubmitted && !isTalent && (
                                                            <button
                                                                onClick={() => {
                                                                    setReviewingOrderId(req.id);
                                                                    setReviewingTalentId(req.talentId);
                                                                    setReviewRating(5);
                                                                    setReviewComment('');
                                                                    setShowReviewModal(true);
                                                                }}
                                                                className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-100 active:scale-95"
                                                            >
                                                                <Star className="w-4 h-4 fill-current text-white" /> Lascia una recensione
                                                            </button>
                                                        )}
                                                        {req.reviewSubmitted && (
                                                            <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-xs font-bold text-amber-800 uppercase tracking-tight">
                                                                        {isTalent ? 'Recensione del Fan:' : 'La tua Recensione:'}
                                                                    </span>
                                                                    <div className="flex items-center gap-0.5">
                                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                                            <Star key={s} className={`w-3.5 h-3.5 ${s <= (req.rating || 5) ? 'fill-current text-amber-500' : 'text-slate-200'}`} />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                {req.reviewComment && (
                                                                    <p className="text-xs text-slate-600 italic bg-white/60 p-2.5 rounded-xl border border-amber-50 leading-relaxed">
                                                                        "{req.reviewComment}"
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {req.status === RequestStatus.DISPUTE_OPEN && (
                                                    <div className="bg-red-50 p-4 border border-red-100 rounded-2xl text-center text-xs font-bold text-red-800 flex flex-col gap-1 items-center justify-center">
                                                        <div className="flex items-center gap-1.5">
                                                            <AlertTriangle className="w-4 h-4 text-red-650" />
                                                            Disputa aperta per questo ordine
                                                        </div>
                                                        <span className="text-[10px] text-red-600 font-medium leading-relaxed italic block mt-1">
                                                            "Lo Staff sta esaminando l'ordine."
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    (!isTalent || (req.status !== RequestStatus.PENDING && req.status !== RequestStatus.ACCEPTED)) ? (
                                        <div className={`py-12 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed ${
                                            req.status === RequestStatus.REJECTED ? 'bg-red-50/30 border-red-100 text-red-400' : 'bg-gray-50 border-gray-100 text-slate-400'
                                        }`}>
                                            {req.status === RequestStatus.REJECTED ? (
                                                <div className="text-center px-6 w-full">
                                                    <AlertCircle className="w-10 h-10 mb-3 mx-auto opacity-40 text-red-400" />
                                                    <span className="block text-sm font-black uppercase tracking-widest mb-4 text-red-600">Richiesta Rifiutata</span>
                                                    
                                                    {req.rejectionReason && (
                                                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 max-w-sm mx-auto text-left relative overflow-hidden">
                                                            <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                                                            <p className="text-[10px] font-black text-red-500 uppercase mb-2 flex items-center gap-2">
                                                                <MessageSquare className="w-3.5 h-3.5" /> Motivo del rifiuto:
                                                            </p>
                                                            <p className="text-sm font-bold text-red-900 leading-relaxed italic">
                                                                "{req.rejectionReason.replace(/^\[CORREGGIBILE\]\s*/, '').replace(/^\[DEFINITIVO\]\s*/, '')}"
                                                            </p>
                                                        </div>
                                                    )}
                                                    {!isTalent && (
                                                        <div className="mt-4 space-y-3">
                                                            {req.rejectionReason?.startsWith('[CORREGGIBILE]') && (req.correctionCount || 0) < 1 ? (
                                                                <div className="space-y-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl max-w-sm mx-auto">
                                                                    <p className="text-xs text-slate-500 font-bold leading-relaxed">
                                                                        La Star ha richiesto informazioni aggiuntive. Puoi correggere questa richiesta ora per sbloccare l'ordine (disponibile max 1 volta).
                                                                    </p>
                                                                    <button
                                                                        onClick={() => handleInitiateCorrection(req)}
                                                                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase rounded-xl shadow-lg shadow-indigo-100 transition-all font-sans cursor-pointer"
                                                                    >
                                                                        <RefreshCw className="w-3.5 h-3.5 animate-pulse" /> Correggi Richiesta
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 bg-white/50 px-4 py-2 rounded-full border border-gray-100 w-fit mx-auto">
                                                                        <CornerUpLeft className="w-3.5 h-3.5" /> Importo rimborsato integralmente
                                                                    </div>
                                                                    {req.rejectionReason?.startsWith('[CORREGGIBILE]') && (req.correctionCount || 0) >= 1 && (
                                                                        <p className="text-[10px] text-red-400 font-bold max-w-xs mx-auto text-center mt-2 leading-relaxed font-sans">
                                                                            Hai già utilizzato l'unica possibilità di correzione per questa richiesta.
                                                                        </p>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <>
                                                    <PlayCircle className="w-10 h-10 mb-3 opacity-20" />
                                                    <span className="text-sm font-bold uppercase tracking-widest text-slate-300">
                                                        La Star sta preparando il video...
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    ) : null
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* MODALE RIFIUTO (Talent) */}
        {rejectingId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-red-500 p-2 rounded-xl">
                                <AlertCircle className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Motiva il rifiuto</h3>
                        </div>
                        <button onClick={() => !isRejecting && setRejectingId(null)} className="text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="p-8 overflow-y-auto space-y-6">
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">Scegli tra le seguenti opzioni il motivo del rifiuto. Il Fan lo leggerà nella sua dashboard.</p>
                        
                        <div className="space-y-2">
                            {REJECTION_OPTIONS.map(option => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setSelectedRejectOptionId(option.id)}
                                    className={`w-full text-left p-4 rounded-2xl border transition-all flex flex-col gap-1 cursor-pointer ${
                                        selectedRejectOptionId === option.id 
                                            ? 'border-red-500 bg-red-50/35 ring-2 ring-red-100' 
                                            : 'border-gray-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                            selectedRejectOptionId === option.id ? 'border-red-500' : 'border-gray-300'
                                        }`}>
                                            {selectedRejectOptionId === option.id && <div className="w-2 h-2 rounded-full bg-red-500" />}
                                        </div>
                                        <span className="text-xs font-bold text-slate-900 leading-tight">{option.label}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-500 font-medium pl-6">
                                        {option.isCorrectable ? '✓ Adatto a correzione' : '✗ Rifiuto definitivo'}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Ulteriori dettagli (Opzionale)</label>
                            <textarea 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-red-500 transition-colors min-h-[80px]"
                                placeholder="Esempio: Richiesta non consona, impegni improvvisi..."
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => { setRejectingId(null); setSelectedRejectOptionId(''); setRejectionReason(''); }} className="btn-secondary flex-1">Annulla</button>
                            <button 
                                onClick={submitRejection} 
                                disabled={!selectedRejectOptionId || isRejecting}
                                className="bg-red-600 hover:bg-red-700 text-white flex-1 py-4 rounded-2xl font-black uppercase shadow-xl disabled:opacity-50 text-xs text-center cursor-pointer"
                            >
                                {isRejecting ? <Loader2 className="animate-spin const-spin mx-auto w-4 h-4" /> : 'Conferma Rifiuto'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* MODALE CONTESTAZIONE (Fan) */}
        {disputeId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-500 p-2 rounded-xl">
                                <AlertTriangle className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Qual è il problema?</h3>
                        </div>
                        <button onClick={() => !isSubmittingDispute && setDisputeId(null)} className="text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="p-8">
                        <p className="text-xs text-slate-500 font-semibold mb-6 uppercase tracking-wider">Seleziona la categoria della contestazione:</p>
                        
                        <div className="space-y-3 mb-6">
                            {[
                                { key: 'TECH_ISSUE', label: 'Problema tecnico (Video/Audio/Sincronizzazione)' },
                                { key: 'CONTENT_ERROR', label: 'Contenuto errato o incompleto' },
                                { key: 'DURATION', label: 'La durata è inferiore ai requisiti' },
                                { key: 'OTHER', label: 'Altro motivo' }
                            ].map((cat) => (
                                <button
                                    key={cat.key}
                                    type="button"
                                    onClick={() => setDisputeCategory(cat.key as any)}
                                    className={`w-full text-left p-4 rounded-xl border font-bold text-xs transition-all flex items-center justify-between ${
                                        disputeCategory === cat.key 
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm' 
                                            : 'border-slate-100 bg-white hover:bg-slate-50 text-slate-600'
                                    }`}
                                >
                                    <span>{cat.label}</span>
                                    {disputeCategory === cat.key && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                                </button>
                            ))}
                        </div>

                        <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Descrivi in dettaglio il problema:</label>
                        <textarea 
                            className="input-main min-h-[100px] mb-6"
                            placeholder="Descrivi cosa c'è che non va nel video messaggio, così lo Staff potrà valutare attentamente..."
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            required
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setDisputeId(null)} className="btn-secondary flex-1">Annulla</button>
                            <button onClick={handleSubmitDispute} className="bg-indigo-600 text-white flex-1 py-4 rounded-2xl font-black uppercase shadow-xl hover:bg-indigo-700 disabled:opacity-50">
                                {isSubmittingDispute ? <Loader2 className="animate-spin mx-auto w-4 h-4" /> : 'Invia Contestazione'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* MODALE CORREZIONE (Fan) */}
        {correctingId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-650 bg-indigo-600 p-2 rounded-xl">
                                <RefreshCw className="w-5 h-5 text-white animate-spin" style={{ animationDuration: '3s' }} />
                            </div>
                            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Correggi Richiesta</h3>
                        </div>
                        <button onClick={() => !isSubmittingCorrection && setCorrectingId(null)} className="text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                    </div>

                    <form onSubmit={handleSendCorrection} className="p-8 space-y-4">
                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                            Inserisci i dettagli modificati per chiarire o correggere la richiesta rifiutata dalla Star. Puoi inviare questa correzione al massimo 1 volta per questo ordine.
                        </p>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome del destinatario</label>
                            <input 
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={correctedRecipient}
                                onChange={(e) => setCorrectedRecipient(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Occasione</label>
                            <input 
                                type="text"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={correctedOccasion}
                                onChange={(e) => setCorrectedOccasion(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Istruzioni / Richiesta dettagliata</label>
                            <textarea 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-indigo-500 transition-colors min-h-[100px]"
                                value={correctedInstructions}
                                onChange={(e) => setCorrectedInstructions(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex gap-3 pt-4 font-sans">
                            <button type="button" onClick={() => setCorrectingId(null)} className="btn-secondary flex-1">Annulla</button>
                            <button type="submit" disabled={isSubmittingCorrection} className="bg-indigo-600 text-white flex-1 py-3 rounded-2xl font-black uppercase shadow-xl hover:bg-indigo-700 disabled:opacity-50 text-xs">
                                {isSubmittingCorrection ? <Loader2 className="animate-spin mx-auto w-4 h-4" /> : 'Invia Modifiche'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {showReviewModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-amber-500 p-2 rounded-xl">
                                <Star className="w-5 h-5 text-white fill-current" />
                            </div>
                            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Lascia una Recensione</h3>
                        </div>
                        <button onClick={() => !isSubmittingReview && setShowReviewModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="p-8 space-y-6">
                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                            Raccontaci com'è stata la tua esperienza con questa Star! La tua recensione sarà pubblica e visibile sul suo profilo per aiutare altri fan.
                        </p>

                        <div className="space-y-2">
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">Valutazione</label>
                            <div className="flex items-center gap-2">
                                {[1, 2, 3, 4, 5].map((starValue) => (
                                    <button
                                        key={starValue}
                                        type="button"
                                        onClick={() => setReviewRating(starValue)}
                                        className="text-amber-400 hover:scale-110 transition-transform focus:outline-none"
                                    >
                                        <Star 
                                            className={`w-8 h-8 ${
                                                starValue <= reviewRating ? 'fill-current' : 'text-slate-200'
                                            }`} 
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-black uppercase tracking-wider text-slate-400">Il tuo commento</label>
                            <textarea 
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:border-amber-500 transition-colors min-h-[100px]"
                                placeholder="Scrivi qui i tuoi ringraziamenti o dettagli sul video..."
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                required
                            />
                        </div>

                        <div className="flex gap-3">
                            <button type="button" onClick={() => setShowReviewModal(false)} className="btn-secondary flex-1 font-sans font-bold">Annulla</button>
                            <button 
                                type="button"
                                onClick={handleSubmitReview} 
                                disabled={isSubmittingReview || !reviewComment.trim()} 
                                className="bg-amber-500 hover:bg-amber-600 text-white flex-1 py-4 rounded-2xl font-black uppercase shadow-xl disabled:opacity-50 text-xs text-center"
                            >
                                {isSubmittingReview ? <Loader2 className="animate-spin mx-auto w-4 h-4" /> : 'Invia Recensione'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {showNotificationPrefsModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden">
                    <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-500 p-2 rounded-xl">
                                <Bell className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Preferenze Notifiche</h3>
                        </div>
                        <button onClick={() => !isSavingPrefs && setShowNotificationPrefsModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                            Seleziona quali notifiche desideri ricevere via email e in-app. Ricorda che alcune comunicazioni critiche dell'amministratore rimangono obbligatorie.
                        </p>

                        <div className="space-y-3.5 pt-2">
                            {[
                                { key: 'orderCreated', label: "Nuova Richiesta d'Ordine", desc: 'Notifica alla ricezione di un nuovo ordine.' },
                                { key: 'orderAccepted', label: 'Ordine Accettato', desc: 'Notifica quando la star accetta la richiesta.' },
                                { key: 'orderRejected', label: 'Ordine Rifiutato', desc: 'Notifica in caso di rifiuto da parte della star.' },
                                { key: 'videoUploaded', label: 'Video Caricato & Consegnato', desc: 'Notifica quando viene aggiunto il video messaggio.' },
                                { key: 'disputeOpened', label: 'Disputa Aperta', desc: 'Notifica per l\'apertura di una contestazione.' },
                                { key: 'disputeResolved', label: 'Disputa Risolta dallo Staff', desc: 'Notifica con l\'esito della risoluzione della disputa.' },
                                { key: 'orderCompleted', label: 'Ordine Completato Definitivamente', desc: 'Notifica quando il Fan accetta definitivamente il video.' }
                            ].map((notifOption) => {
                                const isGlobalEnabled = adminSettings?.enabledNotifications?.[notifOption.key as keyof typeof adminSettings.enabledNotifications] !== false;
                                const isNonNegotiable = adminSettings?.nonNegotiableNotifications?.[notifOption.key as keyof typeof adminSettings.nonNegotiableNotifications] === true;

                                // Se non è abilitato globalmente dall'admin, non lo mostriamo
                                if (!isGlobalEnabled) return null;

                                const isChecked = isNonNegotiable ? true : (notificationPrefs[notifOption.key] !== false);

                                return (
                                    <div key={notifOption.key} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                                        <div className="flex-1">
                                            <p className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                                {notifOption.label}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-0.5 leading-normal">
                                                {notifOption.desc}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {isNonNegotiable ? (
                                                <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">Obbligatoria</span>
                                            ) : (
                                                <input 
                                                    type="checkbox" 
                                                    className="h-4 w-4 text-indigo-600 rounded border-slate-200 focus:ring-indigo-500 cursor-pointer"
                                                    checked={isChecked}
                                                    onChange={e => {
                                                        setNotificationPrefs({
                                                            ...notificationPrefs,
                                                            [notifOption.key]: e.target.checked
                                                        });
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex gap-3">
                        <button type="button" disabled={isSavingPrefs} onClick={() => setShowNotificationPrefsModal(false)} className="btn-secondary flex-1 font-sans font-bold">Annulla</button>
                        <button 
                            type="button"
                            onClick={handleSaveNotificationPrefs} 
                            disabled={isSavingPrefs} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white flex-1 py-4 rounded-2xl font-black uppercase shadow-xl disabled:opacity-50 text-xs text-center"
                        >
                            {isSavingPrefs ? <Loader2 className="animate-spin mx-auto w-4 h-4" /> : 'Salva Impostazioni'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showDeleteAccountModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-rose-100">
                    <div className="p-8 border-b border-rose-50 flex items-center justify-between bg-rose-50/30">
                        <div className="flex items-center gap-3">
                            <div className="bg-rose-500 p-2 rounded-xl">
                                <Trash2 className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Elimina Account</h3>
                        </div>
                        <button onClick={() => !isDeletingAccount && setShowDeleteAccountModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors"><X className="w-6 h-6" /></button>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex gap-3 text-rose-800">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <div className="text-xs font-semibold leading-relaxed">
                                <p className="font-bold mb-1">Azione Irreversibile</p>
                                <p>L'eliminazione del tuo account comporterà la rimozione definitiva e non recuperabile di tutti i tuoi dati, video, recensioni, messaggi chat e credenziali dalla piattaforma!</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                            Se hai ordini in corso, verranno automaticamente annullati comunicando la motivazione "{user.role === UserRole.FAN ? 'Il fan' : 'La Star'} si è cancellato dalla app".
                        </p>

                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase text-slate-500">
                                Scrivi la parola <span className="text-rose-600 font-extrabold">ELIMINA</span> per confermare:
                            </label>
                            <input 
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Scrivi ELIMINA"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-bold placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-slate-800"
                                disabled={isDeletingAccount}
                            />
                            {deleteError && (
                                <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> {deleteError}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                        <button 
                            type="button" 
                            disabled={isDeletingAccount} 
                            onClick={() => {
                                setShowDeleteAccountModal(false);
                                setDeleteConfirmText("");
                                setDeleteError("");
                            }} 
                            className="btn-secondary flex-1 font-sans font-bold"
                        >
                            Annulla
                        </button>
                        <button 
                            type="button"
                            onClick={handleDeleteAccount} 
                            disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== "ELIMINA"} 
                            className="bg-rose-600 hover:bg-rose-700 text-white flex-1 py-4 rounded-2xl font-black uppercase shadow-xl disabled:opacity-50 text-xs text-center"
                        >
                            {isDeletingAccount ? <Loader2 className="animate-spin mx-auto w-4 h-4" /> : 'Elimina Definitivamente'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Toasts Container */}
        <div id="toast-container" className="fixed bottom-5 right-5 z-[200] space-y-3 w-full max-w-sm pointer-events-none px-4 sm:px-0">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className="pointer-events-auto flex items-start gap-3 bg-slate-900/95 backdrop-blur-md text-white border border-slate-800 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-right duration-300"
                >
                    <div className="mt-0.5">
                        {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                        {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
                        {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                        {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
                    </div>
                    <div className="flex-1 space-y-1">
                        {toast.title && <h4 className="font-extrabold text-[10px] uppercase tracking-wider text-slate-300">{toast.title}</h4>}
                        <p className="text-xs font-semibold text-slate-200">{toast.message}</p>
                        {toast.subText && <p className="text-[9px] text-slate-400 font-bold">{toast.subText}</p>}
                    </div>
                    <button
                        onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                        className="text-slate-400 hover:text-white transition-colors animate-none"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    </div>
  );
};

export default Dashboard;
