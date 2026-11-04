// ==================== PÁGINA DE DETALLE DE PRODUCTO DINÁMICA ====================
// Usar URL relativa para que funcione tanto en localhost como en red
const API_URL = '/api';

// Obtener ID del producto desde la URL
const urlParams = new URLSearchParams(window.location.search);
const productoId = urlParams.get('id');

// Elementos del DOM
const pageLoader = document.getElementById('pageLoader');
const mainContent = document.getElementById('mainContent');
const productImage = document.getElementById('productImage');
const productBrand = document.getElementById('productBrand');
const productName = document.getElementById('productName');
const productDescription = document.getElementById('productDescription');
const productSize = document.getElementById('productSize');
const productCategory = document.getElementById('productCategory');
const productType = document.getElementById('productType');
const productPrice = document.getElementById('productPrice');
const verMasBtn = document.getElementById('verMasBtn');
const descriptionFade = document.querySelector('.description-fade');
const buyButton = document.getElementById('buyButton');
const addToCartButton = document.getElementById('addToCartButton');
const compraModal = document.getElementById('compraModal');
const closeCompraModalBtn = document.getElementById('closeCompraModalBtn');
const continueBtn = document.getElementById('continueBtn');

// Cargar información del producto al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    console.log('🛍️ Inicializando página de producto...');
    console.log('📦 ID del producto:', productoId);
    
    if (!productoId) {
        mostrarError('No se especificó un producto válido');
        return;
    }
    
    cargarProducto(productoId);
    configurarEventos();
});

// ==================== CARGAR PRODUCTO DESDE LA API ====================
async function cargarProducto(id) {
    try {
        console.log('📡 Consultando API:', `${API_URL}/productos/${id}`);
        
        const response = await fetch(`${API_URL}/productos/${id}`);
        const data = await response.json();
        
        console.log('📥 Respuesta recibida:', data);
        
        if (data.success && data.producto) {
            console.log('✅ Producto cargado:', data.producto);
            mostrarProducto(data.producto);
        } else {
            console.error('❌ Producto no encontrado');
            mostrarError('Producto no encontrado');
        }
        
    } catch (error) {
        console.error('❌ Error al cargar producto:', error);
        mostrarError('Error al cargar el producto. Verifica tu conexión.');
    }
}

// ==================== MOSTRAR PRODUCTO EN LA PÁGINA ====================
function mostrarProducto(producto) {
    // Guardar producto en variable global para usarlo en el carrito
    window.productoActual = producto;
    
    // Configurar imagen
    productImage.src = producto.imagen;
    productImage.alt = producto.nombre;
    productImage.style.display = 'block';
    
    // Configurar información del producto
    productBrand.textContent = producto.marca;
    productName.textContent = producto.nombre;
    productDescription.textContent = producto.descripcion;
    productSize.textContent = producto.tamano;
    productCategory.textContent = producto.categoria;
    productType.textContent = producto.tipo;
    
    // Formatear precio
    const precioFormateado = formatearPrecio(producto.precio);
    productPrice.textContent = precioFormateado;
    
    // Ocultar loader y mostrar contenido
    pageLoader.classList.add('hidden');
    mainContent.classList.add('loaded');
    
    console.log('✅ Producto mostrado en la página');
}

// ==================== MOSTRAR ERROR ====================
function mostrarError(mensaje) {
    pageLoader.innerHTML = `
        <div style="text-align: center;">
            <div style="font-size: 3em; margin-bottom: 20px;">❌</div>
            <p style="font-size: 1.2em; color: #dc3545; margin-bottom: 20px;">${mensaje}</p>
            <a href="../Tienda/index.html" style="display: inline-block; padding: 12px 24px; background: #1b1b1b; color: white; text-decoration: none; border-radius: 4px;">
                Volver a la Tienda
            </a>
        </div>
    `;
}

// ==================== FORMATEAR PRECIO ====================
function formatearPrecio(precio) {
    const precioNum = parseInt(precio);
    return `$${precioNum.toLocaleString('es-CO')}`;
}

