import { useEffect, useState } from "react";
import { estadoSeguimiento } from "../api/seguimientoClinicoApi";
import BuscadorPacientes from "../components/seguimiento/BuscadorPacientes";
import GenerarConsulta from "../components/seguimiento/GenerarConsulta";
import LineaTiempo from "../components/seguimiento/LineaTiempo";
import MiAgenda from "../components/seguimiento/MiAgenda";

// Seguimiento clínico (módulo opcional): búsqueda en toda la clínica, historial cronológico, detalle completo bajo demanda (cada apertura
// queda registrada), agenda del médico y generación de consultas de seguimiento (con cobro o sin cobro/exonerada).
export default function SeguimientoClinicoPage() {
  const [modulo, setModulo] = useState({ cargando: true, activo: false, error: "", medicoId: 0 });
  const [paciente, setPaciente] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelado = false;
    estadoSeguimiento()
      .then((r) => !cancelado && setModulo({ cargando: false, activo: r?.success === true, error: "", medicoId: Number(r?.medico_id || 0) }))
      .catch((e) => !cancelado && setModulo({ cargando: false, activo: false, error: e.message || "No se pudo verificar el módulo", medicoId: 0 }));
    return () => {
      cancelado = true;
    };
  }, []);

  if (modulo.cargando) return <p className="p-6 text-sm text-gray-500">Verificando módulo...</p>;
  if (!modulo.activo) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          {modulo.error || "El módulo no está disponible."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-bold text-blue-800">Seguimiento Clínico</h1>
      <p className="mb-5 text-sm text-gray-600">Busca a cualquier paciente de la clínica y revisa su historial completo. Cada apertura de historial queda registrada.</p>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <BuscadorPacientes onSeleccionar={setPaciente} seleccionadoId={paciente?.id} />
          </div>
          {modulo.medicoId > 0 && <MiAgenda key={`agenda-${version}`} medicoId={modulo.medicoId} />}
        </aside>

        <section className="min-w-0">
          {!paciente && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Selecciona un paciente para ver su historial cronológico.
            </div>
          )}
          {paciente && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-lg font-bold text-blue-900">{paciente.nombre}</p>
                <p className="text-xs text-blue-800">
                  DNI {paciente.dni || "—"} · HC {paciente.historia_clinica || "—"}{paciente.sexo ? ` · ${paciente.sexo === "F" ? "Femenino" : "Masculino"}` : ""}{paciente.edad ? ` · ${paciente.edad}` : ""}
                </p>
              </div>
              {modulo.medicoId > 0 && (
                <GenerarConsulta key={`generar-${paciente.id}`} paciente={paciente} medicoId={modulo.medicoId} onGenerada={() => setVersion((v) => v + 1)} />
              )}
              <LineaTiempo key={`${paciente.id}-${version}`} paciente={paciente} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
