import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";
import TabsApoyoDiagnostico from "../components/TabsApoyoDiagnostico";
import FormularioHistoriaClinica from "../components/FormularioHistoriaClinica";
import TriajePaciente from "../components/TriajePaciente";
import DatosPaciente from "../components/DatosPaciente";
import DiagnosticoCIE10Selector from "../components/DiagnosticoCIE10Selector";
import TratamientoPaciente from "../components/TratamientoPaciente";
import ImpresionHistoriaClinica from "../components/print/ImpresionHistoriaClinica";
import ImpresionAnalisisLaboratorio from "../components/print/ImpresionAnalisisLaboratorio";
import ImpresionRecetaMedicamentos from "../components/print/ImpresionRecetaMedicamentos";
import { usePrintHistoriaClinica, usePrintLaboratorio, usePrintReceta } from "../hooks/usePrint";

function HistoriaClinicaPage() {
  const { pacienteId, consultaId } = useParams();
  
  // Hook para impresión de Historia Clínica
  const { componentRef: printRef, handlePrint: handlePrintHC } = usePrintHistoriaClinica();
  
  // Hook para impresión de Análisis de Laboratorio
  const { componentRef: printLabRef, handlePrint: handlePrintLab } = usePrintLaboratorio();
  
  // Hook para impresión de Receta de Medicamentos
  const { componentRef: printRecetaRef, handlePrint: handlePrintReceta } = usePrintReceta();
  
  // Estados para datos médicos y configuración
  const [medicoInfo, setMedicoInfo] = useState(null);
  const [configuracionClinica, setConfiguracionClinica] = useState(null);
  
  // Resultados de laboratorio
  const [resultadosLab, setResultadosLab] = useState([]);
  // Órdenes de laboratorio (exámenes solicitados)
  const [ordenesLab, setOrdenesLab] = useState([]);

  // Cargar resultados de laboratorio por consulta
  useEffect(() => {
    if (!consultaId) return;
    fetch(`${BASE_URL}api_resultados_laboratorio.php?consulta_id=${consultaId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.resultados) setResultadosLab(data.resultados);
        else setResultadosLab([]);
      })
      .catch(() => setResultadosLab([]));
    // Cargar órdenes de laboratorio (exámenes solicitados)
    fetch(`${BASE_URL}api_ordenes_laboratorio.php?consulta_id=${consultaId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.ordenes)) {
          setOrdenesLab(data.ordenes);
        } else {
          setOrdenesLab([]);
        }
      })
      .catch((error) => {
        console.error('Error al cargar órdenes de laboratorio:', error);
        setOrdenesLab([]);
      });
  }, [consultaId]);
  const [paciente, setPaciente] = useState(null);
  const [triaje, setTriaje] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Historia clínica editable
  const [hc, setHc] = useState({
    tiempo_enfermedad: "",
    forma_inicio: "",
    curso: "",
    antecedentes: "",
    examen_fisico: "",
    tratamiento: "",
    receta: [],
  });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  // Diagnósticos CIE10
  const [diagnosticos, setDiagnosticos] = useState([]);
  // Cargar datos de historia clínica editable
  useEffect(() => {
    if (!consultaId) return;
    fetch(`${BASE_URL}api_historia_clinica.php?consulta_id=${consultaId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.datos) {
          setHc({
            ...data.datos,
            receta: Array.isArray(data.datos.receta) ? data.datos.receta : [],
          });
          if (Array.isArray(data.datos.diagnosticos)) {
            setDiagnosticos(data.datos.diagnosticos);
          } else {
            setDiagnosticos([]);
          }
        }
      });
  }, [consultaId]);

  useEffect(() => {
    if (!pacienteId) return;
    setLoading(true);
    fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.paciente) setPaciente(data.paciente);
        else setError(data.error || "No se encontró el paciente");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, [pacienteId]);

  // Cargar triaje por consulta_id si existe
  useEffect(() => {
    if (!consultaId) return;
    fetch(`${BASE_URL}api_triaje.php?consulta_id=${consultaId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.triaje && data.triaje.datos)
          setTriaje(data.triaje.datos);
        else setTriaje(null);
      })
      .catch(() => setTriaje(null));
  }, [consultaId]);

  // Cargar información del médico desde sessionStorage
  useEffect(() => {
    const medicoSession = JSON.parse(sessionStorage.getItem('medico') || 'null');
    if (medicoSession) {
      setMedicoInfo(medicoSession);
    }
  }, []);

  // Cargar configuración de la clínica
  useEffect(() => {
    fetch(`${BASE_URL}api_get_configuracion.php`, { 
      credentials: 'include' 
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setConfiguracionClinica(data.data);
        }
      })
      .catch(() => setConfiguracionClinica(null));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/50 flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 font-medium">🏥 Cargando historia clínica...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-red-200 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
        <p className="text-red-600">{error}</p>
      </div>
    </div>
  );
  
  if (!paciente) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-gray-200 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paciente no encontrado</h3>
        <p className="text-gray-600">No se encontró información del paciente.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-4 sm:py-8 px-2 sm:px-4 overflow-x-hidden">
      <div className="max-w-6xl mx-auto w-full">
        {/* Header profesional de Historia Clínica */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8 mb-6 border border-white/50 w-full">
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-blue-800 to-indigo-800 bg-clip-text text-transparent">
                📋 Historia Clínica
              </h1>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">Sistema Médico Integral - Clínica 2 de Mayo</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-100 to-blue-100 rounded-full flex-shrink-0">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs sm:text-sm font-medium text-gray-700">En línea</span>
            </div>
          </div>
        </div>
        {/* Datos básicos del paciente en tarjeta moderna */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">👤 Información del Paciente</h2>
          </div>
          <DatosPaciente paciente={paciente} />
        </div>

        {/* Triaje en tarjeta moderna */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">🚨 Triaje y Signos Vitales</h2>
          </div>
          <TriajePaciente triaje={triaje} />
        </div>

        {/* Formulario principal de Historia Clínica */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setGuardando(true);
            setMsg("");
            // Asegura que receta y diagnosticos siempre estén actualizados
            const datos = { ...hc, diagnosticos, receta: hc.receta };
            const res = await fetch(`${BASE_URL}api_historia_clinica.php`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ consulta_id: consultaId, datos }),
            });
            const data = await res.json();
            setGuardando(false);
            setMsg(
              data.success
                ? "Guardado correctamente"
                : data.error || "Error al guardar"
            );
          }}
          className="space-y-6"
        >
          {/* Anamnesis y Examen Físico */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-violet-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">📝 Anamnesis y Examen Físico</h2>
            </div>
            <FormularioHistoriaClinica hc={hc} setHc={setHc} />
          </div>

          {/* Laboratorio y Apoyo Diagnóstico */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">🔬 Laboratorio y Apoyo Diagnóstico</h2>
            </div>
            <TabsApoyoDiagnostico
              consultaId={consultaId}
              resultadosLab={resultadosLab}
              ordenesLab={ordenesLab}
            />
          </div>

          {/* Diagnósticos CIE10 */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">🩺 Diagnósticos CIE10</h2>
            </div>
            <DiagnosticoCIE10Selector
              diagnosticos={diagnosticos}
              setDiagnosticos={setDiagnosticos}
            />
          </div>

          {/* Tratamiento y Receta Médica */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-800">💊 Tratamiento y Receta Médica</h2>
            </div>
            <TratamientoPaciente
              receta={hc.receta || []}
              setReceta={(recetaNueva) =>
                setHc((h) => ({
                  ...h,
                  receta:
                    typeof recetaNueva === 'function'
                      ? recetaNueva(h.receta)
                      : recetaNueva,
                }))
              }
              tratamiento={hc.tratamiento || ""}
              setTratamiento={valor => setHc(h => ({ ...h, tratamiento: valor }))}
            />
          </div>

          {/* Botones de Acción y Footer Profesional */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex flex-col gap-4">
              {/* Grupo de botones principales */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm whitespace-nowrap"
                  disabled={guardando}
                >
                  {guardando ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      <span>💾 Guardar HC</span>
                    </>
                  )}
                </button>

                {/* Botón de imprimir Historia Clínica completa */}
                <button
                  type="button"
                  onClick={() => {
                    if (printRef.current) {
                      handlePrintHC();
                    } else {
                      console.warn('Referencia de impresión no disponible');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>🖨️ HC</span>
                </button>

                {/* Botón de imprimir Análisis de Laboratorio */}
                <button
                  type="button"
                  onClick={() => {
                    if (printLabRef.current && ordenesLab && ordenesLab.length > 0) {
                      handlePrintLab();
                    } else {
                      console.warn('Referencia de laboratorio no disponible o sin órdenes de laboratorio');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  disabled={!ordenesLab || ordenesLab.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span>🔬 Lab</span>
                </button>

                {/* Botón de imprimir Receta de Medicamentos */}
                <button
                  type="button"
                  onClick={() => {
                    if (printRecetaRef.current && hc.receta && hc.receta.length > 0) {
                      handlePrintReceta();
                    } else {
                      console.warn('Referencia de receta no disponible o sin medicamentos');
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl font-semibold transition-all duration-200 hover:scale-105 shadow-lg text-sm whitespace-nowrap"
                  disabled={!hc.receta || hc.receta.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span>💊 Receta</span>
                </button>
              </div>
              
              <div className="text-center w-full mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">Firma Digital</span>
                </div>
                <div className="border-t-2 border-gray-300 pt-2 max-w-xs mx-auto">
                  <div className="text-xs text-gray-500 font-medium">FIRMA Y SELLO MÉDICO</div>
                  <div className="text-xs text-gray-400 mt-1">Sistema Médico Digitalizado</div>
                </div>
              </div>
            </div>
            
            {/* Mensaje de estado */}
            {msg && (
              <div className={`mt-4 p-4 rounded-xl border text-center font-medium ${
                msg.includes('correctamente') 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center justify-center gap-2">
                  {msg.includes('correctamente') ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {msg}
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Componente oculto para impresión de Historia Clínica */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printRef}>
          <ImpresionHistoriaClinica
            paciente={paciente}
            triaje={triaje}
            hc={hc}
            diagnosticos={diagnosticos}
            medicoInfo={medicoInfo}
            configuracionClinica={configuracionClinica}
          />
        </div>
      </div>

      {/* Componente oculto para impresión de Análisis de Laboratorio */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printLabRef}>
          <ImpresionAnalisisLaboratorio
            paciente={paciente}
            ordenesLaboratorio={ordenesLab}
            medicoInfo={medicoInfo}
            configuracionClinica={configuracionClinica}
          />
        </div>
      </div>

      {/* Componente oculto para impresión de Receta de Medicamentos */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div ref={printRecetaRef}>
          <ImpresionRecetaMedicamentos
            paciente={paciente}
            medicamentos={hc.receta}
            medicoInfo={medicoInfo}
            configuracionClinica={configuracionClinica}
          />
        </div>
      </div>
    </div>
  );
}

export default HistoriaClinicaPage;
