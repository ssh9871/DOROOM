# DOROOM DB

DOROOM 프로젝트(펫 × 슈팅 미니게임)의 데이터베이스입니다.
PostgreSQL 16 기준이며, Docker로 DB와 pgAdmin을 한 번에 띄울 수 있습니다.

## 폴더 구성

| 파일 | 설명 |
| --- | --- |
| `docker-compose.yml` | PostgreSQL 16 + pgAdmin 실행 설정 |
| `schema.sql` | 전체 테이블 생성 코드 (MVP 20개 + 확장 8개) |
| `test_flows.sql` | 샘플 데이터 + 핵심 흐름 예시 (가챠, 돌봄, 게임 종료·보상, 진화, 주간 랭킹) |
| `erd/` | ERD 이미지(PNG)와 수정 가능한 Mermaid 코드(.mmd) |

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
- 이메일 `admin@doroom.com` / 비밀번호 `admin`
- 서버 등록(Register → Server)
  - Name: `doroom`
  - Connection → Host: `db`, Username: `doroom`, Password: `doroom`

### 4. 테이블 생성
`doroom` 데이터베이스 우클릭 → 쿼리 도구(Query Tool) → `schema.sql` 내용 실행 (F5)

### 5. 샘플 데이터 (선택)
같은 쿼리 도구에서 `test_flows.sql` 내용 실행 (F5, **한 번만**)

### 6. 종료
```
docker compose down
```

## 처음부터 다시 만들기
테이블을 지우고 다시 만들 때 쿼리 도구에서 실행 후 4번부터 다시:
```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

## 백엔드에서 연결할 때
| 항목 | 값 |
| --- | --- |
| Host | `localhost` (Docker 안의 다른 컨테이너에서는 `db`) |
| Port | `5432` |
| Database | `doroom` |
| User / Password | `doroom` / `doroom` |

```
postgresql://doroom:doroom@localhost:5432/doroom
```

> 위 계정·비밀번호는 로컬 개발용입니다. 실제 배포에는 사용하지 마세요.

## 참고
- 설계 설명(엔티티·관계·명세·가정)은 노션의 DB 설계 문서를 참고하세요.
- 펫 호감도는 프론트와 같은 이름(`affection`)을 씁니다.
- 아직 확정되지 않은 부분(펫 능력 방식, 성장 방식 등)은 가정으로 설계되어 있어 바뀔 수 있습니다.
- 문의: 양창규, 염유민
