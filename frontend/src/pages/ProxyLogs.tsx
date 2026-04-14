import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Activity, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Box, 
  AlertTriangle, 
  CheckCircle2,
  Database,
  Eye,
  X
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api`;

const ProxyLogs: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [apps, setApps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [limit] = useState(20);
    
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Filters
    const [appFilter, setAppFilter] = useState(searchParams.get('app') || 'all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // UI states
    const [selectedLog, setSelectedLog] = useState<any>(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: (page * limit).toString(),
                app_id: appFilter,
                status: statusFilter,
                search: searchTerm,
                start_date: startDate,
                end_date: endDate
            });
            const res = await axios.get(`${API_BASE}/admin/external/logs?${params.toString()}`);
            setLogs(res.data.logs);
            setTotal(res.data.total);
        } catch (err) {
            console.error('Failed to fetch logs:', err);
        } finally {
            setLoading(false);
        }
    }, [page, limit, appFilter, statusFilter, searchTerm, startDate, endDate]);

    const fetchApps = async () => {
        try {
            const res = await axios.get(`${API_BASE}/admin/external/apps`);
            setApps(res.data);
        } catch (err) {
            console.error('Failed to fetch apps:', err);
        }
    };

    useEffect(() => {
        fetchApps();
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Logs Proxy</h2>
                    <p className="text-slate-500 mt-2 font-medium">Historique exhaustif et filtrage de tous les flux transitant par l'APM.</p>
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200">
                    <Database size={16} className="text-blue-600" />
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{total} entrées au total</span>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="text" 
                        placeholder="Rechercher un endpoint, un payload..." 
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 text-sm font-medium"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <select 
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                        value={appFilter}
                        onChange={e => setAppFilter(e.target.value)}
                    >
                        <option value="all">Toutes les Apps</option>
                        {apps.map(app => (
                            <option key={app.id} value={app.id}>{app.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <select 
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                    >
                        <option value="all">Tous les Statuts</option>
                        <option value="success">Succès (2xx)</option>
                        <option value="error">Erreurs (4xx/5xx)</option>
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-slate-400" />
                    <input 
                        type="datetime-local" 
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        placeholder="Début"
                    />
                    <span className="text-slate-300">à</span>
                    <input 
                        type="datetime-local" 
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        placeholder="Fin"
                    />
                </div>

                <button 
                    onClick={() => { setAppFilter('all'); setStatusFilter('all'); setSearchTerm(''); setStartDate(''); setEndDate(''); setPage(0); setSearchParams({}); }}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Réinitialiser les filtres"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Heure</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Application</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Requête</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Réponse</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="px-6 py-4 h-12 bg-slate-50/30"></td>
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-slate-300 font-bold uppercase tracking-widest italic">
                                        Aucun log trouvé
                                    </td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-900 tabular-nums">
                                                {new Date(log.timestamp).toLocaleDateString()}
                                            </span>
                                            <span className="text-[10px] font-black text-slate-400 flex items-center gap-1">
                                                <Clock size={10} /> {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Box size={14} className="text-blue-500" />
                                            <span className="text-xs font-bold text-slate-700">{log.app_name || 'Inconnu'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 max-w-[200px]">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0 ${
                                                    log.method === 'POST' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {log.method}
                                                </span>
                                                <code className="text-[10px] font-mono text-slate-600 truncate">
                                                    {log.endpoint}
                                                </code>
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-mono truncate">
                                                {log.payload && log.payload !== '{}' ? log.payload : ''}
                                            </p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 max-w-[200px]">
                                        <p className="text-[10px] text-slate-400 font-mono truncate">
                                            {log.response_payload || '-'}
                                        </p>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {log.status < 400 ? (
                                                <div className="flex items-center gap-1.5 text-emerald-600">
                                                    <CheckCircle2 size={14} />
                                                    <span className="text-xs font-black">{log.status}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-rose-600">
                                                    <AlertTriangle size={14} />
                                                    <span className="text-xs font-black">{log.status}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setSelectedLog(log)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                        >
                                            <Eye size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        Page {page + 1} sur {Math.max(1, totalPages)}
                    </p>
                    <div className="flex items-center gap-1">
                        <button 
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-blue-500 hover:text-blue-600 transition-all font-bold"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                            // Simple logic for windowed pagination
                            let pageNum = page - 2 + i;
                            if (page < 2) pageNum = i;
                            if (page > totalPages - 3) pageNum = totalPages - 5 + i;
                            
                            if (pageNum < 0 || pageNum >= totalPages) return null;

                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setPage(pageNum)}
                                    className={`w-9 h-9 rounded-lg text-xs font-black transition-all ${
                                        page === pageNum 
                                            ? 'bg-blue-600 text-white shadow-lg' 
                                            : 'bg-white border border-slate-200 text-slate-500 hover:border-blue-500'
                                    }`}
                                >
                                    {pageNum + 1}
                                </button>
                            );
                        })}
                        <button 
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-blue-500 hover:text-blue-600 transition-all font-bold"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Visualisation Details Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedLog(null)}></div>
                    <div className="relative bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selectedLog.status < 400 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                    <Activity size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Détails de la requête</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedLog.method} • {selectedLog.endpoint}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"><X size={24}/></button>
                        </div>
                        
                        <div className="p-8 overflow-y-auto space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Application</p>
                                    <p className="font-extrabold text-blue-600">{selectedLog.app_name || 'Inconnue'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date & Heure précise</p>
                                    <p className="font-extrabold text-slate-900">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requête (Payload)</p>
                                <div className="bg-slate-900 rounded-2xl p-6 overflow-x-auto border border-slate-800">
                                    <pre className="text-xs font-mono text-indigo-300 leading-relaxed font-bold">
                                        {(() => {
                                            try {
                                                const parsed = JSON.parse(selectedLog.payload);
                                                return JSON.stringify(parsed, null, 2);
                                            } catch(e) {
                                                return selectedLog.payload || '{}';
                                            }
                                        })()}
                                    </pre>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Réponse (Retour de l'API)</p>
                                <div className="bg-slate-900 rounded-2xl p-6 overflow-x-auto border border-slate-800">
                                    <pre className={`text-xs font-mono leading-relaxed font-bold ${selectedLog.status < 400 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {(() => {
                                            try {
                                                const parsed = JSON.parse(selectedLog.response_payload);
                                                return JSON.stringify(parsed, null, 2);
                                            } catch(e) {
                                                return selectedLog.response_payload || '-';
                                            }
                                        })()}
                                    </pre>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paramètres Query</p>
                                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 italic text-slate-500 font-medium text-xs">
                                    {selectedLog.query_params || '{}'}
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setSelectedLog(null)} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProxyLogs;
