// ==================== SISTEMA DE CARRITO - PRESTIGE BARBERS ====================

class CarritoManager {
    constructor() {
        this.carrito = this.cargarCarrito();
        this.inicializar();
    }

    inicializar() {
        // Elementos del DOM
        this.carritoIcon = document.getElementById('carritoIcon');
        this.carritoModal = document.getElementById('carritoModal');
        this.closeCarritoBtn = document.getElementById('closeCarritoBtn');
        this.carritoItemsList = document.getElementById('carritoItemsList');
        this.carritoEmpty = document.getElementById('carritoEmpty');
        this.carritoFooter = document.getElementById('carritoFooter');
        this.carritoCount = document.getElementById('carritoCount');
        this.carritoTotal = document.getElementById('carritoTotal');
        this.carritoComprarBtn = document.getElementById('carritoComprarBtn');
        this.cartBadge = document.getElementById('cartBadge');

        // Event Listeners
        if (this.carritoIcon) {
            this.carritoIcon.addEventListener('click', (e) => {
                e.preventDefault();
                this.abrirCarrito();
            });
        }

        if (this.closeCarritoBtn) {
            this.closeCarritoBtn.addEventListener('click', () => {
                this.cerrarCarrito();
            });
        }

        // Cerrar al hacer clic en el overlay
        if (this.carritoModal) {
            this.carritoModal.addEventListener('click', (e) => {
                if (e.target === this.carritoModal) {
                    this.cerrarCarrito();
                }
            });
        }

        // Botón comprar del carrito
        if (this.carritoComprarBtn) {
            this.carritoComprarBtn.addEventListener('click', () => {
                this.comprarCarrito();
            });
        }

        // Actualizar UI inicial
        this.actualizarUI();
    }

    // Cargar carrito del localStorage
    cargarCarrito() {
        try {
            const carritoGuardado = localStorage.getItem('prestige_carrito');
            return carritoGuardado ? JSON.parse(carritoGuardado) : [];
        } catch (error) {
            console.error('Error al cargar carrito:', error);
            return [];
        }
    }

    // Guardar carrito en localStorage
    guardarCarrito() {
        try {
            localStorage.setItem('prestige_carrito', JSON.stringify(this.carrito));
        } catch (error) {
            console.error('Error al guardar carrito:', error);
        }
    }

    // Agregar producto al carrito
    agregarProducto(producto) {
        // Verificar si el producto ya existe
        const existe = this.carrito.find(item => item.id === producto.id);

        if (existe) {
            // Ya esta en el carrito: sumamos una unidad mas
            existe.cantidad = (existe.cantidad || 1) + 1;
            this.guardarCarrito();
            this.actualizarUI();
            this.mostrarNotificacion('Se agrego otra unidad al carrito', 'success');
            this.animarBadge();
            return true;
        }

        // Agregar producto
        this.carrito.push({
            id: producto.id,
            marca: producto.marca,
            nombre: producto.nombre,
            precio: producto.precio,
            imagen: producto.imagen,
            tamano: producto.tamano,
            cantidad: 1
        });

        this.guardarCarrito();
        this.actualizarUI();
        this.mostrarNotificacion('Producto agregado al carrito', 'success');
        
        // Animar el badge
        this.animarBadge();

        return true;
    }

    // Eliminar producto del carrito
    eliminarProducto(productoId) {
        this.carrito = this.carrito.filter(item => item.id !== productoId);
        this.guardarCarrito();
        this.actualizarUI();
        this.mostrarNotificacion('Producto eliminado del carrito');
    }

    // Obtener total del carrito
    obtenerTotal() {
        return this.carrito.reduce((total, item) => {
            const precio = parseFloat(item.precio) || 0;
            const cant = item.cantidad || 1;
            return total + (precio * cant);
        }, 0);
    }

    // Cambiar la cantidad de un producto (elimina si llega a 0)
    cambiarCantidad(productoId, delta) {
        const item = this.carrito.find(p => p.id === productoId);
        if (!item) return;

        item.cantidad = (item.cantidad || 1) + delta;

        if (item.cantidad < 1) {
            this.eliminarProducto(productoId);
            return;
        }

        this.guardarCarrito();
        this.actualizarUI();
    }

