import { authFetch } from "../utils/apiClient";
import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BASE_URL, fetchConfigSingleton, getCachedAgendaProgramacionModo } from "../config/config";
import { useQuoteCart } from "../context/QuoteCartContext";
import { aplicarExclusionConsultaDelCarrito, buildAgendaGuardEntriesFromDetalles, detectarCruceConCarrito, secuenciarDetallesPacienteSinCruce, validarAgendaAntesDeCotizar } from "../utils/agendaGuardCotizacion";
import { getMedicoAccentColor } from "../utils/medicoAccent";
import { getReferenceHorarioFromCart, suggestNextHorarioFromCart } from "../utils/cartScheduling";
import useAgendaAvailabilityByTargets from "../hooks/useAgendaAvailabilityByTargets";
import useSubmitGuard from "../hooks/useSubmitGuard";
import { confirmarLimpiezaCarrito, finalizarRegistroCotizacion, registrarConFallbackAdenda } from "../utils/cotizacionSubmit";
import { getLimaDate, getLimaTime as getDefaultTime, normalizeAgendaProgramacionModo, normalizeHourHm } from "../utils/dateTime";

function updateConsultaDescriptionSchedule(description, fechaProgramada, horaProgramada) {
  const base = String(description || "").trim();
  const fecha = String(fechaProgramada || "").slice(0, 10);
  const hora = String(horaProgramada || "").slice(0, 5);
  const scheduleText = `(${fecha} ${hora})`;
  if (!base) return `Consulta ${scheduleText}`;
  if (/\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\)\s*$/.test(base)) {
    return base.replace(/\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\)\s*$/, scheduleText);
  }
  return `${base} ${scheduleText}`;
}

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
  const [programacionPorEstudio, setProgramacionPorEstudio] = useState({}); // { [tarifaId]: { fecha, hora } }
  const [manualProgramacionByEstudio, setManualProgramacionByEstudio] = useState({});
  const [agendaProgramacionModo, setAgendaProgramacionModo] = useState(() => getCachedAgendaProgramacionModo());
  const [mensaje, setMensaje] = useState("");
  const [preloadedCounts, setPreloadedCounts] = useState({}); // {tarifaId: cantidad}
  const [preloadedItems, setPreloadedItems] = useState([]); // líneas exactas precargadas desde cobro/cotización
  const [pendingRxItems, setPendingRxItems] = useState([]); // ítems crudos para resolver contra tarifas actuales
  const [cajaEstado, setCajaEstado] = useState(null);
  const { saving, run: runGuardedSubmit } = useSubmitGuard("cotizacion");
  const [cotizacionDetallesOriginales, setCotizacionDetallesOriginales] = useState([]);
  const [programacionConsultaCotizacion, setProgramacionConsultaCotizacion] = useState(null); // {consultaId, fecha, hora}
  const { cart, addItems, replaceCart, clearCart, count: cartCount } = useQuoteCart();
  const pacienteTemporal = location.state?.pacienteTemporal || null;
  const esCotizacionInformativa = Number(pacienteId || 0) <= 0;
  const nombrePacienteTemporal = `${String(pacienteTemporal?.nombre || "").trim()} ${String(pacienteTemporal?.apellido || "").trim()}`.trim();
  const dniPacienteTemporal = String(pacienteTemporal?.dni || "").trim();

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const cotizacionIdEdicion = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const value = Number(sp.get("cotizacion_id") || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [location.search]);

  const programacionBaseEdicion = useMemo(() => {
    if (cotizacionIdEdicion <= 0) return null;

    if (programacionConsultaCotizacion?.fecha && programacionConsultaCotizacion?.hora) {
      return {
        fecha: String(programacionConsultaCotizacion.fecha).slice(0, 10),
        hora: String(programacionConsultaCotizacion.hora).slice(0, 5),
      };
    }

    if (!Array.isArray(cotizacionDetallesOriginales) || cotizacionDetallesOriginales.length === 0) {
      return null;
    }

    const detallesActivos = cotizacionDetallesOriginales.filter((d) =>
      String(d?.estado_item || "activo").toLowerCase() !== "eliminado"
    );

    const detalleConConsultaId = detallesActivos.find((d) => Number(d?.consulta_id || d?.consultaId || 0) > 0);
    const pickHorario = (detalle) => {
      const fecha = String(detalle?.fecha_programada || "").slice(0, 10);
      const hora = normalizeHourHm(detalle?.hora_programada || detalle?.hora || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !hora) return null;
      return { fecha, hora };
    };

    const detalleConHorario = detalleConConsultaId || detallesActivos.find((d) => pickHorario(d));
    if (!detalleConHorario) return null;
    return pickHorario(detalleConHorario);
  }, [cotizacionIdEdicion, programacionConsultaCotizacion, cotizacionDetallesOriginales]);

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

  const getProgramacionSugeridaEstudio = (tarifaId, fechaPreferida = "") => {
    const tarifa = tarifas.find((t) => Number(t.id) === Number(tarifaId));
    const medicoId = Number(tarifa?.medico_id || 0);
    const fechaBase = String(fechaPreferida || programacionBaseEdicion?.fecha || getLimaDate()).slice(0, 10);
    const sugerida = suggestNextHorarioFromCart(cart?.items, {
      medicoId,
      fechaBase,
      stepMinutes: 30,
    });
    const referencia = getReferenceHorarioFromCart(cart?.items);
    return {
      fecha: String(
        cotizacionIdEdicion > 0
          ? (programacionBaseEdicion?.fecha || sugerida?.fecha || referencia?.fecha || fechaBase)
          : (sugerida?.fecha || referencia?.fecha || fechaBase)
      ).slice(0, 10),
      hora: String(
        cotizacionIdEdicion > 0
          ? (programacionBaseEdicion?.hora || sugerida?.hora || referencia?.hora || getDefaultTime())
          : (sugerida?.hora || referencia?.hora || getDefaultTime())
      ).slice(0, 5),
    };
  };

  const selectedAvailabilityTargets = useMemo(() => {
    if (normalizeAgendaProgramacionModo(agendaProgramacionModo) === "free") return [];
    return seleccionados
      .map((id) => {
        const tarifa = tarifas.find((t) => Number(t.id) === Number(id));
        const medicoId = Number(tarifa?.medico_id || 0);
        const actual = programacionPorEstudio[Number(id)] || {};
        const fecha = String(actual?.fecha || getLimaDate()).slice(0, 10);
        if (medicoId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
        return {
          tarifaId: Number(id),
          medicoId,
          fecha,
          key: `${medicoId}|${fecha}`,
        };
      })
      .filter(Boolean);
  }, [seleccionados, tarifas, programacionPorEstudio, agendaProgramacionModo]);

  const { availabilityByPair } = useAgendaAvailabilityByTargets({
    targets: selectedAvailabilityTargets,
    enabled: normalizeAgendaProgramacionModo(agendaProgramacionModo) !== "free" && selectedAvailabilityTargets.length > 0,
  });

  // El selector de hora muestra la primera hora libre cuando la guardada no esta disponible para la fecha
  // elegida. Se sincroniza el estado para registrar exactamente lo que se ve.
  useEffect(() => {
    const modo = normalizeAgendaProgramacionModo(agendaProgramacionModo);
    if (modo === "free" || selectedAvailabilityTargets.length === 0) return;
    const horaBaseEdicion = cotizacionIdEdicion > 0 ? String(programacionBaseEdicion?.hora || "").slice(0, 5) : "";
    setProgramacionPorEstudio((prev) => {
      let changed = false;
      const next = { ...prev };
      selectedAvailabilityTargets.forEach((target) => {
        const avail = availabilityByPair[target.key];
        if (!avail || avail.loading || avail.error) return;
        if (modo === "mixed" && manualProgramacionByEstudio[target.tarifaId]) return;
        const libres = Array.isArray(avail.horasLibres) ? avail.horasLibres : [];
        const inicios = horaBaseEdicion && !libres.includes(horaBaseEdicion) ? [horaBaseEdicion, ...libres] : libres;
        if (inicios.length === 0) return;
        const actual = next[target.tarifaId] || {};
        if (inicios.includes(String(actual.hora || "").slice(0, 5))) return;
        next[target.tarifaId] = { ...actual, fecha: target.fecha, hora: inicios[0] };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [selectedAvailabilityTargets, availabilityByPair, agendaProgramacionModo, manualProgramacionByEstudio, cotizacionIdEdicion, programacionBaseEdicion]);

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
    authFetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`, {
      credentials: 'include',
      cache: 'no-store'
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paciente) setPaciente(data.paciente);
      });
    // Obtener tarifas de rayos x
    authFetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
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
    authFetch(`${BASE_URL}api_medicos.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setMedicos(data.medicos || []);
      });
  }, [pacienteId]);

  useEffect(() => {
    let cancelled = false;
    const applyModeFromPayload = (data) => {
      setAgendaProgramacionModo(normalizeAgendaProgramacionModo(data?.agenda_programacion_modo));
    };
    fetchConfigSingleton().then((result) => {
      if (cancelled) return;
      applyModeFromPayload(result?.data || {});
    });
    const onConfigUpdated = (event) => applyModeFromPayload(event?.detail || {});
    window.addEventListener("clinica-config-updated", onConfigUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("clinica-config-updated", onConfigUpdated);
    };
  }, []);

  // Consultar estado de caja al entrar
  useEffect(() => {
    authFetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' })
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
      setProgramacionPorEstudio({});
      setProgramacionConsultaCotizacion(null);
    }
    if (cobroId) loaders.push(authFetch(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cobro = data.cobro || data?.result?.cobro || null; if (!data.success || !cobro) return;
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsRx = [];
      detalles.forEach(cd => { if ((cd.servicio_tipo || '').toLowerCase() === 'rayosx') { try { const arr = JSON.parse(cd.descripcion); if (Array.isArray(arr)) itemsRx.push(...arr); } catch { /* ignore parse error */ } } });
      if (itemsRx.length) {
        setPendingRxItems(prev => [...prev, ...itemsRx]);
      }
    }));
    if (cotizacionId) loaders.push(authFetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cot = data.cotizacion || null; if (!data.success || !cot) return;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      setCotizacionDetallesOriginales(detalles);
      const itemsRx = detalles.filter(d => (d.servicio_tipo || '').toLowerCase() === 'rayosx');
      if (itemsRx.length) {
        setPendingRxItems(prev => [...prev, ...itemsRx]);
      }
    }));
    if (cotizacionId) loaders.push(
      authFetch(`${BASE_URL}api_consultas.php?cotizacion_id=${cotizacionId}&no_cache=1`, { credentials: "include", cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          if (!data?.success) return;
          const consulta = Array.isArray(data.consultas) ? data.consultas[0] : (data.consulta || null);
          const consultaId = Number(consulta?.id || consulta?.consulta_id || 0);
          const fecha = String(consulta?.fecha || "").slice(0, 10);
          const hora = normalizeHourHm(consulta?.hora || "");
          if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && hora) {
            setProgramacionConsultaCotizacion({
              consultaId: consultaId > 0 ? consultaId : 0,
              fecha,
              hora,
            });
          }
        })
    );
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

  useEffect(() => {
    const handleQuoteCartCleared = () => {
      setSeleccionados([]);
      setMensaje("");
    };

    window.addEventListener("quote-cart-cleared", handleQuoteCartCleared);
    return () => window.removeEventListener("quote-cart-cleared", handleQuoteCartCleared);
  }, []);

  const actualizarCobro = async () => {
    const cobroId = new URLSearchParams(location.search).get('cobro_id');
    if (!cobroId) return;
    // Verificar caja abierta
    try {
      const ce = await authFetch(`${BASE_URL}api_caja_estado.php`, { credentials: 'include' }).then(r => r.json());
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

          const delResp = await authFetch(`${BASE_URL}api_cobro_eliminar_item.php`, {
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
        const resp = await authFetch(`${BASE_URL}api_cobro_actualizar.php`, {
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

  useEffect(() => {
    setProgramacionPorEstudio((prev) => {
      const next = {};
      seleccionados.forEach((id) => {
        const key = Number(id);
        const sugerida = getProgramacionSugeridaEstudio(key, prev[key]?.fecha || "");
        next[key] = {
          fecha: prev[key]?.fecha || sugerida.fecha,
          hora: prev[key]?.hora || sugerida.hora,
        };
      });
      return next;
    });
  }, [seleccionados]);

  useEffect(() => {
    if (cotizacionIdEdicion <= 0) return;
    const fechaBase = String(programacionBaseEdicion?.fecha || "").slice(0, 10);
    const horaBase = String(programacionBaseEdicion?.hora || "").slice(0, 5);
    if (!fechaBase || !horaBase || !Array.isArray(seleccionados) || seleccionados.length === 0) return;

    setProgramacionPorEstudio((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      seleccionados.forEach((id) => {
        const key = Number(id);
        const actual = next[key] || {};
        const fechaActual = String(actual?.fecha || "").slice(0, 10);
        const horaActual = String(actual?.hora || "").slice(0, 5);
        if (fechaActual !== fechaBase || horaActual !== horaBase) {
          next[key] = { ...actual, fecha: fechaBase, hora: horaBase };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [cotizacionIdEdicion, programacionBaseEdicion, seleccionados]);

  const actualizarProgramacion = (estudioId, campo, valor) => {
    const key = Number(estudioId);
    const sugerida = getProgramacionSugeridaEstudio(key, "");
    setProgramacionPorEstudio((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || sugerida),
        [campo]: valor,
      },
    }));
  };

  const actualizarHoraProgramadaEstudio = (estudioId, horaValue, options = {}) => {
    const key = Number(estudioId);
    const modo = normalizeAgendaProgramacionModo(agendaProgramacionModo);
    const shouldCheckOccupied = modo !== "free" && !options.skipOccupiedCheck;
    const horaNorm = normalizeHourHm(horaValue);
    const actual = programacionPorEstudio[key] || getProgramacionSugeridaEstudio(key);
    const fecha = String(actual?.fecha || "").slice(0, 10);
    const tarifa = tarifas.find((t) => Number(t.id) === key);
    const medicoId = Number(tarifa?.medico_id || 0);
    const ocupadas = Array.isArray(availabilityByPair?.[`${medicoId}|${fecha}`]?.horasOcupadas)
      ? availabilityByPair[`${medicoId}|${fecha}`].horasOcupadas
      : [];

    if (shouldCheckOccupied && horaNorm && ocupadas.includes(horaNorm)) {
      Swal.fire("Horario ocupado", `La hora ${horaNorm} ya está ocupada para este médico en ${fecha}. Elige otra hora para evitar choque.`, "warning");
      return;
    }

    actualizarProgramacion(key, "hora", String(horaValue || "").slice(0, 5));
  };

  const calcularTotal = () => {
    return seleccionados.reduce((total, tid) => {
      const tarifa = tarifas.find(t => Number(t.id) === Number(tid));
      const cantidad = cantidades[tid] || 1;
      return tarifa ? total + tarifa.precio_particular * cantidad : total;
    }, 0);
  };

  const construirDetallesSeleccionados = () => {
    const fechaBaseConsulta = String(programacionBaseEdicion?.fecha || "").slice(0, 10);
    const horaBaseConsulta = String(programacionBaseEdicion?.hora || "").slice(0, 5);
    const consultaBaseId = Number(programacionConsultaCotizacion?.consultaId || 0);
    return seleccionados.map(tid => {
      const tarifa = tarifas.find(t => Number(t.id) === Number(tid));
      const cantidad = Number(cantidades[tid] || 1);
      const nombreMedico = obtenerNombreMedicoTarifa(tarifa);
      const programacion = programacionPorEstudio[Number(tid)] || getProgramacionSugeridaEstudio(Number(tid));
      const coincideProgramacionBase = (
        cotizacionIdEdicion > 0
        && consultaBaseId > 0
        && fechaBaseConsulta
        && horaBaseConsulta
        && String(programacion?.fecha || "").slice(0, 10) === fechaBaseConsulta
        && String(programacion?.hora || "").slice(0, 5) === horaBaseConsulta
      );
      return tarifa ? {
        servicio_tipo: "rayosx",
        servicio_id: tid,
        descripcion: tarifa.descripcion || tarifa.nombre,
        cantidad,
        precio_unitario: tarifa.precio_particular,
        subtotal: tarifa.precio_particular * cantidad,
        medico_id: tarifa.medico_id || "",
        medico_nombre: nombreMedico,
        consulta_id: cotizacionIdEdicion > 0 ? consultaBaseId : 0,
        omitir_alerta_fuera_horario: coincideProgramacionBase ? 1 : 0,
        permitir_cruce_horario_base: coincideProgramacionBase ? 1 : 0,
        fecha_programada: programacion.fecha,
        hora_programada: programacion.hora,
      } : null;
    }).filter(Boolean);
  };

  const agregarAlCarrito = async () => {
    if (seleccionados.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos un estudio de Rayos X para agregar al carrito.', 'info');
      return;
    }

    const sp = new URLSearchParams(location.search);
    const isEditingCotizacion = !!sp.get('cotizacion_id') && !sp.get('cobro_id');
    const detallesBase = construirDetallesSeleccionados();

    const yaExisteEnCarrito = (detalle) => {
      return Array.isArray(cart?.items) && cart.items.some((it) => (
        String(it?.serviceType || '').toLowerCase() === 'rayosx'
        && Number(it?.serviceId || 0) === Number(detalle?.servicio_id || 0)
        && Number(it?.unitPrice || 0) === Number(detalle?.precio_unitario || 0)
      ));
    };

    const detallesIniciales = detallesBase
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

    if (detallesIniciales.length === 0) {
      Swal.fire('Atención', isEditingCotizacion ? 'No hay estudios nuevos para agregar al carrito.' : 'No hay estudios válidos para agregar.', 'info');
      return;
    }

    const detalles = secuenciarDetallesPacienteSinCruce({
      detalles: detallesIniciales,
      cartItems: cart?.items,
      fallbackFecha: getLimaDate(),
      fallbackHora: getDefaultTime(),
      stepMinutes: 30,
    });

    const consultaShiftsByKey = new Map();

    const cruceEnCarrito = detectarCruceConCarrito({
      cartItems: cart?.items,
      nuevosDetalles: detalles,
    });
    if (cruceEnCarrito) {
      const { nuevo } = cruceEnCarrito;
      await Swal.fire(
        "Cruce en carrito",
        `Ya existe un servicio en el carrito para el mismo médico y horario (${nuevo.fecha} ${nuevo.hora}). Ajusta la hora antes de agregar.`,
        "warning"
      );
      return;
    }

    const agendaEntries = aplicarExclusionConsultaDelCarrito(buildAgendaGuardEntriesFromDetalles(detalles), cart?.items);
    const agendaCheck = await validarAgendaAntesDeCotizar({
      authFetch,
      baseUrl: BASE_URL,
      Swal,
      entries: agendaEntries,
      onApplySuggestion: (entry, nuevaHora, nuevaFecha, meta = {}) => {
        detalles.forEach((d) => {
          const medicoId = Number(d?.medico_id || 0);
          const fechaDet = String(d?.fecha_programada || "").slice(0, 10);
          const horaDet = String(d?.hora_programada || "").slice(0, 5);
          if (medicoId === Number(entry.medicoId) && fechaDet === entry.fecha && horaDet === entry.hora) {
            const horaDetOriginal = horaDet;
            if (String(nuevaFecha || "").slice(0, 10)) {
              d.fecha_programada = String(nuevaFecha || "").slice(0, 10);
            }
            if (meta?.isAdicional) {
              const nuevaHoraNormalizada = String(nuevaHora || "").slice(0, 5);
              const consultaRelacionada = Array.isArray(cart?.items)
                ? cart.items.find((it) => (
                  String(it?.serviceType || "").toLowerCase() === "consulta"
                  && Number(it?.medicoId || 0) === Number(entry.medicoId)
                  && String(it?.fechaProgramada || "").slice(0, 10) === entry.fecha
                  && String(it?.horaProgramada || "").slice(0, 5) === horaDetOriginal
                ))
                : null;
              if (consultaRelacionada?.key) {
                consultaShiftsByKey.set(String(consultaRelacionada.key), {
                  fecha: String(nuevaFecha || "").slice(0, 10) || entry.fecha,
                  hora: nuevaHoraNormalizada,
                });
              }
              d.hora_programada = nuevaHoraNormalizada;
              d.adicional_autorizado = true;
              d.observacion_programacion = "Adicional autorizado por recepción";
              if (!/adicional autorizado/i.test(String(d.descripcion || ""))) {
                d.descripcion = `${String(d.descripcion || "Rayos X").trim()} · Adicional autorizado`;
              }
            } else {
              d.hora_programada = String(nuevaHora || "").slice(0, 5);
            }
          }
        });
      },
    });
    if (!agendaCheck?.ok) {
      return;
    }

    const patientId = Number(pacienteId);
    const patientName = paciente
      ? `${paciente.nombres || paciente.nombre || ''} ${paciente.apellidos || paciente.apellido || ''}`.trim()
      : (nombrePacienteTemporal || `Paciente #${pacienteId}`);
    const nuevosItemsRayosX = detalles.map((d) => ({
      serviceType: 'rayosx',
      serviceId: Number(d.servicio_id || 0),
      description: d.descripcion || 'Rayos X',
      quantity: Number(d.cantidad || 1),
      unitPrice: Number(d.precio_unitario || 0),
      source: 'rayosx',
      medicoId: Number(d.medico_id || 0) || null,
      fechaProgramada: String(d.fecha_programada || ""),
      horaProgramada: String(d.hora_programada || ""),
      observacionProgramacion: String(d.observacion_programacion || ""),
      adicionalAutorizado: Boolean(d.adicional_autorizado),
    }));

    if (consultaShiftsByKey.size > 0 && Array.isArray(cart?.items) && cart.items.length > 0) {
      const cartActualizado = cart.items.map((it) => {
        const shift = consultaShiftsByKey.get(String(it?.key || ""));
        if (!shift) return it;
        const fechaProgramada = String(shift.fecha || it.fechaProgramada || "").slice(0, 10);
        const horaProgramada = String(shift.hora || it.horaProgramada || "").slice(0, 5);
        const descripcionConHorario = updateConsultaDescriptionSchedule(it.description, fechaProgramada, horaProgramada);
        const descripcionFinal = /adicional autorizado/i.test(String(descripcionConHorario || ""))
          ? descripcionConHorario
          : `${String(descripcionConHorario || "Consulta").trim()} · Adicional autorizado`;
        return {
          ...it,
          fechaProgramada,
          horaProgramada,
          consultaFecha: fechaProgramada,
          consultaHora: horaProgramada,
          description: descripcionFinal,
          observacionProgramacion: "Adicional autorizado por recepción",
          adicionalAutorizado: true,
        };
      });
      replaceCart({
        patientId,
        patientName,
        patientDni: String(cart?.patientDni || paciente?.dni || dniPacienteTemporal || ""),
        items: [...cartActualizado, ...nuevosItemsRayosX],
      });
    } else {
      addItems({
        patientId,
        patientName,
        items: nuevosItemsRayosX,
      });
    }

    if (!isEditingCotizacion) {
      setSeleccionados([]);
      setMensaje('');
    }
    Swal.fire('Listo', `Se agregaron ${detalles.length} estudio(s) al carrito.`, 'success');
  };

  const obtenerDetallesCotizacion = async (targetCotizacionId) => {
    const res = await authFetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(targetCotizacionId)}`, {
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

  const cotizar = ({ irACobro = false } = {}) => {
    const fingerprint = JSON.stringify({
      paciente: Number(pacienteId),
      cotizacion: new URLSearchParams(location.search).get('cotizacion_id') || '',
      seleccionados,
      cantidades,
      programacionPorEstudio,
    });
    return runGuardedSubmit(
      (clientRequestId, releaseRequestId) => ejecutarCotizacion({ irACobro, clientRequestId, releaseRequestId }),
      fingerprint
    );
  };

  const ejecutarCotizacion = async ({ irACobro = false, clientRequestId = '', releaseRequestId = () => {} } = {}) => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un estudio de Rayos X.");
      return;
    }
    // Construir detalles para cotización
    const detalles = secuenciarDetallesPacienteSinCruce({
      detalles: construirDetallesSeleccionados(),
      cartItems: cart?.items,
      fallbackFecha: getLimaDate(),
      fallbackHora: getDefaultTime(),
      stepMinutes: 30,
    });
    const agendaEntries = aplicarExclusionConsultaDelCarrito(buildAgendaGuardEntriesFromDetalles(detalles), cart?.items);
    const agendaCheck = await validarAgendaAntesDeCotizar({
      authFetch,
      baseUrl: BASE_URL,
      Swal,
      entries: agendaEntries,
      onApplySuggestion: (entry, nuevaHora, nuevaFecha, meta = {}) => {
        detalles.forEach((d) => {
          const medicoId = Number(d?.medico_id || 0);
          const fechaDet = String(d?.fecha_programada || "").slice(0, 10);
          const horaDet = String(d?.hora_programada || "").slice(0, 5);
          if (medicoId === Number(entry.medicoId) && fechaDet === entry.fecha && horaDet === entry.hora) {
            if (String(nuevaFecha || "").slice(0, 10)) {
              d.fecha_programada = String(nuevaFecha || "").slice(0, 10);
            }
            d.hora_programada = String(nuevaHora || "").slice(0, 5);
            if (meta?.isAdicional) {
              d.adicional_autorizado = true;
              d.observacion_programacion = "Adicional autorizado por recepción";
              if (!/adicional autorizado/i.test(String(d.descripcion || ""))) {
                d.descripcion = `${String(d.descripcion || "Rayos X").trim()} · Adicional autorizado`;
              }
            }
          }
        });
      },
    });
    if (!agendaCheck?.ok) {
      return;
    }

    const sp = new URLSearchParams(location.search);
    const cotizacionId = sp.get('cotizacion_id');

    const carrito = await confirmarLimpiezaCarrito({ Swal, cart, pacienteId, esEdicion: Boolean(cotizacionId) });
    if (carrito.cancelado) return;
    const limpiarCarritoAlFinal = carrito.limpiarCarrito;

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
          client_request_id: clientRequestId,
          paciente_id: Number(pacienteId),
          paciente_nombre: esCotizacionInformativa ? nombrePacienteTemporal : undefined,
          paciente_dni: esCotizacionInformativa ? dniPacienteTemporal : undefined,
          modo_cotizacion: esCotizacionInformativa ? 'informativa' : undefined,
          solo_ticket: esCotizacionInformativa ? 1 : undefined,
          total,
          detalles: detallesFinales,
          observaciones: esCotizacionInformativa
            ? 'Cotización informativa registrada desde cotizador de Rayos X'
            : 'Cotización registrada desde cotizador de Rayos X'
        };

    try {
      const { data, cancelada } = await registrarConFallbackAdenda({
        authFetch,
        baseUrl: BASE_URL,
        Swal,
        payload,
        cotizacionId,
        detallesAdenda: detallesFinales,
        totalAdenda: total,
        motivoAdenda: 'Adenda confirmada por usuario desde cotizador de Rayos X (cotización pagada)',
        clientRequestId,
      });
      if (cancelada) {
        setMensaje('Operación cancelada. No se creó ninguna adenda.');
        return;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'No se pudo registrar la cotización');
      }
      releaseRequestId();

      finalizarRegistroCotizacion({
        Swal,
        navigate,
        data,
        cotizacionId,
        pacienteId,
        irACobro,
        limpiarCarritoAlFinal,
        clearCart,
        setMensaje,
        refrescarDetalles: async (id) => setCotizacionDetallesOriginales(await obtenerDetallesCotizacion(id)),
      });
    } catch (error) {
      Swal.fire('Error', error?.message || 'No se pudo registrar la cotización', 'error');
    }
  };

  const mostrarPanelDerecho = seleccionados.length > 0;
  const volverButton = (() => {
    const sp = new URLSearchParams(location.search);
    const cobroId = sp.get('cobro_id');
    const cotizacionId = sp.get('cotizacion_id');
    const isEditing = Boolean(cobroId || cotizacionId);
    if (!isEditing) {
      return (
        <button
          onClick={() => navigate('/seleccionar-servicio', {
            state: Number(pacienteId || 0) <= 0
              ? {
                  pacienteId: 0,
                  pacienteTemporal: { nombre: 'Particular', apellido: '', dni: '' },
                }
              : { pacienteId },
          })}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          ← Volver
        </button>
      );
    }
    if (cotizacionId && !cobroId) {
      return (
        <button
          onClick={() => navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${Number(cotizacionId)}&modo=editar&back_to=/cotizaciones`, {
            state: { pacienteId: Number(pacienteId), cotizacionId: Number(cotizacionId), backTo: '/cotizaciones', modo: 'editar' },
          })}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          ← Volver a Servicios
        </button>
      );
    }
    return (
      <button
        onClick={() => navigate(pacienteId ? `/consumo-paciente/${pacienteId}${cobroId ? `?cobro_id=${cobroId}` : ''}` : '/pacientes')}
        className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
      >
        ← Volver a Consumo del Paciente
      </button>
    );
  })();

  return (
    <div className={`max-w-7xl mx-auto p-10 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100 transition-all ${cartCount > 0 ? 'xl:mr-[22rem]' : ''}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
          <span role="img" aria-label="rayosx">🩻</span> Cotizador de Rayos X
        </h2>
        <div className="shrink-0">{volverButton}</div>
      </div>
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
        <div className="mb-4 max-h-[68vh] overflow-y-auto">
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
                const medicoColor = getMedicoAccentColor(medicoNombre);
                const precioMostrar = Number(tarifa.precio_particular || 0).toFixed(2);
                return (
                  <li key={tarifa.id} className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{tarifa.descripcion || tarifa.nombre}</div>
                      <div className="text-xs mt-1" style={{ color: medicoColor }}>Doctor: {medicoNombre || "Sin doctor"}</div>
                    </div>
                    <div className="min-w-[110px] text-right">
                      <div className="font-bold text-green-700 text-lg leading-none">S/ {precioMostrar}</div>
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
              <ul className="divide-y divide-gray-100 mb-2 bg-gray-50 rounded-lg shadow p-4 max-h-[68vh] overflow-y-auto">
                {seleccionados.map(tid => {
                  const tarifa = tarifas.find(t => Number(t.id) === Number(tid));
                  const cantidad = cantidades[tid] || 1;
                  const subtotal = Number(tarifa?.precio_particular || 0) * cantidad;
                  const programacion = programacionPorEstudio[Number(tid)] || getProgramacionSugeridaEstudio(Number(tid));
                  const medicoId = Number(tarifa?.medico_id || 0);
                  const availability = availabilityByPair[`${medicoId}|${String(programacion.fecha || "").slice(0, 10)}`] || null;
                  const modo = normalizeAgendaProgramacionModo(agendaProgramacionModo);
                  const isModeFree = modo === "free";
                  const isModeMixed = modo === "mixed";
                  const isModeStrict = modo === "strict";
                  const manualEnabled = Boolean(manualProgramacionByEstudio[Number(tid)]) && isModeMixed;
                  const horasLibres = Array.isArray(availability?.horasLibres) ? availability.horasLibres : [];
                  const horasOcupadas = Array.isArray(availability?.horasOcupadas) ? availability.horasOcupadas : [];
                  const horaBaseEdicion = cotizacionIdEdicion > 0
                    ? String(programacionBaseEdicion?.hora || "").slice(0, 5)
                    : "";
                  const iniciosValidos = (!horaBaseEdicion || horasLibres.includes(horaBaseEdicion))
                    ? horasLibres
                    : [horaBaseEdicion, ...horasLibres];
                  return tarifa ? (
                    <li key={tid} className="py-2 flex flex-col gap-2">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <span className="w-full md:w-1/2">{tarifa.descripcion || tarifa.nombre}</span>
                        <span className="w-full md:w-1/4">{cantidad} estudio(s)</span>
                        <span className="w-full md:w-1/4 text-right font-bold text-green-700">S/ {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="text-xs text-slate-700 flex flex-col gap-1">
                          Fecha programada
                          <input
                            type="date"
                            value={programacion.fecha || ''}
                            min={getLimaDate()}
                            onChange={(e) => actualizarProgramacion(tid, 'fecha', e.target.value)}
                            className="border rounded-lg px-2 py-1 bg-white"
                          />
                        </label>
                        <label className="text-xs text-slate-700 flex flex-col gap-1">
                          Hora programada
                          {isModeFree ? (
                            <input
                              type="time"
                              value={programacion.hora || ''}
                              onChange={(e) => actualizarHoraProgramadaEstudio(tid, e.target.value, { skipOccupiedCheck: true })}
                              className="border rounded-lg px-2 py-1 bg-white"
                            />
                          ) : (iniciosValidos.length > 0 && !manualEnabled) ? (
                            <select
                              value={iniciosValidos.includes(programacion.hora) ? programacion.hora : iniciosValidos[0]}
                              onChange={(e) => actualizarProgramacion(tid, 'hora', String(e.target.value || "").slice(0, 5))}
                              className="border rounded-lg px-2 py-1 bg-white"
                            >
                              {iniciosValidos.map((hora) => (
                                <option key={`${tid}-${hora}`} value={hora}>
                                  {hora}
                                  {horaBaseEdicion && hora === horaBaseEdicion ? " (hora base)" : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="time"
                              value={programacion.hora || ''}
                              onChange={(e) => actualizarHoraProgramadaEstudio(tid, e.target.value)}
                              className="border rounded-lg px-2 py-1 bg-white"
                              disabled={isModeStrict && iniciosValidos.length === 0}
                            />
                          )}
                        </label>
                      </div>
                      {isModeMixed && medicoId > 0 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setManualProgramacionByEstudio((prev) => ({
                              ...prev,
                              [Number(tid)]: !prev[Number(tid)],
                            }))}
                            className={`text-xs px-3 py-1.5 rounded border ${manualEnabled ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                          >
                            {manualEnabled ? "Usando hora manual/fuera de horario" : "Permitir hora manual/fuera de horario"}
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-600 space-y-1">
                        <div>
                          <span className="font-semibold">Modo agenda:</span>{" "}
                          {isModeStrict ? "Estricto" : isModeFree ? "Libre" : "Mixto"}
                        </div>
                        {medicoId <= 0 ? (
                          <div className="text-amber-700">Este estudio no tiene médico asignado; no se puede mostrar disponibilidad.</div>
                        ) : isModeFree ? (
                          <div className="text-slate-500">Modo libre activo: se permite seleccionar hora manual sin depender del horario regular del médico.</div>
                        ) : availability?.loading ? (
                          <div className="text-slate-500">Consultando horas libres del médico...</div>
                        ) : availability?.error ? (
                          <div className="text-rose-700">No se pudo cargar disponibilidad: {availability.error}</div>
                        ) : (
                          <>
                            <div>
                              <span className="font-semibold">Horas libres del médico:</span>{" "}
                              {horasLibres.length > 0 ? horasLibres.join(", ") : "sin horas libres"}
                            </div>
                            <div>
                              <span className="font-semibold">Horas ocupadas del médico:</span>{" "}
                              {horasOcupadas.length > 0 ? horasOcupadas.join(", ") : "sin horas ocupadas"}
                            </div>
                            {isModeStrict && iniciosValidos.length === 0 && (
                              <div className="text-amber-700">Modo estricto: cambia fecha para encontrar horario regular disponible.</div>
                            )}
                            {isModeMixed && manualEnabled && (
                              <div className="text-amber-700">Hora manual habilitada: si queda fuera de horario regular se marcará como adicional autorizado en la validación.</div>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right text-blue-800">
                Total de estudios: {seleccionados.length}
              </div>
              <div className="mt-1 text-lg font-bold text-right text-green-700">
                Total: S/ {calcularTotal().toFixed(2)}
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={() => { setSeleccionados([]); setMensaje(""); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                <button onClick={agregarAlCarrito} className="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700">Agregar al carrito</button>
                {new URLSearchParams(location.search).get('cobro_id') ? (
                  <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                ) : (
                  <>
                    <button onClick={() => cotizar()} disabled={cajaEstado === 'cerrada' || saving} className={`px-6 py-2 rounded font-bold ${(cajaEstado === 'cerrada' || saving) ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{saving ? 'Registrando...' : (new URLSearchParams(location.search).get('cotizacion_id') ? 'Actualizar cotización' : 'Registrar cotización')}</button>
                    {!new URLSearchParams(location.search).get('cotizacion_id') && (
                      <button onClick={() => cotizar({ irACobro: true })} disabled={cajaEstado === 'cerrada' || saving} className={`px-6 py-2 rounded font-bold ${(cajaEstado === 'cerrada' || saving) ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>Registrar y cobrar</button>
                    )}
                  </>
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
