
import { Tenant, Transaction, Reservation, FinancialBreakdown } from '../types';
import { plaza, findSpace, PlazaSpace } from '../config/plaza';

/** Bucket for event income that cannot be matched to a configured space. */
export const UNASSIGNED_SPACE = 'otros';

export const getTransactionCars = (t: Transaction): number => {
    if (t.cars_total !== undefined && t.cars_total !== null) return t.cars_total;
    if (t.cars_charged !== undefined && t.cars_charged !== null) return t.cars_charged;
    const match = t.description.match(/\((\d+)\s+autos\)/);
    if (match) return parseInt(match[1], 10);
    return (t.type === 'PARKING' || t.type === 'HISTORICAL') ? 1 : 0;
};

export const classifyTransaction = (t: Transaction, tenants: Tenant[], reservations: Reservation[], spaces: PlazaSpace[] = plaza.spaces): { category: keyof FinancialBreakdown | string; amount: number; subtype?: Transaction['subtype']; spaceId?: string } => {
    const amount = t.amount_total || t.amount;
    let category = 'other';

    if (t.type === 'EXPENSE' || t.type === 'PAYROLL' || t.type === 'TAX') {
        if (t.type === 'PAYROLL') return { category: 'expense_nomina', amount };
        if (t.type === 'TAX') return { category: 'taxes', amount };

        const sub = t.subtype || 'OTROS_GASTOS';
        if (sub === 'NOMINA') return { category: 'expense_nomina', amount };
        if (sub === 'MANTENIMIENTO' || sub === 'MANTENIMIENTO_MEJORAS') return { category: 'expense_manto', amount };

        // Servicios Básicos
        if (sub === 'LUZ') return { category: 'expense_luz', amount };
        if (sub === 'AGUA') return { category: 'expense_agua', amount };
        if (sub === 'INTERNET' || sub === 'TELEFONO_INTERNET') return { category: 'expense_internet', amount };
        if (sub === 'SERVICIOS_BASICOS' || sub === 'DESPENSA_LIMPIEZA') return { category: 'expense_basic', amount };

        // Servicios Profesionales
        if (sub === 'MARKETING') return { category: 'expense_marketing', amount };
        if (sub === 'CONTABILIDAD') return { category: 'expense_contabilidad', amount };
        if (sub === 'LEGAL') return { category: 'expense_legal', amount };
        if (sub === 'TI') return { category: 'expense_ti', amount };
        if (sub === 'SERVICIOS_PRO') return { category: 'expense_pro', amount };

        if (sub === 'PAPELERIA_OFICINA') return { category: 'expense_other', amount };
        if (sub === 'IMPUESTOS') return { category: 'taxes', amount };

        return { category: 'expense_other', amount };
    }

    // Check for explicit subtype matches FIRST (Manual Classification Override)
    if (t.subtype) {
        if (t.subtype === 'EVENT' || t.spaceId) {
            const space = findSpace(t.spaceId, spaces) || findSpace(t.description, spaces);
            return { category: 'events', amount, spaceId: space?.id || UNASSIGNED_SPACE };
        }
        if (t.subtype === 'LOCAL') return { category: 'local', amount };
        if (t.subtype === 'OFICINA') return { category: 'office', amount };
    }

    if (t.type === 'AD_INCOME') return { category: 'ad_income', amount };
    if (t.type === 'HISTORICAL' || t.type === 'INCOME') {
        if (t.description.toLowerCase().includes('cierre') || t.description.toLowerCase().includes('corte')) {
            return { category: 'parking', amount };
        }
        return { category: 'historical_fund', amount };
    }

    if (t.type === 'PARKING') {
        return { category: 'parking', amount };
    } else if (t.type === 'RENT') {
        // 1. PRIMARY MATCH: tenantId (robust, unambiguous)
        // 2. FALLBACK MATCH: description text (legacy transactions without tenantId)
        const desc = (t.description || '').toLowerCase();
        const matchedTenant = t.tenantId
            ? tenants.find(ten => ten.id === t.tenantId)
            : tenants.find(ten =>
                (ten.localNumber && desc.includes(ten.localNumber.toLowerCase())) ||
                (ten.businessName && desc.includes(ten.businessName.toLowerCase()))
            );
        if (matchedTenant) {
            if (matchedTenant.tenantType === 'OFICINA') category = 'office';
            else if (matchedTenant.tenantType === 'DEPORTIVO') category = 'office';
            else category = 'local';
        } else {
            category = 'local';
        }
    } else if (t.type === 'RESERVATION') {
        // Match the configured space by explicit id, then by the reservation it pays, then by description.
        const desc = t.description || '';
        const cleanDesc = desc.replace('Reserva: ', '').replace('Anticipo Reserva: ', '').replace('Liquidación Reserva: ', '').trim();
        const matchedRes = reservations.find(r =>
            (r.clientName && r.clientName.trim().toLowerCase() === cleanDesc.toLowerCase()) ||
            (r.clientName && desc.toLowerCase().includes(r.clientName.toLowerCase()))
        );
        const space = findSpace(t.spaceId, spaces) || findSpace(matchedRes?.spaceId, spaces) || findSpace(matchedRes?.hallName, spaces) || findSpace(desc, spaces);
        return { category: 'events', amount, subtype: t.subtype, spaceId: space?.id || UNASSIGNED_SPACE };
    }
    return { category: category as keyof FinancialBreakdown, amount, subtype: t.subtype };
};

