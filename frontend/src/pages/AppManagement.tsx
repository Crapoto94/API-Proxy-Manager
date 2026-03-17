import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Plus, 
  Search, 
  Globe, 
  Key, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  X,
  Activity,
  ShieldCheck,
  Smartphone,
  Mail,
  Loader2
} from 'lucide-react';

const API_BASE = 'http://localhost:8001/api/admin/external';

interface ExternalApp {
  id: number;
  name: string;
  api_key: string;
  is_active: number;
  created_at: string;
}

const AppManagement: React.FC = () => {
    const [apps, setApps] = useState<ExternalApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [copyStatus, setCopyStatus] = useState<number | null>(null);
    const [selectedAppLogs, setSelectedAppLogs] = useState<any[] | null>(null);
    const [viewingLogApp, setViewingLogApp] = useState<ExternalApp | null>(null);

    const fetchApps = async () => {
        try {
            const res = await axios.get(`${API_BASE}/apps`);
            setApps(res.data);
        } catch (err) {
            console.error('Failed to fetch apps:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async (app: ExternalApp) => {
        setViewingLogApp(app);
        try {
            const res = await axios.get(`${API_BASE}/apps/${app.id}/logs`);
            setSelectedAppLogs(res.data);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        }
    };

    useEffect(() => {
        fetchApps();
    }, []);

    const handleCreateApp = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE}/apps`, { name: newName });
            setNewName('');
            setIsModalOpen(false);
            fetchApps();
        } catch (err) {
            alert('Erreur lors de la création');
        }
    };

    const handleDeleteApp = async (id: number) => {
        if (!window.confirm('Supprimer cette application ? Les clés API deviendront invalides.')) return;
        try {
            await axios.delete(`${API_BASE}/apps/${id}`);
            fetchApps();
        } catch (err) {
            alert('Erreur de suppression');
        }
    };

    const copyToClipboard = (text: string, id: number) => {
        navigator.clipboard.writeText(text);
        setCopyStatus(id);
        setTimeout(() => setCopyStatus(null), 2000);
    };

    const filteredApps = apps.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header and stats grid same as before */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Applications Externes</h2>
                    <p className="text-slate-500 mt-2 font-medium">Gérez les jetons d'accès pour vos applications tierces</p>
                </div>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-slate-900/20 transition-all active:scale-95"
                >
                    <Plus size={20} />
                    <span>DÉCLARER UNE APPLI</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Smartphone size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoint SMS</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">POST /api/v1/sms/send</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Mail size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoint Mail</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">POST /api/v1/mail/send</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auth header</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">X-API-KEY: [votre_clé]</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <div className="relative w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Rechercher une application..." 
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-semibold"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="p-4 grid grid-cols-1 gap-4">
                    {loading ? (
                        <div className="py-20 text-center">
                            <Loader2 className="animate-spin text-slate-300 mx-auto" size={32} />
                        </div>
                    ) : filteredApps.length === 0 ? (
                        <div className="py-20 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest italic">
                            Aucune application déclarée
                        </div>
                    ) : (
                        filteredApps.map(app => (
                            <div key={app.id} className="group p-6 rounded-[2rem] border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-blue-200 hover:shadow-xl hover:shadow-blue-500/5 transition-all flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-500 transition-all">
                                        <Globe size={24} />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-slate-900">{app.name}</h4>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-lg border border-slate-200 font-mono text-[11px] font-bold text-slate-500">
                                                <Key size={12} />
                                                <span>{app.api_key.substring(0, 8)}...{app.api_key.substring(app.api_key.length - 8)}</span>
                                            </div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">Créée le {new Date(app.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => fetchLogs(app)}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                                    >
                                        <Activity size={14} />
                                        <span>LOGS</span>
                                    </button>
                                    <button 
                                        onClick={() => copyToClipboard(app.api_key, app.id)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all ${
                                            copyStatus === app.id ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600'
                                        }`}
                                    >
                                        {copyStatus === app.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                        <span>{copyStatus === app.id ? 'COPIÉ' : 'COPIER LA CLÉ'}</span>
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteApp(app.id)}
                                        className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Modals */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-10 py-8 border-b border-slate-50">
                            <h3 className="text-xl font-black text-slate-900">Nouvelle Application</h3>
                            <p className="text-sm font-medium text-slate-500 mt-1">Générez une clé API sécurisée</p>
                        </div>
                        <form onSubmit={handleCreateApp} className="p-10 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nom de l'application</label>
                                <input 
                                    type="text" 
                                    autoFocus
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 outline-none focus:border-blue-500 focus:ring-4 ring-blue-500/5 transition-all font-bold text-lg"
                                    placeholder="Ex: Portail Client"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-black text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">ANNULER</button>
                                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all active:scale-95">GÉNÉRER LA CLÉ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {viewingLogApp && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm" onClick={() => { setViewingLogApp(null); setSelectedAppLogs(null); }}></div>
                    <div className="bg-white w-full max-w-4xl max-h-[80vh] rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Logs : {viewingLogApp.name}</h3>
                                <p className="text-sm font-medium text-slate-500 mt-1">Dernières 100 transactions proxy</p>
                            </div>
                            <button onClick={() => { setViewingLogApp(null); setSelectedAppLogs(null); }} className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-all"><X size={24} /></button>
                        </div>
                            {!selectedAppLogs ? (
                                <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-slate-300" size={32} /></div>
                            ) : selectedAppLogs.length === 0 ? (
                                <div className="py-20 text-center font-bold text-slate-400 grayscale italic text-sm">AUCUN LOG DISPONIBLE</div>
                            ) : (
                                <div className="space-y-4">
                                    {selectedAppLogs.map((log: any) => (
                                        <div key={log.id} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                                            <div className="p-4 flex items-center justify-between hover:bg-slate-100 cursor-pointer transition-colors" onClick={() => {
                                                const el = document.getElementById(`log-details-${log.id}`);
                                                if (el) el.classList.toggle('hidden');
                                            }}>
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                                                        log.method === 'POST' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                                                    }`}>{log.method}</span>
                                                    <span className="font-bold text-slate-700 text-sm truncate max-w-[200px] md:max-w-md">{log.endpoint}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-3 py-1 rounded-xl font-black text-xs ${
                                                        log.status < 400 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                                                    }`}>{log.status}</span>
                                                    <span className="font-mono text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                            </div>
                                            <div id={`log-details-${log.id}`} className="hidden px-6 py-4 border-t border-slate-100 bg-white space-y-4">
                                                {log.query_params && log.query_params !== '{}' && (
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Arguments URL (Query)</p>
                                                        <pre className="p-3 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-600 overflow-x-auto">
                                                            {JSON.stringify(JSON.parse(log.query_params), null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                {log.payload && log.payload !== '{}' && (
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Données envoyées (Payload)</p>
                                                        <pre className="p-3 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-600 overflow-x-auto">
                                                            {log.payload.startsWith('{') ? JSON.stringify(JSON.parse(log.payload), null, 2) : log.payload}
                                                        </pre>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </div>
                </div>
            )}
        </div>
    );
};


export default AppManagement;
