# VotaVía · Consola de Gobierno

Documento de entrega de la consola operativa de gobierno. El camino de producción
habla con las APIs autenticadas del núcleo de Session 1; existe además un modo de
muestra explícito, rotulado en pantalla, para revisar la interfaz sin núcleo.

Este documento describe la **Sesión 2**: espacio de trabajo gubernamental, revisión
de casos, priorización comunitaria, evidencia de gobierno, cierre operativo y
respuesta a disputas ciudadanas.

> **Aviso de demostración.** Todas las cuentas, folios y registros de este entorno
> son ficticios. El uso de esta consola **no representa una adopción oficial de
> VotaVía por el Gobierno de la Ciudad de México** ni por ninguna dependencia real.
> Las cuentas de muestra se identifican explícitamente como cuentas de demostración.

## Principios que la interfaz conserva

- El análisis con IA es **advisory**: resume, agrupa y sugiere; no decide ni cierra.
- La intervención la **verifica una persona** del gobierno antes del cierre operativo.
- **Tres estados viven separados**: operativo (VotaVía), importado (fuente externa)
  y verificación ciudadana. Un cambio en uno no reescribe los otros.
- La **seguridad pesa más que la popularidad**; el orden se explica con un desglose
  transparente de puntos.
- La inteligencia preventiva contiene **observaciones**, no predicciones.
- Todo dato de demostración se etiqueta como muestra.

## Autorización en modo de muestra

> Aplica únicamente con `NEXT_PUBLIC_VOTAVIA_API_MODE=demo`. En el camino de
> producción la identidad, los permisos y el alcance provienen de
> `/api/organizations/me` (ver *Autenticación y pertenencia a organización*).

`src/lib/government/mock-data.ts` define cuatro cuentas ficticias. El proveedor
(`GovernmentProvider`) aplica los permisos y el alcance por área en cada acción; el
servicio de muestra (`mock-service`) es la única fuente de datos en este modo. **No
hay una segunda base de datos, un segundo sistema de autenticación ni una API
pública paralela.**

| Cuenta | Rol | Alcance | Permisos |
| --- | --- | --- | --- |
| Valeria Ortiz · `demo-valeria` | Coordinación de la mesa | Toda la mesa | administrar, asignar, evidencia, despacho, disputas, publicar, restablecer |
| Diego Salgado · `demo-diego` | Operador de Obras | Sólo casos de Obras | administrar, evidencia, disputas |
| Lucía Márquez · `demo-lucia` | Operadora de Aguas | Sólo casos de Aguas | administrar, evidencia, disputas |
| Nadia Ruiz · `demo-nadia` | Analista | Sólo lectura global | ninguno |

Reglas aplicadas:

- Un permiso ausente bloquea la acción con un mensaje explicativo.
- Un operador con `departmentId` **sólo puede operar casos de su propia área**; el
  intento fuera de alcance muestra el motivo y no ejecuta el cambio.
- Sólo la cuenta de coordinación puede restablecer los datos de muestra.
- La cuenta activa se cambia desde el menú de perfil (barra superior) o desde
  Configuración, y se recuerda por navegador en `votavia-government-demo-user-v1`.
- Cada cuenta muestra siempre la leyenda "Cuenta de demostración" y el aviso de que
  no representa a un funcionario real.

## Rutas

| Ruta | Pantalla | Componente |
| --- | --- | --- |
| `/gobierno` | Resumen operativo | `DashboardView` |
| `/gobierno/reportes` | Bandeja con filtros por ubicación/categoría y exportación CSV | `ReportCasesView` |
| `/gobierno/reportes/[id]` | Espacio de trabajo del caso (ver abajo) | `CaseDetailView` |
| `/gobierno/inteligencia` | Inteligencia preventiva por señales | `PreventiveIntelligenceView` |
| `/gobierno/resultados` | Resultados publicados y evidencia antes/después | `ResultsView` |
| `/gobierno/mapa` | Mapa operativo con selección de casos | `MapView` |
| `/gobierno/colonias` | Ranking y detalle por colonia | `ColoniasView` |
| `/gobierno/equipo` | Equipo, capacidad y especialistas | `TeamView` |
| `/gobierno/configuracion` | Integraciones, cuentas de demostración y reset | `SettingsView` |

El layout compartido vive en `src/app/gobierno/layout.tsx` y monta
`GovernmentProvider` + `AppShell` (barra lateral, barra superior y contenido).

## Espacio de trabajo del caso

`/gobierno/reportes/[id]` reúne, en orden de lectura:

1. **Encabezado** con folio, prioridad, estado operativo y acciones del caso.
2. **Tres fuentes, tres estados** (`CaseStatusOverview`): estado operativo de
   VotaVía, estado del registro importado y verificación comunitaria, cada uno en
   su carril con su propia fuente, frescura y responsable.
3. **Disputa ciudadana** (`ResolutionDisputePanel`) cuando existe: se resalta arriba.
4. **Priorización comunitaria** (`CommunityPriorityPanel`) con el desglose de puntos.
5. **Reporte ciudadano** y **reportes vinculados** (`LinkedReportsPanel`): folio,
   colonia, apoyos y estado de cada caso relacionado.
6. **Intervención y evidencia de gobierno** (`GovernmentInterventionPanel`).
7. **Orden de trabajo / especialista** (consumida de la Sesión 1 e Ismael).
8. **Barra lateral** con asignación de área y **responsable operativo**
   (`OperatorAssignmentPanel`), verificaciones y bitácora.

