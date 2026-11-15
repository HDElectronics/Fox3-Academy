import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { AppStore } from './app/store';
import { Router } from './app/router';
import { buildShell } from './app/shell';
import { currentDevice, isPhone, phoneGatePanel } from './app/deviceGate';
import { applyProgressFixture } from './app/progressFixture';

const root = document.getElementById('app')!;
if (isPhone(currentDevice())) {
  // Desktop only: phones get a short panel instead of the app (no shell, no 3D).
  root.replaceChildren(phoneGatePanel());
} else {
  const app = new AppStore();
  // Screenshot fixtures ('?progress=mid'), dev server only; saved progress is never touched.
  if (import.meta.env.DEV) applyProgressFixture(app);
  const { outlet, setActive } = buildShell(root, app);
  const router = new Router(outlet, app);
  router.onChange = setActive;
  router.resolve(true);
}
