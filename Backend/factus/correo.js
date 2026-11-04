// =====================================================================
//  Envío de la factura por correo
//
//  Factus tiene su propio endpoint de envío, pero en sandbox solo
//  manda a una lista blanca que no podemos editar: responde
//  "El correo no esta autorizado para recibir correos en el entorno
//  sandbox" para cualquier dirección.
//
//  Lo que sí nos entrega es el PDF y el XML de la factura validada.
//  Así que el correo lo mandamos nosotros, con los dos adjuntos. Eso
//  funciona igual en sandbox y en producción, a cualquier dirección.
//
//  Sin dependencias: SMTP sobre TLS con el módulo `tls` de Node.
// =====================================================================

const tls = require('tls');
const crypto = require('crypto');

const host = () => process.env.SMTP_HOST || 'smtp.gmail.com';
const puerto = () => parseInt(process.env.SMTP_PORT || '465', 10);
const usuario = () => process.env.SMTP_USER;
const clave = () => process.env.SMTP_PASS;
const remitente = () => process.env.SMTP_FROM || process.env.SMTP_USER;
const nombreRemitente = () => process.env.SMTP_FROM_NAME || 'Prestige Barbers';

class CorreoError extends Error {
    constructor(mensaje, transitorio = false) {
        super(mensaje);
        this.name = 'CorreoError';
        this.transitorio = transitorio;
    }
}

function hayCredenciales() {
    return Boolean(usuario() && clave());
}

// ---------------------------------------------------------------------
//  Diálogo SMTP
//
//  Cada comando espera una respuesta que empieza por un código de tres
//  cifras. 2xx y 3xx son correctos; 4xx es transitorio (reintentable)
//  y 5xx es definitivo.
// ---------------------------------------------------------------------
function dialogoSMTP(comandos) {
    return new Promise((resolve, reject) => {
        const socket = tls.connect({
            host: host(),
            port: puerto(),
            servername: host(),
        });

        let buffer = '';
        let paso = -1;          // -1 = esperando el saludo del servidor
        let terminado = false;

        const temporizador = setTimeout(() => {
            if (terminado) return;
            terminado = true;
            socket.destroy();
            reject(new CorreoError('El servidor de correo no respondió', true));
        }, 25000);

        function acabar(err) {
            if (terminado) return;
            terminado = true;
            clearTimeout(temporizador);
            try { socket.end(); } catch (e) {}
            err ? reject(err) : resolve();
        }

        socket.on('error', (e) => acabar(new CorreoError('Fallo de conexión: ' + e.message, true)));

        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');

            // Una respuesta termina cuando la última línea tiene un
            // espacio tras el código, no un guion.
            const lineas = buffer.split('\r\n').filter(Boolean);
            const ultima = lineas[lineas.length - 1] || '';
            if (!/^\d{3} /.test(ultima)) return;

            const codigo = parseInt(ultima.slice(0, 3), 10);
            buffer = '';

            if (codigo >= 400) {
                return acabar(new CorreoError(
                    'El servidor rechazó el envío: ' + ultima.trim(),
                    codigo < 500
                ));
            }

            paso++;
            if (paso >= comandos.length) return acabar(null);

            const cmd = comandos[paso];
            socket.write((typeof cmd === 'function' ? cmd() : cmd) + '\r\n');
        });
    });
}

// Codifica una cabecera con caracteres no ASCII (RFC 2047).
function cabecera(texto) {
    if (/^[\x20-\x7E]*$/.test(texto)) return texto;
    return '=?UTF-8?B?' + Buffer.from(texto, 'utf8').toString('base64') + '?=';
}

// El cuerpo en base64, partido en líneas de 76 caracteres como pide el
// estándar MIME.
function base64Lineas(buf) {
    const b = buf.toString('base64');
    const out = [];
    for (let i = 0; i < b.length; i += 76) out.push(b.slice(i, i + 76));
    return out.join('\r\n');
}

