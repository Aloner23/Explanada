
import React, { useState, useRef } from 'react';
import { ParkingConfig } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { 
    Save, Settings, Building2, MapPin, 
    Clock, DollarSign, Image as ImageIcon,
    FileText, Loader2, CheckCircle, Info,
    Shield, Globe, Smartphone, Bell, Zap,
    Cpu, Database, Cloud, RefreshCw, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ui/ServeToast';
import { plaza } from '../config/plaza';

interface SystemConfigProps {
    config: ParkingConfig;
    onUpdate: () => void;
}

export const SystemConfig: React.FC<SystemConfigProps> = ({ config, onUpdate }) => {
    const { toast } = useToast();
    const [localConfig, setLocalConfig] = useState<ParkingConfig>(config);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await dataService.upsertRecord(TABLES.CONFIG, { ...localConfig, id: 'global' });
            onUpdate();
            toast("Configuración global actualizada con éxito", "success");
        } catch (error: any) {
            toast("Error al sincronizar con el servidor", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const url = await dataService.uploadFile(file);
            if (url) {
                setLocalConfig(prev => ({ ...prev, logoUrl: url }));
                toast("Logo institucional actualizado", "success");
            }
        } catch (error) {
            toast("Error al subir el logo", "error");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto animate-fade-in space-y-12 pb-24">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-10 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                <div>
                    <h3 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">Configuración</h3>
                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">Parámetros globales de {plaza.name}</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-[1.5rem] px-12 py-5 font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 transition-all flex items-center gap-4 active:scale-95 disabled:opacity-50"
                >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Sincronizar Cambios
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Identity & Status */}
                <div className="lg:col-span-1 space-y-10">
                    {/* Brand Identity */}
                    <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-10">
                        <div className="flex flex-col items-center text-center space-y-8">
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-48 h-48 rounded-[2.5rem] bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all overflow-hidden relative group shadow-inner"
                            >
                                {localConfig.logoUrl ? (
                                    <img src={localConfig.logoUrl} className="w-full h-full object-contain p-6 group-hover:scale-110 transition-transform duration-500" alt="Logo" />
                                ) : (
                                    <ImageIcon className="text-slate-300" size={40} />
                                )}
                                <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/5 transition-colors" />
                                {isUploading && (
                                    <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center gap-3">
                                        <Loader2 size={32} className="animate-spin text-indigo-600" />
                                        <span className="text-[8px] font-black uppercase text-indigo-600 tracking-widest">Subiendo...</span>
                                    </div>
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                            
                            <div>
                                <p className="font-black text-slate-800 text-xs uppercase tracking-[0.2em]">Identidad Visual</p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-2 leading-relaxed">
                                    Logo institucional para cabeceras,<br />tickets y reportes ejecutivos.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 pt-10 border-t border-slate-50">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre de la Plaza</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-4 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                                    value={localConfig.plazaName || ''}
                                    onChange={e => setLocalConfig({...localConfig, plazaName: e.target.value})}
                                    placeholder={plaza.name}
                                />
                            </div>
                        </div>
                    </div>

                    {/* System Pulse */}
                    <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl space-y-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                        <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-3 relative z-10">
                            <Cpu size={16} /> Estado del Ecosistema
                        </h5>
                        <div className="space-y-6 relative z-10">
                            <StatusItem icon={Database} label="Core Firestore" status="En Línea" color="text-emerald-400" />
                            <StatusItem icon={RefreshCw} label="Sincronización" status="Tiempo Real" color="text-emerald-400" />
                            <StatusItem icon={Shield} label="Protocolo SSL" status="Protegido" color="text-blue-400" />
                        </div>
                        <div className="pt-6 border-t border-white/5 relative z-10 space-y-4">
                             <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                 <span>Versión de Compilación</span>
                                 <span className="text-white">v0.1.78</span>
                             </div>
                             <button 
                                onClick={() => {
                                    if (window.confirm("¿Seguro que deseas limpiar la memoria local? Esto forzará una recarga total y eliminará cualquier dato fantasma.")) {
                                        dataService.clearCache();
                                    }
                                }} 
                                className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-2xl font-black uppercase tracking-widest text-[9px] transition-all flex items-center justify-center gap-2 border border-rose-500/20"
                             >
                                <Database size={14} /> Purgar Memoria Local
                             </button>
                        </div>
                    </div>
                </div>

                {/* Rates & Operations */}
                <div className="lg:col-span-2 space-y-10">
                    <div className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm space-y-12">
                        <div className="flex items-center gap-6 border-b border-slate-50 pb-10">
                            <div className="w-16 h-16 bg-indigo-50 rounded-[1.5rem] flex items-center justify-center text-indigo-600 shadow-sm">
                                <Zap size={28} />
                            </div>
                            <div>
                                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Parámetros de Operación</h4>
                                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Reglas de negocio y facturación</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Tarifa x Hora (Estacionamiento)</label>
                                <div className="relative group">
                                    <div className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 font-black text-2xl group-focus-within:text-indigo-600 transition-colors">$</div>
                                    <input 
                                        type="number" 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] pl-16 pr-8 py-6 font-black text-4xl text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                                        value={localConfig.hourlyRate}
                                        onChange={e => setLocalConfig({...localConfig, hourlyRate: Number(e.target.value)})}
                                    />
                                    <div className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase tracking-widest">MXN / HR</div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Cortesía Inicial</label>
                                <div className="relative group">
                                    <Clock className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={28} />
                                    <input 
                                        type="number" 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] pl-20 pr-8 py-6 font-black text-4xl text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                                        value={localConfig.freeMinutes}
                                        onChange={e => setLocalConfig({...localConfig, freeMinutes: Number(e.target.value)})}
                                    />
                                    <div className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase tracking-widest">MINUTOS</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-10 border-t border-slate-50">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-6">Leyenda en Comprobantes (Footer)</label>
                                <div className="relative">
                                    <FileText className="absolute left-8 top-8 text-slate-300" size={24} />
                                    <textarea 
                                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] pl-20 pr-10 py-8 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white min-h-[160px] transition-all shadow-inner leading-relaxed"
                                        placeholder="Mensaje personalizado al final de cada ticket impreso..."
                                        value={localConfig.footerMessage || ''}
                                        onChange={e => setLocalConfig({...localConfig, footerMessage: e.target.value})}
                                    />
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-8 mt-2">Visible en tickets de estacionamiento y recibos de pago</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-10 rounded-[3.5rem] text-white flex items-start gap-8 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:scale-110 transition-transform duration-1000" />
                        <div className="w-16 h-16 bg-white/20 rounded-[1.5rem] flex items-center justify-center text-white shadow-xl shrink-0 backdrop-blur-md">
                            <Bell size={28} />
                        </div>
                        <div className="space-y-3 relative z-10">
                            <p className="font-black text-white text-lg uppercase tracking-tight">Sincronización Automática</p>
                            <p className="text-[11px] text-indigo-100 font-bold leading-relaxed uppercase tracking-wider opacity-90">
                                Los cambios aplicados aquí se propagarán instantáneamente a todos los módulos: Control de Acceso, Caja, Nómina y Portales de Cliente.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
};

const StatusItem = ({ icon: Icon, label, status, color }: any) => (
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Icon size={14} className="text-slate-500" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{label}</span>
        </div>
        <div className={`flex items-center gap-2 ${color} text-[9px] font-black uppercase tracking-widest`}>
            <div className={`w-1 h-1 rounded-full animate-pulse ${color.replace('text-', 'bg-')}`} />
            {status}
        </div>
    </div>
);

