# VotaVía

Plataforma ciudadana para reportar, priorizar y dar seguimiento a problemas del espacio público
en la Alcaldía Cuauhtémoc, CDMX.

Este repositorio contiene las **Fases 1 y 2**:

- **Fase 1 — Núcleo de datos y API interna:** esquema Postgres/Supabase, repositorios
  intercambiables (Supabase o demostración local), servicio de casos, validación, límites de uso
  y contratos TypeScript compartidos.
- **Fase 2 — Experiencia ciudadana:** portada, exploración con mapa y lista, flujo de reporte,
  detalle de caso, apoyo comunitario, observaciones, cuentas con enlace mágico, vinculación de
  reportes y resultados públicos.

## Modelo cívico compartido

Esta rama implementa además el modelo compartido entre ciudadanía y gobierno:

- **Reporte** (`cases`) → identidad `case_id` (`report_id`).
- **Caso compartido** (`issues`) → `issue_id`; agrupa reportes y enlaza registros oficiales.
- **Registro oficial** (`official_records`) → datos importados de SUAC / 0311, con
  identificador idempotente (`source_system` + `source_record_id`), historial de estado,
  licencia y elegibilidad de redistribución.
- **Organización** (`organizations`, `organization_members`) → permisos verificados, no por dominio.
- **Evidencia**, **apoyos** y **verificación comunitaria** con atribución y auditoría.

Los tres estados se mantienen separados: operativo (VotaVía), oficial (externo) y verificación
comunitaria. Un aviso de gobierno de “completado” abre la verificación; no la sustituye.

Detalle para otras sesiones en [INTEGRATION_SHARED_MODEL.md](INTEGRATION_SHARED_MODEL.md) y el
contrato de ingesta en [SESSION6_INGESTION_CONTRACT.md](SESSION6_INGESTION_CONTRACT.md).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript estricto
- Tailwind CSS 4
- Supabase (Postgres, Auth, Storage) con modo demostración sin configuración
- MapLibre GL + CARTO / OpenStreetMap
- Zod para validación
- Vitest para pruebas

## Inicio rápido

```bash
npm install
cp .env.example .env.local   # opcional: sin variables corre en modo demostración
npm run dev
```

Abre `http://localhost:3000`. Sin Supabase configurado:

- Los datos viven en `.data/db.json` (ignorado por Git).
- Los reportes iniciales son ilustrativos y se muestran etiquetados como **Demo**.
- El acceso por correo se sustituye por un enlace firmado que aparece en pantalla.
- Las fotografías se guardan en `.data/uploads` y se sirven desde `/api/uploads/[name]`.

### Con Supabase

1. Aplica las migraciones en orden:
   - `supabase/migrations/0001_votavia_phase1.sql` — tablas, enums, RLS, triggers, Storage y RPC.
   - `supabase/migrations/0002_case_sequence.sql` — folios secuenciales sin colisiones.
2. Configura `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # solo servidor
SUPABASE_STORAGE_BUCKET=case-photos
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Con URL + anon key se activa Auth; con URL + service role se activa la base de datos. Si solo
configuras la base, la app usa Supabase como persistencia pero mantiene el acceso local de
demostración.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (webpack) |
| `npm run start` | Servidor de producción |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest |

## Rutas principales

| Ruta | Propósito |
| --- | --- |
| `/` | Portada, métricas, mapa y resultados recientes |
| `/explorar` | Mapa y lista con filtros, búsqueda y orden |
| `/reportar` | Flujo guiado de reporte con mapa, fotos y detección de duplicados |
| `/reportes/[id]` | Detalle, análisis IA, apoyo, observaciones, seguimiento y vinculación |
| `/reportes/[id]/editar` | Edición y retiro por parte de quien reportó |
| `/casos/[id]` | Caso compartido: estados, registros oficiales y evidencia |
| `/resultados` | Resultados públicos, antes/después y desglose por colonia |
| `/login` | Acceso con enlace mágico |
| `/mis-reportes` | Reportes propios y reportes apoyados |
| `/mi-cuenta` | Sesión, actividad y privacidad |

## API interna

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/cases` | Lista paginada; filtros `category`, `status`, `colonia`, `q`, `sort`, `mine`, `supported` |
| `POST` | `/api/cases` | Crea un reporte (`multipart/form-data`: `payload` JSON + `photos[]`) |
| `GET` | `/api/cases/[id]` | Caso, cronología, observaciones y análisis IA |
| `PATCH` | `/api/cases/[id]` | Edición por el autor mientras el caso está en revisión |
| `POST` | `/api/cases/[id]/withdraw` | El autor retira su reporte (cierra, no borra) |
| `POST` | `/api/cases/[id]/support` | Apoyo idempotente por participante |
| `GET`/`POST` | `/api/cases/[id]/observations` | Lectura y alta de observaciones |
| `GET` | `/api/cases/nearby` | Casos cercanos para detectar duplicados |
| `POST` | `/api/cases/duplicates` | Sugerencias IA de duplicados para el asistente de reporte |
| `GET` | `/api/stats` | Métricas públicas |
| `GET` | `/api/issues` | Casos compartidos con filtros por estado, origen y verificación |
| `GET` | `/api/issues/[id]` | Caso compartido con reportes, registros oficiales y evidencia |
| `POST`/`DELETE` | `/api/issues/[id]/support` | Apoyo comunitario idempotente y su retiro |
| `POST` | `/api/issues/[id]/verification` | Confirmar, disputar o verificar resolución |
| `GET`/`POST` | `/api/issues/[id]/evidence` | Evidencia con atribución (gobierno requiere organización) |
| `POST` | `/api/issues/[id]/operational` | Actualización operativa de personal autorizado |
| `GET` | `/api/organizations/me` | Membresías verificadas del usuario |
| `GET` | `/api/official-records/[id]/history` | Historial de estado oficial (público si es redistribuible) |

