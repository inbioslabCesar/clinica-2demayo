import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cambiarEstadoTipoEvaluacionOcupacional,
  guardarTipoEvaluacionOcupacional,
  listarTiposEvaluacionOcupacionalGestion,
} from "../../api/ocupacionalApi";

const EMPTY_FORM = {
  id: 0,
  codigo: "",
  nombre: "",
  orden: "0",
  estado: "activo",
};

function sanitizeCodigo(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 20);
}

export default function TiposEvaluacionOcupacionalesPage() {
  const [tipos, setTipos] = useState([]);
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const cargarTipos = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listarTiposEvaluacionOcupacionalGestion({ estado: estadoFiltro });
      setTipos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudo cargar tipos de evaluacion");
    } finally {
      setLoading(false);
    }
  }, [estadoFiltro]);

  useEffect(() => {
    cargarTipos();
  }, [cargarTipos]);

  const rows = useMemo(() => {
    const term = String(q || "").trim().toLowerCase();
    if (!term) return tipos;
    return tipos.filter((t) => {
      const codigo = String(t.codigo || "").toLowerCase();
      const nombre = String(t.nombre || "").toLowerCase();
      return codigo.includes(term) || nombre.includes(term);
    });
  }, [tipos, q]);

  const onEdit = (row) => {
    setForm({
      id: Number(row.id || 0),
      codigo: String(row.codigo || ""),
      nombre: String(row.nombre || ""),
      orden: String(Number(row.orden || 0)),
      estado: String(row.estado || "activo"),
    });
    setError("");
    setMsg("");
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
  };

  const onSave = async (e) => {
    e.preventDefault();
    const codigo = sanitizeCodigo(form.codigo);
    const nombre = String(form.nombre || "").trim();
    const orden = Number(form.orden || 0);

    if (!codigo || codigo.length < 2) {
      setError("Codigo invalido. Minimo 2 caracteres A-Z, 0-9 o _");
      return;
    }
    if (!nombre) {
      setError("Nombre es obligatorio");
      return;
    }
    if (!Number.isFinite(orden) || orden < 0 || orden > 9999) {
      setError("Orden invalido");
      return;
    }

    setSaving(true);
    setError("");
    setMsg("");
    try {
      await guardarTipoEvaluacionOcupacional({
        id: form.id ? Number(form.id) : undefined,
        codigo,
        nombre,
        orden,
        estado: form.estado,
      });
      setMsg(form.id ? "Tipo actualizado" : "Tipo creado");
      resetForm();
      await cargarTipos();
    } catch (err) {
      setError(err.message || "No se pudo guardar el tipo");
    } finally {
      setSaving(false);
    }
  };

  const onToggleEstado = async (row) => {
    const nextEstado = String(row.estado || "activo") === "activo" ? "inactivo" : "activo";
    const ok = window.confirm(
      nextEstado === "inactivo"
        ? "Desea inactivar este tipo de evaluacion?"
        : "Desea reactivar este tipo de evaluacion?"
    );
    if (!ok) return;

    setError("");
    setMsg("");
    try {
      await cambiarEstadoTipoEvaluacionOcupacional({ id: row.id, estado: nextEstado });
      setMsg(nextEstado === "activo" ? "Tipo reactivado" : "Tipo inactivado");
      await cargarTipos();
    } catch (err) {
      setError(err.message || "No se pudo cambiar estado");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Tipos de Evaluacion</h1>
        <p className="text-sm text-slate-600 mt-1">
          Estos tipos definen las columnas dinamicas de Protocolos y se usan en Ordenes (ej: PRE, PER, POST).
        </p>
      </div>

      <form onSubmit={onSave} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">{form.id ? "Editar tipo" : "Nuevo tipo"}</h2>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Codigo (ej: PRE)"
            value={form.codigo}
            onChange={(e) => setForm((prev) => ({ ...prev, codigo: sanitizeCodigo(e.target.value) }))}
            maxLength={20}
          />
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2"
            placeholder="Nombre (ej: PRE OCUPACIONAL)"
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            maxLength={80}
          />
          <input
            type="number"
            min={0}
            max={9999}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Orden"
            value={form.orden}
            onChange={(e) => setForm((prev) => ({ ...prev, orden: e.target.value }))}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.estado}
            onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : form.id ? "Actualizar tipo" : "Crear tipo"}
          </button>
          {form.id ? (
            <button
              type="button"
              className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={resetForm}
            >
              Cancelar edicion
            </button>
          ) : null}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar por codigo o nombre"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
          >
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando tipos...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">Codigo</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Orden</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{row.codigo}</td>
                  <td className="py-2 pr-3">{row.nombre}</td>
                  <td className="py-2 pr-3">{row.orden}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${row.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                      {row.estado}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        onClick={() => onEdit(row)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`rounded px-2 py-1 text-xs font-semibold text-white ${row.estado === "activo" ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                        onClick={() => onToggleEstado(row)}
                      >
                        {row.estado === "activo" ? "Inactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5}>No hay tipos para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
