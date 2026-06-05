import React, { useState, useEffect } from 'react';
import { VideoRequest, RequestStatus } from '../types';
import { getAllOrdersAdmin, updateVideoDeletedStatus } from '../services/dataService';
import { 
    Loader2, 
    ShieldAlert, 
    Check, 
    X, 
    Search, 
    Trash2, 
    RefreshCcw, 
    Film, 
    User, 
    Calendar,
    MessageSquare,
    AlertTriangle,
    Eye
} from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';

const PRESETS = [
    "Contenuto inappropriato o offensivo",
    "Qualità video/audio insufficiente",
    "Violazione dei termini d'uso (No VIP)",
    "Riferimento a brand/servizi non autorizzato",
    "Linguaggio non consono al pubblico",
    "Richiesta specifica dell'utente / star"
];

const AdminMedia: React.FC = () => {
    const [orders, setOrders] = useState<VideoRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'DELETED'>('ALL');
    
    // Moderation state
    const [moderateOrder, setModerateOrder] = useState<VideoRequest | null>(null);
    const [customReason, setCustomReason] = useState('');
    const [selectedPreset, setSelectedPreset] = useState(PRESETS[0]);
    const [submitting, setSubmitting] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const allOrders = await getAllOrdersAdmin();
            // We only care about orders that contain a video
            const mediaOrders = allOrders.filter(o => o.videoUrl);
            setOrders(mediaOrders);
        } catch (error) {
            console.error("Errore caricamento media:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleDeleteVideo = async () => {
        if (!moderateOrder) return;
        const finalReason = customReason.trim() || selectedPreset;
        setSubmitting(true);
        try {
            await updateVideoDeletedStatus(moderateOrder.id, true, finalReason);
            // update local state
            setOrders(prev => prev.map(o => o.id === moderateOrder.id ? { ...o, isVideoDeleted: true, videoDeletedReason: finalReason, status: RequestStatus.CANCELED } : o));
            setModerateOrder(null);
            setCustomReason('');
        } catch (e) {
            console.error("Errore disabilitazione video:", e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRestoreVideo = async (order: VideoRequest) => {
        if (!window.confirm(`Sei sicuro di voler ripristinare il video per l'ordine #${order.id}?`)) return;
        try {
            await updateVideoDeletedStatus(order.id, false);
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, isVideoDeleted: false, videoDeletedReason: undefined, status: RequestStatus.COMPLETED } : o));
        } catch (e) {
            console.error("Errore ripristino video:", e);
        }
    };

    const filteredOrders = orders.filter(o => {
        // Text Search
        const matchesText = 
            o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (o.talentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            o.fanName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (o.videoDeletedReason || '').toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesText) return false;

        // Status Filter
        if (filter === 'ACTIVE') return !o.isVideoDeleted;
        if (filter === 'DELETED') return !!o.isVideoDeleted;
        return true;
    });

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
                <div>
                    <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-100">
                        Pannello Sicurezza & Moderazione
                    </span>
                    <h1 className="text-3xl font-extrabold text-slate-900 mt-2 mb-1">
                        Gestione Media & Video
                    </h1>
                    <p className="text-slate-500 font-semibold text-sm">
                        Modera, ripristina o elimina i video messaggi caricati dai VIP nel sistema.
                    </p>
                </div>
                <button 
                    onClick={loadData}
                    className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600 font-bold text-xs flex items-center gap-2 shadow-sm self-start md:self-auto"
                >
                    <RefreshCcw className="w-4 h-4" /> Aggiorna Elenco
                </button>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm mb-8 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
                    <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cerca per ID, Star, Fan o motivo..."
                        className="w-full bg-slate-50 border-0 focus:ring-2 focus:ring-indigo-600 rounded-2xl pl-12 pr-4 py-3 text-slate-700 placeholder-slate-400 font-medium text-sm"
                    />
                </div>

                {/* Tabs */}
                <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl self-start md:self-auto">
                    <button
                        onClick={() => setFilter('ALL')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            filter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Tutti ({orders.length})
                    </button>
                    <button
                        onClick={() => setFilter('ACTIVE')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            filter === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Attivi ({orders.filter(o => !o.isVideoDeleted).length})
                    </button>
                    <button
                        onClick={() => setFilter('DELETED')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            filter === 'DELETED' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        Eliminati ({orders.filter(o => o.isVideoDeleted).length})
                    </button>
                </div>
            </div>

            {/* Load State */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <Loader2 className="animate-spin text-indigo-600 w-10 h-10 mb-4" />
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest text-[10px]">Caricamento Catalogo Media...</p>
                </div>
            ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
                    <Film className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-slate-900 font-extrabold text-base mb-1">Nessun media trovato</p>
                    <p className="text-slate-400 text-xs font-semibold max-w-xs">Nessun video registrato o caricato corrisponde ai criteri impostati.</p>
                </div>
            ) : (
                /* Grid layout */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredOrders.map(order => (
                        <div key={order.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                            {/* Visual Player container */}
                            <div className="p-5 bg-slate-950 flex justify-center items-center relative min-h-[360px]">
                                <div className="w-full">
                                    <VideoPlayer 
                                        src={order.videoUrl || ''} 
                                        canDownload={!order.isVideoDeleted} 
                                        isVideoDeleted={order.isVideoDeleted}
                                        videoDeletedReason={order.videoDeletedReason}
                                    />
                                </div>
                            </div>

                            {/* Content Details */}
                            <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                                <div>
                                    {/* Order / Status tags */}
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-md">
                                            ORDINE #{order.id.slice(0, 8)}...
                                        </span>
                                        {order.isVideoDeleted ? (
                                            <span className="bg-rose-50 border border-rose-100 text-rose-600 py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                <ShieldAlert className="w-3 h-3" /> Eliminato
                                            </span>
                                        ) : (
                                            <span className="bg-emerald-50 border border-emerald-100 text-emerald-600 py-1 px-2.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                                <Check className="w-3 h-3" /> Visibile
                                            </span>
                                        )}
                                    </div>

                                    {/* Parties */}
                                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-3 text-xs">
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Artista (VIP)</p>
                                            <p className="font-extrabold text-slate-800 flex items-center gap-1">
                                                <User className="w-3.5 h-3.5 text-slate-400" />
                                                {order.talentName || 'Star'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-0.5">Fan (Cliente)</p>
                                            <p className="font-extrabold text-slate-800 flex items-center gap-1">
                                                <User className="w-3.5 h-3.5 text-slate-400" />
                                                {order.fanName}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Info instruction summary */}
                                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                            <MessageSquare className="w-3.5 h-3.5" /> Dettagli video / Occasione
                                        </p>
                                        <p className="text-slate-400 font-bold uppercase text-[9px] mb-1">{order.occasion || 'Messaggio personalizzato'} per <span className="text-slate-700 font-extrabold">{order.recipientName}</span></p>
                                        <p className="text-slate-600 italic line-clamp-2">"{order.instructions}"</p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="pt-4 border-t border-slate-100">
                                    {order.isVideoDeleted ? (
                                        <button 
                                            onClick={() => handleRestoreVideo(order)}
                                            className="w-full py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
                                        >
                                            <RefreshCcw className="w-4 h-4" /> Ripristina Media nel Sistema
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => setModerateOrder(order)}
                                            className="w-full py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Trash2 className="w-4 h-4" /> Modera & Rimuovi Video
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Moderation Modal Dialog */}
            {moderateOrder && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 max-w-md w-full shadow-2xl relative">
                        {/* Close button */}
                        <button 
                            onClick={() => {
                                setModerateOrder(null);
                                setCustomReason('');
                            }}
                            className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="text-center mb-6">
                            <div className="w-14 h-14 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-7 h-7" />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 mb-1">Rimozione Contenuto</h3>
                            <p className="text-slate-400 font-medium text-xs">
                                Specifica il motivo dell'eliminazione del video caricato per l'ordine <strong>#{moderateOrder.id.slice(0, 10)}</strong>.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* Preset Options layout */}
                            <div>
                                <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Motivazione predefinita</label>
                                <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1 border border-slate-100 rounded-xl p-2 bg-slate-50">
                                    {PRESETS.map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => {
                                                setSelectedPreset(preset);
                                                setCustomReason(''); // Clear custom
                                            }}
                                            className={`text-left text-xs p-2.5 rounded-lg border font-bold transition-all ${
                                                selectedPreset === preset && !customReason
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                    : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50'
                                            }`}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Custom comment input */}
                            <div>
                                <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Oppure scrivi una motivazione personalizzata</label>
                                <textarea 
                                    value={customReason}
                                    onChange={(e) => {
                                        setCustomReason(e.target.value);
                                    }}
                                    placeholder="Scrivi qui il motivo dell'eliminazione del video..."
                                    rows={3}
                                    className="w-full bg-slate-50 border-0 focus:ring-2 focus:ring-indigo-600 p-3 text-xs font-semibold text-slate-700 placeholder-slate-400 rounded-xl"
                                />
                            </div>

                            {/* Warning message explaining standard moderation disclaimer */}
                            <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl flex gap-2.5 text-[11px] leading-relaxed text-amber-850 font-bold">
                                <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0" />
                                <span>
                                    Facendo clic su "Conferma Eliminazione", il video non sarà più riproducibile o scaricabile da nessun utente (Fan o Star). Verrà rimpiazzato dall'avviso di moderazione.
                                </span>
                            </div>

                            {/* Actions layout button group */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setModerateOrder(null);
                                        setCustomReason('');
                                    }}
                                    className="py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold text-xs"
                                >
                                    Annulla
                                </button>
                                <button
                                    onClick={handleDeleteVideo}
                                    disabled={submitting}
                                    className="py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5"
                                >
                                    {submitting ? (
                                        <><Loader2 className="animate-spin w-4 h-4" /> Esecuzione...</>
                                    ) : (
                                        'Conferma'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminMedia;
