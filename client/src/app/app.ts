import { connectPetShop } from '../ui/petShop';
import { addDemoCells, getMe } from '../api/shop';
import { createPetWindow, roomPetOf, yardPetOf } from '../ui/petWindow';
import type { Pet as ServerPet } from '../../../shared/types';
import { gamesScreen, homeScreen, roomScreen } from '../ui/screens';
import { createPetState } from '../pets/pets';
import { openGame } from '../ui/gameScreen';
import { formatRankingWeek } from '../ui/weeklyRanking';
import { minigameApi } from '../api/minigame';
import { clearAccount, restoreAccount, type AccountUser } from '../api/auth';
import { showAccountScreen } from '../ui/accountScreen';

export function startApp() {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) throw new Error('Missing app root');
  let cleanup: (() => void) | undefined;
  let version = 0;
  const petState = createPetState();
  let account: AccountUser | null = null;

  async function render() {
    if (!account) return;
    const currentVersion = ++version;
    cleanup?.();
    cleanup = undefined;
    const page = location.hash.slice(1);
    const loginId = account.loginId;
    const inRoom = page === 'room' || page === 'pet-room';
    document.body.classList.toggle('in-room', inRoom);
    root!.innerHTML = inRoom ? roomScreen(page === 'pet-room', loginId) : page === 'minigames' ? gamesScreen(loginId, account.cellBalance) : homeScreen(account);
    root!.querySelector('#change-account')?.addEventListener('click', () => {
      cleanup?.();
      cleanup = undefined;
      clearAccount();
      account = null;
      selectAccount();
    });
    window.scrollTo(0, 0);
    // 미니게임 화면일 경우 버튼 이벤트 연결
    if (page === 'minigames') {
      const api = minigameApi();
      const signedIn = account;
      const updateBalance = (balance: number) => {
        if (account !== signedIn) return;
        signedIn.cellBalance = balance;
        const wallet = root!.querySelector('.wallet');
        if (!wallet) return;
        const cells = balance.toLocaleString();
        wallet.innerHTML = `<span aria-hidden="true">⬡</span> ${cells}`;
        wallet.setAttribute('aria-label', `보유 ${cells} 셀`);
      };
      const playBtn = root!.querySelector<HTMLButtonElement>('#start-minigame-btn');
      const leaderboardBtn = root!.querySelector<HTMLButtonElement>('#leaderboard-btn');
      const leaderboardModal = root!.querySelector<HTMLDivElement>('#leaderboard-modal');
      const leaderboardCloseBtn = root!.querySelector<HTMLButtonElement>('#leaderboard-close-btn');
      const leaderboardConfirmBtn = root!.querySelector<HTMLButtonElement>('#leaderboard-confirm-btn');
      const leaderboardList = root!.querySelector<HTMLOListElement>('#leaderboard-list');
      const leaderboardBestScore = root!.querySelector<HTMLElement>('#leaderboard-best-score');
      const leaderboardWeek = root!.querySelector<HTMLElement>('#leaderboard-week');

      const renderLeaderboard = async (): Promise<void> => {
        if (!leaderboardList || !leaderboardBestScore) return;
        leaderboardBestScore.textContent = '불러오는 중…';
        leaderboardList.replaceChildren();
        if (leaderboardWeek) leaderboardWeek.textContent = '';
        try {
          const { weekStart, myRank, entries: rows } = await api.ranking();
          if (currentVersion !== version) return;
          if (leaderboardWeek) leaderboardWeek.textContent = formatRankingWeek(weekStart);
          leaderboardBestScore.textContent = myRank
            ? `${myRank.bestScore.toLocaleString()}점 · ${myRank.rank}위`
            : '기록 없음';

          if (rows.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'leaderboard-empty';
            empty.textContent = '이번 주 플레이 기록이 없어요.';
            leaderboardList.appendChild(empty);
            return;
          }

          rows.forEach(({ bestScore, nickname, rank: position }) => {
            const item = document.createElement('li');
            item.className = 'leaderboard-item';
            const rank = document.createElement('span');
            rank.className = 'leaderboard-rank';
            rank.textContent = `${position}위 · ${nickname}`;
            const value = document.createElement('strong');
            value.className = 'leaderboard-score';
            value.textContent = `${bestScore.toLocaleString()}점`;
            item.append(rank, value);
            leaderboardList.appendChild(item);
          });
        } catch {
          if (currentVersion === version) leaderboardBestScore.textContent = '순위를 불러오지 못했어요.';
        }
      };

      const closeLeaderboard = (): void => {
        if (!leaderboardModal) return;
        leaderboardModal.hidden = true;
        leaderboardModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('leaderboard-open');
        leaderboardBtn?.focus();
      };

      const openLeaderboard = (): void => {
        if (!leaderboardModal) return;
        void renderLeaderboard();
        leaderboardModal.hidden = false;
        leaderboardModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('leaderboard-open');
        leaderboardCloseBtn?.focus();
      };

      const onLeaderboardKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && leaderboardModal && !leaderboardModal.hidden) {
          closeLeaderboard();
        }
      };
      
      if (playBtn) {
        let disposeGame: (() => void) | undefined;
        const closeGame = () => {
          disposeGame?.();
          disposeGame = undefined;
          playBtn.focus();
        };

        leaderboardBtn?.addEventListener('click', openLeaderboard);
        leaderboardCloseBtn?.addEventListener('click', closeLeaderboard);
        leaderboardConfirmBtn?.addEventListener('click', closeLeaderboard);
        leaderboardModal?.addEventListener('click', (event) => {
          if (event.target === leaderboardModal) closeLeaderboard();
        });
        document.addEventListener('keydown', onLeaderboardKeyDown);

        playBtn.addEventListener('click', () => {
          if (!disposeGame) disposeGame = openGame(closeGame, updateBalance);
        });

        cleanup = () => {
            closeGame();
            document.removeEventListener('keydown', onLeaderboardKeyDown);
            document.body.classList.remove('leaderboard-open');
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
    let room: ReturnType<typeof import('../room/room').createRoom> | undefined;
    // 🟩 펫 창(P): 서버의 내 펫 목록으로 도감처럼 보여주고, 대표 펫을 마이룸에서 따라다니게 한다 (창규)
    let representative: ServerPet | undefined;
    let representativeKey = 'none';
    let yardPets: ReturnType<typeof yardPetOf>[] = [];
    const petWindow = createPetWindow(root!.querySelector<HTMLElement>('#pet-window')!, pet => {
      representative = pet;
      const key = pet ? `${pet.userPetId}` : 'none';
      if (key === representativeKey) return;
      representativeKey = key;
      room?.setPet(roomPetOf(pet));
    }, pets => {
      yardPets = pets.map(yardPetOf);   // 펫 정원 마당: 보유 펫 전체 (장착 펫은 마당에서 빠짐)
      room?.setYardPets(yardPets);
    });
    void petWindow.refresh();
    const updateEquipment = () => { if (pets.open) void petWindow.refresh(); };
    const setMenu = (open: boolean) => {
      menu.hidden = !open;
      menuToggle.setAttribute('aria-expanded', String(open));
      room?.setPaused(open);
      if (open) root!.querySelector<HTMLButtonElement>('#open-pets')!.focus();
    };
    const openPets = () => {
      if (dialog.open || pets.open || shop.open) return;
      setMenu(false);
      void petWindow.refresh();
      pets.showModal();
      room?.setPaused(true);
    };
    const showShop = connectPetShop(shop, updateEquipment);
    const openShop = () => {
      if (dialog.open || pets.open || shop.open) return;
      setMenu(false);
      showShop();
      room?.setPaused(true);
    };
    // 시연용 셀 충전 버튼: 현재 잔액을 보여주고, 누르면 100 셀 추가
    const cellButton = root!.querySelector<HTMLButtonElement>('#demo-cells')!;
    const cellText = root!.querySelector<HTMLElement>('#demo-cell-balance')!;
    const user = account;
    const showCells = (balance: number) => { user.cellBalance = balance; cellText.textContent = balance.toLocaleString(); };
    showCells(user.cellBalance);
    void getMe().then(me => showCells(me.cellBalance)).catch(() => {});
    cellButton.addEventListener('click', async () => {
      cellButton.disabled = true;
      try { showCells((await addDemoCells()).balance); }
      catch (error) { cellButton.title = error instanceof Error ? error.message : '셀을 충전하지 못했어요.'; }
      finally { cellButton.disabled = false; canvas.focus(); }
    });
    shop.addEventListener('close', () => { void petWindow.refresh(); });   // 뽑기로 새 펫이 생겼을 수 있음 → 마당 다시 맞추기
    shop.addEventListener('close', () => { void getMe().then(me => showCells(me.cellBalance)).catch(() => {}); });
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
      // 펫 창이 열려 있을 때 P 를 한 번 더 누르면 닫는다 (창규)
      if (pets.open && event.code === 'KeyP' && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        pets.close();
        return;
      }
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
      room.setYardPets(yardPets);
      room.setPet(roomPetOf(representative));
    } catch (error) {
      if (currentVersion !== version) return;
      root!.querySelector('.room-loading')!.textContent = '3D 마이룸을 시작할 수 없습니다. WebGL 지원 및 파일 연결을 확인해주세요.';
      console.error(error);
    }
  }

  function selectAccount() {
    void showAccountScreen(root!, (user) => {
      account = user;
      void render();
    });
  }

  window.addEventListener('hashchange', render);
  root.innerHTML = '<main class="account-page"><p role="status">로그인 상태를 확인하는 중이에요.</p></main>';
  void restoreAccount().then((user) => {
    account = user;
    if (account) void render();
    else selectAccount();
  });
}
