// Nimmt eine Empfehlung von der Seite entgegen, speichert sie in Firestore
// und benachrichtigt den Putzfrauenservice per Resend.
// Umgebungsvariablen: FIREBASE_SERVICE_ACCOUNT, RESEND_API_KEY, MAIL_FROM, optional MAIL_TO, ADMIN_URL
import { db, COLLECTION } from "./_firebase.js";

const CODES = process.env.FIRESTORE_CODES || "empfehler_codes_pfs";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const clip = (s, n = 200) => String(s ?? "").trim().slice(0, n);
const person = p => ({ name: clip(p?.name, 120), telefon: clip(p?.telefon, 40), email: clip(p?.email, 160).toLowerCase(), ort: clip(p?.ort, 120) });
const digits = s => String(s || "").replace(/\D/g, "").slice(-9);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  if (d.hp) return res.status(200).json({ ok: true }); // Spam-Falle

  const empfehler = person(d.empfehler), neukunde = person(d.neukunde);
  const code = String(d.code || "").trim().slice(0, 12).toUpperCase();

  // Bei Anmeldung über einen Empfehlungslink den hinterlegten Empfehler ergänzen
  if (code) {
    try {
      const snap = await db.collection(CODES).doc(code).get();
      if (snap.exists) {
        const c = snap.data();
        if (c.name) empfehler.name = clip(c.name, 120);
        if (!empfehler.telefon && c.telefon) empfehler.telefon = clip(c.telefon, 40);
      }
    } catch (e) { console.error("Code-Auflösung", e); }
  }
  if (!empfehler.name || !neukunde.name) return res.status(400).json({ ok: false, error: "Pflichtangaben fehlen" });

  // Dublettenprüfung: gleicher Neukunde (Telefon oder E-Mail) bereits vorhanden?
  let duplikatVon = null;
  try {
    const checks = [];
    if (digits(neukunde.telefon)) checks.push(db.collection(COLLECTION).where("neukundeTelKey", "==", digits(neukunde.telefon)).limit(1).get());
    if (neukunde.email) checks.push(db.collection(COLLECTION).where("neukunde.email", "==", neukunde.email).limit(1).get());
    for (const snap of await Promise.all(checks)) if (!snap.empty) { duplikatVon = snap.docs[0].id; break; }
  } catch (e) { console.error("Dublettenprüfung", e); }

  const now = new Date().toISOString();
  const doc = {
    createdAt: now,
    art: d.art === "Empfohlene Person meldet sich" ? "selbst" : "erfasst",
    empfehler, neukunde,
    neukundeTelKey: digits(neukunde.telefon),
    nachricht: clip(d.nachricht, 2000),
    einverstaendnis: !!d.einverstaendnis,
    geschaeft: !!d.geschaeft,
    code: code || null,
    status: "neu",
    gsNeukunde: false, gsEmpfehler: false,
    duplikatVon,
    notizen: [],
    verlauf: [{ at: now, text: "Empfehlung eingegangen" }]
  };

  let id;
  try { id = (await db.collection(COLLECTION).add(doc)).id; }
  catch (e) { console.error("Speichern", e); return res.status(500).json({ ok: false }); }

  // Benachrichtigung – ein Mailfehler darf die gespeicherte Empfehlung nicht verwerfen
  try {
    const row = (k, v) => v ? `<tr><td style="padding:3px 16px 3px 0;color:#5E7273">${k}</td><td>${esc(v)}</td></tr>` : "";
    const adminLink = process.env.ADMIN_URL ? `<p style="margin:20px 0 0"><a href="${process.env.ADMIN_URL}" style="color:#1D8384;font-weight:bold">Im Adminbereich öffnen</a></p>` : "";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [process.env.MAIL_TO || "putzfrauenservice@clean-service.ch"],
        reply_to: neukunde.email || empfehler.email || undefined,
        subject: `${d.geschaeft ? "Geschäftsempfehlung" : "Weiterempfehlung PFS"}: ${neukunde.name} (von ${empfehler.name})${duplikatVon ? " – mögliche Dublette" : ""}`,
        html: `<div style="font-family:Verdana,Arial,sans-serif;font-size:13px;color:#16292A">
          ${duplikatVon ? `<p style="background:#FDF1EE;color:#C1503D;padding:8px 12px">Dieser Neukunde wurde bereits früher empfohlen. Bitte im Adminbereich prüfen.</p>` : ""}
          ${d.geschaeft ? `<p style="background:#FBF3E2;color:#8F6212;padding:8px 12px">Geschäftsempfehlung: Unterhaltsreinigung für Geschäftsräume.</p>` : ""}
          <p style="font-weight:bold;margin:0 0 6px">Neukunde</p><table>${row("Name", neukunde.name)}${row("Telefon", neukunde.telefon)}${row("E-Mail", neukunde.email)}${row("PLZ / Ort", neukunde.ort)}</table>
          <p style="font-weight:bold;margin:16px 0 6px">Empfohlen von${code ? " (Code " + esc(code) + ")" : ""}</p><table>${row("Name", empfehler.name)}${row("Telefon", empfehler.telefon)}${row("E-Mail", empfehler.email)}${row("PLZ / Ort", empfehler.ort)}</table>
          ${doc.nachricht ? `<p style="font-weight:bold;margin:16px 0 6px">Nachricht</p><p style="margin:0;white-space:pre-wrap">${esc(doc.nachricht)}</p>` : ""}
          ${adminLink}</div>`
      })
    });
  } catch (e) { console.error("Mail", e); }

  return res.status(200).json({ ok: true, id });
}
