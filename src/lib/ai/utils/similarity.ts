import { clamp01 } from "./validation";

/**
 * Deterministic lexical similarity for Mexican Spanish infrastructure reports.
 *
 * This is a *prior*, not a semantic model: it gives the shortlist a stable,
 * testable ranking and lets the module degrade gracefully when DeepSeek is
 * unavailable. The model still makes the final comparison when configured.
 */

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "a", "en",
  "y", "o", "u", "que", "se", "su", "sus", "por", "para", "con", "sin", "es", "son",
  "esta", "este", "estos", "estas", "hay", "ha", "han", "ya", "muy", "mas", "más",
  "pero", "como", "cual", "donde", "cuando", "desde", "hasta", "sobre", "entre",
  "nos", "me", "mi", "mis", "tu", "tus", "le", "les", "lo", "los", "fue", "era",
  "ser", "estar", "estan", "están", "tiene", "tienen", "hace", "hacer", "va", "van",
  "favor", "gracias", "porfavor", "favor", "aqui", "aquí", "ahi", "allí", "alli",
  "tambien", "también", "solo", "sólo", "todo", "toda", "todos", "todas",
  "dia", "día", "dias", "días", "ayer", "hoy", "manana", "mañana", "noche",
  "muy", "bastante", "poco", "mucho", "muchos", "muchas", "vez", "veces",
]);

/**
 * Canonical tokens. Each group maps colloquial variants, plurals and common
 * misspellings onto one comparable term.
 */
const CANONICAL_TERMS: Record<string, string> = {
  bache: "bache", baches: "bache", bachito: "bache", hoyo: "bache", hoyos: "bache",
  hoyote: "bache", hoyotes: "bache", bacheo: "bache", socavon: "bache",
  pavimento: "bache", asfalto: "bache", carpeta: "bache", grieta: "bache",
  hundimiento: "bache", rompimiento: "bache",

  semaforo: "semaforo", semáforos: "semaforo", semaforos: "semaforo",
  semáforo: "semaforo", semaforos_: "semaforo", senal: "semaforo",
  senales: "semaforo", señal: "semaforo", señales: "semaforo",
  luces: "semaforo", luz: "semaforo", flecha: "semaforo", flechas: "semaforo",
  cruce: "cruce", cruces: "cruce", esquina: "cruce", esquinas: "cruce",
  interseccion: "cruce", intersección: "cruce", intersecciones: "cruce",

  luminaria: "luminaria", luminarias: "luminaria", lampara: "luminaria",
  lamparas: "luminaria", lámpara: "luminaria", lámparas: "luminaria",
  alumbrado: "luminaria", poste: "luminaria", postes: "luminaria",
  foco: "luminaria", focos: "luminaria", farol: "luminaria", faroles: "luminaria",

  banqueta: "banqueta", banquetas: "banqueta", rampa: "banqueta",
  rampas: "banqueta", guarnicion: "banqueta", guarnición: "banqueta",
  carriola: "accesibilidad", silla: "accesibilidad", ruedas: "accesibilidad",
  invidente: "accesibilidad", ciego: "accesibilidad", accesibilidad: "accesibilidad",

  arbol: "arbol", árbol: "arbol", arboles: "arbol", árboles: "arbol",
  rama: "arbol", ramas: "arbol", poda: "arbol", tronco: "arbol",
  vegetacion: "arbol", vegetación: "arbol", raices: "arbol", raíces: "arbol",
  camellon: "arbol", camellón: "arbol",

  basura: "basura", residuos: "basura", escombro: "basura", escombros: "basura",
  desechos: "basura", contenedor: "basura", contenedores: "basura",
  tiliche: "basura", llantas: "basura", colchon: "basura", colchón: "basura",
  tiradero: "basura", basurero: "basura",

  parque: "parque", parques: "parque", jardin: "parque", jardín: "parque",
  plaza: "parque", cancha: "parque", juegos: "parque", mobiliario: "parque",
  banca: "parque", bancas: "parque",

  falla: "falla", fallas: "falla", fallando: "falla", descompuesto: "falla",
  descompuesta: "falla", descompuestos: "falla", roto: "falla", rota: "falla",
  rotos: "falla", rotas: "falla", danado: "falla", dañado: "falla",
  danada: "falla", dañada: "falla", averiado: "falla", averiada: "falla",
  apagado: "falla", apagada: "falla", apagados: "falla", apagadas: "falla",
  prendido: "falla", prende: "falla", prenden: "falla", funciona: "falla",
  sirve: "falla", jala: "falla", intermitente: "falla",

  peligro: "peligro", peligroso: "peligro", peligrosa: "peligro",
  riesgo: "peligro", riesgoso: "peligro", inseguro: "peligro",
  accidente: "accidente", accidentes: "accidente", atropello: "accidente",
  atropellaron: "accidente", atropellaron_: "accidente",

  agua: "agua", fuga: "agua", inundacion: "agua", inundación: "agua",
  charco: "agua", drenaje: "agua", alcantarilla: "agua",
};

