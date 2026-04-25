import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

const SOURCE_TYPES = [
  { value: "consulta", label: "Consulta" },
  { value: "ecografia", label: "Ecografia" },
  { value: "rayosx", label: "Rayos X" },
  { value: "procedimiento", label: "Procedimiento" },
  { value: "operacion", label: "Operacion" },
  { value: "laboratorio", label: "Laboratorio" },
  { value: "farmacia", label: "Farmacia" },
];

const ESTADOS = ["borrador", "activo", "inactivo", "archivado"];

const EMPTY_FORM = {
  id: 0,
  codigo: "",
  nombre: "",
  descripcion: "",
  tipo: "paquete",
  estado: "activo",
  precio_global_venta: "",
  modo_precio: "fijo_global",
  vigencia_desde: "",
  vigencia_hasta: "",
  items: [],
};

const EMPTY_ITEM = {
  source_type: "consulta",
  source_id: "",
  medico_id: "",
  medico_nombre_snapshot: "",
  descripcion_snapshot: "",
  cantidad: 1,
  precio_lista_snapshot: "",
  subtotal_snapshot: 0,
  es_derivado: false,
  laboratorio_referencia: "",
  tipo_derivacion: "",
  valor_derivacion: "",
  honorario_regla: {
    modo_honorario: "usar_configuracion_medico",
    monto_fijo_medico: "",
    porcentaje_medico: "",
    observaciones: "",
  },
};

function normalizeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function recalcItem(item) {
  const cantidad = normalizeNumber(item.cantidad);
  const precio = normalizeNumber(item.precio_lista_snapshot);
  return {
    ...item,
    cantidad,
    precio_lista_snapshot: precio,
    subtotal_snapshot: +(cantidad * precio).toFixed(2),
  };
}

