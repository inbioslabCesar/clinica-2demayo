-- 03_produccion_seed_asistente_por_rol.sql
-- Objetivo:
--   Cargar conocimiento guiado por rol para que el asistente oriente
--   mejor segun perfil operativo (recepcion, caja, administracion,
--   medico, laboratorio) en flujos de paquetes/perfiles y contratos.
--
-- Caracteristicas:
--   - Idempotente (update + insert por pregunta)
--   - Compatible con hosting restringido (sin information_schema)

START TRANSACTION;

CREATE TABLE IF NOT EXISTS asistente_conocimiento (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoria VARCHAR(100) NOT NULL,
  pregunta VARCHAR(600) NOT NULL,
  respuesta TEXT NOT NULL,
  palabras_clave VARCHAR(600) NOT NULL DEFAULT '',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cat (categoria),
  FULLTEXT KEY ft_busq (pregunta, respuesta, palabras_clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asistente_sinonimos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  palabra_base VARCHAR(100) NOT NULL,
  sinonimo VARCHAR(100) NOT NULL,
  categoria VARCHAR(50) NOT NULL DEFAULT 'general',
  peso_relevancia TINYINT NOT NULL DEFAULT 1,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_par_sinonimo (palabra_base, sinonimo),
  KEY idx_base (palabra_base),
  KEY idx_sinonimo (sinonimo),
  KEY idx_categoria (categoria),
  KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TEMPORARY TABLE IF EXISTS tmp_kb_roles;
CREATE TEMPORARY TABLE tmp_kb_roles (
  categoria VARCHAR(100) NOT NULL,
  pregunta VARCHAR(600) NOT NULL,
  respuesta TEXT NOT NULL,
  palabras_clave VARCHAR(600) NOT NULL,
  orden INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_kb_roles (categoria, pregunta, respuesta, palabras_clave, orden) VALUES
('Roles y Flujos', 'Soy recepcionista: como creo un paquete/perfil sin errores?',
 'Como recepcionista, usa este orden: 1) crear encabezado (nombre, tipo, estado activo, precio global), 2) agregar items desde catalogo para evitar errores manuales, 3) validar subtotal y vigencia, 4) guardar. Si falta un servicio en catalogo, registra descripcion y precio manual solo con validacion del administrador.',
 'recepcionista paquete perfil crear validar catalogo subtotal vigencia', 240),

('Roles y Flujos', 'Soy recepcionista: como creo contrato de paciente paso a paso?',
 'Selecciona paciente correcto (DNI/HC), elige plantilla activa, completa fecha inicio y fecha fin, valida monto total y saldo pendiente, define estado activo y guarda. Marca regenerar agenda solo si cambias fechas, anchor o programacion de items.',
 'recepcionista contrato paciente pasos plantilla fechas monto saldo agenda', 241),

('Roles y Flujos', 'Soy de caja: que debo revisar antes de cobrar un contrato?',
 'En caja revisa: estado del contrato (activo), saldo pendiente mayor a 0, vigencia, y origen del cobro. Al registrar abono, confirma que el movimiento quede con tipo_ingreso contrato_abono para trazabilidad contable y reportes correctos.',
 'caja cobrar contrato saldo pendiente contrato_abono tipo ingreso', 242),

('Roles y Flujos', 'Soy administrador: como audito plantillas y contratos?',
 'Como administrador, revisa plantillas activas/inactivas, consistencia de precios en items, reglas de honorario medico y uso de anchor. En contratos paciente valida rango de fechas, saldo, estado y observaciones. Usa filtros por paciente y plantilla para detectar duplicados o contratos vencidos.',
 'administrador auditar plantilla contrato precios honorario anchor vencidos', 243),

('Roles y Flujos', 'Soy medico: como entiendo los contratos programados por anchor?',
 'Si un contrato usa anchor clinico (FUR, FPP, cirugia o inicio tratamiento), las actividades se programan en funcion de ese hito y no solo por fecha inicio. Revisa agenda generada y coherencia clinica de semanas/offset antes de ejecutar atenciones.',
 'medico contrato anchor fur fpp offset agenda clinica', 244),

('Roles y Flujos', 'Soy laboratorista: como interpretar items tercerizados en paquete?',
 'Cuando un item esta marcado como laboratorio tercerizado, confirma laboratorio_referencia y tipo/valor de derivacion. Esto impacta costos, liquidacion y reporte. Registra resultado con trazabilidad para evitar inconsistencias entre cobro y ejecucion.',
 'laboratorista tercerizado laboratorio referencia derivacion costos liquidacion', 245),

('Roles y Flujos', 'Que checklist rapido usar antes de guardar paquete/perfil?',
 'Checklist: nombre obligatorio, estado correcto, modo de precio coherente, vigencia valida, al menos un item util, subtotales consistentes, y regla de honorario definida cuando aplique medico. Si hay tercerizacion, completar referencia y derivacion.',
 'checklist guardar paquete perfil nombre estado precio vigencia honorario tercerizacion', 246),

('Roles y Flujos', 'Que checklist rapido usar antes de guardar contrato paciente?',
 'Checklist: paciente seleccionado, plantilla activa, fechas validas, monto total definido, saldo pendiente correcto, estado del contrato, dias de anticipacion para liquidacion y observaciones si hay excepciones. Si usa anchor, completar tipo y fecha anchor.',
 'checklist guardar contrato paciente plantilla fechas monto saldo anchor', 247),

('Roles y Flujos', 'Cuando usar estado pendiente, activo, finalizado, liquidado o cancelado en contratos?',
 'Usa pendiente para contratos aun no iniciados o incompletos, activo cuando esta vigente y operativo, finalizado al concluir servicios, liquidado cuando no existe deuda pendiente y cancelado cuando se anula por decision operativa o clinica.',
 'estado contrato pendiente activo finalizado liquidado cancelado', 248),

('Roles y Flujos', 'Como evitar que el usuario se confunda entre plantilla y contrato paciente?',
 'Regla simple: plantilla es modelo reusable, contrato paciente es instancia real con persona y fechas concretas. Primero se construye/ajusta plantilla; despues se crea contrato del paciente usando esa plantilla.',
 'diferencia plantilla contrato paciente modelo instancia', 249);

UPDATE asistente_conocimiento a
JOIN tmp_kb_roles t ON t.pregunta = a.pregunta
SET
  a.categoria = t.categoria,
  a.respuesta = t.respuesta,
  a.palabras_clave = t.palabras_clave,
  a.orden = t.orden,
  a.activo = 1;

INSERT INTO asistente_conocimiento (categoria, pregunta, respuesta, palabras_clave, orden, activo)
SELECT t.categoria, t.pregunta, t.respuesta, t.palabras_clave, t.orden, 1
FROM tmp_kb_roles t
WHERE NOT EXISTS (
  SELECT 1
  FROM asistente_conocimiento a
  WHERE a.pregunta = t.pregunta
);

DROP TEMPORARY TABLE IF EXISTS tmp_kb_roles;

INSERT INTO asistente_sinonimos (palabra_base, sinonimo, categoria, peso_relevancia, activo) VALUES
('recepcionista', 'recepcion', 'roles', 3, 1),
('recepcionista', 'admision', 'roles', 2, 1),
('caja', 'cajero', 'roles', 2, 1),
('administrador', 'admin', 'roles', 3, 1),
('medico', 'doctor', 'roles', 2, 1),
('laboratorista', 'lab', 'roles', 2, 1),
('plantilla', 'modelo reusable', 'roles', 2, 1),
('contrato paciente', 'instancia contrato', 'roles', 2, 1),
('checklist', 'lista de verificacion', 'roles', 2, 1),
('liquidado', 'sin deuda', 'roles', 2, 1),
('cancelado', 'anulado', 'roles', 2, 1)
ON DUPLICATE KEY UPDATE
  categoria = VALUES(categoria),
  peso_relevancia = VALUES(peso_relevancia),
  activo = VALUES(activo);

COMMIT;

SELECT 'OK seed asistente por rol' AS estado;
