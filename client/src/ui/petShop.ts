import { shopItems, type PetState } from '../pets/pets';

const tabs = ['펫 뽑기', '펫 스킨', '펫 상점', '펫 성장', '상호작용'];

export function connectPetShop(dialog: HTMLDialogElement, state: PetState, onChange: () => void) {
  const tabList = dialog.querySelector<HTMLElement>('#shop-tabs')!;
  const panel = dialog.querySelector<HTMLElement>('#shop-panel')!;
  const result = dialog.querySelector<HTMLElement>('#shop-result')!;
  let activeTab = 2;
  let selectedPetId = state.pet.id;
  tabList.innerHTML = tabs.map((label, index) => `<button role="tab" id="shop-tab-${index}" aria-controls="shop-panel" data-tab="${index}">${label}</button>`).join('');
  const refresh = () => {
    const pet = state.pet;
    const user = state.user;
    dialog.querySelector('#shop-wallet')!.innerHTML = `<span class="cell-icon" aria-hidden="true">⬡</span> ${user.cells.toLocaleString()}`;
    dialog.querySelector('#shop-wallet')!.setAttribute('aria-label', `보유 ${user.cells.toLocaleString()} 셀`);
    dialog.querySelector('#shop-save-notice')!.textContent = !state.persistent ? '저장할 수 없어요. 새로고침하면 변경 사항이 사라질 수 있어요.' : state.recovered ? '저장 데이터의 잘못된 값을 기본값으로 복구했어요.' : '';
    tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(index === activeTab));
      tab.tabIndex = index === activeTab ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', `shop-tab-${activeTab}`);
    const preview = `<img class="shop-pet-preview" src="${pet.previewPath}" alt="${pet.name}"/>`;
    const progress = `<p class="shop-level">Lv. ${pet.level} · ${pet.name}</p><label for="pet-experience">경험치 ${pet.experience} / ${state.requiredExperience}</label><progress id="pet-experience" value="${pet.experience}" max="${state.requiredExperience}"></progress>`;
    const selector = `<aside class="shop-pet-list"><button class="pet-card" id="select-shop-pet" data-pet="${pet.id}" aria-pressed="${selectedPetId === pet.id}"><img src="${pet.previewPath}" alt=""/><strong>${pet.name}</strong><span>Lv. ${pet.level}</span></button><small>장착하지 않아도 돌볼 수 있어요.</small></aside>`;
    if (activeTab < 2) {
      panel.innerHTML = `<div class="shop-coming">${activeTab === 0 ? '<div class="shop-egg" aria-hidden="true">?</div>' : preview}<h3>${tabs[activeTab]}</h3><p>새로운 만남을 준비하고 있어요.</p><button disabled>${activeTab === 0 ? '펫 뽑기 준비 중' : '스킨 적용 준비 중'}</button></div>`;
    } else if (activeTab === 2) {
      panel.innerHTML = `<div class="shop-intro"><h3>작은 선물, 더 가까운 사이</h3><p>사료와 장난감으로 펫을 돌봐주세요.</p></div><div class="shop-items">${shopItems.map(item => `<article class="shop-item"><div class="shop-item-art"><img src="${item.previewPath}" alt="${item.name} 모양"/></div><h3>${item.name}</h3><p>${item.description}</p><span>보유 ${user.items[item.id]}개</span><strong aria-label="${item.price} 셀"><span class="cell-icon" aria-hidden="true">⬡</span> ${item.price.toLocaleString()}</strong><button id="buy-${item.id}" data-buy="${item.id}">1개 구매</button></article>`).join('')}</div>`;
    } else {
      panel.innerHTML = `<div class="shop-care">${selector}<section class="shop-care-detail">${preview}${progress}${activeTab === 3 ? `<p>다음 레벨 성장 비용 <strong aria-label="${state.growthCost} 셀"><span class="cell-icon" aria-hidden="true">⬡</span> ${state.growthCost.toLocaleString()}</strong></p><button id="grow-pet" data-grow ${state.canGrow ? '' : 'disabled'}>한 단계 성장</button><small>${state.pet.experience < state.requiredExperience ? '경험치가 가득 차야 성장할 수 있어요.' : state.user.cells < state.growthCost ? '성장에 필요한 셀이 부족해요.' : '성장하면 경험치가 0으로 초기화돼요.'}</small><small>밥주기·놀아주기로는 경험치가 증가하지 않아요. 경험치 획득 기능은 준비 중이에요.</small>` : `<dl class="shop-stats"><div><dt>배고픔</dt><dd>${pet.hunger}/100</dd></div><div><dt>호감도</dt><dd>${pet.affection}/100</dd></div></dl><small>배고픔 수치가 높을수록 배가 부른 상태예요.</small><div class="shop-actions">${shopItems.map(item => `<button id="use-${item.id}" data-use="${item.id}" ${!user.items[item.id] || (item.type === 'food' ? pet.hunger : pet.affection) >= 100 ? 'disabled' : ''}>${item.type === 'food' ? '밥주기' : '놀아주기'}<small>${item.name} ${user.items[item.id]}개 · 1개 소모</small></button>`).join('')}</div><small>수치가 가득 차면 아이템을 소모하지 않아요.</small>`}</section></div>`;
    }
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
    else if (button.dataset.buy) message = state.buy(button.dataset.buy);
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
  return () => { selectTab(2); dialog.showModal(); };
}
