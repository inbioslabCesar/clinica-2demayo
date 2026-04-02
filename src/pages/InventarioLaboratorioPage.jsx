import { useEffect, useMemo, useState } from "react";
import { BASE_URL } from "../config/config";

const initialRecetaForm = {
  id_examen: "",
  item_id: "",
  cantidad_por_prueba: "",
  activo: 1,
  observacion: "",
};

const initialTransferForm = {
  item_id: "",
  cantidad: "",
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

  const canTransfer = useMemo(() => {
    try {
      const usuarioRaw = sessionStorage.getItem("usuario");
      if (!usuarioRaw) {
        return false;
      }
      const usuario = JSON.parse(usuarioRaw);
      const rol = String(usuario?.rol || "").toLowerCase();
      return ["administrador", "quimico", "químico"].includes(rol);
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

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [resRecetas, resTransfers, resStock] = await Promise.all([
        fetch(`${BASE_URL}api_inventario_recetas.php?catalogo=1`, { credentials: "include" }),
        fetch(`${BASE_URL}api_inventario_transferencias.php?limit=50`, { credentials: "include" }),
        fetch(`${BASE_URL}api_inventario_transferencias.php?accion=stock_interno`, { credentials: "include" }),
      ]);

      const dataRecetas = await resRecetas.json();
      const dataTransfers = await resTransfers.json();
      const dataStock = await resStock.json();

      if (!dataRecetas?.success) {
        throw new Error(dataRecetas?.error || "No se pudo cargar recetas");
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
  };

  useEffect(() => {
    fetchAll();
  }, []);

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
      const res = await fetch(`${BASE_URL}api_inventario_recetas.php`, {
        method,
        credentials: "include",
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
      const res = await fetch(`${BASE_URL}api_inventario_recetas.php`, {
        method: "DELETE",
        credentials: "include",
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
    const cantidad = Number(transferForm.cantidad);
    if (!itemId || !cantidad || cantidad <= 0) {
      setError("Completa ítem y cantidad de transferencia.");
      return;
    }

    setSavingTransfer(true);
    try {
      const res = await fetch(`${BASE_URL}api_inventario_transferencias.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          cantidad,
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

                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Cantidad a transferir"
                  value={transferForm.cantidad}
                  onChange={(e) => setTransferForm((prev) => ({ ...prev, cantidad: e.target.value }))}
                />

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
                Solo el rol administrador/almacén puede registrar transferencias internas.
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
                    </tr>
                  </thead>
                  <tbody>
                    {stockInterno.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-gray-500 py-4">Sin movimientos internos</td>
                      </tr>
                    ) : (
                      stockInterno.map((row) => (
                        <tr key={row.id} className="border-b">
                          <td className="px-2 py-2">{row.codigo} {row.nombre}</td>
                          <td className="px-2 py-2 text-right">{Number(row.transferido || 0).toFixed(4)}</td>
                          <td className="px-2 py-2 text-right">{Number(row.consumido || 0).toFixed(4)}</td>
                          <td className="px-2 py-2 text-right font-semibold">{Number(row.saldo || 0).toFixed(4)}</td>
                        </tr>
                      ))
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
                      <th className="text-right px-2 py-2">Items</th>
                      <th className="text-right px-2 py-2">Cant.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferencias.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-gray-500 py-4">Sin transferencias</td>
                      </tr>
                    ) : (
                      transferencias.map((t) => (
                        <tr key={t.id} className="border-b">
                          <td className="px-2 py-2">#{t.id}</td>
                          <td className="px-2 py-2">{t.fecha_hora ? new Date(t.fecha_hora).toLocaleString() : "-"}</td>
                          <td className="px-2 py-2 text-right">{Number(t.items_count || 0)}</td>
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
      </div>
    </div>
  );
}
