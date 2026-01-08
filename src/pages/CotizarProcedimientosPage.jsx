import React, { useEffect, useState } from "react";
import { CobroModuloFinal } from "../components/cobro";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

export default function CotizarProcedimientosPage() {
   
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [procedimientos, setProcedimientos] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cantidades, setCantidades] = useState({});
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  const [totalCotizacion, setTotalCotizacion] = useState(0);
  const [mensaje, setMensaje] = useState("");
  const [paciente, setPaciente] = useState(null);
  const [preloadedCounts, setPreloadedCounts] = useState({}); // {procId: cantidad}
  const [preloadedItems, setPreloadedItems] = useState([]); // líneas exactas precargadas desde cobro/cotización
  const [cajaEstado, setCajaEstado] = useState(null);

   const [busqueda, setBusqueda] = useState("");
    // Filtrar procedimientos por búsqueda
    const procedimientosFiltrados = procedimientos.filter(proc => {
      const texto = `${proc.descripcion || proc.nombre}`.toLowerCase();
      return texto.includes(busqueda.toLowerCase());
    });

  useEffect(() => {
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        // Filtrar procedimientos activos (aceptar singular y plural)
        const procedimientosList = (data.tarifas || [])
          .filter(t => (t.servicio_tipo === "procedimiento" || t.servicio_tipo === "procedimientos") && t.activo === 1)
          .map(t => ({
            ...t,
            id: Number(t.id),
            precio_particular: Number(t.precio_particular || t.precio || 0)
          }));
        setProcedimientos(procedimientosList);
      });
    // Obtener datos completos del paciente
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.paciente) setPaciente(data.paciente);
      });
    // Limpiar selección y mensaje al entrar
    setSeleccionados([]);
    setCantidades({});
    setMostrarCobro(false);
    setMensaje("");
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
    if (cobroId) loaders.push(fetch(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cobro = data.cobro || data?.result?.cobro || null; if (!data.success || !cobro) return;
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsProc = [];
      detalles.forEach(cd => { const tipo = (cd.servicio_tipo || '').toLowerCase(); if (tipo === 'procedimiento' || tipo === 'procedimientos') { try { const arr = JSON.parse(cd.descripcion); if (Array.isArray(arr)) itemsProc.push(...arr); } catch { /* ignore parse error */ } } });
      if (itemsProc.length) {
        setPreloadedItems(prev => [...prev, ...itemsProc]);
        const uniqueSel = Array.from(new Set(itemsProc.map(it => Number(it.servicio_id)).filter(Boolean)));
        setSeleccionados(uniqueSel);
        const map = {}; const qtys = {};
        itemsProc.forEach(it => { const tid = Number(it.servicio_id); map[tid] = (map[tid] || 0) + Number(it.cantidad || 1); qtys[tid] = map[tid]; });
        setCantidades(prev => ({ ...prev, ...qtys }));
        setPreloadedCounts(map);
      }
    }));
    if (cotizacionId) loaders.push(fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cot = data.cotizacion || null; if (!data.success || !cot) return;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      const itemsProc = detalles.filter(d => { const t = (d.servicio_tipo || '').toLowerCase(); return t === 'procedimiento' || t === 'procedimientos'; });
      if (itemsProc.length) {
        setPreloadedItems(prev => [...prev, ...itemsProc]);
        const uniqueSel = Array.from(new Set(itemsProc.map(it => Number(it.servicio_id)).filter(Boolean)));
        setSeleccionados(uniqueSel);
        const map = {}; const qtys = {};
        itemsProc.forEach(it => { const tid = Number(it.servicio_id); map[tid] = (map[tid] || 0) + Number(it.cantidad || 1); qtys[tid] = map[tid]; });
        setCantidades(prev => ({ ...prev, ...qtys }));
        setPreloadedCounts(map);
      }
    }));
    if (!loaders.length) return; Promise.all(loaders).catch(() => {});
  }, [location.search]);

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

    allIds.forEach(pid => {
      const isSelected = seleccionados.includes(Number(pid));
      const desiredQty = isSelected ? Number(cantidades[pid] || 1) : 0;
      const preQty = Number(preloadedCounts[pid] || 0);
      const diff = desiredQty - preQty;
      if (diff > 0) {
        const proc = procedimientos.find(p => Number(p.id) === Number(pid));
        if (!proc) return;
        const descripcion = (proc.descripcion && proc.descripcion !== '0') ? proc.descripcion : (proc.nombre || 'Procedimiento');
        itemsToAdd.push({
          servicio_id: Number(pid),
          descripcion,
          cantidad: diff,
          precio_unitario: proc.precio_particular,
          subtotal: proc.precio_particular * diff
        });
      } else if (diff < 0) {
        reductions.push({ servicio_id: Number(pid), cantidad_eliminar: Math.abs(diff) });
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
              servicio_tipo: 'procedimiento',
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
          body: JSON.stringify({ cobro_id: Number(cobroId), servicio_tipo: 'procedimiento', items: additionsAfterReductions })
        });
        const data = await resp.json();
        if (!data?.success) throw new Error(data?.error || 'No se pudo actualizar el cobro');
        baselineItems = [...baselineItems, ...additionsAfterReductions];
      }

      const nextCounts = {};
      allIds.forEach(pid => {
        const isSelected = seleccionados.includes(Number(pid));
        const desiredQty = isSelected ? Number(cantidades[pid] || 1) : 0;
        if (desiredQty > 0) nextCounts[Number(pid)] = desiredQty;
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
    setSeleccionados(sel => sel.filter(pid => pid !== nid));
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
    return seleccionados.reduce((total, pid) => {
      const proc = procedimientos.find(p => Number(p.id) === Number(pid));
      const cantidad = cantidades[pid] || 1;
      return proc ? total + proc.precio_particular * cantidad : total;
    }, 0);
  };

  const cotizar = () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un procedimiento.");
      return;
    }
    const detalles = seleccionados.map(pid => {
      const proc = procedimientos.find(p => Number(p.id) === Number(pid));
      const cantidad = cantidades[pid] || 1;
      let descripcion = proc && proc.descripcion ? proc.descripcion : (proc && proc.nombre ? proc.nombre : "");
      // Si la descripción es 0, usar el nombre
      if (descripcion === 0 || descripcion === "0" || descripcion === null || descripcion === undefined) {
        descripcion = proc && proc.nombre ? proc.nombre : "";
      }
      return proc ? {
        servicio_tipo: "procedimiento",
        servicio_id: pid,
        descripcion,
        cantidad,
        precio_unitario: proc.precio_particular,
        subtotal: proc.precio_particular * cantidad
      } : null;
    }).filter(Boolean);
    setDetallesCotizacion(detalles);
    setTotalCotizacion(calcularTotal());
    setMostrarCobro(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-10 bg-white rounded-xl shadow-lg mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🛠️</span>
          <h2 className="text-2xl font-bold text-blue-800">Cotización de Procedimientos</h2>
          {(new URLSearchParams(location.search).get('cobro_id') || new URLSearchParams(location.search).get('cotizacion_id')) && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded border border-yellow-300">
              {new URLSearchParams(location.search).get('cobro_id')
                ? `Editando cobro #${new URLSearchParams(location.search).get('cobro_id')}`
                : `Editando cotización #${new URLSearchParams(location.search).get('cotizacion_id')}`}
            </span>
          )}
        </div>
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
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 md:max-w-xl mx-auto">
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Selecciona los procedimientos:</h4>
            <input
              type="text"
              placeholder="Buscar procedimiento..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full max-w-md mb-2"
            />
            {procedimientosFiltrados.length === 0 ? (
              <div className="text-center text-gray-500">No hay procedimientos para mostrar.</div>
            ) : (
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <ul className="divide-y divide-gray-100">
                  {procedimientosFiltrados.map(proc => (
                    <li key={proc.id} className="flex items-center px-4 py-3 hover:bg-blue-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={seleccionados.includes(proc.id)}
                        onChange={() => seleccionados.includes(proc.id) ? quitarSeleccion(proc.id) : agregarSeleccion(proc.id)}
                        className="mr-3 accent-orange-600 w-5 h-5"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800">{proc.descripcion || proc.nombre}</div>
                      </div>
                      <div className="font-bold text-green-700 text-lg">S/ {proc.precio_particular}</div>
                      {seleccionados.includes(proc.id) && (
                        <input
                          type="number"
                          min={1}
                          value={cantidades[proc.id] || 1}
                          onChange={e => actualizarCantidad(proc.id, Math.max(1, Number(e.target.value)))}
                          className="border rounded-lg px-2 w-16 bg-white ml-2"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {/* Cotización en tiempo real en columna derecha */}
        <div className="w-full md:max-w-xl md:sticky md:top-8 h-fit">
          {seleccionados.length > 0 && !mostrarCobro && (
            <div className="mb-6">
              <h4 className="font-semibold text-gray-700 mb-2">Lista de Cotización</h4>
              <ul className="divide-y divide-gray-200 bg-gray-50 rounded-lg shadow p-4 max-h-80 overflow-y-auto">
                {seleccionados.map(pid => {
                  const proc = procedimientos.find(p => p.id === pid);
                  const cantidad = cantidades[pid] || 1;
                  return proc ? (
                    <li key={pid} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-gray-900">{proc.descripcion || proc.nombre}</span>
                      </div>
                      <div className="font-bold text-green-700 text-right">S/ {(proc.precio_particular * cantidad).toFixed(2)}</div>
                    </li>
                  ) : null;
                })}
              </ul>
              <div className="mt-4 text-lg font-bold text-right">
                Total: <span className="text-green-600">S/ {calcularTotal().toFixed(2)}</span>
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <button onClick={() => { setSeleccionados([]); setMensaje(""); }} className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200">Limpiar selección</button>
                {new URLSearchParams(location.search).get('cobro_id') ? (
                  <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                ) : (
                  <button onClick={cotizar} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>Cotizar</button>
                )}
              {(new URLSearchParams(location.search).get('cobro_id') || !new URLSearchParams(location.search).get('cobro_id')) && cajaEstado === 'cerrada' && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  <span className="text-sm text-red-600">Caja cerrada: abre una caja para poder {new URLSearchParams(location.search).get('cobro_id') ? 'actualizar' : 'cobrar'}.</span>
                  <button onClick={() => navigate('/contabilidad')} className="text-sm bg-yellow-100 text-yellow-800 px-3 py-1 rounded border border-yellow-300 hover:bg-yellow-200">Ir a Contabilidad</button>
                </div>
              )}
              </div>
            </div>
          )}
          {mostrarCobro && (
            <CobroModuloFinal
              paciente={paciente}
              servicio={{ key: "procedimiento", label: "Procedimiento" }}
              detalles={detallesCotizacion}
              total={totalCotizacion}
              onCobroCompleto={() => {
                setMostrarCobro(false);
                setSeleccionados([]);
                setCantidades({});
                setMensaje("Cotización procesada correctamente.");
              }}
              onCancelar={() => setMostrarCobro(false)}
            />
          )}
        </div>
      </div>
      {mensaje && (
        <div className={`mt-6 text-center font-semibold ${mensaje.includes('correctamente') ? 'text-green-600' : 'text-red-600'}`}>{mensaje}</div>
      )}
    </div>
  );
}
