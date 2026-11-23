import { useCallback, useEffect, useState } from "react";
import {
  engineerLicencia,
  engineerLicenciaGuardar,
  engineerLicenciaPago,
  engineerLicenciaProrroga,
} from "../../api/licenciaApi";
import { ETIQUETA_METODO, fechaCorta, formatoMonto } from "../../utils/licenciaFormato";

const ESTADOS = {
  desactivada: { texto: "Desactivada (sin avisos ni bloqueo)", clase: "bg-gray-200 text-gray-800" },
  al_dia: { texto: "Al día", clase: "bg-green-100 text-green-800" },
  aviso: { texto: "En aviso previo", clase: "bg-amber-100 text-amber-800" },
  vencida: { texto: "Vencida (en gracia)", clase: "bg-red-100 text-red-800" },
  bloqueada: { texto: "BLOQUEADA", clase: "bg-red-600 text-white" },
};

const VACIO = {
  activa: false,
  monto: "",
  moneda: "PEN",
  periodicidad: "mensual",
  dia_pago: 1,
  proximo_vencimiento: "",
  dias_aviso: 10,
  dias_gracia: 5,
  mensaje: "",
  contacto_whatsapp: "",
  metodos_pago: [],
};

const METODO_VACIO = { tipo: "yape", titular: "", numero: "", banco: "", cci: "", nota: "" };

const CAMPO = "mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-base sm:text-sm";
const ETIQUETA = "block text-sm font-medium text-gray-700";

function aFormulario(config) {
  if (!config) return { ...VACIO };
  return {
    activa: Number(config.activa) === 1,
    monto: config.monto ?? "",
    moneda: config.moneda || "PEN",
    periodicidad: config.periodicidad || "mensual",
    dia_pago: Number(config.dia_pago) || 1,
    proximo_vencimiento: config.proximo_vencimiento || "",
    dias_aviso: Number(config.dias_aviso ?? 10),
    dias_gracia: Number(config.dias_gracia ?? 5),
    mensaje: config.mensaje || "",
    contacto_whatsapp: config.contacto_whatsapp || "",
    metodos_pago: (config.metodos_pago || []).map((m) => ({ ...METODO_VACIO, ...m, titular: m.titular || "", numero: m.numero || "", banco: m.banco || "", cci: m.cci || "", nota: m.nota || "" })),
  };
}

