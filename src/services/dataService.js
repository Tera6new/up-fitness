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
  deleteField,
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

// Ouve TODAS as agendas de uma vez (necessario para a Busca de Vagas, que
// precisa comparar horarios entre todos os profissionais simultaneamente).
// Retorna um objeto no formato { [profissionalId]: dadosDaAgenda }.
export function ouvirTodasAgendas(callback) {
  return onSnapshot(collection(db, "agendas"), (snap) => {
    const todas = {};
    snap.docs.forEach((d) => { todas[d.id] = d.data(); });
    callback(todas);
  });
}

export async function atualizarCelulaAgenda(profissionalId, chave, valor) {
  const ref = doc(db, "agendas", profissionalId);
  // valor null/undefined significa "célula vazia" -> remove o campo do documento
  // em vez de gravar null (evita registros vazios acumulando no banco).
  const valorFinal = valor === null || valor === undefined ? deleteField() : valor;
  await setDoc(ref, { [chave]: valorFinal }, { merge: true });
}

export async function atualizarHorariosPorDia(profissionalId, dia, novaLista) {
  const ref = doc(db, "agendas", profissionalId);
  const snap = await getDoc(ref);
  const horariosPorDia = snap.exists() ? snap.data().horariosPorDia || {} : {};
  horariosPorDia[dia] = novaLista;
  await setDoc(ref, { horariosPorDia }, { merge: true });
}

// Restaura o backup de uma agenda mesclando com o que já existe (mesmo
// comportamento seguro usado para alunos): preserva dias/horários criados
// depois que o backup foi feito, em vez de apagá-los. Faz merge manual em
// profundidade no campo horariosPorDia, já que o merge:true do Firestore
// substitui objetos aninhados inteiros em vez de mesclar campo a campo.
export async function salvarAgendaCompleta(profissionalId, dadosCompletos) {
  const ref = doc(db, "agendas", profissionalId);
  const snap = await getDoc(ref);
  const atual = snap.exists() ? snap.data() : {};

  // Mescla horariosPorDia dia a dia, e dentro de cada dia, mescla a LISTA de
  // horarios (nao so o array inteiro) — preserva horarios adicionados depois
  // do backup, mesmo em dias que ja existiam no backup.
  const diasAtuais = atual.horariosPorDia || {};
  const diasBackup = dadosCompletos.horariosPorDia || {};
  const todosDias = new Set([...Object.keys(diasAtuais), ...Object.keys(diasBackup)]);
  const horariosPorDiaMesclado = {};
  for (const dia of todosDias) {
    const horariosAtuais = diasAtuais[dia] || [];
    const horariosBackup = diasBackup[dia] || [];
    // Uniao dos dois conjuntos de horarios, sem duplicar
    const uniao = Array.from(new Set([...horariosBackup, ...horariosAtuais]));
    horariosPorDiaMesclado[dia] = uniao.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
  }

  // Mescla o documento inteiro: comeca com o que ja existe (atual), depois
  // sobrepoe com o que veio do backup (dadosCompletos) — preserva celulas
  // (ex: Segunda_18H_0) criadas depois do backup.
  const documentoMesclado = {
    ...atual,
    ...dadosCompletos,
    horariosPorDia: horariosPorDiaMesclado,
  };

  await setDoc(ref, documentoMesclado);
}

// ── Pagamentos ───────────────────────────────────────────────────────────
export function ouvirPagamentos(profissionalId, callback) {
  return onSnapshot(doc(db, "pagamentos", profissionalId), (snap) => {
    callback(snap.exists() ? snap.data() : {});
  });
}

// Ouve TODOS os pagamentos de uma vez (necessario para o Consolidado Geral,
// que soma os valores de todos os profissionais simultaneamente).
// Retorna um objeto no formato { [profissionalId]: dadosDoPagamento }.
export function ouvirTodosPagamentos(callback) {
  return onSnapshot(collection(db, "pagamentos"), (snap) => {
    const todos = {};
    snap.docs.forEach((d) => { todos[d.id] = d.data(); });
    callback(todos);
  });
}

export async function atualizarMesPagamento(profissionalId, mes, linhas) {
  const ref = doc(db, "pagamentos", profissionalId);
  await setDoc(ref, { [mes]: linhas }, { merge: true });
}

// Restaura o backup de pagamentos mesclando com o que já existe, inclusive
// linha a linha dentro de cada mês: preserva lançamentos feitos depois do
// backup, mesmo quando o mês já existia no backup. Usa o campo `id` de cada
// linha (aluno_X ou manual_timestamp) para identificar duplicatas — quando
// uma linha existe nos dois lados, o backup prevalece (é uma restauração
// intencional daquele lançamento específico); linhas que só existem no
// estado atual (criadas depois do backup) são preservadas.
export async function salvarPagamentosCompleto(profissionalId, dadosCompletos) {
  const ref = doc(db, "pagamentos", profissionalId);
  const snap = await getDoc(ref);
  const atual = snap.exists() ? snap.data() : {};

  const todosMeses = new Set([...Object.keys(atual), ...Object.keys(dadosCompletos)]);
  const mesclado = {};

  for (const mes of todosMeses) {
    const linhasAtuais = Array.isArray(atual[mes]) ? atual[mes] : null;
    const linhasBackup = Array.isArray(dadosCompletos[mes]) ? dadosCompletos[mes] : null;

    if (linhasAtuais && linhasBackup) {
      // Mescla linha a linha pelo id: backup prevalece para linhas em comum,
      // linhas so presentes no estado atual (novas) sao preservadas.
      const idsNoBackup = new Set(linhasBackup.map((l) => l.id));
      const linhasNovasPreservadas = linhasAtuais.filter((l) => !idsNoBackup.has(l.id));
      mesclado[mes] = [...linhasBackup, ...linhasNovasPreservadas];
    } else {
      // Mes so existe em um dos lados: usa o que tiver (backup tem prioridade
      // se ambos existirem mas um nao for array valido).
      mesclado[mes] = linhasBackup || linhasAtuais || [];
    }
  }

  await setDoc(ref, mesclado);
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

// Ouve TODAS as ouvidorias de uma vez (necessario para a tela de Ouvidoria
// Admin, que mostra mensagens de todos os alunos juntas com contagem de
// nao lidas). Retorna um objeto no formato { [alunoId]: [mensagens...] }.
export function ouvirTodasOuvidorias(callback) {
  return onSnapshot(collection(db, "ouvidoria"), (snap) => {
    const todas = {};
    snap.docs.forEach((d) => { todas[d.id] = d.data().mensagens || []; });
    callback(todas);
  });
}
