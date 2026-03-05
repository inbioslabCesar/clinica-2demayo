import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import { useLocation, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function SeleccionarServicioPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState(null);
  const qs = new URLSearchParams(location.search);
  const pacienteId = location.state?.pacienteId || qs.get('paciente_id');
  const cobroId = qs.get('cobro_id');
  const rutaVolver = useMemo(() => {
    const fromState = location.state?.backTo || location.state?.from;
    const fromQuery = qs.get('back_to');
    const candidata = (typeof fromState === 'string' && fromState.trim())
      ? fromState.trim()
      : (typeof fromQuery === 'string' && fromQuery.trim() ? fromQuery.trim() : '');

    if (candidata && candidata.startsWith('/')) return candidata;
    if (pacienteId) return '/pacientes';
    return '/';
  }, [location.state, pacienteId, qs]);
  const textoVolver = rutaVolver === '/pacientes' ? 'Volver a Pacientes' : 'Volver al Dashboard';

    const [procedimientos, setProcedimientos] = useState([]);

    useEffect(() => {
      // Obtener servicios de tarifas activos y filtrar los excluidos
      fetch(BASE_URL + "api_tarifas.php", { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (data.success && Array.isArray(data.tarifas)) {
            const EXCLUIR_SERVICIOS = ["consulta", "laboratorio", "farmacia", "ecografia", "rayosx", "ocupacional"];
            const proc = data.tarifas.filter(t =>
              t.activo === 1 && !EXCLUIR_SERVICIOS.includes(t.servicio_tipo)
            ).map(t => ({
              key: t.servicio_tipo + "_" + t.id,
              label: t.descripcion,
              tarifaId: t.id
            }));
            setProcedimientos(proc);
          }
        });
    }, []);

  useEffect(() => {
    if (pacienteId) {
      fetch(`${BASE_URL}api_pacientes.php?id=${pacienteId}`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.paciente) {
            setPaciente(data.paciente);
          } else {
            setPaciente(null);
          }
        });
    }
  }, [pacienteId]);

  // Aquí puedes mostrar los servicios disponibles
  // Por ejemplo: Consulta médica, Laboratorio, Farmacia, etc.
  // Al seleccionar uno, navega a la página correspondiente y pasa el pacienteId

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1500px] mx-auto px-4 lg:px-6 py-4">
        <div className="bg-gradient-to-r from-purple-600 to-blue-400 rounded-t-xl p-5 md:p-6 mb-0">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><span>🗂️</span> Atención en Recepción</h2>
          <p className="text-white text-sm">Gestión de pacientes y servicios</p>
        </div>
        <div className="bg-white rounded-b-xl shadow p-4 md:p-5">
          <button
            className="bg-blue-500 text-white px-4 py-2 rounded font-bold hover:bg-blue-600 mb-4"
            onClick={() => navigate(rutaVolver)}
          >{textoVolver}</button>
          {paciente ? (
            <div className="bg-blue-50 rounded-lg p-4 md:p-5 mb-4">
              <div className="font-bold text-blue-800 mb-2">Paciente encontrado:</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 text-sm md:text-base">
                <div>
                  <div><b>Nombre:</b> {paciente.nombre}</div>
                  <div><b>Apellido:</b> {paciente.apellido}</div>
                  <div><b>DNI:</b> {paciente.dni}</div>
                  <div><b>Fecha de nacimiento:</b> {paciente.fecha_nacimiento}</div>
                  <div><b>Sexo:</b> {paciente.sexo}</div>
                  <div><b>Dirección:</b> {paciente.direccion}</div>
                  <div><b>Teléfono:</b> {paciente.telefono}</div>
                  <div><b>Email:</b> {paciente.email}</div>
                  <div><b>Tipo de seguro:</b> {paciente.tipo_seguro}</div>
                </div>
                <div>
                  <div><b>Historia Clínica:</b> {paciente.historia_clinica}</div>
                  <div><b>Edad:</b> {/* Muestra edad si existe, si no la calcula */}
                    {paciente.edad
                      ? paciente.edad + ' años'
                      : paciente.fecha_nacimiento
                        ? (() => {
                            const fecha = new Date(paciente.fecha_nacimiento);
                            return !isNaN(fecha)
                              ? Math.floor((new Date() - fecha) / (365.25 * 24 * 60 * 60 * 1000)) + ' años'
                              : 'Edad no disponible';
                          })()
                        : 'Edad no disponible'}
                  </div>
                  <div><b>Procedencia:</b> {paciente.procedencia}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 mb-4">Busca un paciente por DNI para mostrar los servicios.</div>
          )}
          {paciente && (
            <div className="bg-blue-50 rounded-lg p-4 md:p-5 mb-2">
              <div className="font-semibold text-blue-700 mb-2 flex items-center gap-2"><span>🔽</span> Seleccionar Servicio para: <span className="text-black">{paciente.nombre} {paciente.apellido}</span></div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 auto-rows-fr">
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-blue-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/agendar-consulta${cobroId ? `?cobro_id=${cobroId}` : ''}`, { state: { pacienteId: paciente.id } })}
                ><span>👨‍⚕️</span><span className="whitespace-normal">Consulta Médica</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-green-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-laboratorio/${paciente.id}`)}
                ><span>🧪</span><span className="whitespace-normal">Laboratorio</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-purple-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-farmacia/${paciente.id}`)}
                ><span>💊</span><span className="whitespace-normal">Farmacia</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-blue-50 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-rayosx/${paciente.id}`)}
                ><span>🩻</span><span className="whitespace-normal">Rayos X</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-blue-50 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-ecografia/${paciente.id}`)}
                ><span>🩺</span><span className="whitespace-normal">Ecografías</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-orange-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-procedimientos/${paciente.id}`)}
                ><span>🛠️</span><span className="whitespace-normal">Procedimientos</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-blue-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-operacion/${paciente.id}`)}
                ><span>🩼</span><span className="whitespace-normal">Operaciones/Cirugías Mayores</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-blue-50 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => {
                    Swal.fire({
                      title: "Página en construcción",
                      text: "La funcionalidad de Medicina Ocupacional estará disponible próximamente.",
                      icon: "info",
                      confirmButtonText: "OK"
                    });
                  }}
                ><span>👨‍⚕️</span><span className="whitespace-normal">Medicina Ocupacional</span> <span className="text-yellow-500">💰</span></button>
              </div>
              <div className="mt-2 text-xs text-gray-500 flex gap-4 items-center">
                <span>💰 = Requiere pago previo</span>
                <span>📅 = Agendar primero, cobrar después</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
