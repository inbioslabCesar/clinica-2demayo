import { useCallback, useEffect, useMemo, useState } from "react";
import { FaCalendarAlt, FaChevronDown, FaDownload, FaFlask, FaLock, FaSearch, FaSignOutAlt, FaXRay } from "react-icons/fa";
import { BASE_URL, fetchConfigSingleton } from "../../config/config";
import {
  descargarDocumentoPaciente,
  listarDocumentosPaciente,
  loginPaciente,
  logoutPaciente,
  sesionPaciente,
} from "../../api/pacientePortalApi";
import { agruparPorAtencion, categoriasPresentes } from "../../utils/agruparResultados";

const ESTADOS = {
  disponible: { texto: "Disponible", clase: "bg-green-100 text-green-800" },
  pendiente_pago: { texto: "Saldo pendiente", clase: "bg-amber-100 text-amber-800" },
  en_revision: { texto: "En revisión", clase: "bg-gray-200 text-gray-700" },
};

const AYUDA_ESTADO = {
  en_revision: "La clínica lo habilitará en breve.",
};

const ETIQUETA_CATEGORIA = { laboratorio: "Laboratorio", imagenologia: "Imagenología" };
const GRUPOS_VISIBLES = 5;

// Colores de la clínica: los configura el Engineer (ThemeProvider los publica como variables CSS). Los valores de
// respaldo solo se usan si el tema aún no cargó.
const COLOR = {
  primario: "var(--color-primary, #0369a1)",
  oscuro: "var(--color-primary-dark, #075985)",
  claro: "var(--color-primary-light, #e0f2fe)",
  secundario: "var(--color-secondary, #0c4a6e)",
};
const ESTILO_FONDO_MARCA = { backgroundImage: `linear-gradient(135deg, ${COLOR.primario} 0%, ${COLOR.secundario} 100%)` };
const ESTILO_BOTON = { ...ESTILO_FONDO_MARCA, color: "#fff" };
const ESTILO_FOCO = { "--tw-ring-color": COLOR.primario };

