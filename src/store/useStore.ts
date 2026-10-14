import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { authenticatedFetch } from '../services/authService';
import { create } from 'zustand';
import { 
  User, Tenant, Transaction, ParkingConfig, Reservation, GalleryImage, 
  ParkingTicket, FrequentCustomer, AdSpace, Staff, AttendanceRecord, PayrollRecord 
} from '../types';
import { dataService, DATA_SCOPES } from '../services/dataService';

interface AppState {
  // Auth State
  authenticatedUser: User | null;
  setAuthenticatedUser: (user: User | null) => void;

  // UI State
  viewMode: 'public' | 'internal' | 'login';
  setViewMode: (mode: 'public' | 'internal' | 'login') => void;
  activeSection: 'dashboard' | 'admin' | 'parking' | 'tenant' | 'audit' | 'advertising' | 'payroll' | 'tasks';
  setActiveSection: (section: 'dashboard' | 'admin' | 'parking' | 'tenant' | 'audit' | 'advertising' | 'payroll' | 'tasks') => void;
  isLoading: boolean;
  loadPhase: string;
  error: string | null;
  isGlobal: boolean;
  isSectionSyncing: boolean;
  isFullHistoryLoaded: boolean;

  // Data Collections
  users: User[];
  tenants: Tenant[];
  transactions: Transaction[];
  parkingConfig: ParkingConfig | null;
  reservations: Reservation[];
  galleryImages: GalleryImage[];
  parkingTickets: ParkingTicket[];
  frequentCustomers: FrequentCustomer[];
  adSpaces: AdSpace[];
  staff: Staff[];
  attendanceRecords: AttendanceRecord[];
  payrollRecords: PayrollRecord[];

