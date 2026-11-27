// 시연용 지정 뽑기: 도감에서 고른 펫·장비가 다음 뽑기 1회의 결과가 된다 (펫·장비 따로 기억).
// 서버는 데모 로그인이 켜진 개발 환경에서만 이 값을 받아들인다.
export type PickKind = 'PET' | 'EQUIPMENT';
type Pick = { id: number; name: string };
const picks: Record<PickKind, Pick | null> = { PET: null, EQUIPMENT: null };

export const setDemoPick = (kind: PickKind, id: number, name: string) => { picks[kind] = { id, name }; };
export const peekDemoPick = (kind: PickKind) => picks[kind];
export const takeDemoPick = (kind: PickKind) => { const value = picks[kind]; picks[kind] = null; return value; };
