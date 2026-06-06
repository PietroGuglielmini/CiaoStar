
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, UserRole, InAppNotification, AdminSettings } from '../types';
import { Star, LogOut, Settings, MessageCircle, CreditCard, Users, Menu, Video, X, Film, Bell, Check, MessageSquare } from 'lucide-react';
import { listenNotifications, markNotificationRead, markAllNotificationsRead, getAdminSettings } from '../services/dataService';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  useEffect(() => {
    getAdminSettings().then(setSettings).catch(e => console.warn("Could not load Navbar branding config", e));
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const unsubscribe = listenNotifications(user.id, user.role, (data) => {
      setNotifications(data);
    });
    return () => unsubscribe();
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Tab alert per le notifiche non lette
  useEffect(() => {
    const titleBase = settings?.seoDefaultTitle || "CiaoStar - Video messaggi personalizzati dalle tue star preferite";
    if (unreadCount > 0) {
      document.title = `(${unreadCount}) Nuova Notifica | ${titleBase}`;
    } else {
      document.title = titleBase;
    }
  }, [unreadCount, settings]);

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center cursor-pointer" onClick={() => {
            navigate('/');
            setIsOpen(false);
          }}>
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="CiaoStar Logo" className="h-8 w-auto object-contain mr-2" referrerPolicy="no-referrer" />
            ) : (
              <>
                <div className="bg-indigo-600 p-1.5 rounded-xl mr-2.5">
                  <Star className="w-5 h-5 text-white fill-current" />
                </div>
                <span className="text-xl font-extrabold text-slate-900 tracking-tight">CIAOSTAR</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-3">
            {user && (
              <div className="relative">
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-all relative"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>
                
                {showNotifications && (
                  <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white border border-slate-100 rounded-3xl shadow-2xl z-[100] animate-in fade-in slide-in-from-top-3 max-h-[480px] overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                      <span className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">Notifiche</span>
                      {unreadCount > 0 && (
                        <button 
                          onClick={async () => {
                            await markAllNotificationsRead(user.id, user.role);
                          }}
                          className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wide flex items-center gap-0.5"
                        >
                          <Check className="w-3.5 h-3.5" /> Segna tutte come lette
                        </button>
                      )}
                    </div>
                    
                    <div className="overflow-y-auto divide-y divide-slate-50 max-h-[400px]">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 stroke-1" />
                          <p className="text-xs font-bold">Nessuna notifica presente</p>
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div 
                            key={notif.id}
                            className={`p-4 hover:bg-slate-50 transition-all cursor-pointer relative ${!notif.read ? 'bg-indigo-50/20' : ''}`}
                            onClick={async () => {
                              await markNotificationRead(notif.id, !notif.read);
                              if (notif.orderId) {
                                setShowNotifications(false);
                                if (user.role === UserRole.ADMIN) {
                                  navigate('/admin/orders');
                                } else {
                                  navigate('/dashboard');
                                }
                              }
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              {!notif.read && (
                                <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-1.5 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs text-slate-950 ${!notif.read ? 'font-black' : 'font-extrabold'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] font-medium text-slate-500 mt-0.5 break-words">
                                  {notif.message}
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 mt-2">
                                  {new Date(notif.createdAt).toLocaleDateString('it-IT', {
                                    day: 'numeric',
                                    month: 'long',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="hidden md:flex items-center space-x-6">
              {user ? (
                <>
                  <div className="flex items-center space-x-6 text-sm font-semibold text-slate-600">
                    {user.role !== UserRole.ADMIN && (
                      <Link to="/dashboard" className="hover:text-indigo-600 transition-colors">I miei ordini</Link>
                    )}
                    <Link 
                      to={user.role === UserRole.ADMIN ? "/admin/chat" : "/messages"} 
                      className="hover:text-indigo-600 transition-colors flex items-center gap-2"
                    >
                      Messaggi
                      {user.role === UserRole.ADMIN && <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded text-[10px] font-bold">STAFF</span>}
                    </Link>
                    
                    {user.role === UserRole.TALENT && (
                      <Link to="/settings" className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all flex items-center gap-2">
                         <Video className="w-4 h-4"/> Area Star
                      </Link>
                    )}
                    
                    {user.role === UserRole.ADMIN && (
                      <div className="flex items-center space-x-4 border-l border-gray-200 pl-6">
                        <Link to="/admin/users" title="Gestione Utenti"><Users className="w-5 h-5 text-slate-400 hover:text-indigo-600"/></Link>
                        <Link to="/admin/orders" title="Audit Ordini"><CreditCard className="w-5 h-5 text-slate-400 hover:text-indigo-600"/></Link>
                        <Link to="/admin/media" title="Gestione Media"><Film className="w-5 h-5 text-slate-400 hover:text-indigo-600"/></Link>
                        <Link to="/admin/reviews" title="Moderazione Recensioni"><MessageSquare className="w-5 h-5 text-slate-400 hover:text-indigo-600"/></Link>
                        <Link to="/admin/settings" title="Configurazione"><Settings className="w-5 h-5 text-slate-400 hover:text-indigo-600"/></Link>
                      </div>
                    )}
                  </div>

                  <div className="h-6 w-px bg-gray-200 mx-2"></div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900 leading-none">{user.name}</p>
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{user.role}</p>
                    </div>
                    <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <Link to="/login" className="text-sm font-bold text-slate-600 hover:text-indigo-600">Login</Link>
                  <Link to="/login" className="btn-primary">Inizia ora</Link>
                </div>
              )}
            </div>

            <button 
              onClick={() => setIsOpen(!isOpen)} 
              className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
            >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>

      {/* Mobile Menu Panel */}
      {isOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white py-3 px-4 space-y-3 shadow-lg">
          {user ? (
            <>
              <div className="flex flex-col space-y-3 font-semibold text-slate-600 text-sm">
                {user.role !== UserRole.ADMIN && (
                  <Link to="/dashboard" onClick={() => setIsOpen(false)} className="hover:text-indigo-600 transition-colors">I miei ordini</Link>
                )}
                <Link 
                  to={user.role === UserRole.ADMIN ? "/admin/chat" : "/messages"} 
                  onClick={() => setIsOpen(false)}
                  className="hover:text-indigo-600 transition-colors flex items-center gap-2"
                >
                  Messaggi
                  {user.role === UserRole.ADMIN && <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded text-[10px] font-bold">STAFF</span>}
                </Link>
                
                {user.role === UserRole.TALENT && (
                  <Link to="/settings" onClick={() => setIsOpen(false)} className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-all flex items-center gap-2 w-max">
                     <Video className="w-4 h-4"/> Area Star
                  </Link>
                )}
                
                {user.role === UserRole.ADMIN && (
                  <div className="flex flex-col space-y-3 pt-3 border-t border-gray-100">
                    <Link to="/admin/users" onClick={() => setIsOpen(false)} className="hover:text-indigo-600 transition-colors flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400"/> Gestione Utenti
                    </Link>
                    <Link to="/admin/orders" onClick={() => setIsOpen(false)} className="hover:text-indigo-600 transition-colors flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-400"/> Audit Ordini
                    </Link>
                    <Link to="/admin/media" onClick={() => setIsOpen(false)} className="hover:text-indigo-600 transition-colors flex items-center gap-2">
                      <Film className="w-4 h-4 text-slate-400"/> Gestione Media
                    </Link>
                    <Link to="/admin/reviews" onClick={() => setIsOpen(false)} className="hover:text-indigo-600 transition-colors flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-400"/> Moderazione Recensioni
                    </Link>
                    <Link to="/admin/settings" onClick={() => setIsOpen(false)} className="hover:text-indigo-600 transition-colors flex items-center gap-2">
                      <Settings className="w-4 h-4 text-slate-400"/> Configurazione
                    </Link>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 leading-none">{user.name}</p>
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{user.role}</p>
                </div>
                <button 
                  onClick={() => {
                    setIsOpen(false);
                    onLogout();
                  }} 
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                >
                  <LogOut className="w-4 h-4" /> Esci
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 font-semibold text-sm py-1">
              <Link to="/login" onClick={() => setIsOpen(false)} className="text-slate-600 hover:text-indigo-600">Login</Link>
              <Link to="/login" onClick={() => setIsOpen(false)} className="btn-primary text-center py-2.5">Inizia ora</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

const ShieldAlertIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
);

export default Navbar;
