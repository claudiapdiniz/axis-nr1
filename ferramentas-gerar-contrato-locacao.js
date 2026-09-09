// Gera contrato-locacao.html (servidor AXIS) a partir do artifact.
// O texto do contrato e o CSS são reaproveitados inteiros; troca-se a
// camada de dados (claude.use("db") -> API do servidor) e tiram-se os
// dados pessoais que não podem entrar num repositório público.
const fs = require("fs");
const path = require("path");

const ORIGEM = process.argv[2];
const DESTINO = process.argv[3];
let h = fs.readFileSync(ORIGEM, "utf8");

function trocar(inicio, fim, novo, nome){
  const i = h.indexOf(inicio);
  if(i < 0) throw new Error("não achei o início de " + nome);
  const j = fim ? h.indexOf(fim, i + inicio.length) : h.length;
  if(j < 0) throw new Error("não achei o fim de " + nome);
  h = h.slice(0, i) + novo + h.slice(j);
}

/* ---------- 1. dados padrão sem nada pessoal ---------- */
const PADRAO_NOVO = `const PADRAO = {
  locadora:{ nome:"", nacionalidade:"brasileira", nascimento:"", natural:"", estadoCivil:"",
    profissao:"", cpf:"", rg:"", endereco:"", whatsapp:"" },
  locatario:{ nome:"", nacionalidade:"brasileiro", nascimento:"", natural:"", estadoCivil:"",
    profissao:"motorista de aplicativo", cpf:"", rg:"", cnh:"", categoria:"B",
    endereco:"", whatsapp:"" },
  anuente:{ nome:"", nacionalidade:"brasileiro", nascimento:"", natural:"", estadoCivil:"",
    profissao:"", cpf:"", rg:"", endereco:"", whatsapp:"" },
  veiculo:{ marcaModelo:"", especie:"", ano:"", cor:"", combustivel:"", placa:"",
    renavam:"", chassi:"", km:"" },
  seguro:{ apolice:"", seguradora:"", franquia:"", vigenciaIni:"", vigenciaFim:"", cnpjFinanceira:"" },
  valores:{ semanal:"", caucao:"", pagamento:"PIX", multaIndicacaoValor:"", multaIndicacaoPct:"50", foro:"" },
  fecho:{ cidade:"", dia:"", mes:"", ano:String(new Date().getFullYear()),
    test1Nome:"", test1Cpf:"", test2Nome:"", test2Cpf:"" },
  vistoria:{ tipo:"Entrega inicial", data:"", hora:"", local:"", km:"", bateria:"", observacoes:"" },
  itens:{}, fotos:[]
};

/* Blocos que se repetem em toda locação e ficam guardados como modelo.
   O locatário e a vistoria mudam a cada aluguel, por isso ficam de fora. */
const BLOCOS_MODELO = ["locadora","anuente","veiculo","seguro","valores"];
`;
trocar("const PADRAO = {", "\nconst ITENS = [", PADRAO_NOVO, "PADRAO");

