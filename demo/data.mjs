// Synthetic demo dataset for Explanada (sample plaza: config/plaza.config.json).
// Every name, amount, plate and e-mail below is invented. Dates are generated
// relative to "today" so dashboards always show recent activity.
// Shared by demo/seed-emulators.mjs (Firebase Emulators) and demo/mock (in-browser backend).

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_USERS = [
  { id: 'demo-owner', username: 'dueno', name: 'Dueña Demo', role: 'OWNER' },
  { id: 'demo-admin', username: 'admin', name: 'Administración Demo', role: 'ADMIN' },
  { id: 'demo-cajero', username: 'cajero', name: 'Cajero Demo', role: 'PARKING_STAFF' },
  { id: 'demo-staff', username: 'staff', name: 'Staff Demo', role: 'STAFF' },
  { id: 'demo-locatario', username: 'locatario', name: 'Locatario Demo', role: 'TENANT', tenantId: 't-a101' },
];

const TENANTS = [
  ['t-a101', 'Café Aurora', 'A-101', 'LOCAL', 9500, 'active'],
  ['t-a102', 'Librería Nube', 'A-102', 'LOCAL', 8200, 'active'],
  ['t-a103', 'Estética Brillo', 'A-103', 'LOCAL', 7800, 'late'],
  ['t-a104', 'Panadería Trigal', 'A-104', 'LOCAL', 8800, 'active'],
  ['t-a105', '', 'A-105', 'LOCAL', 8000, 'vacant'],
  ['t-b201', 'Despacho Contable Demo', 'B-201', 'OFICINA', 6500, 'active'],
  ['t-b202', 'Estudio de Diseño Prisma', 'B-202', 'OFICINA', 6200, 'late'],
  ['t-b203', '', 'B-203', 'OFICINA', 6000, 'vacant'],
  ['t-d301', 'Centro Deportivo Demo', 'D-301', 'DEPORTIVO', 18000, 'active'],
  ['t-d302', 'Academia de Danza Demo', 'D-302', 'DEPORTIVO', 15000, 'active'],
];



function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uuid = rnd => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.floor(rnd() * 16); return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16).toUpperCase();
});
const plate = rnd => `${'DEMO'.charAt(Math.floor(rnd() * 4))}${String.fromCharCode(65 + Math.floor(rnd() * 26))}${String.fromCharCode(65 + Math.floor(rnd() * 26))}-${100 + Math.floor(rnd() * 900)}`;

