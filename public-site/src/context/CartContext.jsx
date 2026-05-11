import React, { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext(null)

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeCartItem(item) {
  const precio = toNumber(item?.precio)
  const precioAntes = item?.precio_antes == null ? null : toNumber(item.precio_antes, null)
  const cantidad = 1
  const subtotal = precio

  return {
    ...item,
    precio,
    precio_antes: precioAntes,
    cantidad,
    subtotal,
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // Cargar carrito desde sessionStorage al montar
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('cartOfertas')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setItems(parsed.map(normalizeCartItem))
        }
      }
    } catch {
      // Ignorar errores de parsing
    } finally {
      setIsHydrated(true)
    }
  }, [])

  // Guardar carrito en sessionStorage cada vez que cambia
  useEffect(() => {
    if (!isHydrated) return
    try {
      sessionStorage.setItem('cartOfertas', JSON.stringify(items))
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [items, isHydrated])

  const addItem = (oferta) => {
    setItems((prevItems) => {
      // Buscar si la oferta ya existe en el carrito
      const existingItem = prevItems.find((item) => item.id === oferta.id)

      if (existingItem) {
        // Evitar duplicados: un servicio solo puede estar una vez
        return prevItems
      }

      // Si no existe, agregar nuevo item
      return [
        ...prevItems,
        {
          id: oferta.id,
          nombre: oferta.titulo,
          precio: toNumber(oferta.precio_oferta),
          precio_antes: oferta.precio_antes == null ? null : toNumber(oferta.precio_antes, null),
          vigencia: oferta.vigencia || '',
          cantidad: 1,
          subtotal: toNumber(oferta.precio_oferta),
          timestamp: Date.now(),
        },
      ]
    })
    // Abrir panel automáticamente al agregar
    setIsOpen(true)
  }

  const removeItem = (itemId) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== itemId))
  }

  const updateQuantity = (itemId, newQuantity) => {
    // Cantidad bloqueada en 1 para servicios médicos
    if (newQuantity <= 0) removeItem(itemId)
  }

  const clearCart = () => {
    setItems([])
  }

  const toggleOpen = () => {
    setIsOpen((prev) => !prev)
  }

  const closeCart = () => {
    setIsOpen(false)
  }

  const openCart = () => {
    setIsOpen(true)
  }

  const getTotalPrice = () => {
    return items.reduce((sum, item) => sum + toNumber(item?.subtotal, toNumber(item?.precio)), 0)
  }

  const getTotalItems = () => {
    return items.length
  }

  const value = {
    items,
    isOpen,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    toggleOpen,
    closeCart,
    openCart,
    getTotalPrice,
    getTotalItems,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart debe usarse dentro de CartProvider')
  }
  return context
}
