
import React, { useState, useMemo } from 'react';
import { 
  Users, Store, LayoutDashboard, Wallet, Settings, Camera, Plus, Edit2, 
  Trash2, History, Loader2, FileText, ExternalLink, Save, Search, 
  MessageCircle, AlertCircle, Clock, Info, Calendar as CalendarIcon, 
  CalendarDays, Car, RefreshCw, X, Download, ShieldCheck, DollarSign,
  CreditCard, CircleCheck, XCircle, Eraser, Image as ImageIcon, Upload,
  ArrowLeft, CheckCircle, Send, ShoppingBag, User, Building, CarFront,
  HandCoins, TrendingUp, ListChecks, Terminal, ChevronRight, ArrowRight,
  UserPlus, ShieldAlert, BarChart3, Activity, Zap, ArrowUpRight, Database,
  Megaphone, FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { 
  Tenant, Transaction, FrequentCustomer, Reservation, ParkingConfig, 
  UserRole, GalleryImage, PaymentMethod, ParkingType, LoginUser
} from '../types';
import { dataService, TABLES } from '../services/dataService';
import { useToast } from './ui/ServeToast';
import { getLocalDateString } from '../utils/parkingLogic';

// Modular Components
import { UserManagement } from './UserManagement';
import { GalleryManager } from './GalleryManager';
import { SystemConfig } from './SystemConfig';
import { TenantManager } from './TenantManager';
import FinancialMovements from './FinancialMovements';
import { CalendarView } from './CalendarView';
import { POSSyncView } from './POSSyncView';
import { PayrollManager } from './PayrollManager';
import { TaskBoard } from './TaskBoard';
import { CollectionDashboard } from './CollectionDashboard';
import { AccountingView } from './AccountingView';
import { calculateTenantDebt } from '../utils/tenantLogic';
import { plaza } from '../config/plaza';

export const AdminPanel: React.FC = () => {
  const { 
    authenticatedUser: currentUser, 
    tenants, 
    transactions, 
    frequentCustomers, 
    reservations, 
    parkingConfig,
    users,
    staff,
    attendanceRecords,
    payrollRecords,
    galleryImages,
    syncFromLocalCache
  } = useStore();
  
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'tenants' | 'pension' | 'collection' | 'reservations' | 'movimientos' | 'accounting' | 'gallery' | 'users' | 'nomina' | 'tasks' | 'config' | 'sync'>('tenants');
  const [isSyncing, setIsSyncing] = useState(false);

  // --- LOCAL STATE: PENSIONS ---
  const [showPensionForm, setShowPensionForm] = useState(false);
  const [editingPension, setEditingPension] = useState<Partial<FrequentCustomer> | null>(null);

  // --- ACTIONS: PENSIONS ---
  const handleSavePension = async () => {
    if (!editingPension?.name || !editingPension?.plate) return;
    setIsSyncing(true);
    try {
        const id = editingPension.id || `pen-${Date.now()}`;
        await dataService.upsertRecord(TABLES.FREQUENT_CUSTOMERS, { ...editingPension, id, active: true } as FrequentCustomer);
        syncFromLocalCache();
        setShowPensionForm(false);
        setEditingPension(null);
        toast("Pensionado guardado", "success");
    } catch (e) {
        toast("Error al guardar", "error");
    } finally {
        setIsSyncing(false);
    }
  };

  const handleSaveTx = async (newTx: any) => {
    setIsSyncing(true);
    try {
        await dataService.upsertRecord(TABLES.TRANSACTIONS, newTx);
        syncFromLocalCache();
        toast("Registro guardado exitosamente", "success");
    } catch (e) {
        toast("Error al guardar", "error");
    } finally {
        setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Dynamic Header Sidebar can be added here if needed, but keeping it simple for now as requested */}
      <div className="flex-1 p-8 lg:p-12">
         <div className="max-w-[1600px] mx-auto">
            {/* Tabs Navigation */}
            <div className="mb-12 w-full overflow-x-auto pb-4 -mb-4 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
               <nav className="flex flex-nowrap gap-2 bg-white/50 p-2 rounded-full border border-slate-100 shadow-sm backdrop-blur-md w-max">
                  <TabItem id="tenants" label="Inquilinos" icon={Building} active={activeTab === 'tenants'} onClick={setActiveTab} />
                  <TabItem id="pension" label="Pensionados" icon={CarFront} active={activeTab === 'pension'} onClick={setActiveTab} />
                  <TabItem id="collection" label="Cobranza" icon={Wallet} active={activeTab === 'collection'} onClick={setActiveTab} />
                  <TabItem id="accounting" label="Contabilidad" icon={FileSpreadsheet} active={activeTab === 'accounting'} onClick={setActiveTab} />
                  <TabItem id="reservations" label="Agenda" icon={CalendarDays} active={activeTab === 'reservations'} onClick={setActiveTab} />
                  <TabItem id="movimientos" label="$ Movimientos" icon={DollarSign} active={activeTab === 'movimientos'} onClick={setActiveTab} />
                  <TabItem id="gallery" label="Fotos" icon={ImageIcon} active={activeTab === 'gallery'} onClick={setActiveTab} />
                  <TabItem id="users" label="Equipo" icon={Users} active={activeTab === 'users'} onClick={setActiveTab} />
                  <TabItem id="nomina" label="Nómina" icon={HandCoins} active={activeTab === 'nomina'} onClick={setActiveTab} />
                  <TabItem id="tasks" label="Pendientes" icon={ListChecks} active={activeTab === 'tasks'} onClick={setActiveTab} />
                  <TabItem id="config" label="Ajustes" icon={Settings} active={activeTab === 'config'} onClick={setActiveTab} />
                  <TabItem id="sync" label="Sinc POS" icon={RefreshCw} active={activeTab === 'sync'} onClick={setActiveTab} />
               </nav>
            </div>

            <AnimatePresence mode="wait">
               <motion.div
                 key={activeTab}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 transition={{ duration: 0.2 }}
               >
                   {activeTab === 'collection' && (
                      <CollectionDashboard 
                         tenants={tenants} 
                         transactions={transactions} 
                         frequentCustomers={frequentCustomers}
                         reservations={reservations}
                         setSelectedTenantHistory={() => {}}
                         setActiveTab={setActiveTab}
                         calculateTenantDebt={calculateTenantDebt}
                      />
                   )}
                  
                  {activeTab === 'accounting' && (
                     <AccountingView transactions={transactions} onUpdate={async () => { syncFromLocalCache(); }} />
                  )}

                  {activeTab === 'tenants' && (
                     <TenantManager 
                        tenants={tenants} 
                        transactions={transactions} 
                        onUpdate={() => syncFromLocalCache()}
                     />
                  )}

                  {activeTab === 'reservations' && (
                     <CalendarView
                        reservations={reservations}
                        setReservations={() => syncFromLocalCache()}
                        handleSave={async (table, data) => {
                            await dataService.upsertRecord(table, data);
                            syncFromLocalCache();
                        }}
                        handleDelete={async (table, id) => {
                            await dataService.deleteRecord(table, id);
                            syncFromLocalCache();
                        }}
                     />
                  )}

                  {activeTab === 'movimientos' && (
                     <FinancialMovements
                        transactions={transactions}
                        setTransactions={() => syncFromLocalCache()}
                        handleSave={async (table, data) => {
                           await dataService.upsertRecord(table, data);
                           syncFromLocalCache();
                        }}
                        handleDelete={async (table, id) => {
                           if (window.confirm('¿Eliminar este movimiento?')) {
                              // Optimistic update in store
                              if (table === TABLES.TRANSACTIONS) {
                                 const currentTxs = useStore.getState().transactions;
                                 useStore.setState({ transactions: currentTxs.filter(tx => tx.id !== id) });
                              }

                              await dataService.deleteRecord(table, id);
                              syncFromLocalCache();
                           }
                        }}
                     />
                  )}

                  {activeTab === 'gallery' && (
                     <GalleryManager
                        images={galleryImages}
                        onUpdate={() => syncFromLocalCache()}
                     />
                  )}

                  {activeTab === 'users' && (
                     <UserManagement
                        currentUser={currentUser!}
                        users={users}
                        setUsers={() => syncFromLocalCache()}
                     />
                  )}

                  {activeTab === 'nomina' && (
                     <PayrollManager 
                         staff={staff} 
                         setStaff={(s) => useStore.setState(state => ({ staff: typeof s === 'function' ? s(state.staff) : s }))}
                         attendance={attendanceRecords}
                         setAttendance={(a) => useStore.setState(state => ({ attendanceRecords: typeof a === 'function' ? a(state.attendanceRecords) : a }))}
                         payrollRecords={payrollRecords}
                         setPayrollRecords={(p) => useStore.setState(state => ({ payrollRecords: typeof p === 'function' ? p(state.payrollRecords) : p }))}
                         transactions={transactions}
                         setTransactions={(t) => useStore.setState(state => ({ transactions: typeof t === 'function' ? t(state.transactions) : t }))}
                         currentUser={currentUser!}
                      />
                  )}

                  {activeTab === 'tasks' && (
                     <TaskBoard 
                        currentUser={currentUser!} 
                        users={users} 
                     />
                  )}

                  {activeTab === 'config' && parkingConfig && (
                     <SystemConfig
                        config={parkingConfig}
                        onUpdate={() => syncFromLocalCache()}
                     />
                  )}

                  {activeTab === 'sync' && (
                     <POSSyncView
                        transactions={transactions}
                        setTransactions={() => syncFromLocalCache()}
                        config={parkingConfig}
                     />
                  )}

                  {activeTab === 'pension' && (
                     <PensionView 
                        frequentCustomers={frequentCustomers} 
                        onAdd={() => { setEditingPension({ monthlyFee: 800, nextPaymentDate: getLocalDateString(), active: true }); setShowPensionForm(true); }}
                        onEdit={(p) => { setEditingPension(p); setShowPensionForm(true); }}
                     />
                  )}
               </motion.div>
            </AnimatePresence>
         </div>
      </div>

      {/* MODAL: Pensionado */}
      {showPensionForm && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in-up border border-slate-200">
             <div className="bg-slate-50 p-6 flex justify-between items-center border-b">
               <h3 className="font-black text-xl flex items-center gap-2">
                 <Car className="text-blue-600" />
                 {editingPension?.id ? 'Editar Pensionado' : 'Nuevo Pensionado'}
               </h3>
               <button onClick={() => setShowPensionForm(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                 <X size={20} />
               </button>
             </div>
             <div className="p-8 space-y-4">
                 <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                     <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800" value={editingPension?.name || ''} onChange={e => setEditingPension({...editingPension, name: e.target.value})} />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Placas</label>
                         <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold uppercase text-slate-800" value={editingPension?.plate || ''} onChange={e => setEditingPension({...editingPension, plate: e.target.value.toUpperCase()})} />
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                         <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800" value={editingPension?.phone || ''} onChange={e => setEditingPension({...editingPension, phone: e.target.value})} />
                     </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mensualidad ($)</label>
                         <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800" value={editingPension?.monthlyFee || ''} onChange={e => setEditingPension({...editingPension, monthlyFee: Number(e.target.value)})} />
                     </div>
                     <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Próximo Pago</label>
                         <input type="date" className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 font-bold text-slate-800" value={editingPension?.nextPaymentDate || ''} onChange={e => setEditingPension({...editingPension, nextPaymentDate: e.target.value})} />
                     </div>
                 </div>
                 <button onClick={handleSavePension} disabled={isSyncing} className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mt-4 shadow-xl shadow-slate-200">
                    {isSyncing ? <Loader2 className="animate-spin" /> : <Save size={18} />} Guardar Pensionado
                 </button>
             </div>
           </div>
         </div>
      )}
    </div>
  );
};

const TabItem = ({ id, label, icon: Icon, active, onClick }: any) => (
  <button 
    onClick={() => onClick(id)}
    className={`flex shrink-0 items-center gap-3 px-6 py-3.5 rounded-full transition-all duration-300 relative group ${active ? 'text-white' : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
  >
     {active && (
        <motion.div
            layoutId="activeTab"
           className="absolute inset-0 bg-slate-900 rounded-full shadow-lg shadow-slate-900/10"
           transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
        />
     )}
     <Icon size={18} className={`relative z-10 ${active ? 'text-blue-400' : 'text-slate-400 group-hover:text-blue-500 transition-colors'}`} />
     <span className="relative z-10 text-[11px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const DashboardView = ({ transactions, tenants }: { transactions: Transaction[], tenants: Tenant[] }) => {
    const isIncome = (tx: Transaction) => {
        return ['INCOME', 'RESERVATION', 'PARKING', 'RENT', 'AD_INCOME', 'HISTORICAL'].includes(tx.type);
    };

    const income = useMemo(() => transactions.filter(isIncome).reduce((sum, t) => sum + (t.amount || 0), 0), [transactions]);
    const expenses = useMemo(() => transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Math.abs(t.amount || 0), 0), [transactions]);
    
    return (
        <div className="space-y-12 animate-fade-in">
            <header>
                <h3 className="text-6xl font-black text-slate-900 tracking-tighter leading-none">Resumen Operativo</h3>
                <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em] mt-4">Control financiero y de activos · {plaza.name}</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8">
                <StatMiniCard label="Ingresos Totales" value={`$${income.toLocaleString()}`} icon={TrendingUp} color="emerald" trend="+12%" />
                <StatMiniCard label="Gastos / Egresos" value={`$${expenses.toLocaleString()}`} icon={ArrowUpRight} color="rose" trend="-5%" />
                <StatMiniCard label="Locales Ocupados" value={tenants.filter(t => t.status !== 'vacant').length} icon={Building} color="blue" subValue={`De ${tenants.length} locales totales`} />
                <StatMiniCard label="Balance Neto" value={`$${(income - expenses).toLocaleString()}`} icon={Wallet} color="amber" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                    <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-8">Movimientos Recientes</h4>
                    <div className="space-y-6">
                        {transactions.slice(0, 5).map(tx => (
                            <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tx.type === 'EXPENSE' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                        {tx.type === 'EXPENSE' ? <ArrowUpRight size={20}/> : <TrendingUp size={20}/>}
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800 text-sm">{tx.description}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tx.date}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`font-black text-lg ${tx.type === 'EXPENSE' ? 'text-red-500' : 'text-slate-800'}`}>
                                        {tx.type === 'EXPENSE' ? '-' : ''}${Math.abs(tx.amount || 0).toLocaleString()}
                                    </p>
                                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{tx.paymentMethod}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500 rounded-full -mr-32 -mt-32 opacity-20 blur-3xl" />
                    <h4 className="text-xl font-black uppercase tracking-tighter mb-8 relative z-10">Estado del Sistema</h4>
                    <div className="space-y-8 relative z-10">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Base de Datos</span>
                            <span className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase">
                                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Conectado
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sincronización POS</span>
                            <span className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase">
                                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Activa
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Servidor de Archivos</span>
                            <span className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase">
                                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Operativo
                            </span>
                        </div>
                    </div>
                    <div className="mt-16 p-6 bg-white/5 rounded-3xl border border-white/10">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-2">Acceso Rápido</p>
                        <button onClick={() => window.open('/pos', '_blank')} className="w-full flex items-center justify-between group">
                            <span className="font-black text-sm">Abrir Simulador POS</span>
                            <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PensionView = ({ frequentCustomers, onAdd, onEdit }: { frequentCustomers: FrequentCustomer[], onAdd: () => void, onEdit: (p: FrequentCustomer) => void }) => {
    return (
        <div className="space-y-10 animate-fade-in">
            <header className="flex justify-between items-end">
                <div>
                    <h3 className="text-6xl font-black text-slate-900 tracking-tighter leading-none">Pensiones</h3>
                    <p className="text-slate-400 font-black text-xs uppercase tracking-widest mt-4">Control de usuarios frecuentes y pensionados</p>
                </div>
                <button onClick={onAdd} className="bg-slate-900 hover:bg-slate-800 text-white rounded-[2rem] px-10 py-5 font-black text-xs uppercase tracking-widest shadow-2xl shadow-slate-200 transition-all flex items-center gap-3">
                    <Plus size={18} strokeWidth={3} /> Nuevo Pensionado
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {frequentCustomers.map(p => {
                    const nextPay = new Date(p.nextPaymentDate + "T00:00:00");
                    const today = new Date();
                    today.setHours(0,0,0,0);
                    const isOverdue = nextPay < today;
                    return (
                        <div key={p.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                            <div className={`absolute top-0 right-0 w-2 h-full ${isOverdue ? 'bg-red-500' : 'bg-emerald-500'}`} />
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all">
                                    <Car size={24} />
                                </div>
                                <button onClick={() => onEdit(p)} className="p-3 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-xl transition-all">
                                    <Edit2 size={16} />
                                </button>
                            </div>
                            <h4 className="text-2xl font-black text-slate-800 tracking-tighter uppercase mb-1">{p.name}</h4>
                            <div className="flex items-center gap-3 mb-6">
                                <span className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">{p.plate}</span>
                                <span className="text-[10px] font-bold text-slate-400">{p.phone}</span>
                            </div>
                            <div className="pt-6 border-t border-slate-50 flex justify-between items-end">
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Próximo Vencimiento</p>
                                    <p className={`font-black ${isOverdue ? 'text-red-500' : 'text-slate-700'}`}>{p.nextPaymentDate}</p>
                                </div>
                                <div className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {isOverdue ? 'Vencido' : 'Vigente'}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const StatMiniCard = ({ label, value, icon: Icon, color, trend, subValue }: any) => {
   const colors: any = {
      emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      rose: 'bg-rose-50 text-rose-600 border-rose-100',
      amber: 'bg-amber-50 text-amber-600 border-amber-100',
      blue: 'bg-blue-50 text-blue-600 border-blue-100',
   };

   return (
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm premium-shadow hover:-translate-y-1 transition-all group">
         <div className="flex justify-between items-start mb-6">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${colors[color] || colors.blue}`}>
               <Icon size={28} />
            </div>
            {trend && <span className={`text-[9px] font-black uppercase tracking-tighter ${trend.includes('+') ? 'text-emerald-500' : 'text-rose-500'}`}>{trend}</span>}
         </div>
         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
         <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{value}</h3>
         {subValue && <p className="text-[10px] font-bold text-slate-500 mt-2">{subValue}</p>}
      </div>
   );
};

export default AdminPanel;