import { getShopItems, getInventory, getMe, buyItem, getGachaPools, drawGacha, getGachaHistory, addDemoDraws } from '../api/shop';
import { peekDemoPick, setDemoPick, takeDemoPick } from '../pets/demoPick';
import { evolvePet, feedPet, getMyPets, getPetDetail, patPet, usePetPotion } from '../api/pets';
import type { Item, GachaPool, GachaResult, GachaHistoryEntry, Grade, Pet, PetDetail } from '../../../shared/types';

// 🟩 상점의 모든 탭은 서버 데이터 사용: 상품·보유 개수·셀·내 펫(성장·상호작용)
const itemArtFiles: Partial<Record<Item['itemType'], string>> = {
  FOOD: 'pet-food.svg',
  SNACK: 'pet-cookie.svg',
  TOY: 'pet-ball.svg',
  EXP_POTION: 'experience-potion.svg',
  EVOLVE_STONE: 'evolution-stone.svg',
};
const itemArt = (type: Item['itemType']) => {
  const file = itemArtFiles[type];
  return file
    ? `<img src="/assets/items/${file}" width="128" height="128" alt="" draggable="false"/>`
    : '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M66 24L38 66h20l-6 30 30-44H62z" fill="#D9A441"/></svg>';
};
// 이전 데이터베이스의 상품명도 마이그레이션 전까지 같은 이름으로 표시한다.
const itemName = (item: Item) => item.code === 'EXP_POTION_S' ? '경험치 포션' : item.name;
const itemEffects = (item: Item) => [
  item.hungerRestore > 0 ? ['배고픔', `+${item.hungerRestore.toLocaleString()}`] : null,
  item.affectionRestore > 0 ? ['호감도', `+${item.affectionRestore.toLocaleString()}`] : null,
  item.expGain > 0 ? ['경험치', `+${item.expGain.toLocaleString()}`] : null,
  item.itemType === 'EVOLVE_STONE' ? ['진화 재료'] : null,
  item.itemType === 'GAME_BUFF' ? ['미니게임 입장 효과'] : null,
].filter(effect => effect !== null);

const shopCell = '<svg class="shop-cell" viewBox="0 0 20 20" aria-hidden="true"><path d="m10 1.5 7.5 4.3v8.4L10 18.5l-7.5-4.3V5.8Z" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity=".18"/><path d="M10 5.5V14.5M6 7.75l8 4.5m0-4.5-8 4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';

const minusIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const plusIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const MAX_BUY = 99;   // 한 번에 살 수 있는 최대 개수 (서버도 1~99만 받음)
const clampCount = (count: number | undefined) => Math.min(MAX_BUY, Math.max(1, count ?? 1));

function renderShopItem(item: Item, quantity: number, balance: number | null, buying: number | null, count: number) {
  const name = escapeHtml(itemName(item));
  const amount = clampCount(count);
  const total = (item.priceCell * amount).toLocaleString();
  const pending = item.itemId === buying;
  const insufficient = balance !== null && balance < item.priceCell * amount;
  const locked = buying !== null;
  const action = pending ? '구매 중…' : `${amount}개 구매`;
  return `<article class="shop-item" data-item-type="${item.itemType}" aria-labelledby="shop-item-${item.itemId}">
    <div class="shop-item-art">${itemArt(item.itemType)}</div>
    <div class="shop-item-info">
      <h3 id="shop-item-${item.itemId}">${name}</h3>
      <ul class="shop-item-effects" aria-label="효과">${itemEffects(item).map(([label, value]) =>
        `<li>${label}${value ? ` <b>${value}</b>` : ''}</li>`).join('')}</ul>
      <p class="shop-item-owned">보유 <b>${quantity.toLocaleString()}개</b></p>
    </div>
    <div class="shop-qty" role="group" aria-label="${name} 구매 개수">
      <button type="button" id="qty-dec-${item.itemId}" data-qty-dec="${item.itemId}" aria-label="${name} 1개 줄이기" ${locked || amount <= 1 ? 'disabled' : ''}>${minusIcon}</button>
      <output id="qty-${item.itemId}" aria-live="polite">${amount}<small>개</small></output>
      <button type="button" id="qty-inc-${item.itemId}" data-qty-inc="${item.itemId}" aria-label="${name} 1개 늘리기" ${locked || amount >= MAX_BUY ? 'disabled' : ''}>${plusIcon}</button>
    </div>
    <button class="shop-buy${insufficient ? ' is-short' : ''}" id="buy-${item.itemId}" data-buy="${item.itemId}"
      aria-label="${name} ${amount}개, ${total}셀 · ${action}${insufficient ? ' (보유 셀 부족)' : ''}" ${locked ? 'aria-disabled="true"' : ''}>
      <span class="shop-buy-price">${shopCell}${total}</span><span>${action}</span>
    </button>
  </article>`;
}

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
// 장비 모루 (3D 렌더 이미지, 창규): 대장간 배경과 같은 캔버스라 겹치기만 하면 자리가 맞는다.
//   뽑기를 누르면 망치가 나타나 손잡이 끝(57.81% 33.17%)을 축으로 세 번 땅땅땅 → 불꽃·달아오름 → 빛기둥 속에서 장비가 나온다
const anvilSvg = (mark: string) => `<div class="anvil3d" aria-hidden="true">
    <span class="forge-smoke"><i></i><i></i><i></i><i></i><i></i></span>
    <img class="anvil-body" src="/assets/equipment/anvil.png" alt=""/>
    <span class="anvil-hot"></span>
    <span class="anvil-sparks"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <img class="anvil-hammer" src="/assets/equipment/hammer.png" alt=""/>
    ${mark ? `<b class="anvil-mark">${mark}</b>` : ''}
  </div>`;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type GachaKind = 'PET' | 'EQUIPMENT';
