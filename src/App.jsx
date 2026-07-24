import { useState, useMemo, useEffect, useRef } from "react";
import { fazerLogin, observarUsuario, fazerLogout, criarConta } from "./services/authService";
import { buscarProfissional, ouvirProfissionais, ouvirAlunos, salvarProfissional, salvarAluno, criarAluno, excluirAluno, excluirProfissional as excluirProfissionalDoFirestore, ouvirTodasAgendas, atualizarCelulaAgenda, atualizarHorariosPorDia, ouvirTodosPagamentos, atualizarMesPagamento, ouvirOuvidoria, adicionarMensagemOuvidoria, ouvirTodasOuvidorias } from "./services/dataService";

// ── DADOS ────────────────────────────────────────────────────────────────────
const APP_VERSION = "v2.1";

// Limpa cache de versões antigas
if(localStorage.getItem('fittrack_version') !== APP_VERSION){
  localStorage.removeItem('fittrack_alunos');
  localStorage.removeItem('fittrack_profissionais');
  localStorage.removeItem('fittrack_user');
  localStorage.setItem('fittrack_version', APP_VERSION);
}

// Limpeza pontual (uma unica vez): remove os alunos de demonstracao que vinham
// pre-carregados no codigo (Marina Souza e Carlos Henrique), sem afetar alunos
// reais ja cadastrados pelo usuario.
if(localStorage.getItem('fittrack_demo_cleanup_v1') !== 'done'){
  try{
    const raw = localStorage.getItem('fittrack_alunos');
    if(raw){
      const lista = JSON.parse(raw);
      const nomesDemo = ["Marina Souza","Carlos Henrique"];
      const filtrada = lista.filter(a=>!nomesDemo.includes(a.nome));
      if(filtrada.length !== lista.length){
        localStorage.setItem('fittrack_alunos', JSON.stringify(filtrada));
      }
    }
  }catch(e){}
  localStorage.setItem('fittrack_demo_cleanup_v1','done');
}

const initialAlunos = [];

const initialProfissionais = [
  {id:"prof1", nome:"Leandro Silva",    especialidade:"Musculação e Hipertrofia",    role:"admin",    foto:null},
  {id:"prof2", nome:"Ana Paula Costa",  especialidade:"Funcional e Emagrecimento",   role:"personal", foto:null},
  {id:"prof3", nome:"Carlos Mendes",    especialidade:"Reabilitação e Saúde",        role:"personal", foto:null},
  {id:"prof4", nome:"Beatriz Rocha",    especialidade:"Pilates e Flexibilidade",     role:"personal", foto:null},
  {id:"prof5", nome:"Rafael Oliveira",  especialidade:"Crossfit e Condicionamento",  role:"personal", foto:null},
  {id:"prof6", nome:"Fernanda Lima",    especialidade:"Yoga e Bem-estar",            role:"personal", foto:null},
  {id:"prof7", nome:"Diego Souza",      especialidade:"Corrida e Cardio",            role:"personal", foto:null},
  {id:"prof8", nome:"Mariana Torres",   especialidade:"Musculação Feminina",         role:"personal", foto:null},
];

const OBJETIVOS = ["Emagrecimento","Hipertrofia","Condicionamento","Saúde","Reabilitação","Flexibilidade","Outro"];
const NIVEIS_AT = ["Sedentario","Levemente ativo","Moderadamente ativo","Ativo","Muito ativo"];
const ESTRESSE  = ["Baixo","Moderado","Alto","Muito alto"];
const DIAS_SEM  = ["Seg","Ter","Qua","Qui","Sex","Sab","Dom"];
const LETRAS    = ["A","B","C","D"];
const COR_LETRA = {A:"#f97316",B:"#f97316",C:"#f97316",D:"#f97316"};

// ── Agenda de Horarios ────────────────────────────────────────────────────────
const AGENDA_DIAS = ["Segunda","Terca","Quarta","Quinta","Sexta","Sabado"];
const AGENDA_DIAS_ABREV = {"Segunda":"Seg","Terca":"Ter","Quarta":"Qua","Quinta":"Qui","Sexta":"Sex","Sabado":"Sab"};
// Horarios padrao sugeridos ao criar a agenda de um profissional pela 1a vez.
// Cada profissional pode adicionar/remover horarios livremente depois.
const AGENDA_HORARIOS_PADRAO = Array.from({length:16},(_,i)=>{
  const h = 5+i; // 05h as 20h
  return String(h).padStart(2,"0")+"H";
});
const AGENDA_SLOTS_POR_HORA = 3;

const EXERCICIOS_DB = {
  "Peito":     ["Supino reto","Supino inclinado","Supino declinado","Crucifixo reto","Crucifixo inclinado","Crucifixo declinado","Peck Deck","Crossover alto","Crossover baixo","Flexão de braço","Pullover"],
  "Costas":    ["Puxada frontal","Remador","Remada curvada","Remada cavalinho","Remada unilateral","Remada sentada","Serrote","Barra fixa","Pull down","Hiperextensão lombar"],
  "Ombros":    ["Desenvolvimento com barra","Desenvolvimento com halteres","Elevação lateral","Elevação frontal","Remada alta","Crucifixo invertido","Encolhimento","Arnold press","Face pull"],
  "Bíceps":    ["Rosca direta","Rosca alternada","Rosca martelo","Rosca concentrada","Rosca scott","Rosca 21","Rosca cabo","Rosca inclinada"],
  "Tríceps":   ["Tríceps testa","Tríceps pulley","Tríceps francês","Mergulho no banco","Tríceps coice","Tríceps corda"],
  "Pernas":    ["Afundo","Agachamento livre","Agachamento smith","Agachamento sumô","Avanço","Búlgaro","Cadeira abdutora","Cadeira adutora","Cadeira extensora","Cadeira flexora","Caixote","Elevação pélvica","Flexora em pé","Glúteo 4 apoios","Glúteo cabo","Leg press 45","Leg press horizontal","Mesa flexora","Panturrilha livre","Panturrilha máquina","Panturrilha unilateral","Passada","Stiff"],
  "Abdômen":   ["Abdominal supra","Abdominal infra","Oblíquo","Prancha","Crunch no cabo","Elevação de pernas","Abdominal bicicleta","Rotação russa","Hollow hold"],
  "Funcional": ["Burpee","Kettlebell swing","Box jump","Battle rope","Medicine ball","Farmer walk","TRX","Sled push","Bear crawl"],
};

// ── CÁLCULOS ─────────────────────────────────────────────────────────────────
// IMC = peso(kg) / altura(m)²
// Trata vírgula como separador decimal e altura em cm ou metros
function calcIMC(peso,alt){
  if(!peso||!alt)return null;
  let p=parseFloat(String(peso).replace(",","."));
  let a=parseFloat(String(alt).replace(",","."));
  if(!p||!a)return null;
  if(a>3) a=a/100; // altura em cm → converte para metros
  return (p/(a*a)).toFixed(2);
}
function classIMC(v){
  if(!v)return{label:"--",color:"#c2cdd8"};
  const n=parseFloat(v);
  if(n<18.5)return{label:"Abaixo do peso",color:"#60a5fa"};
  if(n<25)  return{label:"Normal",        color:"#34d399"};
  if(n<30)  return{label:"Sobrepeso",     color:"#fbbf24"};
  return           {label:"Obesidade",    color:"#f87171"};
}
function calcRCQ(c,q){ if(!c||!q)return null; return(c/q).toFixed(2); }
function classRCQ(r,sx){
  if(!r)return{label:"--",color:"#c2cdd8"};
  const v=parseFloat(r),m=sx==="Masculino";
  if(m){ if(v<0.90)return{label:"Baixo risco",color:"#34d399"}; if(v<1.00)return{label:"Risco moderado",color:"#fbbf24"}; return{label:"Alto risco",color:"#f87171"}; }
  else { if(v<0.80)return{label:"Baixo risco",color:"#34d399"}; if(v<0.86)return{label:"Risco moderado",color:"#fbbf24"}; return{label:"Alto risco",color:"#f87171"}; }
}
// PA: até 120/80 = Normal (inclusive)
function classPA(p){
  if(!p)return null;
  const m=p.replace(/\s/g,"").match(/^(\d+)[\/x](\d+)/i); if(!m)return null;
  const s=parseInt(m[1]),d=parseInt(m[2]);
  if(s<90 ||d<60)  return{label:"Hipotensão",        color:"#60a5fa"};
  if(s<=120&&d<=80) return{label:"Normal",            color:"#34d399"};
  if(s<=129&&d<=80) return{label:"Elevada",           color:"#a3e635"};
  if(s<=139||d<=89) return{label:"Pré-hipertensão",  color:"#fbbf24"};
  if(s<=159||d<=99) return{label:"Hipertensão Grau 1",color:"#fb923c"};
  if(s<=179||d<=109)return{label:"Hipertensão Grau 2",color:"#f87171"};
  return                {label:"Hipertensão Grau 3", color:"#dc2626"};
}
// Fórmula validada com a planilha da UP Fitness (Studio UP):
// DC = 1,1665 - 0,07063 * log10(Subescapular + Suprailiaca + Coxa)
// Mesma fórmula para ambos os sexos. "soma" continua sendo o somatório de todas
// as dobras preenchidas (exibido na tela), mas o cálculo de DC/%Gordura usa
// apenas as 3 dobras específicas abaixo, conforme a planilha oficial.
function calcPollock(d,idade,sexo){
  const todasDobras=[d.dobTriceps,d.dobBiceps,d.dobSubescapular,d.dobPeitoral,d.dobSuprailiaca,d.dobAbdomen,d.dobCoxa,d.dobPanturrilha]
    .map(Number).filter(v=>v>0);
  const soma=todasDobras.reduce((a,b)=>a+b,0);
  if(!soma)return null;

  const subescapular=Number(d.dobSubescapular)||0;
  const suprailiaca=Number(d.dobSuprailiaca)||0;
  const coxa=Number(d.dobCoxa)||0;
  const soma3=subescapular+suprailiaca+coxa;
  if(soma3<=0)return null;

  const dc=1.1665-(0.07063*Math.log10(soma3));
  const pct=((4.95/dc)-4.50)*100;
  return{soma, soma3, dc:dc.toFixed(4), pct:parseFloat(pct.toFixed(2))};
}

// Status da mensalidade baseado no dia de vencimento do mês atual
function statusMensalidade(diaVenc){
  if(!diaVenc) return null;
  const hoje = new Date();
  const dia  = hoje.getDate();
  const diff = parseInt(diaVenc) - dia;
  if(diff < 0)  return {label:"Vencida",      color:"#f87171", urgente:true};
  if(diff === 0) return {label:"Vence hoje",   color:"#fb923c", urgente:true};
  if(diff <= 3)  return {label:`Vence em ${diff}d`, color:"#fbbf24", urgente:true};
  return           {label:`Vence dia ${diaVenc}`, color:"#34d399", urgente:false};
}

const NOME_STUDIO = "UP Fitness";
const DIA_VENCIMENTO_PADRAO = 10; // todas as mensalidades vencem no mesmo dia
const DESCONTO_ANTECIPACAO = 30; // R$ de desconto pagando ate o dia 08
const DIA_LIMITE_DESCONTO = 8;

// ── Geradores de mensagem por tipo ──────────────────────────────────────────
function montarMsgLembrete(aluno){
  const nome = aluno.nome.split(" ")[0];
  return `Olá ${nome}👋\n\nPassando para lembrar que sua mensalidade vence no dia ${DIA_VENCIMENTO_PADRAO}\n\n💸 *Pagando até o dia ${DIA_LIMITE_DESCONTO}, você garante R$ ${DESCONTO_ANTECIPACAO},00 de desconto* \n\nQualquer dúvida estamos à disposição!\n\nAbraço,\n${NOME_STUDIO}`;
}

function montarMsgCobranca(aluno){
  const nome = aluno.nome.split(" ")[0];
  return `Olá ${nome}! 👋\n\nPassando para avisar que sua mensalidade venceu no dia ${DIA_VENCIMENTO_PADRAO}.\n\nCaso tenha efetuado o pagamento desconsiderar essa mensagem. \n\nQualquer dúvida estamos à disposição!\n\nAbraço,\n${NOME_STUDIO}`;
}

function montarMsgMotivacional(aluno){
  const nome = aluno.nome.split(" ")[0];
  return `Olá ${nome}! 👋\n\nSentimos sua falta por aqui! 💪 Passando só para lembrar que cada treino conta, e a consistência é o que traz resultado de verdade.\n\nEstamos te esperando!\n\nAbraço,\n${NOME_STUDIO}`;
}

const TIPOS_MSG_WHATSAPP = [
  { id:"lembrete", label:"Lembrete de pagamento", icone:"⏰", cor:"#fbbf24", gerar:montarMsgLembrete },
  { id:"cobranca", label:"Cobrança por atraso", icone:"⚠️", cor:"#f87171", gerar:montarMsgCobranca },
  { id:"motivacional", label:"Motivacional (falta)", icone:"💪", cor:"#34d399", gerar:montarMsgMotivacional },
];

