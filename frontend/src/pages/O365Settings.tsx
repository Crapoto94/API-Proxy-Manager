import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Mail, 
  Settings, 
  ShieldCheck, 
  RefreshCw, 
  Clock, 
  User, 
  ChevronRight,
  Loader2,
  AlertTriangle,
  X
} from 'lucide-react';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api/o365`;

interface Message {
    id: string;
    subject: string;
    receivedDateTime: string;
    from: {
        emailAddress: {
            name: string;
            address: string;
        };
    };
    isRead: boolean;
    body?: {
        contentType: string;
        content: string;
    };
}

const O365Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'config' | 'inbox'>('config');
    const [settings, setSettings] = useState({
        tenant_id: '',
        client_id: '',
        client_secret: '',
        mailbox: '',
        is_enabled: 0
    });
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [testLoading, setTestLoading] = useState(false);
    const [refreshLoading, setRefreshLoading] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [messageLoading, setMessageLoading] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        if (activeTab === 'inbox' && settings.is_enabled) {
            fetchMessages();
        }
    }, [activeTab]);

    const fetchSettings = async () => {
        try {
            const res = await axios.get(`${API_BASE}/settings`);
            setSettings(res.data);
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMessages = async () => {
        setRefreshLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/messages`);
            setMessages(res.data);
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        } finally {
            setRefreshLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.put(`${API_BASE}/settings`, settings);
            alert('Paramètres enregistrés');
        } catch (err) {
            alert('Erreur lors de l\'enregistrement');
        }
    };

    const handleTest = async () => {
        setTestLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/test`);
            if (res.data.success) {
                alert(res.data.message);
            } else {
                alert('Échec du test : ' + res.data.error);
            }
        } catch (err: any) {
            alert('Erreur réseau ou serveur : ' + (err.response?.data?.message || err.message));
        } finally {
            setTestLoading(false);
        }
    };

    const readMessage = async (id: string) => {
        setMessageLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/messages/${id}`);
            setSelectedMessage(res.data);
        } catch (err) {
            alert('Erreur lors de la lecture du message');
        } finally {
            setMessageLoading(false);
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
                    <h2 className="text-3xl font-black text-slate-900">Messagerie Office 365</h2>
                    <p className="text-slate-500 mt-2 font-medium">Consultez et moissonnez vos boîtes mail via Microsoft Graph API</p>
                </div>
            </div>

            <div className="flex gap-1 p-1 bg-slate-200/50 rounded-2xl w-fit">
                <button 
                    onClick={() => setActiveTab('config')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'config' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Settings size={18} />
                    <span>Configuration</span>
                </button>
                <button 
                    onClick={() => setActiveTab('inbox')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'inbox' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <Mail size={18} />
                    <span>Boîte de réception</span>
                </button>
            </div>

            {activeTab === 'config' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <form onSubmit={handleSave} className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tenant ID (Directory)</label>
                                    <input 
                                        type="text" 
                                        value={settings.tenant_id}
                                        onChange={e => setSettings({...settings, tenant_id: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                        placeholder="00000000-0000-0000-0000-000000000000"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client ID (Application)</label>
                                    <input 
                                        type="text" 
                                        value={settings.client_id}
                                        onChange={e => setSettings({...settings, client_id: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                        placeholder="00000000-0000-0000-0000-000000000000"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Client Secret</label>
                                    <input 
                                        type="password" 
                                        value={settings.client_secret}
                                        onChange={e => setSettings({...settings, client_secret: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                        placeholder="••••••••••••••••"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Adresse Mailbox à surveiller</label>
                                    <input 
                                        type="email" 
                                        value={settings.mailbox}
                                        onChange={e => setSettings({...settings, mailbox: e.target.value})}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-5 outline-none focus:border-blue-500 transition-all font-bold text-sm"
                                        placeholder="mailbox@votre-domaine.com"
                                    />
                                </div>
                                <div className="flex items-center gap-3 pt-6">
                                    <button 
                                        type="button"
                                        onClick={() => setSettings({...settings, is_enabled: settings.is_enabled ? 0 : 1})}
                                        className={`w-12 h-6 rounded-full transition-all relative ${settings.is_enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.is_enabled ? 'right-1' : 'left-1'}`} />
                                    </button>
                                    <span className="text-sm font-bold text-slate-700">Activer le moissonnage</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                            <button 
                                type="submit" 
                                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3.5 rounded-2xl font-black text-sm shadow-xl shadow-slate-900/10 transition-all active:scale-95"
                            >
                                SAUVEGARDER
                            </button>
                            <button 
                                type="button"
                                onClick={handleTest}
                                disabled={testLoading}
                                className="flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 px-8 py-3.5 rounded-2xl font-black text-sm transition-all"
                            >
                                {testLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                                <span>TESTER LA CONNEXION</span>
                            </button>
                        </div>
                    </form>

                    <div className="space-y-6">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-500/20">
                            <ShieldCheck size={32} className="mb-4 text-blue-200" />
                            <h3 className="text-xl font-black mb-2">Sécurité Azure AD</h3>
                            <p className="text-blue-100 text-sm leading-relaxed font-medium">
                                Configurez une **App Registration** dans votre tenant Entra ID (Azure AD) avec les permissions suivantes :
                            </p>
                            <ul className="mt-4 space-y-2 text-xs font-bold text-white/90">
                                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-white rounded-full" /> Mail.Read (Application)</li>
                                <li className="flex items-center gap-2"><div className="w-1 h-1 bg-white rounded-full" /> User.Read.All (Application)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
                    <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">Messages Récents</h3>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Dernières transactions détectées</p>
                        </div>
                        <button 
                            onClick={fetchMessages}
                            disabled={refreshLoading}
                            className="p-3 hover:bg-white rounded-2xl text-slate-600 border border-transparent hover:border-slate-200 transition-all shadow-sm"
                        >
                            <RefreshCw size={20} className={refreshLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {!settings.is_enabled ? (
                            <div className="p-20 text-center space-y-4 grayscale opacity-50">
                                <AlertTriangle size={64} className="mx-auto text-amber-500" />
                                <h4 className="text-xl font-black">Service Désactivé</h4>
                                <p className="text-sm font-medium text-slate-500">Activez le service dans l'onglet Configuration</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="p-20 text-center space-y-4">
                                <Mail size={64} className="mx-auto text-slate-200" />
                                <h4 className="text-xl font-black text-slate-300">Aucun message trouvé</h4>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {messages.map(msg => (
                                    <div 
                                        key={msg.id} 
                                        onClick={() => readMessage(msg.id)}
                                        className="p-6 flex items-center justify-between hover:bg-slate-50/80 cursor-pointer transition-all group"
                                    >
                                        <div className="flex items-center gap-6 min-w-0">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${msg.isRead ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600 shadow-sm'}`}>
                                                <Mail size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className={`text-sm font-black truncate ${msg.isRead ? 'text-slate-600' : 'text-slate-900'}`}>{msg.subject}</h4>
                                                <div className="flex items-center gap-4 mt-1">
                                                    <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                                                        <User size={12} />
                                                        {msg.from?.emailAddress?.name || 'Inconnu'}
                                                    </span>
                                                    <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                                                        <Clock size={12} />
                                                        {new Date(msg.receivedDateTime).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 pl-4">
                                            {!msg.isRead && <div className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-lg shadow-blue-500/50" />}
                                            <ChevronRight className="text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Message Viewer Modal */}
            {selectedMessage && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setSelectedMessage(null)}></div>
                    <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900">{selectedMessage.subject}</h3>
                                <div className="flex items-center gap-4 mt-3">
                                    <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
                                        <User size={14} className="text-blue-500" />
                                        {selectedMessage.from?.emailAddress?.name} ({selectedMessage.from?.emailAddress?.address})
                                    </div>
                                    <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
                                        <Clock size={14} className="text-blue-500" />
                                        {new Date(selectedMessage.receivedDateTime).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setSelectedMessage(null)} className="p-4 hover:bg-white rounded-2xl text-slate-400 hover:text-slate-900 transition-all border border-transparent hover:border-slate-200">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-10">
                            {selectedMessage.body?.contentType === 'html' ? (
                                <div 
                                    className="prose prose-slate max-w-none font-medium text-slate-800"
                                    dangerouslySetInnerHTML={{ __html: selectedMessage.body.content }} 
                                />
                            ) : (
                                <pre className="whitespace-pre-wrap font-sans font-medium text-slate-800 leading-relaxed">
                                    {selectedMessage.body?.content}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {messageLoading && (
                <div className="fixed inset-0 z-[110] bg-white/50 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="animate-spin text-blue-600" size={48} />
                </div>
            )}
        </div>
    );
};

export default O365Settings;
