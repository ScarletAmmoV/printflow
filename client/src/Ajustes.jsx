import { useState, useEffect } from 'react';
import api from './api';
import { Save, Loader2, Mail, CheckCircle, Lock, ShoppingBag } from 'lucide-react';

export default function Ajustes() {
  const [datos, setDatos] = useState({ metaToken: '', metaPhoneId: '', plantillaMensaje: '', pinMetricas: '' });
  const [gmailConnected, setGmailConnected] = useState(false);
  const [tiendanubeConnected, setTiendanubeConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  
  const [pinInput, setPinInput] = useState('');
  const [pinDesactivar, setPinDesactivar] = useState('');
  const [passwordReset, setPasswordReset] = useState('');

  useEffect(() => {
    const fetchAjustes = async () => {
      try {
        const res = await api.get('/ajustes');
        setDatos(res.data);
        const gmailRes = await api.get('/gmail/status');
        setGmailConnected(gmailRes.data.connected);
        const tnRes = await api.get('/tiendanube/status');
        setTiendanubeConnected(tnRes.data.connected);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchAjustes();
  }, []);

  const handleConnectGmail = async () => {
    try {
      const res = await api.get('/gmail/auth');
      window.open(res.data.url, '_blank', 'width=500,height=600');
      const interval = setInterval(async () => {
        const statusRes = await api.get('/gmail/status');
        if (statusRes.data.connected) {
          setGmailConnected(true);
          clearInterval(interval);
          setToast('Gmail conectado con éxito');
          setTimeout(() => setToast(null), 3000);
        }
      }, 2000);
    } catch (err) { setToast('Error al conectar Gmail'); }
  };

  const handleDisconnectGmail = async () => {
    try {
      await api.delete('/gmail/disconnect');
      setGmailConnected(false);
      setToast('Gmail desconectado');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { setToast('Error al desconectar'); }
  };

    const handleConnectTiendanube = async () => {
    try {
      const res = await api.get('/tiendanube/auth');
      window.open(res.data.url, '_blank', 'width=500,height=600');
      const interval = setInterval(async () => {
        const statusRes = await api.get('/tiendanube/status');
        if (statusRes.data.connected) {
          setTiendanubeConnected(true);
          clearInterval(interval);
          setToast('Tienda Nube conectada con éxito');
          setTimeout(() => setToast(null), 3000);
        }
      }, 2000);
    } catch (err) { setToast('Error al conectar Tienda Nube'); }
  };

  const handleSavePin = async () => {
    if (!pinInput) return alert('Ingresa un PIN de 4 dígitos');
    try {
      await api.put('/ajustes/pin', { pin: pinInput });
      setDatos({ ...datos, pinMetricas: pinInput });
      setPinInput('');
      setToast('PIN guardado con éxito');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { setToast('Error al guardar PIN'); }
  };

  const handleDesactivarPin = async () => {
    try {
      await api.post('/ajustes/desactivar-pin', { pin: pinDesactivar });
      setDatos({ ...datos, pinMetricas: null });
      setPinDesactivar('');
      setToast('PIN desactivado');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { alert(err.response?.data?.error || 'Error al desactivar'); }
  };

  const handleResetPin = async () => {
    try {
      await api.post('/ajustes/reset-pin', { password: passwordReset });
      setDatos({ ...datos, pinMetricas: null });
      setPasswordReset('');
      setToast('PIN restablecido. Puedes configurar uno nuevo.');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { alert(err.response?.data?.error || 'Error al restablecer'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/ajustes', datos);
      setToast('Guardado con éxito');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { setToast('Error al guardar'); } 
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#0D2D53]" /></div>;

  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#0D2D53] focus:border-[#0D2D53] dark:bg-[#17191C] dark:text-white";

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-[#17191C] p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-8">
      
      {/* SECCIÓN GMAIL */}
      <div className="pb-6 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <Mail size={20} className="text-red-500" /> Conexión de Gmail
        </h3>
        <p className="text-sm text-gray-500 mb-4">Conecta tu cuenta para que lea los diseños automáticamente.</p>
        {gmailConnected ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-lg flex-1">
              <CheckCircle size={20} /><span className="font-medium">Gmail Conectado</span>
            </div>
            <button onClick={handleDisconnectGmail} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg hover:bg-red-200 text-sm">Desconectar</button>
          </div>
        ) : (
          <button onClick={handleConnectGmail} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 flex items-center gap-2">
            <Mail size={18} /> Conectar Gmail
          </button>
        )}
      </div>

      {/* SECCIÓN TIENDA NUBE */}
      <div className="pb-6 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <ShoppingBag size={20} className="text-[#0D2D53]" /> Conexión de Tienda Nube
        </h3>
        <p className="text-sm text-gray-500 mb-4">Conecta tu tienda para que las ventas caigan automáticamente en Kova.</p>
        {tiendanubeConnected ? (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-lg">
            <CheckCircle size={20} /><span className="font-medium">Tienda Conectada</span>
          </div>
        ) : (
          <button onClick={handleConnectTiendanube} className="bg-[#0D2D53] text-white px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-2">
            <ShoppingBag size={18} /> Conectar Tienda Nube
          </button>
        )}
      </div>

      {/* SECCIÓN WHATSAPP Y MENSAJE */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Conexión de WhatsApp (Meta API)</h3>
        <p className="text-sm text-gray-500 mb-4">Ingresa las credenciales que te dio Meta for Developers.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Access Token</label>
            <input type="text" value={datos.metaToken || ''} onChange={(e) => setDatos({...datos, metaToken: e.target.value})} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number ID</label>
            <input type="text" value={datos.metaPhoneId || ''} onChange={(e) => setDatos({...datos, metaPhoneId: e.target.value})} className={inputClass} />
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Mensaje Automático</h3>
            <ul className="text-sm text-gray-500 mb-4 list-disc list-inside bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <li><code>{'{taller}'}</code> - Nombre de tu negocio</li>
              <li><code>{'{cliente}'}</code> - Nombre y apellido del cliente</li>
              <li><code>{'{orden}'}</code> - Número de pedido</li>
              <li><code>{'{entrega}'}</code> - retiro o envío</li>
            </ul>
            <textarea value={datos.plantillaMensaje || ''} onChange={(e) => setDatos({...datos, plantillaMensaje: e.target.value})} rows="4" className={inputClass}></textarea>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-[#0D2D53] text-white px-6 py-2 rounded-lg hover:opacity-90 flex items-center gap-2">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* SECCIÓN PIN DE MÉTRICAS */}
      <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <Lock size={20} className="text-[#0D2D53]" /> PIN de Métricas
        </h3>
        <p className="text-sm text-gray-500 mb-4">Protege la visualización de las métricas.</p>
        
        {datos.pinMetricas ? (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle size={18} /> PIN activado.
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nuevo PIN (para cambiarlo)</label>
                <input type="text" maxLength="4" value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))} placeholder="Dejar vacío para no cambiar" className={inputClass} />
              </div>
              <button type="button" onClick={handleSavePin} className="bg-[#0D2D53] text-white px-4 py-2 rounded-lg hover:opacity-90 sm:mt-6">Actualizar PIN</button>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Desactivar PIN (Ingresa el PIN actual)</label>
                <div className="flex gap-2 mt-1">
                  <input type="password" maxLength="4" value={pinDesactivar} onChange={(e) => setPinDesactivar(e.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="****" />
                  <button type="button" onClick={handleDesactivarPin} className="bg-gray-200 dark:bg-gray-600 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 whitespace-nowrap">Desactivar</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Olvidé mi PIN (Ingresa tu contraseña)</label>
                <div className="flex gap-2 mt-1">
                  <input type="password" value={passwordReset} onChange={(e) => setPasswordReset(e.target.value)} className={inputClass} placeholder="Tu contraseña de inicio" />
                  <button type="button" onClick={handleResetPin} className="bg-red-100 text-red-600 px-4 py-2 rounded-lg hover:bg-red-200 whitespace-nowrap">Restablecer</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">PIN (4 dígitos)</label>
              <input type="text" maxLength="4" value={pinInput} onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))} placeholder="Ej: 1234" className={inputClass} />
            </div>
            <button type="button" onClick={handleSavePin} className="bg-[#0D2D53] text-white px-4 py-2 rounded-lg hover:opacity-90 mb-0.5">Activar PIN</button>
          </div>
        )}
      </div>

      {toast && <div className="mt-4 bg-green-100 text-green-700 p-3 rounded-md text-sm">{toast}</div>}
    </div>
  );
}