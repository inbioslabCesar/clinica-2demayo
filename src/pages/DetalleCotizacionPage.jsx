import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import Spinner from "../components/comunes/Spinner";
import { BASE_URL } from "../config/config";
import { authFetch } from "../utils/apiClient";

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

function formatUserRole(roleRaw) {
  const role = String(roleRaw || '').trim().toLowerCase();
  if (!role) return '';
  if (role === 'admin' || role === 'administrador') return 'Admin';
  if (role.includes('recep')) return 'Recepcion';
  if (role.includes('caja') || role.includes('cajero')) return 'Caja';
  if (role.includes('medico')) return 'Medico';
  return role.charAt(0).toUpperCase() + role.slice(1);
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

function resolverDescripcionDetalle(detalle) {
  const esExterno = Number(detalle?.es_externo || 0) === 1 || Number(detalle?.incluir_en_cobro ?? 1) === 0;
  const nombreExterno = String(detalle?.nombre_externo || "").trim();
  const descripcionBase = String(detalle?.descripcion || "").trim();
  if (esExterno) {
    return nombreExterno || descripcionBase || "Medicamento externo / no disponible";
  }
  return descripcionBase || "-";
}

function esDetalleAdicionalAutorizado(detalle) {
  const flag = Number(detalle?.es_adicional_dinamico || detalle?.adicional_dinamico || 0) === 1
    || Boolean(detalle?.adicional_autorizado || detalle?.adicionalAutorizado);
  if (flag) return true;
  const descripcion = String(detalle?.descripcion || "").toLowerCase();
  const observacion = String(detalle?.observacion_programacion || detalle?.observacionProgramacion || "").toLowerCase();
  return descripcion.includes("adicional autorizado") || observacion.includes("adicional autorizado");
}

function parseSnapshotJson(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  const txt = String(raw || "").trim();
  if (!txt) return null;
  try {
    const parsed = JSON.parse(txt);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function obtenerInfoPaqueteDetalle(detalle) {
  const snapshot = parseSnapshotJson(detalle?.snapshot_json);
  const paqueteTipoRaw = String(
    detalle?.paquete_tipo || snapshot?.paquete_tipo || ""
  ).trim().toLowerCase();
  const paqueteCodigo = String(
    detalle?.paquete_codigo || snapshot?.paquete_codigo || ""
  ).trim();
  const paqueteNombre = String(
    detalle?.paquete_nombre || snapshot?.paquete_nombre || ""
  ).trim();
  const paqueteId = Number(detalle?.paquete_id || snapshot?.paquete_id || 0);

  const esPerfil = paqueteTipoRaw === "perfil";
  const esPaquete = paqueteTipoRaw === "paquete";
  const tieneMeta = esPerfil || esPaquete || paqueteId > 0 || paqueteCodigo !== "" || paqueteNombre !== "";
  if (!tieneMeta) return null;

  const tipoLabel = esPerfil ? "Perfil" : "Paquete";
  let nombreVisible = paqueteNombre;
  if (!nombreVisible && paqueteCodigo) nombreVisible = paqueteCodigo;
  if (!nombreVisible && paqueteId > 0) nombreVisible = `${tipoLabel} #${paqueteId}`;

  const codigoVisible = paqueteCodigo && paqueteCodigo !== nombreVisible ? paqueteCodigo : "";
  return {
    tipo: esPerfil ? "perfil" : "paquete",
    tipoLabel,
    nombre: nombreVisible || tipoLabel,
    codigo: codigoVisible,
    clave: `${esPerfil ? "perfil" : "paquete"}:${paqueteId}:${paqueteCodigo}:${nombreVisible}`,
  };
}

function clavePagoServicio(tipo, servicioId) {
  return `${normalizarServicio(tipo)}:${Number(servicioId || 0)}`;
}

function esMovimientoDescuento(pago) {
  const tipo = String(pago?.tipo_movimiento || "").toLowerCase().trim();
  if (tipo !== "devolucion") return false;
  const descripcion = String(pago?.descripcion || "").toLowerCase();
  return descripcion.includes("descuento aplicado")
    || descripcion.startsWith("descuento");
}

function esMovimientoAjusteConversionPaquete(pago) {
  const descripcion = String(pago?.descripcion || "").toLowerCase();
  return descripcion.includes("ajuste por conversión a paquete en adenda")
    || descripcion.includes("ajuste por conversion a paquete en adenda");
}

function esMovimientoAbono(pago) {
  return String(pago?.tipo_movimiento || "abono").toLowerCase() === "abono";
}

function construirPagosFallbackDesdeCobros(cotizacion, cobros) {
  const detalles = Array.isArray(cotizacion?.detalles) ? cotizacion.detalles : [];
  const detallesActivos = detalles.filter(
    (d) => String(d?.estado_item || "activo").toLowerCase() !== "eliminado" && Number(d?.cantidad || 0) > 0
  );
  const clavesCotizacion = new Set(
    detallesActivos.map((d) => clavePagoServicio(d?.servicio_tipo, d?.servicio_id))
  );

  if (clavesCotizacion.size === 0) return [];

  const totalCotizacion = Math.max(0, Number(cotizacion?.total || 0));
  if (totalCotizacion <= 0) return [];

  const cobrosRelacionados = (Array.isArray(cobros) ? cobros : [])
    .filter((cobro) => {
      const detallesCobro = Array.isArray(cobro?.detalles) ? cobro.detalles : [];
      return detallesCobro.some((detalle) => clavesCotizacion.has(clavePagoServicio(detalle?.servicio_tipo, detalle?.servicio_id)));
    })
    .sort((a, b) => {
      const fechaA = new Date(a?.fecha_cobro || 0).getTime();
      const fechaB = new Date(b?.fecha_cobro || 0).getTime();
      if (fechaA !== fechaB) return fechaA - fechaB;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });

  let acumulado = 0;
  const salida = [];

  for (const cobro of cobrosRelacionados) {
    const montoCobro = Math.max(0, Number(cobro?.total || 0));
    const saldoAnterior = Math.max(0, Number((totalCotizacion - acumulado).toFixed(2)));
    const montoAplicado = Math.min(montoCobro, saldoAnterior);
    if (montoAplicado <= 0) continue;

    acumulado = Number((acumulado + montoAplicado).toFixed(2));
    const saldoNuevo = Math.max(0, Number((totalCotizacion - acumulado).toFixed(2)));

    salida.push({
      id: `fallback-${cobro?.id || salida.length}`,
      cobro_id: Number(cobro?.id || 0),
      tipo_movimiento: "abono",
      monto: montoAplicado,
      saldo_anterior: saldoAnterior,
      saldo_nuevo: saldoNuevo,
      descripcion: `Abono detectado desde cobro #${cobro?.id || "-"}`,
      usuario_id: Number(cobro?.usuario_id || 0),
      usuario_nombre: cobro?.usuario_nombre || "Sistema",
      metodo_pago: cobro?.tipo_pago || "",
      created_at: cobro?.fecha_cobro || null,
      fallback: true,
    });

    if (saldoNuevo <= 0) break;
  }

  return salida.reverse();
}

function parseGroupIdsFromSearch(search, fallbackId) {
  const ids = [];
  const sp = new URLSearchParams(search || "");
  const raw = String(sp.get("grupo") || "").trim();
  if (raw) {
    raw.split(",").forEach((token) => {
      const id = Number(String(token || "").trim());
      if (Number.isFinite(id) && id > 0) {
        ids.push(id);
      }
    });
  }

  const fallback = Number(fallbackId || 0);
  if (Number.isFinite(fallback) && fallback > 0) {
    ids.push(fallback);
  }

  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function resolverEstadoGrupoCotizacion(items) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return "pendiente";

  const total = rows.reduce((acc, row) => acc + Number(row?.total || 0), 0);
  const totalPagado = rows.reduce((acc, row) => acc + Number(row?.total_pagado || 0), 0);
  const saldo = rows.reduce((acc, row) => acc + Number(row?.saldo_pendiente || 0), 0);

  if (saldo <= 0.00001 && total > 0) return "pagado";
  if (totalPagado > 0.00001) return "parcial";

  const estados = rows.map((row) => String(row?.estado || "").toLowerCase());
  if (estados.includes("informativo") && total <= 0.00001) return "informativo";
  if (estados.length > 0 && estados.every((estado) => estado === "anulada")) return "anulada";

  return "pendiente";
}

export default function DetalleCotizacionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cotizacionId } = useParams();
  const autoTicketShownRef = useRef(false);
  const grupoIds = useMemo(
    () => parseGroupIdsFromSearch(location.search, cotizacionId),
    [location.search, cotizacionId]
  );
  const grupoKey = useMemo(() => grupoIds.join(","), [grupoIds]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cotizacion, setCotizacion] = useState(null);
  const [paciente, setPaciente] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [ajustandoDetalleId, setAjustandoDetalleId] = useState(0);
  const [eliminandoDetalleId, setEliminandoDetalleId] = useState(0);
  const [devolviendoDetalleId, setDevolviendoDetalleId] = useState(0);
  const [agregandoMedicamento, setAgregandoMedicamento] = useState(false);
  const [agregandoAnalisis, setAgregandoAnalisis] = useState(false);
  const [paquetesExpandido, setPaquetesExpandido] = useState({});
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
  const buildCotizacionDetalleUrl = (id, cacheBuster, includeCadena = false) =>
    `api_cotizaciones.php?cotizacion_id=${Number(id)}&include_bloque=0${includeCadena ? "&include_cadena=1" : ""}&_t=${cacheBuster}`;

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const cacheBuster = Date.now();
        let cot = null;
        let pacienteData = null;
        let pagosCargados = [];

        const construirVistaGrupo = async (idsGrupoRaw) => {
          const idsGrupoNormalizados = Array.from(new Set(
            (Array.isArray(idsGrupoRaw) ? idsGrupoRaw : [])
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0)
          ));
          if (idsGrupoNormalizados.length <= 1) {
            return null;
          }

          const respuestasCot = await Promise.all(
            idsGrupoNormalizados.map(async (id) => {
              const res = await authFetch(buildCotizacionDetalleUrl(id, cacheBuster), { cache: "no-store" });
              const data = await res.json();
              if (!data?.success || !data?.cotizacion) return null;
              return data.cotizacion;
            })
          );

          const cotizacionesGrupo = respuestasCot.filter(Boolean);
          if (cotizacionesGrupo.length === 0) {
            throw new Error("No se pudo cargar el detalle del episodio");
          }

          const cotizacionBase = cotizacionesGrupo.find((item) => Number(item?.id || 0) === Number(cotizacionId || 0))
            || cotizacionesGrupo[0];

          const detallesGrupo = cotizacionesGrupo.flatMap((item) => {
            const detalleList = Array.isArray(item?.detalles) ? item.detalles : [];
            return detalleList.map((detalle) => ({
              ...detalle,
              cotizacion_origen_id: Number(item?.id || 0),
            }));
          });

          const cotizacionesById = {};
          cotizacionesGrupo.forEach((item) => {
            const id = Number(item?.id || 0);
            if (id > 0) cotizacionesById[id] = item;
          });

          const respuestasPagos = await Promise.all(
            idsGrupoNormalizados.map(async (id) => {
              const resPagos = await authFetch(`api_cotizaciones.php?accion=pagos&cotizacion_id=${id}&_t=${cacheBuster}`, { cache: "no-store" });
              const dataPagos = await resPagos.json();
              let list = dataPagos?.success && Array.isArray(dataPagos?.pagos) ? dataPagos.pagos : [];
              if (list.length === 0) {
                const pagosEmbebidos = Array.isArray(cotizacionesById[id]?.pagos) ? cotizacionesById[id].pagos : [];
                list = pagosEmbebidos;
              }
              return list.map((pago, idx) => ({
                ...pago,
                id: `${id}-${pago?.id || idx}`,
                cotizacion_origen_id: id,
              }));
            })
          );

          const pagosGrupo = respuestasPagos.flat().sort((a, b) => {
            const ta = new Date(a?.created_at || 0).getTime();
            const tb = new Date(b?.created_at || 0).getTime();
            if (ta !== tb) return ta - tb;
            return String(a?.id || "").localeCompare(String(b?.id || ""));
          });
          pagosCargados = pagosGrupo;

          const totalGrupo = cotizacionesGrupo.reduce((acc, item) => acc + Number(item?.total || 0), 0);
          const pagadoGrupo = cotizacionesGrupo.reduce((acc, item) => acc + Number(item?.total_pagado || 0), 0);
          const saldoGrupo = cotizacionesGrupo.reduce((acc, item) => acc + Number(item?.saldo_pendiente || 0), 0);
          const estadoGrupo = resolverEstadoGrupoCotizacion(cotizacionesGrupo);
          const idsGrupo = cotizacionesGrupo.map((item) => Number(item?.id || 0)).filter((id) => id > 0).sort((a, b) => a - b);

          return {
            ...cotizacionBase,
            vista_grupo: 1,
            grupo_ids: idsGrupo,
            total: Number(totalGrupo.toFixed(2)),
            total_pagado: Number(pagadoGrupo.toFixed(2)),
            saldo_pendiente: Number(saldoGrupo.toFixed(2)),
            estado: estadoGrupo,
            detalles: detallesGrupo,
            pagos: pagosGrupo,
          };
        };

        if (grupoIds.length > 1) {
          cot = await construirVistaGrupo(grupoIds);
        } else {
          const resCot = await authFetch(buildCotizacionDetalleUrl(cotizacionId, cacheBuster, true), {
            cache: "no-store",
          });
          const dataCot = await resCot.json();
          if (!dataCot?.success || !dataCot?.cotizacion) {
            throw new Error(dataCot?.error || "No se pudo cargar la cotizacion");
          }

          cot = dataCot.cotizacion;
          const cadenaIds = Array.isArray(cot?.cotizacion_cadena_ids) ? cot.cotizacion_cadena_ids : [];
          if (cadenaIds.length > 1) {
            cot = await construirVistaGrupo(cadenaIds);
          }
          const pagosEmbebidos = Array.isArray(cot?.pagos) ? cot.pagos : null;
          if (Number(cot?.vista_grupo || 0) !== 1 || !Array.isArray(pagosCargados) || pagosCargados.length === 0) {
            pagosCargados = Array.isArray(pagosEmbebidos) ? pagosEmbebidos : null;
          }
          if (!Array.isArray(pagosCargados) || pagosCargados.length === 0) {
            const resPagos = await authFetch(
              `api_cotizaciones.php?accion=pagos&cotizacion_id=${Number(cotizacionId)}&_t=${cacheBuster}`,
              {
                cache: "no-store",
              }
            );
            const dataPagos = await resPagos.json();
            pagosCargados = dataPagos?.success && Array.isArray(dataPagos?.pagos) ? dataPagos.pagos : [];
          }
        }

        pacienteData = {
          id: Number(cot?.paciente_id || 0),
          nombre: String(cot?.nombre || ""),
          apellido: String(cot?.apellido || ""),
          dni: String(cot?.dni || ""),
          historia_clinica: String(cot?.historia_clinica || ""),
        };

        if ((!Array.isArray(pagosCargados) || pagosCargados.length === 0) && pacienteData.id > 0) {
          const resCobros = await authFetch(
            `api_cobros.php?paciente_id=${Number(pacienteData.id)}&_t=${cacheBuster}`,
            {
              cache: "no-store",
            }
          );
          const dataCobros = await resCobros.json();
          const cobrosPaciente = dataCobros?.success && Array.isArray(dataCobros?.cobros) ? dataCobros.cobros : [];
          pagosCargados = construirPagosFallbackDesdeCobros(cot, cobrosPaciente);
        }

        if (!mounted) return;
        setCotizacion(cot);
        setPaciente(pacienteData);
        setPagos(Array.isArray(pagosCargados) ? pagosCargados : []);
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
  }, [cotizacionId, grupoKey, grupoIds]);

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

    authFetch("api_get_configuracion.php", {
      method: "GET",
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

  const resumenPaquetes = useMemo(() => {
    const map = {};
    for (const d of detallesActivos) {
      const infoPaquete = obtenerInfoPaqueteDetalle(d);
      if (!infoPaquete) continue;

      const key = infoPaquete.clave;
      if (!map[key]) {
        map[key] = {
          ...infoPaquete,
          items: 0,
          subtotal: 0,
        };
      }
      map[key].items += 1;
      map[key].subtotal += Number(d?.subtotal || 0);
    }
    return Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre));
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

  const detallesRender = useMemo(() => {
    return detallesConNeto.map((d, idx) => {
      const servicioNorm = normalizarServicio(d?.servicio_tipo);
      const descripcionDetalle = resolverDescripcionDetalle(d);
      const descripcionVisible = servicioNorm === "consulta"
        ? limpiarDescripcionConsulta(descripcionDetalle)
        : descripcionDetalle;
      return {
        raw: d,
        key: `${d.servicio_tipo}-${d.servicio_id}-${Number(d?.id || 0)}-${idx}`,
        servicioNorm,
        servicioLabel: labelServicio(d?.servicio_tipo),
        descripcionVisible,
        infoPaquete: obtenerInfoPaqueteDetalle(d),
        esExternoNoCobrable: Number(d?.es_externo || 0) === 1 || Number(d?.incluir_en_cobro ?? 1) === 0,
        esDerivado: Number(d?.derivado || 0) === 1,
        esAdicionalAutorizado: esDetalleAdicionalAutorizado(d),
        medicoVisible: String(d?.medico_nombre_completo || `${d?.medico_nombre || ""} ${d?.medico_apellido || ""}`).trim() || "-",
      };
    });
  }, [detallesConNeto]);
  const resumenComponentesPaquete = useMemo(() => {
    const map = {};
    detallesRender.forEach((row, idx) => {
      if (!row?.infoPaquete) return;
      const key = String(row.infoPaquete.clave || "");
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          key,
          firstIndex: idx,
          items: 0,
          subtotal: 0,
          subtotalBruto: 0,
          info: row.infoPaquete,
          componentes: [],
        };
      }
      map[key].items += 1;
      map[key].subtotal += Number(row?.raw?.subtotal_neto || row?.raw?.subtotal || 0);
      map[key].subtotalBruto += Number(row?.raw?.subtotal || 0);
      map[key].componentes.push({
        key: row.key,
        servicioLabel: row.servicioLabel,
        descripcion: row.descripcionVisible,
        medico: row.medicoVisible,
        cantidad: Number(row?.raw?.cantidad || 0),
        subtotal: Number(row?.raw?.subtotal_neto || row?.raw?.subtotal || 0),
      });
      if (idx < map[key].firstIndex) {
        map[key].firstIndex = idx;
      }
    });
    return map;
  }, [detallesRender]);
  const colapsarComponentesPaquete = useMemo(() => {
    const groups = Object.values(resumenComponentesPaquete);
    return groups.some((g) => Number(g?.items || 0) > 1);
  }, [resumenComponentesPaquete]);
  const tiposServicioEnPaquete = useMemo(() => {
    const set = new Set();
    if (!colapsarComponentesPaquete) return set;
    detallesRender.forEach((row) => {
      if (row?.infoPaquete && row?.servicioNorm) {
        set.add(String(row.servicioNorm));
      }
    });
    return set;
  }, [colapsarComponentesPaquete, detallesRender]);
  useEffect(() => {
    setPaquetesExpandido({});
  }, [grupoKey, cotizacion?.id]);

  const pagosRender = useMemo(() => {
    if (Array.isArray(pagos) && pagos.length > 0) {
      return pagos;
    }
    if (Array.isArray(cotizacion?.pagos) && cotizacion.pagos.length > 0) {
      return cotizacion.pagos;
    }
    return [];
  }, [pagos, cotizacion?.pagos]);

  const pagosVisibles = useMemo(() => {
    const base = pagosRender.filter((pago) => {
      const tipo = String(pago?.tipo_movimiento || "abono").toLowerCase();
      const esCobroAnulado = String(pago?.cobro_estado || "").toLowerCase() === "anulado";
      if (tipo === "abono" && esCobroAnulado) return false;
      return true;
    });

    const salida = [...base];
    const ajustes = salida
      .map((pago, idx) => ({ pago, idx }))
      .filter(({ pago }) => String(pago?.tipo_movimiento || "").toLowerCase() === "devolucion" && esMovimientoAjusteConversionPaquete(pago))
      .sort((a, b) => b.idx - a.idx);

    for (const { pago: ajuste, idx: idxAjuste } of ajustes) {
      const montoAjuste = Number(ajuste?.monto || 0);
      if (!Number.isFinite(montoAjuste) || montoAjuste <= 0) continue;

      let idxAbonoPosterior = -1;
      for (let i = idxAjuste + 1; i < salida.length; i += 1) {
        const candidato = salida[i];
        if (!esMovimientoAbono(candidato)) continue;
        const montoAbono = Number(candidato?.monto || 0);
        if (!Number.isFinite(montoAbono) || montoAbono <= 0) continue;
        idxAbonoPosterior = i;
        break;
      }
      if (idxAbonoPosterior === -1) continue;

      const abonoPosterior = salida[idxAbonoPosterior];
      const montoAbonoPosterior = Number(abonoPosterior?.monto || 0);
      const montoNetoUpgrade = Number((montoAbonoPosterior - montoAjuste).toFixed(2));
      if (!Number.isFinite(montoNetoUpgrade) || montoNetoUpgrade <= 0) continue;
      const saldoAnteriorTecnico = Math.max(0, Number(abonoPosterior?.saldo_anterior || 0));
      const saldoNuevoTecnico = Math.max(0, Number(abonoPosterior?.saldo_nuevo || 0));
      const saldoAnteriorComercial = Math.max(0, Number((saldoAnteriorTecnico - montoAjuste).toFixed(2)));
      const saldoNuevoComercial = Math.max(0, Number((saldoNuevoTecnico - montoAjuste).toFixed(2)));

      const filaNeta = {
        ...abonoPosterior,
        id: `upgrade-neto-${ajuste?.id || idxAjuste}-${abonoPosterior?.id || idxAbonoPosterior}`,
        tipo_movimiento: "abono_upgrade",
        monto: montoAbonoPosterior,
        saldo_anterior: saldoAnteriorComercial,
        saldo_nuevo: saldoNuevoComercial,
        descripcion: "Pago de diferencia de paquete",
        _origen_ajuste_conversion: 1,
      };

      salida.splice(idxAbonoPosterior, 1, filaNeta);
      salida.splice(idxAjuste, 1);
    }

    return salida;
  }, [pagosRender]);

  const pagosOcultosAnulados = useMemo(() => {
    return Math.max(0, pagosRender.length - pagosVisibles.length);
  }, [pagosRender.length, pagosVisibles.length]);

  const estado = String(cotizacion?.estado || "").toLowerCase();
  const esVistaGrupo = Number(cotizacion?.vista_grupo || 0) === 1;
  const resumenUpgradePaquete = useMemo(() => {
    if (!esVistaGrupo) return null;
    if (!Array.isArray(pagosRender) || pagosRender.length === 0) return null;
    if (!Array.isArray(resumenPaquetes) || resumenPaquetes.length === 0) return null;

    const movimientosAjuste = pagosRender.filter((p) => esMovimientoAjusteConversionPaquete(p));
    if (movimientosAjuste.length === 0) return null;

    const tsAjuste = movimientosAjuste
      .map((p) => new Date(p?.created_at || 0).getTime())
      .filter((ts) => Number.isFinite(ts) && ts > 0)
      .sort((a, b) => a - b)[0];
    if (!Number.isFinite(tsAjuste) || tsAjuste <= 0) return null;

    const totalPaquete = Number(
      resumenPaquetes.reduce((acc, p) => acc + Number(p?.subtotal || 0), 0).toFixed(2)
    );
    if (totalPaquete <= 0) return null;

    const netoPorRango = (include) => {
      return Number(
        pagosRender.reduce((acc, p) => {
          const ts = new Date(p?.created_at || 0).getTime();
          if (!Number.isFinite(ts) || !include(ts)) return acc;
          const tipo = String(p?.tipo_movimiento || "abono").toLowerCase();
          const monto = Number(p?.monto || 0);
          if (!Number.isFinite(monto) || monto <= 0) return acc;
          return tipo === "devolucion" ? (acc - monto) : (acc + monto);
        }, 0).toFixed(2)
      );
    };

    const abonadoPrevio = Math.max(0, netoPorRango((ts) => ts < tsAjuste));
    const porCobrarUpgrade = Math.max(0, Number((totalPaquete - abonadoPrevio).toFixed(2)));
    const netoPosterior = Math.max(0, netoPorRango((ts) => ts >= tsAjuste));
    const abonoUpgrade = Math.min(porCobrarUpgrade, netoPosterior);
    const saldoUpgrade = Math.max(0, Number((porCobrarUpgrade - abonoUpgrade).toFixed(2)));

    return {
      totalPaquete,
      abonadoPrevio,
      porCobrarUpgrade,
      abonoUpgrade: Number(abonoUpgrade.toFixed(2)),
      saldoUpgrade,
    };
  }, [esVistaGrupo, pagosRender, resumenPaquetes]);
  const resumenSoloPaquete = useMemo(() => {
    if (esVistaGrupo) return null;
    if (!Array.isArray(detallesConNeto) || detallesConNeto.length === 0) return null;

    const detallesCobrables = detallesConNeto.filter((d) => (
      Number(d?.cantidad || 0) > 0
      && Number(d?.es_externo || 0) !== 1
      && Number(d?.incluir_en_cobro ?? 1) !== 0
    ));
    if (detallesCobrables.length === 0) return null;

    let subtotalPaquete = 0;
    let infoPaqueteBase = null;
    for (const d of detallesCobrables) {
      const infoPaquete = obtenerInfoPaqueteDetalle(d);
      if (!infoPaquete) {
        return null;
      }
      if (!infoPaqueteBase) {
        infoPaqueteBase = infoPaquete;
      }
      subtotalPaquete += Number(d?.subtotal_neto || d?.subtotal || 0);
    }

    const totalPaquete = Number(cotizacion?.total || 0) > 0
      ? Number(cotizacion?.total || 0)
      : Number(subtotalPaquete.toFixed(2));
    const abonado = Math.max(0, Number(cotizacion?.total_pagado || 0));
    const saldo = Math.max(0, Number(cotizacion?.saldo_pendiente || 0));
    if (totalPaquete <= 0) return null;

    return {
      totalPaquete: Number(totalPaquete.toFixed(2)),
      abonadoPrevio: 0,
      porCobrarUpgrade: Number(Math.max(0, totalPaquete - abonado).toFixed(2)),
      abonoUpgrade: Number(Math.max(0, abonado).toFixed(2)),
      saldoUpgrade: Number(saldo.toFixed(2)),
      etiquetaPaquete: infoPaqueteBase
        ? `${infoPaqueteBase.tipoLabel}: ${infoPaqueteBase.codigo ? `${infoPaqueteBase.codigo} - ` : ""}${infoPaqueteBase.nombre}`
        : "Paquete",
    };
  }, [esVistaGrupo, detallesConNeto, cotizacion?.total, cotizacion?.total_pagado, cotizacion?.saldo_pendiente]);
  const resumenComercialPaquete = resumenUpgradePaquete || resumenSoloPaquete;
  const mostrarLecturaComercialPaquete = useMemo(() => {
    return Boolean(
      resumenComercialPaquete
      && Number(resumenComercialPaquete.totalPaquete || 0) > 0
      && Number(resumenComercialPaquete.saldoUpgrade || 0) >= 0
    );
  }, [resumenComercialPaquete]);
  const ajusteTecnicoConversionTotal = useMemo(() => {
    if (!mostrarLecturaComercialPaquete) return 0;
    return Math.max(0, Number(
      (Array.isArray(pagosRender) ? pagosRender : []).reduce((acc, pago) => {
        if (!esMovimientoAjusteConversionPaquete(pago)) return acc;
        const monto = Number(pago?.monto || 0);
        if (!Number.isFinite(monto) || monto <= 0) return acc;
        return acc + monto;
      }, 0).toFixed(2)
    ));
  }, [mostrarLecturaComercialPaquete, pagosRender]);
  const saldoPendienteGlobal = mostrarLecturaComercialPaquete
    ? Math.max(0, Number((Number(cotizacion?.saldo_pendiente || 0) - ajusteTecnicoConversionTotal).toFixed(2)))
    : Math.max(0, Number(cotizacion?.saldo_pendiente || 0));
  const saldoPendientePaquete = mostrarLecturaComercialPaquete
    ? Math.max(0, Number(resumenComercialPaquete?.saldoUpgrade || 0))
    : 0;
  const totalVisibleResumen = mostrarLecturaComercialPaquete
    ? Number(resumenComercialPaquete?.totalPaquete || 0)
    : Number(cotizacion?.total || 0);
  const pagadoVisibleResumen = mostrarLecturaComercialPaquete
    ? Math.max(0, Number((Number(resumenComercialPaquete?.abonadoPrevio || 0) + Number(resumenComercialPaquete?.abonoUpgrade || 0)).toFixed(2)))
    : Number(cotizacion?.total_pagado || 0);
  const totalComercialEpisodio = mostrarLecturaComercialPaquete
    ? Math.max(totalVisibleResumen, Number(cotizacion?.total || 0))
    : Number(cotizacion?.total || 0);
  const pagadoGlobalComercial = Math.max(0, Number((totalComercialEpisodio - saldoPendienteGlobal).toFixed(2)));
  const adicionalesTotales = mostrarLecturaComercialPaquete
    ? Math.max(0, Number((totalComercialEpisodio - totalVisibleResumen).toFixed(2)))
    : 0;
  const adicionalesPagados = mostrarLecturaComercialPaquete
    ? Math.min(
      adicionalesTotales,
      Math.max(0, Number((pagadoGlobalComercial - pagadoVisibleResumen).toFixed(2)))
    )
    : 0;
  const adicionalesPendientes = mostrarLecturaComercialPaquete
    ? Math.max(0, Number((adicionalesTotales - adicionalesPagados).toFixed(2)))
    : 0;
  const totalPendienteComercial = mostrarLecturaComercialPaquete
    ? Math.max(0, Number((saldoPendientePaquete + adicionalesPendientes).toFixed(2)))
    : saldoPendienteGlobal;
  const pagosHistorialVisibles = useMemo(() => {
    if (!mostrarLecturaComercialPaquete) return pagosVisibles;
    if (!resumenUpgradePaquete) return pagosVisibles;
    return pagosVisibles.filter((pago) => !esMovimientoAjusteConversionPaquete(pago));
  }, [pagosVisibles, mostrarLecturaComercialPaquete, resumenUpgradePaquete]);
  const pagosOcultosHistorial = useMemo(() => {
    return Math.max(0, pagosRender.length - pagosHistorialVisibles.length);
  }, [pagosRender.length, pagosHistorialVisibles.length]);
  const ocultarDesgloseServiciosPorPaquete = Boolean(colapsarComponentesPaquete);
  const saldoVisibleResumen = mostrarLecturaComercialPaquete
    ? Number(totalPendienteComercial || 0)
    : Number(cotizacion?.saldo_pendiente || 0);
  const puedeEditar = !esVistaGrupo && estado !== "anulada";
  const puedeGestionarDevolucion = estado !== "anulada";
  const puedeCobrar = (estado === "pendiente" || estado === "parcial") && Number(saldoVisibleResumen || 0) > 0;

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const parseDecimal = (value) => {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const normalized = String(value).replace(",", ".").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getUnidadesPorCaja = (med) => {
    const candidate = Number(
      med?.unidades_por_caja
      ?? med?.cantidad_por_caja
      ?? med?.unidadesCaja
      ?? 30
    );
    return Number.isFinite(candidate) && candidate > 0 ? candidate : 30;
  };

  const getPrecioVenta = (med) => {
    if (!med) return 0;
    const precioCompra = parseDecimal(med.precio_compra);
    const margen = parseDecimal(med.margen_ganancia);
    const precioConMargen = precioCompra > 0
      ? Number((precioCompra * (1 + margen / 100)).toFixed(2))
      : 0;
    if (precioConMargen > 0) return precioConMargen;
    const precioDirecto = parseDecimal(med.precio_venta ?? med.precio ?? 0);
    return Number(precioDirecto.toFixed(2));
  };

  const emitirTicket = async () => {
    if (!cotizacion) return;
    const fecha = cotizacion?.fecha ? new Date(cotizacion.fecha).toLocaleString("es-PE") : "-";
    const nombrePaciente = paciente
      ? `${paciente.nombre || ""} ${paciente.apellido || ""}`.trim()
      : `Paciente ID ${cotizacion?.paciente_id || "-"}`;
    const usuarioCotizoNombre = String(cotizacion?.usuario_nombre || 'Sistema').trim() || 'Sistema';
    const usuarioCotizoRol = formatUserRole(cotizacion?.usuario_rol || '');
    const usuarioCotizoLabel = usuarioCotizoRol
      ? `${usuarioCotizoNombre} (${usuarioCotizoRol})`
      : usuarioCotizoNombre;
    const numeroComprobante = cotizacion?.numero_comprobante || `Q${String(cotizacion?.id || 0).padStart(6, "0")}`;
    const sloganHtml = clinicBrand.slogan
      ? `<p style="margin:2px 0;text-align:center;font-style:italic;font-size:11px;${clinicBrand.slogan_color ? 'color:' + escapeHtml(clinicBrand.slogan_color) + ';' : ''}">${escapeHtml(clinicBrand.slogan)}</p>`
      : "";
    const emailHtml = clinicBrand.email
      ? `<p style="margin:2px 0;text-align:center;">${escapeHtml(clinicBrand.email)}</p>`
      : "";

    const toMoney = (value) => `S/ ${Number(value || 0).toFixed(2)}`;
    const contactoLinea = [
      clinicBrand.telefono ? `Tel: ${escapeHtml(clinicBrand.telefono)}` : "",
      clinicBrand.celular ? `Cel: ${escapeHtml(clinicBrand.celular)}` : "",
    ].filter(Boolean).join(" | ");

    const esTicketSoloPaquete = Boolean(
      mostrarLecturaComercialPaquete
      && resumenSoloPaquete
      && !resumenUpgradePaquete
    );
    const detallesTicketRender = (mostrarLecturaComercialPaquete && colapsarComponentesPaquete)
      ? detallesRender
          .map((row, idx) => {
            const d = row.raw || {};
            const packKey = String(row?.infoPaquete?.clave || "");
            const packResumen = packKey ? resumenComponentesPaquete[packKey] : null;
            const esFilaPaqueteColapsada = Boolean(row?.infoPaquete);
            if (esFilaPaqueteColapsada && packResumen && packResumen.firstIndex !== idx) {
              return null;
            }
            const totalPaquetesColapsados = Object.keys(resumenComponentesPaquete || {}).length;
            const subtotalPaqueteFila = (esFilaPaqueteColapsada && mostrarLecturaComercialPaquete && totalPaquetesColapsados === 1)
              ? Number(resumenComercialPaquete?.totalPaquete || 0)
              : Number(packResumen?.subtotalBruto || packResumen?.subtotal || 0);
            if (esFilaPaqueteColapsada && packResumen) {
              return {
                rawDesc: `${row?.infoPaquete?.tipoLabel || "Paquete"}: ${row?.infoPaquete?.codigo ? `${row.infoPaquete.codigo} - ` : ""}${row?.infoPaquete?.nombre || "Paquete"}`,
                servicioLabel: row?.infoPaquete?.tipoLabel || "Paquete",
                fechaProgramada: "",
                horaProgramada: "",
                medicoNombre: "",
                esExterno: false,
                cant: 1,
                neto: Number(subtotalPaqueteFila || 0),
              };
            }
            return {
              rawDesc: resolverDescripcionDetalle(d),
              servicioLabel: labelServicio(d?.servicio_tipo) || "Servicio",
              fechaProgramada: String(d?.fecha_programada || "").slice(0, 10),
              horaProgramada: String(d?.hora_programada || "").slice(0, 5),
              medicoNombre: String(d?.medico_nombre_completo || "").trim(),
              esExterno: Number(d?.es_externo || 0) === 1 || Number(d?.incluir_en_cobro ?? 1) === 0,
              cant: Number(d?.cantidad || 1),
              neto: Number(d?.subtotal_neto || d?.subtotal || 0),
            };
          })
          .filter(Boolean)
      : detallesConNeto.map((d) => ({
          rawDesc: resolverDescripcionDetalle(d),
          servicioLabel: labelServicio(d?.servicio_tipo) || "Servicio",
          fechaProgramada: String(d?.fecha_programada || "").slice(0, 10),
          horaProgramada: String(d?.hora_programada || "").slice(0, 5),
          medicoNombre: String(d?.medico_nombre_completo || "").trim(),
          esExterno: Number(d?.es_externo || 0) === 1 || Number(d?.incluir_en_cobro ?? 1) === 0,
          cant: Number(d?.cantidad || 1),
          neto: Number(d?.subtotal_neto || d?.subtotal || 0),
        }));
    const detallesRowsHtml = esTicketSoloPaquete
      ? `<div class="t-item"><div class="t-row"><div class="t-desc">${escapeHtml(resumenSoloPaquete?.etiquetaPaquete || 'Paquete')} x1</div><div class="t-amount">${toMoney(Number(totalVisibleResumen || cotizacion?.total || 0))}</div></div><div class="t-submeta">Servicio: Paquete</div></div>`
      : detallesTicketRender.length
      ? detallesTicketRender
          .map((item) => {
            const rawDesc = String(item?.rawDesc || "");
            const descCorta = rawDesc.length > 34 ? `${rawDesc.slice(0, 31)}...` : rawDesc;
            const desc = escapeHtml(descCorta);
            const servicioLabel = escapeHtml(String(item?.servicioLabel || "Servicio"));
            const fechaProgramadaRaw = String(item?.fechaProgramada || '').slice(0, 10);
            const fechaProgramada = /^\d{4}-\d{2}-\d{2}$/.test(fechaProgramadaRaw)
              ? (() => {
                  const [anio, mes, dia] = fechaProgramadaRaw.split('-');
                  return `${dia}/${mes}/${anio}`;
                })()
              : fechaProgramadaRaw;
            const horaProgramada = String(item?.horaProgramada || '').slice(0, 5);
            const medicoNombre = String(item?.medicoNombre || "").trim();
            const esExterno = Boolean(item?.esExterno);
            const tagExterno = esExterno ? ' [Ext]' : '';
            const medicoLabel = (medicoNombre && !rawDesc.toLowerCase().includes(medicoNombre.toLowerCase()))
              ? ` - ${escapeHtml(medicoNombre.length > 18 ? `${medicoNombre.slice(0, 15)}...` : medicoNombre)}`
              : "";
            const cant = Number(item?.cant || 1);
            const neto = Number(item?.neto || 0);
            const submeta = (servicioLabel || fechaProgramada || horaProgramada)
              ? `<div class="t-submeta">${servicioLabel ? `Servicio: ${servicioLabel}` : ''}${servicioLabel && (fechaProgramada || horaProgramada) ? ' | ' : ''}${fechaProgramada ? `Fecha: ${fechaProgramada}` : ''}${fechaProgramada && horaProgramada ? ' | ' : ''}${horaProgramada ? `Hora: ${horaProgramada}` : ''}</div>`
              : '';
            return `<div class="t-item"><div class="t-row"><div class="t-desc">${desc}${tagExterno}${medicoLabel} x${cant}</div><div class="t-amount">${toMoney(neto)}</div></div>${submeta}</div>`;
          })
          .join("")
      : '<div class="t-meta">Sin items activos</div>';

    const pagosRowsHtml = pagos.length > 0
      ? pagos.map((p) => {
          const fechaPago = p?.created_at ? new Date(p.created_at).toLocaleString("es-PE") : "-";
          const tipoPago = String(p?.tipo_movimiento || "abono").toLowerCase();
          const tipoMov = tipoPago === "devolucion"
            ? (esMovimientoDescuento(p) ? "Descuento" : "Devolucion")
            : "Abono";
          const metodo = String(p?.metodo_pago || "").trim() || "-";
          const monto = Number(p?.monto || 0);
          const saldoNuevo = Number(p?.saldo_nuevo || 0);
          return `<div class="t-pay">${escapeHtml(fechaPago)} | ${escapeHtml(tipoMov)} ${toMoney(monto)} | ${escapeHtml(metodo)} | Saldo ${toMoney(saldoNuevo)}</div>`;
        }).join("")
      : "";

    const ticketCss = `
      <style>
        * { box-sizing: border-box; }
        .ticket-80 {
          width: 100%;
          max-width: 320px;
          margin: 0 auto;
          padding: 8px 10px;
          font-family: "Courier New", "Lucida Console", monospace;
          font-size: 11px;
          line-height: 1.2;
          color: #111827;
          font-weight: 700;
        }
        .ticket-80 .t-center { text-align: center; }
        .ticket-80 .t-logo { max-height: 50px; max-width: 170px; object-fit: contain; margin: 0 auto 4px; display: block; image-rendering: -webkit-optimize-contrast; filter: contrast(1.15) saturate(1.05); }
        .ticket-80 .t-clinic { margin: 2px 0; font-size: 13px; font-weight: 800; letter-spacing: 0.2px; }
        .ticket-80 .t-line { margin: 1px 0; font-weight: 700; }
        .ticket-80 .t-title { margin: 6px 0 2px; font-weight: 800; text-transform: uppercase; text-align: center; }
        .ticket-80 .t-hr { border: 0; border-top: 1px dashed #6b7280; margin: 6px 0; }
        .ticket-80 .t-meta { margin: 1px 0; font-weight: 700; }
        .ticket-80 .t-section { margin: 6px 0 3px; font-weight: 800; text-transform: uppercase; }
        .ticket-80 .t-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
          margin: 1px 0;
        }
        .ticket-80 .t-item { margin: 2px 0 4px; }
        .ticket-80 .t-desc {
          flex: 1;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ticket-80 .t-submeta { margin: 0 0 2px; font-size: 9px; line-height: 1.1; color: #374151; }
        .ticket-80 .t-amount { white-space: nowrap; font-weight: 700; }
        .ticket-80 .t-total { font-size: 12px; font-weight: 700; }
        .ticket-80 .t-pay {
          margin: 1px 0;
          font-size: 10px;
          line-height: 1.15;
          white-space: normal;
          word-break: break-word;
        }
        .ticket-80 .t-note { margin-top: 6px; text-align: center; font-size: 10px; color: #111827; font-weight: 700; }
        @media print {
          @page { size: 80mm auto; margin: 2mm; }
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .ticket-80 {
            width: 76mm;
            max-width: 76mm;
            margin: 0;
            padding: 2.5mm;
            font-size: 10.5px;
            line-height: 1.15;
          }
          .ticket-80 .t-clinic { font-size: 12px; }
          .ticket-80 .t-logo { max-height: 42px; margin-bottom: 3px; }
          .ticket-80 .t-total { font-size: 11.5px; }
          .ticket-80 .t-pay { font-size: 9.6px; }
        }
      </style>`;

    const ticketBody = `
      <div class="ticket-80">
        <div class="t-center">
          ${clinicBrand.logo ? `<img src="${escapeHtml(clinicBrand.logo)}" alt="Logo clinica" class="t-logo" />` : ""}
          <div class="t-clinic"${clinicBrand.nombre_color ? ` style="color:${escapeHtml(clinicBrand.nombre_color)};"` : ""}>${escapeHtml(clinicBrand.nombre || "MI CLINICA")}</div>
          ${sloganHtml ? `<div class="t-line">${sloganHtml.replace(/<\/?p[^>]*>/g, "")}</div>` : ""}
          ${clinicBrand.direccion ? `<div class="t-line">${escapeHtml(clinicBrand.direccion)}</div>` : ""}
          ${contactoLinea ? `<div class="t-line">${contactoLinea}</div>` : ""}
          ${emailHtml ? `<div class="t-line">${emailHtml.replace(/<\/?p[^>]*>/g, "")}</div>` : ""}
          ${clinicBrand.ruc ? `<div class="t-line">RUC: ${escapeHtml(clinicBrand.ruc)}</div>` : ""}
        </div>

        <div class="t-title">Comprobante de cotizacion</div>
        <hr class="t-hr" />
        <div class="t-meta"><strong>Nro:</strong> ${escapeHtml(numeroComprobante)}</div>
        <div class="t-meta"><strong>Cotizacion:</strong> #${Number(cotizacion?.id || 0)}</div>
        <div class="t-meta"><strong>Fecha:</strong> ${escapeHtml(fecha)}</div>
        <div class="t-meta"><strong>Paciente:</strong> ${escapeHtml(nombrePaciente)}</div>
        <div class="t-meta"><strong>DNI:</strong> ${escapeHtml(paciente?.dni || "-")}</div>
        <div class="t-meta"><strong>H.C.:</strong> ${escapeHtml(paciente?.historia_clinica || "-")}</div>
        <div class="t-meta"><strong>Cotizado por:</strong> ${escapeHtml(usuarioCotizoLabel)}</div>

        <hr class="t-hr" />
        <div class="t-section">Detalle</div>
        ${detallesRowsHtml}

        <hr class="t-hr" />
        <div class="t-row"><div class="t-desc"><strong>Total bruto</strong></div><div class="t-amount">${toMoney(totalItemsBruto)}</div></div>
        ${descuentoAplicado > 0 ? `<div class="t-row"><div class="t-desc"><strong>Descuento</strong></div><div class="t-amount">-${toMoney(descuentoAplicado)}</div></div>` : ""}
        <div class="t-row t-total"><div class="t-desc">Total neto</div><div class="t-amount">${toMoney(cotizacion?.total)}</div></div>
        <div class="t-row"><div class="t-desc">Pagado</div><div class="t-amount">${toMoney(cotizacion?.total_pagado)}</div></div>
        <div class="t-row"><div class="t-desc">Saldo</div><div class="t-amount">${toMoney(cotizacion?.saldo_pendiente)}</div></div>

        ${pagosRowsHtml ? `
          <hr class="t-hr" />
          <div class="t-section">Historial de pagos</div>
          ${pagosRowsHtml}
        ` : ""}

        <hr class="t-hr" />
        <div class="t-note">Gracias por su preferencia</div>
        <div class="t-note" style="margin-top:2px;">Conserve este ticket</div>
      </div>
    `;

    const ticketHtml = `${ticketCss}${ticketBody}`;

    const modal = await Swal.fire({
      title: "",
      html: ticketHtml,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Imprimir",
      denyButtonText: "Descargar PDF",
      cancelButtonText: "Cerrar",
      width: 420,
    });

    if (modal.isDenied) {
      const cotizacionPdfId = Number(cotizacion?.id || 0);
      if (cotizacionPdfId > 0) {
        const apiBase = String(BASE_URL || "").replace(/\/+$/, "");
        window.open(`${apiBase}/api_cotizacion_ticket_pdf.php?cotizacion_id=${cotizacionPdfId}&_t=${Date.now()}`, "_blank", "noopener");
      }
      return;
    }

    if (!modal.isConfirmed) return;

    const ventana = window.open("", "_blank", "width=420,height=700");
    if (!ventana) {
      Swal.fire("Atencion", "No se pudo abrir la ventana de impresion. Revisa el bloqueador de ventanas.", "warning");
      return;
    }

    ventana.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ticket Cotizacion</title>${ticketCss}</head><body>${ticketBody}</body></html>`);
    ventana.document.close();

    const imprimirVentana = () => {
      try {
        ventana.focus();
        ventana.print();
      } catch {
        // noop
      }
    };

    const esperarImagenesEImprimir = () => {
      try {
        const imagenes = Array.from(ventana.document.images || []);
        if (imagenes.length === 0) {
          setTimeout(imprimirVentana, 60);
          return;
        }

        let pendientes = imagenes.filter((img) => !img.complete);
        if (pendientes.length === 0) {
          setTimeout(imprimirVentana, 60);
          return;
        }

        let impreso = false;
        const finalizar = () => {
          if (impreso) return;
          impreso = true;
          setTimeout(imprimirVentana, 80);
        };

        const onImgDone = () => {
          pendientes = pendientes.filter((img) => !img.complete);
          if (pendientes.length === 0) finalizar();
        };

        pendientes.forEach((img) => {
          img.addEventListener("load", onImgDone, { once: true });
          img.addEventListener("error", onImgDone, { once: true });
        });

        // Fallback: no bloquear impresión indefinidamente si alguna imagen no reporta evento.
        setTimeout(finalizar, 1200);
      } catch {
        setTimeout(imprimirVentana, 80);
      }
    };

    if (ventana.document.readyState === "complete") {
      esperarImagenesEImprimir();
    } else {
      ventana.addEventListener("load", esperarImagenesEImprimir, { once: true });
      setTimeout(esperarImagenesEImprimir, 250);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const autoEmitir = params.get("emitir_ticket") === "1";
    if (!autoEmitir || loading || !cotizacion?.id || autoTicketShownRef.current) return;
    autoTicketShownRef.current = true;
    emitirTicket();
  }, [location.search, loading, cotizacion?.id]);

  const abrirAnulacion = async () => {
    const confirm = await Swal.fire({
      title: `Anular cotizacion #${cotizacion?.id}`,
      text: "Se abrira la confirmacion de anulacion en la lista de atenciones.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Continuar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;
    navigate(`/cotizaciones?accion=anular&cotizacion_id=${Number(cotizacion?.id || 0)}`);
  };

  const refrescarCotizacionActual = async (targetCotizacionId) => {
    const id = Number(targetCotizacionId || 0);
    if (id <= 0) return;

    const cacheBuster = Date.now();
    const resCot = await authFetch(buildCotizacionDetalleUrl(id, cacheBuster), {
      cache: "no-store",
    });
    const dataCot = await resCot.json();
    if (!dataCot?.success || !dataCot?.cotizacion) {
      throw new Error(dataCot?.error || "No se pudo refrescar la cotizacion");
    }

    const cotRefrescada = dataCot.cotizacion;
    setCotizacion(cotRefrescada);
    setPaciente({
      id: Number(cotRefrescada?.paciente_id || 0),
      nombre: String(cotRefrescada?.nombre || ""),
      apellido: String(cotRefrescada?.apellido || ""),
      dni: String(cotRefrescada?.dni || ""),
      historia_clinica: String(cotRefrescada?.historia_clinica || ""),
    });

    const pagosEmbebidos = Array.isArray(cotRefrescada?.pagos) ? cotRefrescada.pagos : null;
    if (Array.isArray(pagosEmbebidos) && pagosEmbebidos.length > 0) {
      setPagos(pagosEmbebidos);
      return;
    }

    const resPagos = await authFetch(`api_cotizaciones.php?accion=pagos&cotizacion_id=${id}&_t=${cacheBuster}`, {
      cache: "no-store",
    });
    const dataPagos = await resPagos.json();
    setPagos(dataPagos?.success && Array.isArray(dataPagos?.pagos) ? dataPagos.pagos : []);
  };

  const esConflictoVersionCotizacion = ({ status = 0, data = null, error = null } = {}) => {
    const mensaje = String(
      (data && (data.error || data.message))
      || (error && error.message)
      || ""
    ).toLowerCase();
    return status === 409
      || mensaje.includes("cambió mientras editabas")
      || (mensaje.includes("recarga la vista") && mensaje.includes("inténtalo de nuevo"));
  };

  const manejarConflictoVersionCotizacion = async (cotizacionActualId) => {
    await Swal.fire({
      icon: "warning",
      title: "Cambios detectados",
      text: "Otro usuario modificó esta cotización. Se recargará la vista para continuar con datos actualizados.",
      confirmButtonText: "Entendido",
    });
    await refrescarCotizacionActual(cotizacionActualId);
  };

  const ajustarCantidadFarmaciaInline = async (detalle) => {
    const cotizacionActualId = Number(cotizacion?.id || 0);
    const detalleId = Number(detalle?.id || 0);
    const cantidadActual = Math.max(0, Number(detalle?.cantidad || 0));
    const servicioTipo = normalizarServicio(detalle?.servicio_tipo);
    const estadoActual = String(cotizacion?.estado || "").toLowerCase();

    if (cotizacionActualId <= 0 || detalleId <= 0 || cantidadActual <= 0) return;
    if (servicioTipo !== "farmacia") return;
    if (!(estadoActual === "pendiente" || estadoActual === "parcial")) {
      await Swal.fire("No permitido", "Solo puedes ajustar ítems en cotizaciones pendientes o parciales.", "info");
      return;
    }

    const result = await Swal.fire({
      title: "Ajustar cantidad de farmacia",
      width: 680,
      html: `
        <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
          <div><b>Ítem:</b> ${String(detalle?.descripcion || "Medicamento").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <div><b>Cantidad actual:</b> ${cantidadActual}</div>
          <label for="swal-cantidad-nueva">Nueva cantidad (solo disminuir)</label>
          <input id="swal-cantidad-nueva" type="number" min="0" max="${Math.max(0, cantidadActual - 1)}" step="1" class="swal2-input" value="${Math.max(0, cantidadActual - 1)}" />
          <label for="swal-motivo-ajuste">Motivo del ajuste</label>
          <input id="swal-motivo-ajuste" type="text" class="swal2-input" placeholder="Ej. paciente decide llevar menos unidades" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar ajuste",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const cantidadRaw = document.getElementById("swal-cantidad-nueva")?.value;
        const motivoRaw = document.getElementById("swal-motivo-ajuste")?.value;
        const cantidadNueva = Number(cantidadRaw);
        const motivo = String(motivoRaw || "").trim();

        if (!Number.isInteger(cantidadNueva) || cantidadNueva < 0) {
          Swal.showValidationMessage("Ingresa una cantidad válida (entero >= 0).");
          return false;
        }
        if (cantidadNueva >= cantidadActual) {
          Swal.showValidationMessage("La nueva cantidad debe ser menor a la actual.");
          return false;
        }
        if (motivo.length < 4) {
          Swal.showValidationMessage("Ingresa un motivo (mínimo 4 caracteres).");
          return false;
        }
        return { cantidadNueva, motivo };
      },
    });

    if (!result.isConfirmed || !result.value) return;

    try {
      setAjustandoDetalleId(detalleId);
      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "ajustar_cantidad_detalle",
          cotizacion_id: cotizacionActualId,
          cotizacion_detalle_id: detalleId,
          cantidad_nueva: Number(result.value.cantidadNueva),
          expected_version: Number(cotizacion?.version_actual || 0),
          motivo: result.value.motivo,
        }),
      });
      const status = Number(res?.status || 0);
      const data = await res.json();
      if (!data?.success) {
        if (esConflictoVersionCotizacion({ status, data })) {
          await manejarConflictoVersionCotizacion(cotizacionActualId);
          return;
        }
        throw new Error(data?.error || "No se pudo ajustar la cantidad del ítem");
      }

      await refrescarCotizacionActual(cotizacionActualId);
      await Swal.fire("Actualizado", "La cantidad se ajustó correctamente.", "success");
    } catch (err) {
      await Swal.fire("Error", err?.message || "No se pudo ajustar la cantidad", "error");
    } finally {
      setAjustandoDetalleId(0);
    }
  };

  const eliminarDetalleInline = async (detalle) => {
    const cotizacionActualId = Number(cotizacion?.id || 0);
    const detalleId = Number(detalle?.id || 0);
    const cantidadActual = Math.max(0, Number(detalle?.cantidad || 0));
    const servicioTipo = normalizarServicio(detalle?.servicio_tipo);
    const estadoActual = String(cotizacion?.estado || "").toLowerCase();
    if (cotizacionActualId <= 0 || detalleId <= 0 || cantidadActual <= 0) return;
    if (!(servicioTipo === "farmacia" || servicioTipo === "laboratorio")) return;
    if (!(estadoActual === "pendiente" || estadoActual === "parcial")) {
      await Swal.fire("No permitido", "Solo puedes quitar ítems en cotizaciones pendientes o parciales.", "info");
      return;
    }
    const esLaboratorio = servicioTipo === "laboratorio";
    const nombreTipo = esLaboratorio ? "análisis" : "medicamento";
    const placeholderMotivo = esLaboratorio
      ? "Ej. examen duplicado o ya no indicado en evolución"
      : "Ej. paciente ya no desea este medicamento";

    const confirm = await Swal.fire({
      title: `Quitar ${nombreTipo} de la cotización`,
      width: 680,
      html: `
        <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
          <div><b>Ítem:</b> ${String(detalle?.descripcion || (esLaboratorio ? "Análisis" : "Medicamento")).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <div><b>Cantidad actual:</b> ${cantidadActual}</div>
          <label for="swal-motivo-quitar">Motivo de eliminación</label>
          <input id="swal-motivo-quitar" type="text" class="swal2-input" placeholder="${placeholderMotivo}" />
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Quitar",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const motivo = String(document.getElementById("swal-motivo-quitar")?.value || "").trim();
        if (motivo.length < 4) {
          Swal.showValidationMessage("Ingresa un motivo (mínimo 4 caracteres).");
          return false;
        }
        return { motivo };
      },
    });
    if (!confirm.isConfirmed || !confirm.value) return;

    try {
      setEliminandoDetalleId(detalleId);
      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "eliminar_detalle",
          cotizacion_id: cotizacionActualId,
          detalle_id: detalleId,
          expected_version: Number(cotizacion?.version_actual || 0),
          motivo: confirm.value.motivo,
        }),
      });
      const status = Number(res?.status || 0);
      const data = await res.json();
      if (!data?.success) {
        if (esConflictoVersionCotizacion({ status, data })) {
          await manejarConflictoVersionCotizacion(cotizacionActualId);
          return;
        }
        throw new Error(data?.error || `No se pudo quitar el ${nombreTipo}`);
      }

      await refrescarCotizacionActual(cotizacionActualId);
      await Swal.fire("Eliminado", `El ${nombreTipo} se quitó correctamente.`, "success");
    } catch (err) {
      await Swal.fire("Error", err?.message || `No se pudo quitar el ${nombreTipo}`, "error");
    } finally {
      setEliminandoDetalleId(0);
    }
  };

  const devolverDetallePagadoInline = async (detalle) => {
    const cotizacionActualId = Number(cotizacion?.id || 0);
    const cotizacionOrigenId = Number(detalle?.cotizacion_origen_id || 0);
    const cotizacionObjetivoId = esVistaGrupo ? cotizacionOrigenId : cotizacionActualId;
    const detalleId = Number(detalle?.id || 0);
    const cantidadActual = Math.max(0, Number(detalle?.cantidad || 0));
    const precioUnitario = Number(detalle?.precio_unitario || 0);
    const estadoActual = String(cotizacion?.estado || "").toLowerCase();
    const esExterno = Number(detalle?.es_externo || 0) === 1 || Number(detalle?.incluir_en_cobro ?? 1) === 0;

    if (cotizacionObjetivoId <= 0 || detalleId <= 0 || cantidadActual <= 0) return;
    if (esExterno) {
      await Swal.fire("No permitido", "Este ítem no es cobrable, por lo tanto no requiere devolución monetaria.", "info");
      return;
    }
    if (!(estadoActual === "pagado" || estadoActual === "parcial")) {
      await Swal.fire("No permitido", "La devolución parcial aplica solo para cotizaciones pagadas o parciales.", "info");
      return;
    }

    const descripcion = String(detalle?.descripcion || labelServicio(detalle?.servicio_tipo) || "Servicio")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const servicioLabel = labelServicio(detalle?.servicio_tipo);

    const confirm = await Swal.fire({
      title: `Devolver / quitar ${servicioLabel}`,
      width: 720,
      icon: "warning",
      html: `
        <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
          <div><b>Ítem:</b> ${descripcion}</div>
          <div><b>Cantidad actual:</b> ${cantidadActual}</div>
          <div><b>Precio unitario:</b> S/ ${Number(precioUnitario || 0).toFixed(2)}</div>
          <label for="swal-cantidad-devolver">Cantidad a devolver/quitar</label>
          <input id="swal-cantidad-devolver" type="number" min="1" max="${cantidadActual}" step="1" class="swal2-input" value="1" />
          <label for="swal-motivo-devolucion">Motivo de devolución</label>
          <input id="swal-motivo-devolucion" type="text" class="swal2-input" placeholder="Ej. paciente decide no realizar este servicio" />
          <label for="swal-metodo-devolucion">Método de devolución</label>
          <select id="swal-metodo-devolucion" class="swal2-input">
            <option value="efectivo">efectivo</option>
            <option value="yape">yape</option>
            <option value="plin">plin</option>
            <option value="transferencia">transferencia</option>
            <option value="tarjeta">tarjeta</option>
            <option value="otros">otros</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Aplicar devolución",
      cancelButtonText: "Cancelar",
      preConfirm: () => {
        const cantidadRaw = document.getElementById("swal-cantidad-devolver")?.value;
        const motivoRaw = document.getElementById("swal-motivo-devolucion")?.value;
        const metodoRaw = document.getElementById("swal-metodo-devolucion")?.value;
        const cantidadEliminar = Number(cantidadRaw);
        const motivo = String(motivoRaw || "").trim();
        const metodoDevolucion = String(metodoRaw || "").trim().toLowerCase();

        if (!Number.isInteger(cantidadEliminar) || cantidadEliminar <= 0) {
          Swal.showValidationMessage("Ingresa una cantidad válida (entero mayor a 0).");
          return false;
        }
        if (cantidadEliminar > cantidadActual) {
          Swal.showValidationMessage("La cantidad a devolver no puede superar la cantidad actual.");
          return false;
        }
        if (motivo.length < 4) {
          Swal.showValidationMessage("Ingresa un motivo (mínimo 4 caracteres).");
          return false;
        }
        if (!metodoDevolucion) {
          Swal.showValidationMessage("Selecciona el método de devolución.");
          return false;
        }
        return { cantidadEliminar, motivo, metodoDevolucion };
      },
    });

    if (!confirm.isConfirmed || !confirm.value) return;

    try {
      setDevolviendoDetalleId(detalleId);
      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "devolucion_item",
          cotizacion_id: cotizacionObjetivoId,
          cotizacion_detalle_id: detalleId,
          cantidad_eliminar: Number(confirm.value.cantidadEliminar),
          motivo: String(confirm.value.motivo || "").trim(),
          metodo_devolucion: String(confirm.value.metodoDevolucion || "").trim().toLowerCase(),
        }),
      });
      const status = Number(res?.status || 0);
      const data = await res.json();
      if (!data?.success) {
        if (esConflictoVersionCotizacion({ status, data })) {
          await manejarConflictoVersionCotizacion(cotizacionActualId);
          return;
        }
        throw new Error(data?.error || "No se pudo aplicar la devolución parcial del ítem");
      }

      if (esVistaGrupo) {
        window.location.reload();
      } else {
        await refrescarCotizacionActual(cotizacionActualId);
      }
      const montoDevuelto = Number(data?.monto_devuelto || 0);
      await Swal.fire(
        "Devolución aplicada",
        `Se devolvió S/ ${montoDevuelto.toFixed(2)} y la cotización se recalculó correctamente.`,
        "success"
      );
    } catch (err) {
      await Swal.fire("Error", err?.message || "No se pudo aplicar la devolución del ítem", "error");
    } finally {
      setDevolviendoDetalleId(0);
    }
  };

  const agregarAnalisisLaboratorioInline = async () => {
    const cotizacionActualId = Number(cotizacion?.id || 0);
    const pacienteIdActual = Number(cotizacion?.paciente_id || 0);
    const estadoActual = String(cotizacion?.estado || "").toLowerCase();
    if (cotizacionActualId <= 0) return;
    if (!(estadoActual === "pendiente" || estadoActual === "parcial")) {
      await Swal.fire("No permitido", "Solo puedes agregar ítems en cotizaciones pendientes o parciales.", "info");
      return;
    }

    let examenesDisponibles = [];
    let tarifasLaboratorio = [];
    let debounceId = null;

    const cargarCatalogoLaboratorio = async () => {
      const [resExamenes, resTarifas] = await Promise.all([
        authFetch("api_examenes_laboratorio.php", { cache: "no-store" }),
        authFetch("api_tarifas.php", { cache: "no-store" }),
      ]);
      const dataExamenes = await resExamenes.json();
      const dataTarifas = await resTarifas.json();

      examenesDisponibles = Array.isArray(dataExamenes?.examenes) ? dataExamenes.examenes : [];
      tarifasLaboratorio = (Array.isArray(dataTarifas?.tarifas) ? dataTarifas.tarifas : []).filter((item) => (
        normalizarServicio(item?.servicio_tipo) === "laboratorio" && Number(item?.activo || 0) === 1
      ));
    };

    const buscarExamenes = (busqueda = "") => {
      const term = String(busqueda || "").trim().toLowerCase();
      const lista = term.length < 2
        ? examenesDisponibles
        : examenesDisponibles.filter((ex) => String(ex?.nombre || "").toLowerCase().includes(term));
      return lista.slice(0, 120);
    };

    const precioExamen = (examenId) => {
      const examId = Number(examenId || 0);
      const tarifa = tarifasLaboratorio.find((item) => Number(item?.examen_id || 0) === examId);
      if (tarifa) return Number(tarifa?.precio_particular || 0);
      const examen = examenesDisponibles.find((item) => Number(item?.id || 0) === examId);
      return Number(examen?.precio_publico || 0);
    };

    const renderOpcionesExamen = (items = []) => {
      const select = document.getElementById("swal-lab-select");
      const precioInfo = document.getElementById("swal-lab-precio");
      if (!select) return;
      if (!Array.isArray(items) || items.length === 0) {
        select.innerHTML = `<option value="">Sin resultados</option>`;
        if (precioInfo) precioInfo.textContent = "Precio: S/ 0.00";
        return;
      }
      select.innerHTML = items.map((ex) => {
        const id = Number(ex?.id || 0);
        const precio = precioExamen(id);
        const nombre = escapeHtml(String(ex?.nombre || "Examen"));
        return `<option value="${id}">${nombre} (S/ ${precio.toFixed(2)})</option>`;
      }).join("");
      if (precioInfo) {
        const inicialId = Number(select.value || 0);
        precioInfo.textContent = `Precio: S/ ${precioExamen(inicialId).toFixed(2)}`;
      }
    };

    try {
      setAgregandoAnalisis(true);
      await cargarCatalogoLaboratorio();
      const iniciales = buscarExamenes("");

      const modal = await Swal.fire({
        title: "Agregar análisis (laboratorio)",
        width: 760,
        html: `
          <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
            <label for="swal-lab-busqueda">Buscar examen</label>
            <input id="swal-lab-busqueda" type="text" class="swal2-input" placeholder="Escribe al menos 2 letras para filtrar" />
            <label for="swal-lab-select">Examen</label>
            <select id="swal-lab-select" class="swal2-select"></select>
            <div id="swal-lab-precio" style="font-size:12px;color:#475569;">Precio: S/ 0.00</div>
            <label for="swal-lab-derivado">¿Se deriva a laboratorio externo?</label>
            <select id="swal-lab-derivado" class="swal2-select">
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
            <div id="swal-lab-derivacion-bloque" style="display:none;display:grid;gap:8px;">
              <label for="swal-lab-referencia">Laboratorio de referencia</label>
              <input id="swal-lab-referencia" type="text" class="swal2-input" placeholder="Nombre del laboratorio externo" />
              <label for="swal-lab-tipo">¿Monto fijo o porcentaje?</label>
              <select id="swal-lab-tipo" class="swal2-select">
                <option value="">Seleccionar</option>
                <option value="monto">Monto fijo</option>
                <option value="porcentaje">Porcentaje</option>
              </select>
              <label for="swal-lab-valor">Valor de derivación</label>
              <input id="swal-lab-valor" type="number" min="0" step="0.01" class="swal2-input" value="0" />
            </div>
            <label for="swal-lab-motivo">Motivo</label>
            <input id="swal-lab-motivo" type="text" class="swal2-input" placeholder="Ej. examen adicional solicitado por evolución clínica" />
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Agregar",
        cancelButtonText: "Cancelar",
        didOpen: () => {
          renderOpcionesExamen(iniciales);
          const inputBusqueda = document.getElementById("swal-lab-busqueda");
          const selectExamen = document.getElementById("swal-lab-select");
          const selectDerivado = document.getElementById("swal-lab-derivado");
          const bloqueDerivacion = document.getElementById("swal-lab-derivacion-bloque");
          const precioInfo = document.getElementById("swal-lab-precio");

          const refrescarPrecio = () => {
            if (!precioInfo || !selectExamen) return;
            const exId = Number(selectExamen.value || 0);
            precioInfo.textContent = `Precio: S/ ${precioExamen(exId).toFixed(2)}`;
          };
          const toggleDerivacion = () => {
            const derivado = String(selectDerivado?.value || "no") === "si";
            if (bloqueDerivacion) {
              bloqueDerivacion.style.display = derivado ? "grid" : "none";
            }
          };

          if (selectExamen) {
            selectExamen.addEventListener("change", refrescarPrecio);
            refrescarPrecio();
          }
          if (selectDerivado) {
            selectDerivado.addEventListener("change", toggleDerivacion);
            toggleDerivacion();
          }
          if (inputBusqueda) {
            inputBusqueda.addEventListener("input", () => {
              const term = String(inputBusqueda.value || "");
              if (debounceId) window.clearTimeout(debounceId);
              debounceId = window.setTimeout(() => {
                const lista = buscarExamenes(term);
                renderOpcionesExamen(lista);
              }, 250);
            });
          }
        },
        preConfirm: async () => {
          const selectExamen = document.getElementById("swal-lab-select");
          const derivadoInput = document.getElementById("swal-lab-derivado");
          const laboratorioRefInput = document.getElementById("swal-lab-referencia");
          const tipoDerivInput = document.getElementById("swal-lab-tipo");
          const valorDerivInput = document.getElementById("swal-lab-valor");
          const motivoInput = document.getElementById("swal-lab-motivo");

          const examenId = Number(selectExamen?.value || 0);
          const derivado = String(derivadoInput?.value || "no") === "si";
          const laboratorioRef = String(laboratorioRefInput?.value || "").trim();
          const tipoDeriv = String(tipoDerivInput?.value || "").trim().toLowerCase();
          const valorDeriv = Number(valorDerivInput?.value || 0);
          const motivo = String(motivoInput?.value || "").trim();
          const examen = examenesDisponibles.find((item) => Number(item?.id || 0) === examenId);

          if (!examenId || !examen) {
            Swal.showValidationMessage("Selecciona un examen válido.");
            return false;
          }
          if (motivo.length < 4) {
            Swal.showValidationMessage("Ingresa un motivo (mínimo 4 caracteres).");
            return false;
          }

          if (derivado) {
            if (!laboratorioRef) {
              Swal.showValidationMessage("Ingresa el laboratorio de referencia.");
              return false;
            }
            if (!["monto", "porcentaje"].includes(tipoDeriv)) {
              Swal.showValidationMessage("Selecciona tipo de derivación (monto o porcentaje).");
              return false;
            }
            if (!Number.isFinite(valorDeriv) || valorDeriv < 0) {
              Swal.showValidationMessage("Ingresa un valor de derivación válido.");
              return false;
            }
            if (tipoDeriv === "porcentaje" && valorDeriv > 100) {
              Swal.showValidationMessage("El porcentaje no puede ser mayor a 100.");
              return false;
            }
          }

          const precio = precioExamen(examenId);
          const cobertura = await authFetch(`api_contratos.php?accion=validar_cobertura&paciente_id=${pacienteIdActual}&servicio_tipo=laboratorio&servicio_id=${examenId}&cantidad=1`)
            .then((res) => res.json())
            .catch(() => null);
          const precioFinal = String(cobertura?.cobertura?.origen_cobro || "").toLowerCase() === "contrato" ? 0 : precio;

          return {
            motivo,
            detalle: {
              servicio_tipo: "laboratorio",
              servicio_id: examenId,
              descripcion: String(examen?.nombre || "Examen de laboratorio").trim() || "Examen de laboratorio",
              cantidad: 1,
              precio_unitario: Number(precioFinal.toFixed(2)),
              subtotal: Number(precioFinal.toFixed(2)),
              derivado,
              tipo_derivacion: derivado ? tipoDeriv : "",
              valor_derivacion: derivado ? Number(valorDeriv.toFixed(2)) : 0,
              laboratorio_referencia: derivado ? laboratorioRef : "",
            },
          };
        },
      });

      if (!modal.isConfirmed || !modal.value) return;

      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "agregar_detalle",
          cotizacion_id: cotizacionActualId,
          expected_version: Number(cotizacion?.version_actual || 0),
          motivo: modal.value.motivo,
          detalle: modal.value.detalle,
        }),
      });
      const status = Number(res?.status || 0);
      const data = await res.json();
      if (!data?.success) {
        if (esConflictoVersionCotizacion({ status, data })) {
          await manejarConflictoVersionCotizacion(cotizacionActualId);
          return;
        }
        throw new Error(data?.error || "No se pudo agregar el análisis");
      }

      await refrescarCotizacionActual(cotizacionActualId);
      await Swal.fire("Agregado", "El análisis se agregó correctamente.", "success");
    } catch (err) {
      await Swal.fire("Error", err?.message || "No se pudo agregar el análisis", "error");
    } finally {
      if (debounceId) window.clearTimeout(debounceId);
      setAgregandoAnalisis(false);
    }
  };

  const agregarMedicamentoFarmaciaInline = async () => {
    const cotizacionActualId = Number(cotizacion?.id || 0);
    const estadoActual = String(cotizacion?.estado || "").toLowerCase();
    if (cotizacionActualId <= 0) return;
    if (!(estadoActual === "pendiente" || estadoActual === "parcial")) {
      await Swal.fire("No permitido", "Solo puedes agregar ítems en cotizaciones pendientes o parciales.", "info");
      return;
    }

    let medicamentosDisponibles = [];
    let debounceId = null;

    const cargarMedicamentos = async (busqueda = "") => {
      const q = String(busqueda || "").trim();
      const params = new URLSearchParams();
      if (q.length >= 2) {
        params.set("busqueda", q);
      }
      params.set("limite", "80");

      const res = await authFetch(`api_medicamentos.php?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      const meds = Array.isArray(data?.medicamentos)
        ? data.medicamentos
        : (Array.isArray(data) ? data : []);
      medicamentosDisponibles = meds;
      return meds;
    };

    const renderOpciones = (meds = []) => {
      const select = document.getElementById("swal-med-select");
      if (!select) return;
      if (!Array.isArray(meds) || meds.length === 0) {
        select.innerHTML = `<option value="">Sin resultados</option>`;
        return;
      }
      select.innerHTML = meds.map((med) => {
        const nombre = escapeHtml(String(med?.nombre || "Medicamento"));
        const stock = Number(med?.stock || 0);
        return `<option value="${Number(med?.id || 0)}">${nombre} (Stock: ${stock})</option>`;
      }).join("");
    };

    try {
      setAgregandoMedicamento(true);
      const iniciales = await cargarMedicamentos("");

      const modal = await Swal.fire({
        title: "Agregar medicamento (farmacia)",
        width: 760,
        html: `
          <div style="text-align:left;font-size:13px;display:grid;gap:8px;">
            <label for="swal-med-busqueda">Buscar medicamento</label>
            <input id="swal-med-busqueda" type="text" class="swal2-input" placeholder="Escribe al menos 2 letras para filtrar" />
            <label for="swal-med-select">Medicamento</label>
            <select id="swal-med-select" class="swal2-select"></select>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <label for="swal-med-tipo">Tipo de venta</label>
                <select id="swal-med-tipo" class="swal2-select">
                  <option value="unidad">Unidad</option>
                  <option value="caja">Caja</option>
                </select>
              </div>
              <div>
                <label for="swal-med-cantidad">Cantidad</label>
                <input id="swal-med-cantidad" type="number" min="1" step="1" class="swal2-input" value="1" />
              </div>
            </div>
            <label for="swal-med-motivo">Motivo</label>
            <input id="swal-med-motivo" type="text" class="swal2-input" placeholder="Ej. complemento indicado por médico" />
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: "Agregar",
        cancelButtonText: "Cancelar",
        didOpen: () => {
          renderOpciones(iniciales);
          const inputBusqueda = document.getElementById("swal-med-busqueda");
          if (inputBusqueda) {
            inputBusqueda.addEventListener("input", () => {
              const term = String(inputBusqueda.value || "");
              if (debounceId) window.clearTimeout(debounceId);
              debounceId = window.setTimeout(async () => {
                try {
                  const lista = await cargarMedicamentos(term);
                  renderOpciones(lista);
                } catch {
                  renderOpciones([]);
                }
              }, 280);
            });
          }
        },
        preConfirm: () => {
          const select = document.getElementById("swal-med-select");
          const tipoInput = document.getElementById("swal-med-tipo");
          const cantidadInput = document.getElementById("swal-med-cantidad");
          const motivoInput = document.getElementById("swal-med-motivo");

          const medId = Number(select?.value || 0);
          const tipo = String(tipoInput?.value || "unidad");
          const cantidad = Number(cantidadInput?.value || 0);
          const motivo = String(motivoInput?.value || "").trim();
          const med = medicamentosDisponibles.find((item) => Number(item?.id || 0) === medId);

          if (!medId || !med) {
            Swal.showValidationMessage("Selecciona un medicamento válido.");
            return false;
          }
          if (!Number.isInteger(cantidad) || cantidad <= 0) {
            Swal.showValidationMessage("Ingresa una cantidad válida (entero mayor a 0).");
            return false;
          }
          if (motivo.length < 4) {
            Swal.showValidationMessage("Ingresa un motivo (mínimo 4 caracteres).");
            return false;
          }

          const stockUnidades = Number(med?.stock || 0);
          const unidadesCaja = getUnidadesPorCaja(med);
          const stockCajas = Math.floor(stockUnidades / unidadesCaja);
          if (tipo === "unidad" && cantidad > stockUnidades) {
            Swal.showValidationMessage(`Stock insuficiente. Disponible: ${stockUnidades} unidad(es).`);
            return false;
          }
          if (tipo === "caja" && cantidad > stockCajas) {
            Swal.showValidationMessage(`Stock insuficiente. Disponible: ${stockCajas} caja(s).`);
            return false;
          }

          const precioVenta = getPrecioVenta(med);
          const descripcion = `${String(med?.nombre || "Medicamento").trim() || "Medicamento"} (${tipo === "caja" ? "Caja" : "Unidad"})`;
          const subtotal = tipo === "caja"
            ? Number((precioVenta * unidadesCaja * cantidad).toFixed(2))
            : Number((precioVenta * cantidad).toFixed(2));

          return {
            motivo,
            detalle: {
              servicio_tipo: "farmacia",
              servicio_id: medId,
              descripcion,
              cantidad,
              precio_unitario: precioVenta,
              subtotal,
            },
          };
        },
      });

      if (!modal.isConfirmed || !modal.value) return;

      const res = await authFetch("api_cotizaciones.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "agregar_detalle",
          cotizacion_id: cotizacionActualId,
          expected_version: Number(cotizacion?.version_actual || 0),
          motivo: modal.value.motivo,
          detalle: modal.value.detalle,
        }),
      });
      const status = Number(res?.status || 0);
      const data = await res.json();
      if (!data?.success) {
        if (esConflictoVersionCotizacion({ status, data })) {
          await manejarConflictoVersionCotizacion(cotizacionActualId);
          return;
        }
        throw new Error(data?.error || "No se pudo agregar el medicamento");
      }

      await refrescarCotizacionActual(cotizacionActualId);
      await Swal.fire("Agregado", "El medicamento se agregó correctamente.", "success");
    } catch (err) {
      await Swal.fire("Error", err?.message || "No se pudo agregar el medicamento", "error");
    } finally {
      if (debounceId) window.clearTimeout(debounceId);
      setAgregandoMedicamento(false);
    }
  };

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <button onClick={() => navigate("/cotizaciones")} className="mb-4 bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver a Atenciones</button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-4">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow border border-gray-200 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--color-primary-dark)" }}>
              {esVistaGrupo ? `Detalle consolidado del episodio #${cotizacion?.id}` : `Detalle de Cotizacion #${cotizacion?.id}`}
            </h2>
            <div className="text-sm text-gray-600">Fecha: {cotizacion?.fecha || "-"}</div>
            {esVistaGrupo && Array.isArray(cotizacion?.grupo_ids) && cotizacion.grupo_ids.length > 1 && (
              <div className="text-xs mt-1 text-indigo-700 font-medium">
                Grupo episodio: {cotizacion.grupo_ids.map((id) => `#${id}`).join(", ")}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate("/cotizaciones")} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">Volver a Atenciones</button>
            {!esVistaGrupo && (
              <button onClick={emitirTicket} className="bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-800">Emitir ticket</button>
            )}
            {!esVistaGrupo && (
              <button
                onClick={() => {
                  const cotizacionPdfId = Number(cotizacion?.id || 0);
                  if (cotizacionPdfId > 0) {
                    const apiBase = String(BASE_URL || "").replace(/\/+$/, "");
                    window.open(`${apiBase}/api_cotizacion_ticket_pdf.php?cotizacion_id=${cotizacionPdfId}&_t=${Date.now()}`, "_blank", "noopener");
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
              >Descargar PDF</button>
            )}
            {puedeEditar && (
              <button
                onClick={() => navigate(`/seleccionar-servicio?paciente_id=${Number(cotizacion?.paciente_id || 0)}&cotizacion_id=${Number(cotizacion?.id || 0)}&back_to=/cotizaciones&modo=editar`, {
                  state: { pacienteId: Number(cotizacion?.paciente_id || 0), cotizacionId: Number(cotizacion?.id || 0), backTo: "/cotizaciones", modo: "editar" },
                })}
                className="text-white px-4 py-2 rounded"
                style={themeGradient}
              >Editar cotizacion</button>
            )}
            {!esVistaGrupo && puedeEditar && (estado === "pendiente" || estado === "parcial") && (
              <button
                onClick={agregarMedicamentoFarmaciaInline}
                disabled={agregandoMedicamento}
                className="bg-indigo-100 text-indigo-800 px-4 py-2 rounded border border-indigo-300 hover:bg-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {agregandoMedicamento ? "Abriendo..." : "Agregar medicamento"}
              </button>
            )}
            {!esVistaGrupo && puedeEditar && (estado === "pendiente" || estado === "parcial") && (
              <button
                onClick={agregarAnalisisLaboratorioInline}
                disabled={agregandoAnalisis}
                className="bg-cyan-100 text-cyan-800 px-4 py-2 rounded border border-cyan-300 hover:bg-cyan-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {agregandoAnalisis ? "Abriendo..." : "Agregar análisis"}
              </button>
            )}
            {puedeCobrar && (
              <button
                onClick={async () => {
                  const cotId = Number(cotizacion?.id || 0);
                  try {
                    const res = await authFetch(`api_cotizaciones.php?accion=sugerir_grupo_cobro&cotizacion_id=${cotId}`);
                    const data = await res.json();
                    if (data.success && Array.isArray(data.grupo) && data.grupo.length > 1) {
                      const lista = data.grupo.map(c => `• ${c.servicios_tipos || 'Servicio'} — S/ ${Number(c.saldo_pendiente ?? c.total ?? 0).toFixed(2)}`).join('<br>');
                      const totalGrupo = data.grupo.reduce((acc, c) => acc + Number(c.saldo_pendiente ?? c.total ?? 0), 0);
                      const result = await Swal.fire({
                        title: 'Cobro unificado',
                        html: `Este paciente tiene <b>${data.grupo.length} atenciones pendientes</b> del mismo día:<br><br>${lista}<br><br>Total: <b>S/ ${totalGrupo.toFixed(2)}</b><br><br>¿Cobrar todo en un solo ticket?`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, cobro unificado',
                        cancelButtonText: 'Solo esta cotización',
                      });
                      if (result.isConfirmed) {
                        const idsGrupo = Array.isArray(data.ids)
                          ? data.ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
                          : [];
                        if (idsGrupo.length > 1) {
                          navigate(`/cobrar-cotizacion/${idsGrupo[0]}?ids=${idsGrupo.join(',')}`);
                          return;
                        }
                        return;
                      }
                    }
                  } catch { /* fallback to single */ }
                  navigate(`/cobrar-cotizacion/${cotId}`);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >Cobrar</button>
            )}
            {puedeEditar && (
              <button onClick={abrirAnulacion} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">Anular</button>
            )}
          </div>
        </div>

        {esVistaGrupo && (
          <div className="mb-4 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
            Vista consolidada del episodio. Los montos, exámenes y pagos incluyen cotización base y adendas del grupo.
          </div>
        )}

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
            {mostrarLecturaComercialPaquete ? (
              <div className="mt-2 space-y-2">
                <div className="rounded border border-blue-200 bg-white px-2 py-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Paquete</div>
                  <div className="text-gray-700">Total: S/ {Number(totalVisibleResumen || 0).toFixed(2)}</div>
                  <div className="text-gray-700">Abonado: S/ {Number(pagadoVisibleResumen || 0).toFixed(2)}</div>
                  <div className="font-semibold text-blue-800">Pendiente: S/ {Number(saldoPendientePaquete || 0).toFixed(2)}</div>
                </div>
                <div className="rounded border border-blue-200 bg-white px-2 py-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Adicionales</div>
                  <div className="text-gray-700">Total: S/ {Number(adicionalesTotales || 0).toFixed(2)}</div>
                  <div className="text-gray-700">Pagado: S/ {Number(adicionalesPagados || 0).toFixed(2)}</div>
                  <div className="font-semibold text-blue-800">Pendiente: S/ {Number(adicionalesPendientes || 0).toFixed(2)}</div>
                </div>
                <div className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1.5 font-semibold text-indigo-800">
                  Total pagado del episodio: S/ {Number(pagadoGlobalComercial || 0).toFixed(2)}
                </div>
                <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800">
                  Total por pagar: S/ {Number(totalPendienteComercial || 0).toFixed(2)}
                </div>
              </div>
            ) : (
              <>
                <div className="font-semibold text-gray-800">Total bruto: S/ {Number(totalItemsBruto || 0).toFixed(2)}</div>
                {descuentoAplicado > 0 && (
                  <div className="text-amber-700">Descuento: -S/ {Number(descuentoAplicado).toFixed(2)}</div>
                )}
                <div className="font-semibold text-gray-800">Total neto: S/ {Number(cotizacion?.total || 0).toFixed(2)}</div>
                <div className="text-gray-600">Pagado: S/ {Number(cotizacion?.total_pagado || 0).toFixed(2)}</div>
                <div className="text-gray-600">Saldo: S/ {Number(cotizacion?.saldo_pendiente || 0).toFixed(2)}</div>
              </>
            )}
          </div>
        </div>

        <div className="mb-4 border rounded p-3" style={themePrimarySoft}>
          <div className="text-sm font-semibold mb-2" style={{ color: "var(--color-primary-dark)" }}>Servicios cotizados</div>
          {resumenServicios.length === 0 ? (
            <div className="text-sm text-gray-500">Sin items activos.</div>
          ) : (
            <div className="space-y-2">
              {!ocultarDesgloseServiciosPorPaquete && (
                <div className="flex flex-wrap gap-2">
                  {resumenServicios.map((s) => (
                    <span key={s.tipo} className="text-xs bg-white border rounded px-2 py-1" style={{ borderColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>
                      {s.label}: {s.items} item(s){mostrarLecturaComercialPaquete ? "" : ` | S/ ${Number(s.subtotal || 0).toFixed(2)}`}
                    </span>
                  ))}
                </div>
              )}
              {ocultarDesgloseServiciosPorPaquete && (
                <div className="flex flex-wrap gap-2">
                  {resumenServicios
                    .filter((s) => !tiposServicioEnPaquete.has(String(s?.tipo || "")))
                    .map((s) => (
                      <span key={s.tipo} className="text-xs bg-white border rounded px-2 py-1" style={{ borderColor: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>
                        {s.label}: {s.items} item(s){mostrarLecturaComercialPaquete ? "" : ` | S/ ${Number(s.subtotal || 0).toFixed(2)}`}
                      </span>
                    ))}
                </div>
              )}
              {resumenPaquetes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {resumenPaquetes.map((p) => (
                    <span key={p.clave} className="text-xs bg-white border rounded px-2 py-1" style={{ borderColor: "#bfdbfe", color: "#1e40af" }}>
                      {p.tipoLabel}: {p.codigo ? `${p.codigo} - ` : ""}{p.nombre} | {p.items} item(s){mostrarLecturaComercialPaquete ? "" : ` | S/ ${Number(p.subtotal || 0).toFixed(2)}`}
                    </span>
                  ))}
                  {mostrarLecturaComercialPaquete && (
                    <span className="text-xs bg-emerald-50 border rounded px-2 py-1 font-semibold" style={{ borderColor: "#86efac", color: "#166534" }}>
                      Total paquete: S/ {Number(resumenComercialPaquete?.totalPaquete || 0).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                {esVistaGrupo && <th className="px-3 py-2 text-left">Cotización</th>}
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
                  <td colSpan={esVistaGrupo ? 7 : 6} className="px-3 py-6 text-center text-gray-500">Sin items activos en la cotizacion.</td>
                </tr>
              ) : detallesRender.map((row, idx) => {
                const d = row.raw;
                const packKey = String(row?.infoPaquete?.clave || "");
                const packResumen = packKey ? resumenComponentesPaquete[packKey] : null;
                const esFilaPaqueteColapsada = Boolean(colapsarComponentesPaquete && row?.infoPaquete);
                if (esFilaPaqueteColapsada && packResumen && packResumen.firstIndex !== idx) {
                  return null;
                }
                const totalPaquetesColapsados = Object.keys(resumenComponentesPaquete || {}).length;
                const subtotalPaqueteFila = (esFilaPaqueteColapsada && mostrarLecturaComercialPaquete && totalPaquetesColapsados === 1)
                  ? Number(resumenComercialPaquete?.totalPaquete || 0)
                  : Number(packResumen?.subtotalBruto || packResumen?.subtotal || 0);
                const subtotalFila = esFilaPaqueteColapsada && packResumen
                  ? Number(subtotalPaqueteFila || 0)
                  : Number(d?.subtotal_neto || d?.subtotal || 0);
                const cantidadFila = esFilaPaqueteColapsada && packResumen
                  ? 1
                  : Number(d?.cantidad || 0);
                const servicioFila = esFilaPaqueteColapsada
                  ? (row?.infoPaquete?.tipoLabel || "Paquete")
                  : row.servicioLabel;
                const descripcionFila = esFilaPaqueteColapsada
                  ? `${row?.infoPaquete?.tipoLabel || "Paquete"}: ${row?.infoPaquete?.codigo ? `${row.infoPaquete.codigo} - ` : ""}${row?.infoPaquete?.nombre || "Paquete"}`
                  : row.descripcionVisible;
                const esFilaDesglosable = esFilaPaqueteColapsada && Number(packResumen?.items || 0) > 1;
                const packExpandido = esFilaDesglosable && Boolean(paquetesExpandido[packKey]);
                const componentesPaquete = Array.isArray(packResumen?.componentes) ? packResumen.componentes : [];
                return (
                <React.Fragment key={row.key}>
                <tr className="border-t">
                  {esVistaGrupo && <td className="px-3 py-2 whitespace-nowrap">#{Number(d?.cotizacion_origen_id || 0)}</td>}
                  <td className="px-3 py-2">{servicioFila}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{descripcionFila}</span>
                      {esFilaDesglosable && (
                        <button
                          type="button"
                          onClick={() => setPaquetesExpandido((prev) => ({ ...prev, [packKey]: !prev[packKey] }))}
                          className="text-[11px] px-2 py-0.5 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                        >
                          {packExpandido ? "Ocultar servicios" : `Ver servicios (${Number(packResumen?.items || 0)})`}
                        </button>
                      )}
                      {row.infoPaquete && !esFilaPaqueteColapsada && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap" style={{ backgroundColor: "#eff6ff", color: "#1e40af", borderColor: "#bfdbfe" }}>
                          {row.infoPaquete.tipoLabel}: {row.infoPaquete.codigo ? `${row.infoPaquete.codigo} - ` : ""}{row.infoPaquete.nombre}
                        </span>
                      )}
                      {row.esExternoNoCobrable && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap bg-slate-100 text-slate-700 border-slate-200">
                          Externo / no cobrable
                        </span>
                      )}
                      {row.esDerivado && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap" style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary-dark)", borderColor: "var(--color-primary-light)" }}>
                          🔗 Referenciado
                        </span>
                      )}
                      {row.esAdicionalAutorizado && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200">
                          Adicional autorizado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{row.medicoVisible}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span>{cantidadFila}</span>
                      {!esVistaGrupo
                        && !esFilaPaqueteColapsada
                        && puedeEditar
                        && estado === "pendiente"
                        && row.servicioNorm === "farmacia"
                        && Number(d?.cantidad || 0) > 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => ajustarCantidadFarmaciaInline(d)}
                              disabled={ajustandoDetalleId === Number(d?.id || 0) || eliminandoDetalleId === Number(d?.id || 0) || devolviendoDetalleId === Number(d?.id || 0)}
                              className="text-[11px] px-2 py-1 rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {ajustandoDetalleId === Number(d?.id || 0) ? "Guardando..." : "Ajustar"}
                            </button>
                            <button
                              onClick={() => eliminarDetalleInline(d)}
                              disabled={eliminandoDetalleId === Number(d?.id || 0) || ajustandoDetalleId === Number(d?.id || 0) || devolviendoDetalleId === Number(d?.id || 0)}
                              className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {eliminandoDetalleId === Number(d?.id || 0) ? "Quitando..." : "Quitar"}
                            </button>
                          </div>
                        )}
                      {!esVistaGrupo
                        && !esFilaPaqueteColapsada
                        && puedeEditar
                        && estado === "pendiente"
                        && row.servicioNorm === "laboratorio"
                        && Number(d?.cantidad || 0) > 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => eliminarDetalleInline(d)}
                              disabled={eliminandoDetalleId === Number(d?.id || 0) || ajustandoDetalleId === Number(d?.id || 0) || devolviendoDetalleId === Number(d?.id || 0)}
                              className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {eliminandoDetalleId === Number(d?.id || 0) ? "Quitando..." : "Quitar"}
                            </button>
                          </div>
                        )}
                      {puedeGestionarDevolucion
                        && !esFilaPaqueteColapsada
                        && (estado === "pagado" || estado === "parcial")
                        && Number(d?.cantidad || 0) > 0
                        && Number(d?.es_externo || 0) !== 1
                        && Number(d?.incluir_en_cobro ?? 1) !== 0 && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => devolverDetallePagadoInline(d)}
                              disabled={devolviendoDetalleId === Number(d?.id || 0) || eliminandoDetalleId === Number(d?.id || 0) || ajustandoDetalleId === Number(d?.id || 0)}
                              className="text-[11px] px-2 py-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {devolviendoDetalleId === Number(d?.id || 0) ? "Devolviendo..." : "Devolver / Quitar"}
                            </button>
                          </div>
                        )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(mostrarLecturaComercialPaquete && row.infoPaquete) || esFilaPaqueteColapsada ? (
                      <span className="text-[11px] text-gray-500">Incluido en paquete</span>
                    ) : (
                      <>S/ {Number(d.precio_unitario || 0).toFixed(2)}</>
                    )}
                    {!mostrarLecturaComercialPaquete && Number(d.descuento_item || 0) > 0 && (
                      <span className="block text-[11px] text-amber-700">Desc: -S/ {Number(d.descuento_item || 0).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {esFilaPaqueteColapsada
                      ? `S/ ${Number(subtotalFila || 0).toFixed(2)}`
                      : (mostrarLecturaComercialPaquete && row.infoPaquete
                        ? "—"
                        : `S/ ${Number(subtotalFila || 0).toFixed(2)}`)}
                  </td>
                </tr>
                {packExpandido && (
                  <tr className="border-t bg-slate-50">
                    <td colSpan={esVistaGrupo ? 7 : 6} className="px-3 py-2">
                      <div className="text-[11px] font-semibold text-slate-700 mb-1">Servicios incluidos en el paquete:</div>
                      <div className="space-y-1">
                        {componentesPaquete.map((comp, compIdx) => (
                          <div key={`${comp.key}-${compIdx}`} className="text-xs text-slate-700 flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{comp.servicioLabel}</span>
                            <span>{comp.descripcion}</span>
                            {comp.medico && comp.medico !== "-" && (
                              <span className="text-slate-500">· {comp.medico}</span>
                            )}
                            <span className="text-slate-500">· Cant: {Number(comp.cantidad || 0)}</span>
                            <span className="text-slate-500">· Incluido en paquete</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              )})}
            </tbody>
          </table>
        </div>

        <div className="mt-4 overflow-x-auto border border-gray-200 rounded-lg">
          <div className="px-3 py-2 bg-gray-100 text-sm font-semibold text-gray-800">Historial de pagos y devoluciones</div>
          {resumenUpgradePaquete && (
            <div className="px-4 py-3 border-b border-blue-200 bg-blue-50 text-blue-900">
              <div className="text-sm font-bold mb-2">Lectura comercial del cambio a paquete</div>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="rounded border border-blue-200 bg-white px-2 py-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Paquete</div>
                    <div><span className="font-semibold">Total:</span> S/ {Number(resumenUpgradePaquete.totalPaquete || 0).toFixed(2)}</div>
                    <div><span className="font-semibold">Abonado previo:</span> S/ {Number(resumenUpgradePaquete.abonadoPrevio || 0).toFixed(2)}</div>
                    <div><span className="font-semibold">Abono por cambio:</span> S/ {Number(resumenUpgradePaquete.abonoUpgrade || 0).toFixed(2)}</div>
                    <div className="font-semibold text-blue-800"><span className="font-semibold">Pendiente:</span> S/ {Number(resumenUpgradePaquete.saldoUpgrade || 0).toFixed(2)}</div>
                  </div>
                  <div className="rounded border border-blue-200 bg-white px-2 py-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Adicionales</div>
                    <div><span className="font-semibold">Total:</span> S/ {Number(adicionalesTotales || 0).toFixed(2)}</div>
                    <div><span className="font-semibold">Pagado:</span> S/ {Number(adicionalesPagados || 0).toFixed(2)}</div>
                    <div className="font-semibold text-blue-800"><span className="font-semibold">Pendiente:</span> S/ {Number(adicionalesPendientes || 0).toFixed(2)}</div>
                  </div>
                </div>
                <div className="rounded border border-indigo-300 bg-indigo-50 px-2 py-1.5 font-semibold text-indigo-800">
                  Total pagado del episodio: S/ {Number(pagadoGlobalComercial || 0).toFixed(2)}
                </div>
                <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-800">
                  Total por pagar: S/ {Number(totalPendienteComercial || 0).toFixed(2)}
                </div>
              </div>
            </div>
          )}
          {pagosOcultosHistorial > 0 && (
            <div className="px-3 py-2 text-xs text-gray-600 border-b border-gray-200 bg-gray-50">
              {mostrarLecturaComercialPaquete
                ? `Se ocultaron ${pagosOcultosHistorial} movimiento(s) técnico(s) para simplificar la lectura comercial del paquete.`
                : `Se ocultaron ${pagosOcultosHistorial} abono(s) anulados para simplificar la lectura; ya están compensados por su devolución.`}
            </div>
          )}
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {esVistaGrupo && <th className="px-3 py-2 text-left">Cotización</th>}
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Monto</th>
                <th className="px-3 py-2 text-left">Metodo de pago</th>
                <th className="px-3 py-2 text-left">Saldo</th>
                <th className="px-3 py-2 text-left">Usuario</th>
                <th className="px-3 py-2 text-left">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {pagosHistorialVisibles.length === 0 ? (
                <tr>
                  <td colSpan={esVistaGrupo ? 8 : 7} className="px-3 py-6 text-center text-gray-500">No hay pagos registrados para esta cotizacion.</td>
                </tr>
              ) : pagosHistorialVisibles.map((pago) => {
                const tipo = String(pago?.tipo_movimiento || "abono").toLowerCase();
                const esAbonoUpgrade = tipo === "abono_upgrade";
                const esMovimientoSalida = tipo === "devolucion";
                const esDescuento = esMovimientoSalida && esMovimientoDescuento(pago);
                const esAjusteConversion = esMovimientoSalida && esMovimientoAjusteConversionPaquete(pago);
                const esCobroAnulado = String(pago?.cobro_estado || "").toLowerCase() === "anulado";
                const fecha = pago?.created_at ? new Date(pago.created_at).toLocaleString("es-PE") : "-";
                const metodoPago = String(pago?.metodo_pago || "").trim();
                return (
                  <tr key={pago.id} className="border-t align-top">
                    {esVistaGrupo && <td className="px-3 py-2 whitespace-nowrap">#{Number(pago?.cotizacion_origen_id || cotizacion?.id || 0)}</td>}
                    <td className="px-3 py-2 whitespace-nowrap">{fecha}</td>
                    <td className="px-3 py-2">
                      {esAbonoUpgrade
                        ? "Abono por cambio"
                        : esMovimientoSalida
                        ? (esAjusteConversion ? "Ajuste paquete" : (esDescuento ? "Descuento" : "Devolucion"))
                        : "Abono"}
                      {esCobroAnulado && (
                        <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border border-red-200 bg-red-50 text-red-700">
                          Cobro anulado
                        </span>
                      )}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${esMovimientoSalida ? "text-amber-700" : "text-emerald-700"}`}>
                      {esMovimientoSalida ? "-" : "+"} S/ {Number(pago?.monto || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{metodoPago || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      S/ {Number(pago?.saldo_anterior || 0).toFixed(2)} -&gt; S/ {Number(pago?.saldo_nuevo || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">{pago?.usuario_nombre || `Usuario #${pago?.usuario_id || "-"}`}</td>
                    <td className="px-3 py-2 text-gray-600">{pago?.descripcion || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
