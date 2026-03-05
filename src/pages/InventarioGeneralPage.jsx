import { useEffect, useMemo, useState } from "react";
import { BASE_URL } from "../config/config";

const itemInicial = {
  id: null,
  codigo: "",
  nombre: "",
  categoria: "reactivo",
  marca: "",
  presentacion: "",
  factor_presentacion: "1",
  unidad_medida: "",
  controla_stock: 1,
  stock_minimo: "0",
  stock_critico: "0",
  activo: 1,
};

const movInicial = {
  item_id: "",
  tipo: "entrada",
  cantidad: "",
  cantidad_presentacion: "",
  lote_codigo: "",
  fecha_vencimiento: "",
  observacion: "",
};

export default function InventarioGeneralPage() {
  const [loading, setLoading] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [savingMov, setSavingMov] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  const [filtros, setFiltros] = useState({ q: "", categoria: "todos", estado_stock: "todos" });
  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState({ items_activos: 0, stock_critico: 0, sin_stock: 0 });
  const [movimientos, setMovimientos] = useState([]);
  const [lotesPorVencer, setLotesPorVencer] = useState([]);

  const [itemForm, setItemForm] = useState(itemInicial);
  const [movForm, setMovForm] = useState(movInicial);

  const itemsActivos = useMemo(() => items.filter((x) => Number(x.activo) === 1), [items]);

  const resetMensajes = () => {
    setMensaje("");
    setError("");
  };

  const cargarData = async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      if (filtros.q) qParams.set("q", filtros.q);
      if (filtros.categoria) qParams.set("categoria", filtros.categoria);
      if (filtros.estado_stock) qParams.set("estado_stock", filtros.estado_stock);

      const [resItems, resMov] = await Promise.all([
        fetch(`${BASE_URL}api_inventario_items.php?${qParams.toString()}`, { credentials: "include" }),
        fetch(`${BASE_URL}api_inventario_movimientos.php?limit=80`, { credentials: "include" }),
      ]);
      const dataItems = await resItems.json();
      const dataMov = await resMov.json();

      if (!dataItems?.success) {
        throw new Error(dataItems?.error || "No se pudo cargar inventario general");
      }

      setItems(Array.isArray(dataItems.items) ? dataItems.items : []);
      setResumen(dataItems.resumen || { items_activos: 0, stock_critico: 0, sin_stock: 0 });
      setMovimientos(Array.isArray(dataMov?.movimientos) ? dataMov.movimientos : []);
      setLotesPorVencer(Array.isArray(dataMov?.lotes_por_vencer) ? dataMov.lotes_por_vencer : []);
    } catch (e) {
      setError(e.message || "Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarData();
  }, []);

  const buscar = async (e) => {
    e?.preventDefault();
    await cargarData();
  };

  const onEditarItem = (item) => {
    setItemForm({
      id: Number(item.id),
      codigo: item.codigo || "",
      nombre: item.nombre || "",
      categoria: item.categoria || "reactivo",
      marca: item.marca || "",
      presentacion: item.presentacion || "",
      factor_presentacion: String(item.factor_presentacion ?? "1"),
      unidad_medida: item.unidad_medida || "",
      controla_stock: Number(item.controla_stock) === 1 ? 1 : 0,
      stock_minimo: String(item.stock_minimo ?? "0"),
      stock_critico: String(item.stock_critico ?? "0"),
      activo: Number(item.activo) === 1 ? 1 : 0,
    });
    resetMensajes();
  };

  const onSubmitItem = async (e) => {
    e.preventDefault();
    resetMensajes();
    setSavingItem(true);
    try {
      const payload = {
        ...itemForm,
        factor_presentacion: Number(itemForm.factor_presentacion),
        controla_stock: Number(itemForm.controla_stock),
        stock_minimo: Number(itemForm.stock_minimo),
        stock_critico: Number(itemForm.stock_critico),
        activo: Number(itemForm.activo),
      };

      const method = itemForm.id ? "PUT" : "POST";
      const res = await fetch(`${BASE_URL}api_inventario_items.php`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo guardar item");
      }

      setMensaje(itemForm.id ? "Ítem actualizado." : "Ítem registrado.");
      setItemForm(itemInicial);
      await cargarData();
    } catch (e) {
      setError(e.message || "Error guardando ítem");
    } finally {
      setSavingItem(false);
    }
  };

  const onSubmitMov = async (e) => {
    e.preventDefault();
    resetMensajes();
    setSavingMov(true);
    try {
      const payload = {
        ...movForm,
        item_id: Number(movForm.item_id),
        cantidad: Number(movForm.cantidad || 0),
        cantidad_presentacion: Number(movForm.cantidad_presentacion || 0),
      };

      const res = await fetch(`${BASE_URL}api_inventario_movimientos.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || "No se pudo registrar movimiento");
      }

      setMensaje("Movimiento registrado correctamente.");
      setMovForm(movInicial);
      await cargarData();
    } catch (e) {
      setError(e.message || "Error registrando movimiento");
    } finally {
      setSavingMov(false);
    }
  };

  const tipoLabel = (estado) => {
    if (estado === "sin_stock") return "Sin stock";
    if (estado === "critico") return "Crítico";
    if (estado === "bajo") return "Bajo";
    return "Óptimo";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-xl p-4 text-white shadow-lg">
          <h1 className="text-xl font-bold">Inventario General</h1>
          <p className="text-sm text-purple-100">Reactivos, materiales e insumos (almacén principal)</p>
        </div>

        {mensaje && <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-sm">{mensaje}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg shadow border p-3"><div className="text-xs text-gray-500">Ítems activos</div><div className="text-2xl font-bold text-indigo-700">{resumen.items_activos}</div></div>
          <div className="bg-white rounded-lg shadow border p-3"><div className="text-xs text-gray-500">Stock crítico</div><div className="text-2xl font-bold text-amber-700">{resumen.stock_critico}</div></div>
          <div className="bg-white rounded-lg shadow border p-3"><div className="text-xs text-gray-500">Sin stock</div><div className="text-2xl font-bold text-red-700">{resumen.sin_stock}</div></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow border p-4">
            <h2 className="font-semibold mb-3">{itemForm.id ? "Editar ítem" : "Nuevo ítem"}</h2>
            <form className="space-y-2" onSubmit={onSubmitItem}>
              <div className="grid grid-cols-2 gap-2">
                <input className="border rounded px-3 py-2" placeholder="Código (opcional)" value={itemForm.codigo} onChange={(e) => setItemForm((p) => ({ ...p, codigo: e.target.value }))} />
                <input className="border rounded px-3 py-2" placeholder="Nombre" value={itemForm.nombre} onChange={(e) => setItemForm((p) => ({ ...p, nombre: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select className="border rounded px-3 py-2" value={itemForm.categoria} onChange={(e) => setItemForm((p) => ({ ...p, categoria: e.target.value }))}>
                  <option value="reactivo">Reactivo</option>
                  <option value="insumo">Insumo</option>
                  <option value="material">Material</option>
                  <option value="activo_fijo">Activo fijo</option>
                </select>
                <input className="border rounded px-3 py-2" placeholder="Unidad" value={itemForm.unidad_medida} onChange={(e) => setItemForm((p) => ({ ...p, unidad_medida: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="border rounded px-3 py-2" placeholder="Marca" value={itemForm.marca} onChange={(e) => setItemForm((p) => ({ ...p, marca: e.target.value }))} />
                <input className="border rounded px-3 py-2" placeholder="Presentación" value={itemForm.presentacion} onChange={(e) => setItemForm((p) => ({ ...p, presentacion: e.target.value }))} />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" min="0.0001" step="0.0001" className="border rounded px-3 py-2" placeholder="Factor" value={itemForm.factor_presentacion} onChange={(e) => setItemForm((p) => ({ ...p, factor_presentacion: e.target.value }))} />
                <input type="number" min="0" step="0.01" className="border rounded px-3 py-2" placeholder="Stock mín." value={itemForm.stock_minimo} onChange={(e) => setItemForm((p) => ({ ...p, stock_minimo: e.target.value }))} />
                <input type="number" min="0" step="0.01" className="border rounded px-3 py-2" placeholder="Stock crít." value={itemForm.stock_critico} onChange={(e) => setItemForm((p) => ({ ...p, stock_critico: e.target.value }))} />
                <select className="border rounded px-3 py-2" value={itemForm.controla_stock} onChange={(e) => setItemForm((p) => ({ ...p, controla_stock: Number(e.target.value) }))}>
                  <option value={1}>Controla stock</option>
                  <option value={0}>No controla</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm" disabled={savingItem}>{savingItem ? "Guardando..." : itemForm.id ? "Actualizar" : "Guardar"}</button>
                {itemForm.id ? (
                  <button type="button" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm" onClick={() => setItemForm(itemInicial)}>Cancelar</button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow border p-4">
            <h2 className="font-semibold mb-3">Registrar movimiento</h2>
            <form className="space-y-2" onSubmit={onSubmitMov}>
              <select className="w-full border rounded px-3 py-2" value={movForm.item_id} onChange={(e) => setMovForm((p) => ({ ...p, item_id: e.target.value }))} required>
                <option value="">Seleccionar ítem</option>
                {itemsActivos.map((it) => (
                  <option key={it.id} value={it.id}>{it.codigo} · {it.nombre} · Stock {Number(it.stock_actual || 0).toFixed(2)} {it.unidad_medida}</option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <select className="border rounded px-3 py-2" value={movForm.tipo} onChange={(e) => setMovForm((p) => ({ ...p, tipo: e.target.value }))}>
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                  <option value="ajuste_pos">Ajuste (+)</option>
                  <option value="ajuste_neg">Ajuste (-)</option>
                  <option value="merma">Merma</option>
                  <option value="vencido">Vencido</option>
                </select>
                <input type="number" min="0" step="0.0001" className="border rounded px-3 py-2" placeholder="Cantidad base" value={movForm.cantidad} onChange={(e) => setMovForm((p) => ({ ...p, cantidad: e.target.value }))} />
                <input type="number" min="0" step="0.0001" className="border rounded px-3 py-2" placeholder="Cant. presentación" value={movForm.cantidad_presentacion} onChange={(e) => setMovForm((p) => ({ ...p, cantidad_presentacion: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="border rounded px-3 py-2" placeholder="Lote (solo entrada)" value={movForm.lote_codigo} onChange={(e) => setMovForm((p) => ({ ...p, lote_codigo: e.target.value }))} />
                <input type="date" className="border rounded px-3 py-2" value={movForm.fecha_vencimiento} onChange={(e) => setMovForm((p) => ({ ...p, fecha_vencimiento: e.target.value }))} />
              </div>
              <input className="w-full border rounded px-3 py-2" placeholder="Observación" value={movForm.observacion} onChange={(e) => setMovForm((p) => ({ ...p, observacion: e.target.value }))} />
              <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm" disabled={savingMov}>{savingMov ? "Registrando..." : "Registrar movimiento"}</button>
            </form>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow border p-4">
          <form className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3" onSubmit={buscar}>
            <input className="border rounded px-3 py-2" placeholder="Buscar código/nombre" value={filtros.q} onChange={(e) => setFiltros((p) => ({ ...p, q: e.target.value }))} />
            <select className="border rounded px-3 py-2" value={filtros.categoria} onChange={(e) => setFiltros((p) => ({ ...p, categoria: e.target.value }))}>
              <option value="todos">Todas categorías</option>
              <option value="reactivo">Reactivo</option>
              <option value="insumo">Insumo</option>
              <option value="material">Material</option>
              <option value="activo_fijo">Activo fijo</option>
            </select>
            <select className="border rounded px-3 py-2" value={filtros.estado_stock} onChange={(e) => setFiltros((p) => ({ ...p, estado_stock: e.target.value }))}>
              <option value="todos">Todos estados</option>
              <option value="sin_stock">Sin stock</option>
              <option value="critico">Crítico</option>
              <option value="bajo">Bajo</option>
              <option value="ok">Óptimo</option>
            </select>
            <button className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded" disabled={loading}>{loading ? "Buscando..." : "Buscar"}</button>
          </form>

          <div className="max-h-[280px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-2 py-2">Código</th>
                  <th className="text-left px-2 py-2">Ítem</th>
                  <th className="text-left px-2 py-2">Categoría</th>
                  <th className="text-right px-2 py-2">Stock</th>
                  <th className="text-center px-2 py-2">Estado</th>
                  <th className="text-right px-2 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-500 py-4">Sin ítems</td></tr>
                ) : items.map((it) => (
                  <tr key={it.id} className="border-b">
                    <td className="px-2 py-2">{it.codigo}</td>
                    <td className="px-2 py-2">{it.nombre}</td>
                    <td className="px-2 py-2">{it.categoria}</td>
                    <td className="px-2 py-2 text-right">{Number(it.stock_actual || 0).toFixed(2)} {it.unidad_medida}</td>
                    <td className="px-2 py-2 text-center">{tipoLabel(it.estado_stock)}</td>
                    <td className="px-2 py-2 text-right">
                      <button className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200" onClick={() => onEditarItem(it)} type="button">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow border p-4">
            <h3 className="font-semibold mb-2">Movimientos recientes</h3>
            <div className="max-h-[220px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-2 py-2">Fecha</th>
                    <th className="text-left px-2 py-2">Ítem</th>
                    <th className="text-left px-2 py-2">Tipo</th>
                    <th className="text-right px-2 py-2">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-gray-500 py-4">Sin movimientos</td></tr>
                  ) : movimientos.map((m) => (
                    <tr key={m.id} className="border-b">
                      <td className="px-2 py-2">{m.fecha_hora ? new Date(m.fecha_hora).toLocaleString() : "-"}</td>
                      <td className="px-2 py-2">{m.codigo} {m.nombre}</td>
                      <td className="px-2 py-2">{m.tipo}</td>
                      <td className="px-2 py-2 text-right">{Number(m.cantidad || 0).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border p-4">
            <h3 className="font-semibold mb-2">Lotes por vencer (30 días)</h3>
            <div className="max-h-[220px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-2 py-2">Ítem</th>
                    <th className="text-left px-2 py-2">Lote</th>
                    <th className="text-left px-2 py-2">Vence</th>
                    <th className="text-right px-2 py-2">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lotesPorVencer.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-gray-500 py-4">Sin lotes por vencer</td></tr>
                  ) : lotesPorVencer.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="px-2 py-2">{l.codigo} {l.nombre}</td>
                      <td className="px-2 py-2">{l.lote_codigo}</td>
                      <td className="px-2 py-2">{l.fecha_vencimiento || "-"}</td>
                      <td className="px-2 py-2 text-right">{Number(l.cantidad_actual || 0).toFixed(2)} {l.unidad_medida}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
