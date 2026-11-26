/* ============================================================
   Entrada amb nom + codi, canvi de codi, gestió d'usuaris i de grups.
   ============================================================ */
import React, { useEffect, useState } from "react";
import { User, Users, BarChart3, ConciergeBell, ChevronLeft, Loader2, X, Check, KeyRound, Eye, EyeOff, Trash2, UserPlus, AlertTriangle, ShieldCheck } from "lucide-react";
import { fetchLoginList, signIn, changePassword, adminUsers, saveGroup } from "./db.js";

export const ROLE_INFO = {
  monitor: { label: "Monitor/a", icon: User, desc: "Avalua els teus grups i genera els diplomes." },
  coord_nat: { label: "Coordinació de natació", icon: Users, desc: "Segueix el treball de cada monitor, revisa els diplomes i envia'ls a les famílies." },
  coord_gen: { label: "Coordinació general", icon: BarChart3, desc: "Visió global del centre i totes les activitats. També pot enviar els diplomes." },
  recepcio: { label: "Recepció", icon: ConciergeBell, desc: "Inscriu alumnes nous, canvia'ls de grup i gestiona la llista d'espera." },
};

function Header({ subtitle }) {
  return (
    <header style={{ background: "var(--deep)", color: "#fff" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "16px 20px" }} className="flex items-center gap-3">
        <img src="/icon-192.png" alt="AquaCurs" style={{ width: 40, height: 40, borderRadius: 11, display: "block", flexShrink: 0 }} />
        <div>
          <div className="sn-display" style={{ fontWeight: 800, fontSize: "1.18rem", lineHeight: 1 }}>AquaCurs</div>
          <div style={{ fontSize: ".74rem", opacity: .7, marginTop: 2 }}>{subtitle || "Escola de Natació · Temporada 26-27"}</div>
        </div>
      </div>
    </header>
  );
}

function ErrorBox({ children }) {
  if (!children) return null;
  return <div style={{ background: "#f08a5d1a", color: "var(--coral)", borderRadius: 10, padding: "10px 12px", fontSize: ".84rem", marginBottom: 12, display: "flex", gap: 8 }}><AlertTriangle size={16} className="shrink-0" /> {children}</div>;
}

function PasswordInput({ value, onChange, placeholder, autoFocus, onEnter }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input className="sn-input" type={show ? "text" : "password"} value={value} placeholder={placeholder} autoFocus={autoFocus} autoComplete="current-password"
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()} style={{ paddingRight: 44 }} />
      <button type="button" onClick={() => setShow(!show)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 6 }} aria-label={show ? "Amagar" : "Mostrar"}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function ConfigMissing() {
  return (
    <div className="sn-root" style={{ minHeight: "100vh" }}>
      <Header />
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "44px 20px" }}>
        <h2 className="sn-display" style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 8 }}>Falta connectar la base de dades</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.5 }}>Cal afegir a Vercel les variables <b>VITE_SUPABASE_URL</b> i <b>VITE_SUPABASE_PUBLISHABLE_KEY</b> i tornar a desplegar.</p>
      </main>
    </div>
  );
}

