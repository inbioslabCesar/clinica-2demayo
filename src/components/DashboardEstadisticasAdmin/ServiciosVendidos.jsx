import React from 'react';

const ServiciosVendidos = ({ servicios, filterTipo, setFilterTipo, filterNombre, setFilterNombre, handleExportExcel, handleExportPDF }) => (
  <div className="bg-white rounded-lg shadow-md p-6 col-span-1 md:col-span-2 lg:col-span-3">
    <h2 className="text-lg font-semibold text-gray-800 mb-4">Servicios más vendidos</h2>
    <div className="flex flex-wrap gap-4 mb-4">
      <select className="border rounded px-2 py-1" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
        <option value="">Todos los tipos</option>
        {[...new Set(servicios.map(s => s.tipo))].map(tipo => (
          <option key={tipo} value={tipo}>{tipo}</option>
        ))}
      </select>
      <select className="border rounded px-2 py-1" value={filterNombre} onChange={e => setFilterNombre(e.target.value)}>
        <option value="">Todos los servicios</option>
        {[...new Set(servicios.map(s => s.nombre))].map(nombre => (
          <option key={nombre} value={nombre}>{nombre}</option>
        ))}
      </select>
      <button className="bg-green-600 text-white px-3 py-1 rounded shadow hover:bg-green-700" onClick={handleExportExcel}>Exportar Excel</button>
      <button className="bg-red-600 text-white px-3 py-1 rounded shadow hover:bg-red-700" onClick={handleExportPDF}>Exportar PDF</button>
    </div>
    <div className="overflow-x-auto">
      <div className="max-h-96 overflow-y-auto border rounded">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Servicio</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Tipo</th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Cantidad</th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Total vendido</th>
            </tr>
          </thead>
          <tbody>
            {servicios
              .filter(s => (!filterTipo || s.tipo === filterTipo) && (!filterNombre || s.nombre === filterNombre))
              .map((s, i) => (
                <tr key={s.tipo + '-' + s.nombre} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-2 whitespace-nowrap font-semibold text-gray-900">{s.nombre}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{s.tipo}</td>
                  <td className="px-4 py-2 text-center text-sm text-gray-700 font-bold">{s.cantidad}</td>
                  <td className="px-4 py-2 text-center font-bold text-blue-700">S/ {Number(s.total).toFixed(2)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default ServiciosVendidos;
