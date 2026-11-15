/**
 * The lab's ultra-wide cap (components.css, .ui-lab max-width) is computed from --lab-strip-est, which is
 * calc(var(--lab-strip-h) + gap). A rule that sets --lab-strip-h to a keyword (auto) makes that calc invalid and the
 * cap falls back to none: the lab jumps to full width. Such a rule must give --lab-strip-est a length as well.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []);
}

/** Innermost `selector { declarations }` blocks, comments removed. */
function rules(css: string): { selector: string; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ selector: m[1].trim(), body: m[2] }));
}

const KEYWORD = /^(auto|none|fit-content|min-content|max-content|initial|inherit|unset|revert)$/;

describe('lab strip height', () => {
  it('gives --lab-strip-est a length wherever --lab-strip-h is not one', () => {
    const offenders: string[] = [];
    let keywordRules = 0;
    for (const file of cssFiles(SRC)) {
      for (const r of rules(readFileSync(file, 'utf8'))) {
        const h = /--lab-strip-h\s*:\s*([^;]+)/.exec(r.body)?.[1].trim();
        if (!h || !KEYWORD.test(h)) continue;
        keywordRules++;
        const est = /--lab-strip-est\s*:\s*([^;]+)/.exec(r.body)?.[1].trim() ?? '';
        if (!est || /var\(--lab-strip-h\)/.test(est) || KEYWORD.test(est)) offenders.push(`${file.slice(SRC.length)}: ${r.selector}`);
      }
    }
    expect(keywordRules).toBeGreaterThan(0);   // the Sortie debrief sizes its strip to the timeline
    expect(offenders).toEqual([]);
  });
});
