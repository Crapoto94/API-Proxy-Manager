import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Save, Trash2, Plus, X, Edit2, Loader2, Search } from 'lucide-react';

interface Message {
    id: number;
    code: string;
    libelle: string;
    content: string;
}

const API_URL = 'http://localhost:8001/api/messages';

const AdminMessages: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [editing, setEditing] = useState<Message | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchMessages = async () => {
        setLoading(true);
        try {
            const res = await axios.get(API_URL);
            setMessages(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMessages(); }, []);

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
            fetchMessages();
        } catch (err) {
            alert('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Supprimer ce message ?')) return;
        try {
            await axios.delete(`${API_URL}/${id}`);
            fetchMessages();
        } catch (err) {
            alert('Erreur lors de la suppression');
        }
    };

    const filteredMessages = messages.filter(m => 
        m.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.libelle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900">Messages Système</h2>
                    <p className="text-slate-500 mt-2 font-medium">Gestion centralisée des textes de l'application.</p>
                </div>
                <button 
                    onClick={() => setEditing({ id: 0, code: '', libelle: '', content: '' })}
                    className="flex items-center gap-2 px-6 py-3 bg-dsihub-red text-white rounded-lg font-bold hover:opacity-90 transition-all shadow-sm"
                >
                    <Plus size={18} /> Nouveau Message
                </button>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50">
                    <div className="relative max-w-sm">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Rechercher un message..."
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Code</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Libellé</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Aperçu</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMessages.map(msg => (
                                <tr key={msg.id} className="hover:bg-slate-50 transition-all">
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md font-bold text-xs font-mono">{msg.code}</span>
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-900">{msg.libelle}</td>
                                    <td className="px-6 py-4 text-slate-500 italic text-sm truncate max-w-md">{msg.content}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" onClick={() => setEditing(msg)}><Edit2 size={16} /></button>
                                            <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" onClick={() => handleDelete(msg.id)}><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {editing && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg w-full max-w-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900">{editing.id ? 'Modifier' : 'Nouveau'} Message</h3>
                                <p className="text-sm text-slate-500 font-medium">Configurez l'identifiant technique et le contenu.</p>
                            </div>
                            <button onClick={() => setEditing(null)} className="p-2 hover:bg-slate-200 rounded-full transition-all"><X size={20} /></button>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Code Identifiant</label>
                                    <input 
                                        required
                                        disabled={!!editing.id}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={editing.code} 
                                        onChange={e => setEditing({...editing, code: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Libellé Admin</label>
                                    <input 
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                        value={editing.libelle} 
                                        onChange={e => setEditing({...editing, libelle: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contenu affiché</label>
                                <textarea 
                                    required
                                    rows={6}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 transition-all font-medium"
                                    value={editing.content}
                                    onChange={e => setEditing({...editing, content: e.target.value})}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                                <button type="button" className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all" onClick={() => setEditing(null)}>Annuler</button>
                                <button type="submit" className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 disabled:opacity-50" disabled={saving}>
                                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    Enregistrer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminMessages;