El detalle conserva el despacho de especialistas existente: la consola **no crea un
servicio de despacho propio**; consume `getDispatchRecommendations`,
`authorizeDispatch` y `advanceDispatch`.

## Priorización comunitaria

Cada caso muestra siete señales: apoyos únicos, reportes independientes, antigüedad
desde el primer reporte, concentración geográfica, riesgo de seguridad, acción de
gobierno existente y resultado de verificación comunitaria.

Cuando hay desglose disponible (`priorityBreakdown`), se listan los factores con
puntos sobre máximo y una nota que explica el orden. El riesgo de seguridad tiene el
mayor peso (30/100) y la interfaz lo dice explícitamente: **no se ordena sólo por
apoyos**. `case-0832` (96/100) y `case-0847` (59/100) demuestran que un caso con
menos popularidad puede subir por riesgo.

## Tres estados separados

| Estado | Dueño | Se actualiza con | Nunca se modifica por |
| --- | --- | --- | --- |
| Operativo (VotaVía) | Mesa de gobierno | asignar, avanzar, verificar, publicar | la importación externa |
| Importado (SUAC simulado) | Fuente externa | una nueva importación (fuera de alcance) | cualquier acción de esta consola |
| Verificación ciudadana | Ciudadanía | la experiencia ciudadana | un cierre operativo de gobierno |

El carril importado muestra siempre: **fuente**, **folio de origen**, **estado
reportado**, **dependencia**, **fecha de importación**, **última lectura** y una
etiqueta de **frescura** (`fresh` / `aging` / `stale`).

Un cierre operativo:

- **no** reescribe el registro importado;
- **no** marca la verificación ciudadana como exitosa;
- **no** borra evidencia previa;
- **no** elimina una disputa.

Además, publicar un resultado queda bloqueado mientras exista una disputa abierta o
la verificación ciudadana siga en `disputed`.

## Evidencia de gobierno y cierre operativo

`GovernmentInterventionPanel` permite, a cuentas con `evidence:upload`:

- subir **antes / después / documento** con vista previa (o imagen de muestra);
- explicar la intervención y cualquier limitación visible;
- registrar **fecha y hora** de la intervención;
- asociar **área responsable** y **operador** (el área queda acotada al alcance de
  la cuenta cuando el usuario tiene departamento);
- dejar constancia con `authorId` y `submittedAt` para el historial auditable.

El **cierre operativo** (`recordCompletionClaim`) exige un resumen y al menos una
evidencia asociada. Genera un `CompletionClaim` que:

- deja el estado operativo en `pending_verification`;
- conserva `operationalStatusAtClaim` y la nota de inmutabilidad;
- aparece como "Aviso vigente" / "Aviso anterior" en el historial, sin sobrescribir
  avisos previos.

La verificación operativa (`verifyIntervention`) cambia el estado operativo a
`resolved`, pero **no** toca la verificación ciudadana; la interfaz lo aclara con
"Aprobar cierre operativo" y una nota de que no equivale a verificación ciudadana.

## Disputas de resolución

`ResolutionDisputePanel` aparece cuando el caso tiene una disputa y muestra:

- el motivo y detalle de la ciudadanía, con su fotografía;
- el **aviso original conservado** y su evidencia;
- las respuestas de gobierno previas con su evidencia de seguimiento;
- el estado de la disputa (abierta / con respuesta).

Una cuenta con `dispute:respond` puede responder y adjuntar evidencia adicional. La
respuesta **no** cambia la verificación ciudadana, **no** cierra la disputa y **no**
borra la evidencia original; solo la ciudadanía puede actualizar el resultado. La
publicación permanece bloqueada mientras la disputa siga abierta.

## Archivos clave

- `src/components/government/GovernmentProvider.tsx` — estado compartido, cuenta
  activa, permisos/alcance y acciones.
- `src/components/government/CaseGovernance.tsx` — carriles de estado, prioridad,
  reportes vinculados, asignación de responsable, evidencia, cierre y disputas.
- `src/components/government/CaseDetailView.tsx` — composición del espacio de trabajo.
- `src/components/government/Topbar.tsx`, `Sidebar.tsx`, `SettingsView.tsx` — cambio de
  cuenta de demostración y avisos.
- `src/components/government/ui.tsx`, `charts.tsx` — badges, diálogos, tarjetas.
- `src/lib/government/types.ts` — tipos de dominio y contrato `GovernmentService`.
- `src/lib/government/mock-service.ts` — implementación de muestra con persistencia.
- `src/lib/government/mock-data.ts` — casos, registros importados, evidencia,
  disputas, cuentas y análisis de ejemplo.
- `src/lib/government/display.ts` — etiquetas y formatos en español.
- `src/app/globals.css` — sistema visual, responsive y `prefers-reduced-motion`.
- `public/report-photos/*.svg` — ilustraciones de muestra para evidencia.

## Contrato de servicio

La consola consume una sola interfaz declarada en `src/lib/government/types.ts`:

