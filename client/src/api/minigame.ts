import type {
  CombatStats, GameFinishRequest, GameResult, GameRun, GameStart, GameStartRequest, Item, Pet, PetDetail, Ranking,
  StageList, StatUpgrade, StatUpgradeBuyResult,
} from '../../../shared/types';
import { authenticatedRequest, type AccountUser } from './auth';

export function minigameApi() {
  const request = authenticatedRequest();
  const post = <T>(path: string, body?: object) => request<T>(path, {
    method: 'POST',
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return {
    account: () => request<AccountUser>('/me'),
    stages: () => request<StageList>('/stages'),
    entryBuffs: () => request<Item[]>('/shop/items?shop=minigame'),
    pets: () => request<Pet[]>('/pets'),
    petDetail: (id: number) => request<PetDetail>(`/pets/${id}`),
    petCombatStats: (id: number) => request<CombatStats>(`/pets/${id}/combat-stats`),
    upgrades: () => request<StatUpgrade[]>('/stat-upgrades'),
    buy: (code: string) => post<StatUpgradeBuyResult>(`/stat-upgrades/${code}`),
    start: (body: GameStartRequest) => post<GameStart>('/game/start', body),
    finish: (id: number, body: GameFinishRequest) => post<GameResult>(`/game/${id}/finish`, body),
    abort: (id: number) => post<{ runId: number }>(`/game/${id}/abort`),
    history: () => request<GameRun[]>('/game/history?limit=100'),
    ranking: () => request<Ranking>('/ranking'),
  };
}
