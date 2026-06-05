
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import TalentProfile from './pages/TalentProfile';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Terms from './pages/Terms';
import AdminOrders from './pages/AdminOrders';
import AdminMedia from './pages/AdminMedia';
import AdminSettings from './pages/AdminSettings';
import AdminChat from './pages/AdminChat';
import AdminUsers from './pages/AdminUsers';
import UserChat from './pages/UserChat';
import AdminReviews from './pages/AdminReviews';
import TalentSettings from './pages/TalentSettings';
import { User, UserRole, AdminSettings as SettingsType } from './types';
import { auth } from './firebaseConfig';
import * as firebaseAuth from 'firebase/auth';
import { syncUserToDB, getAdminSettings, acceptNewTerms, getUserById } from './services/dataService';
import { Loader2, ShieldCheck, UserCog } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminSettings, setAdminSettings] = useState<SettingsType | null>(null);
  const [realAdminId, setRealAdminId] = useState<string | null>(sessionStorage.getItem('realAdminId'));

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | null = null;

    const checkAuthStatus = async () => {
      const settings = await getAdminSettings();
      if (!active) return;
      setAdminSettings(settings);

      // Se c'è un login di test locale/sviluppo attivo
      const mockUserId = sessionStorage.getItem('mockUserId');
      if (mockUserId && !sessionStorage.getItem('impersonatedUserId')) {
        const mockUser = await getUserById(mockUserId);
        if (mockUser && active) {
          setUser(mockUser);
          setLoading(false);
          return;
        }
      }

      unsub = firebaseAuth.onAuthStateChanged(auth, async (firebaseUser) => {
        if (!active) return;
        
        // Se non c'è una sessione di impersonificazione attiva
        if (!sessionStorage.getItem('impersonatedUserId')) {
            if (firebaseUser) {
              const dbUser = await syncUserToDB({ 
                id: firebaseUser.uid, 
                email: firebaseUser.email || '', 
                name: firebaseUser.displayName || 'Ospite',
                role: UserRole.FAN,
                lastAcceptedTermsVersion: 0
              });
              if (active) setUser(dbUser);
            } else {
              if (active) setUser(null);
            }
        } else {
            // Carica l'utente impersonato
            const impId = sessionStorage.getItem('impersonatedUserId');
            if (impId) {
                const impUser = await getUserById(impId);
                if (active) setUser(impUser);
            }
        }
        if (active) setLoading(false);
      });
    };

    checkAuthStatus();

    return () => {
      active = false;
      if (unsub) {
        unsub();
      }
    };
  }, []);

  const handleImpersonate = async (targetUser: User) => {
    if (!user || user.role !== UserRole.ADMIN) return;
    
    // Salva l'admin corrente come admin reale
    sessionStorage.setItem('realAdminId', user.id);
    sessionStorage.setItem('impersonatedUserId', targetUser.id);
    setRealAdminId(user.id);
    setUser(targetUser);
  };

  const handleStopImpersonation = async () => {
    const originalAdminId = sessionStorage.getItem('realAdminId');
    if (originalAdminId) {
        const originalAdmin = await getUserById(originalAdminId);
        setUser(originalAdmin);
    }
    sessionStorage.removeItem('realAdminId');
    sessionStorage.removeItem('impersonatedUserId');
    setRealAdminId(null);
  };

  const handleAcceptTerms = async () => {
    if (!user || !adminSettings) return;
    await acceptNewTerms(user.id, adminSettings.termsVersion);
    setUser({ ...user, lastAcceptedTermsVersion: adminSettings.termsVersion });
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white">
      <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
      <p className="mt-4 text-[10px] tracking-[0.4em] uppercase text-slate-400 font-bold">Inizializzazione CiaoStar</p>
    </div>
  );

  if (user && user.isDisabled && user.role !== UserRole.ADMIN) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md bg-white p-8 rounded-[2rem] border border-gray-100 shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto">
            <UserCog className="w-8 h-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Profilo Disabilitato</h1>
          <p className="text-sm font-medium text-slate-500 leading-relaxed">
            Il tuo account è stato disabilitato dall'amministratore della piattaforma. Se ritieni sia un errore, contatta l'assistenza.
          </p>
          <button 
            onClick={async () => {
              sessionStorage.clear();
              await firebaseAuth.signOut(auth);
              setUser(null);
            }} 
            className="btn-primary w-full py-3.5 text-xs font-black uppercase tracking-wider"
          >
            Scollegati
          </button>
        </div>
      </div>
    );
  }

  const needsTermsUpdate = user?.role === UserRole.TALENT && adminSettings && user.lastAcceptedTermsVersion < adminSettings.termsVersion;

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {realAdminId && (
            <div className="bg-red-600 text-white py-2 px-4 flex items-center justify-between z-[60] sticky top-0 shadow-lg">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
                    <UserCog className="w-4 h-4" />
                    <span>Sei in modalità Impersonificazione: <strong>{user?.name}</strong></span>
                </div>
                <button 
                    onClick={handleStopImpersonation}
                    className="bg-white text-red-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase hover:bg-gray-100 transition-colors"
                >
                    Torna ad Admin
                </button>
            </div>
        )}

        <Navbar user={user} onLogout={() => {
          sessionStorage.removeItem('mockUserId');
          sessionStorage.removeItem('impersonatedUserId');
          sessionStorage.removeItem('realAdminId');
          firebaseAuth.signOut(auth);
          setUser(null);
        }} />
        
        {needsTermsUpdate && (
            <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-white rounded-[2.5rem] p-10 md:p-14 max-w-lg w-full shadow-2xl text-center border border-gray-100">
                    <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-sm">
                        <ShieldCheck className="w-10 h-10" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Protocollo Star</h2>
                    <div className="text-slate-500 mb-10 space-y-4 text-xs tracking-wide leading-relaxed uppercase font-semibold">
                        <p className="text-indigo-600 font-bold">Aggiornamenti obbligatori:</p>
                        <ul className="space-y-3">
                            <li className="bg-gray-50 py-2 px-4 rounded-xl">Identificazione chiara e udibile</li>
                            <li className="bg-gray-50 py-2 px-4 rounded-xl">Durata minima video: 20 secondi</li>
                            <li className="bg-gray-50 py-2 px-4 rounded-xl">Solo performance reali (No AI)</li>
                        </ul>
                    </div>
                    <button 
                        onClick={handleAcceptTerms}
                        className="btn-primary w-full py-4 text-sm"
                    >
                        Accetta e Continua
                    </button>
                </div>
            </div>
        )}

        <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/talent/:id" element={<TalentProfile currentUser={user} />} />
              <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
              <Route path="/messages" element={user ? <UserChat user={user} /> : <Navigate to="/login" />} />
              <Route path="/settings" element={user?.role === UserRole.TALENT ? <TalentSettings user={user} /> : <Navigate to="/" />} />
              
              <Route path="/admin" element={user?.role === UserRole.ADMIN ? <Navigate to="/admin/users" replace /> : <Navigate to="/" />} />
              <Route path="/admin/orders" element={user?.role === UserRole.ADMIN ? <AdminOrders /> : <Navigate to="/" />} />
              <Route path="/admin/media" element={user?.role === UserRole.ADMIN ? <AdminMedia /> : <Navigate to="/" />} />
              <Route path="/admin/settings" element={user?.role === UserRole.ADMIN ? <AdminSettings /> : <Navigate to="/" />} />
              <Route path="/admin/chat" element={user?.role === UserRole.ADMIN ? <AdminChat user={user} /> : <Navigate to="/" />} />
              <Route path="/admin/users" element={user?.role === UserRole.ADMIN ? <AdminUsers onImpersonate={handleImpersonate} /> : <Navigate to="/" />} />
              <Route path="/admin/reviews" element={user?.role === UserRole.ADMIN ? <AdminReviews /> : <Navigate to="/" />} />
              
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </main>

        <Footer user={user} />
      </div>
    </Router>
  );
};

export default App;
