import React, { useMemo, useState } from 'react';
import { Database, BadgeDollarSign, Plus, ArrowUpRight, CalendarDays, Ticket, Store, User, Edit2, Trash2, History as HistoryIcon } from 'lucide-react';
import { Transaction } from '../../types';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
  onAddMovement: () => void;
  onAddHistorical: () => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  onEdit,
  onDelete,
  onAddMovement,
  onAddHistorical
}) => {
  const [page, setPage] = useState(0);
  const history = useMemo(() => transactions
    .filter(t => ['HISTORICAL', 'EXPENSE', 'INCOME', 'RENT', 'RESERVATION', 'PARKING', 'AD_INCOME'].includes(t.type))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || String(b.id).localeCompare(String(a.id))), [transactions]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = history.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
          <Database className="text-blue-600" /> Historial y Caja
        </h3>
        <div className="flex gap-2">
          <button 
            onClick={onAddMovement} 
            className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-2 shadow-lg"
          >
            <ArrowUpRight size={14} /> Registrar Movimiento
          </button>
          <button 
            onClick={onAddHistorical} 
            className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <HistoryIcon size={14} /> Histórico Manual
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4" aria-label="Paginación del historial">
        <p>{history.length} movimientos · Página {currentPage + 1} de {pageCount}</p>
        <div className="flex gap-3">
          <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Anterior</button>
          <button disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-xl border px-4 py-2 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {visible
           .map(tx => (
              <div 
                key={tx.id} 
                className={`bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center group hover:border-blue-300 transition-all gap-4 ${
                  tx.type === 'EXPENSE' ? 'border-red-100 bg-red-50/20' : 'border-slate-200'
                }`}
              >
                 <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shrink-0 ${
                      tx.type === 'EXPENSE' ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                       {tx.type === 'EXPENSE' ? <ArrowUpRight size={20} /> : <CalendarDays size={20} />}
                    </div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{tx.date}</p>
                       <h4 className="text-lg font-black text-slate-800">{tx.description}</h4>
                       
                       {(tx.cars_normal !== undefined || tx.cars_locatario !== undefined) ? (
                          <div className="flex flex-wrap gap-2 mt-2">
                             <span className="px-2 py-1 bg-slate-100 rounded-lg text-[10px] font-bold text-slate-600 flex items-center gap-1 border border-slate-200">
                                <Ticket size={10} /> Norm: {tx.cars_normal || 0} (<span className="text-[8px]">$</span>{tx.amount_normal || 0})
                             </span>
                             <span className="px-2 py-1 bg-blue-50 rounded-lg text-[10px] font-bold text-blue-700 flex items-center gap-1 border border-blue-100">
                                <Store size={10} /> Loc: {tx.cars_locatario || 0} (<span className="text-[8px]">$</span>{tx.amount_locatario || 0})
                             </span>
                             {tx.courtesies ? (
                               <span className="px-2 py-1 bg-yellow-50 rounded-lg text-[10px] font-bold text-yellow-700 border border-yellow-100">
                                 Cortesías: {tx.courtesies}
                               </span>
                             ) : null}
                          </div>
                       ) : (
                          <div className="flex gap-2 mt-1">
                             {tx.cars_total !== undefined && <span className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500">{tx.cars_total} Autos</span>}
                          </div>
                       )}

                       {tx.registeredBy && (
                         <span className="mt-1 inline-flex px-2 py-0.5 rounded text-[9px] font-bold text-slate-400 uppercase items-center gap-1">
                           <User size={10} /> {tx.registeredBy}
                         </span>
                       )}
                    </div>
                 </div>
                 <div className="text-right w-full md:w-auto">
                    <p className={`text-2xl font-black ${tx.type === 'EXPENSE' ? 'text-red-500' : 'text-slate-900'}`}>
                       {tx.type === 'EXPENSE' ? '-' : ''}<span className="text-sm">$</span>{Math.abs(tx.amount).toLocaleString()}
                    </p>
                    <div className="flex justify-end gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => onEdit(tx)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit2 size={14} /></button>
                       <button onClick={() => onDelete(tx.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                 </div>
              </div>
           ))}
        {history.length === 0 && (
           <div className="text-center py-20 opacity-50">
              <HistoryIcon size={48} className="mx-auto mb-4" />
              <p className="font-black uppercase">Sin registros históricos</p>
           </div>
        )}
      </div>
    </div>
  );
};
