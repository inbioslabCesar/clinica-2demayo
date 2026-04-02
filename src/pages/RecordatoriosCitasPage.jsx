import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

const ESTADOS_GESTION = [
  { value: "", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "contactado", label: "Contactado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "no_contesta", label: "No contesta" },
  { value: "reprogramar", label: "Reprogramar" },
  { value: "cancelado", label: "Cancelado" },
];

function estadoBadgeClasses(estado) {
  switch (estado) {
    case "confirmado":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "contactado":
      return "bg-sky-100 text-sky-700 border-sky-200";
    case "no_contesta":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "reprogramar":
      return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
    case "cancelado":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function formatFecha(fecha) {
  if (!fecha) return "-";
  const d = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatFechaHora(fecha, hora) {
  if (!fecha) return "-";
  const hh = String(hora || "").slice(0, 5);
  return `${formatFecha(fecha)} ${hh || ""}`.trim();
}

function diasParaCita(fecha) {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const target = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - hoy.getTime();
  return Math.floor(ms / 86400000);
}

export default function RecordatoriosCitasPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [dias, setDias] = useState(30);
  const [estadoGestion, setEstadoGestion] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloSinGestion, setSoloSinGestion] = useState(false);

  const cargar = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        dias: String(dias),
        estado_gestion: estadoGestion,
        busqueda: busqueda.trim(),
        solo_sin_gestion: soloSinGestion ? "1" : "0",
      });
      const res = await fetch(`${BASE_URL}api_recordatorios_citas.php?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo cargar recordatorios");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Error cargando recordatorios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, estadoGestion, soloSinGestion]);

  const pendientesUrgentes = useMemo(
    () => items.filter((item) => {
      const d = diasParaCita(item.fecha);
      return d !== null && d <= 1 && ["pendiente", "no_contesta"].includes(item.estado_gestion);
    }).length,
    [items]
  );

  const guardarGestion = async (item, estado) => {
    const observacion = window.prompt("Observacion (opcional):", item.observacion || "") ?? "";
    const proximo =
      estado === "no_contesta"
        ? (window.prompt("Proximo contacto (YYYY-MM-DD HH:mm, opcional):", "") ?? "")
        : "";

    setSavingId(item.id);
    setMensaje("");
    try {
      const res = await fetch(`${BASE_URL}api_recordatorios_citas.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          consulta_id: item.id,
          estado,
          observacion,
          fecha_proximo_contacto: proximo,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "No se pudo guardar gestion");
      }
      setMensaje("Gestion guardada correctamente.");
      await cargar();
      return true;
    } catch (err) {
      setError(err.message || "No se pudo guardar gestion");
      return false;
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: "linear-gradient(145deg, #f8fafc, #eef2ff)" }}>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Recordatorios de proximas citas</h1>
              <p className="mt-1 text-sm text-slate-600">
                Vista operativa para admin y recepcion: llamadas de confirmacion antes de la cita.
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">
              Urgentes (hoy/manana sin confirmar): {pendientesUrgentes}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Horizonte</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              >
                <option value={30}>30 dias</option>
                <option value={14}>14 dias</option>
                <option value={7}>7 dias</option>
                <option value={3}>3 dias</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Estado gestion</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={estadoGestion}
                onChange={(e) => setEstadoGestion(e.target.value)}
              >
                {ESTADOS_GESTION.map((item) => (
                  <option key={item.value || "all"} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Busqueda</label>
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Paciente, medico, DNI, telefono o ID"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={cargar}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Buscar
              </button>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={soloSinGestion}
                  onChange={(e) => setSoloSinGestion(e.target.checked)}
                />
                Solo pendientes
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {mensaje && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{mensaje}</div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="p-3 text-left">Cita</th>
                <th className="p-3 text-left">Paciente</th>
                <th className="p-3 text-left">Medico</th>
                <th className="p-3 text-left">Estado gestion</th>
                <th className="p-3 text-left">Intentos</th>
                <th className="p-3 text-left">Observacion</th>
                <th className="p-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-5 text-center text-slate-500">Cargando recordatorios...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-5 text-center text-slate-500">No hay citas por gestionar en este rango.</td>
                </tr>
              ) : (
                items.map((item) => {
                  const diasRestantes = diasParaCita(item.fecha);
                  return (
                    <tr key={item.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">#{item.id}</div>
                        <div className="text-xs text-slate-600">{formatFechaHora(item.fecha, item.hora)}</div>
                        <div className="text-xs font-semibold text-rose-700">
                          {diasRestantes === 0
                            ? "Hoy"
                            : diasRestantes === 1
                              ? "Manana"
                              : `${diasRestantes} dias`}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{item.paciente_nombre} {item.paciente_apellido}</div>
                        <div className="text-xs text-slate-600">DNI: {item.paciente_dni || "-"}</div>
                        <div className="text-xs text-slate-600">Tel: {item.paciente_telefono || "Sin telefono"}</div>
                      </td>
                      <td className="p-3 text-slate-700">{item.medico_nombre} {item.medico_apellido}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${estadoBadgeClasses(item.estado_gestion)}`}>
                          {item.estado_gestion}
                        </span>
                        <div className="mt-1 text-xs text-slate-500">
                          Prox: {item.fecha_proximo_contacto ? item.fecha_proximo_contacto.replace("T", " ") : "-"}
                        </div>
                      </td>
                      <td className="p-3 text-slate-700">{item.intentos || 0}</td>
                      <td className="p-3 text-xs text-slate-600">{item.observacion || "-"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => guardarGestion(item, "contactado")}
                            disabled={savingId === item.id}
                            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            Llamado
                          </button>
                          <button
                            type="button"
                            onClick={() => guardarGestion(item, "confirmado")}
                            disabled={savingId === item.id}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Confirmo
                          </button>
                          <button
                            type="button"
                            onClick={() => guardarGestion(item, "no_contesta")}
                            disabled={savingId === item.id}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            No contesta
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await guardarGestion(item, "reprogramar");
                              if (!ok) return;
                              navigate(`/agendar-consulta?paciente_id=${Number(item.paciente_id || 0)}&consulta_id=${Number(item.id || 0)}`);
                            }}
                            disabled={savingId === item.id}
                            className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                          >
                            Reprogramar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
