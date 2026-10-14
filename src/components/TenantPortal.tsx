
import React, { useState, useEffect, useRef } from 'react';
import { Tenant, ParkingTicket } from '../types';
import { 
  CreditCard, CheckCircle, Clock, AlertCircle, QrCode, Sparkles, Tag, Search, X, Loader2,
  Camera, ScanLine, AlertTriangle, CalendarDays, Receipt
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

interface TenantPortalProps {
  tenant: Tenant;
  onPayRent: (tenantId: string, amount: number) => void;
  activeTickets: ParkingTicket[];
  onStampTicket: (ticketId: string, localName: string) => Promise<boolean>;
  logoUrl?: string;
}

export const TenantPortal: React.FC<TenantPortalProps> = ({ 
  tenant, 
  onPayRent, 
  activeTickets, 
  onStampTicket,
  logoUrl 
}) => {
  const [showStampModal, setShowStampModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [stampStatus, setStampStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [scannerError, setScannerError] = useState<string | null>(null);
  
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  const totalPayable = tenant.rentAmount + (tenant.maintenanceFee || 0);

  // Lógica de Estado de Pago para el Portal
  const getPaymentStatus = () => {
     const today = new Date();
     const lastPay = tenant.lastPaymentDate ? new Date(tenant.lastPaymentDate) : null;
     
     const isPaidThisMonth = lastPay && 
                             lastPay.getMonth() === today.getMonth() && 
                             lastPay.getFullYear() === today.getFullYear();
                             
     if (isPaidThisMonth) return 'PAID';
     if (today.getDate() <= 10) return 'PERIOD';
     return 'LATE';
  };
  
  const paymentStatus = getPaymentStatus();

  // Manejo del escáner para locatarios con flujo robusto de React 19
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (showScanner && showStampModal) {
      const startScanner = async () => {
        try {
          // Verificamos que el contenedor esté listo
          const container = document.getElementById("tenant-qr-reader");
          if (!container) return;

          html5QrCode = new Html5Qrcode("tenant-qr-reader");
          qrScannerRef.current = html5QrCode;
          
          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 220, height: 220 },
            },
            async (decodedText) => {
              // Detención previa del escáner para evitar errores de colisión de estados
              if (html5QrCode && html5QrCode.isScanning) {
                try {
                  await html5QrCode.stop();
                  html5QrCode.clear();
                } catch (e) {
                  console.error("Error stopping tenant scanner on detection:", e);
                }
              }
              // Salida del flujo síncrono para actualización segura
              setTimeout(() => {
                handleQrDetected(decodedText);
              }, 0);
            },
            () => { /* Sin QR en el cuadro actual */ }
          );
        } catch (err) {
          console.error("Scanner error:", err);
          setScannerError("No se pudo activar la cámara.");
        }
      };
      
      startScanner();
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
          html5QrCode?.clear();
        }).catch(err => console.error("Error on unmount tenant scanner cleanup", err));
      }
    };
  }, [showScanner, showStampModal]);

  const handleQrDetected = async (decodedText: string) => {
    // CORRECCIÓN AUTOMÁTICA DE APÓSTROFES: Reemplaza ' por - para compatibilidad de escáneres
    const folio = decodedText.trim().toUpperCase().replace(/'/g, '-');
    setTicketId(folio);
    setShowScanner(false);
    
    setStampStatus('loading');
    const success = await onStampTicket(folio, tenant.businessName);
    
    if (success) {
      setStampStatus('success');
      setTimeout(() => {
        setShowStampModal(false);
        setStampStatus('idle');
        setTicketId('');
      }, 2000);
    } else {
      setStampStatus('error');
      setErrorMsg('Ticket inválido o ya sellado.');
    }
  };

  // IMPORTANT: There is no real payment gateway integrated in this app (no Stripe/MercadoPago/Conekta
  // call anywhere in the codebase). This button used to fake a "pasarela de pagos" and then silently call
  // onPayRent(), which creates a real, completed RENT transaction — i.e. it credited the tenant as fully
  // paid and booked real revenue in the owner's dashboard/accounting WITHOUT any money ever changing hands.
  // Until a real payment processor is wired up, we must not fabricate accounting records here. Direct the
  // tenant to pay through a real channel (transfer/cash with administration) instead.
  const handlePay = () => {
    alert("El pago en línea aún no está disponible. Por favor realiza tu pago por transferencia o directamente con Administración; tu estado de cuenta se actualizará una vez que se registre el pago.");
  };

  const handleApplyStamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId) return;

    setStampStatus('loading');
    setErrorMsg('');

    // CORRECCIÓN AUTOMÁTICA DE APÓSTROFES
    const cleanFolio = ticketId.toUpperCase().trim().replace(/'/g, '-');

    const success = await onStampTicket(cleanFolio, tenant.businessName);

    if (success) {
      setStampStatus('success');
      setTimeout(() => {
        setShowStampModal(false);
        setStampStatus('idle');
        setTicketId('');
      }, 2000);
    } else {
      setStampStatus('error');
      setErrorMsg('Ticket no encontrado o ya tiene un sello aplicado.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-fade-in pb-20 px-4 sm:px-0">
      
      {/* ALERTAS DE ESTADO DE PAGO */}
      {paymentStatus === 'PERIOD' && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-6 flex items-start gap-4 shadow-sm animate-pulse">
           <div className="p-3 bg-amber-100 rounded-full text-amber-600"><CalendarDays size={24}/></div>
           <div>
              <h3 className="font-black text-amber-800 text-lg uppercase">Periodo de Pago Activo</h3>
              <p className="text-sm font-medium text-amber-700">Recuerda realizar tu pago antes del día 10. Total a pagar: <strong>${totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>.</p>
           </div>
        </div>
      )}
      
      {paymentStatus === 'LATE' && (
        <div className="bg-red-50 border-2 border-red-200 rounded-[2rem] p-6 flex items-start gap-4 shadow-md">
           <div className="p-3 bg-red-100 rounded-full text-red-600"><AlertTriangle size={24}/></div>
           <div>
              <h3 className="font-black text-red-800 text-lg uppercase">Pago Vencido (En Mora)</h3>
              <p className="text-sm font-medium text-red-700">Tu fecha límite de pago ha pasado. Por favor regulariza tu saldo de <strong>${totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> lo antes posible.</p>
           </div>
        </div>
      )}

      {/* Header Perfil */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden relative">
        <div className="h-32 bg-gradient-to-r from-slate-900 to-blue-900"></div>
        <div className="px-4 sm:px-8 pb-8">
          <div className="relative -top-10 flex flex-col md:flex-row items-center md:items-end justify-between gap-6">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
              <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center text-3xl font-black text-blue-600 border-4 border-white">
                {tenant.localNumber}
              </div>
              <div className="mb-2 text-center md:text-left">
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{tenant.businessName}</h2>
                <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">{tenant.name} | {tenant.email}</p>
                <span className="inline-block mt-2 px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black uppercase text-slate-500">{tenant.tenantType || 'LOCAL COMERCIAL'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
             <div className="lg:col-span-2 bg-blue-50 border border-blue-100 rounded-[2rem] p-6 sm:p-8 flex flex-col justify-between group hover:bg-blue-600 transition-all duration-500">
                <div className="flex justify-between items-start">
                   <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm group-hover:scale-110 transition-transform"><QrCode size={28}/></div>
                   <div className="text-right">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest group-hover:text-blue-100">Cortesía Clientes</p>
                      <h4 className="text-2xl font-black text-slate-900 group-hover:text-white tracking-tighter">Sellar Ticket</h4>
                   </div>
                </div>
                <div className="mt-8 space-y-4">
                   <p className="text-sm text-slate-600 font-medium group-hover:text-blue-50 leading-relaxed">Aplica un descuento de <strong>$5.00 MXN</strong> por hora a tus clientes sellando su ticket digitalmente.</p>
                   <div className="flex gap-3">
                      <button onClick={() => { setShowStampModal(true); setShowScanner(true); }} className="flex-1 py-4 bg-white text-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"><Camera size={18}/> Escanear QR</button>
                      <button onClick={() => { setShowStampModal(true); setShowScanner(false); }} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl group-hover:bg-white group-hover:text-blue-600 transition-all flex items-center justify-center gap-2"><Tag size={18}/> Teclear Folio</button>
                   </div>
                </div>
             </div>

             <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex flex-col justify-between shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Receipt size={14}/> Estado de Cuenta</h3>
                  <div className="space-y-1 mb-4">
                     <div className="flex justify-between text-xs text-slate-300"><span>Renta Base</span><span>${tenant.rentAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                     {tenant.maintenanceFee ? <div className="flex justify-between text-xs text-slate-300"><span>Mantenimiento</span><span>${tenant.maintenanceFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div> : null}
                     <div className="h-px bg-white/20 my-2"></div>
                     <div className="flex justify-between text-lg font-black text-white"><span>Total</span><span>${totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                  </div>
                </div>
                <div className="relative z-10">
                  {paymentStatus !== 'PAID' ? <button onClick={handlePay} className={`w-full py-3 rounded-xl font-black text-xs uppercase transition-all shadow-lg ${paymentStatus === 'LATE' ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}>Pagar ${totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</button> : <div className="py-3 bg-emerald-500/20 text-emerald-400 rounded-xl font-black text-xs uppercase flex justify-center items-center gap-2 border border-emerald-500/30"><CheckCircle size={14}/> Al corriente</div>}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* HISTORIAL Y RESUMEN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 sm:p-8">
          <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight mb-6 flex items-center gap-2">
            <Clock className="text-slate-400" size={20}/> Historial de Pagos
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-4 border-b border-slate-50 hover:bg-slate-50 px-2 rounded-xl transition-colors">
              <div>
                <p className="font-black text-slate-800 text-sm">Renta {new Date().toLocaleString('es-MX', { month: 'long' })}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{tenant.lastPaymentDate ? new Date(tenant.lastPaymentDate).toLocaleDateString() : 'Pendiente'}</p>
              </div>
              <span className={`font-black ${paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-slate-400'}`}>-${totalPayable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 sm:p-8">
          <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight mb-6 flex items-center gap-2">
            <Tag className="text-slate-400" size={20}/> Resumen de Sello
          </h3>
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 text-center space-y-2">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descuento Configurado</p>
             <p className="text-4xl font-black text-blue-600 tracking-tighter">$5.00 <span className="text-xs font-bold text-slate-400">/HR</span></p>
          </div>
        </div>
      </div>

      {/* MODAL DE SELLO */}
      {showStampModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
           <div className="bg-white rounded-[3rem] shadow-2xl w-full max-md overflow-hidden animate-fade-in-up">
              <div className="p-8 bg-slate-50 border-b flex justify-between items-center">
                 <h3 className="font-black text-xl flex items-center gap-3 tracking-tighter uppercase">{showScanner ? <><ScanLine className="text-blue-600"/> Escanear QR</> : <><Tag className="text-blue-600"/> Sellar Ticket</>}</h3>
                 <button onClick={() => { setShowStampModal(false); setStampStatus('idle'); setShowScanner(false); }} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X/></button>
              </div>
              <div className="p-6 sm:p-10 space-y-6 max-h-[70vh] overflow-y-auto">
                 {showScanner ? (
                   <div className="space-y-6 flex flex-col items-center">
                      <div className="relative w-full aspect-square max-w-[280px] bg-black rounded-[2rem] overflow-hidden shadow-2xl">
                         <div id="tenant-qr-reader" className="w-full h-full"></div>
                         <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none z-10 flex items-center justify-center">
                            <div className="w-[180px] h-[180px] border-2 border-white/50 rounded-2xl relative">
                               <div className="qr-scanner-line"></div>
                            </div>
                         </div>
                      </div>
                      {scannerError && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-[10px] font-black flex items-center gap-2 border border-red-100"><AlertTriangle size={14}/> {scannerError}</div>}
                      <button onClick={() => setShowScanner(false)} className="text-[10px] text-blue-600 font-black uppercase tracking-widest">O usar teclado</button>
                   </div>
                 ) : (
                   <>
                    {stampStatus === 'idle' || stampStatus === 'error' ? (
                      <form onSubmit={handleApplyStamp} className="space-y-6">
                         <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                            <input type="text" placeholder="Folio del ticket" className="w-full pl-12 pr-4 py-5 bg-slate-50 border-2 rounded-2xl text-2xl font-mono font-black text-slate-800 uppercase focus:bg-white transition-all" value={ticketId} onChange={e => { setTicketId(e.target.value.toUpperCase()); setStampStatus('idle'); }} autoFocus />
                         </div>
                         {stampStatus === 'error' && <p className="text-xs text-red-600 font-bold text-center">{errorMsg}</p>}
                         <div className="flex gap-3">
                           <button type="button" onClick={() => setShowScanner(true)} className="p-5 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-200 transition-all"><Camera size={24}/></button>
                           <button type="submit" className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-95 transition-all">Aplicar Sello</button>
                         </div>
                      </form>
                    ) : stampStatus === 'loading' ? (
                      <div className="py-12 text-center space-y-4"><Loader2 className="animate-spin mx-auto text-blue-600" size={48}/><p className="font-black text-slate-800 uppercase tracking-widest text-xs">Validando Ticket...</p></div>
                    ) : (
                      <div className="py-12 text-center space-y-6 animate-fade-in"><div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner"><CheckCircle size={40} className="animate-bounce"/></div><div className="space-y-1"><h4 className="text-2xl font-black text-slate-900 tracking-tighter">¡Sello Aplicado!</h4><p className="text-sm text-slate-500">El descuento se reflejará al pagar en caseta.</p></div></div>
                    )}
                   </>
                 )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
