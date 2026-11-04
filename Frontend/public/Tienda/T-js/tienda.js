// ==================== TIENDA DINÁMICA - PRESTIGE BARBERS ====================
// Este script carga todos los productos desde la base de datos y permite filtrarlos

// Usar URL relativa para que funcione tanto en localhost como en red
const API_URL = '/api';

// Variables globales
let todosLosProductos = [];
let productosFiltrados = [];

// Ejecutar cuando cargue la página
document.addEventListener('DOMContentLoaded', () => {
    console.log('🛒 Iniciando carga de productos de la tienda...');
    cargarProductos();
});

// ==================== CARGAR PRODUCTOS DESDE LA API ====================
async function cargarProductos() {
    try {
        console.log('📡 Consultando API:', `${API_URL}/productos`);
        
        const response = await fetch(`${API_URL}/productos`);
        const data = await response.json();
        
        if (data.success && data.productos) {
            todosLosProductos = data.productos;
            productosFiltrados = data.productos;
            
            console.log(`✅ ${data.productos.length} productos cargados`);
            
            renderizarProductos(data.productos);
            actualizarSidebar(data.productos);
        } else {
            console.warn('⚠️ No hay productos disponibles');
            mostrarMensajeNoProductos();
        }
        
    } catch (error) {
        console.error('❌ Error al cargar productos:', error);
        mostrarMensajeError();
    }
}

