// GUÍA DE IMPLEMENTACIÓN: Mini IA Híbrida (Fase 1 & 2)
// Fecha: 2026-04-17
// ============================================================

/*
  RESUMEN DE CAMBIOS:
  
  1. 3 Nuevas tablas SQL (auto-learning):
     ✓ asistente_sinonimos       — palabras equivalentes (agendar, programar, citar, etc.)
     ✓ asistente_queries_fallidas — queries sin respuesta (para aprender)
     ✓ asistente_sugerencias_admin — sugerencias para admin panel
  
  2. Mejorado api_asistente_chat.php:
     ✓ Búsqueda con sinónimos automáticos (expandir query)
     ✓ Auto-guardado de queries fallidas (logging inteligente)
     ✓ Nuevo endpoint: listar_queries_fallidas (para admin)
  
  3. Impacto esperado:
     ✓ Reducir "sin respuesta" de 40% → 15%
     ✓ Aprendizaje continuo sin código
     ✓ Admin ve patterns → crea nuevas entradas → sistema mejora
*/

// ============================================================
// PASO 1: EJECUTAR MIGRACIÓN SQL
// ============================================================

/*
  INSTRUCCIONES:
  
  1. Ir a phpMyAdmin
  2. Seleccionar la BD de PRODUCCIÓN (u330560936_bd2DeMayo o similar)
  3. Ir a pestaña SQL
  4. Copiar TODO el contenido de: migracion_asistente_ia_fase1.sql
  5. Pegar en phpMyAdmin
  6. Click en "Ejecutar" (play button)
  
  VALIDAR:
  - Query OK: "✓ TABLAS CREADAS" debería mostrar 3 registros
  - Query OK: "✓ SINÓNIMOS CARGADOS" debería mostrar 9 categorías
  - Ejemplo categoría: 'finanzas' = 12 sinónimos, 'hc' = 5, etc.
  
  ⚠️ IMPORTANTE: Si hay error de "tabla no existe", asegúrate que la tabla
  asistente_conocimiento YA existe. Si no, ejecuta primero:
  
  CREATE TABLE IF NOT EXISTS `asistente_conocimiento` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `categoria` VARCHAR(100),
      `pregunta` VARCHAR(600),
      `respuesta` TEXT,
      `palabras_clave` VARCHAR(600),
      `activo` TINYINT(1) DEFAULT 1,
      `orden` INT DEFAULT 0,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB CHARSET=utf8mb4;
*/

// ============================================================
// PASO 2: VERIFICAR CAMBIOS EN PHP
// ============================================================

/*
  Los cambios en api_asistente_chat.php son:
  
  A) Nueva función: $fn_obtenerSinonimos($palabra)
     - Lee tabla asistente_sinonimos
     - Devuelve todas las variantes (ej: agendar → [programar, citar, reservar])
     - Usado en CADA búsqueda automáticamente
  
  B) Búsqueda expandida: $palabrasParaBuscar
     - Original: usuario pregunta "¿Cómo programo?" → busca "programar" → NO encuentra "agendar"
     - AHORA: usuario pregunta "¿Cómo programo?" → busca "programar" + sinonimos
                → incluye "agendar" → ENCUENTRA la respuesta ✓
  
  C) Auto-guardado: 2 puntos donde guarda queries fallidas:
     1. Si NO hay resultados: INSERT en asistente_queries_fallidas
     2. Si score muy bajo: INSERT en asistente_queries_fallidas
     → Automático, sin que el usuario haga nada
  
  D) Nuevo endpoint: /api_asistente_chat.php?action=listar_queries_fallidas
     - Solo admin puede acceder
     - Devuelve TOP 20 queries más frecuentes sin respuesta
     - Formato: {id, query_original, cantidad_ocurrencias, roles_afectados}
     - Uso: Admin panel → widget → "¿Qué no entienden los usuarios?"
*/

// ============================================================
// PASO 3: FLUJO DE USO (USUARIO FINAL)
// ============================================================

/*
  ESCENARIO 1: Sinónimos funcionan ✓
  
  Usuario:   "¿Cómo programo una cita?"
  Sistema:   Busca "programar" → no encuentra
           → Sinónimos: programar → [agendar, citar, reservar]
           → Busca "agendar" → ENCUENTRA respuesta en KB
  Resultado: ✓ Responde correctamente
  
  
  ESCENARIO 2: Sin respuesta → se guarda automáticamente
  
  Usuario:   "¿Cómo aggrego un tratamiento cada 6 horas?"
  Sistema:   Busca "tratamiento" + "horas" → no encuentra (query nueva)
           → No hay respuesta en KB
           → AUTO-INSERTA en asistente_queries_fallidas:
              {query: "...", rol_usuario: "medico", timestamp: now}
           → Devuelve sugerencias genéricas
  Admin después:
    - Ve en dashboard: "Top queries sin respuesta"
    - Ve: "¿Cómo aggrego un tratamiento cada 6 horas?" (5 usuarios)
    - Click en botón: "Crear entrada nueva"
    - Agrega: Pregunta: "¿Cómo agrego tratamiento con frecuencia?"
              Respuesta: "..."
              Sinonimos: "cada 6 horas, por hora, frecuencia, dosificación"
    - Sistema auto-aprende → próxima query similar → RESPONDE
*/