/* ---------- 2. camada de dados: API do servidor ---------- */
const PERSISTENCIA = `/* ============ persistência: API da AXIS ============ */
let token = null;
try{ token = localStorage.getItem("clv:token"); }catch(e){}

async function api(rota, corpo){
  const opc = { method: corpo ? "POST" : "GET", headers:{} };
  if(token) opc.headers["Authorization"] = "Bearer " + token;
  if(corpo){ opc.headers["Content-Type"] = "application/json"; opc.body = JSON.stringify(corpo); }
  const r = await fetch(rota, opc);
  if(r.status === 401){
    token = null;
    try{ localStorage.removeItem("clv:token"); }catch(e){}
    abrirPortao("Sua sessão expirou. Entre de novo.");
    throw new Error("sessao");
  }
  return r.json();
}

function indiceLocal(){
  try{ return JSON.parse(localStorage.getItem(LS_IDX) || "[]"); }catch(e){ return []; }
}
function resumo(){
  return {
    id:idAtual,
    nome:st.locatario.nome || "Locação sem nome",
    placa:st.veiculo.placa || "",
    atualizado:new Date().toISOString()
  };
}
function gravarLocal(){
  try{
    localStorage.setItem(LS_DOC(idAtual), JSON.stringify(st));
    localStorage.setItem(LS_ULT, idAtual);
    const idx = indiceLocal().filter(x => x.id !== idAtual);
    idx.unshift(resumo());
    localStorage.setItem(LS_IDX, JSON.stringify(idx.slice(0,40)));
  }catch(e){ /* espaço cheio no aparelho: o servidor continua valendo */ }
}
function estado(txt, ok){
  const el = document.getElementById("estado");
  el.textContent = txt;
  el.className = "estado" + (ok ? " ok" : "");
}
function agendarSalvar(){
  gravarLocal();
  estado("Salvando");
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(salvarNuvem, 1200);
}
async function salvarNuvem(){
  if(!token){ estado("Salvo neste aparelho", true); return; }
  try{
    const corpo = clonar(st);
    delete corpo.fotos;
    const r = await api("/api/locacao/salvar", {id:idAtual, dados:corpo, resumo:resumo()});
    estado(r && r.ok ? "Salvo no servidor" : "Salvo só neste aparelho", !!(r && r.ok));
  }catch(e){ estado("Salvo só neste aparelho"); }
}
async function salvarFotoNuvem(f){
  if(!token) return;
  try{ await api("/api/locacao/foto", {locacaoId:idAtual, id:f.id, url:f.url, legenda:f.legenda, ordem:f.ordem}); }
  catch(e){ estado("Foto salva só neste aparelho"); }
}
async function apagarFotoNuvem(id){
  if(!token) return;
  try{ await api("/api/locacao/foto/apagar", {id}); }catch(e){}
}
async function carregarNuvem(id){
  if(!token) return null;
  const r = await api("/api/locacao/abrir?id=" + encodeURIComponent(id));
  if(!r || !r.ok || !r.dados) return null;
  const base = estadoNovo();
  const s = Object.assign(base, r.dados);
  s.itens = Object.assign(base.itens, r.dados.itens || {});
  s.fotos = (r.fotos || []).sort((a,b) => (a.ordem||0) - (b.ordem||0));
  return s;
}
async function listar(){
  const mapa = new Map();
  indiceLocal().forEach(r => mapa.set(r.id, r));
  if(token){
    try{
      const r = await api("/api/locacao/lista");
      (r.locacoes || []).forEach(l => mapa.set(l.id, {
        id:l.id, nome:l.locatario || "Locação sem nome", placa:l.placa || "", atualizado:l.atualizado
      }));
    }catch(e){}
  }
  listaLocacoes = Array.from(mapa.values())
    .sort((a,b) => String(b.atualizado||"").localeCompare(String(a.atualizado||"")));
  desenharLista();
}

/* O modelo guarda os blocos fixos (locadora, proprietário, veículo,
   seguro, valores) para a locação nova já nascer preenchida. Fica no
   banco, nunca no código, porque carrega CPF e endereço. */
async function salvarModelo(){
  if(!token) return false;
  const m = {};
  BLOCOS_MODELO.forEach(b => m[b] = clonar(st[b]));
  try{
    const r = await api("/api/locacao/salvar", {id:"modelo", dados:m, resumo:{nome:"modelo", placa:""}});
    return !!(r && r.ok);
  }catch(e){ return false; }
}
async function lerModelo(){
  if(!token) return null;
  try{
    const r = await api("/api/locacao/abrir?id=modelo");
    return (r && r.ok && r.dados) ? r.dados : null;
  }catch(e){ return null; }
}
function aplicarModelo(s, modelo){
  if(!modelo) return s;
  BLOCOS_MODELO.forEach(b => { if(modelo[b]) s[b] = Object.assign(s[b], modelo[b]); });
  return s;
}

`;
trocar("/* ============ persistência ============ */", "/* ============ formulário ============ */",
  PERSISTENCIA, "persistência");

