

import { useEffect, useState, useCallback } from "react";
import RecepcionModulo from "../cobro/RecepcionModulo";
import { BASE_URL } from "../../config/config";
import { Icon } from '@fluentui/react';
import QuickAccessNav from "../comunes/QuickAccessNav";

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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {/* Nombre y fecha */}
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-white/20 rounded-xl backdrop-blur-sm flex-shrink-0">
                  <Icon iconName="Hospital" className="text-lg text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold drop-shadow-lg leading-tight">
                    ¡Bienvenido, {usuario?.nombre} {usuario?.apellido || ""}!
                  </h1>
                  <p className="text-xs text-white/80">
                    {formatearFecha()} &mdash; Panel de Control{clinicName ? ` · ${clinicName}` : ''}
                  </p>
                </div>
              </div>

              {/* Mini-stats inline */}
              <div className="flex flex-wrap gap-2 sm:gap-2 mt-1 sm:mt-0">
                <div className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition rounded-lg px-2.5 py-1.5">
                  <Icon iconName="People" className="text-sm text-white/80" />
                  <div>
                    <p className="text-base font-bold text-white leading-none">{estadisticas.pacientesHoy}</p>
                    <p className="text-[10px] text-white/70 leading-none">Atendidos hoy</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition rounded-lg px-2.5 py-1.5">
                  <Icon iconName="Health" className="text-sm text-white/80" />
                  <div>
                    <p className="text-base font-bold text-white leading-none">{estadisticas.consultasHoy}</p>
                    <p className="text-[10px] text-white/70 leading-none">Consultas hoy</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition rounded-lg px-2.5 py-1.5">
                  <Icon iconName="Contact" className="text-sm text-white/80" />
                  <div>
                    <p className="text-base font-bold text-white leading-none">{estadisticas.totalPacientes}</p>
                    <p className="text-[10px] text-white/70 leading-none">Pacientes</p>
                  </div>
                </div>
                {ultimaHC && (
                  <div className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition rounded-lg px-2.5 py-1.5">
                    <Icon iconName="DocumentSearch" className="text-sm text-white/80" />
                    <div>
                      <p className="text-base font-bold text-white leading-none font-mono">{ultimaHC}</p>
                      <p className="text-[10px] text-white/70 leading-none">Última HC</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accesos rápidos */}
      <QuickAccessNav keys={["pacientes", "recordatorios", "listaConsultas", "cotizaciones", "reporteCaja"]} className="mb-4" />

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

