import type { CaseCategory, CaseStatus, CaseEventType, ActorType } from "@/shared/votavia-contract";
import { stockPhoto } from "@/lib/stock-photos";

export interface SeedPhoto {
  url: string;
  kind: "report" | "before" | "after";
  caption?: string;
}

export interface SeedCase {
  id: string;
  category: CaseCategory;
  status: CaseStatus;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  colonia: string;
  address_hint: string | null;
  has_safety_concern: boolean;
  has_accessibility_concern: boolean;
  support_count: number;
  photos: SeedPhoto[];
  created_at: string;
  updated_at: string;
}

export interface SeedEvent {
  type: CaseEventType;
  actor_type: ActorType;
  title: string;
  description?: string;
  created_at: string;
  is_public?: boolean;
}

const daysAgo = (days: number, hours = 0) =>
  new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();

/**
 * Illustrative dataset for Cuauhtémoc. Every record is flagged `is_demo` so the
 * UI can label it; nothing here represents a real government action.
 */
export function buildSeedCases(): SeedCase[] {
  return [
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000001",
      category: "road_damage",
      status: "in_progress",
      title: "Bache profundo en Río Pánuco y Río Tiber",
      description:
        "Hay un bache de aproximadamente un metro de ancho frente al número 42. Los autos tienen que frenar o invadir el carril contrario para evitarlo, sobre todo de noche cuando no se ve bien.",
      latitude: 19.4152,
      longitude: -99.1642,
      colonia: "Roma Norte",
      address_hint: "Río Pánuco 42, entre Río Tiber y Río Nilo",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 42,
      photos: [
        { url: stockPhoto("bache-1"), kind: "report", caption: "Bache frente al 42" },
        { url: stockPhoto("bache-2"), kind: "report", caption: "Vista desde la banqueta" },
      ],
      created_at: daysAgo(24),
      updated_at: daysAgo(2),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000002",
      category: "street_lighting",
      status: "reported",
      title: "Luminaria apagada en Parque México",
      description:
        "Una de las luminarias del andador central lleva más de tres semanas apagada. La zona queda completamente oscura después de las 19:00 y da inseguridad al caminar con niños.",
      latitude: 19.4113,
      longitude: -99.1703,
      colonia: "Condesa",
      address_hint: "Andador central de Parque México, cerca del foro",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 31,
      photos: [{ url: stockPhoto("luminaria-1"), kind: "report", caption: "Poste sin luz" }],
      created_at: daysAgo(18),
      updated_at: daysAgo(18),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000003",
      category: "waste_sanitation",
      status: "under_review",
      title: "Acumulación de basura en Av. Chapultepec",
      description:
        "Los contenedores de la esquina llevan cuatro días desbordados. Hay bolsas en la banqueta y mal olor, además de fauna nociva. Los camiones no han pasado esta semana.",
      latitude: 19.4231,
      longitude: -99.1611,
      colonia: "Juárez",
      address_hint: "Av. Chapultepec 118, esquina con Havre",
      has_safety_concern: false,
      has_accessibility_concern: true,
      support_count: 27,
      photos: [{ url: stockPhoto("basura-1"), kind: "report" }],
      created_at: daysAgo(9),
      updated_at: daysAgo(4),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000004",
      category: "traffic_signals",
      status: "assigned",
      title: "Semáforo peatonal descompuesto en Av. Insurgentes",
      description:
        "El semáforo peatonal del cruce con Roma no funciona desde el lunes. Las personas cruzan con el tráfico en movimiento, incluida gente con carriola y personas mayores.",
      latitude: 19.4171,
      longitude: -99.1628,
      colonia: "Roma Norte",
      address_hint: "Av. Insurgentes Sur esquina con Roma",
      has_safety_concern: true,
      has_accessibility_concern: true,
      support_count: 38,
      photos: [{ url: stockPhoto("semaforo-1"), kind: "report" }],
      created_at: daysAgo(14),
      updated_at: daysAgo(5),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000005",
      category: "sidewalk_accessibility",
      status: "reported",
      title: "Banqueta levantada en Calle Orizaba",
      description:
        "La banqueta está levantada por las raíces de un árbol. Una persona en silla de ruedas no puede pasar y los peatones tienen que bajar a la calle.",
      latitude: 19.4146,
      longitude: -99.1621,
      colonia: "Roma Norte",
      address_hint: "Calle Orizaba 84",
      has_safety_concern: false,
      has_accessibility_concern: true,
      support_count: 19,
      photos: [{ url: stockPhoto("banqueta-1"), kind: "report" }],
      created_at: daysAgo(6),
      updated_at: daysAgo(6),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000006",
      category: "trees_vegetation",
      status: "resolved",
      title: "Poda urgente de árbol en Calle Orizaba",
      description:
        "Una rama grande estaba a punto de caer sobre la banqueta y el cableado. Después de las lluvias quedó muy inclinada y era un riesgo claro.",
      latitude: 19.4149,
      longitude: -99.1633,
      colonia: "Roma Norte",
      address_hint: "Calle Orizaba 61",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 54,
      photos: [
        { url: stockPhoto("arbol-antes"), kind: "before", caption: "Rama inclinada sobre la banqueta" },
        { url: stockPhoto("arbol-despues"), kind: "after", caption: "Poda concluida" },
      ],
      created_at: daysAgo(63),
      updated_at: daysAgo(21),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000007",
      category: "road_damage",
      status: "resolved",
      title: "Bache en el carril derecho de Av. Cuauhtémoc",
      description:
        "El bache estaba en el carril derecho, justo antes del semáforo. Era difícil verlo con lluvia y varios autos se dañaron las llantas.",
      latitude: 19.4192,
      longitude: -99.1564,
      colonia: "Doctores",
      address_hint: "Av. Cuauhtémoc 1050",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 47,
      photos: [
        { url: stockPhoto("bache-antes"), kind: "before", caption: "Antes de la reparación" },
        { url: stockPhoto("bache-despues"), kind: "after", caption: "Después de la reparación" },
      ],
      created_at: daysAgo(78),
      updated_at: daysAgo(30),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000008",
      category: "parks_public_spaces",
      status: "pending_verification",
      title: "Juegos infantiles dañados en Plaza Río de Janeiro",
      description:
        "El columpio y la resbaladilla tienen partes rotas y tornillos expuestos. Los niños siguen usándolos y hay riesgo de corte.",
      latitude: 19.4117,
      longitude: -99.1599,
      colonia: "Roma Sur",
      address_hint: "Plaza Río de Janeiro, lado sur",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 33,
      photos: [{ url: stockPhoto("parque-1"), kind: "report" }],
      created_at: daysAgo(41),
      updated_at: daysAgo(7),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000009",
      category: "waste_sanitation",
      status: "in_progress",
      title: "Escombros abandonados en Callejón Amado Nervo",
      description:
        "Alguien dejó escombros y muebles viejos en el callejón. Bloquean la mitad del paso y llevan ahí más de dos semanas.",
      latitude: 19.4371,
      longitude: -99.1425,
      colonia: "Centro Histórico",
      address_hint: "Callejón Amado Nervo 12",
      has_safety_concern: false,
      has_accessibility_concern: true,
      support_count: 12,
      photos: [{ url: stockPhoto("basura-2"), kind: "report" }],
      created_at: daysAgo(11),
      updated_at: daysAgo(3),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000010",
      category: "street_lighting",
      status: "under_review",
      title: "Alumbrado intermitente en Calle Colima",
      description:
        "Tres luminarias de la cuadra prenden y apagan toda la noche. El parpadeo es molesto y la calle queda a oscuras por ratos.",
      latitude: 19.4129,
      longitude: -99.1618,
      colonia: "Roma Norte",
      address_hint: "Calle Colima 210",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 14,
      photos: [{ url: stockPhoto("luminaria-2"), kind: "report" }],
      created_at: daysAgo(5),
      updated_at: daysAgo(2),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000011",
      category: "sidewalk_accessibility",
      status: "reported",
      title: "Rampa obstruida por puesto en Calle López",
      description:
        "Un puesto ambulante se instala justo sobre la rampa de acceso. Las personas en silla de ruedas y carriolas no pueden subir a la banqueta.",
      latitude: 19.4305,
      longitude: -99.1477,
      colonia: "Centro Histórico",
      address_hint: "Calle López 25",
      has_safety_concern: false,
      has_accessibility_concern: true,
      support_count: 8,
      photos: [{ url: stockPhoto("banqueta-2"), kind: "report" }],
      created_at: daysAgo(2),
      updated_at: daysAgo(2),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000012",
      category: "traffic_signals",
      status: "resolved",
      title: "Señal de alto derribada en Calle Sabino",
      description:
        "La señal de alto estaba tirada sobre la banqueta desde un choque. En el cruce no había ninguna indicación para los autos.",
      latitude: 19.4439,
      longitude: -99.1466,
      colonia: "Guerrero",
      address_hint: "Calle Sabino esquina con Lerdo",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 23,
      photos: [
        { url: stockPhoto("semaforo-antes"), kind: "before" },
        { url: stockPhoto("semaforo-despues"), kind: "after" },
      ],
      created_at: daysAgo(52),
      updated_at: daysAgo(33),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000013",
      category: "road_damage",
      status: "reported",
      title: "Hundimiento en Calle Guanajuato",
      description:
        "El pavimento se está hundiendo junto a la alcantarilla. Ya se formó un hoyo de unos 40 centímetros y sigue creciendo con la lluvia.",
      latitude: 19.4176,
      longitude: -99.1567,
      colonia: "Roma Sur",
      address_hint: "Calle Guanajuato 168",
      has_safety_concern: true,
      has_accessibility_concern: false,
      support_count: 6,
      photos: [{ url: stockPhoto("bache-2"), kind: "report" }],
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    },
    {
      id: "0b7f1f3e-6f2a-4a1c-9a58-1c1e8d000014",
      category: "parks_public_spaces",
      status: "assigned",
      title: "Bancas rotas en Alameda Central",
      description:
        "Cuatro bancas del lado oriente tienen la madera rota y tornillos salidos. Son las únicas con sombra en esa zona.",
      latitude: 19.4356,
      longitude: -99.1437,
      colonia: "Centro Histórico",
      address_hint: "Alameda Central, lado oriente",
      has_safety_concern: false,
      has_accessibility_concern: true,
      support_count: 17,
      photos: [{ url: stockPhoto("parque-2"), kind: "report" }],
      created_at: daysAgo(20),
      updated_at: daysAgo(6),
    },
  ];
}

