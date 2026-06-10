import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider, facebookProvider, microsoftProvider } from '../firebaseConfig';
import * as firebaseAuth from 'firebase/auth';
import { Star, ArrowRight, AlertTriangle, Check, Copy, Mail, Lock, LogIn, UserPlus } from 'lucide-react';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copied, setCopied] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);

  // Email / Password Authentication States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  // Generic Social Sign-In Helper
  const handleSocialLogin = async (provider: any) => {
    if (!termsAccepted || !gdprAccepted) {
      setErrorMsg("È obbligatorio accettare i Termini di Servizio e il consenso GDPR per procedere ed iscriversi alla piattaforma.");
      return;
    }
    setErrorMsg(null);
    setIsUnauthorizedDomain(false);
    setLoading(true);
    try {
      await firebaseAuth.signInWithPopup(auth, provider);
      navigate('/');
    } catch (error: any) {
      console.error("Errore di autenticazione social:", error);
      const isDomainError = error?.code === 'auth/unauthorized-domain' || 
                            error?.message?.includes('unauthorized-domain') ||
                            JSON.stringify(error)?.includes('unauthorized-domain');
      
      if (isDomainError) {
        setIsUnauthorizedDomain(true);
        setErrorMsg("Questo dominio non è inserito tra i domini autorizzati in Firebase Console.");
      } else {
        setErrorMsg(error?.message || "Errore durante l'accesso.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Traditional Email/Password Auth
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAccepted || !gdprAccepted) {
      setErrorMsg("È obbligatorio accettare i Termini di Servizio e il consenso GDPR per procedere ed iscriversi alla piattaforma.");
      return;
    }
    setErrorMsg(null);
    setIsUnauthorizedDomain(false);
    setLoading(true);
    try {
      if (isRegistering) {
        await firebaseAuth.createUserWithEmailAndPassword(auth, email, password);
      } else {
        await firebaseAuth.signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (error: any) {
      console.error("Errore autenticazione email:", error);
      setErrorMsg(error?.message || "Errore durante l'autenticazione. Verifica le tue credenziali.");
    } finally {
      setLoading(false);
    }
  };

  const copyHostname = () => {
    navigator.clipboard.writeText(window.location.hostname);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full my-8">
            <div className="text-center mb-6">
                <div className="bg-indigo-600 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-100 animate-pulse">
                    <Star className="w-8 h-8 text-white fill-current" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Bentornato su CiaoStar</h2>
                <p className="text-slate-700 font-extrabold text-sm">Entra nel mondo dei video messaggi personalizzati.</p>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-gray-100 space-y-6">
                {/* Switch Login VS Register */}
                <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1.5 rounded-2xl">
                  <button 
                    type="button"
                    onClick={() => { setIsRegistering(false); setErrorMsg(null); }}
                    className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${!isRegistering ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    Accedi
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setIsRegistering(true); setErrorMsg(null); }}
                    className={`py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${isRegistering ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    Registrati
                  </button>
                </div>

                {/* Email / Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest">Indirizzo Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="email" 
                        required
                        placeholder="nome@esempio.it"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-500 text-slate-800"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-slate-700 uppercase tracking-widest">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="password" 
                        required
                        placeholder="••••••••"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors placeholder-slate-500 text-slate-800"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Legal Checkboxes */}
                  <div className="space-y-3 pt-2 text-left bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <label className="flex items-start gap-3 cursor-pointer">
                          <input
                              type="checkbox"
                              checked={termsAccepted}
                              onChange={(e) => setTermsAccepted(e.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="text-xs text-slate-700 font-extrabold leading-relaxed">
                              Accetto i <strong className="text-slate-900 font-extrabold">Termini e Condizioni</strong> e dichiaro di aver visionato l’<strong className="text-slate-900 font-extrabold">Informativa Privacy</strong> della piattaforma CiaoStar.
                          </span>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer">
                          <input
                              type="checkbox"
                              checked={gdprAccepted}
                              onChange={(e) => setGdprAccepted(e.target.checked)}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <span className="text-xs text-slate-700 font-extrabold leading-relaxed">
                              Consento al <strong className="text-slate-900 font-extrabold">trattamento dei miei dati personali</strong> (incluso email e foto profilo fornite dai social) in conformità con il Regolamento Europeo n. 2016/679 (<strong className="text-slate-900 font-extrabold">GDPR</strong>).
                          </span>
                      </label>
                  </div>

                  <button
                      type="submit"
                      disabled={loading || !termsAccepted || !gdprAccepted}
                      className={`w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer ${
                          termsAccepted && gdprAccepted 
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-100' 
                          : 'bg-gray-100 border-gray-100 text-slate-500 cursor-not-allowed opacity-90'
                      }`}
                  >
                      {isRegistering ? (
                        <>
                          <UserPlus className="w-4 h-4" /> Registrati Ora
                        </>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4" /> Accedi con Email
                        </>
                      )}
                  </button>
                </form>

                <div className="flex items-center gap-3">
                  <div className="h-px bg-slate-100 flex-1"></div>
                  <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Oppure accedi con</span>
                  <div className="h-px bg-slate-100 flex-1"></div>
                </div>

                {/* Social Login Buttons Grid */}
                <div className="space-y-2">
                  {/* Google */}
                  <button
                      type="button"
                      onClick={() => handleSocialLogin(googleProvider)}
                      disabled={loading || !termsAccepted || !gdprAccepted}
                      className={`w-full flex items-center justify-center gap-3 py-3 px-4 border rounded-xl font-bold text-xs transition-all ${
                          termsAccepted && gdprAccepted 
                          ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer' 
                          : 'bg-gray-50 border-gray-100 text-slate-400 opacity-60 cursor-not-allowed'
                      }`}
                  >
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4" />
                      Google
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Facebook */}
                    <button
                        type="button"
                        onClick={() => handleSocialLogin(facebookProvider)}
                        disabled={loading || !termsAccepted || !gdprAccepted}
                        className={`flex items-center justify-center gap-2 py-3 px-4 border rounded-xl font-bold text-xs transition-all ${
                            termsAccepted && gdprAccepted 
                            ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer' 
                            : 'bg-gray-50 border-gray-100 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                    >
                        <svg className="w-4 h-4 text-[#1877F2] fill-current" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        Facebook
                    </button>

                    {/* Microsoft */}
                    <button
                        type="button"
                        onClick={() => handleSocialLogin(microsoftProvider)}
                        disabled={loading || !termsAccepted || !gdprAccepted}
                        className={`flex items-center justify-center gap-2 py-3 px-4 border rounded-xl font-bold text-xs transition-all ${
                            termsAccepted && gdprAccepted 
                            ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer' 
                            : 'bg-gray-50 border-gray-100 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 23 23">
                          <path fill="#f35325" d="M0 0h11v11H0z" />
                          <path fill="#81bc06" d="M12 0h11v11H12z" />
                          <path fill="#05a6f0" d="M0 12h11v11H0z" />
                          <path fill="#ffba08" d="M12 12h11v11H12z" />
                        </svg>
                        Outlook
                    </button>
                  </div>
                </div>

                {errorMsg && (
                    <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl space-y-3">
                        <div className="flex items-start gap-3 text-rose-800">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-black uppercase tracking-tight">Accesso Fallito</p>
                                <p className="text-xs font-semibold leading-relaxed">{errorMsg}</p>
                            </div>
                        </div>

                        {isUnauthorizedDomain && (
                            <div className="pt-3 border-t border-rose-100/60 space-y-3 text-[11px] text-rose-900">
                                <p className="font-extrabold uppercase tracking-wide">Come risolvere subito:</p>
                                <ol className="list-decimal pl-4 space-y-1.5 font-medium leading-relaxed">
                                    <li>Apri la tua <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-indigo-600 hover:text-indigo-700">Firebase Console</a>.</li>
                                    <li>Vai nella sezione <strong>Authentication</strong> e seleziona il tab <strong>Settings</strong> (Impostazioni) in alto.</li>
                                    <li>Clicca su <strong>Authorized domains</strong> (Domini autorizzati).</li>
                                    <li>Clicca su <strong>Add domain</strong> (Aggiungi dominio) ed inserisci questo esatto dominio corrente:</li>
                                </ol>

                                <div className="bg-white/80 border border-rose-200 rounded-xl p-3 flex items-center justify-between gap-2 mt-2 font-mono text-xs font-bold text-slate-800 shadow-sm">
                                    <span className="break-all">{window.location.hostname}</span>
                                    <button 
                                        onClick={copyHostname}
                                        type="button"
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors cursor-pointer shrink-0"
                                        title="Copia negli appunti"
                                    >
                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-rose-700/80 font-bold leading-normal mt-1 italic">
                                    * Nota: Consenti fino a 60 secondi affinché Firebase applichi la modifica dopo l'aggiunta.
                                </p>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="pt-2 border-t border-gray-50 text-center">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-loose">
                        Accedendo accetti i nostri <br/>
                        <span className="text-indigo-600 hover:underline cursor-pointer">Termini di Servizio</span>
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default Login;
