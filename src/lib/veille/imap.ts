import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { isKnownSender } from "./links";

// Lecture de la boîte dédiée aux alertes (ex. pro@samuelrilos.com).
// Seuls les emails non lus des plateformes reconnues sont lus. Un email qui
// contient au moins une offre est marqué lu et rangé dans VEILLE_DONE_FOLDER ;
// les autres (confirmation d'alerte, mail personnel) restent intacts.

export type AlertEmail = {
  uid: number;
  from: string;
  subject: string;
  date: Date | null;
  html: string | null;
  text: string | null;
};

export function imapConfigured() {
  return Boolean(process.env.VEILLE_IMAP_HOST && process.env.VEILLE_IMAP_USER && process.env.VEILLE_IMAP_PASSWORD);
}

function client() {
  return new ImapFlow({
    host: process.env.VEILLE_IMAP_HOST!,
    port: Number(process.env.VEILLE_IMAP_PORT || 993),
    secure: (process.env.VEILLE_IMAP_SECURE ?? "true") !== "false",
    auth: { user: process.env.VEILLE_IMAP_USER!, pass: process.env.VEILLE_IMAP_PASSWORD! },
    logger: false,
  });
}

/**
 * Ouvre la boîte, passe chaque alerte non lue à `handle`, puis range celles
 * pour lesquelles `handle` renvoie true. Renvoie le nombre d'alertes lues.
 */
export async function processAlertEmails(
  handle: (mail: AlertEmail) => Promise<boolean>,
  limit = 200
): Promise<number> {
  const inbox = process.env.VEILLE_IMAP_FOLDER || "INBOX";
  const done = process.env.VEILLE_DONE_FOLDER || "Veille-traitees";
  const imap = client();
  await imap.connect();
  let read = 0;
  try {
    const list = await imap.list();
    if (!list.some((f) => f.path === done)) await imap.mailboxCreate(done).catch(() => undefined);

    const lock = await imap.getMailboxLock(inbox);
    try {
      const uids = ((await imap.search({ seen: false }, { uid: true })) || []).slice(0, limit);
      const toMove: number[] = [];

      for (const uid of uids) {
        const msg = await imap.fetchOne(String(uid), { envelope: true, source: true }, { uid: true });
        if (!msg) continue;
        const from = msg.envelope?.from?.[0]?.address ?? "";
        if (!isKnownSender(from) || !msg.source) continue;

        const parsed = await simpleParser(msg.source);
        read++;
        const keep = await handle({
          uid,
          from,
          subject: parsed.subject ?? "",
          date: parsed.date ?? null,
          html: typeof parsed.html === "string" ? parsed.html : null,
          text: parsed.text ?? null,
        });
        if (keep) toMove.push(uid);
      }

      if (toMove.length) {
        const range = toMove.join(",");
        await imap.messageFlagsAdd(range, ["\\Seen"], { uid: true });
        await imap.messageMove(range, done, { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await imap.logout().catch(() => undefined);
  }
  return read;
}
