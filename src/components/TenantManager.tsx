
import React, { useState, useMemo, useRef } from 'react';
import { 
    Plus, Building, Search, Filter, History, 
    ArrowLeft, ExternalLink, DollarSign, Calendar,
    FileText, User, Mail, MapPin, Trash2, Edit2,
    CheckCircle, AlertCircle, XCircle, ChevronRight,
    ArrowUpRight, Database, Loader2, Save, X,
    Phone, Clock, Info, Shield, Layers, Layout,
    TrendingUp, AlertTriangle, Check, Users, MessageCircle, Eye, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tenant, Transaction, UserRole, User as AppUser } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { calculateTenantDebt, getTenantTransactions, DebtSummary } from '../utils/tenantLogic';
import { getLocalDateString } from '../utils/parkingLogic';
import { useToast } from './ui/ServeToast';
import { DocumentPreviewButton } from './ui/DocumentPreview';
import { useStore } from '../store/useStore';
import { plaza } from '../config/plaza';

interface TenantManagerProps {
    tenants: Tenant[];
    transactions: Transaction[];
    onUpdate: () => void | Promise<void>;
}

export const TenantManager: React.FC<TenantManagerProps> = ({ tenants, transactions, onUpdate }) => {
    const { toast } = useToast();
    const storeSet = useStore.setState;
    const [view, setView] = useState<'list' | 'detail' | 'form'>('list');
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const [editingTenant, setEditingTenant] = useState<Partial<Tenant>>({});
    const [filterType, setFilterType] = useState<'LOCAL' | 'OFICINA' | 'DEPORTIVO' | 'ALL'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingContract, setIsUploadingContract] = useState(false);
    const contractInputRef = useRef<HTMLInputElement>(null);
    const [isUploadingPlan, setIsUploadingPlan] = useState(false);
    const planInputRef = useRef<HTMLInputElement>(null);
    const [showPassword, setShowPassword] = useState(false);

    // Payments / Debts state
    const [showPayModal, setShowPayModal] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [showDebtModal, setShowDebtModal] = useState(false);
    const [paymentForm, setPaymentForm] = useState({
        amount: 0,
        date: getLocalDateString(),
        description: '',
        method: 'CASH' as any,
        type: 'RENT' as any
    });
    const [debtForm, setDebtForm] = useState({
        amount: 0,
        date: getLocalDateString(),
        description: '',
        mode: 'manual' as 'manual' | 'calculated',
        sinceMonth: new Date().toISOString().substring(0, 7)
    });

    const stats = useMemo(() => {
        const active = tenants.filter(t => t.status !== 'vacant');
        const late = tenants.filter(t => {
            const d = calculateTenantDebt(t, transactions);
            return d.status === 'late';
        });
        const totalDebt = tenants.reduce((sum, t) => sum + calculateTenantDebt(t, transactions).totalDebt, 0);
        const occupancy = tenants.length > 0 ? (active.length / tenants.length) * 100 : 0;

        return {
            total: tenants.length,
            active: active.length,
            late: late.length,
            totalDebt,
            occupancy: Math.round(occupancy)
        };
    }, [tenants, transactions]);

    const filteredTenants = useMemo(() => {
        return tenants.filter(t => {
            const matchesType = filterType === 'ALL' || t.tenantType === filterType;
            const matchesSearch = t.businessName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                 (t.localNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 (t.name || '').toLowerCase().includes(searchQuery.toLowerCase());
            return matchesType && matchesSearch;
        }).sort((a, b) => {
            // Sort by status (Late first) then by local number
            const debtA = calculateTenantDebt(a, transactions);
            const debtB = calculateTenantDebt(b, transactions);
            if (debtA.status === 'late' && debtB.status !== 'late') return -1;
            if (debtA.status !== 'late' && debtB.status === 'late') return 1;
            return (a.localNumber || '').localeCompare(b.localNumber || '');
        });
    }, [tenants, filterType, searchQuery, transactions]);

    const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingContract(true);
        try {
            const url = await dataService.uploadFile(file);
            if (url) {
                setEditingTenant(prev => ({ ...prev, contractUrl: url }));
                toast("Contrato subido correctamente", "success");
            } else {
                toast("Error al subir el archivo", "error");
            }
        } catch (error) {
            console.error("Error uploading contract:", error);
            toast("Ocurrió un error al subir el archivo", "error");
        } finally {
            setIsUploadingContract(false);
        }
    };

    const handlePlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingPlan(true);
        try {
            const url = await dataService.uploadFile(file);
            if (url) {
                setEditingTenant(prev => ({ ...prev, rentedPlanUrl: url }));
                toast("Plano arrendado subido correctamente", "success");
            } else {
                toast("Error al subir el archivo", "error");
            }
        } catch (error) {
            console.error("Error uploading plan:", error);
            toast("Ocurrió un error al subir el plano", "error");
        } finally {
            setIsUploadingPlan(false);
        }
    };

    const handleSaveTenant = async () => {
        if (!editingTenant.businessName || !editingTenant.localNumber) {
            return toast("Nombre y número de local son requeridos", "error");
        }
        if (!editingTenant.systemUser?.trim() || (!editingTenant.id && !editingTenant.systemPassword?.trim())) {
            return toast("Usuario y contraseña de acceso son requeridos", "error");
        }
        setIsSaving(true);
        try {
            const id = editingTenant.id || `ten-${Date.now()}`;
            
            // --- Sync Tenant credentials with User collection ---
            const systemUser = editingTenant.systemUser?.trim();
            const systemPassword = editingTenant.systemPassword?.trim();

            const allUsers: AppUser[] = await dataService.getRecords(TABLES.USERS);
            
            if (systemUser) {
                // Check if username is already taken by another user who is NOT linked to this tenant
                const usernameConflict = allUsers.find(u => 
                    u.username.toLowerCase() === systemUser.toLowerCase() && 
                    u.tenantId !== id
                );
                if (usernameConflict) {
                    setIsSaving(false);
                    return toast(`El usuario de sistema "${systemUser}" ya está en uso por otro colaborador o inquilino`, "error");
                }
            }

            // Find existing user linked to this tenant
            let associatedUser = allUsers.find(u => u.tenantId === id);

            if (systemUser) {
                const userPayload: AppUser = {
                    id: associatedUser?.id || `user-tenant-${id}`,
                    username: systemUser,
                    password: systemPassword || undefined,
                    role: UserRole.TENANT,
                    tenantId: id,
                    name: editingTenant.businessName || editingTenant.name || systemUser,
                    active: true,
                    permissions: associatedUser?.permissions || []
                };
                await dataService.upsertRecord(TABLES.USERS, userPayload);
            } else if (associatedUser) {
                // If credentials were cleared, deactivate the user
                const disabledUser = { ...associatedUser, active: false };
                await dataService.upsertRecord(TABLES.USERS, disabledUser);
            }

            await dataService.upsertRecord(TABLES.TENANTS, { ...editingTenant, id, status: editingTenant.status || 'active' } as Tenant);
            onUpdate();
            if (selectedTenant) {
                // Refresh selected tenant
                const updated = (await dataService.getRecords(TABLES.TENANTS)).find((t: any) => t.id === id);
                setSelectedTenant(updated);
            }
            setView(selectedTenant ? 'detail' : 'list');
            toast("Inquilino guardado correctamente", "success");
        } catch (e) {
            console.error("Error saving tenant/user sync:", e);
            toast("Error al guardar inquilino", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTenant = async (id: string) => {
        if (!window.confirm("¿Seguro de eliminar este inquilino permanentemente? Se perderá el historial vinculado.")) return;
        try {
            // Deactivate associated users in USERS collection
            const allUsers: AppUser[] = await dataService.getRecords(TABLES.USERS);
            const associatedUsers = allUsers.filter(u => u.tenantId === id);
            for (const user of associatedUsers) {
                await dataService.upsertRecord(TABLES.USERS, { ...user, active: false });
            }

            await dataService.deleteRecord(TABLES.TENANTS, id);
            onUpdate();
            setView('list');
            toast("Inquilino eliminado", "success");
        } catch (e) {
            toast("Error al eliminar", "error");
        }
    };

    const handleRecordPayment = async () => {
        if (!selectedTenant || !paymentForm.amount || !paymentForm.description) return;
        setIsSaving(true);
        try {
            const tx: Transaction = editingTransaction ? {
                ...editingTransaction,
                amount: Number(paymentForm.amount),
                date: paymentForm.date,
                description: paymentForm.description,
                paymentMethod: paymentForm.method,
                updated_at: new Date().toISOString()
            } : {
                id: `tx-${Date.now()}`,
                type: paymentForm.type,
                amount: Number(paymentForm.amount),
                date: paymentForm.date,
                description: paymentForm.description,
                status: 'completed',
                paymentMethod: paymentForm.method,
                tenantId: selectedTenant.id,
                tenantBusinessName: selectedTenant.businessName,
                created_at: new Date().toISOString()
            };
            
            await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            
            // OPTIMISTIC UPDATE: Immediately update the transaction in the store
            const currentTxs = useStore.getState().transactions;
            const updatedTxs = editingTransaction 
                ? currentTxs.map(t => t.id === tx.id ? tx : t)
                : [...currentTxs, tx];
            
            storeSet({ transactions: updatedTxs });
            
            // Recalculate debt AFTER recording the payment to check if fully paid
            const newDebt = calculateTenantDebt(selectedTenant, updatedTxs);
            
            // Only advance the baseline date if the tenant is now fully paid (debt = 0)
            if (newDebt.totalDebt <= 0 && (paymentForm.type === 'RENT' || (editingTransaction && editingTransaction.type === 'RENT'))) {
                const updatedTenant = { ...selectedTenant, lastPaymentDate: paymentForm.date };
                await dataService.upsertRecord(TABLES.TENANTS, updatedTenant);
                setSelectedTenant(updatedTenant);
            }
            
            setShowPayModal(false);
            setEditingTransaction(null);
            toast(editingTransaction ? "Movimiento actualizado" : "Pago registrado correctamente", "success");
            onUpdate();
        } catch (e) {
            toast("Error al procesar movimiento", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleRecordDebt = async () => {
        if (!selectedTenant) return;
        let amount = Number(debtForm.amount);
        let desc = debtForm.description;

        if (debtForm.mode === 'calculated') {
            const debt = calculateTenantDebt(selectedTenant, transactions);
            amount = debt.totalDebt;
            desc = `Adeudo calculado desde ${debtForm.sinceMonth}`;
        }

        if (!amount || !desc) return toast("Monto y descripción requeridos", "error");

        setIsSaving(true);
        try {
            const tx: Transaction = {
                id: `debt-${Date.now()}`,
                type: 'DEBT',
                amount: amount,
                date: debtForm.date,
                description: `${desc} - ${selectedTenant.businessName}`,
                status: 'completed',
                paymentMethod: 'CASH',
                subtype: 'ADJUSTMENT',
                tenantId: selectedTenant.id,
                tenantBusinessName: selectedTenant.businessName,
                created_at: new Date().toISOString()
            };
            await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            
            // OPTIMISTIC UPDATE: Immediately add the debt to the store
            const currentTxs = useStore.getState().transactions;
            storeSet({ transactions: [...currentTxs, tx] });
            
            setShowDebtModal(false);
            toast("Adeudo registrado correctamente", "success");
            // Background sync
            onUpdate();
        } catch (e) {
            toast("Error al registrar adeudo", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTransaction = async (id: string) => {
        if (!window.confirm("¿Estás seguro de eliminar este movimiento? Esto afectará el saldo del inquilino.")) return;
        try {
            await dataService.deleteRecord(TABLES.TRANSACTIONS, id);
            
            // OPTIMISTIC UPDATE: Immediately remove from store
            const currentTxs = useStore.getState().transactions;
            const updatedTxs = currentTxs.filter(t => t.id !== id);
            storeSet({ transactions: updatedTxs });
            
            toast("Movimiento eliminado", "success");
            onUpdate();
        } catch (e) {
            toast("Error al eliminar", "error");
        }
    };

    // --- RENDER VIEWS ---

    if (view === 'detail' && selectedTenant) {
        const debt = calculateTenantDebt(selectedTenant, transactions);
        const tenantTxs = getTenantTransactions(selectedTenant, transactions).sort((a, b) => b.date.localeCompare(a.date));

        return (
            <div className="space-y-8 animate-fade-in pb-20">
                <div className="flex justify-between items-center">
                    <button 
                        onClick={() => setView('list')}
                        className="flex items-center gap-2 text-slate-400 hover:text-slate-800 font-black uppercase text-[10px] tracking-widest transition-colors"
                    >
                        <ArrowLeft size={16} /> Volver a Inquilinos
                    </button>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { setEditingTenant(selectedTenant); setView('form'); }}
                            className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                            <Edit2 size={14} /> Editar Perfil
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Left Column: Profile & Stats */}
                    <div className="xl:col-span-2 space-y-8">
                        {/* Hero Card */}
                        <div className="bg-white p-10 md:p-12 rounded-[3.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50 rounded-full -mr-40 -mt-40 z-0 opacity-40" />
                            
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
                                <div className="space-y-6 flex-1">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="bg-blue-600 text-white px-5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                                            <Layout size={14} />
                                            {selectedTenant.tenantType || 'LOCAL'} Local {selectedTenant.localNumber}
                                        </div>
                                        <span className={`px-5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border shadow-sm ${
                                            selectedTenant.status === 'vacant' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                            debt.status === 'late' ? 'bg-red-50 text-red-600 border-red-200' :
                                            debt.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                            'bg-emerald-50 text-emerald-600 border-emerald-200'
                                        }`}>
                                            {selectedTenant.status === 'vacant' ? 'Vacante' : 
                                             debt.status === 'late' ? 'Mora' : 
                                             debt.status === 'pending' ? 'Pendiente' : 'Al Corriente'}
                                        </span>
                                    </div>
                                    
                                    <div>
                                        <h2 className="text-6xl font-black text-slate-900 tracking-tighter uppercase leading-[0.9] mb-4">{selectedTenant.businessName}</h2>
                                        <p className="text-slate-400 font-bold text-lg uppercase tracking-tight flex items-center gap-2">
                                            <User size={18} className="text-blue-500" /> {selectedTenant.name || 'Sin responsable asignado'}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm border border-slate-100">
                                                <Mail size={18} />
                                            </div>
                                            <div className="truncate">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Email de contacto</p>
                                                <p className="text-sm font-black text-slate-700 truncate">{selectedTenant.email || 'N/A'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm border border-slate-100">
                                                <Phone size={18} />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">WhatsApp / Tel</p>
                                                <p className="text-sm font-black text-slate-700">{selectedTenant.lesseePhone || 'No registrado'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="w-full md:w-auto">
                                    {selectedTenant.contractUrl ? (
                                        <DocumentPreviewButton
                                            url={selectedTenant.contractUrl}
                                            className="w-full md:w-48 h-48 bg-slate-900 text-white rounded-[2.5rem] flex flex-col items-center justify-center gap-4 hover:bg-blue-600 transition-all shadow-2xl group border border-slate-800"
                                            label={
                                                <>
                                                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <FileText size={32} />
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Ver Contrato</span>
                                                </>
                                            }
                                        />
                                    ) : (
                                        <div className="w-full md:w-48 h-48 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-slate-300">
                                            <FileText size={32} />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-center px-4">Sin Contrato Digital</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Financial Breakdown Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Renta Mensual</p>
                                <span className="text-3xl font-black text-slate-800">${Number(selectedTenant.rentAmount || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Mantenimiento</p>
                                <span className="text-3xl font-black text-slate-800">${Number(selectedTenant.maintenanceFee || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4">Día de Pago</p>
                                <span className="text-3xl font-black text-slate-800">Día {selectedTenant.paymentDay || 10}</span>
                            </div>
                            {(selectedTenant.waterFee || 0) > 0 && (
                                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Agua</p>
                                    <span className="text-3xl font-black text-slate-800">${Number(selectedTenant.waterFee || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                                </div>
                            )}
                            {(selectedTenant.serviceFee || 0) > 0 && (
                                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Terraza</p>
                                    <span className="text-3xl font-black text-slate-800">${Number(selectedTenant.serviceFee || 0).toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                                </div>
                            )}
                        </div>

                        {/* Extra Details */}
                        <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                            <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -mb-32 -mr-32" />
                            <h4 className="text-lg font-black uppercase tracking-widest mb-8 flex items-center gap-3">
                                <Info size={20} className="text-blue-400" /> Especificaciones del Inmueble
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Dimensiones</p>
                                    <p className="text-xl font-black text-white">{selectedTenant.dimensions || 'No especificadas'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Ubicación</p>
                                    <p className="text-xl font-black text-white">{selectedTenant.location || 'Local ' + selectedTenant.localNumber}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Periodo de Contrato</p>
                                    <p className="text-xl font-black text-white">{selectedTenant.leasePeriod || 'Por definir'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Detalles del Contrato y Arrendatario */}
                        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-8">
                            <h4 className="text-lg font-black uppercase tracking-widest text-slate-800 flex items-center gap-3">
                                <FileText size={20} className="text-blue-500" /> Detalles del Contrato y Arrendatario
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 text-sm">
                                {selectedTenant.contractSignerName && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Firmante del Contrato</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.contractSignerName}</p>
                                    </div>
                                )}
                                {selectedTenant.contractType && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Tipo de Contrato</p>
                                        <p className="font-bold text-slate-700 capitalize">{selectedTenant.contractType}</p>
                                    </div>
                                )}
                                {selectedTenant.contractSignDate && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha de Firma</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.contractSignDate}</p>
                                    </div>
                                )}
                                {selectedTenant.contractStartDate && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha de Inicio</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.contractStartDate}</p>
                                    </div>
                                )}
                                {selectedTenant.contractEndDate && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Fecha de Terminación</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.contractEndDate}</p>
                                    </div>
                                )}
                                {selectedTenant.depositAmount !== undefined && selectedTenant.depositAmount > 0 && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Depósito en Garantía</p>
                                        <p className="font-bold text-slate-700">${selectedTenant.depositAmount.toLocaleString()}</p>
                                    </div>
                                )}
                                {selectedTenant.rentedM2 !== undefined && selectedTenant.rentedM2 > 0 && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">M2 Arrendados</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.rentedM2} m²</p>
                                    </div>
                                )}
                                {selectedTenant.m2Value !== undefined && selectedTenant.m2Value > 0 && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Valor del M2</p>
                                        <p className="font-bold text-slate-700">${selectedTenant.m2Value.toLocaleString()}</p>
                                    </div>
                                )}
                                {selectedTenant.rfc && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">RFC</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.rfc}</p>
                                    </div>
                                )}
                                {selectedTenant.ineVoterKey && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Clave de Elector (INE)</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.ineVoterKey}</p>
                                    </div>
                                )}
                                {selectedTenant.electricServiceNumber && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">No. Servicio Eléctrico</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.electricServiceNumber}</p>
                                    </div>
                                )}
                                {selectedTenant.cellPhone && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Teléfono Celular</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.cellPhone}</p>
                                    </div>
                                )}
                                {selectedTenant.lesseeAddress && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Domicilio de Arrendatario</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.lesseeAddress}</p>
                                    </div>
                                )}
                                {selectedTenant.contractObject && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Objeto del Contrato</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.contractObject}</p>
                                    </div>
                                )}
                                {selectedTenant.parkingServiceDetails && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Servicios de Estacionamiento</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.parkingServiceDetails}</p>
                                    </div>
                                )}
                                {selectedTenant.advertisingServiceDetails && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Servicios de Publicidad</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.advertisingServiceDetails}</p>
                                    </div>
                                )}
                                {selectedTenant.billingDetails && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Datos de Facturación</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.billingDetails}</p>
                                    </div>
                                )}
                                {selectedTenant.remissionNotes && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Notas de Remisión / Proyecto</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.remissionNotes}</p>
                                    </div>
                                )}
                                {selectedTenant.otherData && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3 md:col-span-2">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Otros Datos</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.otherData}</p>
                                    </div>
                                )}
                                {selectedTenant.systemUser && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Usuario de Sistema</p>
                                        <p className="font-bold text-slate-700">{selectedTenant.systemUser}</p>
                                    </div>
                                )}
                                {selectedTenant.systemPassword && (
                                    <div className="space-y-1 border-b border-slate-100 pb-3">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Contraseña de Sistema</p>
                                        <p className="font-bold text-slate-700 font-mono">
                                            {showPassword ? selectedTenant.systemPassword : '••••••••'}
                                            <button 
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="ml-2 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Plano link inside detail view */}
                            {selectedTenant.rentedPlanUrl && (
                                <div className="pt-4 flex">
                                    <a 
                                        href={selectedTenant.rentedPlanUrl} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-700 rounded-2xl font-black text-xs uppercase hover:bg-blue-100 transition-colors"
                                    >
                                        <ExternalLink size={16} /> Ver Plano Arrendado
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Account Status & Quick Actions */}
                    <div className="space-y-8">
                        <div className={`p-10 rounded-[2rem] border shadow-sm ${
                            debt.status === 'late' ? 'bg-red-50 border-red-200' :
                            debt.status === 'pending' ? 'bg-amber-50 border-amber-200' :
                            'bg-emerald-50 border-emerald-200'
                        }`}>
                            <h4 className={`text-2xl font-black uppercase tracking-tighter mb-6 ${
                                debt.status === 'late' ? 'text-red-600' :
                                debt.status === 'pending' ? 'text-amber-600' :
                                'text-emerald-600'
                            }`}>
                                {debt.status === 'late' ? 'EN MORA' : debt.status === 'pending' ? 'PENDIENTE' : 'AL CORRIENTE'}
                            </h4>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rentas ({debt.monthsOverdue} M):</span>
                                    <span className="text-sm font-black text-slate-800">${debt.rentDebt.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Adeudos Manuales:</span>
                                    <span className={`text-sm font-black ${debt.explicitDebt > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                                        {debt.explicitDebt > 0 ? '+' : ''}${debt.explicitDebt.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                    </span>
                                </div>
                                {debt.paymentsSinceBaseline > 0 && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pagos Aplicados:</span>
                                        <span className="text-sm font-black text-emerald-600">
                                            -${debt.paymentsSinceBaseline.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-slate-200 pt-4 mb-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Saldo Total:</span>
                                    <span className={`text-xl font-black ${debt.totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        ${debt.totalDebt.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                                    </span>
                                </div>
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">
                                * Calculado desde: {debt.baselineDate}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <button 
                                onClick={() => {
                                    setEditingTransaction(null);
                                    setPaymentForm({
                                        amount: debt.totalDebt > 0 ? debt.totalDebt : (debt.monthlyFee || 0),
                                        date: getLocalDateString(),
                                        description: `Pago Renta ${selectedTenant.businessName}`,
                                        method: 'CASH',
                                        type: 'RENT'
                                    });
                                    setShowPayModal(true);
                                }}
                                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
                            >
                                <DollarSign size={18} /> Registrar Pago
                            </button>
                            <button 
                                onClick={() => setShowDebtModal(true)}
                                className="w-full py-4 bg-white text-slate-500 hover:text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all border border-slate-200 hover:border-red-200 flex items-center justify-center gap-2"
                            >
                                <Plus size={14} /> Ajustar Adeudo
                            </button>
                            {selectedTenant.lesseePhone && (
                                <button 
                                    onClick={() => {
                                        const message = `Estimado(a) ${selectedTenant.name || selectedTenant.businessName}, le informamos que tiene un adeudo de $${debt.totalDebt.toLocaleString()} en ${plaza.name} a la fecha.\n\nServicios:\n• Renta: $${(selectedTenant.rentAmount || 0).toLocaleString()}\n• Manto: $${(selectedTenant.maintenanceFee || 0).toLocaleString()}\n• Meses pendientes: ${debt.monthsOverdue}\n\nLe invitamos a ponerse al corriente. ¡Gracias!`;
                                        window.open(`https://wa.me/52${selectedTenant.lesseePhone}?text=${encodeURIComponent(message)}`, '_blank');
                                    }}
                                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center justify-center gap-3"
                                >
                                    <MessageCircle size={16} /> Notificar por WhatsApp
                                </button>
                            )}
                        </div>
                    </div>


                    {/* History Section */}
                    <div className="xl:col-span-3 bg-white p-12 rounded-[4rem] border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-12">
                            <div>
                                <h4 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2">Historial de Movimientos</h4>
                                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Auditoría completa de rentas y adeudos</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                                    <History size={14} /> {tenantTxs.length} Registros
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b-2 border-slate-50">
                                    <tr>
                                        <th className="pb-8 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Fecha</th>
                                        <th className="pb-8 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Descripción</th>
                                        <th className="pb-8 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Tipo</th>
                                        <th className="pb-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Monto</th>
                                        <th className="pb-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {tenantTxs.map(tx => (
                                        <tr key={tx.id} className="hover:bg-slate-50/50 transition-all group">
                                            <td className="py-7 px-4">
                                                <span className="text-sm font-black text-slate-500">{tx.date}</span>
                                            </td>
                                            <td className="py-7 px-4 font-black text-slate-800 text-lg tracking-tight uppercase">{tx.description}</td>
                                            <td className="py-7 px-4">
                                                <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                                                    tx.type === 'RENT' || tx.type === 'INCOME' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                    tx.type === 'DEBT' ? 'bg-red-50 text-red-700 border-red-100' :
                                                    'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}>
                                                    {tx.type === 'DEBT' ? 'Adeudo' : tx.type === 'RENT' ? 'Pago Renta' : tx.type}
                                                </span>
                                            </td>
                                            <td className={`py-7 px-4 text-right font-black text-2xl ${tx.type === 'DEBT' ? 'text-red-500' : 'text-emerald-600'}`}>
                                                {tx.type === 'DEBT' ? '-' : '+'}${tx.amount?.toLocaleString()}
                                            </td>
                                            <td className="py-7 px-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => {
                                                            setEditingTransaction(tx);
                                                            setPaymentForm({
                                                                amount: tx.amount,
                                                                date: tx.date,
                                                                description: tx.description,
                                                                method: tx.paymentMethod as any || 'CASH',
                                                                type: tx.type as any
                                                            });
                                                            setShowPayModal(true);
                                                        }}
                                                        className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                        title="Editar"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteTransaction(tx.id)}
                                                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {tenantTxs.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-32 text-center">
                                                <div className="flex flex-col items-center gap-4 text-slate-300">
                                                    <Database size={48} strokeWidth={1} />
                                                    <p className="text-sm font-black uppercase tracking-widest">Sin historial de movimientos</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Modal: Registrar Pago */}
                <AnimatePresence>
                    {showPayModal && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => { setShowPayModal(false); setEditingTransaction(null); }}
                                className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-3xl p-10 shadow-2xl w-full max-w-lg relative z-10"
                            >
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-8">
                                    {editingTransaction ? 'Editar Movimiento' : 'Registrar Pago'}
                                </h3>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</label>
                                        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4">
                                            <span className="text-slate-400 font-black text-lg mr-2">$</span>
                                            <input 
                                                type="number" 
                                                className="w-full bg-transparent py-4 font-black text-xl text-slate-800 outline-none"
                                                value={paymentForm.amount}
                                                onChange={e => setPaymentForm({...paymentForm, amount: Number(e.target.value)})}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                                        <input 
                                            type="date" 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all"
                                            value={paymentForm.date}
                                            onChange={e => setPaymentForm({...paymentForm, date: e.target.value})}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</label>
                                        <input 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all"
                                            placeholder="Pago Renta SALUDABLE"
                                            value={paymentForm.description}
                                            onChange={e => setPaymentForm({...paymentForm, description: e.target.value})}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</label>
                                        <select 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all appearance-none"
                                            value={paymentForm.method}
                                            onChange={e => setPaymentForm({...paymentForm, method: e.target.value as any})}
                                        >
                                            <option value="CASH">Efectivo</option>
                                            <option value="TRANSFER">Transferencia</option>
                                            <option value="CARD">Tarjeta (TDB/TDC)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="mt-10 flex gap-4">
                                    <button 
                                        onClick={() => { setShowPayModal(false); setEditingTransaction(null); }}
                                        className="flex-1 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={handleRecordPayment}
                                        disabled={isSaving}
                                        className="flex-[2] py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : editingTransaction ? <Save size={16} /> : <CheckCircle size={16} />}
                                        {editingTransaction ? 'Guardar Cambios' : 'Registrar Pago'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>


                {/* Modal: Registrar Adeudo */}
                <AnimatePresence>
                    {showDebtModal && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setShowDebtModal(false)}
                                className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
                            />
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-3xl p-10 shadow-2xl w-full max-w-lg relative z-10"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                                        <AlertCircle size={22} className="text-slate-400" /> Registrar Adeudo
                                    </h3>
                                    <button onClick={() => setShowDebtModal(false)} className="text-slate-400 hover:text-slate-600 transition-all">
                                        <X size={22} />
                                    </button>
                                </div>

                                {/* Tabs */}
                                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-8">
                                    <button 
                                        onClick={() => setDebtForm({...debtForm, mode: 'manual'})}
                                        className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${debtForm.mode === 'manual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        Monto Manual
                                    </button>
                                    <button 
                                        onClick={() => setDebtForm({...debtForm, mode: 'calculated'})}
                                        className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${debtForm.mode === 'calculated' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
                                    >
                                        Cálculo por fecha
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    {debtForm.mode === 'manual' ? (
                                        <>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto Adeudado</label>
                                                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4">
                                                    <span className="text-slate-400 font-black text-lg mr-2">$</span>
                                                    <input 
                                                        type="number" 
                                                        className="w-full bg-transparent py-4 font-black text-xl text-slate-800 outline-none"
                                                        value={debtForm.amount}
                                                        onChange={e => setDebtForm({...debtForm, amount: Number(e.target.value)})}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Concepto</label>
                                                <input 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all"
                                                    placeholder="Adeudo:"
                                                    value={debtForm.description}
                                                    onChange={e => setDebtForm({...debtForm, description: e.target.value})}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Registro</label>
                                                <input 
                                                    type="date" 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all"
                                                    value={debtForm.date}
                                                    onChange={e => setDebtForm({...debtForm, date: e.target.value})}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-6 p-6 bg-amber-50 rounded-2xl border border-amber-100">
                                            <p className="text-xs text-amber-700 font-black uppercase tracking-widest">Sincronizar adeudo desde:</p>
                                            <input 
                                                type="month" 
                                                className="bg-transparent border-none text-3xl font-black text-amber-800 outline-none text-center w-full"
                                                value={debtForm.sinceMonth}
                                                onChange={e => setDebtForm({...debtForm, sinceMonth: e.target.value})}
                                            />
                                            <div className="p-3 bg-white/60 rounded-xl flex items-center gap-3">
                                                <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                                                <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                                                    Genera un movimiento ADEUDO por el monto proyectado desde el mes seleccionado.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-slate-100">
                                    <button 
                                        onClick={() => setShowDebtModal(false)}
                                        className="px-8 py-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition-all"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={handleRecordDebt}
                                        disabled={isSaving}
                                        className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                                    >
                                        {isSaving ? <Loader2 className="animate-spin" size={16} /> : null} Guardar Adeudo
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </div>
        );
    }

    if (view === 'form') {
        return (
            <div className="max-w-5xl mx-auto animate-fade-in space-y-12 pb-20">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-b border-slate-100 pb-10">
                    <div>
                        <button 
                            onClick={() => setView(selectedTenant ? 'detail' : 'list')}
                            className="flex items-center gap-2 text-slate-400 hover:text-slate-800 font-black uppercase text-[10px] transition-colors mb-6 tracking-[0.2em]"
                        >
                            <ArrowLeft size={16} /> Cancelar edición
                        </button>
                        <h3 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">
                            {editingTenant.id ? 'Modificar' : 'Alta de'} <span className="text-blue-600">Inquilino</span>
                        </h3>
                    </div>
                    <div className="flex gap-4 w-full md:w-auto">
                        <button 
                            onClick={handleSaveTenant}
                            disabled={isSaving}
                            className="flex-1 md:flex-none bg-slate-900 hover:bg-blue-600 text-white px-12 py-5 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-2xl shadow-slate-200"
                        >
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Guardar Cambios
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                    {/* Column 1: Identity, Location, Fiscal */}
                    <div className="space-y-10">
                        {/* Datos de la Unidad */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                                    <Building size={12} />
                                </div>
                                Datos de la Unidad
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="col-span-1 space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4"># Local *</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-lg text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="12"
                                            value={editingTenant.localNumber || ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const updates: Partial<Tenant> = { localNumber: val };
                                                if (!editingTenant.id) {
                                                    const cleanNum = val.replace(/\s+/g, '').toLowerCase();
                                                    if (cleanNum) {
                                                        if (!editingTenant.systemUser) {
                                                            updates.systemUser = `local${cleanNum}`;
                                                        }
                                                        if (!editingTenant.systemPassword) {
                                                            updates.systemPassword = ''; // Set a unique password explicitly.
                                                        }
                                                    }
                                                }
                                                setEditingTenant(prev => ({ ...prev, ...updates }));
                                            }}
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Tipo de Propiedad</label>
                                        <select 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner appearance-none"
                                            value={editingTenant.tenantType || 'LOCAL'}
                                            onChange={e => setEditingTenant({...editingTenant, tenantType: e.target.value as any})}
                                        >
                                            <option value="LOCAL">Local Comercial</option>
                                            <option value="OFICINA">Oficina Corporativa</option>
                                            <option value="DEPORTIVO">Instalación Deportiva</option>
                                        </select>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre Comercial / Negocio</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-5 font-black text-xl text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                        placeholder="Ej. Barbería El Elegante"
                                        value={editingTenant.businessName || ''}
                                        onChange={e => setEditingTenant({...editingTenant, businessName: e.target.value})}
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-2 col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Dimensiones (Texto)</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="Ej. 5x9 m"
                                            value={editingTenant.dimensions || ''}
                                            onChange={e => setEditingTenant({...editingTenant, dimensions: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">M2 Arrendados</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="45"
                                            value={editingTenant.rentedM2 || ''}
                                            onChange={e => setEditingTenant({...editingTenant, rentedM2: e.target.value ? Number(e.target.value) : undefined})}
                                        />
                                    </div>
                                    <div className="space-y-2 col-span-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Valor del M2 ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="150"
                                            value={editingTenant.m2Value || ''}
                                            onChange={e => setEditingTenant({...editingTenant, m2Value: e.target.value ? Number(e.target.value) : undefined})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Ubicación exacta</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="Ej. Planta Alta - Ala Norte"
                                            value={editingTenant.location || ''}
                                            onChange={e => setEditingTenant({...editingTenant, location: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Estado del Local</label>
                                        <select 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner appearance-none"
                                            value={editingTenant.status || 'active'}
                                            onChange={e => setEditingTenant({...editingTenant, status: e.target.value as any})}
                                        >
                                            <option value="active">Ocupado / Activo</option>
                                            <option value="vacant">Vacante / Disponible</option>
                                            <option value="late">En Mora / Suspendido</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Información del Arrendatario */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-500">
                                    <User size={12} />
                                </div>
                                Información del Arrendatario
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre de quien celebra el contrato</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                        placeholder="Nombre del Firmante Legal"
                                        value={editingTenant.contractSignerName || ''}
                                        onChange={e => setEditingTenant({...editingTenant, contractSignerName: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre Completo (Responsable Operativo)</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                        placeholder="Nombre y Apellidos"
                                        value={editingTenant.name || ''}
                                        onChange={e => setEditingTenant({...editingTenant, name: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Teléfono WhatsApp</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="5512345678"
                                            value={editingTenant.lesseePhone || ''}
                                            onChange={e => setEditingTenant({...editingTenant, lesseePhone: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Teléfono Celular</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="5587654321"
                                            value={editingTenant.cellPhone || ''}
                                            onChange={e => setEditingTenant({...editingTenant, cellPhone: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Correo Electrónico</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                        placeholder="correo@ejemplo.com"
                                        value={editingTenant.email || ''}
                                        onChange={e => setEditingTenant({...editingTenant, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Identificación y Fiscal */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-purple-50 rounded-lg flex items-center justify-center text-purple-500">
                                    <Shield size={12} />
                                </div>
                                Identificación y Datos Fiscales
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Clave de Elector (INE)</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="ABCD123456EFGH789"
                                            value={editingTenant.ineVoterKey || ''}
                                            onChange={e => setEditingTenant({...editingTenant, ineVoterKey: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">RFC</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="XAXX010101000"
                                            value={editingTenant.rfc || ''}
                                            onChange={e => setEditingTenant({...editingTenant, rfc: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Domicilio del Arrendatario</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                        placeholder="Calle, No. Ext, Col, C.P, Municipio, Estado"
                                        value={editingTenant.lesseeAddress || ''}
                                        onChange={e => setEditingTenant({...editingTenant, lesseeAddress: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Financials, Legal Dates, Extra Services, Credentials */}
                    <div className="space-y-10">
                        {/* Estructura de Cobro */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500">
                                    <DollarSign size={12} />
                                </div>
                                Estructura de Cobro Mensual
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Renta Base ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-5 font-black text-2xl text-slate-900 focus:border-amber-400 focus:bg-white outline-none transition-all shadow-inner"
                                            value={editingTenant.rentAmount || 0}
                                            onChange={e => setEditingTenant({...editingTenant, rentAmount: Number(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Mantenimiento ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-5 font-black text-2xl text-slate-900 focus:border-amber-400 focus:bg-white outline-none transition-all shadow-inner"
                                            value={editingTenant.maintenanceFee || 0}
                                            onChange={e => setEditingTenant({...editingTenant, maintenanceFee: Number(e.target.value)})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Agua ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-4 py-4 font-black text-slate-800 focus:border-amber-400 outline-none transition-all"
                                            value={editingTenant.waterFee || 0}
                                            onChange={e => setEditingTenant({...editingTenant, waterFee: Number(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Luz ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-4 py-4 font-black text-slate-800 focus:border-amber-400 outline-none transition-all"
                                            value={editingTenant.lightFee || 0}
                                            onChange={e => setEditingTenant({...editingTenant, lightFee: Number(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Otros ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-4 py-4 font-black text-slate-800 focus:border-amber-400 outline-none transition-all"
                                            value={editingTenant.serviceFee || 0}
                                            onChange={e => setEditingTenant({...editingTenant, serviceFee: Number(e.target.value)})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-50">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Monto de Depósito ($)</label>
                                        <input 
                                            type="number"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-lg text-slate-800 focus:border-amber-400 outline-none transition-all shadow-inner"
                                            placeholder="0.00"
                                            value={editingTenant.depositAmount || 0}
                                            onChange={e => setEditingTenant({...editingTenant, depositAmount: Number(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Día Límite Pago</label>
                                        <input 
                                            type="number" min="1" max="31"
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-lg text-slate-800 focus:border-blue-400 outline-none transition-all shadow-inner"
                                            value={editingTenant.paymentDay || 5}
                                            onChange={e => setEditingTenant({...editingTenant, paymentDay: Number(e.target.value)})}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Referencia / Último Corte</label>
                                    <input 
                                        type="date"
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all shadow-inner"
                                        value={editingTenant.lastPaymentDate || ''}
                                        onChange={e => setEditingTenant({...editingTenant, lastPaymentDate: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Legal y Documentos */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-slate-900 rounded-lg flex items-center justify-center text-white">
                                    <FileText size={12} />
                                </div>
                                Legal y Documentación
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Tiempo de Contratación</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                            placeholder="Ej. 12 Meses"
                                            value={editingTenant.leasePeriod || ''}
                                            onChange={e => setEditingTenant({...editingTenant, leasePeriod: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Estado Contrato</label>
                                        <select 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-700 focus:border-blue-400 outline-none transition-all"
                                            value={editingTenant.contractType || 'nuevo'}
                                            onChange={e => setEditingTenant({...editingTenant, contractType: e.target.value as any})}
                                        >
                                            <option value="nuevo">Nuevo Contrato</option>
                                            <option value="renovado">Contrato Renovado</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">F. de Firma</label>
                                        <input 
                                            type="date"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 font-bold text-xs text-slate-700 outline-none"
                                            value={editingTenant.contractSignDate || ''}
                                            onChange={e => setEditingTenant({...editingTenant, contractSignDate: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">F. de Inicio</label>
                                        <input 
                                            type="date"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 font-bold text-xs text-slate-700 outline-none"
                                            value={editingTenant.contractStartDate || ''}
                                            onChange={e => setEditingTenant({...editingTenant, contractStartDate: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">F. de Fin</label>
                                        <input 
                                            type="date"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2 py-3 font-bold text-xs text-slate-700 outline-none"
                                            value={editingTenant.contractEndDate || ''}
                                            onChange={e => setEditingTenant({...editingTenant, contractEndDate: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Objeto del Contrato (Giro/Modelo Negocio)</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                        placeholder="Ej. Venta de Alimentos y Bebidas Preparadas"
                                        value={editingTenant.contractObject || ''}
                                        onChange={e => setEditingTenant({...editingTenant, contractObject: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Servicios Extra */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-slate-500 rounded-lg flex items-center justify-center text-white">
                                    <Layers size={12} />
                                </div>
                                Servicios Adicionales contratados
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Servicio de Estacionamiento (Membresías)</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                        placeholder="Ej. Membresía 4 cajones - Monto: $1,200"
                                        value={editingTenant.parkingServiceDetails || ''}
                                        onChange={e => setEditingTenant({...editingTenant, parkingServiceDetails: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Servicio de Publicidad</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                        placeholder="Ej. Espacio P1, $500, Medidas: 2x1m, Impuestos: $80"
                                        value={editingTenant.advertisingServiceDetails || ''}
                                        onChange={e => setEditingTenant({...editingTenant, advertisingServiceDetails: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">No. de Servicio Eléctrico</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                            placeholder="123456789012"
                                            value={editingTenant.electricServiceNumber || ''}
                                            onChange={e => setEditingTenant({...editingTenant, electricServiceNumber: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Facturación</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                            placeholder="Ej. Sí, RFC adjunto / No requiere"
                                            value={editingTenant.billingDetails || ''}
                                            onChange={e => setEditingTenant({...editingTenant, billingDetails: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Credenciales de Acceso */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-slate-900 rounded-lg flex items-center justify-center text-white">
                                    <Layout size={12} />
                                </div>
                                Acceso al Sistema y Otros Datos
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Usuario de Sistema *</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                            placeholder="ejemplo_local"
                                            value={editingTenant.systemUser || ''}
                                            onChange={e => setEditingTenant({...editingTenant, systemUser: e.target.value})}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Contraseña de Sistema *</label>
                                        <div className="relative">
                                            <input 
                                                type={showPassword ? "text" : "password"}
                                                className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl pl-6 pr-14 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                                placeholder="••••••••"
                                                value={editingTenant.systemPassword || ''}
                                                onChange={e => setEditingTenant({...editingTenant, systemPassword: e.target.value})}
                                                autoComplete="new-password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Notas de Remisión / Proyecto Inversión</label>
                                    <textarea 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-sm text-slate-800 focus:border-blue-400 outline-none transition-all h-24"
                                        placeholder="Ingrese notas o especificaciones del proyecto de inversión y plan de devengación..."
                                        value={editingTenant.remissionNotes || ''}
                                        onChange={e => setEditingTenant({...editingTenant, remissionNotes: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Otros Datos / Especificaciones</label>
                                    <input 
                                        className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl px-8 py-4 font-black text-slate-800 focus:border-blue-400 outline-none transition-all"
                                        placeholder="Cualquier información adicional relevante..."
                                        value={editingTenant.otherData || ''}
                                        onChange={e => setEditingTenant({...editingTenant, otherData: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Documentos y Plano */}
                        <div className="space-y-6">
                            <h4 className="font-black text-[11px] uppercase text-slate-400 flex items-center gap-3 tracking-[0.3em] ml-6">
                                <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center text-white">
                                    <FileText size={12} />
                                </div>
                                Archivos Adjuntos (Contrato y Plano)
                            </h4>
                            <div className="p-10 bg-white rounded-[3.5rem] border border-slate-100 shadow-sm space-y-8">
                                {/* Contrato */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Contrato Arrendamiento (PDF/Imagen)</label>
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                        <input 
                                            type="file" 
                                            ref={contractInputRef} 
                                            className="hidden" 
                                            onChange={handleContractUpload} 
                                            accept="application/pdf,image/*" 
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => contractInputRef.current?.click()} 
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl font-black text-xs uppercase transition-all ${editingTenant.contractUrl ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-slate-300 text-slate-400 hover:bg-white'}`}
                                        >
                                            {isUploadingContract ? (
                                                <Loader2 className="animate-spin text-blue-500" size={18} />
                                            ) : editingTenant.contractUrl ? (
                                                <CheckCircle size={18} className="text-emerald-500" />
                                            ) : (
                                                <FileText size={18} />
                                            )}
                                            {isUploadingContract ? 'Subiendo...' : editingTenant.contractUrl ? 'Actualizar Contrato' : 'Subir Contrato'}
                                        </button>
                                        {editingTenant.contractUrl && (
                                            <DocumentPreviewButton
                                                url={editingTenant.contractUrl}
                                                className="flex items-center gap-2 px-4 py-3 bg-blue-100 text-blue-700 rounded-xl font-black text-xs uppercase hover:bg-blue-200 transition-colors"
                                                label={<><ExternalLink size={16} /> Ver</>}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">URL del Contrato Digital</label>
                                    <div className="relative">
                                        <ExternalLink className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl pl-16 pr-8 py-4 font-black text-blue-600 focus:border-blue-400 outline-none transition-all"
                                            placeholder="https://drive.google.com/..."
                                            value={editingTenant.contractUrl || ''}
                                            onChange={e => setEditingTenant({...editingTenant, contractUrl: e.target.value})}
                                        />
                                    </div>
                                </div>

                                {/* Plano Arrendado */}
                                <div className="space-y-2 pt-6 border-t border-slate-100">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Plano Arrendado (PDF/Imagen)</label>
                                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                        <input 
                                            type="file" 
                                            ref={planInputRef} 
                                            className="hidden" 
                                            onChange={handlePlanUpload} 
                                            accept="application/pdf,image/*" 
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => planInputRef.current?.click()} 
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl font-black text-xs uppercase transition-all ${editingTenant.rentedPlanUrl ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-slate-300 text-slate-400 hover:bg-white'}`}
                                        >
                                            {isUploadingPlan ? (
                                                <Loader2 className="animate-spin text-blue-500" size={18} />
                                            ) : editingTenant.rentedPlanUrl ? (
                                                <CheckCircle size={18} className="text-emerald-500" />
                                            ) : (
                                                <FileText size={18} />
                                            )}
                                            {isUploadingPlan ? 'Subiendo...' : editingTenant.rentedPlanUrl ? 'Actualizar Plano' : 'Subir Plano'}
                                        </button>
                                        {editingTenant.rentedPlanUrl && (
                                            <a 
                                                href={editingTenant.rentedPlanUrl} 
                                                target="_blank" 
                                                rel="noreferrer" 
                                                className="flex items-center gap-2 px-4 py-3 bg-blue-100 text-blue-700 rounded-xl font-black text-xs uppercase hover:bg-blue-200 transition-colors"
                                            >
                                                <ExternalLink size={16} /> Ver
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">URL del Plano Digital</label>
                                    <div className="relative">
                                        <ExternalLink className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-2xl pl-16 pr-8 py-4 font-black text-blue-600 focus:border-blue-400 outline-none transition-all"
                                            placeholder="https://drive.google.com/..."
                                            value={editingTenant.rentedPlanUrl || ''}
                                            onChange={e => setEditingTenant({...editingTenant, rentedPlanUrl: e.target.value})}
                                        />
                                    </div>
                                </div>

                                {editingTenant.id && (
                                    <button 
                                        onClick={() => handleDeleteTenant(editingTenant.id!)}
                                        className="w-full py-5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-3xl font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 border-t border-slate-100"
                                    >
                                        <Trash2 size={16} /> Eliminar Inquilino permanentemente
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in pb-24">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <h3 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Locales Comerciales</h3>
                <div className="flex items-center gap-4">
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                        {(['LOCAL', 'OFICINA', 'DEPORTIVO'] as const).map((t) => (
                            <button 
                                key={t}
                                onClick={() => setFilterType(filterType === t ? 'ALL' : t)}
                                className={`px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {t === 'LOCAL' ? 'Locales' : t === 'OFICINA' ? 'Oficinas' : 'Deportivo'}
                            </button>
                        ))}
                    </div>
                    <button 
                        onClick={() => { setEditingTenant({ tenantType: 'LOCAL', status: 'active', paymentDay: 5 }); setView('form'); }}
                        className="bg-slate-900 hover:bg-blue-600 text-white rounded-xl px-6 py-3 font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
                    >
                        <Plus size={16} strokeWidth={3} /> Nuevo
                    </button>
                </div>
            </div>
            
            {/* Stats Summary Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <TenantStatCard 
                    title="Total Adeudado" 
                    value={`$${stats.totalDebt.toLocaleString('es-MX', {minimumFractionDigits: 2})}`} 
                    icon={DollarSign} 
                    color="red" 
                    subValue="Locatarios con deuda"
                />
                <TenantStatCard 
                    title="Locatarios en Mora" 
                    value={stats.late.toString()} 
                    icon={AlertTriangle} 
                    color="amber" 
                    subValue="Pagos vencidos"
                />
                <TenantStatCard 
                    title="Ocupación Real" 
                    value={`${stats.occupancy}%`} 
                    icon={Building} 
                    color="emerald" 
                    subValue={`${stats.active} / ${stats.total} Unidades`}
                />
                <TenantStatCard 
                    title="Próximos Cobros" 
                    value={`${tenants.filter(t => calculateTenantDebt(t, transactions).status === 'pending').length}`} 
                    icon={Clock} 
                    color="blue" 
                    subValue="Por vencer esta semana"
                />
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                        type="text" 
                        placeholder="Buscar por negocio, responsable o local..."
                        className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500 focus:shadow-lg focus:shadow-blue-50 transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="border-b border-slate-100">
                        <tr>
                            <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidad</th>
                            <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Negocio</th>
                            <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                            <th className="p-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filteredTenants.map(t => {
                            const tDebt = calculateTenantDebt(t, transactions);
                            return (
                                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="p-5">
                                        <div className="font-black text-slate-900 text-lg">{t.tenantType === 'DEPORTIVO' ? 'Complejo Deportivo' : t.tenantType === 'OFICINA' ? 'Oficina' : 'Local'} {t.localNumber}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zona B1</div>
                                    </td>
                                    <td className="p-5">
                                        <div className="font-black text-slate-900 uppercase tracking-tight">{t.businessName}</div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.name || 'Sin asignar'}</div>
                                        {t.dimensions && (
                                            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold rounded uppercase">
                                                {t.dimensions} m²
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-5">
                                        {t.status === 'vacant' ? (
                                            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-widest">Vacante</span>
                                        ) : tDebt.status === 'late' ? (
                                            <div className="flex flex-col items-start gap-1">
                                                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase tracking-widest">Mora</span>
                                                <span className="text-[11px] font-black text-red-600 ml-1">${tDebt.totalDebt.toLocaleString()}</span>
                                            </div>
                                        ) : tDebt.status === 'pending' ? (
                                            <div className="flex flex-col items-start gap-1">
                                                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest">Pendiente</span>
                                                <span className="text-[11px] font-black text-amber-600 ml-1">${tDebt.totalDebt.toLocaleString()}</span>
                                            </div>
                                        ) : (
                                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest">Al día</span>
                                        )}
                                    </td>
                                    <td className="p-5 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => { setSelectedTenant(t); setView('detail'); }}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                title="Ver detalle"
                                            >
                                                <History size={18} />
                                            </button>
                                            <button 
                                                onClick={() => { setSelectedTenant(t); setEditingTenant(t); setView('form'); }}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                title="Editar"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteTenant(t.id)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredTenants.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-20 text-center">
                                    <div className="flex flex-col items-center gap-4 text-slate-300">
                                        <Building size={48} strokeWidth={1} />
                                        <p className="text-sm font-black uppercase tracking-widest">Sin resultados</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TenantStatCard = ({ title, value, icon: Icon, color, subValue }: any) => {
    const colorClasses: any = {
        red: "bg-red-50 text-red-600 border-red-100",
        amber: "bg-amber-50 text-amber-600 border-amber-100",
        emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
        blue: "bg-blue-50 text-blue-600 border-blue-100",
        slate: "bg-slate-50 text-slate-600 border-slate-100"
    };

    return (
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-400 transition-all">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform ${colorClasses[color] || colorClasses.slate}`}>
                <Icon size={28} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{title}</p>
            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{value}</h3>
            <p className="text-[11px] font-bold text-slate-400 mt-3 italic">{subValue}</p>
        </div>
    );
};


