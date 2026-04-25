import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { FaPlus, FaTimes } from "react-icons/fa";
import PacienteListSearch from "../components/paciente-list/PacienteListSearch.jsx";
import { BASE_URL } from "../config/config";
import { useQuoteCart } from "../context/QuoteCartContext";
import Swal from "sweetalert2";
// import withReactContent from "sweetalert2-react-content";

export default function FarmaciaCotizadorPage({ usuario }) {
  const FETCH_TIMEOUT_MS = 12000;

  const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return await res.json();
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const imprimirTicketRecepcion = ({ codigo, paciente, total, vencimiento }) => {
    const fechaEmision = new Date().toLocaleString();
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Ticket de cobro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      .box { border: 1px dashed #666; padding: 12px; max-width: 360px; }
      h2 { margin: 0 0 8px; font-size: 18px; }
      .code { font-size: 28px; font-weight: 700; letter-spacing: 1px; margin: 8px 0; }
      .row { margin: 4px 0; font-size: 14px; }
      .muted { color: #555; font-size: 12px; margin-top: 10px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Enviar a recepcion</h2>
      <div class="row"><strong>Codigo:</strong></div>
      <div class="code">${codigo}</div>
      <div class="row"><strong>Paciente:</strong> ${paciente}</div>
      <div class="row"><strong>Total:</strong> S/ ${Number(total || 0).toFixed(2)}</div>
      <div class="row"><strong>Vence:</strong> ${vencimiento || "No definido"}</div>
      <div class="muted">Emitido: ${fechaEmision}</div>
    </div>
    <script>window.onload = function(){ window.print(); };</script>
  </body>
</html>`;

    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const obtenerDetallesCotizacion = async (targetCotizacionId) => {
    const data = await fetchJsonWithTimeout(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(targetCotizacionId)}`, {
      credentials: "include",
    });
    if (!data?.success || !data?.cotizacion) {
      throw new Error(data?.error || "No se pudo cargar la cotización actual para edición");
    }
    return Array.isArray(data.cotizacion.detalles) ? data.cotizacion.detalles : [];
  };

  const construirDetallesEditados = async (cotizacionId, detallesFarmacia) => {
    const base = cotizacionDetallesOriginales.length > 0
      ? cotizacionDetallesOriginales
      : await obtenerDetallesCotizacion(cotizacionId);
    const detallesNoFarmacia = base.filter((d) => String(d?.servicio_tipo || "").toLowerCase() !== "farmacia");
    return [...detallesNoFarmacia, ...detallesFarmacia];
  };

  // Handler para registrar cotización (o editar cotización existente)
  const handleRegistrarVenta = async ({ irACobro = false } = {}) => {
    const sp = new URLSearchParams(location.search);
    const cotizacionId = sp.get('cotizacion_id');
    const pacienteRegistradoId = Number(pacienteId || pacienteDatos?.id || 0);
    const nombreManualCompleto = `${manualNombres} ${manualApellidos}`.trim();
    const pacienteNombrePayload = (pacienteDatos?.nombre || nombreManualCompleto || 'Particular').trim();
    const pacienteDniPayload = String(pacienteDatos?.dni || manualDni || '').trim();

    if (!cotizacionId && seleccionados.length === 0) {
      setMensaje("Selecciona al menos un medicamento.");
      return;
    }
    // Construir detalles para cotización, respetando stock disponible
    const detalles = seleccionados
      .map(mid => {
        const med = medicamentos.find(m => String(m.id) === String(mid));
        if (!med) return null;
        const tipo = tiposVenta[mid] || "unidad";
        const unidadesCaja = unidadesPorCaja[mid] || 30;
        const stockUnidades = Number(med.stock || 0);
        const stockCajas = Math.floor(stockUnidades / unidadesCaja);
        let cantidad = Number(cantidades[mid] ?? 0);
        if (tipo === 'caja') cantidad = Math.min(cantidad, stockCajas);
        else cantidad = Math.min(cantidad, stockUnidades);
        if (cantidad <= 0) return null;
        const precioVenta = getPrecioVenta(med);
        let subtotal = 0;
        let nombreMed = (med && med.nombre && med.nombre !== "0") ? med.nombre : "Medicamento sin nombre";
        let descripcion = nombreMed;
        if (tipo === "caja") {
          subtotal = precioVenta * unidadesCaja * cantidad;
          descripcion += " (Caja)";
        } else {
          subtotal = precioVenta * cantidad;
          descripcion += " (Unidad)";
        }
        return {
          servicio_tipo: "farmacia",
          servicio_id: Number(mid),
          descripcion,
          cantidad,
          precio_unitario: precioVenta,
          subtotal
        };
      })
      .filter(Boolean);
    if (!cotizacionId && detalles.length === 0) {
      setMensaje("No hay cantidades válidas para cotizar. Verifica el stock disponible.");
      return;
    }

    let limpiarCarritoAlFinal = false;
    const cartItemsCount = Array.isArray(cart?.items) ? cart.items.length : 0;
    const pacienteActualId = pacienteRegistradoId;
    const esMismoPacienteCarrito = Number(cart?.patientId || 0) === pacienteActualId;
    if (cartItemsCount > 0 && esMismoPacienteCarrito) {
      const esEdicionCotizacion = Boolean(cotizacionId);
      const confirm = await Swal.fire({
        title: 'Carrito activo detectado',
        text: `Hay ${cartItemsCount} item(s) en el carrito. Si ${esEdicionCotizacion ? 'actualizas' : 'registras'} desde este cotizador, el carrito se limpiara para evitar inconsistencias.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: esEdicionCotizacion ? 'Actualizar y limpiar carrito' : 'Registrar y limpiar carrito',
        cancelButtonText: 'Cancelar',
      });
      if (!confirm.isConfirmed) return;
      limpiarCarritoAlFinal = true;
    }

    const detallesFinales = cotizacionId
      ? await construirDetallesEditados(cotizacionId, detalles)
      : detalles;

    if (!Array.isArray(detallesFinales) || detallesFinales.length === 0) {
      Swal.fire('Atención', 'La cotización no puede quedar sin ítems.', 'warning');
      return;
    }

    const total = detallesFinales.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);

    const payload = cotizacionId
      ? {
          accion: 'editar',
          cotizacion_id: Number(cotizacionId),
          detalles: detallesFinales,
          total,
          motivo: 'Edición de cotización (merge seguro) desde cotizador de Farmacia'
        }
      : {
          paciente_id: pacienteRegistradoId > 0 ? pacienteRegistradoId : null,
          paciente_nombre: pacienteNombrePayload,
          paciente_dni: pacienteDniPayload,
          total,
          detalles: detallesFinales,
          observaciones: 'Cotización registrada desde cotizador de Farmacia',
          vencimiento_horas: 24,
          origen: 'farmacia'
        };

    try {
      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data?.success) {
        throw new Error(data?.error || 'No se pudo registrar la cotización');
      }

      const cotizacionDestino = Number(data?.cotizacion_id || cotizacionId || 0);
      const numeroComprobante = String(data?.numero_comprobante || `Q${String(cotizacionDestino || '').padStart(6, '0')}`);

        // Fecha de vencimiento: preferir la que devuelve el servidor (validez de cotización).
        // Si no existe la columna en BD (retorna null), derivar la fecha de vencimiento más
        // próxima entre los medicamentos seleccionados (fecha_vencimiento del producto).
        let fechaVencimientoTexto = '';
        const fechaVencimientoRaw = String(data?.fecha_vencimiento || '').trim();
        if (fechaVencimientoRaw) {
          // MySQL devuelve 'YYYY-MM-DD HH:MM:SS' — reemplazar espacio por T para parse ISO correcto
          const parsed = new Date(fechaVencimientoRaw.replace(' ', 'T'));
          if (!isNaN(parsed.getTime())) {
            fechaVencimientoTexto = parsed.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
          }
        }
        if (!fechaVencimientoTexto) {
          // Calcular la fecha de vencimiento más próxima de los medicamentos seleccionados
          const fechasMed = seleccionados
            .map(mid => {
              const med = medicamentos.find(m => String(m.id) === String(mid));
              return med?.fecha_vencimiento ? new Date(String(med.fecha_vencimiento).replace(' ', 'T')) : null;
            })
            .filter(d => d && !isNaN(d.getTime()));
          if (fechasMed.length > 0) {
            const masProxima = fechasMed.reduce((a, b) => (a < b ? a : b));
            fechaVencimientoTexto = masProxima.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          }
        }

      const debeIrDirectoACobro = !isRolQuimico && irACobro;
      let dialog = { isDenied: false };

      if (!debeIrDirectoACobro) {
        const swalOpts = (isRolQuimico && !cotizacionId)
          ? {
              icon: 'success',
              title: 'Enviado a recepción',
              html: `<div class="text-left">
                <div><b>Código:</b> ${numeroComprobante}</div>
                <div><b>Total:</b> S/ ${Number(total || 0).toFixed(2)}</div>
                <div><b>Vence:</b> ${fechaVencimientoTexto || 'No definido'}</div>
                <div class="mt-2">El paciente puede pagar en recepción con este código.</div>
              </div>`,
              showDenyButton: true,
              denyButtonText: 'Imprimir ticket',
              confirmButtonText: 'Nueva Venta / Finalizar',
            }
          : {
              icon: 'success',
              title: cotizacionId ? 'Cotización actualizada' : 'Cotización registrada',
              html: cotizacionId
                ? `<div>Cotización <b>${numeroComprobante}</b> actualizada correctamente.</div>`
                : `<div class="text-left">
                <div><b>Código:</b> ${numeroComprobante}</div>
                <div><b>Total:</b> S/ ${Number(total || 0).toFixed(2)}</div>
                <div><b>Vence:</b> ${fechaVencimientoTexto || 'No definido'}</div>
                <div class="mt-2">Cotización registrada correctamente.</div>
              </div>`,
              showDenyButton: false,
              confirmButtonText: cotizacionId ? 'Continuar' : 'Ir a cotizaciones',
            };
        dialog = await Swal.fire(swalOpts);
      }

      setMensaje(
        cotizacionId
          ? 'Cotización actualizada correctamente.'
          : isRolQuimico
            ? `Cotización enviada a recepción: ${numeroComprobante}`
            : `Cotización registrada: ${numeroComprobante}`
      );

      if (isRolQuimico && !cotizacionId && dialog.isDenied) {
        imprimirTicketRecepcion({
          codigo: numeroComprobante,
          paciente: pacienteNombrePayload || 'Particular',
          total,
          vencimiento: fechaVencimientoTexto,
        });
      }

      {
        if (limpiarCarritoAlFinal) {
          clearCart();
        }

        // Reset de UI post-envío para iniciar una nueva venta sin arrastre de selección.
        setSeleccionados([]);
        setCantidades({});
        setTiposVenta({});
        setPreloadedFarmacia({});
        setPreloadedFarmaciaRaw([]);
        setCotizacionDetallesOriginales([]);
        try {
          await recargarMedicamentos();
        } catch {
          // Si falla la recarga de stock, no bloquear el flujo de cierre exitoso.
        }

        if (cotizacionId) {
          if (!isRolQuimico && irACobro && cotizacionDestino > 0) {
            setMensaje("");
            navigate(`/cobrar-cotizacion/${Number(cotizacionDestino)}`);
            return;
          }
          try {
            const refrescados = await obtenerDetallesCotizacion(cotizacionId);
            setCotizacionDetallesOriginales(refrescados);
          } catch {
            // Mantener navegación aunque falle el refresco.
          }
        }
        if (cotizacionId) {
          setMensaje("");
          navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId || pacienteDatos?.id || 0)}&cotizacion_id=${Number(cotizacionId)}&modo=editar&back_to=/cotizaciones`, {
            state: { pacienteId: Number(pacienteId || pacienteDatos?.id || 0), cotizacionId: Number(cotizacionId), backTo: '/cotizaciones', modo: 'editar' },
          });
          return;
        }
        setMensaje("");
        if (isRolQuimico) {
          // Para Químico no navegar: dejar pantalla lista para nueva venta.
          return;
        } else if (irACobro && cotizacionDestino > 0) {
          navigate(`/cobrar-cotizacion/${Number(cotizacionDestino)}`);
          return;
        } else {
          navigate('/cotizaciones');
        }
      }
    } catch (error) {
      Swal.fire('Error', error?.message || 'No se pudo registrar la cotización', 'error');
    }
  };
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  // Estado para mostrar/ocultar el formulario manual
  const [mostrarManual, setMostrarManual] = useState(false);
  // Estado para mostrar/ocultar el formulario manual
  // Estado para saber si se intentó buscar paciente
  const [busquedaIntentada, setBusquedaIntentada] = useState(false);
  // const MySwal = withReactContent(Swal);
  const [medicamentos, setMedicamentos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionados, setSeleccionados] = useState([]); // IDs normalizados como string
  const [cantidades, setCantidades] = useState({});
  const [tiposVenta, setTiposVenta] = useState({}); // { [id]: 'unidad' | 'caja' }
  const [unidadesPorCaja, setUnidadesPorCaja] = useState({}); // { [id]: unidades }
  // Si viene pacienteId en la URL, usarlo y no pedir datos manuales
  // Siempre usar el pacienteId de la URL si existe
  const pacienteId = params.pacienteId || null;
  const [pacienteDatos, setPacienteDatos] = useState(null); // {dni, nombre}
  const isEditing = Boolean(new URLSearchParams(location.search).get('cobro_id'));
  const isCotizacionEditMode = Boolean(new URLSearchParams(location.search).get('cotizacion_id'));
  const roleNormalizado = String(usuario?.rol || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isRolQuimico = roleNormalizado === "quimico";
  const [manualDni, setManualDni] = useState("");
  const [manualNombres, setManualNombres] = useState("");
  const [manualApellidos, setManualApellidos] = useState("");
  // const usuarioId = 1; // Cambia por el usuario actual
  const [mensaje, setMensaje] = useState("");
  const [cotizacionDetallesOriginales, setCotizacionDetallesOriginales] = useState([]);
  const [preloadedFarmacia, setPreloadedFarmacia] = useState({}); // { mid: { unidad: qty, caja: qty } }
  const [_preloadedFarmaciaRaw, setPreloadedFarmaciaRaw] = useState([]); // array de ítems farmacia precargados (para referencias)
  const [cajaEstado, setCajaEstado] = useState(null); // 'abierta' | 'cerrada' | null
  const { cart, addItems, clearCart, count: cartCount } = useQuoteCart();

  const recargarMedicamentos = async () => {
    const data = await fetchJsonWithTimeout(`${BASE_URL}api_medicamentos.php`, { credentials: "include" });
    const meds = data.medicamentos || data || [];
    setMedicamentos(meds);
    const unidades = {};
    meds.forEach((m) => {
      unidades[m.id] = m.unidades_por_caja || 30;
    });
    setUnidadesPorCaja(unidades);
  };

  useEffect(() => {
    recargarMedicamentos().catch(() => {
      // Si falla la recarga inicial, mantener el estado actual.
    });
  }, []);

  // Consultar estado de caja al entrar a la página
  useEffect(() => {
    fetchJsonWithTimeout(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' })
      .then(data => {
        if (data && data.success) setCajaEstado(data.estado || 'cerrada');
        else setCajaEstado('cerrada');
      })
      .catch(() => setCajaEstado('cerrada'));
  }, []);

  useEffect(() => {
    // Si hay pacienteId en la URL, buscar datos del paciente SIEMPRE que cambie
    if (pacienteId) {
      fetchJsonWithTimeout(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
        .then((data) => {
          if (data.success && data.paciente) {
            setPacienteDatos({
              id: data.paciente.id,
              dni: data.paciente.dni,
              nombre:
                (data.paciente.nombres || data.paciente.nombre || "") +
                " " +
                (data.paciente.apellidos || data.paciente.apellido || ""),
              historia_clinica: data.paciente.historia_clinica || "",
            });
          }
        })
        .catch(() => {
          // Si falla la búsqueda del paciente, mantener datos existentes.
        });
    }
  }, [pacienteId]);

  // Precarga desde cobro existente si viene ?cobro_id=...
  useEffect(() => {
    const paramsSearch = new URLSearchParams(location.search);
    const cobroId = paramsSearch.get("cobro_id");
    const cotizacionId = paramsSearch.get("cotizacion_id");
    const loaders = [];
    if (!cotizacionId) setCotizacionDetallesOriginales([]);
    if (cobroId) loaders.push(fetchJsonWithTimeout(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: "include" }).then(data => {
      const cobro = data.cobro || data?.result?.cobro || null; if (!data.success || !cobro) return;
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsFarm = [];
      detalles.forEach(cd => {
        if ((cd.servicio_tipo || '').toLowerCase() === 'farmacia') {
          try {
            const arr = JSON.parse(cd.descripcion);
            if (Array.isArray(arr)) itemsFarm.push(...arr);
          } catch {
            // La descripción puede no ser JSON (p.ej. texto plano). Ignoramos el error.
            void 0;
          }
        }
      });
      if (itemsFarm.length) {
        setPreloadedFarmaciaRaw(itemsFarm);
        const idsUnicos = Array.from(new Set(itemsFarm.map(it => String(it.servicio_id)).filter(Boolean)));
        setSeleccionados(idsUnicos);
        const mapCant = {}; const mapTipo = {}; const preMap = {};
        itemsFarm.forEach(it => { const mid = String(it.servicio_id); const desc = (it.descripcion || '').toLowerCase(); const tipo = desc.includes('(caja)') ? 'caja' : 'unidad'; mapCant[mid] = (mapCant[mid] || 0) + Number(it.cantidad || 1); mapTipo[mid] = tipo; if (!preMap[mid]) preMap[mid] = { unidad: 0, caja: 0 }; preMap[mid][tipo] += Number(it.cantidad || 1); });
        setCantidades(prev => ({ ...prev, ...mapCant })); setTiposVenta(prev => ({ ...prev, ...mapTipo })); setPreloadedFarmacia(preMap);
      }
    }));
    if (cotizacionId) loaders.push(fetchJsonWithTimeout(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, { credentials: "include" }).then(data => {
      const cot = data.cotizacion || null; if (!data.success || !cot) return;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      setCotizacionDetallesOriginales(detalles);
      const itemsFarm = detalles.filter(d => (d.servicio_tipo || '').toLowerCase() === 'farmacia');
      if (itemsFarm.length) {
        setPreloadedFarmaciaRaw(itemsFarm);
        const idsUnicos = Array.from(new Set(itemsFarm.map(it => String(it.servicio_id)).filter(Boolean)));
        setSeleccionados(idsUnicos);
        const mapCant = {}; const mapTipo = {}; const preMap = {};
        itemsFarm.forEach(it => { const mid = String(it.servicio_id); const desc = (it.descripcion || '').toLowerCase(); const tipo = desc.includes('(caja)') ? 'caja' : 'unidad'; mapCant[mid] = (mapCant[mid] || 0) + Number(it.cantidad || 1); mapTipo[mid] = tipo; if (!preMap[mid]) preMap[mid] = { unidad: 0, caja: 0 }; preMap[mid][tipo] += Number(it.cantidad || 1); });
        setCantidades(prev => ({ ...prev, ...mapCant })); setTiposVenta(prev => ({ ...prev, ...mapTipo })); setPreloadedFarmacia(preMap);
      }
    }));
    if (!loaders.length) return;
    Promise.allSettled(loaders);
  }, [location.search]);

  // Calcular precio de venta
  const getPrecioVenta = (med) => {
    if (!med) return 0;
    const precio = Number(med.precio_compra || 0);
    const margen = Number(med.margen_ganancia || 0);
    return precio + (precio * margen) / 100;
  };

  const construirDetallesSeleccionados = () => {
    return seleccionados
      .map(mid => {
        const med = medicamentos.find(m => String(m.id) === String(mid));
        if (!med) return null;
        const tipo = tiposVenta[mid] || "unidad";
        const unidadesCaja = unidadesPorCaja[mid] || 30;
        const stockUnidades = Number(med.stock || 0);
        const stockCajas = Math.floor(stockUnidades / unidadesCaja);
        let cantidad = Number(cantidades[mid] ?? 0);
        if (tipo === 'caja') cantidad = Math.min(cantidad, stockCajas);
        else cantidad = Math.min(cantidad, stockUnidades);
        if (cantidad <= 0) return null;
        const precioVenta = getPrecioVenta(med);
        const nombreMed = (med && med.nombre && med.nombre !== "0") ? med.nombre : "Medicamento sin nombre";
        let subtotal = 0;
        let descripcion = nombreMed;
        if (tipo === "caja") {
          subtotal = precioVenta * unidadesCaja * cantidad;
          descripcion += " (Caja)";
        } else {
          subtotal = precioVenta * cantidad;
          descripcion += " (Unidad)";
        }
        return {
          servicio_tipo: "farmacia",
          servicio_id: Number(mid),
          descripcion,
          cantidad,
          precio_unitario: precioVenta,
          subtotal
        };
      })
      .filter(Boolean);
  };

  const agregarAlCarrito = () => {
    if (seleccionados.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos un medicamento para agregar al carrito.', 'info');
      return;
    }

    const seleccionadosParaCarrito = isCotizacionEditMode
      ? seleccionados.filter((mid) => {
          const tipoSel = tiposVenta[mid] || 'unidad';
          return Number(preloadedFarmacia?.[mid]?.[tipoSel] || 0) <= 0;
        })
      : seleccionados;

    if (seleccionadosParaCarrito.length === 0) {
      Swal.fire('Atención', 'No hay medicamentos nuevos para agregar al carrito.', 'info');
      return;
    }

    const yaExisteEnCarrito = (detalle) => {
      const descripcion = String(detalle?.descripcion || '').toLowerCase();
      const presentacion = descripcion.includes('(caja)') ? 'caja' : 'unidad';
      const precio = Number(detalle?.precio_unitario || 0);
      return Array.isArray(cart?.items) && cart.items.some((it) => {
        if (String(it?.serviceType || '').toLowerCase() !== 'farmacia') return false;
        if (Number(it?.serviceId || 0) !== Number(detalle?.servicio_id || 0)) return false;
        if (Number(it?.unitPrice || 0) !== precio) return false;
        return String(it?.presentation || 'unidad').toLowerCase() === presentacion;
      });
    };

    const detalles = construirDetallesSeleccionados().filter((d) => {
      if (!seleccionadosParaCarrito.includes(String(d.servicio_id))) return false;
      if (isCotizacionEditMode && yaExisteEnCarrito(d)) return false;
      return true;
    });

    if (detalles.length === 0) {
      Swal.fire('Atención', 'No hay medicamentos válidos para agregar. Verifica stock o si ya están en el carrito.', 'info');
      return;
    }

    const cantidadAgregada = detalles.length;

    addItems({
      patientId: Number(pacienteId || pacienteDatos?.id || 0),
      patientName: pacienteDatos?.nombre || `${manualNombres} ${manualApellidos}`.trim() || 'Particular',
      items: detalles.map((d) => ({
        serviceType: 'farmacia',
        serviceId: d.servicio_id,
        description: d.descripcion,
        quantity: Number(d.cantidad || 1),
        unitPrice: Number(d.precio_unitario || 0),
        presentation: String(d.descripcion || '').toLowerCase().includes('(caja)') ? 'caja' : 'unidad',
        source: 'farmacia',
      })),
    });

    // En creación nueva limpiamos selección para evitar duplicados; en edición conservamos contexto actual.
    if (!isCotizacionEditMode) {
      setSeleccionados([]);
      setMensaje('');
    }
    Swal.fire('Listo', `Se agregaron ${cantidadAgregada} medicamento(s) al carrito.`, 'success');
  };

  const filtrarMedicamentos = medicamentos.filter(
    (m) =>
      m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (m.codigo && m.codigo.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const mostrarPanelDerecho = seleccionados.length > 0;

  const agregarSeleccion = (id) => {
    const normId = String(id);
    const med = medicamentos.find((m) => String(m.id) === normId);
    const unidadesCaja = (unidadesPorCaja[normId] || 30);
    const stockUnidades = Number(med?.stock || 0);
    const stockCajas = Math.floor(stockUnidades / unidadesCaja);
    // Si no hay stock en ninguna modalidad, no permitir agregar
    if (stockUnidades <= 0 && stockCajas <= 0) {
      Swal.fire('Sin stock', 'Este medicamento no tiene stock disponible.', 'info');
      return;
    }
    // Tipo por defecto según disponibilidad
    const defaultTipo = stockUnidades > 0 ? 'unidad' : 'caja';
    const defaultCantidad = 1; // siempre 1 si hay stock en el tipo elegido
    setSeleccionados((sel) => (sel.includes(normId) ? sel : [...sel, normId]));
    setCantidades((cant) => ({ ...cant, [normId]: defaultCantidad }));
    setTiposVenta((tv) => ({ ...tv, [normId]: defaultTipo }));
  };

  const quitarSeleccion = async (id) => {
    const normId = String(id);
    const cobroId = new URLSearchParams(location.search).get('cobro_id');
    const tipo = tiposVenta[normId] || 'unidad';

    // En edición de cobro: permitir eliminación real (repone stock) usando api_cobro_eliminar_item.php
    if (cobroId) {
      const cantidadActual = Number(cantidades[normId] ?? 0);
      if (cantidadActual <= 0) return;

      const confirma = await Swal.fire({
        title: 'Eliminar del cobro',
        text: 'Esta acción quitará el producto del cobro y repondrá stock. ¿Continuar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar',
        input: 'text',
        inputLabel: 'Motivo de la eliminación',
        inputPlaceholder: 'Ej. duplicado, error de registro, ajuste',
        inputValidator: (value) => {
          if (!value || value.trim().length < 4) return 'Ingresa un motivo (mínimo 4 caracteres)';
          return undefined;
        }
      });
      if (!confirma.isConfirmed) return;

      const motivo = (confirma.value || '').trim();

      // Si hay caja cerrada, evitar llamadas
      try {
        const ce = await fetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' }).then(r => r.json());
        if (!ce?.success || ce?.estado !== 'abierta') {
          setCajaEstado(ce?.estado || 'cerrada');
          Swal.fire('Caja cerrada', 'Abre caja para poder eliminar ítems del cobro.', 'error');
          return;
        }
        setCajaEstado('abierta');
      } catch {
        Swal.fire('Error', 'No se pudo verificar el estado de la caja.', 'error');
        return;
      }

      // Cantidad a eliminar: eliminar todo lo seleccionado (en la modalidad actual)
      const cantidadEliminar = cantidadActual;
      const med = medicamentos.find(m => String(m.id) === String(normId));
      const unidadesCaja = unidadesPorCaja[normId] || 30;
      const precioVenta = getPrecioVenta(med);
      const descripcion = `${med?.nombre || 'Medicamento'} (${tipo === 'caja' ? 'Caja' : 'Unidad'})`;

      try {
        const resp = await fetch(`${BASE_URL}api_cobro_eliminar_item.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cobro_id: Number(cobroId),
            cotizacion_id: Number(new URLSearchParams(location.search).get('cotizacion_id') || 0),
            servicio_tipo: 'farmacia',
            motivo,
            item: {
              servicio_id: Number(normId),
              descripcion,
              cantidad_eliminar: cantidadEliminar,
              precio_unitario: precioVenta,
              subtotal: tipo === 'caja' ? (precioVenta * unidadesCaja * cantidadEliminar) : (precioVenta * cantidadEliminar)
            }
          })
        });
        const data = await resp.json();
        if (!data.success) {
          Swal.fire('Error', data.error || 'No se pudo eliminar', 'error');
          return;
        }

        setPreloadedFarmacia(prev => {
          const next = { ...prev };
          const cur = next[normId] || { unidad: 0, caja: 0 };
          if (tipo === 'caja') cur.caja = Math.max(0, Number(cur.caja || 0) - cantidadEliminar);
          else cur.unidad = Math.max(0, Number(cur.unidad || 0) - cantidadEliminar);
          next[normId] = cur;
          return next;
        });
        setPreloadedFarmaciaRaw(prev => {
          return Array.isArray(prev) ? prev : [];
        });

        setSeleccionados((sel) => sel.filter((mid) => mid !== normId));
        setCantidades((cant) => {
          const nuevo = { ...cant };
          delete nuevo[normId];
          return nuevo;
        });
        setTiposVenta((tv) => {
          const nuevo = { ...tv };
          delete nuevo[normId];
          return nuevo;
        });

        Swal.fire('Eliminado', 'Ítem eliminado y stock repuesto.', 'success').then(() => {
          const pid = pacienteId || (pacienteDatos && pacienteDatos.id);
          if (pid) navigate(`/consumo-paciente/${pid}`);
          else navigate('/pacientes');
        });
      } catch {
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
      }

      return;
    }

    // Modo normal (no edición): solo quitar del estado
    setSeleccionados((sel) => sel.filter((mid) => mid !== normId));
    setCantidades((cant) => {
      const nuevo = { ...cant };
      delete nuevo[normId];
      return nuevo;
    });
    setTiposVenta((tv) => {
      const nuevo = { ...tv };
      delete nuevo[normId];
      return nuevo;
    });
  };

  const actualizarCantidad = (id, cantidad) => {
    const normId = String(id);
    setCantidades((cant) => ({ ...cant, [normId]: cantidad }));
  };

  const actualizarTipoVenta = (id, tipo) => {
    const normId = String(id);
    setTiposVenta((tv) => ({ ...tv, [normId]: tipo }));
    // Si cambia a caja, poner cantidad 1 por defecto
    if (tipo === "caja") setCantidades((cant) => ({ ...cant, [normId]: 1 }));
  };

  const calcularTotal = () => {
    // Calcular total teniendo en cuenta: en edición, la fuente de verdad
    // (`_preloadedFarmaciaRaw`) + overlay de selecciones actuales (añadidos/ajustes).
    if (isEditing) {
      const map = {};
      // partir de lo precargado
      if (Array.isArray(_preloadedFarmaciaRaw)) {
        _preloadedFarmaciaRaw.forEach(it => {
          const tipo = (it.descripcion || '').toLowerCase().includes('(caja)') ? 'caja' : 'unidad';
          const key = `${it.servicio_id}::${tipo}`;
          if (!map[key]) map[key] = { servicio_id: it.servicio_id, tipo, subtotal: 0 };
          map[key].subtotal += Number(it.subtotal || 0);
        });
      }

      // overlay: aplicar las selecciones actuales (reemplaza subtotal de la línea correspondiente)
      seleccionados.forEach(mid => {
        const tipoSel = tiposVenta[mid] || 'unidad';
        const unidadesCaja = unidadesPorCaja[mid] || 30;
        const med = medicamentos.find(m => String(m.id) === String(mid));
        const precioVenta = getPrecioVenta(med);
        const cantidadSel = Number(cantidades[mid] ?? 0);
        const subtotalCalc = tipoSel === 'caja' ? precioVenta * unidadesCaja * cantidadSel : precioVenta * cantidadSel;
        const key = `${mid}::${tipoSel}`;
        if (cantidadSel > 0) {
          map[key] = { servicio_id: mid, tipo: tipoSel, subtotal: subtotalCalc };
        } else {
          // si el usuario puso 0, asegurarse de eliminar del map
          if (map[key]) delete map[key];
        }
      });

      return Object.values(map).reduce((t, r) => t + Number(r.subtotal || 0), 0);
    }

    // modo nuevo/venta normal: calcular desde seleccionados respetando stock
    return seleccionados.reduce((total, mid) => {
      const med = medicamentos.find((m) => String(m.id) === String(mid));
      if (!med) return total;
      const tipo = tiposVenta[mid] || "unidad";
      const unidadesCaja = unidadesPorCaja[mid] || 30;
      const stockUnidades = Number(med.stock || 0);
      const stockCajas = Math.floor(stockUnidades / unidadesCaja);
      let cantidad = Number(cantidades[mid] ?? 0);
      if (tipo === 'caja') cantidad = Math.min(cantidad, stockCajas);
      else cantidad = Math.min(cantidad, stockUnidades);
      if (cantidad <= 0) return total;
      if (tipo === "caja") {
        return total + getPrecioVenta(med) * unidadesCaja * cantidad;
      } else {
        return total + getPrecioVenta(med) * cantidad;
      }
    }, 0);
  };

  // Nota: la cotización se registra directamente en el backend de cotizaciones.

  // Actualizar cobro: agregar únicamente la diferencia respecto a lo precargado
  const actualizarCobro = async () => {
    const cobroId = new URLSearchParams(location.search).get('cobro_id');
    if (!cobroId) return;
    // Guardar: verificar caja abierta antes de continuar
    try {
      const ce = await fetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' }).then(r => r.json());
      if (!ce?.success || ce?.estado !== 'abierta') {
        setCajaEstado(ce?.estado || 'cerrada');
        Swal.fire('Error', 'No hay caja abierta. Abre caja para actualizar este cobro.', 'error');
        return;
      }
      setCajaEstado('abierta');
    } catch {
      Swal.fire('Error', 'No se pudo verificar el estado de la caja.', 'error');
      return;
    }

    const itemsAgregar = [];
    const itemsEliminar = []; // { servicio_id, tipo, cantidad_eliminar, descripcion, precio_unitario, subtotal }

    // Usar la unión de IDs precargados y seleccionados para calcular diffs.
    const unionIds = Array.from(new Set([...(seleccionados || []), ...Object.keys(preloadedFarmacia || {})]));
    unionIds.forEach(mid => {
      const pre = preloadedFarmacia[mid] || { unidad: 0, caja: 0 };
      const med = medicamentos.find(m => String(m.id) === String(mid));
      const unidadesCaja = unidadesPorCaja[mid] || 30;

      // Determinar tipo seleccionado: si el usuario indicó explícitamente, usarlo;
      // si no, inferir del precargado (si había cajas, asumir 'caja', else 'unidad').
      let tipoSel = tiposVenta[mid];
      if (!tipoSel) {
        tipoSel = (pre.caja && Number(pre.caja) > 0) ? 'caja' : 'unidad';
      }

      // Si el usuario no tiene una cantidad explícita para este ID, asumimos
      // que no quiere cambiar la cantidad (evitamos reducciones accidentales).
      const hasCantidadExplicita = Object.prototype.hasOwnProperty.call(cantidades, mid);
      const cantidadSelRaw = hasCantidadExplicita ? Number(cantidades[mid] ?? 0) : null;

      // En edición no forzamos clamp por stock; respetamos la intención del usuario.
      const cantidadSel = (cantidadSelRaw === null)
        ? (tipoSel === 'caja' ? Number(pre.caja || 0) : Number(pre.unidad || 0))
        : cantidadSelRaw;

      const desiredUnidad = tipoSel === 'unidad' ? cantidadSel : 0;
      const desiredCaja = tipoSel === 'caja' ? cantidadSel : 0;

      const diffUnidad = Number(desiredUnidad) - Number(pre.unidad || 0);
      const diffCaja = Number(desiredCaja) - Number(pre.caja || 0);

      const precioVenta = getPrecioVenta(med);
      const baseNombre = (med && med.nombre && med.nombre !== '0') ? med.nombre : 'Medicamento';

      if (diffUnidad > 0) {
        itemsAgregar.push({
          servicio_id: mid,
          descripcion: `${baseNombre} (Unidad)`,
          cantidad: diffUnidad,
          precio_unitario: precioVenta,
          subtotal: precioVenta * diffUnidad
        });
      } else if (diffUnidad < 0 && hasCantidadExplicita) {
        // Solo solicitar reducción si el usuario explicitó una cantidad menor
        const qty = Math.abs(diffUnidad);
        itemsEliminar.push({
          servicio_id: mid,
          tipo: 'unidad',
          cantidad_eliminar: qty,
          descripcion: `${baseNombre} (Unidad)`,
          precio_unitario: precioVenta,
          subtotal: precioVenta * qty
        });
      }

      if (diffCaja > 0) {
        itemsAgregar.push({
          servicio_id: mid,
          descripcion: `${baseNombre} (Caja)`,
          cantidad: diffCaja,
          precio_unitario: precioVenta,
          subtotal: precioVenta * unidadesCaja * diffCaja
        });
      } else if (diffCaja < 0 && hasCantidadExplicita) {
        const qty = Math.abs(diffCaja);
        itemsEliminar.push({
          servicio_id: mid,
          tipo: 'caja',
          cantidad_eliminar: qty,
          descripcion: `${baseNombre} (Caja)`,
          precio_unitario: precioVenta,
          subtotal: precioVenta * unidadesCaja * qty
        });
      }
    });

    console.debug('ActualizarCobro diffs', { itemsAgregar, itemsEliminar, preloadedFarmacia, cantidades, tiposVenta });

    if (itemsAgregar.length === 0 && itemsEliminar.length === 0) {
      Swal.fire('Sin cambios', 'No hay cambios para aplicar.', 'info');
      return;
    }

    let motivoEliminacion = '';
    if (itemsEliminar.length > 0) {
      const confirma = await Swal.fire({
        title: 'Confirmar reducción/eliminación',
        text: 'Se reducirá la cantidad (o se eliminarán ítems) del cobro y se repondrá stock. ¿Continuar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar',
        input: 'text',
        inputLabel: 'Motivo del ajuste',
        inputPlaceholder: 'Ej. ajuste por cambio de receta, error, devolución',
        inputValidator: (value) => {
          if (!value || value.trim().length < 4) return 'Ingresa un motivo (mínimo 4 caracteres)';
          return undefined;
        }
      });
      if (!confirma.isConfirmed) return;
      motivoEliminacion = (confirma.value || '').trim();
    }

    // 1) Procesar reducciones/eliminaciones primero (repone stock)
    for (const it of itemsEliminar) {
      try {
        const resp = await fetch(`${BASE_URL}api_cobro_eliminar_item.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cobro_id: Number(cobroId),
            cotizacion_id: Number(new URLSearchParams(location.search).get('cotizacion_id') || 0),
            servicio_tipo: 'farmacia',
            motivo: motivoEliminacion,
            item: {
              servicio_id: Number(it.servicio_id),
              descripcion: it.descripcion,
              cantidad_eliminar: Number(it.cantidad_eliminar),
              precio_unitario: Number(it.precio_unitario || 0),
              subtotal: Number(it.subtotal || 0)
            }
          })
        });
        const data = await resp.json();
        if (!data.success) {
          Swal.fire('Error', data.error || 'No se pudo aplicar la reducción', 'error');
          return;
        }
      } catch {
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
        return;
      }
    }

    // 2) Procesar agregados (si corresponde)
    if (itemsAgregar.length > 0) {
      try {
        const resp = await fetch(`${BASE_URL}api_cobro_actualizar.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cobro_id: Number(cobroId),
            cotizacion_id: Number(new URLSearchParams(location.search).get('cotizacion_id') || 0),
            servicio_tipo: 'farmacia',
            items: itemsAgregar
          })
        });
        const data = await resp.json();
        if (!data.success) {
          Swal.fire('Error', data.error || 'No se pudo actualizar el cobro', 'error');
          return;
        }
      } catch {
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
        return;
      }
    }

    // 3) Baseline nuevo: lo que está actualmente seleccionado
    // Cuando estamos EDITANDO un cobro (hay ?cobro_id=...) no recortamos
    // las cantidades por el stock actual porque el cobro ya contiene
    // esas líneas aunque el stock se haya reducido al cobrar.
    const nuevoPre = {};
    const isEditing = Boolean(new URLSearchParams(location.search).get('cobro_id'));
    seleccionados.forEach(mid => {
      const tipoSel = (tiposVenta[mid] || 'unidad');
      const unidadesCaja = unidadesPorCaja[mid] || 30;
      const med = medicamentos.find(m => String(m.id) === String(mid));
      const stockUnidades = Number(med?.stock || 0);
      const stockCajas = Math.floor(stockUnidades / unidadesCaja);
      const cantidadSelRaw = Number(cantidades[mid] ?? 0);
      let cantidadSel;
      if (isEditing) {
        // Mantener la cantidad seleccionada en edición (no clamp)
        cantidadSel = cantidadSelRaw;
      } else {
        // En modo nueva venta sí respetamos el stock disponible
        cantidadSel = tipoSel === 'caja' ? Math.min(cantidadSelRaw, stockCajas) : Math.min(cantidadSelRaw, stockUnidades);
      }
      nuevoPre[String(mid)] = { unidad: tipoSel === 'unidad' ? cantidadSel : 0, caja: tipoSel === 'caja' ? cantidadSel : 0 };
    });
    setPreloadedFarmacia(nuevoPre);

    Swal.fire(
      'Actualizado',
      `Cambios aplicados. Agregados: ${itemsAgregar.length}, reducidos/eliminados: ${itemsEliminar.length}.`,
      'success'
    ).then(async () => {
      // Refetch del cobro actualizado y sincronizar estados locales sin recargar toda la página
      try {
        const paramsSearch = new URLSearchParams(location.search);
        const cobroId = paramsSearch.get('cobro_id');
        if (!cobroId) return;
        const resp = await fetch(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: 'include' });
        const data = await resp.json();
        if (!data || !data.success || !data.cobro) return;
        const detalles = Array.isArray(data.cobro.detalles) ? data.cobro.detalles : [];
        const itemsFarm = [];
        detalles.forEach(cd => {
          if ((cd.servicio_tipo || '').toLowerCase() === 'farmacia') {
            try {
              const arr = JSON.parse(cd.descripcion);
              if (Array.isArray(arr)) itemsFarm.push(...arr);
            } catch {
              void 0;
            }
          }
        });

        // Actualizar estados locales con la fuente de verdad
        setPreloadedFarmaciaRaw(itemsFarm);
        const idsUnicos = Array.from(new Set(itemsFarm.map(it => String(it.servicio_id)).filter(Boolean)));
        setSeleccionados(idsUnicos);
        const mapCant = {}; const mapTipo = {}; const preMap = {};
        itemsFarm.forEach(it => {
          const mid = String(it.servicio_id);
          const desc = (it.descripcion || '').toLowerCase();
          const tipo = desc.includes('(caja)') ? 'caja' : 'unidad';
          mapCant[mid] = (mapCant[mid] || 0) + Number(it.cantidad || 1);
          mapTipo[mid] = tipo;
          if (!preMap[mid]) preMap[mid] = { unidad: 0, caja: 0 };
          preMap[mid][tipo] += Number(it.cantidad || 1);
        });
        setCantidades(prev => ({ ...prev, ...mapCant }));
        setTiposVenta(prev => ({ ...prev, ...mapTipo }));
        setPreloadedFarmacia(preMap);
        // Redirigir automáticamente a la vista de Consumo del Paciente
        const pacienteDestino = data.cobro?.paciente_id || pacienteId || (pacienteDatos && pacienteDatos.id);
        if (pacienteDestino) {
          navigate(`/consumo-paciente/${pacienteDestino}`);
          return;
        }
      } catch (err) {
        // en caso de error, dejar que el estado actual persista; el usuario puede recargar manualmente
        console.error('Error refrescando cobro después de actualizar:', err);
      }
    });
  };

  return (
  <div
    className={`w-full mx-auto px-4 sm:px-8 lg:px-12 xl:pl-24 2xl:pl-40 py-6 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100 transition-all ${cartCount > 0 ? 'xl:pr-[24rem] 2xl:pr-[24rem]' : 'xl:pr-24 2xl:pr-40'}`}
  >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-3xl font-bold text-blue-900 flex items-center gap-2">
          <span role="img" aria-label="medicamentos">💊</span>
          Cotizador de Medicamentos
          {(new URLSearchParams(location.search).get('cobro_id') || new URLSearchParams(location.search).get('cotizacion_id')) && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              {new URLSearchParams(location.search).get('cobro_id')
                ? `Editando cobro #${new URLSearchParams(location.search).get('cobro_id')}`
                : new URLSearchParams(location.search).get('cotizacion_id')
                  ? `Editando cotización #${new URLSearchParams(location.search).get('cotizacion_id')}`
                  : 'Editando'}
            </span>
          )}
        </h2>
        {/* Mostrar el botón solo si hay pacienteId en la URL, si no, mostrar botón para ir al panel principal del químico */}
        {pacienteId && !(new URLSearchParams(location.search).get('cobro_id') || new URLSearchParams(location.search).get('cotizacion_id')) ? (
          <button
            className="bg-blue-100 text-blue-800 px-4 py-2 rounded font-semibold border border-blue-300 hover:bg-blue-200 transition"
            onClick={() => navigate("/seleccionar-servicio", { state: { pacienteId } })}
          >
            ← Volver a Servicios
          </button>
        ) : (
          <button
            className="bg-purple-100 text-purple-800 px-4 py-2 rounded font-semibold border border-purple-300 hover:bg-purple-200 transition"
            onClick={() => {
              const sp = new URLSearchParams(location.search);
              const isEditing = Boolean(sp.get('cobro_id') || sp.get('cotizacion_id'));
              const cotizacionId = sp.get('cotizacion_id');
              const pid = pacienteId || pacienteDatos?.id;
              if (cotizacionId && !sp.get('cobro_id')) {
                navigate(`/seleccionar-servicio?paciente_id=${Number(pid)}&cotizacion_id=${Number(cotizacionId)}&modo=editar&back_to=/cotizaciones`, {
                  state: { pacienteId: Number(pid), cotizacionId: Number(cotizacionId), backTo: '/cotizaciones', modo: 'editar' },
                });
              } else if (isEditing) {
                navigate(pid ? `/consumo-paciente/${pid}` : '/pacientes');
              } else {
                navigate('/medicamentos');
              }
            }}
          >
            {(() => {
              const sp = new URLSearchParams(location.search);
              const isEditing = Boolean(sp.get('cobro_id') || sp.get('cotizacion_id'));
              return isEditing ? '← Volver a Servicios' : '← Ir a Lista de Medicamentos';
            })()}
          </button>
        )}
      </div>
      {/* Buscador de paciente */}
  <div className="mb-4">
        {/* Solo mostrar el buscador de paciente si NO hay pacienteId en la URL (químico) */}
        {!params.pacienteId && (
          <PacienteListSearch
            onPacienteEncontrado={(p) => {
              setPacienteDatos({
                id: p.id,
                dni: p.dni || "",
                nombre: ((p.nombre || "") + " " + (p.apellido || "")).trim(),
                historia_clinica: p.historia_clinica || ""
              });
              setManualDni("");
              setManualNombres("");
              setManualApellidos("");
              setBusquedaIntentada(true);
              setMensaje("");
            }}
            onNoEncontrado={() => {
              setPacienteDatos(null);
              setMostrarManual(true);
              setBusquedaIntentada(true);
              setMensaje("Paciente no encontrado. Verifica el DNI, nombre o historia clínica.");
            }}
            onNuevaBusqueda={() => {
              // pacienteId se toma de la URL, no se actualiza por estado
              setPacienteDatos(null);
              setMostrarManual(false);
              setBusquedaIntentada(false);
            }}
          />
        )}
        {/* Botón y formulario manual solo si NO hay pacienteId en la URL (químico) */}
        {!params.pacienteId && !pacienteId && !mostrarManual && (
          <button
            className="mt-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 text-sm"
            onClick={() => setMostrarManual(true)}
          >
            Ingresar particular manualmente
          </button>
        )}
        {!params.pacienteId && mostrarManual && !pacienteId && (
          <div className="flex gap-2 items-center mt-2">
            <input
              type="text"
              value={manualDni}
              onChange={(e) => setManualDni(e.target.value)}
              placeholder="DNI (opcional)"
              className="border px-2 py-1 rounded w-32"
            />
            <input
              type="text"
              value={manualNombres}
              onChange={(e) => setManualNombres(e.target.value)}
              placeholder="Nombres (opcional)"
              className="border px-2 py-1 rounded w-40"
            />
            <input
              type="text"
              value={manualApellidos}
              onChange={(e) => setManualApellidos(e.target.value)}
              placeholder="Apellidos (opcional)"
              className="border px-2 py-1 rounded w-40"
            />
          </div>
        )}
        {/* Mostrar paciente seleccionado */}
        {(pacienteId || pacienteDatos || manualDni || manualNombres || manualApellidos) && (
          <div className="mt-2 p-2 bg-blue-50 rounded text-blue-800 text-sm">
            <span className="font-bold">Paciente:</span>{" "}
            {pacienteDatos
              ? `${pacienteDatos.nombre} (DNI: ${pacienteDatos.dni})`
              : `${`${manualNombres} ${manualApellidos}`.trim() || 'Particular'}${manualDni ? ` (DNI: ${manualDni})` : ''}`}
          </div>
        )}
      </div>
      <div className="mb-4 flex gap-2 items-center">
        <span className="text-blue-700 text-xl">🔍</span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar medicamento..."
          className="border px-3 py-2 rounded-lg w-full max-w-md focus:ring-2 focus:ring-blue-300"
        />
      </div>
      <div className="mb-4">
        <div className={`grid grid-cols-1 gap-4 ${mostrarPanelDerecho ? 'md:grid-cols-2' : ''}`}>
          {/* Columna izquierda: lista de medicamentos para cotizar */}
          <div className="col-span-1">
            {medicamentos.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No hay medicamentos registrados en el sistema.
              </div>
            ) : filtrarMedicamentos.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Sin coincidencias para "{busqueda}".
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
              <ul className="divide-y divide-gray-100">
                {filtrarMedicamentos.map((med) => {
                  const unidadesCaja = unidadesPorCaja[med.id] || 30;
                  const stockUnidades = Number(med.stock || 0);
                  const stockCajas = Math.floor(stockUnidades / unidadesCaja);
                  const sinStockUnidad = stockUnidades <= 0;
                  const sinStockCaja = stockCajas <= 0;
                  const sinStockTotal = sinStockUnidad && sinStockCaja;
                  return (
                    <li
                      key={med.id}
                      className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800 flex items-center gap-2">
                          <span className="text-blue-600">🧪</span>
                          {med.nombre}
                        </div>
                        <div className="text-xs text-gray-500 flex gap-2 items-center">
                          <span>📦 {stockCajas} cajas</span>
                          <span>💊 {stockUnidades} unidades</span>
                          <span>
                            💲 S/ {getPrecioVenta(med).toFixed(2)} / unidad
                          </span>
                        </div>
                      </div>
                      {seleccionados.includes(String(med.id)) ? (
                        <>
                          <select
                            value={tiposVenta[String(med.id)] || "unidad"}
                            onChange={(e) =>
                              actualizarTipoVenta(String(med.id), e.target.value)
                            }
                            className="border rounded-lg px-2 py-1 mr-2 bg-white"
                          >
                            <option value="unidad" disabled={sinStockUnidad}>Unidad</option>
                            <option value="caja" disabled={sinStockCaja}>Caja</option>
                          </select>
                          {tiposVenta[String(med.id)] === "caja" ? (
                            <input
                              type="number"
                              min={sinStockCaja ? 0 : 1}
                              max={sinStockCaja ? 0 : stockCajas}
                              disabled={sinStockCaja}
                              value={sinStockCaja ? 0 : (cantidades[String(med.id)] || 1)}
                              onChange={(e) =>
                                actualizarCantidad(
                                  String(med.id),
                                  Math.max(
                                    0,
                                    Math.min(stockCajas, Number(e.target.value))
                                  )
                                )
                              }
                              className="border rounded-lg px-2 w-16 bg-white"
                            />
                          ) : (
                            <input
                              type="number"
                              min={sinStockUnidad ? 0 : 1}
                              max={sinStockUnidad ? 0 : stockUnidades}
                              disabled={sinStockUnidad}
                              value={sinStockUnidad ? 0 : (cantidades[String(med.id)] || 1)}
                              onChange={(e) =>
                                actualizarCantidad(
                                  String(med.id),
                                  Math.max(
                                    0,
                                    Math.min(
                                      stockUnidades,
                                      Number(e.target.value)
                                    )
                                  )
                                )
                              }
                              className="border rounded-lg px-2 w-16 bg-white"
                            />
                          )}
                          <button
                            onClick={() => quitarSeleccion(String(med.id))}
                            className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xl shadow transition"
                            aria-label="Quitar"
                          >
                            <FaTimes />
                          </button>
                        </>
                      ) : (
                        sinStockTotal ? (
                          <button
                            disabled
                            className="w-24 h-10 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 text-sm shadow cursor-not-allowed"
                            title="Sin stock"
                          >
                            Sin stock
                          </button>
                        ) : (
                          <button
                            onClick={() => agregarSeleccion(String(med.id))}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 text-xl shadow transition"
                            aria-label="Agregar"
                          >
                            <FaPlus />
                          </button>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
            )}
          </div>
          {/* Columna derecha: resumen de cotización y módulo de cobros */}
          {mostrarPanelDerecho && (
          <div className="col-span-1 md:sticky md:top-24 w-full">
            {seleccionados.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold text-gray-700 mb-2">Lista de Cotización</h4>
                <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                  {(() => {
                    // Si estamos editando un cobro, usar la fuente de verdad `preloadedFarmaciaRaw`
                    if (isEditing && Array.isArray(_preloadedFarmaciaRaw) && _preloadedFarmaciaRaw.length > 0) {
                      // Construir mapa desde lo precargado (fuente de verdad)
                      const map = {};
                      _preloadedFarmaciaRaw.forEach(it => {
                        const tipo = (it.descripcion || '').toLowerCase().includes('(caja)') ? 'caja' : 'unidad';
                        const key = `${it.servicio_id}::${tipo}`;
                        if (!map[key]) map[key] = { servicio_id: it.servicio_id, descripcion: it.descripcion, cantidad: 0, subtotal: 0, tipo };
                        map[key].cantidad += Number(it.cantidad ?? 1);
                        map[key].subtotal += Number(it.subtotal ?? 0);
                      });

                      // Overlay: reflejar selecciones/ajustes en tiempo real (cantidad/tipo) sobre lo precargado
                      seleccionados.forEach(mid => {
                        const desiredTipo = tiposVenta[mid] || 'unidad';
                        const desiredCantidad = Number(cantidades[mid] ?? 0);
                        const med = medicamentos.find(m => String(m.id) === String(mid));
                        const unidadesCaja = unidadesPorCaja[mid] || 30;
                        const precioVenta = getPrecioVenta(med);
                        const subtotalCalc = desiredTipo === 'caja' ? precioVenta * unidadesCaja * desiredCantidad : precioVenta * desiredCantidad;

                        const existingKey = Object.keys(map).find(k => String(map[k].servicio_id) === String(mid) && map[k].tipo === desiredTipo);
                        if (existingKey) {
                          // Si el usuario ajustó la cantidad, mostrar el valor deseado
                          map[existingKey].cantidad = desiredCantidad;
                          map[existingKey].subtotal = subtotalCalc;
                        } else if (desiredCantidad > 0) {
                          const descripcion = (med?.nombre || 'Medicamento') + (desiredTipo === 'caja' ? ' (Caja)' : ' (Unidad)');
                          const key = `${mid}::${desiredTipo}`;
                          map[key] = { servicio_id: mid, descripcion, cantidad: desiredCantidad, subtotal: subtotalCalc, tipo: desiredTipo };
                        }
                      });

                      return Object.values(map).map((row, idx) => (
                        <li key={idx} className="py-2 flex justify-between items-center">
                          <span className="flex items-center gap-1"><span>💊</span>{row.descripcion}</span>
                          <span>{row.cantidad} {row.tipo === 'caja' ? 'caja(s)' : 'unidad(es)'}</span>
                          <span className="font-bold text-green-700">S/ {Number(row.subtotal || 0).toFixed(2)}</span>
                        </li>
                      ));
                    }

                    // Modo nuevo/normal: construir desde seleccionados y stock
                    return seleccionados.map(mid => {
                      const med = medicamentos.find(m => String(m.id) === String(mid));
                      const tipo = tiposVenta[mid] || "unidad";
                      const cantidadRaw = Number(cantidades[mid] ?? 0);
                      const unidadesCaja = unidadesPorCaja[mid] || 30;
                      const stockUnidades = Number(med?.stock || 0);
                      const stockCajas = Math.floor(stockUnidades / unidadesCaja);
                      const cantidad = tipo === 'caja' ? Math.min(cantidadRaw, stockCajas) : Math.min(cantidadRaw, stockUnidades);
                      const precioVenta = getPrecioVenta(med);
                      let subtotal = 0;
                      let descripcion = med?.nombre || "";
                      if (tipo === "caja") {
                        subtotal = precioVenta * unidadesCaja * cantidad;
                        descripcion += " (Caja)";
                      } else {
                        subtotal = precioVenta * cantidad;
                        descripcion += " (Unidad)";
                      }
                      return (
                        <li key={mid} className="py-2 flex justify-between items-center">
                          <span className="flex items-center gap-1">
                            <span>💊</span>
                            {descripcion}
                          </span>
                          <span>{cantidad} {tipo === "caja" ? "caja(s)" : "unidad(es)"}</span>
                          <span className="font-bold text-green-700">
                            S/ {subtotal.toFixed(2)}
                          </span>
                        </li>
                      );
                    });
                  })()}
                </ul>
                <div className="mt-4 text-lg font-bold text-right">
                  Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
                </div>
                <div className="flex gap-3 mt-4 justify-end">
                  <button onClick={() => { setSeleccionados([]); setMensaje(""); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                  {!isRolQuimico && (
                    <button onClick={agregarAlCarrito} className="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700">Agregar al carrito</button>
                  )}
                  {new URLSearchParams(location.search).get('cobro_id') ? (
                    <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                  ) : (
                    <>
                      <button onClick={() => handleRegistrarVenta()} className="px-6 py-2 rounded font-bold bg-blue-600 text-white hover:bg-blue-700">{isCotizacionEditMode ? 'Actualizar cotización' : (isRolQuimico ? 'Enviar a recepción' : 'Registrar cotización')}</button>
                      {!isRolQuimico && (
                        <button onClick={() => handleRegistrarVenta({ irACobro: true })} className="px-6 py-2 rounded font-bold bg-green-600 text-white hover:bg-green-700">{isCotizacionEditMode ? 'Actualizar y cobrar' : 'Registrar y cobrar'}</button>
                      )}
                    </>
                  )}
                </div>
                {new URLSearchParams(location.search).get('cobro_id') && cajaEstado === 'cerrada' && (
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <span className="text-sm text-red-600">Caja cerrada: abre una caja para poder actualizar el cobro.</span>
                    <button onClick={() => navigate('/contabilidad')} className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded border border-yellow-300 hover:bg-yellow-200">Ir a Contabilidad</button>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      </div>
      {mensaje && (
        <div
          className={`mt-4 text-center font-semibold ${
            mensaje.startsWith("Cotización") ? "text-green-600" : "text-red-600"
          }`}
        >
          {mensaje}
        </div>
      )}
    </div>
  );
}
