const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Clave secreta para JWT desde variable de entorno
const JWT_SECRET = process.env.JWT_SECRET || 'prestige_barbers_secret_key_2025_CHANGE_IN_PRODUCTION';

// ==================== SEGURIDAD - HELMET.JS ====================
// Suite completa de headers de seguridad
// NOTA: CSP configurado para permitir testing de seguridad desde red local
// En producción, debe limitarse solo a dominio específico
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            // 'self' cubre el origen desde el que se sirvio la pagina (cualquier IP
            // de la red local), por lo que no hace falta listar IPs fijas.
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
            scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"], // Permitir onclick, etc.
            connectSrc: ["'self'"],
            frameAncestors: ["'self'"], // FIX NESSUS: Prevenir clickjacking
            // Helmet lo activa por defecto: obliga al navegador a pedir TODOS los
            // recursos por https. Sirviendo por http en red local eso rompe el sitio
            // (CSS/JS/imagenes no cargan). Solo se activa en produccion (con HTTPS).
            ...(process.env.NODE_ENV === 'production'
                ? {}
                : { upgradeInsecureRequests: null })
        }
    },
    // HSTS solo tiene sentido sirviendo por HTTPS. En desarrollo por HTTP
    // forzaria al navegador a reescribir las URLs a https y romperia el sitio.
    hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    frameguard: {
        action: 'deny' // FIX NESSUS: X-Frame-Options DENY
    },
    noSniff: true, // FIX NIKTO: X-Content-Type-Options nosniff
    hidePoweredBy: true // FIX NESSUS/NIKTO: Ocultar X-Powered-By
}));

// ==================== SEGURIDAD - CORS CONFIGURADO ====================
// Lista blanca de orígenes permitidos
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.168.1.36:3000'];

app.use(cors({
    origin: function(origin, callback) {
        // Permitir requests sin origin (como mobile apps o curl)
        if (!origin) return callback(null, true);
        
        // Para desarrollo/testing, permitir cualquier IP de red privada
        // (192.168.x.x, 10.x.x.x y 172.16-31.x.x), no solo 192.168.
        const redPrivada = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
        if (origin && redPrivada.test(origin)) {
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = '❌ CORS policy: Origin no permitido: ' + origin;
            console.warn(msg);
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Request-Id']
}));

// ==================== SEGURIDAD - RATE LIMITING ====================
// Limitar peticiones generales de la API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Máximo 100 peticiones por ventana
    message: {
        success: false,
        message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`⚠️ Rate limit excedido - IP: ${req.ip} - URL: ${req.url}`);
        res.status(429).json({
            success: false,
            message: 'Demasiadas peticiones, intenta de nuevo en 15 minutos.'
        });
    }
});

// Limitar endpoints de autenticación (más restrictivo)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Solo 5 intentos
    message: {
        success: false,
        message: 'Demasiados intentos de autenticación, intenta de nuevo en 15 minutos.'
    },
    skipSuccessfulRequests: true, // No contar intentos exitosos
    handler: (req, res) => {
        console.warn(`🔴 Rate limit AUTH excedido - IP: ${req.ip} - Email: ${req.body.email}`);
        res.status(429).json({
            success: false,
            message: 'Demasiados intentos fallidos. Espera 15 minutos.'
        });
    }
});

// Aplicar rate limiters
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ==================== SEGURIDAD - HTTPS REDIRECT ====================
// FIX NESSUS HIGH: Forzar HTTPS para proteger credenciales
app.use((req, res, next) => {
    // En producción, forzar HTTPS
    if (process.env.NODE_ENV === 'production' && !req.secure && req.get('x-forwarded-proto') !== 'https') {
        console.warn(`⚠️ Redirecting to HTTPS: ${req.url} from IP: ${req.ip}`);
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
});

// ==================== SEGURIDAD - HEADERS ADICIONALES ====================
// NOTA: Algunos headers ya están configurados en Helmet, esto es redundancia por seguridad
app.use((req, res, next) => {
    // Remover header que expone la tecnología (ya en Helmet pero por seguridad extra)
    res.removeHeader('X-Powered-By');
    
    // Headers adicionales de seguridad
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
});

// ==================== LOGGING DE SEGURIDAD ====================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// ==================== MIDDLEWARE BÁSICO ====================
app.use(express.json({ limit: '10mb' })); // Limitar tamaño de payload
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Archivos estaticos. El HTML se revalida siempre (para no servir paginas
// viejas tras un deploy) y los recursos con hash/imagenes se cachean.
app.use(express.static(path.join(__dirname, '..', 'Frontend', 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(jpg|jpeg|png|webp|gif|svg|ico|woff2?)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 dias
        } else {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hora
        }
    }
}));

// Imagenes subidas: nombre unico con timestamp, se pueden cachear mas tiempo
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    etag: true,
    lastModified: true,
    maxAge: '30d'
}));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});
const upload = multer({ storage: storage });

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'barberia',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.connect(err => {
    if (err) {
        console.error('🔴 Error al conectar a MySQL:', err);
        return;
    }
    console.log("🟢 Conectado a MySQL");
});


// ==================== ENDPOINTS DE AUTENTICACIÓN ====================

// Middleware para verificar token JWT
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        console.warn(`⚠️ Intento de acceso sin token - IP: ${req.ip} - URL: ${req.url}`);
        return res.status(401).json({ 
            success: false,
            message: 'Token no proporcionado' 
        });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.warn(`⚠️ Token inválido - IP: ${req.ip} - Error: ${err.message}`);
            return res.status(403).json({ 
                success: false,
                message: 'Token inválido o expirado' 
            });
        }
        req.userId = decoded.id;
        req.userEmail = decoded.email;
        next();
    });
};

// Middleware para verificar rol de administrador
const verificarAdmin = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        console.warn(`🔴 Intento de acceso admin sin token - IP: ${req.ip}`);
        return res.status(401).json({ 
            success: false,
            message: 'Acceso no autorizado - Token requerido' 
        });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.warn(`🔴 Token inválido en acceso admin - IP: ${req.ip}`);
            return res.status(403).json({ 
                success: false,
                message: 'Token inválido' 
            });
        }
        
        // Verificar rol de admin en la base de datos
        db.query('SELECT rol FROM usuarios WHERE id = ? AND activo = TRUE', [decoded.id], (err, results) => {
            if (err) {
                console.error('❌ Error al verificar rol admin:', err);
                return res.status(500).json({ 
                    success: false,
                    message: 'Error en el servidor' 
                });
            }
            
            if (results.length === 0 || results[0].rol !== 'admin') {
                console.warn(`🔴 ALERTA: Intento de acceso no autorizado al panel admin - IP: ${req.ip} - User ID: ${decoded.id}`);
                return res.status(403).json({ 
                    success: false,
                    message: 'No tienes permisos de administrador' 
                });
            }
            
            req.userId = decoded.id;
            req.userRole = results[0].rol;
            next();
        });
    });
};

