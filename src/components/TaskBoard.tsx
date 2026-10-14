import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Task, UserRole, User } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { getLocalDateString, formatLocalDate } from '../utils/parkingLogic';
import {
    Plus, CircleCheck, Clock, Trash2, AlertCircle, CheckCircle, Edit2, X, Save,
    ClipboardList, MessageSquare, Calendar, Tag, ChevronDown, ChevronUp,
    ArrowRight, Filter, Wrench, DollarSign, Sparkles, ShieldCheck, Briefcase, FileText,
    AlertTriangle, Send, Megaphone, Globe, Landmark,
    Loader2
} from 'lucide-react';
import { plaza } from '../config/plaza';

interface TaskBoardProps {
    currentUser: { username: string; role: string };
    users: User[];
}

const CATEGORIES: { id: Task['category']; label: string; icon: any; color: string; bg: string; text: string }[] = [
    { id: 'ADMIN', label: 'ADMIN', icon: Briefcase, color: 'indigo', bg: 'bg-indigo-50', text: 'text-indigo-600' },
    { id: 'MARKETING', label: 'MARKETING', icon: Megaphone, color: 'pink', bg: 'bg-pink-50', text: 'text-pink-600' },
    { id: 'WEB', label: 'WEB', icon: Globe, color: 'blue', bg: 'bg-blue-50', text: 'text-blue-600' },
    { id: 'LEGAL', label: 'LEGAL', icon: ShieldCheck, color: 'red', bg: 'bg-red-50', text: 'text-red-600' },
    { id: 'CONTABILIDAD', label: 'CONTABILIDAD', icon: Landmark, color: 'emerald', bg: 'bg-emerald-50', text: 'text-emerald-600' },
    { id: 'otro', label: 'Otro', icon: FileText, color: 'slate', bg: 'bg-slate-50', text: 'text-slate-600' },
];

const getCategoryInfo = (cat?: string) => CATEGORIES.find(c => c.id === cat) || CATEGORIES[5];

