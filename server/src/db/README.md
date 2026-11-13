# DOROOM DB

PostgreSQL 16 기준. Docker로 DB와 pgAdmin을 한 번에 띄웁니다 (실행 방법은 아래).

## 현재 버전: v2 (11/13)

| 파일 | 설명 |
| --- | --- |
| `schema_v2.sql` | **현재 스키마.** 26개 테이블 + 주간 랭킹 뷰. 빈 DB에 이것부터 실행 |
| `seed_and_test_v2.sql` | 초기 데이터([가정] 값) + 핵심 흐름 검증 (뽑기·장착·강화·게임·보상·전승·랭킹·우편). schema 다음에 실행 |
| `erd/ERD_v2_1_발표용_전체관계도.png` | 테이블·관계만 (발표용) |
| `erd/ERD_v2_2_상세.png` | 컬럼·타입·키까지 (개발용) |
| `erd/make_erd_v2.py` | 실행 중인 DB에서 ERD PNG를 다시 뽑는 스크립트 (Graphviz 필요) |
| `docker-compose.yml` | PostgreSQL 16 + pgAdmin |

설계 설명·바뀐 이유·아직 정할 것: `docs/db/DB_v2_변경사항_및_확정필요목록.md`
API 명세: `docs/db/API_명세서_v1.md`

### 이전 버전 (v1, 중간발표 기준 — 참고용)
`schema.sql`, `test_flows.sql`, `erd/ERD_1_*.png`, `erd/ERD_2_*.png`, `erd/*.mmd` — 더 이상 사용하지 않음.

## 스키마 변경 규칙
- `schema_v2.sql`을 직접 고치지 않습니다. `migrations/00N_설명.sql`을 추가하고 PR을 올립니다.
- `app_user`, `user_pet`, `cell_transaction`, `game_run`은 두 팀이 같이 쓰는 테이블 → 변경 전 양 팀 합의.
- `cell_transaction.reason`에 새 값을 쓰려면 CHECK 제약을 먼저 수정해야 합니다.

## 실행 방법

### 1. 준비 (처음 한 번만)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 (Windows는 AMD64)
- Windows에서 WSL이 없다고 나오면: PowerShell을 **관리자 권한**으로 열고 `wsl --install` → 재부팅
- Docker Desktop을 실행해서 왼쪽 아래 **Engine running** 확인

### 2. DB 실행
이 `db` 폴더에서 터미널(cmd)을 열고:
```
docker compose up -d
```
> Windows: 폴더 주소창에 `cmd` 입력 후 엔터하면 그 위치로 터미널이 열립니다.

### 3. pgAdmin 접속
- 브라우저에서 `http://localhost:5050`
- 로그인: `admin@doroom.com` / `admin`
- 서버 등록: Host `db`, Port `5432`, DB `doroom`, User `doroom`, Password `doroom`

### 4. 스키마·초기 데이터 넣기
pgAdmin → Query Tool에서 `schema_v2.sql` 전체 실행 → `seed_and_test_v2.sql` 전체 실행.
마지막에 `NOTICE: OK: 중복 보상 차단`이 보이고 잔액 = 내역 합계면 정상.

### 5. 끄기 / 다시 켜기
```
docker compose down      # 끄기 (데이터 유지)
docker compose up -d     # 다시 켜기
```
