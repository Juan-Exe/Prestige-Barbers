-- =====================================================================
--  006 — Notas débito
--
--  A diferencia de la nota crédito, que anula la factura entera y por
--  eso cabe en columnas de la propia orden, una factura puede recibir
--  VARIAS notas débito a lo largo del tiempo: un interés este mes, un
--  gasto por cobrar el siguiente. Por eso van en su propia tabla.
--
--  Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS facturacion_notas_debito (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_id BIGINT UNSIGNED NOT NULL,
  referencia VARCHAR(100) NOT NULL,

  -- Número y CUDE que devuelve la DIAN al validarla.
  numero VARCHAR(50) NULL,
  cude VARCHAR(100) NULL,
  public_url VARCHAR(600) NULL,

  -- Concepto DIAN: 1 intereses, 2 gastos por cobrar,
  -- 3 cambio del valor, 4 otros.
  concepto VARCHAR(2) NOT NULL DEFAULT '4',
  motivo VARCHAR(500) NULL,

  subtotal DECIMAL(12,2) NOT NULL,
  impuestos DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,

  -- Lo que se cobra, para poder reconstruir la nota.
  items JSON NULL,

  estado ENUM('emitida','error') NOT NULL DEFAULT 'emitida',
  ultimo_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_notas_debito_referencia (referencia),
  KEY idx_notas_debito_orden (orden_id),
  CONSTRAINT fk_notas_debito_orden
    FOREIGN KEY (orden_id) REFERENCES facturacion_ordenes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
