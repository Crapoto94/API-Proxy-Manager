import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Send, Shield, Globe, Mail, User, Lock, Server, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const API_BASE = 'http://localhost:8001/api';

const MailSettings: React.FC = () => {
    const [settings, setSettings] = useState<any>({
        smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '',
        smtp_secure: 'tls', sender_email: '', sender_name: 'APM Proxy',
        template_html: '<html><body>{{content}}</body></html>'
    });
    const [testEmail, setTestEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    useEffect(() => { fetchSettings(); }, []);

    const fetchSettings = async () => {
        try {
            const res = await axios.get(`${API_BASE}/mail-settings`);
            if (res.data) setSettings(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus(null);
        try {
            await axios.post(`${API_BASE}/mail-settings`, settings);
            setStatus({ type: 'success', msg: 'Configuration enregistrée avec succès' });
        } catch (err) {
            setStatus({ type: 'error', msg: 'Erreur lors de l\'enregistrement' });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        if (!testEmail) return alert('Saisissez un email de destination');
        setTesting(true);
        setStatus(null);
        try {
            await axios.post(`${API_BASE}/send-test-mail`, { to: testEmail });
            setStatus({ type: 'success', msg: 'Email de test envoyé !' });
        } catch (err: any) {
            setStatus({ type: 'error', msg: `Échec de l'envoi : ${err.response?.data?.error || err.message}` });
        } finally {
            setTesting(false);
        }
    };

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Configuration Mail & SMS</h2>
                    <p className="text-slate-500 mt-2 font-medium">Paramétrage du relais SMTP et des services de notification.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Server size={20} /></div>
                            <div>
                                <h3 className="font-bold text-slate-900">Serveur SMTP / Brevo</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Relais de messagerie</p>
                            </div>
                        </div>
                        <div className="p-8 grid grid-cols-2 gap-6">
                             <div className="col-span-2 space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Hôte SMTP (ou Brevo Key)</label>
                                <div className="relative">
                                    <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={settings.smtp_host} 
                                        onChange={e => setSettings({...settings, smtp_host: e.target.value})}
                                        placeholder="ex: smtp.office365.com"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Port</label>
                                <input 
                                    type="number" 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                    value={settings.smtp_port} 
                                    onChange={e => setSettings({...settings, smtp_port: parseInt(e.target.value)})}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sécurité</label>
                                <select 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                    value={settings.smtp_secure} 
                                    onChange={e => setSettings({...settings, smtp_secure: e.target.value})}
                                >
                                    <option value="none">Aucune</option>
                                    <option value="tls">STARTTLS (587)</option>
                                    <option value="ssl">SSL/TLS (465)</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Utilisateur</label>
                                <div className="relative">
                                    <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={settings.smtp_user} 
                                        onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mot de passe / Clé API</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="password"
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={settings.smtp_pass} 
                                        onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center"><Mail size={20} /></div>
                            <div>
                                <h3 className="font-bold text-slate-900">Expéditeur & Template</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Identité visuelle</p>
                            </div>
                        </div>
                        <div className="p-8 space-y-8">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nom de l'expéditeur</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={settings.sender_name} 
                                        onChange={e => setSettings({...settings, sender_name: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Email de l'expéditeur</label>
                                    <input 
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={settings.sender_email} 
                                        onChange={e => setSettings({...settings, sender_email: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enveloppe HTML Global ({"{{content}}"})</label>
                                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                    <ReactQuill 
                                        theme="snow" 
                                        value={settings.template_html} 
                                        onChange={val => setSettings({...settings, template_html: val})}
                                        style={{ height: '200px' }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button className="flex items-center gap-2 px-8 py-3 bg-dsihub-red text-white rounded-lg font-bold hover:opacity-90 transition-all shadow-sm" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                Enregistrer la configuration
                            </button>
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-white p-8 rounded-lg border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-900 mb-2">Test d'envoi</h3>
                        <p className="text-sm text-slate-500 mb-6 font-medium">Vérifiez vos paramètres instantanément.</p>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Destinataire</label>
                                <input 
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                    placeholder="test@example.com"
                                    value={testEmail}
                                    onChange={e => setTestEmail(e.target.value)}
                                />
                            </div>
                            <button className="w-full flex items-center justify-center gap-2 px-6 py-3 border-2 border-dsihub-navy text-dsihub-navy rounded-lg font-bold hover:bg-slate-50 transition-all" onClick={handleTest} disabled={testing || !testEmail}>
                                {testing ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                Lancer le test
                            </button>
                        </div>
                    </div>

                    {status && (
                        <div className={`p-6 rounded-3xl flex gap-4 animate-in slide-in-from-top-4 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                            <div className="shrink-0 mt-1">
                                {status.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                            </div>
                            <div>
                                <p className="font-black text-sm">{status.type === 'success' ? 'C\'est prêt !' : 'Oups...'}</p>
                                <p className="text-xs mt-1 font-medium leading-relaxed">{status.msg}</p>
                            </div>
                        </div>
                    )}

                    <div className="bg-dsihub-navy p-8 rounded-lg text-white shadow-sm relative overflow-hidden">
                        <Shield size={64} className="absolute -right-4 -bottom-4 opacity-10" />
                        <h4 className="font-bold mb-2 flex items-center gap-2">
                            <Globe size={18} /> Note Proxy
                        </h4>
                        <p className="text-xs text-blue-100 leading-relaxed font-medium">
                            En utilisant ce proxy, toutes les applications clientes bénéficient d'une configuration de messagerie unifiée et sécurisée.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MailSettings;
