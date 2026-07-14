import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuoteCart } from "../../context/QuoteCartContext";
import Swal from "sweetalert2";
import { authFetch } from "../../utils/apiClient";

function getLimaDate() {
  const now = new Date();
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = partes.find((p) => p.type === "year")?.value;
  const month = partes.find((p) => p.type === "month")?.value;
  const day = partes.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getLimaTime() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  return `${hour}:${minute}`;
}

function esServicioProgramableParaAgenda(servicioTipo) {
  const tipo = String(servicioTipo || "").toLowerCase();
  return tipo !== "farmacia";
}

function esConsultaProgramadaDelCarrito(item) {
  const esConsulta = String(item?.serviceType || "").toLowerCase() === "consulta";
  if (!esConsulta) return false;
  const tipoConsulta = String(item?.consultaTipoConsulta || "programada").toLowerCase();
  return tipoConsulta === "programada";
}

const XL_BREAKPOINT = 1280;

export default function QuoteCartPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart, total, count, removeItem, updateQuantity, clearCart } = useQuoteCart();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    typeof window !== "undefined" ? window.innerWidth >= XL_BREAKPOINT : true
  );
  const [saving, setSaving] = useState(false);
  const [aplicarProgramacionGlobal, setAplicarProgramacionGlobal] = useState(true);
  const [fechaProgramacionGlobal, setFechaProgramacionGlobal] = useState(getLimaDate());
  const [horaProgramacionGlobal, setHoraProgramacionGlobal] = useState(getLimaTime());
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const editingCotizacionId = searchParams.get("cotizacion_id");
  const isEditingCobro = Boolean(searchParams.get("cobro_id"));
  const isEditingCotizacion = Boolean(editingCotizacionId) && !isEditingCobro;

  const hasItems = cart.items.length > 0;
  const hayServiciosProgramables = useMemo(
    () => cart.items.some((it) => esServicioProgramableParaAgenda(it?.serviceType)),
    [cart.items]
  );
  const hayConsultaProgramadaEnCarrito = useMemo(
    () => cart.items.some((it) => esConsultaProgramadaDelCarrito(it)),
    [cart.items]
  );

  const grouped = useMemo(() => {
    return cart.items.slice().sort((a, b) => String(a.source).localeCompare(String(b.source)));
  }, [cart.items]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => {
      setIsDesktopViewport(window.innerWidth >= XL_BREAKPOINT);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isDesktopViewport && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isDesktopViewport, mobileOpen]);

  useEffect(() => {
    if (!hasItems && mobileOpen) {
      setMobileOpen(false);
    }
  }, [hasItems, mobileOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (isDesktopViewport || !mobileOpen) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isDesktopViewport, mobileOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!mobileOpen) return undefined;

    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [mobileOpen]);

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

  const crearConsultaDesdeCarrito = async (item, overrides = {}) => {
    const tipoConsultaItem = String(item?.consultaTipoConsulta || "programada").toLowerCase();
    const esReservaSinTurno = tipoConsultaItem === "reservada_sin_turno";
    const tipoConsultaPersistible = esReservaSinTurno ? "programada" : (item.consultaTipoConsulta || "programada");
    const origenCreacion = esReservaSinTurno ? "reservada_sin_turno" : "cotizador";
    const fechaConsulta = String(overrides?.consultaFecha || item?.consultaFecha || "").slice(0, 10);
    const horaConsulta = String(overrides?.consultaHora || item?.consultaHora || "").slice(0, 5);

    const res = await authFetch("api_consultas.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paciente_id: Number(cart.patientId),
        medico_id: Number(item.consultaMedicoId),
        fecha: fechaConsulta,
        hora: horaConsulta,
        tipo_consulta: tipoConsultaPersistible,
        origen_creacion: origenCreacion,
      }),
    });
    const data = await res.json();
    if (!data?.success || !data?.id) {
      throw new Error(data?.error || "No se pudo agendar la consulta automáticamente");
    }
    return Number(data.id);
  };

  const construirDetalles = () => {
    const fechaGlobal = String(fechaProgramacionGlobal || "").slice(0, 10);
    const horaGlobal = String(horaProgramacionGlobal || "").slice(0, 5);

    return cart.items.map((it) => {
      const cantidad = Math.max(1, Number(it.quantity || 1));
      const precioUnitario = Number(it.unitPrice || 0);
      const esLaboratorio = String(it.serviceType || "").toLowerCase() === "laboratorio";
      const derivado = esLaboratorio && Boolean(it.derivado);
      const esConsulta = String(it.serviceType || "").toLowerCase() === "consulta";
      const consultaProgramada = esConsultaProgramadaDelCarrito(it);
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
        paquete_id: Number(it.packageId || 0) || null,
        paquete_codigo: String(it.packageCode || ""),
        paquete_tipo: String(it.packageType || ""),
        componentes: Array.isArray(it.componentes) ? it.componentes : [],
        cotizacion_id: Number(it.cotizacionId || 0) || null,
        fecha_programada: String(it.fechaProgramada || it.fecha_programada || ""),
        hora_programada: String(it.horaProgramada || it.hora_programada || ""),
      };

      if (
        aplicarProgramacionGlobal
        && esServicioProgramableParaAgenda(detalle.servicio_tipo)
        && fechaGlobal
        && horaGlobal
        && !consultaProgramada
      ) {
        detalle.fecha_programada = fechaGlobal;
        detalle.hora_programada = horaGlobal;
      }

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
    const paqueteId = Number(d?.paquete_id || 0);
    const paqueteTipo = String(d?.paquete_tipo || "").toLowerCase();
    const fechaProgramada = String(d?.fecha_programada || "").slice(0, 10);
    const horaProgramada = String(d?.hora_programada || "").slice(0, 5);
    return [servicio, servicioId, descripcion, precio, derivado ? "1" : "0", tipoDeriv, valorDeriv, labRef, paqueteId, paqueteTipo, fechaProgramada, horaProgramada].join("::");
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
      paquete_id: Number(d?.paquete_id || 0) || null,
      paquete_codigo: String(d?.paquete_codigo || ""),
      paquete_tipo: String(d?.paquete_tipo || ""),
      componentes: Array.isArray(d?.componentes) ? d.componentes : [],
      fecha_programada: String(d?.fecha_programada || ""),
      hora_programada: String(d?.hora_programada || ""),
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
    const res = await authFetch(`api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`);
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

      const fechaGlobal = String(fechaProgramacionGlobal || "").slice(0, 10);
      const horaGlobal = String(horaProgramacionGlobal || "").slice(0, 5);
      const usarProgramacionGlobal = aplicarProgramacionGlobal && Boolean(fechaGlobal) && Boolean(horaGlobal);
      const esPacienteTemporal = pacienteRegistradoId <= 0;

      // Auto-crear consultas pendientes para items de tipo consulta que aún no tienen consulta_id
      for (let i = 0; i < detalles.length; i++) {
        const d = detalles[i];
        const cartItem = cart.items[i];
        const consultaProgramada = esConsultaProgramadaDelCarrito(cartItem);
        const consultaFechaFinal = (usarProgramacionGlobal && !consultaProgramada)
          ? fechaGlobal
          : String(cartItem?.consultaFecha || "").slice(0, 10);
        const consultaHoraFinal = (usarProgramacionGlobal && !consultaProgramada)
          ? horaGlobal
          : String(cartItem?.consultaHora || "").slice(0, 5);

        if (
          String(d.servicio_tipo).toLowerCase() === "consulta" &&
          !esPacienteTemporal &&
          !d.consulta_id &&
          cartItem?.consultaMedicoId &&
          consultaFechaFinal &&
          consultaHoraFinal
        ) {
          const consultaId = await crearConsultaDesdeCarrito(cartItem, {
            consultaFecha: consultaFechaFinal,
            consultaHora: consultaHoraFinal,
          });
          detalles[i].consulta_id = consultaId;
          detalles[i].medico_id = Number(cartItem.consultaMedicoId);
        }

        if (String(d.servicio_tipo).toLowerCase() === "consulta") {
          if (consultaFechaFinal && consultaHoraFinal) {
            detalles[i].fecha_programada = consultaFechaFinal;
            detalles[i].hora_programada = consultaHoraFinal;
          }
          detalles[i].consulta_id = Number(detalles[i].consulta_id || cartItem?.consultaId || 0);
          detalles[i].medico_id = Number(detalles[i].medico_id || cartItem?.consultaMedicoId || 0);

          if (!esPacienteTemporal && Number(detalles[i].consulta_id || 0) <= 0) {
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
        const esCotizacionInformativa = pacienteRegistradoId <= 0;
        payload = {
          paciente_id: pacienteRegistradoId > 0 ? pacienteRegistradoId : 0,
          paciente_nombre: pacienteNombre,
          paciente_dni: esCotizacionInformativa ? "-" : undefined,
          modo_cotizacion: esCotizacionInformativa ? "informativa" : undefined,
          solo_ticket: esCotizacionInformativa ? 1 : undefined,
          total: Number(total || 0),
          detalles,
          observaciones: esCotizacionInformativa
            ? "Cotizacion informativa unificada creada desde carrito global"
            : "Cotizacion unificada creada desde carrito global",
        };
      }

      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
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

  const renderCartBody = ({
    listMaxHeightClass = "max-h-72",
    wrapperClassName = "p-3",
  } = {}) => (
    <div className={wrapperClassName}>
      <div className="text-xs text-gray-500 mb-2">Items: {count}</div>
      <ul className={`${listMaxHeightClass} overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded`}>
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

      {hayServiciosProgramables && (
        <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
          <label className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
            <input
              type="checkbox"
              checked={aplicarProgramacionGlobal}
              onChange={(e) => setAplicarProgramacionGlobal(e.target.checked)}
            />
            Aplicar fecha/hora global al registrar
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={fechaProgramacionGlobal}
              onChange={(e) => setFechaProgramacionGlobal(e.target.value)}
              disabled={!aplicarProgramacionGlobal}
              className="rounded border border-indigo-200 px-2 py-1 text-xs disabled:bg-gray-100"
            />
            <input
              type="time"
              value={horaProgramacionGlobal}
              onChange={(e) => setHoraProgramacionGlobal(e.target.value)}
              disabled={!aplicarProgramacionGlobal}
              className="rounded border border-indigo-200 px-2 py-1 text-xs disabled:bg-gray-100"
            />
          </div>
          {hayConsultaProgramadaEnCarrito && (
            <div className="mt-2 text-[11px] text-slate-600">
              La consulta programada conserva su horario elegido con el médico. La programación global aplica al resto de servicios.
            </div>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => registrarCotizacionCarrito(true)}
          disabled={saving}
          className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
        >
          {saving ? "Procesando..." : "Registrar y cobrar"}
        </button>
        <button
          type="button"
          onClick={() => registrarCotizacionCarrito(false)}
          disabled={saving}
          className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
        >
          Registrar cotizacion
        </button>
        <button
          type="button"
          onClick={() => navigate("/cotizaciones")}
          className="w-full py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700"
        >
          Ir a Atenciones
        </button>
        <button
          type="button"
          onClick={clearCart}
          disabled={saving}
          className={`w-full py-2 rounded font-semibold ${saving ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Vaciar carrito
        </button>
      </div>
    </div>
  );

  if (!hasItems) return null;

  return (
    <>
      {desktopOpen ? (
        <aside className="hidden xl:block fixed right-4 top-24 z-40 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
            <div>
              <div className="font-semibold">Carrito de Cotizacion</div>
              <div className="text-xs text-white/90">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
            </div>
            <button
              className="text-white/90 hover:text-white text-sm"
              onClick={() => setDesktopOpen(false)}
              title="Ocultar carrito"
            >
              -
            </button>
          </div>
          {renderCartBody()}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setDesktopOpen(true)}
          className="hidden xl:flex fixed right-0 top-40 z-40 items-center gap-2 rounded-l-xl border border-r-0 border-indigo-300 bg-indigo-600 px-3 py-3 text-white shadow-lg hover:bg-indigo-700"
          title="Mostrar carrito"
        >
          <span className="text-sm font-semibold">Carrito</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{count}</span>
        </button>
      )}

      <div className="xl:hidden fixed bottom-4 left-3 right-24 sm:right-4 z-[10010]">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="w-full rounded-xl bg-indigo-600 text-white shadow-lg px-3 py-3 flex items-center justify-between gap-3"
          aria-label="Abrir carrito de cotizacion"
        >
          <div className="min-w-0 text-left">
            <div className="text-xs text-white/90">Carrito de cotizacion</div>
            <div className="font-semibold truncate">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-white/90">{count} item(s)</div>
            <div className="font-bold">S/ {total.toFixed(2)}</div>
          </div>
        </button>
      </div>

      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 z-[10020]">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar carrito"
          />

          <aside className="absolute bottom-0 left-0 right-0 max-h-[86vh] bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 flex flex-col overflow-hidden">
            <div className="pt-2 pb-1 flex items-center justify-center">
              <span className="h-1.5 w-12 rounded-full bg-gray-300" aria-hidden="true" />
            </div>

            <div className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between">
              <div>
                <div className="font-semibold">Carrito de Cotizacion</div>
                <div className="text-xs text-white/90">{cart.patientName || `Paciente #${cart.patientId || ""}`}</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-white/90 hover:text-white text-sm"
                title="Cerrar"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderCartBody({
                listMaxHeightClass: "max-h-none",
                wrapperClassName: "p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
              })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
