-- 03_reglas_honorario_paquete.sql
-- Reglas opcionales de honorario solo para items dentro de paquetes
-- Si no existe regla aqui, se usa configuracion normal del medico.

CREATE TABLE IF NOT EXISTS paquetes_perfiles_items_honorario_reglas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  paquete_item_id BIGINT UNSIGNED NOT NULL,
  modo_honorario ENUM('usar_configuracion_medico','monto_fijo_medico_paquete','porcentaje_medico_paquete') NOT NULL DEFAULT 'usar_configuracion_medico',
  monto_fijo_medico DECIMAL(12,2) NULL,
  porcentaje_medico DECIMAL(6,2) NULL,
  observaciones VARCHAR(255) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_paq_item_honorario (paquete_item_id),
  KEY idx_paq_item_honorario_modo (modo_honorario),
  CONSTRAINT fk_paq_item_honorario_item FOREIGN KEY (paquete_item_id) REFERENCES paquetes_perfiles_items(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Validaciones de referencia (consulta no destructiva)
SELECT
  COUNT(*) AS total_reglas,
  SUM(modo_honorario = 'usar_configuracion_medico') AS reglas_por_defecto,
  SUM(modo_honorario <> 'usar_configuracion_medico') AS reglas_override
FROM paquetes_perfiles_items_honorario_reglas;
