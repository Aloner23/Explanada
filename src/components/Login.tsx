
import { login } from '../services/authService';
import React, { useState } from 'react';
import { UserRole, User } from '../types';
import { Building, Lock, User as UserIcon, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { LOGO_URL as DEFAULT_LOGO } from '../constants';
import { plaza } from '../config/plaza';

interface LoginProps {
  onLogin: (user: User) => void;
  onCancel: () => void;
  logoUrl?: string;
}

export const Login: React.FC<LoginProps> = ({ onLogin, onCancel, logoUrl }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const activeLogo = logoUrl || DEFAULT_LOGO;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    try {
      onLogin(await login(username, password));
      setPassword('');
    } catch (error: any) {
      setError(error.message || 'No se pudo iniciar sesión.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up border border-slate-100">
        <div className="p-10 pt-12 text-center">
          <div className="mx-auto mb-6 transform -rotate-1 hover:rotate-0 transition-transform duration-500 flex justify-center">
            <img src={activeLogo} alt={plaza.name} className="w-48 h-auto object-contain max-h-32" />
          </div>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mt-1">Acceso de Personal</p>
        </div>

        <form onSubmit={handleSubmit} className="px-10 pb-12 space-y-5">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-black flex items-center gap-3 animate-shake border border-red-100">
              <AlertCircle size={18}/> {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Usuario</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
              <input 
                type="text" 
                required 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                placeholder="Nombre de usuario"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
              <input 
                type="password" 
                required 
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoggingIn}
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-200 flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isLoggingIn ? <Loader2 className="animate-spin" /> : <>Entrar al Sistema <ArrowRight size={20}/></>}
          </button>

          <button 
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Volver a la vista pública
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};
