import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Loader2, 
  ServerCrash
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api/admin/external`;

interface TrustedIP {
  id: number;
  ip_address: string;
  description: string;
  created_at: string;
}

const SecuritySettings: React.FC = () => {
    const [trustEnabled, setTrustEnabled] = useState(false);
    const [ips, setIps] = useState<TrustedIP[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Add IP form state
    const [newIp, setNewIp] = useState('');
    const [newDesc, setNewDesc] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const [settingsRes, ipsRes] = await Promise.all([
                axios.get(`${API_BASE}/settings`),
                axios.get(`${API_BASE}/trusted-ips`)
            ]);
            setTrustEnabled(settingsRes.data.trust_proxies_enabled === 1);
            setIps(ipsRes.data);
        } catch (err) {
            console.error('Failed to fetch security settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleTrust = async () => {
        setIsSaving(true);
        try {
            await axios.put(`${API_BASE}/settings`, { trust_proxies_enabled: !trustEnabled });
            setTrustEnabled(!trustEnabled);
        } catch (err) {
            alert('Failed to update trust proxy settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddIp = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE}/trusted-ips`, { ip_address: newIp, description: newDesc });
            setNewIp('');
            setNewDesc('');
            fetchSettings();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to add IP');
        }
    };

    const handleDeleteIp = async (id: number) => {
        if (!window.confirm('Retirer cette adresse IP de la liste de confiance ?')) return;
        try {
            await axios.delete(`${API_BASE}/trusted-ips/${id}`);
            fetchSettings();
        } catch (err) {
            alert('Erreur lors de la suppression de l\'IP');
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                    <ShieldCheck className="text-blue-600" size={32} />
                    Sécurité & Trust Proxies
                </h2>
                <p className="text-slate-500 font-medium ml-1">
                    Gérez la sécurité des accès API, le filtrage IP et les proxys de confiance.
                </p>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-slate-300" size={40} />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Settings Panel */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                            <div className="p-8">
                                <div className="flex items-start justify-between mb-6">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900">Filtrage IP</h3>
                                        <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-widest">Trust Proxies</p>
                                    </div>
                                    <ShieldCheck size={28} className={trustEnabled ? "text-emerald-500" : "text-slate-300"} />
                                </div>
                                <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                                    Si activé, seules les requêtes provenant des adresses IP listées ci-contre seront autorisées à utiliser les jetons d'accès API.
                                </p>
                                <button
                                    onClick={handleToggleTrust}
                                    disabled={isSaving}
                                    className={`w-full py-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                                        trustEnabled 
                                            ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 shadow-[inset_0_0_0_1px_rgba(225,29,72,0.1)]' 
                                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.1)]'
                                    }`}
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : null}
                                    {trustEnabled ? 'DÉSACTIVER LE FILTRAGE' : 'ACTIVER LE FILTRAGE'}
                                </button>
                            </div>
                        </div>

                        {!trustEnabled && (
                            <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 flex items-start gap-4">
                                <ServerCrash className="text-amber-500 shrink-0 mt-1" size={24} />
                                <div>
                                    <h4 className="text-sm font-black text-amber-900">Filtrage désactivé</h4>
                                    <p className="text-xs font-medium text-amber-700 mt-1">Toute requête possédant une clé API valide sera acceptée, sans restriction d'IP.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* IPs List Panel */}
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col opacity-100 transition-opacity duration-300" style={{ opacity: trustEnabled ? 1 : 0.6 }}>
                            <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-black text-slate-900">Liste des IP Autorisées</h3>
                                    <p className="text-xs text-slate-500 mt-1">Gérez les serveurs ayant accès à vos API.</p>
                                </div>
                                <form onSubmit={handleAddIp} className="flex items-center gap-2 w-full sm:w-auto">
                                    <input 
                                        type="text" 
                                        disabled={!trustEnabled}
                                        placeholder="Ex: 192.168.1.50" 
                                        value={newIp}
                                        onChange={(e) => setNewIp(e.target.value)}
                                        className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-blue-500 outline-none w-36 sm:w-40 disabled:bg-slate-50 disabled:text-slate-400"
                                        required
                                    />
                                    <input 
                                        type="text" 
                                        disabled={!trustEnabled}
                                        placeholder="Description (opt.)" 
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none w-36 sm:w-40 disabled:bg-slate-50 disabled:text-slate-400"
                                    />
                                    <button 
                                        disabled={!trustEnabled || !newIp}
                                        type="submit" 
                                        className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-colors"
                                    >
                                        <Plus size={18} />
                                    </button>
                                </form>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 max-h-[500px]">
                                {ips.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center py-12 px-6">
                                        <ShieldCheck size={48} className="text-slate-200 mb-4" />
                                        <h4 className="font-bold text-slate-800 mb-2">Aucune adresse IP configurée</h4>
                                        <p className="text-sm text-slate-500 max-w-sm">
                                            Ajoutez des adresses IPv4 ou IPv6 qui seront autorisées à interroger l'API avec un jeton d'accès.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {ips.map(ip => (
                                            <div key={ip.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white hover:border-slate-300 transition-colors group">
                                                <div className="flex flex-col">
                                                    <span className="font-mono font-bold text-slate-800 text-sm tracking-tight">{ip.ip_address}</span>
                                                    <span className="text-xs text-slate-400 mt-1">{ip.description || 'Serveur Web'} • Ajouté le {new Date(ip.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleDeleteIp(ip.id)}
                                                    disabled={!trustEnabled}
                                                    className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-50 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                                    title="Supprimer cette IP"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SecuritySettings;
