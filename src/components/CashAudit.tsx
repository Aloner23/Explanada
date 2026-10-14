import React, { useState, useMemo, useEffect } from 'react';
import { TransactionHistory } from './common/TransactionHistory';
import { Transaction, User, UserRole } from '../types';
import {
   ClipboardCheck, DollarSign, Save, TrendingDown,
   Calculator, List, Wallet, Clock, CircleCheck, AlertCircle,
   User as UserIcon, ChevronDown, ChevronUp, Eye, CalendarDays, Filter, Trash2, X, Edit2
} from 'lucide-react';
import { dataService, TABLES } from '../services/dataService';
import { getLocalDateString, formatLocalDate, getCurrentShift } from '../utils/parkingLogic';

interface CashAuditProps {
   transactions: Transaction[];
   setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
   currentUser: User;
}

type MovementModalState = {
   mode: 'add' | 'add-historical' | 'edit';
   id: string | null;
   type: Transaction['type'];
   category: NonNullable<Transaction['subtype']>;
   description: string;
   amount: string;
   date: string;
};

const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
const getMexicoDateStrFast = (d: Date): string => {
   return new Date(d.getTime() - MX_OFFSET_MS).toISOString().slice(0, 10);
};

// Helper: Mexico Central timezone time string from a transaction
function getMexicoTimeStr(tx: Transaction): string {
   const txDateStr = tx.date; // YYYY-MM-DD
   if (tx.created_at) {
      const d = new Date(tx.created_at);
      if (!isNaN(d.getTime()) && getMexicoDateStrFast(d) === txDateStr) {
         return d.toLocaleTimeString('es-MX', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City'
         });
      }
   }
   const parts = tx.id.split('-');
   const lastPart = parts[parts.length - 1];
   const ts = Number(lastPart);
   if (!isNaN(ts) && ts > 1600000000000) {
      const d = new Date(ts);
      if (getMexicoDateStrFast(d) === txDateStr) {
         return d.toLocaleTimeString('es-MX', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City'
         });
      }
   }
   return '--:--';
}

// Helper: get a Date in Mexico timezone from transaction
function getMexicoDate(tx: Transaction): Date {
   const txDateStr = tx.date; // YYYY-MM-DD
   if (tx.created_at) {
      const d = new Date(tx.created_at);
      if (!isNaN(d.getTime()) && getMexicoDateStrFast(d) === txDateStr) return d;
   }
   const parts = tx.id.split('-');
   const lastPart = parts[parts.length - 1];
   const ts = Number(lastPart);
   if (!isNaN(ts) && ts > 1600000000000) {
      const d = new Date(ts);
      if (getMexicoDateStrFast(d) === txDateStr) return d;
   }
   return new Date(`${txDateStr}T12:00:00-06:00`);
}

function formatMexicoDateTime(isoStr?: string): string {
   if (!isoStr) return 'N/A';
   try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString('es-MX', {
         day: '2-digit', month: '2-digit', year: 'numeric',
         hour: '2-digit', minute: '2-digit',
         timeZone: 'America/Mexico_City'
      });
   } catch {
      return isoStr;
   }
}

