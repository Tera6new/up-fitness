# UP Fitness — Guia de Migração para Produção

Este pacote contém a base do projeto pronta para você rodar no seu computador
e publicar como um site real (fora do Claude). Este guia te leva do zero até
o app publicado, passo a passo.

---

## O que já está pronto neste pacote

- `src/App.jsx` — todo o código do app (ainda salvando em localStorage; vamos
  trocar isso pelo Firebase juntos, módulo por módulo, nas próximas conversas)
- `src/firebase.js` — configuração do Firebase já com suas chaves reais
- `src/services/authService.js` — funções prontas de login/cadastro (Firebase
  Authentication)
- `src/services/dataService.js` — funções prontas para ler/gravar no Firestore
  (alunos, profissionais, agenda, pagamentos, convites, ouvidoria)
- `firestore.rules` — regras de segurança do banco de dados
- `package.json`, `vite.config.js`, `index.html`, `src/main.jsx` — esqueleto
  padrão de projeto React (Vite)

**Importante:** o `App.jsx` que está aqui ainda não foi conectado ao Firebase
de verdade — ele continua usando `localStorage`, exatamente como no Artifact.
Isso é proposital: primeiro vamos garantir que o projeto roda no seu
computador, depois conectamos ao Firebase em etapas pequenas e testáveis.

---

## Etapa 1 — Instalar as ferramentas necessárias no seu computador

Você só precisa instalar isso **uma vez**.

1. **Node.js** — baixe e instale em [nodejs.org](https://nodejs.org) (escolha
   a versão "LTS", que é a recomendada)
2. **Git** — baixe e instale em [git-scm.com](https://git-scm.com)
3. **Editor de código** (opcional, mas recomendado) — [VS Code](https://code.visualstudio.com)

Para confirmar que instalou certo, abra o **Terminal** (Mac) ou **Prompt de
Comando/PowerShell** (Windows) e digite:

```
node --version
git --version
```

Se aparecer um número de versão em cada um, está tudo certo.

---

## Etapa 2 — Rodar o projeto no seu computador

1. Extraia esta pasta (`up-fitness-migracao`) em algum lugar do seu computador
   (ex: Área de Trabalho)
2. Abra o Terminal/Prompt de Comando **dentro dessa pasta**:
   - No Mac: clique com o botão direito na pasta → "Novo Terminal na Pasta"
   - No Windows: dentro da pasta, clique na barra de endereço, digite `cmd`
     e aperte Enter
3. Instale as dependências do projeto:

   ```
   npm install
   ```

   Isso vai demorar um ou dois minutos na primeira vez.

4. Rode o projeto:

   ```
   npm run dev
   ```

5. O terminal vai mostrar um endereço, algo como:

   ```
   Local:   http://localhost:5173/
   ```

6. Abra esse endereço no navegador — o UP Fitness deve carregar, funcionando
   exatamente como no Artifact (ainda com localStorage, sem Firebase
   conectado ainda).

Se isso funcionar, ótimo — significa que a base do projeto está correta.
Deixe esse terminal aberto rodando enquanto trabalhamos; qualquer mudança
que fizermos no código aparece automaticamente no navegador.

---

## Etapa 3 — Conectar ao Firebase (faremos isso juntos, aos poucos)

Esta etapa **não precisa ser feita agora**. Quando você tiver o projeto
rodando localmente (Etapa 2 funcionando), volte para nossa conversa e me
avise — vou te guiar trocando o `localStorage` pelo Firebase em partes
pequenas, testando cada uma:

1. Primeiro: login de profissionais (Firebase Authentication)
2. Depois: cadastro de alunos (Firestore)
3. Depois: agenda de horários
4. Depois: pagamentos
5. Por último: ouvidoria e convites

Fazer em etapas pequenas evita que um erro grande quebre tudo de uma vez, e
permite testar cada parte antes de avançar.

---

## Etapa 4 — Publicar o site (depois que o Firebase estiver conectado)

Quando o app estiver funcionando localmente com o Firebase de verdade,
publicamos assim:

### 4.1 — Colocar o código no GitHub

1. Crie uma conta gratuita em [github.com](https://github.com)
2. Crie um novo repositório (botão verde "New")
3. Dentro da pasta do projeto no seu computador, rode:

   ```
   git init
   git add .
   git commit -m "Primeira versão"
   git branch -M main
   git remote add origin [link do seu repositório no GitHub]
   git push -u origin main
   ```

   (o GitHub mostra esses comandos exatos na tela depois de criar o
   repositório — é só copiar e colar)

### 4.2 — Publicar no Vercel

1. Crie uma conta gratuita em [vercel.com](https://vercel.com) (pode entrar
   direto com sua conta do GitHub)
2. Clique em "Add New" → "Project"
3. Selecione o repositório que você acabou de criar
4. O Vercel detecta automaticamente que é um projeto Vite — não precisa
   mudar nenhuma configuração
5. Clique em "Deploy"
6. Em 1-2 minutos, o Vercel te dá um endereço público, tipo:

   ```
   https://up-fitness-suaconta.vercel.app
   ```

Esse é o link que você vai compartilhar com os profissionais da academia.

### 4.3 — Adicionar o domínio autorizado no Firebase

Depois de publicar, é preciso avisar o Firebase que esse novo endereço tem
permissão de usar o Authentication:

1. No Firebase Console, vá em **Authentication → Settings → Domínios
   autorizados**
2. Clique em "Adicionar domínio"
3. Cole o endereço do Vercel (sem o `https://`), ex: `up-fitness-suaconta.vercel.app`

---

## Resumo do que fazer agora

1. Instale Node.js e Git (Etapa 1)
2. Rode `npm install` e `npm run dev` dentro da pasta do projeto (Etapa 2)
3. Confirme que o app abre no navegador em `localhost:5173`
4. Volte aqui e me avise — seguimos para conectar o Firebase de verdade,
   módulo por módulo

Qualquer erro ou dúvida em qualquer etapa, me manda o print da mensagem de
erro que eu te ajudo a resolver.
