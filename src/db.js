/* ============================================================
   Connexió amb Supabase: sessió, càrrega de dades i sincronització.
   L'app continua treballant amb la mateixa forma de dades que abans
   (students[], evals{ "25-26:id": {...} }); aquest mòdul compara cada
   canvi amb l'estat anterior i el desa a la base de dades.
   ============================================================ */
import { createClient } from "@supabase/supabase-js";

export const SEASON = "26-27";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(URL && KEY);
export const supabase = supabaseConfigured
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "aquacurs-auth" } })
  : null;

/* ---------------- Sessió ---------------- */
export async function fetchLoginList() {
  const { data, error } = await supabase.rpc("login_list");
  if (error) throw new Error("No s'ha pogut carregar la llista d'usuaris. Comprova la connexió.");
  return data || [];
}
export async function signIn(login, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: login, password });
  if (error) throw new Error(/invalid/i.test(error.message) ? "El codi no és correcte." : error.message);
  return data.session;
}
export async function signOut() { try { await supabase.auth.signOut(); } catch {} }
export async function changePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(/same/i.test(error.message) ? "El codi nou ha de ser diferent de l'actual." : error.message);
}
export async function fetchMyProfile(uid) {
  const { data, error } = await supabase.from("profiles").select("id, nom, rol, login, actiu").eq("id", uid).maybeSingle();
  if (error) throw new Error("No s'ha pogut carregar el teu perfil.");
  return data;
}
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

/* ---------------- Conversió fila ⇄ app ---------------- */
export const rowToStudent = (r) => ({
  id: r.id, nom: r.nom, email: r.email || "", naixement: r.naixement || "", grupId: r.grup_id,
  dies: r.dies && r.dies.length ? r.dies : null,            // null = tots els dies del grup
  monitorNotes: r.monitor_notes || null,                    // qui li posa les notes (null = monitor del grup)
  observacions: r.observacions || "",
  ...(r.baixa ? { baixa: r.baixa } : {}),
});
const studentToRow = (s, withId = true) => ({
  ...(withId ? { id: s.id } : {}),
  nom: s.nom, email: s.email || "", naixement: s.naixement || null, grup_id: s.grupId ?? null, baixa: s.baixa || null,
  dies: s.dies && s.dies.length ? s.dies : null, monitor_notes: s.monitorNotes || null, observacions: s.observacions || "",
});
export const rowToGroup = (g) => ({
  id: g.id, nivell: g.nivell, dia: g.dia, hora: g.hora, monitor: g.monitor || "",
  codi: g.codi || "", monitors: (g.monitors && g.monitors.length ? g.monitors : (g.monitor ? [g.monitor] : [])),
  capacitat: g.capacitat ?? null, diesSetmana: g.dies_setmana || [], horaInici: g.hora_inici || "", horaFi: g.hora_fi || "",
});
const groupToRow = (g) => ({
  id: g.id, nivell: g.nivell, dia: g.dia || "", hora: g.hora || "",
  monitor: (g.monitors && g.monitors[0]) || g.monitor || null,
  monitors: g.monitors && g.monitors.length ? g.monitors : (g.monitor ? [g.monitor] : []),
  codi: g.codi || "", capacitat: g.capacitat ?? null, dies_setmana: g.diesSetmana || [],
  hora_inici: g.horaInici || "", hora_fi: g.horaFi || "",
});
export const evalKey = (sid) => `${SEASON}:${sid}`;
const rowToEval = (r) => {
  const e = { scores: r.scores || {}, monitor: r.monitor || "" };
  if (r.override) e.override = r.override;
  if (r.comment !== null && r.comment !== undefined) e.comment = r.comment;
  if (r.ready) { e.ready = true; e.readyAt = r.ready_at; }
  if (r.sent_at) { e.sentAt = r.sent_at; e.sentTo = r.sent_to || ""; }
  return e;
};
const evalToRow = (sid, e) => ({
  season: SEASON, student_id: sid,
  scores: e.scores || {}, override: e.override || null,
  comment: "comment" in e ? (e.comment ?? "") : null,
  ready: !!e.ready, ready_at: e.ready ? (e.readyAt || new Date().toISOString()) : null,
  sent_at: e.sentAt || null, sent_to: e.sentTo || null, monitor: e.monitor || null,
});

