# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json
COPY Backend/package*.json ./

# Instalar dependencias
RUN npm install --production

# Stage 2: Runtime
FROM node:18-alpine

# Instalar dumb-init para manejar signals correctamente
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copiar Backend directamente a /app
COPY Backend/ ./

# Copiar Frontend (para servir archivos estáticos)
COPY Frontend/ /Frontend/

# Copiar node_modules instalados
COPY --from=builder /app/node_modules ./node_modules

# Crear directorios para uploads y logs
RUN mkdir -p uploads logs

# Exponer puerto
EXPOSE 3000

# Health check
# 127.0.0.1 y no localhost: en Node 18 localhost resuelve primero a ::1
# (IPv6) y el servidor escucha en 0.0.0.0, que es solo IPv4. El on('error')
# hace que un fallo de red termine con codigo 1 limpio, en vez de lanzar
# una excepcion sin capturar que ensucia el log.
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/auth/me',r=>process.exit(r.statusCode===401?0:1)).on('error',()=>process.exit(1))"

# Usar dumb-init para ejecutar la aplicación
ENTRYPOINT ["dumb-init", "--"]

# Comando por defecto
CMD ["node", "server.js"]
