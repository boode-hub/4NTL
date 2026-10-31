/**
 * Country flags. Flags are emoji (two regional-indicator letters), but Windows
 * has no flag glyphs and shows just the letters, so we bring our own: a
 * flags-only Twemoji font (CC BY 4.0, see THIRD_PARTY_NOTICES.md). It's inlined
 * in the bundle and registered from bytes, so no page CSP or web-accessible
 * resource is involved, and it covers only the regional-indicator range.
 */
import FLAGS_WOFF2 from './flags.woff2';

export const FLAG_FONT = '4NTL Flags';

let added = false;

/** Registers the font with the document once; shadow roots use document fonts too. */
export function ensureFlagFont(): void {
  if (added || typeof FontFace !== 'function') return;
  added = true;
  try {
    const bytes = Uint8Array.from(atob(FLAGS_WOFF2), (c) => c.charCodeAt(0));
    const face = new FontFace(FLAG_FONT, bytes, { unicodeRange: 'U+1F1E6-1F1FF' });
    document.fonts.add(face);
    void face.load().catch(() => undefined);
  } catch {
    // Flags then show as letters ("DE"); everything else is unaffected.
  }
}
