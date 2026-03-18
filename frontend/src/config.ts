// Central API configuration - reads from localStorage or Vite env vars
const getInitialApiUrl = () => {
  const savedUrl = localStorage.getItem('apm_api_url');
  if (savedUrl) return savedUrl;
  return import.meta.env.VITE_API_URL || 'http://localhost:8001';
};

export let API_BASE_URL = getInitialApiUrl();

export const setApiBaseUrl = (url: string) => {
  localStorage.setItem('apm_api_url', url);
  API_BASE_URL = url;
};