export default function SuscripcionPanel({ csrf, onSesionExpirada }) {
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState({ ...VACIO });
  const [pago, setPago] = useState({ fecha_pago: "", monto: "", metodo: "", referencia: "", notas: "" });
  const [prorroga, setProrroga] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const aplicar = useCallback((r) => {
    setDatos(r);
    setForm(aFormulario(r.config));
    setProrroga(r.config?.prorroga_hasta || "");
  }, []);

  const procesar = useCallback(
    (r, textoOk) => {
      if (r.status === 401 || r.status === 403) {
        onSesionExpirada?.();
        return false;
      }
      if (!r.success) {
        setMensaje({ tipo: "error", texto: r.error || "No se pudo completar la acción" });
        return false;
      }
      aplicar(r);
      if (textoOk) setMensaje({ tipo: "ok", texto: textoOk });
      return true;
    },
    [aplicar, onSesionExpirada]
  );

  useEffect(() => {
    let activo = true;
    engineerLicencia()
      .then((r) => {
        if (!activo) return;
        if (!procesar(r, null)) setDatos(null);
      })
      .catch(() => activo && setMensaje({ tipo: "error", texto: "No se pudo cargar la suscripción" }))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [procesar]);

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const cambiarMetodo = (i, campo, valor) =>
    setForm((f) => ({ ...f, metodos_pago: f.metodos_pago.map((m, idx) => (idx === i ? { ...m, [campo]: valor } : m)) }));

  const ejecutar = async (accion, textoOk) => {
    setOcupado(true);
    setMensaje(null);
    try {
      return procesar(await accion(), textoOk);
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión" });
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = (e) => {
    e.preventDefault();
    return ejecutar(() => engineerLicenciaGuardar(csrf, form), "Configuración guardada");
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    const monto = pago.monto !== "" ? pago.monto : form.monto;
    if (!window.confirm(`¿Registrar el pago de ${formatoMonto(monto, form.moneda)} y avanzar el vencimiento al siguiente periodo?`)) return;
    const ok = await ejecutar(() => engineerLicenciaPago(csrf, { ...pago, monto }), "Pago registrado: el vencimiento avanzó y se quitó la prórroga");
    if (ok) setPago({ fecha_pago: "", monto: "", metodo: "", referencia: "", notas: "" });
  };

  if (cargando) return <div className="p-6 text-center text-gray-600">Cargando...</div>;
  if (!datos) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {mensaje?.texto || "No se pudo cargar la suscripción."}
      </div>
    );
  }

  const est = datos.estado || {};
  const chip = ESTADOS[est.estado] || ESTADOS.desactivada;

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Estado actual</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${chip.clase}`}>{chip.texto}</span>
        </div>
        {est.fecha_vencimiento && (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-gray-500">Vencimiento</dt><dd className="font-medium">{fechaCorta(est.fecha_vencimiento)} ({est.dias_restantes >= 0 ? `en ${est.dias_restantes} d` : `hace ${Math.abs(est.dias_restantes)} d`})</dd></div>
            <div><dt className="text-gray-500">Último día de uso</dt><dd className="font-medium">{fechaCorta(est.fecha_limite)}</dd></div>
            <div><dt className="text-gray-500">Hoy (Lima)</dt><dd className="font-medium">{fechaCorta(datos.hoy)}</dd></div>
          </dl>
        )}
      </section>

      {mensaje && (
        <div role="status" className={`rounded p-3 text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={guardar} className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Configuración</h2>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5" checked={form.activa} onChange={(e) => cambiar("activa", e.target.checked)} />
          Activar avisos y bloqueo por falta de pago en esta clínica
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={ETIQUETA}>Monto a pagar
            <input type="number" min="0" step="0.01" inputMode="decimal" className={CAMPO} value={form.monto} onChange={(e) => cambiar("monto", e.target.value)} />
          </label>
          <label className={ETIQUETA}>Moneda
            <select className={CAMPO} value={form.moneda} onChange={(e) => cambiar("moneda", e.target.value)}>
              <option value="PEN">Soles (S/)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
          </label>
          <label className={ETIQUETA}>Periodicidad
            <select className={CAMPO} value={form.periodicidad} onChange={(e) => cambiar("periodicidad", e.target.value)}>
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
          </label>
          <label className={ETIQUETA}>Día de pago del mes (1–31)
            <input type="number" min="1" max="31" inputMode="numeric" className={CAMPO} value={form.dia_pago} onChange={(e) => cambiar("dia_pago", e.target.value)} />
            <span className="text-xs font-normal text-gray-500">En meses cortos cae en su último día (31 → 28/29/30).</span>
          </label>
          <label className={ETIQUETA}>Próximo vencimiento
            <input type="date" className={CAMPO} value={form.proximo_vencimiento} onChange={(e) => cambiar("proximo_vencimiento", e.target.value)} />
          </label>
          <label className={ETIQUETA}>WhatsApp para enviar comprobante
            <input type="tel" inputMode="tel" placeholder="51999111222" className={CAMPO} value={form.contacto_whatsapp} onChange={(e) => cambiar("contacto_whatsapp", e.target.value)} />
          </label>
          <label className={ETIQUETA}>Días de aviso antes del vencimiento
            <input type="number" min="0" max="90" inputMode="numeric" className={CAMPO} value={form.dias_aviso} onChange={(e) => cambiar("dias_aviso", e.target.value)} />
          </label>
          <label className={ETIQUETA}>Días de gracia después del vencimiento
            <input type="number" min="0" max="60" inputMode="numeric" className={CAMPO} value={form.dias_gracia} onChange={(e) => cambiar("dias_gracia", e.target.value)} />
            <span className="text-xs font-normal text-gray-500">Siguen usando el sistema; al terminar se bloquea todo.</span>
          </label>
        </div>
        <label className={ETIQUETA}>Mensaje en el modal de pago (opcional)
          <textarea rows={3} maxLength={500} className={CAMPO} value={form.mensaje} onChange={(e) => cambiar("mensaje", e.target.value)} />
        </label>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Métodos de pago</h3>
            <button
              type="button"
              disabled={form.metodos_pago.length >= 8}
              onClick={() => setForm((f) => ({ ...f, metodos_pago: [...f.metodos_pago, { ...METODO_VACIO }] }))}
              className="rounded border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 disabled:opacity-50"
            >
              + Agregar
            </button>
          </div>
          {form.metodos_pago.length === 0 && <p className="text-sm text-gray-500">Sin métodos: el modal solo mostrará el monto.</p>}
          {form.metodos_pago.map((m, i) => (
            <div key={i} className="space-y-2 rounded border border-gray-200 p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className={ETIQUETA}>Tipo
                  <select className={CAMPO} value={m.tipo} onChange={(e) => cambiarMetodo(i, "tipo", e.target.value)}>
                    {Object.entries(ETIQUETA_METODO).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
                  </select>
                </label>
                <label className={ETIQUETA}>Titular
                  <input className={CAMPO} maxLength={80} value={m.titular} onChange={(e) => cambiarMetodo(i, "titular", e.target.value)} />
                </label>
                <label className={ETIQUETA}>Número / cuenta
                  <input className={CAMPO} maxLength={60} value={m.numero} onChange={(e) => cambiarMetodo(i, "numero", e.target.value)} />
                </label>
                <label className={ETIQUETA}>Banco
                  <input className={CAMPO} maxLength={60} value={m.banco} onChange={(e) => cambiarMetodo(i, "banco", e.target.value)} />
                </label>
                <label className={ETIQUETA}>CCI
                  <input className={CAMPO} maxLength={30} value={m.cci} onChange={(e) => cambiarMetodo(i, "cci", e.target.value)} />
                </label>
                <label className={ETIQUETA}>Nota
                  <input className={CAMPO} maxLength={200} value={m.nota} onChange={(e) => cambiarMetodo(i, "nota", e.target.value)} />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, metodos_pago: f.metodos_pago.filter((_, idx) => idx !== i) }))}
                className="text-sm font-medium text-red-700"
              >
                Quitar este método
              </button>
            </div>
          ))}
        </div>

        <button type="submit" disabled={ocupado} className="w-full rounded bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto">
          {ocupado ? "Guardando..." : "Guardar configuración"}
        </button>
      </form>

      <form onSubmit={registrarPago} className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Registrar pago recibido</h2>
        <p className="text-sm text-gray-600">Avanza el vencimiento al siguiente periodo y quita cualquier prórroga. Guarde antes la configuración si la cambió.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={ETIQUETA}>Fecha del pago
            <input type="date" className={CAMPO} value={pago.fecha_pago} onChange={(e) => setPago((p) => ({ ...p, fecha_pago: e.target.value }))} />
          </label>
          <label className={ETIQUETA}>Monto recibido
            <input type="number" min="0" step="0.01" inputMode="decimal" placeholder={form.monto !== "" ? String(form.monto) : ""} className={CAMPO} value={pago.monto} onChange={(e) => setPago((p) => ({ ...p, monto: e.target.value }))} />
          </label>
          <label className={ETIQUETA}>Método
            <input className={CAMPO} maxLength={40} placeholder="Yape, Plin, transferencia…" value={pago.metodo} onChange={(e) => setPago((p) => ({ ...p, metodo: e.target.value }))} />
          </label>
          <label className={ETIQUETA}>Referencia / operación
            <input className={CAMPO} maxLength={120} value={pago.referencia} onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))} />
          </label>
        </div>
        <label className={ETIQUETA}>Notas
          <input className={CAMPO} maxLength={255} value={pago.notas} onChange={(e) => setPago((p) => ({ ...p, notas: e.target.value }))} />
        </label>
        <button type="submit" disabled={ocupado} className="w-full rounded bg-green-600 px-4 py-3 font-semibold text-white disabled:opacity-60 sm:w-auto">
          Registrar pago
        </button>
      </form>

      <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Prórroga puntual</h2>
        <p className="text-sm text-gray-600">Permite seguir usando el sistema hasta esa fecha sin cambiar el calendario de cobro. Se quita sola al registrar el pago.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className={`${ETIQUETA} sm:w-56`}>Usar hasta
            <input type="date" className={CAMPO} value={prorroga} onChange={(e) => setProrroga(e.target.value)} />
          </label>
          <button type="button" disabled={ocupado || !prorroga} onClick={() => ejecutar(() => engineerLicenciaProrroga(csrf, prorroga), "Prórroga aplicada")} className="rounded bg-amber-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
            Aplicar prórroga
          </button>
          <button type="button" disabled={ocupado || !datos.config?.prorroga_hasta} onClick={() => ejecutar(() => engineerLicenciaProrroga(csrf, ""), "Prórroga quitada")} className="rounded border border-gray-300 px-4 py-2.5 font-medium disabled:opacity-50">
            Quitar prórroga
          </button>
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Historial de pagos</h2>
        {datos.pagos?.length ? (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {datos.pagos.map((p, i) => (
              <li key={i} className="grid grid-cols-2 gap-x-3 gap-y-1 py-2 sm:grid-cols-5">
                <span className="font-medium">{fechaCorta(p.fecha_pago)}</span>
                <span>{formatoMonto(p.monto, p.moneda)}</span>
                <span className="text-gray-600">{p.metodo || "—"}</span>
                <span className="break-all text-gray-600">{p.referencia || "—"}</span>
                <span className="text-gray-500">hasta {fechaCorta(p.periodo_hasta)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">Aún no hay pagos registrados.</p>
        )}
      </section>
    </div>
  );
}
