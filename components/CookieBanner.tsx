import React, { useState, useEffect } from 'react';
import { ShieldAlert, Cookie, Check, X, Settings2 } from 'lucide-react';
import { getAdminSettings } from '../services/dataService';
import { AdminSettings } from '../types';
import { DEFAULT_ADMIN_SETTINGS } from '../constants';

const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  // Consensi granulari
  const [consents, setConsents] = useState({
    technical: true, // Sempre attivo / Obbligatorio
    analytics: false,
    marketing: false
  });

  useEffect(() => {
    const accepted = localStorage.getItem('ciaostar_cookies_accepted');
    if (!accepted) {
      setIsVisible(true);
    }
    
    getAdminSettings()
      .then((res) => {
        setSettings(res);
      })
      .catch((err) => {
        console.warn('Could not load dynamic settings for CookieBanner', err);
      });
  }, []);

  const handleAcceptAll = () => {
    const preferences = { technical: true, analytics: true, marketing: true };
    localStorage.setItem('ciaostar_cookies_accepted', JSON.stringify(preferences));
    setIsVisible(false);
    // Reload to apply scripts if necessary
    window.dispatchEvent(new Event('cookies_updated'));
  };

  const handleRejectAll = () => {
    const preferences = { technical: true, analytics: false, marketing: false };
    localStorage.setItem('ciaostar_cookies_accepted', JSON.stringify(preferences));
    setIsVisible(false);
    window.dispatchEvent(new Event('cookies_updated'));
  };

  const handleSaveCustom = () => {
    localStorage.setItem('ciaostar_cookies_accepted', JSON.stringify(consents));
    setIsVisible(false);
    window.dispatchEvent(new Event('cookies_updated'));
  };

  if (!isVisible) return null;

  const bizName = settings?.legalBusinessName || DEFAULT_ADMIN_SETTINGS.legalBusinessName || 'CIAOSTAR S.R.L. a socio unico';

  return (
    <div className="fixed bottom-0 inset-x-0 z-[10000] p-4 sm:p-6 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 text-slate-100 flex items-center justify-center shadow-[0_-10px_30px_rgba(0,0,0,0.3)] animate-fade-in animate-duration-300">
      <div className="max-w-4xl w-full bg-slate-950 border border-slate-800 p-6 rounded-3xl space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex items-start gap-3.5 text-left">
            <div className="bg-amber-500/10 p-2 text-amber-500 rounded-2xl shrink-0 border border-amber-500/20 mt-1">
              <Cookie className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                Informativa sui Cookie & GDPR Compliance (Italia)
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Su <strong>{bizName}</strong> utilizziamo cookie tecnici essenziali (Firebase per l’autenticazione, Stripe per i pagamenti antifrode) e, previo tuo consenso, cookie di statistica e social per migliorare la tua esperienza. In conformità con le linee guida del Garante della Privacy del 10 giugno 2021, puoi prestare, rifiutare o personalizzare il tuo consenso in qualsiasi momento.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full md:w-auto">
            <button 
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {showDetails ? 'Nascondi' : 'Personalizza'}
            </button>
            <button 
              onClick={handleRejectAll}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
            >
              Solo Tecnici / Rifiuta
            </button>
            <button 
              onClick={handleAcceptAll}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-xs font-black text-slate-950 transition-all cursor-pointer shadow-lg shadow-amber-500/15"
            >
              Accetta Tutti
            </button>
          </div>
        </div>

        {/* DETAILS SECTION */}
        {showDetails && (
          <div className="border-t border-slate-800 pt-4 mt-2 space-y-4 text-left animate-slide-up">
            <p className="text-[11px] uppercase tracking-wide font-black text-amber-500">Configurazione granulare dei Cookie</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Tecnici (Mandatory) */}
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-1.5 matches-box">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Scopi Essenziali e Sicurezza</span>
                  <span className="text-[9px] font-bold bg-slate-800 text-slate-400 py-0.5 px-1.5 rounded uppercase">Sempre Attivo</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Rilascio immediato dei cookie necessari per il login sicuro di Firebase e la validazione 3D-Secure antifrode con Stripe. Senza questi cookie l'app non può funzionare.
                </p>
              </div>

              {/* Analytics */}
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-1.5 matches-box">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Statistici & Prestazioni</span>
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded pointer-events-auto border-slate-800 accent-amber-500 shrink-0 cursor-pointer"
                    checked={consents.analytics}
                    onChange={(e) => setConsents({ ...consents, analytics: e.target.checked })}
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Permette il rilevamento di statistiche di caricamento delle pagine e visite anonimizzate. Ci aiuta a capire l'uso della piattaforma per ottimizzare la stabilità.
                </p>
              </div>

              {/* Marketing */}
              <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-1.5 matches-box">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Social e Targeting</span>
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded pointer-events-auto border-slate-800 accent-amber-500 shrink-0 cursor-pointer"
                    checked={consents.marketing}
                    onChange={(e) => setConsents({ ...consents, marketing: e.target.checked })}
                  />
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Utilizzati per tracciare il comportamento di click e condividere referral su Instagram e Facebook di CiaoStar, proteggendo la tua privacy fino all'abilitazione.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button 
                onClick={handleSaveCustom}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-white transition-all cursor-pointer"
              >
                Salva Scelte Personalizzate
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieBanner;
