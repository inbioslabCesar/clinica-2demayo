import { useEffect, useRef, useState } from "react";
import { agendaMedicoDia, generarConsultaSeguimiento } from "../../api/seguimientoClinicoApi";
import { getLimaDate } from "../../utils/dateTime";
import { MODOS, MOTIVO_MIN, cuerpoGeneracion, mensajeResultado, nuevoIdSolicitud, validarGeneracion } from "../../utils/generarConsultaSeguimiento";

function Opcion({ valor, actual, onElegir, titulo, descripcion }) {
  const activa = actual === valor;
  return (
    <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm transition-colors ${activa ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
      <input type="radio" name="seg-modo" className="mt-1" checked={activa} onChange={() => onElegir(valor)} />
      <span>
        <span className="block font-semibold text-slate-800">{titulo}</span>
        <span className="block text-xs text-slate-600">{descripcion}</span>
      </span>
    </label>
  );
}

/** Genera una consulta de seguimiento del propio médico: con cobro (queda pendiente en recepción) o sin cobro (exonerada, con motivo). */
export default function GenerarConsulta({ paciente, medicoId, onGenerada }) {
  const hoy = getLimaDate();
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState("");
  const [modo, setModo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [libres, setLibres] = useState({ cargando: true, horas: [], error: "" });
  const [envio, setEnvio] = useState({ enviando: false, error: "", resultado: null });
  const solicitud = useRef(null);

  // Cualquier cambio del formulario es una solicitud nueva; un doble clic o reintento reutiliza el mismo identificador.
  useEffect(() => {
    solicitud.current = null;
  }, [paciente.id, fecha, hora, modo, motivo]);

  useEffect(() => {
    let cancelado = false;
    setLibres({ cargando: true, horas: [], error: "" });
    setHora("");
    agendaMedicoDia(medicoId, fecha)
      .then((r) => !cancelado && setLibres({ cargando: false, horas: r.libres, error: "" }))
      .catch((e) => !cancelado && setLibres({ cargando: false, horas: [], error: e.message || "No se pudo cargar tu agenda" }));
    return () => {
      cancelado = true;
    };
  }, [medicoId, fecha]);

  const errorFormulario = validarGeneracion({ fecha, hora, modo, motivo }, hoy);

  const enviar = async () => {
    if (errorFormulario || envio.enviando) return;
    if (!solicitud.current) solicitud.current = nuevoIdSolicitud();
    setEnvio({ enviando: true, error: "", resultado: null });
    try {
      const r = await generarConsultaSeguimiento(cuerpoGeneracion({ pacienteId: paciente.id, fecha, hora, modo, motivo }, solicitud.current));
      setEnvio({ enviando: false, error: "", resultado: r });
      solicitud.current = null;
      setHora("");
      setMotivo("");
      setModo("");
      onGenerada?.(r);
    } catch (e) {
      setEnvio({ enviando: false, error: e.message || "No se pudo generar la consulta", resultado: null });
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-800">Generar consulta de seguimiento</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="gen-fecha" className="mb-1 block text-xs font-semibold text-slate-600">Fecha</label>
          <input id="gen-fecha" type="date" min={hoy} value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="gen-hora" className="mb-1 block text-xs font-semibold text-slate-600">Hora libre de tu agenda</label>
          <select id="gen-hora" value={hora} onChange={(e) => setHora(e.target.value)} disabled={libres.cargando || libres.horas.length === 0} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100">
            <option value="">{libres.cargando ? "Cargando..." : libres.horas.length === 0 ? "Sin horas libres ese día" : "Elige una hora"}</option>
            {libres.horas.map((h) => <option key={h} value={String(h).slice(0, 5)}>{String(h).slice(0, 5)}</option>)}
          </select>
          {libres.error && <p className="mt-1 text-xs text-red-600" role="alert">{libres.error}</p>}
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1 text-xs font-semibold text-slate-600">¿Cómo se registra?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Opcion valor={MODOS.CON_COBRO} actual={modo} onElegir={setModo} titulo="Con cobro" descripcion="Queda pendiente de pago en Atenciones con la tarifa de tu consulta; recepción la cobra." />
          <Opcion valor={MODOS.SIN_COBRO} actual={modo} onElegir={setModo} titulo="Sin cobro (exonerada)" descripcion="No genera cobro ni honorario. Queda registrada con tu nombre y el motivo." />
        </div>
      </fieldset>

      {modo === MODOS.SIN_COBRO && (
        <div className="mt-3">
          <label htmlFor="gen-motivo" className="mb-1 block text-xs font-semibold text-slate-600">Motivo de la exoneración (obligatorio)</label>
          <textarea id="gen-motivo" rows={2} maxLength={255} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Ej: control posquirúrgico, resultado de exámenes..." />
          <p className="text-right text-[11px] text-slate-500">{motivo.trim().length}/{MOTIVO_MIN} mínimo</p>
        </div>
      )}

      {envio.error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{envio.error}</p>}
      {envio.resultado && <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800" role="status">{mensajeResultado(envio.resultado)}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">{errorFormulario && (hora || modo) ? errorFormulario : ""}</p>
        <button
          type="button"
          onClick={enviar}
          disabled={Boolean(errorFormulario) || envio.enviando}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {envio.enviando ? "Generando..." : "Generar consulta"}
        </button>
      </div>
    </div>
  );
}
