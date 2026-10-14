import React, { useState, useMemo, useEffect } from 'react';
import { 
  FileSpreadsheet, Download, Printer, Book, List, LayoutGrid, 
  Search, ChevronDown, ChevronRight, FileText, ArrowRightLeft,
  Building2, Wallet2, Calculator, Upload, Plus, X, Save, TrendingUp,
  BarChart, PieChart, Activity, Briefcase, Landmark, ShieldCheck,
  Calendar, CheckCircle2, AlertTriangle, Lock, Unlock, Eye, Trash2, 
  Edit3, Settings, FileCode, Check, FileDown, RefreshCw
} from 'lucide-react';
import { Transaction } from '../types';
import { 
  LedgerAccount, Policy, PolicyLine, INITIAL_SAT_CATALOG, 
  PolicyType, PolicyStatus, CFDIMetadata, FiscalPeriodState, CostCenter 
} from '../types/accounting';
import { accountingService } from '../services/accountingService';
import { exportToCSV } from '../utils/exportUtils';
import { dataService, TABLES } from '../services/dataService';
import { parseCFDIXml } from '../utils/xmlParser';
import { useStore } from '../store/useStore';
import { plaza } from '../config/plaza';

interface AccountingViewProps {
  transactions: Transaction[];
  onUpdate: () => Promise<void>;
}

type AccountingTab = 'dashboard' | 'catalogo' | 'polizas' | 'captura' | 'reportes';

