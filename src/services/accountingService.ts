import { Transaction } from '../types';
import { LedgerAccount, Policy, PolicyLine, INITIAL_SAT_CATALOG } from '../types/accounting';

export const accountingService = {
    /**
     * Obtiene el nombre de una cuenta buscando en el catálogo activo (o catálogo base)
     */
    getAccountName(code: string, catalog: LedgerAccount[]): string {
        const activeCatalog = catalog.length > 0 ? catalog : INITIAL_SAT_CATALOG;
        return activeCatalog.find(a => a.code === code)?.name || 'Cuenta Desconocida';
    },

    /**
     * Mapea una transacción de negocio a asientos de partida doble (Cargos y Abonos)
     * basándose en reglas preestablecidas y catálogos de cuentas.
     */
    mapToPolicyLines(tx: Transaction, catalog: LedgerAccount[]): PolicyLine[] {
        const activeCatalog = catalog.length > 0 ? catalog : INITIAL_SAT_CATALOG;
        const amount = Math.abs(Number(tx.amount || 0));

        // Cuentas por defecto
        let debitAcc = '101'; // Caja General
        let creditAcc = '401'; // Ventas

        // Si es pago electrónico (Tarjeta/Transferencia), usamos Bancos
        if (tx.paymentMethod === 'MERCADO_PAGO' || tx.paymentMethod === 'MEMBRESIA') {
            debitAcc = '102'; // Bancos
        }

        // Renta utiliza su cuenta específica de ingresos
        if (tx.type === 'RENT') {
            creditAcc = '402'; // Ingresos por Arrendamiento
        }

        const isIncome = ['INCOME', 'RENT', 'PARKING', 'RESERVATION', 'AD_INCOME', 'HISTORICAL'].includes(tx.type) && Number(tx.amount) >= 0;

        if (!isIncome) {
            // Egresos / Gastos
            let expenseAcc = '609'; // Otros Gastos Generales
            if (tx.subtype === 'NOMINA') expenseAcc = '601';
            if (tx.subtype === 'MANTENIMIENTO' || tx.subtype === 'MANTENIMIENTO_MEJORAS') expenseAcc = '603';
            if (tx.subtype === 'LUZ' || tx.subtype === 'AGUA' || tx.subtype === 'INTERNET') expenseAcc = '602';

            return [
                { lineNumber: 1, accountCode: expenseAcc, accountName: this.getAccountName(expenseAcc, activeCatalog), debit: amount, credit: 0, concept: tx.description },
                { lineNumber: 2, accountCode: debitAcc, accountName: this.getAccountName(debitAcc, activeCatalog), debit: 0, credit: amount, concept: tx.description }
            ];
        }

        // Ingresos
        return [
            { lineNumber: 1, accountCode: debitAcc, accountName: this.getAccountName(debitAcc, activeCatalog), debit: amount, credit: 0, concept: tx.description },
            { lineNumber: 2, accountCode: creditAcc, accountName: this.getAccountName(creditAcc, activeCatalog), debit: 0, credit: amount, concept: tx.description }
        ];
    },

    /**
     * Convierte una transacción clásica del sistema a formato Póliza para unificar procesamiento
     */
    transactionToPolicy(tx: Transaction, catalog: LedgerAccount[]): Policy {
        const lines = tx.accountingLines && tx.accountingLines.length > 0 
            ? tx.accountingLines.map((l, i) => ({
                lineNumber: i + 1,
                accountCode: l.accountCode,
                accountName: l.accountName,
                debit: l.debit || 0,
                credit: l.credit || 0,
                concept: tx.description
            }))
            : this.mapToPolicyLines(tx, catalog);

        const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

        return {
            id: `POL-${tx.id}`,
            fiscalPeriod: tx.date.slice(0, 7),
            policyType: tx.type === 'JOURNAL_ENTRY' ? 'DIARIO' : (tx.amount < 0 ? 'EGRESOS' : 'INGRESOS'),
            folio: 1, // Folio temporal para unificación
            date: tx.date,
            concept: tx.description,
            status: tx.status === 'cancelled' ? 'CANCELLED' : 'POSTED',
            totalDebit,
            totalCredit,
            created_at: tx.created_at || new Date().toISOString(),
            updated_at: tx.created_at || new Date().toISOString(),
            registeredBy: tx.registeredBy || 'SISTEMA',
            lines
        };
    },

    /**
     * Genera la Balanza de Comprobación consolidando Pólizas y Transacciones operativas de un rango de fechas.
     */
    generateTrialBalance(
        policies: Policy[],
        operationalTransactions: Transaction[],
        catalog: LedgerAccount[],
        startDate: string,
        endDate: string
    ) {
        const activeCatalog = catalog.length > 0 ? catalog : INITIAL_SAT_CATALOG;
        const balances: Record<string, { initial: number; debits: number; credits: number; final: number }> = {};

        // Inicializar todas las cuentas
        activeCatalog.forEach(acc => {
            balances[acc.code] = { initial: 0, debits: 0, credits: 0, final: 0 };
        });

        // Unificar origen de datos: Pólizas directas + Transacciones mapeadas
        const allPolicies: Policy[] = [...policies];
        
        operationalTransactions.forEach(tx => {
            // Evitar duplicar transacciones que ya tengan su póliza registrada en la lista
            if (!policies.some(p => p.id === `POL-${tx.id}` || p.id === tx.id)) {
                allPolicies.push(this.transactionToPolicy(tx, activeCatalog));
            }
        });

        // Filtrar pólizas del rango de fechas y activas (no canceladas)
        const activePolicies = allPolicies.filter(p => p.date >= startDate && p.date <= endDate && p.status === 'POSTED');

        // Acumular Cargos y Abonos
        activePolicies.forEach(policy => {
            policy.lines.forEach(line => {
                const code = line.accountCode;
                // Si la cuenta no está inicializada (cuenta dinámica nueva), inicializarla
                if (!balances[code]) {
                    balances[code] = { initial: 0, debits: 0, credits: 0, final: 0 };
                }
                balances[code].debits += Number(line.debit || 0);
                balances[code].credits += Number(line.credit || 0);
            });
        });

        // Calcular Saldo Final basado en la naturaleza
        Object.keys(balances).forEach(code => {
            const acc = activeCatalog.find(a => a.code === code);
            const b = balances[code];
            const nature = acc?.nature || 'DEBIT';

            if (nature === 'DEBIT') {
                b.final = b.initial + b.debits - b.credits;
            } else {
                b.final = b.initial - b.debits + b.credits;
            }
        });

        return balances;
    },

    /**
     * Genera el archivo XML compatible con los requerimientos del SAT de México
     * para la Contabilidad Electrónica (Balanza de Comprobación).
     */
    exportTrialBalanceToSATXML(
        rfc: string,
        year: number,
        month: number,
        trialBalance: Record<string, { initial: number; debits: number; credits: number; final: number }>,
        catalog: LedgerAccount[]
    ): string {
        const activeCatalog = catalog.length > 0 ? catalog : INITIAL_SAT_CATALOG;
        const formattedMonth = month.toString().padStart(2, '0');
        
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<BCE:Balanza \n`;
        xml += `  xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" \n`;
        xml += `  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" \n`;
        xml += `  xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd" \n`;
        xml += `  Version="1.3" \n`;
        xml += `  RFC="${rfc || 'XAXX010101000'}" \n`;
        xml += `  Mes="${formattedMonth}" \n`;
        xml += `  Anio="${year}" \n`;
        xml += `  TipoEnvio="N">\n`;

        // Añadir detalle de cuentas con movimientos o con saldo inicial/final
        Object.entries(trialBalance).forEach(([code, b]) => {
            const acc = activeCatalog.find(a => a.code === code);
            if (!acc) return;

            // En el XML del SAT solo se deben enviar las cuentas que tengan movimientos o saldos distintos de cero
            if (b.initial === 0 && b.debits === 0 && b.credits === 0 && b.final === 0) {
                return;
            }

            xml += `  <BCE:Detalle \n`;
            xml += `    NumCta="${code}" \n`;
            xml += `    SaldoIni="${b.initial.toFixed(2)}" \n`;
            xml += `    Debe="${b.debits.toFixed(2)}" \n`;
            xml += `    Haber="${b.credits.toFixed(2)}" \n`;
            xml += `    SaldoFin="${b.final.toFixed(2)}" />\n`;
        });

        xml += `</BCE:Balanza>`;
        return xml;
    }
};
