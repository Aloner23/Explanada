import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Search, AlertTriangle, QrCode, Plus, Loader2, Clock, Tag, X, User, 
  ShieldCheck, Car, CircleCheck, Ticket, Printer, CreditCard, DollarSign, 
  Receipt, Wallet, Save, List, Store, RefreshCw, XCircle, AlertCircle, Eraser, Edit2,
  Calendar, LayoutGrid, ClipboardList, TrendingUp, Users, CarFront, Banknote,
  PenTool, UserCheck, ShieldAlert, History, Smartphone, ChevronRight, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import {
  ParkingTicket, ParkingType, Transaction, PaymentMethod,
  ParkingConfig, FrequentCustomer, ConventionType
} from '../types';
import { dataService, TABLES } from '../services/dataService';
import { plaza } from '../config/plaza';
import { printService } from '../services/printService';
import { useToast } from './ui/ServeToast';
import { 
  calculateParkingCost, 
  generateTicketId, 
  getCurrentShift, 
  getLocalDateString,
  getFormattedTime
} from '../utils/parkingLogic';

// Tariff rules from plaza.config → parking (tolerances, tenant rate, partner convention).
const TARIFF = {
  tenantRateDiscount: plaza.parking.tenantRateDiscount,
  firstHourGraceMinutes: plaza.parking.firstHourGraceMinutes,
  excessGraceMinutes: plaza.parking.excessGraceMinutes,
  excessFee: plaza.parking.excessFee,
  frequentCustomerExtraMinutes: plaza.parking.frequentCustomerExtraMinutes,
  partnerFreeHours: plaza.parking.partnerConvention.freeHours,
};
const QUICK_ENTRY_STYLES = ['bg-orange-100 text-orange-600 hover:bg-orange-200', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'];

export const ParkingSystem: React.FC = () => {
  const { 
    parkingConfig: config, 
    parkingTickets: activeTickets, 
    transactions, 
    frequentCustomers,
    authenticatedUser: currentUser,
    loadData: onRefreshData
  } = useStore();

  const setActiveTickets = (t: ParkingTicket[]) => useStore.setState({ parkingTickets: t });
  const setTransactions = (t: Transaction[]) => useStore.setState({ transactions: t });

  const { toast } = useToast();
  
  // --- LOCAL STATE ---
  const [activeTab, setActiveTab] = useState<'operacion' | 'visitas' | 'pensionados' | 'corte'>('operacion');
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'PENSION'>('ALL');
  const [showRevenue, setShowRevenue] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [paymentView, setPaymentView] = useState<{
    ticket: ParkingTicket;
    duration: number;
    amount: number;
    discounted: number;
    method: PaymentMethod;
    customType?: ParkingType;
  } | null>(null);

  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntryPlate, setManualEntryPlate] = useState('');
  const [visitForm, setVisitForm] = useState({ name: '', unit: '', plate: '', reason: '' });
  const [isDrawing, setIsDrawing] = useState(false);
  const [periodType, setPeriodType] = useState<'today'|'history'>('today');
  const signatureRef = useRef<HTMLCanvasElement>(null);
  
  const [printers, setPrinters] = useState<{name: string, displayName: string}[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(localStorage.getItem('selectedPrinterName') || '');
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  useEffect(() => {
      printService.getPrinters().then(list => {
          setPrinters(list);
      });
  }, []);

  const handleSelectPrinter = (name: string) => {
      setSelectedPrinter(name);
      localStorage.setItem('selectedPrinterName', name);
  };

  // --- DERIVED STATE ---
  const filteredTickets = useMemo(() => {
    let list = activeTickets.filter(t => t.status === 'active');
    if (filterType === 'PENSION') return list.filter(t => t.type === 'PENSION');
    return list;
  }, [activeTickets, filterType]);

  const openParkingTransactions = useMemo(() => {
    return transactions.filter(tx => tx.type === 'PARKING' && !tx.is_closed);
  }, [transactions]);

  const todayRevenue = openParkingTransactions.reduce((acc, tx) => acc + (tx.amount || 0), 0);
  const liveEnSitio = activeTickets.filter(t => t.status === 'active').length;
  const liveSalidas = openParkingTransactions.length;
  const liveTotalAutosTurno = liveEnSitio + liveSalidas;

  const monthMembershipsTotal = useMemo(() => {
    const currentMonthPrefix = getLocalDateString().substring(0, 7);
    return transactions.filter(t => {
      if (!t.date || !t.date.startsWith(currentMonthPrefix)) return false;
      const descLower = (t.description || '').toLowerCase();
      return t.parkingType === 'PENSION' || t.paymentMethod === 'MEMBRESIA' || t.subtype === 'PENSION' || descLower.includes('pensi') || descLower.includes('membres');
    }).reduce((acc, tx) => acc + Math.abs(tx.amount || 0), 0);
  }, [transactions]);

  // Corte Stats
  const corteStats = useMemo(() => {
    const shiftTxs = openParkingTransactions;
    const normales = shiftTxs.filter(tx => tx.parkingType !== 'LOCATARIO');
    const locatarios = shiftTxs.filter(tx => tx.parkingType === 'LOCATARIO');

    return {
      normalCount: normales.length,
      normalAmount: normales.reduce((sum, tx) => sum + (tx.amount || 0), 0),
      locatarioCount: locatarios.length,
      locatarioAmount: locatarios.reduce((sum, tx) => sum + (tx.amount || 0), 0)
    };
  }, [openParkingTransactions]);

  // --- LOGIC: ENTRY ---
  const handleEntry = async (type: ParkingType = 'NORMAL', plateInput: string = '---') => {
    if (!currentUser) return;
    setIsSyncing(true);
    const id = generateTicketId();
    const newTicket: ParkingTicket = {
      id,
      entryTime: new Date().toISOString(),
      plate: plateInput,
      status: 'active',
      type,
      convention: 'NONE',
      registeredBy: currentUser.username
    };
    useStore.setState(state => ({
      parkingTickets: [newTicket, ...state.parkingTickets]
    }));
    try {
        await dataService.upsertRecord(TABLES.TICKETS, newTicket);
        toast(`Entrada registrada: ${id}`, "success");
    } catch (e) { 
        console.error("Error saving ticket record:", e);
        useStore.setState(state => ({ parkingTickets: state.parkingTickets.filter(t => t.id !== id) }));
        toast('No se pudo guardar la entrada. Revisa tu sesión y los permisos.', 'error');
        setIsSyncing(false);
        return; 
    }

    try {
        await printService.printTicket(newTicket, config);
    } catch (e) {
        console.error("Printer error:", e);
        toast(`Ticket ${id} guardado (Error de Impresión)`, "warning");
    }
    setManualEntryPlate('');
    setShowManualEntry(false);
    setIsSyncing(false);
  };

  const handleScanCode = useCallback((code: string) => {
    setManualError(null);
    const cleanCode = code.trim().toUpperCase().replace(/'/g, '-');
    const ticket = activeTickets.find(t => t.id === cleanCode);
    if (ticket) {
      if (ticket.status === 'paid') { 
        setManualError("Boleto ya pagado."); 
        toast("Boleto ya pagado", "warning");
        return; 
      }
      const { amount, duration, discounted } = calculateParkingCost(ticket, config, new Date(), TARIFF);
      setPaymentView({ ticket, duration, amount, discounted, method: 'CASH' });
      setManualCode('');
    } else { 
      setManualError("Boleto no encontrado."); 
      toast("Boleto no encontrado", "error");
    }
  }, [activeTickets, config, toast]);

  // --- GLOBAL SCANNER LISTENER ---
  useEffect(() => {
    let scanBuffer = "";
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in a form input (other than the search input)
      const target = e.target as HTMLElement;
      const isOtherInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && 
                           !target.classList.contains('scanner-input');
      
      if (isOtherInput) return;

      const now = Date.now();
      // Scanners are extremely fast (usually < 50ms between keys)
      if (now - lastKeyTime > 100) scanBuffer = ""; 
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (scanBuffer.length >= 4) { // Folios are 5 digits
          handleScanCode(scanBuffer);
          scanBuffer = "";
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleScanCode]);

  const confirmPayment = async () => {
    if (!paymentView || !currentUser) return;
    setIsSyncing(true);
    const finalType = paymentView.customType || paymentView.ticket.type;
    const updatedTicket: ParkingTicket = {
      ...paymentView.ticket,
      status: 'paid',
      type: finalType,
      paymentTime: new Date().toISOString(),
      paymentAmount: paymentView.amount,
      paymentMethod: paymentView.method,
      updated_at: new Date().toISOString()
    };
    
    const tx: Transaction = {
       id: `tx-pk-${updatedTicket.id}`,
       type: 'PARKING',
       amount: paymentView.amount,
       date: getLocalDateString(),
       description: `Cobro Parking ${updatedTicket.id} (${finalType})`,
       status: 'completed',
       paymentMethod: paymentView.method,
       parkingType: finalType,
       registeredBy: currentUser.username,
       ticketId: updatedTicket.id,
       shift: getCurrentShift(),
       is_closed: false,
       created_at: new Date().toISOString()
    };
    try {
      await dataService.saveParkingPayment(updatedTicket, tx);
    } catch (error) {
      toast('No se pudo registrar el cobro. Revisa tu sesión y reintenta.', 'error');
      setIsSyncing(false);
      return;
    }
    useStore.setState(state => ({
      parkingTickets: state.parkingTickets.map(t => t.id === updatedTicket.id ? updatedTicket : t),
      transactions: [tx, ...state.transactions.filter(t => t.id !== tx.id)]
    }));
    setPaymentView(null);
    toast("Pago registrado", "success");
    if (paymentView.amount > 0) {
       try { await printService.printReceipt(updatedTicket, paymentView.amount, paymentView.duration); }
       catch { toast('Cobro guardado; no se pudo imprimir el recibo.', 'warning'); }
    }
    setIsSyncing(false);
  };

  const handleRegisterVisit = async () => {
    if (!visitForm.name || !visitForm.reason || !currentUser) {
      toast("Faltan datos", "error");
      return;
    }
    setIsSyncing(true);
    const visitData = {
      id: `visit-${Date.now()}`,
      ...visitForm,
      timestamp: new Date().toISOString(),
      registeredBy: currentUser.username,
      type: 'VISIT'
    };
    const newVisitTx = {
        id: visitData.id,
        type: 'VISIT',
        amount: 0,
        date: getLocalDateString(),
        description: `Visita: ${visitData.name} - ${visitData.unit} (${visitForm.reason || ''})`,
        status: 'completed',
        registeredBy: currentUser.username,
        created_at: visitData.timestamp
    } as any;

    try {
      await dataService.upsertRecord(TABLES.TRANSACTIONS, newVisitTx);
      
      useStore.setState(state => ({
        transactions: [newVisitTx, ...state.transactions]
      }));
      toast("Visita registrada con éxito", "success");
      setVisitForm({ name: '', reason: '', unit: '', plate: '' });
      const canvas = signatureRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    } catch (e) { console.error(e); }
    setIsSyncing(false);
  };

  const handleExecuteCorte = async () => {
     if (!window.confirm("¿Estás seguro de que deseas ejecutar el corte de tu turno? Se cerrarán todas las transacciones actuales.")) return;
     setIsSyncing(true);
     try {
        const updatePromises = openParkingTransactions.map(tx => 
           dataService.upsertRecord(TABLES.TRANSACTIONS, { ...tx, is_closed: true })
        );
        await Promise.all(updatePromises);
        toast("Corte ejecutado correctamente", "success");
        onRefreshData();
     } catch (e) {
        toast("Error al ejecutar corte", "error");
     }
     setIsSyncing(false);
  };

  // Signature Drawing Logic
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = signatureRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? (e as React.TouchEvent).touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

   return (
    <div className="h-full grid grid-cols-12 gap-6 animate-fade-in relative">
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
            <div className="bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/50 mb-2">
                        <CarFront size={40} className="animate-pulse" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Hora del Sistema</p>
                        <h2 className="text-4xl font-black tracking-tighter tabular-nums">
                            {new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </h2>
                        <p className="text-xs font-bold text-slate-500 mt-1 uppercase">
                            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                    <div className="w-full h-px bg-white/10 my-4" />
                    <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                            <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><Car size={10} /> En Sitio</p>
                            <p className="text-xl font-black">{liveEnSitio}</p>
                        </div>
                        <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                            <p className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1"><TrendingUp size={10} /> Salidas</p>
                            <p className="text-xl font-black">{liveSalidas}</p>
                        </div>
                        <div className="col-span-2 bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-center px-4">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Total Autos Turno</p>
                            <p className="text-xl font-black">{liveTotalAutosTurno}</p>
                        </div>
                        <div className="col-span-2 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-all" onClick={() => setShowRevenue(!showRevenue)} title={showRevenue ? "Ocultar saldo" : "Mostrar saldo"}>
                            <p className="text-[9px] font-black text-emerald-400 uppercase">Total en Caja</p>
                            <p className="text-3xl font-black text-white tracking-tighter">{showRevenue ? `$${todayRevenue.toLocaleString()}` : "****"}</p>
                        </div>
                        <div className="col-span-2 bg-violet-500/10 p-3 rounded-xl border border-violet-500/20 flex justify-between items-center px-4">
                            <div>
                                <p className="text-[9px] font-black text-violet-400 uppercase">Membresías del Mes</p>
                                <p className="text-[8px] text-slate-400 font-bold uppercase">Pensiones de estacionamiento</p>
                            </div>
                            <p className="text-xl font-black text-white">${monthMembershipsTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            <nav className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-4 space-y-2">
                <PanelNavButton active={activeTab === 'operacion'} onClick={() => setActiveTab('operacion')} icon={LayoutGrid} label="Operación" />
                <PanelNavButton active={activeTab === 'visitas'} onClick={() => setActiveTab('visitas')} icon={Users} label="Visitas" />
                <PanelNavButton active={activeTab === 'pensionados'} onClick={() => setActiveTab('pensionados')} icon={CarFront} label="Pensionados" />
                <PanelNavButton active={activeTab === 'corte'} onClick={() => setActiveTab('corte')} icon={ClipboardList} label="Corte y Reportes" />
            </nav>
        </div>

        <div className="col-span-12 lg:col-span-9 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col relative">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               {activeTab === 'operacion' && (
                 <div className="flex gap-3 w-full">
                    <div className="relative flex-1 group">
                       <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                          {manualError ? <AlertCircle size={20} className="text-red-500 animate-bounce"/> : <Search size={20} className="text-slate-400 group-focus-within:text-blue-500 transition-colors"/>}
                       </div>
                       <form onSubmit={(e) => { e.preventDefault(); handleScanCode(manualCode); }}>
                          <input 
                            type="text" 
                            placeholder="Escanear boleto (o teclear folio)..." 
                            className={`scanner-input w-full pl-12 pr-4 py-4 bg-white border-2 rounded-2xl font-bold text-slate-800 outline-none transition-all ${manualError ? "border-red-200 bg-red-50 focus:border-red-500" : "border-slate-200 focus:border-blue-500 focus:shadow-lg focus:shadow-blue-100"}`} 
                            value={manualCode} 
                            onChange={e => {setManualCode(e.target.value); setManualError(null);}} 
                            autoFocus={true} 
                          />
                       </form>
                       <button onClick={()=>setShowManualEntry(true)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                          <PenTool size={20} />
                       </button>
                    </div>
                    <div className="flex gap-2 items-center">
                        <button onClick={() => setShowPrinterSettings(true)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center shrink-0 h-full" title="Configurar Impresora">
                            <Printer size={20} className={selectedPrinter ? "text-blue-500" : ""} />
                        </button>
                        <button onClick={() => handleEntry('NORMAL')} disabled={isSyncing} className="bg-slate-900 text-white px-6 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center gap-2">
                            {isSyncing ? <Loader2 className="animate-spin" /> : <Plus size={18} />} Entrada
                        </button>
                        {plaza.parking.quickEntryTypes.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {plaza.parking.quickEntryTypes.map((type, i) => (
                                <button key={type} onClick={()=>handleEntry(type as ParkingType)} className={`${QUICK_ENTRY_STYLES[i % QUICK_ENTRY_STYLES.length]} px-3 py-1 rounded-xl font-black text-[10px] uppercase transition-all`}>{type}</button>
                            ))}
                        </div>
                        )}
                        <div className="flex flex-col gap-1 ml-2 border-l pl-2 border-slate-200">
                             <button onClick={()=>setFilterType('ALL')} className={`px-4 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${filterType === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Todos</button>
                             <button onClick={()=>setFilterType('PENSION')} className={`px-4 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${filterType === 'PENSION' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Pension</button>
                        </div>
                    </div>
                 </div>
               )}
               {activeTab === 'visitas' && (
                 <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                    <Users className="text-blue-600"/> Registro de Visitas
                 </h3>
               )}
               {activeTab === 'corte' && (
                  <div className="flex items-center gap-4">
                     <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={()=>setPeriodType('today')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${periodType === 'today' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Turno Actual</button>
                        <button onClick={()=>setPeriodType('history')} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${periodType === 'history' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}>Histórico</button>
                     </div>
                  </div>
               )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 no-scrollbar relative">
           {activeTab === 'operacion' && (
              <motion.div 
                layout
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6"
              >
                <AnimatePresence mode='popLayout'>
                  {filteredTickets.map(t => {
                    const elapsed = Math.floor((new Date().getTime() - new Date(t.entryTime).getTime()) / 60000);
                    return (
                       <motion.div 
                          key={t.id}
                          layout
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          onClick={()=>handleScanCode(t.id)} 
                          className={`@container bg-white p-8 rounded-[2.5rem] border-2 shadow-sm cursor-pointer group hover:scale-[1.02] transition-all relative overflow-hidden flex flex-col justify-between min-h-[220px] ${t.type === 'PENSION' ? "border-emerald-200" : t.type === 'LOCATARIO' ? "border-indigo-200" : t.convention === 'CONVENIO' ? "border-sky-300" : "border-slate-100 hover:border-blue-400"}`}
                       >
                          <div className={`absolute top-0 right-0 px-6 py-3 rounded-bl-3xl text-[clamp(0.6rem,3cqi,0.85rem)] font-black uppercase tracking-widest ${t.type === 'PENSION' ? "bg-emerald-100 text-emerald-700" : t.type === 'LOCATARIO' ? "bg-indigo-100 text-indigo-700" : t.convention === 'CONVENIO' ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                             {t.type}
                          </div>
                          
                          <div className="flex items-center gap-5 mb-2">
                             <div className={`h-28 min-w-[8rem] px-3 rounded-3xl flex flex-col items-center justify-center shadow-sm border-2 ${t.type === 'PENSION' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : t.type === 'LOCATARIO' ? "bg-indigo-50 border-indigo-100 text-indigo-600" : t.convention === 'CONVENIO' ? "bg-sky-50 border-sky-100 text-sky-600" : "bg-blue-50 border-blue-100 text-blue-600"}`}>
                                <span className={`${t.id.length>6?"text-[clamp(1.5rem,8cqi,2.5rem)]":"text-[clamp(2rem,14cqi,3.5rem)]"} font-black tracking-tighter leading-none`}>{t.id}</span>
                                <span className="text-[clamp(0.5rem,3cqi,0.75rem)] font-black uppercase opacity-60 mt-1">FOLIO</span>
                             </div>
                             <div className="flex flex-col justify-center">
                                <p className="text-[clamp(1.8rem,11cqi,3.5rem)] font-black text-slate-700 tracking-tighter leading-none">{getFormattedTime(t.entryTime)}</p>
                                <p className="text-[clamp(0.6rem,3.5cqi,0.85rem)] font-bold text-slate-400 uppercase mt-1 leading-none">Hora de Entrada</p>
                             </div>
                          </div>

                          <div className="flex items-center justify-between mt-4">
                             <div className="flex items-center gap-2 text-[clamp(0.8rem,4.5cqi,1.2rem)] font-bold text-slate-500 bg-slate-50 px-4 py-2 rounded-xl">
                                <Clock size={18} className={elapsed>60?"text-amber-500":"text-slate-300"}/>
                                <span>{Math.floor(elapsed/60)}h {elapsed%60}m</span>
                             </div>
                             {t.convention && t.convention !== 'NONE' && (
                               <div className={`px-4 py-2 rounded-xl text-[clamp(0.6rem,3.5cqi,0.9rem)] font-black uppercase inline-flex items-center gap-2 ${t.convention==="CONVENIO"?"bg-sky-100 text-sky-700":"bg-indigo-50 text-indigo-700"}`}>
                                  <Car size={14} /> {t.convention === 'CONVENIO' ? 'Convenio' : t.convention}
                               </div>
                             )}
                          </div>
                       </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
           )}
            {activeTab === 'visitas' && (
              <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
                 <div className="text-center space-y-1">
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Control de Visitas</h2>
                    <p className="text-slate-500 font-bold text-[9px] uppercase tracking-widest">Registro obligatorio para acceso</p>
                 </div>

                 <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-xl space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1 md:col-span-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Visitante</label>
                          <input 
                             type="text" 
                             placeholder="Nombre completo"
                             className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-black text-slate-800 focus:bg-white focus:border-blue-500 transition-all outline-none text-sm"
                             value={visitForm.name}
                             onChange={e => setVisitForm({...visitForm, name: e.target.value})}
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Unidad / Local</label>
                          <input 
                             type="text" 
                             placeholder="Ej. Local 12"
                             className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-black text-slate-800 focus:bg-white focus:border-blue-500 transition-all outline-none text-sm"
                             value={visitForm.unit || ''}
                             onChange={e => setVisitForm({...visitForm, unit: e.target.value})}
                          />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Placas</label>
                          <input
                             type="text"
                             placeholder="Ej. ABC-1234"
                             className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-black text-slate-800 focus:bg-white focus:border-blue-500 transition-all outline-none text-sm"
                             value={visitForm.plate || ''}
                             onChange={e => setVisitForm({...visitForm, plate: e.target.value})}
                          />
                       </div>
                       <div className="space-y-1 md:col-span-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo de la Visita</label>
                          <input
                             type="text"
                             placeholder="Ej. Entrega, visita a local, mantenimiento..."
                             className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-black text-slate-800 focus:bg-white focus:border-blue-500 transition-all outline-none text-sm"
                             value={visitForm.reason || ''}
                             onChange={e => setVisitForm({...visitForm, reason: e.target.value})}
                          />
                       </div>
                    </div>
 
                    <div className="space-y-3">
                       <div className="flex justify-between items-center px-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Firma Digital</label>
                          <button onClick={() => {
                             const canvas = signatureRef.current;
                             const ctx = canvas?.getContext('2d');
                             ctx?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
                          }} className="text-[8px] font-black text-blue-600 uppercase">Limpiar</button>
                       </div>
                       <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl overflow-hidden">
                          <canvas 
                             ref={signatureRef}
                             width={600}
                             height={180}
                             className="w-full h-full cursor-crosshair"
                             onMouseDown={startDrawing}
                             onMouseMove={draw}
                             onMouseUp={stopDrawing}
                             onMouseLeave={stopDrawing}
                             onTouchStart={startDrawing}
                             onTouchMove={draw}
                             onTouchEnd={stopDrawing}
                          />
                       </div>
                    </div>
 
                    <button onClick={handleRegisterVisit} className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all active:scale-95 flex items-center justify-center gap-3">
                       <UserCheck size={20}/> Registrar Acceso
                    </button>
                 </div>
              </div>
            )}

            {activeTab === 'pensionados' && (
               <div className="space-y-6 animate-fade-in">
                  <div className="flex justify-between items-end">
                     <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Pensionados</h2>
                        <p className="text-slate-500 font-bold text-[9px] uppercase tracking-widest mt-1">Clientes con pago vigente</p>
                     </div>
                     <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
                        <Users className="text-blue-500" size={14} />
                        <span className="text-xs font-black text-slate-700">{frequentCustomers.length} Total</span>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                     {frequentCustomers.map(pc => {
                        const isExpired = new Date(pc.nextPaymentDate) < new Date();
                        return (
                           <div key={pc.id} className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm hover:shadow-xl transition-all group">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                    <User size={20} />
                                 </div>
                                 <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase tracking-widest ${isExpired ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                    {isExpired ? 'Vencido' : 'Vigente'}
                                 </span>
                              </div>
                              <h3 className="text-base font-black text-slate-800 leading-tight mb-1">{pc.name}</h3>
                              <div className="flex items-center gap-2 mb-4">
                                 <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[7px] font-black uppercase">{pc.category || 'GENERAL'}</span>
                                 <span className="text-[7px] font-black text-slate-400 uppercase">{pc.plate || '---'}</span>
                              </div>
                              <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                                 <span className="text-[8px] font-black text-slate-400 uppercase">Vence:</span>
                                 <span className={`text-[10px] font-black ${isExpired ? 'text-red-500' : 'text-slate-700'}`}>{new Date(pc.nextPaymentDate).toLocaleDateString('es-MX')}</span>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>
            )}

            {activeTab === 'corte' && (
               <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
                  <div className="flex justify-between items-center">
                     <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none">Corte de Turno</h2>
                        <p className="text-slate-500 font-bold text-[9px] uppercase tracking-widest mt-1">Cierre administrativo y financiero</p>
                     </div>
                     <button onClick={handleExecuteCorte} className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all flex items-center gap-2">
                        <ShieldAlert size={18}/> Ejecutar Corte
                     </button>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                     <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                           <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600"><Car size={20}/></div>
                           <div>
                              <h4 className="text-sm font-black text-slate-800">Normales</h4>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Público</p>
                           </div>
                        </div>
                        <div className="flex justify-between items-end">
                           <span className="text-2xl font-black text-slate-900 tracking-tight">{corteStats.normalCount} <span className="text-xs font-bold text-slate-400 uppercase">Tickets</span></span>
                           <span className="text-xl font-black text-blue-600 tracking-tighter">${corteStats.normalAmount.toLocaleString()}</span>
                        </div>
                     </div>

                     <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                           <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Store size={20}/></div>
                           <div>
                              <h4 className="text-sm font-black text-slate-800">Locatario</h4>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Especial</p>
                           </div>
                        </div>
                        <div className="flex justify-between items-end">
                           <span className="text-2xl font-black text-slate-900 tracking-tight">{corteStats.locatarioCount} <span className="text-xs font-bold text-slate-400 uppercase">Tickets</span></span>
                           <span className="text-xl font-black text-emerald-600 tracking-tighter">${corteStats.locatarioAmount.toLocaleString()}</span>
                        </div>
                     </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                     <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <h3 className="font-black text-sm text-slate-800 flex items-center gap-2"><History size={16} className="text-blue-600" /> Detalle de Ventas</h3>
                        <div className="text-[9px] font-black text-slate-400 bg-white border border-slate-200 px-4 py-1.5 rounded-full uppercase tracking-widest">{openParkingTransactions.length} Movimientos</div>
                     </div>
                     <div className="overflow-x-auto max-h-[400px] no-scrollbar">
                        <table className="w-full text-left text-xs">
                           <thead className="bg-white border-b font-black text-slate-500 uppercase text-[8px] tracking-widest sticky top-0">
                              <tr>
                                 <th className="p-5">Hora</th>
                                 <th className="p-5">Folio</th>
                                 <th className="p-5">Tipo</th>
                                 <th className="p-5">Método</th>
                                 <th className="p-5 text-right">Monto</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50">
                              {openParkingTransactions.map(tx => (
                                 <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-5 font-mono text-[10px] text-slate-400">{getFormattedTime(tx.created_at || tx.date)}</td>
                                    <td className="p-5 font-black text-slate-800">{tx.ticketId || '---'}</td>
                                    <td className="p-5">
                                       <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${tx.parkingType === 'LOCATARIO' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                                          {tx.parkingType || 'NORMAL'}
                                       </span>
                                    </td>
                                    <td className="p-5 font-black text-slate-300 uppercase text-[9px]">{tx.paymentMethod}</td>
                                    <td className="p-5 text-right font-black text-slate-900 text-sm">${tx.amount?.toLocaleString()}</td>
                                 </tr>
                              ))}
                              {openParkingTransactions.length === 0 && (
                                 <tr><td colSpan={5} className="p-16 text-center text-slate-300 font-black uppercase italic tracking-widest text-[10px]">Sin movimientos registrados</td></tr>
                              )}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>
            )}
         </div>
      </div>

      {/* COMPACT PAYMENT MODAL */}
      <AnimatePresence>
        {paymentView && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={()=>setPaymentView(null)}
               className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
             />
             
             <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col relative z-10"
             >
                <div className="bg-slate-900 p-6 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Ticket size={80} />
                    </div>
                    <button onClick={()=>setPaymentView(null)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all">
                        <X size={20} />
                    </button>
                    <h3 className="text-2xl font-black tracking-tighter mb-1">Cobro de Boleto</h3>
                    <p className="opacity-60 font-medium text-sm">Confirma los detalles antes de procesar</p>
                </div>
    
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div className="flex items-center justify-between text-slate-600 font-bold bg-slate-50 p-3 rounded-2xl">
                        <span>Folio</span>
                        <span className="font-black text-lg text-slate-800 tracking-widest">{paymentView.ticket.id}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-2xl bg-blue-50 text-blue-800 border-2 border-blue-100 flex flex-col items-center justify-center">
                            <span className="text-xs font-black uppercase opacity-60 mb-1">Entrada</span>
                            <span className="text-xl font-black tracking-tighter">{getFormattedTime(paymentView.ticket.entryTime)}</span>
                        </div>
                        <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-800 border-2 border-indigo-100 flex flex-col items-center justify-center">
                            <span className="text-xs font-black uppercase opacity-60 mb-1">Tiempo</span>
                            <span className="text-xl font-black tracking-tighter">{Math.floor(paymentView.duration / 60)}h {paymentView.duration % 60}m</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <button 
                            onClick={() => {
                                const newType: ParkingType = paymentView.ticket.type === 'LOCATARIO' ? 'NORMAL' : 'LOCATARIO';
                                const t = {...paymentView.ticket, type: newType};
                                const { amount, discounted } = calculateParkingCost(t, config, new Date(), TARIFF);
                                setPaymentView({...paymentView, ticket: t, amount, discounted});
                            }} 
                            className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 transition-all group ${paymentView.ticket.type === 'LOCATARIO' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-indigo-50'}`}
                        >
                            <span className="flex items-center gap-3 font-bold text-sm">
                                <Store size={18} className={paymentView.ticket.type === 'LOCATARIO' ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'} /> Tarifa Locatario
                            </span>
                            {paymentView.ticket.type === 'LOCATARIO' && <CircleCheck size={18} />}
                        </button>
                        <button 
                            onClick={() => {
                                const newConv: ConventionType = paymentView.ticket.convention === 'CONVENIO' ? 'NONE' : 'CONVENIO';
                                const t = {...paymentView.ticket, convention: newConv};
                                const { amount, discounted } = calculateParkingCost(t, config, new Date(), TARIFF);
                                setPaymentView({...paymentView, ticket: t, amount, discounted});
                            }} 
                            className={`w-full flex items-center justify-between p-3 rounded-2xl border-2 transition-all group ${paymentView.ticket.convention === 'CONVENIO' ? 'bg-sky-500 border-sky-500 text-white shadow-lg shadow-sky-200' : 'bg-white border-slate-100 text-slate-500 hover:border-sky-200 hover:bg-sky-50'}`}
                        >
                            <span className="flex items-center gap-3 font-bold text-sm">
                                <Car size={18} className={paymentView.ticket.convention === 'CONVENIO' ? 'text-white' : 'text-slate-400 group-hover:text-sky-500'} /> {plaza.parking.partnerConvention.label} ({plaza.parking.partnerConvention.freeHours}h gratis)
                            </span>
                            {paymentView.ticket.convention === 'CONVENIO' && <CircleCheck size={18} />}
                        </button>
                        <button 
                            onClick={async () => {
                                if(!window.confirm("¿Marcar como No Pagado (Se fue sin pagar)?")) return;
                                const updated = { ...paymentView.ticket, status: 'unpaid', paymentTime: new Date().toISOString() };
                                await dataService.upsertRecord(TABLES.TICKETS, updated);
                                toast("Ticket marcado como no pagado", "warning");
                                setPaymentView(null);
                                onRefreshData();
                            }} 
                            className="w-full flex items-center justify-between p-3 rounded-2xl border-2 bg-white border-slate-100 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all group"
                        >
                            <span className="flex items-center gap-3 font-bold text-sm">
                                <XCircle size={18} className="text-slate-300 group-hover:text-red-500" /> No Pagado (Se fue)
                            </span>
                        </button>
                    </div>

                    <div className="bg-slate-900 text-white p-5 rounded-3xl relative overflow-hidden flex flex-col items-center justify-center space-y-1 shadow-xl">
                        <div className="flex items-center gap-2 opacity-50 text-xs font-bold uppercase tracking-widest">Total a Pagar</div>
                        <div className="text-5xl font-black tracking-tighter flex items-start">
                            <span className="text-xl mt-1">$</span>
                            {paymentView.amount.toLocaleString()}
                        </div>
                        {paymentView.discounted > 0 && (
                            <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                <Tag size={12} /> Ahorrado: ${paymentView.discounted.toLocaleString()}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={() => {
                                setPaymentView(prev => {
                                    if(!prev) return null;
                                    if(prev.method === 'MEMBRESIA') {
                                        return {...prev, method: 'CASH', amount: prev.amount + prev.discounted, discounted: 0};
                                    }
                                    return {...prev, method: 'CASH'};
                                });
                            }} 
                            className={`flex-1 p-3 rounded-xl border-2 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${paymentView.method === 'CASH' ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-slate-100 text-slate-400'}`}
                        >
                            <Banknote size={16} /> Efectivo
                        </button>
                        <button 
                            onClick={() => {
                                setPaymentView(prev => {
                                    if(!prev) return null;
                                    if(prev.method === 'MEMBRESIA') {
                                        return {...prev, method: 'CARD', amount: prev.amount + prev.discounted, discounted: 0};
                                    }
                                    return {...prev, method: 'CARD'};
                                });
                            }} 
                            className={`flex-1 p-3 rounded-xl border-2 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${paymentView.method === 'CARD' ? 'border-sky-500 text-sky-600 bg-sky-50' : 'border-slate-100 text-slate-400'}`}
                        >
                            <CreditCard size={16} /> Tarjeta
                        </button>
                        <button 
                            onClick={() => {
                                setPaymentView(prev => {
                                    if(!prev) return null;
                                    const total = prev.amount + prev.discounted;
                                    return {...prev, method: 'MEMBRESIA', amount: 0.01, discounted: total - 0.01};
                                });
                            }} 
                            className={`flex-1 p-3 rounded-xl border-2 text-xs font-black uppercase flex items-center justify-center gap-2 transition-all ${paymentView.method === 'MEMBRESIA' ? 'border-violet-500 text-violet-600 bg-violet-50' : 'border-slate-100 text-slate-400'}`}
                        >
                            <UserCheck size={16} /> Membresía
                        </button>
                    </div>

                    <div className="flex flex-col gap-2">
                        <button 
                            disabled={isSyncing} 
                            onClick={confirmPayment} 
                            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-200 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                            {isSyncing ? <Loader2 className="animate-spin" /> : <CircleCheck size={24} />} Confirmar Pago
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={async () => {
                                    try {
                                        await printService.printReceipt(paymentView.ticket, paymentView.amount, paymentView.duration);
                                        toast("Comprobante enviado a imprimir", "success");
                                    } catch (e) {
                                        toast("Error al imprimir comprobante", "error");
                                    }
                                }} 
                                disabled={isSyncing} 
                                className="py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                            >
                                <Receipt size={16} /> Comprobante
                            </button>
                            <button 
                                onClick={async () => {
                                    try {
                                        await printService.printTicket(paymentView.ticket, config);
                                        toast("Ticket enviado a imprimir", "success");
                                    } catch (e) {
                                        toast("Error al reimprimir", "error");
                                    }
                                }} 
                                className="py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                            >
                                <Ticket size={16} /> Reimprimir
                            </button>
                        </div>
                    </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* PRINTER SETTINGS MODAL */}
      <AnimatePresence>
        {showPrinterSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={()=>setShowPrinterSettings(false)}
               className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
             />
             
             <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col relative z-10"
             >
                <div className="bg-slate-900 p-6 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Printer size={80} />
                    </div>
                    <button onClick={()=>setShowPrinterSettings(false)} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all">
                        <X size={20} />
                    </button>
                    <h3 className="text-2xl font-black tracking-tighter mb-1">Impresora (Caseta)</h3>
                    <p className="opacity-60 font-medium text-sm">Configuración de Ticket de 58mm</p>
                </div>
    
                <div className="p-6 space-y-4 overflow-y-auto">
                    {printers.length > 0 ? (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Impresora (Ej. 3nStar RPT001)</label>
                            <select 
                                value={selectedPrinter} 
                                onChange={(e) => handleSelectPrinter(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-xl font-bold text-slate-800 focus:bg-white focus:border-blue-500 transition-all outline-none"
                            >
                                <option value="">-- Usar Predeterminada del Sistema --</option>
                                {printers.map(p => (
                                    <option key={p.name} value={p.name}>{p.displayName || p.name}</option>
                                ))}
                            </select>
                            <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100 mt-2">
                                <div>
                                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Modo Automático</p>
                                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">Impresión silenciosa sin diálogos</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        const newVal = localStorage.getItem('silentPrint') === 'false' ? 'true' : 'false';
                                        localStorage.setItem('silentPrint', newVal);
                                        toast(newVal === 'true' ? "Modo automático activado" : "Modo manual activado (mostrará diálogo)", "info");
                                        // Force re-render if needed, but here we just rely on the next print
                                    }}
                                    className={`w-12 h-6 rounded-full transition-all relative ${localStorage.getItem('silentPrint') !== 'false' ? 'bg-indigo-600' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${localStorage.getItem('silentPrint') !== 'false' ? 'right-1' : 'left-1'}`} />
                                </button>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-2 bg-blue-50 p-3 rounded-xl border border-blue-100">
                                💡 Al seleccionar una impresora aquí, el sistema imprimirá <b>automáticamente</b> sin abrir el cuadro de diálogo (solo en la versión de escritorio).
                            </p>
                            <button 
                                onClick={() => {
                                    printService.testPrint();
                                    toast("Enviando prueba de impresión...", "info");
                                }}
                                className="w-full mt-4 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                            >
                                <Printer size={16} /> Probar Impresión
                            </button>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                            <h4 className="text-amber-800 font-bold text-sm flex items-center gap-2 mb-1"><AlertTriangle size={16}/> Versión Web Detectada</h4>
                            <p className="text-amber-700/80 text-xs font-medium">
                                En la versión de navegador web, el cuadro de diálogo de impresión siempre se abrirá por seguridad. Asegúrate de seleccionar tu impresora (como la <b>3nStar RPT001</b>) en el diálogo de Chrome y verifica que el tamaño de papel esté configurado en <b>58mm</b>.
                            </p>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100">
                    <button onClick={() => setShowPrinterSettings(false)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:scale-[1.02] active:scale-95 transition-all">
                        Guardar Configuración
                    </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

const PanelNavButton = ({ active, icon: Icon, label, onClick }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${active ? 'bg-blue-50 text-blue-600 font-black shadow-inner' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 font-bold'}`}>
     <Icon size={20} />
     {label}
  </button>
);
