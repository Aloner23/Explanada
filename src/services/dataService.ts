import { publicRequest } from './publicService';
import { Tenant, Transaction, ParkingConfig, Reservation, GalleryImage, ParkingTicket, LoginUser, FrequentCustomer, AttendanceRecord, PayrollRecord } from '../types';
import { INITIAL_TENANTS, INITIAL_TRANSACTIONS, INITIAL_PARKING_CONFIG, INITIAL_RESERVATIONS, INITIAL_GALLERY_IMAGES, INITIAL_USERS, INITIAL_AD_SPACES, INITIAL_STAFF, INITIAL_TASKS } from '../constants';
import { db, storage, auth } from '../firebaseConfig';
import { saveUser, authenticatedFetch } from './authService';
import { collection, getDocs, doc, getDoc, getDocFromServer, setDoc, deleteDoc, writeBatch, terminate, clearIndexedDbPersistence, query, where, orderBy, limit, startAfter } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export const TABLES = {
  USERS: 'plz_users',
  TENANTS: 'plz_tenants',
  TRANSACTIONS: 'plz_transactions',
  CONFIG: 'plz_config',
  RESERVATIONS: 'plz_reservations',
  GALLERY: 'plz_gallery',
  TICKETS: 'plz_tickets',
  FREQUENT_CUSTOMERS: 'plz_frequent_customers',
  AD_SPACES: 'plz_ad_spaces',
  STAFF: 'plz_staff',
  TASKS: 'plz_tasks',
  ATTENDANCE: 'plz_attendance',
  PAYROLL: 'plz_payroll',
  ACCOUNTS: 'plz_accounts',
  POLICIES: 'plz_policies',
  COST_CENTERS: 'plz_cost_centers',
  ACCOUNT_BALANCES: 'plz_account_balances',
  ACCOUNTING_CONFIG: 'plz_accounting_config'
};

const QUEUE_KEY = 'explanada_offline_queue';
const DB_CACHE_KEY = 'explanada_db_snapshot';
const SYNC_LOG_KEY = 'explanada_sync_audit_log';

export const DATA_SCOPES = {
  PUBLIC: [TABLES.CONFIG, TABLES.RESERVATIONS, TABLES.GALLERY],
  DASHBOARD: [TABLES.CONFIG, TABLES.TENANTS, TABLES.TRANSACTIONS, TABLES.RESERVATIONS, TABLES.STAFF],
  PARKING: [TABLES.CONFIG, TABLES.TICKETS, TABLES.TRANSACTIONS, TABLES.FREQUENT_CUSTOMERS],
  TENANT: [TABLES.TENANTS, TABLES.TICKETS, TABLES.TRANSACTIONS],
  TASKS: [TABLES.USERS, TABLES.TASKS],
  AUDIT: [TABLES.TRANSACTIONS],
  PAYROLL: [TABLES.STAFF, TABLES.ATTENDANCE, TABLES.PAYROLL, TABLES.TRANSACTIONS],
  ADVERTISING: [TABLES.AD_SPACES, TABLES.TRANSACTIONS],
  ADMIN: Object.values(TABLES)
};

// Helper to check if we are truly online (pinging firestore or checking metadata)
let isTrulyOnline = navigator.onLine;

// We can expose a subscriber for connection state
let connectionListeners: ((online: boolean) => void)[] = [];

interface PendingAction {
  id: string;
  table: string;
  action: 'UPSERT' | 'DELETE' | 'UPLOAD' | 'BATCH';
  data?: any;
  timestamp: number;
}

const pruneItem = (item: any): any => {
  if (!item || typeof item !== 'object') return item;
  let hasLargeString = false;
  for (const k in item) {
    if (typeof item[k] === 'string' && item[k].length > 5000) {
      hasLargeString = true;
      break;
    }
  }
  if (!hasLargeString) return item;
  const copy: any = { ...item };
  for (const k in copy) {
    if (typeof copy[k] === 'string' && copy[k].length > 5000) {
      copy[k] = copy[k].startsWith('data:image') 
        ? 'https://images.unsplash.com/photo-1594322436404-5a0526db4d13?q=80&w=800'
        : copy[k].slice(0, 1000) + '... (pruned)';
    }
  }
  return copy;
};

const pruneLargeStrings = (val: any): any => {
  if (Array.isArray(val)) {
    return val.map(pruneItem);
  }
  return pruneItem(val);
};

