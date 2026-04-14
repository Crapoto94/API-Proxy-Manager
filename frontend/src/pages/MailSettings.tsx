import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Send, Shield, Globe, Mail, User, Lock, Server, CheckCircle2, AlertTriangle, Loader2, Zap, Code, Eye } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { API_BASE_URL } from '../config';

const API_BASE = `${API_BASE_URL}/api`;

const MailSettings: React.FC = () => {
    const [settings, setSettings] = useState<any>({
        smtp_host: '', smtp_port: 587, smtp_user: '', smtp_pass: '',
        smtp_secure: 'tls', sender_email: '', sender_name: 'APM Proxy',
        footer_line1: 'DIRECTION DES SYSTEMES D\'INFORMATION',
        footer_line2: 'Assistance Technique',
        footer_line3: 'Téléphone : 01 49 60 29 88 • Interne : 29 88',
        footer_color: '#004a99',
        template_html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<body style="margin: 0; padding: 0; min-width: 100%; background-color: #f4f7f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <table width="100%" bgcolor="#f4f7f9" border="0" cellpadding="0" cellspacing="0" style="background-color: #f4f7f9;">
    <tr>
        <td style="padding: 40px 0;">
            <table align="center" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 750px;">
                <tr>
                    <td align="center" style="padding-bottom: 30px;">
                        <img src="Ivry.png" width="180" border="0" alt="Ivry s/ Seine" />
                        <div style="font-size: 18px; font-weight: 700; color: #1a202c; margin-top: 10px;">Ville d'Ivry-sur-seine</div>
                    </td>
                </tr>
                <tr>
                    <td bgcolor="#ffffff" style="background-color: #ffffff; padding: 40px; border: 1px solid #e1e7ed; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td style="font-size: 16px; line-height: 1.6; color: #2d3748;">
                                    {{content}}
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td align="center" style="padding: 30px;">
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td height="4" style="height: 4px; background: linear-gradient(to right, #e53e3e, {{footerColor}}); border-radius: 2px;"></td>
                            </tr>
                        </table>
                        <br />
                        <table width="100%" border="0" cellspacing="0" cellpadding="0">
                            <tr>
                                <td align="center" style="color: #718096; font-size: 13px; line-height: 20px;">
                                    <div style="text-transform: uppercase; letter-spacing: 1.2px; font-weight: 800; color: {{footerColor}}; font-size: 11px; margin-bottom: 5px;">{{footer1}}</div>
                                    <div style="font-weight: 600; color: #4a5568;">{{footer2}}</div>
                                    <div>{{footer3}}</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    </table>
</body>
</html>`
    });
    const [testEmail, setTestEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const [showHtml, setShowHtml] = useState(false);

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
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.response?.data?.message || err.message });
        } finally {
            setSaving(false);
        }
    };

    const getPreviewHtml = () => {
        let html = settings.template_html || '{{content}}';
        
        // Simulation du remplacement backend pour l'aperçu
        const footer1 = settings.footer_line1 || '';
        const footer2 = settings.footer_line2 || '';
        const footer3 = settings.footer_line3 || '';
        const footerColor = settings.footer_color || '#004a99';
        const contentSample = `<div style="padding: 20px; background: #fffbeb; border: 1px dashed #f59e0b; color: #92400e; border-radius: 8px;">
            Ceci est un exemple de contenu de message ({{content}}).
        </div>`;

        html = html.split('{{content}}').join(contentSample)
                   .split('{{footer1}}').join(footer1)
                   .split('{{footer2}}').join(footer2)
                   .split('{{footer3}}').join(footer3)
                   .split('{{footerColor}}').join(footerColor);

        // Correction du logo pour l'aperçu (chemin absolu vers le backend)
        const logoUrl = `${API_BASE_URL}/magapp_img/Ivry.png`;
        html = html.split('Ivry.png').join(logoUrl);
        html = html.split('logo_dsi.png').join(`${API_BASE_URL}/magapp_img/logo_dsi.png`);
        
        return html;
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
                <div className={`px-6 py-3 rounded-2xl border flex items-center gap-4 transition-all ${settings.global_enable ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60'}`}>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-tighter">Statut Global</span>
                        <span className="text-xs font-bold">{settings.global_enable ? 'Service Activé' : 'Service Désactivé'}</span>
                    </div>
                    <button 
                        onClick={() => setSettings({...settings, global_enable: settings.global_enable ? 0 : 1})}
                        className={`w-12 h-6 rounded-full relative transition-all ${settings.global_enable ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.global_enable ? 'right-1' : 'left-1'}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Server size={20} /></div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Protocole d'envoi</h3>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Configuration du relais</p>
                                </div>
                            </div>
                            <div className="flex bg-slate-200/50 p-1 rounded-xl">
                                <button 
                                    onClick={() => setSettings({...settings, use_api: 0})}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${!settings.use_api ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Relais SMTP
                                </button>
                                <button 
                                    onClick={() => setSettings({...settings, use_api: 1})}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${settings.use_api ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    API Brevo
                                </button>
                            </div>
                        </div>

                        <div className="p-8">
                            {!settings.use_api ? (
                                <div className="grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Hôte SMTP</label>
                                        <div className="relative">
                                            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                                value={settings.smtp_host || ''} 
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
                                            value={settings.smtp_port || 587} 
                                            onChange={e => setSettings({...settings, smtp_port: parseInt(e.target.value)})}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sécurité</label>
                                        <select 
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                            value={settings.smtp_secure || 'tls'} 
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
                                                value={settings.smtp_user || ''} 
                                                onChange={e => setSettings({...settings, smtp_user: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Mot de passe SMTP</label>
                                        <div className="relative">
                                            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="password"
                                                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                                value={settings.smtp_pass || ''} 
                                                onChange={e => setSettings({...settings, smtp_pass: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Clé API Brevo (v3)</label>
                                        <div className="relative">
                                            <Zap size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="password"
                                                className="w-full pl-12 pr-4 py-3 bg-emerald-50/50 border border-emerald-100 rounded-xl outline-none focus:border-emerald-500 transition-all font-medium"
                                                value={settings.api_key || ''} 
                                                onChange={e => setSettings({...settings, api_key: e.target.value})}
                                                placeholder="xkeysib-..."
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">URL de l'API</label>
                                        <input 
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium text-xs font-mono"
                                            value={settings.api_url || 'https://api.brevo.com/v3/smtp/email'} 
                                            onChange={e => setSettings({...settings, api_url: e.target.value})}
                                        />
                                    </div>
                                </div>
                            )}
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

                            <div className="pt-4 border-t border-slate-100">
                                <h4 className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-4">Variables du pied de page (Mode APM)</h4>
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="col-span-2 space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ligne 1 (Département)</label>
                                        <input 
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                            value={settings.footer_line1 || ''} 
                                            onChange={e => setSettings({...settings, footer_line1: e.target.value})}
                                            placeholder="ex: DIRECTION DES SYSTEMES D'INFORMATION"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ligne 2 (Contact)</label>
                                        <input 
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                            value={settings.footer_line2 || ''} 
                                            onChange={e => setSettings({...settings, footer_line2: e.target.value})}
                                            placeholder="ex: Assistance Technique"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Ligne 3 (Détails)</label>
                                        <input 
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                            value={settings.footer_line3 || ''} 
                                            onChange={e => setSettings({...settings, footer_line3: e.target.value})}
                                            placeholder="ex: Téléphone : 01 49 60 29 88"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Couleur d'accentuation (Pied de page)</label>
                                        <div className="flex gap-4">
                                            <input 
                                                type="color"
                                                className="h-12 w-12 rounded-lg border border-slate-200 cursor-pointer"
                                                value={settings.footer_color || '#004a99'} 
                                                onChange={e => setSettings({...settings, footer_color: e.target.value})}
                                            />
                                            <input 
                                                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium uppercase"
                                                value={settings.footer_color || '#004a99'} 
                                                onChange={e => setSettings({...settings, footer_color: e.target.value})}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enveloppe HTML Global ({"{{content}}"})</label>
                                    <button 
                                        type="button"
                                        onClick={() => setShowHtml(!showHtml)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${showHtml ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {showHtml ? <Eye size={12} /> : <Code size={12} />}
                                        {showHtml ? 'Voir le rendu' : 'Voir le Code HTML'}
                                    </button>
                                </div>
                                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-inner bg-slate-50">
                                    {showHtml ? (
                                        <textarea
                                            className="w-full h-[500px] p-6 font-mono text-xs bg-slate-900 text-blue-100 outline-none resize-none leading-relaxed"
                                            value={settings.template_html}
                                            onChange={e => setSettings({...settings, template_html: e.target.value})}
                                            spellCheck={false}
                                        />
                                    ) : (
                                        <div className="bg-white border-t border-slate-200">
                                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aperçu du rendu final</span>
                                                <div className="flex gap-1.5">
                                                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                                                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                                                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                                                </div>
                                            </div>
                                            <iframe 
                                                title="Mail Preview"
                                                srcDoc={getPreviewHtml()} 
                                                className="w-full h-[600px] border-none"
                                            />
                                        </div>
                                    )}
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
