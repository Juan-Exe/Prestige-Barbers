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

        async (req, res) => {
            if (errores(req, res)) return;

            try {
                // Los datos del cliente salen de su sesión, no del
                // cuerpo de la petición.
                const filas = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT id, nombre_completo, email, telefono FROM usuarios WHERE id = ?',
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

                const resultado = await ordenes.crearOrden(db, {
                    usuarioId: usuario.id,
                    reservaId: req.body.reserva_id || null,
                    cliente: {
                        nombre: usuario.nombre_completo,
                        email: usuario.email,
                        telefono: usuario.telefono,
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
    //  GET /api/factus/mis-ordenes
    // -----------------------------------------------------------------
    router.get('/mis-ordenes', verificarToken, async (req, res) => {
        try {
            const filas = await new Promise((resolve, reject) => {
                db.query(`
                    SELECT referencia, tipo, estado, total, created_at
                      FROM facturacion_ordenes
                     WHERE usuario_id = ?
                     ORDER BY id DESC
                     LIMIT 50
                `, [req.userId], (err, r) => (err ? reject(err) : resolve(r)));
            });

            return res.json({
                success: true,
                ordenes: filas.map((o) => ({
                    referencia: o.referencia,
                    tipo: o.tipo,
                    estado: o.estado,
                    total: Number(o.total).toFixed(2),
                    creada_en: o.created_at,
                })),
            });
        } catch (error) {
            return responderError(res, error, 'listar órdenes');
        }
    });

    return router;
}

module.exports = { construirRutas };
