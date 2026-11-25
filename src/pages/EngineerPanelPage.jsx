import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  engineerActualizar,
  engineerEstado,
  engineerListar,
  engineerLogin,
  engineerLogout,
  engineerPortalPacientesOpciones,
} from "../api/modulosApi";
import { ThemeProvider } from "../context/ThemeContext";

const PersonalizacionVisual = lazy(() => import("../components/engineer/PersonalizacionVisual.jsx"));
const SuscripcionPanel = lazy(() => import("../components/engineer/SuscripcionPanel.jsx"));

const NOMBRES = {
  clinico: "Sistema clínico",
  ocupacional: "Salud ocupacional",
  portal_empresas: "Portal de empresas",
  portal_pacientes: "Portal del paciente",
};

const ESTADO_EFECTIVO = {
  activo: { texto: "Activo", clase: "bg-green-100 text-green-800" },
  gracia: { texto: "En gracia", clase: "bg-yellow-100 text-yellow-800" },
  suspendido: { texto: "Suspendido", clase: "bg-red-100 text-red-800" },
  apagado: { texto: "Apagado", clase: "bg-gray-200 text-gray-700" },
};

function aFormulario(m) {
  return {
    habilitado: Number(m.habilitado) === 1,
    estado: m.estado || "activo",
    plan: m.plan || "",
    precio: m.precio ?? "",
    moneda: m.moneda || "PEN",
    fecha_inicio: m.fecha_inicio || "",
    fecha_fin: m.fecha_fin || "",
    notas: m.notas || "",
  };
}

