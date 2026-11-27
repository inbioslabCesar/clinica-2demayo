import { useEffect, useState } from "react";
import { agendaMedicoDia } from "../../api/seguimientoClinicoApi";
import { getLimaDate } from "../../utils/dateTime";

/** Horas libres y ocupadas del médico en una fecha (misma regla de agenda que recepción: consultas, servicios y reevaluaciones). */
export default function MiAgenda({ medicoId }) {
  const [fecha, setFecha] = useState(() => getLimaDate());
  const [estado, setEstado] = useState({ cargando: true, error: "", libres: [], ocupados: [], slot: 0 });

  useEffect(() => {
    let cancelado = false;
    setEstado((e) => ({ ...e, cargando: true, error: "" }));
    agendaMedicoDia(medicoId, fecha)
      .then((r) => !cancelado && setEstado({ cargando: false, error: "", libres: r.libres, ocupados: r.ocupados, slot: r.slot }))
      .catch((e) => !cancelado && setEstado({ cargando: false, error: e.message || "No se pudo cargar la agenda", libres: [], ocupados: [], slot: 0 }));
    return () => {
      cancelado = true;
    };
  }, [medicoId, fecha]);

  const sinHorario = !estado.cargando && !estado.error && estado.libres.length === 0 && estado.ocupados.length === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-bold text-slate-800">Mi agenda</h3>
      <label htmlFor="seg-fecha" className="mb-1 block text-xs font-semibold text-slate-600">Fecha</label>
      <input id="seg-fecha" type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />

      {estado.cargando && <p className="text-xs text-slate-500">Cargando agenda...</p>}
      {estado.error && <p className="text-xs text-red-600" role="alert">{estado.error}</p>}
      {sinHorario && <p className="text-xs text-slate-500">No tienes horario programado para esta fecha.</p>}

      {!estado.cargando && !estado.error && !sinHorario && (
        <div className="space-y-3 text-xs">
          <div>
            <p className="mb-1 font-semibold text-emerald-700">Libres ({estado.libres.length}){estado.slot ? ` · turnos de ${estado.slot} min` : ""}</p>
            <div className="flex flex-wrap gap-1">
              {estado.libres.length === 0 && <span className="text-slate-500">Sin horas libres</span>}
              {estado.libres.map((h) => <span key={h} className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">{String(h).slice(0, 5)}</span>)}
            </div>
          </div>
          <div>
            <p className="mb-1 font-semibold text-rose-700">Ocupadas ({estado.ocupados.length})</p>
            <div className="flex flex-wrap gap-1">
              {estado.ocupados.length === 0 && <span className="text-slate-500">Ninguna</span>}
              {estado.ocupados.map((h) => <span key={h} className="rounded bg-rose-50 px-2 py-0.5 font-medium text-rose-800">{String(h).slice(0, 5)}</span>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
