// 🟩 펫 창(P) API  담당: 창규
import type { Pet, PetDetail, PetGear } from '../../../shared/types';
import { authRequest } from './shop';

export const getMyPets = () => authRequest<Pet[]>('/pets');
// 대표 펫(마이룸에서 따라다니는 펫) 장착·해제
export const setRepresentativePet = (userPetId: number, isRepresentative: boolean) =>
  authRequest<Pet>(`/pets/${userPetId}`, { method: 'PATCH', body: JSON.stringify({ isRepresentative }) });
// 펫 상세 (칸 3개 + 전투 능력치) · 장비 장착(교체 포함) · 해제
export const getPetDetail = (userPetId: number) => authRequest<PetDetail>(`/pets/${userPetId}`);
export const equipToPet = (userPetId: number, slotNo: number, equipmentId: number) =>
  authRequest<PetDetail>(`/pets/${userPetId}/equipments/${slotNo}`, { method: 'PUT', body: JSON.stringify({ equipmentId }) });
export const unequipFromPet = (userPetId: number, slotNo: number) =>
  authRequest<PetDetail>(`/pets/${userPetId}/equipments/${slotNo}`, { method: 'DELETE' });
// 내 펫 전부의 장비 칸 (누가 어떤 장비를 끼고 있는지)
export const getPetGear = () => authRequest<PetGear[]>('/pets/equipments');
