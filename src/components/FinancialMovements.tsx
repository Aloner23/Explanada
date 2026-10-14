import { plaza } from '../config/plaza';
import { classifyTransaction } from '../utils/financialCalculations';
import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  ArrowUpRight, 
  ArrowDownLeft,
  Filter,
  Calendar,
  MoreVertical,
  TrendingUp,
  X,
  Save,
  Download
} from 'lucide-react';
import { Transaction } from '../types';
import { TABLES } from '../services/dataService';
import { exportToCSV } from '../utils/exportUtils';

interface FinancialMovementsProps {
  transactions: Transaction[];
  setTransactions: any;
  handleSave: (collection: string, data: any, setter?: any) => Promise<void>;
  handleDelete: (collection: string, id: string, setter?: any) => Promise<void>;
}

const FinancialMovements: React.FC<FinancialMovementsProps> = ({
  transactions,
  setTransactions,
  handleSave,
  handleDelete
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Transaction>>({
    type: 'EXPENSE',
    subtype: 'OTROS_GASTOS',
    amount: 0,
    description: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'CASH',
    status: 'completed'
  });

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  const onSave = async () => {
    if (!formData.amount || !formData.description) {
      alert("Monto y descripción requeridos");
      return;
    }
    await handleSave(TABLES.TRANSACTIONS, formData, setTransactions);
    setIsModalOpen(false);
    setEditingTx(null);
    setFormData({
      type: 'EXPENSE',
      subtype: 'OTROS_GASTOS',
      amount: 0,
      description: '',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'CASH',
      status: 'completed'
    });
  };

  const onEdit = (tx: Transaction) => {
    setFormData(tx);
    setEditingTx(tx.id);
    setIsModalOpen(true);
  };

  const isIncome = (tx: Transaction) => {
    return ['INCOME', 'RESERVATION', 'PARKING', 'RENT', 'AD_INCOME', 'HISTORICAL'].includes(tx.type);
  };

  const filteredTransactions = useMemo(() => {
    return [...transactions].filter(tx => {
      // Excluir deudas del flujo principal (solo pagos/gastos reales)
      if (tx.type === 'DEBT') return false;

      // Filtro de fecha
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;

      // Filtro de tipo
      if (filterType === 'ALL') return true;
      if (filterType === 'PARKING') return tx.type === 'PARKING';
      if (filterType === 'RENT_LOCAL') return tx.type === 'RENT' && (!tx.subtype || tx.subtype === 'LOCAL');
      if (filterType === 'RENT_OFICINA') return tx.type === 'RENT' && tx.subtype === 'OFICINA';
      if (filterType.startsWith('SPACE:')) return tx.type === 'RESERVATION' && classifyTransaction(tx, [], []).spaceId === filterType.slice(6);
      
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, dateFrom, dateTo, filterType]);

  const stats = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach(tx => {
      if (tx.type === 'AUDIT') return; // Arqueos no suman al flujo bruto aquí
      // Defensive Math.abs(): some historical EXPENSE records were saved with a negative amount
      // (a legacy Cash Audit bug); using the raw signed value here would subtract instead of add,
      // silently understating expenses and overstating the net balance.
      if (isIncome(tx)) {
        income += Math.abs(Number(tx.amount));
      } else {
        expense += Math.abs(Number(tx.amount));
      }
    });
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  const handleExport = () => {
    const headers = ['Fecha', 'Hora', 'Descripción', 'Categoría', 'Método', 'Tipo', 'Importe', 'Folio POS'];
    const data = filteredTransactions.map(tx => [
      tx.date,
      tx.created_at ? new Date(tx.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
      tx.description,
      tx.subtype || 'GENERAL',
      tx.paymentMethod,
      isIncome(tx) ? 'INGRESO' : 'EGRESO',
      tx.amount,
      tx.posFolio || ''
    ]);
    exportToCSV(`Movimientos_${new Date().toISOString().split('T')[0]}`, headers, data);
  };

  return (
    <div className="space-y-10 animate-fade-in pb-20">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-6 text-emerald-600">
            <ArrowUpRight size={24} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Ingresos de Flujo</p>
          <p className="text-3xl font-black text-slate-900 tracking-tight cursor-help" title="Rentas, Estacionamiento, Reservas y Fondos Históricos">
            ${stats.income.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] font-bold text-emerald-500 mt-2 uppercase tracking-widest flex items-center gap-1">
             <TrendingUp size={12} /> Tendencia Positiva
          </p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-6 text-rose-600">
            <ArrowDownLeft size={24} />
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Egresos Operativos</p>
          <p className="text-3xl font-black text-slate-900 tracking-tight">
            ${stats.expense.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Gastos registrados</p>
        </div>

        <div className={`p-8 rounded-[2.5rem] border shadow-2xl transition-all ${stats.balance >= 0 ? 'bg-slate-900 text-white border-slate-800' : 'bg-red-50 text-red-600 border-red-100'}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${stats.balance >= 0 ? 'bg-white/10 text-white' : 'bg-red-100 text-red-600'}`}>
            <DollarSign size={24} />
          </div>
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 ${stats.balance >= 0 ? 'text-slate-400' : 'text-red-400'}`}>Balance Neto</p>
          <p className="text-3xl font-black tracking-tight">
            ${stats.balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
          <p className={`text-[10px] font-black mt-2 uppercase tracking-widest ${stats.balance >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
            Capital Disponible
          </p>
        </div>
      </div>

      {/* Header & Filters */}
      <div className="flex justify-between items-center flex-wrap gap-8 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div>
           <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Historial de Movimientos</h3>
           <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Control de entradas y salidas de capital</p>
        </div>
        
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex items-center gap-3 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
            <Filter size={16} className="text-slate-400" />
            <select 
              className="text-[10px] font-black text-slate-600 bg-transparent outline-none uppercase tracking-widest"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="ALL">Todo el Historial</option>
              <option value="PARKING">Solo Estacionamiento</option>
              <option value="RENT_LOCAL">Renta de Locales</option>
              <option value="RENT_OFICINA">Renta de Oficinas</option>
              {plaza.spaces.map(sp => <option key={sp.id} value={`SPACE:${sp.id}`}>{sp.name}</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Del</span>
                <input 
                  type="date" 
                  className="text-[10px] font-black text-slate-800 bg-transparent outline-none"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
            </div>
            <div className="w-px h-4 bg-slate-200"></div>
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Al</span>
                <input 
                  type="date" 
                  className="text-[10px] font-black text-slate-800 bg-transparent outline-none"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
            </div>
          </div>

          <button 
            onClick={() => {
              setEditingTx(null);
              setFormData({
                type: 'EXPENSE',
                subtype: 'OTHER',
                amount: 0,
                description: '',
                date: new Date().toISOString().split('T')[0],
                paymentMethod: 'CASH',
                status: 'completed'
              });
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
          >
            <Plus size={18} /> Nuevo Registro
          </button>

          <button 
            onClick={handleExport}
            className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
          >
            <Download size={18} /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
            <thead>
                <tr className="border-b border-slate-100">
                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha y Hora</th>
                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sinc. POS</th>
                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Descripción y Método</th>
                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Categoría</th>
                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Importe</th>
                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Acciones</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {filteredTransactions.length === 0 ? (
                <tr>
                    <td colSpan={6} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200">
                                <Search size={32} />
                            </div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs italic">No se encontraron movimientos financieros</p>
                        </div>
                    </td>
                </tr>
                ) : (
                filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-8">
                        <div className="font-black text-slate-900 uppercase tracking-tight">{tx.date}</div>
                        {tx.created_at && (
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-widest">
                            {new Date(tx.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        )}
                    </td>
                    <td className="p-8">
                        {tx.posFolio ? (
                        <div className="flex items-center gap-2 text-emerald-500 bg-emerald-50 px-4 py-1.5 rounded-full w-fit border border-emerald-100">
                            <CheckCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">{tx.posFolio}</span>
                        </div>
                        ) : tx.posSyncStatus === 'error' ? (
                        <div className="flex items-center gap-2 text-rose-500 bg-rose-50 px-4 py-1.5 rounded-full w-fit border border-rose-100 cursor-help" title={tx.posSyncMessage}>
                            <AlertCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest">Error</span>
                        </div>
                        ) : tx.posSyncStatus === 'pending' ? (
                        <div className="flex items-center gap-2 text-indigo-500 bg-indigo-50 px-4 py-1.5 rounded-full w-fit border border-indigo-100">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Pendiente</span>
                        </div>
                        ) : (
                        <span className="text-slate-300 font-black text-xs">--</span>
                        )}
                    </td>
                    <td className="p-8">
                        <div className="flex items-center gap-3">
                        {tx.is_closed && (
                            <span className="px-2 py-0.5 bg-slate-900 text-white rounded-md text-[8px] font-black uppercase tracking-widest">Cerrado</span>
                        )}
                        <div className="font-black text-slate-800 uppercase tracking-tight text-sm">{tx.description}</div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tx.paymentMethod === 'CASH' ? 'Efectivo' : tx.paymentMethod === 'CARD' ? 'Tarjeta' : 'Transferencia'}</div>
                        </div>
                    </td>
                    <td className="p-8">
                        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.1em] flex w-fit items-center gap-2 border ${isIncome(tx) ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                        {isIncome(tx) ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                        {tx.type === 'RESERVATION' ? 'Agenda / Reserva' : 
                        tx.type === 'INCOME' ? 'Ingreso General' : 
                        tx.type === 'RENT' ? 'Cobro de Renta' : 
                        tx.type === 'PARKING' ? 'Estacionamiento' : 
                        tx.type === 'AD_INCOME' ? 'Publicidad' : 
                        tx.type === 'HISTORICAL' ? 'Fondo Inicial' : 
                        tx.type === 'AUDIT' ? 'Arqueo Caja' : 'Egreso / Pago'}
                        </div>
                        {tx.subtype && (
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2 ml-4">
                            {tx.subtype === 'EVENT' ? (plaza.spaces.find(sp => sp.id === tx.spaceId)?.name || 'Evento') : tx.subtype.replace('_', ' ')}
                        </div>
                        )}
                    </td>
                    <td className={`p-8 text-right font-black text-lg tracking-tighter ${isIncome(tx) ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isIncome(tx) ? '+' : '-'}${Math.abs(Number(tx.amount)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-8 text-right">
                        <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                            onClick={() => onEdit(tx)}
                            className="p-3 text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-xl transition-all"
                            >
                            <Edit2 size={16} />
                            </button>
                            <button 
                            onClick={() => handleDelete(TABLES.TRANSACTIONS, tx.id, setTransactions)}
                            className="p-3 text-rose-600 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-xl transition-all"
                            >
                            <Trash2 size={16} />
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

      {/* Modal Modernizado */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsModalOpen(false)}></div>
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl relative z-10 animate-fade-in-up overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center">
                 <div>
                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight">
                        {editingTx ? 'Modificar Registro' : 'Nuevo Movimiento'}
                    </h3>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Afectación al flujo financiero</p>
                 </div>
                 <button onClick={() => setIsModalOpen(false)} className="w-12 h-12 rounded-full hover:bg-slate-50 flex items-center justify-center text-slate-400 transition-colors">
                    <X size={24} />
                 </button>
              </div>

              <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Tipo de Movimiento</label>
                        <select 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-black text-slate-800 uppercase tracking-widest text-xs outline-none focus:border-indigo-400 transition-all appearance-none"
                            value={formData.type}
                            onChange={(e) => {
                                const type = e.target.value as Transaction['type'];
                                let subtype: Transaction['subtype'] = 'OTHER';
                                if (type === 'EXPENSE') subtype = 'OTROS_GASTOS';
                                else if (type === 'RENT') subtype = 'LOCAL';
                                else if (type === 'RESERVATION') subtype = 'EVENT';
                                else if (type === 'AD_INCOME') subtype = 'AD_SPACE';
                                setFormData({...formData, type, subtype});
                            }}
                        >
                            <option value="INCOME">Ingreso General</option>
                            <option value="AD_INCOME">Ingreso Publicidad</option>
                            <option value="HISTORICAL">Fondo Histórico</option>
                            <option value="EXPENSE">Egreso / Pago</option>
                            <option value="RESERVATION">Agenda de Eventos</option>
                            <option value="RENT">Cobro de Renta</option>
                            <option value="PARKING">Estacionamiento</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Categoría Específica</label>
                        <select 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-black text-slate-800 uppercase tracking-widest text-xs outline-none focus:border-indigo-400 transition-all appearance-none"
                            value={formData.subtype === 'EVENT' && formData.spaceId ? formData.spaceId : (formData.subtype || 'OTHER')}
                            onChange={(e) => {
                                const v = e.target.value;
                                const space = plaza.spaces.find(sp => sp.id === v);
                                setFormData({...formData, subtype: (space ? 'EVENT' : v) as any, spaceId: space?.id});
                            }}
                        >
                            {formData.type === 'EXPENSE' ? (
                                <>
                                    <option value="OTROS_GASTOS">Otros / General</option>
                                    <option value="NOMINA">Nómina</option>
                                    <option value="MANTENIMIENTO_MEJORAS">Mantenimiento</option>
                                    <option value="PAPELERIA_OFICINA">Papelería</option>
                                    <option value="TELEFONO_INTERNET">Telecom</option>
                                    <option value="DESPENSA_LIMPIEZA">Limpieza</option>
                                    <option value="LUZ">Servicio: Luz</option>
                                    <option value="AGUA">Servicio: Agua</option>
                                    <option value="IMPUESTOS">Impuestos</option>
                                </>
                            ) : formData.type === 'RENT' ? (
                                <>
                                    <option value="LOCAL">Local Comercial</option>
                                    <option value="OFICINA">Oficina</option>
                                    <option value="DEPORTIVO">Deportivo</option>
                                </>
                            ) : (
                                <>
                                    <option value="OTHER">General</option>
                                    {plaza.spaces.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                    <option value="EVENT">Otro espacio</option>
                                </>
                            )}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Importe del Movimiento</label>
                        <div className="relative group">
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl">$</div>
                            <input 
                                type="number" 
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-12 py-4 font-black text-slate-900 text-xl outline-none focus:border-indigo-400 transition-all"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: Number(e.target.value)})}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Método de Operación</label>
                        <select 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-black text-slate-800 uppercase tracking-widest text-xs outline-none focus:border-indigo-400 transition-all appearance-none"
                            value={formData.paymentMethod}
                            onChange={(e) => setFormData({...formData, paymentMethod: e.target.value as any})}
                        >
                            <option value="CASH">💵 Efectivo (Caja)</option>
                            <option value="CARD">💳 Tarjeta (Terminal)</option>
                            <option value="TRANSFER">🏦 Transferencia / SPEI</option>
                        </select>
                    </div>

                    <div className="col-span-2 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Descripción Detallada</label>
                        <input 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-bold text-slate-800 outline-none focus:border-indigo-400 transition-all"
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            placeholder="Eje: Pago de luz local 5 / Compra de insumos..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Fecha de Aplicación</label>
                        <input 
                            type="date" 
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-black text-slate-800 outline-none focus:border-indigo-400 transition-all"
                            value={formData.date}
                            onChange={(e) => setFormData({...formData, date: e.target.value})}
                        />
                    </div>
                </div>
              </div>

              <div className="p-10 border-t border-slate-100 flex justify-end gap-6 bg-slate-50/50">
                 <button 
                    onClick={() => setIsModalOpen(false)}
                    className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] px-8 py-4 hover:text-slate-600 transition-colors"
                 >
                    Descartar
                 </button>
                 <button 
                    onClick={onSave}
                    className="px-12 py-4 bg-indigo-600 text-white rounded-[1.25rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-3"
                 >
                    <Save size={18} /> Confirmar Registro
                 </button>
              </div>
           </div>
        </div>
      )}

      <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default FinancialMovements;
