import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
// import Swal from "sweetalert2";
// import withReactContent from "sweetalert2-react-content";
import { useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { useQuoteCart } from "../context/QuoteCartContext";

export default function CotizarLaboratorioPage() {
  const safeText = (value) => String(value || "");
  const safeLower = (value) => safeText(value).toLowerCase();
  const asBool = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "si" || normalized === "sí" || normalized === "yes";
  };

  // Estado para configuración de derivación por examen
  const [derivaciones, setDerivaciones] = useState({}); // { [examenId]: { derivado: bool, tipo: 'monto'|'porcentaje', valor: number, laboratorio: string } }
  // const [cotizacionReady, setCotizacionReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { pacienteId } = useParams();
  const [examenes, setExamenes] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [comprobante, setComprobante] = useState(null);
  const [paciente, setPaciente] = useState(null);
  const [preloadedLab, setPreloadedLab] = useState({}); // {exId: {cantidad, derivado, tipo, valor, laboratorio}}
  const [pendingLabItems, setPendingLabItems] = useState([]); // items desde cobro para mapear contra examenes
  const [preloadedItems, setPreloadedItems] = useState([]); // líneas exactas precargadas para eliminar exacto
  const [cotizacionDetallesOriginales, setCotizacionDetallesOriginales] = useState([]);
  const [cajaEstado, setCajaEstado] = useState(null);
  const { cart, addItems, clearCart, count: cartCount } = useQuoteCart();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const cotizacionId = searchParams.get('cotizacion_id');
  const cobroId = searchParams.get('cobro_id');
  const isEditingCotizacion = Boolean(cotizacionId) && !cobroId;

  useEffect(() => {
    // Cargar exámenes, tarifas, ranking y paciente
    Promise.all([
      fetch(`${BASE_URL}api_examenes_laboratorio.php`, { credentials: "include" }).then(res => res.json()),
      fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" }).then(res => res.json()),
      fetch(`${BASE_URL}api_examenes_laboratorio_ranking.php`, { credentials: "include" }).then(res => res.json()),
      pacienteId ? fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`, { credentials: "include" }).then(res => res.json()) : Promise.resolve({ success: false })
    ]).then(([examenesData, tarifasData, rankingData, pacienteData]) => {
      setExamenes(Array.isArray(examenesData?.examenes) ? examenesData.examenes : []);
      setTarifas(Array.isArray(tarifasData?.tarifas) ? tarifasData.tarifas : []);
      setRanking(Array.isArray(rankingData?.ranking) ? rankingData.ranking : []);
      if (pacienteData && pacienteData.success && pacienteData.paciente) {
        setPaciente(pacienteData.paciente);
      }
      setLoading(false);
      // Eliminado log de depuración de tarifas y examenes
    }).catch(() => {
      setExamenes([]);
      setTarifas([]);
      setRanking([]);
      setLoading(false);
      setMensaje("No se pudo cargar información del cotizador. Intenta nuevamente.");
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
    const loaders = [];
    if (cobroId || cotizacionId) {
      setPreloadedItems([]);
      setPendingLabItems([]);
      setPreloadedLab({});
      setDerivaciones({});
      setSeleccionados([]);
    }
    if (!cotizacionId) setCotizacionDetallesOriginales([]);
    if (cobroId) loaders.push(fetch(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: "include" }).then(r => r.json()).then(data => {
      const cobro = data.cobro || data?.result?.cobro || null;
      if (!data.success || !cobro) return;
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsLab = [];
      detalles.forEach(cd => {
        if ((cd.servicio_tipo || "").toLowerCase() === "laboratorio") {
          try { const arr = JSON.parse(cd.descripcion); if (Array.isArray(arr)) itemsLab.push(...arr); } catch { /* ignore parse error */ }
        }
      });
      if (itemsLab.length) setPendingLabItems(prev => [...prev, ...itemsLab]);
      if (itemsLab.length) setPreloadedItems(prev => [...prev, ...itemsLab]);
    }));
    if (cotizacionId) loaders.push(fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, { credentials: "include" }).then(r => r.json()).then(data => {
      const cot = data.cotizacion || null;
      if (!data.success || !cot) return;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      setCotizacionDetallesOriginales(detalles);
      const itemsLab = detalles.filter(d => (d.servicio_tipo || '').toLowerCase() === 'laboratorio').map(d => ({
        servicio_id: d.servicio_id,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        subtotal: d.subtotal,
        derivado: d.derivado,
        tipo_derivacion: d.tipo_derivacion,
        valor_derivacion: d.valor_derivacion,
        laboratorio_referencia: d.laboratorio_referencia
      }));

      const faltanCamposDerivacion = itemsLab.some((it) => {
        const hasDerivado = it.derivado !== undefined && it.derivado !== null && String(it.derivado).trim() !== "";
        const hasTipo = String(it.tipo_derivacion || "").trim() !== "";
        const hasLab = String(it.laboratorio_referencia || "").trim() !== "";
        const hasValor = !(it.valor_derivacion === undefined || it.valor_derivacion === null || String(it.valor_derivacion).trim() === "");
        return !hasDerivado && !hasTipo && !hasLab && !hasValor;
      });

      if (faltanCamposDerivacion && Number(cot.paciente_id || 0) > 0 && itemsLab.length > 0) {
        loaders.push(
          fetch(`${BASE_URL}api_laboratorio_referencia_movimientos.php?paciente_id=${Number(cot.paciente_id)}&cotizacion_id=${Number(cotizacionId)}`, { credentials: "include" })
            .then((r) => r.json())
            .then((movData) => {
              const movimientosIniciales = Array.isArray(movData?.movimientos) ? movData.movimientos : [];
              if (movimientosIniciales.length > 0) {
                return movimientosIniciales;
              }
              // Si el backend soporta cotizacion_id y no devolvio movimientos para esta cotizacion,
              // no debemos caer al fallback por paciente porque mezclaria datos de otras cotizaciones.
              if (movData?.supports_cotizacion_id) {
                return [];
              }
              return fetch(`${BASE_URL}api_laboratorio_referencia_movimientos.php?paciente_id=${Number(cot.paciente_id)}`, { credentials: "include" })
                .then((rr) => rr.json())
                .then((legacyData) => (Array.isArray(legacyData?.movimientos) ? legacyData.movimientos : []));
            })
            .then((movimientos) => {
              const fallbackMap = {};

              for (const mov of movimientos) {
                const exId = Number(mov?.examen_id || 0);
                if (!exId) continue;
                const keyExamen = `id:${exId}`;
                if (!fallbackMap[keyExamen]) {
                  fallbackMap[keyExamen] = mov;
                }

                const obsNorm = String(mov?.observaciones || "").toLowerCase().trim();
                if (obsNorm) {
                  const keyObs = `obs:${obsNorm}`;
                  if (!fallbackMap[keyObs]) fallbackMap[keyObs] = mov;
                }
              }

              const mergedItems = itemsLab.map((it) => {
                const currentHasLab = String(it.laboratorio_referencia || "").trim() !== "";
                const currentHasTipo = String(it.tipo_derivacion || "").trim() !== "";
                const currentHasValor = !(it.valor_derivacion === undefined || it.valor_derivacion === null || String(it.valor_derivacion).trim() === "");
                const currentHasDerivado = it.derivado !== undefined && it.derivado !== null && String(it.derivado).trim() !== "";
                if (currentHasLab || currentHasTipo || currentHasValor || currentHasDerivado) return it;

                const byId = fallbackMap[`id:${Number(it.servicio_id || 0)}`];
                const byObs = fallbackMap[`obs:${String(it.descripcion || "").toLowerCase().trim()}`];
                const src = byId || byObs;
                if (!src) return it;

                return {
                  ...it,
                  derivado: 1,
                  tipo_derivacion: src.tipo || it.tipo_derivacion || "",
                  valor_derivacion: src.monto ?? it.valor_derivacion ?? "",
                  laboratorio_referencia: src.laboratorio || it.laboratorio_referencia || "",
                };
              });

              setPendingLabItems((prev) => [...prev, ...mergedItems]);
              setPreloadedItems((prev) => [...prev, ...mergedItems]);
            })
            .catch(() => {
              // Si falla el fallback, mantenemos el flujo con los datos disponibles.
              setPendingLabItems(prev => [...prev, ...itemsLab]);
              setPreloadedItems(prev => [...prev, ...itemsLab]);
            })
        );
      } else if (itemsLab.length) {
        setPendingLabItems(prev => [...prev, ...itemsLab]);
        setPreloadedItems(prev => [...prev, ...itemsLab]);
      }
    }));
    if (!loaders.length) return;
    Promise.all(loaders).catch(() => {});
  }, [cobroId, cotizacionId]);

  // Cuando tengamos examenes y items pendientes, mapear por id o por nombre
  useEffect(() => {
    if (!pendingLabItems.length || !examenes.length) return;
    const toSelect = [];
    const derivMap = {};
    const countsMap = {};
    pendingLabItems.forEach(it => {
      const idNum = Number(it.servicio_id);
      let ex = examenes.find(e => Number(e.id) === idNum);
      if (!ex) {
        const nombreItem = (it.descripcion || '').toString().trim().toLowerCase();
        ex = examenes.find(e => (e.nombre || '').toString().trim().toLowerCase() === nombreItem);
      }
      if (ex) {
        const exId = Number(ex.id);
        toSelect.push(exId);
        const nextDerivado = asBool(it.derivado);
        const nextTipo = it.tipo_derivacion || "";
        const nextValor = it.valor_derivacion ?? "";
        const nextLaboratorio = it.laboratorio_referencia || "";

        if (!countsMap[exId]) {
          countsMap[exId] = {
            cantidad: 0,
            derivado: nextDerivado,
            tipo: nextTipo,
            valor: nextValor,
            laboratorio: nextLaboratorio,
          };
        } else {
          // Si existe más de una línea para el mismo examen, conservar la configuración derivada más completa.
          countsMap[exId].derivado = countsMap[exId].derivado || nextDerivado;
          if (!countsMap[exId].tipo && nextTipo) countsMap[exId].tipo = nextTipo;
          if ((countsMap[exId].valor === "" || countsMap[exId].valor === null || countsMap[exId].valor === undefined) && (nextValor !== "" && nextValor !== null && nextValor !== undefined)) {
            countsMap[exId].valor = nextValor;
          }
          if (!countsMap[exId].laboratorio && nextLaboratorio) countsMap[exId].laboratorio = nextLaboratorio;
        }

        derivMap[exId] = {
          derivado: countsMap[exId].derivado,
          tipo: countsMap[exId].tipo,
          valor: countsMap[exId].valor,
          laboratorio: countsMap[exId].laboratorio,
        };
        countsMap[exId].cantidad += Number(it.cantidad || 1);
      }
    });
    // Unicos
    const unique = Array.from(new Set(toSelect));
    setSeleccionados(unique);
    setDerivaciones(prev => ({ ...prev, ...derivMap }));
    setPreloadedLab(countsMap);
  }, [pendingLabItems, examenes]);

  // Actualizar cobro: aplicar diffs (agregar y reducir/eliminar)
  const actualizarCobro = async () => {
    const params = new URLSearchParams(location.search);
    const cobroId = params.get("cobro_id");
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
      ...Object.keys(preloadedLab || {}).map(Number)
    ]);

    const itemsToAdd = [];
    const reductions = [];

    allIds.forEach(exIdNum => {
      const exId = Number(exIdNum);
      const isSelected = seleccionados.includes(exId);
      const preQty = Number(preloadedLab[exId]?.cantidad || 0);
      // Laboratorio usa checkbox (no hay control de cantidad).
      // Si el examen ya existía en el cobro y sigue seleccionado, NO debemos reducir su cantidad
      // (p.ej. si estaba duplicado en BD con cantidad>1). Solo reducimos cuando el usuario desmarca.
      const desiredQty = isSelected ? Math.max(preQty, 1) : 0;
      const diff = desiredQty - preQty;
      if (diff > 0) {
        const deriv = derivaciones[exId] || {};
        const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && Number(t.examen_id) === exId && t.activo === 1);
        const ex = examenes.find(e => Number(e.id) === exId);
        const precio = tarifa ? parseFloat(tarifa.precio_particular) : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : 0);
        itemsToAdd.push({
          servicio_id: exId,
          descripcion: ex?.nombre || "Examen",
          cantidad: diff,
          precio_unitario: precio,
          subtotal: precio * diff,
          derivado: asBool(deriv.derivado),
          tipo_derivacion: deriv.tipo || "",
          valor_derivacion: deriv.valor || 0,
          laboratorio_referencia: deriv.laboratorio || ""
        });
      } else if (diff < 0) {
        reductions.push({ servicio_id: exId, cantidad_eliminar: Math.abs(diff) });
      }
    });

    if (itemsToAdd.length === 0 && reductions.length === 0) {
      Swal.fire('Sin cambios', 'No hay cambios para aplicar.', 'info');
      return;
    }

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

    let baselineItems = Array.isArray(preloadedItems) ? [...preloadedItems] : [];
    const additionsAfterReductions = [...itemsToAdd];

    const refetchBaselineFromServer = async () => {
      const resp = await fetch(`${BASE_URL}api_cobros.php?cobro_id=${Number(cobroId)}`, { credentials: 'include' });
      const data = await resp.json();
      const cobro = data.cobro || data?.result?.cobro || null;
      if (!data?.success || !cobro) return [];
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsLab = [];
      for (const cd of detalles) {
        if ((cd?.servicio_tipo || '').toString().toLowerCase() !== 'laboratorio') continue;
        try {
          const arr = JSON.parse(cd.descripcion);
          if (Array.isArray(arr)) itemsLab.push(...arr);
        } catch {
          // ignore
        }
      }
      return itemsLab;
    };

    const isNotFoundDeleteError = (msg) => {
      const m = (msg || '').toString().toLowerCase();
      return m.includes('no se encontró el ítem a eliminar') || m.includes('detalle del cobro no encontrado');
    };

    const findLineIndex = (lines, servicioId, remaining) => {
      let exactIdx = -1;
      let smallestBiggerIdx = -1;
      let biggestIdx = -1;
      let biggestQty = -1;
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        if (Number(ln?.servicio_id) !== Number(servicioId)) continue;
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
          let idx = findLineIndex(baselineItems, red.servicio_id, remaining);
          if (idx === -1) {
            // Puede haber quedado desfasado (otra eliminación ya removió esa línea).
            baselineItems = await refetchBaselineFromServer();
            idx = findLineIndex(baselineItems, red.servicio_id, remaining);
            if (idx === -1) {
              // Si ya no existe en servidor, considerar eliminado.
              const existsOnServer = baselineItems.some(l => Number(l?.servicio_id) === Number(red.servicio_id));
              if (!existsOnServer) { remaining = 0; break; }
              throw new Error('No se encontró el ítem a reducir en el cobro.');
            }
          }
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
              servicio_tipo: 'laboratorio',
              item: line,
              motivo: motivoReduccion
            })
          });
          const delData = await delResp.json();
          if (!delData?.success) {
            const errMsg = delData?.error || 'No se pudo eliminar el ítem del cobro.';
            if (isNotFoundDeleteError(errMsg)) {
              // Refrescar y continuar: en la práctica suele significar que la línea ya no existe.
              baselineItems = await refetchBaselineFromServer();
              const existsOnServer = baselineItems.some(l => Number(l?.servicio_id) === Number(red.servicio_id));
              if (!existsOnServer) { remaining = 0; break; }
              // Si aún existe, reintentar en la siguiente iteración.
              continue;
            }
            throw new Error(errMsg);
          }

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
            servicio_tipo: 'laboratorio',
            items: additionsAfterReductions
          })
        });
        const data = await resp.json();
        if (!data?.success) throw new Error(data?.error || 'No se pudo actualizar el cobro');
        baselineItems = [...baselineItems, ...additionsAfterReductions];
      }

      // Recalcular baseline lab (cantidad) desde lo que quedó realmente en el cobro
      const nextLab = {};
      for (const line of baselineItems) {
        const exId = Number(line?.servicio_id);
        if (!Number.isFinite(exId) || exId <= 0) continue;
        const qty = Number(line?.cantidad || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        if (!nextLab[exId]) {
          nextLab[exId] = {
            cantidad: 0,
            derivado: asBool(line?.derivado),
            tipo: line?.tipo_derivacion || "",
            valor: line?.valor_derivacion ?? "",
            laboratorio: line?.laboratorio_referencia || ""
          };
        }
        nextLab[exId].cantidad += qty;
        // Mantener true si alguna línea tiene derivación
        nextLab[exId].derivado = nextLab[exId].derivado || asBool(line?.derivado);
        // Preferir valores no vacíos
        if (!nextLab[exId].tipo && line?.tipo_derivacion) nextLab[exId].tipo = line.tipo_derivacion;
        if ((nextLab[exId].valor === "" || nextLab[exId].valor === null || nextLab[exId].valor === undefined) && (line?.valor_derivacion ?? "") !== "") {
          nextLab[exId].valor = line.valor_derivacion;
        }
        if (!nextLab[exId].laboratorio && line?.laboratorio_referencia) nextLab[exId].laboratorio = line.laboratorio_referencia;
      }

      setPreloadedLab(nextLab);
      setPreloadedItems(baselineItems);

      Swal.fire('Actualizado', 'Se aplicaron los cambios en el cobro.', 'success');
    } catch (e) {
      Swal.fire('Error', e?.message || 'Fallo de conexión con el servidor', 'error');
    }
  };

  const toggleSeleccion = (id) => {
    const idNum = Number(id);
    setSeleccionados(sel =>
      sel.includes(idNum) ? sel.filter(eid => eid !== idNum) : [...sel, idNum]
    );
    setMensaje("");
  };

  const calcularTotal = () => {
    return seleccionados.reduce((total, exId) => {
      const exIdNum = Number(exId);
      const ex = examenes.find(e => Number(e.id) === exIdNum);
      const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && Number(t.examen_id) === exIdNum && t.activo === 1);
      const precio = tarifa ? parseFloat(tarifa.precio_particular) : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : 0);
      return total + precio;
    }, 0);
  };

  if (loading) return <div>Cargando exámenes y tarifas...</div>;
  // Obtener categorías únicas
  const categorias = Array.from(new Set(examenes.map(ex => ex?.categoria).filter(Boolean)));
  // Filtrar exámenes por búsqueda y categoría
  // Ordenar por ranking (más solicitados primero)
  const rankingIds = ranking.map(r => Number(r?.id)).filter(Number.isFinite);
  const examenesOrdenados = [...examenes].sort((a, b) => {
    const idA = Number(a?.id);
    const idB = Number(b?.id);
    const idxA = rankingIds.indexOf(idA);
    const idxB = rankingIds.indexOf(idB);
    if (idxA === -1 && idxB === -1) return safeText(a?.nombre).localeCompare(safeText(b?.nombre));
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const examenesFiltrados = examenesOrdenados.filter(ex => {
    const matchBusqueda = busqueda.trim().length === 0 || safeLower(ex?.nombre).includes(safeLower(busqueda));
    const matchCategoria = categoriaFilter === "" || ex.categoria === categoriaFilter;
    return matchBusqueda && matchCategoria;
  });

  // Paginación
  const totalPages = Math.max(1, Math.ceil(examenesFiltrados.length / rowsPerPage));
  const paginated = examenesFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const limpiarSeleccion = () => {
    setSeleccionados([]);
    setMensaje("");
  };

  const construirDetallesSeleccionados = () => {
    return seleccionados.map(exId => {
      const exIdNum = Number(exId);
      const ex = examenes.find(e => Number(e.id) === exIdNum);
      const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && Number(t.examen_id) === exIdNum && t.activo === 1);
      const descripcion = (ex && typeof ex.nombre === 'string' && ex.nombre.trim() !== "" && ex.nombre !== "0") ? ex.nombre : "Examen sin nombre";
      const derivacion = derivaciones[exId] || { derivado: false };
      const precio = tarifa ? parseFloat(tarifa.precio_particular) : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : 0);
      return {
        servicio_tipo: "laboratorio",
        servicio_id: exIdNum,
        descripcion,
        cantidad: 1,
        precio_unitario: precio,
        subtotal: precio,
        derivado: derivacion.derivado || false,
        tipo_derivacion: derivacion.tipo || '',
        valor_derivacion: derivacion.valor || 0,
        laboratorio_referencia: derivacion.laboratorio || ''
      };
    });
  };

  const agregarAlCarrito = () => {
    if (seleccionados.length === 0) {
      Swal.fire('Atención', 'Selecciona al menos un examen para agregar al carrito.', 'info');
      return;
    }

    const seleccionadosParaCarrito = isEditingCotizacion
      ? seleccionados.filter((exId) => Number(preloadedLab[exId]?.cantidad || 0) <= 0)
      : seleccionados;

    if (seleccionadosParaCarrito.length === 0) {
      Swal.fire('Atención', 'No hay exámenes nuevos para agregar al carrito.', 'info');
      return;
    }

    const yaExisteEnCarrito = (detalle) => {
      const precio = Number(detalle?.precio_unitario || 0);
      const derivado = Boolean(detalle?.derivado);
      const tipo = String(detalle?.tipo_derivacion || "").toLowerCase();
      const valor = Number(detalle?.valor_derivacion || 0);
      const laboratorio = String(detalle?.laboratorio_referencia || "").trim().toLowerCase();

      return Array.isArray(cart?.items) && cart.items.some((it) => {
        if (String(it?.serviceType || "").toLowerCase() !== "laboratorio") return false;
        if (Number(it?.serviceId || 0) !== Number(detalle?.servicio_id || 0)) return false;
        if (Number(it?.unitPrice || 0) !== precio) return false;

        const itDerivado = Boolean(it?.derivado);
        const itTipo = String(it?.tipoDerivacion || "").toLowerCase();
        const itValor = Number(it?.valorDerivacion || 0);
        const itLab = String(it?.laboratorioReferencia || "").trim().toLowerCase();

        return itDerivado === derivado && itTipo === tipo && itValor === valor && itLab === laboratorio;
      });
    };

    const detalles = construirDetallesSeleccionados().filter((d) => {
      if (!seleccionadosParaCarrito.includes(Number(d.servicio_id))) return false;
      if (isEditingCotizacion && yaExisteEnCarrito(d)) return false;
      return true;
    });

    const cantidadAgregada = detalles.length;
    if (cantidadAgregada === 0) {
      Swal.fire('Atención', 'Los exámenes seleccionados ya están en el carrito.', 'info');
      return;
    }

    addItems({
      patientId: Number(pacienteId),
      patientName: paciente ? `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim() : `Paciente #${pacienteId}`,
      items: detalles.map((d) => ({
        serviceType: 'laboratorio',
        serviceId: d.servicio_id,
        description: d.descripcion,
        quantity: Number(d.cantidad || 1),
        unitPrice: Number(d.precio_unitario || 0),
        source: 'laboratorio',
        derivado: Boolean(d.derivado),
        tipoDerivacion: d.tipo_derivacion || '',
        valorDerivacion: Number(d.valor_derivacion || 0),
        laboratorioReferencia: d.laboratorio_referencia || '',
      })),
    });

    // En creación nueva limpiamos selección para evitar duplicados; en edición conservamos contexto actual.
    if (!isEditingCotizacion) {
      limpiarSeleccion();
    }
    Swal.fire('Listo', `Se agregaron ${cantidadAgregada} examen(es) al carrito.`, 'success');
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

  const construirDetallesEditados = async (detallesLaboratorio) => {
    if (!cotizacionId) return detallesLaboratorio;
    const base = cotizacionDetallesOriginales.length > 0
      ? cotizacionDetallesOriginales
      : await obtenerDetallesCotizacion(cotizacionId);

    const detallesNoLaboratorio = base.filter((d) => String(d?.servicio_tipo || '').toLowerCase() !== 'laboratorio');
    return [...detallesNoLaboratorio, ...detallesLaboratorio];
  };

  const generarCotizacion = async ({ irACobro = false } = {}) => {
    if (!cotizacionId && seleccionados.length === 0) {
      setMensaje("Selecciona al menos un examen para cotizar.");
      return;
    }

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

    const detallesLaboratorio = construirDetallesSeleccionados();
    const detallesFinales = cotizacionId
      ? await construirDetallesEditados(detallesLaboratorio)
      : detallesLaboratorio;

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
          motivo: 'Edición de cotización (merge seguro) desde cotizador de Laboratorio'
        }
      : {
          paciente_id: Number(pacienteId),
          total,
          detalles: detallesFinales,
          observaciones: 'Cotización registrada desde cotizador de Laboratorio'
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
        const payloadAdenda = {
          accion: 'adenda',
          cotizacion_id: Number(cotizacionId),
          detalles: detallesFinales,
          total,
          motivo: 'Adenda automática desde cotizador de Laboratorio (cotización pagada)'
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
            // Si no se puede recargar, continuamos con navegación para no bloquear el flujo.
          }
        }

        if (irACobro && cotizacionDestino > 0) {
          navigate(`/cobrar-cotizacion/${Number(cotizacionDestino)}`);
          return;
        }

        if (cotizacionDestino > 0 && cotizacionId) {
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

  const mostrarPanelDerecho = seleccionados.length > 0 || isEditingCotizacion;

  return (
  <div
    className={`max-w-full mx-auto p-4 md:p-16 bg-white rounded-xl shadow-lg mt-8 transition-all ${cartCount > 0 ? 'xl:mr-[22rem]' : ''}`}
  >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-2">
        <div className="flex items-center gap-3 mb-2 md:mb-0">
          <span className="text-3xl">🔬</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotización de Laboratorio</h2>
          {(cobroId || cotizacionId) && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              {cobroId
                ? `Editando cobro #${cobroId}`
                : `Editando cotización #${cotizacionId}`}
            </span>
          )}
        </div>
        <div className="flex w-full md:w-auto justify-end items-end xl:pr-24">
          {(() => {
            const isEditing = Boolean(cobroId || cotizacionId);
            if (!isEditing) {
              return (
                <button onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver</button>
              );
            }
            if (cotizacionId && !cobroId) {
              return (
                <button onClick={() => navigate(`/seleccionar-servicio?paciente_id=${Number(pacienteId)}&cotizacion_id=${Number(cotizacionId)}&modo=editar&back_to=/cotizaciones`, {
                  state: { pacienteId: Number(pacienteId), cotizacionId: Number(cotizacionId), backTo: '/cotizaciones', modo: 'editar' },
                })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">← Volver a Servicios</button>
              );
            }
            return (
              <button onClick={() => navigate(pacienteId ? `/consumo-paciente/${pacienteId}${cobroId ? `?cobro_id=${cobroId}` : ''}` : '/pacientes')} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">← Volver a Consumo del Paciente</button>
            );
          })()}
        </div>
      </div>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="text-gray-600">
          <b>Paciente:</b> {paciente ? (
            <>
              {(paciente.nombres || paciente.nombre || '').trim()} {(paciente.apellidos || paciente.apellido || '').trim()}
              {paciente.dni ? ` (DNI: ${paciente.dni})` : ''}
            </>
          ) : (
            <>ID {pacienteId}</>
          )}
        </div>
      </div>
  <div className="mb-4 flex flex-col sm:flex-row gap-2 items-center">
        <label className="font-semibold text-gray-700">Filtrar por categoría:</label>
        <select
          value={categoriaFilter}
          onChange={e => setCategoriaFilter(e.target.value)}
          className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
        >
          <option value="">Todas</option>
          {categorias.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>
      <div className={`flex flex-col gap-8 ${mostrarPanelDerecho ? 'md:flex-row' : ''}`}>
        <div className={`w-full ${mostrarPanelDerecho ? 'flex-1' : ''}`}>
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Selecciona los exámenes:</h4>
            <div className="mb-2">
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar examen..."
                className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>
            <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="w-full bg-white shadow-md rounded-xl border border-gray-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                <div className="text-sm text-gray-700 flex gap-4 items-center">
                  <span className="bg-gray-100 rounded px-2 py-1">Total exámenes: <b>{examenesFiltrados.length}</b></span>
                  <span className="bg-gray-100 rounded px-2 py-1">Páginas: <b>{totalPages}</b></span>
                </div>
                <div className="flex items-center gap-2 justify-center">
                  <button
                    disabled={page === 0 || totalPages === 1}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 disabled:opacity-50 hover:bg-blue-200 transition-colors shadow-sm"
                    title="Página anterior"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span className="px-3 py-1 text-sm font-medium bg-gray-50 rounded">Página {page + 1} de {totalPages || 1}</span>
                  <button
                    disabled={page >= totalPages - 1 || totalPages === 1}
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 disabled:opacity-50 hover:bg-blue-200 transition-colors shadow-sm"
                    title="Página siguiente"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  <select
                    value={rowsPerPage}
                    onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 ml-2"
                  >
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                  </select>
                </div>
              </div>
            </div>
            {examenesFiltrados.length === 0 ? (
              <div className="text-center text-gray-500">No hay exámenes para mostrar.</div>
            ) : (
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <ul className="divide-y divide-gray-100">
                  {paginated.map(ex => {
                    const exIdNum = Number(ex.id);
                    const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && Number(t.examen_id) === exIdNum && t.activo === 1);
                    const isSelected = seleccionados.includes(exIdNum);
                    const derivacion = derivaciones[exIdNum] || { derivado: false, tipo: '', valor: '', laboratorio: '' };
                    // Usar precio_publico si no hay tarifa
                    const precio = tarifa ? tarifa.precio_particular : (ex.precio_publico ? parseFloat(ex.precio_publico) : "-");
                    const precioMostrar = precio !== "-" ? Number(precio).toFixed(2) : "-";
                    return (
                      <li key={exIdNum} className="flex flex-col px-4 py-3 hover:bg-blue-50 transition-colors border-b">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSeleccion(exIdNum)}
                            className="mr-3 accent-blue-600 w-5 h-5"
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800">{ex.nombre}</div>
                            {ex.categoria && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded mt-1 inline-block">{ex.categoria}</span>
                            )}
                          </div>
                          <div className="font-bold text-green-700 text-lg">S/ {precioMostrar}</div>
                        </div>
                        {/* Configuración de derivación solo si está seleccionado */}
                        {isSelected && (
                          <div className="mt-2 bg-gray-50 p-3 rounded flex flex-col gap-2">
                            <label className="font-semibold text-sm mb-1">¿Se deriva a laboratorio externo?</label>
                            <select
                              value={derivacion.derivado ? 'si' : 'no'}
                              onChange={e => setDerivaciones(prev => ({
                                ...prev,
                                [exIdNum]: {
                                  ...prev[exIdNum],
                                  derivado: e.target.value === 'si'
                                }
                              }))}
                              className="border rounded px-2 py-1 w-32"
                            >
                              <option value="no">No</option>
                              <option value="si">Sí</option>
                            </select>
                            {derivacion.derivado && (
                              <div className="flex flex-col gap-2">
                                <label className="font-semibold text-sm">Laboratorio de referencia</label>
                                <input
                                  type="text"
                                  value={derivacion.laboratorio || ""}
                                  onChange={e => setDerivaciones(prev => ({
                                    ...prev,
                                    [exIdNum]: {
                                      ...prev[exIdNum],
                                      laboratorio: e.target.value
                                    }
                                  }))}
                                  className="border rounded px-2 py-1"
                                  placeholder="Nombre del laboratorio"
                                />
                                <label className="font-semibold text-sm">¿Monto fijo o porcentaje?</label>
                                <select
                                  value={derivacion.tipo || ""}
                                  onChange={e => setDerivaciones(prev => ({
                                    ...prev,
                                    [exIdNum]: {
                                      ...prev[exIdNum],
                                      tipo: e.target.value
                                    }
                                  }))}
                                  className="border rounded px-2 py-1 w-32"
                                >
                                  <option value="">Seleccionar</option>
                                  <option value="monto">Monto fijo</option>
                                  <option value="porcentaje">Porcentaje</option>
                                </select>
                                {derivacion.tipo === 'monto' && (
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={derivacion.valor !== undefined ? derivacion.valor : ""}
                                    onChange={e => setDerivaciones(prev => ({
                                      ...prev,
                                      [exIdNum]: {
                                        ...prev[exIdNum],
                                        valor: e.target.value
                                      }
                                    }))}
                                    className="border rounded px-2 py-1"
                                    placeholder="Monto S/"
                                  />
                                )}
                                {derivacion.tipo === 'porcentaje' && (
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={derivacion.valor !== undefined ? derivacion.valor : ""}
                                    onChange={e => setDerivaciones(prev => ({
                                      ...prev,
                                      [exIdNum]: {
                                        ...prev[exIdNum],
                                        valor: e.target.value
                                      }
                                    }))}
                                    className="border rounded px-2 py-1"
                                    placeholder="Porcentaje %"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
        {/* Cotización en tiempo real en columna derecha */}
        {mostrarPanelDerecho && (
        <div className="w-full md:sticky md:top-8 h-fit flex flex-col md:max-w-xl">
          {seleccionados.length > 0 && (
            <div className="mb-6 w-full">
              <h4 className="font-semibold text-gray-700 mb-2">Lista de Cotización</h4>
              <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                {seleccionados.map(exId => {
                  const exIdNum = Number(exId);
                  const ex = examenes.find(e => Number(e.id) === exIdNum);
                  const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && Number(t.examen_id) === exIdNum && t.activo === 1);
                  const precio = tarifa ? tarifa.precio_particular : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : "-");
                  const precioMostrar = precio !== "-" ? Number(precio).toFixed(2) : "-";
                  return (
                    <li key={exIdNum} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-gray-900">{ex?.nombre}</span>
                        {ex?.condicion_paciente && (
                          <span className="block text-xs text-gray-400 mt-1">Condición: {ex.condicion_paciente}</span>
                        )}
                        {ex?.tiempo_resultado && (
                          <span className="block text-xs text-gray-400">Tiempo: {ex.tiempo_resultado}</span>
                        )}
                      </div>
                      <div className="font-bold text-green-700 text-right">S/ {precioMostrar}</div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right">
                Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 justify-end">
                <button onClick={limpiarSeleccion} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                <button onClick={agregarAlCarrito} className="bg-violet-600 text-white px-4 py-2 rounded hover:bg-violet-700">Agregar al carrito</button>
                {cobroId ? (
                  <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                ) : isEditingCotizacion ? (
                  <>
                    <button onClick={() => generarCotizacion()} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>Actualizar cotización</button>
                    <button onClick={() => generarCotizacion({ irACobro: true })} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>Actualizar y cobrar</button>
                  </>
                ) : (
                  <button onClick={generarCotizacion} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>Registrar Cotización</button>
                )}
              </div>
              {cajaEstado === 'cerrada' && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="text-sm text-red-600">Caja cerrada: abre una caja para poder {cobroId ? 'actualizar' : 'guardar'}.</span>
                  <button onClick={() => navigate('/contabilidad')} className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded border border-yellow-300 hover:bg-yellow-200">Ir a Contabilidad</button>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>
      {/* Eliminado control de paginación duplicado */}
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${mensaje.includes('correctamente') ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
      {comprobante && (
        <div className="mt-8 mx-auto max-w-lg bg-white rounded-xl shadow-lg border border-blue-200 p-6">
          <h3 className="text-xl font-bold text-blue-700 mb-2">Comprobante de Cotización</h3>
          <div className="mb-2 text-blue-800 font-semibold">Nº comprobante: {comprobante.numero}</div>
          <div className="mb-2 text-gray-600 text-sm">Fecha: {comprobante.fecha}</div>
          <ul className="divide-y divide-gray-100 mb-4">
            {comprobante.detalles.map((det, idx) => (
              <li key={idx} className="py-2 flex justify-between items-center">
                <span className="font-medium text-gray-800">{det.descripcion}</span>
                <span className="text-green-700 font-bold">S/ {det.precio_unitario.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="text-right text-lg font-bold text-blue-700 border-t pt-2">Total: S/ {comprobante.total.toFixed(2)}</div>
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Imprimir</button>
            <button onClick={() => setComprobante(null)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
