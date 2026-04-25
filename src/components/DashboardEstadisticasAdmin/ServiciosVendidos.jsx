import React, { useMemo } from 'react';

const TIPO_BADGE = {
  consulta:     'bg-blue-100 text-blue-700',
  laboratorio:  'bg-violet-100 text-violet-700',
  farmacia:     'bg-emerald-100 text-emerald-700',
  imagen:       'bg-orange-100 text-orange-700',
  procedimiento:'bg-pink-100 text-pink-700',
  contrato_abono:'bg-teal-100 text-teal-700',
};

const tipoBadge = (tipo) => TIPO_BADGE[tipo?.toLowerCase()] ?? 'bg-gray-100 text-gray-600';

const ServiciosVendidos = ({
  servicios,
  serviciosFiltrados,
  filterTipo,
  setFilterTipo,
  filterNombre,
  setFilterNombre,
  handleExportExcel,
  handleExportPDF,
}) => {
  // Use pre-filtered list from parent (useMemo there), fall back gracefully
  const lista = serviciosFiltrados ?? servicios ?? [];

  // Unique types for the filter select (from the unfiltered full list)
  const tiposUnicos = useMemo(() => [...new Set((servicios ?? []).map(s => s.tipo))].filter(Boolean).sort(), [servicios]);
  const nombresVisibles = useMemo(() => [...new Set((servicios ?? []).filter(s => !filterTipo || s.tipo === filterTipo).map(s => s.nombre))].filter(Boolean).sort(), [servicios, filterTipo]);

  const totalGeneral = useMemo(() => lista.reduce((acc, s) => acc + Number(s.total || 0), 0), [lista]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          🛒 Servicios más vendidos
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
            value={filterTipo}
            onChange={e => { setFilterTipo(e.target.value); setFilterNombre(''); }}
          >
            <option value="">Todos los tipos</option>
            {tiposUnicos.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-300"
            value={filterNombre}
            onChange={e => setFilterNombre(e.target.value)}
          >
            <option value="">Todos los servicios</option>
            {nombresVisibles.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
          </select>
          <button
            className="inline-flex items-center gap-1 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition"
            onClick={handleExportExcel}
          >
            📥 Excel
          </button>
          <button
            className="inline-flex items-center gap-1 text-sm bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition"
            onClick={handleExportPDF}
          >
            📄 PDF
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-gray-400 text-sm py-6 text-center">No hay servicios para el filtro aplicado.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-100">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Servicio</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {lista.map((s, i) => {
                  const pct = totalGeneral > 0 ? ((Number(s.total || 0) / totalGeneral) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={s.tipo + '-' + s.nombre} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{s.nombre}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${tipoBadge(s.tipo)}`}>
                          {s.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center font-bold text-gray-700">{s.cantidad}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-blue-700">S/ {Number(s.total || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-gray-200">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-purple-700">S/ {totalGeneral.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400 text-xs">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiciosVendidos;
