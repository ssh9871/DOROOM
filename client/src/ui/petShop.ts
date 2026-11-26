import { shopItems, type PetState } from '../pets/pets';
import { getShopItems, getInventory, getMe, buyItem, getGachaPools, drawGacha } from '../api/shop';
import type { Item, GachaPool, GachaResult, Grade } from '../../../shared/types';

// 🟩 [펫 상점] 탭은 서버 데이터 사용 (창규). 나머지 탭은 아직 브라우저 저장 데이터(PetState).
const itemArtPath: Record<string, string> = { FOOD: '/assets/items/pet-food.svg', TOY: '/assets/items/pet-ball.svg' };
const itemEmoji: Record<string, string> = { SNACK: '🍪', EXP_POTION: '🧪', EVOLVE_STONE: '💎', GAME_BUFF: '⚡' };
const itemArt = (item: Item) => itemArtPath[item.itemType]
  ? `<img src="${itemArtPath[item.itemType]}" alt="${item.name} 모양"/>`
  : `<span aria-hidden="true" style="font-size:72px;line-height:1">${itemEmoji[item.itemType] ?? '📦'}</span>`;
const itemDescription = (item: Item) => {
  const effects = [
    item.hungerRestore > 0 ? `배고픔 +${item.hungerRestore}` : '',
    item.affectionRestore > 0 ? `호감도 +${item.affectionRestore}` : '',
    item.expGain > 0 ? `경험치 +${item.expGain}` : '',
  ].filter(Boolean);
  if (effects.length) return `${effects.join(' · ')}. 1개씩 사용해요.`;
  if (item.itemType === 'EVOLVE_STONE') return '펫을 진화시킬 때 사용해요.';
  if (item.itemType === 'GAME_BUFF') return '미니게임을 시작할 때 사용해요.';
  return '';
};

// 🟩 [펫 뽑기] 탭 (창규): 왼쪽 뽑기, 오른쪽 등급별 도감 (가진 펫은 컬러, 없으면 흐리게)
const gradeInfo: Record<Grade, { label: string; className: string }> = {
  NORMAL: { label: '노말', className: 'grade-normal' },
  RARE: { label: '레어', className: 'grade-rare' },
  LEGEND: { label: '레전드', className: 'grade-legend' },
};
// 뽑기 전 정원판에 세워 둘 실루엣(아무 큐브 펫이면 된다)
const STAGE_MYSTERY = '/assets/pets/pet-polarbear.png';
const escapeHtml =(text: string) => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const petImage = (src: string | null | undefined, name: string) => src
  ? `<img src="${src}" alt=""/>`
  : `<span class="dex-noimg" aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span>`;

