import React, { useState } from 'react'
import { useCart } from '../../context/CartContext'
import Swal from 'sweetalert2'

export default function AddToCartButton({ oferta }) {
  const { addItem } = useCart()
  const [loading, setLoading] = useState(false)

  const handleAddToCart = async () => {
    setLoading(true)

    try {
      addItem(oferta)

      // Mostrar notificación de éxito
      await Swal.fire({
        icon: 'success',
        title: '¡Agregado!',
        text: `${oferta.titulo} ha sido añadido al carrito`,
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
      })
    } catch (error) {
      console.error('Error al agregar al carrito:', error)
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudo agregar la oferta al carrito.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleAddToCart}
      disabled={loading}
      className="w-full mt-4 py-2.5 rounded-lg text-white font-semibold transition hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      style={{ backgroundColor: 'var(--color-primary, #E85D8E)' }}
    >
      {loading ? (
        <>
          <span className="animate-spin">⏳</span>
          Agregando...
        </>
      ) : (
        <>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h2l1.3 6.6a1.5 1.5 0 0 0 1.47 1.2h7.8a1.5 1.5 0 0 0 1.45-1.1l.95-3.5a1 1 0 0 0-.96-1.27H6.2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14.5v5" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 17h5" />
          </svg>
          Agregar al carrito
        </>
      )}
    </button>
  )
}
