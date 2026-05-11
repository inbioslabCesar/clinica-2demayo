import React, { useEffect } from 'react'
import { useCart } from '../../context/CartContext'
import CartItem from './CartItem'
import CartSummary from './CartSummary'

export default function CartPanel({ whatsappNumero = '' }) {
  const { items, isOpen, closeCart } = useCart()

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeCart()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeCart])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay background */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 bg-black/40 transition-opacity"
        style={{ top: 'var(--public-header-height, 4rem)' }}
        onClick={closeCart}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed right-0 w-96 max-w-[100vw] bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-right"
        style={{
          top: 'var(--public-header-height, 4rem)',
          height: 'calc(100vh - var(--public-header-height, 4rem))',
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-primary, #E85D8E)' }}>
            Mi Carrito
          </h2>
          <button
            onClick={closeCart}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition"
            aria-label="Cerrar carrito"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-center text-gray-500 text-sm">
                Tu carrito está vacío. Agrega ofertas para comenzar.
              </p>
            </div>
          ) : (
            items.map((item) => <CartItem key={item.id} item={item} />)
          )}
        </div>

        {/* Footer - Summary */}
        {items.length > 0 && <CartSummary whatsappNumero={whatsappNumero} />}
      </div>
    </>
  )
}
