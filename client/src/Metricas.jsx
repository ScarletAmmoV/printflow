import { useState, useEffect } from 'react';
import api from './api';
import { DollarSign, ShoppingBag, Users, TrendingUp } from 'lucide-react';

export default function Metricas() {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetricas = async () => {
      try {
        const res = await api.get('/pedidos/metricas');
        setDatos(res.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchMetricas();
  }, []);

  if (loading) return <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>;

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

      {/* Acá después vamos a poner los gráficos de edades y productos calientes */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm text-center text-gray-400">
        <p>Próximamente: Gráficos de edad por DNI y Productos más vendidos.</p>
      </div>
    </div>
  );
}