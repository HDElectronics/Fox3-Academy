/**
 * Field of view on wide viewports. A perspective camera keeps its vertical field of view, so a wider viewport sees
 * more to the sides; past about 2.4 : 1 the horizontal field passes 96° and a rectilinear picture stretches badly
 * toward the left and right edges. The Stage holds the horizontal field at the MAX_VIEW_ASPECT value instead and
 * narrows the vertical field, through camera.zoom, so any camera.fov a page or camera rig sets composes with it.
 * Pixel maths must use the field actually on screen: camera.getEffectiveFOV() or Stage.viewFov, never camera.fov.
 */

/**
 * Widest viewport shape (width / height) that still widens the picture. Lab views are about 2.3 : 1 at 1440 × 900
 * and 2560 × 1440, so this keeps those pictures unchanged and caps the horizontal field near 96° with the default
 * 50° vertical field; an ultra-wide window shows the same horizontal field with less sky and ground.
 */
export const MAX_VIEW_ASPECT = 2.4;

const D2R = Math.PI / 180;

/** camera.zoom that holds a `maxAspect` viewport's horizontal field of view on a wider viewport (1 when not wider). */
export function wideViewZoom(aspect: number, maxAspect = MAX_VIEW_ASPECT): number {
  if (!(aspect > 0) || !(maxAspect > 0) || !Number.isFinite(maxAspect)) return 1;
  return aspect > maxAspect ? aspect / maxAspect : 1;
}

/** Vertical field of view (deg) on screen for a camera `fovDeg` on a viewport `aspect` wide, after wideViewZoom. */
export function viewFovDeg(fovDeg: number, aspect: number, maxAspect = MAX_VIEW_ASPECT): number {
  return (2 * Math.atan(Math.tan((fovDeg * D2R) / 2) / wideViewZoom(aspect, maxAspect))) / D2R;
}

/** Horizontal field of view (deg) of a picture `aspect` wide with vertical field `vFovDeg`. */
export function horizontalFovDeg(vFovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((vFovDeg * D2R) / 2) * aspect)) / D2R;
}
