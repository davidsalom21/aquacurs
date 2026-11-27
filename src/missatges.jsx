/* ============================================================
   Missatges interns: qualsevol usuari pot escriure a qualsevol altre
   (monitors, coordinació i recepció). Queden guardats per als dos.
   ============================================================ */
import React, { useCallback, useEffect, useState } from "react";
import { Mail, Send, Inbox, ChevronLeft, Loader2, Reply, PenSquare, Check } from "lucide-react";
import { fetchUsuaris, fetchMissatges, enviarMissatge, marcarLlegit } from "./db.js";

const ROL_GRUP = { coord_nat: "Coordinació", coord_gen: "Coordinació", recepcio: "Recepció", monitor: "Monitors" };
const fmt = (iso) => { try { const d = new Date(iso); const avui = new Date(); return d.toDateString() === avui.toDateString() ? d.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("ca-ES", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export function Missatges({ me, onUnreadChange }) {
  const [msgs, setMsgs] = useState(null);
  const [err, setErr] = useState("");
  const [box, setBox] = useState("rebuts");
  const [open, setOpen] = useState(null);
  const [compose, setCompose] = useState(null);   // { to: [ids], assumpte, text, resposta }
  const load = useCallback(() => fetchMissatges().then((m) => { setMsgs(m); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  const myRow = (m) => m.dest.find((d) => d.user_id === me.id);
  const rebuts = (msgs || []).filter((m) => myRow(m));
  const enviats = (msgs || []).filter((m) => m.de === me.id);
  const noLlegits = rebuts.filter((m) => !myRow(m).llegit_at).length;
  useEffect(() => { onUnreadChange && onUnreadChange(noLlegits); }, [noLlegits, onUnreadChange]);

  const obrir = async (m) => {
    setOpen(m);
    const r = myRow(m);
    if (r && !r.llegit_at) {
      await marcarLlegit(m.id).catch(() => {});
      setMsgs((prev) => prev.map((x) => (x.id !== m.id ? x : { ...x, dest: x.dest.map((d) => (d.user_id === me.id ? { ...d, llegit_at: new Date().toISOString() } : d)) })));
    }
  };

  if (compose) return <Redactar me={me} initial={compose} onCancel={() => setCompose(null)} onSent={() => { setCompose(null); setOpen(null); setBox("enviats"); load(); }} />;

  if (open) {
    const m = (msgs || []).find((x) => x.id === open.id) || open;
    const original = m.resposta_a && (msgs || []).find((x) => x.id === m.resposta_a);
    return (
      <div>
        <button className="sn-btn sn-btn-ghost mb-3" onClick={() => setOpen(null)}><ChevronLeft size={16} /> Tornar</button>
        <div className="sn-card sn-shadow" style={{ background: "#fff", padding: 18 }}>
          <div className="sn-display" style={{ fontWeight: 800, fontSize: "1.15rem" }}>{m.assumpte || "(sense assumpte)"}</div>
          <div style={{ fontSize: ".8rem", color: "var(--muted)", marginTop: 4 }}>
            De <b style={{ color: "var(--ink)" }}>{m.de === me.id ? "tu" : m.de_nom}</b> · Per a {m.dest.map((d) => (d.user_id === me.id ? "tu" : d.nom)).join(", ")} · {fmt(m.created_at)}
          </div>
          {m.de === me.id && <div style={{ fontSize: ".74rem", color: "var(--muted)", marginTop: 4 }}>{m.dest.map((d) => `${d.nom}: ${d.llegit_at ? "llegit " + fmt(d.llegit_at) : "encara no l'ha llegit"}`).join(" · ")}</div>}
          <div style={{ whiteSpace: "pre-wrap", marginTop: 14, lineHeight: 1.55, fontSize: ".95rem" }}>{m.text}</div>
          {original && (
            <div style={{ marginTop: 14, borderLeft: "3px solid var(--line)", paddingLeft: 10, fontSize: ".82rem", color: "var(--muted)" }}>
              <div>En resposta a «{original.assumpte || "(sense assumpte)"}» de {original.de === me.id ? "tu" : original.de_nom}:</div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{original.text}</div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 16 }}>
            {m.de !== me.id && <button className="sn-btn sn-btn-primary" onClick={() => setCompose({ to: [m.de], assumpte: m.assumpte ? (m.assumpte.startsWith("Re:") ? m.assumpte : "Re: " + m.assumpte) : "", text: "", resposta: m.id })}><Reply size={16} /> Respondre</button>}
            {m.de !== me.id && m.dest.length > 1 && <button className="sn-btn sn-btn-ghost" onClick={() => setCompose({ to: [m.de, ...m.dest.map((d) => d.user_id).filter((id) => id !== me.id)], assumpte: m.assumpte ? "Re: " + m.assumpte.replace(/^Re:\s*/, "") : "", text: "", resposta: m.id })}>Respondre a tots</button>}
          </div>
        </div>
      </div>
    );
  }

  const list = box === "rebuts" ? rebuts : enviats;
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h2 className="sn-display" style={{ fontSize: "1.5rem", fontWeight: 800 }}>Missatges</h2>
          <p style={{ color: "var(--muted)", fontSize: ".86rem" }}>Escriu a coordinació, a recepció o a qualsevol monitor. Els missatges queden guardats.</p>
        </div>
        <button className="sn-btn sn-btn-dark" onClick={() => setCompose({ to: [], assumpte: "", text: "" })}><PenSquare size={16} /> Nou missatge</button>
      </div>
      <div className="flex gap-1.5 mb-3">
        <button className={`sn-btn ${box === "rebuts" ? "sn-btn-dark" : "sn-btn-ghost"}`} style={{ padding: ".5rem .8rem", fontSize: ".84rem" }} onClick={() => setBox("rebuts")}><Inbox size={15} /> Rebuts{noLlegits ? ` (${noLlegits})` : ""}</button>
        <button className={`sn-btn ${box === "enviats" ? "sn-btn-dark" : "sn-btn-ghost"}`} style={{ padding: ".5rem .8rem", fontSize: ".84rem" }} onClick={() => setBox("enviats")}><Send size={15} /> Enviats</button>
      </div>
      {err && <div style={{ color: "var(--coral)", fontSize: ".84rem", marginBottom: 10 }}>{err}</div>}
      <div className="sn-card sn-shadow" style={{ background: "#fff", overflow: "hidden" }}>
        {msgs === null && !err && <div style={{ padding: 16, color: "var(--muted)" }}><Loader2 size={15} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />Carregant…</div>}
        {msgs && list.length === 0 && <div style={{ padding: 16, color: "var(--muted)", fontSize: ".88rem" }}>{box === "rebuts" ? "No tens cap missatge." : "Encara no has enviat cap missatge."}</div>}
        {list.map((m, i) => {
          const unread = box === "rebuts" && !myRow(m).llegit_at;
          return (
            <div key={m.id} className="sn-row" onClick={() => obrir(m)} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--line)" : "none", background: unread ? "#12B0A00d" : undefined }}>
              <div className="flex items-center justify-between gap-2">
                <div style={{ fontWeight: unread ? 800 : 600, fontSize: ".9rem", display: "flex", alignItems: "center", gap: 6 }}>
                  {unread && <span style={{ width: 8, height: 8, borderRadius: 8, background: "#12B0A0", display: "inline-block" }} />}
                  {box === "rebuts" ? m.de_nom : "Per a " + m.dest.map((d) => d.nom).join(", ")}
                </div>
                <div style={{ fontSize: ".72rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(m.created_at)}</div>
              </div>
              <div style={{ fontSize: ".86rem", fontWeight: unread ? 700 : 500, marginTop: 1 }}>{m.assumpte || "(sense assumpte)"}</div>
              <div style={{ fontSize: ".8rem", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</div>
              {box === "enviats" && <div style={{ fontSize: ".7rem", color: "var(--muted)", marginTop: 2 }}>{m.dest.every((d) => d.llegit_at) ? <><Check size={11} style={{ display: "inline" }} /> Llegit</> : `${m.dest.filter((d) => d.llegit_at).length}/${m.dest.length} l'han llegit`}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Redactar({ me, initial, onCancel, onSent }) {
  const [users, setUsers] = useState(null);
  const [to, setTo] = useState(initial.to || []);
  const [assumpte, setAssumpte] = useState(initial.assumpte || "");
  const [text, setText] = useState(initial.text || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { fetchUsuaris().then((u) => setUsers(u.filter((x) => x.id !== me.id))).catch((e) => setErr(e.message)); }, [me.id]);
  const toggle = (id) => setTo((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const groups = {}; (users || []).forEach((u) => { const g = ROL_GRUP[u.rol] || "Altres"; (groups[g] = groups[g] || []).push(u); });
  const send = async () => {
    setBusy(true); setErr("");
    try { await enviarMissatge(to, assumpte, text, initial.resposta); onSent(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const valid = to.length > 0 && text.trim().length > 0;
  return (
    <div>
      <button className="sn-btn sn-btn-ghost mb-3" onClick={onCancel}><ChevronLeft size={16} /> Cancel·lar</button>
      <div className="sn-card sn-shadow" style={{ background: "#fff", padding: 18 }}>
        <div className="sn-display flex items-center gap-2" style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 12 }}><Mail size={18} /> {initial.resposta ? "Respondre" : "Nou missatge"}</div>
        <div style={{ fontSize: ".74rem", color: "var(--muted)", marginBottom: 6 }}>Per a</div>
        {users === null && !err && <div style={{ color: "var(--muted)", fontSize: ".84rem" }}><Loader2 size={14} className="animate-spin" style={{ display: "inline", marginRight: 6 }} />Carregant…</div>}
        {["Coordinació", "Recepció", "Monitors", "Altres"].filter((g) => groups[g]).map((g) => {
          const ids = groups[g].map((u) => u.id); const all = ids.every((id) => to.includes(id));
          return (
            <div key={g} style={{ marginBottom: 10 }}>
              <div className="flex items-center gap-2" style={{ fontSize: ".78rem", fontWeight: 700, marginBottom: 4 }}>
                {g}
                {ids.length > 1 && <button type="button" className="sn-pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: "#fff", color: "var(--muted)", fontSize: ".66rem" }} onClick={() => setTo((p) => (all ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]))}>{all ? "Llevar tots" : "Tots"}</button>}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {groups[g].map((u) => { const on = to.includes(u.id); return <button key={u.id} type="button" onClick={() => toggle(u.id)} className="sn-pill" style={{ cursor: "pointer", border: `1px solid ${on ? "#12B0A0" : "var(--line)"}`, background: on ? "#12B0A01f" : "#fff", color: on ? "var(--deep)" : "var(--muted)", fontSize: ".78rem", padding: ".32rem .75rem" }}>{on ? "✓ " : ""}{u.nom}</button>; })}
              </div>
            </div>
          );
        })}
        <label style={{ display: "block", fontSize: ".74rem", color: "var(--muted)", marginTop: 8 }}>Assumpte (opcional)
          <input className="sn-input" value={assumpte} maxLength={200} onChange={(e) => setAssumpte(e.target.value)} placeholder="P. ex.: Canvi de grup de…" />
        </label>
        <label style={{ display: "block", fontSize: ".74rem", color: "var(--muted)", marginTop: 8 }}>Missatge
          <textarea className="sn-input" rows={7} value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} style={{ resize: "vertical", lineHeight: 1.45 }} placeholder="Escriu ací…" />
        </label>
        {err && <div style={{ color: "var(--coral)", fontSize: ".84rem", marginTop: 8 }}>{err}</div>}
        <button className="sn-btn sn-btn-primary" style={{ marginTop: 12, opacity: valid ? 1 : .5 }} disabled={!valid || busy} onClick={send}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar</button>
      </div>
    </div>
  );
}