```ts
export interface GovernmentService {
  getDashboard(): Promise<GovernmentDashboard>;
  listCases(filters?: GovernmentCaseFilters): Promise<GovernmentCase[]>;
  getCase(id: string): Promise<GovernmentCase | null>;
  getCaseAnalysis(id: string): Promise<CaseAnalysis>;
  updateCasePriority(id: string, priority: CasePriority): Promise<void>;
  updateCaseStatus(id: string, status: CaseStatus): Promise<void>;
  assignDepartment(id: string, departmentId: string): Promise<void>;
  assignOperator(id: string, operatorId: string, operatorName: string): Promise<void>;
  getDispatchRecommendations(id: string): Promise<SpecialistRecommendation[]>;
  getDispatchOrder(caseId: string): Promise<DispatchOrder | null>;
  authorizeDispatch(caseId: string, specialistId: string): Promise<DispatchOrder>;
  advanceDispatch(caseId: string, state: DispatchState): Promise<void>;
  verifyIntervention(caseId: string, decision: "verified" | "returned"): Promise<void>;
  publishOutcome(caseId: string, outcome: string): Promise<void>;
  uploadGovernmentEvidence(
    caseId: string,
    input: GovernmentEvidenceInput,
  ): Promise<GovernmentEvidenceRecord>;
  recordCompletionClaim(
    caseId: string,
    input: CompletionClaimInput,
  ): Promise<CompletionClaim>;
  respondToDispute(caseId: string, input: DisputeResponseInput): Promise<void>;
  getPreventiveSignals(): Promise<RiskSignal[]>;
}
```

`GovernmentProvider` importa la instancia `governmentService` de `mock-service.ts`.
Para conectar producción basta crear un adaptador que implemente esta interfaz y
apuntar esa importación al nuevo servicio (o inyectarlo por contexto).

## Integraciones requeridas

1. **Sesión 1 · expedientes ciudadanos** — recepción, historial y cambios de estado
   (`listCases`, `getCase`, `updateCaseStatus`, `getDashboard`), incluyendo apoyos
   únicos y reportes independientes.
2. **Sesión 3 · motor de análisis con IA** — resúmenes, coincidencias y citas para
   revisión humana (`getCaseAnalysis`); nunca cierra casos automáticamente.
3. **Ismael · despacho de especialistas e ingesta** — recomendaciones, órdenes de
   trabajo y evidencia (`getDispatchRecommendations`, `authorizeDispatch`,
   `advanceDispatch`). Esta consola **no** implementa un despacho paralelo.
4. **Importador SUAC** — registros externos con fuente, folio, estado reportado y
   frescura. El estado importado es de solo lectura para esta consola.
5. **Verificación ciudadana** — resultado gestionado por la ciudadanía; esta consola
   sólo lo muestra y responde a disputas.
6. **(Opcional) resultados públicos** — `publishOutcome` y estadísticas agregadas.

Toda integración real debe conservar autorización humana, trazabilidad, manejo de
errores y estados de carga explícitos.

## Persistencia local de muestra (sólo modo `demo`)

> **Alcance.** Esta sección describe el modo de muestra explícito
> (`NEXT_PUBLIC_VOTAVIA_API_MODE=demo`). Con el valor por omisión (`core`) este
> código no se instancia y `localStorage` no se toca.

`MockGovernmentService` guarda casos, órdenes, evidencia, avisos y actividad en
`localStorage` bajo:

```
votavia-government-mock-v2
```

Detalles:

- Si la clave no existe o el contenido es inválido, se carga la semilla.
- Al leer una versión anterior, se migran/completan los campos nuevos
  (`officialRecord`, `communityVerification`, `priorityBreakdown`,
  `governmentEvidence`, `completionClaims`, `dispute`, responsable asignado).
- Los cambios se escriben en esa clave; la cuenta activa se guarda aparte en
  `votavia-government-demo-user-v1`.
- `resetMockData()` borra la clave y restaura la semilla, sólo desde la cuenta de
  coordinación y previa confirmación.
- En render del servidor se usa la semilla, por lo que el estado inicial es
  determinista.

## Casos de demostración

| Caso | Qué demuestra |
| --- | --- |
| `case-0832` | Flujo completo: 7 reportes, 86 apoyos, 96/100, folio SUAC obsoleto, evidencia antes/después/acta, aviso de cierre, **disputa abierta** sin respuesta aún |
| `case-0844` | Evidencia de gobierno cargada; verificación ciudadana en curso |
| `case-0847` | Prioridad alta por seguridad con baja popularidad; registro importado fresco; sin acción de gobierno |
| `case-0821` | Caso crítico con dato oficial obsoleto |
| `case-0825`, `case-0812` | Cierres con verificación comunitaria exitosa |

## Modo núcleo: integración con Session 1

El camino de producción es el **modo núcleo**: APIs autenticadas de Session 1, sin
datos ficticios ni `localStorage`. El modo de muestra existe sólo como excepción
explícita para revisar la interfaz cuando no hay núcleo levantado.

| Modo | Activación | Fuente de datos | Sesión |
| --- | --- | --- | --- |
| **Núcleo (predeterminado / producción)** | sin variable, o `NEXT_PUBLIC_VOTAVIA_API_MODE=core` | `CoreGovernmentService` → API `/api` de Session 1 | `/api/organizations/me` (cookie del núcleo) |
| Demostración (excepción explícita) | `NEXT_PUBLIC_VOTAVIA_API_MODE=demo` | `MockGovernmentService` (`localStorage`) | Cuentas ficticias locales |

Reglas del camino de producción:

- Ninguna vista importa `mock-service`; sólo el selector de fuente lo referencia y
  únicamente lo instancia con `demo` explícito (proxy diferido).
