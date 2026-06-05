
import React, { useState, useEffect } from 'react';
import { VideoRequest, RequestStatus } from '../types';
import { getAllOrdersAdmin, resolveDispute, getTalents } from '../services/dataService';
import { Loader2, AlertTriangle, Check, X, Play, Filter, CreditCard, Clock, Info } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';

const AdminOrders: React.FC = () => {
    const [orders, setOrders] = useState<VideoRequest[]>([]);
    const [talentMap, setTalentMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'DISPUTE'>('ALL');
    const [openHistoryOrderId, setOpenHistoryOrderId] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [ordersData, talentsData] = await Promise.all([
                getAllOrdersAdmin(),
                getTalents()
            ]);
            const tMap: Record<string, string> = {};
            talentsData.forEach(t => { tMap[t.id] = t.name; });
            setTalentMap(tMap);
            setOrders(ordersData);
        } catch (e) {
            console.error("Errore nel caricamento dei dati:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleResolve = async (id: string, action: 'REFUND' | 'CORRECTION' | 'FORCE_ACCEPT') => {
        let confirmMsg = '';
        if (action === 'CORRECTION') {
            confirmMsg = "Sei sicuro di voler dare ragione al Fan e richiedere che il VIP corregga il video messaggio?";
        } else if (action === 'FORCE_ACCEPT') {
            confirmMsg = "Sei sicuro di voler dare ragione al VIP e forzare l'accettazione definitiva del video messaggio?";
        } else {
            confirmMsg = "Sei sicuro di voler rimborsare il Fan cancellando definitivamente l'ordine?";
        }
        if (!confirm(confirmMsg)) return;
        await resolveDispute(id, action);
        load();
    };

    const filtered = orders.filter(o => filter === 'ALL' || o.status === RequestStatus.DISPUTE_OPEN);

    if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b pb-8">
                <div className="flex items-center gap-4">
                    <div className="bg-amber-500 p-3 rounded-2xl text-white shadow-lg">
                        <CreditCard className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 uppercase">Monitor Ordini</h1>
                        <p className="text-slate-400 font-medium">Gestione transazioni e risoluzione dispute</p>
                    </div>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setFilter('ALL')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${filter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
                    >
                        Tutti
                    </button>
                    <button 
                        onClick={() => setFilter('DISPUTE')}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${filter === 'DISPUTE' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400'}`}
                    >
                        Dispute ({orders.filter(o => o.status === RequestStatus.DISPUTE_OPEN).length})
                    </button>
                </div>
            </header>

            <div className="space-y-4">
                {filtered.map(order => (
                    <div key={order.id} className={`bg-white rounded-3xl border ${order.status === RequestStatus.DISPUTE_OPEN ? 'border-red-200 bg-red-50/20' : 'border-slate-100'} p-6 shadow-sm`}>
                        <div className="flex flex-col lg:flex-row gap-8">
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ID: {order.id}</span>
                                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${order.status === RequestStatus.DISPUTE_OPEN ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                                        {order.status}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-300 uppercase">Talent</label>
                                        <p className="font-bold text-sm text-slate-700">{order.talentName || talentMap[order.talentId] || order.talentId}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-300 uppercase">Fan</label>
                                        <p className="font-bold text-sm text-slate-700">{order.fanName}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-300 uppercase">Importo</label>
                                        <p className="font-bold text-sm text-slate-900">€{order.pricePaid}</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-300 uppercase">Data</label>
                                        <p className="font-bold text-sm text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                <div className="bg-white p-4 rounded-2xl border border-slate-100 mb-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Istruzioni Fan:</p>
                                    <p className="text-sm italic text-slate-600">"{order.instructions}"</p>
                                </div>

                                {order.status === RequestStatus.DISPUTE_OPEN && (
                                    <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="w-4 h-4 text-red-600" />
                                            <h4 className="font-black text-xs text-red-800 uppercase">Disputa Aperta dal Fan</h4>
                                        </div>
                                        <p className="text-sm font-black text-red-900 mb-1">Motivo: {order.disputeCategory}</p>
                                        <p className="text-sm text-red-700 italic">"{order.disputeReason}"</p>
                                    </div>
                                )}

                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <button 
                                        onClick={() => setOpenHistoryOrderId(openHistoryOrderId === order.id ? null : order.id)}
                                        className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
                                    >
                                        <Clock className="w-4 h-4" />
                                        {openHistoryOrderId === order.id ? 'Nascondi Cronoistoria' : 'Visualizza Cronoistoria Dettagliata (' + (order.history?.length || 1) + ')'}
                                    </button>
                                    
                                    {openHistoryOrderId === order.id && (
                                        <div className="mt-4 p-5 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                                            <h4 className="font-black text-xs text-slate-400 uppercase tracking-wider mb-4">Cronoistoria Dettagliata dell'Ordine</h4>
                                            <div className="relative pl-6 border-l border-indigo-100 space-y-4">
                                                {!order.history || order.history.length === 0 ? (
                                                    <div className="relative">
                                                        <div className="absolute -left-[31px] mt-0.5 w-[11px] h-[11px] rounded-full bg-indigo-500 border-2 border-white ring-4 ring-indigo-50" />
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                            <p className="text-xs font-black text-slate-800">Video richiesta creata</p>
                                                            <span className="text-[10px] font-mono text-slate-400 font-bold">{new Date(order.createdAt).toLocaleString('it-IT')}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    order.history.map((event, idx) => (
                                                        <div key={idx} className="relative">
                                                            <div className="absolute -left-[31px] mt-0.5 w-[11px] h-[11px] rounded-full bg-indigo-500 border-2 border-white ring-4 ring-indigo-50" />
                                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                                                <div>
                                                                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{event.action}</p>
                                                                    {event.note && (
                                                                        <p className="text-[11px] text-slate-500 font-bold mt-1 bg-white border border-slate-100 px-3 py-1.5 rounded-xl inline-block shadow-sm">
                                                                            {event.note}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0 mt-0.5 whitespace-nowrap">
                                                                    {new Date(event.timestamp).toLocaleString('it-IT')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                         </div>
                                     )}
                                 </div>
                            </div>

                            <div className="lg:w-72 space-y-4">
                                {order.videoUrl && (
                                    <div className="bg-slate-900 rounded-2xl aspect-[9/16] max-w-[200px] mx-auto overflow-hidden relative group">
                                        <VideoPlayer 
                                            src={order.videoUrl} 
                                            canDownload={false} 
                                            isVideoDeleted={order.isVideoDeleted} 
                                            videoDeletedReason={order.videoDeletedReason} 
                                        />
                                    </div>
                                )}
                                
                                {order.status === RequestStatus.DISPUTE_OPEN && (
                                    <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider text-center mb-1">Risolvi Disputa</p>
                                        <button 
                                            onClick={() => handleResolve(order.id, 'FORCE_ACCEPT')}
                                            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-black text-xs uppercase shadow-md hover:bg-emerald-700 transition"
                                        >
                                            Ragione al VIP (Forza Accetta)
                                        </button>
                                        <button 
                                            onClick={() => handleResolve(order.id, 'CORRECTION')}
                                            className="w-full bg-amber-500 text-white py-3 rounded-xl font-black text-xs uppercase shadow-md hover:bg-amber-600 transition"
                                        >
                                            Ragione al Fan (Chiedi Correzione)
                                        </button>
                                        <button 
                                            onClick={() => handleResolve(order.id, 'REFUND')}
                                            className="w-full bg-red-600 text-white py-3 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-red-700 transition"
                                        >
                                            Ragione al Fan (Rimborsa)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminOrders;
