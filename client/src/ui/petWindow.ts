// 🟩 펫 창 (P 키) — [펫] 탭: 도감처럼 펫 칸을 보여주고, 가진 펫을 골라 마이룸 대표 펫으로 장착·해제  담당: 창규
// 칸 목록 = 펫 뽑기에 나오는 펫(시연용 4종) + 그 밖에 내가 가진 펫. 가진 펫은 컬러, 없는 펫은 흐리게.
// [장비] 탭: 대표 펫의 장비 칸(등급만큼 열림: 노말 1 · 레어 2 · 레전드 3) + 장비 도감. 칸 종류는 자유,
//            한 펫에 같은 종류는 하나만, 끼우면 가방에서 1개 빠지고 빼면 돌아온다 (서버 규칙과 같음).
import type { Equipment, GachaPool, Grade, Pet, PetDetail, PetGear, PetSpecies } from '../../../shared/types';
import { getGachaPools, getInventory } from '../api/shop';
import { equipToPet, getMyPets, getPetDetail, getPetGear, setRepresentativePet, unequipFromPet } from '../api/pets';

const gradeLabel: Record<Grade, string> = { NORMAL: '노말', RARE: '레어', LEGEND: '레전드' };
const statName: Record<string, string> = { BULLET_SPEED: '탄속', MAX_HP: '체력', MOVE_SPEED: '이동 속도', ATTACK: '공격력' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const petImage = (species: PetSpecies, alt = '') => species.imageUrl
  ? `<img src="${species.imageUrl}" alt="${escapeHtml(alt)}"/>`
  : `<span class="pet-noimg" aria-hidden="true">${escapeHtml(species.name.slice(0, 1))}</span>`;
const gearImage = (eq: Equipment, alt = '') => eq.imageUrl
  ? `<img src="${eq.imageUrl}" alt="${escapeHtml(alt)}"/>`
  : `<span class="pet-noimg" aria-hidden="true">${escapeHtml(eq.name.slice(0, 1))}</span>`;
/** 받침 있으면 '과', 없으면 '와' */
const hasBatchim = (word: string) => { const c = word.charCodeAt(word.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 > 0; };
const withWa = (word: string) => word + (hasBatchim(word) ? '과' : '와');
const withEul = (word: string) => word + (hasBatchim(word) ? '을' : '를');
const gradeTag = (grade: Grade) => `<span class="pet-grade grade-${grade.toLowerCase()}">${gradeLabel[grade]}</span>`;

type Slot = { species: PetSpecies; pet?: Pet; drawable: boolean };
type GearEntry = { equipment: Equipment; qty: number };
type Tab = 'pet' | 'gear';
const gradeOrder: Record<Grade, number> = { NORMAL: 0, RARE: 1, LEGEND: 2 };
const lineOrder = ['HELMET', 'GLOVE', 'BOOTS'];   // 모자 → 목걸이 → 신발 (상점 도감과 같은 순서)

// 3D 모델이 있는 펫 (client/public/assets/pet/pet-{code}.glb). 없는 펫은 그림을 세워서 보여준다.
const modelCodes = new Set(['dog', 'cat', 'panda', 'gumiho']);
// 마이룸에서 맞출 모델 전체 높이. 기본 .75 — 구미호는 꼬리가 머리 위로 솟아서 전체 높이로 맞추면 몸이 작아지므로
// 몸통 높이가 판다와 같아지도록 크게 잡는다 (판다 몸통 1.44/전체 1.57, 구미호 몸통 1.27/전체 2.03 → 약 1.1)
const modelHeight: Record<string, number> = { gumiho: 1.1 };
/** 마이룸이 따라다니게 할 펫 정보 (room.setPet 에 그대로 넘긴다) */
export const roomPetOf = (pet: Pet | undefined) => pet
  ? { name: pet.nickname ?? pet.species.name,
      modelPath: pet.species.code && modelCodes.has(pet.species.code) ? `pet/pet-${pet.species.code}.glb` : null,
      imageUrl: pet.species.imageUrl ?? null,
      height: (pet.species.code && modelHeight[pet.species.code]) || undefined }
  : null;

export function createPetWindow(container: HTMLElement, onRepresentativeChange: (pet: Pet | undefined) => void) {
  let tab: Tab = 'pet';
  let renderedTab: Tab | null = null;   // 마지막으로 그린 탭 (스크롤 유지용 — 컨테이너에 data-tab 을 달면 탭 버튼으로 오인됨)
  let slots: Slot[] = [];
  let selected: number | null = null;   // speciesId
  let gear: GearEntry[] = [];
  let repDetail: PetDetail | null = null;
  let myPets: Pet[] = [];
  let petGear = new Map<number, PetGear>();   // userPetId → 그 펫의 장비 칸
  let gearSelected: number | null = null;   // equipmentId
  let gearSlot: number | null = null;       // 장비 탭에서 고른 칸 번호 (없으면 자동)
  let busy = false;
  let message = '';
  let failed = false;

  // ── 펫 탭 ───────────────────────────────────────────────
  const detail = (slot: Slot | undefined) => {
    if (!slot) return `<section class="pet-detail pet-detail-empty"><p>왼쪽에서 펫을 골라주세요.</p></section>`;
    const { species, pet, drawable } = slot;
    const name = pet?.nickname ?? species.name;
    const grade = gradeTag(species.grade);
    if (!pet) {
      return `<section class="pet-detail is-locked" aria-labelledby="pet-name">
        <div class="pet-preview">${petImage(species)}</div>
        <h3 id="pet-name">${escapeHtml(name)} ${grade}</h3>
        <p class="pet-description">${drawable ? '아직 만나지 못한 펫이에요. 상점의 펫 뽑기에서 만날 수 있어요.' : '아직 만나지 못한 펫이에요. 지금은 펫 뽑기에 나오지 않아요.'}</p>
        <dl class="pet-stats"><div><dt>능력</dt><dd>${escapeHtml(species.ability.name)}</dd></div></dl>
      </section>`;
    }
    const exp = pet.expToNext === 0 ? '최대 레벨' : `경험치 ${pet.exp}/${pet.expToNext}`;
    return `<section class="pet-detail" aria-labelledby="pet-name">
        <div class="pet-preview">${petImage(species, `${name} 미리보기`)}</div>
        <h3 id="pet-name">${escapeHtml(name)} ${grade}</h3>
        <dl class="pet-stats">
          <div><dt>호감도</dt><dd>${pet.affection}/100</dd></div>
          <div><dt>배고픔</dt><dd>${pet.hunger}/100</dd></div>
          <div><dt>능력</dt><dd>${escapeHtml(species.ability.name)}</dd></div>
        </dl>
        <p class="pet-progress">Lv. ${pet.level} · ${exp}</p>
        ${petGearRow(pet)}
        <button class="pet-equip-button${pet.isRepresentative ? ' equipped' : ''}" data-equip="${pet.userPetId}" ${busy ? 'disabled' : ''}>
          ${busy ? '바꾸는 중' : pet.isRepresentative ? '해제' : '장착'}</button>
        <p class="pet-window-message" role="status">${escapeHtml(message)}</p>
      </section>`;
  };

  /** 펫 탭 상세: 이 펫이 끼고 있는 장비 3칸 (작게) */
  const petGearRow = (pet: Pet) => {
    const g = petGear.get(pet.userPetId);
    if (!g) return '';
    return `<div class="pet-gear-row" aria-label="장비 칸"><span>장비</span>${g.equipments.map(({ slotNo, equipment }) => {
      const locked = slotNo > g.equipSlotCount;
      return `<i class="pet-gear-mini${locked ? ' is-locked' : ''}" title="${slotNo}번 칸: ${locked ? '잠김' : equipment ? `${escapeHtml(equipment.name)} ${gradeLabel[equipment.grade]}` : '비어 있음'}">${
        locked ? '🔒' : equipment ? gearImage(equipment, `${equipment.name} ${gradeLabel[equipment.grade]}`) : ''}</i>`;
    }).join('')}</div>`;
  };

  const petTab = () => {
    const owned = slots.filter(s => s.pet).length;
    const cards = slots.map(({ species, pet }) => `<button class="pet-card${pet ? '' : ' is-locked'}" data-species="${species.speciesId}"
        aria-pressed="${selected === species.speciesId}" aria-label="${escapeHtml(species.name)}${pet ? '' : ', 아직 없음'}">
        ${pet?.isRepresentative ? '<span class="pet-equipped-badge">장착중</span>' : ''}
        ${petImage(species)}<strong>${escapeHtml(pet?.nickname ?? species.name)}</strong></button>`).join('');
    return `<div class="pet-list" aria-label="펫 목록">
        <p class="pet-list-count">${slots.length}마리 중 ${owned}마리를 만났어요</p>${cards}</div>
      ${detail(slots.find(s => s.species.speciesId === selected))}`;
  };

  // ── 장비 탭 ─────────────────────────────────────────────
  /** 이 장비를 끼고 있는 펫들 (대표 펫 먼저) */
  const wornBy = (equipmentId: number) => myPets.flatMap(pet => (petGear.get(pet.userPetId)?.equipments ?? [])
    .filter(s => s.equipment?.equipmentId === equipmentId).map(s => ({ pet, slotNo: s.slotNo })))
    .sort((a, b) => Number(b.pet.isRepresentative) - Number(a.pet.isRepresentative));
  const petName = (pet: Pet) => pet.nickname ?? pet.species.name;
  const petFace = (pet: Pet) => pet.species.imageUrl
    ? `<img class="gear-face" src="${pet.species.imageUrl}" alt="" title="${escapeHtml(petName(pet))}"/>`
    : `<span class="gear-face pet-noimg" title="${escapeHtml(petName(pet))}">${escapeHtml(petName(pet).slice(0, 1))}</span>`;
  const equippedSlotOf = (equipmentId: number) => repDetail?.equipments.find(s => s.equipment?.equipmentId === equipmentId)?.slotNo ?? null;
  /** 이 장비를 끼울 칸: 고른 칸 → 같은 종류가 있는 칸(교체) → 첫 빈 칸. 없으면 null */
  const targetSlotFor = (eq: Equipment) => {
    if (!repDetail) return null;
    const open = repDetail.equipments.filter(s => s.slotNo <= repDetail!.equipSlotCount);
    if (gearSlot !== null && open.some(s => s.slotNo === gearSlot)) return gearSlot;
    return open.find(s => s.equipment?.lineCode === eq.lineCode)?.slotNo ?? open.find(s => !s.equipment)?.slotNo ?? null;
  };

  const gearSlotsStrip = () => {
    if (!repDetail) return `<div class="gear-rep is-empty"><p>대표 펫이 없어요. <b>펫</b> 탭에서 펫을 골라 장착하면 그 펫에게 장비를 끼울 수 있어요.</p></div>`;
    const rep = repDetail;
    const boxes = rep.equipments.map(({ slotNo, equipment }) => {
      const locked = slotNo > rep.equipSlotCount;
      const label = locked ? '잠김' : equipment ? escapeHtml(equipment.name) : '빈 칸';
      return `<button class="gear-slot${locked ? ' is-locked' : ''}${equipment ? ' has-item' : ''}" data-gear-slot="${slotNo}" ${locked ? 'disabled' : ''}
          aria-pressed="${gearSlot === slotNo}" aria-label="${slotNo}번 칸, ${locked ? '잠김' : equipment ? `${equipment.name} ${gradeLabel[equipment.grade]}` : '비어 있음'}">
          <span class="gear-slot-no">${slotNo}</span>
          ${locked ? '<span class="gear-lock" aria-hidden="true">🔒</span>' : equipment ? gearImage(equipment) : '<span class="gear-plus" aria-hidden="true">+</span>'}
          <small>${label}</small></button>`;
    }).join('');
    const s = rep.combatStats;
    return `<div class="gear-rep">
        <div class="gear-rep-pet">${petImage(rep.species)}<div><strong>${escapeHtml(rep.nickname ?? rep.species.name)}</strong> ${gradeTag(rep.species.grade)}
          <small>열린 칸 ${rep.equipSlotCount}/3 · 체력 ${s.maxHp} · 탄속 ${s.bulletSpeed} · 이동 ${s.moveSpeed}</small></div></div>
        <div class="gear-slots">${boxes}</div></div>`;
  };

  const gearDetail = () => {
    const entry = gear.find(g => g.equipment.equipmentId === gearSelected);
    if (!entry) {
      const slotItem = gearSlot !== null ? repDetail?.equipments.find(s => s.slotNo === gearSlot)?.equipment : null;
      if (slotItem) return gearDetailOf({ equipment: slotItem, qty: gear.find(g => g.equipment.equipmentId === slotItem.equipmentId)?.qty ?? 0 });
      return `<section class="pet-detail pet-detail-empty"><p>장비를 고르면 대표 펫에게 끼울 수 있어요.<br/>위의 칸을 먼저 누르면 그 칸에 끼워요.</p></section>`;
    }
    return gearDetailOf(entry);
  };

  const gearDetailOf = ({ equipment: eq, qty }: GearEntry) => {
    const onSlot = equippedSlotOf(eq.equipmentId);
    const worn = wornBy(eq.equipmentId);
    const stat = `${statName[eq.statCode] ?? eq.statCode} +${Number(eq.statValue)}`;
    let button = '';
    if (onSlot !== null) {
      button = `<button class="pet-equip-button equipped" data-gear-off="${onSlot}" ${busy ? 'disabled' : ''}>${busy ? '바꾸는 중' : `해제 (${onSlot}번 칸)`}</button>`;
    } else if (!repDetail) {
      button = `<button class="pet-equip-button" disabled>대표 펫이 없어요</button>`;
    } else if (qty <= 0) {
      button = `<button class="pet-equip-button" disabled>${worn.length ? '가방에 없어요 · 다른 펫에서 가져오세요' : '가진 장비가 없어요'}</button>`;
    } else {
      const target = targetSlotFor(eq);
      const replacing = target !== null ? repDetail.equipments.find(s => s.slotNo === target)?.equipment : null;
      button = target === null
        ? `<button class="pet-equip-button" disabled>빈 칸이 없어요 · 칸을 골라 바꿔주세요</button>`
        : `<button class="pet-equip-button" data-gear-on="${eq.equipmentId}" data-slot="${target}" ${busy ? 'disabled' : ''}>
            ${busy ? '바꾸는 중' : replacing ? `${target}번 칸 ${escapeHtml(withWa(replacing.name))} 바꾸기` : `장착 (${target}번 칸)`}</button>`;
    }
    const takeTarget = targetSlotFor(eq);
    const wornList = worn.length ? `<div class="gear-worn"><p>착용 중인 펫</p><ul>${worn.map(({ pet, slotNo }) => `<li>
        ${petFace(pet)}<span><b>${escapeHtml(petName(pet))}</b> ${slotNo}번 칸${pet.isRepresentative ? ' <em>대표 펫</em>' : ''}</span>
        ${pet.isRepresentative ? '' : repDetail
          ? `<button class="gear-take" data-take-pet="${pet.userPetId}" data-take-slot="${slotNo}" data-take-eq="${eq.equipmentId}" ${busy || takeTarget === null ? 'disabled' : ''}
              title="${takeTarget === null ? '대표 펫에 빈 칸이 없어요' : `${escapeHtml(petName(pet))}에게서 빼서 대표 펫 ${takeTarget}번 칸에 끼워요`}">가져오기</button>` : ''}</li>`).join('')}</ul></div>` : '';
    const have = qty > 0 || worn.length > 0;
    return `<section class="pet-detail${have ? '' : ' is-locked'}" aria-labelledby="gear-name">
        <div class="pet-preview gear-preview">${gearImage(eq, `${eq.name} 미리보기`)}</div>
        <h3 id="gear-name">${escapeHtml(eq.name)} ${gradeTag(eq.grade)}</h3>
        <dl class="pet-stats">
          <div><dt>능력</dt><dd>${stat}</dd></div>
          <div><dt>가방</dt><dd>${qty}개</dd></div>
          <div><dt>장착</dt><dd>${onSlot !== null ? `${onSlot}번 칸` : '안 함'}</dd></div>
        </dl>
        ${wornList}
        <p class="pet-description">${have ? '끼우면 가방에서 1개 빠지고, 빼면 다시 돌아와요.' : '아직 없는 장비예요. 상점의 장비 뽑기에서 만들 수 있어요.'}</p>
        ${button}
        <p class="pet-window-message" role="status">${escapeHtml(message)}</p>
      </section>`;
  };

  const gearTab = () => {
    const owned = gear.filter(g => g.qty > 0 || wornBy(g.equipment.equipmentId).length > 0).length;
    const cards = gear.map(({ equipment: eq, qty }, i) => {
      const on = equippedSlotOf(eq.equipmentId) !== null;
      const worn = wornBy(eq.equipmentId);
      const faces = worn.length ? `<span class="gear-faces" aria-hidden="true">${worn.slice(0, 3).map(w => petFace(w.pet)).join('')}${worn.length > 3 ? `<b>+${worn.length - 3}</b>` : ''}</span>` : '';
      const head = i === 0 || gear[i - 1].equipment.lineCode !== eq.lineCode
        ? `<p class="gear-row-title">${escapeHtml(eq.name)} <small>${statName[eq.statCode] ?? eq.statCode}</small></p>` : '';
      const have = qty > 0 || worn.length > 0;   // 가방에 없어도 어느 펫이 끼고 있으면 가진 것 (×0)
      const who = worn.length ? `, ${worn.map(w => petName(w.pet)).join('·')} 착용 중` : '';
      return `${head}<button class="pet-card gear-card${have ? '' : ' is-locked'}" data-gear="${eq.equipmentId}"
          aria-pressed="${gearSelected === eq.equipmentId}" aria-label="${escapeHtml(eq.name)} ${gradeLabel[eq.grade]}${have ? `, 가방 ${qty}개${who}` : ', 아직 없음'}">
          ${on ? '<span class="pet-equipped-badge">장착중</span>' : ''}${have ? `<b class="gear-qty${qty ? '' : ' is-zero'}">×${qty}</b>` : ''}${faces}
          ${gearImage(eq)}<small class="grade-${eq.grade.toLowerCase()}">${gradeLabel[eq.grade]}</small></button>`;   // 이름은 줄 제목에
    }).join('');
    return `<div class="pet-list gear-list" aria-label="장비 목록">
        ${gearSlotsStrip()}
        <p class="pet-list-count">${gear.length}개 중 ${owned}개를 가지고 있어요</p>${cards}</div>
      ${gearDetail()}`;
  };

  const render = () => {
    if (failed) {
      container.innerHTML = `<section class="pet-detail pet-detail-empty is-full"><p>펫 정보를 불러오지 못했어요. 서버가 켜져 있는지 확인하고 창을 다시 열어주세요.</p></section>`;
      return;
    }
    const tabs = `<div class="pet-tabs" role="tablist" aria-label="펫 창">
        <button role="tab" data-tab="pet" aria-selected="${tab === 'pet'}">펫</button>
        <button role="tab" data-tab="gear" aria-selected="${tab === 'gear'}">장비</button></div>`;
    // 다시 그려도 스크롤 위치 유지 (목록·상세 각각, 탭별로)
    const keep = (sel: string) => container.querySelector<HTMLElement>(sel)?.scrollTop ?? 0;
    const listTop = keep('.pet-list'), detailTop = keep('.pet-detail'), boxTop = container.scrollTop;
    const sameTab = renderedTab === tab;
    container.innerHTML = tabs + (tab === 'pet' ? petTab() : gearTab());
    renderedTab = tab;
    if (sameTab) {
      const list = container.querySelector<HTMLElement>('.pet-list'), det = container.querySelector<HTMLElement>('.pet-detail');
      if (list) list.scrollTop = listTop;
      if (det) det.scrollTop = detailTop;
      container.scrollTop = boxTop;
    }
  };

  const refresh = async () => {
    try {
      const [pools, pets, inv, allGear] = await Promise.all([getGachaPools(), getMyPets(), getInventory(), getPetGear()]);
      myPets = pets;
      petGear = new Map(allGear.map(g => [g.userPetId, g]));
      const pool: GachaPool | undefined = pools.find(p => p.poolType === 'PET');
      const bySpecies = new Map(pets.map(p => [p.species.speciesId, p]));
      slots = (pool?.entries ?? []).flatMap(e => e.species ? [{ species: e.species, pet: bySpecies.get(e.species.speciesId), drawable: e.drawable }] : []);
      for (const pet of pets) if (!slots.some(s => s.species.speciesId === pet.species.speciesId)) slots.push({ species: pet.species, pet, drawable: false });
      // 노말 → 레어 → 레전드, 같은 등급 안에서는 가진 펫 먼저
      slots = slots.map((s, i) => ({ s, i })).sort((a, b) =>
        gradeOrder[a.s.species.grade] - gradeOrder[b.s.species.grade] || Number(!!b.s.pet) - Number(!!a.s.pet) || a.i - b.i).map(x => x.s);
      // 장비 도감: 장비 뽑기에 나오는 9종 (모자 줄 · 목걸이 줄 · 신발 줄) + 수량
      const qty = new Map(inv.equipments.map(e => [e.equipment.equipmentId, e.quantity]));
      const eqPool = pools.find(p => p.poolType === 'EQUIPMENT');
      gear = (eqPool?.entries ?? []).flatMap(e => e.equipment ? [{ equipment: e.equipment, qty: qty.get(e.equipment.equipmentId) ?? 0 }] : []);
      for (const e of inv.equipments) if (!gear.some(g => g.equipment.equipmentId === e.equipment.equipmentId)) gear.push({ equipment: e.equipment, qty: e.quantity });
      gear.sort((a, b) => lineOrder.indexOf(a.equipment.lineCode) - lineOrder.indexOf(b.equipment.lineCode)
        || gradeOrder[a.equipment.grade] - gradeOrder[b.equipment.grade]);   // 종류끼리 한 줄: 노말 → 레어 → 레전드
      const rep = pets.find(p => p.isRepresentative);
      repDetail = rep ? await getPetDetail(rep.userPetId) : null;
      if (gearSlot !== null && (!repDetail || gearSlot > repDetail.equipSlotCount)) gearSlot = null;
      failed = false;
      if (selected === null || !slots.some(s => s.species.speciesId === selected)) {
        selected = (rep ?? pets[0])?.species.speciesId ?? slots[0]?.species.speciesId ?? null;
      }
      onRepresentativeChange(rep);
    } catch (error) {
      console.error(error);
      failed = true;
    }
    render();
  };

  const act = async (work: () => Promise<unknown>, done: string) => {
    busy = true; render();
    try {
      await work();
      message = done;
      busy = false;
      await refresh();
    } catch (error) {
      busy = false;
      message = error instanceof Error ? error.message : '바꾸지 못했어요. 다시 눌러주세요.';
      render();
    }
  };

  container.addEventListener('click', async event => {
    const target = event.target as HTMLElement;
    const tabBtn = target.closest<HTMLElement>('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab as Tab; message = ''; render(); return; }
    const card = target.closest<HTMLElement>('[data-species]');
    if (card) { selected = Number(card.dataset.species); message = ''; render(); return; }
    const gearCard = target.closest<HTMLElement>('[data-gear]');
    if (gearCard) { gearSelected = Number(gearCard.dataset.gear); message = ''; render(); return; }
    const slotBtn = target.closest<HTMLElement>('[data-gear-slot]');
    if (slotBtn) {
      const no = Number(slotBtn.dataset.gearSlot);
      gearSlot = gearSlot === no ? null : no;
      const inSlot = repDetail?.equipments.find(s => s.slotNo === no)?.equipment;
      if (gearSlot !== null && inSlot) gearSelected = inSlot.equipmentId;   // 장비 있는 칸 → 그 장비 보여주기 (해제 버튼)
      message = ''; render(); return;
    }
    if (busy) return;
    const on = target.closest<HTMLElement>('[data-gear-on]');
    if (on && repDetail) {
      const eqId = Number(on.dataset.gearOn), slotNo = Number(on.dataset.slot), petId = repDetail.userPetId;
      const name = gear.find(g => g.equipment.equipmentId === eqId)?.equipment.name ?? '장비';
      await act(() => equipToPet(petId, slotNo, eqId), `${slotNo}번 칸에 ${name} 장착 완료!`);
      gearSlot = null; render();
      return;
    }
    const take = target.closest<HTMLElement>('[data-take-pet]');
    if (take && repDetail) {
      const fromPet = Number(take.dataset.takePet), fromSlot = Number(take.dataset.takeSlot), eqId = Number(take.dataset.takeEq);
      const eq = gear.find(g => g.equipment.equipmentId === eqId)?.equipment;
      const toSlot = eq ? targetSlotFor(eq) : null, repId = repDetail.userPetId;
      if (!eq || toSlot === null) return;
      const from = myPets.find(p => p.userPetId === fromPet);
      // 다른 펫에서 빼고(가방으로) → 대표 펫에 끼우기. 두 번째가 실패해도 장비는 가방에 남아서 잃어버리지 않는다.
      await act(async () => { await unequipFromPet(fromPet, fromSlot); await equipToPet(repId, toSlot, eqId); },
        `${from ? petName(from) : '다른 펫'}에게서 ${withEul(eq.name)} 가져와 ${toSlot}번 칸에 끼웠어요.`);
      gearSlot = null; render();
      return;
    }
    const off = target.closest<HTMLElement>('[data-gear-off]');
    if (off && repDetail) {
      const slotNo = Number(off.dataset.gearOff), petId = repDetail.userPetId;
      await act(() => unequipFromPet(petId, slotNo), `${slotNo}번 칸 장비를 빼서 가방에 넣었어요.`);
      return;
    }
    const equip = target.closest<HTMLButtonElement>('[data-equip]');
    if (!equip) return;
    const slot = slots.find(s => s.pet?.userPetId === Number(equip.dataset.equip));
    if (!slot?.pet) return;
    const turnOn = !slot.pet.isRepresentative;
    const petId = slot.pet.userPetId;
    await act(() => setRepresentativePet(petId, turnOn), turnOn ? '장착했어요. 마이룸에서 따라다녀요.' : '장착을 해제했어요.');
  });

  return { refresh };
}