function renderGacha(pool: GachaPool | undefined, balance: number | null, last: GachaResult | null, drawing: boolean) {
  if (!pool) return `<div class="shop-coming"><h3>펫 뽑기</h3><p>지금은 뽑기를 할 수 없어요. 잠시 후 다시 열어주세요.</p></div>`;
  const pets = pool.entries.filter(e => e.species);
  const left = pool.dailyLimit === null ? null : Math.max(0, pool.dailyLimit - pool.drawnToday);
  const lackCell = balance !== null && balance < pool.costCell;
  const disabled = drawing || lackCell || left === 0;
  const reason = left === 0 ? '오늘은 더 뽑을 수 없어요. 내일 다시 와주세요.' : lackCell ? '셀이 모자라요. 미니게임에서 모아오세요.' : '';
  const lastPet = last?.pet;
  // 정원판 위에 펫을 세운다. 펫 그림은 모두 같은 캔버스(정원판 기준 위치)로 잘려 있어서 위치를 따로 맞출 필요가 없다.
  const stage = (pet: string) => `<div class="gacha-stage" aria-hidden="true">${pet}</div>`;
  const window_ = lastPet
    ? `<div class="gacha-window ${gradeInfo[last!.grade].className}" role="status">
        ${stage(lastPet.species.imageUrl ? `<img class="stage-pet" src="${lastPet.species.imageUrl}" alt=""/>` : '')}
        <p class="gacha-name"><strong>${escapeHtml(lastPet.species.name)}</strong> <span>${gradeInfo[last!.grade].label}</span></p>
        <p class="gacha-note">${last!.isDuplicate ? `이미 있는 펫이라 ${last!.refundCell ?? 0}셀을 돌려받았어요` : '처음 만났어요'}</p>
      </div>`
    : `<div class="gacha-window is-empty">
        ${stage(`<img class="stage-pet" src="${STAGE_MYSTERY}" alt=""/><span class="stage-q">?</span>`)}
        <p class="gacha-note">어떤 펫이 나올까요</p>
      </div>`;
  const draw = `<section class="gacha-draw" aria-label="펫 뽑기">
      ${window_}
      <dl class="gacha-facts">
        <div><dt>한 번에</dt><dd><span class="cell-icon" aria-hidden="true">⬡</span> ${pool.costCell.toLocaleString()}</dd></div>
        ${left === null ? '' : `<div><dt>오늘 남은 횟수</dt><dd>${left}번</dd></div>`}
      </dl>
      <button id="gacha-draw" data-draw="${pool.poolId}" ${disabled ? 'disabled' : ''}>${drawing ? '뽑는 중' : '펫 뽑기'}</button>
      ${reason ? `<p class="gacha-reason">${reason}</p>` : ''}
    </section>`;
  const section = (grade: Grade) => {
    const list = pets.filter(e => e.species!.grade === grade);
    if (!list.length) return '';
    const rate = pool.gradeRates.find(r => r.grade === grade)?.probability;
    const have = list.filter(e => e.owned).length;
    return `<section class="dex-group ${gradeInfo[grade].className}" aria-label="${gradeInfo[grade].label}">
        <h4><span>${gradeInfo[grade].label}</span>${rate === undefined ? '' : `<small>${rate}% 확률</small>`}<em>${have}/${list.length}</em></h4>
        <ul class="dex-slots">${list.map(e => `<li class="dex-slot${e.owned ? ' owned' : ''}">
            ${petImage(e.species!.imageUrl, e.species!.name)}<span>${escapeHtml(e.species!.name)}${e.owned ? '' : '<span class="visually-hidden">, 아직 없음</span>'}</span></li>`).join('')}</ul>
      </section>`;
  };
  const owned = pets.filter(e => e.owned).length;
  const dex = `<section class="gacha-dex" aria-label="펫 도감">
      <header><h3>도감</h3><p>${pets.length}마리 중 ${owned}마리를 만났어요</p></header>
      ${section('NORMAL')}<div class="dex-special">${section('RARE')}${section('LEGEND')}</div>
    </section>`;
  return `<div class="gacha">${draw}${dex}</div>`;
}

const tabs = ['펫 뽑기', '펫 스킨', '펫 상점', '펫 성장', '상호작용'];

