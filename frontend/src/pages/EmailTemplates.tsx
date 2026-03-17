import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  FileText, Save, Plus, Trash2, Edit3, 
  Loader2, Mail, Code, X
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Template {
  id: number;
  name: string;
  subject: string;
  content: string;
}

const API_URL = 'http://localhost:8001/api/email-templates';

const EmailTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(API_URL);
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await axios.put(`${API_URL}/${editing.id}`, editing);
      } else {
        await axios.post(API_URL, editing);
      }
      setEditing(null);
      fetchTemplates();
    } catch (err) {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce modèle ?')) return;
    try {
      await axios.delete(`${API_URL}/${id}`);
      fetchTemplates();
    } catch (err) {
      alert('Erreur lors de la suppression');
    }
  };

  if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Modèles d'Emails</h2>
          <p className="text-slate-500 mt-2 font-medium">Gérez le contenu des notifications automatiques.</p>
        </div>
        {!editing && (
          <button 
            className="flex items-center gap-2 px-6 py-3 bg-dsihub-red text-white rounded-lg font-bold hover:opacity-90 transition-all shadow-sm"
            onClick={() => setEditing({ id: 0, name: '', subject: '', content: '' })}
          >
            <Plus size={18} /> Nouveau Modèle
          </button>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden animate-in zoom-in-95 duration-200">
          <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="text-xl font-black text-slate-900">{editing.id ? 'Modifier le modèle' : 'Nouveau modèle'}</h3>
              <p className="text-sm text-slate-500 font-medium">Configurez le sujet et le contenu HTML du mail.</p>
            </div>
            <button onClick={() => setEditing(null)} className="p-2 hover:bg-slate-200 rounded-full transition-all"><X size={20} /></button>
          </div>
          <form onSubmit={handleSave} className="p-8 space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nom (Interne)</label>
                <input 
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                  value={editing.name} 
                  onChange={e => setEditing({...editing, name: e.target.value})}
                  placeholder="ex: Rappel de facture"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sujet de l'email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    required
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                    value={editing.subject} 
                    onChange={e => setEditing({...editing, subject: e.target.value})}
                    placeholder="ex: Votre facture n°{{num}}"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contenu du message</label>
              <div className="rounded-2xl border border-slate-200 overflow-hidden min-h-[300px]">
                <ReactQuill 
                  theme="snow" 
                  value={editing.content} 
                  onChange={val => setEditing({...editing, content: val})}
                  style={{ height: '250px' }}
                />
              </div>
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Code size={14} className="text-blue-500" /> Variables disponibles
                </p>
                <div className="flex flex-wrap gap-2">
                  {['{{app_name}}', '{{username}}', '{{description}}', '{{order_id}}'].map(v => (
                    <code key={v} className="px-2 py-1 bg-white border border-slate-100 rounded-lg text-blue-600 font-bold text-[10px]">{v}</code>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button type="button" className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all" onClick={() => setEditing(null)}>Annuler</button>
              <button type="submit" className="flex items-center gap-2 px-8 py-3 bg-dsihub-red text-white rounded-lg font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50" disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Enregistrer le modèle
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(tpl => (
            <div key={tpl.id} className="group bg-white p-6 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <FileText size={24} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" onClick={() => setEditing(tpl)}><Edit3 size={16} /></button>
                  <button className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" onClick={() => handleDelete(tpl.id)}><Trash2 size={16} /></button>
                </div>
              </div>
              <h4 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors">{tpl.name}</h4>
              <p className="text-sm text-slate-500 font-medium mt-1 line-clamp-1 italic">{tpl.subject}</p>
            </div>
          ))}
          {templates.length === 0 && (
            <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
               <Mail size={48} className="mb-4 opacity-20" />
               <p className="font-bold tracking-tight">Aucun modèle configuré</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmailTemplates;