function formatearFecha(valor) {
  const fecha = new Date(String(valor || "").replace(" ", "T"));
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Con varias atenciones el mismo día, la hora las distingue.
function formatearFechaHora(valor) {
  const fecha = new Date(String(valor || "").replace(" ", "T"));
  if (Number.isNaN(fecha.getTime())) return "";
  return `${formatearFecha(valor)}, ${fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

// Nombre y logo de la clínica (configuración pública), para que la página se sienta parte del sitio web.
function useMarcaClinica() {
  const [marca, setMarca] = useState({ nombre: "", logo: "" });
  useEffect(() => {
    let activo = true;
    fetchConfigSingleton().then((respuesta) => {
      const cfg = respuesta?.data;
      if (!activo || !cfg) return;
      const nombre = String(cfg.nombre_clinica || "").trim();
      const bruto = String(cfg.logo_url || "").trim();
      const logo = !bruto ? "" : /^(https?:|data:|blob:)/i.test(bruto) ? bruto : `${BASE_URL}${bruto.replace(/^\/+/, "")}`;
      setMarca({ nombre, logo });
      if (nombre) document.title = `Mis resultados - ${nombre}`;
    });
    return () => {
      activo = false;
    };
  }, []);
  return marca;
}

function Marco({ children }) {
  const marca = useMarcaClinica();
  const [logoFallo, setLogoFallo] = useState(false);
  const inicial = (marca.nombre || "C").charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header style={ESTILO_FONDO_MARCA} className="px-4 pb-16 pt-8 text-white">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg ring-4 ring-white/30">
            {marca.logo && !logoFallo ? (
              <img src={marca.logo} alt={marca.nombre || "Clínica"} onError={() => setLogoFallo(true)} className="h-full w-full object-contain" />
            ) : (
              <span className="text-3xl font-bold" style={{ color: COLOR.primario }} aria-hidden="true">{inicial}</span>
            )}
          </div>
          {marca.nombre ? <p className="mt-3 text-xl font-bold leading-tight sm:text-2xl">{marca.nombre}</p> : null}
          <p className="mt-1 text-sm text-white/85">Portal de resultados en línea</p>
        </div>
      </header>

      <main className="mx-auto -mt-10 w-full max-w-2xl flex-1 px-4 pb-10">{children}</main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-500">
        {marca.nombre ? `© ${new Date().getFullYear()} ${marca.nombre}. ` : ""}Sus resultados son confidenciales.
      </footer>
    </div>
  );
}

function Tarjeta({ children, className = "" }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function LoginPaciente({ onIngreso }) {
  const [documento, setDocumento] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const payload = await loginPaciente(documento.trim(), pin.trim());
      onIngreso(payload.paciente);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const claseCampo = "mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg focus:border-transparent focus:outline-none focus:ring-2";

  return (
    <Marco>
      <Tarjeta className="p-6 sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: COLOR.claro, color: COLOR.oscuro }}>
          <FaLock aria-hidden="true" />
        </div>
        <h1 className="text-center text-2xl font-bold text-slate-900">Mis resultados</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-600">
          Ingrese con su documento y el PIN de 6 dígitos que le entregó la clínica.
        </p>
        <form onSubmit={enviar} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Documento (DNI)
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              className={claseCampo}
              style={ESTILO_FOCO}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              pattern="\d{6}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className={`${claseCampo} tracking-[0.5em]`}
              style={ESTILO_FOCO}
              required
            />
          </label>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
          <button
            type="submit"
            disabled={enviando}
            style={ESTILO_BOTON}
            className="w-full rounded-xl px-4 py-3 font-semibold shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          ¿No tiene PIN o lo olvidó? Solicítelo en recepción presentando su documento.
        </p>
      </Tarjeta>
    </Marco>
  );
}

function IconoCategoria({ categoria }) {
  const Icono = categoria === "imagenologia" ? FaXRay : FaFlask;
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: COLOR.claro, color: COLOR.oscuro }}>
      <Icono aria-hidden="true" />
    </span>
  );
}

function ListaResultados({ paciente, onSalir, onSesionExpirada }) {
  const [documentos, setDocumentos] = useState(null);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState("");
  const [aviso, setAviso] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState({}); // id de atención -> abierta (por defecto solo la más reciente)
  const [verTodas, setVerTodas] = useState(false);

  const categorias = useMemo(() => categoriasPresentes(documentos), [documentos]);
  const grupos = useMemo(() => agruparPorAtencion(documentos, { categoria, busqueda }), [documentos, categoria, busqueda]);
  const hayFiltro = categoria !== "todas" || busqueda.trim() !== "";
  const gruposMostrados = verTodas || hayFiltro ? grupos : grupos.slice(0, GRUPOS_VISIBLES);
  const estaAbierto = (g, indice) => (g.id in abiertos ? abiertos[g.id] : indice === 0 || hayFiltro);
  const nombre = String(paciente?.nombre || "").trim();

  const cargar = useCallback(async () => {
    try {
      setDocumentos(await listarDocumentosPaciente());
    } catch (err) {
      if (err.status === 401) {
        onSesionExpirada();
        return;
      }
      setError(err.message);
    }
  }, [onSesionExpirada]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const descargar = async (doc) => {
    const clave = `${doc.tipo}:${doc.ref_id}`;
    setAviso("");
    setDescargando(clave);
    try {
      await descargarDocumentoPaciente(doc.tipo, doc.ref_id);
    } catch (err) {
      if (err.status === 401) {
        onSesionExpirada();
        return;
      }
      setAviso(err.message);
      if (err.estado) cargar();
    } finally {
      setDescargando("");
    }
  };

  return (
    <Marco>
      <Tarjeta className="mb-4 flex items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold"
            style={{ backgroundColor: COLOR.claro, color: COLOR.oscuro }}
            aria-hidden="true"
          >
            {(nombre.charAt(0) || "P").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mis resultados</p>
            <p className="truncate text-base font-semibold text-slate-900">{nombre || "Paciente"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSalir}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <FaSignOutAlt aria-hidden="true" /> Salir
        </button>
      </Tarjeta>

      {aviso ? <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{aviso}</p> : null}
      {error ? <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {documentos === null && !error ? <p className="py-6 text-center text-slate-600">Cargando sus resultados...</p> : null}
      {documentos && documentos.length === 0 ? (
        <Tarjeta className="p-8 text-center text-slate-600">Aún no tiene resultados publicados.</Tarjeta>
      ) : null}

      {documentos && documentos.length > 0 ? (
        <div className="mb-4 space-y-3">
          {categorias.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por tipo">
              {["todas", ...categorias].map((c) => {
                const activo = categoria === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoria(c)}
                    style={activo ? ESTILO_BOTON : undefined}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${activo ? "shadow-sm" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    {c === "todas" ? "Todos" : ETIQUETA_CATEGORIA[c] || c}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre del resultado"
              aria-label="Buscar por nombre del resultado"
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
              style={ESTILO_FOCO}
            />
          </div>
        </div>
      ) : null}

      {documentos && documentos.length > 0 && grupos.length === 0 ? (
        <Tarjeta className="p-8 text-center text-slate-600">No hay resultados que coincidan con la búsqueda.</Tarjeta>
      ) : null}

      <div className="space-y-4">
        {gruposMostrados.map((g, indice) => {
          const abierto = estaAbierto(g, indice);
          return (
            <Tarjeta key={g.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => setAbiertos((prev) => ({ ...prev, [g.id]: !abierto }))}
                aria-expanded={abierto}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={ESTILO_FONDO_MARCA} aria-hidden="true">
                    <FaCalendarAlt />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">
                      {g.id === 0 ? "Otros resultados" : `Atención del ${formatearFechaHora(g.fecha)}`}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {g.documentos.length} resultado{g.documentos.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {g.bloqueada ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Saldo pendiente</span>
                  ) : null}
                  <FaChevronDown aria-hidden="true" className={`text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
                </span>
              </button>
              {abierto ? (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 pb-4">
                  {g.bloqueada ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Esta atención tiene un saldo pendiente. Regularice su pago en caja para descargar sus resultados.
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-3">
                    {g.documentos.map((doc) => {
                      const estado = ESTADOS[doc.estado] || ESTADOS.en_revision;
                      const clave = `${doc.tipo}:${doc.ref_id}`;
                      return (
                        <li key={clave} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <IconoCategoria categoria={doc.categoria} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLOR.oscuro }}>{doc.subtitulo}</p>
                                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${estado.clase}`}>{estado.texto}</span>
                              </div>
                              <p className="mt-0.5 break-words font-semibold text-slate-900">{doc.titulo}</p>
                              <p className="text-sm text-slate-500">{formatearFecha(doc.fecha)}</p>
                              {Array.isArray(doc.examenes) && doc.examenes.length > 1 ? (
                                <div className="mt-3 rounded-lg px-3 py-2" style={{ backgroundColor: COLOR.claro }}>
                                  <p className="text-xs font-semibold" style={{ color: COLOR.oscuro }}>Exámenes incluidos ({doc.examenes.length})</p>
                                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                                    {doc.examenes.map((examen) => (
                                      <li key={examen} className="break-words">{examen}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {doc.estado === "disponible" ? (
                            <button
                              type="button"
                              onClick={() => descargar(doc)}
                              disabled={descargando === clave}
                              style={ESTILO_BOTON}
                              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
                            >
                              <FaDownload aria-hidden="true" /> {descargando === clave ? "Descargando..." : "Descargar"}
                            </button>
                          ) : AYUDA_ESTADO[doc.estado] ? (
                            <p className="mt-3 text-sm text-slate-600">{AYUDA_ESTADO[doc.estado]}</p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </Tarjeta>
          );
        })}
      </div>

      {!verTodas && !hayFiltro && grupos.length > GRUPOS_VISIBLES ? (
        <button
          type="button"
          onClick={() => setVerTodas(true)}
          className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Ver más atenciones ({grupos.length - GRUPOS_VISIBLES})
        </button>
      ) : null}
    </Marco>
  );
}

export default function PacientePortalPage() {
  const [fase, setFase] = useState("cargando"); // cargando | no_disponible | login | lista
  const [paciente, setPaciente] = useState(null);

  useEffect(() => {
    let activo = true;
    sesionPaciente()
      .then((payload) => {
        if (!activo) return;
        setPaciente(payload.paciente);
        setFase(payload.autenticado ? "lista" : "login");
      })
      .catch((err) => {
        if (activo) setFase(err.status === 403 ? "no_disponible" : "login");
      });
    return () => {
      activo = false;
    };
  }, []);

  const volverAlLogin = useCallback(() => {
    setPaciente(null);
    setFase("login");
  }, []);

  const salir = async () => {
    try {
      await logoutPaciente();
    } finally {
      volverAlLogin();
    }
  };

  if (fase === "cargando") return <Marco><Tarjeta className="p-8 text-center text-slate-600">Cargando...</Tarjeta></Marco>;
  if (fase === "no_disponible") {
    return <Marco><Tarjeta className="p-8 text-center text-slate-700">El servicio de resultados en línea no está disponible en este momento.</Tarjeta></Marco>;
  }
  if (fase === "login") {
    return <LoginPaciente onIngreso={(p) => { setPaciente(p); setFase("lista"); }} />;
  }
  return <ListaResultados paciente={paciente} onSalir={salir} onSesionExpirada={volverAlLogin} />;
}