// ==================== RENDERIZAR PRODUCTOS EN EL GRID ====================
function renderizarProductos(productos) {
    const container = document.querySelector('.prod-cont-cont');
    
    if (!container) {
        console.error('❌ Contenedor de productos no encontrado');
        return;
    }
    
    // Aplicar fade out suave
    container.classList.add('fade-out');
    
    // Esperar a que termine el fade out antes de actualizar el contenido
    setTimeout(() => {
        if (productos.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                    <p style="font-size: 1.2em; color: #666; margin-bottom: 20px;">
                        No se encontraron productos con los filtros aplicados
                    </p>
                    <button onclick="mostrarTodos()" style="padding: 12px 24px; background: #1b1b1b; color: white; border: none; cursor: pointer; font-size: 1em;">
                        Ver Todos los Productos
                    </button>
                </div>
            `;
        } else {
            // Crear HTML de todas las cards de productos
            container.innerHTML = productos.map(producto => crearCardProducto(producto)).join('');
        }
        
        console.log(`🎨 ${productos.length} productos renderizados`);
        
        // Quitar fade out para activar fade in
        container.classList.remove('fade-out');
    }, 500); // Duración del fade out
}

// ==================== CREAR CARD DE PRODUCTO ====================
function crearCardProducto(producto) {
    const precioFormateado = formatearPrecio(producto.precio);
    
    return `
        <a href="../Compra/index.html?id=${producto.id}" class="prod-crd" style="text-decoration: none; color: inherit;">
            <div class="prod-img">
                <img src="${producto.imagen}" alt="${producto.nombre}" onerror="this.src='../I-img/placeholder.png'">
            </div>
            <div class="prod-inf">
                <label>${producto.nombre}</label>
                <label>${precioFormateado}</label>
            </div>
        </a>
    `;
}

// ==================== ACTUALIZAR SIDEBAR CON FILTROS DINÁMICOS ====================
function actualizarSidebar(productos) {
    // Extraer categorías únicas
    const categorias = [...new Set(productos.map(p => p.categoria))].filter(Boolean);
    
    // Extraer marcas únicas
    const marcas = [...new Set(productos.map(p => p.marca))].filter(Boolean);
    
    console.log('🏷️ Categorías encontradas:', categorias);
    console.log('🏷️ Marcas encontradas:', marcas);
    
    // Actualizar listas del sidebar
    actualizarListaCategorias(categorias);
    actualizarListaMarcas(marcas);
}

// ==================== ACTUALIZAR LISTA DE CATEGORÍAS ====================
function actualizarListaCategorias(categorias) {
    const sidebarSections = document.querySelectorAll('.sidebar-section');
    
    if (sidebarSections.length === 0) return;
    
    // La primera sección es para categorías (ajusta según tu HTML)
    const listaCategorias = sidebarSections[0].querySelector('ul');
    
    if (listaCategorias) {
        listaCategorias.innerHTML = `
            <li onclick="mostrarTodos()" style="cursor: pointer; font-weight: bold; margin-bottom: 8px;">
                Ver Todos
            </li>
            ${categorias.map(categoria => `
                <li onclick="filtrarPorCategoria('${categoria}')" style="cursor: pointer; padding: 4px 0; transition: color 0.2s;">
                    ${categoria}
                </li>
            `).join('')}
        `;
        
        // Cambiar el título de la sección
        const titulo = sidebarSections[0].querySelector('h3');
        if (titulo) {
            titulo.textContent = 'CATEGORÍAS';
        }
    }
}

// ==================== ACTUALIZAR LISTA DE MARCAS ====================
function actualizarListaMarcas(marcas) {
    const sidebarSections = document.querySelectorAll('.sidebar-section');
    
    if (sidebarSections.length < 2) return;
    
    // La segunda sección es para marcas (ajusta según tu HTML)
    const listaMarcas = sidebarSections[1].querySelector('ul');
    
    if (listaMarcas) {
        listaMarcas.innerHTML = `
            <li onclick="mostrarTodos()" style="cursor: pointer; font-weight: bold; margin-bottom: 8px;">
                Ver Todos
            </li>
            ${marcas.map(marca => `
                <li onclick="filtrarPorMarca('${marca}')" style="cursor: pointer; padding: 4px 0; transition: color 0.2s;">
                    ${marca}
                </li>
            `).join('')}
        `;
        
        // Cambiar el título de la sección
        const titulo = sidebarSections[1].querySelector('h3');
        if (titulo) {
            titulo.textContent = 'MARCAS';
        }
    }
}

// ==================== FILTRAR POR CATEGORÍA ====================
function filtrarPorCategoria(categoria) {
    productosFiltrados = todosLosProductos.filter(p => p.categoria === categoria);
    renderizarProductos(productosFiltrados);
    console.log(`🔍 Filtrando por categoría: ${categoria} (${productosFiltrados.length} productos)`);
}

// ==================== FILTRAR POR MARCA ====================
function filtrarPorMarca(marca) {
    productosFiltrados = todosLosProductos.filter(p => p.marca === marca);
    renderizarProductos(productosFiltrados);
    console.log(`🔍 Filtrando por marca: ${marca} (${productosFiltrados.length} productos)`);
}

// ==================== MOSTRAR TODOS LOS PRODUCTOS ====================
function mostrarTodos() {
    productosFiltrados = todosLosProductos;
    renderizarProductos(todosLosProductos);
    console.log(`🔍 Mostrando todos los productos (${todosLosProductos.length} productos)`);
}

// ==================== FORMATEAR PRECIO ====================
function formatearPrecio(precio) {
    const precioNum = parseInt(precio);
    return `$${precioNum.toLocaleString('es-CO')}`;
}

// ==================== MOSTRAR MENSAJE DE ERROR ====================
function mostrarMensajeError() {
    const container = document.querySelector('.prod-cont-cont');
    if (container) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <p style="font-size: 1.2em; color: #dc3545; margin-bottom: 20px;">
                    Error al cargar productos
                </p>
                <p style="color: #666; margin-bottom: 20px;">
                    Por favor, verifica tu conexión e intenta nuevamente.
                </p>
                <button onclick="cargarProductos()" style="padding: 12px 24px; background: #1b1b1b; color: white; border: none; cursor: pointer; font-size: 1em;">
                    Reintentar
                </button>
            </div>
        `;
    }
}

// ==================== MOSTRAR MENSAJE SIN PRODUCTOS ====================
function mostrarMensajeNoProductos() {
    const container = document.querySelector('.prod-cont-cont');
    if (container) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px;">
                <p style="font-size: 1.2em; color: #666; margin-bottom: 20px;">
                    No hay productos disponibles en este momento
                </p>
                <a href="../index.html" style="display: inline-block; padding: 12px 24px; background: #1b1b1b; color: white; text-decoration: none; font-size: 1em;">
                    Volver al inicio
                </a>
            </div>
        `;
    }
}

// Hacer funciones disponibles globalmente (para los onclick inline)
window.filtrarPorCategoria = filtrarPorCategoria;
window.filtrarPorMarca = filtrarPorMarca;
window.mostrarTodos = mostrarTodos;
window.cargarProductos = cargarProductos;

console.log('✅ Sistema de tienda dinámica cargado');
