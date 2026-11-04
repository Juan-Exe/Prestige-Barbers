// =====================================================================
//  Rutas de Factus Pay
//
//  Se montan en /api/factus desde server.js. Reciben el `db` y los
//  middlewares de autenticación que ya existen en el proyecto, en vez
//  de crear los suyos.
// =====================================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');

const ordenes = require('./ordenes');
const webhook = require('./webhook');

function construirRutas({ db, verificarToken }) {
    const router = express.Router();

    // -----------------------------------------------------------------
    //  POST /api/factus/webhook/pay
    //
    //  Va ANTES del rate limit y sin JWT: lo llama Factus, no un
    //  usuario. Limitarlo haría que se perdieran avisos de pago, y
    //  Factus ya reintenta hasta 6 veces por su cuenta.
    //
    //  Se autentica con la llave de la query string, y aun así nada se
    //  da por pagado sin verificarlo contra la API.
    // -----------------------------------------------------------------
    router.post('/webhook/pay', webhook.construirManejador(db));

    // Límite propio para estas rutas: crear recaudos cuesta dinero
    // ($800 + IVA por transacción), así que nadie debe poder generarlos
    // en masa. Solo cuenta las escrituras.
    const limiteOrdenes = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: parseInt(process.env.FACTUS_RATE_LIMIT_MAX || '30', 10),
        skip: (req) => req.method === 'GET',
        message: {
            success: false,
            message: 'Demasiadas órdenes seguidas. Espera unos minutos.',
        },
        standardHeaders: true,
        legacyHeaders: false,
    });

    router.use(limiteOrdenes);

    function errores(req, res) {
        const r = validationResult(req);
        if (r.isEmpty()) return false;
        res.status(400).json({
            success: false,
            message: r.array()[0].msg,
            errors: r.array(),
        });
        return true;
    }

    function responderError(res, error, contexto) {
        if (error instanceof ordenes.OrdenError) {
            return res.status(error.status).json({
                success: false,
                message: error.message,
            });
        }
        console.error(`[factus-pay] ${contexto}:`, error.message);
        return res.status(500).json({
            success: false,
            message: 'Error interno al procesar la orden',
        });
    }

    // -----------------------------------------------------------------
    //  POST /api/factus/ordenes
    //
    //  Crea la orden y su recaudo. Devuelve el QR para pagar.
    // -----------------------------------------------------------------
    router.post('/ordenes',
        verificarToken,
        body('items')
            .isArray({ min: 1, max: 50 })
            .withMessage('Se necesita al menos un ítem'),
        body('items.*.tipo')
            .isIn(['producto', 'servicio_corte', 'servicio_barba'])
            .withMessage('Tipo de ítem inválido'),
        body('items.*.id')
            .isInt({ min: 1 })
            .withMessage('Id de ítem inválido'),
        body('items.*.cantidad')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('La cantidad debe estar entre 1 y 100'),
        body('reserva_id')
            .optional({ nullable: true })
            .isInt({ min: 1 })
            .withMessage('reserva_id inválido'),
        // Documento del comprador: la DIAN lo exige para facturar.
        body('documento')
            .optional({ checkFalsy: true })
            .trim()
            .matches(/^[0-9]{5,15}$/)
            .withMessage('El documento debe tener entre 5 y 15 dígitos, sin puntos ni guiones'),
        body('tipo_documento')
            .optional({ checkFalsy: true })
            .isIn(['13', '31', '22', '41'])
            .withMessage('Tipo de documento inválido'),

        async (req, res) => {
            if (errores(req, res)) return;

            try {
                // Los datos del cliente salen de su sesión, no del
                // cuerpo de la petición.
                const filas = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT id, nombre_completo, email, telefono, ' +
                        'tipo_documento, documento, direccion FROM usuarios WHERE id = ?',
                        [req.userId],
                        (err, r) => (err ? reject(err) : resolve(r))
                    );
                });

                if (filas.length === 0) {
                    return res.status(401).json({
                        success: false,
                        message: 'Usuario no encontrado',
                    });
                }

                const usuario = filas[0];

                // El documento llega en la petición o ya está en el perfil.
                const documento = (req.body.documento || '').trim() || usuario.documento;
                const tipoDocumento = req.body.tipo_documento || usuario.tipo_documento || '13';

                if (!documento) {
                    return res.status(400).json({
                        success: false,
                        message: 'Necesitamos tu número de documento para emitir la factura',
                        requiere_documento: true,
                    });
                }

                // Si es nuevo, se guarda para no pedirlo en cada compra.
                if (documento !== usuario.documento) {
                    await new Promise((resolve) => {
                        db.query(
                            'UPDATE usuarios SET documento = ?, tipo_documento = ? WHERE id = ?',
                            [documento, tipoDocumento, usuario.id],
                            () => resolve()
                        );
                    });
                }

                const resultado = await ordenes.crearOrden(db, {
                    usuarioId: usuario.id,
                    reservaId: req.body.reserva_id || null,
                    cliente: {
                        nombre: usuario.nombre_completo,
                        email: usuario.email,
                        telefono: usuario.telefono,
                        tipo_documento: tipoDocumento,
                        documento,
                        direccion: usuario.direccion,
                    },
                    items: req.body.items,
                });

                return res.status(201).json({ success: true, ...resultado });
            } catch (error) {
                return responderError(res, error, 'crear orden');
            }
        }
    );

    // -----------------------------------------------------------------
    //  GET /api/factus/ordenes/:referencia
    // -----------------------------------------------------------------
    router.get('/ordenes/:referencia',
        verificarToken,
        param('referencia')
            .isLength({ min: 3, max: 100 })
            .matches(/^[A-Z0-9-]+$/i)
            .withMessage('Referencia inválida'),

        async (req, res) => {
            if (errores(req, res)) return;

            try {
                const filas = await new Promise((resolve, reject) => {
                    db.query('SELECT rol FROM usuarios WHERE id = ?', [req.userId],
                        (err, r) => (err ? reject(err) : resolve(r)));
                });
                const esAdmin = filas.length > 0 && filas[0].rol === 'admin';

                const orden = await ordenes.consultarOrden(db, req.params.referencia, {
                    usuarioId: req.userId,
                    esAdmin,
                });

                return res.json({ success: true, ...orden });
            } catch (error) {
                return responderError(res, error, 'consultar orden');
            }
        }
    );

    // -----------------------------------------------------------------
    //  POST /api/factus/ordenes/:referencia/renovar-qr
    //
    //  Cuando el QR vence, Factus permite renovarlo reenviando el mismo
    //  reference_code con el mismo monto. No crea otro cobro ni vuelve
    //  a cobrar la tarifa.
    // -----------------------------------------------------------------
    router.post('/ordenes/:referencia/renovar-qr',
        verificarToken,
        param('referencia').isLength({ min: 3, max: 100 }).matches(/^[A-Z0-9-]+$/i),

        async (req, res) => {
            if (errores(req, res)) return;

            try {
                const filas = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT * FROM facturacion_ordenes WHERE referencia = ?',
                        [req.params.referencia],
                        (err, r) => (err ? reject(err) : resolve(r))
                    );
                });

                if (filas.length === 0) {
                    return res.status(404).json({ success: false, message: 'Orden no encontrada' });
                }

                const orden = filas[0];
                if (orden.usuario_id !== req.userId) {
                    return res.status(403).json({ success: false, message: 'No es tu orden' });
                }

                if (orden.estado === 'pagada' || orden.estado === 'facturada') {
                    return res.status(409).json({
                        success: false,
                        message: 'Esta compra ya está pagada',
                    });
                }

                const resultado = await ordenes.renovarRecaudo(db, orden);
                return res.json({ success: true, ...resultado });
            } catch (error) {
                return responderError(res, error, 'renovar QR');
            }
        }
    );

    // -----------------------------------------------------------------
    //  POST /api/factus/ordenes/:referencia/reintentar-factura
    //
    //  Para órdenes en error_factura: el pago entró pero la factura
    //  falló. No vuelve a cobrar.
    // -----------------------------------------------------------------
    router.post('/ordenes/:referencia/reintentar-factura',
        verificarToken,
        param('referencia').isLength({ min: 3, max: 100 }).matches(/^[A-Z0-9-]+$/i),

        async (req, res) => {
            if (errores(req, res)) return;

            try {
                const filas = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT id, usuario_id, estado FROM facturacion_ordenes WHERE referencia = ?',
                        [req.params.referencia],
                        (err, r) => (err ? reject(err) : resolve(r))
                    );
                });

                if (filas.length === 0) {
                    return res.status(404).json({ success: false, message: 'Orden no encontrada' });
                }

                const orden = filas[0];
                if (orden.usuario_id !== req.userId) {
                    return res.status(403).json({ success: false, message: 'No es tu orden' });
                }

                const resultado = await ordenes.emitirFacturaDeOrden(db, orden.id);

                if (resultado && resultado.numero) {
                    return res.json({
                        success: true,
                        message: `Factura ${resultado.numero} emitida`,
                        factura: resultado,
                    });
                }

                return res.status(502).json({
                    success: false,
                    message: (resultado && resultado.error) || 'No se pudo emitir la factura',
                });
            } catch (error) {
                return responderError(res, error, 'reintentar factura');
            }
        }
    );

    // -----------------------------------------------------------------
    //  POST /api/factus/ordenes/:referencia/reenviar-factura
    //
    //  Para cuando el envío automático falló: en sandbox, porque el
    //  correo no está en la lista autorizada de Factus.
    // -----------------------------------------------------------------
    router.post('/ordenes/:referencia/reenviar-factura',
        verificarToken,
        param('referencia').isLength({ min: 3, max: 100 }).matches(/^[A-Z0-9-]+$/i),
        body('email').optional({ checkFalsy: true }).isEmail().normalizeEmail(),

        async (req, res) => {
            if (errores(req, res)) return;

            try {
                const filas = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT * FROM facturacion_ordenes WHERE referencia = ?',
                        [req.params.referencia],
                        (err, r) => (err ? reject(err) : resolve(r))
                    );
                });

                if (filas.length === 0) {
                    return res.status(404).json({ success: false, message: 'Orden no encontrada' });
                }

                const orden = filas[0];
                if (orden.usuario_id !== req.userId) {
                    return res.status(403).json({ success: false, message: 'No es tu orden' });
                }
                if (!orden.factus_number) {
                    return res.status(400).json({
                        success: false,
                        message: 'Esta orden todavía no tiene factura',
                    });
                }

                const destino = req.body.email || orden.cliente_email;
                if (!destino) {
                    return res.status(400).json({ success: false, message: 'Falta el correo' });
                }

                const facturacion = require('./facturacion-client');
                await facturacion.enviarFacturaPorCorreo(orden.factus_number, destino);

                return res.json({
                    success: true,
                    message: `Factura ${orden.factus_number} enviada a ${destino}`,
                });
            } catch (error) {
                return res.status(502).json({
                    success: false,
                    message: error.message,
                });
            }
        }
    );

    // -----------------------------------------------------------------
    //  GET /api/factus/mis-ordenes
    // -----------------------------------------------------------------
    router.get('/mis-ordenes', verificarToken, async (req, res) => {
        try {
            const filas = await new Promise((resolve, reject) => {
                db.query(`
                    SELECT id, referencia, tipo, estado, total, subtotal, impuestos,
                           reserva_id, cliente_nombre, cliente_documento,
                           cliente_tipo_documento,
                           factus_number, factus_cufe, factus_public_url,
                           factus_qr_url, factus_resolucion,
                           factus_validated_at, pay_paid_at, created_at
                      FROM facturacion_ordenes
                     WHERE usuario_id = ?
                     ORDER BY id DESC
                     LIMIT 50
                `, [req.userId], (err, r) => (err ? reject(err) : resolve(r)));
            });

            // Los ítems de todas las órdenes en una sola consulta, para
            // no hacer una por cada una.
            const ids = filas.map((o) => o.id);
            let items = [];
            if (ids.length > 0) {
                items = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT orden_id, nombre, cantidad, precio_bruto_unitario, total_linea ' +
                        'FROM facturacion_orden_items WHERE orden_id IN (?)',
                        [ids],
                        (err, r) => (err ? reject(err) : resolve(r))
                    );
                });
            }

            const porOrden = {};
            for (const i of items) {
                (porOrden[i.orden_id] = porOrden[i.orden_id] || []).push({
                    nombre: i.nombre,
                    cantidad: Number(i.cantidad),
                    precio: Number(i.precio_bruto_unitario).toFixed(2),
                    total: Number(i.total_linea).toFixed(2),
                });
            }

            return res.json({
                success: true,
                ordenes: filas.map((o) => ({
                    referencia: o.referencia,
                    tipo: o.tipo,
                    estado: o.estado,
                    total: Number(o.total).toFixed(2),
                    subtotal: Number(o.subtotal).toFixed(2),
                    impuestos: Number(o.impuestos).toFixed(2),
                    reserva_id: o.reserva_id,
                    creada_en: o.created_at,
                    pagada_en: o.pay_paid_at,
                    items: porOrden[o.id] || [],
                    // Lo que exige el Art. 617 para la representación
                    // gráfica: número, CUFE, resolución, QR de la DIAN
                    // y el desglose del impuesto.
                    factura: o.factus_number ? {
                        numero: o.factus_number,
                        cufe: o.factus_cufe,
                        public_url: o.factus_public_url,
                        qr_url: o.factus_qr_url,
                        resolucion: o.factus_resolucion,
                        validada_en: o.factus_validated_at,
                        comprador: {
                            nombre: o.cliente_nombre,
                            documento: o.cliente_documento,
                            tipo_documento: o.cliente_tipo_documento,
                        },
                    } : null,
                })),
            });
        } catch (error) {
            return responderError(res, error, 'listar órdenes');
        }
    });

    return router;
}

module.exports = { construirRutas };
