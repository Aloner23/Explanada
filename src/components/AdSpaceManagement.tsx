import React, { useState, useEffect, useRef } from 'react';
import { AdSpace, Transaction } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { Plus, Trash2, Edit2, Save, X, Search, FileText, CircleCheck, Loader2, ExternalLink, Calendar, MapPin, DollarSign, Smartphone, User } from 'lucide-react';
import { getLocalDateString, formatLocalDate } from '../utils/parkingLogic';
import { DocumentPreviewButton } from './ui/DocumentPreview';

interface AdSpaceManagementProps {
    currentUser: any;
}

export const AdSpaceManagement: React.FC<AdSpaceManagementProps> = ({ currentUser }) => {
    const [spaces, setSpaces] = useState<AdSpace[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const contractInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState<Partial<AdSpace>>({
        status: 'available',
        amount: 0,
        paymentStatus: 'pending'
    });

    useEffect(() => {
        loadSpaces();
    }, []);

    const loadSpaces = async () => {
        const data = await dataService.getRecords(TABLES.AD_SPACES || 'plz_ad_spaces');
        setSpaces(data);
    };

    const handleSave = async () => {
        if (!form.name || !form.amount) return alert("Nombre y Monto requeridos");

        const id = editingId || `ad-${Date.now()}`;
        const newSpace: AdSpace = {
            id,
            name: form.name!,
            location: form.location || '',
            dimensions: form.dimensions || '',
            amount: Number(form.amount),
            status: form.status as any,
            lesseeName: form.lesseeName || '',
            lesseePhone: form.lesseePhone || '',
            contractUrl: form.contractUrl || '',
            paymentStatus: form.paymentStatus as any || 'pending',
            nextPaymentDate: form.nextPaymentDate || ''
        };

        await dataService.upsertRecord(TABLES.AD_SPACES || 'plz_ad_spaces', newSpace);
        await loadSpaces();
        setShowForm(false);
        setForm({ status: 'available', amount: 0, paymentStatus: 'pending' });
        setEditingId(null);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar espacio publicitario?")) return;
        await dataService.deleteRecord(TABLES.AD_SPACES || 'plz_ad_spaces', id);
        loadSpaces();
    };

    const handleFileUpload = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const url = await dataService.uploadFile(file);
            if (url) setForm(prev => ({ ...prev, contractUrl: url }));
        } catch (error) {
            console.error("Error uploading contract:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const registerPayment = async (space: AdSpace) => {
        if (!confirm(`¿Registrar pago de $${space.amount} para ${space.name}?`)) return;

        const newTx: Transaction = {
            id: `tx-ad-${Date.now()}`,
            type: 'AD_INCOME',
            subtype: 'AD_SPACE',
            amount: space.amount,
            date: getLocalDateString(),
            description: `Renta Espacio Publicitario: ${space.name} (${space.lesseeName})`,
            status: 'completed',
            paymentMethod: 'CASH', // Default for now
            registeredBy: currentUser.username,
            created_at: new Date().toISOString()
        };

        await dataService.upsertRecord(TABLES.TRANSACTIONS, newTx);

        // Update next payment date (simple +1 month logic)
        const nextDate = new Date();
        nextDate.setMonth(nextDate.getMonth() + 1);

        await dataService.upsertRecord(TABLES.AD_SPACES || 'plz_ad_spaces', {
            ...space,
            paymentStatus: 'paid',
            nextPaymentDate: getLocalDateString(nextDate)
        });

        alert("Pago registrado y fecha actualizada.");
        loadSpaces();
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex justify-between items-center bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Espacios Publicitarios</h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Gestión de Rentas y Contratos</p>
                </div>
                <button onClick={() => { setEditingId(null); setForm({ status: 'available', amount: 0 }); setShowForm(true); }} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:scale-105 transition-transform flex items-center gap-3">
                    <Plus size={18} /> Nuevo Espacio
                </button>
            </div>

            {showForm && (
                <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-2xl space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                    <h3 className="font-black text-xl text-slate-800 uppercase tracking-tighter mb-6">{editingId ? 'Editar Espacio' : 'Nuevo Espacio Publicitario'}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalles del Espacio</label>
                            <input placeholder="Nombre Identificador" className="input-std w-full" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                            <input placeholder="Ubicación" className="input-std w-full" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
                            <input placeholder="Medidas" className="input-std w-full" value={form.dimensions || ''} onChange={e => setForm({ ...form, dimensions: e.target.value })} />
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input type="number" placeholder="Renta Mensual" className="input-std w-full pl-10" value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Arrendatario</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input placeholder="Nombre Cliente" className="input-std w-full pl-10" value={form.lesseeName || ''} onChange={e => setForm({ ...form, lesseeName: e.target.value })} />
                            </div>
                            <div className="relative">
                                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input placeholder="Teléfono" className="input-std w-full pl-10" value={form.lesseePhone || ''} onChange={e => setForm({ ...form, lesseePhone: e.target.value })} />
                            </div>
                            <select className="input-std w-full" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                                <option value="available">Disponible</option>
                                <option value="rented">Rentado</option>
                                <option value="maintenance">Mantenimiento</option>
                            </select>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrato</label>
                            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center gap-4 text-center">
                                {form.contractUrl ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CircleCheck className="text-emerald-500" size={32} />
                                        <span className="text-xs font-black text-emerald-600 uppercase">Contrato Cargado</span>
                                        <DocumentPreviewButton url={form.contractUrl} className="text-[10px] text-blue-500 underline uppercase font-bold flex items-center gap-1" label={<><ExternalLink size={10} /> Ver Documento</>} />
                                    </div>
                                ) : (
                                    <div className="text-slate-400">
                                        <FileText size={32} className="mx-auto mb-2 opacity-50" />
                                        <span className="text-[10px] uppercase font-bold">Sin Contrato</span>
                                    </div>
                                )}
                                <button type="button" onClick={() => contractInputRef.current?.click()} className="w-full py-3 bg-white border border-slate-200 rounded-xl font-black text-[10px] uppercase hover:bg-slate-100 transition-colors">
                                    {isUploading ? <Loader2 className="animate-spin mx-auto" size={14} /> : (form.contractUrl ? 'Cambiar Archivo' : 'Subir Referencia')}
                                </button>
                                <input type="file" ref={contractInputRef} className="hidden" onChange={handleFileUpload} accept="application/pdf,image/*" />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                        <button onClick={() => setShowForm(false)} className="px-6 py-3 rounded-xl text-slate-400 font-black text-xs uppercase hover:bg-slate-50">Cancelar</button>
                        <button onClick={handleSave} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-blue-200 hover:shadow-blue-400 transition-all">Guardar</button>
                    </div>
                </div>
            )}

            {/* SPACES GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {spaces.map(space => (
                    <div key={space.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                        <div className={`absolute top-0 right-0 px-4 py-2 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest ${space.status === 'rented' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {space.status === 'rented' ? 'Rentado' : space.status === 'available' ? 'Disponible' : 'Mantenimiento'}
                        </div>

                        <div className="mb-6">
                            <h3 className="font-black text-lg text-slate-800 uppercase tracking-tight truncate">{space.name}</h3>
                            <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase mt-1">
                                <MapPin size={12} /> {space.location} ({space.dimensions})
                            </div>
                        </div>

                        {space.status === 'rented' && (
                            <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <User size={14} className="text-blue-500" /> {space.lesseeName}
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <Smartphone size={14} className="text-green-500" /> {space.lesseePhone}
                                </div>
                                {space.nextPaymentDate && (
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 pt-2 border-t border-slate-100 mt-2">
                                        <Calendar size={12} /> Vence: {formatLocalDate(space.nextPaymentDate)}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                            <div className="font-black text-xl text-slate-900">${space.amount.toLocaleString()}</div>
                            <div className="flex gap-2">
                                {space.status === 'rented' && (
                                    <button onClick={() => registerPayment(space)} className="p-2 bg-emerald-100 text-emerald-600 rounded-xl hover:bg-emerald-200 transition-colors" title="Registrar Pago">
                                        <DollarSign size={18} />
                                    </button>
                                )}
                                <button onClick={() => { setEditingId(space.id); setForm(space); setShowForm(true); }} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
                                    <Edit2 size={18} />
                                </button>
                                <button onClick={() => handleDelete(space.id)} className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
