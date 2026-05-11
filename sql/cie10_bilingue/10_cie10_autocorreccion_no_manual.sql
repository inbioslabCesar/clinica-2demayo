-- 10_cie10_autocorreccion_no_manual.sql
-- Objetivo:
--   Corregir CIE10 ES de forma automatica (sin llenado manual),
--   eliminando tokens en ingles y completando vacios desde columnas EN.
--
-- Modo:
--   p_apply = 0 -> ROLLBACK (simulacion)
--   p_apply = 1 -> COMMIT   (aplica cambios)

SET NAMES utf8mb4;

DELIMITER $$

DROP FUNCTION IF EXISTS fn_cie10_es_auto $$
CREATE FUNCTION fn_cie10_es_auto(p_text TEXT)
RETURNS TEXT
DETERMINISTIC
BEGIN
    DECLARE t TEXT;

    SET t = LOWER(TRIM(IFNULL(p_text, '')));
    IF CHAR_LENGTH(t) = 0 THEN
        RETURN '';
    END IF;

    -- Normalizar puntuacion para facilitar reemplazos por palabra
    SET t = REPLACE(t, ',', ' ');
    SET t = REPLACE(t, ';', ' ');
    SET t = REPLACE(t, ':', ' ');
    SET t = REPLACE(t, '/', ' ');
    SET t = REPLACE(t, '(', ' ');
    SET t = REPLACE(t, ')', ' ');

    -- Reglas por frase (prioridad alta)
    SET t = REPLACE(t, 'certain infectious and parasitic diseases', 'ciertas enfermedades infecciosas y parasitarias');
    SET t = REPLACE(t, 'diseases of the digestive system', 'enfermedades del sistema digestivo');
    SET t = REPLACE(t, 'diseases of the respiratory system', 'enfermedades del sistema respiratorio');
    SET t = REPLACE(t, 'diseases of the circulatory system', 'enfermedades del sistema circulatorio');
    SET t = REPLACE(t, 'diseases of the nervous system', 'enfermedades del sistema nervioso');
    SET t = REPLACE(t, 'diseases of the genitourinary system', 'enfermedades del sistema genitourinario');
    SET t = REPLACE(t, 'diseases of the musculoskeletal system and connective tissue', 'enfermedades del sistema osteomuscular y del tejido conjuntivo');
    SET t = REPLACE(t, 'systemic inflammatory response syndrome', 'sindrome de respuesta inflamatoria sistemica');
    SET t = REPLACE(t, 'due to non-infectious process', 'debido a proceso no infeccioso');
    SET t = REPLACE(t, 'due to noninfectious process', 'debido a proceso no infeccioso');
    SET t = REPLACE(t, 'special screening examination for', 'examen especial de tamizaje para');
    SET t = REPLACE(t, 'family history of', 'antecedente familiar de');
    SET t = REPLACE(t, 'personal history of', 'antecedente personal de');
    SET t = REPLACE(t, 'certain conditions arising in the perinatal period', 'ciertas afecciones originadas en el periodo perinatal');
        SET t = REPLACE(t, 'diabetes insipidus', 'diabetes insipida');
        SET t = REPLACE(t, 'diabetic mononeuropathy', 'mononeuropatia diabetica');
        SET t = REPLACE(t, 'diabetic polyneuropathy', 'polineuropatia diabetica');
        SET t = REPLACE(t, 'nerve root and plexus disorders', 'trastornos de nervio raiz y plexo');
        SET t = REPLACE(t, 'nerve root and plexus disorder', 'trastorno de nervio raiz y plexo');
        SET t = REPLACE(t, 'other endocrine glands', 'otras glandulas endocrinas');
        SET t = REPLACE(t, 'presence of', 'presencia de');
        SET t = REPLACE(t, 'tooth-root', 'raiz dental');
        SET t = REPLACE(t, 'mandibular implants', 'implantes mandibulares');
        SET t = REPLACE(t, 'factors influencing health status', 'factores que influyen en el estado de salud');
        SET t = REPLACE(t, 'contact with health services', 'contacto con los servicios de salud');
        SET t = REPLACE(t, 'persons with potential health hazards related to family and personal history and certain conditions influencing health status', 'personas con riesgos potenciales para la salud relacionados con antecedentes familiares y personales y ciertas afecciones que influyen en el estado de salud');
    SET t = REPLACE(t, 'blood-forming organs', 'organos hematopoyeticos');
    SET t = REPLACE(t, 'immune mechanism', 'mecanismo inmune');
    SET t = REPLACE(t, 'other specified', 'otro especificado');
    SET t = REPLACE(t, 'without mention of', 'sin mencion de');
    SET t = REPLACE(t, 'with or without', 'con o sin');
    SET t = REPLACE(t, 'due to', 'debido a');

    -- Diccionario por palabra (controlado)
    SET t = CONCAT(' ', t, ' ');
    SET t = REPLACE(t, ' other ', ' otro ');
    SET t = REPLACE(t, ' others ', ' otros ');
    SET t = REPLACE(t, ' unspecified ', ' no especificado ');
    SET t = REPLACE(t, ' acute ', ' agudo ');
    SET t = REPLACE(t, ' chronic ', ' cronico ');
    SET t = REPLACE(t, ' infection ', ' infeccion ');
    SET t = REPLACE(t, ' infections ', ' infecciones ');
    SET t = REPLACE(t, ' disease ', ' enfermedad ');
    SET t = REPLACE(t, ' diseases ', ' enfermedades ');
    SET t = REPLACE(t, ' disorder ', ' trastorno ');
    SET t = REPLACE(t, ' disorders ', ' trastornos ');
    SET t = REPLACE(t, ' intestinal ', ' intestinal ');
    SET t = REPLACE(t, ' infectious ', ' infecciosas ');
    SET t = REPLACE(t, ' parasitic ', ' parasitarias ');
    SET t = REPLACE(t, ' certain ', ' ciertas ');
    SET t = REPLACE(t, ' digestive ', ' digestivo ');
    SET t = REPLACE(t, ' respiratory ', ' respiratorio ');
    SET t = REPLACE(t, ' circulatory ', ' circulatorio ');
    SET t = REPLACE(t, ' nervous ', ' nervioso ');
    SET t = REPLACE(t, ' genitourinary ', ' genitourinario ');
    SET t = REPLACE(t, ' systemic ', ' sistemica ');
    SET t = REPLACE(t, ' inflammatory ', ' inflamatoria ');
    SET t = REPLACE(t, ' response ', ' respuesta ');
    SET t = REPLACE(t, ' syndrome ', ' sindrome ');
    SET t = REPLACE(t, ' special ', ' especial ');
    SET t = REPLACE(t, ' screening ', ' tamizaje ');
    SET t = REPLACE(t, ' examination ', ' examen ');
    SET t = REPLACE(t, ' family ', ' familiar ');
    SET t = REPLACE(t, ' history ', ' antecedente ');
    SET t = REPLACE(t, ' personal ', ' personal ');
    SET t = REPLACE(t, ' conditions ', ' afecciones ');
    SET t = REPLACE(t, ' arising ', ' originadas ');
    SET t = REPLACE(t, ' period ', ' periodo ');
    SET t = REPLACE(t, ' process ', ' proceso ');
    SET t = REPLACE(t, ' blood ', ' sangre ');
    SET t = REPLACE(t, ' organs ', ' organos ');
    SET t = REPLACE(t, ' organ ', ' organo ');
    SET t = REPLACE(t, ' immune ', ' inmune ');
    SET t = REPLACE(t, ' mechanism ', ' mecanismo ');
    SET t = REPLACE(t, ' presence ', ' presencia ');
    SET t = REPLACE(t, ' implants ', ' implantes ');
    SET t = REPLACE(t, ' influencing ', ' que influyen en ');
    SET t = REPLACE(t, ' health ', ' salud ');
    SET t = REPLACE(t, ' status ', ' estado ');
    SET t = REPLACE(t, ' contact ', ' contacto ');
    SET t = REPLACE(t, ' services ', ' servicios ');
    SET t = REPLACE(t, ' potential ', ' potenciales ');
    SET t = REPLACE(t, ' hazards ', ' riesgos ');
    SET t = REPLACE(t, ' related ', ' relacionados ');
        SET t = REPLACE(t, ' diabetic ', ' diabetica ');
        SET t = REPLACE(t, ' neuropathy ', ' neuropatia ');
        SET t = REPLACE(t, ' mononeuropathy ', ' mononeuropatia ');
        SET t = REPLACE(t, ' polyneuropathy ', ' polineuropatia ');
        SET t = REPLACE(t, ' insipidus ', ' insipida ');
        SET t = REPLACE(t, ' endocrine ', ' endocrinas ');
        SET t = REPLACE(t, ' gland ', ' glandula ');
        SET t = REPLACE(t, ' glands ', ' glandulas ');
        SET t = REPLACE(t, ' nerve ', ' nervio ');
        SET t = REPLACE(t, ' root ', ' raiz ');
        SET t = REPLACE(t, ' plexus ', ' plexo ');
    SET t = REPLACE(t, ' system ', ' sistema ');
    SET t = REPLACE(t, ' foodborne ', ' transmitido por alimentos ');
    SET t = REPLACE(t, ' non-infectious ', ' no infeccioso ');
    SET t = REPLACE(t, ' noninfectious ', ' no infeccioso ');
    SET t = REPLACE(t, ' with ', ' con ');
    SET t = REPLACE(t, ' for ', ' para ');
    SET t = REPLACE(t, ' without ', ' sin ');
    SET t = REPLACE(t, ' and ', ' y ');
    SET t = REPLACE(t, ' the ', ' ');
    SET t = REPLACE(t, ' of ', ' de ');

    -- Limpieza de espacios/sintaxis
    SET t = REPLACE(t, '  ', ' ');
    SET t = REPLACE(t, '  ', ' ');
    SET t = REPLACE(t, '  ', ' ');
    SET t = TRIM(t);

    -- Ajustes puntuales frecuentes
    SET t = REPLACE(t, 'otro especificado', 'otro especificado');
    SET t = REPLACE(t, 'no especificado, no especificado', 'no especificado');
    SET t = REPLACE(t, 'de de', 'de');
    SET t = REPLACE(t, 'y y', 'y');

    RETURN t;
