import { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import { useLocation, useNavigate } from "react-router-dom";
import { BASE_URL } from "../config/config";

export default function SeleccionarServicioPage() {
  const themeGradient = {
    backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
  };
  const themePrimarySoft = {
    backgroundColor: "var(--color-primary-light)",
    color: "var(--color-primary-dark)",
  };
  const themePrimaryBorder = {
    borderColor: "var(--color-primary-light)",
  };
  const normalizarServicio = (value) => {
    const base = String(value || "").toLowerCase().trim();
    if (!base) return "otros";
    if (base === "rayos_x" || base === "rayos x") return "rayosx";
    if (base === "operaciones") return "operacion";
    if (base === "procedimientos") return "procedimiento";
    return base;
  };

  const labelServicio = (tipo) => {
    const t = normalizarServicio(tipo);
    if (t === "laboratorio") return "Laboratorio";
    if (t === "farmacia") return "Farmacia";
    if (t === "rayosx") return "Rayos X";
    if (t === "ecografia") return "Ecografía";
    if (t === "procedimiento") return "Procedimientos";
    if (t === "operacion") return "Operaciones";
    if (t === "consulta") return "Consulta";
    return "Otros";
  };

  const location = useLocation();
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState(null);
  const [resumenServicios, setResumenServicios] = useState([]);
  const [totalCotizacion, setTotalCotizacion] = useState(0);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const qs = new URLSearchParams(location.search);
  const pacienteId = location.state?.pacienteId || qs.get('paciente_id');
  const cobroId = qs.get('cobro_id');
  const cotizacionId = location.state?.cotizacionId || qs.get('cotizacion_id');
  const isEditCotizacion = Boolean(cotizacionId);
  const editSuffix = isEditCotizacion ? `?cotizacion_id=${cotizacionId}&modo=editar&back_to=/seleccionar-servicio` : '';
  const consultaSuffix = isEditCotizacion
    ? `?paciente_id=${paciente?.id || pacienteId}&cotizacion_id=${cotizacionId}&modo=editar&back_to=/cotizaciones`
    : (cobroId ? `?cobro_id=${cobroId}` : '');
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
  const textoVolver = rutaVolver === '/pacientes'
    ? 'Volver a Pacientes'
    : rutaVolver === '/cotizaciones'
      ? 'Volver a Cotizaciones'
      : 'Volver al Dashboard';

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

  useEffect(() => {
    if (!isEditCotizacion || !cotizacionId) {
      setResumenServicios([]);
      setTotalCotizacion(0);
      return;
    }

    setLoadingResumen(true);
    fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const cot = data?.cotizacion;
        if (!data?.success || !cot) {
          setResumenServicios([]);
          setTotalCotizacion(0);
          return;
        }

        const detalles = Array.isArray(cot.detalles) ? cot.detalles : [];
        const map = {};
        for (const d of detalles) {
          const tipo = normalizarServicio(d?.servicio_tipo);
          if (!map[tipo]) {
            map[tipo] = { tipo, label: labelServicio(tipo), items: 0, total: 0 };
          }
          map[tipo].items += 1;
          map[tipo].total += Number(d?.subtotal || 0);
        }

        const resumen = Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
        setResumenServicios(resumen);
        setTotalCotizacion(Number(cot?.total || 0));
      })
      .catch(() => {
        setResumenServicios([]);
        setTotalCotizacion(0);
      })
      .finally(() => setLoadingResumen(false));
  }, [isEditCotizacion, cotizacionId]);

  // Aquí puedes mostrar los servicios disponibles
  // Por ejemplo: Consulta médica, Laboratorio, Farmacia, etc.
  // Al seleccionar uno, navega a la página correspondiente y pasa el pacienteId

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-[1500px] mx-auto px-4 lg:px-6 py-4">
        <div className="rounded-t-xl p-5 md:p-6 mb-0" style={themeGradient}>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><span>🗂️</span> Atención en Recepción</h2>
          <p className="text-white text-sm">Gestión de pacientes y servicios</p>
        </div>
        <div className="bg-white rounded-b-xl shadow p-4 md:p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              className="text-white px-4 py-2 rounded font-bold"
              style={themeGradient}
              onClick={() => navigate(isEditCotizacion ? '/cotizaciones' : (rutaVolver === '/pacientes' ? -1 : rutaVolver))}
            >{isEditCotizacion ? 'Volver a Cotizaciones' : textoVolver}</button>
          </div>
          {paciente ? (
            <div className="rounded-lg p-4 md:p-5 mb-4" style={themePrimarySoft}>
              <div className="font-bold mb-2" style={{ color: "var(--color-primary-dark)" }}>Paciente encontrado:</div>
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
            <div className="rounded-lg p-4 md:p-5 mb-2" style={themePrimarySoft}>
              <div className="font-semibold mb-2 flex items-center gap-2" style={{ color: "var(--color-primary-dark)" }}><span>🔽</span> Seleccionar Servicio para: <span className="text-black">{paciente.nombre} {paciente.apellido}</span></div>
              {isEditCotizacion && (
                <div className="mb-3 text-xs bg-yellow-100 text-yellow-800 px-3 py-2 rounded border border-yellow-300">
                  Editando cotización #{cotizacionId}. Puedes navegar entre servicios para agregar o quitar ítems en la misma cotización.
                </div>
              )}
              {isEditCotizacion && (
                <div className="mb-4 bg-white border rounded-lg p-3" style={themePrimaryBorder}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold" style={{ color: "var(--color-primary-dark)" }}>Resumen actual de servicios</div>
                    <div className="text-xs font-semibold text-green-700">Total: S/ {Number(totalCotizacion || 0).toFixed(2)}</div>
                  </div>
                  {loadingResumen ? (
                    <div className="text-xs text-gray-500">Cargando resumen...</div>
                  ) : resumenServicios.length === 0 ? (
                    <div className="text-xs text-gray-500">Sin ítems en la cotización.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {resumenServicios.map((s) => (
                        <span key={s.tipo} className="text-xs border rounded px-2 py-1" style={{ ...themePrimarySoft, ...themePrimaryBorder }}>
                          {s.label}: {s.items} item(s) | S/ {Number(s.total || 0).toFixed(2)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 auto-rows-fr">
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white font-semibold text-sm md:text-[15px] leading-tight text-center"
                  style={themePrimaryBorder}
                  onClick={() => navigate(`/agendar-consulta${consultaSuffix}`, {
                    state: {
                      pacienteId: paciente.id,
                      cotizacionId: isEditCotizacion ? Number(cotizacionId) : null,
                      backTo: isEditCotizacion ? "/cotizaciones" : undefined,
                      modo: isEditCotizacion ? "editar" : undefined,
                    },
                  })}
                ><span>👨‍⚕️</span><span className="whitespace-normal">Consulta Médica</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-green-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-laboratorio/${paciente.id}${editSuffix}`)}
                ><span>🧪</span><span className="whitespace-normal">Laboratorio</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-purple-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-farmacia/${paciente.id}${editSuffix}`)}
                ><span>💊</span><span className="whitespace-normal">Farmacia</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white font-semibold text-sm md:text-[15px] leading-tight text-center"
                  style={themePrimaryBorder}
                  onClick={() => navigate(`/cotizar-rayosx/${paciente.id}${editSuffix}`)}
                ><span>🩻</span><span className="whitespace-normal">Rayos X</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white font-semibold text-sm md:text-[15px] leading-tight text-center"
                  style={themePrimaryBorder}
                  onClick={() => navigate(`/cotizar-ecografia/${paciente.id}${editSuffix}`)}
                ><span>🩺</span><span className="whitespace-normal">Ecografías</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white hover:bg-orange-100 font-semibold text-sm md:text-[15px] leading-tight text-center"
                  onClick={() => navigate(`/cotizar-procedimientos/${paciente.id}${editSuffix}`)}
                ><span>🛠️</span><span className="whitespace-normal">Procedimientos</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white font-semibold text-sm md:text-[15px] leading-tight text-center"
                  style={themePrimaryBorder}
                  onClick={() => navigate(`/cotizar-operacion/${paciente.id}${editSuffix}`)}
                ><span>🩼</span><span className="whitespace-normal">Operaciones/Cirugías Mayores</span> <span className="text-yellow-500">💰</span></button>
                <button
                  className="h-full flex items-center gap-2 justify-center border rounded-lg min-h-[64px] py-3 px-3 bg-white font-semibold text-sm md:text-[15px] leading-tight text-center"
                  style={themePrimaryBorder}
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