/* ---------- 3. lista, abrir, excluir, nova locação ---------- */
const LISTA = `/* ============ lista ============ */
function desenharLista(){
  const alvo = document.getElementById("lista-locacoes");
  if(!listaLocacoes.length){
    alvo.innerHTML = '<p style="font-size:13.5px;color:var(--tinta-3);margin:0">Nenhuma locação guardada ainda.</p>';
    return;
  }
  alvo.innerHTML = listaLocacoes.map(r => {
    const d = r.atualizado ? new Date(r.atualizado).toLocaleDateString("pt-BR") : "";
    return '<button class="linha-loc" data-id="' + esc(r.id) + '" aria-current="' + (r.id === idAtual) + '">' +
      '<span class="qm"><b>' + esc(r.nome) + "</b><span>" + esc(r.placa) + (d ? "  " + d : "") + "</span></span>" +
      '<span class="apagar" data-apagar="' + esc(r.id) + '">Excluir</span></button>';
  }).join("");
  alvo.querySelectorAll(".linha-loc").forEach(b => {
    b.addEventListener("click", async ev => {
      const el = ev.target;
      if(el.dataset && el.dataset.apagar){
        ev.stopPropagation();
        if(!confirm("Excluir esta locação? Não dá para desfazer.")) return;
        await excluir(el.dataset.apagar);
        return;
      }
      await abrir(b.dataset.id);
      trocarAba("form");
    });
  });
}
async function excluir(id){
  try{
    localStorage.removeItem(LS_DOC(id));
    localStorage.setItem(LS_IDX, JSON.stringify(indiceLocal().filter(x => x.id !== id)));
  }catch(e){}
  if(token){ try{ await api("/api/locacao/excluir", {id}); }catch(e){} }
  if(id === idAtual) await novaLocacao();
  await listar();
}
async function abrir(id){
  let s = null;
  try{ s = await carregarNuvem(id); }catch(e){}
  if(!s){
    try{ s = JSON.parse(localStorage.getItem(LS_DOC(id)) || "null"); }catch(e){}
  }
  if(!s) return;
  const base = estadoNovo();
  st = Object.assign(base, s);
  st.itens = Object.assign(base.itens, s.itens || {});
  st.fotos = s.fotos || [];
  idAtual = id;
  try{ localStorage.setItem(LS_ULT, id); }catch(e){}
  desenharForm();
  desenharDocumento();
  estado(token ? "Salvo no servidor" : "Salvo neste aparelho", true);
}
async function novaLocacao(){
  st = estadoNovo();
  aplicarModelo(st, await lerModelo());
  idAtual = novoId();
  desenharForm();
  desenharDocumento();
  gravarLocal();
  estado("Locação nova");
  trocarAba("form");
  window.scrollTo(0,0);
}

`;
trocar("/* ============ lista ============ */", "/* ============ abas e barra ============ */",
  LISTA, "lista");