export const TaskBoard: React.FC<TaskBoardProps> = ({ currentUser, users }) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [zoomTask, setZoomTask] = useState<Task | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
    const [completionNote, setCompletionNote] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Form state
    const [form, setForm] = useState({
        description: '',
        priority: 'medium' as Task['priority'],
        category: 'ADMIN' as Task['category'],
        dueDate: '',
        assignedTo: ''
    });

    const isOwner = currentUser.role === UserRole.OWNER || currentUser.role === UserRole.ADMIN;
    const allUsers = users.filter(u => u.active !== false);

    useEffect(() => { loadTasks(); }, []);

    const loadTasks = async () => {
        const data = await dataService.getRecords(TABLES.TASKS || 'plz_tasks');
        setTasks(data.sort((a: Task, b: Task) => {
            const statusOrder = { pending: 0, in_progress: 1, completed: 2 };
            if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
            const pMap = { high: 3, medium: 2, low: 1 };
            if (pMap[a.priority] !== pMap[b.priority]) return pMap[b.priority] - pMap[a.priority];
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }));
    };

    const filteredTasks = useMemo(() => {
        let list = tasks;
        if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus);
        // Worker only sees tasks assigned to them or their role's categories (if we want to map roles to categories later)
        // For now, if role is STAFF, only show assigned to them
        if (currentUser.role === UserRole.STAFF) {
            list = list.filter(t => t.assignedTo === currentUser.username || t.assignedTo === 'Todos');
        }
        return list;
    }, [tasks, filterStatus, currentUser.role, currentUser.username]);

    const stats = useMemo(() => ({
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        overdue: tasks.filter(t => t.status !== 'completed' && t.dueDate && t.dueDate < getLocalDateString()).length,
    }), [tasks]);

    const addTask = async () => {
        if (!form.description.trim()) return alert('La descripción es requerida.');
        setIsProcessing(true);

        const newTask: Task = {
            id: `task - ${Date.now()} `,
            description: form.description,
            assignedTo: form.assignedTo || 'Todos',
            createdBy: currentUser.username,
            status: 'pending',
            priority: form.priority,
            category: form.category,
            dueDate: form.dueDate || undefined,
            createdAt: new Date().toISOString()
        };

        const success = await dataService.upsertRecord(TABLES.TASKS || 'plz_tasks', newTask);

        if (success) {
            // WHATSAPP NOTIFICATION
            const shouldNotify = confirm('¿Deseas enviar notificación por WhatsApp a la persona asignada?');
            if (shouldNotify) {
                const assignedUser = allUsers.find(u => u.username === form.assignedTo);
                let phone = '';
                // Since LoginUser might not have phone directly, we might need to fetch from Staff list or user metadata
                // For now, let's assume we can try to find them or ask/prompt.
                // Given the requirement "que se mande recordatorio al teléfono", I'll use a generic template.

                const catInfo = getCategoryInfo(form.category);
                const msg = `🚀 * NUEVA TAREA ASIGNADA - ${plaza.name.toUpperCase()} *\n\n` +
                    `📝 * Descripción:* ${form.description} \n` +
                    `📂 * Categoría:* ${catInfo.label} \n` +
                    `⚠️ * Prioridad:* ${form.priority.toUpperCase()} \n` +
                    `📅 * Vence:* ${form.dueDate || 'Sin fecha'} \n` +
                    `👤 * Asignado por:* ${currentUser.username} \n\n` +
                    `Revisa los detalles en la plataforma.`;

                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
            }
        }

        setForm({ description: '', priority: 'medium', category: 'ADMIN', dueDate: '', assignedTo: '' });
        setShowForm(false);
        await loadTasks();
        setIsProcessing(false);
    };

    const updateStatus = async (task: Task, newStatus: Task['status'], note?: string) => {
        setIsProcessing(true);
        const updated: Task = {
            ...task,
            status: newStatus,
            updatedAt: new Date().toISOString(),
            ...(newStatus === 'completed' ? { completedAt: new Date().toISOString(), completionNote: note || '' } : {})
        };
        await dataService.upsertRecord(TABLES.TASKS || 'plz_tasks', updated);
        setCompletionNote('');
        await loadTasks();
        setIsProcessing(false);
    };

    const updateAssignment = async (task: Task, newAssignee: string) => {
        const updated: Task = { ...task, assignedTo: newAssignee, updatedAt: new Date().toISOString() };
        await dataService.upsertRecord(TABLES.TASKS || 'plz_tasks', updated);
        await loadTasks();
    };

    const deleteTask = async (id: string) => {
        if (!window.confirm('¿Eliminar esta tarea?')) return;
        await dataService.deleteRecord(TABLES.TASKS || 'plz_tasks', id);
        loadTasks();
    };

    const isOverdue = (task: Task) => task.status !== 'completed' && task.dueDate && task.dueDate < getLocalDateString();

    const getPriorityStyle = (p: string) => {
        if (p === 'high') return { bg: 'bg-red-100', text: 'text-red-600', label: '🔴 Urgente' };
        if (p === 'medium') return { bg: 'bg-amber-100', text: 'text-amber-600', label: '🟡 Normal' };
        return { bg: 'bg-blue-100', text: 'text-blue-600', label: '🔵 Baja' };
    };

    const getStatusStyle = (s: string) => {
        if (s === 'completed') return { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completada', icon: CheckCircle };
        if (s === 'in_progress') return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En Progreso', icon: Clock };
        return { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pendiente', icon: AlertCircle };
    };

    return (
        <div className="space-y-12 animate-fade-in pb-20 max-w-7xl mx-auto">
            {/* HEADER */}
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                <div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Tablero de Control</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">
                        {isOwner ? 'Seguimiento y asignación de actividades' : 'Gestión de tus tareas asignadas'}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                    <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto overflow-x-auto">
                        {[
                            { id: 'all', label: 'Todas' },
                            { id: 'pending', label: 'Pendientes' },
                            { id: 'in_progress', label: 'En Curso' },
                            { id: 'completed', label: 'Finalizadas' },
                        ].map(f => (
                            <button key={f.id} onClick={() => setFilterStatus(f.id as any)}
                                className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filterStatus === f.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                                {f.label}
                            </button>
                        ))}
                    </div>
                    {isOwner && (
                        <button onClick={() => setShowForm(true)}
                            className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">
                            <Plus size={18} /> Nueva Actividad
                        </button>
                    )}
                </div>
            </header>

            {/* STATS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Tareas Pendientes" value={stats.pending} icon={Clock} color="amber" />
                <StatCard label="En Operación" value={stats.inProgress} icon={ArrowRight} color="blue" />
                <StatCard label="Completadas" value={stats.completed} icon={CheckCircle} color="emerald" />
                <StatCard label="Vencidas" value={stats.overdue} icon={AlertTriangle} color={stats.overdue > 0 ? "red" : "slate"} />
            </div>

            {/* TASK LIST */}
            <div className="space-y-6">
                {filteredTasks.length === 0 && (
                    <div className="bg-white rounded-[3rem] p-24 text-center border border-slate-100 shadow-sm">
                        <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
                            <ClipboardList className="text-slate-200" size={48} />
                        </div>
                        <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">No se encontraron tareas</h4>
                        <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">
                            {filterStatus === 'all' ? 'El tablero está limpio por ahora.' : `No hay tareas con estatus "${filterStatus}".`}
                        </p>
                    </div>
                )}

                {filteredTasks.map(task => {
                    const isExpanded = expandedId === task.id;
                    const priority = getPriorityStyle(task.priority);
                    const status = getStatusStyle(task.status);
                    const catInfo = getCategoryInfo(task.category);
                    const CatIcon = catInfo.icon;
                    const overdue = isOverdue(task);

                    return (
                        <motion.div 
                            layout
                            key={task.id} 
                            className={`bg-white rounded-[2.5rem] border transition-all overflow-hidden ${
                                task.status === 'completed' ? 'border-slate-100 opacity-60' :
                                overdue ? 'border-red-200 shadow-xl shadow-red-50' : 'border-slate-100 shadow-sm hover:shadow-xl'
                            }`}
                        >
                            <div className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                                <div className="flex items-center gap-6 flex-1 min-w-0">
                                    <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 ${status.bg}`}>
                                        <status.icon className={status.text} size={32} />
                                    </div>
                                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setZoomTask(task)}>
                                        <div className="flex flex-wrap items-center gap-3 mb-2">
                                            <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${priority.bg} ${priority.text} border-current/10`}>
                                                {priority.label}
                                            </span>
                                            <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${catInfo.bg} ${catInfo.text} border-current/10 flex items-center gap-1.5`}>
                                                <CatIcon size={12} /> {catInfo.label}
                                            </span>
                                            {overdue && <span className="px-4 py-1 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-widest">Vencida</span>}
                                        </div>
                                        <h4 className={`text-2xl font-black tracking-tight uppercase truncate ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                            {task.description}
                                        </h4>
                                        <div className="flex items-center gap-4 mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <span className="flex items-center gap-1.5"><Calendar size={12} className="text-indigo-500" /> {task.dueDate ? formatLocalDate(task.dueDate) : 'Sin fecha límite'}</span>
                                            <span className="flex items-center gap-1.5"><Send size={12} className="text-indigo-500" /> Por: {task.createdBy}</span>
                                        </div>
                                    </div>

                                    {/* RESPONSABLE */}
                                    <div className="shrink-0 flex flex-col items-end lg:items-center gap-2 lg:px-8 lg:border-l lg:border-slate-100">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asignado a</p>
                                        {isOwner ? (
                                            <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                                                <select
                                                    className="text-xs font-black text-indigo-600 bg-transparent outline-none cursor-pointer uppercase tracking-widest"
                                                    value={task.assignedTo}
                                                    onChange={(e) => updateAssignment(task, e.target.value)}
                                                >
                                                    <option value="Todos">Global</option>
                                                    {allUsers.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                                                </select>
                                            </div>
                                        ) : (
                                            <span className="text-sm font-black text-indigo-600 uppercase tracking-tight bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">{task.assignedTo}</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setExpandedId(isExpanded ? null : task.id)}
                                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all border ${isExpanded ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-white text-slate-400 border-slate-100 shadow-sm hover:border-slate-300'}`}
                                    >
                                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </button>
                                </div>
                            </div>

                            {/* EXPANDED DETAIL */}
                            {isExpanded && (
                                <div className="bg-slate-50/50 border-t border-slate-100 p-10 animate-fade-in">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                        <DetailCard label="Estado Actual" value={status.label} subValue={task.status === 'completed' && task.completedAt ? formatLocalDate(task.completedAt) : 'En proceso'} />
                                        <DetailCard label="Fecha Creación" value={new Date(task.createdAt).toLocaleDateString('es-MX')} />
                                        <DetailCard label="Límite Entrega" value={task.dueDate ? formatLocalDate(task.dueDate) : 'No definida'} color={overdue ? 'text-red-500' : 'text-slate-800'} />
                                        <DetailCard label="Prioridad" value={priority.label.replace(/🔴 |🟡 |🔵 /, '')} />
                                    </div>

                                    {task.status === 'completed' && task.completionNote && (
                                        <div className="mb-8 p-6 bg-white border border-emerald-100 rounded-[1.5rem] shadow-sm">
                                            <p className="text-[9px] font-black text-emerald-600 uppercase mb-3 flex items-center gap-2">
                                                <MessageSquare size={14} /> Reporte de Finalización
                                            </p>
                                            <p className="text-sm text-slate-700 font-bold leading-relaxed">{task.completionNote}</p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-4">
                                        {(task.status === 'pending' || (task.status === 'in_progress' && !isOwner)) && (
                                            <button onClick={() => updateStatus(task, task.status === 'pending' ? 'in_progress' : 'completed', completionNote)} disabled={isProcessing}
                                                className={`px-8 py-4 text-white rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl disabled:opacity-40 
                                                ${task.status === 'pending' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}>
                                                {task.status === 'pending' ? <ArrowRight size={18} /> : <CheckCircle size={18} />}
                                                {task.status === 'pending' ? 'Iniciar Operación' : 'Marcar Finalizada'}
                                            </button>
                                        )}
                                        {task.status === 'in_progress' && (
                                            <div className="flex-1 flex flex-col sm:flex-row gap-4 items-center">
                                                <input
                                                    type="text"
                                                    className="w-full bg-white border border-slate-200 rounded-[1.25rem] px-6 py-4 font-bold text-slate-700 outline-none focus:border-emerald-400 transition-all text-sm"
                                                    placeholder="Añade una nota de cierre (opcional)..."
                                                    value={completionNote}
                                                    onChange={e => setCompletionNote(e.target.value)}
                                                />
                                                <button onClick={() => updateStatus(task, 'completed', completionNote)} disabled={isProcessing}
                                                    className="w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 disabled:opacity-40 whitespace-nowrap">
                                                    <CheckCircle size={18} /> Finalizar Tarea
                                                </button>
                                            </div>
                                        )}
                                        {task.status === 'completed' && (
                                            <button onClick={() => updateStatus(task, 'pending')} disabled={isProcessing}
                                                className="px-8 py-4 bg-white border border-amber-200 text-amber-700 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-amber-50 transition-all disabled:opacity-40 shadow-sm">
                                                <Clock size={18} /> Reabrir Tarea
                                            </button>
                                        )}
                                        {isOwner && (
                                            <button onClick={() => deleteTask(task.id)}
                                                className="px-8 py-4 bg-red-50 text-red-600 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:bg-red-100 transition-all ml-auto">
                                                <Trash2 size={18} /> Eliminar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>

            {/* ZOOM MODAL */}
            {zoomTask && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
                    <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-xl" onClick={() => setZoomTask(null)} />
                    <div className="bg-white rounded-[4rem] p-16 max-w-4xl w-full text-center relative animate-fade-in-up z-10 shadow-2xl">
                        <button onClick={() => setZoomTask(null)} className="absolute top-10 right-10 p-4 hover:bg-slate-100 rounded-full transition-all">
                            <X className="text-slate-400" size={32} />
                        </button>
                        <div className="space-y-10">
                            <div className="flex justify-center gap-3">
                                <span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusStyle(zoomTask.status).bg} ${getStatusStyle(zoomTask.status).text}`}>
                                    {getStatusStyle(zoomTask.status).label}
                                </span>
                                <span className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${getPriorityStyle(zoomTask.priority).bg} ${getPriorityStyle(zoomTask.priority).text}`}>
                                    {getPriorityStyle(zoomTask.priority).label}
                                </span>
                            </div>
                            <h3 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight uppercase tracking-tighter">
                                {zoomTask.description}
                            </h3>
                            <div className="h-1.5 w-32 bg-indigo-500 mx-auto rounded-full"></div>
                            <div className="grid grid-cols-2 gap-12 pt-8 border-t border-slate-100">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Responsable</p>
                                    <p className="text-3xl font-black text-indigo-600 uppercase tracking-tight">{zoomTask.assignedTo}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Fecha Límite</p>
                                    <p className="text-3xl font-black text-slate-900 uppercase tracking-tight">{zoomTask.dueDate ? formatLocalDate(zoomTask.dueDate) : '--'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* NEW TASK MODAL */}
            {showForm && isOwner && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
                    <div className="bg-white rounded-[3rem] w-full max-w-xl p-10 shadow-2xl relative z-10 animate-fade-in-up overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Nueva Asignación</h3>
                                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Definición de requerimiento operativo</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-900"><X /></button>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Descripción de la Tarea</label>
                                <textarea className="w-full bg-slate-50 border border-slate-200 rounded-[1.5rem] px-6 py-4 font-bold text-slate-700 outline-none focus:border-indigo-400 transition-all h-32 resize-none" placeholder="¿Qué se necesita realizar?"
                                    value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Urgencia</label>
                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-700 outline-none focus:border-indigo-400" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as any })}>
                                        <option value="low">Baja</option>
                                        <option value="medium">Normal</option>
                                        <option value="high">Urgente</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Departamento</label>
                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-slate-700 outline-none focus:border-indigo-400" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })}>
                                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Responsable</label>
                                    <select className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-black text-indigo-600 outline-none focus:border-indigo-400" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        <option value="Todos">Global (Todos)</option>
                                        {allUsers.map(u => <option key={u.id} value={u.username}>{u.username} ({u.role})</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Fecha Límite</label>
                                    <input type="date" className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-indigo-400" value={form.dueDate}
                                        onChange={e => setForm({ ...form, dueDate: e.target.value })} />
                                </div>
                            </div>

                            <button onClick={addTask} disabled={isProcessing}
                                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 disabled:opacity-50 mt-4">
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Send size={18} />} Crear y Notificar
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
        amber: 'bg-amber-50 text-amber-600 border-amber-100 shadow-amber-50',
        blue: 'bg-blue-50 text-blue-600 border-blue-100 shadow-blue-50',
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-emerald-50',
        red: 'bg-red-50 text-red-600 border-red-100 shadow-red-50',
        slate: 'bg-slate-50 text-slate-400 border-slate-100'
    };
    return (
        <div className={`p-8 rounded-[2.5rem] border shadow-xl ${colors[color]}`}>
            <div className={`w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-6`}>
                <Icon size={24} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <h3 className="text-3xl font-black tracking-tight">{value}</h3>
        </div>
    );
};

const DetailCard = ({ label, value, subValue, color = "text-slate-800" }: any) => (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
        <p className={`text-sm font-black uppercase ${color}`}>{value}</p>
        {subValue && <p className="text-[10px] font-bold text-slate-400 mt-1">{subValue}</p>}
    </div>
);

