/* ============================================================
   Metodologia: llibre per nivells, calendari d'activitats (30 sessions),
   sessió del dia i generador de sessions (sense IA: combina el banc d'exercicis
   seguint l'estructura de sessió de cada tipus de grup).
   El contingut és privat i es carrega de Supabase (taula metodologia).
   ============================================================ */
import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, ChevronLeft, Shuffle, RefreshCw, Loader2, Sparkles, Printer, ListChecks } from "lucide-react";
import { fetchMetodologia } from "./db.js";

// Nivells de l'app → nivells dels documents i tipus de sessió
export const APP_LEVEL_MAP = {
  "Nadons Pares": { sub: ["nadons"], tipus: "nadons" },
  "Nadons Alt": { sub: ["nadons_alt"], tipus: "petita" },
  "Infants Baix": { sub: ["infants_baix"], tipus: "petita" },
  "Infants Mig-Alt": { sub: ["infants_mig", "infants_alt"], tipus: "gran" },
  "Xiquets Iniciació-Mitjà": { sub: ["xiq_iniciacio", "xiq_mitja"], tipus: "gran" },
  "Xiquets Mitjà-Perfeccionament": { sub: ["xiq_mitja", "xiq_perfecc"], tipus: "perf" },
};
const SUB_ORDER = ["nadons", "nadons_alt", "infants_baix", "infants_mig", "infants_alt", "xiq_iniciacio", "xiq_mitja", "xiq_perfecc"];
const TRIM_OF = (n) => (n <= 10 ? "1r trimestre" : n <= 21 ? "2n trimestre" : "3r trimestre");

export function useMetodologia() {
  const [state, setState] = useState({ data: null, err: "" });
  useEffect(() => { let ok = true; fetchMetodologia().then((d) => ok && setState({ data: d, err: "" })).catch((e) => ok && setState({ data: null, err: e.message })); return () => { ok = false; }; }, []);
  return state;
}
const detallDe = (lvl, n) => (lvl.sessions || []).find((s) => (s.n || []).includes(n));

/* ---------------- Generador ---------------- */
const STOP = new Set(["de", "del", "la", "el", "les", "els", "i", "a", "al", "amb", "en", "per", "dels", "sense", "segons", "una", "un"]);
const keywords = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 6));
function scoreFor(item, kws) { if (!kws.length) return 0; const t = keywords(item.text); return kws.filter((k) => t.includes(k)).length; }
function pick(list, n, kws, exclude = new Set()) {
  const pool = list.filter((x) => !exclude.has(x.id));
  // Barreja aleatòria, però primer els que encaixen amb l'objectiu
  const scored = pool.map((x) => ({ x, s: scoreFor(x, kws) + Math.random() * 0.9 })).sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map((o) => o.x);
}
export function generarSessio(data, appLevel, material, objectiu) {
  const map = APP_LEVEL_MAP[appLevel]; if (!map) return null;
  const estr = data.estructura[map.tipus];
  const mat = new Set(material);
  const okMat = (it) => it.material.every((m) => mat.has(m));
  const forLevel = data.banc.filter((it) => it.nivells.some((n) => map.sub.includes(n)));
  const kws = keywords(objectiu);
  const used = new Set();
  const parts = estr.map(([part, titol, n]) => {
    let cands = forLevel.filter((it) => it.part === part && okMat(it));
    if (!cands.length && part === "joc") cands = forLevel.filter((it) => it.part === "principal" && okMat(it) && /jug|joc|recoll/i.test(it.text));
    const items = pick(cands, n, kws, used); items.forEach((i) => used.add(i.id));
    return { part, titol, n, items, cands: cands.map((c) => c.id) };
  });
  return { appLevel, material: [...mat], objectiu, parts };
}

