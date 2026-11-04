-- =====================================================================
--  002 — Facturación y pagos (Factus Pay + Factus Facturación)
--
--  Idempotente: se puede ejecutar varias veces sin romper nada.
--  Requiere que 001 (barberia.sql) ya haya creado usuarios y reservas.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Órdenes
--
--  Una orden es una compra o una reserva que se va a cobrar. Su
--  `referencia` es la misma cadena que viaja a Factus Pay como
--  reference_code y a Facturación como reference_code de la factura:
--  es el hilo que une orden, recaudo, webhook y factura.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturacion_ordenes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referencia VARCHAR(100) NOT NULL,
  tipo ENUM('producto','reserva','mixto') NOT NULL,
  usuario_id INT NULL,
  reserva_id INT NULL,

  -- Datos del cliente, copiados al crear la orden. No se leen de
  -- `usuarios` al facturar: si el usuario cambia su nombre después,
  -- la factura ya emitida debe seguir diciendo lo que decía.
  cliente_nombre VARCHAR(255) NOT NULL,
  cliente_email VARCHAR(255) NULL,
  cliente_telefono VARCHAR(20) NULL,
  cliente_tipo_documento VARCHAR(2) NULL,
  cliente_documento VARCHAR(30) NULL,
  cliente_direccion VARCHAR(255) NULL,
  cliente_municipio_codigo VARCHAR(10) NULL,

  subtotal DECIMAL(12,2) NOT NULL,
  impuestos DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,

  estado ENUM(
    'creada','recaudo_pendiente','pagada','facturada',
    'expirada','fallida','error_factura','anulada'
  ) NOT NULL DEFAULT 'creada',

  -- Espejo de lo que dice Factus Pay. `pay_status` es suyo, no nuestro:
  -- nunca se escribe a mano, solo con lo que devuelve su API.
  pay_status ENUM('ready','paid','failed') NULL,
  pay_breb_key VARCHAR(100) NULL,
  pay_qr_expires_at DATETIME NULL,
  pay_paid_at DATETIME NULL,
  -- 'webhook' o 'conciliacion': por dónde nos enteramos del pago.
  pay_origen VARCHAR(20) NULL,

  -- Factura electrónica (fase 6)
  factus_number VARCHAR(50) NULL,
  factus_cufe VARCHAR(100) NULL,
  factus_public_url VARCHAR(500) NULL,
  factus_pdf_url VARCHAR(500) NULL,
  factus_validated_at DATETIME NULL,

  ultimo_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- Sin esta restricción, dos peticiones simultáneas podrían crear dos
  -- órdenes con la misma referencia y cobrar dos veces.
  UNIQUE KEY uq_facturacion_ordenes_referencia (referencia),
  KEY idx_facturacion_ordenes_usuario (usuario_id),
  KEY idx_facturacion_ordenes_reserva (reserva_id),
  KEY idx_facturacion_ordenes_estado (estado),
  CONSTRAINT fk_facturacion_ordenes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_facturacion_ordenes_reserva
    FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Ítems de la orden
--
--  Se guardan los precios resueltos en el servidor, no los que mande
--  el cliente. `precio_bruto_unitario` es lo que ve el comprador;
--  `precio_neto_unitario` es la base sin IVA que necesita la DIAN.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturacion_orden_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('producto','servicio_corte','servicio_barba') NOT NULL,
  item_ref_id INT NOT NULL,
  -- PROD-19, SERV-C-1, SERV-B-2: lo que se envía como code_reference.
  codigo_referencia VARCHAR(100) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  precio_bruto_unitario DECIMAL(12,2) NOT NULL,
  precio_neto_unitario DECIMAL(12,2) NOT NULL,
  tasa_impuesto DECIMAL(5,2) NOT NULL DEFAULT 19.00,
  impuesto_unitario DECIMAL(12,2) NOT NULL,
  total_linea DECIMAL(12,2) NOT NULL,

  PRIMARY KEY (id),
  KEY idx_facturacion_items_orden (orden_id),
  CONSTRAINT fk_facturacion_items_orden
    FOREIGN KEY (orden_id) REFERENCES facturacion_ordenes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Eventos
--
--  Traza de todo lo que pasa con una orden, y la pieza que hace
--  idempotente el webhook.
--
--  La clave única es (fuente, referencia, evento), no solo la
--  referencia: la tabla guarda también eventos de facturación e
--  internos, y una referencia tiene varios eventos a lo largo de su
--  vida. Con esta clave, el webhook de pago de una referencia solo
--  puede registrarse una vez — que es lo que impide procesar dos veces
--  el mismo cobro — sin perder el resto del historial.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturacion_eventos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_id BIGINT UNSIGNED NULL,
  referencia VARCHAR(100) NULL,
  fuente ENUM('pay','facturacion','interno') NOT NULL,
  evento VARCHAR(100) NOT NULL,
  payload JSON NULL,
  resultado ENUM('ok','error') NOT NULL,
  mensaje TEXT NULL,
  -- Cuántas veces llegó el mismo evento (Factus reintenta hasta 6).
  intentos INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_facturacion_eventos_idem (fuente, referencia, evento),
  KEY idx_facturacion_eventos_orden (orden_id),
  KEY idx_facturacion_eventos_referencia (referencia),
  KEY idx_facturacion_eventos_fuente (fuente),
  CONSTRAINT fk_facturacion_eventos_orden
    FOREIGN KEY (orden_id) REFERENCES facturacion_ordenes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
