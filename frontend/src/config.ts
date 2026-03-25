const normalizeUrl = (url: string) => {
  let normalized = url.trim();
  if (normalized && !normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'http://' + normalized;
  }
  return normalized.replace(/\/+$/, '');
};

const getInitialApiUrl = () => {
  const savedUrl = localStorage.getItem('apm_api_url');
  if (savedUrl) return normalizeUrl(savedUrl);
  
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return normalizeUrl(envUrl);

  // Fallback intelligent pour Proxmox / Reverse Proxy
  if (typeof window !== 'undefined' && 
      window.location.hostname !== 'localhost' && 
      window.location.hostname !== '127.0.0.1') {
      return window.location.origin; 
  }

  return 'http://localhost:8001';
};

export let API_BASE_URL = getInitialApiUrl();

export const setApiBaseUrl = (url: string) => {
  const normalized = normalizeUrl(url);
  localStorage.setItem('apm_api_url', normalized);
  API_BASE_URL = normalized;
};