// POST /api/auth/register - Registrar nuevo usuario
app.post('/api/auth/register',
    // Validaciones con express-validator
    body('nombre_completo')
        .trim()
        .isLength({ min: 3, max: 60 })
        .withMessage('El nombre debe tener entre 3 y 60 caracteres')
        // Solo letras (con tildes y ñ), espacios, guion y apóstrofo: sin números ni símbolos.
        // Se evita la alternancia anidada para no exponerse a ReDoS.
        .matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü][A-Za-zÁÉÍÓÚáéíóúÑñÜü '-]*[A-Za-zÁÉÍÓÚáéíóúÑñÜü]$/)
        .withMessage('El nombre solo puede contener letras y espacios, sin números ni símbolos')
        .not().matches(/[ '-]{2,}/)
        .withMessage('El nombre no puede tener espacios o guiones seguidos')
        .escape(),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Email inválido')
        .normalizeEmail(),
    body('telefono')
        .optional({ checkFalsy: true })
        .trim()
        .matches(/^[0-9+\s()-]{7,20}$/)
        .withMessage('El teléfono solo puede contener números, espacios y los signos + ( ) -'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('La contraseña debe tener al menos 6 caracteres')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('La contraseña debe contener al menos una mayúscula, una minúscula y un número'),
    body('confirm_password')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Las contraseñas no coinciden'),
    
    async (req, res) => {
        try {
            // Verificar errores de validación
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false,
                    message: errors.array()[0].msg,
                    errors: errors.array()
                });
            }
            
            const { nombre_completo, email, telefono, password, confirm_password } = req.body;
        
        // Validaciones básicas
        if (!nombre_completo || !email || !password || !confirm_password) {
            return res.status(400).json({ 
                success: false,
                message: 'Todos los campos son obligatorios' 
            });
        }
        
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                message: 'Email inválido' 
            });
        }
        
        // Validar que las contraseñas coincidan
        if (password !== confirm_password) {
            return res.status(400).json({ 
                success: false,
                message: 'Las contraseñas no coinciden' 
            });
        }
        
        // Validar longitud mínima de contraseña
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres' 
            });
        }
        
        // Verificar si el email ya existe
        db.query('SELECT id FROM usuarios WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error('Error al verificar email:', err);
                return res.status(500).json({ 
                    success: false,
                    message: 'Error en el servidor' 
                });
            }
            
            if (results.length > 0) {
                return res.status(409).json({ 
                    success: false,
                    message: 'Este email ya está registrado' 
                });
            }
            
            // Hash de la contraseña (bcrypt con 10 rounds)
            const passwordHash = await bcrypt.hash(password, 10);
            
            // Insertar nuevo usuario
            const query = 'INSERT INTO usuarios (nombre_completo, email, telefono, password_hash) VALUES (?, ?, ?, ?)';
            db.query(query, [nombre_completo, email, telefono || null, passwordHash], (err, result) => {
                if (err) {
                    console.error('Error al registrar usuario:', err);
                    return res.status(500).json({ 
                        success: false,
                        message: 'Error al registrar usuario' 
                    });
                }
                
                // Generar token JWT
                const token = jwt.sign(
                    { id: result.insertId, email: email },
                    JWT_SECRET,
                    { expiresIn: '7d' } // Token válido por 7 días
                );
                
                res.status(201).json({
                    success: true,
                    message: 'Usuario registrado exitosamente',
                    token: token,
                    user: {
                        id: result.insertId,
                        nombre_completo: nombre_completo,
                        email: email,
                        telefono: telefono || null
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error en el servidor' 
        });
    }
});

// POST /api/auth/login - Iniciar sesión
app.post('/api/auth/login',
    // Validaciones flexibles para login (permite username o email)
    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email/Usuario es requerido'),
    body('password')
        .notEmpty()
        .withMessage('La contraseña es requerida'),
    
    (req, res) => {
        try {
            // Verificar errores de validación
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false,
                    message: errors.array()[0].msg
                });
            }
            
            const { email, password } = req.body;
        
        // Validaciones básicas
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                message: 'Email y contraseña son obligatorios' 
            });
        }
        
        // Buscar usuario por email
        db.query('SELECT * FROM usuarios WHERE email = ? AND activo = TRUE', [email], async (err, results) => {
            if (err) {
                console.error('Error al buscar usuario:', err);
                return res.status(500).json({ 
                    success: false,
                    message: 'Error en el servidor' 
                });
            }
            
            if (results.length === 0) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Email o contraseña incorrectos' 
                });
            }
            
            const usuario = results[0];
            
            console.log('🔍 Usuario encontrado:', {
                id: usuario.id,
                email: usuario.email,
                nombre: usuario.nombre_completo,
                rol: usuario.rol,
                tiene_rol: usuario.hasOwnProperty('rol')
            });
            
            // Verificar contraseña
            const passwordValida = await bcrypt.compare(password, usuario.password_hash);
            
            if (!passwordValida) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Email o contraseña incorrectos' 
                });
            }
            
            // Actualizar último acceso
            db.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [usuario.id]);
            
            // Generar token JWT
            const token = jwt.sign(
                { id: usuario.id, email: usuario.email },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                message: 'Inicio de sesión exitoso',
                token: token,
                user: {
                    id: usuario.id,
                    nombre_completo: usuario.nombre_completo,
                    email: usuario.email,
                    telefono: usuario.telefono || null,
                    rol: usuario.rol
                }
            });
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error en el servidor' 
        });
    }
});

// GET /api/auth/me - Obtener datos del usuario actual (requiere token)
app.get('/api/auth/me', verificarToken, (req, res) => {
    db.query('SELECT id, nombre_completo, email, telefono, fecha_registro, rol FROM usuarios WHERE id = ?', 
        [req.userId], 
        (err, results) => {
            if (err) {
                return res.status(500).json({ 
                    success: false,
                    message: 'Error en el servidor' 
                });
            }
            
            if (results.length === 0) {
                return res.status(404).json({ 
                    success: false,
                    message: 'Usuario no encontrado' 
                });
            }
            
            res.json({
                success: true,
                user: results[0]
            });
        }
    );
});

// POST /api/auth/change-password - Cambiar contraseña del usuario
app.post('/api/auth/change-password', verificarToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    // Validaciones
    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Por favor proporciona la contraseña actual y la nueva contraseña'
        });
    }
    
    if (newPassword.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'La nueva contraseña debe tener al menos 6 caracteres'
        });
    }
    
    try {
        // Obtener el usuario con su contraseña actual
        db.query('SELECT password_hash FROM usuarios WHERE id = ?', 
            [req.userId], 
            async (err, results) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error en el servidor'
                    });
                }
                
                if (results.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Usuario no encontrado'
                    });
                }
                
                // Verificar que la contraseña actual sea correcta
                const passwordMatch = await bcrypt.compare(currentPassword, results[0].password_hash);
                
                if (!passwordMatch) {
                    return res.status(401).json({
                        success: false,
                        message: 'La contraseña actual es incorrecta'
                    });
                }
                
                // Hashear la nueva contraseña
                const newPasswordHash = await bcrypt.hash(newPassword, 10);
                
                // Actualizar la contraseña en la base de datos
                db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?',
                    [newPasswordHash, req.userId],
                    (err) => {
                        if (err) {
                            return res.status(500).json({
                                success: false,
                                message: 'Error al actualizar la contraseña'
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: 'Contraseña actualizada correctamente'
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor'
        });
    }
});

