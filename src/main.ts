import { createGame } from './game';

const game = createGame();
const start = document.getElementById('start');
const status = document.getElementById('status');
const params = new URLSearchParams(location.search);

async function enter() {
  game.begin(true);
  if (start) start.style.display = 'none';
  const xr = navigator.xr;
  if (!xr || !(await xr.isSessionSupported('immersive-vr').catch(() => false))) return;
  const session = await xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
  await game.renderer.xr.setSession(session);
  session.addEventListener('end', () => {
    if (start) start.style.display = 'flex';
  });
}

document.getElementById('enter')?.addEventListener('click', () => {
  enter().catch((error: Error) => {
    if (start) start.style.display = 'flex';
    if (status) status.textContent = `Could not start: ${error.message}`;
  });
});

if (params.has('shot')) {
  if (start) start.style.display = 'none';
  game.begin(false);
  Object.assign(window, { __sky: game.debug });
}
