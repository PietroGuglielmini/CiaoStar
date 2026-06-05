import React, { useState, useEffect } from 'react';
import { Review, User, UserRole } from '../types';
import { getAllReviewsAdmin, getAllUsersAdmin, updateReviewModeration } from '../services/dataService';
import { 
    Loader2, 
    Search, 
    RefreshCw, 
    Star, 
    Eye, 
    EyeOff, 
    MessageSquare, 
    Calendar,
    ThumbsUp,
    ShieldAlert
} from 'lucide-react';

const AdminReviews: React.FC = () => {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [talents, setTalents] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'VISIBLE' | 'HIDDEN'>('ALL');
    const [actioningId, setActioningId] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [allReviews, allUsers] = await Promise.all([
                getAllReviewsAdmin(),
                getAllUsersAdmin()
            ]);
            setReviews(allReviews);
            setTalents(allUsers.filter(u => u.role === UserRole.TALENT));
        } catch (error) {
            console.error("Errore caricamento recensioni:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleToggleVisibility = async (review: Review) => {
        if (!review.id) return;
        const newHiddenStatus = !review.isHidden;
        setActioningId(review.id);
        try {
            await updateReviewModeration(review.id, newHiddenStatus, review.talentId);
            setReviews(prev => prev.map(r => r.id === review.id ? { ...r, isHidden: newHiddenStatus } : r));
        } catch (err) {
            console.error("Errore modifica stato moderazione:", err);
        } finally {
            setActioningId(null);
        }
    };

    const getTalentName = (talentId: string) => {
        const t = talents.find(u => u.id === talentId);
        return t ? t.name : "Star Sconosciuta";
    };

    const filteredReviews = reviews.filter(r => {
        const talentName = getTalentName(r.talentId).toLowerCase();
        const fanName = r.fanName.toLowerCase();
        const comment = r.comment.toLowerCase();
        const search = searchQuery.toLowerCase();

        const matchesText = 
            talentName.includes(search) || 
            fanName.includes(search) || 
            comment.includes(search);

        if (!matchesText) return false;

        if (filter === 'VISIBLE') return !r.isHidden;
        if (filter === 'HIDDEN') return !!r.isHidden;
        return true;
    });

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-indigo-600" />
                        Moderazione Recensioni
                    </h1>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                        Approva, censura o nascondi i feedback rilasciati dai fan sui profili delle Star
                    </p>
                </div>
                <button 
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-slate-700 rounded-2xl hover:bg-slate-50 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Sincronizza
                </button>
            </div>

            {/* Filter Controls */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm mb-8 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Search bar */}
                    <div className="relative flex-1 max-w-lg">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Cerca per commento, Star o Fan..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-300 text-sm font-semibold text-slate-700 transition-all placeholder:text-slate-400"
                        />
                    </div>

                    {/* Quick Visibility Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100 w-fit">
                        <button
                            onClick={() => setFilter('ALL')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${filter === 'ALL' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                        >
                            Tutte ({reviews.length})
                        </button>
                        <button
                            onClick={() => setFilter('VISIBLE')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${filter === 'VISIBLE' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                        >
                            Visibili ({reviews.filter(r => !r.isHidden).length})
                        </button>
                        <button
                            onClick={() => setFilter('HIDDEN')}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${filter === 'HIDDEN' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
                        >
                            Nascoste ({reviews.filter(r => r.isHidden).length})
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-24 text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto" />
                    <p className="mt-4 text-xs font-black text-slate-400 uppercase tracking-widest">Caricamento in corso...</p>
                </div>
            ) : filteredReviews.length === 0 ? (
                <div className="text-center py-20 bg-white border border-gray-100 rounded-[2.5rem] p-10 shadow-sm max-w-lg mx-auto">
                    <ShieldAlert className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-900 font-extrabold mb-1">Nessuna recensione trovata</p>
                    <p className="text-xs font-medium text-slate-400">Prova a modificare i filtri di ricerca.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredReviews.map((r) => {
                        const isHidden = !!r.isHidden;
                        const isActioning = actioningId === r.id;

                        return (
                            <div 
                                key={r.id} 
                                className={`bg-white rounded-[2rem] border p-6 flex flex-col justify-between transition-all duration-300 shadow-sm relative ${
                                    isHidden 
                                    ? 'border-red-100 bg-red-50/10 opacity-75' 
                                    : 'border-slate-100 hover:border-indigo-100 hover:shadow-indigo-50/50 hover:shadow-lg'
                                }`}
                            >
                                <div className="space-y-4">
                                    {/* Top Row: Ratings & Status */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-0.5 text-amber-400">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <Star 
                                                    key={i} 
                                                    className={`w-4 h-4 ${i < r.rating ? 'fill-current text-amber-400' : 'text-slate-200'}`} 
                                                />
                                            ))}
                                        </div>
                                        <div>
                                            {isHidden ? (
                                                <span className="bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-red-100 flex items-center gap-1.5">
                                                    <EyeOff className="w-3 h-3" /> Nascosta
                                                </span>
                                            ) : (
                                                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1.5">
                                                    <Eye className="w-3 h-3" /> Approvata
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Fan vs Star details */}
                                    <div className="space-y-1">
                                        <div className="flex items-baseline gap-1 bg-slate-50 hover:bg-slate-100/80 transition-colors p-3 rounded-2xl border border-slate-100 text-xs font-semibold">
                                            <span className="text-slate-400 uppercase text-[9px] font-black mr-1 shrink-0">Fan:</span>
                                            <span className="text-slate-800 font-extrabold truncate">{r.fanName}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1 bg-indigo-50/30 hover:bg-indigo-100/20 transition-colors p-3 rounded-2xl border border-indigo-100/30 text-xs font-semibold">
                                            <span className="text-indigo-400 uppercase text-[9px] font-black mr-1 shrink-0">Destin.:</span>
                                            <span className="text-indigo-900 font-extrabold truncate">{getTalentName(r.talentId)}</span>
                                        </div>
                                    </div>

                                    {/* Review content */}
                                    <div className="bg-slate-50/40 p-4 rounded-2xl border border-dashed border-slate-100 min-h-[90px] flex flex-col justify-center">
                                        <p className="text-xs text-slate-600 font-medium italic leading-relaxed break-words">
                                            "{r.comment || 'Nessun commento testuale inserito.'}"
                                        </p>
                                    </div>
                                </div>

                                {/* Footer info and actions */}
                                <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <span>
                                            {r.createdAt ? new Date(r.createdAt).toLocaleDateString('it-IT') : 'Data sconosciuta'}
                                        </span>
                                    </div>

                                    <button
                                        disabled={isActioning}
                                        onClick={() => handleToggleVisibility(r)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm select-none hover:scale-[1.02] active:scale-95 disabled:opacity-50 ${
                                            isHidden 
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100' 
                                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 shadow-rose-50'
                                        }`}
                                    >
                                        {isActioning ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : isHidden ? (
                                            <>
                                                <ThumbsUp className="w-3 h-3" /> Approva
                                            </>
                                        ) : (
                                            <>
                                                <EyeOff className="w-3 h-3" /> Nascondi
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminReviews;
