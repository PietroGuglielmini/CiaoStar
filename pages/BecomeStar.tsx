import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { db } from '../firebaseConfig';
import { collection, addDoc } from 'firebase/firestore';
import { DB_CATEGORIES_SEED } from '../constants';
import { Star, Shield, ArrowRight, CheckCircle2, ChevronRight, MessageSquare, Award, Sparkles, DollarSign } from 'lucide-react';

const BecomeStar: React.FC = () => {
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState(DB_CATEGORIES_SEED[0] || 'Influencer');
  const [socialLink, setSocialLink] = useState('');
  const [followers, setFollowers] = useState('');
  const [bio, setBio] = useState('');
  const [taxStatus, setTaxStatus] = useState<'DIP_AUT' | 'PARTITA_IVA'>('DIP_AUT');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptTerms) {
      toast.error("È obbligatorio accettare i termini di presentazione candidatura.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'talent_applications'), {
        name,
        email,
        category,
        socialLink,
        followers: Number(followers) || 0,
        bio,
        taxStatus,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });
      toast.success("Candidatura inviata con successo!");
      setSuccess(true);
    } catch (err: any) {
      console.error("Errore durante l'invio della candidatura:", err);
      toast.error("Errore durante l'invio: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="bg-white rounded-[2.5rem] p-10 md:p-14 border border-slate-100 shadow-xl space-y-6">
          <div className="w-20 h-20 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Candidatura Ricevuta!</h2>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Grazie per aver inviato la tua richiesta per entrare nel team di CiaoStar. <br />
            Il nostro team di selezione esaminerà i tuoi profili social e ti risponderà via email entro 48 ore lavorative.
          </p>
          <div className="pt-4">
            <button 
              onClick={() => navigate('/')}
              className="bg-slate-900 hover:bg-black text-white px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
            >
              Torna alla Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-slate-930 text-white py-20 md:py-32 px-4 border-b border-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950 -z-10" />
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-black uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Diventa una Star
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-indigo-200 tracking-tight leading-tight">
            Connettiti con i tuoi fan e monetizza il tuo talento
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-2xl mx-auto font-medium leading-relaxed">
            CiaoStar ti permette di regalare emozioni uniche inviando videomessaggi personalizzati. Unisciti alla community italiana leader del settore.
          </p>

          {/* Pricing Model Info Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto pt-8">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-left space-y-1">
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest block">La tua quota di guadagno</span>
              <span className="text-3xl font-black text-white block">80%</span>
              <span className="text-xs text-slate-400 font-medium block leading-relaxed">Guadagni l'ottanta percento di ogni singolo videomessaggio evaso con successo.</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-left space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Commissione CiaoStar</span>
              <span className="text-3xl font-black text-slate-300 block">20%</span>
              <span className="text-xs text-slate-400 font-medium block leading-relaxed">La nostra trattenuta del venti percento copre i costi di transazione, marketing e hosting.</span>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS & DETAILS */}
      <section className="py-16 px-4 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xs space-y-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Award className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900 uppercase">Gestione Autonoma</h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Decidi tu il prezzo di ciascun video, i giorni massimi entro cui rispondere (fino a 7 giorni) e la tua disponibilità.
            </p>
          </div>

          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xs space-y-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <DollarSign className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900 uppercase">Pagamenti automatici</h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Registra il tuo conto tramite Stripe Connect. Gli accrediti avvengono periodicamente in modo sicuro e tracciato.
            </p>
          </div>

          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xs space-y-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900 uppercase">Protezione Legale</h3>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Siamo conformi a tutte le normative GDPR ed europee sul diritto d'autore. Gestione delle controversie assistita dal nostro staff.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Candidacy Form */}
          <div className="lg:col-span-7 bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-100 shadow-sm space-y-6">
            <div className="text-left border-b border-slate-50 pb-4">
              <h2 className="text-xl font-black text-slate-900 uppercase">Invia la tua Candidatura</h2>
              <p className="text-xs text-slate-400 font-semibold">Compila i campi richiesti per permettere al nostro staff di valutare il tuo profilo.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome d'Arte / Reale</label>
                  <input 
                    type="text" 
                    required
                    placeholder="es. Chef Rossi o DJ Star"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Indirizzo Email</label>
                  <input 
                    type="email" 
                    required
                    placeholder="nome@email.it"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria Principale</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                  >
                    {DB_CATEGORIES_SEED.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Followers Stimati (Totali)</label>
                  <input 
                    type="number" 
                    required
                    placeholder="es. 15000"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                    value={followers}
                    onChange={e => setFollowers(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Link Profilo Social Principale</label>
                <input 
                  type="url" 
                  required
                  placeholder="https://instagram.com/tuoprofilo"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                  value={socialLink}
                  onChange={e => setSocialLink(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Presentati brevemente</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="Raccontaci chi sei, perché vuoi iscriverti a CiaoStar e di cosa ti occupi..."
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                />
              </div>

              {/* Legal / Tax options */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Inquadramento Fiscale Preferito</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className={`border p-4 rounded-xl flex items-start gap-3 cursor-pointer transition-all ${taxStatus === 'DIP_AUT' ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-100 bg-slate-50/50'}`}>
                    <input 
                      type="radio" 
                      name="taxStatus" 
                      checked={taxStatus === 'DIP_AUT'} 
                      onChange={() => setTaxStatus('DIP_AUT')} 
                      className="mt-0.5 text-indigo-600 focus:ring-0" 
                    />
                    <div>
                      <span className="block text-xs font-black text-slate-900 leading-tight">Persona Fisica</span>
                      <span className="block text-[10px] text-slate-400 font-semibold leading-normal mt-1">Cessione Diritti d'Autore (Esente IVA, perfetto se non si ha Partita IVA).</span>
                    </div>
                  </label>
                  <label className={`border p-4 rounded-xl flex items-start gap-3 cursor-pointer transition-all ${taxStatus === 'PARTITA_IVA' ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-100 bg-slate-50/50'}`}>
                    <input 
                      type="radio" 
                      name="taxStatus" 
                      checked={taxStatus === 'PARTITA_IVA'} 
                      onChange={() => setTaxStatus('PARTITA_IVA')} 
                      className="mt-0.5 text-indigo-600 focus:ring-0" 
                    />
                    <div>
                      <span className="block text-xs font-black text-slate-900 leading-tight">Partita IVA</span>
                      <span className="block text-[10px] text-slate-400 font-semibold leading-normal mt-1">Fatturazione autonoma con regime ordinario o forfettario.</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    required
                    checked={acceptTerms}
                    onChange={e => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 text-indigo-600 rounded focus:ring-0" 
                  />
                  <span className="text-[10px] text-amber-900 font-semibold leading-relaxed">
                    Dichiaro di essere titolare o legittimo possessore dell’account social indicato, di avere almeno 18 anni, e di acconsentire al trattamento dei miei dati al fine esclusivo di valutare la mia iscrizione a CiaoStar.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs tracking-wider py-4 rounded-2xl shadow-lg transition-all"
              >
                {loading ? 'Invio Candidatura in corso...' : (
                  <>
                    Invia Candidatura <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Tax Information FAQ / Informative card */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 text-white rounded-[2.5rem] p-8 border border-slate-950 shadow-xl space-y-6 text-left">
              <h3 className="text-sm font-black uppercase tracking-wider text-indigo-400">Guida alla Trasparenza Fiscale</h3>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                CiaoStar opera nella massima conformità delle leggi tributarie e civili della Repubblica Italiana. Ecco come funziona l'aspetto fiscale della tua attività artistica sulla nostra piattaforma:
              </p>

              <div className="space-y-4 pt-2 border-t border-white/10 text-xs">
                <div>
                  <h4 className="font-bold text-white text-xs mb-1">Come avvengono gli accrediti?</h4>
                  <p className="text-slate-400 leading-normal">
                    L'utente effettua il pagamento a CiaoStar. Su ciascun pagamento, la piattaforma trattiene il 20%. L'80% rimanente viene accreditato automaticamente sul tuo conto tramite il sistema protetto Stripe Connect non appena consegni il videomessaggio approvato dal fan.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-white text-xs mb-1">Cessione del Diritto d'Autore (Privati)</h4>
                  <p className="text-slate-400 leading-normal">
                    Se non possiedi una Partita IVA, le tue creazioni di videomessaggi ricadono fiscalmente nella cessione dei diritti d'autore (art. 53, comma 2, lett. b del TUIR). Questo inquadramento è esente da IVA e prevede una deduzione forfettaria delle spese del 25% (o del 40% se hai meno di 35 anni).
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-white text-xs mb-1">Emissione Fattura (Professionsiti/P.IVA)</h4>
                  <p className="text-slate-400 leading-normal">
                    Se eserciti l'attività professionale con Partita IVA, sarai tenuto ad emettere fattura elettronica trimestralmente o mensilmente per le commissioni spettanti ed i compensi liquidati su Stripe Connect.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-[11px] text-slate-400 leading-relaxed font-semibold">
                * Nota Legale: CiaoStar non si sostituisce al tuo consulente fiscale o commercialista. Ogni talento è responsabile dell'inserimento dei propri redditi nella dichiarazione dei redditi annuale (Modello 730 o Persone Fisiche).
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default BecomeStar;
