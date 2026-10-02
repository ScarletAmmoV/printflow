import { useState, useEffect } from 'react';
import api from './api';

export default function OrderFormModal({ onClose, onSaved, pedidoEditar }) {
  const [formData, setFormData] = useState({
    numeroOrden: '', nombreCliente: '', apellidoCliente: '', emailCliente: '', dni: '', telefono: '', detalle: '', metodoEntrega: 'retiro', precioTotal: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (pedidoEditar) {
      setFormData({
        numeroOrden: pedidoEditar.numeroOrden || '',
        nombreCliente: pedidoEditar.nombreCliente || '',
        apellidoCliente: pedidoEditar.apellidoCliente || '',
        emailCliente: pedidoEditar.emailCliente || '',
        dni: pedidoEditar.dni || '',
        telefono: pedidoEditar.telefono || '',
        detalle: pedidoEditar.detalle || '',
        metodoEntrega: pedidoEditar.metodoEntrega || 'retiro',
        precioTotal: pedidoEditar.precioTotal || ''
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

  const inputClass = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-[#0D2D53] focus:border-[#0D2D53] dark:bg-[#17191C] dark:text-white";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center p-4 z-50">
      <div className="bg-white dark:bg-[#17191C] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-[#0A0D12] dark:text-white">{pedidoEditar ? 'Editar Pedido' : 'Nuevo Pedido'}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">&times;</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">N° de Orden</label>
                <input type="text" name="numeroOrden" value={formData.numeroOrden} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Teléfono</label>
                <input type="text" name="telefono" value={formData.telefono} onChange={handleChange} required className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</label>
                <input type="text" name="nombreCliente" value={formData.nombreCliente} onChange={handleChange} required className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Apellido</label>
                <input type="text" name="apellidoCliente" value={formData.apellidoCliente} onChange={handleChange} required className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email (Opcional)</label>
                <input type="email" name="emailCliente" value={formData.emailCliente} onChange={handleChange} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">DNI (Opcional)</label>
                <input type="text" name="dni" value={formData.dni} onChange={handleChange} className={inputClass} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Detalle del Pedido</label>
              <textarea name="detalle" value={formData.detalle} onChange={handleChange} required rows="3" className={inputClass}></textarea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Método de Entrega</label>
                <select name="metodoEntrega" value={formData.metodoEntrega} onChange={handleChange} className={inputClass}>
                  <option value="retiro">Retiro</option>
                  <option value="envio">Envío</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Precio Total ($)</label>
                <input type="number" step="0.01" name="precioTotal" value={formData.precioTotal || ''} onChange={handleChange} placeholder="0.00" className={inputClass} />
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

            <div className="flex gap-4 pt-4">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-600 dark:text-white py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
              <button type="submit" disabled={loading} className="flex-1 bg-[#0D2D53] text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-50">
                {loading ? 'Guardando...' : (pedidoEditar ? 'Guardar' : 'Crear')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}