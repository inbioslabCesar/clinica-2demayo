import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { BASE_URL } from "../config/config";
import Spinner from "../components/comunes/Spinner";
import { FaMoneyBillWave, FaUserCircle, FaClipboardList } from "react-icons/fa";
import Swal from 'sweetalert2';

export default function ConsumoPacientePage() {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [modalDetallesCobro, setModalDetallesCobro] = useState([]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const { pacienteId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [consumo, setConsumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(3);
  const [clinicBrand, setClinicBrand] = useState({ name: 'MI CLINICA', logo: '', slogan: '', slogan_color: '', nombre_color: '', direccion: '', telefono: '', celular: '', ruc: '', email: '' });
  const [medicosMap, setMedicosMap] = useState({});
  const [tarifasMedicoMap, setTarifasMedicoMap] = useState({});

  // Reiniciar página al cambiar cantidad de filas
  useEffect(() => { setPage(1); }, [itemsPerPage]);

  useEffect(() => {
  fetch(`${BASE_URL}api_consumos_paciente.php?paciente_id=${pacienteId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) setConsumo(data);
        else setError(data.error || "Error al cargar consumo");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [pacienteId]);

  useEffect(() => {
    let mounted = true;
    fetch(`${BASE_URL}api_get_configuracion.php`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !data?.success) return;
        const cfg = data.data || {};
        const nombre = String(cfg.nombre_clinica || '').trim().toUpperCase() || 'MI CLINICA';
        const rawLogo = String(cfg.logo_url || '').trim();
        const logo = rawLogo
          ? (/^(https?:\/\/|data:|blob:)/i.test(rawLogo)
            ? rawLogo
            : `${String(BASE_URL || '').replace(/\/+$/, '')}/${rawLogo.replace(/^\/+/, '')}`)
          : '';
        setClinicBrand({
          name: nombre,
          logo,
          slogan: String(cfg.slogan || '').trim(),
          slogan_color: String(cfg.slogan_color || '').trim(),
          nombre_color: String(cfg.nombre_color || '').trim(),
          direccion: String(cfg.direccion || '').trim(),
          telefono: String(cfg.telefono || '').trim(),
          celular: String(cfg.celular || '').trim(),
          ruc: String(cfg.ruc || '').trim(),
          email: String(cfg.email || '').trim(),
        });
      })
      .catch(() => {
        // fallback defaults
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`${BASE_URL}api_medicos.php`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data?.medicos) ? data.medicos : [];
        const map = {};
        list.forEach((m) => {
          const id = Number(m?.id || 0);
          if (!id) return;
          const nombre = String(m?.nombres || m?.nombre || '').trim();
          const apellido = String(m?.apellidos || m?.apellido || '').trim();
          const full = `${nombre} ${apellido}`.trim();
          if (full) map[id] = full;
        });
        setMedicosMap(map);
      })
      .catch(() => {
        if (mounted) setMedicosMap({});
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`${BASE_URL}api_tarifas.php`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        const list = Array.isArray(data?.tarifas) ? data.tarifas : [];
        const map = {};
        list.forEach((t) => {
          const tarifaId = Number(t?.id || 0);
          if (!tarifaId) return;
          const medicoId = Number(t?.medico_id || 0);
          if (!medicoId) return;
          map[tarifaId] = medicoId;
        });
        setTarifasMedicoMap(map);
      })
      .catch(() => {
        if (mounted) setTarifasMedicoMap({});
      });

    return () => {
      mounted = false;
    };
  }, []);

  const resolverNombreMedicoDetalle = (detalle) => {
    const directo = String(
      detalle?.medico_nombre_completo
      || `${detalle?.medico_nombre || ''} ${detalle?.medico_apellido || ''}`
      || detalle?.medico
      || detalle?.doctor
      || ''
    ).trim();
    if (directo) return directo;

    const medicoId = Number(detalle?.medico_id || 0);
    if (medicoId > 0 && medicosMap[medicoId]) {
      return medicosMap[medicoId];
    }

    const servicioId = Number(detalle?.servicio_id || detalle?.tarifa_id || 0);
    const medicoIdDesdeTarifa = servicioId > 0 ? Number(tarifasMedicoMap[servicioId] || 0) : 0;
    if (medicoIdDesdeTarifa > 0 && medicosMap[medicoIdDesdeTarifa]) {
      return medicosMap[medicoIdDesdeTarifa];
    }

    return '';
  };
  
  // Memo: base del historial
  const historialBase = useMemo(() => (
    Array.isArray(consumo?.historial) ? consumo.historial : []
  ), [consumo]);
  // Filtrar por fecha (solo parte de la fecha, ignorando hora)
  function soloFecha(fechaStr) {
    // Si la fecha viene como 'YYYY-MM-DD' o 'YYYY-MM-DD HH:mm:ss', toma solo la parte de la fecha
    return fechaStr.split(' ')[0];
  }
  const historialFiltrado = useMemo(() => {
    let arr = historialBase;
    if (fechaInicio) arr = arr.filter(item => soloFecha(item.fecha) >= fechaInicio);
    if (fechaFin) arr = arr.filter(item => soloFecha(item.fecha) <= fechaFin);
    return arr;
  }, [historialBase, fechaInicio, fechaFin]);
  // Agrupar por cobro (por fecha y monto total)
  const cobrosAgrupados = useMemo(() => {
    const priority = { pendiente: 4, parcial: 3, anulada: 2, pagado: 1 };
    const grupos = {};

    const pushTipoServicio = (bucket, tipoRaw) => {
      const tipo = String(tipoRaw || '').toLowerCase().trim();
      if (!tipo) return;
      bucket.add(tipo);
    };

    historialFiltrado.forEach(item => {
      const key = item.cobro_id ? `cobro_${item.cobro_id}` : (soloFecha(item.fecha) + '_' + item.monto + '_' + item.servicio);
      if (!grupos[key]) {
        grupos[key] = {
          cobro_id: item.cobro_id || null,
          fecha: item.fecha,
          montoTotal: 0,
          montoBrutoTotal: 0,
          montoCobradoTotal: 0,
          detalles: [],
          estado_pago: 'pagado',
          saldo_pendiente: 0,
          cotizacion_id: null,
          _servicios: new Set(),
        };
      }
      grupos[key].detalles.push(item);
      grupos[key].montoTotal += Number(item.monto);
      grupos[key].montoBrutoTotal += Number(item.monto_bruto || item.monto || 0);
      if (item.cobro_id) {
        grupos[key].montoCobradoTotal = Math.max(
          Number(grupos[key].montoCobradoTotal || 0),
          Number(item.monto_cobrado || item.monto || 0)
        );
      } else {
        grupos[key].montoCobradoTotal += Number(item.monto_cobrado || item.monto || 0);
      }

      if (Array.isArray(item.detalles) && item.detalles.length > 0) {
        item.detalles.forEach((d) => pushTipoServicio(grupos[key]._servicios, d?.servicio_tipo || item.servicio));
      } else {
        pushTipoServicio(grupos[key]._servicios, item.servicio);
      }

      const estadoItem = String(item.estado_pago || 'pagado').toLowerCase();
      const estadoActual = String(grupos[key].estado_pago || 'pagado').toLowerCase();
      if ((priority[estadoItem] || 0) > (priority[estadoActual] || 0)) {
        grupos[key].estado_pago = estadoItem;
      }

      const saldoItem = Number(item.saldo_pendiente || 0);
      if (saldoItem > Number(grupos[key].saldo_pendiente || 0)) {
        grupos[key].saldo_pendiente = saldoItem;
      }

      if (!grupos[key].cotizacion_id && Number(item.cotizacion_id || 0) > 0) {
        grupos[key].cotizacion_id = Number(item.cotizacion_id);
      }
    });
    return Object.values(grupos).map((g) => {
      const servicios = Array.from(g._servicios || []);
      const servicioPrincipal = servicios.length === 1 ? servicios[0] : 'mixto';
      return {
        cobro_id: g.cobro_id,
        fecha: g.fecha,
        montoTotal: g.montoTotal,
        monto_bruto_total: g.montoBrutoTotal,
        monto_cobrado_total: g.montoCobradoTotal,
        detalles: g.detalles,
        estado_pago: g.estado_pago,
        saldo_pendiente: g.saldo_pendiente,
        cotizacion_id: g.cotizacion_id,
        servicios,
        servicio: servicioPrincipal,
      };
    });
  }, [historialFiltrado]);

  const servicioBadgeClass = (servicio) => {
    const s = String(servicio || '').toLowerCase();
    if (s === 'consulta') return 'bg-green-100 text-green-700';
    if (s === 'laboratorio') return 'bg-yellow-100 text-yellow-700';
    if (s === 'farmacia') return 'bg-purple-100 text-purple-700';
    if (s === 'procedimiento' || s === 'procedimientos') return 'bg-blue-100 text-blue-700';
    if (s === 'mixto') return 'bg-indigo-100 text-indigo-700';
    return 'bg-gray-100 text-gray-700';
  };

  const estadoStyles = {
    pagado: 'bg-green-100 text-green-700',
    parcial: 'bg-amber-100 text-amber-700',
    pendiente: 'bg-red-100 text-red-700',
    anulada: 'bg-gray-200 text-gray-700',
  };

  const estadoLabel = {
    pagado: 'pagado',
    parcial: 'parcial',
    pendiente: 'pendiente',
    anulada: 'anulada',
  };

  const rutaVolver = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const backFromState = (location.state && typeof location.state.backTo === 'string')
      ? location.state.backTo
      : null;
    const backFromQuery = sp.get('back_to');
    const destino = backFromState || backFromQuery;
    if (!destino || !destino.startsWith('/') || destino.startsWith('/consumo-paciente/')) {
      return '/pacientes';
    }
    return destino;
  }, [location.search, location.state]);

    if (loading) return <Spinner />;
    if (error) return <div className="text-red-600 font-bold p-6">{error}</div>;
  // Calcular paginación
  const totalItems = cobrosAgrupados.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIdx = (page - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const gruposPagina = cobrosAgrupados.slice(startIdx, endIdx);

  function imprimirTicketCobro() {
    if (!modalDetalle || !modalDetallesCobro) return;
    const normalizarServicio = (s) => String(s || '').toLowerCase().trim();
    const requiereMedico = (s) => {
      const t = normalizarServicio(s);
      return t === 'consulta' || t === 'ecografia' || t === 'rayosx' || t === 'rayos_x' || t === 'rayos x';
    };
    const fechaHora = new Date(modalDetalle.fecha).toLocaleString('es-PE');
    const nombreCompleto = consumo.apellido ? `${consumo.nombre} ${consumo.apellido}` : consumo.nombre;
    const tipoPago = modalDetalle.tipo_pago ? modalDetalle.tipo_pago.toUpperCase() : (modalDetalle.detalles && modalDetalle.detalles[0]?.tipo_pago ? modalDetalle.detalles[0].tipo_pago.toUpperCase() : 'EFECTIVO');
    const cobertura = modalDetalle.cobertura ? modalDetalle.cobertura.toUpperCase() : (modalDetalle.detalles && modalDetalle.detalles[0]?.cobertura ? modalDetalle.detalles[0].cobertura.toUpperCase() : 'PARTICULAR');
    const montoBruto = Number(modalDetalle?.monto_bruto_total || modalDetallesCobro.reduce((sum, d) => sum + Number(d.subtotal || d.monto || 0), 0));
    const montoCobrado = Number(modalDetalle?.monto_cobrado_total || montoBruto);
    const descuentoAplicado = Math.max(0, Number((montoBruto - montoCobrado).toFixed(2)));
    const logoHtml = clinicBrand.logo
      ? `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin:0 0 8px 0;"><img src="${clinicBrand.logo}" alt="Logo clínica" style="display:block;margin:0 auto;height:52px;max-width:170px;object-fit:contain;object-position:center;" /></div>`
      : '';
    const ticketHtml = `
      <div style="font-family: monospace; width: 320px; margin: 0 auto;">
        ${logoHtml}
        <h3 style="text-align: center; margin-bottom: 4px;${clinicBrand.nombre_color ? ' color:' + clinicBrand.nombre_color + ';' : ''}">${clinicBrand.name}</h3>
        ${clinicBrand.slogan ? `<p style="text-align:center;margin:0 0 4px;font-style:italic;font-size:11px;${clinicBrand.slogan_color ? 'color:' + clinicBrand.slogan_color + ';' : ''}">${clinicBrand.slogan}</p>` : ''}
        ${clinicBrand.direccion ? `<p style="text-align:center;margin:2px 0;font-size:11px;">${clinicBrand.direccion}</p>` : ''}
        ${clinicBrand.telefono ? `<p style="text-align:center;margin:2px 0;font-size:11px;">Tel: ${clinicBrand.telefono}</p>` : ''}
        ${clinicBrand.celular ? `<p style="text-align:center;margin:2px 0;font-size:11px;">Cel: ${clinicBrand.celular}</p>` : ''}
        ${clinicBrand.ruc ? `<p style="text-align:center;margin:2px 0;font-size:11px;">RUC: ${clinicBrand.ruc}</p>` : ''}
        <hr>
        <p><strong>COMPROBANTE DE PAGO #${modalDetalle.cobro_id || ''}</strong></p>
        <p>Fecha: ${fechaHora}</p>
        <p>Paciente: ${nombreCompleto}</p>
        <p>DNI: ${consumo.dni}</p>
        <p>H.C.: ${consumo.historia_clinica}</p>
        <hr>
        <p><strong>DETALLE:</strong></p>
        ${modalDetallesCobro.map(d => {
          const servicio = d.servicio_tipo || d.servicio || modalDetalle.servicio;
          const medico = requiereMedico(servicio) ? resolverNombreMedicoDetalle(d) : '';
          const medicoTxt = medico ? ` - ${medico}` : '';
          return `<p>${d.descripcion}${medicoTxt} x${d.cantidad || 1} .... S/ ${(d.subtotal || d.monto).toFixed(2)}</p>`;
        }
        ).join('')}
        <hr>
        <p>Total original: S/ ${montoBruto.toFixed(2)}</p>
        ${descuentoAplicado > 0 ? `<p style="color:#b45309;">Descuento: -S/ ${descuentoAplicado.toFixed(2)}</p>` : ''}
        <p style="font-weight:bold; font-size:17px; color:#008000;">TOTAL COBRADO: S/ ${montoCobrado.toFixed(2)}</p>
        <p>Tipo de pago: ${tipoPago}</p>
        <p>Cobertura: ${cobertura}</p>
        <hr>
        <div style="text-align: center; font-size: 12px;">Gracias por su preferencia<br>Conserve este comprobante</div>
      </div>
    `;
    Swal.fire({
      title: 'Ticket de Cobro',
      html: ticketHtml,
      icon: 'info',
      confirmButtonText: 'Imprimir',
      showCancelButton: true,
      cancelButtonText: 'Cerrar'
    }).then((result) => {
      if (result.isConfirmed) {
        const ventana = window.open('', '_blank', 'width=400,height=600');
        ventana.document.write(`<html><head><title>Ticket</title></head><body>${ticketHtml}</body></html>`);
        ventana.document.close();
        ventana.print();
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8 font-sans">
      {/* Modal de detalle de servicio */}
      {modalVisible && modalDetalle && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl font-bold"
              onClick={() => setModalVisible(false)}
            >×</button>
            <h3 className="text-lg font-bold mb-2 text-blue-800">Detalle del Cobro</h3>
            <div className="mb-2">
              <span className="font-semibold">Fecha:</span> {modalDetalle.fecha}<br />
              <span className="font-semibold">Estado:</span>{' '}
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${estadoStyles[String(modalDetalle.estado_pago || 'pagado').toLowerCase()] || 'bg-gray-100 text-gray-700'}`}>
                {estadoLabel[String(modalDetalle.estado_pago || 'pagado').toLowerCase()] || String(modalDetalle.estado_pago || 'pagado')}
              </span>
              {Number(modalDetalle?.saldo_pendiente || 0) > 0 && (
                <>
                  {' '}<span className="text-amber-700 font-semibold">(Saldo: S/ {Number(modalDetalle.saldo_pendiente).toFixed(2)})</span>
                </>
              )}
              <br />
            </div>
            <div className="max-h-[50vh] overflow-y-auto rounded mb-4 border">
              <table className="min-w-full">
              <thead>
                <tr className="bg-blue-100">
                  <th className="px-2 py-1 border text-left">Servicio</th>
                  <th className="px-2 py-1 border text-left">Descripción</th>
                  <th className="px-2 py-1 border text-left">Médico</th>
                  <th className="px-2 py-1 border text-right">Monto (S/)</th>
                </tr>
              </thead>
              <tbody>
                {modalDetallesCobro.map((d, i) => {
                  const servicioTipo = d.servicio_tipo || modalDetalle.servicio;
                  const s = String(servicioTipo || '').toLowerCase().trim();
                  const mostrarMedico = s === 'consulta' || s === 'ecografia' || s === 'rayosx' || s === 'rayos_x' || s === 'rayos x';
                  const medicoNombre = resolverNombreMedicoDetalle(d);
                  return (
                    <tr key={i}>
                      <td className="border px-2 py-1">{servicioTipo}</td>
                      <td className="border px-2 py-1">{d.descripcion && d.descripcion !== "0" ? d.descripcion : <span className="italic text-gray-500">Sin detalle</span>}</td>
                      <td className="border px-2 py-1">{mostrarMedico ? (medicoNombre || '-') : '-'}</td>
                      <td className="border px-2 py-1 text-right">{Number(d.subtotal || d.monto).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            <div className="text-right mb-4">
              <div className="text-sm text-gray-700">Total original: S/ {Number(modalDetalle?.monto_bruto_total || modalDetallesCobro.reduce((sum, d) => sum + Number(d.subtotal || d.monto || 0), 0)).toFixed(2)}</div>
              {Math.max(0, Number((Number(modalDetalle?.monto_bruto_total || 0) - Number(modalDetalle?.monto_cobrado_total || 0)).toFixed(2))) > 0 && (
                <div className="text-sm text-amber-700">Descuento: -S/ {Math.max(0, Number((Number(modalDetalle?.monto_bruto_total || 0) - Number(modalDetalle?.monto_cobrado_total || 0)).toFixed(2))).toFixed(2)}</div>
              )}
              <div className="font-bold text-green-700 text-lg">Total cobrado: S/ {Number(modalDetalle?.monto_cobrado_total || modalDetallesCobro.reduce((sum, d) => sum + Number(d.subtotal || d.monto || 0), 0)).toFixed(2)}</div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow"
                onClick={imprimirTicketCobro}
              >Imprimir ticket</button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => navigate(rutaVolver === '/pacientes' ? -1 : rutaVolver)} className="mb-4 bg-gradient-to-r from-blue-200 to-purple-200 px-4 py-2 rounded hover:bg-blue-300 flex items-center gap-2 text-blue-900 font-semibold">
        ← Volver
      </button>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <FaUserCircle className="text-3xl text-blue-700" />
          <h2 className="text-2xl font-bold text-blue-800">Consumo del Paciente</h2>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => navigate(`/documentos-paciente/${pacienteId}`, { state: { backTo: `/consumo-paciente/${pacienteId}` } })}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow transition flex-shrink-0"
          >
            📁 Expediente Digital
          </button>
          <button
            onClick={() => navigate(`/imagenes-paciente/${pacienteId}`, { state: { backTo: `/consumo-paciente/${pacienteId}` } })}
            className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold px-4 py-2 rounded-xl shadow transition flex-shrink-0"
          >
            🩻 Imágenes
          </button>
        </div>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 bg-blue-50 rounded-lg p-4">
        <div>
          <span className="font-semibold text-gray-700">ID:</span> {consumo.paciente_id} <br />
          <span className="font-semibold text-gray-700">Nombre:</span> {consumo.nombre} {consumo.apellido} <br />
          <span className="font-semibold text-gray-700">DNI:</span> {consumo.dni}
        </div>
        <div>
          <span className="font-semibold text-gray-700">Historia Clínica:</span> {consumo.historia_clinica} <br />
          <span className="inline-flex items-center gap-2 font-bold text-green-700 text-lg mt-2">
            <FaMoneyBillWave className="text-2xl" />
            Consumo Total: S/ {consumo.consumo_total.toFixed(2)}
          </span>
          {consumo.deuda_total > 0 && (
            <span className="inline-flex items-center gap-2 font-bold text-red-600 text-lg mt-2 ml-4">
              <FaMoneyBillWave className="text-2xl" />
              Deuda: S/ {consumo.deuda_total.toFixed(2)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-8 mb-2">
        <FaClipboardList className="text-xl text-purple-700" />
        <h4 className="font-semibold text-lg text-purple-800">Historial de Servicios</h4>
      </div>
      {/* Filtros por fecha */}
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <div className="flex items-center gap-2">
          <label htmlFor="fechaInicio" className="font-semibold text-gray-700">Desde:</label>
          <input
            type="date"
            id="fechaInicio"
            value={fechaInicio}
            onChange={e => setFechaInicio(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="fechaFin" className="font-semibold text-gray-700">Hasta:</label>
          <input
            type="date"
            id="fechaFin"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <button
          onClick={() => { setFechaInicio(""); setFechaFin(""); }}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-semibold"
        >Limpiar Filtros</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-lg shadow-sm">
          <thead>
            <tr className="bg-gradient-to-r from-blue-100 to-purple-100">
              <th className="px-3 py-2 border text-left">Fecha</th>
              <th className="px-3 py-2 border text-left">Servicio</th>
              <th className="px-3 py-2 border text-left">Descripción</th>
              <th className="px-3 py-2 border text-center">Estado</th>
              <th className="px-3 py-2 border text-right">Monto (S/)</th>
            </tr>
          </thead>
          <tbody>
            {cobrosAgrupados.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-gray-500">No hay servicios registrados.</td>
              </tr>
            ) : (
              gruposPagina.map((grupo, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-blue-50"}>
                  <td className="border px-3 py-2">{grupo.fecha}</td>
                  <td className="border px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {(grupo.servicios || [grupo.servicio]).map((srv, srvIdx) => (
                        <span key={`${srv}-${srvIdx}`} className={`inline-block px-2 py-1 rounded text-xs font-semibold ${servicioBadgeClass(srv)}`}>
                          {srv}
                        </span>
                      ))}
                      {/* Acceso rápido al expediente digital si hay laboratorio */}
                      {(grupo.servicios || []).some(s => ['laboratorio','ecografia','rayosx','tomografia'].includes(s)) && (
                        <button
                          className={`ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-lg border transition ${
                            Number(grupo.cotizacion_id || 0) > 0
                              ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 border-indigo-200'
                              : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          }`}
                          title={Number(grupo.cotizacion_id || 0) > 0 ? 'Ver documentos y resultados' : 'Sin cotización vinculada'}
                          disabled={Number(grupo.cotizacion_id || 0) <= 0}
                          onClick={() => {
                            if (Number(grupo.cotizacion_id || 0) <= 0) return;
                            const params = new URLSearchParams();
                            if (Number(grupo.cotizacion_id || 0) > 0) {
                              params.set('cotizacion_id', String(grupo.cotizacion_id));
                            }
                            params.set('back_to', `/consumo-paciente/${pacienteId}`);
                            const qs = params.toString();
                            navigate(`/documentos-paciente/${pacienteId}${qs ? `?${qs}` : ''}`);
                          }}
                        >
                          📁 Docs
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="border px-3 py-2">
                    <button
                      className="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded text-blue-900 font-semibold text-xs shadow"
                      onClick={() => {
                        const detallesFlatten = (grupo.detalles || []).flatMap(it => Array.isArray(it.detalles) ? it.detalles : []);
                        setModalDetalle({
                          ...grupo,
                          cobro_id: grupo.detalles?.[0]?.cobro_id,
                          servicio: grupo.servicio,
                          servicios: grupo.servicios,
                          tipo_pago: detallesFlatten?.[0]?.tipo_pago,
                          cobertura: detallesFlatten?.[0]?.cobertura,
                          detalles: detallesFlatten
                        });
                        setModalDetallesCobro(detallesFlatten);
                        setModalVisible(true);
                      }}
                    >Ver detalle</button>
                  </td>
                  <td className="border px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${estadoStyles[String(grupo.estado_pago || 'pagado').toLowerCase()] || 'bg-gray-100 text-gray-700'}`}>
                      {estadoLabel[String(grupo.estado_pago || 'pagado').toLowerCase()] || String(grupo.estado_pago || 'pagado')}
                    </span>
                    {Number(grupo.saldo_pendiente || 0) > 0 && (
                      <div className="text-[11px] text-amber-700 mt-1">S/ {Number(grupo.saldo_pendiente).toFixed(2)}</div>
                    )}
                  </td>
                  <td className="border px-3 py-2 text-right font-semibold text-green-700">{Number(grupo.montoTotal).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Selector de filas por página y controles de paginación */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mt-4">
        <div className="flex items-center gap-2">
          <label htmlFor="itemsPerPage" className="font-semibold text-gray-700">Filas por página:</label>
          <select
            id="itemsPerPage"
            value={itemsPerPage}
            onChange={e => setItemsPerPage(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-4">
            <button
              className={`px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm font-semibold ${page === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >Anterior</button>
            <span className="font-semibold text-blue-700">Página {page} de {totalPages}</span>
            <button
              className={`px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-sm font-semibold ${page === totalPages ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >Siguiente</button>
          </div>
        )}
      </div>
    </div>
  );
}
