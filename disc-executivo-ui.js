/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC EXECUTIVO — interface das 4 fases e tela de resultado
   Depende de disc-executivo.js (window.DISC_EXEC) e Chart.js 4.4.1.
   Tema do painel: claro (--branco #F5F5F3), sidebar #1F1F1F, dourado #C9A84C.

   LIÇÃO APRENDIDA (ver RASTREIO_ILG_DISC.md secção 10): a inicialização NÃO
   depende de evento de ciclo de vida. Verifica o estado real do DOM e, se já
   estiver pronto, inicializa direto. Foi exatamente isso que quebrou a
   plataforma da ILG e travou o questionário inteiro.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const D = global.DISC_EXEC;
  if (!D) { console.error('[disc-exec-ui] disc-executivo.js não carregado'); return; }

  const ROOT_ID = 'disc-exec-app';
  let st = null;   // estado da sessão

  const $  = s => document.querySelector(s);
  const el = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // ── ESTILO (injetado uma vez) ─────────────────────────────────────────
  function injetarCSS() {
    if (el('disc-exec-css')) return;
    const s = document.createElement('style');
    s.id = 'disc-exec-css';
    s.textContent = `
.dx{max-width:900px}
.dx-bar{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid rgba(31,31,31,.08);border-radius:var(--r,12px);padding:12px 18px;margin-bottom:18px;position:sticky;top:0;z-index:20}
.dx-bar b{font-family:'Montserrat',sans-serif;color:var(--amarelo)}
.dx-steps{display:flex;gap:6px;flex:1}
.dx-step{height:4px;flex:1;border-radius:4px;background:rgba(31,31,31,.10)}
.dx-step.on{background:var(--amarelo)}
.dx-pct{font-family:'Montserrat',sans-serif;font-weight:700;font-size:13px}
.dx-card{background:#fff;border:1px solid rgba(31,31,31,.08);border-radius:var(--r,12px);padding:20px 22px;margin-bottom:14px}
.dx-instr{font-size:13px;line-height:1.8;color:var(--cinza)}
.dx-instr ol{margin:8px 0 0 18px}
.dx-instr li{margin-bottom:4px}
.dx-q{font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--cinza);opacity:.55;margin-bottom:14px}
.dx-duo{display:grid;grid-template-columns:1fr 1fr;gap:22px}
@media(max-width:720px){.dx-duo{grid-template-columns:1fr}}
.dx-col-h{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--cinza);opacity:.5;display:flex;justify-content:space-between;margin-bottom:8px}
.dx-word{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid rgba(31,31,31,.14);border-radius:9px;padding:11px 14px;margin-bottom:8px;font:inherit;font-size:13px;color:var(--preto);cursor:pointer;transition:all .15s}
.dx-word:hover{border-color:var(--amarelo);background:rgba(201,168,76,.05)}
.dx-rank{min-height:110px;border:1px dashed rgba(31,31,31,.18);border-radius:9px;padding:8px}
.dx-rank.vazio{display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--cinza);opacity:.45;text-align:center}
.dx-placed{display:flex;align-items:center;gap:10px;background:rgba(201,168,76,.09);border:1px solid rgba(201,168,76,.35);border-radius:9px;padding:9px 12px;margin-bottom:6px;font-size:13px}
.dx-num{width:22px;height:22px;border-radius:50%;background:var(--amarelo);color:#fff;font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.dx-arrows{margin-left:auto;display:flex;flex-direction:column;gap:1px}
.dx-arrows button{background:none;border:none;cursor:pointer;color:var(--cinza);opacity:.45;line-height:1;padding:1px 4px;font-size:11px}
.dx-arrows button:hover:not(:disabled){opacity:1;color:var(--amarelo)}
.dx-arrows button:disabled{opacity:.15;cursor:default}
.dx-axis{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--amarelo);font-weight:700;text-align:center;margin:4px 0}
.dx-stmt{font-size:14px;line-height:1.6;margin-bottom:16px}
.dx-slider{width:100%;accent-color:var(--amarelo);cursor:pointer}
.dx-ends{display:flex;justify-content:space-between;font-size:11px;color:var(--cinza);opacity:.65;margin-top:6px}
.dx-val.neutro{color:var(--cinza);opacity:.55;font-weight:600}
.dx-val{font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:var(--amarelo);text-align:center;margin-top:4px;min-height:16px}
.dx-grid3{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.dx-vcard{background:#fff;border:1px solid rgba(31,31,31,.08);border-radius:var(--r,12px);padding:16px}
.dx-vtop,.dx-vbot{font-size:12px;line-height:1.5;min-height:34px}
.dx-vbot{color:var(--cinza)}
.dx-grid4{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.dx-chk{display:flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid rgba(31,31,31,.10);border-radius:8px;cursor:pointer;font-size:13px;transition:all .15s}
.dx-chk:hover{border-color:var(--amarelo)}
.dx-chk.on{background:rgba(201,168,76,.10);border-color:var(--amarelo)}
.dx-chk input{accent-color:var(--amarelo);cursor:pointer}
.dx-cta{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid rgba(31,31,31,.08);border-radius:var(--r,12px);padding:12px 18px;position:sticky;bottom:0;z-index:20;margin-top:14px}
.dx-count{font-size:12px;color:var(--cinza)}
.dx-count b{font-family:'Montserrat',sans-serif;color:var(--preto)}
.dx-cta .dx-acts{margin-left:auto;display:flex;gap:8px}
.dx-btn{font:inherit;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;border:none;cursor:pointer;transition:opacity .15s}
.dx-btn-p{background:var(--amarelo);color:#fff}
.dx-btn-p:disabled{opacity:.35;cursor:default}
.dx-btn-s{background:rgba(31,31,31,.06);color:var(--cinza)}
/* resultado */
.dx-hero{display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:center}
@media(max-width:760px){.dx-hero{grid-template-columns:1fr}}
.dx-sigla{font-family:'Montserrat',sans-serif;font-weight:800;font-size:40px;color:var(--amarelo);line-height:1}
.dx-fat{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.dx-fat-c{border:1px solid rgba(31,31,31,.08);border-radius:var(--r,12px);padding:14px 16px;background:#fff}
.dx-fat-top{display:flex;align-items:baseline;gap:8px}
.dx-fat-l{font-family:'Montserrat',sans-serif;font-weight:800;font-size:20px}
.dx-fat-i{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--cinza);opacity:.6}
.dx-fat-p{margin-left:auto;font-family:'Montserrat',sans-serif;font-weight:800;font-size:19px}
.dx-fat-f{font-size:9px;letter-spacing:1px;font-weight:700;margin-top:3px}
.dx-fat-r{font-size:12px;color:var(--cinza);margin-top:6px;line-height:1.5}
.dx-cap{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(31,31,31,.06);font-size:13px}
.dx-cap-n{width:24px;font-family:'Montserrat',sans-serif;font-weight:700;color:var(--amarelo);font-size:12px}
.dx-cap-b{flex:1;height:6px;border-radius:6px;background:rgba(31,31,31,.07);overflow:hidden}
.dx-cap-f{height:6px;border-radius:6px}
.dx-cap-v{width:34px;text-align:right;font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px}
.dx-idx{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.dx-idx-c{border:1px solid rgba(31,31,31,.08);border-radius:var(--r,12px);padding:14px;background:#fff}
.dx-idx-s{font-family:'Montserrat',sans-serif;font-weight:800;font-size:12px;color:var(--amarelo);letter-spacing:1px}
.dx-idx-v{font-family:'Montserrat',sans-serif;font-weight:800;font-size:28px;line-height:1.1;margin:4px 0}
.dx-idx-f{font-size:9px;letter-spacing:1px;font-weight:700;color:var(--cinza)}
.dx-idx-n{font-size:11px;color:var(--cinza);margin-top:6px;line-height:1.45}
`;
    document.head.appendChild(s);
  }

  // ── ESTADO ────────────────────────────────────────────────────────────
  // ── PERSISTÊNCIA LOCAL ────────────────────────────────────────────────
  // A avaliação leva de 15 a 25 minutos. Fechar a aba, recarregar sem querer
  // ou cair a conexão não pode custar tudo o que já foi respondido.
  // O progresso fica no navegador do respondente, por token de convite.
  function chaveSalva() {
    return 'axis-disc-' + ((st && st.opts && st.opts.token) || 'local');
  }

  function salvarProgresso() {
    if (!st || st.somenteLeitura || st.opts.somenteLeitura) return;
    if (st.fase === 0 || st.fase >= 5) return;   // nada a salvar antes de começar nem depois de enviar
    try {
      localStorage.setItem(chaveSalva(), JSON.stringify({
        v: 1, fase: st.fase, f1: st.f1, f2: st.f2, f3: st.f3, f4: st.f4,
        f2tocados: st.f2tocados, f3tocados: st.f3tocados,
        inicio: st.inicio, salvoEm: Date.now()
      }));
    } catch (e) { /* modo anônimo ou cota cheia: segue sem salvar */ }
  }

  // ── SINCRONIA COM O SERVIDOR ──────────────────────────────────────────
  // O localStorage resolve recarregar a página no mesmo aparelho. Para quem
  // começa no notebook e termina no celular, o rascunho precisa estar na
  // nuvem. Gravar a cada arrastada de régua seria uma requisição por pixel,
  // então: grava na hora ao mudar de fase e, dentro da fase, no máximo uma
  // vez a cada 12 segundos. Falha de rede nunca interrompe quem responde.
  let _ultimoEnvioNuvem = 0;
  let _timerNuvem = null;

  function pacoteRascunho() {
    return {
      fase: st.fase, f1: st.f1, f2: st.f2, f3: st.f3, f4: st.f4,
      f2tocados: st.f2tocados, f3tocados: st.f3tocados, inicio: st.inicio
    };
  }

  function salvarNaNuvem(agora) {
    if (!st || typeof st.opts.aoSalvarRascunho !== 'function') return;
    if (st.fase === 0 || st.fase >= 5) return;
    const disparar = () => {
      _ultimoEnvioNuvem = Date.now();
      _timerNuvem = null;
      try { st.opts.aoSalvarRascunho(pacoteRascunho()); } catch (e) { /* silencioso de propósito */ }
    };
    if (agora) { if (_timerNuvem) { clearTimeout(_timerNuvem); _timerNuvem = null; } return disparar(); }
    const desde = Date.now() - _ultimoEnvioNuvem;
    if (desde >= 12000) return disparar();
    if (!_timerNuvem) _timerNuvem = setTimeout(disparar, 12000 - desde);
  }

  // Última chance: ao fechar a aba, manda o que ainda não subiu.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', function () {
      if (st && st.opts && typeof st.opts.aoSalvarRascunho === 'function' && st.fase > 0 && st.fase < 5) {
        try { st.opts.aoSalvarRascunho(pacoteRascunho(), true); } catch (e) {}
      }
    });
  }

  function limparProgresso() {
    try { localStorage.removeItem(chaveSalva()); } catch (e) {}
  }

  function lerProgresso() {
    try {
      const bruto = localStorage.getItem(chaveSalva());
      if (!bruto) return null;
      const d = JSON.parse(bruto);
      if (!d || d.v !== 1 || !d.fase) return null;
      // descarta rascunho com mais de 7 dias
      if (d.salvoEm && Date.now() - d.salvoEm > 7 * 24 * 3600 * 1000) { limparProgresso(); return null; }
      return d;
    } catch (e) { return null; }
  }

  function restaurarProgresso() {
    const local = lerProgresso();
    const nuvem = (st.opts && st.opts.rascunhoInicial) || null;
    // vence o mais recente: o avaliado pode ter avançado em outro aparelho
    let d = local;
    if (nuvem && (!local || (nuvem.salvoEm || 0) > (local.salvoEm || 0))) d = nuvem;
    if (!d || !d.fase) return false;
    st.fase = d.fase;
    st.f1 = d.f1 || {}; st.f2 = d.f2 || {}; st.f3 = d.f3 || {}; st.f4 = d.f4 || [];
    st.f2tocados = d.f2tocados || {}; st.f3tocados = d.f3tocados || {};
    st.inicio = d.inicio || Date.now();
    st.retomado = true;
    st.retomadoDaNuvem = (d === nuvem);
    return true;
  }

  function novoEstado() {
    return {
      opts: {},                // {token, modo:'avaliado', aoFinalizar(payload,cb)}
      enviando: false,
      erroEnvio: null,
      fase: 0,                 // 0 intro, 1..4 fases, 5 resultado, 6 agradecimento
      f1: {},                  // {grupo: [capId,...]}
      f2: {},                  // {capId: 1..9}
      f3: {},                  // {capId: 1..21}
      f4: [],                  // [id]
      f2tocados: {},           // quais o usuário mexeu de fato
      f3tocados: {},
      inicio: null,
      resultado: null
    };
  }

  // ── RENDER ────────────────────────────────────────────────────────────
  let _faseNaTela = null;

  function render() {
    const raiz = el(ROOT_ID);
    if (!raiz) return;
    // Só sobe ao topo quando MUDA de fase. Dentro da mesma fase o redesenho
    // preserva a rolagem: senão, cada clique na fase 1 jogava a pessoa de
    // volta ao grupo 1.
    const mudouFase = _faseNaTela !== st.fase;
    const y = window.scrollY;

    const telas = [tIntro, tFase1, tFase2, tFase3, tFase4, tResultado, tAgradecimento];
    raiz.innerHTML = telas[st.fase]();
    ligarEventos();

    if (mudouFase) window.scrollTo(0, 0);
    else window.scrollTo(0, y);
    _faseNaTela = st.fase;

    if (st.fase === 5) desenharGraficos();
    salvarProgresso();
    salvarNaNuvem(mudouFase);
  }

  // Faixa de retomada: aparece uma vez, quando o rascunho foi recuperado.
  function faixaRetomada() {
    if (!st.retomado) return '';
    return '<div class="dx-card" style="border-color:rgba(201,168,76,.45);background:rgba(201,168,76,.07);display:flex;align-items:center;gap:12px">' +
      '<span style="font-size:13px;flex:1">' + (st.retomadoDaNuvem
        ? 'Retomamos de onde você parou em outro dispositivo. Suas respostas foram recuperadas.'
        : 'Retomamos de onde você parou. Suas respostas anteriores foram recuperadas.') + '</span>' +
      '<button class="dx-btn dx-btn-s" data-act="recomecar">Começar do zero</button></div>';
  }

  function barra() {
    const pct = [0, 0, 25, 50, 75, 100][st.fase];
    return `<div class="dx-bar"><span style="font-size:12px;color:var(--cinza)">Fase <b>${Math.max(1, st.fase)}/4</b></span><div class="dx-steps">${[1,2,3,4].map(n => `<div class="dx-step ${st.fase > n ? 'on' : ''}"></div>`).join('')}</div><span class="dx-pct">${pct}%</span></div>`;
  }

  function rodape(txt, ok, rotulo) {
    return `<div class="dx-cta"><span class="dx-count">${txt}</span><div class="dx-acts">
        ${st.fase > 1 ? '<button class="dx-btn dx-btn-s" data-act="voltar">Voltar</button>' : ''}
        <button class="dx-btn dx-btn-p" data-act="avancar" ${ok ? '' : 'disabled'}>${rotulo || 'Continuar'}</button></div></div>`;
  }

  // ── TELA 0: INTRO ─────────────────────────────────────────────────────
  function tIntro() {
    return `<div class="dx"><div class="dx-card"><div style="display:flex;align-items:center;gap:14px;margin-bottom:14px"><div><div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:20px">DISC Executivo</div><div style="font-size:11px;letter-spacing:.5px;color:var(--cinza);opacity:.65">Avaliação comportamental aplicada à liderança</div></div></div><p class="dx-instr">Esta avaliação mapeia o seu comportamento em <b>4 dimensões</b> e <b>24 capacidades</b>,
        e compara como você atua hoje com o que o seu contexto exige. São 4 fases e leva de 15 a 25 minutos.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:18px">
          ${[['1','Ordenação','12 grupos de adjetivos, do que mais ao que menos descreve você'],
             ['2','Intensidade','24 afirmativas em régua de 1 a 9'],
             ['3','Desempenho','24 ajustes que você faria para render mais'],
             ['4','Ajustes','características a reduzir, opcional']]
            .map(([n,t,d]) => `<div style="border:1px solid rgba(31,31,31,.08);border-radius:10px;padding:12px 14px;background:#fff"><div style="font-family:'Montserrat',sans-serif;font-weight:800;color:var(--amarelo);font-size:12px">FASE ${n}</div><div style="font-weight:600;font-size:13px;margin:2px 0 4px">${t}</div><div style="font-size:11px;color:var(--cinza);line-height:1.5">${d}</div></div>`).join('')}
        </div><p class="dx-instr" style="margin-top:18px;font-size:12px;opacity:.8">Responda com o que é verdade hoje,
        não com o que você gostaria que fosse. As fases se cruzam entre si, e respostas idealizadas aparecem no resultado.</p></div><div class="dx-cta"><span class="dx-count">4 fases &middot; 15 a 25 minutos</span><div class="dx-acts"><button class="dx-btn dx-btn-p" data-act="avancar">Começar avaliação →</button></div></div></div>`;
  }

  // ── TELA 1: RANKING FORÇADO ───────────────────────────────────────────
  function tFase1() {
    const feitos = D.FASE1.filter(g => (st.f1[g.g] || []).length === 4).length;
    const grupos = D.FASE1.map(g => {
      const postos = st.f1[g.g] || [];
      const livres = g.itens.filter(i => postos.indexOf(i.cap) < 0);
      return `<div class="dx-card" data-grupo="${g.g}"><div class="dx-q">Grupo ${g.g} de 12</div><div class="dx-duo"><div><div class="dx-col-h"><span>Adjetivos</span><span>${livres.length}</span></div>
            ${livres.length
              ? livres.map(i => `<button class="dx-word" data-por="${g.g}" data-cap="${i.cap}"><span style="opacity:.3">⠿</span>${esc(i.adj)}</button>`).join('')
              : '<div style="font-size:12px;color:var(--cinza);opacity:.45;padding:10px 0">Todos posicionados</div>'}
          </div><div><div class="dx-col-h"><span>Minha ordem</span><span>${postos.length} / 4</span></div><div class="dx-axis">↑ mais me descreve</div><div class="dx-rank ${postos.length ? '' : 'vazio'}">
              ${postos.length
                ? postos.map((capId, i) => {
                    const item = g.itens.find(x => x.cap === capId);
                    return `<div class="dx-placed"><span class="dx-num">${i + 1}</span>${esc(item ? item.adj : capId)}
                      <span class="dx-arrows"><button data-mv="up" data-g="${g.g}" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="subir">▲</button><button data-mv="dn" data-g="${g.g}" data-i="${i}" ${i === postos.length - 1 ? 'disabled' : ''} title="descer">▼</button></span></div>`;
                  }).join('')
                : 'Clique nos adjetivos ao lado,<br>do que mais descreve ao que menos'}
            </div><div class="dx-axis" style="color:var(--cinza);opacity:.5">↓ menos me descreve</div></div></div></div>`;
    }).join('');

    return `<div class="dx">${barra()}${faixaRetomada()}
      <div class="dx-card"><p class="dx-instr">
        Em cada grupo, <b>clique nos 4 adjetivos na ordem</b>: o primeiro é o que <b>mais</b> descreve você,
        o último é o que <b>menos</b> descreve. Use as setas ▲▼ para corrigir a ordem.
      </p></div>
      ${grupos}
      ${rodape(`<b>${feitos}</b> / 12 grupos ordenados`, feitos === 12)}
    </div>`;
  }

  // ── TELA 2: INTENSIDADE 1 a 9 ─────────────────────────────────────────
  function tFase2() {
    const n = Object.keys(st.f2tocados).length;
    const cards = D.FASE2.map((q, i) => {
      const v = st.f2[q.cap] != null ? st.f2[q.cap] : 5;
      const tocado = !!st.f2tocados[q.cap];
      return `<div class="dx-card"><div class="dx-q">${i + 1} de 24</div><div class="dx-stmt">${esc(q.txt)}</div><input type="range" class="dx-slider" min="1" max="9" step="1" value="${v}" data-f2="${q.cap}"><div class="dx-ends"><span>Não tem nada a ver comigo</span><span>Tem tudo a ver comigo</span></div><div class="dx-val" data-v2="${q.cap}">${tocado ? v + ' / 9' : ''}</div></div>`;
    }).join('');
    return `<div class="dx">${barra()}${faixaRetomada()}
      <div class="dx-card"><p class="dx-instr">
        Arraste cada régua para indicar <b>o quanto a afirmativa combina com você</b>.
        Aqui você é livre para se identificar com quantas quiser: mova todas as 24, mesmo as que ficarem no meio.
      </p></div>
      ${cards}
      ${rodape(`<b>${n}</b> / 24 respondidas`, n === 24)}
    </div>`;
  }

  // ── TELA 3: EIXOS BIPOLARES 1 a 21 ────────────────────────────────────
  // Rotulo do estado de um eixo. Centro = 'ja esta adequado', que e resposta.
  function rotuloF3(v) {
    return v === 11 ? 'já está adequado' : v > 11 ? 'preciso de mais' : 'preciso de menos';
  }

  function tFase3() {
    // O centro e resposta valida ('ja esta adequado'), entao NAO se exige
    // mexer nas 24. O contador mostra quantas pedem ajuste, so como leitura.
    const comAjuste = D.FASE3.filter(q => (st.f3[q.cap] != null ? st.f3[q.cap] : 11) !== 11).length;
    const cards = D.FASE3.map((q, i) => {
      const v = st.f3[q.cap] != null ? st.f3[q.cap] : 11;
      return `<div class="dx-vcard"><div class="dx-q" style="margin-bottom:8px">${i + 1} de 24</div><div class="dx-vtop">${esc(q.cima)}</div><input type="range" class="dx-slider" min="1" max="21" step="1" value="${v}" data-f3="${q.cap}" style="margin:10px 0"><div class="dx-vbot">${esc(q.baixo)}</div><div class="dx-val${v === 11 ? ' neutro' : ''}" data-v3="${q.cap}">${rotuloF3(v)}</div></div>`;
    }).join('');
    return `<div class="dx">${barra()}${faixaRetomada()}
      <div class="dx-card"><p class="dx-instr">
        Pergunta desta fase: <b>o que você precisaria ajustar para ter um desempenho melhor?</b>
        Pense em como as pessoas do seu convívio avaliam você.
        <br><br>Arraste para a <b>esquerda</b> se concorda com a frase de baixo, para a <b>direita</b> se concorda com a de cima.
        Se nesse ponto você já está bem, <b>deixe no centro</b>: aqui o centro é uma resposta válida.
      </p></div><div class="dx-grid3">${cards}</div>
      ${rodape(`<b>${comAjuste}</b> de 24 pedem ajuste &middot; o que ficar no centro conta como <b>já está adequado</b>`, true)}
    </div>`;
  }

  // ── TELA 4: CARACTERÍSTICAS A REDUZIR ─────────────────────────────────
  function tFase4() {
    const itens = D.FASE4.map(c => {
      const on = st.f4.indexOf(c.id) >= 0;
      return `<label class="dx-chk ${on ? 'on' : ''}"><input type="checkbox" data-f4="${c.id}" ${on ? 'checked' : ''}>${esc(c.txt)}</label>`;
    }).join('');
    return `<div class="dx">${barra()}${faixaRetomada()}
      <div class="dx-card"><p class="dx-instr">
        Última fase. Marque as características que você acredita que <b>as pessoas ao seu redor gostariam
        que você reduzisse</b> para você ter um desempenho melhor.
        <br><br>Esta fase é <b>opcional</b>. Marque o que for verdade, sem economizar e sem se punir.
      </p></div><div class="dx-card"><div class="dx-q">Para ter um desempenho melhor, eu deveria ser:</div><div class="dx-grid4">${itens}</div></div>
      ${rodape(`Opcional &middot; <b>${st.f4.length}</b> selecionadas`, true, 'Finalizar avaliação →')}
    </div>`;
  }

  // ── TELA 5: RESULTADO ─────────────────────────────────────────────────
  function tResultado() {
    const r = st.resultado;
    const F = D.FATORES;
    const fatores = r.perfil.ranking.map(k => `
      <div class="dx-fat-c"><div class="dx-fat-top"><span class="dx-fat-l" style="color:${F[k].cor}">${k}</span><span class="dx-fat-i">${F[k].indice}</span><span class="dx-fat-p" style="color:${F[k].cor}">${r.natural[k]}%</span></div><div class="dx-fat-f" style="color:${F[k].cor}">${r.faixaFator[k]}</div><div class="dx-fat-r">${F[k].resumo}</div></div>`).join('');

    const fortes = r.pontosFortes.map((c, i) => `
      <div class="dx-cap"><span class="dx-cap-n">${i + 1}</span><span style="flex:0 0 165px">${esc(c.nome)}</span><span class="dx-cap-b"><span class="dx-cap-f" style="width:${c.atual}%;background:${F[c.fator].cor}"></span></span><span class="dx-cap-v">${c.atual}</span></div>`).join('');

    const atencao = r.pontosAtencao.map(c => `
      <div class="dx-cap"><span class="dx-cap-n">·</span><span style="flex:0 0 165px">${esc(c.nome)}</span><span class="dx-cap-b"><span class="dx-cap-f" style="width:${c.atual}%;background:${F[c.fator].cor}"></span></span><span class="dx-cap-v">${c.atual}</span></div>`).join('');

    const I = r.indices;
    const defs = [
      ['ITA', I.ITA, 'Tendência da Autoestima', 'Combina suas forças nas dimensões dominantes com o quanto você se atribui e o quanto reconhece precisar melhorar.'],
      ['IPM', I.IPM, 'Pontos de Melhoria',      'O quanto você afirma ter a desenvolver, somando os ajustes da fase 3 com as características da fase 4.'],
      ['IDA', I.IDA, 'Discrepância da Autopercepção', 'A diferença entre como você se apresentou na fase forçada e na fase livre. Alto pode indicar resposta idealizada.'],
      ['IPS', I.IPS, 'Positividade Seletiva',   'O quanto você se atribuiu de características positivas na fase em que era livre para marcar tudo.'],
      ['IIA', I.IIA, 'Influência do Ambiente',  'O quanto o seu contexto pede um comportamento diferente do seu natural.']
    ].map(([s, v, n, d]) => `
      <div class="dx-idx-c"><div class="dx-idx-s">${s}</div><div class="dx-idx-v">${v}</div><div class="dx-idx-f">${D.faixaIndice(v)}</div><div class="dx-idx-n"><b>${n}.</b> ${d}</div></div>`).join('');

    return `<div class="dx"><div class="dx-card"><div class="dx-hero"><div><div class="dx-q" style="margin-bottom:6px">Resultado &middot; DISC Executivo</div><div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:24px;line-height:1.25;margin-bottom:6px">
              Perfil <span class="dx-sigla">${r.perfil.sigla}</span></div><p class="dx-instr" style="font-size:13px">
              ${D.FATORES[r.perfil.primario].indice} como dimensão predominante,
              ${D.FATORES[r.perfil.secundario].indice} como apoio.
            </p><div style="font-size:11px;color:var(--cinza);opacity:.7;margin-top:10px">
              24 capacidades &middot; 4 dimensões &middot; ${I.TCM.minutos} min (${I.TCM.faixa})
            </div></div><div><canvas id="dx-donut" height="260"></canvas></div></div></div><div class="dx-card"><div class="dx-q">Composição do perfil</div><div class="dx-fat">${fatores}</div></div><div class="dx-card"><div class="dx-q">Mapa de capacidades &middot; como está × como deveria estar</div><canvas id="dx-radar" height="380"></canvas></div><div class="dx-card"><div class="dx-q">Principais pontos fortes</div>
        ${fortes}
      </div><div class="dx-card"><div class="dx-q">Capacidades menos presentes hoje</div>
        ${atencao}
      </div><div class="dx-card"><div class="dx-q">Índices gerais</div><div class="dx-idx">${defs}</div></div><div class="dx-cta"><span class="dx-count">Avaliação concluída</span><div class="dx-acts"><button class="dx-btn dx-btn-s" data-act="json">Exportar dados</button>
          ${st.opts.somenteLeitura ? '' : '<button class="dx-btn dx-btn-s" data-act="reiniciar">Refazer</button>'}
        </div></div></div>`;
  }

  // ── TELA 6: AGRADECIMENTO (modo avaliado) ─────────────────────────────
  // O avaliado NÃO vê o resultado ao terminar. Quem libera é a consultora.
  function tAgradecimento() {
    return `<div class="dx"><div class="dx-card" style="text-align:center;padding:40px 26px"><div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:19px;margin-bottom:10px">
          Avaliação concluída</div><p class="dx-instr" style="max-width:460px;margin:0 auto">
          Obrigado pela participação. Suas respostas foram registradas com segurança.
          O resultado será liberado pela profissional responsável.
        </p></div></div>`;
  }

  // ── GRÁFICOS ──────────────────────────────────────────────────────────
  let _charts = [];
  function desenharGraficos() {
    _charts.forEach(c => { try { c.destroy(); } catch (e) {} });
    _charts = [];
    if (typeof Chart === 'undefined') return;
    const r = st.resultado, F = D.FATORES;

    const cd = el('dx-donut');
    if (cd) _charts.push(new Chart(cd, {
      type: 'doughnut',
      data: {
        labels: r.perfil.ranking.map(k => F[k].indice),
        datasets: [{ data: r.perfil.ranking.map(k => r.natural[k]),
                     backgroundColor: r.perfil.ranking.map(k => F[k].cor), borderWidth: 0 }]
      },
      options: { cutout: '62%', plugins: { legend: { position: 'bottom',
                 labels: { boxWidth: 10, font: { size: 10 } } } } }
    }));

    const cr = el('dx-radar');
    if (cr) {
      const caps = D.CAPACIDADES;
      _charts.push(new Chart(cr, {
        type: 'radar',
        data: {
          labels: caps.map(c => c.nome),
          datasets: [
            { label: 'Como está', data: caps.map(c => r.mapaAtual[c.id]),
              borderColor: '#C9A84C', backgroundColor: 'rgba(201,168,76,.18)', borderWidth: 2, pointRadius: 2 },
            { label: 'Como deveria estar', data: caps.map(c => r.mapaDesejado[c.id]),
              borderColor: '#4A7A8A', backgroundColor: 'rgba(74,122,138,.10)', borderWidth: 1.5,
              borderDash: [4, 3], pointRadius: 1.5 }
          ]
        },
        options: {
          scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 8 } },
                         pointLabels: { font: { size: 9 } } } },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
        }
      }));
    }
  }

  // ── EVENTOS ───────────────────────────────────────────────────────────
  function ligarEventos() {
    const raiz = el(ROOT_ID);
    if (!raiz) return;

    raiz.onclick = ev => {
      const t = ev.target.closest('[data-act],[data-por],[data-mv]');
      if (!t) return;

      if (t.dataset.act) return acao(t.dataset.act);

      // fase 1: posicionar adjetivo
      if (t.dataset.por) {
        const g = +t.dataset.por;
        st.f1[g] = st.f1[g] || [];
        if (st.f1[g].indexOf(t.dataset.cap) < 0 && st.f1[g].length < 4) st.f1[g].push(t.dataset.cap);
        return render();
      }
      // fase 1: reordenar
      if (t.dataset.mv) {
        const g = +t.dataset.g, i = +t.dataset.i;
        const a = st.f1[g], j = t.dataset.mv === 'up' ? i - 1 : i + 1;
        if (a && j >= 0 && j < a.length) { const x = a[i]; a[i] = a[j]; a[j] = x; }
        return render();
      }
    };

    // sliders: input atualiza só o valor exibido, sem re-render (não perde o foco)
    raiz.oninput = ev => {
      const s = ev.target;
      if (s.dataset.f2) {
        const v = +s.value;
        st.f2[s.dataset.f2] = v; st.f2tocados[s.dataset.f2] = 1;
        const lbl = raiz.querySelector(`[data-v2="${s.dataset.f2}"]`);
        if (lbl) lbl.textContent = v + ' / 9';
        atualizarContador(Object.keys(st.f2tocados).length, 24);
        salvarProgresso();
        salvarNaNuvem(false);
      }
      if (s.dataset.f3) {
        const v = +s.value;
        st.f3[s.dataset.f3] = v; st.f3tocados[s.dataset.f3] = 1;
        const lbl = raiz.querySelector(`[data-v3="${s.dataset.f3}"]`);
        if (lbl) { lbl.textContent = rotuloF3(v); lbl.classList.toggle('neutro', v === 11); }
        atualizarContador(Object.keys(st.f3tocados).length, 24);
        salvarProgresso();
        salvarNaNuvem(false);
      }
    };

    raiz.onchange = ev => {
      const c = ev.target;
      if (!c.dataset.f4) return;
      const id = c.dataset.f4, i = st.f4.indexOf(id);
      if (c.checked && i < 0) st.f4.push(id);
      if (!c.checked && i >= 0) st.f4.splice(i, 1);
      c.closest('.dx-chk').classList.toggle('on', c.checked);
      const cnt = raiz.querySelector('.dx-count');
      if (cnt) cnt.innerHTML = `Opcional &middot; <b>${st.f4.length}</b> selecionadas`;
      salvarProgresso();
      salvarNaNuvem(false);
    };
  }

  function atualizarContador(n, total) {
    const raiz = el(ROOT_ID);
    const cnt = raiz && raiz.querySelector('.dx-count');
    const btn = raiz && raiz.querySelector('[data-act="avancar"]');
    if (st.fase === 3) {
      // Fase 3: o centro e resposta valida, entao o botao nunca trava.
      const comAjuste = D.FASE3.filter(q => (st.f3[q.cap] != null ? st.f3[q.cap] : 11) !== 11).length;
      if (cnt) cnt.innerHTML = '<b>' + comAjuste + '</b> de 24 pedem ajuste &middot; o que ficar no centro conta como <b>já está adequado</b>';
      if (btn) btn.disabled = false;
      return;
    }
    if (cnt) cnt.innerHTML = '<b>' + n + '</b> / ' + total + ' respondidas';
    if (btn) btn.disabled = n < total;
  }

  function acao(a) {
    if (a === 'avancar') {
      if (st.fase === 0) st.inicio = Date.now();

      if (st.fase === 4) {
        // Eixos da fase 3 nao mexidos valem 11 (centro = "ja esta adequado").
        // Precisa ir explicito, senao o servidor recebe menos de 24 e recusa.
        const f3completo = {};
        D.FASE3.forEach(q => { f3completo[q.cap] = st.f3[q.cap] != null ? st.f3[q.cap] : 11; });
        const payload = {
          f1: st.f1, f2: st.f2, f3: f3completo, f4: st.f4,
          tempoSegundos: st.inicio ? Math.round((Date.now() - st.inicio) / 1000) : 0
        };

        // Modo avaliado: o cálculo roda no servidor. O navegador só envia.
        if (typeof st.opts.aoFinalizar === 'function') {
          if (st.enviando) return;
          st.enviando = true;
          const btn = el(ROOT_ID).querySelector('[data-act="avancar"]');
          if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
          st.opts.aoFinalizar(payload, function (ok, erro) {
            st.enviando = false;
            if (ok) { limparProgresso(); st.fase = 6; return render(); }
            st.erroEnvio = erro || 'Não foi possível enviar.';
            if (btn) { btn.disabled = false; btn.textContent = 'Tentar novamente →'; }
            const cnt = el(ROOT_ID).querySelector('.dx-count');
            if (cnt) cnt.innerHTML = '<span style="color:var(--vermelho)">' + esc(st.erroEnvio) + '</span>';
          });
          return;
        }

        // Modo local (a consultora testando no painel)
        st.resultado = D.calcular(payload);
      }

      st.fase++;
      return render();
    }
    if (a === 'voltar') { st.fase--; return render(); }
    if (a === 'recomecar') {
      if (!confirm('Começar do zero? As respostas recuperadas serão apagadas.')) return;
      const o = st.opts; limparProgresso(); st = novoEstado(); st.opts = o;
      _faseNaTela = null; st.fase = 1; st.inicio = Date.now(); return render();
    }
    if (a === 'reiniciar') {
      if (!confirm('Refazer a avaliação? As respostas atuais serão perdidas.')) return;
      limparProgresso(); st = novoEstado(); _faseNaTela = null; return render();
    }
    if (a === 'json') {
      const blob = new Blob([JSON.stringify({ respostas: { f1: st.f1, f2: st.f2, f3: st.f3, f4: st.f4 },
                                              resultado: st.resultado }, null, 2)],
                            { type: 'application/json' });
      const u = URL.createObjectURL(blob);
      const a2 = document.createElement('a');
      a2.href = u; a2.download = 'axis-disc-executivo.json'; a2.click();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }
  }

  // ── INICIALIZAÇÃO ─────────────────────────────────────────────────────
  // Verifica o estado real do DOM em vez de depender de evento de ciclo de
  // vida que pode já ter passado.
  function iniciar(opts) {
    injetarCSS();
    if (!st) { st = novoEstado(); _faseNaTela = null; }
    if (opts) st.opts = opts;
    // opts define o token, então a leitura do rascunho vem depois de aplicá-lo
    if (st.fase === 0) restaurarProgresso();
    render();
  }

  function quandoPronto(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  global.discExecIniciar = function (opts) { quandoPronto(function () { iniciar(opts); }); };

  // Exibe um resultado já calculado no servidor (avaliado com resultado liberado)
  global.discExecMostrarResultado = function (resultado, nome) {
    quandoPronto(function () {
      injetarCSS();
      st = novoEstado();
      _faseNaTela = null;
      st.opts = { modo: 'avaliado', somenteLeitura: true, nome: nome };
      st.resultado = resultado;
      st.fase = 5;
      render();
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
