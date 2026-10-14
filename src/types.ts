
export enum UserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  TENANT = 'TENANT',
  PARKING_STAFF = 'PARKING_STAFF',
  STAFF = 'STAFF'
}

export type PaymentMethod = 'CASH' | 'MERCADO_PAGO' | 'MEMBRESIA' | 'CARD';
export type ParkingType = 'NORMAL' | 'VISITA' | 'PENSION' | 'CLIENTE_FRECUENTE' | 'MAESTRO' | 'ALUMNO' | 'INAPAM' | 'LOCATARIO';
/** SELLO = stamped by a tenant; CONVENIO = partner-business agreement (see plaza.config → parking.partnerConvention). */
export type ConventionType = 'NONE' | 'SELLO' | 'CONVENIO';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  tenantId?: string;
  name?: string;
  active?: boolean;
  permissions?: string[];
  password?: string; // Optional, mainly for creation/update
}

export interface LoginUser extends User {
  password: string;
}

export interface Tenant {
  id: string;
  name: string;
  businessName: string;
  localNumber: string;
  rentAmount: number;
  maintenanceFee?: number;
  paymentDay: number;
  email: string;
  status: 'active' | 'late' | 'vacant';
  lastPaymentDate?: string;
  contractUrl?: string;
  tenantType?: 'LOCAL' | 'OFICINA' | 'DEPORTIVO';
  serviceFee?: number; // Cargo fijo por servicios (agua, luz, etc.)

  // Nuevos campos
  dimensions?: string; // Medidas
  location?: string; // Ubicación exacta
  leasePeriod?: string; // Periodo de renta (ej: 1 año)
  lesseeName?: string; // Nombre Arrendatario (Responsable)
  lesseePhone?: string; // Teléfono para whatsapps
  waterFee?: number; // Agua específica
  lightFee?: number; // Luz específica
  internetFee?: number; // Internet específico

  // Nuevos campos del contrato
  contractSignerName?: string;     // Nombre o nombres de quien celebra el contrato
  contractStartDate?: string;      // Fecha de inicio del contrato
  contractSignDate?: string;       // Fecha de firma del contrato
  contractEndDate?: string;        // Fecha de terminación del contrato
  contractType?: 'nuevo' | 'renovado'; // Nuevo contrato o renovado
  contractObject?: string;         // Objeto del contrato (Modelo de negocio)
  ineVoterKey?: string;            // Copia de INE (clave de elector)
  rfc?: string;                    // RFC
  lesseeAddress?: string;          // Domicilio del arrendatario
  m2Value?: number;                // Valor del m2
  rentedM2?: number;               // M2 arrendados
  rentedPlanUrl?: string;          // Plano arrendado (PDF/Imagen)
  electricServiceNumber?: string;  // Número de servicio eléctrico
  parkingServiceDetails?: string;  // Contratación de servicios de estacionamiento (membresía)
  advertisingServiceDetails?: string; // Contratación de servicios de publicidad (espacio, monto, etc.)
  billingDetails?: string;         // Facturación
  systemUser?: string;             // Usuario de sistema
  systemPassword?: string;         // Contraseña de sistema
  cellPhone?: string;              // Teléfono celular
  remissionNotes?: string;         // Notas de remisión (proyecto de inversión)
  otherData?: string;              // Otros datos
  depositAmount?: number;          // Monto por concepto de depósito
}

export interface FrequentCustomer {
  id: string;
  name: string;
  plate: string;
  monthlyFee: number;
  lastPaymentDate: string;
  nextPaymentDate: string;
  category?: string;
  phone?: string;
  active: boolean;
  notes?: string;
}

export interface Transaction {
  id: string;
  type: 'RENT' | 'PARKING' | 'RESERVATION' | 'EXPENSE' | 'HISTORICAL' | 'OTHER' | 'AUDIT' | 'INCOME' | 'AD_INCOME' | 'TAX' | 'PAYROLL' | 'DEBT' | 'VISIT' | 'JOURNAL_ENTRY';
  subtype?: 'PENSION' | 'RENT' | 'EXTRA' | 'COURTESY' | 'LOST_TICKET' | 'UNPAID' | 'NIGHT_RECHARGE' | 'OTHER' | 'OTROS_GASTOS' | 'LOCAL' | 'OFICINA' | 'EVENT' | 'NOMINA' | 'MANTENIMIENTO' | 'MANTENIMIENTO_MEJORAS' | 'PAPELERIA_OFICINA' | 'TELEFONO_INTERNET' | 'DESPENSA_LIMPIEZA' | 'SERVICIOS_PRO' | 'SERVICIOS_BASICOS' | 'AD_SPACE' | 'TAXES' | 'FEES' | 'ADJUSTMENT' | 'LUZ' | 'AGUA' | 'INTERNET' | 'MARKETING' | 'CONTABILIDAD' | 'LEGAL' | 'TI' | 'IMPUESTOS';
  amount: number;
  date: string;
  description: string;
  status: 'completed' | 'pending' | 'cancelled';
  paymentMethod?: PaymentMethod | 'MIXED';
  parkingType?: ParkingType;
  registeredBy?: string;
  shift?: string;
  day_name?: string;
  cars_charged?: number;
  cars_no_amount?: number;
  courtesies?: number;
  cars_total?: number;
  amount_total?: number;
  is_closed?: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  receiptUrl?: string;

