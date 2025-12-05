import { useState, useEffect, useMemo } from 'react';
import CobroDescuento from './CobroDescuento';
import { BASE_URL } from '../../config/config';
import Swal from 'sweetalert2';

function CobroModulo({ paciente, servicio, onCobroCompleto, onCancelar, detalles, total }) {
        // ...existing code...
        const [motivo, setMotivo] = useState('');
    // Estados para descuento
    const [tipoDescuento, setTipoDescuento] = useState('porcentaje');
    const [valorDescuento, setValorDescuento] = useState(0);
    const [errorDescuento, setErrorDescuento] = useState('');
  // Hook para verificar si el usuario tiene caja abierta
  const [cajaActual, setCajaActual] = useState(null);
  const [cajaLoading, setCajaLoading] = useState(true);
  useEffect(() => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    fetch(`${BASE_URL}api_caja_actual.php`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.caja && data.caja.usuario_id === usuario.id) {
          setCajaActual(data.caja);
        } else {
          setCajaActual(null);
        }
        setCajaLoading(false);
      })
      .catch(() => {
        setCajaActual(null);
        setCajaLoading(false);
      });
  }, []);
  // Solo permitir servicios médicos (consulta, laboratorio, farmacia, etc.)
  const serviciosPermitidos = ['consulta', 'laboratorio', 'farmacia', 'rayosx', 'ecografia', 'procedimiento','operacion','hospitalizacion'];
  const esServicioMedico = servicio && serviciosPermitidos.includes(servicio.key);
  // const [tarifas, setTarifas] = useState([]); // Eliminado: no se usa
  const [tipoCobertura, setTipoCobertura] = useState('particular');
  const [tipoPago, setTipoPago] = useState('efectivo');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);

  // Cargar tarifas solo si no se reciben detalles por props
  useEffect(() => {
    if (!detalles) {
      cargarTarifas();
    }
  }, [detalles]);

  const cargarTarifas = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        credentials: 'include'
      });
      await response.json();
      // if (data.success) {
      //   setTarifas(data.tarifas || []);
      // }
    } catch {
      // Eliminado log de error al cargar tarifas
    }
  };

  // Usar detalles y total recibidos por props si existen y son válidos
  const detallesCobro = useMemo(() => {
    if (Array.isArray(detalles) && detalles.length > 0) {
      return detalles;
    }
    return [];
  }, [detalles]);

  const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
