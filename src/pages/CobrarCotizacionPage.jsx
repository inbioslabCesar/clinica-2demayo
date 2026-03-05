import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import CobroModuloFinal from "../components/cobro/CobroModuloFinal";
import Spinner from "../components/comunes/Spinner";
import { BASE_URL } from "../config/config";

const serviceKeyMap = {
  laboratorio: "laboratorio",
  rayosx: "rayosx",
  rayos_x: "rayosx",
  ecografia: "ecografia",
  operacion: "operacion",
  operaciones: "operacion",
  procedimiento: "procedimiento",
  procedimientos: "procedimiento",
  farmacia: "farmacia",
  consulta: "consulta",
};

function normalizarServicioKey(value) {
  const base = String(value || "").toLowerCase();
  return serviceKeyMap[base] || "procedimiento";
}

export default function CobrarCotizacionPage() {
  const navigate = useNavigate();
  const { cotizacionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cotizacion, setCotizacion] = useState(null);
  const [paciente, setPaciente] = useState(null);

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const resCot = await fetch(`${BASE_URL}api_cotizaciones.php?cotizacion_id=${Number(cotizacionId)}`, {
          credentials: "include",
        });
        const dataCot = await resCot.json();
        if (!dataCot?.success || !dataCot?.cotizacion) {
          throw new Error(dataCot?.error || "No se pudo cargar la cotización");
        }

        const cot = dataCot.cotizacion;
        const resPac = await fetch(`${BASE_URL}api_pacientes.php?id=${cot.paciente_id}`, {
          credentials: "include",
        });
        const dataPac = await resPac.json();
        if (!dataPac?.success || !dataPac?.paciente) {
          throw new Error(dataPac?.error || "No se pudo cargar el paciente");
        }

        if (!mounted) return;
        setCotizacion(cot);
        setPaciente(dataPac.paciente);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "Error al cargar datos de cobro");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargar();
    return () => {
      mounted = false;
    };
  }, [cotizacionId]);

  const detallesCobro = useMemo(() => {
    const detalles = Array.isArray(cotizacion?.detalles) ? cotizacion.detalles : [];
    return detalles
      .filter((d) => {
        const estadoItem = String(d?.estado_item || "activo").toLowerCase();
        return estadoItem !== "eliminado" && Number(d?.cantidad || 0) > 0;
      })
      .map((d) => ({
        servicio_tipo: normalizarServicioKey(d.servicio_tipo),
        servicio_id: Number(d.servicio_id) || null,
        tarifa_id: Number(d.servicio_id) || null,
        descripcion: d.descripcion || "Servicio",
        cantidad: Number(d.cantidad) || 1,
        precio_unitario: Number(d.precio_unitario) || 0,
        subtotal: Number(d.subtotal) || (Number(d.precio_unitario) || 0) * (Number(d.cantidad) || 1),
        cotizacion_id: Number(cotizacion?.id),
        medico_id: d.medico_id || null,
        medico_nombre: d.medico_nombre || undefined,
        medico_especialidad: d.especialidad || d.medico_especialidad || undefined,
      }));
  }, [cotizacion]);

  const totalCobro = useMemo(() => {
    return detallesCobro.reduce((acc, d) => acc + Number(d.subtotal || 0), 0);
  }, [detallesCobro]);

  const servicioPago = useMemo(() => {
    const primerTipo = detallesCobro[0]?.servicio_tipo || "procedimiento";
    const key = normalizarServicioKey(primerTipo);
    return {
      key,
      label: `Cobro de cotización #${cotizacion?.id || ""}`.trim(),
      cotizacion_id: Number(cotizacion?.id || 0),
    };
  }, [cotizacion?.id, detallesCobro]);

  const registrarAbono = async (cobroId) => {
    let montoAbono = totalCobro;
    try {
      const resCob = await fetch(`${BASE_URL}api_cobros.php?cobro_id=${Number(cobroId)}`, {
        credentials: "include",
      });
      const dataCob = await resCob.json();
      const montoCobrado = Number(dataCob?.cobro?.total);
      if (dataCob?.success && Number.isFinite(montoCobrado) && montoCobrado > 0) {
        montoAbono = montoCobrado;
      }
    } catch {
      // usar totalCobro como fallback
    }

    const resAbono = await fetch(`${BASE_URL}api_cotizaciones.php`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accion: "registrar_abono",
        cotizacion_id: Number(cotizacion?.id),
        cobro_id: Number(cobroId),
        monto: Number(montoAbono),
        descripcion: `Abono desde vista Cobrar Cotización #${cotizacion?.id}`,
      }),
    });

    const dataAbono = await resAbono.json();
    if (!dataAbono?.success) {
      throw new Error(dataAbono?.error || "No se pudo registrar el abono de la cotización");
    }
  };

  const manejarCobroCompleto = async (cobroId) => {
    try {
      await registrarAbono(cobroId);
      await Swal.fire("Cobro aplicado", "La cotización fue actualizada con el pago realizado.", "success");
      navigate("/cotizaciones");
    } catch (err) {
      await Swal.fire("Cobro registrado con observación", err?.message || "No se pudo actualizar la cotización automáticamente.", "warning");
      navigate("/cotizaciones");
    }
  };

  if (loading) return <Spinner />;
  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate("/cotizaciones")}
          className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">{error}</div>
      </div>
    );
  }

  const estado = String(cotizacion?.estado || "").toLowerCase();
  if (estado === "anulada" || estado === "pagado") {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate("/cotizaciones")}
          className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded p-4">
          Esta cotización está en estado <b>{cotizacion?.estado}</b> y no requiere cobro desde esta vista.
        </div>
      </div>
    );
  }

  if (!paciente || !detallesCobro.length) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate("/cotizaciones")}
          className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
        >
          Volver
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded p-4">
          No hay detalles válidos para procesar el cobro de esta cotización.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <button
        onClick={() => navigate("/cotizaciones")}
        className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
      >
        Volver a cotizaciones
      </button>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4 text-sm text-blue-800">
        <div><b>Cotización:</b> #{cotizacion.id}</div>
        <div><b>Paciente:</b> {paciente.nombre} {paciente.apellido}</div>
        <div><b>Saldo actual:</b> S/ {Number(cotizacion.saldo_pendiente ?? totalCobro).toFixed(2)}</div>
      </div>

      <CobroModuloFinal
        paciente={paciente}
        servicio={servicioPago}
        detalles={detallesCobro}
        total={totalCobro}
        onCobroCompleto={manejarCobroCompleto}
        onCancelar={() => navigate("/cotizaciones")}
      />
    </div>
  );
}
