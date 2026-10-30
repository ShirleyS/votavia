import type { CaseCategory } from "@/shared/votavia-contract";

export interface CategoryCatalogEntry {
  category: CaseCategory;
  label: string;
  description: string;
}

export const categories: CategoryCatalogEntry[] = [
  {
    category: "road_damage",
    label: "Baches y pavimento",
    description: "Baches, hundimientos, grietas y pavimento en mal estado.",
  },
  {
    category: "street_lighting",
    label: "Luminarias y alumbrado",
    description: "Luminarias apagadas, intermitentes o dañadas en vía pública.",
  },
  {
    category: "traffic_signals",
    label: "Semáforos y señalización",
    description: "Semáforos, señales de tránsito y pintura vial.",
  },
  {
    category: "sidewalk_accessibility",
    label: "Banquetas y accesibilidad",
    description: "Banquetas rotas, rampas obstruidas y barreras de accesibilidad.",
  },
  {
    category: "trees_vegetation",
    label: "Árboles y vegetación",
    description: "Árboles en riesgo, poda y vegetación que obstruye el paso.",
  },
  {
    category: "waste_sanitation",
    label: "Limpieza y residuos",
    description: "Basura acumulada, contenedores desbordados y escombros.",
  },
  {
    category: "parks_public_spaces",
    label: "Parques y espacio público",
    description: "Mobiliario dañado, juegos infantiles y mantenimiento de parques.",
  },
  {
    category: "other",
    label: "Otros",
    description: "Problemas urbanos que no encajan en las categorías anteriores.",
  },
];
