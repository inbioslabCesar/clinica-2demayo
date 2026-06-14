import { useCallback, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { authFetch } from "../utils/apiClient";

const ACCESS_TYPES = ["read", "write", "full"];
const STATUS_OPTIONS = ["", "active", "suspended", "expired", "revoked"];

const ACCESS_LABELS = {
  read: "Lectura",
  write: "Escritura",
  full: "Completo",
};

const STATUS_LABELS = {
  active: "Activa",
  suspended: "Suspendida",
  expired: "Expirada",
  revoked: "Revocada",
};

function isoToInputDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(" ", "T");
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized;
}

function inputDateTimeToSql(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return `${raw.replace("T", " ")}:00`;
}

function doctorLabel(doctor) {
  if (!doctor || !doctor.id) return "";
  const nombre = String(doctor.nombre || "").trim();
  const apellido = String(doctor.apellido || "").trim();
  const especialidad = String(doctor.especialidad || "").trim();
  const fullName = `${nombre} ${apellido}`.trim();
  if (especialidad) {
    return `${fullName || "Médico"} - ${especialidad}`;
  }
  return fullName || `Médico #${doctor.id}`;
}

function searchDoctors(doctors, query, excludeId = 0, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  const out = [];
  for (const doc of doctors) {
    const id = Number(doc.id || 0);
    if (id <= 0 || id === Number(excludeId || 0)) continue;
    if (!q) {
      out.push(doc);
    } else {
      const haystack = `${doc.id} ${doc.nombre || ""} ${doc.apellido || ""} ${doc.especialidad || ""}`.toLowerCase();
      if (haystack.includes(q)) {
        out.push(doc);
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}

export default function ContinuidadClinicaPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [doctorFilterSearch, setDoctorFilterSearch] = useState("");
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [sourceDoctorSearch, setSourceDoctorSearch] = useState("");
  const [targetDoctorSearch, setTargetDoctorSearch] = useState("");

  const [form, setForm] = useState({
    source_doctor_id: "",
    target_doctor_id: "",
    access_type: "read",
    starts_at: "",
    expires_at: "",
    reason: "",
  });

  const doctorsById = useMemo(() => {
    const map = new Map();
    doctors.forEach((doc) => {
      map.set(Number(doc.id), doc);
    });
    return map;
  }, [doctors]);

  const sourceSuggestions = useMemo(
    () => searchDoctors(doctors, sourceDoctorSearch, Number(form.target_doctor_id || 0)),
    [doctors, sourceDoctorSearch, form.target_doctor_id]
  );

  const targetSuggestions = useMemo(
    () => searchDoctors(doctors, targetDoctorSearch, Number(form.source_doctor_id || 0)),
    [doctors, targetDoctorSearch, form.source_doctor_id]
  );

  const doctorFilterSuggestions = useMemo(
    () => searchDoctors(doctors, doctorFilterSearch, 0, 10),
    [doctors, doctorFilterSearch]
  );

  const loadDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const res = await authFetch("api_medicos.php");
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudo cargar médicos");
      }
      const parsed = Array.isArray(json.medicos)
        ? json.medicos
            .map((item) => ({
              id: Number(item.id || 0),
              nombre: String(item.nombre || "").trim(),
              apellido: String(item.apellido || "").trim(),
              especialidad: String(item.especialidad || "").trim(),
            }))
            .filter((item) => item.id > 0)
        : [];
      setDoctors(parsed);
    } catch {
      setDoctors([]);
    } finally {
      setDoctorsLoading(false);
    }
  }, []);

  const loadDelegations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "list_delegations" });
      if (statusFilter) params.set("status", statusFilter);
      if (String(doctorFilter || "").trim()) {
        params.set("doctor_id", String(parseInt(doctorFilter, 10) || 0));
      }

      const res = await authFetch(`api_continuidad_clinica.php?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudo listar suplencias");
      }

      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setRows([]);
      Swal.fire("Error", String(err?.message || err), "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, doctorFilter]);

  useEffect(() => {
    loadDelegations();
  }, [loadDelegations]);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const onCreateDelegation = async (event) => {
    event.preventDefault();

    const sourceId = parseInt(form.source_doctor_id, 10) || 0;
    const targetId = parseInt(form.target_doctor_id, 10) || 0;

    if (sourceId <= 0 || targetId <= 0) {
      Swal.fire("Dato faltante", "Debe ingresar medico origen y medico suplente", "warning");
      return;
    }

    if (sourceId === targetId) {
      Swal.fire("Validación", "El medico origen y el suplente no pueden ser el mismo", "warning");
      return;
    }

    if (!form.starts_at || !form.expires_at) {
      Swal.fire("Dato faltante", "Debe ingresar fecha inicio y fecha fin", "warning");
      return;
    }

    const payload = {
      source_doctor_id: sourceId,
      target_doctor_id: targetId,
      access_type: form.access_type,
      starts_at: inputDateTimeToSql(form.starts_at),
      expires_at: inputDateTimeToSql(form.expires_at),
      reason: String(form.reason || "").trim(),
    };

    setSaving(true);
    try {
      const res = await authFetch("api_continuidad_clinica.php?action=create_delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudo registrar suplencia");
      }

      Swal.fire("Registrado", "Suplencia creada correctamente", "success");
      setForm((prev) => ({
        ...prev,
        source_doctor_id: "",
        target_doctor_id: "",
        starts_at: "",
        expires_at: "",
        reason: "",
      }));
      setSourceDoctorSearch("");
      setTargetDoctorSearch("");
      loadDelegations();
    } catch (err) {
      Swal.fire("Error", String(err?.message || err), "error");
    } finally {
      setSaving(false);
    }
  };

  const onRevoke = async (delegationId) => {
    const id = parseInt(delegationId, 10) || 0;
    if (id <= 0) return;

    const confirm = await Swal.fire({
      title: "Revocar suplencia",
      text: `Se revocará la suplencia #${id}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Revocar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await authFetch("api_continuidad_clinica.php?action=revoke_delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delegation_id: id }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "No se pudo revocar suplencia");
      }

      Swal.fire("Actualizado", "Suplencia revocada", "success");
      loadDelegations();
    } catch (err) {
      Swal.fire("Error", String(err?.message || err), "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Continuidad Médica</h1>
        <p className="text-sm text-slate-500 mt-1">
          Gestión de suplencias temporales entre médicos (FASE 1).
        </p>
      </div>

      <form onSubmit={onCreateDelegation} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Registrar suplencia</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Médico origen</label>
            <input
              type="text"
              value={sourceDoctorSearch}
              onChange={(e) => {
                const value = e.target.value;
                setSourceDoctorSearch(value);
                setForm((prev) => ({ ...prev, source_doctor_id: "" }));
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Buscar por nombre, apellido o especialidad"
              required
            />
            <input type="hidden" value={form.source_doctor_id} />
            {sourceDoctorSearch.trim() !== "" && !form.source_doctor_id && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {sourceSuggestions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No se encontraron médicos</div>
                ) : (
                  sourceSuggestions.map((doc) => (
                    <button
                      key={`src-${doc.id}`}
                      type="button"
                      onMouseDown={() => {
                        setForm((prev) => ({ ...prev, source_doctor_id: String(doc.id) }));
                        setSourceDoctorSearch(doctorLabel(doc));
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-cyan-50"
                    >
                      {doctorLabel(doc)}
                    </button>
                  ))
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {form.source_doctor_id ? `Seleccionado: ID ${form.source_doctor_id}` : "Selecciona un médico de la lista"}
            </p>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Médico suplente</label>
            <input
              type="text"
              value={targetDoctorSearch}
              onChange={(e) => {
                const value = e.target.value;
                setTargetDoctorSearch(value);
                setForm((prev) => ({ ...prev, target_doctor_id: "" }));
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Buscar por nombre, apellido o especialidad"
              required
            />
            <input type="hidden" value={form.target_doctor_id} />
            {targetDoctorSearch.trim() !== "" && !form.target_doctor_id && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {targetSuggestions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No se encontraron médicos</div>
                ) : (
                  targetSuggestions.map((doc) => (
                    <button
                      key={`target-${doc.id}`}
                      type="button"
                      onMouseDown={() => {
                        setForm((prev) => ({ ...prev, target_doctor_id: String(doc.id) }));
                        setTargetDoctorSearch(doctorLabel(doc));
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-cyan-50"
                    >
                      {doctorLabel(doc)}
                    </button>
                  ))
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {form.target_doctor_id ? `Seleccionado: ID ${form.target_doctor_id}` : "Selecciona un médico de la lista"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de acceso</label>
            <select
              value={form.access_type}
              onChange={(e) => setForm((prev) => ({ ...prev, access_type: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {ACCESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCESS_LABELS[type] || type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Inicio</label>
            <input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fin</label>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(e) => setForm((prev) => ({ ...prev, expires_at: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 min-h-[90px]"
              placeholder="Motivo de la suplencia (opcional)"
            />
          </div>
        </div>

        <div className="flex justify-end">
          {doctorsLoading && <span className="mr-3 self-center text-xs text-slate-500">Cargando médicos...</span>}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white px-4 py-2 font-semibold"
          >
            {saving ? "Guardando..." : "Registrar suplencia"}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Suplencias registradas</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status || "all"} value={status}>
                  {status ? `Estado: ${STATUS_LABELS[status] || status}` : "Todos los estados"}
                </option>
              ))}
            </select>
            <div className="relative">
              <input
                type="text"
                value={doctorFilterSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setDoctorFilterSearch(value);
                  setDoctorFilter("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 w-full"
                placeholder="Filtrar por médico"
              />
              {doctorFilterSearch.trim() !== "" && !doctorFilter && (
                <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {doctorFilterSuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500">No se encontraron médicos</div>
                  ) : (
                    doctorFilterSuggestions.map((doc) => (
                      <button
                        key={`filter-${doc.id}`}
                        type="button"
                        onMouseDown={() => {
                          setDoctorFilter(String(doc.id));
                          setDoctorFilterSearch(doctorLabel(doc));
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-cyan-50"
                      >
                        {doctorLabel(doc)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={loadDelegations}
              disabled={loading}
              className="rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white px-3 py-2 font-medium"
            >
              {loading ? "Cargando..." : "Actualizar"}
            </button>
          </div>
        </div>

        {doctorFilter && (
          <div className="text-xs text-slate-500">
            Filtro aplicado por médico: ID {doctorFilter}. Escribe de nuevo para cambiarlo.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Origen</th>
                <th className="py-2 pr-3">Suplente</th>
                <th className="py-2 pr-3">Acceso</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Inicio</th>
                <th className="py-2 pr-3">Fin</th>
                <th className="py-2 pr-3">Motivo</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={9}>
                    {loading ? "Cargando suplencias..." : "No hay suplencias registradas"}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isRevoked = String(row.status) === "revoked";
                  const sourceDoctor = doctorsById.get(Number(row.source_doctor_id || 0));
                  const targetDoctor = doctorsById.get(Number(row.target_doctor_id || 0));
                  return (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{row.id}</td>
                      <td className="py-2 pr-3">{sourceDoctor ? doctorLabel(sourceDoctor) : row.source_doctor_id}</td>
                      <td className="py-2 pr-3">{targetDoctor ? doctorLabel(targetDoctor) : row.target_doctor_id}</td>
                      <td className="py-2 pr-3">{ACCESS_LABELS[row.access_type] || row.access_type}</td>
                      <td className="py-2 pr-3">{STATUS_LABELS[row.status] || row.status}</td>
                      <td className="py-2 pr-3">{isoToInputDateTime(row.starts_at).replace("T", " ")}</td>
                      <td className="py-2 pr-3">{isoToInputDateTime(row.expires_at).replace("T", " ")}</td>
                      <td className="py-2 pr-3 max-w-[240px]">{row.reason || "-"}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => onRevoke(row.id)}
                          disabled={isRevoked}
                          className="rounded-md px-2.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white"
                        >
                          {isRevoked ? "Revocada" : "Revocar"}
                        </button>
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