// DELETE /api/auth/delete-account - Eliminar cuenta del usuario
app.delete('/api/auth/delete-account', verificarToken, async (req, res) => {
    const { password } = req.body;
    
    // Validar que se proporcionó la contraseña
    if (!password) {
        return res.status(400).json({
            success: false,
            message: 'Por favor proporciona tu contraseña para confirmar'
        });
    }
    
    try {
        // Obtener el usuario con su contraseña
        db.query('SELECT password_hash FROM usuarios WHERE id = ?', 
            [req.userId], 
            async (err, results) => {
                if (err) {
                    return res.status(500).json({
                        success: false,
                        message: 'Error en el servidor'
                    });
                }
                
                if (results.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'Usuario no encontrado'
                    });
                }
                
                // Verificar que la contraseña sea correcta
                const passwordMatch = await bcrypt.compare(password, results[0].password_hash);
                
                if (!passwordMatch) {
                    return res.status(401).json({
                        success: false,
                        message: 'Contraseña incorrecta'
                    });
                }
                
                // Eliminar el usuario de la base de datos
                db.query('DELETE FROM usuarios WHERE id = ?',
                    [req.userId],
                    (err) => {
                        if (err) {
                            return res.status(500).json({
                                success: false,
                                message: 'Error al eliminar la cuenta'
                            });
                        }
                        
                        res.json({
                            success: true,
                            message: 'Cuenta eliminada exitosamente'
                        });
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error al eliminar cuenta:', error);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor'
        });
    }
});

// POST /api/auth/logout - Cerrar sesión (opcional, se puede manejar solo en frontend)
app.post('/api/auth/logout', (req, res) => {
    // En un sistema con JWT, el logout se maneja generalmente en el frontend
    // eliminando el token. Aquí solo confirmamos la acción.
    res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
    });
});


// Endpoint ANTIGUO para cortes_destacados (mantener por compatibilidad temporal)
app.get('/api/cortes_antiguos', (req, res) => {
    db.query('SELECT * FROM cortes_destacados ORDER BY id ASC LIMIT 7', (err, results) => {
        if (err) {
            res.status(500).send('Error fetching featured cuts');
            return;
        }
        res.json(results);
    });
});

