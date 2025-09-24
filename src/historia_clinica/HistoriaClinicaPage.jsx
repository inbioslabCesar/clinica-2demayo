import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BASE_URL } from "../config/config";
import TabsApoyoDiagnostico from "../components/TabsApoyoDiagnostico";
import FormularioHistoriaClinica from "../components/FormularioHistoriaClinica";
import TriajePaciente from "../components/TriajePaciente";
import DatosPaciente from "../components/DatosPaciente";
import DiagnosticoCIE10Selector from "../components/DiagnosticoCIE10Selector";
import TratamientoPaciente from "../components/TratamientoPaciente";

function HistoriaClinicaPage() {
  const { pacienteId, consultaId } = useParams();
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
        if (data.success && Array.isArray(data.ordenes)) setOrdenesLab(data.ordenes);
        else setOrdenesLab([]);
      })
      .catch(() => setOrdenesLab([]));
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

  if (loading) return <div className="p-4">Cargando historia clínica...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!paciente) return <div className="p-4">No se encontró el paciente.</div>;

  return (
    <div
      className="max-w-2xl mx-auto p-4 bg-white rounded shadow mt-6"
      style={{ maxHeight: "80vh", overflowY: "auto" }}
    >
      <h2 className="text-2xl font-bold mb-4 text-center">Historia Clínica</h2>
      {/* Datos básicos en dos columnas */}
      <DatosPaciente paciente={paciente} />
      {/* Secciones estructuradas para la historia clínica */}
      <hr className="my-4" />
      <TriajePaciente triaje={triaje} />

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
        className="space-y-4"
      >

        <FormularioHistoriaClinica hc={hc} setHc={setHc} />

        {/* Laboratorio y Apoyo al Diagnóstico */}
        <h3 className="text-lg font-semibold mb-2 mt-4">
          Laboratorio y Apoyo al Diagnóstico
        </h3>
        <TabsApoyoDiagnostico
          consultaId={consultaId}
          resultadosLab={resultadosLab}
          ordenesLab={ordenesLab}
        />


        {/* Editor de diagnósticos */}
        <DiagnosticoCIE10Selector
          diagnosticos={diagnosticos}
          setDiagnosticos={setDiagnosticos}
        />

        

        {/* Editor y tabla de receta médica (unificado) */}
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

        {/* boton guardar */}
        <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-2">
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded order-1 sm:order-none"
            disabled={guardando}
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <div className="text-right text-xs text-gray-500 order-2 sm:order-none w-full sm:w-auto">
            FIRMA Y SELLO/MÉDICO
          </div>
        </div>
        {msg && (
          <div className="mt-2 text-center text-green-700 font-semibold">
            {msg}
          </div>
        )}
      </form>
    </div>
  );
}

export default HistoriaClinicaPage;