export function connectPetShop(dialog: HTMLDialogElement, state: PetState, onChange: () => void) {
  const tabList = dialog.querySelector<HTMLElement>('#shop-tabs')!;
  const panel = dialog.querySelector<HTMLElement>('#shop-panel')!;
  const result = dialog.querySelector<HTMLElement>('#shop-result')!;
  let activeTab = 2;
  let selectedPetId = state.pet.id;
  // 서버에서 불러온 값
  let serverItems: Item[] = [];
  let owned: Record<number, number> = {};
  let balance: number | null = null;
  let loading = true;
  let loadError = '';
  let petPool: GachaPool | undefined;
  let lastDraw: GachaResult | null = null;
  let drawing = false;
  tabList.innerHTML = tabs.map((label, index) => `<button role="tab" id="shop-tab-${index}" aria-controls="shop-panel" data-tab="${index}">${label}</button>`).join('');
  const refresh = () => {
    const pet = state.pet;
    const user = state.user;
    const cellText = balance === null ? '…' : balance.toLocaleString();
    dialog.querySelector('#shop-wallet')!.innerHTML = `<span class="cell-icon" aria-hidden="true">⬡</span> ${cellText}`;
    dialog.querySelector('#shop-wallet')!.setAttribute('aria-label', `보유 ${cellText} 셀`);
    dialog.querySelector('#shop-save-notice')!.textContent = !state.persistent ? '저장할 수 없어요. 새로고침하면 변경 사항이 사라질 수 있어요.' : state.recovered ? '저장 데이터의 잘못된 값을 기본값으로 복구했어요.' : '';
    tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(index === activeTab));
      tab.tabIndex = index === activeTab ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `shop-tab-${activeTab}`);
    const preview = `<img class="shop-pet-preview" src="${pet.previewPath}" alt="${pet.name}"/>`;
    const progress = `<p class="shop-level">Lv. ${pet.level} · ${pet.name}</p><label for="pet-experience">경험치 ${pet.experience} / ${state.requiredExperience}</label><progress id="pet-experience" value="${pet.experience}" max="${state.requiredExperience}"></progress>`;
    const selector = `<aside class="shop-pet-list"><button class="pet-card" id="select-shop-pet" data-pet="${pet.id}" aria-pressed="${selectedPetId === pet.id}"><img src="${pet.previewPath}" alt=""/><strong>${pet.name}</strong><span>Lv. ${pet.level}</span></button><small>장착하지 않아도 돌볼 수 있어요.</small></aside>`;
    if (activeTab === 0) {
      panel.innerHTML = loadError ? `<p>${loadError}</p><button id="shop-reload" data-reload>다시 불러오기</button>`
        : loading ? `<p>도감을 불러오고 있어요.</p>` : renderGacha(petPool, balance, lastDraw, drawing);
    } else if (activeTab === 1) {
      panel.innerHTML = `<div class="shop-coming">${preview}<h3>${tabs[activeTab]}</h3><p>새로운 만남을 준비하고 있어요.</p><button disabled>스킨 적용 준비 중</button></div>`;
    } else if (activeTab === 2) {
      const intro = `<div class="shop-intro"><h3>작은 선물, 더 가까운 사이</h3><p>사료와 장난감으로 펫을 돌봐주세요.</p></div>`;
      if (loadError) {
        panel.innerHTML = `${intro}<p>${loadError}</p><button id="shop-reload" data-reload>다시 불러오기</button>`;
      } else if (loading) {
        panel.innerHTML = `${intro}<p>상품을 불러오고 있어요.</p>`;
      } else {
        panel.innerHTML = `${intro}<div class="shop-items">${serverItems.map(item => `<article class="shop-item"><div class="shop-item-art">${itemArt(item)}</div><h3>${item.name}</h3><p>${itemDescription(item)}</p><span>보유 ${owned[item.itemId] ?? 0}개</span><strong aria-label="${item.priceCell} 셀"><span class="cell-icon" aria-hidden="true">⬡</span> ${item.priceCell.toLocaleString()}</strong><button id="buy-${item.itemId}" data-buy="${item.itemId}" ${balance !== null && balance < item.priceCell ? 'disabled' : ''}>1개 구매</button></article>`).join('')}</div>`;
      }
    } else {
      panel.innerHTML = `<div class="shop-care">${selector}<section class="shop-care-detail">${preview}${progress}${activeTab === 3 ? `<p>다음 레벨 성장 비용 <strong aria-label="${state.growthCost} 셀"><span class="cell-icon" aria-hidden="true">⬡</span> ${state.growthCost.toLocaleString()}</strong></p><button id="grow-pet" data-grow ${state.canGrow ? '' : 'disabled'}>한 단계 성장</button><small>${state.pet.experience < state.requiredExperience ? '경험치가 가득 차야 성장할 수 있어요.' : state.user.cells < state.growthCost ? '성장에 필요한 셀이 부족해요.' : '성장하면 경험치가 0으로 초기화돼요.'}</small><small>미니게임에서 적을 정화하고 귀환하거나 클리어하면 경험치를 받아요.</small>` : `<dl class="shop-stats"><div><dt>배고픔</dt><dd>${pet.hunger}/100</dd></div><div><dt>호감도</dt><dd>${pet.affection}/100</dd></div></dl><small>배고픔 수치가 높을수록 배가 부른 상태예요.</small><div class="shop-actions">${shopItems.map(item => `<button id="use-${item.id}" data-use="${item.id}" ${!user.items[item.id] || (item.type === 'food' ? pet.hunger : pet.affection) >= 100 ? 'disabled' : ''}>${item.type === 'food' ? '밥주기' : '놀아주기'}<small>${item.name} ${user.items[item.id]}개 · 1개 소모</small></button>`).join('')}</div><small>수치가 가득 차면 아이템을 소모하지 않아요.</small>`}</section></div>`;
    }
  };
  // 서버에서 상품·보유 개수·셀 잔액을 한 번에 불러오기
  const loadServer = async () => {
    try {
      const [items, inventory, me, pools] = await Promise.all([getShopItems(), getInventory(), getMe(), getGachaPools()]);
      serverItems = items;
      petPool = pools.find(p => p.poolType === 'PET');
      owned = Object.fromEntries(inventory.items.map(entry => [entry.item.itemId, entry.quantity]));
      balance = me.cellBalance;
      loadError = '';
    } catch (error) {
      loadError = error instanceof Error ? error.message : '서버에 연결할 수 없어요.';
    }
    loading = false;
    refresh();
  };
  // 구매: 서버가 셀 차감·아이템 지급을 처리하고, 바뀐 잔액·보유 개수를 돌려줌
  const purchase = async (button: HTMLButtonElement) => {
    const itemId = Number(button.dataset.buy);
    button.disabled = true;
    try {
      const bought = await buyItem(itemId, 1);
      balance = bought.balance;
      owned[itemId] = bought.item.quantity;
      result.textContent = `${bought.item.item.name} 1개를 구매했어요.`;
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : '구매하지 못했어요.';
    }
    refresh();
    onChange();
    panel.querySelector<HTMLButtonElement>(`#buy-${itemId}`)?.focus();
  };
  // 뽑기: 서버가 셀 차감·펫 지급(또는 중복 환급)을 처리. 끝나면 도감·남은 횟수를 다시 불러옴
  const draw = async (poolId: number) => {
    drawing = true;
    refresh();
    try {
      lastDraw = await drawGacha(poolId);
      balance = lastDraw.balance;
      result.textContent = lastDraw.pet
        ? `${lastDraw.pet.species.name}(${gradeInfo[lastDraw.grade].label})${lastDraw.isDuplicate ? `, 이미 있는 펫이라 ${lastDraw.refundCell ?? 0}셀을 돌려받았어요.` : '을(를) 처음 만났어요.'}`
        : '';
      petPool = (await getGachaPools()).find(p => p.poolType === 'PET');
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : '뽑기를 하지 못했어요.';
    }
    drawing = false;
    refresh();
    onChange();
    panel.querySelector<HTMLButtonElement>('#gacha-draw')?.focus();
  };
  const selectTab = (index: number) => { activeTab = index; result.textContent = ''; refresh(); panel.scrollTop = 0; };
  tabList.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
    if (button) selectTab(Number(button.dataset.tab));
  });
  tabList.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    selectTab(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (activeTab + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length);
    tabList.querySelector<HTMLButtonElement>(`#shop-tab-${activeTab}`)!.focus();
  });
  panel.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    let message: string | undefined;
    if (button.dataset.pet === state.pet.id) selectedPetId = button.dataset.pet;
    else if (button.dataset.buy) { void purchase(button); return; }
    else if (button.dataset.draw) { void draw(Number(button.dataset.draw)); return; }
    else if (button.hasAttribute('data-reload')) { loading = true; refresh(); void loadServer(); return; }
    else if (button.dataset.use) message = state.interact(selectedPetId, button.dataset.use);
    else if (button.hasAttribute('data-grow')) message = state.grow(selectedPetId);
    if (message) {
      refresh();
      onChange();
      const next = panel.querySelector<HTMLButtonElement>(`#${button.id}`);
      if (next && !next.disabled) next.focus();
      else panel.focus();
      result.textContent = message;
    }
  });
  return () => { selectTab(2); dialog.showModal(); void loadServer(); };
}