// Endpoint NUEVO para cortes destacados desde la tabla 'cortes'
app.get('/api/cortes', (req, res) => {
    const query = `
        SELECT 
            id,
            nombre as name,
            descripcion_destacado as description,
            imagen_destacado as image_url
        FROM cortes 
        WHERE destacado = 1 
        AND imagen_destacado IS NOT NULL 
        AND descripcion_destacado IS NOT NULL
        ORDER BY id ASC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener cortes destacados:', err);
            res.status(500).send('Error fetching featured cuts');
            return;
        }
        res.json(results);
    });
});

app.post('/api/cortes', upload.single('image'), (req, res) => {
    const { name, description } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name || !image_url) {
        return res.status(400).send('Name and image are required');
    }
    const query = 'INSERT INTO cortes_destacados (name, description, image_url) VALUES (?, ?, ?)';
    db.query(query, [name, description, image_url], (err, result) => {
        if (err) {
            res.status(500).send('Error adding new cut');
            return;
        }
        res.status(201).send({ id: result.insertId, name, description, image_url });
    });
});

app.put('/api/cortes/:id', upload.single('image'), (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;
    let imageUrl;

    if (req.file) {
        imageUrl = `/uploads/${req.file.filename}`;
    } else {
        imageUrl = req.body.image_url;
    }

    if (!name) {
        return res.status(400).send('Name is required');
    }

    const query = 'UPDATE cortes_destacados SET name = ?, description = ?, image_url = ? WHERE id = ?';
    db.query(query, [name, description, imageUrl, id], (err, result) => {
        if (err) {
            res.status(500).send('Error updating cut');
            return;
        }
        res.send('Cut updated successfully');
    });
});

app.delete('/api/cortes/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM cortes_destacados WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar el corte:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Corte no encontrado' });
        }
        res.json({ message: 'Corte eliminado correctamente' });
    });
});

// Endpoint para actualizar la descripción principal de un corte y marcarlo como principal
app.put('/api/cortes/principal/:id', (req, res) => {
    const { id } = req.params;
    const { descripcion_principal } = req.body;

    if (descripcion_principal === undefined) {
        return res.status(400).json({ message: 'La descripción principal es requerida' });
    }

    // Actualizar la descripción principal Y cambiar el rol a 'Principal'
    const sql = 'UPDATE cortes SET descripcion_principal = ?, rol = ? WHERE id = ?';
    db.query(sql, [descripcion_principal, 'Principal', id], (err, result) => {
        if (err) {
            console.error('Error al actualizar la descripción principal:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Corte no encontrado' });
        }
        res.json({ message: 'Corte designado como principal correctamente' });
    });
});

// Endpoint para marcar un corte como destacado y actualizar su información
app.put('/api/cortes/destacado/:id', upload.single('imagen_destacado'), (req, res) => {
    const { id } = req.params;
    const { descripcion_destacado } = req.body;
    
    // Si hay imagen nueva, usar esa; si no, mantener la existente o NULL
    const imagen_destacado = req.file ? `/uploads/${req.file.filename}` : req.body.imagen_destacado_existente || null;

    // Marcar como destacado (destacado = 1)
    const sql = 'UPDATE cortes SET destacado = 1, descripcion_destacado = ?, imagen_destacado = ? WHERE id = ?';
    
    db.query(sql, [descripcion_destacado, imagen_destacado, id], (err, result) => {
        if (err) {
            console.error('Error al marcar como destacado:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Corte no encontrado' });
        }
        res.json({ 
            message: 'Corte marcado como destacado correctamente',
            imagen_destacado: imagen_destacado
        });
    });
});

app.get('/api/cortes_admin', (req, res) => {
    const query = 'SELECT id, nombre, descripcion, precio, imagen, destacado, corte_principal_id, rol, descripcion_principal, imagen_destacado, descripcion_destacado FROM cortes ORDER BY id';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener los cortes:', err);
            res.status(500).send('Error al obtener los cortes.');
            return;
        }
        res.json(results);
    });
});

app.post('/api/cortes_admin', upload.single('imagen'), (req, res) => {
    const { nombre, descripcion, precio } = req.body;
    const imagen = req.file ? `/uploads/${req.file.filename}` : null;

    if (!nombre || !imagen) {
        return res.status(400).send('El nombre y la imagen son obligatorios.');
    }

    const query = 'INSERT INTO cortes (nombre, descripcion, precio, imagen, corte_principal_id) VALUES (?, ?, ?, ?, NULL)';
    
    db.query(query, [nombre, descripcion, precio, imagen], (err, result) => {
        if (err) {
            console.error('Error al guardar el corte:', err);
            res.status(500).send('Error al guardar el nuevo corte.');
            return;
        }
        res.status(201).send({ id: result.insertId, message: 'Corte guardado exitosamente' });
    });
});

app.put('/api/cortes_admin/:id', upload.single('imagen'), (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, precio } = req.body;
    
    let query;
    const params = [nombre, descripcion, precio];

    if (req.file) {
        const imagen = `/uploads/${req.file.filename}`;
        query = 'UPDATE cortes SET nombre = ?, descripcion = ?, precio = ?, imagen = ? WHERE id = ?';
        params.push(imagen, id);
    } else {
        query = 'UPDATE cortes SET nombre = ?, descripcion = ?, precio = ? WHERE id = ?';
        params.push(id);
    }

    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Error al actualizar el corte:', err);
            res.status(500).send('Error al actualizar el corte.');
            return;
        }
        res.status(200).send({ message: 'Corte actualizado exitosamente' });
    });
});

// Eliminar corte
app.delete('/api/cortes_admin/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM cortes WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar el corte:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Corte no encontrado' });
        }
        res.json({ message: 'Corte eliminado correctamente' });
    });
});

// Obtener un corte específico por ID
app.get('/api/cortes_admin/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM cortes WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener el corte:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Corte no encontrado' });
        }
        res.json(results[0]);
    });
});

// Endpoint para obtener solo los cortes principales
app.get('/api/cortes/principales', (req, res) => {
    const query = 'SELECT * FROM cortes WHERE rol = ? ORDER BY id';
    db.query(query, ['Principal'], (err, results) => {
        if (err) {
            console.error('Error al obtener los cortes principales:', err);
            res.status(500).json({ message: 'Error al obtener los cortes principales' });
            return;
        }
        res.json(results);
    });
});

// Endpoint para obtener los cortes relacionados a un principal
app.get('/api/cortes/relacionados/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM cortes WHERE corte_principal_id = ? ORDER BY id';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener los cortes relacionados:', err);
            res.status(500).json({ message: 'Error al obtener los cortes relacionados' });
            return;
        }
        res.json(results);
    });
});

// Endpoint para obtener cortes disponibles (sin rol o ya relacionados a un principal específico)
app.get('/api/cortes/disponibles/:principalId', (req, res) => {
    const { principalId } = req.params;
    let query = 'SELECT * FROM cortes WHERE (rol IS NULL OR rol = ?) OR (corte_principal_id = ?) ORDER BY nombre';
    const params = ['Relacionado', principalId];
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error al obtener cortes disponibles:', err);
            res.status(500).json({ message: 'Error al obtener cortes disponibles' });
            return;
        }
        res.json(results);
    });
});

// Endpoint para relacionar cortes a un principal
app.put('/api/cortes/relacionar/:id', (req, res) => {
    const { id } = req.params; // ID del corte principal
    const { relacionados } = req.body; // Array de IDs de cortes relacionados [1, 2, 3, 4]

    if (!Array.isArray(relacionados) || relacionados.length > 4) {
        return res.status(400).json({ message: 'Debe proporcionar un array de hasta 4 IDs de cortes relacionados' });
    }

    // Primero, desvinculamos todos los cortes que estaban relacionados a este principal
    const queryReset = 'UPDATE cortes SET corte_principal_id = NULL, rol = NULL WHERE corte_principal_id = ?';
    
    db.query(queryReset, [id], (err) => {
        if (err) {
            console.error('Error al resetear relaciones:', err);
            return res.status(500).json({ message: 'Error al resetear relaciones' });
        }

        // Si no hay relacionados, terminamos aquí
        if (relacionados.length === 0) {
            return res.json({ message: 'Relaciones actualizadas correctamente' });
        }

        // Ahora vinculamos los nuevos cortes relacionados
        const queryUpdate = 'UPDATE cortes SET corte_principal_id = ?, rol = ? WHERE id IN (?)';
        
        db.query(queryUpdate, [id, 'Relacionado', relacionados], (err, result) => {
            if (err) {
                console.error('Error al actualizar relaciones:', err);
                return res.status(500).json({ message: 'Error al actualizar relaciones' });
            }
            res.json({ message: 'Relaciones actualizadas correctamente', affectedRows: result.affectedRows });
        });
    });
});

// Endpoint para obtener cortes principales con sus relacionados (para el carrusel del frontend)
app.get('/api/cortes/principales-con-relacionados', (req, res) => {
    // Obtener todos los cortes principales
    const queryPrincipales = 'SELECT * FROM cortes WHERE rol = ? ORDER BY id';
    
    db.query(queryPrincipales, ['Principal'], (err, principales) => {
        if (err) {
            console.error('Error al obtener cortes principales:', err);
            return res.status(500).json({ message: 'Error al obtener cortes principales' });
        }

        if (principales.length === 0) {
            return res.json([]);
        }

        // Para cada principal, obtener sus relacionados
        const promises = principales.map(principal => {
            return new Promise((resolve, reject) => {
                const queryRelacionados = 'SELECT * FROM cortes WHERE corte_principal_id = ? ORDER BY id LIMIT 4';
                db.query(queryRelacionados, [principal.id], (err, relacionados) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            id: principal.id,
                            name: principal.nombre,
                            description: principal.descripcion_principal || principal.descripcion,
                            mainImage: principal.imagen,
                            price: principal.precio,
                            relatedImages: relacionados.map(rel => ({
                                id: rel.id,
                                name: rel.nombre,
                                url: `url("${rel.imagen}")`,
                                image: rel.imagen,
                                price: rel.precio
                            }))
                        });
                    }
                });
            });
        });

        Promise.all(promises)
            .then(results => res.json(results))
            .catch(error => {
                console.error('Error al obtener relacionados:', error);
                res.status(500).json({ message: 'Error al obtener los cortes con relacionados' });
            });
    });
});

// ==================== ENDPOINTS PARA BARBAS ====================

// Obtener todas las barbas para el panel admin
app.get('/api/barbas_admin', (req, res) => {
    const query = 'SELECT id, nombre, descripcion, precio, imagen, destacado, barba_principal_id, rol, descripcion_principal, imagen_destacado, descripcion_destacado FROM barbas ORDER BY id';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener las barbas:', err);
            res.status(500).send('Error al obtener las barbas.');
            return;
        }
        res.json(results);
    });
});

// Crear nueva barba
app.post('/api/barbas_admin', upload.single('imagen'), (req, res) => {
    const { nombre, descripcion, precio } = req.body;
    const imagen = req.file ? `/uploads/${req.file.filename}` : null;

    if (!nombre || !imagen) {
        return res.status(400).send('El nombre y la imagen son obligatorios.');
    }

    const query = 'INSERT INTO barbas (nombre, descripcion, precio, imagen, barba_principal_id) VALUES (?, ?, ?, ?, NULL)';
    
    db.query(query, [nombre, descripcion, precio, imagen], (err, result) => {
        if (err) {
            console.error('Error al guardar la barba:', err);
            res.status(500).send('Error al guardar la nueva barba.');
            return;
        }
        res.status(201).send({ id: result.insertId, message: 'Barba guardada exitosamente' });
    });
});

// Actualizar barba existente
app.put('/api/barbas_admin/:id', upload.single('imagen'), (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, precio } = req.body;
    
    let query;
    const params = [nombre, descripcion, precio];

    if (req.file) {
        const imagen = `/uploads/${req.file.filename}`;
        query = 'UPDATE barbas SET nombre = ?, descripcion = ?, precio = ?, imagen = ? WHERE id = ?';
        params.push(imagen, id);
    } else {
        query = 'UPDATE barbas SET nombre = ?, descripcion = ?, precio = ? WHERE id = ?';
        params.push(id);
    }

    db.query(query, params, (err, result) => {
        if (err) {
            console.error('Error al actualizar la barba:', err);
            res.status(500).send('Error al actualizar la barba.');
            return;
        }
        res.status(200).send({ message: 'Barba actualizada exitosamente' });
    });
});

// Eliminar barba
app.delete('/api/barbas_admin/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM barbas WHERE id = ?';
    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar la barba:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Barba no encontrada' });
        }
        res.json({ message: 'Barba eliminada correctamente' });
    });
});

// Obtener una barba específica por ID
app.get('/api/barbas_admin/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM barbas WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener la barba:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Barba no encontrada' });
        }
        res.json(results[0]);
    });
});

// Marcar barba como principal
app.put('/api/barbas/principal/:id', (req, res) => {
    const { id } = req.params;
    const { descripcion_principal } = req.body;

    if (descripcion_principal === undefined) {
        return res.status(400).json({ message: 'La descripción principal es requerida' });
    }

    const sql = 'UPDATE barbas SET descripcion_principal = ?, rol = ? WHERE id = ?';
    db.query(sql, [descripcion_principal, 'Principal', id], (err, result) => {
        if (err) {
            console.error('Error al actualizar la descripción principal:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Barba no encontrada' });
        }
        res.json({ message: 'Barba designada como principal correctamente' });
    });
});

// Marcar barba como destacada
app.put('/api/barbas/destacado/:id', upload.single('imagen_destacado'), (req, res) => {
    const { id } = req.params;
    const { descripcion_destacado } = req.body;
    
    const imagen_destacado = req.file ? `/uploads/${req.file.filename}` : req.body.imagen_destacado_existente || null;

    const sql = 'UPDATE barbas SET destacado = 1, descripcion_destacado = ?, imagen_destacado = ? WHERE id = ?';
    
    db.query(sql, [descripcion_destacado, imagen_destacado, id], (err, result) => {
        if (err) {
            console.error('Error al marcar como destacado:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Barba no encontrada' });
        }
        res.json({ 
            message: 'Barba marcada como destacada correctamente',
            imagen_destacado: imagen_destacado
        });
    });
});

// Obtener solo las barbas principales
app.get('/api/barbas/principales', (req, res) => {
    const query = 'SELECT * FROM barbas WHERE rol = ? ORDER BY id';
    db.query(query, ['Principal'], (err, results) => {
        if (err) {
            console.error('Error al obtener las barbas principales:', err);
            res.status(500).json({ message: 'Error al obtener las barbas principales' });
            return;
        }
        res.json(results);
    });
});

// Obtener barbas relacionadas a una principal
app.get('/api/barbas/relacionados/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM barbas WHERE barba_principal_id = ? ORDER BY id';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener barbas relacionadas:', err);
            res.status(500).json({ message: 'Error al obtener barbas relacionadas' });
            return;
        }
        res.json(results);
    });
});

// Obtener barbas disponibles para relacionar
app.get('/api/barbas/disponibles/:principalId', (req, res) => {
    const { principalId } = req.params;
    let query = 'SELECT * FROM barbas WHERE (rol IS NULL OR rol = ?) OR (barba_principal_id = ?) ORDER BY nombre';
    const params = ['Relacionado', principalId];
    
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error al obtener barbas disponibles:', err);
            res.status(500).json({ message: 'Error al obtener barbas disponibles' });
            return;
        }
        res.json(results);
    });
});

// Relacionar barbas a una principal
app.put('/api/barbas/relacionar/:id', (req, res) => {
    const { id } = req.params;
    const { relacionados } = req.body;

    if (!Array.isArray(relacionados) || relacionados.length > 4) {
        return res.status(400).json({ message: 'Debe proporcionar un array de hasta 4 IDs de barbas relacionadas' });
    }

    const queryReset = 'UPDATE barbas SET barba_principal_id = NULL, rol = NULL WHERE barba_principal_id = ?';
    
    db.query(queryReset, [id], (err) => {
        if (err) {
            console.error('Error al resetear relaciones:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }

        if (relacionados.length === 0) {
            return res.json({ message: 'Relaciones actualizadas correctamente', affectedRows: 0 });
        }

        const queryUpdate = 'UPDATE barbas SET barba_principal_id = ?, rol = ? WHERE id IN (?)';
        
        db.query(queryUpdate, [id, 'Relacionado', relacionados], (err, result) => {
            if (err) {
                console.error('Error al relacionar barbas:', err);
                return res.status(500).json({ message: 'Error en el servidor' });
            }
            res.json({ message: 'Barbas relacionadas correctamente', affectedRows: result.affectedRows });
        });
    });
});

// Obtener barbas principales con sus relacionadas (para el carrusel del frontend)
app.get('/api/barbas/principales-con-relacionados', (req, res) => {
    const queryPrincipales = 'SELECT * FROM barbas WHERE rol = ? ORDER BY id';
    
    db.query(queryPrincipales, ['Principal'], (err, principales) => {
        if (err) {
            console.error('Error al obtener barbas principales:', err);
            return res.status(500).json({ message: 'Error al obtener barbas principales' });
        }

        if (principales.length === 0) {
            return res.json([]);
        }

        const promises = principales.map(principal => {
            return new Promise((resolve, reject) => {
                const queryRelacionados = 'SELECT * FROM barbas WHERE barba_principal_id = ? ORDER BY id LIMIT 4';
                db.query(queryRelacionados, [principal.id], (err, relacionados) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            id: principal.id,
                            name: principal.nombre,
                            description: principal.descripcion_principal || principal.descripcion,
                            mainImage: principal.imagen,
                            price: principal.precio,
                            relatedImages: relacionados.map(rel => ({
                                id: rel.id,
                                name: rel.nombre,
                                url: `url("${rel.imagen}")`,
                                price: rel.precio
                            }))
                        });
                    }
                });
            });
        });

        Promise.all(promises)
            .then(results => res.json(results))
            .catch(error => {
                console.error('Error al obtener relacionados:', error);
                res.status(500).json({ message: 'Error al obtener las barbas con relacionadas' });
            });
    });
});

// Obtener barbas destacadas para el slider del index principal
app.get('/api/barbas/destacadas', (req, res) => {
    const query = `
        SELECT 
            id,
            nombre as name,
            descripcion_destacado as description,
            imagen_destacado as image_url
        FROM barbas 
        WHERE destacado = 1 
        AND imagen_destacado IS NOT NULL 
        AND descripcion_destacado IS NOT NULL
        ORDER BY id ASC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener barbas destacadas:', err);
            res.status(500).send('Error fetching featured beards');
            return;
        }
        res.json(results);
    });
});

