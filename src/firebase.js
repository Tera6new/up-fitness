// ── Configuração do Firebase ──────────────────────────────────────────────
// Substitua os valores abaixo pelas suas chaves reais do Firebase Console
// (Configurações do projeto → Geral → Seus apps → SDK do Firebase)

import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBRE5csChwzy3bHq0mmnAPG4jbYZ7v9lmU",
  authDomain: "up-fitness-01.firebaseapp.com",
  projectId: "up-fitness-01",
  storageBucket: "up-fitness-01.firebasestorage.app",
  messagingSenderId: "403897209",
  appId: "1:403897209:web:402336d8a2d594642bcda8",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

// ── App secundária (isolada) para criar novos profissionais ────────────────
// O Firebase Authentication troca automaticamente a sessão ativa para a
// conta recém-criada quando usamos createUserWithEmailAndPassword. Isso faz
// com que o Admin seja "deslogado" sem perceber ao cadastrar um novo
// profissional.
//
// IMPORTANTE: por padrão, getAuth() persiste a sessão no localStorage do
// navegador — que é compartilhado entre instâncias do Firebase no mesmo
// domínio, mesmo com nomes de "app" diferentes. Por isso, criar uma conta
// na instância secundária ainda sobrescrevia a sessão principal. A correção
// é usar initializeAuth com persistência SOMENTE EM MEMÓRIA nessa instância
// secundária — assim ela nunca grava nada no localStorage compartilhado,
// ficando de fato isolada da sessão do Admin.
const appSecundaria = initializeApp(firebaseConfig, "app-criacao-contas");
export const authSecundaria = initializeAuth(appSecundaria, {
  persistence: inMemoryPersistence,
});

