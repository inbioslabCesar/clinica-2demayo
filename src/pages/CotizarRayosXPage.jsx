import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { useQuoteCart } from "../context/QuoteCartContext";

export default function CotizarRayosXPage() {
  const [busqueda, setBusqueda] = useState("");
  const MySwal = withReactContent(Swal);
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [paciente, setPaciente] = useState(null);
  const [tarifas, setTarifas] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [preloadedCounts, setPreloadedCounts] = useState({}); // {tarifaId: cantidad}
  const [preloadedItems, setPreloadedItems] = useState([]); // líneas exactas precargadas desde cobro/cotización
  const [pendingRxItems, setPendingRxItems] = useState([]); // ítems crudos para resolver contra tarifas actuales
  const [cajaEstado, setCajaEstado] = useState(null);
  const [cotizacionDetallesOriginales, setCotizacionDetallesOriginales] = useState([]);
  const { cart, addItems, clearCart, count: cartCount } = useQuoteCart();

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const obtenerNombreMedicoTarifa = (tarifa) => {
    if (!tarifa) return "";

    const medicoPorTarifa = String(
      `${tarifa.medico_nombre || ""} ${tarifa.medico_apellido || ""}`
    ).trim();
    if (medicoPorTarifa) return medicoPorTarifa;

    const medicoId = Number(tarifa.medico_id || 0);
    if (medicoId <= 0) return "";

    const medico = medicos.find((m) => Number(m.id) === medicoId);
    if (!medico) return "";

    return `${medico.nombres || medico.nombre || ""} ${medico.apellidos || medico.apellido || ""}`.trim();
  };

  // Filtrar tarifas por búsqueda
  const tarifasFiltradas = tarifas.filter(tarifa => {
    const texto = `${tarifa.descripcion || tarifa.nombre}`.toLowerCase();
    const doctor = (obtenerNombreMedicoTarifa(tarifa) || "sin doctor").toLowerCase();
    return (
      texto.includes(busqueda.toLowerCase()) ||
      doctor.includes(busqueda.toLowerCase())
    );
  });

  useEffect(() => {
    // Obtener datos del paciente
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paciente) setPaciente(data.paciente);
      });
    // Obtener tarifas de rayos x
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        const rayosxTarifas = (data.tarifas || [])
          .filter(t => t.servicio_tipo === "rayosx")
          .map(t => ({
            ...t,
            id: Number(t.id),
            medico_id: t.medico_id !== undefined && t.medico_id !== null ? Number(t.medico_id) : t.medico_id,
            precio_particular: Number(t.precio_particular || t.precio || 0)
          }));
        setTarifas(rayosxTarifas);
      });
    // Obtener lista de médicos
    fetch(`${BASE_URL}api_medicos.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setMedicos(data.medicos || []);
      });
  }, [pacienteId]);

  // Consultar estado de caja al entrar
  useEffect(() => {
    fetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setCajaEstado(data?.estado || 'cerrada'))
      .catch(() => setCajaEstado('cerrada'));
  }, []);

  // Precarga desde cobro existente si viene ?cobro_id=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const cobroId = params.get("cobro_id");
    const cotizacionId = params.get("cotizacion_id");
    const loaders = [];
    if (cobroId || cotizacionId) {
      setPreloadedItems([]);
      setPendingRxItems([]);
    }
    if (cobroId) loaders.push(fetch(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cobro = data.cobro || data?.result?.cobro || null; if (!data.success || !cobro) return;
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsRx = [];
      detalles.forEach(cd => { if ((cd.servicio_tipo || '').toLowerCase() === 'rayosx') { try { const arr = JSON.parse(cd.descripcion); if (Array.isArray(arr)) itemsRx.push(...arr); } catch { /* ignore parse error */ } } });
      if (itemsRx.length) {
        setPendingRxItems(prev => [...prev, ...itemsRx]);
      }
    }));
    if (cotizacionId) loaders.push(fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cot = data.cotizacion || null; if (!data.success || !cot) return;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      setCotizacionDetallesOriginales(detalles);
      const itemsRx = detalles.filter(d => (d.servicio_tipo || '').toLowerCase() === 'rayosx');
      if (itemsRx.length) {
        setPendingRxItems(prev => [...prev, ...itemsRx]);
      }
    }));
    if (!loaders.length) return; Promise.all(loaders).catch(() => {});
  }, [location.search]);

  // Resolver ítems precargados contra tarifas actuales (por id o por descripción)
  useEffect(() => {
    if (!pendingRxItems.length || !tarifas.length) return;

    const counts = {};
    const qtys = {};
    const resolvedItems = [];

    pendingRxItems.forEach((item) => {
      const rawId = Number(item.servicio_id || item.tarifa_id || 0);
      const byId = tarifas.find((t) => Number(t.id) === rawId) || null;
      const byDesc = tarifas.find(
        (t) => normalizeText(t.descripcion || t.nombre) === normalizeText(item.descripcion)
      ) || null;
      const tarifa = byId || byDesc;
      if (!tarifa) return;

      const resolvedId = Number(tarifa.id);
      const qty = Number(item.cantidad || 1);
      counts[resolvedId] = (counts[resolvedId] || 0) + qty;
      qtys[resolvedId] = counts[resolvedId];
      resolvedItems.push({ ...item, _resolved_id: resolvedId });
    });

    const uniqueSel = Array.from(new Set(Object.keys(counts).map(Number))).filter(Boolean);
    setSeleccionados(uniqueSel);
    setCantidades((prev) => ({ ...prev, ...qtys }));
    setPreloadedCounts(counts);
    setPreloadedItems(resolvedItems);
  }, [pendingRxItems, tarifas]);

  const actualizarCobro = async () => {
    const cobroId = new URLSearchParams(location.search).get('cobro_id');
    if (!cobroId) return;
    // Verificar caja abierta
    try {
      const ce = await fetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' }).then(r => r.json());
      if (!ce?.success || ce?.estado !== 'abierta') {
        setCajaEstado(ce?.estado || 'cerrada');
        Swal.fire('Error', 'No hay caja abierta. Abre caja para actualizar este cobro.', 'error');
        return;
      }
      setCajaEstado('abierta');
    } catch { Swal.fire('Error', 'No se pudo verificar el estado de la caja.', 'error'); return; }
    const allIds = new Set([
      ...seleccionados.map(Number),
      ...Object.keys(preloadedCounts || {}).map(Number)
    ]);

    const itemsToAdd = [];
    const reductions = [];

    allIds.forEach(tid => {
      const isSelected = seleccionados.includes(Number(tid));
      const desiredQty = isSelected ? Number(cantidades[tid] || 1) : 0;
      const preQty = Number(preloadedCounts[tid] || 0);
      const diff = desiredQty - preQty;
      if (diff > 0) {
        const tarifa = tarifas.find(t => Number(t.id) === Number(tid));
        if (!tarifa) return;
        itemsToAdd.push({
          servicio_id: Number(tid),
          descripcion: tarifa.descripcion || tarifa.nombre,
          cantidad: diff,
          precio_unitario: tarifa.precio_particular,
          subtotal: tarifa.precio_particular * diff,
          medico_id: tarifa.medico_id || "",
          especialidad: tarifa.especialidad || ""
        });
      } else if (diff < 0) {
        reductions.push({ servicio_id: Number(tid), cantidad_eliminar: Math.abs(diff) });
      }
    });

    if (itemsToAdd.length === 0 && reductions.length === 0) {
      Swal.fire('Sin cambios', 'No hay cambios para aplicar.', 'info');
      return;
    }

    // Motivo único para todas las reducciones
    let motivoReduccion = '';
    if (reductions.length > 0) {
      const resMotivo = await Swal.fire({
        title: 'Motivo de la reducción/eliminación',
        input: 'text',
        inputPlaceholder: 'Escribe un motivo',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
          if (!value || !value.trim()) return 'Motivo requerido';
          return undefined;
        }
      });
      if (!resMotivo.isConfirmed) return;
      motivoReduccion = (resMotivo.value || '').toString().trim();
    }

    // Aplicar reducciones eliminando líneas exactas (y si hace falta, split: eliminar + re-agregar remanente)
    let baselineItems = Array.isArray(preloadedItems) ? [...preloadedItems] : [];
    const additionsAfterReductions = [...itemsToAdd];

    const findLineIndex = (lines, servicioId, remaining) => {
      let exactIdx = -1;
      let smallestBiggerIdx = -1;
      let biggestIdx = -1;
      let biggestQty = -1;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const lnResolved = Number(ln?._resolved_id || ln?.servicio_id || 0);
        if (lnResolved !== Number(servicioId)) continue;
        const q = Number(ln?.cantidad || 0);
        if (q <= 0) continue;
        if (q === remaining) { exactIdx = i; break; }
        if (q > remaining) {
          if (smallestBiggerIdx === -1 || q < Number(lines[smallestBiggerIdx]?.cantidad || 0)) {
            smallestBiggerIdx = i;
          }
        }
        if (q > biggestQty) { biggestQty = q; biggestIdx = i; }
      }
      if (exactIdx !== -1) return exactIdx;
      if (smallestBiggerIdx !== -1) return smallestBiggerIdx;
      return biggestIdx;
    };

    try {
      for (const red of reductions) {
        let remaining = Number(red.cantidad_eliminar || 0);
        while (remaining > 0) {
          const idx = findLineIndex(baselineItems, red.servicio_id, remaining);
          if (idx === -1) throw new Error('No se encontró el ítem a reducir en el cobro.');
          const line = baselineItems[idx];
          const lineQty = Number(line?.cantidad || 0);
          if (lineQty <= 0) throw new Error('Cantidad inválida en el detalle del cobro.');

          const delResp = await fetch(`${BASE_URL}api_cobro_eliminar_item.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cobro_id: Number(cobroId),
              cotizacion_id: Number(new URLSearchParams(location.search).get('cotizacion_id') || 0),
              servicio_tipo: 'rayosx',
              item: line,
              motivo: motivoReduccion
            })
          });
          const delData = await delResp.json();
          if (!delData?.success) throw new Error(delData?.error || 'No se pudo eliminar el ítem del cobro.');

          baselineItems.splice(idx, 1);

          if (lineQty > remaining) {
            const remainderQty = lineQty - remaining;
            const pu = Number(line?.precio_unitario || 0) || (Number(line?.subtotal || 0) / Math.max(1, lineQty));
            additionsAfterReductions.push({
              ...line,
              cantidad: remainderQty,
              precio_unitario: pu,
              subtotal: pu * remainderQty
            });
            remaining = 0;
          } else {
            remaining -= lineQty;
          }
        }
      }

      if (additionsAfterReductions.length > 0) {
        const resp = await fetch(`${BASE_URL}api_cobro_actualizar.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cobro_id: Number(cobroId),
            cotizacion_id: Number(new URLSearchParams(location.search).get('cotizacion_id') || 0),
            servicio_tipo: 'rayosx',
            items: additionsAfterReductions
          })
        });
        const data = await resp.json();
        if (!data?.success) {
          throw new Error(data?.error || 'No se pudo actualizar el cobro');
        }
        baselineItems = [...baselineItems, ...additionsAfterReductions];
      }

      // Recalcular baseline de cantidades según UI (para evitar diffs repetidos)
      const nextCounts = {};
      allIds.forEach(tid => {
        const isSelected = seleccionados.includes(Number(tid));
        const desiredQty = isSelected ? Number(cantidades[tid] || 1) : 0;
        if (desiredQty > 0) nextCounts[Number(tid)] = desiredQty;
      });
      setPreloadedCounts(nextCounts);
      setPreloadedItems(baselineItems);

      Swal.fire('Actualizado', 'Se aplicaron los cambios en el cobro.', 'success');
    } catch (e) {
      Swal.fire('Error', e?.message || 'Fallo de conexión con el servidor', 'error');
    }
  };

  const agregarSeleccion = (id) => {
    const nid = Number(id);
    setSeleccionados(sel => sel.includes(nid) ? sel : [...sel, nid]);
    setCantidades(cant => ({ ...cant, [nid]: 1 }));
  };
  const quitarSeleccion = (id) => {
    const nid = Number(id);
    setSeleccionados(sel => sel.filter(mid => mid !== nid));
    setCantidades(cant => {
      const nuevo = { ...cant };
      delete nuevo[nid];
      return nuevo;
    });
  };
  const actualizarCantidad = (id, cantidad) => {
    const nid = Number(id);
    setCantidades(cant => ({ ...cant, [nid]: cantidad }));
  };
  const calcularTotal = () => {
    return seleccionados.reduce((total, tid) => {
      const tarifa = tarifas.find(t => Number(t.id) === Number(tid));
      const cantidad = cantidades[tid] || 1;
      return tarifa ? total + tarifa.precio_particular * cantidad : total;
    }, 0);
  };

  const construirDetallesSeleccionados = () => {
    return seleccionados.map(tid => {
      const tarifa = tarifas.find(t => t.id === tid);
      const cantidad = Number(cantidades[tid] || 1);
      const nombreMedico = obtenerNombreMedicoTarifa(tarifa);
      return tarifa ? {
        servicio_tipo: "rayosx",
        servicio_id: tid,
        descripcion: tarifa.descripcion || tarifa.nombre,
        cantidad,
        precio_unitario: tarifa.precio_particular,
        subtotal: tarifa.precio_particular * cantidad,
        medico_id: tarifa.medico_id || "",
        medico_nombre: nombreMedico
      } : null;
    }).filter(Boolean);
  };

  const agregarAlCarrito = () => {
    if (seleccionados.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos un estudio de Rayos X para agregar al carrito.', 'info');
      return;
    }

    const sp = new URLSearchParams(location.search);
    const isEditingCotizacion = Boolean(sp.get('cotizacion_id')) && !Boolean(sp.get('cobro_id'));
    const detallesBase = construirDetallesSeleccionados();

    const yaExisteEnCarrito = (detalle) => {
      return Array.isArray(cart?.items) && cart.items.some((it) => (
        String(it?.serviceType || '').toLowerCase() === 'rayosx'
        && Number(it?.serviceId || 0) === Number(detalle?.servicio_id || 0)
        && Number(it?.unitPrice || 0) === Number(detalle?.precio_unitario || 0)
      ));
    };

    const detalles = detallesBase
      .map((d) => {
        if (!isEditingCotizacion) return d;
        const preQty = Number(preloadedCounts[Number(d.servicio_id)] || 0);
        const desiredQty = Number(d.cantidad || 0);
        const diff = desiredQty - preQty;
        if (diff <= 0) return null;
        return {
          ...d,
          cantidad: diff,
          subtotal: Number(d.precio_unitario || 0) * diff,
        };
      })
      .filter(Boolean)
      .filter((d) => !(isEditingCotizacion && yaExisteEnCarrito(d)));

    if (detalles.length === 0) {
      Swal.fire('Atención', isEditingCotizacion ? 'No hay estudios nuevos para agregar al carrito.' : 'No hay estudios válidos para agregar.', 'info');
      return;
    }

    addItems({
      patientId: Number(pacienteId),
      patientName: paciente ? `${paciente.nombres || paciente.nombre || ''} ${paciente.apellidos || paciente.apellido || ''}`.trim() : `Paciente #${pacienteId}`,
      items: detalles.map((d) => ({
        serviceType: 'rayosx',
        serviceId: Number(d.servicio_id || 0),
        description: d.descripcion || 'Rayos X',
        quantity: Number(d.cantidad || 1),
        unitPrice: Number(d.precio_unitario || 0),
        source: 'rayosx',
      })),
    });

    if (!isEditingCotizacion) {
      setSeleccionados([]);
      setMensaje('');
    }
    Swal.fire('Listo', `Se agregaron ${detalles.length} estudio(s) al carrito.`, 'success');
  };

  const obtenerDetallesCotizacion = async (targetCotizacionId) => {
    const res = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(targetCotizacionId)}`, {
      credentials: 'include',
    });
    const data = await res.json();
    if (!data?.success || !data?.cotizacion) {
      throw new Error(data?.error || 'No se pudo cargar la cotización actual para edición');
    }
    return Array.isArray(data.cotizacion.detalles) ? data.cotizacion.detalles : [];
  };

  const construirDetallesEditados = async (cotizacionId, detallesRayosX) => {
    const base = cotizacionDetallesOriginales.length > 0
      ? cotizacionDetallesOriginales
      : await obtenerDetallesCotizacion(cotizacionId);
    const detallesNoRayosX = base.filter((d) => {
      const t = String(d?.servicio_tipo || '').toLowerCase();
      return t !== 'rayosx' && t !== 'rayos_x';
    });
    return [...detallesNoRayosX, ...detallesRayosX];
  };

  const cotizar = async () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un estudio de Rayos X.");
      return;
    }
    // Construir detalles para cotización
    const detalles = construirDetallesSeleccionados();

    const sp = new URLSearchParams(location.search);
    const cotizacionId = sp.get('cotizacion_id');

    let limpiarCarritoAlFinal = false;
    const cartItemsCount = Array.isArray(cart?.items) ? cart.items.length : 0;
    const esMismoPacienteCarrito = Number(cart?.patientId || 0) === Number(pacienteId || 0);
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
          motivo: 'Edición de cotización (merge seguro) desde cotizador de Rayos X'
        }
      : {
          paciente_id: Number(pacienteId),
          total,
          detalles: detallesFinales,
          observaciones: 'Cotización registrada desde cotizador de Rayos X'
        };

    try {
      let data;
      const res = await fetch(`${BASE_URL}api_cotizaciones.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = await res.json();

      const noEditable = /no esta en estado editable|no está en estado editable/i.test(String(data?.error || ''));
      if (!data?.success && cotizacionId && noEditable) {
        const confirmAdenda = await Swal.fire({
          title: 'Cotización ya pagada',
          text: `La cotización #${Number(cotizacionId)} no se puede editar directamente. ¿Deseas crear una adenda nueva con estos cambios?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, crear adenda',
          cancelButtonText: 'No, cancelar',
        });
        if (!confirmAdenda.isConfirmed) {
          setMensaje('Operación cancelada. No se creó ninguna adenda.');
          return;
        }
        const payloadAdenda = {
          accion: 'adenda',
          cotizacion_id: Number(cotizacionId),
          detalles: detallesFinales,
          total,
          motivo: 'Adenda confirmada por usuario desde cotizador de Rayos X (cotización pagada)'
        };
        const resAdenda = await fetch(`${BASE_URL}api_cotizaciones.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadAdenda)
        });
        data = await resAdenda.json();
      }

      if (!data?.success) {
        throw new Error(data?.error || 'No se pudo registrar la cotización');
      }

      const cotizacionDestino = Number(data?.cotizacion_id || cotizacionId || 0);
      const fueAdenda = Boolean(cotizacionId) && cotizacionDestino > 0 && cotizacionDestino !== Number(cotizacionId);

      setMensaje(
        fueAdenda
          ? 'Adenda creada correctamente.'
          : (cotizacionId ? 'Cotización actualizada correctamente.' : 'Cotización registrada correctamente.')
      );
      Swal.fire('Listo', fueAdenda ? 'Adenda creada.' : (cotizacionId ? 'Cotización actualizada.' : 'Cotización registrada.'), 'success').then(async () => {
        if (limpiarCarritoAlFinal) {
          clearCart();
        }
        if (cotizacionDestino > 0 && cotizacionId) {
          try {
            const refrescados = await obtenerDetallesCotizacion(cotizacionDestino);
            setCotizacionDetallesOriginales(refrescados);
          } catch {
            // Continuar navegación aunque falle el refresco.
          }
          navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${Number(cotizacionDestino)}&modo=editar&back_to=/cotizaciones`, {
            state: { pacienteId: Number(pacienteId), cotizacionId: Number(cotizacionDestino), backTo: '/cotizaciones', modo: 'editar' },
          });
          return;
        }
        navigate('/cotizaciones');
      });
    } catch (error) {
      Swal.fire('Error', error?.message || 'No se pudo registrar la cotización', 'error');
    }
  };

  const mostrarPanelDerecho = seleccionados.length > 0;

  return (
    <div className={`max-w-7xl mx-auto p-10 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100 transition-all ${cartCount > 0 ? 'xl:mr-[22rem]' : ''}`}>
      {(() => {
        const sp = new URLSearchParams(location.search);
        const cobroId = sp.get('cobro_id');
        const cotizacionId = sp.get('cotizacion_id');
        const isEditing = Boolean(cobroId || cotizacionId);
        if (!isEditing) {
          return (
            <button
              onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })}
              className="mb-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-semibold"
            >← Volver</button>
          );
        }
        if (cotizacionId && !cobroId) {
          return (
            <button
              onClick={() => navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${Number(cotizacionId)}&modo=editar&back_to=/cotizaciones`, {
                state: { pacienteId: Number(pacienteId), cotizacionId: Number(cotizacionId), backTo: '/cotizaciones', modo: 'editar' },
              })}
              className="mb-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-semibold"
            >← Volver a Servicios</button>
          );
        }
        return (
          <button
            onClick={() => navigate(pacienteId ? `/consumo-paciente/${pacienteId}${cobroId ? `?cobro_id=${cobroId}` : ''}` : '/pacientes')}
            className="mb-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-semibold"
          >← Volver a Consumo del Paciente</button>
        );
      })()}
      <h2 className="text-2xl font-bold text-blue-900 mb-4 flex items-center gap-2">
        <span role="img" aria-label="rayosx">🩻</span> Cotizador de Rayos X
      </h2>
          {(new URLSearchParams(location.search).get('cobro_id') || new URLSearchParams(location.search).get('cotizacion_id')) && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              {new URLSearchParams(location.search).get('cobro_id')
                ? `Editando cobro #${new URLSearchParams(location.search).get('cobro_id')}`
                : `Editando cotización #${new URLSearchParams(location.search).get('cotizacion_id')}`}
            </span>
          )}
      {paciente && (
        <div className="mb-4 p-2 bg-blue-50 rounded text-blue-800 text-sm">
          <span className="font-bold">Paciente:</span> {paciente.nombres || paciente.nombre} {paciente.apellidos || paciente.apellido} (DNI: {paciente.dni})
        </div>
      )}
      <div className={`grid grid-cols-1 gap-8 ${mostrarPanelDerecho ? 'md:grid-cols-2' : ''}`}>
        <div className="mb-4 max-h-[500px] overflow-y-auto">
          <div className="font-bold mb-2 flex flex-col gap-2">
            <span>Estudios disponibles:</span>
            <input
              type="text"
              placeholder="Buscar estudio, descripción o doctor..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full"
            />
          </div>
          {tarifas.length === 0 ? (
            <div className="text-gray-500">No hay estudios de Rayos X registrados.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tarifasFiltradas.map(tarifa => {
                const medicoNombre = obtenerNombreMedicoTarifa(tarifa);
                return (
                  <li key={tarifa.id} className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{tarifa.descripcion || tarifa.nombre}</div>
                      <div className="text-xs text-gray-500">Precio: S/ {tarifa.precio_particular}</div>
                      <div className="text-xs text-blue-700 mt-1">Doctor: {medicoNombre || "Sin doctor"}</div>
                    </div>
                    {seleccionados.includes(Number(tarifa.id)) ? (
                      <>
                        <input
                          type="number"
                          min={1}
                          value={cantidades[Number(tarifa.id)] || 1}
                          onChange={e => actualizarCantidad(Number(tarifa.id), Math.max(1, Number(e.target.value)))}
                          className="border rounded-lg px-2 w-16 bg-white"
                        />
                        <button
                          onClick={() => quitarSeleccion(Number(tarifa.id))}
                          className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xl shadow transition"
                          aria-label="Quitar"
                        >✕</button>
                      </>
                    ) : (
                      <button
                        onClick={() => agregarSeleccion(Number(tarifa.id))}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 text-xl shadow transition"
                        aria-label="Agregar"
                      >+</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Columna derecha: resumen de cotización y módulo de cobros */}
        {mostrarPanelDerecho && (
        <div className="w-full md:sticky md:top-8 h-fit">
          {seleccionados.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-blue-700 mb-4 flex items-center gap-2">
                <span>📝</span>Resumen de Cotización
              </h4>
              <ul className="divide-y divide-gray-100 mb-2 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                {seleccionados.map(tid => {
                  const tarifa = tarifas.find(t => Number(t.id) === Number(tid));
                  const cantidad = cantidades[tid] || 1;
                  return tarifa ? (
                    <li key={tid} className="py-2 flex flex-col md:flex-row justify-between items-center gap-2">
                      <span className="w-full md:w-1/2">{tarifa.descripcion || tarifa.nombre}</span>
                      <span className="w-full md:w-1/4">{cantidad} estudio(s)</span>
                      <span className="font-bold text-green-700 w-full md:w-1/4">S/ {(tarifa.precio_particular * cantidad).toFixed(2)}</span>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right">
                Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={() => { setSeleccionados([]); setMensaje(""); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                <button onClick={agregarAlCarrito} className="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700">Agregar al carrito</button>
                {new URLSearchParams(location.search).get('cobro_id') ? (
                  <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                ) : (
                  <button onClick={cotizar} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{new URLSearchParams(location.search).get('cotizacion_id') ? 'Actualizar cotización' : 'Registrar Cotización'}</button>
                )}
                {(new URLSearchParams(location.search).get('cobro_id') || !new URLSearchParams(location.search).get('cobro_id')) && cajaEstado === 'cerrada' && (
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <span className="text-sm text-red-600">Caja cerrada: abre una caja para poder {new URLSearchParams(location.search).get('cobro_id') ? 'actualizar' : 'cotizar'}.</span>
                    <button onClick={() => navigate('/contabilidad')} className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded border border-yellow-300 hover:bg-yellow-200">Ir a Contabilidad</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
      {mensaje && (
        <div className="mt-4 text-center font-semibold text-green-600">
          {mensaje}
        </div>
      )}
    </div>
  );
}
