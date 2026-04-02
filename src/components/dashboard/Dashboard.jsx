

import { useEffect, useState, useCallback } from "react";
import RecepcionModulo from "../cobro/RecepcionModulo";
import { BASE_URL } from "../../config/config";
import { Icon } from '@fluentui/react';

function Dashboard({ usuario }) {
  const [ultimaHC, setUltimaHC] = useState(null);
  const [clinicName, setClinicName] = useState('');
  const [estadisticas, setEstadisticas] = useState({
    pacientesHoy: 0,
    consultasHoy: 0,
    totalPacientes: 0
  });

  // Función para obtener estadísticas reales desde la API
  const obtenerEstadisticas = useCallback(async () => {
    try {
      const response = await fetch(BASE_URL + "api_estadisticas_dashboard.php");
      const data = await response.json();
      
      if (data.success) {
        setEstadisticas({
          pacientesHoy: data.estadisticas.pacientes_hoy,
          consultasHoy: data.estadisticas.consultas_hoy,
          totalPacientes: data.estadisticas.total_pacientes
        });
      } else {
        console.error('Error al obtener estadísticas:', data.error);
        // Mantener valores por defecto en caso de error
        setEstadisticas({
          pacientesHoy: 0,
          consultasHoy: 0,
          totalPacientes: 0
        });
      }
    } catch (error) {
      console.error('Error de conexión al obtener estadísticas:', error);
      // Mantener valores por defecto en caso de error
      setEstadisticas({
        pacientesHoy: 0,
        consultasHoy: 0,
        totalPacientes: 0
      });
    }
  }, []);

  // Función para actualizar la última HC desde RecepcionModulo
  const actualizarUltimaHC = useCallback(() => {
    fetch(BASE_URL + "api_ultima_hc.php")
      .then(res => res.json())
      .then(data => {
        if (data.success) setUltimaHC(data.ultima_hc);
      });
  }, [obtenerEstadisticas]);

  useEffect(() => {
    actualizarUltimaHC();
    obtenerEstadisticas();
  }, [usuario?.id, actualizarUltimaHC, obtenerEstadisticas]);

  useEffect(() => {
    fetch(BASE_URL + "api_get_configuracion.php", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data?.success && data.data?.nombre_clinica) {
          setClinicName(String(data.data.nombre_clinica).trim());
        }
      })
      .catch(() => {});
  }, []);

  const formatearFecha = () => {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date());
  };

  return (
    <div
      className="min-h-screen p-3 sm:p-4 lg:p-5"
      style={{
        background: "linear-gradient(135deg, var(--color-primary-light) 0%, #eef2ff 55%, #f8fafc 100%)",
      }}
    >
      {/* Header Moderno */}
      <div className="mb-4">
        <div
          className="rounded-2xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden"
          style={{
            background:
              "linear-gradient(90deg, var(--color-primary) 0%, var(--color-secondary) 55%, var(--color-accent) 100%)",
          }}
        >
          {/* Efectos de fondo */}
          <div className="absolute top-0 right-0 w-28 h-28 bg-white/10 rounded-full -translate-y-14 translate-x-14"></div>
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-10 -translate-x-10"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center w-11 h-11 bg-white/20 rounded-xl backdrop-blur-sm">
                <Icon iconName="Hospital" className="text-xl text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold drop-shadow-lg leading-tight">
                  ¡Bienvenido, {usuario?.nombre} {usuario?.apellido || ""}!
                </h1>
                <p className="text-sm sm:text-base text-white/90 mt-1">
                  {formatearFecha()}
                </p>
              </div>
            </div>
            <p className="text-sm sm:text-base text-white/95 font-medium">
              Panel de Control{clinicName ? ` - ${clinicName}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="group bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border"
          style={{ borderColor: "var(--color-primary-light)" }}>
          <div className="flex items-center justify-between mb-2">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))" }}
            >
              <Icon iconName="People" className="text-lg text-white" />
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-800 leading-tight">{estadisticas.pacientesHoy}</p>
              <p className="text-xs text-gray-500">Hoy</p>
            </div>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Pacientes Atendidos</h3>
          <p className="text-xs text-gray-600">En el dia de hoy</p>
        </div>

        <div className="group bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border"
          style={{ borderColor: "var(--color-primary-light)" }}>
          <div className="flex items-center justify-between mb-2">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ background: "linear-gradient(135deg, var(--color-secondary), var(--color-accent))" }}
            >
              <Icon iconName="Health" className="text-lg text-white" />
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-800 leading-tight">{estadisticas.consultasHoy}</p>
              <p className="text-xs text-gray-500">Hoy</p>
            </div>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Consultas Medicas</h3>
          <p className="text-xs text-gray-600">En el dia de hoy</p>
        </div>

        <div className="group bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 border sm:col-span-2 lg:col-span-1"
          style={{ borderColor: "var(--color-primary-light)" }}>
          <div className="flex items-center justify-between mb-2">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-lg"
              style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-primary))" }}
            >
              <Icon iconName="Contact" className="text-lg text-white" />
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-gray-800 leading-tight">{estadisticas.totalPacientes}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">Pacientes Registrados</h3>
          <p className="text-xs text-gray-600">En la base de datos</p>
        </div>
      </div>

      {/* Última Historia Clínica */}
      {ultimaHC && (
        <div className="mb-4">
          <div className="bg-white rounded-xl p-3 shadow-sm border" style={{ borderColor: "var(--color-primary-light)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-lg"
                style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))" }}
              >
                <Icon iconName="DocumentSearch" className="text-base text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">Ultima Historia Clinica</h3>
                <p className="text-xs text-gray-600">Registro mas reciente</p>
              </div>
            </div>
            <div className="rounded-lg p-2 border" style={{ background: "var(--color-primary-light)", borderColor: "var(--color-primary-light)" }}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-md bg-white/80">
                  <Icon iconName="NumberField" className="text-sm" style={{ color: "var(--color-secondary)" }} />
                </div>
                <span className="text-base font-mono font-bold" style={{ color: "var(--color-secondary)" }}>{ultimaHC}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-white/80" style={{ color: "var(--color-secondary)" }}>
                  HC #{ultimaHC}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Módulo de Recepción Modernizado */}
      <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div
          className="p-4 text-white"
          style={{
            background:
              "linear-gradient(90deg, var(--color-secondary) 0%, var(--color-primary) 100%)",
          }}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-xl backdrop-blur-sm">
              <Icon iconName="ContactCard" className="text-lg text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Atencion en Recepcion</h2>
              <p className="text-sm text-indigo-100">Gestion de pacientes y servicios</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <RecepcionModulo onPacienteRegistrado={actualizarUltimaHC} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

