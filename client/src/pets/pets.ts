import data from './pets.json' with { type: 'json' };

export const pet = data.pets[0]!;
export type Pet = typeof pet;
const storageKey = 'doroom.equipped-pet';

export function createPetState(storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = () => localStorage) {
  let equippedId: string | null = null;
  let persistent = true;
  try {
    const saved = storage().getItem(storageKey);
    equippedId = saved === pet.id ? saved : null;
  } catch {
    persistent = false;
  }
  return {
    get equipped() { return equippedId === pet.id; },
    get persistent() { return persistent; },
    setEquipped(equipped: boolean) {
      equippedId = equipped ? pet.id : null;
      // shortcut: equipment is browser-local; replace with an API when account persistence is added.
      try {
        if (equippedId) storage().setItem(storageKey, equippedId);
        else storage().removeItem(storageKey);
        persistent = true;
      } catch {
        persistent = false;
      }
    },
  };
}