La ingesta oficial la ejecuta Session 6 con `upsert_official_record(jsonb)`; VotaVía expone el
adaptador `fromCollectorRecord()` y el validador `officialRecordIngestSchema` para esa integración.
| `POST` | `/api/auth/magic-link` | Envía o muestra el enlace de acceso |
| `POST` | `/api/auth/claim` | Inicia la vinculación de un reporte a una cuenta |
| `POST` | `/api/auth/demo` | Sesión local de demostración |
| `POST` | `/api/auth/signout` | Cierra la sesión |
| `GET` | `/api/uploads/[name]` | Fotografías en modo demostración |

Los errores usan `{ "error": { "code", "message", "details?" } }`.

## Modelo y contratos

`src/shared/votavia-contract.ts` es la fuente única de verdad para el dominio y la integración con
las fases 3–5. Reglas clave:

- `case_id` (UUID) es la única identidad de un caso; `display_id` es solo para personas.
- Los campos privados (`created_by_user_id`, `reporter_email`) nunca se devuelven en la API pública.
- `ParticipantContext` combina una cookie anónima estable (antiinflación de apoyos) con la sesión.
- El módulo de despacho y el panel de gobierno consumen este contrato; no se define aquí su
  implementación.

Capas:

```
src/app          → rutas y UI (Server Components por defecto)
src/components   → UI cliente (mapa, formularios, wizard)
src/server       → auth, validación, rate limit, servicios y repositorios
src/shared       → contrato de integración
supabase         → migraciones SQL
tests            → Vitest
```

## Seguridad y privacidad

- Escrituras a casos, apoyos, observaciones y reclamaciones pasan por el servidor con service role;
  RLS solo expone lecturas públicas.
- La vinculación de un reporte exige que el correo verificado coincida con el correo de contacto
  guardado y que el caso no tenga dueño.
- Un reporte no publicado solo es visible para su dueño o roles de gobierno/administración.
- Un apoyo activo por usuario y caso compartido, reforzado por índice único parcial.
- Un veredicto comunitario activo por usuario y caso.
- Privilegios de gobierno solo con membresía de organización verificada (`npm run grant:org`).
- Bitácora de eventos de solo agregado (sin `UPDATE`/`DELETE`).
- Límite de uso en memoria por proceso para creación, apoyos, observaciones y enlaces de acceso.
- Límites de subida: 3 fotos, 5 MB, JPG/PNG/WEBP.
- Los datos de contacto nunca se incluyen en respuestas públicas.

## Estado de verificación

- `npm run typecheck` — sin errores.
- `npm run test` — 48 pruebas.
- `npm run lint` — sin advertencias.
- `npm run build` — compilación de producción correcta.

## Trabajo en paralelo

Las sesiones 2–5 trabajan en worktrees separados:

| Worktree | Rama | Alcance |
| --- | --- | --- |
| `votavia` | `main` | Fases 1 y 2 (este documento) |
| `votavia-ai` | `feature/ai-intelligence` | Inteligencia y análisis |
| `votavia-government-ux` | `feature/government-ux` | Panel de gobierno |
| `votavia-official-data` | `feature/official-data` | Ingesta de datos oficiales |
| `votavia-public-api` | `feature/public-api` | API pública y `/desarrolladores` |
| `votavia-qa` | `feature/qa-integration` | QA e integración |

No modificar los worktrees de otras sesiones desde aquí. La integración debe hacerse por merge o
por cambios explícitos en el contrato compartido.