- No hay respaldo silencioso: si el núcleo no responde, se muestra el error y los
  expedientes permanecen vacíos.
- La consola no persiste sesión propia. El usuario de demostración de la consola ya
  no se guarda en `localStorage` en el camino de producción.

En modo núcleo el `next.config.ts` reescribe `/core-api/:path*` hacia
`${VOTAVIA_CORE_ORIGIN}/api/:path*`. Variables (ver `.env.example`):

```
VOTAVIA_CORE_ORIGIN=http://localhost:3000          # origen del núcleo (Session 1)
NEXT_PUBLIC_VOTAVIA_API_MODE=core                  # opcional; es el valor por omisión
NEXT_PUBLIC_VOTAVIA_CORE_BASE_PATH=/core-api        # opcional; prefijo del navegador
```

Sin `VOTAVIA_CORE_ORIGIN` la reescritura no se registra y la consola informa
"núcleo no disponible": es el comportamiento correcto, no un fallo silencioso.

### Sesión y autorización (I-16)

- La consola abre sesión con `POST /api/auth/demo` de Session 1 (sólo cuando el
  núcleo no tiene Supabase Auth) y la cierra con `DELETE /api/auth/demo`. No hay
  contraseñas, usuarios ni cookies propias.
- Con la sesión abierta, la puerta de sesión (`SessionGate`) exige una membresía
  verificada de `/api/organizations/me`. Sin membresía no se listan expedientes ni
  se habilitan acciones: el acceso se otorga por fila de membresía, no por dominio
  de correo.
- Los permisos se derivan del rol devuelto por el núcleo
  (`responder < supervisor < admin`) y el alcance por `organization_id`.

> **Dependencia abierta (Session 1).** El sembrado de demostración crea
> organizaciones pero deja `organizationMembers: []`, así que hoy ninguna cuenta
> obtiene membresía y la consola muestra el muro "sin organización verificada".
> Contrato faltante exacto: una fila de `organizationMembers` con
> `organization_id`, `user_id`, `role`, `verified_at` no nulo y `revoked_at` nulo
> para el correo de gobierno de demostración, o un endpoint administrativo que la
> cree. La consola no lo simula: inventarlo sería una segunda autorización.

El navegador nunca llama al núcleo directamente por otro host: la base por defecto
es `/core-api` (mismo origen) para conservar cookies de sesión.

### Mapa de responsabilidades

- **Session 1 (canónico).** Base de datos, autenticación, expedientes, evidencia,
  registros oficiales y permisos. La consola **no** crea una segunda base ni un
  segundo sistema de autenticación.
- **Session 2 (este worktree).** Interfaz de gobierno: bandeja, filtros, detalle,
  gobernanza, evidencia, disputas y asignación etiquetada.
- **Ismael.** Lógica de despacho e ingesta. La consola consume `DispatchGateway`;
  **no** implementa un despacho paralelo.
- **Session 3.** Sugerencias de IA (`getCaseAnalysis`). En modo núcleo devuelve
  `state: "unavailable"` hasta que exista el contrato.
- **Session 5.** Pruebas E2E.

### Adaptador y archivos

- `src/lib/government/core/contract.ts` — espejo tipado del contrato de Session 1
  (categorías, estados, `IssueDetail`, `OrganizationRole`, `DispatchGateway`).
- `src/lib/government/core/http.ts` — `coreRequest` con timeout, mismo origen y
  normalización del sobre de error `{error:{code,message,details}}`.
- `src/lib/government/core/adapter.ts` — `CoreGovernmentService`:
  mapea `IssueDetail` → `GovernmentCase`, calcula prioridad, lee frescura del
  registro oficial, envía estado/evidencia y etiqueta los contratos pendientes.
- `src/lib/government/core/service.ts` — selector `demo | core` y `PENDING_CONTRACTS`.
- `src/lib/government/priority.ts` — `computePriorityBreakdown` compartido (seguridad
  pesa más que popularidad).
- `src/components/government/SessionGate.tsx` — puerta de sesión: sin membresía
  verificada no hay expedientes ni acciones.
- `next.config.ts` — reescritura `/core-api` → API del núcleo.
- `.env.example` — variables del camino de producción.

Endpoints consumidos (sin inventar rutas): `GET /issues`, `GET /issues/[id]`,
`POST /issues/[id]/operational`, `GET|POST /issues/[id]/evidence`,
`GET /official-records/[id]/history`, `GET /organizations/me`, `POST|DELETE /auth/demo`.

### Matriz de roles (derivada de `/organizations/me`)

| Rol de organización | Permisos en la consola |
| --- | --- |
| `responder` | `case:manage`, `evidence:upload`, `dispute:respond` |
| `supervisor` | lo anterior + `case:assign` |
| `admin` | lo anterior + `dispatch:authorize`, `outcome:publish` |

El alcance por `organization_id` se aplica a los casos importados; un usuario fuera
de alcance recibe un aviso y la acción no se ejecuta. Las vistas deshabilitan los
controles sin permiso y muestran el motivo.

### Contratos pendientes (documentados, no inventados)

Cada faltante se resuelve con un *fixture* o *override* local **claramente
etiquetado**; nunca se simula un endpoint inexistente. Fuente de verdad:
`PENDING_CONTRACTS` en `src/lib/government/core/adapter.ts`.

