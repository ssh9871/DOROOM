// 🟩 펫 창 (P 키) — 도감처럼 펫 칸을 보여주고, 가진 펫을 골라 마이룸 대표 펫으로 장착·해제  담당: 창규
// 칸 목록 = 펫 뽑기에 나오는 펫(시연용 4종) + 그 밖에 내가 가진 펫. 가진 펫은 컬러, 없는 펫은 흐리게.
import type { GachaPool, Grade, Pet, PetSpecies } from '../../../shared/types';
import { getGachaPools } from '../api/shop';
import { getMyPets, setRepresentativePet } from '../api/pets';

const gradeLabel: Record<Grade, string> = { NORMAL: '노말', RARE: '레어', LEGEND: '레전드' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const petImage = (species: PetSpecies, alt = '') => species.imageUrl
  ? `<img src="${species.imageUrl}" alt="${escapeHtml(alt)}"/>`
  : `<span class="pet-noimg" aria-hidden="true">${escapeHtml(species.name.slice(0, 1))}</span>`;

type Slot = { species: PetSpecies; pet?: Pet; drawable: boolean };
const gradeOrder: Record<Grade, number> = { NORMAL: 0, RARE: 1, LEGEND: 2 };

// 3D 모델이 있는 펫 (client/public/assets/pet/pet-{code}.glb). 없는 펫은 그림을 세워서 보여준다.
const modelCodes = new Set(['dog', 'cat', 'panda', 'gumiho']);
/** 마이룸이 따라다니게 할 펫 정보 (room.setPet 에 그대로 넘긴다) */
export const roomPetOf = (pet: Pet | undefined) => pet
  ? { name: pet.nickname ?? pet.species.name,
      modelPath: pet.species.code && modelCodes.has(pet.species.code) ? `pet/pet-${pet.species.code}.glb` : null,
      imageUrl: pet.species.imageUrl ?? null }
  : null;

export function createPetWindow(container: HTMLElement, onRepresentativeChange: (pet: Pet | undefined) => void) {
  let slots: Slot[] = [];
  let selected: number | null = null;   // speciesId
  let busy = false;
  let message = '';
  let failed = false;

  const detail = (slot: Slot | undefined) => {
    if (!slot) return `<section class="pet-detail pet-detail-empty"><p>왼쪽에서 펫을 골라주세요.</p></section>`;
    const { species, pet, drawable } = slot;
    const name = pet?.nickname ?? species.name;
    const grade = `<span class="pet-grade grade-${species.grade.toLowerCase()}">${gradeLabel[species.grade]}</span>`;
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
        <button class="pet-equip-button${pet.isRepresentative ? ' equipped' : ''}" data-equip="${pet.userPetId}" ${busy ? 'disabled' : ''}>
          ${busy ? '바꾸는 중' : pet.isRepresentative ? '해제' : '장착'}</button>
        <p class="pet-window-message" role="status">${escapeHtml(message)}</p>
      </section>`;
  };

  const render = () => {
    if (failed) {
      container.innerHTML = `<section class="pet-detail pet-detail-empty is-full"><p>펫 정보를 불러오지 못했어요. 서버가 켜져 있는지 확인하고 창을 다시 열어주세요.</p></section>`;
      return;
    }
    const owned = slots.filter(s => s.pet).length;
    const cards = slots.map(({ species, pet }) => `<button class="pet-card${pet ? '' : ' is-locked'}" data-species="${species.speciesId}"
        aria-pressed="${selected === species.speciesId}" aria-label="${escapeHtml(species.name)}${pet ? '' : ', 아직 없음'}">
        ${pet?.isRepresentative ? '<span class="pet-equipped-badge">장착중</span>' : ''}
        ${petImage(species)}<strong>${escapeHtml(pet?.nickname ?? species.name)}</strong></button>`).join('');
    container.innerHTML = `<div class="pet-list" aria-label="펫 목록">
        <p class="pet-list-count">${slots.length}마리 중 ${owned}마리를 만났어요</p>${cards}</div>
      ${detail(slots.find(s => s.species.speciesId === selected))}`;
  };

  const refresh = async () => {
    try {
      const [pools, pets] = await Promise.all([getGachaPools(), getMyPets()]);
      const pool: GachaPool | undefined = pools.find(p => p.poolType === 'PET');
      const bySpecies = new Map(pets.map(p => [p.species.speciesId, p]));
      slots = (pool?.entries ?? []).flatMap(e => e.species ? [{ species: e.species, pet: bySpecies.get(e.species.speciesId), drawable: e.drawable }] : []);
      for (const pet of pets) if (!slots.some(s => s.species.speciesId === pet.species.speciesId)) slots.push({ species: pet.species, pet, drawable: false });
      // 노말 → 레어 → 레전드, 같은 등급 안에서는 가진 펫 먼저
      slots = slots.map((s, i) => ({ s, i })).sort((a, b) =>
        gradeOrder[a.s.species.grade] - gradeOrder[b.s.species.grade] || Number(!!b.s.pet) - Number(!!a.s.pet) || a.i - b.i).map(x => x.s);
      failed = false;
      if (selected === null || !slots.some(s => s.species.speciesId === selected)) {
        selected = (pets.find(p => p.isRepresentative) ?? pets[0])?.species.speciesId ?? slots[0]?.species.speciesId ?? null;
      }
      onRepresentativeChange(pets.find(p => p.isRepresentative));
    } catch (error) {
      console.error(error);
      failed = true;
    }
    render();
  };

  container.addEventListener('click', async event => {
    const target = event.target as HTMLElement;
    const card = target.closest<HTMLElement>('[data-species]');
    if (card) { selected = Number(card.dataset.species); message = ''; render(); return; }
    const equip = target.closest<HTMLButtonElement>('[data-equip]');
    if (!equip || busy) return;
    const slot = slots.find(s => s.pet?.userPetId === Number(equip.dataset.equip));
    if (!slot?.pet) return;
    const on = !slot.pet.isRepresentative;
    busy = true; render();
    try {
      await setRepresentativePet(slot.pet.userPetId, on);
      message = on ? '장착했어요. 마이룸에서 따라다녀요.' : '장착을 해제했어요.';
      busy = false;
      await refresh();
    } catch (error) {
      busy = false;
      message = error instanceof Error ? error.message : '바꾸지 못했어요. 다시 눌러주세요.';
      render();
    }
  });

  return { refresh };
}
