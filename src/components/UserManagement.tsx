
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { 
    Trash2, UserPlus, Shield, Key, Check, X, 
    Edit2, User as UserIcon, ShieldCheck, Mail, Lock,
    Users, ShieldAlert, Activity, UserCheck, Search,
    ChevronRight, MoreVertical, BadgeCheck, Loader2, Save,
    Smartphone, Globe, Terminal, Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ui/ServeToast';

interface UserManagementProps {
    currentUser: User;
    users: User[];
    setUsers: () => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, users, setUsers }) => {
    const { toast } = useToast();
    const [showForm, setShowForm] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [formData, setFormData] = useState<Partial<User>>({ role: UserRole.PARKING_STAFF, active: true });
    const [isSaving, setIsSaving] = useState(false);

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.username.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (u.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch && u.active !== false;
    }).sort((a, b) => a.role.localeCompare(b.role));

    const handleSaveUser = async () => {
        if (!formData.username || (!formData.id && !formData.password)) {
            return toast("Usuario y contraseña requeridos", "error");
        }
        
        setIsSaving(true);
        try {
            const newUser: User = {
                id: formData.id || `user-${Date.now()}`,
                username: formData.username,
                password: formData.password,
                role: formData.role || UserRole.PARKING_STAFF,
                tenantId: formData.tenantId,
                name: formData.name || formData.username,
                active: true,
                permissions: formData.permissions || []
            };

            await dataService.upsertRecord(TABLES.USERS, newUser);
            setUsers();
            setShowForm(false);
            setFormData({ role: UserRole.PARKING_STAFF, active: true });
            toast("Usuario actualizado correctamente", "success");
        } catch (error: any) {
            toast(error.message || "Error al guardar usuario", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (id === currentUser.id) return toast("No puedes eliminar tu propia cuenta", "error");
        if (!window.confirm("¿Seguro de dar de baja a este usuario? No podrá acceder al sistema.")) return;

        try {
            const userToDisable = users.find(u => u.id === id);
            if (userToDisable) {
                const updated = { ...userToDisable, active: false };
                await dataService.upsertRecord(TABLES.USERS, updated);
                setUsers();
                toast("Usuario dado de baja", "success");
            }
        } catch (error: any) {
            toast("Error al procesar baja", "error");
        }
    };

    const getRoleIcon = (role: UserRole) => {
        switch (role) {
            case UserRole.OWNER: return <ShieldCheck className="text-purple-500" />;
            case UserRole.ADMIN: return <ShieldAlert className="text-blue-500" />;
            case UserRole.STAFF: return <Briefcase className="text-teal-500" />;
            case UserRole.TENANT: return <UserCheck className="text-emerald-500" />;
            default: return <Smartphone className="text-slate-400" />;
        }
    };

    const getRoleColor = (role: UserRole) => {
        switch (role) {
            case UserRole.OWNER: return 'bg-purple-50 text-purple-600 border-purple-100';
            case UserRole.ADMIN: return 'bg-blue-50 text-blue-600 border-blue-100';
            case UserRole.STAFF: return 'bg-teal-50 text-teal-600 border-teal-100';
            case UserRole.TENANT: return 'bg-emerald-50 text-emerald-600 border-emerald-100';
            default: return 'bg-slate-50 text-slate-500 border-slate-200';
        }
    };

    return (
        <div className="animate-fade-in space-y-12 pb-24">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10">
                <div>
                    <h3 className="text-6xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-6">Equipo</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em] flex items-center gap-3">
                        <ShieldCheck size={16} className="text-indigo-600" /> Administración de Personal y Niveles de Seguridad
                    </p>
                </div>
                <button 
                    onClick={() => { setFormData({ role: UserRole.PARKING_STAFF, active: true }); setShowForm(true); }}
                    className="bg-slate-900 hover:bg-indigo-600 text-white px-12 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center gap-4 shadow-2xl shadow-slate-200 active:scale-95"
                >
                    <UserPlus size={20} strokeWidth={3} /> Alta de Colaborador
                </button>
            </header>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-8 hover:shadow-xl transition-all">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Users size={32} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Colaboradores</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tight">{users.filter(u => u.active !== false).length}</p>
                    </div>
                </div>
                <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex items-center gap-8 hover:shadow-xl transition-all">
                    <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <BadgeCheck size={32} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Niveles de Acceso</p>
                        <p className="text-4xl font-black text-slate-900 tracking-tight">{new Set(users.map(u => u.role)).size}</p>
                    </div>
                </div>
                <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl flex items-center gap-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-blue-400 relative z-10">
                        <Activity size={32} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Sesiones Activas</p>
                        <p className="text-4xl font-black text-white tracking-tight">Sync</p>
                    </div>
                </div>
            </div>

            {/* Enhanced Search Bar */}
            <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="relative">
                    <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-300" size={24} />
                    <input 
                        className="w-full bg-slate-50 border-none rounded-[2rem] pl-20 pr-10 py-6 font-black text-slate-800 placeholder:text-slate-300 uppercase tracking-widest text-xs outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all"
                        placeholder="Filtro maestro de personal..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Grid de Usuarios Modernizado */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredUsers.map(user => (
                    <motion.div 
                        layout
                        key={user.id}
                        className="bg-white rounded-[3rem] border border-slate-100 p-10 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden flex flex-col"
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500" />
                        
                        <div className="flex justify-between items-start mb-10 relative z-10">
                            <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center border-2 group-hover:scale-110 transition-transform ${getRoleColor(user.role as any)} shadow-sm`}>
                                {getRoleIcon(user.role as any)}
                            </div>
                            <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                                <button 
                                    onClick={() => { setFormData({ ...user, password: undefined }); setShowForm(true); }}
                                    className="w-12 h-12 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-2xl flex items-center justify-center transition-all shadow-sm"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button 
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="w-12 h-12 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-2xl flex items-center justify-center transition-all shadow-sm"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3 mb-10 relative z-10">
                            <h4 className="text-2xl font-black text-slate-900 tracking-tighter uppercase truncate leading-tight">
                                {user.name || user.username}
                            </h4>
                            <div className="flex items-center gap-3 text-slate-400 bg-slate-50 w-fit px-4 py-2 rounded-xl border border-slate-100">
                                <Mail size={12} className="text-slate-300" />
                                <span className="text-[10px] font-black tracking-widest uppercase">{user.username}</span>
                            </div>
                        </div>

                        <div className="mt-auto pt-8 border-t border-slate-50 flex items-center justify-between relative z-10">
                            <div className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-sm ${getRoleColor(user.role as any)}`}>
                                {user.role.replace('_', ' ')}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Activo</span>
                            </div>
                        </div>
                    </motion.div>
                ))}

                {filteredUsers.length === 0 && (
                    <div className="col-span-full py-40 flex flex-col items-center gap-8 text-slate-200">
                        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center border-2 border-dashed border-slate-200">
                           <Users size={40} strokeWidth={1} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Sin coincidencias en el equipo</p>
                    </div>
                )}
            </div>

            {/* Modal de Alta/Edición Modernizado */}
            <AnimatePresence>
                {showForm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowForm(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl relative z-10 overflow-hidden flex flex-col"
                        >
                            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
                                        {formData.id ? 'Modificar Acceso' : 'Alta de Miembro'}
                                    </h4>
                                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Defina credenciales y nivel jerárquico</p>
                                </div>
                                <button onClick={() => setShowForm(false)} className="w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre del Colaborador</label>
                                    <div className="relative group">
                                        <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all"
                                            placeholder="Nombre completo..."
                                            value={formData.name || ''}
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">ID / Email</label>
                                        <div className="relative group">
                                            <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                            <input 
                                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all"
                                                placeholder="usuario"
                                                value={formData.username || ''}
                                                onChange={e => setFormData({...formData, username: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Contraseña de Acceso</label>
                                        <div className="relative group">
                                            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                            <input 
                                                type="password"
                                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all"
                                                placeholder="••••••••"
                                                value={formData.password || ''}
                                                onChange={e => setFormData({...formData, password: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nivel de Privilegios / Rol</label>
                                    <div className="relative group">
                                        <Shield className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                        <select 
                                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-10 py-5 font-black text-slate-800 uppercase tracking-widest text-[11px] outline-none focus:border-indigo-400 focus:bg-white transition-all appearance-none"
                                            value={formData.role || UserRole.PARKING_STAFF}
                                            onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                                        >
                                            <option value={UserRole.ADMIN}>Administrador General</option>
                                            <option value={UserRole.PARKING_STAFF}>Staff Estacionamiento (POS)</option>
                                            <option value={UserRole.STAFF}>Staff Plaza (Operaciones)</option>
                                            <option value={UserRole.OWNER}>Propietario / Master</option>
                                            <option value={UserRole.TENANT}>Portal de Inquilino</option>
                                        </select>
                                        <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={20} />
                                    </div>
                                </div>
                            </div>

                            <div className="p-10 border-t border-slate-100 flex justify-end gap-6 bg-slate-50/50">
                                <button 
                                    onClick={() => setShowForm(false)}
                                    className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] px-8 py-4 hover:text-slate-600 transition-colors"
                                >
                                    Descartar
                                </button>
                                <button 
                                    onClick={handleSaveUser}
                                    disabled={isSaving}
                                    className="px-12 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-4 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Guardar Cambios
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #f8fafc; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            `}</style>
        </div>
    );
};