/* ---------- 4. início: portão de senha e carga inicial ---------- */
const INICIO = `/* ============ portão de entrada ============ */
function abrirPortao(msg){
  const p = document.getElementById("portao");
  p.classList.remove("oculto");
  document.getElementById("portao-erro").textContent = msg || "";
  document.getElementById("portao-senha").focus();
}
function fecharPortao(){ document.getElementById("portao").classList.add("oculto"); }

async function iniciarPortao(){
  let primeira = false;
  try{
    const r = await fetch("/api/locacao/status").then(x => x.json());
    primeira = r && r.ok && !r.definida;
  }catch(e){}
  const t2 = document.getElementById("portao-senha2");
  const bt = document.getElementById("portao-bt");
  document.getElementById("portao-texto").textContent = primeira
    ? "Ninguém cadastrou senha ainda. Escolha a sua agora, com pelo menos 6 caracteres."
    : "Digite a senha para entrar.";
  t2.hidden = !primeira;
  bt.textContent = primeira ? "Criar senha e entrar" : "Entrar";

  async function enviar(){
    const s1 = document.getElementById("portao-senha").value;
    const err = document.getElementById("portao-erro");
    err.textContent = "";
    bt.disabled = true;
    try{
      let r;
      if(primeira){
        if(s1.length < 6){ err.textContent = "A senha precisa de pelo menos 6 caracteres."; bt.disabled = false; return; }
        if(s1 !== t2.value){ err.textContent = "As duas senhas estão diferentes."; bt.disabled = false; return; }
        r = await fetch("/api/locacao/senha", {method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({senhaNova:s1})}).then(x => x.json());
      }else{
        r = await fetch("/api/locacao/entrar", {method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({senha:s1})}).then(x => x.json());
      }
      if(!r || !r.ok){ err.textContent = (r && r.error) || "Não consegui entrar."; bt.disabled = false; return; }
      token = r.token;
      try{ localStorage.setItem("clv:token", token); }catch(e){}
      fecharPortao();
      await depoisDeEntrar();
    }catch(e){ err.textContent = "Falha de conexão. Tente de novo."; }
    bt.disabled = false;
  }
  bt.onclick = enviar;
  document.getElementById("portao-senha").addEventListener("keydown", e => { if(e.key === "Enter" && !primeira) enviar(); });
  t2.addEventListener("keydown", e => { if(e.key === "Enter") enviar(); });
}

/* Semear o modelo por link: abrir a página uma vez com #modelo=<base64>
   grava os dados fixos no banco sem que eles passem pelo código. */
async function semearPeloLink(){
  const h = location.hash || "";
  if(!h.startsWith("#modelo=")) return false;
  try{
    const bruto = decodeURIComponent(escape(atob(h.slice(8).replace(/-/g,"+").replace(/_/g,"/"))));
    const modelo = JSON.parse(bruto);
    BLOCOS_MODELO.forEach(b => { if(modelo[b]) st[b] = Object.assign(st[b], modelo[b]); });
    const ok = await salvarModelo();
    /* O endereço só é limpo depois de gravar. Se a gravação falhar, o
       link continua valendo e basta recarregar a página. */
    if(ok){
      history.replaceState(null, "", location.pathname);
      estado("Dados fixos gravados", true);
    }else{
      estado("Não gravei os dados fixos. Recarregue esta página.");
    }
    return true;
  }catch(e){ return false; }
}

/* Aviso honesto quando a locadora está em branco: sem os dados fixos
   gravados, a pessoa abre a tela e acha que o sistema não carregou. */
function avisarSemModelo(){
  const f = document.getElementById("tela-form");
  if(!f || document.getElementById("aviso-modelo")) return;
  const d = document.createElement("div");
  d.className = "grupo";
  d.id = "aviso-modelo";
  d.innerHTML = '<div class="corpo" style="padding-top:16px"><div class="aviso">' +
    "Os dados fixos ainda não estão gravados: locadora, proprietário, veículo, seguro e valores. " +
    "Abra uma vez o link que carrega esses dados, ou preencha à mão e toque em " +
    '"Salvar os dados fixos desta tela como modelo", na aba Locações.' +
    "</div></div>";
  f.insertBefore(d, f.firstChild);
}

async function depoisDeEntrar(){
  const semeou = await semearPeloLink();
  if(!semeou){
    const modelo = await lerModelo();
    if(modelo && !st.locadora.nome) aplicarModelo(st, modelo);
  }
  desenharForm();
  desenharDocumento();
  if(!st.locadora.nome) avisarSemModelo();
  await listar();
  if(!semeou) salvarNuvem();
}

/* ============ início ============ */
(async function(){
  let ultimo = null;
  try{ ultimo = localStorage.getItem(LS_ULT); }catch(e){}
  let carregado = false;
  if(ultimo){
    try{
      const s = JSON.parse(localStorage.getItem(LS_DOC(ultimo)) || "null");
      if(s){
        const base = estadoNovo();
        st = Object.assign(base, s);
        st.itens = Object.assign(base.itens, s.itens || {});
        st.fotos = s.fotos || [];
        idAtual = ultimo; carregado = true;
      }
    }catch(e){}
  }
  if(!carregado){ st = estadoNovo(); idAtual = novoId(); }

  document.getElementById("tab-form").onclick = () => trocarAba("form");
  document.getElementById("tab-doc").onclick = () => trocarAba("doc");
  document.getElementById("tab-lista").onclick = () => trocarAba("lista");
  document.getElementById("bt-nova").onclick = novaLocacao;
  document.getElementById("bt-modelo").onclick = async () => {
    const ok = await salvarModelo();
    estado(ok ? "Modelo atualizado" : "Não consegui salvar o modelo", ok);
    alert(ok
      ? "Pronto. Locadora, proprietário, veículo, seguro e valores desta tela vão vir preenchidos na próxima locação."
      : "Não consegui salvar o modelo agora. Tente de novo com o celular conectado.");
  };
  document.getElementById("modo-impressao").onchange = desenharDocumento;

  desenharForm();
  desenharDocumento();
  desenharBarra("form");

  if(token){
    estado("Conectado", true);
    await depoisDeEntrar();
  }else{
    estado("Fora do ar");
    await iniciarPortao();
    abrirPortao("");
  }
})();
</script>
</body>
</html>
`;
trocar("/* ============ início ============ */", null, INICIO, "início");

