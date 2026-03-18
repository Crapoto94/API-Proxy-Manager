import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Database, Globe, Save, Zap, 
  CheckCircle2, AlertTriangle, Loader2, Users, Euro, RefreshCw, Box, LayoutGrid, X, Search as SearchIcon, Table, List
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api`;

const OracleSettings: React.FC = () => {
    const [configs, setConfigs] = useState<any[]>([
        { type: 'FINANCES', host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 },
        { type: 'RH', host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 }
    ]);
    const [testResults, setTestResults] = useState<Record<string, { success: boolean, message: string, details?: string[] }>>({});
    const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Explorer State
    const [isExplorerOpen, setIsExplorerOpen] = useState(false);
    const [explorerType, setExplorerType] = useState<string | null>(null);
    const [tableList, setTableList] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [tableColumns, setTableColumns] = useState<string[]>([]);
    const [tablePreview, setTablePreview] = useState<any>(null);
    const [explorerLoading, setExplorerLoading] = useState(false);
    const [explorerError, setExplorerError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await axios.get(`${API_BASE}/oracle-settings`);
            if (res.data && Array.isArray(res.data)) {
                const types = ['FINANCES', 'RH'];
                const synced = types.map(t => {
                    const existing = res.data.find((d: any) => d.type === t);
                    return existing || { type: t, host: '', port: 1521, service_name: '', username: '', password: '', is_enabled: 0 };
                });
                setConfigs(synced);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (config: any) => {
        setIsSaving(true);
        try {
            await axios.post(`${API_BASE}/oracle-settings`, config);
            // Non-blocking alert for now
            console.log(`Paramètres Oracle ${config.type} enregistrés`);
        } catch (err) {
            console.error('Erreur lors de la sauvegarde');
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async (type: string) => {
        const config = configs.find(c => c.type === type);
        if (!config) return;
        
        setIsTesting(prev => ({ ...prev, [type]: true }));
        try {
            const res = await axios.post(`${API_BASE}/oracle/test-connection`, { host: config.host, type });
            setTestResults(prev => ({ ...prev, [type]: { success: res.data.success, message: res.data.message } }));
        } catch (err: any) {
            setTestResults(prev => ({ ...prev, [type]: { success: false, message: err.response?.data?.message || 'Erreur de connexion' } }));
        } finally {
            setIsTesting(prev => ({ ...prev, [type]: false }));
        }
    };

    const openExplorer = async (type: string) => {
        setExplorerType(type);
        setIsExplorerOpen(true);
        setExplorerLoading(true);
        setExplorerError(null);
        setSelectedTable(null);
        setTableColumns([]);
        setTablePreview(null);
        setTableList([]);
        setSearchTerm('');

        try {
            const res = await axios.post(`${API_BASE}/oracle/check-tables`, { type });
            if (res.data.success) {
                setTableList(res.data.details || []);
            } else {
                setExplorerError(res.data.message || 'Impossible de lister les tables');
            }
        } catch (err: any) {
            setExplorerError(err.response?.data?.message || 'Erreur lors de la récupération des tables');
        } finally {
            setExplorerLoading(false);
        }
    };

    const exploreTable = async (tableName: string) => {
        if (!explorerType) return;
        setSelectedTable(tableName);
        setExplorerLoading(true);
        setExplorerError(null);
        
        try {
            const [colsRes, prevRes] = await Promise.all([
                axios.post(`${API_BASE}/oracle/table-columns`, { type: explorerType, tableName }),
                axios.post(`${API_BASE}/oracle/table-preview`, { type: explorerType, tableName })
            ]);
            
            setTableColumns(colsRes.data.columns || []);
            setTablePreview(prevRes.data.preview || null);
        } catch (err: any) {
            setExplorerError(err.response?.data?.message || 'Erreur lors de l\'exploration de la table');
        } finally {
            setExplorerLoading(false);
        }
    };

    const filteredTables = tableList.filter(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Bases Oracle & Flux</h2>
                    <p className="text-slate-500 mt-2 font-medium">Synchronisation des données RH et Finances vers le Proxyocal.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {configs.map(config => (
                    <div key={config.type} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.type === 'FINANCES' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {config.type === 'FINANCES' ? <Euro size={20} /> : <Users size={20} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Oracle {config.type}</h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Instance de Production</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => {
                                    const updated = configs.map(c => c.type === config.type ? { ...c, is_enabled: c.is_enabled ? 0 : 1 } : c);
                                    setConfigs(updated);
                                }}
                                className={`w-12 h-6 rounded-full relative transition-colors duration-300 ${config.is_enabled ? (config.type === 'FINANCES' ? 'bg-emerald-600' : 'bg-amber-600') : 'bg-slate-200'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${config.is_enabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6 flex-1">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Hôte / IP Scan</label>
                                    <div className="relative">
                                        <Globe size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={config.host} onChange={e => {
                                            setConfigs(configs.map(c => c.type === config.type ? { ...c, host: e.target.value } : c));
                                        }} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Port (Listener)</label>
                                    <input type="number" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={config.port} onChange={e => {
                                        setConfigs(configs.map(c => c.type === config.type ? { ...c, port: parseInt(e.target.value) } : c));
                                    }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Service Name / SID</label>
                                    <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={config.service_name} onChange={e => {
                                        setConfigs(configs.map(c => c.type === config.type ? { ...c, service_name: e.target.value } : c));
                                    }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Schéma</label>
                                    <input className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={config.username} onChange={e => {
                                        setConfigs(configs.map(c => c.type === config.type ? { ...c, username: e.target.value } : c));
                                    }} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mot de passe</label>
                                    <input type="password" placeholder="••••••••" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium text-sm" value={config.password} onChange={e => {
                                        setConfigs(configs.map(c => c.type === config.type ? { ...c, password: e.target.value } : c));
                                    }} />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all" onClick={() => handleSave(config)} disabled={isSaving}>
                                    <Save size={16} /> Enregistrer
                                </button>
                                <button className="px-4 py-2.5 border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2" onClick={() => handleTest(config.type)} disabled={isTesting[config.type]}>
                                    {isTesting[config.type] ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />} 
                                    Test
                                </button>
                            </div>

                            {testResults[config.type] && (
                                <div className={`p-4 rounded-2xl flex gap-3 ${testResults[config.type].success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {testResults[config.type].success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                                    <span className="text-xs font-bold">{testResults[config.type].message}</span>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-2"><LayoutGrid size={14} /> Exploration des données</h4>
                                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded font-bold text-slate-500 italic">Test Live</span>
                                </div>
                                <button 
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                    onClick={() => openExplorer(config.type)}
                                    disabled={!config.host}
                                >
                                    <Table size={16} /> Parcourir les tables & vues
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-dsihub-navy p-8 rounded-lg text-white flex items-center justify-between gap-8 relative overflow-hidden">
                <Database size={100} className="absolute -right-4 -bottom-4 opacity-5" />
                <div className="relative z-10">
                    <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                        <Box size={24} className="text-blue-400" /> Architecture Proxy Oracle
                    </h3>
                    <p className="text-slate-400 max-w-2xl text-sm leading-relaxed font-medium">
                        Le proxy APM agit comme une zone tampon. Il gère les pools de connexions et les synchronisations asynchrones pour éviter toute saturation des ressources critiques du SI.
                    </p>
                </div>
                <div className="bg-white/10 p-6 rounded-3xl border border-white/5 backdrop-blur-sm shrink-0 relative z-10">
                     <p className="text-[10px] font-black uppercase opacity-50 tracking-widest mb-1">Status Global</p>
                     <p className="text-2xl font-black text-emerald-400 flex items-center gap-2">OPÉRATIONNEL <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div></p>
                </div>
            </div>

            {/* Modal Explorer */}
            {isExplorerOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-5xl h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                                    <Database size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Explorateur Oracle {explorerType}</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Parcours des objets de schéma</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setIsExplorerOpen(false)}
                                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-200 text-slate-400 transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-hidden flex">
                            {/* Left: Table List */}
                            <div className="w-80 border-r border-slate-100 flex flex-col pt-6">
                                <div className="px-6 mb-4">
                                    <div className="relative">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input 
                                            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 ring-blue-500/20"
                                            placeholder="Rechercher une table..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-1">
                                    {explorerLoading && tableList.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-300">
                                            <Loader2 className="animate-spin" size={30} />
                                            <span className="text-[10px] font-black uppercase">Chargement...</span>
                                        </div>
                                    ) : filteredTables.map(tableName => (
                                        <button 
                                            key={tableName}
                                            onClick={() => exploreTable(tableName)}
                                            className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-3 ${selectedTable === tableName ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            <Box size={14} className={selectedTable === tableName ? 'text-white/50' : 'text-slate-400'} />
                                            <span className="truncate">{tableName}</span>
                                        </button>
                                    ))}
                                    {!explorerLoading && filteredTables.length === 0 && (
                                        <p className="text-center py-10 text-xs font-bold text-slate-300 italic">Aucun objet trouvé</p>
                                    )}
                                </div>
                            </div>

                            {/* Right: Details / Preview */}
                            <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
                                {explorerError && (
                                    <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 flex flex-col items-center gap-4">
                                        <AlertTriangle size={32} />
                                        <p className="font-bold text-sm text-center">{explorerError}</p>
                                    </div>
                                )}

                                {!selectedTable && !explorerLoading && !explorerError && (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 opacity-50">
                                        <Table size={60} />
                                        <p className="font-black uppercase text-sm tracking-widest text-center max-w-xs">
                                            Sélectionnez une table pour voir sa structure et un aperçu
                                        </p>
                                    </div>
                                )}

                                {selectedTable && (
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-6">
                                            <div className="flex-1">
                                                <h4 className="text-2xl font-black text-slate-900">{selectedTable}</h4>
                                                <div className="flex gap-4 mt-2">
                                                    <span className="text-[10px] bg-white border border-slate-200 px-2.5 py-1 rounded-lg font-bold text-slate-500 uppercase flex items-center gap-1.5 shadow-sm">
                                                        <Box size={12} /> {tableColumns.length} Colonnes
                                                    </span>
                                                    <span className="text-[10px] bg-slate-900 text-white px-2.5 py-1 rounded-lg font-bold uppercase flex items-center gap-1.5 shadow-md">
                                                        <Database size={12} /> Oracle schema
                                                    </span>
                                                </div>
                                            </div>
                                            {explorerLoading && <Loader2 size={24} className="animate-spin text-blue-600" />}
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* Columns List */}
                                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                                                <h5 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><List size={14} /> Structure des colonnes</h5>
                                                <div className="flex-1 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                                                    <div className="grid grid-cols-1 gap-2">
                                                        {tableColumns.map(col => (
                                                            <div key={col} className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-slate-700 flex items-center gap-3">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                                {col}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Data Preview */}
                                            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
                                                <h5 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><RefreshCw size={14} /> Aperçu (1ère ligne)</h5>
                                                <div className="flex-1 overflow-y-auto max-h-64 pr-2 custom-scrollbar">
                                                    {tablePreview ? (
                                                        <div className="space-y-3">
                                                            {Object.entries(tablePreview).map(([key, value]) => (
                                                                <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-tighter mb-1">{key}</p>
                                                                    <p className="text-[11px] font-mono font-bold text-blue-900 break-all">{String(value)}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-center py-10 text-xs font-bold text-slate-300 italic">Aucune donnée trouvée</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
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

export default OracleSettings;
