import { gamesScreen, homeScreen, roomScreen } from '../ui/screens';

export function startApp() {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Missing app root');
  let cleanup: (() => void) | undefined;
  let version = 0;

  async function render() {
    const currentVersion = ++version;
    cleanup?.();
    cleanup = undefined;
    const page = location.hash.slice(1);
    document.body.classList.toggle('in-room', page === 'room');
    root!.innerHTML = page === 'room' ? roomScreen() : page === 'minigames' ? gamesScreen() : homeScreen();
    window.scrollTo(0, 0);
    if (page !== 'room') return;

    const canvas = root!.querySelector<HTMLCanvasElement>('#room-canvas')!;
    const dialog = root!.querySelector<HTMLDialogElement>('dialog')!;
    root!.querySelector('#exit-room')!.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'yes') location.hash = 'home';
      else canvas.focus();
    });

    try {
      const { createRoom } = await import('../room/room');
      if (currentVersion !== version) return;
      cleanup = createRoom(canvas, root!.querySelector('#room-name-tag')!, root!.querySelector('.room-loading')!);
    } catch (error) {
      if (currentVersion !== version) return;
      root!.querySelector('.room-loading')!.textContent = '3D 마이룸을 시작할 수 없습니다. WebGL 지원 및 파일 연결을 확인해주세요.';
      console.error(error);
    }
  }

  window.addEventListener('hashchange', render);
  void render();
}
