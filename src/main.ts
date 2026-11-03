import type { Mode } from './field';
import { createGame } from './game';

const game = createGame();
const start = document.getElementById('start');
const status = document.getElementById('status');
const params = new URLSearchParams(location.search);

async function enter(mode: Mode) {
  game.begin(true, mode);
  if (start) start.style.display = 'none';
  const xr = navigator.xr;
  if (!xr || !(await xr.isSessionSupported('immersive-vr').catch(() => false))) return;
  const session = await xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
  await game.renderer.xr.setSession(session);
  session.addEventListener('end', () => {
    if (start) start.style.display = 'flex';
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () => {
    enter(button.dataset.mode === 'gallery' ? 'gallery' : 'surround').catch((error: Error) => {
      if (start) start.style.display = 'flex';
      if (status) status.textContent = `Could not start: ${error.message}`;
    });
  });
}

if (params.has('shot')) {
  if (start) start.style.display = 'none';
  game.begin(false, params.get('mode') === 'gallery' ? 'gallery' : 'surround');
  Object.assign(window, { __sky: game.debug });
}
