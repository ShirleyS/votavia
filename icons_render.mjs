import fs from "node:fs";
import sharp from "sharp";

const ICONS = {
  "building": "building-2",
  "wrench": "wrench",
  "alert": "triangle-alert",
  "users": "users",
  "clock": "clock",
  "pin": "map-pin",
  "thumb": "thumbs-up",
  "check": "check",
  "shield": "shield-check",
  "camera": "camera",
  "file": "file-text",
  "arrow": "arrow-right",
  "plus": "plus",
  "lock": "lock",
  "circlecheck": "circle-check",
  "ban": "ban",
  "clipboard": "clipboard-check",
  "eye": "eye",
  "search": "search",
  "bell": "bell",
  "user": "circle-user-round",
  "layers": "layers",
  "route": "route",
  "zap": "zap",
  "trend": "trending-up",
  "calendar": "calendar-days",
  "flag": "flag",
  "cone": "traffic-cone",
  "bulb": "lightbulb",
  "tree": "trees",
  "trash": "trash-2",
  "droplet": "droplet",
  "hammer": "hammer",
  "kanban": "kanban",
  "map": "map",
  "images": "images",
  "send": "send",
  "globe": "globe",
  "star": "star",
  "code": "code-xml",
  "database": "database",
  "phone": "message-circle",
  "sparkle": "sparkles",
  "info": "info",
  "chevron": "chevron-right",
};

const COLORS = {
  blue: "#2454E0",
  blueDark: "#17399F",
  white: "#FFFFFF",
  ink: "#111C33",
  body: "#5B6B85",
  muted: "#8A97AC",
  red: "#E24B5E",
  amber: "#C07A12",
  violet: "#6B4DE0",
  teal: "#1A9E93",
  green: "#2E9E6B",
  cream: "#FBF9F4",
};

const outDir = "/tmp/deck_assets/icons";
fs.mkdirSync(outDir, { recursive: true });

const toAttr = (o) =>
  Object.entries(o)
    .filter(([k]) => k !== "key")
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

for (const [alias, file] of Object.entries(ICONS)) {
  const mod = await import(`lucide-react/dist/esm/icons/${file}.js`);
  const nodes = mod.__iconNode;
  const children = nodes
    .map(([tag, attrs]) => `<${tag} ${toAttr(attrs)} />`)
    .join("");
  for (const [cname, hex] of Object.entries(COLORS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="${hex}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`${outDir}/${alias}-${cname}.png`);
  }
}
console.log("done", fs.readdirSync(outDir).length);