export default function PaquetesPerfilesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaWarning, setSchemaWarning] = useState(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editorOpen, setEditorOpen] = useState(false);
  const [itemDraft, setItemDraft] = useState(EMPTY_ITEM);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogResults, setCatalogResults] = useState([]);
  const [vigenciaIndefinida, setVigenciaIndefinida] = useState(true);
  const editorRef = useRef(null);

  const openEditor = useCallback(() => {
    setEditorOpen(true);
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (q.trim()) params.set("q", q.trim());
      if (estado) params.set("estado", estado);

      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total || 0));
      if (data?.schema_ready === false) {
        setSchemaWarning({
          message: data?.warning || "Flujo de perfiles no instalado.",
          missingTables: Array.isArray(data?.missing_tables) ? data.missing_tables : [],
          hint: data?.hint || "",
        });
      } else {
        setSchemaWarning(null);
      }
    } catch (err) {
      setSchemaWarning(null);
      Swal.fire("Error", err?.message || "No se pudo cargar paquetes", "error");
    } finally {
      setLoading(false);
    }
  }, [page, limit, q, estado]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setVigenciaIndefinida(true);
    setItemDraft(EMPTY_ITEM);
    setCatalogResults([]);
    setCatalogQ("");
  };

  const editRow = async (id) => {
    try {
      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php?paquete_id=${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success || !data?.paquete) throw new Error(data?.error || "No se pudo cargar paquete");
      const p = data.paquete;
      setForm({
        id: Number(p.id || 0),
        codigo: p.codigo || "",
        nombre: p.nombre || "",
        descripcion: p.descripcion || "",
        tipo: p.tipo || "paquete",
        estado: p.estado || "activo",
        precio_global_venta: p.precio_global_venta ?? "",
        modo_precio: p.modo_precio || "fijo_global",
        vigencia_desde: p.vigencia_desde || "",
        vigencia_hasta: p.vigencia_hasta || "",
        items: Array.isArray(p.items)
          ? p.items.map((it) => ({
              ...EMPTY_ITEM,
              ...it,
              honorario_regla: {
                ...EMPTY_ITEM.honorario_regla,
                ...(it.honorario_regla || {}),
              },
            }))
          : [],
      });
      setVigenciaIndefinida(!(p.vigencia_hasta || ""));
      openEditor();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo abrir el paquete", "error");
    }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("accion", "catalogo");
      params.set("source_type", itemDraft.source_type);
      params.set("q", catalogQ);
      params.set("limit", "25");
      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo consultar catalogo");
      setCatalogResults(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo consultar catalogo", "error");
    } finally {
      setCatalogLoading(false);
    }
  };

  const pickCatalogItem = (it) => {
    const next = recalcItem({
      ...itemDraft,
      source_type: it.source_type,
      source_id: it.source_id,
      medico_id: it.medico_id || "",
      medico_nombre_snapshot: it.medico_nombre || "",
      descripcion_snapshot: it.descripcion,
      precio_lista_snapshot: it.precio,
    });
    setItemDraft(next);
  };

  const addItemToForm = () => {
    if (!itemDraft.descripcion_snapshot.trim()) {
      Swal.fire("Atencion", "Debe ingresar una descripcion del item", "warning");
      return;
    }
    const item = recalcItem(itemDraft);
    setForm((prev) => ({ ...prev, items: [...prev.items, item] }));
    setItemDraft(EMPTY_ITEM);
    setCatalogResults([]);
  };

  const removeItem = (idx) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  const onChangeForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveForm = async () => {
    if (!form.nombre.trim()) {
      Swal.fire("Atencion", "El nombre es obligatorio", "warning");
      return;
    }
    if (form.items.length === 0) {
      Swal.fire("Atencion", "Debe agregar al menos un item", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        accion: "guardar",
        ...form,
        precio_global_venta: normalizeNumber(form.precio_global_venta),
        items: form.items.map((it, idx) => ({
          ...recalcItem(it),
          item_orden: idx + 1,
        })),
      };

      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo guardar");

      Swal.fire("Listo", "Paquete/Perfil guardado", "success");
      resetForm();
      openEditor();
      loadRows();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const setEstadoRow = async (id, nextEstado) => {
    try {
      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accion: "estado", id, estado: nextEstado }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo actualizar estado");
      loadRows();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo actualizar estado", "error");
    }
  };

  const archiveRow = async (id) => {
    const confirm = await Swal.fire({
      title: "Archivar paquete?",
      text: "Se marcara como archivado.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Archivar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    try {
      const res = await fetch(`${BASE_URL}api_paquetes_perfiles.php`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo archivar");
      loadRows();
    } catch (err) {
      Swal.fire("Error", err?.message || "No se pudo archivar", "error");
    }
  };

  return (
    <div className="max-w-full mx-auto p-4 md:p-8 space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl font-bold" style={{ color: "var(--color-primary-dark)" }}>
            Paquetes y Perfiles
          </h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              openEditor();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300"
            title="Crear nuevo paquete o perfil"
          >
            <span aria-hidden="true">+</span>
            <span>Nuevo paquete</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            className="border rounded px-3 py-2"
            placeholder="Buscar por codigo o nombre"
          />
          <select
            value={estado}
            onChange={(e) => {
              setPage(1);
              setEstado(e.target.value);
            }}
            className="border rounded px-3 py-2"
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={limit}
            onChange={(e) => {
              setPage(1);
              setLimit(Number(e.target.value));
            }}
            className="border rounded px-3 py-2"
          >
            <option value={10}>10 por pagina</option>
            <option value={20}>20 por pagina</option>
            <option value={50}>50 por pagina</option>
          </select>
          <button
            type="button"
            onClick={loadRows}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-2"
          >
            Filtrar
          </button>
        </div>

        {schemaWarning && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
            <div className="font-semibold">Esquema de paquetes/perfiles pendiente</div>
            <div>{schemaWarning.message}</div>
            {schemaWarning.missingTables.length > 0 && (
              <div>Tablas faltantes: {schemaWarning.missingTables.join(", ")}</div>
            )}
            {schemaWarning.hint && <div>Sugerencia: {schemaWarning.hint}</div>}
          </div>
        )}

        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-left">Codigo</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-center">Items</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-500">Cargando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-500">Sin registros</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.codigo}</td>
                  <td className="px-3 py-2">{r.nombre}</td>
                  <td className="px-3 py-2">{r.tipo}</td>
                  <td className="px-3 py-2 text-right">S/ {Number(r.precio_global_venta || 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-center">{r.items_total || 0}</td>
                  <td className="px-3 py-2">{r.estado}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2 justify-center">
                      <button className="px-2 py-1 rounded bg-blue-100 text-blue-700" onClick={() => editRow(r.id)}>Editar</button>
                      <button
                        className="px-2 py-1 rounded bg-amber-100 text-amber-700"
                        onClick={() => setEstadoRow(r.id, r.estado === "activo" ? "inactivo" : "activo")}
                      >
                        {r.estado === "activo" ? "Inactivar" : "Activar"}
                      </button>
                      <button className="px-2 py-1 rounded bg-red-100 text-red-700" onClick={() => archiveRow(r.id)}>Archivar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <span>Total: {total}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded border disabled:opacity-50">Anterior</button>
            <span>Pagina {page} de {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded border disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      </div>

      {editorOpen ? (
      <div ref={editorRef} className="bg-white rounded-xl border border-gray-200 shadow p-4 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-xl font-semibold">{form.id ? "Editar" : "Nuevo"} paquete/perfil</h3>
          <button
            type="button"
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
            onClick={() => setEditorOpen(false)}
          >
            Cerrar formulario
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input className="border rounded px-3 py-2" placeholder="Codigo (opcional)" value={form.codigo} onChange={(e) => onChangeForm("codigo", e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Nombre" value={form.nombre} onChange={(e) => onChangeForm("nombre", e.target.value)} />
          <select className="border rounded px-3 py-2" value={form.tipo} onChange={(e) => onChangeForm("tipo", e.target.value)}>
            <option value="paquete">Paquete</option>
            <option value="perfil">Perfil</option>
          </select>
          <select className="border rounded px-3 py-2" value={form.estado} onChange={(e) => onChangeForm("estado", e.target.value)}>
            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="border rounded px-3 py-2 md:col-span-2" placeholder="Descripcion" value={form.descripcion} onChange={(e) => onChangeForm("descripcion", e.target.value)} />
          <input className="border rounded px-3 py-2" type="number" min="0" step="0.01" placeholder="Precio global" value={form.precio_global_venta} onChange={(e) => onChangeForm("precio_global_venta", e.target.value)} />
          <select className="border rounded px-3 py-2" value={form.modo_precio} onChange={(e) => onChangeForm("modo_precio", e.target.value)}>
            <option value="fijo_global">Fijo global</option>
            <option value="calculado_componentes">Calculado por componentes</option>
          </select>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Vigencia desde</label>
            <input
              className="border rounded px-3 py-2"
              type="date"
              value={form.vigencia_desde}
              onChange={(e) => onChangeForm("vigencia_desde", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Vigencia hasta</label>
            <input
              className="border rounded px-3 py-2"
              type="date"
              value={form.vigencia_hasta}
              disabled={vigenciaIndefinida}
              onChange={(e) => onChangeForm("vigencia_hasta", e.target.value)}
            />
          </div>
          <div className="md:col-span-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              id="vigencia_indefinida"
              type="checkbox"
              checked={vigenciaIndefinida}
              onChange={(e) => {
                const checked = e.target.checked;
                setVigenciaIndefinida(checked);
                if (checked) {
                  onChangeForm("vigencia_hasta", "");
                }
              }}
            />
            <label htmlFor="vigencia_indefinida">Vigencia indefinida (sin fecha de vencimiento)</label>
          </div>
          <div className="md:col-span-4 text-xs text-gray-600 -mt-1">
            Estas fechas definen el periodo en que el paquete/perfil estara vigente para uso y cotizacion.
          </div>
        </div>

        <div className="border rounded p-3 mb-4">
          <h4 className="font-semibold mb-2">Agregar item</h4>
          <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <strong>Guia rapida:</strong> selecciona tipo, busca en catalogo y elige un resultado para autocompletar descripcion, precio y medico.
            Si no eliges del catalogo, completa manualmente descripcion, cantidad y precio unitario.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Tipo de servicio</label>
              <select className="border rounded px-2 py-2" value={itemDraft.source_type} onChange={(e) => setItemDraft((p) => ({ ...p, source_type: e.target.value }))}>
                {SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Buscar en catalogo</label>
              <input className="border rounded px-2 py-2" placeholder="Ej. ginecologia" value={catalogQ} onChange={(e) => setCatalogQ(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Accion catalogo</label>
              <button type="button" className="px-3 py-2 rounded bg-indigo-600 text-white" onClick={loadCatalog}>
                {catalogLoading ? "Buscando..." : "Buscar catalogo"}
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Descripcion del item</label>
              <input className="border rounded px-2 py-2" placeholder="Se autocompleta desde catalogo" value={itemDraft.descripcion_snapshot} onChange={(e) => setItemDraft((p) => ({ ...p, descripcion_snapshot: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Cantidad</label>
              <input
                className="border rounded px-2 py-2"
                type="number"
                min="1"
                step="1"
                placeholder="Ej. 1"
                title="Cantidad de veces que se incluye este servicio en el paquete"
                value={itemDraft.cantidad}
                onChange={(e) => setItemDraft((p) => recalcItem({ ...p, cantidad: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Precio unitario (S/)</label>
              <input
                className="border rounded px-2 py-2"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 80.00"
                title="Precio de lista del servicio. Se autocompleta al elegir del catalogo"
                value={itemDraft.precio_lista_snapshot}
                onChange={(e) => setItemDraft((p) => recalcItem({ ...p, precio_lista_snapshot: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Medico ID (opcional)</label>
              <input className="border rounded px-2 py-2" placeholder="Ej. 12" value={itemDraft.medico_id} onChange={(e) => setItemDraft((p) => ({ ...p, medico_id: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Laboratorio tercerizado</label>
              <label className="flex h-[42px] items-center gap-2 text-sm border rounded px-2 py-2">
                <input type="checkbox" checked={!!itemDraft.es_derivado} onChange={(e) => setItemDraft((p) => ({ ...p, es_derivado: e.target.checked }))} />
                Tercerizado lab
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Laboratorio referencia</label>
              <input className="border rounded px-2 py-2" placeholder="Nombre del laboratorio" value={itemDraft.laboratorio_referencia} onChange={(e) => setItemDraft((p) => ({ ...p, laboratorio_referencia: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Tipo derivacion</label>
              <select className="border rounded px-2 py-2" value={itemDraft.tipo_derivacion} onChange={(e) => setItemDraft((p) => ({ ...p, tipo_derivacion: e.target.value }))}>
                <option value="">Seleccione</option>
                <option value="monto">Monto</option>
                <option value="porcentaje">Porcentaje</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Valor derivacion</label>
              <input className="border rounded px-2 py-2" type="number" min="0" step="0.01" placeholder="Ej. 10 o 20" value={itemDraft.valor_derivacion} onChange={(e) => setItemDraft((p) => ({ ...p, valor_derivacion: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-medium text-gray-700">Regla de honorario medico</label>
              <select
                className="border rounded px-2 py-2"
                value={itemDraft.honorario_regla.modo_honorario}
                onChange={(e) =>
                  setItemDraft((p) => ({
                    ...p,
                    honorario_regla: { ...p.honorario_regla, modo_honorario: e.target.value },
                  }))
                }
              >
                <option value="usar_configuracion_medico">Usar configuracion normal</option>
                <option value="monto_fijo_medico_paquete">Monto fijo en paquete</option>
                <option value="porcentaje_medico_paquete">Porcentaje en paquete</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Monto fijo medico (S/)</label>
              <input
                className="border rounded px-2 py-2"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 30.00"
                value={itemDraft.honorario_regla.monto_fijo_medico}
                onChange={(e) =>
                  setItemDraft((p) => ({
                    ...p,
                    honorario_regla: { ...p.honorario_regla, monto_fijo_medico: e.target.value },
                  }))
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Porcentaje medico (%)</label>
              <input
                className="border rounded px-2 py-2"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ej. 25"
                value={itemDraft.honorario_regla.porcentaje_medico}
                onChange={(e) =>
                  setItemDraft((p) => ({
                    ...p,
                    honorario_regla: { ...p.honorario_regla, porcentaje_medico: e.target.value },
                  }))
                }
              />
            </div>
            <div className="md:col-span-4 text-xs text-gray-600">
              Subtotal del item: <strong>S/ {Number(itemDraft.subtotal_snapshot || 0).toFixed(2)}</strong>
            </div>
            <button type="button" className="px-3 py-2 rounded bg-green-600 text-white" onClick={addItemToForm}>Agregar item</button>
          </div>

          {catalogResults.length > 0 && (
            <div className="border rounded max-h-40 overflow-auto text-sm">
              {catalogResults.map((it) => (
                <button
                  type="button"
                  key={`${it.source_type}-${it.source_id}`}
                  className="w-full text-left px-2 py-2 border-b hover:bg-gray-50"
                  onClick={() => pickCatalogItem(it)}
                >
                  {it.descripcion} | S/ {Number(it.precio || 0).toFixed(2)} {it.medico_nombre ? `| ${it.medico_nombre}` : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-auto border rounded mb-4">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Tipo</th>
                <th className="px-2 py-2 text-left">Descripcion</th>
                <th className="px-2 py-2 text-left">Medico</th>
                <th className="px-2 py-2 text-right">Cant</th>
                <th className="px-2 py-2 text-right">Precio</th>
                <th className="px-2 py-2 text-right">Subtotal</th>
                <th className="px-2 py-2 text-left">Hon. modo</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {form.items.length === 0 ? (
                <tr><td colSpan={8} className="px-2 py-3 text-center text-gray-500">Sin items</td></tr>
              ) : form.items.map((it, idx) => (
                <tr key={`${it.source_type}-${it.source_id || idx}-${idx}`} className="border-t">
                  <td className="px-2 py-2">{it.source_type}</td>
                  <td className="px-2 py-2">{it.descripcion_snapshot}</td>
                  <td className="px-2 py-2">{it.medico_nombre_snapshot || (it.medico_id ? `ID ${it.medico_id}` : "-")}</td>
                  <td className="px-2 py-2 text-right">{Number(it.cantidad).toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">{Number(it.precio_lista_snapshot).toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">{Number(it.subtotal_snapshot).toFixed(2)}</td>
                  <td className="px-2 py-2">{it.honorario_regla?.modo_honorario || "usar_configuracion_medico"}</td>
                  <td className="px-2 py-2 text-right">
                    <button className="px-2 py-1 rounded bg-red-100 text-red-700" onClick={() => removeItem(idx)}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 justify-end">
          <button className="px-4 py-2 rounded bg-gray-100 text-gray-700" onClick={resetForm}>Limpiar</button>
          <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" onClick={saveForm} disabled={saving}>
            {saving ? "Guardando..." : "Guardar paquete/perfil"}
          </button>
        </div>
      </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow p-4 md:p-6">
          <h3 className="text-xl font-semibold">Nuevo paquete/perfil</h3>
        </div>
      )}
    </div>
  );
}
