import { pet, type User } from '../pets/pets';

const escapeText = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

const icons: Record<string, string> = {
  paw: '<ellipse cx="12" cy="16" rx="6" ry="5" fill="currentColor" stroke="none"/><ellipse cx="4" cy="9" rx="2.2" ry="3" fill="currentColor" stroke="none"/><ellipse cx="9" cy="5" rx="2.2" ry="3" fill="currentColor" stroke="none"/><ellipse cx="15" cy="5" rx="2.2" ry="3" fill="currentColor" stroke="none"/><ellipse cx="20" cy="9" rx="2.2" ry="3" fill="currentColor" stroke="none"/>',
  bag: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
  book: '<path d="M6 3h14v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-3 15a3 3 0 0 1 3-3h14M8 7h7M8 11h5"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0Zm5 11v6m-4 1h8M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 9h.01M16 9h.01M8 14a4 4 0 0 0 8 0"/>',
  picture: '<rect x="4" y="3" width="16" height="18"/><path d="m7 16 3-5 3 4 2-3 3 4"/>',
  preset: '<rect x="3" y="5" width="18" height="14"/><path d="M7 9h10M7 13h6"/>',
  external: '<path d="M13 3h8v8m0-8L10 14M9 5H3v16h16v-6"/>',
  home: '<path d="m3 10 9-7 9 7v10H6V10m3 10v-7h6v7"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 11h18"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  exit: '<path d="M9 4H4v16h5m5-13 5 5-5 5M8 12h12"/>',
  chat: '<path d="M4 4h16v12H9l-5 4Z"/>',
  settings: '<path d="m9 3 1-1h4l1 4 4 1 2 4-3 3v4l-4 3-3-2-4 1-3-4 1-4-2-3 3-4Z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 2v1"/>',
  people: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M2 20v-3a6 6 0 0 1 12 0v3m2-6a4 4 0 0 1 6 4v2"/>',
};

const icon = (name: string) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;

function header(page: 'home' | 'minigames', user: User) {
  return `<header class="site-header"><div class="header-top wrap">
    <div class="brand"><span class="brand-mark" aria-hidden="true">D<span></span></span>DOROBUS</div>
    <div class="profile-bar"><span class="wallet" aria-label="보유 ${user.cells.toLocaleString()} 셀"><span aria-hidden="true">⬡</span> ${user.cells.toLocaleString()}</span><span class="level">Lv. 1</span><span class="mail">${icon('mail')}</span><div class="profile"><span class="profile-avatar">✦</span><span>${escapeText(user.nickname)}</span><span class="chevron">⌄</span></div></div>
  </div><nav class="navigation wrap" aria-label="주 메뉴">
    ${page === 'home' ? '<span class="nav-item active" aria-current="page">대시보드</span>' : '<a class="nav-item" href="#home">대시보드</a>'}
    <span class="nav-item">내 수업</span><span class="nav-item">공작소</span><span class="nav-item">실제 계정 전환</span>
    <a class="nav-item ${page === 'minigames' ? 'active' : ''}" href="#minigames" ${page === 'minigames' ? 'aria-current="page"' : ''}>미니게임</a>
  </nav></header>`;
}

export function homeScreen(user: User) {
  return `${header('home', user)}<main class="dashboard wrap">
    <section class="dashboard-top">
      <article class="welcome-card"><div class="welcome-copy"><div class="online"><i></i> 접속 중</div><p class="hello">안녕하세요,</p><h1>${escapeText(user.nickname)}님 <span class="wave">👋</span></h1><p class="welcome-sub">오늘의 수업과 미션이 준비되어 있어요.</p></div>
        <div class="welcome-art" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><span class="spark spark-one">✦</span><span class="spark spark-two">✧</span><img class="hero-pet" src="/assets/previews/pet.png" alt=""/><img class="hero-avatar" src="/assets/previews/avatar.png" alt=""/></div>
        <div class="welcome-stats"><div><strong>0<small>개</small></strong><span>수강 중인 수업</span></div><div><strong>0<small>개</small></strong><span>제출해야 할 과제</span></div></div>
      </article>
      <article class="learning-card panel"><h2>이번 주 학습 현황</h2><div class="weekly-chart"><div class="chart-axis"><span>1</span><span>0</span></div><div class="chart-baseline"></div><div class="weekdays"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span></div></div><h2>이번 주 진도율</h2><div class="progress-area"><div class="legend"><span><i class="blue"></i>완료</span><span><i></i>진행 중</span><span><i></i>대기 중</span></div><div class="progress-ring"><strong>0<small>%</small></strong></div></div></article>
    </section>
    <section class="feature-grid" aria-label="나의 공간">
      <article class="feature-card panel diagnosis"><div class="island-art" aria-hidden="true"><span>✦</span><i></i><b>◈</b></div><div class="feature-copy"><h2>DIMC 역량 진단</h2><p>AI·디지털·메이킹·컴퓨팅 역량을 측정해보세요</p></div><span class="feature-star" aria-hidden="true">✳</span></article>
      <a class="feature-card panel room-card" href="#room"><div class="room-mini" aria-hidden="true"><i></i><span>⌑</span></div><div class="feature-copy"><span class="eyebrow">MY LITTLE SPACE</span><h2>마이룸</h2><p>내 방을 꾸미고 나만의 기록을 쌓는 공간</p></div><img src="/assets/previews/avatar.png" alt="" class="room-card-avatar"/><span class="feature-arrow">${icon('arrow')}</span></a>
    </section>
    <section class="schedule"><h2>이번 주 예정된 수업 일정</h2><div class="schedule-empty panel">${icon('calendar')}<p>이번 주 예정된 수업이 없습니다</p><span>잠깐의 여유, 마이룸에서 쉬어가세요.</span></div></section>
  </main>`;
}

