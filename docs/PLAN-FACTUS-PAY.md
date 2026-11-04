# Plan de implementación — Factus Pay en Prestige Barbers

Integración de la pasarela de recaudo por QR Bre-B y, en una segunda etapa, la
factura electrónica DIAN.

| Dato | Valor |
|---|---|
| Fecha | 4 de noviembre de 2026 |
| Estado | Fase 0 completada — credenciales verificadas contra la API real |
| Entorno | Sandbox |
| Webhook | `https://prestigebarber.store/api/factus/webhook/pay` |

---

## Verificación previa

Antes de planificar se probó la API real. Esto no es teoría: son respuestas
recibidas del sandbox de Factus Pay.

| Prueba | Resultado |
|---|---|
| `POST /auth` | `200` — token de 54 caracteres en `{"token": "..."}` |
| `POST /v1/collections` | `200` — `status: ready`, QR de 16.262 bytes |
| Llave Bre-B devuelta | `@FC7HQYO9DTF0WPLQ4YZ7` |
| `GET /v1/collections/{ref}` | `200` — "Recaudo encontrado" |
| Idempotencia (misma referencia) | `200` — "Recaudo ya existente" |

### Dos correcciones a la documentación interna

El documento `03-autenticacion-secretos.md` contiene dos imprecisiones que se
detectaron al probar:

1. **`X-Factus-Access-Key` no existe.** La autenticación funciona solo con
   `Content-Type` y `Accept`. La variable `FACTUS_PAY_ACCESS_KEY` del
   `.env.example` no se usa.
2. **El token no viene anidado.** La respuesta real es `{"token": "..."}`,
   no `{"data": {"token": "..."}}`.

---

## Arquitectura

Factus Pay y Factus Facturación son **dos APIs distintas, con credenciales
distintas**.

| | Factus Pay | Factus Facturación |
|---|---|---|
| Base sandbox | `pay-api-sandbox.factus.com.co` | `api-sandbox.factus.com.co` |
| Autenticación | `POST /auth` (JSON) | `POST /oauth/token` (form-urlencoded) |
| Token | No expira; **uno solo activo por usuario** | Expira en 1 h, con refresh |
| Función | Cobrar por QR Bre-B | Emitir factura ante la DIAN |

### Decisiones de diseño

**El token de Pay se cachea en memoria del proceso.** Cada `POST /auth` revoca
el anterior, así que dos procesos autenticándose por separado se invalidan
mutuamente. El documento original propone Redis; este proyecto no lo tiene, y
con un solo contenedor de backend la caché en memoria es suficiente. Si algún
día hay más de una instancia, esto hay que revisarlo.

**Ningún pago se da por bueno solo con el webhook.** La llave viaja en la query
string y no hay firma HMAC: quien la conozca puede enviar pagos falsos. Cada
evento se verifica con `GET /v1/collections/{reference_code}` antes de tocar la
orden.

**El carrito se vacía solo cuando la orden está pagada**, nunca antes.

### Flujo

```
Cliente confirma compra
  → POST /api/factus/ordenes          (backend calcula precios y total)
  → POST /v1/collections              (Factus devuelve QR + llave Bre-B)
  → el cliente paga desde su app bancaria
  → POST /api/factus/webhook/pay      (Factus avisa)
  → GET /v1/collections/{ref}         (el backend verifica)
  → orden pagada
  → [Fase 5] factura electrónica DIAN
```

---

## Fases

Cada fase termina con una prueba. No se empieza la siguiente sin que la
anterior pase.

### Fase 0 — Reconocimiento ✅

**Completada.** Credenciales verificadas, flujo de recaudo probado de extremo a
extremo, documentación contrastada con la API real.

---

### Fase 1 — Base de datos

**Historia de usuario**

> Como sistema, necesito persistir órdenes, sus ítems y los eventos de pago,
> para que un pago nunca se procese dos veces y quede traza de todo.

**Entregables**

