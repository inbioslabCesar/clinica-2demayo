import { useParams, Link } from "react-router-dom";
import SolicitudLaboratorio from "../components/examenes/SolicitudLaboratorio";


export default function SolicitudLaboratorioPage() {
  const { consultaId } = useParams();
  // Obtener usuario actual desde sessionStorage
  let mostrarPrecios = true;
  try {
    const storedUsuario = sessionStorage.getItem('usuario');
    const storedMedico = sessionStorage.getItem('medico');
    const usuario = storedUsuario ? JSON.parse(storedUsuario) : (storedMedico ? JSON.parse(storedMedico) : null);
    if (usuario && usuario.rol === 'medico') {
      mostrarPrecios = false;
    }
  } catch (e) {
    // Si hay error, mostrar precios por defecto
    mostrarPrecios = true;
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 py-4 sm:py-8 px-2 sm:px-4">
      <div className="max-w-5xl mx-auto bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/60 p-4 sm:p-6 lg:p-8">
        <div className="mb-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Solicitud de Análisis de Laboratorio</h2>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-medium border border-blue-200">
            <span>Consulta ID:</span>
            <span className="font-bold">{consultaId}</span>
          </div>
        </div>

        <SolicitudLaboratorio consultaId={consultaId} mostrarPrecios={mostrarPrecios} />

        <div className="mt-5 text-center">
          <Link
            to={-1}
            className="inline-flex items-center gap-2 text-blue-700 hover:text-blue-800 font-medium hover:underline"
          >
            <span>←</span>
            <span>Volver a la historia clínica</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