export const CashAudit: React.FC<CashAuditProps> = ({
   transactions,
   setTransactions,
   currentUser
}) => {
   const [activeTab, setActiveTab] = useState<'audit' | 'history_tx' | 'history_audits'>('audit');
   const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'OTROS_GASTOS' as any, otherDesc: '', type: 'EXPENSE' as any });
   const [movementModal, setMovementModal] = useState<MovementModalState | null>(null);
   const [isSavingMovement, setIsSavingMovement] = useState(false);
   const [verifiedAmounts, setVerifiedAmounts] = useState<Record<string, number>>({});
   const [isProcessing, setIsProcessing] = useState(false);
   const [expandedCorteId, setExpandedCorteId] = useState<string | null>(null);

   const [filterDate, setFilterDate] = useState(getLocalDateString());
   const [filterShift, setFilterShift] = useState<'Matutino' | 'Vespertino'>(
      getCurrentShift() as 'Matutino' | 'Vespertino'
   );

   const [auditShift, setAuditShift] = useState(filterShift);
   const [auditNotes, setAuditNotes] = useState('');
   const [visibleHistoryCount, setVisibleHistoryCount] = useState(20);
   const [isEditing, setIsEditing] = useState(false);
   const [emptyShiftRealAmount, setEmptyShiftRealAmount] = useState<number>(0);

   useEffect(() => {
      setIsEditing(false);
      setEmptyShiftRealAmount(0);
   }, [filterDate, filterShift]);

   const getShiftRange = (date: string, shift: string): { start: Date; end: Date } => {
      if (shift === 'Matutino') {
         return {
            start: new Date(`${date}T08:00:00-06:00`),
            end: new Date(`${date}T16:00:00-06:00`)
         };
      } else {
         const [y, m, d] = date.split('-').map(Number);
         const nextDay = new Date(y, m - 1, d + 1);
         const nextStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
         return {
            start: new Date(`${date}T16:00:00-06:00`),
            end: new Date(`${nextStr}T08:00:00-06:00`)
         };
      }
   };

   const shiftRange = useMemo(() => getShiftRange(filterDate, filterShift), [filterDate, filterShift]);

   const duplicateTicketIds = useMemo(() => {
      const ids = transactions.map(t => t.ticketId).filter(Boolean);
      const counts: Record<string, number> = {};
      ids.forEach(id => { counts[id!] = (counts[id!] || 0) + 1; });
      return Object.keys(counts).filter(id => counts[id] > 1);
   }, [transactions]);

   const filteredShiftTransactions = useMemo(() => {
      return transactions.filter(t => {
         if (t.status !== 'completed') return false;
         const descLower = (t.description || '').toLowerCase();
         const isMembership = t.parkingType === 'PENSION' || t.paymentMethod === 'MEMBRESIA' || t.subtype === 'PENSION' || descLower.includes('pensi') || descLower.includes('membres');
         const isParkingDept = 
            t.type === 'PARKING' || 
            isMembership || 
            (t.type === 'EXPENSE' && ((t.subtype as string) === 'OTROS_GASTOS' || descLower.includes('parking') || descLower.includes('estacionamiento') || descLower.includes('caseta')));
         
         if (!isParkingDept) return false;
         if (t.subtype === 'ADJUSTMENT') return false;
         const txDate = getMexicoDate(t);
         return txDate >= shiftRange.start && txDate < shiftRange.end;
      }).sort((a, b) => getMexicoDate(b).getTime() - getMexicoDate(a).getTime());
   }, [transactions, shiftRange]);

   const allOpenCount = useMemo(() => {
      return transactions.filter(t => t.is_closed !== true && t.status === 'completed' && t.type === 'PARKING' && t.ticketId).length;
   }, [transactions]);

   const openSummary = useMemo(() => {
      let income = 0;
      let expenses = 0;
      let cashBalance = 0;
      filteredShiftTransactions.forEach(t => {
         const amt = Number(t.amount) || 0;
         const isExpense = t.type === 'EXPENSE' || amt < 0; // Manual expenses might be saved as positive with EXPENSE type
         const realAmt = isExpense ? -Math.abs(amt) : Math.abs(amt);
         
         if (realAmt >= 0) income += realAmt;
         else expenses += Math.abs(realAmt);
         
         if (t.paymentMethod === 'CASH') cashBalance += realAmt;
      });
      return { income, expenses, balance: cashBalance, count: filteredShiftTransactions.length };
   }, [filteredShiftTransactions]);

   const shiftMemberships = useMemo(() => {
      return filteredShiftTransactions.filter(t => {
         const descLower = (t.description || '').toLowerCase();
         return t.parkingType === 'PENSION' || t.paymentMethod === 'MEMBRESIA' || t.subtype === 'PENSION' || descLower.includes('pensi') || descLower.includes('membres');
      }).reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
   }, [filteredShiftTransactions]);

   const monthMemberships = useMemo(() => {
      const currentMonthPrefix = filterDate.substring(0, 7);
      return transactions.filter(t => {
         if (!t.date || !t.date.startsWith(currentMonthPrefix)) return false;
         const descLower = (t.description || '').toLowerCase();
         return t.parkingType === 'PENSION' || t.paymentMethod === 'MEMBRESIA' || t.subtype === 'PENSION' || descLower.includes('pensi') || descLower.includes('membres');
      }).reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
   }, [transactions, filterDate]);

    const totalValidated = useMemo(() => {
       if (filteredShiftTransactions.length === 0) {
          return emptyShiftRealAmount;
       }
       return filteredShiftTransactions.reduce((acc, tx) => {
          // Only cash transactions affect physical cash box balance
          if (tx.paymentMethod !== 'CASH') return acc;

          const absAmount = Math.abs(Number(tx.amount));
          const realMagnitude = verifiedAmounts[tx.id] !== undefined ? verifiedAmounts[tx.id] : absAmount;
          
          const isExpense = tx.type === 'EXPENSE' || Number(tx.amount) < 0;
          return acc + (isExpense ? -realMagnitude : realMagnitude);
       }, 0);
    }, [filteredShiftTransactions, verifiedAmounts, emptyShiftRealAmount]);

   const corteHistory = useMemo(() => {
      return transactions
         .filter(t => t.type === 'AUDIT')
         .sort((a, b) => new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime());
   }, [transactions]);

   const activeAudit = useMemo(() => {
      return corteHistory.find(c => c.shift === filterShift && c.date === filterDate);
   }, [corteHistory, filterShift, filterDate]);

   const isSystemAudit = useMemo(() => {
      return activeAudit && (activeAudit.registeredBy === 'SISTEMA' || activeAudit.id.startsWith('audit-auto-'));
   }, [activeAudit]);

   const systemBalance = useMemo(() => {
      return (activeAudit && !isSystemAudit && !isEditing) ? (activeAudit.audit_system_amount ?? 0) : openSummary.balance;
   }, [activeAudit, isSystemAudit, isEditing, openSummary.balance]);

   const totalReal = useMemo(() => {
      return (activeAudit && !isSystemAudit && !isEditing) ? (activeAudit.audit_declared_amount ?? 0) : totalValidated;
   }, [activeAudit, isSystemAudit, isEditing, totalValidated]);

   const difference = useMemo(() => {
      return totalReal - systemBalance;
   }, [totalReal, systemBalance]);

   const getCorteTransactions = (corte: Transaction) => {
      const corteStart = getShiftRange(corte.date, corte.shift || 'Matutino').start;
      const corteEnd = getShiftRange(corte.date, corte.shift || 'Matutino').end;
      const historicals = transactions.filter(t =>
         t.type === 'PARKING' &&
         getMexicoDate(t) >= corteStart && getMexicoDate(t) < corteEnd
      ).sort((a, b) => getMexicoDate(b).getTime() - getMexicoDate(a).getTime());
      return { historicals };
   };

   const registerExpense = async () => {
      if (!expenseForm.description || !expenseForm.amount) return alert("Faltan datos del movimiento.");
      setIsProcessing(true);
      const isPension = expenseForm.category === 'PENSION';
      const type = isPension ? 'PARKING' : (expenseForm.type || 'EXPENSE');
      // NOTE: amount is ALWAYS stored as a positive magnitude, regardless of type (EXPENSE vs INCOME/etc).
      // The rest of the app (FinancialMovements, TransactionsView, financialCalculations, accountingService)
      // derives the sign purely from `type`/`subtype`, not from tx.amount. Storing a negative amount here
      // used to make expenses render as "-$-500.00" and be double-counted in some totals.
      const amountVal = Math.abs(Number(expenseForm.amount));
      const tx: Transaction = {
         id: `tx-${Date.now()}`,
         type,
         subtype: expenseForm.category as any,
         amount: amountVal, date: getLocalDateString(),
         description: expenseForm.description,
         status: 'completed', paymentMethod: 'CASH',
         registeredBy: currentUser.username,
         created_at: new Date().toISOString(),
         is_closed: false,
         ...(isPension ? { parkingType: 'PENSION' } : {})
      };
      await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
      setTransactions([tx, ...transactions]);
      setExpenseForm({ description: '', amount: '', category: 'OTROS_GASTOS', otherDesc: '', type: 'EXPENSE' });
      setIsProcessing(false);
   };

   const handleDeleteTransaction = async (id: string) => {
      if (!window.confirm('¿Seguro que deseas eliminar este movimiento de caja?')) return;
      try {
         await dataService.deleteRecord(TABLES.TRANSACTIONS, id);
         setTransactions(transactions.filter(t => t.id !== id));
      } catch (error) {
         console.error(error);
         alert('Error al eliminar el movimiento.');
      }
   };

   // --- Historial y Caja: alta/edición de movimientos (Registrar Movimiento / Histórico Manual / Editar) ---
   const openAddMovement = () => {
      setMovementModal({
         mode: 'add', id: null,
         type: 'EXPENSE', category: 'OTROS_GASTOS',
         description: '', amount: '', date: getLocalDateString()
      });
   };

   const openAddHistorical = () => {
      setMovementModal({
         mode: 'add-historical', id: null,
         type: 'HISTORICAL', category: 'OTROS_GASTOS',
         description: '', amount: '', date: getLocalDateString()
      });
   };

   const openEditMovement = (tx: Transaction) => {
      setMovementModal({
         mode: 'edit', id: tx.id,
         type: tx.type, category: tx.subtype || 'OTROS_GASTOS',
         description: tx.description, amount: String(Math.abs(tx.amount)), date: tx.date
      });
   };

   const closeMovementModal = () => setMovementModal(null);

   const handleSaveMovementModal = async () => {
      if (!movementModal) return;
      if (!movementModal.description || !movementModal.amount) {
         alert('Faltan datos del movimiento.');
         return;
      }
      setIsSavingMovement(true);
      try {
         const amountVal = Math.abs(Number(movementModal.amount));
         if (movementModal.mode === 'edit' && movementModal.id) {
            const existing = transactions.find(t => t.id === movementModal.id);
            const tx: Transaction = {
               ...(existing as Transaction),
               type: movementModal.type,
               subtype: movementModal.category,
               amount: amountVal,
               date: movementModal.date,
               description: movementModal.description
            };
            await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            setTransactions(transactions.map(t => t.id === tx.id ? tx : t));
         } else {
            const tx: Transaction = {
               id: `tx-${Date.now()}`,
               type: movementModal.type,
               subtype: movementModal.category,
               amount: amountVal,
               date: movementModal.date,
               description: movementModal.description,
               status: 'completed',
               paymentMethod: 'CASH',
               registeredBy: currentUser.username,
               created_at: new Date().toISOString(),
               is_closed: movementModal.mode === 'add-historical' ? true : false
            };
            await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            setTransactions([tx, ...transactions]);
         }
         setMovementModal(null);
      } catch (error) {
         console.error(error);
         alert('Error al guardar el movimiento.');
      } finally {
         setIsSavingMovement(false);
      }
   };

    const handleSaveAudit = async () => {
       if (activeAudit && !isSystemAudit && !isEditing) return;
       const counted = totalValidated;
       const systemBalanceVal = openSummary.balance;
       const differenceVal = counted - systemBalanceVal;
       const shiftLabel = `${filterShift} (${filterDate})`;
       const confirmMsg = isEditing 
          ? `¿CONFIRMAR EDICIÓN DE ARQUEO?\n\n📅 ${shiftLabel}\n📊 Movimientos: ${openSummary.count}\n\n💰 Sistema: $${systemBalanceVal.toLocaleString()}\n💵 Real (Validado): $${counted.toLocaleString()}\n\n${differenceVal !== 0 ? `⚠️ Diferencia: $${differenceVal.toLocaleString()}` : '✅ Cuadre Perfecto'}\n\nSe actualizarán los movimientos del turno y se registrará ${differenceVal !== 0 ? 'un ajuste por la diferencia' : '$0'}.`
          : `¿CONFIRMAR ARQUEO?\n\n📅 ${shiftLabel}\n📊 Movimientos: ${openSummary.count}\n\n💰 Sistema: $${systemBalanceVal.toLocaleString()}\n💵 Real (Validado): $${counted.toLocaleString()}\n\n${differenceVal !== 0 ? `⚠️ Diferencia: $${differenceVal.toLocaleString()}` : '✅ Cuadre Perfecto'}\n\nSe cerrarán los movimientos del turno y se registrará ${differenceVal !== 0 ? 'un ajuste por la diferencia' : '$0'}.`;
       
       if (!window.confirm(confirmMsg)) return;
       setIsProcessing(true);
 
       if (isSystemAudit && activeAudit) {
          try {
             const autoAuditId = activeAudit.id;
             const autoAdjId = `adj-auto-${filterDate}-${filterShift}`;
             await dataService.deleteRecord(TABLES.TRANSACTIONS, autoAuditId);
             await dataService.deleteRecord(TABLES.TRANSACTIONS, autoAdjId);
          } catch (e) {
             console.error("Error deleting auto audit/adjustment:", e);
          }
       } else if (activeAudit && !isSystemAudit && isEditing) {
          try {
             const oldAuditId = activeAudit.id;
             const oldAdjustment = transactions.find(t => 
                t.subtype === 'ADJUSTMENT' && 
                t.date === filterDate && 
                t.description.includes(filterShift)
             );
             await dataService.deleteRecord(TABLES.TRANSACTIONS, oldAuditId);
             if (oldAdjustment) {
                await dataService.deleteRecord(TABLES.TRANSACTIONS, oldAdjustment.id);
             }
          } catch (e) {
             console.error("Error deleting old manual audit/adjustment:", e);
          }
       }
 
       const nowISO = new Date().toISOString();
       
       const updatePromises = filteredShiftTransactions.map(tx => dataService.upsertRecord(TABLES.TRANSACTIONS, { ...tx, is_closed: true }));
       await Promise.all(updatePromises);
       
       const auditTx: Transaction = {
          id: (activeAudit && !isSystemAudit) ? activeAudit.id : `audit-${Date.now()}`,
          type: 'AUDIT', amount: counted, date: filterDate,
          description: `Corte ${auditShift} (${filterDate})`,
          status: 'completed', paymentMethod: 'CASH',
          registeredBy: currentUser.username,
          audit_system_amount: systemBalanceVal,
          audit_declared_amount: counted,
          audit_difference: differenceVal,
          shift: auditShift,
          created_at: nowISO,
          // IMPORTANT: only actual PARKING-type movements represent "cars serviced" and their revenue.
          // filteredShiftTransactions also includes cash EXPENSE entries swept in for cash-box reconciliation
          // (e.g. the default 'OTROS_GASTOS' subtype used by the quick-expense form above) — those must be
          // excluded here, otherwise a cash expense during the shift inflates the car count/revenue shown
          // in the audit's "Normales"/"Locatarios" breakdown with money that was never a parking sale.
          cars_normal: filteredShiftTransactions.filter(t => t.type === 'PARKING' && t.parkingType !== 'LOCATARIO').reduce((acc, curr) => acc + (curr.cars_charged || 1), 0),
          amount_normal: filteredShiftTransactions.filter(t => t.type === 'PARKING' && t.parkingType !== 'LOCATARIO').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
          cars_locatario: filteredShiftTransactions.filter(t => t.type === 'PARKING' && t.parkingType === 'LOCATARIO').reduce((acc, curr) => acc + (curr.cars_charged || 1), 0),
          amount_locatario: filteredShiftTransactions.filter(t => t.type === 'PARKING' && t.parkingType === 'LOCATARIO').reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
          amount_memberships: shiftMemberships,
          courtesies: filteredShiftTransactions.reduce((acc, curr) => acc + (curr.courtesies || 0), 0),
          ...(auditNotes ? { notes: auditNotes } : {}),
          is_closed: true
       } as Transaction;
       await dataService.upsertRecord(TABLES.TRANSACTIONS, auditTx);
       
       const adjustmentTx: Transaction = {
          id: `adj-${Date.now()}`,
          type: differenceVal > 0 ? 'INCOME' : differenceVal < 0 ? 'EXPENSE' : 'INCOME',
          subtype: 'ADJUSTMENT',
          amount: Math.abs(differenceVal), // Always positive; `type` (INCOME/EXPENSE) already encodes the direction.
          date: filterDate,
          description: differenceVal === 0 ? `Arqueo ${auditShift}: Sin diferencia ($${systemBalanceVal})` : `Ajuste Arqueo ${auditShift}: Sistema $${systemBalanceVal} vs Real $${counted}`,
          status: 'completed', paymentMethod: 'CASH',
          registeredBy: 'SISTEMA',
          created_at: nowISO,
          is_closed: true
       };
       await dataService.upsertRecord(TABLES.TRANSACTIONS, adjustmentTx);
       
       setTransactions([auditTx, adjustmentTx, ...transactions.filter(t => {
          if (!activeAudit) return true;
          const isOldAudit = t.id === activeAudit.id;
          const isOldAutoAdj = t.id === `adj-auto-${filterDate}-${filterShift}`;
          const isOldManualAdj = t.subtype === 'ADJUSTMENT' && t.date === filterDate && t.description.includes(filterShift);
          return !isOldAudit && !isOldAutoAdj && !isOldManualAdj;
       }).map(t => {
          const found = filteredShiftTransactions.find(ft => ft.id === t.id);
          return found ? { ...t, is_closed: true } : t;
       })]);
       
       setVerifiedAmounts({});
       setAuditNotes('');
       setEmptyShiftRealAmount(0);
       setIsEditing(false);
       setIsProcessing(false);
       alert(isEditing 
          ? `Cambios al arqueo guardados.\n${differenceVal !== 0 ? `Se generó un nuevo ajuste de $${differenceVal.toLocaleString()}` : 'Sin diferencias, se registró $0.'}`
          : `Arqueo guardado.\n${differenceVal !== 0 ? `Se generó un ajuste de $${differenceVal.toLocaleString()}` : 'Sin diferencias, se registró $0.'}`
       );
    };

   const shiftRangeLabel = filterShift === 'Matutino' ? `8:00 AM – 4:00 PM` : `4:00 PM – 8:00 AM (+1)`;

   return (
      <div className="space-y-6 animate-fade-in pb-20">
         <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
               <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-3">
                  <ClipboardCheck className="text-blue-600" size={32} /> Control de Caja
               </h2>
               <p className="text-slate-500 font-medium">Auditoría, gastos y cierres de turno.</p>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-xl">
               <button onClick={() => setActiveTab('audit')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'audit' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Corte de Caja</button>
               <button onClick={() => setActiveTab('history_tx')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'history_tx' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Historial y Caja</button>
               <button onClick={() => setActiveTab('history_audits')} className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'history_audits' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Historial Arqueos</button>
            </div>
         </header>

         {activeTab === 'audit' && (
            <div className="space-y-6">
               <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-wrap items-end gap-4">
                  <div className="flex items-center gap-2 text-blue-600">
                     <Filter size={18} />
                     <span className="font-black text-sm uppercase tracking-widest">Filtro</span>
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Fecha</label>
                     <input type="date" className="input-std py-2 text-sm" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Turno</label>
                     <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => { setFilterShift('Matutino'); setAuditShift('Matutino'); }} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterShift === 'Matutino' ? 'bg-blue-600 text-white shadow' : 'text-slate-500'}`}>☀️ Matutino</button>
                        <button onClick={() => { setFilterShift('Vespertino'); setAuditShift('Vespertino'); }} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${filterShift === 'Vespertino' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}>🌙 Vespertino</button>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                     <Clock size={14} className="text-slate-400" />
                     <span className="text-xs font-bold text-slate-600">{shiftRangeLabel}</span>
                  </div>
                  <div className="ml-auto text-xs text-slate-400 font-medium">
                     Total pendientes (Booth): <span className="font-black text-slate-700">{allOpenCount}</span>
                  </div>
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="space-y-6">
                     <div className="bg-slate-900 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-7 text-white shadow-2xl relative overflow-hidden">
                        <div className="relative z-10">
                           <div className="flex justify-between items-start mb-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Turno {filterShift}</p>
                              <span className="bg-white/10 px-2 py-1 rounded text-[9px] font-bold text-emerald-400">{shiftRangeLabel}</span>
                           </div>
                           <div className="text-4xl font-black tracking-tighter mb-3">${systemBalance.toLocaleString()}</div>
                           <div className="text-xs text-slate-400 font-medium space-y-1">
                              <p className="flex justify-between"><span>Movimientos:</span> <span className="text-white font-bold">{openSummary.count}</span></p>
                              <p className="flex justify-between text-emerald-400"><span>Ingresos:</span> <span>+${openSummary.income.toLocaleString()}</span></p>
                              <p className="flex justify-between text-red-400"><span>Gastos:</span> <span>-${openSummary.expenses.toLocaleString()}</span></p>
                           </div>
                        </div>
                        <Wallet className="absolute -bottom-6 -right-6 text-white/5 w-36 h-36 rotate-12" />
                     </div>

                     <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-7 border border-slate-200 shadow-sm">
                        <h4 className="font-black text-slate-800 text-base flex items-center gap-2 mb-3">
                           {expenseForm.type === 'EXPENSE' ? <TrendingDown className="text-red-500" /> : <DollarSign className="text-emerald-500" />}
                           Registrar Movimiento
                        </h4>
                        <div className="space-y-3">
                           <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                              <select className="input-std w-full py-2 bg-slate-50 text-sm" value={expenseForm.type || 'EXPENSE'} onChange={e => {
                                 const newType = e.target.value as any;
                                 let newSubtype = 'OTROS_GASTOS';
                                 if (newType === 'EXPENSE') newSubtype = 'OTROS_GASTOS';
                                 else if (newType === 'INCOME') newSubtype = 'PENSION';
                                 else if (newType === 'RENT') newSubtype = 'LOCAL';
                                 else if (newType === 'RESERVATION') newSubtype = 'EVENT';
                                 setExpenseForm({ ...expenseForm, type: newType, category: newSubtype });
                              }}>
                                 <option value="EXPENSE">Egreso (Gasto)</option>
                                 <option value="INCOME">Ingreso (Entrada)</option>
                                 <option value="RENT">Renta</option>
                                 <option value="RESERVATION">Reserva</option>
                              </select>
                           </div>
                           <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</label>
                              {(!expenseForm.type || expenseForm.type === 'EXPENSE') ? (
                                 <select className="input-std w-full py-2 bg-slate-50 text-sm" value={expenseForm.category || 'OTROS_GASTOS'} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}>
                                    <option value="OTROS_GASTOS">Otros Gastos</option>
                                    <option value="NOMINA">Nómina</option>
                                    <option value="MANTENIMIENTO_MEJORAS">Mantenimiento y Mejoras</option>
                                     <option value="PAPELERIA_OFICINA">Papelería y Oficina</option>
                                     <option value="TELEFONO_INTERNET">Teléfono e Internet</option>
                                     <option value="DESPENSA_LIMPIEZA">Despensa y Limpieza</option>
                                     <option value="MANTENIMIENTO">Mantenimiento (Gral)</option>
                                    <option value="SERVICIOS_BASICOS">Servicios (Luz/Agua)</option>
                                    <option value="SERVICIOS_PRO">Servicios Pro</option>
                                    <option value="TAXES">Impuestos</option>
                                 </select>
                              ) : (expenseForm.type === 'INCOME') ? (
                                 <select className="input-std w-full py-2 bg-slate-50 text-sm font-bold text-slate-700" value={expenseForm.category || 'PENSION'} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}>
                                    <option value="PENSION">Membresía / Pensión Estacionamiento</option>
                                    <option value="OTHER">Ingreso General Estacionamiento</option>
                                 </select>
                              ) : (expenseForm.type === 'RENT') ? (
                                 <select className="input-std w-full py-2 bg-slate-50 text-sm" value={expenseForm.category || 'LOCAL'} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}>
                                    <option value="LOCAL">Local Comercial</option>
                                    <option value="OFICINA">Oficina</option>
                                 </select>
                              ) : (
                                 <select className="input-std w-full py-2 bg-slate-50 text-sm" value={expenseForm.category || 'OTHER'} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}>
                                    <option value="OTHER">General</option>
                                    <option value="EVENT">Eventos</option>
                                 </select>
                              )}
                           </div>
                           <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Concepto</label>
                              <input type="text" className="input-std w-full text-sm" placeholder="Detalle..." value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} />
                           </div>
                           <div>
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto ($)</label>
                              <input type="number" className={`input-std w-full font-black text-sm ${expenseForm.type === 'EXPENSE' ? 'text-red-600' : 'text-emerald-600'}`} placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                           </div>
                           <button onClick={registerExpense} disabled={isProcessing} className={`w-full py-3 border rounded-xl font-black text-xs uppercase tracking-widest transition-all ${expenseForm.type === 'EXPENSE' ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'}`}>
                              {isProcessing ? 'Guardando...' : 'Registrar'}
                           </button>
                        </div>
                     </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                     <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm p-6 sm:p-7">
                        <h3 className="font-black text-xl text-slate-800 mb-4 flex items-center gap-3">
                           <Calculator className="text-blue-600" /> Arqueo — {filterShift} ({filterDate})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                           <div className="bg-slate-100 rounded-2xl p-4 text-center">
                              <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Sistema (Efectivo)</p>
                              <p className="text-2xl font-black text-slate-800">${systemBalance.toLocaleString()}</p>
                           </div>
                           <div className="bg-blue-50 rounded-2xl p-4 text-center border-2 border-blue-200">
                              <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Real</p>
                              {filteredShiftTransactions.length === 0 && (!activeAudit || isSystemAudit || isEditing) ? (
                                 <div className="flex items-center justify-center gap-1 my-1">
                                    <span className="text-xl font-black text-blue-800">$</span>
                                    <input 
                                       type="number" 
                                       className="w-24 bg-transparent outline-none border-b-2 border-blue-400 font-black text-xl text-center text-blue-800" 
                                       value={emptyShiftRealAmount || ''} 
                                       onChange={e => {
                                          const val = parseFloat(e.target.value);
                                          setEmptyShiftRealAmount(isNaN(val) ? 0 : val);
                                       }} 
                                       placeholder="0"
                                    />
                                 </div>
                              ) : (
                                 <p className="text-2xl font-black text-blue-800">${totalReal.toLocaleString()}</p>
                              )}
                           </div>
                           <div className={`rounded-2xl p-4 text-center ${difference === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                              <p className={`text-[10px] font-black uppercase mb-1 ${difference === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>Diferencia</p>
                              <p className={`text-2xl font-black ${difference === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                 ${difference.toLocaleString()}
                              </p>
                           </div>
                        </div>

                        {/* Rubro Membresías de Estacionamiento */}
                        <div className="bg-violet-50 rounded-2xl p-4 mb-4 border border-violet-100 flex justify-around items-center">
                           <div className="text-center">
                              <p className="text-[10px] font-black text-violet-600 uppercase mb-0.5">Membresías del Turno</p>
                              <p className="text-xl font-black text-violet-800">${shiftMemberships.toLocaleString()}</p>
                           </div>
                           <div className="h-8 w-px bg-violet-200" />
                           <div className="text-center">
                              <p className="text-[10px] font-black text-violet-600 uppercase mb-0.5">Membresías Acumuladas Mes</p>
                              <p className="text-xl font-black text-violet-800">${monthMemberships.toLocaleString()}</p>
                           </div>
                        </div>

                        {activeAudit && !isSystemAudit && (
                           <div className="mb-4 space-y-2">
                              <div className="px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-medium flex justify-between items-center">
                                 <span>✓ Turno {formatLocalDate(activeAudit.date)} ({activeAudit.shift}) — Realizado el {formatMexicoDateTime(activeAudit.created_at)} por {activeAudit.registeredBy}</span>
                                 {currentUser.role === UserRole.OWNER && !isEditing && (
                                    <button 
                                       onClick={() => {
                                          setIsEditing(true);
                                          setAuditNotes(activeAudit.notes || '');
                                          const initialVerified: Record<string, number> = {};
                                          filteredShiftTransactions.forEach(tx => {
                                             initialVerified[tx.id] = Math.abs(tx.amount);
                                          });
                                          setVerifiedAmounts(initialVerified);
                                          setEmptyShiftRealAmount(activeAudit.audit_declared_amount || 0);
                                       }}
                                       className="ml-2 px-3 py-1 bg-blue-600 text-white rounded-lg font-black text-[10px] uppercase hover:bg-blue-700 transition-colors shadow-sm"
                                    >
                                       Editar Arqueo
                                    </button>
                                 )}
                              </div>
                              {isEditing && (
                                 <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 font-medium flex justify-between items-center animate-fade-in">
                                    <span>Modo Edición (Propietario). Modifique notas o montos reales y guarde para aplicar.</span>
                                    <button 
                                       onClick={() => setIsEditing(false)}
                                       className="ml-2 px-3 py-1 bg-slate-200 text-slate-700 rounded-lg font-black text-[10px] uppercase hover:bg-slate-300 transition-colors"
                                    >
                                       Cancelar
                                    </button>
                                 </div>
                              )}
                           </div>
                        )}
                        {isSystemAudit && (
                           <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-medium flex items-center gap-2 animate-pulse">
                              <AlertCircle size={14} className="text-amber-500" /> Corte automático del sistema. Realice el arqueo manual para validar e ingresar la cantidad real de efectivo.
                           </div>
                        )}
                        <div className="flex gap-3 mb-4">
                           <input type="text" className="input-std flex-1 text-sm font-bold" placeholder="Notas del arqueo..." value={(activeAudit && !isSystemAudit && !isEditing) ? activeAudit.notes || '' : auditNotes} onChange={e => setAuditNotes(e.target.value)} disabled={activeAudit && !isSystemAudit && !isEditing} />
                        </div>
                        <button onClick={handleSaveAudit} disabled={isProcessing || (activeAudit && !isSystemAudit && !isEditing)} className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-[1.02] transition-all shadow-xl flex justify-center items-center gap-2 disabled:opacity-40">
                           {(activeAudit && !isSystemAudit && !isEditing) ? 'Turno Auditado' : (isProcessing ? 'Procesando...' : <><Save size={18} /> {isEditing ? 'Guardar Cambios' : 'Guardar Arqueo'}</>)}
                        </button>
                     </div>

                     <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden overflow-x-auto">
                        <div className="min-w-[700px]">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                           <h3 className="font-black text-base text-slate-800 flex items-center gap-2"><List className="text-blue-600" /> Movimientos del Turno</h3>
                           <div className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{openSummary.count} mov.</div>
                        </div>
                        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                           <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 border-b font-black text-slate-500 uppercase text-[10px] tracking-widest sticky top-0">
                                 <tr>
                                    <th className="p-4">Hora</th>
                                    <th className="p-4">Descripción</th>
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4 text-right">Sistema</th>
                                    <th className="p-4 text-right bg-blue-50/50 text-blue-800">Real</th>
                                    <th className="p-4 text-center">OK</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {filteredShiftTransactions.map(tx => {
                                    const isExp = tx.type === 'EXPENSE' || Number(tx.amount) < 0;
                                    const isCsh = tx.paymentMethod === 'CASH';
                                    const isDup = tx.ticketId && duplicateTicketIds.includes(tx.ticketId);
                                    const sysAmt = Number(tx.amount) || 0;
                                    const realAmt = verifiedAmounts[tx.id] !== undefined ? verifiedAmounts[tx.id] : Math.abs(sysAmt);
                                    const diff = realAmt - Math.abs(sysAmt);
                                    return (
                                       <tr key={tx.id} className={`border-b hover:bg-slate-50 transition-colors ${isDup ? 'bg-red-50' : diff !== 0 ? 'bg-amber-50' : ''}`}>
                                          <td className="p-4 font-mono text-xs text-slate-500 font-bold">
                                             <div className="flex items-center gap-2">
                                                {isCsh ? (
                                                   <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Sumando al total"></div>
                                                ) : (
                                                   <div className="w-2 h-2 rounded-full bg-slate-200" title="No suma (No Efectivo)"></div>
                                                )}
                                                {getMexicoTimeStr(tx)}
                                             </div>
                                          </td>
                                          <td className="p-4">
                                             <div className="font-bold text-slate-700 text-xs flex items-center gap-1">
                                                {tx.description}
                                                {isDup && <span title="Repetido"><AlertCircle size={10} className="text-red-500" /></span>}
                                             </div>
                                             {tx.ticketId && <div className="text-[9px] text-slate-400 font-mono">ID: {tx.ticketId}</div>}
                                          </td>
                                          <td className="p-4">
                                             <div className="flex flex-col gap-1">
                                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase w-fit ${isExp ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                   {tx.parkingType || 'PARKING'}
                                                </span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">{tx.paymentMethod}</span>
                                             </div>
                                          </td>
                                          <td className={`p-4 text-right font-mono text-xs font-bold ${isExp ? 'text-red-500' : 'text-slate-600'}`}>
                                             {isExp ? '-' : '+'}${Math.abs(sysAmt).toLocaleString()}
                                          </td>
                                          <td className="p-4 text-right bg-blue-50/30">
                                             <input type="number" disabled={activeAudit && !isSystemAudit && !isEditing} className={`w-20 text-right bg-transparent border-b-2 outline-none font-bold font-mono text-xs ${diff !== 0 ? 'border-amber-400 text-amber-700' : 'border-slate-200 text-slate-700'}`} value={realAmt} onChange={(e) => {
                                                const v = parseFloat(e.target.value);
                                                setVerifiedAmounts(prev => ({ ...prev, [tx.id]: isNaN(v) ? 0 : v }));
                                             }} />
                                          </td>
                                          <td className="p-4 text-center">
                                             <div className="flex items-center justify-center gap-2">
                                                 {diff === 0 ? <CircleCheck size={14} className="text-emerald-500" /> : <AlertCircle size={14} className="text-amber-500" />}
                                                 {!tx.is_closed && (
                                                    <button 
                                                       onClick={() => handleDeleteTransaction(tx.id)}
                                                       className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                       title="Eliminar movimiento"
                                                    >
                                                       <Trash2 size={14} />
                                                    </button>
                                                 )}
                                              </div>
                                          </td>
                                       </tr>
                                    );
                                 })}
                                 {filteredShiftTransactions.length === 0 && (
                                    <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold italic">No hay movimientos abiertos en este turno.</td></tr>
                                 )}
                              </tbody>
                           </table>
                        </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {activeTab === 'history_tx' && (
            <TransactionHistory
               transactions={transactions}
               onEdit={openEditMovement}
               onDelete={handleDeleteTransaction}
               onAddMovement={openAddMovement}
               onAddHistorical={openAddHistorical}
            />
         )}

         {activeTab === 'history_audits' && (
            <div className="space-y-4">
               {corteHistory.length === 0 && (
                  <div className="bg-white rounded-[2.5rem] p-16 text-center border border-slate-200">
                     <ClipboardCheck className="mx-auto text-slate-300 mb-4" size={48} />
                     <p className="text-slate-400 font-bold">No hay arqueos registrados aún.</p>
                  </div>
               )}
               {corteHistory.slice(0, visibleHistoryCount).map(corte => {
                  const df = corte.audit_difference || 0;
                  const isPerfect = Math.abs(df) < 1;
                  // An automatic system cut (no human ever counted the physical cash) must never be
                  // presented the same as a real, human-verified audit — even when its "difference" is $0,
                  // that $0 is fabricated (declared = system by construction), not a verified match.
                  const isAutoAudit = corte.registeredBy === 'SISTEMA' || corte.id.startsWith('audit-auto-');
                  const executionDateTimeStr = formatMexicoDateTime(corte.created_at);
                  return (
                     <div key={corte.id} className={`bg-white rounded-[2rem] border shadow-sm overflow-hidden transition-all ${isAutoAudit ? 'border-amber-300' : 'border-slate-200'}`}>
                        <div className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                           <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isAutoAudit ? 'bg-amber-100' : isPerfect ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                                 {isAutoAudit ? <AlertCircle className="text-amber-600" size={20} /> : isPerfect ? <CircleCheck className="text-emerald-600" size={20} /> : <AlertCircle className="text-amber-600" size={20} />}
                              </div>
                              <div className="text-left">
                                 <div className="font-black text-slate-800 flex items-center gap-2">
                                    Turno: {formatLocalDate(corte.date)} ({corte.shift || 'N/A'})
                                    {isAutoAudit && (
                                       <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase tracking-widest">Automático · No Verificado</span>
                                    )}
                                 </div>
                                 <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-0.5">
                                    <span className="flex items-center gap-1 font-bold text-slate-500"><Clock size={12} className="text-blue-500" /> Auditado el: {executionDateTimeStr}</span>
                                    <span className="flex items-center gap-1"><UserIcon size={12} /> {corte.registeredBy}</span>
                                 </div>
                              </div>
                           </div>
                           <div className="flex items-center gap-5">
                              <div className="text-right">
                                 <div className="text-[10px] font-black text-slate-400 uppercase">Sistema</div>
                                 <div className="font-mono font-bold text-slate-600 text-sm">${(corte.audit_system_amount || 0).toLocaleString()}</div>
                              </div>
                              <div className="text-right">
                                 <div className="text-[10px] font-black text-slate-400 uppercase">Real</div>
                                 <div className="font-mono font-bold text-slate-800 text-sm">${(corte.audit_declared_amount || 0).toLocaleString()}</div>
                              </div>
                              <div className={`px-3 py-1 rounded-full text-[10px] font-black ${isAutoAudit ? 'bg-amber-100 text-amber-700' : isPerfect ? 'bg-emerald-100 text-emerald-700' : df < 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                 {isAutoAudit ? 'Sin validar' : `${df > 0 ? '+' : ''}${df.toLocaleString()}`}
                              </div>
                           </div>
                        </div>
                        <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                           {corte.notes && <div className="mb-3 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-medium">📝 {corte.notes}</div>}
                           <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                 <div className="text-[9px] font-black text-slate-400 uppercase flex justify-between"><span>🚗 Normales</span><span>{corte.cars_normal || 0}</span></div>
                                 <div className="text-lg font-black text-slate-800 mt-1">${(corte.amount_normal || 0).toLocaleString()}</div>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                 <div className="text-[9px] font-black text-slate-400 uppercase flex justify-between"><span>🏠 Locatarios</span><span>{corte.cars_locatario || 0}</span></div>
                                 <div className="text-lg font-black text-blue-700 mt-1">${(corte.amount_locatario || 0).toLocaleString()}</div>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200">
                                 <div className="text-[9px] font-black text-violet-500 uppercase">💳 Membresías</div>
                                 <div className="text-lg font-black text-violet-700 mt-1">${(corte.amount_memberships || 0).toLocaleString()}</div>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-center">
                                 <div className="text-[9px] font-black text-slate-400 uppercase text-center mb-1">🎁 Cortesías</div>
                                 <div className="text-xl font-black text-amber-500 text-center">{corte.courtesies || 0}</div>
                              </div>
                           </div>
                           {currentUser.role === UserRole.OWNER && (
                              <div className="flex justify-end pt-1">
                                 <button
                                    onClick={() => {
                                       setFilterDate(corte.date);
                                       setFilterShift(corte.shift as 'Matutino' | 'Vespertino');
                                       setAuditShift(corte.shift as 'Matutino' | 'Vespertino');
                                       setActiveTab('audit');
                                       setIsEditing(true);
                                       setAuditNotes(corte.notes || '');
                                       // Prepopulate verified amounts
                                       const range = getShiftRange(corte.date, corte.shift || 'Matutino');
                                       const shiftTxs = transactions.filter(t => {
                                          if (t.status !== 'completed') return false;
                                          const auditableTypes = ['PARKING', 'EXPENSE', 'INCOME', 'RENT', 'RESERVATION', 'AD_INCOME'];
                                          if (!auditableTypes.includes(t.type)) return false;
                                          if (t.subtype === 'ADJUSTMENT') return false;
                                          const txDate = getMexicoDate(t);
                                          return txDate >= range.start && txDate < range.end;
                                       });
                                       const initialVerified: Record<string, number> = {};
                                       shiftTxs.forEach(tx => {
                                          initialVerified[tx.id] = Math.abs(tx.amount);
                                       });
                                       setVerifiedAmounts(initialVerified);
                                       setEmptyShiftRealAmount(corte.audit_declared_amount || 0);
                                    }}
                                    className="px-4 py-1.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase hover:bg-blue-700 transition-colors shadow-sm animate-fade-in"
                                 >
                                    Editar Arqueo
                                 </button>
                              </div>
                           )}
                        </div>
                     </div>
                  );
               })}
               {visibleHistoryCount < corteHistory.length && (
                  <div className="flex justify-center pt-4">
                     <button 
                        onClick={() => setVisibleHistoryCount(prev => prev + 20)}
                        className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-50 transition-all shadow-sm"
                     >
                        Cargar más arqueos ({corteHistory.length - visibleHistoryCount} restantes)
                     </button>
                  </div>
               )}
            </div>
         )}

         {movementModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
               <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={closeMovementModal}></div>
               <div className="relative bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-2xl animate-scale-up">
                  <div className="flex justify-between items-center mb-6">
                     <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                        {movementModal.mode === 'edit' ? <Edit2 size={18} className="text-blue-600" /> : <ClipboardCheck size={18} className="text-blue-600" />}
                        {movementModal.mode === 'edit' ? 'Editar Movimiento' : movementModal.mode === 'add-historical' ? 'Histórico Manual' : 'Registrar Movimiento'}
                     </h3>
                     <button onClick={closeMovementModal} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400">
                        <X size={16} />
                     </button>
                  </div>

                  <div className="space-y-3">
                     <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                        <select
                           className="input-std w-full py-2 bg-slate-50 text-sm"
                           value={movementModal.type}
                           onChange={e => {
                              const newType = e.target.value as Transaction['type'];
                              let newCategory: NonNullable<Transaction['subtype']> = 'OTROS_GASTOS';
                              if (newType === 'INCOME') newCategory = 'PENSION';
                              else if (newType === 'RENT') newCategory = 'LOCAL';
                              else if (newType === 'RESERVATION' || newType === 'HISTORICAL') newCategory = 'OTHER';
                              setMovementModal({ ...movementModal, type: newType, category: newCategory });
                           }}
                        >
                           <option value="EXPENSE">Egreso (Gasto)</option>
                           <option value="INCOME">Ingreso (Entrada)</option>
                           <option value="RENT">Renta</option>
                           <option value="RESERVATION">Reserva</option>
                           <option value="HISTORICAL">Histórico</option>
                        </select>
                     </div>
                     <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</label>
                        {movementModal.type === 'EXPENSE' ? (
                           <select className="input-std w-full py-2 bg-slate-50 text-sm" value={movementModal.category} onChange={e => setMovementModal({ ...movementModal, category: e.target.value as NonNullable<Transaction['subtype']> })}>
                              <option value="OTROS_GASTOS">Otros Gastos</option>
                              <option value="NOMINA">Nómina</option>
                              <option value="MANTENIMIENTO_MEJORAS">Mantenimiento y Mejoras</option>
                              <option value="PAPELERIA_OFICINA">Papelería y Oficina</option>
                              <option value="TELEFONO_INTERNET">Teléfono e Internet</option>
                              <option value="DESPENSA_LIMPIEZA">Despensa y Limpieza</option>
                              <option value="MANTENIMIENTO">Mantenimiento (Gral)</option>
                              <option value="SERVICIOS_BASICOS">Servicios (Luz/Agua)</option>
                              <option value="SERVICIOS_PRO">Servicios Pro</option>
                              <option value="TAXES">Impuestos</option>
                           </select>
                        ) : movementModal.type === 'INCOME' ? (
                           <select className="input-std w-full py-2 bg-slate-50 text-sm font-bold text-slate-700" value={movementModal.category} onChange={e => setMovementModal({ ...movementModal, category: e.target.value as NonNullable<Transaction['subtype']> })}>
                              <option value="PENSION">Membresía / Pensión Estacionamiento</option>
                              <option value="OTHER">Ingreso General Estacionamiento</option>
                           </select>
                        ) : movementModal.type === 'RENT' ? (
                           <select className="input-std w-full py-2 bg-slate-50 text-sm" value={movementModal.category} onChange={e => setMovementModal({ ...movementModal, category: e.target.value as NonNullable<Transaction['subtype']> })}>
                              <option value="LOCAL">Local Comercial</option>
                              <option value="OFICINA">Oficina</option>
                           </select>
                        ) : (
                           <select className="input-std w-full py-2 bg-slate-50 text-sm" value={movementModal.category} onChange={e => setMovementModal({ ...movementModal, category: e.target.value as NonNullable<Transaction['subtype']> })}>
                              <option value="OTHER">General</option>
                              <option value="EVENT">Eventos</option>
                           </select>
                        )}
                     </div>
                     <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                        <input type="date" className="input-std w-full text-sm" value={movementModal.date} onChange={e => setMovementModal({ ...movementModal, date: e.target.value })} />
                     </div>
                     <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Concepto</label>
                        <input type="text" className="input-std w-full text-sm" placeholder="Detalle..." value={movementModal.description} onChange={e => setMovementModal({ ...movementModal, description: e.target.value })} />
                     </div>
                     <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto ($)</label>
                        <input type="number" className={`input-std w-full font-black text-sm ${movementModal.type === 'EXPENSE' ? 'text-red-600' : 'text-emerald-600'}`} placeholder="0.00" value={movementModal.amount} onChange={e => setMovementModal({ ...movementModal, amount: e.target.value })} />
                     </div>
                     <button
                        onClick={handleSaveMovementModal}
                        disabled={isSavingMovement}
                        className={`w-full py-3 border rounded-xl font-black text-xs uppercase tracking-widest transition-all ${movementModal.type === 'EXPENSE' ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white'}`}
                     >
                        {isSavingMovement ? 'Guardando...' : movementModal.mode === 'edit' ? 'Guardar Cambios' : 'Registrar'}
                     </button>
                  </div>
               </div>
            </div>
         )}

         <style>{`
         .input-std { padding: 0.8rem 1rem; border: 2px solid #f1f5f9; border-radius: 1rem; font-size: 0.9rem; font-weight: 700; color: #1e293b; outline: none; transition: all 0.2s; }
         .input-std:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
         `}</style>
      </div>
   );
};

export default CashAudit;
