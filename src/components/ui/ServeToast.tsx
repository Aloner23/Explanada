import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 4000);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl transform transition-all duration-300 animate-slide-in
              ${t.type === 'success' ? 'bg-emerald-500 text-white' : ''}
              ${t.type === 'error' ? 'bg-rose-500 text-white' : ''}
              ${t.type === 'warning' ? 'bg-amber-500 text-white' : ''}
              ${t.type === 'info' ? 'bg-slate-800 text-white' : ''}
            `}
                    >
                        {t.type === 'success' && <CheckCircle size={20} />}
                        {t.type === 'error' && <AlertOctagon size={20} />}
                        {t.type === 'warning' && <AlertTriangle size={20} />}
                        {t.type === 'info' && <Info size={20} />}

                        <p className="font-bold text-sm tracking-wide">{t.message}</p>

                        <button onClick={() => removeToast(t.id)} className="ml-2 hover:bg-white/20 p-1 rounded-full text-white/50 hover:text-white transition-colors">
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
