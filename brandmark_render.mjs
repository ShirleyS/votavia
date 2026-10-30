import fs from "node:fs";
import sharp from "sharp";
const petals = [
  { a: -80, f: "#1F5BD8" },
  { a: -54, f: "#2F8FD0" },
  { a: -27, f: "#2FAE8B" },
  { a: 0, f: "#7FBE45" },
  { a: 27, f: "#F5BE2A" },
  { a: 54, f: "#F2803A" },
  { a: 80, f: "#E8506B" },
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 44 44">
  <g transform="translate(22 21)">
    ${petals
      .map(
        (p) =>
          `<ellipse cx="0" cy="-12.4" rx="4.7" ry="9.4" fill="${p.f}" transform="rotate(${p.a})"/>`,
      )
      .join("")}
    <path d="M-7.6 1.2 2 10.6 15.4 -8.4" fill="none" stroke="#ffffff" stroke-width="7.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-7.6 1.2 2 10.6 15.4 -8.4" fill="none" stroke="#1F5BD8" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
fs.mkdirSync("/tmp/deck_assets", { recursive: true });
await sharp(Buffer.from(svg)).png().toFile("/tmp/deck_assets/brandmark.png");
// white variant for dark hero
const svgW = svg.replace(/fill="#1F5BD8"/g, 'fill="#FFFFFF"').replace(/stroke="#1F5BD8"/g, 'stroke="#FFFFFF"');
fs.writeFileSync("/tmp/deck_assets/brandmark-white.svg", svgW);
// clean photo for cover
await sharp("/tmp/votavia_render/img1.png").toFile("/tmp/deck_assets/hero.png");
console.log("ok");
