import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { authFetch } from "../utils/apiClient";
import TabsApoyoDiagnostico from "../components/examenes/TabsApoyoDiagnostico";
import ReevaluacionHcCard from "../components/reevaluacion/ReevaluacionHcCard";
import {
  DEFAULT_REEVALUACION,
  REEVALUACION_CONDUCTAS,
  formatReevaluacionCuando,
  limaYmd,
  reevaluacionEstadoClasses,
  reevaluacionEstadoLabel,
} from "../utils/reevaluacion";

function textoDiagnostico(d) {
  const codigo = String(d?.codigo || d?.code || "").trim();
  const nombre = String(d?.descripcion || d?.nombre || d?.titulo || d?.label || "").trim();
  return [codigo, nombre].filter(Boolean).join(" · ");
}

function textoReceta(item) {
  const nombre = String(item?.nombre || item?.medicamento || item?.descripcion || "").trim();
  const detalle = [item?.dosis, item?.frecuencia, item?.duracion].map((v) => String(v || "").trim()).filter(Boolean).join(" · ");
  return [nombre, detalle].filter(Boolean).join(" — ");
}

/** Revisión de una reevaluación: HC de origen en solo lectura, resultados y evolución/conducta. */
export default function ReevaluacionVisitaPage() {
  const { consultaId } = useParams();
  const navigate = useNavigate();
  const [rev, setRev] = useState(null);
  const [hc, setHc] = useState(null);
  const [resultadosLab, setResultadosLab] = useState([]);
  const [ordenesLab, setOrdenesLab] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ evolucion: "", conducta: "", resultados_revisados: false, ajustes: "" });
  const [siguiente, setSiguiente] = useState({ ...DEFAULT_REEVALUACION });

  const postAccion = useCallback(async (payload) => {
    const res = await authFetch("api_reevaluaciones.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data?.success) throw new Error(data?.error || "No se pudo completar la acción");
    return data;
  }, []);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`api_reevaluaciones.php?consulta_visita_id=${Number(consultaId)}`, { cache: "no-store" });
        const data = await res.json();
        if (!data?.success) throw new Error(data?.error || "No hay una reevaluación vigente para esta visita.");
        let actual = data.reevaluacion;
        // Abrir la pantalla equivale a iniciar la revisión del paciente que espera.
        if (actual.estado === "en_espera") {
          const inicio = await postAccion({ accion: "iniciar", id: actual.id });
          actual = { ...actual, ...inicio.reevaluacion };
        }
        if (cancelado) return;
        setRev(actual);

        const origen = Number(actual.consulta_origen_id);
        const [hcRes, labRes, ordRes] = await Promise.all([
          authFetch(`api_historia_clinica.php?consulta_id=${origen}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          authFetch(`api_resultados_laboratorio.php?consulta_id=${origen}&vista=hc_fast&_t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          authFetch(`api_ordenes_laboratorio.php?consulta_id=${origen}&vista=hc_fast&_t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (cancelado) return;
        setHc(hcRes?.success ? hcRes.datos || {} : {});
        setResultadosLab(labRes?.success && Array.isArray(labRes.resultados) ? labRes.resultados : []);
        setOrdenesLab(ordRes?.success && Array.isArray(ordRes.ordenes) ? ordRes.ordenes : []);
      } catch (err) {
        if (!cancelado) setError(err?.message || "No se pudo cargar la reevaluación.");
      } finally {
        if (!cancelado) setLoading(false);
      }
    };
    cargar();
    return () => {
      cancelado = true;
    };
  }, [consultaId, postAccion]);

  const enRevision = rev?.estado === "en_revision";
  const origen = Number(rev?.consulta_origen_id || 0);
  const nombrePaciente = `${rev?.paciente_nombre || ""} ${rev?.paciente_apellido || ""}`.trim() || "Paciente";
  const diagnosticos = Array.isArray(hc?.diagnosticos) ? hc.diagnosticos : [];
  const receta = Array.isArray(hc?.receta) ? hc.receta : [];
  const historial = Array.isArray(hc?.reevaluaciones) ? hc.reevaluaciones : [];
  const evolucionRegistrada = historial.find((h) => Number(h?.reevaluacion_id) === Number(rev?.id));

  const diferir = async () => {
    const hoy = limaYmd();
    const maxFecha = String(rev?.fecha_limite || hoy).slice(0, 10);
    const modal = await Swal.fire({
      title: "Diferir reevaluación",
      html: `
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left;">
          <p style="font-size:12px;color:#475569;margin:0;">Úselo si los resultados aún no están listos. La visita de hoy se cierra y el paciente vuelve a la lista de espera de reevaluaciones hasta el ${maxFecha}. Para un plazo mayor, complete esta reevaluación y cree una nueva.</p>
          <label style="font-size:12px;font-weight:600;">Nueva fecha</label>
          <input id="rv_dif_fecha" type="date" class="swal2-input" style="margin:0;width:100%;" min="${hoy}" max="${maxFecha}" value="${hoy}" />
          <label style="font-size:12px;font-weight:600;">Hora</label>
          <input id="rv_dif_hora" type="time" class="swal2-input" style="margin:0;width:100%;" />
          <label style="font-size:12px;display:flex;gap:6px;align-items:center;"><input id="rv_dif_sin" type="checkbox" checked /> Sin hora fija (durante el día)</label>
          <label style="font-size:12px;font-weight:600;">Motivo</label>
          <input id="rv_dif_motivo" class="swal2-input" style="margin:0;width:100%;" placeholder="Ej: falta el resultado del hemograma" />
        </div>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Diferir",
      cancelButtonText: "Volver",
      preConfirm: () => {
        const fecha = String(document.getElementById("rv_dif_fecha")?.value || "").trim();
        const hora = String(document.getElementById("rv_dif_hora")?.value || "").trim();
        const sin = Boolean(document.getElementById("rv_dif_sin")?.checked) || hora === "";
        if (!fecha || fecha < hoy || fecha > maxFecha) {
          Swal.showValidationMessage(`La fecha debe estar entre ${hoy} y ${maxFecha}`);
          return false;
        }
        return { fecha, hora: sin ? "" : hora, sin_hora_fija: sin, motivo: String(document.getElementById("rv_dif_motivo")?.value || "").trim() };
      },
    });
    if (!modal.isConfirmed) return;

    setGuardando(true);
    try {
      await postAccion({ accion: "diferir", id: rev.id, ...modal.value });
      await Swal.fire("Reevaluación diferida", "El paciente quedó pendiente para la nueva fecha.", "success");
      navigate("/mis-consultas");
    } catch (err) {
      setError(err?.message || "No se pudo diferir la reevaluación.");
    } finally {
      setGuardando(false);
    }
  };

  const completar = async () => {
    setError("");
    if (String(form.evolucion).trim().length < 5) {
      setError("Registre la evolución del paciente.");
      return;
    }
    if (!form.conducta) {
      setError("Seleccione la conducta a seguir.");
      return;
    }
    if (siguiente.programar && !siguiente.fecha) {
      setError("Para citar nuevamente al paciente elija la fecha.");
      return;
    }
    setGuardando(true);
    try {
      const data = await postAccion({
        accion: "completar",
        id: rev.id,
        ...form,
        siguiente: siguiente.programar
          ? {
              programar: true,
              fecha: siguiente.fecha,
              hora: siguiente.sin_hora_fija ? "" : siguiente.hora,
              sin_hora_fija: Boolean(siguiente.sin_hora_fija),
              tipo_motivo: siguiente.tipo_motivo,
              motivo: siguiente.motivo,
            }
          : null,
      });
      if (data.siguiente_error) {
        await Swal.fire("Reevaluación completada", `La evolución quedó registrada, pero no se pudo citar de nuevo: ${data.siguiente_error}`, "warning");
      } else {
        await Swal.fire("Reevaluación completada", data.siguiente ? "La evolución quedó registrada y se indicó una nueva reevaluación." : "La evolución quedó registrada en la historia clínica.", "success");
      }
      navigate("/mis-consultas");
    } catch (err) {
      setError(err?.message || "No se pudo completar la reevaluación.");
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-600">Cargando reevaluación...</div>;
  }
  if (!rev) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">{error || "No hay una reevaluación vigente para esta visita."}</div>
        <button type="button" onClick={() => navigate("/mis-consultas")} className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Volver a mis consultas
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="rounded-2xl border-2 border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-violet-900">🔄 Reevaluación — {nombrePaciente}</h1>
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${reevaluacionEstadoClasses(rev.estado)}`}>
            {reevaluacionEstadoLabel(rev.estado)}
          </span>
          <button
            type="button"
            onClick={() => navigate("/mis-consultas")}
            className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Volver
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Continuación de la atención del {String(rev.consulta_origen_fecha || "").slice(0, 10) || "-"}
          {rev.paciente_dni ? ` · DNI ${rev.paciente_dni}` : ""}
          {rev.motivo ? ` · Motivo: ${rev.motivo}` : ""}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Indicada para {formatReevaluacionCuando(rev.fecha_sugerida, rev.hora_sugerida, rev.sin_hora_fija)} · ventana hasta {String(rev.fecha_limite || "").slice(0, 10)}
        </p>
        <button
          type="button"
          onClick={() => navigate(`/historia-clinica-lectura/${rev.paciente_id}/${origen}`)}
          className="mt-3 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
        >
          Ver la historia clínica completa
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {!enRevision && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          Esta reevaluación está {reevaluacionEstadoLabel(rev.estado).toLowerCase()}; se muestra en solo lectura.
        </div>
      )}

      <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-slate-800">📋 Resumen de la historia clínica de origen</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnósticos</p>
            {diagnosticos.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                {diagnosticos.map((d, i) => <li key={`dx-${i}`}>{textoDiagnostico(d) || "-"}</li>)}
              </ul>
            ) : <p className="text-sm text-slate-500">Sin diagnósticos registrados.</p>}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Receta / tratamiento</p>
            {receta.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                {receta.map((r, i) => <li key={`rx-${i}`}>{textoReceta(r) || "-"}</li>)}
              </ul>
            ) : <p className="text-sm text-slate-500">Sin receta registrada.</p>}
            {String(hc?.tratamiento || "").trim() && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{hc.tratamiento}</p>}
          </div>
        </div>
        {String(hc?.recomendaciones || "").trim() && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Recomendaciones</p>
            <p className="whitespace-pre-line text-sm text-slate-700">{hc.recomendaciones}</p>
          </div>
        )}
        {historial.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reevaluaciones anteriores</p>
            <div className="space-y-1.5">
              {[...historial].reverse().map((h, i) => (
                <div key={`h-${i}`} className="text-xs text-slate-700">
                  <span className="font-semibold">{String(h?.fecha || "")} · {h?.conducta_label || h?.conducta}</span> — {h?.evolucion}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border-2 border-cyan-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-base font-bold text-cyan-900">🔬 Exámenes solicitados y resultados</h2>
        <TabsApoyoDiagnostico
          consultaId={origen}
          pacienteId={Number(rev.paciente_id)}
          resultadosLab={resultadosLab}
          ordenesLab={ordenesLab}
          readOnly
        />
      </div>

      {enRevision ? (
        <>
          <div className="rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold text-emerald-900">🩺 Evolución y conducta</h2>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Evolución del paciente</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={4}
              placeholder="Estado actual, hallazgos y análisis de los resultados..."
              value={form.evolucion}
              onChange={(e) => setForm((f) => ({ ...f, evolucion: e.target.value }))}
            />
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.resultados_revisados} onChange={(e) => setForm((f) => ({ ...f, resultados_revisados: e.target.checked }))} />
              Revisé los resultados de los exámenes solicitados
            </label>
            <p className="mb-1 mt-3 text-sm font-semibold text-slate-700">Conducta a seguir</p>
            <div className="flex flex-wrap gap-4">
              {REEVALUACION_CONDUCTAS.map((c) => (
                <label key={c.value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="radio" name="rev_conducta" checked={form.conducta === c.value} onChange={() => setForm((f) => ({ ...f, conducta: c.value }))} />
                  {c.label}
                </label>
              ))}
            </div>
            <label className="mb-1 mt-3 block text-sm font-semibold text-slate-700">Ajustes indicados (opcional)</label>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={2}
              placeholder="Cambios en dosis, nuevos exámenes, indicaciones..."
              value={form.ajustes}
              onChange={(e) => setForm((f) => ({ ...f, ajustes: e.target.value }))}
            />
          </div>

          <ReevaluacionHcCard
            value={siguiente}
            onChange={setSiguiente}
            servidor={null}
            readOnly={false}
            medicoId={Number(rev.medico_id)}
            consultaId={origen}
            titulo="🔄 Citar nuevamente (opcional)"
            etiquetaActivar="El paciente debe volver otra vez para una nueva reevaluación"
          />

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={diferir}
              disabled={guardando}
              className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Resultados aún no listos: diferir
            </button>
            <button
              type="button"
              onClick={completar}
              disabled={guardando}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Completar reevaluación"}
            </button>
          </div>
        </>
      ) : (
        evolucionRegistrada && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-base font-bold text-emerald-900">🩺 Evolución registrada</h2>
            <p className="text-sm font-semibold text-slate-800">{evolucionRegistrada.conducta_label}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{evolucionRegistrada.evolucion}</p>
            {evolucionRegistrada.ajustes && <p className="mt-1 text-sm text-slate-500">Ajustes: {evolucionRegistrada.ajustes}</p>}
          </div>
        )
      )}
    </div>
  );
}
