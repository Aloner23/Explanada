import { ParkingConfig, ParkingTicket, ParkingType } from '../types';

/**
 * Tariff rules that vary per plaza. Defaults reproduce the reference tariff;
 * the booth passes `plaza.parking` from plaza.config. Kept import-free so the
 * function stays pure and testable.
 */
export interface TariffRules {
    tenantRateDiscount: number;
    firstHourGraceMinutes: number;
    excessGraceMinutes: number;
    excessFee: number;
    frequentCustomerExtraMinutes: number;
    partnerFreeHours: number;
    freeTypes: ParkingType[];
}

export const DEFAULT_TARIFF_RULES: TariffRules = {
    tenantRateDiscount: 5,
    firstHourGraceMinutes: 15,
    excessGraceMinutes: 15,
    excessFee: 5,
    frequentCustomerExtraMinutes: 15,
    partnerFreeHours: 3,
    freeTypes: ['PENSION', 'MAESTRO', 'ALUMNO', 'INAPAM', 'VISITA'],
};

/** Charges `rate` per hour with a grace period after the first hour and a small excess fee after the second. */
function hourlyCharge(diffMins: number, rate: number, rules: TariffRules): number {
    if (diffMins <= 60 + rules.firstHourGraceMinutes) return rate;
    if (diffMins <= 120) return rate * 2;
    const hoursPassed = Math.floor(diffMins / 60);
    const minutesExcess = diffMins % 60;
    return minutesExcess <= rules.excessGraceMinutes ? hoursPassed * rate + rules.excessFee : (hoursPassed + 1) * rate;
}

export const calculateParkingCost = (
    ticket: ParkingTicket,
    config: ParkingConfig,
    exitTime: Date = new Date(),
    overrides: Partial<TariffRules> = {}
) => {
    const rules: TariffRules = { ...DEFAULT_TARIFF_RULES, ...overrides };
    if (!ticket || !ticket.entryTime) {
        return { amount: 0, duration: 0, discounted: 0 };
    }
    const entry = new Date(ticket.entryTime);
    if (isNaN(entry.getTime())) {
        return { amount: 0, duration: 0, discounted: 0 };
    }
    const diffMs = exitTime.getTime() - entry.getTime();
    if (diffMs <= 0) {
        return { amount: 0, duration: 0, discounted: 0 };
    }
    const diffMins = Math.floor(diffMs / 60000);

    // 1. Tolerancia global de entrada
    if (diffMins <= config.freeMinutes) {
        return { amount: 0, duration: diffMins, discounted: 0 };
    }

    // 2. Tipos sin costo (pensión, visitas y convenios configurados)
    if (rules.freeTypes.includes(ticket.type)) {
        return { amount: 0, duration: diffMins, discounted: 0 };
    }

    // Cliente frecuente: tolerancia extra sobre la normal
    if (ticket.type === 'CLIENTE_FRECUENTE' && diffMins <= (config.freeMinutes + rules.frequentCustomerExtraMinutes)) {
        return { amount: 0, duration: diffMins, discounted: 0 };
    }

    const standardCost = (rate: number) => Math.ceil(diffMins / 60) * rate;

    // 3. Tarifa preferencial para locatarios
    if (ticket.type === 'LOCATARIO') {
        const rate = Math.max(0, config.hourlyRate - rules.tenantRateDiscount);
        const totalAmount = Math.min(hourlyCharge(diffMins, rate, rules), config.dailyMax);
        return { amount: totalAmount, duration: diffMins, discounted: Math.max(0, standardCost(config.hourlyRate) - totalAmount) };
    }

    // 4. Convenio con comercio aliado: las primeras N horas sin costo
    if (ticket.convention === 'CONVENIO') {
        const rate = config.hourlyRate;
        const hours = Math.ceil(diffMins / 60);
        const total = Math.max(0, hours - rules.partnerFreeHours) * rate;
        return { amount: total, duration: diffMins, discounted: (hours * rate) - total };
    }

    // 5. Tarifa normal con tope diario
    const rate = config.hourlyRate;
    const totalAmount = Math.min(hourlyCharge(diffMins, rate, rules), config.dailyMax);
    return { amount: totalAmount, duration: diffMins, discounted: Math.max(0, standardCost(rate) - totalAmount) };
};

export const generateTicketId = () => {
    return crypto.randomUUID().toUpperCase();
};

export const getCurrentShift = () => {
    const hr = new Date().getHours();
    // Matutino: 8:00 AM to 3:59 PM. Vespertino: 4:00 PM to 7:59 AM next day.
    if (hr >= 8 && hr < 16) return 'Matutino';
    return 'Vespertino';
};

export const getLocalDateString = (dateInput?: Date | string) => {
    let d = dateInput ? new Date(dateInput) : new Date();
    // If no specific date was requested (meaning 'now'), and it's before 8 AM, logically we are still
    // processing the previous day's shift. Offset the date backwards by 1 day.
    if (!dateInput && d.getHours() < 8) {
        d.setDate(d.getDate() - 1);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatLocalDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
};

export const getFormattedTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
        return new Date(isoString).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Mexico_City'
        });
    } catch (e) {
        return '--:--';
    }
};
