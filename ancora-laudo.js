/* ═══════════════════════════════════════════════════════════════════════
   AXIS ÂNCORA PROFISSIONAL — laudo em A4
   ───────────────────────────────────────────────────────────────────────
   Gera um HTML de página fixa que imprime em PDF pelo próprio navegador,
   mesmo caminho já usado no laudo do DISC. Nada de biblioteca externa: o
   laudo precisa abrir daqui a três anos, numa perícia, sem depender de
   CDN nenhum.

   ESTRUTURA
     Capa
     01  O conceito das âncoras de carreira
     02  Suas 3 principais, com o mapa em radar
     03  Ranking completo, desalinhamento e alertas
     04  As 8 âncoras detalhadas, uma por página
     Fecho com observação ética e créditos
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const dataBR = s => {
    const d = s ? new Date(s) : new Date();
    return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
  };

  // Protocolo estável: mesmo convite gera sempre o mesmo número, para o
  // laudo reimpresso não mudar de identidade no arquivo do cliente.
  function protocolo(id, quando) {
    let h = 0;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000;
    const ano = (quando ? new Date(quando) : new Date()).getFullYear();
    return ano + '-' + String(h).padStart(6, '0');
  }

  let _n = 0;
  function pg(cap, titulo, sub, corpo, opts) {
    _n++;
    const o = opts || {};
    const m = String(cap).match(/Cap[ií]tulo\s+(\d+)\s*·\s*(.+)/i);
    return `<section class="pagina${o.cls ? ' ' + o.cls : ''}">
      <header class="ph">
        ${m ? `<span class="ph-num">${esc(m[1])}</span><span class="ph-cap">${esc(m[2])}</span>` : `<span class="ph-cap">${esc(cap)}</span>`}
        <span class="ph-marca">AXIS</span>
      </header>
      ${titulo ? `<h2 class="pt">${esc(titulo)}</h2>` : ''}
      ${sub ? `<p class="ps">${esc(sub)}</p>` : ''}
      <div class="pc">${corpo}</div>
      <footer class="pf"><span>${esc(o.rodape || '')}</span><span class="pf-n">${_n}</span></footer>
    </section>`;
  }

  // ── Radar das 8 âncoras ─────────────────────────────────────────────
  // Dois polígonos: o cheio é o quanto a âncora importa, o tracejado é o
  // quanto a função entrega. É a leitura mais rápida do desalinhamento.
  // Nome curto só para o radar: o nome inteiro em oito pontas se sobrepõe
  // e sai fora da área do desenho.
  const CURTO = { TF:'Técnica', GG:'Gestão', AU:'Autonomia', SE:'Segurança',
                  CE:'Criatividade', SD:'Serviço', PD:'Desafio', EV:'Estilo de vida' };

  function radar(ancoras) {
    const N = 8, R = 140, CX = 230, CY = 190;
    const ordem = ['TF','GG','AU','SE','CE','SD','PD','EV'];
    const porId = {}; ancoras.forEach(a => { porId[a.id] = a; });
    const ponto = (i, v) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / N;
      const r = R * (Math.max(0, Math.min(100, v)) / 100);
      return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)];
    };
    const anel = p => ordem.map((_, i) => ponto(i, p).join(',')).join(' ');
    const eixos = ordem.map((_, i) => {
      const [x, y] = ponto(i, 100);
      return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ddd6cd" stroke-width="1"/>`;
    }).join('');
    const imp = ordem.map((id, i) => ponto(i, (porId[id] || {}).pontos || 0).map(v => v.toFixed(1)).join(',')).join(' ');
    const temOferta = ordem.every(id => porId[id] && porId[id].oferta !== null && porId[id].oferta !== undefined);
    const ofr = temOferta
      ? ordem.map((id, i) => ponto(i, porId[id].oferta).map(v => v.toFixed(1)).join(',')).join(' ')
      : null;
    const rotulos = ordem.map((id, i) => {
      const a = porId[id] || {};
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / N;
      const x = CX + (R + 24) * Math.cos(ang), y = CY + (R + 24) * Math.sin(ang);
      const anc = Math.abs(Math.cos(ang)) < 0.3 ? 'middle' : (Math.cos(ang) > 0 ? 'start' : 'end');
      // Ponta de baixo desce, ponta de cima sobe: senão o rótulo encosta no
      // desenho de um lado e sobra espaço do outro.
      const dy = Math.sin(ang) > 0.7 ? 8 : (Math.sin(ang) < -0.7 ? -6 : 0);
      return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anc}" class="rl">
        <tspan x="${x.toFixed(1)}">${esc(CURTO[id] || a.nome || id)}</tspan>
        <tspan x="${x.toFixed(1)}" dy="12" class="rv">${a.pontos}</tspan></text>`;
    }).join('');
    return `<svg viewBox="0 0 460 400" class="radar">
      ${[20,40,60,80,100].map(p => `<polygon points="${anel(p)}" fill="none" stroke="#e6e1da" stroke-width="1"/>`).join('')}
      ${eixos}
      <polygon points="${imp}" fill="rgba(201,168,76,.28)" stroke="#C9A84C" stroke-width="2.2"/>
      ${ofr ? `<polygon points="${ofr}" fill="none" stroke="#1F1F1F" stroke-width="1.6" stroke-dasharray="5 4" opacity=".75"/>` : ''}
      ${rotulos}
    </svg>
    <div class="radar-leg">
      <span><u style="background:rgba(201,168,76,.5);border:1.5px solid #C9A84C"></u> o quanto a âncora importa</span>
      ${ofr ? '<span><u style="border-top:2px dashed #1F1F1F;height:0;background:none"></u> o quanto a função entrega hoje</span>' : ''}
    </div>`;
  }

  function barra(a) {
    return `<div class="bar-l">
      <div class="bar-h"><span><b>${a.posicao}.</b> ${esc(a.nome)}</span>
        <span class="bar-v">${a.pontos}${a.oferta !== null && a.oferta !== undefined ? ` <i>função ${a.oferta}</i>` : ''}</span></div>
      <div class="bar-t"><div class="bar-f" style="width:${a.pontos}%;background:${esc(a.cor)}"></div>
        ${a.oferta !== null && a.oferta !== undefined ? `<div class="bar-m" style="left:calc(${a.oferta}% - 1px)"></div>` : ''}</div>
    </div>`;
  }

  // ── Gerador ─────────────────────────────────────────────────────────
  /**
   * @param {Object} res       resultado de AXIS_ANCORA.calcular
   * @param {Array}  conteudo  as 8 âncoras com os textos
   * @param {Object} meta      {id, nome, empresa, cargo, data, profissional, versao, minutos}
   */
  function gerar(res, conteudo, meta) {
    _n = 0;
    meta = meta || {};
    const nome = meta.nome || 'Avaliado';
    const prof = meta.profissional || 'Clau Diniz';
    const proto = protocolo(meta.id, meta.data);
    const porId = {}; (conteudo || []).forEach(a => { porId[a.id] = a; });
    const top3 = res.ancoras.slice(0, 3);
    const rodape = nome + ' · Âncora Profissional';

    // Capa
    let corpo = `<section class="pagina capa">
      <div class="capa-top">
        <div class="capa-eyebrow">Análise das</div>
        <h1 class="capa-h1">Âncoras de<br>carreira</h1>
        <p class="capa-sub">Mapeamento do que orienta as escolhas profissionais desta pessoa e da distância entre o que ela precisa e o que a função de hoje entrega.</p>
      </div>
      <div class="capa-meio">
        <div class="capa-marca">AXIS <span>Insight</span></div>
        <div class="capa-selo">8 âncoras · modelo de Edgar Schein</div>
      </div>
      <div class="capa-base">
        <div><span>Avaliado</span><b>${esc(nome)}</b>${meta.cargo ? `<i>${esc(meta.cargo)}</i>` : ''}</div>
        <div><span>Empresa</span><b>${esc(meta.empresa || 'Avaliação individual')}</b></div>
        <div><span>Profissional responsável</span><b>${esc(prof)}</b></div>
        <div><span>Data · protocolo</span><b>${dataBR(meta.data)} · ${esc(proto)}</b></div>
      </div>
    </section>`;
    _n = 1;

    // 01 Conceito
    corpo += pg('Capítulo 01 · Conceito', 'O que é uma âncora de carreira',
      'O modelo que sustenta esta análise, e o que ele explica.',
      `<p>O termo foi criado por Edgar Schein, psicólogo organizacional que estudou por décadas como as pessoas decidem a própria carreira. Ele percebeu que, diante de escolhas diferentes, cada pessoa volta sempre a um mesmo conjunto de critérios, algo de que ela não abre mão mesmo diante de uma boa oferta em outra direção. É isso que se chama âncora.</p>
       <p>A âncora combina três coisas: aquilo em que a pessoa é boa, aquilo que a motiva e aquilo em que ela acredita. Ela não é rótulo nem limite. É um retrato do momento, construído pela história de vida e pelas experiências acumuladas, e pode se reorganizar ao longo do tempo.</p>
       <p>Todos nos identificamos, em algum grau, com as oito âncoras. O que muda é o peso. Quando é preciso escolher, duas ou três decidem.</p>
       <div class="oito">${(conteudo || []).map(a => `<div class="oito-i"><b style="color:${esc(a.cor)}">${esc(a.nome)}</b><span>${esc(a.resumo)}</span></div>`).join('')}</div>
       <div class="box">Por que isso entra num trabalho de riscos psicossociais: âncora não atendida por tempo prolongado não fica quieta. Ela aparece como desmotivação, presenteísmo, conflito com a liderança e pedido de demissão. Este laudo mede as duas coisas, o que a pessoa precisa e o que a função devolve, porque é a distância entre elas que adoece.</div>`,
      { rodape });

    // 02 Top 3 e radar
    corpo += pg('Capítulo 02 · Resultado', 'Suas 3 principais âncoras',
      'As três com maior pontuação, na ordem.',
      `<div class="podio">${top3.map(a => `
         <div class="podio-i">
           <div class="podio-n" style="background:${esc(a.cor)}">${a.posicao}</div>
           <div class="podio-t"><b>${esc(a.nome)}</b><span>${esc((porId[a.id] || {}).resumo || '')}</span></div>
           <div class="podio-p">${a.pontos}</div>
         </div>`).join('')}</div>
       <h3 class="h3">O seu mapa de âncoras</h3>
       ${radar(res.ancoras)}`,
      { rodape });

    // 03 Ranking, desalinhamento e alertas
    const alertas = (res.alertas || []);
    corpo += pg('Capítulo 03 · Leitura', 'Ranking completo e desalinhamento',
      'As oito na ordem, e o quanto a função de hoje entrega cada uma.',
      `${res.ancoras.map(barra).join('')}
       <div class="ida">
         <div class="ida-n"><span>Índice de desalinhamento</span><b>${res.ida === null ? '—' : res.ida}</b><i>${esc(res.idaNivel || '')}</i></div>
         <div class="ida-t">${esc(res.idaNota || 'Sem dados suficientes sobre a função atual.')}</div>
       </div>
       <p class="mini">O índice pesa as três âncoras principais, porque são elas que orientam a decisão desta pessoa. Ele vai de 0 a 100: quanto maior, mais distante o trabalho de hoje está do que a sustenta.</p>
       ${alertas.length ? `<h3 class="h3">Alertas de risco psicossocial</h3>
         <p class="mini" style="margin-top:-4px">Estes disparam por oferta baixa, mesmo em âncora que não está entre as principais, porque o efeito sobre a saúde não depende do ranking.</p>
         ${alertas.map(a => `<div class="alerta"><b>${esc(a.nome)}: a função entrega ${a.oferta} de 100</b><span>${esc(a.leitura)}</span></div>`).join('')}`
        : `<div class="box">Nenhuma âncora ficou abaixo do limite de alerta. Não há, neste instrumento, indicação de privação grave em nenhuma das oito dimensões.</div>`}`,
      { rodape });

    // 04 As oito detalhadas
    (res.ancoras || []).forEach(a => {
      const c = porId[a.id] || {};
      corpo += pg('Capítulo 04 · Detalhe', a.posicao + '. ' + a.nome,
        `${a.pontos} de 100 · ${a.faixa}${a.oferta !== null && a.oferta !== undefined ? ' · a função entrega ' + a.oferta : ''}`,
        `<p>${esc(c.definicao || '')}</p>
         <h3 class="h3">Características de quem tem esta âncora</h3>
         <ol class="lista">${(c.caracteristicas || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
         <h3 class="h3">Onde ela costuma se realizar</h3>
         <p class="mini">${esc(c.profissoes || '')}</p>
         <h3 class="h3">Motivadores e perguntas de checagem</h3>
         ${(c.motivadores || []).map((m, i) => `
           <div class="mot"><b>${i + 1}. ${esc(m.titulo)}</b>
             <span>${esc(m.texto)}</span>
             <i>${esc(m.perguntas)}</i></div>`).join('')}
         <div class="risco"><b>Leitura de risco</b><span>${esc(c.riscoNR1 || '')}</span></div>`,
        { rodape });
    });

    // Fecho
    corpo += pg('Encerramento', 'Como ler este documento', '',
      `<p>Este laudo descreve preferências de carreira declaradas pela própria pessoa em ${dataBR(meta.data)}${meta.minutos ? ', em ' + meta.minutos + ' minutos de resposta' : ''}. Ele não mede capacidade, desempenho, inteligência nem saúde mental, e não deve ser usado isoladamente para decidir contratação, promoção ou desligamento.</p>
       <p>As pontuações refletem o momento atual e podem mudar com a trajetória. A leitura de risco aponta situações que merecem conversa e ajuste de função, não diagnóstico clínico. Havendo sinal de sofrimento, o encaminhamento é para avaliação profissional específica.</p>
       <div class="etica">
         <b>Observação ética</b>
         <span>O conteúdo deste laudo é confidencial e pertence à pessoa avaliada. Seu uso pela organização se limita à finalidade combinada com ela, conforme a LGPD. A devolutiva é feita pela profissional responsável, que responde tecnicamente por esta leitura.</span>
       </div>
       <div class="cred">
         <p><b>Fundamentação.</b> O modelo das oito âncoras de carreira é de Edgar Schein, publicado desde 1978 e utilizado aqui com atribuição. Os itens do questionário, os textos de devolutiva e os índices são autorais da AXIS Consultorias, e não reproduzem o inventário original do autor.</p>
         <p><b>Sobre as faixas.</b> Os cortes de classificação e do índice de desalinhamento são convenção de leitura da AXIS, definidas por coerência interna do instrumento. Não são pontos de corte validados em amostra brasileira, e o laudo declara isso por transparência técnica.</p>
         <p><b>Protocolo.</b> ${esc(proto)} · versão do instrumento ${esc(meta.versao || '')} · emitido por ${esc(prof)}, AXIS Consultorias.</p>
       </div>`,
      { rodape, cls: 'fimpg' });

    return montarHTML(corpo, nome, proto);
  }

  function montarHTML(corpo, nome, proto) {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Âncora Profissional · ${esc(nome)}</title>
<link rel="icon" href="/axis-logo.png">
<style>
:root{--ink:#1F1F1F;--ink2:#4A4A4A;--ink3:#7d7770;--gold:#C9A84C;--cream:#D8C7B8;
      --areia:#EDE8E1;--fundo:#F1EEE9;--linha:#e2ddd5}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--fundo);color:var(--ink);font-family:'Segoe UI',Arial,sans-serif;font-size:13.2px;line-height:1.62}
.pagina{width:210mm;min-height:297mm;background:#fff;margin:14px auto;padding:18mm 17mm 15mm;
        position:relative;box-shadow:0 3px 16px rgba(0,0,0,.09);display:flex;flex-direction:column}
.ph{display:flex;align-items:center;gap:10px;padding-bottom:9px;border-bottom:1px solid var(--linha);margin-bottom:16px}
.ph-num{width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--cream);
        font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
.ph-cap{font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink3);font-weight:700}
.ph-marca{margin-left:auto;font-weight:900;letter-spacing:2px;font-size:11px;color:var(--cream)}
.pt{font-size:23px;font-weight:800;line-height:1.22;margin-bottom:5px}
.ps{font-size:12.6px;color:var(--ink3);margin-bottom:16px}
.pc{flex:1}
.pc p{margin-bottom:10px;text-align:justify}
.pf{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--linha);
    padding-top:8px;margin-top:16px;font-size:10.2px;color:var(--ink3)}
