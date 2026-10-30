/**
 * Photography used by the seeded demo reports.
 *
 * All images are Pexels stock photos (Pexels License: free for commercial use,
 * no attribution required). Keeping the ids in one place makes it easy to swap
 * a photo without touching the demo seeds.
 */
const PEXELS_PHOTOS = {
  // Baches y pavimento dañado
  "bache-1": 31780068,
  "bache-2": 5688465,
  "bache-3": 17706118,
  "bache-4": 9963248,
  "bache-5": 20518249,
  "bache-6": 33421226,
  "bache-antes": 9963247,
  "bache-despues": 6018646,

  // Residuos y limpieza
  "basura-1": 13839236,
  "basura-2": 27607950,
  "residuos-1": 17296457,
  "residuos-2": 26800633,

  // Alumbrado público
  "luminaria-1": 36781579,
  "luminaria-2": 30592054,
  "luz-1": 36781579,
  "luz-2": 3881035,

  // Semáforos y movilidad
  "semaforo-1": 36583811,
  "semaforo-2": 39477735,
  "semaforo-antes": 8732925,
  "semaforo-despues": 30270388,
  "movilidad-1": 39477735,
  "movilidad-2": 30270388,

  // Banquetas, árboles y parques
  "banqueta-1": 17877943,
  "banqueta-2": 16360149,
  "arbol-antes": 16360149,
  "arbol-despues": 34500783,
  "parque-1": 12364207,
  "parque-2": 5785548,

  // Agua y drenaje
  "agua-1": 14216445,
  "agua-2": 35302180,
  "drenaje-1": 14216449,
  "drenaje-2": 5688465,

  // Documentos
  acta: 29765568,
} as const;

export type StockPhotoName = keyof typeof PEXELS_PHOTOS;

export function stockPhoto(name: StockPhotoName, width = 1200) {
  const id = PEXELS_PHOTOS[name];
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;
}

/**
 * Several candidates per category so neighbouring cards do not repeat the same
 * photograph. The pick is stable for a given key (e.g. the case id).
 */
const CATEGORY_GALLERY = {
  road_damage: ["bache-1", "bache-2", "bache-3", "bache-4", "bache-5", "bache-6"],
  street_lighting: ["luminaria-1", "luminaria-2", "luz-1", "luz-2"],
  traffic_signals: ["semaforo-1", "semaforo-2", "semaforo-antes", "movilidad-2"],
  sidewalk_accessibility: ["banqueta-1", "banqueta-2", "arbol-antes", "movilidad-1"],
  trees_vegetation: ["arbol-antes", "arbol-despues", "banqueta-2", "parque-1"],
  waste_sanitation: ["basura-1", "basura-2", "residuos-1", "residuos-2"],
  parks_public_spaces: ["parque-1", "parque-2"],
  other: ["movilidad-1", "movilidad-2", "drenaje-1"],
} as const;

function stableIndex(key: string, size: number) {
  // UUIDs and folios share long prefixes, so hash from the end to spread them.
  let hash = 0;
  for (let i = key.length - 1; i >= 0; i -= 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return hash % size;
}

/** Deterministic fallback photo for a report without its own upload. */
export function fallbackPhoto(category: string, key: string, width = 1200) {
  const gallery = CATEGORY_GALLERY[category as keyof typeof CATEGORY_GALLERY] ?? CATEGORY_GALLERY.other;
  const name = gallery[stableIndex(`${category}:${key}`, gallery.length)];
  return stockPhoto(name, width);
}
