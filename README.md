<div align="center">

# MedVene

**Plataforma de código abierto para coordinar solicitudes de medicamentos de emergencia en Venezuela.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Documentación](#-instalación-local) · [Reportar Bug](https://github.com/tu-org/medvenezuela/issues) · [Contribuir](#-contribuir)

</div>

---

Tras el terremoto en Venezuela de junio de 2026, MedVene conecta de forma rápida y segura a quienes necesitan medicamentos de emergencia con quienes pueden donarlos. La plataforma está diseñada para funcionar en conexiones 3G/LTE inestables, con un enfoque mobile-first que prioriza la velocidad y la accesibilidad.

Cada solicitud se identifica con un PIN único que permite al solicitante dar seguimiento al estado de su petición sin necesidad de crear una cuenta.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | React 19, React Router v7, Tailwind CSS v3, shadcn/ui |
| **Backend** | Hono, tRPC v11, Drizzle ORM |
| **Base de datos** | MySQL 8.0 (mysql2 driver) |
| **Autenticación** | OAuth (Kimi) + JWT local (jose, bcryptjs) |
| **Build** | Vite 7, TypeScript 5.9, esbuild |
| **Testing** | Vitest |
| **Infra** | Docker Compose, Cloudflare Tunnel |

---

## Pre-requisitos

- **Node.js** >= 20.x
- **pnpm** >= 9.x (recomendado) o npm >= 10.x
- **MySQL** 8.0 (local o vía Docker)

---

## Instalación Local

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-org/medvenezuela.git
cd medvenezuela/app
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus valores. Mínimo necesario para desarrollo:

```env
APP_ID=tu-app-id
APP_SECRET=un-secreto-seguro-para-jwt
DATABASE_URL=mysql://root:password@localhost:3306/medvenezuela
VITE_KIMI_AUTH_URL=https://placeholder.example.com
VITE_APP_ID=tu-app-id
KIMI_AUTH_URL=https://placeholder.example.com
KIMI_OPEN_URL=https://placeholder.example.com
```

### 4. Levantar MySQL (vía Docker)

Desde la raíz del proyecto (`medvenezuela/`):

```bash
docker compose -f docker-compose.dev.yml up -d
```

Esto arranca MySQL 8.0 en el puerto 3306 con credenciales por defecto.

### 5. Ejecutar migraciones

```bash
cd app
pnpm db:push
```

### 6. Iniciar el servidor de desarrollo

```bash
pnpm dev
```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

---

## Variables de Entorno

### Backend

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `APP_ID` | Sí | Identificador de la aplicación |
| `APP_SECRET` | Sí | Secreto para firmar JWTs. Generar con `openssl rand -base64 48` |
| `DATABASE_URL` | Sí | Cadena de conexión MySQL: `mysql://user:pass@host:port/db` |
| `SCHEMA_REFERENCE_DATABASE_URL` | Para `db:verify` | URL de la DB de referencia para comparación de schema |
| `KIMI_AUTH_URL` | Sí | URL del servidor OAuth de Kimi (puede ser placeholder) |
| `KIMI_OPEN_URL` | Sí | URL de la Open Platform de Kimi (puede ser placeholder) |
| `OWNER_UNION_ID` | No | Union ID del admin; este usuario obtiene rol `admin` al iniciar sesión |
| `PORT` | No | Puerto HTTP (default: `3000`) |
| `NODE_ENV` | No | Modo del entorno (default: `development`) |
| `DB_POOL_LIMIT` | No | Límite de conexiones del pool (default: `10`) |
| `DB_CONNECT_TIMEOUT_MS` | No | Timeout de conexión en ms (default: `10000`) |
| `DB_IDLE_TIMEOUT_MS` | No | Timeout de inactividad en ms (default: `60000`) |

### Frontend (expuestas al navegador via Vite)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `VITE_KIMI_AUTH_URL` | Sí | URL del servidor OAuth (se expone en el bundle del frontend) |
| `VITE_APP_ID` | Sí | ID de la aplicación OAuth (se expone en el bundle del frontend) |

### Docker / Despliegue

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `MYSQL_PASSWORD` | Sí | Contraseña del usuario MySQL |
| `MYSQL_ROOT_PASSWORD` | Sí | Contraseña del root de MySQL |
| `CLOUDFLARE_TUNNEL_TOKEN` | Sí (producción) | Token del túnel de Cloudflare |

---

## Estructura del Proyecto

```
medvenezuela/
├── app/                          # Aplicación principal
│   ├── api/                      # Backend — Hono + tRPC
│   │   ├── boot.ts               # Entry point del servidor
│   │   ├── router.ts             # Router principal de tRPC
│   │   ├── solicitudes-router.ts # CRUD de solicitudes
│   │   ├── auth-router.ts        # OAuth (Kimi)
│   │   ├── local-auth-router.ts  # Auth local (usuario/contraseña)
│   │   ├── lib/                  # Utilidades del backend
│   │   ├── queries/              # Consultas a la base de datos
│   │   └── kimi/                 # Integración OAuth con Kimi
│   ├── src/                      # Frontend — React SPA
│   │   ├── main.tsx              # Entry point del frontend
│   │   ├── App.tsx               # Definición de rutas
│   │   ├── pages/                # Páginas (Home, Login, NuevaSolicitud, etc.)
│   │   ├── components/           # Componentes de la UI
│   │   │   └── ui/               # Componentes shadcn/ui
│   │   ├── hooks/                # Custom hooks (useAuth, use-mobile)
│   │   ├── providers/            # Providers (tRPC/React Query)
│   │   └── lib/                  # Utilidades del frontend
│   ├── contracts/                # Tipos compartidos frontend ↔ backend
│   ├── db/                       # Schema Drizzle + migraciones
│   │   ├── schema.ts             # Definición de tablas
│   │   └── migrations/           # Migraciones SQL
│   ├── scripts/                  # Scripts de build y seed
│   ├── vite.config.ts            # Configuración de Vite
│   ├── drizzle.config.ts         # Configuración de Drizzle
│   └── tailwind.config.js        # Configuración de Tailwind
├── scripts/                      # Scripts de operaciones (backup)
├── openspec/                     # Documentación de specs
├── docker-compose.yml            # Producción: MySQL + App + Cloudflare
├── docker-compose.dev.yml        # Desarrollo: MySQL + Adminer
├── Dockerfile                    # Build multi-etapa
└── DEPLOY.md                     # Guía de despliegue
```

---

## Comandos Útiles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Iniciar servidor de desarrollo |
| `pnpm build` | Build para producción |
| `pnpm lint` | Ejecutar ESLint |
| `pnpm check` | Verificar tipos con TypeScript |
| `pnpm format` | Formatear código con Prettier |
| `pnpm test` | Ejecutar tests unitarios |
| `pnpm test:integration` | Ejecutar tests de integración |
| `pnpm db:push` | Aplicar schema a la base de datos |
| `pnpm db:generate` | Generar archivos de migración |
| `pnpm db:migrate` | Ejecutar migraciones pendientes |
| `pnpm db:verify` | Verificar consistencia del schema |

---

## Licencia

Este proyecto es de código abierto bajo la licencia [MIT](https://opensource.org/licenses/MIT).

---

<div align="center">

**Si necesitas medicamentos de emergencia o puedes donar, visita [medvenezuela.org](https://medvenezuela.org)**

</div>
