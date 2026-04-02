# Blueprint HC: Fase 1 (Estructuras Separadas) -> Fase 2 (Constructor)

## 1) Objetivo
Implementar primero una historia clinica configurable por especialidad y por clinica con estructuras separadas, sin romper flujos actuales, dejando base lista para evolucionar a un constructor visual (Fase 2).

## 2) Principio de seguridad (no romper)
Regla de oro: mantener compatibilidad total con la HC actual (payload `datos` JSON existente).

- Lectura: primero intenta nuevo formato versionado; si no existe, cae al formato legacy.
- Escritura: durante transicion, soportar dual-read y single-write controlado por feature flag.
- Impresion: renderizador tolerante a campos faltantes y claves desconocidas.
- Rollback: desactivar feature flag y seguir operando con flujo legacy.

## 3) Estado actual aprovechable
El sistema ya guarda HC y triaje en JSON, lo que reduce riesgo de migracion de esquema:

- `historia_clinica.datos` (JSON)
- `triaje.datos` (JSON)

Esto permite introducir metadata de plantilla y version sin romper registros anteriores.

## 4) Fase 1: Estructuras separadas por especialidad/clinica

### 4.1 Modelo funcional
Crear plantillas declarativas por especialidad con versionado:

- Plantilla base por especialidad (ej: medicina general, ginecologia, pediatria).
- Overrides por clinica (misma especialidad, campos propios).
- Version de plantilla inmutable para trazabilidad medico-legal.

### 4.2 Contrato de datos recomendado (persistido en `datos`)
```json
{
  "schema_version": "2.0",
  "template": {
    "id": "ginecologia",
    "version": "2026.04.01",
    "source": "clinica_override"
  },
  "sections": {
    "anamnesis": {
      "tiempo_enfermedad": "",
      "forma_inicio": "",
      "curso": ""
    },
    "gineco_obstetricos": {
      "fur": "",
      "gestas": "",
      "partos": "",
      "cesareas": ""
    }
  },
  "diagnosticos": [],
  "metadata": {
    "created_by": 0,
    "updated_by": 0,
    "created_at": "",
    "updated_at": ""
  }
}
```

### 4.3 Catalogo minimo de plantillas
Definir 3 plantillas iniciales:

1. `medicina_general`
2. `ginecologia`
3. `pediatria`

Cada plantilla define:
- secciones
- campos
- tipo de control (texto, numero, select, fecha, checklist)
- validaciones
- orden de render

### 4.4 Resolucion de plantilla (runtime)
Algoritmo de seleccion:

1. Si consulta trae `template_id` explicito, usarlo.
2. Si no, resolver por especialidad del medico.
3. Si hay override por clinica, priorizar override.
4. Si falla todo, usar `medicina_general` y mantener compatibilidad legacy.

## 5) Cambios tecnicos Fase 1 (sin romper)

### 5.1 Backend
- Mantener `api_historia_clinica.php` compatible con payload actual.
- Agregar endpoint de solo lectura para plantillas, por ejemplo: `api_hc_templates.php`.
- Agregar validacion server-side por plantilla/version (no bloquear legacy en etapa 1).

### 5.2 Frontend
- Reemplazar formulario fijo por renderer de plantilla en nuevo componente.
- Mantener componente legacy como fallback inmediato.
- Guardar siempre `schema_version` y `template` al crear/editar HC nueva.

### 5.3 Impresion
- `ImpresionHistoriaClinica` debe iterar secciones dinamicas.
- Si registro es legacy, usar mapeo legacy -> secciones estandar.

## 6) Plan de despliegue seguro (blue/green por feature flag)

### 6.1 Feature flags sugeridos
- `HC_TEMPLATE_ENGINE_READ`
- `HC_TEMPLATE_ENGINE_WRITE`
- `HC_TEMPLATE_ENGINE_PRINT`

### 6.2 Orden de activacion
1. Activar `READ` para entorno de prueba con usuarios internos.
2. Activar `WRITE` para una especialidad piloto (ej: ginecologia).
3. Activar `PRINT` para registros nuevos validados.
4. Expandir especialidades gradualmente.

### 6.3 Politica de rollback
- Si hay falla funcional, apagar flags en orden inverso.
- No eliminar rutas legacy hasta completar ventana de estabilizacion.

## 7) Pruebas de no-regresion obligatorias

### 7.1 Flujos criticos
1. Crear consulta -> triaje -> HC -> guardar -> reabrir.
2. Edicion de HC existente legacy y nueva.
3. Impresion HC legacy y versionada.
4. Diagnosticos CIE10 guardan y rehidratan.
5. Receta y modulos anexos no se alteran.

### 7.2 Casos borde
1. Plantilla faltante.
2. Campo nuevo no reconocido por frontend viejo.
3. JSON parcial o corrupto.
4. Usuario sin permisos especiales.

### 7.3 Criterio de aceptacion
- 0 bloqueos en guardado.
- 0 perdida de datos en re-edicion.
- Impresion consistente en legacy y nuevo.
- Tiempo de carga sin degradacion significativa.

## 8) Evolucion directa a Fase 2 (constructor visual)
Fase 1 deja listo:

- contrato versionado
- motor renderer
- validacion por schema
- trazabilidad por plantilla/version

En Fase 2 solo se agrega:

- UI admin para crear/editar plantillas
- versionado publicado/borrador
- sandbox de vista previa
- publicacion controlada por entorno/clinica

## 9) Cronograma sugerido

Semana 1:
- Motor de lectura de plantilla + fallback legacy.
- Endpoint de plantillas.

Semana 2:
- Renderer dinamico para una especialidad piloto.
- Guardado versionado.

Semana 3:
- Impresion dinamica + suite de no-regresion.
- Activacion progresiva por flags.

Semana 4:
- Estabilizacion, metricas y cierre de deuda tecnica.

## 10) Checklist operativo antes de produccion
1. Feature flags configuradas por entorno.
2. Backups verificados.
3. Pruebas E2E de legacy y nuevo en paralelo.
4. Plan de rollback ensayado.
5. Usuarios piloto definidos (medicos y recepcion).

## 11) Decisiones de arquitectura (para aprobar)
1. Persistir todo en `historia_clinica.datos` versionado (sin migracion destructiva).
2. Resolver plantilla por especialidad + override por clinica.
3. Mantener legacy vivo hasta completar estabilizacion.
4. Habilitar constructor visual solo despues de cerrar Fase 1.
