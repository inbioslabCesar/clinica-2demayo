import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch, resolveAppUrl } from "../utils/apiClient";

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const initialRecetaForm = {
  id_examen: "",
  item_id: "",
  cantidad_por_prueba: "",
  activo: 1,
  observacion: "",
};

const initialTransferForm = {
  item_id: "",
  modo_cantidad: "base",
  cantidad: "",
  cantidad_presentacion: "",
  observacion: "",
};

export default function InventarioLaboratorioPage() {
  const [loading, setLoading] = useState(false);
  const [savingReceta, setSavingReceta] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [catalogo, setCatalogo] = useState({ examenes: [], items: [] });
  const [recetas, setRecetas] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [stockInterno, setStockInterno] = useState([]);

  const [recetaForm, setRecetaForm] = useState(initialRecetaForm);
  const [editingRecetaId, setEditingRecetaId] = useState(null);
  const [transferForm, setTransferForm] = useState(initialTransferForm);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRows, setReportRows] = useState([]);
  const [reportResumen, setReportResumen] = useState({
    filas: 0,
    pruebas_total: 0,
    pruebas_repetidas: 0,
    consumo_esperado_total: 0,
    consumo_real_total: 0,
    desviacion_total: 0,
  });
  const [reportFiltros, setReportFiltros] = useState(() => {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return {
      periodo: "diario",
      fecha_inicio: toDateInputValue(inicioMes),
      fecha_fin: toDateInputValue(hoy),
      item_id: "",
      examen_id: "",
    };
  });
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiData, setKpiData] = useState({
    resumen: {
      items_monitoreados: 0,
      items_con_desviacion: 0,
      examenes_con_repeticion: 0,
      alertas_total: 0,
    },
    top_desviaciones: [],
    top_repeticiones: [],
    proyeccion_stock: [],
    alertas: [],
  });
  const [kpiConfig, setKpiConfig] = useState({
    umbral_desviacion_pct: "20",
    umbral_dias_stock: "7",
  });

  const normalizeRole = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const canTransfer = useMemo(() => {
    try {
      const usuarioRaw = sessionStorage.getItem("usuario");
      if (!usuarioRaw) {
        return false;
      }
      const usuario = JSON.parse(usuarioRaw);
      const rol = normalizeRole(usuario?.rol || "");
      return [
        "administrador",
        "quimico",
        "quimica",
        "laboratorista",
        "laboratorio",
        "profesional_encargado",
        "encargado_laboratorio",
        "encargado_de_laboratorio",
      ].includes(rol);
    } catch {
      return false;
    }
  }, []);

  const examenNombreById = useMemo(() => {
    const map = new Map();
    (catalogo.examenes || []).forEach((item) => {
      map.set(String(item.id), item.nombre);
    });
    return map;
  }, [catalogo.examenes]);

  const itemNombreById = useMemo(() => {
    const map = new Map();
    (catalogo.items || []).forEach((item) => {
      map.set(String(item.id), `${item.codigo || ""} · ${item.nombre || ""}`.trim());
    });
    return map;
  }, [catalogo.items]);

  const recetaActivaPorItem = useMemo(() => {
    const map = new Map();
    (recetas || []).forEach((r) => {
      if (Number(r.activo) !== 1) return;
      const itemId = Number(r.item_id || 0);
      const cantidad = Number(r.cantidad_por_prueba || 0);
      if (!itemId || cantidad <= 0) return;

      if (!map.has(itemId)) {
        map.set(itemId, {
          totalRecetas: 0,
          consumoMin: cantidad,
          consumoMax: cantidad,
        });
      }

      const cur = map.get(itemId);
      cur.totalRecetas += 1;
      cur.consumoMin = Math.min(cur.consumoMin, cantidad);
      cur.consumoMax = Math.max(cur.consumoMax, cantidad);
      map.set(itemId, cur);
    });
    return map;
  }, [recetas]);

  const itemSeleccionadoTransfer = useMemo(() => {
    const id = Number(transferForm.item_id || 0);
    if (!id) return null;
    return (catalogo.items || []).find((it) => Number(it.id) === id) || null;
  }, [catalogo.items, transferForm.item_id]);

  const factorPresentacionTransfer = useMemo(() => {
    const factor = Number(itemSeleccionadoTransfer?.factor_presentacion || 0);
    return factor > 0 ? factor : 1;
  }, [itemSeleccionadoTransfer]);

  const transferenciaPreview = useMemo(() => {
    const unidad = itemSeleccionadoTransfer?.unidad_medida || "u";
    const presentacion = itemSeleccionadoTransfer?.presentacion || "presentación";

    if (transferForm.modo_cantidad === "presentacion") {
      const cantidadPresentacion = Number(transferForm.cantidad_presentacion || 0);
      const base = cantidadPresentacion > 0 ? cantidadPresentacion * factorPresentacionTransfer : 0;
      return {
        texto: `${cantidadPresentacion || 0} ${presentacion} = ${base.toFixed(4)} ${unidad}`,
      };
    }

    const cantidadBase = Number(transferForm.cantidad || 0);
    const presentacionEq = factorPresentacionTransfer > 0 ? cantidadBase / factorPresentacionTransfer : 0;
    return {
      texto: `${cantidadBase || 0} ${unidad} = ${presentacionEq.toFixed(4)} ${presentacion}`,
    };
  }, [itemSeleccionadoTransfer, transferForm.modo_cantidad, transferForm.cantidad_presentacion, transferForm.cantidad, factorPresentacionTransfer]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resRecetas, resTransfers, resStock] = await Promise.all([
        authFetch("api_inventario_recetas.php?catalogo=1", { cache: "no-store" }),
        authFetch("api_inventario_transferencias.php?limit=50", { cache: "no-store" }),
        authFetch("api_inventario_transferencias.php?accion=stock_interno", { cache: "no-store" }),
      ]);

      const dataRecetas = await resRecetas.json();
      const dataTransfers = await resTransfers.json();
      const dataStock = await resStock.json();

      if (!dataRecetas?.success) {
        throw new Error(dataRecetas?.error || "No se pudo cargar recetas");
      }
      if (!dataTransfers?.success) {
        throw new Error(dataTransfers?.error || "No se pudo cargar transferencias internas");
      }
      if (!dataStock?.success) {
        throw new Error(dataStock?.error || "No se pudo cargar stock interno");
      }

      setCatalogo(dataRecetas.catalogo || { examenes: [], items: [] });
      setRecetas(Array.isArray(dataRecetas.recetas) ? dataRecetas.recetas : []);
      setTransferencias(Array.isArray(dataTransfers?.transferencias) ? dataTransfers.transferencias : []);
      setStockInterno(Array.isArray(dataStock?.stock_interno) ? dataStock.stock_interno : []);
    } catch (e) {
      setError(e.message || "No se pudo cargar inventario interno");
    } finally {
      setLoading(false);
    }
  }, []);

  const buildReporteQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("periodo", reportFiltros.periodo || "diario");
    params.set("fecha_inicio", reportFiltros.fecha_inicio);
    params.set("fecha_fin", reportFiltros.fecha_fin);
    if (Number(reportFiltros.item_id || 0) > 0) {
      params.set("item_id", String(Number(reportFiltros.item_id)));
    }
    if (Number(reportFiltros.examen_id || 0) > 0) {
      params.set("examen_id", String(Number(reportFiltros.examen_id)));
    }
    return params;
  }, [reportFiltros.examen_id, reportFiltros.fecha_fin, reportFiltros.fecha_inicio, reportFiltros.item_id, reportFiltros.periodo]);

  const fetchReporteConsumo = useCallback(async () => {
    setReportLoading(true);
    try {
      const params = buildReporteQuery();
      const res = await authFetch(`api_inventario_reportes.php?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo cargar reporte de consumo");
      }
      setReportRows(Array.isArray(data.rows) ? data.rows : []);
      setReportResumen(
        data.resumen || {
          filas: 0,
          pruebas_total: 0,
          pruebas_repetidas: 0,
          consumo_esperado_total: 0,
          consumo_real_total: 0,
          desviacion_total: 0,
        }
      );
    } catch (e) {
      setError(e.message || "No se pudo cargar reporte de consumo");
    } finally {
      setReportLoading(false);
    }
  }, [buildReporteQuery]);

  const exportarReporteConsumo = (formato) => {
    const params = buildReporteQuery();
    params.set("formato", formato);
    window.open(resolveAppUrl(`api_inventario_reportes.php?${params.toString()}`), "_blank", "noopener,noreferrer");
  };

  const fetchKpiDashboard = useCallback(async () => {
    setKpiLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("fecha_inicio", reportFiltros.fecha_inicio);
      params.set("fecha_fin", reportFiltros.fecha_fin);
      params.set("umbral_desviacion_pct", String(Number(kpiConfig.umbral_desviacion_pct || 0)));
      params.set("umbral_dias_stock", String(Number(kpiConfig.umbral_dias_stock || 0)));

      const res = await authFetch(`api_inventario_kpi.php?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo cargar dashboard ejecutivo");
      }

      setKpiData({
        resumen: data.resumen || {
          items_monitoreados: 0,
          items_con_desviacion: 0,
          examenes_con_repeticion: 0,
          alertas_total: 0,
        },
        top_desviaciones: Array.isArray(data.top_desviaciones) ? data.top_desviaciones : [],
        top_repeticiones: Array.isArray(data.top_repeticiones) ? data.top_repeticiones : [],
        proyeccion_stock: Array.isArray(data.proyeccion_stock) ? data.proyeccion_stock : [],
        alertas: Array.isArray(data.alertas) ? data.alertas : [],
      });
    } catch (e) {
      setError(e.message || "No se pudo cargar dashboard ejecutivo");
    } finally {
      setKpiLoading(false);
    }
  }, [kpiConfig.umbral_desviacion_pct, kpiConfig.umbral_dias_stock, reportFiltros.fecha_fin, reportFiltros.fecha_inicio]);

  const exportarKpiDashboard = (formato) => {
    const params = new URLSearchParams();
    params.set("fecha_inicio", reportFiltros.fecha_inicio);
    params.set("fecha_fin", reportFiltros.fecha_fin);
    params.set("umbral_desviacion_pct", String(Number(kpiConfig.umbral_desviacion_pct || 0)));
    params.set("umbral_dias_stock", String(Number(kpiConfig.umbral_dias_stock || 0)));
    params.set("formato", formato);
    window.open(resolveAppUrl(`api_inventario_kpi.php?${params.toString()}`), "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    fetchAll();
    fetchReporteConsumo();
    fetchKpiDashboard();
  }, [fetchAll, fetchKpiDashboard, fetchReporteConsumo]);

  const resetMensajes = () => {
    setMensaje("");
    setError("");
  };

  const handleSubmitReceta = async (e) => {
    e.preventDefault();
    resetMensajes();

    const payload = {
      id_examen: Number(recetaForm.id_examen),
      item_id: Number(recetaForm.item_id),
      cantidad_por_prueba: Number(recetaForm.cantidad_por_prueba),
      activo: Number(recetaForm.activo),
      observacion: (recetaForm.observacion || "").trim(),
    };

    if (!payload.id_examen || !payload.item_id || !payload.cantidad_por_prueba) {
      setError("Completa examen, ítem y cantidad por prueba.");
      return;
    }

    setSavingReceta(true);
    try {
      const method = editingRecetaId ? "PUT" : "POST";
      const body = editingRecetaId ? { ...payload, id: editingRecetaId } : payload;
      const res = await authFetch("api_inventario_recetas.php", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo guardar receta");
      }

      setMensaje(editingRecetaId ? "Receta actualizada." : "Receta guardada.");
      setRecetaForm(initialRecetaForm);
      setEditingRecetaId(null);
      await fetchAll();
    } catch (e) {
      setError(e.message || "Error al guardar receta");
    } finally {
      setSavingReceta(false);
    }
  };

  const handleEditarReceta = (receta) => {
    setEditingRecetaId(Number(receta.id));
    setRecetaForm({
      id_examen: String(receta.id_examen || ""),
      item_id: String(receta.item_id || ""),
      cantidad_por_prueba: String(receta.cantidad_por_prueba || ""),
      activo: Number(receta.activo ?? 1),
      observacion: receta.observacion || "",
    });
    resetMensajes();
  };

  const handleEliminarReceta = async (id) => {
    resetMensajes();
    try {
      const res = await authFetch("api_inventario_recetas.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo eliminar receta");
      }
      setMensaje("Receta eliminada.");
      if (editingRecetaId === Number(id)) {
        setEditingRecetaId(null);
        setRecetaForm(initialRecetaForm);
      }
      await fetchAll();
    } catch (e) {
      setError(e.message || "Error al eliminar receta");
    }
  };

  const handleSubmitTransferencia = async (e) => {
    e.preventDefault();
    resetMensajes();

    const itemId = Number(transferForm.item_id);
    const cantidadBase = Number(transferForm.cantidad || 0);
    const cantidadPresentacion = Number(transferForm.cantidad_presentacion || 0);
    const usaPresentacion = transferForm.modo_cantidad === "presentacion";

    if (!itemId) {
      setError("Selecciona un ítem para transferir.");
      return;
    }

    if (usaPresentacion && (!cantidadPresentacion || cantidadPresentacion <= 0)) {
      setError("Ingresa cantidad de presentación válida.");
      return;
    }

    if (!usaPresentacion && (!cantidadBase || cantidadBase <= 0)) {
      setError("Completa ítem y cantidad de transferencia.");
      return;
    }

    setSavingTransfer(true);
    try {
      const res = await authFetch("api_inventario_transferencias.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          cantidad: usaPresentacion ? 0 : cantidadBase,
          cantidad_presentacion: usaPresentacion ? cantidadPresentacion : 0,
          observacion: (transferForm.observacion || "").trim(),
        }),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo registrar transferencia");
      }

      setMensaje(`Transferencia #${data.transferencia_id} registrada.`);
      setTransferForm(initialTransferForm);
      await fetchAll();
    } catch (e) {
      setError(e.message || "Error al transferir");
    } finally {
      setSavingTransfer(false);
    }
  };

  return (
    <div
      className="min-h-screen p-4"
      style={{ background: "linear-gradient(135deg, var(--color-primary-light) 0%, #ffffff 55%, #eef2ff 100%)" }}
    >
      <div className="max-w-7xl mx-auto space-y-4">
        <div
          className="rounded-xl p-4 text-white shadow-lg"
          style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary), var(--color-accent))" }}
        >
          <h1 className="text-xl font-bold">Inventario Interno Laboratorio</h1>
          <p className="text-sm text-white/80">Recetas por examen, transferencias al laboratorio y saldo interno</p>
        </div>

        {mensaje && (
          <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm">
            {mensaje}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              {editingRecetaId ? "Editar receta" : "Nueva receta"}
            </h2>
            <form className="space-y-3" onSubmit={handleSubmitReceta}>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={recetaForm.id_examen}
                onChange={(e) => setRecetaForm((prev) => ({ ...prev, id_examen: e.target.value }))}
              >
                <option value="">Seleccionar examen</option>
                {(catalogo.examenes || []).map((ex) => (
                  <option key={ex.id} value={ex.id}>{ex.nombre}</option>
                ))}
              </select>

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={recetaForm.item_id}
                onChange={(e) => setRecetaForm((prev) => ({ ...prev, item_id: e.target.value }))}
              >
                <option value="">Seleccionar ítem</option>
                {(catalogo.items || []).map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.codigo} · {it.nombre} · Stock {Number(it.stock_almacen || 0).toFixed(2)} {it.unidad_medida}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0.0001"
                step="0.0001"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Cantidad por prueba"
                value={recetaForm.cantidad_por_prueba}
                onChange={(e) => setRecetaForm((prev) => ({ ...prev, cantidad_por_prueba: e.target.value }))}
              />

              <select
                className="w-full border rounded-lg px-3 py-2"
                value={recetaForm.activo}
                onChange={(e) => setRecetaForm((prev) => ({ ...prev, activo: Number(e.target.value) }))}
              >
                <option value={1}>Activo</option>
                <option value={0}>Inactivo</option>
              </select>

              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Observación (opcional)"
                value={recetaForm.observacion}
                onChange={(e) => setRecetaForm((prev) => ({ ...prev, observacion: e.target.value }))}
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingReceta}
                  className="disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                  style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}
                >
                  {savingReceta ? "Guardando..." : editingRecetaId ? "Actualizar" : "Guardar"}
                </button>
                {editingRecetaId ? (
                  <button
                    type="button"
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm"
                    onClick={() => {
                      setEditingRecetaId(null);
                      setRecetaForm(initialRecetaForm);
                    }}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <h2 className="text-base font-semibold text-gray-800 mb-3">Transferir a laboratorio</h2>
            {canTransfer ? (
              <form className="space-y-3" onSubmit={handleSubmitTransferencia}>
                <select
                  className="w-full border rounded-lg px-3 py-2"
                  value={transferForm.item_id}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, item_id: e.target.value }))}
                >
                  <option value="">Seleccionar ítem</option>
                  {(catalogo.items || []).map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.codigo} · {it.nombre} · Stock {Number(it.stock_almacen || 0).toFixed(2)} {it.unidad_medida}
                    </option>
                  ))}
                </select>

                <select
                  className="w-full border rounded-lg px-3 py-2"
                  value={transferForm.modo_cantidad}
                  onChange={(e) =>
                    setTransferForm((prev) => ({
                      ...prev,
                      modo_cantidad: e.target.value,
                    }))
                  }
                >
                  <option value="base">Ingresar por unidad base</option>
                  <option value="presentacion">Ingresar por presentación</option>
                </select>

                {transferForm.modo_cantidad === "presentacion" ? (
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Cantidad de presentación (cajas/frascos)"
                    value={transferForm.cantidad_presentacion}
                    onChange={(e) => setTransferForm((prev) => ({ ...prev, cantidad_presentacion: e.target.value }))}
                  />
                ) : (
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Cantidad a transferir en unidad base"
                    value={transferForm.cantidad}
                    onChange={(e) => setTransferForm((prev) => ({ ...prev, cantidad: e.target.value }))}
                  />
                )}

                {itemSeleccionadoTransfer ? (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    Conversión: {transferenciaPreview.texto}
                  </div>
                ) : null}

                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Observación (opcional)"
                  value={transferForm.observacion}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, observacion: e.target.value }))}
                />

                <button
                  type="submit"
                  disabled={savingTransfer}
                  className="disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                  style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}
                >
                  {savingTransfer ? "Registrando..." : "Registrar transferencia"}
                </button>
              </form>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                Solo los roles autorizados de laboratorio pueden registrar transferencias internas.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-gray-800">Recetas configuradas</h2>
              <button
                className="text-sm"
                style={{ color: "var(--color-secondary)" }}
                type="button"
                onClick={fetchAll}
                disabled={loading}
              >
                {loading ? "Actualizando..." : "Actualizar"}
              </button>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-2 py-2">Examen</th>
                    <th className="text-left px-2 py-2">Ítem</th>
                    <th className="text-right px-2 py-2">Cant.</th>
                    <th className="text-center px-2 py-2">Estado</th>
                    <th className="text-right px-2 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recetas.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-500 py-4">Sin recetas</td>
                    </tr>
                  ) : (
                    recetas.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="px-2 py-2">{r.examen_nombre || examenNombreById.get(String(r.id_examen)) || `#${r.id_examen}`}</td>
                        <td className="px-2 py-2">{r.item_codigo || ""} {r.item_nombre || itemNombreById.get(String(r.item_id)) || `#${r.item_id}`}</td>
                        <td className="px-2 py-2 text-right">{Number(r.cantidad_por_prueba || 0).toFixed(4)}</td>
                        <td className="px-2 py-2 text-center">{Number(r.activo) === 1 ? "Activo" : "Inactivo"}</td>
                        <td className="px-2 py-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                              onClick={() => handleEditarReceta(r)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                              onClick={() => handleEliminarReceta(r.id)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
              <h2 className="text-base font-semibold text-gray-800 mb-2">Stock interno laboratorio</h2>
              <div className="max-h-[170px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-2">Ítem</th>
                      <th className="text-right px-2 py-2">Transferido</th>
                      <th className="text-right px-2 py-2">Consumido</th>
                      <th className="text-right px-2 py-2">Saldo</th>
                      <th className="text-right px-2 py-2">Consumo/prueba</th>
                      <th className="text-right px-2 py-2">Pruebas posibles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockInterno.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-gray-500 py-4">Sin movimientos internos</td>
                      </tr>
                    ) : (
                      stockInterno.map((row) => {
                        const itemId = Number(row.id || 0);
                        const saldo = Number(row.saldo || 0);
                        const recetaRef = recetaActivaPorItem.get(itemId);

                        let consumoTexto = "Sin receta";
                        let pruebasTexto = "-";

                        if (recetaRef && recetaRef.totalRecetas > 0) {
                          if (recetaRef.totalRecetas === 1 || recetaRef.consumoMin === recetaRef.consumoMax) {
                            consumoTexto = `${recetaRef.consumoMin.toFixed(4)}`;
                            pruebasTexto = recetaRef.consumoMin > 0 ? String(Math.floor(saldo / recetaRef.consumoMin)) : "-";
                          } else {
                            consumoTexto = `${recetaRef.consumoMin.toFixed(4)} - ${recetaRef.consumoMax.toFixed(4)}`;
                            const pruebasMax = recetaRef.consumoMin > 0 ? Math.floor(saldo / recetaRef.consumoMin) : 0;
                            const pruebasMin = recetaRef.consumoMax > 0 ? Math.floor(saldo / recetaRef.consumoMax) : 0;
                            pruebasTexto = `${pruebasMin} - ${pruebasMax}`;
                          }
                        }

                        return (
                          <tr key={row.id} className="border-b">
                            <td className="px-2 py-2">{row.codigo} {row.nombre}</td>
                            <td className="px-2 py-2 text-right">{Number(row.transferido || 0).toFixed(4)}</td>
                            <td className="px-2 py-2 text-right">{Number(row.consumido || 0).toFixed(4)}</td>
                            <td className="px-2 py-2 text-right font-semibold">{Number(row.saldo || 0).toFixed(4)}</td>
                            <td className="px-2 py-2 text-right">{consumoTexto}</td>
                            <td className="px-2 py-2 text-right font-semibold">{pruebasTexto}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-100 p-4">
              <h2 className="text-base font-semibold text-gray-800 mb-2">Últimas transferencias</h2>
              <div className="max-h-[170px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-2">ID</th>
                      <th className="text-left px-2 py-2">Fecha</th>
                      <th className="text-left px-2 py-2">Reactivos</th>
                      <th className="text-right px-2 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferencias.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-gray-500 py-4">Sin transferencias</td>
                      </tr>
                    ) : (
                      transferencias.map((t) => (
                        <tr key={t.id} className="border-b align-top">
                          <td className="px-2 py-2">#{t.id}</td>
                          <td className="px-2 py-2">{t.fecha_hora ? new Date(t.fecha_hora).toLocaleString() : "-"}</td>
                          <td className="px-2 py-2">
                            {Array.isArray(t.detalles) && t.detalles.length > 0 ? (
                              <div className="space-y-1">
                                {t.detalles.map((d, idx) => (
                                  <div key={`${t.id}-${d.item_id}-${idx}`} className="text-xs leading-4">
                                    <div className="font-medium">{d.codigo} {d.nombre}</div>
                                    <div className="text-gray-600">
                                      {Number(d.cantidad_presentacion || 0).toFixed(4)} {d.presentacion || "presentación"} = {Number(d.cantidad_base || 0).toFixed(4)} {d.unidad_medida || "u"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-500">Sin detalle</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">{Number(t.cantidad_total || 0).toFixed(4)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">Reporte de consumo de reactivos</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => exportarReporteConsumo("excel")}
              >
                Exportar Excel
              </button>
              <button
                type="button"
                className="text-xs px-3 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => exportarReporteConsumo("pdf")}
              >
                Exportar PDF
              </button>
            </div>
          </div>

          <form
            className="grid grid-cols-1 md:grid-cols-6 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              fetchReporteConsumo();
            }}
          >
            <select
              className="border rounded-lg px-3 py-2"
              value={reportFiltros.periodo}
              onChange={(e) => setReportFiltros((prev) => ({ ...prev, periodo: e.target.value }))}
            >
              <option value="diario">Diario</option>
              <option value="mensual">Mensual</option>
              <option value="anual">Anual</option>
            </select>
            <input
              type="date"
              className="border rounded-lg px-3 py-2"
              value={reportFiltros.fecha_inicio}
              onChange={(e) => setReportFiltros((prev) => ({ ...prev, fecha_inicio: e.target.value }))}
            />
            <input
              type="date"
              className="border rounded-lg px-3 py-2"
              value={reportFiltros.fecha_fin}
              onChange={(e) => setReportFiltros((prev) => ({ ...prev, fecha_fin: e.target.value }))}
            />
            <select
              className="border rounded-lg px-3 py-2"
              value={reportFiltros.item_id}
              onChange={(e) => setReportFiltros((prev) => ({ ...prev, item_id: e.target.value }))}
            >
              <option value="">Todos los reactivos</option>
              {(catalogo.items || []).map((it) => (
                <option key={it.id} value={it.id}>{it.codigo} · {it.nombre}</option>
              ))}
            </select>
            <select
              className="border rounded-lg px-3 py-2"
              value={reportFiltros.examen_id}
              onChange={(e) => setReportFiltros((prev) => ({ ...prev, examen_id: e.target.value }))}
            >
              <option value="">Todos los exámenes</option>
              {(catalogo.examenes || []).map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.nombre}</option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-white"
              style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}
              disabled={reportLoading}
            >
              {reportLoading ? "Cargando..." : "Ver reporte"}
            </button>
          </form>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
            <div className="rounded-lg border px-2 py-2"><strong>Filas:</strong> {Number(reportResumen.filas || 0)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Pruebas:</strong> {Number(reportResumen.pruebas_total || 0)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Repetidas:</strong> {Number(reportResumen.pruebas_repetidas || 0)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Cons. esperado:</strong> {Number(reportResumen.consumo_esperado_total || 0).toFixed(4)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Cons. real:</strong> {Number(reportResumen.consumo_real_total || 0).toFixed(4)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Desviación:</strong> {Number(reportResumen.desviacion_total || 0).toFixed(4)}</div>
          </div>

          <div className="max-h-[280px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-2 py-2">Periodo</th>
                  <th className="text-left px-2 py-2">Reactivo</th>
                  <th className="text-left px-2 py-2">Examen</th>
                  <th className="text-right px-2 py-2">Pruebas</th>
                  <th className="text-right px-2 py-2">Repetidas</th>
                  <th className="text-right px-2 py-2">Cons. receta</th>
                  <th className="text-right px-2 py-2">Cons. esperado</th>
                  <th className="text-right px-2 py-2">Cons. real</th>
                  <th className="text-right px-2 py-2">Desv.</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-gray-500 py-4">Sin datos para el filtro seleccionado</td>
                  </tr>
                ) : (
                  reportRows.map((r, idx) => (
                    <tr key={`${r.periodo}-${r.item_id}-${r.id_examen}-${idx}`} className="border-b">
                      <td className="px-2 py-2">{r.periodo}</td>
                      <td className="px-2 py-2">{r.item_codigo} {r.item_nombre}</td>
                      <td className="px-2 py-2">{r.examen_nombre}</td>
                      <td className="px-2 py-2 text-right">{Number(r.pruebas_total || 0)}</td>
                      <td className="px-2 py-2 text-right">{Number(r.pruebas_repetidas || 0)}</td>
                      <td className="px-2 py-2 text-right">{Number(r.consumo_receta || 0).toFixed(4)}</td>
                      <td className="px-2 py-2 text-right">{Number(r.consumo_esperado || 0).toFixed(4)}</td>
                      <td className="px-2 py-2 text-right">{Number(r.consumo_real || 0).toFixed(4)}</td>
                      <td className="px-2 py-2 text-right">{Number(r.desviacion || 0).toFixed(4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-100 p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-800">Dashboard ejecutivo de consumo y alertas</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-xs px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => exportarKpiDashboard("excel")}
              >
                Exportar KPI Excel
              </button>
              <button
                type="button"
                className="text-xs px-3 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white"
                onClick={() => exportarKpiDashboard("pdf")}
              >
                Exportar KPI PDF
              </button>
            </div>
          </div>

          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              fetchKpiDashboard();
            }}
          >
            <label className="text-xs text-gray-600">Umbral desviación %</label>
            <input
              type="number"
              min="0"
              step="0.1"
              className="w-24 border rounded px-2 py-1 text-sm"
              value={kpiConfig.umbral_desviacion_pct}
              onChange={(e) => setKpiConfig((prev) => ({ ...prev, umbral_desviacion_pct: e.target.value }))}
            />
            <label className="text-xs text-gray-600">Cobertura mínima (días)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              className="w-24 border rounded px-2 py-1 text-sm"
              value={kpiConfig.umbral_dias_stock}
              onChange={(e) => setKpiConfig((prev) => ({ ...prev, umbral_dias_stock: e.target.value }))}
            />
            <button
              type="submit"
              disabled={kpiLoading}
              className="px-3 py-1.5 text-xs rounded text-white disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}
            >
              {kpiLoading ? "Actualizando..." : "Actualizar KPI"}
            </button>
          </form>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg border px-2 py-2"><strong>Ítems monitoreados:</strong> {Number(kpiData?.resumen?.items_monitoreados || 0)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Ítems con desviación:</strong> {Number(kpiData?.resumen?.items_con_desviacion || 0)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Exámenes con repetición:</strong> {Number(kpiData?.resumen?.examenes_con_repeticion || 0)}</div>
            <div className="rounded-lg border px-2 py-2"><strong>Alertas activas:</strong> {Number(kpiData?.resumen?.alertas_total || 0)}</div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Top desviaciones por reactivo</h3>
              <div className="max-h-[220px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-1">Reactivo</th>
                      <th className="text-right px-2 py-1">Esperado</th>
                      <th className="text-right px-2 py-1">Real</th>
                      <th className="text-right px-2 py-1">Desv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kpiData.top_desviaciones || []).length === 0 ? (
                      <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-500">Sin datos</td></tr>
                    ) : (
                      (kpiData.top_desviaciones || []).map((r) => (
                        <tr key={`desv-${r.item_id}`} className="border-b">
                          <td className="px-2 py-1">{r.item_codigo} {r.item_nombre}</td>
                          <td className="px-2 py-1 text-right">{Number(r.consumo_esperado || 0).toFixed(4)}</td>
                          <td className="px-2 py-1 text-right">{Number(r.consumo_real || 0).toFixed(4)}</td>
                          <td className={`px-2 py-1 text-right font-semibold ${Number(r.desviacion || 0) >= 0 ? "text-rose-700" : "text-emerald-700"}`}>
                            {Number(r.desviacion || 0).toFixed(4)} ({Number(r.desviacion_pct || 0).toFixed(2)}%)
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Top exámenes con repeticiones</h3>
              <div className="max-h-[220px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-1">Examen</th>
                      <th className="text-right px-2 py-1">Total</th>
                      <th className="text-right px-2 py-1">Repetidas</th>
                      <th className="text-right px-2 py-1">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(kpiData.top_repeticiones || []).length === 0 ? (
                      <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-500">Sin datos</td></tr>
                    ) : (
                      (kpiData.top_repeticiones || []).map((r) => (
                        <tr key={`rep-${r.id_examen}`} className="border-b">
                          <td className="px-2 py-1">{r.examen_nombre}</td>
                          <td className="px-2 py-1 text-right">{Number(r.pruebas_total || 0)}</td>
                          <td className="px-2 py-1 text-right font-semibold text-amber-700">{Number(r.pruebas_repetidas || 0)}</td>
                          <td className="px-2 py-1 text-right">{Number(r.repeticion_pct || 0).toFixed(2)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Proyección semanal/mensual y cobertura de stock</h3>
            <div className="max-h-[240px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-2 py-1">Reactivo</th>
                    <th className="text-right px-2 py-1">Saldo</th>
                    <th className="text-right px-2 py-1">Prom/día</th>
                    <th className="text-right px-2 py-1">Proy 7d</th>
                    <th className="text-right px-2 py-1">Proy 30d</th>
                    <th className="text-right px-2 py-1">Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {(kpiData.proyeccion_stock || []).length === 0 ? (
                    <tr><td colSpan={6} className="px-2 py-3 text-center text-gray-500">Sin datos</td></tr>
                  ) : (
                    (kpiData.proyeccion_stock || []).map((r) => {
                      const cobertura = r.cobertura_dias;
                      const umbralDias = Number(kpiConfig.umbral_dias_stock || 0);
                      const riesgo = cobertura !== null && Number(cobertura) < umbralDias;
                      return (
                        <tr key={`proj-${r.item_id}`} className="border-b">
                          <td className="px-2 py-1">{r.item_codigo} {r.item_nombre}</td>
                          <td className="px-2 py-1 text-right">{Number(r.saldo_actual || 0).toFixed(4)}</td>
                          <td className="px-2 py-1 text-right">{Number(r.promedio_diario || 0).toFixed(4)}</td>
                          <td className="px-2 py-1 text-right">{Number(r.proyeccion_7d || 0).toFixed(4)}</td>
                          <td className="px-2 py-1 text-right">{Number(r.proyeccion_30d || 0).toFixed(4)}</td>
                          <td className={`px-2 py-1 text-right font-semibold ${riesgo ? "text-rose-700" : "text-emerald-700"}`}>
                            {cobertura === null ? "N/A" : `${Number(cobertura).toFixed(2)} d`}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border rounded-lg p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Alertas automáticas</h3>
            {(kpiData.alertas || []).length === 0 ? (
              <div className="text-sm text-emerald-700">Sin alertas con los umbrales actuales.</div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-auto">
                {(kpiData.alertas || []).map((a, idx) => (
                  <div
                    key={`alert-${idx}`}
                    className={`rounded border px-3 py-2 text-xs ${a.severidad === "alta" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}
                  >
                    <div className="font-semibold uppercase tracking-wide mb-0.5">{a.severidad} · {a.tipo}</div>
                    <div>{a.mensaje}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
