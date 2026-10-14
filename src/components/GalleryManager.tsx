
import React, { useState, useRef } from 'react';
import { GalleryImage } from '../types';
import { dataService, TABLES } from '../services/dataService';
import { 
    Plus, Image as ImageIcon, Trash2, ExternalLink, 
    Upload, X, Check, Loader2, Filter, Grid, List,
    Search, Camera, Layout, Calendar, Tag, ChevronRight,
    Maximize2, Download, Trash, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from './ui/ServeToast';
import { plaza } from '../config/plaza';

interface GalleryManagerProps {
    images: GalleryImage[];
    onUpdate: () => void;
}

export const GalleryManager: React.FC<GalleryManagerProps> = ({ images, onUpdate }) => {
    const { toast } = useToast();
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
    const [formData, setFormData] = useState<Partial<GalleryImage>>({ 
        category: 'general',
        title: '',
        url: ''
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const categories = [
        { id: 'all', name: 'Todos' },
        { id: 'general', name: 'General' },
        { id: 'locales', name: 'Locales' },
        { id: 'eventos', name: 'Eventos' },
        { id: 'estacionamiento', name: 'Parking' }
    ];

    const filteredImages = images.filter(img => {
        const matchesCategory = filter === 'all' || img.category === filter;
        const matchesSearch = String(img.title || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    }).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            return toast("La imagen es demasiado grande (máx 5MB)", "error");
        }

        setIsUploading(true);
        try {
            const url = await dataService.uploadFile(file);
            if (url) {
                setFormData(prev => ({ ...prev, url }));
                toast("Imagen lista para guardar", "success");
            }
        } catch (error) {
            toast("Error al subir el archivo", "error");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.url) return toast("Debe subir una imagen primero", "error");
        
        setIsSaving(true);
        try {
            const newImage: GalleryImage = {
                id: formData.id || `img-${Date.now()}`,
                title: formData.title || 'Nueva Imagen',
                url: formData.url,
                category: formData.category || 'general',
                created_at: formData.created_at || new Date().toISOString()
            };

            await dataService.upsertRecord(TABLES.GALLERY, newImage);
            onUpdate();
            setShowForm(false);
            setFormData({ category: 'general', title: '', url: '' });
            toast("Imagen guardada", "success");
        } catch (error: any) {
            toast("Error al guardar registro", "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro de eliminar esta imagen?")) return;
        try {
            await dataService.deleteRecord(TABLES.GALLERY, id);
            onUpdate();
            toast("Imagen eliminada", "success");
        } catch (error: any) {
            toast("Error al eliminar", "error");
        }
    };

    return (
        <div className="space-y-10 animate-fade-in pb-20">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Galería</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Gestión visual de {plaza.name}</p>
                </div>
                <button 
                    onClick={() => setShowForm(true)}
                    className="bg-slate-900 text-white rounded-2xl px-8 py-4 font-black text-xs uppercase tracking-widest transition-all flex items-center gap-3 hover:bg-blue-600 shadow-xl"
                >
                    <Plus size={16} /> Nueva Imagen
                </button>
            </header>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setFilter(cat.id)}
                        className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === cat.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {filteredImages.map(img => (
                    <motion.div 
                        layout
                        key={img.id}
                        className="group bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-2xl transition-all relative aspect-square"
                    >
                        <img 
                            src={img.url} 
                            alt={img.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-8 flex flex-col justify-end gap-4">
                            <h5 className="text-white font-black text-lg leading-tight uppercase">{img.title}</h5>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setSelectedImage(img)}
                                    className="flex-1 py-3 bg-white/20 backdrop-blur-md text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-900 transition-all"
                                >
                                    Ver
                                </button>
                                <button 
                                    onClick={() => handleDelete(img.id)}
                                    className="w-12 h-12 bg-red-500/20 backdrop-blur-md text-red-100 rounded-xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="absolute top-6 right-6">
                            <span className="px-3 py-1 bg-white/90 backdrop-blur-md rounded-lg text-[8px] font-black uppercase tracking-widest text-slate-800 border border-white/20 shadow-sm">
                                {img.category}
                            </span>
                        </div>
                    </motion.div>
                ))}

                {filteredImages.length === 0 && (
                    <div className="col-span-full py-40 flex flex-col items-center gap-6 text-slate-300">
                        <ImageIcon size={64} strokeWidth={1} />
                        <p className="text-sm font-black uppercase tracking-widest">No se encontraron imágenes</p>
                    </div>
                )}
            </div>

            {/* Modal Form */}
            <AnimatePresence>
                {showForm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowForm(false)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[3rem] p-10 shadow-2xl w-full max-w-xl relative z-10"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Nueva Imagen</h4>
                                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
                            </div>

                            <div className="space-y-6">
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full aspect-video rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all overflow-hidden relative"
                                >
                                    {formData.url ? (
                                        <img src={formData.url} className="w-full h-full object-cover" alt="Preview" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-3">
                                            <Upload className="text-slate-300" size={32} />
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Click para subir foto</p>
                                        </div>
                                    )}
                                    {isUploading && (
                                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                            <Loader2 className="animate-spin text-blue-600" />
                                        </div>
                                    )}
                                </div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Título de la imagen</label>
                                    <input 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all"
                                        placeholder="Ej. Entrada principal"
                                        value={formData.title}
                                        onChange={e => setFormData({...formData, title: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Categoría</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-bold text-slate-700 outline-none focus:border-blue-400 transition-all appearance-none"
                                        value={formData.category}
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                    >
                                        {categories.filter(c => c.id !== 'all').map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <button 
                                    onClick={handleSave}
                                    disabled={isSaving || isUploading}
                                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-3 mt-4 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} />} Guardar Imagen
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Stats / Overview Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Medios</p>
                    <p className="text-3xl font-black text-slate-900">{images.length}</p>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Este Mes</p>
                    <p className="text-3xl font-black text-blue-600">
                        {images.filter(img => new Date(img.created_at || 0).getMonth() === new Date().getMonth()).length}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Publicidad</p>
                    <p className="text-3xl font-black text-emerald-600">
                        {images.filter(img => img.category === 'estacionamiento').length}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Categorías</p>
                    <p className="text-3xl font-black text-slate-900">{categories.length - 1}</p>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-white p-3 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="flex gap-2 p-1 bg-slate-50 rounded-[2rem] w-full lg:w-auto overflow-x-auto">
                    {categories.map(cat => (
                        <button 
                            key={cat.id}
                            onClick={() => setFilter(cat.id)}
                            className={`px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === cat.id ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-6 w-full lg:w-auto">
                    <div className="relative flex-1 lg:w-80">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                        <input 
                            className="w-full bg-slate-50 border-none rounded-2xl pl-16 pr-6 py-4 font-black text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                            placeholder="Buscar por título..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-3 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-900'}`}
                        >
                            <Grid size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-3 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-900'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <AnimatePresence mode="wait">
                {viewMode === 'grid' ? (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8"
                    >
                        {filteredImages.map(img => (
                            <motion.div 
                                key={img.id}
                                layout
                                whileHover={{ y: -8 }}
                                className="group relative bg-white rounded-[3rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl transition-all aspect-[4/5]"
                            >
                                <img src={img.url} alt={img.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                                
                                {/* Overlay Bottom */}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 p-8 flex flex-col justify-end translate-y-4 group-hover:translate-y-0">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="bg-blue-600 text-white text-[8px] font-black uppercase px-3 py-1 rounded-full border border-blue-400/30 tracking-widest">{img.category}</span>
                                        <span className="text-white/40 text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                                            <Calendar size={10} /> {new Date(img.created_at || '').toLocaleDateString()}
                                        </span>
                                    </div>
                                    <h5 className="text-white font-black text-xl uppercase tracking-tighter leading-tight mb-6 line-clamp-2">{img.title}</h5>
                                    
                                    <div className="flex gap-3">
                                        <button 
                                            onClick={() => setSelectedImage(img)}
                                            className="flex-1 bg-white/10 hover:bg-white text-white hover:text-slate-900 backdrop-blur-xl py-4 rounded-2xl flex items-center justify-center transition-all font-black text-[10px] uppercase tracking-widest gap-2"
                                        >
                                            <Maximize2 size={14} /> Ver
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(img.id)}
                                            className="w-14 h-14 bg-red-500/20 hover:bg-red-500 backdrop-blur-xl text-red-200 hover:text-white rounded-2xl flex items-center justify-center transition-all border border-red-500/30"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                        
                        {filteredImages.length === 0 && (
                            <div className="col-span-full py-40 flex flex-col items-center gap-8 text-center">
                                <div className="w-40 h-40 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 border-4 border-dashed border-slate-100">
                                    <ImageIcon size={64} strokeWidth={1} />
                                </div>
                                <div className="space-y-4">
                                    <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-2xl">Galería Vacía</p>
                                    <p className="text-slate-400 text-sm font-medium max-w-md">No hemos encontrado activos que coincidan con tu búsqueda.</p>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden"
                    >
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Activo</th>
                                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Título y Metadata</th>
                                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</th>
                                    <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredImages.map(img => (
                                    <tr key={img.id} className="hover:bg-slate-50/50 transition-all group">
                                        <td className="p-8">
                                            <div className="w-24 h-24 rounded-3xl overflow-hidden border border-slate-200 group-hover:scale-105 transition-transform shadow-sm">
                                                <img src={img.url} alt={img.title} className="w-full h-full object-cover" />
                                            </div>
                                        </td>
                                        <td className="p-8">
                                            <h5 className="font-black text-slate-800 text-xl tracking-tight uppercase mb-1">{img.title}</h5>
                                            <div className="flex items-center gap-4 text-slate-400">
                                                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                                    <Calendar size={12} /> {new Date(img.created_at || '').toLocaleDateString()}
                                                </span>
                                                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
                                                    <Tag size={12} /> {img.category}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-8">
                                            <span className={`px-5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${
                                                img.category === 'estacionamiento' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                img.category === 'eventos' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                                'bg-slate-100 text-slate-500 border-slate-200'
                                            }`}>
                                                {img.category}
                                            </span>
                                        </td>
                                        <td className="p-8 text-right">
                                            <div className="flex justify-end gap-4">
                                                <button 
                                                    onClick={() => setSelectedImage(img)}
                                                    className="p-4 bg-slate-50 text-slate-400 hover:bg-slate-900 hover:text-white rounded-2xl transition-all"
                                                >
                                                    <Maximize2 size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(img.id)}
                                                    className="p-4 bg-slate-50 text-slate-400 hover:bg-red-500 hover:text-white rounded-2xl transition-all"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Lightbox / Preview */}
            <AnimatePresence>
                {selectedImage && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setSelectedImage(null)}
                            className="absolute inset-0 bg-slate-950/95 backdrop-blur-2xl"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative z-10 w-full max-w-6xl aspect-video md:aspect-auto bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl border border-white/10"
                        >
                            <img src={selectedImage.url} className="w-full h-full object-contain max-h-[80vh]" alt="Full View" />
                            
                            <div className="absolute top-8 right-8 flex gap-4">
                                <a 
                                    href={selectedImage.url} download 
                                    className="w-14 h-14 bg-white/10 hover:bg-white text-white hover:text-slate-900 rounded-full flex items-center justify-center backdrop-blur-xl transition-all border border-white/10"
                                >
                                    <Download size={24} />
                                </a>
                                <button 
                                    onClick={() => setSelectedImage(null)}
                                    className="w-14 h-14 bg-white/10 hover:bg-red-500 text-white rounded-full flex items-center justify-center backdrop-blur-xl transition-all border border-white/10"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 p-12 bg-gradient-to-t from-black via-black/60 to-transparent">
                                <span className="bg-blue-600 text-white text-[9px] font-black uppercase px-4 py-1.5 rounded-full mb-4 inline-block tracking-[0.2em]">{selectedImage.category}</span>
                                <h4 className="text-4xl font-black text-white uppercase tracking-tighter mb-2">{selectedImage.title}</h4>
                                <p className="text-white/40 text-xs font-bold uppercase tracking-[0.3em]">{new Date(selectedImage.created_at || '').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal Form */}
            <AnimatePresence>
                {showForm && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setShowForm(false)}
                            className="absolute inset-0 bg-slate-900/90 backdrop-blur-xl"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            className="bg-white rounded-[4rem] p-12 shadow-2xl w-full max-w-3xl relative z-10 border border-slate-100 overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -mr-32 -mt-32 opacity-60" />
                            
                            <div className="flex justify-between items-center mb-12 relative z-10">
                                <div>
                                    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-1">Cargar Multimedia</h3>
                                    <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Añade imágenes a la galería del sistema</p>
                                </div>
                                <button onClick={() => setShowForm(false)} className="w-14 h-14 bg-slate-50 text-slate-400 hover:text-slate-900 rounded-full flex items-center justify-center transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                                <div className="space-y-8">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Título del Medio</label>
                                        <input 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-[2rem] px-8 py-5 font-black text-slate-800 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner"
                                            placeholder="Nombre descriptivo..."
                                            value={formData.title || ''}
                                            onChange={e => setFormData({...formData, title: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Categoría de Visualización</label>
                                        <select 
                                            className="w-full bg-slate-50 border-2 border-slate-50 rounded-[2rem] px-8 py-5 font-black text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all shadow-inner appearance-none"
                                            value={formData.category}
                                            onChange={e => setFormData({...formData, category: e.target.value as any})}
                                        >
                                            <option value="general">General (Varios)</option>
                                            <option value="locales">Locales Comerciales</option>
                                            <option value="eventos">Eventos Plaza</option>
                                            <option value="estacionamiento">Parking & Publicidad</option>
                                        </select>
                                    </div>
                                    
                                    <div className="pt-4">
                                        <button 
                                            onClick={handleSave}
                                            disabled={isSaving || isUploading || !formData.url}
                                            className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-2xl shadow-slate-200 disabled:opacity-30 flex items-center justify-center gap-3"
                                        >
                                            {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} />} Guardar en Galería
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Archivo de Imagen</label>
                                    <div 
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`group relative cursor-pointer border-2 border-dashed rounded-[3rem] h-[320px] flex flex-col items-center justify-center transition-all overflow-hidden ${formData.url ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
                                    >
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                                        
                                        {isUploading ? (
                                            <div className="flex flex-col items-center gap-6">
                                                <div className="relative">
                                                    <Loader2 size={64} className="text-blue-500 animate-spin" />
                                                    <Camera className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-300" size={24} />
                                                </div>
                                                <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.3em]">Cargando en la nube...</p>
                                            </div>
                                        ) : formData.url ? (
                                            <div className="w-full h-full relative">
                                                <img src={formData.url} alt="Preview" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 backdrop-blur-sm transition-all">
                                                    <div className="bg-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2">
                                                        <RefreshCw size={16} className="text-emerald-500" />
                                                        <span className="text-[10px] font-black uppercase text-emerald-600">Cambiar Imagen</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="w-20 h-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-center text-slate-300 group-hover:text-blue-400 group-hover:scale-110 group-hover:-rotate-6 transition-all">
                                                    <Upload size={32} />
                                                </div>
                                                <p className="mt-6 text-xs font-black text-slate-800 uppercase tracking-widest">Seleccionar Archivo</p>
                                                <p className="mt-2 text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Máximo 5MB • Formatos Web</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const RefreshCw = ({ size, className }: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
);