export const dataService = {
  _isSyncing: false,
  _memoryCache: null as any,
  _cacheOwner: null as string | null,
  _loadErrors: [] as string[],
  _cacheKey(key: string) { return `${key}_${auth.currentUser?.uid || 'public'}`; },
  _tombstones: new Set<string>(),
  
  _getCache(): any {
    const owner = auth.currentUser?.uid || 'public';
    if (this._cacheOwner !== owner) { this._memoryCache = null; this._cacheOwner = owner; }
    if (this._memoryCache) return this._memoryCache;
    try {
      const raw = localStorage.getItem(this._cacheKey(DB_CACHE_KEY));
      this._memoryCache = raw ? JSON.parse(raw) : {};
      return this._memoryCache;
    } catch {
      this._memoryCache = {};
      return {};
    }
  },

  _saveCache(data: any) {
    this._memoryCache = data;
    try {
      // Create a copy of the data object containing only pruned versions of large arrays
      // to avoid exceeding the 5MB browser localStorage quota while keeping full data in memory.
      const cacheCopy: any = {};
      Object.keys(data).forEach(key => {
        const val = data[key];
        if (Array.isArray(val)) {
          let prunedVal = val;
          if (key === 'transactions') {
            prunedVal = val.slice(0, 500); // Last 500 transactions
          } else if (key === 'parkingTickets') {
            prunedVal = val.slice(0, 300); // Last 300 tickets
          } else if (key === 'attendance' || key === 'payroll' || key === 'reservations') {
            prunedVal = val.slice(0, 200); // Last 200 items each
          }
          cacheCopy[key] = pruneLargeStrings(prunedVal);
        } else {
          cacheCopy[key] = pruneLargeStrings(val);
        }
      });
      localStorage.setItem(this._cacheKey(DB_CACHE_KEY), JSON.stringify(cacheCopy));
    } catch (e) {
      console.error("Critical: LocalStorage full or blocked", e);
    }
  },
  
  // Helper to merge cloud data with local cache based on timestamps
   mergeSnapshots(local: any, cloud: any, scope: any = 'all') {
    const merged: any = { ...local };
    const GRACE_PERIOD_MS = 30 * 60 * 1000; // Increased to 30 minutes for safety
    const now = Date.now();
    
    Object.keys(cloud).forEach(key => {
      const cloudValue = cloud[key];
      const localValue = local[key];

      // If cloud has null or undefined for this table, don't overwrite local cache
      if (cloudValue === null || cloudValue === undefined) return;

      if (Array.isArray(cloudValue)) {
        if (!Array.isArray(localValue)) {
          merged[key] = cloudValue;
        } else {
          const map = new Map();
          
          // 1. Add cloud records (truth source)
          cloudValue.forEach(r => {
            if (!this._tombstones.has(r.id)) {
              map.set(r.id, r);
            }
          });
          
          const queue = this.getPendingQueue();
          const pendingUpserts = new Set(queue.flatMap((q: any) => q.action === 'BATCH' ? q.data.records.map((r: any) => r.id) : q.action === 'UPSERT' ? [q.id] : []));

          // 2. Protect local records
          localValue.forEach(r => {
            // Automatically clean up corrupted records without an ID
            if (!r || !r.id || r.id === 'undefined' || String(r.id) === 'undefined') return;

            if (!map.has(r.id)) {
              // Item in cache but NOT in cloud fetch.
              // ONLY protect it if it's currently pending upload (offline creation)
              if (pendingUpserts.has(r.id)) {
                map.set(r.id, r);
              } else if (key === 'transactions' && scope !== 'ADMIN' && scope !== 'all') {
                // If it is a partial transactions fetch, protect any cached transaction older than the 30 days window
                const txDateStr = r.date; // YYYY-MM-DD
                const d = new Date();
                d.setDate(d.getDate() - 30);
                const limitDateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
                if (txDateStr < limitDateStr) {
                  map.set(r.id, r);
                }
              }
            } else {
              // Item in both. Keep the newer one strictly.
              const localRec = r;
              const cloudRec = map.get(r.id);
              const cloudTs = new Date(cloudRec.updated_at || cloudRec.created_at || cloudRec.entryTime || 0).getTime();
              const localTs = new Date(localRec.updated_at || localRec.created_at || localRec.entryTime || 0).getTime();
              
              if (localTs > cloudTs) {
                map.set(r.id, localRec);
              }
            }
          });
          
          merged[key] = Array.from(map.values());
        }
      } else if (typeof cloudValue === 'object') {
        merged[key] = { ...(localValue || {}), ...cloudValue };
      } else {
        merged[key] = cloudValue;
      }
    });

    return merged;
  },

  // --- SUBIDA DE ARCHIVOS A FIREBASE STORAGE ---
  async uploadFile(file: File): Promise<string | null> {
    // Eliminamos check de navigator.onLine porque es poco confiable en móviles


    try {
      const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      return url;
    } catch (error) {
      console.error("Error en uploadFile:", error);
      return null;
    }
  },

  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  },

  // --- MÉTODOS EXISTENTES ---
  logSyncEvent(id: string, table: string, action: string, status: 'SYNCED' | 'LOCAL_PENDING', details: string = '') {
    try {
      const currentLogRaw = localStorage.getItem(this._cacheKey(SYNC_LOG_KEY));
      const currentLog: any[] = currentLogRaw ? JSON.parse(currentLogRaw) : [];
      const newEntry = { id, table, action, status, timestamp: new Date().toISOString(), details };
      localStorage.setItem(this._cacheKey(SYNC_LOG_KEY), JSON.stringify([newEntry, ...currentLog].slice(0, 1000)));
    } catch (e) { console.error(e); }
  },

  getPendingQueue(): PendingAction[] {
    try {
      const raw = localStorage.getItem(this._cacheKey(QUEUE_KEY));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  addToQueue(action: PendingAction) {
    if (!action.id || action.id === 'undefined' || String(action.id) === 'undefined') {
      console.warn("Attempted to add invalid item to offline queue:", action);
      return;
    }
    const queue = this.getPendingQueue();
    const filtered = queue.filter(item => !(item.id === action.id && item.table === action.table));
    filtered.push(action);
    localStorage.setItem(this._cacheKey(QUEUE_KEY), JSON.stringify(filtered));
  },

  removeFromQueue(id: string, table: string) {
    const queue = this.getPendingQueue();
    const filtered = queue.filter(item => !(item.id === id && item.table === table));
    localStorage.setItem(this._cacheKey(QUEUE_KEY), JSON.stringify(filtered));
  },

  initAutoSync(onStatusChange?: (online: boolean, reason?: string) => void) {
    if (onStatusChange) connectionListeners.push(onStatusChange as any);

    const onOnline = () => {
      isTrulyOnline = true;
      connectionListeners.forEach(l => (l as any)(true, 'Conectado'));
      this.syncPendingRecords();
    };
    window.addEventListener('online', onOnline);

    const onOffline = () => {
      isTrulyOnline = false;
      connectionListeners.forEach(l => (l as any)(false, 'Sin acceso a Internet'));
    };
    window.addEventListener('offline', onOffline);

    // Notificar estado inicial inmediatamente
    if (onStatusChange) onStatusChange(isTrulyOnline, isTrulyOnline ? 'Conectado' : 'Sin conexión');


    // Periódicamente verificar si Firestore responde (Ping)
    // Útil para redes móviles "mentirosas" (conectadas pero sin datos)
    const timer = setInterval(async () => {
      if (!navigator.onLine) {
        if (isTrulyOnline) {
          isTrulyOnline = false;
          connectionListeners.forEach(l => (l as any)(false, 'Internet desconectado'));
        }
        return;
      }
      
      try {
        // Ping MUCHO más ligero: un solo documento en lugar de listar toda la colección
        const startTime = Date.now();
        await getDocFromServer(doc(db, TABLES.CONFIG, 'global'));
        const latency = Date.now() - startTime;
        
        const wasOnline = isTrulyOnline;
        if (latency > 25000) { // Umbral aún más generoso para móviles congestionados
          isTrulyOnline = false;
          connectionListeners.forEach(l => (l as any)(false, 'Latencia crítica de red'));
        } else {
          isTrulyOnline = true;
          if (!wasOnline) connectionListeners.forEach(l => (l as any)(true, 'Conexión restaurada'));
        }
      } catch (e: any) {
        let reason = 'Error de conexión';
        if (e.message?.includes('quota')) reason = 'Límite de datos Firebase excedido';
        else if (e.message?.includes('permission')) reason = 'Error de permisos de red';
        else if (e.message?.includes('network')) reason = 'Fallo de red Firestore';

        if (isTrulyOnline || reason !== 'Error de conexión') {
          isTrulyOnline = false;
          connectionListeners.forEach(l => (l as any)(false, reason));
        }
      }
    }, 45000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      connectionListeners = connectionListeners.filter(l => l !== onStatusChange);
    };
  },

  async syncPendingRecords() {
    if (this._isSyncing || !auth.currentUser || !navigator.onLine) return;

    const queue = this.getPendingQueue();
    if (queue.length === 0) return;

    this._isSyncing = true;
    try {
      // Procesar en lotes si fuera necesario, por ahora uno por uno
      for (const item of queue) {
        if (!item.id || item.id === 'undefined' || String(item.id) === 'undefined') {
          // Limpiar elemento corrupto de la cola de forma proactiva
          const currentQueue = this.getPendingQueue();
          const filtered = currentQueue.filter(q => q.id && q.id !== 'undefined' && String(q.id) !== 'undefined');
          localStorage.setItem(this._cacheKey(QUEUE_KEY), JSON.stringify(filtered));
          continue;
        }

        if (item.table === TABLES.USERS) continue; // Account changes require the authenticated server endpoint.
        try {
          if (item.action === 'BATCH') {
            const batch = writeBatch(db);
            for (const r of item.data.records) batch.set(doc(db, r.table, r.id), r.record, { merge: true });
            await batch.commit();
          } else if (item.action === 'UPSERT') {
            await setDoc(doc(db, item.table, item.id), item.data, { merge: true });
          } else if (item.action === 'DELETE') {
            await deleteDoc(doc(db, item.table, item.id));
          }

          this.removeFromQueue(item.id, item.table);
          this.logSyncEvent(item.id, item.table, item.action, 'SYNCED');
        } catch (e) {
          console.error(`Error syncing item ${item.id}`, e);
          // No romper el bucle, intentar sincronizar los demás
        }
      }
    } finally { this._isSyncing = false; }
  },

  async getAllData(scope: keyof typeof DATA_SCOPES | 'all' | string[] = 'all') {
    this._loadErrors = [];
    if (scope === 'PUBLIC') {
      try {
        const snapshot = await publicRequest('public-snapshot');
        // Keep a separate public projection; never return an authenticated user's cache here.
        localStorage.setItem(`${DB_CACHE_KEY}_public`, JSON.stringify(snapshot));
        return snapshot;
      } catch (e: any) {
        const cached = JSON.parse(localStorage.getItem(`${DB_CACHE_KEY}_public`) || '{}');
        return { ...cached, loadErrors: [e.message || 'No se pudo actualizar la información pública.'] };
      }
    }
    if (!auth.currentUser) throw new Error('Inicia sesión para consultar datos internos.');
    let isOfflineLoad = false;
    let dbSnapshot: any = {};

    const maxRetries = 2;
    
    // Función auxiliar para cargar una colección de forma segura
    const safeFetch = async (tableName: string) => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const colRef = collection(db, tableName);
          if (scope === 'TENANT') {
            const me = await getDocFromServer(doc(db, TABLES.USERS, auth.currentUser!.uid));
            const tenantId = me.data()?.tenantId;
            if (!tenantId) throw new Error('Cuenta sin locatario asignado.');
            if (tableName === TABLES.TENANTS) {
              const tenant = await getDocFromServer(doc(db, TABLES.TENANTS, tenantId));
              return { docs: tenant.exists() ? [tenant] : [], empty: !tenant.exists() };
            }
            if (tableName === TABLES.TRANSACTIONS) return await getDocs(query(colRef, where('tenantId', '==', tenantId)));
            if (tableName === TABLES.TICKETS) return { docs: [], empty: true };
          }
          
          // Caso especial: Carga masiva pero segura de Transacciones (3800+ registros)
          if (tableName === TABLES.TRANSACTIONS) {
            let allDocs: any[] = [];
            let lastDoc = null;
            let hasMore = true;
            
            const isAdminScope = scope === 'ADMIN' || scope === 'all';
            if (!isAdminScope) {
              // For non-admin/operation scopes (like PARKING, TENANT, etc.), load only the last 30 days.
              // This is extremely fast, prevents quota issues, and provides enough history.
              const d = new Date();
              d.setDate(d.getDate() - 30);
              const startDateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
              const q = query(colRef, where('date', '>=', startDateStr));
              const snap = await getDocs(q);
              return snap;
            }

            // Para carga COMPLETA (ADMIN/all), traemos en lotes paralelos de meses
            const monthRanges: { start: string; end: string }[] = [];
            let currentDate = new Date();
            let year = currentDate.getFullYear();
            let month = currentDate.getMonth() + 1;

            while (year >= 2023) {
              const startOfMonth = `${year}-${month.toString().padStart(2, '0')}-01`;
              let nextMonth = month + 1;
              let nextYear = year;
              if (nextMonth > 12) { nextMonth = 1; nextYear++; }
              const endOfMonth = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

              monthRanges.push({ start: startOfMonth, end: endOfMonth });
              month--;
              if (month < 1) { month = 12; year--; }
            }

            // Ejecutar consultas en lotes de 6 meses en paralelo
            const BATCH_SIZE = 6;
            let emptyStreak = 0;
            for (let i = 0; i < monthRanges.length; i += BATCH_SIZE) {
              if (emptyStreak >= 6) break;
              const batch = monthRanges.slice(i, i + BATCH_SIZE);
              const snaps = await Promise.all(
                batch.map(r => getDocs(query(colRef, where('date', '>=', r.start), where('date', '<', r.end))))
              );

              let batchHasDocs = false;
              for (const snap of snaps) {
                if (!snap.empty) {
                  allDocs = [...allDocs, ...snap.docs];
                  batchHasDocs = true;
                  emptyStreak = 0;
                } else {
                  emptyStreak++;
                }
              }
              if (!batchHasDocs && emptyStreak >= 6) break;
            }
            return { docs: allDocs, empty: allDocs.length === 0 };
          }
          
          // Otros tablas (Pequeñas)
          const snap = await getDocs(colRef);
          return snap;
        } catch (err: any) {
          attempt++;
          const errMsg = err.message || String(err);
          
          // Si es un error de índice (común en Firestore con filtros combinados)
          if (errMsg.includes('index')) {
            console.error("FALTA ÍNDICE EN FIREBASE:", errMsg);
            return { docs: [], empty: true, error: "Falta configurar un índice en Firebase. Revisa la consola para el link." };
          }

          console.error(`Error cargando tabla [${tableName}] (intento ${attempt}):`, errMsg);
          
          if (attempt > maxRetries || !errMsg.includes('network')) {
            return { docs: [], empty: true, error: errMsg };
          }
          const delay = Math.pow(2, attempt) * 800;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      return { docs: [], empty: true };
    };

    try {
      // Definimos qué cargar según el scope
      let tablesToLoad: string[] = [];
      if (scope === 'all') tablesToLoad = Object.values(TABLES);
      else if (Array.isArray(scope)) tablesToLoad = scope;
      else if (DATA_SCOPES[scope as keyof typeof DATA_SCOPES]) tablesToLoad = DATA_SCOPES[scope as keyof typeof DATA_SCOPES];
      else tablesToLoad = DATA_SCOPES.PUBLIC;

      if (navigator.onLine) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        let results: any[] = [];
        
        if (isMobile) {
          // SECUENCIAL en móviles para mayor estabilidad
          for (const table of tablesToLoad) {
            results.push(await safeFetch(table));
          }
        } else {
          // PARALELO en desktop
          results = await Promise.all(tablesToLoad.map(t => safeFetch(t)));
        }
        
        // Mapeamos resultados al snapshot
        const resMap: any = {};
        tablesToLoad.forEach((table, i) => {
          resMap[table] = results[i];
        });

        const failed = tablesToLoad.filter(t => resMap[t]?.error);
        this._loadErrors = failed.map(t => `${t}: ${resMap[t].error}`);
        failed.forEach(t => delete resMap[t]); // A failed query is not an empty collection.
        dbSnapshot = {};
        if (resMap[TABLES.USERS]) dbSnapshot.users = resMap[TABLES.USERS].docs.map((d: any) => d.data());
        if (resMap[TABLES.TENANTS]) dbSnapshot.tenants = resMap[TABLES.TENANTS].docs.map((d: any) => d.data());
        
        if (resMap[TABLES.TRANSACTIONS]) {
            const txs = resMap[TABLES.TRANSACTIONS].docs.map((d: any) => d.data());
            // Ordenar en JS para evitar requerir índices en Firestore
            dbSnapshot.transactions = txs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        }
        if (resMap[TABLES.CONFIG]) dbSnapshot.parkingConfig = resMap[TABLES.CONFIG].docs.find((d: any) => d.id === 'global')?.data() || (resMap[TABLES.CONFIG].empty ? null : resMap[TABLES.CONFIG].docs[0]?.data());
        if (resMap[TABLES.RESERVATIONS]) dbSnapshot.reservations = resMap[TABLES.RESERVATIONS].docs.map((d: any) => d.data());
        if (resMap[TABLES.GALLERY]) dbSnapshot.galleryImages = resMap[TABLES.GALLERY].docs.map((d: any) => d.data());
        if (resMap[TABLES.TICKETS]) dbSnapshot.parkingTickets = resMap[TABLES.TICKETS].docs.map((d: any) => d.data());
        if (resMap[TABLES.FREQUENT_CUSTOMERS]) dbSnapshot.frequentCustomers = resMap[TABLES.FREQUENT_CUSTOMERS].docs.map((d: any) => d.data());
        if (resMap[TABLES.AD_SPACES]) dbSnapshot.adSpaces = resMap[TABLES.AD_SPACES].docs.map((d: any) => d.data());
        if (resMap[TABLES.STAFF]) dbSnapshot.staff = resMap[TABLES.STAFF].docs.map((d: any) => d.data());
        if (resMap[TABLES.TASKS]) dbSnapshot.tasks = resMap[TABLES.TASKS].docs.map((d: any) => d.data());
        if (resMap[TABLES.ATTENDANCE]) dbSnapshot.attendance = resMap[TABLES.ATTENDANCE].docs.map((d: any) => d.data());
        if (resMap[TABLES.PAYROLL]) dbSnapshot.payroll = resMap[TABLES.PAYROLL].docs.map((d: any) => d.data());
        if (resMap[TABLES.ACCOUNTS]) dbSnapshot.accounts = resMap[TABLES.ACCOUNTS].docs.map((d: any) => d.data());
        if (resMap[TABLES.POLICIES]) dbSnapshot.policies = resMap[TABLES.POLICIES].docs.map((d: any) => d.data());
        if (resMap[TABLES.COST_CENTERS]) dbSnapshot.costCenters = resMap[TABLES.COST_CENTERS].docs.map((d: any) => d.data());
        if (resMap[TABLES.ACCOUNT_BALANCES]) dbSnapshot.accountBalances = resMap[TABLES.ACCOUNT_BALANCES].docs.map((d: any) => d.data());
        if (resMap[TABLES.ACCOUNTING_CONFIG]) dbSnapshot.accountingConfig = resMap[TABLES.ACCOUNTING_CONFIG].docs.map((d: any) => d.data());

        // merge cloud results with existing cache
        const cached = this._getCache();
        dbSnapshot = this.mergeSnapshots(cached, dbSnapshot, scope);
        this._saveCache(dbSnapshot);
      } else {
        isOfflineLoad = true;
      }
    } catch (e: any) {
      console.error("Error general en getAllData:", e.message);
      isOfflineLoad = true;
    }

    if (isOfflineLoad || !dbSnapshot) {
      dbSnapshot = this._getCache();
    }

    const result: any = {};
    if (dbSnapshot.users !== undefined) result.users = dbSnapshot.users;
    if (dbSnapshot.tenants !== undefined) result.tenants = dbSnapshot.tenants;
    if (dbSnapshot.transactions !== undefined) result.transactions = dbSnapshot.transactions;
    if (dbSnapshot.parkingConfig !== undefined) result.parkingConfig = dbSnapshot.parkingConfig;
    if (dbSnapshot.reservations !== undefined) result.reservations = dbSnapshot.reservations;
    if (dbSnapshot.galleryImages !== undefined) result.galleryImages = dbSnapshot.galleryImages;
    if (dbSnapshot.parkingTickets !== undefined) result.parkingTickets = dbSnapshot.parkingTickets;
    if (dbSnapshot.frequentCustomers !== undefined) result.frequentCustomers = dbSnapshot.frequentCustomers;
    if (dbSnapshot.adSpaces !== undefined) result.adSpaces = dbSnapshot.adSpaces;
    if (dbSnapshot.staff !== undefined) result.staff = dbSnapshot.staff;
    if (dbSnapshot.tasks !== undefined) result.tasks = dbSnapshot.tasks;
    if (dbSnapshot.attendance !== undefined) result.attendance = dbSnapshot.attendance;
    if (dbSnapshot.payroll !== undefined) result.payroll = dbSnapshot.payroll;
    if (dbSnapshot.accounts !== undefined) result.accounts = dbSnapshot.accounts;
    if (dbSnapshot.policies !== undefined) result.policies = dbSnapshot.policies;
    if (dbSnapshot.costCenters !== undefined) result.costCenters = dbSnapshot.costCenters;
    if (dbSnapshot.accountBalances !== undefined) result.accountBalances = dbSnapshot.accountBalances;
    if (dbSnapshot.accountingConfig !== undefined) result.accountingConfig = dbSnapshot.accountingConfig;

    // --- MERGE OFFLINE QUEUE ---
    const queue = this.getPendingQueue();
    const tableToKey: { [key: string]: string } = {
      [TABLES.TICKETS]: 'parkingTickets',
      [TABLES.TRANSACTIONS]: 'transactions',
      [TABLES.RESERVATIONS]: 'reservations',
      [TABLES.USERS]: 'users',
      [TABLES.TENANTS]: 'tenants',
      [TABLES.GALLERY]: 'galleryImages',
      [TABLES.FREQUENT_CUSTOMERS]: 'frequentCustomers',
      [TABLES.AD_SPACES]: 'adSpaces',
      [TABLES.STAFF]: 'staff',
      [TABLES.TASKS]: 'tasks',
      [TABLES.ATTENDANCE]: 'attendance',
      [TABLES.PAYROLL]: 'payroll',
      [TABLES.CONFIG]: 'parkingConfig',
      [TABLES.ACCOUNTS]: 'accounts',
      [TABLES.POLICIES]: 'policies',
      [TABLES.COST_CENTERS]: 'costCenters',
      [TABLES.ACCOUNT_BALANCES]: 'accountBalances',
      [TABLES.ACCOUNTING_CONFIG]: 'accountingConfig'
    };

    queue.flatMap(item => item.action === 'BATCH' ? item.data.records.map((r: any) => ({ ...r, action: 'UPSERT', data: r.record })) : [item]).forEach(item => {
      const key = tableToKey[item.table];
      if (!key) return;
      if (!item.id || item.id === 'undefined' || String(item.id) === 'undefined') return;

      if (key === 'parkingConfig') {
        if (item.action === 'UPSERT') {
          result.parkingConfig = { ...(result.parkingConfig || {}), ...item.data };
        }
      } else {
        if (!result[key]) result[key] = [];
        const index = result[key].findIndex((r: any) => r.id === item.id);
        
        if (item.action === 'UPSERT') {
          if (index >= 0) result[key][index] = { ...result[key][index], ...item.data };
          else result[key].push(item.data);
        } else if (item.action === 'DELETE') {
          if (index >= 0) result[key].splice(index, 1);
        }
      }
    });

    try {
      const legacyQueue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (legacyQueue.length) this._loadErrors.push('Hay cambios sin sincronizar de la versión anterior. Administración debe revisarlos antes de recuperar esa cola.');
    } catch { /* An invalid legacy queue must be inspected, never replayed automatically. */ }
    result.loadErrors = this._loadErrors;
    return result;
  },

  async getRecords(tableName: string): Promise<any[]> {
    if (!auth.currentUser) throw new Error('Inicia sesión para consultar datos.');
    if (navigator.onLine) {
      try {
        const snapshot = await getDocs(collection(db, tableName));
        return snapshot.docs.map(doc => doc.data());
      } catch (e) {
        console.error("Error fetching records, trying cache...", e);
        // Fallthrough to cache logic
      }
    }
    // Fallback simple cache check
    const specificCached = localStorage.getItem(this._cacheKey(`${DB_CACHE_KEY}_${tableName}`));
    if (specificCached) return JSON.parse(specificCached);

    // Fallback to monolithic cache
    const monoCached = localStorage.getItem(this._cacheKey(DB_CACHE_KEY));
    if (monoCached) {
      try {
        const data = JSON.parse(monoCached);
        const tableToKey: any = {
          [TABLES.TICKETS]: 'parkingTickets',
          [TABLES.TRANSACTIONS]: 'transactions',
          [TABLES.TENANTS]: 'tenants',
          [TABLES.USERS]: 'users',
          [TABLES.RESERVATIONS]: 'reservations',
          [TABLES.GALLERY]: 'galleryImages',
          [TABLES.FREQUENT_CUSTOMERS]: 'frequentCustomers',
          [TABLES.AD_SPACES]: 'adSpaces',
          [TABLES.STAFF]: 'staff',
          [TABLES.TASKS]: 'tasks',
          [TABLES.CONFIG]: 'parkingConfig',
          [TABLES.ACCOUNTS]: 'accounts',
          [TABLES.POLICIES]: 'policies',
          [TABLES.COST_CENTERS]: 'costCenters',
          [TABLES.ACCOUNT_BALANCES]: 'accountBalances',
          [TABLES.ACCOUNTING_CONFIG]: 'accountingConfig' // Note: this returns object, not array, but typically getRecords expects array. Special handling might be needed if used for config, but usually config uses specific load.
        };
        const key = tableToKey[tableName];
        if (key && Array.isArray(data[key])) return data[key];
      } catch (e) {
        console.error("Error reading mono cache", e);
      }
    }

    return [];
  },

  async saveParkingPayment(ticket: ParkingTicket, transaction: Transaction) {
    if (!auth.currentUser) throw new Error('Inicia sesión antes de registrar un cobro.');
    const records = JSON.parse(JSON.stringify([
      { table: TABLES.TICKETS, id: ticket.id, record: ticket },
      { table: TABLES.TRANSACTIONS, id: transaction.id, record: transaction }
    ]));
    let synced = false;
    if (navigator.onLine) {
      try {
        const batch = writeBatch(db);
        for (const r of records) batch.set(doc(db, r.table, r.id), r.record, { merge: true });
        await batch.commit();
        synced = true;
      } catch (error: any) {
        if (['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition'].includes(error.code)) throw error;
      }
    }
    const actionId = `payment-${ticket.id}`;
    if (synced) this.removeFromQueue(actionId, TABLES.TICKETS);
    else this.addToQueue({ id: actionId, table: TABLES.TICKETS, action: 'BATCH', data: { records }, timestamp: Date.now() });
    const cached = this._getCache();
    for (const [key, record] of [['parkingTickets', ticket], ['transactions', transaction]] as const) {
      cached[key] = [...(cached[key] || []).filter((r: any) => r.id !== record.id), record];
    }
    this._saveCache(cached);
  },

  async upsertRecord(tableName: string, record: any): Promise<boolean> {
    if (typeof tableName !== 'string' || !tableName || tableName.includes('/') ||
        !record || typeof record.id !== 'string' || !record.id.trim() || record.id === 'undefined' || record.id.includes('/')) {
      throw new Error('No se puede guardar: falta un identificador válido del registro.');
    }
    if (tableName === TABLES.USERS) {
      const saved = await saveUser(record);
      try {
        const cached = this._getCache();
        if (!cached.users) cached.users = [];
        const index = cached.users.findIndex((r: any) => r.id === saved.id);
        if (index >= 0) cached.users[index] = { ...cached.users[index], ...saved };
        else cached.users.push(saved);
        this._saveCache(cached);
      } catch (e) { console.error("Error updating local cache", e); }
      return true;
    }
    if (tableName === TABLES.TENANTS) { const { systemPassword, ...safe } = record; record = safe; }
    if (!auth.currentUser) throw new Error('Inicia sesión antes de guardar cambios.');
    const previousCache = structuredClone(this._getCache());
    const id = record.id;
    const now = new Date().toISOString();
    const finalRecord = { ...record, updated_at: record.updated_at || now };
    
    // Scrub undefined values to prevent Firestore crashes
    Object.keys(finalRecord).forEach(k => finalRecord[k] === undefined && delete finalRecord[k]);
    
    // 1. Update local cache immediately
    try {
      const cached = this._getCache();
      const tableToKey: any = {
        [TABLES.TICKETS]: 'parkingTickets',
        [TABLES.TRANSACTIONS]: 'transactions',
        [TABLES.RESERVATIONS]: 'reservations',
        [TABLES.USERS]: 'users',
        [TABLES.TENANTS]: 'tenants',
        [TABLES.FREQUENT_CUSTOMERS]: 'frequentCustomers',
        [TABLES.STAFF]: 'staff',
        [TABLES.PAYROLL]: 'payroll',
        [TABLES.ATTENDANCE]: 'attendance',
        [TABLES.ACCOUNTS]: 'accounts',
        [TABLES.POLICIES]: 'policies',
        [TABLES.COST_CENTERS]: 'costCenters',
        [TABLES.ACCOUNT_BALANCES]: 'accountBalances',
        [TABLES.ACCOUNTING_CONFIG]: 'accountingConfig',
        // NOTE: previously missing here (present in deleteRecord's map below), which meant
        // ad spaces, gallery images and tasks were sent to Firestore/queue but the LOCAL cache
        // was never updated, so they could disappear from the UI until the next full reload.
        [TABLES.GALLERY]: 'galleryImages',
        [TABLES.AD_SPACES]: 'adSpaces',
        [TABLES.TASKS]: 'tasks'
      };
      const key = tableToKey[tableName];
      if (key) {
        if (!cached[key]) cached[key] = [];
        const index = cached[key].findIndex((r: any) => r.id === id);
        if (index >= 0) cached[key][index] = { ...cached[key][index], ...finalRecord };
        else cached[key].push(finalRecord);
        this._saveCache(cached);
      } else if (tableName === TABLES.CONFIG) {
        // Single-document config table: merge directly instead of treating it as an array.
        cached.parkingConfig = { ...(cached.parkingConfig || {}), ...finalRecord };
        this._saveCache(cached);
      }
    } catch (e) { console.error("Error updating local cache", e); }

    // 2. Try online write
    if (navigator.onLine) {
      try {
        await setDoc(doc(db, tableName, id), finalRecord, { merge: true });
        // Successfully synced, remove from queue just in case it was there
        this.removeFromQueue(id, tableName);
        return true;
      } catch (e: any) {
        if (['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition'].includes(e.code)) {
          this._saveCache(previousCache);
          throw e;
        }
        console.error("Error upserting to Firestore", e);
      }
    }
    
    // 3. Add to queue if offline or if online write failed
    this.addToQueue({ id, table: tableName, action: 'UPSERT', data: finalRecord, timestamp: Date.now() });
    return true;
  },

  async deleteRecord(tableName: string, id: string): Promise<boolean> {
    if (!auth.currentUser) throw new Error('Inicia sesión antes de guardar cambios.');
    if (tableName === TABLES.USERS) throw new Error('Da de baja la cuenta desde Administración.');
    const previousCache = structuredClone(this._getCache());
    // 1. Update local cache immediately
    try {
      const cached = this._getCache();
      const tableToKey: any = {
        [TABLES.TICKETS]: 'parkingTickets',
        [TABLES.TRANSACTIONS]: 'transactions',
        [TABLES.RESERVATIONS]: 'reservations',
        [TABLES.USERS]: 'users',
        [TABLES.TENANTS]: 'tenants',
        [TABLES.FREQUENT_CUSTOMERS]: 'frequentCustomers',
        [TABLES.STAFF]: 'staff',
        [TABLES.PAYROLL]: 'payroll',
        [TABLES.ATTENDANCE]: 'attendance',
        [TABLES.GALLERY]: 'galleryImages',
        [TABLES.AD_SPACES]: 'adSpaces',
        [TABLES.TASKS]: 'tasks',
        [TABLES.ACCOUNTS]: 'accounts',
        [TABLES.POLICIES]: 'policies',
        [TABLES.COST_CENTERS]: 'costCenters',
        [TABLES.ACCOUNT_BALANCES]: 'accountBalances',
        [TABLES.ACCOUNTING_CONFIG]: 'accountingConfig'
      };
      const key = tableToKey[tableName];
      if (key && cached[key]) {
        cached[key] = cached[key].filter((r: any) => {
            const currentId = r.id;
            if ((id === 'undefined' || !id) && (!currentId || currentId === 'undefined')) return false;
            return currentId !== id;
        });
        this._saveCache(cached);
      }
    } catch (e) { console.error("Error updating local cache for delete", e); }

    if (navigator.onLine) {
      try {
        await deleteDoc(doc(db, tableName, id));
        this.removeFromQueue(id, tableName);
        
        // Agregar a lápidas (tombstones) temporalmente para evitar resurrección por consistencia eventual
        this._tombstones.add(id);
        setTimeout(() => this._tombstones.delete(id), 60000); // 1 minuto es suficiente
        
        return true;
      } catch (e: any) {
        if (['permission-denied', 'unauthenticated', 'invalid-argument', 'failed-precondition'].includes(e.code)) {
          this._saveCache(previousCache);
          throw e;
        }
        console.error("Error deleting from Firestore", e);
      }
    }
    this.addToQueue({ id, table: tableName, action: 'DELETE', timestamp: Date.now() });
    return true;
  },

  async getRecordById(tableName: string, id: string) {
    // 1. First check in memory/local cache
    const cached = this._getCache();
    const tableToKey: any = {
      [TABLES.TICKETS]: 'parkingTickets',
      [TABLES.TRANSACTIONS]: 'transactions',
      [TABLES.TENANTS]: 'tenants',
      [TABLES.USERS]: 'users',
      [TABLES.RESERVATIONS]: 'reservations',
      [TABLES.STAFF]: 'staff'
    };
    const key = tableToKey[tableName];
    if (key && Array.isArray(cached[key])) {
      const found = cached[key].find((r: any) => r.id === id);
      if (found) return found;
    }

    // 2. Fetch single document from Firestore if online and not in cache
    if (navigator.onLine) {
      try {
        const docSnap = await getDoc(doc(db, tableName, id));
        if (docSnap.exists()) return docSnap.data();
      } catch (e) {
        console.error(`Error fetching single doc ${tableName}/${id}:`, e);
      }
    }
    return null;
  },

  async diagnoseConnection() {
    const results = {
      internet: navigator.onLine,
      firestore: false,
      quota: true,
      authDomain: true,
      error: ''
    };

    try {
      if (!navigator.onLine) throw new Error("Sin conexión a Internet");
      
      const startTime = Date.now();
      await getDocFromServer(doc(db, TABLES.CONFIG, 'global'));
      results.firestore = true;
      console.log(`Diagnostic: Firestore ping success in ${Date.now() - startTime}ms`);
    } catch (e: any) {
      results.error = e.message || String(e);
      if (e.message?.includes('quota')) results.quota = false;
      if (e.message?.includes('authorized domain') || e.message?.includes('auth/unauthorized-domain')) results.authDomain = false;
      console.error("Diagnostic Result:", results);
    }
    return results;
  },

  async clearCache() {
    if (this.getPendingQueue().length) throw new Error('Sincroniza los cambios pendientes antes de borrar la caché.');
    try {
      console.log("Iniciando limpieza profunda de cache...");
      await terminate(db);
      await clearIndexedDbPersistence(db);
      localStorage.removeItem(this._cacheKey(DB_CACHE_KEY));
      this._memoryCache = null;
      console.log("Cache limpiado con éxito.");
      window.location.reload();
    } catch (e) {
      console.error("Error al limpiar cache:", e);
      localStorage.removeItem(this._cacheKey(DB_CACHE_KEY));
      this._memoryCache = null;
      window.location.reload();
    }
  }
};
