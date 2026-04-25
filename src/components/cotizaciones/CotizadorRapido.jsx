import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BASE_URL } from "../../config/config";
import { FiSearch, FiUserPlus, FiFileText, FiX } from "react-icons/fi";

export default function CotizadorRapido() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState("idle"); // idle | searching | found | not_found
  const [paciente, setPaciente] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setEstado("idle");
      setPaciente(null);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setEstado("searching");
      setPaciente(null);

      try {
        const res = await fetch(
          `${BASE_URL}api_pacientes.php?busqueda=${encodeURIComponent(trimmed)}&limit=1`,
          { credentials: "include", signal: controller.signal }
        );
        const data = await res.json();
        const found = data?.pacientes?.[0] || null;
        if (found) {
          setPaciente(found);
          setEstado("found");
        } else {
          setEstado("not_found");
        }
      } catch (err) {
        if (err?.name !== "AbortError") setEstado("not_found");
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleCotizar = () => {
    if (!paciente?.id) return;
    navigate(`/seleccionar-servicio?paciente_id=${paciente.id}`);
  };

  const handleRegistrar = () => {
    navigate("/pacientes", { state: { prefillDni: query.trim(), openModal: true } });
  };

  const handleLimpiar = () => {
    setQuery("");
    setEstado("idle");
    setPaciente(null);
    inputRef.current?.focus();
  };

  return (
    <div className="mb-5 rounded-xl border-2 p-4" style={{ borderColor: "var(--color-primary-light)", backgroundColor: "var(--color-primary-light, #f3f0ff)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-primary-dark)" }}>
        Nueva cotización rápida
      </p>

      {/* Input */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ingresa DNI o N° Historia Clínica"
            className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2"
            style={{ focusRingColor: "var(--color-primary)" }}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={handleLimpiar}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Limpiar"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Resultado */}
      {estado === "searching" && (
        <p className="mt-2 text-sm text-gray-500 animate-pulse">Buscando...</p>
      )}

      {estado === "found" && paciente && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 bg-white rounded-lg border px-3 py-2 text-sm">
            <span className="font-semibold" style={{ color: "var(--color-primary-dark)" }}>
              {paciente.nombre} {paciente.apellido}
            </span>
            <span className="text-gray-500 ml-2 text-xs">
              DNI: {paciente.dni} | HC: {paciente.historia_clinica}
            </span>
          </div>
          <button
            onClick={handleCotizar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundImage: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)" }}
          >
            <FiFileText size={15} />
            Cotizar
          </button>
        </div>
      )}

      {estado === "not_found" && (
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="flex-1 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Paciente no encontrado para <b>"{query.trim()}"</b>
          </p>
          <button
            onClick={handleRegistrar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
          >
            <FiUserPlus size={15} />
            Registrar paciente
          </button>
        </div>
      )}
    </div>
  );
}
