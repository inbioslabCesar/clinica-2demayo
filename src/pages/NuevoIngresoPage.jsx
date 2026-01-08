import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";
import { 
  FaArrowLeft, 
  FaSave,
  FaPlus
} from "react-icons/fa";
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import Spinner from "../components/comunes/Spinner";

export default function NuevoIngresoPage() {
  const MySwal = withReactContent(Swal);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [opcionesServicio, setOpcionesServicio] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);

  // Estados del formulario
  const [formData, setFormData] = useState({
    tipo_ingreso: '',
    categoria_id: '',
    area_personalizada: '',
    descripcion: '',
    monto: '',
    metodo_pago: '',
    referencia: '',
    paciente_nombre: '',
    observaciones: ''
  });

  useEffect(() => {
    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    // Cuando cambia el tipo de ingreso, cargar las opciones de servicio correspondientes
    if (!formData.tipo_ingreso) {
      setOpcionesServicio([]);
      return;
    }
    setLoading(true);
    fetch(`${BASE_URL}api_tarifas.php?servicio_tipo=${formData.tipo_ingreso}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setOpcionesServicio(data.tarifas);
        } else {
          setOpcionesServicio([]);
        }
      })
      .catch(() => setOpcionesServicio([]))
      .finally(() => setLoading(false));
  }, [formData.tipo_ingreso]);

  const cargarDatosIniciales = async () => {
    try {
      setLoading(true);
      // Solo cargar métodos de pago
      const metodosResp = await fetch(`${BASE_URL}api_metodos_pago.php`, { credentials: 'include' });
      const metodosData = await metodosResp.json();
      if (metodosData.success) {
        setMetodosPago(metodosData.metodos);
      } else {
        // Eliminado log de error cargando métodos de pago
      }
    } catch {
      // Eliminado log de error cargando datos
      Swal.fire('Error', 'Error al cargar los datos iniciales', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Si cambia el tipo de ingreso, resetear categoría
    if (name === 'tipo_ingreso') {
      setFormData(prev => ({
        ...prev,
        categoria_id: '',
        area_personalizada: ''
      }));
    }
  };

  // Opciones de servicio según tipo seleccionado
  const servicioSeleccionado = opcionesServicio.find(op => op.id === formData.categoria_id);

  const guardarIngreso = async () => {
    // Validaciones
    if (!formData.tipo_ingreso) {
      Swal.fire('Error', 'Debe seleccionar un tipo de ingreso', 'error');
      return;
    }

    if (!formData.descripcion.trim()) {
      Swal.fire('Error', 'Debe ingresar una descripción', 'error');
      return;
    }

    if (!formData.monto || parseFloat(formData.monto) <= 0) {
      Swal.fire('Error', 'Debe ingresar un monto válido', 'error');
      return;
    }

    if (!formData.metodo_pago) {
      Swal.fire('Error', 'Debe seleccionar un método de pago', 'error');
      return;
    }

    // Determinar el área y descripción exacta
    let area = '';
    let descripcion = formData.descripcion.trim();
    if (formData.categoria_id && servicioSeleccionado) {
      area = servicioSeleccionado.descripcion;
      descripcion = servicioSeleccionado.descripcion; // Usar descripción exacta de la tarifa
    } else if (formData.area_personalizada.trim()) {
      area = formData.area_personalizada.trim();
    } else {
      area = 'Otros servicios';
    }

    try {
      setGuardando(true);

      const payload = {
        tipo_ingreso: formData.tipo_ingreso,
        area: area,
        descripcion: descripcion,
        monto: parseFloat(formData.monto),
        metodo_pago: formData.metodo_pago,
        referencia: formData.referencia.trim(),
        paciente_nombre: formData.paciente_nombre.trim(),
        observaciones: formData.observaciones.trim()
      };
      // Agregar consulta_id, medico_id y paciente_id si existen en formData
      if (formData.consulta_id) {
        payload.consulta_id = formData.consulta_id;
      }
      if (formData.medico_id) {
        payload.medico_id = formData.medico_id;
      }
      if (formData.paciente_id) {
        payload.paciente_id = formData.paciente_id;
      }
      const response = await fetch(`${BASE_URL}api_registrar_ingreso.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        MySwal.fire({
          icon: 'success',
          title: '¡Ingreso Registrado!',
          html: `<div class='text-left'>
            <p><strong>Monto:</strong> S/ ${parseFloat(formData.monto).toFixed(2)}</p>
            <p><strong>Área/Servicio:</strong> ${area}</p>
            <p><strong>Descripción:</strong> ${formData.descripcion}</p>
            <p><strong>Método de Pago:</strong> ${formData.metodo_pago}</p>
            <button id='btn-imprimir-ticket' style='margin-top:16px;padding:8px 18px;background:#2563eb;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;'>Imprimir Ticket</button>
          </div>`,
          confirmButtonText: 'Continuar',
          confirmButtonColor: '#2563eb',
          didOpen: () => {
            const btn = document.getElementById('btn-imprimir-ticket');
            if (btn) {
              btn.onclick = () => {
                window.open(`${BASE_URL}comprobante_ticket.php?ingreso_id=${data.ingreso_id}`, '_blank', 'width=400,height=600');
              };
            }
          }
        }).then((result) => {
          if (result.isConfirmed) {
            navigate('/contabilidad/ingresos');
          }
        });
      } else {
        MySwal.fire('Error', data.error || 'Error al registrar ingreso', 'error');
      }

    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <button 
          onClick={() => navigate('/contabilidad/ingresos')}
          className="mb-4 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:from-gray-300 hover:to-gray-400 flex items-center gap-2 font-semibold transition-all"
        >
          <FaArrowLeft />
          Volver a Ingresos
        </button>

        <div className="flex items-center gap-3">
          <FaPlus className="text-4xl text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Registrar Nuevo Ingreso</h1>
            <p className="text-gray-600">Agregar ingreso manual al sistema de caja</p>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tipo de Ingreso */}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tipo de Ingreso *
            </label>
            <select
              name="tipo_ingreso"
              value={formData.tipo_ingreso}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Seleccionar tipo...</option>
              <option value="consulta">Consulta Médica</option>
              <option value="laboratorio">Laboratorio</option>
              <option value="farmacia">Farmacia</option>
              <option value="ecografia">Ecografía</option>
              <option value="rayosx">Rayos X</option>
              <option value="procedimiento">Procedimiento</option>
              <option value="otros">Otros</option>
            </select>
          </div>

          {/* Área/Servicio dinámico */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {formData.tipo_ingreso === 'otros' ? 'Área/Servicio' : 'Seleccionar Servicio'}
            </label>
            {formData.tipo_ingreso && formData.tipo_ingreso !== 'otros' ? (
              <select
                name="categoria_id"
                value={formData.categoria_id}
                onChange={e => {
                  handleInputChange(e);
                  // Autocompletar monto al seleccionar servicio
                  const seleccionado = opcionesServicio.find(op => op.id === e.target.value);
                  setFormData(prev => ({
                    ...prev,
                    monto: seleccionado ? seleccionado.precio_particular : ''
                  }));
                }}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar servicio...</option>
                {opcionesServicio.map(servicio => (
                  <option key={servicio.id} value={servicio.id}>
                    {servicio.descripcion}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                name="area_personalizada"
                value={formData.area_personalizada}
                onChange={handleInputChange}
                placeholder="Especificar área o servicio"
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Descripción del Servicio *
            </label>
            <input
              type="text"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleInputChange}
              placeholder="Ej: Consulta medicina general, Hemograma completo..."
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Monto (S/) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">S/</span>
              <input
                type="number"
                name="monto"
                value={formData.monto}
                onChange={handleInputChange}
                step="0.01"
                min="0"
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Método de Pago *
            </label>
            <select
              name="metodo_pago"
              value={formData.metodo_pago}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Seleccionar método...</option>
              {metodosPago.length > 0 ? (
                metodosPago.map(metodo => (
                  <option key={metodo.codigo} value={metodo.codigo}>
                    {metodo.nombre}
                  </option>
                ))
              ) : (
                <option value="efectivo">Efectivo (por defecto)</option>
              )}
            </select>
            {metodosPago.length === 0 && (
              <p className="text-sm text-red-600 mt-1">
                No se pudieron cargar los métodos de pago. Revise la consola para más detalles.
              </p>
            )}
          </div>

          {/* Referencia */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Número de Referencia
              {(formData.metodo_pago !== 'efectivo' && formData.metodo_pago !== 'otros') && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <input
              type="text"
              name="referencia"
              value={formData.referencia}
              onChange={handleInputChange}
              placeholder="Nº operación, voucher, etc."
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Paciente */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Nombre del Paciente
            </label>
            <input
              type="text"
              name="paciente_nombre"
              value={formData.paciente_nombre}
              onChange={handleInputChange}
              placeholder="Nombre completo del paciente"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Observaciones */}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Observaciones
            </label>
            <textarea
              name="observaciones"
              value={formData.observaciones}
              onChange={handleInputChange}
              rows="3"
              placeholder="Notas adicionales sobre este ingreso..."
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={() => navigate('/contabilidad/ingresos')}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-all"
            disabled={guardando}
          >
            Cancelar
          </button>
          <button
            onClick={guardarIngreso}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            disabled={guardando}
          >
            {guardando ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Guardando...
              </>
            ) : (
              <>
                <FaSave />
                Registrar Ingreso
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}