/* ---------------- Pantalla d'entrada ---------------- */
export function Login({ onLoggedIn }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [rol, setRol] = useState(null);
  const [person, setPerson] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => { setErr(""); setList(null); fetchLoginList().then(setList).catch((e) => { setErr(e.message); setList([]); }); };
  useEffect(load, []);

  const enter = async () => {
    if (!code || busy) return;
    setBusy(true); setErr("");
    try { const session = await signIn(person.login, code); onLoggedIn(session); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  const hasCoord = (list || []).some((p) => p.rol === "coord_nat" || p.rol === "coord_gen");

  return (
    <div className="sn-root" style={{ minHeight: "100vh" }}>
      <Header />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "36px 20px", width: "100%" }}>
        {list === null && <div style={{ color: "var(--muted)" }}><Loader2 size={16} className="animate-spin" style={{ display: "inline", marginRight: 6 }} /> Carregant…</div>}

        {list !== null && !hasCoord && !err && <Bootstrap onDone={load} />}
        {list !== null && err && !rol && (<><ErrorBox>{err}</ErrorBox><button className="sn-btn sn-btn-ghost" onClick={load}>Tornar a provar</button></>)}

        {list !== null && hasCoord && !rol && (
          <>
            <h2 className="sn-display" style={{ fontSize: "1.7rem", fontWeight: 800, marginBottom: 4 }}>Qui ets?</h2>
            <p style={{ color: "var(--muted)", marginBottom: 24 }}>Tria el teu perfil per a entrar.</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
              {Object.entries(ROLE_INFO).map(([id, r]) => (
                <button key={id} className="sn-card sn-shadow sn-row" style={{ padding: 22, textAlign: "left", background: "#fff" }} onClick={() => setRol(id)}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--surface)", display: "grid", placeItems: "center", marginBottom: 12 }}><r.icon size={24} color="var(--deep)" /></div>
                  <div className="sn-display" style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>{r.label}</div>
                  <div style={{ fontSize: ".85rem", color: "var(--muted)", lineHeight: 1.45 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {rol && !person && (
          <>
            <button className="sn-btn sn-btn-ghost" style={{ marginBottom: 14 }} onClick={() => setRol(null)}><ChevronLeft size={16} /> Tornar</button>
            <h2 className="sn-display" style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>{ROLE_INFO[rol].label}</h2>
            <p style={{ color: "var(--muted)", marginBottom: 18 }}>Selecciona el teu nom.</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))" }}>
              {list.filter((p) => p.rol === rol).map((p) => (
                <button key={p.login} className="sn-card sn-shadow sn-row" style={{ padding: 18, textAlign: "left", background: "#fff" }} onClick={() => { setPerson(p); setCode(""); setErr(""); }}>
                  <div className="flex items-center gap-3">
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--surface)", display: "grid", placeItems: "center" }}><User size={20} color="var(--deep)" /></div>
                    <div className="sn-display" style={{ fontWeight: 700 }}>{p.nom}</div>
                  </div>
                </button>
              ))}
              {list.filter((p) => p.rol === rol).length === 0 && <div style={{ color: "var(--muted)" }}>Encara no hi ha cap compte amb aquest perfil.</div>}
            </div>
          </>
        )}

        {rol && person && (
          <div style={{ maxWidth: 380 }}>
            <button className="sn-btn sn-btn-ghost" style={{ marginBottom: 14 }} onClick={() => { setPerson(null); setErr(""); }}><ChevronLeft size={16} /> Tornar</button>
            <h2 className="sn-display" style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>Hola, {person.nom}</h2>
            <p style={{ color: "var(--muted)", marginBottom: 16 }}>Escriu el teu codi per a entrar.</p>
            <ErrorBox>{err}</ErrorBox>
            <PasswordInput value={code} onChange={setCode} placeholder="Codi" autoFocus onEnter={enter} />
            <button className="sn-btn sn-btn-primary w-full justify-center" style={{ marginTop: 12, opacity: code && !busy ? 1 : .6 }} disabled={!code || busy} onClick={enter}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Entrar
            </button>
            <p style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 12 }}>Si no recordes el codi, demana a coordinació que te'l restablisca.</p>
          </div>
        )}
      </main>
    </div>
  );
}

/* Primer compte de coordinació (només quan encara no n'hi ha cap) */
function Bootstrap({ onDone }) {
  const [nom, setNom] = useState("");
  const [rol, setRol] = useState("coord_nat");
  const [pw, setPw] = useState("");
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr("");
    try { await adminUsers("bootstrap", { nom: nom.trim(), rol, password: pw, setupKey: key.trim() }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 420 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 6 }}><ShieldCheck size={20} color="var(--aqua)" /><h2 className="sn-display" style={{ fontSize: "1.4rem", fontWeight: 800 }}>Configuració inicial</h2></div>
      <p style={{ color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>Encara no hi ha cap compte. Crea el primer compte de coordinació; des d'ell podràs crear la resta.</p>
      <ErrorBox>{err}</ErrorBox>
      <div style={{ display: "grid", gap: 10 }}>
        <input className="sn-input" placeholder="Nom (com es veurà a l'app)" value={nom} onChange={(e) => setNom(e.target.value)} />
        <select className="sn-input" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="coord_nat">Coordinació de natació</option>
          <option value="coord_gen">Coordinació general</option>
        </select>
        <PasswordInput value={pw} onChange={setPw} placeholder="Codi per a entrar (mínim 6 caràcters)" />
        <input className="sn-input" type="password" placeholder="Codi de configuració (el SEND_KEY de Vercel)" value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="sn-btn sn-btn-primary w-full justify-center" style={{ opacity: busy ? .6 : 1 }} disabled={busy || nom.trim().length < 2 || pw.length < 6 || !key} onClick={go}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Crear compte
        </button>
      </div>
    </div>
  );
}

/* ---------------- Canviar el codi propi ---------------- */
export function ChangePasswordModal({ onClose }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [err, setErr] = useState(""); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (a.length < 6) { setErr("El codi ha de tindre almenys 6 caràcters."); return; }
    if (a !== b) { setErr("Els dos codis no coincideixen."); return; }
    setBusy(true); setErr("");
    try { await changePassword(a); setOk(true); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="no-print" style={{ position: "fixed", inset: 0, background: "#07313acc", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="sn-card sn-shadow" style={{ background: "#fff", width: "100%", maxWidth: 380, padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="sn-display flex items-center gap-2" style={{ fontWeight: 800, fontSize: "1.15rem" }}><KeyRound size={18} /> Canviar el meu codi</div>
          <button className="sn-btn sn-btn-ghost" style={{ padding: ".4rem .55rem" }} onClick={onClose}><X size={16} /></button>
        </div>
        {ok ? (
          <>
            <div style={{ background: "#2a9d8f1a", color: "#1f7a6f", borderRadius: 10, padding: "10px 12px", fontSize: ".86rem", marginBottom: 12 }}>Codi canviat. La pròxima vegada entra amb el codi nou.</div>
            <button className="sn-btn sn-btn-primary w-full justify-center" onClick={onClose}>D'acord</button>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <ErrorBox>{err}</ErrorBox>
            <PasswordInput value={a} onChange={setA} placeholder="Codi nou (mínim 6 caràcters)" autoFocus />
            <PasswordInput value={b} onChange={setB} placeholder="Repeteix el codi nou" onEnter={save} />
            <button className="sn-btn sn-btn-primary w-full justify-center" disabled={busy} onClick={save}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Desar</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Usuaris (coordinació) ---------------- */
const suggestCode = (nom) => {
  const base = String(nom || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 10) || "aquacurs";
  return base + String(Math.floor(100 + Math.random() * 900));
};

export function UsersPanel({ profiles, me, onChanged }) {
  const [nom, setNom] = useState(""); const [rol, setRol] = useState("monitor"); const [code, setCode] = useState("");
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState(null); const [resetCode, setResetCode] = useState("");
  const [delFor, setDelFor] = useState(null);

  const run = async (fn, okMsg) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ t: "ok", m: okMsg }); try { await onChanged(); } catch {} return true; }
    catch (e) { setMsg({ t: "err", m: e.message }); return false; }
    finally { setBusy(false); }
  };
  const create = async () => {
    const ok = await run(() => adminUsers("create", { nom: nom.trim(), rol, password: code }), `Compte creat: ${nom.trim()} · codi inicial «${code}». Passa-li el codi; el podrà canviar en entrar.`);
    if (ok) { setNom(""); setCode(""); }
  };

  const groups = { monitor: [], coord_nat: [], coord_gen: [], recepcio: [] };
  profiles.forEach((p) => (groups[p.rol] || (groups[p.rol] = [])).push(p));

  return (
    <div>
      <h2 className="sn-display" style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: 4 }}>Usuaris</h2>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>Crea els comptes de monitors i coordinació i restableix els codis oblidats.</p>

      <div className="sn-card sn-shadow mb-4" style={{ background: "#fff", padding: 18 }}>
        <div className="sn-display flex items-center gap-2" style={{ fontWeight: 700, marginBottom: 10 }}><UserPlus size={18} /> Nou compte</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
          <input className="sn-input" placeholder="Nom (ex: Jordi)" value={nom} onChange={(e) => setNom(e.target.value)} />
          <select className="sn-input" value={rol} onChange={(e) => setRol(e.target.value)}>
            {Object.entries(ROLE_INFO).map(([id, r]) => <option key={id} value={id}>{r.label}</option>)}
          </select>
          <div className="flex gap-2">
            <input className="sn-input" placeholder="Codi inicial" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="button" className="sn-btn sn-btn-ghost" style={{ padding: ".5rem .7rem", fontSize: ".78rem", whiteSpace: "nowrap" }} onClick={() => setCode(suggestCode(nom))}>Generar</button>
          </div>
        </div>
        <div style={{ fontSize: ".76rem", color: "var(--muted)", margin: "8px 0 10px" }}>El nom ha de coincidir amb el que surt als grups perquè el monitor veja els seus. Mínim 6 caràcters de codi.</div>
        <button className="sn-btn sn-btn-primary" disabled={busy || nom.trim().length < 2 || code.length < 6} style={{ opacity: busy || nom.trim().length < 2 || code.length < 6 ? .55 : 1 }} onClick={create}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Crear compte
        </button>
      </div>

      {msg && <div className="sn-card mb-4" style={{ background: msg.t === "ok" ? "#2a9d8f14" : "#f08a5d14", border: `1px solid ${msg.t === "ok" ? "#2a9d8f55" : "#f08a5d55"}`, color: msg.t === "ok" ? "#0a6e5c" : "var(--coral)", padding: "10px 14px", fontSize: ".86rem" }}>{msg.m}</div>}

      {Object.entries(groups).map(([r, list]) => (
        <div key={r} className="sn-card sn-shadow mb-3" style={{ background: "#fff", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "var(--surface)", fontWeight: 700, fontSize: ".86rem" }}>{ROLE_INFO[r]?.label || r} ({list.length})</div>
          {list.length === 0 && <div style={{ padding: "10px 16px", fontSize: ".82rem", color: "var(--muted)" }}>Cap compte.</div>}
          {list.map((p) => (
            <div key={p.id} style={{ padding: "10px 16px", borderTop: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div style={{ fontWeight: 600, color: p.actiu ? "var(--ink)" : "var(--muted)" }}>{p.nom} {p.id === me.id && <span style={{ fontSize: ".72rem", color: "var(--muted)" }}>(tu)</span>} {!p.actiu && <span className="sn-pill" style={{ background: "var(--surface)", color: "var(--muted)" }}>desactivat</span>}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button className="sn-btn sn-btn-ghost" style={{ padding: ".35rem .6rem", fontSize: ".76rem" }} onClick={() => { setResetFor(resetFor === p.id ? null : p.id); setResetCode(suggestCode(p.nom)); }}><KeyRound size={14} /> Codi</button>
                  {p.id !== me.id && <button className="sn-btn sn-btn-ghost" style={{ padding: ".35rem .6rem", fontSize: ".76rem" }} onClick={() => run(() => adminUsers("update", { id: p.id, actiu: !p.actiu }), p.actiu ? `${p.nom} desactivat: ja no podrà entrar.` : `${p.nom} activat de nou.`)}>{p.actiu ? "Desactivar" : "Activar"}</button>}
                  {p.id !== me.id && (delFor === p.id ? (
                    <>
                      <button className="sn-btn" style={{ background: "var(--coral)", color: "#fff", padding: ".35rem .6rem", fontSize: ".76rem" }} onClick={() => { setDelFor(null); run(() => adminUsers("delete", { id: p.id }), `Compte de ${p.nom} esborrat.`); }}><Trash2 size={14} /> Sí, esborrar</button>
                      <button className="sn-btn sn-btn-ghost" style={{ padding: ".35rem .5rem" }} onClick={() => setDelFor(null)}><X size={14} /></button>
                    </>
                  ) : <button className="sn-btn sn-btn-ghost" title="Esborrar compte" style={{ padding: ".35rem .5rem", color: "var(--coral)" }} onClick={() => setDelFor(p.id)}><Trash2 size={14} /></button>)}
                </div>
              </div>
              {resetFor === p.id && (
                <div className="flex gap-2" style={{ marginTop: 8 }}>
                  <input className="sn-input" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="Codi nou" />
                  <button className="sn-btn sn-btn-dark" disabled={busy || resetCode.length < 6} onClick={async () => { if (await run(() => adminUsers("reset", { id: p.id, password: resetCode }), `Codi nou de ${p.nom}: «${resetCode}». Passa-li'l; el podrà canviar en entrar.`)) setResetFor(null); }}>Desar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Assignar monitor a cada grup (coordinació) ---------------- */
export function GroupsPanel({ groups, monitorNames, onSaved }) {
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(null);
  const monsOf = (g) => (g.monitors && g.monitors.length ? g.monitors : (g.monitor ? [g.monitor] : []));
  // monitors[0] = monitor principal (signa i posa les notes si l'alumne no en té un altre); monitors[1] = segon monitor
  const change = async (g, idx, nom) => {
    const cur = [...monsOf(g)];
    cur[idx] = nom || "";
    const monitors = [...new Set(cur.filter(Boolean))];
    const ng = { ...g, monitors, monitor: monitors[0] || "" };
    setSaving(g.id); setMsg(null);
    try { await saveGroup(ng); onSaved(ng); setMsg({ t: "ok", m: `${g.codi || g.nivell} ${g.dia} ${g.hora}: ${monitors.join(" i ") || "sense monitor"}.` }); }
    catch (e) { setMsg({ t: "err", m: e.message }); }
    finally { setSaving(null); }
  };
  return (
    <div className="sn-card sn-shadow mb-5" style={{ background: "#fff", overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
        <div className="sn-display" style={{ fontWeight: 700 }}>Grups i monitors ({groups.length})</div>
        <div style={{ fontSize: ".78rem", color: "var(--muted)", marginTop: 2 }}>Canvia el monitor d'un grup i es desa a l'instant. El segon monitor és per als grups amb dos monitors a la vegada.</div>
      </div>
      {msg && <div style={{ padding: "8px 14px", fontSize: ".8rem", color: msg.t === "ok" ? "#0a6e5c" : "var(--coral)", background: msg.t === "ok" ? "#2a9d8f10" : "#f08a5d10" }}>{msg.m}</div>}
      <div style={{ maxHeight: 420, overflow: "auto" }}>
        {groups.map((g) => {
          const ms = monsOf(g);
          const opts = (cur) => [...new Set([...monitorNames, ...ms, ...(cur ? [cur] : [])])].sort();
          return (
            <div key={g.id} className="flex items-center justify-between gap-2 flex-wrap" style={{ padding: "8px 14px", borderTop: "1px solid var(--surface)", fontSize: ".86rem" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{g.nivell}</div>
                <div style={{ fontSize: ".74rem", color: "var(--muted)" }}>{g.codi || "#" + g.id} · {g.dia} {g.hora}</div>
              </div>
              <div className="flex items-center gap-2">
                {saving === g.id && <Loader2 size={14} className="animate-spin" />}
                <select className="sn-input" style={{ width: 140, padding: ".45rem .6rem", color: ms[0] ? "var(--deep)" : "var(--coral)" }} value={ms[0] || ""} disabled={saving === g.id} onChange={(e) => change(g, 0, e.target.value)}>
                  <option value="">Sense assignar</option>
                  {opts(ms[0]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select className="sn-input" style={{ width: 140, padding: ".45rem .6rem", color: ms[1] ? "var(--deep)" : "var(--muted)" }} value={ms[1] || ""} disabled={saving === g.id || !ms[0]} onChange={(e) => change(g, 1, e.target.value)}>
                  <option value="">— 2n monitor —</option>
                  {opts(ms[1]).filter((m) => m !== ms[0]).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
