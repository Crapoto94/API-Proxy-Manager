import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShieldCheck, Globe, Fingerprint, Search, Check, AlertTriangle, 
  Loader2, Radio, Save, Server
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api`;

const DirectorySettings: React.FC = () => {
    const [adConfig, setAdConfig] = useState({ 
        is_enabled: false,
        host: '', port: 389, base_dn: '', required_group: '', 
        bind_dn: '', bind_password: ''
    });
    const [azureConfig, setAzureConfig] = useState({
        is_enabled: false,
        tenant_id: '', client_id: '', client_secret: '',
        redirect_uri: ''
    });

    const [testUser, setTestUser] = useState('');
    const [azureTestUser, setAzureTestUser] = useState('');
    const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
    const [azureTestResult, setAzureTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isAzureTesting, setIsAzureTesting] = useState(false);

    useEffect(() => {
        fetchConfigs();
    }, []);

    const fetchConfigs = async () => {
        try {
            const [adRes, azureRes] = await Promise.all([
                axios.get(`${API_BASE}/ad-settings`),
                axios.get(`${API_BASE}/azure-ad-settings`)
            ]);
            if (adRes.data) setAdConfig({ ...adRes.data, bind_password: adRes.data.bind_password ? '••••••••' : '' });
            if (azureRes.data) setAzureConfig({ ...azureRes.data, client_secret: azureRes.data.client_secret ? '••••••••' : '' });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAD = async () => {
        setTestResult(null);
        try {
            await axios.post(`${API_BASE}/ad-settings`, adConfig);
            setTestResult({ success: true, message: 'Configuration AD enregistrée.' });
        } catch (err) {
            setTestResult({ success: false, message: 'Erreur lors de l’enregistrement AD.' });
        }
    };

    const handleSaveAzure = async () => {
        setAzureTestResult(null);
        try {
            await axios.post(`${API_BASE}/azure-ad-settings`, azureConfig);
            setAzureTestResult({ success: true, message: 'Configuration Azure enregistrée.' });
        } catch (err) {
            setAzureTestResult({ success: false, message: 'Erreur lors de l’enregistrement Azure.' });
        }
    };

    const handlePingAD = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await axios.post(`${API_BASE}/auth/ad-ping`, adConfig);
            setTestResult({ success: true, message: res.data.message });
        } catch (err: any) {
            setTestResult({ success: false, message: err.response?.data?.message || 'Erreur de liaison AD' });
        } finally {
            setIsTesting(false);
        }
    };

    const handleVerifyUser = async () => {
        if (!testUser) return;
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await axios.post(`${API_BASE}/auth/ad-test`, { ...adConfig, username: testUser });
            setTestResult({ success: true, message: res.data.message, data: res.data.data });
        } catch (err: any) {
            setTestResult({ success: false, message: err.response?.data?.message || 'Utilisateur non trouvé' });
        } finally {
            setIsTesting(false);
        }
    };
    const handlePingAzure = async () => {
        setIsAzureTesting(true);
        setAzureTestResult(null);
        try {
            const res = await axios.post(`${API_BASE}/azure-ad/test-connection`, azureConfig);
            setAzureTestResult({ success: true, message: res.data.message });
        } catch (err: any) {
            setAzureTestResult({ success: false, message: err.response?.data?.message || 'Erreur de connexion Azure AD' });
        } finally {
            setIsAzureTesting(false);
        }
    };

    const handleVerifyAzureUser = async () => {
        if (!azureTestUser) return;
        setIsAzureTesting(true);
        setAzureTestResult(null);
        try {
            const res = await axios.post(`${API_BASE}/admin/azure/lookup`, { username: azureTestUser });
            if (res.data.success) {
                setAzureTestResult({ success: true, message: 'Utilisateur trouvé.', data: res.data.data });
            } else {
                setAzureTestResult({ success: false, message: res.data.message || 'Utilisateur non trouvé' });
            }
        } catch (err: any) {
            setAzureTestResult({ success: false, message: err.response?.data?.message || 'Erreur de recherche Azure' });
        } finally {
            setIsAzureTesting(false);
        }
    };
    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Annuaire & Authentification</h2>
                    <p className="text-slate-500 mt-2 font-medium">Gestion des connecteurs Active Directory et Azure AD (Entra ID).</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Active Directory (LDAP) */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Server size={20} /></div>
                            <div>
                                <h3 className="font-bold text-slate-900">Active Directory</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Liaison LDAP Locale</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setAdConfig({...adConfig, is_enabled: !adConfig.is_enabled})}
                            className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${adConfig.is_enabled ? 'bg-blue-600' : 'bg-slate-200'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${adConfig.is_enabled ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                    
                    <div className={`p-8 space-y-6 flex-1 transition-opacity ${!adConfig.is_enabled ? 'opacity-50' : ''}`}>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Hôte / IP du DC</label>
                                <div className="relative">
                                    <Globe size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={adConfig.host} onChange={e => setAdConfig({...adConfig, host: e.target.value})} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Port</label>
                                <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={adConfig.port} onChange={e => setAdConfig({...adConfig, port: parseInt(e.target.value)})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Groupe requis</label>
                                <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={adConfig.required_group} onChange={e => setAdConfig({...adConfig, required_group: e.target.value})} />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Base DN</label>
                                <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono text-[10px]" value={adConfig.base_dn} onChange={e => setAdConfig({...adConfig, base_dn: e.target.value})} />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Bind DN</label>
                                <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-mono text-[10px]" value={adConfig.bind_dn} onChange={e => setAdConfig({...adConfig, bind_dn: e.target.value})} />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mot de passe du Bind</label>
                                <input type="password" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={adConfig.bind_password} onChange={e => setAdConfig({...adConfig, bind_password: e.target.value})} />
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all" onClick={handleSaveAD}>
                                <Save size={16} /> Enregistrer
                            </button>
                            <button className="px-4 py-2.5 border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all" onClick={handlePingAD}>
                                <Radio size={16} /> Ping
                            </button>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Vérifier un utilisateur</p>
                             <div className="flex gap-2">
                                <input className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-sm font-bold" placeholder="s.jobs" value={testUser} onChange={e => setTestUser(e.target.value)} />
                                <button className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all" onClick={handleVerifyUser} disabled={isTesting || !testUser}><Search size={16} /></button>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Azure AD (Entra ID) */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Fingerprint size={20} /></div>
                            <div>
                                <h3 className="font-bold text-slate-900">Azure AD / Entra ID</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Liaison Modern Auth</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setAzureConfig({...azureConfig, is_enabled: !azureConfig.is_enabled})}
                            className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${azureConfig.is_enabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${azureConfig.is_enabled ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className={`p-8 space-y-6 flex-1 transition-opacity ${!azureConfig.is_enabled ? 'opacity-50' : ''}`}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tenant ID</label>
                                <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-[11px]" value={azureConfig.tenant_id} onChange={e => setAzureConfig({...azureConfig, tenant_id: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Client ID (App ID)</label>
                                <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-[11px]" value={azureConfig.client_id} onChange={e => setAzureConfig({...azureConfig, client_id: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Client Secret</label>
                                <input type="password" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-medium text-sm" value={azureConfig.client_secret} onChange={e => setAzureConfig({...azureConfig, client_secret: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Redirect URI</label>
                                <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-mono text-[10px]" value={azureConfig.redirect_uri} onChange={e => setAzureConfig({...azureConfig, redirect_uri: e.target.value})} placeholder="https://votre-app.fr/api/auth/azure/callback" />
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                             <button className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg" onClick={handleSaveAzure}>
                                <Save size={18} /> Enregistrer
                             </button>
                             <button 
                                className="px-4 py-2.5 border-2 border-indigo-200 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-all disabled:opacity-50" 
                                onClick={handlePingAzure}
                                disabled={isAzureTesting}
                            >
                                <Radio size={16} /> Ping
                            </button>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                             <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Vérifier un utilisateur (Azure)</p>
                             <div className="flex gap-2">
                                <input className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-sm font-bold" placeholder="prenom.nom@domaine.com" value={azureTestUser} onChange={e => setAzureTestUser(e.target.value)} />
                                <button className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all" onClick={handleVerifyAzureUser} disabled={isAzureTesting || !azureTestUser}><Search size={16} /></button>
                             </div>
                        </div>

                        {azureTestResult && (
                             <div className={`p-4 rounded-2xl border animate-in slide-in-from-bottom-2 ${azureTestResult.success ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                <div className="flex gap-3 items-center">
                                    {azureTestResult.success ? <Check size={18} /> : <AlertTriangle size={18} />}
                                    <span className="text-xs font-bold">{azureTestResult.message}</span>
                                </div>
                                {azureTestResult.data && (
                                    <div className="mt-3 pt-3 border-t border-emerald-200/50 flex flex-wrap gap-4">
                                        <div>
                                            <p className="text-[9px] uppercase font-black opacity-50">Nom</p>
                                            <p className="font-bold text-xs">{azureTestResult.data.displayName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] uppercase font-black opacity-50">UPN / Email</p>
                                            <p className="font-bold text-xs">{azureTestResult.data.userPrincipalName || azureTestResult.data.mail}</p>
                                        </div>
                                    </div>
                                )}
                             </div>
                        )}
                    </div>
                </div>
            </div>

            {testResult && (
                <div className={`p-6 rounded-3xl border animate-in slide-in-from-bottom-4 flex flex-col gap-4 shadow-lg ${testResult.success ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${testResult.success ? 'bg-emerald-200/50' : 'bg-rose-200/50'}`}>
                                {testResult.success ? <ShieldCheck size={24} /> : <AlertTriangle size={24} />}
                            </div>
                            <div>
                                <p className="font-black">Résultat du test AD</p>
                                <p className="text-sm font-medium opacity-80">{testResult.message}</p>
                            </div>
                        </div>
                        {testResult.data && (
                            <div className="flex gap-8 items-center pr-4">
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-black opacity-50">Nom Affiché</p>
                                    <p className="font-bold text-sm">{testResult.data.displayName}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] uppercase font-black opacity-50">Email</p>
                                    <p className="font-bold text-sm">{testResult.data.mail || 'N/A'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DirectorySettings;
