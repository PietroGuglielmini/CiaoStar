
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getTalentById, createRequest, getAdminSettings, getReviewsForTalent, getPublicSamplesForTalent, callCreatePaymentIntent, subscribeToOrderChanges, incrementProfileViews, getRequestById } from '../services/dataService';
import { applyTalentSEO } from '../services/seoService';
import { Skeleton } from '../components/Skeleton';
import { Talent, User, AdminSettings, UserRole, Review } from '../types';
import { OCCASIONS } from '../constants';
import { 
  Loader2, Star, ShieldCheck, Zap, MessageSquare, Clock, CheckCircle, Info, CreditCard, Lock, X, Check, AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

const TalentProfile: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('orderId');
  
  const [talent, setTalent] = useState<Talent | undefined>();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [recipient, setRecipient] = useState('');
  const [instructions, setInstructions] = useState('');
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [agreed, setAgreed] = useState(false);
  const [withdrawalWaived, setWithdrawalWaived] = useState(false);
  const [allowPublicSample, setAllowPublicSample] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [publicSamples, setPublicSamples] = useState<any[]>([]);

  // Payment States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'idle' | 'processing' | 'success'>('idle');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // Draft States for Abandoned Cart recovery
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [draftTimeStr, setDraftTimeStr] = useState('');

  useEffect(() => {
    const load = async () => {
      if (id) {
        const [t, s, rList, sList] = await Promise.all([
          getTalentById(id), 
          getAdminSettings(),
          getReviewsForTalent(id),
          getPublicSamplesForTalent(id)
        ]);
        setTalent(t);
        setSettings(s);
        setReviews(rList);
        setPublicSamples(sList);
        setLoading(false);
        if (t) {
          applyTalentSEO(t.name, t.category);
          
          // Incrementa visualizzazioni profilo (GDPR compliant ed evita spam)
          const sessionKey = `viewed_talent_${id}`;
          if (!sessionStorage.getItem(sessionKey)) {
            sessionStorage.setItem(sessionKey, 'true');
            incrementProfileViews(id);
          }
        }
      }
    };
    load();
  }, [id]);

  // Draft auto-save side-effect (GDPR compliant - no payment data, config support)
  useEffect(() => {
    if (!talent || !currentUser) return;
    if (paymentStep === 'success') {
      localStorage.removeItem('ciao_star_abandoned_cart');
      return;
    }

    if (recipient.trim() || instructions.trim()) {
      const draft = {
        talentId: talent.id,
        talentName: talent.name,
        recipient,
        instructions,
        occasion,
        allowPublicSample,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('ciao_star_abandoned_cart', JSON.stringify(draft));
    }
  }, [recipient, instructions, occasion, allowPublicSample, talent, currentUser, paymentStep]);

  // Draft loading and verification on mount
  useEffect(() => {
    if (!talent) return;
    const raw = localStorage.getItem('ciao_star_abandoned_cart');
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        if (draft.talentId === talent.id) {
          // Verify expiry setup in admin global configuration
          const expiryHours = settings?.cartExpiryHours || 24;
          const draftDate = new Date(draft.timestamp);
          const ageHours = (new Date().getTime() - draftDate.getTime()) / (1000 * 60 * 60);
          
          if (ageHours <= expiryHours) {
            // Also ensure we only offer restoration if current fields are still empty
            if (!recipient && !instructions) {
              setDraftData(draft);
              setDraftTimeStr(draftDate.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }));
              setShowDraftBanner(true);
            }
          } else {
            localStorage.removeItem('ciao_star_abandoned_cart');
          }
        }
      } catch (err) {
        console.error("Errore nel parsing del carrello abbandonato:", err);
      }
    }
  }, [talent, settings]);

  // Recover order from URL orderIdParam (abandoned cart payment link)
  useEffect(() => {
    const checkResumeOrder = async () => {
      if (orderIdParam && currentUser && talent && !loading) {
        try {
          const order = await getRequestById(orderIdParam);
          if (order && order.fanId === currentUser.id && order.status === 'PENDING_PAYMENT') {
            setRecipient(order.recipientName || '');
            setInstructions(order.instructions || '');
            setOccasion(order.occasion || OCCASIONS[0]);
            setAllowPublicSample(order.allowPublicSample !== false);
            setCreatedOrderId(order.id);
            setAgreed(true);
            setWithdrawalWaived(true);
            setPaymentStep('processing');
            setShowPaymentModal(true);
            setPaymentError(null);

            try {
                const stripeRes = await callCreatePaymentIntent(order.id, order.pricePaid);
                setClientSecret(stripeRes.clientSecret);
                setPaymentIntentId(stripeRes.paymentIntentId);
                setPaymentStep('idle');
            } catch (stripeErr: any) {
                console.error("Errore nell'inizializzazione del PaymentIntent Stripe:", stripeErr);
                setPaymentError("Stripe non è configurato correttamente o la sessione è scaduta: " + (stripeErr?.message || "Impossibile generare del client secret per il checkout. Riprova."));
                setPaymentStep('idle');
            }
          }
        } catch (err) {
          console.error("Errore nel recupero dell'ordine per checkout:", err);
        }
      }
    };
    checkResumeOrder();
  }, [orderIdParam, currentUser, talent, loading]);

  const restoreDraft = () => {
    if (draftData) {
      setRecipient(draftData.recipient || '');
      setInstructions(draftData.instructions || '');
      setOccasion(draftData.occasion || OCCASIONS[0]);
      setAllowPublicSample(draftData.allowPublicSample !== false);
    }
    setShowDraftBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem('ciao_star_abandoned_cart');
    setShowDraftBanner(false);
  };

  const initiateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) { 
        navigate('/login'); 
        return; 
    }
    if (currentUser.role === UserRole.TALENT) {
        return;
    }
    if (!agreed || !withdrawalWaived) return;

    setIsProcessingPayment(true);
    setPaymentStep('processing');
    setShowPaymentModal(true);
    setPaymentError(null);

    try {
        const orderId = await createRequest({
            talentId: talent.id,
            talentName: talent.name,
            fanId: currentUser.id,
            fanName: currentUser.name,
            recipientName: recipient,
            instructions: instructions,
            occasion: occasion,
            pricePaid: talent.price,
            allowPublicSample: allowPublicSample
        });
        setCreatedOrderId(orderId);

        try {
            const stripeRes = await callCreatePaymentIntent(orderId, talent.price);
            setClientSecret(stripeRes.clientSecret);
            setPaymentIntentId(stripeRes.paymentIntentId);
            setPaymentStep('idle');
        } catch (stripeErr: any) {
            console.error("Errore nell'inizializzazione del PaymentIntent Stripe:", stripeErr);
            setPaymentError("Errore nell'inizializzazione del pagamento Stripe: " + (stripeErr?.message || "Impossibile generare del client secret per il checkout. Riprova."));
            setPaymentStep('idle');
        }
    } catch (err: any) {
        console.error("Errore inizializzazione prenotazione:", err);
        setPaymentError(err?.message || "Impossibile inizializzare il gate di pagamento Stripe.");
        setPaymentStep('idle');
    } finally {
        setIsProcessingPayment(false);
    }
  };

  const handleFinalPayment = async () => {
    if (!talent || !settings || !currentUser || !createdOrderId) return;
    
    setIsProcessingPayment(true);
    setPaymentStep('processing');
    setPaymentError(null);

    // Check if a real or custom publishable Stripe key is configured
    const isRealStripe = settings.stripePublishableKey && settings.stripePublishableKey.trim().startsWith('pk_');

    if (isRealStripe) {
        try {
            // 1. Load Stripe.js if not loaded
            if (!(window as any).Stripe) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = "https://js.stripe.com/v3/";
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error("Impossible to load Stripe.js library - please verify your internet connection."));
                    document.body.appendChild(script);
                });
            }

            // 2. Initialize Stripe
            const stripe = (window as any).Stripe(settings.stripePublishableKey!.trim());
            
            // 3. Simple validations on custom fields
            const cardExpiryParts = cardExpiry.split('/');
            if (cardExpiryParts.length !== 2) {
                throw new Error("Scadenza non valida. Usa il formato MM/AA.");
            }
            const expMonth = parseInt(cardExpiryParts[0], 10);
            const expYear = parseInt('20' + cardExpiryParts[1], 10);

            if (isNaN(expMonth) || isNaN(expYear) || expMonth < 1 || expMonth > 12) {
                throw new Error("Mese o anno di scadenza non valido.");
            }

            const cleanCardNum = cardNumber.replace(/\s/g, '');
            if (cleanCardNum.length < 15) {
                throw new Error("Numero di carta non valido.");
            }

            if (cardCvc.trim().length < 3) {
                throw new Error("CVC non valido (minimo 3 cifre).");
            }

            if (!clientSecret) {
                throw new Error("Stripe client secret non generato. Riprova.");
            }

            // 4. Confirm Card payment via Stripe Web SDK
            const result = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: {
                        number: cleanCardNum,
                        exp_month: expMonth,
                        exp_year: expYear,
                        cvc: cardCvc.trim()
                    },
                    billing_details: {
                        name: currentUser.name || "Fan Utente",
                        email: currentUser.email || ""
                    }
                }
            });

            if (result.error) {
                throw new Error(result.error.message || "Pagamento fallito tramite Stripe.");
            }

            // The Stripe Webhook on backend handles PAID_AWAITING_VIDEO, but let's notify client
            setPaymentStep('success');
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#7C3AED', '#DB2777', '#3B82F6']
            });

            setTimeout(() => {
                setShowPaymentModal(false);
                navigate('/dashboard');
            }, 3000);

        } catch (e: any) {
            console.error("Stripe Transaction Error:", e);
            setPaymentError(e?.message || "Errore di transazione durante l'addebito Stripe.");
            setPaymentStep('idle');
            setIsProcessingPayment(false);
        }
    } else {
        // Safe Simulated Sandbox Mode fallback (no keys registered yet)
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // Aggiorna lo stato su Firestore a PAID_AWAITING_VIDEO
            const { updateRequestStatus } = await import('../services/dataService');
            await updateRequestStatus(createdOrderId, 'PAID_AWAITING_VIDEO' as any);

            setPaymentStep('success');
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#7C3AED', '#DB2777', '#3B82F6']
            });

            setTimeout(() => {
                setShowPaymentModal(false);
                navigate('/dashboard');
            }, 3000);

        } catch (e: any) {
            console.error("Errore durante la transazione simulata:", e);
            setPaymentError(e?.message || "Errore di transazione durante l'addebito Stripe.");
            setPaymentStep('idle');
            setIsProcessingPayment(false);
        }
    }
  };

  if (loading) return (
    <div className="bg-gray-50 min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-8 items-center md:items-start">
              <Skeleton className="w-48 h-48 rounded-3xl shrink-0" />
              <div className="space-y-4 flex-1 w-full text-center md:text-left">
                <Skeleton className="h-8 w-2/3 mx-auto md:mx-0" />
                <Skeleton className="h-4 w-1/3 mx-auto md:mx-0" />
                <Skeleton className="h-16 w-5/6 mx-auto md:mx-0" />
              </div>
            </div>
            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm space-y-6">
              <Skeleton className="h-6 w-40" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
              </div>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm space-y-6">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  
  if (!talent) return <div className="p-20 text-center font-bold text-slate-400">Star non trovata.</div>;

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            
            {/* Sinistra: Info Star */}
            <div className="lg:col-span-5 space-y-8">
                <div className="bg-white rounded-[2rem] p-4 shadow-sm border border-gray-100">
                    <div className="aspect-[4/5] rounded-[1.5rem] overflow-hidden mb-6 bg-gray-100">
                        <img src={talent.avatarUrl} className="w-full h-full object-cover" alt={talent.name} />
                    </div>
                    <div className="px-4 pb-4">
                        <div className="flex items-center gap-2 mb-2">
                            <h1 className="text-3xl font-extrabold text-slate-900">{talent.name}</h1>
                            <div className="bg-amber-500 rounded-full p-0.5"><CheckCircle className="w-4 h-4 text-white" /></div>
                        </div>
                        <p className="text-slate-500 font-medium text-lg leading-relaxed mb-6">{talent.bio}</p>
                        
                        <div className="grid grid-cols-3 shadow-sm rounded-2xl border border-gray-100 overflow-hidden mb-6">
                            <div className="bg-gray-50/50 p-4 text-center border-r border-gray-100 flex flex-col justify-center">
                                <div className="text-lg font-black text-slate-900">
                                    €{talent.price}
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Prezzo base</p>
                            </div>
                            
                            <div className="bg-gray-50/50 p-4 text-center border-r border-gray-100 flex flex-col justify-center">
                                {talent.completedOrdersCount ? (
                                    <div className="text-lg font-black text-indigo-600">
                                        {talent.completedOrdersCount}
                                    </div>
                                ) : (
                                    <div className="text-xs font-black text-emerald-500 flex items-center justify-center gap-0.5">
                                        Nuovo <Zap className="w-3 h-3 text-amber-400 fill-current" />
                                    </div>
                                )}
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Ordini completati</p>
                            </div>

                            <div className="bg-gray-50/50 p-4 text-center flex flex-col justify-center">
                                {reviews.length > 0 ? (
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="text-lg font-black text-slate-900">
                                            {(reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)}
                                        </span>
                                        <Star className="w-4 h-4 text-amber-400 fill-current" />
                                    </div>
                                ) : (
                                    <div className="text-xs font-black text-slate-400">
                                        -
                                    </div>
                                )}
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                    Rating ({reviews.length})
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Video di Invito del Talent */}
                {talent.introVideoUrl && (
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-3">
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">Video di Invito</h3>
                        <div className="rounded-2xl overflow-hidden aspect-video bg-black relative shadow-inner">
                            <video 
                                src={talent.introVideoUrl} 
                                controls 
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                )}

                {/* Recensioni dei Fan */}
                {reviews.length > 0 && (
                    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-4">
                        <h3 className="text-lg font-black text-slate-900 border-b border-gray-100 pb-3">Cosa dicono i Fan</h3>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                            {reviews.map((r, idx) => (
                                <div key={idx} className="border-b border-gray-50 last:border-0 pb-3 last:pb-0 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-slate-900">{r.fanName}</span>
                                        <div className="flex items-center gap-0.5 text-amber-400">
                                            {Array.from({ length: r.rating }).map((_, i) => (
                                                <Star key={i} className="w-3 h-3 fill-current" />
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium italic">"{r.comment}"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-indigo-600 rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden">
                    <Zap className="absolute top-4 right-4 w-12 h-12 text-indigo-400 opacity-20" />
                    <h3 className="text-xl font-bold mb-4">Perché ordinare da {talent.name}?</h3>
                    <ul className="space-y-4 text-sm font-medium opacity-90">
                        <li className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-indigo-300 flex-shrink-0" />
                            Video autentico e 100% personalizzato.
                        </li>
                        <li className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-indigo-300 flex-shrink-0" />
                            Perfetto come regalo dell'ultimo minuto.
                        </li>
                        <li className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-indigo-300 flex-shrink-0" />
                            Pagamento sicuro e rimborso garantito se non consegnato.
                        </li>
                    </ul>
                </div>
            </div>

            {/* Destra: Form di Prenotazione */}
            <div className="lg:col-span-7">
                <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-sm border border-gray-100">
                    <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Prenota il tuo video</h2>
                    <p className="text-slate-400 font-medium mb-10">Compila i dettagli qui sotto per richiedere il tuo video personalizzato.</p>
                    
                    {showDraftBanner && (
                        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 text-left animate-fadeIn">
                            <div className="flex gap-3 items-start">
                                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-black text-amber-800 uppercase tracking-tight">Hai una bozza in sospeso</p>
                                    <p className="text-[10px] text-amber-700 font-bold leading-normal mt-0.5">
                                        Hai iniziato a compilare una richiesta per {talent.name} il {draftTimeStr}. Vuoi ripristinare i dati salvati?
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button 
                                    type="button" 
                                    onClick={restoreDraft}
                                    className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase px-3.5 py-2 rounded-xl shadow transition"
                                >
                                    Sì, Ripristina
                                </button>
                                <button 
                                    type="button" 
                                    onClick={discardDraft}
                                    className="bg-white border border-amber-200 text-amber-700 hover:bg-amber-100 text-[10px] font-black uppercase px-3.5 py-2 rounded-xl transition"
                                >
                                    No, Cancella
                                </button>
                            </div>
                        </div>
                    )}

                    <form onSubmit={initiateBooking} className="space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">L'occasione</label>
                                <select 
                                    className="input-main"
                                    value={occasion} onChange={e => setOccasion(e.target.value)}
                                >
                                    {OCCASIONS.map(occ => <option key={occ} value={occ}>{occ}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Per chi è il video?</label>
                                <input 
                                    className="input-main"
                                    placeholder="Nome del destinatario" value={recipient} onChange={e => setRecipient(e.target.value)} required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1 flex justify-between">
                                <span>Istruzioni per la Star</span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">Sii specifico</span>
                            </label>
                            <textarea 
                                className="input-main min-h-[150px] resize-none"
                                placeholder={`Ciao ${talent.name}, potresti fare gli auguri a...`}
                                value={instructions} onChange={e => setInstructions(e.target.value)} required
                            />
                        </div>

                        <div className="bg-blue-50 p-4 rounded-xl flex gap-3">
                            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-800 font-medium leading-relaxed">
                                Le Star si riservano il diritto di rifiutare richieste inappropriate. I fondi vengono addebitati solo al momento del caricamento del video.
                            </p>
                        </div>

                        {currentUser?.role === UserRole.TALENT && (
                            <div className="bg-rose-50 p-4 rounded-xl flex gap-3 border border-rose-100">
                                <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-rose-800 font-bold leading-relaxed">
                                    I profili di tipo "Talent" non possono effettuare ordini. Per prenotare un video personalizzato, esegui il login con un account Fan.
                                </p>
                            </div>
                        )}

                        <div className="pt-6 border-t border-gray-100 flex flex-col gap-6">
                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input type="checkbox" checked={allowPublicSample} onChange={e => setAllowPublicSample(e.target.checked)} className="sr-only" />
                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mt-0.5 ${allowPublicSample ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 group-hover:border-indigo-300'}`}>
                                    {allowPublicSample && <CheckCircle className="w-4 h-4 text-white" />}
                                </div>
                                <span className="text-xs text-slate-500 font-bold leading-normal">
                                    Consenti al talent di pubblicare il video che ti manderà come video esempio nella sua pagina pubblica.
                                </span>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="sr-only" />
                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mt-0.5 ${agreed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 group-hover:border-indigo-300'}`}>
                                    {agreed && <CheckCircle className="w-4 h-4 text-white" />}
                                </div>
                                <span className="text-xs text-slate-500 font-bold leading-normal">
                                    Ho letto e accetto i termini di servizio e la politica di cancellazione.
                                </span>
                            </label>

                            <label className="flex items-start gap-3 cursor-pointer group mt-2">
                                <input type="checkbox" checked={withdrawalWaived} onChange={e => setWithdrawalWaived(e.target.checked)} className="sr-only" />
                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all mt-0.5 ${withdrawalWaived ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200 group-hover:border-indigo-300'}`}>
                                    {withdrawalWaived && <CheckCircle className="w-4 h-4 text-white" />}
                                </div>
                                <span className="text-xs text-slate-500 font-bold leading-normal">
                                    Accetto che l'esecuzione del servizio inizi immediatamente e rinuncio al mio diritto di recesso dal momento in cui il video mi viene recapitato (Art. 59, lett. c del Codice del Consumo italiano).
                                </span>
                            </label>

                            <button 
                                type="submit"
                                disabled={!agreed || !withdrawalWaived || currentUser?.role === UserRole.TALENT}
                                className="btn-primary w-full py-5 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Zap className="w-5 h-5 fill-current" />
                                {currentUser?.role === UserRole.TALENT ? 'Ordinazione non consentita ai Talent' : `Prenota ora a €${talent.price}`}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Esempi di Video Caricati (Samples) */}
            {publicSamples.length > 0 && (
                <div className="mt-12 bg-white rounded-[2rem] p-8 md:p-12 shadow-sm border border-gray-100 col-span-12">
                    <h3 className="text-2xl font-black text-slate-900 mb-2">I video recapitati da {talent.name}</h3>
                    <p className="text-sm text-slate-400 font-medium mb-8">Guarda alcuni esempi di video realizzati con successo per la nostra community.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {publicSamples.map((sample, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-2xl overflow-hidden border border-gray-100 shadow-sm flex flex-col">
                                <div className="aspect-video bg-black relative">
                                    <video src={sample.videoUrl} controls className="w-full h-full object-cover" />
                                </div>
                                <div className="p-4 flex-1">
                                    <div className="text-xs font-bold text-indigo-600 mb-1">{sample.occasion}</div>
                                    <h4 className="text-sm font-black text-slate-900">Per: {sample.recipientName}</h4>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* STRIPE PAYMENT ELEMENT & CHECKOUT SIMULATED MODAL */}
      {showPaymentModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                  <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <div className="bg-indigo-600 p-2.5 rounded-xl">
                              <CreditCard className="w-5 h-5 text-white" />
                          </div>
                          <div>
                              <h3 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">Checkout Sicuro</h3>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Stripe Connect SDK Gateway</span>
                          </div>
                      </div>
                      <button 
                        onClick={() => !isProcessingPayment && setShowPaymentModal(false)}
                        className="text-slate-400 hover:text-slate-900 transition-colors"
                      >
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  <div className="p-8">
                      {paymentError && (
                          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-medium text-rose-700 flex items-start gap-2.5 mb-6">
                              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                              <span>{paymentError}</span>
                          </div>
                      )}

                      {paymentStep === 'idle' && (
                          <div className="space-y-6">
                              <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4">
                                  <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Video per</span>
                                      <span className="text-xs font-bold text-slate-900">{recipient}</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                                      <span className="text-xs font-black text-slate-900">Importo Totale</span>
                                      <span className="text-lg font-black text-indigo-700">€{talent.price.toFixed(2)}</span>
                                  </div>

                                  {/* Separate Charges and Transfers Split UI */}
                                  <div className="pt-3 border-t border-gray-200/60 text-[10px] space-y-1.5 text-slate-600">
                                      <div className="font-black text-slate-800 uppercase tracking-wider mb-2">Split "Separate Charges & Transfers":</div>
                                      <div className="flex justify-between">
                                          <span className="font-bold text-slate-700">Quota Talent (80%):</span>
                                          <span className="font-black text-slate-900">€{(talent.price * 0.8).toFixed(2)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                          <span className="font-bold text-slate-700">Fee Piattaforma (20%):</span>
                                          <span className="font-black text-slate-900">€{(talent.price * 0.2).toFixed(2)}</span>
                                      </div>
                                      <p className="text-[9px] pt-1.5 leading-normal text-slate-600 font-medium italic border-t border-dashed border-gray-200">
                                          Nota: L'importo totale viene congelato sulla piattaforma. Al caricamento del video su Storage, la Cloud Function avvia lo split immediato.
                                      </p>
                                  </div>
                              </div>

                              {/* Stripe Token verification */}
                              {clientSecret ? (
                                  <div className="space-y-4 font-sans">
                                      <div className="border border-indigo-100 rounded-xl px-3 py-1.5 bg-indigo-50/20 text-[9px] text-indigo-800 font-bold block overflow-hidden text-ellipsis whitespace-nowrap">
                                          <span className="bg-indigo-100 text-indigo-900 px-1 py-0.5 rounded mr-1">Token</span>
                                          {clientSecret}
                                      </div>

                                      <div className="space-y-3">
                                          <div>
                                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Numero Carta</label>
                                              <div className="relative">
                                                  <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                  <input 
                                                    type="text" 
                                                    className="input-main pl-11 bg-white text-xs py-3 border border-gray-200 rounded-xl" 
                                                    placeholder="4242 4242 4242 4242"
                                                    maxLength={19} 
                                                    value={cardNumber}
                                                    onChange={(e) => setCardNumber(e.target.value)}
                                                  />
                                              </div>
                                          </div>
                                          <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Scadenza</label>
                                                  <input type="text" className="input-main bg-white text-xs py-3 text-center border border-gray-200 rounded-xl" placeholder="MM/AA" maxLength={5} value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} />
                                              </div>
                                              <div>
                                                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">CVC</label>
                                                  <input type="text" className="input-main bg-white text-xs py-3 text-center border border-gray-200 rounded-xl" placeholder="123" maxLength={3} value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} />
                                              </div>
                                          </div>
                                      </div>

                                      <button 
                                        onClick={handleFinalPayment}
                                        className="w-full py-4 text-sm font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 select-none cursor-pointer mt-4"
                                      >
                                          Conferma Pagamento (€{talent.price.toFixed(2)})
                                      </button>
                                  </div>
                              ) : (
                                  <div className="py-6 flex flex-col items-center justify-center space-y-3 text-center">
                                      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Creazione PaymentIntent in corso...</span>
                                  </div>
                              )}
                              
                              <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 pt-2 border-t border-gray-100">
                                  <Lock className="w-3 h-3 text-indigo-600" /> Transazione protetta da crittografia end-to-end
                              </p>
                          </div>
                      )}

                      {paymentStep === 'processing' && (
                          <div className="py-12 text-center space-y-6">
                              <div className="relative w-20 h-20 mx-auto">
                                  <Loader2 className="w-20 h-20 text-indigo-600 animate-spin" />
                                  <CreditCard className="absolute inset-0 m-auto w-8 h-8 text-indigo-600" />
                              </div>
                              <div>
                                  <h4 className="text-base font-black text-slate-900 mb-1 uppercase tracking-tight">Comunicazione con Stripe...</h4>
                                  <p className="text-xs text-slate-400 font-semibold leading-relaxed">Fondi in congelamento sulla piattaforma CiaoStar.</p>
                              </div>
                          </div>
                      )}

                      {paymentStep === 'success' && (
                          <div className="py-12 text-center space-y-6">
                              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto text-white shadow-xl shadow-emerald-200 animate-bounce">
                                  <Check className="w-10 h-10 stroke-[4px]" />
                              </div>
                              <div>
                                  <h4 className="text-lg font-black text-slate-900 mb-1 uppercase tracking-tight">Transazione Conclusa!</h4>
                                  <p className="text-xs text-emerald-700 font-medium leading-relaxed bg-emerald-50 border border-emerald-100 px-4 py-2.5 rounded-xl">
                                      Stato dell'ordine: <span className="font-bold">PAID_AWAITING_VIDEO</span>.<br/> Reindirizzamento alla tua bacheca in corso...
                                  </p>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default TalentProfile;
