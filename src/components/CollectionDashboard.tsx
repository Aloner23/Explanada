
import React, { useMemo } from 'react';
import { 
  HandCoins, 
  AlertCircle, 
  Clock, 
  CalendarDays, 
  MessageCircle, 
  ChevronRight, 
  TrendingUp,
  User,
  Building,
  Car
} from 'lucide-react';
import { Tenant, Transaction, FrequentCustomer, Reservation } from '../types';
import { DebtSummary } from '../utils/tenantLogic';
import { plaza } from '../config/plaza';

interface CollectionDashboardProps {
  tenants: Tenant[];
  transactions: Transaction[];
  frequentCustomers: FrequentCustomer[];
  reservations: Reservation[];
  setSelectedTenantHistory: (tenant: Tenant) => void;
  setActiveTab: (tab: any) => void;
  calculateTenantDebt: (tenant: Tenant, transactions: Transaction[]) => DebtSummary;
}

export const CollectionDashboard: React.FC<CollectionDashboardProps> = ({
  tenants,
  transactions,
  frequentCustomers,
  reservations,
  setSelectedTenantHistory,
  setActiveTab,
  calculateTenantDebt
}) => {
  const tenantDebtData = useMemo(() => 
    tenants.map(t => ({ tenant: t, debt: calculateTenantDebt(t, transactions) })),
    [tenants, transactions]
  );

  const lateTenants = tenantDebtData.filter(d => d.debt.status === 'late');
  const pendingTenants = tenantDebtData.filter(d => d.debt.status === 'pending');
  
  const today = new Date();
  const overduePensions = frequentCustomers.filter(p => {
    const nextPay = new Date(p.nextPaymentDate);
    return !p.active || nextPay < today;
  });

  const pendingEvents = reservations.filter(r => 
    r.status === 'confirmed' && 
    r.totalAmount && 
    r.totalAmount > (r.advancePayment || 0)
  );

  const formatCurrency = (amount: number) => 
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const sendWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const finalPhone = cleanPhone.startsWith("52") ? cleanPhone : `52${cleanPhone}`;
    window.open(`https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
        <HandCoins className="text-blue-600" /> Estado de Cobranza
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
        {/* Locatarios en Mora */}
        <div className="space-y-6 lg:col-span-1 xl:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border border-red-100 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <h4 className="font-black text-red-800 text-lg uppercase flex items-center gap-2">
                <AlertCircle className="text-red-500" /> Locatarios en Mora
              </h4>
              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-black">
                {lateTenants.length}
              </span>
            </div>
            
            <div className="space-y-3 relative z-10">
              {lateTenants.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Sin morosidad crítica.</p>
              ) : (
                lateTenants.map(({ tenant, debt }) => (
                  <div key={tenant.id} className="flex justify-between items-center p-4 bg-red-50/50 rounded-2xl border border-red-100">
                    <div>
                      <p className="font-black text-slate-800 text-sm">{tenant.businessName}</p>
                      <p className="text-[10px] text-red-500 font-bold uppercase">
                        {debt.monthsOverdue} meses vencidos
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="font-black text-slate-900">${formatCurrency(debt.totalDebt)}</p>
                      {tenant.lesseePhone && (
                        <button 
                          onClick={() => {
                            const msg = `Estimado(a) ${tenant.name}, le informamos que tiene un adeudo pendiente en ${plaza.name} de $${formatCurrency(debt.totalDebt)} (${debt.monthsOverdue} meses). Le invitamos a regularizar su situación. ¡Gracias!`;
                            sendWhatsApp(tenant.lesseePhone, msg);
                          }}
                          className="text-[10px] text-emerald-600 font-black uppercase hover:underline flex items-center gap-1"
                        >
                          <MessageCircle size={10} /> WhatsApp
                        </button>
                      )}
                      <button 
                        onClick={() => { setSelectedTenantHistory(tenant); setActiveTab('tenants'); }}
                        className="text-[10px] text-blue-600 font-black uppercase hover:underline flex items-center gap-1 mt-1"
                      >
                        <HandCoins size={10} /> Registrar Cobro
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <TrendingUp className="absolute -bottom-6 -right-6 text-red-50 w-32 h-32 opacity-20" />
          </div>

          {/* Pagos Pendientes */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-amber-100 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-6 relative z-10">
              <h4 className="font-black text-amber-800 text-lg uppercase flex items-center gap-2">
                <Clock className="text-amber-500" /> Pagos Pendientes
              </h4>
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-black">
                {pendingTenants.length}
              </span>
            </div>
            
            <div className="space-y-3 relative z-10">
              {pendingTenants.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Todo al día.</p>
              ) : (
                pendingTenants.map(({ tenant, debt }) => (
                  <div key={tenant.id} className="flex justify-between items-center p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
                    <div>
                      <p className="font-black text-slate-800 text-sm">{tenant.businessName}</p>
                      <p className="text-[10px] text-amber-600 font-bold uppercase">
                        Mes en curso (Día {tenant.paymentDay})
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="font-black text-slate-900">${formatCurrency(debt.totalDebt)}</p>
                      {tenant.lesseePhone && (
                        <button 
                          onClick={() => {
                            const msg = `Hola ${tenant.name}, le recordamos amablemente que su pago de mantenimiento/renta en ${plaza.name} por $${formatCurrency(debt.totalDebt)} está próximo o pendiente. ¡Saludos!`;
                            sendWhatsApp(tenant.lesseePhone, msg);
                          }}
                          className="text-[10px] text-emerald-600 font-black uppercase hover:underline flex items-center gap-1"
                        >
                          <MessageCircle size={10} /> WhatsApp
                        </button>
                      )}
                      <button 
                        onClick={() => { setSelectedTenantHistory(tenant); setActiveTab('tenants'); }}
                        className="text-[10px] text-blue-600 font-black uppercase hover:underline flex items-center gap-1 mt-1"
                      >
                        <HandCoins size={10} /> Registrar Cobro
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Building className="absolute -bottom-6 -right-6 text-amber-50 w-32 h-32 opacity-20" />
          </div>
        </div>

        {/* Pensiones Vencidas */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-amber-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-center mb-6 relative z-10">
            <h4 className="font-black text-amber-800 text-lg uppercase flex items-center gap-2">
              <Car className="text-amber-500" /> Pensiones Vencidas
            </h4>
            <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-black">
              {overduePensions.length}
            </span>
          </div>
          
          <div className="space-y-3 relative z-10">
            {overduePensions.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Todos al corriente.</p>
            ) : (
              overduePensions.map(y => (
                <div key={y.id} className="flex justify-between items-center p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
                  <div>
                    <p className="font-black text-slate-800 text-sm">{y.name}</p>
                    <p className={`text-[10px] font-bold uppercase ${y.active ? "text-amber-600" : "text-slate-500"}`}>
                      {y.active ? `Venció: ${y.nextPaymentDate}` : "Inactivo"}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-black text-slate-900">${formatCurrency(y.monthlyFee)}</p>
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] font-mono text-slate-400 bg-white px-1 rounded border">
                        {y.plate}
                      </span>
                      {y.phone && (
                        <button 
                          onClick={() => {
                            const msg = `Hola ${y.name}, tu pensión de estacionamiento en ${plaza.name} está vencida (${y.nextPaymentDate}). El costo mensual es de $${formatCurrency(y.monthlyFee)}. Te invitamos a renovarla. ¡Gracias!`;
                            sendWhatsApp(y.phone, msg);
                          }}
                          className="text-[10px] text-emerald-600 font-black uppercase hover:underline flex items-center gap-1"
                        >
                          <MessageCircle size={10} /> WA
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <Clock className="absolute -bottom-6 -right-6 text-amber-50 w-32 h-32 opacity-20" />
        </div>

        {/* Eventos Pendientes */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-violet-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-center mb-6 relative z-10">
            <h4 className="font-black text-violet-800 text-lg uppercase flex items-center gap-2">
              <CalendarDays className="text-violet-500" /> Eventos Pendientes
            </h4>
            <span className="bg-violet-100 text-violet-700 px-3 py-1 rounded-full text-xs font-black">
              {pendingEvents.length}
            </span>
          </div>
          
          <div className="space-y-3 relative z-10">
            {pendingEvents.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Sin saldos pendientes.</p>
            ) : (
              pendingEvents.map(e => {
                const pending = (e.totalAmount || 0) - (e.advancePayment || 0);
                return (
                  <div key={e.id} className="flex justify-between items-center p-4 bg-violet-50/50 rounded-2xl border border-violet-100">
                    <div>
                      <p className="font-black text-slate-800 text-sm">{e.clientName}</p>
                      <p className="text-[10px] text-violet-600 font-bold uppercase">
                        {e.hallName} • {e.date}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold">
                        Total: ${formatCurrency(e.totalAmount || 0)} | Anticipo: ${formatCurrency(e.advancePayment || 0)}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="font-black text-violet-700">${formatCurrency(pending)}</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase">Pendiente</p>
                      {e.clientPhone && (
                        <button 
                          onClick={() => {
                            const msg = `Hola ${e.clientName}, le recordamos que tiene un saldo pendiente de $${formatCurrency(pending)} por la reservación de ${e.hallName} del día ${e.date} en ${plaza.name}. ¡Gracias!`;
                            sendWhatsApp(e.clientPhone, msg);
                          }}
                          className="text-[10px] text-emerald-600 font-black uppercase hover:underline flex items-center gap-1"
                        >
                          <MessageCircle size={10} /> WA
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <ChevronRight className="absolute -bottom-6 -right-6 text-violet-50 w-32 h-32 opacity-20" />
        </div>
      </div>
    </div>
  );
};