// ==================== ENDPOINTS PARA MOVER ENTRE TABLAS ====================

// Mover de cortes a barbas
app.post('/api/mover/corte-a-barba/:id', (req, res) => {
    const { id } = req.params;
    
    // Primero obtener los datos del corte
    db.query('SELECT * FROM cortes WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error al obtener el corte:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'Corte no encontrado' });
        }
        
        const corte = results[0];
        
        // Insertar en la tabla barbas con los mismos datos
        const queryInsert = `INSERT INTO barbas (nombre, descripcion, precio, imagen, destacado, rol, descripcion_principal, imagen_destacado, descripcion_destacado) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.query(queryInsert, [
            corte.nombre,
            corte.descripcion,
            corte.precio,
            corte.imagen,
            corte.destacado,
            corte.rol,
            corte.descripcion_principal,
            corte.imagen_destacado,
            corte.descripcion_destacado
        ], (err, insertResult) => {
            if (err) {
                console.error('Error al insertar en barbas:', err);
                return res.status(500).json({ message: 'Error al mover a barbas' });
            }
            
            // Eliminar de la tabla cortes
            db.query('DELETE FROM cortes WHERE id = ?', [id], (err) => {
                if (err) {
                    console.error('Error al eliminar de cortes:', err);
                    return res.status(500).json({ message: 'Error al completar el movimiento' });
                }
                
                res.json({ 
                    message: `"${corte.nombre}" movido exitosamente de Cortes a Barbas`,
                    newId: insertResult.insertId
                });
            });
        });
    });
});

// Mover de barbas a cortes
app.post('/api/mover/barba-a-corte/:id', (req, res) => {
    const { id } = req.params;
    
    // Primero obtener los datos de la barba
    db.query('SELECT * FROM barbas WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error al obtener la barba:', err);
            return res.status(500).json({ message: 'Error en el servidor' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'Barba no encontrada' });
        }
        
        const barba = results[0];
        
        // Insertar en la tabla cortes con los mismos datos
        const queryInsert = `INSERT INTO cortes (nombre, descripcion, precio, imagen, destacado, rol, descripcion_principal, imagen_destacado, descripcion_destacado) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.query(queryInsert, [
            barba.nombre,
            barba.descripcion,
            barba.precio,
            barba.imagen,
            barba.destacado,
            barba.rol,
            barba.descripcion_principal,
            barba.imagen_destacado,
            barba.descripcion_destacado
        ], (err, insertResult) => {
            if (err) {
                console.error('Error al insertar en cortes:', err);
                return res.status(500).json({ message: 'Error al mover a cortes' });
            }
            
            // Eliminar de la tabla barbas
            db.query('DELETE FROM barbas WHERE id = ?', [id], (err) => {
                if (err) {
                    console.error('Error al eliminar de barbas:', err);
                    return res.status(500).json({ message: 'Error al completar el movimiento' });
                }
                
                res.json({ 
                    message: `"${barba.nombre}" movido exitosamente de Barbas a Cortes`,
                    newId: insertResult.insertId
                });
            });
        });
    });
});

