
import React, { useState, useEffect } from 'react';
import { AdminSettings as SettingsType, EmailSettings } from '../types';
import { getAdminSettings, updateAdminSettings, uploadWatermark, deleteWatermark, getEmailSettings, updateEmailSettings, seedDatabaseAndStructure, uploadBrandingLogo, deleteBrandingLogo } from '../services/dataService';
import { Settings, Image as ImageIcon, Loader2, Save, Trash2, Upload, Percent, Clock, AlertTriangle, Bell, Globe, Database, CreditCard, Mail, Sliders, Sparkles } from 'lucide-react';

const WatermarkLivePreview: React.FC<{ settings: SettingsType | null }> = ({ settings }) => {
    const text = settings?.watermarkText || 'CiaoStar';
    const hAlign = settings?.watermarkHAlign || 'rightaligned';
    const vAlign = settings?.watermarkVAlign || 'bottomalligned';
    const speed = settings?.watermarkTypingSpeed || 12;
    const opacity = settings?.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.6;
    const color = settings?.watermarkColor || '#ffffff';
    const fontSize = settings?.watermarkFontSize || 4;

    const [displayText, setDisplayText] = useState('');

    useEffect(() => {
        let index = 0;
        setDisplayText('');
        
        const intervalMs = Math.round(1000 / speed);
        const timer = setInterval(() => {
            index++;
            if (index <= text.length) {
                setDisplayText(text.substring(0, index));
            } else {
                clearInterval(timer);
                setTimeout(() => {
                    setDisplayText('');
                }, 1500);
            }
        }, intervalMs);

        return () => clearInterval(timer);
    }, [text, speed]);

    let alignClasses = "absolute m-4 rounded font-black break-all whitespace-pre-wrap select-none transition-all";
    
    if (hAlign === 'leftaligned') {
        alignClasses += " left-2 text-left";
    } else if (hAlign === 'centeraligned') {
        alignClasses += " left-1/2 -translate-x-1/2 text-center";
    } else {
        alignClasses += " right-2 text-right";
    }

    if (vAlign === 'topaligned') {
        alignClasses += " top-2";
    } else if (vAlign === 'centreallinement') {
        alignClasses += " top-1/2 -translate-y-1/2";
    } else {
        alignClasses += " bottom-2";
    }

    const style = {
        fontSize: `${fontSize * 1.3}px`,
        color: color,
        opacity: opacity,
        textShadow: '0 1px 3px rgba(0,0,0,0.8)'
    };

    return (
        <div className={alignClasses} style={style}>
            {displayText || '\u00A0'}
        </div>
    );
};

