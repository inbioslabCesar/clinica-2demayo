import { useEffect, useState } from "react";
import { authFetch } from "../utils/apiClient";

// Fase 1: contenedor del módulo. Confirma contra el backend que el módulo está habilitado (guardia real);
// la búsqueda por DNI, la línea de tiempo y la generación de consultas llegan en las fases siguientes.
export default function SeguimientoClinicoPage() {
  const [estado, setEstado] = useState({ cargando: true, activo: false, error: "" });

  useEffect(() => {
    let cancelado = false;
    authFetch("api_seguimiento_clinico.php?accion=estado", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelado) return;
        setEstado({ cargando: false, activo: res.ok && data?.success === true, error: res.ok ? "" : data?.error || "No disponible" });
      })
      .catch(() => {
        if (!cancelado) setEstado({ cargando: false, activo: false, error: "No se pudo verificar el módulo" });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-blue-800">Seguimiento Clínico</h1>
      <p className="mb-4 text-sm text-gray-600">Historial cronológico del paciente y generación de consultas de seguimiento.</p>
      {estado.cargando && <p className="text-sm text-gray-500">Verificando módulo...</p>}
      {!estado.cargando && estado.activo && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          El módulo está habilitado para esta clínica. Las herramientas de búsqueda por DNI y seguimiento se incorporarán en las próximas fases.
        </div>
      )}
      {!estado.cargando && !estado.activo && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          {estado.error || "El módulo no está disponible."}
        </div>
      )}
    </div>
  );
}