1. **Asignación de área y operador.** El núcleo sólo acepta `organization_id` en el
   cambio operativo. No hay endpoint de responsable/operador → se guarda local y
   etiquetado. Falta: `PATCH /issues/[id]/assignment` (o equivalente) + roster de
   operadores.
2. **Respuesta oficial a disputas.** No hay endpoint. El texto se conserva local y
   etiquetado; la evidencia de seguimiento sí se envía por `/evidence`. Falta:
   `POST /issues/[id]/disputes/[disputeId]/responses`.
3. **Publicación de resultado.** Falta el contrato de publicación. El cierre se
   registra como estado operativo. Falta: `POST /issues/[id]/outcome`.
4. **Feed de actividad.** No hay endpoint; la bitácora se reconstruye con eventos
   del expediente. Falta: `GET /issues/[id]/activity`.
5. **Despacho de especialistas (Ismael).** El contrato `DispatchGateway` no tiene
   implementación HTTP; se usa `FixtureDispatchGateway` rotulado en la UI. Falta:
   implementación HTTP + autenticación del gateway.
6. **Prioridad y alerta de seguridad.** El núcleo no expone un campo de prioridad
   ni bandera de riesgo; se calculan en el cliente. Falta: campos canónicos si el
   núcleo los adopta.
7. **Pertenencia demo.** `organizationMembers` del seed está vacío; en modo demo
   `/organizations/me` puede devolver cero organizaciones y la consola avisa "sin
   organización". Se requiere sembrar la pertenencia a `org-demo-cuauhtemoc`
   (`scripts/grant-organization.mjs`, que necesita Supabase).

### Identificación de cuentas demo

En modo núcleo, una organización marcada como demo produce `isDemo: true`. La barra
superior muestra la etiqueta `Demo`/`Núcleo` (`gov-source-chip`) y el banner de
servicio indica el origen. Ninguna cuenta de demostración se presenta como
funcionario real, y la consola nunca afirma una adopción oficial de CDMX.

## Trazabilidad de datos (auditoría de I-16)

Esta sección responde punto por punto a la observación de Session 5: qué está
conectado de verdad, contra qué almacén, y qué sigue simulado y por qué.

### 1. Pantallas y acciones conectadas a servicios reales

| Pantalla | Acción | Servicio | Endpoint del núcleo |
| --- | --- | --- | --- |
| `/gobierno` (panel) | Cargar bandeja, métricas y prioridad | `listCases` + `getDashboard` | `GET /issues` (+ `GET /issues/[id]` por lote) |
| `/gobierno/reportes` | Listar, filtrar por colonia/categoría, buscar, exportar CSV | `listCases` | `GET /issues?q=&colonia=&category=` |
| `/gobierno/reportes/[id]` | Abrir expediente y bitácora | `listCases`/detalle | `GET /issues/[id]` |
| Detalle · carril oficial | Leer folio, fuente, estado reportado, frescura | adaptador | `GET /issues/[id]` → `official_records` |
| Detalle · gestión | Marcar en revisión / registrar avance | `updateCaseStatus` | `POST /issues/[id]/operational` |
| Detalle · gestión | Publicar resultado (cierre operativo) | `publishOutcome` | `POST /issues/[id]/operational` (`completed`) |
| Detalle · intervención | Registrar cierre con resumen | `recordCompletion` | `POST /issues/[id]/operational` (`completed`) |
| Detalle · evidencia | Subir antes/después con foto y nota | `uploadEvidence` | `POST /issues/[id]/evidence` (multipart) |
| Detalle · disputa | Responder y adjuntar evidencia de seguimiento | `respondDispute` | evidencia → `POST /issues/[id]/evidence` |
| Todas | Sesión y permisos | `loadSession` | `GET /organizations/me` |
| Puerta de sesión | Entrar / salir | `signInDemo` / `signOut` | `POST` / `DELETE /auth/demo` |

Verificación de que no hay rutas inventadas: el inventario de endpoints de esta
consola es exactamente `GET /issues`, `GET /issues/[id]`,
`POST /issues/[id]/operational`, `GET|POST /issues/[id]/evidence`,
`GET /official-records/[id]/history`, `GET /organizations/me` y
`POST|DELETE /auth/demo`. Todo lo demás está en `PENDING_CONTRACTS`.

### 2. Repositorio y configuración que usan esos servicios

La consola no tiene base de datos propia. El núcleo de Session 1 elige el almacén en
`src/server/services/container.ts` según el entorno:

