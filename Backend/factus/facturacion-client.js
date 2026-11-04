// =====================================================================
//  Cliente de Factus Facturación (API v2)
//
//  Emite la factura electrónica ante la DIAN. Es una API DISTINTA de
//  Factus Pay: otra URL, otras credenciales y otro modelo de token.
//
//    Pay          POST /auth          token que no expira
//    Facturación  POST /oauth/token   access_token de 1 hora, con refresh
// =====================================================================

const baseUrl = () => process.env.FACTUS_API_BASE_URL || 'https://api-sandbox.factus.com.co';
const clientId = () => process.env.FACTUS_CLIENT_ID;
const clientSecret = () => process.env.FACTUS_CLIENT_SECRET;
const usuario = () => process.env.FACTUS_USERNAME;
const contrasena = () => process.env.FACTUS_PASSWORD;
const timeoutMs = () => parseInt(process.env.FACTUS_TIMEOUT_MS || '20000', 10);

// Token en memoria con su caducidad. A diferencia de Pay, este expira,
// así que se guarda cuándo.
let token = null;
let expiraEn = 0;
let autenticacionEnCurso = null;

class FacturacionError extends Error {
    constructor(mensaje, { status = null, cuerpo = null, transitorio = false } = {}) {
        super(mensaje);
        this.name = 'FacturacionError';
        this.status = status;
        this.cuerpo = cuerpo;
        this.transitorio = transitorio;
    }
}

async function peticion(ruta, opciones = {}) {
    const controlador = new AbortController();
    const limite = timeoutMs();
    const temporizador = setTimeout(() => controlador.abort(), limite);

    try {
        const respuesta = await fetch(baseUrl() + ruta, {
            ...opciones,
            signal: controlador.signal,
            headers: { 'Accept': 'application/json', ...(opciones.headers || {}) },
        });

        const texto = await respuesta.text();
        let cuerpo = null;
        if (texto) {
            try { cuerpo = JSON.parse(texto); }
            catch (e) { cuerpo = { message: texto.slice(0, 300) }; }
        }
        return { status: respuesta.status, ok: respuesta.ok, cuerpo };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new FacturacionError(
                `Factus Facturación no respondió en ${limite} ms`, { transitorio: true }
            );
        }
        throw new FacturacionError(
            `No se pudo conectar con Factus Facturación: ${error.message}`, { transitorio: true }
        );
    } finally {
        clearTimeout(temporizador);
    }
}

function faltanCredenciales() {
    return !clientId() || !clientSecret() || !usuario() || !contrasena();
}

async function autenticar() {
    if (faltanCredenciales()) {
        throw new FacturacionError(
            'Faltan credenciales de Factus Facturación (FACTUS_CLIENT_ID, ' +
            'FACTUS_CLIENT_SECRET, FACTUS_USERNAME, FACTUS_PASSWORD)'
        );
    }

    // Este endpoint acepta JSON, aunque OAuth2 suele usar form-urlencoded.
    const { status, ok, cuerpo } = await peticion('/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'password',
            client_id: clientId(),
            client_secret: clientSecret(),
            username: usuario(),
            password: contrasena(),
        }),
    });

    if (!ok || !cuerpo || !cuerpo.access_token) {
        throw new FacturacionError(
            `No se pudo autenticar en Factus Facturación (${status})`,
            { status, cuerpo, transitorio: status >= 500 }
        );
    }

    token = cuerpo.access_token;
    // Se renueva un minuto antes de que caduque, por el tiempo de red.
    const segundos = Number(cuerpo.expires_in) || 3600;
    expiraEn = Date.now() + (segundos - 60) * 1000;

    console.log('[factus-fact] Autenticado, el token dura', segundos, 's');
    return token;
}

async function obtenerToken() {
    if (token && Date.now() < expiraEn) return token;

    if (!autenticacionEnCurso) {
        autenticacionEnCurso = autenticar().finally(() => {
            autenticacionEnCurso = null;
        });
    }
    return autenticacionEnCurso;
}