// ==================== ENDPOINTS PARA BARBEROS ====================

// GET - Obtener todos los barberos
app.get('/api/barberos', (req, res) => {
    const query = 'SELECT * FROM barberos ORDER BY id ASC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener barberos:', err);
            return res.status(500).json({ message: 'Error al obtener barberos' });
        }
        res.json(results);
    });
});

// GET - Obtener un barbero específico por ID
app.get('/api/barberos/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM barberos WHERE id = ?';
    
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener barbero:', err);
            return res.status(500).json({ message: 'Error al obtener barbero' });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Barbero no encontrado' });
        }
        res.json(results[0]);
    });
});

// POST - Crear un nuevo barbero
app.post('/api/barberos', upload.single('imagen'), (req, res) => {
    const {
        nombre, tipo, descripcion,
        corte1_id, corte2_id, corte3_id, corte4_id,
        barba1_id, barba2_id, barba3_id, barba4_id,
        horario_manana, horario_tarde
    } = req.body;
    
    const imagen = req.file ? `/uploads/${req.file.filename}` : null;
    
    const query = `
        INSERT INTO barberos (
            nombre, tipo, descripcion, imagen,
            corte1_id, corte2_id, corte3_id, corte4_id,
            barba1_id, barba2_id, barba3_id, barba4_id,
            horario_manana, horario_tarde
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(query, [
        nombre, tipo, descripcion, imagen,
        corte1_id || null, corte2_id || null, corte3_id || null, corte4_id || null,
        barba1_id || null, barba2_id || null, barba3_id || null, barba4_id || null,
        horario_manana || null, horario_tarde || null
    ], (err, result) => {
        if (err) {
            console.error('Error al crear barbero:', err);
            return res.status(500).json({ message: 'Error al crear barbero' });
        }
        res.json({ 
            message: 'Barbero creado exitosamente',
            id: result.insertId
        });
    });
});

// PUT - Actualizar un barbero existente
app.put('/api/barberos/:id', upload.single('imagen'), (req, res) => {
    const { id } = req.params;
    const {
        nombre, tipo, descripcion,
        corte1_id, corte2_id, corte3_id, corte4_id,
        barba1_id, barba2_id, barba3_id, barba4_id,
        horario_manana, horario_tarde
    } = req.body;
    
    let query, params;
    
    if (req.file) {
        query = `
            UPDATE barberos SET
                nombre = ?, tipo = ?, descripcion = ?, imagen = ?,
                corte1_id = ?, corte2_id = ?, corte3_id = ?, corte4_id = ?,
                barba1_id = ?, barba2_id = ?, barba3_id = ?, barba4_id = ?,
                horario_manana = ?, horario_tarde = ?
            WHERE id = ?
        `;
        params = [
            nombre, tipo, descripcion, `/uploads/${req.file.filename}`,
            corte1_id || null, corte2_id || null, corte3_id || null, corte4_id || null,
            barba1_id || null, barba2_id || null, barba3_id || null, barba4_id || null,
            horario_manana || null, horario_tarde || null,
            id
        ];
    } else {
        query = `
            UPDATE barberos SET
                nombre = ?, tipo = ?, descripcion = ?,
                corte1_id = ?, corte2_id = ?, corte3_id = ?, corte4_id = ?,
                barba1_id = ?, barba2_id = ?, barba3_id = ?, barba4_id = ?,
                horario_manana = ?, horario_tarde = ?
            WHERE id = ?
        `;
        params = [
            nombre, tipo, descripcion,
            corte1_id || null, corte2_id || null, corte3_id || null, corte4_id || null,
            barba1_id || null, barba2_id || null, barba3_id || null, barba4_id || null,
            horario_manana || null, horario_tarde || null,
            id
        ];
    }
    
    db.query(query, params, (err) => {
        if (err) {
            console.error('Error al actualizar barbero:', err);
            return res.status(500).json({ message: 'Error al actualizar barbero' });
        }
        res.json({ message: 'Barbero actualizado exitosamente' });
    });
});

// DELETE - Eliminar un barbero
app.delete('/api/barberos/:id', (req, res) => {
    const { id } = req.params;
    
    db.query('DELETE FROM barberos WHERE id = ?', [id], (err) => {
        if (err) {
            console.error('Error al eliminar barbero:', err);
            return res.status(500).json({ message: 'Error al eliminar barbero' });
        }
        res.json({ message: 'Barbero eliminado exitosamente' });
    });
});

// ==================== ENDPOINTS DE RESERVAS ====================

// POST /api/reservas - Crear una nueva reserva (requiere autenticación)
app.post('/api/reservas', verificarToken, (req, res) => {
    const {
        usuario_id,
        barbero_id,
        servicio_nombre,
        servicio_tipo,
        servicio_adicional,
        servicio_adicional_id,
        servicio_adicional_nombre,
        servicio_adicional_tipo,
        fecha,
        hora,
        cliente_nombre,
        cliente_telefono,
        estado
    } = req.body;

    // Validar que el usuario autenticado coincida con el usuario_id
    if (req.userId !== usuario_id) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para crear reservas para otro usuario'
        });
    }

    // Validaciones básicas
    if (!barbero_id || !servicio_nombre || !servicio_tipo || !fecha || !hora || !cliente_nombre || !cliente_telefono) {
        return res.status(400).json({
            success: false,
            error: 'Todos los campos obligatorios deben estar completos'
        });
    }

    // Validar que la fecha no sea en el pasado
    const fechaReserva = new Date(fecha);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (fechaReserva < hoy) {
        return res.status(400).json({
            success: false,
            error: 'No se pueden hacer reservas en fechas pasadas'
        });
    }

    // Verificar disponibilidad del barbero en esa fecha y hora
    const queryDisponibilidad = `
        SELECT id FROM reservas
        WHERE barbero_id = ?
        AND fecha = ?
        AND hora = ?
        AND estado IN ('pendiente', 'confirmada')
    `;

    db.query(queryDisponibilidad, [barbero_id, fecha, hora], (err, results) => {
        if (err) {
            console.error('Error al verificar disponibilidad:', err);
            return res.status(500).json({
                success: false,
                error: 'Error al verificar disponibilidad'
            });
        }

        if (results.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'El barbero no está disponible en ese horario. Por favor selecciona otra hora.'
            });
        }

        // Insertar la reserva
        const queryInsert = `
            INSERT INTO reservas (
                usuario_id,
                barbero_id,
                servicio_nombre,
                servicio_tipo,
                servicio_adicional,
                servicio_adicional_id,
                servicio_adicional_nombre,
                servicio_adicional_tipo,
                fecha,
                hora,
                cliente_nombre,
                cliente_telefono,
                estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            usuario_id,
            barbero_id,
            servicio_nombre,
            servicio_tipo,
            servicio_adicional || false,
            servicio_adicional_id || null,
            servicio_adicional_nombre || null,
            servicio_adicional_tipo || null,
            fecha,
            hora,
            cliente_nombre,
            cliente_telefono,
            estado || 'pendiente'
        ];

        db.query(queryInsert, values, (err, result) => {
            if (err) {
                console.error('Error al crear reserva:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Error al crear la reserva'
                });
            }

            res.status(201).json({
                success: true,
                message: 'Reserva creada exitosamente',
                reserva_id: result.insertId
            });

            console.log(`✅ Reserva creada - ID: ${result.insertId} | Usuario: ${usuario_id} | Barbero: ${barbero_id}`);
        });
    });
});

