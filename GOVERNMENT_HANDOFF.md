# VotaVía · Consola de Gobierno

Documento de entrega de la consola operativa de gobierno. La experiencia corre con
datos de muestra y está pensada para sustituir el servicio simulado por adaptadores
reales sin rehacer la interfaz ni los flujos.

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

## Autorización de demostración

`src/lib/government/mock-data.ts` define cuatro cuentas ficticias. El proveedor
(`GovernmentProvider`) aplica los permisos y el alcance por área en cada acción; el
servicio (`mock-service`) es la única fuente de datos. **No hay una segunda base de
datos, un segundo sistema de autenticación ni una API pública paralela.**

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

## Persistencia local de muestra

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

No fue posible levantar el servidor local en este entorno (la política del sandbox
bloquea abrir puertos), por lo que las pruebas de clic en navegador quedan pendientes
de ejecutar en un equipo con `npm run dev`.

## Problemas conocidos

- La barra superior muestra el atajo `⌘ K`; el botón de búsqueda funciona, pero no hay
  listener global de teclado.
- Los datos son de muestra y no provienen de servicios reales; no deben usarse para
  decisiones operativas.
- La autorización es de demostración: no hay autenticación real, sesión de servidor ni
  identidad verificada. El control de permisos y alcance vive en el cliente.
- La evidencia cargada se guarda como data URL en `localStorage` (límite 1.5 MB por
  archivo); en producción debe ir a un almacenamiento con control de acceso.
- La exportación CSV se genera en el cliente a partir de los casos filtrados.
- Los scripts usan `--webpack` porque Turbopack no resuelve `node_modules` enlazado
  fuera de la carpeta del proyecto en este entorno.

## Estado del trabajo

Los cambios **no se han confirmado** (sin commit) y permanecen sin seguimiento en la
rama `feature/government-ux`.
