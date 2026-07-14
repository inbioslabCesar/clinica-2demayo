import { authFetch } from "../utils/apiClient";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

function getLimaDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getLimaTime() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  return `${hour}:${minute}`;
}

export default function CotizarServicioPage() {
  const { pacienteId, servicioTipo } = useParams();
  const navigate = useNavigate();
  const [tarifas, setTarifas] = useState([]);
  const [paciente, setPaciente] = useState(null);
  const [seleccionados, setSeleccionados] = useState([]);
  const [programacion, setProgramacion] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const tipoNormalizado = String(servicioTipo || "").toLowerCase().trim();
  const titulo = tipoNormalizado ? tipoNormalizado.charAt(0).toUpperCase() + tipoNormalizado.slice(1) : "Servicio";

  useEffect(() => {
    let active = true;
    setLoading(true);

    authFetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const items = (data.tarifas || []).filter((t) => String(t.servicio_tipo || "").toLowerCase() === tipoNormalizado && Number(t.activo || 0) === 1);
        setTarifas(items);
      })
      .catch(() => {
        if (active) setTarifas([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    if (pacienteId) {
      authFetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => res.json())
        .then((data) => {
          if (!active) return;
          if (data?.success && data?.paciente) setPaciente(data.paciente);
        })
        .catch(() => {
          if (active) setPaciente(null);
        });
    }

    return () => {
      active = false;
    };
  }, [pacienteId, tipoNormalizado]);

  useEffect(() => {
    setSeleccionados([]);
    setProgramacion({});
  }, [tipoNormalizado]);

  useEffect(() => {
    const handleQuoteCartCleared = () => {
      setSeleccionados([]);
      setProgramacion({});
    };

    window.addEventListener("quote-cart-cleared", handleQuoteCartCleared);
    return () => window.removeEventListener("quote-cart-cleared", handleQuoteCartCleared);
  }, []);

  const toggleSeleccion = (id) => {
    const nid = Number(id);
    setSeleccionados((sel) => {
      if (sel.includes(nid)) return sel.filter((eid) => eid !== nid);
      return [...sel, nid];
    });
    setProgramacion((prev) => ({
      ...prev,
      [nid]: prev[nid] || { fecha_programada: getLimaDate(), hora_programada: getLimaTime() },
    }));
  };

  const calcularTotal = useMemo(() => {
    return seleccionados.reduce((total, id) => {
      const tarifa = tarifas.find((t) => Number(t.id) === Number(id));
      return total + Number(tarifa?.precio_particular || 0);
    }, 0);
  }, [seleccionados, tarifas]);

  const construirDetalles = () => {
    return seleccionados
      .map((id) => {
        const tarifa = tarifas.find((t) => Number(t.id) === Number(id));
        if (!tarifa) return null;
        const prog = programacion[id] || { fecha_programada: getLimaDate(), hora_programada: getLimaTime() };
        const descripcion = String(tarifa.descripcion || tarifa.nombre || "Servicio").trim();
        return {
          servicio_tipo: tipoNormalizado,
          servicio_id: Number(tarifa.id || 0),
          descripcion,
          cantidad: 1,
          precio_unitario: Number(tarifa.precio_particular || 0),
          subtotal: Number(Number(tarifa.precio_particular || 0).toFixed(2)),
          fecha_programada: String(prog.fecha_programada || "").slice(0, 10),
          hora_programada: String(prog.hora_programada || "").slice(0, 5),
        };
      })
      .filter(Boolean);
  };

  const generarCotizacion = async () => {
    if (!pacienteId) {
      Swal.fire("Atención", "No se encontró el paciente para cotizar.", "info");
      return;
    }
    if (seleccionados.length === 0) {
      Swal.fire("Atención", "Selecciona al menos un ítem.", "info");
      return;
    }

    const detalles = construirDetalles();
    if (detalles.length === 0) {
      Swal.fire("Atención", "No hay detalles válidos para registrar.", "info");
      return;
    }

    const total = detalles.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);

    const confirm = await Swal.fire({
      title: "Registrar cotización",
      text: `${paciente ? `${paciente.nombre || paciente.nombres || ""} ${paciente.apellido || paciente.apellidos || ""}`.trim() : `Paciente #${pacienteId}`} | ${detalles.length} item(s) | Total S/ ${total.toFixed(2)}`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Registrar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    setSaving(true);
    try {
      const res = await authFetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: Number(pacienteId),
          total: Number(total.toFixed(2)),
          detalles,
          observaciones: `Cotización registrada desde cotizador genérico de ${titulo}`,
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo registrar la cotización");
      }

      const cotizacionId = Number(data?.cotizacion_id || 0);
      Swal.fire("Listo", "Cotización registrada correctamente.", "success").then(() => {
        if (cotizacionId > 0) {
          navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${cotizacionId}&modo=editar&back_to=/cotizaciones`, {
            state: { pacienteId: Number(pacienteId), cotizacionId, backTo: "/cotizaciones", modo: "editar" },
          });
          return;
        }
        navigate("/cotizaciones");
      });
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo registrar la cotización", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Cargando tarifas...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-8">
      <div className="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-700 text-white">
          <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.18em] text-emerald-200">Cotizador genérico</div>
              <h2 className="text-2xl md:text-3xl font-bold">Cotización de {titulo}</h2>
            </div>
            <div className="text-sm text-emerald-100">
              {paciente ? `${paciente.nombre || paciente.nombres || ""} ${paciente.apellido || paciente.apellidos || ""}`.trim() : `Paciente #${pacienteId}`}
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          <div>
            <div className="mb-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-1">Paciente</div>
              <div className="text-slate-900 font-medium">
                {paciente ? `${paciente.nombre || paciente.nombres || ""} ${paciente.apellido || paciente.apellidos || ""}`.trim() : `ID ${pacienteId}`}
              </div>
              <div className="text-xs text-slate-500 mt-1">Servicio: {titulo}</div>
            </div>

            <div className="grid gap-3">
              {tarifas.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  No hay tarifas activas para este servicio.
                </div>
              ) : (
                tarifas.map((tarifa) => {
                  const selected = seleccionados.includes(Number(tarifa.id));
                  const prog = programacion[tarifa.id] || { fecha_programada: getLimaDate(), hora_programada: getLimaTime() };
                  return (
                    <div key={tarifa.id} className={`rounded-2xl border p-4 transition-shadow ${selected ? "border-emerald-300 shadow-md bg-emerald-50/40" : "border-slate-200 bg-white hover:shadow-sm"}`}>
                      <div className="flex flex-col md:flex-row md:items-center gap-3">
                        <label className="flex items-start gap-3 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSeleccion(tarifa.id)}
                            className="mt-1 h-4 w-4 accent-emerald-600"
                          />
                          <div>
                            <div className="font-semibold text-slate-900">{tarifa.descripcion || tarifa.nombre || "Servicio"}</div>
                            <div className="text-xs text-slate-500">ID tarifa #{tarifa.id}</div>
                          </div>
                        </label>
                        <div className="text-right font-bold text-emerald-700 text-lg">S/ {Number(tarifa.precio_particular || 0).toFixed(2)}</div>
                      </div>

                      {selected && (
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="text-xs font-semibold text-slate-600">Fecha programada</span>
                            <input
                              type="date"
                              value={prog.fecha_programada}
                              onChange={(e) => setProgramacion((prev) => ({
                                ...prev,
                                [tarifa.id]: {
                                  ...prog,
                                  fecha_programada: e.target.value,
                                },
                              }))}
                              className="rounded-xl border border-slate-300 px-3 py-2"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            <span className="text-xs font-semibold text-slate-600">Hora programada</span>
                            <input
                              type="time"
                              value={prog.hora_programada}
                              onChange={(e) => setProgramacion((prev) => ({
                                ...prev,
                                [tarifa.id]: {
                                  ...prog,
                                  hora_programada: e.target.value,
                                },
                              }))}
                              className="rounded-xl border border-slate-300 px-3 py-2"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-6 h-fit rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Resumen</h3>
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                {seleccionados.length} seleccionado(s)
              </span>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {seleccionados.length === 0 ? (
                <div className="text-sm text-slate-500">Selecciona uno o más ítems para generar la cotización.</div>
              ) : (
                seleccionados.map((id) => {
                  const tarifa = tarifas.find((t) => Number(t.id) === Number(id));
                  if (!tarifa) return null;
                  const prog = programacion[id] || { fecha_programada: getLimaDate(), hora_programada: getLimaTime() };
                  return (
                    <div key={`sel-${id}`} className="rounded-2xl bg-white border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{tarifa.descripcion || tarifa.nombre || "Servicio"}</div>
                          <div className="text-xs text-slate-500">S/ {Number(tarifa.precio_particular || 0).toFixed(2)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSeleccion(tarifa.id)}
                          className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          Quitar
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        Fecha: {prog.fecha_programada || "-"} | Hora: {prog.hora_programada || "-"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Total</span>
                <span className="font-semibold text-slate-900">S/ {Number(calcularTotal || 0).toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={generarCotizacion}
                disabled={saving || seleccionados.length === 0}
                className={`mt-4 w-full rounded-2xl px-4 py-3 font-bold text-white transition-colors ${saving || seleccionados.length === 0 ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
              >
                {saving ? "Registrando..." : "Generar cotización"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
