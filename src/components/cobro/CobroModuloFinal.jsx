import { useState, useEffect, useMemo } from 'react';
import { BASE_URL } from '../../config/config';
import Swal from 'sweetalert2';

function CobroModulo({ paciente, servicio, onCobroCompleto, onCancelar, detalles, total }) {
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

  // Usar detalles y total recibidos por props si existen
  const detallesCobro = useMemo(() => {
    // Usar siempre los detalles recibidos por props si existen y son válidos
    if (Array.isArray(detalles) && detalles.length > 0) {
      return detalles;
    }
    // Si no hay detalles, no generar uno por defecto
    return [];
  }, [detalles]);

  const calcularTotal = () => {
    if (typeof total === 'number' && total > 0) {
      return total;
    }
    return detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0);
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
      
      const cobroData = {
        paciente_id: paciente.id,
        usuario_id: usuario.id,
        total: calcularTotal(),
        tipo_pago: tipoPago,
        observaciones: observaciones,
        detalles: detallesCobro,
        servicio_info: servicio
      };

      const response = await fetch(`${BASE_URL}api_cobros.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(cobroData)
      });
      // Eliminado log de datos enviados a api_cobros.php

      const result = await response.json();
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
  <div className="bg-white p-8 lg:p-20 rounded-2xl shadow-2xl border border-blue-200 max-w-full w-full mx-auto">
      <h3 className="text-xl font-bold mb-4 text-blue-800">💰 Módulo de Cobros</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Columna izquierda */}
        <div>
          {/* Información del paciente */}
          <div className="bg-gray-50 p-4 rounded mb-4">
            <h4 className="font-semibold mb-2">Paciente:</h4>
            <p>{paciente.nombre}</p>
            <p>DNI: {paciente.dni} | H.C.: {paciente.historia_clinica}</p>
          </div>
          {/* Tipo de cobertura */}
          <div className="mb-4">
            <label className="block font-semibold mb-2">Tipo de Cobertura:</label>
            <select 
              value={tipoCobertura} 
              onChange={(e) => setTipoCobertura(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="particular">Particular</option>
              <option value="seguro">Seguro</option>
              <option value="convenio">Convenio</option>
            </select>
          </div>
          {/* Observaciones */}
          <div className="mb-6">
            <label className="block font-semibold mb-2">Observaciones:</label>
            <textarea 
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full border rounded px-3 py-2 h-20"
              placeholder="Observaciones adicionales (opcional)"
            />
          </div>
        </div>
        {/* Columna derecha */}
        <div>
          {/* Detalle del servicio */}
          <div className="mb-4">
            <h4 className="font-semibold mb-2">Detalle del Servicio:</h4>
            <div className="bg-blue-50 p-4 rounded">
              {detallesCobro.map((detalle, index) => {
                // Si el subtotal es 0 o no existe, usar precio_publico si está disponible
                let precio = detalle.subtotal;
                if ((typeof precio !== 'number' || precio <= 0) && typeof detalle.precio_publico === 'number') {
                  precio = detalle.precio_publico;
                }
                // Si sigue siendo 0, mostrar vacío o advertencia
                return (
                  <div key={index} className="flex justify-between items-center">
                    <span>{detalle.descripcion}</span>
                    <span className="font-bold">S/ {precio > 0 ? precio.toFixed(2) : '—'}</span>
                  </div>
                );
              })}
              <hr className="my-2" />
              <div className="flex justify-between items-center font-bold text-lg">
                <span>TOTAL:</span>
                <span className="text-green-600">S/ {totalCobro.toFixed(2)}</span>
              </div>
            </div>
          </div>
          {/* Método de pago */}
          <div className="mb-4">
            <label className="block font-semibold mb-2">Método de Pago:</label>
            <select 
              value={tipoPago} 
              onChange={(e) => setTipoPago(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="yape">Yape</option>
              <option value="plin">Plin</option>
            </select>
          </div>
          {/* Botones de acción */}
          <div className="flex gap-3 mt-6">
            <button 
              onClick={procesarCobro}
              disabled={loading || totalCobro <= 0}
              className="flex-1 bg-green-600 text-white py-2 px-4 rounded font-bold text-base hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Procesando...' : `💳 Cobrar S/ ${totalCobro.toFixed(2)}`}
            </button>
            <button 
              onClick={onCancelar}
              className="bg-gray-500 text-white py-2 px-4 rounded font-bold text-base hover:bg-gray-600"
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