// =====================================================================
//  Cliente de Factus Pay
//
//  Factus Pay cobra por QR Bre-B. Su API tiene cuatro endpoints y una
//  particularidad que condiciona todo este archivo:
//
//    El token NO expira por tiempo, pero cada POST /auth revoca el
//    anterior. Si dos procesos se autentican con el mismo usuario, se
//    invalidan mutuamente.
//
//  Por eso el token se cachea en memoria y solo se pide de nuevo cuando
//  la API responde 401. Con un unico contenedor de backend esto basta;
//  si algun dia hay varias instancias, habra que mover el token a un
//  almacen compartido (Redis) con un lock.
// =====================================================================

// Las variables se leen en cada llamada, no al cargar el modulo: asi el
// orden de los require() frente a dotenv.config() no cambia el resultado.
const baseUrl = () => process.env.FACTUS_PAY_BASE_URL || 'https://pay-api-sandbox.factus.com.co';
const email = () => process.env.FACTUS_PAY_EMAIL;
const password = () => process.env.FACTUS_PAY_PASSWORD;
const timeoutMs = () => parseInt(process.env.FACTUS_PAY_TIMEOUT_MS || '10000', 10);

// Limites del monto que impone Factus Pay (COP).
const MONTO_MINIMO = 1000;
const MONTO_MAXIMO = 12100000;

// Token en memoria del proceso. null = hay que autenticarse.
let tokenEnCache = null;
// Promesa de autenticacion en curso, para que varias peticiones
// simultaneas no disparen varios POST /auth (que se revocarian entre si).
let autenticacionEnCurso = null;

class FactusPayError extends Error {
    constructor(mensaje, { status = null, cuerpo = null, transitorio = false } = {}) {
        super(mensaje);
        this.name = 'FactusPayError';
        this.status = status;
        this.cuerpo = cuerpo;
        // transitorio = tiene sentido reintentar mas tarde (red, 5xx).
        this.transitorio = transitorio;
    }
}

function faltanCredenciales() {
    return !email() || !password();
}

// ---------------------------------------------------------------------
//  Peticion HTTP con timeout
// ---------------------------------------------------------------------
async function peticion(ruta, opciones = {}) {
    const controlador = new AbortController();
    const limite = timeoutMs();
    const temporizador = setTimeout(() => controlador.abort(), limite);

    try {
        const respuesta = await fetch(baseUrl() + ruta, {
            ...opciones,
            signal: controlador.signal,
            headers: {
                'Accept': 'application/json',
                ...(opciones.headers || {}),
            },
        });

        let cuerpo = null;
        const texto = await respuesta.text();
        if (texto) {
            try {
                cuerpo = JSON.parse(texto);
            } catch (e) {
                cuerpo = { message: texto.slice(0, 200) };
            }
        }

        return { status: respuesta.status, ok: respuesta.ok, cuerpo };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new FactusPayError(
                `Factus Pay no respondio en ${limite} ms`,
                { transitorio: true }
            );
        }
        // Fallo de red: el proceso no debe caerse por esto.
        throw new FactusPayError(
            `No se pudo conectar con Factus Pay: ${error.message}`,
            { transitorio: true }
        );
    } finally {
        clearTimeout(temporizador);
    }
}

// ---------------------------------------------------------------------
//  Autenticacion
// ---------------------------------------------------------------------
async function autenticar() {
    if (faltanCredenciales()) {
        throw new FactusPayError(
            'Faltan FACTUS_PAY_EMAIL o FACTUS_PAY_PASSWORD en el entorno'
        );
    }

    const { status, ok, cuerpo } = await peticion('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email(), password: password() }),
    });

    if (!ok) {
        // 429 y 5xx son transitorios; 401 y 422 son de configuracion.
        throw new FactusPayError(
            `Autenticacion rechazada por Factus Pay (${status})`,
            { status, cuerpo, transitorio: status === 429 || status >= 500 }
        );
    }

    // La respuesta real es {"token": "..."} sin anidar, aunque la
    // documentacion interna sugeria {"data": {"token": ...}}.
    const token = cuerpo && (cuerpo.token || (cuerpo.data && cuerpo.data.token));
    if (!token) {
        throw new FactusPayError('Factus Pay no devolvio token', { status, cuerpo });
    }

    tokenEnCache = token;
    console.log('[factus-pay] Autenticado correctamente');
    return token;
}

