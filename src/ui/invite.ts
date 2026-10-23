// Invite links: https://<site>/?oda=K7QZ opens the menu and joins room K7QZ directly.
import { CODE_ALPHABET } from '../net/lobby';

const PARAM = 'oda';

export const inviteUrl = (code: string, origin = location.origin): string => `${origin}/?${PARAM}=${code}`;

/** Room code from a query string like "?oda=k7qz", or null if absent/invalid. */
export function readInvite(search = location.search): string | null {
  const c = new URLSearchParams(search).get(PARAM)?.trim().toUpperCase() ?? '';
  return c.length === 4 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}

/** Drop ?oda= from the address bar so leaving the room doesn't re-join on the next menu visit. */
export function clearInvite(): void {
  const url = new URL(location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/** Native share sheet on phones (WhatsApp etc.), clipboard elsewhere. */
export async function shareInvite(code: string, gameTitle: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteUrl(code);
  const text = `${gameTitle} oynuyoruz, gel! Oda: ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Oyun Gecesi', text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'failed'; // user closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
