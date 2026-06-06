
import React, { useState, useEffect } from 'react';
import { VideoRequest, RequestStatus } from '../types';
import { getAllOrdersAdmin, resolveDispute, getTalents, callPartialRefundOrder } from '../services/dataService';
import { Loader2, AlertTriangle, Check, X, Play, Filter, CreditCard, Clock, Info, Download, Calendar, BarChart3, BookOpen } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';

const AdminOrders: React.FC = () => {
    const [orders, setOrders] = useState<VideoRequest[]>([]);
    const [talentMap, setTalentMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'DISPUTE'>('ALL');
    const [openHistoryOrderId, setOpenHistoryOrderId] = useState<string | null>(null);
    const [partialRefundState, setPartialRefundState] = useState<Record<string, string>>({});
    const [refundSaving, setRefundSaving] = useState<Record<string, boolean>>({});

    // Fiscal state
    const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear());
    const [fiscalPeriod, setFiscalPeriod] = useState<'ALL' | 'MONTHLY' | 'QUARTERLY'>('ALL');
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1 to 12
    const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor((new Date().getMonth() + 3) / 3)); // 1 to 4

    const getFiscalOrders = () => {
        return orders.filter(order => {
            // Include paid/completed orders or disputes and refunds
            const isPaid = order.status !== RequestStatus.PENDING && 
                           order.status !== RequestStatus.PENDING_PAYMENT && 
                           order.status !== RequestStatus.CANCELED && 
                           order.status !== RequestStatus.CANCELED_BY_FAN && 
                           order.status !== RequestStatus.REJECTED && 
                           order.status !== RequestStatus.EXPIRED;
            if (!isPaid) return false;

            const date = new Date(order.createdAt);
            if (date.getFullYear() !== fiscalYear) return false;

            if (fiscalPeriod === 'MONTHLY') {
                return (date.getMonth() + 1) === selectedMonth;
            }
            if (fiscalPeriod === 'QUARTERLY') {
                const quarter = Math.floor((date.getMonth() + 3) / 3);
                return quarter === selectedQuarter;
            }
            return true;
        });
    };

    const fiscalOrders = getFiscalOrders();

    // Aggregated figures
    const totalFanTransacted = fiscalOrders.reduce((sum, o) => {
        if (o.status === RequestStatus.REFUNDED) return sum; // Rimborsi gestiti a parte nell'export
        return sum + (o.pricePaid || 0);
    }, 0);

    const platformFeeRate = 0.20;
    const totalCommissionGross = totalFanTransacted * platformFeeRate;
    const totalCommissionNetImponibile = totalCommissionGross / 1.22;
    const totalCommissionIva = totalCommissionGross - totalCommissionNetImponibile;
    const totalTalentPayout = totalFanTransacted * 0.80;

    const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "\uFEFF"; // BOM for Excel UTF-8 representation
        csvContent += headers.join(";") + "\n";
        
        rows.forEach(row => {
            const formattedRow = row.map(val => {
                if (typeof val === 'string') {
                    return `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            });
            csvContent += formattedRow.join(";") + "\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportCorrispettivi = () => {
        const headers = ["ID Transazione", "Data", "Fan", "Talento", "Stato Video", "Totale Incassato Lordo (EUR)"];
        const rows = fiscalOrders.map(o => [
            o.id,
            new Date(o.createdAt).toLocaleDateString('it-IT'),
            o.fanName || 'Fan CiaoStar',
            o.talentName || talentMap[o.talentId] || 'VIP Star',
            o.status,
            o.status === RequestStatus.REFUNDED ? -o.pricePaid : o.pricePaid
        ]);
        downloadCSV(`registro_corrispettivi_${fiscalYear}_periodo.csv`, headers, rows);
    };

    const exportCommissioni = () => {
        const headers = ["ID Transazione", "Data", "Lordo Transazione (EUR)", "Commissione Lorda (20%) (EUR)", "Quota Imponibile Netta (EUR)", "IVA Scissa (22%) (EUR)"];
        const rows = fiscalOrders.map(o => {
            const price = o.status === RequestStatus.REFUNDED ? 0 : (o.pricePaid || 0);
            const grossFee = price * 0.20;
            const netImponibile = grossFee / 1.22;
            const ivaValue = grossFee - netImponibile;
            return [
                o.id,
                new Date(o.createdAt).toLocaleDateString('it-IT'),
                price,
                grossFee.toFixed(2),
                netImponibile.toFixed(2),
                ivaValue.toFixed(2)
            ];
        });
        downloadCSV(`registro_commissioni_${fiscalYear}_periodo.csv`, headers, rows);
    };

    const exportCompensi = () => {
        const headers = ["ID Transazione", "Data", "Star Beneficiario", "Stripe Connect Account Type", "Quota Spettante Star (80%) (EUR)", "Riferimento Fiscale"];
        const rows = fiscalOrders.map(o => {
            const price = o.status === RequestStatus.REFUNDED ? 0 : (o.pricePaid || 0);
            const payout = price * 0.80;
            return [
                o.id,
                new Date(o.createdAt).toLocaleDateString('it-IT'),
                o.talentName || talentMap[o.talentId] || 'VIP Star',
                o.stripePaymentIntentId ? 'Metodo Connect automatico' : 'Diretto',
                payout.toFixed(2),
                "Persona Fisica (Cessione Diritti d'Autore - No IVA)"
            ];
        });
        downloadCSV(`registro_compensi_${fiscalYear}_payout.csv`, headers, rows);
    };

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

    const handlePartialRefund = async (orderId: string, maxAmount: number) => {
        const amtStr = partialRefundState[orderId];
        if (!amtStr) {
            alert("Inserisci un importo valido per il rimborso parziale.");
            return;
        }
        const amt = parseFloat(amtStr);
        if (isNaN(amt) || amt <= 0 || amt > maxAmount) {
            alert(`L'importo inserito (€${amtStr}) non è valido. Deve essere compreso tra €0.01 e €${maxAmount.toFixed(2)}.`);
            return;
        }

        if (!confirm(`Sei sicuro di voler effettuare un rimborso parziale di €${amt.toFixed(2)} per l'ordine #${orderId}?`)) {
            return;
        }

        setRefundSaving(prev => ({ ...prev, [orderId]: true }));
        try {
            const res = await callPartialRefundOrder(orderId, amt);
            if (res.success) {
                alert("Rimborso parziale eseguito con successo tramite stripe Connect!");
                setPartialRefundState(prev => ({ ...prev, [orderId]: '' }));
                load();
            } else {
                alert("Il rimborso parziale non ha avuto buon fine.");
            }
        } catch (err: any) {
            console.error(err);
            alert("Errore durante l'esecuzione del rimborso: " + (err.message || err));
        } finally {
            setRefundSaving(prev => ({ ...prev, [orderId]: false }));
        }
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

            {/* FISCAL MANAGEMENT & TAX EXPORTS (COMMERCIALISTA-FRIENDLY) */}
            <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm mb-10 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-50 pb-6">
                    <div className="space-y-1 text-left">
                        <h2 className="text-lg font-black text-slate-900 uppercase flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-indigo-600" /> Export Contabilità & Fiscalità
                        </h2>
                        <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                            Genera ed esporta i report contabili strutturati per i registri fiscali italiani (IVA 22% scissa, corrispettivi lordi e compensi star al 80%).
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Period selection */}
                    <div className="space-y-4 bg-slate-50/50 p-6 rounded-2xl border border-slate-100/50">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                            <Calendar className="w-4 h-4 text-slate-400" /> Seleziona Periodo Fiscale
                        </h3>

                        {/* Year */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Anno di riferimento</label>
                            <select 
                                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                value={fiscalYear}
                                onChange={e => setFiscalYear(Number(e.target.value))}
                            >
                                <option value={2026}>2026</option>
                                <option value={2025}>2025</option>
                                <option value={2024}>2024</option>
                            </select>
                        </div>

                        {/* Frequency */}
                        <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Frequenza</label>
                            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setFiscalPeriod('ALL')}
                                    className={`py-1.5 rounded text-[10px] font-black uppercase transition-all ${fiscalPeriod === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400'}`}
                                >
                                    Anno
                                </button>
                                <button
                                    onClick={() => setFiscalPeriod('MONTHLY')}
                                    className={`py-1.5 rounded text-[10px] font-black uppercase transition-all ${fiscalPeriod === 'MONTHLY' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400'}`}
                                >
                                    Mese
                                </button>
                                <button
                                    onClick={() => setFiscalPeriod('QUARTERLY')}
                                    className={`py-1.5 rounded text-[10px] font-black uppercase transition-all ${fiscalPeriod === 'QUARTERLY' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400'}`}
                                >
                                    Trimestre
                                </button>
                            </div>
                        </div>

                        {/* Contextual dropdowns */}
                        {fiscalPeriod === 'MONTHLY' && (
                            <div className="animate-in fade-in duration-200">
                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Seleziona Mese</label>
                                <select 
                                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:outline-none"
                                    value={selectedMonth}
                                    onChange={e => setSelectedMonth(Number(e.target.value))}
                                >
                                    {["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"].map((m, idx) => (
                                        <option key={idx} value={idx + 1}>{m}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {fiscalPeriod === 'QUARTERLY' && (
                            <div className="animate-in fade-in duration-200">
                                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Seleziona Trimestre</label>
                                <select 
                                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:outline-none"
                                    value={selectedQuarter}
                                    onChange={e => setSelectedQuarter(Number(e.target.value))}
                                >
                                    <option value={1}>Q1 (Gennaio - Marzo)</option>
                                    <option value={2}>Q2 (Aprile - Giugno)</option>
                                    <option value={3}>Q3 (Luglio - Settembre)</option>
                                    <option value={4}>Q4 (Ottobre - Dicembre)</option>
                                </select>
                            </div>
                        )}

                        <div className="pt-2">
                            <span className="text-[10px] font-mono text-slate-400 font-bold block bg-slate-100 rounded-lg p-2.5 text-center">
                                {fiscalOrders.length} transazioni trovate nel periodo
                            </span>
                        </div>
                    </div>

                    {/* Financial Dashboard Aggregations */}
                    <div className="lg:col-span-2 space-y-4">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <BarChart3 className="w-4 h-4 text-slate-400" /> Riepilogo Calcoli Fiscali Real-time
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Corrispettivi totali */}
                            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col justify-between">
                                <div>
                                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">1. Reg. Corrispettivi</span>
                                    <span className="text-xl font-black text-slate-900 block leading-tight">€{totalFanTransacted.toFixed(2)}</span>
                                </div>
                                <span className="text-[9px] text-slate-400 leading-normal mt-2 font-medium">Lordo transato totale pagato dai fan.</span>
                            </div>

                            {/* CiaoStar Commission */}
                            <div className="bg-indigo-50/30 border border-indigo-100/50 p-5 rounded-2xl flex flex-col justify-between">
                                <div>
                                    <span className="text-[9px] font-black text-indigo-500 uppercase block mb-1">2. Fatturato CiaoStar (20%)</span>
                                    <span className="text-xl font-black text-indigo-700 block leading-tight">€{totalCommissionGross.toFixed(2)}</span>
                                    <div className="mt-1 pt-1 border-t border-indigo-100/30 space-y-0.5 text-[9px] font-bold text-slate-500">
                                        <p>Imp: € {totalCommissionNetImponibile.toFixed(2)}</p>
                                        <p>IVA 22%: € {totalCommissionIva.toFixed(2)}</p>
                                    </div>
                                </div>
                                <span className="text-[9px] text-slate-400 leading-normal mt-2 font-medium">Commissioni trattenute dal brand con IVA al 22% scissa.</span>
                            </div>

                            {/* Compensi Talent */}
                            <div className="bg-emerald-50/20 border border-emerald-100/30 p-5 rounded-2xl flex flex-col justify-between">
                                <div>
                                    <span className="text-[9px] font-black text-emerald-600 uppercase block mb-1">3. Reg. Compensi Stars (80%)</span>
                                    <span className="text-xl font-black text-emerald-700 block leading-tight">€{totalTalentPayout.toFixed(2)}</span>
                                </div>
                                <span className="text-[9px] text-slate-400 leading-normal mt-2 font-medium">Quote totali spettanti ai VIP (trasferite via Connect).</span>
                            </div>
                        </div>

                        {/* Download Triggers */}
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                            <label className="block text-[9px] font-black text-slate-400 uppercase">Esporta Moduli per il Commercialista (.CSV Excel-Friendly)</label>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <button 
                                    onClick={exportCorrispettivi}
                                    disabled={fiscalOrders.length === 0}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 border border-slate-950 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-black transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="w-4 h-4" /> Esporta Corrispettivi
                                </button>
                                <button 
                                    onClick={exportCommissioni}
                                    disabled={fiscalOrders.length === 0}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 border border-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-indigo-700 transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="w-4 h-4" /> Esporta Commissioni
                                </button>
                                <button 
                                    onClick={exportCompensi}
                                    disabled={fiscalOrders.length === 0}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 border border-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-emerald-600 transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Download className="w-4 h-4" /> Esporta Compensi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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

                                {order.stripePaymentIntentId && ![RequestStatus.PENDING, RequestStatus.PENDING_PAYMENT, RequestStatus.REJECTED, RequestStatus.CANCELED, RequestStatus.CANCELED_BY_FAN].includes(order.status) && (
                                    <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider text-center mb-1 flex items-center justify-center gap-1">
                                            <CreditCard className="w-3.5 h-3.5 text-amber-500" /> Rimborso Parziale
                                        </p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                                <span>Già rimborsato:</span>
                                                <span className="text-slate-800">€{order.totalRefunded || 0}</span>
                                            </div>
                                            
                                            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-xs">
                                                <span className="text-[10px] text-slate-400 font-bold">€</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    placeholder="es. 10.00"
                                                    className="w-full bg-transparent text-xs font-bold focus:outline-none"
                                                    value={partialRefundState[order.id] || ''}
                                                    onChange={e => setPartialRefundState({...partialRefundState, [order.id]: e.target.value})}
                                                />
                                            </div>
                                            
                                            <button 
                                                onClick={() => handlePartialRefund(order.id, (order.pricePaid || 0) - (order.totalRefunded || 0))}
                                                disabled={refundSaving[order.id] || (order.totalRefunded || 0) >= (order.pricePaid || 0)}
                                                className="w-full bg-slate-900 hover:bg-black text-white py-2 rounded-lg text-[10px] font-black uppercase transition cursor-pointer disabled:opacity-40"
                                            >
                                                {refundSaving[order.id] ? <Loader2 className="animate-spin w-3.5 h-3.5 mx-auto" /> : 'Invia Rimborso Stripe'}
                                            </button>
                                        </div>
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