// Configurar todos los eventos
function configurarEventos() {
    // Botón "Ver más" de la descripción
    if (verMasBtn) {
        verMasBtn.addEventListener('click', toggleDescription);
    }

    // Botón "Agregar al Carrito"
    if (addToCartButton) {
        addToCartButton.addEventListener('click', (e) => {
            e.preventDefault();
            agregarAlCarrito();
        });
    }

    // Botón "Comprar Ahora"
    if (buyButton) {
        buyButton.addEventListener('click', (e) => {
            e.preventDefault();
            comprarAhora();
        });
    }

    // Cerrar modal de compra
    if (closeCompraModalBtn) {
        closeCompraModalBtn.addEventListener('click', cerrarModalCompra);
    }

    // Botón continuar en modal
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            cerrarModalCompra();
            // Opcionalmente redirigir a la tienda
            // window.location.href = '../Tienda/index.html';
        });
    }

    // Cerrar modal al hacer click fuera
    if (compraModal) {
        compraModal.addEventListener('click', (e) => {
            if (e.target === compraModal) {
                cerrarModalCompra();
            }
        });
    }

    // Cerrar modal con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && compraModal.classList.contains('active')) {
            cerrarModalCompra();
        }
    });
}

// Función para expandir/colapsar descripción
function toggleDescription() {
    if (productDescription.classList.contains('collapsed')) {
        // Expandir
        productDescription.classList.remove('collapsed');
        productDescription.classList.add('expanded');
        descriptionFade.classList.add('hidden');
        verMasBtn.textContent = 'Ver menos';
    } else {
        // Colapsar
        productDescription.classList.remove('expanded');
        productDescription.classList.add('collapsed');
        descriptionFade.classList.remove('hidden');
        verMasBtn.textContent = 'Ver más';
    }
}

// Mostrar modal de compra
function mostrarModalCompra() {
    if (compraModal) {
        compraModal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevenir scroll del body
    }
}

// Cerrar modal de compra
function cerrarModalCompra() {
    if (compraModal) {
        compraModal.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll del body
    }
}

// ==================== FUNCIÓN PARA AGREGAR AL CARRITO ====================
function agregarAlCarrito() {
    // Verificar que el carrito esté inicializado
    if (!window.carritoManager) {
        console.error('❌ Carrito no inicializado');
        alert('Error: Sistema de carrito no disponible');
        return;
    }

    // Verificar que tengamos el producto actual
    if (!window.productoActual) {
        console.error('❌ Producto no cargado');
        alert('Error: Producto no disponible');
        return;
    }

    // Agregar producto al carrito
    const producto = window.productoActual;
    const agregado = window.carritoManager.agregarProducto(producto);

    if (agregado) {
        console.log('✅ Producto agregado al carrito:', producto.nombre);
    }
}

// ==================== FUNCIÓN PARA COMPRAR AHORA ====================
function comprarAhora() {
    // Verificar si el usuario está autenticado
    const token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user_data');

    if (!token || !userData) {
        // No está autenticado, mostrar modal de login
        console.log('⚠️ Usuario no autenticado, mostrando modal de login');
        
        // Abrir modal de autenticación
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authModal.classList.add('active');
        }
        
        // Mostrar mensaje con customModal
        if (window.customModal) {
            window.customModal.showAlert('Debes iniciar sesión para poder comprar', 'Autenticación Requerida');
        }
        
        return;
    }

    // Usuario autenticado: se abre el checkout real.
    // Antes aquí se llamaba a mostrarModalCompra(), que solo pintaba un
    // "COMPRA REALIZADA" sin cobrar nada.
    if (!window.productoActual) {
        console.error('❌ Producto no cargado');
        if (window.customModal) {
            window.customModal.showAlert('No se pudo cargar el producto', 'Error');
        }
        return;
    }

    if (!window.factusCheckout) {
        console.error('❌ factus-checkout.js no está cargado en esta página');
        if (window.customModal) {
            window.customModal.showAlert(
                'El sistema de pagos no está disponible en este momento',
                'Error'
            );
        }
        return;
    }

    console.log('✅ Abriendo checkout para', window.productoActual.nombre);
    window.factusCheckout.pagarProducto(window.productoActual.id, 1);
}

// ==================== VERIFICAR AUTENTICACIÓN PARA EL CARRITO ====================
function verificarAutenticacionCarrito() {
    const token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user_data');

    if (!token || !userData) {
        console.log('⚠️ Usuario no autenticado');
        return false;
    }

    return true;
}

// Log para debugging
console.log('Producto cargado:', productoSkala);
