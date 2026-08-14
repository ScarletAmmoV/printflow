import { useState } from 'react';
import api from './api';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Lógica de Login
        const res = await api.post('/auth/login', { usuario, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('taller', JSON.stringify(res.data.taller));
        window.location.href = '/';
      } else {
        // Lógica de Registro
        if (!nombre) {
          setError('El nombre del taller es obligatorio');
          setLoading(false);
          return;
        }
        await api.post('/auth/register', { nombre, usuario, password });
        
        // Auto-login después de registrar
        const res = await api.post('/auth/login', { usuario, password });
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('taller', JSON.stringify(res.data.taller));
        window.location.href = '/';
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ocurrió un error inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h1 className="text-center text-4xl font-extrabold text-indigo-600">PrintFlow</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Gestión de pedidos para talleres de impresión
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          
          {/* Botones para cambiar entre Login y Registro */}
          <div className="flex mb-6 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => { setIsLogin(true); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${isLogin ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => { setIsLogin(false); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${!isLogin ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
            >
              Registrar Taller
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Solo mostramos el nombre si es registro */}
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre del Taller</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  required={!isLogin}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Usuario</label>
              <input
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            {/* Mensaje de error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
            >
              {loading ? 'Cargando...' : (isLogin ? 'Entrar' : 'Crear Cuenta')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}