| Configuración del núcleo | Repositorio | Persistencia |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` presentes | `SupabaseCaseRepository` | **Base persistente** (Postgres/Supabase) |
| Sin esas variables (por omisión en local) | `DemoCaseRepository` | **Archivo en disco**: `.data/db.json` (caché en memoria + escritura atómica a archivo). No es memoria volátil: sobrevive al reinicio del proceso |

Consecuencia práctica: aunque el repositorio se llame "demo", **sí persiste**. Lo
que se pierde al recargar el navegador no son los expedientes, sino los *overrides*
de la consola (ver punto 3).

Variables que necesita esta consola (`.env.example`):

```
VOTAVIA_CORE_ORIGIN=http://localhost:3000   # origen del núcleo; sin esto no hay backend
NEXT_PUBLIC_VOTAVIA_API_MODE=core           # por omisión; `demo` es excepción explícita
NEXT_PUBLIC_VOTAVIA_CORE_BASE_PATH=/core-api
```

### 3. Uso restante de mocks y `localStorage`

Búsqueda exhaustiva (`rg -n "localStorage|sessionStorage" src`): devuelve tres
archivos, pero uno (`src/lib/government/core/service.ts`) sólo lo menciona en un
comentario. Quedan exactamente **dos** accesos reales, ambos inalcanzables con el
modo por omisión:

| Archivo | Uso | Cuándo se ejecuta |
| --- | --- | --- |
| `src/lib/government/mock-service.ts` | Persiste el `MockStore` en la clave `votavia-government-mock-v2` | Sólo si `NEXT_PUBLIC_VOTAVIA_API_MODE=demo`; el servicio se instancia de forma diferida |
| `src/components/government/GovernmentProvider.tsx` | Recuerda la cuenta ficticia activa (`votavia-government-demo-user-v1`) | `initialDemoUser()` sólo se llama si `!coreMode`; `switchDemoUser()` retorna antes si `coreMode` |

Además, en modo núcleo hay estado **en memoria de la pestaña** (no `localStorage`):
el mapa `overrides` de `CoreGovernmentService`, que guarda asignación de área,
operador, prioridad manual, respuesta a disputa y claim de cierre. Se pierde al
recargar la página y se anuncia en pantalla como "local/etiquetado". No se escribió
a `localStorage` a propósito: un override de gobierno no debe sobrevivir como si
fuera dato canónico.

**Respuesta a Session 5:** si revisó la versión anterior a `30ef694`, sí veía el modo
de muestra por omisión — ese era el defecto I-16 y está corregido. Contra el commit
actual no queda ninguna lectura de datos ficticios en el camino de producción.

### 4. Los cinco contratos faltantes

Fuente única: `PENDING_CONTRACTS` en `src/lib/government/core/adapter.ts`.

| # | Contrato faltante | Propietario | Comportamiento bloqueado |
| --- | --- | --- | --- |
| 1 | Asignación de responsable distinto de `organization_id` | Session 1 | No se puede persistir el área/departamento responsable. La UI guarda un override local etiquetado; al recargar vuelve al valor del núcleo. `POST /issues/[id]/operational` sólo acepta `organization_id`. |
| 2 | Respuesta oficial a disputas | Session 1 | El texto de respuesta no se guarda en el núcleo. La evidencia de seguimiento **sí** se sube; el texto queda en memoria y se etiqueta. Tampoco existe forma de cerrar la disputa: sólo la ciudadanía cambia la verificación. |
| 3 | Publicación de resultado | Session 1 | El cierre operativo se registra como `operational_status: completed`. El texto de resultado y la fecha de publicación quedan como override local; no hay endpoint de publicación ni de "resultado ciudadano". |
| 4 | Feed de actividad | Session 1 | No hay bitácora dedicada. La línea de tiempo se reconstruye con `created_at`, evidencia y registro oficial; los eventos de overrides no aparecen porque no existen en el servidor. |
| 5 | Despacho de especialistas | Ismael | Sin backend HTTP no hay asignación real de especialistas (ver punto 5). |

Ninguno se resolvió inventando una ruta. Cada uno se declara en la interfaz, en
`SettingsView` (hoja técnica) y en el banner de servicio.

### 5. Sustituto de despacho e interfaz pendiente de Ismael

- **Contrato:** `DispatchGateway` en `src/lib/government/core/contract.ts`
  (`requestDispatch`, `assign`, `getAssignments`, `updateAssignment`).
- **Sustituto:** `FixtureDispatchGateway` en `src/lib/government/core/adapter.ts`.
  Implementa el contrato tipado en memoria, con especialistas de
  `mock-data.ts`. **No es un segundo backend**: no abre puertos, no persiste y no
  crea tablas.
- **Rotulado:** el panel de especialistas muestra un aviso permanente cuando
  `dataSource === "core"`: las órdenes son simuladas y no representan asignaciones
  reales. Los eventos de la orden dicen "Fuente: fixture del contrato de Ismael".
- **Qué falta exactamente:** la implementación HTTP del gateway (base URL + auth de
  servicio) y la confirmación de los campos `status`, `specialist_display_name` y
  `updated_at`. Cuando Ismael publique esas rutas, se sustituye sólo la clase del
  gateway; ni la UI ni el adaptador cambian.

## Autenticación y pertenencia a organización

La consola **no** tiene sistema de autenticación propio: no hay contraseñas, ni
usuarios, ni cookies, ni tabla de sesiones. Todo se delega al núcleo.

### Cómo se abre la sesión

1. `SessionGate` detecta que no hay sesión y ofrece el acceso de demostración del
   núcleo: `POST /api/auth/demo` con el correo.
2. El núcleo responde con una cookie `httpOnly` (`DEMO_USER_COOKIE`) que este
   código nunca lee ni escribe.
3. `DELETE /api/auth/demo` cierra la sesión.
4. Si el núcleo tiene Supabase Auth configurado, el endpoint de demostración
   devuelve `400` a propósito: en ese caso se entra por el enlace de correo de la
   aplicación principal. La consola no ofrece un camino alterno.

### Cómo se verifica la pertenencia

`GET /api/organizations/me` devuelve `{ authenticated, memberships }`. El servidor
resuelve las membresías con `resolveActor()` →
`repository.membershipsFor(user_id)`, que filtra por:

- `user_id` de la sesión,
- `revoked_at === null`,
- `verified_at !== null`.

Es decir: **un correo con dominio gubernamental no otorga nada**. Sin una fila de
membresía verificada, `memberships` llega vacío y la consola muestra el muro "sin
organización verificada" en lugar de listar expedientes. Esto es intencional y es
el estado actual del sembrado.

Después, el rol de esa membresía (`responder < supervisor < admin`) se traduce a
permisos de interfaz, y el alcance se aplica por `organization_id`: un caso de otra
organización queda deshabilitado con mensaje. Aun así, la autorización real ocurre
en el servidor: `POST /issues/[id]/operational` y `POST /issues/[id]/evidence`
validan la membresía y responden `401`/`403` sin importar lo que haga el cliente.

### Dependencia abierta (bloqueante para E2E)

El sembrado crea organizaciones pero deja `organizationMembers: []`. Contrato
faltante exacto, para Session 1:

> Una fila en `organizationMembers` con `organization_id = "org-demo-cuauhtemoc"`,
> `user_id` igual al que produce `POST /api/auth/demo` para el correo de gobierno de
> demostración, `role` en `responder | supervisor | admin`, `scope` opcional,
> `verified_at` no nulo y `revoked_at` nulo. Alternativa: un endpoint administrativo
> que cree esa membresía.

La consola no simula esa fila: hacerlo sería una segunda autorización, justo lo que
el encargo prohíbe.

## Cierre de I-16 (camino de producción sin mocks)

Session 5 reportó que la consola seguía usando mocks y `localStorage`. El cambio:

1. **Modo núcleo por omisión.** `NEXT_PUBLIC_VOTAVIA_API_MODE` ya no cae a `demo`:
   sin variable se usa el adaptador real contra `/api` de Session 1. `demo` es una
   excepción explícita y rotulada.
2. **Sin instanciación de muestra en producción.** `MockGovernmentService` se crea
   de forma diferida y sólo si el modo es `demo`, así que el camino de producción no
   lee ni escribe `localStorage` ni la clave del usuario de demostración anterior.
3. **Sesión real, no simulada.** `SessionGate` abre y cierra sesión con
   `POST|DELETE /api/auth/demo` del núcleo y exige membresía verificada de
   `/api/organizations/me`. Sin organización no se muestran datos.
4. **Estados de error explícitos.** Núcleo caído, 401, 403, 404, 422, 429, timeout y
   lista vacía se muestran con reintento; nunca se rellena con datos ficticios.
5. **Fronteras respetadas.** El registro oficial sigue en sólo lectura (fuente,
   folio, estado reportado, frescura, fecha de importación); el avance operativo y
   la verificación ciudadana se muestran en carriles distintos y ningún cierre
   operativo escribe en ellos.
6. **Despacho.** La interfaz consume `DispatchGateway` de Ismael; como no hay
   backend HTTP, las órdenes se marcan en pantalla como fixture y no como
   asignaciones reales.

## Validación realizada

- `npm run typecheck` — TypeScript sin errores.
- `npm run build` — compilación de producción correcta; 11 rutas (8 estáticas de
  gobierno, la raíz, `_not-found` y el detalle `[id]` dinámico).
- Revisión estática de los flujos: filtros y CSV, mapa, despacho → avance →
  verificación operativa → publicación, asignación de área y responsable, carga de
  evidencia, aviso de cierre, respuesta a disputa y reset.
- Comprobación de que las acciones con permiso insuficiente o fuera de alcance se
  bloquean con mensaje.
- Verificación de que un cierre operativo no altera el registro importado ni la
  verificación ciudadana, y de que publicar se bloquea con disputa abierta.
- Consistencia de datos de muestra (apoyos, reportes independientes, concentración,
  folios de disputa/aviso y archivos de evidencia existentes).
- Revisión de clases CSS usadas contra `globals.css` y puntos de quiebre responsive
  (1360, 1180, 1024, 860, 640, 420 px) con `prefers-reduced-motion`.
- Modo núcleo revisado estáticamente: carga de sesión, `401/403/404/422/429`,
  timeout/reintento, estados vacíos y acciones deshabilitadas por rol. La
  verificación de clics E2E queda para Session 5.

No fue posible levantar el servidor local en este entorno (la política del sandbox
bloquea abrir puertos), por lo que las pruebas de clic en navegador quedan pendientes
de ejecutar en un equipo con `npm run dev`.

## Problemas conocidos

- La barra superior muestra el atajo `⌘ K`; el botón de búsqueda funciona, pero no hay
  listener global de teclado.
- En el camino de producción los datos provienen del núcleo de Session 1. El modo
  `demo` sigue existiendo, pero está rotulado y no se activa sin pedirlo.
- La autorización se resuelve contra membresías del núcleo; el cliente sólo refleja
  los permisos que el servidor devuelve. Las acciones sensibles vuelven a validarse
  en el núcleo (401/403).
- La evidencia del camino de producción se envía como multipart a
  `/api/issues/[id]/evidence`; el `localStorage` de 1.5 MB sólo aplica al modo de
  muestra.
- Asignación de área/operador, respuesta a disputas y publicación de resultado son
  overrides locales etiquetados: no hay contrato de Session 1 todavía (ver
  `PENDING_CONTRACTS`).
- La exportación CSV se genera en el cliente a partir de los casos filtrados.
- Los scripts usan `--webpack` porque Turbopack no resuelve `node_modules` enlazado
  fuera de la carpeta del proyecto en este entorno.

## Entrega a Session 5

### Commits

| Commit | Contenido | Estado |
| --- | --- | --- |
| `28ce97c` | Checkpoint `checkpoint(feature/government-ux): preserve session work` — consola completa (panel, reportes, detalle, gobernanza, evidencia, disputas) con adaptador de núcleo **detrás** de `NEXT_PUBLIC_VOTAVIA_API_MODE=core`; por omisión caía a `demo` | Conservado en la rama, es ancestro del actual |
| `30ef694` | `fix(government-ux): make the core API the production data path (I-16)` — modo núcleo por omisión, instanciación diferida del mock, `SessionGate`, sesión por `/auth/demo` | Encima de `28ce97c` |
| `ce281ec` | `docs(government-ux): session 5 handoff for the I-16 core wiring` — `SESSION5_HANDOFF.md` | Encima de `30ef694` |
| `b39f7b6` | `docs(government-ux): data traceability, auth model and session 5 delivery` — este documento: trazabilidad, autenticación, contratos pendientes y entrega | Encima de `ce281ec` · **HEAD** |

Rama: `feature/government-ux` · Worktree:
`/Users/shirley/Documents/code/votavia-government-ux` · Etiqueta local:
`checkpoint/feature-government-ux-2026-10-30`.

`28ce97c` se conserva intacto y sin reescribir, como se pidió. **Para revisar I-16
hay que mirar `30ef694` o posterior**: en `28ce97c` el defecto todavía existe por
diseño (el modo de muestra era el valor por omisión). Revisar sólo `28ce97c`
reproduce exactamente el hallazgo de Session 5.

### Cómo revisar y ejecutar

```bash
cd /Users/shirley/Documents/code/votavia-government-ux
git log --oneline -3                    # 28ce97c → 30ef694 → ce281ec
npm ci
npm run typecheck                       # tsc --noEmit
npm run build                           # next build, 11 rutas