// Qué categorías muestra el portal del paciente (solo el Engineer lo cambia). Cada una incluye los resultados del sistema
// y los archivos PDF/imagen que el personal suba y publique.
function OpcionesPortalPacientes({ opciones, csrf, onGuardado, onSesionExpirada }) {
  const [valores, setValores] = useState({ laboratorio: Boolean(opciones.laboratorio), imagenologia: Boolean(opciones.imagenologia) });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const guardar = async () => {
    setGuardando(true);
    setResultado(null);
    try {
      const r = await engineerPortalPacientesOpciones(csrf, valores);
      if (r.success) {
        const n = Object.keys(r.cambios || {}).length;
        setResultado({ ok: true, texto: n ? "Guardado" : "Sin cambios" });
        onGuardado();
      } else {
        if (r.error === "Sesion no valida") onSesionExpirada();
        setResultado({ ok: false, texto: r.error || "No se pudo guardar" });
      }
    } catch {
      setResultado({ ok: false, texto: "Error de red" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-4 rounded border border-sky-200 bg-sky-50 p-3">
      <h3 className="text-sm font-semibold text-sky-900">¿Qué ve el paciente en su portal?</h3>
      <p className="mb-2 text-xs text-sky-800">
        Lo que se apaga desaparece del portal y deja de poder descargarse. Aplica a los resultados del sistema y a los archivos subidos.
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={valores.laboratorio} onChange={(e) => setValores((v) => ({ ...v, laboratorio: e.target.checked }))} />
          Laboratorio
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={valores.imagenologia} onChange={(e) => setValores((v) => ({ ...v, imagenologia: e.target.checked }))} />
          Imagenología
        </label>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar opciones del portal"}
        </button>
        {resultado ? <span className={resultado.ok ? "text-green-700" : "text-red-700"}>{resultado.texto}</span> : null}
      </div>
    </div>
  );
}

function TarjetaModulo({ modulo, csrf, mensaje, opcionesPortal, onResultado, onGuardado, onSesionExpirada }) {
  const [form, setForm] = useState(() => aFormulario(modulo));
  const [guardando, setGuardando] = useState(false);
  const efectivo = ESTADO_EFECTIVO[modulo.estado_efectivo] || ESTADO_EFECTIVO.apagado;
  const esClinico = modulo.modulo === "clinico";

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  const guardar = async () => {
    setGuardando(true);
    onResultado(modulo.modulo, null);
    try {
      const r = await engineerActualizar(csrf, modulo.modulo, { ...form, habilitado: form.habilitado ? 1 : 0 });
      if (r.success) {
        const n = Object.keys(r.cambios || {}).length;
        onResultado(modulo.modulo, { ok: true, texto: n ? `Guardado (${n} cambio${n === 1 ? "" : "s"})` : "Sin cambios" });
        onGuardado();
      } else {
        if (r.error === "Sesion no valida") onSesionExpirada();
        onResultado(modulo.modulo, { ok: false, texto: r.error || "No se pudo guardar" });
      }
    } catch {
      onResultado(modulo.modulo, { ok: false, texto: "Error de red" });
    } finally {
      setGuardando(false);
    }
  };

  const campo = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{NOMBRES[modulo.modulo] || modulo.modulo}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${efectivo.clase}`}>{efectivo.texto}</span>
      </header>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={form.habilitado} disabled={esClinico} onChange={cambiar("habilitado")} />
          Habilitado {esClinico ? "(siempre activo)" : ""}
        </label>
        <label className="text-sm">
          Estado
          <select className={campo} value={form.estado} onChange={cambiar("estado")}>
            <option value="activo">Activo</option>
            <option value="gracia">Gracia</option>
            <option value="suspendido">Suspendido</option>
          </select>
        </label>
        <label className="text-sm">
          Plan
          <input className={campo} value={form.plan} maxLength={40} onChange={cambiar("plan")} />
        </label>
        <label className="text-sm">
          Precio
          <input className={campo} type="number" min="0" step="0.01" value={form.precio} onChange={cambiar("precio")} />
        </label>
        <label className="text-sm">
          Moneda
          <input className={campo} value={form.moneda} maxLength={3} onChange={cambiar("moneda")} />
        </label>
        <label className="text-sm">
          Inicio
          <input className={campo} type="date" value={form.fecha_inicio} onChange={cambiar("fecha_inicio")} />
        </label>
        <label className="text-sm">
          Vence
          <input className={campo} type="date" value={form.fecha_fin} onChange={cambiar("fecha_fin")} />
        </label>
        <label className="text-sm sm:col-span-2">
          Notas
          <input className={campo} value={form.notas} maxLength={255} onChange={cambiar("notas")} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        {mensaje ? (
          <span className={`text-sm ${mensaje.ok ? "text-green-700" : "text-red-700"}`}>{mensaje.texto}</span>
        ) : null}
      </div>
      {modulo.modulo === "portal_pacientes" && opcionesPortal ? (
        <OpcionesPortalPacientes opciones={opcionesPortal} csrf={csrf} onGuardado={onGuardado} onSesionExpirada={onSesionExpirada} />
      ) : null}
    </section>
  );
}

export default function EngineerPanelPage() {
  const [fase, setFase] = useState("cargando"); // cargando | desactivado | login | panel
  const [csrf, setCsrf] = useState("");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensajes, setMensajes] = useState({});
  const [vista, setVista] = useState("modulos");
  const [datos, setDatos] = useState({ modulos: [], historial: [], gracia_dias: 7, portalOpciones: null });
  const registrarMensaje = useCallback((modulo, mensaje) => {
    setMensajes((m) => ({ ...m, [modulo]: mensaje }));
  }, []);

  useEffect(() => {
    document.title = "Panel";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const cargar = useCallback(async () => {
    const r = await engineerListar();
    if (r.success) {
      setDatos({ modulos: r.modulos || [], historial: r.historial || [], gracia_dias: r.gracia_dias || 7, portalOpciones: r.portal_pacientes_opciones || null });
      setError("");
      return true;
    }
    if (r.status === 401) {
      setFase("login");
      setCsrf("");
      return false;
    }
    setError(r.error || "No se pudo cargar");
    return false;
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const e = await engineerEstado();
        if (!activo) return;
        if (e.desactivado) return setFase("desactivado");
        if (e.autenticado && e.csrf) {
          setCsrf(e.csrf);
          setFase("panel");
          await cargar();
        } else {
          setFase("login");
        }
      } catch {
        if (activo) setFase("desactivado");
      }
    })();
    return () => {
      activo = false;
    };
  }, [cargar]);

  const entrar = async (ev) => {
    ev.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const r = await engineerLogin(password, codigo);
      if (r.success) {
        setPassword("");
        setCodigo("");
        setCsrf(r.csrf);
        setFase("panel");
        await cargar();
      } else {
        setError(r.error || "No se pudo iniciar sesión");
        setCodigo("");
      }
    } catch {
      setError("Error de red");
    } finally {
      setEnviando(false);
    }
  };

  const salir = async () => {
    try {
      await engineerLogout(csrf);
    } finally {
      setCsrf("");
      setFase("login");
    }
  };

  if (fase === "cargando") return <div className="p-8 text-center text-gray-600">Cargando...</div>;
  if (fase === "desactivado") return <div className="p-8 text-center text-gray-600">No encontrado</div>;

  if (fase === "login") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
          <h1 className="text-xl font-semibold">Acceso</h1>
          <label className="block text-sm">
            Contraseña
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Código de 6 dígitos de su app de autenticación
            <input
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={7}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {enviando ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold sm:text-2xl">Panel de la instalación</h1>
          <button type="button" onClick={salir} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            Cerrar sesión
          </button>
        </header>
        <nav className="flex gap-2 overflow-x-auto whitespace-nowrap border-b border-gray-300" aria-label="Secciones">
          {[
            ["modulos", "Módulos y licencias"],
            ["suscripcion", "Suscripción"],
            ["personalizacion", "Personalización"],
          ].map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`-mb-px rounded-t border px-4 py-2 text-sm font-medium ${
                vista === id ? "border-gray-300 border-b-gray-100 bg-gray-100 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {texto}
            </button>
          ))}
        </nav>
        {vista === "suscripcion" ? (
          <Suspense fallback={<div className="p-6 text-center text-gray-600">Cargando...</div>}>
            <SuscripcionPanel csrf={csrf} onSesionExpirada={() => setFase("login")} />
          </Suspense>
        ) : vista === "personalizacion" ? (
          <Suspense fallback={<div className="p-6 text-center text-gray-600">Cargando...</div>}>
            <ThemeProvider>
              <PersonalizacionVisual csrf={csrf} onSesionExpirada={() => setFase("login")} />
            </ThemeProvider>
          </Suspense>
        ) : (
          <>
        <p className="text-sm text-gray-600">
          Al vencer la fecha, el módulo pasa {datos.gracia_dias} días en gracia y luego se suspende. Nunca se borran datos.
        </p>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {datos.modulos.map((m) => (
          <TarjetaModulo
            key={`${m.modulo}-${m.updated_at}-${m.modulo === "portal_pacientes" ? JSON.stringify(datos.portalOpciones) : ""}`}
            modulo={m}
            csrf={csrf}
            mensaje={mensajes[m.modulo]}
            opcionesPortal={datos.portalOpciones}
            onResultado={registrarMensaje}
            onGuardado={cargar}
            onSesionExpirada={() => setFase("login")}
          />
        ))}
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">Historial</h2>
          {datos.historial.length === 0 ? (
            <p className="text-sm text-gray-500">Sin cambios registrados.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-600">
                  <th className="py-1 pr-2">Fecha</th>
                  <th className="py-1 pr-2">Módulo</th>
                  <th className="py-1 pr-2">Acción</th>
                  <th className="py-1">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {datos.historial.map((h, i) => (
                  <tr key={`${h.created_at}-${i}`} className="border-b align-top">
                    <td className="py-1 pr-2 whitespace-nowrap">{h.created_at}</td>
                    <td className="py-1 pr-2">{NOMBRES[h.modulo] || h.modulo}</td>
                    <td className="py-1 pr-2">{h.accion}</td>
                    <td className="py-1 break-all text-xs text-gray-600">{h.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
          </>
        )}
      </div>
    </main>
  );
}
