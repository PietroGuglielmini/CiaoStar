
import React, { useEffect, useState } from 'react';
import { Talent, User, AdminSettings, InAppNotificationSettings } from '../types';
import { syncUserToDB, updateTalentProfile, getCategories, uploadAvatar, uploadIntroVideo, getAdminSettings } from '../services/dataService';
import { moderateText } from '../services/geminiService';
import { Loader2, Save, DollarSign, Clock, Zap, AlertTriangle, Tag, ChevronDown, Camera, User as UserIcon, Video, Bell } from 'lucide-react';

interface TalentSettingsProps {
    user: User;
}

const TalentSettings: React.FC<TalentSettingsProps> = ({ user }) => {
    const [talent, setTalent] = useState<Talent | null>(null);
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form State
    const [displayName, setDisplayName] = useState('');
    const [price, setPrice] = useState(0);
    const [category, setCategory] = useState('');
    const [bio, setBio] = useState('');
    const [isAvailable, setIsAvailable] = useState(true);
    const [fastDeliveryEnabled, setFastDeliveryEnabled] = useState(false);
    const [fastDeliveryIncrease, setFastDeliveryIncrease] = useState(20);
    const [responseTime, setResponseTime] = useState(3);
    const [notificationPrefs, setNotificationPrefs] = useState<any>({
        orderCreated: true,
        orderAccepted: true,
        orderRejected: true,
        videoUploaded: true,
        disputeOpened: true,
        disputeResolved: true,
        orderCompleted: true
    });
    const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
    
    // Change Detection State
    const [initialFormState, setInitialFormState] = useState<any>(null);
    const [hasChanges, setHasChanges] = useState(false);
    
    // Avatar State
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // Intro Video State
    const [introVideoUrl, setIntroVideoUrl] = useState('');
    const [uploadingIntro, setUploadingIntro] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Carica profilo, categorie e impostazioni amministrative dal DB in parallelo
                const [profileData, catsData, admSettings] = await Promise.all([
                    syncUserToDB(user),
                    getCategories(),
                    getAdminSettings()
                ]);

                setCategories(catsData);
                setAdminSettings(admSettings);

                // Initialize user notification preferences
                const defaultPrefs = {
                    orderCreated: true,
                    orderAccepted: true,
                    orderRejected: true,
                    videoUploaded: true,
                    disputeOpened: true,
                    disputeResolved: true,
                    orderCompleted: true
                };
                const mergedPrefs = {
                    ...defaultPrefs,
                    ...(profileData?.notificationPreferences || {})
                };
                setNotificationPrefs(mergedPrefs);

                // Cast to Talent safely
                if (profileData.role === 'TALENT') {
                    const t = profileData as Talent;
                    setTalent(t);
                    
                    // Prepare initial values
                    const initialName = t.name || '';
                    const initialPrice = t.price || 0;
                    const initialBio = t.bio || '';
                    const initialAvail = t.isAvailable !== false;
                    const initialFastEnabled = t.fastDeliveryEnabled || false;
                    const initialFastIncrease = t.fastDeliveryPriceIncrease || 20;
                    const initialResponse = t.responseTimeDays || 3;
                    
                    if (t.avatarUrl) setAvatarPreview(t.avatarUrl);
                    if (t.introVideoUrl) setIntroVideoUrl(t.introVideoUrl);

                    // Se la categoria attuale del talent non è nella lista DB (caso legacy), mantienila o usa la prima disponibile
                    const initialCategory = (t.category && catsData.includes(t.category)) 
                        ? t.category 
                        : catsData[0] || '';
                    
                    // Set Form State
                    setDisplayName(initialName);
                    setPrice(initialPrice);
                    setBio(initialBio);
                    setCategory(initialCategory);
                    setIsAvailable(initialAvail);
                    setFastDeliveryEnabled(initialFastEnabled);
                    setFastDeliveryIncrease(initialFastIncrease);
                    setResponseTime(initialResponse);

                    // Set Initial State for Comparison
                    setInitialFormState({
                        displayName: initialName,
                        price: initialPrice,
                        bio: initialBio,
                        category: initialCategory,
                        isAvailable: initialAvail,
                        fastDeliveryEnabled: initialFastEnabled,
                        fastDeliveryIncrease: initialFastIncrease,
                        responseTime: initialResponse,
                        notificationPrefs: mergedPrefs
                    });
                }
            } catch (e) {
                console.error("Errore caricamento impostazioni:", e);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [user]);

    // Check for changes effect
    useEffect(() => {
        if (!initialFormState) return;

        const isChanged = 
            displayName !== initialFormState.displayName ||
            price !== initialFormState.price ||
            category !== initialFormState.category ||
            bio !== initialFormState.bio ||
            isAvailable !== initialFormState.isAvailable ||
            fastDeliveryEnabled !== initialFormState.fastDeliveryEnabled ||
            fastDeliveryIncrease !== initialFormState.fastDeliveryIncrease ||
            responseTime !== initialFormState.responseTime ||
            avatarFile !== null ||
            JSON.stringify(notificationPrefs) !== JSON.stringify(initialFormState.notificationPrefs);

        setHasChanges(isChanged);
    }, [
        displayName, price, category, bio, isAvailable, 
        fastDeliveryEnabled, fastDeliveryIncrease, responseTime, 
        avatarFile, notificationPrefs, initialFormState
    ]);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            
            // Quality Check: Size < 5MB
            if (file.size > 5 * 1024 * 1024) {
                alert("L'immagine è troppo grande. Dimensione massima 5MB.");
                return;
            }
            // Quality Check: Type
            if (!file.type.startsWith('image/')) {
                alert("Per favore carica un file immagine valido.");
                return;
            }

            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleIntroVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validazione base dimensione file (es. 50MB max)
        if (file.size > 50 * 1024 * 1024) {
            alert("Il file del video è troppo grande. Il limite massimo è 50MB.");
            return;
        }

        setUploadingIntro(true);
        try {
            const url = await uploadIntroVideo(file, user.id);
            setIntroVideoUrl(url);
            if (talent) {
                setTalent({
                    ...talent,
                    introVideoUrl: url
                });
            }
            alert("Video di benvenuto caricato con successo!");
        } catch (err) {
            console.error("Errore upload video di invito:", err);
            alert("Si è verificato un errore durante il caricamento del video.");
        } finally {
            setUploadingIntro(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // 0. Validazione base
            if (!displayName.trim()) {
                alert("Il nome visualizzato non può essere vuoto.");
                setSaving(false);
                return;
            }

            // 1. Moderazione Nome con Gemini
            const nameCheck = await moderateText(displayName, 'name');
            if (!nameCheck.safe) {
                alert(`NOME NON VALIDO.\n\nIl nome scelto viola le linee guida:\n${nameCheck.reason}`);
                setSaving(false);
                return;
            }

            // 2. Moderazione Biografia con Gemini
            const bioCheck = await moderateText(bio, 'bio');
            if (!bioCheck.safe) {
                alert(`BIOGRAFIA NON VALIDA.\n\nIl testo viola le linee guida:\n${bioCheck.reason}`);
                setSaving(false);
                return;
            }

            // 3. Upload Avatar se cambiato
            let newAvatarUrl = talent?.avatarUrl;
            if (avatarFile) {
                setUploadingAvatar(true);
                newAvatarUrl = await uploadAvatar(avatarFile, user.id);
                setUploadingAvatar(false);
            }

            // 4. Update Firestore Profile
            await updateTalentProfile(user.id, {
                name: displayName,
                price: Number(price),
                category,
                bio,
                isAvailable,
                fastDeliveryEnabled,
                fastDeliveryPriceIncrease: Number(fastDeliveryIncrease),
                responseTimeDays: Number(responseTime),
                avatarUrl: newAvatarUrl,
                notificationPreferences: notificationPrefs
            });

            // Update initial state to match current (saved) state
            setInitialFormState({
                displayName,
                price: Number(price),
                category,
                bio,
                isAvailable,
                fastDeliveryEnabled,
                fastDeliveryIncrease: Number(fastDeliveryIncrease),
                responseTime: Number(responseTime),
                notificationPrefs
            });
            setAvatarFile(null); // Clear pending file
            setHasChanges(false);

            alert("Profilo aggiornato con successo!");
        } catch (error) {
            console.error(error);
            alert("Errore durante il salvataggio.");
        } finally {
            setSaving(false);
            setUploadingAvatar(false);
        }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-slate-900 h-8 w-8" /></div>;
    if (!talent) return <div className="p-12 text-center">Devi essere un Talent per accedere a questa pagina.</div>;

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Impostazioni Profilo</h1>
            <p className="text-gray-500 mb-8">Gestisci la tua disponibilità, i prezzi e le opzioni di consegna.</p>

            <form onSubmit={handleSave} className="space-y-8">
                
                {/* 0. Avatar & Bio */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
                        <UserIcon className="w-5 h-5 mr-2" /> Identità Pubblica
                    </h2>
                    
                    <div className="flex flex-col items-center sm:flex-row gap-8 mb-6">
                        <div className="relative group cursor-pointer flex-shrink-0">
                            <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-100 bg-gray-200">
                                {avatarPreview ? (
                                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        <UserIcon className="w-12 h-12" />
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                            <input 
                                type="file" 
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                accept="image/*"
                                onChange={handleAvatarChange}
                            />
                        </div>
                        <div className="flex-1 w-full space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Nome Visualizzato</label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-3 border"
                                    placeholder="Es. Mago Merlino"
                                    maxLength={30}
                                />
                            </div>

                            <div className="relative">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Biografia
                                </label>
                                <textarea
                                    rows={4}
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-3 border"
                                    placeholder="Racconta chi sei ai tuoi fan..."
                                />
                                <p className="text-xs text-gray-400 mt-2">
                                    La tua bio viene analizzata dall'AI per garantire il rispetto delle linee guida.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Video di Invito per la Bacheca (Opzionale) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center">
                        <Video className="w-5 h-5 mr-2 text-indigo-500" /> Video di Invito / Benvenuto (Opzionale)
                    </h2>
                    <p className="text-xs text-gray-500 mb-6">
                        Carica un breve video messaggio pubblico (max 50MB, .mp4, .webm, .mov) per invitare e incoraggiare i fan a farti richieste! Comparirà sulla bacheca e sulla pagina pubblica del tuo profilo.
                    </p>

                    <div className="space-y-4">
                        {introVideoUrl ? (
                            <div className="max-w-md rounded-xl overflow-hidden border border-gray-200 shadow-inner bg-slate-900 relative aspect-video">
                                <video 
                                    src={introVideoUrl} 
                                    controls 
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50">
                                <Video className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                                <p className="text-sm font-semibold text-slate-600">Nessun video di invito caricato</p>
                                <p className="text-xs text-slate-400 mt-1">I fan vedranno solo i dettagli testuali e l'avatar.</p>
                            </div>
                        )}

                        <div className="flex items-center gap-4">
                            <label className="relative cursor-pointer border rounded-lg px-4 py-2 bg-white text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2 select-none">
                                {uploadingIntro ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                                        <span>Caricamento...</span>
                                    </>
                                ) : (
                                    <span>{introVideoUrl ? "Sostituisci Video" : "Seleziona e Carica Video"}</span>
                                )}
                                <input 
                                    type="file" 
                                    disabled={uploadingIntro}
                                    className="sr-only" 
                                    accept="video/*"
                                    onChange={handleIntroVideoChange}
                                />
                            </label>
                            {introVideoUrl && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (window.confirm("Sei sicuro di voler eliminare il tuo video di benvenuto?")) {
                                            await updateTalentProfile(user.id, { introVideoUrl: null });
                                            setIntroVideoUrl('');
                                        }
                                    }}
                                    className="text-xs font-bold text-rose-600 hover:text-rose-800 transition-colors"
                                >
                                    Rimuovi video
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 1. Disponibilità */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Stato Disponibilità</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                {isAvailable ? "Il tuo profilo è visibile e puoi ricevere ordini." : "Il tuo profilo appare come 'Non disponibile'. I fan non possono prenotare."}
                            </p>
                        </div>
                        <div className="flex items-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={isAvailable}
                                    onChange={(e) => setIsAvailable(e.target.checked)}
                                />
                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* 2. Profilo Base & Prezzi */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center">
                        <DollarSign className="w-5 h-5 mr-2" /> Dettagli Offerta
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Categoria</label>
                            <div className="relative">
                                <Tag className="absolute top-3 left-3 w-4 h-4 text-gray-400 z-10" />
                                <ChevronDown className="absolute top-3.5 right-3 w-4 h-4 text-gray-400 z-10 pointer-events-none" />
                                <select 
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="block w-full pl-10 pr-10 rounded-lg border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-3 border bg-white appearance-none relative cursor-pointer hover:border-gray-400 transition-colors"
                                    disabled={categories.length === 0}
                                >
                                    {categories.length === 0 ? (
                                        <option>Caricamento categorie...</option>
                                    ) : (
                                        categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))
                                    )}
                                </select>
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Seleziona una categoria dal database.</p>
                        </div>
                        <div>
                             {/* Empty Spacer */}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Prezzo per video (€)</label>
                            <input 
                                type="number" 
                                min="1"
                                value={price}
                                onChange={(e) => setPrice(Number(e.target.value))}
                                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-slate-500 focus:ring-slate-500 sm:text-sm p-3 border"
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Flash Delivery 24h */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 flex items-center">
                                <Zap className="w-5 h-5 mr-2 text-amber-500 fill-current" /> Consegna Flash 24h
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Offri la possibilità di ricevere il video in 24 ore a un prezzo maggiorato.
                            </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={fastDeliveryEnabled}
                                onChange={(e) => setFastDeliveryEnabled(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                        </label>
                    </div>

                    {fastDeliveryEnabled && (
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 animate-fadeIn">
                            <label className="block text-sm font-bold text-slate-800 mb-3">Sovrapprezzo per consegna 24h</label>
                            <div className="flex space-x-4">
                                {[20, 30, 50].map((pct) => (
                                    <label key={pct} className={`flex-1 border rounded-lg p-3 cursor-pointer transition-all ${fastDeliveryIncrease === pct ? 'bg-white border-amber-500 shadow-md ring-1 ring-amber-500' : 'bg-white border-gray-200 hover:border-amber-300'}`}>
                                        <div className="flex items-center">
                                            <input 
                                                type="radio" 
                                                name="increase" 
                                                value={pct} 
                                                checked={fastDeliveryIncrease === pct}
                                                onChange={() => setFastDeliveryIncrease(pct)}
                                                className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300"
                                            />
                                            <span className="ml-2 font-bold text-slate-900">+{pct}%</span>
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500 ml-6">
                                            Prezzo finale: <span className="font-semibold text-slate-900">€{(price * (1 + pct/100)).toFixed(2)}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div className="flex items-center mt-4 text-xs text-amber-800">
                                <AlertTriangle className="w-4 h-4 mr-1" />
                                Importante: Se attivi questa opzione, devi impegnarti a caricare il video entro 24h dall'accettazione.
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Preferenze Notifiche */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center mb-1">
                        <Bell className="w-5 h-5 mr-2 text-indigo-500" /> Preferenze Notifiche
                    </h2>
                    <p className="text-sm text-gray-500 mb-6 font-semibold">
                        Personalizza quali notifiche vuoi ricevere via email e in-app. Nota: alcune notifiche critiche impostate dall'amministratore sono non-negoziabili.
                    </p>

                    <div className="space-y-3.5">
                        {[
                            { key: 'orderCreated', label: "Nuova Richiesta d'Ordine", desc: 'Notifica alla ricezione di un nuovo ordine.' },
                            { key: 'orderAccepted', label: 'Ordine Accettato', desc: 'Notifica quando la star accetta la richiesta.' },
                            { key: 'orderRejected', label: 'Ordine Rifiutato', desc: 'Notifica in caso di rifiuto da parte della star.' },
                            { key: 'videoUploaded', label: 'Video Caricato & Consegnato', desc: 'Notifica quando viene aggiunto il video messaggio.' },
                            { key: 'disputeOpened', label: 'Disputa Aperta', desc: 'Notifica per l\'apertura di una contestazione.' },
                            { key: 'disputeResolved', label: 'Disputa Risolta dallo Staff', desc: 'Notifica con l\'esito della risoluzione della disputa.' },
                            { key: 'orderCompleted', label: 'Ordine Completato Definitivamente', desc: 'Notifica quando il Fan accetta definitivamente il video.' }
                        ].map((notifOption) => {
                            const isGlobalEnabled = adminSettings?.enabledNotifications?.[notifOption.key as keyof InAppNotificationSettings] !== false;
                            const isNonNegotiable = adminSettings?.nonNegotiableNotifications?.[notifOption.key as keyof InAppNotificationSettings] === true;
                            
                            // Se non è abilitato globalmente dall'admin, non lo mostriamo
                            if (!isGlobalEnabled) return null;

                            const isChecked = isNonNegotiable ? true : (notificationPrefs[notifOption.key] !== false);

                            return (
                                <div key={notifOption.key} className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                                    <div className="flex-1">
                                        <p className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                            {notifOption.label}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-bold mt-0.5 leading-normal">
                                            {notifOption.desc}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isNonNegotiable ? (
                                            <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md">Obbligatoria</span>
                                        ) : (
                                            <input 
                                                type="checkbox" 
                                                className="h-4 w-4 text-indigo-600 rounded border-slate-200 focus:ring-indigo-500 cursor-pointer"
                                                checked={isChecked}
                                                onChange={e => {
                                                    setNotificationPrefs({
                                                        ...notificationPrefs,
                                                        [notifOption.key]: e.target.checked
                                                    });
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button
                        type="submit"
                        disabled={saving || uploadingAvatar || !hasChanges}
                        className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-black transition-all shadow-lg transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center"
                    >
                        {(saving || uploadingAvatar) ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : <Save className="mr-2 h-5 w-5" />}
                        Salva Modifiche
                    </button>
                </div>

            </form>
        </div>
    );
};

export default TalentSettings;