export const AccountingView: React.FC<AccountingViewProps> = ({ transactions, onUpdate }) => {
  // Tabs & Period Selection
  const [activeTab, setActiveTab] = useState<AccountingTab>('dashboard');
  const [reportSubTab, setReportSubTab] = useState<'balanza' | 'auxiliares' | 'pyl' | 'balance'>('balanza');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('all');
  
  // Data States
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [periodStates, setPeriodStates] = useState<FiscalPeriodState[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountForAuxiliar, setSelectedAccountForAuxiliar] = useState<string>('');

  // Policy Capture State
  const [policyType, setPolicyType] = useState<PolicyType>('DIARIO');
  const [policyDate, setPolicyDate] = useState(new Date().toISOString().split('T')[0]);
  const [policyConcept, setPolicyConcept] = useState('');
  const [policyLines, setPolicyLines] = useState<PolicyLine[]>([
    { lineNumber: 1, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' },
    { lineNumber: 2, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' }
  ]);
  const [attachedCFDIs, setAttachedCFDIs] = useState<CFDIMetadata[]>([]);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  // XML Parser Drag & Drop UI feedback
  const [isDragging, setIsDragging] = useState(false);

  // Print Policy State & Config
  const [selectedPolicyForPrint, setSelectedPolicyForPrint] = useState<Policy | null>(null);
  const [previewingCfdi, setPreviewingCfdi] = useState<CFDIMetadata | null>(null);
  const { parkingConfig } = useStore();

  const formatPrintDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  useEffect(() => {
    if (selectedPolicyForPrint) {
      const timer = setTimeout(() => {
        window.print();
        setSelectedPolicyForPrint(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedPolicyForPrint]);

  const handlePrintPolicy = (policy: Policy) => {
    setSelectedPolicyForPrint(policy);
  };

  // Account editing modal state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Partial<LedgerAccount>>({
    code: '', name: '', level: 1, type: 'ASSET', nature: 'DEBIT', satGroupCode: '', isActive: true, isSubaccount: true
  });

  // Load accounting collections from database or seed defaults
  const loadAccountingData = async () => {
    setIsLoading(true);
    try {
      const data = await dataService.getAllData();
      
      // Load accounts
      let dbAccounts: LedgerAccount[] = data.accounts || [];
      if (dbAccounts.length === 0) {
        // Seed default catalog
        console.log("Seeding default Mexican SAT chart of accounts...");
        for (const acc of INITIAL_SAT_CATALOG) {
          // Catalog entries are keyed by account code (they have no separate id field).
          await dataService.upsertRecord(TABLES.ACCOUNTS, { ...acc, id: acc.code });
        }
        dbAccounts = INITIAL_SAT_CATALOG;
      }
      setAccounts(dbAccounts.sort((a, b) => a.code.localeCompare(b.code)));

      // Load policies
      const dbPolicies: Policy[] = data.policies || [];
      setPolicies(dbPolicies.sort((a, b) => b.date.localeCompare(a.date)));

      // Load cost centers
      let dbCostCenters: CostCenter[] = data.costCenters || [];
      if (dbCostCenters.length === 0) {
        const defaultCenters: CostCenter[] = [
          { id: '1', code: 'EST', name: 'Estacionamiento', isActive: true },
          { id: '2', code: 'LOC', name: 'Locales Comerciales', isActive: true },
          { id: '3', code: 'OFI', name: 'Oficinas', isActive: true },
          { id: '4', code: 'ADM', name: 'Administración General', isActive: true }
        ];
        for (const cc of defaultCenters) {
          await dataService.upsertRecord(TABLES.COST_CENTERS, cc);
        }
        dbCostCenters = defaultCenters;
      }
      setCostCenters(dbCostCenters);

      // Load period states
      const dbPeriods: FiscalPeriodState[] = data.accountingConfig || [];
      setPeriodStates(dbPeriods);
    } catch (e) {
      console.error("Error loading accounting data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccountingData();
  }, [transactions]);

  // Derived state: check if current period is locked
  const isPeriodLocked = useMemo(() => {
    const state = periodStates.find(p => p.id === period);
    return state ? state.status === 'LOCKED' : false;
  }, [periodStates, period]);

  // Derived state: calculate trial balance for current filters
  const trialBalance = useMemo(() => {
    const start = `${period}-01`;
    const end = `${period}-31`;
    // Filter operational transactions that happen in this period
    const ops = transactions.filter(t => t.date >= start && t.date <= end);
    // Filter manual policies
    const pols = policies.filter(p => p.fiscalPeriod === period);
    return accountingService.generateTrialBalance(pols, ops, accounts, start, end);
  }, [policies, transactions, accounts, period]);

  // Consolidate manual policies and mapped operational transactions for reporting
  const consolidatedPolicies = useMemo(() => {
    const start = `${period}-01`;
    const end = `${period}-31`;
    const activeCatalog = accounts.length > 0 ? accounts : INITIAL_SAT_CATALOG;
    
    // Copy manual policies
    const all = [...policies];
    
    // Filter operational transactions for the period
    const ops = transactions.filter(t => t.date >= start && t.date <= end);
    ops.forEach(tx => {
      // Avoid duplicating transactions that already have a manual policy
      if (!policies.some(p => p.id === `POL-${tx.id}` || p.id === tx.id)) {
        all.push(accountingService.transactionToPolicy(tx, activeCatalog));
      }
    });
    
    return all.filter(p => p.status === 'POSTED');
  }, [policies, transactions, accounts, period]);

  const formatFolio = (move: any) => {
    if (!move.id) return `${move.type.slice(0, 3)}-${move.folio}`;
    if (move.id.startsWith('POL-')) {
      const originalId = move.id.replace('POL-', '');
      if (originalId.length > 8) {
        return `${move.type.slice(0, 3)}-OP-${originalId.slice(0, 6).toUpperCase()}`;
      }
      return `${move.type.slice(0, 3)}-${move.folio}`;
    }
    return `${move.type.slice(0, 3)}-${move.folio}`;
  };

  const auxiliarMoves = useMemo(() => {
    if (!selectedAccountForAuxiliar) return [];
    
    const initial = trialBalance[selectedAccountForAuxiliar]?.initial || 0;
    const acc = accounts.find(a => a.code === selectedAccountForAuxiliar);
    const nature = acc?.nature || 'DEBIT';
    
    const moves = consolidatedPolicies
      .flatMap(p => 
        p.lines
          .filter(l => l.accountCode === selectedAccountForAuxiliar)
          .map(l => ({ 
            ...l, 
            id: p.id,
            date: p.date, 
            folio: p.folio, 
            type: p.policyType 
          }))
      )
      .sort((a, b) => a.date.localeCompare(b.date));
      
    let running = initial;
    return moves.map(m => {
      if (nature === 'DEBIT') {
        running += (m.debit || 0) - (m.credit || 0);
      } else {
        running += (m.credit || 0) - (m.debit || 0);
      }
      return {
        ...m,
        runningBalance: running
      };
    });
  }, [selectedAccountForAuxiliar, consolidatedPolicies, trialBalance, accounts]);

  const auxiliarTotals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    auxiliarMoves.forEach(m => {
      debits += m.debit || 0;
      credits += m.credit || 0;
    });
    return { debits, credits };
  }, [auxiliarMoves]);

  // Derived state: P&L numbers
  const pylData = useMemo(() => {
    const incomeAccs = accounts.filter(a => a.type === 'INCOME').map(a => a.code);
    const expenseAccs = accounts.filter(a => a.type === 'EXPENSE').map(a => a.code);
    
    let income = 0;
    let expenses = 0;

    Object.entries(trialBalance).forEach(([code, b]) => {
      // Direct match or child account match
      const acc = accounts.find(a => a.code === code);
      if (!acc) return;
      
      const balance = b as { initial: number; debits: number; credits: number; final: number };
      const isFilteredCostCenter = selectedCostCenter === 'all'; // In simple store, centers are row-level. 
      // If cost centers are filtered, we'd look into lines, but for global indicators we consolidate.

      if (incomeAccs.some(incCode => code.startsWith(incCode))) {
        income += balance.final;
      }
      if (expenseAccs.some(expCode => code.startsWith(expCode))) {
        expenses += balance.final;
      }
    });

    return { income, expenses, profit: income - expenses };
  }, [trialBalance, accounts, selectedCostCenter]);

  // Derived state: policies filtered by period and search term
  const filteredPolicies = useMemo(() => {
    return policies.filter(p => {
      const matchPeriod = p.fiscalPeriod === period;
      const matchSearch = searchTerm === '' || 
        p.concept.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.folio.toString().includes(searchTerm) ||
        p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.lines.some(l => l.accountCode.includes(searchTerm) || l.accountName.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchPeriod && matchSearch;
    });
  }, [policies, period, searchTerm]);

  // Keyboard navigation & quick balance for policy grid
  const handleLineChange = (index: number, field: keyof PolicyLine, value: string) => {
    const updated = [...policyLines];
    const current = updated[index];
    const updatedLine: PolicyLine = (field === 'debit' || field === 'credit' || field === 'lineNumber')
      ? { ...current, [field]: Number(value) || 0 }
      : { ...current, [field]: value };
    updated[index] = updatedLine;

    if (field === 'accountCode') {
      const acc = accounts.find(a => a.code === value);
      if (acc) {
        updatedLine.accountName = acc.name;
      }
    }
    setPolicyLines(updated);
  };

  const addPolicyLine = () => {
    setPolicyLines([
      ...policyLines,
      { lineNumber: policyLines.length + 1, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' }
    ]);
  };

  const removePolicyLine = (index: number) => {
    if (policyLines.length <= 2) return; // ASPEL requires at least two lines for double-entry
    setPolicyLines(policyLines.filter((_, idx) => idx !== index).map((l, i) => ({ ...l, lineNumber: i + 1 })));
  };

  // real-time balance calculations
  const policyTotals = useMemo(() => {
    const debit = policyLines.reduce((s, l) => s + (l.debit || 0), 0);
    const credit = policyLines.reduce((s, l) => s + (l.credit || 0), 0);
    const difference = Math.abs(debit - credit);
    return { debit, credit, difference, isBalanced: difference < 0.01 };
  }, [policyLines]);

  // Auto-balance shortcut (F3 key behavior)
  const applyAutoBalance = (index: number) => {
    const diff = policyTotals.debit - policyTotals.credit;
    const updated = [...policyLines];
    if (diff > 0) {
      updated[index].credit = Number(diff.toFixed(2));
      updated[index].debit = 0;
    } else if (diff < 0) {
      updated[index].debit = Number(Math.abs(diff).toFixed(2));
      updated[index].credit = 0;
    }
    setPolicyLines(updated);
  };

  // Drag & Drop / XML Parsing logic
  const handleXMLUpload = async (file: File) => {
    try {
      const text = await file.text();
      const metadata = parseCFDIXml(text);
      
      // Check if XML UUID already associated
      const isDuplicate = policies.some(p => p.cfdis?.some(c => c.uuid === metadata.uuid));
      if (isDuplicate) {
        alert(`Advertencia Fiscal: El CFDI con UUID ${metadata.uuid.slice(0,8)}... ya está registrado en otra póliza.`);
        return;
      }

      setIsLoading(true);
      let xmlUrl = "";
      try {
        const url = await dataService.uploadFile(file);
        if (url) xmlUrl = url;
      } catch (error) {
        console.error("Error subiendo XML a Storage:", error);
      }
      setIsLoading(false);

      const completeMetadata: CFDIMetadata = {
        ...metadata,
        xmlUrl: xmlUrl || undefined
      };

      setAttachedCFDIs([...attachedCFDIs, completeMetadata]);

      alert(`CFDI procesado con éxito: ${metadata.nameIssuer} por $${metadata.total.toLocaleString('es-MX')}. El comprobante ha sido adjuntado a la póliza sin alterar tus asientos registrados.`);
    } catch (e: any) {
      setIsLoading(false);
      alert(`Error al leer CFDI: ${e.message}`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    const xmlFiles = files.filter(f => f.name.endsWith('.xml'));
    if (xmlFiles.length > 0) {
      await handleXMLUpload(xmlFiles[0]);
    } else {
      alert('Solo se admiten archivos en formato XML (CFDI).');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length > 0) {
      await handleXMLUpload(files[0]);
    }
  };

  // Save Policy to Firestore
  const handleSavePolicy = async () => {
    if (isPeriodLocked) {
      alert("Error: El periodo fiscal correspondiente a esta póliza está CERRADO y bloqueado.");
      return;
    }

    if (!policyConcept.trim()) {
      alert("El concepto de la póliza es obligatorio.");
      return;
    }

    if (!policyTotals.isBalanced) {
      alert(`La póliza no cuadra. Diferencia de cargos/abonos: $${policyTotals.difference.toFixed(2)} MXN.`);
      return;
    }

    // Verify all accounts are Affectable
    for (const line of policyLines) {
      if (!line.accountCode) {
        alert("Todos los asientos deben tener una cuenta contable asignada.");
        return;
      }
      const acc = accounts.find(a => a.code === line.accountCode);
      if (acc && !acc.isSubaccount) {
        alert(`Cuenta no afectable: La cuenta ${acc.code} - ${acc.name} es de mayor y no recibe cargos directos. Use una subcuenta.`);
        return;
      }
    }

    setIsLoading(true);
    try {
      // Calculate next consecutive folio for this period and type
      const polPeriod = policyDate.slice(0, 7);
      const sameTypePolicies = policies.filter(p => p.fiscalPeriod === polPeriod && p.policyType === policyType);
      const nextFolio = editingPolicyId 
        ? policies.find(p => p.id === editingPolicyId)?.folio || 1 
        : (sameTypePolicies.length > 0 ? Math.max(...sameTypePolicies.map(p => p.folio)) + 1 : 1);

      const policyId = editingPolicyId || `POL-${Date.now()}`;
      const now = new Date().toISOString();

      const newPolicy: Policy = {
        id: policyId,
        fiscalPeriod: polPeriod,
        policyType,
        folio: nextFolio,
        date: policyDate,
        concept: policyConcept,
        status: 'POSTED',
        totalDebit: policyTotals.debit,
        totalCredit: policyTotals.credit,
        created_at: now,
        updated_at: now,
        registeredBy: 'ADMIN_CONTABLE',
        lines: policyLines,
        cfdis: attachedCFDIs
      };

      await dataService.upsertRecord(TABLES.POLICIES, newPolicy);
      await loadAccountingData();
      
      // Reset form
      setEditingPolicyId(null);
      setPolicyConcept('');
      setAttachedCFDIs([]);
      setPolicyLines([
        { lineNumber: 1, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' },
        { lineNumber: 2, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' }
      ]);
      
      setActiveTab('polizas');
      alert("Póliza registrada correctamente en la base de datos.");
    } catch (e) {
      console.error(e);
      alert("Error al guardar la póliza en Firestore.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditPolicy = (policy: Policy) => {
    setEditingPolicyId(policy.id);
    setPolicyType(policy.policyType);
    setPolicyDate(policy.date);
    setPolicyConcept(policy.concept);
    setPolicyLines(policy.lines);
    setAttachedCFDIs(policy.cfdis || []);
    setActiveTab('captura');
  };

  const handleCancelPolicy = async (policy: Policy) => {
    if (window.confirm(`¿Estás seguro de que deseas cancelar la póliza Folio ${policy.folio} (${policy.policyType})?`)) {
      setIsLoading(true);
      try {
        const updated = {
          ...policy,
          status: 'CANCELLED' as PolicyStatus,
          updated_at: new Date().toISOString(),
          cancelledAt: new Date().toISOString(),
          cancelledBy: 'ADMIN_CONTABLE'
        };
        await dataService.upsertRecord(TABLES.POLICIES, updated);
        await loadAccountingData();
        alert("Póliza marcada como CANCELADA.");
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Add/Edit dynamic account
  const handleSaveAccount = async () => {
    if (!editingAccount.code || !editingAccount.name) {
      alert("El código y nombre de cuenta son requeridos.");
      return;
    }

    setIsLoading(true);
    try {
      const fullAccount: LedgerAccount = {
        code: editingAccount.code,
        name: editingAccount.name,
        level: Number(editingAccount.level) || 1,
        type: editingAccount.type as any,
        nature: editingAccount.nature as any,
        satGroupCode: editingAccount.satGroupCode || editingAccount.code,
        isActive: editingAccount.isActive !== false,
        isSubaccount: editingAccount.isSubaccount !== false,
        parentCode: editingAccount.parentCode || undefined
      };

      await dataService.upsertRecord(TABLES.ACCOUNTS, { ...fullAccount, id: fullAccount.code });
      await loadAccountingData();
      setIsAccountModalOpen(false);
      alert("Cuenta contable actualizada con éxito.");
    } catch (e) {
      alert("Error al guardar la cuenta.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fiscal period locking wizard
  const handleTogglePeriodLock = async () => {
    const currentStatus = isPeriodLocked ? 'LOCKED' : 'OPEN';
    const nextStatus = currentStatus === 'LOCKED' ? 'OPEN' : 'LOCKED';
    
    if (window.confirm(`¿Confirmas que deseas ${nextStatus === 'LOCKED' ? 'CERRAR Y BLOQUEAR' : 'REABRIR'} el periodo fiscal ${period}?`)) {
      setIsLoading(true);
      try {
        const updatedConfig: FiscalPeriodState = {
          id: period,
          status: nextStatus,
          lockedAt: nextStatus === 'LOCKED' ? new Date().toISOString() : undefined,
          lockedBy: nextStatus === 'LOCKED' ? 'ADMIN' : undefined
        };
        await dataService.upsertRecord(TABLES.ACCOUNTING_CONFIG, updatedConfig);
        await loadAccountingData();
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Export functions
  const exportBalanzaXML = () => {
    const rfc = "XAXX010101000"; // RFC genérico del SAT (público en general)
    const [year, month] = period.split('-').map(Number);
    const xml = accountingService.exportTrialBalanceToSATXML(rfc, year, month, trialBalance, accounts);
    
    const blob = new Blob([xml], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rfc}${year.toString().slice(2)}${month.toString().padStart(2, '0')}B.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (activeTab === 'reportes' && reportSubTab === 'balanza') {
      const headers = ['Código SAT', 'Cuenta', 'Nivel', 'Saldo Inicial', 'Debe (Cargos)', 'Haber (Abonos)', 'Saldo Final'];
      const data = accounts.map(acc => {
        const b = trialBalance[acc.code] || { initial: 0, debits: 0, credits: 0, final: 0 };
        return [acc.code, acc.name, acc.level, b.initial, b.debits, b.credits, b.final];
      });
      exportToCSV(`Balanza_Comprobacion_${period}`, headers, data);
    } else {
      // Export policy list
      const headers = ['Folio', 'Fecha', 'Tipo', 'Concepto', 'Cargos', 'Haber', 'UUIDs', 'Estatus'];
      const data = filteredPolicies.map(p => [
        p.folio, p.date, p.policyType, p.concept, p.totalDebit, p.totalCredit, 
        p.cfdis?.map(c => c.uuid.slice(0, 8)).join('; ') || '', p.status
      ]);
      exportToCSV(`Polizas_Contables_${period}`, headers, data);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in print:p-0">
      
      {/* 1. Header Bar (Visual premium gradient) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 rounded-[2.5rem] border border-indigo-950 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <Calculator size={28} />
            </div>
            <div>
              <h3 className="text-3xl font-black text-white uppercase tracking-tighter">
                {plaza.shortName} · Contabilidad
              </h3>
              <p className="text-indigo-300 font-bold text-[10px] uppercase tracking-widest mt-0.5">
                Consola Contable Mexicana Estilo COI • SAT v4.0
              </p>
            </div>
          </div>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/50">
            <button 
              onClick={() => setActiveTab('dashboard')} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'dashboard' ? 'bg-indigo-600 shadow text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid size={13} /> Tablero
            </button>
            <button 
              onClick={() => setActiveTab('catalogo')} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'catalogo' ? 'bg-indigo-600 shadow text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Book size={13} /> Catálogo
            </button>
            <button 
              onClick={() => setActiveTab('polizas')} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'polizas' ? 'bg-indigo-600 shadow text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <List size={13} /> Pólizas
            </button>
            <button 
              onClick={() => { setEditingPolicyId(null); setActiveTab('captura'); }} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'captura' ? 'bg-indigo-600 shadow text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Plus size={13} /> Captura
            </button>
            <button 
              onClick={() => setActiveTab('reportes')} 
              className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === 'reportes' ? 'bg-indigo-600 shadow text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <FileSpreadsheet size={13} /> Reportes
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input 
              type="month" 
              className="bg-slate-800 text-white border border-slate-700 rounded-xl px-4 py-2.5 font-black text-xs outline-none focus:border-indigo-500"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
            
            <button 
              onClick={handleTogglePeriodLock} 
              title={isPeriodLocked ? "Periodo cerrado. Haz clic para abrir." : "Periodo abierto. Haz clic para cerrar."}
              className={`p-2.5 rounded-xl border transition-all ${isPeriodLocked ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}
            >
              {isPeriodLocked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="flex justify-center items-center py-12 bg-white rounded-[2.5rem] shadow-sm border border-slate-100">
          <RefreshCw className="animate-spin text-indigo-600 mr-2" size={24} />
          <span className="font-bold text-slate-600 text-sm">Procesando datos contables...</span>
        </div>
      )}

      {/* 2. MAIN SUB-TABS RENDER */}
      {!isLoading && (
        <div className="min-h-[500px]">
          
          {/* TAB A: DASHBOARD / TABLERO */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Financial Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingresos Totales</span>
                    <TrendingUp className="text-emerald-500" size={18} />
                  </div>
                  <h4 className="text-2xl font-black text-slate-900">${pylData.income.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Ingresos brutos del periodo</p>
                </div>
                
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gastos Totales</span>
                    <TrendingUp className="text-rose-500 rotate-180" size={18} />
                  </div>
                  <h4 className="text-2xl font-black text-slate-900">${pylData.expenses.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Egresos / Gastos operativos</p>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Utilidad Neta</span>
                    <Landmark className="text-indigo-600" size={18} />
                  </div>
                  <h4 className={`text-2xl font-black ${pylData.profit >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                    ${pylData.profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Margen Operativo Neto</p>
                </div>

                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estatus Periodo</span>
                    {isPeriodLocked ? <Lock className="text-rose-500" size={18} /> : <Unlock className="text-emerald-500" size={18} />}
                  </div>
                  <h4 className="text-xl font-black text-slate-950">{isPeriodLocked ? 'CERRADO (LOCKED)' : 'ABIERTO (OPEN)'}</h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Bloqueo de modificaciones fiscales</p>
                </div>
              </div>

              {/* Status and instructions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1 space-y-4">
                    <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Análisis Operativo Mensual</h3>
                    <p className="text-slate-500 text-xs leading-relaxed">
                      El periodo fiscal <span className="font-bold text-slate-800">{period}</span> cuenta con un saldo de utilidad neta de <span className="font-bold text-indigo-600">${pylData.profit.toLocaleString('es-MX')}</span>. 
                      Los ingresos provienen principalmente del cobro de rentas mensuales de locatarios y del flujo diario del estacionamiento.
                      Para mantener la validez fiscal, asocie todos los XML/CFDI correspondientes a las pólizas antes del cierre del mes.
                    </p>
                    <div className="flex gap-3 pt-2">
                      <div className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase">Eficiencia: {pylData.income > 0 ? ((pylData.profit / pylData.income) * 100).toFixed(0) : 0}%</div>
                      <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase">XML Conciliados: 100%</div>
                    </div>
                  </div>
                  <div className="w-48 h-48 bg-slate-950 rounded-[2rem] flex flex-col justify-center items-center relative overflow-hidden text-white shadow-xl">
                    <Activity size={48} className="text-indigo-400 mb-2 relative z-10" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Control de Ejercicio</span>
                    <span className="text-xl font-bold mt-1 text-white">{period}</span>
                  </div>
                </div>

                <div className="bg-slate-900 text-white rounded-[2rem] p-8 border border-slate-800 shadow-xl flex flex-col justify-between">
                  <div>
                    <h4 className="font-black text-sm uppercase tracking-wider text-indigo-300 flex items-center gap-1.5 mb-4">
                      <ShieldCheck size={18} /> Validaciones SAT
                    </h4>
                    <ul className="space-y-3 text-xs text-slate-400">
                      <li className="flex items-start gap-2">
                        <Check className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                        <span>Catálogo compatible con agrupador SAT</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                        <span>Partida Doble activa (obligatoria al guardar)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                        <span>Unicidad de UUID fiscales vinculados</span>
                      </li>
                    </ul>
                  </div>
                  <button onClick={() => { setActiveTab('reportes'); setReportSubTab('balanza'); }} className="mt-6 w-full py-3 bg-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest text-center hover:bg-indigo-500 transition-all">
                    Generar Balanza SAT XML
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB B: CHART OF ACCOUNTS / CATALOGO */}
          {activeTab === 'catalogo' && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Catálogo de Cuentas Contables</h3>
                  <p className="text-xs text-slate-400">Administra cuentas y subcuentas asociadas a los agrupadores del SAT</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingAccount({
                        code: '', name: '', level: 1, type: 'ASSET', nature: 'DEBIT', satGroupCode: '', isActive: true, isSubaccount: true
                      });
                      setIsAccountModalOpen(true);
                    }}
                    className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-500 transition-all"
                  >
                    <Plus size={16} /> Nueva Cuenta
                  </button>
                </div>
              </div>

              {/* Tree View list */}
              <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto pr-2">
                {accounts.map(acc => {
                  const paddingClass = acc.level === 2 ? 'pl-8' : acc.level === 3 ? 'pl-16' : '';
                  const bgClass = acc.level === 1 ? 'bg-slate-900 text-white border-slate-800' : 'bg-slate-50 border-slate-100 hover:border-indigo-200';
                  const textClass = acc.level === 1 ? 'text-white' : 'text-slate-800';

                  return (
                    <div key={acc.code} className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${bgClass} ${paddingClass}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className={`text-[9px] font-black uppercase tracking-wider ${acc.level === 1 ? 'text-indigo-400' : 'text-slate-400'}`}>
                            {acc.code} {acc.satGroupCode ? `(SAT: ${acc.satGroupCode})` : ''}
                          </span>
                          <span className={`font-black text-sm uppercase tracking-tight ${textClass}`}>{acc.name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase ${acc.nature === 'DEBIT' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {acc.nature === 'DEBIT' ? 'Deudora' : 'Acreedora'}
                        </span>
                        
                        <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase ${acc.isSubaccount ? 'bg-slate-200 text-slate-600' : 'bg-indigo-500/20 text-indigo-400'}`}>
                          {acc.isSubaccount ? 'Afectable' : 'Título'}
                        </span>

                        <div className="flex gap-1.5 ml-2">
                          <button 
                            onClick={() => {
                              setEditingAccount(acc);
                              setIsAccountModalOpen(true);
                            }}
                            className={`p-1.5 rounded-lg ${acc.level === 1 ? 'text-indigo-300 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-200'}`}
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB C: POLICY MANAGER / POLIZAS */}
          {activeTab === 'polizas' && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
              
              {/* Tray Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Control de Pólizas Contables</h3>
                  <p className="text-xs text-slate-400">Listado de pólizas del mes para auditoría y validación</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-3.5 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar póliza o cuenta..." 
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-4 py-2.5 font-bold text-xs outline-none focus:border-indigo-500"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button onClick={handleExportCSV} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all">
                    <Download size={18} />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-[10px] font-black uppercase text-slate-400 tracking-wider text-left">
                      <th className="pb-3">Folio</th>
                      <th className="pb-3">Fecha</th>
                      <th className="pb-3">Tipo</th>
                      <th className="pb-3">Concepto General</th>
                      <th className="pb-3 text-right">Cargos (Debe)</th>
                      <th className="pb-3 text-right">Abonos (Haber)</th>
                      <th className="pb-3 text-center">XMLs</th>
                      <th className="pb-3 text-center">Estatus</th>
                      <th className="pb-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredPolicies.map(policy => (
                      <tr key={policy.id} className="hover:bg-slate-50 transition-colors text-xs font-semibold text-slate-700">
                        <td className="py-4 font-bold text-slate-950">{policy.policyType.slice(0, 3)}-{policy.folio.toString().padStart(4, '0')}</td>
                        <td className="py-4">{policy.date}</td>
                        <td className="py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${policy.policyType === 'INGRESOS' ? 'bg-emerald-50 text-emerald-600' : policy.policyType === 'EGRESOS' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                            {policy.policyType}
                          </span>
                        </td>
                        <td className="py-4 max-w-xs truncate" title={policy.concept}>{policy.concept}</td>
                        <td className="py-4 text-right font-mono font-bold">${policy.totalDebit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        <td className="py-4 text-right font-mono font-bold">${policy.totalCredit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        <td className="py-4 text-center">
                          {policy.cfdis && policy.cfdis.length > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[8px] font-black uppercase">
                                {policy.cfdis.length} XML
                              </span>
                              <div className="flex flex-col gap-0.5">
                                {policy.cfdis.map((c, idx) => (
                                  <button 
                                    key={idx}
                                    onClick={() => setPreviewingCfdi(c)}
                                    className="text-[9px] text-indigo-500 hover:underline max-w-[100px] truncate block font-bold text-left"
                                    title={`Visualizar factura de ${c.nameIssuer}`}
                                  >
                                    {c.nameIssuer}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${policy.status === 'POSTED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {policy.status === 'POSTED' ? 'Registrada' : 'Cancelada'}
                          </span>
                        </td>
                        <td className="py-4 text-center flex justify-center gap-2">
                          <button 
                            disabled={policy.status === 'CANCELLED'}
                            onClick={() => handlePrintPolicy(policy)}
                            className="p-1 text-slate-500 hover:text-blue-600 disabled:opacity-30"
                            title="Imprimir póliza"
                          >
                            <Printer size={15} />
                          </button>
                          <button 
                            disabled={policy.status === 'CANCELLED'}
                            onClick={() => handleEditPolicy(policy)}
                            className="p-1 text-slate-500 hover:text-indigo-600 disabled:opacity-30"
                            title="Editar póliza"
                          >
                            <Edit3 size={15} />
                          </button>
                          <button 
                            disabled={policy.status === 'CANCELLED'}
                            onClick={() => handleCancelPolicy(policy)}
                            className="p-1 text-slate-500 hover:text-rose-600 disabled:opacity-30"
                            title="Cancelar póliza"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredPolicies.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 font-bold">
                          No se encontraron pólizas registradas para el periodo {period}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB D: POLICY CAPTURE / CAPTURA */}
          {activeTab === 'captura' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Policy Fields (2/3 size) */}
              <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b pb-4">
                  <h3 className="text-xl font-black text-slate-900 uppercase">
                    {editingPolicyId ? 'Modificar Póliza Contable' : 'Nueva Póliza Contable'}
                  </h3>
                  <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
                    Partida Doble
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Póliza</label>
                    <select 
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs outline-none"
                      value={policyType}
                      onChange={e => setPolicyType(e.target.value as PolicyType)}
                    >
                      <option value="DIARIO">DIARIO</option>
                      <option value="INGRESOS">INGRESOS</option>
                      <option value="EGRESOS">EGRESOS</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Póliza</label>
                    <input 
                      type="date" 
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs outline-none"
                      value={policyDate}
                      onChange={e => setPolicyDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Folio Consecutivo</label>
                    <input 
                      type="text" 
                      disabled
                      className="w-full bg-slate-100 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs text-slate-500 outline-none"
                      value="Automático"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Concepto General</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Pago de mantenimiento mensual..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs outline-none focus:border-indigo-500"
                    value={policyConcept}
                    onChange={e => setPolicyConcept(e.target.value)}
                  />
                </div>

                {/* Double-entry Grid */}
                <div className="space-y-4 pt-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-black text-xs uppercase tracking-widest text-slate-500">Asientos Contables</h4>
                    <button 
                      onClick={addPolicyLine}
                      className="text-indigo-600 font-black text-[10px] uppercase hover:underline flex items-center gap-1"
                    >
                      <Plus size={12} /> Añadir Asiento
                    </button>
                  </div>

                  <table className="w-full">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase text-left border-b pb-2">
                        <th className="pb-2 w-32">Cuenta</th>
                        <th className="pb-2">Nombre Cuenta</th>
                        <th className="pb-2 w-28 text-right">Debe (Cargo)</th>
                        <th className="pb-2 w-28 text-right">Haber (Abono)</th>
                        <th className="pb-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {policyLines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-2">
                            <select 
                              className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-xs font-bold"
                              value={line.accountCode}
                              onChange={e => handleLineChange(idx, 'accountCode', e.target.value)}
                            >
                              <option value="">Seleccionar...</option>
                              {accounts.map(acc => (
                                <option key={acc.code} value={acc.code} disabled={!acc.isSubaccount}>
                                  {acc.code} {!acc.isSubaccount ? '(Título)' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2 text-xs font-medium text-slate-500 max-w-[150px] truncate">
                            {line.accountName}
                          </td>
                          <td className="py-2 px-2">
                            <input 
                              type="number" 
                              placeholder="0.00"
                              className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-right text-xs font-mono"
                              value={line.debit || ''}
                              onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                            />
                          </td>
                          <td className="py-2 pl-2">
                            <div className="flex items-center gap-1">
                              <input 
                                type="number" 
                                placeholder="0.00"
                                className="w-full bg-slate-50 border border-slate-100 rounded-lg p-2 text-right text-xs font-mono"
                                value={line.credit || ''}
                                onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                              />
                              <button 
                                onClick={() => applyAutoBalance(idx)}
                                title="Auto-cuadrar renglón (F3)"
                                className="p-2 bg-slate-100 text-slate-500 rounded hover:bg-slate-200"
                              >
                                <Check size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="py-2 pl-4 text-center">
                            <button 
                              onClick={() => removePolicyLine(idx)}
                              className="text-slate-400 hover:text-rose-500 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-black text-xs border-t">
                        <td colSpan={2} className="pt-4 text-right pr-4 uppercase text-[10px] text-slate-400">Totales Póliza:</td>
                        <td className="pt-4 text-right font-mono">${policyTotals.debit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        <td className="pt-4 text-right font-mono">${policyTotals.credit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                      {policyTotals.difference > 0 && (
                        <tr>
                          <td colSpan={5} className="pt-2 text-right text-[10px] font-black text-rose-500 uppercase">
                            Diferencia: ${policyTotals.difference.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>

                {/* Save actions */}
                <div className="border-t pt-6 flex justify-end gap-3">
                  <button 
                    onClick={() => {
                      setEditingPolicyId(null);
                      setPolicyConcept('');
                      setAttachedCFDIs([]);
                      setPolicyLines([
                        { lineNumber: 1, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' },
                        { lineNumber: 2, accountCode: '', accountName: '', debit: 0, credit: 0, concept: '' }
                      ]);
                      setActiveTab('polizas');
                    }}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSavePolicy}
                    disabled={isPeriodLocked}
                    className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all ${isPeriodLocked ? 'bg-slate-350 text-slate-400 cursor-not-allowed' : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200'}`}
                  >
                    <Save size={16} /> {editingPolicyId ? 'Guardar Cambios' : 'Registrar Póliza'}
                  </button>
                </div>
              </div>

              {/* CFDI / XML Drag Zone (1/3 size) */}
              <div className="space-y-6">
                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`bg-white p-8 rounded-[2.5rem] border-2 border-dashed shadow-sm flex flex-col justify-center items-center text-center p-8 min-h-[250px] transition-all cursor-pointer ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-400'}`}
                >
                  <Upload size={40} className="text-slate-400 mb-4" />
                  <h4 className="font-black text-sm uppercase text-slate-700">Arrastra tu CFDI XML aquí</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Lector de facturas SAT v3.3 / v4.0</p>
                  
                  <div className="w-px h-6 bg-slate-200 my-4" />
                  
                  <label className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all">
                    Seleccionar Archivo
                    <input type="file" className="hidden" accept=".xml" onChange={handleFileSelect} />
                  </label>
                </div>

                {/* Attached XMLs */}
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                  <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                    <FileCode size={16} className="text-indigo-600" /> XMLs Asociados
                  </h4>
                  {attachedCFDIs.length === 0 ? (
                    <p className="text-xs text-slate-400 font-medium">Ningún comprobante vinculado a la póliza actual.</p>
                  ) : (
                    <div className="space-y-3">
                      {attachedCFDIs.map((c, i) => (
                        <div 
                          key={i} 
                          onClick={() => setPreviewingCfdi(c)}
                          className="p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer rounded-xl border border-slate-100 flex justify-between items-center text-xs transition-colors"
                          title="Haz clic para visualizar los detalles de la factura"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-indigo-600 hover:underline flex items-center gap-1">
                              {c.nameIssuer} <Eye size={12} />
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">{c.uuid.slice(0, 18)}...</span>
                          </div>
                          <span className="font-bold text-slate-900 font-mono">${c.total.toLocaleString('es-MX')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB E: FISCAL REPORTS & CLOSING / REPORTES */}
          {activeTab === 'reportes' && (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-8">
              
              {/* Reports Navigation toolbar */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button 
                    onClick={() => setReportSubTab('balanza')} 
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${reportSubTab === 'balanza' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                  >
                    Balanza de Comprobación
                  </button>
                  <button 
                    onClick={() => setReportSubTab('auxiliares')} 
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${reportSubTab === 'auxiliares' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                  >
                    Auxiliares de Cuenta
                  </button>
                  <button 
                    onClick={() => setReportSubTab('pyl')} 
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${reportSubTab === 'pyl' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`}
                  >
                    Estado de Resultados
                  </button>
                </div>

                <div className="flex gap-2">
                  {reportSubTab === 'balanza' && (
                    <button 
                      onClick={exportBalanzaXML}
                      className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                    >
                      <FileCode size={15} /> XML Electrónico SAT
                    </button>
                  )}
                  <button onClick={handleExportCSV} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all">
                    <Download size={16} />
                  </button>
                </div>
              </div>

              {/* REPORT VIEW A: BALANZA DE COMPROBACION */}
              {reportSubTab === 'balanza' && (
                <div className="space-y-6">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black uppercase text-slate-950">Balanza de Comprobación</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ejercicio {period.slice(0,4)} • Periodo {period.slice(5,7)}</p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b-2 border-slate-950 text-[10px] font-black text-slate-400 uppercase tracking-wider text-left">
                          <th className="pb-3">Código Cuenta</th>
                          <th className="pb-3">Nombre de la Cuenta</th>
                          <th className="pb-3 text-right">Saldo Inicial</th>
                          <th className="pb-3 text-right">Cargos (Debe)</th>
                          <th className="pb-3 text-right">Abonos (Haber)</th>
                          <th className="pb-3 text-right">Saldo Final</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {accounts.map(acc => {
                          const b = trialBalance[acc.code] || { initial: 0, debits: 0, credits: 0, final: 0 };
                          
                          // Hide accounts with zero balance or movements to keep it clean (as SAT requires)
                          if (b.initial === 0 && b.debits === 0 && b.credits === 0 && b.final === 0) {
                            return null;
                          }

                          const isMayor = acc.level === 1;
                          const fontClass = isMayor ? 'font-black bg-slate-50' : 'text-slate-600 font-medium';
                          const padClass = acc.level === 2 ? 'pl-8' : acc.level === 3 ? 'pl-16' : '';

                          return (
                            <tr key={acc.code} className={`hover:bg-slate-100 transition-colors ${fontClass}`}>
                              <td className="py-3 font-semibold text-slate-900">{acc.code}</td>
                              <td className={`py-3 ${padClass}`}>{acc.name}</td>
                              <td className="py-3 text-right font-mono">${b.initial.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="py-3 text-right font-mono text-indigo-600">${b.debits.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="py-3 text-right font-mono text-emerald-600">${b.credits.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="py-3 text-right font-mono font-bold">${b.final.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* REPORT VIEW B: AUXILIARES */}
              {reportSubTab === 'auxiliares' && (
                <div className="space-y-6">
                  <div className="flex gap-4 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="flex-1 max-w-sm space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Seleccionar Cuenta Contable</label>
                      <select 
                        className="w-full bg-white border border-slate-100 rounded-xl px-3 py-2.5 font-bold text-xs outline-none"
                        value={selectedAccountForAuxiliar}
                        onChange={e => setSelectedAccountForAuxiliar(e.target.value)}
                      >
                        <option value="">-- Elige una cuenta --</option>
                        {accounts.filter(a => a.isSubaccount).map(a => (
                          <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedAccountForAuxiliar ? (
                    <div className="space-y-4 animate-fade-in">
                      <div className="border rounded-2xl p-4 bg-slate-900 text-white flex justify-between items-center">
                        <span className="font-black text-sm uppercase">Auxiliar de Cuenta: {selectedAccountForAuxiliar} - {accountingService.getAccountName(selectedAccountForAuxiliar, accounts)}</span>
                        <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Periodo: {period}</span>
                      </div>

                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-[10px] font-black text-slate-400 uppercase text-left pb-2">
                            <th className="pb-2">Fecha</th>
                            <th className="pb-2">Póliza / Ref</th>
                            <th className="pb-2">Concepto</th>
                            <th className="pb-2 text-right">Cargo</th>
                            <th className="pb-2 text-right">Abono</th>
                            <th className="pb-2 text-right">Saldo Acumulado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y font-semibold text-slate-700">
                          {/* Render initial balance row if non-zero */}
                          {selectedAccountForAuxiliar && (trialBalance[selectedAccountForAuxiliar]?.initial || 0) !== 0 && (
                            <tr className="bg-slate-50/50 italic text-slate-400">
                              <td className="py-3 font-medium">--</td>
                              <td className="py-3">--</td>
                              <td className="py-3">SALDO INICIAL DEL PERIODO</td>
                              <td className="py-3 text-right font-mono">--</td>
                              <td className="py-3 text-right font-mono">--</td>
                              <td className="py-3 text-right font-mono font-bold text-slate-500">
                                ${trialBalance[selectedAccountForAuxiliar].initial.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}

                          {auxiliarMoves.map((move, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-3">{move.date}</td>
                              <td className="py-3">{formatFolio(move)}</td>
                              <td className="py-3 text-slate-500">{move.concept || 'Asiento contable'}</td>
                              <td className="py-3 text-right font-mono text-indigo-600">
                                {move.debit > 0 ? `$${move.debit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '$0.00'}
                              </td>
                              <td className="py-3 text-right font-mono text-emerald-600">
                                {move.credit > 0 ? `$${move.credit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '$0.00'}
                              </td>
                              <td className="py-3 text-right font-mono font-bold">
                                ${move.runningBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}

                          {auxiliarMoves.length > 0 && (
                            <tr className="bg-slate-50 font-black border-t-2 border-slate-900 text-slate-900">
                              <td className="py-3"></td>
                              <td className="py-3"></td>
                              <td className="py-3 text-right uppercase tracking-wider text-[10px] text-slate-400">Sumas Auxiliar:</td>
                              <td className="py-3 text-right font-mono">${auxiliarTotals.debits.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="py-3 text-right font-mono">${auxiliarTotals.credits.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="py-3 text-right font-mono">
                                ${(auxiliarMoves[auxiliarMoves.length - 1].runningBalance).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          )}

                          {auxiliarMoves.length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                                No se encontraron movimientos para esta cuenta en el periodo {period}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-bold text-center py-8">
                      Selecciona una cuenta para visualizar el desglose auxiliar de sus cargos y abonos.
                    </p>
                  )}
                </div>
              )}

              {/* REPORT VIEW C: ESTADO DE RESULTADOS (P&L) */}
              {reportSubTab === 'pyl' && (
                <div className="space-y-8 animate-fade-in">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-black uppercase text-slate-950">Estado de Resultados (P&L)</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consolidado del Periodo {period}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-4">
                      <h4 className="font-black text-sm text-emerald-600 border-b pb-2 flex justify-between uppercase">
                        Ingresos Acumulados
                        <span>${pylData.income.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </h4>
                      <div className="space-y-3">
                        {accounts
                          .filter(a => a.type === 'INCOME' && trialBalance[a.code]?.final > 0)
                          .map(acc => (
                            <div key={acc.code} className="flex justify-between text-xs font-bold text-slate-600">
                              <span>{acc.name}</span>
                              <span className="font-mono">${trialBalance[acc.code].final.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-black text-sm text-rose-600 border-b pb-2 flex justify-between uppercase">
                        Egresos / Gastos
                        <span>${pylData.expenses.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                      </h4>
                      <div className="space-y-3">
                        {accounts
                          .filter(a => a.type === 'EXPENSE' && trialBalance[a.code]?.final > 0)
                          .map(acc => (
                            <div key={acc.code} className="flex justify-between text-xs font-bold text-slate-600">
                              <span>{acc.name}</span>
                              <span className="font-mono">${trialBalance[acc.code].final.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-[2rem] p-6 text-white flex justify-between items-center shadow-xl">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Resultado Neto Operativo</span>
                      <h3 className="text-3xl font-black">${pylData.profit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Margen del Ejercicio</span>
                      <h4 className="text-xl font-bold">{pylData.income > 0 ? ((pylData.profit / pylData.income) * 100).toFixed(1) : 0}%</h4>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Account add/edit Modal */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in print:hidden">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col">
            <div className="bg-slate-50 p-6 flex justify-between items-center border-b">
              <h3 className="font-black text-lg flex items-center gap-2">
                <Book className="text-indigo-600" /> configurar Cuenta Contable
              </h3>
              <button 
                onClick={() => setIsAccountModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-8 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Código Cuenta</label>
                  <input 
                    type="text" 
                    placeholder="Ej. 102.01.002"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:border-indigo-500"
                    value={editingAccount.code}
                    onChange={e => setEditingAccount({...editingAccount, code: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Código SAT Agrupador</label>
                  <input 
                    type="text" 
                    placeholder="Ej. 102.01"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:border-indigo-500"
                    value={editingAccount.satGroupCode}
                    onChange={e => setEditingAccount({...editingAccount, satGroupCode: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nombre Cuenta</label>
                <input 
                  type="text" 
                  placeholder="Ej. Banorte Corriente"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:border-indigo-500"
                  value={editingAccount.name}
                  onChange={e => setEditingAccount({...editingAccount, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Clasificación</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-xs outline-none"
                    value={editingAccount.type}
                    onChange={e => setEditingAccount({...editingAccount, type: e.target.value as any})}
                  >
                    <option value="ASSET">ACTIVO</option>
                    <option value="LIABILITY">PASIVO</option>
                    <option value="EQUITY">CAPITAL</option>
                    <option value="INCOME">INGRESO</option>
                    <option value="EXPENSE">EGRESO / GASTO</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Naturaleza</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-xs outline-none"
                    value={editingAccount.nature}
                    onChange={e => setEditingAccount({...editingAccount, nature: e.target.value as any})}
                  >
                    <option value="DEBIT">DEUDORA (DEBIT)</option>
                    <option value="CREDIT">ACREEDORA (CREDIT)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    checked={editingAccount.isSubaccount}
                    onChange={e => setEditingAccount({...editingAccount, isSubaccount: e.target.checked})}
                  />
                  <span className="text-xs font-bold text-slate-600">Afectable (Subcuenta)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    checked={editingAccount.isActive}
                    onChange={e => setEditingAccount({...editingAccount, isActive: e.target.checked})}
                  />
                  <span className="text-xs font-bold text-slate-600">Activa para captura</span>
                </label>
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t flex justify-end gap-3">
              <button 
                onClick={() => setIsAccountModalOpen(false)}
                className="px-6 py-3 bg-white border rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveAccount}
                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md"
              >
                Guardar Cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Area styled like Mexican standard journal voucher */}
      {selectedPolicyForPrint && (
        <div className="printable-area hidden print:block w-full p-4 text-slate-800 font-sans">
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              .printable-area, .printable-area * {
                visibility: visible !important;
              }
              .printable-area {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
              }
              tr {
                page-break-inside: avoid !important;
              }
            }
          `}</style>
          
          {/* Header Box layout matching the target image */}
          <div className="border border-slate-400 flex items-stretch mb-4 text-xs">
            {/* Logo Cell */}
            <div className="w-[15%] p-2 flex items-center justify-center border-r border-slate-300 bg-white shrink-0">
              <img 
                src={parkingConfig?.logoUrl || plaza.logo} 
                alt="Logo" 
                className="max-h-12 max-w-full object-contain" 
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            {/* Main Header Area */}
            <div className="flex-1 flex flex-col">
              {/* Blue Header Band */}
              <div className="bg-[#a4c2f4] text-slate-900 px-3 py-1.5 flex justify-between items-center font-bold border-b border-slate-300">
                <div className="uppercase font-bold text-center flex-1 text-[11px]">
                  {(parkingConfig?.plazaName || plaza.name).toUpperCase()}
                </div>
                <div className="text-blue-900 text-xs tracking-[0.2em] font-extrabold uppercase shrink-0">
                  P ó l i z a
                </div>
              </div>

              {/* Content Band */}
              <div className="flex-1 flex items-stretch">
                {/* Concept */}
                <div className="flex-1 p-2 bg-[#f3f3f3] text-slate-800 font-bold uppercase text-[9px] flex items-center">
                  {selectedPolicyForPrint.concept}
                </div>

                {/* Policy Details (Folio & Date) */}
                <div className="w-[180px] border-l border-slate-300 bg-[#f3f3f3] flex flex-col divide-y divide-slate-300 text-[9px] shrink-0">
                  {/* Folio row */}
                  <div className="flex-1 flex items-center px-2 py-1">
                    <span className="font-bold text-slate-600 w-12 text-left text-[8px] uppercase">
                      {selectedPolicyForPrint.policyType === 'INGRESOS' ? 'Ig' : selectedPolicyForPrint.policyType === 'EGRESOS' ? 'Eg' : 'Di'}
                    </span>
                    <span className="font-bold text-slate-900 flex-1 text-right pr-2">
                      {selectedPolicyForPrint.folio}
                    </span>
                  </div>
                  {/* Date row */}
                  <div className="flex-1 flex items-center px-2 py-1">
                    <span className="font-bold text-slate-600 w-12 text-left">Fecha:</span>
                    <span className="font-bold text-slate-900 flex-1 text-right pr-2">
                      {formatPrintDate(selectedPolicyForPrint.date)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Table of items */}
          <table className="w-full border-collapse border border-slate-300 text-[10px] font-sans">
            <thead>
              <tr className="bg-[#a4c2f4] text-slate-900 border-b border-slate-300 font-bold">
                <th className="border-r border-slate-300 px-3 py-1.5 text-left w-[20%]">Cuenta</th>
                <th className="border-r border-slate-300 px-3 py-1.5 text-left w-[50%]">Nombre</th>
                <th className="border-r border-slate-300 px-3 py-1.5 text-right w-[15%]">Debe</th>
                <th className="px-3 py-1.5 text-right w-[15%]">Haber</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {selectedPolicyForPrint.lines.map((line, index) => (
                <React.Fragment key={index}>
                  {/* Line Amount Row */}
                  <tr className="text-slate-800 font-bold bg-white">
                    <td className="border-r border-slate-300 px-3 py-1.5 font-mono">
                      {line.accountCode}
                    </td>
                    <td className="border-r border-slate-300 px-3 py-1.5">
                      {line.accountName}
                    </td>
                    <td className="border-r border-slate-300 px-3 py-1.5 text-right font-mono">
                      {line.debit > 0 ? `$${line.debit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '$0.00'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {line.credit > 0 ? `$${line.credit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '$0.00'}
                    </td>
                  </tr>
                  {/* Line Concept Row */}
                  <tr className="text-slate-500 text-[9px] bg-white">
                    <td className="border-r border-slate-300 px-3 py-0.5"></td>
                    <td className="border-r border-slate-300 px-6 py-0.5 italic font-medium">
                      {line.concept || selectedPolicyForPrint.concept}
                    </td>
                    <td className="border-r border-slate-300 px-3 py-0.5"></td>
                    <td className="px-3 py-0.5"></td>
                  </tr>
                </React.Fragment>
              ))}

              {/* Totals Row */}
              <tr className="bg-slate-50 font-black border-t border-slate-300 text-slate-950">
                <td className="border-r border-slate-300 px-3 py-2"></td>
                <td className="border-r border-slate-300 px-3 py-2 text-right uppercase tracking-wider">Total:</td>
                <td className="border-r border-slate-300 px-3 py-2 text-right font-mono">
                  ${selectedPolicyForPrint.totalDebit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  ${selectedPolicyForPrint.totalCredit.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* CFDI Preview Modal */}
      {previewingCfdi && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-2xl overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block mb-1">Visualizador de Comprobante</span>
                <h3 className="text-lg font-black uppercase tracking-tight">Factura Digital (CFDI)</h3>
              </div>
              <button 
                onClick={() => setPreviewingCfdi(null)}
                className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Invoice Body */}
            <div className="p-8 space-y-6">
              {/* UUID Banner */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Folio Fiscal (UUID)</span>
                <span className="text-xs font-mono font-bold text-slate-800 break-all select-all">{previewingCfdi.uuid}</span>
              </div>

              {/* Issuer & Receiver Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Issuer */}
                <div className="space-y-3">
                  <div className="border-b pb-2">
                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Emisor</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-800 uppercase">{previewingCfdi.nameIssuer}</p>
                    <p className="text-[10px] font-bold text-slate-400">RFC: <span className="font-mono text-slate-600 font-extrabold">{previewingCfdi.rfcIssuer}</span></p>
                  </div>
                </div>

                {/* Receiver */}
                <div className="space-y-3">
                  <div className="border-b pb-2">
                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Receptor</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-slate-800 uppercase">{plaza.name}</p>
                    <p className="text-[10px] font-bold text-slate-400">RFC: <span className="font-mono text-slate-600 font-extrabold">{previewingCfdi.rfcReceiver || 'N/A'}</span></p>
                  </div>
                </div>
              </div>

              {/* More info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Fecha de Emisión</span>
                  <span className="text-xs font-bold text-slate-700">{formatPrintDate(previewingCfdi.date)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Total de la Factura</span>
                  <span className="text-sm font-mono font-black text-slate-900">${previewingCfdi.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
              </div>

              {/* Items representation */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-600 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Concepto</th>
                      <th className="p-3 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3 text-slate-700 font-medium">Adquisición de bienes / prestación de servicios amparados por XML</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">${previewingCfdi.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
              {previewingCfdi.xmlUrl && (
                <a 
                  href={previewingCfdi.xmlUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="px-6 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all"
                >
                  <Download size={14} /> Descargar XML Original
                </a>
              )}
              <button 
                onClick={() => setPreviewingCfdi(null)}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
