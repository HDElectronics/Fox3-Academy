/** Merge controls and weapon/mode compatibility. DCS bindings stay in the reference data. */
import type { AcmJet, AcmModeId } from '../../data/acm';
import { setAcmMode } from '../../sim/acm';
import type { MergeRun } from './runner';

export type Weapon = 'gun' | 'ir';
export const UNCAGE_KEY = 'C';

export function growlCoach(jet: AcmJet): string {
  return jet.ir.uncage.value === 'key' ? `Growl. Uncage (${UNCAGE_KEY}).` : 'Growl. Hold him in the seeker.';
}

export function setMergeMode(run: MergeRun, id: AcmModeId | null, weapon: Weapon): Weapon {
  if (!run.acm || !setAcmMode(run.world, run.me, run.acm, id)) return weapon;
  // Selecting Hornet GACQ selects guns, as documented in the research notes.
  return id === 'gacq' ? 'gun' : weapon;
}

export function setMergeWeapon(run: MergeRun, weapon: Weapon): void {
  if (weapon === 'ir' && run.acm?.mode === 'gacq') {
    // BST is the trainer's compatible fallback; discard the GACQ lock and its slaved seeker.
    setAcmMode(run.world, run.me, run.acm, 'bst');
    run.acm.seeker = { mode: 'caged', tone: 'none', targetId: null, heatS: 0, uncageReq: false };
  }
  if (weapon === 'ir') run.stick.trigger = false;
}