.pf-n{font-weight:800;color:var(--ink)}
.h3{font-size:12.5px;font-weight:800;letter-spacing:.3px;margin:16px 0 8px}
.mini{font-size:12.4px;color:var(--ink2)}
.box{background:var(--areia);border-radius:10px;padding:13px 15px;font-size:12.5px;margin-top:14px}

/* capa */
.capa{justify-content:space-between;padding:24mm 17mm 18mm}
.capa-eyebrow{font-size:11px;letter-spacing:3.5px;text-transform:uppercase;color:var(--ink3);margin-bottom:10px}
.capa-h1{font-size:48px;font-weight:800;line-height:1.06;letter-spacing:-.5px}
.capa-sub{font-size:13.6px;color:var(--ink2);max-width:118mm;margin-top:14px}
.capa-meio{border-top:1px solid var(--linha);border-bottom:1px solid var(--linha);padding:16px 0;
           display:flex;justify-content:space-between;align-items:center;gap:14px}
.capa-marca{font-weight:900;font-size:22px;letter-spacing:.5px}
.capa-marca span{color:var(--gold)}
.capa-selo{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink3)}
.capa-base{display:grid;grid-template-columns:1fr 1fr;gap:16px 24px}
.capa-base span{display:block;font-size:9.8px;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink3);margin-bottom:3px}
.capa-base b{font-size:14.5px;display:block}
.capa-base i{font-style:normal;font-size:12px;color:var(--ink2)}

