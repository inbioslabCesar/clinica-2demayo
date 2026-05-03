START TRANSACTION;

CREATE TABLE IF NOT EXISTS cobros_cotizaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cobro_id INT NOT NULL,
    cotizacion_id INT NOT NULL,
    monto_original DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    descuento_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    monto_aplicado DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    saldo_anterior DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    saldo_nuevo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    estado_resultado ENUM('pendiente', 'parcial', 'pagado', 'anulado') NOT NULL DEFAULT 'parcial',
    orden_aplicacion INT NOT NULL DEFAULT 1,
    usuario_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY ux_cobro_cotizacion (cobro_id, cotizacion_id),
    KEY idx_cc_cotizacion (cotizacion_id),
    KEY idx_cc_created_at (created_at),
    CONSTRAINT fk_cc_cobro FOREIGN KEY (cobro_id) REFERENCES cobros(id) ON DELETE CASCADE,
    CONSTRAINT fk_cc_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
    CONSTRAINT fk_cc_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cobros_cotizaciones (
    cobro_id,
    cotizacion_id,
    monto_original,
    descuento_aplicado,
    monto_aplicado,
    saldo_anterior,
    saldo_nuevo,
    estado_resultado,
    orden_aplicacion,
    usuario_id
)
SELECT
    ab.cobro_id,
    ab.cotizacion_id,
    ROUND(ab.monto_aplicado + COALESCE(descu.descuento_aplicado, 0), 2) AS monto_original,
    COALESCE(descu.descuento_aplicado, 0) AS descuento_aplicado,
    ab.monto_aplicado,
    ab.saldo_anterior,
    ab.saldo_nuevo,
    CASE
        WHEN c.estado IN ('anulada', 'anulado') THEN 'anulado'
        WHEN ab.saldo_nuevo <= 0.009 THEN 'pagado'
        WHEN ab.monto_aplicado > 0 THEN 'parcial'
        ELSE 'pendiente'
    END AS estado_resultado,
    1 AS orden_aplicacion,
    ab.usuario_id
FROM (
    SELECT
        cm.cobro_id,
        cm.cotizacion_id,
        ROUND(SUM(cm.monto), 2) AS monto_aplicado,
        MIN(cm.saldo_anterior) AS saldo_anterior,
        MIN(cm.saldo_nuevo) AS saldo_nuevo,
        MAX(cm.usuario_id) AS usuario_id
    FROM cotizacion_movimientos cm
    WHERE cm.cobro_id IS NOT NULL
      AND LOWER(cm.tipo_movimiento) = 'abono'
    GROUP BY cm.cobro_id, cm.cotizacion_id
) ab
LEFT JOIN (
    SELECT
        cm.cobro_id,
        cm.cotizacion_id,
        ROUND(SUM(cm.monto), 2) AS descuento_aplicado
    FROM cotizacion_movimientos cm
    WHERE cm.cobro_id IS NOT NULL
      AND LOWER(cm.tipo_movimiento) = 'devolucion'
    GROUP BY cm.cobro_id, cm.cotizacion_id
) descu
    ON descu.cobro_id = ab.cobro_id
   AND descu.cotizacion_id = ab.cotizacion_id
INNER JOIN cotizaciones c ON c.id = ab.cotizacion_id
ON DUPLICATE KEY UPDATE
    monto_original = VALUES(monto_original),
    descuento_aplicado = VALUES(descuento_aplicado),
    monto_aplicado = VALUES(monto_aplicado),
    saldo_anterior = VALUES(saldo_anterior),
    saldo_nuevo = VALUES(saldo_nuevo),
    estado_resultado = VALUES(estado_resultado),
    usuario_id = VALUES(usuario_id),
    updated_at = CURRENT_TIMESTAMP;

COMMIT;