import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  listarEmpresasOcupacionales,
  listarPlantillasCondicionesOcupacionales,
  listarProtocolosOcupacionales,
  guardarProtocoloOcupacional,
  inactivarProtocoloOcupacional,
  copiarConfiguracionProtocoloOcupacional,
  listarMatrizProtocoloOcupacional,
  guardarMontoProtocoloOcupacional,
  listarPuestosOcupacionalesEmpresa,
  listarCondicionesProtocoloOcupacional,
  guardarCondicionProtocoloOcupacional,
  eliminarCondicionProtocoloOcupacional,
  aplicarCondicionMasivaProtocoloOcupacional,
} from "../../api/ocupacionalApi";

function normalizeMoneyInput(value) {
  return String(value ?? "").replace(/[^0-9.,]/g, "").replace(',', '.');
}

const EMPRESA_STORAGE_KEY = "ocupacional_protocolos_empresa_id_v1";

function readStoredEmpresaId() {
  try {
    const raw = window.localStorage.getItem(EMPRESA_STORAGE_KEY);
    const n = Number(raw || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export default function ProtocolosOcupacionalesPage() {
  const MODO_LEGACY_UI = true;
  const [searchParams] = useSearchParams();
  const empresaIdDesdeRuta = Number(searchParams.get("empresa_id") || 0);
  const context = String(searchParams.get("context") || "").toLowerCase();
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState(0);

  const [protocolos, setProtocolos] = useState([]);
  const [protocoloId, setProtocoloId] = useState(0);
  const [descripcionProtocolo, setDescripcionProtocolo] = useState("");
  const [guardandoProtocolo, setGuardandoProtocolo] = useState(false);
  const [sembrarMontosBaseNuevoProtocolo, setSembrarMontosBaseNuevoProtocolo] = useState(false);
  const [copiandoConfig, setCopiandoConfig] = useState(false);
  const [copiarOrigenId, setCopiarOrigenId] = useState(0);
  const [copiarMontos, setCopiarMontos] = useState(true);
  const [copiarCondiciones, setCopiarCondiciones] = useState(true);
  const [copiarMsg, setCopiarMsg] = useState("");

  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const [tipos, setTipos] = useState([]);
  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({});
  const [meta, setMeta] = useState({ page: 1, per_page: 50, total: 0, total_pages: 0 });

  const [loading, setLoading] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState("");
  const [savedCellKey, setSavedCellKey] = useState("");
  const [cellErrorKey, setCellErrorKey] = useState("");
  const [error, setError] = useState("");
  const [plantillas, setPlantillas] = useState([]);
  const [plantillaCodigo, setPlantillaCodigo] = useState("");
  const [plantillaReglas, setPlantillaReglas] = useState([]);
  const [plantillaMsg, setPlantillaMsg] = useState("");

  const [puestosEmpresa, setPuestosEmpresa] = useState([]);
  const [condCatalogoSeleccionado, setCondCatalogoSeleccionado] = useState(null);
  const [condiciones, setCondiciones] = useState([]);
  const [condLoading, setCondLoading] = useState(false);
  const [condSaving, setCondSaving] = useState(false);
  const [condDeletingId, setCondDeletingId] = useState(0);
  const [condEditingId, setCondEditingId] = useState(0);
  const [condError, setCondError] = useState("");
  const [condBulkSaving, setCondBulkSaving] = useState(false);
  const [condBulkMsg, setCondBulkMsg] = useState("");
  const [condBulkPreviewMsg, setCondBulkPreviewMsg] = useState("");
  const protocolosRequestRef = useRef(0);
  const matrizRequestRef = useRef(0);
  const montoOriginalRef = useRef(new Map());
  const puestosLoadedEmpresaRef = useRef(0);
  const puestosRequestRef = useRef(0);
  const hydratedEmpresaRef = useRef(false);
  const [isDesktopMatrix, setIsDesktopMatrix] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [condForm, setCondForm] = useState({
    puesto_trabajo: "",
    sexo: "",
    edad_min: "",
    edad_max: "",
  });
  const [condBulkForm, setCondBulkForm] = useState({
    filtro_q: "",
    puesto_trabajo: "",
    sexo: "",
    edad_min: "",
    edad_max: "",
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQDebounced(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const onChange = (event) => setIsDesktopMatrix(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const cargarEmpresas = useCallback(async () => {
    try {
      const data = await listarEmpresasOcupacionales({ estado: "activo" });
      setEmpresas(data);
    } catch (err) {
      setError(err.message || "No se pudo cargar empresas");
    }
  }, []);

  useEffect(() => {
    cargarEmpresas();
  }, [cargarEmpresas]);

  useEffect(() => {
    if (hydratedEmpresaRef.current || empresas.length === 0) {
      return;
    }

    const empresaIdGuardada = readStoredEmpresaId();
    const existe = (id) => empresas.some((e) => Number(e.id) === Number(id));

    let empresaInicial = 0;
    if (empresaIdDesdeRuta > 0 && existe(empresaIdDesdeRuta)) {
      empresaInicial = empresaIdDesdeRuta;
    } else if (empresaIdGuardada > 0 && existe(empresaIdGuardada)) {
      empresaInicial = empresaIdGuardada;
    } else if (empresas.length > 0) {
      empresaInicial = Number(empresas[0].id);
    }

    if (empresaInicial > 0) {
      setEmpresaId(empresaInicial);
    }

    hydratedEmpresaRef.current = true;
  }, [empresas, empresaIdDesdeRuta]);

  useEffect(() => {
    try {
      if (empresaId > 0) {
        window.localStorage.setItem(EMPRESA_STORAGE_KEY, String(empresaId));
      }
    } catch {
      // Ignore storage errors.
    }
  }, [empresaId]);

  useEffect(() => {
    async function cargarPlantillas() {
      try {
        const data = await listarPlantillasCondicionesOcupacionales();
        setPlantillas(data || []);
      } catch {
        setPlantillas([]);
      }
    }
    cargarPlantillas();
  }, []);

  const cargarProtocolos = useCallback(async () => {
    if (!empresaId) {
      setProtocolos([]);
      setProtocoloId(0);
      return;
    }

    const requestId = ++protocolosRequestRef.current;
    try {
      const data = await listarProtocolosOcupacionales({ empresaId, estado: "activo" });
      if (requestId !== protocolosRequestRef.current) {
        return;
      }
      setProtocolos(data);
      setProtocoloId((currentId) => (
        data.some((p) => Number(p.id) === Number(currentId))
          ? currentId
          : (data.length ? Number(data[0].id) : 0)
      ));
    } catch (err) {
      if (requestId === protocolosRequestRef.current) {
        setError(err.message || "No se pudo cargar protocolos");
      }
    }
  }, [empresaId]);

  useEffect(() => {
    cargarProtocolos();
  }, [cargarProtocolos]);

  useEffect(() => {
    if (!protocolos.find((item) => Number(item.id) === Number(copiarOrigenId))) {
      const primerOrigen = protocolos.find((item) => Number(item.id) !== Number(protocoloId));
      setCopiarOrigenId(primerOrigen ? Number(primerOrigen.id) : 0);
    }
  }, [protocolos, copiarOrigenId, protocoloId]);

  useEffect(() => {
    setPuestosEmpresa([]);
    puestosLoadedEmpresaRef.current = 0;
    puestosRequestRef.current += 1;
  }, [empresaId]);

  const cargarPuestos = useCallback(async () => {
    if (!empresaId || puestosLoadedEmpresaRef.current === Number(empresaId)) return;
    const requestId = ++puestosRequestRef.current;
    try {
      const data = await listarPuestosOcupacionalesEmpresa(empresaId);
      if (requestId !== puestosRequestRef.current) return;
      setPuestosEmpresa(data || []);
      puestosLoadedEmpresaRef.current = Number(empresaId);
    } catch {
      if (requestId === puestosRequestRef.current) {
        setPuestosEmpresa([]);
      }
    }
  }, [empresaId]);

  const cargarMatriz = useCallback(async () => {
    if (!empresaId || !protocoloId) {
      setRows([]);
      setTipos([]);
      setTotales({});
      setMeta({ page: 1, per_page: perPage, total: 0, total_pages: 0 });
      return;
    }

    const requestId = ++matrizRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const payload = await listarMatrizProtocoloOcupacional({
        empresaId,
        protocoloId,
        q: qDebounced,
        page,
        perPage,
      });
      if (requestId !== matrizRequestRef.current) {
        return;
      }
      setTipos(payload.tipos || []);
      setRows(payload.data || []);
      setTotales(payload.totales || {});
      setMeta(payload.meta || { page: 1, per_page: perPage, total: 0, total_pages: 0 });
    } catch (err) {
      if (requestId === matrizRequestRef.current) {
        setError(err.message || "No se pudo cargar matriz de protocolo");
      }
    } finally {
      if (requestId === matrizRequestRef.current) {
        setLoading(false);
      }
    }
  }, [empresaId, protocoloId, qDebounced, page, perPage]);

  useEffect(() => {
    cargarMatriz();
  }, [cargarMatriz]);

  useEffect(() => {
    if (!savedCellKey) return undefined;
    const timer = window.setTimeout(() => {
      setSavedCellKey("");
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [savedCellKey]);

  useEffect(() => {
    if (!cellErrorKey) return undefined;
    const timer = window.setTimeout(() => {
      setCellErrorKey("");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [cellErrorKey]);

  const empresaSeleccionada = useMemo(
    () => empresas.find((e) => Number(e.id) === Number(empresaId)) || null,
    [empresas, empresaId]
  );

  const protocoloSeleccionado = useMemo(
    () => protocolos.find((p) => Number(p.id) === Number(protocoloId)) || null,
    [protocolos, protocoloId]
  );

  const onGuardarProtocolo = async (e) => {
    e.preventDefault();
    if (!empresaId) {
      setError("Seleccione empresa");
      return;
    }
    if (!descripcionProtocolo.trim()) {
      setError("Ingrese descripcion del protocolo");
      return;
    }

    setGuardandoProtocolo(true);
    setError("");
    try {
      const data = await guardarProtocoloOcupacional({
        empresaId,
        descripcion: descripcionProtocolo.trim(),
        sembrarMontosBase: sembrarMontosBaseNuevoProtocolo,
      });
      setDescripcionProtocolo("");
      await cargarProtocolos();
      if (data?.id) {
        setProtocoloId(Number(data.id));
      }
      if (Number(data?.montos_base_sembrados || 0) > 0) {
        setCopiarMsg(`Protocolo creado con ${data.montos_base_sembrados} montos base listos.`);
      } else {
        setCopiarMsg("Protocolo creado correctamente.");
      }
    } catch (err) {
      setError(err.message || "No se pudo guardar protocolo");
    } finally {
      setGuardandoProtocolo(false);
    }
  };

  const onInactivarProtocolo = async () => {
    if (!protocoloId) return;
    if (!window.confirm("Desea inactivar este protocolo?")) return;

    try {
      await inactivarProtocoloOcupacional(protocoloId);
      await cargarProtocolos();
    } catch (err) {
      setError(err.message || "No se pudo inactivar protocolo");
    }
  };

  const ejecutarCopiaConfiguracion = async (soloPrevisualizar) => {
    if (!empresaId || !protocoloId || !copiarOrigenId) {
      setError("Seleccione empresa, protocolo destino y protocolo origen");
      return;
    }
    if (Number(copiarOrigenId) === Number(protocoloId)) {
      setError("El protocolo origen debe ser distinto al destino");
      return;
    }
    if (!copiarMontos && !copiarCondiciones) {
      setError("Debe elegir al menos montos o condiciones");
      return;
    }

    setCopiandoConfig(true);
    setCopiarMsg("");
    setError("");
    try {
      const data = await copiarConfiguracionProtocoloOcupacional({
        empresaId,
        protocoloOrigenId: copiarOrigenId,
        protocoloDestinoId: protocoloId,
        copiarMontos,
        copiarCondiciones,
        soloPrevisualizar,
      });
      const resumen = data?.resumen || {};
      setCopiarMsg(
        soloPrevisualizar
          ? `Previsualizacion: montos ${resumen.montos_en_origen || 0}, condiciones origen ${resumen.condiciones_en_origen || 0}, nuevas condiciones ${resumen.condiciones_insertadas || 0}, duplicados ${resumen.condiciones_omitidas_duplicado || 0}.`
          : `Copia aplicada: montos ${resumen.montos_procesados || 0}, condiciones nuevas ${resumen.condiciones_insertadas || 0}, duplicados omitidos ${resumen.condiciones_omitidas_duplicado || 0}.`
      );
      if (!soloPrevisualizar) {
        await cargarMatriz();
        if (condCatalogoSeleccionado?.catalogo_id) {
          await cargarCondiciones(condCatalogoSeleccionado.catalogo_id);
        }
      }
    } catch (err) {
      setError(err.message || `No se pudo ${soloPrevisualizar ? "previsualizar" : "copiar"} la configuracion`);
    } finally {
      setCopiandoConfig(false);
    }
  };

  const onMontoBlur = async (row, tipoId, currentValue) => {
    if (!protocoloId) return;

    const monto = normalizeMoneyInput(currentValue);
    const key = `${row.catalogo_id}-${tipoId}`;
    const montoOriginal = String(montoOriginalRef.current.get(key) ?? "");
    const montoAnterior = Number(montoOriginal || 0);
    montoOriginalRef.current.delete(key);

    if (monto === montoOriginal) {
      return;
    }

    setSavingCellKey(key);
    setSavedCellKey("");
    setCellErrorKey("");
    setError("");
    try {
      const saved = await guardarMontoProtocoloOcupacional({
        protocoloId,
        catalogoId: row.catalogo_id,
        tipoEvaluacionId: tipoId,
        monto,
      });

      setRows((prev) =>
        prev.map((r) => {
          if (Number(r.catalogo_id) !== Number(row.catalogo_id)) return r;
          return {
            ...r,
            montos: {
              ...r.montos,
              [String(tipoId)]: {
                valor: saved.monto || "",
                origen: saved.origen || (saved.monto ? "protocolo" : "protocolo_excluido"),
              },
            },
          };
        })
      );

      setTotales((prev) => ({
        ...prev,
        [String(tipoId)]: (
          Number(prev?.[String(tipoId)] || 0) - montoAnterior + Number(saved.monto || 0)
        ).toFixed(2),
      }));

      setSavedCellKey(key);
    } catch (err) {
      setCellErrorKey(key);
      setError(err.message || "No se pudo guardar monto");
      await cargarMatriz();
    } finally {
      setSavingCellKey("");
    }
  };

  const onMontoFocus = (catalogoId, tipoId, value) => {
    const key = `${catalogoId}-${tipoId}`;
    montoOriginalRef.current.set(key, normalizeMoneyInput(value));
  };

  const onMontoChange = (catalogoId, tipoId, valor) => {
    setRows((prev) =>
      prev.map((row) => {
        if (Number(row.catalogo_id) !== Number(catalogoId)) return row;
        const montoActual = row.montos?.[String(tipoId)] || {};
        return {
          ...row,
          montos: {
            ...row.montos,
            [String(tipoId)]: {
              ...montoActual,
              valor,
            },
          },
        };
      })
    );
  };

  const onQuitarMonto = async (row, tipoId) => {
    if (!protocoloId) return;

    const key = `${row.catalogo_id}-${tipoId}`;
    setSavingCellKey(key);
    setSavedCellKey("");
    setCellErrorKey("");
    setError("");

    try {
      const saved = await guardarMontoProtocoloOcupacional({
        protocoloId,
        catalogoId: row.catalogo_id,
        tipoEvaluacionId: tipoId,
        monto: "",
        restablecerBase: true,
      });

      const montoAnterior = Number(row.montos?.[String(tipoId)]?.valor || 0);
      setRows((prev) => prev.map((currentRow) => (
        Number(currentRow.catalogo_id) !== Number(row.catalogo_id)
          ? currentRow
          : {
              ...currentRow,
              montos: {
                ...currentRow.montos,
                [String(tipoId)]: {
                  valor: saved.monto || "",
                  origen: saved.origen || "sin_configurar",
                },
              },
            }
      )));
      setTotales((prev) => ({
        ...prev,
        [String(tipoId)]: Math.max(0, Number(prev?.[String(tipoId)] || 0) - montoAnterior).toFixed(2),
      }));
      setSavedCellKey(key);
    } catch (err) {
      setCellErrorKey(key);
      setError(err.message || "No se pudo quitar el monto configurado");
    } finally {
      setSavingCellKey("");
    }
  };

  const onMontoKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const cargarCondiciones = useCallback(async (catalogoId) => {
    if (!protocoloId || !catalogoId) {
      setCondiciones([]);
      return;
    }
    setCondLoading(true);
    setCondError("");
    try {
      const data = await listarCondicionesProtocoloOcupacional({
        protocoloId,
        catalogoId,
      });
      setCondiciones(data || []);
    } catch (err) {
      setCondError(err.message || "No se pudieron cargar condiciones");
    } finally {
      setCondLoading(false);
    }
  }, [protocoloId]);

  const abrirCondiciones = async (row) => {
    setCondCatalogoSeleccionado(row);
    setCondForm({ puesto_trabajo: "", sexo: "", edad_min: "", edad_max: "" });
    setCondEditingId(0);
    await Promise.all([
      cargarPuestos(),
      cargarCondiciones(row.catalogo_id),
    ]);
  };

  const onGuardarCondicion = async (e) => {
    e.preventDefault();
    if (!protocoloId || !condCatalogoSeleccionado?.catalogo_id) return;

    const puesto = String(condForm.puesto_trabajo || "").trim();
    const sexo = String(condForm.sexo || "").trim();
    const edadMin = String(condForm.edad_min || "").trim();
    const edadMax = String(condForm.edad_max || "").trim();

    if (!puesto && !sexo && !edadMin && !edadMax) {
      setCondError("Debe ingresar al menos un criterio: puesto, sexo o rango de edad");
      return;
    }

    setCondSaving(true);
    setCondError("");
    try {
      await guardarCondicionProtocoloOcupacional({
        id: condEditingId || undefined,
        protocoloId,
        catalogoId: condCatalogoSeleccionado.catalogo_id,
        puestoTrabajo: puesto,
        sexo,
        edadMin,
        edadMax,
      });
      setCondForm({ puesto_trabajo: "", sexo: "", edad_min: "", edad_max: "" });
      setCondEditingId(0);
      await cargarCondiciones(condCatalogoSeleccionado.catalogo_id);
    } catch (err) {
      setCondError(err.message || "No se pudo guardar condicion");
    } finally {
      setCondSaving(false);
    }
  };

  const onEditarCondicion = (condicion) => {
    setCondEditingId(Number(condicion.id));
    setCondForm({
      puesto_trabajo: condicion.puesto_trabajo || "",
      sexo: condicion.sexo || "",
      edad_min: condicion.edad_min ?? "",
      edad_max: condicion.edad_max ?? "",
    });
    setCondError("");
  };

  const onCancelarEdicionCondicion = () => {
    setCondEditingId(0);
    setCondForm({ puesto_trabajo: "", sexo: "", edad_min: "", edad_max: "" });
    setCondError("");
  };

  const onEliminarCondicion = async (id) => {
    if (!id) return;
    if (!window.confirm("Desea eliminar esta condicion?")) return;
    setCondDeletingId(Number(id));
    setCondError("");
    try {
      await eliminarCondicionProtocoloOcupacional({
        id,
        protocoloId,
        catalogoId: condCatalogoSeleccionado?.catalogo_id,
      });
      if (condCatalogoSeleccionado?.catalogo_id) {
        await cargarCondiciones(condCatalogoSeleccionado.catalogo_id);
      }
    } catch (err) {
      setCondError(err.message || "No se pudo eliminar condicion");
    } finally {
      setCondDeletingId(0);
    }
  };

  const onAplicarCondicionMasiva = async (e) => {
    e.preventDefault();
    if (!empresaId || !protocoloId) {
      setError("Seleccione empresa y protocolo");
      return;
    }

    const filtro = String(condBulkForm.filtro_q || "").trim();
    const puesto = String(condBulkForm.puesto_trabajo || "").trim();
    const sexo = String(condBulkForm.sexo || "").trim();
    const edadMin = String(condBulkForm.edad_min || "").trim();
    const edadMax = String(condBulkForm.edad_max || "").trim();

    if (!filtro) {
      setError("En automatizacion, el filtro de examen es obligatorio");
      return;
    }
    if (!puesto && !sexo && !edadMin && !edadMax) {
      setError("En automatizacion, debe ingresar al menos un criterio: puesto, sexo o rango de edad");
      return;
    }

    if (!window.confirm(`Se aplicara la condicion a examenes que coincidan con: "${filtro}". Desea continuar?`)) {
      return;
    }

    setCondBulkSaving(true);
    setCondBulkMsg("");
    setCondBulkPreviewMsg("");
    setError("");
    try {
      const data = await aplicarCondicionMasivaProtocoloOcupacional({
        protocoloId,
        empresaId,
        filtroQ: filtro,
        puestoTrabajo: puesto,
        sexo,
        edadMin,
        edadMax,
        soloPrevisualizar: false,
      });

      const resumen = data?.resumen || {};
      setCondBulkMsg(
        `Aplicado. Considerados: ${resumen.catalogos_considerados || 0}, insertados: ${resumen.insertados || 0}, omitidos por duplicado: ${resumen.omitidos_duplicado || 0}.`
      );

      if (condCatalogoSeleccionado?.catalogo_id) {
        await cargarCondiciones(condCatalogoSeleccionado.catalogo_id);
      }
    } catch (err) {
      setError(err.message || "No se pudo aplicar condicion masiva");
    } finally {
      setCondBulkSaving(false);
    }
  };

  const plantillaSeleccionada = useMemo(
    () => plantillas.find((item) => item.codigo === plantillaCodigo) || null,
    [plantillas, plantillaCodigo]
  );

  const onCargarPlantilla = async () => {
    if (!plantillaSeleccionada) return;
    await cargarPuestos();
    const reglas = Array.isArray(plantillaSeleccionada.reglas) ? plantillaSeleccionada.reglas : [];
    setPlantillaReglas(
      reglas.map((regla) => ({
        filtro_q: regla.filtro_q || "",
        puesto_trabajo: regla.puesto_trabajo || "",
        sexo: regla.sexo || "",
        edad_min: regla.edad_min ?? "",
        edad_max: regla.edad_max ?? "",
      }))
    );
    setPlantillaMsg(`Plantilla cargada: ${plantillaSeleccionada.nombre}. Puede editar cada regla antes de aplicar.`);
    setError("");
  };

  const onChangePlantillaRegla = (index, field, value) => {
    setPlantillaReglas((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  };

  const onAgregarPlantillaRegla = () => {
    setPlantillaReglas((prev) => ([
      ...prev,
      { filtro_q: "", puesto_trabajo: "", sexo: "", edad_min: "", edad_max: "" },
    ]));
  };

  const onEliminarPlantillaRegla = (index) => {
    setPlantillaReglas((prev) => prev.filter((_, idx) => idx !== index));
  };

  const ejecutarPlantilla = async (soloPrevisualizar) => {
    if (!empresaId || !protocoloId) {
      setError("Seleccione empresa y protocolo");
      return;
    }
    const reglasValidas = plantillaReglas.filter((regla) => {
      const filtro = String(regla.filtro_q || "").trim();
      const puesto = String(regla.puesto_trabajo || "").trim();
      const sexo = String(regla.sexo || "").trim();
      const edadMin = String(regla.edad_min ?? "").trim();
      const edadMax = String(regla.edad_max ?? "").trim();
      return filtro && (puesto || sexo || edadMin || edadMax);
    });

    if (reglasValidas.length === 0) {
      setError("La plantilla no tiene reglas validas para ejecutar");
      return;
    }

    setCondBulkSaving(true);
    setPlantillaMsg("");
    setError("");

    let totalCoincidentes = 0;
    let totalInsertados = 0;
    let totalOmitidos = 0;

    try {
      for (const regla of reglasValidas) {
        const data = await aplicarCondicionMasivaProtocoloOcupacional({
          protocoloId,
          empresaId,
          filtroQ: String(regla.filtro_q || "").trim(),
          puestoTrabajo: String(regla.puesto_trabajo || "").trim(),
          sexo: String(regla.sexo || "").trim(),
          edadMin: String(regla.edad_min ?? "").trim(),
          edadMax: String(regla.edad_max ?? "").trim(),
          soloPrevisualizar,
        });

        const resumen = data?.resumen || {};
        totalCoincidentes += Number(resumen.catalogos_coincidentes || resumen.catalogos_considerados || 0);
        totalInsertados += Number(resumen.insertados || 0);
        totalOmitidos += Number(resumen.omitidos_duplicado || 0);
      }

      if (soloPrevisualizar) {
        setPlantillaMsg(`Previsualizacion de plantilla: ${reglasValidas.length} reglas, ${totalCoincidentes} coincidencias. Modo legacy aditivo.`);
      } else {
        setPlantillaMsg(`Plantilla aplicada: ${reglasValidas.length} reglas, ${totalInsertados} inserciones, ${totalOmitidos} duplicados omitidos. Modo legacy aditivo.`);
      }

      if (!soloPrevisualizar && condCatalogoSeleccionado?.catalogo_id) {
        await cargarCondiciones(condCatalogoSeleccionado.catalogo_id);
      }
    } catch (err) {
      setError(err.message || `No se pudo ${soloPrevisualizar ? "previsualizar" : "aplicar"} la plantilla`);
    } finally {
      setCondBulkSaving(false);
    }
  };

  const onPrevisualizarCondicionMasiva = async () => {
    if (!empresaId || !protocoloId) {
      setError("Seleccione empresa y protocolo");
      return;
    }

    const filtro = String(condBulkForm.filtro_q || "").trim();
    const puesto = String(condBulkForm.puesto_trabajo || "").trim();
    const sexo = String(condBulkForm.sexo || "").trim();
    const edadMin = String(condBulkForm.edad_min || "").trim();
    const edadMax = String(condBulkForm.edad_max || "").trim();

    if (!filtro) {
      setError("En automatizacion, el filtro de examen es obligatorio");
      return;
    }
    if (!puesto && !sexo && !edadMin && !edadMax) {
      setError("En automatizacion, debe ingresar al menos un criterio: puesto, sexo o rango de edad");
      return;
    }

    setCondBulkSaving(true);
    setCondBulkMsg("");
    setCondBulkPreviewMsg("");
    setError("");
    try {
      const data = await aplicarCondicionMasivaProtocoloOcupacional({
        protocoloId,
        empresaId,
        filtroQ: filtro,
        puestoTrabajo: puesto,
        sexo,
        edadMin,
        edadMax,
        soloPrevisualizar: true,
      });
      const resumen = data?.resumen || {};
      setCondBulkPreviewMsg(
        `Previsualizacion (sin cambios): ${resumen.catalogos_coincidentes || 0} examenes coinciden. Modo: ${resumen.modo || "legacy_aditivo"}.`
      );
    } catch (err) {
      setError(err.message || "No se pudo previsualizar condicion masiva");
    } finally {
      setCondBulkSaving(false);
    }
  };

  const totalPages = Number(meta.total_pages || 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Salud Ocupacional - Protocolos</h1>
        <p className="text-sm text-slate-600 mt-1">
          Defina protocolos por empresa y configure montos por examen segun tipo de evaluacion.
        </p>
        {context === "protocolos" ? (
          <p className="text-xs text-amber-700 mt-1">Contexto desde Empresa: edición de protocolos por empresa.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={empresaId}
            onChange={(e) => {
              setEmpresaId(Number(e.target.value || 0));
              setPage(1);
            }}
          >
            <option value={0}>Seleccione empresa</option>
            {empresas.map((item) => (
              <option key={item.id} value={item.id}>
                {item.razon_social} ({item.ruc})
              </option>
            ))}
          </select>

          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={protocoloId}
            onChange={(e) => {
              setProtocoloId(Number(e.target.value || 0));
              setPage(1);
            }}
            disabled={!empresaId}
          >
            <option value={0}>{protocolos.length ? "Seleccione protocolo" : "Sin protocolos"}</option>
            {protocolos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.descripcion}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            disabled={!protocoloId}
            onClick={onInactivarProtocolo}
          >
            Inactivar protocolo seleccionado
          </button>
        </div>

        <form onSubmit={onGuardarProtocolo} className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Nuevo protocolo (ej. ADMINISTRATIVO, OPERATIVO, ALTURA...)"
              value={descripcionProtocolo}
              onChange={(e) => setDescripcionProtocolo(e.target.value)}
            />
            <label className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              <input
                type="checkbox"
                checked={sembrarMontosBaseNuevoProtocolo}
                onChange={(e) => setSembrarMontosBaseNuevoProtocolo(e.target.checked)}
              />
              Inicializar todas las evaluaciones con precios de Exámenes Generales
            </label>
          </div>
          <button
            type="submit"
            disabled={guardandoProtocolo || !empresaId}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {guardandoProtocolo ? "Guardando..." : "Agregar protocolo"}
          </button>
        </form>

        {empresaSeleccionada ? (
          <p className="text-xs text-slate-600">
            Empresa: <span className="font-semibold">{empresaSeleccionada.razon_social}</span>
            {protocoloSeleccionado ? (
              <>
                {" "} | Protocolo: <span className="font-semibold">{protocoloSeleccionado.descripcion}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        {!MODO_LEGACY_UI ? (
          <>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">Copiar configuracion entre protocolos</h2>
            <p className="text-xs text-emerald-800">
              Clona montos y/o condiciones desde otro protocolo de la misma empresa. Modo seguro y compatible con la logica legacy.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto]">
            <select
              className="rounded-md border border-emerald-300 px-3 py-2 text-sm"
              value={copiarOrigenId}
              onChange={(e) => setCopiarOrigenId(Number(e.target.value || 0))}
              disabled={!empresaId || protocolos.length <= 1}
            >
              <option value={0}>Seleccione protocolo origen</option>
              {protocolos
                .filter((item) => Number(item.id) !== Number(protocoloId))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.descripcion}
                  </option>
                ))}
            </select>

            <label className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900">
              <input
                type="checkbox"
                checked={copiarMontos}
                onChange={(e) => setCopiarMontos(e.target.checked)}
              />
              Copiar montos
            </label>

            <label className="flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-900">
              <input
                type="checkbox"
                checked={copiarCondiciones}
                onChange={(e) => setCopiarCondiciones(e.target.checked)}
              />
              Copiar condiciones
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-emerald-400 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              onClick={() => ejecutarCopiaConfiguracion(true)}
              disabled={copiandoConfig || !empresaId || !protocoloId || !copiarOrigenId}
            >
              {copiandoConfig ? "Procesando..." : "Previsualizar copia"}
            </button>
            <button
              type="button"
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              onClick={() => ejecutarCopiaConfiguracion(false)}
              disabled={copiandoConfig || !empresaId || !protocoloId || !copiarOrigenId}
            >
              {copiandoConfig ? "Copiando..." : "Copiar configuracion"}
            </button>
            {copiarMsg ? <p className="text-xs text-emerald-800">{copiarMsg}</p> : null}
          </div>
          </div>

          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-sky-900">Plantillas referenciales editables</h2>
            <p className="text-xs text-sky-800">
              Cargan reglas base del sistema antiguo en modo referencial. Puede editarlas antes de previsualizar o aplicar.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
            <select
              className="rounded-md border border-sky-300 px-3 py-2 text-sm"
              value={plantillaCodigo}
              onChange={(e) => setPlantillaCodigo(e.target.value)}
            >
              <option value="">Seleccione plantilla referencial</option>
              {plantillas.map((item) => (
                <option key={item.codigo} value={item.codigo}>
                  {item.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              onClick={onCargarPlantilla}
              disabled={!plantillaSeleccionada}
            >
              Cargar plantilla
            </button>
          </div>

          {plantillaSeleccionada ? (
            <p className="text-xs text-sky-800">{plantillaSeleccionada.descripcion}</p>
          ) : null}

          {plantillaReglas.length > 0 ? (
            <div className="space-y-2">
              {plantillaReglas.map((regla, index) => (
                <div key={`${plantillaCodigo}-${index}`} className="grid grid-cols-1 gap-2 rounded border border-sky-200 bg-white p-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
                  <input
                    className="rounded-md border border-sky-300 px-3 py-2 text-sm"
                    placeholder="Filtro examen"
                    value={regla.filtro_q}
                    onChange={(e) => onChangePlantillaRegla(index, "filtro_q", e.target.value)}
                  />
                  <input
                    list="puestos-empresa"
                    className="rounded-md border border-sky-300 px-3 py-2 text-sm"
                    placeholder="Puesto"
                    value={regla.puesto_trabajo}
                    onChange={(e) => onChangePlantillaRegla(index, "puesto_trabajo", e.target.value)}
                  />
                  <select
                    className="rounded-md border border-sky-300 px-3 py-2 text-sm"
                    value={regla.sexo}
                    onChange={(e) => onChangePlantillaRegla(index, "sexo", e.target.value)}
                  >
                    <option value="">Sexo (todos)</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className="rounded-md border border-sky-300 px-3 py-2 text-sm"
                    placeholder="Edad min"
                    value={regla.edad_min}
                    onChange={(e) => onChangePlantillaRegla(index, "edad_min", e.target.value)}
                  />
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className="rounded-md border border-sky-300 px-3 py-2 text-sm"
                    placeholder="Edad max"
                    value={regla.edad_max}
                    onChange={(e) => onChangePlantillaRegla(index, "edad_max", e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    onClick={() => onEliminarPlantillaRegla(index)}
                  >
                    Quitar
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-sky-300 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                  onClick={onAgregarPlantillaRegla}
                >
                  Agregar regla
                </button>
                <button
                  type="button"
                  className="rounded border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                  onClick={() => ejecutarPlantilla(true)}
                  disabled={condBulkSaving || !empresaId || !protocoloId}
                >
                  {condBulkSaving ? "Procesando..." : "Previsualizar plantilla"}
                </button>
                <button
                  type="button"
                  className="rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
                  onClick={() => ejecutarPlantilla(false)}
                  disabled={condBulkSaving || !empresaId || !protocoloId}
                >
                  {condBulkSaving ? "Aplicando..." : "Aplicar plantilla"}
                </button>
                {plantillaMsg ? <p className="text-xs text-sky-800">{plantillaMsg}</p> : null}
              </div>
            </div>
          ) : null}
          </div>

          <form onSubmit={onAplicarCondicionMasiva} className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <h2 className="text-sm font-semibold text-amber-900">Automatizacion rapida de condiciones por edad</h2>
          <p className="text-xs text-amber-800">
            Aplica una condicion a todos los examenes que coincidan con un filtro. Ejemplo: filtro "electrocardiograma", edad min 40.
          </p>
          <p className="text-xs text-amber-800">
            Compatibilidad legacy: esta automatizacion es aditiva, no elimina ni sobrescribe condiciones existentes.
          </p>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
            <input
              className="rounded-md border border-amber-300 px-3 py-2 text-sm lg:col-span-2"
              placeholder="Filtro examen (codigo, descripcion, grupo o subgrupo)"
              value={condBulkForm.filtro_q}
              onChange={(e) => setCondBulkForm((prev) => ({ ...prev, filtro_q: e.target.value }))}
            />
            <input
              list="puestos-empresa"
              className="rounded-md border border-amber-300 px-3 py-2 text-sm"
              placeholder="Puesto (opcional)"
              value={condBulkForm.puesto_trabajo}
              onChange={(e) => setCondBulkForm((prev) => ({ ...prev, puesto_trabajo: e.target.value }))}
            />
            <select
              className="rounded-md border border-amber-300 px-3 py-2 text-sm"
              value={condBulkForm.sexo}
              onChange={(e) => setCondBulkForm((prev) => ({ ...prev, sexo: e.target.value }))}
            >
              <option value="">Sexo (todos)</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                max={120}
                className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                placeholder="Edad min"
                value={condBulkForm.edad_min}
                onChange={(e) => setCondBulkForm((prev) => ({ ...prev, edad_min: e.target.value }))}
              />
              <input
                type="number"
                min={0}
                max={120}
                className="rounded-md border border-amber-300 px-3 py-2 text-sm"
                placeholder="Edad max"
                value={condBulkForm.edad_max}
                onChange={(e) => setCondBulkForm((prev) => ({ ...prev, edad_max: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={condBulkSaving || !empresaId || !protocoloId}
              className="rounded border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              onClick={onPrevisualizarCondicionMasiva}
            >
              {condBulkSaving ? "Procesando..." : "Previsualizar impacto"}
            </button>
            <button
              type="submit"
              disabled={condBulkSaving || !empresaId || !protocoloId}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {condBulkSaving ? "Aplicando..." : "Aplicar condicion masiva"}
            </button>
            {condBulkPreviewMsg ? <p className="text-xs text-blue-700">{condBulkPreviewMsg}</p> : null}
            {condBulkMsg ? <p className="text-xs text-emerald-700">{condBulkMsg}</p> : null}
          </div>
            </form>
          </>
        ) : null}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Buscar examen por codigo, descripcion, grupo, subgrupo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Los campos <span className="font-semibold">PRE</span>, <span className="font-semibold">PER</span> y <span className="font-semibold">POST</span> son editables.
          Haga clic en el monto, escriba el valor y salga del campo para guardar automaticamente. Si borra el valor, se quitará la configuración de ese examen para ese tipo.
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Una celda <span className="font-semibold">Sin configurar</span> no forma parte del protocolo para ese tipo de evaluación.
          Si muestra <span className="font-semibold">Configurado</span>, el monto está guardado específicamente en el protocolo seleccionado.
          Los registros históricos marcados como <span className="font-semibold">Excluido</span> tampoco aparecerán en la orden ocupacional.
          Use <span className="font-semibold">Quitar</span> para eliminar una configuración existente.
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando matriz de protocolo...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {isDesktopMatrix ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-3">Codigo</th>
                <th className="py-2 pr-3">Descripcion</th>
                <th className="py-2 pr-3">Grupo</th>
                <th className="py-2 pr-3">Subgrupo</th>
                <th className="py-2 pr-3 text-center">Condiciones</th>
                {tipos.map((t) => (
                  <th key={t.id} className="py-2 pr-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span>{t.codigo}</span>
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Editable</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.catalogo_id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{row.codigo}</td>
                  <td className="py-2 pr-3">{row.descripcion}</td>
                  <td className="py-2 pr-3">{row.grupo || "-"}</td>
                  <td className="py-2 pr-3">{row.subgrupo || "-"}</td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      type="button"
                      className="rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                      onClick={() => abrirCondiciones(row)}
                      disabled={!protocoloId}
                    >
                      Condiciones
                    </button>
                  </td>
                  {tipos.map((t) => {
                    const cellKey = `${row.catalogo_id}-${t.id}`;
                    const busy = savingCellKey === cellKey;
                    const saved = savedCellKey === cellKey;
                    const failed = cellErrorKey === cellKey;
                    const montoMeta = row.montos?.[String(t.id)] || { valor: "", origen: "sin_configurar" };
                    const origenMonto = montoMeta?.origen || "sin_configurar";
                    const isPersonalizado = origenMonto === "protocolo";
                    const isExcluido = origenMonto === "protocolo_excluido";
                    return (
                      <td key={t.id} className="py-2 pr-3">
                        <div className="flex flex-col items-end gap-1">
                          <input
                            type="text"
                            className="w-28 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-right font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200"
                            value={montoMeta?.valor ?? ""}
                            placeholder="Editar"
                            title={`Campo editable ${t.codigo}. Se guarda al salir del campo o con Enter.`}
                            aria-label={`Monto editable ${t.codigo} para ${row.descripcion}`}
                            onFocus={(e) => onMontoFocus(row.catalogo_id, t.id, e.target.value)}
                            onChange={(e) => onMontoChange(row.catalogo_id, t.id, e.target.value)}
                            onBlur={(e) => onMontoBlur(row, t.id, e.target.value)}
                            onKeyDown={onMontoKeyDown}
                            disabled={!protocoloId || busy}
                          />
                          <span className={`text-[10px] font-semibold ${origenMonto === "protocolo" ? "text-violet-700" : "text-amber-700"}`}>
                            {isPersonalizado ? "Configurado" : isExcluido ? "Excluido" : "Sin configurar"}
                          </span>
                          {(isPersonalizado || isExcluido) ? (
                            <button
                              type="button"
                              className="rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              onClick={() => onQuitarMonto(row, t.id)}
                              disabled={busy}
                            >
                              Quitar
                            </button>
                          ) : null}
                          <span className={`text-[10px] font-semibold ${busy ? "text-amber-600" : saved ? "text-emerald-600" : failed ? "text-red-600" : "text-slate-400"}`}>
                            {busy ? "Guardando..." : saved ? "Guardado" : failed ? "Error" : "Enter o salir"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5 + tipos.length}>No hay examenes activos en catalogo para esta empresa.</td>
                </tr>
              ) : null}
            </tbody>
            {tipos.length > 0 ? (
              <tfoot>
                <tr className="border-t bg-slate-50 font-semibold text-slate-700">
                  <td className="py-2 pr-3" colSpan={5}>TOTAL</td>
                  {tipos.map((t) => (
                    <td key={t.id} className="py-2 pr-3 text-right">S/ {Number(totales?.[String(t.id)] || 0).toFixed(2)}</td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.catalogo_id} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div>
                <p className="text-xs text-slate-500">{row.codigo}</p>
                <p className="text-sm font-semibold text-slate-800">{row.descripcion}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <p><span className="font-semibold">Grupo:</span> {row.grupo || "-"}</p>
                <p><span className="font-semibold">Subgrupo:</span> {row.subgrupo || "-"}</p>
              </div>
              <button
                type="button"
                className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
                onClick={() => abrirCondiciones(row)}
                disabled={!protocoloId}
              >
                Condiciones
              </button>
              <div className="space-y-2">
                {tipos.map((t) => {
                  const cellKey = `${row.catalogo_id}-${t.id}`;
                  const busy = savingCellKey === cellKey;
                  const saved = savedCellKey === cellKey;
                  const failed = cellErrorKey === cellKey;
                  const montoMeta = row.montos?.[String(t.id)] || { valor: "", origen: "sin_configurar" };
                  const origenMonto = montoMeta?.origen || "sin_configurar";
                  const isPersonalizado = origenMonto === "protocolo";
                  const isExcluido = origenMonto === "protocolo_excluido";
                  return (
                    <div key={t.id} className="space-y-1">
                      <label className="flex items-center justify-between gap-2 text-xs text-slate-700">
                        <span className="font-semibold">{t.codigo}</span>
                        <input
                          type="text"
                          className="w-28 rounded border border-blue-300 bg-blue-50 px-2 py-1 text-right font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200"
                          value={montoMeta?.valor ?? ""}
                          placeholder="Editar"
                          title={`Campo editable ${t.codigo}. Se guarda al salir del campo o con Enter.`}
                          aria-label={`Monto editable ${t.codigo} para ${row.descripcion}`}
                          onFocus={(e) => onMontoFocus(row.catalogo_id, t.id, e.target.value)}
                          onChange={(e) => onMontoChange(row.catalogo_id, t.id, e.target.value)}
                          onBlur={(e) => onMontoBlur(row, t.id, e.target.value)}
                          onKeyDown={onMontoKeyDown}
                          disabled={!protocoloId || busy}
                        />
                      </label>
                      <p className={`text-right text-[10px] font-semibold ${isPersonalizado ? "text-violet-700" : isExcluido ? "text-red-700" : "text-amber-700"}`}>
                        {isPersonalizado ? "Configurado" : isExcluido ? "Excluido" : "Sin configurar"}
                      </p>
                      {(isPersonalizado || isExcluido) ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            onClick={() => onQuitarMonto(row, t.id)}
                            disabled={busy}
                          >
                            Quitar
                          </button>
                        </div>
                      ) : null}
                      <p className={`text-right text-[10px] font-semibold ${busy ? "text-amber-600" : saved ? "text-emerald-600" : failed ? "text-red-600" : "text-slate-400"}`}>
                        {busy ? "Guardando..." : saved ? "Guardado" : failed ? "Error" : "Enter o salir"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 ? (
            <p className="text-sm text-slate-500">No hay examenes activos en catalogo para esta empresa.</p>
          ) : null}
        </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Total: {meta.total || 0} registros</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <span className="text-xs text-slate-600">Pag. {page}/{Math.max(1, totalPages)}</span>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs disabled:opacity-50"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>

      {condCatalogoSeleccionado ? (
        <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-violet-900">
              Condiciones - {condCatalogoSeleccionado.codigo} - {condCatalogoSeleccionado.descripcion}
            </h2>
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-xs"
              onClick={() => {
                setCondCatalogoSeleccionado(null);
                setCondiciones([]);
                setCondError("");
                setCondEditingId(0);
              }}
            >
              Cerrar
            </button>
          </div>

          <form onSubmit={onGuardarCondicion} className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
              value={condForm.puesto_trabajo}
              onChange={(e) => setCondForm((prev) => ({ ...prev, puesto_trabajo: e.target.value }))}
            >
              <option value="">Todos los puestos</option>
              {puestosEmpresa.map((p) => (
                <option key={p.puesto_trabajo} value={p.puesto_trabajo}>{p.puesto_trabajo}</option>
              ))}
            </select>

            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={condForm.sexo}
              onChange={(e) => setCondForm((prev) => ({ ...prev, sexo: e.target.value }))}
            >
              <option value="">Sexo (todos)</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>

            <input
              type="number"
              min={0}
              max={120}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Edad min"
              value={condForm.edad_min}
              onChange={(e) => setCondForm((prev) => ({ ...prev, edad_min: e.target.value }))}
            />

            <input
              type="number"
              min={0}
              max={120}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Edad max"
              value={condForm.edad_max}
              onChange={(e) => setCondForm((prev) => ({ ...prev, edad_max: e.target.value }))}
            />

            <div className="md:col-span-5">
              <button
                type="submit"
                disabled={condSaving}
                className="rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {condSaving ? "Guardando..." : condEditingId ? "Actualizar condicion" : "Agregar condicion"}
              </button>
              {condEditingId ? (
                <button
                  type="button"
                  className="ml-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={onCancelarEdicionCondicion}
                >
                  Cancelar edicion
                </button>
              ) : null}
            </div>
          </form>

          {condLoading ? <p className="text-sm text-slate-500">Cargando condiciones...</p> : null}
          {condError ? <p className="text-sm text-red-600">{condError}</p> : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 pr-3">Puesto</th>
                  <th className="py-2 pr-3">Sexo</th>
                  <th className="py-2 pr-3">Edad min</th>
                  <th className="py-2 pr-3">Edad max</th>
                  <th className="py-2 pr-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {condiciones.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{c.puesto_trabajo || "TODOS"}</td>
                    <td className="py-2 pr-3">{c.sexo === "M" ? "MASCULINO" : c.sexo === "F" ? "FEMENINO" : "TODOS"}</td>
                    <td className="py-2 pr-3">{c.edad_min ?? "-"}</td>
                    <td className="py-2 pr-3">{c.edad_max ?? "-"}</td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="mr-2 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        onClick={() => onEditarCondicion(c)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        onClick={() => onEliminarCondicion(c.id)}
                        disabled={condDeletingId === Number(c.id)}
                      >
                        {condDeletingId === Number(c.id) ? "Eliminando..." : "Eliminar"}
                      </button>
                    </td>
                  </tr>
                ))}
                {!condLoading && condiciones.length === 0 ? (
                  <tr>
                    <td className="py-3 text-slate-500" colSpan={5}>No hay condiciones registradas para este examen.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
