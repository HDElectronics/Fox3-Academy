import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { AppStore } from './app/store';
import { Router } from './app/router';
import { buildShell } from './app/shell';

const app = new AppStore();
const root = document.getElementById('app')!;
const { outlet, setActive } = buildShell(root, app);
const router = new Router(outlet, app);
router.onChange = setActive;
router.resolve(true);
