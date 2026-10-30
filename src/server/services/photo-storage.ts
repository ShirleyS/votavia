import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hasSupabaseDatabase, storageBucket, supabaseServiceKey, supabaseUrl } from "@/server/env";
import { DATA_DIR } from "@/server/repositories/demo-store";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/server/validation";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class PhotoValidationError extends Error {
  status = 400;
}

export function validatePhoto(file: File) {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type as (typeof ACCEPTED_PHOTO_TYPES)[number])) {
    throw new PhotoValidationError("Solo aceptamos fotografías JPG, PNG o WEBP.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new PhotoValidationError("Cada foto debe pesar menos de 5 MB.");
  }
}

export async function storePhoto(file: File): Promise<string> {
  validatePhoto(file);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = EXT[file.type] ?? "jpg";
  const name = `${randomUUID()}.${ext}`;

  if (hasSupabaseDatabase()) {
    const client = createClient(supabaseUrl(), supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.storage
      .from(storageBucket())
      .upload(name, buffer, { contentType: file.type, upsert: false });
    if (error) throw new Error(`No pudimos subir la fotografía: ${error.message}`);
    const { data } = client.storage.from(storageBucket()).getPublicUrl(name);
    return data.publicUrl;
  }

  const dir = path.join(DATA_DIR, "uploads");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return `/api/uploads/${name}`;
}