  cars_normal?: number;
  amount_normal?: number;
  cars_locatario?: number;
  amount_locatario?: number;
  amount_memberships?: number;

  audit_declared_amount?: number;
  audit_system_amount?: number;
  audit_difference?: number;
  ticketId?: string; // Parking Ticket Link
  accountingLines?: { accountCode: string, accountName: string, debit: number, credit: number }[];
  tenantId?: string; // Link to Tenant ID (for RENT/DEBT transactions)
  tenantBusinessName?: string; // Cache of business name
  /** Configured space (plaza.config → spaces[].id) a RESERVATION payment belongs to. */
  spaceId?: string;
  posFolio?: string;
  posSyncStatus?: 'pending' | 'success' | 'error';
  posSyncMessage?: string;
  posOrderResponse?: any;
  adSpaceId?: string;
}

export interface AdSpace {
  id: string;
  name: string;
  location: string;
  dimensions: string; // Medidas
  amount: number; // Renta por periodo
  status: 'available' | 'rented' | 'expired';
  lesseeName?: string;
  lesseePhone?: string;
  contractUrl?: string;
  paymentStatus?: 'paid' | 'pending' | 'late';
  startDate?: string;       // Inicio contrato
  endDate?: string;         // Fin contrato
  rentalPeriod?: string;    // "3 meses", "6 meses", "1 año"
  nextPaymentDate?: string; // Próxima fecha de pago (renta recurrente)
  notes?: string;
}

export interface Staff {
  id: string;
  name: string;
  role: string; // Puesto
  weeklySalary: number; // Sueldo semanal
  hireDate: string;
  schedule: string; // Horario
  formal: boolean; // IMSS/Formal vs Informal
  active: boolean;
  phone?: string;
  notes?: string;
  paymentFrequency?: 'weekly' | 'biweekly' | 'monthly';
}

export interface AttendanceRecord {
  id: string;
  staffId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'justified';
  notes?: string;
}

export interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  periodStart: string;  // Lunes
  periodEnd: string;    // Domingo
  baseSalary: number;
  deductions: number;
  bonus: number;
  totalPaid: number;
  paidAt: string;       // ISO timestamp
  transactionId: string; // Link a EXPENSE txn
  formal: boolean;
}

export interface Task {
  id: string;
  description: string;
  assignedTo: string; // Admin username usually
  createdBy: string; // Owner
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  category?: 'ADMIN' | 'MARKETING' | 'WEB' | 'LEGAL' | 'CONTABILIDAD' | 'otro';
  dueDate?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  completionNote?: string;
}

export interface TaxRecord {
  id: string;
  concept: string; // ISR, IVA, Predial...
  amount: number;
  frequency: 'monthly' | 'bimonthly' | 'annual';
  nextDueDate: string;
  paidBy: string; // Quien lo paga (Contador, Admin...)
}

export interface ParkingConfig {
  hourlyRate: number;
  freeMinutes: number;
  dailyMax: number;
  selloDiscount: number;
  logoUrl?: string;
  plazaName?: string;
  footerMessage?: string; // Leyenda personalizada al pie de tickets/recibos impresos
  // Overrides for the POS adapter (defaults come from plaza.config → pos)
  posTerminalId?: string;
  posBranchId?: string;
}

export interface ParkingTicket {
  id: string;
  entryTime: string;
  plate: string;
  status: 'active' | 'paid' | 'unpaid' | 'archived';
  type: ParkingType;
  convention: ConventionType;
  registeredBy?: string;
  stamped_by_local?: string;
  paymentTime?: string;
  paymentAmount?: number;
  paymentMethod?: PaymentMethod;
  updated_at?: string;
  clientName?: string;
  notes?: string;
}

export interface Reservation {
  id: string;
  /** Configured space id (plaza.config → spaces[].id). */
  spaceId?: string;
  /** Display name of the space at booking time. */
  hallName: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  status: 'confirmed' | 'pending' | 'cancellation_requested';
  cancellationReason?: string;

  totalAmount?: number;
  advancePayment?: number;
}

export interface GalleryImage {
  id: string;
  category: string;
  url: string;
  base64?: string; // Nuevo campo para redundancia de imagen
  title: string;
  isPrimary?: boolean;
  order?: number;
  created_at?: string;
}

export interface FinancialBreakdown {
  parking: number;
  local: number;
  office: number;
  /** Income from all bookable spaces (halls, terraces, coworking…). */
  events: number;
  /** Event income per configured space id (plaza.config → spaces); unmatched goes to "otros". */
  events_by_space: Record<string, number>;
  ad_income: number;
  expense_nomina: number;
  expense_manto: number;
  expense_luz: number;
  expense_agua: number;
  expense_internet: number;
  expense_marketing: number;
  expense_contabilidad: number;
  expense_legal: number;
  expense_ti: number;
  expense_pro: number;
  expense_basic: number;
  expense_other: number;
  taxes: number;
  historical_fund: number;
  audit_discrepancy: number;
  parking_memberships: number;
  totalCars: number;

  // Calculated fields
  totalRevenue: number;
  totalExpense: number;
  realParking: number;
  realGeneralIncome: number;
  totalNeto: number;
}
