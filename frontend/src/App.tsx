import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Settings, 
  Database, 
  Search, 
  ShieldCheck, 
  Users,
  Globe,
  LogOut,
  Bell,
  Menu,
  Mail,
  X
} from 'lucide-react';
import { API_BASE_URL } from './config';

const SidebarLink = ({ to, icon: Icon, children }: { to: string, icon: any, children: React.ReactNode }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-semibold relative ${
        isActive 
          ? 'bg-blue-600 text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)]' 
          : 'text-[#94a3b8] hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={18} />
      <span>{children}</span>
      {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-white rounded-l-md" />}
    </Link>
  );
};

const Layout = ({ children, onLogout, user }: { children: React.ReactNode, onLogout: () => void, user: any }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen bg-slate-100 flex overflow-hidden">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#1a2234] text-[#a3b1cc] flex flex-col border-r border-slate-900 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-3 p-6 border-b border-white/5 font-extrabold text-[#f8fafc] tracking-tight">
          <ShieldCheck size={24} className="text-blue-500" />
          <span>Console Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <SidebarLink to="/" icon={LayoutDashboard}>Dashboard</SidebarLink>
          <SidebarLink to="/mail-settings" icon={Settings}>Mails SMTP</SidebarLink>
          <SidebarLink to="/frizbi-settings" icon={MessageSquare}>SMS Frizbi</SidebarLink>
          <SidebarLink to="/directory" icon={ShieldCheck}>Annuaire AD</SidebarLink>
          <SidebarLink to="/o365" icon={Mail}>Messagerie O365</SidebarLink>
          <SidebarLink to="/database" icon={Database}>Oracle & Sync</SidebarLink>
          <SidebarLink to="/sql" icon={Search}>SQL Explorer</SidebarLink>
          <SidebarLink to="/users" icon={Users}>Utilisateurs</SidebarLink>
          <SidebarLink to="/apps" icon={Globe}>Applications</SidebarLink>
          <SidebarLink to="/security" icon={ShieldCheck}>Sécurité & Proxies</SidebarLink>
          <SidebarLink to="/api-docs" icon={Database}>Documentation API</SidebarLink>
        </nav>

        <div className="p-5 border-t border-white/5 space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
              <span>Système Opérationnel</span>
            </div>
            <div className="flex flex-col gap-1 pl-4 border-l border-white/5">
              <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Backend API</span>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-blue-400 truncate max-w-[120px]">{API_BASE_URL}</span>
                <button 
                  onClick={() => {
                    const newUrl = prompt('Nouvelle URL API:', API_BASE_URL);
                    if (newUrl && newUrl !== API_BASE_URL) {
                      localStorage.setItem('apm_api_url', newUrl);
                      window.location.reload();
                    }
                  }}
                  className="text-[9px] font-bold text-slate-500 hover:text-blue-400 transition-colors"
                >
                  Modifier
                </button>
              </div>
            </div>
          </div>
          
          <div className="pt-2">
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-slate-400 hover:text-rose-400 hover:bg-rose-500/5 rounded-lg transition-all"
            >
              <LogOut size={16} />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between z-40">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all" onClick={() => setSidebarOpen(!isSidebarOpen)}>
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="flex items-center gap-2 font-semibold text-sm">
               <span className="text-slate-400">Admin</span>
               <span className="text-slate-300">/</span>
               <span className="text-slate-800">APM Manager</span>
               <span className="text-slate-300 mx-1">•</span>
               <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-black text-blue-600 uppercase tabular-nums">{user?.username || 'Guest'}</span>
            </div>
          </div>
          

          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 bg-slate-50">
              <Bell size={18} />
            </button>
            <button className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-slate-200 bg-slate-50">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <section className="flex-1 p-8 overflow-y-auto bg-slate-50">
          {children}
        </section>
      </main>
    </div>
  );
};

import Dashboard from './pages/Dashboard';
import MailSettings from './pages/MailSettings';
import FrizbiSettings from './pages/FrizbiSettings';
import AdminSQL from './pages/AdminSQL';
import DirectorySettings from './pages/DirectorySettings';
import OracleSettings from './pages/OracleSettings';
import ApiDocs from './pages/ApiDocs';
import UserSettings from './pages/UserSettings';
import AppManagement from './pages/AppManagement';
import SecuritySettings from './pages/SecuritySettings';
import O365Settings from './pages/O365Settings';
import Login from './pages/Login';

const App = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('apm_token'));
  const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('apm_user') || 'null'));

  useEffect(() => {
    if (token) {
      axios.interceptors.request.use(config => {
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      });
    }
  }, [token]);

  const handleLogin = (newToken: string, newUser: any) => {
    localStorage.setItem('apm_token', newToken);
    localStorage.setItem('apm_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('apm_token');
    localStorage.removeItem('apm_user');
    setToken(null);
    setUser(null);
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout} user={user}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mail-settings" element={<MailSettings />} />
          <Route path="/frizbi-settings" element={<FrizbiSettings />} />
          <Route path="/directory" element={<DirectorySettings />} />
          <Route path="/database" element={<OracleSettings />} />
          <Route path="/sql" element={<AdminSQL />} />
          <Route path="/users" element={<UserSettings />} />
          <Route path="/apps" element={<AppManagement />} />
          <Route path="/security" element={<SecuritySettings />} />
          <Route path="/o365" element={<O365Settings />} />
          <Route path="/api-docs" element={<ApiDocs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
};

export default App;