// Devuelve el token cacheado, autenticandose si hace falta. Si varias
// llamadas coinciden, todas esperan la misma autenticacion.
async function obtenerToken() {
    if (tokenEnCache) return tokenEnCache;

    // Se comprueba antes de tocar la red: si faltan credenciales, el
    // mensaje util es ese, no un "fetch failed" del DNS.
    if (faltanCredenciales()) {
        throw new FactusPayError(
            'Faltan FACTUS_PAY_EMAIL o FACTUS_PAY_PASSWORD en el entorno'
        );
    }

    if (!autenticacionEnCurso) {
        autenticacionEnCurso = autenticar().finally(() => {
            autenticacionEnCurso = null;
        });
    }
    return autenticacionEnCurso;
}

// ---------------------------------------------------------------------
//  Peticion autenticada, con un unico reintento ante 401
// ---------------------------------------------------------------------
async function peticionAutenticada(ruta, opciones = {}, yaReintentado = false) {
    const token = await obtenerToken();

    const resultado = await peticion(ruta, {
        ...opciones,
        headers: {
            ...(opciones.headers || {}),
            'Authorization': `Bearer ${token}`,
        },
    });

    // 401 = el token fue revocado (alguien mas se autentico con el mismo
    // usuario). Se invalida la cache y se reintenta UNA sola vez.
    if (resultado.status === 401 && !yaReintentado) {
        console.warn('[factus-pay] Token rechazado, reautenticando');
        tokenEnCache = null;
        return peticionAutenticada(ruta, opciones, true);
    }

    return resultado;
}

// ---------------------------------------------------------------------
//  Crear un recaudo
// ---------------------------------------------------------------------
async function crearRecaudo(referencia, monto, expiracionSegundos) {
    if (!referencia || typeof referencia !== 'string') {
        throw new FactusPayError('La referencia es obligatoria');
    }
    if (referencia.length > 100) {
        throw new FactusPayError('La referencia no puede pasar de 100 caracteres');
    }

    const montoNumero = Number(monto);
    if (!Number.isFinite(montoNumero)) {
        throw new FactusPayError('El monto no es un numero valido');
    }
    // Se valida antes de enviar: Factus no documenta el error de rango y
    // es mas claro fallar aqui con un mensaje propio.
    if (montoNumero < MONTO_MINIMO || montoNumero > MONTO_MAXIMO) {
        throw new FactusPayError(
            `El monto debe estar entre ${MONTO_MINIMO} y ${MONTO_MAXIMO} COP (recibido: ${montoNumero})`
        );
    }

    const expiracion = parseInt(
        expiracionSegundos || process.env.FACTUS_QR_EXPIRATION_SECONDS || '1800', 10
    );

    const { status, ok, cuerpo } = await peticionAutenticada('/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reference_code: referencia,
            amount: montoNumero,
            expiration: expiracion,
        }),
    });

    if (!ok) {
        // El motivo viene en el cuerpo. Sin él, un 422 no dice nada a
        // quien lee el log ni a quien está comprando.
        const motivo = (cuerpo && cuerpo.message) || `código ${status}`;
        throw new FactusPayError(
            `Factus Pay rechazó el recaudo: ${motivo}`,
            { status, cuerpo, transitorio: status >= 500 }
        );
    }

    const datos = (cuerpo && cuerpo.data) || {};
    return {
        referencia: datos.reference_code,
        monto: datos.amount,
        estado: datos.status,
        brebKey: datos.breb_key,
        qr: datos.qr || null,
        qrExpiraEn: datos.qr_expires_at || null,
        cobradoEn: datos.collected_at || null,
        // La API responde 200 "Recaudo ya existente" si la referencia ya
        // estaba creada. Es idempotencia nativa, no un error.
        yaExistia: status === 200,
        mensaje: cuerpo && cuerpo.message,
    };
}