  // Actions
  setError: (error: string | null) => void;
  setIsGlobal: (isGlobal: boolean) => void;
  loadData: (silent?: boolean, scope?: string | string[]) => Promise<void>;
  // Reflects dataService's already-patched local cache into the store, with zero Firestore reads.
  // Use this after a single upsertRecord/deleteRecord instead of loadData(true), which re-reads
  // every table (including the full multi-year transaction/ticket history) from Firestore.
  syncFromLocalCache: () => void;
  handlePayRent: (tenantId: string, amount: number) => Promise<void>;
  handleStampTicket: (ticketId: string, localName: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Initial State
  authenticatedUser: null,
  setAuthenticatedUser: (user) => set({ authenticatedUser: user }),

  viewMode: 'public',
  setViewMode: (mode) => set({ viewMode: mode }),

  activeSection: 'dashboard',
  setActiveSection: (section) => set({ activeSection: section }),

  isLoading: false,
  loadPhase: 'Iniciando...',
  error: null,
  isGlobal: false,
  isSectionSyncing: false,
  isFullHistoryLoaded: false,

  users: [],
  tenants: [],
  transactions: [],
  parkingConfig: null,
  reservations: [],
  galleryImages: [],
  parkingTickets: [],
  frequentCustomers: [],
  adSpaces: [],
  staff: [],
  attendanceRecords: [],
  payrollRecords: [],

  // Actions
  setError: (error) => set({ error }),
  setIsGlobal: (isGlobal) => set({ isGlobal }),

  loadData: async (silent = false, scope: any = 'all') => {
    try {
      if (!silent) {
        set({ isLoading: true, loadPhase: scope === 'PUBLIC' ? 'Iniciando...' : `Cargando ${String(scope)}...` });
      }
      set({ error: null });

      if (typeof scope === 'string' && scope !== 'PUBLIC' && scope !== 'all' && !silent) {
        set({ isSectionSyncing: true });
      }

      // Sync pending records from local cache to cloud
      await dataService.syncPendingRecords();

      // Keep React snapshots independent from the mutable offline cache.
      const data = structuredClone(await dataService.getAllData(scope));
      const current = get();

      // Helper for deduplicated merge
      const mergeDedupe = (local: any[], remote: any[]) => {
        if (!remote) return local;
        return remote;
      };

      set({
        users: data.users || current.users,
        tenants: data.tenants || current.tenants,
        transactions: mergeDedupe(current.transactions, data.transactions),
        parkingConfig: data.parkingConfig || current.parkingConfig,
        reservations: mergeDedupe(current.reservations, data.reservations),
        galleryImages: mergeDedupe(current.galleryImages, data.galleryImages),
        parkingTickets: mergeDedupe(current.parkingTickets, data.parkingTickets),
        frequentCustomers: mergeDedupe(current.frequentCustomers, data.frequentCustomers),
        adSpaces: mergeDedupe(current.adSpaces, data.adSpaces),
        staff: mergeDedupe(current.staff, data.staff),
        attendanceRecords: mergeDedupe(current.attendanceRecords, data.attendance),
        payrollRecords: mergeDedupe(current.payrollRecords, data.payroll),
        isLoading: false,
        isSectionSyncing: false,
        error: data.loadErrors?.length ? 'No se pudieron actualizar algunos datos. Se conserva la copia local. ' + data.loadErrors.join('; ') : null
      });

      if ((scope === 'all' || scope === 'ADMIN') && !data.loadErrors?.length) {
        set({ isFullHistoryLoaded: true });
      }

    } catch (err: any) {
      console.error("Critical error loading data:", err);
      set({ 
        error: err.message || String(err), 
        isLoading: false, 
        isSectionSyncing: false 
      });
    }
  },

  syncFromLocalCache: () => {
    const cached = structuredClone(dataService._getCache());
    const current = get();
    set({
      users: cached.users ?? current.users,
      tenants: cached.tenants ?? current.tenants,
      transactions: cached.transactions ?? current.transactions,
      parkingConfig: cached.parkingConfig ?? current.parkingConfig,
      reservations: cached.reservations ?? current.reservations,
      galleryImages: cached.galleryImages ?? current.galleryImages,
      parkingTickets: cached.parkingTickets ?? current.parkingTickets,
      frequentCustomers: cached.frequentCustomers ?? current.frequentCustomers,
      adSpaces: cached.adSpaces ?? current.adSpaces,
      staff: cached.staff ?? current.staff,
      attendanceRecords: cached.attendance ?? current.attendanceRecords,
      payrollRecords: cached.payroll ?? current.payrollRecords,
    });
  },

  handlePayRent: async (tenantId, amount) => {
    const { tenants, loadData } = get();
    const tenant = tenants.find(t => t.id === tenantId);
    
    const newTx: Transaction = {
      id: `tx-${Date.now()}`, 
      type: 'RENT', 
      amount, 
      date: new Date().toISOString().split('T')[0],
      description: `Pago Renta - Local ${tenant?.localNumber}`, 
      status: 'completed',
      tenantId: tenantId,
      tenantBusinessName: tenant?.businessName
    };

    const TABLES = (await import('../services/dataService')).TABLES;
    await dataService.upsertRecord(TABLES.TRANSACTIONS, newTx);
    get().syncFromLocalCache();
  },

  handleStampTicket: async (ticketId, localName) => {
    const { loadData } = get();
    const TABLES = (await import('../services/dataService')).TABLES;
    
    const response = await authenticatedFetch('/account-api/stamp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId })
    });
    if (!response.ok) return false;
    return true;
  },

  logout: () => {
    void signOut(auth);
    dataService._memoryCache = null;
    set({
      users: [], tenants: [], transactions: [], parkingTickets: [], staff: [], payrollRecords: [], attendanceRecords: [], frequentCustomers: [], adSpaces: [], reservations: [],
      isFullHistoryLoaded: false,
      authenticatedUser: null,
      viewMode: 'public',
      activeSection: 'dashboard'
    });
  },

  clearError: () => set({ error: null })
}));
