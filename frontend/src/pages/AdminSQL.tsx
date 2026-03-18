import React, { useState, useRef } from 'react';
import axios from 'axios';
import { 
  Play, RefreshCw, Terminal, AlertCircle, CheckCircle2,
  Trash2, Maximize2, Minimize2,
  Download, Database, Search, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { API_BASE_URL } from '../config';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface QueryResult {
  records: any[];
  columns?: ColumnInfo[];
  total?: number;
  count?: number;
  executionTime?: number;
}

const API_BASE = `${API_BASE_URL}/api/admin/sql`;

const AdminSQL: React.FC = () => {
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(false);
  const [tables, setTables] = useState<{name: string, type: string}[]>([]);
  const [databases, setDatabases] = useState<{seq: number, name: string, file: string}[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('main');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isExpertMode, setIsExpertMode] = useState(false);
  
  const resultsRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => { fetchTables(selectedDb); }, [selectedDb]);

  const fetchTables = async (dbName: string = 'main') => {
    try {
      setLoading(true);
      const dbRes = await axios.get(`${API_BASE}/databases`);
      setDatabases(dbRes.data);
      const res = await axios.get(`${API_BASE}/tables?db=${dbName}`);
      setTables(res.data);
    } catch (err) {
      console.error('Erreur lecture données:', err);
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async (customQuery?: string) => {
    const finalQuery = customQuery || query;
    if (!finalQuery.trim()) return;
    
    setQueryError(null);
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/query`, { sql: finalQuery, expertMode: isExpertMode });
      setQueryResult(res.data);
      if (customQuery) setQuery(customQuery);
      
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err: any) {
      setQueryError(err.response?.data?.message || err.message);
      setQueryResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTableClick = async (tableName: string) => {
    setSelectedTable(tableName);
    const q = `SELECT * FROM "${tableName}" LIMIT 100`;
    runQuery(q);
  };

  const exportCSV = (data: any[]) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `query_export_${new Date().getTime()}.csv`;
    link.click();
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-100 flex flex-col bg-slate-50/50">
        <div className="p-6 border-b border-slate-100 bg-white">
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Database size={18} className="text-blue-600" /> Explorateur
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">SQLite Architecture</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-2">
            <p className="px-3 text-[10px] text-slate-400 font-black uppercase tracking-widest">Bases</p>
            {databases.map(d => (
              <button 
                key={d.name} 
                onClick={() => setSelectedDb(d.name)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${selectedDb === d.name ? 'bg-dsihub-red text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 font-medium'}`}
              >
                <span className="text-sm truncate">{d.name}</span>
                <Database size={12} className={selectedDb === d.name ? 'opacity-50' : 'text-slate-300'} />
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <p className="px-3 text-[10px] text-slate-400 font-black uppercase tracking-widest">Tables & Vues</p>
            {tables.map(t => (
              <button 
                key={t.name}
                onClick={() => handleTableClick(t.name)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${selectedTable === t.name ? 'text-dsihub-red bg-red-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 group'}`}
              >
                <div className={`w-2 h-2 rounded-full ${t.type === 'view' ? 'bg-purple-400' : 'bg-blue-400'}`} />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Console */}
      <main className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className={`p-6 border-b border-slate-100 transition-all ${isConsoleExpanded ? 'flex-1' : 'h-72'}`}>
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
               <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center"><Terminal size={14} /></div>
               <h4 className="font-bold text-slate-900">Console SQL</h4>
             </div>
             <div className="flex gap-2">
               <button onClick={() => setIsConsoleExpanded(!isConsoleExpanded)} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all" title="Agrandir/Réduire">
                 {isConsoleExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
               </button>
               <button onClick={() => setQuery('')} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Effacer"><Trash2 size={16} /></button>
               <button 
                onClick={() => setIsExpertMode(!isExpertMode)} 
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all shadow-sm ${isExpertMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                title="Mode Expert (DROP, TRUNCATE, UPDATE, INSERT)"
               >
                 {isExpertMode ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />} {isExpertMode ? 'Expert Actif' : 'Mode Standard'}
               </button>
               <button 
                onClick={() => runQuery()} 
                disabled={loading || !query.trim()} 
                className="flex items-center gap-2 px-6 py-2 bg-dsihub-red text-white rounded-lg font-bold hover:opacity-90 transition-all shadow-sm active:scale-95 disabled:opacity-50"
               >
                 <Play size={14} /> {loading ? '...' : 'Exécuter'}
               </button>
             </div>
          </div>
          <textarea
            className="w-full h-[calc(100%-4rem)] p-4 bg-slate-950 text-emerald-400 font-mono text-sm border-none rounded-2xl outline-none resize-none shadow-inner"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SELECT * FROM messages WHERE code LIKE '%login%'"
            spellCheck={false}
          />
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-hidden flex flex-col" ref={resultsRef}>
          {queryError ? (
            <div className="p-8 flex flex-col items-center justify-center text-rose-500 gap-4">
              <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center"><AlertCircle size={32} /></div>
              <div className="text-center">
                <p className="font-black">Erreur SQL Syntax</p>
                <p className="text-sm font-medium opacity-80 max-w-lg mt-1">{queryError}</p>
              </div>
            </div>
          ) : queryResult ? (
            <>
              <div className="px-8 py-4 border-b border-slate-50 bg-slate-50/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6 text-xs font-bold text-slate-400">
                   <span className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> {queryResult.count} lignes</span>
                   <span className="flex items-center gap-2"><RefreshCw size={14} /> {queryResult.executionTime}ms</span>
                </div>
                <button onClick={() => exportCSV(queryResult.records)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all">
                  <Download size={12} /> Export CSV
                </button>
              </div>
              <div className="flex-1 overflow-auto p-8 pt-4">
                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs font-medium">
                    <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        {Object.keys(queryResult.records[0] || {}).map(col => (
                          <th key={col} className="px-4 py-3 border-r border-slate-100">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {queryResult.records.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="px-4 py-3 border-r border-slate-100 text-slate-600 max-w-[200px] truncate">
                              {val === null ? <span className="opacity-30 italic">NULL</span> : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
               <Search size={48} className="opacity-20" />
               <p className="font-bold tracking-tight">Aucun résultat à afficher</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminSQL;