END $$

DROP PROCEDURE IF EXISTS sp_cie10_autocorregir_es_no_manual $$
CREATE PROCEDURE sp_cie10_autocorregir_es_no_manual(IN p_apply TINYINT)
BEGIN
    DECLARE v_before BIGINT DEFAULT 0;
    DECLARE v_after BIGINT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Contaminacion antes
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

    -- Aplicar autocorreccion (sin manual)
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

    -- Contaminacion despues
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

    -- Muestra de potenciales pendientes
    SELECT codigo, nombre_es, categoria_es, subcategoria_es
    FROM cie10
    WHERE activo = 1
      AND (
                                LOWER(COALESCE(nombre_es, '')) REGEXP '(^|[^a-z])(due to|other|unspecified|acute|chronic|infection|disease|with|without|certain|infectious|parasitic|digestive|respiratory|circulatory|nervous|genitourinary|mononeuropathy|polyneuropathy|neuropathy|nerve|root|plexus|gland|glands|history|screening|examination)([^a-z]|$)'
                 OR LOWER(COALESCE(categoria_es, '')) REGEXP '(^|[^a-z])(certain|diseases|infectious|parasitic|system|digestive|respiratory|circulatory|nervous|gland|glands)([^a-z]|$)'
                        OR LOWER(COALESCE(subcategoria_es, '')) REGEXP '(^|[^a-z])(infectious|diseases|disorders|digestive|respiratory|circulatory|nervous|genitourinary|nerve|root|plexus|neuropathy|gland|glands)([^a-z]|$)'
      )
    ORDER BY codigo
    LIMIT 100;

    IF p_apply = 1 THEN
        COMMIT;
        SELECT 'COMMIT aplicado - autocorreccion sin llenado manual' AS resultado;
    ELSE
        ROLLBACK;
        SELECT 'ROLLBACK aplicado - simulacion sin cambios persistidos' AS resultado;
    END IF;
END $$

DELIMITER ;

-- Uso:
-- 1) Simulacion
-- CALL sp_cie10_autocorregir_es_no_manual(0);
--
-- 2) Aplicar
-- CALL sp_cie10_autocorregir_es_no_manual(1);
--
-- 3) Validacion estricta (script 08)
-- CALL sp_cie10_qc_validar_o_fallar();
