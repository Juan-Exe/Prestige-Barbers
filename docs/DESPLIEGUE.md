# Despliegue en producción

Servidor en LightNode (Bogotá), Ubuntu 24.04.2 LTS, 1 vCPU / 4 GB RAM / 50 GB.

**Aplicación:** https://prestigebarber.store

---

## Qué quedó instalado

| Componente | Versión |
|---|---|
| Docker | 29.1.3 |
| Docker Compose | 2.40.3 |
| Git | 2.43.0 |

Proyecto en `/opt/Prestige-Barbers`.

### Contenedores

| Contenedor | Puerto | Accesible desde |
|---|---|---|
| `prestige-barbers-backend` | 3000 | solo Nginx (bloqueado desde internet) |
| `prestige-barbers-db` | 3306 | solo red interna de Docker |
| `prestige-barbers-adminer` | — | desactivado en producción |

Nginx 1.24 recibe el tráfico en 443 y lo pasa al backend por el 3000 local.

---

## Pasos que se siguieron

```bash
# 1. Sistema y dependencias
apt-get update && apt-get upgrade -y
apt-get install -y docker.io docker-compose-v2 git ufw
systemctl enable --now docker

# 2. Código
mkdir -p /opt && cd /opt
git clone https://github.com/Juan-Exe/Prestige-Barbers.git
cd Prestige-Barbers

# 3. Variables de entorno (ver seccion siguiente)
#    El .env quedó con permisos 600

# 4. Cortafuegos: solo SSH y la aplicación
ufw allow 22/tcp
ufw allow 3000/tcp
ufw --force enable

# 5. Levantar
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Por qué los dos archivos `-f`

`docker-compose.override.yml` está versionado y Docker Compose lo carga
**automáticamente** cuando no se pasan archivos explícitos. Ese override es
de desarrollo: fuerza `NODE_ENV=development` y monta el código como volumen.

Pasando los dos archivos con `-f`, Docker ignora el override y usa
`docker-compose.prod.yml`, que además cierra los puertos de MariaDB y Adminer.

---

## Configuración aplicada

El repositorio traía un `.env` de desarrollo con permisos `644` y
`ALLOWED_ORIGINS` apuntando a la red local. Se corrigió:

- Secretos nuevos (`JWT_SECRET` de 64 caracteres, contraseñas de BD de 28).
- `ALLOWED_ORIGINS=http://149.104.75.63:3000`
- Permisos a `600`.
- Copia del anterior en `.env.backup-<timestamp>`.

### `NODE_ENV=production`

Activo desde que existe HTTPS. Con él, el servidor envía HSTS y
`upgrade-insecure-requests`, que ahora son correctos.

`ALLOWED_ORIGINS` apunta a `https://prestigebarber.store` y su `www`.

---

## HTTPS

Dominio `prestigebarber.store` (Hostinger), con registros A de `@` y `www`
apuntando a `149.104.75.63`.

Certificado de Let's Encrypt emitido con Certbot:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
certbot --nginx -d prestigebarber.store -d www.prestigebarber.store     --non-interactive --agree-tos -m <correo> --redirect
```

- Caduca el **2027-02-02**; `certbot.timer` está activo y renueva solo.
- Nginx redirige todo el tráfico de HTTP a HTTPS con un 301.
- El proxy pasa `X-Forwarded-Proto`, que evita un bucle de redirección
  cuando el backend está en modo producción.

### El puerto 3000 está cerrado desde internet

Docker inserta sus reglas en la cadena `DOCKER-USER`, que se evalúa **antes**
que ufw: por eso `ufw deny 3000` no basta. La regla efectiva es:

```bash
iptables -I DOCKER-USER -p tcp --dport 3000 ! -s 127.0.0.1 -i <iface> -j DROP
```

Guardada con `iptables-persistent` para que sobreviva a los reinicios.

### Dos tropiezos de Docker 29.1.3

1. **Bind a `127.0.0.1` falla.** Publicar como `127.0.0.1:3000:3000` da
   `failed to bind host port ... address already in use` aunque nada escuche
   en ese puerto. Se dejó el bind normal y el cierre se hace con iptables.

2. **Adminer bloqueaba el arranque.** Su fallo al enlazar el 8080 abortaba
   todo el `up`, dejando el backend sin levantar. Se movió al perfil `debug`,
   así que no arranca salvo que se pida explícitamente.

Para consultar la base de datos sin Adminer:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml     exec mariadb mariadb -u root -p barberia
```

---

## Verificación realizada

Desde internet, por HTTPS:

```
https://prestigebarber.store/          HTTP 200  (0.71 s)
https://www.prestigebarber.store/      HTTP 200
/api/productos                         HTTP 200
/I-style/styles.css                    HTTP 200
imagen de producto                     HTTP 200  (67 KB)
http://prestigebarber.store/      -->  301 a https://
```

Cabeceras que llegan en producción:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy:   ... upgrade-insecure-requests
X-Frame-Options:           DENY
X-Content-Type-Options:    nosniff
```

Puertos que **no** responden desde fuera (correcto):

```
3000 (aplicación)  sin respuesta
3306 (MariaDB)     sin respuesta
```

Flujos probados:

- Login de administrador → `success: true`, `rol: admin`, token emitido.
- Registro con celular → `success: true`, teléfono guardado.
- Registro con nombre inválido (`Juan123`) → rechazado por el backend.

---

## Credenciales

**No están en este archivo ni en el repositorio.** Se encuentran en:

- `/opt/Prestige-Barbers/.env` en el servidor (permisos 600).
- El archivo local `Accesos`, que está en `.gitignore`.

El usuario administrador es `admin@demo.com`. Su contraseña se cambió
durante el despliegue porque la del volcado `barberia.sql` es pública.

---

## Operación

Todos los comandos se ejecutan desde `/opt/Prestige-Barbers`.

```bash
# Estado
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Registros
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend

# Reiniciar
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend

# Desplegar cambios nuevos
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

> **Importante:** el frontend se copia **dentro de la imagen**, no se monta
> como volumen. Cualquier cambio en HTML, CSS o JS necesita `--build`.
> Un `restart` recarga el proceso pero sigue sirviendo los archivos viejos.

### Acceder a Adminer

No está expuesto a internet. Desde tu PC:

```bash
ssh -L 8080:localhost:8080 root@149.104.75.63
```

Y abrir `http://localhost:8080` en el navegador.

### Copia de seguridad de la base de datos

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T mariadb \
  mariadb-dump -u root -p"$DB_ROOT_PASSWORD" barberia > respaldo-$(date +%F).sql
```

---

## Pendientes

1. **Credenciales en el volcado.** `barberia.sql` contiene usuarios de prueba
   con contraseñas conocidas. Conviene limpiarlos antes de usar en serio.

2. **Copias de seguridad automáticas.** No hay ninguna programada; los datos
   viven en el volumen `prestige-barbers_mariadb_data`.

3. **`docker-compose.override.yml` versionado.** Es un riesgo: si alguien
   levanta sin los `-f` explícitos, arranca en modo desarrollo con la base de
   datos expuesta. Conviene sacarlo del repositorio.