/* ---------- 5. cabeça do documento com o ícone AXIS ---------- */
const CABECA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="apple-touch-icon" href="axis-logo.png">
<link rel="icon" href="axis-logo.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Contrato">
<meta name="theme-color" content="#123a94">
<meta name="robots" content="noindex, nofollow">
`;
h = CABECA + h;

/* ---------- 6. estilo do portão + fim do head ---------- */
const ESTILO_PORTAO = `
/* ---------- portão de senha ---------- */
.portao{
  position:fixed; inset:0; z-index:80; background:var(--fundo);
  display:flex; align-items:center; justify-content:center; padding:24px;
}
.portao.oculto{display:none}
.portao-caixa{
  width:100%; max-width:360px; background:var(--papel); border:1px solid var(--linha);
  border-radius:var(--r); box-shadow:var(--sombra); padding:26px 22px; display:grid; gap:12px;
}
.portao-caixa h1{font-size:18px; margin:0; font-weight:600}
.portao-caixa p{margin:0; font-size:13.5px; color:var(--tinta-2)}
.portao-caixa input{
  width:100%; padding:12px; border:1px solid var(--linha); border-radius:8px;
  background:var(--fundo-2); color:var(--tinta);
}
.portao-erro{min-height:18px; font-size:13px; color:var(--ambar) !important}
@media print{ .portao{display:none !important} }
</style>
</head>
<body>
<div class="portao" id="portao">
  <div class="portao-caixa">
    <h1>Contrato de Locação</h1>
    <p id="portao-texto">Digite a senha para entrar.</p>
    <input type="password" id="portao-senha" placeholder="Senha" autocomplete="current-password">
    <input type="password" id="portao-senha2" placeholder="Repita a senha" autocomplete="new-password" hidden>
    <button class="bt principal" id="portao-bt">Entrar</button>
    <p class="portao-erro" id="portao-erro"></p>
  </div>
</div>
<script>
/* O portão nasce fechando a tela. Quem já entrou uma vez passa direto,
   sem piscar a senha; quem não entrou nunca vê o formulário por trás. */
try{ if(localStorage.getItem("clv:token")) document.getElementById("portao").classList.add("oculto"); }catch(e){}
</script>

`;
{
  const iEstilo = h.indexOf("</style>");
  const iHeader = h.indexOf("<header", iEstilo);
  if(iEstilo < 0 || iHeader < 0) throw new Error("não achei o fim do estilo");
  h = h.slice(0, iEstilo) + ESTILO_PORTAO + h.slice(iHeader);
}

/* ---------- 7. botão de modelo na tela de locações ---------- */
h = h.replace(
  '<button class="bt" id="bt-nova">Começar uma locação nova</button>',
  '<button class="bt" id="bt-nova">Começar uma locação nova</button>' +
  '\n        <button class="bt" id="bt-modelo">Salvar os dados fixos desta tela como modelo</button>'
);

/* ---------- 8. texto de rodapé da lista ---------- */
h = h.replace(
  "As locações ficam guardadas na nuvem desta página. Preencha no celular na hora da entrega e abra no computador para imprimir.",
  "As locações ficam guardadas no servidor da AXIS, protegidas por senha. Preencha no celular na hora da entrega e abra no computador para imprimir."
);

/* ---------- 9. preencher pelo documento (só na versão do servidor) ---------- */
const LEITOR = `<script>
/* ---------- Preencher pelo documento ----------
   Foto da CNH, do CRLV, do comprovante de residência, ou um contrato em
   PDF ou Word: o servidor lê e devolve os campos. Nada entra sozinho no
   formulário, a leitura aparece na tela e a pessoa confirma. */

