import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "../../utils/apiClient";
import { ALCANCES, agruparProtocolos, itemsParaProtocolo } from "../../utils/protocolosReceta";

const MODAL_CERRADO = { abierto: false, modo: "nuevo", nombre: "", scope: "medico", protocolo: null };

function descripcionProtocolo(p) {
  const partes = [`${p.nombre} · ${Array.isArray(p.items) ? p.items.length : 0} medicamento(s)`];
  if (p.creado_por_nombre) partes.push(`Creado por ${p.creado_por_nombre}`);
  if (p.actualizado_por_nombre) partes.push(`Última edición: ${p.actualizado_por_nombre}`);
  return partes.join(" · ");
}

/**
 * Protocolos de receta: aplicar (agrega al final de la lista), editar (carga el protocolo en la lista editable),
 * guardar como nuevo y eliminar. La receta del paciente se edita aparte y nunca modifica el protocolo.
 */
export default function ProtocolosReceta({ consultaId, receta, setReceta, onAplicar, normalizarItems }) {
  const recetaArray = Array.isArray(receta) ? receta : [];
  const [protocolos, setProtocolos] = useState([]);
  const [contexto, setContexto] = useState({ especialidad: "", puede_gestionar: true });
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [modal, setModal] = useState(MODAL_CERRADO);
  const [editando, setEditando] = useState(null);
  const [ocupadoId, setOcupadoId] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const consulta = Number(consultaId || 0);

  const cargar = useCallback(async () => {
    if (consulta <= 0) {
      setProtocolos([]);
      return;
    }
    const res = await authFetch(`api_receta_protocolos.php?consulta_id=${consulta}`, { cache: "no-store" });
    const data = await res.json();
    setProtocolos(Array.isArray(data?.data) ? data.data : []);
    if (data?.contexto) setContexto(data.contexto);
  }, [consulta]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    cargar()
      .catch(() => {
        if (!cancelado) setProtocolos([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cargar]);

  const grupos = useMemo(() => agruparProtocolos(protocolos, filtro), [protocolos, filtro]);
  const puedeGestionar = contexto?.puede_gestionar !== false;

  const iniciarEdicion = (p) => {
    if (recetaArray.length > 0 && !window.confirm("La lista actual se reemplaza por la del protocolo mientras lo editas. Al terminar o cancelar se restaura tu lista. ¿Continuar?")) {
      return;
    }
    setEditando({ protocolo: p, recetaPrevia: recetaArray });
    setReceta(normalizarItems(p.items));
    setError("");
  };

  const terminarEdicion = () => {
    if (editando) setReceta(editando.recetaPrevia);
    setEditando(null);
  };

  const abrirModal = (modo, protocolo) => {
    setError("");
    if (modo === "actualizar") {
      setModal({ abierto: true, modo, nombre: protocolo.nombre, scope: protocolo.alcance || "medico", protocolo });
    } else {
      const base = protocolo ? `${protocolo.nombre} (copia)` : "";
      setModal({ abierto: true, modo, nombre: base, scope: "medico", protocolo: protocolo || null });
    }
  };

  const confirmarModal = async () => {
    const nombre = modal.nombre.trim();
    if (!nombre) {
      setError("Escribe un nombre para el protocolo.");
      return;
    }
    if (recetaArray.length === 0) {
      setError("La lista no tiene medicamentos.");
      return;
    }
    const actualizar = modal.modo === "actualizar" && modal.protocolo;
    const body = {
      action: actualizar ? "update" : "save",
      consulta_id: consulta,
      nombre,
      items: itemsParaProtocolo(recetaArray),
    };
    if (actualizar) {
      body.id = modal.protocolo.id;
      if (modal.protocolo.puede_cambiar_alcance) body.scope = modal.scope;
    } else {
      body.scope = modal.scope;
    }

    setGuardando(true);
    setError("");
    try {
      const res = await authFetch("api_receta_protocolos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.success) {
        setError(data?.error || "No se pudo guardar el protocolo");
        return;
      }
      setModal(MODAL_CERRADO);
      await cargar();
      if (editando) terminarEdicion();
    } catch {
      setError("No se pudo guardar el protocolo");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar protocolo "${p.nombre}"? Dejará de estar disponible para quienes lo usan.`)) return;
    setOcupadoId(p.id);
    try {
      const res = await authFetch("api_receta_protocolos.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: p.id, consulta_id: consulta }),
      });
      const data = await res.json();
      if (!data?.success) {
        window.alert(data?.error || "No se pudo eliminar el protocolo");
        return;
      }
      setProtocolos((prev) => prev.filter((x) => x.id !== p.id));
      if (editando?.protocolo?.id === p.id) terminarEdicion();
    } catch {
      window.alert("No se pudo eliminar el protocolo");
    } finally {
      setOcupadoId(0);
    }
  };

  const sinEspecialidad = !String(contexto?.especialidad || "").trim();

  return (
    <div className="mb-3 border rounded p-3 bg-sky-50">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-sky-900">Protocolos de receta</h4>
        {puedeGestionar && !editando && (
          <button
            type="button"
            className="text-xs sm:text-sm bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded disabled:opacity-50"
            onClick={() => abrirModal("nuevo", null)}
            disabled={recetaArray.length === 0}
          >
            Guardar receta actual como protocolo
          </button>
        )}
      </div>

      {editando && (
        <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-semibold">Editando protocolo «{editando.protocolo.nombre}»</p>
          <p className="mb-2">
            La lista de abajo es el protocolo: agrega, quita o reordena medicamentos y guarda. Tu receta anterior se restaura al terminar.
            {editando.protocolo.alcance !== "medico" ? " Los cambios los verán todos los que usan este protocolo." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {editando.protocolo.puede_editar && (
              <button type="button" className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded disabled:opacity-50" disabled={recetaArray.length === 0} onClick={() => abrirModal("actualizar", editando.protocolo)}>
                Guardar cambios
              </button>
            )}
            <button type="button" className="bg-white border border-amber-400 hover:bg-amber-100 px-3 py-1 rounded disabled:opacity-50" disabled={recetaArray.length === 0} onClick={() => abrirModal("nuevo", editando.protocolo)}>
              Guardar como nuevo
            </button>
            <button type="button" className="bg-white border border-gray-300 hover:bg-gray-100 px-3 py-1 rounded" onClick={terminarEdicion}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {cargando && <p className="text-xs text-sky-700">Cargando protocolos...</p>}
      {!cargando && protocolos.length === 0 && <p className="text-xs text-sky-700">Sin protocolos aun para este contexto.</p>}

      {!cargando && protocolos.length > 6 && (
        <input
          type="search"
          className="mb-2 w-full sm:w-72 border rounded px-2 py-1 text-xs"
          placeholder="Buscar protocolo o medicamento"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      )}
      {!cargando && protocolos.length > 0 && grupos.length === 0 && <p className="text-xs text-sky-700">Ningún protocolo coincide con la búsqueda.</p>}

      {!cargando && grupos.map((g) => (
        <div key={g.clave} className="mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 mb-1">{g.titulo}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((p) => (
              <div key={p.id} className="inline-flex items-center rounded border border-sky-300 bg-white overflow-hidden">
                <button type="button" className="text-xs hover:bg-sky-100 text-sky-800 px-2 py-1" onClick={() => onAplicar(p)} title={`Aplicar: ${descripcionProtocolo(p)}`}>
                  {p.nombre}
                </button>
                {p.puede_editar && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 border-l border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                    onClick={() => iniciarEdicion(p)}
                    disabled={Boolean(editando)}
                    title={`Editar ${p.nombre}`}
                  >
                    ✎
                  </button>
                )}
                {p.puede_eliminar && (
                  <button
                    type="button"
                    className="text-xs px-2 py-1 border-l border-sky-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    onClick={() => eliminar(p)}
                    disabled={ocupadoId === p.id}
                    title={`Eliminar ${p.nombre}`}
                  >
                    {ocupadoId === p.id ? "..." : "X"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {modal.abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-xl">
            <h5 className="mb-3 text-base font-semibold">
              {modal.modo === "actualizar" ? "Guardar cambios del protocolo" : "Guardar como protocolo"}
            </h5>
            <label className="mb-3 block text-sm">
              Nombre
              <input
                type="text"
                maxLength={150}
                className="mt-1 w-full rounded border px-2 py-1"
                value={modal.nombre}
                onChange={(e) => setModal((m) => ({ ...m, nombre: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="mb-1 block text-sm">
              ¿Quién lo puede usar?
              <select
                className="mt-1 w-full rounded border px-2 py-1 disabled:bg-gray-100"
                value={modal.scope}
                disabled={modal.modo === "actualizar" && !modal.protocolo?.puede_cambiar_alcance}
                onChange={(e) => setModal((m) => ({ ...m, scope: e.target.value }))}
              >
                {Object.values(ALCANCES).map((a) => (
                  <option key={a.clave} value={a.clave} disabled={a.clave === "especialidad" && sinEspecialidad}>
                    {a.opcion}
                  </option>
                ))}
              </select>
            </label>
            {modal.scope !== "medico" && (
              <p className="mb-2 text-xs text-amber-700">Los demás médicos lo verán y podrán editarlo; solo el autor o el administrador lo elimina.</p>
            )}
            <p className="mb-3 text-xs text-gray-500">Se guardan {recetaArray.length} medicamento(s) en el orden de la lista.</p>
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded border px-3 py-1 text-sm hover:bg-gray-100" onClick={() => setModal(MODAL_CERRADO)} disabled={guardando}>
                Cancelar
              </button>
              <button type="button" className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700 disabled:opacity-50" onClick={confirmarModal} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {!modal.abierto && error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
