# Scripts SQL: Módulo de Informes de Imagenología

## Descripción
Conjunto de scripts SQL idempotentes para crear la infraestructura de almacenamiento de informes clínicos de imagenología con trazabilidad completa.

## Archivos

### 01_crear_tablas_imagenologia_informes.sql
- **Propósito**: Crear tablas principales para el módulo
- **Tablas**: 
  - `imagenologia_plantillas`: Almacena plantillas estándar por tipo de examen
  - `imagenologia_informes`: Almacena los informes redactados
  - `imagenologia_informes_historial`: Auditoría de cambios
- **Idempotente**: Sí (usa `CREATE TABLE IF NOT EXISTS`)
- **Dependencias**: Base de datos debe existir

### 02_seed_plantillas_imagenologia.sql
- **Propósito**: Cargar plantillas iniciales estándar
- **Plantillas cargadas**:
  - Ecografía General (ecografia)
  - Ecografía Obstétrica (ecografia)
  - Rayos X de Tórax (rayosx)
  - Tomografía General (tomografia)
- **Idempotente**: Sí (limpia e inserta)
- **Nota**: Limpiar antes de insertar para evitar duplicados

## Orden de Ejecución

En **DESARROLLO**:
```bash
# 1. Crear tablas
mysql -u root -p nombredb < 01_crear_tablas_imagenologia_informes.sql

# 2. Cargar plantillas iniciales
mysql -u root -p nombredb < 02_seed_plantillas_imagenologia.sql
```

En **PRODUCCIÓN** (ejecutar manualmente vía phpMyAdmin o consola):
1. Ejecutar `01_crear_tablas_imagenologia_informes.sql` primero
2. Ejecutar `02_seed_plantillas_imagenologia.sql` segundo

## Estructura de Datos

### Tabla: imagenologia_plantillas
```
- id: Identificador único
- nombre: Nombre de la plantilla (ej. "Ecografía Obstétrica")
- tipo_examen: 'ecografia', 'rayosx', 'tomografia'
- descripcion: Texto descriptivo
- estructura_json: JSON con secciones y campos dinámicos
- es_activa: TINYINT(1) para filtrar plantillas activas
- created_at, updated_at: Timestamps
```

### Tabla: imagenologia_informes
```
- id: Identificador único
- orden_imagen_id: FK hacia ordenes_imagen (UNIQUE)
- cotizacion_id: Desnormalización para acceso rápido
- paciente_id: FK hacia pacientes
- consulta_id: FK hacia consultas
- historia_clinica_id: FK hacia historia_clinica
- medico_id: Médico que redactó
- titulo: Título del informe
- contenido_json: JSON con contenido (hallazgos, conclusión, etc.)
- plantilla_json: Snapshot de plantilla usada
- estado: 'borrador', 'completado', 'archivado'
- pdf_path: Ruta del PDF generado
- created_at, updated_at: Timestamps
```

### Tabla: imagenologia_informes_historial
```
- id: Identificador único
- informe_id: FK hacia imagenologia_informes
- version: Número de versión
- contenido_anterior: JSON del estado anterior
- contenido_nuevo: JSON del estado nuevo
- cambios_resumen: Descripción del cambio
- usuario_id: Quién hizo el cambio
- usuario_nombre: Nombre del usuario
- tipo_cambio: Tipo de operación realizada
- created_at: Timestamp
```

## Estructura JSON de Plantilla

```json
{
  "sections": [
    {
      "id": "hallazgos",
      "nombre": "Hallazgos",
      "campos": [
        {
          "id": "higado",
          "label": "Hígado",
          "type": "textarea",
          "placeholder": "Descripción...",
          "required": false
        }
      ]
    }
  ]
}
```

## Notas de Desarrollo

- Todos los scripts son **idempotentes** y seguros para ejecutar múltiples veces
- Los campos JSON permiten flexibilidad para agregar nuevas plantillas sin migración
- Índices creados para optimizar consultas de acceso frecuente
- Charset: utf8mb4 para soporte completo de caracteres especiales
- Colación: utf8mb4_unicode_ci para búsquedas case-insensitive correctas

## Próximos Pasos

1. Ejecutar estos scripts en desarrollo
2. Implementar endpoints PHP en `api_imagenologia_informes.php`
3. Implementar componentes React para edición y visualización
4. Integrar con Historia Clínica

---

**Rama Git**: `feature/informe-imagenologia`  
**Autor**: Sistema Clínico 2 de Mayo  
**Fecha**: 2026-06-23