const ROTULOS_LEITURA = {
  locatario:{ _bloco:"Locatário", nome:"Nome", nacionalidade:"Nacionalidade", nascimento:"Nascimento",
    natural:"Natural de", estadoCivil:"Estado civil", profissao:"Profissão", cpf:"CPF", rg:"RG",
    cnh:"CNH", categoria:"Categoria", endereco:"Endereço", whatsapp:"WhatsApp" },
  locadora:{ _bloco:"Locadora", nome:"Nome", nacionalidade:"Nacionalidade", nascimento:"Nascimento",
    natural:"Natural de", estadoCivil:"Estado civil", profissao:"Profissão", cpf:"CPF", rg:"RG",
    endereco:"Endereço", whatsapp:"WhatsApp" },
  anuente:{ _bloco:"Proprietário anuente", nome:"Nome", nacionalidade:"Nacionalidade", nascimento:"Nascimento",
    natural:"Natural de", estadoCivil:"Estado civil", profissao:"Profissão", cpf:"CPF", rg:"RG",
    endereco:"Endereço", whatsapp:"WhatsApp" },
  veiculo:{ _bloco:"Veículo", marcaModelo:"Marca e modelo", especie:"Espécie", ano:"Ano", cor:"Cor",
    combustivel:"Combustível", placa:"Placa", renavam:"Renavam", chassi:"Chassi", km:"Quilometragem" },
  seguro:{ _bloco:"Seguro", apolice:"Apólice", seguradora:"Seguradora", franquia:"Franquia",
    vigenciaIni:"Vigência de", vigenciaFim:"Vigência até", cnpjFinanceira:"CNPJ da financeira" },
  valores:{ _bloco:"Valores", semanal:"Aluguel semanal", caucao:"Caução", pagamento:"Forma de pagamento",
    multaIndicacaoValor:"Multa por não indicar condutor", multaIndicacaoPct:"Percentual da multa", foro:"Foro" }
};

let _leituraPendente = null;

