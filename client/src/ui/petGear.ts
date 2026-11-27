import type { PetDetail } from '../../../shared/types.ts';

// Keep the current API slot numbers: HEAD (1), ACCESSORY (3), BODY (2).
export const petGearSlots = [
  { slotNo: 1, label: '모자' },
  { slotNo: 3, label: '목걸이' },
  { slotNo: 2, label: '신발' },
] as const;

export function petGearLabels(detail: Pick<PetDetail, 'equipSlotCount' | 'equipments'>): string[] {
  return petGearSlots.map(({ slotNo }) => {
    const equipped = detail.equipments.find(slot => slot.slotNo === slotNo)?.equipment;
    return equipped?.name ?? (slotNo > detail.equipSlotCount ? '잠김' : '미장착');
  });
}
