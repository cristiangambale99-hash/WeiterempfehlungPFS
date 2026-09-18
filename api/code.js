// Persönlicher Empfehlungscode: erstellen, abrufen, Aufrufe zählen.
// POST { name, telefon } -> { code, link }   (gleiche Telefonnummer ergibt immer denselben Code)
// GET  ?code=XY          -> { vorname }      (öffentlich, gibt nur den Vornamen preis)
import { db } from "./_firebase.js";

const CODES = process.env.FIRESTORE_CODES || "empfehler_codes_pfs";
const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne I, O, 0, 1
const clip = (s, n = 120) => String(s ?? "").trim().slice(0, n);
const digits = s => String(s || "").replace(/\D/g, "").slice(-9);
const initialen = name => (clip(name).split(/\s+/).map(t => t[0] || "").join("").toUpperCase().replace(/[^A-Z]/g, "") + "CS").slice(0, 2);
const zufall = n => Array.from({ length: n }, () => ZEICHEN[Math.floor(Math.random() * ZEICHEN.length)]).join("");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const code = clip(req.query?.code, 12).toUpperCase();
      if (!code) return res.status(400).json({ ok: false });
      const snap = await db.collection(CODES).doc(code).get();
      if (!snap.exists) return res.status(404).json({ ok: false });
      const d = snap.data();
      await snap.ref.update({ aufrufe: (d.aufrufe || 0) + 1, zuletztAufgerufen: new Date().toISOString() });
      return res.status(200).json({ ok: true, name: String(d.name || ""), vorname: String(d.name || "").split(" ")[0] });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const name = clip(b.name), telefon = clip(b.telefon, 40);
      const vorhandenerCode = clip(b.code, 12).toUpperCase();
      if (!name) return res.status(400).json({ ok: false, error: "Name nötig" });

      // Bereits erstellten Code ergänzen (z.B. wenn die Telefonnummer nachgetragen wird)
      if (vorhandenerCode) {
        const ref = db.collection(CODES).doc(vorhandenerCode);
        if ((await ref.get()).exists) {
          await ref.update({ name, telefon, telKey: digits(telefon), aktualisiertAm: new Date().toISOString() });
          return res.status(200).json({ ok: true, code: vorhandenerCode, neu: false });
        }
      }

      // Bestehenden Code derselben Telefonnummer wiederverwenden
      if (digits(telefon).length >= 9) {
        const vorhanden = await db.collection(CODES).where("telKey", "==", digits(telefon)).limit(1).get();
        if (!vorhanden.empty) {
          await vorhanden.docs[0].ref.update({ name, telefon, aktualisiertAm: new Date().toISOString() });
          return res.status(200).json({ ok: true, code: vorhanden.docs[0].id, neu: false });
        }
      }

      let code;
      for (let i = 0; i < 6; i++) {
        const kandidat = initialen(name) + zufall(4);
        if (!(await db.collection(CODES).doc(kandidat).get()).exists) { code = kandidat; break; }
      }
      if (!code) return res.status(500).json({ ok: false });

      await db.collection(CODES).doc(code).set({
        name, telefon, telKey: digits(telefon),
        createdAt: new Date().toISOString(), aufrufe: 0
      });
      return res.status(200).json({ ok: true, code, neu: true });
    }

    return res.status(405).json({ ok: false });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
}
