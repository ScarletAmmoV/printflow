import { useState, useEffect } from 'react';
import api from './api';
import { DollarSign, ShoppingBag, Users, TrendingUp, Flame, Calendar } from 'lucide-react';

export default function Metricas() {
  const [datos, setDatos] = useState(null);
  const [avanzado, setAvanzado] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [res1, res2] = await Promise.all([
          api.get('/pedidos/metricas'),
          api.get('/pedidos/metricas-avanzadas')
        ]);
        setDatos(res1.data);
        setAvanzado(res2.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  if (loading || !datos || !avanzado) return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>;

  const cards = [
    { titulo: 'Ingresos Totales', valor: `$${datos.totalIngresos}`, icon: DollarSign, color: 'text-green-600 dark:text-green-400' },
    { titulo: 'Ticket Promedio', valor: `$${datos.ticketPromedio}`, icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400' },
    { titulo: 'Total Pedidos', valor: datos.totalPedidos, icon: ShoppingBag, color: 'text-indigo-600 dark:text-indigo-400' },
    { titulo: 'Clientes Únicos', valor: datos.totalClientes, icon: Users, color: 'text-purple-600 dark:text-purple-400' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Métricas del Negocio</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div key={i} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{card.titulo}</p>
                <Icon size={20} className={card.color} />
              </div>
              <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">{card.valor}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PRODUCTOS CALIENTES */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
            <Flame size={20} className="text-orange-500" /> Productos más vendidos
          </h3>
          {avanzado.productosCalientes.length === 0 ? (
            <p className="text-gray-400 text-sm">Aún no hay datos suficientes.</p>
          ) : (
            <ul className="space-y-3">
              {avanzado.productosCalientes.map((prod, i) => (
                <li key={i} className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{prod.nombre}</span>
                  <span className="text-sm font-bold bg-orange-100 text-orange-600 px-2 py-1 rounded">{prod.total} und.</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* EDADES POR DNI */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
            <Calendar size={20} className="text-blue-500" /> Rango de edad de clientes
          </h3>
          <ul className="space-y-3">
            {Object.entries(avanzado.rangosEdad).map(([rango, total]) => (
              <li key={rango} className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{rango} años</span>
                <span className="text-sm font-bold bg-blue-100 text-blue-600 px-2 py-1 rounded">{total} clientes</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}