export const calculateFinancialBreakdown = (
    filteredTransactions: Transaction[],
    tenants: Tenant[],
    reservations: Reservation[],
    spaces: PlazaSpace[] = plaza.spaces
): FinancialBreakdown => {
    const totals: FinancialBreakdown = {
        parking: 0, local: 0, office: 0, events: 0, events_by_space: {},
        ad_income: 0,
        expense_nomina: 0, expense_manto: 0,
        expense_luz: 0, expense_agua: 0, expense_internet: 0,
        expense_marketing: 0, expense_contabilidad: 0, expense_legal: 0, expense_ti: 0,
        expense_pro: 0, expense_basic: 0, expense_other: 0,
        taxes: 0,
        historical_fund: 0,
        audit_discrepancy: 0, parking_memberships: 0, totalCars: 0,
        totalRevenue: 0, totalExpense: 0, realParking: 0, realGeneralIncome: 0, totalNeto: 0
    };

    let totalAuditDeclared = 0;
    let auditCount = 0;

    filteredTransactions.forEach(t => {
        if (t.type === 'PARKING') totals.totalCars += getTransactionCars(t);
        if (t.type === 'AUDIT') {
            totals.audit_discrepancy += (t.audit_difference || 0);
            const declared = t.audit_declared_amount !== undefined ? t.audit_declared_amount : Math.abs(Number(t.amount || 0));
            totalAuditDeclared += declared;
            auditCount++;
        }

        const descLower = (t.description || '').toLowerCase();
        const isMembership = t.parkingType === 'PENSION' || t.paymentMethod === 'MEMBRESIA' || t.subtype === 'PENSION' || descLower.includes('pensi') || descLower.includes('membres');
        if (isMembership && (t.type === 'PARKING' || t.type === 'INCOME' || t.type === 'OTHER')) {
            totals.parking_memberships += Math.abs(t.amount || 0);
        }

        const { category, amount, spaceId } = classifyTransaction(t, tenants, reservations, spaces);

        if (category === 'events') {
            const key = spaceId || UNASSIGNED_SPACE;
            totals.events += Math.abs(amount);
            totals.events_by_space[key] = (totals.events_by_space[key] || 0) + Math.abs(amount);
        } else if (category === 'ad_income') {
            totals.ad_income += amount;
        } else if (category === 'taxes') {
            totals.taxes += amount;
        } else if (category === 'historical_fund') {
            totals.historical_fund += amount;
        } else if (category in totals) {
            (totals as any)[category] += Math.abs(amount);
        }
    });

    const totalExpense = totals.expense_nomina + totals.expense_manto +
        totals.expense_luz + totals.expense_agua + totals.expense_internet +
        totals.expense_marketing + totals.expense_contabilidad + totals.expense_legal + totals.expense_ti +
        totals.expense_pro + totals.expense_basic + totals.expense_other;
    const totalIncome = totals.parking + totals.local + totals.office + totals.events + totals.ad_income + totals.historical_fund;

    // Ingreso Real Parking: Lo declarado en arqueos de estacionamiento (+ tickets abiertos sin auditar)
    const openUnauditedParking = filteredTransactions.filter(t => t.type === 'PARKING' && !t.is_closed).reduce((sum, t) => sum + (t.amount || 0), 0);
    const realParking = auditCount > 0 ? (totalAuditDeclared + openUnauditedParking) : totals.parking;
    
    // Arqueo: Diferencia entre Ingreso Real Parking e Ingreso Parking (Sistema)
    const audit_discrepancy = realParking - totals.parking;

    const otherIncome = totals.local + totals.office + totals.events + totals.ad_income + totals.historical_fund;
    const realGeneralIncome = realParking + otherIncome;
    // Total Neto: Ingresos Totales Generales Brutos menos Gastos Totales Generales
    const totalNeto = totalIncome - totalExpense;

    return {
        ...totals,
        audit_discrepancy,
        totalRevenue: totalIncome,
        totalExpense,
        realParking,
        realGeneralIncome,
        totalNeto
    };
};
