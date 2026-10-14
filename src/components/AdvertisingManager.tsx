import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdSpace, Transaction, User } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { getLocalDateString, formatLocalDate } from '../utils/parkingLogic';
import { DocumentPreviewButton } from './ui/DocumentPreview';
import {
    Megaphone, Plus, Save, Trash2, Edit2, ExternalLink, FileText,
    MapPin, Ruler, DollarSign, Phone, Calendar, Eye, X, Upload,
    CheckCircle, AlertCircle, Clock, MessageCircle, ChevronDown, ChevronUp, Grid3X3,
    Loader2
} from 'lucide-react';
import { plaza } from '../config/plaza';

interface AdvertisingManagerProps {
    adSpaces: AdSpace[];
    setAdSpaces: React.Dispatch<React.SetStateAction<AdSpace[]>>;
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    currentUser: User;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    available: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Disponible' },
    rented: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Rentado' },
    expired: { bg: 'bg-red-100', text: 'text-red-700', label: 'Vencido' }
};

const PAY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Pagado' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pendiente' },
    late: { bg: 'bg-red-100', text: 'text-red-700', label: 'Atrasado' }
};

const emptySpace: Partial<AdSpace> = {
    name: '', location: '', dimensions: '', amount: 0,
    status: 'available', lesseeName: '', lesseePhone: '',
    startDate: '', endDate: '', rentalPeriod: '', notes: ''
};

