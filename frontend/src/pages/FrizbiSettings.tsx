import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Smartphone, Shield, CheckCircle2, AlertCircle,
  Send, RefreshCw, Save, Server, Globe, Key, Lock, X
} from 'lucide-react';

interface FrizbiSettingsData {
  is_enabled: number;
  api_url: string;
  client_id: string;
  client_secret: string;
  sender_id: string;
}

const API_BASE = 'http://localhost:8001/api';

const FrizbiSettings: React.FC = () => {
  const [settings, setSettings] = useState<FrizbiSettingsData>({
    is_enabled: 0,
    api_url: 'https://apiv2.frizbi.evolnet.fr',
    client_id: '',
    client_secret: '',
    sender_id: 'IVRY'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMobile, setTestMobile] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/frizbi-settings`);
      if (res.data) setSettings(res.data);
    } catch (err) {
      console.error("Error fetching Frizbi settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await axios.post(`${API_BASE}/admin/frizbi-settings`, settings);
      setStatus({ type: 'success', message: 'Paramètres enregistrés avec succès' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Erreur lors de l\'enregistrement' });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const res = await axios.post(`${API_BASE}/admin/frizbi/test-connection`, {
        api_url: settings.api_url,
        client_id: settings.client_id,
        client_secret: settings.client_secret
      });
      setStatus({ type: 'success', message: res.data.message });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Échec de la connexion' });
    } finally {
      setTesting(false);
    }
  };

  const sendTestSMS = async () => {
    if (!testMobile) return setStatus({ type: 'error', message: 'Veuillez saisir un numéro de mobile' });
    setTesting(true);
    setStatus(null);
    try {
      await axios.post(`${API_BASE}/admin/frizbi/send-test`, { mobile: testMobile });
      setStatus({ type: 'success', message: 'SMS de test envoyé avec succès !' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Erreur lors de l\'envoi' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="flex justify-center p-20"><RefreshCw className="animate-spin text-blue-600" size={40} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Interface SMS Frizbi</h2>
          <p className="text-slate-500 mt-2 font-medium">Configurez les accès à l'API Frizbi pour l'envoi de SMS système.</p>
        </div>
        <div className="flex gap-4">
          <button
            className="flex items-center gap-2 px-6 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-all disabled:opacity-50"
            onClick={testConnection}
            disabled={testing || !settings.client_id}
          >
            {testing ? <RefreshCw size={18} className="animate-spin" /> : <Shield size={18} />}
            Tester la connexion
          </button>
          <button 
            className="flex items-center gap-2 px-8 py-3 bg-dsihub-red text-white rounded-lg font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
            onClick={handleSave} 
            disabled={saving}
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            Enregistrer
          </button>
        </div>
      </div>

      {status && (
        <div className={`p-6 rounded-3xl flex items-center justify-between animate-in slide-in-from-top-4 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
          <div className="flex items-center gap-4">
            {status.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            <span className="font-bold tracking-tight">{status.message}</span>
          </div>
          <button onClick={() => setStatus(null)} className="p-1 hover:bg-white/50 rounded-full transition-all text-slate-400 hover:text-slate-900"><X size={20} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><Server size={20} /></div>
            <h3 className="font-bold text-slate-900">Configuration Générale</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <div>
                 <p className="font-bold text-slate-900">État du service</p>
                 <p className="text-xs text-slate-500 font-medium">Activer ou désactiver l'envoi de SMS</p>
               </div>
               <button 
                onClick={() => setSettings({ ...settings, is_enabled: settings.is_enabled ? 0 : 1 })}
                className={`w-14 h-8 rounded-full relative transition-colors duration-300 ${settings.is_enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
               >
                 <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all duration-300 shadow-sm ${settings.is_enabled ? 'left-7' : 'left-1'}`} />
               </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">URL de l'API</label>
              <div className="relative">
                <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                  value={settings.api_url}
                  onChange={e => setSettings({ ...settings, api_url: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sender ID</label>
              <div className="relative">
                <Smartphone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                  value={settings.sender_id}
                  onChange={e => setSettings({ ...settings, sender_id: e.target.value })}
                  maxLength={11}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Lock size={20} /></div>
            <h3 className="font-bold text-slate-900">Identifiants API Frizbi</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Client ID</label>
              <div className="relative">
                <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                  value={settings.client_id}
                  onChange={e => setSettings({ ...settings, client_id: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Client Secret</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                  value={settings.client_secret}
                  onChange={e => setSettings({ ...settings, client_secret: e.target.value })}
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-4 mt-4">
              <p className="font-bold text-slate-900 flex items-center gap-2 uppercase tracking-widest text-[11px]">
                  <Send size={16} className="text-blue-500" /> Test rapide
              </p>
              <div className="flex gap-3">
                <input
                  type="tel"
                  className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all text-sm font-bold"
                  value={testMobile}
                  onChange={e => setTestMobile(e.target.value)}
                  placeholder="06XXXXXXXX"
                />
                <button
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition-all disabled:opacity-50 text-xs shrink-0"
                  onClick={sendTestSMS}
                  disabled={testing || !testMobile || !settings.client_id}
                >
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrizbiSettings;
