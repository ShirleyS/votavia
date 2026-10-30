"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Building2,
  Check,
  CircleAlert,
  Database,
  HardHat,
  HardDrive,
  KeyRound,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { DEMO_ROLE_LABELS } from "@/lib/government/display";
import type { GovernmentPermission } from "@/lib/government/types";
import { useGovernment } from "./GovernmentProvider";
import { SampleBadge, SectionTitle } from "./ui";

const PERMISSION_LABELS: Record<GovernmentPermission, string> = {
  "case:manage": "Gestionar casos",
  "case:assign": "Asignar área y responsables",
  "evidence:upload": "Cargar evidencia",
  "dispatch:authorize": "Autorizar despachos",
  "dispute:respond": "Responder disputas",
  "outcome:publish": "Publicar resultados",
  "settings:reset": "Restablecer muestra",
};

const integrations = [
  {
    icon: Building2,
    name: "API de expedientes ciudadanos",
    detail: "Recepción, historial y cambios de estado de los reportes.",
    contract: "GovernmentService · listCases / getCase / updateCaseStatus",
    status: "No conectada",
    tone: "blue",
  },
  {
    icon: Sparkles,
    name: "Motor de análisis con IA",
    detail: "Resúmenes, coincidencias y citas para revisión humana.",
    contract: "GovernmentService · getCaseAnalysis",
    status: "Análisis simulado",
    tone: "violet",
  },
  {
    icon: HardHat,
    name: "Servicio de despacho de especialistas",
    detail: "Recomendaciones, órdenes de trabajo y evidencia de intervención.",
    contract: "GovernmentService · authorizeDispatch / advanceDispatch",
    status: "No conectado",
    tone: "amber",
  },
];

