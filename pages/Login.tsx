
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '../firebaseConfig';
import * as firebaseAuth from 'firebase/auth';
import { Star, ArrowRight, AlertTriangle, Check, Copy } from 'lucide-react';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setIsUnauthorizedDomain(false);
    try {
      await firebaseAuth.signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (error: any) {
      console.error("Errore di autenticazione:", error);
      const isDomainError = error?.code === 'auth/unauthorized-domain' || 
                            error?.message?.includes('unauthorized-domain') ||
                            JSON.stringify(error)?.includes('unauthorized-domain');
      
      if (isDomainError) {
        setIsUnauthorizedDomain(true);
        setErrorMsg("Questo dominio non è inserito tra i domini autorizzati in Firebase Console.");
      } else {
        setErrorMsg(error?.message || "Errore durante l'accesso.");
      }
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
            <div className="text-center mb-8">
                <div className="bg-indigo-600 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-100 animate-pulse">
                    <Star className="w-8 h-8 text-white fill-current" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Bentornato su CiaoStar</h2>
                <p className="text-slate-500 font-medium text-sm">Entra nel mondo dei video messaggi personalizzati.</p>
            </div>

            <div className="bg-white rounded-[2.5rem] p-8 md:p-10 shadow-sm border border-gray-100 space-y-6">
                <button
                    onClick={handleGoogleLogin}
                    className="w-full flex items-center justify-center gap-4 py-4 px-6 bg-white border-2 border-gray-100 rounded-2xl font-bold text-slate-700 hover:bg-gray-50 hover:border-indigo-100 transition-all group cursor-pointer"
                >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                    Continua con Google
                    <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </button>

                {errorMsg && (
                    <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl space-y-3">
                        <div className="flex items-start gap-3 text-rose-800">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs font-black uppercase tracking-tight">Errore di Configurazione</p>
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
                
                <div className="pt-4 border-t border-gray-50 text-center">
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