export const AdvertisingManager: React.FC<AdvertisingManagerProps> = ({
    adSpaces, setAdSpaces, transactions, setTransactions, currentUser
}) => {
    const [activeTab, setActiveTab] = useState<'spaces' | 'occupancy'>('spaces');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<AdSpace>>(emptySpace);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showPayModal, setShowPayModal] = useState<string | null>(null);
    const [payAmount, setPayAmount] = useState(0);
    const [payDate, setPayDate] = useState(getLocalDateString());
    const [payNotes, setPayNotes] = useState('');
    const isProcessingRef = React.useRef(false);

    // Ad income transactions
    const adTransactions = useMemo(() => {
        return transactions
            .filter(t => t.type === 'AD_INCOME')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions]);

    // Stats
    const stats = useMemo(() => {
        const rented = adSpaces.filter(s => s.status === 'rented').length;
        const available = adSpaces.filter(s => s.status === 'available').length;
        const expired = adSpaces.filter(s => s.status === 'expired').length;
        const totalIncome = adTransactions.reduce((sum, t) => sum + t.amount, 0);
        return { rented, available, expired, total: adSpaces.length, totalIncome };
    }, [adSpaces, adTransactions]);

    const openForm = (space?: AdSpace) => {
        if (space) {
            setForm({ ...space });
            setEditingId(space.id);
        } else {
            setForm({ ...emptySpace });
            setEditingId(null);
        }
        setShowForm(true);
    };

    const addAdTransaction = async (space: AdSpace, amount: number, notes?: string, customDate?: string) => {
        const tx: Transaction = {
            id: `tx-ad-${space.id}-${Date.now()}`,
            type: 'AD_INCOME',
            subtype: 'AD_SPACE',
            amount: amount,
            date: customDate || getLocalDateString(),
            description: `Publicidad: ${space.name} — ${space.lesseeName || 'Sin nombre'}`,
            status: 'completed',
            paymentMethod: 'CASH',
            registeredBy: currentUser.username,
            created_at: new Date().toISOString(),
            is_closed: false,
            adSpaceId: space.id,
            ...(notes ? { notes } : {})
        };
        await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
        setTransactions(prev => {
            // Prevent duplicate display if already added by some other sync
            if (prev.some(t => t.id === tx.id)) return prev;
            return [tx, ...prev];
        });
    };

    const handleSave = async () => {
        if (!form.name || !form.location || !form.dimensions) {
            return alert('Nombre, ubicación y medidas son requeridos.');
        }
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsProcessing(true);
        try {
            const space: AdSpace = {
                id: editingId || `ad-${Date.now()}`,
                name: form.name!,
                location: form.location!,
                dimensions: form.dimensions!,
                amount: form.amount || 0,
                status: form.status || 'available',
                lesseeName: form.lesseeName || '',
                lesseePhone: form.lesseePhone || '',
                contractUrl: form.contractUrl || '',
                paymentStatus: form.paymentStatus || 'pending',
                startDate: form.startDate || '',
                endDate: form.endDate || '',
                rentalPeriod: form.rentalPeriod || '',
                notes: form.notes || ''
            };

            // Preguntar si desea registrar el pago si está rentado
            if (space.status === 'rented' && space.amount > 0) {
                if (window.confirm(`¿Deseas registrar un pago de $${space.amount.toLocaleString()} en los movimientos financieros para este espacio?`)) {
                    await addAdTransaction(space, space.amount, "Pago registrado al guardar espacio");
                    space.paymentStatus = 'paid';
                }
            }

            await dataService.upsertRecord(TABLES.AD_SPACES, space);
            setAdSpaces(prev => {
                const idx = prev.findIndex(s => s.id === space.id);
                if (idx >= 0) { const u = [...prev]; u[idx] = space; return u; }
                return [...prev, space];
            });
            setShowForm(false);
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Eliminar este espacio publicitario?')) return;
        await dataService.deleteRecord(TABLES.AD_SPACES, id);
        setAdSpaces(prev => prev.filter(s => s.id !== id));
    };

    const handleRecordPayment = async (spaceId: string) => {
        const space = adSpaces.find(s => s.id === spaceId);
        if (!space || payAmount <= 0) return alert('Monto inválido');
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsProcessing(true);

        try {
            await addAdTransaction(space, payAmount, payNotes, payDate);

            // Update payment status
            const updated = { ...space, paymentStatus: 'paid' as const };
            await dataService.upsertRecord(TABLES.AD_SPACES, updated);
            setAdSpaces(prev => prev.map(s => s.id === spaceId ? updated : s));

            setShowPayModal(null);
            setPayAmount(0);
            setPayDate(getLocalDateString());
            setPayNotes('');
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    const getDaysUntilExpiry = (endDate?: string) => {
        if (!endDate) return null;
        const end = new Date(endDate + 'T23:59:59-06:00');
        const now = new Date();
        return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    };

    const getWhatsAppUrl = (phone: string, name: string, endDate: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        const mx = cleanPhone.startsWith('52') ? cleanPhone : `52${cleanPhone}`;
        const msg = encodeURIComponent(
            `Hola ${name}, le informamos que su contrato publicitario en ${plaza.name} vence el ${formatLocalDate(endDate)}. ¿Desea renovar?`
        );
        return `https://wa.me/${mx}?text=${msg}`;
    };

    return (
        <div className="space-y-12 animate-fade-in pb-20 max-w-7xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                <div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Publicidad y Activos</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Gestión de espacios publicitarios y rentas</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                    <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto">
                        <button onClick={() => setActiveTab('spaces')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'spaces' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Espacios</button>
                        <button onClick={() => setActiveTab('occupancy')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'occupancy' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Mapa de Ocupación</button>
                    </div>
                    <button onClick={() => openForm()} className="w-full sm:w-auto px-8 py-4 bg-violet-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-violet-700 transition-all shadow-xl shadow-violet-100">
                        <Plus size={18} /> Nuevo Activo
                    </button>
                </div>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Total Activos" value={stats.total} icon={Grid3X3} color="slate" />
                <StatCard label="Disponibles" value={stats.available} icon={CheckCircle} color="emerald" />
                <StatCard label="Vencimientos Prox." value={stats.expired} icon={AlertCircle} color="red" />
                <StatCard label="Ingresos Totales" value={`$${stats.totalIncome.toLocaleString()}`} icon={DollarSign} color="violet" />
            </div>

            {/* SPACES TAB */}
            {activeTab === 'spaces' && (
                <div className="space-y-6">
                    {adSpaces.map(space => {
                        const isExpanded = expandedId === space.id;
                        const statusStyle = STATUS_COLORS[space.status] || STATUS_COLORS.available;
                        const daysLeft = getDaysUntilExpiry(space.endDate);
                        const isExpiring = daysLeft !== null && daysLeft <= 30 && daysLeft > 0;
                        const isExpired = daysLeft !== null && daysLeft <= 0;
                        const spaceTxs = adTransactions.filter(t => 
                            t.adSpaceId === space.id || 
                            (t.description.includes(`Publicidad: ${space.name}`) && !t.adSpaceId)
                        );

                        return (
                            <motion.div 
                                layout
                                key={space.id} 
                                className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all overflow-hidden"
                            >
                                <div className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                                    <div className="flex items-center gap-6">
                                        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center ${
                                            space.status === 'available' ? 'bg-emerald-50 text-emerald-600' :
                                            space.status === 'rented' ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'
                                        }`}>
                                            <Megaphone size={32} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3 mb-1">
                                                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{space.name}</h4>
                                                <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                                    space.status === 'available' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                    space.status === 'rented' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-red-50 text-red-600 border-red-100'
                                                }`}>
                                                    {statusStyle.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <span className="flex items-center gap-1.5"><MapPin size={12} className="text-violet-500" /> {space.location}</span>
                                                <span className="flex items-center gap-1.5"><Ruler size={12} className="text-violet-500" /> {space.dimensions}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4">
                                        <div className="text-right mr-6">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Renta Estipulada</p>
                                            <p className="text-2xl font-black text-slate-900">${space.amount.toLocaleString()}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => openForm(space)} className="w-12 h-12 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-2xl flex items-center justify-center transition-all shadow-sm border border-slate-100"><Edit2 size={18} /></button>
                                            <button onClick={() => setExpandedId(isExpanded ? null : space.id)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${isExpanded ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-100 shadow-sm'}`}>
                                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="bg-slate-50/50 border-t border-slate-100 p-10 animate-fade-in">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
                                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Detalles del Contrato</h5>
                                                <div className="space-y-4">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-bold text-slate-500">Arrendatario</span>
                                                        <span className="text-xs font-black text-slate-800 uppercase">{space.lesseeName || 'Sin asignar'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-bold text-slate-500">Vigencia</span>
                                                        <span className="text-xs font-black text-slate-800 uppercase">{space.startDate ? `${formatLocalDate(space.startDate)} - ${formatLocalDate(space.endDate || '')}` : 'No definida'}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-bold text-slate-500">Días Restantes</span>
                                                        <span className={`text-xs font-black ${isExpired ? 'text-red-500' : 'text-emerald-500'}`}>{daysLeft !== null ? daysLeft : '--'} días</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
                                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Acciones Rápidas</h5>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button onClick={() => openForm(space)} className="p-4 bg-blue-50 text-blue-600 rounded-2xl flex flex-col items-center gap-2 hover:bg-blue-100 transition-all border border-blue-100">
                                                        <Edit2 size={20} />
                                                        <span className="text-[9px] font-black uppercase">Editar</span>
                                                    </button>
                                                    <button onClick={() => { setPayAmount(space.amount); setPayDate(getLocalDateString()); setShowPayModal(space.id); }} className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl flex flex-col items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100">
                                                        <DollarSign size={20} />
                                                        <span className="text-[9px] font-black uppercase">Cobro</span>
                                                    </button>
                                                    {space.lesseePhone && (
                                                        <a href={getWhatsAppUrl(space.lesseePhone, space.lesseeName || '', space.endDate || '')} target="_blank" rel="noopener noreferrer" className="p-4 bg-green-50 text-green-600 rounded-2xl flex flex-col items-center gap-2 hover:bg-green-100 transition-all border border-green-100 text-center">
                                                            <MessageCircle size={20} />
                                                            <span className="text-[9px] font-black uppercase">WA</span>
                                                        </a>
                                                    )}
                                                    <button onClick={() => handleDelete(space.id)} className="p-4 bg-red-50 text-red-600 rounded-2xl flex flex-col items-center gap-2 hover:bg-red-100 transition-all border border-red-100">
                                                        <Trash2 size={20} />
                                                        <span className="text-[9px] font-black uppercase">Borrar</span>
                                                    </button>
                                                    {space.contractUrl && (
                                                        <DocumentPreviewButton
                                                            url={space.contractUrl}
                                                            className="p-4 bg-blue-50 text-blue-600 rounded-2xl flex flex-col items-center gap-2 hover:bg-blue-100 transition-all border border-blue-100 text-center"
                                                            label={<><FileText size={20} /><span className="text-[9px] font-black uppercase">Doc</span></>}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                                                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex justify-between items-center">
                                                    Últimos Cobros
                                                    <Eye size={14} className="text-violet-500" />
                                                </h5>
                                                <div className="space-y-3">
                                                    {spaceTxs.slice(0, 3).map(t => (
                                                        <div key={t.id} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                                                            <div>
                                                                <p className="text-[10px] font-black text-slate-800">{formatLocalDate(t.date)}</p>
                                                                <p className="text-[8px] font-bold text-slate-400 uppercase">{t.paymentMethod}</p>
                                                            </div>
                                                            <p className="font-black text-emerald-600 text-sm">${t.amount.toLocaleString()}</p>
                                                        </div>
                                                    ))}
                                                    {spaceTxs.length === 0 && <p className="text-center py-4 text-[10px] font-bold text-slate-400 uppercase">Sin movimientos</p>}
                                                </div>
                                            </div>
                                        </div>

                                        {space.notes && (
                                            <div className="bg-violet-50/50 p-6 rounded-[1.5rem] border border-violet-100/50 text-xs text-violet-700 font-bold leading-relaxed">
                                                <span className="mr-2 uppercase tracking-widest opacity-60 text-[9px]">Observaciones:</span>
                                                {space.notes}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* OCCUPANCY TAB */}
            {activeTab === 'occupancy' && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {adSpaces.map(space => {
                        const status = space.status;
                        return (
                            <motion.div 
                                whileHover={{ scale: 1.02 }}
                                key={space.id}
                                onClick={() => { setActiveTab('spaces'); setExpandedId(space.id); }}
                                className={`p-8 rounded-[2.5rem] border-2 cursor-pointer transition-all ${
                                    status === 'rented' ? 'bg-blue-50/50 border-blue-100' :
                                    status === 'expired' ? 'bg-red-50/50 border-red-100' : 'bg-emerald-50/50 border-emerald-100 shadow-xl shadow-emerald-50'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        status === 'rented' ? 'bg-blue-100 text-blue-600' :
                                        status === 'expired' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                        <MapPin size={18} />
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                        status === 'rented' ? 'bg-blue-600 text-white' :
                                        status === 'expired' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                                    }`}>
                                        {STATUS_COLORS[status]?.label}
                                    </span>
                                </div>
                                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-1">{space.name}</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">{space.location}</p>
                                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{space.dimensions}</span>
                                    <span className="font-black text-slate-900">${space.amount.toLocaleString()}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* FORM MODAL */}
            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
                    <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl relative z-10 animate-fade-in-up overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{editingId ? 'Editar Activo' : 'Nuevo Activo'}</h3>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-900"><X /></button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Identificador del Espacio</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-violet-400 transition-all" placeholder="Ej. Lona Frontal B1" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Ubicación</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-violet-400" placeholder="Ej. Planta Alta" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Dimensiones</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-violet-400" placeholder="Ej. 6m x 3m" value={form.dimensions || ''} onChange={e => setForm({ ...form, dimensions: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Monto Sugerido ($)</label>
                                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-violet-600 outline-none focus:border-violet-400" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Frecuencia</label>
                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-700 outline-none" value={form.rentalPeriod || ''} onChange={e => setForm({ ...form, rentalPeriod: e.target.value })}>
                                        <option value="">Seleccionar</option>
                                        <option value="1 mes">Mensual</option>
                                        <option value="3 meses">Trimestral</option>
                                        <option value="6 meses">Semestral</option>
                                        <option value="1 año">Anual</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Estatus Actual</label>
                                <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                                    <button type="button" onClick={() => setForm({ ...form, status: 'available' })} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.status === 'available' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}>Disponible</button>
                                    <button type="button" onClick={() => setForm({ ...form, status: 'rented' })} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.status === 'rented' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400'}`}>Rentado</button>
                                    <button type="button" onClick={() => setForm({ ...form, status: 'expired' })} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.status === 'expired' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400'}`}>Vencido</button>
                                </div>
                            </div>
                            <div className="pt-4 border-t border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Información del Cliente (Opcional)</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-violet-400" placeholder="Nombre / Empresa" value={form.lesseeName || ''} onChange={e => setForm({ ...form, lesseeName: e.target.value })} />
                                    <input type="tel" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-violet-400" placeholder="Teléfono" value={form.lesseePhone || ''} onChange={e => setForm({ ...form, lesseePhone: e.target.value })} />
                                </div>
                            </div>
                            <button onClick={handleSave} disabled={isProcessing} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-violet-600 transition-all flex items-center justify-center gap-3 mt-4 shadow-xl shadow-slate-200 disabled:opacity-50">
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />} {editingId ? 'Actualizar Espacio' : 'Registrar Activo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PAY MODAL */}
            {showPayModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPayModal(null)} />
                    <div className="bg-white rounded-[3rem] w-full max-w-sm p-10 shadow-2xl relative z-10 animate-fade-in-up">
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-8">Registrar Cobro</h3>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fecha</label>
                                <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none" value={payDate} onChange={e => setPayDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Monto Recibido ($)</label>
                                <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-emerald-600 outline-none" value={payAmount} onChange={e => setPayAmount(Number(e.target.value))} />
                            </div>
                            <button onClick={() => handleRecordPayment(showPayModal)} disabled={isProcessing} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-100">
                                {isProcessing ? <Loader2 className="animate-spin" /> : <CheckCircle size={18} />} Confirmar Transacción
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatCard = ({ label, value, icon: Icon, color }: any) => {
    const colors: any = {
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        red: 'bg-red-50 text-red-600 border-red-100',
        violet: 'bg-violet-50 text-violet-600 border-violet-100',
        slate: 'bg-slate-900 text-white border-slate-800'
    };
    return (
        <div className={`p-8 rounded-[2.5rem] border shadow-sm ${colors[color] || colors.blue}`}>
            <div className="flex justify-between items-start mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color === 'slate' ? 'bg-white/10' : 'bg-white shadow-sm'}`}>
                    <Icon size={24} />
                </div>
            </div>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${color === 'slate' ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
            <h3 className="text-3xl font-black tracking-tight">{value}</h3>
        </div>
    );
};

