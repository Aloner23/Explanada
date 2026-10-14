import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Staff, AttendanceRecord, PayrollRecord, Transaction, User } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { getLocalDateString, formatLocalDate } from '../utils/parkingLogic';
import {
    Users, Plus, Save, Trash2, Edit2, X, CheckCircle, AlertCircle,
    Calendar, Clock, DollarSign, Briefcase, Phone, BadgeCheck, BadgeX,
    ChevronDown, ChevronUp, Eye, ClipboardList, History, Wallet,
    Loader2
} from 'lucide-react';

interface PayrollManagerProps {
    staff: Staff[];
    setStaff: React.Dispatch<React.SetStateAction<Staff[]>>;
    attendance: AttendanceRecord[];
    setAttendance: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
    payrollRecords: PayrollRecord[];
    setPayrollRecords: React.Dispatch<React.SetStateAction<PayrollRecord[]>>;
    transactions: Transaction[];
    setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
    currentUser: User;
}

const emptyEmployee: Partial<Staff> = {
    name: '', role: '', weeklySalary: 0,
    hireDate: getLocalDateString(), schedule: '', formal: false,
    active: true, phone: '', notes: ''
};

// Get Monday of the current week
function getWeekMonday(dateStr?: string): string {
    const todayStr = dateStr || getLocalDateString();
    const d = new Date(todayStr + 'T12:00:00-06:00');
    const day = d.getDay(); // 0 (Sun) to 6 (Sat)
    
    // We want Monday (1). 
    // If today is Sunday (0), we go back 6 days.
    // If today is Monday (1), we go back 0 days.
    const diff = day === 0 ? -6 : 1 - day;
    
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
}

function getWeekSunday(mondayStr: string): string {
    const d = new Date(mondayStr + 'T12:00:00-06:00');
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
}

