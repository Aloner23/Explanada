import { scrubLegacyCredentials } from '../utils/cachePrivacy';
import { waitForAuth, restoreSession } from '../services/authService';
import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { dataService, TABLES } from '../services/dataService';

export const useAppInitialization = () => {
  const { loadData, setIsGlobal } = useStore();
  const [isInitialized, setIsInitialized] = useState(false);
  const [connectionReason, setConnectionReason] = useState<string | null>(null);

  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let disposed = false;
    const initialize = async () => {
      scrubLegacyCredentials(localStorage);
      await waitForAuth();
      if (disposed) return;
      // 1. Init sync listeners
      stopSync = dataService.initAutoSync((online, reason) => {
        setIsGlobal(online);
        setConnectionReason(reason || (online ? 'Conectado' : 'Desconocido'));
      });

      try {
        const user = await restoreSession();
        if (disposed) return;
        if (user) {
          const section = user.role === 'PARKING_STAFF' ? 'parking' : user.role === 'TENANT' ? 'tenant' : user.role === 'ADMIN' ? 'admin' : user.role === 'STAFF' ? 'tasks' : 'dashboard';
          const scope = user.role === 'OWNER' || user.role === 'ADMIN' ? 'ADMIN' : user.role === 'PARKING_STAFF' ? 'PARKING' : user.role === 'TENANT' ? 'TENANT' : 'TASKS';
          useStore.setState({ authenticatedUser: user, viewMode: 'internal', activeSection: section });
          await loadData(false, scope);
        } else {
          await loadData(false, 'PUBLIC');
        }
      } catch {
        useStore.getState().setError('No se pudo verificar la sesión. Vuelve a iniciar sesión o revisa la conexión.');
      } finally {
        if (!disposed) setIsInitialized(true);
      }
    };

    initialize();
    return () => { disposed = true; stopSync?.(); };
  }, [loadData, setIsGlobal]);

  return { isInitialized, connectionReason };
};
