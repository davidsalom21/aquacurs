/* ============================================================
   Gestió d'usuaris d'AquaCurs (només coordinació).
   Accions: create, reset, update, delete, i bootstrap (crear el primer
   compte de coordinació quan encara no n'hi ha cap; demana el SEND_KEY).
   Variables d'entorn: VITE_SUPABASE_URL, SUPABASE_SECRET_KEY, SEND_KEY.
   ============================================================ */
import { timingSafeEqual } from "node:crypto";
import { adminClient, getCaller, isCoordRole, loginFor } from "../lib/supa.js";

const ROLES = ["monitor", "coord_nat", "coord_gen", "recepcio"];
const clean = (s, n = 60) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, n);
function sameKey(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

async function createAccount(admin, nom, rol, password) {
  if (!nom || nom.length < 2) return { status: 400, error: "Escriu un nom." };
  if (!ROLES.includes(rol)) return { status: 400, error: "Rol no vàlid." };
  if (String(password || "").length < 6) return { status: 400, error: "El codi ha de tindre almenys 6 caràcters." };
  const { data: exists } = await admin.from("profiles").select("id").ilike("nom", nom).maybeSingle();
  if (exists) return { status: 409, error: `Ja hi ha un usuari amb el nom «${nom}».` };
  const login = loginFor(nom);
  const { data: created, error } = await admin.auth.admin.createUser({ email: login, password, email_confirm: true });
  if (error) return { status: 400, error: /already/i.test(error.message) ? `Ja existeix un compte per a «${nom}».` : error.message };
  const { error: pErr } = await admin.from("profiles").insert({ id: created.user.id, nom, rol, login });
  if (pErr) { await admin.auth.admin.deleteUser(created.user.id); return { status: 400, error: pErr.message }; }
  return { status: 200, data: { ok: true, id: created.user.id, nom, rol, login } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Mètode no permés." }); }
  const admin = adminClient();
  if (!admin) return res.status(500).json({ error: "El servidor no està configurat (falten VITE_SUPABASE_URL o SUPABASE_SECRET_KEY a Vercel)." });

  const b = req.body || {};
  const action = String(b.action || "");

  // Primer compte de coordinació
  if (action === "bootstrap") {
    const setupKey = process.env.SEND_KEY;
    if (!setupKey) return res.status(500).json({ error: "Falta el SEND_KEY a Vercel." });
    if (!sameKey(b.setupKey, setupKey)) return res.status(401).json({ error: "El codi de configuració no és correcte." });
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).in("rol", ["coord_nat", "coord_gen"]);
    if (count > 0) return res.status(409).json({ error: "Ja hi ha comptes de coordinació. Entra amb un d'ells." });
    const r = await createAccount(admin, clean(b.nom), (b.rol === "coord_nat" || b.rol === "coord_gen") ? b.rol : "coord_nat", b.password);
    return res.status(r.status).json(r.data || { error: r.error });
  }

  const caller = await getCaller(req, admin);
  if (!caller) return res.status(401).json({ error: "La sessió ha caducat. Torna a entrar." });
  if (!isCoordRole(caller.rol)) return res.status(403).json({ error: "Només coordinació pot gestionar usuaris." });

  if (action === "create") {
    const r = await createAccount(admin, clean(b.nom), b.rol, b.password);
    return res.status(r.status).json(r.data || { error: r.error });
  }

  const id = String(b.id || "");
  const { data: target } = await admin.from("profiles").select("id, nom, rol").eq("id", id).maybeSingle();
  if (!target) return res.status(404).json({ error: "Usuari no trobat." });

  if (action === "reset") {
    if (String(b.password || "").length < 6) return res.status(400).json({ error: "El codi ha de tindre almenys 6 caràcters." });
    const { error } = await admin.auth.admin.updateUserById(id, { password: b.password });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (action === "update") {
    const patch = {};
    if (b.rol !== undefined) { if (!ROLES.includes(b.rol)) return res.status(400).json({ error: "Rol no vàlid." }); patch.rol = b.rol; }
    if (b.actiu !== undefined) patch.actiu = !!b.actiu;
    if (id === caller.id && (patch.actiu === false || (patch.rol && !isCoordRole(patch.rol)))) {
      return res.status(400).json({ error: "No et pots desactivar ni llevar-te el rol de coordinació a tu mateix." });
    }
    const { error } = await admin.from("profiles").update(patch).eq("id", id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (action === "delete") {
    if (id === caller.id) return res.status(400).json({ error: "No et pots esborrar a tu mateix." });
    const { error } = await admin.auth.admin.deleteUser(id); // el perfil s'esborra en cascada
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Acció desconeguda." });
}
