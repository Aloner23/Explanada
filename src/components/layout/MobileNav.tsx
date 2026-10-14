import React from 'react';
import { LayoutDashboard, Users, Car, Landmark, ClipboardList, LucideIcon } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { UserRole } from '../../types';
import { DATA_SCOPES } from '../../services/dataService';

export const MobileNav = () => {
  const { authenticatedUser, activeSection, setActiveSection, loadData } = useStore();

  const isElectron = typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0;
  const showMobileNav = !isElectron && authenticatedUser && authenticatedUser.role !== UserRole.PARKING_STAFF && authenticatedUser.role !== UserRole.TENANT;

  if (!showMobileNav) return null;

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

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white border-t border-slate-800 flex justify-around items-center px-2 py-1 z-30 pb-safe">
      {authenticatedUser?.role === UserRole.OWNER && (
        <MobileNavItem 
          icon={LayoutDashboard} label="Inicio" active={activeSection === 'dashboard'} 
          onClick={() => setActiveSection('dashboard')} 
          section="dashboard" loadData={loadData} getScope={getScopeForSection}
        />
      )}
      {(authenticatedUser?.role === UserRole.OWNER || authenticatedUser?.role === UserRole.ADMIN) && (
        <>
          <MobileNavItem 
            icon={Users} label="Admin" active={activeSection === 'admin'} 
            onClick={() => setActiveSection('admin')} 
            section="admin" loadData={loadData} getScope={getScopeForSection}
          />
          <MobileNavItem 
            icon={Car} label="Caseta" active={activeSection === 'parking'} 
            onClick={() => setActiveSection('parking')} 
            section="parking" loadData={loadData} getScope={getScopeForSection}
          />
          <MobileNavItem 
            icon={Landmark} label="Caja" active={activeSection === 'audit'} 
            onClick={() => setActiveSection('audit')} 
            section="audit" loadData={loadData} getScope={getScopeForSection}
          />
          <MobileNavItem 
            icon={ClipboardList} label="Tareas" active={activeSection === 'tasks'} 
            onClick={() => setActiveSection('tasks')} 
            section="tasks" loadData={loadData} getScope={getScopeForSection}
          />
        </>
      )}
      {authenticatedUser?.role === UserRole.STAFF && (
        <MobileNavItem 
          icon={ClipboardList} label="Tareas" active={activeSection === 'tasks'} 
          onClick={() => setActiveSection('tasks')} 
          section="tasks" loadData={loadData} getScope={getScopeForSection}
        />
      )}
    </nav>
  );
};

interface MobileNavItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  section: string;
  loadData: (silent?: boolean, scope?: keyof typeof DATA_SCOPES | 'all') => Promise<void>;
  getScope: (section: string) => keyof typeof DATA_SCOPES;
}

const MobileNavItem = ({ icon: Icon, label, active, onClick, section, loadData, getScope }: MobileNavItemProps) => {
  const handleClick = async () => {
    if (active) return;
    onClick();
    const scope = getScope(section);
    await loadData(false, scope);
  };

  return (
    <button 
      onClick={handleClick} 
      className={`flex flex-col items-center justify-center py-2 px-1 min-w-[64px] transition-all ${active ? 'text-blue-500' : 'text-slate-400'}`}
    >
      <Icon size={20} className={active ? 'scale-110' : ''} />
      <span className={`text-[10px] mt-1 font-bold uppercase tracking-tighter ${active ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
    </button>
  );
};
