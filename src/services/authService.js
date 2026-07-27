// ── Serviço de Autenticação ─────────────────────────────────────────────────
// Encapsula todas as operações de login/cadastro do Firebase Authentication.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, authSecundaria } from "../firebase";

// Traduz mensagens de erro comuns do Firebase Auth para português
function traduzErro(codigo) {
  const mapa = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado. Se você excluiu um profissional recentemente com esse e-mail, ele continua reservado no sistema de login — remova-o em Firebase Console → Authentication → Users para liberá-lo, ou use outro e-mail.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
    "auth/user-not-found": "E-mail não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/user-disabled": "Esta conta foi desativada.",
  };
  return mapa[codigo] || "Erro ao processar. Tente novamente.";
}

// Cria uma nova conta (usado pelo admin ao cadastrar um novo profissional).
// IMPORTANTE: usa a instância SECUNDÁRIA do Firebase Auth (authSecundaria),
// não a principal (auth). Isso evita que a sessão do Admin que está criando
// a conta seja substituída pela sessão da conta recém-criada — o Firebase
// automaticamente loga com a conta nova assim que ela é criada, então sem
// esse isolamento o Admin seria "deslogado" sem perceber a cada cadastro.
export async function criarConta(email, senha) {
  try {
    const cred = await createUserWithEmailAndPassword(authSecundaria, email, senha);
    const resultado = { uid: cred.user.uid, email: cred.user.email };
    // Encerra a sessão na instância secundária imediatamente — ela só
    // existia para criar a conta, não deve continuar logada em lugar nenhum.
    await signOut(authSecundaria);
    return resultado;
  } catch (e) {
    throw new Error(traduzErro(e.code));
  }
}

// Login normal
export async function fazerLogin(email, senha) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, senha);
    return { uid: cred.user.uid, email: cred.user.email };
  } catch (e) {
    throw new Error(traduzErro(e.code));
  }
}

// Logout
export async function fazerLogout() {
  await signOut(auth);
}

// Observa mudanças no estado de login (usado para manter sessão entre reloads)
export function observarUsuario(callback) {
  return onAuthStateChanged(auth, (user) => {
    callback(user ? { uid: user.uid, email: user.email } : null);
  });
}
