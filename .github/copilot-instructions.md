# Instrucciones operativas para cambios de BD (obligatorio)

Estas reglas aplican a **todas** las tareas del repositorio.

## 1) Transparencia total de BD

Si se toca base de datos de cualquier forma, el asistente **debe** reportarlo siempre:

- cambios de **schema** (CREATE/ALTER/DROP, índices, constraints),
- cambios de **datos/configuración** (UPDATE/INSERT/DELETE),
- cambios en SQL que requieran ajustes en producción.

Nunca omitir este reporte, aunque el cambio sea pequeño.

## 2) Formato de salida obligatorio al cerrar cada tarea

El asistente debe cerrar con estas secciones (siempre en este orden):

1. **Cambios de código**
2. **Cambios de BD obligatorios (Producción)**  
   - incluir SQL exacto listo para ejecutar.
3. **Cambios de BD opcionales**
4. **Checklist post-deploy**

Si **no** hubo cambios de BD, escribir explícitamente:

`Cambios de BD obligatorios (Producción): Ninguno.`

## 3) Regla de despliegue seguro

Si una funcionalidad depende de una bandera/config en BD, el asistente debe:

- advertir que eso **no viaja en el build**,
- entregar SQL para todas las instancias productivas,
- indicar verificación posterior (SELECT de confirmación).

## 4) Migraciones/versionado (estructura obligatoria)

Cuando haya cambio de schema o dato crítico:

- agrupar por **fecha** en carpeta dentro de `sql/`:
  - `sql/YYYY-MM-DD/`
- dentro de esa carpeta crear uno o más scripts con orden numérico:
  - `001_schema.sql`
  - `002_data.sql`
  - `003_verify.sql`
- usar SQL idempotente cuando sea posible.
- si en el mismo día hay varias lógicas, mantenerlas en la misma carpeta de fecha con nombres claros.
- cada carpeta debe poder entenderse por sí sola (qué se aplica ese día y por qué).

Ejemplo:

- `sql/2026-10-05/001_enable_agenda_inteligente_flag.sql`
- `sql/2026-10-05/002_verify_agenda_inteligente_flag.sql`

## 5) Prohibición

Queda prohibido dar por “listo para producción” un cambio que requiera BD sin detallar SQL y pasos de aplicación.
