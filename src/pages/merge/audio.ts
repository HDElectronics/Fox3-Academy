/** Page audio lifetime: hide closes the graph; only a later visible-page gesture can recreate it. */
import { IrToneAudio, type IrToneOptions } from '../../ui/displays/irToneAudio';
import type { IrTone } from '../../sim/acm';

export class MergeAudio {
  private audio: IrToneAudio | null = null;
  private disposed = false;
  private pageHidden = false;
  private readonly visibility = () => { if (this.doc.hidden) this.close(); };
  private readonly hide = () => { this.pageHidden = true; this.close(); };
  private readonly show = () => { this.pageHidden = false; };

  constructor(private readonly doc: EventTarget & { readonly hidden: boolean }, private readonly win: EventTarget,
    private readonly options: IrToneOptions = {}) {
    doc.addEventListener('visibilitychange', this.visibility);
    win.addEventListener('pagehide', this.hide);
    win.addEventListener('pageshow', this.show);
  }

  async start(): Promise<void> {
    if (this.disposed || this.doc.hidden || this.pageHidden) return;
    this.audio ??= new IrToneAudio(this.options);
    if (!this.audio.enabled) await this.audio.start();
  }

  setTone(tone: IrTone): void { this.audio?.setTone(tone); }
  stop(): void { this.close(); }

  private close(): void {
    this.audio?.dispose();
    this.audio = null;
  }

  dispose(): void {
    this.disposed = true;
    this.close();
    this.doc.removeEventListener('visibilitychange', this.visibility);
    this.win.removeEventListener('pagehide', this.hide);
    this.win.removeEventListener('pageshow', this.show);
  }
}