// ---------------------------------------------------------------------
//  Consultar un recaudo
//
//  Esta es la llamada que confirma un pago. El webhook por si solo no
//  basta: su llave viaja en la query string y no hay firma, asi que
//  nada se da por pagado sin preguntarselo a la API.
// ---------------------------------------------------------------------
async function consultarRecaudo(referencia) {
    if (!referencia) {
        throw new FactusPayError('La referencia es obligatoria');
    }

    const { status, ok, cuerpo } = await peticionAutenticada(
        '/v1/collections/' + encodeURIComponent(referencia)
    );

    // 404 no es un error: el recaudo no existe y punto.
    if (status === 404) return null;

    if (!ok) {
        throw new FactusPayError(
            `No se pudo consultar el recaudo (${status})`,
            { status, cuerpo, transitorio: status >= 500 }
        );
    }

    const datos = (cuerpo && cuerpo.data) || {};
    return {
        referencia: datos.reference_code,
        monto: datos.amount,
        estado: datos.status,
        brebKey: datos.breb_key,
        qr: datos.qr || null,
        qrExpiraEn: datos.qr_expires_at || null,
        cobradoEn: datos.collected_at || null,
    };
}

// ---------------------------------------------------------------------
//  Listar recaudos pagados (para la conciliacion)
// ---------------------------------------------------------------------
async function listarPagados(pagina = 1) {
    const { status, ok, cuerpo } = await peticionAutenticada(
        `/v1/collections?status=paid&page=${encodeURIComponent(pagina)}`
    );

    if (!ok) {
        throw new FactusPayError(
            `No se pudieron listar los recaudos (${status})`,
            { status, cuerpo, transitorio: status >= 500 }
        );
    }

    const meta = (cuerpo && cuerpo.meta) || {};
    return {
        recaudos: ((cuerpo && cuerpo.data) || []).map((d) => ({
            referencia: d.reference_code,
            monto: d.amount,
            estado: d.status,
            brebKey: d.breb_key,
            cobradoEn: d.collected_at || null,
        })),
        paginaActual: meta.current_page || pagina,
        ultimaPagina: meta.last_page || 1,
        total: meta.total || 0,
    };
}

// ---------------------------------------------------------------------
//  Fechas de Factus: "04-11-2026 12:01:31 PM", hora de Colombia.
//  Tambien puede llegar ISO 8601, segun su documentacion. Se aceptan
//  los dos formatos y se devuelve un Date, o null si no se entiende.
// ---------------------------------------------------------------------
function parsearFecha(texto) {
    if (!texto) return null;

    const m = String(texto).match(
        /^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i
    );
    if (m) {
        const [, dia, mes, anio, hh, mm, ss, meridiano] = m;
        let hora = parseInt(hh, 10);
        if (meridiano) {
            const esPM = meridiano.toUpperCase() === 'PM';
            if (esPM && hora !== 12) hora += 12;
            if (!esPM && hora === 12) hora = 0;
        }
        // -05:00 es la hora de Colombia. Factus no declara zona horaria.
        const iso = `${anio}-${mes}-${dia}T${String(hora).padStart(2, '0')}:${mm}:${ss}-05:00`;
        const fecha = new Date(iso);
        return isNaN(fecha.getTime()) ? null : fecha;
    }

    const fecha = new Date(texto);
    return isNaN(fecha.getTime()) ? null : fecha;
}

// Solo para pruebas: olvida el token cacheado.
function _limpiarCache() {
    tokenEnCache = null;
    autenticacionEnCurso = null;
}

module.exports = {
    crearRecaudo,
    consultarRecaudo,
    listarPagados,
    parsearFecha,
    FactusPayError,
    MONTO_MINIMO,
    MONTO_MAXIMO,
    _limpiarCache,
};