- `Backend/database/002-facturacion.sql`
- Tablas: `facturacion_ordenes`, `facturacion_orden_items`, `facturacion_eventos`
- Índice `UNIQUE` en `facturacion_ordenes.referencia`
- Índice `UNIQUE` en `facturacion_eventos.reference_code` (idempotencia)

**Criterios de aceptación**

- [ ] Las tres tablas existen en la base de datos
- [ ] Insertar dos órdenes con la misma referencia falla
- [ ] Insertar dos eventos con el mismo `reference_code` falla
- [ ] El script es idempotente (`CREATE TABLE IF NOT EXISTS`)

**Prueba**

```sql
SHOW TABLES LIKE 'facturacion%';
INSERT ... -- misma referencia dos veces, debe fallar la segunda
```

---

### Fase 2 — Cliente de Factus Pay

**Historia de usuario**

> Como backend, necesito hablar con Factus Pay gestionando el token y los
> errores, sin pedir un token nuevo en cada llamada.

**Entregables**

- `Backend/factus/pay-client.js`
- Funciones: `auth()`, `crearRecaudo()`, `consultarRecaudo()`, `listarPagados()`
- Caché del token en memoria
- Reintento único ante `401` (token revocado)

**Criterios de aceptación**

- [ ] Se autentica y guarda el token
- [ ] Una segunda llamada reutiliza el token, no pide otro
- [ ] Ante `401` reautentica y reintenta una sola vez
- [ ] Los errores de red no tumban el proceso
- [ ] El token y la contraseña nunca aparecen en los logs

**Prueba**

```bash
node -e "require('./Backend/factus/pay-client').crearRecaudo('TEST-1', 19900)"
```

---

### Fase 3 — Endpoints de órdenes

**Historia de usuario**

> Como cliente, quiero confirmar mi compra y recibir un QR para pagarla desde
> mi app bancaria.

**Entregables**

- `POST /api/factus/ordenes` — crea orden y recaudo, devuelve QR
- `GET /api/factus/ordenes/:referencia` — consulta estado
- Validación con `express-validator`
- Rate limit específico para `/api/factus/*`

**Reglas del servidor** (del documento 07)

- Ignorar cualquier precio que mande el cliente
- Resolver precios desde `cortes`, `barbas` y `productos`
- Validar stock de productos
- Validar que el total esté entre 1.000 y 12.100.000 COP
- Crear orden e ítems en una transacción

**Criterios de aceptación**

- [ ] Crear una orden devuelve `201` con QR y llave Bre-B
- [ ] Un precio manipulado por el cliente se ignora
- [ ] Un total fuera de rango devuelve `400`
- [ ] Sin JWT devuelve `401`
- [ ] Un usuario no puede ver órdenes de otro (`403`)
- [ ] Stock insuficiente devuelve `409`

**Prueba**

```bash
curl -X POST https://prestigebarber.store/api/factus/ordenes \
  -H "Authorization: Bearer <jwt>" \
  -d '{"tipo":"producto","items":[{"tipo":"producto","id":19,"cantidad":1}]}'
```

---

### Fase 4 — Webhook

**Historia de usuario**

> Como sistema, quiero enterarme del pago en segundos y sin fiarme del aviso,
> para no entregar nada sin cobrar.

**Entregables**

- `POST /api/factus/webhook/pay?key=...` — público, sin JWT
- Comparación de la llave con `crypto.timingSafeEqual`
- Verificación contra `GET /v1/collections/{ref}` antes de marcar pagada
- Registro en `facturacion_eventos`

**Códigos de respuesta**

| Caso | Respuesta |
|---|---|
| Llave inválida | `401` |
| Orden inexistente | `200` (que Factus no reintente) |
| Ya pagada | `200` |
| Monto distinto | `200` + alerta, orden sin cambios |
| Fallo transitorio al verificar | `500` (que Factus reintente) |
| Procesado | `200` |

**Criterios de aceptación**

