import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, UserPlus, Search, Shield, Mail, Trash2, Edit2, X, CheckCircle2, AlertCircle, Loader2, Key, Database, LayoutDashboard, Globe, MessageSquare, ScrollText, Settings, KeySquare
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api`;

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  is_ad: number;
}

interface Role {
  id: number;
  name: string;
  permissions: string[];
}

const AVAILABLE_PERMISSIONS = [
  { route: '/', label: 'Dashboard', icon: LayoutDashboard },
  { route: '/mail-settings', label: 'Paramètres Mail SMTP', icon: Settings },
  { route: '/frizbi-settings', label: 'Paramètres SMS Frizbi', icon: MessageSquare },
  { route: '/logs', label: 'Logs Proxy', icon: ScrollText },
  { route: '/directory', label: 'Annuaire AD', icon: Shield },
  { route: '/o365', label: 'Messagerie O365', icon: Mail },
  { route: '/database', label: 'Oracle & Sync', icon: Database },
  { route: '/sql', label: 'SQL Explorer', icon: Search },
  { route: '/users', label: 'Utilisateurs & Rôles', icon: Users },
  { route: '/apps', label: 'Applications', icon: Globe },
  { route: '/security', label: 'Sécurité & Proxies', icon: KeySquare },
  { route: '/api-docs', label: 'Documentation API', icon: Database }
];

const UserSettings: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
    
    // Users State
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isAdMode, setIsAdMode] = useState(false);
    const [userFormData, setUserFormData] = useState({ username: '', email: '', role: 'user', password: '', is_ad: false });
    
    // AD Search State
    const [adSearchQuery, setAdSearchQuery] = useState('');
    const [adResults, setAdResults] = useState<any[]>([]);
    const [isSearchingAd, setIsSearchingAd] = useState(false);

    // Roles State
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [roleFormData, setRoleFormData] = useState<{name: string, permissions: string[]}>({ name: '', permissions: [] });

    // Common Status
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, rolesRes] = await Promise.all([
                axios.get(`${API_BASE}/users`),
                axios.get(`${API_BASE}/users/roles`)
            ]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
        } catch (err) {
            console.error('Failed to fetch data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- Users Logic ---
    const handleOpenUserModal = (user: User | null = null) => {
        if (user) {
            setEditingUser(user);
            setIsAdMode(user.is_ad === 1);
            setUserFormData({ username: user.username, email: user.email, role: user.role, password: '', is_ad: user.is_ad === 1 });
        } else {
            setEditingUser(null);
            setIsAdMode(false);
            setUserFormData({ username: '', email: '', role: roles.length > 0 ? roles[0].name : 'user', password: '', is_ad: false });
        }
        setAdSearchQuery('');
        setAdResults([]);
        setIsUserModalOpen(true);
        setStatus(null);
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingUser) {
                await axios.put(`${API_BASE}/users/${editingUser.id}`, userFormData);
                setStatus({ type: 'success', message: 'Utilisateur mis à jour avec succès' });
            } else {
                await axios.post(`${API_BASE}/users`, userFormData);
                setStatus({ type: 'success', message: 'Utilisateur créé avec succès' });
            }
            await fetchData();
            setTimeout(() => setIsUserModalOpen(false), 1500);
        } catch (err: any) {
            setStatus({ type: 'error', message: err.response?.data?.message || 'Une erreur est survenue' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) return;
        try {
            await axios.delete(`${API_BASE}/users/${id}`);
            await fetchData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Erreur lors de la suppression');
        }
    };

    const searchAD = async (q: string) => {
        setAdSearchQuery(q);
        if (q.length < 3) {
            setAdResults([]);
            return;
        }
        setIsSearchingAd(true);
        try {
            const res = await axios.get(`${API_BASE}/admin/ad/search?q=${encodeURIComponent(q)}`);
            setAdResults(res.data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearchingAd(false);
        }
    };

    const selectAdUser = (adUser: any) => {
        setUserFormData({
            ...userFormData,
            username: adUser.sAMAccountName || '',
            email: adUser.mail || '',
            is_ad: true
        });
        setAdResults([]);
        setAdSearchQuery('');
    };

    // --- Roles Logic ---
    const handleOpenRoleModal = (role: Role | null = null) => {
        if (role) {
            setEditingRole(role);
            setRoleFormData({ name: role.name, permissions: [...role.permissions] });
        } else {
            setEditingRole(null);
            setRoleFormData({ name: '', permissions: [] });
        }
        setIsRoleModalOpen(true);
        setStatus(null);
    };

    const togglePermission = (route: string) => {
        setRoleFormData(prev => {
            const hasPerm = prev.permissions.includes(route);
            if (hasPerm) {
                return { ...prev, permissions: prev.permissions.filter(p => p !== route) };
            } else {
                return { ...prev, permissions: [...prev.permissions, route] };
            }
        });
    };

    const handleRoleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingRole) {
                await axios.put(`${API_BASE}/users/roles/${editingRole.id}`, roleFormData);
                setStatus({ type: 'success', message: 'Rôle mis à jour' });
            } else {
                await axios.post(`${API_BASE}/users/roles`, roleFormData);
                setStatus({ type: 'success', message: 'Rôle créé' });
            }
            await fetchData();
            setTimeout(() => setIsRoleModalOpen(false), 1500);
        } catch (err: any) {
            setStatus({ type: 'error', message: err.response?.data?.message || 'Erreur API' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteRole = async (id: number) => {
        if (!window.confirm('Supprimer ce rôle ? Les utilisateurs liés pourraient perdre laccès.')) return;
        try {
            await axios.delete(`${API_BASE}/users/roles/${id}`);
            await fetchData();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Erreur lors de la suppression');
        }
    };

    const filteredUsers = users.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Droits d'Accès</h2>
                    <p className="text-slate-500 mt-2 font-medium">Contrôlez les accès à la console d'administration et aux configurations réseau.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-4 border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-4 font-black transition-all border-b-2 ${activeTab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <div className="flex items-center gap-2">
                        <Users size={18} />
                        Utilisateurs
                    </div>
                </button>
                <button 
                    onClick={() => setActiveTab('roles')}
                    className={`px-6 py-4 font-black transition-all border-b-2 ${activeTab === 'roles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <div className="flex items-center gap-2">
                        <Shield size={18} />
                        Rôles & Permissions
                    </div>
                </button>
            </div>

            {/* USERS TAB VIEW */}
            {activeTab === 'users' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                    <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="relative w-full md:w-96 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                type="text" 
                                placeholder="Rechercher un utilisateur..." 
                                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-blue-500 focus:ring-4 ring-blue-500/5 transition-all font-semibold"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button 
                            onClick={() => handleOpenUserModal()}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                        >
                            <UserPlus size={20} />
                            <span>NOUVEL UTILISATEUR</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left border-b border-slate-100">
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Utilisateur</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rôle</th>
                                    <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading && users.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-20 text-center">
                                            <Loader2 className="animate-spin text-blue-600 mx-auto" size={32} />
                                        </td>
                                    </tr>
                                ) : filteredUsers.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                                                    {user.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-slate-900">{user.username}</span>
                                                    <span className="text-xs text-slate-400 font-medium">{user.email || 'Pas d\'email'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            {user.is_ad === 1 ? (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-600">
                                                    <Database size={12} />
                                                    Active Directory
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                                                    <UserPlus size={12} />
                                                    Local
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                                                user.role === 'admin' 
                                                    ? 'bg-blue-50 text-blue-600' 
                                                    : 'bg-emerald-50 text-emerald-600'
                                            }`}>
                                                <Shield size={12} />
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right space-x-2">
                                            <button 
                                                onClick={() => handleOpenUserModal(user)}
                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-blue-100"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(user.id)}
                                                className={`p-2 text-slate-400 hover:text-rose-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-rose-100 ${user.id === 1 ? 'invisible' : ''}`}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ROLES TAB VIEW */}
            {activeTab === 'roles' && (
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                    <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex justify-end">
                        <button 
                            onClick={() => handleOpenRoleModal()}
                            className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-2xl font-black shadow-lg transition-all active:scale-95"
                        >
                            <Shield size={20} />
                            <span>NOUVEAU RÔLE</span>
                        </button>
                    </div>

                    <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Static Admin Role */}
                        <div className="border border-slate-200 rounded-3xl p-6 bg-slate-50 relative overflow-hidden group">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                                        <Shield size={20} />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-900">admin</h3>
                                </div>
                            </div>
                            <p className="text-sm font-medium text-slate-500 mb-6">Accès intégral au système (Super-Administrateur).</p>
                            <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                                Toutes les permissions
                            </div>
                        </div>

                        {roles.filter(r => r.name !== 'admin').map(role => (
                            <div key={role.id} className="border border-slate-200 rounded-3xl p-6 hover:shadow-xl transition-all hover:-translate-y-1 relative group bg-white">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                            <KeySquare size={20} />
                                        </div>
                                        <h3 className="text-lg font-black text-slate-900">{role.name}</h3>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleOpenRoleModal(role)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-sm font-medium text-slate-500 mb-6">Accès restreint à un sous-ensemble de menus.</p>
                                <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Permissions actives ({role.permissions.length})</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {role.permissions.slice(0, 5).map(permRoute => {
                                            const permDef = AVAILABLE_PERMISSIONS.find(ap => ap.route === permRoute);
                                            return (
                                                <span key={permRoute} className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
                                                    {permDef ? permDef.label : permRoute}
                                                </span>
                                            );
                                        })}
                                        {role.permissions.length > 5 && (
                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md leading-none">
                                                +{role.permissions.length - 5}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal Utilisateur */}
            {isUserModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm" onClick={() => setIsUserModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
                        <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                            <h3 className="text-xl font-black text-slate-900">
                                {editingUser ? 'Modifier l’utilisateur' : 'Nouvel Utilisateur'}
                            </h3>
                            <button onClick={() => setIsUserModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all border border-slate-200 shadow-sm bg-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto">
                            {!editingUser && (
                                <div className="flex bg-slate-50 p-2 mx-10 mt-8 rounded-2xl gap-2 border border-slate-100">
                                    <button 
                                        type="button"
                                        onClick={() => { setIsAdMode(false); setUserFormData({...userFormData, is_ad: false}); }}
                                        className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${!isAdMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        Création Manuelle Locaux
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { setIsAdMode(true); setUserFormData({...userFormData, is_ad: true}); }}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-black rounded-xl transition-all ${isAdMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        <Database size={16} /> Import Active Directory
                                    </button>
                                </div>
                            )}

                            <form onSubmit={handleUserSubmit} className="p-10 space-y-6">
                                {isAdMode && !editingUser && (
                                    <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-2xl space-y-4">
                                        <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Rechercher dans l'AD (Nom, Email, Login...)</label>
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" size={18} />
                                            <input 
                                                type="text" 
                                                className="w-full bg-white border border-indigo-200 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-indigo-500 focus:ring-4 ring-indigo-500/10 font-bold"
                                                placeholder="Saisissez au moins 3 caractères..."
                                                value={adSearchQuery}
                                                onChange={(e) => searchAD(e.target.value)}
                                            />
                                            {isSearchingAd && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" size={18} />}
                                        </div>
                                        {adResults.length > 0 && (
                                            <div className="bg-white border border-indigo-100 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                {adResults.map((r, i) => (
                                                    <div key={i} onClick={() => selectAdUser(r)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-indigo-50 last:border-0 transition-colors flex justify-between items-center">
                                                        <div>
                                                            <p className="font-bold text-slate-800">{r.displayName}</p>
                                                            <p className="text-xs text-slate-500">{r.sAMAccountName} • {r.mail}</p>
                                                        </div>
                                                        <UserPlus size={16} className="text-indigo-400" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Identifiant</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 outline-none focus:border-blue-500 transition-all font-bold disabled:opacity-50"
                                            value={userFormData.username}
                                            onChange={e => setUserFormData({ ...userFormData, username: e.target.value })}
                                            required
                                            disabled={isAdMode && !editingUser}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input 
                                                type="email" 
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-bold disabled:opacity-50"
                                                value={userFormData.email}
                                                onChange={e => setUserFormData({ ...userFormData, email: e.target.value })}
                                                disabled={isAdMode && !editingUser}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Rôle d'Accès</label>
                                        <select 
                                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 outline-none focus:border-blue-500 transition-all font-bold appearance-none bg-no-repeat bg-[right_1rem_center]"
                                            value={userFormData.role}
                                            onChange={e => setUserFormData({ ...userFormData, role: e.target.value })}
                                        >
                                            <option value="admin">Administrateur (Complet)</option>
                                            {roles.filter(r => r.name !== 'admin').map(role => (
                                                <option key={role.id} value={role.name}>{role.name}</option>
                                            ))}
                                            {roles.length === 0 && <option value="user">Utilisateur (Défaut)</option>}
                                        </select>
                                    </div>
                                    {!isAdMode && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                                {editingUser ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}
                                            </label>
                                            <div className="relative">
                                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input 
                                                    type="password" 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-4 outline-none focus:border-blue-500 transition-all font-bold"
                                                    placeholder="••••••••"
                                                    value={userFormData.password}
                                                    onChange={e => setUserFormData({ ...userFormData, password: e.target.value })}
                                                    required={!editingUser && !isAdMode}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {isAdMode && (
                                    <div className="bg-blue-50 text-blue-800 text-xs font-bold p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                                        <Shield className="shrink-0 mt-0.5" size={16} />
                                        <p>L'authentification sera déléguée à l'Active Directory. L'utilisateur devra utiliser son mot de passe de session Windows.</p>
                                    </div>
                                )}

                                {status && (
                                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                                        {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                        <span className="text-xs font-bold">{status.message}</span>
                                    </div>
                                )}

                                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 mt-8">
                                    <button 
                                        type="button"
                                        onClick={() => setIsUserModalOpen(false)}
                                        className="px-6 py-3 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all"
                                    >
                                        ANNULER
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={loading}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={20} /> : (editingUser ? 'ENREGISTRER' : 'SAUVEGARDER')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Rôle */}
            {isRoleModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm" onClick={() => setIsRoleModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        <div className="absolute top-0 left-0 w-full h-1 bg-slate-900"></div>
                        <div className="px-10 py-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                            <h3 className="text-xl font-black text-slate-900">
                                {editingRole ? 'Modifier le Rôle' : 'Nouveau Rôle'}
                            </h3>
                            <button onClick={() => setIsRoleModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all border border-slate-200 shadow-sm bg-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleRoleSubmit} className="flex-1 overflow-y-auto">
                            <div className="p-10 space-y-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nom du Rôle</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 outline-none focus:border-slate-900 transition-all font-black text-lg text-slate-900"
                                        placeholder="ex: Support N1, Éditeur Mail..."
                                        value={roleFormData.name}
                                        onChange={e => setRoleFormData({ ...roleFormData, name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Sélection des accès autorisés</label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {AVAILABLE_PERMISSIONS.map(perm => {
                                            const isChecked = roleFormData.permissions.includes(perm.route);
                                            return (
                                                <div 
                                                    key={perm.route} 
                                                    onClick={() => togglePermission(perm.route)}
                                                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-3 ${
                                                        isChecked ? 'border-blue-600 bg-blue-50/50 text-blue-900' : 'border-slate-100 bg-white hover:border-slate-300'
                                                    }`}
                                                >
                                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                        {isChecked && <CheckCircle2 size={14} strokeWidth={4} />}
                                                    </div>
                                                    <perm.icon size={18} className={isChecked ? 'text-blue-600' : 'text-slate-400'} />
                                                    <span className="font-bold text-sm select-none">{perm.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {status && (
                                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                                        {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                        <span className="text-xs font-bold">{status.message}</span>
                                    </div>
                                )}
                            </div>

                            <div className="px-10 py-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsRoleModalOpen(false)} className="px-6 py-3 rounded-2xl font-black text-slate-500 hover:bg-slate-200 transition-all">ANNULER</button>
                                <button type="submit" disabled={loading} className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-slate-900/20 flex items-center gap-2">
                                    {loading && <Loader2 className="animate-spin" size={20} />} SAUVEGARDER
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserSettings;