async function selectAll(table, columns, build) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (build) q = build(q);
    const { data, error } = await q;
    if (error) throw new Error(`No s'han pogut carregar les dades (${table}).`);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/** Carrega grups, alumnes, avaluacions i (per a coordinació) la llista de perfils. */
export async function fetchAll(rol) {
  const isCoord = rol === "coord_nat" || rol === "coord_gen";
  const isRecepcio = rol === "recepcio";
  const [groups, students, evals, profiles, extras] = await Promise.all([
    selectAll("groups", "id, nivell, dia, hora, monitor, codi, monitors, capacitat, dies_setmana, hora_inici, hora_fi", (q) => q.order("id")),
    selectAll("students", "id, nom, email, naixement, grup_id, baixa, dies, monitor_notes, observacions", (q) => q.order("id")),
    isRecepcio ? Promise.resolve([]) : selectAll("evaluations", "student_id, scores, override, comment, ready, ready_at, sent_at, sent_to, monitor", (q) => q.eq("season", SEASON)),
    isCoord ? selectAll("profiles", "id, nom, rol, login, actiu", (q) => q.order("nom")) : Promise.resolve([]),
    selectAll("inscripcions_extra", "student_id, grup_id, dies"),
  ]);
  const ev = {}; evals.forEach((r) => { ev[evalKey(r.student_id)] = rowToEval(r); });
  return {
    groups: groups.map(rowToGroup),
    students: students.map(rowToStudent),
    evals: ev,
    profiles,
    extras: extras.map((e) => ({ studentId: e.student_id, grupId: e.grup_id, dies: e.dies && e.dies.length ? e.dies : null })),
  };
}

/* ---------------- Inscripcions extra (alumne a dos grups) ---------------- */
export async function saveExtra(e) {
  const { error } = await supabase.from("inscripcions_extra").upsert({ student_id: e.studentId, grup_id: e.grupId, dies: e.dies && e.dies.length ? e.dies : null });
  if (error) throw new Error("No s'ha pogut desar el segon grup: " + error.message);
}
export async function deleteExtra(studentId, grupId) {
  const { error } = await supabase.from("inscripcions_extra").delete().eq("student_id", studentId).eq("grup_id", grupId);
  if (error) throw new Error("No s'ha pogut llevar el segon grup: " + error.message);
}

/* ---------------- Llista d'espera ---------------- */
export async function fetchEspera() {
  const { data, error } = await supabase.from("llista_espera").select("*").order("created_at");
  if (error) throw new Error("No s'ha pogut carregar la llista d'espera.");
  return data || [];
}
export async function addEspera(row) {
  const { data, error } = await supabase.from("llista_espera").insert(row).select("*").single();
  if (error) throw new Error("No s'ha pogut afegir a la llista d'espera: " + error.message);
  return data;
}
export async function deleteEspera(id) {
  const { error } = await supabase.from("llista_espera").delete().eq("id", id);
  if (error) throw new Error("No s'ha pogut llevar de la llista d'espera: " + error.message);
}

