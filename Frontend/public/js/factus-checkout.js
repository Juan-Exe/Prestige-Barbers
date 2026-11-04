// =====================================================================
//  Checkout con Factus Pay
//
//  Sustituye los modales de "compra realizada" que no cobraban nada.
//  El flujo real es: crear la orden -> mostrar el QR -> esperar a que
//  el pago entre -> confirmar.
//
//  Regla: el carrito NO se vacía hasta que la orden está pagada.
// =====================================================================

(function () {
    'use strict';

    const INTERVALO_SONDEO_MS = 4000;
    // Tras una hora sin pago se deja de preguntar: el QR ya venció.
    const MAXIMO_SONDEOS = 900;

    let sondeo = null;
    let cuentaAtras = null;
    let referenciaActual = null;

    // -----------------------------------------------------------------
    //  Modal
    // -----------------------------------------------------------------
    function crearModal() {
        let modal = document.getElementById('factusPagoModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'factusPagoModal';
        modal.className = 'factus-overlay';
        modal.innerHTML = `
            <div class="factus-modal" role="dialog" aria-modal="true" aria-labelledby="factusTitulo">
                <button class="factus-cerrar" id="factusCerrar" aria-label="Cerrar">&times;</button>

                <div class="factus-cuerpo" id="factusCuerpo">
                    <h2 class="factus-titulo" id="factusTitulo">Preparando el pago</h2>
                    <p class="factus-cargando">Un momento...</p>
                </div>
            </div>`;
        document.body.appendChild(modal);

        modal.querySelector('#factusCerrar').addEventListener('click', cerrar);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cerrar();
        });

        return modal;
    }

    function abrir() {
        crearModal().classList.add('activo');
        document.body.style.overflow = 'hidden';
    }

    function cerrar() {
        const modal = document.getElementById('factusPagoModal');
        if (modal) modal.classList.remove('activo');
        document.body.style.overflow = '';
        detenerSondeo();
        detenerCuentaAtras();
    }

    function pintar(html) {
        const cuerpo = document.getElementById('factusCuerpo');
        if (cuerpo) cuerpo.innerHTML = html;
    }

    function escapar(texto) {
        const d = document.createElement('div');
        d.textContent = texto == null ? '' : String(texto);
        return d.innerHTML;
    }

    function formatearPesos(valor) {
        return '$' + Number(valor).toLocaleString('es-CO', {
            minimumFractionDigits: 0, maximumFractionDigits: 0,
        });
    }

    // -----------------------------------------------------------------
    //  Pantallas
    // -----------------------------------------------------------------
    function pantallaQR(orden) {
        const qr = orden.qr
            ? `<img src="${orden.qr}" alt="Código QR para pagar" class="factus-qr">`
            : '<p class="factus-aviso">No se pudo generar el código QR</p>';

        pintar(`
            <h2 class="factus-titulo" id="factusTitulo">Escanea para pagar</h2>
            <p class="factus-monto">${formatearPesos(orden.total)}</p>

            ${qr}

            <p class="factus-instruccion">
                Abre tu app bancaria, escanea el código y confirma el pago.
            </p>

            <div class="factus-llave-bloque">
                <span class="factus-llave-etiqueta">O usa la llave Bre-B</span>
                <div class="factus-llave-fila">
                    <code class="factus-llave" id="factusLlave">${escapar(orden.breb_key || '')}</code>
                    <button class="factus-btn-copiar" id="factusCopiar">Copiar</button>
                </div>
            </div>

            <p class="factus-expira">
                El código vence en <strong id="factusCuentaAtras">--:--</strong>
            </p>

            <div class="factus-estado" id="factusEstado">
                <span class="factus-punto"></span> Esperando el pago
            </div>

            <div class="factus-acciones">
                <button class="factus-btn-secundario" id="factusYaPague">Ya pagué</button>
            </div>

            <p class="factus-referencia">Referencia: ${escapar(orden.referencia)}</p>
        `);

        const copiar = document.getElementById('factusCopiar');
        if (copiar) {
            copiar.addEventListener('click', () => {
                const llave = document.getElementById('factusLlave').textContent;
                navigator.clipboard.writeText(llave).then(() => {
                    copiar.textContent = 'Copiada';
                    setTimeout(() => { copiar.textContent = 'Copiar'; }, 2000);
                }).catch(() => {
                    copiar.textContent = 'No se pudo copiar';
                });
            });
        }

        const yaPague = document.getElementById('factusYaPague');
        if (yaPague) {
            yaPague.addEventListener('click', async () => {
                yaPague.disabled = true;
                yaPague.textContent = 'Comprobando...';
                await comprobarEstado(true);
                yaPague.disabled = false;
                yaPague.textContent = 'Ya pagué';
            });
        }

        if (orden.expira_en) iniciarCuentaAtras(orden.expira_en);
    }

    function pantallaPagado(orden) {
        detenerSondeo();
        detenerCuentaAtras();

        pintar(`
            <div class="factus-exito-icono">&#10003;</div>
            <h2 class="factus-titulo">Pago confirmado</h2>
            <p class="factus-monto">${formatearPesos(orden.total)}</p>
            <p class="factus-instruccion">
                Tu pago se recibió correctamente. Gracias por tu compra.
            </p>
            <p class="factus-referencia">Referencia: ${escapar(orden.referencia)}</p>
            <div class="factus-acciones">
                <button class="factus-btn-primario" id="factusListo">Continuar</button>
            </div>
        `);

        document.getElementById('factusListo').addEventListener('click', () => {
            cerrar();
            window.location.reload();
        });

        // Ahora sí: el pago está confirmado, el carrito se puede vaciar.
        if (window.carritoManager && typeof window.carritoManager.vaciarCarrito === 'function') {
            window.carritoManager.vaciarCarrito();
        }
    }

    function pantallaError(mensaje, permitirReintento) {
        detenerSondeo();
        detenerCuentaAtras();

        pintar(`
            <h2 class="factus-titulo">No se pudo completar el pago</h2>
            <p class="factus-aviso">${escapar(mensaje)}</p>
            <div class="factus-acciones">
                ${permitirReintento
                    ? '<button class="factus-btn-primario" id="factusReintentar">Reintentar</button>'
                    : ''}
                <button class="factus-btn-secundario" id="factusCerrarError">Cerrar</button>
            </div>
        `);

        const reintentar = document.getElementById('factusReintentar');
        if (reintentar) {
            reintentar.addEventListener('click', () => {
                if (window._factusUltimosItems) {
                    iniciarPago(window._factusUltimosItems);
                }
            });
        }
        document.getElementById('factusCerrarError').addEventListener('click', cerrar);
    }

    // -----------------------------------------------------------------
    //  Cuenta atrás
    // -----------------------------------------------------------------
    function iniciarCuentaAtras(expiraEn) {
        detenerCuentaAtras();
        const limite = new Date(expiraEn).getTime();
        if (isNaN(limite)) return;

        const pintarTiempo = () => {
            const restan = limite - Date.now();
            const el = document.getElementById('factusCuentaAtras');
            if (!el) return detenerCuentaAtras();

            if (restan <= 0) {
                el.textContent = '00:00';
                detenerCuentaAtras();
                detenerSondeo();
                const estado = document.getElementById('factusEstado');
                if (estado) {
                    estado.innerHTML = 'El código venció. Cierra y vuelve a intentarlo.';
                    estado.classList.add('factus-estado-vencido');
                }
                return;
            }

            const min = Math.floor(restan / 60000);
            const seg = Math.floor((restan % 60000) / 1000);
            el.textContent = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
        };

        pintarTiempo();
        cuentaAtras = setInterval(pintarTiempo, 1000);
    }

    function detenerCuentaAtras() {
        if (cuentaAtras) { clearInterval(cuentaAtras); cuentaAtras = null; }
    }

    // -----------------------------------------------------------------
    //  Sondeo del estado
    // -----------------------------------------------------------------
    function iniciarSondeo() {
        detenerSondeo();
        let veces = 0;
        sondeo = setInterval(async () => {
            veces += 1;
            if (veces > MAXIMO_SONDEOS) return detenerSondeo();
            await comprobarEstado(false);
        }, INTERVALO_SONDEO_MS);
    }

    function detenerSondeo() {
        if (sondeo) { clearInterval(sondeo); sondeo = null; }
    }

    async function comprobarEstado(manual) {
        if (!referenciaActual) return;

        try {
            const token = localStorage.getItem('auth_token');
            const r = await fetch(`/api/factus/ordenes/${encodeURIComponent(referenciaActual)}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });
            if (!r.ok) return;

            const orden = await r.json();

            if (orden.estado === 'pagada' || orden.estado === 'facturada') {
                pantallaPagado(orden);
            } else if (orden.estado === 'fallida') {
                pantallaError('El pago fue rechazado. Puedes intentarlo de nuevo.', true);
            } else if (orden.estado === 'expirada') {
                pantallaError('El código de pago venció. Genera uno nuevo.', true);
            } else if (manual) {
                const estado = document.getElementById('factusEstado');
                if (estado) {
                    estado.innerHTML = '<span class="factus-punto"></span> Todavía no nos consta el pago';
                }
            }
        } catch (error) {
            // Un fallo de red puntual no debe romper el sondeo.
            console.warn('[factus] No se pudo consultar el estado:', error.message);
        }
    }

    // -----------------------------------------------------------------
    //  Iniciar el pago
    // -----------------------------------------------------------------
    async function iniciarPago(items, reservaId) {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            if (window.customModal) {
                window.customModal.showAlert(
                    'Debes iniciar sesión para poder pagar', 'Inicia sesión'
                );
            }
            return;
        }

        window._factusUltimosItems = items;

        abrir();
        pintar(`
            <h2 class="factus-titulo">Preparando el pago</h2>
            <p class="factus-cargando">Generando tu código de pago...</p>
        `);

        try {
            const r = await fetch('/api/factus/ordenes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ items, reserva_id: reservaId || null }),
            });

            const datos = await r.json();

            if (!r.ok) {
                return pantallaError(
                    datos.message || 'No se pudo generar el cobro',
                    r.status >= 500 || r.status === 502
                );
            }

            referenciaActual = datos.referencia;
            pantallaQR(datos);
            iniciarSondeo();
        } catch (error) {
            pantallaError('No hay conexión con el servidor. Revisa tu internet.', true);
        }
    }

    // Lo que el resto del sitio usa.
    window.factusCheckout = {
        pagarItems: iniciarPago,
        pagarProducto: (id, cantidad) =>
            iniciarPago([{ tipo: 'producto', id: Number(id), cantidad: Number(cantidad) || 1 }]),
        pagarCarrito: (carrito) =>
            iniciarPago((carrito || []).map((p) => ({
                tipo: 'producto', id: Number(p.id), cantidad: Number(p.cantidad) || 1,
            }))),
        cerrar,
    };

    console.log('✅ Checkout de Factus Pay cargado');
})();
