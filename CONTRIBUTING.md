# Contribuir a MedVene

Primero que nada, **gracias**. Tu tiempo y solidaridad están haciendo una diferencia real en una emergencia humanitaria. Cada línea de código que contribuyas ayuda a conectar personas que necesitan medicamentos con quienes pueden donarlos.

---

## Regla de Oro: No trabajes en la oscuridad

> **NUNCA subas código sin antes revisar los Issues de GitHub.**

Esto es crítico para una plataforma de respuesta rápida. Si dos personas trabajan en lo mismo, se pierde tiempo que podríamos estar usando para ayudar.

### Antes de empezar:

1. **Revisa los Issues abiertos** en [GitHub](https://github.com/tu-org/medvenezuela/issues).
2. **Comenta en el issue** que quieres trabajar en eso. Espera a que te lo asignen o confirme nadie más lo está haciendo.
3. **Si encontraste un bug** o necesitas una funcionalidad nueva, **abre un issue nuevo** antes de escribir código. Describe el problema con claridad.
4. **Si el issue ya está asignado** a otra persona, busca otro issue o abre uno nuevo.

**No hay excepciones.** La coordinación nos hace más rápidos, no más lentos.

---

## Flujo de Trabajo (Git Workflow)

### 1. Haz un Fork del repositorio

Haz clic en el botón "Fork" en la esquina superior derecha del repositorio en GitHub.

### 2. Clona tu Fork

```bash
git clone https://github.com/TU-USUARIO/medvenezuela.git
cd medvenezuela/app
```

### 3. Crea una rama descriptiva

Nombra tu rama de forma clara sobre qué estás trabajando:

```bash
git checkout -b feature/ajuste-banner
git checkout -b fix/error-formulario
git checkout -b docs/actualizar-readme
```

Convenciones:
- `feature/` — Nueva funcionalidad
- `fix/` — Corrección de un bug
- `docs/` — Documentación
- `refactor/` — Reestructuración de código sin cambiar comportamiento

### 4. Instala dependencias y verifica que compila

```bash
pnpm install
pnpm check        # Verifica que no haya errores de TypeScript
pnpm lint         # Verifica que no haya errores de ESLint
```

**Si hay errores, corrígelos antes de commitear.** No subas código roto.

### 5. Haz commits claros y concisos

```bash
git add .
git commit -m "fix: corregir validación del formulario de solicitud"
```

Convenciones para mensajes de commit:
- `feat:` — Nueva funcionalidad
- `fix:` — Corrección de bug
- `docs:` — Cambios en documentación
- `refactor:` — Reestructuración de código
- `chore:` — Tareas de mantenimiento

### 6. Sube tu rama y abre un Pull Request

```bash
git push origin feature/ajuste-banner
```

Ve a GitHub y abre un Pull Request (PR) apuntando a la rama `main`. Incluye:
- **Título descriptivo** del cambio.
- **Descripción** breve de qué hiciste y por qué.
- **Referencia al issue** que resuelve (ej: `Closes #12`).

---

## Estilo de Código y Buenas Prácticas

### Herramientas de formateo

El proyecto tiene configuradas herramientas que **debes respetar**:

```bash
pnpm format       # Formatea el código con Prettier
pnpm lint         # Verifica reglas con ESLint
pnpm check        # Verifica tipos con TypeScript
```

Ejecuta estos comandos antes de abrir tu PR. Si no lo haces, el PR no será revisado hasta que corrijas los errores.

### Buenas prácticas

- **Componentes modulares:** Un componente = un archivo. Si crece demasiado, divídelo.
- **Nombres descriptivos:** Variables y funciones deben decir qué hacen, no cómo se llaman.
- **No repitas código:** Si algo se usa en varios lugares, extrae una función o componente.
- **No agregues dependencias innecesarias:** Antes de instalar un paquete, verifica si ya existe algo similar en el proyecto.
- **Mobile-first:** La plataforma está diseñada para conexiones 3G/LTE. Mantén el código ligero.

---

## Canal de Comunicación

Para coordinación en tiempo real del equipo técnico:

| Nombre | Contacto |
|--------|----------|
| **Gabriel Perez** | +54 9 11 3250-9827 (WhatsApp) |
| **Cleibert Castillo** | +58 424 437 2470 (WhatsApp) |

Usa este canal para:
- Preguntas sobre la arquitectura del proyecto.
- Coordinar quién trabaja en qué.
- Reportar bloqueos urgentes.
- Discutir decisiones de diseño antes de implementarlas.

---

## Preguntas frecuentes

**¿Puedo trabajar en un issue que no está asignado?**
Comenta en el issue pidiendo que te lo asignen. Si nadie responde en 24h, adelante.

**¿Qué hago si mi PR tiene conflictos con la rama principal?**
Rebasea tu rama sobre `main` antes de abrir el PR:

```bash
git fetch upstream
git rebase upstream/main
```

**¿Cuánto tarda en revisarse mi PR?**
En una emergencia, priorizamos la velocidad. Intentamos revisar PRs en menos de 24 horas.

---

<div align="center">

**MedVene es una respuesta comunitaria. Trabajemos juntos, rápido y organizados.**

</div>
