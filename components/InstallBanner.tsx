import React, { useState, useEffect } from 'react';
import { X, Download, Share, PlusSquare, Smartphone, BellRing } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const InstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);

  useEffect(() => {
    // 1. Controlla se l'utente ha già chiuso il banner definitivamente
    const isDismissed = localStorage.getItem('ciaostar_install_banner_dismissed') === 'true';
    if (isDismissed) return;

    // 2. Rileva se è un dispositivo mobile o schermo piccolo
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const isSmallScreen = window.innerWidth <= 768;
    const mobileDetected = isMobileUA || isSmallScreen;
    setIsMobile(mobileDetected);

    // 3. Rileva se è iOS
    const iosDetected = /iphone|ipad|ipod/.test(userAgent);
    setIsIosDevice(iosDetected);

    // Se non è mobile, non mostriamo nulla
    if (!mobileDetected) return;

    // Se è PWA già installata (in modalità standalone) non mostrare il banner
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // 4. Se è Android/Chrome, cattura prima l'evento prima dell'installazione
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Su iOS non abbiamo l'evento 'beforeinstallprompt', quindi mostriamo il banner direttamente al caricamento (dopo un piccolo ritardo)
    if (iosDetected) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 5000); // Mostra dopo 5 secondi su iOS per evitare invadenza immediata
      return () => clearTimeout(timer);
    } else {
      // Su Android, se l'evento è già supportato ma non si attiva subito, possiamo forzare la visibilità dopo un po'
      const forceTimer = setTimeout(() => {
        setIsVisible(true);
      }, 8000);
      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        clearTimeout(forceTimer);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (isIosDevice) {
      // Mostra la guida personalizzata passo-passo per iOS Safari
      setShowIosGuide(true);
    } else if (deferredPrompt) {
      // Usa l'evento nativo deferredPrompt su Android / desktop Chrome
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
        handleDismissForever();
      } else {
        console.log('User dismissed the install prompt');
      }
      setDeferredPrompt(null);
    } else {
      // Fallback: se deferredPrompt non è disponibile (es. altri browser Android), mostra un messaggio informativo
      alert("Per installare l'app, tocca l'icona con tre puntini in alto a destra del browser e seleziona 'Aggiungi a schermata Home'.");
    }
  };

  const handleDismissForever = () => {
    localStorage.setItem('ciaostar_install_banner_dismissed', 'true');
    setIsVisible(false);
  };

  if (!isMobile || !isVisible) return null;

  return (
    <>
      {/* Banner principale di installazione */}
      <div 
        id="install-pwa-banner"
        className="fixed bottom-4 inset-x-4 md:inset-x-auto md:right-4 md:max-w-md z-[9999] bg-slate-900/95 backdrop-blur-md border border-amber-500/30 text-white rounded-[2rem] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex items-center justify-between gap-4 animate-slide-up"
      >
        <div className="flex items-start gap-3">
          <div className="bg-amber-500/10 p-2.5 text-amber-500 rounded-2xl shrink-0 border border-amber-500/20 mt-0.5">
            <BellRing className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">App Installabile</h4>
            <p className="text-xs text-slate-300 mt-1 leading-normal">
              Scarica l'app così da non perderti le notifiche di CiaoStar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={handleInstallClick}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-500/15"
          >
            Installa
          </button>
          
          <button 
            onClick={handleDismissForever}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Chiudi permanentemente"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pulsante/Guida per iOS installazione manuale */}
      {showIosGuide && (
        <div 
          id="ios-install-guide"
          className="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <div className="bg-slate-900 border border-amber-500/40 rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl text-center text-white relative">
            <button 
              onClick={() => setShowIosGuide(false)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-amber-500/5">
              <Smartphone className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black uppercase tracking-wider text-amber-500 mb-3">Installazione su iOS</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Safari su iOS non permette l'installazione automatica automatizzata. Puoi averla sulla tua Home seguendo questi semplici passi:
            </p>

            <div className="space-y-4 text-left bg-slate-950/50 p-5 rounded-2xl border border-slate-800 text-xs mb-6">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center font-black">1</span>
                <span className="text-slate-200">
                  Tocca l'icona <strong className="text-white flex inline-flex items-center gap-1 font-bold">Condividi <Share className="w-3.5 h-3.5 inline inline-block text-amber-500" /></strong> in Safari (in basso dello schermo).
                </span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center font-black shrink-0 mt-0.5">2</span>
                <span className="text-slate-200">
                  Scorri l'elenco e seleziona <strong className="text-white font-bold flex inline-flex items-center gap-1">Aggiungi alla schermata Home <PlusSquare className="w-3.5 h-3.5 inline inline-block text-amber-500" /></strong>.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-500 flex items-center justify-center font-black">3</span>
                <span className="text-slate-200">
                  Tocca <strong className="text-amber-500 font-extrabold">Aggiungi</strong> in alto a destra per completare.
                </span>
              </div>
            </div>

            <button 
              onClick={() => {
                setShowIosGuide(false);
                handleDismissForever();
              }}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg"
            >
              Ho capito / Chiudi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallBanner;
