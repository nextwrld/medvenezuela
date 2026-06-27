# MedVene - Technical Specification

## Overview
MedVene is a fullstack emergency medical platform built to connect medication requests with donors in Venezuela's post-earthquake crisis context (June 2026). The platform is optimized for unstable 3G/LTE mobile connections with a lightweight, mobile-first design using system fonts only.

## Tech Stack

### Frontend
- **React 19** + TypeScript + Vite 7
- **Tailwind CSS** + shadcn/ui components
- **react-router** v7 for client-side routing
- **Lucide React** for icons (no external images)
- **tRPC React Query** for type-safe data fetching

### Backend
- **Hono** web framework
- **tRPC 11.x** for end-to-end type-safe APIs
- **Drizzle ORM** for type-safe MySQL queries
- **MySQL** via mysql2 driver
- **bcryptjs** for password hashing
- **jsonwebtoken** for local auth JWT tokens
- **superjson** for date serialization

### Authentication
- **OAuth 2.0** via Kimi platform
- **Username/password** local auth with JWT
- Unified auth hook supporting both systems

## Database Schema

### Table: users (OAuth)
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| unionId | varchar(255) | NOT NULL, UNIQUE |
| name | varchar(255) | |
| email | varchar(320) | |
| avatar | text | |
| role | enum("user","admin") | DEFAULT "user" |
| createdAt | timestamp | DEFAULT NOW() |
| updatedAt | timestamp | auto-update |
| lastSignInAt | timestamp | DEFAULT NOW() |

### Table: local_users
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| username | varchar(100) | NOT NULL, UNIQUE |
| passwordHash | varchar(255) | NOT NULL |
| displayName | varchar(255) | |
| role | enum("user","admin") | DEFAULT "user" |
| createdAt | timestamp | DEFAULT NOW() |
| updatedAt | timestamp | auto-update |

### Table: solicitudes
| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| medicamento | varchar(255) | NOT NULL |
| principioActivo | varchar(255) | NOT NULL |
| cantidad | varchar(100) | NOT NULL |
| dosis | varchar(100) | |
| hospital | varchar(255) | NOT NULL |
| estado | varchar(100) | NOT NULL |
| ciudad | varchar(100) | NOT NULL |
| telefono | varchar(50) | NOT NULL |
| nombreSolicitante | varchar(255) | NOT NULL |
| rolSolicitante | enum("medico","familiar","personal_salud") | NOT NULL |
| inicialesPaciente | varchar(50) | |
| urgencia | enum("critico","moderado","estable") | DEFAULT "moderado" |
| estatus | enum("activo","en_proceso","recibido") | DEFAULT "activo" |
| pinGestion | varchar(8) | NOT NULL, UNIQUE |
| notas | text | |
| createdAt | timestamp | DEFAULT NOW() |
| updatedAt | timestamp | auto-update |

## API Endpoints (tRPC Routers)

### solicitudes router
| Endpoint | Type | Auth | Input | Output |
|----------|------|------|-------|--------|
| solicitudes.create | mutation | public | medicamento, principioActivo, cantidad, dosis?, hospital, estado, ciudad, telefono, nombreSolicitante, rolSolicitante, inicialesPaciente?, urgencia?, notas? | { id, pinGestion } |
| solicitudes.list | query | public | search?, estado?, ciudad?, estatus?, urgencia?, page?, limit? | { items, total, page, totalPages } |
| solicitudes.getById | query | public | id: number | Solicitud \| null |
| solicitudes.getByPin | query | public | pin: string | Solicitud \| null |
| solicitudes.updateStatus | mutation | public | id, pin, estatus | { success, error? } |
| solicitudes.stats | query | public | - | { total, activos, enProceso, recibidos } |

### auth router (OAuth)
| Endpoint | Type | Auth | Output |
|----------|------|------|--------|
| auth.me | query | authed | User |
| auth.logout | mutation | authed | { success } |

### localAuth router
| Endpoint | Type | Auth | Input | Output |
|----------|------|------|-------|--------|
| localAuth.register | mutation | public | username, password, displayName | { success, error?, token? } |
| localAuth.login | mutation | public | username, password | { success, error?, token? } |
| localAuth.me | query | public (reads x-local-auth-token header) | - | { id, username, displayName, role } \| null |

## Pages & Routes
| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Public feed with search, filters, stats bar |
| `/solicitar` | NuevaSolicitud | Multi-section form to create requests |
| `/solicitud/:id` | DetalleSolicitud | Individual view with dynamic OG meta tags |
| `/gestion/:pin?` | Gestion | PIN-based request management |
| `/login` | Login | Dual auth (OAuth + username/password) |
| `*` | NotFound | 404 page |

## Key Components
- **Header** - Sticky header with logo, nav, auth state
- **SolicitudCard** - Compact card with urgency border, badges, actions
- **UrgencyBadge** - Color-coded urgency indicator (critico/moderado/estable)
- **StatusBadge** - Status indicator (activo/en_proceso/recibido)
- **WhatsAppButton** - Direct wa.me link with pre-filled message
- **ShareButton** - Native share API with fallback dialog

## Design Decisions
- **System fonts only** - No external font loading for bandwidth optimization
- **No images** - Icon-only UI using Lucide React
- **Minimal animations** - Only subtle card hover and skeleton loading
- **Mobile-first** - 48px touch targets, single column on mobile
- **Emergency color palette** - Red (#DC2626) for alerts, high contrast
- **Venezuela-specific** - 25 estados in dropdown, 6 emergency zone chips

## Performance Optimizations
- Tree-shaking via Vite
- Code splitting by route
- React Query caching (5min staleTime)
- Debounced search (300ms)
- Pagination (20 items/page)
- Preconnect hint for wa.me

## SEO & Meta Tags
- Dynamic OG tags per solicitud (title, description)
- Global meta tags for homepage
- Spanish language targeting (es_VE)

## Security
- Zod input validation on all endpoints
- PIN verification before status updates
- Bcrypt password hashing (10 rounds)
- JWT tokens with 30-day expiry
- httpOnly cookies for OAuth sessions
