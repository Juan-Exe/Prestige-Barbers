# Despliegue en producción

Servidor en LightNode (Bogotá), Ubuntu 24.04.2 LTS, 1 vCPU / 4 GB RAM / 50 GB.

**Aplicación:** http://149.104.75.63:3000

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
| `prestige-barbers-backend` | 3000 | internet |
| `prestige-barbers-db` | 3306 | solo red interna de Docker |
| `prestige-barbers-adminer` | 8080 | solo `127.0.0.1` (túnel SSH) |

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

### `NODE_ENV` se dejó en `development` a propósito

En `production` el servidor activa HSTS y `upgrade-insecure-requests`, que
obligan al navegador a pedir todo por HTTPS. Sirviendo por
`http://149.104.75.63:3000` sin certificado, eso **rompe la carga de
estilos e imágenes**.

Cambiar a `production` solo cuando haya dominio con HTTPS configurado.

---

## Verificación realizada

Desde internet:

```
home        HTTP 200  (0.43 s)
/api/productos  HTTP 200
/I-style/styles.css  HTTP 200
imagen de producto   HTTP 200  (67 KB, image/jpeg)
portada              HTTP 200  (2.1 MB)
```

Puertos que **no** responden desde fuera (correcto):

```
3306 (MariaDB)  sin respuesta
8080 (Adminer)  sin respuesta
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

1. **HTTPS.** Hoy el tráfico viaja sin cifrar, incluidas las contraseñas de
   login. Con un dominio se resuelve con Nginx + Certbot, y entonces se puede
   poner `NODE_ENV=production`.

2. **Credenciales en el volcado.** `barberia.sql` contiene usuarios de prueba
   con contraseñas conocidas. Conviene limpiarlos antes de usar en serio.

3. **Copias de seguridad automáticas.** No hay ninguna programada; los datos
   viven en el volumen `prestige-barbers_mariadb_data`.

4. **`docker-compose.override.yml` versionado.** Es un riesgo: si alguien
   levanta sin los `-f` explícitos, arranca en modo desarrollo con la base de
   datos expuesta. Conviene sacarlo del repositorio.