function dispararWhatsApp(telefone, mensagem){
  const tel = (telefone||"").replace(/\D/g,"");
  const url = tel
    ? `https://wa.me/55${tel}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank");
}

const C = {
  bg:"#0a0a0a",
  surface:"#161616",      // ligeiramente mais claro que bg
  card:"#1c1c1c",         // card ainda mais claro para hierarquia
  inputBg:"#242424",      // fundo dos inputs bem visível
  inputBorder:"#3d2e18",  // borda laranja mais visível
  inputBorderFocus:"#f97316",
  text:"#f0ebe4",         // branco quente principal
  textSub:"#b8a898",      // subtítulo/secundário
  muted:"#c4b3a3",
  faint:"#1a1008",
  accent:"#f97316",
  green:"#34d399",
  yellow:"#fbbf24",
  red:"#f87171",
  sectionHdr:"#ff9a4a",   // laranja mais claro para headers de seção
};
const T = { fontFamily:"'Inter',sans-serif" };

const css = {
  app:    { minHeight:"100vh", background:C.bg, ...T, color:C.text, fontSize:14, overflowX:"hidden", boxSizing:"border-box" },
  hdr:    { background:"linear-gradient(180deg,#1a0f00 0%,#0a0a0a 100%)", borderBottom:"1px solid #3d1f00", padding:"0 16px", height:58,
            display:"flex", alignItems:"center", justifyContent:"space-between",
            position:"sticky", top:0, zIndex:100, boxSizing:"border-box", width:"100%" },
  logo:   { fontWeight:800, fontSize:19, letterSpacing:.5, color:C.accent },
  wrap:   { maxWidth:860, margin:"0 auto", padding:"20px 16px", boxSizing:"border-box", width:"100%" },
  // Cards com hierarquia: card base é mais claro que bg
  card:   { background:C.card, border:"1px solid #332010", borderRadius:14,
            padding:"16px 16px", marginBottom:12, boxSizing:"border-box", width:"100%" },
  // Card interno (nested), mais escuro que card pai
  cardInner: { background:"#121212", border:"1px solid #2a1a08", borderRadius:10,
               padding:"12px 14px", boxSizing:"border-box", width:"100%" },
  secHdr: { fontWeight:700, fontSize:11, color:C.sectionHdr, textTransform:"uppercase",
            letterSpacing:1.5, marginBottom:14, paddingBottom:8, borderBottom:"1px solid #2a1a08" },
  // Input com contraste bem maior
  input:  { background:C.inputBg, border:"1px solid "+C.inputBorder, borderRadius:8,
            padding:"10px 12px", fontSize:16, color:C.text, width:"100%",
            outline:"none", fontFamily:"'Inter',sans-serif", boxSizing:"border-box", minWidth:0 },
  // Label com cor mais visível
  lbl:    { fontSize:11, fontWeight:700, color:"#e8cba8", textTransform:"uppercase",
            letterSpacing:.8, marginBottom:6, display:"block" },
  row:    (cols) => ({ display:"grid", gridTemplateColumns:cols, gap:10, width:"100%" }),
  btnA:   { background:"linear-gradient(135deg,#f97316,#e05a00)", color:"#fff",
            border:"none", borderRadius:9, padding:"9px 18px", fontWeight:700,
            fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif", whiteSpace:"nowrap" },
  btnB:   { background:"#1a1008", color:"#9a7a5a", border:"1px solid #3d2010",
            borderRadius:9, padding:"9px 16px", fontWeight:600, fontSize:13,
            cursor:"pointer", fontFamily:"'Inter',sans-serif", whiteSpace:"nowrap" },
  btnC:   { background:"transparent", color:"#f97316", border:"1px solid #3d2010",
            borderRadius:8, padding:"7px 14px", fontWeight:600, fontSize:12,
            cursor:"pointer", fontFamily:"'Inter',sans-serif" },
  btnDel: { background:"#450a0a", color:"#fca5a5", border:"none", borderRadius:8,
            padding:"9px 16px", fontWeight:600, fontSize:13,
            cursor:"pointer", fontFamily:"'Inter',sans-serif" },
  badge:  (c) => ({ background:c+"20", color:c, borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700 }),
  stat:   (c) => ({ background:c+"15", border:"1px solid "+c+"35", borderRadius:10,
                    padding:"12px 14px", textAlign:"center" }),
  pill:   (on) => ({ background:on?"#f97316":"#1c1c1c", color:on?"#0a0a0a":"#c4b3a3",
                     border:"1px solid "+(on?"#f97316":"#3d2010"),
                     borderRadius:8, padding:"7px 14px", fontWeight:700, fontSize:12,
                     cursor:"pointer", fontFamily:"'Inter',sans-serif", transition:"all .15s" }),
  tabBtn: (on,c) => ({ background:on?(c||"#f97316")+"25":"transparent",
                        color:on?(c||"#f97316"):"#c4b3a3",
                        border:on?"1px solid "+(c||"#f97316")+"50":"none",
                        borderRadius:8, padding:"8px 8px", fontWeight:700, fontSize:11,
                        cursor:"pointer", fontFamily:"'Inter',sans-serif", flex:"0 0 auto", whiteSpace:"nowrap" }),
  dot:    (on) => ({ width:7, height:7, borderRadius:"50%", background:on?"#f97316":"#2a1a08" }),
};

const emptyForm = {
  nome:"", sexo:"Masculino", dataNasc:"", idade:"", telefone:"", email:"",
  nomeEmergencia:"", telEmergencia:"",
  endereco:"", objetivo:"Emagrecimento", objetivo2:"", nivelAtividade:"Sedentario", profissao:"",
  doencas:"", medicamentos:"", cirurgias:"", lesoes:"", alergias:"",
  fumante:"Não", alcool:"Não", insonia:"Não", temDor:"Não", descDor:"",
  nivelEstresse:"Baixo", praticaEsporte:"", objetivoAnamnese:"",
  ativo:true, foto:null,
  plano:"", valorMensalidade:"", diaVencimento:"",
  peso:"", altura:"", pressao:"", cintura:"", quadril:"",
  cinturaEscapular:"", peitNormal:"", peitInspirado:"",
  bracoDirNormal:"", bracoDirContraido:"", antebracoDir:"",
  bracoEsqNormal:"", bracoEsqContraido:"", antebracoEsq:"",
  abdomen:"", coxaDirSupra:"", coxaDirInfra:"", coxaDirInfContr:"",
  coxaEsqSupra:"", coxaEsqInfra:"", coxaEsqInfContr:"",
  panturrilhaDir:"", panturrilhaEsq:"",
  dobTriceps:"", dobBiceps:"", dobSubescapular:"", dobPeitoral:"",
  dobSuprailiaca:"", dobAbdomen:"", dobCoxa:"", dobPanturrilha:"",
  gordura:"", massaMagra:"",
  historicoAvaliacoes:[],
  frequencia:"", nivelExperiencia:"", dataInicioTreino:"",
  diasTreino:[], horariosTreino:{},
  exerciciosContra:"", obsTreino:"",
  treinoA:"", treinoB:"", treinoC:"", treinoD:"",
  blocosA:[], blocosB:[], blocosC:[], blocosD:[],
};

// ── MICRO COMPONENTES ────────────────────────────────────────────────────────
function LogoUP({size=40}){
  return(
    <svg width={size} height={size*0.9} viewBox="0 0 100 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="upgrad" x1="0" y1="90" x2="80" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ef4444"/>
          <stop offset="50%" stopColor="#f97316"/>
          <stop offset="100%" stopColor="#fbbf24"/>
        </linearGradient>
      </defs>
      <path d="M5 10 L5 55 Q5 75 25 75 Q45 75 45 55 L45 10 L35 10 L35 55 Q35 65 25 65 Q15 65 15 55 L15 10 Z" fill="url(#upgrad)"/>
      <polygon points="25,8 32,28 27,24 27,50 23,50 23,24 18,28" fill="#0b1120" opacity="0.5"/>
      <polygon points="25,5 33,26 27,22 27,48 23,48 23,22 17,26" fill="url(#upgrad)"/>
      <path d="M52 10 L52 75 L62 75 L62 50 L75 50 Q92 50 92 30 Q92 10 75 10 Z M62 20 L74 20 Q82 20 82 30 Q82 40 74 40 L62 40 Z" fill="url(#upgrad)"/>
    </svg>
  );
}

function GF(){ return <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />; }

// Comprime uma imagem (redimensiona + reduz qualidade JPEG) antes de salvar no
// localStorage, já que o espaço disponível é limitado (~5-10MB no total).
// Retorna uma Promise com o base64 já comprimido.
function comprimirImagem(file, maxLargura=800, qualidade=0.7){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let largura = img.width, altura = img.height;
        if(largura > maxLargura){
          altura = Math.round(altura * (maxLargura/largura));
          largura = maxLargura;
        }
        const canvas = document.createElement("canvas");
        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, largura, altura);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Avatar({nome,foto,size}){
  const sz=size||52;
  const ini=nome?nome.split(" ").map(n=>n[0]).slice(0,2).join("").toUpperCase():"?";
  const pal=["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#06b6d4"];
  const bg=pal[(nome?nome.charCodeAt(0):0)%pal.length];
  if(foto)return <img src={foto} alt={nome} style={{width:sz,height:sz,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>;
  return <div style={{width:sz,height:sz,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.36,fontWeight:700,color:"#fff",flexShrink:0}}>{ini}</div>;
}

// ── Seletor de data com rolagem (Dia / Mes / Ano) ──────────────────────────────
const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Coluna de rolagem genérica (Dia/Mes/Ano) — componente estável fora do pai para não remontar a cada render
function ColunaScroll(props){
  var items = props.items;
  var getVal = props.getVal;
  var getLabel = props.getLabel;
  var current = props.current;
  var onPick = props.onPick;
  var flexSize = props.flexSize ? props.flexSize : 1;

  var containerRef = useRef(null);
  var scrollTimeoutRef = useRef(null);
  var userScrollingRef = useRef(false);
  var initedRef = useRef(false);
  var lastValRef = useRef(null);

  useEffect(function(){
    var el = containerRef.current;
    if(!el) return;
    if(lastValRef.current === current && initedRef.current) return;
    if(userScrollingRef.current) return;
    var idx = -1;
    for(var i=0;i<items.length;i++){
      if(getVal(items[i]) === current){ idx = i; break; }
    }
    if(idx >= 0){ el.scrollTop = idx * 40; }
    initedRef.current = true;
    lastValRef.current = current;
  }, [current]);

  function handleScroll(e){
    var el = e.currentTarget;
    if(scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(function(){
      var idx = Math.round(el.scrollTop / 40);
      if(idx < 0) idx = 0;
      if(idx > items.length-1) idx = items.length-1;
      var it = items[idx];
      if(it !== undefined) onPick(it);
    }, 90);
  }

  function handleTouchStart(){
    userScrollingRef.current = true;
  }

  function handleTouchEnd(){
    setTimeout(function(){ userScrollingRef.current = false; }, 150);
  }

  var wrapStyle = { flex: flexSize, minWidth: 0 };
  var scrollStyle = {
    position: "relative",
    height: 120,
    overflowY: "scroll",
    background: C.inputBg,
    border: "1px solid " + C.inputBorder,
    borderRadius: 8,
    scrollSnapType: "y mandatory",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain"
  };
  var indicatorStyle = {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    height: 40,
    border: "1px solid " + C.accent + "50",
    borderRadius: 6,
    pointerEvents: "none",
    background: C.accent + "08"
  };

  return (
    <div style={wrapStyle}>
      <div
        ref={containerRef}
        style={scrollStyle}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{height:40}} />
        {items.map(function(it, i){
          var v = getVal(it);
          var isSel = v === current;
          var itemStyle = {
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scrollSnapAlign: "center",
            cursor: "pointer",
            fontSize: isSel ? 16 : 14,
            fontWeight: isSel ? 800 : 500,
            color: isSel ? C.accent : C.muted
          };
          return (
            <div key={i} onClick={function(){ onPick(it); }} style={itemStyle}>
              {getLabel(it)}
            </div>
          );
        })}
        <div style={{height:40}} />
        <div style={indicatorStyle} />
      </div>
    </div>
  );
}

function DateScrollPicker({value, onChange, label}){
  // value no formato "YYYY-MM-DD"
  const hoje = new Date();
  const parse = (v)=>{
    if(v && /^\d{4}-\d{2}-\d{2}$/.test(v)){
      const [y,m,d]=v.split("-").map(Number);
      return {dia:d, mes:m, ano:y};
    }
    return {dia:hoje.getDate(), mes:hoje.getMonth()+1, ano:hoje.getFullYear()-25};
  };
  const [sel,setSel]=useState(parse(value));

  useEffect(()=>{ setSel(parse(value)); },[value]);

  const anos = Array.from({length:90},(_,i)=>hoje.getFullYear()-i); // últimos 90 anos
  const diasNoMes = new Date(sel.ano, sel.mes, 0).getDate();
  const dias = Array.from({length:diasNoMes},(_,i)=>i+1);
  const meses = MESES_ABREV.map((m,i)=>({label:m, val:i+1}));

  const commit = (campo, valor)=>{
    setSel(prev=>{
      const novoSel = {...prev, [campo]:valor};
      const diaFinal = Math.min(novoSel.dia, new Date(novoSel.ano, novoSel.mes, 0).getDate());
      const iso = `${novoSel.ano}-${String(novoSel.mes).padStart(2,"0")}-${String(diaFinal).padStart(2,"0")}`;
      onChange(iso);
      return novoSel;
    });
  };

  return(
    <div>
      {label&&<label style={css.lbl}>{label}</label>}
      <div style={{display:"flex",gap:8}}>
        <ColunaScroll items={dias} getVal={d=>d} getLabel={d=>d} current={sel.dia}
          onPick={d=>commit("dia",d)} flexSize={1}/>
        <ColunaScroll items={meses} getVal={m=>m.val} getLabel={m=>m.label} current={sel.mes}
          onPick={m=>commit("mes",m.val)} flexSize={1.3}/>
        <ColunaScroll items={anos} getVal={a=>a} getLabel={a=>a} current={sel.ano}
          onPick={a=>commit("ano",a)} flexSize={1.3}/>
      </div>
    </div>
  );
}


function Inp({label,value,onChange,type,placeholder,step,disabled}){
  const [focused,setFocused]=useState(false);
  return(
    <div style={{display:"flex",flexDirection:"column"}}>
      {label&&<label style={css.lbl}>{label}</label>}
      <input
        style={{
          ...css.input,
          opacity:disabled?.6:1,
          border:"1px solid "+(focused?C.inputBorderFocus:C.inputBorder),
          boxShadow:focused?"0 0 0 2px #f9731622":"none",
          transition:"border-color .15s, box-shadow .15s",
        }}
        type={type||"text"} step={step} placeholder={placeholder||""}
        value={value||""}
        onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setFocused(false)}
        disabled={disabled}
      />
    </div>
  );
}

function Sel({label,value,onChange,opts,placeholder}){
  const [focused,setFocused]=useState(false);
  return(
    <div>
      {label&&<label style={css.lbl}>{label}</label>}
      <select
        style={{
          ...css.input,
          border:"1px solid "+(focused?C.inputBorderFocus:C.inputBorder),
          boxShadow:focused?"0 0 0 2px #f9731622":"none",
          transition:"border-color .15s, box-shadow .15s",
        }}
        value={value||""}
        onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setFocused(false)}
      >
        {placeholder&&<option value="">{placeholder}</option>}
        {opts.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
      </select>
    </div>
  );
}

function TA({label,value,onChange,placeholder,rows}){
  const [focused,setFocused]=useState(false);
  return(
    <div>
      {label&&<label style={css.lbl}>{label}</label>}
      <textarea
        style={{
          ...css.input,
          resize:"vertical",
          minHeight:(rows||2)*38,
          border:"1px solid "+(focused?C.inputBorderFocus:C.inputBorder),
          boxShadow:focused?"0 0 0 2px #f9731622":"none",
          transition:"border-color .15s, box-shadow .15s",
        }}
        placeholder={placeholder||""}
        value={value||""}
        onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocused(true)}
        onBlur={()=>setFocused(false)}
      />
    </div>
  );
}

function Divider({label}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0"}}>
      <div style={{flex:1,height:1,background:"#2e1e0a"}}/>
      {label&&<span style={{fontSize:10,fontWeight:700,color:"#e8cba8",textTransform:"uppercase",letterSpacing:1,whiteSpace:"nowrap"}}>{label}</span>}
      <div style={{flex:1,height:1,background:"#2e1e0a"}}/>
    </div>
  );
}

function ResultBox({label,value,color,sub}){
  return(
    <div style={{background:color+"18",border:"1px solid "+color+"40",borderRadius:9,padding:"10px 14px"}}>
      <div style={{fontSize:10,color:"#e8cba8",fontWeight:700,textTransform:"uppercase",letterSpacing:.8}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color,marginTop:2}}>{value}</div>
      {sub&&<div style={{fontSize:11,color,fontWeight:600,marginTop:1}}>{sub}</div>}
    </div>
  );
}

function Modal({title,children,onClose,onConfirm,confirmLabel,danger}){
  return(
    <div style={{position:"fixed",inset:0,background:"#00000099",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20}}>
      <div style={{...css.card,maxWidth:380,width:"100%",padding:24}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:16}}>{title}</div>
        <div style={{display:"grid",gap:12,marginBottom:20}}>{children}</div>
        <div style={{display:"flex",gap:10}}>
          <button style={{...css.btnB,flex:1}} onClick={onClose}>Cancelar</button>
          <button style={{...(danger?css.btnDel:css.btnA),flex:1}} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Editar Profissional (standalone, usado em múltiplas telas) ──────────
function ModalEditProf({prof, currentUserRole, onSave, onClose, onExcluir}){
  const [dados, setDados]=useState({...prof});
  const [confirmarExclusao, setConfirmarExclusao]=useState(false);

  if(confirmarExclusao){
    return(
      <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}}>
        <div style={{background:C.card,border:"1px solid #7f1d1d60",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
          <div style={{fontWeight:800,fontSize:17,marginBottom:8,color:"#f87171"}}>Excluir profissional?</div>
          <p style={{color:C.muted,fontSize:13,lineHeight:1.6,marginBottom:20}}>
            Tem certeza que deseja excluir <strong style={{color:C.text}}>{prof.nome}</strong>? Essa ação não pode ser desfeita. Os alunos vinculados a esse profissional não serão excluídos, mas ficarão sem profissional responsável até serem transferidos.
          </p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <button onClick={()=>setConfirmarExclusao(false)} style={{...css.btnB,width:"100%",padding:"11px"}}>Cancelar</button>
            <button onClick={()=>onExcluir(prof.id)} style={{...css.btnDel,width:"100%",padding:"11px"}}>Excluir</button>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}}>
      <div style={{background:C.card,border:"1px solid #3d2010",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:4,color:C.text}}>Editar profissional</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:20}}>{dados.nome}</div>
        <div style={{display:"grid",gap:14,marginBottom:20}}>
          <div>
            <label style={css.lbl}>Nome completo</label>
            <input style={css.input} value={dados.nome||""} onChange={e=>setDados(p=>({...p,nome:e.target.value}))} placeholder="Nome completo"/>
          </div>
          {currentUserRole==="admin"&&(
            <div>
              <label style={css.lbl}>Funcao</label>
              <select style={css.input} value={dados.role||"personal"} onChange={e=>setDados(p=>({...p,role:e.target.value}))}>
                <option value="personal">Personal Trainer</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          )}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:currentUserRole==="admin"?10:0}}>
          <button onClick={onClose} style={{...css.btnB,width:"100%",padding:"11px"}}>Cancelar</button>
          <button onClick={()=>onSave(dados)} style={{...css.btnA,width:"100%",padding:"11px"}}>Salvar</button>
        </div>
        {currentUserRole==="admin"&&onExcluir&&(
          <button onClick={()=>setConfirmarExclusao(true)}
            style={{...css.btnDel,width:"100%",padding:"11px",background:"transparent",border:"1px solid #7f1d1d60",color:"#f87171"}}>
            Excluir profissional
          </button>
        )}
      </div>
    </div>
  );
}

function StepBar({page,total,onSelect,editMode}){
  const labels=[
    {s:"Dados Pessoais",sub:"Anamnese"},
    {s:"Antropometria",sub:"IMC, PA, RCQ"},
    {s:"Aval. Física",sub:"Dobras"},
    {s:"Treino",sub:"Prescrição"},
  ];
  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
      {Array.from({length:total},(_,i)=>{
        const done=i<page-1, active=i===page-1;
        const clickable=editMode||done||active;
        const bc=active?C.accent:done?"#34d399":C.inputBorder;
        return(
          <div key={i}
            onClick={()=>onSelect&&clickable&&onSelect(i+1)}
            style={{background:active?C.accent+"18":done?"#34d39918":"transparent",
              border:"1px solid "+bc,borderRadius:10,padding:"10px 12px",
              display:"flex",alignItems:"center",gap:8,
              cursor:clickable?"pointer":"default",
              transition:"opacity .15s",opacity:clickable?1:.6}}>
            <div style={{width:22,height:22,borderRadius:"50%",
              background:active?C.accent:done?"#34d399":C.inputBorder,
              color:(active||done)?C.bg:C.muted,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:11,fontWeight:800,flexShrink:0}}>
              {done?"✓":i+1}
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,
                color:active?C.accent:done?"#34d399":C.muted,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{labels[i].s}</div>
              <div style={{fontSize:10,color:"#8f9baa"}}>{labels[i].sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Bloco de seção com fundo diferenciado ────────────────────────────────────
function SectionCard({title, children, style}){
  return(
    <div style={{...css.card, ...style}}>
      {title&&<div style={css.secHdr}>{title}</div>}
      <div style={{display:"grid",gap:14}}>
        {children}
      </div>
    </div>
  );
}

// ── Campo de leitura (visualização) com fundo distinto ───────────────────────
function ReadField({label, value, color}){
  return(
    <div style={{background:"#121212",borderRadius:8,padding:"10px 12px",border:"1px solid #2a1a08"}}>
      <div style={{fontSize:10,color:"#e8cba8",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:3}}>{label}</div>
      <div style={{fontSize:13,color:color||(value?C.text:"#64748b"),fontWeight:value?500:400}}>{value||"--"}</div>
    </div>
  );
}

// ── OUVIDORIA VIEW ────────────────────────────────────────────────────────────
const OUVIDORIA_ASSUNTOS = ["Atendimento","Estrutura / Equipamentos","Higiene","Treino / Prescrição","Financeiro / Mensalidade","Sugestão","Outro"];

function OuvidoriaView({aluno, prof}){
  const [assunto,setAssunto]   = useState(OUVIDORIA_ASSUNTOS[0]);
  const [mensagem,setMensagem] = useState("");
  const [enviado,setEnviado]   = useState(false);
  const [enviando,setEnviando] = useState(false);
  const [historico,setHistorico] = useState([]);

  // Mantem o historico de mensagens sincronizado em tempo real com o Firestore.
  useEffect(()=>{
    const unsub = ouvirOuvidoria(aluno.id, (msgs)=>setHistorico(msgs));
    return ()=>unsub();
  }, [aluno.id]);

  const salvar = async ()=>{
    if(!mensagem.trim()) return;
    const novo = {
      id: Date.now(),
      data: new Date().toLocaleDateString("pt-BR"),
      hora: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),
      assunto, mensagem: mensagem.trim(),
      status:"Enviado",
    };
    const novo_hist = [novo, ...historico];
    setEnviando(true);
    try{
      await adicionarMensagemOuvidoria(aluno.id, novo_hist);
      setMensagem("");
      setEnviado(true);
      setTimeout(()=>setEnviado(false), 3000);
    }catch(e){
      console.error("Erro ao enviar mensagem de ouvidoria:", e);
    }
    setEnviando(false);
  };

  const enviarWhatsApp = ()=>{
    const profTel = (prof?.telefone||"").replace(/\D/g,"");
    // Número fixo da UP Fitness — pode ser configurado
    const tel = profTel || "";
    const msg = `📣 *Ouvidoria UP Fitness*\n\n*Aluno:* ${aluno.nome}\n*Assunto:* ${assunto}\n\n${mensagem}`;
    const url = tel
      ? `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url,"_blank");
  };

  const statusColor = (s) => s==="Respondido"?C.green:s==="Em analise"?"#fbbf24":C.muted;

  return(
    <div>
      {/* Cabeçalho */}
      <div style={{...css.card,background:"#0f0a1a",border:"1px solid #6366f130",marginBottom:12}}>
        <div style={{fontWeight:800,fontSize:15,color:"#a78bfa",marginBottom:6}}>📣 Canal de Ouvidoria</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
          Use este canal para enviar sugestões, reclamações ou elogios. Sua mensagem será registrada e encaminhada à equipe UP Fitness.
        </div>
      </div>

      {/* Formulário */}
      <div style={css.card}>
        <div style={css.secHdr}>Nova Mensagem</div>

        <div style={{marginBottom:12}}>
          <label style={css.lbl}>Assunto</label>
          <select style={css.input} value={assunto} onChange={e=>setAssunto(e.target.value)}>
            {OUVIDORIA_ASSUNTOS.map(o=><option key={o}>{o}</option>)}
          </select>
        </div>

        <div style={{marginBottom:14}}>
          <label style={css.lbl}>Mensagem</label>
          <textarea
            style={{...css.input,minHeight:110,resize:"vertical"}}
            placeholder="Descreva sua sugestão, reclamação ou elogio com detalhes..."
            value={mensagem}
            onChange={e=>setMensagem(e.target.value)}
          />
        </div>

        {/* Botões */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <button onClick={salvar} disabled={!mensagem.trim()||enviando}
            style={{...css.btnA,padding:"11px",opacity:(mensagem.trim()&&!enviando)?1:.5,
              background:enviado?"linear-gradient(135deg,#059669,#34d399)":"linear-gradient(135deg,#f97316,#e05a00)"}}>
            {enviado?"✓ Registrado!":(enviando?"Enviando...":"Registrar")}
          </button>
          <button onClick={enviarWhatsApp} disabled={!mensagem.trim()}
            style={{width:"100%",background:mensagem.trim()?"linear-gradient(135deg,#25d366,#128c7e)":"#1c1c1c",
              color:mensagem.trim()?"#fff":C.muted,border:"none",borderRadius:9,padding:"11px",
              fontWeight:700,fontSize:13,cursor:mensagem.trim()?"pointer":"default",
              fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <span>📱</span> WhatsApp
          </button>
        </div>
      </div>

      {/* Histórico */}
      {historico.length>0&&(
        <div style={css.card}>
          <div style={css.secHdr}>Histórico de Mensagens</div>
          {historico.map((h,i)=>(
            <div key={h.id||i} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:10,padding:"12px 14px",marginBottom:i<historico.length-1?8:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:12,fontWeight:700,color:"#a78bfa"}}>{h.assunto}</span>
                <span style={{...css.badge(statusColor(h.status)),fontSize:10}}>{h.status}</span>
              </div>
              <div style={{fontSize:12,color:C.text,lineHeight:1.6,marginBottom:6}}>{h.mensagem}</div>
              <div style={{fontSize:10,color:C.muted}}>{h.data} às {h.hora}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AVALIACAO ALUNO VIEW ──────────────────────────────────────────────────────
// Retorna apenas as avaliacoes reais lançadas pelo professor (historicoAvaliacoes),
// sem fabricar uma "Atual" a partir dos dados de cadastro.
function montarAvaliacoes(aluno){
  return [...(aluno.historicoAvaliacoes||[])].reverse();
}

function DetalheAvaliacaoModal({aval, idx, total, sexo, idade, onClose, onExcluir, podeEditar}){
  const imc=calcIMC(aval.peso,aval.altura), imcC=classIMC(imc);
  const rcq=calcRCQ(aval.cintura,aval.quadril), rcqC=classRCQ(rcq,sexo);
  const paC=classPA(aval.pressao);
  const poll=aval.dobTriceps ? calcPollock(aval, idade, sexo) : null;
  const pn=parseFloat(aval.peso)||0;
  const pct=poll?parseFloat(poll.pct):null;
  const mm=pct&&pn?(pn-pn*pct/100).toFixed(1):null;
  const pg2=pct&&pn?(pn*pct/100).toFixed(1):null;
  const gordIdeal=20; // mesmo percentual (20%) para ambos os sexos, validado com a planilha oficial
  const pi=mm?(parseFloat(mm)/(1-gordIdeal/100)).toFixed(1):null;
  const pe=pi?(pn-parseFloat(pi)).toFixed(1):null;
  return(
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,overflowY:"auto"}}>
      <div style={{maxWidth:600,margin:"0 auto",padding:"16px 16px 40px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,position:"sticky",top:0,background:"#000000ee",padding:"12px 0",zIndex:10}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:C.accent}}>Avaliação {total-idx}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{aval.data}</div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {podeEditar&&onExcluir&&(
              <button onClick={onExcluir} style={{background:"#450a0a",border:"none",color:"#fca5a5",borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Excluir</button>
            )}
            <button onClick={onClose} style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"8px 14px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕ Fechar</button>
          </div>
        </div>
        {(aval.peso||aval.altura)&&(
          <div style={{...css.row("1fr 1fr"),marginBottom:12}}>
            {[{l:"Peso",v:aval.peso?aval.peso+" kg":"--",c:C.accent},{l:"Altura",v:aval.altura?aval.altura+"m":"--",c:C.accent}].map(s=>(
              <div key={s.l} style={css.stat(s.c)}>
                <div style={{fontSize:18,fontWeight:800,color:s.c}}>{s.v}</div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
        )}
        {imc&&(
          <div style={{...css.card,marginBottom:12}}>
            <div style={css.secHdr}>IMC</div>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:36,fontWeight:800,color:imcC.color}}>{imc}</div>
              <div>
                <div style={{fontWeight:700,color:imcC.color,fontSize:14}}>{imcC.label}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>Peso {aval.peso}kg · Altura {aval.altura}cm</div>
              </div>
            </div>
          </div>
        )}
        {paC&&(
          <div style={{...css.card,display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
            <div><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Pressao Arterial</div><div style={{fontSize:22,fontWeight:800,color:paC.color}}>{aval.pressao}</div></div>
            <div style={{background:paC.color+"15",border:"1px solid "+paC.color+"30",borderRadius:8,padding:"7px 12px"}}><div style={{fontWeight:700,color:paC.color,fontSize:12}}>{paC.label}</div></div>
          </div>
        )}
        {rcq&&(
          <div style={{...css.card,marginBottom:12}}>
            <div style={css.secHdr}>Relacao Cintura / Quadril</div>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{fontSize:30,fontWeight:800,color:rcqC.color}}>{rcq}</div>
              <div><div style={{fontWeight:700,color:rcqC.color,fontSize:13}}>{rcqC.label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Cintura {aval.cintura} cm · Quadril {aval.quadril} cm</div></div>
            </div>
          </div>
        )}
        {poll&&(
          <div style={{...css.card,marginBottom:12}}>
            <div style={css.secHdr}>Composicao Corporal — Pollock</div>
            <div style={css.row("1fr 1fr")}>
              {[{l:"% Gordura",v:poll.pct+"%",c:C.yellow},{l:"Massa Magra",v:mm?mm+" kg":"--",c:C.green},{l:"Peso Gordo",v:pg2?pg2+" kg":"--",c:C.red},{l:"Peso Ideal",v:pi?pi+" kg":"--",c:C.accent}].map(s=>(
                <div key={s.l} style={css.stat(s.c)}><div style={{fontSize:15,fontWeight:800,color:s.c}}>{s.v}</div><div style={{fontSize:10,color:C.muted,fontWeight:600}}>{s.l}</div></div>
              ))}
            </div>
            <div style={{...css.row("1fr 1fr 1fr"),marginTop:10}}>
              {[{l:"Somatorio",v:poll.soma+" mm",c:"#c2cdd8"},{l:"Dens. Corporal",v:poll.dc,c:"#c2cdd8"},{l:"Excesso",v:pe?(parseFloat(pe)>0?"+":"")+pe+" kg":"--",c:parseFloat(pe||0)>0?"#fb923c":C.green}].map(s=>(
                <div key={s.l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:800,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9,color:"#8f9baa",marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {[
          {t:"Tronco",cs:[{l:"Cin. Escapular",v:aval.cinturaEscapular},{l:"Peitoral Normal",v:aval.peitNormal},{l:"Peitoral Insp.",v:aval.peitInspirado}]},
          {t:"Membros Superiores",cs:[{l:"Braco Dir Normal",v:aval.bracoDirNormal},{l:"Braco Dir Contr.",v:aval.bracoDirContraido},{l:"Antebraco Dir",v:aval.antebracoDir},{l:"Braco Esq Normal",v:aval.bracoEsqNormal},{l:"Braco Esq Contr.",v:aval.bracoEsqContraido},{l:"Antebraco Esq",v:aval.antebracoEsq}]},
          {t:"Abdomen e Cintura",cs:[{l:"Abdômen",v:aval.abdomen},{l:"Cintura",v:aval.cintura},{l:"Quadril",v:aval.quadril}]},
          {t:"Membros Inferiores",cs:[{l:"Coxa Dir Supra",v:aval.coxaDirSupra},{l:"Coxa Dir Infra",v:aval.coxaDirInfra},{l:"Coxa Dir Contr.",v:aval.coxaDirInfContr},{l:"Coxa Esq Supra",v:aval.coxaEsqSupra},{l:"Coxa Esq Infra",v:aval.coxaEsqInfra},{l:"Coxa Esq Contr.",v:aval.coxaEsqInfContr},{l:"Panturrilha Dir",v:aval.panturrilhaDir},{l:"Panturrilha Esq",v:aval.panturrilhaEsq}]},
        ].filter(g=>g.cs.some(c=>c.v)).map(g=>(
          <div key={g.t} style={{...css.card,marginBottom:12}}>
            <div style={css.secHdr}>Perímetros — {g.t}</div>
            <div style={css.row("repeat(auto-fill,minmax(110px,1fr))")}>
              {g.cs.filter(c=>c.v).map(({l,v})=>(
                <div key={l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase"}}>{l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:C.text,marginTop:2}}>{v} cm</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {[{l:"Tríceps",v:aval.dobTriceps},{l:"Bíceps",v:aval.dobBiceps},{l:"Subescapular",v:aval.dobSubescapular},{l:"Peitoral",v:aval.dobPeitoral},{l:"Suprailiaca",v:aval.dobSuprailiaca},{l:"Abdômen",v:aval.dobAbdomen},{l:"Coxa",v:aval.dobCoxa},{l:"Panturrilha",v:aval.dobPanturrilha}].some(d=>d.v)&&(
          <div style={css.card}>
            <div style={css.secHdr}>Dobras Cutaneas (mm)</div>
            <div style={css.row("repeat(auto-fill,minmax(100px,1fr))")}>
              {[{l:"Tríceps",v:aval.dobTriceps},{l:"Bíceps",v:aval.dobBiceps},{l:"Subescapular",v:aval.dobSubescapular},{l:"Peitoral",v:aval.dobPeitoral},{l:"Suprailiaca",v:aval.dobSuprailiaca},{l:"Abdômen",v:aval.dobAbdomen},{l:"Coxa",v:aval.dobCoxa},{l:"Panturrilha",v:aval.dobPanturrilha}].filter(d=>d.v).map(({l,v})=>(
                <div key={l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase"}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.text,marginTop:2}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AvaliacaoAlunoView({aluno, podeEditar, onExcluirAvaliacao}){
  const [avalSelecionada,setAvalSelecionada]=useState(null);
  const [confirmarExcluir,setConfirmarExcluir]=useState(false);
  const avaliacoes=montarAvaliacoes(aluno);

  if(avalSelecionada!==null){
    const aval=avaliacoes[avalSelecionada];
    // avaliacoes é o historico invertido (mais recente primeiro) — índice real no array original:
    const totalHist=(aluno.historicoAvaliacoes||[]).length;
    const idxNoHistorico = totalHist - 1 - avalSelecionada;
    const podeExcluirEsta = podeEditar && onExcluirAvaliacao && idxNoHistorico>=0;

    return(
      <>
        <DetalheAvaliacaoModal
          aval={aval}
          idx={avalSelecionada}
          total={avaliacoes.length}
          sexo={aluno.sexo}
          idade={aluno.idade}
          onClose={()=>setAvalSelecionada(null)}
          podeEditar={podeExcluirEsta}
          onExcluir={podeExcluirEsta?()=>setConfirmarExcluir(true):null}
        />
        {confirmarExcluir&&(
          <div style={{position:"fixed",inset:0,zIndex:600}}>
            <Modal title="Excluir avaliação?" onClose={()=>setConfirmarExcluir(false)}
              onConfirm={()=>{
                onExcluirAvaliacao(idxNoHistorico);
                setConfirmarExcluir(false);
                setAvalSelecionada(null);
              }}
              confirmLabel="Excluir" danger>
              <p style={{color:C.muted,fontSize:13,textAlign:"center",margin:"6px 0"}}>
                Avaliacao de <strong style={{color:C.text}}>{aval.data}</strong> sera removida permanentemente.
              </p>
            </Modal>
          </div>
        )}
      </>
    );
  }
  return(
    <div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}}>
        Toque em uma avaliacao para ver todos os detalhes.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:8}}>
        {avaliacoes.map((aval,i)=>{
          const numero=avaliacoes.length-i;
          const isMaisRecente=i===0;
          return(
            <button key={i} onClick={()=>setAvalSelecionada(i)}
              style={{background:isMaisRecente?"#1a1008":C.card,
                border:"1px solid "+(isMaisRecente?C.accent+"60":"#332010"),
                borderRadius:12,padding:"16px 14px",textAlign:"left",cursor:"pointer",
                fontFamily:"Inter,sans-serif",width:"100%"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:800,color:isMaisRecente?C.accent:C.muted,textTransform:"uppercase",letterSpacing:.8}}>
                  Avaliacao {numero}
                </div>
                {isMaisRecente&&<span style={{...css.badge(C.accent),fontSize:9,padding:"2px 6px"}}>Recente</span>}
              </div>
              <div style={{fontSize:14,fontWeight:700,color:C.text}}>{aval.data}</div>
              <div style={{marginTop:12,fontSize:11,color:isMaisRecente?C.accent:C.muted,fontWeight:600}}>Ver detalhes →</div>
            </button>
          );
        })}
      </div>
      {avaliacoes.length===0&&(
        <div style={{...css.card,background:"#121212",textAlign:"center",padding:"28px 20px"}}>
          <div style={{fontSize:28,marginBottom:8}}>📊</div>
          <div style={{fontSize:13,color:C.muted}}>Nenhuma avaliação física registrada ainda.</div>
          <div style={{fontSize:11,color:"#8f9baa",marginTop:4}}>Seu personal ainda não lançou uma avaliação completa.</div>
        </div>
      )}
    </div>
  );
}

// ── AVALIACAO FORM VIEW ───────────────────────────────────────────────────────
function AvaliacaoFormView({aluno, onVoltar, onSalvar}){
  const hoje = new Date().toISOString().slice(0,10);
  const emptyAval = {
    data:hoje, peso:"", altura:"", pressao:"", cintura:"", quadril:"",
    cinturaEscapular:"", peitNormal:"", peitInspirado:"",
    bracoDirNormal:"", bracoDirContraido:"", antebracoDir:"",
    bracoEsqNormal:"", bracoEsqContraido:"", antebracoEsq:"",
    abdomen:"", coxaDirSupra:"", coxaDirInfra:"", coxaDirInfContr:"",
    coxaEsqSupra:"", coxaEsqInfra:"", coxaEsqInfContr:"",
    panturrilhaDir:"", panturrilhaEsq:"",
    dobTriceps:"", dobBiceps:"", dobSubescapular:"", dobPeitoral:"",
    dobSuprailiaca:"", dobAbdomen:"", dobCoxa:"", dobPanturrilha:"",
  };
  const [aval,setAval]=useState(emptyAval);
  const [salvou,setSalvou]=useState(false);
  const f=(k,v)=>setAval(p=>({...p,[k]:v}));

  const imc=calcIMC(aval.peso,aval.altura),imcC=classIMC(imc);
  const rcq=calcRCQ(aval.cintura,aval.quadril),rcqC=classRCQ(rcq,aluno.sexo);
  const poll=calcPollock(aval,aluno.idade,aluno.sexo);

  const salvar=()=>{
    const pn=parseFloat(aval.peso)||0;
    const pct=poll?parseFloat(poll.pct):null;
    const mm=pct&&pn?(pn-pn*pct/100).toFixed(1):null;
    const snapshot={
      ...aval,
      soma:poll?.soma||null,
      pct:poll?.pct||null,
      massaMagra:mm,
      dc:poll?.dc||null,
    };
    onSalvar(snapshot);
    setSalvou(true);
    setTimeout(()=>{setAval({...emptyAval,data:hoje});setSalvou(false);},2000);
  };

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:700,fontSize:14}}>{aluno.nome}</div>
          <div style={{fontSize:11,color:C.muted}}>Nova Avaliacao Fisica</div>
        </div>
        <button style={{...css.btnA,background:salvou?"linear-gradient(135deg,#059669,#34d399)":"linear-gradient(135deg,#f97316,#e05a00)"}}
          onClick={salvar}>
          {salvou?"✓ Salvo!":"Salvar"}
        </button>
      </header>
      <div style={css.wrap}>

        {/* Data */}
        <div style={{...css.card,background:"#1a1008",border:"1px solid "+C.accent+"40",overflow:"hidden"}}>
          <DateScrollPicker label="Data da Avaliação" value={aval.data} onChange={v=>f("data",v)}/>
        </div>

        {/* Medidas básicas */}
        <div style={css.card}>
          <div style={css.secHdr}>Medidas Básicas</div>
          <div style={css.row("repeat(auto-fill,minmax(130px,1fr))")}>
            <Inp label="Peso (kg)" type="number" step="0.1" value={aval.peso} onChange={v=>f("peso",v)} placeholder="70.5"/>
            <Inp label="Altura (cm)" type="number" value={aval.altura} onChange={v=>f("altura",v)} placeholder="170"/>
            {imc
              ?<ResultBox label="IMC" value={imc} color={imcC.color} sub={imcC.label}/>
              :<div><label style={css.lbl}>IMC</label><div style={{...css.input,color:C.muted}}>--</div></div>}
          </div>
        </div>

        {/* Perímetros */}
        <div style={css.card}>
          <div style={css.secHdr}>Perímetros (cm)</div>
          <Divider label="Tronco"/>
          <div style={{...css.row("repeat(auto-fill,minmax(130px,1fr))"),margin:"10px 0 14px"}}>
            <Inp label="Cin. Escapular" type="number" step="0.1" value={aval.cinturaEscapular} onChange={v=>f("cinturaEscapular",v)} placeholder="--"/>
            <Inp label="Peitoral Normal" type="number" step="0.1" value={aval.peitNormal} onChange={v=>f("peitNormal",v)} placeholder="--"/>
            <Inp label="Peitoral Insp." type="number" step="0.1" value={aval.peitInspirado} onChange={v=>f("peitInspirado",v)} placeholder="--"/>
          </div>
          <Divider label="Membros Superiores"/>
          <div style={{...css.row("repeat(auto-fill,minmax(120px,1fr))"),margin:"10px 0 14px"}}>
            <Inp label="Braco Dir Normal" type="number" step="0.1" value={aval.bracoDirNormal} onChange={v=>f("bracoDirNormal",v)} placeholder="--"/>
            <Inp label="Braco Dir Contr." type="number" step="0.1" value={aval.bracoDirContraido} onChange={v=>f("bracoDirContraido",v)} placeholder="--"/>
            <Inp label="Antebraco Dir" type="number" step="0.1" value={aval.antebracoDir} onChange={v=>f("antebracoDir",v)} placeholder="--"/>
            <Inp label="Braco Esq Normal" type="number" step="0.1" value={aval.bracoEsqNormal} onChange={v=>f("bracoEsqNormal",v)} placeholder="--"/>
            <Inp label="Braco Esq Contr." type="number" step="0.1" value={aval.bracoEsqContraido} onChange={v=>f("bracoEsqContraido",v)} placeholder="--"/>
            <Inp label="Antebraco Esq" type="number" step="0.1" value={aval.antebracoEsq} onChange={v=>f("antebracoEsq",v)} placeholder="--"/>
          </div>
          <Divider label="Abdomen e Cintura"/>
          <div style={{...css.row("repeat(auto-fill,minmax(130px,1fr))"),margin:"10px 0 14px"}}>
            <Inp label="Abdômen" type="number" step="0.1" value={aval.abdomen} onChange={v=>f("abdomen",v)} placeholder="--"/>
            <Inp label="Cintura" type="number" step="0.1" value={aval.cintura} onChange={v=>f("cintura",v)} placeholder="--"/>
            <Inp label="Quadril" type="number" step="0.1" value={aval.quadril} onChange={v=>f("quadril",v)} placeholder="--"/>
          </div>
          <Divider label="Membros Inferiores"/>
          <div style={{...css.row("repeat(auto-fill,minmax(120px,1fr))"),margin:"10px 0 0"}}>
            <Inp label="Coxa Dir Supra" type="number" step="0.1" value={aval.coxaDirSupra} onChange={v=>f("coxaDirSupra",v)} placeholder="--"/>
            <Inp label="Coxa Dir Infra" type="number" step="0.1" value={aval.coxaDirInfra} onChange={v=>f("coxaDirInfra",v)} placeholder="--"/>
            <Inp label="Coxa Dir Contr." type="number" step="0.1" value={aval.coxaDirInfContr} onChange={v=>f("coxaDirInfContr",v)} placeholder="--"/>
            <Inp label="Coxa Esq Supra" type="number" step="0.1" value={aval.coxaEsqSupra} onChange={v=>f("coxaEsqSupra",v)} placeholder="--"/>
            <Inp label="Coxa Esq Infra" type="number" step="0.1" value={aval.coxaEsqInfra} onChange={v=>f("coxaEsqInfra",v)} placeholder="--"/>
            <Inp label="Coxa Esq Contr." type="number" step="0.1" value={aval.coxaEsqInfContr} onChange={v=>f("coxaEsqInfContr",v)} placeholder="--"/>
            <Inp label="Panturrilha Dir" type="number" step="0.1" value={aval.panturrilhaDir} onChange={v=>f("panturrilhaDir",v)} placeholder="--"/>
            <Inp label="Panturrilha Esq" type="number" step="0.1" value={aval.panturrilhaEsq} onChange={v=>f("panturrilhaEsq",v)} placeholder="--"/>
          </div>
        </div>

        {/* Dobras cutâneas */}
        <div style={css.card}>
          <div style={css.secHdr}>Dobras Cutaneas (mm)</div>
          <div style={{background:"#121212",border:"1px solid #2e1e08",borderRadius:10,padding:"14px",marginBottom:14}}>
            <div style={css.row("repeat(auto-fill,minmax(110px,1fr))")}>
              <Inp label="Tríceps"      type="number" step="0.1" value={aval.dobTriceps}      onChange={v=>f("dobTriceps",v)}      placeholder="--"/>
              <Inp label="Bíceps"       type="number" step="0.1" value={aval.dobBiceps}       onChange={v=>f("dobBiceps",v)}       placeholder="--"/>
              <Inp label="Subescapular" type="number" step="0.1" value={aval.dobSubescapular} onChange={v=>f("dobSubescapular",v)} placeholder="--"/>
              <Inp label="Peitoral"     type="number" step="0.1" value={aval.dobPeitoral}     onChange={v=>f("dobPeitoral",v)}     placeholder="--"/>
              <Inp label="Suprailiaca"  type="number" step="0.1" value={aval.dobSuprailiaca}  onChange={v=>f("dobSuprailiaca",v)}  placeholder="--"/>
              <Inp label="Abdômen"      type="number" step="0.1" value={aval.dobAbdomen}      onChange={v=>f("dobAbdomen",v)}      placeholder="--"/>
              <Inp label="Coxa"         type="number" step="0.1" value={aval.dobCoxa}         onChange={v=>f("dobCoxa",v)}         placeholder="--"/>
              <Inp label="Panturrilha"  type="number" step="0.1" value={aval.dobPanturrilha}  onChange={v=>f("dobPanturrilha",v)}  placeholder="--"/>
            </div>
          </div>

          {/* Resultados em tempo real */}
          {poll?(()=>{
            const pn=parseFloat(aval.peso)||0;
            const pct=parseFloat(poll.pct);
            const pg2=pn?(pn*pct/100).toFixed(1):null;
            const mm=pn?(pn-pn*pct/100).toFixed(1):null;
            const gordIdeal=20; // mesmo percentual (20%) para ambos os sexos, validado com a planilha oficial
            const pi=mm?(parseFloat(mm)/(1-gordIdeal/100)).toFixed(1):null;
            const pe=pi?(pn-parseFloat(pi)).toFixed(1):null;
            return(
              <div style={{background:"#0a0a0a",border:"1px solid #3d2010",borderRadius:10,padding:14}}>
                <div style={{fontSize:10,fontWeight:700,color:C.sectionHdr,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Resultados Pollock</div>
                <div style={css.row("repeat(auto-fill,minmax(110px,1fr))")}>
                  {[
                    {l:"Somatorio",v:poll.soma+" mm",c:"#c2cdd8"},
                    {l:"% Gordura",v:poll.pct+"%",c:C.yellow},
                    {l:"Massa Magra",v:mm?mm+" kg":"--",c:C.green},
                    {l:"Peso Gordo",v:pg2?pg2+" kg":"--",c:C.red},
                    {l:"Peso Ideal",v:pi?pi+" kg":"--",c:C.accent},
                    {l:"Excesso",v:pe?(parseFloat(pe)>0?"+":"")+pe+" kg":"--",c:parseFloat(pe||0)>0?"#fb923c":C.green},
                  ].map(s=>(
                    <div key={s.l} style={{textAlign:"center",padding:"6px 4px",background:"#141414",borderRadius:8}}>
                      <div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div>
                      <div style={{fontSize:9,color:"#c4b3a3",marginTop:2}}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
          :<div style={{fontSize:12,color:C.muted,padding:"10px 14px",background:"#121212",borderRadius:8}}>
            Preencha as dobras e o peso para calcular automaticamente.
          </div>}
        </div>

        {/* Botão salvar no final */}
        <button onClick={salvar}
          style={{...css.btnA,width:"100%",padding:"15px",fontSize:15,marginBottom:20,
            background:salvou?"linear-gradient(135deg,#059669,#34d399)":"linear-gradient(135deg,#f97316,#e05a00)"}}>
          {salvou?"✓ Avaliação salva! Pronto para nova avaliação":"Salvar Avaliação"}
        </button>

      </div>
    </div>
  );
}


// ── AGENDA DE HORARIOS ────────────────────────────────────────────────────────

// Célula individual: aberta, vaga (amarela) ou ocupada com nome
function AgendaCelula({valor, onChange, alunos, onAbrirAluno, podeEditarObs}){
  const [editando,setEditando]=useState(false);
  const [texto,setTexto]=useState(valor?.nome||"");
  const [editandoObs,setEditandoObs]=useState(false);
  const [textoObs,setTextoObs]=useState(valor?.obs||"");
  const [pressionando,setPressionando]=useState(false);
  const [menuAberto,setMenuAberto]=useState(false);
  const longPressTimer=useRef(null);
  const longPressDisparado=useRef(false);

  // status: "bloqueado" (vermelho vivo) ou nada (vago por padrao, amarelo). Se tem nome = ocupado.
  const bloqueado = valor?.status === "bloqueado";
  const nome = valor?.nome || "";
  const obs = valor?.obs || "";
  const ocupado = !!nome;

  // Tenta encontrar o aluno correspondente pelo nome (case-insensitive, match exato ou parcial)
  const alunoEncontrado = ocupado && alunos ? (
    alunos.find(a=>a.nome.trim().toLowerCase()===nome.trim().toLowerCase())
    || alunos.find(a=>a.nome.trim().toLowerCase().includes(nome.trim().toLowerCase()))
  ) : null;

  const bg = ocupado ? "#161010"
    : bloqueado ? "#ef4444"
    : "#fbbf24";
  const border = ocupado ? "#2a1a08"
    : bloqueado ? "#ef4444"
    : "#fbbf24";
  const textColor = ocupado ? C.text : "#0a0a0a";

  const bloquear = ()=>{
    onChange({...valor, status:"bloqueado", nome:""});
    setMenuAberto(false);
  };
  const desbloquear = ()=>{
    onChange({...valor, status:"", nome:""});
    setMenuAberto(false);
  };
  const limparOcupacao = ()=>{
    onChange({status:"", nome:"", obs:""});
    setMenuAberto(false);
  };
  const abrirEdicaoObs = ()=>{
    if(!podeEditarObs) return;
    setTextoObs(obs);
    setEditandoObs(true);
    setMenuAberto(false);
  };

  const iniciarPress = ()=>{
    longPressDisparado.current=false;
    setPressionando(true);
    longPressTimer.current=setTimeout(()=>{
      longPressDisparado.current=true;
      setPressionando(false);
      if(navigator.vibrate) navigator.vibrate(30);
      setMenuAberto(true);
    },500);
  };

  const cancelarPress = ()=>{
    setPressionando(false);
    if(longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if(editandoObs){
    return(
      <div style={{position:"relative"}}>
        <textarea
          autoFocus
          value={textoObs}
          onChange={e=>setTextoObs(e.target.value)}
          onBlur={()=>{
            onChange({...valor, obs:textoObs.trim()});
            setEditandoObs(false);
          }}
          onKeyDown={e=>{
            if(e.key==="Escape"){ setTextoObs(obs); setEditandoObs(false); }
          }}
          placeholder="Observação para este horário..."
          rows={2}
          style={{width:"100%",boxSizing:"border-box",background:"#0a0a0a",
            border:"1px solid #fbbf24",borderRadius:6,padding:"6px 8px",
            fontSize:16,color:C.text,outline:"none",fontFamily:"Inter,sans-serif",resize:"vertical"}}
        />
      </div>
    );
  }

  if(editando){
    return(
      <div style={{position:"relative"}}>
        <input
          autoFocus
          value={texto}
          onChange={e=>setTexto(e.target.value)}
          onBlur={()=>{
            onChange({...valor, status:"", nome:texto.trim()});
            setEditando(false);
          }}
          onKeyDown={e=>{
            if(e.key==="Enter"){ e.currentTarget.blur(); }
            if(e.key==="Escape"){ setTexto(nome); setEditando(false); }
          }}
          style={{width:"100%",boxSizing:"border-box",background:"#0a0a0a",
            border:"1px solid "+C.accent,borderRadius:6,padding:"6px 8px",
            fontSize:16,color:C.text,outline:"none",fontFamily:"Inter,sans-serif"}}
        />
      </div>
    );
  }

  return(
    <div style={{position:"relative"}}>
      <div
        style={{
          background:bg, border:"1px solid "+border, borderRadius:6,
          padding:"7px 8px", minHeight:32, display:"flex", flexDirection:"column", gap:2,
          transform:pressionando?"scale(0.97)":"scale(1)",
          transition:"transform .15s, border-color .15s",
        }}
      >
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div
            onClick={()=>{
              if(longPressDisparado.current){ longPressDisparado.current=false; return; }
              if(bloqueado) return; // não abre edição em célula bloqueada
              setTexto(nome); setEditando(true);
            }}
            onTouchStart={iniciarPress}
            onTouchEnd={cancelarPress}
            onTouchMove={cancelarPress}
            onTouchCancel={cancelarPress}
            onMouseDown={iniciarPress}
            onMouseUp={cancelarPress}
            onMouseLeave={cancelarPress}
            onContextMenu={e=>{ e.preventDefault(); setMenuAberto(true); }}
            style={{
              flex:1, cursor:"pointer", fontSize:12, fontWeight:700, color:textColor,
              overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
              WebkitUserSelect:"none", userSelect:"none", WebkitTouchCallout:"none",
            }}
          >
            {nome || (bloqueado ? "Bloqueado" : "Vago")}
          </div>

          {/* Indicador de observação existente */}
          {obs&&(
            <span title={obs} style={{fontSize:12,flexShrink:0}}>📝</span>
          )}

          {/* Botão para abrir a ficha do aluno, se encontrado */}
          {alunoEncontrado&&(
            <button
              onClick={(e)=>{ e.stopPropagation(); onAbrirAluno(alunoEncontrado); }}
              title="Abrir ficha do aluno"
              style={{
                background:"#f97316", border:"none", borderRadius:5,
                width:22, height:22, flexShrink:0, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center",
                color:"#fff", fontSize:12, fontWeight:800, fontFamily:"Inter,sans-serif",
                padding:0,
              }}
            >
              →
            </button>
          )}
        </div>
        {obs&&(
          <div style={{fontSize:10,color:textColor+"cc",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {obs}
          </div>
        )}
      </div>

      {/* Menu de opções (aparece com toque longo) */}
      {menuAberto&&(
        <>
          <div onClick={()=>setMenuAberto(false)}
            style={{position:"fixed",inset:0,zIndex:299}}/>
          <div style={{
            position:"absolute", top:"100%", left:0, marginTop:4, zIndex:300,
            background:"#1c1c1c", border:"1px solid #3d2010", borderRadius:10,
            boxShadow:"0 8px 24px #000000cc", padding:6, minWidth:170,
            display:"flex", flexDirection:"column", gap:4,
          }}>
            <button onClick={abrirEdicaoObs}
              disabled={!podeEditarObs}
              style={{background:podeEditarObs?"#242424":"#1a1a1a", color:podeEditarObs?C.text:C.muted,
                border:"1px solid "+(podeEditarObs?"#3d2010":"#2a1a08"), borderRadius:7,
                padding:"9px 12px", fontWeight:700, fontSize:13, cursor:podeEditarObs?"pointer":"default",
                fontFamily:"Inter,sans-serif", textAlign:"left"}}>
              📝 {podeEditarObs ? (obs?"Editar observação":"Adicionar observação") : (obs?"Ver observação (somente leitura)":"Sem permissão para observar")}
            </button>
            {!podeEditarObs&&obs&&(
              <div style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:7,padding:"8px 10px",fontSize:11,color:C.muted,fontStyle:"italic"}}>
                {obs}
              </div>
            )}
            {ocupado&&(
              <button onClick={limparOcupacao}
                style={{background:"#fbbf24", color:"#0a0a0a", border:"none", borderRadius:7,
                  padding:"9px 12px", fontWeight:800, fontSize:13, cursor:"pointer",
                  fontFamily:"Inter,sans-serif", textAlign:"left"}}>
                🟡 Liberar (Vago)
              </button>
            )}
            {!ocupado&&!bloqueado&&(
              <button onClick={bloquear}
                style={{background:"#ef4444", color:"#fff", border:"none", borderRadius:7,
                  padding:"9px 12px", fontWeight:800, fontSize:13, cursor:"pointer",
                  fontFamily:"Inter,sans-serif", textAlign:"left"}}>
                🔴 Bloquear
              </button>
            )}
            {bloqueado&&(
              <button onClick={desbloquear}
                style={{background:"#fbbf24", color:"#0a0a0a", border:"none", borderRadius:7,
                  padding:"9px 12px", fontWeight:800, fontSize:13, cursor:"pointer",
                  fontFamily:"Inter,sans-serif", textAlign:"left"}}>
                🟡 Desbloquear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AgendaGridView({prof, agenda, onUpdateCelula, onUpdateHorariosPorDia, onVoltar, alunos, onAbrirAluno, podeEditarObs}){
  const [diaAtivo,setDiaAtivo]=useState(AGENDA_DIAS[0]);
  const [novoHorario,setNovoHorario]=useState("");
  const [diasParaAdicionar,setDiasParaAdicionar]=useState([]); // dias extras selecionados no formulário
  const [confirmarRemover,setConfirmarRemover]=useState(null);
  const [salvandoHorario,setSalvandoHorario]=useState(false);

  // Horários agora são por dia: agenda.horariosPorDia[dia] = ["06H","07H",...]
  // Cada dia começa vazio até o profissional adicionar manualmente.
  const horariosPorDia = agenda?.horariosPorDia || {};
  const horariosDoDia = horariosPorDia[diaAtivo] || [];

  const getCelula = (dia,hora,slot) => {
    const key = `${dia}_${hora}_${slot}`;
    return agenda?.[key] || null;
  };

  const setCelula = (dia,hora,slot,val) => {
    const key = `${dia}_${hora}_${slot}`;
    onUpdateCelula(key, val);
  };

  const toggleDiaParaAdicionar = (dia)=>{
    setDiasParaAdicionar(prev=>
      prev.includes(dia) ? prev.filter(d=>d!==dia) : [...prev, dia]
    );
  };

  const adicionarHorario = async ()=>{
    const h = novoHorario.trim().toUpperCase();
    if(!h) return;
    if(diasParaAdicionar.length===0) return;
    // Aceita formatos como "05H", "13H30", "5H" -> normaliza levemente
    const formatado = h.endsWith("H") || /H\d/.test(h) ? h : h+"H";

    setSalvandoHorario(true);
    try{
      // IMPORTANTE: aguarda cada dia terminar antes de ir para o proximo.
      // Como onUpdateHorariosPorDia le o documento, modifica e grava de volta,
      // rodar todos os dias ao mesmo tempo causa "corrida": a ultima chamada
      // sobrescreve o resultado das anteriores e alguns dias somem.
      for(const dia of diasParaAdicionar){
        const listaAtual = horariosPorDia[dia] || [];
        if(listaAtual.includes(formatado)) continue;
        const novaLista = [...listaAtual, formatado].sort((a,b)=>{
          const numA = parseInt(a) || 0;
          const numB = parseInt(b) || 0;
          return numA - numB;
        });
        await onUpdateHorariosPorDia(dia, novaLista);
      }
    }finally{
      setSalvandoHorario(false);
    }

    setNovoHorario("");
  };

  const removerHorario = async (hora)=>{
    const novaLista = horariosDoDia.filter(h=>h!==hora);
    await onUpdateHorariosPorDia(diaAtivo, novaLista);
    // Limpa também as células desse horário nesse dia especificamente
    for(let slot=0; slot<AGENDA_SLOTS_POR_HORA; slot++){
      const key = `${diaAtivo}_${hora}_${slot}`;
      if(agenda?.[key]) onUpdateCelula(key, {status:"",nome:""});
    }
    setConfirmarRemover(null);
  };

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:700,fontSize:14}}>{prof.nome}</div>
          <div style={{fontSize:10,color:C.muted}}>Agenda de Horarios</div>
        </div>
        <div style={{width:70}}/>
      </header>

      <div style={css.wrap}>
        {/* Legenda */}
        <div style={{display:"flex",gap:14,marginBottom:16,flexWrap:"wrap"}}>
          {[
            {c:"#fbbf24",bg:"#fbbf24",l:"Vago"},
            {c:"#ef4444",bg:"#ef4444",l:"Bloqueado"},
            {c:C.text,bg:"#161010",l:"Ocupado"},
          ].map(item=>(
            <div key={item.l} style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:14,height:14,borderRadius:4,background:item.bg,border:"1px solid "+item.c+"60"}}/>
              <span style={{fontSize:11,color:C.muted}}>{item.l}</span>
            </div>
          ))}
        </div>
        <div style={{fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.6}}>
          Toque numa celula para ocupar com o nome do aluno. Segure por meio segundo para Bloquear/Desbloquear ou adicionar uma observacao. Cada dia da semana tem seus proprios horarios, configurados de forma independente.
        </div>

        {/* Abas de dias */}
        <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:16,paddingBottom:4}}>
          {AGENDA_DIAS.map(d=>{
            const qtd = (horariosPorDia[d]||[]).length;
            return(
              <button key={d} onClick={()=>setDiaAtivo(d)}
                style={{...css.tabBtn(diaAtivo===d),padding:"9px 14px",fontSize:12,flexShrink:0}}>
                {AGENDA_DIAS_ABREV[d]}{qtd>0?` (${qtd})`:""}
              </button>
            );
          })}
        </div>

        {/* Grade do dia selecionado — horários próprios desse dia */}
        {horariosDoDia.map(hora=>(
          <div key={hora} style={{marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{fontSize:12,fontWeight:800,color:C.accent,minWidth:44}}>{hora}</div>
              <div style={{flex:1,height:1,background:"#2a1a08"}}/>
              <button onClick={()=>setConfirmarRemover(hora)}
                style={{background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:6,
                  width:22,height:22,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                ×
              </button>
            </div>
            <div style={{display:"grid",gap:6}}>
              {Array.from({length:AGENDA_SLOTS_POR_HORA},(_,slot)=>{
                const val = getCelula(diaAtivo,hora,slot);
                return(
                  <AgendaCelula key={slot} valor={val}
                    onChange={(novoVal)=>setCelula(diaAtivo,hora,slot,novoVal)}
                    alunos={alunos} onAbrirAluno={onAbrirAluno} podeEditarObs={podeEditarObs}/>
                );
              })}
            </div>
          </div>
        ))}

        {horariosDoDia.length===0&&(
          <div style={{textAlign:"center",color:C.muted,padding:"24px 0",fontSize:13}}>
            Nenhum horário cadastrado para {AGENDA_DIAS_ABREV[diaAtivo]}. Adicione o primeiro abaixo.
          </div>
        )}

        {/* Adicionar novo horário — todos os dias selecionaveis na mesma caixa */}
        <div style={{...css.card,background:"#0a1a10",border:"1px solid #34d39940",marginTop:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>
            + Adicionar horário
          </div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input
              value={novoHorario}
              onChange={e=>setNovoHorario(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") adicionarHorario(); }}
              placeholder="Ex: 05H, 13H30, 20H"
              style={{...css.input,flex:1}}
            />
            <button onClick={adicionarHorario}
              disabled={!novoHorario.trim()||diasParaAdicionar.length===0||salvandoHorario}
              style={{...css.btnA,padding:"10px 18px",fontSize:13,flexShrink:0,
                opacity:(!novoHorario.trim()||diasParaAdicionar.length===0||salvandoHorario)?.5:1}}>
              {salvandoHorario?"Salvando...":"Adicionar"}
            </button>
          </div>

          <div style={{fontSize:10,color:"#e8cba8",fontWeight:700,textTransform:"uppercase",letterSpacing:.6,marginBottom:8}}>
            Selecione os dias
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {AGENDA_DIAS.map(d=>{
              const marcado = diasParaAdicionar.includes(d);
              return(
                <button key={d} onClick={()=>toggleDiaParaAdicionar(d)}
                  style={{
                    background:marcado?"#34d399":"#161010",
                    color:marcado?"#0a0a0a":C.muted,
                    border:"1px solid "+(marcado?"#34d399":"#2a1a08"),
                    borderRadius:8,padding:"7px 12px",fontWeight:700,fontSize:11,
                    cursor:"pointer",fontFamily:"Inter,sans-serif",
                  }}>
                  {marcado?"✓ ":""}{AGENDA_DIAS_ABREV[d]}
                </button>
              );
            })}
          </div>

          <div style={{fontSize:11,color:C.muted}}>
            {diasParaAdicionar.length>0
              ? `O horario sera adicionado em: ${diasParaAdicionar.map(d=>AGENDA_DIAS_ABREV[d]).join(", ")}.`
              : `Selecione ao menos um dia para adicionar o horario.`}
          </div>
        </div>
      </div>

      {/* Modal confirmação remoção de horário */}
      {confirmarRemover&&(
        <Modal title="Remover horário?" onClose={()=>setConfirmarRemover(null)}
          onConfirm={()=>removerHorario(confirmarRemover)}
          confirmLabel="Remover" danger>
          <p style={{color:C.muted,fontSize:13,textAlign:"center",margin:"6px 0"}}>
            O horario <strong style={{color:C.text}}>{confirmarRemover}</strong> sera removido de <strong style={{color:C.text}}>{AGENDA_DIAS_ABREV[diaAtivo]}</strong>, incluindo alunos ja marcados nesse horario nesse dia. Os outros dias nao serao afetados.
          </p>
        </Modal>
      )}
    </div>
  );
}

function AgendaSelecaoView({profissionais, onSelect, onVoltar, onBuscar}){
  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Agenda de Horarios</div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>
        {/* Botão de busca de vagas */}
        <button onClick={onBuscar}
          style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:12,
            padding:"14px 16px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:16,
            display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#34d39920",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🔍</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#34d399"}}>Buscar Horarios Vagos</div>
            <div style={{fontSize:11,color:C.muted}}>Filtrar por dias e horario entre todos os profissionais</div>
          </div>
          <span style={{color:"#34d399",fontSize:20}}>›</span>
        </button>

        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
          Selecione um profissional para ver ou editar a agenda.
        </div>
        <div style={{display:"grid",gap:10}}>
          {[...profissionais].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(p=>(
            <button key={p.id} onClick={()=>onSelect(p)}
              style={{background:C.card,border:"1px solid #2e1e0a",borderRadius:12,padding:"14px 16px",
                display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%"}}>
              <Avatar nome={p.nome} foto={p.foto} size={44}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15,color:C.text}}>{p.nome}</div>
              </div>
              <span style={{color:"#34d399",fontSize:20}}>›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaBuscaView({profissionais, agendas, onVoltar, onAbrirAgenda}){
  const [diasSel,setDiasSel]=useState([]);
  const [horaSel,setHoraSel]=useState("");

  // Junta todos os horários possíveis de todos os dias/profissionais configurados,
  // para popular os botões de horário na busca. Cada dia tem sua própria lista agora.
  const todosHorarios = useMemo(()=>{
    const set = new Set();
    profissionais.forEach(prof=>{
      const agendaProf = agendas?.[prof.id];
      const horariosPorDia = agendaProf?.horariosPorDia || {};
      Object.values(horariosPorDia).forEach(lista=>{
        (lista||[]).forEach(h=>set.add(h));
      });
    });
    if(set.size===0) AGENDA_HORARIOS_PADRAO.forEach(h=>set.add(h));
    return Array.from(set).sort((a,b)=>(parseInt(a)||0)-(parseInt(b)||0));
  }, [agendas, profissionais]);

  const toggleDia = (dia)=>{
    setDiasSel(prev=> prev.includes(dia) ? prev.filter(d=>d!==dia) : [...prev, dia]);
  };

  // Calcula, para cada profissional, quantos slots vagos existem em CADA dia selecionado no horário escolhido.
  // Agora verifica se o profissional configurou esse horário especificamente naquele dia.
  const resultados = useMemo(()=>{
    if(!horaSel || diasSel.length===0) return [];
    return profissionais.map(prof=>{
      const agendaProf = agendas?.[prof.id] || {};
      const horariosPorDia = agendaProf.horariosPorDia || {};

      const porDia = {};
      let totalVagas = 0;
      let atendeAoMenosUmDia = false;

      diasSel.forEach(dia=>{
        const horariosDoDia = horariosPorDia[dia] || [];
        if(!horariosDoDia.includes(horaSel)){
          porDia[dia] = -1; // -1 = não atende nesse dia/horário
          return;
        }
        atendeAoMenosUmDia = true;
        let vagasNoDia = 0;
        for(let slot=0; slot<AGENDA_SLOTS_POR_HORA; slot++){
          const key = `${dia}_${horaSel}_${slot}`;
          const cel = agendaProf[key];
          const ocupado = cel && cel.nome;
          const bloqueado = cel && cel.status==="bloqueado";
          if(!ocupado && !bloqueado) vagasNoDia++;
        }
        porDia[dia] = vagasNoDia;
        totalVagas += vagasNoDia;
      });

      return {prof, atende:atendeAoMenosUmDia, porDia, totalVagas};
    }).filter(r=>r.atende)
      .sort((a,b)=> b.totalVagas - a.totalVagas);
  }, [profissionais, agendas, diasSel, horaSel]);

  // Só mostra profissionais que têm vaga em TODOS os dias selecionados (porDia > 0 em todos)
  const resultadosCompletos = resultados.filter(r=>
    diasSel.every(d=>r.porDia[d] > 0)
  );
  const resultadosParciais = resultados.filter(r=>
    !diasSel.every(d=>r.porDia[d] > 0) && diasSel.some(d=>r.porDia[d] > 0)
  );

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Buscar Vagas</div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>

        {/* Filtro de dias */}
        <div style={css.card}>
          <div style={css.secHdr}>Dias da Semana</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {AGENDA_DIAS.map(d=>{
              const ativo = diasSel.includes(d);
              return(
                <button key={d} onClick={()=>toggleDia(d)}
                  style={{
                    background:ativo?"#34d399":"#161010",
                    color:ativo?"#0a0a0a":C.muted,
                    border:"1px solid "+(ativo?"#34d399":"#2a1a08"),
                    borderRadius:8, padding:"9px 14px", fontWeight:700, fontSize:12,
                    cursor:"pointer", fontFamily:"Inter,sans-serif",
                  }}>
                  {AGENDA_DIAS_ABREV[d]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filtro de horário */}
        <div style={css.card}>
          <div style={css.secHdr}>Horario</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {todosHorarios.map(h=>{
              const ativo = horaSel===h;
              return(
                <button key={h} onClick={()=>setHoraSel(ativo?"":h)}
                  style={{
                    background:ativo?C.accent:"#161010",
                    color:ativo?"#0a0a0a":C.muted,
                    border:"1px solid "+(ativo?C.accent:"#2a1a08"),
                    borderRadius:8, padding:"9px 14px", fontWeight:700, fontSize:12,
                    cursor:"pointer", fontFamily:"Inter,sans-serif",
                  }}>
                  {h}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resultados */}
        {(!horaSel || diasSel.length===0) ? (
          <div style={{...css.card,background:"#121212",textAlign:"center",padding:"28px 20px"}}>
            <div style={{fontSize:28,marginBottom:8}}>🔍</div>
            <div style={{fontSize:13,color:C.muted}}>Selecione ao menos um dia e um horário para buscar.</div>
          </div>
        ) : (
          <>
            {resultadosCompletos.length===0 && resultadosParciais.length===0 && (
              <div style={{...css.card,background:"#1a0808",border:"1px solid #7f1d1d30",textAlign:"center",padding:"24px 20px"}}>
                <div style={{fontSize:13,color:"#f87171",fontWeight:600}}>Nenhuma vaga encontrada</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>Nenhum profissional tem vaga em {AGENDA_DIAS_ABREV[diasSel[0]]||""} às {horaSel} para os dias selecionados.</div>
              </div>
            )}

            {resultadosCompletos.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
                  ✓ Vaga em todos os dias selecionados
                </div>
                {resultadosCompletos.map(r=>(
                  <button key={r.prof.id} onClick={()=>onAbrirAgenda(r.prof)}
                    style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:12,
                      padding:"12px 14px",marginBottom:8,cursor:"pointer",fontFamily:"Inter,sans-serif",
                      display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                    <Avatar nome={r.prof.nome} foto={r.prof.foto} size={40}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:C.text}}>{r.prof.nome}</div>
                      <div style={{fontSize:11,color:"#34d399",marginTop:2}}>
                        {diasSel.map(d=>`${AGENDA_DIAS_ABREV[d]}: ${r.porDia[d]} vaga${r.porDia[d]!==1?"s":""}`).join(" · ")}
                      </div>
                    </div>
                    <span style={{color:"#34d399",fontSize:18}}>›</span>
                  </button>
                ))}
              </div>
            )}

            {resultadosParciais.length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#fbbf24",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
                  ⚠ Vaga parcial (nem todos os dias)
                </div>
                {resultadosParciais.map(r=>(
                  <button key={r.prof.id} onClick={()=>onAbrirAgenda(r.prof)}
                    style={{width:"100%",background:"#1a1608",border:"1px solid #fbbf2440",borderRadius:12,
                      padding:"12px 14px",marginBottom:8,cursor:"pointer",fontFamily:"Inter,sans-serif",
                      display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
                    <Avatar nome={r.prof.nome} foto={r.prof.foto} size={40}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:C.text}}>{r.prof.nome}</div>
                      <div style={{fontSize:11,color:"#fbbf24",marginTop:2}}>
                        {diasSel.map(d=>`${AGENDA_DIAS_ABREV[d]}: ${r.porDia[d]>0?r.porDia[d]+" vaga"+(r.porDia[d]!==1?"s":""):"sem vaga"}`).join(" · ")}
                      </div>
                    </div>
                    <span style={{color:"#fbbf24",fontSize:18}}>›</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── ATALHO RAPIDO: avatares montados manualmente pelo profissional ───────────
// Persistem apenas durante o dia atual (resetam a cada novo dia).
const ATALHO_STORAGE_KEY = "fittrack_atalho_rapido";

function getAtalhoHoje(){
  try{
    const raw = localStorage.getItem(ATALHO_STORAGE_KEY);
    if(!raw) return [];
    const salvo = JSON.parse(raw);
    const hoje = new Date().toDateString();
    if(salvo.data !== hoje) return []; // dia mudou, reseta
    return salvo.itens || [];
  }catch(e){ return []; }
}

function salvarAtalhoHoje(itens){
  try{
    localStorage.setItem(ATALHO_STORAGE_KEY, JSON.stringify({
      data: new Date().toDateString(),
      itens,
    }));
  }catch(e){}
}

function AtalhoRapidoModal({alunos, profissionais, onClose, onAbrirTreinoDoAluno, onVisualizarTodos}){
  const [itens,setItens] = useState(()=>getAtalhoHoje());
  const [buscaAberta,setBuscaAberta] = useState(false);
  const [buscaTexto,setBuscaTexto] = useState("");
  const [alunoEscolhendoTreino,setAlunoEscolhendoTreino] = useState(null);

  const persistir = (novaLista)=>{
    setItens(novaLista);
    salvarAtalhoHoje(novaLista);
  };

  const adicionarItem = (aluno, letraTreino)=>{
    const novoItem = {
      alunoId: aluno.id,
      nome: aluno.nome,
      foto: aluno.foto,
      treino: letraTreino,
    };
    // Evita duplicar o mesmo aluno+treino
    const jaExiste = itens.some(it=>it.alunoId===aluno.id && it.treino===letraTreino);
    if(!jaExiste) persistir([...itens, novoItem]);
    setAlunoEscolhendoTreino(null);
    setBuscaAberta(false);
    setBuscaTexto("");
  };

  const removerItem = (idx)=>{
    persistir(itens.filter((_,i)=>i!==idx));
  };

  const getProfNome = (profId)=>{
    const p = profissionais.find(x=>x.id===profId);
    return p ? p.nome : "";
  };

  const resultadosBusca = buscaTexto.trim().length>=2
    ? alunos.filter(a=>a.nome.toLowerCase().includes(buscaTexto.toLowerCase())).slice(0,15)
    : [];

  // Treinos disponíveis do aluno escolhido para seleção
  const treinosDisponiveis = alunoEscolhendoTreino
    ? LETRAS.filter(l=>{
        const nome = alunoEscolhendoTreino["treino"+l];
        const blocos = alunoEscolhendoTreino["blocos"+l];
        return nome || (blocos && blocos.length>0);
      })
    : [];

  return(
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.card,border:"1px solid #34d39950",borderRadius:16,padding:20,width:"100%",maxWidth:440,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontWeight:800,fontSize:16,color:"#34d399"}}>⚡ Atalho Rapido</div>
          <button onClick={onClose} style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕</button>
        </div>
        <div style={{fontSize:12,color:C.muted,marginBottom:16}}>
          Monte aqui os alunos que voce vai atender hoje. Reseta automaticamente amanha.
        </div>

        {/* ── Tela: escolher treino do aluno selecionado ── */}
        {alunoEscolhendoTreino ? (
          <div style={{flex:1,overflowY:"auto"}}>
            <button onClick={()=>setAlunoEscolhendoTreino(null)}
              style={{...css.btnB,marginBottom:14,fontSize:12,padding:"8px 14px"}}>
              ← Voltar
            </button>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <Avatar nome={alunoEscolhendoTreino.nome} foto={alunoEscolhendoTreino.foto} size={44}/>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:C.text}}>{alunoEscolhendoTreino.nome}</div>
                <div style={{fontSize:11,color:C.muted}}>Escolha o treino</div>
              </div>
            </div>
            {treinosDisponiveis.length===0?(
              <div style={{textAlign:"center",color:"#f87171",padding:"20px 0",fontSize:13}}>
                Esse aluno nao tem treinos cadastrados.
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {treinosDisponiveis.map(l=>{
                  const cor = COR_LETRA[l];
                  const nomeTreino = alunoEscolhendoTreino["treino"+l];
                  return(
                    <button key={l} onClick={()=>adicionarItem(alunoEscolhendoTreino, l)}
                      style={{background:cor+"15",border:"1px solid "+cor+"50",borderRadius:12,
                        padding:"16px 12px",cursor:"pointer",fontFamily:"Inter,sans-serif",textAlign:"center"}}>
                      <div style={{fontSize:22,fontWeight:800,color:cor}}>Treino {l}</div>
                      {nomeTreino&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>{nomeTreino}</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : buscaAberta ? (
          /* ── Tela: buscar aluno para adicionar ── */
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
            <button onClick={()=>{setBuscaAberta(false);setBuscaTexto("");}}
              style={{...css.btnB,marginBottom:14,fontSize:12,padding:"8px 14px",alignSelf:"flex-start"}}>
              ← Voltar
            </button>
            <input
              autoFocus
              value={buscaTexto}
              onChange={e=>setBuscaTexto(e.target.value)}
              placeholder="Digite o nome do aluno..."
              style={{...css.input,padding:"12px 14px",fontSize:14,marginBottom:14}}
            />
            <div style={{flex:1,overflowY:"auto"}}>
              {buscaTexto.trim().length>=2&&resultadosBusca.length===0&&(
                <div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>Nenhum aluno encontrado.</div>
              )}
              <div style={{display:"grid",gap:8}}>
                {resultadosBusca.map(a=>(
                  <button key={a.id} onClick={()=>setAlunoEscolhendoTreino(a)}
                    style={{background:"#161010",border:"1px solid #2a1a08",borderRadius:12,padding:"11px 14px",
                      display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",width:"100%",
                      fontFamily:"Inter,sans-serif"}}>
                    <Avatar nome={a.nome} foto={a.foto} size={38}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>{a.nome}</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:1}}>{getProfNome(a.profissionalId)}</div>
                    </div>
                    <span style={{color:"#34d399",fontSize:18}}>›</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Tela principal: lista de avatares do dia ── */
          <div style={{flex:1,overflowY:"auto"}}>
            <button onClick={()=>setBuscaAberta(true)}
              style={{width:"100%",background:"#0a1a10",border:"1px dashed #34d39960",borderRadius:12,
                padding:"14px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:16,
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                color:"#34d399",fontWeight:700,fontSize:13}}>
              + Adicionar aluno
            </button>

            {itens.length>0&&(
              <button onClick={()=>onVisualizarTodos(itens)}
                style={{width:"100%",background:"linear-gradient(135deg,#f97316,#e05a00)",
                  border:"none",borderRadius:12,padding:"13px",cursor:"pointer",
                  fontFamily:"Inter,sans-serif",marginBottom:12,
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  color:"#fff",fontWeight:700,fontSize:13}}>
                👁 Visualizar Treinos ({itens.length})
              </button>
            )}

            {itens.length===0?(
              <div style={{textAlign:"center",color:C.muted,padding:"24px 0",fontSize:13}}>
                Nenhum aluno adicionado ainda hoje.
              </div>
            ):(
              <div style={{display:"grid",gap:10}}>
                {itens.map((it,idx)=>{
                  const aluno = alunos.find(a=>a.id===it.alunoId);
                  const cor = COR_LETRA[it.treino] || C.accent;
                  return(
                    <div key={idx} style={{background:"#161010",border:"1px solid #2a1a08",borderRadius:12,
                      padding:"11px 14px",display:"flex",alignItems:"center",gap:12}}>
                      <button onClick={()=>{ if(aluno) onAbrirTreinoDoAluno(aluno); }}
                        style={{background:"transparent",border:"none",cursor:aluno?"pointer":"default",
                          display:"flex",alignItems:"center",gap:12,flex:1,minWidth:0,
                          fontFamily:"Inter,sans-serif",textAlign:"left",padding:0}}>
                        <Avatar nome={it.nome} foto={it.foto} size={40}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:14,color:C.text,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{it.nome}</div>
                          <div style={{fontSize:11,color:cor,fontWeight:600,marginTop:2}}>Treino {it.treino}</div>
                        </div>
                      </button>
                      <button onClick={()=>removerItem(idx)}
                        style={{background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:6,
                          width:26,height:26,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",
                          flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── VISUALIZACAO DOS TREINOS DO ATALHO RAPIDO ─────────────────────────────────
// Tela com abas fixas (uma por aluno adicionado) para alternar rapidamente
// entre os treinos sem precisar sair e voltar ao Atalho Rapido.
function AtalhoVisualizacaoView({itens, alunos, onVoltar}){
  const [idxAtivo,setIdxAtivo] = useState(0);

  // Resolve o cadastro completo de cada item (nome+treino) para o aluno real
  const itensResolvidos = itens.map(it=>({
    ...it,
    aluno: alunos.find(a=>a.id===it.alunoId),
  })).filter(it=>it.aluno);

  if(itensResolvidos.length===0){
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
          <div style={{fontWeight:700,fontSize:15}}>Visualizacao</div>
          <div style={{width:70}}/>
        </header>
        <div style={css.wrap}>
          <div style={{textAlign:"center",color:C.muted,padding:"40px 0",fontSize:13}}>
            Nenhum aluno disponível para visualizar.
          </div>
        </div>
      </div>
    );
  }

  const atual = itensResolvidos[Math.min(idxAtivo, itensResolvidos.length-1)];
  const cor = COR_LETRA[atual.treino] || C.accent;

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Atalho Rapido</div>
        <div style={{width:70}}/>
      </header>

      {/* Abas fixas com os alunos — clique alterna instantaneamente */}
      <div style={{background:"#0a0a0a",borderBottom:"1px solid #2a1a08",padding:"12px 16px",
        display:"flex",gap:8,overflowX:"auto",position:"sticky",top:0,zIndex:10}}>
        {itensResolvidos.map((it,idx)=>{
          const ativo = idx===idxAtivo;
          const corIt = COR_LETRA[it.treino] || C.accent;
          return(
            <button key={idx} onClick={()=>setIdxAtivo(idx)}
              style={{
                background:ativo?corIt+"20":"#161010",
                border:"1px solid "+(ativo?corIt:"#2a1a08"),
                borderRadius:12,padding:"8px 12px",cursor:"pointer",
                fontFamily:"Inter,sans-serif",flexShrink:0,
                display:"flex",alignItems:"center",gap:8,
              }}>
              <Avatar nome={it.nome} foto={it.foto} size={28}/>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:12,fontWeight:700,color:ativo?corIt:C.text,whiteSpace:"nowrap"}}>
                  {it.nome.split(" ")[0]}
                </div>
                <div style={{fontSize:9,color:ativo?corIt:C.muted}}>Treino {it.treino}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Treino do aluno selecionado */}
      <div style={css.wrap}>
        <div style={{...css.card,background:cor+"10",border:"1px solid "+cor+"30",display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <Avatar nome={atual.nome} foto={atual.foto} size={44}/>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:C.text}}>{atual.nome}</div>
            <div style={{fontSize:12,color:cor,fontWeight:600}}>Treino {atual.treino}</div>
          </div>
        </div>
        <TreinoAlunoView aluno={atual.aluno} treinoInicial={atual.treino}/>
      </div>
    </div>
  );
}

// ── BUSCA GLOBAL DE ALUNO ─────────────────────────────────────────────────────
function BuscaGlobalModal({alunos, profissionais, texto, onTexto, onClose, onAbrirAluno}){
  const resultados = texto.trim().length>=2
    ? alunos.filter(a=>a.nome.toLowerCase().includes(texto.toLowerCase())).slice(0,20)
    : [];

  const getProfNome = (profId)=>{
    const p = profissionais.find(x=>x.id===profId);
    return p ? p.nome : "Sem profissional";
  };

  return(
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,paddingTop:60}}>
      <div style={{background:C.card,border:"1px solid #34d39950",borderRadius:16,padding:20,width:"100%",maxWidth:480,maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontWeight:800,fontSize:16,color:"#34d399"}}>🔍 Buscar Aluno</div>
          <button onClick={onClose} style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕</button>
        </div>

        <input
          autoFocus
          value={texto}
          onChange={e=>onTexto(e.target.value)}
          placeholder="Digite o nome do aluno..."
          style={{...css.input,padding:"12px 14px",fontSize:15,marginBottom:14}}
        />

        <div style={{flex:1,overflowY:"auto"}}>
          {texto.trim().length>=2&&resultados.length===0&&(
            <div style={{textAlign:"center",color:C.muted,padding:"24px 0",fontSize:13}}>
              Nenhum aluno encontrado com esse nome.
            </div>
          )}
          {texto.trim().length>0&&texto.trim().length<2&&(
            <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"12px 0"}}>
              Digite pelo menos 2 letras para buscar.
            </div>
          )}
          {texto.trim().length===0&&(
            <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"24px 0"}}>
              Digite o nome de um aluno de qualquer profissional.
            </div>
          )}
          <div style={{display:"grid",gap:8}}>
            {resultados.map(a=>(
              <button key={a.id} onClick={()=>onAbrirAluno(a)}
                style={{background:"#161010",border:"1px solid #2a1a08",borderRadius:12,padding:"12px 14px",
                  display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",width:"100%",
                  fontFamily:"Inter,sans-serif"}}>
                <Avatar nome={a.nome} foto={a.foto} size={40}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.text}}>{a.nome}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {getProfNome(a.profissionalId)} · {a.objetivo||"--"}
                  </div>
                </div>
                <span style={{color:"#34d399",fontSize:18}}>›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FORMULARIO PUBLICO DE AUTO-CADASTRO (via link) ────────────────────────────
// Tela publica, sem necessidade de login, acessada pelo aluno atraves do link
// gerado pelo profissional. NAO inclui campos de mensalidade — isso e definido
// exclusivamente pelo profissional dentro do app.
function FormularioPublicoAluno({convite, onEnviar}){
  const [form,setForm]=useState({
    ...emptyForm,
    nome: convite.nomeAluno||"",
    email: convite.emailAluno||"",
  });
  const [enviado,setEnviado]=useState(false);
  const [erro,setErro]=useState("");
  const u=(k,v)=>setForm(p=>({...p,[k]:v}));

  const enviar=()=>{
    if(!form.nome.trim()){ setErro("Por favor, preencha seu nome completo."); return; }
    setErro("");
    onEnviar(form);
    setEnviado(true);
  };

  if(enviado){
    return(
      <div style={css.app}><GF/>
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20,background:"radial-gradient(ellipse at top,#1a0800 0%,#0a0a0a 60%)"}}>
          <div style={{...css.card,maxWidth:420,width:"100%",padding:32,textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:16}}>✅</div>
            <div style={{fontWeight:800,fontSize:20,color:"#34d399",marginBottom:10}}>Cadastro enviado!</div>
            <div style={{fontSize:14,color:C.muted,lineHeight:1.7}}>
              Obrigado, {form.nome.split(" ")[0]}! Seus dados foram enviados para {convite.profissionalNome||"seu personal"}.
              Em breve voce recebera mais informacoes sobre seu treino e avaliacao fisica.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><LogoUP size={36}/><div style={{fontWeight:800,fontSize:18,color:'#f97316'}}>UP <span style={{color:'#fbbf24'}}>Fitness</span></div></div>
        <div style={{fontSize:11,color:C.muted}}>Cadastro de Aluno</div>
      </header>

      <div style={css.wrap}>
        <div style={{...css.card,background:"#1a1008",border:"1px solid "+C.accent+"40",marginBottom:16}}>
          <div style={{fontSize:13,color:C.text,lineHeight:1.7}}>
            👋 Ola! Preencha seus dados abaixo para iniciar seu cadastro com <strong>{convite.profissionalNome||"seu personal"}</strong>.
            Seu profissional ira completar sua avaliacao fisica e prescrever seu treino em seguida.
          </div>
        </div>

        {erro&&(
          <div style={{background:"#1a0808",border:"1px solid #7f1d1d60",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
            <div style={{fontSize:12,color:"#f87171",fontWeight:600}}>⚠ {erro}</div>
          </div>
        )}

        {/* Dados Pessoais */}
        <div style={css.card}>
          <div style={css.secHdr}>Dados Pessoais</div>
          <Inp label="Nome completo *" value={form.nome} onChange={v=>u("nome",v)} placeholder="Seu nome completo"/>
          <div style={{...css.row("1fr 1fr"),marginTop:10}}>
            <Sel label="Sexo" value={form.sexo} onChange={v=>u("sexo",v)} opts={["Masculino","Feminino","Outro"]}/>
            <Inp label="Idade" type="number" value={form.idade} onChange={v=>u("idade",v)} placeholder="30"/>
          </div>
          <div style={{marginTop:10}}>
            <DateScrollPicker label="Data de nascimento" value={form.dataNasc} onChange={v=>u("dataNasc",v)}/>
          </div>
          <div style={{...css.row("1fr 1fr"),marginTop:10}}>
            <Inp label="Telefone / WhatsApp" value={form.telefone} onChange={v=>u("telefone",v)} placeholder="(11) 99999-9999"/>
            <Inp label="E-mail" value={form.email} onChange={v=>u("email",v)} placeholder="voce@email.com"/>
          </div>
          <div style={{...css.row("1fr 1fr"),marginTop:10}}>
            <Inp label="Contato emergência" value={form.nomeEmergencia} onChange={v=>u("nomeEmergencia",v)} placeholder="Nome"/>
            <Inp label="Tel. emergência" value={form.telEmergencia} onChange={v=>u("telEmergencia",v)} placeholder="(11) 99999-9999"/>
          </div>
          <div style={{marginTop:10}}>
            <Inp label="Endereço" value={form.endereco} onChange={v=>u("endereco",v)} placeholder="Rua, número - Bairro, Cidade/UF"/>
          </div>
          <div style={{...css.row("repeat(auto-fill,minmax(130px,1fr))"),marginTop:10}}>
            <Inp label="Profissão" value={form.profissao} onChange={v=>u("profissao",v)} placeholder="Ex: Professor"/>
            <Sel label="Objetivo principal" value={form.objetivo} onChange={v=>u("objetivo",v)} opts={OBJETIVOS}/>
            <Sel label="Nível de atividade" value={form.nivelAtividade} onChange={v=>u("nivelAtividade",v)} opts={NIVEIS_AT}/>
          </div>
        </div>

        {/* Anamnese */}
        <div style={{...css.card,background:"#191208",border:"1px solid #3d2a10"}}>
          <div style={css.secHdr}>Saúde / Anamnese</div>
          <div style={{display:"grid",gap:14}}>
            <TA label="Doenças / Condições de saúde" value={form.doencas} onChange={v=>u("doencas",v)} placeholder="Ex: Diabetes, Hipertensão... (ou 'Nenhuma')" rows={2}/>
            <TA label="Medicamentos em uso" value={form.medicamentos} onChange={v=>u("medicamentos",v)} placeholder="Ex: Losartana... (ou 'Nenhum')" rows={2}/>
            <TA label="Lesões / Restrições físicas" value={form.lesoes} onChange={v=>u("lesoes",v)} placeholder="Ex: Hérnia de disco... (ou 'Nenhuma')" rows={2}/>
            <TA label="Alergias" value={form.alergias} onChange={v=>u("alergias",v)} placeholder="Ex: Dipirona... (ou 'Nenhuma')" rows={1}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Sel label="Fumante?" value={form.fumante} onChange={v=>u("fumante",v)} opts={["Não","Sim","Ex-fumante"]}/>
              <Sel label="Alcool?" value={form.alcool} onChange={v=>u("alcool",v)} opts={["Não","Social","Moderado","Frequente"]}/>
            </div>
            <Inp label="Prática alguma atividade física atualmente?" value={form.praticaEsporte} onChange={v=>u("praticaEsporte",v)} placeholder="Ex: Caminhada 3x/semana ou 'Não pratico'"/>
            <TA label="O que você espera alcançar?" value={form.objetivoAnamnese} onChange={v=>u("objetivoAnamnese",v)} placeholder="Conte um pouco sobre seus objetivos..." rows={3}/>
          </div>
        </div>

        <button onClick={enviar}
          style={{...css.btnA,width:"100%",padding:"15px",fontSize:15,marginBottom:24}}>
          Enviar Cadastro
        </button>
      </div>
    </div>
  );
}

// ── PLANILHA DE PAGAMENTOS ────────────────────────────────────────────────────
const MESES_NOME = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function chaveMesAtual(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function anoAtual(){
  return new Date().getFullYear();
}
function labelMes(chave){
  const [ano,mes] = chave.split("-");
  return `${MESES_NOME[parseInt(mes)-1]} ${ano}`;
}
function labelMesCurto(chave){
  const [,mes] = chave.split("-");
  return MESES_NOME[parseInt(mes)-1];
}
// Agrupa uma lista de chaves "AAAA-MM" por ano, retornando { "2026": ["2026-07","2026-06",...], ... }
function agruparChavesPorAno(chaves){
  const porAno = {};
  chaves.forEach(chave=>{
    const ano = chave.split("-")[0];
    if(!porAno[ano]) porAno[ano]=[];
    porAno[ano].push(chave);
  });
  Object.keys(porAno).forEach(ano=>{
    porAno[ano].sort().reverse();
  });
  return porAno;
}

// Monta as linhas iniciais da planilha de um profissional/mes: uma linha por
// aluno vinculado a ele, pre-preenchida com plano/valor do cadastro. O
// profissional pode editar valores manualmente ou adicionar linhas extras.
function montarLinhasIniciais(prof, alunos){
  return alunos
    .filter(a=>a.profissionalId===prof.id)
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    .map(a=>({
      id: `aluno_${a.id}`,
      alunoId: a.id,
      nome: a.nome,
      plano: a.plano||"",
      valor: a.valorMensalidade||"",
      pago: false,
    }));
}

// Mescla as linhas ja salvas de um mes com a carteira atual do profissional:
// mantem os dados ja editados (valor, plano, pago) das linhas existentes, e
// adiciona automaticamente alunos que passaram a fazer parte da carteira
// depois (por transferencia ou novo cadastro) e ainda nao tem linha no mes.
// Linhas manuais (sem alunoId) e de alunos que saíram da carteira permanecem
// intactas — a transferencia nunca apaga lancamentos ja feitos.
function mesclarLinhasComCarteira(linhasSalvas, prof, alunos){
  const base = linhasSalvas || [];
  const idsJaNaPlanilha = new Set(base.filter(l=>l.alunoId).map(l=>l.alunoId));
  const alunosDaCarteira = alunos.filter(a=>a.profissionalId===prof.id);
  const novasLinhas = alunosDaCarteira
    .filter(a=>!idsJaNaPlanilha.has(a.id))
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    .map(a=>({
      id: `aluno_${a.id}`,
      alunoId: a.id,
      nome: a.nome,
      plano: a.plano||"",
      valor: a.valorMensalidade||"",
      pago: false,
    }));
  return novasLinhas.length>0 ? [...base, ...novasLinhas] : base;
}

// Tela da planilha propriamente dita, para um mes especifico ja selecionado
function PlanilhaMesView({prof, mesAtivo, linhas, onUpdateLinhas, onVoltar, podeEditar, onBuscarOutroPeriodo, mostrarBotaoBuscar}){
  const [confirmarRemover,setConfirmarRemover] = useState(null); // idx da linha a remover

  const atualizarLinha = (idx, campo, valor)=>{
    if(!podeEditar) return;
    const novasLinhas = linhas.map((l,i)=> i===idx ? {...l,[campo]:valor} : l);
    onUpdateLinhas(novasLinhas);
  };

  const adicionarLinha = ()=>{
    if(!podeEditar) return;
    const novaLinha = { id:`manual_${Date.now()}`, alunoId:null, nome:"", plano:"", valor:"", pago:false };
    onUpdateLinhas([...linhas, novaLinha]);
  };

  const removerLinha = (idx)=>{
    if(!podeEditar) return;
    onUpdateLinhas(linhas.filter((_,i)=>i!==idx));
    setConfirmarRemover(null);
  };

  const total = linhas.reduce((soma,l)=>{
    const v = parseFloat(String(l.valor||"0").replace(",","."));
    return soma + (isNaN(v)?0:v);
  }, 0);
  const totalPago = linhas.filter(l=>l.pago).reduce((soma,l)=>{
    const v = parseFloat(String(l.valor||"0").replace(",","."));
    return soma + (isNaN(v)?0:v);
  }, 0);

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:700,fontSize:14}}>{prof.nome}</div>
          <div style={{fontSize:10,color:C.muted}}>{labelMes(mesAtivo)}</div>
        </div>
        <div style={{width:70}}/>
      </header>

      <div style={css.wrap}>
        {!podeEditar&&(
          <div style={{background:"#f9731610",border:"1px solid #f9731630",borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:12,color:"#f97316"}}>
            👁 Voce esta visualizando a planilha de {prof.nome}. Apenas {prof.nome} ou o administrador podem editar.
          </div>
        )}

        {mostrarBotaoBuscar&&(
          <button onClick={onBuscarOutroPeriodo}
            style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:10,
              padding:"11px 14px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:14,
              display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
            <span style={{fontSize:16}}>🔍</span>
            <span style={{flex:1,fontSize:12,fontWeight:600,color:"#34d399"}}>Buscar outro mes ou ano</span>
            <span style={{color:"#34d399",fontSize:16}}>›</span>
          </button>
        )}

        {/* Resumo do mes */}
        <div style={{...css.row("1fr 1fr"),marginBottom:16}}>
          <div style={css.stat("#34d399")}>
            <div style={{fontSize:20,fontWeight:800,color:"#34d399"}}>R$ {total.toFixed(2).replace(".",",")}</div>
            <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Total do mes</div>
          </div>
          <div style={css.stat(C.accent)}>
            <div style={{fontSize:20,fontWeight:800,color:C.accent}}>R$ {totalPago.toFixed(2).replace(".",",")}</div>
            <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Recebido</div>
          </div>
        </div>

        {/* Planilha */}
        <div style={{...css.card,padding:0,overflow:"hidden"}}>
          {/* Cabecalho */}
          <div style={{display:"grid",gridTemplateColumns:podeEditar?"24px 1fr 76px 76px 28px":"24px 1fr 76px 76px",gap:4,
            padding:"10px 8px",background:"#161010",borderBottom:"1px solid #2a1a08"}}>
            <div/>
            <div style={{fontSize:10,fontWeight:700,color:"#e8cba8",textTransform:"uppercase"}}>Nome</div>
            <div style={{fontSize:10,fontWeight:700,color:"#e8cba8",textTransform:"uppercase"}}>Plano</div>
            <div style={{fontSize:10,fontWeight:700,color:"#e8cba8",textTransform:"uppercase"}}>Valor</div>
            {podeEditar&&<div/>}
          </div>

          {linhas.map((linha,idx)=>(
            <div key={linha.id} style={{display:"grid",gridTemplateColumns:podeEditar?"24px 1fr 76px 76px 28px":"24px 1fr 76px 76px",gap:4,
              padding:"8px 8px",borderBottom:idx<linhas.length-1?"1px solid #1a1008":"none",
              alignItems:"center",background:linha.pago?"#0a1a1010":"transparent"}}>
              <input type="checkbox" checked={!!linha.pago}
                disabled={!podeEditar}
                onChange={e=>atualizarLinha(idx,"pago",e.target.checked)}
                style={{width:18,height:18,accentColor:"#34d399",cursor:podeEditar?"pointer":"default",flexShrink:0,opacity:podeEditar?1:.7}}/>
              <input value={linha.nome} onChange={e=>atualizarLinha(idx,"nome",e.target.value)}
                placeholder="Nome" readOnly={!podeEditar}
                style={{background:"transparent",border:"none",color:linha.pago?"#34d399":C.text,
                  fontSize:16,fontWeight:600,outline:"none",fontFamily:"Inter,sans-serif",
                  textDecoration:linha.pago?"line-through":"none",padding:"4px 2px",
                  width:"100%",minWidth:0,boxSizing:"border-box",cursor:podeEditar?"text":"default"}}/>
              <input value={linha.plano} onChange={e=>atualizarLinha(idx,"plano",e.target.value)}
                placeholder="Plano" readOnly={!podeEditar}
                style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:6,color:C.text,
                  fontSize:16,outline:"none",fontFamily:"Inter,sans-serif",padding:"6px 4px",
                  width:"100%",minWidth:0,boxSizing:"border-box",cursor:podeEditar?"text":"default"}}/>
              <input value={linha.valor} onChange={e=>atualizarLinha(idx,"valor",e.target.value)}
                placeholder="0,00" inputMode="decimal" readOnly={!podeEditar}
                style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:6,color:"#34d399",
                  fontSize:16,fontWeight:700,outline:"none",fontFamily:"Inter,sans-serif",padding:"6px 4px",
                  width:"100%",minWidth:0,boxSizing:"border-box",textAlign:"right",cursor:podeEditar?"text":"default"}}/>
              {podeEditar&&(
                <button onClick={()=>setConfirmarRemover(idx)}
                  style={{background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:6,
                    width:24,height:24,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",
                    flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>×</button>
              )}
            </div>
          ))}

          {linhas.length===0&&(
            <div style={{textAlign:"center",color:C.muted,padding:"24px 0",fontSize:13}}>
              Nenhum lançamento neste mês.
            </div>
          )}

          {/* Linha de total */}
          <div style={{display:"grid",gridTemplateColumns:podeEditar?"24px 1fr 76px 76px 28px":"24px 1fr 76px 76px",gap:4,
            padding:"12px 8px",background:"#161010",borderTop:"1px solid #34d39940"}}>
            <div/>
            <div style={{fontSize:12,fontWeight:800,color:"#34d399"}}>TOTAL</div>
            <div/>
            <div style={{fontSize:13,fontWeight:800,color:"#34d399",textAlign:"right"}}>{total.toFixed(2).replace(".",",")}</div>
            {podeEditar&&<div/>}
          </div>
        </div>

        {podeEditar&&(
          <button onClick={adicionarLinha}
            style={{...css.btnC,width:"100%",marginTop:12,padding:"12px",fontSize:13}}>
            + Adicionar linha manual
          </button>
        )}
      </div>

      {/* Modal confirmação de exclusão de linha */}
      {confirmarRemover!==null&&(
        <Modal title="Remover lancamento?" onClose={()=>setConfirmarRemover(null)}
          onConfirm={()=>removerLinha(confirmarRemover)}
          confirmLabel="Remover" danger>
          <p style={{color:C.muted,fontSize:13,textAlign:"center",margin:"6px 0"}}>
            O lancamento de <strong style={{color:C.text}}>{linhas[confirmarRemover]?.nome||"este item"}</strong> sera removido da planilha deste mes.
          </p>
        </Modal>
      )}
    </div>
  );
}

// Navegacao em 3 niveis: Ano -> Mes -> Planilha
function PagamentosView({prof, pagamentosDoProf, alunos, onUpdateMes, onVoltar, podeEditar}){
  // Por padrao ja abre a planilha do mes/ano atual. A navegacao por Ano/Mes
  // funciona como um mecanismo de busca, acessivel a partir da planilha.
  const [mesAtivo,setMesAtivo] = useState(chaveMesAtual());
  const [buscaAberta,setBuscaAberta] = useState(false);
  const [anoBuscaAtivo,setAnoBuscaAtivo] = useState(null);

  // Todos os meses com dados salvos, mais o mes atual (garante que sempre aparece)
  const mesesExistentes = Object.keys(pagamentosDoProf||{});
  const todosMeses = Array.from(new Set([chaveMesAtual(), ...mesesExistentes]));
  const porAno = agruparChavesPorAno(todosMeses);
  const anosDisponiveis = Object.keys(porAno).sort().reverse();

  const linhasSalvas = pagamentosDoProf?.[mesAtivo];
  const linhas = mesclarLinhasComCarteira(linhasSalvas, prof, alunos);

  // ── Busca: selecao de mes dentro de um ano ──
  if(buscaAberta && anoBuscaAtivo){
    const mesesDoAno = porAno[anoBuscaAtivo] || [];
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={()=>setAnoBuscaAtivo(null)}>← Voltar</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontWeight:700,fontSize:14}}>{prof.nome}</div>
            <div style={{fontSize:10,color:C.muted}}>Ano {anoBuscaAtivo}</div>
          </div>
          <div style={{width:70}}/>
        </header>
        <div style={css.wrap}>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            Selecione o mes para ver a planilha de {anoBuscaAtivo}.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {mesesDoAno.map(m=>{
              const linhasDoMes = m===chaveMesAtual() ? mesclarLinhasComCarteira(pagamentosDoProf?.[m],prof,alunos) : (pagamentosDoProf?.[m]||[]);
              const totalMes = linhasDoMes.reduce((s,l)=>{
                const v=parseFloat(String(l.valor||"0").replace(",","."));
                return s+(isNaN(v)?0:v);
              },0);
              return(
                <button key={m} onClick={()=>{ setMesAtivo(m); setBuscaAberta(false); setAnoBuscaAtivo(null); }}
                  style={{background:m===mesAtivo?"#0a1a10":C.card,border:"1px solid "+(m===mesAtivo?"#34d39960":"#2e1e0a"),borderRadius:12,padding:"16px 14px",
                    cursor:"pointer",fontFamily:"Inter,sans-serif",textAlign:"left"}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:6}}>{labelMesCurto(m)}</div>
                  <div style={{fontSize:13,fontWeight:800,color:"#34d399"}}>R$ {totalMes.toFixed(2).replace(".",",")}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Busca: selecao de ano ──
  if(buscaAberta){
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={()=>setBuscaAberta(false)}>← Voltar</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontWeight:700,fontSize:14}}>{prof.nome}</div>
            <div style={{fontSize:10,color:C.muted}}>Buscar periodo</div>
          </div>
          <div style={{width:70}}/>
        </header>
        <div style={css.wrap}>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            Selecione o ano para acessar outros meses.
          </div>
          <div style={{display:"grid",gap:10}}>
            {anosDisponiveis.map(ano=>{
              const mesesDoAno = porAno[ano]||[];
              const totalAno = mesesDoAno.reduce((somaAno,m)=>{
                const linhasDoMes = m===chaveMesAtual() ? mesclarLinhasComCarteira(pagamentosDoProf?.[m],prof,alunos) : (pagamentosDoProf?.[m]||[]);
                const totalMes = linhasDoMes.reduce((s,l)=>{
                  const v=parseFloat(String(l.valor||"0").replace(",","."));
                  return s+(isNaN(v)?0:v);
                },0);
                return somaAno+totalMes;
              },0);
              return(
                <button key={ano} onClick={()=>setAnoBuscaAtivo(ano)}
                  style={{background:C.card,border:"1px solid #2e1e0a",borderRadius:12,padding:"16px 18px",
                    display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%",
                    fontFamily:"Inter,sans-serif"}}>
                  <div style={{width:44,height:44,borderRadius:10,background:"#34d39920",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#34d399",flexShrink:0}}>
                    {ano.slice(2)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:16,color:C.text}}>{ano}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{mesesDoAno.length} mes{mesesDoAno.length!==1?"es":""} · R$ {totalAno.toFixed(2).replace(".",",")}</div>
                  </div>
                  <span style={{color:"#34d399",fontSize:20}}>›</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Padrao: planilha do mes/ano atual (ou do mes escolhido na busca) ──
  return(
    <PlanilhaMesView
      prof={prof}
      mesAtivo={mesAtivo}
      linhas={linhas}
      podeEditar={podeEditar}
      onVoltar={onVoltar}
      onUpdateLinhas={(novasLinhas)=>onUpdateMes(mesAtivo, novasLinhas)}
      onBuscarOutroPeriodo={()=>setBuscaAberta(true)}
      mostrarBotaoBuscar={true}
    />
  );
}

function PagamentosSelecaoView({profissionais, onSelect, onVerConsolidado, onVoltar, isAdmin}){
  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Pagamentos</div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>
        {isAdmin&&(
          <button onClick={onVerConsolidado}
            style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:12,
              padding:"14px 16px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:16,
              display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
            <div style={{width:40,height:40,borderRadius:10,background:"#34d39920",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📊</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:14,color:"#34d399"}}>Consolidado Geral</div>
              <div style={{fontSize:11,color:C.muted}}>Total recebido por cada profissional</div>
            </div>
            <span style={{color:"#34d399",fontSize:20}}>›</span>
          </button>
        )}
        <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
          Selecione um profissional para ver/editar a planilha de pagamentos.
        </div>
        <div style={{display:"grid",gap:10}}>
          {[...profissionais].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(p=>(
            <button key={p.id} onClick={()=>onSelect(p)}
              style={{background:C.card,border:"1px solid #2e1e0a",borderRadius:12,padding:"14px 16px",
                display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%"}}>
              <Avatar nome={p.nome} foto={p.foto} size={44}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15,color:C.text}}>{p.nome}</div>
              </div>
              <span style={{color:"#34d399",fontSize:20}}>›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PagamentosConsolidadoView({profissionais, pagamentos, onVoltar}){
  // Por padrao ja mostra o consolidado do mes/ano atual.
  const [mesAtivo,setMesAtivo] = useState(chaveMesAtual());
  const [buscaAberta,setBuscaAberta] = useState(false);
  const [anoBuscaAtivo,setAnoBuscaAtivo] = useState(null);

  const todosMeses = useMemo(()=>{
    const set = new Set([chaveMesAtual()]);
    Object.values(pagamentos||{}).forEach(porMes=>{
      Object.keys(porMes||{}).forEach(m=>set.add(m));
    });
    return Array.from(set);
  }, [pagamentos]);

  const porAno = useMemo(()=>agruparChavesPorAno(todosMeses), [todosMeses]);
  const anosDisponiveis = Object.keys(porAno).sort().reverse();

  // Calcula total gerado por todos os profissionais num mes especifico
  const calcularTotaisDoMes = (mes)=>{
    return profissionais.map(prof=>{
      const linhas = pagamentos?.[prof.id]?.[mes] || [];
      const total = linhas.reduce((s,l)=>{
        const v=parseFloat(String(l.valor||"0").replace(",","."));
        return s+(isNaN(v)?0:v);
      },0);
      const totalPago = linhas.filter(l=>l.pago).reduce((s,l)=>{
        const v=parseFloat(String(l.valor||"0").replace(",","."));
        return s+(isNaN(v)?0:v);
      },0);
      return { prof, total, totalPago, qtdAlunos: linhas.length };
    }).sort((a,b)=>b.total-a.total);
  };

  // ── Busca: selecao de mes dentro de um ano ──
  if(buscaAberta && anoBuscaAtivo){
    const mesesDoAno = porAno[anoBuscaAtivo] || [];
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={()=>setAnoBuscaAtivo(null)}>← Voltar</button>
          <div style={{fontWeight:700,fontSize:15}}>Ano {anoBuscaAtivo}</div>
          <div style={{width:70}}/>
        </header>
        <div style={css.wrap}>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            Selecione o mes para ver o consolidado de {anoBuscaAtivo}.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {mesesDoAno.map(m=>{
              const linhasPorProf = calcularTotaisDoMes(m);
              const totalMes = linhasPorProf.reduce((s,l)=>s+l.total,0);
              return(
                <button key={m} onClick={()=>{ setMesAtivo(m); setBuscaAberta(false); setAnoBuscaAtivo(null); }}
                  style={{background:m===mesAtivo?"#0a1a10":C.card,border:"1px solid "+(m===mesAtivo?"#34d39960":"#2e1e0a"),borderRadius:12,padding:"16px 14px",
                    cursor:"pointer",fontFamily:"Inter,sans-serif",textAlign:"left"}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.text,marginBottom:6}}>{labelMesCurto(m)}</div>
                  <div style={{fontSize:13,fontWeight:800,color:"#34d399"}}>R$ {totalMes.toFixed(2).replace(".",",")}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Busca: selecao de ano ──
  if(buscaAberta){
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={()=>setBuscaAberta(false)}>← Voltar</button>
          <div style={{fontWeight:700,fontSize:15}}>Buscar periodo</div>
          <div style={{width:70}}/>
        </header>
        <div style={css.wrap}>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            Selecione o ano para acessar outros meses.
          </div>
          <div style={{display:"grid",gap:10}}>
            {anosDisponiveis.map(ano=>{
              const mesesDoAno = porAno[ano]||[];
              const totalAno = mesesDoAno.reduce((somaAno,m)=>{
                const linhasPorProf = calcularTotaisDoMes(m);
                return somaAno + linhasPorProf.reduce((s,l)=>s+l.total,0);
              },0);
              return(
                <button key={ano} onClick={()=>setAnoBuscaAtivo(ano)}
                  style={{background:C.card,border:"1px solid #2e1e0a",borderRadius:12,padding:"16px 18px",
                    display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%",
                    fontFamily:"Inter,sans-serif"}}>
                  <div style={{width:44,height:44,borderRadius:10,background:"#34d39920",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#34d399",flexShrink:0}}>
                    {ano.slice(2)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:16,color:C.text}}>{ano}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>{mesesDoAno.length} mes{mesesDoAno.length!==1?"es":""} · R$ {totalAno.toFixed(2).replace(".",",")}</div>
                  </div>
                  <span style={{color:"#34d399",fontSize:20}}>›</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Padrao: consolidado do mes/ano atual (ou do mes escolhido na busca) ──
  const linhasPorProf = calcularTotaisDoMes(mesAtivo);
  const totalGeral = linhasPorProf.reduce((s,l)=>s+l.total,0);
  const totalGeralPago = linhasPorProf.reduce((s,l)=>s+l.totalPago,0);

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontWeight:700,fontSize:15}}>Consolidado Geral</div>
          <div style={{fontSize:10,color:C.muted}}>{labelMes(mesAtivo)}</div>
        </div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>
        <button onClick={()=>setBuscaAberta(true)}
          style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:10,
            padding:"11px 14px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:14,
            display:"flex",alignItems:"center",gap:10,textAlign:"left"}}>
          <span style={{fontSize:16}}>🔍</span>
          <span style={{flex:1,fontSize:12,fontWeight:600,color:"#34d399"}}>Buscar outro mes ou ano</span>
          <span style={{color:"#34d399",fontSize:16}}>›</span>
        </button>

        <div style={{...css.row("1fr 1fr"),marginBottom:16}}>
          <div style={css.stat("#34d399")}>
            <div style={{fontSize:20,fontWeight:800,color:"#34d399"}}>R$ {totalGeral.toFixed(2).replace(".",",")}</div>
            <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Total geral</div>
          </div>
          <div style={css.stat(C.accent)}>
            <div style={{fontSize:20,fontWeight:800,color:C.accent}}>R$ {totalGeralPago.toFixed(2).replace(".",",")}</div>
            <div style={{fontSize:10,color:C.muted,fontWeight:600}}>Recebido</div>
          </div>
        </div>

        <div style={{display:"grid",gap:10}}>
          {linhasPorProf.map(({prof,total,totalPago,qtdAlunos})=>(
            <div key={prof.id} style={{...css.card,display:"flex",alignItems:"center",gap:14}}>
              <Avatar nome={prof.nome} foto={prof.foto} size={44}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:C.text}}>{prof.nome}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{qtdAlunos} aluno{qtdAlunos!==1?"s":""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:16,fontWeight:800,color:"#34d399"}}>R$ {total.toFixed(2).replace(".",",")}</div>
                <div style={{fontSize:10,color:C.accent}}>Recebido: {totalPago.toFixed(2).replace(".",",")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MODAL: escolher tipo de mensagem + confirmar envio pelo WhatsApp ─────────
function ModalEnviarWhatsApp({aluno, onClose}){
  const [tipoSel,setTipoSel] = useState(null);

  const tipo = TIPOS_MSG_WHATSAPP.find(t=>t.id===tipoSel);
  const mensagem = tipo ? tipo.gerar(aluno) : "";

  return(
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:20,width:"100%",maxWidth:460,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontWeight:800,fontSize:16,color:"#25d366"}}>📱 Enviar mensagem</div>
          <button onClick={onClose} style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕</button>
        </div>
        <div style={{fontSize:12,color:C.muted,marginBottom:16}}>
          Para <strong style={{color:C.text}}>{aluno.nome}</strong>. Escolha o tipo de mensagem:
        </div>

        {/* Seletor de tipo */}
        <div style={{display:"grid",gap:8,marginBottom:tipoSel?16:0}}>
          {TIPOS_MSG_WHATSAPP.map(t=>{
            const ativo = tipoSel===t.id;
            return(
              <button key={t.id} onClick={()=>setTipoSel(t.id)}
                style={{
                  background:ativo?t.cor+"20":"#161010",
                  border:"1px solid "+(ativo?t.cor:"#2a1a08"),
                  borderRadius:12,padding:"12px 14px",cursor:"pointer",
                  fontFamily:"Inter,sans-serif",textAlign:"left",
                  display:"flex",alignItems:"center",gap:12,
                }}>
                <span style={{fontSize:20}}>{t.icone}</span>
                <span style={{fontWeight:700,fontSize:13,color:ativo?t.cor:C.text}}>{t.label}</span>
                {ativo&&<span style={{marginLeft:"auto",color:t.cor,fontSize:16}}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Preview da mensagem + confirmação */}
        {tipoSel&&(
          <>
            <div style={{fontSize:10,fontWeight:700,color:"#e8cba8",textTransform:"uppercase",letterSpacing:.8,marginBottom:8}}>
              Preview da mensagem
            </div>
            <div style={{flex:1,overflowY:"auto",background:"#121212",border:"1px solid #2a1a08",borderRadius:10,padding:14,marginBottom:16,minHeight:120,maxHeight:220}}>
              <div style={{fontSize:13,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{mensagem}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setTipoSel(null)} style={{...css.btnB,width:"100%",padding:"12px"}}>Voltar</button>
              <button onClick={()=>{ dispararWhatsApp(aluno.telefone, mensagem); onClose(); }}
                style={{width:"100%",background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",border:"none",borderRadius:9,padding:"12px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                📱 Confirmar e Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── MODAL: envio em massa (seleciona alunos, marca quem ja recebeu) ──────────
function ModalEnvioEmMassa({alunosDoProf, onClose}){
  const [tipoSel,setTipoSel] = useState(null);
  const [etapa,setEtapa] = useState("tipo"); // "tipo" | "selecao" | "envio"
  const [selecionados,setSelecionados] = useState([]); // ids dos alunos marcados
  const [enviados,setEnviados] = useState([]); // ids ja processados nesta sessao

  const tipo = TIPOS_MSG_WHATSAPP.find(t=>t.id===tipoSel);
  const alunosComTelefone = alunosDoProf.filter(a=>a.telefone);
  const alunosSelecionados = alunosDoProf.filter(a=>selecionados.includes(a.id));

  const toggleSelecionado = (id)=>{
    setSelecionados(prev=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  };

  const selecionarTodos = ()=>{
    setSelecionados(alunosComTelefone.map(a=>a.id));
  };
  const limparSelecao = ()=>{
    setSelecionados([]);
  };

  const enviarPara = (aluno)=>{
    const msg = tipo.gerar(aluno);
    dispararWhatsApp(aluno.telefone, msg);
    setEnviados(prev=> prev.includes(aluno.id) ? prev : [...prev, aluno.id]);
  };

  return(
    <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:20,width:"100%",maxWidth:480,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontWeight:800,fontSize:16,color:"#25d366"}}>📋 Envio em Massa</div>
          <button onClick={onClose} style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕</button>
        </div>

        {/* ── Etapa 1: escolher tipo de mensagem ── */}
        {etapa==="tipo"&&(
          <>
            <div style={{fontSize:12,color:C.muted,marginBottom:16}}>
              Escolha o tipo de mensagem a enviar para varios alunos:
            </div>
            <div style={{display:"grid",gap:8}}>
              {TIPOS_MSG_WHATSAPP.map(t=>(
                <button key={t.id} onClick={()=>{ setTipoSel(t.id); setEtapa("selecao"); }}
                  style={{
                    background:"#161010", border:"1px solid #2a1a08",
                    borderRadius:12,padding:"12px 14px",cursor:"pointer",
                    fontFamily:"Inter,sans-serif",textAlign:"left",
                    display:"flex",alignItems:"center",gap:12,
                  }}>
                  <span style={{fontSize:20}}>{t.icone}</span>
                  <span style={{fontWeight:700,fontSize:13,color:C.text}}>{t.label}</span>
                  <span style={{marginLeft:"auto",color:C.muted,fontSize:16}}>›</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Etapa 2: selecionar alunos ── */}
        {etapa==="selecao"&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <span style={{fontSize:16}}>{tipo.icone}</span>
              <span style={{fontWeight:700,fontSize:13,color:tipo.cor}}>{tipo.label}</span>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <button onClick={selecionarTodos} style={{...css.btnC,flex:1,padding:"9px",fontSize:12}}>Marcar todos</button>
              <button onClick={limparSelecao} style={{...css.btnB,flex:1,padding:"9px",fontSize:12}}>Limpar</button>
            </div>
            <div style={{flex:1,overflowY:"auto",marginBottom:16}}>
              {alunosComTelefone.length===0&&(
                <div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>
                  Nenhum aluno com telefone cadastrado.
                </div>
              )}
              <div style={{display:"grid",gap:6}}>
                {alunosComTelefone.map(a=>{
                  const marcado = selecionados.includes(a.id);
                  return(
                    <button key={a.id} onClick={()=>toggleSelecionado(a.id)}
                      style={{
                        background:marcado?tipo.cor+"15":"#161010",
                        border:"1px solid "+(marcado?tipo.cor+"60":"#2a1a08"),
                        borderRadius:10,padding:"10px 12px",cursor:"pointer",
                        fontFamily:"Inter,sans-serif",textAlign:"left",
                        display:"flex",alignItems:"center",gap:10,
                      }}>
                      <div style={{width:20,height:20,borderRadius:5,border:"2px solid "+(marcado?tipo.cor:"#3d2010"),
                        background:marcado?tipo.cor:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {marcado&&<span style={{color:"#0a0a0a",fontSize:12,fontWeight:900}}>✓</span>}
                      </div>
                      <Avatar nome={a.nome} foto={a.foto} size={32}/>
                      <span style={{fontSize:13,fontWeight:600,color:C.text,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{a.nome}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setEtapa("tipo");setTipoSel(null);}} style={{...css.btnB,width:"100%",padding:"12px"}}>Voltar</button>
              <button
                disabled={selecionados.length===0}
                onClick={()=>{ setEnviados([]); setEtapa("envio"); }}
                style={{width:"100%",background:selecionados.length>0?"linear-gradient(135deg,#25d366,#128c7e)":"#333",color:"#fff",border:"none",borderRadius:9,padding:"12px",fontWeight:700,fontSize:13,cursor:selecionados.length>0?"pointer":"default",fontFamily:"Inter,sans-serif"}}>
                Continuar ({selecionados.length})
              </button>
            </div>
          </>
        )}

        {/* ── Etapa 3: lista de envio, um por um ── */}
        {etapa==="envio"&&(
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:16}}>{tipo.icone}</span>
              <span style={{fontWeight:700,fontSize:13,color:tipo.cor}}>{tipo.label}</span>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>
              Toque em "Enviar" para abrir o WhatsApp de cada aluno. {enviados.length} de {alunosSelecionados.length} processados.
            </div>
            <div style={{flex:1,overflowY:"auto",marginBottom:16}}>
              <div style={{display:"grid",gap:8}}>
                {alunosSelecionados.map(a=>{
                  const jaEnviado = enviados.includes(a.id);
                  return(
                    <div key={a.id} style={{
                      background:jaEnviado?"#0a1a10":"#161010",
                      border:"1px solid "+(jaEnviado?"#34d39960":"#2a1a08"),
                      borderRadius:10,padding:"10px 12px",
                      display:"flex",alignItems:"center",gap:10,
                    }}>
                      <Avatar nome={a.nome} foto={a.foto} size={32}/>
                      <span style={{fontSize:13,fontWeight:600,color:C.text,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{a.nome}</span>
                      {jaEnviado?(
                        <span style={{color:"#34d399",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>✓ Enviado</span>
                      ):(
                        <button onClick={()=>enviarPara(a)}
                          style={{background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",border:"none",borderRadius:7,
                            padding:"7px 12px",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"Inter,sans-serif",flexShrink:0}}>
                          📱 Enviar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setEtapa("selecao")} style={{...css.btnB,width:"100%",padding:"12px"}}>Voltar</button>
              <button onClick={onClose} style={{...css.btnA,width:"100%",padding:"12px"}}>Concluir</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ── GALERIA DE FOTOS DE EVOLUCAO ──────────────────────────────────────────────
// Registros independentes de fotos (frente/lado/costas) organizados por data,
// para acompanhar a evolucao fisica do aluno ao longo do tempo.
function GaleriaFotosEvolucao({fotos, onUpdateFotos, podeEditar}){
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [modalVisualizarIdx, setModalVisualizarIdx] = useState(null);
  const [confirmarRemover, setConfirmarRemover] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [novaData, setNovaData] = useState(()=>new Date().toISOString().slice(0,10));
  const [novasFotos, setNovasFotos] = useState({frente:null, lado:null, costas:null});
  const [fotoTelaCheia, setFotoTelaCheia] = useState(null); // {src, label}

  const lista = [...(fotos||[])].sort((a,b)=> b.data.localeCompare(a.data));

  const handleUpload = async (angulo, file)=>{
    if(!file) return;
    setEnviando(true);
    try{
      const base64 = await comprimirImagem(file, 700, 0.6);
      setNovasFotos(prev=>({...prev, [angulo]:base64}));
    }catch(e){
      alert("Erro ao processar a imagem. Tente outra foto.");
    }
    setEnviando(false);
  };

  const salvarRegistro = ()=>{
    const temFoto = novasFotos.frente || novasFotos.lado || novasFotos.costas;
    if(!temFoto){ alert("Adicione ao menos uma foto."); return; }
    const novoRegistro = {
      id: Date.now(),
      data: novaData,
      frente: novasFotos.frente,
      lado: novasFotos.lado,
      costas: novasFotos.costas,
    };
    onUpdateFotos([...(fotos||[]), novoRegistro]);
    setNovasFotos({frente:null, lado:null, costas:null});
    setNovaData(new Date().toISOString().slice(0,10));
    setModalNovoAberto(false);
  };

  const removerRegistro = (id)=>{
    onUpdateFotos((fotos||[]).filter(r=>r.id!==id));
    setConfirmarRemover(null);
    setModalVisualizarIdx(null);
  };

  const formatarData = (iso)=>{
    if(!iso) return "";
    const [ano,mes,dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
  };

  return(
    <div style={css.card}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={css.secHdr}>Fotos de Evolucao</div>
        {podeEditar&&(
          <button onClick={()=>setModalNovoAberto(true)}
            style={{background:C.accent,color:"#0a0a0a",border:"none",borderRadius:8,
              padding:"7px 12px",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
            + Novo registro
          </button>
        )}
      </div>

      {lista.length===0&&(
        <div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>
          Nenhuma foto registrada ainda.
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8}}>
        {lista.map((reg,idx)=>{
          const capa = reg.frente || reg.lado || reg.costas;
          const qtdFotos = [reg.frente,reg.lado,reg.costas].filter(Boolean).length;
          return(
            <button key={reg.id} onClick={()=>setModalVisualizarIdx(idx)}
              style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:10,
                overflow:"hidden",cursor:"pointer",padding:0,position:"relative",aspectRatio:"1"}}>
              {capa
                ? <img src={capa} alt={formatarData(reg.data)} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:24}}>📷</div>
              }
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(transparent,#000000cc)",
                padding:"12px 6px 4px",fontSize:9,color:"#fff",fontWeight:700}}>
                {formatarData(reg.data)}
              </div>
              {qtdFotos>1&&(
                <div style={{position:"absolute",top:4,right:4,background:"#0a0a0acc",color:"#fff",
                  borderRadius:5,padding:"1px 5px",fontSize:9,fontWeight:700}}>
                  {qtdFotos}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Modal: novo registro */}
      {modalNovoAberto&&(
        <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:20,width:"100%",maxWidth:420,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:16,color:C.accent}}>📷 Novo Registro</div>
              <button onClick={()=>setModalNovoAberto(false)}
                style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕</button>
            </div>

            <div style={{marginBottom:16}}>
              <DateScrollPicker label="Data do registro" value={novaData} onChange={setNovaData}/>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
              {[{k:"frente",l:"Frente"},{k:"lado",l:"Lado"},{k:"costas",l:"Costas"}].map(ang=>(
                <label key={ang.k} style={{cursor:"pointer"}}>
                  <div style={{aspectRatio:"3/4",background:"#121212",border:"1px dashed #3d2010",borderRadius:10,
                    display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",marginBottom:6}}>
                    {novasFotos[ang.k]
                      ? <img src={novasFotos[ang.k]} alt={ang.l} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      : <span style={{fontSize:22,color:C.muted}}>+</span>
                    }
                  </div>
                  <div style={{fontSize:10,textAlign:"center",color:C.muted,fontWeight:600}}>{ang.l}</div>
                  <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    onChange={e=>handleUpload(ang.k, e.target.files[0])}/>
                </label>
              ))}
            </div>

            {enviando&&<div style={{textAlign:"center",fontSize:12,color:C.accent,marginBottom:12}}>Processando imagem...</div>}

            <button onClick={salvarRegistro} disabled={enviando}
              style={{...css.btnA,width:"100%",padding:"13px",fontSize:14,opacity:enviando?.6:1}}>
              Salvar Registro
            </button>
          </div>
        </div>
      )}

      {/* Modal: visualizar registro */}
      {modalVisualizarIdx!==null&&lista[modalVisualizarIdx]&&(
        <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:20,width:"100%",maxWidth:460,maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontWeight:800,fontSize:16,color:C.accent}}>{formatarData(lista[modalVisualizarIdx].data)}</div>
              <button onClick={()=>setModalVisualizarIdx(null)}
                style={{background:"#1c1c1c",border:"1px solid #332010",color:C.text,borderRadius:8,padding:"6px 12px",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>✕</button>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
              {[{k:"frente",l:"Frente"},{k:"lado",l:"Lado"},{k:"costas",l:"Costas"}].map(ang=>{
                const src = lista[modalVisualizarIdx][ang.k];
                return(
                  <div key={ang.k}>
                    <button
                      onClick={()=>{ if(src) setFotoTelaCheia({src, label:ang.l}); }}
                      style={{width:"100%",padding:0,border:"1px solid #2a1a08",borderRadius:10,
                        aspectRatio:"3/4",background:"#121212",
                        display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",
                        marginBottom:6,cursor:src?"pointer":"default"}}>
                      {src
                        ? <img src={src} alt={ang.l} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <span style={{fontSize:11,color:C.muted}}>--</span>
                      }
                    </button>
                    <div style={{fontSize:10,textAlign:"center",color:C.muted,fontWeight:600}}>{ang.l}</div>
                  </div>
                );
              })}
            </div>

            {podeEditar&&(
              <button onClick={()=>setConfirmarRemover(lista[modalVisualizarIdx].id)}
                style={{width:"100%",background:"transparent",border:"1px solid #7f1d1d60",color:"#f87171",
                  borderRadius:9,padding:"11px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
                Excluir registro
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {confirmarRemover!==null&&(
        <div style={{position:"fixed",inset:0,zIndex:600}}>
          <Modal title="Excluir registro de fotos?" onClose={()=>setConfirmarRemover(null)}
            onConfirm={()=>removerRegistro(confirmarRemover)}
            confirmLabel="Excluir" danger>
            <p style={{color:C.muted,fontSize:13,textAlign:"center",margin:"6px 0"}}>
              As fotos desse registro serao removidas permanentemente.
            </p>
          </Modal>
        </div>
      )}

      {/* Visualizador em tela cheia */}
      {fotoTelaCheia&&(
        <div
          onClick={()=>setFotoTelaCheia(null)}
          style={{position:"fixed",inset:0,background:"#000000f5",zIndex:700,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:16}}>
          <button onClick={()=>setFotoTelaCheia(null)}
            style={{position:"absolute",top:20,right:20,background:"#1c1c1c",border:"1px solid #332010",
              color:"#fff",borderRadius:"50%",width:40,height:40,fontSize:18,cursor:"pointer",
              fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",zIndex:701}}>
            ✕
          </button>
          <img
            src={fotoTelaCheia.src}
            alt={fotoTelaCheia.label}
            onClick={e=>e.stopPropagation()}
            style={{maxWidth:"100%",maxHeight:"85vh",objectFit:"contain",borderRadius:8}}
          />
          <div style={{marginTop:14,color:"#fff",fontWeight:700,fontSize:14,letterSpacing:.5}}>
            {fotoTelaCheia.label}
          </div>
        </div>
      )}
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App(){
  // Detecta se o app foi aberto via link de convite (?token=...) — nesse caso,
  // mostra o formulario publico de auto-cadastro em vez do fluxo normal de login.
  const [tokenConvite]=useState(()=>{
    try{
      const params=new URLSearchParams(window.location.search);
      return params.get("token");
    }catch(e){ return null; }
  });
  const [conviteAtual,setConviteAtual]=useState(()=>{
    if(!tokenConvite) return null;
    try{
      const convites=JSON.parse(localStorage.getItem('fittrack_convites')||'{}');
      const c=convites[tokenConvite];
      if(!c) return null;
      if(new Date(c.expiresAt) < new Date()) return {expirado:true};
      if(c.preenchido) return {jaPreenchido:true};
      return c;
    }catch(e){ return null; }
  });

  const [currentUser,setCurrentUser]=useState(null);
  const [authCarregando,setAuthCarregando]=useState(true);

  // Observa o estado de login do Firebase. Quando o usuario ja tem sessao
  // ativa (ex: recarregou a pagina), busca os dados completos dele no Firestore.
  useEffect(()=>{
    const unsubscribe = observarUsuario(async (usuarioFirebase)=>{
      if(usuarioFirebase){
        try{
          const dadosProf = await buscarProfissional(usuarioFirebase.uid);
          if(dadosProf){
            setCurrentUser({...dadosProf, id: usuarioFirebase.uid});
          }
        }catch(e){
          console.error("Erro ao restaurar sessao:", e);
        }
      } else {
        // Sem sessao Firebase ativa. Pode ainda ser um "aluno" logado localmente
        // (alunos nao usam Firebase Authentication, apenas selecionam o nome).
        setCurrentUser(prev => (prev && prev.role==="aluno") ? prev : null);
      }
      setAuthCarregando(false);
    });
    return () => unsubscribe();
  }, []);

  const [profissionais,setProfissionais]=useState([]);
  const [alunos,setAlunos]=useState([]);

  // Mantem a lista de profissionais e alunos sincronizada em tempo real com o Firestore.
  // IMPORTANTE: só inicia os listeners depois que o login (Firebase Auth) foi
  // confirmado. Sem isso, em conexões mais lentas (ex: celular), o listener
  // pode tentar ler antes da sessao estar pronta e ser bloqueado pelas regras
  // de segurança sem tentar de novo — deixando a lista vazia silenciosamente.
  useEffect(()=>{
    if(authCarregando) return; // aguarda a confirmacao do login antes de tentar ler
    if(!currentUser) return;   // sem sessao, nao adianta tentar (regras exigem login)

    const unsubProf = ouvirProfissionais((lista)=>setProfissionais(lista));
    const unsubAlunos = ouvirAlunos((lista)=>setAlunos(lista));
    return ()=>{ unsubProf(); unsubAlunos(); };
  }, [authCarregando, currentUser?.id]);

  const [view,setView]=useState("profissionais");
  const [profSelecionado,setProfSelecionado]=useState(null);
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState(emptyForm);
  const [editId,setEditId]=useState(null);
  const [busca,setBusca]=useState("");
  const [pg,setPg]=useState(1);
  const [dTab,setDTab]=useState("ficha");
  const [delId,setDelId]=useState(null);
  const [delAvalIdx,setDelAvalIdx]=useState(null);
  const [novaAval,setNovaAval]=useState(null);
  const [linkModal,setLinkModal]=useState(false);
  // ── FIX: editProfModal agora é global e funciona em todas as telas
  const [editProfModal,setEditProfModal]=useState(null);
  const [transferModal,setTransferModal]=useState(null);
  const [confirmarTransferencia,setConfirmarTransferencia]=useState(null);
  const [linkGerado,setLinkGerado]=useState('');
  const [linkNome,setLinkNome]=useState('');
  const [linkEmail,setLinkEmail]=useState('');
  const [linkTelefone,setLinkTelefone]=useState('');
  const [linkCopiado,setLinkCopiado]=useState(false);
  const [treinoAba,setTreinoAba]=useState('geral');
  const [agendaProfSel,setAgendaProfSel]=useState(null);
  const [pagamentosProfSel,setPagamentosProfSel]=useState(null);
  const [pagamentos,setPagamentos]=useState({});

  // Mantem todos os pagamentos sincronizados em tempo real com o Firestore.
  // So inicia depois que o login estiver confirmado (mesma correção aplicada
  // em profissionais/alunos/agendas, evita tela vazia em conexões lentas).
  useEffect(()=>{
    if(authCarregando) return;
    if(!currentUser) return;

    const unsubPagamentos = ouvirTodosPagamentos((todos)=>setPagamentos(todos));
    return ()=>unsubPagamentos();
  }, [authCarregando, currentUser?.id]);

  const [ouvidorias,setOuvidorias]=useState({});

  // Mantem todas as ouvidorias sincronizadas em tempo real (necessario para
  // a tela de Ouvidoria Admin, que mostra mensagens de todos os alunos juntas).
  useEffect(()=>{
    if(authCarregando) return;
    if(!currentUser) return;

    const unsubOuvidorias = ouvirTodasOuvidorias((todas)=>setOuvidorias(todas));
    return ()=>unsubOuvidorias();
  }, [authCarregando, currentUser?.id]);

  const [backupTexto,setBackupTexto]=useState(null);
  const [modalWhatsAppAluno,setModalWhatsAppAluno]=useState(null);
  const [envioMassaAberto,setEnvioMassaAberto]=useState(false);
  const [atalhoAberto,setAtalhoAberto]=useState(false);
  const [atalhoItensVisualizacao,setAtalhoItensVisualizacao]=useState(null);
  const [buscaGlobalAberta,setBuscaGlobalAberta]=useState(false);
  const [buscaGlobalTexto,setBuscaGlobalTexto]=useState("");
  const backupTextareaRef=useRef(null);
  const [importModalAberto,setImportModalAberto]=useState(false);
  const [importTexto,setImportTexto]=useState("");
  const [importErro,setImportErro]=useState("");
  const [importSucesso,setImportSucesso]=useState("");
  const [agendas,setAgendas]=useState({});

  // Mantem todas as agendas sincronizadas em tempo real com o Firestore.
  // Mesma correção: só inicia depois que o login estiver confirmado.
  useEffect(()=>{
    if(authCarregando) return;
    if(!currentUser) return;

    const unsubAgendas = ouvirTodasAgendas((todas)=>setAgendas(todas));
    return ()=>unsubAgendas();
  }, [authCarregando, currentUser?.id]);

  const alunosDoProf=useMemo(()=>
    profSelecionado ? alunos.filter(a=>a.profissionalId===profSelecionado.id) : []
  ,[alunos,profSelecionado]);

  // Lista de alunos que o usuario logado pode mensagear via WhatsApp:
  // admin ve todos; profissional comum ve apenas a propria carteira.
  // Independente de qual "profSelecionado" estiver ativo no momento (evita
  // que navegacao via Atalho Rapido/Busca Global libere envio indevido).
  const alunosParaMensagem=useMemo(()=>{
    if(!currentUser) return [];
    if(currentUser.role==="admin") return alunos;
    return alunos.filter(a=>a.profissionalId===currentUser.id);
  },[alunos,currentUser]);

  // ── BACKUP: exportar e importar todos os dados do app ─────────────────────
  const exportarBackup = ()=>{
    try{
      const backup = {
        versao: "2.0",
        dataExportacao: new Date().toISOString(),
        alunos,
        profissionais,
        agendas,
        pagamentos,
        ouvidorias,
      };
      const jsonStr = JSON.stringify(backup, null, 2);
      // Artifacts rodam em iframe sandboxed: download automático e popups costumam
      // ser bloqueados silenciosamente. Mostramos o backup em um modal para o
      // usuário copiar o texto e colar num arquivo .json no proprio dispositivo.
      setBackupTexto(jsonStr);
    }catch(e){
      alert("Erro ao gerar backup: "+e.message);
    }
  };

  const restaurarBackupDeJson = (jsonStr)=>{
    setImportErro("");
    setImportSucesso("");
    // AVISO: esta função ainda é da era localStorage e não grava no Firestore.
    // Com o app conectado ao Firebase, restaurar um backup requer regravar
    // cada aluno/profissional/agenda no banco (não apenas no estado local).
    // Desativada temporariamente até termos uma versão que salve no Firestore.
    setImportErro("A restauração de backup ainda não foi adaptada para o Firebase. Esta função será reativada em uma próxima etapa da migração.");
    return false;
  };

  const importarBackup = (file)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{ restaurarBackupDeJson(e.target.result); };
    reader.readAsText(file);
  };

  const podeEditar=currentUser&&profSelecionado&&
    (currentUser.role==='admin'||currentUser.id===profSelecionado.id);

  // ── ROTA PUBLICA: formulario de auto-cadastro via link (sem login) ─────────
  if(tokenConvite){
    if(!conviteAtual){
      return(
        <div style={css.app}><GF/>
          <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{...css.card,maxWidth:400,textAlign:"center",padding:32}}>
              <div style={{fontSize:40,marginBottom:12}}>🔗</div>
              <div style={{fontWeight:800,fontSize:17,color:"#f87171",marginBottom:8}}>Link invalido</div>
              <div style={{fontSize:13,color:C.muted}}>Este link de cadastro não foi encontrado. Peça um novo link ao seu personal.</div>
            </div>
          </div>
        </div>
      );
    }
    if(conviteAtual.expirado){
      return(
        <div style={css.app}><GF/>
          <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{...css.card,maxWidth:400,textAlign:"center",padding:32}}>
              <div style={{fontSize:40,marginBottom:12}}>⏰</div>
              <div style={{fontWeight:800,fontSize:17,color:"#fbbf24",marginBottom:8}}>Link expirado</div>
              <div style={{fontSize:13,color:C.muted}}>Este link de cadastro expirou (validade de 72 horas). Peça um novo link ao seu personal.</div>
            </div>
          </div>
        </div>
      );
    }
    if(conviteAtual.jaPreenchido){
      return(
        <div style={css.app}><GF/>
          <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{...css.card,maxWidth:400,textAlign:"center",padding:32}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <div style={{fontWeight:800,fontSize:17,color:"#34d399",marginBottom:8}}>Cadastro já realizado</div>
              <div style={{fontSize:13,color:C.muted}}>Este link já foi utilizado. Se precisar atualizar seus dados, fale com seu personal.</div>
            </div>
          </div>
        </div>
      );
    }
    return(
      <FormularioPublicoAluno
        convite={conviteAtual}
        onEnviar={async(dadosForm)=>{
          // Cria o aluno vinculado ao profissional do convite.
          // Sem campos de mensalidade — isso fica exclusivamente com o profissional.
          const novoAluno = {
            ...emptyForm,
            ...dadosForm,
            profissionalId: conviteAtual.profissionalId,
            dataCadastro: new Date().toISOString().slice(0,10),
            ativo: true,
          };
          try{
            await criarAluno(novoAluno);
          }catch(e){
            console.error("Erro ao salvar aluno via link publico:", e);
          }
          // Marca o convite como preenchido para nao ser reutilizado
          try{
            const convites = JSON.parse(localStorage.getItem('fittrack_convites')||'{}');
            if(convites[tokenConvite]){
              convites[tokenConvite].preenchido = true;
              localStorage.setItem('fittrack_convites', JSON.stringify(convites));
            }
          }catch(e){}
        }}
      />
    );
  }

  const lista=useMemo(()=>[...alunosDoProf].filter(a=>a.nome.toLowerCase().includes(busca.toLowerCase())).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),[alunosDoProf,busca]);

  useEffect(()=>{
    try{ localStorage.setItem('fittrack_alunos', JSON.stringify(alunos)); }
    catch(e){ console.error('Erro ao salvar:', e); }
  },[alunos]);

  useEffect(()=>{
    try{ localStorage.setItem('fittrack_profissionais', JSON.stringify(profissionais)); }
    catch(e){}
  },[profissionais]);

  useEffect(()=>{
    try{ localStorage.setItem('fittrack_user', JSON.stringify(currentUser)); }
    catch(e){}
  },[currentUser]);

  const u=(k,v)=>setForm(p=>({...p,[k]:v}));

  // ── FIX: salvarEditProf corrigido e centralizado ──────────────────────────
  const salvarEditProf=(profAtualizado)=>{
    setProfissionais(prev=>prev.map(p=>p.id===profAtualizado.id?profAtualizado:p));
    if(currentUser?.id===profAtualizado.id) setCurrentUser(profAtualizado);
    // Atualiza profSelecionado se for o mesmo
    if(profSelecionado?.id===profAtualizado.id) setProfSelecionado(profAtualizado);
    setEditProfModal(null);
  };

  const excluirProfissional=async(profId)=>{
    try{ await excluirProfissionalDoFirestore(profId); }
    catch(e){ console.error("Erro ao excluir profissional:", e); }
    // Alunos vinculados ficam sem profissional responsavel (nao sao excluidos)
    const alunosDoProf = alunos.filter(a=>a.profissionalId===profId);
    try{
      await Promise.all(alunosDoProf.map(a=>salvarAluno(a.id, {profissionalId:null})));
    }catch(e){ console.error("Erro ao desvincular alunos:", e); }
    if(profSelecionado?.id===profId){ setProfSelecionado(null); setView("profissionais"); }
    setEditProfModal(null);
  };

  const transferirAluno=async(alunoId,novoProfId)=>{
    try{
      await salvarAluno(alunoId, {profissionalId:novoProfId});
    }catch(e){
      console.error("Erro ao transferir aluno:", e);
    }
    setTransferModal(null);
  };

  const gerarLink=()=>{
    const token = Math.random().toString(36).slice(2)+Date.now().toString(36);
    const url = `${window.location.origin}/formulario?token=${token}`;
    const convites = JSON.parse(localStorage.getItem('fittrack_convites')||'{}');
    convites[token] = {
      token, profissionalId: profSelecionado?.id,
      profissionalNome: profSelecionado?.nome,
      nomeAluno: linkNome, emailAluno: linkEmail,
      expiresAt: new Date(Date.now()+72*60*60*1000).toISOString(),
      preenchido: false,
    };
    localStorage.setItem('fittrack_convites', JSON.stringify(convites));
    setLinkGerado(url);
    return url;
  };

  const copiarLink=()=>{
    navigator.clipboard.writeText(linkGerado).then(()=>{
      setLinkCopiado(true);
      setTimeout(()=>setLinkCopiado(false), 2500);
    });
  };

  const compartilharLink=()=>{
    if(navigator.share){
      navigator.share({
        title:'UP Fitness — Formulario de cadastro',
        text:`Ola${linkNome?' '+linkNome:''}! Preencha seu formulario de cadastro.`,
        url: linkGerado,
      });
    } else {
      copiarLink();
    }
  };

  const openNew=()=>{setForm({...emptyForm,profissionalId:profSelecionado?.id||null});setEditId(null);setPg(1);setTreinoAba('geral');setView("form");};
  const openEdit=a=>{
    const migrated={...emptyForm,...a};
    ["A","B","C","D"].forEach(l=>{
      if(!migrated["blocos"+l]||migrated["blocos"+l].length===0){
        if(migrated["exercicios"+l]&&migrated["exercicios"+l].length>0){
          migrated["blocos"+l]=[{id:Date.now()+Math.random(),exercicios:migrated["exercicios"+l]}];
        } else {
          migrated["blocos"+l]=[];
        }
      }
    });
    setForm(migrated);setEditId(a.id);setPg(1);setTreinoAba('geral');setView("form");
  };
  const openDetail=a=>{setSelected(a);setDTab("ficha");setView("detail");};

  const handleFoto=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>u("foto",ev.target.result);r.readAsDataURL(f);
  };

  const save=async()=>{
    if(!form.nome.trim()){alert("Nome obrigatório.");setPg(1);return;}
    if(editId){
      const atual=alunos.find(a=>a.id===editId)||{};
      // Se é uma nova avaliação (dados físicos mudaram), salva snapshot do estado anterior no histórico
      const snapshot={
        data: atual.dataCadastro||new Date().toISOString().slice(0,10),
        peso:atual.peso, altura:atual.altura, pressao:atual.pressao,
        cintura:atual.cintura, quadril:atual.quadril,
        cinturaEscapular:atual.cinturaEscapular, peitNormal:atual.peitNormal, peitInspirado:atual.peitInspirado,
        bracoDirNormal:atual.bracoDirNormal, bracoDirContraido:atual.bracoDirContraido, antebracoDir:atual.antebracoDir,
        bracoEsqNormal:atual.bracoEsqNormal, bracoEsqContraido:atual.bracoEsqContraido, antebracoEsq:atual.antebracoEsq,
        abdomen:atual.abdomen, coxaDirSupra:atual.coxaDirSupra, coxaDirInfra:atual.coxaDirInfra,
        coxaDirInfContr:atual.coxaDirInfContr, coxaEsqSupra:atual.coxaEsqSupra, coxaEsqInfra:atual.coxaEsqInfra,
        coxaEsqInfContr:atual.coxaEsqInfContr, panturrilhaDir:atual.panturrilhaDir, panturrilhaEsq:atual.panturrilhaEsq,
        dobTriceps:atual.dobTriceps, dobBiceps:atual.dobBiceps, dobSubescapular:atual.dobSubescapular,
        dobPeitoral:atual.dobPeitoral, dobSuprailiaca:atual.dobSuprailiaca, dobAbdomen:atual.dobAbdomen,
        dobCoxa:atual.dobCoxa, dobPanturrilha:atual.dobPanturrilha, gordura:atual.gordura,
        soma: atual.dobTriceps?calcPollock(atual,atual.idade,atual.sexo)?.soma:null,
        pct:  atual.dobTriceps?calcPollock(atual,atual.idade,atual.sexo)?.pct:null,
      };
      const temDadosFisicos = atual.peso||atual.dobTriceps||atual.cintura;
      const historicoAtual  = atual.historicoAvaliacoes||[];
      // Só arquiva se havia dados físicos (evita snapshots vazios)
      const novoHistorico = temDadosFisicos ? [snapshot, ...historicoAtual] : historicoAtual;
      const merged={...atual,...form, historicoAvaliacoes:novoHistorico};
      try{
        await salvarAluno(editId, merged);
      }catch(e){
        console.error("Erro ao salvar edicao do aluno:", e);
      }
      setSelected(merged);
    }else{
      const novoAluno = {...form, dataCadastro:new Date().toISOString().slice(0,10)};
      try{
        await criarAluno(novoAluno);
      }catch(e){
        console.error("Erro ao criar aluno:", e);
      }
    }
    setView(editId?"detail":"home");
  };

  const delAluno=async(id)=>{
    try{ await excluirAluno(id); }
    catch(e){ console.error("Erro ao excluir aluno:", e); }
    setDelId(null);
    setView("home");
  };

  const addAval=async()=>{
    if(!novaAval)return;
    const nova={data:novaAval.data||new Date().toISOString().slice(0,10),peso:novaAval.peso,soma:novaAval.soma,pct:novaAval.pct,cintura:novaAval.cintura};
    const upd=a=>({...a,historicoAvaliacoes:[...(a.historicoAvaliacoes||[]),nova]});
    const alunoAtualizado = upd(selected);
    try{
      await salvarAluno(selected.id, {historicoAvaliacoes:alunoAtualizado.historicoAvaliacoes});
    }catch(e){
      console.error("Erro ao adicionar avaliacao:", e);
    }
    setSelected(alunoAtualizado);
    setNovaAval(null);
  };

  const imc=calcIMC(form.peso,form.altura),imcC=classIMC(imc);
  const rcq=calcRCQ(form.cintura,form.quadril),rcqC=classRCQ(rcq,form.sexo);
  const paC=classPA(form.pressao);
  const poll=calcPollock(form,form.idade,form.sexo);

  // Logout: profissionais usam Firebase Authentication de verdade;
  // alunos apenas "saem" localmente (nao tem login com senha).
  const sair = async ()=>{
    if(currentUser?.role!=="aluno"){
      try{ await fazerLogout(); }catch(e){}
    }
    setCurrentUser(null);
    setProfSelecionado(null);
    setView("profissionais");
  };

  // ── Modal EditProf é renderizado globalmente sobre qualquer tela ──────────
  const modalEditProfGlobal = editProfModal && (
    <ModalEditProf
      prof={editProfModal}
      currentUserRole={currentUser?.role}
      onSave={salvarEditProf}
      onClose={()=>setEditProfModal(null)}
      onExcluir={excluirProfissional}
    />
  );

  // ── TELA LOGIN ────────────────────────────────────────────────────────────
  if(authCarregando)return(
    <div style={css.app}><GF/>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
        <LogoUP size={64}/>
        <div style={{fontSize:13,color:C.muted}}>Carregando...</div>
      </div>
    </div>
  );

  if(!currentUser)return(
    <LoginScreen
      profissionais={profissionais}
      alunos={alunos}
      onLoginProf={p=>setCurrentUser(p)}
      onLoginAluno={a=>setCurrentUser({...a, role:"aluno"})}
    />
  );

  // ── TELA ALUNO (somente leitura) ─────────────────────────────────────────
  if(currentUser?.role==="aluno"){
    const a=alunos.find(x=>x.id===currentUser.id)||currentUser;
    const prof=profissionais.find(p=>p.id===a.profissionalId);
    const imcA=calcIMC(a.peso,a.altura),imcCA=classIMC(imcA);
    const paCA=classPA(a.pressao);
    const pollA=calcPollock(a,a.idade,a.sexo);
    const TABS=[{k:"treino",l:"🏋 Treino"},{k:"ficha",l:"👤 Ficha"},{k:"avaliacao",l:"📊 Avaliação"},{k:"ouvidoria",l:"📣 Ouvidoria"}];
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <div style={{display:'flex',alignItems:'center',gap:8}}><LogoUP size={32}/><div style={{fontWeight:800,fontSize:16,color:'#f97316'}}>UP Fitness</div></div>
          <button style={css.btnB} onClick={sair}>Sair</button>
        </header>

        {/* Hero do aluno */}
        <div style={{background:"linear-gradient(180deg,#1a0f00 0%,#111111 100%)",borderBottom:"1px solid #3d1f00",padding:"16px",boxSizing:"border-box"}}>
          <div style={{maxWidth:860,margin:"0 auto"}}>
            <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:14}}>
              <Avatar nome={a.nome} foto={a.foto} size={56}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:18,marginBottom:2}}>Ola, {a.nome.split(" ")[0]}! 👋</div>
                <div style={{fontSize:12,color:C.muted}}>
                  {prof?`Personal: ${prof.nome}`:"UP Fitness"}
                </div>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <span style={css.badge("#34d399")}>{a.objetivo}</span>
                  {a.nivelExperiencia&&<span style={css.badge("#6366f1")}>{a.nivelExperiencia}</span>}
                </div>
              </div>
            </div>
            {/* Tab bar */}
            <div style={{display:"flex",gap:6,background:C.bg,borderRadius:10,padding:4}}>
              {TABS.map(t=>(
                <button key={t.k} onClick={()=>setDTab(t.k)}
                  style={{...css.tabBtn(dTab===t.k),flex:1,textAlign:"center",padding:"9px 4px",fontSize:11}}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={css.wrap}>
          {/* ── TREINO ── */}
          {dTab==="treino"&&<TreinoAlunoView aluno={a}/>}

          {/* ── FICHA ── */}
          {dTab==="ficha"&&<>
            <div style={css.card}>
              <div style={css.secHdr}>Meus Dados</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[{l:"Sexo",v:a.sexo},{l:"Idade",v:a.idade?a.idade+" anos":""},{l:"Telefone",v:a.telefone},{l:"E-mail",v:a.email},{l:"Profissão",v:a.profissao},{l:"Endereço",v:a.endereco}].map(({l,v})=>(
                  <ReadField key={l} label={l} value={v}/>
                ))}
              </div>
            </div>

            {/* Antropometria */}
            {(a.peso||a.altura||a.cintura||a.quadril||a.pressao)&&(()=>{
              const imcF=calcIMC(a.peso,a.altura),imcCF=classIMC(imcF);
              const paF=classPA(a.pressao);
              const rcqF=calcRCQ(a.cintura,a.quadril),rcqCF=classRCQ(rcqF,a.sexo);
              return(
                <div style={css.card}>
                  <div style={css.secHdr}>Antropometria</div>
                  {/* Linha 1: Peso / Altura / IMC */}
                  <div style={{...css.row("1fr 1fr 1fr"),marginBottom:12}}>
                    <ReadField label="Peso" value={a.peso?a.peso+" kg":""}/>
                    <ReadField label="Altura" value={a.altura?a.altura+" cm":""}/>
                    <ReadField label="IMC" value={imcF?imcF+" — "+imcCF.label:""} color={imcF?imcCF.color:undefined}/>
                  </div>
                  {/* Linha 2: Cintura / Quadril / RCQ */}
                  <div style={{...css.row("1fr 1fr 1fr"),marginBottom:a.pressao?12:0}}>
                    <ReadField label="Cintura" value={a.cintura?a.cintura+" cm":""}/>
                    <ReadField label="Quadril" value={a.quadril?a.quadril+" cm":""}/>
                    <ReadField label="RCQ" value={rcqF?rcqF+" — "+rcqCF.label:""} color={rcqF?rcqCF.color:undefined}/>
                  </div>
                  {/* Linha 3: Pressão Arterial */}
                  {a.pressao&&(
                    <ReadField label="Pressão Arterial" value={a.pressao+(paF?" — "+paF.label:"")} color={paF?.color}/>
                  )}
                </div>
              );
            })()}

            <div style={css.card}>
              <div style={css.secHdr}>Saúde e Anamnese</div>
              <div style={{display:"grid",gap:8}}>
                {[{l:"Doenças",v:a.doencas},{l:"Medicamentos",v:a.medicamentos},{l:"Lesões",v:a.lesoes},{l:"Alergias",v:a.alergias}].map(({l,v})=>(
                  <ReadField key={l} label={l} value={v}/>
                ))}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[{l:"Fumante",v:a.fumante},{l:"Alcool",v:a.alcool},{l:"Insonia",v:a.insonia},{l:"Estresse",v:a.nivelEstresse}].map(({l,v})=>(
                    <ReadField key={l} label={l} value={v}/>
                  ))}
                </div>
              </div>
            </div>
            {/* Contato de emergência */}
            {(a.nomeEmergencia||a.telEmergencia)&&(
              <div style={{...css.card,background:"#1a0808",border:"1px solid #7f1d1d30"}}>
                <div style={{...css.secHdr,color:"#f87171"}}>Contato de Emergencia</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <ReadField label="Nome" value={a.nomeEmergencia}/>
                  <ReadField label="Telefone" value={a.telEmergencia}/>
                </div>
              </div>
            )}
          </>}

          {/* ── AVALIACAO ── */}
          {dTab==="avaliacao"&&<>
            <div style={{marginBottom:12}}>
              <GaleriaFotosEvolucao
                fotos={a.fotosEvolucao||[]}
                podeEditar={false}
                onUpdateFotos={()=>{}}
              />
            </div>
            <AvaliacaoAlunoView aluno={a}/>
          </>}

          {/* ── OUVIDORIA ── */}
          {dTab==="ouvidoria"&&<OuvidoriaView aluno={a} prof={prof}/>}
        </div>
      </div>
    );
  }

  // ── TELA SELECAO AGENDA ───────────────────────────────────────────────────
  if(view==="agendaSelecao"){
    return(
      <AgendaSelecaoView
        profissionais={profissionais}
        onVoltar={()=>setView("profissionais")}
        onSelect={p=>{ setAgendaProfSel(p); setView("agenda"); }}
        onBuscar={()=>setView("agendaBusca")}
      />
    );
  }

  // ── TELA BUSCA DE VAGAS ────────────────────────────────────────────────────
  if(view==="agendaBusca"){
    return(
      <AgendaBuscaView
        profissionais={profissionais}
        agendas={agendas}
        onVoltar={()=>setView("agendaSelecao")}
        onAbrirAgenda={p=>{ setAgendaProfSel(p); setView("agenda"); }}
      />
    );
  }

  // ── TELA AGENDA (grade do profissional selecionado) ──────────────────────
  if(view==="agenda"&&agendaProfSel){
    const agendaDoProf = agendas[agendaProfSel.id] || {};
    // Observacao: apenas o dono da agenda ou o admin podem editar/adicionar.
    const podeEditarObsAgenda = currentUser?.role==="admin" || currentUser?.id===agendaProfSel.id;
    return(
      <AgendaGridView
        prof={agendaProfSel}
        agenda={agendaDoProf}
        alunos={alunos}
        podeEditarObs={podeEditarObsAgenda}
        onAbrirAluno={(aluno)=>{
          // Ajusta o profissional selecionado para o dono real do aluno,
          // para que os controles de edição da ficha funcionem corretamente.
          const donoDoAluno = profissionais.find(p=>p.id===aluno.profissionalId);
          if(donoDoAluno) setProfSelecionado(donoDoAluno);
          setSelected(aluno);
          setDTab("ficha");
          setView("detail");
        }}
        onVoltar={()=>setView("agendaSelecao")}
        onUpdateCelula={async(key,val)=>{
          try{
            await atualizarCelulaAgenda(agendaProfSel.id, key, (!val.status && !val.nome) ? null : val);
          }catch(e){
            console.error("Erro ao atualizar celula da agenda:", e);
          }
        }}
        onUpdateHorariosPorDia={async(dia, novaLista)=>{
          try{
            await atualizarHorariosPorDia(agendaProfSel.id, dia, novaLista);
          }catch(e){
            console.error("Erro ao atualizar horarios da agenda:", e);
          }
        }}
      />
    );
  }

  // ── TELA SELECAO PAGAMENTOS ───────────────────────────────────────────────
  if(view==="pagamentosSelecao"){
    return(
      <PagamentosSelecaoView
        profissionais={profissionais}
        isAdmin={currentUser?.role==="admin"}
        onVoltar={()=>setView("profissionais")}
        onSelect={p=>{ setPagamentosProfSel(p); setView("pagamentos"); }}
        onVerConsolidado={()=>setView("pagamentosConsolidado")}
      />
    );
  }

  // ── TELA PAGAMENTOS (planilha do profissional selecionado) ───────────────
  if(view==="pagamentos"&&pagamentosProfSel){
    const pagamentosDoProf = pagamentos[pagamentosProfSel.id] || {};
    // Admin pode editar qualquer planilha; profissional so pode editar a propria.
    const podeEditarPagamentos = currentUser?.role==="admin" || currentUser?.id===pagamentosProfSel.id;
    return(
      <PagamentosView
        prof={pagamentosProfSel}
        pagamentosDoProf={pagamentosDoProf}
        alunos={alunos}
        podeEditar={podeEditarPagamentos}
        onVoltar={()=>setView("pagamentosSelecao")}
        onUpdateMes={async(mes, novasLinhas)=>{
          if(!podeEditarPagamentos){
            return;
          }
          try{
            await atualizarMesPagamento(pagamentosProfSel.id, mes, novasLinhas);
          }catch(e){
            console.error("Erro ao atualizar pagamentos:", e);
          }
        }}
      />
    );
  }

  // ── TELA CONSOLIDADO DE PAGAMENTOS (admin) ───────────────────────────────
  if(view==="pagamentosConsolidado"){
    return(
      <PagamentosConsolidadoView
        profissionais={profissionais}
        pagamentos={pagamentos}
        onVoltar={()=>setView("pagamentosSelecao")}
      />
    );
  }

  // ── TELA PROFISSIONAIS ────────────────────────────────────────────────────
  if(view==="profissionais"){
    // Conta mensagens não lidas de todos os alunos
    const totalMsgs = alunos.reduce((acc,a)=>{
      const msgs = ouvidorias[a.id] || [];
      return acc+msgs.filter(m=>m.status==="Enviado").length;
    },0);

    return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><LogoUP size={36}/><div style={{fontWeight:800,fontSize:18,color:'#f97316',letterSpacing:.5}}>UP <span style={{color:'#fbbf24'}}>Fitness</span></div></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Botão Backup (exportar/importar) */}
          <button onClick={exportarBackup}
            title="Exportar backup dos dados"
            style={{background:"#0f1a0a",border:"1px solid #34d39940",
              borderRadius:9,padding:"7px 10px",cursor:"pointer",fontFamily:"Inter,sans-serif",
              display:"flex",alignItems:"center",gap:5,color:"#34d399",fontWeight:600,fontSize:12}}>
            💾
          </button>
          <button onClick={()=>{setImportTexto("");setImportErro("");setImportSucesso("");setImportModalAberto(true);}}
            title="Importar backup dos dados"
            style={{background:"#0f1a0a",border:"1px solid #34d39940",
              borderRadius:9,padding:"7px 10px",cursor:"pointer",fontFamily:"Inter,sans-serif",
              display:"flex",alignItems:"center",gap:5,color:"#34d399",fontWeight:600,fontSize:12}}>
            📂
          </button>
          {/* Botão Ouvidoria com badge */}
          <button onClick={()=>setView("ouvidoriaAdmin")}
            style={{position:"relative",background:"#0f0a1a",border:"1px solid #6366f140",
              borderRadius:9,padding:"7px 12px",cursor:"pointer",fontFamily:"Inter,sans-serif",
              display:"flex",alignItems:"center",gap:6,color:"#a78bfa",fontWeight:600,fontSize:12}}>
            📣 Ouvidoria
            {totalMsgs>0&&(
              <span style={{position:"absolute",top:-6,right:-6,background:"#f87171",color:"#fff",
                borderRadius:"50%",width:18,height:18,fontSize:10,fontWeight:800,
                display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #0a0a0a"}}>
                {totalMsgs>9?"9+":totalMsgs}
              </span>
            )}
          </button>
          <button style={css.btnB} onClick={sair}>Sair</button>
        </div>
      </header>
      <div style={css.wrap}>
        <div style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:18,marginBottom:4,color:"#f97316"}}>Profissionais</div>
          <div style={{fontSize:13,color:C.muted}}>Selecione um profissional para ver sua carteira de alunos</div>
        </div>

        <div style={{...css.row("1fr 1fr 1fr"),marginBottom:12}}>
          {[
            {l:"Total alunos",v:alunos.length,c:C.accent},
            {l:"Profissionais",v:profissionais.length,c:"#6366f1"},
            {l:"Ativos",v:alunos.filter(a=>a.ativo).length,c:C.green},
          ].map(s=>(
            <div key={s.l} style={css.stat(s.c)}>
              <div style={{fontSize:24,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:11,color:C.muted,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Card de acesso à Agenda de Horários */}
        <button onClick={()=>setView("agendaSelecao")}
          style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:12,
            padding:"14px 16px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:10,
            display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#34d39920",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📅</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#34d399"}}>Agenda de Horarios</div>
            <div style={{fontSize:11,color:C.muted}}>Ver e editar horarios dos profissionais</div>
          </div>
          <span style={{color:"#34d399",fontSize:20}}>›</span>
        </button>

        {/* Card de acesso a Pagamentos */}
        <button onClick={()=>setView("pagamentosSelecao")}
          style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:12,
            padding:"14px 16px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:20,
            display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#34d39920",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>💰</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#34d399"}}>Pagamentos</div>
            <div style={{fontSize:11,color:C.muted}}>Planilha de mensalidades por profissional</div>
          </div>
          <span style={{color:"#34d399",fontSize:20}}>›</span>
        </button>

        <div style={{display:"grid",gridTemplateColumns:"1fr",gap:10}}>
          {[...profissionais].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(p=>{
            const meus=alunos.filter(a=>a.profissionalId===p.id);
            const ativos=meus.filter(a=>a.ativo).length;
            const pal=["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ef4444","#06b6d4"];
            const cor=pal[(p.nome?.charCodeAt(0)||0)%pal.length];
            return(
              <div key={p.id}
                onClick={()=>{setProfSelecionado(p);setBusca("");setView("home");}}
                style={{...css.card,cursor:"pointer",padding:"14px 16px",transition:"border-color .15s",display:"flex",alignItems:"center",gap:14,boxSizing:"border-box",width:"100%"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=cor;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#332010";}}>
                <Avatar nome={p.nome} foto={p.foto} size={48}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:2}}>
                    <span style={{fontWeight:700,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nome}</span>
                    {currentUser.role==="admin"&&<span style={css.badge(p.role==="admin"?"#f97316":"#6366f1")}>{p.role==="admin"?"Admin":"Personal"}</span>}
                  </div>

                  <div style={{display:"flex",gap:10}}>
                    <span style={{fontSize:12,color:cor,fontWeight:700}}>{meus.length} alunos</span>
                    <span style={{fontSize:12,color:C.green}}>{ativos} ativos</span>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                  {(currentUser?.role==="admin"||currentUser?.id===p.id)&&(
                    <button onClick={e=>{e.stopPropagation();setEditProfModal({...p});}}
                      style={{background:"#241408",border:"1px solid #f9731650",color:"#f97316",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                      ✎ Editar
                    </button>
                  )}
                  <span style={{color:"#3d2010",fontSize:20,textAlign:"center"}}>›</span>
                </div>
              </div>
            );
          })}
        </div>

        {currentUser.role==="admin"&&(
          <button onClick={()=>setView("addProf")}
            style={{...css.btnC,width:"100%",marginTop:14,padding:"12px",fontSize:13}}>
            + Adicionar profissional
          </button>
        )}
      </div>
      {/* ── FIX: modal global renderizado aqui também ── */}
      {modalEditProfGlobal}

      {/* Modal de Backup (exportar) */}
      {backupTexto!==null&&(
        <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:6,color:"#34d399"}}>💾 Backup dos Dados</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
              Toque no campo abaixo para selecionar tudo, depois toque em "Copiar". Se o botao nao funcionar, toque e segure o texto para copiar manualmente. Cole num arquivo de texto (.json) ou nas Notas/Drive.
            </div>
            <textarea
              ref={backupTextareaRef}
              readOnly
              value={backupTexto}
              onFocus={e=>e.target.select()}
              onClick={e=>e.target.select()}
              style={{flex:1,minHeight:200,background:"#0a0a0a",border:"1px solid #2a1a08",borderRadius:8,
                padding:10,fontSize:10,color:C.text,fontFamily:"monospace",resize:"none",marginBottom:14}}
            />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>setBackupTexto(null)} style={{...css.btnB,width:"100%",padding:"12px"}}>Fechar</button>
              <button onClick={()=>{
                const ta = backupTextareaRef.current;
                let copiado = false;
                if(ta){
                  ta.focus();
                  ta.select();
                  ta.setSelectionRange(0, ta.value.length);
                  try{ copiado = document.execCommand("copy"); }catch(e){ copiado = false; }
                }
                if(copiado){
                  alert("Backup copiado! Cole num arquivo .json e guarde em local seguro.");
                } else if(navigator.clipboard && navigator.clipboard.writeText){
                  navigator.clipboard.writeText(backupTexto)
                    .then(()=>alert("Backup copiado! Cole num arquivo .json e guarde em local seguro."))
                    .catch(()=>alert("Não foi possível copiar automaticamente. O texto já está selecionado — use o comando de copiar do seu dispositivo (Ctrl+C ou toque e segure)."));
                } else {
                  alert("Não foi possível copiar automaticamente. O texto já está selecionado — use o comando de copiar do seu dispositivo (Ctrl+C ou toque e segure).");
                }
              }} style={{...css.btnA,width:"100%",padding:"12px",background:"linear-gradient(135deg,#059669,#34d399)"}}>
                📋 Copiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Importar Backup */}
      {importModalAberto&&(
        <div style={{position:"fixed",inset:0,background:"#000000ee",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:20,width:"100%",maxWidth:500,maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:6,color:"#34d399"}}>📂 Importar Backup</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14,lineHeight:1.6}}>
              Isso vai substituir todos os dados atuais. Escolha um arquivo .json ou cole o conteudo do backup abaixo.
            </div>

            <label style={{...css.btnC,textAlign:"center",padding:"12px",marginBottom:14,cursor:"pointer",display:"block"}}>
              📁 Escolher arquivo .json
              <input type="file" accept="application/json" style={{display:"none"}}
                onChange={e=>{
                  const file = e.target.files[0];
                  if(file){
                    const reader = new FileReader();
                    reader.onload = (ev)=>{ restaurarBackupDeJson(ev.target.result); };
                    reader.readAsText(file);
                  }
                  e.target.value = "";
                }}/>
            </label>

            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{flex:1,height:1,background:"#2a1a08"}}/>
              <span style={{fontSize:11,color:C.muted}}>ou cole o texto</span>
              <div style={{flex:1,height:1,background:"#2a1a08"}}/>
            </div>

            <textarea
              value={importTexto}
              onChange={e=>{setImportTexto(e.target.value);setImportErro("");setImportSucesso("");}}
              placeholder="Cole aqui o conteudo do backup (.json)..."
              style={{flex:1,minHeight:140,background:"#0a0a0a",border:"1px solid "+(importErro?"#f8717170":"#2a1a08"),borderRadius:8,
                padding:10,fontSize:11,color:C.text,fontFamily:"monospace",resize:"none",marginBottom:8}}
            />

            <div style={{fontSize:10,color:C.muted,marginBottom:10}}>
              {importTexto.length>0?`${importTexto.length} caracteres colados`:"Nenhum texto colado ainda"}
            </div>

            {importErro&&(
              <div style={{background:"#1a0808",border:"1px solid #7f1d1d60",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                <div style={{fontSize:12,color:"#f87171",fontWeight:600,lineHeight:1.5}}>⚠ {importErro}</div>
              </div>
            )}
            {importSucesso&&(
              <div style={{background:"#0a1a10",border:"1px solid #34d39960",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                <div style={{fontSize:12,color:"#34d399",fontWeight:600,lineHeight:1.5}}>✓ {importSucesso}</div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button onClick={()=>{setImportModalAberto(false);setImportErro("");setImportSucesso("");setImportTexto("");}}
                style={{...css.btnB,width:"100%",padding:"12px"}}>
                {importSucesso?"Fechar":"Cancelar"}
              </button>
              {!importSucesso&&(
                <button
                  disabled={!importTexto.trim()}
                  onClick={()=>restaurarBackupDeJson(importTexto)}
                  style={{...css.btnA,width:"100%",padding:"12px",opacity:importTexto.trim()?1:.5}}>
                  Restaurar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {atalhoAberto&&(
        <AtalhoRapidoModal
          alunos={alunos}
          profissionais={profissionais}
          onClose={()=>setAtalhoAberto(false)}
          onAbrirTreinoDoAluno={(aluno)=>{
            const donoDoAluno = profissionais.find(p=>p.id===aluno.profissionalId);
            if(donoDoAluno) setProfSelecionado(donoDoAluno);
            setAtalhoAberto(false);
            setSelected(aluno);
            setDTab("treino");
            setView("detail");
          }}
          onVisualizarTodos={(itens)=>{
            setAtalhoItensVisualizacao(itens);
            setAtalhoAberto(false);
            setView("atalhoVisualizacao");
          }}
        />
      )}
    </div>
    );
  }

  // ── TELA OUVIDORIA ADMIN ──────────────────────────────────────────────────
  if(view==="ouvidoriaAdmin"){
    // Coleta todas as mensagens de todos os alunos, a partir do estado ja
    // sincronizado em tempo real com o Firestore.
    const todasMsgs = alunos.flatMap(a=>{
      const msgs = ouvidorias[a.id] || [];
      return msgs.map(m=>({...m, alunoId:a.id, alunoNome:a.nome, alunoFoto:a.foto}));
    }).sort((a,b)=>new Date(b.data+' '+b.hora)-new Date(a.data+' '+a.hora));

    const naoLidas=todasMsgs.filter(m=>m.status==="Enviado").length;

    const atualizarStatus=async(alunoId,msgId,novoStatus)=>{
      const msgs = ouvidorias[alunoId] || [];
      const updated=msgs.map(m=>m.id===msgId?{...m,status:novoStatus}:m);
      try{
        await adicionarMensagemOuvidoria(alunoId, updated);
      }catch(e){
        console.error("Erro ao atualizar status da ouvidoria:", e);
      }
    };

    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={()=>setView("profissionais")}>← Voltar</button>
          <div style={{fontWeight:700,fontSize:15}}>📣 Ouvidoria</div>
          <div style={{fontSize:11,color:naoLidas>0?C.red:C.muted,fontWeight:700}}>
            {naoLidas>0?`${naoLidas} nova${naoLidas!==1?"s":""}` : "Tudo lido"}
          </div>
        </header>
        <div style={css.wrap}>
          {/* Stats */}
          <div style={{...css.row("1fr 1fr 1fr"),marginBottom:16}}>
            {[
              {l:"Total",v:todasMsgs.length,c:"#a78bfa"},
              {l:"Novas",v:naoLidas,c:C.red},
              {l:"Respondidas",v:todasMsgs.filter(m=>m.status==="Respondido").length,c:C.green},
            ].map(s=>(
              <div key={s.l} style={css.stat(s.c)}>
                <div style={{fontSize:22,fontWeight:800,color:s.c}}>{s.v}</div>
                <div style={{fontSize:10,color:C.muted,fontWeight:600}}>{s.l}</div>
              </div>
            ))}
          </div>

          {todasMsgs.length===0
            ?<div style={{...css.card,textAlign:"center",padding:"40px 20px"}}>
                <div style={{fontSize:32,marginBottom:12}}>📣</div>
                <div style={{fontSize:14,color:C.muted}}>Nenhuma mensagem recebida ainda.</div>
              </div>
            :todasMsgs.map((m,i)=>{
              const statusColor=m.status==="Respondido"?C.green:m.status==="Em analise"?"#fbbf24":"#f87171";
              const isNova=m.status==="Enviado";
              return(
                <div key={m.id||i} style={{...css.card,
                  border:"1px solid "+(isNova?"#f8717140":"#332010"),
                  background:isNova?"#1a0808":C.card,marginBottom:10}}>
                  {/* Cabeçalho */}
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <Avatar nome={m.alunoNome} foto={m.alunoFoto} size={36}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:C.text}}>{m.alunoNome}</div>
                      <div style={{fontSize:11,color:"#a78bfa",fontWeight:600}}>{m.assunto}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:10,color:C.muted}}>{m.data} {m.hora}</div>
                      {isNova&&<div style={{fontSize:10,color:"#f87171",fontWeight:700,marginTop:2}}>● Nova</div>}
                    </div>
                  </div>

                  {/* Mensagem */}
                  <div style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,
                    padding:"10px 12px",fontSize:13,color:C.text,lineHeight:1.6,marginBottom:10}}>
                    {m.mensagem}
                  </div>

                  {/* Status + ações */}
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <select
                      value={m.status}
                      onChange={e=>atualizarStatus(m.alunoId,m.id,e.target.value)}
                      style={{...css.input,flex:1,padding:"7px 10px",fontSize:16,color:statusColor,
                        border:"1px solid "+statusColor+"50",minWidth:120}}>
                      <option>Enviado</option>
                      <option>Em analise</option>
                      <option>Respondido</option>
                    </select>
                    {/* Responder via WhatsApp */}
                    {(()=>{
                      const aluno=alunos.find(a=>a.id===m.alunoId);
                      const tel=(aluno?.telefone||"").replace(/\D/g,"");
                      if(!tel) return null;
                      return(
                        <button onClick={()=>{
                          const msg=`Ola ${m.alunoNome.split(" ")[0]}! Recebemos sua mensagem sobre "${m.assunto}" e `;
                          window.open(`https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`,"_blank");
                          atualizarStatus(m.alunoId,m.id,"Respondido");
                        }} style={{background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",
                          border:"none",borderRadius:8,padding:"7px 12px",fontWeight:700,fontSize:12,
                          cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                          <span>📱</span> Responder
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>
    );
  }

  // ── TELA ADICIONAR PROFISSIONAL (admin) ───────────────────────────────────
  if(view==="addProf")return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={()=>setView("profissionais")}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Novo Profissional</div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>
        <AddProfForm
          onSave={()=>{
            // O AddProfForm ja salva direto no Firestore (Authentication + doc do profissional).
            // A lista de profissionais atualiza sozinha via listener em tempo real.
            setView("profissionais");
          }}
          onCancel={()=>setView("profissionais")}
        />
      </div>
    </div>
  );

  // ── HOME (alunos do profissional) ─────────────────────────────────────────
  // ── VISUALIZACAO ATALHO RAPIDO (abas entre alunos) ────────────────────────
  if(view==="atalhoVisualizacao"&&atalhoItensVisualizacao){
    return(
      <AtalhoVisualizacaoView
        itens={atalhoItensVisualizacao}
        alunos={alunos}
        onVoltar={()=>{
          setView("profissionais");
          setAtalhoItensVisualizacao(null);
          setAtalhoAberto(true);
        }}
      />
    );
  }

  if(view==="home")return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={()=>{setView("profissionais");setProfSelecionado(null);}}>← Voltar</button>
        <div style={{textAlign:"center",minWidth:0}}>
          <div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profSelecionado?.nome}</div>
          <div style={{fontSize:11,color:C.muted}}>{profSelecionado?.especialidade}</div>
        </div>
        {podeEditar
          ?<div style={{display:"flex",gap:8}}>
            <button style={{...css.btnA,background:"#1a1008",color:"#f97316",border:"1px solid #f9731640",fontSize:12,padding:"8px 12px"}}
              onClick={()=>{setLinkGerado('');setLinkNome('');setLinkEmail('');setLinkTelefone('');setLinkModal(true);}}>🔗 Link</button>
            <button style={{...css.btnA,fontSize:12,padding:"8px 12px"}} onClick={openNew}>+ Aluno</button>
          </div>
          :<div style={{width:70,fontSize:11,color:C.muted,textAlign:"right"}}>Somente leitura</div>
        }
      </header>
      <div style={css.wrap}>
        <div style={{...css.row("1fr 1fr 1fr"),marginBottom:14}}>
          {[
            {l:"Total",v:alunosDoProf.length,c:C.accent},
            {l:"Ativos",v:alunosDoProf.filter(a=>a.ativo).length,c:C.green},
            {l:"Inativos",v:alunosDoProf.filter(a=>!a.ativo).length,c:C.red}
          ].map(s=>(
            <div key={s.l} style={css.stat(s.c)}>
              <div style={{fontSize:20,fontWeight:800,color:s.c}}>{s.v}</div>
              <div style={{fontSize:10,color:C.muted,fontWeight:600}}>{s.l}</div>
            </div>
          ))}
        </div>
        {!podeEditar&&(
          <div style={{background:"#f9731610",border:"1px solid #f9731630",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#f97316"}}>
            👁 Voce esta visualizando a carteira de {profSelecionado?.nome}.
          </div>
        )}

        {/* Atalho rápido: busca aluno + treino, monta lista do dia */}
        <button onClick={()=>setAtalhoAberto(true)}
          style={{width:"100%",background:"#0a1a10",border:"1px solid #34d39950",borderRadius:12,
            padding:"14px 16px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:10,
            display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#34d39920",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>⚡</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#34d399"}}>Atalho Rapido</div>
            <div style={{fontSize:11,color:C.muted}}>Busque alunos de qualquer profissional e monte sua lista de hoje</div>
          </div>
          <span style={{color:"#34d399",fontSize:20}}>›</span>
        </button>

        {/* Envio de mensagem em massa */}
        <button onClick={()=>setEnvioMassaAberto(true)}
          style={{width:"100%",background:"#0a1a10",border:"1px solid #25d36650",borderRadius:12,
            padding:"14px 16px",cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:14,
            display:"flex",alignItems:"center",gap:12,textAlign:"left"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#25d36620",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>📋</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:14,color:"#25d366"}}>Envio em Massa</div>
            <div style={{fontSize:11,color:C.muted}}>{currentUser?.role==="admin" ? "Selecione alunos de qualquer profissional" : "Selecione alunos da sua carteira"}</div>
          </div>
          <span style={{color:"#25d366",fontSize:20}}>›</span>
        </button>
        <input style={{...css.input,marginBottom:14,padding:"10px 14px",fontSize:16}} placeholder="Buscar aluno..." value={busca} onChange={e=>setBusca(e.target.value)}/>
        {lista.length===0&&<div style={{textAlign:"center",color:C.muted,padding:40}}>Nenhum aluno encontrado.</div>}
        {lista.map(a=>{
          const im=calcIMC(a.peso,a.altura),ic=classIMC(im);
          const dias=a.diasTreino||[];
          const horarios=a.horariosTreino||{};
          return(
            <div key={a.id} style={{...css.card,cursor:"pointer",transition:"border-color .15s",boxSizing:"border-box",width:"100%"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#332010";}}
              onClick={()=>openDetail(a)}>
              <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:dias.length>0?10:0}}>
                <Avatar nome={a.nome} foto={a.foto} size={46}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:3}}>
                    <span style={{fontWeight:700,fontSize:15}}>{a.nome}</span>
                    <span style={css.badge(a.ativo?"#34d399":"#f87171")}>{a.ativo?"Ativo":"Inativo"}</span>
                    <span style={css.badge("#6366f1")}>{a.objetivo}</span>
                  </div>
                  <div style={{color:C.muted,fontSize:12}}>{a.sexo} · {a.idade} anos</div>
                  <div style={{display:"flex",gap:10,marginTop:4,flexWrap:"wrap"}}>
                    {im&&<span style={{fontSize:12,color:ic.color,fontWeight:700}}>IMC {im}</span>}
                    {a.peso&&<span style={{fontSize:12,color:"#c2cdd8"}}>{a.peso} kg</span>}
                    {a.frequencia&&<span style={{fontSize:12,color:"#c2cdd8"}}>{a.frequencia}/sem</span>}
                    {(()=>{const s=statusMensalidade(a.diaVencimento);return s&&s.urgente?<span style={{fontSize:11,fontWeight:700,color:s.color}}>💳 {s.label}</span>:null;})()}
                  </div>
                </div>
                <span style={{color:"#3d2010",fontSize:20,flexShrink:0}}>›</span>
              </div>
              {dias.length>0&&(
                <div style={{borderTop:"1px solid #2e1e0a",paddingTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                  {dias.map(d=>(
                    <div key={d} style={{background:C.accent+"15",border:"1px solid "+C.accent+"30",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:11,fontWeight:700,color:C.accent}}>{d}</span>
                      {horarios[d]&&<span style={{fontSize:11,color:C.muted}}>{horarios[d]}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal gerar link */}
      {linkModal&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:400}}>
          <div style={{background:C.card,borderRadius:"20px 20px 0 0",padding:"24px 20px 40px",width:"100%",maxWidth:600,border:"1px solid #332010"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:16}}>🔗 Gerar link de cadastro</div>
              <button onClick={()=>{setLinkModal(false);setLinkGerado('');}} style={{background:"transparent",border:"none",color:C.muted,fontSize:22,cursor:"pointer"}}>×</button>
            </div>
            {!linkGerado ? <>
              <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}}>
                O aluno receberá um link para preencher seus dados. Expira em 72 horas.
              </div>
              <div style={{display:"grid",gap:12,marginBottom:20}}>
                <div>
                  <label style={css.lbl}>Nome do aluno (opcional)</label>
                  <input style={css.input} placeholder="Ex: Maria Silva" value={linkNome} onChange={e=>setLinkNome(e.target.value)}/>
                </div>
                <div>
                  <label style={css.lbl}>WhatsApp do aluno (opcional)</label>
                  <input style={css.input} type="tel" placeholder="(11) 99999-9999" value={linkTelefone} onChange={e=>setLinkTelefone(e.target.value)}/>
                </div>
                <div>
                  <label style={css.lbl}>E-mail do aluno (opcional)</label>
                  <input style={css.input} type="email" placeholder="aluno@email.com" value={linkEmail} onChange={e=>setLinkEmail(e.target.value)}/>
                </div>
              </div>
              <button onClick={()=>{
                const url = gerarLink();
                const tel=(linkTelefone||"").replace(/\D/g,"");
                if(tel){
                  const msg=encodeURIComponent(`Ola${linkNome?" "+linkNome:""}! Acesse o link abaixo para preencher seu cadastro na UP Fitness:\n\n${url}\n\nO link expira em 72 horas.`);
                  window.open(`https://wa.me/55${tel}?text=${msg}`,"_blank");
                }
              }} style={{...css.btnA,width:"100%",padding:"13px",fontSize:15}}>
                {(linkTelefone||"").replace(/\D/g,"") ? "🔗 Gerar e Enviar pelo WhatsApp" : "Gerar link"}
              </button>
            </> : <>
              <div style={{background:"#121212",border:"1px solid #3d2010",borderRadius:10,padding:"14px",marginBottom:12,wordBreak:"break-all",fontSize:12,color:"#f97316",lineHeight:1.6}}>{linkGerado}</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:14}}>✓ Valido por 72 horas. Compartilhe com {linkNome||"o aluno"}.</div>

              {/* Botão WhatsApp destacado */}
              <button onClick={()=>{
                const tel=(linkTelefone||"").replace(/\D/g,"");
                const msg=encodeURIComponent(`Ola${linkNome?" "+linkNome:""}! Acesse o link abaixo para preencher seu cadastro na UP Fitness:\n\n${linkGerado}\n\nO link expira em 72 horas.`);
                const url=tel
                  ? `https://wa.me/55${tel}?text=${msg}`
                  : `https://wa.me/?text=${msg}`;
                window.open(url,"_blank");
              }} style={{width:"100%",background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",border:"none",borderRadius:9,padding:"13px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"Inter,sans-serif",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <span style={{fontSize:18}}>📱</span> Enviar pelo WhatsApp
              </button>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <button onClick={copiarLink} style={{background:linkCopiado?"#14301a":"#1a1008",color:linkCopiado?"#34d399":"#f97316",border:"1px solid "+(linkCopiado?"#34d39940":"#f9731640"),borderRadius:9,padding:"11px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{linkCopiado?"✓ Copiado!":"Copiar link"}</button>
                <button onClick={compartilharLink} style={{...css.btnA,padding:"11px"}}>Compartilhar</button>
              </div>
              <button onClick={()=>{setLinkGerado('');setLinkNome('');setLinkEmail('');setLinkTelefone('');}} style={{background:"transparent",border:"none",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",width:"100%",marginTop:12,padding:"8px"}}>Gerar outro link</button>
            </>}
          </div>
        </div>
      )}
      {modalEditProfGlobal}

      {atalhoAberto&&(
        <AtalhoRapidoModal
          alunos={alunos}
          profissionais={profissionais}
          onClose={()=>setAtalhoAberto(false)}
          onAbrirTreinoDoAluno={(aluno)=>{
            const donoDoAluno = profissionais.find(p=>p.id===aluno.profissionalId);
            if(donoDoAluno) setProfSelecionado(donoDoAluno);
            setAtalhoAberto(false);
            setSelected(aluno);
            setDTab("treino");
            setView("detail");
          }}
          onVisualizarTodos={(itens)=>{
            setAtalhoItensVisualizacao(itens);
            setAtalhoAberto(false);
            setView("atalhoVisualizacao");
          }}
        />
      )}

      {envioMassaAberto&&(
        <ModalEnvioEmMassa
          alunosDoProf={alunosParaMensagem}
          onClose={()=>setEnvioMassaAberto(false)}
        />
      )}

      {buscaGlobalAberta&&(
        <BuscaGlobalModal
          alunos={alunos}
          profissionais={profissionais}
          texto={buscaGlobalTexto}
          onTexto={setBuscaGlobalTexto}
          onClose={()=>setBuscaGlobalAberta(false)}
          onAbrirAluno={(aluno)=>{
            // Ajusta o profissional selecionado para o dono real do aluno,
            // para que os controles de edição da ficha funcionem corretamente.
            const donoDoAluno = profissionais.find(p=>p.id===aluno.profissionalId);
            if(donoDoAluno) setProfSelecionado(donoDoAluno);
            setBuscaGlobalAberta(false);
            setSelected(aluno);
            setDTab("treino");
            setView("detail");
          }}
        />
      )}
    </div>
  );

  // ── AVALIACAO VIEW ────────────────────────────────────────────────────────
  if(view==="avaliacao"&&selected){
    const a=alunos.find(x=>x.id===selected.id)||selected;
    return <AvaliacaoFormView aluno={a} onVoltar={()=>setView("detail")}
      onSalvar={async(snapshot)=>{
        const upd=prev=>({...prev,historicoAvaliacoes:[snapshot,...(prev.historicoAvaliacoes||[])]});
        const alunoAtualizado = upd(a);
        try{
          await salvarAluno(a.id, {historicoAvaliacoes:alunoAtualizado.historicoAvaliacoes});
        }catch(e){
          console.error("Erro ao salvar avaliacao:", e);
        }
        setSelected(alunoAtualizado);
      }}
    />;
  }

  // ── FORM ──────────────────────────────────────────────────────────────────
  if(view==="form")return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={()=>setView(editId?"detail":"home")}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>{editId?"Editar Aluno":"Novo Aluno"}</div>
        <button style={css.btnA} onClick={save}>✓ Salvar</button>
      </header>
      <div style={css.wrap}>
        <StepBar page={pg} total={4} onSelect={n=>{if(!form.nome.trim()&&n>1)return alert("Nome obrigatório.");setPg(n);}} editMode={!!editId}/>

        {/* ── PG 1: Dados + Anamnese ── */}
        {pg===1&&<>
          {/* Foto */}
          <div style={{...css.card,display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
            <Avatar nome={form.nome} foto={form.foto} size={60}/>
            <div>
              <div style={{fontWeight:600,color:form.nome?C.text:C.muted,marginBottom:8}}>{form.nome||"Nome do aluno"}</div>
              <label style={{...css.btnC,cursor:"pointer"}}>
                Adicionar foto
                <input type="file" accept="image/*" style={{display:"none"}} onChange={handleFoto}/>
              </label>
            </div>
          </div>

          <div style={css.card}>
            <div style={css.secHdr}>Dados Pessoais</div>
            <Inp label="Nome completo *" value={form.nome} onChange={v=>u("nome",v)} placeholder="Ana Paula Silva"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:4}}>
              <Sel label="Sexo" value={form.sexo} onChange={v=>u("sexo",v)} opts={["Masculino","Feminino","Outro"]}/>
              <Inp label="Idade" type="number" value={form.idade} onChange={v=>u("idade",v)} placeholder="30"/>
            </div>
            <div style={{marginTop:4}}>
              <DateScrollPicker label="Data de nascimento" value={form.dataNasc} onChange={v=>u("dataNasc",v)}/>
            </div>
            <div style={{...css.row("1fr 1fr"),marginTop:4}}>
              <Inp label="Telefone / WhatsApp" value={form.telefone} onChange={v=>u("telefone",v)} placeholder="(11) 99999-9999"/>
              <Inp label="E-mail" value={form.email} onChange={v=>u("email",v)} placeholder="aluno@email.com"/>
            </div>
            <div style={{...css.row("1fr 1fr"),marginTop:4}}>
              <Inp label="Contato emergência" value={form.nomeEmergencia} onChange={v=>u("nomeEmergencia",v)} placeholder="Nome"/>
              <Inp label="Tel. emergência" value={form.telEmergencia} onChange={v=>u("telEmergencia",v)} placeholder="(11) 99999-9999"/>
            </div>
            <div style={{marginTop:4}}><Inp label="Endereço" value={form.endereco} onChange={v=>u("endereco",v)} placeholder="Rua, número - Bairro, Cidade/UF"/></div>
            <div style={{...css.row("repeat(auto-fill,minmax(130px,1fr))"),marginTop:4}}>
              <Inp label="Profissão" value={form.profissao} onChange={v=>u("profissao",v)} placeholder="Ex: Professor"/>
              <Sel label="Objetivo principal" value={form.objetivo} onChange={v=>u("objetivo",v)} opts={OBJETIVOS}/>
              <Sel label="Objetivo secundário" value={form.objetivo2||""} onChange={v=>u("objetivo2",v)} placeholder="-- Nenhum --" opts={OBJETIVOS}/>
            </div>
            <div style={{...css.row("1fr 1fr"),marginTop:4}}>
              <Sel label="Nível de atividade" value={form.nivelAtividade} onChange={v=>u("nivelAtividade",v)} opts={NIVEIS_AT}/>
            </div>

            <div style={{marginTop:4,background:"#0a1a10",border:"1px solid #34d39930",borderRadius:10,padding:"14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>Mensalidade</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,alignItems:"end"}}>
                <Inp label="Plano" value={form.plano||""} onChange={v=>u("plano",v)} placeholder="Ex: Mensal"/>
                <Inp label="Valor (R$)" type="number" step="0.01" value={form.valorMensalidade||""} onChange={v=>u("valorMensalidade",v)} placeholder="150,00"/>
                <Inp label="Vencimento" type="number" value={form.diaVencimento||""} onChange={v=>u("diaVencimento",v)} placeholder="Dia 10"/>
              </div>
            </div>
          </div>

          {/* Anamnese — fundo levemente diferente para destacar seção */}
          <div style={{...css.card, background:"#191208", border:"1px solid #3d2a10"}}>
            <div style={css.secHdr}>Anamnese / Histórico de Saúde</div>
            <div style={{display:"grid",gap:14}}>
              <TA label="Doenças / Condições de saúde" value={form.doencas} onChange={v=>u("doencas",v)} placeholder="Ex: Diabetes, Hipertensão..." rows={2}/>
              <TA label="Medicamentos em uso" value={form.medicamentos} onChange={v=>u("medicamentos",v)} placeholder="Ex: Metformina 500mg..." rows={2}/>
              <TA label="Cirurgias / Procedimentos" value={form.cirurgias} onChange={v=>u("cirurgias",v)} placeholder="Ex: Joelho direito (2020)..." rows={2}/>
              <TA label="Lesões / Restrições físicas" value={form.lesoes} onChange={v=>u("lesoes",v)} placeholder="Ex: Hérnia de disco L4/L5..." rows={2}/>
              <TA label="Alergias" value={form.alergias} onChange={v=>u("alergias",v)} placeholder="Ex: Dipirona, Latex..." rows={1}/>

              <Divider label="Habitos e bem-estar"/>

              {/* Habitos: fundo ainda mais escuro para sub-seção */}
              <div style={{background:"#0f0a04",border:"1px solid #2e1e08",borderRadius:10,padding:"14px"}}>
                <div style={{...css.row("1fr 1fr"),gap:10}}>
                  <Sel label="Fumante?" value={form.fumante} onChange={v=>u("fumante",v)} opts={["Não","Sim","Ex-fumante"]}/>
                  <Sel label="Alcool?" value={form.alcool} onChange={v=>u("alcool",v)} opts={["Não","Social","Moderado","Frequente"]}/>
                  <Sel label="Insonia?" value={form.insonia||"Não"} onChange={v=>u("insonia",v)} opts={["Não","Sim","Eventual"]}/>
                  <Sel label="Nível de Estresse" value={form.nivelEstresse} onChange={v=>u("nivelEstresse",v)} opts={ESTRESSE}/>
                </div>
              </div>

              <div style={{...css.row("1fr 1fr")}}>
                <Sel label="Sente dores?" value={form.temDor||"Não"} onChange={v=>u("temDor",v)} opts={["Não","Sim","Ocasional"]}/>
              </div>
              {(form.temDor&&form.temDor!=="Não")&&(
                <div style={{background:"#1a0808",border:"1px solid #7f1d1d50",borderRadius:8,padding:"12px"}}>
                  <TA label="Descreva a dor (local, intensidade, frequência)" value={form.descDor} onChange={v=>u("descDor",v)} placeholder="Ex: Dor lombar ao agachar, intensidade 6/10, diária..." rows={3}/>
                </div>
              )}

              <Divider label="Atividade e objetivos"/>
              <Inp label="Atividade física atual" value={form.praticaEsporte} onChange={v=>u("praticaEsporte",v)} placeholder="Ex: Caminhada 3x/semana..."/>
              <TA label="Objetivo detalhado / Expectativas" value={form.objetivoAnamnese} onChange={v=>u("objetivoAnamnese",v)} placeholder="O que o aluno espera alcançar..." rows={3}/>
            </div>
          </div>
        </>}

        {/* ── PG 2: Antropometria ── */}
        {pg===2&&<>
          <div style={css.card}>
            <div style={css.secHdr}>Medidas Básicas</div>
            <div style={css.row("repeat(auto-fill,minmax(130px,1fr))")}>
              <Inp label="Peso (kg)" type="number" step="0.1" value={form.peso} onChange={v=>u("peso",v)} placeholder="70.5"/>
              <Inp label="Altura (cm)" type="number" value={form.altura} onChange={v=>u("altura",v)} placeholder="170"/>
              <ResultBox label="IMC" value={imc||"--"} color={imcC.color} sub={imc?imcC.label:null}/>
            </div>
          </div>

          <div style={css.card}>
            <div style={css.secHdr}>Pressao Arterial</div>
            <div style={css.row("1fr 1fr")}>
              <Inp label="Pressão (ex: 120/80)" value={form.pressao} onChange={v=>u("pressao",v)} placeholder="120/80 mmHg"/>
              {paC
                ?<ResultBox label="Diagnóstico" value={paC.label} color={paC.color}/>
                :<div>
                  <label style={css.lbl}>Diagnostico</label>
                  <div style={{...css.input,color:C.muted,display:"flex",alignItems:"center"}}>Preencha a pressao</div>
                </div>
              }
            </div>
          </div>

          <div style={css.card}>
            <div style={css.secHdr}>Relacao Cintura / Quadril</div>
            <div style={css.row("repeat(auto-fill,minmax(130px,1fr))")}>
              <Inp label="Cintura (cm)" type="number" step="0.1" value={form.cintura} onChange={v=>u("cintura",v)} placeholder="82"/>
              <Inp label="Quadril (cm)" type="number" step="0.1" value={form.quadril} onChange={v=>u("quadril",v)} placeholder="98"/>
              {rcq
                ?<ResultBox label="RCQ" value={rcq} color={rcqC.color} sub={rcqC.label}/>
                :<div>
                  <label style={css.lbl}>RCQ</label>
                  <div style={{...css.input,color:C.muted,display:"flex",alignItems:"center"}}>Cintura e quadril</div>
                </div>
              }
            </div>
          </div>
        </>}

        {/* ── PG 3: Avaliacao Fisica ── */}
        {pg===3&&<>
          <div style={{...css.card,background:"#0a1a10",border:"1px solid #34d39930",textAlign:"center",padding:"32px 20px"}}>
            <div style={{fontSize:32,marginBottom:12}}>📊</div>
            <div style={{fontWeight:700,fontSize:16,color:"#34d399",marginBottom:8}}>Avaliação Física</div>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:20}}>
              A avaliacao fisica e lancada de forma independente, com data propria e historico automatico.
            </div>
            {editId&&(
              <button onClick={async()=>{
                // Salva o cadastro e abre a tela de avaliação
                const merged={...alunos.find(a=>a.id===editId)||{},...form};
                try{
                  await salvarAluno(editId, merged);
                }catch(e){
                  console.error("Erro ao salvar antes de ir para avaliacao:", e);
                }
                setSelected(merged);
                setView("avaliacao");
              }} style={{...css.btnA,padding:"12px 24px",fontSize:14}}>
                Ir para Avaliacao Fisica →
              </button>
            )}
            {!editId&&(
              <div style={{fontSize:12,color:C.muted}}>Salve o cadastro primeiro, depois acesse a avaliacao pela ficha do aluno.</div>
            )}
          </div>
        </>}

        {/* ── PG 4: Treino ── */}
        {pg===4&&<PgTreino form={form} u={u} aba={treinoAba} setAba={setTreinoAba}/>}
      </div>
    </div>
  );

  // ── DETAIL ────────────────────────────────────────────────────────────────
  if(view==="detail"&&selected){
    const a=alunos.find(x=>x.id===selected.id)||selected;
    const imcA=calcIMC(a.peso,a.altura),imcCA=classIMC(imcA);
    const rcqA=calcRCQ(a.cintura,a.quadril),rcqCA=classRCQ(rcqA,a.sexo);
    const paCA=classPA(a.pressao);
    const pollA=calcPollock(a,a.idade,a.sexo);
    // Envio de WhatsApp: admin pode enviar para qualquer aluno; profissional
    // comum so pode enviar para alunos da propria carteira.
    const podeEnviarWhatsApp = currentUser?.role==="admin" || currentUser?.id===a.profissionalId;
    const TABS=[{k:"ficha",l:"Ficha"},{k:"antropo",l:"Antropometria"},{k:"avaliacao",l:"Aval. Física"},{k:"treino",l:"Treino"}];
    return(
      <div style={css.app}><GF/>
        <header style={css.hdr}>
          <button style={css.btnB} onClick={()=>setView("home")}>← Voltar</button>
          <div style={{fontWeight:700,fontSize:15}}>Ficha do Aluno</div>
          {podeEditar
            ?<button style={css.btnA} onClick={()=>openEdit(a)}>Editar</button>
            :<div style={{fontSize:11,color:C.muted}}>Somente leitura</div>
          }
        </header>

        <div style={{background:"linear-gradient(180deg,#1a0f00 0%,#111111 100%)",borderBottom:"1px solid #3d1f00",padding:"16px 16px",boxSizing:"border-box",width:"100%"}}>
          <div style={{maxWidth:860,margin:"0 auto"}}>
            <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:14}}>
              <Avatar nome={a.nome} foto={a.foto} size={60}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>{a.nome}</div>
                <div style={{color:C.muted,fontSize:13}}>{a.sexo} · {a.idade} anos · {a.profissao||"Sem profissão"}</div>
                <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                  <span style={css.badge(a.ativo?"#34d399":"#f87171")}>{a.ativo?"Ativo":"Inativo"}</span>
                  <span style={css.badge("#6366f1")}>{a.objetivo}</span>
                  {a.objetivo2&&<span style={css.badge("#8b5cf6")}>{a.objetivo2}</span>}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,background:C.bg,borderRadius:10,padding:4}}>
              {TABS.map(t=>(
                <button key={t.k} onClick={()=>setDTab(t.k)} style={css.tabBtn(dTab===t.k)}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={css.wrap}>
          {dTab==="ficha"&&<>
            <div style={css.card}>
              <div style={css.secHdr}>Contato e Identificacao</div>
              <div style={css.row("1fr 1fr")}>
                {[{l:"Telefone",v:a.telefone},{l:"E-mail",v:a.email},{l:"Contato emergência",v:a.nomeEmergencia},{l:"Tel. emergência",v:a.telEmergencia}].map(({l,v})=>(
                  <ReadField key={l} label={l} value={v}/>
                ))}
                <div style={{gridColumn:"1/-1"}}><ReadField label="Endereço" value={a.endereco}/></div>
              </div>
            </div>
            <div style={css.card}>
              <div style={css.secHdr}>Anamnese</div>
              <div style={{display:"grid",gap:10}}>
                <div style={{...css.row("1fr 1fr")}}>
                  {[{l:"Doenças",v:a.doencas},{l:"Medicamentos",v:a.medicamentos},{l:"Cirurgias",v:a.cirurgias},{l:"Lesões",v:a.lesoes},{l:"Alergias",v:a.alergias}].map(({l,v})=>(
                    <ReadField key={l} label={l} value={v}/>
                  ))}
                </div>
                <Divider label="Habitos"/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[{l:"Fumante",v:a.fumante},{l:"Alcool",v:a.alcool},{l:"Insonia",v:a.insonia},{l:"Estresse",v:a.nivelEstresse}].map(({l,v})=>(
                    <ReadField key={l} label={l} value={v}/>
                  ))}
                </div>
                {a.temDor&&a.temDor!=="Não"&&(
                  <div style={{background:"#1a0808",border:"1px solid #f8717130",borderRadius:8,padding:"10px 14px"}}>
                    <div style={{fontSize:10,color:C.red,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Dor reportada — {a.temDor}</div>
                    <div style={{fontSize:13}}>{a.descDor||"Sem descrição."}</div>
                  </div>
                )}
                {a.praticaEsporte&&<ReadField label="Atividade atual" value={a.praticaEsporte}/>}
                {a.objetivoAnamnese&&<ReadField label="Objetivo" value={a.objetivoAnamnese}/>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <button style={{background:"#1a1008",color:"#f97316",border:"1px solid #f9731640",borderRadius:9,padding:"10px",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif"}}
                onClick={()=>setTransferModal(a)}>Transferir aluno</button>
              {podeEditar&&<button style={{...css.btnDel,width:"100%"}} onClick={()=>setDelId(a.id)}>Excluir aluno</button>}
            </div>

            {/* ── Card Mensalidade ── */}
            {(a.diaVencimento||a.plano||a.valorMensalidade)&&(()=>{
              const s=statusMensalidade(a.diaVencimento);
              return(
                <div style={{...css.card,border:"1px solid "+(s?.urgente?"#f8717140":"#34d39930"),background:s?.urgente?"#1a0808":"#0a1a10",marginTop:4}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{fontWeight:700,fontSize:13,color:s?.urgente?C.red:"#34d399"}}>💳 Mensalidade</div>
                    {s&&<span style={{...css.badge(s.color),fontSize:11}}>{s.label}</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                    {[
                      {l:"Plano",v:a.plano||"--"},
                      {l:"Valor",v:a.valorMensalidade?"R$ "+a.valorMensalidade:"--"},
                      {l:"Vencimento",v:a.diaVencimento?"Dia "+a.diaVencimento:"--"},
                    ].map(({l,v})=>(
                      <div key={l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:700,color:C.text}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {a.telefone&&podeEnviarWhatsApp&&(
                    <button
                      onClick={()=>setModalWhatsAppAluno(a)}
                      style={{width:"100%",background:"linear-gradient(135deg,#25d366,#128c7e)",color:"#fff",border:"none",borderRadius:9,padding:"12px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"Inter,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                      <span style={{fontSize:16}}>📱</span>
                      Enviar mensagem pelo WhatsApp
                    </button>
                  )}
                  {a.telefone&&!podeEnviarWhatsApp&&(
                    <div style={{fontSize:11,color:C.muted,textAlign:"center",background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px"}}>
                      🔒 Apenas o profissional responsavel ou o administrador podem enviar mensagens para este aluno.
                    </div>
                  )}
                  {!a.telefone&&(
                    <div style={{fontSize:11,color:C.muted,textAlign:"center"}}>Cadastre o WhatsApp do aluno para enviar lembretes.</div>
                  )}
                </div>
              );
            })()}

            {/* Mensagens de ouvidoria do aluno */}
            {(()=>{
              const msgs = ouvidorias[a.id] || [];
              if(!msgs.length) return null;
              return(
                <div style={{...css.card,background:"#0f0a1a",border:"1px solid #6366f130"}}>
                  <div style={{...css.secHdr,color:"#a78bfa"}}>📣 Ouvidoria — {msgs.length} mensagem{msgs.length!==1?"s":""}</div>
                  {msgs.map((h,i)=>(
                    <div key={h.id||i} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:10,padding:"12px 14px",marginBottom:i<msgs.length-1?8:0}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:6}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#a78bfa"}}>{h.assunto}</span>
                        <div style={{display:"flex",gap:6,alignItems:"center"}}>
                          <span style={{fontSize:10,color:C.muted}}>{h.data} {h.hora}</span>
                          <select
                            value={h.status}
                            onChange={async e=>{
                              const all = [...msgs];
                              all[i]={...all[i],status:e.target.value};
                              try{
                                await adicionarMensagemOuvidoria(a.id, all);
                              }catch(err){
                                console.error("Erro ao atualizar status:", err);
                              }
                            }}
                            style={{...css.input,padding:"3px 8px",fontSize:16,width:"auto",
                              color:h.status==="Respondido"?C.green:h.status==="Em analise"?"#fbbf24":C.muted}}>
                            <option>Enviado</option>
                            <option>Em analise</option>
                            <option>Respondido</option>
                          </select>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:C.text,lineHeight:1.6}}>{h.mensagem}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>}

          {dTab==="antropo"&&<>
            {imcA&&(
              <div style={{...css.card,marginBottom:12}}>
                <div style={css.secHdr}>IMC</div>
                <div style={{display:"flex",alignItems:"center",gap:16}}>
                  <div style={{fontSize:36,fontWeight:800,color:imcCA.color}}>{imcA}</div>
                  <div>
                    <div style={{fontWeight:700,color:imcCA.color,fontSize:14}}>{imcCA.label}</div>
                    <div style={{fontSize:12,color:C.muted,marginTop:2}}>Peso {a.peso}kg · Altura {a.altura}cm</div>
                  </div>
                </div>
              </div>
            )}
            {paCA&&(
              <div style={{...css.card,display:"flex",alignItems:"center",gap:16,marginBottom:12}}>
                <div><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Pressao Arterial</div><div style={{fontSize:26,fontWeight:800,color:paCA.color}}>{a.pressao}</div></div>
                <div style={{background:paCA.color+"15",border:"1px solid "+paCA.color+"30",borderRadius:8,padding:"8px 14px"}}><div style={{fontWeight:700,color:paCA.color}}>{paCA.label}</div></div>
              </div>
            )}
            {rcqA&&(
              <div style={css.card}>
                <div style={css.secHdr}>Relacao Cintura/Quadril</div>
                <div style={{display:"flex",alignItems:"center",gap:16}}>
                  <div style={{fontSize:36,fontWeight:800,color:rcqCA.color}}>{rcqA}</div>
                  <div><div style={{fontWeight:700,color:rcqCA.color,fontSize:14}}>{rcqCA.label}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Cintura {a.cintura}cm · Quadril {a.quadril}cm</div></div>
                </div>
              </div>
            )}

            <div style={{marginTop:12}}>
              <GaleriaFotosEvolucao
                fotos={a.fotosEvolucao||[]}
                podeEditar={podeEditar}
                onUpdateFotos={async(novasFotos)=>{
                  const upd={...a, fotosEvolucao:novasFotos};
                  try{
                    await salvarAluno(a.id, {fotosEvolucao:novasFotos});
                  }catch(e){
                    console.error("Erro ao salvar fotos de evolucao:", e);
                  }
                  setSelected(upd);
                }}
              />
            </div>
          </>}

          {dTab==="avaliacao"&&<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:13,color:C.sectionHdr,textTransform:"uppercase",letterSpacing:1}}>Avaliacoes</div>
              {podeEditar&&<button style={css.btnA} onClick={()=>{setSelected(a);setView("avaliacao");}}>+ Nova Avaliação</button>}
            </div>
            <AvaliacaoAlunoView aluno={a}
              podeEditar={podeEditar}
              onExcluirAvaliacao={async(idxNoHistorico)=>{
                const novo=(a.historicoAvaliacoes||[]).filter((_,idx)=>idx!==idxNoHistorico);
                const upd={...a,historicoAvaliacoes:novo};
                try{
                  await salvarAluno(a.id, {historicoAvaliacoes:novo});
                }catch(e){
                  console.error("Erro ao excluir avaliacao:", e);
                }
                setSelected(upd);
              }}
            />
          </>}

          {dTab==="treino"&&<>
            {(()=>{
              // Encontra colegas do mesmo horário/dia na agenda do profissional dono do aluno
              const donoId = a.profissionalId;
              const agendaDono = agendas?.[donoId] || {};
              let colegas = [];
              if(Object.keys(agendaDono).length>0){
                const nomeAlunoLower = a.nome.trim().toLowerCase();
                // Procura em qual dia/horário/slot esse aluno está marcado
                let diaEncontrado=null, horaEncontrada=null;
                Object.keys(agendaDono).forEach(key=>{
                  if(key==="horarios") return;
                  const cel = agendaDono[key];
                  if(cel?.nome && cel.nome.trim().toLowerCase()===nomeAlunoLower){
                    const [dia,hora] = key.split("_");
                    diaEncontrado = dia; horaEncontrada = hora;
                  }
                });
                if(diaEncontrado && horaEncontrada){
                  for(let slot=0; slot<AGENDA_SLOTS_POR_HORA; slot++){
                    const key = `${diaEncontrado}_${horaEncontrada}_${slot}`;
                    const cel = agendaDono[key];
                    if(cel?.nome){
                      const nomeCel = cel.nome.trim().toLowerCase();
                      if(nomeCel===nomeAlunoLower) continue; // pula o próprio aluno
                      const alunoColega = alunos.find(x=>x.nome.trim().toLowerCase()===nomeCel)
                        || alunos.find(x=>x.nome.trim().toLowerCase().includes(nomeCel));
                      if(alunoColega) colegas.push(alunoColega);
                    }
                  }
                }
              }
              if(colegas.length===0) return null;
              return(
                <div style={{...css.card,background:"#0a1a10",border:"1px solid #34d39940",marginBottom:12,padding:"12px 14px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#34d399",textTransform:"uppercase",letterSpacing:.8,marginBottom:10}}>
                    ⚡ Mesmo horario
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    {colegas.map(col=>(
                      <button key={col.id} onClick={()=>{ setSelected(col); }}
                        style={{background:"transparent",border:"none",cursor:"pointer",
                          display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                          fontFamily:"Inter,sans-serif",flex:1,minWidth:0}}>
                        <Avatar nome={col.nome} foto={col.foto} size={40}/>
                        <span style={{fontSize:10,color:C.text,fontWeight:600,overflow:"hidden",
                          whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:"100%"}}>
                          {col.nome.split(" ")[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <TreinoAlunoView aluno={a}/>
          </>}

        </div>

        {novaAval&&(
          <Modal title="Nova Avaliação" onClose={()=>setNovaAval(null)} onConfirm={addAval} confirmLabel="Salvar">
            <Inp label="Data" type="date" value={novaAval.data} onChange={v=>setNovaAval(p=>({...p,data:v}))}/>
            <Inp label="Peso (kg)" type="number" step="0.1" value={novaAval.peso} onChange={v=>setNovaAval(p=>({...p,peso:v}))} placeholder="70.5"/>
            <Inp label="Somatorio dobras (mm)" type="number" value={novaAval.soma} onChange={v=>setNovaAval(p=>({...p,soma:v}))} placeholder="133"/>
            <Inp label="% Gordura" type="number" step="0.01" value={novaAval.pct} onChange={v=>setNovaAval(p=>({...p,pct:v}))} placeholder="26.0"/>
            <Inp label="Cintura (cm)" type="number" step="0.1" value={novaAval.cintura} onChange={v=>setNovaAval(p=>({...p,cintura:v}))} placeholder="88"/>
          </Modal>
        )}

        {/* Modal editar profissional — agora via componente global */}
        {modalEditProfGlobal}

        {transferModal&&(
          <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:16}}>
            <div style={{background:C.card,border:"1px solid #332010",borderRadius:16,padding:24,width:"100%",maxWidth:400}}>
              <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>Transferir aluno</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Selecione o profissional para receber <strong style={{color:C.text}}>{transferModal.nome}</strong></div>
              <div style={{display:"grid",gap:8,marginBottom:20,maxHeight:300,overflowY:"auto"}}>
                {[...profissionais].sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"))
                  .filter(p=>p.id!==profSelecionado?.id)
                  .map(p=>(
                    <button key={p.id} onClick={()=>setConfirmarTransferencia(p)}
                      style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",textAlign:"left",width:"100%"}}>
                      <Avatar nome={p.nome} foto={p.foto} size={38}/>
                      <div>
                        <div style={{fontWeight:600,fontSize:14,color:C.text}}>{p.nome}</div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{p.especialidade}</div>
                      </div>
                    </button>
                  ))
                }
              </div>
              <button onClick={()=>setTransferModal(null)} style={{...css.btnB,width:"100%",padding:"11px"}}>Cancelar</button>
            </div>
          </div>
        )}

        {confirmarTransferencia&&transferModal&&(
          <div style={{position:"fixed",inset:0,zIndex:600}}>
            <Modal title="Confirmar transferência?"
              onClose={()=>setConfirmarTransferencia(null)}
              onConfirm={()=>{
                transferirAluno(transferModal.id, confirmarTransferencia.id);
                setConfirmarTransferencia(null);
              }}
              confirmLabel="Transferir">
              <p style={{color:C.muted,fontSize:13,textAlign:"center",margin:"6px 0",lineHeight:1.6}}>
                <strong style={{color:C.text}}>{transferModal.nome}</strong> será transferido de <strong style={{color:C.text}}>{profSelecionado?.nome}</strong> para <strong style={{color:C.accent}}>{confirmarTransferencia.nome}</strong>.
              </p>
            </Modal>
          </div>
        )}

        {delId&&(
          <Modal title="Excluir aluno?" onClose={()=>setDelId(null)} onConfirm={()=>delAluno(delId)} confirmLabel="Excluir" danger>
            <p style={{color:C.muted,fontSize:13,textAlign:"center",margin:"6px 0"}}>Essa ação não pode ser desfeita.</p>
          </Modal>
        )}

        {modalWhatsAppAluno&&(
          <ModalEnviarWhatsApp aluno={modalWhatsAppAluno} onClose={()=>setModalWhatsAppAluno(null)}/>
        )}
      </div>
    );
  }
  return null;
}

// ── PG 4 TREINO ───────────────────────────────────────────────────────────────
function PgTreino({form,u,aba,setAba}){
  return(
    <div style={{width:"100%",minWidth:0}}>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
        <button onClick={()=>setAba("geral")} style={{...css.tabBtn(aba==="geral"),padding:"10px 8px",fontSize:12,width:"100%",textAlign:"center"}}>Info Geral</button>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {LETRAS.map(l=>{
            const c=COR_LETRA[l],bl=(form["blocos"+l]||[]),q=bl.length;
            const ativo=aba===l;
            const preenchido=q>0;
            return (
              <button key={l} onClick={()=>setAba(l)}
                style={{
                  background:ativo?c+"22":(preenchido?c+"10":"#141414"),
                  border:"1px solid "+(ativo?c:(preenchido?c+"70":"#2a2a2a")),
                  borderRadius:12,
                  padding:"14px 10px",
                  cursor:"pointer",
                  fontFamily:"Inter,sans-serif",
                  textAlign:"center",
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  gap:4,
                  position:"relative",
                  opacity:(!ativo&&!preenchido)?0.6:1,
                  boxShadow:ativo?"0 0 0 1px "+c+"40 inset":"none",
                }}>
                {preenchido&&!ativo&&(
                  <span style={{position:"absolute",top:8,right:8,width:8,height:8,borderRadius:"50%",background:c}}/>
                )}
                <span style={{fontSize:18,fontWeight:800,color:ativo?c:(preenchido?c:C.muted)}}>Treino {l}</span>
                <span style={{fontSize:11,fontWeight:600,color:ativo?c:(preenchido?c+"cc":C.muted)}}>
                  {q>0?"✓ "+q+" bloco"+(q!==1?"s":""):"Vazio"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {aba==="geral"&&(
        <div style={css.card}>
          <div style={css.secHdr}>Informações Gerais</div>
          <div style={{display:"grid",gap:14}}>
            <div style={css.row("repeat(auto-fill,minmax(130px,1fr))")}>
              <Sel label="Frequência semanal" value={form.frequencia||""} onChange={v=>u("frequencia",v)} placeholder="-- Selecione --" opts={["1x","2x","3x","4x","5x"]}/>
              <Sel label="Nível de experiência" value={form.nivelExperiencia||""} onChange={v=>u("nivelExperiencia",v)} placeholder="-- Selecione --" opts={["Iniciante","Intermediario","Avancado"]}/>
              <Inp label="Data de início" type="date" value={form.dataInicioTreino} onChange={v=>u("dataInicioTreino",v)}/>
            </div>

            <div>
              <label style={css.lbl}>Dias de treino</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                {DIAS_SEM.map(d=>{
                  const on=(form.diasTreino||[]).includes(d);
                  return <button key={d} onClick={()=>{const n=on?(form.diasTreino||[]).filter(x=>x!==d):[...(form.diasTreino||[]),d];u("diasTreino",n);}} style={css.pill(on)}>{d}</button>;
                })}
              </div>
            </div>

            {(form.diasTreino||[]).length>0&&(
              <div>
                <label style={css.lbl}>Horario por dia</label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:6}}>
                  {(form.diasTreino||[]).map(d=>(
                    <div key={d} style={{display:"flex",alignItems:"center",gap:8,background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"8px 10px"}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.accent,minWidth:28}}>{d}</span>
                      <input type="time" style={{...css.input,flex:1,padding:"6px 8px",fontSize:16}} value={(form.horariosTreino||{})[d]||""}
                        onChange={e=>u("horariosTreino",{...(form.horariosTreino||{}),[d]:e.target.value})}/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <TA label="Exercícios contraindicados" value={form.exerciciosContra} onChange={v=>u("exerciciosContra",v)} placeholder="Ex: Agachamento profundo (joelho)..." rows={2}/>
            <TA label="Observações gerais" value={form.obsTreino} onChange={v=>u("obsTreino",v)} placeholder="Obs adicionais..." rows={2}/>
          </div>
        </div>
      )}

      {LETRAS.map(l=>aba===l&&<AbaExercicios key={l} l={l} form={form} u={u}/>)}
    </div>
  );
}

function novoBloco(){ return {id:Date.now()+Math.random(), exercicios:[]}; }
function novoEx(){ return {id:Date.now()+Math.random(), nome:"", series:"", reps:"", carga:"", obs:""}; }

const CARDIO_TIPOS = ["Esteira","Bicicleta ergometrica","Eliptico","Escada","Remo ergometrico","Pulo de corda","Corrida na pista","Caminhada","HIIT","Natação","Jump"];
const CARDIO_INTENS = ["Leve (aquecimento)","Moderado","Forte","Máximo (sprint)","Variado (intervalado)"];

function novoBlocoCardio(){ return {id:Date.now()+Math.random(), tipo:"cardio", exercicio:"Esteira", tempo:"", intensidade:"Moderado", obs:""}; }

function AbaExercicios({l,form,u}){
  const cor=COR_LETRA[l];
  const blocos=form["blocos"+l]||[];
  const setBlocos=b=>u("blocos"+l,b);
  const [dragIdx,setDragIdx]=useState(null);
  const [dragOver,setDragOver]=useState(null);

  const addBloco=()=>setBlocos([...blocos,novoBloco()]);
  const addBlocoCardio=()=>setBlocos([...blocos,novoBlocoCardio()]);
  const rmBloco=id=>setBlocos(blocos.filter(b=>b.id!==id));
  const moveUp=i=>{ if(i===0)return; const b=[...blocos]; [b[i-1],b[i]]=[b[i],b[i-1]]; setBlocos(b); };
  const moveDown=i=>{ if(i===blocos.length-1)return; const b=[...blocos]; [b[i],b[i+1]]=[b[i+1],b[i]]; setBlocos(b); };

  const updEx=(blocoId,exId,k,v)=>setBlocos(blocos.map(b=>b.id===blocoId?{...b,exercicios:(b.exercicios||[]).map(e=>e.id===exId?{...e,[k]:v}:e)}:b));
  // Mantém o bloco mesmo se ficar sem exercícios (para o AdicionarExercicio aparecer)
  const rmEx=(blocoId,exId)=>setBlocos(blocos.map(b=>b.id===blocoId?{...b,exercicios:(b.exercicios||[]).filter(e=>e.id!==exId)}:b));
  // addEx recebe objeto completo {nome,series,reps,carga,obs,...} já montado pelo AdicionarExercicio
  const addEx=(blocoId,exObj)=>setBlocos(blocos.map(b=>b.id===blocoId&&(b.exercicios||[]).length<3&&b.tipo!=="cardio"?{...b,exercicios:[...(b.exercicios||[]),exObj]}:b));
  // addCardioNoBloco: converte em exercício de tipo cardio dentro do bloco existente
  const addCardioNoBloco=(blocoId,cardioData)=>setBlocos(blocos.map(b=>b.id===blocoId&&(b.exercicios||[]).length<3&&b.tipo!=="cardio"?{...b,exercicios:[...(b.exercicios||[]),{...novoEx(),nome:cardioData.exercicio,tipo:"cardio",series:cardioData.series||"",tempo:cardioData.tempo,intensidade:cardioData.intensidade,obs:cardioData.obs,reps:"",carga:""}]}:b));
  const updCardio=(id,k,v)=>setBlocos(blocos.map(b=>b.id===id?{...b,[k]:v}:b));

  const onDragStart=i=>setDragIdx(i);
  const onDragEnter=i=>setDragOver(i);
  const onDragEnd=()=>{
    if(dragIdx===null||dragOver===null||dragIdx===dragOver){setDragIdx(null);setDragOver(null);return;}
    const b=[...blocos];
    const [item]=b.splice(dragIdx,1);
    b.splice(dragOver,0,item);
    setBlocos(b);
    setDragIdx(null);setDragOver(null);
  };

  return(
    <div>
      <div style={{...css.card,background:cor+"10",border:"1px solid "+cor+"30",display:"flex",alignItems:"center",gap:10,marginBottom:12,flexWrap:"wrap"}}>
        <div style={{fontSize:24,fontWeight:800,color:cor}}>Treino {l}</div>
        <input style={{...css.input,flex:1,fontWeight:600}} placeholder="Ex: Peito + Triceps"
          value={form["treino"+l]||""} onChange={e=>u("treino"+l,e.target.value)}/>
        <div style={{fontSize:12,color:cor,fontWeight:600,whiteSpace:"nowrap"}}>{blocos.length} blocos</div>
      </div>

      {blocos.map((bloco,bi)=>{
        // Número sequencial só entre blocos de exercício (ignora cardios)
        const numBloco = blocos.slice(0,bi+1).filter(b=>b.tipo!=="cardio").length;
        return(
        <div key={bloco.id}
          draggable
          onDragStart={()=>onDragStart(bi)}
          onDragEnter={()=>onDragEnter(bi)}
          onDragEnd={onDragEnd}
          onDragOver={e=>e.preventDefault()}
          style={{opacity:dragIdx===bi?0.4:1,transition:"opacity .15s",
            outline:dragOver===bi&&dragIdx!==bi?"2px dashed "+cor:"none",borderRadius:12}}>

          {bloco.tipo==="cardio"
            ? <BlocoCardio bloco={bloco} bi={bi} total={blocos.length}
                onUpd={(k,v)=>updCardio(bloco.id,k,v)}
                onRm={()=>rmBloco(bloco.id)}
                onUp={()=>moveUp(bi)} onDown={()=>moveDown(bi)}/>
            : <BlocoEditor bloco={bloco} bi={bi} numBloco={numBloco} cor={cor} total={blocos.length}
                onRmBloco={()=>rmBloco(bloco.id)}
                onUpdEx={(exId,k,v)=>updEx(bloco.id,exId,k,v)}
                onRmEx={exId=>rmEx(bloco.id,exId)}
                onAddEx={exObj=>addEx(bloco.id,exObj)}
                onAddCardio={cardioData=>addCardioNoBloco(bloco.id,cardioData)}
                onUp={()=>moveUp(bi)} onDown={()=>moveDown(bi)}/>
          }
        </div>
        );
      })}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
        <button onClick={addBloco} style={{...css.btnC,padding:"12px",fontSize:13,textAlign:"center"}}>+ Novo bloco</button>
        <button onClick={addBlocoCardio} style={{...css.btnC,padding:"12px",fontSize:13,textAlign:"center",color:"#34d399",borderColor:"#34d39940"}}>+ Cardio</button>
      </div>
    </div>
  );
}

function BlocoCardio({bloco,bi,total,onUpd,onRm,onUp,onDown}){
  return(
    <div style={{...css.card,marginBottom:10,border:"1px solid #34d39940",background:"#0a1a10"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,color:"#34d399"}}>
          🏃 Cardio
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={onUp} disabled={bi===0} style={{...css.btnC,padding:"3px 8px",fontSize:13,opacity:bi===0?.3:1}}>↑</button>
          <button onClick={onDown} disabled={bi===total-1} style={{...css.btnC,padding:"3px 8px",fontSize:13,opacity:bi===total-1?.3:1}}>↓</button>
          <button onClick={onRm} style={{background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"'Inter',sans-serif"}}>Remover</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div>
          <label style={css.lbl}>Exercicio cardio</label>
          <select style={css.input} value={bloco.exercicio||"Esteira"} onChange={e=>onUpd("exercicio",e.target.value)}>
            {CARDIO_TIPOS.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={css.lbl}>Intensidade</label>
          <select style={css.input} value={bloco.intensidade||"Moderado"} onChange={e=>onUpd("intensidade",e.target.value)}>
            {CARDIO_INTENS.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <Inp label="Tempo / Distancia" value={bloco.tempo} onChange={v=>onUpd("tempo",v)} placeholder="Ex: 3 min, 1 km"/>
        <Inp label="Observação" value={bloco.obs} onChange={v=>onUpd("obs",v)} placeholder="Ex: inclinação 2%"/>
      </div>
    </div>
  );
}

function BlocoEditor({bloco,bi,numBloco,cor,total,onRmBloco,onUpdEx,onRmEx,onAddEx,onAddCardio,onUp,onDown}){
  const cheio=(bloco.exercicios||[]).length>=3;
  return(
    <div style={{...css.card,marginBottom:10,border:"1px solid "+cor+"30"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:12,color:cor,textTransform:"uppercase",letterSpacing:1,display:"flex",alignItems:"center",gap:6}}>
          <span style={{cursor:"grab",color:C.muted,fontSize:14}}>⠿</span>
          Bloco {numBloco} <span style={{color:C.muted,fontWeight:400,textTransform:"none"}}>· {(bloco.exercicios||[]).length}/3</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={onUp} disabled={bi===0} style={{...css.btnC,padding:"3px 8px",fontSize:13,opacity:bi===0?.3:1}}>↑</button>
          <button onClick={onDown} disabled={bi===total-1} style={{...css.btnC,padding:"3px 8px",fontSize:13,opacity:bi===total-1?.3:1}}>↓</button>
          <button onClick={onRmBloco} style={{background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:11,fontFamily:"'Inter',sans-serif"}}>Remover</button>
        </div>
      </div>
      {(bloco.exercicios||[]).map((ex,ei)=>(
        <ExercicioRow key={ex.id} ex={ex} ei={ei} cor={cor}
          onUpd={(k,v)=>onUpdEx(ex.id,k,v)}
          onRm={()=>onRmEx(ex.id)}
        />
      ))}
      {!cheio
        ? <AdicionarExercicio cor={cor} onAddEx={onAddEx} onAddCardio={onAddCardio}/>
        : <div style={{fontSize:11,color:C.muted,textAlign:"center",marginTop:8,padding:"6px 0"}}>Bloco completo (max. 3 exercicios)</div>
      }
    </div>
  );
}

function ExercicioRow({ex,ei,cor,onUpd,onRm}){
  const isCardio = ex.tipo==="cardio";
  // Cardio usa a mesma cor e número do bloco — sem distinção visual
  const corRow = cor;

  const [modoLista,setModoLista]=useState(false);
  const [grupo,setGrupo]=useState("");
  const [exSel,setExSel]=useState("");
  const aplicarDaLista=()=>{ if(!exSel)return; onUpd("nome",exSel); setModoLista(false);setGrupo("");setExSel(""); };

  return(
    <div style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px 12px",marginBottom:8,borderLeft:"3px solid "+corRow}}>

      {/* ── Cabeçalho: número + nome + ações ── */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:corRow,minWidth:22,flexShrink:0}}>
          {ei+1}
        </div>

        {isCardio
          /* Cardio: select da modalidade no lugar do input de nome */
          ? <select style={{...css.input,flex:1,fontSize:16,fontWeight:600,color:corRow}}
              value={ex.nome||"Esteira"} onChange={e=>onUpd("nome",e.target.value)}>
              {CARDIO_TIPOS.map(t=><option key={t}>{t}</option>)}
            </select>
          /* Exercício: input de nome + botão lista */
          : <>
              <input style={{...css.input,flex:1,fontSize:16,fontWeight:600}} placeholder="Nome do exercicio"
                value={ex.nome} onChange={e=>onUpd("nome",e.target.value)}/>
              <button onClick={()=>setModoLista(m=>!m)}
                style={{...css.btnC,fontSize:11,padding:"5px 10px",flexShrink:0,
                  background:modoLista?C.accent+"20":"transparent",color:modoLista?C.accent:C.muted}}>
                {modoLista?"✕":"Lista"}
              </button>
            </>
        }

        <button onClick={onRm}
          style={{background:"#450a0a",color:"#fca5a5",border:"none",borderRadius:6,width:28,height:32,cursor:"pointer",fontSize:14,flexShrink:0}}>×</button>
      </div>

      {/* ── Seletor da lista (só exercício normal) ── */}
      {!isCardio&&modoLista&&(
        <div style={{background:"#0a0a0a",borderRadius:8,padding:"10px",marginBottom:8,border:"1px solid #2a1a08"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            <Sel label="Grupo" value={grupo} onChange={v=>{setGrupo(v);setExSel("");}} placeholder="-- Grupo --" opts={Object.keys(EXERCICIOS_DB)}/>
            <div>
              <label style={css.lbl}>Exercicio</label>
              <select style={{...css.input,opacity:grupo?1:.5}} value={exSel} onChange={e=>setExSel(e.target.value)} disabled={!grupo}>
                <option value="">-- Selecione --</option>
                {grupo&&EXERCICIOS_DB[grupo].map(e=><option key={e}>{e}</option>)}
              </select>
            </div>
          </div>
          <button onClick={aplicarDaLista} disabled={!exSel}
            style={{...css.btnA,width:"100%",fontSize:12,padding:"8px",opacity:exSel?1:.5}}>
            Aplicar nome
          </button>
        </div>
      )}

      {/* ── Campos específicos por tipo ── */}
      {isCardio
        ? /* Cardio: Séries | Intensidade | Tempo/Dist + Observação destacada */
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Series</div>
                <input style={{...css.input,textAlign:"center",fontSize:16}} placeholder="3"
                  value={ex.series||""} onChange={e=>onUpd("series",e.target.value)}/>
              </div>
              <div>
                <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Intensidade</div>
                <select style={css.input} value={ex.intensidade||"Moderado"} onChange={e=>onUpd("intensidade",e.target.value)}>
                  {CARDIO_INTENS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Tempo / Dist.</div>
                <input style={css.input} placeholder="3 min / 1 km"
                  value={ex.tempo||""} onChange={e=>onUpd("tempo",e.target.value)}/>
              </div>
            </div>
            {/* Observação destacada */}
            <div style={{background:"#0a1a10",border:"1px solid #34d39940",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:9,color:"#34d399",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Detalhes de execucao</div>
              <input style={{...css.input,fontSize:16,background:"transparent",border:"none",padding:"0",color:C.text}}
                placeholder="Ex: velocidade 12 km/h, inclinação 2%, zona de FC 140-160 bpm..."
                value={ex.obs||""} onChange={e=>onUpd("obs",e.target.value)}/>
            </div>
          </>
        : /* Exercício normal: Séries | Reps | Carga + Observação */
          <>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:6}}>
              {[{k:"series",p:"4",l:"Series"},{k:"reps",p:"12",l:"Reps"},{k:"carga",p:"kg",l:"Carga"}].map(f=>(
                <div key={f.k}>
                  <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:3}}>{f.l}</div>
                  <input style={{...css.input,textAlign:"center",fontSize:16}} placeholder={f.p}
                    value={ex[f.k]||""} onChange={e=>onUpd(f.k,e.target.value)}/>
                </div>
              ))}
            </div>
            <input style={{...css.input,fontSize:16}} placeholder="Observação..."
              value={ex.obs||""} onChange={e=>onUpd("obs",e.target.value)}/>
          </>
      }
    </div>
  );
}

// ── AdicionarExercicio: formulário completo antes de confirmar ────────────────
// Suporta modo Exercício (da lista ou manual) e modo Cardio.
// Ao confirmar, chama onAddEx(exObj) ou onAddCardio(cardioObj).
function AdicionarExercicio({cor,onAddEx,onAddCardio}){
  const MODO_EX    = "exercicio";
  const MODO_CARD  = "cardio";

  const [modo,setModo]     = useState(MODO_EX);

  // ── campos exercício ──
  const [grupo,setGrupo]   = useState("");
  const [exSel,setExSel]   = useState("");
  const [nomeManual,setNomeManual] = useState("");
  const [fonteNome,setFonteNome]   = useState("lista"); // "lista" | "manual"
  const [series,setSeries] = useState("");
  const [reps,setReps]     = useState("");
  const [carga,setCarga]   = useState("");
  const [obs,setObs]       = useState("");

  // ── campos cardio ──
  const [cardioEx,setCardioEx]       = useState("Esteira");
  const [cardioSeries,setCardioSeries] = useState("");
  const [cardioInt,setCardioInt]     = useState("Moderado");
  const [cardioTempo,setCardioTempo] = useState("");
  const [cardioObs,setCardioObs]     = useState("");

  const nomeEfetivo = fonteNome==="lista" ? exSel : nomeManual;
  const podeConfirmar = modo===MODO_CARD ? true : nomeEfetivo.trim()!=="";

  const resetEx=()=>{ setGrupo("");setExSel("");setNomeManual("");setFonteNome("lista");setSeries("");setReps("");setCarga("");setObs(""); };
  const resetCard=()=>{ setCardioEx("Esteira");setCardioSeries("");setCardioInt("Moderado");setCardioTempo("");setCardioObs(""); };

  const confirmar=()=>{
    if(modo===MODO_EX){
      if(!nomeEfetivo.trim())return;
      onAddEx({...novoEx(), nome:nomeEfetivo.trim(), series, reps, carga, obs});
      resetEx();
    } else {
      onAddCardio({exercicio:cardioEx, series:cardioSeries, intensidade:cardioInt, tempo:cardioTempo, obs:cardioObs});
      resetCard();
    }
  };

  return(
    <div style={{background:"#0f0f0f",borderRadius:10,padding:"14px",marginTop:6,border:"1px dashed #3d2010"}}>
      <div style={{fontSize:10,fontWeight:700,color:"#e8cba8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>
        Adicionar ao bloco
      </div>

      {/* Toggle Exercício / Cardio */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
        <button onClick={()=>setModo(MODO_EX)}
          style={{...css.tabBtn(modo===MODO_EX,cor),padding:"8px",fontSize:12,border:"1px solid "+(modo===MODO_EX?cor+"60":"#2a1a08")}}>
          🏋 Exercicio
        </button>
        <button onClick={()=>setModo(MODO_CARD)}
          style={{...css.tabBtn(modo===MODO_CARD,"#34d399"),padding:"8px",fontSize:12,border:"1px solid "+(modo===MODO_CARD?"#34d39960":"#2a1a08")}}>
          🏃 Cardio
        </button>
      </div>

      {/* ── MODO EXERCÍCIO ── */}
      {modo===MODO_EX&&<>
        {/* Fonte do nome: Lista ou Manual */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
          <button onClick={()=>setFonteNome("lista")}
            style={{...css.tabBtn(fonteNome==="lista",cor),padding:"6px",fontSize:11,border:"1px solid "+(fonteNome==="lista"?cor+"50":"#2a1a08")}}>
            Da lista
          </button>
          <button onClick={()=>setFonteNome("manual")}
            style={{...css.tabBtn(fonteNome==="manual",cor),padding:"6px",fontSize:11,border:"1px solid "+(fonteNome==="manual"?cor+"50":"#2a1a08")}}>
            Manual
          </button>
        </div>

        {fonteNome==="lista"&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <label style={css.lbl}>Grupo muscular</label>
              <select style={css.input} value={grupo} onChange={e=>{setGrupo(e.target.value);setExSel("");}}>
                <option value="">-- Grupo --</option>
                {Object.keys(EXERCICIOS_DB).map(g=><option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={css.lbl}>Exercicio</label>
              <select style={{...css.input,opacity:grupo?1:.5}} value={exSel} onChange={e=>setExSel(e.target.value)} disabled={!grupo}>
                <option value="">-- Selecione --</option>
                {grupo&&EXERCICIOS_DB[grupo].map(e=><option key={e}>{e}</option>)}
              </select>
            </div>
          </div>
        )}

        {fonteNome==="manual"&&(
          <div style={{marginBottom:10}}>
            <label style={css.lbl}>Nome do exercicio</label>
            <input style={css.input} placeholder="Ex: Supino inclinado com halteres"
              value={nomeManual} onChange={e=>setNomeManual(e.target.value)}/>
          </div>
        )}

        {/* Series / Reps / Carga */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
          {[{lbl:"Series",val:series,set:setSeries,ph:"4"},{lbl:"Reps",val:reps,set:setReps,ph:"12"},{lbl:"Carga",val:carga,set:setCarga,ph:"kg"}].map(f=>(
            <div key={f.lbl}>
              <label style={css.lbl}>{f.lbl}</label>
              <input style={{...css.input,textAlign:"center",fontSize:16}} placeholder={f.ph}
                value={f.val} onChange={e=>f.set(e.target.value)}/>
            </div>
          ))}
        </div>
        <div style={{marginBottom:10}}>
          <label style={css.lbl}>Observacao</label>
          <input style={css.input} placeholder="Ex: Controlar a descida..." value={obs} onChange={e=>setObs(e.target.value)}/>
        </div>
      </>}

      {/* ── MODO CARDIO ── */}
      {modo===MODO_CARD&&<>
        {/* Linha 1: Modalidade | Séries */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div>
            <label style={css.lbl}>Modalidade</label>
            <select style={css.input} value={cardioEx} onChange={e=>setCardioEx(e.target.value)}>
              {CARDIO_TIPOS.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={css.lbl}>Series</label>
            <input style={{...css.input,textAlign:"center"}} placeholder="3" value={cardioSeries} onChange={e=>setCardioSeries(e.target.value)}/>
          </div>
        </div>
        {/* Linha 2: Intensidade | Tempo */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div>
            <label style={css.lbl}>Intensidade</label>
            <select style={css.input} value={cardioInt} onChange={e=>setCardioInt(e.target.value)}>
              {CARDIO_INTENS.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={css.lbl}>Tempo / Distancia</label>
            <input style={css.input} placeholder="Ex: 3 min, 1 km" value={cardioTempo} onChange={e=>setCardioTempo(e.target.value)}/>
          </div>
        </div>
        {/* Observação destacada */}
        <div style={{background:"#0a1a10",border:"1px solid #34d39940",borderRadius:8,padding:"10px 12px",marginBottom:2}}>
          <label style={{...css.lbl,color:"#34d399",marginBottom:6}}>Detalhes de execucao</label>
          <input style={{...css.input,fontSize:16}} placeholder="Ex: velocidade 12 km/h, inclinação 2%, zona de FC 140-160 bpm..."
            value={cardioObs} onChange={e=>setCardioObs(e.target.value)}/>
        </div>
      </>}

      {/* Botão confirmar */}
      <button onClick={confirmar} disabled={!podeConfirmar}
        style={{
          ...(modo===MODO_CARD
            ? {...css.btnA,background:"linear-gradient(135deg,#059669,#34d399)"}
            : css.btnA),
          width:"100%",fontSize:13,padding:"10px",
          opacity:podeConfirmar?1:.45,
        }}>
        {modo===MODO_CARD?"+ Adicionar cardio ao bloco":"+ Adicionar ao bloco"}
      </button>
    </div>
  );
}

// ── TREINO ALUNO VIEW ─────────────────────────────────────────────────────────
// Mostra info geral + botões de treino. Ao clicar, abre tela do treino escolhido.
function TreinoAlunoView({aluno, treinoInicial}){
  const [treinoAberto,setTreinoAberto]=useState(treinoInicial || null); // null | "A"|"B"|"C"|"D"

  useEffect(()=>{
    if(treinoInicial) setTreinoAberto(treinoInicial);
  },[treinoInicial, aluno?.id]);

  // Tela de detalhe de um treino específico
  if(treinoAberto){
    const blocos=aluno["blocos"+treinoAberto]||[];
    const cor=COR_LETRA[treinoAberto];
    const nome=aluno["treino"+treinoAberto]||"";
    return(
      <div>
        {/* Header do treino */}
        <button onClick={()=>setTreinoAberto(null)}
          style={{...css.btnB,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
          ← Voltar
        </button>
        <div style={{...css.card,background:cor+"10",border:"1px solid "+cor+"30",display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <div style={{fontSize:26,fontWeight:800,color:cor}}>Treino {treinoAberto}</div>
          {nome&&<div style={{fontSize:13,color:"#c2cdd8",flex:1}}>{nome}</div>}
          <div style={{fontSize:12,color:cor,fontWeight:600}}>{blocos.length} blocos</div>
        </div>
        {blocos.length===0
          ?<div style={{textAlign:"center",color:C.muted,padding:"28px 0",fontSize:13}}>Nenhum exercício prescrito.</div>
          :blocos.map((bloco,bi)=>{
            const numBloco=blocos.slice(0,bi+1).filter(b=>b.tipo!=="cardio").length;
            return(
              <div key={bloco.id||bi} style={{marginBottom:10}}>
                {bloco.tipo==="cardio"
                  ?<div style={{...css.card,border:"1px solid #34d39940",background:"#0a1a10"}}>
                      <div style={{fontWeight:700,fontSize:13,color:"#34d399",marginBottom:10}}>🏃 Cardio</div>
                      <div style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px 12px",borderLeft:"3px solid #34d399"}}>
                        <div style={{fontWeight:600,fontSize:13,color:"#34d399",marginBottom:8}}>{bloco.exercicio||"Cardio"}</div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                          {[{l:"Series",v:bloco.series,c:"#34d399"},{l:"Intensidade",v:bloco.intensidade,c:C.text},{l:"Tempo",v:bloco.tempo,c:C.text}].map(f=>(
                            <div key={f.l} style={{background:C.surface,border:"1px solid #34d39925",borderRadius:7,padding:"7px 10px",textAlign:"center"}}>
                              <div style={{fontSize:13,fontWeight:700,color:f.c}}>{f.v||"--"}</div>
                              <div style={{fontSize:9,color:C.muted,marginTop:2}}>{f.l}</div>
                            </div>
                          ))}
                        </div>
                        {bloco.obs&&(
                          <div style={{background:"#34d39918",border:"1px solid #34d39950",borderRadius:8,padding:"9px 12px",marginTop:8}}>
                            <div style={{fontSize:9,color:"#34d399",fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Detalhes de execucao</div>
                            <div style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:600}}>{bloco.obs}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  :<div style={{...css.card,border:"1px solid #2a1a08"}}>
                      <div style={{fontWeight:700,fontSize:11,color:cor,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>
                        Bloco {numBloco} <span style={{color:C.muted,fontWeight:400}}>· {(bloco.exercicios||[]).length} exercicio{(bloco.exercicios||[]).length!==1?"s":""}</span>
                      </div>
                      {(bloco.exercicios||[]).map((ex,ei)=>{
                        return(
                          <div key={ex.id||ei} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px 12px",marginBottom:ei<bloco.exercicios.length-1?8:0,borderLeft:"3px solid "+cor}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                              <div style={{fontSize:11,fontWeight:700,color:cor,minWidth:22}}>{ei+1}</div>
                              <div style={{fontWeight:600,fontSize:13,flex:1,color:cor}}>{ex.nome||"--"}</div>
                            </div>
                            {ex.tipo==="cardio"
                              ?<>
                                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:ex.obs?8:0}}>
                                    {[{l:"Series",v:ex.series,c:cor},{l:"Intensidade",v:ex.intensidade,c:C.text},{l:"Tempo / Dist.",v:ex.tempo,c:C.text}].map(f=>(
                                      <div key={f.l} style={{background:C.surface,border:"1px solid #2a1a08",borderRadius:7,padding:"7px 10px",textAlign:"center"}}>
                                        <div style={{fontSize:13,fontWeight:700,color:f.c}}>{f.v||"--"}</div>
                                        <div style={{fontSize:9,color:C.muted,marginTop:2}}>{f.l}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {ex.obs&&(
                                    <div style={{background:cor+"12",border:"1px solid "+cor+"40",borderRadius:8,padding:"9px 12px"}}>
                                      <div style={{fontSize:9,color:cor,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Detalhes de execucao</div>
                                      <div style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:600}}>{ex.obs}</div>
                                    </div>
                                  )}
                                </>
                              :<>
                                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:ex.obs?8:0}}>
                                    {[{l:"Series",v:ex.series,c:cor},{l:"Reps",v:ex.reps,c:C.text},{l:"Carga",v:ex.carga,c:C.green}].map(f=>(
                                      <div key={f.l} style={{background:C.surface,border:"1px solid #2a1a08",borderRadius:7,padding:"7px 10px",textAlign:"center"}}>
                                        <div style={{fontSize:14,fontWeight:800,color:f.c}}>{f.v||"--"}</div>
                                        <div style={{fontSize:9,color:C.muted}}>{f.l}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {ex.obs&&(
                                    <div style={{background:cor+"12",border:"1px solid "+cor+"40",borderRadius:8,padding:"9px 12px"}}>
                                      <div style={{fontSize:9,color:cor,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Observacao</div>
                                      <div style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:600}}>{ex.obs}</div>
                                    </div>
                                  )}
                                </>
                            }
                          </div>
                        );
                      })}
                    </div>
                }
              </div>
            );
          })
        }
      </div>
    );
  }

  // Tela principal: info geral + botões de treino
  return(
    <div>
      {/* Informações Gerais */}
      <div style={css.card}>
        <div style={css.secHdr}>Informações Gerais</div>
        <div style={css.row("repeat(auto-fill,minmax(120px,1fr))")}>
          {[{l:"Frequência",v:aluno.frequencia},{l:"Nível",v:aluno.nivelExperiencia},{l:"Início",v:aluno.dataInicioTreino}].map(({l,v})=>(
            <div key={l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#e8cba8",fontWeight:600,textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:13,fontWeight:700,color:v?C.text:"#64748b",marginTop:3}}>{v||"--"}</div>
            </div>
          ))}
        </div>
        {(aluno.diasTreino||[]).length>0&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:10,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:8}}>Agenda semanal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {(aluno.diasTreino||[]).map(d=>{
                const h=(aluno.horariosTreino||{})[d];
                return(
                  <div key={d} style={{background:"#121212",border:"1px solid "+C.accent+"30",borderRadius:9,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.accent,minWidth:28}}>{d}</div>
                    <div style={{fontSize:13,color:"#c2cdd8"}}>{h||"--"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(aluno.exerciciosContra||aluno.obsTreino)&&(
          <div style={{marginTop:14,display:"grid",gap:10,borderTop:"1px solid #2e1e0a",paddingTop:12}}>
            {[{l:"Exercícios contraindicados",v:aluno.exerciciosContra},{l:"Observações",v:aluno.obsTreino}].filter(f=>f.v).map(({l,v})=>(
              <div key={l}>
                <div style={{fontSize:10,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div>
                <div style={{fontSize:13}}>{v}</div>
              </div>
            ))}
          </div>
        )}
        {!aluno.frequencia&&!(aluno.diasTreino||[]).length&&<div style={{color:C.muted,fontSize:13}}>Nenhuma prescrição cadastrada.</div>}
      </div>

      {/* Botões de acesso aos treinos */}
      <div style={{marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:"#e8cba8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Meus Treinos</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {LETRAS.map(l=>{
            const blocos=aluno["blocos"+l]||[];
            const nome=aluno["treino"+l]||"";
            const cor=COR_LETRA[l];
            if(!nome&&blocos.length===0) return null;
            const totalEx=blocos.reduce((s,b)=>s+(b.tipo==="cardio"?1:(b.exercicios||[]).length),0);
            return(
              <button key={l} onClick={()=>setTreinoAberto(l)}
                style={{background:cor+"12",border:"1px solid "+cor+"40",borderRadius:14,
                  padding:"16px 14px",textAlign:"left",cursor:"pointer",fontFamily:"Inter,sans-serif",
                  display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:22,fontWeight:800,color:cor}}>Treino {l}</div>
                  <span style={{color:cor,fontSize:18}}>→</span>
                </div>
                {nome&&<div style={{fontSize:12,color:"#c2cdd8"}}>{nome}</div>}
                <div style={{fontSize:11,color:cor,fontWeight:600}}>{blocos.length} bloco{blocos.length!==1?"s":""} · {totalEx} exerc.</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── TREINO VIEW (DETAIL) ──────────────────────────────────────────────────────
function TreinoView({aluno}){
  return(
    <div style={{width:"100%",minWidth:0}}>
      {/* Informações Gerais */}
      <div style={css.card}>
        <div style={css.secHdr}>Informações Gerais</div>
        <div style={css.row("repeat(auto-fill,minmax(120px,1fr))")}>
          {[{l:"Frequência",v:aluno.frequencia},{l:"Nível",v:aluno.nivelExperiencia},{l:"Início",v:aluno.dataInicioTreino}].map(({l,v})=>(
            <div key={l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:10,color:"#e8cba8",fontWeight:600,textTransform:"uppercase"}}>{l}</div>
              <div style={{fontSize:13,fontWeight:700,color:v?C.text:"#64748b",marginTop:3}}>{v||"--"}</div>
            </div>
          ))}
        </div>
        {(aluno.diasTreino||[]).length>0&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:10,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:8}}>Agenda semanal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {(aluno.diasTreino||[]).map(d=>{
                const h=(aluno.horariosTreino||{})[d];
                return(
                  <div key={d} style={{background:"#121212",border:"1px solid "+C.accent+"30",borderRadius:9,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontWeight:700,fontSize:13,color:C.accent,minWidth:28}}>{d}</div>
                    <div style={{fontSize:13,color:"#c2cdd8"}}>{h||"--"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(aluno.exerciciosContra||aluno.obsTreino)&&(
          <div style={{marginTop:14,display:"grid",gap:10,borderTop:"1px solid #2e1e0a",paddingTop:12}}>
            {[{l:"Exercícios contraindicados",v:aluno.exerciciosContra},{l:"Observações",v:aluno.obsTreino}].filter(f=>f.v).map(({l,v})=>(
              <div key={l}><div style={{fontSize:10,color:"#e8cba8",fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{fontSize:13}}>{v}</div></div>
            ))}
          </div>
        )}
        {!aluno.frequencia&&!(aluno.diasTreino||[]).length&&<div style={{color:C.muted,fontSize:13}}>Nenhuma prescrição cadastrada.</div>}
      </div>

      {/* Treinos A/B/C/D — exibe todos diretamente */}
      {LETRAS.map(l=>{
        const blocos=aluno["blocos"+l]||[];
        const cor=COR_LETRA[l];
        if(!aluno["treino"+l]&&blocos.length===0) return null;
        return(
          <div key={l}>
            <div style={{...css.card,background:cor+"10",border:"1px solid "+cor+"30",display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{fontSize:24,fontWeight:800,color:cor}}>Treino {l}</div>
              {aluno["treino"+l]&&<div style={{fontSize:13,color:"#c2cdd8",flex:1}}>{aluno["treino"+l]}</div>}
              <div style={{fontSize:12,color:cor,fontWeight:600}}>{blocos.length} blocos</div>
            </div>
            {blocos.length===0
              ?<div style={{textAlign:"center",color:C.muted,padding:"20px 0",fontSize:13}}>Nenhum exercício prescrito.</div>
              :blocos.map((bloco,bi)=>{
                const numBloco=blocos.slice(0,bi+1).filter(b=>b.tipo!=="cardio").length;
                return(
                  <div key={bloco.id||bi} style={{marginBottom:10}}>
                    {bloco.tipo==="cardio"
                      ? <div style={{...css.card,border:"1px solid #34d39940",background:"#0a1a10"}}>
                          <div style={{fontWeight:700,fontSize:13,color:"#34d399",marginBottom:10}}>🏃 Cardio</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                            {[{l:"Exercicio",v:bloco.exercicio,c:"#34d399"},{l:"Tempo",v:bloco.tempo,c:C.text},{l:"Intensidade",v:bloco.intensidade,c:"#fbbf24"},{l:"Obs",v:bloco.obs,c:C.muted}].filter(f=>f.v).map(f=>(
                              <div key={f.l} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:7,padding:"8px 10px"}}>
                                <div style={{fontSize:9,color:"#e8cba8",fontWeight:600,textTransform:"uppercase"}}>{f.l}</div>
                                <div style={{fontSize:13,fontWeight:600,color:f.c,marginTop:2}}>{f.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      : <div style={{...css.card,border:"1px solid #2a1a08"}}>
                          <div style={{fontWeight:700,fontSize:11,color:cor,marginBottom:10,textTransform:"uppercase",letterSpacing:1}}>
                            Bloco {numBloco} <span style={{color:C.muted,fontWeight:400}}>· {(bloco.exercicios||[]).length} exercicio{(bloco.exercicios||[]).length!==1?"s":""}</span>
                          </div>
                          {(bloco.exercicios||[]).map((ex,ei)=>{
                            const isCardio=ex.tipo==="cardio";
                            return(
                              <div key={ex.id||ei} style={{background:"#121212",border:"1px solid #2a1a08",borderRadius:8,padding:"10px 12px",marginBottom:ei<bloco.exercicios.length-1?8:0,borderLeft:"3px solid "+cor}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                                  <div style={{fontSize:11,fontWeight:700,color:cor,minWidth:22}}>{ei+1}</div>
                                  <div style={{fontWeight:600,fontSize:13,flex:1,color:cor}}>{ex.nome||"--"}</div>
                                </div>
                                {isCardio
                                  ? <>
                                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                                        {[{l:"Series",v:ex.series,c:cor},{l:"Intensidade",v:ex.intensidade,c:"#fbbf24"},{l:"Tempo / Dist.",v:ex.tempo,c:C.text}].map(f=>(
                                          <div key={f.l} style={{background:C.surface,border:"1px solid #2a1a08",borderRadius:7,padding:"7px 10px",textAlign:"center"}}>
                                            <div style={{fontSize:13,fontWeight:700,color:f.c}}>{f.v||"--"}</div>
                                            <div style={{fontSize:9,color:C.muted,marginTop:2}}>{f.l}</div>
                                          </div>
                                        ))}
                                      </div>
                                      {ex.obs&&(
                                        <div style={{background:cor+"12",border:"1px solid "+cor+"40",borderRadius:8,padding:"9px 12px"}}>
                                          <div style={{fontSize:9,color:cor,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Detalhes de execucao</div>
                                          <div style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:600}}>{ex.obs}</div>
                                        </div>
                                      )}
                                    </>
                                  : <>
                                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                                        {[{l:"Series",v:ex.series,c:cor},{l:"Reps",v:ex.reps,c:C.text},{l:"Carga",v:ex.carga,c:C.green}].map(f=>(
                                          <div key={f.l} style={{background:C.surface,border:"1px solid #2a1a08",borderRadius:7,padding:"7px 10px",textAlign:"center"}}>
                                            <div style={{fontSize:14,fontWeight:800,color:f.c}}>{f.v||"--"}</div>
                                            <div style={{fontSize:9,color:C.muted}}>{f.l}</div>
                                          </div>
                                        ))}
                                      </div>
                                      {ex.obs&&(
                                        <div style={{background:cor+"12",border:"1px solid "+cor+"40",borderRadius:8,padding:"9px 12px"}}>
                                          <div style={{fontSize:9,color:cor,fontWeight:700,textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Observacao</div>
                                          <div style={{fontSize:13,color:C.text,lineHeight:1.5,fontWeight:600}}>{ex.obs}</div>
                                        </div>
                                      )}
                                    </>
                                }
                              </div>
                            );
                          })}
                        </div>
                    }
                  </div>
                );
              })
            }
          </div>
        );
      })}
    </div>
  );
}

// ── FORMULÁRIO ADICIONAR PROFISSIONAL ────────────────────────────────────────
function AddProfForm({onSave,onCancel,forcarAdmin}){
  const [nome,setNome]=useState("");
  const [esp,setEsp]=useState("");
  const [role,setRole]=useState(forcarAdmin?"admin":"personal");
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [salvando,setSalvando]=useState(false);

  const salvar = async ()=>{
    setErro("");
    if(!nome.trim()){ setErro("Preencha o nome completo."); return; }
    if(!email.trim()){ setErro("Preencha o e-mail."); return; }
    if(!senha || senha.length<6){ setErro("A senha deve ter pelo menos 6 caracteres."); return; }

    setSalvando(true);
    try{
      // Cria a conta de autenticacao (email/senha) no Firebase
      const conta = await criarConta(email.trim(), senha);
      // Salva os dados do profissional no Firestore, usando o mesmo uid da conta
      const dados = { nome, especialidade:esp, role, email:email.trim(), foto:null };
      await salvarProfissional(conta.uid, dados);
      onSave({ ...dados, id: conta.uid });
    }catch(e){
      setErro(e.message || "Erro ao criar o profissional.");
    }
    setSalvando(false);
  };

  return(
    <div style={{display:"grid",gap:14}}>
      <div style={css.card}>
        <div style={css.secHdr}>Dados do Profissional</div>
        <div style={{display:"grid",gap:14}}>
          <div>
            <label style={css.lbl}>Nome completo *</label>
            <input style={css.input} value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: Professor Leandro"/>
          </div>
          <div>
            <label style={css.lbl}>Especialidade</label>
            <input style={css.input} value={esp} onChange={e=>setEsp(e.target.value)} placeholder="Ex: Musculação e Hipertrofia"/>
          </div>
          {!forcarAdmin&&(
            <div>
              <label style={css.lbl}>Funcao</label>
              <select style={css.input} value={role} onChange={e=>setRole(e.target.value)}>
                <option value="personal">Personal Trainer</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{...css.card,background:"#0a1a10",border:"1px solid #34d39940"}}>
        <div style={{...css.secHdr,color:"#34d399"}}>Acesso ao App</div>
        <div style={{display:"grid",gap:14}}>
          <div>
            <label style={css.lbl}>E-mail de login *</label>
            <input type="email" style={css.input} value={email} onChange={e=>setEmail(e.target.value)} placeholder="profissional@email.com"/>
          </div>
          <div>
            <label style={css.lbl}>Senha (minimo 6 caracteres) *</label>
            <input type="password" style={css.input} value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Senha de acesso"/>
          </div>
        </div>
      </div>

      {erro&&(
        <div style={{background:"#1a0808",border:"1px solid #7f1d1d60",borderRadius:8,padding:"10px 14px"}}>
          <div style={{fontSize:12,color:"#f87171",fontWeight:600}}>⚠ {erro}</div>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <button onClick={onCancel} style={{...css.btnB,width:"100%",padding:"11px"}}>Cancelar</button>
        <button onClick={salvar} disabled={salvando}
          style={{...css.btnA,width:"100%",padding:"11px",opacity:salvando?.6:1}}>
          {salvando ? "Criando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}

// ── TELA LOGIN COMPLETA ───────────────────────────────────────────────────────
// ── FORMULARIO DE LOGIN REAL (email/senha via Firebase Authentication) ──────
function LoginProfissionalForm({onVoltar, onLoginProf}){
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const entrar = async ()=>{
    if(!email.trim() || !senha.trim()){
      setErro("Preencha e-mail e senha.");
      return;
    }
    setErro("");
    setCarregando(true);
    try{
      const usuario = await fazerLogin(email.trim(), senha);
      // Busca os dados completos do profissional no Firestore (nome, role, etc.)
      const dadosProf = await buscarProfissional(usuario.uid);
      if(!dadosProf){
        setErro("Login realizado, mas não encontramos seu cadastro de profissional. Fale com o administrador.");
        setCarregando(false);
        return;
      }
      onLoginProf({ ...dadosProf, id: usuario.uid });
    }catch(e){
      setErro(e.message || "Erro ao entrar. Verifique e-mail e senha.");
    }
    setCarregando(false);
  };

  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={onVoltar}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Login Profissional</div>
        <div style={{width:70}}/>
      </header>
      <div style={{minHeight:"70vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{maxWidth:360,width:"100%"}}>
          <div style={css.card}>
            <div style={css.secHdr}>Entrar</div>

            {erro&&(
              <div style={{background:"#1a0808",border:"1px solid #7f1d1d60",borderRadius:8,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:12,color:"#f87171",fontWeight:600}}>⚠ {erro}</div>
              </div>
            )}

            <div style={{marginBottom:14}}>
              <label style={css.lbl}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") entrar(); }}
                placeholder="seu@email.com"
                style={css.input}
                autoComplete="email"
              />
            </div>

            <div style={{marginBottom:20}}>
              <label style={css.lbl}>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={e=>setSenha(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") entrar(); }}
                placeholder="Sua senha"
                style={css.input}
                autoComplete="current-password"
              />
            </div>

            <button onClick={entrar} disabled={carregando}
              style={{...css.btnA, width:"100%", padding:"13px", fontSize:15, opacity:carregando?.6:1}}>
              {carregando ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({profissionais,alunos,onLoginProf,onLoginAluno}){
  const [tela,setTela]=useState("home"); // "home" | "prof" | "aluno"
  const [busca,setBusca]=useState("");

  const resultados=busca.trim().length>=2
    ? alunos.filter(a=>a.nome.toLowerCase().includes(busca.toLowerCase())).slice(0,5)
    : [];

  const bg="radial-gradient(ellipse at top,#1a0800 0%,#0a0a0a 60%)";

  // ── TELA HOME ──
  if(tela==="home") return(
    <div style={css.app}><GF/>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:bg}}>
        <div style={{maxWidth:360,width:"100%"}}>
          {/* Logo */}
          <div style={{textAlign:"center",marginBottom:40}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><LogoUP size={80}/></div>
            <div style={{fontWeight:800,fontSize:32,color:"#f97316",letterSpacing:.5}}>UP <span style={{color:"#fbbf24"}}>Fitness</span></div>
            <div style={{fontSize:13,color:C.muted,marginTop:8}}>Selecione como deseja entrar</div>
          </div>
          {/* Dois botões grandes */}
          <div style={{display:"grid",gap:14}}>
            <button onClick={()=>setTela("prof")}
              style={{background:"linear-gradient(135deg,#1a1008,#241408)",border:"1px solid #f9731650",
                borderRadius:16,padding:"22px 20px",cursor:"pointer",textAlign:"left",width:"100%",
                display:"flex",alignItems:"center",gap:16}}>
              <div style={{width:48,height:48,borderRadius:12,background:"#f9731620",border:"1px solid #f9731640",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>👤</div>
              <div>
                <div style={{fontWeight:800,fontSize:17,color:C.text,marginBottom:3}}>Profissional</div>
                <div style={{fontSize:12,color:C.muted}}>Personal trainers e administradores</div>
              </div>
              <span style={{color:C.accent,fontSize:22,marginLeft:"auto"}}>›</span>
            </button>

            <button onClick={()=>setTela("aluno")}
              style={{background:"linear-gradient(135deg,#0a1a10,#0f2418)",border:"1px solid #34d39950",
                borderRadius:16,padding:"22px 20px",cursor:"pointer",textAlign:"left",width:"100%",
                display:"flex",alignItems:"center",gap:16}}>
              <div style={{width:48,height:48,borderRadius:12,background:"#34d39920",border:"1px solid #34d39940",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🏋</div>
              <div>
                <div style={{fontWeight:800,fontSize:17,color:C.text,marginBottom:3}}>Aluno</div>
                <div style={{fontSize:12,color:C.muted}}>Acesse seu treino e avaliacao</div>
              </div>
              <span style={{color:"#34d399",fontSize:22,marginLeft:"auto"}}>›</span>
            </button>
          </div>

          {/* Primeiro acesso: só aparece se ainda não existe nenhum profissional
              cadastrado no sistema. Depois que o primeiro Admin for criado, este
              link desaparece automaticamente (evita que qualquer pessoa crie contas). */}
          {profissionais.length===0&&(
            <div style={{textAlign:"center",marginTop:24}}>
              <button onClick={()=>setTela("primeiroAcesso")}
                style={{background:"transparent",border:"none",color:C.muted,fontSize:12,
                  cursor:"pointer",fontFamily:"Inter,sans-serif",textDecoration:"underline"}}>
                Primeiro acesso? Criar conta de administrador
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── TELA PRIMEIRO ACESSO (cria o primeiro Admin) ──
  if(tela==="primeiroAcesso") return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={()=>setTela("home")}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Primeiro Acesso</div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>
        <div style={{background:"#1a1008",border:"1px solid "+C.accent+"40",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:C.text,lineHeight:1.6}}>
          Como ainda não existe nenhum profissional cadastrado, crie aqui a primeira conta de administrador do UP Fitness.
        </div>
        <AddProfForm
          onSave={()=>{ setTela("prof"); }}
          onCancel={()=>setTela("home")}
          forcarAdmin={true}
        />
      </div>
    </div>
  );

  // ── TELA PROFISSIONAL (login real com email/senha) ──
  if(tela==="prof") return(
    <LoginProfissionalForm onVoltar={()=>setTela("home")} onLoginProf={onLoginProf}/>
  );

  // ── TELA ALUNO ──
  return(
    <div style={css.app}><GF/>
      <header style={css.hdr}>
        <button style={css.btnB} onClick={()=>{setTela("home");setBusca("");}}>← Voltar</button>
        <div style={{fontWeight:700,fontSize:15}}>Acesso Aluno</div>
        <div style={{width:70}}/>
      </header>
      <div style={css.wrap}>
        <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}}>
          Digite seu nome para acessar seu treino e avaliacao fisica.
        </div>
        <input
          style={{...css.input,padding:"12px 14px",fontSize:16,marginBottom:12}}
          placeholder="Digite seu nome..."
          value={busca}
          onChange={e=>setBusca(e.target.value)}
          autoComplete="off"
        />
        {busca.trim().length>=2&&(
          resultados.length>0
            ? <div style={{display:"grid",gap:10}}>
                {resultados.map(a=>(
                  <button key={a.id} onClick={()=>onLoginAluno(a)}
                    style={{background:C.card,border:"1px solid #2e1e0a",borderRadius:12,padding:"14px 16px",
                      display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left",width:"100%"}}>
                    <Avatar nome={a.nome} foto={a.foto} size={44}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:15,color:C.text}}>{a.nome}</div>
                      <div style={{fontSize:12,color:C.muted,marginTop:2}}>{a.objetivo} · {a.nivelExperiencia||"--"}</div>
                    </div>
                    <span style={{color:"#34d399",fontSize:20}}>→</span>
                  </button>
                ))}
              </div>
            : <div style={{textAlign:"center",color:C.muted,padding:"28px 0",fontSize:13}}>
                Nenhum aluno encontrado.
              </div>
        )}
        {busca.trim().length>0&&busca.trim().length<2&&(
          <div style={{textAlign:"center",color:C.muted,fontSize:12,padding:"8px 0"}}>
            Digite pelo menos 2 letras para buscar
          </div>
        )}
        <div style={{marginTop:20,background:"#0f0a04",border:"1px solid #2e1e08",borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
            🔒 Acesso somente leitura. Voce podera visualizar seu treino, ficha e avaliacao fisica.
          </div>
        </div>
      </div>
    </div>
  );
}
