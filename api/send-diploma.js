/* ============================================================
   Funció serverless de Vercel: envia un diploma en PDF per correu
   a la família a través de Resend (https://resend.com).

   Variables d'entorn (Vercel → Project → Settings → Environment Variables):
     RESEND_API_KEY       Clau de l'API de Resend (re_...)
     MAIL_FROM            Remitent, p. ex.: Piscina Municipal de Carcaixent <carcaixent@aquacurs.com>
     MAIL_REPLY_TO        (opcional) Adreça on arriben les respostes de les famílies
     VITE_SUPABASE_URL    URL del projecte de Supabase
     SUPABASE_SECRET_KEY  Clau secreta de Supabase (per a comprovar que qui envia és de coordinació)
   ============================================================ */
import { adminClient, getCaller, isCoordRole } from "../lib/supa.js";

const MAX_PDF_B64 = 3_000_000; // ~2,2 MB de PDF (límit de Vercel: 4,5 MB per petició)
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Mètode no permés." });
  }

  const { RESEND_API_KEY, MAIL_FROM, MAIL_REPLY_TO } = process.env;
  const admin = adminClient();
  if (!RESEND_API_KEY || !MAIL_FROM || !admin) {
    return res.status(500).json({ error: "El servidor no està configurat (falten variables d'entorn a Vercel)." });
  }
  // Només coordinació pot enviar (es comprova amb la sessió de Supabase)
  const caller = await getCaller(req, admin);
  if (!caller) return res.status(401).json({ error: "La sessió ha caducat. Torna a entrar." });
  if (!isCoordRole(caller.rol)) return res.status(403).json({ error: "Només coordinació pot enviar diplomes." });

  const body = req.body || {};
  const to = clip(body.to, 254);
  const studentName = clip(body.studentName, 120);
  const level = clip(body.level, 80);
  const recommended = clip(body.recommended, 80);
  const season = clip(body.season, 10);
  const pdfBase64 = String(body.pdfBase64 || "");
  const filename = clip(body.filename, 120).replace(/[^\w.\-]/g, "_") || "Diploma.pdf";
  const studentId = Number.isInteger(body.studentId) ? body.studentId : null;

  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: "L'adreça de correu no és vàlida." });
  if (!studentName) return res.status(400).json({ error: "Falta el nom de l'alumne." });
  if (!pdfBase64.startsWith("JVBER")) return res.status(400).json({ error: "El fitxer adjunt no és un PDF." });
  if (pdfBase64.length > MAX_PDF_B64) return res.status(413).json({ error: "El PDF és massa gran." });

  const subject = `Diploma de natació de ${studentName} · Temporada ${season}`;
  const text =
`Benvolguda família,

Us adjuntem el diploma de ${studentName} del curs de natació (${level}) de la temporada ${season}.
${recommended ? `\nNivell recomanat per a la pròxima temporada: ${recommended}.\n` : ""}
Gràcies per confiar en nosaltres.

Piscina Municipal de Carcaixent`;

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#23303a;max-width:560px">
  <p>Benvolguda família,</p>
  <p>Us adjuntem el diploma de <b>${esc(studentName)}</b> del curs de natació (${esc(level)}) de la temporada ${esc(season)}.</p>
  ${recommended ? `<p style="background:#EAF3F1;border-radius:10px;padding:12px 14px">Nivell recomanat per a la pròxima temporada:<br><b style="font-size:17px;color:#07313A">${esc(recommended)}</b></p>` : ""}
  <p>Gràcies per confiar en nosaltres.</p>
  <p style="color:#5a6670">Piscina Municipal de Carcaixent</p>
</div>`;

  const payload = {
    from: MAIL_FROM,
    to: [to],
    subject,
    text,
    html,
    attachments: [{ filename, content: pdfBase64 }],
  };
  if (MAIL_REPLY_TO) payload.reply_to = MAIL_REPLY_TO;

  let r;
  try {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return res.status(502).json({ error: "No s'ha pogut contactar amb el servei de correu." });
  }

  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const msg = data.message || data.error || `Error ${r.status}`;
    // 429 = massa enviaments o límit diari del pla gratuït (100/dia)
    return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? `Límit d'enviaments: ${msg}` : `Resend: ${msg}` });
  }
  // Es deixa constància de l'enviament a la base de dades
  if (studentId) {
    await admin.from("evaluations").update({ sent_at: new Date().toISOString(), sent_to: to }).eq("season", season || "25-26").eq("student_id", studentId);
  }
  return res.status(200).json({ ok: true, id: data.id });
}
