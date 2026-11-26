// 🟩 펫 창(P) API  담당: 창규
import type { Pet } from '../../../shared/types';
import { authRequest } from './shop';

export const getMyPets = () => authRequest<Pet[]>('/pets');
// 대표 펫(마이룸에서 따라다니는 펫) 장착·해제
export const setRepresentativePet = (userPetId: number, isRepresentative: boolean) =>
  authRequest<Pet>(`/pets/${userPetId}`, { method: 'PATCH', body: JSON.stringify({ isRepresentative }) });
