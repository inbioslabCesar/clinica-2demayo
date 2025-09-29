

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import RecepcionModulo from "./RecepcionModulo";
import { BASE_URL } from "../config/config";
import { Icon } from '@fluentui/react';

function Dashboard({ usuario }) {
  const [ultimaHC, setUltimaHC] = useState(null);
  const [estadisticas, setEstadisticas] = useState({
    pacientesHoy: 0,
    consultasHoy: 0,
    totalPacientes: 0
  });
  const location = useLocation();

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
    
    // También actualizar estadísticas cuando se registre un nuevo paciente
    obtenerEstadisticas();
  }, [obtenerEstadisticas]);

  useEffect(() => {
    actualizarUltimaHC();
    obtenerEstadisticas();
  }, [usuario, location.pathname, actualizarUltimaHC, obtenerEstadisticas]);

  const formatearFecha = () => {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-6 lg:p-8">
      {/* Header Moderno */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-2xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
          {/* Efectos de fondo */}
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-20 translate-x-20"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl backdrop-blur-sm">
                <Icon iconName="Hospital" className="text-3xl text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold drop-shadow-lg">
                  ¡Bienvenido, {usuario?.nombre || "Usuario"}!
                </h1>
                <p className="text-lg text-white/90 mt-1">
                  {formatearFecha()}
                </p>
              </div>
            </div>
            <p className="text-xl text-white/95 font-medium">
              Panel de Control - Clínica 2 de Mayo
            </p>
          </div>
        </div>
      </div>

      {/* Tarjetas de Estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="group bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-cyan-100 hover:border-cyan-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl">
              <Icon iconName="People" className="text-2xl text-white" />
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-800">{estadisticas.pacientesHoy}</p>
              <p className="text-sm text-gray-500">Hoy</p>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-1">Pacientes Atendidos</h3>
          <p className="text-sm text-gray-600">En el día de hoy</p>
        </div>

        <div className="group bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-emerald-100 hover:border-emerald-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-500 rounded-xl">
              <Icon iconName="Health" className="text-2xl text-white" />
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-800">{estadisticas.consultasHoy}</p>
              <p className="text-sm text-gray-500">Hoy</p>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-1">Consultas Médicas</h3>
          <p className="text-sm text-gray-600">En el día de hoy</p>
        </div>

        <div className="group bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border border-purple-100 hover:border-purple-200 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-xl">
              <Icon iconName="Contact" className="text-2xl text-white" />
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-800">{estadisticas.totalPacientes}</p>
              <p className="text-sm text-gray-500">Total</p>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-1">Pacientes Registrados</h3>
          <p className="text-sm text-gray-600">En la base de datos</p>
        </div>
      </div>

      {/* Última Historia Clínica */}
      {ultimaHC && (
        <div className="mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-amber-100">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl">
                <Icon iconName="DocumentSearch" className="text-2xl text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Última Historia Clínica</h3>
                <p className="text-gray-600">Registro más reciente en el sistema</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 bg-amber-100 rounded-lg">
                  <Icon iconName="NumberField" className="text-lg text-amber-700" />
                </div>
                <span className="text-lg font-mono font-bold text-amber-800">{ultimaHC}</span>
                <span className="text-sm text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                  HC #{ultimaHC}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Módulo de Recepción Modernizado */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm">
              <Icon iconName="ContactCard" className="text-2xl text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Atención en Recepción</h2>
              <p className="text-indigo-100">Gestión de pacientes y servicios</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <RecepcionModulo onPacienteRegistrado={actualizarUltimaHC} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

