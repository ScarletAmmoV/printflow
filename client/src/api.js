import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

// ¡ESTO ES LO QUE FALTABA! 
// Antes de hacer cualquier petición, busca el token en el almacenamiento y lo adjunta
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptamos las respuestas del servidor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Si la sesión expiró o el token es inválido
      localStorage.removeItem('token');
      localStorage.removeItem('taller');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;