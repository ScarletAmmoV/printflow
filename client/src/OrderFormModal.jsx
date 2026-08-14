import { useState, useEffect } from 'react';
import api from './api';

export default function OrderFormModal({ onClose, onSaved, pedidoEditar }) {
  const [formData, setFormData] = useState({
    numeroOrden: '', nombreCliente: '', apellidoCliente: '', telefono: '', detalle: '', metodoEntrega: 'retiro'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pedidoEditar) {
      setFormData({
        numeroOrden: pedidoEditar.numeroOrden || '', nombreCliente: pedidoEditar.nombreCliente || '',
        apellidoCliente: pedidoEditar.apellidoCliente || '', telefono: pedidoEditar.telefono || '',
        detalle: pedidoEditar.detalle || '', metodoEntrega: pedidoEditar.metodoEntrega || 'retiro'
      });
    }
  }, [pedidoEditar]);

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    if (!/^\d+$/.test(formData.telefono)) {
      setError('El teléfono debe contener solo números (incluido el código de país).'); setLoading(false); return;
    }
    try {
      if (pedidoEditar) { await api.put(`/pedidos/${pedidoEditar.id}`, formData); } 
      else { await api.post('/pedidos', formData); }
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.error || 'Ocurrió un error'); } 
    finally { setLoading(false); }
  };

  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">{pedidoEditar ? 'Editar Pedido' : 'Nuevo Pedido'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">&times;</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">N° de Orden</label><input type="text" name="numeroOrden" value={formData.numeroOrden} onChange={handleChange} required className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Teléfono</label><input type="text" name="telefono" value={formData.telefono} onChange={handleChange} required className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</label><input type="text" name="nombreCliente" value={formData.nombreCliente} onChange={handleChange} required className={inputClass} /></div>
              <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Apellido</label><input type="text" name="apellidoCliente" value={formData.apellidoCliente} onChange={handleChange} required className={inputClass} /></div>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Detalle</label><textarea name="detalle" value={formData.detalle} onChange={handleChange} required rows="3" className={inputClass}></textarea></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Entrega</label><select name="metodoEntrega" value={formData.metodoEntrega} onChange={handleChange} className={inputClass}><option value="retiro">Retiro</option><option value="envio">Envío</option></select></div>
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}
            <div className="flex gap-4 pt-4">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-600 dark:text-white py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
              <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">{loading ? 'Guardando...' : (pedidoEditar ? 'Guardar' : 'Crear')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}