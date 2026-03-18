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
  return import.meta.env.VITE_API_URL || 'http://localhost:8001';
};

export let API_BASE_URL = getInitialApiUrl();

export const setApiBaseUrl = (url: string) => {
  const normalized = normalizeUrl(url);
  localStorage.setItem('apm_api_url', normalized);
  API_BASE_URL = normalized;
};
