import React from "react";

export default function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded shadow-lg p-4 w-full max-w-5xl relative animate-fadeIn flex flex-col" style={{ maxHeight: '90vh' }}>
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl font-bold"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>
        <div className="overflow-auto" style={{ maxHeight: '70vh', paddingRight: 8 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