/* pódio */
.podio-i{display:flex;align-items:center;gap:14px;background:var(--areia);border-radius:12px;padding:13px 16px;margin-bottom:9px}
.podio-n{width:34px;height:34px;flex:none;border-radius:50%;color:#fff;font-weight:800;font-size:15px;
         display:flex;align-items:center;justify-content:center}
.podio-t{flex:1}
.podio-t b{display:block;font-size:14.5px}
.podio-t span{font-size:12.2px;color:var(--ink2)}
.podio-p{font-size:22px;font-weight:800}

/* radar */
.radar{width:100%;max-width:150mm;display:block;margin:6px auto 2px}
.rl{font-size:9.4px;fill:var(--ink2);font-family:'Segoe UI',Arial,sans-serif}
.rv{font-weight:800;fill:var(--ink);font-size:10.4px}
.radar-leg{display:flex;justify-content:center;gap:22px;font-size:11.4px;color:var(--ink2);margin-top:2px}
.radar-leg u{display:inline-block;width:16px;height:9px;border-radius:2px;text-decoration:none;vertical-align:middle;margin-right:5px}

/* barras */
.bar-l{margin-bottom:11px}
.bar-h{display:flex;justify-content:space-between;gap:12px;font-size:12.6px;margin-bottom:4px}
.bar-v{white-space:nowrap;font-weight:800}
.bar-v i{font-style:normal;font-weight:400;color:var(--ink3);font-size:11.6px}
.bar-t{position:relative;background:var(--areia);border-radius:5px;height:10px}
.bar-f{height:10px;border-radius:5px}
.bar-m{position:absolute;top:-3px;width:2px;height:16px;background:var(--ink);opacity:.6}

