import { useState, useEffect, useMemo } from 'react';
import CobroDescuento from './CobroDescuento';
import { BASE_URL } from '../../config/config';
import Swal from 'sweetalert2';

function CobroModulo({ paciente, servicio, onCobroCompleto, onCancelar }) {
    // Estados para descuento
    const [tipoDescuento, setTipoDescuento] = useState('porcentaje');
    const [valorDescuento, setValorDescuento] = useState(0);
    const [errorDescuento, setErrorDescuento] = useState('');
  const [tarifas, setTarifas] = useState([]);
  const [tipoCobertura, setTipoCobertura] = useState('particular');
  const [tipoPago, setTipoPago] = useState('efectivo');
  const [observaciones, setObservaciones] = useState('');
  const [loading, setLoading] = useState(false);

  // Cargar tarifas al montar el componente
  useEffect(() => {
    cargarTarifas();
  }, []);

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

  // Calcular detalles del cobro usando useMemo
 const detallesCobro = useMemo(() => {
  if (!servicio || tarifas.length === 0) return [];
  const tarifa = tarifas.find(t => t.servicio_tipo === servicio.key && t.activo === 1);
  if (!tarifa) return [];
  let precio = tarifa.precio_particular;
  if (tipoCobertura === 'seguro' && tarifa.precio_seguro) {
    precio = tarifa.precio_seguro;
  } else if (tipoCobertura === 'convenio' && tarifa.precio_convenio) {
    precio = tarifa.precio_convenio;
  }
  return [{
    servicio_tipo: servicio.key,
    descripcion: servicio.label,
    cantidad: 1,
    precio_unitario: parseFloat(precio),
    subtotal: parseFloat(precio)
  }];
}, [servicio, tarifas, tipoCobertura]);

  const calcularTotal = () => {
    const montoOriginal = detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0);
    let descuento = 0;
    if (tipoDescuento === 'porcentaje') {
      descuento = montoOriginal * (valorDescuento / 100);
    } else {
      descuento = valorDescuento;
    }
    return Math.max(montoOriginal - descuento, 0);
  };

  const procesarCobro = async () => {
    if (detallesCobro.length === 0) {
      Swal.fire('Error', 'No hay servicios para cobrar', 'error');
      return;
    }
    // Validar descuento
    const montoOriginal = detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0);
    let descuento = 0;
    if (tipoDescuento === 'porcentaje') {
      descuento = montoOriginal * (valorDescuento / 100);
    } else {
      descuento = valorDescuento;
    }
    if (descuento < 0 || descuento > montoOriginal) {
      setErrorDescuento('El descuento no puede ser mayor al monto original ni negativo.');
      return;
    } else {
      setErrorDescuento('');
    }
    setLoading(true);
    try {
      // Obtener usuario actual del sessionStorage
      const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
      const cobroData = {
        paciente_id: paciente.id,
        usuario_id: usuario.id,
        total: Math.max(montoOriginal - descuento, 0),
        monto_original: montoOriginal,
        monto_descuento: descuento,
        tipo_descuento: tipoDescuento,
        valor_descuento: valorDescuento,
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
    
    const comprobante = `
  <div style="text-align: left; font-family: monospace;">
    <h3 style="text-align: center; margin-bottom: 20px;">🏥 CLÍNICA 2 DE MAYO</h3>
    <hr>
    <p><strong>COMPROBANTE DE PAGO #${cobroId}</strong></p>
    <p>Fecha: ${fechaHora}</p>
    <p>Paciente: ${paciente.nombre} ${paciente.apellido}</p>
    <p>DNI: ${paciente.dni}</p>
    <p>H.C.: ${paciente.historia_clinica}</p>
    <hr>
    <p><strong>DETALLE:</strong></p>
    ${datosComprobante.detalles.map(d => 
      `<p>${d.descripcion} x${d.cantidad} .... S/ ${d.subtotal.toFixed(2)}</p>`
    ).join('')}
    <hr>
      ${datosComprobante.monto_descuento && datosComprobante.monto_descuento > 0 ? `
        <p style="color: #d97706;"><strong>DESCUENTO:</strong> -S/ ${datosComprobante.monto_descuento.toFixed(2)} (${datosComprobante.tipo_descuento === 'porcentaje' ? datosComprobante.valor_descuento + '%' : 'Monto fijo'})</p>
      ` : ''}
    <p><strong>TOTAL: S/ ${datosComprobante.total.toFixed(2)}</strong></p>
    <p>Tipo de pago: ${tipoPago.toUpperCase()}</p>
    <p>Cobertura: ${tipoCobertura.toUpperCase()}</p>
    <hr>
    <p style="text-align: center; font-size: 12px;">
      Gracias por su preferencia<br/>
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

  const total = calcularTotal();

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl border border-blue-200 max-w-3xl mx-auto">
      <h3 className="text-2xl font-bold mb-6 text-blue-800 flex items-center gap-2">
        <span className="text-3xl">💰</span> Módulo de Cobros
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Columna 1: Paciente y cobertura */}
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h4 className="font-semibold mb-1 text-gray-700 flex items-center gap-2"><span className="text-blue-500">👤</span> Paciente</h4>
            <div className="text-lg font-bold">{paciente.nombre} {paciente.apellido}</div>
            <div className="text-sm text-gray-600">DNI: {paciente.dni} | H.C.: {paciente.historia_clinica}</div>
          </div>
          <div>
            <label className="block font-semibold mb-1">Tipo de Cobertura:</label>
            <select 
              value={tipoCobertura} 
              onChange={(e) => setTipoCobertura(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300"
            >
              <option value="particular">Particular</option>
              <option value="seguro">Seguro</option>
              <option value="convenio">Convenio</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Método de Pago:</label>
            <select 
              value={tipoPago} 
              onChange={(e) => setTipoPago(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-300"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">Observaciones:</label>
            <textarea 
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 h-20 focus:ring-2 focus:ring-blue-300"
              placeholder="Observaciones adicionales (opcional)"
            />
          </div>
        </div>
        {/* Columna 2: Detalle, descuento y total */}
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <h4 className="font-semibold mb-2 text-blue-700 flex items-center gap-2"><span className="text-blue-400">🧾</span> Detalle del Servicio</h4>
            {detallesCobro.map((detalle, index) => (
              <div key={index} className="flex justify-between items-center text-base">
                <span>{detalle.descripcion}</span>
                <span className="font-bold">S/ {detalle.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <hr className="my-2" />
            <div className="flex justify-between items-center font-bold text-lg">
              <span>Total:</span>
              <span className="text-green-600">S/ {total.toFixed(2)}</span>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <CobroDescuento
              tipoDescuento={tipoDescuento}
              setTipoDescuento={setTipoDescuento}
              valorDescuento={valorDescuento}
              setValorDescuento={setValorDescuento}
              montoOriginal={detallesCobro.reduce((total, detalle) => total + detalle.subtotal, 0)}
              errorDescuento={errorDescuento}
            />
          </div>
        </div>
      </div>
      {/* Botones de acción */}
      <div className="flex flex-col md:flex-row gap-4 mt-8">
        <button 
          onClick={procesarCobro}
          disabled={loading || total <= 0}
          className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400 transition-all shadow-md"
        >
          {loading ? 'Procesando...' : `💳 Cobrar S/ ${total.toFixed(2)}`}
        </button>
        <button 
          onClick={onCancelar}
          className="flex-1 bg-gray-500 text-white py-3 px-6 rounded-lg font-bold text-lg hover:bg-gray-600 transition-all shadow-md"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export default CobroModulo;