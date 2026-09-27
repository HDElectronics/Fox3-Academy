/**
 * [OWNER: displays] A-10C II cockpit displays: HUD, TGP page, TAD, MSG page. Inputs in ./types.ts.
 * See docs/api/displays.md, "A-10C II displays".
 */
export type { A10cHudView, A10cMasterMode, TgpPageView, TadView, MsgPageView } from './types';
export { A10cHud, fmtTtr, ccrpCueFraction, headingTapeLabel, hudPoint as a10cHudPoint, CCRP_TTR_SHOW_S, CCRP_CUE_S, type A10cHudOptions } from './hud';
export { A10cTgpPage, fmtTgpRange, lssText, lssOsbLabel, fovText, trackText, coverSource } from './tgpPage';
export { A10cTadPage, tadProject, bearingRange, fmtBrgRng, hookedPoint, TAD_RING, TAD_SCALES_NM } from './tadPage';
export { A10cMsgPage, msgOsbLabels, MSG_WILCO_OSB, MSG_CNTCO_OSB } from './msgPage';
export { osbAnchor, type OsbLabel, type OsbStyle, type OsbSide } from './mfcd';
