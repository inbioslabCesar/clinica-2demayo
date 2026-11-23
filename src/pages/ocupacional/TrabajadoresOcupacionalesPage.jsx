import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  actualizarTrabajadorOcupacional,
  anularTrabajadorOcupacional,
  darBajaTrabajadorOcupacional,
  listarCatalogosLaboralesEmpresa,
  listarEmpresasOcupacionales,
  listarTrabajadoresOcupacionalesPaginado,
} from "../../api/ocupacionalApi";
import FormTrabajador from "./FormTrabajador";

export default function TrabajadoresOcupacionalesPage() {
  const [searchParams] = useSearchParams();
  const empresaIdDesdeRuta = Number(searchParams.get("empresa_id") || 0);
  const context = String(searchParams.get("context") || "").toLowerCase();
  const [estado, setEstado] = useState("todos");
  const [empresaId, setEmpresaId] = useState(0);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("fecha_ingreso");
  const [sortDir, setSortDir] = useState("desc");
  const [empresas, setEmpresas] = useState([]);
  const [meta, setMeta] = useState({ page: 1, per_page: 20, total: 0, total_pages: 0 });
  const [trabajadores, setTrabajadores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [editAreas, setEditAreas] = useState([]);
  const [editPuestos, setEditPuestos] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const requestRef = useRef(0);
  const hydratedEmpresaRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;

    async function loadEmpresas() {
      try {
        const rows = await listarEmpresasOcupacionales({ estado: "todos" });
        if (!cancelled) {
          setEmpresas(rows || []);
        }
      } catch {
        if (!cancelled) {
          setEmpresas([]);
        }
      }
    }

    loadEmpresas();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydratedEmpresaRef.current || empresas.length === 0) {
      return;
    }

    const existe = (id) => empresas.some((e) => Number(e.id) === Number(id));

    let empresaInicial = 0;
    if (empresaIdDesdeRuta > 0 && existe(empresaIdDesdeRuta)) {
      empresaInicial = empresaIdDesdeRuta;
    }

    setEmpresaId(empresaInicial);

    hydratedEmpresaRef.current = true;
  }, [empresas, empresaIdDesdeRuta]);

  const loadTrabajadores = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarTrabajadoresOcupacionalesPaginado({
        estado,
        empresaId,
        q: qDebounced,
        page,
        perPage,
        sortBy,
        sortDir,
      });
      if (requestId !== requestRef.current) {
        return;
      }
      setTrabajadores(payload.data || []);
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err.message || "No se pudo cargar trabajadores");
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [estado, empresaId, qDebounced, page, perPage, sortBy, sortDir]);

  useEffect(() => {
    loadTrabajadores();
  }, [loadTrabajadores]);

  const onBaja = async (id) => {
    if (!window.confirm("¿Desea dar de baja a este trabajador?")) return;
    try {
      await darBajaTrabajadorOcupacional(id);
      await loadTrabajadores();
    } catch (err) {
      setError(err.message || "No se pudo dar de baja al trabajador");
    }
  };

  const abrirEdicion = async (item) => {
    setError("");
    try {
      const [areas, puestos] = await Promise.all([
        listarCatalogosLaboralesEmpresa({ empresaId: item.empresa_id, tipo: "area", estado: "activo" }),
        listarCatalogosLaboralesEmpresa({ empresaId: item.empresa_id, tipo: "puesto", estado: "activo" }),
      ]);
      setEditAreas(areas || []);
      setEditPuestos(puestos || []);
      setEditing({ ...item });
    } catch (err) {
      setError(err.message || "No se pudieron cargar los catálogos para editar");
    }
  };

  const guardarEdicion = async (event) => {
    event.preventDefault();
    setEditSaving(true);
    setError("");
    try {
      await actualizarTrabajadorOcupacional({
        id: editing.id,
        puestoTrabajo: editing.puesto_trabajo,
        areaRiesgo: editing.area_riesgo,
        fechaIngreso: editing.fecha_ingreso,
      });
      setEditing(null);
      await loadTrabajadores();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el trabajador");
    } finally {
      setEditSaving(false);
    }
  };

  const onAnular = async (item) => {
    const motivo = window.prompt("Motivo de anulación (obligatorio):", "Registro creado por error");
    if (motivo === null) return;
    if (motivo.trim().length < 5) {
      setError("Ingrese un motivo de anulación de al menos 5 caracteres");
      return;
    }
    if (!window.confirm(`¿Anular el registro del documento ${item.documento_numero}? Esta acción quedará auditada.`)) return;
    setError("");
    try {
      await anularTrabajadorOcupacional({ id: item.id, motivo });
      await loadTrabajadores();
    } catch (err) {
      setError(err.message || "No se pudo anular el registro");
    }
  };

  const handleCreated = (registered) => {
    const registeredEmpresaId = Number(registered?.empresa_id || 0);
    setPage(1);
    setEstado("todos");
    setQ("");
    if (registeredEmpresaId > 0 && registeredEmpresaId !== empresaId) {
      setEmpresaId(registeredEmpresaId);
      return;
    }
    loadTrabajadores();
  };

  const totalPages = Number(meta.total_pages || 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Trabajadores</h1>
        <p className="text-sm text-slate-600 mt-1">Busque identidad en clinica y registre el contexto laboral por empresa.</p>
        {context === "areas" ? (
          <p className="text-xs text-emerald-700 mt-1">Contexto desde Empresa: revisando gestión de áreas por empresa.</p>
        ) : null}
        {context === "puestos" ? (
          <p className="text-xs text-cyan-700 mt-1">Contexto desde Empresa: revisando gestión de puestos por empresa.</p>
        ) : null}
      </div>
      <FormTrabajador onCreated={handleCreated} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Listado de Trabajadores</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2 lg:col-span-1"
              placeholder="Buscar por trabajador, documento, empresa o puesto"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={0}>Todas las empresas</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.razon_social}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setPage(1);
              }}
            >
              <option value="todos">Todos</option>
              <option value="activo">Activos</option>
              <option value="retirado">Retirados</option>
              <option value="anulado">Anulados</option>
            </select>
            <div className="flex gap-2">
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="fecha_ingreso">Fecha ingreso</option>
                <option value="documento_numero">Documento</option>
                <option value="empresa">Empresa</option>
                <option value="created_at">Creación</option>
              </select>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={sortDir}
                onChange={(e) => {
                  setSortDir(e.target.value);
                  setPage(1);
                }}
              >
                <option value="asc">↑</option>
                <option value="desc">↓</option>
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
          </div>
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando trabajadores...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">Trabajador</th>
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Empresa</th>
                <th className="py-2 pr-3">Puesto</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Ingreso</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {trabajadores.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <div className="min-w-[12rem] font-semibold text-slate-800">{item.nombre_completo || "Identidad no disponible"}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="whitespace-nowrap">{item.documento_tipo || "DOC"} {item.documento_numero}</span>
                  </td>
                  <td className="py-2 pr-3">{item.empresa}</td>
                  <td className="py-2 pr-3">{item.puesto_trabajo}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${item.estado_laboral === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>
                      {item.estado_laboral}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{item.fecha_ingreso}</td>
                  <td className="py-2 pr-3">
                    {item.estado_laboral !== "anulado" ? (
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEdicion(item)}
                          className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Editar
                        </button>
                        {item.estado_laboral === "activo" ? (
                      <button
                        type="button"
                        onClick={() => onBaja(item.id)}
                        className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Dar baja
                      </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onAnular(item)}
                          className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Anular
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Sin acciones</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && trabajadores.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>No hay trabajadores para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
            <span className="text-xs text-slate-600">Pág. {page}/{Math.max(1, totalPages)}</span>
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

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <form onSubmit={guardarEdicion} className="w-full max-w-xl space-y-4 rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Editar datos laborales</h2>
                <p className="text-sm text-slate-500">{editing.nombre_completo || editing.documento_numero} · {editing.empresa}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="text-2xl leading-none text-slate-500" aria-label="Cerrar">×</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Puesto
                <select required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={editing.puesto_trabajo} onChange={(e) => setEditing((prev) => ({ ...prev, puesto_trabajo: e.target.value }))}>
                  {!editPuestos.some((row) => row.nombre === editing.puesto_trabajo) ? <option value={editing.puesto_trabajo}>{editing.puesto_trabajo}</option> : null}
                  {editPuestos.map((row) => <option key={row.id} value={row.nombre}>{row.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Área
                <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={editing.area_riesgo || ""} onChange={(e) => setEditing((prev) => ({ ...prev, area_riesgo: e.target.value }))}>
                  <option value="">Sin área</option>
                  {editing.area_riesgo && !editAreas.some((row) => row.nombre === editing.area_riesgo) ? <option value={editing.area_riesgo}>{editing.area_riesgo}</option> : null}
                  {editAreas.map((row) => <option key={row.id} value={row.nombre}>{row.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Fecha de ingreso
                <input required type="date" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" value={editing.fecha_ingreso || ""} onChange={(e) => setEditing((prev) => ({ ...prev, fecha_ingreso: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
              <button type="submit" disabled={editSaving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">{editSaving ? "Guardando..." : "Guardar cambios"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