/* ida e alertas */
.ida{display:flex;gap:18px;align-items:center;background:var(--areia);border-radius:12px;padding:14px 16px;margin:16px 0 8px}
.ida-n span{display:block;font-size:9.8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink3)}
.ida-n b{font-size:30px;font-weight:800;line-height:1.1}
.ida-n i{font-style:normal;font-size:12px;font-weight:700}
.ida-t{flex:1;font-size:12.5px;color:var(--ink2)}
.alerta{border:1px solid #d9b3b3;background:#fbf5f5;border-radius:10px;padding:11px 14px;margin-bottom:8px}
.alerta b{display:block;font-size:12.8px;margin-bottom:3px}
.alerta span{font-size:12.2px;color:var(--ink2)}

/* conteúdo das âncoras */
.oito{display:grid;grid-template-columns:1fr 1fr;gap:9px 18px;margin-top:14px}
.oito-i b{display:block;font-size:12.6px}
.oito-i span{font-size:11.8px;color:var(--ink2)}
.lista{margin:0 0 4px 17px}
.lista li{margin-bottom:5px;font-size:12.6px}
.mot{border-left:2.5px solid var(--gold);padding:2px 0 2px 12px;margin-bottom:11px}
.mot b{display:block;font-size:12.7px}
.mot span{display:block;font-size:12.3px;color:var(--ink2);margin:2px 0 4px}
.mot i{display:block;font-style:italic;font-size:12px;color:var(--ink3)}
.risco{background:var(--ink);color:var(--cream);border-radius:10px;padding:13px 15px;margin-top:14px}
.risco b{display:block;font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--gold);margin-bottom:5px}
.risco span{font-size:12.4px}
.etica{border:1px solid var(--linha);border-radius:10px;padding:13px 15px;margin:16px 0}
.etica b{display:block;font-size:10.5px;letter-spacing:1.6px;text-transform:uppercase;color:var(--ink3);margin-bottom:5px}
.etica span{font-size:12.4px}
.cred{border-top:1px solid var(--linha);padding-top:12px;font-size:11.8px;color:var(--ink2)}
.cred p{margin-bottom:7px;text-align:left}

