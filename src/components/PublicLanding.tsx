import { publicRequest } from '../services/publicService';
import React, { useState, useEffect } from 'react';
import { Reservation, GalleryImage, ParkingConfig } from '../types';
import { sendFolioEmail, sendCancellationAlert } from '../services/emailService';
import {
  Building, Car, Calendar, CreditCard, ChevronRight, MapPin, User, Clock,
  Star, Play, X, ShieldCheck, CheckCircle, Info, Wifi, Shield, Coffee,
  ShoppingBag, Camera, ZoomIn, ArrowRight, Image as ImageIcon, AlertCircle,
  Search, Trash2, Key, Mail, Send, Sun, Ticket, RefreshCw, Loader2, MessageSquare,
  AlertTriangle, Leaf, Users, Music, Dumbbell, History, Map, Heart, HelpCircle,
  MessageCircle, Instagram, Facebook, UserPlus
} from 'lucide-react';
import { LOGO_URL as DEFAULT_LOGO } from '../constants';
import { resolveImageUrl } from '../utils/imageLogic';
import { getLocalDateString } from '../utils/parkingLogic';
import { PlanSection3D } from './PlanSection3D';
import { plaza, findPlazaSpace, isPlazaHoliday, plazaSpacePrice, formatMoney } from '../config/plaza';

const waLink = (text: string) => `https://wa.me/${plaza.contact.whatsapp}?text=${encodeURIComponent(text)}`;

interface PublicLandingProps {
  reservations: Reservation[];
  onNewReservation: (res: Reservation, amount: number) => Promise<Reservation>;
  onCancelReservation: (resId: string) => void;
  onRequestCancellation: (resId: string, reason: string) => void;
  onEnterAdmin: () => void;
  galleryImages: GalleryImage[];
  parkingConfig: ParkingConfig;
  onDailyPassPaid?: (folio: string) => void;
}

