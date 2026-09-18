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
    const F = "font-family:Verdana,Arial,sans-serif;";
    const zeile = (k, v) => v ? `<tr>
            <td style="${F}font-size:12px;color:#5E7273;padding:5px 18px 5px 0;white-space:nowrap;vertical-align:top;">${k}</td>
            <td style="${F}font-size:13px;color:#16292A;padding:5px 0;vertical-align:top;">${esc(clip(v))}</td>
          </tr>` : "";

    const block = (titel, hinweis, p, farbe) => `
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #E3ECEC;border-radius:8px;background:#FFFFFF;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 2px 0;${F}font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${farbe};font-weight:bold;">${titel}</p>
          <p style="margin:0 0 12px 0;${F}font-size:11px;color:#5E7273;">${hinweis}</p>
          <table cellpadding="0" cellspacing="0" border="0">${zeile("Name", p.name)}${zeile("Telefon", p.telefon)}${zeile("E-Mail", p.email)}${zeile("PLZ / Ort", p.ort)}</table>
        </td></tr>
      </table>`;

    const merker = [];
    if (duplikatVon) merker.push(`<span style="${F}font-size:11px;font-weight:bold;color:#C1503D;background:#FAEAE6;border-radius:10px;padding:4px 11px;">Mögliche Dublette</span>`);
    if (d.geschaeft) merker.push(`<span style="${F}font-size:11px;font-weight:bold;color:#8F6212;background:#FBF3E2;border-radius:10px;padding:4px 11px;">Betrieb, Unterhaltsreinigung</span>`);
    if (code) merker.push(`<span style="${F}font-size:11px;font-weight:bold;color:#1D8384;background:#EAF6F6;border-radius:10px;padding:4px 11px;">Über Link ${esc(code)}</span>`);

    const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#F2F8F8;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr><td align="center">
      <table cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:100%;border-collapse:collapse;background:#FFFFFF;border:1px solid #E3ECEC;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#0E4344;padding:18px 22px;">
          <p style="margin:0;${F}font-size:11px;letter-spacing:.1em;color:#8FB5B5;">EMPFEHLUNGSPROGRAMM PUTZFRAUENSERVICE</p>
          <p style="margin:5px 0 0 0;${F}font-size:17px;font-weight:bold;color:#FFFFFF;">${d.geschaeft ? "Neue Geschäftsempfehlung" : "Neue Empfehlung"}</p>
        </td></tr>

        <tr><td style="padding:20px 22px 0 22px;">
          <p style="margin:0 0 14px 0;${F}font-size:12px;color:#5E7273;">Eingang ${new Date().toLocaleString("de-CH", { timeZone: "Europe/Zurich" })} · ${d.art === "Empfohlene Person meldet sich" ? "hat sich selbst gemeldet" : "von Kundin oder Kunde erfasst"}</p>
          ${merker.length ? `<p style="margin:0 0 16px 0;">${merker.join("&nbsp;&nbsp;")}</p>` : ""}
        </td></tr>

        <tr><td style="padding:0 22px;">${block("Neukunde", "erhält CHF 100.00 Abzug auf der ersten Rechnung", neukunde, "#1D8384")}</td></tr>
        <tr><td style="padding:12px 22px 0 22px;">${block("Empfohlen von", "erhält CHF 100.00 Gutschrift nach der ersten Reinigung", empfehler, "#5E7273")}</td></tr>

        ${doc.nachricht ? `<tr><td style="padding:12px 22px 0 22px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#EAF6F6;border-radius:8px;">
            <tr><td style="padding:14px 18px;${F}font-size:13px;color:#16292A;">${esc(clip(doc.nachricht, 2000))}</td></tr>
          </table></td></tr>` : ""}

        <tr><td style="padding:20px 22px 22px 22px;">
          ${process.env.ADMIN_URL ? `<table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="background:#1D8384;border-radius:6px;padding:11px 20px;">
              <a href="${process.env.ADMIN_URL}" style="${F}font-size:13px;font-weight:bold;color:#FFFFFF;text-decoration:none;">Im Adminbereich öffnen</a>
            </td></tr></table>` : ""}
          <p style="margin:16px 0 0 0;${F}font-size:11px;color:#8A9C9A;">Einverständnis zur Kontaktaufnahme: ${d.einverstaendnis ? "ja" : "nein"} · automatisch erstellt von der Empfehlungsseite</p>
        </td></tr>
      </table>
    </td></tr></table>
    </body></html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [process.env.MAIL_TO || "putzfrauenservice@clean-service.ch"],
        reply_to: neukunde.email || empfehler.email || undefined,
        subject: `${d.geschaeft ? "Geschäftsempfehlung" : "Neue Empfehlung"}: ${neukunde.name}${empfehler.name ? " (von " + empfehler.name + ")" : ""}${duplikatVon ? " – mögliche Dublette" : ""}`,
        html
      })
    });
  } catch (e) { console.error("Mail", e); }

  return res.status(200).json({ ok: true, id });
}
