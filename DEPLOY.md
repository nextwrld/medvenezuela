# Deploy Guide — MedVene MVP

Sistema de Emergencias Medicas — deploy en Hetzner VPS con Docker Compose + Cloudflare Tunnel.

## Arquitectura

```
Internet → Cloudflare Edge (SSL + DDoS + WAF)
              ↓ cloudflared tunnel
         VPS (Docker Compose)
              ├── app      (Hono + tRPC + static files)  port 3000
              ├── db       (MySQL 8.0)                    internal
              └── cloudflared (tunnel)                     internal
```

No hay puertos abiertos en el VPS. Todo el trafico entra por el tunnel.

## Prerequisitos

- Hetzner VPS con Ubuntu 24.04 LTS
- Acceso SSH al server
- Cuenta de Cloudflare con un dominio gestionado

## Paso 1 — Setup inicial del VPS (una sola vez)

Conectate por SSH y ejecuta:

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Verificar
docker --version
docker compose version

# Crear swap de 4GB (proteccion contra OOM en MySQL)
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## Paso 2 — Clonar el repo

```bash
cd /opt
git clone <tu-repo-url> emergenciaMed
cd emergenciaMed
```

## Paso 3 — Configurar .env

```bash
cp .env.example .env
nano .env
```

Genera passwords seguras:

```bash
openssl rand -base64 32   # MYSQL_PASSWORD
openssl rand -base64 32   # MYSQL_ROOT_PASSWORD
openssl rand -base64 48   # APP_SECRET
```

Completa:

| Variable | Valor |
|----------|-------|
| `MYSQL_PASSWORD` | (password generada) |
| `MYSQL_ROOT_PASSWORD` | (password generada) |
| `APP_ID` | (tu app ID) |
| `APP_SECRET` | (password generada) |
| `KIMI_AUTH_URL` | `https://placeholder.example.com` (si no usas Kimi) |
| `KIMI_OPEN_URL` | `https://placeholder.example.com` (si no usas Kimi) |
| `OWNER_UNION_ID` | (vacio si no usas Kimi) |
| `CLOUDFLARE_TUNNEL_TOKEN` | (del Paso 4) |

## Paso 4 — Configurar Cloudflare Tunnel

1. Ve a https://one.dash.cloudflare.com → Networks → Tunnels
2. Click **Create a tunnel**
3. Nombre: `medvene`
4. Copia el **token** (empieza con `eyJ...`)
5. Pegalo en `.env` como `CLOUDFLARE_TUNNEL_TOKEN`
6. En **Public Hostnames**, agrega:
   - Subdomain: `app` (o el que quieras)
   - Domain: `tudominio.com`
   - Service: `http://app:3000`
7. Guarda

## Paso 5 — Levantar todo

```bash
docker compose up -d --build
```

Verifica que todo este corriendo:

```bash
docker compose ps    # los 3 servicios deben estar "Up"
docker compose logs app   # mirar que la app arranque sin errores
docker compose logs cloudflared  # mirar que el tunnel conecte
```

La app deberia estar accesible en `https://app.tudominio.com`.

## Paso 6 — Backups automaticos (cron)

```bash
# Editar crontab del host
crontab -e

# Agregar esta linea (backup diario a las 2 AM):
0 2 * * * docker exec medvene_db /backups/backup.sh >> /var/log/medvene-backup.log 2>&1
```

Los backups quedan dentro del volumen `mysql_backups`. Para copiarlos fuera del container:

```bash
docker cp medvene_db:/backups/ /opt/backups/
```

Para enviarlos a un bucket S3/Backblaze, agrega al cron:

```bash
# Sync a Backblaze B2 (instalar b2 CLI primero)
0 3 * * * docker cp medvene_db:/backups/ ./tmp_backups && b2 sync ./tmp_backups b2://tu-bucket/medvene/
```

## Comandos utiles

```bash
# Ver estado
docker compose ps

# Ver logs
docker compose logs -f app
docker compose logs -f db
docker compose logs -f cloudflared

# Reiniciar un servicio
docker compose restart app

# Reconstruir (despues de cambiar codigo)
docker compose up -d --build app

# Parar todo
docker compose down

# Parar y BORRAR datos (cuidado!)
docker compose down -v

# Acceder a MySQL
docker exec -it medvene_db mysql -u medvene -p

# Ver backups
docker exec medvene_db ls -lh /backups/
```

## Troubleshooting

### La app no arranca
```bash
docker compose logs app
```
Mas probable: falta una variable de entorno o la DB no esta lista.

### El tunnel no conecta
```bash
docker compose logs cloudflared
```
Verifica que el token sea correcto y que el hostname apunte a `http://app:3000`.

### MySQL no arranca
```bash
docker compose logs db
```
Si el volumen esta corrupto: `docker compose down -v` y volver a levantar (pierde datos).

### Migraciones fallan
```bash
docker exec -it medvene_app npx drizzle-kit migrate
```
Verifica que `DATABASE_URL` sea `mysql://medvene:<pass>@db:3306/medvene`.

## Actualizar la app

```bash
cd /opt/emergenciaMed
git pull
docker compose up -d --build app
```

El Dockerfile rebuild del frontend y re-bundlea el server. Las migraciones corren automaticamente al arranque.