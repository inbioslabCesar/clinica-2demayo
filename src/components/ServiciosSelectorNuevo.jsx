import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import CobroModulo from "./CobroModulo";
import { BASE_URL } from "../config/config";

const serviciosDisponibles = [
  { key: "consulta", label: "Consulta Médica", icon: "🩺", requiresPayment: true },
  { key: "laboratorio", label: "Laboratorio", icon: "🧪", requiresPayment: true },
  { key: "farmacia", label: "Farmacia", icon: "💊", requiresPayment: true },
  { key: "rayosx", label: "Rayos X", icon: "🦴", requiresPayment: true },
  { key: "ecografia", label: "Ecografía", icon: "📡", requiresPayment: true },
  { key: "ocupacional", label: "Medicina Ocupacional", icon: "👷", requiresPayment: true }
];

// Se espera que usuario_id esté disponible en localStorage/session o como prop
function ServiciosSelector({ paciente }) {
  const navigate = useNavigate();
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);
  const [mostrarCobro, setMostrarCobro] = useState(false);

  const manejarSeleccionServicio = (servicio) => {
    if (servicio.requiresPayment) {
      // Mostrar módulo de cobros
      setServicioSeleccionado(servicio);
      setMostrarCobro(true);
    } else {
      // Proceder directamente sin cobro
      registrarAtencion(servicio);
    }
  };

  const manejarCobroCompleto = async (cobroId, servicio) => {
    setMostrarCobro(false);
    
    // Proceder según el tipo de servicio
    if (servicio.key === "consulta") {
      Swal.fire({
        title: '✅ Pago Procesado',
        text: '¿Desea agendar la consulta médica ahora?',
        icon: 'success',
        showCancelButton: true,
        confirmButtonText: 'Sí, agendar',
        cancelButtonText: 'No, solo cobrar'
      }).then((result) => {
        if (result.isConfirmed) {
          navigate("/agendar-consulta", { 
            state: { 
              pacienteId: paciente.id,
              cobroId: cobroId
            }
          });
        }
      });
    } else {
      Swal.fire({
        title: '✅ Pago Procesado',
        text: `Servicio de ${servicio.label} pagado exitosamente. El paciente puede dirigirse al área correspondiente.`,
        icon: 'success',
        confirmButtonText: 'OK'
      });
    }
  };

  const manejarCancelarCobro = () => {
    setMostrarCobro(false);
    setServicioSeleccionado(null);
  };

  const registrarAtencion = async (servicio) => {
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    
    if (!usuario.id) {
      Swal.fire('Error', 'No se pudo identificar al usuario', 'error');
      return;
    }

    try {
      const res = await fetch(BASE_URL + "api_atenciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paciente_id: paciente.id,
          usuario_id: usuario.id,
          servicio: servicio.key,
          observaciones: ''
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        Swal.fire({
          title: 'Atención registrada',
          text: `Atención registrada para ${servicio.label}.`,
          icon: 'success',
          confirmButtonText: 'OK'
        });
      } else {
        Swal.fire({
          title: 'Error',
          text: data.error || 'No se pudo registrar la atención',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  if (mostrarCobro && servicioSeleccionado) {
    return (
      <CobroModulo
        paciente={paciente}
        servicio={servicioSeleccionado}
        onCobroCompleto={manejarCobroCompleto}
        onCancelar={manejarCancelarCobro}
      />
    );
  }

  return (
    <div className="mt-4 p-4 bg-blue-50 rounded border border-blue-200">
      <h3 className="text-lg font-semibold mb-3 text-blue-800">
        💼 Seleccionar Servicio para: {paciente.nombre} {paciente.apellido}
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {serviciosDisponibles.map((servicio) => (
          <button
            key={servicio.key}
            onClick={() => manejarSeleccionServicio(servicio)}
            className="flex items-center justify-center gap-2 p-4 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition-colors font-medium text-blue-700 hover:text-blue-800"
          >
            <span className="text-2xl">{servicio.icon}</span>
            <span>{servicio.label}</span>
            {servicio.requiresPayment && (
              <span className="text-green-600 text-sm">💳</span>
            )}
          </button>
        ))}
      </div>
      
      <div className="mt-3 text-sm text-gray-600 text-center">
        💳 = Requiere pago previo | Seleccione el servicio para continuar
      </div>
    </div>
  );
}

export default ServiciosSelector;