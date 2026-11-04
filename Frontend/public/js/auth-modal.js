// ==================== SISTEMA DE AUTENTICACIÓN UNIVERSAL ====================
// Este script funciona tanto en la página principal como en páginas dinámicas (Reservas, etc.)

document.addEventListener('DOMContentLoaded', () => {
    // Detectar qué estructura de modal está presente en la página
    const authModal = document.getElementById('authModal') || document.getElementById('authModalOverlay');
    const closeModalBtn = document.getElementById('closeModalBtn') || document.getElementById('authCloseBtn');
    const userIconBtn = document.querySelector('.head-icons-cont .icon-link:nth-child(3)');
    
    // Verificar que existan los elementos necesarios
    if (!authModal) {
        console.warn('Modal de autenticación no encontrado en esta página');
        return;
    }

    // Buscar formularios de login y registro dentro del modal
    const loginForm = authModal.querySelector('#loginForm');
    const registerForm = authModal.querySelector('#registerForm');
    const showRegisterBtn = authModal.querySelector('#showRegister');
    const showLoginBtn = authModal.querySelector('#showLogin');

    // ==================== VERIFICAR SI HAY SESIÓN ACTIVA ====================
    verificarSesion();

    // ==================== ABRIR MODAL O REDIRIGIR A PERFIL ====================
    if (userIconBtn) {
        userIconBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Verificar si hay sesión activa
            const token = localStorage.getItem('auth_token');
            const userData = localStorage.getItem('user_data');
            
            if (token && userData) {
                // Si hay sesión, redirigir al perfil
                window.location.href = '/perfil/index.html';
            } else {
                // Si no hay sesión, abrir modal
                openModal();
            }
        });
    }

    // ==================== CERRAR MODAL ====================
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    // Cerrar modal al hacer clic en el overlay (fondo oscuro)
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) {
            closeModal();
        }
    });

    // Cerrar modal con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && authModal.classList.contains('active')) {
            closeModal();
        }
    });

    // ==================== CAMBIAR ENTRE LOGIN Y REGISTRO ====================
    if (showRegisterBtn && registerForm && loginForm) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
            // Si tiene la clase 'auth-form', también manejar esa estructura
            if (loginForm.classList.contains('auth-form')) {
                loginForm.classList.remove('active');
                registerForm.classList.add('active');
            }
        });
    }

    if (showLoginBtn && loginForm && registerForm) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'flex';
            // Si tiene la clase 'auth-form', también manejar esa estructura
            if (registerForm.classList.contains('auth-form')) {
                registerForm.classList.remove('active');
                loginForm.classList.add('active');
            }
        });
    }

    // ==================== MANEJO DE FORMULARIO DE REGISTRO ====================
    if (registerForm) {
        const registerSubmitBtn = registerForm.querySelector('button[type="submit"]');
        
        if (registerSubmitBtn) {
            registerSubmitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // Obtener valores de los campos
                const nombreCompleto = registerForm.querySelector('#register-name')?.value.trim();
                const email = registerForm.querySelector('#register-email')?.value.trim();
                const password = registerForm.querySelector('#register-password')?.value;
                const confirmPassword = registerForm.querySelector('#register-confirm')?.value;
                
                // Validaciones en frontend
                if (!nombreCompleto || !email || !password || !confirmPassword) {
                    if (window.customModal) {
                        customModal.showAlert('Por favor completa todos los campos', 'Campos incompletos');
                    } else {
                        mostrarMensaje('Por favor completa todos los campos', 'error');
                    }
                    return;
                }
                
                // El nombre solo admite letras (con tildes y ñ), espacios, guion y apóstrofo
                const nombreValido = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:[ '-][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/;
                if (!nombreValido.test(nombreCompleto)) {
                    if (window.customModal) {
                        customModal.showAlert('El nombre solo puede contener letras y espacios, sin números ni símbolos', 'Nombre inválido');
                    } else {
                        mostrarMensaje('El nombre solo puede contener letras y espacios', 'error');
                    }
                    return;
                }

                if (nombreCompleto.length < 3 || nombreCompleto.length > 60) {
                    if (window.customModal) {
                        customModal.showAlert('El nombre debe tener entre 3 y 60 caracteres', 'Nombre inválido');
                    } else {
                        mostrarMensaje('El nombre debe tener entre 3 y 60 caracteres', 'error');
                    }
                    return;
                }

                // Validación básica de correo
                const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
                if (!emailValido.test(email)) {
                    if (window.customModal) {
                        customModal.showAlert('Ingresa un correo electrónico válido', 'Correo inválido');
                    } else {
                        mostrarMensaje('Ingresa un correo electrónico válido', 'error');
                    }
                    return;
                }

                if (password !== confirmPassword) {
                    if (window.customModal) {
                        customModal.showAlert('Las contraseñas no coinciden', 'Error de validación');
                    } else {
                        mostrarMensaje('Las contraseñas no coinciden', 'error');
                    }
                    return;
                }
                
                if (password.length < 6) {
                    if (window.customModal) {
                        customModal.showAlert('La contraseña debe tener al menos 6 caracteres', 'Contraseña débil');
                    } else {
                        mostrarMensaje('La contraseña debe tener al menos 6 caracteres', 'error');
                    }
                    return;
                }
                
                // Deshabilitar botón durante la petición
                registerSubmitBtn.disabled = true;
                registerSubmitBtn.textContent = 'Registrando...';
                
                try {
                    // Enviar datos al backend
                    const response = await fetch('/api/auth/register', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            nombre_completo: nombreCompleto,
                            email: email,
                            password: password,
                            confirm_password: confirmPassword
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        // Guardar token en localStorage
                        localStorage.setItem('auth_token', data.token);
                        localStorage.setItem('user_data', JSON.stringify(data.user));
                        
                        // Mostrar mensaje de éxito
                        mostrarMensaje('¡Registro exitoso! Bienvenido ' + data.user.nombre_completo, 'success-register');
                        
                        // Actualizar UI
                        actualizarUIUsuario(data.user);
                        
                        // Cerrar modal después de 1.5 segundos
                        setTimeout(() => {
                            closeModal();
                            limpiarFormularios();
                        }, 1500);
                        
                    } else {
                        if (window.customModal) {
                            customModal.showAlert(data.message || 'Error al registrar usuario', 'Error');
                        } else {
                            mostrarMensaje(data.message || 'Error al registrar usuario', 'error');
                        }
                    }
                    
                } catch (error) {
                    console.error('Error en registro:', error);
                    if (window.customModal) {
                        customModal.showAlert('Error de conexión. Intenta nuevamente.', 'Error');
                    } else {
                        mostrarMensaje('Error de conexión. Intenta nuevamente.', 'error');
                    }
                } finally {
                    // Rehabilitar botón
                    registerSubmitBtn.disabled = false;
                    registerSubmitBtn.textContent = 'Registrarse';
                }
            });
        }
    }

    // ==================== MANEJO DE FORMULARIO DE LOGIN ====================
    if (loginForm) {
        const loginSubmitBtn = loginForm.querySelector('button[type="submit"]');
        
        if (loginSubmitBtn) {
            loginSubmitBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // Obtener valores de los campos
                const email = loginForm.querySelector('#login-email')?.value.trim();
                const password = loginForm.querySelector('#login-password')?.value;
                
                // Validaciones en frontend
                if (!email || !password) {
                    if (window.customModal) {
                        customModal.showAlert('Por favor completa todos los campos', 'Campos incompletos');
                    } else {
                        mostrarMensaje('Por favor completa todos los campos', 'error');
                    }
                    return;
                }
                
                // Deshabilitar botón durante la petición
                loginSubmitBtn.disabled = true;
                loginSubmitBtn.textContent = 'Iniciando sesión...';
                
                try {
                    // Enviar datos al backend
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            email: email,
                            password: password
                        })
                    });
                    
                    const data = await response.json();
                    
                    console.log('📥 Respuesta del servidor:', data);
                    console.log('🔍 Rol del usuario:', data.user?.rol);
                    
                    if (data.success) {
                        // Guardar token en localStorage
                        localStorage.setItem('auth_token', data.token);
                        localStorage.setItem('user_data', JSON.stringify(data.user));
                        
                        // Verificar si es admin y redirigir
                        if (data.user.rol === 'admin') {
                            console.log('✅ Usuario es admin, redirigiendo...');
                            window.location.href = '/Admin/index.html';
                            return;
                        }
                        
                        console.log('ℹ️ Usuario normal, mostrando mensaje de bienvenida');
                        
                        // Mostrar mensaje de éxito para usuarios normales
                        mostrarMensaje('¡Bienvenido de nuevo, ' + data.user.nombre_completo + '!', 'success-login');
                        
                        // Actualizar UI
                        actualizarUIUsuario(data.user);
                        
                        // Cerrar modal después de 1.5 segundos
                        setTimeout(() => {
                            closeModal();
                            limpiarFormularios();
                        }, 1500);
                        
                    } else {
                        if (window.customModal) {
                            customModal.showAlert(data.message || 'Error al iniciar sesión', 'Error');
                        } else {
                            mostrarMensaje(data.message || 'Error al iniciar sesión', 'error');
                        }
                    }
                    
                } catch (error) {
                    console.error('Error en login:', error);
                    if (window.customModal) {
                        customModal.showAlert('Error de conexión. Intenta nuevamente.', 'Error');
                    } else {
                        mostrarMensaje('Error de conexión. Intenta nuevamente.', 'error');
                    }
                } finally {
                    // Rehabilitar botón
                    loginSubmitBtn.disabled = false;
                    loginSubmitBtn.textContent = 'Iniciar Sesión';
                }
            });
        }
    }

    // ==================== FUNCIONES AUXILIARES ====================
    function openModal() {
        // Prevenir scroll del body
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = `${scrollbarWidth}px`;
        
        // Activar modal
        authModal.classList.add('active');
        
        // Asegurar que el login esté visible por defecto
        if (loginForm && registerForm) {
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
            
            // Para estructura con clase 'auth-form'
            if (loginForm.classList.contains('auth-form')) {
                loginForm.classList.add('active');
                registerForm.classList.remove('active');
            }
        }
    }

    function closeModal() {
        authModal.classList.add('closing');
        
        setTimeout(() => {
            authModal.classList.remove('active', 'closing');
            document.body.style.overflow = 'auto';
            document.body.style.paddingRight = '0px';
            
            // Resetear al formulario de login
            if (loginForm && registerForm) {
                loginForm.style.display = 'flex';
                registerForm.style.display = 'none';
                
                if (loginForm.classList.contains('auth-form')) {
                    loginForm.classList.add('active');
                    registerForm.classList.remove('active');
                }
            }
        }, 300);
    }

    function limpiarFormularios() {
        // Limpiar inputs de login
        if (loginForm) {
            loginForm.querySelector('#login-email').value = '';
            loginForm.querySelector('#login-password').value = '';
        }
        
        // Limpiar inputs de registro
        if (registerForm) {
            registerForm.querySelector('#register-name').value = '';
            registerForm.querySelector('#register-email').value = '';
            registerForm.querySelector('#register-password').value = '';
            registerForm.querySelector('#register-confirm').value = '';
        }
    }

    function mostrarMensaje(mensaje, tipo) {
        // Crear elemento de mensaje
        const mensajeDiv = document.createElement('div');
        mensajeDiv.className = `auth-message ${tipo}`;
        mensajeDiv.textContent = mensaje;
        
        // Definir estilos según el tipo
        let estilosColor = '';
        
        if (tipo === 'success-login') {
            // Login: Fondo negro #1b1b1b, letras blancas, sin bordes
            estilosColor = 'background: #1b1b1b; color: white; border: none;';
        } else if (tipo === 'success-register') {
            // Registro: Fondo blanco, letras negras, borde negro 1px
            estilosColor = 'background: white; color: #1b1b1b; border: 1px solid #1b1b1b;';
        } else if (tipo === 'error') {
            // Error: Fondo rojo
            estilosColor = 'background: #dc3545; color: white; border: none;';
        } else {
            // Por defecto (success genérico)
            estilosColor = 'background: #1b1b1b; color: white; border: none;';
        }
        
        // Estilos inline
        mensajeDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 0;
            font-weight: 500;
            font-size: 0.9em;
            z-index: 10000;
            animation: slideInRight 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 400px;
            font-family: "Montserrat", sans-serif;
            ${estilosColor}
        `;
        
        document.body.appendChild(mensajeDiv);
        
        // Remover después de 1.5 segundos (se va junto con el cierre del modal)
        setTimeout(() => {
            mensajeDiv.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(mensajeDiv);
            }, 300);
        }, 1500);
    }

    function actualizarUIUsuario(user) {
        if (userIconBtn) {
            // Ya no es necesario cambiar el onclick aquí porque el addEventListener
            // del inicio ya maneja la verificación de sesión
            
            userIconBtn.title = `${user.nombre_completo} - Mi Perfil`;
            
            // Agregar badge con inicial si no existe
            if (!userIconBtn.querySelector('.user-badge')) {
                const badge = document.createElement('span');
                badge.className = 'user-badge';
                badge.textContent = user.nombre_completo.charAt(0).toUpperCase();
                badge.style.cssText = `
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: #1b1b1b;
                    color: white;
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    font-size: 10px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                `;
                
                // El botón necesita position relative
                userIconBtn.style.position = 'relative';
                userIconBtn.appendChild(badge);
            }
        }
        
        console.log('✅ Usuario autenticado:', user);
    }
    
    // ==================== FUNCIÓN GLOBAL PARA CERRAR SESIÓN ====================
    window.cerrarSesion = function() {
        // Limpiar localStorage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        
        // Remover badge si existe
        if (userIconBtn) {
            const badge = userIconBtn.querySelector('.user-badge');
            if (badge) {
                badge.remove();
            }
            
            // Restaurar comportamiento original del botón
            userIconBtn.onclick = (e) => {
                e.preventDefault();
                openModal();
            };
            
            userIconBtn.title = 'Iniciar Sesión / Registrarse';
        }
        
        // Mostrar mensaje
        mostrarMensaje('Sesión cerrada exitosamente', 'success');
        
        // Redirigir a inicio después de 1 segundo
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    };

    function verificarSesion() {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');
        
        if (token && userData) {
            try {
                const user = JSON.parse(userData);
                actualizarUIUsuario(user);
                console.log('Sesión activa:', user);
            } catch (error) {
                console.error('Error al parsear datos de usuario:', error);
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
            }
        }
    }

    console.log('✅ Sistema de autenticación cargado correctamente');
});

// Agregar estilos para animaciones de mensajes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
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
