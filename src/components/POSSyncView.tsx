
import React, { useState, useMemo } from 'react';
import { Transaction, ParkingConfig } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { posService } from '../services/posService';
import { plaza } from '../config/plaza';
import { 
    CheckCircle, XCircle, Clock, RefreshCw, Search, 
    Calendar, Filter, FileText, AlertCircle, ExternalLink,
    ChevronDown, ChevronUp, Loader2, Code, Bug, Send, Settings, Save
} from 'lucide-react';
import { getLocalDateString, formatLocalDate } from '../utils/parkingLogic';

interface POSSyncViewProps {
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    config: ParkingConfig;
}

export const POSSyncView: React.FC<POSSyncViewProps> = ({ transactions, setTransactions, config }) => {
    const [selectedDate, setSelectedDate] = useState(getLocalDateString());
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'success' | 'error' | 'pending'>('ALL');
    const [isRetrying, setIsRetrying] = useState<string | null>(null);
    const [expandedTx, setExpandedTx] = useState<string | null>(null);
    const [showJsonFor, setShowJsonFor] = useState<string | null>(null);
    const [showConfig, setShowConfig] = useState(false);
    const [localConfig, setLocalConfig] = useState<ParkingConfig>(config);

    const handleSaveConfig = async () => {
        try {
            await dataService.upsertRecord(TABLES.CONFIG, { ...localConfig, id: 'main' });
            alert('Configuración POS guardada correctamente. Reinicie la aplicación si es necesario.');
            setShowConfig(false);
        } catch (e: any) {
            alert('Error guardando configuración: ' + e.message);
        }
    };

    // Filter transactions: only PARKING type and for the selected date
    const filteredTx = useMemo(() => {
        return transactions.filter(tx => {
            const isParking = tx.type === 'PARKING' && tx.ticketId;
            const isDateMatch = tx.date === selectedDate;
            const isSearchMatch = searchQuery === '' || 
                tx.ticketId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tx.posFolio?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                tx.description?.toLowerCase().includes(searchQuery.toLowerCase());
            
            const actualStatus = tx.posFolio ? 'success' : tx.posSyncStatus;
            const isStatusMatch = statusFilter === 'ALL' || actualStatus === statusFilter;

            return isParking && isDateMatch && isSearchMatch && isStatusMatch;
        }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }, [transactions, selectedDate, searchQuery, statusFilter]);

    const stats = useMemo(() => {
        const parkingForDate = transactions.filter(tx => tx.type === 'PARKING' && tx.ticketId && tx.date === selectedDate);
        return {
            total: parkingForDate.length,
            success: parkingForDate.filter(tx => tx.posSyncStatus === 'success' || tx.posFolio).length,
            error: parkingForDate.filter(tx => tx.posSyncStatus === 'error' && !tx.posFolio).length,
            pending: parkingForDate.filter(tx => tx.posSyncStatus === 'pending' && !tx.posFolio).length,
            totalAmount: parkingForDate.reduce((sum, tx) => sum + (tx.posSyncStatus === 'success' || tx.posFolio ? tx.amount : 0), 0)
        };
    }, [transactions, selectedDate]);

    // Helper to generate EXACT payload as in ParkingSystem
    const generatePayload = (tx: Transaction) => {
        return posService.buildParkingSale(tx, config);
    };

    const handleRetrySync = async (tx: Transaction) => {
        setIsRetrying(tx.id);
        try {
            const payload = generatePayload(tx);
            console.log("RETRY PAYLOAD:", JSON.stringify(payload, null, 2));

            const response = await posService.submitSale(payload);
            
            const updatedTx = {
                ...tx,
                posSyncStatus: 'success' as const,
                posFolio: response.folio,
                posSyncMessage: undefined
            };

            await dataService.upsertRecord(TABLES.TRANSACTIONS, updatedTx);
            setTransactions(prev => prev.map(t => t.id === tx.id ? updatedTx : t));
            alert(`Sincronización exitosa. Folio: ${response.folio}`);
        } catch (error: any) {
            console.error("Retry Error:", error);
            const errorTx = {
                ...tx,
                posSyncStatus: 'error' as const,
                posSyncMessage: error.message || 'Error en reintento'
            };
            await dataService.upsertRecord(TABLES.TRANSACTIONS, errorTx);
            setTransactions(prev => prev.map(t => t.id === tx.id ? errorTx : t));
            alert(`Fallo en reintento: ${error.message}`);
        } finally {
            setIsRetrying(null);
        }
    };

    if (!posService.enabled) return (
      <section className="rounded-2xl bg-amber-50 border border-amber-200 p-8 text-amber-950">
        <h2 className="text-xl font-bold mb-3">Integración POS deshabilitada</h2>
        <p>Los cobros y tickets de estacionamiento siguen registrándose en {plaza.name}. Para reflejarlos en un POS/ERP externo, configura <code>pos.adapter</code> en <code>plaza.config.json</code> (ver docs/POS.md).</p>
      </section>
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Stats */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
                        <RefreshCw className="text-blue-600" /> Sincronización POS
                    </h3>
                    <p className="text-slate-500 font-medium text-sm">Control de tickets individuales por día · adaptador <span className="font-mono">{posService.adapter.id}</span></p>
                </div>
                
                <div className="flex gap-4 items-center">
                    <button 
                        onClick={() => setShowConfig(!showConfig)}
                        className={`p-2.5 rounded-xl border transition-all ${showConfig ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`}
                        title="Configuración POS"
                    >
                        <Settings size={16} />
                    </button>
                    <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-2 shadow-sm">
                        <Calendar size={16} className="text-slate-400" />
                        <input 
                            type="date" 
                            className="text-sm font-bold text-slate-700 outline-none" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                </div>
            </header>

            {/* POS Config Modal */}
            {showConfig && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
                    <div className="bg-slate-900 rounded-3xl p-8 shadow-2xl animate-fade-in-up text-white space-y-6 w-full max-w-2xl border border-slate-700 relative">
                        <button onClick={() => setShowConfig(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors">
                            <XCircle size={24} />
                        </button>
                        <div className="flex justify-between items-start border-b border-slate-800 pb-4">
                            <div>
                                <h4 className="text-xl font-black flex items-center gap-2"><Settings size={20} className="text-blue-500"/> Configuración de Conexión POS</h4>
                                <p className="text-xs text-slate-400 mt-2 max-w-md">Identificadores que el adaptador POS envía con cada venta. Por defecto se toman de plaza.config (pos.terminalId / pos.branchId).</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Terminal / Caja</label>
                                <input type="text" className="w-full bg-slate-800 border-2 border-slate-700 p-4 rounded-xl font-mono text-sm focus:border-blue-500 outline-none transition-all" placeholder={plaza.pos.terminalId} value={localConfig.posTerminalId || ''} onChange={e => setLocalConfig({...localConfig, posTerminalId: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sucursal</label>
                                <input type="text" className="w-full bg-slate-800 border-2 border-slate-700 p-4 rounded-xl font-mono text-sm focus:border-blue-500 outline-none transition-all" placeholder={plaza.pos.branchId} value={localConfig.posBranchId || ''} onChange={e => setLocalConfig({...localConfig, posBranchId: e.target.value})} />
                            </div>
                        </div>
                        <button onClick={handleSaveConfig} className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-4 shadow-xl">
                            <Save size={18} /> Guardar Configuración
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Hoy</p>
                    <p className="text-3xl font-black text-slate-800">{stats.total}</p>
                </div>
                <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Exitosos</p>
                    <p className="text-3xl font-black text-emerald-700">{stats.success}</p>
                </div>
                <div className="bg-red-50 p-5 rounded-2xl border border-red-100 shadow-sm">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Fallidos</p>
                    <p className="text-3xl font-black text-red-700">{stats.error}</p>
                </div>
                <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 shadow-sm">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Monto Sinc.</p>
                    <p className="text-2xl font-black text-blue-700">${stats.totalAmount.toLocaleString()}</p>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-400 transition-all"
                        placeholder="Buscar por ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-auto">
                    <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 font-bold text-sm text-slate-700 outline-none focus:border-blue-400" 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                        <option value="ALL">Todos los Estados</option>
                        <option value="success">Exitosos</option>
                        <option value="error">Con Error</option>
                        <option value="pending">Pendientes</option>
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">Estado</th>
                                <th className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">Ticket / Hora</th>
                                <th className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">Folio POS</th>
                                <th className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">Monto</th>
                                <th className="p-5 font-black text-slate-400 uppercase text-[10px] tracking-widest text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredTx.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-slate-400 italic font-medium">
                                        No se encontraron movimientos para los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filteredTx.map(tx => (
                                    <React.Fragment key={tx.id}>
                                        <tr className={`hover:bg-slate-50 transition-colors ${expandedTx === tx.id ? 'bg-slate-50' : ''}`}>
                                            <td className="p-5 line-clamp-1" onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}>
                                                {tx.posFolio ? (
                                                    <span className="flex items-center gap-2 text-emerald-600 font-black text-xs">
                                                        <CheckCircle size={16} /> ÉXITO
                                                    </span>
                                                ) : tx.posSyncStatus === 'error' ? (
                                                    <span className="flex items-center gap-2 text-red-600 font-black text-xs">
                                                        <XCircle size={16} /> FALLO
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-2 text-amber-500 font-black text-xs">
                                                        <Clock size={16} /> PENDIENTE
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-5" onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}>
                                                <div className="font-black text-slate-800">{tx.ticketId}</div>
                                                <div className="text-[10px] text-slate-400 font-bold">{tx.created_at ? new Date(tx.created_at).toLocaleTimeString() : '---'}</div>
                                            </td>
                                            <td className="p-5" onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}>
                                                {tx.posFolio ? (
                                                    <span className="font-mono bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-100 uppercase">{tx.posFolio}</span>
                                                ) : (
                                                    <span className="text-slate-300 font-medium italic">Sin folio</span>
                                                )}
                                            </td>
                                            <td className="p-5 font-black text-slate-700" onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}>
                                                ${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setShowJsonFor(showJsonFor === tx.id ? null : tx.id); }}
                                                        className={`p-2 rounded-lg transition-all ${showJsonFor === tx.id ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
                                                        title="Ver JSON de la API"
                                                    >
                                                        <Bug size={16} />
                                                    </button>
                                                    {!tx.posFolio && (
                                                        <button 
                                                            disabled={isRetrying === tx.id}
                                                            onClick={(e) => { e.stopPropagation(); handleRetrySync(tx); }}
                                                            className={`p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all flex items-center gap-1 text-[10px] font-black uppercase ${isRetrying === tx.id ? 'opacity-50' : ''}`}
                                                        >
                                                            {isRetrying === tx.id ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                                                            Reintentar
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                                                        className="p-2 text-slate-400 hover:text-slate-600"
                                                    >
                                                        {expandedTx === tx.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Expanded System Info */}
                                        {expandedTx === tx.id && (
                                            <tr>
                                                <td colSpan={5} className="bg-slate-50/50 p-6 border-t border-slate-100">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div className="space-y-3">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalles de la Transacción</p>
                                                            <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-2">
                                                                <div className="flex justify-between text-xs font-bold text-slate-600"><span>Método:</span> <span>{tx.paymentMethod}</span></div>
                                                                <div className="flex justify-between text-xs font-bold text-slate-600"><span>Registrado por:</span> <span>{tx.registeredBy}</span></div>
                                                                <div className="flex justify-between text-xs font-bold text-slate-600"><span>Descripción:</span> <span className="text-right">{tx.description}</span></div>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-red-500">Error del Servidor POS</p>
                                                            <div className={`p-4 rounded-2xl border min-h-[80px] flex items-start gap-3 ${tx.posSyncMessage ? 'bg-red-50 border-red-100 text-red-700' : 'bg-slate-50 border-slate-100 text-slate-400 font-italic'}`}>
                                                                <AlertCircle size={18} className={tx.posSyncMessage ? 'text-red-500 mt-0.5' : 'hidden'} />
                                                                <span className="text-xs font-bold leading-relaxed">
                                                                    {tx.posSyncMessage || 'No se registraron errores técnicos.'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        {/* JSON Debug View */}
                                        {showJsonFor === tx.id && (
                                            <tr>
                                                <td colSpan={5} className="bg-slate-900 p-6 border-t border-slate-800">
                                                    <div className="space-y-3">
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                                                                <Code size={12} /> Cuerpo de la Petición (JSON API)
                                                            </p>
                                                            <span className="text-[9px] text-slate-500 font-mono">POST /newCounterSale</span>
                                                        </div>
                                                        <div className="bg-black/50 p-4 rounded-xl border border-slate-700">
                                                            <pre className="text-[11px] text-blue-300 font-mono overflow-auto max-h-[400px]">
                                                                {JSON.stringify(generatePayload(tx), null, 2)}
                                                            </pre>
                                                        </div>
                                                        <p className="text-[9px] text-slate-500 italic">
                                                            * Este es el JSON genérico (PosSale) que el adaptador enviaría si presionas "Reintentar".
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
