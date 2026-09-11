import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Bot,
    Loader2,
    ShieldCheck,
    Plus,
    Trash2,
    CheckCircle2,
    XCircle,
    HelpCircle,
    RefreshCw,
    Zap
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api/ai`;

interface AiSettings {
    groq_api_key: string;
    nvidia_api_key: string;
    ollama_url: string;
    ollama_enabled: number;
    default_model_id: number | null;
    query_timeout_ms: number;
}

interface AiModel {
    id: number;
    key: string;
    provider: 'groq' | 'nvidia' | 'ollama';
    provider_label: string;
    name: string;
    model: string;
    is_active: boolean;
    active: boolean;
    is_default: boolean;
    last_test: {
        status: 'ok' | 'error' | 'unknown';
        message: string | null;
        latency_ms: number | null;
        tested_at: string | null;
    };
}

const PROVIDER_OPTIONS = [
    { id: 'groq', label: 'Groq' },
    { id: 'nvidia', label: 'NVIDIA NIM' },
    { id: 'ollama', label: 'Ollama' }
];

const StatusBadge: React.FC<{ lastTest: AiModel['last_test'] }> = ({ lastTest }) => {
    const title = lastTest.tested_at
        ? `${lastTest.message || ''}\nTesté le ${new Date(lastTest.tested_at).toLocaleString()}`
        : 'Jamais testé';

    if (lastTest.status === 'ok') {
        return (
            <span title={title} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black">
                <CheckCircle2 size={14} /> OK
            </span>
        );
    }
    if (lastTest.status === 'error') {
        return (
            <span title={title} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-black">
                <XCircle size={14} /> Erreur
            </span>
        );
    }
    return (
        <span title={title} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-black">
            <HelpCircle size={14} /> Jamais testé
        </span>
    );
};

const AISettings: React.FC = () => {
    const [settings, setSettings] = useState<AiSettings>({
        groq_api_key: '',
        nvidia_api_key: '',
        ollama_url: '',
        ollama_enabled: 0,
        default_model_id: null,
        query_timeout_ms: 300000
    });
    const [models, setModels] = useState<AiModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [testingAll, setTestingAll] = useState(false);
    const [testingId, setTestingId] = useState<number | null>(null);
    const [newModel, setNewModel] = useState({ provider: 'groq', name: '', model: '' });
    const [adding, setAdding] = useState(false);

    const load = async () => {
        try {
            const [settingsRes, modelsRes] = await Promise.all([
                axios.get(`${API_BASE}/settings`),
                axios.get(`${API_BASE}/models`)
            ]);
            setSettings(settingsRes.data);
            setModels(modelsRes.data);
        } catch (err) {
            console.error('Failed to load AI settings:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSettings(true);
        try {
            await axios.put(`${API_BASE}/settings`, settings);
            await load();
            alert('Paramètres IA enregistrés');
        } catch (err: any) {
            alert('Erreur lors de l\'enregistrement : ' + (err.response?.data?.error || err.message));
        } finally {
            setSavingSettings(false);
        }
    };

    const handleAddModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newModel.name.trim() || !newModel.model.trim()) return;
        setAdding(true);
        try {
            await axios.post(`${API_BASE}/models`, newModel);
            setNewModel({ provider: newModel.provider, name: '', model: '' });
            await load();
        } catch (err: any) {
            alert('Erreur lors de l\'ajout : ' + (err.response?.data?.error || err.message));
        } finally {
            setAdding(false);
        }
    };

    const handleDeleteModel = async (id: number) => {
        if (!confirm('Supprimer ce modèle ?')) return;
        try {
            await axios.delete(`${API_BASE}/models/${id}`);
            await load();
        } catch (err) {
            alert('Erreur lors de la suppression');
        }
    };

    const handleToggleActive = async (m: AiModel) => {
        try {
            await axios.put(`${API_BASE}/models/${m.id}`, { name: m.name, model: m.model, is_active: !m.is_active });
            await load();
        } catch (err) {
            alert('Erreur lors de la mise à jour');
        }
    };

    const handleTestModel = async (id: number) => {
        setTestingId(id);
        try {
            const res = await axios.post(`${API_BASE}/models/${id}/test`);
            await load();
            if (!res.data.success) alert('Échec du test : ' + res.data.message);
        } catch (err: any) {
            alert('Erreur réseau ou serveur : ' + (err.response?.data?.message || err.message));
        } finally {
            setTestingId(null);
        }
    };

    const handleTestAll = async () => {
        setTestingAll(true);
        try {
            const res = await axios.post(`${API_BASE}/test-all`);
            await load();
            alert(`${res.data.ok}/${res.data.tested} modèle(s) opérationnel(s)`);
        } catch (err: any) {
            alert('Erreur lors du test global : ' + (err.response?.data?.error || err.message));
        } finally {
            setTestingAll(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-blue-600" size={48} />
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Intelligence Artificielle</h2>
                    <p className="text-slate-500 mt-2 font-medium">
                        Paramétrez les fournisseurs IA (Groq, NVIDIA NIM, Ollama) et exposez-les via l'API Ville — mêmes paramètres que l'outil analyse-mail.
                    </p>
                </div>
                <button
                    onClick={handleTestAll}
                    disabled={testingAll}
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-slate-900/10 transition-all active:scale-95"
                >
                    {testingAll ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                    <span>TESTER TOUS LES MODÈLES</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <form onSubmit={handleSaveSettings} className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 space-y-6">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Clé API Groq</label>
                                <input
                                    type="password"
                                    value={settings.groq_api_key || ''}
                                    onChange={e => setSettings({ ...settings, groq_api_key: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                    placeholder="gsk_••••••••••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Clé API NVIDIA NIM</label>
                                <input
                                    type="password"
                                    value={settings.nvidia_api_key || ''}
                                    onChange={e => setSettings({ ...settings, nvidia_api_key: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                    placeholder="nvapi-••••••••••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">URL instance Ollama</label>
                                <input
                                    type="text"
                                    value={settings.ollama_url || ''}
                                    onChange={e => setSettings({ ...settings, ollama_url: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                    placeholder="http://10.103.130.166:11434"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setSettings({ ...settings, ollama_enabled: settings.ollama_enabled ? 0 : 1 })}
                                    className={`w-12 h-6 rounded-full transition-all relative ${settings.ollama_enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.ollama_enabled ? 'right-1' : 'left-1'}`} />
                                </button>
                                <span className="text-sm font-bold text-slate-700">Activer Ollama</span>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                                    Délai d'attente /api/v1/ai/query (secondes)
                                </label>
                                <input
                                    type="number"
                                    min={10}
                                    max={1200}
                                    step={10}
                                    value={Math.round((settings.query_timeout_ms ?? 300000) / 1000)}
                                    onChange={e => setSettings({ ...settings, query_timeout_ms: (Number(e.target.value) || 300) * 1000 })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                />
                                <p className="text-xs text-slate-400 font-medium ml-1">
                                    Augmentez cette valeur si une IA locale (Ollama) ou un prompt long (ex. résumé de réunion) dépasse le délai par défaut (5 min). Pensez aussi au délai du reverse-proxy éventuel devant cette API.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Modèle par défaut</label>
                                <select
                                    value={settings.default_model_id ?? ''}
                                    onChange={e => setSettings({ ...settings, default_model_id: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                >
                                    <option value="">Automatique (premier fournisseur actif)</option>
                                    {models.map(m => (
                                        <option key={m.id} value={m.id}>{m.provider_label} — {m.name} ({m.model})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                        <button
                            type="submit"
                            disabled={savingSettings}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-black text-sm shadow-xl shadow-slate-900/10 transition-all active:scale-95"
                        >
                            {savingSettings ? 'ENREGISTREMENT...' : 'SAUVEGARDER'}
                        </button>
                    </div>
                </form>

                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-500/20">
                        <ShieldCheck size={32} className="mb-4 text-blue-200" />
                        <h3 className="text-xl font-black mb-2">Surveillance automatique</h3>
                        <p className="text-blue-100 text-sm leading-relaxed font-medium">
                            Chaque modèle actif est testé automatiquement <strong>toutes les heures</strong>. L'API externe
                            <code className="mx-1 bg-white/20 px-1.5 py-0.5 rounded text-xs">/api/v1/ai/models</code>
                            renvoie l'état du dernier test sans re-tester en direct.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-black text-slate-900">Modèles configurés</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Un ou plusieurs modèles nommés par fournisseur</p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="p-4">Fournisseur</th>
                                <th className="p-4">Nom</th>
                                <th className="p-4">Modèle technique</th>
                                <th className="p-4">Actif</th>
                                <th className="p-4">Défaut</th>
                                <th className="p-4">Dernier test</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {models.map(m => (
                                <tr key={m.id} className={!m.active ? 'opacity-50' : ''}>
                                    <td className="p-4 font-black text-slate-700">{m.provider_label}</td>
                                    <td className="p-4 font-bold">{m.name}</td>
                                    <td className="p-4 font-mono text-xs text-slate-500">{m.model}</td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => handleToggleActive(m)}
                                            className={`w-10 h-5 rounded-full transition-all relative ${m.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}
                                        >
                                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${m.is_active ? 'right-0.5' : 'left-0.5'}`} />
                                        </button>
                                    </td>
                                    <td className="p-4">{m.is_default && <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full">DÉFAUT</span>}</td>
                                    <td className="p-4"><StatusBadge lastTest={m.last_test} /></td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2 justify-end">
                                            <button
                                                onClick={() => handleTestModel(m.id)}
                                                disabled={testingId === m.id}
                                                className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-blue-600 transition-all"
                                                title="Tester maintenant"
                                            >
                                                {testingId === m.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteModel(m.id)}
                                                className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-all"
                                                title="Supprimer"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {models.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-slate-400 font-bold">
                                        <Bot size={40} className="mx-auto mb-3 text-slate-200" />
                                        Aucun modèle configuré pour l'instant
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <form onSubmit={handleAddModel} className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fournisseur</label>
                        <select
                            value={newModel.provider}
                            onChange={e => setNewModel({ ...newModel, provider: e.target.value })}
                            className="bg-white border border-slate-200 rounded-xl py-2.5 px-4 outline-none focus:border-blue-500 font-bold text-sm"
                        >
                            {PROVIDER_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1 flex-1 min-w-[160px]">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nom</label>
                        <input
                            type="text"
                            value={newModel.name}
                            onChange={e => setNewModel({ ...newModel, name: e.target.value })}
                            placeholder="Rapide"
                            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 outline-none focus:border-blue-500 font-bold text-sm"
                        />
                    </div>
                    <div className="space-y-1 flex-1 min-w-[220px]">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Identifiant technique</label>
                        <input
                            type="text"
                            value={newModel.model}
                            onChange={e => setNewModel({ ...newModel, model: e.target.value })}
                            placeholder="llama-3.1-8b-instant"
                            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 outline-none focus:border-blue-500 font-bold text-sm font-mono"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={adding}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
                    >
                        {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        <span>AJOUTER</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AISettings;
