import { createPetState, pet } from './pets.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
let saved: string | null = null;
const storage = () => ({
  getItem: () => saved,
  setItem: (_key: string, value: string) => { saved = value; },
  removeItem: () => { saved = null; },
});
const state = createPetState(storage);
assert(!state.equipped, 'Initially unequipped');
state.setEquipped(true);
assert(state.equipped && saved === pet.id, 'Equipment saved');
assert(createPetState(storage).equipped, 'Equipment restored');
state.setEquipped(false);
assert(!state.equipped && saved === null, 'Unequip removes storage');
saved = 'unknown-pet';
assert(!createPetState(storage).equipped, 'Unknown ID rejected');
const blocked = createPetState(() => { throw new Error('Storage blocked'); });
assert(!blocked.equipped && !blocked.persistent, 'Blocked storage handled on read');
blocked.setEquipped(true);
assert(blocked.equipped && !blocked.persistent, 'In-memory equip survives write failure');
blocked.setEquipped(false);
assert(!blocked.equipped, 'In-memory unequip survives remove failure');
assert(pet.affection === 100 && pet.hunger === 100 && pet.ability.id === 'shield', 'Initial pet stats');
console.log('Pet state: 9 checks passed');