type DexEntry = { key: string; name: string; grade: Grade; imageUrl?: string | null; owned: boolean; qty?: number };
const entryOf = (e: GachaPool['entries'][number], equipQty: Record<number, number>): DexEntry | null =>
  e.species ? { key: `p${e.species.speciesId}`, name: e.species.name, grade: e.species.grade, imageUrl: e.species.imageUrl, owned: e.owned }
  : e.equipment ? { key: `e${e.equipment.equipmentId}`, name: e.equipment.name, grade: e.equipment.grade, imageUrl: e.equipment.imageUrl,
                    owned: e.owned, qty: equipQty[e.equipment.equipmentId] ?? 0 }
  : null;
const resultOf = (r: GachaResult | null): DexEntry | null =>
  r?.pet ? { key: `p${r.pet.species.speciesId}`, name: r.pet.species.name, grade: r.grade, imageUrl: r.pet.species.imageUrl, owned: true }
  : r?.equipment ? { key: `e${r.equipment.equipment.equipmentId}`, name: r.equipment.equipment.name, grade: r.grade,
                     imageUrl: r.equipment.equipment.imageUrl, owned: true, qty: r.equipment.quantity }
  : null;
const statName: Record<string, string> = { BULLET_SPEED: '탄속', MAX_HP: '체력', MOVE_SPEED: '이동 속도', ATTACK: '공격력' };
const when = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function renderGacha(kind: GachaKind, pool: GachaPool | undefined, balance: number | null, last: GachaResult | null, phase: DrawPhase,
                     newKey: string | null, equipQty: Record<number, number>, history: GachaHistoryEntry[] | null) {
  const pet = kind === 'PET';
  const word = pet ? '펫' : '장비';
  const switcher = `<div class="gacha-kinds" role="group" aria-label="뽑기 종류">
      <button data-kind="PET" aria-pressed="${pet}">펫 뽑기</button><button data-kind="EQUIPMENT" aria-pressed="${!pet}">장비 뽑기</button></div>`;
  const drawing = phase === 'charging' || phase === 'reveal';
  if (!pool) return `${switcher}<div class="shop-coming"><h3>${word} 뽑기</h3><p>지금은 뽑기를 할 수 없어요. 잠시 후 다시 열어주세요.</p></div>`;
  const lineOrder = ['HELMET', 'GLOVE', 'BOOTS'];   // 장비는 모든 등급 줄을 같은 순서로: 모자 → 목걸이 → 신발 (line_code 는 예전 이름 그대로)
  const list = [...pool.entries].sort((a, b) => a.equipment && b.equipment
      ? lineOrder.indexOf(a.equipment.lineCode) - lineOrder.indexOf(b.equipment.lineCode) : 0)
    .map(e => entryOf(e, equipQty)).filter((e): e is DexEntry => !!e);
  const left = pool.dailyLimit === null ? null : Math.max(0, pool.dailyLimit - pool.drawnToday);
  const lackCell = balance !== null && balance < pool.costCell;
  const pick = peekDemoPick(kind);   // 시연: 도감에서 고른 펫·장비 (다음 뽑기 1회 확정, 하루 횟수 제한 없음)
  // 펫은 중복 없이 뽑히므로, 뽑을 수 있는 펫을 다 만났으면 더 뽑을 수 없다
  const allMet = pet && pool.entries.every(e => !e.species || e.owned || !e.drawable);
  const disabled = drawing || lackCell || ((left === 0 || allMet) && !pick);
  const reason = allMet && !pick ? '모든 펫을 만났어요!' : lackCell ? '셀이 모자라요. 미니게임에서 모아오세요.' : left === 0 && !pick ? '오늘은 더 뽑을 수 없어요. 내일 다시 와주세요.' : '';
  const got = resultOf(last);
  const box = pet ? eggSvg : anvilSvg;   // 모루에는 물음표 없음
  const shown = (e: DexEntry) => e.imageUrl ? `<img class="stage-pet${pet ? '' : ' stage-equip'}" src="${e.imageUrl}" alt=""/>` : '';
  // 정원판 위에 결과를 세운다. 펫 그림은 모두 같은 캔버스(정원판 기준 위치)로 잘려 있어서 위치를 따로 맞출 필요가 없다.
  const stage = (inner: string, extra = '') => `<div class="gacha-stage${pet ? '' : ' is-forge'}${extra}" aria-hidden="true" data-skip>${inner}</div>`;   // 장비: 대장간 배경
  const beam = `<span class="stage-beam"></span><span class="stage-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></span>`;
  const note = !got || !last ? '' : pet
    ? (last.isDuplicate ? `이미 있는 펫이라 ${last.refundCell ?? 0}셀을 돌려받았어요` : '처음 만났어요')
    : (got.qty! > 1 ? `합치기 재료로 쌓였어요 · ${got.qty}개 보유` : '처음 얻었어요');
  const window_ = phase === 'charging'
    ? `<div class="gacha-window is-drawing phase-charging" role="status">
        ${stage(box(''), ' is-charging')}
        <p class="gacha-note">${pet ? '알이 흔들려요…' : '땅! 땅! 땅!'}</p>
      </div>`
    : phase === 'reveal' && got
    ? `<div class="gacha-window is-drawing phase-reveal ${gradeInfo[got.grade].className}" role="status">
        ${stage(`${beam}${shown(got)}${box('')}`, ' is-reveal')}
        <p class="gacha-note">${got.grade === 'LEGEND' ? '엄청난 빛이…!' : got.grade === 'RARE' ? '푸른 빛이 보여요!' : pet ? '누군가 나타났어요' : '장비가 완성되고 있어요'}</p>
      </div>`
    : got
    ? `<div class="gacha-window ${gradeInfo[got.grade].className}${phase === 'done' ? ' phase-done' : ''}" role="status">
        ${stage(`${phase === 'done' ? '<span class="stage-flash"></span><span class="stage-ring"></span>' : ''}${shown(got)}`)}
        <p class="gacha-name"><strong>${escapeHtml(got.name)}</strong> <span>${gradeInfo[got.grade].label}</span></p>
        <p class="gacha-note">${note}</p>
      </div>`
    : `<div class="gacha-window is-empty">
        ${stage(box(pet ? '?' : ''), ' is-idle')}
        <p class="gacha-note">${pick ? `다음 뽑기: ${escapeHtml(pick.name)}` : pet ? '어떤 펫이 나올까요' : '어떤 장비가 만들어질까요'}</p>
      </div>`;
  const historyList = history === null ? '' : `<section class="gacha-history" aria-label="최근 ${word} 뽑기 기록">
      ${history.length ? `<ol>${history.map(h => {
        const name = h.species?.name ?? h.equipment?.name ?? '?';
        const img = h.species?.imageUrl ?? h.equipment?.imageUrl;
        const tag = h.refundCell > 0 ? `<em>+${h.refundCell}셀 환급</em>` : h.isDuplicate ? `<em>${pet ? '중복' : '재료 +1'}</em>` : '<em class="is-first">처음</em>';
        return `<li class="${gradeInfo[h.grade].className}">${img ? `<img src="${img}" alt=""/>` : ''}<b>${escapeHtml(name)}</b><span>${gradeInfo[h.grade].label}</span>${tag}<time>${when(h.createdAt)}</time></li>`;
      }).join('')}</ol>` : `<p>아직 ${word} 뽑기 기록이 없어요.</p>`}
    </section>`;
  const draw = `<section class="gacha-draw" aria-label="${word} 뽑기">
      ${window_}
      <dl class="gacha-facts">
        <div><dt>한 번에</dt><dd><span class="cell-icon" aria-hidden="true">⬡</span> ${pool.costCell.toLocaleString()}</dd></div>
        ${left === null ? '' : `<div><dt>오늘 남은 횟수</dt><dd>${left}번 <button class="demo-draws-button" data-demo-draws="${pool.poolId}" title="시연용: 오늘 뽑기 횟수 +1" aria-label="오늘 뽑기 횟수 1번 늘리기" ${drawing ? 'disabled' : ''}>+1</button></dd></div>`}
      </dl>
      <button id="gacha-draw" data-draw="${pool.poolId}" ${disabled ? 'disabled' : ''}>${drawing ? '뽑는 중' : `${word} 뽑기`}</button>
      ${reason ? `<p class="gacha-reason">${reason}</p>` : ''}
      <button id="gacha-history" class="gacha-history-toggle" data-history aria-expanded="${history !== null}">${history === null ? '최근 기록 보기' : '최근 기록 닫기'}</button>
      ${historyList}
    </section>`;
  const section = (grade: Grade) => {
    const rows = list.filter(e => e.grade === grade);
    if (!rows.length) return '';
    const rate = pool.gradeRates.find(r => r.grade === grade)?.probability;
    const have = rows.filter(e => e.owned).length;
    const sub = rate !== undefined ? `<small>${rate}% 확률</small>` : '';
    return `<section class="dex-group ${gradeInfo[grade].className}" aria-label="${gradeInfo[grade].label}">
        <h4><span>${gradeInfo[grade].label}</span>${sub}<em>${have}/${rows.length}</em></h4>
        <ul class="dex-slots">${rows.map(e => `<li class="dex-slot${e.owned ? ' owned' : ''}${e.key === newKey ? ' is-new' : ''}${pet ? '' : ' is-equip'} is-pickable${pick && e.key === `${pet ? 'p' : 'e'}${pick.id}` ? ' is-picked' : ''}" data-pick="${e.key.slice(1)}"${pet && e.owned ? ' data-owned' : ''} data-pick-name="${escapeHtml(e.name)}" role="button" tabindex="0" aria-label="${escapeHtml(e.name)}, 다음 뽑기로 지정">
            ${e.key === newKey ? '<b class="dex-new">NEW</b>' : ''}${e.qty ? `<b class="dex-qty">×${e.qty}</b>` : ''}${petImage(e.imageUrl, e.name)}<span>${escapeHtml(e.name)}${e.owned ? '' : '<span class="visually-hidden">, 아직 없음</span>'}</span></li>`).join('')}</ul>
      </section>`;
  };
  const owned = list.filter(e => e.owned).length;
  const equipNote = pet ? '' : `<p class="dex-hint">같은 장비 3개를 모으면 다음 등급으로 합칠 수 있어요. ${pool.entries.filter(e => e.equipment && e.equipment.grade === 'NORMAL')
    .sort((a, b) => lineOrder.indexOf(a.equipment!.lineCode) - lineOrder.indexOf(b.equipment!.lineCode))
    .map(e => `${e.equipment!.name} ${statName[e.equipment!.statCode] ?? e.equipment!.statCode}`).join(' · ')}</p>`;
  const dex = `<section class="gacha-dex" aria-label="${word} 도감">
      <header><h3>도감</h3><p>${list.length}${pet ? '마리' : '개'} 중 ${owned}${pet ? '마리를 만났어요' : '개를 얻었어요'}</p></header>
      ${equipNote}
      ${section('NORMAL')}<div class="dex-special">${section('RARE')}${section('LEGEND')}</div>
    </section>`;
  return `${switcher}<div class="gacha">${draw}${dex}</div>`;
}

