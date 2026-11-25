import { formatReevaluacionCuando } from "../../utils/reevaluacion";

/** Insignia de reevaluación abierta en las filas de /mis-consultas (consulta origen). */
export default function ReevaluacionBadge({ consulta }) {
  if (Number(consulta?.reevaluacion_pendiente) !== 1) return null;

  const atrasada = Number(consulta?.reevaluacion_atrasada) === 1;
  const cuando = formatReevaluacionCuando(
    consulta?.reevaluacion_fecha,
    consulta?.reevaluacion_hora,
    consulta?.reevaluacion_sin_hora_fija,
  );
  const clases = atrasada
    ? "bg-rose-100 text-rose-800 border-rose-200"
    : "bg-violet-100 text-violet-800 border-violet-200";

  return (
    <span
      className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${clases}`}
      title={consulta?.reevaluacion_motivo || "Reevaluación pendiente"}
    >
      🔄 {atrasada ? "Reevaluación atrasada" : "Reevalúa"}: {cuando}
    </span>
  );
}