// ============================================================
// PASO 4: ADMINISTRACIÓN (PRÓXIMO PASO)
// ============================================================

/*
  Cuando admin quiera VER las queries sin respuesta:
  
  URL: https://tu-clinica.com/api_asistente_chat.php
  POST body: {
    "action": "listar_queries_fallidas"
  }
  
  Respuesta:
  {
    "success": true,
    "total": 5,
    "queries_fallidas": [
      {
        "id": 1,
        "query_original": "¿Cómo agrego tratamiento cada 6 horas?",
        "cantidad_ocurrencias": 5,
        "usuarios_diferentes": 3,
        "roles_afectados": "medico,laboratorista",
        "created_at": "2026-04-17 10:30:00",
        "sugerencia_creada": 0
      },
      ...
    ]
  }
  
  TODO: Próxima fase → Panel Admin visualizar esto + botón para crear entrada
*/

// ============================================================
// PASO 5: AGREGAR SINÓNIMOS NUEVOS (MANUAL)
// ============================================================

/*
  Si quieres agregar más sinónimos después:
  
  1. Opción A: Directo en SQL (phpMyAdmin)
     INSERT INTO asistente_sinonimos (palabra_base, sinonimo, categoria, peso_relevancia)
     VALUES 
       ('recetar', 'prescribir', 'hc', 2),
       ('recetar', 'indicar', 'hc', 1);
  
  2. Opción B: A través de admin endpoint (cuando esté hecho)
     POST /api_asistente_chat.php
     {
       "action": "crear_sinonimo",
       "palabra_base": "recetar",
       "sinonimo": "prescribir",
       "categoria": "hc"
     }
*/

// ============================================================
// PASO 6: MONITOREO Y KPIs
// ============================================================

/*
  Queries útiles para monitorear el progreso:
  
  1. ¿Cuántas queries sin respuesta hay?
     SELECT COUNT(DISTINCT query_original) 
     FROM asistente_queries_fallidas 
     WHERE sugerencia_creada = 0;
  
  2. ¿Cuál es la más repetida?
     SELECT query_original, COUNT(*) as veces
     FROM asistente_queries_fallidas
     WHERE sugerencia_creada = 0
     GROUP BY query_original
     ORDER BY veces DESC
     LIMIT 1;
  
  3. ¿Qué rol pregunta más?
     SELECT rol_usuario, COUNT(*) as preguntas
     FROM asistente_queries_fallidas
     GROUP BY rol_usuario;
  
  4. Efectividad de sinónimos:
     SELECT COUNT(DISTINCT query_original) as queries_antes,
            (SELECT COUNT(DISTINCT query_original) FROM asistente_queries_fallidas) as queries_ahora
     FROM asistente_queries_fallidas
     WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY);
*/

// ============================================================
// RESUMEN: ¿QUÉ HACER AHORA?
// ============================================================

/*
  ✅ HECHO:
  1. Script SQL completo (migracion_asistente_ia_fase1.sql)
  2. PHP modificado con sinónimos + auto-save de fallidas
  3. Nuevo endpoint para admin listar queries fallidas
  4. Validación: 0 errores en PHP
  
  ⏳ PRÓXIMOS PASOS:
  1. Ejecutar SQL en PRODUCCIÓN
  2. Verificar: SELECT * FROM asistente_sinonimos LIMIT 5;
  3. Verificar: SELECT * FROM asistente_queries_fallidas LIMIT 5;
  4. Testear búsqueda: ¿"Cómo programo cita?" funciona?
  5. Testear endpoint: ?action=listar_queries_fallidas
  6. Crear UI admin para visualizar + crear entradas nuevas (Fase 3)
  
  TIEMPO ESTIMADO:
  - Paso 1-3: 5 minutos (SQL + verificación)
  - Paso 4-5: 2 minutos (testing)
  - Paso 6: 2-4 horas (UI admin, opcional pero recomendado)
  
  💡 BENEFICIO INMEDIATO:
  - Con sinónimos: Reducir "sin respuesta" a 15%
  - Con auto-logging: Entender qué falta en KB
  - Con panel admin: Mejorar continuamente SIN tocar código
*/