/* ---------------- Assistència ---------------- */
export async function fetchLlistaGrup(gid) {
  const { data, error } = await supabase.rpc("llista_grup", { gid });
  if (error) throw new Error("No s'ha pogut carregar la llista del grup.");
  return (data || []).map((r) => ({ id: r.student_id, nom: r.nom, dies: r.dies && r.dies.length ? r.dies : null, extra: r.extra, baixa: r.baixa }));
}
/** Sessions validades (data + grup) entre dues dates (YYYY-MM-DD). */
export async function fetchSessions(from, to) {
  const { data, error } = await supabase.from("assistencia_sessions").select("data, grup_id, validat_per, validat_at, corregit_per, corregit_at").gte("data", from).lte("data", to);
  if (error) throw new Error("No s'ha pogut carregar l'assistència.");
  return data || [];
}
export async function fetchAssistencia(gid, dia) {
  const { data, error } = await supabase.from("assistencia").select("student_id, present").eq("grup_id", gid).eq("data", dia);
  if (error) throw new Error("No s'ha pogut carregar l'assistència.");
  return data || [];
}
export async function fetchAssistenciaRang(from, to) {
  const out = []; const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await supabase.from("assistencia").select("data, grup_id, student_id, present").gte("data", from).lte("data", to).range(i, i + PAGE - 1);
    if (error) throw new Error("No s'ha pogut carregar l'assistència.");
    out.push(...data); if (data.length < PAGE) break;
  }
  return out;
}
export async function validarAssistencia(gid, dia, presents, absents) {
  const { error } = await supabase.rpc("validar_assistencia", { gid, dia, presents, absents });
  if (error) throw new Error(error.message || "No s'ha pogut validar l'assistència.");
}

/* ---------------- Grups (coordinació) ---------------- */
export async function saveGroup(g) {
  const { error } = await supabase.from("groups").upsert(groupToRow(g));
  if (error) throw new Error("No s'ha pogut desar el grup: " + error.message);
}
export async function saveGroups(list) {
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500).map(groupToRow);
    const { error } = await supabase.from("groups").upsert(chunk);
    if (error) throw new Error("No s'han pogut desar els grups: " + error.message);
  }
}

