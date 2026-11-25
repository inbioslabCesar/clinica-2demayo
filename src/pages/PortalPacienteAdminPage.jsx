import { useCallback, useEffect, useState } from "react";
import { APP_BASE_PATH } from "../config/config";
import {
  buscarPacientesPortal,
  decidirDocumentoPortal,
  desactivarAccesoPortal,
  generarPinPortal,
  guardarConfigPortal,
  obtenerConfigPortal,
  obtenerPacientePortal,
} from "../api/portalPacienteAdminApi";

const ESTADOS = {
  disponible: { texto: "Disponible", clase: "bg-green-100 text-green-800" },
  pendiente_pago: { texto: "Saldo pendiente", clase: "bg-amber-100 text-amber-800" },
  en_revision: { texto: "En revisión", clase: "bg-gray-200 text-gray-700" },
};

const TIPOS = { laboratorio: "Laboratorio", imagenologia: "Imagenología" };

function urlPortal() {
  return new URL("resultados", `${window.location.origin}${APP_BASE_PATH}`).href;
}

function enlaceWhatsapp(paciente, pin) {
  let tel = String(paciente.telefono || "").replace(/\D/g, "");
  if (tel.length === 9) tel = `51${tel}`;
  if (tel.length < 11) return "";
  const texto =
    `Hola ${paciente.nombre}, ya puede ver y descargar sus resultados en ${urlPortal()}\n` +
    `Documento: ${paciente.dni}\nPIN: ${pin}\nNo comparta este PIN.`;
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
}

function formatearFecha(valor) {
  const fecha = new Date(String(valor || "").replace(" ", "T"));
  return Number.isNaN(fecha.getTime()) ? "" : fecha.toLocaleDateString("es-PE");
}

function OpcionesClinica({ config, puedeEditar, onGuardar }) {
  const [modo, setModo] = useState(config.modo);
  const [bloquear, setBloquear] = useState(config.bloquear_deuda);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setModo(config.modo);
    setBloquear(config.bloquear_deuda);
  }, [config]);

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(modo, bloquear);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="rounded-xl bg-white p-4 shadow">
      <h2 className="font-semibold text-gray-800 mb-3">Opciones de la clínica</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-gray-700">
          Liberación de resultados
          <select
            value={modo}
            onChange={(e) => setModo(e.target.value)}
            disabled={!puedeEditar}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="automatico">Automática (al completarse el resultado)</option>
            <option value="manual">Manual (el personal libera cada resultado)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 sm:mt-6">
          <input type="checkbox" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} disabled={!puedeEditar} />
          Bloquear la descarga si el paciente tiene saldo pendiente
        </label>
      </div>
      {puedeEditar ? (
        <button type="button" onClick={guardar} disabled={guardando} className="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-white hover:bg-sky-800 disabled:opacity-60">
          {guardando ? "Guardando..." : "Guardar opciones"}
        </button>
      ) : (
        <p className="mt-2 text-xs text-gray-500">Solo el administrador puede cambiar estas opciones.</p>
      )}
    </section>
  );
}

function PinGenerado({ paciente, resultado, onCerrar }) {
  const wa = enlaceWhatsapp(paciente, resultado.pin);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado.pin);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="rounded-xl border-2 border-sky-300 bg-sky-50 p-4">
      <p className="text-sm text-gray-700">PIN nuevo para <strong>{paciente.nombre} {paciente.apellido}</strong> (documento {resultado.documento}):</p>
      <p className="my-2 text-4xl font-bold tracking-[0.3em] text-sky-900">{resultado.pin}</p>
      <p className="text-xs text-red-700 mb-3">Anótelo o envíelo ahora: por seguridad no se vuelve a mostrar. Si se pierde, genere uno nuevo.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copiar} className="rounded-lg border border-sky-600 px-3 py-1.5 text-sm text-sky-800 hover:bg-sky-100">
          {copiado ? "Copiado" : "Copiar PIN"}
        </button>
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
            Enviar por WhatsApp
          </a>
        ) : (
          <span className="text-xs text-gray-600 self-center">Sin teléfono válido para WhatsApp: entregue el PIN en persona.</span>
        )}
        <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-white">Cerrar</button>
      </div>
    </div>
  );
}

