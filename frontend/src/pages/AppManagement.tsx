import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Plus, 
  Search, 
  Globe, 
  Key, 
  Trash2, 
  Copy, 
  CheckCircle2,
  Activity,
  ShieldCheck,
  Smartphone,
  Mail,
  Loader2,
  Power,
  Database
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api/admin/external`;

interface ExternalApp {
  id: number;
  name: string;
  api_key: string;
  is_active: number;
  authorized_routes: string; // JSON string
  created_at: string;
}

const AVAILABLE_PERMISSIONS = [
    { id: 'sms_send', name: 'Envoi SMS (Frizbi)', icon: Smartphone },
    { id: 'mail_send', name: 'Envoi Mail (SMTP)', icon: Mail },
    { id: 'ad_search', name: 'Recherche AD', icon: ShieldCheck },
    { id: 'ad_auth', name: 'Authentification AD', icon: ShieldCheck },
    { id: 'azure_search', name: 'Recherche Azure AD', icon: Globe },
    { id: 'oracle_query', name: 'Requêtes Oracle', icon: Database },
    { id: 'oracle_sync', name: 'Synchro Oracle', icon: RefreshCw },
    { id: 'o365_read', name: 'Lecture O365', icon: Mail },
    { id: 'o365_harvest', name: 'Moissonnage O365', icon: RefreshCw },
    { id: 'glpi_read', name: 'Stats GLPI', icon: Activity },
];

import { RefreshCw, Edit3 } from 'lucide-react';

const AppManagement: React.FC = () => {
    const navigate = useNavigate();
    const [apps, setApps] = useState<ExternalApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingApp, setEditingApp] = useState<ExternalApp | null>(null);
    
    const [newName, setNewName] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>(['*']);
    
    const [copyStatus, setCopyStatus] = useState<number | null>(null);

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



    useEffect(() => {
        fetchApps();
    }, []);

    const handleCreateApp = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE}/apps`, { 
                name: newName,
                authorized_routes: selectedPermissions
            });
            setNewName('');
            setSelectedPermissions(['*']);
            setIsModalOpen(false);
            fetchApps();
        } catch (err) {
            alert('Erreur lors de la création');
        }
    };

    const handleUpdateApp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingApp) return;
        try {
            await axios.put(`${API_BASE}/apps/${editingApp.id}`, { 
                name: newName,
                authorized_routes: selectedPermissions
            });
            setEditingApp(null);
            setIsEditModalOpen(false);
            fetchApps();
        } catch (err) {
            alert('Erreur lors de la mise à jour');
        }
    };

    const openEditModal = (app: ExternalApp) => {
        setEditingApp(app);
        setNewName(app.name);
        try {
            const perms = JSON.parse(app.authorized_routes || '["*"]');
            setSelectedPermissions(perms);
        } catch (e) {
            setSelectedPermissions(['*']);
        }
        setIsEditModalOpen(true);
    };

    const togglePermission = (permId: string) => {
        if (permId === '*') {
            setSelectedPermissions(['*']);
            return;
        }

        setSelectedPermissions(prev => {
            const filtered = prev.filter(p => p !== '*');
            if (filtered.includes(permId)) {
                const next = filtered.filter(p => p !== permId);
                return next.length === 0 ? ['*'] : next;
            } else {
                return [...filtered, permId];
            }
        });
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

    const handleToggleApp = async (id: number) => {
        try {
            await axios.put(`${API_BASE}/apps/${id}/toggle`);
            fetchApps();
        } catch (err) {
            alert('Erreur lors du changement de statut');
        }
    };

    const copyToClipboard = (text: string, id: number) => {
        navigator.clipboard.writeText(text);
        setCopyStatus(id);
        setTimeout(() => setCopyStatus(null), 2000);
    };

    const filteredApps = apps.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const PermissionCheckboxes = () => (
        <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Permissions autorisées</label>
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => togglePermission('*')}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        selectedPermissions.includes('*') 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'bg-white border-slate-100 text-slate-600 hover:border-blue-200'
                    }`}
                >
                    <Globe size={18} />
                    <span className="text-xs font-bold">Toutes les API (*)</span>
                </button>
                {AVAILABLE_PERMISSIONS.map(perm => (
                    <button
                        key={perm.id}
                        type="button"
                        onClick={() => togglePermission(perm.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                            selectedPermissions.includes(perm.id)
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-100 text-slate-600 hover:border-blue-200'
                        } ${selectedPermissions.includes('*') ? 'ring-2 ring-blue-100' : ''}`}
                    >
                        <perm.icon size={18} />
                        <span className="text-xs font-bold">{perm.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Applications Externes</h2>
                    <p className="text-slate-500 mt-2 font-medium">Gérez les jetons d'accès pour vos applications tierces</p>
                </div>
                <button 
                    onClick={() => {
                        setNewName('');
                        setSelectedPermissions(['*']);
                        setIsModalOpen(true);
                    }}
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
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endpoints Proxy</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">/api/v1/...</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Globe size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Granularité</p>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">Contrôle par endpoint</p>
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
                                        <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-sm transition-all ${
                                            app.is_active === 1 
                                                ? 'bg-white border-slate-200 text-slate-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-500' 
                                                : 'bg-slate-100 border-slate-200 text-slate-400 grayscale'
                                        }`}>
                                            <Globe size={24} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h4 className={`text-lg font-black ${app.is_active === 1 ? 'text-slate-900' : 'text-slate-400'}`}>{app.name}</h4>
                                                {app.is_active === 0 ? (
                                                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-500 text-[10px] font-bold uppercase">Inactif</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold uppercase">
                                                        {JSON.parse(app.authorized_routes || '["*"]').includes('*') ? 'Accès Total' : `${JSON.parse(app.authorized_routes).length} API(s)`}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono text-[11px] font-bold ${
                                                    app.is_active === 1 ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-400'
                                                }`}>
                                                    <Key size={12} />
                                                    <span>{app.api_key.substring(0, 8)}...{app.api_key.substring(app.api_key.length - 8)}</span>
                                                </div>
                                                <p className="text-[10px] font-black text-slate-400 uppercase">Créée le {new Date(app.created_at).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    </div>

                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => openEditModal(app)}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs bg-white border border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all"
                                    >
                                        <Edit3 size={14} />
                                        <span>ÉDITER</span>
                                    </button>
                                    <button 
                                        onClick={() => handleToggleApp(app.id)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all ${
                                            app.is_active === 1 
                                                ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' 
                                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                        }`}
                                    >
                                        <Power size={14} />
                                        <span>{app.is_active === 1 ? 'DÉSACTIVER' : 'ACTIVER'}</span>
                                    </button>
                                    <button 
                                        onClick={() => navigate(`/logs?app=${app.id}`)}
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
                                        <span>{copyStatus === app.id ? 'COPIÉ' : 'COPIER'}</span>
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
            {(isModalOpen || isEditModalOpen) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm" onClick={() => { setIsModalOpen(false); setIsEditModalOpen(false); }}></div>
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-10 py-8 border-b border-slate-50">
                            <h3 className="text-xl font-black text-slate-900">{isEditModalOpen ? 'Modifier' : 'Nouvelle'} Application</h3>
                            <p className="text-sm font-medium text-slate-500 mt-1">{isEditModalOpen ? 'Mettez à jour les permissions' : 'Générez une clé API sécurisée'}</p>
                        </div>
                        <form onSubmit={isEditModalOpen ? handleUpdateApp : handleCreateApp} className="p-10 space-y-8">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nom de l'application</label>
                                <input 
                                    type="text" 
                                    autoFocus
                                    className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-4 px-6 outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-lg"
                                    placeholder="Ex: Portail Client"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    required
                                />
                            </div>

                            <PermissionCheckboxes />

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => { setIsModalOpen(false); setIsEditModalOpen(false); }} className="flex-1 py-4 font-black text-slate-400 hover:bg-slate-50 rounded-2xl transition-all">ANNULER</button>
                                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                                    {isEditModalOpen ? 'ENREGISTRER' : 'GÉNÉRER LA CLÉ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


        </div>
    );
};


export default AppManagement;
