import React, { memo } from "react";
import { evaluarRegistroPaciente, textoMotivosRegistroIncompleto } from "../../utils/pacienteRegistroEstado";

const CLASE_ACCION_SECUNDARIA = "rounded-md border bg-white px-2 py-1 text-xs font-medium transition-colors";

const PacienteListTable = memo(function PacienteListTable({ pacientes, onEditar, onEliminar, onDescargarCaratula, onNavigate, onCotizarPaciente, cotizarLabel = "Cotizar", sortBy, sortDir, handleSort, page, setPage, totalPages }) {
  return (
    <div className="hidden lg:block overflow-x-auto w-full">
      <table className="min-w-full text-sm border">
        <thead>
          <tr className="bg-blue-100">
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("historia_clinica")}>HC {sortBy === "historia_clinica" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("nombre")}>Nombre {sortBy === "nombre" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("apellido")}>Apellido {sortBy === "apellido" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("edad")}>Edad {sortBy === "edad" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("dni")}>DNI {sortBy === "dni" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border cursor-pointer" onClick={() => handleSort("tipo_seguro")}>Tipo de seguro {sortBy === "tipo_seguro" ? (sortDir === "asc" ? "▲" : "▼") : ""}</th>
            <th className="px-2 py-1 border">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(pacientes || []).map(p => {
            const contratoEstado = Number(p?.contrato_activo || 0);
            const tieneContrato = contratoEstado > 0;
            const registroEval = evaluarRegistroPaciente(p);
            const registroIncompleto = registroEval.incompleto;
            const registroTooltip = textoMotivosRegistroIncompleto(registroEval.motivos);
            const tipoSeguroRaw = String(p?.tipo_seguro || "").trim();
            const tipoSeguroNormalizado = tipoSeguroRaw.toUpperCase() === "PENDIENTE_COMPLETAR" ? "" : tipoSeguroRaw;
            return (
            <tr key={p.id} className="hover:bg-blue-50">
              <td className="border px-2 py-1">{p.historia_clinica}</td>
              <td className="border px-2 py-1">{p.nombre}</td>
              <td className="border px-2 py-1">{p.apellido}</td>
              <td className="border px-2 py-1">{p.edad !== null ? p.edad : '-'} </td>
              <td className="border px-2 py-1">{p.dni}</td>
              <td className="border px-2 py-1">
                {registroIncompleto ? (
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800" title={registroTooltip}>
                    Registro incompleto
                  </span>
                ) : (tipoSeguroNormalizado || '-')}
              </td>
              <td className="border px-2 py-2">
                <div className="flex items-center justify-end gap-3">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button onClick={() => onEditar(p)} className={`${CLASE_ACCION_SECUNDARIA} border-slate-300 text-slate-700 hover:bg-slate-100`}>Editar</button>
                    <button onClick={() => onNavigate(`/consumo-paciente/${p.id}`)} className={`${CLASE_ACCION_SECUNDARIA} border-slate-300 text-slate-700 hover:bg-slate-100`} title="Ver consumo total">Consumo</button>
                    <button onClick={() => onDescargarCaratula(p)} className={`${CLASE_ACCION_SECUNDARIA} border-slate-300 text-slate-700 hover:bg-slate-100`} title="Descargar carátula">Carátula</button>
                    {tieneContrato && (
                      <button
                        onClick={() => onNavigate(`/estado-cuenta/${p.id}`)}
                        className={`${CLASE_ACCION_SECUNDARIA} ${contratoEstado === 2 ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
                        title={contratoEstado === 2 ? "Estado de cuenta (contrato vigente)" : "Estado de cuenta (contrato histórico)"}
                      >
                        Estado cuenta
                      </button>
                    )}
                    <button onClick={() => onEliminar(p)} className={`${CLASE_ACCION_SECUNDARIA} border-red-200 text-red-600 hover:bg-red-50`}>Eliminar</button>
                  </div>
                  <button
                    onClick={() => (onCotizarPaciente ? onCotizarPaciente(p) : onNavigate(`/seleccionar-servicio?paciente_id=${p.id}`))}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-indigo-700/20 transition hover:bg-indigo-700 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
                    title={cotizarLabel === "Agendar" ? "Seleccionar y agendar consulta" : "Cotizar / seleccionar servicio"}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-6 4h6m-6 4h3M6 3h12a1 1 0 011 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 011-1z" />
                    </svg>
                    {cotizarLabel}
                  </button>
                </div>
              </td>
            </tr>
          )})}
        </tbody>
      </table>
      {/* Paginación solo en desktop */}
      <div className="flex justify-end items-center gap-2 mt-2 lg:flex">
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
          className="px-3 py-1 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
        >Anterior</button>
        <span className="font-semibold">Página {page} de {totalPages}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
        >Siguiente</button>
      </div>
    </div>
  );
});

export default PacienteListTable;
