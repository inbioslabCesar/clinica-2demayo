import { useState, useEffect, useCallback } from "react";
import { BASE_URL } from "../../config/config";
import Swal from "sweetalert2";
import { formatProfesionalName } from "../../utils/profesionalDisplay";

function fmt(n) {
  return Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CuentaCorrienteMedicoModal({ medico, rolUsuario, onClose }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  // Adelanto form
  const [montoAdelanto, setMontoAdelanto] = useState("");
  const [motivoAdelanto, setMotivoAdelanto] = useState("Adelanto de honorarios");
  const [guardando, setGuardando]           = useState(false);

  const esAdminOrRecep = rolUsuario === "administrador" || rolUsuario === "recepcionista";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}api_medico_cuenta_corriente.php?medico_id=${medico.id}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || "Error al cargar datos");
      }
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  }, [medico.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRegistrarAdelanto = async () => {
    const monto = Math.round(parseFloat(montoAdelanto) * 100) / 100;
    if (!monto || monto <= 0) {
      Swal.fire({ icon: "warning", title: "Ingrese un monto válido", timer: 2000, showConfirmButton: false });
      return;
    }
    const disponible = parseFloat(data?.resumen?.disponible_para_adelanto ?? 0);
    if (monto > disponible && disponible > 0) {
      const conf = await Swal.fire({
        icon: "warning",
        title: `El monto supera lo disponible (S/ ${fmt(disponible)})`,
        text: "¿Desea continuar de todas formas?",
        showCancelButton: true,
        confirmButtonText: "Sí, registrar",
        cancelButtonText: "Cancelar",
      });
      if (!conf.isConfirmed) return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${BASE_URL}api_medico_cuenta_corriente.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accion: "registrar_adelanto",
          medico_id: medico.id,
          monto,
          motivo: motivoAdelanto,
          fecha: new Date().toISOString().slice(0, 10),
        }),
      });
      const json = await res.json();
      if (json.success) {
        Swal.fire({ icon: "success", title: "Adelanto registrado", text: `S/ ${fmt(monto)} registrado como egreso.`, timer: 2500, showConfirmButton: false });
        setMontoAdelanto("");
        setMotivoAdelanto("Adelanto de honorarios");
        fetchData();
      } else {
        Swal.fire({ icon: "error", title: "Error", text: json.error || "No se pudo registrar el adelanto" });
      }
    } catch {
      Swal.fire({ icon: "error", title: "Error de conexión" });
    }
    setGuardando(false);
  };

  const handleAnularAdelanto = async (adelanto) => {
    const conf = await Swal.fire({
      title: "¿Anular este adelanto?",
      text: `S/ ${fmt(adelanto.monto)} del ${adelanto.fecha}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Sí, anular",
      cancelButtonText: "Cancelar",
    });
    if (!conf.isConfirmed) return;
    try {
      const res = await fetch(`${BASE_URL}api_medico_cuenta_corriente.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accion: "anular_adelanto", id: adelanto.id }),
      });
      const json = await res.json();
      if (json.success) {
        Swal.fire({ icon: "success", title: "Adelanto anulado", timer: 1800, showConfirmButton: false });
        fetchData();
      } else {
        Swal.fire({ icon: "error", title: json.error || "Error al anular" });
      }
    } catch {
      Swal.fire({ icon: "error", title: "Error de conexión" });
    }
  };

  const r = data?.resumen;
  const periodo = data?.periodo_actual;
  const condiciones = data?.condiciones_pago;
  const esHora = r?.modalidad_hora;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-indigo-50 rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-indigo-800">Cuenta corriente</h2>
            <p className="text-sm text-indigo-600">
              {formatProfesionalName(medico)}
              {medico.especialidad && <span className="text-xs text-indigo-400 ml-2">· {medico.especialidad}</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-indigo-400 hover:text-indigo-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {loading && <div className="text-center py-8 text-gray-400">Cargando...</div>}
          {error  && <div className="text-center py-8 text-red-500">{error}</div>}

          {data && (
            <>
              {/* Periodo */}
              <div className="text-xs text-gray-500 flex items-center gap-2">
                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  {condiciones?.frecuencia_pago === "quincenal" ? "Quincenal" : "Mensual"}
                </span>
                <span>{periodo?.inicio} al {periodo?.fin}</span>
                <span className="text-gray-400">· Hoy: {periodo?.hoy}</span>
              </div>

              {/* Cards resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {esHora && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                      <p className="text-xs text-blue-500 font-medium">Hs trabajadas (período)</p>
                      <p className="text-xl font-bold text-blue-700">{r.horas_trabajadas_periodo}</p>
                      <p className="text-xs text-blue-400">horas</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                      <p className="text-xs text-emerald-500 font-medium">Devengado (período)</p>
                      <p className="text-xl font-bold text-emerald-700">S/ {fmt(r.devengado_hora_periodo)}</p>
                      <p className="text-xs text-emerald-400">hasta hoy</p>
                    </div>
                  </>
                )}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-amber-500 font-medium">Adelantos (período)</p>
                  <p className="text-xl font-bold text-amber-700">S/ {fmt(r.adelantos_periodo)}</p>
                </div>
                <div className={`border rounded-xl p-3 text-center ${r.deuda_neta_periodo >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <p className={`text-xs font-medium ${r.deuda_neta_periodo >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {r.deuda_neta_periodo >= 0 ? "A pagar (período)" : "A favor de clínica"}
                  </p>
                  <p className={`text-xl font-bold ${r.deuda_neta_periodo >= 0 ? "text-green-700" : "text-red-700"}`}>
                    S/ {fmt(Math.abs(r.deuda_neta_periodo))}
                  </p>
                </div>
              </div>

              {/* Disponible para adelanto */}
              {esHora && r.disponible_para_adelanto > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-indigo-700">Disponible para adelanto hoy</p>
                    <p className="text-xs text-indigo-500">
                      Devengado S/ {fmt(r.devengado_hora_periodo)} – adelantos S/ {fmt(r.adelantos_periodo)}
                    </p>
                  </div>
                  <p className="text-2xl font-bold text-indigo-700">S/ {fmt(r.disponible_para_adelanto)}</p>
                </div>
              )}

              {/* Bloques de disponibilidad del periodo */}
              {esHora && data.bloques_disponibilidad?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Horario del período</h3>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {data.bloques_disponibilidad.map((b, i) => (
                      <div key={i} className={`flex justify-between text-xs px-3 py-1 rounded border ${b.ya_pasado ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                        <span>{b.fecha}</span>
                        <span>{b.hora_inicio} – {b.hora_fin}</span>
                        <span className="font-medium">{b.horas} h</span>
                        {b.ya_pasado && <span className="text-green-600">✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Registrar adelanto (solo admin/recep) */}
              {esAdminOrRecep && condiciones?.permite_adelanto == 1 && (
                <div className="border rounded-xl p-4 bg-yellow-50">
                  <h3 className="text-sm font-bold text-yellow-800 mb-3">Registrar adelanto</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Monto (S/)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={montoAdelanto}
                        onChange={e => setMontoAdelanto(e.target.value)}
                        placeholder={`Máx. S/ ${fmt(r.disponible_para_adelanto || r.deuda_neta_periodo)}`}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Motivo</label>
                      <input
                        type="text"
                        value={motivoAdelanto}
                        onChange={e => setMotivoAdelanto(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 outline-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleRegistrarAdelanto}
                    disabled={guardando || !montoAdelanto}
                    className="w-full py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-200 text-white font-bold rounded-lg text-sm transition-colors"
                  >
                    {guardando ? "Registrando..." : "Registrar adelanto (genera egreso)"}
                  </button>
                </div>
              )}

              {/* Historial adelantos */}
              {data.adelantos?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Historial de adelantos</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {data.adelantos.map(a => (
                      <div key={a.id} className={`flex items-center justify-between text-xs px-3 py-2 rounded border ${a.estado === "anulado" ? "bg-gray-50 text-gray-400 line-through" : "bg-white"}`}>
                        <span>{a.fecha}</span>
                        <span className="font-medium">S/ {fmt(a.monto)}</span>
                        <span className="text-gray-500 max-w-[120px] truncate">{a.motivo}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${a.estado === "activo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {a.estado}
                        </span>
                        {rolUsuario === "administrador" && a.estado === "activo" && (
                          <button
                            onClick={() => handleAnularAdelanto(a)}
                            className="text-red-500 hover:text-red-700 text-xs underline ml-1"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Totales históricos */}
              <div className="border-t pt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-gray-400">Total devengado</p>
                  <p className="font-bold text-gray-700">
                    S/ {fmt(esHora ? r.pendiente_honorarios_total : r.pendiente_honorarios_acto_total)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Adelantos totales</p>
                  <p className="font-bold text-amber-600">S/ {fmt(r.adelantos_activos_total)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Deuda total</p>
                  <p className={`font-bold ${r.deuda_neta_total >= 0 ? "text-green-600" : "text-red-600"}`}>
                    S/ {fmt(Math.abs(r.deuda_neta_total))}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
