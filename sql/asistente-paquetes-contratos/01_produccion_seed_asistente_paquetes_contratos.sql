-- 01_produccion_seed_asistente_paquetes_contratos.sql
-- Objetivo:
--   Cargar conocimiento del asistente para guiar la creacion de
--   Paquetes/Perfiles y Contratos (plantillas + contratos de paciente).
--
-- Caracteristicas:
--   - Idempotente (se puede ejecutar varias veces)
--   - Compatible con hosting restringido (sin information_schema)
--   - Actualiza respuesta/keywords si la pregunta ya existe

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

DROP TEMPORARY TABLE IF EXISTS tmp_kb_paquetes_contratos;
CREATE TEMPORARY TABLE tmp_kb_paquetes_contratos (
  categoria VARCHAR(100) NOT NULL,
  pregunta VARCHAR(600) NOT NULL,
  respuesta TEXT NOT NULL,
  palabras_clave VARCHAR(600) NOT NULL,
  orden INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tmp_kb_paquetes_contratos (categoria, pregunta, respuesta, palabras_clave, orden) VALUES
('Paquetes y Perfiles', 'Como creo un paquete o perfil nuevo?',
 'Ve a Finanzas > Paquetes y Perfiles > Nuevo. Completa encabezado (codigo, nombre, tipo, estado, descripcion, precio global, modo precio y vigencia). Luego agrega items desde catalogo o manualmente y finaliza con Guardar paquete/perfil.',
 'crear paquete perfil nuevo guardar encabezado items catalogo', 210),

('Paquetes y Perfiles', 'Que diferencia hay entre tipo Paquete y tipo Perfil?',
 'Paquete y Perfil usan el mismo flujo de creacion. En la practica, Paquete suele representar un combo comercial y Perfil un conjunto clinico de examenes/procedimientos. El campo tipo ayuda a clasificar y filtrar en reportes y busquedas.',
 'diferencia paquete perfil tipo clasificacion', 211),

('Paquetes y Perfiles', 'Para que sirven los campos Codigo, Nombre y Estado?',
 'Codigo es un identificador corto interno (ej: PKT-PRENATAL-01). Nombre es el titulo visible para el equipo. Estado controla disponibilidad: activo permite uso en cotizacion, inactivo bloquea uso nuevo, borrador sirve para preparacion y archivado para historico.',
 'codigo nombre estado activo inactivo borrador archivado', 212),

('Paquetes y Perfiles', 'Como usar Precio global y Modo de precio?',
 'Precio global es el monto final de venta del paquete/perfil. En modo fijo_global, ese total manda directamente. En modo calculado_componentes, el sistema considera la suma de subtotales de los items y te permite mantener coherencia con el detalle.',
 'precio global modo precio fijo global calculado componentes subtotal', 213),

('Paquetes y Perfiles', 'Como funciona la vigencia del paquete/perfil?',
 'Vigencia desde define inicio de uso. Vigencia hasta define fecha de cierre. Si activas Vigencia indefinida, se limpia Vigencia hasta y el paquete queda sin vencimiento. Usa esta opcion cuando el paquete no tiene fecha limite comercial.',
 'vigencia desde hasta indefinida vencimiento', 214),

('Paquetes y Perfiles', 'Como agregar items de forma correcta en Paquetes/Perfiles?',
 'Primero elige Tipo de servicio. Luego usa Buscar catalogo para autocompletar descripcion, precio y medico. Si no hay coincidencia, llena manualmente descripcion, cantidad y precio unitario. Verifica siempre el Subtotal del item antes de agregar.',
 'agregar item tipo servicio buscar catalogo descripcion cantidad precio subtotal', 215),

('Paquetes y Perfiles', 'Que significa Medico ID y cuando lo uso?',
 'Medico ID es opcional y sirve para asignar un responsable clinico especifico al item. Si no lo completas, el item puede quedar como general y usar reglas globales de configuracion.',
 'medico id opcional responsable item general', 216),

('Paquetes y Perfiles', 'Como usar Laboratorio tercerizado, referencia y derivacion?',
 'Activa Laboratorio tercerizado cuando el servicio se deriva a un laboratorio externo. En Laboratorio referencia coloca el nombre del proveedor. Tipo derivacion define si el calculo sera por monto fijo o porcentaje, y Valor derivacion guarda ese numero.',
 'laboratorio tercerizado referencia tipo derivacion monto porcentaje valor', 217),

('Paquetes y Perfiles', 'Como configurar honorario medico en un item del paquete?',
 'Regla de honorario medico permite tres modos: usar_configuracion_medico (regla normal), monto_fijo_medico_paquete (fijo por item), y porcentaje_medico_paquete (porcentaje del item). Completa solo el campo que corresponda al modo elegido para evitar conflictos.',
 'honorario medico regla monto fijo porcentaje configuracion medico', 218),

('Contratos', 'Cual es el flujo completo para crear un contrato nuevo?',
 'Paso 1: crea o edita una plantilla (estructura del plan). Paso 2: define sus items y programacion. Paso 3: en Crear/editar contrato de paciente selecciona paciente y plantilla, define fechas, montos y estado. Paso 4: guarda y, si aplica, regenera agenda automatica.',
 'flujo contrato nuevo plantilla items paciente agenda', 220),

('Contratos', 'Que campos son obligatorios en una plantilla de contrato?',
 'Nombre es obligatorio. Se recomienda completar tambien Codigo, Estado y Descripcion para trazabilidad. Pago unico es util cuando el plan maneja un cobro principal. Duracion referencial es orientativa y no reemplaza las fechas reales del contrato paciente.',
 'plantilla contrato campos obligatorios nombre codigo estado descripcion pago unico duracion', 221),

('Contratos', 'Como interpretar Pago unico y Duracion referencial en plantilla?',
 'Pago unico del contrato es una referencia economica base para el plan. Duracion referencial orienta el tiempo esperado (ej: 270 dias), pero la vigencia real siempre se define al crear el contrato del paciente con Fecha inicio y Fecha fin.',
 'pago unico duracion referencial vigencia real contrato paciente', 222),

('Contratos', 'Como agregar items a una plantilla de contrato?',
 'Define servicio_tipo, busca en catalogo, selecciona servicio y completa cantidad incluida y orden programado. El orden ayuda cuando no usas anchor. Si el plan es clinico dinamico, configura offset por anchor para programacion mas precisa.',
 'item plantilla contrato servicio tipo catalogo cantidad orden anchor offset', 223),

('Contratos', 'Que significa Programacion por anchor, offset tipo y offset unidad?',
 'offset_tipo controla como se calcula la fecha del item: ninguno usa orden x 7 dias, relativo_anchor usa cantidad + unidad desde la fecha anchor, y semana_gestacional usa semana clinica (ej: FUR). offset_valor guarda el numero y offset_unidad define dias/semanas/meses.',
 'anchor offset tipo unidad relativo semana gestacional fur programacion', 224),

('Contratos', 'Que campos son obligatorios al crear contrato de paciente?',
 'Paciente ID y Plantilla son obligatorios. Tambien debes definir Fecha inicio y Fecha fin. Sin esos datos no se puede calcular vigencia, agenda ni alertas. El resto de campos complementa control financiero y clinico.',
 'contrato paciente campos obligatorios paciente id plantilla fecha inicio fin', 225),

('Contratos', 'Como usar Monto total, Saldo pendiente y Dias previos para liquidar?',
 'Monto total es el valor contratado. Si no escribes Saldo pendiente, normalmente se inicializa con el mismo monto total. Dias previos para liquidar define cuanta anticipacion usar para alertas de cierre/liquidacion antes del fin del contrato.',
 'monto total saldo pendiente dias previos liquidar alertas', 226),

('Contratos', 'Para que sirven Anchor clinico y Fecha del anchor en contrato paciente?',
 'Anchor clinico define el punto de referencia de cronograma (FUR, fecha de cirugia, FPP o inicio de tratamiento). Fecha del anchor es la fecha exacta de ese hito. Con esto, los items programados por offset se calculan de forma consistente.',
 'anchor clinico fecha anchor fur fpp cirugia inicio tratamiento', 227),

('Contratos', 'Que representa el Estado del contrato y cuando usar Observaciones?',
 'Estado refleja ciclo de vida: pendiente, activo, finalizado, liquidado o cancelado. Observaciones sirve para notas operativas (acuerdos, excepciones, contexto medico-administrativo). Es recomendable registrar decisiones importantes para auditoria.',
 'estado contrato pendiente activo finalizado liquidado cancelado observaciones auditoria', 228),

('Contratos', 'Cuando debo marcar Regenerar agenda automatica al guardar?',
 'Marcala cuando cambias fechas, anchor o programacion de items y necesitas recalcular citas/tareas del contrato. Si no hubo cambios de cronograma, puedes dejarla desmarcada para evitar reprocesos innecesarios.',
 'regenerar agenda automatica guardar recalcular fechas anchor cronograma', 229),

('Contratos', 'Como buscar errores cuando no puedo guardar un contrato?',
 'Valida primero paciente seleccionado, plantilla elegida y rango de fechas correcto. Luego revisa montos numericos y estado. Si hay items con programacion por anchor, confirma anchor_tipo y anchor_fecha. Finalmente verifica permisos de usuario y estado de plantilla.',
 'error guardar contrato validacion paciente plantilla fechas montos anchor permisos', 230);

-- Actualiza preguntas existentes
UPDATE asistente_conocimiento a
JOIN tmp_kb_paquetes_contratos t ON t.pregunta = a.pregunta
SET
  a.categoria = t.categoria,
  a.respuesta = t.respuesta,
  a.palabras_clave = t.palabras_clave,
  a.orden = t.orden,
  a.activo = 1;

-- Inserta preguntas faltantes
INSERT INTO asistente_conocimiento (categoria, pregunta, respuesta, palabras_clave, orden, activo)
SELECT t.categoria, t.pregunta, t.respuesta, t.palabras_clave, t.orden, 1
FROM tmp_kb_paquetes_contratos t
WHERE NOT EXISTS (
  SELECT 1
  FROM asistente_conocimiento a
  WHERE a.pregunta = t.pregunta
);

DROP TEMPORARY TABLE IF EXISTS tmp_kb_paquetes_contratos;

INSERT INTO asistente_sinonimos (palabra_base, sinonimo, categoria, peso_relevancia, activo) VALUES
('paquete', 'combo', 'paquetes', 2, 1),
('paquete', 'plan', 'paquetes', 2, 1),
('perfil', 'panel', 'paquetes', 1, 1),
('perfil', 'perfil de examen', 'paquetes', 2, 1),
('contrato', 'plan paciente', 'contratos', 2, 1),
('contrato', 'convenio', 'contratos', 2, 1),
('plantilla', 'modelo', 'contratos', 2, 1),
('plantilla', 'base contrato', 'contratos', 2, 1),
('vigencia', 'periodo', 'contratos', 2, 1),
('vigencia', 'rango de fechas', 'contratos', 2, 1),
('anchor', 'ancla', 'contratos', 3, 1),
('anchor', 'hito clinico', 'contratos', 2, 1),
('fur', 'fecha ultima regla', 'contratos', 3, 1),
('fpp', 'fecha probable parto', 'contratos', 3, 1),
('offset', 'desfase', 'contratos', 2, 1),
('offset', 'programacion relativa', 'contratos', 2, 1),
('saldo', 'deuda', 'contratos', 2, 1),
('saldo', 'saldo pendiente', 'contratos', 2, 1),
('honorario', 'pago medico', 'paquetes', 2, 1),
('derivacion', 'tercerizado', 'paquetes', 2, 1)
ON DUPLICATE KEY UPDATE
  categoria = VALUES(categoria),
  peso_relevancia = VALUES(peso_relevancia),
  activo = VALUES(activo);

COMMIT;

-- Salida rapida
SELECT 'OK seed asistente paquetes/contratos' AS estado;
