import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import CobroModuloFinal from "../cobro/CobroModuloFinal";
import { BASE_URL } from "../../config/config";

import { useEffect } from "react";

const serviciosBase = [
  { key: "consulta", label: "Consulta Médica", icon: "👨‍⚕️", requiresPayment: false },
  { key: "laboratorio", label: "Laboratorio", icon: "🔬", requiresPayment: true },
  { key: "farmacia", label: "Farmacia", icon: "💊", requiresPayment: true },
  { key: "rayosx", label: "Rayos X", icon: "🩻", requiresPayment: true },
  { key: "ecografia", label: "Ecografía", icon: "🩺", requiresPayment: true },
  { key: "operacion", label: "Operaciones/Cirugías Mayores", icon: "🩼", requiresPayment: true },
  { key: "ocupacional", label: "Medicina Ocupacional", icon: "👷‍⚕️", requiresPayment: true }
];

const EXCLUIR_SERVICIOS = ["consulta", "laboratorio", "farmacia", "ecografia", "rayosx", "ocupacional"];

function ServiciosSelector({ paciente }) {
  const navigate = useNavigate();
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [procedimientos, setProcedimientos] = useState([]);

  useEffect(() => {
    // Obtener servicios de tarifas activos y filtrar los excluidos
    fetch(BASE_URL + "api_tarifas.php", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.tarifas)) {
          const proc = data.tarifas.filter(t =>
            t.activo === 1 && !EXCLUIR_SERVICIOS.includes(t.servicio_tipo)
          ).map(t => ({
            key: t.servicio_tipo + "_" + t.id,
            label: t.descripcion,
            icon: "🛠️",
            requiresPayment: true,
            tarifaId: t.id
          }));
          setProcedimientos(proc);
        }
      });
  }, []);

  const manejarSeleccionServicio = (servicio) => {
    if (servicio.key === "consulta") {
      navigate("/agendar-consulta", { state: { pacienteId: paciente.id } });
    } else if (servicio.key === "laboratorio") {
      navigate(`/cotizar-laboratorio/${paciente.id}`);
    } else if (servicio.key === "farmacia") {
      navigate(`/cotizar-farmacia/${paciente.id}`);
    } else if (servicio.key === "rayosx") {
      navigate(`/cotizar-rayosx/${paciente.id}`);
    } else if (servicio.key === "ecografia") {
      navigate(`/cotizar-ecografia/${paciente.id}`);
    } else if (servicio.key === "operacion") {
      navigate(`/cotizar-operacion/${paciente.id}`);
    } else if (servicio.key === "ocupacional") {
      Swal.fire({
        title: "Página en construcción",
        text: "La funcionalidad de Medicina Ocupacional estará disponible próximamente.",
        icon: "info",
        confirmButtonText: "OK"
      });
    } else if (servicio.key === "procedimiento") {
      // Navegar a la página de cotización de procedimientos (flujo igual que laboratorio)
      navigate(`/cotizar-procedimientos/${paciente.id}`);
    } else if (servicio.requiresPayment) {
      setServicioSeleccionado(servicio);
      setMostrarCobro(true);
    } else {
      registrarAtencion(servicio);
    }
  };

  const manejarCobroCompleto = async (cobroId, servicio) => {
    setMostrarCobro(false);
    Swal.fire({
      title: "💰 Pago Procesado",
      text: `Servicio de ${servicio.label} pagado exitosamente.`,
      icon: "success",
      confirmButtonText: "OK"
    });
  };

  const manejarCancelarCobro = () => {
    setMostrarCobro(false);
    setServicioSeleccionado(null);
  };

  const registrarAtencion = async (servicio) => {
    const usuario = JSON.parse(sessionStorage.getItem("usuario") || "{}");
    if (!usuario.id) {
      Swal.fire("Error", "No se pudo identificar al usuario", "error");
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
          observaciones: ""
        })
      });
      const data = await res.json();
      if (data.success) {
        Swal.fire({
          title: "Atención registrada",
          text: `Atención registrada para ${servicio.label}.`,
          icon: "success",
          confirmButtonText: "OK"
        });
      } else {
        Swal.fire({
          title: "Error", 
          text: data.error || "No se pudo registrar la atención",
          icon: "error",
          confirmButtonText: "OK"
        });
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire("Error", "Error de conexión", "error");
    }
  };

  // Evitar mostrar el módulo de cobros para laboratorio
  if (mostrarCobro && servicioSeleccionado && servicioSeleccionado.key !== "laboratorio") {
    return (
      <CobroModuloFinal
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
        🏥 Seleccionar Servicio para: {paciente.nombre} {paciente.apellido}
      </h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {serviciosBase.map((servicio) => {
          if (servicio.key === "ocupacional") {
            return (
              <button
                key={servicio.key}
                onClick={() => {
                  Swal.fire({
                    title: "Página en construcción",
                    text: "La funcionalidad de Medicina Ocupacional estará disponible próximamente.",
                    icon: "info",
                    confirmButtonText: "OK"
                  });
                }}
                className="flex items-center justify-center gap-2 p-4 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition-colors font-medium text-blue-700 hover:text-blue-800"
              >
                <span className="text-2xl">{servicio.icon}</span>
                <span>{servicio.label}</span>
                {servicio.requiresPayment && (
                  <span className="text-green-600 text-sm">💰</span>
                )}
              </button>
            );
          }
          return (
            <button
              key={servicio.key}
              onClick={() => manejarSeleccionServicio(servicio)}
              className="flex items-center justify-center gap-2 p-4 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 hover:border-blue-400 transition-colors font-medium text-blue-700 hover:text-blue-800"
            >
              <span className="text-2xl">{servicio.icon}</span>
              <span>{servicio.label}</span>
              {servicio.requiresPayment && (
                <span className="text-green-600 text-sm">💰</span>
              )}
            </button>
          );
        })}

        <button
          key="procedimientos"
          onClick={() => manejarSeleccionServicio({ key: "procedimiento", label: "Procedimientos", icon: "🛠️", requiresPayment: true })}
          className="flex items-center justify-center gap-2 p-4 bg-white border border-orange-300 rounded-lg hover:bg-orange-100 hover:border-orange-400 transition-colors font-medium text-orange-700 hover:text-orange-800"
        >
          <span className="text-2xl">🛠️</span>
          <span>Procedimientos</span>
          <span className="text-green-600 text-sm">💰</span>
        </button>
      </div>
      
      <div className="mt-3 text-sm text-gray-600 text-center">
        💰 = Requiere pago previo | 🏥 = Agendar primero, cobrar después
      </div>
    </div>
  );
}

export default ServiciosSelector;
