// ── Configuração do Firebase ──────────────────────────────────────────────
// Substitua os valores abaixo pelas suas chaves reais do Firebase Console
// (Configurações do projeto → Geral → Seus apps → SDK do Firebase)

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
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
// profissional. Para evitar isso, criamos a conta numa instância separada
// do Firebase, que não interfere na sessão principal do usuário logado.
const appSecundaria = initializeApp(firebaseConfig, "app-criacao-contas");
export const authSecundaria = getAuth(appSecundaria);

