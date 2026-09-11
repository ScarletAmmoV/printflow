import { useState, useEffect } from 'react';
import api from './api';
import OrderFormModal from './OrderFormModal';
import Ajustes from './Ajustes';
import { 
  MoreVertical, Pencil, Undo2, Zap, Trash2, RotateCcw, MessageCircle, 
  ChevronLeft, ChevronRight, Search, Calendar, PlusCircle, CheckCircle, 
  Clock, Layers, Moon, Sun, X, Settings, Paperclip
} from 'lucide-react';

// Cronómetro
function CountdownTimer({ targetDate }) {
  const [timeLeft, setTimeLeft] = useState(180);
  const radius = 14;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setTimeLeft(diff);
      if (diff <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const offset = circumference - (timeLeft / 180) * circumference;
  const formatTime = `${Math.floor(timeLeft / 60)}:${timeLeft % 60 < 10 ? '0' : ''}${timeLeft % 60}`;

  return (
    <div className="group relative flex items-center justify-end w-16">
      <svg width="32" height="32" className="transform -rotate-90">
        <circle cx="16" cy="16" r={radius} stroke="currentColor" className="text-gray-200 dark:text-gray-600" strokeWidth="3" fill="none" />
        <circle cx="16" cy="16" r={radius} stroke={timeLeft < 60 ? '#ef4444' : '#6366f1'} strokeWidth="3" fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <span className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 pointer-events-none z-50 whitespace-nowrap">
        {timeLeft === 0 ? 'Enviado' : formatTime}
      </span>
    </div>
  );
}

const highlightText = (text, query) => {
  if (!query) return text;
  const normalizedText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedQuery = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const index = normalizedText.indexOf(normalizedQuery);
  if (index === -1) return text;
  return <>{text.substring(0, index)}<mark className="bg-yellow-200 rounded px-0.5 dark:bg-yellow-500 dark:text-black">{text.substring(index, index + query.length)}</mark>{text.substring(index + query.length)}</>;
};

const formatFecha = (dateStr) => {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

export default function Dashboard() {
  const [tab, setTab] = useState('pendiente');
  const [pedidos, setPedidos] = useState([]);
  const [counts, setCounts] = useState({ pendientes: 0, finalizados: 0, eliminados: 0, finalizadosSemana: 0, finalizadosHoy: 0, pago_pendiente: 0 });
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [searchFecha, setSearchFecha] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [pedidoEditar, setPedidoEditar] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [toast, setToast] = useState(null);
  
  // Simplificamos el estado del menú: solo guardamos el ID
    const [openMenu, setOpenMenu] = useState({ id: null, direction: 'down' });

  const taller = JSON.parse(localStorage.getItem('taller'));

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const fetchPedidos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/pedidos', { params: { estado: tab, search, fecha: searchFecha } });
      setPedidos(res.data);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  const fetchCounts = async () => {
    try {
      const res = await api.get('/pedidos/contar');
      setCounts(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchPedidos(); }, [tab, search, searchFecha]);
  useEffect(() => { fetchCounts(); }, [tab, pedidos.length]);

  useEffect(() => {
    const interval = setInterval(() => { fetchPedidos(); fetchCounts(); }, 5000);
    return () => clearInterval(interval);
  }, [tab, search, searchFecha]);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
     const handleClickOutside = () => setOpenMenu({ id: null, direction: 'down' });
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Cambiar el ID del menú abierto
      const toggleMenu = (e, id) => {
    e.stopPropagation();
    if (openMenu.id === id) {
      setOpenMenu({ id: null, direction: 'down' });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - rect.bottom;
    const direction = espacioAbajo > 200 ? 'down' : 'up';
    setOpenMenu({ id, direction });
  };

  const handleAccion = async (id, accion) => {
    setOpenMenu({ id: null, direction: 'down' });
    try {
      if (accion === 'eliminar') { await api.patch(`/pedidos/${id}/eliminar`); showToast('Pedido movido a papelera'); }
      if (accion === 'restaurar') { await api.patch(`/pedidos/${id}/restaurar`); showToast('Pedido restaurado'); }
      if (accion === 'finalizar') { await api.patch(`/pedidos/${id}/finalizar`); showToast('Cronómetro iniciado'); }
      if (accion === 'revertir') { await api.patch(`/pedidos/${id}/revertir`); showToast('Notificación cancelada'); }
      if (accion === 'enviar-ya') { await api.patch(`/pedidos/${id}/enviar-ya`); showToast('WhatsApp enviado'); }
      if (accion === 'marcar-impresos') { await api.patch(`/pedidos/${id}/marcar-impresos`); showToast('Archivos marcados como impresos'); }
      await fetchPedidos(); await fetchCounts();
    } catch (err) { showToast('Error al actualizar'); }
  };
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === pedidos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pedidos.map(p => p.id));
    }
  };

  const handleEliminarMasivo = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.length} pedido(s)?`)) return;
    
    try {
      await api.post('/pedidos/eliminar-masivo', { ids: selectedIds });
      showToast(`${selectedIds.length} pedido(s) movidos a la papelera`);
      setSelectedIds([]);
      await fetchPedidos(); 
      await fetchCounts();
    } catch (err) { showToast('Error al eliminar'); }
  };
  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('taller'); window.location.href = '/login';
  };

  const formatCount = (num, collapsed = false) => {
    if (collapsed) return num > 99 ? '+99' : num;
    return num > 9999 ? '+9999' : num;
  };

  const tabs = [
    { id: 'pago_pendiente', label: 'Pago Pendiente', count: counts.pago_pendiente, icon: Clock },
    { id: 'pendiente', label: 'En Cola', count: counts.pendientes, icon: CheckCircle },
    { id: 'finalizado', label: 'Finalizados', count: counts.finalizados, icon: Layers },
    { id: 'eliminado', label: 'Papelera', count: counts.eliminados, icon: Trash2 },
    { id: 'ajustes', label: 'Ajustes', count: null, icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col md:flex-row transition-colors">
      
      {/* SIDEBAR */}
      <nav className={`bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex flex-col p-4 transition-all duration-300 ${sidebarCollapsed ? 'md:w-20' : 'md:w-60'} w-full`}>
        <div className="flex justify-between items-center mb-8">
          {!sidebarCollapsed && (
            <div className="hidden md:block">
              <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">PrintFlow</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{taller?.nombre}</p>
            </div>
          )}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="text-gray-400 hover:text-indigo-600 p-2 hidden md:block" title={sidebarCollapsed ? 'Expandir' : 'Contraer'}>
            {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        
        <div className="flex md:flex-col gap-2 flex-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} title={sidebarCollapsed ? t.label : ''} className={`relative flex items-center justify-between p-2.5 rounded-lg transition-all whitespace-nowrap ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <div className="flex items-center gap-2">
                  <Icon size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="text-sm">{t.label}</span>}
                </div>
                {t.count !== null && (
                  sidebarCollapsed ? (
                    <span className={`absolute bottom-1 right-1 px-1 py-0.5 rounded-full text-[10px] ${tab === t.id ? 'bg-white text-indigo-600' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200'}`}>{formatCount(t.count, true)}</span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${tab === t.id ? 'bg-white text-indigo-600' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200'}`}>{formatCount(t.count)}</span>
                  )
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <button onClick={() => setDarkMode(!darkMode)} title="Cambiar tema" className="p-2.5 text-left text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2">
            {darkMode ? <Sun size={18} className="flex-shrink-0" /> : <Moon size={18} className="flex-shrink-0" />}
            {!sidebarCollapsed && <span className="text-sm">{darkMode ? 'Modo Claro' : 'Modo Oscuro'}</span>}
          </button>

          <button onClick={handleLogout} title="Cerrar Sesión" className="p-2.5 text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2">
            <svg className="w-[18px] h-[18px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            {!sidebarCollapsed && <span className="text-sm">Cerrar Sesión</span>}
          </button>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        
        {tab === 'ajustes' ? (
          <Ajustes />
        ) : (
        <>
        
        {/* MÉTRICAS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Pendientes Actuales</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{formatCount(counts.pendientes)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Finalizados (Hoy)</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{formatCount(counts.finalizadosHoy)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Finalizados esta semana</p>
            <p className="text-3xl font-bold text-blue-500 dark:text-blue-400 mt-1">{formatCount(counts.finalizadosSemana)}</p>
          </div>
        </div>

        {/* BÚSQUEDA */}
        <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto items-center">
            <div className="relative w-full md:w-80">
              <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
              <input type="text" placeholder="Buscar por nombre o orden..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
            <div className="relative w-full md:w-48">
              <Calendar size={18} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
              <input type="date" value={searchFecha} onChange={(e) => setSearchFecha(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
            {(search || searchFecha) && (
              <button onClick={() => { setSearch(''); setSearchFecha(''); }} className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1">
                <X size={14} /> Limpiar
              </button>
            )}
          </div>
          {selectedIds.length > 0 && (
            <button onClick={handleEliminarMasivo} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 w-full md:w-auto flex items-center justify-center gap-2">
              <Trash2 size={18} /> Eliminar ({selectedIds.length})
            </button>
          )}
          <button onClick={() => { setPedidoEditar(null); setShowModal(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 w-full md:w-auto flex items-center justify-center gap-2">
            <PlusCircle size={18} /> Nuevo Pedido
          </button>
        </header>

        {/* TABLA */}
        {/* Quitamos overflow-x-auto para que el menú absoluto no se corte */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
          {loading ? (
            <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div></div>
          ) : pedidos.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400"><p>No hay pedidos en esta sección.</p></div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-300 uppercase text-xs">
                <tr>
                    <th className="px-4 py-3 w-10">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.length === pedidos.length && pedidos.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3">Orden / Fecha</th>
                  <th className="px-4 py-3">Orden / Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Detalle</th>
                  <th className="px-4 py-3 text-center">Archivos</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3">Estado / Tiempo</th>
                  <th className="px-4 py-3 text-right relative">Acciones</th> {/* relative para el menú */}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {pedidos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <input 
                          type="checkbox" 
                          checked={selectedIds.includes(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="w-4 h-4 rounded cursor-pointer"
                      />
                      <p className="font-bold text-gray-800 dark:text-gray-100">#{highlightText(p.numeroOrden, search)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{formatFecha(p.fechaEntrada)} {new Date(p.fechaEntrada).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-700 dark:text-gray-200">{highlightText(`${p.nombreCliente} ${p.apellidoCliente}`, search)}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                        <span>{p.telefono}</span>
                        <a href={`https://wa.me/${p.telefono}`} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-600 inline-flex items-center" title="Abrir chat de WhatsApp">
                          <MessageCircle size={14} />
                        </a>
                      </div>
                    </td>
                      <td className="px-4 py-3 hidden lg:table-cell max-w-xs">
                        <p className="text-gray-500 dark:text-gray-400 truncate">{p.detalle}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.archivosAdjuntos ? (
                          <button 
                            onClick={() => {
                              if (confirm(`Archivos:\n${p.archivosAdjuntos}\n\n¿Querés marcar estos archivos como ya impresos?`)) {
                                handleAccion(p.id, 'marcar-impresos');
                              }
                            }}
                            title={p.archivosAdjuntos}
                            className={`p-2 rounded-full ${p.archivosImpresos ? 'text-green-500' : 'text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'}`}
                          >
                            {p.archivosImpresos ? <CheckCircle size={18} /> : <Paperclip size={18} />}
                          </button>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${p.metodoEntrega === 'retiro' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'}`}>{p.metodoEntrega}</span>
                      </td>
                    <td className="px-4 py-3">
                      {p.estado === 'pendiente' && <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400">Pendiente</span>}
                      {p.estado === 'eliminado' && <span className="px-2 py-1 rounded text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">Eliminado</span>}
                      {p.estado === 'finalizado' && (
                        <div className="w-16">
                          {p.notificacionEnviada ? <span className="text-xs font-bold text-green-600 dark:text-green-400 flex items-center gap-1"><MessageCircle size={14} /> Enviado</span> : <CountdownTimer targetDate={p.notificacionProgramadaPara} />}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right relative"> {/* relative para anclar el menú */}
                      <div className="flex items-center justify-end gap-2">
                        {p.estado === 'pendiente' && (
                          <button onClick={() => handleAccion(p.id, 'finalizar')} className="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 flex items-center gap-1" title="Marcar como listo">
                            <CheckCircle size={14} /> Listo
                          </button>
                        )}
                        <button onClick={(e) => toggleMenu(e, p.id)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full" title="Más opciones">
                          <MoreVertical size={18} />
                        </button>
                      </div>

                                            {/* MENÚ ABSOLUTO DENTRO DE LA CELDA */}
                      {openMenu.id === p.id && (
                        <div 
                          className={`absolute right-4 w-44 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-2xl z-50 py-1 text-left ${openMenu.direction === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'}`} 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button onClick={() => { setPedidoEditar(p); setShowModal(true); setOpenMenu({ id: null, direction: 'down' }); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Pencil size={14} /> Editar
                          </button>
                          
                          {p.estado === 'finalizado' && !p.notificacionEnviada && (
                            <>
                              <button onClick={() => handleAccion(p.id, 'revertir')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                                <Undo2 size={14} /> Revertir
                              </button>
                              <button onClick={() => handleAccion(p.id, 'enviar-ya')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                                <Zap size={14} /> Notificar Ya
                              </button>
                            </>
                          )}
                          
                          {p.estado !== 'eliminado' ? (
                            <button onClick={() => handleAccion(p.id, 'eliminar')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                              <Trash2 size={14} /> Eliminar
                            </button>
                          ) : (
                            <button onClick={() => handleAccion(p.id, 'restaurar')} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                              <RotateCcw size={14} /> Restaurar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        </>
        )}
      </main>

      {showModal && (
        <OrderFormModal 
          pedidoEditar={pedidoEditar} 
          onClose={() => { setShowModal(false); setPedidoEditar(null); }} 
          onSaved={() => { fetchPedidos(); fetchCounts(); showToast('Pedido guardado con éxito'); }} 
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-800 dark:bg-gray-200 dark:text-gray-800 text-white px-6 py-3 rounded-lg shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  );
}