import React, { useMemo, useState } from 'react';

const ROL_BADGE = {
  admin:        'bg-purple-100 text-purple-700',
  recepcionista:'bg-blue-100 text-blue-700',
  medico:       'bg-emerald-100 text-emerald-700',
};

const rolBadge = (rol) => ROL_BADGE[rol?.toLowerCase()] ?? 'bg-gray-100 text-gray-600';

const GananciaUsuarioDiario = ({ gananciaUsuarios }) => {
  const [expandedDates, setExpandedDates] = useState({});

  // Agrupar por fecha – estable mientras la prop no cambia
  const byDate = useMemo(() => {
    if (!Array.isArray(gananciaUsuarios) || gananciaUsuarios.length === 0) return [];
    const map = new Map();
    gananciaUsuarios.forEach(g => {
      if (!map.has(g.fecha)) map.set(g.fecha, { fecha: g.fecha, total: 0, rows: [] });
      const bucket = map.get(g.fecha);
      bucket.rows.push(g);
      bucket.total += Number(g.ganancia || 0);
    });
    // Orden descendente (más reciente primero)
    return Array.from(map.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [gananciaUsuarios]);

  const toggleDate = (fecha) =>
    setExpandedDates(prev => ({ ...prev, [fecha]: !prev[fecha] }));

  if (byDate.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">💼 Ganancia por Usuario (diario)</h2>
        <p className="text-gray-400 text-sm">Sin datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
        💼 Ganancia por Usuario <span className="text-xs font-normal text-gray-400">(agrupado por día)</span>
      </h2>
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {byDate.map(({ fecha, total, rows }) => {
          const open = !!expandedDates[fecha];
          // Format date: "2025-04-15" → "15 abr 2025"
          const fechaFmt = (() => {
            try {
              return new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
            } catch { return fecha; }
          })();

          return (
            <div key={fecha} className="border border-gray-100 rounded-lg overflow-hidden">
              {/* Date header – clickable */}
              <button
                onClick={() => toggleDate(fecha)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition text-sm"
              >
                <span className="font-semibold text-gray-700 capitalize">{fechaFmt}</span>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-700 font-bold">S/ {total.toFixed(2)}</span>
                  <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Rows for that date */}
              {open && (
                <div className="divide-y divide-gray-50">
                  {rows.map((g) => (
                    <div key={g.usuario_id + '-' + g.fecha} className="flex items-center gap-3 px-5 py-2 bg-white text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rolBadge(g.rol)}`}>{g.rol}</span>
                      <span className="text-gray-700 font-medium flex-1 truncate">{g.usuario_nombre}</span>
                      <span className="text-emerald-700 font-bold">S/ {Number(g.ganancia).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GananciaUsuarioDiario;
