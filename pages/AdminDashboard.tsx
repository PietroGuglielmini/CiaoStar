
import React, { useState, useEffect } from 'react';
import { User, RequestStatus, VideoRequest, AdminSettings, AuditLog, UserRole } from '../types';
// Fix: Remove non-existent approveTalent from services/dataService imports
import { 
    getAdminSettings, 
    getPendingTalents, 
    getAuditLogs,
    verifyInstagramAdmin,
    updateVerificationStatus
} from '../services/dataService';
import { 
    ShieldCheck, Settings, Users, Activity, FileText, Loader2, RefreshCw, Instagram, Check, X, PlayCircle, Eye
} from 'lucide-react';

const AdminDashboard: React.FC<{ user: User }> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<'approvals' | 'settings' | 'logs'>('approvals');
    const [loading, setLoading] = useState(true);
    const [pendingTalents, setPendingTalents] = useState<User[]>([]);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        const [pending, audit] = await Promise.all([
            getPendingTalents(),
            getAuditLogs()
        ]);
        setPendingTalents(pending);
        setLogs(audit);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleVerifyIG = async (userId: string, status: boolean) => {
        await verifyInstagramAdmin(userId, status);
        loadData();
    };

    const handleVerificationAction = async (userId: string, action: 'approve' | 'reject') => {
        if (action === 'approve') {
            await updateVerificationStatus(userId, 'verified');
        } else {
            await updateVerificationStatus(userId, 'rejected');
        }
        loadData();
    };

    if (user.role !== UserRole.ADMIN) return <div className="p-20 text-center font-bold text-red-600">ACCESSO NEGATO</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <header className="mb-8 flex items-center justify-between border-b border-gray-200 pb-6">
                <div className="flex items-center">
                    <div className="bg-red-600 p-3 rounded-lg text-white mr-4 shadow-xl">
                        <ShieldCheck className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase">Sala Controllo Admin</h1>
                        <p className="text-sm text-gray-500">Gestione identità e sicurezza</p>
                    </div>
                </div>
                <button onClick={loadData} className="p-2 hover:bg-gray-100 rounded-lg"><RefreshCw className="w-5 h-5 text-gray-400" /></button>
            </header>

            <nav className="flex space-x-1 bg-gray-100 p-1 rounded-xl mb-8 w-fit shadow-inner">
                {[
                    { id: 'approvals', label: 'Identity Checks', icon: Users, count: pendingTalents.length },
                    { id: 'logs', label: 'Audit Logs', icon: FileText }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex items-center px-4 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-slate-700'}`}
                    >
                        <tab.icon className="w-4 h-4 mr-2" />
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span className="ml-2 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">{tab.count}</span>
                        )}
                    </button>
                ))}
            </nav>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-slate-400" /></div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {activeTab === 'approvals' && (
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 border-b">
                                <tr>
                                    <th className="p-4">Talent / Instagram</th>
                                    <th className="p-4">DM Code</th>
                                    <th className="p-4">Proof of Life</th>
                                    <th className="p-4 text-right">Verifica IG</th>
                                    <th className="p-4 text-right">Azione Finale</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pendingTalents.length === 0 ? (
                                    <tr><td colSpan={5} className="p-10 text-center text-gray-400">Nessuna richiesta pendente.</td></tr>
                                ) : (
                                    pendingTalents.map(t => (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors text-sm">
                                            <td className="p-4">
                                                <div className="font-bold text-slate-900">{t.name}</div>
                                                <div className="text-pink-600 flex items-center gap-1 font-medium">
                                                    <Instagram className="w-3 h-3" /> {t.instagramHandle || 'Non inserito'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-slate-100 px-3 py-1 rounded-lg font-black tracking-widest text-xs">{t.instagramVerificationCode}</span>
                                            </td>
                                            <td className="p-4">
                                                {t.verificationVideoUrl ? (
                                                    <button 
                                                        onClick={() => setSelectedVideo(t.verificationVideoUrl!)}
                                                        className="flex items-center gap-2 text-blue-600 font-bold hover:underline"
                                                    >
                                                        <PlayCircle className="w-5 h-5" /> Guarda Video
                                                    </button>
                                                ) : (
                                                    <span className="text-gray-300 italic">Non caricato</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                {t.isInstagramVerified ? (
                                                    <span className="text-emerald-500 font-bold flex items-center justify-end gap-1"><Check className="w-4 h-4"/> DM OK</span>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleVerifyIG(t.id, true)}
                                                        className="bg-pink-100 text- pink-700 px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-pink-200"
                                                    >
                                                        APPROVA DM
                                                    </button>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleVerificationAction(t.id, 'reject')}
                                                        className="bg-red-50 text-red-600 p-2 rounded-lg hover:bg-red-100"
                                                        title="Rifiuta"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleVerificationAction(t.id, 'approve')}
                                                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:bg-emerald-600"
                                                    >
                                                        APPROVA TUTTO
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'logs' && (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-gray-50 text-gray-400 font-black uppercase">
                                <tr>
                                    <th className="p-3">Data</th>
                                    <th className="p-3">User</th>
                                    <th className="p-3">Azione</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td className="p-3 text-gray-400">{new Date(log.timestamp).toLocaleString()}</td>
                                        <td className="p-3 font-medium">{log.userId}</td>
                                        <td className="p-3">{log.action}: {log.details}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* VIDEO MODAL */}
            {selectedVideo && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl overflow-hidden max-w-sm w-full shadow-2xl">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h4 className="font-black uppercase text-sm">Proof of Life</h4>
                            <button onClick={() => setSelectedVideo(null)} className="text-slate-400 hover:text-slate-900"><X className="w-6 h-6"/></button>
                        </div>
                        <video src={selectedVideo} controls autoPlay className="w-full aspect-[9/16] bg-black" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
