import React, { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../utils/apiClient";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

function normalizeHHMM(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [hh = "00", mm = "00"] = raw.split(":");
  return `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}`;
}

function formatDateLimaYMD(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "0000";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function normalizeDateYMD(value) {
  return String(value || "").trim().slice(0, 10);
}

function isConsultaActiva(estado) {
  const e = String(estado || "").trim().toLowerCase();
  return e !== "cancelada" && e !== "completada";
}

function getMonthDateRange(date) {
  const base = date instanceof Date ? date : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    from: formatDateLimaYMD(start),
    to: formatDateLimaYMD(end),
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
  };
}

function toMinutesHHMM(value) {
  const normalized = normalizeHHMM(value);
  if (!normalized) return -1;
  const [hhRaw = "0", mmRaw = "0"] = normalized.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
  return hh * 60 + mm;
}

function DisponibilidadMedicos({ refreshKey = 0 }) {
  const [medicos, setMedicos] = useState([]);
  const [consultas, setConsultas] = useState([]);
  const [disponibilidad, setDisponibilidad] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);

  const monthRange = useMemo(() => getMonthDateRange(selectedDate), [selectedDate]);

  const colorPalette = [
    "#22c55e",
    "#3b82f6",
    "#f59e42",
    "#e11d48",
    "#a21caf",
    "#facc15",
    "#0ea5e9",
    "#14b8a6",
    "#6366f1",
    "#f472b6",
  ];

  const medicosSafe = Array.isArray(medicos) ? medicos : [];
  const medicoColors = useMemo(
    () =>
      medicosSafe.reduce((acc, m, i) => {
        acc[m.id] = colorPalette[i % colorPalette.length];
        return acc;
      }, {}),
    [medicosSafe]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [medicosRes, disponibilidadRes, consultasRes] = await Promise.all([
          authFetch("api_medicos.php", { cache: "no-store" }).then((r) => r.json()),
          authFetch(
            `api_disponibilidad_medicos.php?fecha_desde=${encodeURIComponent(monthRange.from)}&fecha_hasta=${encodeURIComponent(monthRange.to)}&_t=${refreshKey}`,
            { cache: "no-store" }
          ).then((r) => r.json()),
          authFetch(
            `api_consultas.php?solo_activas=1&vista=disponibilidad&fecha_desde=${encodeURIComponent(monthRange.from)}&fecha_hasta=${encodeURIComponent(monthRange.to)}&_t=${refreshKey}`,
            { cache: "no-store" }
          ).then((r) => r.json()),
        ]);

        if (cancelled) return;
        setMedicos(Array.isArray(medicosRes?.medicos) ? medicosRes.medicos : []);
        setDisponibilidad(Array.isArray(disponibilidadRes?.disponibilidad) ? disponibilidadRes.disponibilidad : []);
        setConsultas(Array.isArray(consultasRes?.consultas) ? consultasRes.consultas : []);
      } catch {
        if (cancelled) return;
        setMedicos([]);
        setDisponibilidad([]);
        setConsultas([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, monthRange.key, monthRange.from, monthRange.to]);

  const disponibilidadPorFecha = useMemo(() => {
    const mapa = {};
    (Array.isArray(disponibilidad) ? disponibilidad : []).forEach((bloque) => {
      const fechaBloque = normalizeDateYMD(bloque?.fecha);
      if (fechaBloque) {
        if (!mapa[fechaBloque]) mapa[fechaBloque] = [];
        mapa[fechaBloque].push(bloque);
      }
    });
    return mapa;
  }, [disponibilidad]);

  const disponibilidadRecurrentePorDia = useMemo(() => {
    const mapa = {};
    (Array.isArray(disponibilidad) ? disponibilidad : []).forEach((bloque) => {
      const dia = String(bloque?.dia_semana || "").trim().toLowerCase();
      const fecha = normalizeDateYMD(bloque?.fecha);
      if (!fecha && dia) {
        if (!mapa[dia]) mapa[dia] = [];
        mapa[dia].push(bloque);
      }
    });
    return mapa;
  }, [disponibilidad]);

  const consultasPorMedicoFecha = useMemo(() => {
    const index = new Map();
    (Array.isArray(consultas) ? consultas : []).forEach((c) => {
      if (!isConsultaActiva(c?.estado)) return;
      const medicoId = Number(c?.medico_id || 0);
      const fecha = normalizeDateYMD(c?.fecha);
      const min = toMinutesHHMM(c?.hora);
      if (medicoId <= 0 || !fecha || min < 0) return;
      const key = `${medicoId}|${fecha}`;
      const list = index.get(key) || [];
      list.push(min);
      index.set(key, list);
    });

    index.forEach((arr, key) => {
      arr.sort((a, b) => a - b);
      index.set(key, arr);
    });
    return index;
  }, [consultas]);

  const countConsultasEnBloque = (medicoId, fechaYMD, horaInicio, horaFin) => {
    const key = `${Number(medicoId || 0)}|${String(fechaYMD || "")}`;
    const arr = consultasPorMedicoFecha.get(key) || [];
    if (arr.length === 0) return 0;

    const start = toMinutesHHMM(horaInicio);
    const end = toMinutesHHMM(horaFin);
    if (start < 0 || end < 0 || end <= start) return 0;

    let count = 0;
    for (let i = 0; i < arr.length; i += 1) {
      const minute = arr[i];
      if (minute >= end) break;
      if (minute >= start) count += 1;
    }
    return count;
  };

  function getBloquesParaFecha(date) {
    const yyyyMMdd = formatDateLimaYMD(date);
    const bloquesFecha = disponibilidadPorFecha[yyyyMMdd] || [];
    if (bloquesFecha.length > 0) {
      return bloquesFecha;
    }
    const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const dia = dias[date.getDay()];
    return disponibilidadRecurrentePorDia[dia] || [];
  }

  const bloquesHoy = getBloquesParaFecha(selectedDate);
  const texto = busqueda.trim().toLowerCase();

  const bloquesPagina = useMemo(() => {
    if (!texto) return bloquesHoy;
    return (Array.isArray(disponibilidad) ? disponibilidad : []).filter((b) => {
      const medico = medicosSafe.find((m) => m.id == b.medico_id);
      if (!medico) return false;
      return (
        (medico.nombre && medico.nombre.toLowerCase().includes(texto)) ||
        (medico.especialidad && medico.especialidad.toLowerCase().includes(texto))
      );
    });
  }, [texto, bloquesHoy, disponibilidad, medicosSafe]);

  return (
    <div className="mb-6 w-full">
      <h3 className="font-extrabold text-xl mb-4 text-center text-blue-700 tracking-tight">Disponibilidad de Médicos</h3>
      <div className="flex flex-col md:flex-row gap-5 mb-4 items-start justify-center w-full">
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl shadow-lg border border-blue-200 p-3 md:p-4 flex flex-col items-center w-full max-w-[320px] md:max-w-[360px]">
          <Calendar
            onChange={setSelectedDate}
            value={selectedDate}
            className="border rounded-xl shadow text-base md:text-lg w-[280px] h-[340px] md:w-[330px] md:h-[390px] bg-white"
            tileContent={({ date, view }) => {
              if (view !== "month") return null;
              const bloques = getBloquesParaFecha(date);
              if (!bloques.length) return null;
              const medicosUnicos = [...new Set(bloques.map((b) => b.medico_id))];
              return (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 2 }}>
                  {medicosUnicos.map((medicoId, i) => (
                    <span
                      key={medicoId}
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: medicoColors[medicoId] || "#888",
                        marginLeft: i > 0 ? 2 : 0,
                      }}
                    />
                  ))}
                </div>
              );
            }}
          />
        </div>

        <div className="flex-1 w-full min-w-0">
          <div className="flex justify-end mb-3">
            <input
              type="text"
              placeholder="Buscar por nombre o especialidad..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="border-2 border-blue-200 rounded-full px-4 py-2 shadow focus:ring-2 focus:ring-blue-300 w-full max-w-sm text-base"
            />
          </div>
          {loading ? (
            <div className="text-center text-blue-600 font-semibold">Cargando...</div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-xl shadow border border-gray-200" style={{ maxHeight: "clamp(240px, 44vh, 360px)", minHeight: 120 }}>
              <table className="min-w-full text-[12px] md:text-base border-separate border-spacing-y-1">
                <thead className="bg-blue-50">
                  <tr>
                    <th className="px-2 py-2 text-blue-700 font-bold rounded-tl-xl">Médico</th>
                    <th className="px-2 py-2 text-blue-700 font-bold">Especialidad</th>
                    <th className="px-2 py-2 text-blue-700 font-bold">Horario</th>
                    <th className="px-2 py-2 text-blue-700 font-bold rounded-tr-xl">Cupos libres</th>
                  </tr>
                </thead>
                <tbody>
                  {bloquesPagina.map((bloque, i) => {
                    const medico = medicosSafe.find((m) => m.id == bloque.medico_id);
                    if (!medico) return null;

                    const fechaBloque = normalizeDateYMD(bloque?.fecha);
                    const etiquetaFecha = fechaBloque || bloque?.dia_semana || "";

                    const horaIni = String(bloque.hora_inicio || "00:00").split(":").map(Number);
                    const horaFin = String(bloque.hora_fin || "00:00").split(":").map(Number);
                    let slots = 0;
                    let h = horaIni[0] || 0;
                    let m = horaIni[1] || 0;
                    const hFin = horaFin[0] || 0;
                    const mFin = horaFin[1] || 0;
                    while (h < hFin || (h === hFin && m < mFin)) {
                      slots += 1;
                      m += 30;
                      if (m >= 60) {
                        h += 1;
                        m = 0;
                      }
                    }

                    const horaInicio = normalizeHHMM(bloque.hora_inicio);
                    const horaFinNorm = normalizeHHMM(bloque.hora_fin);
                    const ocupadas = fechaBloque
                      ? countConsultasEnBloque(medico.id, fechaBloque, horaInicio, horaFinNorm)
                      : 0;
                    const cupos = Math.max(0, slots - ocupadas);

                    return (
                      <tr key={`${bloque.medico_id}-${bloque.id || i}`} className={cupos > 0 ? "bg-green-50" : "bg-yellow-100"}>
                        <td className="px-2 py-2 font-bold rounded-l-xl" style={{ color: medicoColors[medico.id] || undefined }}>
                          {(medico.abreviatura_profesional || "Dr(a).")}
                          {" "}
                          {medico.nombre}
                          {" "}
                          {medico.apellido || ""}
                        </td>
                        <td className="px-2 py-2">{medico.especialidad}</td>
                        <td className="px-2 py-2">
                          {bloque.hora_inicio}
                          {" - "}
                          {bloque.hora_fin}
                          {etiquetaFecha ? <span className="text-xs text-gray-500 ml-1">({etiquetaFecha})</span> : null}
                        </td>
                        <td className="px-2 py-2 font-bold rounded-r-xl">{cupos > 0 ? cupos : <span className="text-red-600">Sin cupos</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DisponibilidadMedicos;
