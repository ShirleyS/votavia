#!/usr/bin/env node
/**
 * Grants a *verified* organization membership to a real user.
 *
 * Usage:
 *   node scripts/grant-organization.mjs \
 *     --email funcionaria@cuauhtemoc.gob.mx \
 *     --org alcaldia-cuauhtemoc \
 *     --org-name "Alcaldía Cuauhtémoc" \
 *     --role responder
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * This is the only supported path to government privileges: an email domain
 * alone never grants access.
 */
import { createClient } from "@supabase/supabase-js";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, value, index, list) => {
    if (value.startsWith("--")) acc.push([value.slice(2), list[index + 1]]);
    return acc;
  }, []),
);

const email = args.email;
const slug = args.org ?? "alcaldia-cuauhtemoc";
const orgName = args["org-name"] ?? "Alcaldía Cuauhtémoc";
const role = args.role ?? "responder";

if (!email) {
  console.error("Falta --email");
  process.exit(1);
}
if (!["responder", "supervisor", "admin"].includes(role)) {
  console.error("--role debe ser responder, supervisor o admin");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: users, error: userError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (userError) {
  console.error("No se pudieron listar usuarios:", userError.message);
  process.exit(1);
}
const user = users.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No existe un usuario con ${email}. Pídele que inicie sesión una vez primero.`);
  process.exit(1);
}

let { data: org } = await supabase
  .from("organizations")
  .select("id")
  .eq("slug", slug)
  .maybeSingle();

if (!org) {
  const created = await supabase
    .from("organizations")
    .insert({ slug, name: orgName, kind: "alcaldia" })
    .select("id")
    .maybeSingle();
  if (created.error) {
    console.error("No se pudo crear la organización:", created.error.message);
    process.exit(1);
  }
  org = created.data;
}

const membership = await supabase
  .from("organization_members")
  .upsert(
    {
      organization_id: org.id,
      user_id: user.id,
      role,
      scope: [],
      verified_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "organization_id,user_id" },
  )
  .select("id")
  .maybeSingle();

if (membership.error) {
  console.error("No se pudo otorgar el permiso:", membership.error.message);
  process.exit(1);
}

console.log(`Listo: ${email} es "${role}" en ${orgName} (${slug}).`);
