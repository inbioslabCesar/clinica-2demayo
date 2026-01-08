import React, { useEffect, useState } from "react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { CobroModuloFinal } from "../components/cobro";

export default function CotizarRayosXPage() {
  const [busqueda, setBusqueda] = useState("");
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [detallesCotizacion, setDetallesCotizacion] = useState([]);
  const [totalCotizacion, setTotalCotizacion] = useState(0);
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
  const [cajaEstado, setCajaEstado] = useState(null);

  // Filtrar tarifas por búsqueda
  const tarifasFiltradas = tarifas.filter(tarifa => {
    const texto = `${tarifa.descripcion || tarifa.nombre}`.toLowerCase();
    let medico = null;
    if (tarifa && tarifa.medico_id) {
      medico = medicos.find(m => m.id === tarifa.medico_id);
    }
    const doctor = medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}`.toLowerCase() : "sin doctor";
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
    if (cobroId || cotizacionId) setPreloadedItems([]);
    if (cobroId) loaders.push(fetch(`${BASE_URL}api_cobros.php?cobro_id=${cobroId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cobro = data.cobro || data?.result?.cobro || null; if (!data.success || !cobro) return;
      const detalles = Array.isArray(cobro.detalles) ? cobro.detalles : [];
      const itemsRx = [];
      detalles.forEach(cd => { if ((cd.servicio_tipo || '').toLowerCase() === 'rayosx') { try { const arr = JSON.parse(cd.descripcion); if (Array.isArray(arr)) itemsRx.push(...arr); } catch { /* ignore parse error */ } } });
      if (itemsRx.length) {
        setPreloadedItems(prev => [...prev, ...itemsRx]);
        const uniqueSel = Array.from(new Set(itemsRx.map(it => Number(it.servicio_id)).filter(Boolean)));
        setSeleccionados(uniqueSel);
        const map = {}; const qtys = {};
        itemsRx.forEach(it => { const tid = Number(it.servicio_id); map[tid] = (map[tid] || 0) + Number(it.cantidad || 1); qtys[tid] = map[tid]; });
        setCantidades(prev => ({ ...prev, ...qtys }));
        setPreloadedCounts(map);
      }
    }));
    if (cotizacionId) loaders.push(fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${cotizacionId}`, { credentials: "include" }).then(res => res.json()).then(data => {
      const cot = data.cotizacion || null; if (!data.success || !cot) return;
      const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
      const itemsRx = detalles.filter(d => (d.servicio_tipo || '').toLowerCase() === 'rayosx');
      if (itemsRx.length) {
        setPreloadedItems(prev => [...prev, ...itemsRx]);
        const uniqueSel = Array.from(new Set(itemsRx.map(it => Number(it.servicio_id)).filter(Boolean)));
        setSeleccionados(uniqueSel);
        const map = {}; const qtys = {};
        itemsRx.forEach(it => { const tid = Number(it.servicio_id); map[tid] = (map[tid] || 0) + Number(it.cantidad || 1); qtys[tid] = map[tid]; });
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
          body: JSON.stringify({ cobro_id: Number(cobroId), servicio_tipo: 'rayosx', items: additionsAfterReductions })
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

  const cotizar = async () => {
    if (seleccionados.length === 0) {
      setMensaje("Selecciona al menos un estudio de Rayos X.");
      return;
    }
    // Construir detalles para el Módulo de Cobros
    const detalles = seleccionados.map(tid => {
      const tarifa = tarifas.find(t => t.id === tid);
      const cantidad = cantidades[tid] || 1;
      // Buscar el médico por medico_id
      let medico = null;
      if (tarifa && tarifa.medico_id !== undefined && tarifa.medico_id !== null) {
        medico = medicos.find(m => Number(m.id) === Number(tarifa.medico_id));
      }
      return tarifa ? {
        servicio_tipo: "rayosx",
        servicio_id: tid,
        descripcion: tarifa.descripcion || tarifa.nombre,
        cantidad,
        precio_unitario: tarifa.precio_particular,
        subtotal: tarifa.precio_particular * cantidad,
        medico_nombre: medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}` : "Sin doctor"
      } : null;
    }).filter(Boolean);
    setDetallesCotizacion(detalles);
    setTotalCotizacion(calcularTotal());
    setMostrarCobro(true);
  };

  return (
    <div className="max-w-7xl mx-auto p-10 bg-white rounded-2xl shadow-2xl mt-8 border border-blue-100">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="mb-4 max-h-[500px] overflow-y-auto">
          <div className="font-bold mb-2 flex flex-col gap-2">
            <span>Estudios disponibles:</span>
            <input
              type="text"
              placeholder="Buscar estudio, descripción o doctor..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full max-w-md"
            />
          </div>
          {tarifas.length === 0 ? (
            <div className="text-gray-500">No hay estudios de Rayos X registrados.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tarifasFiltradas.map(tarifa => {
                let medico = null;
                if (tarifa && tarifa.medico_id) {
                  medico = medicos.find(m => m.id === tarifa.medico_id);
                }
                return (
                  <li key={tarifa.id} className="flex items-center gap-4 py-3 px-2 hover:bg-blue-50 rounded-lg transition-all">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800">{tarifa.descripcion || tarifa.nombre}</div>
                      <div className="text-xs text-gray-500">Precio: S/ {tarifa.precio_particular}</div>
                      <div className="text-xs text-blue-700 mt-1">Doctor: {medico ? `${medico.nombres || medico.nombre} ${medico.apellidos || medico.apellido}` : "Sin doctor"}</div>
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
        <div className="w-full md:max-w-xl md:sticky md:top-8 h-fit">
          {seleccionados.length > 0 && !mostrarCobro && (
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
                {new URLSearchParams(location.search).get('cobro_id') ? (
                  <button onClick={actualizarCobro} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>Actualizar cobro</button>
                ) : (
                  <button onClick={cotizar} disabled={cajaEstado === 'cerrada'} className={`px-6 py-2 rounded font-bold ${cajaEstado === 'cerrada' ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>Registrar Cotización</button>
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
              servicio={{ key: "rayosx", label: "Rayos X" }}
              detalles={detallesCotizacion}
              total={totalCotizacion}
              onCobroCompleto={() => {
                setMostrarCobro(false);
                setSeleccionados([]);
                setCantidades({});
                setMensaje("Cobro procesado correctamente.");
              }}
              onCancelar={() => setMostrarCobro(false)}
            />
          )}
        </div>
      </div>
      {mensaje && (
        <div className="mt-4 text-center font-semibold text-green-600">
          {mensaje}
        </div>
      )}
    </div>
  );
}
