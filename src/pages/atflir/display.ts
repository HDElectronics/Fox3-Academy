/** Synthetic teaching image. No optical/thermal performance is modeled. */
import { readTheme } from '../../ui/theme';
import { AtflirSession, FOVS, TARGETS } from './model';
export function drawPod(canvas: HTMLCanvasElement, s: AtflirSession): void {
  const c = canvas.getContext('2d'); if (!c) return;
  const t = readTheme(); const w = 900, h = 650;
  canvas.width = w; canvas.height = h;
  const bright = !s.ir ? t.groundMuted : !s.whiteHot ? t.screen : t.symDim;
  c.fillStyle = s.ir && !s.whiteHot ? t.symDim : t.screen; c.fillRect(0, 0, w, h);
  const zoom = [1, 2, 4][s.fov]!;
  c.save(); c.translate(w / 2, h / 2); c.scale(zoom, zoom); c.translate(-s.x, -s.y);
  c.strokeStyle = t.screenLine; c.lineWidth = 1 / zoom;
  for (let x = -600; x <= 600; x += 40) { c.beginPath(); c.moveTo(x, -500); c.lineTo(x, 500); c.stroke(); }
  for (let y = -500; y <= 500; y += 40) { c.beginPath(); c.moveTo(-600, y); c.lineTo(600, y); c.stroke(); }
  // Concrete apron, road, warehouse roof and parked vehicles are fixed landmarks.
  c.fillStyle = t.screen2; c.fillRect(-105, -105, 210, 210);
  c.fillStyle = t.screenLine; c.fillRect(-600, 110, 1200, 24);
  c.fillRect(185, -500, 22, 1000);
  c.fillStyle = bright; c.fillRect(-65, -38, 115, 70);
  c.strokeStyle = t.screen; c.lineWidth = 2;
  for (let x = -55; x < 45; x += 12) { c.beginPath(); c.moveTo(x, -38); c.lineTo(x, 32); c.stroke(); }
  for (const truck of TARGETS) {
    if (truck.id === 'assigned' && s.obscured) {
      c.fillStyle = t.screenLine; c.fillRect(truck.x - 25, truck.y - 23, 50, 46); continue;
    }
    c.fillStyle = bright; c.fillRect(truck.x - 9, truck.y - 15, 18, 30);
    c.fillStyle = t.screen; c.fillRect(truck.x - 6, truck.y - 8, 12, 3);
    c.fillRect(truck.x - 12, truck.y - 10, 3, 7); c.fillRect(truck.x + 9, truck.y - 10, 3, 7);
    c.fillRect(truck.x - 12, truck.y + 7, 3, 7); c.fillRect(truck.x + 9, truck.y + 7, 3, 7);
  }
  c.restore();
  c.fillStyle = t.screen; c.fillRect(0, 0, w, 65); c.fillRect(0, h - 58, w, 58);
  c.fillStyle = t.sym; c.font = `19px ${t.fontMono}`; c.textAlign = 'left';
  c.fillText(`${FOVS[s.fov]}     ${s.ir ? 'IR' : 'TV'}${s.ir ? s.whiteHot ? '  WHT' : '  BLK' : ''}`, 25, 36);
  c.textAlign = 'right'; c.fillText(s.focused ? 'TDC ◇' : 'NO TDC', w - 25, 36);
  c.textAlign = 'center'; c.fillText(s.mode === 'AUTO' && !s.tracked ? 'INR AUTO' : s.mode, w / 2, h - 28);
  c.textAlign = 'left'; c.fillText('OPR', 25, h - 28); c.textAlign = 'right'; c.fillText('A/G', w - 25, h - 28);
  c.strokeStyle = t.sym; c.lineWidth = 2;
  const cx = w / 2, cy = h / 2;
  if (s.mode === 'AUTO' && s.tracked) {
    c.strokeRect(cx - 15 * zoom, cy - 20 * zoom, 30 * zoom, 40 * zoom);
  } else {
    c.beginPath(); c.moveTo(cx - 55, cy); c.lineTo(cx - 12, cy); c.moveTo(cx + 12, cy); c.lineTo(cx + 55, cy);
    c.moveTo(cx, cy - 55); c.lineTo(cx, cy - 12); c.moveTo(cx, cy + 12); c.lineTo(cx, cy + 55); c.stroke();
    if (s.mode === 'SCENE') c.strokeRect(cx - 75, cy - 60, 150, 120);
  }
  c.fillRect(cx - 2, cy - 2, 4, 4);
  if (s.fov < 2) { c.setLineDash([8, 10]); c.strokeRect(cx - 180, cy - 125, 360, 250); c.setLineDash([]); }
}