export function gamesScreen(user: User) {
  return `${header('minigames', user)}<main><section class="games-heading"><div class="wrap"><span class="eyebrow">PLAY & DISCOVER</span><h1>미니게임</h1><p>짧고 재미있는 게임으로 실력을 키워보세요.</p></div></section><section class="games-content wrap">
    <div class="game-toolbar"><div class="categories"><span class="selected">전체</span><span>탄막게임</span></div><div class="search-decoration" aria-hidden="true">게임 검색 ${icon('search')}</div></div>
    <article class="game-card"><div class="bullet-thumbnail" aria-label="우주선과 탄환을 그린 탄막게임 일러스트"><span class="new-badge">NEW</span><span class="planet"></span><span class="space-orbit"></span><span class="bullet-field"></span><svg class="spaceship" viewBox="0 0 100 130" aria-hidden="true"><defs><linearGradient id="ship" x2="0" y2="1"><stop stop-color="#e1f5ff"/><stop offset="1" stop-color="#62b9ff"/></linearGradient></defs><path d="m50 10 16 51 25 28-33-9-8 18-8-18-33 9 25-28Z" fill="url(#ship)"/><path d="m50 31 7 27H43Z" fill="#226de5"/><path d="m42 89 8 35 8-35" fill="#9fffee"/></svg><div class="thumbnail-caption">BULLET<br/><strong>UNIVERSE</strong></div></div>
    <div class="game-record"><span>기록 없음</span><span aria-hidden="true">▂▅▇</span></div>
    <div id="minigame-container" style="margin-top: 20px; width: 100%; display: flex; justify-content: center;"></div>
    <div class="game-actions">
      <button class="play-button" id="start-minigame-btn" type="button">플레이하기</button>
      <button class="leaderboard-button" id="leaderboard-btn" type="button" aria-haspopup="dialog" aria-controls="leaderboard-modal">🏆 내 기록 보기</button>
    </div>
    <div class="leaderboard-modal" id="leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" aria-hidden="true" hidden>
      <div class="leaderboard-panel" role="document">
        <button class="leaderboard-close" id="leaderboard-close-btn" type="button" aria-label="리더보드 닫기">×</button>
        <span class="eyebrow">MY RECORD</span>
        <h2 id="leaderboard-title">🏆 내 기록 보기</h2>
        <div class="leaderboard-best"><span>내 최고 점수</span><strong id="leaderboard-best-score">기록 없음</strong></div>
        <h3>최근 플레이 기록 Top 5</h3>
        <ol class="leaderboard-list" id="leaderboard-list"></ol>
        <button class="leaderboard-confirm" id="leaderboard-confirm-btn" type="button">닫기</button>
      </div>
    </div>
    </article>
    </section></main>`;
}