// `plaza` is the plaza config (config/plaza.config.json): bookable spaces, rates and name
// come from it, so the demo always matches the branding the app is built with.
export function buildDemoData(plaza, today = new Date()) {
  const HALLS = plaza.spaces.map(s => [s.name, s.id, s.pricing.base]);
  const rnd = mulberry32(33);
  const todayStr = ymd(today);
  const nowIso = today.toISOString();

  const users = DEMO_USERS.map(u => ({ ...u, active: true, permissions: [] }));

  const tenants = TENANTS.map(([id, businessName, localNumber, tenantType, rentAmount, status], i) => ({
    id, businessName: businessName || `Local disponible ${localNumber}`, localNumber, tenantType, status,
    name: businessName ? `Responsable Demo ${i + 1}` : '',
    rentAmount, maintenanceFee: Math.round(rentAmount * 0.1), paymentDay: 1 + (i % 5) * 2,
    email: businessName ? `locatario${i + 1}@example.test` : '',
    lesseeName: businessName ? `Responsable Demo ${i + 1}` : '',
    lesseePhone: businessName ? `55000000${pad(i + 10)}` : '',
    dimensions: tenantType === 'DEPORTIVO' ? '20x22 m' : '5x9 m',
    contractType: 'nuevo', leasePeriod: '12 Meses',
    contractStartDate: ymd(addDays(today, -300 + i * 7)), contractEndDate: ymd(addDays(today, 65 + i * 7)),
  }));

  const transactions = [];
  const tx = t => transactions.push({ status: 'completed', paymentMethod: 'CASH', created_at: `${t.date}T12:00:00.000Z`, ...t });

  // Monthly income/expenses for the last 6 months (including the current one).
  for (let m = 5; m >= 0; m--) {
    const base = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const key = `${base.getFullYear()}-${pad(base.getMonth() + 1)}`;
    const day = d => `${key}-${pad(Math.min(d, 28))}`;
    const isFuture = d => day(d) > todayStr;

    tenants.forEach(t => {
      if (t.status === 'vacant') return;
      if (t.status === 'late' && m < 2) return; // overdue tenants skipped the last two months
      if (isFuture(t.paymentDay)) return;
      tx({ id: `rent-${t.id}-${key}`, type: 'RENT', subtype: t.tenantType === 'OFICINA' ? 'OFICINA' : 'LOCAL', amount: t.rentAmount + t.maintenanceFee,
        date: day(t.paymentDay), description: `Renta ${key} - ${t.businessName}`, tenantId: t.id, tenantBusinessName: t.businessName,
        paymentMethod: rnd() > 0.5 ? 'MERCADO_PAGO' : 'CASH' });
      t.lastPaymentDate = day(t.paymentDay);
    });

    const expenses = [
      ['NOMINA', 'Nómina mensual', 42000, 28], ['LUZ', 'Recibo de luz áreas comunes', 6800, 12], ['AGUA', 'Servicio de agua', 1900, 12],
      ['INTERNET', 'Internet y telefonía', 1200, 5], ['MANTENIMIENTO', 'Mantenimiento general', 5200, 18], ['CONTABILIDAD', 'Honorarios contables', 3500, 25],
    ];
    expenses.forEach(([subtype, desc, amount, d]) => {
      if (isFuture(d)) return;
      tx({ id: `exp-${subtype.toLowerCase()}-${key}`, type: 'EXPENSE', subtype, amount: Math.round(amount * (0.9 + rnd() * 0.2)), date: day(d), description: desc });
    });

    if (!isFuture(10)) tx({ id: `ad-${key}`, type: 'AD_INCOME', amount: 3500, date: day(10), description: 'Renta de espacio publicitario - Lona frontal' });

    HALLS.forEach(([hall, spaceId, price], h) => {
      const d = 6 + h * 7;
      if (isFuture(d) || rnd() < 0.3) return;
      tx({ id: `resv-${spaceId}-${key}`, type: 'RESERVATION', subtype: 'EVENT', spaceId, amount: price, date: day(d), description: `Reserva: Evento demo ${hall}` });
    });
  }

  // Parking: aggregated historical shift closures for older days, individual tickets for the last week.
  const tickets = [];
  for (let back = 90; back >= 8; back--) {
    const d = ymd(addDays(today, -back));
    for (const shift of ['Matutino', 'Vespertino']) {
      const cars = 12 + Math.floor(rnd() * (shift === 'Vespertino' ? 45 : 25));
      tx({ id: `hist-${d}-${shift}`, type: 'HISTORICAL', amount: cars * 15, date: d, cars_charged: cars, courtesies: Math.floor(rnd() * 3),
        description: `Cierre Histórico ${shift} (${cars} autos)`, is_closed: true });
    }
  }
  for (let back = 7; back >= 0; back--) {
    const date = addDays(today, -back);
    const count = back === 0 ? 6 : 8 + Math.floor(rnd() * 8);
    for (let i = 0; i < count; i++) {
      const entry = new Date(date); entry.setHours(9 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0);
      if (entry > today) entry.setTime(today.getTime() - (i + 1) * 20 * 60000);
      const minutes = 30 + Math.floor(rnd() * 150);
      const exit = new Date(entry.getTime() + minutes * 60000);
      const id = uuid(rnd);
      const type = rnd() < 0.15 ? 'LOCATARIO' : 'NORMAL';
      const amount = Math.max(1, Math.ceil(minutes / 60)) * (type === 'LOCATARIO' ? 10 : 15);
      if (exit > today || (back === 0 && i < 4)) {
        tickets.push({ id, entryTime: entry.toISOString(), plate: plate(rnd), status: 'active', type, convention: 'NONE', registeredBy: 'cajero' });
        continue;
      }
      tickets.push({ id, entryTime: entry.toISOString(), plate: plate(rnd), status: 'paid', type, convention: 'NONE', registeredBy: 'cajero',
        paymentTime: exit.toISOString(), paymentAmount: amount, paymentMethod: 'CASH', updated_at: exit.toISOString() });
      tx({ id: `tx-${id}`, type: 'PARKING', amount, date: ymd(exit), description: `Cobro Estacionamiento (${minutes} min)`, ticketId: id,
        parkingType: type, registeredBy: 'cajero', shift: exit.getHours() < 16 ? 'Matutino' : 'Vespertino', created_at: exit.toISOString() });
    }
  }

  const reservations = [3, 9, 16, 24, 38].map((offset, i) => {
    const [hallName, spaceId] = HALLS[i % HALLS.length];
    return { id: `RES-${uuid(rnd)}`, hallName, spaceId, date: ymd(addDays(today, offset)), startTime: i % 2 ? '16:00' : '10:00', endTime: i % 2 ? '23:00' : '15:00',
      clientName: `Cliente Demo ${i + 1}`, clientEmail: `cliente${i + 1}@example.test`, status: i === 4 ? 'pending' : 'confirmed' };
  });

  const galleryImages = [
    ['g1', 'exterior', 'Fachada principal', true], ['g2', 'eventos', 'Terraza para eventos'], ['g3', 'interiores', 'Salón de usos múltiples'],
    ['g4', 'exterior', 'Andador comercial'], ['g5', 'eventos', 'Montaje de evento'], ['g6', 'interiores', 'Área de trabajo compartido'],
  ].map(([id, category, title, isPrimary], i) => ({ id, category, title, url: `demo/gallery-${i + 1}.png`, isPrimary: !!isPrimary, order: i }));

  const staff = [
    ['s1', 'Empleado Demo Uno', 'Cajero de caseta', 2400, true], ['s2', 'Empleado Demo Dos', 'Cajero de caseta', 2400, true],
    ['s3', 'Empleado Demo Tres', 'Mantenimiento', 2200, false], ['s4', 'Empleado Demo Cuatro', 'Limpieza', 2000, false],
    ['s5', 'Empleado Demo Cinco', 'Recepción', 2600, true],
  ].map(([id, name, role, weeklySalary, formal], i) => ({ id, name, role, weeklySalary, formal, active: true, hireDate: ymd(addDays(today, -400 + i * 30)),
    schedule: i < 2 ? (i ? '16:00 - 00:00' : '08:00 - 16:00') : '09:00 - 17:00', paymentFrequency: 'weekly' }));

  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const attendance = [];
  staff.forEach(s => { for (let d = 0; d < 7; d++) { const date = addDays(monday, d); if (date > today) break;
    attendance.push({ id: `att-${s.id}-${ymd(date)}`, staffId: s.id, date: ymd(date), status: rnd() < 0.85 ? 'present' : (rnd() < 0.5 ? 'late' : 'absent') }); } });
  const payroll = [];
  for (let w = 1; w <= 3; w++) {
    const start = addDays(monday, -7 * w), end = addDays(start, 6);
    staff.forEach(s => payroll.push({ id: `pay-${s.id}-${ymd(start)}`, staffId: s.id, staffName: s.name, periodStart: ymd(start), periodEnd: ymd(end),
      baseSalary: s.weeklySalary, deductions: 0, bonus: 0, totalPaid: s.weeklySalary, paidAt: `${ymd(end)}T18:00:00.000Z`, transactionId: '', formal: s.formal }));
  }

  const adSpaces = [
    ['ad1', 'Lona frontal', 'Fachada principal', '6m x 3m', 3500, 'rented', 'Anunciante Demo A'],
    ['ad2', 'Tótem de acceso', 'Entrada vehicular', '1m x 2.5m', 1800, 'available'],
    ['ad3', 'Pantalla de pasillo', 'Andador comercial', '55"', 1200, 'rented', 'Anunciante Demo B'],
    ['ad4', 'Banner de estacionamiento', 'Caseta', '2m x 1m', 900, 'expired', 'Anunciante Demo C'],
  ].map(([id, name, location, dimensions, amount, status, lesseeName]) => ({ id, name, location, dimensions, amount, status,
    ...(lesseeName ? { lesseeName, lesseePhone: '5500000099', paymentStatus: status === 'rented' ? 'paid' : 'late',
      startDate: ymd(addDays(today, -60)), endDate: ymd(addDays(today, status === 'expired' ? -5 : 120)), rentalPeriod: '6 meses' } : {}) }));

  const tasks = [
    ['Actualizar contrato del local B-202', 'admin', 'high', 'in_progress', 'LEGAL'],
    ['Programar mantenimiento de luminarias', 'staff', 'medium', 'pending', 'ADMIN'],
    ['Publicar fotos del último evento', 'staff', 'low', 'completed', 'MARKETING'],
    ['Conciliar ingresos de estacionamiento del mes', 'admin', 'high', 'pending', 'CONTABILIDAD'],
    ['Revisar cotización de cámaras', 'admin', 'medium', 'pending', 'otro'],
  ].map(([description, assignedTo, priority, status, category], i) => ({ id: `task-${i + 1}`, description, assignedTo, priority, status, category,
    createdBy: 'dueno', createdAt: addDays(today, -10 + i).toISOString(), dueDate: ymd(addDays(today, 3 + i * 2)) }));

  const frequentCustomers = [
    ['fc1', 'Pensionado Demo 1', 'PEN-101', 900], ['fc2', 'Pensionado Demo 2', 'PEN-202', 900], ['fc3', 'Pensionado Demo 3', 'PEN-303', 1200],
  ].map(([id, name, p, monthlyFee], i) => ({ id, name, plate: p, monthlyFee, category: 'PENSION', active: true, phone: '5500000098',
    lastPaymentDate: ymd(addDays(today, -20 + i * 5)), nextPaymentDate: ymd(addDays(today, 10 + i * 5)) }));

  const { hourlyRate = 15, freeMinutes = 15, dailyMax = 200 } = plaza.parking || {};
  const config = { id: 'global', hourlyRate, freeMinutes, dailyMax, selloDiscount: 0,
    plazaName: `${plaza.name} (Demo)`, footerMessage: 'Versión de demostración — datos ficticios', updated_at: nowIso };

  return {
    plz_users: users, plz_tenants: tenants, plz_transactions: transactions, plz_tickets: tickets, plz_reservations: reservations,
    plz_gallery: galleryImages, plz_staff: staff, plz_attendance: attendance, plz_payroll: payroll, plz_ad_spaces: adSpaces,
    plz_tasks: tasks, plz_frequent_customers: frequentCustomers, plz_config: [config],
  };
}