# Con el núcleo de Session 1 levantado:
cp .env.example .env.local              # ajusta VOTAVIA_CORE_ORIGIN
npm run dev                             # http://localhost:3001/gobierno
```

Comprobaciones puntuales de I-16:

```bash
# 1) No queda localStorage en el camino de producción
rg -n "localStorage" src
#    esperado: mock-service.ts + GovernmentProvider.tsx (sólo modo demo)
#    y un comentario en core/service.ts (sin acceso real)

# 2) El modo por omisión es el núcleo
rg -n "NEXT_PUBLIC_VOTAVIA_API_MODE" src/lib/government/core/service.ts
#    esperado: ?? "core"

# 3) Ninguna vista importa el servicio de muestra
rg -n "mock-service" src/components src/app
#    esperado: sin resultados
```

En pantalla, con el sembrado actual, lo esperado es ver el muro **"Tu cuenta no
tiene una organización verificada"**: es la prueba de que no hay datos ficticios de
respaldo y de que la autorización depende de una membresía real del núcleo.

### Sobre el parche

El push al remoto **sigue fallando** en este entorno (`fatal: Could not read from
remote repository`, exit 128): no hay salida DNS/red. Por eso se preparó un parche
`git format-patch` desde `28ce97c..HEAD` y se guardó en una ruta del espacio de
trabajo compartido:

```
/Users/shirley/Documents/code/votavia-session2-patches/
  0001-fix-government-ux-make-the-core-API-the-production-d.patch
  0002-docs-government-ux-session-5-handoff-for-the-I-16-co.patch
  0003-docs-government-ux-data-traceability-auth-model-and-.patch
  0004-docs-government-ux-record-final-commit-and-verified-.patch
