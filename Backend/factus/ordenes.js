// =====================================================================
//  Órdenes de Factus Pay
//
//  Una orden es lo que se va a cobrar. Su referencia (PB-P-000123) es
//  la misma cadena que viaja a Factus Pay y, más adelante, a la
//  factura electrónica: es el hilo que une todo.
//
//  Regla que gobierna este archivo: los precios SIEMPRE se resuelven
//  en el servidor desde la base de datos. Lo que mande el cliente en
//  el cuerpo de la petición se ignora por completo.
// =====================================================================

const pay = require('./pay-client');
const facturacion = require('./facturacion-client');
const correo = require('./correo');

// IVA general en Colombia. Los precios del catálogo ya lo incluyen,
// así que la base gravable se obtiene dividiendo, no multiplicando.
const TASA_IVA = 19.00;

// De qué tabla sale cada tipo de ítem y cómo se nombra su código.
const ORIGEN_ITEM = {
    producto:       { tabla: 'productos', prefijo: 'PROD',   tieneStock: true  },
    servicio_corte: { tabla: 'cortes',    prefijo: 'SERV-C', tieneStock: false },
    servicio_barba: { tabla: 'barbas',    prefijo: 'SERV-B', tieneStock: false },
};

class OrdenError extends Error {
    constructor(mensaje, status = 400, detalle = null) {
        super(mensaje);
        this.name = 'OrdenError';
        this.status = status;
        this.detalle = detalle;
    }
}

// Promesa sobre el driver de mysql, que es de callbacks.
function consultar(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, filas) => {
            if (err) reject(err);
            else resolve(filas);
        });
    });
}

// ---------------------------------------------------------------------
//  Redondeo al peso
//
//  El peso colombiano no tiene centavos en la práctica. Se redondea
//  media unidad hacia arriba, el criterio habitual en facturación.
// ---------------------------------------------------------------------
function redondear(valor) {
    return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------
//  Resolver los ítems contra la base de datos
//
//  Devuelve las líneas con sus precios reales. Si el cliente mandó un
//  precio, ni se mira.
// ---------------------------------------------------------------------
async function resolverItems(db, items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new OrdenError('La orden necesita al menos un ítem');
    }
    if (items.length > 50) {
        throw new OrdenError('Demasiados ítems en una sola orden');
    }

    const resueltos = [];

    for (const item of items) {
        const origen = ORIGEN_ITEM[item.tipo];
        if (!origen) {
            throw new OrdenError(
                `Tipo de ítem desconocido: ${item.tipo}`,
                400
            );
        }

        const id = parseInt(item.id, 10);
        if (!Number.isInteger(id) || id <= 0) {
            throw new OrdenError(`Id inválido para un ${item.tipo}`);
        }

        const cantidad = parseInt(item.cantidad, 10) || 1;
        if (cantidad < 1 || cantidad > 100) {
            throw new OrdenError('La cantidad debe estar entre 1 y 100');
        }

        const columnas = origen.tieneStock
            ? 'id, nombre, precio, stock'
            : 'id, nombre, precio';
        const filas = await consultar(
            db,
            `SELECT ${columnas} FROM ${origen.tabla} WHERE id = ?`,
            [id]
        );

        if (filas.length === 0) {
            throw new OrdenError(
                `No existe el ${item.tipo} con id ${id}`,
                404
            );
        }

        const fila = filas[0];

        if (origen.tieneStock && Number(fila.stock) < cantidad) {
            throw new OrdenError(
                `Stock insuficiente de "${fila.nombre}": quedan ${fila.stock}`,
                409
            );
        }

        // El precio del catálogo ya incluye IVA. Para la DIAN hace falta
        // la base gravable: precio / 1.19.
        const precioBruto = redondear(fila.precio);
        const precioNeto = redondear(precioBruto / (1 + TASA_IVA / 100));
        const impuestoUnitario = redondear(precioBruto - precioNeto);

        resueltos.push({
            tipo: item.tipo,
            item_ref_id: fila.id,
            codigo_referencia: `${origen.prefijo}-${fila.id}`,
            nombre: fila.nombre,
            cantidad,
            precio_bruto_unitario: precioBruto,
            precio_neto_unitario: precioNeto,
            tasa_impuesto: TASA_IVA,
            impuesto_unitario: impuestoUnitario,
            total_linea: redondear(precioBruto * cantidad),
        });
    }

    return resueltos;
}

