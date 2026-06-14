import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { authFetch } from "../utils/apiClient";

const SESSION_HISTORY_KEY = "suplencia_pacientes_session_history_v1";
const ACCESS_LABELS = {
  read: "Lectura",
  write: "Escritura",
  full: "Completo",
};

const ACCESS_STYLES = {
  read: "bg-sky-100 text-sky-800 border-sky-200",
  write: "bg-amber-100 text-amber-800 border-amber-200",
  full: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const SECTION_META = {
  motivo_consulta: { label: "Motivo de consulta", short: "MC", tone: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  enfermedad_actual: { label: "Enfermedad actual", short: "EA", tone: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  antecedentes: { label: "Antecedentes", short: "AN", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  diagnosticos: { label: "Diagnósticos", short: "DX", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  plan: { label: "Plan", short: "PL", tone: "bg-violet-100 text-violet-800 border-violet-200" },
  tratamiento: { label: "Tratamiento", short: "TR", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  receta: { label: "Receta", short: "RX", tone: "bg-rose-100 text-rose-800 border-rose-200" },
};

const SECTION_ORDER = [
  "motivo_consulta",
  "enfermedad_actual",
  "antecedentes",
  "diagnosticos",
  "plan",
  "tratamiento",
  "receta",
];

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  try {
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

function doctorLabel(ctx) {
  const n = String(ctx?.source_doctor_nombre || "").trim();
  const a = String(ctx?.source_doctor_apellido || "").trim();
  const e = String(ctx?.source_doctor_especialidad || "").trim();
  const full = `${n} ${a}`.trim();
  return e ? `${full} - ${e}` : full || `ID ${ctx?.source_doctor_id || "?"}`;
}

function pacienteLabel(item) {
  const n = String(item?.paciente_nombre || "").trim();
  const a = String(item?.paciente_apellido || "").trim();
  const dni = String(item?.paciente_dni || "").trim();
  const hc = String(item?.historia_clinica || "").trim();
  const full = `${n} ${a}`.trim();
  const pieces = [full || `Paciente ${item?.paciente_id || ""}`];
  if (dni) pieces.push(`DNI ${dni}`);
  if (hc) pieces.push(`HC ${hc}`);
  return pieces.join(" | ");
}

function getKey(ctx) {
  return `${Number(ctx?.paciente_id || 0)}|${Number(ctx?.source_doctor_id || 0)}|${Number(ctx?.consulta_id || 0)}`;
}

export default function SuplenciaPacientesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [results, setResults] = useState([]);

  const [context, setContext] = useState(null);
  const [hcData, setHcData] = useState(null);
  const [loadingHc, setLoadingHc] = useState(false);
  const [hcError, setHcError] = useState("");

  const [sessionHistory, setSessionHistory] = useState([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSessionHistory(parsed);
      }
    } catch {
      setSessionHistory([]);
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(sessionHistory.slice(0, 20)));
    } catch {
      // no-op for storage quota or private mode limitations.
    }
  }, [sessionHistory]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 3) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const params = new URLSearchParams({
          action: "search_delegated_patients",
          q: query,
          limit: "12",
        });

        const res = await authFetch(`api_continuidad_clinica.php?${params.toString()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "No se pudo buscar pacientes por suplencia");
        }

        if (!cancelled) {
          setResults(Array.isArray(json.data) ? json.data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setResults([]);
        }
        Swal.fire("Error", String(err?.message || err), "error");
      } finally {
        if (!cancelled) {
          setLoadingSearch(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const onSelectPatient = async (candidate) => {
    const pacienteId = Number(candidate?.paciente_id || 0);
    if (pacienteId <= 0) return;

    try {
      const params = new URLSearchParams({
        action: "validate_patient_access",
        paciente_id: String(pacienteId),
        mode: "read",
      });

      const res = await authFetch(`api_continuidad_clinica.php?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.authorized) {
        throw new Error(json?.error || "Acceso denegado para este paciente");
      }

      const ctx = {
        ...(json.data || {}),
        selected_at: new Date().toISOString(),
      };
      setContext(ctx);
      setHcData(null);
      setHcError("");

      setSessionHistory((prev) => {
        const existing = Array.isArray(prev) ? prev : [];
        const next = [ctx, ...existing.filter((x) => getKey(x) !== getKey(ctx))];
        return next.slice(0, 20);
      });

      await loadHistoriaClinica(ctx);
    } catch (err) {
      Swal.fire("Acceso denegado", String(err?.message || err), "warning");
    }
  };

  const loadHistoriaClinica = async (ctx) => {
    const consultaId = Number(ctx?.consulta_id || 0);
    if (consultaId <= 0) {
      setHcData(null);
      setHcError("No se encontro una consulta valida para este paciente.");
      return;
    }

    setLoadingHc(true);
    setHcError("");
    try {
      const noCache = `_t=${Date.now()}`;
      const res = await authFetch(`api_historia_clinica.php?consulta_id=${consultaId}&${noCache}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || "No se pudo cargar la historia clinica");
      }

      // El endpoint puede responder success=false cuando no existe HC todavia, pero igual retorna metadata util.
      setHcData({
        success: !!json?.success,
        error: String(json?.error || ""),
        consulta_id: Number(json?.consulta_id || consultaId),
        hc_id: Number(json?.hc_id || 0),
        fecha_registro: String(json?.fecha_registro || ""),
        datos: json?.datos && typeof json.datos === "object" ? json.datos : {},
      });
    } catch (err) {
      setHcData(null);
      setHcError(String(err?.message || err));
    } finally {
      setLoadingHc(false);
    }
  };

  const datosPreview = useMemo(() => {
    if (!hcData?.datos || typeof hcData.datos !== "object") return [];
    const source = hcData.datos;
    const keys = [...SECTION_ORDER];

    const rows = [];
    keys.forEach((key) => {
      if (!(key in source)) return;
      const value = source[key];
      if (value === null || value === undefined || value === "") return;
      rows.push({ key, value });
    });

    return rows;
  }, [hcData]);

  const sectionLabel = (key) => {
    return SECTION_META[key]?.label || key.replaceAll("_", " ");
  };

  const sectionShort = (key) => SECTION_META[key]?.short || "HC";

  const sectionTone = (key) => SECTION_META[key]?.tone || "bg-slate-100 text-slate-700 border-slate-200";

  const renderScalarValue = (value) => {
    if (value === null || value === undefined || value === "") {
      return "Sin información registrada";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value, null, 2);
  };

  const renderDiagnosticos = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
      return <p className="text-sm text-slate-500">Sin diagnósticos registrados.</p>;
    }

    return (
      <div className="space-y-2">
        {value.map((diag, idx) => {
          if (typeof diag === "string") {
            return (
              <div key={`diag-${idx}`} className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700">
                {diag}
              </div>
            );
          }

          const codigo = String(diag?.codigo || "").trim();
          const nombre = String(diag?.nombre || "").trim();
          const tipo = String(diag?.tipo || "").trim();
          const descripcion = String(diag?.descripcion || "").trim();

          return (
            <div key={`diag-${idx}`} className="rounded-md border border-slate-200 px-2 py-2">
              <div className="text-sm font-semibold text-slate-800">
                {codigo ? `${codigo} - ` : ""}{nombre || "Diagnóstico"}
              </div>
              {(tipo || descripcion) && (
                <div className="text-xs text-slate-600 mt-1">
                  {tipo ? `Tipo: ${tipo}` : ""}{tipo && descripcion ? " | " : ""}{descripcion}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderReceta = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
      return <p className="text-sm text-slate-500">Sin medicamentos registrados.</p>;
    }

    return (
      <div className="space-y-2">
        {value.map((item, idx) => {
          if (typeof item === "string") {
            return (
              <div key={`rx-${idx}`} className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700">
                {item}
              </div>
            );
          }

          const nombre = String(item?.nombre || item?.medicamento || "").trim();
          const dosis = String(item?.dosis || "").trim();
          const frecuencia = String(item?.frecuencia || "").trim();
          const duracion = String(item?.duracion || "").trim();

          return (
            <div key={`rx-${idx}`} className="rounded-md border border-slate-200 px-2 py-2">
              <div className="text-sm font-semibold text-slate-800">{nombre || "Medicamento"}</div>
              <div className="text-xs text-slate-600 mt-1">
                {dosis ? `Dosis: ${dosis}` : "Dosis: -"} | {frecuencia ? `Frecuencia: ${frecuencia}` : "Frecuencia: -"} | {duracion ? `Duración: ${duracion}` : "Duración: -"}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSectionValue = (key, value) => {
    if (key === "diagnosticos") return renderDiagnosticos(value);
    if (key === "receta") return renderReceta(value);

    const text = renderScalarValue(value);
    return <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap break-words">{text}</div>;
  };

  const resumenClinico = useMemo(() => {
    if (!hcData?.datos || typeof hcData.datos !== "object") return [];

    const source = hcData.datos;
    const getText = (value) => {
      if (typeof value === "string") return value.trim();
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return "";
    };

    const motivo = getText(source.motivo_consulta);
    const enfermedad = getText(source.enfermedad_actual);
    const dxCount = Array.isArray(source.diagnosticos) ? source.diagnosticos.length : 0;
    const rxCount = Array.isArray(source.receta) ? source.receta.length : 0;

    const items = [];
    if (motivo) items.push({ label: "Motivo", value: motivo });
    if (enfermedad) items.push({ label: "Enfermedad actual", value: enfermedad });
    if (dxCount > 0) items.push({ label: "Diagnósticos", value: `${dxCount} registrado(s)` });
    if (rxCount > 0) items.push({ label: "Medicamentos", value: `${rxCount} indicado(s)` });
    return items;
  }, [hcData]);

  const openFullHc = () => {
    const pacienteId = Number(context?.paciente_id || 0);
    const consultaId = Number(context?.consulta_id || 0);
    if (pacienteId <= 0 || consultaId <= 0) {
      return;
    }

    navigate(`/historia-clinica/${pacienteId}/${consultaId}?from_suplencia=1&back_to=/suplencia-pacientes`, {
      state: {
        continuidad: {
          source_doctor_id: Number(context?.source_doctor_id || 0),
          source_doctor_nombre: String(context?.source_doctor_nombre || ""),
          source_doctor_apellido: String(context?.source_doctor_apellido || ""),
          source_doctor_especialidad: String(context?.source_doctor_especialidad || ""),
          access_type: String(context?.access_type || ""),
          expires_at: String(context?.expires_at || ""),
          delegation_id: Number(context?.delegation_id || 0),
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Pacientes por Suplencia</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vista exclusiva para busqueda bajo demanda. No mezcla pacientes delegados en Mis Consultas.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">Buscador inteligente por suplencia</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido, DNI o HC"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <p className="text-xs text-slate-500">Escribe al menos 3 caracteres para iniciar la busqueda.</p>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-3 py-2 text-sm font-semibold bg-slate-50 border-b border-slate-200">
              Resultados {loadingSearch ? "(buscando...)" : `(${results.length})`}
            </div>
            <div className="max-h-72 overflow-auto">
              {results.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-500">No hay resultados para mostrar.</div>
              ) : (
                results.map((item) => (
                  <button
                    key={getKey(item)}
                    type="button"
                    onClick={() => onSelectPatient(item)}
                    className="w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-cyan-50"
                  >
                    <div className="font-medium text-slate-800">{pacienteLabel(item)}</div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                      <span>Suplencia de: {doctorLabel(item)}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${ACCESS_STYLES[String(item?.access_type || "")] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                        {ACCESS_LABELS[String(item?.access_type || "")] || String(item?.access_type || "-")}
                      </span>
                      <span>Vigente hasta: {formatDateTime(item?.expires_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Historial de sesion</h2>
            <button
              type="button"
              onClick={() => setSessionHistory([])}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
            >
              Limpiar
            </button>
          </div>

          <div className="max-h-80 overflow-auto space-y-2">
            {sessionHistory.length === 0 ? (
              <div className="text-sm text-slate-500">Aun no has validado pacientes en esta sesion.</div>
            ) : (
              sessionHistory.map((item) => (
                <button
                  key={`history-${getKey(item)}`}
                  type="button"
                  onClick={() => {
                    setContext(item);
                    loadHistoriaClinica(item);
                  }}
                  className="w-full text-left rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
                >
                  <div className="text-sm font-medium text-slate-800">{pacienteLabel(item)}</div>
                  <div className="text-xs text-slate-500 mt-1">{doctorLabel(item)}</div>
                  <div className="text-xs text-slate-400 mt-1">{formatDateTime(item?.selected_at)}</div>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Historia clinica en contexto de suplencia</h2>

        {!context ? (
          <div className="text-sm text-slate-500">Selecciona un paciente del buscador para validar acceso y cargar su historia clinica.</div>
        ) : (
          <>
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
              Atendiendo por suplencia de Dr(a). {doctorLabel(context)} | Acceso: {ACCESS_LABELS[String(context?.access_type || "")] || String(context?.access_type || "-")} | Vigente hasta: {formatDateTime(context?.expires_at)}
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-semibold text-slate-800">Paciente</div>
              <div className="text-sm text-slate-600 mt-1">{pacienteLabel(context)}</div>
              <div className="text-xs text-slate-500 mt-1">Consulta de referencia: #{Number(context?.consulta_id || 0)}</div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={openFullHc}
                  className="rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold px-3 py-2"
                >
                  Abrir HC completa
                </button>
              </div>
            </div>

            {loadingHc ? (
              <div className="text-sm text-slate-500">Cargando historia clinica...</div>
            ) : hcError ? (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{hcError}</div>
            ) : !hcData ? (
              <div className="text-sm text-slate-500">No hay datos de historia clinica para mostrar.</div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-slate-500">
                  HC ID: {hcData.hc_id > 0 ? hcData.hc_id : "(sin HC registrada)"} | Fecha registro: {hcData.fecha_registro ? formatDateTime(hcData.fecha_registro) : "-"}
                </div>

                {hcData.success ? (
                  <div className="space-y-3">
                    {resumenClinico.length > 0 && (
                      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Resumen rápido</div>
                        <div className="mt-2 grid grid-cols-1 gap-2">
                          {resumenClinico.map((item, idx) => (
                            <div key={`resumen-${idx}`} className="text-sm text-cyan-900">
                              <span className="font-semibold">{item.label}: </span>
                              <span>{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {datosPreview.length === 0 ? (
                      <div className="text-sm text-slate-500 xl:col-span-2">La HC existe, pero no tiene campos principales para previsualizar.</div>
                    ) : (
                      datosPreview.map((row) => (
                        <div key={row.key} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex min-w-8 justify-center rounded-md border px-2 py-1 text-[11px] font-bold ${sectionTone(row.key)}`}>
                              {sectionShort(row.key)}
                            </span>
                            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">{sectionLabel(row.key)}</div>
                          </div>
                          {renderSectionValue(row.key, row.value)}
                        </div>
                      ))
                    )}
                  </div>
                  </div>
                ) : (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="font-semibold">Esta consulta aun no tiene historia clinica registrada.</p>
                    <p className="mt-1">
                      Puedes usar <strong>Abrir HC completa</strong> para iniciar el registro clinico en contexto de suplencia.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
