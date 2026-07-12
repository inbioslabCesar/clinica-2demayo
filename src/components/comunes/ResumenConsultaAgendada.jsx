import React, { useEffect, useMemo, useState } from "react";
import CobroModuloFinal from "../cobro/CobroModuloFinal";

function ResumenConsultaAgendada({ consultaCreada, pacienteInfo, detallesConsulta, totalConsulta, manejarCobroCompleto, manejarCancelarCobro }) {
  const tieneContexto = Boolean(consultaCreada && pacienteInfo);
  const consulta = consultaCreada || {};
  const paciente = pacienteInfo || {};

  const [modoCobro, setModoCobro] = useState("completo");
  const [montoAbonoInput, setMontoAbonoInput] = useState("");

  const detallesBase = useMemo(() => (Array.isArray(detallesConsulta) ? detallesConsulta : []), [detallesConsulta]);
  const saldoPendiente = useMemo(() => Math.max(0, Number(totalConsulta || 0)), [totalConsulta]);

  useEffect(() => {
    if (saldoPendiente <= 0) {
      setMontoAbonoInput("");
      return;
    }
    setMontoAbonoInput((prev) => {
      const prevNum = Number(prev);
      if (Number.isFinite(prevNum) && prevNum > 0) {
        return Math.min(prevNum, saldoPendiente).toFixed(2);
      }
      return saldoPendiente.toFixed(2);
    });
  }, [saldoPendiente]);

  const montoObjetivoCobro = useMemo(() => {
    if (modoCobro !== "parcial") return saldoPendiente;
    const montoManual = Number(montoAbonoInput);
    if (!Number.isFinite(montoManual) || montoManual <= 0) return saldoPendiente;
    return Math.min(montoManual, saldoPendiente);
  }, [modoCobro, montoAbonoInput, saldoPendiente]);

  const detallesCobro = useMemo(() => {
    if (!detallesBase.length) return [];
    const totalBase = detallesBase.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0);
    const objetivo = Math.max(0, Number(montoObjetivoCobro || 0));
    if (!Number.isFinite(totalBase) || totalBase <= 0 || objetivo >= totalBase) return detallesBase;

    let restante = Number(objetivo.toFixed(2));
    return detallesBase.map((d, idx) => {
      const subtotalOriginal = Math.max(0, Number(d?.subtotal || 0));
      if (restante <= 0 || subtotalOriginal <= 0) {
        return { ...d, cantidad: 1, precio_unitario: 0, subtotal: 0 };
      }
      const proporcion = subtotalOriginal / totalBase;
      const esUltimo = idx === detallesBase.length - 1;
      const subtotalAplicado = esUltimo
        ? Number(restante.toFixed(2))
        : Number(Math.min(restante, objetivo * proporcion).toFixed(2));
      restante = Number((restante - subtotalAplicado).toFixed(2));
      const cantidad = Math.max(1, Number(d?.cantidad || 1));
      const precioUnitario = Number((subtotalAplicado / cantidad).toFixed(2));
      return {
        ...d,
        precio_unitario: precioUnitario,
        subtotal: subtotalAplicado,
      };
    });
  }, [detallesBase, montoObjetivoCobro]);

  const totalCobro = useMemo(
    () => detallesCobro.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0),
    [detallesCobro]
  );

  if (!tieneContexto) return null;

  return (
    <div className="w-full max-w-[1500px] mx-auto px-2 md:px-4 lg:px-6 py-2 md:py-4">
      <div className="bg-blue-50 p-4 md:p-5 rounded-xl mb-4 border border-blue-200 max-w-[980px]">
        <h3 className="font-semibold text-blue-800 mb-2">✅ Consulta Agendada Exitosamente</h3>
        <div className="text-sm text-blue-600">
          <p><strong>Médico:</strong> {consulta.medico_nombre} ({consulta.medico_especialidad})</p>
          <p><strong>Fecha:</strong> {consulta.fecha} - <strong>Hora:</strong> {consulta.hora}</p>
          <p><strong>Paciente:</strong> {paciente.nombre} {paciente.apellido}</p>
        </div>
      </div>
      <CobroModuloFinal
        paciente={paciente}
        servicio={{
          key: "consulta",
          label: `Consulta - ${consulta.medico_nombre}`,
          medico_id: consulta.medico_id,
          consulta_id: consulta.id,
          cotizacion_id: Number(consulta.cotizacion_id || 0) || null,
          tipo_consulta: consulta.tipo_consulta,
          hora: consulta.hora
        }}
        detalles={detallesCobro.map(d => ({ ...d, hora: consulta.hora }))}
        total={totalCobro}
        modoCobro={modoCobro}
        onModoCobroChange={setModoCobro}
        montoAbonoInput={montoAbonoInput}
        saldoPendiente={saldoPendiente}
        montoObjetivoCobro={montoObjetivoCobro}
        onMontoAbonoChange={setMontoAbonoInput}
        onSetCobrarTodo={() => setMontoAbonoInput(saldoPendiente.toFixed(2))}
        onSetCobrarMitad={() => setMontoAbonoInput((saldoPendiente / 2).toFixed(2))}
        onCobroCompleto={manejarCobroCompleto}
        onCancelar={manejarCancelarCobro}
      />
    </div>
  );
}

export default ResumenConsultaAgendada;