export const PublicLanding: React.FC<PublicLandingProps> = ({
  reservations,
  onNewReservation,
  onCancelReservation,
  onRequestCancellation,
  onEnterAdmin,
  galleryImages,
  parkingConfig,
  onDailyPassPaid
}) => {
  const [activeModal, setActiveModal] = useState<'parking' | 'reservation' | 'service-info' | 'manage-res' | 'success' | 'parking-daily' | 'cancellation-reason' | 'contact' | null>(null);
  const [parkingFolio, setParkingFolio] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [galleryFilter, setGalleryFilter] = useState('todos');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [resForm, setResForm] = useState({
    date: getLocalDateString(),
    startTime: '12:00',
    endTime: '14:00',
    hall: plaza.spaces[0]?.id || '',
    name: '',
    email: ''
  });
  const [resError, setResError] = useState<string | null>(null);
  const [confirmedRes, setConfirmedRes] = useState<Reservation | null>(null);

  const [searchFolio, setSearchFolio] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundReservation, setFoundReservation] = useState<Reservation | null>(null);

  const activeLogo = parkingConfig?.logoUrl || DEFAULT_LOGO;
  const primaryImage = galleryImages.find(img => img.isPrimary) || galleryImages[0];
  const heroImageUrl = resolveImageUrl(primaryImage);

  const filteredGallery = galleryFilter === 'todos'
    ? galleryImages
    : galleryImages.filter(img => (img.category || '').toLowerCase() === galleryFilter.toLowerCase());

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  // Prices, weekend/holiday rules and the holiday calendar come from plaza.config.
  const priceLabel = (spaceId: string, dateStr: string) => {
    const space = findPlazaSpace(spaceId);
    const { amount, label } = plazaSpacePrice(space, dateStr);
    const suffix = label === 'holiday' ? ' (Día festivo)' : label === 'weekend' ? ' (Fin de semana)' : space?.pricing.weekend !== undefined ? ' (Lun-Jue)' : '';
    return `${formatMoney(amount, 0)}${suffix}`;
  };
  const spaceFrom = (space: { pricing: { base: number; blockHours?: number } }) =>
    `Desde ${formatMoney(space.pricing.base, 0)}${space.pricing.blockHours ? ` (${space.pricing.blockHours} h)` : ''}`;

  const handleReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const { date, startTime, endTime, hall, name, email } = resForm;
    if (!name || !email) return;
    setResError(null);

    const space = findPlazaSpace(hall);
    const hallName = space?.name || hall;
    const conflict = reservations.find(r =>
      r.date === date && (r.spaceId ? r.spaceId === space?.id : r.hallName === hallName) &&
      ((startTime >= r.startTime && startTime < r.endTime) || (endTime > r.startTime && endTime <= r.endTime))
    );
    if (conflict) { setResError(`Ocupado: ${hallName} ya está reservado en ese horario.`); return; }

    setIsProcessing(true);
    try {
      const saved = await onNewReservation({ id: '', date, startTime, endTime, spaceId: space?.id, hallName, clientName: name, clientEmail: email, status: 'pending' }, 0);
      setConfirmedRes(saved);
      setActiveModal('success');
    } catch (error: any) {
      setResError(error.message || 'No se pudo registrar la solicitud.');
    } finally {
      setIsSendingEmail(false);
      setIsProcessing(false);
    }
  };

  const handleSearchReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    try { setFoundReservation(await publicRequest('reservation-lookup', { id: searchFolio.trim().toUpperCase() })); }
    catch (error: any) { setFoundReservation(null); setSearchError(error.message); }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 scroll-smooth">
      {/* NAV */}
      <nav className="fixed top-0 w-full bg-white border-b border-slate-100 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={activeLogo} alt="Logo" className="h-10 w-auto object-contain" />
          <span className="font-black text-xl tracking-tighter text-slate-800 uppercase hidden sm:inline">{plaza.shortName}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="hidden xl:flex gap-5 items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
            {[
              { id: 'nosotros', label: 'Nosotros' },
              { id: 'galeria', label: 'Galería' },
              { id: 'servicios', label: 'Servicios' },
              { id: 'eventos', label: 'Eventos' },
              { id: 'llegar', label: 'Ubicación' },
              { id: 'contacto', label: 'Contacto' },
            ].map(s => (
              <button key={s.id} onClick={() => scrollToSection(s.id)} className="hover:text-blue-600 transition-colors">{s.label}</button>
            ))}
          </div>
          <div className="h-6 w-px bg-slate-200 hidden xl:block"></div>
          <button onClick={() => { setActiveModal('manage-res'); setSearchError(null); }} className="flex items-center gap-2 text-slate-600 hover:text-blue-600 text-sm font-bold transition-all"><Search size={16} /> Mi Reserva</button>
          <button onClick={onEnterAdmin} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg">Acceso Interno</button>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <header className="relative min-h-screen flex items-end pb-24 pt-32 overflow-hidden bg-slate-900">
        <div className="absolute inset-0 grid grid-cols-2 gap-4 p-4 opacity-30">
          {galleryImages.slice(0, 4).map((img, i) => (
            <div key={img.id} className="rounded-3xl overflow-hidden">
              <img src={resolveImageUrl(img)} className="w-full h-full object-cover" alt="" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-slate-900/40"></div>
        <div className="max-w-7xl mx-auto px-6 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-end w-full">
          <div className="space-y-8 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/10 backdrop-blur-sm text-white/80 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
              <Leaf size={12} /> {plaza.landing.heroBadge}
            </div>
            <h1 className="text-6xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter">
              {plaza.landing.heroTitle}<br />
              <span className="text-blue-400">{plaza.landing.heroSubtitle}</span>
            </h1>
            <p className="text-lg text-slate-300 max-w-lg leading-relaxed font-medium">
              {plaza.tagline}
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button onClick={() => scrollToSection('nosotros')} className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-50 shadow-2xl transition-all active:scale-95">Conocer más</button>
              <button onClick={() => scrollToSection('eventos')} className="px-8 py-4 bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white/20 transition-all">Reservar Evento</button>
            </div>
          </div>
          <div className="hidden lg:flex gap-4 items-end">
            {galleryImages.slice(0, 2).map((img, i) => (
              <div key={img.id} className={`rounded-[3rem] overflow-hidden shadow-2xl border-2 border-white/10 ${i === 0 ? 'h-[400px] flex-1' : 'h-[320px] w-[260px]'}`}>
                <img src={resolveImageUrl(img)} className="w-full h-full object-cover" alt={img.title} />
              </div>
            ))}
          </div>
        </div>
      </header>
      {/* ══════════ NUESTRA RAZÓN DE SER ══════════ */}
      <section id="nosotros" className="py-32 px-6 scroll-mt-20 bg-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-6">
            <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">NOSOTROS</span>
            <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">Nuestra razón de ser</h2>
            {plaza.landing.about.map((text, i) => (
              <p key={i} className={i === 0 ? 'text-lg text-slate-500 leading-relaxed font-medium' : 'text-slate-500 leading-relaxed'}>{text}</p>
            ))}
            <div className="grid grid-cols-2 gap-4 pt-4">
              {[
                { icon: Building, label: 'Locales Comerciales', desc: 'Espacios para tu negocio' },
                { icon: Calendar, label: 'Salones de Eventos', desc: 'Para toda celebración' },
                { icon: Car, label: 'Estacionamiento', desc: 'Amplio y vigilado' },
                { icon: Dumbbell, label: 'Área Deportiva', desc: 'Activación física' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <item.icon className="text-blue-600" size={18} />
                  </div>
                  <div>
                    <p className="font-black text-sm text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-[3rem] overflow-hidden shadow-2xl h-[500px]">
              <img src={heroImageUrl} className="w-full h-full object-cover" alt={plaza.name} />
            </div>
            <div className="absolute -bottom-8 -left-8 bg-white rounded-3xl shadow-xl p-6 border border-slate-100 max-w-[240px]">
              <p className="text-3xl font-black text-blue-600 mb-1">{plaza.landing.yearsLabel}</p>
              <p className="text-sm font-bold text-slate-500">{plaza.landing.yearsText}</p>
            </div>
          </div>
        </div>
      </section>

      {/* MASTER PLAN 3D */}
      <PlanSection3D />

      {/* ══════════ MISIÓN · VISIÓN · VALORES · PROPÓSITO ══════════ */}
      <section className="py-32 px-6 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute w-[600px] h-[600px] bg-blue-500 rounded-full blur-[200px] -top-40 -left-40 animate-pulse"></div>
          <div className="absolute w-[400px] h-[400px] bg-purple-500 rounded-full blur-[200px] bottom-0 right-0 animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20 space-y-4">
            <span className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em]">NUESTRA ESENCIA</span>
            <h2 className="text-4xl lg:text-6xl font-black tracking-tight">Lo que nos <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">define</span></h2>
            <p className="text-slate-400 text-lg font-medium max-w-2xl mx-auto">Los pilares que guían cada decisión y cada espacio en {plaza.name}.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                tag: 'Misión',
                title: 'Crear espacios que conectan',
                text: 'Brindar a la ciudad un centro comunitario integral que potencie el comercio local, la cultura y la convivencia familiar, generando valor económico y social para nuestra comunidad.',
                gradient: 'from-blue-500/20 to-blue-600/10',
                border: 'border-blue-500/30',
                accent: 'text-blue-400',
                icon: Heart,
              },
              {
                tag: 'Visión',
                title: 'Referente regional de convivencia',
                text: 'Ser reconocidos como el espacio de encuentro más innovador y querido de la ciudad, donde cada visita inspire pertenencia, cada emprendimiento prospere y cada familia cree memorias.',
                gradient: 'from-purple-500/20 to-purple-600/10',
                border: 'border-purple-500/30',
                accent: 'text-purple-400',
                icon: Star,
              },
              {
                tag: 'Valores',
                title: 'Lo que nos guía cada día',
                text: 'Comunidad · Integridad · Innovación · Responsabilidad · Hospitalidad. Creemos que los espacios bien cuidados generan confianza, y la confianza construye comunidades fuertes.',
                gradient: 'from-emerald-500/20 to-emerald-600/10',
                border: 'border-emerald-500/30',
                accent: 'text-emerald-400',
                icon: ShieldCheck,
              },
              {
                tag: 'Propósito',
                title: 'Impulsar lo que importa',
                text: 'Existimos para que las personas de la ciudad tengan un lugar donde crecer: sus negocios, sus celebraciones, sus lazos familiares y su bienestar. Cada espacio está pensado para impulsar lo que verdaderamente importa.',
                gradient: 'from-amber-500/20 to-amber-600/10',
                border: 'border-amber-500/30',
                accent: 'text-amber-400',
                icon: Leaf,
              },
            ].map((item, i) => (
              <div key={i} className={`bg-gradient-to-br ${item.gradient} backdrop-blur-sm rounded-[2rem] p-8 border ${item.border} hover:scale-[1.02] transition-all duration-500 group`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <item.icon className={item.accent} size={20} />
                  </div>
                  <span className={`${item.accent} font-black text-[10px] uppercase tracking-[0.3em]`}>{item.tag}</span>
                </div>
                <h3 className="text-xl font-black text-white mb-3">{item.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed font-medium">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ CONVIVE CON LA HISTORIA ══════════ */}
      <section className="py-32 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="grid grid-cols-2 gap-4 order-2 lg:order-1">
            {galleryImages.slice(0, 4).map((img, i) => (
              <div key={img.id} className={`rounded-[2rem] overflow-hidden shadow-lg ${i === 0 ? 'col-span-2 h-[280px]' : 'h-[200px]'}`}>
                <img src={resolveImageUrl(img)} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt={img.title} />
              </div>
            ))}
          </div>
          <div className="space-y-6 order-1 lg:order-2">
            <span className="text-emerald-600 font-black text-[10px] uppercase tracking-[0.3em]">NUESTRA HISTORIA</span>
            <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">Convive con la historia</h2>
            <p className="text-lg text-slate-500 leading-relaxed font-medium">
              Desde sus inicios, {plaza.name} ha sido testigo de miles de historias: celebraciones, reuniones familiares, emprendimientos que crecieron y comunidades que se fortalecieron.
            </p>
            <p className="text-slate-500 leading-relaxed">
              Nuestros espacios están diseñados para que cada visita sea una experiencia memorable: {plaza.spaces.map(sp => sp.name).join(', ')}.
            </p>
            <button onClick={() => scrollToSection('galeria')} className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all">
              Ver Galería <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* GALERÍA INTELIGENTE CON RESOLUTOR */}
      <section id="galeria" className="py-32 px-6 scroll-mt-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8">
            <div className="space-y-3">
              <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">📸 GALERÍA</span>
              <h2 className="text-5xl font-black text-slate-900 tracking-tight leading-none">Historias Visuales</h2>
              <p className="text-slate-500 text-lg font-medium">Un recorrido por el centro de nuestra comunidad.</p>
            </div>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto no-scrollbar shadow-inner">
              {['todos', 'general', 'exterior', 'locales', 'eventos'].map(cat => (
                <button key={cat} onClick={() => setGalleryFilter(cat)} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${galleryFilter === cat ? 'bg-white text-blue-600 shadow-md scale-105' : 'text-slate-500 hover:text-slate-800'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredGallery.map((img, idx) => {
              const displayUrl = resolveImageUrl(img);
              return (
                <div key={img.id} onClick={() => setSelectedImage(displayUrl)} className={`relative rounded-[3rem] overflow-hidden group cursor-pointer shadow-xl h-[350px] ${idx === 0 && galleryFilter === 'todos' ? 'lg:col-span-2 lg:h-[450px]' : ''}`}>
                  <img src={displayUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={img.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-8">
                    <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-1">{img.category}</p>
                    <h4 className="text-xl font-black text-white flex items-center gap-3">{img.title} <ZoomIn size={20} /></h4>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* MODAL PARA ZOOM DE IMAGEN */}
      {selectedImage && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6" onClick={() => setSelectedImage(null)}>
          <button className="absolute top-8 right-8 text-white hover:scale-110 transition-transform"><X size={40} /></button>
          <img src={selectedImage} className="max-w-full max-h-full rounded-3xl shadow-2xl animate-fade-in" alt="Zoom" />
        </div>
      )}

      {/* ══════════ SERVICIOS ══════════ */}
      <section id="servicios" className="py-32 px-6 scroll-mt-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 space-y-4">
            <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">⭐ SERVICIOS</span>
            <h2 className="text-5xl font-black text-slate-900 tracking-tight">Todo lo que necesitas</h2>
            <p className="text-slate-500 text-lg font-medium max-w-2xl mx-auto">Descubre los servicios y espacios que {plaza.name} tiene para ti.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Calendar, title: 'Eventos', desc: `${plaza.spaces.map(sp => sp.name).join(', ')} para todo tipo de celebraciones.`, color: 'blue', action: () => setActiveModal('reservation') },
              { icon: Car, title: 'Estacionamiento', desc: 'Estacionamiento vigilado con caseta de control, cobro automatizado y pensiones mensuales para clientes frecuentes.', color: 'emerald', action: () => setActiveModal('parking') },
              { icon: ShoppingBag, title: 'Locales', desc: 'Espacios comerciales disponibles para renta. Ideales para oficinas, consultorios, tiendas y servicios profesionales.', color: 'amber', action: () => scrollToSection('contacto') },
              { icon: Shield, title: 'Seguridad 24/7', desc: 'Personal de seguridad, circuito cerrado de CCTV y control de acceso para tu tranquilidad.', color: 'red', action: undefined },
            ].map((s, i) => (
              <div key={i} className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-100 hover:shadow-xl hover:-translate-y-2 transition-all group cursor-pointer" onClick={s.action}>
                <div className={`w-16 h-16 bg-${s.color}-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <s.icon className={`text-${s.color}-600`} size={28} />
                </div>
                <h3 className="font-black text-xl text-slate-800 mb-3">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">{s.desc}</p>
                {s.action && (
                  <div className="mt-6 flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-widest">
                    Más información <ArrowRight size={14} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ PARA QUIENES BUSCAN PERTENECER ══════════ */}
      <section className="py-32 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-6">
            <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">COMUNIDAD</span>
            <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">Para quienes buscan <span className="text-blue-600">pertenecer</span></h2>
            <p className="text-lg text-slate-500 leading-relaxed font-medium">
              {plaza.name} es más que un centro comercial — es una comunidad. Aquí encontrarás un ambiente seguro y profesional para desarrollar tu negocio, celebrar tus eventos y conectar con personas afines.
            </p>
            <div className="space-y-4">
              {[
                { icon: ShieldCheck, text: 'Seguridad las 24 horas con circuito cerrado' },
                { icon: Wifi, text: 'Infraestructura moderna y conectividad' },
                { icon: Users, text: 'Red de locatarios y emprendedores' },
                { icon: Heart, text: 'Espacios pensados para familias' },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <f.icon className="text-emerald-600" size={18} />
                  </div>
                  <p className="font-bold text-sm text-slate-700">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-[3rem] overflow-hidden shadow-2xl h-[480px] bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-12">
              <div className="text-center text-white space-y-6">
                <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-3xl flex items-center justify-center mx-auto">
                  <Star className="text-white" size={36} />
                </div>
                <h3 className="text-3xl font-black">¿Quieres formar parte?</h3>
                <p className="text-blue-100 font-medium">Conoce nuestros espacios disponibles y únete a la comunidad {plaza.name}.</p>
                <button onClick={() => scrollToSection('contacto')} className="px-8 py-4 bg-white text-blue-700 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-50 transition-all shadow-xl">
                  Contáctanos
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ IMAGINA QUE CONSTRUIR REALIDAD ══════════ */}
      <section className="py-32 px-6 bg-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="grid grid-cols-2 gap-4">
            {galleryImages.slice(2, 6).map((img, i) => (
              <div key={img.id} className={`rounded-[2rem] overflow-hidden shadow-lg ${i === 0 ? 'col-span-2 h-[260px]' : 'h-[180px]'}`}>
                <img src={resolveImageUrl(img)} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" alt={img.title} />
              </div>
            ))}
          </div>
          <div className="space-y-6">
            <span className="text-amber-600 font-black text-[10px] uppercase tracking-[0.3em]">VISIÓN</span>
            <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">Imagina que construir <span className="text-amber-500">Realidad</span></h2>
            <p className="text-lg text-slate-500 leading-relaxed font-medium">
              Cada espacio en {plaza.name} ha sido diseñado para potenciar tu visión. Ya sea un local comercial, un evento especial o una actividad deportiva, aquí encuentras el marco perfecto para crecer.
            </p>
            <button onClick={() => scrollToSection('eventos')} className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-amber-600 transition-all">
              Explorar Eventos <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════ CREEMOS EN ESPACIOS QUE CUIDAN TU INVERSIÓN ══════════ */}
      <section className="py-32 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] -translate-y-1/2 -translate-x-1/4"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20 space-y-4">
            <span className="text-emerald-400 font-black text-[10px] uppercase tracking-[0.3em]">VALOR</span>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight">Creemos en espacios que cuidan tu <span className="text-emerald-400">inversión</span></h2>
            <p className="text-slate-400 text-lg font-medium max-w-2xl mx-auto">Infraestructura de primer nivel con enfoque en seguridad, mantenimiento y crecimiento continuo.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: ShieldCheck, title: 'Seguridad integral', desc: 'Vigilancia 24/7, cámaras CCTV y control de acceso en todas las áreas.' },
              { icon: RefreshCw, title: 'Mantenimiento constante', desc: 'Equipo dedicado para mantener cada espacio en óptimas condiciones.' },
              { icon: Star, title: 'Plusvalía creciente', desc: 'Ubicación estratégica en la ciudad con alta demanda comercial.' },
            ].map((v, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-[2.5rem] p-8 border border-white/10 hover:border-emerald-500/40 transition-all">
                <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6">
                  <v.icon className="text-emerald-400" size={24} />
                </div>
                <h3 className="font-black text-xl mb-3">{v.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
          {/* PRODUCTOS Y SERVICIOS */}
          {/* STATS ROW */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 pt-16 border-t border-white/10">
            {[
              { value: plaza.landing.yearsLabel, label: 'Años de experiencia' },
              { value: String(plaza.locales.length), label: 'Locales y oficinas' },
              { value: String(plaza.spaces.length), label: 'Espacios para eventos' },
              { value: '24/7', label: 'Vigilancia continua' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl lg:text-5xl font-black text-emerald-400 mb-2">{stat.value}</p>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════ EVENTOS / RESERVACIONES ══════════ */}
      <section id="eventos" className="py-32 px-6 scroll-mt-20 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/4"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20 space-y-4">
            <span className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em]">🎉 EVENTOS</span>
            <h2 className="text-5xl font-black tracking-tight">Celebra con nosotros</h2>
            <p className="text-slate-400 text-lg font-medium max-w-2xl mx-auto">Espacios únicos para hacer tu evento inolvidable.</p>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(3, Math.max(1, plaza.spaces.length))} gap-8 mb-16`}>
            {plaza.spaces.map(sp => ({ name: sp.name, capacity: sp.capacity ? `~${sp.capacity}` : '—', price: spaceFrom(sp), desc: sp.description || '', features: sp.features || [] })).map((hall, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-[2.5rem] p-8 border border-white/10 hover:border-blue-500/40 hover:bg-white/10 transition-all group">
                <h3 className="font-black text-2xl text-white mb-2">{hall.name}</h3>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-blue-400 text-sm font-bold flex items-center gap-1"><Users size={14} /> {hall.capacity}</span>
                  <span className="text-emerald-400 text-sm font-bold">{hall.price}</span>
                </div>
                <p className="text-slate-400 text-sm mb-6">{hall.desc}</p>
                <ul className="space-y-2">
                  {hall.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle size={12} className="text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4">
            <button onClick={() => setActiveModal('reservation')} className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-500 shadow-2xl shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2">
              <Calendar size={18} /> Reservar Ahora
            </button>
            <button onClick={() => { setActiveModal('manage-res'); setSearchError(null); }} className="px-10 py-4 bg-white/10 text-white border border-white/20 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2">
              <Search size={18} /> Mi Reserva
            </button>
          </div>
        </div>
      </section>

      {/* ══════════ UBICACIÓN ══════════ */}
      <section id="llegar" className="py-32 px-6 scroll-mt-20 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">UBICACIÓN</span>
            <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">Sítuanos en el <span className="text-blue-600">centro</span></h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-6">
              {[
                { icon: MapPin, color: 'blue', title: 'Dirección', text: plaza.contact.address },
                { icon: Building, color: 'amber', title: 'Referencia', text: plaza.contact.reference },
                { icon: Clock, color: 'emerald', title: 'Horarios', text: plaza.contact.hours },
                { icon: Car, color: 'purple', title: 'Estacionamiento', text: 'Amplio estacionamiento disponible para visitantes' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-12 h-12 bg-${item.color}-100 rounded-2xl flex items-center justify-center flex-shrink-0`}>
                    <item.icon className={`text-${item.color}-600`} size={22} />
                  </div>
                  <div>
                    <p className="font-black text-slate-800 mb-1">{item.title}</p>
                    <p className="text-slate-500 font-medium text-sm whitespace-pre-line">{item.text}</p>
                  </div>
                </div>
              ))}
              <a href={plaza.contact.mapsUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 shadow-xl transition-all hover:scale-[1.02]">
                <Map size={18} /> Abrir en Google Maps
              </a>
            </div>
            <div className="rounded-[3rem] overflow-hidden shadow-2xl h-[500px] border-4 border-white sticky top-28">
              {/* Versión pública: el mapa embebido con la ubicación real se sustituyó por un marcador neutro. */}
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-blue-50 text-slate-400" role="img" aria-label="Mapa de ubicación (demo)">
                <MapPin size={48} className="text-blue-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Mapa de ubicación (demo)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════ CONTACTO ══════════ */}
      <section id="contacto" className="py-32 px-6 scroll-mt-20 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <span className="text-blue-600 font-black text-[10px] uppercase tracking-[0.3em]">CONTACTO</span>
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight mt-4 mb-4">¿Tienes preguntas?</h2>
          <p className="text-slate-500 text-lg font-medium mb-16 max-w-2xl mx-auto">Estamos aquí para ayudarte. Contáctanos y te responderemos lo antes posible.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <a href={waLink(`Hola, me interesa información sobre ${plaza.name}`)}
              target="_blank" rel="noopener noreferrer"
              className="bg-emerald-50 rounded-[2rem] p-6 border border-emerald-100 hover:shadow-xl hover:-translate-y-2 transition-all group cursor-pointer">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <MessageCircle className="text-emerald-600" size={24} />
              </div>
              <h3 className="font-black text-base text-slate-800 mb-1">WhatsApp</h3>
              <p className="text-slate-500 text-xs font-bold">{plaza.contact.whatsappLabel}</p>
            </a>

            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer"
              className="bg-pink-50 rounded-[2rem] p-6 border border-pink-100 hover:shadow-xl hover:-translate-y-2 transition-all group cursor-pointer">
              <div className="w-14 h-14 bg-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Instagram className="text-pink-600" size={24} />
              </div>
              <h3 className="font-black text-base text-slate-800 mb-1">Instagram</h3>
              <p className="text-slate-500 text-xs font-bold">{plaza.contact.instagram}</p>
            </a>

            <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer"
              className="bg-blue-50 rounded-[2rem] p-6 border border-blue-100 hover:shadow-xl hover:-translate-y-2 transition-all group cursor-pointer">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Facebook className="text-blue-600" size={24} />
              </div>
              <h3 className="font-black text-base text-slate-800 mb-1">Facebook</h3>
              <p className="text-slate-500 text-xs font-bold">{plaza.contact.facebook}</p>
            </a>

            <a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer"
              className="bg-slate-50 rounded-[2rem] p-6 border border-slate-200 hover:shadow-xl hover:-translate-y-2 transition-all group cursor-pointer">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <Play className="text-slate-700" size={24} />
              </div>
              <h3 className="font-black text-base text-slate-800 mb-1">TikTok</h3>
              <p className="text-slate-500 text-xs font-bold">{plaza.contact.tiktok}</p>
            </a>
          </div>
        </div>
      </section>

      {/* ══════════ MODALES ══════════ */}

      {/* MODAL RESERVACIÓN */}
      {activeModal === 'reservation' && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">Reservar Espacio</h3>
              <button onClick={() => setActiveModal(null)}><X className="text-slate-400" size={24} /></button>
            </div>
            <form onSubmit={handleReservation} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Nombre Completo *</label>
                <input type="text" required className="input-std w-full" placeholder="Tu nombre" value={resForm.name} onChange={e => setResForm({ ...resForm, name: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Email *</label>
                <input type="email" required className="input-std w-full" placeholder="tu@email.com" value={resForm.email} onChange={e => setResForm({ ...resForm, email: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Espacio</label>
                <select className="input-std w-full" value={resForm.hall} onChange={e => setResForm({ ...resForm, hall: e.target.value })}>
                  {plaza.spaces.map(sp => <option key={sp.id} value={sp.id}>{sp.name} — {spaceFrom(sp).toLowerCase()}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Fecha</label>
                  <input type="date" className="input-std w-full" value={resForm.date} onChange={e => setResForm({ ...resForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Inicio</label>
                  <input type="time" className="input-std w-full" value={resForm.startTime} onChange={e => setResForm({ ...resForm, startTime: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Fin</label>
                  <input type="time" className="input-std w-full" value={resForm.endTime} onChange={e => setResForm({ ...resForm, endTime: e.target.value })} />
                </div>
              </div>

              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-slate-700">Precio estimado:</span>
                  <span className="font-black text-2xl text-blue-600">{priceLabel(resForm.hall, resForm.date)}</span>
                </div>
              </div>

              {resError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-bold flex items-center gap-2">
                  <AlertCircle size={16} /> {resError}
                </div>
              )}

              <button type="submit" disabled={isProcessing || !resForm.name || !resForm.email}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-500 transition-all flex items-center justify-center gap-2 disabled:opacity-40 shadow-xl">
                {isSendingEmail ? <><Loader2 className="animate-spin" size={18} /> Enviando confirmación...</> :
                  isProcessing ? 'Procesando...' : <><Send size={16} /> Confirmar Reserva</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMACIÓN */}
      {activeModal === 'success' && confirmedRes && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="text-emerald-600" size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">Solicitud recibida</h3>
            <p className="text-slate-500 mb-6">Conserva este folio privado. Administración confirmará disponibilidad y pago.</p>
            <div className="bg-slate-50 rounded-2xl p-6 text-left space-y-2 mb-6 border border-slate-100">
              <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Folio:</span><span className="font-black text-blue-600 break-all max-w-[65%]">{confirmedRes.id}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Espacio:</span><span className="font-bold">{confirmedRes.hallName}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Fecha:</span><span className="font-bold">{confirmedRes.date}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Horario:</span><span className="font-bold">{confirmedRes.startTime} — {confirmedRes.endTime}</span></div>
            </div>
            <p className="text-xs text-amber-600 font-bold mb-4 flex items-center justify-center gap-1">
              <AlertTriangle size={14} /> Guarda tu folio para consultar o cancelar tu reserva
            </p>
            <button onClick={() => setActiveModal(null)} className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all">
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* MODAL BUSCAR / GESTIONAR RESERVA */}
      {activeModal === 'manage-res' && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">Mi Reserva</h3>
              <button onClick={() => { setActiveModal(null); setFoundReservation(null); }}><X className="text-slate-400" size={24} /></button>
            </div>

            {!foundReservation ? (
              <form onSubmit={handleSearchReservation} className="space-y-4">
                <p className="text-slate-500 text-sm font-medium">Ingresa tu folio para consultar o cancelar tu reserva.</p>
                <input type="text" className="input-std w-full text-center text-lg tracking-widest" placeholder="RES-XXXXXX"
                  value={searchFolio} onChange={e => setSearchFolio(e.target.value.toUpperCase())} />
                {searchError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 font-bold flex items-center gap-2">
                    <AlertCircle size={16} /> {searchError}
                  </div>
                )}
                <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                  <Search size={16} /> Buscar
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 rounded-2xl p-6 space-y-3 border border-slate-100">
                  <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Folio:</span><span className="font-black text-blue-600">{foundReservation.id}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Cliente:</span><span className="font-bold">{foundReservation.clientName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Espacio:</span><span className="font-bold">{foundReservation.hallName}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Fecha:</span><span className="font-bold">{foundReservation.date}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500 font-bold">Horario:</span><span className="font-bold">{foundReservation.startTime} — {foundReservation.endTime}</span></div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 font-bold">Estado:</span>
                    <span className={`font-black px-3 py-1 rounded-full text-xs ${foundReservation.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                      foundReservation.status === 'cancellation_requested' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                      {foundReservation.status === 'confirmed' ? '✅ Confirmada' : foundReservation.status === 'cancellation_requested' ? '🚫 Cancelación Solicitada' : '⏳ Pendiente'}
                    </span>
                  </div>
                </div>

                {foundReservation.status === 'confirmed' && (
                  <button onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseas solicitar la cancelación de tu reserva?')) {
                      onRequestCancellation(foundReservation.id, 'Cancelación solicitada por el cliente');
                      setFoundReservation({ ...foundReservation, status: 'cancellation_requested' });
                    }
                  }} className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2">
                    <Trash2 size={16} /> Solicitar Cancelación
                  </button>
                )}

                <button onClick={() => { setFoundReservation(null); setSearchFolio(''); }}
                  className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 transition-all">
                  Buscar Otro Folio
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL ESTACIONAMIENTO INFO */}
      {activeModal === 'parking' && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setActiveModal(null)}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3"><Car className="text-blue-600" /> Estacionamiento</h3>
              <button onClick={() => setActiveModal(null)}><X className="text-slate-400" size={24} /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100">
                <h4 className="font-black text-blue-800 mb-3">Tarifas</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Primeros {parkingConfig?.freeMinutes ?? 15} min</span><span className="font-black text-slate-800">Gratis</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Por hora</span><span className="font-black text-slate-800">${parkingConfig?.hourlyRate || 15}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Máximo diario</span><span className="font-black text-slate-800">${parkingConfig?.dailyMax || 100}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pensión mensual</span><span className="font-black text-slate-800">$400</span></div>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
                <h4 className="font-black text-emerald-800 mb-3">Horario</h4>
                <p className="text-sm text-slate-600">Lun – Vie: 9:00 AM a 8:00 PM · Sáb – Dom: 10:00 AM a 6:00 PM</p>
                <p className="text-xs text-slate-400 mt-2">Caseta de control con personal de seguridad</p>
              </div>
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100 text-sm">
                <Info className="text-amber-600 flex-shrink-0" size={18} />
                <p className="text-amber-700 font-medium">Los locatarios y clientes con pensión tienen acceso preferencial con identificación.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ¿TE GUSTARÍA VISITARNOS? CTA ══════════ */}
      <section className="py-28 px-6 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute w-[500px] h-[500px] bg-white rounded-full blur-[200px] -top-20 left-1/2 -translate-x-1/2 animate-pulse"></div>
        </div>
        <div className="max-w-3xl mx-auto space-y-8 relative z-10">
          <h2 className="text-4xl lg:text-5xl font-black tracking-tight">¿Te gustaría <span className="text-blue-200">Visitarnos?</span></h2>
          <p className="text-blue-100 text-lg font-medium">Agenda una visita y conoce en persona nuestros espacios comerciales, salones y áreas comunes.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href={waLink(`Hola, me gustaría visitar ${plaza.name}`)} target="_blank" rel="noopener noreferrer"
              className="px-8 py-4 bg-white text-blue-700 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-50 shadow-xl transition-all hover:scale-105 flex items-center gap-2">
              <MessageCircle size={18} /> Agendar Visita
            </a>
            <button onClick={() => scrollToSection('llegar')} className="px-8 py-4 bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2">
              <MapPin size={18} /> Cómo Llegar
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-white pt-20 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="bg-white rounded-xl px-3 py-2 flex items-center">
                  <img src={activeLogo} className="h-8 w-auto object-contain" alt={plaza.name} />
                </div>
                <span className="font-black text-xl tracking-tighter uppercase">{plaza.shortName}</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed max-w-md">Centro comunitario y de servicios en el corazón de Ciudad Demo. Locales comerciales, salones de eventos, estacionamiento y más.</p>
              <p className="text-slate-500 text-xs font-medium">{plaza.contact.address}</p>
              <div className="flex gap-3 pt-2">
                <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-pink-500/30 transition-all" title="Instagram">
                  <Instagram size={18} />
                </a>
                <a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-blue-500/30 transition-all" title="Facebook">
                  <Facebook size={18} />
                </a>
                <a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-slate-500/30 transition-all" title="TikTok">
                  <Play size={18} />
                </a>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-300">Navegación</h4>
              <div className="space-y-2">
                {[
                  { id: 'nosotros', label: 'Nosotros' },
                  { id: 'galeria', label: 'Galería' },
                  { id: 'servicios', label: 'Servicios' },
                  { id: 'eventos', label: 'Eventos' },
                  { id: 'llegar', label: 'Ubicación' },
                  { id: 'contacto', label: 'Contacto' },
                ].map(s => (
                  <button key={s.id} onClick={() => scrollToSection(s.id)} className="block text-slate-400 hover:text-white text-sm font-medium transition-colors">{s.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-black text-sm uppercase tracking-widest text-slate-300">Contacto</h4>
              <div className="space-y-3">
                <a href={`https://wa.me/${plaza.contact.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors">
                  <MessageCircle size={14} /> +52 1 000-000-0000
                </a>
                <p className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                  <Clock size={14} /> L-V 9am–8pm · S-D 10am–6pm
                </p>
                <p className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                  <MapPin size={14} /> Ciudad Demo
                </p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">© {new Date().getFullYear()} {plaza.name} · Con tecnología de Explanada</p>
            <button onClick={onEnterAdmin} className="text-xs text-slate-500 hover:text-white font-bold uppercase tracking-widest transition-colors">Acceso Interno</button>
          </div>
        </div>
      </footer>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .input-std { padding: 12px 16px; border: 2px solid #e2e8f0; border-radius: 16px; font-size: 14px; font-weight: 600; background: #f8fafc; transition: all 0.2s; outline: none; }
        .input-std:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 4px rgba(59,130,246,0.1); }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.5s ease forwards; }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-float { animation: float 6s ease-in-out infinite; }
      `}</style>
    </div>
  );
};
