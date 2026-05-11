import React from 'react'
import { useCart } from '../../context/CartContext'

function money(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00'
}

export default function CartItem({ item }) {
  const { removeItem } = useCart()
  const itemName = item?.nombre || item?.titulo || 'Oferta'

  return (
    <div className="p-3 border border-gray-200 rounded-lg bg-white">
      {/* Item header */}
      <div className="flex justify-between items-start gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 flex-1">{itemName}</h3>
        <button
          onClick={() => removeItem(item.id)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 transition"
          aria-label="Eliminar del carrito"
          title="Eliminar servicio"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 7h16" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M9 7V5.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M7.7 7l.75 10.5a1.8 1.8 0 0 0 1.8 1.67h3.5a1.8 1.8 0 0 0 1.8-1.67L16.3 7" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M10.3 10.5v5.2M13.7 10.5v5.2" />
          </svg>
        </button>
      </div>

      {/* Price info */}
      <div className="mb-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--color-primary, #E85D8E)' }}>
          S/ {money(item.precio)}
        </p>
        {item.precio_antes && (
          <p className="text-xs text-gray-500 line-through">
            S/ {money(item.precio_antes)}
          </p>
        )}
      </div>

    </div>
  )
}