export function SettingsView() {
  const {
    resetMockData,
    cases,
    currentUser,
    demoUsers,
    switchDemoUser,
    dataSource,
    organizations,
    authenticated,
    pendingContracts,
  } = useGovernment();
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText("votavia-government-mock-v2");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const confirm = () => {
    resetMockData();
    setConfirmReset(false);
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <div className="page-heading__eyebrow">
            <span className="eyebrow">Entorno de demostración</span>
            <SampleBadge />
          </div>
          <h1>Configuración</h1>
          <p>Entiende dónde vive la información, qué está conectado y cómo restablecer la muestra.</p>
        </div>
        <span className="settings-mode-pill"><span /> {dataSource === "core" ? "Modo núcleo (Session 1)" : "Modo muestra activo"}</span>
      </div>

      <div className="settings-status" role="status">
        <span className="settings-status__icon"><ShieldCheck size={21} /></span>
        {dataSource === "core" ? (
          <div>
            <strong>{authenticated ? "Conectada a la API del núcleo (Session 1)" : "Sin sesión válida del núcleo"}</strong>
            <p>Los estados operativos y la evidencia se envían a la API de Session 1. La asignación de área/operador, la respuesta a disputas y la publicación de resultados siguen pendientes de contrato y se guardan de forma local y etiquetada. Esta consola no representa una adopción oficial de CDMX.</p>
          </div>
        ) : (
          <div>
            <strong>Esta consola no está conectada a servicios de producción</strong>
            <p>Todos los cambios que hagas aquí se guardan únicamente en el almacenamiento local de este navegador. No crean órdenes, no notifican a ciudadanía y no alteran la base de datos real.</p>
          </div>
        )}
        <span className="settings-status__count">{cases.length} casos · {dataSource === "core" ? "núcleo" : "locales"}</span>
      </div>

      <section className="panel settings-demo-accounts">
        <SectionTitle
          eyebrow="Autorización de demostración"
          title={dataSource === "core" ? "Sesión y alcance por organización" : "Cuentas ficticias y alcance por área"}
          subtitle={dataSource === "core"
            ? "La sesión proviene de /api/organizations/me. Los permisos se derivan del rol (responder, supervisor, admin) y del alcance de cada organización."
            : "Los permisos y el alcance organizacional se aplican a toda la consola. Ninguna cuenta representa a un funcionario real."}
        />
        <div className="demo-account-list">
          {demoUsers.map((user) => (
            <article className={`demo-account ${user.id === currentUser.id ? "is-current" : ""}`} key={user.id}>
              <span className="demo-account__avatar">{user.initials}</span>
              <div className="demo-account__identity">
                <strong>{user.name}</strong>
                <span>{user.title}</span>
                <em>{DEMO_ROLE_LABELS[user.role]} · {user.departmentId ? (user.departmentId === "obras" ? "Solo casos de Obras" : "Solo casos de Aguas") : "Toda la mesa"}</em>
              </div>
              <div className="demo-account__permissions">
                {user.permissions.length === 0 ? (
                  <span className="permission-chip"><LockKeyhole size={12} /> Solo lectura</span>
                ) : (
                  user.permissions.slice(0, 3).map((permission) => (
                    <span className="permission-chip" key={permission}>{PERMISSION_LABELS[permission]}</span>
                  ))
                )}
                {user.permissions.length > 3 ? <span className="demo-account__more">+{user.permissions.length - 3}</span> : null}
              </div>
              {user.id === currentUser.id ? (
                <span className="demo-account__active"><UserCheck size={14} /> Sesión actual</span>
              ) : (
                <button type="button" className="button button--secondary button--small" onClick={() => switchDemoUser(user.id)}>
                  Usar esta cuenta
                </button>
              )}
            </article>
          ))}
        </div>
        {dataSource === "core" ? (
          <div className="settings-demo-note">
            <Users size={16} />
            {organizations.length === 0 ? (
              <p>
                No hay ninguna organización asociada a esta sesión. Sin organización no se pueden
                enviar cambios operativos ni evidencia. Pide a Session 1 que siembre la pertenencia
                del usuario demo a <code>org-demo-cuauhtemoc</code>.
              </p>
            ) : (
              <p>
                Organizaciones: {organizations.map((org) => `${org.name} (${org.role})`).join(" · ")}.
                El cambio de persona está deshabilitado en modo núcleo; la sesión la define la API.
              </p>
            )}
          </div>
        ) : (
          <div className="settings-demo-note">
            <Users size={16} />
            <p>Las cuentas de operación sólo ven y modifican casos de su propia área. La coordinación puede asignar responsables, autorizar despachos y publicar resultados. La cuenta de análisis no puede modificar nada.</p>
          </div>
        )}
      </section>

      <div className="settings-grid">
        <div className="settings-main">
          <section className="panel settings-card">
            <SectionTitle
              eyebrow="Modo actual"
              title={dataSource === "core" ? "Datos del núcleo, acciones autorizadas" : "Datos de muestra, acciones locales"}
              subtitle={dataSource === "core"
                ? "La bandeja y el estado operativo provienen de la API de Session 1; los contratos pendientes se etiquetan."
                : "Diseñado para revisar flujos completos sin tocar información real."}
            />
            <div className="settings-factgrid">
              <div><span><Database size={17} /></span><div><strong>{cases.length} expedientes</strong><p>{dataSource === "core" ? "Cargados desde la API del núcleo." : "Copias ficticias cargadas al abrir la consola."}</p></div></div>
              <div><span><HardDrive size={17} /></span><div><strong>{dataSource === "core" ? "Núcleo + overrides locales" : "Guardado en este navegador"}</strong><p>{dataSource === "core" ? "Estado y evidencia van al núcleo; la asignación se conserva local y etiquetada." : "Los cambios sobreviven a una recarga en este equipo."}</p></div></div>
              <div><span><LockKeyhole size={17} /></span><div><strong>{dataSource === "core" ? "Escritura autorizada" : "Sin escritura remota"}</strong><p>{dataSource === "core" ? "Sólo acciones con permiso de tu rol y organización." : "No hay llamadas de modificación a bases de datos."}</p></div></div>
              <div><span><RefreshCw size={17} /></span><div><strong>Restablecimiento manual</strong><p>Puedes volver al estado inicial de la muestra.</p></div></div>
            </div>
            <div className="settings-key">
              <div>
                <span className="settings-key__label"><KeyRound size={14} /> Llave de almacenamiento local</span>
                <code>votavia-government-mock-v2</code>
              </div>
              <button type="button" className="button button--secondary button--small" onClick={() => void copyKey()}>
                {copied ? <><Check size={14} /> Copiada</> : "Copiar llave"}
              </button>
            </div>
          </section>

          <section className="panel settings-card settings-flow">
            <SectionTitle
              eyebrow="Flujo de la muestra"
              title="Qué puedes probar de punta a punta"
              subtitle="Cada paso conserva la decisión humana como punto de control."
            />
            <div className="settings-steps">
              <div><span>01</span><div><strong>Revisar y asignar</strong><p>Clasifica prioridad, elige un área responsable y consulta análisis simulados.</p></div></div>
              <div><span>02</span><div><strong>Autorizar el despacho</strong><p>Selecciona un especialista aprobado y sigue el avance de la orden.</p></div></div>
              <div><span>03</span><div><strong>Verificar y publicar</strong><p>Gobierno valida la evidencia, marca el cierre y redacta el resultado ciudadano.</p></div></div>
            </div>
            <div className="settings-flow__actions">
              <Link href="/gobierno/reportes" className="button button--primary">Ir a la bandeja <ArrowRight size={15} /></Link>
              <Link href="/gobierno/resultados" className="button button--secondary">Ver resultados</Link>
            </div>
          </section>

          <section className="panel settings-card">
            <SectionTitle
              eyebrow="Integraciones previstas"
              title="Contratos que faltan conectar"
              subtitle="La experiencia está lista para sustituir el servicio de muestra por adaptadores reales."
            />
            <div className="settings-integrations">
              {integrations.map(({ icon: Icon, ...item }) => (
                <article className={`settings-integration settings-integration--${item.tone}`} key={item.name}>
                  <div className="settings-integration__top">
                    <span className="settings-integration__icon"><Icon size={18} /></span>
                    <span className="settings-integration__status"><i /> {item.status}</span>
                  </div>
                  <strong>{item.name}</strong>
                  <p>{item.detail}</p>
                  <code>{item.contract}</code>
                </article>
              ))}
            </div>
            <div className="settings-integration-note">
              <PlugZap size={16} />
              <p>La sustitución debe conservar autorización humana, trazabilidad, manejo de errores y estados de carga. Un servicio conectado no debe cerrar casos de forma automática.</p>
            </div>
          </section>
        </div>

        <aside className="settings-aside">
          <section className="panel settings-ai">
            <span className="settings-ai__icon"><Bot size={21} /></span>
            <span className="eyebrow">Límites del asistente</span>
            <h2>La IA sugiere; gobierno decide</h2>
            <p>Los resúmenes, departamentos recomendados y especialistas mostrados son ayudas de priorización. No emiten resoluciones ni ejecutan cierres.</p>
            <ul>
              <li><BadgeCheck size={14} /> Cada sugerencia indica revisión humana.</li>
              <li><BadgeCheck size={14} /> La evidencia se valida antes de cerrar.</li>
              <li><BadgeCheck size={14} /> Las señales preventivas son observaciones.</li>
            </ul>
          </section>

          <section className="panel settings-security">
            <div className="panel__head">
              <div><span className="eyebrow">Privacidad</span><h2>Datos protegidos en la muestra</h2></div>
              <LockKeyhole size={18} />
            </div>
            <div className="settings-security__row"><span>Identidad ciudadana</span><strong>Enmascarada</strong></div>
            <div className="settings-security__row"><span>Fotografías</span><strong>Ilustraciones ficticias</strong></div>
            <div className="settings-security__row"><span>Evidencia de trabajo</span><strong>Solo uso interno</strong></div>
            <div className="settings-security__row"><span>Analítica</span><strong>Sin envío externo</strong></div>
            <p>No introduzcas datos personales reales en comentarios o resultados mientras uses este entorno.</p>
          </section>

          <section className="panel settings-reset">
            <span className="settings-reset__eyebrow"><CircleAlert size={14} /> Zona de reinicio</span>
            <h2>{dataSource === "core" ? "Restablecimiento no disponible" : "Restablecer datos de muestra"}</h2>
            <p>{dataSource === "core"
              ? "En modo núcleo los expedientes provienen de la API de Session 1 y no se restablecen desde esta consola."
              : "Borra los cambios locales de prioridad, despachos, verificaciones y publicaciones. Vuelve a los expedientes originales."}</p>
            <button
              type="button"
              className="button button--danger-ghost button--full"
              onClick={() => setConfirmReset(true)}
              disabled={dataSource === "core"}
            >
              <RefreshCw size={15} /> Restablecer la muestra
            </button>
            <span className="settings-reset__scope">{dataSource === "core" ? "Gestionado por Session 1" : "Afecta solo este navegador"}</span>
          </section>

          <section className="panel settings-tech">
            <div className="panel__head">
              <div><span className="eyebrow">Entorno</span><h2>Ficha técnica</h2></div>
              <ServerCog size={18} />
            </div>
            <dl>
              <div><dt>Modo</dt><dd>{dataSource === "core" ? "Núcleo (Session 1)" : "Demostración local"}</dd></div>
              <div><dt>Persistencia</dt><dd>{dataSource === "core" ? "Postgres del núcleo + overrides locales" : "LocalStorage"}</dd></div>
              <div><dt>Servicio</dt><dd>{dataSource === "core" ? "CoreGovernmentService" : "MockGovernmentService"}</dd></div>
              <div><dt>Conexión externa</dt><dd>{dataSource === "core" ? "API /api (Session 1)" : "Desactivada"}</dd></div>
              <div><dt>Contratos pendientes</dt><dd>{dataSource === "core" ? pendingContracts.length : 0}</dd></div>
            </dl>
          </section>
        </aside>
      </div>

      <div className="sample-data-footer">
        <SampleBadge>Datos de muestra</SampleBadge>
        <p>{dataSource === "core" ? "La configuración describe el entorno conectado al núcleo. No sustituye documentación de seguridad o privacidad de producción." : "La configuración describe el entorno demostrativo actual. No sustituye documentación de seguridad o privacidad de producción."}</p>
      </div>

      {confirmReset ? (
        <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <button type="button" className="confirm-dialog__scrim" onClick={() => setConfirmReset(false)} aria-label="Cerrar confirmación" />
          <div className="confirm-dialog__card">
            <button type="button" className="confirm-dialog__close" onClick={() => setConfirmReset(false)} aria-label="Cerrar"><X size={17} /></button>
            <span className="confirm-dialog__icon"><RefreshCw size={21} /></span>
            <h2 id="reset-title">¿Restablecer la muestra?</h2>
            <p>Se perderán los cambios locales de todos los expedientes. La base de datos real no se modifica.</p>
            <div className="confirm-dialog__warning"><CircleAlert size={15} /> Esta acción no se puede deshacer en este navegador.</div>
            <div className="confirm-dialog__actions">
              <button type="button" className="button button--secondary" onClick={() => setConfirmReset(false)}>Cancelar</button>
              <button type="button" className="button button--danger" onClick={confirm}><RefreshCw size={15} /> Sí, restablecer</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