function comprimirDoc(arquivo){
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onerror = () => falha(new Error("leitura"));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => falha(new Error("imagem"));
      img.onload = () => {
        const max = 1800;
        let w = img.width, hh = img.height;
        if(w > hh && w > max){ hh = Math.round(hh * max / w); w = max; }
        else if(hh >= w && hh > max){ w = Math.round(w * max / hh); hh = max; }
        const c = document.createElement("canvas");
        c.width = w; c.height = hh;
        c.getContext("2d").drawImage(img, 0, 0, w, hh);
        let q = 0.84, url = c.toDataURL("image/jpeg", q);
        while(url.length > 2600000 && q > 0.4){ q -= 0.12; url = c.toDataURL("image/jpeg", q); }
        ok(url.split(",")[1]);
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}
function base64De(arquivo){
  return new Promise((ok, falha) => {
    const l = new FileReader();
    l.onerror = () => falha(new Error("leitura"));
    l.onload = () => ok(String(l.result).split(",")[1]);
    l.readAsDataURL(arquivo);
  });
}

/* Cada bloco lê o documento que é dele: a CNH preenche o locatário, o
   CRLV preenche o carro. Assim a pessoa não precisa confiar que a
   leitura vai adivinhar onde o dado pertence. */
const DICAS_LEITURA = {
  locatario:"CNH, RG ou comprovante de residência do motorista",
  locadora:"CNH, RG ou comprovante de residência",
  anuente:"CNH, RG ou comprovante de residência do proprietário",
  veiculo:"CRLV ou documento do carro",
  seguro:"apólice ou bilhete do seguro"
};

function pintarLeitura(bloco, campos, caixa){
  const rot = ROTULOS_LEITURA[bloco] || {};
  const vindos = campos[bloco] || {};
  const achados = Object.keys(vindos).map(k => {
    const v = String(vindos[k] || "").trim();
    return (v && rot[k]) ? {campo:k, rotulo:rot[k], valor:v} : null;
  }).filter(Boolean);

  if(!achados.length){
    caixa.innerHTML = '<p class="leitura-vazia">Não achei dados de ' + esc((rot._bloco || bloco).toLowerCase()) +
      " neste arquivo. Tente uma foto mais próxima, com o documento inteiro e sem reflexo.</p>";
    return;
  }
  caixa.innerHTML = '<div class="leitura">' +
    '<p class="leitura-topo">Li ' + esc(campos.documento || "o documento") + ". Confira antes de usar.</p>" +
    achados.map(a => '<div class="leitura-linha"><span>' + esc(a.rotulo) + "</span><b>" + esc(a.valor) + "</b></div>").join("") +
    '<button type="button" class="bt principal bt-usar">Preencher este bloco</button>' +
    '<button type="button" class="bt bt-descartar">Descartar</button>' +
  "</div>";
  caixa.querySelector(".bt-usar").onclick = () => {
    achados.forEach(a => { st[bloco][a.campo] = a.valor; });
    if(bloco === "veiculo") guardarNaFrota(st.veiculo);
    desenharForm();
    desenharDocumento();
    agendarSalvar();
    estado("Bloco preenchido pelo documento", true);
  };
  caixa.querySelector(".bt-descartar").onclick = () => { caixa.innerHTML = ""; };
}

async function lerDocumentos(bloco, lista, caixa){
  const arquivos = Array.from(lista).slice(0,4);
  if(!arquivos.length) return;
  caixa.innerHTML = '<p class="leitura-topo">Lendo o documento. Isso leva alguns segundos.</p>';
  try{
    const enviar = [];
    for(const a of arquivos){
      if(a.type && a.type.startsWith("image/"))
        enviar.push({nome:a.name, tipo:"image/jpeg", dados: await comprimirDoc(a)});
      else
        enviar.push({nome:a.name, tipo:a.type || "", dados: await base64De(a)});
    }
    const r = await api("/api/locacao/ler-documento", {bloco, arquivos:enviar});
    if(!r || !r.ok){
      caixa.innerHTML = '<p class="leitura-vazia">' + esc((r && r.error) || "Não consegui ler este arquivo.") + "</p>";
      return;
    }
    pintarLeitura(bloco, r.campos || {}, caixa);
  }catch(e){
    caixa.innerHTML = '<p class="leitura-vazia">Falha ao enviar o arquivo. Confira a conexão e tente de novo.</p>';
  }
}

/* ---------- Garagem ----------
   Ela aluga mais de um carro. Sem isto, toda locação nova nascia com o
   carro do modelo e ela tinha que reescrever o veículo inteiro. Cada
   carro lido de um CRLV fica guardado e volta com um toque. A
   quilometragem não entra na garagem: ela muda a cada entrega. */
let _frota = null;

function carroDaFrota(v){
  const c = {};
  ["marcaModelo","especie","ano","cor","combustivel","placa","renavam","chassi"].forEach(k => c[k] = v[k] || "");
  return c;
}
async function lerFrota(){
  if(_frota) return _frota;
  try{
    const r = await api("/api/locacao/abrir?id=frota");
    _frota = (r && r.dados && Array.isArray(r.dados.carros)) ? r.dados.carros : [];
  }catch(e){ _frota = []; }
  return _frota;
}
async function guardarNaFrota(v){
  if(!v || !String(v.placa || "").trim()) return;
  const lista = await lerFrota();
  const placa = String(v.placa).trim().toUpperCase();
  const i = lista.findIndex(c => String(c.placa || "").trim().toUpperCase() === placa);
  if(i >= 0) lista[i] = carroDaFrota(v); else lista.push(carroDaFrota(v));
  _frota = lista;
  try{ await api("/api/locacao/salvar", {id:"frota", dados:{carros:lista}, resumo:{nome:"frota", placa:""}}); }catch(e){}
  pintarFrota();
}
function pintarFrota(){
  const caixa = document.getElementById("garagem");
  if(!caixa) return;
  const lista = _frota || [];
  const atual = String(st.veiculo.placa || "").trim().toUpperCase();
  caixa.innerHTML =
    (lista.length
      ? '<p class="leitura-dica">Seus carros. Toque para usar neste contrato.</p>' +
        '<div class="chips">' + lista.map((c,i) =>
          '<button type="button" class="chip" data-i="' + i + '" aria-pressed="' +
          (String(c.placa || "").trim().toUpperCase() === atual) + '">' +
          esc(c.placa || "sem placa") + '<span>' + esc((c.marcaModelo || "").slice(0,22)) + "</span></button>").join("") +
        "</div>"
      : "") +
    '<button type="button" class="bt-ler" id="bt-guardar-carro">Guardar este carro na garagem</button>';

  caixa.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => {
    const c = (_frota || [])[Number(b.dataset.i)];
    if(!c) return;
    Object.keys(c).forEach(k => { st.veiculo[k] = c[k]; });
    desenharForm();
    desenharDocumento();
    agendarSalvar();
    estado("Carro trocado para " + (c.placa || ""), true);
  }));
  const bt = document.getElementById("bt-guardar-carro");
  if(bt) bt.onclick = async () => {
    if(!String(st.veiculo.placa || "").trim()){ estado("Preencha a placa antes de guardar"); return; }
    await guardarNaFrota(st.veiculo);
    estado("Carro guardado na garagem", true);
  };
}