let descuento = 0;
if (tipoDescuento === 'porcentaje') {
  descuento = montoOriginal * (valorDescuento / 100);
} else {
  descuento = valorDescuento;
}

  const calcularTotal = () => {
    const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
    let descuento = 0;
    if (tipoDescuento === 'porcentaje') {
      descuento = montoOriginal * (valorDescuento / 100);
    } else {
      descuento = valorDescuento;
    }
    return Math.max(montoOriginal - descuento, 0);
  };

  const procesarCobro = async () => {
    if (cajaLoading) {
      Swal.fire('Espere', 'Verificando caja abierta...', 'info');
      return;
    }
    if (!cajaActual) {
      Swal.fire('Error', 'No tienes una caja abierta. Abre tu caja antes de cobrar.', 'error');
      return;
    }
    if (detallesCobro.length === 0) {
      Swal.fire('Error', 'No hay servicios para cobrar', 'error');
      return;
    }
    // Validar datos completos del paciente
    if (!paciente || !paciente.nombre || !paciente.dni || !paciente.historia_clinica) {
      Swal.fire('Error', 'Faltan datos completos del paciente (nombre, DNI o historia clínica)', 'error');
      return;
    }

    setLoading(true);

    try {
      // Obtener usuario actual del sessionStorage
      const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
      const montoOriginal = detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
      let descuento = 0;
      if (tipoDescuento === 'porcentaje') {
        descuento = montoOriginal * (valorDescuento / 100);
      } else {
        descuento = valorDescuento;
      }
      if (descuento < 0 || descuento > montoOriginal) {
        setErrorDescuento('El descuento no puede ser mayor al monto original ni negativo.');
        setLoading(false);
        return;
      } else {
        setErrorDescuento('');
      }
      const cobroData = {
        paciente_id: paciente.id,
        usuario_id: usuario.id,
        usuario_nombre: usuario.nombre || '',
        paciente_nombre: paciente.apellido ? `${paciente.nombre} ${paciente.apellido}` : paciente.nombre,
        total: Math.max(montoOriginal - descuento, 0),
        monto_original: montoOriginal,
        monto_descuento: descuento,
        tipo_descuento: tipoDescuento,
        valor_descuento: valorDescuento,
        tipo_pago: tipoPago,
        observaciones: observaciones,
        detalles: detallesCobro,
        servicio: String(servicio.key),
        servicio_info: { key: String(servicio.key), label: servicio.label },
        motivo: descuento > 0 ? motivo : ''
      };
      const response = await fetch(`${BASE_URL}api_cobros.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(cobroData)
      });
      let result;
      try {
        result = await response.json();
      } catch (e) {
        const text = await response.text();
        Swal.fire('Error', 'Respuesta inesperada del servidor: ' + text, 'error');
        setLoading(false);
        return;
      }
      // Mostrar error con SweetAlert2 si el backend responde error
      if (!result.success && result.error) {
        Swal.fire({
          icon: 'error',
          title: 'Error en el cobro',
          text: result.error,
        });
        return;
      }

      if (result.success) {
        // Si el servicio es laboratorio y no hay consulta asociada, crear orden de laboratorio
        if (servicio?.key === 'laboratorio' && !servicio?.consulta_id) {
          const examenesIds = detallesCobro.map(d => d.servicio_id);
          const ordenResponse = await fetch(`${BASE_URL}api_ordenes_laboratorio.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              consulta_id: null,
              examenes: examenesIds,
              paciente_id: paciente?.id || null,
              cobro_id: result.cobro_id
            })
          });
          await ordenResponse.json(); // Eliminado: no se usa la variable
        }
        // Mostrar comprobante
        await mostrarComprobante(result.cobro_id, cobroData);
        // Callback para continuar con el flujo
        if (onCobroCompleto) {
          onCobroCompleto(result.cobro_id, servicio);
        }
      } else {
        Swal.fire('Error', result.error || 'Error al procesar el cobro', 'error');
      }
    } catch (error) {
      // Eliminado log de error en producción
      Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const mostrarComprobante = async (cobroId, datosComprobante) => {

    const fechaHora = new Date().toLocaleString('es-PE');
    const nombreCompleto = paciente.apellido ? `${paciente.nombre} ${paciente.apellido}` : paciente.nombre;
    const consulta = datosComprobante.servicio_info || {};
    const tipoConsulta = consulta.tipo_consulta || '';
    let horaConsulta = consulta.hora || '';
    let fechaConsulta = consulta.fecha || '';
    if (!horaConsulta && Array.isArray(datosComprobante.detalles) && datosComprobante.detalles.length > 0) {
      horaConsulta = datosComprobante.detalles[0].hora || '';
    }
    if (!fechaConsulta && Array.isArray(datosComprobante.detalles) && datosComprobante.detalles.length > 0) {
      fechaConsulta = datosComprobante.detalles[0].fecha || '';
    }
    const numeroOrden = tipoConsulta === 'programada' ? (consulta.numero_orden || 'N/A') : '';
    const logoSrc = window.location.hostname === 'localhost' ? '/public/2demayo.svg' : '/logo-clinica.png';

    // Determinar si el servicio es consulta médica
    const esConsultaMedica = consulta.key === 'consulta';

    // Buscar médico en los detalles si existe, si no usar el del servicio
    let nombreMedico = '';
    if (Array.isArray(datosComprobante.detalles)) {
      for (const d of datosComprobante.detalles) {
        if (d.medico_nombre) {
          nombreMedico = d.medico_nombre;
          break;
        }
        if (d.medico) {
          nombreMedico = d.medico;
          break;
        }
      }
    }
    // Si no se encontró en detalles, usar el del servicio
    if (!nombreMedico && datosComprobante.servicio_info && datosComprobante.servicio_info.medico_nombre) {
      nombreMedico = datosComprobante.servicio_info.medico_nombre;
    }

    const comprobante = `
      <div style="text-align: left; font-family: monospace;">
        <div style="text-align: center; margin-bottom: 0;">
          <img src='${logoSrc}' alt='Logo Clínica 2 de Mayo' style='height:60px; margin-bottom:4px; display:block; margin-left:auto; margin-right:auto;' />
          <h3 style="text-align: center; margin-bottom: 20px; margin-top: 4px;">CLÍNICA 2 DE MAYO</h3>
        </div>
        <hr>
        <p><strong>COMPROBANTE DE PAGO #${cobroId}</strong></p>
        <p>Fecha: ${fechaHora}</p>
        <p>Paciente: ${nombreCompleto}</p>
        <p>DNI: ${paciente.dni}</p>
        <p>H.C.: ${paciente.historia_clinica}</p>
        ${esConsultaMedica ? `<p>Tipo de consultas: ${tipoConsulta === 'programada' ? 'Programada' : 'Espontánea'}</p>` : ''}
        ${esConsultaMedica && tipoConsulta === 'programada' ? `<p>Fecha de consulta: ${fechaConsulta}</p>` : ''}
        ${esConsultaMedica ? `<p>Hora de consulta: ${horaConsulta}</p>` : ''}
        ${esConsultaMedica && tipoConsulta === 'programada' ? `<p>N° Orden de llegada: ${numeroOrden}</p>` : ''}
        ${nombreMedico ? `<p>Médico: ${nombreMedico}</p>` : ''}
        <hr>
        <p><strong>DETALLE:</strong></p>
        ${datosComprobante.detalles.map(d => {
          const resumen = d.descripcion.length > 50 ? d.descripcion.slice(0, 47) + '...' : d.descripcion;
          return `<p>${resumen} x${d.cantidad} .... S/ ${d.subtotal.toFixed(2)}</p>`;
        }).join('')}
        <hr>
          ${datosComprobante.monto_descuento && datosComprobante.monto_descuento > 0 ? `
            <p style="color: #d97706;"><strong>DESCUENTO:</strong> -S/ ${datosComprobante.monto_descuento.toFixed(2)} (${datosComprobante.tipo_descuento === 'porcentaje' ? datosComprobante.valor_descuento + '%' : 'Monto fijo'})</p>
          ` : ''}
        <p><strong>TOTAL: S/ ${datosComprobante.total.toFixed(2)}</strong></p>
        <p>Tipo de pago: ${tipoPago === 'yape' ? 'Yape' : tipoPago.toUpperCase()}</p>
        <p>Cobertura: ${tipoCobertura.toUpperCase()}</p>
        <hr>
        <p style="text-align: center; font-size: 12px;">
          Gracias por su preferencia<br>
          Conserve este comprobante
        </p>
      </div>
    `;

    await Swal.fire({
      title: 'Cobro Procesado ✅',
      html: comprobante,
      icon: 'success',
      confirmButtonText: 'Imprimir Comprobante',
      showCancelButton: true,
      cancelButtonText: 'Solo Continuar'
    }).then((result) => {
      if (result.isConfirmed) {
        // Abrir ventana de impresión
        const ventanaImpresion = window.open('', '_blank');
        ventanaImpresion.document.write(comprobante);
        ventanaImpresion.document.close();
        ventanaImpresion.print();
      }
    });
  };

  if (!servicio) {
    return <div>Seleccione un servicio primero</div>;
  }
  if (!esServicioMedico) {
    return (
      <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-6 rounded">
        <h3 className="text-lg font-bold mb-2">⚠️ Solo se pueden procesar cobros de servicios médicos</h3>
        <p>Este módulo no permite cobrar egresos operativos ni otros tipos de egresos. Por favor, utilice el formulario de egresos operativos para registrar gastos administrativos, compras, pagos de servicios, etc.</p>
      </div>
    );
  }

  const totalCobro = calcularTotal();

  return (
    <div className="bg-white p-8 md:p-12 rounded-2xl shadow-2xl border border-blue-200 max-w-2xl lg:max-w-4xl mx-auto mt-8 lg:mt-12">
      <h3 className="text-2xl font-bold mb-6 text-blue-800 flex items-center gap-2">
        <span className="text-3xl">💰</span> Módulo de Cobros
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Columna izquierda: Paciente, cobertura, motivo */}
        <div className="space-y-6 flex flex-col justify-between h-full">
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h4 className="font-semibold mb-2 text-gray-700 flex items-center gap-2 text-lg"><span className="text-blue-500">👤</span> Paciente</h4>
            <div className="text-xl font-bold">{paciente.nombre}</div>
            <div className="text-base text-gray-600">DNI: {paciente.dni} | H.C.: {paciente.historia_clinica}</div>
          </div>
          <div>
            <label className="block font-semibold mb-2">Tipo de Cobertura:</label>
            <select 
              value={tipoCobertura} 
              onChange={(e) => setTipoCobertura(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 text-base"
            >
              <option value="particular">Particular</option>
              <option value="seguro">Seguro</option>
              <option value="convenio">Convenio</option>
            </select>
          </div>
          {descuento > 0 && (
            <div>
              <label className="block font-semibold mb-2">Motivo del descuento <span className="text-red-500">*</span>:</label>
              <textarea 
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 h-20 focus:ring-2 focus:ring-blue-300 text-base"
                placeholder="Motivo o justificación del descuento (obligatorio)"
                required={descuento > 0}
              />
            </div>
          )}
        </div>
        {/* Columna derecha: Detalle, descuento, pago, acción */}
        <div className="space-y-6 flex flex-col justify-between h-full">
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm">
            <h4 className="font-semibold mb-2 text-blue-700 flex items-center gap-2 text-lg"><span className="text-blue-400">🧾</span> Detalle del Servicio</h4>
            {detallesCobro.map((detalle, index) => {
              let precio = detalle.subtotal;
              if ((typeof precio !== 'number' || precio <= 0) && typeof detalle.precio_publico === 'number') {
                precio = detalle.precio_publico;
              }
              return (
                <div key={index} className="flex justify-between items-center text-base">
                  <span>{detalle.descripcion}</span>
                  <span className="font-bold">S/ {precio > 0 ? precio.toFixed(2) : '—'}</span>
                </div>
              );
            })}
            <hr className="my-3" />
            <div className="flex justify-between items-center font-bold text-xl">
              <span>Total:</span>
              <span className="text-green-600">S/ {totalCobro.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 shadow-sm">
            <CobroDescuento
              tipoDescuento={tipoDescuento}
              setTipoDescuento={setTipoDescuento}
              valorDescuento={valorDescuento}
              setValorDescuento={setValorDescuento}
              montoOriginal={detallesCobro.reduce((total, detalle) => total + (detalle.subtotal || 0), 0)}
              errorDescuento={errorDescuento}
            />
          </div>
          <div>
            <label className="block font-semibold mb-2">Método de Pago:</label>
            <select 
              value={tipoPago} 
              onChange={(e) => setTipoPago(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300 text-base"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
            </select>
          </div>
          <div className="flex flex-col md:flex-row gap-4 mt-4">
            <button 
              onClick={procesarCobro}
              disabled={loading || totalCobro <= 0}
              className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 transition-all shadow-md"
            >
              {loading ? 'Procesando...' : `💳 Cobrar S/ ${totalCobro.toFixed(2)}`}
            </button>
            <button 
              onClick={onCancelar}
              className="flex-1 bg-gray-500 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-gray-600 transition-all shadow-md"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CobroModulo;