async function peticionAutenticada(ruta, opciones = {}, yaReintentado = false) {
    const t = await obtenerToken();

    const resultado = await peticion(ruta, {
        ...opciones,
        headers: { ...(opciones.headers || {}), 'Authorization': `Bearer ${t}` },
    });

    if (resultado.status === 401 && !yaReintentado) {
        console.warn('[factus-fact] Token rechazado, reautenticando');
        token = null;
        expiraEn = 0;
        return peticionAutenticada(ruta, opciones, true);
    }

    return resultado;
}

// ---------------------------------------------------------------------
//  Rangos de numeración
//
//  numbering_range_id solo es obligatorio si la empresa tiene más de un
//  rango activo. Se consulta una vez y se recuerda.
// ---------------------------------------------------------------------
let rangoEnCache = null;

async function obtenerRangoNumeracion() {
    if (process.env.FACTUS_NUMBERING_RANGE_ID) {
        return parseInt(process.env.FACTUS_NUMBERING_RANGE_ID, 10);
    }
    if (rangoEnCache) return rangoEnCache;

    const { ok, cuerpo } = await peticionAutenticada('/v2/numbering-ranges');
    if (!ok) return null;

    const lista = (cuerpo && cuerpo.data && cuerpo.data.data) || (cuerpo && cuerpo.data) || [];
    // Se busca un rango de factura de venta que esté activo.
    const factura = lista.find((r) =>
        r.is_active && /factura/i.test(String(r.document || ''))
    ) || lista.find((r) => r.is_active) || lista[0];

    if (factura && factura.id) {
        rangoEnCache = factura.id;
        console.log('[factus-fact] Rango de numeración:', factura.id, '-', factura.document);
    }
    return rangoEnCache;
}

// ---------------------------------------------------------------------
//  Emitir y validar una factura
//
//  Es idempotente por reference_code: si esa referencia ya se facturó,
//  la API devuelve la factura existente en vez de crear otra.
// ---------------------------------------------------------------------
async function emitirFactura({ referencia, cliente, items, total, observacion }) {
    const rango = await obtenerRangoNumeracion();

    const cuerpoFactura = {
        reference_code: referencia,
        document: '01',          // factura de venta
        operation_type: '10',    // estándar
        // En sandbox el envío de correo está deshabilitado.
        send_email: false,
        observation: (observacion || `Prestige Barbers ${referencia}`).slice(0, 500),

        payment_details: [{
            payment_form: '1',          // contado
            payment_method_code: '47',  // transferencia (Bre-B)
            reference_code: referencia,
            amount: Number(total).toFixed(2),
        }],

        customer: {
            identification_document_code: cliente.tipo_documento || '13',
            identification: cliente.documento,
            legal_organization_code: '2',  // persona natural
            tribute_code: 'ZZ',            // no aplica
            names: cliente.nombre,
            email: cliente.email || undefined,
            phone: cliente.telefono || undefined,
            address: cliente.direccion || undefined,
            municipality_code: process.env.FACTUS_DEFAULT_MUNICIPALITY_CODE || undefined,
        },

        items: items.map((i) => ({
            code_reference: i.codigo_referencia,
            name: i.nombre,
            quantity: Number(i.cantidad),
            // Precio unitario SIN impuestos: la DIAN quiere la base.
            price: Number(i.precio_neto_unitario).toFixed(2),
            discount_rate: '0.00',
            // La API v2 pide estos dos como código (string), no como id
            // numérico: lo confirma su error de validación.
            unit_measure_code: '94',  // unidad
            standard_code: '999',     // adopción del contribuyente
            is_excluded: 0,
            withholding_taxes: [],
            taxes: [{ code: '01', rate: Number(i.tasa_impuesto).toFixed(2) }],
        })),
    };

    if (rango) cuerpoFactura.numbering_range_id = rango;

    const { status, ok, cuerpo } = await peticionAutenticada('/v2/bills/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoFactura),
    });

    if (!ok) {
        throw new FacturacionError(
            `La DIAN rechazó la factura (${status}): ` +
            (cuerpo && (cuerpo.message || JSON.stringify(cuerpo).slice(0, 200))),
            { status, cuerpo, transitorio: status >= 500 }
        );
    }

    const datos = (cuerpo && cuerpo.data) || {};
    const bill = datos.bill || datos;

    const factura = extraerFactura(bill, cuerpo && cuerpo.message);

    // La respuesta de validate no siempre trae links ni la resolución.
    // Si falta el QR, se consulta la factura ya emitida, que sí los da.
    if (factura.numero && !factura.qrUrl) {
        try {
            const completa = await consultarFactura(factura.numero);
            if (completa) {
                const extra = extraerFactura(completa, factura.mensaje);
                return { ...factura, ...extra, mensaje: factura.mensaje };
            }
        } catch (error) {
            // Que falle esto no invalida la factura, que ya está emitida.
            console.warn('[factus-fact] No se pudieron completar los datos:', error.message);
        }
    }

    return factura;
}

