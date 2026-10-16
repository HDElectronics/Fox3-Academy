/**
 * [OWNER: displays] A-10C II cockpit displays: HUD, TGP page, MAV page, TAD, MSG page, CDU screen. Inputs in ./types.ts.
 * See docs/api/displays.md, "A-10C II displays".
 */
export type { A10cHudView, A10cMasterMode, TgpPageView, TadView, MsgPageView, MavPageView, HudMavCue, CduView } from './types';
export { A10cHud, fmtTtr, ccrpCueFraction, headingTapeLabel, hudPoint as a10cHudPoint, CCRP_TTR_SHOW_S, CCRP_CUE_S, type A10cHudOptions } from './hud';
export { A10cTgpPage, fmtTgpRange, lssText, lssOsbLabel, fovText, trackText, coverSource } from './tgpPage';
export { A10cTadPage, tadProject, bearingRange, fmtBrgRng, hookedPoint, TAD_RING, TAD_SCALES_NM } from './tadPage';
export { A10cMavPage, mavStaple, mavBreakSpread, mavProfileLabel, fmtMavRange, drawMavStaple, MAV_DLZ_SCALE_NM, MAV_BREAK_SPREAD_S, type MavStaple } from './mavPage';
export { A10cMsgPage, msgOsbLabels, MSG_WILCO_OSB, MSG_CNTCO_OSB } from './msgPage';
export { osbAnchor, type OsbLabel, type OsbStyle, type OsbSide } from './mfcd';
export { A10cCduScreen, cduRowCentre, cduGrid, CDU_COLS, CDU_ROWS, CDU_ASPECT, CDU_PAD_Y, CDU_VECTOR_GLYPHS } from './cduScreen';
