/* Ajudes per a les funcions de servidor (Vercel): client d'administració de Supabase i comprovació de qui crida. */
import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const isCoordRole = (r) => r === "coord_nat" || r === "coord_gen";

/** Torna el perfil de qui fa la petició (a partir del token de sessió) o null. */
export async function getCaller(req, admin) {
  const h = String(req.headers.authorization || "");
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: p } = await admin.from("profiles").select("id, nom, rol, actiu").eq("id", data.user.id).maybeSingle();
  return p && p.actiu ? p : null;
}

export const LOGIN_DOMAIN = "usuaris.aquacurs.com";
export function loginFor(nom) {
  const slug = String(nom || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
  return `${slug || "usuari"}@${LOGIN_DOMAIN}`;
}
