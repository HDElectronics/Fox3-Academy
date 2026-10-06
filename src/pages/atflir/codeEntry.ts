import type { UfcKey, UfcView } from '../harm/types';
import type { LaserCode } from './delivery';
/** Limited lesson code entry. Option ordering is a trainer layout, not a full UFC implementation. */
export class LaserCodeEntry {
  source: 'LTDC' | 'CODE' | null = null;
  selected = false;
  digits = '';
  message = 'Select CODE on STORES or UFC on FLIR.';
  open(source: 'LTDC' | 'CODE'): void {
    this.source = source; this.selected = false; this.digits = ''; this.message = `Select ${source}, enter four digits, then ENT.`;
  }
  key(key: UfcKey): { source: 'LTDC' | 'CODE'; code: LaserCode } | null {
    if (!this.source) return null;
    if (key === 'OPT1') { this.selected = true; this.digits = ''; }
    else if (key === 'CLR') this.digits = '';
    else if (this.selected && /^\d$/.test(key)) this.digits = (this.digits + key).slice(0, 4);
    else if (key === 'ENT' && this.selected) {
      if (this.digits !== '1688' && this.digits !== '1687') { this.message = 'Exercise codes: 1688 or 1687. CLR and enter four digits.'; return null; }
      this.message = `${this.source} ${this.digits} entered.`;
      const result: { source: 'LTDC' | 'CODE'; code: LaserCode } = { source: this.source, code: this.digits }; this.digits = ''; return result;
    }
    return null;
  }
  view(): UfcView {
    return { scratch: this.digits || (this.source ?? 'FLIR / STORES'), options: [{ text: this.source ?? '', cued: this.selected }], hint: this.source && !this.selected ? 'OPT1' : null };
  }
}