function injetarLeitor(){
  const f = document.getElementById("tela-form");
  if(!f) return;
  f.querySelectorAll("details.grupo").forEach(det => {
    const campo = det.querySelector("input[data-g]");
    const corpo = det.querySelector(".corpo");
    if(!campo || !corpo || corpo.querySelector(".leitor")) return;
    const bloco = campo.dataset.g;
    if(!DICAS_LEITURA[bloco]) return;
    const cx = document.createElement("div");
    cx.className = "leitor";
    cx.innerHTML =
      '<button type="button" class="bt-ler">Ler documento e preencher</button>' +
      '<p class="leitura-dica">' + DICAS_LEITURA[bloco] + "</p>" +
      '<input type="file" accept="image/*,application/pdf,.pdf,.docx" multiple hidden>' +
      '<div class="saida"></div>';
    corpo.insertBefore(cx, corpo.firstChild);
    if(bloco === "veiculo"){
      const g = document.createElement("div");
      g.className = "leitor";
      g.id = "garagem";
      corpo.insertBefore(g, cx);
      lerFrota().then(pintarFrota);
    }
    const entrada = cx.querySelector('input[type="file"]');
    cx.querySelector(".bt-ler").onclick = () => entrada.click();
    entrada.onchange = ev => {
      /* A lista de arquivos do campo é viva: limpar o campo antes de
         copiar esvazia a lista junto, e a leitura sai sem nada. */
      const arquivos = Array.from(ev.target.files || []);
      ev.target.value = "";
      lerDocumentos(bloco, arquivos, cx.querySelector(".saida"));
    };
  });
}

const _desenharFormBase = window.desenharForm;
window.desenharForm = function(){ _desenharFormBase.apply(null, arguments); injetarLeitor(); };
injetarLeitor();
<\/script>
`;
{
  const ESTILO_LEITURA = `
/* ---------- leitura de documento ---------- */
.leitor{display:grid; gap:4px; padding-bottom:4px}
.bt-ler{
  padding:11px 12px; border:1px solid var(--azul); border-radius:8px;
  background:var(--azul-claro); color:var(--azul); font-weight:500; font-size:14px; cursor:pointer;
}
.leitura-dica{margin:0; font-size:11.5px; color:var(--tinta-3)}
.chips{display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px}
.chip{
  display:grid; gap:1px; text-align:left; cursor:pointer;
  padding:7px 11px; border:1px solid var(--linha); border-radius:8px;
  background:var(--fundo-2); color:var(--tinta); font-family:var(--mono); font-size:13px;
}
.chip span{font-family:var(--ui); font-size:10.5px; color:var(--tinta-3); letter-spacing:.02em}
.chip[aria-pressed="true"]{border-color:var(--azul); background:var(--azul-claro); color:var(--azul)}
.chip[aria-pressed="true"] span{color:var(--azul)}
.leitura{display:grid; gap:8px; margin-top:12px}
.leitura-topo{margin:0; font-size:13px; color:var(--tinta-2)}
.leitura-vazia{margin:12px 0 0; font-size:13px; color:var(--ambar)}
.leitura-secao{
  font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--tinta-3);
  margin-top:6px; font-weight:600;
}
.leitura-linha{
  display:flex; gap:12px; justify-content:space-between; align-items:baseline;
  padding:7px 0; border-bottom:1px solid var(--linha); font-size:14px;
}
.leitura-linha span{color:var(--tinta-2); flex:0 0 auto}
.leitura-linha b{font-weight:600; text-align:right; word-break:break-word}
`;
  const i = h.indexOf("/* ---------- portão de senha ---------- */");
  if(i < 0) throw new Error("não achei onde entrar com o estilo da leitura");
  h = h.slice(0, i) + ESTILO_LEITURA + h.slice(i);
  const j = h.lastIndexOf("</body>");
  if(j < 0) throw new Error("não achei o fim do corpo");
  h = h.slice(0, j) + LEITOR + h.slice(j);
}

fs.writeFileSync(DESTINO, h, "utf8");
console.log("gerado:", DESTINO, (h.length/1024).toFixed(1) + " KB");