function getWeekDays(mondayStr: string): string[] {
    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(mondayStr + 'T12:00:00-06:00');
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const PayrollManager: React.FC<PayrollManagerProps> = ({
    staff, setStaff, attendance, setAttendance,
    payrollRecords, setPayrollRecords, transactions, setTransactions, currentUser
}) => {
    const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'history'>('employees');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<Staff>>(emptyEmployee);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const isProcessingRef = React.useRef(false);

    // Attendance state
    const [attWeekDate, setAttWeekDate] = useState(getWeekMonday());
    const attWeekDays = useMemo(() => getWeekDays(attWeekDate), [attWeekDate]);
    const attWeekEnd = getWeekSunday(attWeekDate);

    // Stats
    const activeStaff = staff.filter(s => s.active);
    const formalCount = activeStaff.filter(s => s.formal).length;
    const informalCount = activeStaff.filter(s => !s.formal).length;
    const weeklyTotal = activeStaff.reduce((sum, s) => sum + s.weeklySalary, 0);

    const openForm = (emp?: Staff) => {
        if (emp) { setForm({ ...emp }); setEditingId(emp.id); }
        else { setForm({ ...emptyEmployee }); setEditingId(null); }
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name || !form.role) return alert('Nombre y puesto son requeridos.');
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsProcessing(true);
        try {
            const emp: Staff = {
                id: editingId || `staff-${Date.now()}`,
                name: form.name!,
                role: form.role!,
                weeklySalary: form.weeklySalary || 0,
                hireDate: form.hireDate || getLocalDateString(),
                schedule: form.schedule || '',
                formal: form.formal || false,
                active: form.active !== false,
                phone: form.phone || '',
                notes: form.notes || ''
            };
            await dataService.upsertRecord(TABLES.STAFF, emp);
            setStaff(prev => {
                const idx = prev.findIndex(s => s.id === emp.id);
                if (idx >= 0) { const u = [...prev]; u[idx] = emp; return u; }
                return [...prev, emp];
            });
            setShowForm(false);
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Eliminar este empleado?')) return;
        await dataService.deleteRecord(TABLES.STAFF, id);
        setStaff(prev => prev.filter(s => s.id !== id));
    };

    const handleDeleteRecord = async (record: PayrollRecord) => {
        if (!window.confirm(`¿Seguro que deseas eliminar el registro de pago de ${record.staffName}? Esto también eliminará el movimiento de caja asociado.`)) return;
        
        setIsProcessing(true);
        try {
            // Delete payroll record
            await dataService.deleteRecord(TABLES.PAYROLL, record.id);
            setPayrollRecords(prev => prev.filter(r => r.id !== record.id));

            // Delete associated transaction
            if (record.transactionId) {
                await dataService.deleteRecord(TABLES.TRANSACTIONS, record.transactionId);
                setTransactions(prev => prev.filter(t => t.id !== record.transactionId));
            }
        } catch (error) {
            console.error(error);
            alert('Error al eliminar el registro.');
        } finally {
            setIsProcessing(false);
        }
    };

    // --- ATTENDANCE ---
    const getAttendanceStatus = (staffId: string, date: string): AttendanceRecord | undefined => {
        return attendance.find(a => a.staffId === staffId && a.date === date);
    };

    const toggleAttendance = async (staffId: string, date: string) => {
        const existing = getAttendanceStatus(staffId, date);
        let newStatus: 'present' | 'absent' | 'justified';

        if (!existing) newStatus = 'absent';
        else if (existing.status === 'absent') newStatus = 'justified';
        else if (existing.status === 'justified') newStatus = 'present';
        else newStatus = 'absent';

        // If present, just remove the record (default = present)
        if (newStatus === 'present' && existing) {
            await dataService.deleteRecord(TABLES.ATTENDANCE, existing.id);
            setAttendance(prev => prev.filter(a => a.id !== existing.id));
            return;
        }

        const record: AttendanceRecord = {
            id: existing?.id || `att-${staffId}-${date}`,
            staffId, date, status: newStatus
        };
        await dataService.upsertRecord(TABLES.ATTENDANCE, record);
        setAttendance(prev => {
            const idx = prev.findIndex(a => a.id === record.id);
            if (idx >= 0) { const u = [...prev]; u[idx] = record; return u; }
            return [...prev, record];
        });
    };

    const getAbsencesForWeek = (staffId: string, monday: string): number => {
        const days = getWeekDays(monday);
        const records = attendance || [];
        return days.filter(d => {
            const rec = records.find(a => a.staffId === staffId && a.date === d);
            return rec && rec.status === 'absent';
        }).length;
    };

    // --- PAY EMPLOYEE ---
    const handlePayEmployee = async (emp: Staff) => {
        const monday = getWeekMonday();
        const sunday = getWeekSunday(monday);

        // Check if already paid this week
        const alreadyPaid = payrollRecords.find(p =>
            p.staffId === emp.id && p.periodStart === monday
        );
        if (alreadyPaid) return alert(`${emp.name} ya fue pagado esta semana (${formatLocalDate(monday)} - ${formatLocalDate(sunday)}).`);

        const absences = getAbsencesForWeek(emp.id, monday);
        const dailyRate = emp.weeklySalary / 7;
        const deductions = absences * dailyRate;
        const totalPaid = emp.weeklySalary - deductions;

        const msg = `¿Pagar a ${emp.name}?

💰 Sueldo semanal: $${emp.weeklySalary.toLocaleString()}
${absences > 0 ? `❌ Faltas: ${absences} (-$${deductions.toLocaleString()})` : '✅ Sin faltas'}
📊 Total a pagar: $${totalPaid.toLocaleString()}
📅 Periodo: ${formatLocalDate(monday)} - ${formatLocalDate(sunday)}`;

        if (!window.confirm(msg)) return;
        if (isProcessingRef.current) return;
        isProcessingRef.current = true;
        setIsProcessing(true);

        try {
            const txDate = getLocalDateString();
            const txId = `tx-payroll-${emp.id}-${monday}`; // Deterministic ID to prevent duplicates
            const tx: Transaction = {
                id: txId,
                type: 'EXPENSE',
                subtype: 'NOMINA',
                amount: totalPaid,
                date: txDate, // Actual calendar date
                description: `Nómina: ${emp.name} (${emp.formal ? 'Formal' : 'Informal'}) — Sem ${formatLocalDate(monday)}`,
                status: 'completed',
                paymentMethod: 'CASH',
                registeredBy: currentUser.username,
                created_at: new Date().toISOString(),
                is_closed: false
            };
            await dataService.upsertRecord(TABLES.TRANSACTIONS, tx);
            setTransactions(prev => {
                const filtered = prev.filter(t => t.id !== txId);
                return [tx, ...filtered];
            });

            const payId = `pay-${emp.id}-${monday}`; // Deterministic ID
            const payRecord: PayrollRecord = {
                id: payId,
                staffId: emp.id,
                staffName: emp.name,
                periodStart: monday,
                periodEnd: sunday,
                baseSalary: emp.weeklySalary,
                deductions,
                bonus: 0,
                totalPaid,
                paidAt: new Date().toISOString(),
                transactionId: txId,
                formal: emp.formal
            };
            await dataService.upsertRecord(TABLES.PAYROLL, payRecord);
            setPayrollRecords(prev => {
                const filtered = prev.filter(p => p.id !== payId);
                return [payRecord, ...filtered];
            });
            alert(`✅ Pago registrado: $${totalPaid.toLocaleString()} a ${emp.name}`);
        } finally {
            isProcessingRef.current = false;
            setIsProcessing(false);
        }
    };

    const handleDeletePayroll = async (record: PayrollRecord) => {
        if (!window.confirm(`¿Eliminar el registro de nómina de ${record.staffName}? Esto también eliminará el movimiento financiero asociado.`)) return;
        
        try {
            setIsProcessing(true);
            // 1. Delete from DB
            await dataService.deleteRecord(TABLES.PAYROLL, record.id);
            if (record.transactionId) {
                await dataService.deleteRecord(TABLES.TRANSACTIONS, record.transactionId);
            }
            
            // 2. Update Local State
            setPayrollRecords(prev => prev.filter(p => p.id !== record.id));
            if (record.transactionId) {
                setTransactions(prev => prev.filter(t => t.id !== record.transactionId));
            }
            
            alert("Registro eliminado con éxito");
        } catch (e) {
            console.error(e);
            alert("Error al eliminar el registro");
        } finally {
            setIsProcessing(false);
        }
    };

    // Check if employee was paid this week
    const isPaidThisWeek = (staffId: string): boolean => {
        const monday = getWeekMonday();
        return payrollRecords.some(p => p.staffId === staffId && p.periodStart === monday);
    };

    // Employee payment history
    const getPayHistory = (staffId: string): PayrollRecord[] => {
        return payrollRecords
            .filter(p => p.staffId === staffId)
            .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
    };

    return (
        <div className="space-y-12 animate-fade-in pb-20 max-w-7xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                <div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Nómina y Personal</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Gestión de capital humano y pagos semanales</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                    <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto">
                        <button onClick={() => setActiveTab('employees')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'employees' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Staff</button>
                        <button onClick={() => setActiveTab('attendance')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'attendance' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Asistencia</button>
                        <button onClick={() => setActiveTab('history')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Historial</button>
                    </div>
                    <button onClick={() => openForm()} className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100">
                        <Plus size={18} /> Nuevo Registro
                    </button>
                </div>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Total Plantilla" value={activeStaff.length} icon={Users} color="blue" />
                <StatCard label="Formales (IMSS)" value={formalCount} icon={BadgeCheck} color="emerald" />
                <StatCard label="Sueldos Semanales" value={`$${weeklyTotal.toLocaleString()}`} icon={DollarSign} color="amber" />
                <StatCard label="Costo Mensual Est." value={`$${(weeklyTotal * 4).toLocaleString()}`} icon={Wallet} color="slate" />
            </div>

            {/* EMPLOYEES TAB */}
            {activeTab === 'employees' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {activeStaff.map(emp => {
                        const isExpanded = expandedId === emp.id;
                        const paid = isPaidThisWeek(emp.id);
                        const absencesThisWeek = getAbsencesForWeek(emp.id, getWeekMonday());

                        return (
                            <motion.div 
                                layout
                                key={emp.id} 
                                className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative"
                            >
                                <div className="p-8">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${emp.formal ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                                            {emp.formal ? <BadgeCheck size={28} /> : <Users size={28} />}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => openForm(emp)} className="w-10 h-10 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl flex items-center justify-center transition-all"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(emp.id)} className="w-10 h-10 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl flex items-center justify-center transition-all"><Trash2 size={16} /></button>
                                        </div>
                                    </div>

                                    <div className="space-y-1 mb-6">
                                        <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight truncate">{emp.name}</h4>
                                        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <Briefcase size={12} className="text-blue-500" /> {emp.role}
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-8 bg-slate-50/50 p-6 rounded-2xl border border-slate-50">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sueldo Semanal</span>
                                            <span className="font-black text-slate-800 text-lg">${emp.weeklySalary.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faltas Semanales</span>
                                            <span className={`font-black ${absencesThisWeek > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{absencesThisWeek}</span>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                                        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${emp.formal ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                            {emp.formal ? 'Formal' : 'Eventual'}
                                        </div>
                                        {paid ? (
                                            <div className="flex items-center gap-1.5 text-emerald-600">
                                                <CheckCircle size={14} />
                                                <span className="text-[9px] font-black uppercase tracking-widest">Sincronizado</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handlePayEmployee(emp)}
                                                disabled={isProcessing}
                                                className="px-6 py-2.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                                            >
                                                Pagar Nómina
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* ATTENDANCE TAB */}
            {activeTab === 'attendance' && (
                <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                                <Clock size={20} />
                            </div>
                            <div>
                                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Registro de Asistencia</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Semana del {formatLocalDate(attWeekDate)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl">
                            <button onClick={() => {
                                const d = new Date(attWeekDate + 'T12:00:00-06:00');
                                d.setDate(d.getDate() - 7);
                                setAttWeekDate(d.toISOString().split('T')[0]);
                            }} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-all">←</button>
                            <span className="px-6 text-[10px] font-black text-slate-600 uppercase tracking-widest">Navegación Semanal</span>
                            <button onClick={() => {
                                const d = new Date(attWeekDate + 'T12:00:00-06:00');
                                d.setDate(d.getDate() + 7);
                                setAttWeekDate(d.toISOString().split('T')[0]);
                            }} className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 shadow-sm transition-all">→</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-50">
                                    <th className="p-6 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-10">Colaborador</th>
                                    {attWeekDays.map((d, i) => (
                                        <th key={d} className="p-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                            {DAY_NAMES[i]} <span className="block text-[8px] opacity-60 font-bold mt-1">{d.split('-')[2]}</span>
                                        </th>
                                    ))}
                                    <th className="p-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pr-10">Faltas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeStaff.map(emp => {
                                    const absences = getAbsencesForWeek(emp.id, attWeekDate);
                                    return (
                                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                            <td className="p-6 pl-10">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${emp.formal ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                    <span className="font-black text-slate-800 text-sm uppercase tracking-tight">{emp.name}</span>
                                                </div>
                                            </td>
                                            {attWeekDays.map(day => {
                                                const rec = getAttendanceStatus(emp.id, day);
                                                const status = rec?.status || 'present';
                                                return (
                                                    <td key={day} className="p-4 text-center">
                                                        <button
                                                            onClick={() => toggleAttendance(emp.id, day)}
                                                            className={`w-12 h-12 rounded-2xl text-xs font-black transition-all flex items-center justify-center mx-auto border ${
                                                                status === 'present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' :
                                                                status === 'absent' ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' :
                                                                'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100'
                                                            }`}
                                                        >
                                                            {status === 'present' ? '✓' : status === 'absent' ? '✗' : 'J'}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                            <td className="p-6 text-center pr-10">
                                                <span className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-black ${absences > 0 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                                    {absences} Faltas
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
                <div className="space-y-8">
                    {(() => {
                        const weeks = new Map<string, PayrollRecord[]>();
                        payrollRecords.forEach(p => {
                            const key = p.periodStart;
                            weeks.set(key, [...(weeks.get(key) || []), p]);
                        });
                        const sortedWeeks = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0]));

                        return sortedWeeks.map(([monday, records]) => {
                            const sunday = getWeekSunday(monday);
                            const total = records.reduce((s, r) => s + r.totalPaid, 0);
                            
                            return (
                                <div key={monday} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
                                    <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                                                <History size={20} />
                                            </div>
                                            <div>
                                                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Semana del {formatLocalDate(monday)} al {formatLocalDate(sunday)}</h4>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{records.length} Colaboradores Liquidados</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-900 px-8 py-4 rounded-2xl text-white text-center min-w-[200px]">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Desembolso Total</p>
                                            <p className="text-2xl font-black">${total.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <div className="p-8 space-y-4">
                                        {records.map(r => (
                                            <div key={r.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors group">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-1.5 h-10 rounded-full ${r.formal ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                    <div>
                                                        <p className="font-black text-slate-800 text-sm uppercase tracking-tight">{r.staffName}</p>
                                                        <div className="flex items-center gap-3">
                                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{r.formal ? 'Planilla Fiscal' : 'Planilla Eventual'}</p>
                                                            <span className="w-1 h-1 bg-slate-200 rounded-full" />
                                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Pagado: {formatLocalDate(r.paidAt?.split('T')[0]) || 'Hoy'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-lg font-black text-slate-900">${r.totalPaid.toLocaleString()}</p>
                                                        {r.deductions > 0 && <p className="text-[9px] font-bold text-red-500 uppercase tracking-tight">Retenciones: -${r.deductions.toLocaleString()}</p>}
                                                    </div>
                                                    <button 
                                                        onClick={() => handleDeleteRecord(r)}
                                                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                        title="Eliminar registro"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            )}

            {/* EMPLOYEE FORM MODAL */}
            {showForm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
                    <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl relative z-10 animate-fade-in-up">
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                {editingId ? 'Editar Ficha' : 'Nueva Alta'}
                            </h3>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nombre Completo</label>
                                <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all" placeholder="Ej. Pedro Picapiedra" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Puesto / Cargo</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all" placeholder="Ej. Jefe de Piso" value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Sueldo Semanal ($)</label>
                                    <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-black text-emerald-600 outline-none focus:border-emerald-400 transition-all" value={form.weeklySalary || ''} onChange={e => setForm({ ...form, weeklySalary: Number(e.target.value) })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fecha Alta</label>
                                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-700 outline-none" value={form.hireDate || ''} onChange={e => setForm({ ...form, hireDate: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Horario</label>
                                    <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-6 py-4 font-bold text-slate-700 outline-none" placeholder="9am - 6pm" value={form.schedule || ''} onChange={e => setForm({ ...form, schedule: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex items-center gap-4 py-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Régimen</span>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button type="button" onClick={() => setForm({ ...form, formal: true })} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${form.formal ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500'}`}>Formal</button>
                                    <button type="button" onClick={() => setForm({ ...form, formal: false })} className={`px-6 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!form.formal ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500'}`}>Eventual</button>
                                </div>
                            </div>
                            <button onClick={handleSave} disabled={isProcessing} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-3 mt-4 shadow-xl shadow-slate-200">
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />} {editingId ? 'Actualizar Ficha' : 'Dar de Alta'}
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
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
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

