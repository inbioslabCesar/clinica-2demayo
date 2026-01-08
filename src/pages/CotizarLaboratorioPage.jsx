import { useState, useEffect } from "react";
import CobroModuloFinal from "../components/cobro/CobroModuloFinal";
import { useNavigate, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
// import Swal from "sweetalert2";
// import withReactContent from "sweetalert2-react-content";
import { useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function CotizarLaboratorioPage() {
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  // Estado para configuración de derivación por examen
  const [derivaciones, setDerivaciones] = useState({}); // { [examenId]: { derivado: bool, tipo: 'monto'|'porcentaje', valor: number, laboratorio: string } }
  const [totalCotizacion, setTotalCotizacion] = useState(0);
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
  const [cajaEstado, setCajaEstado] = useState(null);

  useEffect(() => {
    // Cargar exámenes, tarifas, ranking y paciente
    Promise.all([
      fetch(`${BASE_URL}api_examenes_laboratorio.php`, { credentials: "include" }).then(res => res.json()),
      fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" }).then(res => res.json()),
      fetch(`${BASE_URL}api_examenes_laboratorio_ranking.php`, { credentials: "include" }).then(res => res.json()),
      pacienteId ? fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`, { credentials: "include" }).then(res => res.json()) : Promise.resolve({ success: false })
    ]).then(([examenesData, tarifasData, rankingData, pacienteData]) => {
      setExamenes(examenesData.examenes || []);
      setTarifas(tarifasData.tarifas || []);
      setRanking(rankingData.ranking || []);
      if (pacienteData && pacienteData.success && pacienteData.paciente) {
        setPaciente(pacienteData.paciente);
      }
      setLoading(false);
      // Eliminado log de depuración de tarifas y examenes
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
    if (cobroId || cotizacionId) setPreloadedItems([]);
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
      const itemsLab = detalles.filter(d => (d.servicio_tipo || '').toLowerCase() === 'laboratorio').map(d => ({
        servicio_id: d.servicio_id,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        subtotal: d.subtotal
      }));
      if (itemsLab.length) setPendingLabItems(prev => [...prev, ...itemsLab]);
      if (itemsLab.length) setPreloadedItems(prev => [...prev, ...itemsLab]);
    }));
    if (!loaders.length) return;
    Promise.all(loaders).catch(() => {});
  }, [location.search]);

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
        derivMap[exId] = {
          derivado: !!it.derivado,
          tipo: it.tipo_derivacion || "",
          valor: it.valor_derivacion ?? "",
          laboratorio: it.laboratorio_referencia || ""
        };
        if (!countsMap[exId]) countsMap[exId] = { cantidad: 0, ...derivMap[exId] };
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
          derivado: !!deriv.derivado,
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
          body: JSON.stringify({ cobro_id: Number(cobroId), servicio_tipo: 'laboratorio', items: additionsAfterReductions })
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
            derivado: !!line?.derivado,
            tipo: line?.tipo_derivacion || "",
            valor: line?.valor_derivacion ?? "",
            laboratorio: line?.laboratorio_referencia || ""
          };
        }
        nextLab[exId].cantidad += qty;
        // Mantener true si alguna línea tiene derivación
        nextLab[exId].derivado = nextLab[exId].derivado || !!line?.derivado;
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
  const categorias = Array.from(new Set(examenes.map(ex => ex.categoria).filter(Boolean)));
  // Filtrar exámenes por búsqueda y categoría
  // Ordenar por ranking (más solicitados primero)
  const rankingIds = ranking.map(r => parseInt(r.id));
  const examenesOrdenados = [...examenes].sort((a, b) => {
    const idxA = rankingIds.indexOf(a.id);
    const idxB = rankingIds.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return a.nombre.localeCompare(b.nombre);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const examenesFiltrados = examenesOrdenados.filter(ex => {
    const matchBusqueda = busqueda.trim().length === 0 || ex.nombre.toLowerCase().includes(busqueda.toLowerCase());
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

  const generarCotizacion = () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un examen para cobrar.");
      return;
    }
    // Construir detalles para el Módulo de Cobros, incluyendo derivación
    const detalles = seleccionados.map(exId => {
      const exIdNum = Number(exId);
      const ex = examenes.find(e => Number(e.id) === exIdNum);
      const tarifa = tarifas.find(t => t.servicio_tipo === "laboratorio" && Number(t.examen_id) === exIdNum && t.activo === 1);
      let descripcion = (ex && typeof ex.nombre === 'string' && ex.nombre.trim() !== "" && ex.nombre !== "0") ? ex.nombre : "Examen sin nombre";
      const derivacion = derivaciones[exId] || { derivado: false };
      // Usar precio_publico si no hay tarifa
      let precio = tarifa ? parseFloat(tarifa.precio_particular) : (ex && ex.precio_publico ? parseFloat(ex.precio_publico) : 0);
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
    setDetallesCotizacion(detalles);
    setTotalCotizacion(detalles.reduce((total, d) => total + d.subtotal, 0));
    setMostrarCobro(true);
  };

  return (
  <div className="max-w-full mx-auto p-4 md:p-16 bg-white rounded-xl shadow-lg mt-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-2">
        <div className="flex items-center gap-3 mb-2 md:mb-0">
          <span className="text-3xl">🔬</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotización de Laboratorio</h2>
          {(new URLSearchParams(location.search).get('cobro_id') || new URLSearchParams(location.search).get('cotizacion_id')) && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              {new URLSearchParams(location.search).get('cobro_id')
                ? `Editando cobro #${new URLSearchParams(location.search).get('cobro_id')}`
                : `Editando cotización #${new URLSearchParams(location.search).get('cotizacion_id')}`}
            </span>
          )}
        </div>
        <div className="flex w-full md:w-auto justify-end items-end">
          {(() => {
            const sp = new URLSearchParams(location.search);
            const cobroId = sp.get('cobro_id');
            const cotizacionId = sp.get('cotizacion_id');
            const isEditing = Boolean(cobroId || cotizacionId);
            if (!isEditing) {
              return (
                <button onClick={() => navigate('/seleccionar-servicio', { state: { pacienteId } })} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver</button>
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
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 md:max-w-2xl mx-auto">
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Selecciona los exámenes:</h4>
            <div className="mb-2">
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar examen..."
                className="border px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-80"
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
        <div className="w-full md:max-w-xl md:sticky md:top-8 h-fit flex flex-col items-center">
          {seleccionados.length > 0 && !mostrarCobro && (
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
                {new URLSearchParams(location.search).get('cobro_id') ? (
                  <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                ) : (
                  <button onClick={generarCotizacion} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>Cobrar</button>
                )}
              </div>
              {(new URLSearchParams(location.search).get('cobro_id') || !new URLSearchParams(location.search).get('cobro_id')) && cajaEstado === 'cerrada' && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="text-sm text-red-600">Caja cerrada: abre una caja para poder {new URLSearchParams(location.search).get('cobro_id') ? 'actualizar' : 'cobrar'}.</span>
                  <button onClick={() => navigate('/contabilidad')} className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded border border-yellow-300 hover:bg-yellow-200">Ir a Contabilidad</button>
                </div>
              )}
            </div>
          )}

          {mostrarCobro && paciente && (
            <div className="w-full max-w-xl mx-auto">
              <CobroModuloFinal
                paciente={paciente}
                servicio={{ key: "laboratorio", label: "Laboratorio" }}
                detalles={detallesCotizacion}
                total={totalCotizacion}
                onCobroCompleto={() => {
                  setMostrarCobro(false);
                  setMensaje("Cotización procesada correctamente.");
                }}
                onCancelar={() => setMostrarCobro(false)}
              />
            </div>
          )}
        </div>
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
