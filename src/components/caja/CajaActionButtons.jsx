import React from "react";

export default function CajaActionButtons({ cajaAbierta, usuario, setShowModal }) {
  return (
    <div className="mb-8 flex justify-center gap-4">
      {!cajaAbierta && usuario && (
        <button
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700"
          onClick={() => setShowModal(true)}
        >
          Abrir Caja
        </button>
      )}
      {cajaAbierta && usuario && (
        <button
          className="bg-red-600 text-white px-6 py-2 rounded shadow hover:bg-red-700"
          onClick={() => window.location.href = "/contabilidad/cerrar-caja"}
        >
          Cerrar Caja
        </button>
      )}
      <button
        className="bg-orange-500 text-white px-6 py-2 rounded shadow hover:bg-orange-600"
        onClick={() => window.location.href = "/contabilidad/egresos"}
      >
        Ir a Egresos
      </button>
    </div>
  );
}
