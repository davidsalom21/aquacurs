/* ============================================================
   Generació del PDF d'un diploma (anvers + revers) al navegador
   i enviament a la família a través de /api/send-diploma.
   ============================================================ */
// html2canvas i jsPDF van dins del paquet principal (no amb càrrega dinàmica): així, després
// d'una actualització, una pestanya antiga no falla buscant fitxers que Vercel ja no serveix.
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const PAGE_W = 297, PAGE_H = 210, MARGIN = 10; // mm (A4 horitzontal)

// Espera que el navegador haja pintat i que les fonts estiguen carregades
export async function waitForPaint() {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/**
 * Converteix les cares del diploma (.dip) que hi ha dins de `root` en un PDF A4.
 * Torna el PDF en base64 (sense el prefix "data:").
 */
export async function diplomaElementToPdfBase64(root) {
  const faces = Array.from(root.querySelectorAll(".dip"));
  if (faces.length === 0) throw new Error("No s'ha trobat el diploma per a generar el PDF.");
  // L'anvers il·lustrat es dibuixa en un canvas: s'espera que estiga acabat (màx. 8 s)
  for (let t = 0; t < 80; t++) {
    const pending = Array.from(root.querySelectorAll(".dip-aigua canvas")).some((c) => c.dataset.ready !== "1");
    if (!pending) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const usableW = PAGE_W - MARGIN * 2;

  // Una cara per pàgina: pàgina 1 = anvers, pàgina 2 = revers (bé per a imprimir a doble cara)
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const canvas = await html2canvas(face, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      // L'element original està fora de la pantalla; a la còpia el posem visible
      onclone: (doc) => {
        const el = doc.querySelector("[data-pdf-root]");
        if (el) { el.style.left = "0px"; el.style.top = "0px"; }
      },
    });
    let w = usableW, h = (canvas.height * usableW) / canvas.width;
    const maxH = PAGE_H - MARGIN * 2;
    if (h > maxH) { w = (w * maxH) / h; h = maxH; }
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.88), "JPEG", (PAGE_W - w) / 2, (PAGE_H - h) / 2, w, h, undefined, "FAST");
  }

  const uri = pdf.output("datauristring");
  return uri.slice(uri.indexOf(",") + 1);
}

export function pdfFilename(studentName) {
  const clean = String(studentName || "alumne")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `Diploma_${clean || "alumne"}.pdf`;
}

export const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Envia un diploma. Llança un Error amb `.status` si alguna cosa falla. */
export async function sendDiplomaEmail({ accessToken, studentId, to, studentName, level, recommended, season, pdfBase64 }) {
  let res;
  try {
    res = await fetch("/api/send-diploma", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ to, studentId, studentName, level, recommended, season, pdfBase64, filename: pdfFilename(studentName) }),
    });
  } catch {
    const e = new Error("Sense connexió amb el servidor."); e.status = 0; throw e;
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const e = new Error(data.error || `Error del servidor (${res.status})`); e.status = res.status; throw e;
  }
  return data;
}