    // Obtener cantidad de productos
    obtenerCantidad() {
        return this.carrito.reduce((n, item) => n + (item.cantidad || 1), 0);
    }

    // Actualizar toda la interfaz
    actualizarUI() {
        this.actualizarBadge();
        this.actualizarListaCarrito();
    }

    // Actualizar badge del icono
    actualizarBadge() {
        const cantidad = this.obtenerCantidad();
        
        if (this.cartBadge) {
            if (cantidad > 0) {
                this.cartBadge.textContent = cantidad;
                this.cartBadge.style.display = 'flex';
            } else {
                this.cartBadge.style.display = 'none';
            }
        }
    }

    // Animar badge cuando se agrega producto
    animarBadge() {
        if (this.cartBadge) {
            this.cartBadge.style.animation = 'none';
            setTimeout(() => {
                this.cartBadge.style.animation = 'badgePop 0.3s ease';
            }, 10);
        }
    }

    // Actualizar lista de productos en el modal
    actualizarListaCarrito() {
        if (!this.carritoItemsList) return;

        const cantidad = this.obtenerCantidad();
        
        // Actualizar contador
        if (this.carritoCount) {
            this.carritoCount.textContent = cantidad;
        }

        // Si el carrito está vacío
        if (cantidad === 0) {
            // Crear HTML del estado vacío
            this.carritoItemsList.innerHTML = `
                <div class="carrito-empty" id="carritoEmpty">
                    <div class="carrito-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="9" cy="21" r="1"/>
                            <circle cx="20" cy="21" r="1"/>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                        </svg>
                    </div>
                    <p>Tu carrito está vacío</p>
                </div>
            `;
            
            // Actualizar referencia al elemento
            this.carritoEmpty = document.getElementById('carritoEmpty');
            
            if (this.carritoFooter) {
                this.carritoFooter.style.display = 'none';
            }
            return;
        }

        // Generar HTML de los items
        const itemsHTML = this.carrito.map(item => `
            <div class="carrito-item" data-id="${item.id}">
                <div class="carrito-item-img">
                    <img src="${item.imagen}" alt="${item.nombre}">
                </div>
                <div class="carrito-item-info">
                    <div class="carrito-item-marca">${item.marca}</div>
                    <div class="carrito-item-nombre">${item.nombre}</div>
                    <div class="carrito-item-tamano" style="font-size: 0.8em; color: #666;">${item.tamano}</div>
                    <div class="carrito-item-precio">$${this.formatearPrecio(item.precio * (item.cantidad || 1))}</div>
                    <div class="carrito-item-cantidad">
                        <button class="cant-btn" data-id="${item.id}" data-delta="-1" aria-label="Quitar una unidad">&minus;</button>
                        <span class="cant-valor">${item.cantidad || 1}</span>
                        <button class="cant-btn" data-id="${item.id}" data-delta="1" aria-label="Agregar una unidad">+</button>
                    </div>
                    <button class="carrito-item-remove" data-id="${item.id}">Eliminar</button>
                </div>
            </div>
        `).join('');

        this.carritoItemsList.innerHTML = itemsHTML;

        // Mostrar footer
        if (this.carritoFooter) {
            this.carritoFooter.style.display = 'block';
        }

        // Botones de cantidad (+ / -)
        this.carritoItemsList.querySelectorAll('.cant-btn').forEach(boton => {
            boton.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const delta = parseInt(e.currentTarget.dataset.delta);
                this.cambiarCantidad(id, delta);
            });
        });

        // Agregar event listeners a botones de eliminar
        const botonesEliminar = this.carritoItemsList.querySelectorAll('.carrito-item-remove');
        botonesEliminar.forEach(boton => {
            boton.addEventListener('click', (e) => {
                const productoId = parseInt(e.target.dataset.id);
                this.eliminarProducto(productoId);
            });
        });

        // Actualizar total
        this.actualizarTotal();
    }

    // Actualizar total en el footer
    actualizarTotal() {
        if (this.carritoTotal) {
            const total = this.obtenerTotal();
            this.carritoTotal.textContent = `$${this.formatearPrecio(total)}`;
        }
    }

    // Formatear precio con separadores de miles
    formatearPrecio(precio) {
        return parseFloat(precio).toLocaleString('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    // Abrir modal del carrito
    abrirCarrito() {
        if (this.carritoModal) {
            this.actualizarListaCarrito(); // Actualizar antes de abrir
            this.carritoModal.classList.add('active');
            this.carritoModal.classList.remove('closing');
            document.body.style.overflow = 'hidden'; // Prevenir scroll
        }
    }

    // Cerrar modal del carrito
    cerrarCarrito() {
        if (this.carritoModal) {
            this.carritoModal.classList.add('closing');
            setTimeout(() => {
                this.carritoModal.classList.remove('active', 'closing');
                document.body.style.overflow = ''; // Restaurar scroll
            }, 300);
        }
    }

    // Comprar todos los productos del carrito
    comprarCarrito() {
        if (this.obtenerCantidad() === 0) {
            this.mostrarNotificacion('Tu carrito está vacío');
            return;
        }

        // Verificar si el usuario está autenticado
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');

        if (!token || !userData) {
            // No está autenticado, cerrar carrito y mostrar modal de login
            console.log('⚠️ Usuario no autenticado, mostrando modal de login');
            
            this.cerrarCarrito();
            
            setTimeout(() => {
                // Abrir modal de autenticación
                const authModal = document.getElementById('authModal');
                if (authModal) {
                    authModal.classList.add('active');
                }
                
                // Usar customModal para el mensaje
                if (window.customModal) {
                    window.customModal.showAlert('Debes iniciar sesión para poder comprar', 'Autenticación Requerida');
                }
            }, 400);
            
            return;
        }

        // Usuario autenticado, proceder con la compra
        console.log('✅ Usuario autenticado, procesando compra del carrito...');

        // Cerrar modal del carrito
        this.cerrarCarrito();

        // Mostrar modal de compra exitosa
        setTimeout(() => {
            this.mostrarModalCompraExitosa();
        }, 400);

        // Vaciar carrito
        this.carrito = [];
        this.guardarCarrito();
        this.actualizarUI();
    }

    // Mostrar modal de compra exitosa
    mostrarModalCompraExitosa() {
        const compraModal = document.getElementById('compraModal');
        if (compraModal) {
            compraModal.style.display = 'flex';
            compraModal.style.justifyContent = 'center';
            compraModal.style.alignItems = 'center';
            compraModal.style.position = 'fixed';
            compraModal.style.top = '0';
            compraModal.style.left = '0';
            compraModal.style.width = '100vw';
            compraModal.style.height = '100vh';
            compraModal.style.background = 'rgba(0, 0, 0, 0.6)';
            compraModal.style.zIndex = '10000';
            setTimeout(() => {
                compraModal.classList.add('active');
            }, 10);
        }
    }

    // Mostrar notificación temporal
    mostrarNotificacion(mensaje, tipo = 'info') {
        // Crear elemento de notificación
        const notificacion = document.createElement('div');
        notificacion.className = 'carrito-notificacion';
        notificacion.textContent = mensaje;
        notificacion.style.cssText = `
            position: fixed;
            top: 140px;
            right: 20px;
            background: ${tipo === 'success' ? '#1b1b1b' : '#666'};
            color: white;
            padding: 15px 25px;
            border-radius: 4px;
            font-family: 'Montserrat', sans-serif;
            font-size: 0.9em;
            font-weight: 500;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: notifSlideIn 0.3s ease;
        `;

        // Agregar estilos de animación si no existen
        if (!document.getElementById('notif-styles')) {
            const style = document.createElement('style');
            style.id = 'notif-styles';
            style.textContent = `
                @keyframes notifSlideIn {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes notifSlideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notificacion);

        // Remover después de 3 segundos
        setTimeout(() => {
            notificacion.style.animation = 'notifSlideOut 0.3s ease';
            setTimeout(() => {
                notificacion.remove();
            }, 300);
        }, 3000);
    }

    // Vaciar carrito completo
    vaciarCarrito() {
        this.carrito = [];
        this.guardarCarrito();
        this.actualizarUI();
    }
}

// Inicializar el carrito cuando el DOM esté listo
let carritoGlobal;

document.addEventListener('DOMContentLoaded', () => {
    carritoGlobal = new CarritoManager();
    
    // Hacer disponible globalmente
    window.carritoManager = carritoGlobal;
    
    console.log('🛒 Sistema de carrito inicializado');
});