/* ---------------- Sincronització automàtica ---------------- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const studentFields = (s) => [s.nom, s.email || "", s.naixement || "", s.grupId ?? null, s.baixa || null, s.dies || null, s.monitorNotes || null, s.observacions || ""];

// canManage = coordinació o recepció (poden modificar alumnes). Els monitors només envien
// avisos de baixa i el monitor de notes (amb funcions del servidor).
export function createSync({ canManage: isCoord, onStatus, onStudentIdAssigned }) {
  const pendingStudentUpserts = new Map(); // id -> student
  const pendingStudentDeletes = new Set();
  const pendingBaixa = new Map();          // id -> baixa|null (monitors)
  const pendingEvals = new Map();          // sid -> eval
  const pendingNotesMon = new Map();       // id -> nom|null (monitors)
  const pendingInserts = [];               // alumnes nous (id temporal negatiu)
  let timer = null, busy = false, failures = 0, lastError = "";

  const pendingCount = () => pendingStudentUpserts.size + pendingStudentDeletes.size + pendingBaixa.size + pendingNotesMon.size + pendingEvals.size + pendingInserts.length;
  const report = (state) => onStatus && onStatus({ state, pending: pendingCount(), error: lastError });
  const schedule = (ms = 500) => { clearTimeout(timer); timer = setTimeout(flush, ms); report("pending"); };

  async function flush() {
    if (busy) { schedule(300); return; }
    if (!pendingCount()) { report("saved"); return; }
    busy = true; report("saving");
    try {
      // 1) alumnes nous creats a mà
      while (pendingInserts.length) {
        const s = pendingInserts[0];
        const { data, error } = await supabase.from("students").insert(studentToRow(s, false)).select("id").single();
        if (error) throw error;
        pendingInserts.shift();
        const ev = pendingEvals.get(s.id); pendingEvals.delete(s.id);
        onStudentIdAssigned && onStudentIdAssigned(s.id, data.id);
        if (ev) pendingEvals.set(data.id, ev);
      }
      // 2) esborrats
      if (pendingStudentDeletes.size) {
        const ids = [...pendingStudentDeletes];
        const { error } = await supabase.from("students").delete().in("id", ids);
        if (error) throw error;
        ids.forEach((id) => pendingStudentDeletes.delete(id));
      }
      // 3) alumnes modificats o importats
      if (pendingStudentUpserts.size) {
        const rows = [...pendingStudentUpserts.values()].map((s) => studentToRow(s));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from("students").upsert(rows.slice(i, i + 500));
          if (error) throw error;
        }
        rows.forEach((r) => pendingStudentUpserts.delete(r.id));
      }
      // 4) avisos de baixa (monitors)
      for (const [id, info] of [...pendingBaixa]) {
        const { error } = await supabase.rpc("set_baixa", { sid: id, info });
        if (error) throw error;
        pendingBaixa.delete(id);
      }
      // 4b) monitor de notes (monitors en grups amb dos monitors)
      for (const [id, nom] of [...pendingNotesMon]) {
        const { error } = await supabase.rpc("set_monitor_notes", { sid: id, monitor_nom: nom });
        if (error) throw error;
        pendingNotesMon.delete(id);
      }
      // 5) avaluacions
      if (pendingEvals.size) {
        const entries = [...pendingEvals].filter(([sid]) => sid > 0);
        const rows = entries.map(([sid, e]) => evalToRow(sid, e));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from("evaluations").upsert(rows.slice(i, i + 500), { onConflict: "season,student_id" });
          if (error) throw error;
        }
        entries.forEach(([sid, e]) => { if (pendingEvals.get(sid) === e) pendingEvals.delete(sid); });
      }
      failures = 0; lastError = "";
      busy = false;
      if (pendingCount()) schedule(200); else report("saved");
    } catch (err) {
      busy = false; failures++;
      lastError = err?.message || "Error de connexió";
      const permanent = err && (err.code === "42501" || err.code === "23503" || err.code === "P0001" || /row-level security/i.test(err.message || ""));
      if (permanent || failures >= 5) {
        // No té sentit reintentar: es descarta i s'avisa
        pendingStudentUpserts.clear(); pendingStudentDeletes.clear(); pendingBaixa.clear(); pendingNotesMon.clear(); pendingEvals.clear(); pendingInserts.length = 0;
        failures = 0;
        report("error");
      } else {
        report("retrying");
        clearTimeout(timer); timer = setTimeout(flush, 3000 * failures);
      }
    }
  }

  return {
    pendingCount,
    flushNow: () => { clearTimeout(timer); return flush(); },
    studentsChanged(prev, next) {
      const P = new Map(prev.map((s) => [s.id, s])); const N = new Map(next.map((s) => [s.id, s]));
      for (const [id, s] of N) {
        const old = P.get(id);
        if (!old) {
          if (id < 0) pendingInserts.push(s);
          else if (isCoord) pendingStudentUpserts.set(id, s);
        } else if (!same(studentFields(old), studentFields(s))) {
          if (isCoord) pendingStudentUpserts.set(id, s);
          else {
            if (!same(old.baixa || null, s.baixa || null)) pendingBaixa.set(id, s.baixa || null);
            if ((old.monitorNotes || null) !== (s.monitorNotes || null)) pendingNotesMon.set(id, s.monitorNotes || null);
          }
        }
      }
      for (const id of P.keys()) if (!N.has(id) && id > 0 && isCoord) { pendingStudentDeletes.add(id); pendingStudentUpserts.delete(id); pendingEvals.delete(id); }
      if (pendingCount()) schedule(300);
    },
    evalsChanged(prev, next) {
      for (const k of Object.keys(next)) {
        if (prev[k] !== next[k] && !same(prev[k], next[k])) {
          const sid = +k.split(":")[1];
          if (Number.isFinite(sid)) pendingEvals.set(sid, next[k]);
        }
      }
      if (pendingCount()) schedule(600);
    },
  };
}

/* ---------------- Gestió d'usuaris (via funció de servidor) ---------------- */
export async function adminUsers(action, payload) {
  const token = await getAccessToken();
  let res;
  try {
    res = await fetch("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch { throw new Error("Sense connexió amb el servidor."); }
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `Error del servidor (${res.status})`);
  return data;
}