const tabs = [
  { label: '뽑기', icon: '<path d="M18 14a6 6 0 1 1-12 0c0-4 3-9 6-9s6 5 6 9Z"/><path d="m6.5 13 3-2 2.5 3 2.5-3 3 2"/>' },
  { label: '펫 스킨', icon: '<path d="m9 5-5 2-2 4 4 2 1-2v8h10v-8l1 2 4-2-2-4-5-2a3 3 0 0 1-6 0Z"/>' },
  { label: '펫 상점', icon: '<path d="M5 11v8h14v-8M9 19v-5h6v5M3 10l2-5h14l2 5c0 2-3 3-4.5.5-1.5 2-3 2-4.5 0-1.5 2-3 2-4.5 0C6 13 3 12 3 10Z"/>' },
  { label: '펫 성장', icon: '<path d="M12 20v-7m0 3C6 16 4 13 4 9c5 0 8 3 8 7Zm0-3c0-5 3-8 8-8 0 5-3 8-8 8ZM8 20h8"/>' },
  { label: '상호작용', icon: '<path d="M20 8.5c0 4-8 9.5-8 9.5S4 12.5 4 8.5a4 4 0 0 1 8-1 4 4 0 0 1 8 1Z"/>' },
];

export function connectPetShop(dialog: HTMLDialogElement, onChange: () => void) {
  const tabList = dialog.querySelector<HTMLElement>('#shop-tabs')!;
  const panel = dialog.querySelector<HTMLElement>('#shop-panel')!;
  const result = dialog.querySelector<HTMLElement>('#shop-result')!;
  let activeTab = 2;
  let myPets: Pet[] = [];                  // 내 펫 (성장·상호작용 탭)
  let careId: number | null = null;        // 고른 펫 userPetId
  let careDetail: PetDetail | null = null; // 고른 펫의 다음 진화 조건
  let busy = false;
  let buying: number | null = null;
  let buyCount: Record<number, number> = {};   // 돌봄 용품별로 고른 구매 개수 (기본 1개)
  let useCount: Record<string, number> = {};   // 성장·상호작용에서 한 번에 쓸 개수 ('feed-아이템id' · 'potion-아이템id')
  // 서버에서 불러온 값
  let serverItems: Item[] = [];
  let owned: Record<number, number> = {};
  let balance: number | null = null;
  let loading = true;
  let loadError = '';
  let pools: GachaPool[] = [];
  let gachaKind: GachaKind = 'PET';
  let equipQty: Record<number, number> = {};     // 장비별 보유 개수 (도감 ×n)
  let history: GachaHistoryEntry[] | null = null;  // 열려 있으면 최근 기록
  let lastDraw: GachaResult | null = null;
  let phase: DrawPhase = 'idle';
  let newKey: string | null = null;    // 방금 처음 얻은 펫·장비 → 도감 칸에 NEW
  let skipReveal: (() => void) | null = null;
  tabList.innerHTML = tabs.map(({ label, icon }, index) => `<button role="tab" id="shop-tab-${index}" aria-controls="shop-panel" data-tab="${index}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${label}</button>`).join('');
  const refresh = () => {
    const cellText = balance === null ? '…' : balance.toLocaleString();
    dialog.querySelector('#shop-wallet')!.innerHTML = `${shopCell}<span>보유 셀</span><strong>${cellText}</strong>`;
    tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(index === activeTab));
      tab.tabIndex = index === activeTab ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `shop-tab-${activeTab}`);
    if (activeTab === 0) {
      panel.innerHTML = loadError ? `<p>${loadError}</p><button id="shop-reload" data-reload>다시 불러오기</button>`
        : loading ? `<p>도감을 불러오고 있어요.</p>` : renderGacha(gachaKind, pools.find(p => p.poolType === gachaKind), balance, lastDraw, phase, newKey, equipQty, history);
    } else if (activeTab === 1) {
      const rep = myPets.find(p => p.isRepresentative) ?? myPets[0];
      panel.innerHTML = `<div class="shop-coming">${rep ? `<div class="care-portrait">${petPic(rep)}</div>` : ''}<p class="care-eyebrow">준비 중</p><h3>펫 스킨</h3><p>펫에게 어울리는 옷과 색을 준비하고 있어요.</p></div>`;
    } else if (activeTab === 2) {
      const intro = `<div class="shop-intro">
        <div><h3>돌봄 용품</h3><p>먹이와 장난감은 상호작용에서, 포션은 펫 성장에서 사용해요.</p></div>
        <img src="/assets/pets/pet-dog.png" alt="" draggable="false"/>
      </div>`;
      const items = serverItems.map(item => renderShopItem(item, owned[item.itemId] ?? 0, balance, buying, buyCount[item.itemId] ?? 1)).join('');
      const content = loading ? '<p role="status">상품을 불러오고 있어요.</p>'
        : loadError ? `<p>${escapeHtml(loadError)}</p><button data-reload>다시 불러오기</button>`
        : !items ? '<p>지금 판매 중인 상품이 없어요.</p>' : '';
      panel.innerHTML = intro + (content ? `<div class="shop-empty">${content}</div>` : `<div class="shop-items">${items}</div>`);
    } else {
      panel.innerHTML = loadError ? `<p>${loadError}</p><button id="shop-reload" data-reload>다시 불러오기</button>`
        : loading ? '<p>펫을 불러오고 있어요.</p>' : careView(activeTab === 3 ? 'grow' : 'play');
    }
  };
  // ── 성장·상호작용 탭: 내 보유 펫 (서버) ─────────────────────
  const petPic = (pet: Pet) => pet.species.imageUrl
    ? `<img src="${pet.species.imageUrl}" alt=""/>` : `<span class="dex-noimg" aria-hidden="true">${escapeHtml(pet.species.name.slice(0, 1))}</span>`;
  const petName = (pet: Pet) => escapeHtml(pet.nickname ?? pet.species.name);
  const meter = (label: string, value: number, max: number, tone: string) => `<div class="care-meter ${tone}">
      <div class="care-meter-head"><span>${label}</span><b>${value.toLocaleString()} / ${max.toLocaleString()}</b></div>
      <div class="care-meter-bar" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><i style="width:${max ? Math.min(100, value / max * 100) : 100}%"></i></div></div>`;
  const itemsOf = (types: string[]) => serverItems.filter(item => types.includes(item.itemType));
  // 한 번에 쓸 개수: 1개 ~ limit(보유·필요 개수, 최대 99)
  const useLimit = (limit: number) => Math.max(1, Math.min(MAX_BUY, limit));
  const useAmount = (key: string, limit: number) => Math.min(Math.max(1, useCount[key] ?? 1), useLimit(limit));
  const useStepper = (key: string, label: string, limit: number, off: boolean) => {
    const max = useLimit(limit), amount = useAmount(key, limit), name = escapeHtml(label);
    return `<div class="shop-qty care-qty" role="group" aria-label="${name} 사용 개수">
      <button type="button" id="use-dec-${key}" data-use-dec="${key}" data-use-max="${max}" aria-label="${name} 1개 줄이기" ${off || amount <= 1 ? 'disabled' : ''}>${minusIcon}</button>
      <output aria-live="polite">${amount}<small>개</small></output>
      <button type="button" id="use-inc-${key}" data-use-inc="${key}" data-use-max="${max}" aria-label="${name} 1개 늘리기" ${off || amount >= max ? 'disabled' : ''}>${plusIcon}</button>
    </div>`;
  };
  const careView = (mode: 'grow' | 'play') => {
    if (!myPets.length) return `<div class="shop-coming"><p class="care-eyebrow">내 펫</p><h3>아직 함께하는 펫이 없어요</h3><p>뽑기에서 첫 펫을 만나보세요.</p><button data-goto="0">뽑기로 가기</button></div>`;
    const pet = myPets.find(p => p.userPetId === careId) ?? myPets[0]!;
    const list = `<aside class="care-pets" aria-label="내 펫">${myPets.map(p => `<button class="care-pet ${gradeInfo[p.species.grade].className}" data-care-pet="${p.userPetId}" aria-pressed="${p.userPetId === pet.userPetId}">
        ${petPic(p)}<span><strong>${petName(p)}</strong><small>Lv. ${p.level}${p.isRepresentative ? ' · 장착중' : ''}</small></span></button>`).join('')}</aside>`;
    const head = `<header class="care-head"><div class="care-portrait">${petPic(pet)}</div><div>
        <p class="care-eyebrow ${gradeInfo[pet.species.grade].className}">${gradeInfo[pet.species.grade].label} · ${pet.evolutionStage}단계</p>
        <h3>${petName(pet)}</h3><p class="care-sub">Lv. ${pet.level}${pet.expToNext === 0 ? ' · 최대 레벨' : ''}</p></div></header>`;
    let body: string;
    if (mode === 'grow') {
      const potion = itemsOf(['EXP_POTION'])[0];
      const potionQty = potion ? owned[potion.itemId] ?? 0 : 0;
      const evo = careDetail?.userPetId === pet.userPetId ? careDetail.nextEvolution : undefined;
      const evoReady = !!evo && pet.level >= evo.requiredLevel && (balance ?? 0) >= evo.cellCost;
      const evoNote = evo === undefined ? '진화 조건을 불러오고 있어요.' : evo === null ? '마지막 단계까지 진화했어요.'
        : pet.level < evo.requiredLevel ? `Lv. ${evo.requiredLevel}부터 진화할 수 있어요.` : (balance ?? 0) < evo.cellCost ? '진화에 필요한 셀이 부족해요.' : `${pet.evolutionStage + 1}단계로 진화할 수 있어요.`;
      body = `${pet.expToNext === 0 ? meter('경험치', 1, 1, 'tone-exp') : meter('경험치', pet.exp, pet.expToNext, 'tone-exp')}
        <div class="care-actions">
          <article class="care-action"><div class="care-action-icon">${itemArt('EXP_POTION')}</div><div><h4>${potion ? escapeHtml(itemName(potion)) : '경험치 포션'}</h4>
            <p>${potion ? `경험치 +${potion.expGain} · 보유 ${potionQty}개` : '지금은 살 수 없어요'}</p></div>
            ${potion ? useStepper(`potion-${potion.itemId}`, itemName(potion), potionQty, busy || !potionQty || pet.expToNext === 0) : ''}
            <button data-potion="${potion?.itemId ?? ''}" ${busy || !potion || !potionQty || pet.expToNext === 0 ? 'disabled' : ''}>${potion && useAmount(`potion-${potion.itemId}`, potionQty) > 1 ? `${useAmount(`potion-${potion.itemId}`, potionQty)}개 사용` : '사용'}</button></article>
          <article class="care-action"><div class="care-action-icon">${itemArt('EVOLVE_STONE')}</div><div><h4>${evo ? `${pet.evolutionStage + 1}단계 진화` : '진화'}</h4>
            <p>${evo ? `Lv. ${evo.requiredLevel} 이상 · <span class="cell-icon" aria-hidden="true">⬡</span> ${evo.cellCost.toLocaleString()}` : evoNote}</p></div>
            <button data-evolve ${busy || !evoReady ? 'disabled' : ''}>진화하기</button></article>
        </div>
        <p class="care-note">${evo ? `${evoNote} ` : ''}미니게임에서 적을 정화하고 귀환하거나 클리어해도 경험치를 받아요.</p>`;
    } else {
      const treats = itemsOf(['FOOD', 'SNACK', 'TOY']);
      body = `${meter('배고픔', pet.hunger, 100, 'tone-hunger')}${meter('호감도', pet.affection, 100, 'tone-affection')}
        <div class="care-actions">
          ${treats.map(item => {
            const qty = owned[item.itemId] ?? 0;
            const full = (item.hungerRestore <= 0 || pet.hunger >= 100) && (item.affectionRestore <= 0 || pet.affection >= 100);
            const effect = [item.hungerRestore > 0 ? `배고픔 +${item.hungerRestore}` : '', item.affectionRestore > 0 ? `호감도 +${item.affectionRestore}` : ''].filter(Boolean).join(' · ');
            // 가득 찰 때까지 필요한 개수보다 많이는 못 고르게 (보유 개수·99개도 넘지 않게)
            const need = Math.max(item.hungerRestore > 0 ? Math.ceil((100 - pet.hunger) / item.hungerRestore) : 0,
              item.affectionRestore > 0 ? Math.ceil((100 - pet.affection) / item.affectionRestore) : 0);
            const key = `feed-${item.itemId}`;
            const amount = useAmount(key, Math.min(qty, need));
            const verb = item.itemType === 'TOY' ? '놀아주기' : '주기';
            return `<article class="care-action"><div class="care-action-icon">${itemArt(item.itemType)}</div><div><h4>${escapeHtml(item.name)}</h4><p>${effect} · 보유 ${qty}개</p></div>
              ${useStepper(key, item.name, Math.min(qty, need), busy || !qty || full)}
              <button data-feed="${item.itemId}" ${busy || !qty || full ? 'disabled' : ''}>${amount > 1 ? (item.itemType === 'TOY' ? `${amount}번 놀아주기` : `${amount}개 주기`) : verb}</button></article>`;
          }).join('')}
          <article class="care-action"><div class="care-action-icon"><svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 92C34 74 26 60 26 48a16 16 0 0 1 34-6 16 16 0 0 1 34 6c0 12-8 26-34 44z" fill="#E59A8C"/></svg></div>
            <div><h4>쓰다듬기</h4><p>호감도 +5 · 아이템 없이</p></div><button data-pat ${busy || pet.affection >= 100 ? 'disabled' : ''}>쓰다듬기</button></article>
        </div>
        <p class="care-note">배고픔 수치가 높을수록 배가 부른 상태예요. 아이템은 펫 상점 탭에서 살 수 있어요.</p>`;
    }
    return `<div class="care">${list}<section class="care-detail">${head}${body}</section></div>`;
  };
  const loadCareDetail = async () => {
    const id = careId;
    if (id === null || careDetail?.userPetId === id) return;
    try {
      const detail = await getPetDetail(id);
      if (careId === id) {
        careDetail = detail;
        if (activeTab === 3) refresh();
      }
    } catch { /* 진화 조건만 못 불러옴 */ }
  };
  const selectCare = (id: number) => { careId = id; careDetail = null; useCount = {}; result.textContent = ''; refresh(); void loadCareDetail(); };
  const changeUse = (button: HTMLButtonElement) => {
    if (busy) return;
    const inc = !!button.dataset.useInc, key = (button.dataset.useInc ?? button.dataset.useDec)!, max = Number(button.dataset.useMax) || 1;
    useCount[key] = Math.min(max, Math.max(1, Math.min(Math.max(1, useCount[key] ?? 1), max) + (inc ? 1 : -1)));
    refresh();
    const same = panel.querySelector<HTMLButtonElement>(`[data-use-${inc ? 'inc' : 'dec'}="${key}"]`);
    const other = panel.querySelector<HTMLButtonElement>(`[data-use-${inc ? 'dec' : 'inc'}="${key}"]`);
    (same && !same.disabled ? same : other)?.focus({ preventScroll: true });
  };
  const careAct = async (run: () => Promise<{ pet: Pet; message: string }>, focusSelector: string) => {
    if (busy || buying !== null || careId === null) return;
    busy = true; refresh();
    try {
      const { pet, message } = await run();
      myPets = myPets.map(p => p.userPetId === pet.userPetId ? pet : p);
      const [inventory, me] = await Promise.all([getInventory(), getMe()]);
      owned = Object.fromEntries(inventory.items.map(entry => [entry.item.itemId, entry.quantity]));
      balance = me.cellBalance;
      careDetail = null; void loadCareDetail();
      result.textContent = message;
      onChange();
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : '처리하지 못했어요.';
    }
    busy = false; refresh();
    panel.querySelector<HTMLButtonElement>(focusSelector)?.focus();
  };
  // 서버에서 상품·보유 개수·셀 잔액을 한 번에 불러오기
  const loadServer = async () => {
    try {
      const [items, inventory, me, gachaPools, pets] = await Promise.all([getShopItems(), getInventory(), getMe(), getGachaPools(), getMyPets()]);
      myPets = pets;
      if (careId === null || !pets.some(p => p.userPetId === careId)) careId = (pets.find(p => p.isRepresentative) ?? pets[0])?.userPetId ?? null;
      careDetail = null;
      serverItems = items;
      pools = gachaPools;
      equipQty = Object.fromEntries(inventory.equipments.map(entry => [entry.equipment.equipmentId, entry.quantity]));
      owned = Object.fromEntries(inventory.items.map(entry => [entry.item.itemId, entry.quantity]));
      balance = me.cellBalance;
      loadError = '';
    } catch (error) {
      loadError = error instanceof Error ? error.message : '서버에 연결할 수 없어요.';
    }
    loading = false;
    refresh();
    void loadCareDetail();
  };
  // 구매: 서버가 셀 차감·아이템 지급을 처리하고, 바뀐 잔액·보유 개수를 돌려줌
  const purchase = async (button: HTMLButtonElement) => {
    if (buying !== null || busy || phase === 'charging' || phase === 'reveal') return;
    const itemId = Number(button.dataset.buy);
    const item = serverItems.find(entry => entry.itemId === itemId);
    if (!item) return;
    const amount = clampCount(buyCount[itemId]);
    if (balance !== null && balance < item.priceCell * amount) {
      result.textContent = `보유 셀이 부족해요. ${amount}개를 사려면 ${(item.priceCell * amount).toLocaleString()}셀이 필요해요. (보유 ${balance.toLocaleString()}셀)`;
      result.dataset.state = 'error';
      return;
    }
    buying = itemId;
    result.textContent = '';
    refresh();
    panel.querySelector<HTMLButtonElement>(`#buy-${itemId}`)?.focus({ preventScroll: true });
    try {
      const bought = await buyItem(itemId, amount);
      balance = bought.balance;
      owned[itemId] = bought.item.quantity;
      result.textContent = `${itemName(bought.item.item)} ${amount}개를 구매했어요. · ${bought.item.quantity.toLocaleString()}개 보유`;
      result.dataset.state = 'success';
      onChange();
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : '구매하지 못했어요.';
      result.dataset.state = 'error';
    } finally {
      const focusedId = panel.contains(document.activeElement) ? document.activeElement?.id : '';
      buying = null;
      refresh();
      if (dialog.open && activeTab === 2 && (focusedId?.startsWith('buy-') || focusedId?.startsWith('qty-'))) {
        panel.querySelector<HTMLButtonElement>(`#${focusedId}`)?.focus({ preventScroll: true });
      }
    }
  };
  // 구매 개수 −/＋ (1개 ~ 99개, 잔액이 모자라면 구매할 때 알려줌)
  const changeCount = (button: HTMLButtonElement) => {
    if (buying !== null) return;
    const itemId = Number(button.dataset.qtyDec ?? button.dataset.qtyInc);
    const item = serverItems.find(entry => entry.itemId === itemId);
    if (!item) return;
    buyCount[itemId] = clampCount(clampCount(buyCount[itemId]) + (button.dataset.qtyInc ? 1 : -1));
    refresh();
    // 끝(1개·99개)에 닿아 버튼이 꺼지면 반대쪽 버튼으로 포커스를 옮김
    const same = panel.querySelector<HTMLButtonElement>(`#${button.id}`);
    const other = panel.querySelector<HTMLButtonElement>(`#qty-${button.dataset.qtyInc ? 'dec' : 'inc'}-${itemId}`);
    (same && !same.disabled ? same : other && !other.disabled ? other : panel.querySelector<HTMLButtonElement>(`#buy-${itemId}`))?.focus({ preventScroll: true });
  };
  // 뽑기: 서버가 셀 차감·펫 지급(또는 중복 환급)을 처리. 결과가 오면 연출을 보여주고, 끝나면 도감·남은 횟수를 다시 그림
  const wait = (ms: number) => new Promise<void>(resolve => {
    const timer = setTimeout(() => { skipReveal = null; resolve(); }, ms);
    skipReveal = () => { clearTimeout(timer); skipReveal = null; resolve(); };   // 정원판을 누르면 바로 결과로
  });
  // 최근 뽑기 기록 열기·닫기 (지금 보고 있는 종류만, 최근 30번)
  const toggleHistory = async () => {
    if (history !== null) { history = null; refresh(); panel.querySelector<HTMLButtonElement>('#gacha-history')?.focus(); return; }
    try { history = await getGachaHistory(gachaKind); }
    catch (error) { result.textContent = error instanceof Error ? error.message : '기록을 불러오지 못했어요.'; return; }
    refresh();
    panel.querySelector<HTMLButtonElement>('#gacha-history')?.focus();
  };
  const draw = async (poolId: number) => {
    if (buying !== null || busy || phase === 'charging' || phase === 'reveal') return;
    const quick = reducedMotion();
    phase = 'charging'; newKey = null; history = null; result.textContent = '';
    refresh();
    const started = Date.now();
    let nextPools: GachaPool[] | undefined;
    try {
      const poolType = pools.find(p => p.poolId === poolId)?.poolType;
      const forced = poolType ? takeDemoPick(poolType) : null;
      lastDraw = await drawGacha(poolId, forced?.id);
      nextPools = await getGachaPools();
      if (!quick) {
        await new Promise(r => setTimeout(r, Math.max(0, MIN_CHARGE_MS - (Date.now() - started))));
        phase = 'reveal';
        refresh();
        await wait(REVEAL_MS[lastDraw.grade]);
      }
      balance = lastDraw.balance;
      newKey = lastDraw.pet ? (lastDraw.isDuplicate ? null : `p${lastDraw.pet.species.speciesId}`)
        : lastDraw.equipment && lastDraw.equipment.quantity === 1 ? `e${lastDraw.equipment.equipment.equipmentId}` : null;
      if (lastDraw.equipment) equipQty[lastDraw.equipment.equipment.equipmentId] = lastDraw.equipment.quantity;
      if (nextPools) pools = nextPools;
      phase = dialog.open ? 'done' : 'idle';
      if (!dialog.open) { lastDraw = null; newKey = null; }
      result.textContent = lastDraw?.pet
        ? `${lastDraw.pet.species.name}(${gradeInfo[lastDraw.grade].label})${lastDraw.isDuplicate ? `, 이미 있는 펫이라 ${lastDraw.refundCell ?? 0}셀을 돌려받았어요.` : '을(를) 처음 만났어요.'}`
        : lastDraw?.equipment ? `${lastDraw.equipment.equipment.name}(${gradeInfo[lastDraw.grade].label})을(를) 얻었어요. ${lastDraw.equipment.quantity}개 보유` : '';
    } catch (error) {
      phase = lastDraw ? 'done' : 'idle';
      result.textContent = error instanceof Error ? error.message : '뽑기를 하지 못했어요.';
    }
    refresh();
    onChange();
    panel.querySelector<HTMLButtonElement>('#gacha-draw')?.focus();
  };
  const selectTab = (index: number) => { activeTab = index; result.textContent = ''; delete result.dataset.state; if (phase === 'done') { phase = 'idle'; newKey = null; } refresh(); panel.scrollTop = 0; };
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
    const pickSlot = (event.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    if (pickSlot) { pickDex(pickSlot); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (button.dataset.carePet) { selectCare(Number(button.dataset.carePet)); panel.querySelector<HTMLButtonElement>(`[data-care-pet="${button.dataset.carePet}"]`)?.focus(); return; }
    if (button.dataset.goto) { selectTab(Number(button.dataset.goto)); return; }
    const named = (pet: Pet) => pet.nickname ?? pet.species.name;
    if (button.dataset.feed) {
      const itemId = Number(button.dataset.feed);
      const times = Math.max(1, useCount[`feed-${itemId}`] ?? 1);
      void careAct(async () => {
        const r = await feedPet(careId!, itemId, times);   // 서버가 한 번에 처리 (가득 차면 필요한 만큼만 씀)
        const done = r.quantity ?? 1;
        return { pet: r.pet, message: `${named(r.pet)}에게 ${r.used.name}을(를) ${times > 1 ? `${done}개 ` : ''}줬어요.${done < times ? ` (가득 차서 ${done}개만 썼어요)` : ''}` };
      }, `[data-feed="${itemId}"]`); return;
    }
    if (button.hasAttribute('data-pat')) { void careAct(async () => { const pet = await patPet(careId!); return { pet, message: `${named(pet)}을(를) 쓰다듬었어요.` }; }, '[data-pat]'); return; }
    if (button.dataset.potion) {
      const itemId = Number(button.dataset.potion);
      const times = Math.max(1, useCount[`potion-${itemId}`] ?? 1);
      const had = owned[itemId] ?? 0;
      void careAct(async () => {
        const pet = await usePetPotion(careId!, itemId, times);   // 서버가 한 번에 처리 (최대 레벨이 되면 거기서 멈춤)
        const left = (await getInventory()).items.find(entry => entry.item.itemId === itemId)?.quantity ?? 0;
        const done = Math.max(1, had - left);
        return { pet, message: `경험치 포션을 ${times > 1 ? `${done}개 ` : ''}썼어요. 지금 Lv. ${pet.level}이에요.${done < times ? ` (최대 레벨이 되어 ${done}개만 썼어요)` : ''}` };
      }, '[data-potion]'); return;
    }
    if (button.hasAttribute('data-evolve')) { void careAct(async () => { const pet = await evolvePet(careId!); return { pet, message: `${named(pet)}이(가) ${pet.evolutionStage}단계로 진화했어요!` }; }, '[data-evolve]'); return; }
    if (button.dataset.qtyDec || button.dataset.qtyInc) { changeCount(button); return; }
    if (button.dataset.useDec || button.dataset.useInc) { changeUse(button); return; }
    if (button.dataset.buy) { void purchase(button); return; }
    else if (button.dataset.draw) { void draw(Number(button.dataset.draw)); return; }
    else if (button.dataset.demoDraws) { void moreDraws(Number(button.dataset.demoDraws)); return; }
    if (button.dataset.kind && phase !== 'charging' && phase !== 'reveal') {          // [펫 뽑기 | 장비 뽑기] 전환
      gachaKind = button.dataset.kind as GachaKind; phase = 'idle'; lastDraw = null; newKey = null; history = null; result.textContent = '';
      refresh(); panel.querySelector<HTMLButtonElement>(`[data-kind="${gachaKind}"]`)?.focus(); return;
    }
    if (button.hasAttribute('data-history')) { void toggleHistory(); return; }
    else if (button.hasAttribute('data-reload')) { loading = true; loadError = ''; refresh(); panel.focus(); void loadServer(); return; }
  });
  // 시연: 오늘 뽑기 횟수 +1
  const moreDraws = async (poolId: number) => {
    try { pools = await addDemoDraws(poolId); result.textContent = '오늘 뽑기 횟수를 1번 늘렸어요.'; }
    catch (error) { result.textContent = error instanceof Error ? error.message : '뽑기 횟수를 늘리지 못했어요.'; return; }
    refresh();
    panel.querySelector<HTMLButtonElement>(`[data-demo-draws="${poolId}"]`)?.focus();
  };
  // 시연: 도감 칸을 누르면 그 펫·장비를 다음 뽑기 결과로 지정 (같은 칸을 다시 누르면 해제)
  const pickDex = (slot: HTMLElement) => {
    if (phase === 'charging' || phase === 'reveal') return;
    const pickId = Number(slot.dataset.pick);
    // 펫은 중복 없이 뽑히므로 이미 가진 펫은 지정할 수 없다
    if (gachaKind === 'PET' && slot.hasAttribute('data-owned')) { result.textContent = `${slot.dataset.pickName}은(는) 이미 함께하는 펫이에요.`; return; }
    if (peekDemoPick(gachaKind)?.id === pickId) takeDemoPick(gachaKind);
    else setDemoPick(gachaKind, pickId, slot.dataset.pickName ?? '');
    const picked = peekDemoPick(gachaKind);
    result.textContent = picked ? `다음 뽑기에서 ${picked.name}이(가) 나와요.` : '지정을 해제했어요.';
    refresh();
    panel.querySelector<HTMLElement>(`[data-pick="${pickId}"]`)?.focus();
  };
  panel.addEventListener('keydown', event => {
    const slot = (event.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    if (slot && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); pickDex(slot); }
  });
  // ESC 로 상점 닫기: 포커스가 어디에 있든(다시 그려져서 body 로 빠진 경우 포함) 확실히 닫히게 직접 처리
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.repeat || !dialog.open || !dialog.isConnected) return;
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  }, true);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  // 상점을 닫았다 다시 열면 뽑기 칸은 다시 알로 (연출 중이면 그대로 둠)
  dialog.addEventListener('close', () => {
    if (phase === 'charging' || phase === 'reveal') return;
    phase = 'idle'; lastDraw = null; newKey = null; history = null;
  });
  // 상점을 닫으면 고른 구매 개수는 다시 1개로
  dialog.addEventListener('close', () => { buyCount = {}; useCount = {}; });
  return () => {
    if (buying === null) { loading = true; loadError = ''; }
    selectTab(2);
    dialog.showModal();
    if (buying === null) void loadServer();
  };
}
