// ── Serviço de Dados (Firestore) ────────────────────────────────────────────
// Substitui todo o uso de localStorage por operações reais no Firestore.
// Estrutura de coleções:
//   profissionais/{uid}          -> dados do profissional (nome, role, etc.)
//   alunos/{alunoId}             -> dados de cada aluno
//   agendas/{profissionalId}     -> agenda de horários de cada profissional
//   pagamentos/{profissionalId}  -> planilhas de pagamento por mês
//   convites/{token}             -> convites de auto-cadastro via link
//   ouvidoria/{alunoId}          -> mensagens de ouvidoria de cada aluno

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Profissionais ────────────────────────────────────────────────────────
export async function salvarProfissional(uid, dados) {
  await setDoc(doc(db, "profissionais", uid), dados, { merge: true });
}

export async function buscarProfissional(uid) {
  const snap = await getDoc(doc(db, "profissionais", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function ouvirProfissionais(callback) {
  return onSnapshot(collection(db, "profissionais"), (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

export async function excluirProfissional(uid) {
  await deleteDoc(doc(db, "profissionais", uid));
}

// ── Alunos ───────────────────────────────────────────────────────────────
export function ouvirAlunos(callback) {
  return onSnapshot(collection(db, "alunos"), (snap) => {
    const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(lista);
  });
}

export async function salvarAluno(alunoId, dados) {
  await setDoc(doc(db, "alunos", String(alunoId)), dados, { merge: true });
}

export async function criarAluno(dados) {
  const id = String(Date.now());
  await setDoc(doc(db, "alunos", id), { ...dados, id });
  return id;
}

export async function excluirAluno(alunoId) {
  await deleteDoc(doc(db, "alunos", String(alunoId)));
}

// ── Agendas ──────────────────────────────────────────────────────────────
export function ouvirAgenda(profissionalId, callback) {
  return onSnapshot(doc(db, "agendas", profissionalId), (snap) => {
    callback(snap.exists() ? snap.data() : {});
  });
}

export async function atualizarCelulaAgenda(profissionalId, chave, valor) {
  const ref = doc(db, "agendas", profissionalId);
  await setDoc(ref, { [chave]: valor }, { merge: true });
}

export async function atualizarHorariosPorDia(profissionalId, dia, novaLista) {
  const ref = doc(db, "agendas", profissionalId);
  const snap = await getDoc(ref);
  const horariosPorDia = snap.exists() ? snap.data().horariosPorDia || {} : {};
  horariosPorDia[dia] = novaLista;
  await setDoc(ref, { horariosPorDia }, { merge: true });
}

// ── Pagamentos ───────────────────────────────────────────────────────────
export function ouvirPagamentos(profissionalId, callback) {
  return onSnapshot(doc(db, "pagamentos", profissionalId), (snap) => {
    callback(snap.exists() ? snap.data() : {});
  });
}

export async function atualizarMesPagamento(profissionalId, mes, linhas) {
  const ref = doc(db, "pagamentos", profissionalId);
  await setDoc(ref, { [mes]: linhas }, { merge: true });
}

// ── Convites (link de auto-cadastro) ────────────────────────────────────
export async function criarConvite(token, dados) {
  await setDoc(doc(db, "convites", token), dados);
}

export async function buscarConvite(token) {
  const snap = await getDoc(doc(db, "convites", token));
  return snap.exists() ? snap.data() : null;
}

export async function marcarConvitePreenchido(token) {
  await updateDoc(doc(db, "convites", token), { preenchido: true });
}

// ── Ouvidoria ────────────────────────────────────────────────────────────
export function ouvirOuvidoria(alunoId, callback) {
  return onSnapshot(doc(db, "ouvidoria", String(alunoId)), (snap) => {
    callback(snap.exists() ? snap.data().mensagens || [] : []);
  });
}

export async function adicionarMensagemOuvidoria(alunoId, mensagens) {
  await setDoc(doc(db, "ouvidoria", String(alunoId)), { mensagens }, { merge: true });
}
