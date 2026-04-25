import React, { useMemo } from 'react';
import {
  AreaChart, Area,
  Line,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const fmtAxisDate = (fechaStr) => {
  try {
    const d = new Date(fechaStr + 'T00:00:00');
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  } catch { return fechaStr; }
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const tiempoReal = payload.find(p => p.dataKey === 'tiempoReal')?.value ?? 0;
  const consolidado = payload.find(p => p.dataKey === 'consolidado')?.value ?? 0;
  const fechaMostrar = (() => {
    try {
      return new Date(label + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'long' });
    } catch { return label; }
  })();
  return (
    <div className="bg-white border border-purple-100 rounded-lg shadow-lg px-4 py-3 text-sm">
      <p className="text-gray-500 text-xs capitalize mb-1">{fechaMostrar}</p>
      <p className="font-bold text-purple-700">Tiempo real: S/ {Number(tiempoReal).toFixed(2)}</p>
      <p className="font-semibold text-slate-600">Consolidado: S/ {Number(consolidado).toFixed(2)}</p>
    </div>
  );
};

const TendenciasIngresos = ({ tendencias }) => {
  // Normalize only once
  const data = useMemo(
    () => (tendencias ?? []).map(t => ({
      ...t,
      tiempoReal: Number(t.tiempoReal ?? t.total ?? 0),
      consolidado: Number(t.consolidado ?? 0),
    })),
    [tendencias]
  );

  const maxVal = useMemo(() => Math.max(...data.map(d => Math.max(d.tiempoReal, d.consolidado)), 0), [data]);
  // Nice Y-axis max
  const yMax = maxVal > 0 ? Math.ceil(maxVal * 1.15 / 50) * 50 : 100;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
          📈 Tendencia de Ingresos
          <span className="text-xs font-normal text-gray-400">operativo vs contable, por día</span>
        </h2>
        {data.length > 0 && (
          <span className="text-xs text-gray-400">{data.length} días</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <span className="inline-flex items-center gap-1 text-purple-700 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-600" /> Tiempo real (cobros pagados)
        </span>
        <span className="inline-flex items-center gap-1 text-slate-600 font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> Consolidado (cajas cerradas)
        </span>
      </div>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradPurple" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="fecha"
              tickFormatter={fmtAxisDate}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, yMax]}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `S/${v}`}
              width={56}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="tiempoReal"
              stroke="#7c3aed"
              strokeWidth={2.5}
              fill="url(#gradPurple)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: '#7c3aed' }}
            />
            <Line
              type="monotone"
              dataKey="consolidado"
              stroke="#475569"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          No hay datos suficientes para este período
        </div>
      )}
    </div>
  );
};

export default TendenciasIngresos;
