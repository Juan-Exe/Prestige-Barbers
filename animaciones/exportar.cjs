// =====================================================================
//  Exportador de planos
//
//  No graba: RENDERIZA. Para cada fotograma le pide al motor la escena
//  en un instante exacto y guarda el PNG. Después los une con ffmpeg.
//
//  La diferencia importa. MediaRecorder (la vía evidente) graba en
//  tiempo real y sella cada fotograma con el reloj del sistema: si el
//  equipo se retrasa un milisegundo, ese fotograma queda desplazado.
//  El resultado tiene framerate variable y los editores de vídeo lo
//  rechazan. Aquí el instante 1.4667 s es el fotograma 44 de 30 fps,
//  calculado, no capturado.
//
//  Uso:
//    node exportar.cjs        → todos los planos
//    node exportar.cjs 2      → solo el plano 02
//    node exportar.cjs todo   → la secuencia completa en un archivo
// =====================================================================

const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const AQUI = __dirname;
const SALIDA = path.join(AQUI, 'exportado');
const TEMP = path.join(AQUI, '.fotogramas');
const FPS = 30;
const ANCHO = 1920, ALTO = 1080;

const CHROMES = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function buscarChrome() {
    for (const c of CHROMES) if (fs.existsSync(c)) return c;
    throw new Error('No se encontró Chrome ni Edge. Instala uno de los dos.');
}

function limpiar(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

// ---- Protocolo DevTools por WebSocket, sin dependencias ----
function pedirJSON(puerto, ruta) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: puerto, path: ruta }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => {
                try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Cliente mínimo del protocolo: envía comandos y espera su respuesta.
class Devtools {
    constructor(url) {
        this.url = url;
        this.id = 0;
        this.pendientes = new Map();
    }

    async conectar() {
        const { WebSocket } = await import('ws').catch(() => ({ WebSocket: null }));
        if (WebSocket) {
            this.ws = new WebSocket(this.url);
        } else {
            // Node 22 trae WebSocket nativo.
            this.ws = new global.WebSocket(this.url);
        }
        await new Promise((res, rej) => {
            this.ws.addEventListener('open', res, { once: true });
            this.ws.addEventListener('error', rej, { once: true });
        });
        this.ws.addEventListener('message', (ev) => {
            let m;
            try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.id && this.pendientes.has(m.id)) {
                const { resolve, reject } = this.pendientes.get(m.id);
                this.pendientes.delete(m.id);
                m.error ? reject(new Error(m.error.message)) : resolve(m.result);
            }
        });
    }

    envia(metodo, params) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pendientes.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method: metodo, params: params || {} }));
        });
    }

    cierra() { try { this.ws.close(); } catch (e) {} }
}

async function renderizaPlano(dt, indice, info, carpeta) {
    const total = Math.round(info.dur * FPS);
    process.stdout.write(`  ${String(info.id).padStart(2, '0')} · ${info.titulo}  `);

    for (let f = 0; f < total; f++) {
        const t = f / FPS;
        await dt.envia('Runtime.evaluate', {
            expression: `window.planos.fotograma(${indice}, ${t})`,
            awaitPromise: false,
        });

        const r = await dt.envia('Page.captureScreenshot', {
            format: 'png',
            clip: { x: 0, y: 0, width: ANCHO, height: ALTO, scale: 1 },
            captureBeyondViewport: true,
        });

        fs.writeFileSync(
            path.join(carpeta, String(f).padStart(5, '0') + '.png'),
            Buffer.from(r.data, 'base64')
        );

        if (f % 30 === 0) process.stdout.write('.');
    }
    process.stdout.write(` ${total} fotogramas\n`);
    return total;
}

function codifica(carpeta, destino) {
    // -fps_mode cfr fuerza framerate constante.
    // keyint=1:scenecut=0 hace que TODOS los fotogramas sean clave: el
    // archivo pesa más, pero el editor puede cortar en cualquier punto.
    const args = [
        '-y', '-framerate', String(FPS),
        '-i', path.join(carpeta, '%05d.png'),
        '-r', String(FPS),
        '-fps_mode', 'cfr',
        '-vf', 'format=yuv420p',
        '-c:v', 'libx264',
        '-preset', 'slow',
        '-crf', '16',
        '-profile:v', 'high',
        '-level', '4.2',
        '-x264-params', 'keyint=1:scenecut=0',
        '-color_range', 'tv',
        '-color_primaries', 'bt709',
        '-color_trc', 'bt709',
        '-colorspace', 'bt709',
        '-movflags', '+faststart',
        destino,
    ];
    execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

function verifica(archivo) {
    try {
        const out = execFileSync('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=profile,pix_fmt,color_range,r_frame_rate,nb_frames',
            '-of', 'csv=p=0', archivo,
        ]).toString().trim();
        return out;
    } catch (e) { return 'no verificable'; }
}

