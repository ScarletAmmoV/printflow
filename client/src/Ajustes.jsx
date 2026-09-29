import { useState, useEffect } from 'react';
import api from './api';
import { Save, Loader2, Mail, CheckCircle, Lock } from 'lucide-react';

export default function Ajustes() {
  const [datos, setDatos] = useState({ metaToken: '', metaPhoneId: '', plantillaMensaje: '', pinMetricas: '' });
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    const fetchAjustes = async () => {
      try {
        const res = await api.get('/ajustes');
        setDatos(res.data);
        const gmailRes = await api.get('/gmail/status');
        setGmailConnected(gmailRes.data.connected);
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

  const handleSavePin = async () => {
    try {
      await api.put('/ajustes/pin', { pin: pinInput });
      setDatos({ ...datos, pinMetricas: pinInput });
      setPinInput('');
      setToast('PIN guardado con éxito');
      setTimeout(() => setToast(null), 3000);
    } catch (err) { setToast('Error al guardar PIN'); }
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

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600" /></div>;

  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white";

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-8">
      
      {/* SECCIÓN GMAIL */}
      <div className="pb-6 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <Mail size={20} className="text-red-500" /> Conexión de Gmail
        </h3>
        <p className="text-sm text-gray-500 mb-4">Conectá tu cuenta para que PrintFlow lea los diseños automáticamente.</p>
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

      {/* SECCIÓN WHATSAPP Y MENSAJE */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Conexión de WhatsApp (Meta API)</h3>
        <p className="text-sm text-gray-500 mb-4">Ingresá las credenciales que te dio Meta for Developers.</p>
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
            <button type="submit" disabled={saving} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* SECCIÓN PIN DE MÉTRICAS */}
      <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <Lock size={20} className="text-indigo-500" /> PIN de Métricas
        </h3>
        <p className="text-sm text-gray-500 mb-4">Configurá un PIN de 4 dígitos para proteger las métricas. Dejá vacío para desactivarlo.</p>
        
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">PIN (4 dígitos)</label>
            <input 
              type="text" 
              maxLength="4" 
              value={pinInput !== '' ? pinInput : (datos.pinMetricas || '')} 
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))} 
              placeholder="Ej: 1234" 
              className={inputClass} 
            />
          </div>
          <button 
            type="button" 
            onClick={handleSavePin} 
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 mb-0.5"
          >
            Guardar PIN
          </button>
        </div>
      </div>

      {toast && <div className="mt-4 bg-green-100 text-green-700 p-3 rounded-md text-sm">{toast}</div>}
    </div>
  );
}