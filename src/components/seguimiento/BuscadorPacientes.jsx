import { useEffect, useRef, useState } from "react";
import { buscarPacientesSeguimiento } from "../../api/seguimientoClinicoApi";

/** Búsqueda por DNI, nombre o N.º de HC en toda la clínica (sin requerir cita previa con el médico). */
export default function BuscadorPacientes({ onSeleccionar, seleccionadoId }) {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState({ cargando: false, error: "", pacientes: [], mensaje: "" });
  const controlador = useRef(null);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 3) {
      setEstado({ cargando: false, error: "", pacientes: [], mensaje: "" });
      return undefined;
    }
    const temporizador = setTimeout(async () => {
      controlador.current?.abort();
      const c = new AbortController();
      controlador.current = c;
      setEstado((e) => ({ ...e, cargando: true, error: "" }));
      try {
        const r = await buscarPacientesSeguimiento(q, c.signal);
        setEstado({ cargando: false, error: "", pacientes: r.pacientes, mensaje: r.mensaje });
      } catch (e) {
        if (e?.name === "AbortError") return;
        setEstado({ cargando: false, error: e.message || "No se pudo buscar", pacientes: [], mensaje: "" });
      }
    }, 350);
    return () => clearTimeout(temporizador);
  }, [texto]);

  useEffect(() => () => controlador.current?.abort(), []);

  return (
    <div>
      <label htmlFor="seg-buscar" className="mb-1 block text-xs font-semibold text-slate-600">Buscar paciente por DNI, nombre o N.º de HC</label>
      <input
        id="seg-buscar"
        type="search"
        autoComplete="off"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder="Ej: 12345678 o Pérez Ana"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      {estado.cargando && <p className="mt-2 text-xs text-slate-500">Buscando...</p>}
      {estado.error && <p className="mt-2 text-xs text-red-600" role="alert">{estado.error}</p>}
      {!estado.cargando && !estado.error && texto.trim().length >= 3 && estado.pacientes.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">{estado.mensaje || "No se encontraron pacientes."}</p>
      )}
      <ul className="mt-2 space-y-1">
        {estado.pacientes.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSeleccionar(p)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-blue-50 ${seleccionadoId === p.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
            >
              <span className="block font-semibold text-slate-800">{p.nombre}</span>
              <span className="block text-xs text-slate-500">DNI {p.dni || "—"} · HC {p.historia_clinica || "—"}{p.edad ? ` · ${p.edad}` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