const FILLERS = [
  "este", "eh", "ehh", "ehhh", "mmm", "mmmh", "pues", "bueno", "o sea", "verdad",
  "digamos", "tipo", "sabes", "ok", "okay", "ahorita", "entonces",
];

/** Strips timestamp markers, inaudible flags and stutters from ASR text. */
export function cleanTranscription(value: string): {
  text: string;
  artifacts: string[];
} {
  const artifacts: string[] = [];
  let text = value;

  const timestamp = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
  if (text.match(timestamp)) {
    artifacts.push("marcas de tiempo");
    text = text.replace(timestamp, " ");
  }
  const markers = /\[(?:inaudible|ruido|silencio|música|musica)[^\]]*\]|\((?:inaudible|ruido)\)/gi;
  if (text.match(markers)) {
    artifacts.push("marcadores de audio");
    text = text.replace(markers, " ");
  }
  const stutter = /\b(\p{L}{2,})\s+\1\b/giu;
  if (text.match(stutter)) {
    artifacts.push("repeticiones");
    text = text.replace(stutter, "$1");
  }
  for (const filler of FILLERS) {
    const pattern = new RegExp(`(^|[\\s,.;])${filler}(?=[\\s,.;]|$)`, "giu");
    if (pattern.test(text)) {
      artifacts.push(`muletilla "${filler}"`);
      text = text.replace(pattern, "$1");
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  return { text, artifacts: [...new Set(artifacts)] };
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Canonical content tokens used for lexical comparison. */
export function comparableTokens(value: string): string[] {
  const normalized = stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const raw = normalized.split(" ").filter(Boolean);
  const tokens: string[] = [];
  for (const word of raw) {
    if (word.length < 3) continue;
    if (STOPWORDS.has(word)) continue;
    const singular = word.endsWith("es") && word.length > 5 ? word.slice(0, -2) : word;
    const token =
      CANONICAL_TERMS[word] ??
      CANONICAL_TERMS[singular] ??
      CANONICAL_TERMS[word.replace(/s$/, "")] ??
      word.replace(/s$/, "");
    if (token.length < 3) continue;
    tokens.push(token);
  }
  return tokens;
}

export interface LexicalSimilarity {
  score: number;
  shared_terms: string[];
  jaccard: number;
  containment: number;
}

/**
 * Blends Jaccard (overall overlap) with containment (one text being a
 * paraphrase of the other), then rewards shared problem terms.
 */
export function lexicalSimilarity(a: string, b: string): LexicalSimilarity {
  const left = new Set(comparableTokens(a));
  const right = new Set(comparableTokens(b));
  if (left.size === 0 || right.size === 0) {
    return { score: 0, shared_terms: [], jaccard: 0, containment: 0 };
  }
  let intersection = 0;
  const shared: string[] = [];
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
      shared.push(token);
    }
  }
  const union = left.size + right.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const containment = intersection / Math.min(left.size, right.size);

  const anchorTerms = new Set([
    "bache", "semaforo", "luminaria", "banqueta", "arbol", "basura", "parque", "falla",
  ]);
  const anchorsMatched = shared.filter((token) => anchorTerms.has(token)).length;
  const anchorBoost = anchorsMatched > 0 ? Math.min(0.2, 0.1 * anchorsMatched) : 0;

  const score = clamp01(0.45 * jaccard + 0.45 * containment + anchorBoost);
  return { score, shared_terms: shared.slice(0, 8), jaccard, containment };
}
