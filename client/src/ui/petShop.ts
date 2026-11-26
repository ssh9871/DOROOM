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
const escapeHtml =(text: string) => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const petImage = (src: string | null | undefined, name: string) => src
  ? `<img src="${src}" alt=""/>`
  : `<span class="dex-noimg" aria-hidden="true">${escapeHtml(name.slice(0, 1))}</span>`;

// 🟩 4-4 뽑기 연출: idle → charging(서버 응답 대기, 실루엣 흔들림) → reveal(등급 색 빛기둥 + 진짜 펫 실루엣) → done(번쩍, 컬러 등장)
type DrawPhase = 'idle' | 'charging' | 'reveal' | 'done';
const REVEAL_MS: Record<Grade, number> = { NORMAL: 1000, RARE: 1350, LEGEND: 1950 };   // 알이 깨지는 0.35초 포함
const MIN_CHARGE_MS = 1300;                                                             // 알이 흔들리고 금이 가는 시간

// 펫 알 (직접 그린 SVG): 크림색 알 + 민트·살구 점 + 발바닥. 가운데 지그재그 선을 따라 위·아래 껍질로 나뉜다
const EGG_SHAPE = 'M50 4C22 4 5 48 5 79C5 108 25 124 50 124C75 124 95 108 95 79C95 48 78 4 50 4Z';
const EGG_ZIG = '0,72 12,72 20,61 30,73 40,60 50,73 60,60 70,73 80,61 88,72 100,72';
const eggSvg = (mark: string) => `<svg class="stage-egg" viewBox="0 0 100 136" aria-hidden="true">
    <defs>
      <clipPath id="egg-top"><polygon points="0,0 100,0 ${EGG_ZIG.split(' ').reverse().join(' ')}"/></clipPath>
      <clipPath id="egg-bottom"><polygon points="${EGG_ZIG} 100,136 0,136"/></clipPath>
      <radialGradient id="egg-base" cx="36%" cy="30%" r="78%">
        <stop offset="0" stop-color="#FFFEF8"/><stop offset=".45" stop-color="#FFF0D3"/>
        <stop offset=".82" stop-color="#EBCB9E"/><stop offset="1" stop-color="#C9A274"/>
      </radialGradient>
      <radialGradient id="egg-shade" cx="36%" cy="30%" r="80%">
        <stop offset=".5" stop-color="#7A4E22" stop-opacity="0"/><stop offset="1" stop-color="#5A3814" stop-opacity=".45"/>
      </radialGradient>
      <radialGradient id="egg-rim" cx="80%" cy="78%" r="40%">
        <stop offset="0" stop-color="#FFE9C2" stop-opacity=".55"/><stop offset="1" stop-color="#FFE9C2" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse class="egg-ground" cx="52" cy="125" rx="34" ry="7" fill="#000" opacity=".35"/>
    <path class="egg-whole" d="${EGG_SHAPE}" fill="url(#egg-base)"/>
    ${['top', 'bottom'].map(part => `<g class="egg-${part}" clip-path="url(#egg-${part})">
      <path d="${EGG_SHAPE}" fill="url(#egg-base)"/>
      <ellipse cx="27" cy="47" rx="8" ry="9" fill="#8DD3B4"/><ellipse cx="73" cy="36" rx="6" ry="6.5" fill="#F4AE84"/>
      <ellipse cx="80" cy="92" rx="7" ry="9.5" fill="#8DD3B4"/><ellipse cx="23" cy="99" rx="4.5" ry="5" fill="#F4AE84"/>
      <g fill="#DDB892"><ellipse cx="50" cy="101" rx="7" ry="6"/><circle cx="41" cy="92" r="3"/><circle cx="47" cy="88" r="3"/><circle cx="53" cy="88" r="3"/><circle cx="59" cy="92" r="3"/></g>
      <path d="${EGG_SHAPE}" fill="url(#egg-shade)"/>
      <path d="${EGG_SHAPE}" fill="url(#egg-rim)"/>
      <ellipse cx="34" cy="30" rx="9" ry="15" fill="#fff" opacity=".75" transform="rotate(-22 34 30)"/>
      <ellipse cx="27" cy="52" rx="3" ry="5" fill="#fff" opacity=".45" transform="rotate(-15 27 52)"/>
      <path d="${EGG_SHAPE}" fill="none" stroke="#8A6546" stroke-width="2" opacity=".7"/>
    </g>`).join('')}
    <polyline class="egg-crack" points="${EGG_ZIG.split(' ').slice(1, -1).join(' ')}" fill="none" stroke="#5B3F2C" stroke-width="3" stroke-linejoin="round"/>
    ${mark ? `<text x="50" y="64" text-anchor="middle" class="egg-mark">${mark}</text>` : ''}
  </svg>`;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderGacha(pool: GachaPool | undefined, balance: number | null, last: GachaResult | null, phase: DrawPhase, newSpeciesId: number | null) {
  const drawing = phase === 'charging' || phase === 'reveal';
  if (!pool) return `<div class="shop-coming"><h3>펫 뽑기</h3><p>지금은 뽑기를 할 수 없어요. 잠시 후 다시 열어주세요.</p></div>`;
  const pets = pool.entries.filter(e => e.species);
  const left = pool.dailyLimit === null ? null : Math.max(0, pool.dailyLimit - pool.drawnToday);
  const lackCell = balance !== null && balance < pool.costCell;
  const disabled = drawing || lackCell || left === 0;
  const reason = left === 0 ? '오늘은 더 뽑을 수 없어요. 내일 다시 와주세요.' : lackCell ? '셀이 모자라요. 미니게임에서 모아오세요.' : '';
  const lastPet = last?.pet;
  // 정원판 위에 펫을 세운다. 펫 그림은 모두 같은 캔버스(정원판 기준 위치)로 잘려 있어서 위치를 따로 맞출 필요가 없다.
  const stage = (pet: string, extra = '') => `<div class="gacha-stage${extra}" aria-hidden="true" data-skip>${pet}</div>`;
  const beam = `<span class="stage-beam"></span><span class="stage-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  const window_ = phase === 'charging'
    ? `<div class="gacha-window is-drawing phase-charging" role="status">
        ${stage(eggSvg(''), ' is-charging')}
        <p class="gacha-note">알이 흔들려요…</p>
      </div>`
    : phase === 'reveal' && lastPet
    ? `<div class="gacha-window is-drawing phase-reveal ${gradeInfo[last!.grade].className}" role="status">
        ${stage(`${beam}${lastPet.species.imageUrl ? `<img class="stage-pet" src="${lastPet.species.imageUrl}" alt=""/>` : ''}${eggSvg('')}`, ' is-reveal')}
        <p class="gacha-note">${last!.grade === 'LEGEND' ? '엄청난 빛이…!' : last!.grade === 'RARE' ? '푸른 빛이 보여요!' : '누군가 나타났어요'}</p>
      </div>`
    : lastPet
    ? `<div class="gacha-window ${gradeInfo[last!.grade].className}${phase === 'done' ? ' phase-done' : ''}" role="status">
        ${stage(`${phase === 'done' ? '<span class="stage-flash"></span><span class="stage-ring"></span>' : ''}${lastPet.species.imageUrl ? `<img class="stage-pet" src="${lastPet.species.imageUrl}" alt=""/>` : ''}`)}
        <p class="gacha-name"><strong>${escapeHtml(lastPet.species.name)}</strong> <span>${gradeInfo[last!.grade].label}</span></p>
        <p class="gacha-note">${last!.isDuplicate ? `이미 있는 펫이라 ${last!.refundCell ?? 0}셀을 돌려받았어요` : '처음 만났어요'}</p>
      </div>`
    : `<div class="gacha-window is-empty">
        ${stage(eggSvg('?'), ' is-idle')}
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
        <ul class="dex-slots">${list.map(e => `<li class="dex-slot${e.owned ? ' owned' : ''}${e.species!.speciesId === newSpeciesId ? ' is-new' : ''}">
            ${e.species!.speciesId === newSpeciesId ? '<b class="dex-new">NEW</b>' : ''}${petImage(e.species!.imageUrl, e.species!.name)}<span>${escapeHtml(e.species!.name)}${e.owned ? '' : '<span class="visually-hidden">, 아직 없음</span>'}</span></li>`).join('')}</ul>
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
  let phase: DrawPhase = 'idle';
  let newSpeciesId: number | null = null;    // 방금 처음 만난 펫 → 도감 칸에 NEW
  let skipReveal: (() => void) | null = null;
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
        : loading ? `<p>도감을 불러오고 있어요.</p>` : renderGacha(petPool, balance, lastDraw, phase, newSpeciesId);
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
  // 뽑기: 서버가 셀 차감·펫 지급(또는 중복 환급)을 처리. 결과가 오면 연출을 보여주고, 끝나면 도감·남은 횟수를 다시 그림
  const wait = (ms: number) => new Promise<void>(resolve => {
    const timer = setTimeout(() => { skipReveal = null; resolve(); }, ms);
    skipReveal = () => { clearTimeout(timer); skipReveal = null; resolve(); };   // 정원판을 누르면 바로 결과로
  });
  const draw = async (poolId: number) => {
    if (phase === 'charging' || phase === 'reveal') return;
    const quick = reducedMotion();
    phase = 'charging'; newSpeciesId = null; result.textContent = '';
    refresh();
    const started = Date.now();
    let nextPool: GachaPool | undefined;
    try {
      lastDraw = await drawGacha(poolId);
      nextPool = (await getGachaPools()).find(p => p.poolType === 'PET');
      if (!quick) {
        await new Promise(r => setTimeout(r, Math.max(0, MIN_CHARGE_MS - (Date.now() - started))));
        phase = 'reveal';
        refresh();
        await wait(REVEAL_MS[lastDraw.grade]);
      }
      balance = lastDraw.balance;
      newSpeciesId = lastDraw.pet && !lastDraw.isDuplicate ? lastDraw.pet.species.speciesId : null;
      if (nextPool) petPool = nextPool;
      phase = dialog.open ? 'done' : 'idle';
      if (!dialog.open) { lastDraw = null; newSpeciesId = null; }
      result.textContent = lastDraw?.pet
        ? `${lastDraw.pet.species.name}(${gradeInfo[lastDraw.grade].label})${lastDraw.isDuplicate ? `, 이미 있는 펫이라 ${lastDraw.refundCell ?? 0}셀을 돌려받았어요.` : '을(를) 처음 만났어요.'}`
        : '';
    } catch (error) {
      phase = lastDraw ? 'done' : 'idle';
      result.textContent = error instanceof Error ? error.message : '뽑기를 하지 못했어요.';
    }
    refresh();
    onChange();
    panel.querySelector<HTMLButtonElement>('#gacha-draw')?.focus();
  };
  const selectTab = (index: number) => { activeTab = index; result.textContent = ''; if (phase === 'done') { phase = 'idle'; newSpeciesId = null; } refresh(); panel.scrollTop = 0; };
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
    if (skipReveal && (event.target as HTMLElement).closest('[data-skip]')) { skipReveal(); return; }   // 연출 건너뛰기
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
  // 상점을 닫았다 다시 열면 뽑기 칸은 다시 알로 (연출 중이면 그대로 둠)
  dialog.addEventListener('close', () => {
    if (phase === 'charging' || phase === 'reveal') return;
    phase = 'idle'; lastDraw = null; newSpeciesId = null;
  });
  return () => { selectTab(2); dialog.showModal(); void loadServer(); };
}
