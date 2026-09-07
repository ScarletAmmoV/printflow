import { useState, useEffect } from 'react';
import api from './api';
import { Save, Loader2, Mail, CheckCircle } from 'lucide-react';

export default function Ajustes() {
  const [datos, setDatos] = useState({ metaToken: '', metaPhoneId: '', plantillaMensaje: '' });
  const [gmailConnected, setGmailConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

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
      
      // Cada 2 segundos preguntamos al servidor si ya conectó
      const interval = setInterval(async () => {
        const statusRes = await api.get('/gmail/status');
        if (statusRes.data.connected) {
          setGmailConnected(true);
          clearInterval(interval);
          setToast('Gmail conectado con éxito');
          setTimeout(() => setToast(null), 3000);
        }
      }, 2000);
    } catch (err) {
      setToast('Error al conectar Gmail');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/ajustes', datos);
      setToast('Guardado con éxito');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast('Error al guardar');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-8">
      
      {/* SECCIÓN GMAIL */}
      <div className="pb-6 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <Mail size={20} className="text-red-500" /> Conexión de Gmail
        </h3>
        <p className="text-sm text-gray-500 mb-4">Conectá tu cuenta de Gmail para que PrintFlow lea los diseños que te manden los clientes y los asocie automáticamente a los pedidos.</p>
        
        {gmailConnected ? (
          <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-lg">
            <CheckCircle size={20} />
            <span className="font-medium">Gmail Conectado</span>
          </div>
        ) : (
          <button onClick={handleConnectGmail} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 flex items-center gap-2">
            <Mail size={18} /> Conectar Gmail
          </button>
        )}
      </div>

      {/* SECCIÓN WHATSAPP */}
      <div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Conexión de WhatsApp (Meta API)</h3>
        <p className="text-sm text-gray-500 mb-4">Ingresá las credenciales que te dio Meta for Developers.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Access Token</label>
            <input type="text" value={datos.metaToken || ''} onChange={(e) => setDatos({...datos, metaToken: e.target.value})} className="mt-1 block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number ID</label>
            <input type="text" value={datos.metaPhoneId || ''} onChange={(e) => setDatos({...datos, metaPhoneId: e.target.value})} className="mt-1 block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Mensaje Automático</h3>
            <ul className="text-sm text-gray-500 mb-4 list-disc list-inside bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
              <li><code>{'{taller}'}</code> - Nombre de tu negocio</li>
              <li><code>{'{cliente}'}</code> - Nombre y apellido del cliente</li>
              <li><code>{'{orden}'}</code> - Número de pedido</li>
              <li><code>{'{entrega}'}</code> - retiro o envío</li>
            </ul>
            <textarea value={datos.plantillaMensaje || ''} onChange={(e) => setDatos({...datos, plantillaMensaje: e.target.value})} rows="4" className="mt-1 block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"></textarea>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
      
      {toast && <div className="mt-4 bg-green-100 text-green-700 p-3 rounded-md text-sm">{toast}</div>}
    </div>
  );
}