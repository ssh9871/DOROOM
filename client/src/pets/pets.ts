import data from './pets.json' with { type: 'json' };
import catalog from './shop-items.json' with { type: 'json' };
import users from '../users/users.json' with { type: 'json' };

export const pet = data.pets[0]!;
export type Pet = typeof pet;
export const shopItems = catalog.items;
export const growth = data.growth;
const defaultUser = users.users[0]!;
export type User = Omit<typeof defaultUser, 'items'> & { items: Record<string, number> };
const storageKey = 'doroom.pet-progress';
const legacyKey = 'doroom.equipped-pet';
const maxLevel = Math.floor(Number.MAX_SAFE_INTEGER / Math.max(growth.experiencePerLevel, growth.cellCostPerLevel));
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;

export function createPetState(storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => localStorage) {
  const user: User = { ...defaultUser, items: { ...defaultUser.items } };
  const currentPet = { ...pet };
  let equippedId: string | null = null;
  let persistent = true;
  let recovered = false;
  const restoreNumber = (value: unknown, fallback: number, max?: number) => {
    if (value === undefined) return fallback;
    if (integer(value, max)) return value;
    recovered = true;
    return fallback;
  };
  const save = () => {
    // shortcut: browser-local demo data; use server transactions when accounts or real currency are added.
    try {
      storage().setItem(storageKey, JSON.stringify({
        version: 2, user, equippedId,
        pets: { [pet.id]: { level: currentPet.level, experience: currentPet.experience, hunger: currentPet.hunger, affection: currentPet.affection } },
      }));
      persistent = true;
    } catch { persistent = false; }
  };
  try {
    const raw = storage().getItem(storageKey);
    if (raw !== null) {
      try {
        const snapshot = record(JSON.parse(raw));
        if (snapshot.version !== 1 && snapshot.version !== 2) throw new Error('Unsupported save');
        const savedUser = record(snapshot.user);
        if (savedUser.id !== user.id) throw new Error('Unknown user');
        if (typeof savedUser.nickname === 'string' && savedUser.nickname.trim().length > 0 && savedUser.nickname.length <= 40) user.nickname = savedUser.nickname;
        else if (savedUser.nickname !== undefined) recovered = true;
        user.cells = restoreNumber(savedUser.cells, user.cells);
        const items = record(savedUser.items);
        for (const item of shopItems) user.items[item.id] = restoreNumber(items[item.id], user.items[item.id]!);
        if (Object.keys(items).some(id => !shopItems.some(item => item.id === id))) recovered = true;
        const savedPets = record(snapshot.pets);
        if (Object.keys(savedPets).some(id => id !== pet.id)) recovered = true;
        const progress = record(savedPets[pet.id]);
        currentPet.level = restoreNumber(progress.level, pet.level, maxLevel);
        if (currentPet.level < 1) { currentPet.level = pet.level; recovered = true; }
        currentPet.experience = restoreNumber(progress.experience, pet.experience, currentPet.level * growth.experiencePerLevel);
        currentPet.hunger = restoreNumber(progress.hunger, pet.hunger, 100);
        currentPet.affection = restoreNumber(progress.affection, pet.affection, 100);
        equippedId = snapshot.equippedId === pet.id ? pet.id : null;
        if (snapshot.equippedId !== undefined && snapshot.equippedId !== null && equippedId === null) recovered = true;
        if (snapshot.version === 1) {
          // Apply the requested manual-test baseline once without resetting purchases or equipment.
          currentPet.experience = pet.experience;
          currentPet.hunger = pet.hunger;
          currentPet.affection = pet.affection;
          save();
        }
      } catch { recovered = true; }
    } else {
      const legacy = storage().getItem(legacyKey);
      equippedId = legacy === pet.id ? pet.id : null;
      if (legacy !== null) save();
    }
  } catch { persistent = false; }
  return {
    get pet() { return { ...currentPet }; },
    get user(): User { return { ...user, items: { ...user.items } }; },
    get equipped() { return equippedId === pet.id; },
    get persistent() { return persistent; },
    get recovered() { return recovered; },
    get requiredExperience() { return currentPet.level * growth.experiencePerLevel; },
    get growthCost() { return currentPet.level * growth.cellCostPerLevel; },
    get canGrow() { return currentPet.level < maxLevel && currentPet.experience >= this.requiredExperience && user.cells >= this.growthCost; },
    setEquipped(equipped: boolean) { equippedId = equipped ? pet.id : null; save(); },
    buy(itemId: string) {
      const item = shopItems.find(item => item.id === itemId);
      if (!item || !integer(item.price) || item.price === 0) return '구매할 수 없는 아이템이에요.';
      if (user.cells < item.price) return '셀이 부족해요.';
      if (!integer(user.items[item.id]! + 1)) return '더 이상 보관할 수 없어요.';
      user.cells -= item.price;
      user.items[item.id]!++;
      save();
      return `${item.name} 1개를 구매했어요.`;
    },
    interact(petId: string, itemId: string) {
      const item = shopItems.find(item => item.id === itemId);
      if (petId !== pet.id || !item) return '펫과 아이템을 다시 선택해주세요.';
      const stat = item.type === 'food' ? 'hunger' : 'affection';
      const gain = item.type === 'food' ? item.hungerGain : item.affectionGain;
      if (!integer(gain) || gain === 0) return '사용할 수 없는 아이템이에요.';
      if (!user.items[item.id]) return `${item.name}이 부족해요. 상점에서 구매해주세요.`;
      if (currentPet[stat] >= 100) return `${stat === 'hunger' ? '배고픔' : '호감도'} 수치가 이미 가득 찼어요.`;
      user.items[item.id]!--;
      currentPet[stat] = Math.min(100, currentPet[stat] + gain);
      save();
      return item.type === 'food' ? '밥을 주었어요. 배고픔 수치가 올랐어요.' : '함께 공놀이를 했어요. 호감도가 올랐어요.';
    },
    grow(petId: string) {
      if (petId !== pet.id) return '펫을 다시 선택해주세요.';
      if (currentPet.level >= maxLevel) return '더 이상 성장할 수 없어요.';
      if (currentPet.experience < this.requiredExperience) return '경험치가 부족해요.';
      if (user.cells < this.growthCost) return '셀이 부족해요.';
      user.cells -= this.growthCost;
      currentPet.level++;
      currentPet.experience = 0;
      save();
      return `레벨 ${currentPet.level}(으)로 성장했어요!`;
    },
  };
}
export type PetState = ReturnType<typeof createPetState>;
