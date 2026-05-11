-- 11_cie10_refuerzo_automatico_es.sql
-- Refuerzo automatico para reducir residuos EN detectados por QC.
-- Sin llenado manual.

SET NAMES utf8mb4;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_cie10_refuerzo_automatico_es $$
CREATE PROCEDURE sp_cie10_refuerzo_automatico_es(IN p_apply TINYINT)
BEGIN
    DECLARE v_before BIGINT DEFAULT 0;
    DECLARE v_after BIGINT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Issues antes
    SELECT COUNT(*) INTO v_before
    FROM cie10
    WHERE activo = 1
      AND (
            nombre_es IS NULL OR CHAR_LENGTH(TRIM(nombre_es)) = 0
         OR categoria_es IS NULL OR CHAR_LENGTH(TRIM(categoria_es)) = 0
         OR subcategoria_es IS NULL OR CHAR_LENGTH(TRIM(subcategoria_es)) = 0
        OR LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|certain|infectious|parasitic|digestive|respiratory|circulatory|nervous|genitourinary|mononeuropathy|polyneuropathy|neuropathy|nerve|root|plexus|gland|glands|history|screening|examination)([^a-z]|$)'
         OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous|gland|glands)([^a-z]|$)'
        OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|disorders|digestive|respiratory|circulatory|nervous|genitourinary|nerve|root|plexus|neuropathy|gland|glands)([^a-z]|$)'
      );

    -- Normalizacion de categoria_es por patrones conocidos
    UPDATE cie10
    SET categoria_es = 'ciertas enfermedades infecciosas y parasitarias',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|infectious|parasitic|diseases)([^a-z]|$)';

    UPDATE cie10
    SET categoria_es = 'enfermedades del sistema digestivo',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(digestive|system|diseases)([^a-z]|$)';

    UPDATE cie10
    SET categoria_es = 'enfermedades del sistema respiratorio',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(respiratory|system|diseases)([^a-z]|$)';

    UPDATE cie10
    SET categoria_es = 'enfermedades del sistema circulatorio',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(circulatory|system|diseases)([^a-z]|$)';

    UPDATE cie10
    SET categoria_es = 'enfermedades del sistema nervioso',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(nervous|system|diseases)([^a-z]|$)';

    UPDATE cie10
    SET categoria_es = 'enfermedades del sistema genitourinario',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(genitourinary|system|diseases)([^a-z]|$)';

    -- Normalizacion de subcategoria_es por patrones frecuentes
    UPDATE cie10
    SET subcategoria_es = 'enfermedades intestinales infecciosas',
        actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(intestinal|infectious|diseases)([^a-z]|$)';

    UPDATE cie10
    SET subcategoria_es = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(
                    REPLACE(
                      REPLACE(LOWER(COALESCE(subcategoria_es, '')),
                        'nerve root and plexus disorders', 'trastornos de nervio raiz y plexo'
                      ),
                      'nerve root and plexus disorder', 'trastorno de nervio raiz y plexo'
                    ),
                    'mononeuropathy', 'mononeuropatia'
                  ),
                  'polyneuropathy', 'polineuropatia'
                ),
                'neuropathy', 'neuropatia'
              ),
              'nerve', 'nervio'
            ),
            'root', 'raiz'
          ),
          'plexus', 'plexo'
        )
      ),
      actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(subcategoria_es, '')) REGEXP 'mononeuropathy|polyneuropathy|neuropathy|nerve|root|plexus';

    -- Normalizacion de nombre_es para residuos EN frecuentes
    UPDATE cie10
    SET nombre_es = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(LOWER(COALESCE(nombre_es, '')),
                    'systemic inflammatory response syndrome', 'sindrome de respuesta inflamatoria sistemica'
                  ),
                  'due to non-infectious process', 'debido a proceso no infeccioso'
                ),
                'due to noninfectious process', 'debido a proceso no infeccioso'
              ),
              'with organ failure', 'con falla organica'
            ),
            'without organ failure', 'sin falla organica'
          ),
          '  ', ' '
        )
      ),
      actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(nombre_es, '')) REGEXP 'systemic inflammatory response syndrome';

    UPDATE cie10
    SET nombre_es = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(LOWER(COALESCE(nombre_es, '')),
                  'special screening examination for', 'examen especial de tamizaje para'
                ),
                'blood-forming organs', 'organos hematopoyeticos'
              ),
              'immune mechanism', 'mecanismo inmune'
            ),
            '  ', ' '
          ),
          '  ', ' '
        )
      ),
      actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(nombre_es, '')) REGEXP 'special screening examination for';

    UPDATE cie10
    SET nombre_es = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(LOWER(COALESCE(nombre_es, '')),
                    'family history of', 'antecedente familiar de'
                  ),
                  'personal history of', 'antecedente personal de'
                ),
                'certain conditions arising in the perinatal period', 'ciertas afecciones originadas en el periodo perinatal'
              ),
              'diseases', 'enfermedades'
            ),
            '  ', ' '
          ),
          '  ', ' '
        )
      ),
      actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(nombre_es, '')) REGEXP 'family history of|personal history of';

    UPDATE cie10
    SET nombre_es = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(LOWER(COALESCE(nombre_es, '')),
                'other endocrine glands', 'otras glandulas endocrinas'
              ),
              'glands', 'glandulas'
            ),
            'gland', 'glandula'
          ),
          'endocrine', 'endocrinas'
        )
      ),
      actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(nombre_es, '')) REGEXP 'endocrine|gland|glands';

    UPDATE cie10
    SET nombre_es = TRIM(
        REPLACE(
          REPLACE(
            REPLACE(LOWER(COALESCE(nombre_es, '')),
              'diabetes insipidus', 'diabetes insipida'
            ),
            'diabetic mononeuropathy', 'mononeuropatia diabetica'
          ),
          'diabetic polyneuropathy', 'polineuropatia diabetica'
        )
      ),
      actualizado_en = CURRENT_TIMESTAMP
    WHERE activo = 1
      AND LOWER(COALESCE(nombre_es, '')) REGEXP 'diabetes insipidus|diabetic mononeuropathy|diabetic polyneuropathy';

    -- Reaprovechar funcion automatica si existe
    IF EXISTS (
        SELECT 1
        FROM information_schema.routines
        WHERE routine_schema = DATABASE()
          AND routine_name = 'fn_cie10_es_auto'
          AND routine_type = 'FUNCTION'
    ) THEN
        UPDATE cie10
        SET
            nombre_es = IF(
                CHAR_LENGTH(fn_cie10_es_auto(IF(nombre_es IS NULL OR CHAR_LENGTH(TRIM(nombre_es)) = 0, nombre, nombre_es))) = 0,
                NULL,
                fn_cie10_es_auto(IF(nombre_es IS NULL OR CHAR_LENGTH(TRIM(nombre_es)) = 0, nombre, nombre_es))
            ),
            categoria_es = IF(
                CHAR_LENGTH(fn_cie10_es_auto(IF(categoria_es IS NULL OR CHAR_LENGTH(TRIM(categoria_es)) = 0, categoria, categoria_es))) = 0,
                NULL,
                fn_cie10_es_auto(IF(categoria_es IS NULL OR CHAR_LENGTH(TRIM(categoria_es)) = 0, categoria, categoria_es))
            ),
            subcategoria_es = IF(
                CHAR_LENGTH(fn_cie10_es_auto(IF(subcategoria_es IS NULL OR CHAR_LENGTH(TRIM(subcategoria_es)) = 0, subcategoria, subcategoria_es))) = 0,
                NULL,
                fn_cie10_es_auto(IF(subcategoria_es IS NULL OR CHAR_LENGTH(TRIM(subcategoria_es)) = 0, subcategoria, subcategoria_es))
            ),
            descripcion_es = IF(
                CHAR_LENGTH(fn_cie10_es_auto(IF(descripcion_es IS NULL OR CHAR_LENGTH(TRIM(descripcion_es)) = 0, descripcion, descripcion_es))) = 0,
                NULL,
                fn_cie10_es_auto(IF(descripcion_es IS NULL OR CHAR_LENGTH(TRIM(descripcion_es)) = 0, descripcion, descripcion_es))
            ),
            actualizado_en = CURRENT_TIMESTAMP
        WHERE activo = 1;
    END IF;

        -- Fallback deterministico para residuo observado en Z96.5
        UPDATE cie10
        SET
            nombre_es = 'presencia de implantes de raiz dental y mandibulares',
            categoria_es = 'factores que influyen en el estado de salud y contacto con los servicios de salud',
            subcategoria_es = 'personas con riesgos potenciales para la salud relacionados con antecedentes familiares y personales y ciertas afecciones que influyen en el estado de salud',
            actualizado_en = CURRENT_TIMESTAMP
        WHERE activo = 1
          AND codigo = 'Z96.5'
          AND (
                LOWER(COALESCE(nombre_es, '')) REGEXP 'presence|tooth-root|mandibular|implants'
             OR LOWER(COALESCE(categoria_es, '')) REGEXP 'factors|influencing|health|status|contact|services'
             OR LOWER(COALESCE(subcategoria_es, '')) REGEXP 'persons|potential|hazards|related|family|personal|history|conditions'
          );

    -- Issues despues
    SELECT COUNT(*) INTO v_after
    FROM cie10
    WHERE activo = 1
      AND (
            nombre_es IS NULL OR CHAR_LENGTH(TRIM(nombre_es)) = 0
         OR categoria_es IS NULL OR CHAR_LENGTH(TRIM(categoria_es)) = 0
         OR subcategoria_es IS NULL OR CHAR_LENGTH(TRIM(subcategoria_es)) = 0
        OR LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|certain|infectious|parasitic|digestive|respiratory|circulatory|nervous|genitourinary|mononeuropathy|polyneuropathy|neuropathy|nerve|root|plexus|gland|glands|history|screening|examination)([^a-z]|$)'
         OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous|gland|glands)([^a-z]|$)'
        OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|disorders|digestive|respiratory|circulatory|nervous|genitourinary|nerve|root|plexus|neuropathy|gland|glands)([^a-z]|$)'
      );

    SELECT v_before AS issues_antes, v_after AS issues_despues;

    IF p_apply = 1 THEN
        COMMIT;
        SELECT 'COMMIT aplicado - refuerzo automatico ES' AS resultado;
    ELSE
        ROLLBACK;
        SELECT 'ROLLBACK aplicado - simulacion del refuerzo automatico' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso:
-- 1) Simular
-- CALL sp_cie10_refuerzo_automatico_es(0);
--
-- 2) Aplicar
-- CALL sp_cie10_refuerzo_automatico_es(1);
