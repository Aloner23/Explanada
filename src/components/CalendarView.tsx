import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reservation } from '../types';
import { TABLES } from '../services/dataService';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalendarIcon, Clock, User, Mail, Phone, Trash2, Edit2, DollarSign, MessageCircle, Save } from 'lucide-react';
import { getLocalDateString } from '../utils/parkingLogic';
import { plaza, findPlazaSpace } from '../config/plaza';

const DEFAULT_SPACE = plaza.spaces[0];

interface CalendarViewProps {
    reservations: Reservation[];
    setReservations: React.Dispatch<React.SetStateAction<any>>;
    handleSave: (table: string, data: any, setter: any) => Promise<void>;
    handleDelete: (table: string, id: string, setter: any) => Promise<void>;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ reservations, setReservations, handleSave, handleDelete }) => {
    const [currentDate, setCurrentDate] = useState(new Date(getLocalDateString() + 'T12:00:00'));
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showEventForm, setShowEventForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Reservation | null>(null);

    // Form state
    const [resForm, setResForm] = useState<Partial<Reservation>>({
        status: 'confirmed',
        spaceId: DEFAULT_SPACE?.id,
        hallName: DEFAULT_SPACE?.name || '',
        startTime: '12:00',
        endTime: '17:00',
        totalAmount: 0,
        advancePayment: 0
    });

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { days, firstDay };
    };

    const { days, firstDay } = getDaysInMonth(currentDate);
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const changeMonth = (offset: number) => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
    };

    const isSameDay = (date1: Date, dateString: string) => {
        const d2 = new Date(dateString + 'T00:00:00');
        return date1.getDate() === d2.getDate() &&
            date1.getMonth() === d2.getMonth() &&
            date1.getFullYear() === d2.getFullYear();
    };

    const getEventsForDay = (day: number) => {
        const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        // Ajuste simple para comparación de fechas string YYYY-MM-DD
        const dateStr = checkDate.toISOString().split('T')[0];
        return reservations.filter(r => r.date === dateStr);
    };

    const handleDayClick = (day: number) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dateStr = date.toISOString().split('T')[0];
        setSelectedDate(dateStr);
    };

    const openNewEvent = () => {
        setEditingEvent(null);
        setResForm({
            status: 'confirmed',
            spaceId: DEFAULT_SPACE?.id,
            hallName: DEFAULT_SPACE?.name || '',
            date: selectedDate || getLocalDateString(),
            startTime: '12:00',
            endTime: '17:00'
        });
        setShowEventForm(true);
    };

    const editEvent = (event: Reservation) => {
        setEditingEvent(event);
        setResForm(event);
        setShowEventForm(true);
    };

    const [isProcessing, setIsProcessing] = useState(false);

    const saveEvent = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            // Save Reservation
            const payload = { ...resForm, id: resForm.id || `res-${Date.now()}` };
            await handleSave(TABLES.RESERVATIONS, payload, setReservations);

            // Create Transaction if Advance Payment exists and it's a new event or being edited
            if (resForm.advancePayment && resForm.advancePayment > 0) {
                const space = findPlazaSpace(resForm.spaceId) || findPlazaSpace(resForm.hallName);
                const transaction = {
                    type: 'RESERVATION',
                    subtype: 'EVENT',
                    spaceId: space?.id,
                    amount: resForm.advancePayment,
                    date: getLocalDateString(),
                    description: `Reserva: ${resForm.hallName} - ${resForm.clientName} (Anticipo)`,
                    status: 'completed',
                    paymentMethod: 'CASH',
                    created_at: new Date().toISOString()
                };
                await handleSave(TABLES.TRANSACTIONS, transaction, () => { });
            }

            setShowEventForm(false);
        } finally {
            setIsProcessing(false);
        }
    };

    const performDelete = async (id: string) => {
        if (isProcessing) return;
        if (!window.confirm('¿Estás seguro de eliminar este evento?')) return;
        setIsProcessing(true);
        try {
            // Safe fallback if id is undefined somehow
            const safeId = id || 'undefined';
            await handleDelete(TABLES.RESERVATIONS, safeId, setReservations);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- PAYMENT REGISTRATION FOR EVENTS ---
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentEvent, setPaymentEvent] = useState<Reservation | null>(null);
    const [paymentAmount, setPaymentAmount] = useState(0);

    const handleRegisterPayment = (evt: Reservation) => {
        const pending = (evt.totalAmount || 0) - (evt.advancePayment || 0);
        setPaymentEvent(evt);
        setPaymentAmount(pending); // Pre-fill with remaining balance
        setShowPaymentModal(true);
    };

    const saveAdditionalPayment = async () => {
        if (!paymentEvent || paymentAmount <= 0) return;

        const space = findPlazaSpace(paymentEvent.spaceId) || findPlazaSpace(paymentEvent.hallName);

        const isFullPayment = paymentAmount >= ((paymentEvent.totalAmount || 0) - (paymentEvent.advancePayment || 0));

        // 1. Create transaction
        const tx = {
            id: `res-pay-${Date.now()}`,
            type: 'RESERVATION',
            subtype: 'EVENT',
            spaceId: space?.id,
            amount: paymentAmount,
            date: getLocalDateString(),
            description: `${isFullPayment ? 'Liquidación' : 'Abono'} Reserva: ${paymentEvent.hallName} - ${paymentEvent.clientName}`,
            status: 'completed',
            paymentMethod: 'CASH',
            created_at: new Date().toISOString()
        };
        await handleSave(TABLES.TRANSACTIONS, tx, () => { });

        // 2. Update reservation's advancePayment (accumulate)
        const updatedReservation = {
            ...paymentEvent,
            advancePayment: (paymentEvent.advancePayment || 0) + paymentAmount
        };
        await handleSave(TABLES.RESERVATIONS, updatedReservation, setReservations);

        setShowPaymentModal(false);
        setPaymentEvent(null);
        setPaymentAmount(0);
    };

    return (
        <div className="space-y-10 animate-fade-in pb-24">
            {/* HEADER CALENDARIO */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 gap-8">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-[1.5rem] flex items-center justify-center shadow-sm">
                        <CalendarIcon size={32} />
                    </div>
                    <div>
                        <h3 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">
                            {monthNames[currentDate.getMonth()]} <span className="text-indigo-600">{currentDate.getFullYear()}</span>
                        </h3>
                        <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-2">Gestión de Reservaciones y Eventos</p>
                    </div>
                </div>
                <div className="flex gap-4 bg-slate-50 p-2 rounded-[1.5rem] border border-slate-100">
                    <button onClick={() => changeMonth(-1)} className="p-3 hover:bg-white hover:text-indigo-600 rounded-xl text-slate-400 transition-all hover:shadow-sm"><ChevronLeft size={24} /></button>
                    <div className="w-px h-8 bg-slate-200 self-center" />
                    <button onClick={() => changeMonth(1)} className="p-3 hover:bg-white hover:text-indigo-600 rounded-xl text-slate-400 transition-all hover:shadow-sm"><ChevronRight size={24} /></button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* GRID CALENDARIO */}
                <div className="lg:col-span-8 bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
                    <div className="grid grid-cols-7 mb-8">
                        {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                            <div key={day} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] py-2">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-4">
                        {Array.from({ length: firstDay }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square opacity-20">
                                <div className="w-full h-full border-2 border-dashed border-slate-100 rounded-[1.5rem]" />
                            </div>
                        ))}
                        {Array.from({ length: days }).map((_, i) => {
                            const day = i + 1;
                            const events = getEventsForDay(day);
                            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                            const dateStr = date.toISOString().split('T')[0];
                            const isSelected = selectedDate === dateStr;
                            const isToday = isSameDay(new Date(), dateStr);

                            return (
                                <button
                                    key={day}
                                    onClick={() => handleDayClick(day)}
                                    className={`
                                        aspect-square rounded-[2rem] relative flex flex-col items-center justify-start pt-4 transition-all duration-300 group
                                        ${isSelected ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-105 z-10' : 'bg-slate-50/50 text-slate-600 hover:bg-white hover:shadow-lg border border-transparent hover:border-slate-100'}
                                        ${isToday && !isSelected ? 'ring-4 ring-indigo-50 border-indigo-200' : ''}
                                    `}
                                >
                                    <span className={`text-lg font-black tracking-tight ${isSelected ? 'text-white' : 'text-slate-800'}`}>{day}</span>

                                    <div className="flex gap-1.5 mt-3 flex-wrap justify-center px-2">
                                        {events.map((ev, idx) => (
                                            <div
                                                key={idx}
                                                className={`w-2.5 h-2.5 rounded-full border-2 ${isSelected ? 'border-indigo-400 bg-white' : 'border-white'} ${ev.status === 'confirmed' ? 'bg-emerald-500' : ev.status === 'pending' ? 'bg-amber-500' : 'bg-rose-500 shadow-sm'}`}
                                            />
                                        ))}
                                    </div>
                                    
                                    {isToday && !isSelected && (
                                        <div className="absolute bottom-2 w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* SIDE PANEL: EVENTOS DEL DÍA */}
                <div className="lg:col-span-4 flex flex-col h-full gap-8">
                    <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl flex flex-col h-full min-h-[600px] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl" />
                        
                        <div className="flex justify-between items-center mb-10 relative z-10">
                            <div className="space-y-1">
                                <h4 className="font-black text-white text-xl uppercase tracking-tighter leading-none">
                                    {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : 'Agenda'}
                                </h4>
                                <p className="text-slate-500 font-bold text-[9px] uppercase tracking-widest">
                                    {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long' }) : 'Seleccione una fecha'}
                                </p>
                            </div>
                            {selectedDate && (
                                <button onClick={openNewEvent} className="w-12 h-12 bg-white text-slate-900 rounded-2xl shadow-xl hover:scale-110 hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center">
                                    <Plus size={24} strokeWidth={3} />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar relative z-10">
                            {!selectedDate ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-20">
                                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                                        <CalendarIcon size={32} className="opacity-20" />
                                    </div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center max-w-[180px] leading-relaxed">
                                        Selecciona una fecha para auditar eventos
                                    </p>
                                </div>
                            ) : getEventsForDay(parseInt(selectedDate.split('-')[2])).length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 py-20">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] italic mb-6">Sin compromisos para hoy</p>
                                    <button onClick={openNewEvent} className="px-6 py-3 bg-white/5 text-white/40 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Programar Evento</button>
                                </div>
                            ) : (
                                getEventsForDay(parseInt(selectedDate.split('-')[2])).map(evt => {
                                    const pending = (evt.totalAmount || 0) - (evt.advancePayment || 0);
                                    const hasPending = pending > 0;
                                    return (
                                        <div key={evt.id} className="bg-white/5 backdrop-blur-md p-6 rounded-[2rem] border border-white/10 group hover:bg-white/10 transition-all relative">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex gap-2">
                                                    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${evt.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>{evt.status}</span>
                                                    {hasPending && <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-400">Saldo: ${pending.toLocaleString()}</span>}
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                                                    <button onClick={() => editEvent(evt)} className="w-8 h-8 bg-white/10 text-white rounded-lg flex items-center justify-center hover:bg-indigo-500 transition-colors"><Edit2 size={14} /></button>
                                                    <button onClick={() => performDelete(evt.id)} className="w-8 h-8 bg-white/10 text-white rounded-lg flex items-center justify-center hover:bg-rose-500 transition-colors" disabled={isProcessing}>
                                                        {isProcessing ? <Clock size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            <h5 className="font-black text-white text-lg tracking-tight uppercase leading-none mb-4">{evt.hallName}</h5>
                                            
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 text-slate-400">
                                                    <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center shrink-0"><Clock size={14} /></div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">{evt.startTime} — {evt.endTime}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-slate-400">
                                                    <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center shrink-0"><User size={14} /></div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest truncate">{evt.clientName}</span>
                                                </div>
                                            </div>

                                            {hasPending && (
                                                <div className="mt-6 flex gap-3">
                                                    <button onClick={() => handleRegisterPayment(evt)} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2">
                                                        <DollarSign size={14} /> Cobrar
                                                    </button>
                                                    {evt.clientPhone && (
                                                        <button
                                                            onClick={() => {
                                                                const phone = evt.clientPhone!.replace(/\D/g, '');
                                                                const phoneNum = phone.startsWith('52') ? phone : `52${phone}`;
                                                                const msg = `Hola ${evt.clientName}, le recordamos que tiene un saldo pendiente de $${pending.toLocaleString()} por la reservación de ${evt.hallName} en ${plaza.name}. ¡Gracias!`;
                                                                window.open(`https://wa.me/${phoneNum}?text=${encodeURIComponent(msg)}`, '_blank');
                                                            }}
                                                            className="w-12 h-14 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center shadow-lg shadow-emerald-900/20"
                                                        >
                                                            <MessageCircle size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL FORMULARIO: MODAL CENTERED PREMIUM */}
            <AnimatePresence>
                {showEventForm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowEventForm(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl relative z-10 overflow-hidden"
                        >
                            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <div>
                                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">{editingEvent ? 'Editar Evento' : 'Nueva Reservación'}</h3>
                                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">Configuración técnica de la sesión</p>
                                </div>
                                <button onClick={() => setShowEventForm(false)} className="w-12 h-12 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"><X size={24} /></button>
                            </div>

                            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Espacio / Sala</label>
                                        <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-5 font-black text-[11px] uppercase tracking-widest outline-none focus:border-indigo-400 focus:bg-white transition-all appearance-none" value={resForm.spaceId || findPlazaSpace(resForm.hallName)?.id || ''} onChange={e => { const sp = findPlazaSpace(e.target.value); setResForm({ ...resForm, spaceId: sp?.id, hallName: sp?.name || '' }); }}>
                                            {plaza.spaces.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Estado Logístico</label>
                                        <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] px-6 py-5 font-black text-[11px] uppercase tracking-widest outline-none focus:border-indigo-400 focus:bg-white transition-all appearance-none" value={resForm.status} onChange={e => setResForm({ ...resForm, status: e.target.value as any })}>
                                            <option value="confirmed">Confirmada</option>
                                            <option value="pending">En Proceso</option>
                                            <option value="cancellation_requested">Sol. Cancelación</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Inversión Total</label>
                                        <div className="relative group">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl group-focus-within:text-indigo-600 transition-colors">$</span>
                                            <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-12 pr-6 py-5 font-black text-xl text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.totalAmount || ''} onChange={e => setResForm({ ...resForm, totalAmount: Number(e.target.value) })} placeholder="0.00" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Anticipo / Enganche</label>
                                        <div className="relative group">
                                            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xl group-focus-within:text-indigo-600 transition-colors">$</span>
                                            <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-12 pr-6 py-5 font-black text-xl text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.advancePayment || ''} onChange={e => setResForm({ ...resForm, advancePayment: Number(e.target.value) })} placeholder="0.00" />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Hora de Inicio</label>
                                        <div className="relative group">
                                            <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                            <input type="time" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.startTime} onChange={e => setResForm({ ...resForm, startTime: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Hora de Término</label>
                                        <div className="relative group">
                                            <Clock className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                            <input type="time" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.endTime} onChange={e => setResForm({ ...resForm, endTime: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Datos del Cliente</label>
                                    <div className="relative group">
                                        <User className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                        <input placeholder="Nombre Completo del Responsable" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.clientName} onChange={e => setResForm({ ...resForm, clientName: e.target.value })} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-8">
                                    <div className="relative group">
                                        <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                        <input placeholder="Email corporativo" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.clientEmail} onChange={e => setResForm({ ...resForm, clientEmail: e.target.value })} />
                                    </div>
                                    <div className="relative group">
                                        <Phone className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                                        <input placeholder="WhatsApp / Celular" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] pl-16 pr-6 py-5 font-bold text-slate-800 outline-none focus:border-indigo-400 focus:bg-white transition-all" value={resForm.clientPhone} onChange={e => setResForm({ ...resForm, clientPhone: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            <div className="p-10 border-t border-slate-100 flex justify-end gap-6 bg-slate-50/50">
                                <button onClick={() => setShowEventForm(false)} className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] px-8 py-4 hover:text-slate-600 transition-colors">Cancelar</button>
                                <button onClick={saveEvent} disabled={isProcessing} className="px-12 py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-4 disabled:opacity-50">
                                    {isProcessing ? <Clock size={18} className="animate-spin" /> : <Save size={18} />} 
                                    {isProcessing ? 'Guardando...' : 'Registrar Evento'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* MODAL PAGO ADICIONAL: CENTERED PREMIUM */}
            <AnimatePresence>
                {showPaymentModal && paymentEvent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowPaymentModal(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[3rem] shadow-2xl w-full max-w-md relative z-10 overflow-hidden"
                        >
                            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Registrar Pago</h3>
                                <button onClick={() => setShowPaymentModal(false)} className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="p-10 space-y-8">
                                <div className="bg-slate-900 p-8 rounded-[2rem] space-y-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12 blur-2xl" />
                                    <div className="space-y-1 relative z-10">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Resumen de Cuenta</p>
                                        <p className="font-black text-white text-lg tracking-tight uppercase">{paymentEvent.hallName}</p>
                                        <p className="text-slate-400 text-xs font-bold">{paymentEvent.clientName}</p>
                                    </div>
                                    <div className="pt-6 border-t border-white/10 flex justify-between items-end relative z-10">
                                        <div>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Saldo Pendiente</p>
                                            <p className="text-3xl font-black text-rose-400 tracking-tighter">${((paymentEvent.totalAmount || 0) - (paymentEvent.advancePayment || 0)).toLocaleString()}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Monto Total</p>
                                            <p className="text-lg font-black text-white tracking-tight">${paymentEvent.totalAmount?.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Importe a Liquidar</label>
                                    <div className="relative group">
                                        <span className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400 font-black text-3xl group-focus-within:text-indigo-600 transition-colors">$</span>
                                        <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] pl-16 pr-8 py-8 font-black text-5xl text-slate-900 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner" value={paymentAmount || ''} onChange={e => setPaymentAmount(Number(e.target.value))} />
                                    </div>
                                </div>
                            </div>

                            <div className="p-10 border-t border-slate-100 flex justify-end gap-6 bg-slate-50/50">
                                <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] px-8 py-4 hover:text-slate-600 transition-colors">Cancelar</button>
                                <button onClick={saveAdditionalPayment} className="px-12 py-6 bg-emerald-600 text-white rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 flex items-center gap-4">
                                    <DollarSign size={20} /> Confirmar Ingreso
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </div>

    );
}
