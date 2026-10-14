export interface LedgerAccount {
    code: string;            // Código de cuenta (ej. "102.01.001")
    name: string;            // Nombre de la cuenta (ej. "Banamex Cuenta Ahorro")
    level: number;           // Nivel jerárquico (1: Mayor, 2: Subcuenta, 3...)
    parentCode?: string;     // Código de la cuenta padre (ej. "102.01")
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE' | 'MEMO';
    nature: 'DEBIT' | 'CREDIT';
    satGroupCode: string;    // Código Agrupador del SAT (ej. "102.01")
    isActive: boolean;
    isSubaccount: boolean;   // Si recibe asientos contables directamente
    costCenterRequired?: boolean;
}

export type PolicyType = 'INGRESOS' | 'EGRESOS' | 'DIARIO';
export type PolicyStatus = 'POSTED' | 'DRAFT' | 'CANCELLED';

export interface CFDIMetadata {
    uuid: string;            // Folio Fiscal Universal (36 chars)
    rfcIssuer: string;
    rfcReceiver: string;
    nameIssuer: string;
    total: number;
    date: string;
    xmlUrl?: string;         // Link a Firebase Storage del XML
    pdfUrl?: string;         // Link opcional al PDF
}

export interface PolicyLine {
    lineNumber: number;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    concept?: string;
    costCenterId?: string;
    reference?: string;
}

export interface Policy {
    id: string;              // "POL-YEAR-MONTH-TYPE-FOLIO"
    fiscalPeriod: string;    // "YYYY-MM" (ej. "2026-06")
    policyType: PolicyType;
    folio: number;           // Consecutivo por tipo y periodo
    date: string;            // "YYYY-MM-DD"
    concept: string;
    status: PolicyStatus;
    totalDebit: number;
    totalCredit: number;
    created_at: string;
    updated_at: string;
    registeredBy: string;
    cancelledBy?: string;
    cancelledAt?: string;
    cancellationReason?: string;
    lines: PolicyLine[];
    cfdis?: CFDIMetadata[];
}

export interface AccountBalance {
    id: string;              // "ACCOUNTCODE-YEAR-MONTH"
    accountCode: string;
    fiscalPeriod: string;    // "YYYY-MM"
    initialBalance: number;
    debits: number;
    credits: number;
    endingBalance: number;
    updatedAt: string;
}

export interface FiscalPeriodState {
    id: string;              // "YYYY-MM"
    status: 'OPEN' | 'LOCKED';
    lockedAt?: string;
    lockedBy?: string;
}

export interface CostCenter {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
}

// Catálogo base SAT preestablecido para inicialización
export const INITIAL_SAT_CATALOG: LedgerAccount[] = [
    // ACTIVOS (100)
    { code: '100', name: 'Activo', level: 1, type: 'ASSET', nature: 'DEBIT', satGroupCode: '100', isActive: true, isSubaccount: false },
    { code: '101', name: 'Caja General', level: 2, parentCode: '100', type: 'ASSET', nature: 'DEBIT', satGroupCode: '101.01', isActive: true, isSubaccount: true },
    { code: '102', name: 'Bancos Nacionales', level: 2, parentCode: '100', type: 'ASSET', nature: 'DEBIT', satGroupCode: '102.01', isActive: true, isSubaccount: true },
    { code: '105', name: 'Clientes Nacionales', level: 2, parentCode: '100', type: 'ASSET', nature: 'DEBIT', satGroupCode: '105.01', isActive: true, isSubaccount: true },
    
    // PASIVOS (200)
    { code: '200', name: 'Pasivo', level: 1, type: 'LIABILITY', nature: 'CREDIT', satGroupCode: '200', isActive: true, isSubaccount: false },
    { code: '201', name: 'Proveedores Nacionales', level: 2, parentCode: '200', type: 'LIABILITY', nature: 'CREDIT', satGroupCode: '201.01', isActive: true, isSubaccount: true },
    { code: '210', name: 'Impuestos Trasladados Cobrados (IVA)', level: 2, parentCode: '200', type: 'LIABILITY', nature: 'CREDIT', satGroupCode: '210.01', isActive: true, isSubaccount: true },

    // CAPITAL (300)
    { code: '300', name: 'Capital Contable', level: 1, type: 'EQUITY', nature: 'CREDIT', satGroupCode: '300', isActive: true, isSubaccount: false },
    { code: '301', name: 'Capital Social', level: 2, parentCode: '300', type: 'EQUITY', nature: 'CREDIT', satGroupCode: '301.01', isActive: true, isSubaccount: true },
    { code: '304', name: 'Utilidad o Pérdida de Ejercicios Anteriores', level: 2, parentCode: '300', type: 'EQUITY', nature: 'CREDIT', satGroupCode: '304.01', isActive: true, isSubaccount: true },

    // INGRESOS (400)
    { code: '400', name: 'Ingresos', level: 1, type: 'INCOME', nature: 'CREDIT', satGroupCode: '400', isActive: true, isSubaccount: false },
    { code: '401', name: 'Ventas y/o Servicios Gravados', level: 2, parentCode: '400', type: 'INCOME', nature: 'CREDIT', satGroupCode: '401.01', isActive: true, isSubaccount: true },
    { code: '402', name: 'Ingresos por Arrendamiento', level: 2, parentCode: '400', type: 'INCOME', nature: 'CREDIT', satGroupCode: '401.04', isActive: true, isSubaccount: true },

    // EGRESOS / GASTOS (600)
    { code: '600', name: 'Egresos y Gastos', level: 1, type: 'EXPENSE', nature: 'DEBIT', satGroupCode: '600', isActive: true, isSubaccount: false },
    { code: '601', name: 'Sueldos y Salarios', level: 2, parentCode: '600', type: 'EXPENSE', nature: 'DEBIT', satGroupCode: '601.01', isActive: true, isSubaccount: true },
    { code: '602', name: 'Arrendamientos de Oficinas/Locales', level: 2, parentCode: '600', type: 'EXPENSE', nature: 'DEBIT', satGroupCode: '601.03', isActive: true, isSubaccount: true },
    { code: '603', name: 'Mantenimiento y Conservación', level: 2, parentCode: '600', type: 'EXPENSE', nature: 'DEBIT', satGroupCode: '601.48', isActive: true, isSubaccount: true },
    { code: '609', name: 'Otros Gastos Generales', level: 2, parentCode: '600', type: 'EXPENSE', nature: 'DEBIT', satGroupCode: '601.84', isActive: true, isSubaccount: true }
];