export default function PortalPacienteAdminPage() {
  const [config, setConfig] = useState(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState([]);
  const [seleccion, setSeleccion] = useState(null); // { paciente, documentos }
  const [pinNuevo, setPinNuevo] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const manejarError = useCallback((err) => {
    setError(err.message || "No se pudo completar la operación");
    setMensaje("");
  }, []);

  useEffect(() => {
    obtenerConfigPortal()
      .then((p) => {
        setConfig(p.data);
        setPuedeEditar(Boolean(p.puede_editar));
      })
      .catch(manejarError);
  }, [manejarError]);

  const buscar = async (e) => {
    e.preventDefault();
    setError("");
    setOcupado(true);
    try {
      setResultados(await buscarPacientesPortal(q.trim()));
    } catch (err) {
      manejarError(err);
    } finally {
      setOcupado(false);
    }
  };

  const abrirPaciente = useCallback(async (pacienteId, { conservarPin = false } = {}) => {
    setError("");
    if (!conservarPin) setPinNuevo(null);
    try {
      const p = await obtenerPacientePortal(pacienteId);
      setSeleccion({ paciente: p.paciente, documentos: p.documentos });
      setConfig(p.config);
    } catch (err) {
      manejarError(err);
    }
  }, [manejarError]);

  const guardarConfig = async (modo, bloquear) => {
    setError("");
    try {
      const p = await guardarConfigPortal(modo, bloquear);
      setConfig(p.data);
      setMensaje("Opciones guardadas.");
      if (seleccion) await abrirPaciente(seleccion.paciente.id);
    } catch (err) {
      manejarError(err);
    }
  };

  const generarPin = async () => {
    const tieneAcceso = seleccion.paciente.acceso_estado === "activo";
    if (tieneAcceso && !window.confirm("El paciente ya tiene un PIN. Si genera uno nuevo, el anterior dejará de funcionar. ¿Continuar?")) return;
    setError("");
    setMensaje("");
    setOcupado(true);
    try {
      setPinNuevo(await generarPinPortal(seleccion.paciente.id));
      await abrirPaciente(seleccion.paciente.id, { conservarPin: true });
    } catch (err) {
      manejarError(err);
    } finally {
      setOcupado(false);
    }
  };

  const desactivar = async () => {
    if (!window.confirm("¿Desactivar el acceso del paciente al portal?")) return;
    try {
      await desactivarAccesoPortal(seleccion.paciente.id);
      setMensaje("Acceso desactivado.");
      await abrirPaciente(seleccion.paciente.id);
    } catch (err) {
      manejarError(err);
    }
  };

  const decidir = async (doc, decision) => {
    setError("");
    try {
      const p = await decidirDocumentoPortal(seleccion.paciente.id, doc.tipo, doc.ref_id, decision);
      setSeleccion((prev) => ({ ...prev, documentos: p.documentos }));
    } catch (err) {
      manejarError(err);
    }
  };

  const p = seleccion?.paciente;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold text-sky-900">Portal del paciente</h1>
        <p className="text-sm text-gray-600">
          Entregue el PIN y controle qué resultados puede descargar el paciente en{" "}
          <span className="font-mono">{urlPortal()}</span>
        </p>
      </header>

      {error ? <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      {mensaje ? <p className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{mensaje}</p> : null}

      {config ? <OpcionesClinica config={config} puedeEditar={puedeEditar} onGuardar={guardarConfig} /> : null}

      <section className="rounded-xl bg-white p-4 shadow">
        <form onSubmit={buscar} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por DNI, historia clínica o nombre"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
          />
          <button type="submit" disabled={ocupado || q.trim().length < 2} className="rounded-lg bg-sky-700 px-4 py-2 text-white hover:bg-sky-800 disabled:opacity-60">
            Buscar
          </button>
        </form>
        {resultados.length > 0 ? (
          <ul className="mt-3 divide-y">
            {resultados.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{r.nombre} {r.apellido}</p>
                  <p className="text-xs text-gray-500">DNI {r.dni} · HC {r.historia_clinica}{r.acceso_estado === "activo" ? " · con acceso" : ""}</p>
                </div>
                <button type="button" onClick={() => abrirPaciente(r.id)} className="rounded-lg border border-sky-600 px-3 py-1.5 text-sm text-sky-800 hover:bg-sky-50">
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {p ? (
        <section className="space-y-4 rounded-xl bg-white p-4 shadow">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{p.nombre} {p.apellido}</h2>
              <p className="text-sm text-gray-600">DNI {p.dni} · HC {p.historia_clinica} · Tel. {p.telefono || "—"}</p>
              <p className="text-sm text-gray-600">
                Acceso: <strong>{p.acceso_estado === "activo" ? "activo" : p.acceso_estado === "inactivo" ? "desactivado" : "sin PIN"}</strong>
                {p.pin_generado_at ? ` · PIN generado ${formatearFecha(p.pin_generado_at)} por ${p.pin_generado_por || "—"}` : ""}
                {p.ultimo_login_at ? ` · último ingreso ${formatearFecha(p.ultimo_login_at)}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={generarPin} disabled={ocupado} className="rounded-lg bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800 disabled:opacity-60">
                {p.acceso_estado ? "Generar PIN nuevo" : "Generar PIN"}
              </button>
              {p.acceso_estado === "activo" ? (
                <button type="button" onClick={desactivar} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
                  Desactivar acceso
                </button>
              ) : null}
            </div>
          </div>

          {pinNuevo ? <PinGenerado paciente={p} resultado={pinNuevo} onCerrar={() => setPinNuevo(null)} /> : null}

          <div>
            <h3 className="mb-2 font-semibold text-gray-800">Resultados del paciente</h3>
            {seleccion.documentos.length === 0 ? (
              <p className="text-sm text-gray-600">No hay resultados completados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-600">
                      <th className="py-2 pr-2">Tipo</th>
                      <th className="py-2 pr-2">Documento</th>
                      <th className="py-2 pr-2">Fecha</th>
                      <th className="py-2 pr-2">Lo ve el paciente</th>
                      <th className="py-2">Decisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seleccion.documentos.map((d) => {
                      const estado = ESTADOS[d.estado] || ESTADOS.en_revision;
                      const manual = config?.modo === "manual";
                      return (
                        <tr key={`${d.tipo}:${d.ref_id}`} className="border-b align-top">
                          <td className="py-2 pr-2">{TIPOS[d.tipo] || d.tipo}</td>
                          <td className="py-2 pr-2">{d.titulo}<span className="block text-xs text-gray-500">{d.subtitulo}</span></td>
                          <td className="py-2 pr-2 whitespace-nowrap">{formatearFecha(d.fecha)}</td>
                          <td className="py-2 pr-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.clase}`}>{estado.texto}</span>
                            {d.pendiente_motivo ? (
                              <span className="block text-xs text-gray-600">
                                {d.pendiente_motivo === "borrador"
                                  ? "El informe sigue en borrador: complételo en Imagenología."
                                  : "Informe completado, pero falta generar el PDF en Imagenología."}
                              </span>
                            ) : null}
                            {d.saldo_pendiente > 0 ? <span className="block text-xs text-amber-700">Saldo S/ {Number(d.saldo_pendiente).toFixed(2)}</span> : null}
                          </td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1.5">
                              {d.decision_manual !== "liberado" && (d.decision_manual === "retenido" || manual) ? (
                                <button type="button" onClick={() => decidir(d, "liberado")} className="rounded border border-green-600 px-2 py-1 text-xs text-green-700 hover:bg-green-50">Liberar</button>
                              ) : null}
                              {d.decision_manual !== "retenido" && (d.decision_manual === "liberado" || !manual) ? (
                                <button type="button" onClick={() => decidir(d, "retenido")} className="rounded border border-red-400 px-2 py-1 text-xs text-red-700 hover:bg-red-50">Retener</button>
                              ) : null}
                              {d.decision_manual !== "automatico" ? (
                                <button type="button" onClick={() => decidir(d, "automatico")} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">Volver a automático</button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Liberar no salta el bloqueo por saldo pendiente: el paciente debe regularizar su pago en caja.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
