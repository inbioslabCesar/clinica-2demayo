import { useCallback, useEffect, useMemo, useState } from 'react'
import Swal from 'sweetalert2'
import { BASE_URL } from '../config/config'
import Modal from '../components/comunes/Modal.jsx'

const emptyForm = {
  titulo: '',
  subtitulo: '',
  imagen_url: '',
  imagen_fija_url: '',
  overlay_blanco: true,
  texto_lado: 'left',
  titulo_color: '',
  subtitulo_color: '',
  titulo_tamano: 'lg',
  subtitulo_tamano: 'md',
  orden: 0,
  activo: true,
}

export default function WebBannersCrudPage() {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [imagenFiles, setImagenFiles] = useState([])
  const [imagenFijaFile, setImagenFijaFile] = useState(null)

  const endpoint = useMemo(() => `${BASE_URL}api_web_banners.php`, [])
  const uploadEndpoint = useMemo(() => `${BASE_URL}api_web_banners_upload.php`, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(endpoint, { credentials: 'include' })
      const data = await r.json()
      if (!data?.success) throw new Error(data?.error || 'No se pudo cargar')
      setItems(data.banners || [])
    } catch (e) {
      Swal.fire('Error', e?.message || 'Error al cargar banners', 'error')
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
    setImagenFiles([])
    setImagenFijaFile(null)
    setOpen(true)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      titulo: item.titulo || '',
      subtitulo: item.subtitulo || '',
      imagen_url: item.imagen_url || '',
      imagen_fija_url: item.imagen_fija_url || '',
      overlay_blanco: item.overlay_blanco === 0 ? false : true,
      texto_lado: item.texto_lado === 'right' ? 'right' : 'left',
      titulo_color: item.titulo_color || '',
      subtitulo_color: item.subtitulo_color || '',
      titulo_tamano: item.titulo_tamano || 'lg',
      subtitulo_tamano: item.subtitulo_tamano || 'md',
      orden: item.orden ?? 0,
      activo: item.activo ? true : false,
    })
    setImagenFiles([])
    setImagenFijaFile(null)
    setOpen(true)
  }

  async function uploadImagenesIfNeeded() {
    if (!imagenFiles || imagenFiles.length === 0) return []

    for (const file of imagenFiles) {
      const name = (file?.name || '').toLowerCase()
      if (!(name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'))) {
        throw new Error('La imagen debe ser PNG o JPG')
      }
    }

    const fd = new FormData()
    if (imagenFiles.length === 1) {
      fd.append('imagen', imagenFiles[0])
    } else {
      for (const file of imagenFiles) fd.append('imagen[]', file)
    }

    const r = await fetch(uploadEndpoint, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    const data = await r.json().catch(() => null)
    if (!r.ok || !data?.success) {
      throw new Error(data?.error || 'No se pudo subir la imagen')
    }
    const urls = Array.isArray(data?.urls) ? data.urls : data?.url ? [data.url] : []
    return urls
  }

  async function uploadImagenFijaIfNeeded() {
    if (!imagenFijaFile) return ''

    const name = (imagenFijaFile?.name || '').toLowerCase()
    if (!(name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg'))) {
      throw new Error('La imagen fija debe ser PNG o JPG')
    }

    const fd = new FormData()
    fd.append('imagen', imagenFijaFile)

    const r = await fetch(uploadEndpoint, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    })
    const data = await r.json().catch(() => null)
    if (!r.ok || !data?.success) {
      throw new Error(data?.error || 'No se pudo subir la imagen fija')
    }
    return data?.url || ''
  }

  async function save(e) {
    e.preventDefault()
    try {
      const uploadedUrls = await uploadImagenesIfNeeded()
      const uploadedFijaUrl = await uploadImagenFijaIfNeeded()

      const basePayload = {
        ...form,
        orden: Number(form.orden || 0),
        activo: !!form.activo,
        overlay_blanco: form.overlay_blanco === false ? false : true,
        texto_lado: form.texto_lado === 'right' ? 'right' : 'left',
        titulo_color: (form.titulo_color || '').trim() || null,
        subtitulo_color: (form.subtitulo_color || '').trim() || null,
        titulo_tamano: (form.titulo_tamano || 'lg').trim() || 'lg',
        subtitulo_tamano: (form.subtitulo_tamano || 'md').trim() || 'md',
      }

      // Edición: 1 banner
      if (editingId) {
        const payload = { ...basePayload, id: editingId }
        if (uploadedUrls[0]) payload.imagen_url = uploadedUrls[0]
        if (uploadedFijaUrl) payload.imagen_fija_url = uploadedFijaUrl
        if (!payload.imagen_url) throw new Error('La imagen es requerida')

        const r = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        })
        const data = await r.json()
        if (!data?.success) throw new Error(data?.error || 'No se pudo guardar')
      } else {
        // Creación: si se seleccionan varias imágenes, crea varios banners
        const urlsToUse = uploadedUrls.length > 0 ? uploadedUrls : basePayload.imagen_url ? [basePayload.imagen_url] : []
        if (urlsToUse.length === 0) throw new Error('La imagen es requerida')

        for (let i = 0; i < urlsToUse.length; i++) {
          const fileName = imagenFiles?.[i]?.name || ''
          const suggestedTitle = fileName.replace(/\.[^.]+$/, '')

          const payload = {
            ...basePayload,
            imagen_url: urlsToUse[i],
            imagen_fija_url: uploadedFijaUrl ? uploadedFijaUrl : basePayload.imagen_fija_url,
            orden: basePayload.orden + i,
            titulo: (basePayload.titulo || '').trim() ? basePayload.titulo : suggestedTitle,
          }

          const r = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include',
          })
          const data = await r.json().catch(() => null)
          if (!data?.success) throw new Error(data?.error || 'No se pudo guardar')
        }
      }

      setOpen(false)
      setImagenFiles([])
      setImagenFijaFile(null)
      await load()
      Swal.fire('Listo', editingId ? 'Guardado correctamente' : 'Banners creados correctamente', 'success')
    } catch (e2) {
      Swal.fire('Error', e2?.message || 'Error al guardar', 'error')
    }
  }

  async function remove(id) {
    const confirm = await Swal.fire({
      title: '¿Desactivar banner?',
      text: 'El banner dejará de mostrarse en la web pública',
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
        <h1 className="text-2xl font-bold text-blue-800">Banners Web</h1>
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
                <th className="p-2 text-left">Orden</th>
                <th className="p-2 text-left">Activo</th>
                <th className="p-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="p-2">
                    <div className="font-semibold">{it.titulo || '(sin título)'}</div>
                    {it.subtitulo ? <div className="text-xs text-gray-600">{it.subtitulo}</div> : null}
                    {it.imagen_url ? (
                      <a className="text-xs text-blue-700 hover:underline" href={it.imagen_url} target="_blank" rel="noreferrer">
                        Ver imagen (carrusel)
                      </a>
                    ) : null}
                    {it.imagen_fija_url ? (
                      <div>
                        <a className="text-xs text-blue-700 hover:underline" href={it.imagen_fija_url} target="_blank" rel="noreferrer">
                          Ver imagen (fija)
                        </a>
                      </div>
                    ) : null}
                  </td>
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
                  <td className="p-4 text-gray-600" colSpan={4}>
                    No hay banners.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)}>
        <h2 className="text-xl font-bold mb-4">{editingId ? 'Editar' : 'Nuevo'} banner</h2>
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold">Título</label>
            <input className="w-full border rounded px-3 py-2" value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold">Subtítulo</label>
            <input className="w-full border rounded px-3 py-2" value={form.subtitulo} onChange={(e) => setForm((f) => ({ ...f, subtitulo: e.target.value }))} />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold">Imagen URL</label>
            <input className="w-full border rounded px-3 py-2" value={form.imagen_url} onChange={(e) => setForm((f) => ({ ...f, imagen_url: e.target.value }))} placeholder="Se llenará automáticamente al subir" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold">Imagen fija URL (opcional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={form.imagen_fija_url}
              onChange={(e) => setForm((f) => ({ ...f, imagen_fija_url: e.target.value }))}
              placeholder="Se llenará automáticamente al subir"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold">Subir imagen (PNG o JPG)</label>
            <input
              className="w-full"
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              multiple={!editingId}
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (editingId) setImagenFiles(files.slice(0, 1))
                else setImagenFiles(files)
              }}
            />
            <p className="text-xs text-gray-600 mt-1">
              {editingId
                ? 'Si seleccionas una imagen, se subirá y reemplazará la URL.'
                : 'Puedes seleccionar varias imágenes: se crearán varios banners automáticamente.'}
            </p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold">Subir imagen fija (opcional)</label>
            <input
              className="w-full"
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              onChange={(e) => {
                const file = (e.target.files && e.target.files[0]) || null
                setImagenFijaFile(file)
              }}
            />
            <p className="text-xs text-gray-600 mt-1">Esta imagen se usará en la sección fija de la Home.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold">Orden</label>
            <input className="w-full border rounded px-3 py-2" type="number" value={form.orden} onChange={(e) => setForm((f) => ({ ...f, orden: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold">Texto (lado)</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.texto_lado || 'left'}
              onChange={(e) => setForm((f) => ({ ...f, texto_lado: e.target.value }))}
            >
              <option value="left">Izquierda</option>
              <option value="right">Derecha</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold">Título (color)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.titulo_color || '#0f172a'}
                onChange={(e) => setForm((f) => ({ ...f, titulo_color: e.target.value }))}
              />
              <input
                className="flex-1 border rounded px-3 py-2"
                value={form.titulo_color}
                onChange={(e) => setForm((f) => ({ ...f, titulo_color: e.target.value }))}
                placeholder="#0f172a"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold">Subtítulo (color)</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.subtitulo_color || '#334155'}
                onChange={(e) => setForm((f) => ({ ...f, subtitulo_color: e.target.value }))}
              />
              <input
                className="flex-1 border rounded px-3 py-2"
                value={form.subtitulo_color}
                onChange={(e) => setForm((f) => ({ ...f, subtitulo_color: e.target.value }))}
                placeholder="#334155"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold">Título (tamaño)</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.titulo_tamano || 'lg'}
              onChange={(e) => setForm((f) => ({ ...f, titulo_tamano: e.target.value }))}
            >
              <option value="sm">Pequeño</option>
              <option value="md">Mediano</option>
              <option value="lg">Grande</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold">Subtítulo (tamaño)</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.subtitulo_tamano || 'md'}
              onChange={(e) => setForm((f) => ({ ...f, subtitulo_tamano: e.target.value }))}
            >
              <option value="sm">Pequeño</option>
              <option value="md">Mediano</option>
              <option value="lg">Grande</option>
            </select>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.overlay_blanco !== false}
              onChange={(e) => setForm((f) => ({ ...f, overlay_blanco: e.target.checked }))}
            />
            <span className="text-sm">Mostrar degradado blanco (carrusel)</span>
          </div>
          <div className="flex items-center gap-2 mt-6">
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