async function main() {
    const arg = (process.argv[2] || '').toLowerCase();
    const chrome = buscarChrome();

    fs.mkdirSync(SALIDA, { recursive: true });

    console.log('\nExportando planos de Penta{sys}4.0');
    console.log('Navegador:', path.basename(chrome), '\n');

    const puerto = 9222 + Math.floor(Math.random() * 500);
    const perfil = path.join(TEMP, 'perfil');
    limpiar(TEMP);

    const proc = spawn(chrome, [
        '--headless=new',
        `--remote-debugging-port=${puerto}`,
        `--user-data-dir=${perfil}`,
        `--window-size=${ANCHO},${ALTO}`,
        '--hide-scrollbars',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        'file:///' + path.join(AQUI, 'index.html').replace(/\\/g, '/'),
    ], { stdio: 'ignore' });

    // Esperar a que el navegador levante su endpoint.
    let destino = null;
    for (let i = 0; i < 40 && !destino; i++) {
        await esperar(250);
        try {
            const lista = await pedirJSON(puerto, '/json/list');
            destino = lista.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        } catch (e) {}
    }
    if (!destino) {
        proc.kill();
        throw new Error('El navegador no respondió. ¿Hay otro Chrome bloqueando el puerto?');
    }

    const dt = new Devtools(destino.webSocketDebuggerUrl);
    await dt.conectar();
    await dt.envia('Page.enable');
    await dt.envia('Runtime.enable');
    await esperar(900);  // que carguen las fuentes

    // Ocultar la interfaz antes de capturar nada.
    await dt.envia('Runtime.evaluate', {
        expression: 'window.planos && window.planos.modoExportacion()',
        returnByValue: true,
    });
    await esperar(250);

    const r = await dt.envia('Runtime.evaluate', {
        expression: 'window.planos ? window.planos.cuantos : 0',
        returnByValue: true,
    });
    const cuantos = r.result.value;
    if (!cuantos) {
        dt.cierra(); proc.kill();
        throw new Error('El motor no cargó. Revisa index.html.');
    }

    const indices = [];
    if (arg && arg !== 'todo') {
        const n = parseInt(arg, 10);
        for (let i = 0; i < cuantos; i++) {
            const inf = await dt.envia('Runtime.evaluate', {
                expression: `JSON.stringify(window.planos.info(${i}))`,
                returnByValue: true,
            });
            if (JSON.parse(inf.result.value).id === n) indices.push(i);
        }
        if (!indices.length) {
            dt.cierra(); proc.kill();
            throw new Error(`No existe el plano ${n}.`);
        }
    } else {
        for (let i = 0; i < cuantos; i++) indices.push(i);
    }

    const carpetas = [];
    for (const i of indices) {
        const inf = await dt.envia('Runtime.evaluate', {
            expression: `JSON.stringify(window.planos.info(${i}))`,
            returnByValue: true,
        });
        const info = JSON.parse(inf.result.value);
        const carpeta = path.join(TEMP, 'p' + info.id);
        limpiar(carpeta);
        await renderizaPlano(dt, i, info, carpeta);
        carpetas.push({ info, carpeta });
    }

    dt.cierra();
    proc.kill();
    await esperar(400);

    console.log('\nCodificando...\n');

    if (arg === 'todo') {
        // Secuencia completa: se renumeran los fotogramas en orden.
        const unida = path.join(TEMP, 'secuencia');
        limpiar(unida);
        let n = 0;
        for (const c of carpetas) {
            for (const f of fs.readdirSync(c.carpeta).sort()) {
                fs.copyFileSync(
                    path.join(c.carpeta, f),
                    path.join(unida, String(n++).padStart(5, '0') + '.png')
                );
            }
        }
        const dest = path.join(SALIDA, 'intro-completa.mp4');
        codifica(unida, dest);
        console.log('  intro-completa.mp4  ', verifica(dest));
    } else {
        for (const c of carpetas) {
            const nombre = String(c.info.id).padStart(2, '0') + '-' +
                c.info.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.mp4';
            const dest = path.join(SALIDA, nombre);
            codifica(c.carpeta, dest);
            console.log('  ' + nombre.padEnd(26), verifica(dest));
        }
    }

    fs.rmSync(TEMP, { recursive: true, force: true });

    console.log('\nListo. Los archivos están en:', SALIDA);
    console.log('Si ffprobe dice "High,yuv420p,tv" el archivo entra en cualquier editor.\n');
}

main().catch((e) => {
    console.error('\nError:', e.message, '\n');
    process.exit(1);
});
