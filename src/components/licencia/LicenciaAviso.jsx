import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLicencia } from "../../api/licenciaApi";
import {
  ETIQUETA_METODO,
  enlaceWhatsapp,
  fechaCorta,
  formatoMonto,
  textoBanner,
} from "../../utils/licenciaFormato";

const REFRESCO_MS = 10 * 60 * 1000;
const CLAVE_OCULTO = "licencia_aviso_oculto";

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BotonCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles: el número sigue visible para copiarlo a mano.
    }
  };
  return (
    <button
      type="button"
      onClick={copiar}
      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-100 sm:py-1.5"
    >
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function DetallePago({ info }) {
  const monto = formatoMonto(info.monto, info.moneda);
  const metodos = Array.isArray(info.metodos_pago) ? info.metodos_pago : [];
  const wa = enlaceWhatsapp(
    info.contacto_whatsapp,
    `Hola, envío mi comprobante de pago del sistema${monto ? ` (${monto})` : ""}.`
  );
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-4 text-center">
        {monto && <div className="text-3xl font-bold text-slate-900">{monto}</div>}
        {info.periodicidad && <div className="text-xs uppercase tracking-wide text-slate-500">Pago {info.periodicidad}</div>}
        {info.fecha_vencimiento && (
          <div className="mt-1 text-sm text-slate-600">Vencimiento: {fechaCorta(info.fecha_vencimiento)}</div>
        )}
      </div>
      {info.mensaje && <p className="whitespace-pre-line text-sm text-slate-700">{info.mensaje}</p>}
      {metodos.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-800">Métodos de pago</div>
          {metodos.map((m, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
                {ETIQUETA_METODO[m.tipo] || m.tipo}
                {m.banco ? ` · ${m.banco}` : ""}
              </span>
              {m.titular && <div className="mt-2 text-sm text-slate-600">A nombre de: <strong>{m.titular}</strong></div>}
              {m.numero && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="break-all text-lg font-semibold tracking-wide text-slate-900">{m.numero}</span>
                  <BotonCopiar texto={m.numero} />
                </div>
              )}
              {m.cci && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="break-all text-sm text-slate-700">CCI: {m.cci}</span>
                  <BotonCopiar texto={m.cci} />
                </div>
              )}
              {m.nota && <div className="mt-2 text-xs text-slate-500">{m.nota}</div>}
            </div>
          ))}
        </div>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-xl bg-green-600 px-4 py-3 text-center text-base font-semibold text-white active:bg-green-700"
        >
          Enviar comprobante por WhatsApp
        </a>
      )}
    </div>
  );
}

/**
 * Suscripción del sistema: banner de aviso/vencido, modal con los datos de pago y pantalla de bloqueo.
 * El bloqueo real lo hace el servidor (402); esto solo lo muestra. Funciona en móvil (hoja inferior) y escritorio.
 */
export default function LicenciaAviso({ usuario, onLogout }) {
  const [info, setInfo] = useState(null);
  const [forzado, setForzado] = useState(false);
  const [modal, setModal] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [oculto, setOculto] = useState(() => {
    try {
      return sessionStorage.getItem(CLAVE_OCULTO) === hoyLocal();
    } catch {
      return false;
    }
  });
  const hayUsuario = Boolean(usuario);
  const refrescando = useRef(false);

  const refrescar = useCallback(async () => {
    if (refrescando.current) return;
    refrescando.current = true;
    try {
      const datos = await fetchLicencia();
      if (datos) {
        setInfo(datos);
        if (!datos.bloqueado) setForzado(false);
      }
    } finally {
      refrescando.current = false;
    }
  }, []);

  useEffect(() => {
    if (!hayUsuario) {
      setInfo(null);
      setForzado(false);
      return undefined;
    }
    refrescar();
    const intervalo = setInterval(refrescar, REFRESCO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    const alBloquear = () => {
      setForzado(true);
      refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("licencia-bloqueada", alBloquear);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("licencia-bloqueada", alBloquear);
    };
  }, [hayUsuario, refrescar]);

  if (!hayUsuario) return null;

  const verificar = async () => {
    setVerificando(true);
    await refrescar();
    setVerificando(false);
  };

  const bloqueado = Boolean(info?.bloqueado) || forzado;
  if (bloqueado) {
    const conDetalle = Boolean(info?.detalle_pago);
    return (
      <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/90 p-3 sm:items-center sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="lic-bloqueo-titulo">
        <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
          <h2 id="lic-bloqueo-titulo" className="text-xl font-bold text-red-700 sm:text-2xl">Servicio suspendido por falta de pago</h2>
          {conDetalle ? (
            <>
              <p className="mt-2 text-sm text-slate-600">
                El plazo de gracia terminó{info?.fecha_limite ? ` el ${fechaCorta(info.fecha_limite)}` : ""}. Regularice el pago para reactivar el sistema.
              </p>
              <div className="mt-4"><DetallePago info={info} /></div>
            </>
          ) : (
            <p className="mt-3 text-base text-slate-700">
              El sistema está suspendido. Avise al administrador de la clínica para que regularice el servicio.
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              onClick={verificar}
              disabled={verificando}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white active:bg-blue-700 disabled:opacity-60 sm:w-auto"
            >
              {verificando ? "Verificando..." : "Ya pagué, verificar"}
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 active:bg-slate-100 sm:w-auto"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const banner = textoBanner(info);
  if (!banner) return null;
  const esAviso = banner.tono === "aviso";

  const ocultar = () => {
    try {
      sessionStorage.setItem(CLAVE_OCULTO, hoyLocal());
    } catch {
      // sin sessionStorage: solo se oculta mientras dure esta pantalla
    }
    setOculto(true);
  };

  return (
    <>
      {!(esAviso && oculto) && (
        <div
          className={`sticky top-0 z-[45] flex items-center gap-2 px-3 py-1.5 text-xs text-white shadow sm:py-2 sm:text-sm ${esAviso ? "bg-amber-600" : "bg-red-600"}`}
          role="status"
        >
          <button
            type="button"
            onClick={() => setModal(true)}
            className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left sm:flex-row sm:items-center sm:gap-3"
          >
            <span className="font-medium leading-snug">{banner.texto}</span>
            <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold underline-offset-2 hover:bg-white/30">
              Ver cómo pagar
            </span>
          </button>
          {esAviso && (
            <button type="button" onClick={ocultar} aria-label="Ocultar aviso por hoy" className="shrink-0 rounded-full px-2.5 py-1 text-lg leading-none hover:bg-white/20">
              ×
            </button>
          )}
        </div>
      )}
      {modal && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lic-modal-titulo"
          onClick={() => setModal(false)}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 id="lic-modal-titulo" className="text-lg font-bold text-slate-900 sm:text-xl">Pago del servicio</h2>
              <button type="button" onClick={() => setModal(false)} aria-label="Cerrar" className="-mr-2 -mt-1 rounded-full px-3 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100">
                ×
              </button>
            </div>
            <DetallePago info={info} />
            <button
              type="button"
              onClick={() => setModal(false)}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-medium text-slate-700 active:bg-slate-100"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