function MaterialPicker({ data, value, onChange }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="flex gap-1.5 flex-wrap">
      {Object.entries(data.material).map(([k, label]) => {
        const on = value.includes(k);
        return <button key={k} type="button" onClick={() => toggle(k)} className="sn-pill" style={{ cursor: "pointer", border: `1px solid ${on ? "#12B0A0" : "var(--line)"}`, background: on ? "#12B0A01f" : "#fff", color: on ? "var(--deep)" : "var(--muted)", fontSize: ".72rem", padding: ".3rem .65rem" }}>{on ? "✓ " : ""}{label}</button>;
      })}
    </div>
  );
}

export function Generador({ data, initialLevel, initialMaterial, initialObjectiu, compact, autoGen }) {
  const [level, setLevel] = useState(initialLevel || "Nadons Alt");
  const [mat, setMat] = useState(initialMaterial || []);
  const [obj, setObj] = useState(initialObjectiu || "");
  const [ses, setSes] = useState(null);
  const objectius = useMemo(() => {
    const m = APP_LEVEL_MAP[level]; if (!m) return [];
    return [...new Set(m.sub.flatMap((s) => (data.nivells[s]?.calendari || []).map((c) => c.objectiu)).filter((o) => o && !/cloenda|no inclosa/i.test(o)))];
  }, [data, level]);
  const gen = () => setSes(generarSessio(data, level, mat, obj));
  const swap = (pi, ii) => setSes((s) => {
    const p = s.parts[pi]; const usedIds = new Set(s.parts.flatMap((x) => x.items.map((i) => i.id)));
    const pool = data.banc.filter((it) => p.cands.includes(it.id) && !usedIds.has(it.id));
    if (!pool.length) return s;
    const nx = pool[Math.floor(Math.random() * pool.length)];
    const parts = s.parts.map((x, k) => (k !== pi ? x : { ...x, items: x.items.map((it, j) => (j === ii ? nx : it)) }));
    return { ...s, parts };
  });
  useEffect(() => { if (autoGen && initialLevel) setSes(generarSessio(data, initialLevel, initialMaterial || [], initialObjectiu || "")); }, []); // eslint-disable-line
  return (
    <div>
      <div className="sn-card sn-shadow no-print" style={{ background: "#fff", padding: 16, marginBottom: 12 }}>
        {!compact && <div className="sn-display flex items-center gap-2" style={{ fontWeight: 700, marginBottom: 10 }}><Sparkles size={17} /> Crear una sessió</div>}
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
          <label style={{ fontSize: ".74rem", color: "var(--muted)" }}>Nivell
            <select className="sn-input" value={level} onChange={(e) => { setLevel(e.target.value); setObj(""); }}>
              {Object.keys(APP_LEVEL_MAP).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label style={{ fontSize: ".74rem", color: "var(--muted)" }}>Objectiu (opcional)
            <input className="sn-input" list="meto-obj" value={obj} onChange={(e) => setObj(e.target.value)} placeholder="P. ex.: desplaçaments dorsals" />
            <datalist id="meto-obj">{objectius.map((o) => <option key={o} value={o} />)}</datalist>
          </label>
        </div>
        <div style={{ fontSize: ".74rem", color: "var(--muted)", margin: "10px 0 6px" }}>Material que vas a fer servir {mat.length === 0 && <span>(si no en tries cap, només eixiran exercicis sense material)</span>}</div>
        <MaterialPicker data={data} value={mat} onChange={setMat} />
        <div className="flex gap-2 flex-wrap" style={{ marginTop: 12 }}>
          <button className="sn-btn sn-btn-primary" onClick={gen}><Shuffle size={16} /> {ses ? "Generar una altra" : "Generar sessió"}</button>
          {ses && <button className="sn-btn sn-btn-ghost" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>}
        </div>
      </div>
      {ses && (
        <div id="print-area" className="sn-card sn-shadow" style={{ background: "#fff", padding: 16 }}>
          <div className="sn-display" style={{ fontWeight: 800, fontSize: "1.05rem" }}>Sessió · {ses.appLevel}</div>
          <div style={{ fontSize: ".78rem", color: "var(--muted)", marginBottom: 8 }}>
            {ses.objectiu ? <>Objectiu: <b>{ses.objectiu}</b> · </> : null}Material: {ses.material.length ? ses.material.map((m) => data.material[m]).join(", ") : "sense material"}
          </div>
          {ses.parts.map((p, pi) => (
            <div key={pi} style={{ marginTop: 12 }}>
              <div style={{ fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, color: "#12B0A0" }}>{p.titol}</div>
              {p.items.length === 0 && <div style={{ fontSize: ".84rem", color: "var(--muted)", padding: "6px 0" }}>No hi ha cap exercici d'aquesta part amb el material triat. Prova d'afegir-ne.</div>}
              {p.items.map((it, ii) => (
                <div key={it.id} className="flex items-start justify-between gap-2" style={{ padding: "8px 0", borderTop: ii ? "1px solid var(--surface)" : "none" }}>
                  <div style={{ fontSize: ".9rem", lineHeight: 1.45 }}>
                    {it.text}
                    <div style={{ fontSize: ".7rem", color: "var(--muted)", marginTop: 2 }}>{it.material.length ? it.material.map((m) => data.material[m]).join(", ") : "Sense material"}{it.origen !== "propi" ? ` · ${it.origen}` : ""}</div>
                  </div>
                  <button className="sn-btn sn-btn-ghost no-print" title="Canviar aquest exercici" style={{ padding: ".35rem .5rem", flexShrink: 0 }} onClick={() => swap(pi, ii)}><RefreshCw size={14} /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Sessió del dia (al calendari) ---------------- */
export function SessioDelDia({ appLevel, numero }) {
  const { data, err } = useMetodologia();
  const [open, setOpen] = useState(false);
  const [gen, setGen] = useState(null);
  const map = APP_LEVEL_MAP[appLevel];
  if (!map || !numero) return null;
  if (err) return <div className="sn-card" style={{ background: "#fff", padding: 12, fontSize: ".8rem", color: "var(--muted)", marginBottom: 12 }}>{err}</div>;
  if (!data) return <div className="sn-card" style={{ background: "#fff", padding: 12, fontSize: ".8rem", color: "var(--muted)", marginBottom: 12 }}><Loader2 size={14} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />Carregant la sessió…</div>;
  const subs = map.sub.filter((s) => data.nivells[s]);
  const matKeys = (txt) => { const t = String(txt || "").toLowerCase(); return Object.keys(data.material).filter((k) => ({ xurro: /xurro/, cinturo: /cintur/, figures: /figur/, matalafeta: /matalafet/, colxoneta: /matal[àa]s|colxonet/, taula: /taul|tabl/, pull: /pull/, disc: /disc/, pilota: /pilot|bal[oó]/, aros: /\baro/, submergible: /submergib/, aletes: /alet/, joguets: /joguet/ }[k] || /$^/).test(t)); };
  return (
    <div className="sn-card sn-shadow" style={{ background: "#fff", padding: 14, marginBottom: 12 }}>
      <div className="flex items-center justify-between gap-2" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <div className="sn-display flex items-center gap-2" style={{ fontWeight: 700, fontSize: ".95rem" }}><BookOpen size={16} /> Sessió {numero} del calendari d'activitats</div>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </div>
      {subs.map((s) => {
        const lvl = data.nivells[s]; const c = lvl.calendari[numero - 1]; const d = detallDe(lvl, numero);
        return (
          <div key={s} style={{ marginTop: 8, fontSize: ".84rem" }}>
            {subs.length > 1 && <div style={{ fontWeight: 700, color: "#12B0A0", fontSize: ".74rem", textTransform: "uppercase", letterSpacing: ".06em" }}>{lvl.nom}</div>}
            <div><b>Objectiu:</b> {c?.objectiu || "—"}</div>
            {c?.material && <div style={{ color: "var(--muted)" }}><b style={{ color: "var(--ink)" }}>Material:</b> {c.material}</div>}
            {open && d && (
              <ol style={{ margin: "6px 0 0 18px", lineHeight: 1.45 }}>
                {d.exercicis.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}
                {d.nota && <div style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 4 }}>Nota: {d.nota}</div>}
              </ol>
            )}
            {open && !d && <div style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 4 }}>Aquesta sessió no està desenvolupada al llibre. Pots generar-ne una amb el seu objectiu i material.</div>}
            {open && <button className="sn-btn sn-btn-ghost" style={{ marginTop: 8, padding: ".4rem .7rem", fontSize: ".8rem" }} onClick={() => setGen({ obj: c?.objectiu || "", mat: matKeys(c?.material) })}><Sparkles size={14} /> Generar una sessió amb aquest objectiu</button>}
          </div>
        );
      })}
      {open && gen && <div style={{ marginTop: 12 }}><Generador key={gen.obj} data={data} compact autoGen initialLevel={appLevel} initialMaterial={gen.mat} initialObjectiu={gen.obj} /></div>}
    </div>
  );
}

/* ---------------- Pestanya Metodologia ---------------- */
export function Metodologia({ defaultLevel }) {
  const { data, err } = useMetodologia();
  const [view, setView] = useState("llibre");
  const [sub, setSub] = useState(() => (defaultLevel && APP_LEVEL_MAP[defaultLevel]?.sub[0]) || "nadons");
  const [openSes, setOpenSes] = useState(null);
  if (err) return <div className="sn-card" style={{ background: "#fff", padding: 20, color: "var(--coral)" }}>{err}</div>;
  if (!data) return <div style={{ color: "var(--muted)" }}><Loader2 size={16} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />Carregant la metodologia…</div>;
  const lvl = data.nivells[sub];
  const tabs = [["llibre", "Llibre", BookOpen], ["sessions", "Sessions del curs", ListChecks], ["crear", "Crear sessió", Sparkles]];
  // Agrupa el llibre per apartats (cada títol obri un apartat plegable)
  const sections = []; (lvl.metodologia || []).forEach((b) => { if (b.t === "h" || !sections.length) sections.push({ titol: b.t === "h" ? b.x : lvl.nom, blocks: [] }); if (b.t !== "h") sections[sections.length - 1].blocks.push(b); });
  return (
    <div>
      <h2 className="sn-display" style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>Metodologia</h2>
      <p style={{ color: "var(--muted)", fontSize: ".86rem", marginBottom: 12 }}>El llibre de la piscina per nivells, les 30 sessions del curs i el creador de sessions.</p>
      <div className="flex gap-1.5 overflow-x-auto mb-3 no-print">
        {tabs.map(([id, label, Icon]) => <button key={id} className={`sn-btn ${view === id ? "sn-btn-dark" : "sn-btn-ghost"}`} style={{ padding: ".5rem .8rem", fontSize: ".84rem" }} onClick={() => setView(id)}><Icon size={15} /> {label}</button>)}
      </div>
      {view !== "crear" && (
        <div className="flex gap-1.5 flex-wrap mb-3 no-print">
          {SUB_ORDER.filter((s) => data.nivells[s]).map((s) => <button key={s} className="sn-pill" onClick={() => { setSub(s); setOpenSes(null); }} style={{ cursor: "pointer", border: `1px solid ${s === sub ? "var(--deep)" : "var(--line)"}`, background: s === sub ? "var(--deep)" : "#fff", color: s === sub ? "#fff" : "var(--deep)", padding: ".35rem .75rem" }}>{data.nivells[s].nom}</button>)}
        </div>
      )}
      {view === "llibre" && (
        <div className="sn-card sn-shadow" style={{ background: "#fff", overflow: "hidden" }}>
          {sections.filter((sec) => sec.blocks.length).map((sec, i) => <LlibreSection key={sub + i} sec={sec} defaultOpen={i === 0} />)}
        </div>
      )}
      {view === "sessions" && !openSes && (
        <div className="sn-card sn-shadow" style={{ background: "#fff", overflow: "hidden" }}>
          {lvl.calendari.map((c, i) => {
            const d = detallDe(lvl, c.n); const newTrim = i === 0 || TRIM_OF(c.n) !== TRIM_OF(c.n - 1);
            return (
              <React.Fragment key={c.n}>
                {newTrim && <div style={{ padding: "8px 14px", background: "var(--surface)", fontWeight: 700, fontSize: ".8rem" }}>{TRIM_OF(c.n)}</div>}
                <div className="sn-row flex items-center justify-between gap-2" style={{ padding: "10px 14px", borderTop: "1px solid var(--line)" }} onClick={() => setOpenSes(c.n)}>
                  <div style={{ fontSize: ".86rem" }}><b>Sessió {c.n}</b> · {c.objectiu}<div style={{ fontSize: ".74rem", color: "var(--muted)" }}>{c.material || "—"}</div></div>
                  <div className="flex items-center gap-2">{d && <span className="sn-pill" style={{ background: "#12B0A01c", color: "var(--deep)", fontSize: ".64rem" }}>Desenvolupada</span>}<ChevronRight size={16} color="var(--muted)" /></div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {view === "sessions" && openSes && (() => {
        const c = lvl.calendari[openSes - 1]; const d = detallDe(lvl, openSes);
        const appLevel = Object.keys(APP_LEVEL_MAP).find((l) => APP_LEVEL_MAP[l].sub.includes(sub));
        return (
          <div>
            <button className="sn-btn sn-btn-ghost mb-3" onClick={() => setOpenSes(null)}><ChevronLeft size={16} /> Totes les sessions</button>
            <div className="sn-card sn-shadow" style={{ background: "#fff", padding: 16, marginBottom: 12 }}>
              <div className="sn-display" style={{ fontWeight: 800, fontSize: "1.1rem" }}>{lvl.nom} · Sessió {openSes}</div>
              <div style={{ fontSize: ".8rem", color: "var(--muted)" }}>{TRIM_OF(openSes)}</div>
              <div style={{ marginTop: 8 }}><b>Objectiu:</b> {d?.objectiu || c.objectiu}</div>
              <div style={{ color: "var(--muted)" }}><b style={{ color: "var(--ink)" }}>Material:</b> {d?.material || c.material || "—"}</div>
              {d ? (
                <ol style={{ margin: "10px 0 0 18px", lineHeight: 1.5 }}>{d.exercicis.map((e, i) => <li key={i} style={{ marginBottom: 6 }}>{e}</li>)}</ol>
              ) : <div style={{ marginTop: 10, fontSize: ".84rem", color: "var(--muted)" }}>Aquesta sessió no està desenvolupada al llibre. A «Crear sessió» en pots generar una amb aquest objectiu.</div>}
              {d?.nota && <div style={{ marginTop: 8, fontSize: ".82rem", color: "var(--muted)" }}>Nota: {d.nota}</div>}
            </div>
            <Generador key={sub + openSes} data={data} compact initialLevel={appLevel} initialMaterial={[]} initialObjectiu={c.objectiu} />
          </div>
        );
      })()}
      {view === "crear" && <Generador data={data} initialLevel={defaultLevel} />}
    </div>
  );
}

function LlibreSection({ sec, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <div className="sn-row flex items-center justify-between" style={{ padding: "11px 14px", fontWeight: 700 }} onClick={() => setOpen((o) => !o)}>
        {sec.titol} {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
      </div>
      {open && (
        <div style={{ padding: "0 16px 14px", fontSize: ".9rem", lineHeight: 1.55, color: "#2b3a42" }}>
          {sec.blocks.map((b, i) => b.t === "li"
            ? <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0" }}><span style={{ color: "#12B0A0" }}>•</span><span>{b.x}</span></div>
            : <p key={i} style={{ margin: "6px 0" }}>{b.x}</p>)}
        </div>
      )}
    </div>
  );
}
