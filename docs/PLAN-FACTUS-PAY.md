# Plan de implementación — Factus Pay en Prestige Barbers

Integración de la pasarela de recaudo por QR Bre-B y, en una segunda etapa, la
factura electrónica DIAN.

| Dato | Valor |
|---|---|
| Fecha | 4 de noviembre de 2026 |
| Estado | Fase 4 completada — webhook con verificación contra la API |
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

- [x] Las tres tablas existen en la base de datos
- [x] Insertar dos órdenes con la misma referencia falla
- [x] Insertar dos eventos de pago iguales falla
- [x] Las claves foráneas funcionan (ítems en cascada, eventos conservados)
- [x] El script es idempotente (`CREATE TABLE IF NOT EXISTS`)

**Resultado de las pruebas**

```
duplicar referencia   ERROR 1062: Duplicate entry 'PB-TEST-001'
                      for key 'uq_facturacion_ordenes_referencia'

duplicar evento pago  ERROR 1062: Duplicate entry
                      'pay-PB-TEST-001-webhook_paid'
                      for key 'uq_facturacion_eventos_idem'

otro evento, misma referencia    entra (historial conservado)
borrar orden → ítems             0 (cascada)
borrar orden → eventos           2 (auditoría sobrevive)
segunda ejecución del script     sin errores
```

**Decisión: la clave de idempotencia es compuesta**

El documento `06-conciliacion-modelo-datos.md` no pone `UNIQUE` en
`facturacion_eventos`, y el plan inicial pedía uno sobre `referencia` sola.
Ninguna de las dos sirve: sin restricción el webhook puede procesarse dos
veces, y con `UNIQUE(referencia)` solo cabría un evento por orden, cuando la
tabla guarda también los de facturación y los internos.

La clave es `UNIQUE (fuente, referencia, evento)`: el webhook de pago de una
referencia solo puede registrarse una vez, y el resto del historial se
conserva.

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

- [x] Se autentica y guarda el token
- [x] Una segunda llamada reutiliza el token, no pide otro
- [x] Ante `401` reautentica y reintenta una sola vez
- [x] Los errores de red no tumban el proceso
- [x] El token y la contraseña nunca aparecen en los logs

**Resultado de las pruebas** (contra el sandbox real)

```
crear recaudo        ready | @FC0ZDYQTCIOOT1PGYF3O | QR de 16.222 bytes
reutilizar token     "Autenticado" aparece 1 vez en 4 llamadas
401 simulado         "Token rechazado, reautenticando" → reintenta 1 vez
idempotencia         yaExistia: true | "Recaudo ya existente"
recaudo inexistente  null (404 no es excepción)
monto 500 COP        rechazado antes de llamar a la API
host inexistente     FactusPayError transitorio, proceso vivo
sin credenciales     "Faltan FACTUS_PAY_EMAIL o FACTUS_PAY_PASSWORD"
secretos en logs     ninguno (contraseña, token ni email)
```

**Extra: parseo de fechas**

Factus devuelve `"04-11-2026 12:01:31 PM"` sin declarar zona horaria, y su
tabla de campos menciona ISO 8601. `parsearFecha()` acepta ambos y trata el
primero como hora de Colombia (UTC-5):

```
"04-11-2026 12:01:31 PM"  →  2026-11-04T17:01:31.000Z
"2026-11-04T17:01:31Z"    →  2026-11-04T17:01:31.000Z
"no es fecha"             →  null
```

**Un fallo encontrado al probar**

Las variables de entorno se leían al cargar el módulo, así que si
`require()` corría antes de `dotenv.config()`, el cliente se quedaba sin
credenciales y fallaba con un confuso "fetch failed" del DNS. Ahora se leen
en cada llamada y el mensaje dice lo que pasa.

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

- [x] Llave incorrecta: `401` y nada se guarda
- [x] Un pago falso con llave válida NO marca la orden pagada
- [x] El mismo evento dos veces no reprocesa
- [x] Monto alterado: la orden no cambia y queda el evento registrado
- [x] Responde en menos de 2 segundos (Factus corta a los 10 s)
- [ ] Pago real desde el simulador *(requiere escanear el QR a mano)*

**Resultado de las pruebas**

```
llave incorrecta       401 "No autorizado"
sin llave              401
orden desconocida      200 "Orden desconocida"  (que no reintente)
pago FALSO con llave   200 "No confirmado por la API"
                       → la orden siguió en recaudo_pendiente
orden ya pagada        200 duplicate: true "Ya estaba pagada"
monto alterado         no se marcó pagada; alerta "Esperado 15500, recibido 500"
tiempo de respuesta    8-33 ms (el límite de Factus son 10 s)
```

**La prueba que más importa**

Con la llave correcta se envió un aviso diciendo que `PB-P-000005` estaba
pagada. La orden **no cambió**, porque la API respondió `ready`, no `paid`.
Sin esa verificación, cualquiera con la llave podría marcar pagos falsos: la
llave viaja en la query string y no hay firma HMAC.

**Por qué cada código de respuesta**

Factus reintenta ante `5xx` y deja de insistir ante `2xx`. Un `200` significa
"recibido, no insistas", aunque no se haya hecho nada:

| Caso | Respuesta | Motivo |
|---|---|---|
| Llave inválida | `401` | No es Factus |
| Orden desconocida | `200` | No va a aparecer; reintentar no sirve |
| Ya pagada | `200` | Idempotencia |
| La API no confirma | `200` | El aviso era falso o prematuro |
| Monto distinto | `200` | Queda la alerta; reintentar no lo arregla |
| No se pudo verificar | `500` | Fallo pasajero: que reintente |

**El webhook va fuera del rate limit**

Lo llama Factus, no un usuario. Limitarlo haría perder avisos de pago, y
Factus ya reintenta 6 veces por su cuenta.

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
| 1 — Base de datos | ✅ Completada | Sí, 5/5 criterios |
| 2 — Cliente de Pay | ✅ Completada | Sí, 5/5 criterios |
| 3 — Endpoints | ✅ Completada | Sí, 6/6 criterios |
| 4 — Webhook | ✅ Completada | Sí, 5/5 automatizados |
| 5 — Frontend | Pendiente | — |
| 6 — Factura DIAN | Fuera de alcance | — |