- [ ] Llave correcta y pago real: la orden pasa a `pagada`
- [ ] Llave incorrecta: `401` y nada se guarda
- [ ] El mismo evento dos veces no reprocesa
- [ ] Monto alterado: la orden no cambia y queda el evento registrado
- [ ] Responde en menos de 2 segundos (Factus corta a los 10 s)

**Prueba**

Simulador de Factus + `curl` con llave inválida y evento duplicado.

---

### Fase 5 — Frontend del checkout

**Historia de usuario**

> Como cliente, quiero ver el QR, saber cuánto falta para que venza y que la
> pantalla me confirme sola cuando el pago entre.

**Entregables**

- `Frontend/public/js/factus-checkout.js`
- Modal con QR, llave copiable y cuenta regresiva
- Polling cada 4 s a `GET /api/factus/ordenes/:referencia`
- Estados: esperando, confirmado, error
- Botones "Ya pagué" y "Renovar QR"
- Estilos siguiendo el sistema del proyecto (`#1b1b1b`, Montserrat, botones
  cuadrados con hover invertido)

**Criterios de aceptación**

- [ ] El QR se ve y es escaneable
- [ ] La llave Bre-B se copia con un clic
- [ ] La cuenta regresiva llega a cero y ofrece renovar
- [ ] Al pagar, la pantalla cambia sola sin recargar
- [ ] El carrito se vacía **solo** tras confirmarse el pago
- [ ] Funciona en móvil

---

### Fase 6 — Factura electrónica DIAN

> **Fuera del alcance de esta tanda.** Se documenta para la siguiente.

Requiere datos que hoy no existen en la base: `documento` y `tipo_documento`
del usuario, y el código de municipio. Sin ellos hay que facturar como
consumidor final (`22222222222`).

---

## Variables de entorno

```bash
# Factus Pay
FACTUS_PAY_BASE_URL=https://pay-api-sandbox.factus.com.co
FACTUS_PAY_EMAIL=<usuario>
FACTUS_PAY_PASSWORD=<contraseña>
FACTUS_PAY_WEBHOOK_KEY=<llave de 32+ caracteres, distinta en cada entorno>
FACTUS_QR_EXPIRATION_SECONDS=1800

# Factus Facturación (fase 6)
FACTUS_API_BASE_URL=https://api-sandbox.factus.com.co
FACTUS_CLIENT_ID=<...>
FACTUS_CLIENT_SECRET=<...>
FACTUS_USERNAME=<...>
FACTUS_PASSWORD=<...>
FACTUS_NUMBERING_RANGE_ID=<id del rango activo>
```

Las credenciales no van en el repositorio. `FACTUS_PAY_ACCESS_KEY` del
`.env.example` original **no se usa**: esa cabecera no existe en la API.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Token revocado por doble autenticación | Un solo proceso backend; caché en memoria |
| Webhook falsificado | Llave larga + verificación obligatoria contra la API |
| Pago sin webhook | Polling del frontend; job de conciliación si da tiempo |
| QR vencido | `qr_expires_at` real, no el `expiration` enviado |
| Monto manipulado | Comparar contra `orders.total` antes de marcar pagada |
| Precios alterados desde el cliente | El servidor los resuelve de la base, siempre |

### Lo que Factus Pay no hace

- No procesa tarjetas ni PSE: solo Bre-B
- No admite pagos parciales: el monto debe ser exacto
- No hay reembolsos ni contracargos: una devolución se hace por fuera
- No emite facturas: eso es la otra API

---

## Seguimiento

| Fase | Estado | Probada |
|---|---|---|
| 0 — Reconocimiento | ✅ Completada | Sí, contra la API real |
| 1 — Base de datos | Pendiente | — |
| 2 — Cliente de Pay | Pendiente | — |
| 3 — Endpoints | Pendiente | — |
| 4 — Webhook | Pendiente | — |
| 5 — Frontend | Pendiente | — |
| 6 — Factura DIAN | Fuera de alcance | — |
