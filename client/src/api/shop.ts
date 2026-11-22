// 🟩 상점 API 호출 (서버: server/src/routes/shop.js, inventory.js)  담당: 창규
import type { ApiResponse, Item, UserItem, Inventory, User } from '../../../shared/types';

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const tokenKey = 'doroom.auth-token'; // 로그인할 때 auth.ts가 토큰을 저장하는 이름과 같아야 함

// 토큰을 붙여서 서버에 요청하고, {ok:false}면 에러로 바꿔주는 공통 함수
async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  try { token = sessionStorage.getItem(tokenKey); } catch { /* 저장소를 못 쓰는 환경 */ }
  const response = await fetch(baseUrl + path, {
    signal: AbortSignal.timeout(5000),
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result: ApiResponse<T> = await response.json();
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

export const getShopItems = () => authRequest<Item[]>('/shop/items');
export const getInventory = () => authRequest<Inventory>('/inventory');
export const getMe = () => authRequest<User>('/me');
export const buyItem = (itemId: number, quantity = 1) =>
  authRequest<{ balance: number; item: UserItem }>('/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemId, quantity }),
  });