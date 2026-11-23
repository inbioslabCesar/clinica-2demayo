import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  actualizarGrupoMaestroExamenOcupacional,
  eliminarGrupoMaestroExamenOcupacional,
  guardarGrupoMaestroExamenOcupacional,
  listarCatalogoGruposExamenOcupacional,
  listarGruposMaestroExamenOcupacional,
} from "../../api/ocupacionalApi";

const initialForm = {
  id: 0,
  nivel: "grupo",
  nombre: "",
  parent_id: "",
};

function getDetalleErrorGrupo(err, fallback) {
  const status = Number(err?.status || 0);
  const code = String(err?.payload?.error_code || "").trim().toUpperCase();
  const data = err?.payload?.data || {};
  const base = err?.message || fallback;

  if (status !== 409) {
    return base;
  }

  if (code === "NOMBRE_DUPLICADO_MISMO_NIVEL") {
    return "Ya existe otro registro con la misma descripcion en el mismo nivel y grupo padre. Cambie la descripcion o el grupo padre.";
  }

  if (code === "GRUPO_TIENE_SUBGRUPOS_ACTIVOS") {
    const total = Number(data?.subgrupos_activos || 0);
    return total > 0
      ? `No se puede aplicar la accion porque el grupo tiene ${total} subgrupo(s) activo(s). Primero inactiva o reubica esos subgrupos.`
      : "No se puede aplicar la accion porque el grupo aun tiene subgrupos activos.";
  }

  if (code === "GRUPO_EN_USO") {
    const total = Number(data?.examenes_relacionados || 0);
    return total > 0
      ? `No se puede inactivar: el grupo esta asociado a ${total} examen(es). Reasigna esos examenes antes de inactivar.`
      : "No se puede inactivar: el grupo esta asociado a examenes existentes.";
  }

  if (code === "SUBGRUPO_EN_USO") {
    const total = Number(data?.examenes_relacionados || 0);
    return total > 0
      ? `No se puede inactivar: el subgrupo esta asociado a ${total} examen(es). Reasigna esos examenes antes de inactivar.`
      : "No se puede inactivar: el subgrupo esta asociado a examenes existentes.";
  }

  return base;
}

