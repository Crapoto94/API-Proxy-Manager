import React, { useState } from 'react';
import axios from 'axios';
import { ShieldCheck, User, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config';

const Login: React.FC<{ onLogin: (token: string, user: any) => void }> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        
        try {
            const res = await axios.post(`${API_BASE_URL}/api/auth/login`, { username, password });
            onLogin(res.data.token, res.data.user);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Identifiants invalides');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 bg-glow">
            <style>{`
                .bg-glow {
                    background-image: 
                        radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.05) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(37, 99, 235, 0.05) 0%, transparent 40%);
                }
            `}</style>
            
            <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-12 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-sky-400 to-blue-600"></div>
                    
                    <div className="flex flex-col items-center mb-10">
                        <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.4)] mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                            <ShieldCheck size={42} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight">APM Console</h1>
                        <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em] mt-2">DSI Hub Gateway</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Utilisateur</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                                <input 
                                    type="text"
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-blue-500/50 focus:ring-4 ring-blue-500/10 transition-all font-semibold"
                                    placeholder="Nom d'utilisateur"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mot de passe</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                                <input 
                                    type="password"
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-blue-500/50 focus:ring-4 ring-blue-500/10 transition-all font-semibold"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold bg-rose-500/10 p-4 rounded-xl border border-rose-500/20 animate-in slide-in-from-top-2">
                                <AlertCircle size={14} />
                                <span>{error}</span>
                            </div>
                        )}

                        <button 
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-2xl shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.4)] transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'SE CONNECTER'}
                        </button>
                    </form>

                    <div className="mt-10 text-center">
                        <p className="text-slate-500 text-xs font-medium">
                            Accès restreint à l'administration technique.<br/>
                            Contactez la DSI pour toute demande d'accès.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
