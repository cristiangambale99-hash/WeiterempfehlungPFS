// Adminbereich: Empfehlungen lesen und bearbeiten. Zugang nur mit ADMIN_CODE (serverseitig geprüft).
import crypto from "node:crypto";
import { db, COLLECTION } from "./_firebase.js";

const CODES = process.env.FIRESTORE_CODES || "empfehler_codes_pfs";

const STATUS = ["neu", "kontaktiert", "offerte", "gewonnen", "verloren"];
const LABEL = { neu: "Neu", kontaktiert: "Kontaktiert", offerte: "Offerte gesendet", gewonnen: "Gewonnen", verloren: "Nicht zustande gekommen" };

function authorized(req) {
  const given = Buffer.from(String(req.headers["x-admin-code"] || ""));
  const expected = Buffer.from(String(process.env.ADMIN_CODE || ""));
  return expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) { await new Promise(r => setTimeout(r, 600)); return res.status(401).json({ ok: false, error: "Zugangscode ungültig" }); }

  try {
    if (req.method === "GET") {
      const [snap, codes] = await Promise.all([
        db.collection(COLLECTION).orderBy("createdAt", "desc").limit(2000).get(),
        db.collection(CODES).limit(2000).get()
      ]);
      return res.status(200).json({
        ok: true,
        items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
        codes: codes.docs.map(d => ({ code: d.id, ...d.data() }))
      });
    }

    if (req.method === "PATCH") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const bearbeiter = String(b.bearbeiter || "").trim().slice(0, 60) || "Admin";
      const ref = db.collection(COLLECTION).doc(String(b.id || ""));
      const cur = await ref.get();
      if (!cur.exists) return res.status(404).json({ ok: false });
      const data = cur.data(), now = new Date().toISOString();
      const upd = {}, verlauf = [];

      if (b.status && STATUS.includes(b.status) && b.status !== data.status) {
        upd.status = b.status; verlauf.push(`Status: ${LABEL[b.status]}`);
        if (b.status === "gewonnen") upd.gewonnenAm = now;
      }
      for (const k of ["gsNeukunde", "gsEmpfehler"]) {
        if (typeof b[k] === "boolean" && b[k] !== data[k]) {
          upd[k] = b[k]; upd[k + "Am"] = b[k] ? now : null;
          verlauf.push(`${k === "gsNeukunde" ? "CHF 100.00 Abzug Neukunde" : "CHF 100.00 Gutschrift Empfehler"} ${b[k] ? "erfasst" : "zurückgesetzt"}`);
        }
      }
      if (b.notiz && String(b.notiz).trim()) upd.notizen = [...(data.notizen || []), { at: now, von: bearbeiter, text: String(b.notiz).trim().slice(0, 2000) }];
      if (typeof b.duplikatOk === "boolean") { upd.duplikatOk = b.duplikatOk; verlauf.push(b.duplikatOk ? "Dublette geprüft, gültig" : "Dublettenprüfung zurückgesetzt"); }

      if (verlauf.length) upd.verlauf = [...(data.verlauf || []), ...verlauf.map(text => ({ at: now, von: bearbeiter, text }))];
      if (!Object.keys(upd).length) return res.status(200).json({ ok: true, item: { id: cur.id, ...data } });
      upd.updatedAt = now;
      await ref.update(upd);
      return res.status(200).json({ ok: true, item: { id: cur.id, ...data, ...upd } });
    }

    return res.status(405).json({ ok: false });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
}
