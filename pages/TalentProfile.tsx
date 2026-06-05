
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTalentById, createRequest, getAdminSettings, getReviewsForTalent, getPublicSamplesForTalent } from '../services/dataService';
import { Talent, User, AdminSettings, UserRole, Review } from '../types';
import { OCCASIONS } from '../constants';
import { 
  Loader2, Star, ShieldCheck, Zap, MessageSquare, Clock, CheckCircle, Info, CreditCard, Lock, X, Check, AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

const TalentProfile: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [talent, setTalent] = useState<Talent | undefined>();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [recipient, setRecipient] = useState('');
  const [instructions, setInstructions] = useState('');
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [agreed, setAgreed] = useState(false);
  const [allowPublicSample, setAllowPublicSample] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [publicSamples, setPublicSamples] = useState<any[]>([]);

  // Payment States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'idle' | 'processing' | 'success'>('idle');

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
      }
    };
    load();
  }, [id]);

  const initiateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) { 
        navigate('/login'); 
        return; 
    }
    if (currentUser.role === UserRole.TALENT) {
        return;
    }
    if (!agreed) return;
    setShowPaymentModal(true);
  };

  const handleFinalPayment = async () => {
    if (!talent || !settings || !currentUser) return;
    
    setIsProcessingPayment(true);
    setPaymentStep('processing');

    // Simulazione ritardo Stripe
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
        const orderId = await createRequest({
            talentId: talent.id,
            talentName: talent.name, // Aggiunto per persistenza nome nella dashboard fan
            fanId: currentUser.id,
            fanName: currentUser.name,
            recipientName: recipient,
            instructions: instructions,
            occasion: occasion,
            pricePaid: talent.price,
            allowPublicSample: allowPublicSample
        });

        setPaymentStep('success');
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#7C3AED', '#DB2777', '#3B82F6']
        });

        // Attesa per mostrare il successo
        setTimeout(() => {
            setShowPaymentModal(false);
            navigate('/dashboard');
        }, 3000);

    } catch (e) {
        console.error(e);
        alert("Errore tecnico durante la creazione dell'ordine. Riprova.");
        setPaymentStep('idle');
        setIsProcessingPayment(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="animate-spin text-indigo-600 w-10 h-10 mb-4" />
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Caricamento Profilo Star...</p>
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
                            <div className="bg-blue-500 rounded-full p-0.5"><CheckCircle className="w-4 h-4 text-white" /></div>
                        </div>
                        <p className="text-slate-500 font-medium text-lg leading-relaxed mb-6">{talent.bio}</p>
                        
                        {reviews.length > 0 && (
                            <div className="bg-gray-50 p-4 rounded-2xl text-center border border-gray-100/50">
                                <Star className="w-5 h-5 text-amber-400 fill-current mx-auto mb-1" />
                                <span className="text-lg font-black text-slate-900">
                                    {(reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)}
                                </span>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Rating ({reviews.length} {reviews.length === 1 ? 'recensione' : 'recensioni'})</p>
                            </div>
                        )}
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

                            <button 
                                type="submit"
                                disabled={!agreed || currentUser?.role === UserRole.TALENT}
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

      {/* STRIPE MOCK MODAL */}
      {showPaymentModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                  <div className="p-8 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <div className="bg-indigo-600 p-2 rounded-xl">
                              <CreditCard className="w-5 h-5 text-white" />
                          </div>
                          <h3 className="font-extrabold text-slate-900 uppercase tracking-tight">Checkout Sicuro</h3>
                      </div>
                      <button 
                        onClick={() => !isProcessingPayment && setShowPaymentModal(false)}
                        className="text-slate-400 hover:text-slate-900 transition-colors"
                      >
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  <div className="p-8">
                      {paymentStep === 'idle' && (
                          <div className="space-y-6">
                              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                  <div className="flex justify-between items-center mb-2">
                                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Video per</span>
                                      <span className="text-sm font-black text-slate-900">{recipient}</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                                      <span className="text-sm font-black text-slate-900">Totale da pagare</span>
                                      <span className="text-xl font-black text-indigo-600">€{talent.price.toFixed(2)}</span>
                                  </div>
                              </div>

                              <div className="space-y-4">
                                  <div className="relative">
                                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                      <input 
                                        type="text" 
                                        className="input-main pl-12 bg-gray-50 cursor-not-allowed" 
                                        value="**** **** **** 4242" 
                                        readOnly 
                                      />
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                      <input type="text" className="input-main bg-gray-50 cursor-not-allowed" value="12/26" readOnly />
                                      <input type="text" className="input-main bg-gray-50 cursor-not-allowed" value="CVC" readOnly />
                                  </div>
                              </div>

                              <button 
                                onClick={handleFinalPayment}
                                className="btn-primary w-full py-5 text-lg shadow-indigo-200"
                              >
                                  Paga ora €{talent.price.toFixed(2)}
                              </button>
                              
                              <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                  <Lock className="w-3 h-3" /> Transazione criptata SSL
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
                                  <h4 className="text-xl font-black text-slate-900 mb-2">Elaborazione...</h4>
                                  <p className="text-sm text-slate-500 font-medium">Stiamo comunicando con la tua banca.</p>
                              </div>
                          </div>
                      )}

                      {paymentStep === 'success' && (
                          <div className="py-12 text-center space-y-6">
                              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto text-white shadow-xl shadow-emerald-100 animate-bounce">
                                  <Check className="w-10 h-10 stroke-[4px]" />
                              </div>
                              <div>
                                  <h4 className="text-2xl font-black text-slate-900 mb-2">Pagamento Riuscito!</h4>
                                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                                      L'ordine è stato creato con successo.<br/>
                                      Verrai reindirizzato alla dashboard tra pochi secondi.
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
