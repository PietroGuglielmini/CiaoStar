import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { User, UserRole } from '../types';
import { getAdminSettings, uploadWatermark, deleteWatermark } from '../services/dataService';
import { Upload, Trash2, ArrowLeft, Image as ImageIcon, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AdminWatermarkProps {
    user: User;
}

const AdminWatermark: React.FC<AdminWatermarkProps> = ({ user }) => {
    const navigate = useNavigate();
    const [currentWatermark, setCurrentWatermark] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const settings = await getAdminSettings();
            setCurrentWatermark(settings.watermarkUrl || null);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!file.type.startsWith('image/')) {
                toast.error("Per favore seleziona un file immagine (PNG, JPG).");
                return;
            }
            if (file.size > 500 * 1024) {
                toast.error("Il file è troppo grande. Max 500KB per garantire prestazioni ottimali.");
                return;
            }
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;
        setUploading(true);
        try {
            const url = await uploadWatermark(selectedFile);
            setCurrentWatermark(url);
            setSelectedFile(null);
            setPreviewUrl(null);
            toast.success("Filigrana salvata con successo!");
        } catch (e: any) {
            console.error(e);
            toast.error(`Errore: ${e.message || "Caricamento fallito"}`);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Sei sicuro di voler eliminare la filigrana corrente?")) return;
        setUploading(true);
        try {
            await deleteWatermark();
            setCurrentWatermark(null);
            toast.success("Filigrana eliminata.");
        } catch (e) {
            console.error(e);
            toast.error("Errore durante l'eliminazione.");
        } finally {
            setUploading(false);
        }
    };

    const isLegacy = currentWatermark && currentWatermark.startsWith('http');

    if (user.role !== UserRole.ADMIN) {
        return <div className="p-10 text-center">Accesso Negato.</div>;
    }

    if (loading) {
        return <div className="flex justify-center p-20"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="max-w-4xl mx-auto px-4 py-10">
            <button 
                onClick={() => navigate('/admin')} 
                className="flex items-center text-gray-500 hover:text-slate-900 mb-6 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-1" /> Torna alla Dashboard
            </button>

            <div className="flex items-center mb-8">
                <div className="bg-slate-900 p-3 rounded-xl text-white mr-4 shadow-lg">
                    <ImageIcon className="w-8 h-8" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Gestione Filigrana</h1>
                    <p className="text-gray-500">Gestisci il logo sovraimpresso sui video.</p>
                </div>
            </div>

            {isLegacy && (
                 <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-lg">
                    <div className="flex">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        <div className="ml-3">
                            <h3 className="text-sm font-bold text-red-800">Aggiornamento Richiesto</h3>
                            <div className="mt-2 text-sm text-red-700">
                                <p>
                                    La filigrana attuale utilizza un formato URL obsoleto che causa errori nei browser moderni (CORS).
                                    Il sistema ha disabilitato temporaneamente la filigrana sui video.
                                </p>
                                <p className="mt-2 font-bold underline">
                                    Per favore carica una nuova immagine qui sotto per risolvere il problema.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Sezione Anteprima Corrente */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center justify-between">
                        Filigrana Attiva
                        {currentWatermark ? (
                            <span className={`text-xs px-2 py-1 rounded-full flex items-center ${isLegacy ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-700'}`}>
                                <CheckCircle className="w-3 h-3 mr-1" /> {isLegacy ? 'Obsoleta (Legacy)' : 'Attiva (Sicura)'}
                            </span>
                        ) : (
                            <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded-full">
                                Nessuna
                            </span>
                        )}
                    </h2>

                    <div className="aspect-video bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border border-dashed border-gray-300 relative mb-6">
                        {currentWatermark ? (
                            <img src={currentWatermark} alt="Watermark" className="max-h-full max-w-full object-contain" />
                        ) : (
                            <div className="text-center text-gray-400">
                                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Nessuna filigrana caricata</p>
                            </div>
                        )}
                        {/* Overlay simulato video */}
                        <div className="absolute inset-0 pointer-events-none flex items-end justify-end p-4 opacity-30">
                            <div className="bg-black/50 text-white text-xs px-2 py-1 rounded">Video Preview</div>
                        </div>
                    </div>

                    {currentWatermark && (
                        <button 
                            onClick={handleDelete}
                            disabled={uploading}
                            className="w-full border border-red-200 text-red-600 hover:bg-red-50 py-3 rounded-xl font-bold flex items-center justify-center transition-colors"
                        >
                            {uploading ? <Loader2 className="animate-spin w-4 h-4" /> : <Trash2 className="w-4 h-4 mr-2" />}
                            Elimina Filigrana
                        </button>
                    )}
                </div>

                {/* Sezione Upload */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Carica Nuova / Sostituisci</h2>
                    <p className="text-sm text-gray-500 mb-6">
                        Carica un file PNG con sfondo trasparente per ottenere i migliori risultati. <br/>
                        <strong>Max 500KB.</strong> L'immagine verrà salvata direttamente nel database per evitare errori di sicurezza.
                    </p>

                    {!selectedFile ? (
                        <label className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-slate-500 hover:bg-gray-50 transition-all group h-64">
                            <div className="bg-slate-100 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                                <Upload className="w-8 h-8 text-slate-500" />
                            </div>
                            <span className="font-bold text-slate-700">Clicca per selezionare</span>
                            <span className="text-xs text-gray-400 mt-2">PNG raccomandato (Max 500KB)</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        </label>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="flex-1 bg-gray-50 rounded-xl p-4 flex items-center justify-center mb-6 relative border border-gray-200">
                                <img src={previewUrl!} alt="Preview" className="max-h-48 object-contain" />
                                <button 
                                    onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                                    className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-md hover:text-red-600 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            <button 
                                onClick={handleUpload}
                                disabled={uploading}
                                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-black shadow-lg transform hover:-translate-y-0.5 transition-all flex items-center justify-center disabled:opacity-50 disabled:transform-none"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="animate-spin w-5 h-5 mr-2" /> Salvataggio...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5 mr-2" /> Salva Filigrana
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminWatermark;