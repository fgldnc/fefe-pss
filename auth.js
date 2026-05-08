/**
 * auth.js — Firebase Authentication (Google)
 */

/** Inicializa estado de autenticação e chama callback quando muda */
export async function initAuth(onAuthChange) {
  // Aguarda o Firebase ficar disponível
  await waitForFirebase();

  const { auth, onAuthStateChanged } = window._FB;
  onAuthStateChanged(auth, onAuthChange);

  // Botão de login com Google
  document.getElementById('btn-google-login').addEventListener('click', async () => {
    try {
      const { auth, GoogleAuthProvider, signInWithPopup } = window._FB;
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Erro no login:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        alert('Erro ao fazer login. Verifique o console para detalhes.');
      }
    }
  });
}

/** Retorna o UID do usuário logado */
export function getUid() {
  return window._FB?.auth?.currentUser?.uid || null;
}

/** Aguarda window._FB estar disponível (Firebase carrega via module) */
function waitForFirebase(timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (window._FB) { resolve(); return; }
    const start = Date.now();
    const check = setInterval(() => {
      if (window._FB) { clearInterval(check); resolve(); }
      else if (Date.now() - start > timeout) {
        clearInterval(check);
        reject(new Error('Firebase não inicializou a tempo. Verifique a configuração em index.html.'));
      }
    }, 50);
  });
}
