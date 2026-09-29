/** Reads the emails the local API sent to Mailpit (http://localhost:8025), when it is set up to use it. */
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MessageSummary {
  readonly ID: string;
}

/** The text of the latest email sent to `to`, waiting a little for it to arrive. */
export async function latestEmailText(to: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: MessageSummary[] };
    const latest = messages[0];
    if (latest) {
      const message = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`);
      return ((await message.json()) as { Text: string }).Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no email to ${to} in Mailpit`);
}

/** The first link of an email's text that goes to `path` on the site. */
export function linkTo(text: string, path: string): string {
  const match = text.match(new RegExp(`https?://\\S+${path.replace(/[/]/g, "\\/")}\\S*`));
  if (!match) throw new Error(`no link to ${path} in:\n${text}`);
  return new URL(match[0]).pathname + new URL(match[0]).search;
}
