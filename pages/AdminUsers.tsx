
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { getAllUsersAdmin, createPreCreatedTalent, updateUserDisabledStatus, updateTalentCustomCommission } from '../services/dataService';
import { 
    Users, Search, LogIn, Loader2, User as UserIcon, RefreshCw, Filter, 
    ArrowUpDown, ShieldAlert, Star, Ban, CheckCircle
} from 'lucide-react';

interface AdminUsersProps {
    onImpersonate: (user: User) => void;
}

const AdminUsers: React.FC<AdminUsersProps> = ({ onImpersonate }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');

    // State per la creazione di nuovi profili talent
    const [newTalentEmail, setNewTalentEmail] = useState('');
    const [newTalentName, setNewTalentName] = useState('');
    const [creatingTalent, setCreatingTalent] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState<string | null>(null);
    const [creationError, setCreationError] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getAllUsersAdmin();
            setUsers(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleCreateTalent = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreationSuccess(null);
        setCreationError(null);
        if (!newTalentEmail.trim() || !newTalentName.trim()) {
            setCreationError('Inserisci sia il nome d\'arte che la Gmail.');
            return;
        }
        if (!newTalentEmail.includes('@')) {
            setCreationError('Inserisci un indirizzo email Gmail valido.');
            return;
        }
        setCreatingTalent(true);
        try {
            await createPreCreatedTalent(newTalentEmail, newTalentName);
            setCreationSuccess(`Profilo Talent creato con successo per ${newTalentName}! Il VIP potrà accedere direttamente usando l'email "${newTalentEmail.toLowerCase()}".`);
            setNewTalentEmail('');
            setNewTalentName('');
            setShowCreateForm(false);
            await load();
        } catch (err: any) {
            console.error(err);
            setCreationError('Errore durante la creazione del profilo talent.');
        } finally {
            setCreatingTalent(false);
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = 
            (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
            (u.email || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const handleImpersonationClick = (user: User) => {
        if (confirm(`Stai per accedere come ${user.name} (${user.role}). Confermi?`)) {
            onImpersonate(user);
        }
    };

    const handleToggleDisable = async (targetUser: User) => {
        const actionText = targetUser.isDisabled ? 'abilitare' : 'disabilitare';
        if (confirm(`Sei sicuro di voler ${actionText} il profilo di ${targetUser.name}?`)) {
            try {
                await updateUserDisabledStatus(targetUser.id, !targetUser.isDisabled);
                setUsers(prev => prev.map(u => u.id === targetUser.id ? { ...u, isDisabled: !targetUser.isDisabled } : u));
            } catch (err) {
                console.error(err);
                alert("Errore durante l'aggiornamento dello stato del profilo.");
            }
        }
    };

    if (loading) return (
        <div className="h-[60vh] flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600 h-10 w-10 mb-4" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sincronizzazione Database Utenti...</p>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                    <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Database Utenti</h1>
                        <p className="text-slate-500 font-medium">Gestione anagrafica e impersonificazione</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowCreateForm(!showCreateForm)} 
                        className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-xl ${showCreateForm ? 'bg-amber-500 text-white shadow-amber-100 hover:bg-amber-600' : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'}`}
                    >
                        <Star className="w-4 h-4 fill-current" />
                        {showCreateForm ? 'Annulla' : 'Crea Profilo Talent'}
                    </button>
                    <button onClick={load} className="btn-secondary">
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </button>
                </div>
            </div>

            {/* Form per la creazione di un Profilo Talent */}
            {showCreateForm && (
                <div className="bg-slate-900 text-white p-8 rounded-[32px] border border-slate-800 shadow-xl mb-8 space-y-6 animate-fade-in">
                    <div>
                        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                            <Star className="w-5 h-5 text-indigo-400 fill-current" /> Registra Nuovo Profilo Talent
                        </h2>
                        <p className="text-[11px] text-slate-400 font-bold uppercase mt-1">
                            L'utente potrà accedere tramite quella Gmail per personalizzare e gestire il proprio profilo Star.
                        </p>
                    </div>

                    <form onSubmit={handleCreateTalent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome d'Arte della Star</label>
                            <input 
                                type="text" 
                                placeholder="Esempio: Vasco Rossi"
                                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-500 placeholder:font-bold"
                                value={newTalentName}
                                onChange={e => setNewTalentName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Indirizzo Gmail del Talent</label>
                            <input 
                                type="email" 
                                placeholder="esempio@gmail.com"
                                className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-500 placeholder:font-bold"
                                value={newTalentEmail}
                                onChange={e => setNewTalentEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="md:col-span-2 pt-2 flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={() => {
                                    setShowCreateForm(false);
                                    setCreationError(null);
                                    setCreationSuccess(null);
                                }} 
                                className="px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                            >
                                Annulla
                            </button>
                            <button 
                                type="submit" 
                                disabled={creatingTalent}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                            >
                                {creatingTalent ? 'Registrazione in corso...' : 'Crea Profilo'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {creationSuccess && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-4 rounded-2xl text-xs font-bold leading-relaxed mb-6">
                    {creationSuccess}
                </div>
            )}

            {creationError && (
                <div className="bg-rose-50 text-rose-800 border border-rose-100 p-4 rounded-2xl text-xs font-bold leading-relaxed mb-6">
                    {creationError}
                </div>
            )}

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Cerca per nome o email..."
                        className="input-main pl-12"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <select 
                        className="input-main py-2.5 min-w-[150px]"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value as any)}
                    >
                        <option value="ALL">Tutti i Ruoli</option>
                        <option value={UserRole.FAN}>Solo Fan</option>
                        <option value={UserRole.TALENT}>Solo VIP</option>
                        <option value={UserRole.ADMIN}>Solo Admin</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Utente</th>
                                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Ruolo</th>
                                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Iscrizione</th>
                                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Stato</th>
                                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Commissione</th>
                                <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center text-slate-300 font-bold uppercase italic">
                                        Nessun utente trovato con questi criteri.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(u => (
                                    <tr key={u.id} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="p-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-100">
                                                    {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 text-slate-300"/>}
                                                </div>
                                                <div>
                                                    <p className="font-extrabold text-slate-900 leading-none mb-1">{u.name}</p>
                                                    <p className="text-xs font-medium text-slate-400">{u.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                                                u.role === UserRole.ADMIN ? 'bg-red-100 text-red-600' :
                                                u.role === UserRole.TALENT ? 'bg-purple-100 text-purple-700' :
                                                'bg-indigo-100 text-indigo-700'
                                            }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-6">
                                            <p className="text-xs font-bold text-slate-500">
                                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                                            </p>
                                        </td>
                                        <td className="p-6">
                                            {u.isDisabled ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    <span className="text-[10px] font-black text-red-500 uppercase">Disabilitato</span>
                                                </div>
                                            ) : u.role === UserRole.TALENT ? (
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-2 h-2 rounded-full ${u.isApproved ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">{u.isApproved ? 'Approvato' : 'In attesa'}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-300 uppercase">Standard</span>
                                            )}
                                        </td>
                                        <td className="p-6 text-center">
                                            {u.role === UserRole.TALENT ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <input 
                                                        type="number" 
                                                        min="0"
                                                        max="100"
                                                        placeholder="Def."
                                                        value={u.customCommissionPercent !== undefined && u.customCommissionPercent !== null ? u.customCommissionPercent : ''}
                                                        onChange={async (e) => {
                                                            const val = e.target.value === '' ? null : Number(e.target.value);
                                                            setUsers(prev => prev.map(item => item.id === u.id ? { ...item, customCommissionPercent: val } : item));
                                                            try {
                                                                await updateTalentCustomCommission(u.id, val);
                                                            } catch (err) {
                                                                console.error("Errore aggiornamento commissione:", err);
                                                            }
                                                        }}
                                                        className="w-14 px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg text-slate-800 text-center focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                    />
                                                    <span className="text-xs font-bold text-slate-500">%</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Default</span>
                                            )}
                                        </td>
                                        <td className="p-6 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {u.role !== UserRole.ADMIN && (
                                                    <button 
                                                        onClick={() => handleToggleDisable(u)}
                                                        className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                                                            u.isDisabled 
                                                            ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 bg-emerald-50/20' 
                                                            : 'border-rose-200 text-rose-600 hover:bg-rose-50 bg-rose-50/20'
                                                        }`}
                                                    >
                                                        {u.isDisabled ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                                                        {u.isDisabled ? 'Abilita' : 'Disabilita'}
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handleImpersonationClick(u)}
                                                disabled={u.role === UserRole.ADMIN}
                                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                                                    u.role === UserRole.ADMIN 
                                                    ? 'opacity-30 cursor-not-allowed bg-gray-100 text-slate-400' 
                                                    : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95'
                                                }`}
                                            >
                                                <LogIn className="w-3.5 h-3.5" />
                                                Accedi come lui
                                            </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="mt-8 bg-blue-50 p-6 rounded-3xl flex gap-4 border border-blue-100">
                <ShieldAlert className="w-8 h-8 text-blue-500 flex-shrink-0" />
                <div>
                    <h4 className="text-blue-900 font-black text-xs uppercase mb-1">Nota di Sicurezza Admin</h4>
                    <p className="text-blue-800 text-xs font-medium leading-relaxed">
                        L'impersonificazione ti permette di navigare la piattaforma con l'identità dell'utente selezionato. Tutte le azioni compiute (invio messaggi, acquisti, modifiche profilo) verranno registrate a nome dell'utente. Usa questa funzione solo per scopi di supporto tecnico o debugging.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AdminUsers;