// ---------------------------------------------------------------------
//  Enviar la factura
// ---------------------------------------------------------------------
async function enviarFactura({ para, nombreCliente, numero, total, referencia, adjuntos }) {
    if (!hayCredenciales()) {
        throw new CorreoError(
            'Faltan SMTP_USER y SMTP_PASS en el entorno; no se puede enviar el correo'
        );
    }
    if (!para) throw new CorreoError('Falta el correo del destinatario');

    const limite = 'pb_' + crypto.randomBytes(16).toString('hex');
    const de = `${cabecera(nombreRemitente())} <${remitente()}>`;
    const asunto = cabecera(`Tu factura electrónica ${numero} — Prestige Barbers`);

    const totalTexto = Number(total).toLocaleString('es-CO', {
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    });

    const textoPlano = [
        `Hola ${nombreCliente || ''},`.trim(),
        '',
        'Adjuntamos tu factura electrónica de venta.',
        '',
        `Número de factura: ${numero}`,
        `Total: $${totalTexto} COP`,
        referencia ? `Referencia de la compra: ${referencia}` : '',
        '',
        'Se adjuntan el PDF (representación gráfica) y el XML validado',
        'ante la DIAN, que es el documento legal.',
        '',
        'Gracias por tu compra.',
        'Prestige Barbers',
    ].filter((l) => l !== null).join('\r\n');

    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #1b1b1b;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="background:#1b1b1b;padding:26px 32px;">
    <span style="color:#fff;font-size:19px;font-weight:bold;letter-spacing:2px;">PRESTIGE BARBERS</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <p style="margin:0 0 20px;font-size:15px;color:#1b1b1b;">Hola ${nombreCliente || ''},</p>
    <p style="margin:0 0 26px;font-size:15px;color:#333;line-height:1.6;">
      Adjuntamos tu factura electrónica de venta.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;background:#f9f9f9;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:11px;letter-spacing:1px;color:#666;text-transform:uppercase;">Factura electrónica</div>
        <div style="font-size:23px;font-weight:bold;color:#1b1b1b;margin-top:5px;">${numero}</div>
        <div style="font-size:15px;color:#333;margin-top:12px;">Total: <strong>$${totalTexto} COP</strong></div>
        ${referencia ? `<div style="font-size:12px;color:#999;margin-top:7px;">Referencia: ${referencia}</div>` : ''}
      </td></tr>
    </table>
    <p style="margin:26px 0 0;font-size:13px;color:#666;line-height:1.6;">
      Se adjuntan el PDF con la representación gráfica y el XML validado
      ante la DIAN, que es el documento legal.
    </p>
  </td></tr>
  <tr><td style="padding:18px 32px;border-top:1px solid #e0e0e0;font-size:12px;color:#999;">
    Gracias por tu compra.
  </td></tr>
</table>
</td></tr></table></body></html>`;

    // Construcción del mensaje MIME con adjuntos.
    const partes = [
        `From: ${de}`,
        `To: ${para}`,
        `Subject: ${asunto}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${limite}"`,
        '',
        `--${limite}`,
        `Content-Type: multipart/alternative; boundary="alt_${limite}"`,
        '',
        `--alt_${limite}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Lineas(Buffer.from(textoPlano, 'utf8')),
        '',
        `--alt_${limite}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Lineas(Buffer.from(html, 'utf8')),
        '',
        `--alt_${limite}--`,
    ];

    for (const a of (adjuntos || [])) {
        partes.push(
            `--${limite}`,
            `Content-Type: ${a.tipo || 'application/octet-stream'}; name="${a.nombre}"`,
            'Content-Transfer-Encoding: base64',
            `Content-Disposition: attachment; filename="${a.nombre}"`,
            '',
            base64Lineas(a.contenido),
            ''
        );
    }
    partes.push(`--${limite}--`, '');

    const mensaje = partes.join('\r\n');

    // Un punto al principio de línea marca el fin del mensaje en SMTP,
    // así que hay que duplicarlo (RFC 5321).
    const cuerpo = mensaje.replace(/\r\n\./g, '\r\n..');

    const autenticacion = Buffer.from(
        '\u0000' + usuario() + '\u0000' + clave(), 'utf8'
    ).toString('base64');

    await dialogoSMTP([
        'EHLO prestigebarber.store',
        'AUTH PLAIN ' + autenticacion,
        `MAIL FROM:<${remitente()}>`,
        `RCPT TO:<${para}>`,
        'DATA',
        () => cuerpo + '\r\n.',
        'QUIT',
    ]);

    return { enviado: true, para };
}

module.exports = { enviarFactura, hayCredenciales, CorreoError };
