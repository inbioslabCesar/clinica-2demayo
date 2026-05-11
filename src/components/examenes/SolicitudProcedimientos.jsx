import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../../utils/apiClient";

function toMoney(v) {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const ESTADO_BADGE = {
  pendiente:  "bg-yellow-100 text-yellow-800",
  completado: "bg-green-100 text-green-800",
  cancelado:  "bg-red-100 text-red-600",
};

export default function SolicitudProcedimientos({ consultaId }) {
  const [catalogo, setCatalogo] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [buscar, setBuscar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'ok'|'error', texto }
  const [ordenes, setOrdenes] = useState([]);
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [loadingOrdenes, setLoadingOrdenes] = useState(false);

  const cargarCatalogo = async () => {
    setLoadingCatalogo(true);
    try {
      const res = await authFetch("api_tarifas.php?servicio_tipo=procedimientos", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      const items = Array.isArray(data?.tarifas) ? data.tarifas : [];
      const normalized = items
        .filter((t) => Number(t?.activo || 0) === 1)
        .map((t) => ({
          id: Number(t.id || 0),
          descripcion: String(t.descripcion || "Procedimiento").trim(),
          precio: toMoney(t.precio_particular),
        }))
        .filter((t) => t.id > 0);
      setCatalogo(normalized);
    } catch {
      setCatalogo([]);
    } finally {
      setLoadingCatalogo(false);
    }
  };

  const cargarOrdenes = async () => {
    if (!consultaId) { setOrdenes([]); return; }
    setLoadingOrdenes(true);
    try {
      const res = await authFetch(`api_ordenes_procedimientos.php?consulta_id=${Number(consultaId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      setOrdenes(Array.isArray(data?.ordenes) ? data.ordenes : []);
    } catch {
      setOrdenes([]);
    } finally {
      setLoadingOrdenes(false);
    }
  };

  useEffect(() => {
    cargarOrdenes().catch(() => {});
  }, [consultaId]);

  const abrirPanel = () => {
    if (catalogo.length === 0) cargarCatalogo().catch(() => {});
    setSeleccionados([]);
    setBuscar("");
    setMensaje(null);
    setPanelAbierto(true);
  };

  const cerrarPanel = () => {
    setPanelAbierto(false);
    setSeleccionados([]);
    setBuscar("");
    setMensaje(null);
  };

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return catalogo;
    return catalogo.filter((p) => p.descripcion.toLowerCase().includes(q));
  }, [catalogo, buscar]);

  const seleccionadosDetalle = useMemo(() => {
    const setSel = new Set(seleccionados.map((x) => Number(x)));
    return catalogo.filter((c) => setSel.has(Number(c.id)));
  }, [catalogo, seleccionados]);

  const toggle = (id) => {
    const nid = Number(id);
    setSeleccionados((prev) => (prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]));
  };

  const guardar = async () => {
    if (!consultaId || seleccionados.length === 0) {
      setMensaje({ tipo: "error", texto: "Selecciona al menos un procedimiento." });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await authFetch("api_ordenes_procedimientos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta_id: Number(consultaId), procedimientos: seleccionados }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo guardar la solicitud");

      const consolidada = String(data?.modo || "").toLowerCase() === "consolidada";
      const comprobante = data?.numero_comprobante
        ? ` · Cotización ${data.numero_comprobante}`
        : "";
      setMensaje({
        tipo: "ok",
        texto: consolidada
          ? `Solicitud actualizada${comprobante}.`
          : `Solicitud guardada${comprobante}.`,
      });
      setSeleccionados([]);
      await cargarOrdenes();
      // Cerrar panel automáticamente tras guardar con éxito
      setTimeout(() => setPanelAbierto(false), 1200);
    } catch (err) {
      setMensaje({ tipo: "error", texto: err?.message || "Intente nuevamente." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Botón principal ── */}
      <button
        type="button"
        onClick={abrirPanel}
        className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition text-sm font-semibold"
      >
        🛠️ Solicitar procedimiento
      </button>

      {/* ── Panel de selección (colapsable) ── */}
      {panelAbierto && (
        <div className="border border-emerald-200 rounded-xl bg-white shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-800 text-sm">Selecciona procedimientos</span>
            <button
              type="button"
              onClick={cerrarPanel}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              title="Cerrar"
            >
              ✕
            </button>
          </div>

          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar procedimiento..."
            className="w-full border rounded px-3 py-2 text-sm"
          />

          {/* Lista de catálogo */}
          <div className="max-h-56 overflow-y-auto border rounded divide-y">
            {loadingCatalogo && (
              <div className="p-3 text-sm text-gray-400">Cargando...</div>
            )}
            {!loadingCatalogo && filtrados.length === 0 && (
              <div className="p-3 text-sm text-gray-500">No hay procedimientos disponibles.</div>
            )}
            {filtrados.map((p) => (
              <label
                key={p.id}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer select-none hover:bg-emerald-50 transition ${seleccionados.includes(p.id) ? "bg-emerald-50" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-emerald-600"
                  />
                  <span>{p.descripcion}</span>
                </span>
              </label>
            ))}
          </div>

          {/* Resumen seleccionados */}
          {seleccionadosDetalle.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm">
              <div className="font-semibold text-emerald-800 mb-1">
                {seleccionadosDetalle.length} seleccionado{seleccionadosDetalle.length > 1 ? "s" : ""}
              </div>
              <ul className="list-disc ml-5 text-emerald-900 space-y-0.5">
                {seleccionadosDetalle.map((p) => (
                  <li key={p.id}>{p.descripcion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback */}
          {mensaje && (
            <div className={`rounded p-2.5 text-sm ${mensaje.tipo === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
              {mensaje.tipo === "ok" ? "✅ " : "⚠️ "}{mensaje.texto}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cerrarPanel}
              className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando || seleccionados.length === 0}
              className={`px-4 py-1.5 rounded font-semibold text-white text-sm transition ${guardando || seleccionados.length === 0 ? "bg-gray-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
            >
              {guardando ? "Guardando..." : "Guardar solicitud"}
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de solicitudes existentes ── */}
      {loadingOrdenes && <p className="text-xs text-gray-400">Cargando solicitudes...</p>}

      {!loadingOrdenes && ordenes.length === 0 && (
        <p className="text-sm text-gray-500">No hay procedimientos solicitados para esta consulta.</p>
      )}

      {ordenes.map((o) => {
        const estado = String(o.estado || "pendiente").toLowerCase();
        const procs = Array.isArray(o.procedimientos) ? o.procedimientos : [];
        const cotizacion = o.cotizacion || null;
        const esPagada = ["pagado", "completado", "control", "contrato"].includes(
          String(cotizacion?.estado || "").toLowerCase()
        );
        return (
          <div key={o.id} className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">🛠️</span>
                <span className="font-semibold text-gray-700 text-sm">Solicitud #{o.id}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ESTADO_BADGE[estado] || "bg-gray-100 text-gray-600"}`}>
                  {estado}
                </span>
                {procs.length > 0 && (
                  <span className="text-xs text-gray-500">— {procs.map((p) => p.descripcion).join(" · ")}</span>
                )}
              </div>
              {cotizacion && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${esPagada ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-700"}`}>
                  {esPagada ? "💰 Pagado" : `⏳ Pendiente pago · ${cotizacion.numero_comprobante || ""}`}
                </span>
              )}
            </div>
            {procs.length > 0 && (
              <ul className="mt-2 pl-7 space-y-0.5">
                {procs.map((p) => (
                  <li key={`${o.id}-${p.id}`} className="text-xs text-gray-600">
                    <span>{p.descripcion}</span>
                  </li>
                ))}
              </ul>
            )}
            {o.fecha && (
              <p className="text-[10px] text-gray-400 mt-1.5 pl-7">
                Solicitado: {new Date(o.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
