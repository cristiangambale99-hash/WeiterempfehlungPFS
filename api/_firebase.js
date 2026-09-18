// Gemeinsame Firebase-Verbindung (Server). Datei mit "_" wird von Vercel nicht als Route veröffentlicht.
// Umgebungsvariable FIREBASE_SERVICE_ACCOUNT = kompletter JSON-Inhalt des Service-Account-Schlüssels
// aus dem Firebase-Projekt aktionuhpfs (Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren).
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
export const db = getFirestore();
export const COLLECTION = process.env.FIRESTORE_COLLECTION || "empfehlungen_pfs";