// ---------------------------------------------------------------------
//  Extraer los datos de una factura
//
//  La DIAN exige en la representación gráfica bastante más que el
//  número: la resolución de numeración, el QR de consulta, el desglose
//  de impuestos y los datos del emisor y del comprador.
//
//  El QR y la URL pública vienen dentro de `links`, no en la raíz: ese
//  detalle hacía que se guardaran como null.
// ---------------------------------------------------------------------
function extraerFactura(bill, mensaje) {
    const links = bill.links || {};
    const rango = bill.numbering_range || {};
    const totales = bill.totales || bill.totals || {};

    const resolucion = rango.resolution_number
        ? `${rango.resolution_number} (${rango.prefix || ''} ${rango.from || ''}-${rango.to || ''})`.trim()
        : null;

    return {
        numero: bill.number || bill.name || null,
        cufe: bill.cufe || null,
        // El QR de la DIAN: con él se verifica la factura en su catálogo.
        qrUrl: links.qr || bill.qr || null,
        publicUrl: links.public_url || bill.public_url || null,
        resolucion,
        validadaEn: bill.validated_at || bill.validated || bill.created_at || null,
        esValidada: bill.is_validated === true || bill.is_validated === 'true',
        // Totales con el desglose que pide el Art. 617
        totales: {
            base: totales.taxable_amount || totales.gross_amount || null,
            impuestos: totales.tax_amount || null,
            total: totales.total || null,
        },
        impuestos: bill.taxes || [],
        emisor: bill.company || null,
        comprador: bill.customer || null,
        items: bill.items || [],
        // La respuesta completa, para no perder nada de lo validado.
        crudo: bill,
        mensaje,
    };
}

// ---------------------------------------------------------------------
//  Enviar la factura por correo
//
//  El campo send_email de /v2/bills/validate solo funciona en
//  producción: Factus lo tiene deshabilitado en sandbox. Este endpoint
//  es la vía explícita, y se intenta igualmente para que el flujo quede
//  completo en cuanto se pase a producción.
// ---------------------------------------------------------------------
async function enviarFacturaPorCorreo(numero, email) {
    if (!numero || !email) {
        throw new FacturacionError('Hacen falta el número de factura y el correo');
    }

    const { status, ok, cuerpo } = await peticionAutenticada(
        `/v2/bills/${encodeURIComponent(numero)}/send-email`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        }
    );

    if (!ok) {
        throw new FacturacionError(
            `No se pudo enviar la factura por correo: ` +
            ((cuerpo && cuerpo.message) || `código ${status}`),
            { status, cuerpo, transitorio: status >= 500 }
        );
    }

    return { enviado: true, mensaje: cuerpo && cuerpo.message };
}

async function consultarFactura(numero) {
    const { status, ok, cuerpo } = await peticionAutenticada(
        '/v2/bills/' + encodeURIComponent(numero)
    );
    if (status === 404) return null;
    if (!ok) {
        throw new FacturacionError(`No se pudo consultar la factura (${status})`, { status, cuerpo });
    }
    return (cuerpo && cuerpo.data) || null;
}

function _limpiarCache() {
    token = null;
    expiraEn = 0;
    rangoEnCache = null;
}

module.exports = {
    emitirFactura,
    enviarFacturaPorCorreo,
    consultarFactura,
    obtenerRangoNumeracion,
    FacturacionError,
    _limpiarCache,
};
