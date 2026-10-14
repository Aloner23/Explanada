import { useSessionGuard } from './hooks/useSessionGuard';
import { publicRequest } from './services/publicService';
import React, { useState, useEffect } from 'react';
import { UserRole, Transaction, User, ParkingTicket, LoginUser } from './types';
import { CloudOff, RefreshCw, ShieldCheck, Loader2, LogOut, X } from 'lucide-react';

import { OwnerDashboard } from './components/OwnerDashboard';
import { AdminPanel } from './components/AdminPanel';
import { TenantPortal } from './components/TenantPortal';
import { ParkingSystem } from './components/ParkingSystem';
import { PublicLanding } from './components/PublicLanding';
import { CashAudit } from './components/CashAudit';
import { AdvertisingManager } from './components/AdvertisingManager';
import { PayrollManager } from './components/PayrollManager';
import { TaskBoard } from './components/TaskBoard';
import { Login } from './components/Login';
import { dataService, TABLES, DATA_SCOPES } from './services/dataService';
import { LOGO_URL as DEFAULT_LOGO } from './constants';
import { ToastProvider } from './components/ui/ServeToast';
import { useStore } from './store/useStore';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { useAppInitialization } from './hooks/useAppInitialization';
import { plaza } from './config/plaza';

const DiagnosticRow = ({ label, success }: any) => (
  <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-lg border border-slate-700/30">
    <span className="text-[9px] font-bold uppercase text-slate-400">{label}</span>
    {success ? <ShieldCheck size={14} className="text-emerald-500" /> : <CloudOff size={14} className="text-red-500" />}
  </div>
);

