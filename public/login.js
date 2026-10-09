const TOKEN_KEY = 'client_token';
const NOME_KEY = 'client_nome';
(function checkExistingSession(){
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  fetch('/api/client/me', { headers: { 'x-client-token': token } })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      if (data.ok && !data.mustChangePassword) {
        window.location.replace('/rodadas.html');
      }
    })
    .catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NOME_KEY);
    });
})();

let pendingToken = null;
let pendingUsername = null;

function showChangePassword(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('changePwScreen').style.display = 'block';
}

async function tryLogin(){
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const errorBox = document.getElementById('loginError');
  errorBox.textContent = '';

  if (!username || !password) {
    errorBox.textContent = 'Preencha usuário e senha.';
    return;
  }

  try{
    const resp = await fetch('/api/client/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Usuário ou senha inválidos.';
      return;
    }

    if (data.mustChangePassword) {
      pendingToken = data.token;
      pendingUsername = username;
      showChangePassword();
      return;
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(NOME_KEY, data.nome || username);
    window.location.replace('/rodadas.html');
  }catch(e){
    errorBox.textContent = 'Erro de conexão. Tente novamente.';
  }
}

async function trySetNewPassword(){
  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;
  const errorBox = document.getElementById('changePwError');
  errorBox.textContent = '';

  if (newPassword.length < 6) {
    errorBox.textContent = 'A senha deve ter pelo menos 6 caracteres.';
    return;
  }
  if (newPassword !== confirmPassword) {
    errorBox.textContent = 'As senhas não coincidem.';
    return;
  }

  try{
    const resp = await fetch('/api/client/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-token': pendingToken },
      body: JSON.stringify({ newPassword })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      errorBox.textContent = data.error || 'Não foi possível salvar a nova senha.';
      return;
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(NOME_KEY, pendingUsername || '');
    window.location.replace('/formulario');
  }catch(e){
    errorBox.textContent = 'Erro de conexão. Tente novamente.';
  }
}

document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
document.getElementById('changePwBtn').addEventListener('click', trySetNewPassword);
document.getElementById('confirmPasswordInput').addEventListener('keydown', e => { if (e.key === 'Enter') trySetNewPassword(); });
