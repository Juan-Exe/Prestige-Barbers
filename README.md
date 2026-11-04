<div align="center">
  <img src="docs/docs_images/penta-sys-logo.png" alt="Penta{sys}4.0" width="110">

  # Prestige Barbers

  **Plataforma de barbería con cobro por QR Bre-B y facturación electrónica DIAN**

  Equipo **Penta{sys}4.0** · Hackathon **API Wars**

  [![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
  [![Express 5](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
  [![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=flat-square&logo=mariadb&logoColor=white)](https://mariadb.org)
  [![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
  [![Factus](https://img.shields.io/badge/Factus_API-FF6B00?style=flat-square)](https://developers.factus.com.co)

  [En producción: prestigebarber.store](https://prestigebarber.store)
</div>

---

## Qué es

Prestige Barbers nació como una plataforma de reservas y tienda para barberías. Para API Wars le integramos el ciclo de cobro y facturación completo de Colombia:

- El cliente reserva un corte o compra productos.
- Paga escaneando un **QR Bre-B** generado por **Factus Pay**.
- Al confirmarse el pago, el backend emite la **factura electrónica** ante la **DIAN** vía **Factus Facturación**, la descarga en PDF y XML, y la envía al correo del cliente.
- Si hay que corregir, se emite una **nota crédito**; si hay que cobrar algo adicional, una **nota débito**.

Nada de esto es un simulacro: las facturas se validan contra el entorno sandbox real de la DIAN y traen su CUFE.

> **Inicio rápido:** [docs/QUICK-START.md](docs/QUICK-START.md) levanta todo con Docker en 3 minutos.

---

## Equipo

| Nombre | |
|---|---|
| Juan Diego Arrieta Herrera | Penta{sys}4.0 |
| Juan Diego Díaz | Penta{sys}4.0 |
| Kevin Ayazo | Penta{sys}4.0 |
| Yerson Ochoa | Penta{sys}4.0 |
| Sebastián López | Penta{sys}4.0 |

Base del proyecto previo a la hackathon: Juan Diego Arrieta Herrera y Valentina Ojeda Pascasión.

---

## El flujo de pago y facturación

```
Cliente                Backend                 Factus Pay            Factus Facturación / DIAN
  │                       │                         │                          │
  ├─ POST /ordenes ──────►│                         │                          │
  │                       ├─ precios del servidor   │                          │
  │                       ├─ crea recaudo ─────────►│                          │
  │◄── QR + referencia ───┤◄──── QR Bre-B ──────────┤                          │
  │                       │                         │                          │
  ├─ escanea y paga ──────────────────────────────► │                          │
  │                       │◄── webhook ─────────────┤                          │
  │                       ├─ GET /collections/{ref} ►│  (nunca confía          │
  │                       │◄── estado real ─────────┤   en el webhook)         │
  │                       ├─ compara montos         │                          │
  │                       ├─ confirma la reserva    │                          │
  │                       ├─ emite factura ─────────────────────────────────► │
  │                       │◄──────────────── número + CUFE + QR DIAN ─────────┤
  │                       ├─ descarga PDF y XML ───────────────────────────────►│
  │◄── correo con la factura adjunta ───┤                                      │
  │                       │                         │                          │
  ├─ GET /mis-ordenes ───►│  "Mis Compras": factura, CUFE, QR, notas           │
```

**Dos decisiones que sostienen todo esto:**

1. **El webhook no se cree nada.** Cuando Factus Pay avisa que una orden se pagó, el backend vuelve a preguntar por la API (`GET /v1/collections/{referencia}`) y solo actúa sobre esa respuesta. La clave del webhook se compara con `crypto.timingSafeEqual` sobre hashes SHA-256. Los códigos de respuesta son deliberados: `200` cuando no queremos reintento, `500` cuando sí.

2. **Los precios se resuelven en el servidor.** El carrito del navegador solo manda identificadores y cantidades; los importes salen de la base de datos. Antes de confirmar el pago se comparan los montos contra lo que reporta la pasarela.

---

## Módulo de facturación

Todo vive en [Backend/factus/](Backend/factus/):

| Archivo | Responsabilidad |
|---|---|
| [pay-client.js](Backend/factus/pay-client.js) | Cliente de Factus Pay. Token en memoria con promesa compartida para evitar carreras, y un reintento ante `401`. |
| [facturacion-client.js](Backend/factus/facturacion-client.js) | DIAN: facturas, notas crédito, notas débito, descarga de PDF/XML. |
| [ordenes.js](Backend/factus/ordenes.js) | Lógica de órdenes: creación idempotente, confirmación de pago, anulación, cargos adicionales. |
| [webhook.js](Backend/factus/webhook.js) | Recepción y verificación de notificaciones de pago. |
| [rutas.js](Backend/factus/rutas.js) | Endpoints `/api/factus/*` con validación y control de rol. |
| [correo.js](Backend/factus/correo.js) | SMTP sobre TLS y armado MIME para enviar la factura adjunta. |

### El ciclo fiscal completo

| Documento | Prefijo | Código | Qué hace |
|---|---|---|---|
| Factura electrónica | SETP | **CUFE** | Registra la venta ante la DIAN |
| Nota crédito | CRTE | **CUDE** | Resta o anula una factura ya validada |
| Nota débito | ND | **CUDE** | Suma un valor sobre una factura emitida |

Una factura validada por la DIAN no se borra ni se edita: se corrige con una nota que la referencia por su número. Por eso la orden anulada conserva sus datos de factura — ante la DIAN la factura sigue existiendo, lo que cambia es que queda corregida.

**Cada tipo de documento tiene su propio rango de numeración autorizado**, y la API los exige explícitamente. Mandar el rango de facturas en una nota crédito devuelve `El campo id rango de numeración es inválido`.

### Dos detalles que cuestan horas si no se saben

**El redondeo.** Factus redondea **cada línea** al céntimo y después suma. No redondea el total ni lo trunca. Un total calculado sobre la suma sin redondear falla con mensajes del tipo `Esperado: 46,899.99 - Enviado: 46,900.00`, y "arreglarlo" truncando hacia abajo rompe el caso contrario (`Esperado: 2,500.00 - Enviado: 2,499.99`). El cálculo está unificado para los tres tipos de documento:

```js
function calcularTotalDocumento(items) {
    const centimos = items.reduce((suma, i) => {
        const base = Number(i.precio_neto_unitario) * Number(i.cantidad);
        const impuesto = base * (Number(i.tasa_impuesto) / 100);
        return suma + Math.round(base * 100) + Math.round(impuesto * 100);
    }, 0);
    return (centimos / 100).toFixed(2);
}
```

**Los códigos van como texto.** `unit_measure_code: "94"` y `standard_code: "999"` son cadenas, no números. Enviarlos numéricos devuelve `422`.

### Idempotencia

La tabla de eventos lleva una clave compuesta que hace imposible procesar dos veces el mismo hecho:

```sql
UNIQUE KEY uq_facturacion_eventos_idem (fuente, referencia, evento)
```

Al crear una orden, si ya existe una pendiente para el mismo carrito se reutiliza su recaudo en vez de generar otro — así un cliente que recarga la página o reintenta un pago pendiente no acumula cobros huérfanos.

---

## API REST

### Pagos y facturación — `/api/factus`

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `POST` | `/ordenes` | Autenticado | Crea la orden y devuelve el QR Bre-B |
| `GET` | `/ordenes/:referencia` | Autenticado | Estado de la orden, factura, notas |
| `GET` | `/mis-ordenes` | Autenticado | Historial para "Mis Compras" |
| `POST` | `/ordenes/:referencia/renovar-qr` | Autenticado | Regenera un QR vencido |
| `POST` | `/ordenes/:referencia/reintentar-factura` | Admin | Reemite una factura que falló |
| `POST` | `/ordenes/:referencia/reenviar-factura` | Admin | Reenvía el correo con PDF y XML |
| `POST` | `/ordenes/:referencia/anular` | Admin | Emite nota crédito |
| `POST` | `/ordenes/:referencia/nota-debito` | Admin | Emite nota débito |
| `POST` | `/webhook/pay` | Clave de webhook | Notificación de pago de Factus Pay |

> Los endpoints de administración verifican el rol **contra la base de datos**, no contra el token: un JWT viejo de alguien que dejó de ser admin no sirve.

### Autenticación — `/api/auth`

`POST /register` · `POST /login` · `GET /me` · `POST /change-password` · `DELETE /delete-account` · `POST /logout`

### Catálogos y reservas

`GET /api/cortes` · `GET /api/barberos` · `GET /api/productos`
`POST /api/reservas` · `GET /api/reservas/usuario/:id` · `PUT /api/reservas/:id/cancelar`

### Administración

`POST|PUT|DELETE /api/barberos/:id` · `POST|PUT /api/productos/:id`

---

## Puesta en marcha

### Con Docker

```bash
docker compose up -d --build
```

> **El frontend está dentro de la imagen.** Solo `./Backend` se monta como volumen, así que **cualquier cambio en `Frontend/` necesita `--build`**. Un `docker compose restart` no lo recoge.

| Servicio | URL | Credenciales |
|---|---|---|
| Aplicación | http://localhost:3000 | |
| Adminer | http://localhost:8080 | `prestige_user` / ver `.env` |
| MariaDB | localhost:3306 | `prestige_user` / ver `.env` |

Atajos: `docker.bat up` en Windows, `./docker.sh up` en macOS y Linux.

### En producción

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> Omitir los `-f` hace que Docker Compose tome `docker-compose.override.yml`, que fuerza modo desarrollo. En producción los `-f` no son opcionales.

Detalles de VPS, Nginx, Let's Encrypt y firewall: [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

### Migraciones

Se aplican en orden y todas son idempotentes — correrlas de nuevo no rompe nada:

```
Backend/database/
├── 002-facturacion.sql      Órdenes, items y eventos idempotentes
├── 003-datos-fiscales.sql   Identificación tributaria del cliente
├── 004-factura-completa.sql Metadatos DIAN: CUFE, QR, resolución
├── 005-notas-credito.sql    Anulación de facturas
└── 006-notas-debito.sql     Cargos adicionales (tabla propia)
```

La nota débito va en su **propia tabla** y no en columnas de la orden: una factura puede recibir varias a lo largo del tiempo (un interés este mes, un gasto por cobrar el siguiente), mientras la nota crédito anula la factura entera y por eso cabe en la orden.

---

## Variables de entorno

Partir de [.env.example](.env.example). Las que añadió la integración:

```env
# Factus Pay — pasarela de cobro QR Bre-B
FACTUS_PAY_BASE_URL=https://pay-api-sandbox.factus.com.co
FACTUS_PAY_EMAIL=
FACTUS_PAY_PASSWORD=
FACTUS_PAY_WEBHOOK_KEY=
FACTUS_PAY_TIMEOUT_MS=15000
FACTUS_QR_EXPIRATION_SECONDS=900

# Factus Facturación — DIAN
FACTUS_API_BASE_URL=https://api-sandbox.factus.com.co
FACTUS_CLIENT_ID=
FACTUS_CLIENT_SECRET=
FACTUS_USERNAME=
FACTUS_PASSWORD=
FACTUS_NUMBERING_RANGE_ID=
FACTUS_DEFAULT_MUNICIPALITY_CODE=
FACTUS_TIMEOUT_MS=20000
FACTUS_RATE_LIMIT_MAX=60

# Envío de la factura por correo
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_FROM_NAME=Prestige Barbers
```

> El entorno sandbox de Factus tiene una **lista blanca de correos que no se puede editar**. Por eso el backend descarga el PDF y el XML y los envía por su propio SMTP, en lugar de delegarle el envío a Factus.

El token de Factus Pay **no expira, pero se revoca en cada autenticación nueva**: hay un solo token activo por usuario. Dos instancias apuntando a las mismas credenciales se invalidan mutuamente.

---

## Seguridad

| Aspecto | Estado |
|---|---|
| Headers | Helmet.js, 7/7 configurados |
| CSP | `'self'`, sin IPs embebidas |
| HSTS y `upgrade-insecure-requests` | Solo con `NODE_ENV=production` |
| CORS | Lista blanca por entorno |
| Rate limiting | Por niveles; omite `GET`; `trust proxy` activo |
| Validación | express-validator en todos los endpoints |
| SQL injection | Consultas parametrizadas |
| Contraseñas | bcrypt |
| Sesión | JWT; el rol de admin se verifica contra la BD |
| Webhook | Comparación en tiempo constante y verificación contra la API |
| Auditorías | Nessus y Nikto — [Registros de seguridad/](Registros%20de%20seguridad/) |

**Detalle del despliegue:** forzar HTTPS en desarrollo es lo que impide cargar la aplicación por IP de red local — `upgrade-insecure-requests` reescribe cada recurso a `https://` y no hay certificado para una IP privada. De ahí que ambas cabeceras estén condicionadas al entorno.

**Puertos de base de datos:** `ufw deny 3306` no basta. Docker inserta sus reglas en la cadena `DOCKER-USER`, que se evalúa antes que ufw; hay que cerrarlos ahí.

---

## Estructura

```
Prestige-Barbers/
├── Backend/
│   ├── factus/                  Pagos y facturación electrónica
│   ├── database/                Migraciones idempotentes
│   ├── uploads/                 Imágenes de barberos y productos
│   └── server.js                Monolito Express
│
├── Frontend/public/
│   ├── js/factus-checkout.js    Modal de QR, cuenta atrás y sondeo
│   ├── perfil/                  Perfil, reservas y "Mis Compras"
│   ├── Tienda/ Compra/          Catálogo y carrito
│   ├── Reserva/ Barberos/ Cortes/
│   ├── Admin/                   Panel administrativo
│   └── I-style/ I-img/ Icons/
│
├── animaciones/                 Intro animada en Canvas + exportador
├── docs/                        Documentación técnica
├── docker-compose.yml           Base
├── docker-compose.prod.yml      Producción
└── docker-compose.override.yml  Desarrollo (se aplica solo, ojo)
```

> **Nota para quien toque el perfil:** [Frontend/public/perfil/index.html](Frontend/public/perfil/index.html) **no carga `perfil.js`**. Toda su lógica está en un `<script>` en línea dentro del propio HTML. Editar `perfil.js` no tiene ningún efecto en esa página.

---

## Intro animada

[animaciones/](animaciones/) contiene un motor de animación en Canvas con el logo de Penta{sys}4.0: cuatro planos, 34 segundos, el tiempo como único parámetro, de modo que cualquier instante se puede renderizar de forma independiente y reproducible.

`exportar.cjs` usa el Chrome DevTools Protocol para capturar cada fotograma exacto y los codifica con ffmpeg a tasa constante (`keyint=1:scenecut=0`), lo que da un vídeo donde cada fotograma es clave y el montaje posterior no pierde nitidez.

---

## Documentación

| Documento | Contenido |
|---|---|
| [PLAN-FACTUS-PAY.md](docs/PLAN-FACTUS-PAY.md) | Las 6 fases de la integración, con historias de usuario y checklist |
| [DESPLIEGUE.md](docs/DESPLIEGUE.md) | VPS, Nginx, Let's Encrypt, firewall |
| [QUICK-START.md](docs/QUICK-START.md) | Arranque en 3 minutos |
| [DOCKER-SETUP.md](docs/DOCKER-SETUP.md) | Guía Docker completa |
| [ARQUITECTURA-DOCKER.md](docs/ARQUITECTURA-DOCKER.md) | Diagramas y diseño |
| [NGINX-PRODUCCION.md](docs/NGINX-PRODUCCION.md) | Configuración del proxy inverso |
| [ADR-000](docs/ADR-000-monolito-node-postgres.md) | Por qué monolito |
| [Auditoría de seguridad](docs/AUDITORIA-SEGURIDAD-PRESTIGE-BARBERS.md) | Vulnerabilidades y soluciones |

Especificaciones funcionales en [docs/docs_funcionalidades/](docs/docs_funcionalidades/), de interfaz en [docs/docs_frontend/](docs/docs_frontend/), de seguridad en [docs/docs_seguridad/](docs/docs_seguridad/).

El documento entregado al jurado de API Wars es `API-Wars-Prestige-Barbers-Penta-sys-4.0.pdf`.

---

## Requisitos

**Con Docker:** Docker Desktop y 2 GB de RAM (4 GB recomendado).
**Sin Docker:** Node.js 18 o superior y MySQL 5.7 / MariaDB 10.4 o superior.

---

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| Los cambios del frontend no aparecen | Falta `--build`: el frontend está en la imagen |
| No cargan los estilos por IP de red local | `upgrade-insecure-requests` fuerza HTTPS; usar `NODE_ENV=development` |
| `429` desde varios dispositivos | Todos llegan con la IP del gateway de Docker; requiere `trust proxy` |
| `422` de Factus por un céntimo | El total hay que redondear por línea, no sobre la suma |
| `422` en `unit_measure_code` | Debe ir como cadena: `"94"`, no `94` |
| Rango de numeración inválido en una nota | Cada tipo de documento usa su propio rango |
| MariaDB no arranca | `docker compose down -v` y volver a levantar |

---

## Licencia

Todos los derechos reservados.

---

<div align="center">

**Penta{sys}4.0** · API Wars · Noviembre 2026
Versión 2.0.0 — pagos y facturación electrónica en producción

</div>