const AdminSettings: React.FC = () => {
    const [settings, setSettings] = useState<SettingsType | null>(null);
    const [emailSettings, setEmailSettings] = useState<EmailSettings>({
        senderEmail: '',
        senderName: '',
        apiKey: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [emailSaving, setEmailSaving] = useState(false);
    const [seeding, setSeeding] = useState(false);

    // SMTP fields
    const [smtpHost, setSmtpHost] = useState('');
    const [smtpUser, setSmtpUser] = useState('');
    const [smtpPass, setSmtpPass] = useState('');
    const [smtpPort, setSmtpPort] = useState(587);
    
    // Watermark State
    const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
    const [watermarkPreview, setWatermarkPreview] = useState<string | null>(null);

    // Branding logo states
    const [logoUploading, setLogoUploading] = useState(false);
    const [faviconUploading, setFaviconUploading] = useState(false);
    const [emailLogoUploading, setEmailLogoUploading] = useState(false);

    const handleBrandingUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'favicon' | 'emailLogo') => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (type === 'logo') setLogoUploading(true);
        if (type === 'favicon') setFaviconUploading(true);
        if (type === 'emailLogo') setEmailLogoUploading(true);

        try {
            const url = await uploadBrandingLogo(file, type);
            setSettings(prev => prev ? {
                ...prev,
                ...(type === 'logo' && { logoUrl: url }),
                ...(type === 'favicon' && { faviconUrl: url }),
                ...(type === 'emailLogo' && { emailLogoUrl: url }),
            } : null);
            alert("File caricato e registrato con successo!");
        } catch (err: any) {
            console.error(err);
            alert("Errore durante il caricamento: " + (err.message || err));
        } finally {
            if (type === 'logo') setLogoUploading(false);
            if (type === 'favicon') setFaviconUploading(false);
            if (type === 'emailLogo') setEmailLogoUploading(false);
        }
    };

    const handleBrandingDelete = async (type: 'logo' | 'favicon' | 'emailLogo') => {
        if (!confirm("Rimuovere questo logo? L'operazione non è reversibile.")) return;
        try {
            await deleteBrandingLogo(type);
            setSettings(prev => prev ? {
                ...prev,
                ...(type === 'logo' && { logoUrl: undefined }),
                ...(type === 'favicon' && { faviconUrl: undefined }),
                ...(type === 'emailLogo' && { emailLogoUrl: undefined }),
            } : null);
            alert("Logo rimosso con successo!");
        } catch (err: any) {
            console.error(err);
            alert("Errore durante la rimozione dello spezzone: " + (err.message || err));
        }
    };

    const handleSeedDatabase = async () => {
        if (!confirm("Avviare il seeding e l'inizializzazione del database? Questo assicurerà che tutte le collezioni necessari (users, orders, system_settings, ecc.) e i documenti di configurazione di default siano creati correttamente.")) return;
        setSeeding(true);
        try {
            await seedDatabaseAndStructure();
            alert("Database CiaoStar inizializzato con successo! Tutte le collezioni e i parametri di base sono pronti.");
            await load(); // ricarica i dati
        } catch (err: any) {
            console.error(err);
            alert("Errore durante l'inizializzazione del database: " + (err.message || err));
        } finally {
            setSeeding(false);
        }
    };

    const load = async () => {
        setLoading(true);
        const data = await getAdminSettings();
        setSettings(data);
        if (data.watermarkUrl) setWatermarkPreview(data.watermarkUrl);

        try {
            const mailData = await getEmailSettings();
            if (mailData) {
                setEmailSettings({
                    senderEmail: mailData.senderEmail || '',
                    senderName: mailData.senderName || '',
                    apiKey: mailData.apiKey || '',
                });
                setSmtpHost((mailData as any).smtpHost || '');
                setSmtpUser((mailData as any).smtpUser || '');
                setSmtpPass((mailData as any).smtpPass || '');
                setSmtpPort((mailData as any).smtpPort || 587);
            }
        } catch (e) {
            console.error("Error loading email settings: ", e);
        }

        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const handleSaveEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Simple regex format email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailSettings.senderEmail || !emailRegex.test(emailSettings.senderEmail)) {
            alert("Per favore, inserisci un indirizzo email mittente valido.");
            return;
        }

        if (!emailSettings.senderName.trim()) {
            alert("Il nome del mittente è richiesto.");
            return;
        }

        setEmailSaving(true);
        try {
            await updateEmailSettings({
                ...emailSettings,
                smtpHost,
                smtpUser,
                smtpPass,
                smtpPort,
            } as any);
            alert("Configurazione Email salvata con successo su Firestore!");
        } catch (err: any) {
            console.error(err);
            alert("Errore durante il salvataggio: " + (err.message || err));
        } finally {
            setEmailSaving(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        setSaving(true);
        await updateAdminSettings(settings);
        setSaving(false);
        alert("Impostazioni salvate!");
    };

    const handleWatermarkUpload = async () => {
        if (!watermarkFile) return;
        setSaving(true);
        const url = await uploadWatermark(watermarkFile);
        setWatermarkPreview(url);
        setWatermarkFile(null);
        setSaving(false);
    };

    const handleDeleteWatermark = async () => {
        if (!confirm("Eliminare la filigrana?")) return;
        await deleteWatermark();
        setWatermarkPreview(null);
        setSettings(prev => prev ? {...prev, watermarkUrl: undefined} : null);
    };

    if (loading) return <div className="p-20 flex justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <header className="mb-10 flex items-center gap-4 border-b pb-6">
                <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg">
                    <Settings className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-3xl font-black text-slate-900 uppercase">Configurazione Sistema</h1>
                    <p className="text-slate-400 font-medium">Gestione parametri economici e brand</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* GLOBAL PARAMS */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-4 flex items-center gap-2">
                        <Percent className="w-5 h-5 text-blue-500" /> Parametri Business
                    </h2>
                    
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Commissione Piattaforma (%)</label>
                        <input 
                            type="number" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold"
                            value={settings?.platformFeePercent}
                            onChange={e => setSettings({...settings!, platformFeePercent: Number(e.target.value)})}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Scadenza Consegna Generica (Giorni)</label>
                        <input 
                            type="number" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold"
                            value={settings?.maxDeliveryDays}
                            onChange={e => setSettings({...settings!, maxDeliveryDays: Number(e.target.value)})}
                        />
                    </div>

                    <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 space-y-4">
                        <span className="text-[10px] bg-indigo-600 text-white font-bold uppercase px-2 py-0.5 rounded leading-normal">
                            Gestione Ciclo di Vita Ordine
                        </span>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Giorni per Accettare/Rifiutare (Star)</label>
                            <input 
                                type="number" 
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 font-bold text-xs"
                                value={settings?.talentAcceptanceThresholdDays ?? 3}
                                onChange={e => setSettings({...settings!, talentAcceptanceThresholdDays: Number(e.target.value)})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Giorni per Consegnare dopo Accettazione</label>
                            <input 
                                type="number" 
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 font-bold text-xs"
                                value={settings?.talentDeliveryThresholdDays ?? 7}
                                onChange={e => setSettings({...settings!, talentDeliveryThresholdDays: Number(e.target.value)})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Giorni per Riconsegnare dopo Contestazione (CORREZIONE/DISPUTA)</label>
                            <input 
                                type="number" 
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 font-bold text-xs"
                                value={settings?.talentCorrectionThresholdDays ?? 3}
                                onChange={e => setSettings({...settings!, talentCorrectionThresholdDays: Number(e.target.value)})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Giorni per Approvare/Contestare (Fan)</label>
                            <input 
                                type="number" 
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 font-bold text-xs"
                                value={settings?.fanApprovalThresholdDays ?? 3}
                                onChange={e => setSettings({...settings!, fanApprovalThresholdDays: Number(e.target.value)})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Auto-Eliminazione Media (Giorni)</label>
                        <input 
                            type="number" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold"
                            placeholder="Es. 30"
                            value={settings?.videoAutoDeleteDays ?? ''}
                            onChange={e => setSettings({...settings!, videoAutoDeleteDays: e.target.value ? Number(e.target.value) : undefined})}
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">
                            I video verranno disattivati automaticamente dopo X giorni dall'invio. Imposta 0 o lascia vuoto per disabilitare la rimozione automatica.
                        </p>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Limite Messaggi Staff (Per Ora)</label>
                        <input 
                            type="number" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold"
                            placeholder="Es. 10"
                            value={settings?.messageLimitPerHour ?? 10}
                            onChange={e => setSettings({...settings!, messageLimitPerHour: Number(e.target.value)})}
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 font-semibold leading-relaxed">
                            Soglia massima di messaggi che un utente (fan/talent) può inviare alla chat di supporto/staff ogni ora.
                        </p>
                    </div>

                    <div className="pt-4">
                        <button disabled={saving} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl cursor-pointer hover:bg-black transition-all">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Parametri'}
                        </button>
                    </div>
                </form>

                {/* DATI SOCIETARI E FISCALI ITALIA */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-4 flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-amber-500" /> Adempimenti Legali & Fisco Italia
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        I seguenti dati societari compariranno in modo chiaro e statico nel footer del sito in conformità con la normativa della Repubblica Italiana (pena sanzioni fino a 2.000€).
                    </p>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Ragione Sociale</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                            placeholder="es. CIAOSTAR S.R.L. a socio unico"
                            value={settings?.legalBusinessName ?? ''}
                            onChange={e => setSettings({...settings!, legalBusinessName: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Sede Legale Completa</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                            placeholder="es. Via dell'Innovazione 42, 20126 Milano (MI), Italia"
                            value={settings?.legalRegisteredOffice ?? ''}
                            onChange={e => setSettings({...settings!, legalRegisteredOffice: e.target.value})}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Partita IVA / C.F.</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                                placeholder="es. IT12345678901"
                                value={settings?.legalVatNumber ?? ''}
                                onChange={e => setSettings({...settings!, legalVatNumber: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Capitale Sociale</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                                placeholder="es. €100.000,00 i.v."
                                value={settings?.legalCapitalValue ?? ''}
                                onChange={e => setSettings({...settings!, legalCapitalValue: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Numero REA</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                                placeholder="es. MI-9876543"
                                value={settings?.legalReaNumber ?? ''}
                                onChange={e => setSettings({...settings!, legalReaNumber: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Email PEC</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                                placeholder="es. legal@pec.ciaostar.it"
                                value={settings?.legalPecEmail ?? ''}
                                onChange={e => setSettings({...settings!, legalPecEmail: e.target.value})}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Email di Contatto Standard</label>
                        <input 
                            type="email" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 font-bold text-xs"
                            placeholder="es. info@ciaostar.it"
                            value={settings?.legalContactEmail ?? ''}
                            onChange={e => setSettings({...settings!, legalContactEmail: e.target.value})}
                        />
                    </div>

                    <div className="pt-4">
                        <button disabled={saving} className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl cursor-pointer hover:bg-amber-600 transition-all">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Dati Societari'}
                        </button>
                    </div>
                </form>

                {/* NOTIFICATIONS CHECKLIST */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-2 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-indigo-500" /> Gestione Notifiche & Negoziabilità
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Seleziona quali notifiche sono abilitate globalmente e imposta quali sono <strong>Obbligatorie (Non Negoziabili)</strong> per l'utente finale.
                    </p>

                    <div className="space-y-3.5 pt-2">
                        {[
                            { key: 'orderCreated', label: "Nuova Richiesta d'Ordine", desc: 'Notifica al Talent alla ricezione di un nuovo ordine.' },
                            { key: 'orderAccepted', label: 'Ordine Accettato', desc: 'Notifica al Fan quando la star accetta la richiesta.' },
                            { key: 'orderRejected', label: 'Ordine Rifiutato', desc: 'Notifica al Fan in caso di rifiuto da parte della star.' },
                            { key: 'videoUploaded', label: 'Video Caricato & Consegnato', desc: 'Notifica al Fan quando viene aggiunto il video messaggio.' },
                            { key: 'disputeOpened', label: 'Disputa Aperta', desc: 'Notifica all\'Admin (di controllo) e al Talent per una contestazione.' },
                            { key: 'disputeResolved', label: 'Disputa Risolta dallo Staff', desc: 'Notifica a Fan e Talent con l\'esito della vicissitudine.' },
                            { key: 'orderCompleted', label: 'Ordine Completato Definitivamente', desc: 'Notifica al Talent quando il Fan accetta definitivamente il video.' }
                        ].map((notifOption) => {
                            const config = settings?.enabledNotifications || {
                                orderCreated: true,
                                orderAccepted: true,
                                orderRejected: true,
                                videoUploaded: true,
                                disputeOpened: true,
                                disputeResolved: true,
                                orderCompleted: true
                            };
                            const nonNegotiableConfig = settings?.nonNegotiableNotifications || {
                                orderCreated: false,
                                orderAccepted: false,
                                orderRejected: false,
                                videoUploaded: false,
                                disputeOpened: false,
                                disputeResolved: false,
                                orderCompleted: false
                            };
                            const isChecked = config[notifOption.key as keyof typeof config] !== false;
                            const isNonNegotiable = nonNegotiableConfig[notifOption.key as keyof typeof nonNegotiableConfig] === true;

                            return (
                                <div key={notifOption.key} className="flex flex-col gap-3 p-4 rounded-2xl hover:bg-slate-50 transition-all border border-slate-100 bg-white shadow-sm">
                                    <div className="flex-1">
                                        <p className="text-xs font-black text-slate-800 uppercase tracking-tight">
                                            {notifOption.label}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-normal">
                                            {notifOption.desc}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-6 pt-1 border-t border-slate-50">
                                        {/* Checkbox Abilitata */}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="h-4 w-4 text-indigo-600 rounded border-slate-200 focus:ring-indigo-500 cursor-pointer"
                                                checked={isChecked}
                                                onChange={e => {
                                                    const updatedNotifications = {
                                                        ...config,
                                                        [notifOption.key]: e.target.checked
                                                    };
                                                    setSettings({
                                                        ...settings!,
                                                        enabledNotifications: updatedNotifications
                                                    });
                                                }}
                                            />
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Abilitata</span>
                                        </label>

                                        {/* Checkbox Obbligatoria (Non negoziabile) */}
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="h-4 w-4 text-rose-600 rounded border-slate-200 focus:ring-rose-500 cursor-pointer"
                                                checked={isNonNegotiable}
                                                onChange={e => {
                                                    const updatedNonNegotiable = {
                                                        ...nonNegotiableConfig,
                                                        [notifOption.key]: e.target.checked
                                                    };
                                                    setSettings({
                                                        ...settings!,
                                                        nonNegotiableNotifications: updatedNonNegotiable
                                                    });
                                                }}
                                            />
                                            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider">Obbligatoria</span>
                                        </label>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-2">
                        <button disabled={saving} className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Notifiche'}
                        </button>
                    </div>
                </form>

                {/* WATERMARK */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6 md:col-span-2">
                    <h2 className="text-lg font-black text-slate-900 uppercase flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-indigo-500 animate-pulse" /> Filigrana di Brand Dinamica (Anti-Contraffazione)
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Configura la filigrana di testo dinamica da applicare automaticamente sui video. Il testo si compone lettera per lettera frame-by-frame, rendendo quasi impossibile la rimozione automatica da parte di malintenzionati.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Controlli Dinamici */}
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Testo della Filigrana</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="es. CiaoStar.it"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.watermarkText ?? 'CiaoStar'}
                                    onChange={e => setSettings({...settings!, watermarkText: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Dimensione Font (% altezza)</label>
                                    <input 
                                        type="number" 
                                        min="2"
                                        max="15"
                                        step="0.5"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                        value={settings?.watermarkFontSize ?? 4}
                                        onChange={e => setSettings({...settings!, watermarkFontSize: Number(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Colore Filigrana</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="color" 
                                            className="h-10 w-10 border-0 bg-transparent rounded-lg cursor-pointer shrink-0"
                                            value={settings?.watermarkColor ?? '#ffffff'}
                                            onChange={e => setSettings({...settings!, watermarkColor: e.target.value})}
                                        />
                                        <input 
                                            type="text" 
                                            placeholder="#ffffff"
                                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-2 py-1.5 text-xs font-bold font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                                            value={settings?.watermarkColor ?? '#ffffff'}
                                            onChange={e => setSettings({...settings!, watermarkColor: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Trasparenza (Opacity)</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="range" 
                                            min="0.1"
                                            max="1.0"
                                            step="0.05"
                                            className="w-full accent-indigo-600 cursor-pointer"
                                            value={settings?.watermarkOpacity ?? 0.6}
                                            onChange={e => setSettings({...settings!, watermarkOpacity: Number(e.target.value)})}
                                        />
                                        <span className="text-xs font-bold text-slate-500 font-mono w-8 shrink-0">
                                            {Math.round((settings?.watermarkOpacity ?? 0.6) * 100)}%
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Velocità di Digitazione</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="range" 
                                            min="2"
                                            max="45"
                                            step="1"
                                            className="w-full accent-indigo-600 cursor-pointer"
                                            value={settings?.watermarkTypingSpeed ?? 12}
                                            onChange={e => setSettings({...settings!, watermarkTypingSpeed: Number(e.target.value)})}
                                        />
                                        <span className="text-xs font-bold text-slate-500 font-mono w-14 shrink-0">
                                            {settings?.watermarkTypingSpeed ?? 12} c/s
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Posizione Orizzontale</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                                        value={settings?.watermarkHAlign ?? 'rightaligned'}
                                        onChange={e => setSettings({...settings!, watermarkHAlign: e.target.value as any})}
                                    >
                                        <option value="leftaligned">A Sinistra</option>
                                        <option value="centeraligned">Al Centro</option>
                                        <option value="rightaligned">A Destra</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Posizione Verticale</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                                        value={settings?.watermarkVAlign ?? 'bottomalligned'}
                                        onChange={e => setSettings({...settings!, watermarkVAlign: e.target.value as any})}
                                    >
                                        <option value="topaligned">In Alto</option>
                                        <option value="centreallinement">Al Centro</option>
                                        <option value="bottomalligned">In Basso</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Anteprima Live Riquadro 9:16 Simulata */}
                        <div className="space-y-2 flex flex-col items-center justify-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Simulatore Anteprima 9:16</span>
                            <div className="relative aspect-[9/16] h-[250px] bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex items-center justify-center">
                                <span className="absolute top-2 left-2 bg-slate-800/80 text-[7px] font-bold text-slate-300 uppercase px-1.5 py-0.5 rounded leading-normal select-none pointer-events-none z-10">
                                    Simulatore Video
                                </span>
                                <div className="absolute inset-0 bg-cover bg-center opacity-25 select-none pointer-events-none" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1516280440614-37939bbacd6a?auto=format&fit=crop&q=80&w=600')" }}></div>
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none leading-none flex items-end justify-center pb-8">
                                    <span className="text-[8px] font-bold text-slate-700 uppercase tracking-widest select-none">CiaoStar Player</span>
                                </div>
                                <WatermarkLivePreview settings={settings} />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button disabled={saving} className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all cursor-pointer">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Configurazione Filigrana'}
                        </button>
                    </div>
                </form>

                {/* DOMAIN & STRIPE */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-2 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-emerald-500" /> Dominio & Stripe
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Configura il dominio di produzione della piattaforma e l'account Stripe per la gestione dei pagamenti e dei payout alle Star.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Nome Dominio App</label>
                            <input 
                                type="text" 
                                placeholder="es. www.ciaostar.it"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.domainName ?? ''}
                                onChange={e => setSettings({...settings!, domainName: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Stripe Connected Account ID</label>
                            <input 
                                type="text" 
                                placeholder="es. acct_1234567890"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.stripeAccountId ?? ''}
                                onChange={e => setSettings({...settings!, stripeAccountId: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Stripe Publishable Key</label>
                            <input 
                                type="text" 
                                placeholder="es. pk_live_..."
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.stripePublishableKey ?? ''}
                                onChange={e => setSettings({...settings!, stripePublishableKey: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Stripe Secret Key</label>
                            <input 
                                type="password" 
                                placeholder="• • • • • • • • • • • •"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.stripeSecretKey ?? ''}
                                onChange={e => setSettings({...settings!, stripeSecretKey: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1.5">Stripe Webhook Secret</label>
                            <input 
                                type="password" 
                                placeholder="• • • • • • • • • • • •"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.stripeWebhookSecret ?? ''}
                                onChange={e => setSettings({...settings!, stripeWebhookSecret: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button disabled={saving} className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Dominio & Stripe'}
                        </button>
                    </div>
                </form>

                {/* FIREBASE CONFIGURATION */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-2 flex items-center gap-2">
                        <Database className="w-5 h-5 text-orange-500" /> Integrazione Firebase
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Configura il database Firestore e i servizi Auth per questo ambiente duplicato/distribuito della Web App.
                    </p>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Firebase Project ID</label>
                            <input 
                                type="text" 
                                placeholder="es. ciaostar-prodok"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.firebaseProjectId ?? ''}
                                onChange={e => setSettings({...settings!, firebaseProjectId: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Firebase API Key</label>
                            <input 
                                type="password" 
                                placeholder="• • • • • • • • • • • •"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.firebaseApiKey ?? ''}
                                onChange={e => setSettings({...settings!, firebaseApiKey: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Auth Domain</label>
                            <input 
                                type="text" 
                                placeholder="es. ciaostar-prodok.firebaseapp.com"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.firebaseAuthDomain ?? ''}
                                onChange={e => setSettings({...settings!, firebaseAuthDomain: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Storage Bucket</label>
                            <input 
                                type="text" 
                                placeholder="es. ciaostar-prodok.appspot.com"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.firebaseStorageBucket ?? ''}
                                onChange={e => setSettings({...settings!, firebaseStorageBucket: e.target.value})}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Messaging Sender ID</label>
                                <input 
                                    type="text" 
                                    placeholder="1234567890"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.firebaseMessagingSenderId ?? ''}
                                    onChange={e => setSettings({...settings!, firebaseMessagingSenderId: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">App ID</label>
                                <input 
                                    type="text" 
                                    placeholder="1:123456:web:abcd"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.firebaseAppId ?? ''}
                                    onChange={e => setSettings({...settings!, firebaseAppId: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button disabled={saving} className="w-full bg-slate-900 hover:bg-black text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Firebase Config'}
                        </button>
                    </div>
                </form>

                {/* EMAIL CONFIGURATION */}
                <form onSubmit={handleSaveEmail} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-2 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-purple-500" /> Impostazioni Email
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Configura le credenziali di mittente e API/SMTP per l'invio delle notifiche via email quando l'ordine viene pagato o completato.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Email del Mittente (senderEmail)</label>
                            <input 
                                type="email" 
                                placeholder="es. info@ciaostar.it"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={emailSettings.senderEmail}
                                onChange={e => setEmailSettings({...emailSettings, senderEmail: e.target.value})}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nome del Mittente (senderName)</label>
                            <input 
                                type="text" 
                                placeholder="es. Team CiaoStar"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={emailSettings.senderName}
                                onChange={e => setEmailSettings({...emailSettings, senderName: e.target.value})}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Brevo API Key (Opzionale / apiKey)</label>
                            <input 
                                type="password" 
                                placeholder="• • • • • • • • • • • •"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={emailSettings.apiKey}
                                onChange={e => setEmailSettings({...emailSettings, apiKey: e.target.value})}
                            />
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-3">Configurazione SMTP Fallback (Nodemailer)</h3>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">SMTP Host</label>
                                    <input 
                                        type="text" 
                                        placeholder="smtp.brevo.com"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs font-bold focus:outline-none focus:border-indigo-500"
                                        value={smtpHost}
                                        onChange={e => setSmtpHost(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">SMTP Port</label>
                                    <input 
                                        type="number" 
                                        placeholder="587"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs font-bold focus:outline-none focus:border-indigo-500"
                                        value={smtpPort}
                                        onChange={e => setSmtpPort(Number(e.target.value))}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">SMTP Username</label>
                                    <input 
                                        type="text" 
                                        placeholder="user@example.com"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs font-bold focus:outline-none focus:border-indigo-500"
                                        value={smtpUser}
                                        onChange={e => setSmtpUser(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">SMTP Password</label>
                                    <input 
                                        type="password" 
                                        placeholder="• • • • • • • • • • • •"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2 text-xs font-bold focus:outline-none focus:border-indigo-500"
                                        value={smtpPass}
                                        onChange={e => setSmtpPass(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button disabled={emailSaving} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl hover:shadow-purple-200 transition-all cursor-pointer">
                            {emailSaving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Impostazioni Email'}
                        </button>
                    </div>
                </form>

                {/* BRANDING & TRACKER CONFIGURATION */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-2 flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-indigo-500" /> Branding & Tracker
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Personalizza l'aspetto visivo ed inserisci i codici di tracciamento marketing e analytics (no-code).
                    </p>

                    <div className="space-y-4">
                        {/* 1. Logo Principale */}
                        <div className="border border-slate-100 p-4 rounded-2xl bg-slate-50/50 space-y-2">
                            <label className="block text-[10px] font-black text-slate-500 uppercase">Logo Principale (Navbar & Footer)</label>
                            {settings?.logoUrl ? (
                                <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                                    <img src={settings.logoUrl} alt="Logo" className="h-8 max-w-[120px] object-contain" referrerPolicy="no-referrer" />
                                    <button type="button" onClick={() => handleBrandingDelete('logo')} className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer">
                                        <Trash2 className="w-3.5 h-3.5" /> Rimuovi
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl cursor-pointer text-xs font-bold transition-all">
                                        <Upload className="w-4 h-4" />
                                        {logoUploading ? 'Caricamento...' : 'Carica LogoPrincipale'}
                                        <input type="file" accept="image/*" className="hidden" onChange={e => handleBrandingUpload(e, 'logo')} disabled={logoUploading} />
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* 2. Favicon */}
                        <div className="border border-slate-100 p-4 rounded-2xl bg-slate-50/50 space-y-2">
                            <label className="block text-[10px] font-black text-slate-500 uppercase">Favicon (.ico o .png quadrato)</label>
                            {settings?.faviconUrl ? (
                                <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                                    <img src={settings.faviconUrl} alt="Favicon" className="h-6 w-6 object-contain" referrerPolicy="no-referrer" />
                                    <button type="button" onClick={() => handleBrandingDelete('favicon')} className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer">
                                        <Trash2 className="w-3.5 h-3.5" /> Rimuovi
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl cursor-pointer text-xs font-bold transition-all">
                                        <Upload className="w-4 h-4" />
                                        {faviconUploading ? 'Caricamento...' : 'Carica Favicon'}
                                        <input type="file" accept="image/*" className="hidden" onChange={e => handleBrandingUpload(e, 'favicon')} disabled={faviconUploading} />
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* 3. Logo Email */}
                        <div className="border border-slate-100 p-4 rounded-2xl bg-slate-50/50 space-y-2">
                            <label className="block text-[10px] font-black text-slate-500 uppercase">Logo per Email Template</label>
                            {settings?.emailLogoUrl ? (
                                <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                                    <img src={settings.emailLogoUrl} alt="Email Logo" className="h-8 max-w-[120px] object-contain" referrerPolicy="no-referrer" />
                                    <button type="button" onClick={() => handleBrandingDelete('emailLogo')} className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer">
                                        <Trash2 className="w-3.5 h-3.5" /> Rimuovi
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl cursor-pointer text-xs font-bold transition-all">
                                        <Upload className="w-4 h-4" />
                                        {emailLogoUploading ? 'Caricamento...' : 'Carica Logo Email'}
                                        <input type="file" accept="image/*" className="hidden" onChange={e => handleBrandingUpload(e, 'emailLogo')} disabled={emailLogoUploading} />
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* Trackers */}
                        <div className="pt-2 border-t border-slate-100 space-y-3">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Google Analytics Measurement ID</label>
                                <input 
                                    type="text" 
                                    placeholder="es. G-XXXXXX"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.googleAnalyticsId ?? ''}
                                    onChange={e => setSettings({...settings!, googleAnalyticsId: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Facebook Pixel ID</label>
                                <input 
                                    type="text" 
                                    placeholder="es. 1234567890"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.facebookPixelId ?? ''}
                                    onChange={e => setSettings({...settings!, facebookPixelId: e.target.value})}
                                />
                            </div>
                        </div>

                        {/* Social Platform Links */}
                        <div className="pt-4 border-t border-slate-100 space-y-3 text-left">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Social Link della Piattaforma (Footer)</label>
                            <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">Inserisci URL completi per i canali social. Lascia vuoto per non visualizzare l'icona.</p>
                            {[0, 1, 2, 3, 4].map(idx => (
                                <input 
                                    key={idx}
                                    type="text" 
                                    placeholder={`Social Link #${idx + 1} (es. https://instagram.com/ciaostar)`}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.socialLinks?.[idx] ?? ''}
                                    onChange={e => {
                                        const arr = [...(settings?.socialLinks || [])];
                                        while (arr.length <= idx) arr.push('');
                                        arr[idx] = e.target.value;
                                        setSettings({...settings!, socialLinks: arr});
                                    }}
                                />
                            ))}
                        </div>

                        {/* Milestones & Abandoned Cart Settings */}
                        <div className="pt-4 border-t border-slate-100 space-y-4 text-left">
                            <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest">Contatori, Soglie e Carrello</h3>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Traguardi Alert Visualizzazioni (Milestones dei Talenti, separati da virgole)</label>
                                <input 
                                    type="text" 
                                    placeholder="es. 10, 100, 1000, 5000"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.viewMilestones?.join(', ') ?? '10, 100, 1000, 5000'}
                                    onChange={e => {
                                        const nums = e.target.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
                                        setSettings({...settings!, viewMilestones: nums});
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Scadenza Carrello Abbandonato (Ore di memoria di sessione legale)</label>
                                <input 
                                    type="number" 
                                    placeholder="es. 48"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.cartExpiryHours ?? 48}
                                    onChange={e => setSettings({...settings!, cartExpiryHours: Number(e.target.value) || 48})}
                                // />
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Prefisso Slug Personali Star (default: "talent")</label>
                                <input 
                                    type="text" 
                                    placeholder="es. talent, star, celeb, vip"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                    value={settings?.talentSlugPrefix ?? 'talent'}
                                    onChange={e => setSettings({...settings!, talentSlugPrefix: e.target.value.trim().toLowerCase() || 'talent'})}
                                />
                                <p className="text-[9px] text-slate-400 font-semibold leading-relaxed mt-1">
                                    Modifica l'alberatura degli URL dinamici per i profili delle Star (es. /talent/rossi diventerebbe /star/rossi se imposti "star").
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all cursor-pointer">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Branding & Trackers'}
                        </button>
                    </div>
                </form>

                {/* SEO AVANZATO & USER-FRIENDLY */}
                <form onSubmit={handleSave} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-black text-slate-900 uppercase mb-2 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-emerald-500" /> Ottimizzazione SEO & Social
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                        Gestisci titoli, descrizioni e l'indicizzazione automatica dei motori di ricerca per massimizzare la visibilità biologica di CiaoStar.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Titolo Primario del Sito (seoDefaultTitle)</label>
                            <input 
                                type="text" 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.seoDefaultTitle ?? ''}
                                onChange={e => setSettings({...settings!, seoDefaultTitle: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Meta Descrizione Globale (seoDefaultDescription)</label>
                            <textarea 
                                rows={3}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.seoDefaultDescription ?? ''}
                                onChange={e => setSettings({...settings!, seoDefaultDescription: e.target.value})}
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Social Preview Image URL (Open Graph / seoOgImage)</label>
                            <input 
                                type="text" 
                                placeholder="https://firebasestorage.googleapis.com/..."
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-indigo-500 transition-colors"
                                value={settings?.seoOgImage ?? ''}
                                onChange={e => setSettings({...settings!, seoOgImage: e.target.value})}
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between bg-emerald-50/20 p-4 rounded-xl border border-emerald-100/50">
                            <div>
                                <label className="block text-[11px] font-black text-slate-800 uppercase">Indicizza Pagine Star</label>
                                <p className="text-[10px] text-slate-400 leading-normal max-w-xs font-medium">Permetti o blocca l'indicizzazione robotica automatica sui motori di ricerca per i singoli profili dei VIP.</p>
                            </div>
                            <input 
                                type="checkbox" 
                                className="h-5 w-5 pointer-events-auto border-slate-300 accent-emerald-500 cursor-pointer text-emerald-500 focus:ring-0 rounded"
                                checked={settings?.seoIndexTalents !== false}
                                onChange={e => setSettings({...settings!, seoIndexTalents: e.target.checked})}
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl transition-all cursor-pointer">
                            {saving ? <Loader2 className="animate-spin mx-auto"/> : 'Salva Impostazioni SEO'}
                        </button>
                    </div>
                </form>
            </div>

            {/* SEEDING AND DATABASE INITIALIZATION CARD */}
            <div className="mt-8 bg-white border border-slate-100 rounded-[32px] p-8 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2 text-left">
                        <h3 className="text-lg font-black text-slate-900 uppercase flex items-center gap-2">
                            <Database className="w-5 h-5 text-emerald-500" /> Inizializzazione Database & Seeding
                        </h3>
                        <p className="text-xs text-slate-400 font-semibold leading-relaxed max-w-xl">
                            Se l'applicazione è stata appena installata o si trova in uno stato vergine, clicca sul pulsante sottostante per pre-generare e configurare i documenti e le collezioni Firestore necessarie (impostazioni di pagamento, e-mail, parametri di default, categorie VIP). Questa operazione è sicura e non sovrascrive dati personalizzati già esistenti.
                        </p>
                    </div>
                    <button 
                        onClick={handleSeedDatabase}
                        disabled={seeding}
                        className="w-full md:w-auto shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {seeding ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Inizializzazione in corso...
                            </>
                        ) : (
                            <>
                                <Database className="w-4 h-4" />
                                Inizializza Sistema CiaoStar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;
