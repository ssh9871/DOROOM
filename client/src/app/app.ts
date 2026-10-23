import { connectPetShop } from '../ui/petShop';
import { gamesScreen, homeScreen, roomScreen } from '../ui/screens';
import { createPetState } from '../pets/pets';
import { Game } from '../game/Game';

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
    root!.innerHTML = inRoom ? roomScreen(page === 'pet-room', petState.user) : page === 'minigames' ? gamesScreen(petState.user) : homeScreen(petState.user);
    window.scrollTo(0, 0);
    // 미니게임 화면일 경우 버튼 이벤트 연결
    if (page === 'minigames') {
      const playBtn = root!.querySelector<HTMLButtonElement>('#start-minigame-btn');
      
      if (playBtn) {
        let gameInstance: Game | null = null;

        playBtn.addEventListener('click', () => {
          // 1. 기존 화면을 완벽히 덮는 '전체 화면 오버레이' 생성
          const overlay = document.createElement('div');
          overlay.id = 'game-fullscreen-overlay';
          overlay.style.position = 'fixed';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100vw';
          overlay.style.height = '100vh';
          overlay.style.backgroundColor = '#1a1a2e'; // 게임 배경색 (어두운 남색)
          overlay.style.zIndex = '9999'; // 화면 맨 위로 올리기
          overlay.style.display = 'flex';
          overlay.style.flexDirection = 'column';
          overlay.style.alignItems = 'center';
          overlay.style.justifyContent = 'center';

          // 2. 상단에 '< DOROBUS로 돌아가기' 버튼 영역 만들기
          const header = document.createElement('div');
          header.style.position = 'absolute';
          header.style.top = '0';
          header.style.left = '0';
          header.style.width = '100%';
          header.style.padding = '20px';
          header.style.display = 'flex';
          header.style.justifyContent = 'flex-start'; // 왼쪽 정렬
          
          const closeBtn = document.createElement('button');
          closeBtn.innerText = '〈 DOROBUS로 돌아가기';
          closeBtn.style.padding = '10px 20px';
          closeBtn.style.backgroundColor = 'transparent';
          closeBtn.style.color = '#fff';
          closeBtn.style.border = 'none';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.fontSize = '16px';
          closeBtn.style.fontWeight = 'bold';
          
          header.appendChild(closeBtn);
          overlay.appendChild(header);

          // 3. 게임 도화지(Canvas) 생성 및 중앙 배치
          const canvas = document.createElement('canvas');
          canvas.id = 'game';
          // 종스크롤 게임에 맞게 캔버스 크기 고정 (원하는 사이즈로 조절 가능)
          canvas.width = 600; 
          canvas.height = 800;
          canvas.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.8)'; // 게임 테두리에 살짝 그림자 효과
          canvas.style.borderRadius = '12px'; // 테두리 둥글게
          
          overlay.appendChild(canvas);

          // 4. 완성된 전체 화면 덮개를 웹페이지(body)에 부착
          document.body.appendChild(overlay);

          // 5. 게임 실행
          gameInstance = new Game(canvas);
          gameInstance.start();

          // 이벤트를 감지하여 오버레이를 지우는 코드!
         canvas.addEventListener('game-quit', () => {
             const overlay = document.getElementById('game-fullscreen-overlay');
             if (overlay) {
                 document.body.removeChild(overlay);
             }
         });

          // 6. 돌아가기 버튼을 눌렀을 때의 동작 (덮개 치우기)
          closeBtn.addEventListener('click', () => { 
             
             // 덮개를 화면에서 삭제하여 원래 메뉴로 복귀
             document.body.removeChild(overlay);
          });
        });

        cleanup = () => {
            // 다른 탭으로 이동할 때 오버레이가 남아있으면 삭제
            const existingOverlay = document.getElementById('game-fullscreen-overlay');
            if (existingOverlay) document.body.removeChild(existingOverlay);
        };
      }
      return;
    }
    if (!inRoom) return;

    const canvas = root!.querySelector<HTMLCanvasElement>('#room-canvas')!;
    const dialog = root!.querySelector<HTMLDialogElement>('#exit-dialog')!;
    const pets = root!.querySelector<HTMLDialogElement>('#pet-dialog')!;
    const shop = root!.querySelector<HTMLDialogElement>('#shop-dialog')!;
    const menu = root!.querySelector<HTMLElement>('#room-menu')!;
    const menuToggle = root!.querySelector<HTMLButtonElement>('#room-menu-toggle')!;
    const equipButton = root!.querySelector<HTMLButtonElement>('#toggle-pet')!;
    let room: ReturnType<typeof import('../room/room').createRoom> | undefined;
    const updateEquipment = () => {
      root!.querySelector<HTMLElement>('#pet-equipped-badge')!.hidden = !petState.equipped;
      equipButton.textContent = petState.equipped ? '해제' : '장착';
      equipButton.classList.toggle('equipped', petState.equipped);
      const saveNotice = root!.querySelector<HTMLElement>('#pet-save-notice')!;
      saveNotice.hidden = petState.persistent && !petState.recovered;
      saveNotice.textContent = !petState.persistent ? '저장할 수 없어 새로고침하면 변경 사항이 사라질 수 있어요.' : '잘못된 저장 값을 기본값으로 복구했어요.';
      root!.querySelector('#pet-affection')!.textContent = `${petState.pet.affection}/100`;
      root!.querySelector('#pet-hunger')!.textContent = `${petState.pet.hunger}/100`;
      root!.querySelector('#pet-progress')!.textContent = `Lv. ${petState.pet.level} · 경험치 ${petState.pet.experience}/${petState.requiredExperience}`;
    };
    const setMenu = (open: boolean) => {
      menu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      room?.setPaused(open);
      if (open) root!.querySelector<HTMLButtonElement>('#open-pets')!.focus();
    };
    const openPets = () => {
      if (dialog.open || pets.open || shop.open) return;
      setMenu(false);
      updateEquipment();
      pets.showModal();
      room?.setPaused(true);
    };
    const showShop = connectPetShop(shop, petState, updateEquipment);
    const openShop = () => {
      if (dialog.open || pets.open || shop.open) return;
      setMenu(false);
      showShop();
      room?.setPaused(true);
    };
    root!.querySelector('#close-shop')!.addEventListener('click', () => shop.close());
    shop.addEventListener('close', () => { room?.setPaused(false); canvas.focus(); });
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
      room?.setPet(petState.equipped ? petState.pet : null);
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
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || dialog.open || pets.open || shop.open) return;
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
        petRoom: page === 'pet-room',
        shopHint: root!.querySelector('#shop-hint')!,
        onShop: openShop,
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
      room.setPaused(!menu.hidden || pets.open || dialog.open || shop.open);
      room.setPet(petState.equipped ? petState.pet : null);
    } catch (error) {
      if (currentVersion !== version) return;
      root!.querySelector('.room-loading')!.textContent = '3D 마이룸을 시작할 수 없습니다. WebGL 지원 및 파일 연결을 확인해주세요.';
      console.error(error);
    }
  }

  window.addEventListener('hashchange', render);
  void render();
}
