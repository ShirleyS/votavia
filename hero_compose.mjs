import sharp from "sharp";
const W = 2000, H = Math.round(W * 5.625 / 10);
const photo = await sharp("/tmp/votavia_render/img1.png").resize(W, H, { fit: "cover", position: "centre" }).toBuffer();
const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#061231" stop-opacity="0.95"/>
      <stop offset="42%" stop-color="#061231" stop-opacity="0.86"/>
      <stop offset="72%" stop-color="#061231" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#061231" stop-opacity="0.22"/>
    </linearGradient>
    <radialGradient id="v" cx="0.5" cy="0.5" r="0.75">
      <stop offset="60%" stop-color="#061231" stop-opacity="0"/>
      <stop offset="100%" stop-color="#061231" stop-opacity="0.62"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#v)"/>
</svg>`);
await sharp(photo).composite([{ input: overlay }]).png().toFile("/tmp/deck_assets/hero_cover.png");
console.log("hero", W, H);
