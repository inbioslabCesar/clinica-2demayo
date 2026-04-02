import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import Spinner from "../components/comunes/Spinner";
import { BASE_URL } from "../config/config";

const BRAND_CACHE_KEY = "detalle_cotizacion_brand_cache_v1";
const BRAND_CACHE_TTL_MS = 5 * 60 * 1000;

function buildBrandFromConfig(cfg = {}) {
  const rawLogo = String(cfg.logo_url || "").trim();
  const logo = rawLogo
    ? (/^(https?:\/\/|data:|blob:)/i.test(rawLogo)
      ? rawLogo
      : `${String(BASE_URL || "").replace(/\/+$/, "")}/${rawLogo.replace(/^\/+/, "")}`)
    : "";

  return {
    nombre: String(cfg.nombre_clinica || "MI CLINICA").trim().toUpperCase(),
    logo,
    direccion: String(cfg.direccion || "").trim(),
    telefono: String(cfg.telefono || "").trim(),
    celular: String(cfg.celular || cfg.telefono_secundario || cfg.contacto_emergencias || "").trim(),
    ruc: String(cfg.ruc || "").trim(),
    slogan: String(cfg.slogan || "").trim(),
    slogan_color: String(cfg.slogan_color || "").trim(),
    nombre_color: String(cfg.nombre_color || "").trim(),
    email: String(cfg.email || "").trim(),
  };
}

const serviceLabels = {
  laboratorio: "Laboratorio",
  farmacia: "Farmacia",
  rayosx: "Rayos X",
  rayos_x: "Rayos X",
  ecografia: "Ecografia",
  operacion: "Operacion",
  operaciones: "Operacion",
  procedimiento: "Procedimiento",
  procedimientos: "Procedimiento",
  consulta: "Consulta",
};

function normalizarServicio(value) {
  const base = String(value || "").toLowerCase().trim();
  if (!base) return "otros";
  if (base === "rayos x" || base === "rayos_x") return "rayosx";
  if (base === "operaciones") return "operacion";
  if (base === "procedimientos") return "procedimiento";
  return base;
}

function labelServicio(tipo) {
  const key = normalizarServicio(tipo);
  return serviceLabels[key] || "Otros";
}

function limpiarDescripcionConsulta(descripcion) {
  const raw = String(descripcion || "").trim();
  if (!raw) return "-";

  // Formato típico: "SERVICIO - NOMBRE MEDICO (YYYY-MM-DD HH:MM)"
  // Para evitar redundancia, en la columna descripción solo dejamos el servicio.
  const match = raw.match(/^(.*?)\s*-\s*.+?\s*\(\d{4}-\d{2}-\d{2}[^)]*\)\s*$/);
  if (match && match[1]) {
    return String(match[1]).trim() || raw;
  }

  return raw;
}