/* impressão */
@page{size:A4;margin:0}
@media print{
  html,body{background:#fff;margin:0;padding:0;width:210mm}
  .pagina{margin:0 !important;box-shadow:none !important;page-break-after:always;break-after:page}
  .pagina:last-of-type,.fimpg{page-break-after:auto;break-after:auto}
  .no-print{display:none !important}
  .podio-i,.mot,.alerta,.risco,.etica,.box,.bar-l,.oito-i{page-break-inside:avoid;break-inside:avoid}
  body{padding-top:0}
}
.barra-topo{position:fixed;top:0;left:0;right:0;background:var(--ink);color:#fff;padding:11px 20px;
            display:flex;align-items:center;gap:13px;z-index:99;font-size:13.6px}
.barra-topo b{color:var(--gold);font-weight:900;letter-spacing:1px}
.btn-imp{margin-left:auto;background:var(--gold);color:var(--ink);border:none;padding:9px 20px;
         border-radius:8px;font:inherit;font-weight:700;cursor:pointer}
body{padding-top:46px}
</style></head>
<body>
<div class="barra-topo no-print">
  <b>AXIS</b><span>Âncora Profissional · ${esc(nome)} · protocolo ${esc(proto)}</span>
  <button class="btn-imp" onclick="window.print()">Salvar em PDF ou imprimir</button>
</div>
${corpo}
</body></html>`;
  }

  function nomeArquivo(meta) {
    const limpo = s => semAcento(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const d = meta && meta.data ? new Date(meta.data) : new Date();
    const data = String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + d.getFullYear();
    return 'AXIS-Ancora-' + (limpo(meta && meta.nome) || 'Avaliado') +
           (meta && meta.empresa ? '-' + limpo(meta.empresa) : '') + '-' + data + '.html';
  }

  function abrir(res, conteudo, meta) {
    const blob = new Blob([gerar(res, conteudo, meta)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Baixa em vez de só abrir: o endereço temporário morre quando a aba
  // fecha, e a consultora precisa guardar e enviar o laudo ao cliente.
  function baixar(res, conteudo, meta) {
    const blob = new Blob([gerar(res, conteudo, meta)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo(meta);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    return a.download;
  }

  global.ANCORA_LAUDO = { gerar, abrir, baixar, nomeArquivo, protocolo };

})(window);
