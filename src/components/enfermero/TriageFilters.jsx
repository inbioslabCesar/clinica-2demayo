import { Icon } from '@fluentui/react';

const QUICK_FILTERS = [
  { key: "hoy", label: "Hoy" },
  { key: "manana", label: "Mañana" },
  { key: "atrasadas", label: "Atrasados" },
  { key: "proximos_7", label: "Próximos 7 días" },
  { key: "todas", label: "Todos" },
  { key: "rango", label: "Rango personalizado" },
];

export default function TriageFilters({
  busqueda,
  setBusqueda,
  filtroProgramacion,
  setFiltroProgramacion,
  estadoTriaje,
  setEstadoTriaje,
  fechaDesde,
  setFechaDesde,
  fechaHasta,
  setFechaHasta,
  rowsPerPage,
  setRowsPerPage,
  setPage
}) {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Icon iconName="Filter" className="text-xl text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-800">Filtros de búsqueda</h3>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_FILTERS.map((option) => {
          const isActive = filtroProgramacion === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setFiltroProgramacion(option.key);
                setPage(1);
              }}
              className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                isActive
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
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
            placeholder="Buscar paciente, médico, DNI o HC..."
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
          />
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon iconName="ProgressRingDots" className="text-lg text-gray-400" />
          </div>
          <select
            value={estadoTriaje}
            onChange={(e) => { setEstadoTriaje(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300 appearance-none bg-white"
          >
            <option value="pendiente">Pendiente</option>
            <option value="realizado">Realizado</option>
            <option value="cancelado">Cancelado</option>
            <option value="reprogramado">Reprogramado</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon iconName="Calendar" className="text-lg text-gray-400" />
          </div>
          <input 
            type="date" 
            value={fechaDesde} 
            onChange={e => { setFechaDesde(e.target.value); setPage(1); }} 
            disabled={filtroProgramacion !== "rango"}
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
            disabled={filtroProgramacion !== "rango"}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-300"
            placeholder="Fecha hasta"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
      {(busqueda || fechaDesde || fechaHasta || filtroProgramacion !== "hoy" || estadoTriaje !== "pendiente") && (
        <div className="mt-4 flex justify-end">
          <button 
            onClick={() => {
              setBusqueda("");
              setFiltroProgramacion("hoy");
              setEstadoTriaje("pendiente");
              setFechaDesde("");
              setFechaHasta("");
              setPage(1);
            }} 
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
