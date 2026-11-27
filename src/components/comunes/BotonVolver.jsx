import { FaArrowLeft } from "react-icons/fa";

/** Botón «Volver» estándar del sistema (mismo estilo que Consulta médica). */
export default function BotonVolver({ onClick, children = "Volver", ariaLabel, className = "", title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={`group inline-flex shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-300 active:scale-95 ${className}`}
    >
      <FaArrowLeft className="text-xs transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
      {children}
    </button>
  );
}
