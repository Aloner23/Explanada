
import { plaza } from '../config/plaza';
import { classifyTransaction } from '../utils/financialCalculations';
import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { TABLES } from '../services/dataService';
import { Plus, Edit2, Trash2, Search, ArrowUpRight, ArrowDownLeft, Filter, CircleCheck, AlertCircle, Loader2 } from 'lucide-react';
import { getLocalDateString, getFormattedTime } from '../utils/parkingLogic';

interface TransactionsViewProps {
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<any>>;
    handleSave: (table: string, data: any, setter: any) => Promise<void>;
    handleDelete: (table: string, id: string, setter: any) => Promise<void>;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({ transactions, setTransactions, handleSave, handleDelete }) => {
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<Transaction>>({
        type: 'EXPENSE',
        subtype: 'OTROS_GASTOS', // Default to OTHER as requested
        amount: 0,
        description: '',
        date: getLocalDateString(),
        paymentMethod: 'CASH',
        status: 'completed'
    });

    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [visibleCount, setVisibleCount] = useState(50);

    const handleSubmit = async () => {
        await handleSave(TABLES.TRANSACTIONS, form, setTransactions);
        setShowForm(false);
        setEditingId(null);
        setShowForm(false);
        setEditingId(null);
        setForm({ type: 'EXPENSE', subtype: 'OTROS_GASTOS', amount: 0, description: '', date: getLocalDateString(), paymentMethod: 'CASH', status: 'completed' });
    };

    const handleEdit = (transaction: Transaction) => {
        setForm(transaction);
        setEditingId(transaction.id);
        setShowForm(true);
    };

    const sortedTransactions = [...transactions]
        .filter(t => {
            // Excluir deudas (solo informativos para CashAudit/Admin)
            if (t.type === 'DEBT') return false;

            if (filterDateStart && t.date < filterDateStart) return false;
            if (filterDateEnd && t.date > filterDateEnd) return false;

            if (filterCategory === 'ALL') return true;
            if (filterCategory === 'PARKING') return t.type === 'PARKING';
            if (filterCategory === 'RENT_LOCAL') return t.type === 'RENT' && (!t.subtype || t.subtype === 'LOCAL');
            if (filterCategory === 'RENT_OFICINA') return t.type === 'RENT' && t.subtype === 'OFICINA';
            if (filterCategory.startsWith('SPACE:')) return t.type === 'RESERVATION' && classifyTransaction(t, [], []).spaceId === filterCategory.slice(6);

            return true;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const isIncome = (t: Transaction) => 
        t.type === 'INCOME' || 
        t.type === 'RESERVATION' || 
        t.type === 'PARKING' || 
        t.type === 'RENT' || 
        t.type === 'AD_INCOME' || 
        t.type === 'HISTORICAL';

    const financialSummary = useMemo(() => {
        let income = 0;
        let expense = 0;

        sortedTransactions.forEach(t => {
            // No sumamos AUDIT ni DEBT al flujo de efectivo (son instantáneas o informativas)
            // Ya existen ajustes (INCOME/EXPENSE) que cubren las diferencias detectadas en AUDIT
            if (t.type === 'AUDIT' || t.type === 'DEBT') return;

            // Math.abs(): guards against legacy EXPENSE records saved with a negative amount
            // (old Cash Audit bug), which would otherwise subtract from `expense` instead of adding.
            if (isIncome(t)) income += Math.abs(Number(t.amount));
            else expense += Math.abs(Number(t.amount));
        });

        return {
            income,
            expense,
            balance: income - expense
        };
    }, [sortedTransactions]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ingresos Totales (Flujo)</p>
                    <p className="text-3xl font-black text-emerald-600 tracking-tighter cursor-help" title="Suma de Rentas, Estacionamiento, Reservas y Fondos Históricos">${financialSummary.income.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Egresos Totales (Flujo)</p>
                    <p className="text-3xl font-black text-red-500 tracking-tighter">${financialSummary.expense.toLocaleString()}</p>
                </div>
                <div className={`p-6 rounded-[2rem] border shadow-sm ${financialSummary.balance >= 0 ? 'bg-slate-900 text-white border-slate-800' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${financialSummary.balance >= 0 ? 'text-slate-400' : 'text-red-400'}`}>Balance Neto</p>
                    <p className="text-3xl font-black tracking-tighter">${financialSummary.balance.toLocaleString()}</p>
                </div>
            </div>

            <div className="flex justify-between items-center flex-wrap gap-4">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Movimientos Financieros</h3>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <Filter size={14} className="text-slate-400" />
                        <select className="text-xs font-bold text-slate-600 bg-transparent outline-none" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                            <option value="ALL">Todo</option>
                            <option value="PARKING">Estacionamiento</option>
                            <option value="RENT_LOCAL">Renta Locales</option>
                            <option value="RENT_OFICINA">Renta Oficinas</option>
                            {plaza.spaces.map(sp => <option key={sp.id} value={`SPACE:${sp.id}`}>{sp.name}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Del</span>
                        <input type="date" className="text-xs font-bold text-slate-600 bg-transparent outline-none" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} />
                        <span className="text-[10px] font-black text-slate-400 uppercase">Al</span>
                        <input type="date" className="text-xs font-bold text-slate-600 bg-transparent outline-none" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} />
                    </div>
                    <button onClick={() => { setEditingId(null); setForm({ type: 'EXPENSE', subtype: 'OTHER', amount: 0, description: '', date: getLocalDateString(), paymentMethod: 'CASH', status: 'completed' }); setShowForm(true); }} className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-slate-800 transition-colors">
                        <Plus size={16} /> Nuevo
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{editingId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h3>
                            <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-full"><Trash2 className="text-transparent" size={20} /><span className="sr-only">Cerrar</span></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">Tipo</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <select className="input-std" value={form.type} onChange={e => {
                                        const newType = e.target.value as Transaction['type'];
                                        let newSubtype: Transaction['subtype'] = 'OTHER';
                                        if (newType === 'EXPENSE') newSubtype = 'OTROS_GASTOS';
                                        else if (newType === 'RENT') newSubtype = 'LOCAL';
                                        else if (newType === 'RESERVATION') newSubtype = 'EVENT';
                                        else if (newType === 'AD_INCOME') newSubtype = 'AD_SPACE';

                                        setForm({ ...form, type: newType, subtype: newSubtype });
                                    }}>
                                        <option value="INCOME">Ingreso General</option>
                                        <option value="AD_INCOME">Ingreso Publicidad</option>
                                        <option value="HISTORICAL">Fondo Histórico / Saldo Inicial</option>
                                        <option value="EXPENSE">Egreso</option>
                                        <option value="RESERVATION">S. Reserva</option>
                                        <option value="RENT">Renta</option>
                                        <option value="PARKING">Estacionamiento</option>
                                    </select>
                                    {form.type === 'EXPENSE' ? (
                                        <select className="input-std" value={form.subtype || 'OTROS_GASTOS'} onChange={e => setForm({ ...form, subtype: e.target.value as any })}>
                                            <option value="OTROS_GASTOS">Otros / General</option>
                                            <option value="NOMINA">Nómina</option>
                                            <option value="MANTENIMIENTO_MEJORAS">Mantenimiento y Mejoras</option>
                                            <option value="PAPELERIA_OFICINA">Papelería y Oficina</option>
                                            <option value="TELEFONO_INTERNET">Teléfono e Internet</option>
                                            <option value="DESPENSA_LIMPIEZA">Despensa y Limpieza</option>
                                            <option value="MANTENIMIENTO">Mantenimiento (General)</option>
                                            <option value="LUZ">Luz</option>
                                            <option value="AGUA">Agua</option>
                                            <option value="INTERNET">Internet</option>
                                            <option value="MARKETING">Marketing</option>
                                            <option value="CONTABILIDAD">Contabilidad</option>
                                            <option value="LEGAL">Legal</option>
                                            <option value="TI">Servicios TI</option>
                                            <option value="IMPUESTOS">Impuestos</option>
                                        </select>
                                    ) : form.type === 'RENT' ? (
                                        <select className="input-std" value={form.subtype || 'LOCAL'} onChange={e => setForm({ ...form, subtype: e.target.value as any })}>
                                            <option value="LOCAL">Local Comercial</option>
                                            <option value="OFICINA">Oficina</option>
                                            <option value="DEPORTIVO">Deportivo</option>
                                        </select>
                                    ) : (
                                        <select className="input-std" value={form.subtype === 'EVENT' ? (form.spaceId || 'EVENT') : (form.subtype || 'OTHER')} onChange={e => { const v = e.target.value; setForm({ ...form, subtype: v === 'OTHER' ? 'OTHER' : 'EVENT', spaceId: v === 'OTHER' || v === 'EVENT' ? undefined : v }); }}>
                                            <option value="OTHER">General</option>
                                            {plaza.spaces.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                            <option value="EVENT">Otro espacio</option>
                                        </select>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">Monto</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                    <input type="number" className="input-std !pl-8" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="col-span-2 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">Descripción</label>
                                <input className="input-std" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detalle del movimiento..." />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">Fecha</label>
                                <input type="date" className="input-std" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase">Método Pago</label>
                                <select className="input-std" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value as any })}>
                                    <option value="CASH">Efectivo</option>
                                    <option value="CARD">Tarjeta</option>
                                    <option value="TRANSFER">Transferencia</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                            <button onClick={() => setShowForm(false)} className="text-slate-400 font-black text-xs uppercase px-4 hover:text-slate-600">Cancelar</button>
                            <button onClick={handleSubmit} className="px-10 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-blue-700 transition-colors">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 font-black text-slate-500 uppercase text-[10px] tracking-widest border-b">
                        <tr>
                            <th className="p-5">Fecha</th>
                            <th className="p-5">POS</th>
                            <th className="p-5">Descripción</th>
                            <th className="p-5">Tipo</th>
                            <th className="p-5 text-right">Monto</th>
                            <th className="p-5 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTransactions.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-10 text-center text-slate-400 italic">No hay movimientos registrados</td>
                            </tr>
                        ) : (
                            sortedTransactions.slice(0, visibleCount).map(t => (
                                <tr key={t.id} className="border-b hover:bg-slate-50 transition-colors">
                                    <td className="p-5">
                                        <div className="font-bold text-slate-600">{t.date}</div>
                                        {t.created_at && <div className="text-[10px] font-medium text-slate-400">{getFormattedTime(t.created_at)}</div>}
                                    </td>
                                    <td className="p-5">
                                        {t.posFolio ? (
                                            <span className="text-emerald-500 flex items-center gap-1 cursor-help" title={`Folio POS: ${t.posFolio}`}>
                                                <CircleCheck size={16} />
                                                <span className="text-[10px] font-black">{t.posFolio}</span>
                                            </span>
                                        ) : t.posSyncStatus === 'error' ? (
                                            <span className="text-red-500 cursor-help" title={t.posSyncMessage}>
                                                <AlertCircle size={16} />
                                            </span>
                                        ) : t.posSyncStatus === 'pending' ? (
                                            <span className="text-slate-400">
                                                <Loader2 size={16} className="animate-spin" />
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-2">
                                            {t.is_closed && (
                                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black uppercase whitespace-nowrap">ARQUEADO</span>
                                            )}
                                            <div className="font-bold text-slate-800">{t.description}</div>
                                        </div>
                                        <div className="text-[10px] text-slate-400 uppercase">{t.paymentMethod}</div>
                                    </td>
                                    <td className="p-5">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex w-fit items-center gap-1 ${isIncome(t) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                            }`}>
                                            {isIncome(t) ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                                            {t.type === 'RESERVATION' ? 'Reserva' : t.type === 'INCOME' ? 'Ingreso' : t.type === 'RENT' ? 'Renta' : t.type === 'PARKING' ? 'Estacionamiento' : t.type === 'AD_INCOME' ? 'Publicidad' : t.type === 'HISTORICAL' ? 'Fondo Hist.' : t.type === 'AUDIT' ? 'Arqueo' : 'Egreso'}
                                        </span>
                                        {t.subtype && <div className="text-[9px] text-slate-400 uppercase mt-1 ml-1">{t.subtype === 'EVENT' ? (plaza.spaces.find(sp => sp.id === t.spaceId)?.name || 'Evento') : t.subtype.replace('_', ' ')}</div>}
                                    </td>
                                    <td className={`p-5 text-right font-black ${isIncome(t) ? 'text-emerald-600' : 'text-red-500'
                                        }`}>
                                        {isIncome(t) ? '+' : '-'}${Math.abs(Number(t.amount)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-5 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(t)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDelete(TABLES.TRANSACTIONS, t.id, setTransactions)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {visibleCount < sortedTransactions.length && (
                <div className="flex justify-center pt-4">
                    <button 
                        onClick={() => setVisibleCount(prev => prev + 50)}
                        className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-50 transition-all shadow-sm"
                    >
                        Cargar más ({sortedTransactions.length - visibleCount} restantes)
                    </button>
                </div>
            )}
        </div>
    );
};
