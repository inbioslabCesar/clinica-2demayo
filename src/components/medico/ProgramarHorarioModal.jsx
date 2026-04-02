import { useState, useEffect } from "react";
import { BASE_URL } from "../../config/config";
import Swal from "sweetalert2";
import { formatProfesionalName } from "../../utils/profesionalDisplay";

const DIAS = [
  { label: "Dom", full: "Domingo", value: 0 },
  { label: "Lun", full: "Lunes", value: 1 },
  { label: "Mar", full: "Martes", value: 2 },
  { label: "Mié", full: "Miércoles", value: 3 },
  { label: "Jue", full: "Jueves", value: 4 },
  { label: "Vie", full: "Viernes", value: 5 },
  { label: "Sáb", full: "Sábado", value: 6 },
];

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

export default function ProgramarHorarioModal({ medico, onClose, onGuardado }) {
  const hoy = new Date();
  const [anio, setAnio]         = useState(hoy.getFullYear());
  const [mes, setMes]           = useState(hoy.getMonth() + 1); // 1-12
  const buildWeeklyConfig = (diasActivos = [1, 2, 3, 4, 5], horaInicio = "08:00", horaFin = "12:00") => {
    const config = {};
    DIAS.forEach((d) => {
      config[d.value] = {
        activo: diasActivos.includes(d.value),
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      };
    });
    return config;
  };
  const [bloquesSemana, setBloquesSemana] = useState(() => buildWeeklyConfig());
  const [loading, setLoading]   = useState(false);
  const [bloques, setBloques]   = useState([]);
  const [loadingBloques, setLoadingBloques] = useState(false);

  // Cargar bloques existentes del mes seleccionado
  useEffect(() => {
    if (!medico?.id) return;
    setLoadingBloques(true);
    const mesStr = String(mes).padStart(2, "0");
    fetch(`${BASE_URL}api_disponibilidad_medicos.php?medico_id=${medico.id}`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        const prefix = `${anio}-${mesStr}`;
        setBloques((data.disponibilidad || []).filter(b => String(b.fecha || "").startsWith(prefix)));
      })
      .catch(() => setBloques([]))
      .finally(() => setLoadingBloques(false));
  }, [medico?.id, mes, anio]);

  const setDiaActivo = (dia, activo) => {
    setBloquesSemana((prev) => ({
      ...prev,
      [dia]: {
        ...(prev[dia] || { hora_inicio: "08:00", hora_fin: "12:00" }),
        activo,
      },
    }));
  };

  const setDiaHora = (dia, campo, valor) => {
    setBloquesSemana((prev) => ({
      ...prev,
      [dia]: {
        ...(prev[dia] || { activo: true, hora_inicio: "08:00", hora_fin: "12:00" }),
        [campo]: valor,
      },
    }));
  };

  const seleccionarTodos = () => setBloquesSemana(buildWeeklyConfig([0, 1, 2, 3, 4, 5, 6]));
  const seleccionarLaborables = () => setBloquesSemana(buildWeeklyConfig([1, 2, 3, 4, 5]));
  const limpiarDias = () => setBloquesSemana(buildWeeklyConfig([]));

  const handleProgramar = async () => {
    const diasActivos = Object.entries(bloquesSemana)
      .filter(([, cfg]) => Boolean(cfg?.activo))
      .map(([dia]) => Number(dia));

    if (diasActivos.length === 0) {
      Swal.fire({ icon: "warning", title: "Activa al menos un día de la semana", timer: 2200, showConfirmButton: false });
      return;
    }

    for (const d of diasActivos) {
      const cfg = bloquesSemana[d] || {};
      const hi = String(cfg.hora_inicio || "").trim();
      const hf = String(cfg.hora_fin || "").trim();
      if (!hi || !hf || hi >= hf) {
        const diaNombre = DIAS.find((x) => x.value === d)?.full || `Día ${d}`;
        Swal.fire({
          icon: "warning",
          title: `Horario inválido en ${diaNombre}`,
          text: "La hora inicio debe ser menor que la hora fin.",
          timer: 2600,
          showConfirmButton: false,
        });
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}api_disponibilidad_medicos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accion: "programar_mes",
          medico_id: medico.id,
          anio,
          mes,
          bloques_semana: bloquesSemana,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: "success", title: data.mensaje || "Horario programado", timer: 2500, showConfirmButton: false });
        // Recargar bloques
        const mesStr = String(mes).padStart(2, "0");
        const res2 = await fetch(`${BASE_URL}api_disponibilidad_medicos.php?medico_id=${medico.id}`, { credentials: "include" });
        const data2 = await res2.json();
        const prefix = `${anio}-${mesStr}`;
        setBloques((data2.disponibilidad || []).filter(b => String(b.fecha || "").startsWith(prefix)));
        onGuardado?.();
      } else {
        Swal.fire({ icon: "error", title: data.error || "Error al programar", timer: 3000, showConfirmButton: false });
      }
    } catch {
      Swal.fire({ icon: "error", title: "Error de conexión", timer: 2000, showConfirmButton: false });
    }
    setLoading(false);
  };

  const handleLimpiarMes = async () => {
    const conf = await Swal.fire({
      title: `¿Eliminar todos los bloques de ${MESES[mes-1]} ${anio}?`,
      text: `Se eliminarán ${bloques.length} bloque(s) de disponibilidad.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!conf.isConfirmed) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}api_disponibilidad_medicos.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accion: "limpiar_mes", medico_id: medico.id, anio, mes }),
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({ icon: "success", title: `${data.eliminados} bloques eliminados`, timer: 2000, showConfirmButton: false });
        setBloques([]);
        onGuardado?.();
      } else {
        Swal.fire({ icon: "error", title: "Error al limpiar", timer: 2000, showConfirmButton: false });
      }
    } catch {
      Swal.fire({ icon: "error", title: "Error de conexión", timer: 2000, showConfirmButton: false });
    }
    setLoading(false);
  };

  const calcularHorasRango = (horaInicio, horaFin) => {
    if (!horaInicio || !horaFin) return 0;
    const [hI, mI] = String(horaInicio).split(":").map(Number);
    const [hF, mF] = String(horaFin).split(":").map(Number);
    return Math.max(0, (hF * 60 + mF - (hI * 60 + mI)) / 60);
  };
  const diasActivos = DIAS.filter((d) => bloquesSemana[d.value]?.activo);
  const horasSemanales = +diasActivos
    .reduce((acc, d) => {
      const cfg = bloquesSemana[d.value] || {};
      return acc + calcularHorasRango(cfg.hora_inicio, cfg.hora_fin);
    }, 0)
    .toFixed(2);
  const horasMes = +bloques
    .reduce((acc, b) => acc + calcularHorasRango(b.hora_inicio, b.hora_fin), 0)
    .toFixed(2);
  const diasUnicos = new Set(bloques.map((b) => b.fecha)).size;
  const montoHora   = parseFloat(medico?.monto_hora || 0);
  const totalMes    = montoHora > 0 ? +(horasMes * montoHora).toFixed(2) : null;
  // Agrupar bloques por fecha para lista compacta
  const bloquesPorFecha = bloques.reduce((acc, b) => {
    if (!acc[b.fecha]) acc[b.fecha] = [];
    acc[b.fecha].push(b);
    return acc;
  }, {});
  const fechasOrdenadas = Object.keys(bloquesPorFecha).sort();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Programar horario mensual</h2>
            <p className="text-sm text-gray-500">
              {formatProfesionalName(medico || {})}
              {medico?.modalidad_pago === "hora" && montoHora > 0 && (
                <span className="ml-2 text-xs text-indigo-600 font-medium">
                  S/ {montoHora.toFixed(2)}/hr
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Mes / año */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Mes</label>
              <select
                value={mes}
                onChange={e => setMes(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
              >
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Año</label>
              <select
                value={anio}
                onChange={e => setAnio(Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
              >
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Días de la semana */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">Horario semanal (por día)</label>
              <div className="flex gap-2">
                <button onClick={seleccionarLaborables} className="text-xs text-blue-600 underline">Lun–Vie</button>
                <button onClick={seleccionarTodos} className="text-xs text-blue-600 underline">Todos</button>
                <button onClick={limpiarDias} className="text-xs text-red-500 underline">Ninguno</button>
              </div>
            </div>
            <div className="space-y-2">
              {DIAS.map(d => (
                <div
                  key={d.value}
                  className={`grid grid-cols-12 gap-2 items-center border rounded-lg px-2 py-2 ${
                    bloquesSemana[d.value]?.activo ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <label className="col-span-4 sm:col-span-3 flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={Boolean(bloquesSemana[d.value]?.activo)}
                      onChange={(e) => setDiaActivo(d.value, e.target.checked)}
                    />
                    <span>{d.full}</span>
                  </label>
                  <div className="col-span-4 sm:col-span-4">
                    <input
                      type="time"
                      value={bloquesSemana[d.value]?.hora_inicio || "08:00"}
                      onChange={(e) => setDiaHora(d.value, "hora_inicio", e.target.value)}
                      disabled={!bloquesSemana[d.value]?.activo}
                      className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-4">
                    <input
                      type="time"
                      value={bloquesSemana[d.value]?.hora_fin || "12:00"}
                      onChange={(e) => setDiaHora(d.value, "hora_fin", e.target.value)}
                      disabled={!bloquesSemana[d.value]?.activo}
                      className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-1 text-right text-xs text-gray-500">
                    {bloquesSemana[d.value]?.activo
                      ? `${calcularHorasRango(bloquesSemana[d.value]?.hora_inicio, bloquesSemana[d.value]?.hora_fin).toFixed(1)} h`
                      : "-"}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-indigo-600">
              {diasActivos.length} día(s) activo(s) · {horasSemanales.toFixed(2)} horas por semana
              {montoHora > 0 && ` · S/ ${(horasSemanales * montoHora).toFixed(2)} por semana`}
            </p>
          </div>

          {/* Botón programar */}
          <button
            onClick={handleProgramar}
            disabled={loading || diasActivos.length === 0}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-lg text-sm transition-colors"
          >
            {loading ? "Programando..." : `Programar ${MESES[mes-1]} ${anio}`}
          </button>

          {/* Resumen del mes */}
          <div className="border rounded-xl p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700">
                Bloques programados — {MESES[mes-1]} {anio}
                {loadingBloques && <span className="ml-2 text-xs text-gray-400">cargando...</span>}
              </h3>
              {bloques.length > 0 && (
                <button
                  onClick={handleLimpiarMes}
                  disabled={loading}
                  className="text-xs text-red-600 underline"
                >
                  Limpiar mes
                </button>
              )}
            </div>

            {bloques.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Sin bloques para este mes</p>
            ) : (
              <>
                {/* Estadística */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center bg-white rounded-lg p-2 border">
                    <p className="text-xs text-gray-500">Días</p>
                    <p className="text-base font-bold text-gray-700">{diasUnicos}</p>
                  </div>
                  <div className="text-center bg-white rounded-lg p-2 border">
                    <p className="text-xs text-gray-500">Horas</p>
                    <p className="text-base font-bold text-indigo-600">{horasMes}</p>
                  </div>
                  {totalMes !== null && (
                    <div className="text-center bg-white rounded-lg p-2 border">
                      <p className="text-xs text-gray-500">Total mes</p>
                      <p className="text-base font-bold text-green-600">S/ {totalMes.toFixed(2)}</p>
                    </div>
                  )}
                </div>

                {/* Lista compacta agrupada por fecha */}
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {fechasOrdenadas.map((fecha) => (
                    <div key={fecha} className="bg-white border rounded px-2 py-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-700">{fecha}</span>
                        <div className="flex flex-col items-end gap-0.5">
                          {bloquesPorFecha[fecha].map((b) => (
                            <span key={b.id} className="text-gray-500">
                              {String(b.hora_inicio).slice(0, 5)} – {String(b.hora_fin).slice(0, 5)}
                              <span className="ml-1 text-indigo-500">
                                ({calcularHorasRango(b.hora_inicio, b.hora_fin).toFixed(1)}h)
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