function calcularTotales(items) {
    let subtotal = 0;
    let impuestos = 0;
    let total = 0;

    for (const i of items) {
        subtotal += i.precio_neto_unitario * i.cantidad;
        impuestos += i.impuesto_unitario * i.cantidad;
        total += i.precio_bruto_unitario * i.cantidad;
    }

    return {
        subtotal: redondear(subtotal),
        impuestos: redondear(impuestos),
        total: redondear(total),
    };
}

// El tipo de la orden sale de lo que contiene, no de lo que diga el
// cliente: productos, servicios, o ambos.
function deducirTipo(items) {
    const hayProducto = items.some((i) => i.tipo === 'producto');
    const hayServicio = items.some((i) => i.tipo !== 'producto');
    if (hayProducto && hayServicio) return 'mixto';
    return hayProducto ? 'producto' : 'reserva';
}

function letraDeTipo(tipo) {
    return { producto: 'P', reserva: 'R', mixto: 'M' }[tipo] || 'X';
}

// ---------------------------------------------------------------------
//  Crear la orden
//
//  Se inserta primero con una referencia temporal para obtener el id
//  autoincremental, y después se fija la referencia definitiva. Todo
//  dentro de una transacción: o queda la orden con sus ítems, o no
//  queda nada.
// ---------------------------------------------------------------------
async function crearOrden(db, { usuarioId, cliente, items, reservaId = null }) {
    const resueltos = await resolverItems(db, items);
    const totales = calcularTotales(resueltos);
    const tipo = deducirTipo(resueltos);

    // Factus Pay solo acepta montos en este rango. Se comprueba aquí
    // para dar un error claro antes de salir a la red.
    if (totales.total < pay.MONTO_MINIMO || totales.total > pay.MONTO_MAXIMO) {
        throw new OrdenError(
            `El total (${totales.total} COP) está fuera del rango que admite ` +
            `Factus Pay: ${pay.MONTO_MINIMO} a ${pay.MONTO_MAXIMO} COP`,
            400
        );
    }

    // ---- Reutilizar una orden pendiente en vez de crear otra ----
    //
    // Si el cliente vuelve a intentar pagar lo mismo, lo que quiere es
    // seguir con su cobro, no abrir uno nuevo. Crear otra orden deja
    // pendientes duplicadas y cuesta dinero: Factus cobra $800 + IVA
    // por cada recaudo creado.
    //
    // Se busca una orden del mismo usuario, por el mismo importe y los
    // mismos artículos, que siga esperando el pago.
    const candidatas = await consultar(db, `
        SELECT * FROM facturacion_ordenes
         WHERE usuario_id = ?
           AND total = ?
           AND estado IN ('creada', 'recaudo_pendiente', 'expirada')
           AND (reserva_id <=> ?)
         ORDER BY id DESC
         LIMIT 5
    `, [usuarioId, totales.total, reservaId]);

    for (const candidata of candidatas) {
        const suyos = await consultar(db,
            'SELECT tipo, item_ref_id, cantidad FROM facturacion_orden_items WHERE orden_id = ? ORDER BY tipo, item_ref_id',
            [candidata.id]
        );

        const iguales =
            suyos.length === resueltos.length &&
            suyos.every((s, i) => {
                const r = [...resueltos].sort((a, b) =>
                    (a.tipo + a.item_ref_id).localeCompare(b.tipo + b.item_ref_id))[i];
                return r && s.tipo === r.tipo &&
                    Number(s.item_ref_id) === Number(r.item_ref_id) &&
                    Number(s.cantidad) === Number(r.cantidad);
            });

        if (!iguales) continue;

        // Es la misma compra. Se recupera su recaudo: Factus es
        // idempotente por reference_code, así que devuelve el que ya
        // existe en vez de cobrar otra vez.
        try {
            const recaudo = await pay.crearRecaudo(candidata.referencia, totales.total);

            // Si ya estaba pagado, no hay nada que reintentar.
            if (recaudo.estado === 'paid') {
                await marcarPagada(db, candidata, recaudo, 'consulta');
                throw new OrdenError(
                    'Esta compra ya está pagada. Revísala en Mis Compras.',
                    409
                );
            }

            const expira = pay.parsearFecha(recaudo.qrExpiraEn);

            await consultar(db, `
                UPDATE facturacion_ordenes
                   SET estado = 'recaudo_pendiente',
                       pay_status = ?, pay_breb_key = ?, pay_qr_expires_at = ?
                 WHERE id = ?
            `, [recaudo.estado || 'ready', recaudo.brebKey || null, expira, candidata.id]);

            await registrarEvento(db, {
                ordenId: candidata.id, referencia: candidata.referencia,
                fuente: 'pay', evento: 'recaudo_reutilizado',
                resultado: 'ok', mensaje: 'Se reutilizó el cobro pendiente',
            });

            console.log(`[factus-pay] Reutilizando ${candidata.referencia} en vez de crear otra orden`);

            return {
                referencia: candidata.referencia,
                estado: 'recaudo_pendiente',
                total: Number(candidata.total).toFixed(2),
                qr: recaudo.qr,
                breb_key: recaudo.brebKey,
                expira_en: expira ? expira.toISOString() : null,
                reutilizada: true,
            };
        } catch (error) {
            if (error instanceof OrdenError) throw error;
            // Si no se pudo recuperar, se sigue y se crea una nueva.
            console.warn(`[factus-pay] No se pudo reutilizar ${candidata.referencia}:`, error.message);
            break;
        }
    }

    await consultar(db, 'START TRANSACTION');

    let ordenId;
    let referencia;

    try {
        const temporal = 'TMP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

        const insercion = await consultar(db, `
            INSERT INTO facturacion_ordenes
                (referencia, tipo, usuario_id, reserva_id,
                 cliente_nombre, cliente_email, cliente_telefono,
                 cliente_tipo_documento, cliente_documento, cliente_direccion,
                 subtotal, impuestos, total, estado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creada')
        `, [
            temporal, tipo, usuarioId, reservaId,
            cliente.nombre, cliente.email || null, cliente.telefono || null,
            cliente.tipo_documento || '13', cliente.documento || null,
            cliente.direccion || null,
            totales.subtotal, totales.impuestos, totales.total,
        ]);

        ordenId = insercion.insertId;

        // La referencia lleva un sufijo de tiempo además del id.
        //
        // Sin él, dos entornos con la misma base de datos recién creada
        // (desarrollo y producción) generan PB-P-000001, PB-P-000002...
        // y chocan en Factus, que responde "La referencia ya existe con
        // un monto diferente". El sufijo las hace únicas por instalación
        // sin perder legibilidad.
        const sufijo = Date.now().toString(36).slice(-4).toUpperCase();
        referencia = `PB-${letraDeTipo(tipo)}-${String(ordenId).padStart(5, '0')}-${sufijo}`;

        await consultar(db,
            'UPDATE facturacion_ordenes SET referencia = ? WHERE id = ?',
            [referencia, ordenId]
        );

        for (const i of resueltos) {
            await consultar(db, `
                INSERT INTO facturacion_orden_items
                    (orden_id, tipo, item_ref_id, codigo_referencia, nombre,
                     cantidad, precio_bruto_unitario, precio_neto_unitario,
                     tasa_impuesto, impuesto_unitario, total_linea)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                ordenId, i.tipo, i.item_ref_id, i.codigo_referencia, i.nombre,
                i.cantidad, i.precio_bruto_unitario, i.precio_neto_unitario,
                i.tasa_impuesto, i.impuesto_unitario, i.total_linea,
            ]);
        }

        await consultar(db, 'COMMIT');
    } catch (error) {
        await consultar(db, 'ROLLBACK').catch(() => {});
        throw error;
    }

    // El recaudo se crea FUERA de la transacción: es una llamada de red
    // y no debe mantener abierta una transacción de base de datos.
    try {
        const recaudo = await pay.crearRecaudo(referencia, totales.total);

        const expira = pay.parsearFecha(recaudo.qrExpiraEn);

        await consultar(db, `
            UPDATE facturacion_ordenes
               SET estado = 'recaudo_pendiente',
                   pay_status = ?,
                   pay_breb_key = ?,
                   pay_qr_expires_at = ?
             WHERE id = ?
        `, [recaudo.estado || 'ready', recaudo.brebKey || null, expira, ordenId]);

        await registrarEvento(db, {
            ordenId, referencia, fuente: 'pay', evento: 'recaudo_creado',
            resultado: 'ok',
            mensaje: recaudo.yaExistia ? 'Recaudo ya existente' : 'Recaudo creado',
        });

        return {
            referencia,
            estado: 'recaudo_pendiente',
            total: totales.total.toFixed(2),
            qr: recaudo.qr,
            breb_key: recaudo.brebKey,
            expira_en: expira ? expira.toISOString() : null,
        };
    } catch (error) {
        // La orden queda guardada en estado 'fallida': no se pierde el
        // rastro de lo que el cliente intentó comprar.
        await consultar(db, `
            UPDATE facturacion_ordenes
               SET estado = 'fallida', ultimo_error = ?
             WHERE id = ?
        `, [String(error.message).slice(0, 500), ordenId]).catch(() => {});

        await registrarEvento(db, {
            ordenId, referencia, fuente: 'pay', evento: 'recaudo_fallido',
            resultado: 'error', mensaje: String(error.message).slice(0, 500),
        }).catch(() => {});

        throw new OrdenError(
            'No se pudo crear el cobro en Factus Pay: ' + error.message,
            502
        );
    }
}

// ---------------------------------------------------------------------
//  Renovar el QR de un recaudo
//
//  Factus renueva el QR si se reenvía el mismo reference_code con el
//  mismo monto. No crea otro cobro ni vuelve a cobrar la tarifa de
//  $800 + IVA.
// ---------------------------------------------------------------------
async function renovarRecaudo(db, orden) {
    const recaudo = await pay.crearRecaudo(orden.referencia, Number(orden.total));

    // Puede haberse pagado mientras tanto.
    if (recaudo.estado === 'paid') {
        await marcarPagada(db, orden, recaudo, 'consulta');
        return {
            referencia: orden.referencia,
            estado: 'pagada',
            total: Number(orden.total).toFixed(2),
            ya_pagada: true,
        };
    }

    const expira = pay.parsearFecha(recaudo.qrExpiraEn);

    await consultar(db, `
        UPDATE facturacion_ordenes
           SET estado = 'recaudo_pendiente',
               pay_status = ?, pay_breb_key = ?, pay_qr_expires_at = ?,
               ultimo_error = NULL
         WHERE id = ?
    `, [recaudo.estado || 'ready', recaudo.brebKey || null, expira, orden.id]);

    await registrarEvento(db, {
        ordenId: orden.id, referencia: orden.referencia,
        fuente: 'pay', evento: 'qr_renovado',
        resultado: 'ok', mensaje: 'QR renovado',
    });

    return {
        referencia: orden.referencia,
        estado: 'recaudo_pendiente',
        total: Number(orden.total).toFixed(2),
        qr: recaudo.qr,
        breb_key: recaudo.brebKey,
        expira_en: expira ? expira.toISOString() : null,
    };
}

// ---------------------------------------------------------------------
//  Consultar una orden
//
//  Si sigue pendiente, se le pregunta a Factus Pay por si el pago entró
//  sin que llegara el webhook.
// ---------------------------------------------------------------------
async function consultarOrden(db, referencia, { usuarioId, esAdmin = false } = {}) {
    const filas = await consultar(db,
        'SELECT * FROM facturacion_ordenes WHERE referencia = ?',
        [referencia]
    );

    if (filas.length === 0) {
        throw new OrdenError('Orden no encontrada', 404);
    }

    const orden = filas[0];

    // Un usuario solo ve lo suyo. El admin ve todo.
    if (!esAdmin && orden.usuario_id !== usuarioId) {
        throw new OrdenError('No tienes permiso para ver esta orden', 403);
    }

    // Si está pendiente, puede que ya se haya pagado y el webhook no
    // haya llegado. Se verifica contra la API.
    if (orden.estado === 'recaudo_pendiente') {
        try {
            const recaudo = await pay.consultarRecaudo(referencia);
            if (recaudo && recaudo.estado === 'paid') {
                await marcarPagada(db, orden, recaudo, 'consulta');
                orden.estado = 'pagada';
                orden.pay_status = 'paid';
            } else if (recaudo && recaudo.estado === 'failed') {
                await consultar(db,
                    "UPDATE facturacion_ordenes SET estado='fallida', pay_status='failed' WHERE id = ?",
                    [orden.id]
                );
                orden.estado = 'fallida';
            } else if (orden.pay_qr_expires_at && new Date(orden.pay_qr_expires_at) < new Date()) {
                await consultar(db,
                    "UPDATE facturacion_ordenes SET estado='expirada' WHERE id = ?",
                    [orden.id]
                );
                orden.estado = 'expirada';
            }
        } catch (error) {
            // Que falle la consulta a Factus no debe impedir devolver lo
            // que ya sabemos de la orden.
            console.warn('[factus-pay] No se pudo verificar el recaudo:', error.message);
        }
    }

    const items = await consultar(db,
        'SELECT * FROM facturacion_orden_items WHERE orden_id = ?',
        [orden.id]
    );

    return {
        referencia: orden.referencia,
        estado: orden.estado,
        tipo: orden.tipo,
        total: Number(orden.total).toFixed(2),
        subtotal: Number(orden.subtotal).toFixed(2),
        impuestos: Number(orden.impuestos).toFixed(2),
        creada_en: orden.created_at,
        items: items.map((i) => ({
            nombre: i.nombre,
            cantidad: Number(i.cantidad),
            precio: Number(i.precio_bruto_unitario).toFixed(2),
            total: Number(i.total_linea).toFixed(2),
        })),
        pago: {
            status: orden.pay_status,
            breb_key: orden.pay_breb_key,
            expira_en: orden.pay_qr_expires_at,
            pagado_en: orden.pay_paid_at,
            origen: orden.pay_origen,
        },
        factura: orden.factus_number ? {
            numero: orden.factus_number,
            cufe: orden.factus_cufe,
            public_url: orden.factus_public_url,
        } : null,
    };
}

// Marca una orden como pagada. Idempotente: si ya estaba pagada, no
// hace nada.
async function marcarPagada(db, orden, recaudo, origen) {
    if (orden.estado === 'pagada' || orden.estado === 'facturada') {
        return false;
    }

    // El monto debe coincidir. Si no, es una señal de alarma: se
    // registra y la orden NO se marca pagada.
    const esperado = Number(orden.total);
    const recibido = Number(recaudo.monto);
    if (Math.abs(esperado - recibido) > 0.5) {
        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'pay', evento: 'monto_no_coincide', resultado: 'error',
            mensaje: `Esperado ${esperado}, recibido ${recibido}`,
        });
        return false;
    }

    const pagadoEn = pay.parsearFecha(recaudo.cobradoEn) || new Date();

    await consultar(db, `
        UPDATE facturacion_ordenes
           SET estado = 'pagada', pay_status = 'paid',
               pay_paid_at = ?, pay_origen = ?
         WHERE id = ? AND estado IN ('recaudo_pendiente','expirada','fallida')
    `, [pagadoEn, origen, orden.id]);

    // Si la orden pagaba una reserva, esa reserva pasa a confirmada.
    if (orden.reserva_id) {
        try {
            await consultar(db,
                "UPDATE reservas SET estado = 'confirmada' WHERE id = ? AND estado = 'pendiente'",
                [orden.reserva_id]
            );
            console.log(`[factus-pay] Reserva ${orden.reserva_id} confirmada por pago`);
        } catch (error) {
            // Que falle esto no invalida el pago: el dinero entró.
            console.error('[factus-pay] No se pudo confirmar la reserva:', error.message);
        }
    }

    // La factura se emite sin esperar: el webhook debe responder en
    // milisegundos y facturar tarda segundos. Si falla, la orden queda
    // en 'error_factura' y se puede reintentar sin volver a cobrar.
    setImmediate(() => {
        emitirFacturaDeOrden(db, orden.id).catch((e) =>
            console.error('[factus-fact] Error al facturar:', e.message)
        );
    });

    return true;
}

// ---------------------------------------------------------------------
//  Emitir la factura electrónica
//
//  Se llama cuando la orden queda pagada. Si falla, la orden pasa a
//  'error_factura': el pago sigue siendo válido y la factura se puede
//  reintentar sin volver a cobrar.
//
//  Sin documento del cliente no se factura, porque la DIAN lo exige.
// ---------------------------------------------------------------------
async function emitirFacturaDeOrden(db, ordenId) {
    const filas = await consultar(db,
        'SELECT * FROM facturacion_ordenes WHERE id = ?', [ordenId]);
    if (filas.length === 0) return null;

    const orden = filas[0];

    if (orden.estado === 'facturada') {
        return { yaFacturada: true, numero: orden.factus_number };
    }
    if (orden.estado !== 'pagada' && orden.estado !== 'error_factura') {
        return { noAplica: true, estado: orden.estado };
    }

    if (!orden.cliente_documento) {
        await consultar(db,
            "UPDATE facturacion_ordenes SET estado='error_factura', ultimo_error=? WHERE id=?",
            ['Falta el documento del cliente para facturar', orden.id]);
        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'factura_sin_documento',
            resultado: 'error', mensaje: 'El cliente no tiene documento registrado',
        });
        return { error: 'Falta el documento del cliente' };
    }

    const items = await consultar(db,
        'SELECT * FROM facturacion_orden_items WHERE orden_id = ?', [orden.id]);

    try {
        const factura = await facturacion.emitirFactura({
            referencia: orden.referencia,
            total: orden.total,
            observacion: `Prestige Barbers - ${orden.referencia}`,
            cliente: {
                tipo_documento: orden.cliente_tipo_documento || '13',
                documento: orden.cliente_documento,
                nombre: orden.cliente_nombre,
                email: orden.cliente_email,
                telefono: orden.cliente_telefono,
                direccion: orden.cliente_direccion,
            },
            items,
        });

        await consultar(db, `
            UPDATE facturacion_ordenes
               SET estado = 'facturada',
                   factus_number = ?, factus_cufe = ?,
                   factus_public_url = ?, factus_qr_url = ?,
                   factus_resolucion = ?, factus_datos = ?,
                   factus_validated_at = NOW(),
                   ultimo_error = NULL
             WHERE id = ?
        `, [
            factura.numero, factura.cufe,
            factura.publicUrl, factura.qrUrl,
            factura.resolucion,
            factura.crudo ? JSON.stringify(factura.crudo) : null,
            orden.id,
        ]);

        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'factura_emitida',
            resultado: 'ok', mensaje: `Factura ${factura.numero}`,
        });

        console.log(`[factus-fact] ${orden.referencia} facturada: ${factura.numero}`);

        // Enviar la factura al correo del cliente.
        //
        // El endpoint de envío de Factus no sirve en sandbox: solo manda
        // a una lista blanca que no podemos editar. Pero sí nos entrega
        // el PDF y el XML, así que el correo lo mandamos nosotros. Eso
        // funciona igual en sandbox y en producción.
        if (orden.cliente_email && factura.numero) {
            enviarFacturaAlCliente(db, orden, factura).catch((e) =>
                console.error('[correo] Error inesperado:', e.message)
            );
        }

        return factura;
    } catch (error) {
        // El pago no se revierte: solo falló la factura.
        await consultar(db,
            "UPDATE facturacion_ordenes SET estado='error_factura', ultimo_error=? WHERE id=?",
            [String(error.message).slice(0, 500), orden.id]).catch(() => {});

        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'factura_fallida',
            resultado: 'error', mensaje: String(error.message).slice(0, 500),
        });

        console.error(`[factus-fact] Falló la factura de ${orden.referencia}:`, error.message);
        return { error: error.message };
    }
}

// ---------------------------------------------------------------------
//  Enviar la factura al cliente
//
//  Descarga el PDF y el XML de Factus y los manda adjuntos. No se
//  espera a que termine: el pago ya está confirmado y la factura
//  emitida; que el correo tarde no debe retener nada.
// ---------------------------------------------------------------------
async function enviarFacturaAlCliente(db, orden, factura) {
    if (!correo.hayCredenciales()) {
        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'correo_no_enviado',
            resultado: 'error',
            mensaje: 'Faltan SMTP_USER y SMTP_PASS en el entorno',
        });
        console.warn('[correo] Sin credenciales SMTP; no se envió la factura');
        return;
    }

    try {
        const adjuntos = [];

        // El PDF y el XML por separado: si uno falla, el otro va igual.
        try {
            const pdf = await facturacion.descargarDocumento(factura.numero, 'pdf');
            adjuntos.push({
                nombre: pdf.nombre.endsWith('.pdf') ? pdf.nombre : pdf.nombre + '.pdf',
                tipo: 'application/pdf',
                contenido: pdf.contenido,
            });
        } catch (e) {
            console.warn('[correo] No se pudo descargar el PDF:', e.message);
        }

        try {
            const xml = await facturacion.descargarDocumento(factura.numero, 'xml');
            adjuntos.push({
                nombre: xml.nombre.endsWith('.xml') ? xml.nombre : xml.nombre + '.xml',
                tipo: 'application/xml',
                contenido: xml.contenido,
            });
        } catch (e) {
            console.warn('[correo] No se pudo descargar el XML:', e.message);
        }

        if (adjuntos.length === 0) {
            throw new Error('No se pudo descargar ni el PDF ni el XML');
        }

        await correo.enviarFactura({
            para: orden.cliente_email,
            nombreCliente: orden.cliente_nombre,
            numero: factura.numero,
            total: orden.total,
            referencia: orden.referencia,
            adjuntos,
        });

        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'factura_enviada_correo',
            resultado: 'ok',
            mensaje: `Enviada a ${orden.cliente_email} con ${adjuntos.length} adjuntos`,
        });

        console.log(`[correo] Factura ${factura.numero} enviada a ${orden.cliente_email}`);
    } catch (error) {
        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'correo_no_enviado',
            resultado: 'error', mensaje: String(error.message).slice(0, 400),
        });
        console.warn('[correo] No se envió la factura:', error.message);
    }
}

// ---------------------------------------------------------------------
//  Anular una factura con nota crédito
//
//  Una factura validada por la DIAN no se borra ni se edita. Se corrige
//  con una nota crédito que la referencia, y eso es lo que hace esta
//  función. La orden pasa a 'anulada' pero conserva los datos de la
//  factura: sigue existiendo ante la DIAN, solo que corregida.
// ---------------------------------------------------------------------
async function anularConNotaCredito(db, ordenId, { motivo, concepto } = {}) {
    const filas = await consultar(db,
        'SELECT * FROM facturacion_ordenes WHERE id = ?', [ordenId]);
    if (filas.length === 0) {
        throw new OrdenError('Orden no encontrada', 404);
    }

    const orden = filas[0];

    if (orden.estado === 'anulada') {
        return {
            yaAnulada: true,
            numero: orden.nota_credito_number,
            cude: orden.nota_credito_cude,
        };
    }
    if (orden.estado !== 'facturada') {
        throw new OrdenError(
            `Solo se puede anular una orden facturada; esta está ${orden.estado}`,
            409
        );
    }
    if (!orden.factus_number) {
        throw new OrdenError('La orden no tiene número de factura', 409);
    }

    const items = await consultar(db,
        'SELECT * FROM facturacion_orden_items WHERE orden_id = ?', [orden.id]);

    const referencia = orden.referencia + '-NC';

    try {
        const nota = await facturacion.emitirNotaCredito({
            referencia,
            numeroFactura: orden.factus_number,
            concepto: concepto || '2',   // anulación de factura electrónica
            observacion: motivo || `Anulación de la factura ${orden.factus_number}`,
            total: orden.total,
            cliente: {
                tipo_documento: orden.cliente_tipo_documento || '13',
                documento: orden.cliente_documento,
                nombre: orden.cliente_nombre,
                email: orden.cliente_email,
            },
            items,
        });

        await consultar(db, `
            UPDATE facturacion_ordenes
               SET estado = 'anulada',
                   nota_credito_number = ?, nota_credito_cude = ?,
                   nota_credito_url = ?, nota_credito_motivo = ?,
                   nota_credito_at = NOW()
             WHERE id = ?
        `, [
            nota.numero, nota.cude, nota.publicUrl,
            (motivo || '').slice(0, 500), orden.id,
        ]);

        // Si la orden pagaba una reserva, esa reserva se cancela.
        if (orden.reserva_id) {
            await consultar(db,
                "UPDATE reservas SET estado='cancelada', motivo_cancelacion=? WHERE id=?",
                [(motivo || 'Factura anulada').slice(0, 255), orden.reserva_id]
            ).catch(() => {});
        }

        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'nota_credito_emitida',
            resultado: 'ok',
            mensaje: `Nota ${nota.numero} sobre la factura ${orden.factus_number}. ${motivo || ''}`.trim(),
        });

        console.log(`[factus-fact] ${orden.referencia} anulada con la nota ${nota.numero}`);
        return nota;
    } catch (error) {
        await registrarEvento(db, {
            ordenId: orden.id, referencia: orden.referencia,
            fuente: 'facturacion', evento: 'nota_credito_fallida',
            resultado: 'error', mensaje: String(error.message).slice(0, 400),
        });
        throw new OrdenError(
            'No se pudo emitir la nota crédito: ' + error.message,
            502
        );
    }
}

// Registrar un evento. La clave única (fuente, referencia, evento) hace
// que un duplicado no cree otra fila: se cuenta como intento repetido.
async function registrarEvento(db, { ordenId, referencia, fuente, evento, resultado, mensaje, payload = null }) {
    try {
        await consultar(db, `
            INSERT INTO facturacion_eventos
                (orden_id, referencia, fuente, evento, payload, resultado, mensaje)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                intentos = intentos + 1,
                resultado = VALUES(resultado),
                mensaje = VALUES(mensaje)
        `, [
            ordenId || null, referencia || null, fuente, evento,
            payload ? JSON.stringify(payload) : null,
            resultado, mensaje ? String(mensaje).slice(0, 1000) : null,
        ]);
    } catch (error) {
        console.error('[factus-pay] No se pudo registrar el evento:', error.message);
    }
}

module.exports = {
    crearOrden,
    anularConNotaCredito,
    enviarFacturaAlCliente,
    renovarRecaudo,
    emitirFacturaDeOrden,
    consultarOrden,
    marcarPagada,
    registrarEvento,
    resolverItems,
    calcularTotales,
    OrdenError,
    TASA_IVA,
};
