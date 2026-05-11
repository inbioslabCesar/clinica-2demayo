import React from 'react'
import { useCart } from '../../context/CartContext'

export default function CartToggleButton() {
  const { toggleOpen, getTotalItems } = useCart()
  const itemCount = getTotalItems()

  return (
    <button
      onClick={toggleOpen}
      className="relative p-2.5 rounded-lg hover:bg-gray-100 text-gray-700 transition"
      aria-label="Abrir carrito"
      title="Mi carrito"
    >
      {/* Icono carrito */}
      <svg
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M2.75 3.5h1.5l1.7 8.5a1.5 1.5 0 0 0 1.47 1.2h8.76a1.5 1.5 0 0 0 1.45-1.1l1.35-4.9a1 1 0 0 0-.96-1.27H6.1"
        />
        <circle cx="9" cy="18" r="1.6" strokeWidth={2} />
        <circle cx="17" cy="18" r="1.6" strokeWidth={2} />
      </svg>

      {/* Badge con cantidad */}
      {itemCount > 0 && (
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold text-white rounded-full"
          style={{ backgroundColor: 'var(--color-primary, #E85D8E)' }}
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}