export default function DetalleCotizacionPage() {
  const navigate = useNavigate();
  const { cotizacionId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cotizacion, setCotizacion] = useState(null);
  const [paciente, setPaciente] = useState(null);
  const [clinicBrand, setClinicBrand] = useState({
    nombre: "MI CLINICA",
    logo: "",
    direccion: "",
    telefono: "",
    celular: "",
    ruc: "",
    slogan: "",
    slogan_color: "",
    nombre_color: "",
    email: "",
  });
  const themeGradient = {
    backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)",
  };
  const themePrimarySoft = {
    backgroundColor: "var(--color-primary-light)",
    borderColor: "var(--color-primary-light)",
    color: "var(--color-primary-dark)",
  };

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
          throw new Error(dataCot?.error || "No se pudo cargar la cotizacion");
        }

        const cot = dataCot.cotizacion;
        const pacienteData = {
          id: Number(cot?.paciente_id || 0),
          nombre: String(cot?.nombre || ""),
          apellido: String(cot?.apellido || ""),
          dni: String(cot?.dni || ""),
          historia_clinica: String(cot?.historia_clinica || ""),
        };

        if (!mounted) return;
        setCotizacion(cot);
        setPaciente(pacienteData);
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || "No se pudo cargar el detalle de la cotizacion");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargar();
    return () => {
      mounted = false;
    };
  }, [cotizacionId]);

  useEffect(() => {
    let mounted = true;
    const applyCachedBrand = () => {
      try {
        const raw = sessionStorage.getItem(BRAND_CACHE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        const ts = Number(parsed?.ts || 0);
        const payload = parsed?.data;
        if (!payload || !ts || (Date.now() - ts) > BRAND_CACHE_TTL_MS) {
          sessionStorage.removeItem(BRAND_CACHE_KEY);
          return false;
        }
        if (mounted) setClinicBrand(payload);
        return true;
      } catch {
        return false;
      }
    };

    if (applyCachedBrand()) {
      return () => {
        mounted = false;
      };
    }

    fetch(`${BASE_URL}api_get_configuracion.php`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !data?.success) return;
        const brand = buildBrandFromConfig(data.data || {});
        setClinicBrand(brand);
        try {
          sessionStorage.setItem(BRAND_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: brand }));
        } catch {
          // Ignorar fallos de cuota o bloqueo de almacenamiento.
        }
      })
      .catch(() => {
        // Mantener valores por defecto si falla la carga de configuración.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const detallesActivos = useMemo(() => {
    const detalles = Array.isArray(cotizacion?.detalles) ? cotizacion.detalles : [];
    return detalles.filter((d) => String(d?.estado_item || "activo").toLowerCase() !== "eliminado" && Number(d?.cantidad || 0) > 0);
  }, [cotizacion]);

  const resumenServicios = useMemo(() => {
    const map = {};
    for (const d of detallesActivos) {
      const tipo = normalizarServicio(d?.servicio_tipo);
      if (!map[tipo]) {
        map[tipo] = { tipo, label: labelServicio(tipo), items: 0, subtotal: 0 };
      }
      map[tipo].items += 1;
      map[tipo].subtotal += Number(d?.subtotal || 0);
    }
    return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
  }, [detallesActivos]);

  const totalItemsBruto = useMemo(() => {
    return detallesActivos.reduce((acc, d) => acc + Number(d?.subtotal || 0), 0);
  }, [detallesActivos]);

  const totalNetoCotizacion = useMemo(() => Number(cotizacion?.total || 0), [cotizacion?.total]);

  const descuentoAplicado = useMemo(() => {
    const bruto = Number(totalItemsBruto || 0);
    const neto = Number(totalNetoCotizacion || 0);
    if (!Number.isFinite(bruto) || !Number.isFinite(neto)) return 0;
    return Math.max(0, Number((bruto - neto).toFixed(2)));
  }, [totalItemsBruto, totalNetoCotizacion]);

  const detallesConNeto = useMemo(() => {
    const base = Array.isArray(detallesActivos) ? detallesActivos : [];
    if (!base.length) return [];

    const descuentoTotal = Number(descuentoAplicado || 0);
    if (descuentoTotal <= 0) {
      return base.map((d) => ({
        ...d,
        descuento_item: 0,
        subtotal_neto: Number(d?.subtotal || 0),
      }));
    }

    const totalBruto = Math.max(0, Number(totalItemsBruto || 0));
    if (totalBruto <= 0) {
      return base.map((d) => ({
        ...d,
        descuento_item: 0,
        subtotal_neto: Number(d?.subtotal || 0),
      }));
    }

    const salida = [];
    let descuentoAsignado = 0;

    for (let i = 0; i < base.length; i += 1) {
      const d = base[i];
      const subtotal = Number(d?.subtotal || 0);
      let descuentoItem = 0;

      if (i < base.length - 1) {
        descuentoItem = Number(((subtotal / totalBruto) * descuentoTotal).toFixed(2));
        descuentoAsignado += descuentoItem;
      } else {
        descuentoItem = Number((descuentoTotal - descuentoAsignado).toFixed(2));
      }

      const subtotalNeto = Math.max(0, Number((subtotal - descuentoItem).toFixed(2)));
      salida.push({
        ...d,
        descuento_item: descuentoItem,
        subtotal_neto: subtotalNeto,
      });
    }

    return salida;
  }, [detallesActivos, descuentoAplicado, totalItemsBruto]);

  const estado = String(cotizacion?.estado || "").toLowerCase();
  const puedeEditar = estado !== "anulada";
  const puedeCobrar = (estado === "pendiente" || estado === "parcial") && Number(cotizacion?.saldo_pendiente || 0) > 0;

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const emitirTicket = async () => {
    if (!cotizacion) return;
    const fecha = cotizacion?.fecha ? new Date(cotizacion.fecha).toLocaleString("es-PE") : "-";
    const nombrePaciente = paciente
      ? `${paciente.nombre || ""} ${paciente.apellido || ""}`.trim()
      : `Paciente ID ${cotizacion?.paciente_id || "-"}`;
    const numeroComprobante = cotizacion?.numero_comprobante || `Q${String(cotizacion?.id || 0).padStart(6, "0")}`;
    const logoHtml = clinicBrand.logo
      ? `<div style="width:100%;display:flex;justify-content:center;align-items:center;margin-bottom:8px;"><img src="${escapeHtml(clinicBrand.logo)}" alt="Logo clinica" style="display:block;margin:0 auto;max-height:64px;max-width:180px;object-fit:contain;" /></div>`
      : "";
    const direccionHtml = clinicBrand.direccion
      ? `<p style="margin:2px 0;text-align:center;">${escapeHtml(clinicBrand.direccion)}</p>`
      : "";
    const telefonoHtml = clinicBrand.telefono
      ? `<p style="margin:2px 0;text-align:center;">Tel: ${escapeHtml(clinicBrand.telefono)}</p>`
      : "";
    const celularHtml = clinicBrand.celular
      ? `<p style="margin:2px 0;text-align:center;">Cel: ${escapeHtml(clinicBrand.celular)}</p>`
      : "";
    const rucHtml = clinicBrand.ruc
      ? `<p style="margin:2px 0;text-align:center;">RUC: ${escapeHtml(clinicBrand.ruc)}</p>`
      : "";

    const detallesHtml = detallesConNeto.length
      ? detallesConNeto
          .map((d) => {
            const rawDesc = String(d?.descripcion || "Servicio");
            const desc = escapeHtml(rawDesc);
            const medicoNombre = String(d?.medico_nombre_completo || "").trim();
            // Agrega el médico solo si su nombre no está ya dentro de la descripción
            const medicoLabel = (medicoNombre && !rawDesc.toLowerCase().includes(medicoNombre.toLowerCase()))
              ? ` - ${escapeHtml(medicoNombre)}`
              : "";
            const cant = Number(d?.cantidad || 1);
            const descItem = Number(d?.descuento_item || 0);
            const neto = Number(d?.subtotal_neto || d?.subtotal || 0).toFixed(2);
            const descuentoTxt = descItem > 0 ? `<span style="color:#b45309;"> (Desc. S/ ${descItem.toFixed(2)})</span>` : "";
            return `<div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0;"><span>${desc}${medicoLabel} x${cant}${descuentoTxt}</span><strong>S/ ${neto}</strong></div>`;
          })
          .join("")
      : "<div>Sin items activos</div>";

    const sloganHtml = clinicBrand.slogan
      ? `<p style="margin:2px 0;text-align:center;font-style:italic;font-size:11px;${clinicBrand.slogan_color ? 'color:' + escapeHtml(clinicBrand.slogan_color) + ';' : ''}">${escapeHtml(clinicBrand.slogan)}</p>`
      : "";
    const emailHtml = clinicBrand.email
      ? `<p style="margin:2px 0;text-align:center;">${escapeHtml(clinicBrand.email)}</p>`
      : "";

    const ticketHtml = `
      <div style="font-family: monospace; width: 320px; margin: 0 auto; font-size: 12px; color:#111;">
        ${logoHtml}
        <h3 style="text-align: center; margin: 0 0 4px;${clinicBrand.nombre_color ? ' color:' + escapeHtml(clinicBrand.nombre_color) + ';' : ''}">${escapeHtml(clinicBrand.nombre || "MI CLINICA")}</h3>
        ${sloganHtml}
        ${direccionHtml}
        ${telefonoHtml}
        ${celularHtml}
        ${emailHtml}
        ${rucHtml}
        <p style="text-align:center;margin:8px 0 2px;"><strong>COMPROBANTE DE COTIZACION</strong></p>
        <hr>
        <p style="margin:4px 0;"><strong>Nro:</strong> ${escapeHtml(numeroComprobante)}</p>
        <p style="margin:4px 0;"><strong>Cotizacion:</strong> #${Number(cotizacion?.id || 0)}</p>
        <p style="margin:4px 0;"><strong>Fecha:</strong> ${escapeHtml(fecha)}</p>
        <p style="margin:4px 0;"><strong>Paciente:</strong> ${escapeHtml(nombrePaciente)}</p>
        <p style="margin:4px 0;"><strong>DNI:</strong> ${escapeHtml(paciente?.dni || "-")}</p>
        <p style="margin:4px 0;"><strong>H.C.:</strong> ${escapeHtml(paciente?.historia_clinica || "-")}</p>
        <hr>
        <p style="margin:4px 0;"><strong>DETALLE</strong></p>
        ${detallesHtml}
        <hr>
        <p style="margin:4px 0;"><strong>Total bruto:</strong> S/ ${Number(totalItemsBruto || 0).toFixed(2)}</p>
        ${descuentoAplicado > 0 ? `<p style="margin:4px 0;color:#b45309;"><strong>Descuento aplicado:</strong> -S/ ${Number(descuentoAplicado).toFixed(2)}</p>` : ""}
        <p style="margin:4px 0;"><strong>Total neto:</strong> S/ ${Number(cotizacion?.total || 0).toFixed(2)}</p>
        <p style="margin:4px 0;"><strong>Pagado:</strong> S/ ${Number(cotizacion?.total_pagado || 0).toFixed(2)}</p>
        <p style="margin:4px 0;"><strong>Saldo:</strong> S/ ${Number(cotizacion?.saldo_pendiente || 0).toFixed(2)}</p>
        <hr>
        <div style="text-align:center; font-size:11px;">Gracias por su preferencia</div>
        <div style="text-align:center; font-size:10px; margin-top:2px;">Conserve este ticket</div>
      </div>
    `;

    const modal = await Swal.fire({
      title: "",
      html: ticketHtml,
      showCancelButton: true,
      confirmButtonText: "Imprimir",
      cancelButtonText: "Cerrar",
      width: 420,
    });

    if (!modal.isConfirmed) return;

    const ventana = window.open("", "_blank", "width=420,height=700");
    if (!ventana) {
      Swal.fire("Atencion", "No se pudo abrir la ventana de impresion. Revisa el bloqueador de ventanas.", "warning");
      return;
    }

    ventana.document.write(`
      <html>
        <head>
          <title>Ticket Cotizacion</title>
          <style>
            @page { size: auto; margin: 8mm; }
            body { margin: 0; padding: 0; }
          </style>
        </head>
        <body>${ticketHtml}</body>
      </html>
    `);
    ventana.document.close();
    ventana.focus();
    ventana.print();
  };

  const abrirAnulacion = async () => {
    const confirm = await Swal.fire({
      title: `Anular cotizacion #${cotizacion?.id}`,
      text: "Se abrira la confirmacion de anulacion en la lista de cotizaciones.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;
    navigate(`/cotizaciones?accion=anular&cotizacion_id=${Number(cotizacion?.id || 0)}`);
  };

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <button onClick={() => navigate("/cotizaciones")} className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver a Cotizaciones</button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--color-primary-dark)" }}>Detalle de Cotizacion #{cotizacion?.id}</h2>
            <div className="text-sm text-gray-600">Fecha: {cotizacion?.fecha || "-"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate("/cotizaciones")} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver a Cotizaciones</button>
            <button onClick={emitirTicket} className="bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-800">Emitir ticket</button>
            {puedeEditar && (
              <button
                onClick={() => navigate(`/seleccionar-servicio?paciente_id=${Number(cotizacion?.paciente_id || 0)}&cotizacion_id=${Number(cotizacion?.id || 0)}&back_to=/cotizaciones&modo=editar`, {
                  state: { pacienteId: Number(cotizacion?.paciente_id || 0), cotizacionId: Number(cotizacion?.id || 0), backTo: "/cotizaciones", modo: "editar" },
                })}
                className="text-white px-4 py-2 rounded"
                style={themeGradient}
              >Editar cotizacion</button>
            )}
            {puedeCobrar && (
              <button onClick={() => navigate(`/cobrar-cotizacion/${Number(cotizacion?.id || 0)}`)} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Cobrar</button>
            )}
            {puedeEditar && (
              <button onClick={abrirAnulacion} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Anular</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded border border-gray-200 p-3 text-sm">
            <div className="text-gray-500">Paciente</div>
            <div className="font-semibold text-gray-800">{paciente ? `${paciente.nombre || ""} ${paciente.apellido || ""}`.trim() : `ID ${cotizacion?.paciente_id || "-"}`}</div>
            <div className="text-gray-600">DNI: {paciente?.dni || "-"}</div>
            <div className="text-gray-600">HC: {paciente?.historia_clinica || "-"}</div>
          </div>
          <div className="bg-gray-50 rounded border border-gray-200 p-3 text-sm">
            <div className="text-gray-500">Estado</div>
            <div className="font-semibold text-gray-800">{cotizacion?.estado || "-"}</div>
            <div className="text-gray-600">Usuario: {cotizacion?.usuario_nombre || "-"}</div>
          </div>
          <div className="bg-gray-50 rounded border border-gray-200 p-3 text-sm">
            <div className="text-gray-500">Resumen economico</div>
            <div className="font-semibold text-gray-800">Total bruto: S/ {Number(totalItemsBruto || 0).toFixed(2)}</div>
            {descuentoAplicado > 0 && (
              <div className="text-amber-700">Descuento: -S/ {Number(descuentoAplicado).toFixed(2)}</div>
            )}
            <div className="font-semibold text-gray-800">Total neto: S/ {Number(cotizacion?.total || 0).toFixed(2)}</div>
            <div className="text-gray-600">Pagado: S/ {Number(cotizacion?.total_pagado || 0).toFixed(2)}</div>
            <div className="text-gray-600">Saldo: S/ {Number(cotizacion?.saldo_pendiente || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="mb-4 border rounded p-3" style={themePrimarySoft}>
          <div className="text-sm font-semibold mb-2" style={{ color: "var(--color-primary-dark)" }}>Servicios cotizados</div>
          {resumenServicios.length === 0 ? (
            <div className="text-sm text-gray-500">Sin items activos.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {resumenServicios.map((s) => (
                <span key={s.tipo} className="text-xs bg-white border rounded px-2 py-1" style={{ borderColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>
                  {s.label}: {s.items} item(s) | S/ {Number(s.subtotal || 0).toFixed(2)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Servicio</th>
                <th className="px-3 py-2 text-left">Descripcion</th>
                <th className="px-3 py-2 text-left">Medico</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio Unitario</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {detallesConNeto.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sin items activos en la cotizacion.</td>
                </tr>
              ) : detallesConNeto.map((d, idx) => (
                <tr key={`${d.servicio_tipo}-${d.servicio_id}-${idx}`} className="border-t">
                  <td className="px-3 py-2">{labelServicio(d.servicio_tipo)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>
                        {normalizarServicio(d?.servicio_tipo) === "consulta"
                          ? limpiarDescripcionConsulta(d?.descripcion)
                          : (d.descripcion || "-")}
                      </span>
                      {(Number(d.derivado) === 1) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap" style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary-dark)", borderColor: "var(--color-primary-light)" }}>
                          🔗 Referenciado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{String(d?.medico_nombre_completo || `${d?.medico_nombre || ""} ${d?.medico_apellido || ""}`).trim() || "-"}</td>
                  <td className="px-3 py-2 text-right">{Number(d.cantidad || 0)}</td>
                  <td className="px-3 py-2 text-right">
                    S/ {Number(d.precio_unitario || 0).toFixed(2)}
                    {Number(d.descuento_item || 0) > 0 && (
                      <span className="block text-[11px] text-amber-700">Desc: -S/ {Number(d.descuento_item || 0).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">S/ {Number(d.subtotal_neto || d.subtotal || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
