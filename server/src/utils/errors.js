// 명세서 0-3 에러 코드. throw new AppError('NOT_ENOUGH_CELL') 처럼 사용.
const CATALOG = {
  UNAUTHORIZED:     [401, '로그인이 필요합니다'],
  NOT_FOUND:        [404, '대상을 찾을 수 없습니다'],
  NOT_ENOUGH_CELL:  [400, '셀이 부족합니다'],
  NOT_ENOUGH_ITEM:  [400, '아이템·장비 수량이 부족합니다'],
  PET_TOO_HUNGRY:   [400, '펫이 너무 배고파서 출전할 수 없습니다'],
  SLOT_LOCKED:      [400, '아직 열리지 않은 장비 슬롯입니다'],
  LEVEL_NOT_ENOUGH: [400, '진화에 필요한 레벨이 부족합니다'],
  DAILY_LIMIT:      [400, '오늘 뽑기 횟수를 모두 사용했습니다'],
  ALREADY_FINISHED: [409, '이미 종료된 판입니다'],
  ALREADY_CLAIMED:  [409, '이미 받은 우편입니다'],
  VALIDATION:       [400, '요청 값이 올바르지 않습니다'],
  NOT_IMPLEMENTED:  [501, '아직 구현되지 않았습니다'],
};

export class AppError extends Error {
  constructor(code, message) {
    const [status, defaultMsg] = CATALOG[code] ?? [500, '서버 오류'];
    super(message ?? defaultMsg);
    this.code = code;
    this.status = status;
  }
}
