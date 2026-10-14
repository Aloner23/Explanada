
import { Tenant, Transaction } from '../types';

export interface DebtSummary {
    totalDebt: number;
    monthlyFee: number;
    monthsOverdue: number;
    status: 'none' | 'pending' | 'late';
    rentDebt: number;
    explicitDebt: number;
    paymentsSinceBaseline: number;
    lastPayment?: Transaction;
    baselineDate: string;
}

export const getTenantTransactions = (tenant: Tenant, transactions: Transaction[]): Transaction[] => {
    return transactions.filter(t => {
        // 1. PRIMARY MATCH: tenantId (New, robust way)
        if (t.tenantId === tenant.id) return true;

        // If it has a different tenantId, it's definitely not for this tenant
        if (t.tenantId && t.tenantId !== tenant.id) return false;

        // 2. FALLBACK MATCH: description string matching (Legacy, for backward compatibility)
        const businessName = tenant.businessName.toLowerCase();
        const localNumber = tenant.localNumber?.toLowerCase();
        const desc = (t.description || '').toLowerCase();
        
        // Match by Business Name (only if sufficiently long or precise)
        if (businessName && businessName.length >= 3 && desc.includes(businessName)) return true;
        
        // Match by Local Number (e.g. "Local 1" or just "1") with precise word boundaries
        if (localNumber) {
            const regex = new RegExp(`\\blocal\\s*[:\\-]?\\s*${localNumber}\\b`, 'i');
            if (regex.test(desc)) {
                return true;
            }
        }

        return false;
    });
};

export const calculateTenantDebt = (tenant: Tenant, transactions: Transaction[]): DebtSummary => {
    if (tenant.status === 'vacant') {
        return { totalDebt: 0, monthlyFee: 0, monthsOverdue: 0, status: 'none', rentDebt: 0, explicitDebt: 0, paymentsSinceBaseline: 0, baselineDate: '' };
    }

    const monthlyFee = Number(tenant.rentAmount || 0) +
        Number(tenant.maintenanceFee || 0) +
        Number(tenant.serviceFee || 0) +
        Number(tenant.waterFee || 0) +
        Number(tenant.lightFee || 0) +
        Number(tenant.internetFee || 0);

    const tenantTxs = getTenantTransactions(tenant, transactions);

    const today = new Date();
    // lastPaymentDate is the "baseline" - the date from which we start counting debt
    // It represents the last month that was fully paid (the "corte")
    const baselineDate = tenant.lastPaymentDate
        ? new Date(`${tenant.lastPaymentDate}T00:00:00`)
        : new Date(today.getFullYear(), today.getMonth(), 1);

    const baselineDateStr = tenant.lastPaymentDate || `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-01`;

    const baselineMonth = new Date(baselineDate.getFullYear(), baselineDate.getMonth(), 1);
    const monthsInWindow = (today.getFullYear() - baselineMonth.getFullYear()) * 12 + (today.getMonth() - baselineMonth.getMonth());
    const baselineMonthStr = `${baselineMonth.getFullYear()}-${(baselineMonth.getMonth() + 1).toString().padStart(2, '0')}-01`;

    // 1. Expected Rent in this window
    const rentExpected = Math.max(0, monthsInWindow) * monthlyFee;

    // 2. Manual debts (Adjustments, surcharges, etc.) still within the current unpaid window.
    // IMPORTANT: filtered by baselineMonthStr, same as payments below. Once the baseline advances
    // (i.e. the tenant reaches $0 debt and a full payment is recorded), any DEBT record from before
    // that point is considered settled and must NOT be added back on every future recalculation —
    // otherwise a debt that was already paid off resurfaces as unpaid debt forever.
    const explicitDebt = tenantTxs
        .filter(t => t.type === 'DEBT' && t.date >= baselineMonthStr)
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    // 3. Payments made AFTER or ON the baseline month
    // This includes RENT, INCOME, and OTHER type payments
    const paymentsSinceBaseline = tenantTxs
        .filter(t => (t.type === 'RENT' || t.type === 'INCOME' || t.type === 'OTHER') && t.date >= baselineMonthStr)
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalDebt = Math.max(0, Math.round((rentExpected + explicitDebt - paymentsSinceBaseline) * 100) / 100);

    let status: 'none' | 'pending' | 'late' = 'none';
    if (totalDebt > 1) {
        const pastGracePeriod = today.getDate() > (tenant.paymentDay || 10);
        if (totalDebt > (monthlyFee + 1) || pastGracePeriod) {
            status = 'late';
        } else {
            status = 'pending';
        }
    }

    return {
        totalDebt,
        monthlyFee,
        monthsOverdue: monthsInWindow,
        status,
        rentDebt: rentExpected,
        explicitDebt,
        paymentsSinceBaseline,
        lastPayment: tenantTxs.filter(t => t.type === 'RENT').sort((a, b) => b.date.localeCompare(a.date))[0],
        baselineDate: baselineDateStr
    };
};