export function roomScreen(petRoom: boolean, user: User) {
  const title = petRoom ? '펫 마이룸' : '마이룸';
  const menuItems = [['bag', '인벤토리', 'I'], ['book', '칭호북', 'T'], ['trophy', '랭킹', 'R'], ['smile', '감정표현', 'V'], ['paw', '펫', 'P'], ['picture', '창작물', 'C'], ['preset', '프리셋', '']];
  return `<main class="room-shell"><aside class="room-sidebar" aria-label="마이룸 메뉴"><span class="room-emblem" aria-hidden="true">✦</span><span class="static-side">${icon('home')}</span><button class="menu-toggle" id="room-menu-toggle" aria-label="메뉴" aria-expanded="false" aria-controls="room-menu" title="메뉴">${icon('grid')}</button><div class="side-bottom"><span class="static-side">${icon('chat')}</span><span class="static-side">${icon('help')}</span><span class="static-side">${icon('settings')}</span><span class="static-side">${icon('external')}</span><button class="exit-button" id="exit-room" aria-label="${title} 나가기" title="나가기">${icon('exit')}</button></div></aside>
    <aside class="room-menu" id="room-menu" aria-labelledby="room-menu-title" hidden><h2 id="room-menu-title">메뉴</h2><nav aria-label="방 기능">${menuItems.map(([symbol, label, key]) => `<button ${symbol === 'paw' ? 'id="open-pets"' : 'disabled'}>${icon(symbol!)}<span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('')}</nav></aside>
    <section class="room-stage" aria-label="3D ${title}"><canvas id="room-canvas" tabindex="0" aria-label="${title}: WASD 이동, Space 점프, P 펫, 포털 또는 상점 근처 E 상호작용"></canvas><span class="room-name-tag" id="room-name-tag" hidden>${escapeText(user.nickname)}</span><div class="room-top-label"><i></i> ${petRoom ? 'PET ROOM' : 'MY ROOM'} <span>${petRoom ? '펫과 함께하는 작은 공간' : '나만의 작은 공간'}</span></div><span class="room-people">${icon('people')} 1</span><div class="room-loading" role="status">${title}을 준비하고 있어요<span>잠시만 기다려주세요.</span></div><div class="portal-hint" id="portal-hint" hidden><kbd>E</kbd><span>${petRoom ? '마이룸' : '펫 마이룸'}으로 이동</span></div><div class="portal-hint" id="shop-hint" hidden><kbd>E</kbd><span>펫 상점 열기</span></div><p class="pet-scene-status" id="pet-scene-status" role="status" hidden></p><div class="room-controls"><span><kbd>W</kbd><span class="wasd"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>이동</span><span class="control-divider"></span><kbd class="space-key">SPACE</kbd><span>점프</span><kbd>P</kbd><span>펫</span><small>화면을 클릭하면 조작할 수 있어요</small></div><div class="chat-decoration" aria-hidden="true"><span>채팅을 입력해 주세요</span><span>➤</span></div></section>
    <dialog class="pet-dialog" id="pet-dialog" aria-labelledby="pet-title"><header class="pet-dialog-header"><h2 id="pet-title">${icon('paw')} 펫</h2><button id="close-pets" aria-label="펫 창 닫기" autofocus>×</button></header><div class="pet-dialog-body"><div class="pet-list" aria-label="보유 펫"><button class="pet-card" aria-label="${pet.name} 선택" aria-pressed="true"><span class="pet-equipped-badge" id="pet-equipped-badge" hidden>장착중</span><img src="${pet.previewPath}" alt=""/><strong>${pet.name}</strong></button></div><section class="pet-detail" aria-labelledby="pet-name"><div class="pet-preview"><img src="${pet.previewPath}" alt="${pet.name} 미리보기"/></div><h3 id="pet-name">${pet.name}</h3><p class="pet-description">${pet.description}</p><dl class="pet-stats"><div><dt>호감도</dt><dd id="pet-affection">${pet.affection}/100</dd></div><div><dt>배고픔</dt><dd id="pet-hunger">${pet.hunger}/100</dd></div><div><dt>능력</dt><dd>${pet.ability.name}</dd></div></dl><p id="pet-progress"></p><button class="pet-equip-button" id="toggle-pet">장착</button><p class="pet-save-notice" id="pet-save-notice" role="status" hidden>이 브라우저에 저장할 수 없어 새로고침하면 펫과 사용자 상태가 초기화될 수 있어요.</p><p class="pet-model-notice" id="pet-model-notice" role="status" hidden></p></section></div></dialog>
    <dialog class="pet-dialog pet-shop-dialog" id="shop-dialog" aria-labelledby="shop-title"><header class="pet-dialog-header"><h2 id="shop-title">펫 케어 상점</h2><span id="shop-wallet"></span><button id="close-shop" aria-label="펫 상점 닫기" autofocus>×</button></header><div id="shop-tabs" role="tablist" aria-label="펫 상점 기능"></div><section id="shop-panel" role="tabpanel" tabindex="0"></section><footer class="shop-footer"><p id="shop-result" role="status" aria-live="polite"></p><p id="shop-save-notice" role="status"></p></footer></dialog>
    <dialog class="exit-dialog" id="exit-dialog" aria-labelledby="exit-title" aria-describedby="exit-description"><form method="dialog"><div class="dialog-symbol">${icon('exit')}</div><h2 id="exit-title">${title}에서 나가시겠습니까?</h2><p id="exit-description">메인 화면으로 돌아갑니다.</p><div class="dialog-actions"><button value="cancel" autofocus>아니요</button><button class="confirm-exit" value="yes">네</button></div></form></dialog>
  </main>`;
}
