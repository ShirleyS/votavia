# Handoff para Session 5 — Consola de gobierno (cierre de I-16)

## Commit

- **`30ef694e7dfe005539910b2cf9fba8df3efa8a84`** — `fix(government-ux): make the core API the production data path (I-16)`
- Rama: `feature/government-ux` · Worktree: `/Users/shirley/Documents/code/votavia-government-ux`
- Sin merge ni despliegue. Sin push (este entorno no tiene salida de red); el commit es local.

## Qué cambió para E2E

1. **Modo núcleo por omisión.** `NEXT_PUBLIC_VOTAVIA_API_MODE` ya no cae a `demo`.
   Sin variable se usa el adaptador real; `demo` sólo si se pide explícitamente.
2. **`SessionGate`** envuelve el contenido en `AppShell`. Estados:
   - sin sesión → formulario de acceso con `POST /api/auth/demo`;
   - con sesión pero sin membresía → muro "sin organización verificada";
   - con membresía → consola normal.
3. **`localStorage` fuera del camino de producción.** `MockGovernmentService` se
   instancia de forma diferida y sólo en modo `demo`.
4. **Etiquetas honestas.** Asignación de área/operador y despacho se marcan como
   locales/fixture; el registro oficial es de sólo lectura.

## Dependencias

| Dependencia | Quién | Estado |
| --- | --- | --- |
| `VOTAVIA_CORE_ORIGIN` apuntando al núcleo (Session 1) | Session 5 / entorno | **Requerida.** Sin ella no hay reescritura `/core-api` y la consola muestra "núcleo no disponible". |
| `organizationMembers` sembrado con una membresía verificada | Session 1 | **Bloqueante para E2E.** El seed deja `organizationMembers: []`; hoy la consola muestra el muro de sesión y es el estado correcto. Contrato exacto al final de este archivo. |
| `POST|DELETE /api/auth/demo` | Session 1 | Disponible (falla con 400 si hay Supabase Auth configurado). |
| `GET /api/issues`, `GET /api/issues/[id]`, `POST /api/issues/[id]/operational`, `GET|POST /api/issues/[id]/evidence`, `GET /api/organizations/me`, `GET /api/official-records/[id]/history` | Session 1 | Disponibles y en uso. |
| `DispatchGateway` (Ismael) | Ismael | **Sin backend HTTP.** UI marcada como fixture. |
| Contratos de asignación, respuesta a disputa, publicación de resultado y feed de actividad | Session 1 | Pendientes; overrides locales etiquetados (`PENDING_CONTRACTS`). |

### Contrato faltante exacto (bloqueante)

Una fila en `organizationMembers` con:

- `organization_id` = `org-demo-cuauhtemoc`
- `user_id` = el que produce `POST /api/auth/demo` para el correo de gobierno de demostración
- `role` ∈ `responder | supervisor | admin`
- `scope` (opcional) para filtrar por colonia
- `verified_at` no nulo y `revoked_at` nulo (así lo exige `membershipsFor`)

Alternativa aceptable: un endpoint administrativo que cree esa membresía. La consola
**no** simula la membresía porque eso sería una segunda autorización.

## Checks ejecutados

```
npm run typecheck   # tsc --noEmit — sin errores
npm run build       # next build — 11 rutas, incluye /gobierno/reportes/[id]
```

No se pudo abrir el servidor de desarrollo en este entorno (la política del sandbox
bloquea puertos), así que la verificación de clics queda para Session 5.

## Rutas a ejercitar

`/gobierno` (bandeja/prioridad) → `/gobierno/reportes` (filtros) →
`/gobierno/reportes/[id]` (detalle, tres carriles de estado, evidencia, disputa,
despacho) → `/gobierno/configuracion` (diagnóstico de fuente).

## Casos sembrados útiles

- `case-0832` — disputa ciudadana abierta.
- `case-0847` — riesgo de seguridad por encima de popularidad.
- `case-0821` — registro oficial desactualizado.