function App() {
  const {
    viewMode, setViewMode,
    authenticatedUser, setAuthenticatedUser,
    activeSection, setActiveSection,
    isLoading, loadPhase, error, setError,
    isGlobal, setIsGlobal,
    isSectionSyncing,
    isFullHistoryLoaded,
    users, tenants, transactions,
    parkingConfig, reservations, galleryImages,
    parkingTickets, frequentCustomers, adSpaces,
    staff, attendanceRecords, payrollRecords,
    loadData, logout, handlePayRent, handleStampTicket
  } = useStore();

  const { isInitialized, connectionReason } = useAppInitialization();
  useSessionGuard();
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState(false);

  const activeLogo = parkingConfig?.logoUrl || DEFAULT_LOGO;


  const handleResetApp = async () => {
    if (confirm("¿Estás seguro de que deseas resetear la aplicación? Se borrará el caché local profundo de Firebase y se recargará la página.")) {
      await dataService.clearCache();
    }
  };

  const handleDiagnose = async () => {
    const results = await dataService.diagnoseConnection();
    setDiagnosticResults(results);
    if (viewMode === 'internal') setShowDiagnosticModal(true);
  };

  const getScopeForSection = (section: string): keyof typeof DATA_SCOPES => {
    switch (section) {
      case 'dashboard': return 'DASHBOARD';
      case 'parking': return 'PARKING';
      case 'tenant': return 'TENANT';
      case 'tasks': return 'TASKS';
      case 'audit': return 'AUDIT';
      case 'payroll': return 'PAYROLL';
      case 'advertising': return 'ADVERTISING';
      case 'admin': return 'ADMIN';
      default: return 'PUBLIC';
    }
  };

  // Intervalo de refresco para mantener la UI actualizada y SYNC de pendientes.
  // Solo recarga el scope de la sección activa (no todas las colecciones/años de
  // historial de 'ADMIN') para evitar relecturas masivas e innecesarias de Firebase.
  useEffect(() => {
    if (!isInitialized) return;
    const interval = setInterval(() => {
      loadData(true, authenticatedUser ? getScopeForSection(activeSection) : 'PUBLIC');
    }, 900000); // 15 minutos para ahorrar cuota en modo web
    return () => clearInterval(interval);
  }, [isInitialized, authenticatedUser, activeSection]);

  // Cierre de caja automático a las 8:00 AM y 4:00 PM
  useEffect(() => {
    if (!isInitialized || !transactions || transactions.length === 0 || !authenticatedUser || !isFullHistoryLoaded) return;
    if (
      authenticatedUser.role !== UserRole.OWNER &&
      authenticatedUser.role !== UserRole.ADMIN &&
      authenticatedUser.role !== UserRole.PARKING_STAFF
    ) return;

    let isRunning = false;
    const triggerAutoCuts = async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        const currentTxs = useStore.getState().transactions;
        await runAutomaticCuts(currentTxs, (newTxs) => {
          useStore.setState({ transactions: newTxs });
        });
      } finally {
        isRunning = false;
      }
    };

    // Retrasar 2 segundos para dar tiempo a que los datos históricos se carguen
    const timer = setTimeout(triggerAutoCuts, 2000);

    const interval = setInterval(triggerAutoCuts, 120000); // Revisa cada 2 minutos
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isInitialized, authenticatedUser, isFullHistoryLoaded]);

  // ELECTRON DETECTION
  const isElectron = React.useMemo(() => {
    return typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0;
  }, []);

  useEffect(() => {
    // No longer forcing desktop app to parking section
  }, [isElectron, authenticatedUser, activeSection]);

  const handleLogin = async (user: User) => {
    setAuthenticatedUser(user);
    setViewMode('internal');

    const destView = (
      user.role === UserRole.PARKING_STAFF ? 'parking' :
      user.role === UserRole.TENANT ? 'tenant' :
      user.role === UserRole.ADMIN ? 'admin' :
      user.role === UserRole.STAFF ? 'tasks' : 'dashboard'
    );
    
    // 1. CARGAR SOLO LA SECCIÓN INICIAL (MUY RÁPIDO)
    await loadData(false, getScopeForSection(destView));
    setActiveSection(destView as any);

    // 2. DISPARAR CARGA DE HISTORIAL EN SEGUNDO PLANO (SILENCIOSO)
    // Esto descargará los 3800+ registros en bloques de 1000 sin bloquear la UI
    if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN) loadData(true, 'ADMIN');
  };

  const handleLogout = () => {
    logout();
  };


  if (!isInitialized) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
        {error ? (
          <div className="max-w-md animate-fade-in w-full">
            <CloudOff className="w-16 h-16 text-red-500 mb-6 mx-auto" />
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-4">Error de Conexión</h2>
            <p className="text-slate-400 font-medium mb-8 text-sm leading-relaxed">{error}</p>
            
            {diagnosticResults ? (
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-8 text-left space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Resultados del Diagnóstico</h3>
                <div className="grid grid-cols-2 gap-4">
                  <DiagnosticRow label="Internet" success={diagnosticResults.internet} />
                  <DiagnosticRow label="Base Datos" success={diagnosticResults.firestore} />
                  <DiagnosticRow label="Dominio" success={diagnosticResults.authDomain} />
                  <DiagnosticRow label="Cuota Firebase" success={diagnosticResults.quota} />
                </div>
                {!diagnosticResults.authDomain && (
                  <p className="text-[10px] text-amber-400 font-bold bg-amber-400/10 p-3 rounded-lg border border-amber-400/20">
                    ⚠️ El dominio o IP actual no está autorizado en Firebase Console. Agrégalo en Authentication {'>'} Settings.
                  </p>
                )}
                {diagnosticResults.error && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-[9px] font-mono text-red-400 break-words">{diagnosticResults.error}</p>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={handleDiagnose}
                className="mb-8 text-blue-400 hover:text-blue-300 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mx-auto"
              >
                <RefreshCw size={12} className={loadPhase === 'Diagnosticando...' ? 'animate-spin' : ''} /> Diagnosticar Fallo Técnico
              </button>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setDiagnosticResults(null); loadData(); }}
                className="bg-white text-slate-900 px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 w-full"
              >
                <RefreshCw size={14} /> Reintentar Conexión
              </button>
              <button
                onClick={handleResetApp}
                className="text-slate-500 hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest mt-4"
              >
                Borrar Caché y Reintentar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="flex items-center font-black uppercase tracking-tighter text-xl">
              <RefreshCw className="animate-spin mr-3 text-blue-500" />
              {plaza.shortName}
            </div>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px]">{loadPhase}</p>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'login') return <Login onLogin={handleLogin} onCancel={() => setViewMode('public')} logoUrl={activeLogo} />;

  if (viewMode === 'public') {
    return (
      <PublicLanding
        reservations={reservations}
        onNewReservation={async (res, amt) => {
          const saved = await publicRequest('reservation', res);
          await loadData(true, 'PUBLIC');
          return saved;
        }}
        onCancelReservation={async (id) => {
          await publicRequest('reservation-lookup', { id, cancel: true });
          await loadData(true, 'PUBLIC');
        }}
        onRequestCancellation={async (id, reason) => {
          await publicRequest('reservation-lookup', { id, reason, cancel: true });
          await loadData(true, 'PUBLIC');
        }}
        onEnterAdmin={() => setViewMode('login')}
        galleryImages={galleryImages}
        parkingConfig={parkingConfig!}
      />
    );
  }

  const showMobileNav = !isElectron && authenticatedUser && authenticatedUser.role !== UserRole.PARKING_STAFF && authenticatedUser.role !== UserRole.TENANT;

  return (
    <ToastProvider>
      <div className="flex h-screen bg-slate-50 font-sans animate-fade-in overflow-hidden relative">
        {/* Connection Diagnostic Modal (Post-Login) */}
        {showDiagnosticModal && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl animate-scale-up">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black uppercase tracking-widest text-xs text-white">Diagnóstico de Red</h3>
                <button onClick={() => setShowDiagnosticModal(false)} className="text-slate-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              
              <div className="space-y-4 mb-8">
                <DiagnosticRow label="Internet" success={diagnosticResults?.internet} />
                <DiagnosticRow label="Base Datos" success={diagnosticResults?.firestore} />
                <DiagnosticRow label="Dominio" success={diagnosticResults?.authDomain} />
                <DiagnosticRow label="Cuota Firebase" success={diagnosticResults?.quota} />
              </div>

              {!diagnosticResults?.authDomain && (
                <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <p className="text-[10px] text-amber-400 font-bold leading-relaxed">
                    ⚠️ El dominio actual no está autorizado. Agrégalo en la consola de Firebase {'>'} Authentication.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <button 
                  onClick={() => setShowDiagnosticModal(false)}
                  className="w-full py-4 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
                >
                  Cerrar Panel
                </button>
                <button 
                  onClick={handleResetApp}
                  className="w-full py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-red-500/20 transition-all"
                >
                  Borrar Caché y Forzar Recarga
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay for Sections */}
        {isSectionSyncing && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex flex-col items-center justify-center text-white animate-fade-in">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h3 className="font-black uppercase tracking-widest text-xs">Cargando Sección...</h3>
            <p className="text-[10px] text-slate-400 mt-2">Sincronizando con la nube</p>
          </div>
        )}

        <Sidebar />

        <main className="flex-1 overflow-y-auto bg-slate-50 relative h-full flex flex-col">
          <Header isElectron={isElectron} connectionReason={connectionReason} />
          {error && <div role="alert" className="bg-amber-100 text-amber-950 px-5 py-3 text-sm">{error}</div>}

          <div className={`flex-1 overflow-y-auto ${activeSection === 'parking' ? 'p-0' : 'p-4 md:p-6 lg:p-10'}`}>
            <div className={`${activeSection === 'parking' ? 'max-w-none' : 'max-w-7xl mx-auto'} pb-20 lg:pb-0 h-full`}>

            {activeSection === 'dashboard' && authenticatedUser?.role === UserRole.OWNER && <OwnerDashboard tenants={tenants} transactions={transactions} reservations={reservations} staff={staff} />}

            {activeSection === 'audit' && (authenticatedUser?.role === UserRole.OWNER || authenticatedUser?.role === UserRole.ADMIN) && (
              <CashAudit transactions={transactions} setTransactions={(t) => useStore.setState(state => ({ transactions: typeof t === 'function' ? t(state.transactions) : t }))} currentUser={authenticatedUser!} />
            )}

            {activeSection === 'admin' && (authenticatedUser?.role === UserRole.OWNER || authenticatedUser?.role === UserRole.ADMIN) && (
              <AdminPanel />
            )}
            {activeSection === 'parking' && authenticatedUser && (
              <ParkingSystem />
            )}
            {activeSection === 'advertising' && (authenticatedUser?.role === UserRole.OWNER || authenticatedUser?.role === UserRole.ADMIN) && (
              <AdvertisingManager
                adSpaces={adSpaces}
                setAdSpaces={(a) => useStore.setState(state => ({ adSpaces: typeof a === 'function' ? a(state.adSpaces) : a }))}
                transactions={transactions}
                setTransactions={(t) => useStore.setState(state => ({ transactions: typeof t === 'function' ? t(state.transactions) : t }))}
                currentUser={authenticatedUser}
              />
            )}
            {activeSection === 'payroll' && (authenticatedUser?.role === UserRole.OWNER || authenticatedUser?.role === UserRole.ADMIN) && (
              <PayrollManager
                staff={staff}
                setStaff={(s) => useStore.setState(state => ({ staff: typeof s === 'function' ? s(state.staff) : s }))}
                attendance={attendanceRecords}
                setAttendance={(a) => useStore.setState(state => ({ attendanceRecords: typeof a === 'function' ? a(state.attendanceRecords) : a }))}
                payrollRecords={payrollRecords}
                setPayrollRecords={(p) => useStore.setState(state => ({ payrollRecords: typeof p === 'function' ? p(state.payrollRecords) : p }))}
                transactions={transactions}
                setTransactions={(t) => useStore.setState(state => ({ transactions: typeof t === 'function' ? t(state.transactions) : t }))}
                currentUser={authenticatedUser}
              />
            )}
            {activeSection === 'tenant' && authenticatedUser?.role === UserRole.TENANT && tenants.some(t => t.id === authenticatedUser.tenantId) && (
              <TenantPortal
                tenant={tenants.find(t => t.id === authenticatedUser.tenantId)!}
                onPayRent={handlePayRent}
                activeTickets={parkingTickets}
                onStampTicket={handleStampTicket}
                logoUrl={activeLogo}
              />
            )}
            {activeSection === 'tasks' && authenticatedUser && (
              <TaskBoard currentUser={authenticatedUser} users={users} />
            )}
            </div>
          </div>
        </main>

        <MobileNav />
      </div>
    </ToastProvider>
  );
}


// --- HELPERS FOR AUTOMATIC SHIFT CLOSURES (CORTES AUTOMÁTICOS) ---
const getShiftRangeForAuto = (date: string, shift: string): { start: Date; end: Date } => {
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

const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
const getMexicoDateStrFast = (d: Date): string => {
   return new Date(d.getTime() - MX_OFFSET_MS).toISOString().slice(0, 10);
};

const getMexicoDateForAuto = (tx: Transaction): Date => {
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
};

const runAutomaticCuts = async (transactions: Transaction[], onUpdate: (newTxs: Transaction[]) => void) => {
    const shiftsToCheck: { date: string; shift: 'Matutino' | 'Vespertino' }[] = [];
    
    // Check recent 30 days of shifts
    for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        shiftsToCheck.push({ date: dateStr, shift: 'Matutino' });
        shiftsToCheck.push({ date: dateStr, shift: 'Vespertino' });
    }

    const now = new Date();
    let updatedTxs = [...transactions];
    let hasChanges = false;
    const newTxToUpsert: Transaction[] = [];
    const modifiedTxsToUpsert: Transaction[] = [];

    // Pre-calculate dates for auditable transactions to avoid redundant processing inside shift loop
    const auditableTypes = new Set(['PARKING', 'EXPENSE', 'INCOME', 'RENT', 'RESERVATION', 'AD_INCOME']);
    const txsWithDates = transactions
        .filter(t => t.status === 'completed' && auditableTypes.has(t.type) && t.subtype !== 'ADJUSTMENT')
        .map(t => ({ tx: t, dateObj: getMexicoDateForAuto(t) }));

    for (const item of shiftsToCheck) {
        const range = getShiftRangeForAuto(item.date, item.shift);
        
        // If current actual time is before the shift end time, the shift is still active
        if (now < range.end) {
            continue;
        }

        // Check if an AUDIT record already exists for this date and shift
        const existingAudit = transactions.find(t => t.type === 'AUDIT' && t.date === item.date && t.shift === item.shift);

        // Find all parking transactions that fall into this shift
        const shiftTxs = txsWithDates
            .filter(item => item.dateObj >= range.start && item.dateObj < range.end)
            .map(item => item.tx)
            .filter(t => {
                if (t.status !== 'completed') return false;
                const descLower = (t.description || '').toLowerCase();
                const isMembership = t.parkingType === 'PENSION' || t.paymentMethod === 'MEMBRESIA' || t.subtype === 'PENSION' || descLower.includes('pensi') || descLower.includes('membres');
                const isParkingDept = 
                   t.type === 'PARKING' || 
                   isMembership || 
                   (t.type === 'EXPENSE' && ((t.subtype as string) === 'OTROS_GASTOS' || descLower.includes('parking') || descLower.includes('estacionamiento') || descLower.includes('caseta')));
                return isParkingDept && t.subtype !== 'ADJUSTMENT';
            });

        // Compute system cash balance
        let cashBalance = 0;
        let carsNormal = 0;
        let amountNormal = 0;
        let carsLocatario = 0;
        let amountLocatario = 0;
        let courtesies = 0;

        shiftTxs.forEach(t => {
            const amt = Number(t.amount) || 0;
            const isExpense = t.type === 'EXPENSE' || amt < 0;
            const realAmt = isExpense ? -Math.abs(amt) : Math.abs(amt);
            
            if (t.paymentMethod === 'CASH') {
                cashBalance += realAmt;
            }

            if (t.parkingType === 'LOCATARIO') {
                carsLocatario += t.cars_charged || 1;
                amountLocatario += amt;
            } else if (t.type === 'PARKING') {
                carsNormal += t.cars_charged || 1;
                amountNormal += amt;
            }
            courtesies += t.courtesies || 0;
        });

        if (existingAudit) {
            // If the audit is automatic, has $0 balance and 0 cars, but there are actually completed parking transactions
            // or a non-zero cash balance, it means it was a corrupted cut run on an empty cache. Overwrite it.
            const isBadAutoAudit = 
                existingAudit.id.startsWith('audit-auto-') && 
                Number(existingAudit.audit_system_amount || 0) === 0 && 
                (!existingAudit.cars_normal || existingAudit.cars_normal === 0) && 
                (cashBalance !== 0 || carsNormal > 0);

            if (!isBadAutoAudit) {
                // The shift is already audited, but we should make sure all transactions in this shift are closed!
                const openTxs = shiftTxs.filter(t => !t.is_closed);
                if (openTxs.length > 0) {
                    console.log(`[AutoCut] Shift ${item.date} ${item.shift} is already audited, but has ${openTxs.length} open transactions. Closing them...`);
                    for (const tx of openTxs) {
                        const closedTx = { ...tx, is_closed: true };
                        modifiedTxsToUpsert.push(closedTx);
                        updatedTxs = updatedTxs.map(t => t.id === tx.id ? closedTx : t);
                        hasChanges = true;
                    }
                }
                continue; // Valid manually performed or correct automatic audit, skip
            }
            console.log(`[AutoCut] Detected bad $0 automatic audit for ${item.date} ${item.shift}. Correcting...`);
        } else {
            console.log(`[AutoCut] Shift ended but not audited: ${item.date} ${item.shift}. Performing automatic cut.`);
        }

        // Close all transactions in this shift
        const openTxs = shiftTxs.filter(t => !t.is_closed);
        for (const tx of openTxs) {
            const closedTx = { ...tx, is_closed: true };
            modifiedTxsToUpsert.push(closedTx);
            updatedTxs = updatedTxs.map(t => t.id === tx.id ? closedTx : t);
        }

        // Create the AUDIT transaction
        const auditId = `audit-auto-${item.date}-${item.shift}`;
        const auditTx: Transaction = {
            id: auditId,
            type: 'AUDIT',
            amount: cashBalance,
            date: item.date,
            description: `Corte Automático ${item.shift} (${item.date})`,
            status: 'completed',
            paymentMethod: 'CASH',
            registeredBy: 'SISTEMA',
            audit_system_amount: cashBalance,
            audit_declared_amount: cashBalance,
            audit_difference: 0,
            shift: item.shift,
            created_at: range.end.toISOString(),
            is_closed: true,
            notes: 'Cierre automático de turno por cambio de horario',
            cars_normal: carsNormal,
            amount_normal: amountNormal,
            cars_locatario: carsLocatario,
            amount_locatario: amountLocatario,
            courtesies: courtesies
        } as any;

        // Create adjustment transaction ($0)
        const adjId = `adj-auto-${item.date}-${item.shift}`;
        const adjustmentTx: Transaction = {
            id: adjId,
            type: 'INCOME',
            subtype: 'ADJUSTMENT',
            amount: 0,
            date: item.date,
            description: `Ajuste Arqueo Automático ${item.shift}: Sin diferencia ($${cashBalance})`,
            status: 'completed',
            paymentMethod: 'CASH',
            registeredBy: 'SISTEMA',
            created_at: range.end.toISOString(),
            is_closed: true
        };

        newTxToUpsert.push(auditTx, adjustmentTx);
        // Replace existing ones in local state to avoid duplicate keys in React lists
        updatedTxs = updatedTxs.filter(t => t.id !== auditId && t.id !== adjId);
        updatedTxs = [auditTx, adjustmentTx, ...updatedTxs];
        hasChanges = true;
    }

    if (hasChanges) {
        try {
            // Write updates to DB
            for (const tx of modifiedTxsToUpsert) {
                await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            }
            for (const tx of newTxToUpsert) {
                await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            }
            onUpdate(updatedTxs);
            console.log(`[AutoCut] Successfully performed automatic cut for ended shifts.`);
        } catch (error) {
            console.error("[AutoCut] Error saving auto cuts to database:", error);
        }
    }
};


export default App;