export function buildSeedEvents(seed: SeedCase): SeedEvent[] {
  const events: SeedEvent[] = [
    {
      type: "reported",
      actor_type: "community",
      title: "Reporte recibido",
      description: "Vecinas y vecinos registraron este problema en VotaVía.",
      created_at: seed.created_at,
    },
  ];

  const order: CaseStatus[] = ["under_review", "assigned", "in_progress", "pending_verification", "resolved"];
  const current = seed.status === "closed" ? "resolved" : seed.status;
  const targetIndex = order.indexOf(current);

  if (targetIndex >= 0 && current !== "reported") {
    const span = new Date(seed.updated_at).getTime() - new Date(seed.created_at).getTime();
    const steps = targetIndex + 1;
    for (let i = 0; i <= targetIndex; i += 1) {
      const status = order[i];
      const at = new Date(new Date(seed.created_at).getTime() + (span * (i + 1)) / (steps + 0.4));
      events.push({
        type: status,
        actor_type: "government",
        title:
          status === "under_review"
            ? "En revisión por el equipo de la alcaldía"
            : status === "assigned"
              ? "Asignado a una cuadrilla"
              : status === "in_progress"
                ? "Trabajo en proceso"
                : status === "pending_verification"
                  ? "Trabajo terminado, en verificación"
                  : "Caso resuelto",
        description:
          status === "resolved"
            ? "Se publicó evidencia fotográfica del resultado."
            : undefined,
        created_at: at.toISOString(),
      });
    }
  }

  if (seed.support_count > 0) {
    events.push({
      type: "community_support",
      actor_type: "community",
      title: `${seed.support_count} vecinas y vecinos apoyan este reporte`,
      created_at: new Date(new Date(seed.created_at).getTime() + 3600000 * 6).toISOString(),
    });
  }

  return events.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
