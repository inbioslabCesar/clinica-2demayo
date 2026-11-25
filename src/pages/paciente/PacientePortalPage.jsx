import { useCallback, useEffect, useState } from "react";
import { BASE_URL, fetchConfigSingleton } from "../../config/config";
import {
  descargarDocumentoPaciente,
  listarDocumentosPaciente,
  loginPaciente,
  logoutPaciente,
  sesionPaciente,
} from "../../api/pacientePortalApi";

const ESTADOS = {
  disponible: { texto: "Disponible", clase: "bg-green-100 text-green-800" },
  pendiente_pago: { texto: "Saldo pendiente", clase: "bg-amber-100 text-amber-800" },
  en_revision: { texto: "En revisión", clase: "bg-gray-200 text-gray-700" },
};

const AYUDA_ESTADO = {
  pendiente_pago: "Regularice su pago en caja para poder descargarlo.",
  en_revision: "La clínica lo habilitará en breve.",
};

function formatearFecha(valor) {
  const fecha = new Date(String(valor || "").replace(" ", "T"));
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
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
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-xl">
        {marca.nombre || marca.logo ? (
          <div className="mb-6 flex items-center justify-center gap-3">
            {marca.logo && !logoFallo ? (
              <img src={marca.logo} alt={marca.nombre} onError={() => setLogoFallo(true)} className="h-14 w-auto max-w-[8rem] object-contain" />
            ) : null}
            {marca.nombre ? <span className="text-lg font-semibold text-slate-800">{marca.nombre}</span> : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
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

  return (
    <Marco>
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-sky-800 text-center">Mis resultados</h1>
        <p className="text-sm text-gray-600 text-center mt-1 mb-5">
          Ingrese con su documento y el PIN de 6 dígitos que le entregó la clínica.
        </p>
        <form onSubmit={enviar} className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Documento (DNI)
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-lg"
              required
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              pattern="\d{6}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-lg tracking-widest"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-sky-700 px-4 py-3 font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <p className="text-xs text-gray-500 text-center mt-5">
          ¿No tiene PIN o lo olvidó? Solicítelo en recepción presentando su documento.
        </p>
      </div>
    </Marco>
  );
}

function ListaResultados({ paciente, onSalir, onSesionExpirada }) {
  const [documentos, setDocumentos] = useState(null);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState("");
  const [aviso, setAviso] = useState("");

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-sky-800">Mis resultados</h1>
          <p className="text-sm text-gray-600">{paciente?.nombre}</p>
        </div>
        <button type="button" onClick={onSalir} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Salir
        </button>
      </div>

      {aviso ? <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800" role="alert">{aviso}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {documentos === null && !error ? <p className="text-gray-600">Cargando...</p> : null}
      {documentos && documentos.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-gray-600 shadow">Aún no tiene resultados publicados.</p>
      ) : null}

      <ul className="space-y-3">
        {(documentos || []).map((doc) => {
          const estado = ESTADOS[doc.estado] || ESTADOS.en_revision;
          const clave = `${doc.tipo}:${doc.ref_id}`;
          return (
            <li key={clave} className="rounded-xl bg-white p-4 shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{doc.subtitulo}</p>
                  <p className="font-semibold text-gray-900 break-words">{doc.titulo}</p>
                  <p className="text-sm text-gray-500">{formatearFecha(doc.fecha)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${estado.clase}`}>{estado.texto}</span>
              </div>
              {doc.estado === "disponible" ? (
                <button
                  type="button"
                  onClick={() => descargar(doc)}
                  disabled={descargando === clave}
                  className="mt-3 w-full rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                >
                  {descargando === clave ? "Descargando..." : "Descargar PDF"}
                </button>
              ) : (
                <p className="mt-3 text-sm text-gray-600">{AYUDA_ESTADO[doc.estado]}</p>
              )}
            </li>
          );
        })}
      </ul>
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

  if (fase === "cargando") return <Marco><p className="text-center text-gray-600">Cargando...</p></Marco>;
  if (fase === "no_disponible") {
    return <Marco><p className="rounded-xl bg-white p-6 text-center text-gray-700 shadow">El servicio de resultados en línea no está disponible en este momento.</p></Marco>;
  }
  if (fase === "login") {
    return <LoginPaciente onIngreso={(p) => { setPaciente(p); setFase("lista"); }} />;
  }
  return <ListaResultados paciente={paciente} onSalir={salir} onSesionExpirada={volverAlLogin} />;
}
