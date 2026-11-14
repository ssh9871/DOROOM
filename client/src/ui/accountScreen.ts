import { listDemoAccounts, loginWithDemoAccount, type AccountUser } from '../api/auth';

export async function showAccountScreen(root: HTMLElement, onLogin: (user: AccountUser) => void) {
  root.innerHTML = `<main class="account-page">
    <section class="account-panel panel" aria-labelledby="account-title">
      <div class="brand">DOROBUS</div>
      <h1 id="account-title" tabindex="-1">테스트 계정 선택</h1>
      <p id="account-status" role="status">계정 목록을 불러오는 중이에요.</p>
      <ul id="account-list" aria-label="테스트 계정"></ul>
      <button class="account-button" id="account-retry" type="button" hidden>다시 시도</button>
    </section>
  </main>`;
  root.querySelector<HTMLElement>('#account-title')!.focus();
  const status = root.querySelector<HTMLElement>('#account-status')!;
  const list = root.querySelector<HTMLUListElement>('#account-list')!;
  const retry = root.querySelector<HTMLButtonElement>('#account-retry')!;
  retry.addEventListener('click', () => void showAccountScreen(root, onLogin));

  try {
    const accounts = await listDemoAccounts();
    status.textContent = accounts.length ? '접속할 계정을 선택하세요.' : '등록된 테스트 계정이 없어요.';
    retry.hidden = accounts.length > 0;
    for (const account of accounts) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.className = 'account-button';
      button.type = 'button';
      button.textContent = account.loginId;
      button.addEventListener('click', async () => {
        const buttons = list.querySelectorAll('button');
        buttons.forEach(option => { option.disabled = true; });
        status.textContent = '로그인 중이에요.';
        let user: AccountUser;
        try {
          user = await loginWithDemoAccount(account.loginId);
        } catch {
          status.textContent = '로그인하지 못했어요. 다시 시도해 주세요.';
          buttons.forEach(option => { option.disabled = false; });
          button.focus();
          return;
        }
        onLogin(user);
      });
      item.append(button);
      list.append(item);
    }
  } catch {
    status.textContent = '계정 목록을 불러올 수 없어요. 서버 연결을 확인해 주세요.';
    retry.hidden = false;
  }
}
