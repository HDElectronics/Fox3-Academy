/**
 * Search over the repository's sourced notes (docs/research/*.md and the copilot doc), so an LLM answers procedure
 * and cue questions from cited research instead of memory. Notes are split at # to ### headings; a section scores
 * query words (and pilot aliases such as Hornet = fa18c) in its heading (x4), body (weighted down for long
 * sections) and file name. No index file: the notes are small.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface NoteSection { file: string; heading: string; text: string }
export interface NoteHit extends NoteSection { score: number }

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'how', 'what', 'do', 'i', 'my', 'me', 'it', 'at', 'by']);

export function splitSections(file: string, md: string): NoteSection[] {
  const out: NoteSection[] = [];
  let heading = '(top)';
  let body: string[] = [];
  const flush = () => { const text = body.join('\n').trim(); if (text) out.push({ file, heading, text }); };
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) { flush(); heading = m[2]!.trim(); body = []; } else body.push(line);
  }
  flush();
  return out;
}

/** Pilot names for jets and kit, mapped to how the notes and their file names spell them. */
const ALIASES: Record<string, string[]> = {
  hornet: ['fa18c', 'f/a-18c', 'hornet'], viper: ['f16c', 'f-16c', 'viper'], tomcat: ['f14', 'f-14', 'tomcat'],
  eagle: ['f15c', 'f-15c', 'eagle'], flanker: ['su27', 'su-27', 'flanker'], fulcrum: ['mig29', 'mig-29', 'fulcrum'],
  amraam: ['aim-120', 'amraam'], rwr: ['rwr', 'alr-67'],
};

export const terms = (q: string) => q.toLowerCase().split(/[^a-z0-9+/-]+/).filter(w => w.length > 1 && !STOP.has(w));

export function search(sections: readonly NoteSection[], query: string, limit = 4): NoteHit[] {
  const words = terms(query);
  if (!words.length) return [];
  const count = (hay: string, w: string) => hay.split(w).length - 1;
  return sections
    .map(s => {
      const h = s.heading.toLowerCase(), b = s.text.toLowerCase(), f = s.file.toLowerCase();
      // Long sections mention everything: a body hit counts 1 in a short section and less in a long one.
      const bodyWeight = Math.sqrt(400 / Math.max(400, b.length));
      let score = 0, matched = 0;
      for (const w of words) {
        let best = 0;
        for (const a of ALIASES[w] ?? [w]) {
          best = Math.max(best, 4 * count(h, a) + Math.min(count(b, a), 12) * bodyWeight + (f.includes(a) ? 3 : 0));
        }
        if (best > 0) matched++;
        score += best;
      }
      // Sections that match more of the query words rank first.
      return { ...s, score: score * (matched / words.length) ** 2 };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Load docs/research/*.md and docs/copilot.md under the repository root. */
export function loadNotes(root: string): NoteSection[] {
  const dir = join(root, 'docs', 'research');
  const files = [...readdirSync(dir).filter(f => f.endsWith('.md')).map(f => join(dir, f)), join(root, 'docs', 'copilot.md')];
  return files.flatMap(p => {
    try { return splitSections(relative(root, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')); } catch { return []; }
  });
}
