import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuoteCart } from "../../context/QuoteCartContext";
import Swal from "sweetalert2";
import { BASE_URL } from "../../config/config";

export default function QuoteCartPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, total, count, removeItem, updateQuantity, clearCart } = useQuoteCart();
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const editingCotizacionId = searchParams.get("cotizacion_id");
  const isEditingCobro = Boolean(searchParams.get("cobro_id"));
  const isEditingCotizacion = Boolean(editingCotizacionId) && !isEditingCobro;

  const hasItems = cart.items.length > 0;

  const grouped = useMemo(() => {
    return cart.items.slice().sort((a, b) => String(a.source).localeCompare(String(b.source)));
  }, [cart.items]);

  const renderDerivacionInfo = (it) => {
    const esLab = String(it.serviceType || "").toLowerCase() === "laboratorio";
    if (!esLab || !it.derivado) return null;

    const laboratorio = String(it.laboratorioReferencia || "").trim() || "Laboratorio externo";
    const tipo = String(it.tipoDerivacion || "").toLowerCase();
    const valor = Number(it.valorDerivacion || 0);

    let costoTexto = "Sin costo";
    if (tipo === "monto") costoTexto = `S/ ${valor.toFixed(2)}`;
    if (tipo === "porcentaje") costoTexto = `${valor.toFixed(2)}%`;

    return (
      <div className="mt-1 text-[11px] text-amber-700 font-medium">
        Derivado: {laboratorio} / {costoTexto}
      </div>
    );
  };

  const crearConsultaDesdeCarrito = async (item) => {
    const res = await fetch(`${BASE_URL}api_consultas.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paciente_id: Number(cart.patientId),
        medico_id: Number(item.consultaMedicoId),
        fecha: item.consultaFecha,
        hora: item.consultaHora,
        tipo_consulta: item.consultaTipoConsulta || "programada",
        origen_creacion: "cotizador",
      }),
    });
    const data = await res.json();
    if (!data?.success || !data?.id) {
      throw new Error(data?.error || "No se pudo agendar la consulta automáticamente");
    }
    return Number(data.id);
  };

  const construirDetalles = () => {
    return cart.items.map((it) => {
      const cantidad = Math.max(1, Number(it.quantity || 1));
      const precioUnitario = Number(it.unitPrice || 0);
      const esLaboratorio = String(it.serviceType || "").toLowerCase() === "laboratorio";
      const derivado = esLaboratorio && Boolean(it.derivado);
      const esConsulta = String(it.serviceType || "").toLowerCase() === "consulta";
      const detalle = {
        servicio_tipo: String(it.serviceType || "procedimiento").toLowerCase(),
        servicio_id: Number(it.serviceId || 0),
        descripcion: it.description || "Servicio",
        cantidad,
        precio_unitario: precioUnitario,
        subtotal: Number((precioUnitario * cantidad).toFixed(2)),
        derivado,
        tipo_derivacion: derivado ? String(it.tipoDerivacion || "") : "",
        valor_derivacion: derivado ? Number(it.valorDerivacion || 0) : 0,
        laboratorio_referencia: derivado ? String(it.laboratorioReferencia || "") : "",
      };
      if (esConsulta) {
        detalle.medico_id = Number(it.consultaMedicoId || 0);
        detalle.consulta_id = Number(it.consultaId || 0);
      }
      return detalle;
    });
  };

  const buildDetalleKey = (d) => {
    const servicio = String(d?.servicio_tipo || "otros").toLowerCase();
    const servicioId = Number(d?.servicio_id || 0);
    const descripcion = String(d?.descripcion || "").trim().toLowerCase();
    const precio = Number(d?.precio_unitario || 0).toFixed(2);
    const derivado = Boolean(d?.derivado);
    const tipoDeriv = String(d?.tipo_derivacion || "").toLowerCase();
    const valorDeriv = Number(d?.valor_derivacion || 0).toFixed(2);
    const labRef = String(d?.laboratorio_referencia || "").trim().toLowerCase();
    return [servicio, servicioId, descripcion, precio, derivado ? "1" : "0", tipoDeriv, valorDeriv, labRef].join("::");
  };

  const normalizarDetalle = (d) => {
    const cantidad = Math.max(1, Number(d?.cantidad || 1));
    const precio = Number(d?.precio_unitario || 0);
    const subtotal = Number((precio * cantidad).toFixed(2));
    return {
      ...d,
      servicio_tipo: String(d?.servicio_tipo || "procedimiento").toLowerCase(),
      servicio_id: Number(d?.servicio_id || 0),
      cantidad,
      precio_unitario: precio,
      subtotal,
      derivado: Boolean(d?.derivado),
      tipo_derivacion: d?.derivado ? String(d?.tipo_derivacion || "") : "",
      valor_derivacion: d?.derivado ? Number(d?.valor_derivacion || 0) : 0,
      laboratorio_referencia: d?.derivado ? String(d?.laboratorio_referencia || "") : "",
    };
  };

  const mergeDetalles = (baseDetalles, cartDetalles) => {
    const map = new Map();

    for (const d of baseDetalles || []) {
      const nd = normalizarDetalle(d);
      map.set(buildDetalleKey(nd), nd);
    }

    for (const d of cartDetalles || []) {
      const nd = normalizarDetalle(d);
      const key = buildDetalleKey(nd);
      if (map.has(key)) {
        const old = map.get(key);
        const cantidad = Number(old.cantidad || 0) + Number(nd.cantidad || 0);
        const precio = Number(old.precio_unitario || nd.precio_unitario || 0);
        map.set(key, {
          ...old,
          cantidad,
          subtotal: Number((precio * cantidad).toFixed(2)),
        });
      } else {
        map.set(key, nd);
      }
    }

    return Array.from(map.values());
  };

  const obtenerCotizacionActual = async (cotizacionId) => {
    const res = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`, {
      credentials: "include",
    });
    const data = await res.json();
    if (!data?.success || !data?.cotizacion) {
      throw new Error(data?.error || "No se pudo cargar la cotizacion en edicion");
    }
    return data.cotizacion;
  };

  const registrarCotizacionCarrito = async (irACobro = false) => {
    if (saving) return;
    const pacienteRegistradoId = Number(cart.patientId || 0);
    const pacienteNombre = String(cart.patientName || '').trim() || 'Particular';
    if (cart.items.length === 0) {
      await Swal.fire("Atencion", "El carrito no tiene paciente o items validos.", "info");
      return;
    }

    const detalles = construirDetalles();
    if (!detalles.length) {
      await Swal.fire("Atencion", "No hay detalles validos para registrar.", "info");
      return;
    }

    setSaving(true);
    try {
      const resumenServicios = Array.from(new Set(detalles.map((d) => String(d.servicio_tipo || "otros"))));
      const confirm = await Swal.fire({
        title: irACobro ? "Registrar y cobrar cotización" : "Registrar nueva cotización",
        text: `${pacienteRegistradoId > 0 ? `Paciente #${pacienteRegistradoId}` : pacienteNombre} | ${detalles.length} item(s) | Servicios: ${resumenServicios.join(", ")}`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: irACobro ? "Registrar y cobrar" : "Registrar cotización",
        cancelButtonText: "Cancelar",
      });
      if (!confirm.isConfirmed) {
        setSaving(false);
        return;
      }

      // Auto-crear consultas pendientes para items de tipo consulta que aún no tienen consulta_id
      for (let i = 0; i < detalles.length; i++) {
        const d = detalles[i];
        const cartItem = cart.items[i];
        if (
          String(d.servicio_tipo).toLowerCase() === "consulta" &&
          !d.consulta_id &&
          cartItem?.consultaMedicoId &&
          cartItem?.consultaFecha &&
          cartItem?.consultaHora
        ) {
          const consultaId = await crearConsultaDesdeCarrito(cartItem);
          detalles[i].consulta_id = consultaId;
          detalles[i].medico_id = Number(cartItem.consultaMedicoId);
        }

        if (String(d.servicio_tipo).toLowerCase() === "consulta") {
          detalles[i].consulta_id = Number(detalles[i].consulta_id || cartItem?.consultaId || 0);
          detalles[i].medico_id = Number(detalles[i].medico_id || cartItem?.consultaMedicoId || 0);

          if (Number(detalles[i].consulta_id || 0) <= 0) {
            throw new Error("La consulta del carrito no tiene una atencion vinculada. Vuelve a agregar la consulta antes de registrar la cotizacion.");
          }
        }
      }

      let payload;
      let cotizacionIdDestino = null;

      if (isEditingCotizacion && editingCotizacionId) {
        const cotizacionActual = await obtenerCotizacionActual(editingCotizacionId);
        if (Number(cotizacionActual?.paciente_id || 0) !== Number(cart.patientId || 0)) {
          throw new Error("El carrito pertenece a otro paciente y no puede actualizar esta cotizacion.");
        }

        const baseDetalles = Array.isArray(cotizacionActual.detalles) ? cotizacionActual.detalles : [];
        const detallesFinales = mergeDetalles(baseDetalles, detalles);
        const totalFinal = detallesFinales.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0);

        payload = {
          accion: "editar",
          cotizacion_id: Number(editingCotizacionId),
          detalles: detallesFinales,
          total: Number(totalFinal || 0),
          motivo: "Actualizacion de cotizacion desde carrito en modo edicion",
        };
        cotizacionIdDestino = Number(editingCotizacionId);
      } else {
        payload = {
          paciente_id: pacienteRegistradoId > 0 ? pacienteRegistradoId : null,
          paciente_nombre: pacienteNombre,
          total: Number(total || 0),
          detalles,
          observaciones: "Cotizacion unificada creada desde carrito global",
        };
      }

      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      const cotizacionIdCreada = Number(data?.cotizacion_id || 0);
      const cotizacionIdFinal = cotizacionIdDestino || cotizacionIdCreada;

      if (!data?.success || !cotizacionIdFinal) {
        throw new Error(data?.error || (isEditingCotizacion ? "No se pudo actualizar la cotizacion" : "No se pudo registrar la cotizacion"));
      }

      clearCart();

      if (irACobro) {
        navigate(`/cobrar-cotizacion/${Number(cotizacionIdFinal)}`);
        return;
      }

      await Swal.fire(
        "Listo",
        isEditingCotizacion
          ? `Cotizacion #${cotizacionIdFinal} actualizada correctamente.`
          : `Cotizacion #${cotizacionIdFinal} registrada correctamente.`,
        "success"
      );
      navigate("/cotizaciones");
    } catch (err) {
      await Swal.fire("Error", err?.message || "No se pudo registrar la cotizacion", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!hasItems) return null;

  return (
    <>
      {open ? (
        <aside className="hidden xl:block fixed right-4 top-24 z-40 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
            <div>
              <div className="font-semibold">Carrito de Cotizacion</div>
              <div className="text-xs text-white/90">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
            </div>
            <button
              className="text-white/90 hover:text-white text-sm"
              onClick={() => setOpen(false)}
              title="Ocultar carrito"
            >
              -
            </button>
          </div>

          <div className="p-3">
            <div className="text-xs text-gray-500 mb-2">Items: {count}</div>
            <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded">
              {grouped.map((it) => (
                <li key={it.key} className="p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-indigo-600 font-semibold">{it.source}</div>
                      <div className="text-sm font-medium text-gray-800 truncate">{it.description}</div>
                      <div className="text-xs text-gray-500">S/ {Number(it.unitPrice || 0).toFixed(2)} c/u</div>
                      {renderDerivacionInfo(it)}
                    </div>
                    <button
                      onClick={() => removeItem(it.key)}
                      className="text-xs text-red-600 hover:text-red-700"
                      title="Quitar"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(it.key, Number(it.quantity || 1) - 1)}
                        className="w-6 h-6 rounded border border-gray-300 text-gray-700"
                      >
                        -
                      </button>
                      <span className="text-sm w-6 text-center">{Number(it.quantity || 1)}</span>
                      <button
                        onClick={() => updateQuantity(it.key, Number(it.quantity || 1) + 1)}
                        className="w-6 h-6 rounded border border-gray-300 text-gray-700"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-sm font-semibold text-green-700">
                      S/ {(Number(it.unitPrice || 0) * Number(it.quantity || 0)).toFixed(2)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-green-700">S/ {total.toFixed(2)}</span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                onClick={() => registrarCotizacionCarrito(true)}
                disabled={saving}
                className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
              >
                {saving ? "Procesando..." : "Registrar y cobrar"}
              </button>
              <button
                onClick={() => registrarCotizacionCarrito(false)}
                disabled={saving}
                className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
              >
                Registrar cotizacion
              </button>
              <button
                onClick={() => navigate("/cotizaciones")}
                className="w-full py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
              >
                Ir a Cotizaciones
              </button>
              <button
                onClick={clearCart}
                disabled={saving}
                className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Vaciar carrito
              </button>
            </div>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden xl:flex fixed right-0 top-40 z-40 items-center gap-2 rounded-l-xl border border-r-0 border-indigo-300 bg-indigo-600 px-3 py-3 text-white shadow-lg hover:bg-indigo-700"
          title="Mostrar carrito"
        >
          <span className="text-sm font-semibold">Carrito</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{count}</span>
        </button>
      )}
    </>
  );
}
