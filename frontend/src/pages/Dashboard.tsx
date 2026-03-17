import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Activity, 
  AlertTriangle, 
  Clock, 
  Box,
  Database,
  ShieldCheck,
  Mail,
  Smartphone,
  Loader2
} from 'lucide-react';

const API_BASE = 'http://localhost:8001/api';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<any>(null);
    const [proxyLogs, setProxyLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const fetchDashboardData = async () => {
        try {
            const [statsRes, logsRes] = await Promise.all([
                axios.get(`${API_BASE}/dashboard/stats`),
                axios.get(`${API_BASE}/admin/external/logs`)
            ]);
            setStats(statsRes.data);
            setProxyLogs(logsRes.data);
            setLastUpdate(new Date());
        } catch (err) {
            console.error('Erreur lors de la récupération des données:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, []);

    if (loading && !stats) {
        return (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="animate-spin text-blue-600" size={40} />
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Initialisation du Dashboard...</p>
            </div>
        );
    }

    const statCards = [
        { label: 'Requêtes / 24h', value: stats?.requests || '0', change: '+12%', color: 'blue', icon: Activity },
        { label: 'Alertes Système', value: stats?.alerts || '0', change: 'OK', color: stats?.alerts > 0 ? 'rose' : 'emerald', icon: AlertTriangle },
        { label: 'Latence API', value: stats?.latency || '45ms', change: '-2ms', color: 'emerald', icon: Clock },
        { label: 'Apps Connectées', value: stats?.apps || '0', change: 'Direct', color: 'amber', icon: Box },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-end justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Dashboard Live</h2>
                    <p className="text-slate-500 mt-2 font-medium flex items-center gap-2">
                        État de l'architecture APM en temps réel 
                        <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    </p>
                </div>
                <div className="text-[10px] font-black text-slate-400 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm uppercase tracking-widest">
                    Dernière MAJ : {lastUpdate.toLocaleTimeString()}
                </div>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:border-blue-200 hover:shadow-xl group">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:scale-110 transition-transform`}>
                                <stat.icon size={20} />
                            </div>
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg bg-${stat.color}-50 text-${stat.color}-600 uppercase tracking-tight`}>
                                {stat.change}
                            </span>
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                        <h4 className="text-3xl font-black text-slate-900 mt-1">{stat.value}</h4>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Services Status */}
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-3">
                            <ShieldCheck className="text-blue-600" size={24} /> État des Services Proxy
                        </h3>
                    </div>
                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(stats?.services || []).map((service: any, i: number) => (
                                <div key={i} className="p-5 rounded-3xl border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${service.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {service.name.includes('Mail') ? <Mail size={20} /> : 
                                             service.name.includes('SMS') ? <Smartphone size={20} /> :
                                             service.type === 'Database' ? <Database size={20} /> : <ShieldCheck size={20} />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{service.name}</p>
                                            <p className="text-[10px] font-black text-slate-400 uppercase">{service.type}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${service.status === 'online' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {service.status === 'online' ? 'On' : 'Off'}
                                        </span>
                                        <div className={`w-2 h-2 rounded-full ${service.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'} ${service.status === 'online' ? 'animate-pulse' : ''}`}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Flux Proxy Live */}
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/50">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-3">
                            <Activity className="text-blue-600" size={24} /> Flux Proxy Live
                        </h3>
                    </div>
                    <div className="p-8 flex-1 overflow-y-auto max-h-[400px]">
                        <div className="space-y-6">
                            {proxyLogs.length === 0 ? (
                                <div className="py-10 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest italic">Aucun flux détecté</div>
                            ) : proxyLogs.map((log, i) => (
                                <div key={i} className="flex gap-4 items-start relative pb-6 border-l-2 border-slate-100 pl-6 last:pb-0 last:border-0">
                                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-4 ${log.status < 400 ? 'border-emerald-500' : 'border-rose-500'}`}></div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold text-slate-900">{log.endpoint}</p>
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${log.status < 400 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                                {log.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-black text-slate-400 uppercase">{log.method}</span>
                                            <span className="text-[10px] text-slate-300">•</span>
                                            <span className="text-[10px] font-bold text-blue-600 truncate">{log.app_name}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase flex items-center gap-1">
                                            <Clock size={10} /> {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Box */}
            <div className="bg-dsihub-navy p-10 rounded-[2.5rem] text-white overflow-hidden relative group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                    <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center shrink-0 backdrop-blur-md border border-white/10 group-hover:rotate-12 transition-transform duration-500">
                        <LayoutGrid size={48} className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-2xl font-black mb-3">Monitoring Centralisé APM</h3>
                        <p className="text-slate-400 font-medium text-sm leading-relaxed max-w-2xl">
                            Cette console vous permet de superviser l'ensemble des flux de données passant par le proxy APM. 
                            Tous les services sont interrogés dynamiquement pour garantir une vision précise de la disponibilité de votre architecture.
                        </p>
                    </div>
                    <div className="bg-white p-6 rounded-[2rem] text-slate-900 border border-white shrink-0 min-w-[200px]">
                        <p className="text-[10px] font-black uppercase opacity-50 tracking-widest mb-1">Architecture</p>
                        <p className="text-xl font-black flex items-center gap-2 text-dsihub-red underline decoration-4 decoration-blue-500/20 underline-offset-4">HYB-GRID 2.0</p>
                        <div className="flex items-center gap-1 mt-4">
                            {[1,1,1,1,0].map((active, i) => (
                                <div key={i} className={`h-1.5 rounded-full ${active ? 'w-4 bg-emerald-500' : 'w-2 bg-slate-200'}`}></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

import { LayoutGrid } from 'lucide-react';
