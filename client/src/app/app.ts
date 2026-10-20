import { gamesScreen, homeScreen, roomScreen } from '../ui/screens';
import { createPetState, pet } from '../pets/pets';

export function startApp() {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Missing app root');
  let cleanup: (() => void) | undefined;
  let version = 0;
  const petState = createPetState();

  async function render() {
    const currentVersion = ++version;
    cleanup?.();
    cleanup = undefined;
    const page = location.hash.slice(1);
    const inRoom = page === 'room' || page === 'pet-room';
    document.body.classList.toggle('in-room', inRoom);
    root!.innerHTML = inRoom ? roomScreen(page === 'pet-room') : page === 'minigames' ? gamesScreen() : homeScreen();
    window.scrollTo(0, 0);
    if (!inRoom) return;

    const canvas = root!.querySelector<HTMLCanvasElement>('#room-canvas')!;
    const dialog = root!.querySelector<HTMLDialogElement>('#exit-dialog')!;
    const pets = root!.querySelector<HTMLDialogElement>('#pet-dialog')!;
    const menu = root!.querySelector<HTMLElement>('#room-menu')!;
    const menuToggle = root!.querySelector<HTMLButtonElement>('#room-menu-toggle')!;
    const equipButton = root!.querySelector<HTMLButtonElement>('#toggle-pet')!;
    let room: ReturnType<typeof import('../room/room').createRoom> | undefined;
    const updateEquipment = () => {
      root!.querySelector<HTMLElement>('#pet-equipped-badge')!.hidden = !petState.equipped;
      equipButton.textContent = petState.equipped ? '해제' : '장착';
      equipButton.classList.toggle('equipped', petState.equipped);
      root!.querySelector<HTMLElement>('#pet-save-notice')!.hidden = petState.persistent;
    };
    const setMenu = (open: boolean) => {
      menu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      room?.setPaused(open);
      if (open) root!.querySelector<HTMLButtonElement>('#open-pets')!.focus();
    };
    const openPets = () => {
      if (dialog.open || pets.open) return;
      setMenu(false);
      updateEquipment();
      pets.showModal();
      room?.setPaused(true);
    };
    menuToggle.addEventListener('click', () => {
      setMenu(menu.hidden !== false);
      if (menu.hidden) canvas.focus();
    });
    root!.querySelector('#open-pets')!.addEventListener('click', openPets);
    root!.querySelector('#close-pets')!.addEventListener('click', () => pets.close());
    pets.addEventListener('close', () => {
      room?.setPaused(false);
      canvas.focus();
    });
    equipButton.addEventListener('click', () => {
      petState.setEquipped(!petState.equipped);
      updateEquipment();
      room?.setPet(petState.equipped ? pet : null);
    });
    root!.querySelector('#exit-room')!.addEventListener('click', () => {
      setMenu(false);
      dialog.returnValue = '';
      dialog.showModal();
      room?.setPaused(true);
    });
    dialog.addEventListener('close', () => {
      if (dialog.returnValue === 'yes') location.hash = 'home';
      else { room?.setPaused(false); canvas.focus(); }
    });
    const shortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || dialog.open || pets.open) return;
      if (event.code === 'Escape' && !menu.hidden) {
        event.preventDefault();
        setMenu(false);
        canvas.focus();
      } else if (event.code === 'KeyP' && document.activeElement === canvas) {
        event.preventDefault();
        openPets();
      }
    };
    window.addEventListener('keydown', shortcut);
    cleanup = () => { window.removeEventListener('keydown', shortcut); room?.dispose(); };
    updateEquipment();

    try {
      const { createRoom } = await import('../room/room');
      if (currentVersion !== version) return;
      room = createRoom(canvas, root!.querySelector('#room-name-tag')!, root!.querySelector('.room-loading')!, {
        portalHint: root!.querySelector('#portal-hint')!,
        onPortal: () => { location.hash = page === 'pet-room' ? 'room' : 'pet-room'; },
        onPetStatus: (message) => {
          if (currentVersion !== version) return;
          for (const id of ['#pet-scene-status', '#pet-model-notice']) {
            const notice = root!.querySelector<HTMLElement>(id)!;
            notice.hidden = !message;
            notice.textContent = message;
          }
        },
      });
      room.setPaused(!menu.hidden || pets.open || dialog.open);
      room.setPet(petState.equipped ? pet : null);
    } catch (error) {
      if (currentVersion !== version) return;
      root!.querySelector('.room-loading')!.textContent = '3D 마이룸을 시작할 수 없습니다. WebGL 지원 및 파일 연결을 확인해주세요.';
      console.error(error);
    }
  }

  window.addEventListener('hashchange', render);
  void render();
}
