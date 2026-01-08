import React from "react";

function PacienteListModal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-2 sm:p-6 w-full max-w-full sm:max-w-3xl md:max-w-4xl min-h-[60vh] flex flex-col justify-center relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-xl font-bold"
          aria-label="Cerrar"
        >
          ×
        </button>
        <div className="w-full h-full flex flex-col justify-center">
          {children}
        </div>
      </div>
    </div>
  );
}

export default PacienteListModal;
