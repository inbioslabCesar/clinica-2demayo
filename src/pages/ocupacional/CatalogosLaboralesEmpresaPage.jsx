import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  cambiarEstadoCatalogoLaboralEmpresa,
  guardarCatalogoLaboralEmpresa,
  listarCatalogosLaboralesEmpresa,
  listarEmpresasOcupacionales,
} from "../../api/ocupacionalApi";

const TIPOS = {
  area: { singular: "Área", plural: "Áreas" },
  puesto: { singular: "Puesto", plural: "Puestos" },
};

export default function CatalogosLaboralesEmpresaPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tipoParam = String(searchParams.get("tipo") || searchParams.get("context") || "area").toLowerCase();
  const tipo = TIPOS[tipoParam] ? tipoParam : "area";
  const empresaParam = Number(searchParams.get("empresa_id") || 0);
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(empresaParam);
  const [estado, setEstado] = useState("todos");
  const [rows, setRows] = useState([]);
  const [nombre, setNombre] = useState("");
  const [editingId, setEditingId] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    listarEmpresasOcupacionales({ estado: "todos" })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setEmpresas(list);
        if (!empresaId && list.length) setEmpresaId(Number(list[0].id));
      })
      .catch((err) => setError(err.message || "No se pudieron cargar las empresas"));
  }, [empresaId]);

  const cargar = useCallback(async () => {
    if (!empresaId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await listarCatalogosLaboralesEmpresa({ empresaId, tipo, estado });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || `No se pudieron cargar ${TIPOS[tipo].plural.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [empresaId, estado, tipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? rows.filter((row) => String(row.nombre || "").toLowerCase().includes(term)) : rows;
  }, [q, rows]);

  const resetForm = () => {
    setNombre("");
    setEditingId(0);
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (!empresaId || !nombre.trim()) {
      setError(`Seleccione empresa e ingrese ${TIPOS[tipo].singular.toLowerCase()}`);
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await guardarCatalogoLaboralEmpresa({ id: editingId || undefined, empresaId, tipo, nombre });
      setMessage(editingId ? `${TIPOS[tipo].singular} actualizado` : `${TIPOS[tipo].singular} creado`);
      resetForm();
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (row) => {
    const next = row.estado === "activo" ? "inactivo" : "activo";
    if (!window.confirm(`¿Desea ${next === "activo" ? "reactivar" : "inactivar"} ${row.nombre}?`)) return;
    setError("");
    try {
      await cambiarEstadoCatalogoLaboralEmpresa({ id: row.id, estado: next });
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo cambiar el estado");
    }
  };

  const cambiarTipo = (nextTipo) => {
    resetForm();
    const params = new URLSearchParams(searchParams);
    params.set("tipo", nextTipo);
    setSearchParams(params);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Catálogos laborales por empresa</h1>
        <p className="mt-1 text-sm text-slate-600">Configure primero las áreas y puestos que luego usarán los trabajadores.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={empresaId}
            onChange={(event) => {
              const nextEmpresaId = Number(event.target.value || 0);
              setEmpresaId(nextEmpresaId);
              const params = new URLSearchParams(searchParams);
              if (nextEmpresaId) params.set("empresa_id", String(nextEmpresaId));
              setSearchParams(params, { replace: true });
              resetForm();
            }}
          >
            <option value={0}>Seleccione empresa</option>
            {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.razon_social}</option>)}
          </select>
          <div className="inline-flex rounded-md border border-slate-300 p-1" aria-label="Tipo de catálogo">
            {Object.entries(TIPOS).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => cambiarTipo(key)}
                className={`px-4 py-1.5 text-sm font-semibold ${tipo === key ? "rounded bg-cyan-600 text-white" : "text-slate-600"}`}
              >
                {value.plural}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={guardar} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={`Nombre de ${TIPOS[tipo].singular.toLowerCase()}`}
            value={nombre}
            maxLength={180}
            onChange={(event) => setNombre(event.target.value)}
          />
          <button type="submit" disabled={saving || !empresaId} className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-400">
            {saving ? "Guardando..." : editingId ? "Actualizar" : `Agregar ${TIPOS[tipo].singular.toLowerCase()}`}
          </button>
          {editingId ? <button type="button" onClick={resetForm} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button> : null}
        </form>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={`Buscar ${TIPOS[tipo].plural.toLowerCase()}`} value={q} onChange={(event) => setQ(event.target.value)} />
          <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={estado} onChange={(event) => setEstado(event.target.value)}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
        {loading ? <p className="text-sm text-slate-500">Cargando...</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b text-left text-slate-500"><th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">Estado</th><th className="py-2 pr-3">Acciones</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.nombre}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-1 text-xs ${row.estado === "activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"}`}>{row.estado}</span></td>
                  <td className="py-2 pr-3"><div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setEditingId(Number(row.id)); setNombre(row.nombre); }} className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">Editar</button>
                    <button type="button" onClick={() => cambiarEstado(row)} className={`rounded px-3 py-1 text-xs font-semibold text-white ${row.estado === "activo" ? "bg-amber-600" : "bg-emerald-600"}`}>{row.estado === "activo" ? "Inactivar" : "Reactivar"}</button>
                  </div></td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 ? <tr><td colSpan={3} className="py-4 text-slate-500">No hay registros para mostrar.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}