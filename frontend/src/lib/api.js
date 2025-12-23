import axios from 'axios';

// API Base URL - Production: elliot-backend-production.up.railway.app
const API_URL = 'https://elliot-backend-production.up.railway.app/api';

const getBaseURL = () => {
  // Use env variable if set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Production - always use the backend URL
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return API_URL;
  }
  // Local development
  return 'http://localhost:3001/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json'
  }
});

// Ajouter le token à chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Gérer les erreurs 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
