import React from 'react';
import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { UserRole } from '../../types';
import { plaza } from '../../config/plaza';

export const Header = ({ isElectron, connectionReason }: { isElectron: boolean, connectionReason: string | null }) => {
  const { authenticatedUser, isGlobal, isLoading, logout, parkingConfig } = useStore();
  const activeLogo = parkingConfig?.logoUrl || plaza.logo;

  const showMobileHeader = isElectron || 
    authenticatedUser?.role === UserRole.PARKING_STAFF || 
    authenticatedUser?.role === UserRole.TENANT || 
    authenticatedUser?.role === UserRole.STAFF || 
    (window.innerWidth < 1024);

  if (!showMobileHeader) return null;

  return (
    <header className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex justify-between items-center sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-2 md:gap-3">
        <div className="p-1 bg-white rounded-lg border flex items-center justify-center w-8 h-8 md:w-10 md:h-10 overflow-hidden">
          <img src={activeLogo} alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col cursor-pointer hover:opacity-80 transition-all">
          <h2 className="font-black uppercase tracking-tighter text-slate-800 text-xs md:text-sm">
            {authenticatedUser?.role === UserRole.PARKING_STAFF ? 'Caseta' : authenticatedUser?.role === UserRole.STAFF ? 'Personal' : authenticatedUser?.role === UserRole.TENANT ? 'Mi Espacio' : plaza.shortName}
          </h2>
          <div className="flex items-center gap-1">
            {isGlobal ? <Cloud className="text-emerald-500" size={10} /> : <CloudOff className="text-amber-500" size={10} />}
            <span className={`text-[8px] font-bold uppercase ${!isGlobal ? 'text-amber-600' : 'text-slate-500'}`}>
              {isGlobal ? 'Online' : `${connectionReason || 'Offline'}`}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isLoading && <RefreshCw size={14} className="animate-spin text-blue-500" />}
        <button onClick={() => useStore.getState().loadData(false)} className="flex items-center gap-2 text-slate-400 hover:text-blue-500 font-bold text-xs">
          <RefreshCw size={16} />
          <span className="hidden sm:inline">Sincronizar</span>
        </button>
        <button onClick={logout} className="flex items-center gap-2 text-slate-400 hover:text-red-500 font-bold text-xs ml-2">
          <span className="hidden sm:inline">Cerrar Sesión</span>
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
};
