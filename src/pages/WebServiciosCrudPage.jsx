import { useCallback, useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { BASE_URL } from '../config/config'
import Modal from '../components/comunes/Modal.jsx'

const emptyForm = { titulo: '', descripcion: '', precio: '', icono: '', orden: 0, activo: true }

export default function WebServiciosCrudPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [imagenFile, setImagenFile] = useState(null)

  const endpoint = useMemo(() => `${BASE_URL}api_web_servicios.php`, [])
  const uploadEndpoint = useMemo(() => `${BASE_URL}api_web_servicios_upload.php`, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(endpoint, { credentials: 'include' })
      const data = await r.json()
      if (!data?.success) throw new Error(data?.error || 'No se pudo cargar')
      setItems(data.servicios || [])
    } catch (e) {
      Swal.fire('Error', e?.message || 'Error al cargar servicios', 'error')
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    load()
  }, [load])

  function openNew() {
    setEditingId(null)
    setForm(emptyForm)
    setImagenFile(null)
    setOpen(true)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      titulo: item.titulo || '',
      descripcion: item.descripcion || '',
      precio: item.precio ?? '',
      icono: item.icono || '',
      imagen_url: item.imagen_url || '',
      orden: item.orden ?? 0,
      activo: item.activo ? true : false,
    })
    setImagenFile(null)
    setOpen(true)
  }

  async function uploadImagenIfNeeded() {
    if (!imagenFile) return null

    const name = (imagenFile.name || '').toLowerCase()
    if (!(name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'))) {
      throw new Error('La imagen debe ser PNG o JPG')
    }

    const fd = new FormData()
    fd.append('imagen', imagenFile)

    const r = await fetch(uploadEndpoint, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    const data = await r.json().catch(() => null)
    if (!r.ok || !data?.success) {
      throw new Error(data?.error || 'No se pudo subir la imagen')
    }
    return data.url
  }

  async function save(e) {
    e.preventDefault()
    try {
      const uploadedUrl = await uploadImagenIfNeeded()
      const payload = {
        ...form,
        precio: form.precio === '' ? null : Number(form.precio),
        orden: Number(form.orden || 0),
        activo: !!form.activo,
      }
      if (uploadedUrl) payload.imagen_url = uploadedUrl
      const method = editingId ? 'PUT' : 'POST'
      if (editingId) payload.id = editingId

      const r = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      })
      const data = await r.json()
      if (!data?.success) throw new Error(data?.error || 'No se pudo guardar')

      setOpen(false)
      setImagenFile(null)
      await load()
      Swal.fire('Listo', 'Guardado correctamente', 'success')
    } catch (e2) {
      Swal.fire('Error', e2?.message || 'Error al guardar', 'error')
    }
  }

  async function remove(id) {
    const confirm = await Swal.fire({
      title: '¿Desactivar servicio?',
      text: 'El servicio dejará de mostrarse en la web pública',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar',
    })
    if (!confirm.isConfirmed) return

    try {
      const r = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        credentials: 'include',
      })
      const data = await r.json()
      if (!data?.success) throw new Error(data?.error || 'No se pudo desactivar')
      await load()
    } catch (e) {
      Swal.fire('Error', e?.message || 'Error al desactivar', 'error')
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-blue-800">Servicios Web</h1>
        <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          + Nuevo
        </button>
      </div>

      {loading ? (
        <div className="text-gray-600">Cargando…</div>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Título</th>
                <th className="p-2 text-left">Precio</th>
                <th className="p-2 text-left">Orden</th>
                <th className="p-2 text-left">Activo</th>
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="p-2">{it.titulo}</td>
                  <td className="p-2">{it.precio ?? ''}</td>
                  <td className="p-2">{it.orden ?? 0}</td>
                  <td className="p-2">{it.activo ? 'Sí' : 'No'}</td>
                  <td className="p-2 flex gap-2">
                    <button className="px-3 py-1 rounded bg-yellow-500 text-white" onClick={() => openEdit(it)}>
                      Editar
                    </button>
                    <button className="px-3 py-1 rounded bg-red-600 text-white" onClick={() => remove(it.id)}>
                      Desactivar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="p-4 text-gray-600" colSpan={5}>
                    No hay servicios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="text-xl font-bold mb-4">{editingId ? 'Editar' : 'Nuevo'} servicio</h2>
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold">Título</label>
            <input className="w-full border rounded px-3 py-2" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-semibold">Precio (opcional)</label>
            <input className="w-full border rounded px-3 py-2" type="number" step="0.01" value={form.precio} onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold">Descripción</label>
            <textarea className="w-full border rounded px-3 py-2" rows={3} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold">Icono (clave, opcional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.icono}
              onChange={(e) => setForm((f) => ({ ...f, icono: e.target.value }))}
              placeholder="Ej: consultas, laboratorio, rayosx, ecografias, operaciones, hospitalizacion"
            />
            <p className="text-xs text-gray-600 mt-1">Usa una clave para que la web muestre el icono en la tarjeta.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold">Imagen URL (opcional)</label>
            <input className="w-full border rounded px-3 py-2" value={form.imagen_url || ''} onChange={(e) => setForm((f) => ({ ...f, imagen_url: e.target.value }))} />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold">Subir imagen (PNG o JPG)</label>
            <input
              className="w-full"
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              onChange={(e) => setImagenFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-gray-600 mt-1">
              Si seleccionas una imagen, se subirá y reemplazará la URL.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold">Orden</label>
            <input className="w-full border rounded px-3 py-2" type="number" value={form.orden} onChange={(e) => setForm((f) => ({ ...f, orden: e.target.value }))} />
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            <input type="checkbox" checked={!!form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
            <span className="text-sm">Activo</span>
          </div>
          <div className="md:col-span-2 flex gap-3">
            <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" type="submit">
              Guardar
            </button>
            <button className="border px-4 py-2 rounded" type="button" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