// GET /api/reservas/usuario/:id - Obtener todas las reservas de un usuario (requiere autenticación)
app.get('/api/reservas/usuario/:id', verificarToken, (req, res) => {
    const { id } = req.params;

    // Validar que el usuario autenticado coincida con el ID solicitado
    if (req.userId !== parseInt(id)) {
        return res.status(403).json({
            success: false,
            error: 'No tienes permiso para ver las reservas de otro usuario'
        });
    }

    const query = `
        SELECT
            r.*,
            b.nombre AS barbero_nombre,
            b.imagen AS barbero_imagen
        FROM reservas r
        LEFT JOIN barberos b ON r.barbero_id = b.id
        WHERE r.usuario_id = ?
        ORDER BY r.id ASC
    `;

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener reservas:', err);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener las reservas'
            });
        }

        res.json({
            success: true,
            reservas: results
        });
    });
});

// GET /api/reservas/:id - Obtener una reserva específica (requiere autenticación)
app.get('/api/reservas/:id', verificarToken, (req, res) => {
    const { id } = req.params;

    const query = `
        SELECT
            r.*,
            b.nombre AS barbero_nombre,
            b.imagen AS barbero_imagen,
            u.nombre_completo AS usuario_nombre,
            u.email AS usuario_email
        FROM reservas r
        LEFT JOIN barberos b ON r.barbero_id = b.id
        LEFT JOIN usuarios u ON r.usuario_id = u.id
        WHERE r.id = ?
    `;

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener reserva:', err);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener la reserva'
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Reserva no encontrada'
            });
        }

        // Verificar que el usuario autenticado sea el dueño de la reserva
        if (req.userId !== results[0].usuario_id) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permiso para ver esta reserva'
            });
        }

        res.json({
            success: true,
            reserva: results[0]
        });
    });
});

// PUT /api/reservas/:id/cancelar - Cancelar una reserva (requiere autenticación)
app.put('/api/reservas/:id/cancelar', verificarToken, (req, res) => {
    const { id } = req.params;
    const { motivo_cancelacion } = req.body;

    // Primero verificar que la reserva exista y pertenezca al usuario
    db.query('SELECT * FROM reservas WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Error al buscar reserva:', err);
            return res.status(500).json({
                success: false,
                error: 'Error al buscar la reserva'
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Reserva no encontrada'
            });
        }

        const reserva = results[0];

        // Verificar que el usuario autenticado sea el dueño
        if (req.userId !== reserva.usuario_id) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permiso para cancelar esta reserva'
            });
        }

        // Verificar que la reserva no esté ya cancelada o completada
        if (reserva.estado === 'cancelada') {
            return res.status(400).json({
                success: false,
                error: 'Esta reserva ya está cancelada'
            });
        }

        if (reserva.estado === 'completada') {
            return res.status(400).json({
                success: false,
                error: 'No se puede cancelar una reserva completada'
            });
        }

        // Cancelar la reserva
        const query = `
            UPDATE reservas
            SET estado = 'cancelada',
                motivo_cancelacion = ?
            WHERE id = ?
        `;

        db.query(query, [motivo_cancelacion || 'Cancelada por el usuario', id], (err) => {
            if (err) {
                console.error('Error al cancelar reserva:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Error al cancelar la reserva'
                });
            }

            res.json({
                success: true,
                message: 'Reserva cancelada exitosamente'
            });

            console.log(`❌ Reserva cancelada - ID: ${id} | Usuario: ${req.userId}`);
        });
    });
});