```

**Estado: accesible y verificado.** Se clonó este worktree en una ruta temporal, se
retrocedió a `28ce97c` y se aplicaron los cuatro parches con `git am`: éxito, sin
conflictos, `git status` limpio, y el árbol resultante coincide byte a byte con el
árbol de HEAD de este worktree. Por lo tanto el parche **sí se declara entregado**.

Los hashes de commit del parche aplicado pueden diferir de los de este worktree
porque `git am` reescribe la fecha de autoría; lo que debe coincidir es el
**árbol**. Compruébalo así en ambas copias: `git rev-parse HEAD^{tree}`.

Para aplicarlo en otra copia:

```bash
git checkout -b feature/government-ux 28ce97c   # o el checkpoint indicado
git am /Users/shirley/Documents/code/votavia-session2-patches/000*.patch
git log --oneline -5                            # 28ce97c + 4 commits de esta sesión
```

Si esa ruta no es visible desde el equipo de Session 5, el parche debe copiarse a
un canal compartido (adjunto, unidad compartida o artefacto de CI) y verificarse de
nuevo con `git apply --check` antes de darlo por entregado. No se declara entregado
un parche que no se haya podido leer y aplicar.

## Estado del trabajo

Los cambios están **confirmados en local** sobre `feature/government-ux`
(`28ce97c` → `30ef694` → `ce281ec` → `b39f7b6`). El push al remoto falla en este entorno porque
no hay salida DNS/red, así que los commits y la etiqueta existen únicamente en esta
copia. Este slice **no se fusiona ni se despliega**: la coordinación y las pruebas
E2E (Session 5) deciden la integración. La rama no se rebasea ni se mezcla desde
aquí.
