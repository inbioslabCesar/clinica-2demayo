
import React, { useState } from "react";
import TriageList from "./TriageList";
import { Icon } from '@fluentui/react';

// Panel principal para enfermero: navegación entre Triage, Tratamientos y Hospitalización
function EnfermeroPanel() {
  const [tab, setTab] = useState("triage");

  const tabs = [
    {
      key: "triage",
      label: "Triaje",
      icon: "Health",
      color: "emerald",
      description: "Evaluación inicial de pacientes"
    },
    {
      key: "tratamientos",
      label: "Tratamientos",
      icon: "MedicalBreathingTreatment",
      color: "blue",
      description: "Gestión de tratamientos"
    },
    {
      key: "hospitalizacion",
      label: "Hospitalización",
      icon: "Hospital",
      color: "purple",
      description: "Control de hospitalización"
    }
  ];

  const getColorClasses = (color, isActive) => {
    const colors = {
      emerald: isActive 
        ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg border-emerald-300"
        : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300",
      blue: isActive
        ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg border-blue-300"
        : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-300",
      purple: isActive
        ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg border-purple-300"
        : "bg-white text-purple-700 border-purple-200 hover:bg-purple-50 hover:border-purple-300"
    };
    return colors[color];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 rounded-2xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
          {/* Efectos de fondo */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-12 -translate-x-12"></div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl backdrop-blur-sm">
                <Icon iconName="Health" className="text-3xl text-white" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold drop-shadow-lg">
                  Panel de Enfermería
                </h1>
                <p className="text-lg text-white/90 mt-1">
                  Gestión integral de cuidados médicos
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navegación por tabs */}
      <div className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {tabs.map((tabItem) => (
            <button
              key={tabItem.key}
              className={`group relative p-6 rounded-2xl border-2 font-semibold transition-all duration-300 transform hover:scale-[1.02] ${getColorClasses(tabItem.color, tab === tabItem.key)}`}
              onClick={() => setTab(tabItem.key)}
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${tab === tabItem.key ? 'bg-white/20' : `bg-${tabItem.color}-100`}`}>
                  <Icon 
                    iconName={tabItem.icon} 
                    className={`text-2xl ${tab === tabItem.key ? 'text-white' : `text-${tabItem.color}-600`}`} 
                  />
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold">{tabItem.label}</div>
                  <div className={`text-sm ${tab === tabItem.key ? 'text-white/80' : 'text-gray-600'}`}>
                    {tabItem.description}
                  </div>
                </div>
              </div>
              
              {/* Indicador activo */}
              {tab === tabItem.key && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full shadow-lg flex items-center justify-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido de las tabs */}
      <div className="max-w-7xl mx-auto">
        {tab === "triage" && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Icon iconName="Health" className="text-2xl text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Control de Triaje</h2>
                  <p className="text-emerald-100">Evaluación y clasificación de pacientes</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <TriageList />
            </div>
          </div>
        )}
        
        {tab === "tratamientos" && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Icon iconName="MedicalBreathingTreatment" className="text-2xl text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Gestión de Tratamientos</h2>
                  <p className="text-blue-100">Control y seguimiento de tratamientos</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <div className="flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mx-auto mb-4">
                  <Icon iconName="MedicalBreathingTreatment" className="text-4xl text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Módulo en Desarrollo</h3>
                <p className="text-gray-600">La gestión de tratamientos estará disponible próximamente</p>
              </div>
            </div>
          </div>
        )}
        
        {tab === "hospitalizacion" && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Icon iconName="Hospital" className="text-2xl text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Control de Hospitalización</h2>
                  <p className="text-purple-100">Gestión de pacientes hospitalizados</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <div className="flex items-center justify-center w-20 h-20 bg-purple-100 rounded-full mx-auto mb-4">
                  <Icon iconName="Hospital" className="text-4xl text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-2">Módulo en Desarrollo</h3>
                <p className="text-gray-600">El control de hospitalización estará disponible próximamente</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EnfermeroPanel;