// GET /api/reservas/barbero/:id - Obtener reservas de un barbero (sin autenticación para admins)
app.get('/api/reservas/barbero/:id', (req, res) => {
    const { id } = req.params;
    const { fecha } = req.query; // Opcional: filtrar por fecha

    let query = `
        SELECT
            r.*,
            u.nombre_completo AS usuario_nombre,
            u.email AS usuario_email
        FROM reservas r
        LEFT JOIN usuarios u ON r.usuario_id = u.id
        WHERE r.barbero_id = ?
    `;

    const params = [id];

    if (fecha) {
        query += ' AND r.fecha = ?';
        params.push(fecha);
    }

    query += ' ORDER BY r.fecha ASC, r.hora ASC';

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error al obtener reservas del barbero:', err);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener las reservas'
            });
        }

        res.json({
            success: true,
            reservas: results
        });
    });
});

// ==================== ENDPOINTS DE PRODUCTOS ====================

// GET /api/productos - Obtener todos los productos
app.get('/api/productos', (req, res) => {
    const query = 'SELECT * FROM productos ORDER BY id DESC';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener los productos'
            });
        }

        res.json({
            success: true,
            productos: results
        });
    });
});

// GET /api/productos/:id - Obtener un producto específico
app.get('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM productos WHERE id = ?';

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error al obtener producto:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener el producto'
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            producto: results[0]
        });
    });
});

// POST /api/productos - Crear nuevo producto (SOLO ADMIN)
// FIX NIKTO: Proteger con middleware verificarAdmin
app.post('/api/productos', verificarAdmin, upload.single('imagen'), (req, res) => {
    const { marca, nombre, descripcion, categoria, tipo, tamano, precio, stock } = req.body;

    // Validaciones
    if (!marca || !nombre || !descripcion || !categoria || !tipo || !tamano || !precio || !stock) {
        return res.status(400).json({
            success: false,
            message: 'Todos los campos son obligatorios'
        });
    }

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'Debes subir una imagen del producto'
        });
    }

    const imagenPath = '/uploads/' + req.file.filename;

    const query = `
        INSERT INTO productos (marca, nombre, descripcion, categoria, tipo, tamano, precio, stock, imagen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [marca, nombre, descripcion, categoria, tipo, tamano, precio, stock, imagenPath];

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error al crear producto:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al registrar el producto'
            });
        }

        res.json({
            success: true,
            message: 'Producto registrado exitosamente',
            producto_id: result.insertId
        });
    });
});

// PUT /api/productos/:id - Actualizar producto (SOLO ADMIN)
// FIX NIKTO: Proteger con middleware verificarAdmin
app.put('/api/productos/:id', verificarAdmin, upload.single('imagen'), (req, res) => {
    const { id } = req.params;
    const { marca, nombre, descripcion, categoria, tipo, tamano, precio, stock } = req.body;

    // Validaciones
    if (!marca || !nombre || !descripcion || !categoria || !tipo || !tamano || !precio || !stock) {
        return res.status(400).json({
            success: false,
            message: 'Todos los campos son obligatorios'
        });
    }

    let query, values;

    if (req.file) {
        // Si hay nueva imagen
        const imagenPath = '/uploads/' + req.file.filename;
        query = `
            UPDATE productos
            SET marca = ?, nombre = ?, descripcion = ?, categoria = ?, tipo = ?, tamano = ?, precio = ?, stock = ?, imagen = ?
            WHERE id = ?
        `;
        values = [marca, nombre, descripcion, categoria, tipo, tamano, precio, stock, imagenPath, id];
    } else {
        // Sin nueva imagen
        query = `
            UPDATE productos
            SET marca = ?, nombre = ?, descripcion = ?, categoria = ?, tipo = ?, tamano = ?, precio = ?, stock = ?
            WHERE id = ?
        `;
        values = [marca, nombre, descripcion, categoria, tipo, tamano, precio, stock, id];
    }

    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Error al actualizar producto:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al actualizar el producto'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Producto actualizado exitosamente'
        });
    });
});

// DELETE /api/productos/:id - Eliminar producto (SOLO ADMIN)
// FIX NIKTO: Proteger con middleware verificarAdmin
app.delete('/api/productos/:id', verificarAdmin, (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM productos WHERE id = ?';

    db.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al eliminar el producto'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Producto eliminado exitosamente'
        });
    });
});

// ==================== ENDPOINT DE BÚSQUEDA UNIVERSAL ====================

// GET /api/search - Buscar en TODAS las tablas (productos, cortes, barbas)
app.get('/api/search', (req, res) => {
    const { q } = req.query; // query string: ?q=fade
    
    if (!q || q.trim().length < 2) {
        return res.json({
            success: true,
            results: []
        });
    }

    const searchTerm = `%${q.toLowerCase()}%`;
    
    // Buscar en productos (todos, sin filtro de stock)
    const queryProductos = `
        SELECT 
            id,
            'producto' as type,
            CONCAT(marca, ' - ', nombre) as name,
            CONCAT(categoria, ' • ', tamano) as category,
            precio as price,
            imagen as image
        FROM productos
        WHERE LOWER(nombre) LIKE ? 
           OR LOWER(marca) LIKE ?
           OR LOWER(categoria) LIKE ?
           OR LOWER(tipo) LIKE ?
        ORDER BY id DESC
    `;
    
    // Buscar en cortes (TODOS, sin importar rol, destacado, o si es principal)
    const queryCortes = `
        SELECT 
            id,
            'corte' as type,
            nombre as name,
            'Corte de Cabello' as category,
            precio as price,
            imagen as image
        FROM cortes
        WHERE LOWER(nombre) LIKE ?
           OR LOWER(descripcion) LIKE ?
        ORDER BY id DESC
    `;
    
    // Buscar en barbas (TODAS, sin importar rol, destacado, o si es principal)
    const queryBarbas = `
        SELECT 
            id,
            'barba' as type,
            nombre as name,
            'Arreglo de Barba' as category,
            precio as price,
            imagen as image
        FROM barbas
        WHERE LOWER(nombre) LIKE ?
           OR LOWER(descripcion) LIKE ?
        ORDER BY id DESC
    `;

    // Ejecutar las 3 queries en paralelo
    Promise.all([
        new Promise((resolve, reject) => {
            db.query(queryProductos, [searchTerm, searchTerm, searchTerm, searchTerm], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queryCortes, [searchTerm, searchTerm], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queryBarbas, [searchTerm, searchTerm], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        })
    ])
    .then(([productos, cortes, barbas]) => {
        // Combinar todos los resultados
        const allResults = [
            ...productos.map(p => ({
                ...p,
                url: `/Compra/index.html?id=${p.id}`
            })),
            ...cortes.map(c => ({
                ...c,
                url: `/Reserva/index.html?id=${c.id}&type=corte`
            })),
            ...barbas.map(b => ({
                ...b,
                url: `/Reserva/index.html?id=${b.id}&type=barba`
            }))
        ];

        res.json({
            success: true,
            results: allResults,
            count: allResults.length
        });
    })
    .catch(error => {
        console.error('Error en búsqueda universal:', error);
        res.status(500).json({
            success: false,
            message: 'Error al realizar la búsqueda'
        });
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${port}`);
    console.log(`🌐 Accesible desde la red en http://0.0.0.0:${port}`);
});