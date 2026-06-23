# GUÍA DE INTEGRACIÓN - Módulo de Informes de Imagenología

## ✅ Estado Actual

**Fase 1 & 2 completadas - Toda la infraestructura está lista**

- Base de datos: ✅ Tablas creadas y plantillas cargadas
- Endpoints PHP: ✅ 4 endpoints implementados
- Componentes React: ✅ 3 componentes listos
- Vite proxy: ✅ Configurado

---

## 📋 CHECKLIST DE INTEGRACIÓN

### 1. En OrdenesImagenPacientePage.jsx (para médico redactor)
**Propósito**: Permitir que el médico redacte el informe directamente desde la tarjeta del examen

**Ubicación**: Dentro del componente que renderiza cada orden (Card de imagenología)

**Código de integración**:
```jsx
import CardInformeImagenologia from '../../components/imagenologia/CardInformeImagenologia';

// Dentro del componente de renderizado de orden:
<CardInformeImagenologia
  ordenImagenId={orden.id}
  tipoExamen={orden.tipo}  // 'ecografia', 'rayosx', 'tomografia'
  pacienteNombre={`${paciente.apellidos} ${paciente.nombres}`}
  medicoNombre={usuario.nombre}
  onInformeActualizado={() => cargarOrdenes()}  // Callback opcional
/>
```

**Props necesarios**:
- `ordenImagenId` (int): ID de la orden de imagen
- `tipoExamen` (string): Tipo de examen ('ecografia', 'rayosx', 'tomografia')
- `pacienteNombre` (string): Nombre del paciente
- `medicoNombre` (string): Nombre del médico
- `onInformeActualizado` (function): Callback cuando se guarde

---

### 2. En HistoriaClinicaPage.jsx (para lectura desde HC)
**Propósito**: Mostrar el informe ya redactado como lectura en la Historia Clínica

**Ubicación**: En la sección "Laboratorio y Apoyo Diagnóstico"

**Código de integración**:
```jsx
import VisorInformeImagenologiaHC from '../../components/imagenologia/VisorInformeImagenologiaHC';

// Donde se listan los servicios de imagenología:
{serviciosDiagnostico
  .filter(s => s.es_imagenologia)
  .map(servicio => (
    <div key={servicio.id}>
      {/* Card existente de imagen */}
      <div>/* Card de visor de imágenes */</div>
      
      {/* Nuevo: Visor del informe */}
      <VisorInformeImagenologiaHC
        ordenImagenId={servicio.orden_id}
        servicioNombre={servicio.nombre}
        pacienteNombre={paciente.nombre}
      />
    </div>
  ))
}
```

**Props necesarios**:
- `ordenImagenId` (int): ID de la orden de imagen
- `servicioNombre` (string): Nombre del servicio (ej. "Ecografía Abdominal Completa")
- `pacienteNombre` (string): Nombre del paciente

**Características**:
- Se expande/colapsa al clickear
- Muestra estado del informe
- Botón de descarga PDF si está completado
- Si no hay informe, no muestra nada (return null)

---

### 3. En TabsApoyoDiagnostico.jsx (Opcional - acceso rápido)
**Propósito**: Agregar botón "Ver Informe" junto a botones existentes

**Ubicación**: En la sección de botones de cada tipo de imagen

**Código de integración**:
```jsx
// Dentro de PanelImagen, agregamos un nuevo botón:
<button
  onClick={() => {
    // Obtener orden y abrir visor
    const orden = ordenes[0]; // primera orden del tipo
    if (orden?.id) {
      window.open(`/historia-clinica/${consultaId}#informe-${orden.id}`, '_blank');
    }
  }}
  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
>
  <FiFileText size={14} />
  Ver Informe
</button>
```

---

## 🧪 TESTING MANUAL

### Flujo 1: Redactar informe (Médico)
1. Ir a **Ordenes/Imagenes** del paciente
2. Ver card de imagenología → Debe mostrar:
   - Botón "Iniciar Informe" (si no existe)
   - O botón "Editar" + "PDF" (si existe)
3. Click en "Iniciar Informe" → Modal abre
4. Rellenar formulario con plantilla dinámica
5. Click "Guardar Informe" → Debe actualizar estado a "borrador"
6. Click "Generar PDF" → Debe mostrar "completado" + botón descarga

### Flujo 2: Ver en Historia Clínica (Cualquier médico/recepcionista)
1. Ir a Historia Clínica de consulta
2. Buscar sección "Laboratorio y Apoyo Diagnóstico"
3. Ver card de ecografía
4. Debe mostrar expansible con informe completo
5. Click en "Descargar PDF" → Descarga el PDF

### Flujo 3: Validaciones
- ✅ No permite generar PDF si no está completado
- ✅ Muestra badge de estado: Borrador (amarillo) / Completado (verde)
- ✅ PDF contiene: Encabezado clínica + info paciente + informe + imágenes

---

## 🔧 TROUBLESHOOTING

### Problema: "Acceso denegado" al guardar
**Solución**: Verificar que `$_SESSION['usuario']['rol']` sea 'medico' o 'administrador'

### Problema: PDF no genera imágenes
**Solución**: Verificar que archivos existan en `uploads/ordenes_imagen_archivos/`

### Problema: Modal no abre
**Solución**: Verificar console F12 → Network tab → API response

### Problema: "orden_imagen_id no encontrada"
**Solución**: Asegurar que orden se haya creado en cotización primero

---

## 📝 ESTRUCTURA DE DATOS GUARDADO

### Ejemplo de contenido_json guardado:
```json
{
  "hallazgos": {
    "higado": "Tamaño normal, ecoestructura homogénea",
    "vesicula": "Vesícula biliar colapsada, sin lesiones",
    "pancreas": "Normal",
    "riñones": "Ambos riñones de tamaño normal",
    "bazo": "No visibilizado"
  },
  "conclusion": {
    "resumen_final": "Se observa abdomen sin hallazgos significativos. Se recomienda seguimiento"
  }
}
```

---

## 🌐 ENDPOINTS DISPONIBLES

| Endpoint | Método | Propósito |
|----------|--------|----------|
| `/api_imagenologia_plantillas.php` | GET | Obtener plantillas por tipo |
| `/api_imagenologia_informes.php` | GET | Obtener informe |
| `/api_imagenologia_informes.php` | POST | Crear/actualizar informe |
| `/api_imagenologia_generar_pdf.php` | POST | Generar PDF |
| `/descargar_informe_imagenologia.php` | GET | Descargar PDF |

---

## 📦 DEPENDENCIAS

- **Backend**: mPDF (ya instalado en composer.json)
- **Frontend**: React, React Icons, SweetAlert2 (ya en proyecto)
- **Base de datos**: MySQL 8+ (en uso)

---

## 🚀 PRÓXIMOS PASOS

1. ✅ Verificar que BD está actualizada en producción (ejecutar scripts SQL)
2. ✅ Integrar componentes en páginas mencionadas
3. ✅ Prueba E2E completa
4. ✅ Desplegar a rama main después de testing

---

## 📞 REFERENCIAS

- **Rama**: `feature/informe-imagenologia`
- **Scripts SQL**: `sql/imagenologia-informes/`
- **Componentes**: `src/components/imagenologia/`
- **Endpoints**: Raíz del proyecto (`api_imagenologia_*.php`)

---

**Última actualización**: 2026-06-23  
**Estado**: Listo para integración e testing
