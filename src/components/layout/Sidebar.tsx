import React from 'react';
import {
  Users, CarFront, Landmark, Megaphone, Wallet, ClipboardList, RefreshCw, Cloud, CloudOff, LogOut, ChevronRight,
  LayoutGrid, LucideIcon
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { UserRole } from '../../types';
import { plaza } from '../../config/plaza';

export const Sidebar = () => {
  const { 
    authenticatedUser, 
    activeSection, 
    setActiveSection, 
    isGlobal, 
    isLoading, 
    loadData, 
    logout, 
    parkingConfig 
  } = useStore();

  const activeLogo = parkingConfig?.logoUrl || plaza.logo;

  if (!authenticatedUser || authenticatedUser.role === UserRole.PARKING_STAFF || authenticatedUser.role === UserRole.TENANT) {
    return null;
  }

  return (
    <aside className="w-64 bg-[#0F172A] text-white hidden lg:flex flex-col h-full shrink-0 border-r border-slate-800">
      <div className="p-8">
        <div className="flex items-center gap-4 mb-12 px-2">
          <div className="bg-white rounded-2xl p-1.5 shadow-xl overflow-hidden flex items-center justify-center w-14 h-14">
            <img src={activeLogo} alt={plaza.name} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="font-black text-xl leading-none uppercase tracking-tighter">{plaza.shortName}</h1>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">
              {authenticatedUser?.role === UserRole.OWNER ? 'OWNER' : 'Admin Panel'}
            </p>
          </div>
        </div>

        <nav className="space-y-1.5">
          {authenticatedUser?.role === UserRole.OWNER && (
            <SidebarItem icon={LayoutGrid} label="Dashboard" active={activeSection === 'dashboard'} onClick={() => setActiveSection('dashboard')} />
          )}
          <SidebarItem icon={CarFront} label="Control Caseta" active={activeSection === 'parking'} onClick={() => setActiveSection('parking')} />
          <SidebarItem icon={Users} label="Administración" active={activeSection === 'admin'} onClick={() => setActiveSection('admin')} />
          <SidebarItem icon={Landmark} label="Caja y Arqueo" active={activeSection === 'audit'} onClick={() => setActiveSection('audit')} />
          <SidebarItem icon={Megaphone} label="Publicidad" active={activeSection === 'advertising'} onClick={() => setActiveSection('advertising')} />
          <SidebarItem icon={Wallet} label="Nómina" active={activeSection === 'payroll'} onClick={() => setActiveSection('payroll')} />
          <SidebarItem icon={ClipboardList} label="Tareas" active={activeSection === 'tasks'} onClick={() => setActiveSection('tasks')} />
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-4">
        <div className="px-5 py-4 bg-slate-800/20 rounded-3xl border border-slate-800/50 flex flex-col gap-2">
          <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-widest">
            <span>Estado de Nube</span>
            <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${isGlobal ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 ring-2 ring-amber-500/20'}`} />
            <span className={`text-xs font-black uppercase tracking-wider ${isGlobal ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isGlobal ? 'Conectado' : 'Modo Offline'}
            </span>
          </div>
        </div>

        <button onClick={() => loadData(false)} className="w-full flex items-center justify-between px-6 py-4 rounded-2xl text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest group">
          <span className="flex items-center gap-3">
             <RefreshCw size={16} className={isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} /> 
             Sincronizar
          </span>
          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
        </button>

        <button onClick={logout} className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-red-400/80 hover:bg-red-500/10 hover:text-red-400 transition-all font-black text-xs uppercase tracking-widest border border-transparent hover:border-red-500/20">
          <LogOut size={18} /> Salir del Sistema
        </button>
      </div>
    </aside>
  );
};

interface SidebarItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 group ${
      active 
        ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/20 scale-[1.02]' 
        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
    }`}
  >
    <div className="flex items-center gap-4">
      <Icon size={20} className={active ? 'text-white' : 'text-slate-500 group-hover:text-blue-400 transition-colors'} />
      <span className="font-bold text-sm tracking-tight">{label}</span>
    </div>
    {active && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
  </button>
);
