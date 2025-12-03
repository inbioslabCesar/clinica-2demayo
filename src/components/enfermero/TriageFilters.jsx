import { Icon } from '@fluentui/react';

export default function TriageFilters({ busqueda, setBusqueda, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta, rowsPerPage, setRowsPerPage, setPage }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Icon iconName="Filter" className="text-xl text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-800">Filtros de búsqueda</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon iconName="Search" className="text-lg text-gray-400" />
          </div>
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            placeholder="Buscar paciente, médico..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
          />
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon iconName="Calendar" className="text-lg text-gray-400" />
          </div>
          <input 
            type="date" 
            value={fechaDesde} 
            onChange={e => { setFechaDesde(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
            placeholder="Fecha desde"
          />
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon iconName="Calendar" className="text-lg text-gray-400" />
          </div>
          <input 
            type="date" 
            value={fechaHasta} 
            onChange={e => { setFechaHasta(e.target.value); setPage(1); }} 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
            placeholder="Fecha hasta"
          />
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon iconName="NumberedList" className="text-lg text-gray-400" />
          </div>
          <select 
            value={rowsPerPage} 
            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} 
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 appearance-none bg-white"
          >
            <option value={5}>5 por página</option>
            <option value={10}>10 por página</option>
            <option value={25}>25 por página</option>
          </select>
        </div>
      </div>
      {(busqueda || fechaDesde || fechaHasta) && (
        <div className="mt-4 flex justify-end">
          <button 
            onClick={() => { setBusqueda(""); setFechaDesde(""); setFechaHasta(""); setPage(1); }} 
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors duration-300"
          >
            <Icon iconName="Clear" className="text-lg" />
            <span>Limpiar filtros</span>
          </button>
        </div>
      )}
    </div>
    );

}
