import type {
  ActivityItem,
  CaseAnalysis,
  CommunityPriorityBreakdown,
  DemoUser,
  DispatchOrder,
  GovernmentCase,
  ImportedGovernmentRecord,
  RiskSignal,
  Specialist,
} from "./types";

const photo = (name: string, alt: string, caption: string, tone: GovernmentCase["photos"][number]["tone"]) => ({
  id: name,
  url: `/report-photos/${name}.svg`,
  alt,
  caption,
  tone,
});

export const mockCases: GovernmentCase[] = [
  {
    id: "case-0847",
    folio: "VV-2026-0847",
    title: "Fuga de agua frente a la estación Insurgentes",
    description:
      "Desde el martes por la noche sale agua de la banqueta frente a la salida sur de la estación. El chorro ya levantó una loseta y forma un charco que obliga a los peatones a bajar a la avenida. Ayer un vecino resbaló y una persona en silla de ruedas tuvo que rodear por la calle.",
    category: "agua",
    colonia: "Roma Norte",
    address: "Av. Insurgentes Sur 300, junto a la salida sur del Metro Insurgentes",
    coordinates: { x: 47, y: 52 },
    status: "under_review",
    priority: "high",
    citizen: {
      name: "Mariana López",
      phoneMasked: "55 •••• 2841",
      emailMasked: "m•••••@correo.mx",
      reportsCount: 4,
      supportCount: 37,
      safetyConcern: true,
      safetyNote: "El agua corre hacia una rampa de acceso y ya provocó una caída.",
    },
    photos: [
      photo("agua-1", "Chorro de agua en una banqueta urbana", "Banqueta anegada frente al acceso del Metro", "blue"),
      photo("agua-2", "Charco extendido sobre la vialidad", "El escurrimiento llega al carril de bicicletas", "slate"),
    ],
    observations: [
      {
        id: "obs-1",
        author: "Diego R.",
        initials: "DR",
        createdAt: "2026-10-30T08:40:00-06:00",
        text: "El agua sigue saliendo. Ya se ve más arena bajo la loseta levantada.",
        verifiedNeighbor: true,
      },
      {
        id: "obs-2",
        author: "Ana Clemente",
        initials: "AC",
        createdAt: "2026-10-30T09:12:00-06:00",
        text: "La rampa para silla de ruedas está bloqueada por el charco.",
        verifiedNeighbor: true,
      },
      {
        id: "obs-3",
        author: "Luis Ortega",
        initials: "LO",
        createdAt: "2026-10-30T10:05:00-06:00",
        text: "Pasa el camión y salpica toda la banqueta. Los comerciantes pusieron una llanta.",
        verifiedNeighbor: false,
      },
    ],
    reportedAt: "2026-10-29T21:18:00-06:00",
    updatedAt: "2026-10-30T10:21:00-06:00",
    relatedCaseIds: ["case-0838", "case-0841"],
    progress: 18,
    events: [
      {
        id: "evt-0847-1",
        at: "2026-10-29T21:18:00-06:00",
        label: "Reporte recibido",
        detail: "Ciudadanía envió 2 fotos y ubicación verificada por GPS.",
        actor: "Citizen",
      },
      {
        id: "evt-0847-2",
        at: "2026-10-30T07:42:00-06:00",
        label: "Revisión inicial",
        detail: "La mesa de gobierno confirmó que requiere inspección de Aguas.",
        actor: "Government",
      },
      {
        id: "evt-0847-3",
        at: "2026-10-30T10:21:00-06:00",
        label: "3 observaciones nuevas",
        detail: "Vecinos verificados actualizaron el estado del escurrimiento.",
        actor: "Citizen",
      },
    ],
  },
  {
    id: "case-0832",
    folio: "VV-2026-0832",
    title: "Hundimiento frente al Mercado Narvarte",
    description:
      "Un hundimiento de aproximadamente un metro de diámetro apareció junto al acceso de carga del mercado. El área está delimitada con conos por los locatarios, pero no hay señalización oficial. Por las mañanas pasan diablitos y camiones de carga muy cerca del borde.",
    category: "baches",
    colonia: "Narvarte",
    address: "Calle Doctor José María Vértiz 411, acceso de carga del Mercado Narvarte",
    coordinates: { x: 58, y: 63 },
    status: "pending_verification",
    priority: "critical",
    citizen: {
      name: "Rogelio Núñez",
      phoneMasked: "55 •••• 6912",
      emailMasked: "r•••••@correo.mx",
      reportsCount: 2,
      supportCount: 86,
      safetyConcern: true,
      safetyNote: "El borde está bajo y el paso de camiones puede ampliar el hundimiento.",
    },
    photos: [
      photo("bache-1", "Hundimiento delimitado con conos en una calle", "Hundimiento delimitado por locatarios el día del reporte", "amber"),
      photo("bache-2", "Pavimento agrietado junto a una banqueta", "Grietas radiales de más de dos metros", "slate"),
      photo("bache-3", "Maquinaria y trabajadores en la calle", "Retiro de escombro durante la intervención", "blue"),
    ],
    observations: [
      {
        id: "obs-4",
        author: "Sofía M.",
        initials: "SM",
        createdAt: "2026-10-28T17:30:00-06:00",
        text: "Los locatarios cerraron media calle. Ayer llegó una cuadrilla a medir.",
        verifiedNeighbor: true,
      },
      {
        id: "obs-5",
        author: "Jorge Bañuelos",
        initials: "JB",
        createdAt: "2026-10-29T12:15:00-06:00",
        text: "Ya rellenaron, pero el asfalto nuevo está más alto y tiene una fisura en el centro.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-25T09:05:00-06:00",
    updatedAt: "2026-10-30T09:45:00-06:00",
    departmentId: "obras",
    assignedSpecialistId: "sp-2",
    relatedCaseIds: ["case-0839", "case-0812"],
    progress: 82,
    events: [
      {
        id: "evt-0832-1",
        at: "2026-10-25T09:05:00-06:00",
        label: "Reporte recibido",
        detail: "Reporte ciudadano con tres imágenes y 84 apoyos iniciales.",
        actor: "Citizen",
      },
      {
        id: "evt-0832-2",
        at: "2026-10-25T11:40:00-06:00",
        label: "Caso revisado",
        detail: "Clasificado como riesgo crítico para movilidad peatonal.",
        actor: "Government",
      },
      {
        id: "evt-0832-3",
        at: "2026-10-26T09:30:00-06:00",
        label: "Despacho autorizado",
        detail: "Obras asignó a Brigadas Delta para contención y bacheo profundo.",
        actor: "Government",
      },
      {
        id: "evt-0832-4",
        at: "2026-10-29T18:10:00-06:00",
        label: "Trabajo terminado",
        detail: "El especialista cargó 3 evidencias y solicitó verificación.",
        actor: "Specialist",
      },
      {
        id: "evt-0832-5",
        at: "2026-10-30T09:45:00-06:00",
        label: "Incidencia en evidencia",
        detail: "Vecinos reportan fisura superficial sobre el área reparada.",
        actor: "Citizen",
      },
    ],
  },
  {
    id: "case-0843",
    folio: "VV-2026-0843",
    title: "Cuatro luminarias apagadas en Av. Tamaulipas",
    description:
      "Las luminarias del tramo entre Nuevo León y Sonora llevan cinco noches apagadas. La banqueta queda completamente oscura y hay dos pasos peatonales sin iluminación. Comerciantes cierran antes para no caminar por el tramo.",
    category: "alumbrado",
    colonia: "Condesa",
    address: "Av. Tamaulipas entre Nuevo León y Sonora",
    coordinates: { x: 39, y: 60 },
    status: "in_progress",
    priority: "high",
    citizen: {
      name: "Paola Ruiz",
      phoneMasked: "55 •••• 1038",
      emailMasked: "p•••••@correo.mx",
      reportsCount: 3,
      supportCount: 52,
      safetyConcern: true,
      safetyNote: "El tramo oscuro se percibe inseguro para mujeres que regresan del Metro.",
    },
    photos: [
      photo("luz-1", "Calle urbana de noche con luminarias apagadas", "Tramo sin alumbrado a las 20:40", "slate"),
      photo("luz-2", "Poste de alumbrado público junto a un paso peatonal", "Dos de las cuatro luminarias no encienden", "amber"),
    ],
    observations: [
      {
        id: "obs-6",
        author: "Renata C.",
        initials: "RC",
        createdAt: "2026-10-29T21:42:00-06:00",
        text: "Anoche había una cuadrilla revisando el poste de la esquina.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-27T20:10:00-06:00",
    updatedAt: "2026-10-30T08:05:00-06:00",
    departmentId: "alumbrado",
    assignedSpecialistId: "sp-1",
    relatedCaseIds: ["case-0849"],
    progress: 44,
    events: [
      {
        id: "evt-0843-1",
        at: "2026-10-27T20:10:00-06:00",
        label: "Reporte recibido",
        detail: "Se adjuntaron fotos nocturnas y una ubicación aproximada.",
        actor: "Citizen",
      },
      {
        id: "evt-0843-2",
        at: "2026-10-28T08:22:00-06:00",
        label: "Caso asignado",
        detail: "Dirección de Alumbrado Público recibió el caso.",
        actor: "Government",
      },
      {
        id: "evt-0843-3",
        at: "2026-10-30T08:05:00-06:00",
        label: "Trabajo en curso",
        detail: "Lux Urbano reportó revisión de circuito y reemplazo de dos balastros.",
        actor: "Specialist",
      },
    ],
  },
  {
    id: "case-0839",
    folio: "VV-2026-0839",
    title: "Bache profundo en Eje 1 Norte",
    description:
      "Hay un bache de casi dos metros en el carril derecho antes de llegar a Paseo de la Reforma. Los automóviles frenan de golpe al verlo y ya provocó daños a un taxi. Por la noche no se alcanza a ver.",
    category: "baches",
    colonia: "Centro",
    address: "Eje 1 Norte, carril derecho antes de Reforma",
    coordinates: { x: 49, y: 43 },
    status: "assigned",
    priority: "critical",
    citizen: {
      name: "Rubén Salas",
      phoneMasked: "55 •••• 7714",
      emailMasked: "r•••••@correo.mx",
      reportsCount: 6,
      supportCount: 103,
      safetyConcern: true,
      safetyNote: "Riesgo alto para motocicletas y vehículos que cambian de carril.",
    },
    photos: [
      photo("bache-2", "Pavimento agrietado junto a una banqueta", "Bache en el carril derecho", "amber"),
      photo("bache-1", "Hundimiento delimitado con conos en una calle", "Delimitación provisional con conos", "slate"),
    ],
    observations: [
      {
        id: "obs-7",
        author: "Fernanda T.",
        initials: "FT",
        createdAt: "2026-10-29T18:12:00-06:00",
        text: "Un taxi se ponchó aquí anoche. Ya hay un cono, pero está tirado.",
        verifiedNeighbor: true,
      },
      {
        id: "obs-8",
        author: "Iván L.",
        initials: "IL",
        createdAt: "2026-10-30T07:20:00-06:00",
        text: "Sigue igual en hora pico. El tráfico se hace en el carril de la izquierda.",
        verifiedNeighbor: false,
      },
    ],
    reportedAt: "2026-10-28T19:40:00-06:00",
    updatedAt: "2026-10-30T07:55:00-06:00",
    departmentId: "obras",
    assignedSpecialistId: "sp-2",
    relatedCaseIds: ["case-0832"],
    progress: 31,
    events: [
      {
        id: "evt-0839-1",
        at: "2026-10-28T19:40:00-06:00",
        label: "Reporte recibido",
        detail: "Reporte con descripción de daño a vehículo particular.",
        actor: "Citizen",
      },
      {
        id: "evt-0839-2",
        at: "2026-10-29T09:15:00-06:00",
        label: "Prioridad elevada",
        detail: "Clasificado como riesgo para motociclistas.",
        actor: "Government",
      },
      {
        id: "evt-0839-3",
        at: "2026-10-30T07:55:00-06:00",
        label: "Asignación autorizada",
        detail: "Brigadas Delta fue autorizada; visita programada para hoy.",
        actor: "Government",
      },
    ],
  },
  {
    id: "case-0850",
    folio: "VV-2026-0850",
    title: "Acumulación de basura junto a primaria",
    description:
      "Se acumulan bolsas y muebles viejos en la esquina desde el fin de semana. El olor llega al salón de primero y hay fauna nociva. La ruta de recolección pasó el lunes, pero no recogió los objetos voluminosos.",
    category: "residuos",
    colonia: "Narvarte",
    address: "Calle María Enriqueta 142, esquina con Josefa Ortiz de Domínguez",
    coordinates: { x: 61, y: 57 },
    status: "reported",
    priority: "high",
    citizen: {
      name: "Adriana Vázquez",
      phoneMasked: "55 •••• 4480",
      emailMasked: "a•••••@correo.mx",
      reportsCount: 1,
      supportCount: 24,
      safetyConcern: false,
    },
    photos: [
      photo("residuos-1", "Acumulación de bolsas de basura en una banqueta", "Residuos acumulados frente a la escuela", "green"),
    ],
    observations: [],
    reportedAt: "2026-10-30T06:50:00-06:00",
    updatedAt: "2026-10-30T06:50:00-06:00",
    relatedCaseIds: ["case-0828"],
    progress: 5,
    events: [
      {
        id: "evt-0850-1",
        at: "2026-10-30T06:50:00-06:00",
        label: "Reporte recibido",
        detail: "Reporte nuevo con ubicación y una fotografía.",
        actor: "Citizen",
      },
    ],
  },
  {
    id: "case-0828",
    folio: "VV-2026-0828",
    title: "Tiradero recurrente bajo el puente",
    description:
      "Cada semana se vuelve a formar un tiradero bajo el puente. Vecinos han limpiado dos veces, pero personas de fuera llegan en camionetas a dejar escombro y muebles por la noche.",
    category: "residuos",
    colonia: "Iztapalapa",
    address: "Calzada Ermita Iztapalapa, bajo el puente de la Concordia",
    coordinates: { x: 79, y: 69 },
    status: "under_review",
    priority: "medium",
    citizen: {
      name: "Édgar Martínez",
      phoneMasked: "55 •••• 8820",
      emailMasked: "e•••••@correo.mx",
      reportsCount: 9,
      supportCount: 41,
      safetyConcern: false,
    },
    photos: [
      photo("residuos-1", "Acumulación de bolsas de basura en una banqueta", "Tiradero acumulado bajo el puente", "green"),
      photo("residuos-2", "Muebles y escombro en la vía pública", "Escombro y muebles abandonados", "slate"),
    ],
    observations: [
      {
        id: "obs-9",
        author: "Mónica H.",
        initials: "MH",
        createdAt: "2026-10-29T08:35:00-06:00",
        text: "El lunes limpiaron, pero el miércoles ya había otra vez colchones.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-26T14:20:00-06:00",
    updatedAt: "2026-10-30T07:10:00-06:00",
    relatedCaseIds: ["case-0850"],
    progress: 14,
    events: [
      {
        id: "evt-0828-1",
        at: "2026-10-26T14:20:00-06:00",
        label: "Reporte recibido",
        detail: "El ciudadano indica que es un problema recurrente.",
        actor: "Citizen",
      },
      {
        id: "evt-0828-2",
        at: "2026-10-30T07:10:00-06:00",
        label: "Caso en revisión",
        detail: "Se busca vincular con reportes previos de la misma esquina.",
        actor: "Government",
      },
    ],
  },
  {
    id: "case-0835",
    folio: "VV-2026-0835",
    title: "Juegos infantiles rotos en parque de colonia",
    description:
      "Dos columpios están desprendidos y la resbaladilla tiene un borde metálico expuesto. Hay cinta de precaución desde hace tres semanas, pero los niños siguen entrando al área.",
    category: "parques",
    colonia: "Coyoacán",
    address: "Parque Xicoténcatl, acceso por Av. Miguel Ángel de Quevedo",
    coordinates: { x: 49, y: 77 },
    status: "under_review",
    priority: "medium",
    citizen: {
      name: "Claudia Reyes",
      phoneMasked: "55 •••• 5532",
      emailMasked: "c•••••@correo.mx",
      reportsCount: 2,
      supportCount: 29,
      safetyConcern: true,
      safetyNote: "Menores juegan alrededor de estructura desprendida.",
    },
    photos: [
      photo("parque-1", "Juegos infantiles con cinta de precaución", "Columpios asegurados con cinta", "green"),
      photo("parque-2", "Resbaladilla metálica oxidada", "Borde expuesto en la resbaladilla", "amber"),
    ],
    observations: [
      {
        id: "obs-10",
        author: "Gabriel S.",
        initials: "GS",
        createdAt: "2026-10-29T16:20:00-06:00",
        text: "La cinta ya se rompió en un extremo. Los niños vuelven a subir.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-24T10:15:00-06:00",
    updatedAt: "2026-10-30T07:40:00-06:00",
    relatedCaseIds: ["case-0848"],
    progress: 12,
    events: [
      {
        id: "evt-0835-1",
        at: "2026-10-24T10:15:00-06:00",
        label: "Reporte recibido",
        detail: "La ciudadana adjuntó imágenes de dos estructuras dañadas.",
        actor: "Citizen",
      },
      {
        id: "evt-0835-2",
        at: "2026-10-30T07:40:00-06:00",
        label: "Revisión en curso",
        detail: "Parques y Jardines solicita inspección estructural.",
        actor: "Government",
      },
    ],
  },
  {
    id: "case-0821",
    folio: "VV-2026-0821",
    title: "Paso peatonal sin señalización tras obra",
    description:
      "Retiraron el semáforo peatonal por una obra y no colocaron señalización temporal. En hora pico cruzan decenas de personas entre camiones. Ya hubo dos conatos de accidente esta semana.",
    category: "movilidad",
    colonia: "Centro",
    address: "Calle 20 de Noviembre y Venustiano Carranza",
    coordinates: { x: 44, y: 47 },
    status: "under_review",
    priority: "critical",
    citizen: {
      name: "Héctor Pineda",
      phoneMasked: "55 •••• 2284",
      emailMasked: "h•••••@correo.mx",
      reportsCount: 5,
      supportCount: 71,
      safetyConcern: true,
      safetyNote: "Crucero con alto flujo peatonal y visibilidad reducida.",
    },
    photos: [
      photo("movilidad-1", "Cruce peatonal sin semáforo en una avenida", "Personas cruzan sin señalización", "amber"),
      photo("movilidad-2", "Vialidad con obra y peatones", "Obra sin paso peatonal señalizado", "slate"),
    ],
    observations: [
      {
        id: "obs-11",
        author: "Tania M.",
        initials: "TM",
        createdAt: "2026-10-29T19:45:00-06:00",
        text: "Hay policía de tránsito solo de 7 a 9. Después nadie regula el cruce.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-27T08:30:00-06:00",
    updatedAt: "2026-10-30T06:32:00-06:00",
    relatedCaseIds: [],
    progress: 16,
    events: [
      {
        id: "evt-0821-1",
        at: "2026-10-27T08:30:00-06:00",
        label: "Reporte recibido",
        detail: "Se recibieron dos imágenes del cruce en hora pico.",
        actor: "Citizen",
      },
      {
        id: "evt-0821-2",
        at: "2026-10-30T06:32:00-06:00",
        label: "Riesgo marcado",
        detail: "Protección Civil y Movilidad deben coordinar una revisión.",
        actor: "Government",
      },
    ],
  },
  {
    id: "case-0844",
    folio: "VV-2026-0844",
    title: "Drenaje tapado tras lluvia en Tlalpan",
    description:
      "El drenaje de la esquina se tapó y el agua subió hasta la puerta de dos casas durante la lluvia del martes. Los vecinos retiraron hojas, pero el nivel vuelve a subir con cada lluvia.",
    category: "drenaje",
    colonia: "Tlalpan",
    address: "Calle Sauces 28, esquina con Cerrada de las Flores",
    coordinates: { x: 34, y: 82 },
    status: "pending_verification",
    priority: "high",
    citizen: {
      name: "Graciela Nava",
      phoneMasked: "55 •••• 9071",
      emailMasked: "g•••••@correo.mx",
      reportsCount: 3,
      supportCount: 44,
      safetyConcern: true,
      safetyNote: "El agua podría entrar a viviendas de adultos mayores.",
    },
    photos: [
      photo("drenaje-1", "Agua estancada en una calle residencial", "Agua acumulada durante la lluvia", "blue"),
      photo("drenaje-2", "Coladera abierta con residuos", "Coladera con residuos y sedimento", "slate"),
    ],
    observations: [
      {
        id: "obs-12",
        author: "Rocío P.",
        initials: "RP",
        createdAt: "2026-10-29T20:10:00-06:00",
        text: "Ya limpiaron la coladera y destaparon el tubo. Falta ver si aguanta la próxima lluvia.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-26T19:05:00-06:00",
    updatedAt: "2026-10-30T09:10:00-06:00",
    departmentId: "agua",
    assignedSpecialistId: "sp-4",
    relatedCaseIds: ["case-0847"],
    progress: 76,
    events: [
      {
        id: "evt-0844-1",
        at: "2026-10-26T19:05:00-06:00",
        label: "Reporte recibido",
        detail: "Vecina reportó ingreso de agua a dos viviendas.",
        actor: "Citizen",
      },
      {
        id: "evt-0844-2",
        at: "2026-10-27T10:40:00-06:00",
        label: "Despacho autorizado",
        detail: "HidroServicios MX recibió orden de limpieza profunda.",
        actor: "Government",
      },
      {
        id: "evt-0844-3",
        at: "2026-10-30T09:10:00-06:00",
        label: "Trabajo terminado",
        detail: "Se cargaron evidencias y se solicita verificación técnica.",
        actor: "Specialist",
      },
    ],
  },
  {
    id: "case-0849",
    folio: "VV-2026-0849",
    title: "Luminaria intermitente en parque",
    description:
      "La luminaria del acceso principal prende y apaga toda la noche. Vecinos que salen a correr temprano reportan que el área queda a oscuras por intervalos.",
    category: "alumbrado",
    colonia: "Benito Juárez",
    address: "Parque Arboledas, acceso por Av. División del Norte",
    coordinates: { x: 59, y: 69 },
    status: "reported",
    priority: "low",
    citizen: {
      name: "Tomás Iriarte",
      phoneMasked: "55 •••• 3376",
      emailMasked: "t•••••@correo.mx",
      reportsCount: 1,
      supportCount: 8,
      safetyConcern: false,
    },
    photos: [
      photo("luz-2", "Poste de alumbrado público junto a un paso peatonal", "Luminaria del acceso principal", "amber"),
    ],
    observations: [],
    reportedAt: "2026-10-30T05:55:00-06:00",
    updatedAt: "2026-10-30T05:55:00-06:00",
    relatedCaseIds: ["case-0843"],
    progress: 5,
    events: [
      {
        id: "evt-0849-1",
        at: "2026-10-30T05:55:00-06:00",
        label: "Reporte recibido",
        detail: "Reporte nuevo con ubicación del acceso principal.",
        actor: "Citizen",
      },
    ],
  },
  {
    id: "case-0818",
    folio: "VV-2026-0818",
    title: "Señal de alto derribada en cruce escolar",
    description:
      "Un vehículo tiró la señal de alto frente a la primaria. No hay señal temporal y los autos cruzan sin detenerse a la hora de salida.",
    category: "movilidad",
    colonia: "Del Valle",
    address: "Calle Concepción Béistegui 1800, cruce con Adolfo Prieto",
    coordinates: { x: 66, y: 73 },
    status: "assigned",
    priority: "high",
    citizen: {
      name: "Leticia Rangel",
      phoneMasked: "55 •••• 6651",
      emailMasked: "l•••••@correo.mx",
      reportsCount: 2,
      supportCount: 46,
      safetyConcern: true,
      safetyNote: "Cruce escolar sin control vehicular en hora de salida.",
    },
    photos: [
      photo("movilidad-1", "Cruce peatonal sin semáforo en una avenida", "Señal derribada junto al cruce escolar", "amber"),
    ],
    observations: [
      {
        id: "obs-13",
        author: "Pablo C.",
        initials: "PC",
        createdAt: "2026-10-29T15:20:00-06:00",
        text: "Una patrulla se quedó un rato en la salida, pero ya no está.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-23T16:40:00-06:00",
    updatedAt: "2026-10-30T08:15:00-06:00",
    departmentId: "movilidad",
    assignedSpecialistId: "sp-3",
    relatedCaseIds: [],
    progress: 38,
    events: [
      {
        id: "evt-0818-1",
        at: "2026-10-23T16:40:00-06:00",
        label: "Reporte recibido",
        detail: "Caso vinculado a una escuela primaria.",
        actor: "Citizen",
      },
      {
        id: "evt-0818-2",
        at: "2026-10-30T08:15:00-06:00",
        label: "Visita programada",
        detail: "Señalización Vial MX acudirá mañana a las 07:00.",
        actor: "Specialist",
      },
    ],
  },
  {
    id: "case-0825",
    folio: "VV-2026-0825",
    title: "Fuga reparada en red secundaria",
    description:
      "La fuga en la banqueta mantenía húmeda la entrada de tres viviendas. El reporte se cerró después de una reparación y dos semanas de seguimiento.",
    category: "agua",
    colonia: "Azcapotzalco",
    address: "Calle Hidalgo 55, colonia San Andrés",
    coordinates: { x: 22, y: 36 },
    status: "resolved",
    priority: "medium",
    citizen: {
      name: "Norma Solís",
      phoneMasked: "55 •••• 2041",
      emailMasked: "n•••••@correo.mx",
      reportsCount: 1,
      supportCount: 19,
      safetyConcern: false,
    },
    photos: [
      photo("agua-1", "Chorro de agua en una banqueta urbana", "Fuga antes de la reparación", "blue"),
      photo("agua-2", "Charco extendido sobre la vialidad", "Después de la reparación", "green"),
    ],
    observations: [
      {
        id: "obs-14",
        author: "Mauricio G.",
        initials: "MG",
        createdAt: "2026-10-27T18:30:00-06:00",
        text: "Ya no sale agua y volvieron a poner concreto. Todo bien.",
        verifiedNeighbor: true,
      },
    ],
    reportedAt: "2026-10-13T11:10:00-06:00",
    updatedAt: "2026-10-28T13:30:00-06:00",
    departmentId: "agua",
    assignedSpecialistId: "sp-4",
    relatedCaseIds: [],
    publicOutcome:
      "Se sustituyó un tramo de 4 metros de tubería y se restituyó la banqueta. Vecinos confirmaron el cierre del escurrimiento.",
    publishedAt: "2026-10-28T13:30:00-06:00",
    progress: 100,
    events: [
      {
        id: "evt-0825-1",
        at: "2026-10-13T11:10:00-06:00",
        label: "Reporte recibido",
        detail: "Se reportó fuga en la red secundaria.",
        actor: "Citizen",
      },
      {
        id: "evt-0825-2",
        at: "2026-10-28T13:30:00-06:00",
        label: "Resultado publicado",
        detail: "Se compartió el dictamen y la evidencia final.",
        actor: "Government",
      },
    ],
  },
  {
    id: "case-0812",
    folio: "VV-2026-0812",
    title: "Bache menor en calle secundaria",
    description:
      "Bache de aproximadamente 40 centímetros en el carril de estacionamiento. No hay daños reportados a vehículos.",
    category: "baches",
    colonia: "Gustavo A. Madero",
    address: "Calle Norte 82, entre Sur 101 y Sur 103",
    coordinates: { x: 56, y: 25 },
    status: "closed",
    priority: "low",
    citizen: {
      name: "Bruno Cárdenas",
      phoneMasked: "55 •••• 1189",
      emailMasked: "b•••••@correo.mx",
      reportsCount: 1,
      supportCount: 4,
      safetyConcern: false,
    },
    photos: [
      photo("bache-3", "Maquinaria y trabajadores en la calle", "Relleno y compactación del bache", "blue"),
    ],
    observations: [],
    reportedAt: "2026-10-08T08:20:00-06:00",
    updatedAt: "2026-10-18T12:00:00-06:00",
    departmentId: "obras",
    assignedSpecialistId: "sp-2",
    relatedCaseIds: ["case-0839"],
    publicOutcome:
      "Se realizó bacheo superficial y se verificó el nivel del pavimento. Sin incidentes posteriores.",
    publishedAt: "2026-10-18T12:00:00-06:00",
    progress: 100,
    events: [
      {
        id: "evt-0812-1",
        at: "2026-10-08T08:20:00-06:00",
        label: "Reporte recibido",
        detail: "Se recibió una fotografía del bache.",
        actor: "Citizen",
      },
      {
        id: "evt-0812-2",
        at: "2026-10-18T12:00:00-06:00",
        label: "Caso cerrado",
        detail: "Resultado publicado y verificación archivada.",
        actor: "Government",
      },
    ],
  },
];

export const mockSpecialists: Specialist[] = [
  {
    id: "sp-2",
    name: "Brigadas Delta",
    initials: "BD",
    specialty: "Bacheo profundo y estabilización de pavimento",
    organization: "Brigadas Delta · Contratista aprobada",
    qualification: "Alta especialidad en pavimento urbano",
    coverage: ["Narvarte", "Doctores", "Del Valle", "Centro", "Benito Juárez"],
    availability: "Disponible hoy, 12:00–18:00",
    availabilityTone: "available",
    approved: true,
    dispatchCount: 34,
    responseTime: "2.4 h",
    yearsExperience: 11,
  },
  {
    id: "sp-1",
    name: "Lux Urbano",
    initials: "LU",
    specialty: "Redes de alumbrado y diagnóstico eléctrico",
    organization: "Lux Urbano · Proveedor registrado",
    qualification: "Instalación y mantenimiento de alumbrado público",
    coverage: ["Condesa", "Roma Norte", "Benito Juárez", "Centro"],
    availability: "Disponible hoy, turno vespertino",
    availabilityTone: "available",
    approved: true,
    dispatchCount: 41,
    responseTime: "1.8 h",
    yearsExperience: 8,
  },
  {
    id: "sp-4",
    name: "HidroServicios MX",
    initials: "HM",
    specialty: "Detección de fugas y mantenimiento de drenaje",
    organization: "HidroServicios MX · Proveedor registrado",
    qualification: "Operación de red secundaria y saneamiento",
    coverage: ["Tlalpan", "Coyoacán", "Narvarte", "Del Valle"],
    availability: "Cupo limitado mañana, 08:00–11:00",
    availabilityTone: "limited",
    approved: true,
    dispatchCount: 27,
    responseTime: "3.1 h",
    yearsExperience: 13,
  },
  {
    id: "sp-3",
    name: "Señalización Vial MX",
    initials: "SV",
    specialty: "Señalización temporal y dispositivos de tránsito",
    organization: "Señalización Vial MX · Proveedor registrado",
    qualification: "Instalación de señalética y cruces seguros",
    coverage: ["Del Valle", "Benito Juárez", "Narvarte", "Centro"],
    availability: "Disponible mañana, 07:00–10:00",
    availabilityTone: "scheduled",
    approved: true,
    dispatchCount: 52,
    responseTime: "4.0 h",
    yearsExperience: 16,
  },
  {
    id: "sp-5",
    name: "Verde Urbano",
    initials: "VU",
    specialty: "Mantenimiento de parques y mobiliario infantil",
    organization: "Verde Urbano · Proveedor registrado",
    qualification: "Inspección y reparación de juegos infantiles",
    coverage: ["Coyoacán", "Tlalpan", "Benito Juárez"],
    availability: "Disponible lunes, 09:00–14:00",
    availabilityTone: "scheduled",
    approved: true,
    dispatchCount: 19,
    responseTime: "6.2 h",
    yearsExperience: 7,
  },
  {
    id: "sp-6",
    name: "Ruta Limpia CDMX",
    initials: "RL",
    specialty: "Recolección de voluminosos y limpieza de espacio público",
    organization: "Ruta Limpia CDMX · Contratista aprobada",
    qualification: "Manejo de residuos voluminosos y escombro",
    coverage: ["Iztapalapa", "Narvarte", "Gustavo A. Madero"],
    availability: "Disponible hoy, 14:00–20:00",
    availabilityTone: "available",
    approved: true,
    dispatchCount: 22,
    responseTime: "2.9 h",
    yearsExperience: 6,
  },
];

const baseLimitations = [
  "El análisis se generó con reportes, fotografías y datos públicos disponibles en la fecha indicada.",
  "No sustituye una inspección técnica ni la validación de una persona servidora pública.",
  "Las coincidencias se muestran como apoyo a la revisión y deben confirmarse antes de fusionar casos.",
];

export const mockAnalyses: Record<string, CaseAnalysis> = {
  "case-0847": {
    caseId: "case-0847",
    state: "ready",
    generatedAt: "2026-10-30T09:18:00-06:00",
    modelLabel: "Análisis simulado de VotaVía",
    summary:
      "Fuga activa en la banqueta con afectación peatonal y posible deterioro del pavimento. La ubicación coincide con dos reportes de escurrimientos en el mismo tramo durante los últimos 45 días. Por el flujo peatonal y la rampa de accesibilidad, se recomienda contención y revisión de la red antes del fin de semana.",
    keyFindings: [
      "El escurrimiento cruza una rampa de accesibilidad y alcanza el carril de bicicletas.",
      "Tres observaciones vecinales reportan caída de loseta y acumulación de arena.",
      "Dos reportes cercanos describen fugas intermitentes en la misma cuadra.",
    ],
    duplicates: [
      {
        id: "case-0838",
        folio: "VV-2026-0838",
        colonia: "Roma Norte",
        similarityLabel: "Posible duplicado",
        reason:
          "Mismo tramo de banqueta, misma categoría de agua y testimonios que describen salida intermitente.",
        daysApart: 12,
      },
      {
        id: "case-0841",
        folio: "VV-2026-0841",
        colonia: "Roma Norte",
        similarityLabel: "Reporte relacionado",
        reason:
          "Fuga reportada a media cuadra; podría compartir la misma red secundaria.",
        daysApart: 31,
      },
    ],
    risks: [
      {
        level: "high",
        title: "Caída de peatones",
        detail:
          "Una observación vecinal ya documenta una caída. La rampa de acceso permanece dentro del área mojada.",
      },
      {
        level: "medium",
        title: "Daño al pavimento",
        detail:
          "La loseta levantada y la arena visible sugieren erosión bajo la banqueta.",
      },
      {
        level: "medium",
        title: "Afectación al carril bici",
        detail:
          "El escurrimiento alcanza el carril de bicicletas, aunque el nivel de agua es bajo.",
      },
    ],
    historicalEvidence: [
      {
        id: "cit-1",
        title: "Fugas de agua en red secundaria · Cuauhtémoc",
        institution: "Datos Abiertos CDMX · Portal de reportes",
        date: "2026-09-18",
        excerpt:
          "Se registraron 4 reportes de escurrimiento en un radio de 250 m durante septiembre de 2026, dos sin cierre documentado.",
        urlLabel: "Ver conjunto de datos abierto",
      },
      {
        id: "cit-2",
        title: "Mapa de riesgos peatonales",
        institution: "Secretaría de Movilidad · Datos abiertos",
        date: "2026-08-02",
        excerpt:
          "El cruce de Insurgentes con el acceso al Metro se identifica como punto de alta afluencia peatonal, sin probabilidad calculada.",
        urlLabel: "Consultar referencia pública",
      },
    ],
    recommendedDepartmentId: "agua",
    recommendedDepartmentReason:
      "La evidencia apunta a una fuga en red secundaria; Aguas debe confirmar la fuente antes de cualquier obra de pavimento.",
    recommendedActions: [
      {
        title: "Contención inmediata",
        detail:
          "Delimitar la banqueta y la rampa de accesibilidad para evitar nuevas caídas.",
        owner: "Protección Civil",
      },
      {
        title: "Inspección de red",
        detail:
          "Verificar presión y posible fisura en la tubería que corre bajo la banqueta.",
        owner: "Aguas",
      },
      {
        title: "Revisión de duplicados",
        detail:
          "Comparar el tramo con los expedientes VV-2026-0838 y VV-2026-0841 antes de generar dos órdenes.",
        owner: "Mesa de gobierno",
      },
    ],
    limitations: baseLimitations,
    humanReviewRequired: true,
  },
  "case-0832": {
    caseId: "case-0832",
    state: "ready",
    generatedAt: "2026-10-30T08:55:00-06:00",
    modelLabel: "Análisis simulado de VotaVía",
    summary:
      "Hundimiento crítico en el acceso de carga del mercado. La intervención reportada por el especialista parece haber cerrado el socavón, pero la evidencia final muestra una fisura superficial y un desnivel con el asfalto existente. Se recomienda verificación en sitio antes de cerrar el caso.",
    keyFindings: [
      "La evidencia final muestra una fisura de más de un metro sobre el relleno.",
      "El desnivel de aproximadamente 4 cm puede generar golpes a vehículos pequeños.",
      "El caso permanece en verificación; el cierre del trabajo no equivale a cierre del reporte público.",
    ],
    duplicates: [
      {
        id: "case-0839",
        folio: "VV-2026-0839",
        colonia: "Centro",
        similarityLabel: "Reporte relacionado",
        reason: "Misma categoría y proveedor; no comparte ubicación.",
        daysApart: 3,
      },
    ],
    risks: [
      {
        level: "high",
        title: "Reapertura del hundimiento",
        detail:
          "La fisura superficial sobre un relleno reciente requiere inspección antes de retirar la delimitación.",
      },
      {
        level: "medium",
        title: "Circulación de carga",
        detail:
          "El acceso de carga del mercado recibe camiones diariamente; el peso puede acelerar el deterioro.",
      },
    ],
    historicalEvidence: [
      {
        id: "cit-3",
        title: "Registro de obras en pavimento · Narvarte",
        institution: "Secretaría de Obras · Datos abiertos",
        date: "2026-10-29",
        excerpt:
          "La orden de trabajo registra 3 m³ de material de relleno y 12 m² de reposición asfáltica.",
        urlLabel: "Consultar orden pública",
      },
    ],
    recommendedDepartmentId: "obras",
    recommendedDepartmentReason:
      "Obras conserva la orden de trabajo y debe validar el nivel del pavimento con el especialista.",
    recommendedActions: [
      {
        title: "Inspección de la fisura",
        detail:
          "Medir profundidad, nivel y compactación antes de aprobar la verificación.",
        owner: "Obras",
      },
      {
        title: "Prueba de carga",
        detail:
          "Coordinar una revisión con el acceso de carga del mercado en horario de baja actividad.",
        owner: "Obras · Brigadas Delta",
      },
    ],
    limitations: baseLimitations,
    humanReviewRequired: true,
  },
  "case-0843": {
    caseId: "case-0843",
    state: "ready",
    generatedAt: "2026-10-30T07:20:00-06:00",
    modelLabel: "Análisis simulado de VotaVía",
    summary:
      "Cuatro luminarias fuera de servicio en un tramo de 120 metros con dos cruces peatonales. La revisión del especialista apunta a dos balastros y un tramo de cableado. El riesgo es mayor por la percepción de inseguridad y la falta de iluminación en pasos peatonales.",
    keyFindings: [
      "El reporte original identifica cuatro luminarias; la orden actual cubre dos balastros.",
      "Hay un cruce peatonal sin iluminación dentro del tramo reportado.",
      "No se encontraron reportes de falla eléctrica general en la zona.",
    ],
    duplicates: [],
    risks: [
      {
        level: "medium",
        title: "Percepción de inseguridad",
        detail:
          "Vecinas reportan que evitan el tramo después de las 20:00; es una señal cualitativa, no una medición de incidencia delictiva.",
      },
      {
        level: "low",
        title: "Cableado expuesto",
        detail: "La revisión inicial no confirmó cableado expuesto; debe validarse al cierre.",
      },
    ],
    historicalEvidence: [
      {
        id: "cit-4",
        title: "Inventario de luminarias · Condesa",
        institution: "Dirección de Alumbrado Público",
        date: "2026-09-30",
        excerpt:
          "El tramo aparece con 6 puntos de luz registrados y mantenimiento programado para octubre.",
        urlLabel: "Consultar inventario",
      },
    ],
    recommendedDepartmentId: "alumbrado",
    recommendedDepartmentReason:
      "La falla corresponde a componentes de alumbrado; se requiere completar las cuatro luminarias y verificar el cableado.",
    recommendedActions: [
      {
        title: "Completar revisión del tramo",
        detail: "Confirmar las cuatro luminarias y no solo los dos balastros reportados.",
        owner: "Alumbrado · Lux Urbano",
      },
      {
        title: "Prueba nocturna",
        detail: "Documentar el encendido después de las 19:30 con evidencia fotográfica.",
        owner: "Lux Urbano",
      },
    ],
    limitations: baseLimitations,
    humanReviewRequired: true,
  },
};

export function createFallbackAnalysis(caseId: string): CaseAnalysis {
  return {
    caseId,
    state: "unavailable",
    humanReviewRequired: true,
  };
}

export const mockDispatchOrders: DispatchOrder[] = [
  {
    id: "ord-0832",
    caseId: "case-0832",
    specialistId: "sp-2",
    state: "completed",
    createdAt: "2026-10-26T09:30:00-06:00",
    timeline: [
      {
        id: "dt-1",
        at: "2026-10-26T09:30:00-06:00",
        label: "Asignación autorizada",
        detail: "Mesa de gobierno autorizó a Brigadas Delta.",
      },
      {
        id: "dt-2",
        at: "2026-10-26T10:12:00-06:00",
        label: "Especialista aceptó",
        detail: "Visita programada para el 27 de octubre, 08:00.",
      },
      {
        id: "dt-3",
        at: "2026-10-27T08:20:00-06:00",
        label: "Trabajo iniciado",
        detail: "Se delimitó el área y comenzó el retiro de escombro.",
      },
      {
        id: "dt-4",
        at: "2026-10-29T18:10:00-06:00",
        label: "Trabajo terminado",
        detail: "Se cargaron 3 evidencias y se solicitó verificación.",
      },
    ],
    evidence: [
      {
        id: "ev-0832-1",
        title: "Antes · borde del hundimiento",
        url: "/report-photos/bache-1.svg",
        alt: "Hundimiento antes de la intervención",
        submittedAt: "2026-10-27T08:25:00-06:00",
        note: "Se observa profundidad aproximada de 90 cm y grietas radiales.",
        kind: "before",
      },
      {
        id: "ev-0832-2",
        title: "Después · reposición asfáltica",
        url: "/report-photos/bache-3.svg",
        alt: "Área reparada con asfalto nuevo",
        submittedAt: "2026-10-29T17:55:00-06:00",
        note: "Relleno compactado en capas y carpeta asfáltica nueva.",
        kind: "after",
      },
      {
        id: "ev-0832-3",
        title: "Detalle · fisura superficial",
        url: "/report-photos/bache-2.svg",
        alt: "Fisura superficial en el área reparada",
        submittedAt: "2026-10-29T18:02:00-06:00",
        note: "Fisura visible de aproximadamente 1.2 m; el especialista la reporta como superficial.",
        kind: "after",
      },
      {
        id: "ev-0832-4",
        title: "Acta de trabajo",
        url: "/report-photos/acta.svg",
        alt: "Documento de acta de trabajo",
        submittedAt: "2026-10-29T18:08:00-06:00",
        note: "Orden firmada con material utilizado y responsable de la brigada.",
        kind: "document",
      },
    ],
  },
  {
    id: "ord-0843",
    caseId: "case-0843",
    specialistId: "sp-1",
    state: "in_progress",
    createdAt: "2026-10-29T08:30:00-06:00",
    timeline: [
      {
        id: "dt-5",
        at: "2026-10-29T08:30:00-06:00",
        label: "Asignación autorizada",
        detail: "Dirección de Alumbrado autorizó a Lux Urbano.",
      },
      {
        id: "dt-6",
        at: "2026-10-29T09:02:00-06:00",
        label: "Especialista aceptó",
        detail: "Revisión programada para el 30 de octubre.",
      },
      {
        id: "dt-7",
        at: "2026-10-30T08:05:00-06:00",
        label: "Trabajo iniciado",
        detail: "Diagnóstico de circuito y reemplazo de dos balastros.",
      },
    ],
    evidence: [
      {
        id: "ev-0843-1",
        title: "Antes · tramo sin luz",
        url: "/report-photos/luz-1.svg",
        alt: "Tramo de calle sin iluminación",
        submittedAt: "2026-10-30T08:12:00-06:00",
        note: "Registro nocturno del tramo entre Nuevo León y Sonora.",
        kind: "before",
      },
    ],
  },
  {
    id: "ord-0844",
    caseId: "case-0844",
    specialistId: "sp-4",
    state: "completed",
    createdAt: "2026-10-27T10:40:00-06:00",
    timeline: [
      {
        id: "dt-8",
        at: "2026-10-27T10:40:00-06:00",
        label: "Asignación autorizada",
        detail: "Aguas autorizó limpieza profunda.",
      },
      {
        id: "dt-9",
        at: "2026-10-29T08:00:00-06:00",
        label: "Trabajo iniciado",
        detail: "Se retiró sedimento y se revisó el tubo con cámara.",
      },
      {
        id: "dt-10",
        at: "2026-10-30T09:10:00-06:00",
        label: "Trabajo terminado",
        detail: "Evidencia cargada; pendiente de verificación gubernamental.",
      },
    ],
    evidence: [
      {
        id: "ev-0844-1",
        title: "Antes · coladera saturada",
        url: "/report-photos/drenaje-2.svg",
        alt: "Coladera con residuos antes de la limpieza",
        submittedAt: "2026-10-29T08:15:00-06:00",
        note: "Sedimento y hojas bloqueaban el 70% de la rejilla.",
        kind: "before",
      },
      {
        id: "ev-0844-2",
        title: "Después · coladera limpia",
        url: "/report-photos/drenaje-1.svg",
        alt: "Coladera después de la limpieza",
        submittedAt: "2026-10-30T09:02:00-06:00",
        note: "Se retiraron dos costales de sedimento y se verificó el flujo.",
        kind: "after",
      },
    ],
  },
  {
    id: "ord-0839",
    caseId: "case-0839",
    specialistId: "sp-2",
    state: "authorized",
    createdAt: "2026-10-30T07:55:00-06:00",
    timeline: [
      {
        id: "dt-11",
        at: "2026-10-30T07:55:00-06:00",
        label: "Asignación autorizada",
        detail: "Obras autorizó a Brigadas Delta; esperando aceptación.",
      },
    ],
    evidence: [],
  },
  {
    id: "ord-0825",
    caseId: "case-0825",
    specialistId: "sp-4",
    state: "verified",
    createdAt: "2026-10-14T09:20:00-06:00",
    timeline: [
      {
        id: "dt-12",
        at: "2026-10-14T09:20:00-06:00",
        label: "Asignación autorizada",
        detail: "Se autorizó la reparación de la red secundaria.",
      },
      {
        id: "dt-13",
        at: "2026-10-27T17:30:00-06:00",
        label: "Trabajo verificado",
        detail: "Gobierno validó la evidencia y publicó el resultado.",
      },
    ],
    evidence: [
      {
        id: "ev-0825-1",
        title: "Después · banqueta restituida",
        url: "/report-photos/agua-2.svg",
        alt: "Banqueta restituida después de la reparación",
        submittedAt: "2026-10-27T16:50:00-06:00",
        note: "Tubería sustituida y concreto colado; sin escurrimiento visible.",
        kind: "after",
      },
    ],
  },
  {
    id: "ord-0812",
    caseId: "case-0812",
    specialistId: "sp-2",
    state: "verified",
    createdAt: "2026-10-10T10:00:00-06:00",
    timeline: [
      {
        id: "dt-14",
        at: "2026-10-10T10:00:00-06:00",
        label: "Asignación autorizada",
        detail: "Bacheo menor autorizado.",
      },
      {
        id: "dt-15",
        at: "2026-10-18T11:40:00-06:00",
        label: "Trabajo verificado",
        detail: "Caso cerrado y resultado publicado.",
      },
    ],
    evidence: [],
  },
  {
    id: "ord-0818",
    caseId: "case-0818",
    specialistId: "sp-3",
    state: "scheduled",
    createdAt: "2026-10-29T12:10:00-06:00",
    timeline: [
      {
        id: "dt-16",
        at: "2026-10-29T12:10:00-06:00",
        label: "Asignación autorizada",
        detail: "Movilidad autorizó la instalación de señal temporal.",
      },
      {
        id: "dt-17",
        at: "2026-10-30T08:15:00-06:00",
        label: "Visita programada",
        detail: "Instalación programada para el 31 de octubre, 07:00.",
      },
    ],
    evidence: [],
  },
];

export const mockRiskSignals: RiskSignal[] = [
  {
    id: "risk-1",
    title: "Fugas de agua recurrentes en corredor Roma–Condesa",
    category: "agua",
    strength: "recurring",
    colonias: ["Roma Norte", "Condesa"],
    reportCount: 17,
    windowLabel: "Últimos 45 días",
    description:
      "Se observa un grupo de reportes de escurrimiento en tres cuadras conectadas por la misma red secundaria. No es una predicción: es una concentración de casos con características similares.",
    evidence:
      "14 de 17 reportes mencionan banqueta mojada sin lluvia; 6 se cerraron sin evidencia de reparación de red.",
    recommendation:
      "Programar inspección conjunta de red secundaria y pavimento en el tramo Insurgentes–Tamaulipas antes de nuevas obras de bacheo.",
    suggestedDepartmentId: "agua",
    position: { x: 44, y: 57 },
    sparkline: [2, 3, 2, 4, 3, 6, 5, 8],
  },
  {
    id: "risk-2",
    title: "Drenaje saturado en colonias del sur",
    category: "drenaje",
    strength: "emerging",
    colonias: ["Tlalpan", "Coyoacán"],
    reportCount: 9,
    windowLabel: "Últimos 21 días",
    description:
      "Los reportes de agua estancada aumentaron después de las lluvias recientes en dos colonias con coladeras reportadas como parcialmente bloqueadas.",
    evidence:
      "9 reportes en 21 días; 4 mencionan ingreso de agua a viviendas y 3 ya tienen orden de limpieza.",
    recommendation:
      "Inspeccionar coladeras y cárcamos en un radio de 500 m antes del siguiente periodo de lluvia.",
    suggestedDepartmentId: "agua",
    position: { x: 38, y: 82 },
    sparkline: [1, 1, 2, 2, 3, 4, 5, 6],
  },
  {
    id: "risk-3",
    title: "Luminarias fuera de servicio en ejes peatonales",
    category: "alumbrado",
    strength: "observed",
    colonias: ["Condesa", "Benito Juárez", "Centro"],
    reportCount: 12,
    windowLabel: "Últimos 30 días",
    description:
      "Se identificaron reportes de luminarias apagadas en tramos cercanos a parques y accesos de transporte. La señal describe concentración geográfica, no una medición de incidencia delictiva.",
    evidence:
      "12 reportes en 9 tramos; 5 incluyen observaciones vecinales sobre percepción de inseguridad.",
    recommendation:
      "Priorizar recorrido nocturno de inventario y revisar circuitos con más de dos reportes en el mismo tramo.",
    suggestedDepartmentId: "alumbrado",
    position: { x: 55, y: 60 },
    sparkline: [2, 2, 3, 2, 4, 3, 4, 5],
  },
  {
    id: "risk-4",
    title: "Residuos voluminosos junto a escuelas",
    category: "residuos",
    strength: "emerging",
    colonias: ["Narvarte", "Iztapalapa"],
    reportCount: 8,
    windowLabel: "Últimos 14 días",
    description:
      "Ocho reportes recientes describen muebles y escombro en calles con escuelas o mercados. La coincidencia es de ubicación y tipo de residuo.",
    evidence:
      "3 reportes están a menos de 150 m de una escuela; 2 mencionan presencia de fauna nociva.",
    recommendation:
      "Coordinar una ruta especial de voluminosos y revisar puntos de descarga nocturna.",
    suggestedDepartmentId: "residuos",
    position: { x: 68, y: 58 },
    sparkline: [0, 1, 1, 1, 2, 3, 4, 5],
  },
  {
    id: "risk-5",
    title: "Pavimento dañado después de obras recientes",
    category: "baches",
    strength: "recurring",
    colonias: ["Centro", "Narvarte", "Del Valle"],
    reportCount: 11,
    windowLabel: "Últimos 60 días",
    description:
      "Once reportes de baches se ubican en calles con órdenes de obra cerradas en los últimos seis meses. Es una comparación histórica, no una probabilidad de falla.",
    evidence:
      "7 de 11 reportes incluyen fotos con parches recientes; 4 tienen grietas alrededor del área intervenida.",
    recommendation:
      "Revisar expedientes de obra y realizar inspección de niveles en los tramos con parches de menos de un año.",
    suggestedDepartmentId: "obras",
    position: { x: 51, y: 48 },
    sparkline: [1, 2, 2, 3, 3, 4, 5, 6],
  },
];

export const mockActivity: ActivityItem[] = [
  {
    id: "act-1",
    at: "2026-10-30T10:21:00-06:00",
    title: "Nuevas observaciones en fuga de Roma Norte",
    detail: "3 vecinos actualizaron el estado del escurrimiento.",
    kind: "review",
    caseId: "case-0847",
  },
  {
    id: "act-2",
    at: "2026-10-30T09:45:00-06:00",
    title: "Evidencia con incidencia en Narvarte",
    detail: "Vecinos reportan fisura después del trabajo del especialista.",
    kind: "signal",
    caseId: "case-0832",
  },
  {
    id: "act-3",
    at: "2026-10-30T09:10:00-06:00",
    title: "Trabajo terminado en Tlalpan",
    detail: "HidroServicios MX solicitó verificación de limpieza de drenaje.",
    kind: "verification",
    caseId: "case-0844",
  },
  {
    id: "act-4",
    at: "2026-10-30T08:15:00-06:00",
    title: "Visita programada en Del Valle",
    detail: "Señalización Vial MX acudirá mañana al cruce escolar.",
    kind: "dispatch",
    caseId: "case-0818",
  },
  {
    id: "act-5",
    at: "2026-10-29T18:10:00-06:00",
    title: "Trabajo terminado en Mercado Narvarte",
    detail: "Brigadas Delta cargó evidencia y solicitó verificación.",
    kind: "verification",
    caseId: "case-0832",
  },
  {
    id: "act-6",
    at: "2026-10-28T13:30:00-06:00",
    title: "Resultado publicado en Azcapotzalco",
    detail: "Se publicó el dictamen de la reparación de red secundaria.",
    kind: "publication",
    caseId: "case-0825",
  },
];

export const mockTrend = [
  { label: "24 sep", received: 38, resolved: 24 },
  { label: "1 oct", received: 42, resolved: 28 },
  { label: "8 oct", received: 47, resolved: 33 },
  { label: "15 oct", received: 44, resolved: 37 },
  { label: "22 oct", received: 52, resolved: 41 },
  { label: "29 oct", received: 58, resolved: 46 },
];

export const teamMembers = [
  {
    id: "tm-1",
    name: "Valeria Ortiz",
    role: "Coordinadora de mesa de gobierno",
    initials: "VO",
    active: 12,
    resolved: 38,
    status: "En línea",
    color: "blue",
  },
  {
    id: "tm-2",
    name: "Mauricio Aguirre",
    role: "Enlace de Obras",
    initials: "MA",
    active: 9,
    resolved: 31,
    status: "En campo",
    color: "amber",
  },
  {
    id: "tm-3",
    name: "Sofía Delgado",
    role: "Enlace de Aguas",
    initials: "SD",
    active: 7,
    resolved: 26,
    status: "En línea",
    color: "cyan",
  },
  {
    id: "tm-4",
    name: "Iván Beltrán",
    role: "Verificación de intervenciones",
    initials: "IB",
    active: 10,
    resolved: 22,
    status: "Revisando evidencia",
    color: "green",
  },
  {
    id: "tm-5",
    name: "Rocío Luna",
    role: "Enlace de Movilidad",
    initials: "RL",
    active: 5,
    resolved: 17,
    status: "Fuera de línea",
    color: "pink",
  },
];

export const mockDemoUsers: DemoUser[] = [
  {
    id: "demo-valeria",
    name: "Valeria Ortiz",
    initials: "VO",
    title: "Coordinadora de la mesa de gobierno",
    role: "coordinator",
    organizationName: "Gobierno CDMX · entorno de demostración",
    isDemo: true,
    permissions: [
      "case:manage",
      "case:assign",
      "evidence:upload",
      "dispatch:authorize",
      "dispute:respond",
      "outcome:publish",
      "settings:reset",
    ],
  },
  {
    id: "demo-diego",
    name: "Diego Salgado",
    initials: "DS",
    title: "Operador de Obras",
    role: "department_operator",
    departmentId: "obras",
    organizationName: "Obras · cuenta de demostración",
    isDemo: true,
    permissions: ["case:manage", "evidence:upload", "dispute:respond"],
  },
  {
    id: "demo-lucia",
    name: "Lucía Márquez",
    initials: "LM",
    title: "Operadora de Aguas",
    role: "department_operator",
    departmentId: "agua",
    organizationName: "Aguas · cuenta de demostración",
    isDemo: true,
    permissions: ["case:manage", "evidence:upload", "dispute:respond"],
  },
  {
    id: "demo-nadia",
    name: "Nadia Ruiz",
    initials: "NR",
    title: "Analista de inteligencia operativa",
    role: "analyst",
    organizationName: "Mesa de análisis · cuenta de demostración",
    isDemo: true,
    permissions: [],
  },
];

const DEMO_REFERENCE_TIME = new Date("2026-10-30T12:00:00-06:00").getTime();

function daysSince(iso: string): number {
  return Math.max(
    0,
    Math.ceil((DEMO_REFERENCE_TIME - new Date(iso).getTime()) / 86_400_000),
  );
}

function defaultPriorityBreakdown(
  item: GovernmentCase,
  independentReports: number,
): CommunityPriorityBreakdown {
  const safety = item.citizen.safetyConcern
    ? 30
    : item.priority === "critical"
      ? 22
      : item.priority === "high"
        ? 12
        : 4;
  const reports = Math.min(25, independentReports * 3);
  const support = Math.min(20, Math.round(item.citizen.supportCount / 6));
  const concentration = item.relatedCaseIds.length >= 2 ? 13 : 7;
  const persistence = Math.min(10, daysSince(item.reportedAt) * 2);
  return {
    score: safety + reports + support + concentration + persistence,
    maxScore: 100,
    items: [
      {
        key: "safety",
        label: "Riesgo de seguridad",
        detail: item.citizen.safetyConcern
          ? item.citizen.safetyNote ?? "La comunidad señaló un riesgo de seguridad."
          : "Sin riesgo de seguridad señalado en el reporte.",
        points: safety,
        maxPoints: 30,
      },
      {
        key: "reports",
        label: "Reportes independientes",
        detail: `${independentReports} reportes distintos, no sólo apoyos al mismo reporte.`,
        points: reports,
        maxPoints: 25,
      },
      {
        key: "support",
        label: "Apoyo ciudadano",
        detail: `${item.citizen.supportCount} personas únicas apoyan el reporte.`,
        points: support,
        maxPoints: 20,
      },
      {
        key: "concentration",
        label: "Concentración geográfica",
        detail: "Casos relacionados y observaciones cercanas dentro de la misma colonia.",
        points: concentration,
        maxPoints: 15,
      },
      {
        key: "persistence",
        label: "Persistencia",
        detail: `El primer reporte tiene ${daysSince(item.reportedAt)} días y sigue abierto.`,
        points: persistence,
        maxPoints: 10,
      },
    ],
    note: "El riesgo de seguridad pesa más que la popularidad. Los apoyos no se cuentan como reportes independientes.",
  };
}

const officialRecords: Record<string, ImportedGovernmentRecord> = {
  "case-0832": {
    sourceName: "SUAC · importación simulada",
    sourceFolio: "SUAC-DEMO-2026-0832",
    agency: "Secretaría de Obras y Servicios",
    reportedStatus: "En proceso de atención",
    importedAt: "2026-10-25T16:10:00-06:00",
    refreshedAt: "2026-10-29T07:30:00-06:00",
    freshness: "stale",
    freshnessLabel: "Sin actualización reciente",
    note: "Folio ficticio. El estado importado conserva su propia fuente y no cambia cuando VotaVía marca un cierre operativo.",
  },
  "case-0847": {
    sourceName: "SUAC · importación simulada",
    sourceFolio: "SUAC-DEMO-2026-0847",
    agency: "Sistema de Aguas de la Ciudad",
    reportedStatus: "Reporte recibido · inspección pendiente",
    importedAt: "2026-10-30T06:55:00-06:00",
    refreshedAt: "2026-10-30T10:05:00-06:00",
    freshness: "fresh",
    freshnessLabel: "Importado hoy",
    note: "Folio ficticio de demostración. No representa una adopción oficial del sistema por el Gobierno de la Ciudad.",
  },
  "case-0844": {
    sourceName: "SUAC · importación simulada",
    sourceFolio: "SUAC-DEMO-2026-0844",
    agency: "Sistema de Aguas de la Ciudad",
    reportedStatus: "En revisión técnica",
    importedAt: "2026-10-27T11:00:00-06:00",
    refreshedAt: "2026-10-29T09:20:00-06:00",
    freshness: "aging",
    freshnessLabel: "Última lectura hace 31 h",
    note: "El estado de origen se muestra sólo como referencia. La operación de VotaVía es independiente.",
  },
  "case-0821": {
    sourceName: "SUAC · importación simulada",
    sourceFolio: "SUAC-DEMO-2026-0821",
    agency: "Secretaría de Movilidad",
    reportedStatus: "Recibido · sin asignación publicada",
    importedAt: "2026-10-22T08:45:00-06:00",
    refreshedAt: "2026-10-26T18:00:00-06:00",
    freshness: "stale",
    freshnessLabel: "Dato con más de 72 h",
    note: "La frescura es baja. Debe confirmarse con la fuente antes de usarlo como evidencia oficial.",
  },
  "case-0825": {
    sourceName: "SUAC · importación simulada",
    sourceFolio: "SUAC-DEMO-2026-0825",
    agency: "Sistema de Aguas de la Ciudad",
    reportedStatus: "Concluido",
    importedAt: "2026-10-19T10:15:00-06:00",
    refreshedAt: "2026-10-28T16:40:00-06:00",
    freshness: "fresh",
    freshnessLabel: "Sincronizado ayer",
    note: "Registro ficticio mostrado para explicar la separación entre fuente oficial y verificación comunitaria.",
  },
};

for (const item of mockCases) {
  const independentReports = Math.max(
    1,
    Math.round(item.citizen.supportCount / 9) + item.relatedCaseIds.length,
  );
  item.independentReportCount = independentReports;
  item.priorityBreakdown = defaultPriorityBreakdown(item, independentReports);
  item.communityVerification = {
    status: "not_started",
    outcome: "La comunidad todavía no inicia la verificación.",
    updatedAt: item.updatedAt,
    note: "Este estado sólo puede cambiarlo la ciudadanía desde la experiencia ciudadana.",
  };
  if (officialRecords[item.id]) item.officialRecord = officialRecords[item.id];
}

Object.assign(mockCases.find((item) => item.id === "case-0832")!, {
  assignedOperatorId: "demo-diego",
  assignedOperatorName: "Diego Salgado",
  independentReportCount: 7,
  priorityBreakdown: {
    score: 96,
    maxScore: 100,
    items: [
      {
        key: "safety",
        label: "Riesgo de seguridad",
        detail: "Paso de camiones junto a un borde sin señalización oficial.",
        points: 30,
        maxPoints: 30,
      },
      {
        key: "reports",
        label: "Reportes independientes",
        detail: "7 reportes distintos, incluidos 2 comerciantes y una escuela cercana.",
        points: 21,
        maxPoints: 25,
      },
      {
        key: "support",
        label: "Apoyo ciudadano",
        detail: "86 personas únicas apoyan el reporte principal.",
        points: 20,
        maxPoints: 20,
      },
      {
        key: "concentration",
        label: "Concentración geográfica",
        detail: "Los 7 reportes se concentran a menos de 120 m del mercado.",
        points: 15,
        maxPoints: 15,
      },
      {
        key: "persistence",
        label: "Persistencia",
        detail: "El primer reporte tiene 5 días y continúa con observaciones nuevas.",
        points: 10,
        maxPoints: 10,
      },
    ],
    note: "La seguridad y la concentración explican el puntaje alto; no se ordena sólo por los 86 apoyos.",
  },
  communityVerification: {
    status: "disputed",
    outcome: "Vecinos no validan el cierre: reportan fisura y desnivel.",
    updatedAt: "2026-10-30T09:45:00-06:00",
    verifiedNeighbors: 12,
    note: "La verificación ciudadana sigue en disputa. La mesa de gobierno puede responder, pero no cambiar este resultado.",
  },
  governmentEvidence: [
    {
      id: "gev-0832-before",
      kind: "before",
      title: "Hundimiento antes del bacheo",
      note: "Se delimitó el área y se retiró material suelto antes de la reparación.",
      url: "/report-photos/bache-2.svg",
      performedAt: "2026-10-27T08:10:00-06:00",
      submittedAt: "2026-10-27T08:45:00-06:00",
      departmentId: "obras",
      operatorName: "Diego Salgado",
      authorId: "demo-diego",
    },
    {
      id: "gev-0832-after",
      kind: "after",
      title: "Bacheo profundo terminado",
      note: "Colado de concreto y compactación. La fisura superficial quedó registrada para revisión.",
      url: "/report-photos/bache-3.svg",
      performedAt: "2026-10-29T16:20:00-06:00",
      submittedAt: "2026-10-29T18:05:00-06:00",
      departmentId: "obras",
      operatorName: "Diego Salgado",
      authorId: "demo-diego",
    },
    {
      id: "gev-0832-acta",
      kind: "document",
      title: "Acta de intervención",
      note: "Registro interno con alcance, cuadrilla y materiales utilizados.",
      url: "/report-photos/acta.svg",
      fileName: "acta-intervencion-0832.pdf",
      performedAt: "2026-10-29T17:00:00-06:00",
      submittedAt: "2026-10-29T18:06:00-06:00",
      departmentId: "obras",
      operatorName: "Diego Salgado",
      authorId: "demo-diego",
    },
  ],
  completionClaims: [
    {
      id: "claim-0832-1",
      claimedAt: "2026-10-29T18:20:00-06:00",
      claimedBy: "Diego Salgado",
      departmentId: "obras",
      summary:
        "Se retiró material suelto, se rellenó el hundimiento y se colocó concreto nuevo con señalización provisional.",
      evidenceIds: ["gev-0832-before", "gev-0832-after", "gev-0832-acta"],
      operationalStatusAtClaim: "pending_verification",
      note: "Aviso operativo de Obras. No modifica el registro SUAC ni la verificación ciudadana.",
    },
  ],
  dispute: {
    id: "disp-0832-1",
    claimId: "claim-0832-1",
    openedAt: "2026-10-30T09:45:00-06:00",
    citizenName: "Rogelio Núñez",
    reason: "El trabajo no coincide con la evidencia publicada",
    detail:
      "El asfalto nuevo quedó más alto que la banqueta y tiene una fisura al centro. Los camiones vuelven a pasar sobre el borde. La comunidad considera que el hundimiento no está resuelto.",
    evidence: {
      url: "/report-photos/bache-1.svg",
      caption: "Foto ciudadana del 30 de octubre: fisura y desnivel sobre el área reparada.",
    },
    status: "open",
    responses: [],
  },
});

Object.assign(mockCases.find((item) => item.id === "case-0844")!, {
  assignedOperatorId: "demo-lucia",
  assignedOperatorName: "Lucía Márquez",
  independentReportCount: 5,
  priorityBreakdown: {
    score: 81,
    maxScore: 100,
    items: [
      {
        key: "safety",
        label: "Riesgo de seguridad",
        detail: "Brote de aguas negras junto a una escuela y una rampa peatonal.",
        points: 30,
        maxPoints: 30,
      },
      {
        key: "reports",
        label: "Reportes independientes",
        detail: "5 reportes de vecinos y comercios distintos.",
        points: 15,
        maxPoints: 25,
      },
      {
        key: "support",
        label: "Apoyo ciudadano",
        detail: "44 personas únicas apoyan el reporte principal.",
        points: 7,
        maxPoints: 20,
      },
      {
        key: "concentration",
        label: "Concentración geográfica",
        detail: "Los reportes se ubican en dos calles contiguas.",
        points: 15,
        maxPoints: 15,
      },
      {
        key: "persistence",
        label: "Persistencia",
        detail: "El brote se mantiene después de 4 días.",
        points: 10,
        maxPoints: 10,
      },
    ],
    note: "El riesgo sanitario se pondera por encima del volumen de apoyos.",
  },
  communityVerification: {
    status: "pending",
    outcome: "La comunidad revisa si el brote dejó de salir después del trabajo.",
    updatedAt: "2026-10-30T08:10:00-06:00",
    verifiedNeighbors: 8,
    note: "La verificación está en curso y no puede ser cerrada por la mesa de gobierno.",
  },
  governmentEvidence: [
    {
      id: "gev-0844-before",
      kind: "before",
      title: "Brote activo antes de la reparación",
      note: "Se localizó una fisura en el colector y se acordonó el paso peatonal.",
      url: "/report-photos/drenaje-1.svg",
      performedAt: "2026-10-29T07:30:00-06:00",
      submittedAt: "2026-10-29T08:00:00-06:00",
      departmentId: "agua",
      operatorName: "Lucía Márquez",
      authorId: "demo-lucia",
    },
    {
      id: "gev-0844-after",
      kind: "after",
      title: "Colector sellado y banqueta limpia",
      note: "Se sustituyó un tramo de tubo y se sanitizó el área. Queda pendiente la validación vecinal.",
      url: "/report-photos/drenaje-2.svg",
      performedAt: "2026-10-30T06:40:00-06:00",
      submittedAt: "2026-10-30T07:15:00-06:00",
      departmentId: "agua",
      operatorName: "Lucía Márquez",
      authorId: "demo-lucia",
    },
  ],
});

Object.assign(mockCases.find((item) => item.id === "case-0847")!, {
  independentReportCount: 4,
  priorityBreakdown: {
    score: 59,
    maxScore: 100,
    items: [
      {
        key: "safety",
        label: "Riesgo de seguridad",
        detail: "El agua corre hacia una rampa de acceso y ya provocó una caída.",
        points: 26,
        maxPoints: 30,
      },
      {
        key: "reports",
        label: "Reportes independientes",
        detail: "4 reportes distintos, no sólo apoyos al mismo reporte.",
        points: 12,
        maxPoints: 25,
      },
      {
        key: "support",
        label: "Apoyo ciudadano",
        detail: "37 personas únicas apoyan el reporte.",
        points: 6,
        maxPoints: 20,
      },
      {
        key: "concentration",
        label: "Concentración geográfica",
        detail: "Los 4 reportes y 2 casos relacionados caen en una sola cuadra.",
        points: 13,
        maxPoints: 15,
      },
      {
        key: "persistence",
        label: "Persistencia",
        detail: "El primer reporte tiene 1 día y el escurrimiento continúa.",
        points: 2,
        maxPoints: 10,
      },
    ],
    note: "La cercanía a una rampa peatonal pesa más que el volumen de apoyos.",
  },
  communityVerification: {
    status: "not_started",
    outcome: "La comunidad aún no inicia la verificación.",
    updatedAt: "2026-10-30T10:21:00-06:00",
    note: "Prioridad alta por riesgo de caída, aunque el volumen de apoyos sea menor que otros casos.",
  },
});

Object.assign(mockCases.find((item) => item.id === "case-0843")!, {
  communityVerification: {
    status: "pending",
    outcome: "Comerciantes revisan si las cuatro luminarias ya encienden.",
    updatedAt: "2026-10-30T07:50:00-06:00",
    verifiedNeighbors: 14,
    note: "La verificación ciudadana está pendiente de una segunda revisión nocturna.",
  },
});

Object.assign(mockCases.find((item) => item.id === "case-0821")!, {
  communityVerification: {
    status: "pending",
    outcome: "La comunidad documenta si el cruce sigue sin señalización.",
    updatedAt: "2026-10-29T19:20:00-06:00",
    verifiedNeighbors: 6,
    note: "Caso crítico por seguridad vial; no se prioriza sólo por apoyos.",
  },
});

for (const id of ["case-0825", "case-0812"]) {
  const item = mockCases.find((entry) => entry.id === id);
  if (!item) continue;
  item.communityVerification = {
    status: "verified",
    outcome: "La comunidad confirmó que la intervención resolvió el problema.",
    updatedAt: item.updatedAt,
    verifiedNeighbors: id === "case-0825" ? 18 : 9,
    note: "Resultado validado por vecinos verificados desde la experiencia ciudadana.",
  };
}