export default function GruposExamenesOcupacionalesPage() {
  const [estado, setEstado] = useState("activo");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMsg, setSavingMsg] = useState("");
  const [deletingId, setDeletingId] = useState(0);

  const [catalogoGrupos, setCatalogoGrupos] = useState([]);
  const [catalogoModo, setCatalogoModo] = useState("legacy_texto");
  const [form, setForm] = useState(initialForm);

  const requestRef = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const cargarCatalogo = useCallback(async () => {
    try {
      const data = await listarCatalogoGruposExamenOcupacional();
      const modo = String(data?.modo || "legacy_texto");
      setCatalogoModo(modo);
      const grupos = Array.isArray(data?.grupos) ? data.grupos : [];
      if (modo === "maestro") {
        setCatalogoGrupos(grupos);
      } else {
        setCatalogoGrupos(
          grupos.map((nombre, idx) => ({ id: idx + 1, nombre: String(nombre || "") })).filter((g) => g.nombre !== "")
        );
      }
    } catch {
      setCatalogoModo("legacy_texto");
      setCatalogoGrupos([]);
    }
  }, []);

  const cargarRows = useCallback(async () => {
    const reqId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarGruposMaestroExamenOcupacional({
        estado,
        q: qDebounced,
        page,
        perPage,
      });
      if (reqId !== requestRef.current) return;
      setRows(payload.data || []);
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
    } catch (err) {
      if (reqId !== requestRef.current) return;
      setRows([]);
      setMeta({ page: 1, per_page: perPage, total: 0, total_pages: 0 });
      setError(err.message || "No se pudo cargar grupos y subgrupos");
    } finally {
      if (reqId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [estado, qDebounced, page, perPage]);

  useEffect(() => {
    cargarCatalogo();
  }, [cargarCatalogo]);

  useEffect(() => {
    cargarRows();
  }, [cargarRows]);

  const gruposPadre = useMemo(
    () => catalogoGrupos.filter((g) => Number(g.id) > 0),
    [catalogoGrupos]
  );

  const isEditing = Number(form.id || 0) > 0;

  const resetForm = () => {
    setForm(initialForm);
    setSavingMsg("");
    setError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSavingMsg("");

    const nombre = String(form.nombre || "").trim();
    const nivel = String(form.nivel || "grupo");
    const parentId = Number(form.parent_id || 0);

    if (nombre === "") {
      setError("La descripcion es obligatoria");
      return;
    }
    if (nivel === "subgrupo" && parentId <= 0) {
      setError("Seleccione grupo padre para subgrupo");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await actualizarGrupoMaestroExamenOcupacional({
          id: Number(form.id),
          nivel,
          nombre,
          parentId,
        });
        setSavingMsg("Registro actualizado correctamente");
      } else {
        await guardarGrupoMaestroExamenOcupacional({
          nivel,
          nombre,
          parentId,
        });
        setSavingMsg("Registro creado correctamente");
      }

      resetForm();
      await cargarCatalogo();
      await cargarRows();
    } catch (err) {
      setError(getDetalleErrorGrupo(err, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setForm({
      id: Number(row.id || 0),
      nivel: Number(row.parent_id || 0) === 0 ? "grupo" : "subgrupo",
      nombre: String(row.nombre || ""),
      parent_id: Number(row.parent_id || 0) > 0 ? String(row.parent_id) : "",
    });
    setSavingMsg("");
    setError("");
  };

  const onDelete = async (row) => {
    const id = Number(row?.id || 0);
    if (id <= 0) return;
    if (!window.confirm("Desea inactivar este registro?")) return;

    setDeletingId(id);
    setError("");
    setSavingMsg("");
    try {
      await eliminarGrupoMaestroExamenOcupacional(id);
      setSavingMsg("Registro inactivado correctamente");
      if (Number(form.id || 0) === id) {
        resetForm();
      }
      await cargarCatalogo();
      await cargarRows();
    } catch (err) {
      setError(getDetalleErrorGrupo(err, "No se pudo inactivar"));
    } finally {
      setDeletingId(0);
    }
  };

  const totalPages = Number(meta.total_pages || 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Grupo Examenes</h1>
        <p className="text-sm text-slate-600 mt-1">
          Administra grupos y subgrupos del maestro ocupacional, con paridad funcional del sistema legado.
        </p>
        {catalogoModo !== "maestro" ? (
          <p className="text-xs text-amber-700 mt-1">
            Modo compatibilidad activo. Para administracion completa ejecute la migracion del maestro de grupos.
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Formulario</h2>

        <form className="grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={onSubmit}>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.nivel}
            onChange={(e) => setForm((prev) => ({ ...prev, nivel: e.target.value, parent_id: e.target.value === "grupo" ? "" : prev.parent_id }))}
          >
            <option value="grupo">GRUPO</option>
            <option value="subgrupo">SUB GRUPO</option>
          </select>

          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Descripcion"
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            maxLength={100}
          />

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.parent_id}
            onChange={(e) => setForm((prev) => ({ ...prev, parent_id: e.target.value }))}
            disabled={form.nivel !== "subgrupo"}
          >
            <option value="">Seleccione grupo</option>
            {gruposPadre.map((g) => (
              <option key={g.id} value={g.id}>{g.nombre}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Guardando..." : isEditing ? "Actualizar" : "Guardar"}
            </button>
            {isEditing ? (
              <button
                type="button"
                className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={resetForm}
              >
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        {savingMsg ? <p className="text-sm text-emerald-700">{savingMsg}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar por descripcion, grupo o tipo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
          >
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
            <option value="todos">Todos</option>
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando...</p> : null}

        <div className="overflow-x-auto hidden md:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3">Descripcion</th>
                <th className="py-2 pr-3">Grupo</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Accion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{(page - 1) * perPage + idx + 1}</td>
                  <td className="py-2 pr-3">{row.tipo}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-700">{row.nombre}</td>
                  <td className="py-2 pr-3">{row.grupo_padre || ""}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${row.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {row.estado}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        onClick={() => onEdit(row)}
                      >
                        Editar
                      </button>
                      {row.estado === "activo" ? (
                        <button
                          type="button"
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          onClick={() => onDelete(row)}
                          disabled={deletingId === Number(row.id)}
                        >
                          {deletingId === Number(row.id) ? "Inactivando..." : "Inactivar"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={6}>No hay registros para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-800">{row.nombre}</p>
              <p className="text-xs text-slate-600">{row.tipo} {row.grupo_padre ? `| ${row.grupo_padre}` : ""}</p>
              <p className="text-xs text-slate-600">Estado: {row.estado}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => onEdit(row)}
                >
                  Editar
                </button>
                {row.estado === "activo" ? (
                  <button
                    type="button"
                    className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => onDelete(row)}
                    disabled={deletingId === Number(row.id)}
                  >
                    {deletingId === Number(row.id) ? "Inactivando..." : "Inactivar"}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 ? <p className="text-sm text-slate-500">No hay registros para mostrar.</p> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Total: {meta.total || 0} registros</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span className="text-xs text-slate-600">Pag. {page}/{Math.max(1, totalPages)}</span>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
