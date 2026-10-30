import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/server/repositories/demo-store";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-z0-9-]+\.(jpg|png|webp)$/i.test(name)) {
    return new Response("No encontrado", { status: 404 });
  }
  try {
    const file = await fs.readFile(path.join(DATA_DIR, "uploads", name));
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": TYPES[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
