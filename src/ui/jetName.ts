/**
 * Jet names in prose never break at their hyphen ("Su-" / "27"). A no-break hyphen (U+2011) falls back
 * to another font, so each hyphenated designation goes in a `.jet-name` span (white-space: nowrap).
 *
 * `append()` and `setText()` in dom.ts run every string through `jetNameParts`, so page copy built with
 * `h()` gets this for free. Use `jetName(s)` to wrap one name explicitly.
 */
import { AIRCRAFT } from '../data/aircraft';

export const JET_NAME_CLASS = 'jet-name';

export interface TextPart { text: string; jet: boolean }

/**
 * Hyphenated tokens of every jet's short and full name, reduced to the base designation when it ends in
 * digits plus a variant suffix ("Su-27S" → "Su-27", "F/A-18C" → "F/A-18"), so any variant also matches.
 */
export function jetNameTokens(names: readonly string[]): string[] {
  const out = new Set<string>();
  for (const name of names) {
    for (const tok of name.split(/\s+/)) {
      if (!tok.includes('-')) continue;
      const base = tok.replace(/[A-Za-z]+$/, '');
      out.add(/\d$/.test(base) ? base : tok);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Match a designation (plus any variant or plural suffix), not preceded by a word character. */
export function jetNamePattern(tokens: readonly string[]): RegExp {
  return new RegExp(`(?<![\\w/-])(?:${tokens.map(escape).join('|')})[A-Za-z0-9]*`, 'g');
}

const DEFAULT_RE = jetNamePattern(jetNameTokens(
  Object.values(AIRCRAFT).flatMap(s => [s.short, s.name])));

/**
 * Split prose into plain and jet-name parts. Returns null when the text holds no jet name, so callers
 * keep a plain text node (the common, cheap case).
 */
export function jetNameParts(text: string, re: RegExp = DEFAULT_RE): TextPart[] | null {
  if (!text.includes('-')) return null;
  re.lastIndex = 0;
  const parts: TextPart[] = [];
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) parts.push({ text: text.slice(at, m.index), jet: false });
    parts.push({ text: m[0], jet: true });
    at = m.index + m[0].length;
  }
  if (!parts.length) return null;
  if (at < text.length) parts.push({ text: text.slice(at), jet: false });
  return parts;
}

/** One jet name as a nowrap span. */
export function jetName(name: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = JET_NAME_CLASS;
  el.textContent = name;
  return el;
}

const PLAIN_TEXT_PARENTS = new Set(['OPTION', 'TEXTAREA', 'TITLE', 'STYLE', 'SCRIPT']);

/** Whether `parent` renders HTML children, so a string in it may be split into spans. */
export function canWrapJetNames(parent: Node): boolean {
  return parent.nodeType === 1 && (parent as Element).namespaceURI === 'http://www.w3.org/1999/xhtml'
    && !PLAIN_TEXT_PARENTS.has((parent as Element).tagName);
}

/** Text as nodes: a single text node, or text nodes and `.jet-name` spans when it names a jet. */
export function proseNodes(text: string): Node[] {
  const parts = jetNameParts(text);
  if (!parts) return [document.createTextNode(text)];
  return parts.map(p => p.jet ? jetName(p.text) : document.createTextNode(p.text));
}
