// =====================================================================
//  Receptor del webhook de Factus Pay
//
//  Factus avisa aquí cuando un recaudo pasa a pagado. Dos cosas lo
//  hacen delicado:
//
//  1. La llave de autenticación viaja en la query string y no hay
//     firma HMAC. Quien la conozca puede enviar pagos falsos. Por eso
//     NINGÚN pago se acepta por lo que diga el webhook: se verifica
//     siempre contra GET /v1/collections/{referencia}.
//
//  2. Factus reintenta hasta 6 veces y corta a los 10 segundos. El
//     receptor debe responder rápido y ser idempotente: el mismo aviso
//     puede llegar varias veces.
// =====================================================================

const crypto = require('crypto');
const pay = require('./pay-client');
const ordenes = require('./ordenes');

// Compara dos cadenas en tiempo constante, para no filtrar información
// por cuánto tarda la comparación.
function llaveValida(recibida) {
    const esperada = process.env.FACTUS_PAY_WEBHOOK_KEY;

    if (!esperada) {
        console.error('[webhook] FACTUS_PAY_WEBHOOK_KEY no está configurada');
        return false;
    }
    if (!recibida || typeof recibida !== 'string') return false;

    const a = Buffer.from(String(recibida));
    const b = Buffer.from(String(esperada));

    // timingSafeEqual exige la misma longitud. Se comparan los hashes
    // para no revelar la longitud de la llave esperada.
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function consultar(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, filas) => (err ? reject(err) : resolve(filas)));
    });
}

// ---------------------------------------------------------------------
//  Manejador
//
//  Los códigos de respuesta no son decorativos: Factus reintenta ante
//  5xx y deja de intentarlo ante 2xx. Un 200 significa "recibido, no
//  insistas", aunque no hayamos hecho nada.
// ---------------------------------------------------------------------
function construirManejador(db) {
    return async function manejarWebhook(req, res) {
        const inicio = Date.now();

        // 1. Llave
        if (!llaveValida(req.query.key)) {
            console.warn(`[webhook] Llave inválida desde ${req.ip}`);
            return res.status(401).json({ success: false, message: 'No autorizado' });
        }

        const datos = (req.body && req.body.data) || {};
        const referencia = datos.reference_code;

        if (!referencia) {
            console.warn('[webhook] Aviso sin reference_code');
            // 200: el cuerpo es inválido, reintentar no va a arreglarlo.
            return res.status(200).json({ success: false, message: 'Sin referencia' });
        }

        try {
            // 2. Guardar el aviso tal cual llegó, antes de interpretarlo.
            //    Si algo falla después, queda constancia de lo recibido.
            await ordenes.registrarEvento(db, {
                referencia,
                fuente: 'pay',
                evento: 'webhook_recibido',
                resultado: 'ok',
                mensaje: `status=${datos.status}`,
                payload: req.body,
            });

            // 3. ¿Conocemos esta orden?
            const filas = await consultar(db,
                'SELECT * FROM facturacion_ordenes WHERE referencia = ?',
                [referencia]
            );

            if (filas.length === 0) {
                console.warn(`[webhook] Orden desconocida: ${referencia}`);
                await ordenes.registrarEvento(db, {
                    referencia, fuente: 'pay', evento: 'webhook_orden_desconocida',
                    resultado: 'error', mensaje: 'No existe esa orden',
                });
                // 200: la orden no existe y no va a aparecer. Que no insista.
                return res.status(200).json({ success: false, message: 'Orden desconocida' });
            }

            const orden = filas[0];

            // 4. Ya procesada: idempotencia.
            if (orden.estado === 'pagada' || orden.estado === 'facturada') {
                return res.status(200).json({
                    success: true, duplicate: true, message: 'Ya estaba pagada',
                });
            }

            // 5. VERIFICAR contra la API. Este es el paso que impide que
            //    alguien con la llave marque pagos falsos.
            let recaudo;
            try {
                recaudo = await pay.consultarRecaudo(referencia);
            } catch (error) {
                console.error(`[webhook] No se pudo verificar ${referencia}:`, error.message);
                await ordenes.registrarEvento(db, {
                    ordenId: orden.id, referencia, fuente: 'pay',
                    evento: 'webhook_verificacion_fallida',
                    resultado: 'error', mensaje: error.message,
                });
                // 500: fallo transitorio, que Factus reintente.
                return res.status(500).json({ success: false, message: 'Verificación fallida' });
            }

            if (!recaudo) {
                await ordenes.registrarEvento(db, {
                    ordenId: orden.id, referencia, fuente: 'pay',
                    evento: 'webhook_recaudo_inexistente',
                    resultado: 'error', mensaje: 'Factus no conoce esta referencia',
                });
                return res.status(200).json({ success: false, message: 'Recaudo inexistente' });
            }

            // 6. La API manda sobre lo que diga el aviso.
            if (recaudo.estado !== 'paid') {
                await ordenes.registrarEvento(db, {
                    ordenId: orden.id, referencia, fuente: 'pay',
                    evento: 'webhook_no_pagado', resultado: 'error',
                    mensaje: `El webhook dijo paid pero la API dice ${recaudo.estado}`,
                });
                return res.status(200).json({ success: false, message: 'No confirmado por la API' });
            }

            // 7. Marcar pagada. marcarPagada compara el monto y no hace
            //    nada si no coincide.
            const cambio = await ordenes.marcarPagada(db, orden, recaudo, 'webhook');

            if (!cambio) {
                return res.status(200).json({
                    success: false,
                    message: 'No se aplicó: monto distinto o ya procesada',
                });
            }

            await ordenes.registrarEvento(db, {
                ordenId: orden.id, referencia, fuente: 'pay',
                evento: 'orden_pagada', resultado: 'ok',
                mensaje: `Pagada por webhook, ${recaudo.monto} COP`,
            });

            console.log(`[webhook] ${referencia} pagada en ${Date.now() - inicio} ms`);

            // Aquí se dispararía la factura electrónica (fase 6).

            return res.status(200).json({ success: true, message: 'Procesado' });
        } catch (error) {
            console.error('[webhook] Error inesperado:', error.message);
            // 500 para que Factus reintente: puede ser un fallo pasajero
            // de la base de datos.
            return res.status(500).json({ success: false, message: 'Error interno' });
        }
    };
}

module.exports = { construirManejador, llaveValida };
