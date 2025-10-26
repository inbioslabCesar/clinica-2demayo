import { useState, useEffect, useMemo } from 'react';
import { BASE_URL } from '../config/config';
import Swal from 'sweetalert2';

function CobroModulo({ paciente, servicio, onCobroCompleto, onCancelar, detalles, total }) {
  // tarifas se cargan solo si no se reciben detalles por props
  const [tarifas, setTarifas] = useState([]);
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
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      }
    } catch (error) {
      console.error('Error al cargar tarifas:', error);
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

      const result = await response.json();

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
          const ordenResult = await ordenResponse.json();
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
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión con el servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  const mostrarComprobante = async (cobroId, datosComprobante) => {
    const fechaHora = new Date().toLocaleString('es-PE');
    const nombreCompleto = paciente.apellido ? `${paciente.nombre} ${paciente.apellido}` : paciente.nombre;
    // Obtener datos de consulta si existen
    const consulta = datosComprobante.servicio_info || {};
    const tipoConsulta = consulta.tipo_consulta || '';
    // Prioridad: hora en servicio_info, si no existe buscar en detalles
    let horaConsulta = consulta.hora || '';
    if (!horaConsulta && Array.isArray(datosComprobante.detalles) && datosComprobante.detalles.length > 0) {
      // Buscar hora en el primer detalle si existe
      horaConsulta = datosComprobante.detalles[0].hora || '';
    }
    // Simular número de orden si es programada (puedes reemplazar por el real)
    const numeroOrden = tipoConsulta === 'programada' ? (consulta.numero_orden || 'N/A') : '';
    const comprobante = `
      <div style="text-align: left; font-family: monospace;">
        <h3 style="text-align: center; margin-bottom: 20px;">🏥 CLÍNICA 2 DE MAYO</h3>
        <hr>
        <p><strong>COMPROBANTE DE PAGO #${cobroId}</strong></p>
        <p>Fecha: ${fechaHora}</p>
        <p>Paciente: ${nombreCompleto}</p>
        <p>DNI: ${paciente.dni}</p>
        <p>H.C.: ${paciente.historia_clinica}</p>
        <p>Tipo de consulta: ${tipoConsulta === 'programada' ? 'Programada' : 'Espontánea'}</p>
        <p>Hora de consulta: ${horaConsulta}</p>
        ${tipoConsulta === 'programada' ? `<p>N° Orden de llegada: ${numeroOrden}</p>` : ''}
        <hr>
        <p><strong>DETALLE:</strong></p>
        ${datosComprobante.detalles.map(d => 
          `<p>${d.descripcion} x${d.cantidad} .... S/ ${d.subtotal.toFixed(2)}</p>`
        ).join('')}
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
              {detallesCobro.map((detalle, index) => (
                <div key={index} className="flex justify-between items-center">
                  <span>{detalle.descripcion}</span>
                  <span className="font-bold">S/ {detalle.subtotal.toFixed(2)}</span>
                </div>
              ))}
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