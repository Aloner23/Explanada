import { safeReportHtml } from '../utils/safeHtml';

import React, { useState, useMemo } from 'react';
import { Tenant, Transaction, UserRole, Reservation, Staff, FinancialBreakdown } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import {
  Sparkles, TrendingUp, Users, AlertTriangle, RefreshCw, BadgeDollarSign,
  CalendarDays, Activity, Car, Info, ArrowUpRight, ArrowDownRight, Clock, Target,
  Sun, Calendar, Filter, ChevronDown, LayoutGrid, Maximize2, Wallet, Building, Store, PartyPopper,
  TrendingDown, AlertCircle
} from 'lucide-react';
import { analyzeBusinessPerformance } from '../services/geminiService';
import { calculateFinancialBreakdown, getTransactionCars, classifyTransaction } from '../utils/financialCalculations';
import { plaza, findPlazaSpace } from '../config/plaza';

const SPACE_COLORS = ['#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#14b8a6', '#6366f1'];
import { dataService, TABLES } from '../services/dataService';



interface OwnerDashboardProps {
  tenants: Tenant[];
  transactions: Transaction[];
  reservations: Reservation[];
  staff: Staff[];
}

const MONTHS_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];





export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({ tenants, transactions, reservations, staff }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
  const [userAiQuery, setUserAiQuery] = useState('');

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    transactions.forEach(t => {
      const year = t.date?.split('-')[0];
      if (year) years.add(year);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Cancelled/pending transactions must never count towards real revenue/expense totals shown to
      // the owner. `status` defaults to 'completed' for legacy records that predate this field.
      if (t.status && t.status !== 'completed') return false;
      const [year, month] = (t.date || '').split('-');
      return year === selectedYear && (selectedMonth === 'ALL' || month === selectedMonth);
    });
  }, [transactions, selectedYear, selectedMonth]);

  const financialData = useMemo(() => {
    return calculateFinancialBreakdown(filteredTransactions, tenants, reservations);
  }, [filteredTransactions, tenants, reservations]);

  const txsByDate = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      if (!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });
    return groups;
  }, [transactions]);

  const txsByMonth = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      const monthKey = t.date.substring(0, 7); // YYYY-MM
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(t);
    });
    return groups;
  }, [transactions]);

  const reservationsByDate = useMemo(() => {
    const groups: Record<string, Reservation[]> = {};
    reservations.forEach(r => {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    return groups;
  }, [reservations]);

  const heatmapByMonth = useMemo(() => {
    const monthsData = [];
    const yearInt = parseInt(selectedYear) || new Date().getFullYear();
    for (let m = 0; m < 12; m++) {
      const monthNum = (m + 1).toString().padStart(2, '0');
      if (selectedMonth !== 'ALL' && selectedMonth !== monthNum) continue;
      const daysInMonth = new Date(yearInt, m + 1, 0).getDate() || 30;
      const monthDays = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${selectedYear}-${monthNum}-${d.toString().padStart(2, '0')}`;
        const dayTxs = txsByDate[dateKey] || [];
        let count = dayTxs.reduce((acc, t) => acc + getTransactionCars(t), 0);
        monthDays.push({ date: dateKey, dayNum: d, count });
      }
      monthsData.push({ name: MONTHS_NAMES[m], monthNum, days: monthDays });
    }
    return monthsData;
  }, [txsByDate, selectedYear, selectedMonth]);

  const maxDailyCars = useMemo(() => {
    let max = 0;
    heatmapByMonth.forEach(m => m.days.forEach((d: any) => { if (d.count > max) max = d.count; }));
    return max || 1;
  }, [heatmapByMonth]);

  // AGENDA SATURATION HEATMAP
  const agendaHeatmap = useMemo(() => {
    const monthsData = [];
    const yearInt = parseInt(selectedYear) || new Date().getFullYear();
    for (let m = 0; m < 12; m++) {
      const monthNum = (m + 1).toString().padStart(2, '0');
      if (selectedMonth !== 'ALL' && selectedMonth !== monthNum) continue;
      const daysInMonth = new Date(yearInt, m + 1, 0).getDate() || 30;
      const monthDays = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${selectedYear}-${monthNum}-${d.toString().padStart(2, '0')}`;
        // Count reservations for this day
        const dayRes = (reservationsByDate[dateKey] || []).filter(r => r.status === 'confirmed');
        let saturation = 0;
        dayRes.forEach(r => {
          // Weight per space comes from plaza.config (bigger venues use more of the day's capacity).
          saturation += (findPlazaSpace(r.spaceId) || findPlazaSpace(r.hallName))?.agendaWeight ?? 0.25;
        });
        monthDays.push({ date: dateKey, dayNum: d, count: dayRes.length, saturation: Math.min(saturation, 1) });
      }
      monthsData.push({ name: MONTHS_NAMES[m], monthNum, days: monthDays });
    }
    return monthsData;
  }, [reservationsByDate, selectedYear, selectedMonth]);

  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    setAiError(null);
    setAiAnalysis(null);
    try {
    const result = await analyzeBusinessPerformance(
      transactions,
      tenants,
      reservations,
      selectedMonth === 'ALL' ? selectedYear : `${selectedMonth}/${selectedYear}`,
      userAiQuery
    );
    setAiAnalysis(result);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "No se pudo completar el análisis.");
    } finally { setLoadingAi(false); }
  };

  const chartData = useMemo(() => {
    return MONTHS_NAMES.map((name, i) => {
      const monthNum = (i + 1).toString().padStart(2, '0');
      const monthTxs = txsByMonth[`${selectedYear}-${monthNum}`] || [];
      const dataPoint = { name: name.substring(0, 3), parking: 0, local: 0, office: 0, events: 0, historical_fund: 0, ad_income: 0 };
      monthTxs.forEach(t => {
        const { category, amount } = classifyTransaction(t, tenants, reservations);
        if (category in dataPoint) (dataPoint as any)[category] += amount;
      });
      return dataPoint;
    });
  }, [txsByMonth, selectedYear, tenants, reservations]);

  const pieData = [
    { name: 'Estacionamiento', value: financialData.parking, color: '#3b82f6' },
    { name: 'Locatarios', value: financialData.local, color: '#10b981' },
    { name: 'Oficinas', value: financialData.office, color: '#06b6d4' },
    { name: 'Publicidad', value: financialData.ad_income, color: '#8b5cf6' },
    ...plaza.spaces.map((sp, i) => ({ name: sp.name, value: financialData.events_by_space[sp.id] || 0, color: SPACE_COLORS[i % SPACE_COLORS.length] })),
    { name: 'Otros eventos', value: financialData.events_by_space.otros || 0, color: '#94a3b8' },
  ].filter(x => x.value > 0);

  const expensePieData = [
    { name: 'Nómina', value: financialData.expense_nomina, color: '#ef4444' },
    { name: 'Mantenimiento', value: financialData.expense_manto, color: '#f97316' },
    { name: 'Servicios Básicos', value: financialData.expense_luz + financialData.expense_agua + financialData.expense_internet + financialData.expense_basic, color: '#eab308' },
    { name: 'Servicios Prof.', value: financialData.expense_marketing + financialData.expense_contabilidad + financialData.expense_legal + financialData.expense_ti + financialData.expense_pro, color: '#6366f1' },
    { name: 'Impuestos', value: financialData.taxes, color: '#4f46e5' },
    { name: 'Otros', value: financialData.expense_other, color: '#64748b' },
  ].filter(x => x.value > 0);

  return (
    <div className="space-y-10 animate-fade-in pb-24">
      {/* HEADER */}
      <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] sm:rounded-[3.5rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-[0.2em]">
            <Activity size={14} /> Intelligence Dashboard
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tighter">Administración Estratégica</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-2 rounded-[2rem] border border-slate-100 w-full lg:w-auto">
          <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-white border-none rounded-xl px-4 py-3 text-xs font-black text-slate-700 shadow-sm">
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-white border-none rounded-xl px-4 py-3 text-xs font-black text-slate-700 shadow-sm">
            <option value="ALL">Todo el Año</option>
            {MONTHS_NAMES.map((m, i) => <option key={m} value={(i + 1).toString().padStart(2, '0')}>{m}</option>)}
          </select>
          <button onClick={handleAiAnalysis} disabled={loadingAi} className="flex items-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-xl font-black shadow-xl hover:shadow-blue-500/20 transition-all disabled:opacity-70">
            {loadingAi ? <RefreshCw className="animate-spin w-4 h-4" /> : <Sparkles className="w-4 h-4 text-blue-400" />}
            <span className="text-xs uppercase tracking-widest">IA Audit</span>
          </button>
        </div>
      </div>

      {/* AI AUDIT INTERACTIVE INPUT */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 sm:p-8 rounded-[2.5rem] sm:rounded-[3.5rem] shadow-xl text-white relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl"><Sparkles size={20} className="text-blue-200" /></div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Consultoría Estratégica con IA</h3>
              <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest">Auditor experto responde tus dudas con datos reales</p>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row gap-4">
            <input
              type="text"
              placeholder="Ej: ¿Cómo optimizar los gastos de este mes? o ¿Cuál es mi margen de utilidad real?"
              className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-sm font-medium placeholder:text-blue-200/50 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all"
              value={userAiQuery}
              onChange={(e) => setUserAiQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAiAnalysis()}
            />
            <button
              onClick={handleAiAnalysis}
              disabled={loadingAi}
              className="bg-white text-blue-700 px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95 disabled:opacity-50"
            >
              {loadingAi ? <RefreshCw className="animate-spin" size={16} /> : <TrendingUp size={16} />}
              {loadingAi ? 'Analizando...' : 'Consultar Auditor'}
            </button>
          </div>
        </div>
      </div>

      {aiError && <div role="alert" className="my-6 rounded-2xl bg-red-50 p-6 text-red-800">{aiError}</div>}
      {/* AI ANALYSIS DISPLAY */}
      {aiAnalysis && (
        <div className="bg-gradient-to-br from-blue-600 to-indigo-800 p-1.5 rounded-[4rem] shadow-2xl animate-fade-in my-8">
          <div className="bg-white rounded-[2.5rem] sm:rounded-[3.8rem] p-6 sm:p-12 relative overflow-hidden">
            <div className="flex items-center gap-5 mb-8 relative z-10">
              <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-blue-200"><Sparkles size={32} /></div>
              <h3 className="font-black text-2xl text-slate-900 uppercase tracking-tighter">Análisis Estratégico</h3>
              <button
                onClick={() => setAiAnalysis(null)}
                className="ml-auto text-slate-300 hover:text-slate-600 transition-colors"
                title="Cerrar análisis"
              >
                <RefreshCw size={24} />
              </button>
            </div>
            <div className="prose prose-slate prose-lg max-w-none font-medium leading-relaxed text-slate-600" dangerouslySetInnerHTML={{ __html: safeReportHtml(aiAnalysis) }} />
          </div>
        </div>
      )}

      {/* METRIC CARDS - TOTALES GENERALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Ingreso Parking" value={`$${financialData.parking.toLocaleString()}`} icon={Car} color="blue" subValue={`${financialData.totalCars} Autos (Sistema)`} />
        <MetricCard title="Ingreso General" value={`$${financialData.totalRevenue.toLocaleString()}`} icon={Wallet} color="emerald" subValue="Suma de todas las áreas" />
        <MetricCard title="Gastos Totales" value={`$${financialData.totalExpense.toLocaleString()}`} icon={TrendingDown} color="red" subValue="Gastos de todas las áreas" />
        <MetricCard title="Arqueo" value={`$${financialData.audit_discrepancy.toLocaleString()}`} icon={AlertCircle} color={financialData.audit_discrepancy >= 0 ? 'emerald' : 'red'} subValue="Ingreso Real - Ingreso Sistema" />
      </div>

      {/* TARJETAS DE INGRESOS Y EGRESOS REALES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard title="Ingreso Real Parking" value={`$${financialData.realParking.toLocaleString()}`} icon={Car} color="cyan" subValue="Monto declarado en arqueos" />
        <MetricCard title="Gastos en Nómina" value={`$${financialData.expense_nomina.toLocaleString()}`} icon={Users} color="amber" subValue="Nómina Total (Formal + Informal)" />
        <MetricCard title="Total Neto" value={`$${financialData.totalNeto.toLocaleString()}`} icon={TrendingUp} color={financialData.totalNeto >= 0 ? 'emerald' : 'red'} subValue="Ingreso General - Gastos Totales" />
      </div>

      {/* REVENUE BREAKDOWN - ESPECIFICOS */}
      <div>
        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
          <BadgeDollarSign className="text-blue-600" size={24} /> Desglose de Ingresos
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <MiniMetricCard title="Membresías Estac." value={financialData.parking_memberships} color="violet" />
          <MiniMetricCard title="Locales" value={financialData.local} color="emerald" />
          <MiniMetricCard title="Oficinas" value={financialData.office} color="cyan" />
          {plaza.spaces.map((sp, i) => (
            <MiniMetricCard key={sp.id} title={sp.name} value={financialData.events_by_space[sp.id] || 0} color={(['pink', 'rose', 'violet', 'amber', 'cyan'] as const)[i % 5]} />
          ))}
          <MiniMetricCard title="Publicidad" value={financialData.ad_income} color="amber" />
        </div>
      </div>

      {/* PAYROLL FORMAL vs INFORMAL BREAKDOWN */}
      {
        financialData.expense_nomina > 0 && (
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-6 flex items-center gap-2">
              <Wallet className="text-amber-600" size={24} /> Nómina: Formal vs Informal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                // Calculate formal vs informal from payroll transactions
                const nominaTxs = filteredTransactions.filter(t =>
                  (t.type === 'EXPENSE' && t.subtype === 'NOMINA') || t.type === 'PAYROLL'
                );
                let formalTotal = 0;
                let informalTotal = 0;
                nominaTxs.forEach(tx => {
                  const desc = tx.description.toLowerCase();
                  if (desc.includes('formal') && !desc.includes('informal')) formalTotal += tx.amount;
                  else if (desc.includes('informal')) informalTotal += tx.amount;
                  else {
                    // Fallback: check staff list
                    const emp = staff.find(s => desc.includes(s.name.toLowerCase()));
                    if (emp?.formal) formalTotal += tx.amount;
                    else informalTotal += tx.amount;
                  }
                });
                return (
                  <>
                    <div className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-200 flex flex-col items-center justify-center gap-2">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Nómina Formal</span>
                      <span className="text-2xl font-black text-emerald-700">${formalTotal.toLocaleString()}</span>
                      <span className="text-[9px] text-emerald-500 font-bold">{staff.filter(s => s.formal && s.active).length} empleados</span>
                    </div>
                    <div className="bg-amber-50 rounded-[2rem] p-6 border border-amber-200 flex flex-col items-center justify-center gap-2">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Nómina Informal</span>
                      <span className="text-2xl font-black text-amber-700">${informalTotal.toLocaleString()}</span>
                      <span className="text-[9px] text-amber-500 font-bold">{staff.filter(s => !s.formal && s.active).length} empleados</span>
                    </div>
                    <div className="bg-slate-900 rounded-[2rem] p-6 flex flex-col items-center justify-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Nómina</span>
                      <span className="text-2xl font-black text-white">${financialData.expense_nomina.toLocaleString()}</span>
                      <span className="text-[9px] text-slate-500 font-bold">{staff.filter(s => s.active).length} empleados activos</span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )
      }

      {/* CHARTS SECTION - TREND BARS (Full Width) */}
      <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border border-slate-200 shadow-sm min-w-0">
        <h3 className="font-black text-slate-800 text-xl uppercase tracking-tight mb-8 flex items-center gap-2">
          <Activity className="text-blue-500" size={24} /> Tendencia Mensual de Ingresos
        </h3>
        <div className="h-[350px] relative w-full">
          <ResponsiveContainer width="99%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 900 }} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="parking" name="Parking" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
              <Bar dataKey="historical_fund" name="Fondo Histórico" stackId="a" fill="#64748b" />
              <Bar dataKey="local" name="Locales" stackId="a" fill="#10b981" />
              <Bar dataKey="office" name="Oficinas" stackId="a" fill="#06b6d4" />
              <Bar dataKey="ad_income" name="Publicidad" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="events" name="Eventos" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* PIE CHARTS SECTION - DISTRIBUTION (Two Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* INCOME PIE */}
        <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border border-slate-200 shadow-sm space-y-6 min-w-0">
          <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight text-center">Distribución de Ingresos</h3>
          <div className="h-[300px] relative w-full">
            <ResponsiveContainer width="99%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* EXPENSE PIE */}
        <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border border-slate-200 shadow-sm space-y-6 min-w-0">
          <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight text-center">Distribución de Gastos</h3>
          <div className="h-[300px] relative w-full">
            <ResponsiveContainer width="99%" height="100%">
              <PieChart>
                <Pie
                  data={expensePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expensePieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* EXPENSE BREAKDOWN - DETALLE DE GASTOS */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="font-black text-slate-800 text-xl uppercase tracking-tight mb-8 flex items-center gap-2">
            <TrendingDown className="text-red-500" size={24} /> Detalle de Gastos
          </h3>
          <div className="space-y-4">
            <ExpenseItem label="Nómina" amount={financialData.expense_nomina} color="bg-red-500" />
            <ExpenseItem label="Mantenimiento" amount={financialData.expense_manto} color="bg-orange-500" />

            {(financialData.expense_luz > 0 || financialData.expense_agua > 0 || financialData.expense_internet > 0 || financialData.expense_basic > 0) && (
              <div className="pt-2 border-t border-slate-50 space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Servicios Básicos</p>
                {financialData.expense_luz > 0 && <ExpenseItem label="Luz" amount={financialData.expense_luz} color="bg-yellow-400" />}
                {financialData.expense_agua > 0 && <ExpenseItem label="Agua" amount={financialData.expense_agua} color="bg-blue-400" />}
                {financialData.expense_internet > 0 && <ExpenseItem label="Internet" amount={financialData.expense_internet} color="bg-cyan-400" />}
                {financialData.expense_basic > 0 && <ExpenseItem label="Otros Servicios" amount={financialData.expense_basic} color="bg-yellow-500" />}
              </div>
            )}

            {(financialData.expense_marketing > 0 || financialData.expense_contabilidad > 0 || financialData.expense_legal > 0 || financialData.expense_ti > 0 || financialData.expense_pro > 0) && (
              <div className="pt-2 border-t border-slate-50 space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4">Servicios Profesionales</p>
                {financialData.expense_marketing > 0 && <ExpenseItem label="Marketing" amount={financialData.expense_marketing} color="bg-purple-400" />}
                {financialData.expense_contabilidad > 0 && <ExpenseItem label="Contabilidad" amount={financialData.expense_contabilidad} color="bg-indigo-400" />}
                {financialData.expense_legal > 0 && <ExpenseItem label="Legal" amount={financialData.expense_legal} color="bg-slate-400" />}
                {financialData.expense_ti > 0 && <ExpenseItem label="Servicios TI" amount={financialData.expense_ti} color="bg-blue-500" />}
                {financialData.expense_pro > 0 && <ExpenseItem label="Otros Honorarios" amount={financialData.expense_pro} color="bg-amber-500" />}
              </div>
            )}

            {financialData.taxes > 0 && <ExpenseItem label="Impuestos" amount={financialData.taxes} color="bg-indigo-500" />}
            <ExpenseItem label="Otros Gastos" amount={financialData.expense_other} color="bg-slate-500" />
          </div>
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <span className="font-black text-slate-400 uppercase tracking-widest text-xs">Total Gastos</span>
              <span className="font-black text-2xl text-red-500">${financialData.totalExpense.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* HEATMAPS SECTION */}
      <div className="space-y-8">
        {/* VEHICULAR HEATMAP */}
        <div className="bg-[#0b0f1a] p-6 sm:p-12 rounded-[2.5rem] sm:rounded-[5rem] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/2"></div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 relative z-10 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-400 font-black text-[10px] uppercase tracking-[0.2em]">
                <Car size={16} /> Mapa de Calor
              </div>
              <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none">Saturación Vehicular</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Patrones de afluencia mensual</p>
            </div>
            {/* Scale Legend */}
            <div className="bg-white/5 p-4 rounded-3xl border border-white/10 flex flex-col items-center gap-2 backdrop-blur-sm">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Intensidad</span>
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#1e3a8a]" title="Baja"></div>
                <div className="w-6 h-6 rounded-lg bg-[#2563eb]" title="Media"></div>
                <div className="w-6 h-6 rounded-lg bg-white shadow-[0_0_10px_white]" title="Alta"></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 relative z-10">
            {heatmapByMonth.map((month, mIdx) => (
              <div key={mIdx} className="space-y-4">
                <div className="flex justify-between items-end px-2 border-b border-white/5 pb-2">
                  <h4 className="font-black text-lg uppercase tracking-tighter text-blue-400">{month.name}</h4>
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{month.days.length} Días</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 p-4 bg-white/5 rounded-[2rem] border border-white/10 shadow-inner">
                  {month.days.map((day, dIdx) => {
                    const intensity = day.count / maxDailyCars;
                    const color = day.count === 0 ? 'bg-[#1a1f2e]/50' :
                      intensity < 0.25 ? 'bg-blue-900/40 text-blue-300' :
                        intensity < 0.50 ? 'bg-blue-700/80 text-white' :
                          intensity < 0.85 ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.2)]' :
                            'bg-white text-slate-900 shadow-[0_0_20px_rgba(255,255,255,0.3)]';

                    return (
                      <div key={dIdx} className="group relative">
                        <div className={`w-full aspect-square rounded-lg ${color} flex items-center justify-center text-[9px] font-black transition-all hover:scale-125 hover:z-20 cursor-pointer border border-white/5`}>
                          {day.dayNum}
                        </div>
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-3 py-2 rounded-xl text-[10px] font-black opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-30 shadow-xl whitespace-nowrap">
                          {day.count} AUTOS
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AGENDA HEATMAP */}
        <div className="bg-[#1e1b2e] p-6 sm:p-12 rounded-[2.5rem] sm:rounded-[5rem] text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-pink-500/10 blur-[100px] rounded-full pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 relative z-10 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-pink-400 font-black text-[10px] uppercase tracking-[0.2em]">
                <Calendar size={16} /> Mapa de Ocupación
              </div>
              <h3 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none">Agenda de Eventos</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Días con eventos confirmados</p>
            </div>
            <div className="bg-white/5 p-4 rounded-3xl border border-white/10 flex flex-col items-center gap-2 backdrop-blur-sm">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Ocupación</span>
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-pink-900/50" title="Libre"></div>
                <div className="w-6 h-6 rounded-lg bg-pink-500 border border-pink-400 shadow-[0_0_10px_rgba(236,72,153,0.5)]" title="Evento Confirmado"></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 relative z-10">
            {agendaHeatmap.map((month, mIdx) => (
              <div key={mIdx} className="space-y-4">
                <div className="flex justify-between items-end px-2 border-b border-white/5 pb-2">
                  <h4 className="font-black text-lg uppercase tracking-tighter text-pink-400">{month.name}</h4>
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{month.days.filter((d: any) => d.count > 0).length} Eventos</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 p-4 bg-white/5 rounded-[2rem] border border-white/10 shadow-inner">
                  {month.days.map((day: any, dIdx: number) => {
                    const hasEvent = day.count > 0;
                    const color = hasEvent
                      ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)] ring-1 ring-pink-400'
                      : 'bg-[#1a1f2e]/50 text-slate-700';

                    return (
                      <div key={dIdx} className="group relative">
                        <div className={`w-full aspect-square rounded-lg ${color} flex items-center justify-center text-[9px] font-black transition-all hover:scale-125 hover:z-20 cursor-pointer border border-white/5`}>
                          {day.dayNum}
                        </div>
                        {hasEvent && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-3 py-2 rounded-xl text-[10px] font-black opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-30 shadow-xl whitespace-nowrap">
                            {day.count} Evento(s)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};
const MetricCard = ({ title, value, icon: Icon, color, subValue }: any) => (
  <div className="bg-white p-8 rounded-[3.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-400 transition-all">
    <div className={`w-14 h-14 bg-${color}-50 text-${color}-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
      <Icon size={28} />
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{title}</p>
    <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{value}</h3>
    <p className="text-[11px] font-bold text-slate-400 mt-3 italic">{subValue}</p>
  </div>
);

const MiniMetricCard = ({ title, value, color }: any) => (
  <div className={`bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-2 hover:shadow-md transition-shadow`}>
    <span className={`text-[10px] font-black uppercase tracking-widest text-${color}-500`}>{title}</span>
    <span className="text-xl font-black text-slate-800">${value.toLocaleString()}</span>
  </div>
);

const ExpenseItem = ({ label, amount, color, sub }: any) => (
  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full ${color}`}></div>
      <div className="flex flex-col">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        {sub && <span className="text-[10px] text-slate-400 font-medium">{sub}</span>}
      </div>
    </div>
    <span className="text-sm font-black text-slate-800">${amount.toLocaleString()}</span>
  </div>
);
