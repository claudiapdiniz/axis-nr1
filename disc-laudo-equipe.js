/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC — RELATÓRIO DE EQUIPE
   O relatório individual responde "como esta pessoa age". Este responde
   "como este time funciona junto": onde há concentração, onde há lacuna,
   quem cobre quem, e onde o atrito é estrutural e não pessoal.

   Reaproveita o CSS e a paginação do relatório individual (disc-laudo.js).
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const D = global.DISC_EXEC || (typeof require === 'function' ? require('./disc-executivo.js') : null);
  const L = global.DISC_LAUDO || (typeof require === 'function' ? require('./disc-laudo.js') : null);
  const G = global.DISC_GRAF || (typeof require === 'function' ? require('./disc-graficos.js') : null);
  if (!D || !L || !G) { console.error('[disc-equipe] dependências não carregadas'); return; }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const med = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
  // As quatro dimensões de cada pessoa somam 100, então a média delas também
  // soma 100. Arredondar uma a uma quebra isso (19,4+23,0+28,7+28,9 vira
  // 20+23+29+29 = 101). Aqui o arredondamento distribui a sobra pelo maior
  // resto, e o total fecha sempre.
  function arredondarSomando100(bruto) {
    const ks = Object.keys(bruto);
    const piso = {}; let soma = 0;
    ks.forEach(k => { piso[k] = Math.floor(bruto[k]); soma += piso[k]; });
    const total = Math.round(ks.reduce((s, k) => s + bruto[k], 0));
    const restos = ks.map(k => ({ k, r: bruto[k] - Math.floor(bruto[k]) }))
                     .sort((x, y) => y.r - x.r);
    for (let i = 0; i < total - soma; i++) piso[restos[i % ks.length].k]++;
    return piso;
  }
  // faixa textual de um índice que pode não ter base (avaliação importada)
  const fx = v => (v == null ? 'sem base' : esc(D.faixaIndice(v)));

  // ── ANÁLISE DO TIME ───────────────────────────────────────────────────
  function analisar(pessoas) {
    const F = D.FATORES;
    const n = pessoas.length;

    // distribuição de perfis predominantes
    const predominante = { D:0, I:0, S:0, C:0 };
    pessoas.forEach(p => { predominante[p.resultado.perfil.primario]++; });

    // média do time por dimensão
    const dimBruto = {}, dimMin = {}, dimMax = {};
    ['D','I','S','C'].forEach(k => {
      const v = pessoas.map(p => p.resultado.natural[k]);
      dimBruto[k] = v.reduce((x, y) => x + y, 0) / v.length;
      // A média sozinha esconde o time: duas dimensões com a mesma média
      // podem ser uma parelha e a outra concentrada em poucas pessoas.
      dimMin[k] = Math.round(Math.min.apply(null, v));
      dimMax[k] = Math.round(Math.max.apply(null, v));
    });
    const dim = arredondarSomando100(dimBruto);

    // média e dispersão por capacidade
    const caps = D.CAPACIDADES.map(c => {
      const vals = pessoas.map(p => p.resultado.mapaAtual[c.id]);
      const m = med(vals);
      return { id:c.id, nome:c.nome, fator:c.fator, media:m,
               max:Math.max.apply(null, vals), min:Math.min.apply(null, vals),
               amplitude: Math.max.apply(null, vals) - Math.min.apply(null, vals),
               topo: pessoas[vals.indexOf(Math.max.apply(null, vals))] };
    });
    const forcasTime = caps.slice().sort((a, b) => b.media - a.media).slice(0, 6);
    const lacunasTime = caps.slice().sort((a, b) => a.media - b.media).slice(0, 6);

    // dimensão ausente: nenhum predominante e média baixa
    // Lacuna usa a régua do próprio instrumento: 25% é o esperado quando as
    // quatro dimensões pesam igual, e abaixo de 0,70 desse valor (17,5%) é
    // que a média entra em BAIXO. O limiar solto de 22% que havia aqui
    // chamava de "baixa" uma média de 19%, que a régua classifica como
    // normal, e o relatório se contradizia.
    const BAIXO = 25 * 0.70;
    const ausentes  = ['D','I','S','C'].filter(k => predominante[k] === 0 && dim[k] < BAIXO);
    // Ninguém aciona primeiro, mas a média está dentro do esperado: é outra
    // conversa, e não pode ser descrita como ausência de capacidade.
    const semDono   = ['D','I','S','C'].filter(k => predominante[k] === 0 && dim[k] >= BAIXO);
    const concentradas = ['D','I','S','C'].filter(k => predominante[k] / n >= 0.6);

    // pares mais complementares e mais parecidos
    const pares = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pessoas[i].resultado.natural, b = pessoas[j].resultado.natural;
      const dist = ['D','I','S','C'].reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);
      pares.push({ a: pessoas[i], b: pessoas[j], dist });
    }
    pares.sort((x, y) => y.dist - x.dist);

    // índices médios do time. Avaliação importada de outra plataforma só
    // tem o IIA: os demais índices dependem das fases 2, 3 e 4 daqui e vêm
    // nulos. Entram como ausentes, não como zero, senão puxam a média do
    // time para baixo e o relatório mente.
    const indices = {}, indicesBase = {};
    ['ITA','IPM','IDA','IPS','IIA'].forEach(k => {
      const vals = pessoas.map(p => p.resultado.indices && p.resultado.indices[k])
                          .filter(v => typeof v === 'number' && isFinite(v));
      indices[k] = vals.length ? med(vals) : null;
      indicesBase[k] = vals.length;
    });

    const maisAlta = ['D','I','S','C'].reduce((a,b) => predominante[b] > predominante[a] ? b : a, 'D');

    // quem entrou por relatório de outra plataforma
    const importados = pessoas.filter(p => p.resultado && p.resultado.importado);

    // ── COMO ESTÁ × COMO DEVERIA ESTAR ──
    // O mapa desejado vem da fase 3. Avaliação importada não tem, então as
    // duas médias são calculadas sobre a mesma base: comparar a média atual
    // de 12 pessoas com a desejada de 9 mistura gente diferente.
    const baseDes = pessoas.filter(p => p.resultado.mapaDesejado);
    const desejo = D.CAPACIDADES.map(c => {
      const at = med(baseDes.map(p => p.resultado.mapaAtual[c.id]));
      const de = med(baseDes.map(p => p.resultado.mapaDesejado[c.id]));
      return { id:c.id, nome:c.nome, fator:c.fator, atual:at, desejado:de, gap:de - at };
    });
    const ajustes = desejo.filter(c => Math.abs(c.gap) >= 3)
                          .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    // ── ESTILO DE LIDERANÇA: natural × o que o contexto pede ──
    // O adaptado de cada pessoa é a composição do mapa desejado. A média do
    // time nos dois retratos mostra para onde o grupo sente que precisa ir.
    const baseAd = pessoas.filter(p => p.resultado.adaptado);
    const lidBruto = { atual:{}, desejado:{} };
    ['D','I','S','C'].forEach(k => {
      lidBruto.atual[k]    = baseAd.reduce((s, p) => s + p.resultado.natural[k], 0) / (baseAd.length || 1);
      lidBruto.desejado[k] = baseAd.reduce((s, p) => s + p.resultado.adaptado[k], 0) / (baseAd.length || 1);
    });
    const lideranca = { atual: arredondarSomando100(lidBruto.atual),
                        desejado: arredondarSomando100(lidBruto.desejado), base: baseAd.length };

    // ── DECISÃO DO TIME: mesma régua do relatório individual ──
    const racional = dim.C + dim.D, emocional = dim.I + dim.S;
    const rapida = dim.D + dim.I, ponderada = dim.S + dim.C;
    const decisao = { racional, emocional, rapida, ponderada,
      eixo1: racional > emocional + 10 ? 'mais racional, apoiada em fato e lógica'
           : emocional > racional + 10 ? 'mais relacional, considerando o impacto nas pessoas'
           : 'equilibrada entre o dado e o impacto nas pessoas',
      eixo2: rapida > ponderada + 10 ? 'rápida, com tolerância a decidir sem ter tudo'
           : ponderada > rapida + 10 ? 'ponderada, buscando segurança antes de decidir'
           : 'de velocidade variável, conforme o peso da decisão' };
    const topoDim = ['D','I','S','C'].sort((a, b) => dim[b] - dim[a]).slice(0, 2);

    // ── QUEM O AMBIENTE MAIS PRESSIONA (IIA individual) ──
    const sigla = o => ['D','I','S','C'].sort((a, b) => o[b] - o[a]).slice(0, 2).join('');
    const pressao = pessoas
      .filter(p => p.resultado.adaptado && p.resultado.indices && typeof p.resultado.indices.IIA === 'number')
      .map(p => ({ p, iia: p.resultado.indices.IIA, nat: sigla(p.resultado.natural), ad: sigla(p.resultado.adaptado) }))
      .sort((a, b) => b.iia - a.iia);

    // ── AFINIDADE COM O TIME ──
    // Distância do perfil de cada um até a média dos OUTROS (sem ele mesmo,
    // senão a pessoa puxa a média para perto de si). Mesma escala do IIA:
    // metade da soma das diferenças é quanto do bolo de 100 precisaria mudar
    // de lugar; 75 é o máximo possível.
    const afinidade = n < 3 ? [] : pessoas.map(p => {
      const outros = pessoas.filter(x => x !== p);
      const dist = ['D','I','S','C'].reduce((s, k) => {
        const m = outros.reduce((t, x) => t + x.resultado.natural[k], 0) / outros.length;
        return s + Math.abs(p.resultado.natural[k] - m);
      }, 0);
      return { p, valor: Math.round(Math.max(0, 100 - dist / 2 / 75 * 100)) };
    }).sort((a, b) => a.valor - b.valor);
    const destoam = afinidade.filter(a => a.valor < 60);

    // ── O QUE O TIME QUER REDUZIR (fase 4) ──
    const P = global.DISC_PESSOAL || (typeof require === 'function' ? (() => { try { return require('./disc-pessoal.js'); } catch (e) { return null; } })() : null);
    const itensF4 = {};
    D.FASE4.concat(P ? P.FASE4 : []).forEach(x => { itensF4[x.id] = x; });
    const baseF4 = pessoas.filter(p => !p.resultado.importado);
    const contaF4 = {}, porFatorF4 = { D:0, I:0, S:0, C:0 };
    baseF4.forEach(p => (p.resultado.fase4Marcadas || []).forEach(id => {
      if (!itensF4[id]) return;
      contaF4[id] = (contaF4[id] || 0) + 1;
      porFatorF4[itensF4[id].fator]++;
    }));
    const reduzir = Object.keys(contaF4).map(id => ({ txt: itensF4[id].txt, fator: itensF4[id].fator, qtd: contaF4[id] }))
                          .sort((a, b) => b.qtd - a.qtd || a.txt.localeCompare(b.txt));

    return { n, predominante, maisAlta, dim, dimMin, dimMax, caps, forcasTime, lacunasTime, ausentes, semDono,
             concentradas, pares, indices, indicesBase, importados,
             baseDes: baseDes.length, desejo, ajustes, lideranca, decisao, topoDim, pressao,
             afinidade, destoam, baseF4: baseF4.length, reduzir, porFatorF4 };
  }

  // ── PÁGINAS ───────────────────────────────────────────────────────────
  let _n = 1;
  function pg(cap, titulo, sub, corpo, rodape, num) {
    _n++;
    return `<section class="pagina">
      <header class="ph">
        ${num ? `<span class="ph-num">${esc(num)}</span>` : ''}
        <span class="ph-cap">${esc(cap)}</span>
        <span class="ph-marca">AXIS</span>
      </header>
      ${titulo ? `<h2 class="pt">${esc(titulo)}</h2>` : ''}
      ${sub ? `<p class="ps">${esc(sub)}</p>` : ''}
      <div class="pc">${corpo}</div>
      <footer class="pf"><span>${esc(rodape || '')}</span><span class="pf-n">${_n}</span></footer>
    </section>`;
  }

  function gerar(pessoas, meta) {
    _n = 1;
    meta = meta || {};
    const F = D.FATORES;
    const A = analisar(pessoas);
    const empresa = meta.empresa || 'Equipe';
    const rod = 'AXIS · Relatório de Equipe · ' + empresa;
    const paginas = [];

    // ── CAPA ──
    paginas.push(`<section class="pagina capa">
      <div class="capa-top">
        <div>
          <div class="capa-marca">AXIS</div>
          <div class="capa-sub">Avaliação Comportamental</div>
        </div>
        <div class="capa-chips">
          ${['D','I','S','C'].map(k => `<span class="chip" style="background:${F[k].cor}">${k}</span>`).join('')}
        </div>
      </div>
      <div>
        <div class="capa-et">Relatório de equipe</div>
        <h1 class="capa-t">${esc(empresa)}</h1>
        <p class="capa-desc">Como este time se distribui, onde ele é forte, onde tem lacuna,
        quem complementa quem, como lidera e decide, e onde o atrito é estrutural.</p>
        <div class="capa-perfil">
          <span class="capa-sigla" style="background:var(--umber)">${A.n}</span>
          <span>
            <span class="capa-pn">${A.n === 1 ? 'pessoa avaliada' : 'pessoas avaliadas'}</span><br>
            <span class="capa-pd">DISC ${meta.modulo === 'pessoal' ? 'Pessoal' : 'Executivo'} · 24 capacidades</span>
          </span>
        </div>
      </div>
      <div>
        <table class="capa-tb">
          <tr><td>Empresa</td><td><b>${esc(empresa)}</b></td></tr>
          <tr><td>Avaliados</td><td>${A.n}</td></tr>
          <tr><td>Data</td><td>${esc(meta.data || new Date().toLocaleDateString('pt-BR'))}</td></tr>
        </table>
        <p class="capa-conf">Documento confidencial. Contém informação comportamental de pessoas
        identificadas e deve ser tratado conforme a política de privacidade da empresa.</p>
      </div>
    </section>`);

    // ── COMO LER ESTES NÚMEROS ──
    // Sem esta página, quem lê confunde a média do time com a contagem de
    // pessoas, e conclui que a conta está errada. Aconteceu na primeira
    // leitura real do relatório.
    paginas.push(pg('Como ler', 'Como ler estes números',
      'O que cada medida deste relatório significa, e o que ela não significa',
      `<div class="secao"><span>O perfil de cada pessoa</span></div>
      <p class="obs" style="font-size:15px;line-height:1.6;margin-bottom:10px">Cada avaliado distribui 100 pontos entre as quatro dimensões, conforme as
      escolhas que fez na avaliação. Por isso o perfil individual sempre soma 100%: as dimensões
      dividem o mesmo bolo. Ter 14% em uma delas não quer dizer ausência daquele comportamento,
      quer dizer que ele é o menos acionado dessa pessoa.</p>

      <div class="secao"><span>As duas medidas da próxima página</span></div>
      <table class="tb">
        <thead><tr><th>Medida</th><th>O que é</th><th>Como se lê</th></tr></thead>
        <tbody>
          <tr><td><b>Média do time</b></td>
              <td>A média daquela dimensão somando as ${A.n} pessoas</td>
              <td>As quatro médias somam 100%, como no perfil individual</td></tr>
          <tr><td><b>Predominante</b></td>
              <td>Quantas pessoas têm aquela dimensão como a mais alta delas</td>
              <td>Somadas, dão ${A.n}, o total de avaliados, e não 100%</td></tr>
          <tr><td><b>Faixa</b></td>
              <td>O menor e o maior valor daquela dimensão dentro do time</td>
              <td>Mostra se o time é parelho ou se depende de poucas pessoas</td></tr>
        </tbody>
      </table>
      <div class="box"><b>Por que uma dimensão pode ter média alta e nenhuma pessoa predominante.</b>
      É o caso mais mal-entendido do relatório. Significa que a capacidade existe, distribuída em
      todo mundo, mas não é a primeira que ninguém aciona sob pressão. Capacidade sem dono não é
      o mesmo que capacidade ausente, e as duas situações pedem decisões diferentes.</div>

      <div class="secao"><span>As 24 capacidades</span></div>
      <p class="obs" style="font-size:15px;line-height:1.6;margin-bottom:10px">Diferente das dimensões, cada capacidade é medida de 0 a 100 de forma
      independente: elas não dividem bolo nenhum e não somam 100 entre si. Uma pessoa pode ser
      alta em várias ao mesmo tempo.</p>

      <div class="box"><b>O que este relatório não é.</b> Ele descreve como o time se distribui
      em estilo de comportamento. Não mede competência técnica, desempenho, nem adequação a cargo,
      e não deve ser usado sozinho para decisão sobre pessoas.</div>`, rod, '01'));

    // ── COMPOSIÇÃO DO TIME ──
    paginas.push(pg('Composição do time', 'Como este time se distribui',
      'Perfil predominante de cada pessoa e média do grupo',
      `<div class="hero2">
        <div class="graf-card">${G.donut(
          ['D','I','S','C'].filter(k => A.predominante[k] > 0)
            .map(k => ({ valor: A.predominante[k], cor: F[k].cor, rotulo: A.predominante[k] + '' })),
          { centroTitulo: 'PESSOAS', centroValor: String(A.n) })}</div>
        <div>
          ${['D','I','S','C'].map(k => `<div class="barra">
            <div class="barra-top"><b style="color:${F[k].cor}">${esc(F[k].estilo)}</b>
              <span class="barra-v" style="color:${F[k].cor}">média ${A.dim[k]}%</span></div>
            <div class="barra-tr"><div class="barra-f" style="width:${A.dim[k] * 2.5}%;background:${F[k].cor}"></div></div>
            <div class="barra-f2">varia de ${A.dimMin[k]}% a ${A.dimMax[k]}% &middot; ${A.predominante[k] === 0
              ? 'ninguém tem esta dimensão como predominante'
              : A.predominante[k] + (A.predominante[k] === 1 ? ' pessoa tem' : ' pessoas têm') + ' esta dimensão como predominante'}</div>
          </div>`).join('')}
        </div>
      </div>
      <p class="obs" style="margin-top:8px"><b>São dois números diferentes.</b> A porcentagem é a
      <b>média do time</b> naquela dimensão: todo mundo tem as quatro, em graus diferentes. A linha
      abaixo diz <b>quantas pessoas acionam aquela dimensão primeiro</b>. Uma dimensão pode ter média
      alta e nenhuma pessoa que a acione primeiro, e isso significa capacidade distribuída sem dono.</p>

      <div class="secao"><span>Leitura da distribuição</span></div>
      <div class="box"><b>Dimensão mais presente: ${esc(F[A.maisAlta].estilo)}.</b>
      ${A.predominante[A.maisAlta] === 1
        ? 'Uma única pessoa carrega essa dimensão como predominante. O time tem o repertório, mas ele depende de uma pessoa só: se ela sai da mesa, a leitura some junto.'
        : A.predominante[A.maisAlta] >= A.n * 0.6
        ? 'A maior parte do time responde pelo mesmo padrão. Isso acelera a decisão e reduz o contraditório: o que um deixa passar, todos deixam passar.'
        : 'A distribuição é razoavelmente espalhada. O time tem mais de uma forma de olhar o mesmo problema, o que custa tempo de conversa e devolve qualidade de decisão.'}
      ${A.ausentes.length
        ? ' Nenhuma pessoa tem ' + A.ausentes.map(k => F[k].estilo).join(' nem ') + ' como dimensão predominante.'
        : ' As quatro dimensões aparecem como predominante em pelo menos uma pessoa.'}</div>
`, rod, '01'));

    // ── QUEM É QUEM ──
    const NPAG = Math.max(1, Math.ceil(pessoas.length / 6));
    const POR_PAG = Math.ceil(pessoas.length / NPAG);
    for (let i = 0; i < pessoas.length; i += POR_PAG) {
      const bloco = pessoas.slice(i, i + POR_PAG);
      const parte = NPAG > 1 ? ' (' + (Math.floor(i / POR_PAG) + 1) + ' de ' + NPAG + ')' : '';
      paginas.push(pg('Composição do time', 'Quem é quem' + parte,
        'Perfil e composição individual nas quatro dimensões',
        `<div class="lista-pessoas">
        ${bloco.map(p => {
          const r = p.resultado;
          return `<div class="pessoa">
            <div class="pessoa-sig" style="background:${F[r.perfil.primario].cor}">${esc(r.perfil.sigla)}</div>
            <div class="pessoa-b">
              <div class="pessoa-h"><b>${esc(p.nome)}</b><span class="pessoa-c">${esc(p.cargo) || 'sem cargo informado'}${
                r.importado ? ' · dado importado de ' + esc((r.origemExterna && r.origemExterna.plataforma) || 'laudo externo') : ''}</span></div>
              <div class="pessoa-barra">${['D','I','S','C'].map(k =>
                `<span style="width:${r.natural[k]}%;background:${F[k].cor}"></span>`).join('')}</div>
              <div class="pessoa-leg">${['D','I','S','C'].map(k =>
                `<i><u style="background:${F[k].cor}"></u>${esc(F[k].estilo)} ${Math.round(r.natural[k])}%</i>`).join('')}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`,
        rod, '01'));
    }

    // ── CONCENTRAÇÃO E LACUNA ──
    const alertas = [];
    A.concentradas.forEach(k => alertas.push({
      tipo:'concentracao',
      t:'Concentração em ' + F[k].estilo,
      d:'A maioria do time tem ' + F[k].estilo + ' como dimensão predominante. Times homogêneos ' +
        'decidem rápido e enxergam pouco: o ponto cego de um vira o ponto cego de todos. ' +
        (k === 'D' ? 'Aqui, o risco é disputa por comando e decisão sem contraditório.'
        : k === 'I' ? 'Aqui, o risco é muita ideia iniciada e pouca concluída.'
        : k === 'S' ? 'Aqui, o risco é conflito adiado e desempenho baixo tolerado por tempo demais.'
        : 'Aqui, o risco é lentidão para decidir e excesso de checagem.')
    }));
    A.ausentes.forEach(k => alertas.push({
      tipo:'lacuna',
      t:'Lacuna em ' + F[k].estilo,
      d:'Ninguém no time tem ' + F[k].estilo + ' como dimensão predominante, e a média do grupo (' +
        A.dim[k] + '%) fica abaixo do esperado de 25%. ' +
        (k === 'D' ? 'Falta quem assuma a frente e decida quando ninguém quer decidir.'
        : k === 'I' ? 'Falta quem comunique para fora e mobilize as pessoas.'
        : k === 'S' ? 'Falta quem sustente o ritmo e cuide da relação quando aperta.'
        : 'Falta quem cheque o detalhe e evite o erro caro.')
    }));
    // Dimensão que existe no time, mas que ninguém aciona primeiro
    A.semDono.forEach(k => alertas.push({
      tipo:'lacuna',
      t:'Sem quem puxe ' + F[k].estilo,
      d:'A média do time em ' + F[k].estilo + ' é ' + A.dim[k] + '%, dentro do esperado de 25%: ' +
        'a capacidade existe e está distribuída. O que não existe é alguém que a acione primeiro, ' +
        'porque ninguém tem essa dimensão como predominante. ' +
        (k === 'D' ? 'Na hora de decidir sob pressão, a decisão tende a esperar por alguém.'
        : k === 'I' ? 'A articulação para fora acontece por esforço, não por iniciativa natural.'
        : k === 'S' ? 'O cuidado com a relação depende de quem estiver disponível no dia.'
        : 'A checagem do detalhe acontece, mas não tem dono.')
    }));
    if (!alertas.length) alertas.push({ tipo:'ok', t:'Distribuição equilibrada',
      d:'Nenhuma dimensão concentra a maioria do time e nenhuma está ausente. É a configuração ' +
        'com maior chance de cobrir cenários diferentes, e a que mais exige método de decisão ' +
        'combinado, porque as pessoas divergem por estilo e não por conteúdo.' });

    paginas.push(pg('Composição do time', 'Concentrações e lacunas',
      'O que a distribuição deste time facilita e o que ela deixa descoberto',
      `<p class="obs">Concentração é excesso de gente com a mesma leitura. Lacuna é ausência de
      leitura. As duas custam caro, e por motivos opostos.</p>
      ${alertas.map(a => `<div class="duocol-c ${a.tipo === 'lacuna' ? 'duocol-no' : a.tipo === 'ok' ? 'duocol-ok' : ''}"
          style="margin-bottom:12px${a.tipo === 'concentracao' ? ';border-left-color:var(--gold);background:rgba(201,168,76,.07)' : ''}">
        <div class="duocol-t">${esc(a.t)}</div>
        <div style="font-size:11pt;line-height:1.55;color:var(--ink2)">${esc(a.d)}</div>
      </div>`).join('')}
      <div class="secao"><span>Quem responde por cada dimensão</span></div>
      <div class="dimgrid" style="grid-template-columns:repeat(4,1fr)">
        ${['D','I','S','C'].map(k => {
          const donos = pessoas.filter(p => p.resultado.perfil.primario === k);
          return `<div class="dimcell">
            <div class="dimcell-v" style="color:${F[k].cor}">${donos.length}</div>
            <div class="dimcell-n"><b>${esc(F[k].estilo)}</b><br>
              <span style="opacity:.75">${donos.length
                ? donos.map(p => esc(p.nome.split(' ')[0])).join(', ')
                : 'ninguém no time'}</span></div>
          </div>`;
        }).join('')}
      </div>
      <p class="obs" style="margin:10px 0 14px">Predominante não quer dizer exclusivo: a pessoa usa
      as quatro dimensões, esta é apenas a que ela aciona primeiro sob pressão.</p>

      <div class="box"><b>Como usar esta página.</b> Concentração não é defeito: é a assinatura do
      time e costuma explicar por que ele é bom no que é bom. O problema aparece quando a
      concentração encontra um cenário que pede justamente a dimensão ausente. Nesses momentos,
      a saída é procedimento, não personalidade: combinar de antemão quem faz o papel que falta.</div>`, rod, '01'));

    // ── FORÇAS E LACUNAS DE CAPACIDADE ──
    paginas.push(pg('Capacidades do time', 'Mapa do time',
      'Média do grupo nas 24 capacidades',
      `<div class="graf-card">${G.radar(
        D.CAPACIDADES.map(c => {
          const cap = A.caps.find(x => x.id === c.id);
          return { rotulo: c.nome, a: cap.media, b: cap.max, cor: F[c.fator].cor };
        }), { legendaA: 'Média do time', legendaB: 'Maior nota do time' })}</div>
      <p class="obs" style="text-align:center;margin-top:10px">A linha cheia é a média do grupo.
      A tracejada é a maior nota de cada capacidade: onde as duas se afastam muito, a capacidade
      existe no time mas está concentrada em poucas pessoas.</p>`, rod, '02'));

    paginas.push(pg('Capacidades do time', 'Onde este time é forte',
      'As seis capacidades com maior média no grupo',
      `${A.forcasTime.map((c, i) => `<div class="capx">
        <div class="capx-n">${String(i + 1).padStart(2, '0')}</div>
        <div class="capx-b">
          <div class="capx-h"><b>${esc(c.nome)}</b>
            <span class="tag" style="color:${F[c.fator].cor};border-color:${F[c.fator].cor}44">${esc(F[c.fator].estilo)}</span>
            <span class="capx-fx">amplitude ${c.amplitude}</span>
            <span class="capx-v" style="color:${F[c.fator].cor}">${c.media}</span></div>
          <div class="capx-tr"><div class="capx-f" style="width:${c.media}%;background:${F[c.fator].cor}"></div></div>
          <p class="capx-d">Mais forte: <b>${esc(c.topo.nome)}</b> (${c.max}) · menor do time: ${c.min}</p>
        </div></div>`).join('')}
      <div class="box"><b>Amplitude</b> é a distância entre a maior e a menor nota do time. Amplitude
      alta numa força significa que ela está concentrada em poucas pessoas.</div>`, rod, '02'));

    paginas.push(pg('Capacidades do time', 'Onde este time é frágil',
      'As seis capacidades com menor média no grupo',
      `${A.lacunasTime.map((c, i) => `<div class="capx">
        <div class="capx-n">${String(i + 1).padStart(2, '0')}</div>
        <div class="capx-b">
          <div class="capx-h"><b>${esc(c.nome)}</b>
            <span class="tag" style="color:${F[c.fator].cor};border-color:${F[c.fator].cor}44">${esc(F[c.fator].estilo)}</span>
            <span class="capx-fx">maior do time ${c.max}</span>
            <span class="capx-v" style="color:${F[c.fator].cor}">${c.media}</span></div>
          <div class="capx-tr"><div class="capx-f" style="width:${c.media}%;background:${F[c.fator].cor}"></div></div>
          <p class="capx-d">${c.max >= 60
            ? 'Existe quem cubra: <b>' + esc(c.topo.nome) + '</b> (' + c.max + '). Vale dar a essa pessoa o papel formal nesse ponto.'
            : 'Ninguém no time se destaca aqui. É lacuna real: resolve com processo, contratação ou apoio externo.'}</p>
        </div></div>`).join('')}`, rod, '02'));

    // ── COMO ESTÁ × COMO DEVERIA ESTAR ──
    if (A.baseDes) {
      const baseTxt = A.baseDes === A.n ? 'as ' + A.n + ' pessoas'
        : A.baseDes + ' das ' + A.n + ' pessoas (as avaliações importadas não trazem o mapa desejado)';
      paginas.push(pg('Capacidades do time', 'Como o time está e como acha que deveria estar',
        'Média do grupo nas 24 capacidades, na autoavaliação e no ajuste que cada um apontou',
        `<div class="graf-card">${G.radar(
          D.CAPACIDADES.map(c => {
            const x = A.desejo.find(y => y.id === c.id);
            return { rotulo: c.nome, a: x.atual, b: x.desejado, cor: F[c.fator].cor };
          }), { legendaA: 'Como o time está', legendaB: 'Como o time acha que deveria estar' })}</div>
        <p class="obs" style="text-align:center;margin-top:10px">Base: ${esc(baseTxt)}. Cada pessoa
        apontou, capacidade por capacidade, se precisaria de mais, de menos ou se já está adequado.
        A linha tracejada é a média desse ajuste.</p>`, rod, '02'));

      const lista = A.ajustes.slice(0, 5);
      paginas.push(pg('Capacidades do time', 'Onde o time sente que precisa mudar',
        'As capacidades com maior distância entre como o grupo está e como acha que deveria estar',
        lista.length ? `${lista.map((c, i) => `<div class="capx">
          <div class="capx-n">${String(i + 1).padStart(2, '0')}</div>
          <div class="capx-b">
            <div class="capx-h"><b>${esc(c.nome)}</b>
              <span class="tag" style="color:${F[c.fator].cor};border-color:${F[c.fator].cor}44">${esc(F[c.fator].estilo)}</span>
              <span class="capx-fx">está ${c.atual} · deveria ${c.desejado}</span>
              <span class="capx-v" style="color:${c.gap > 0 ? 'var(--green)' : 'var(--terra)'}">${c.gap > 0 ? '+' : ''}${c.gap}</span></div>
            <div class="capx-tr"><div class="capx-f" style="width:${c.atual}%;background:${F[c.fator].cor}"></div>
              <span class="capx-alvo" style="left:${c.desejado}%"></span></div>
            <p class="capx-d">${c.gap > 0
              ? 'O grupo sente que precisa de <b>mais</b> desta capacidade para entregar o que se espera dele.'
              : 'O grupo sente que está usando esta capacidade <b>além da conta</b> e precisaria moderar.'}</p>
          </div></div>`).join('')}
        <p class="capx-leg">O traço vertical na barra marca onde o grupo acha que deveria estar.</p>`
        : `<div class="box"><b>O time está alinhado com o que acha que deveria ser.</b> Nenhuma
          capacidade tem diferença média de 3 pontos ou mais entre como o grupo está e como acha que
          deveria estar. Ou o grupo está em funções coerentes com o próprio perfil, ou não se
          enxerga com muito a ajustar. A segunda hipótese se confere com o IPM do capítulo 05.</div>`,
        rod, '02'));
    }

    // ── COMPLEMENTARIDADE ──
    const maisComp = A.pares.slice(0, Math.min(4, A.pares.length));
    const usados = new Set(maisComp.map(x => x.a.nome + "|" + x.b.nome));
    const maisPar = A.pares.filter(x => !usados.has(x.a.nome + "|" + x.b.nome))
                           .slice(-4).reverse();
    paginas.push(pg('Dinâmica do time', 'Quem complementa quem',
      'Pares de estilo distante: mais rendimento junto, mais atrito também',
      `<div class="secao"><span>Maior complementaridade</span></div>
      <p class="obs">Estilos distantes cobrem cenários diferentes. Rendem muito juntos e é onde o
      atrito costuma aparecer, porque a divergência é de forma, não de conteúdo.</p>
      ${maisComp.map(p => `<div class="capx"><div class="capx-b">
        <div class="capx-h"><b>${esc(p.a.nome)} + ${esc(p.b.nome)}</b>
          <span class="capx-v" style="color:var(--gold)">${Math.round(p.dist)}</span></div>
        <p class="capx-d">${esc(p.a.resultado.perfil.sigla)} com ${esc(p.b.resultado.perfil.sigla)}.
        ${p.dist > 60 ? 'Distância alta: combine explicitamente como as decisões conjuntas serão tomadas, porque o desacordo entre os dois costuma ser de ritmo e de forma, não de objetivo.'
                      : 'Distância moderada: complementaridade natural, com atrito administrável no dia a dia.'}
        Use esta dupla quando o assunto exigir mais de um ângulo antes de fechar.</p>
      </div></div>`).join('')}`, rod, '03'));

    if (maisPar.length) paginas.push(pg('Dinâmica do time', 'Onde a convivência é fácil demais',
      'Pares de perfil parecido: baixo atrito, contraditório fraco',
      `<div class="secao"><span>Maior semelhança</span></div>
      <p class="obs">Estilos próximos se entendem rápido e compartilham o mesmo ponto cego.</p>
      ${maisPar.map(p => `<div class="capx"><div class="capx-b">
        <div class="capx-h"><b>${esc(p.a.nome)} + ${esc(p.b.nome)}</b>
          <span class="capx-v" style="color:var(--ink3)">${Math.round(p.dist)}</span></div>
        <p class="capx-d">${esc(p.a.resultado.perfil.sigla)} com ${esc(p.b.resultado.perfil.sigla)}. Convivência fácil e leitura parecida do mesmo
        problema: a conversa flui, e é justamente por isso que o ponto cego passa sem ser
        questionado. Evite fechar decisão importante só entre os dois.</p>
      </div></div>`).join('')}`, rod, '03'));

    // ── AFINIDADE COM O TIME ──
    if (A.afinidade.length) paginas.push(pg('Dinâmica do time', 'Quem destoa do time',
      'O quanto o perfil de cada pessoa se parece com o perfil médio dos demais',
      `<table class="tb">
        <thead><tr><th>Pessoa</th><th>Perfil</th><th style="text-align:right">Afinidade com o time</th></tr></thead>
        <tbody>${A.afinidade.slice(0, 12).map(a => `<tr>
          <td><b>${esc(a.p.nome)}</b></td>
          <td>${esc(a.p.resultado.perfil.sigla)}</td>
          <td style="text-align:right;font-weight:700;color:${a.valor < 60 ? 'var(--terra)' : 'var(--ink2)'}">${a.valor}%</td>
        </tr>`).join('')}</tbody>
      </table>
      ${A.afinidade.length > 12 ? `<p class="obs">Aparecem as 12 pessoas com menor afinidade, de ${A.n}.</p>` : ''}
      <div class="box"><b>${A.destoam.length
        ? (A.destoam.length === 1 ? 'Uma pessoa destoa' : A.destoam.length + ' pessoas destoam') + ' do perfil do grupo.'
        : 'Ninguém destoa de forma acentuada.'}</b>
      ${A.destoam.length
        ? ' Abaixo de 60% de afinidade, a leitura do time descrita neste relatório não vale para ela. Isso não é problema: muitas vezes é justamente quem cobre a lacuna do grupo. Mas pede análise individual, e cuidado para que a diferença não seja tratada como falta de adequação.'
        : ' Todos ficam a 60% ou mais do perfil médio dos demais: a leitura de time deste relatório se aplica ao grupo inteiro.'}</div>
      <p class="obs" style="margin-top:8px">Afinidade 100% seria um perfil idêntico à média dos demais.
      A conta usa a mesma régua do IIA: quanto do perfil, de um total de 100, precisaria mudar de lugar
      para ficar igual à média do resto do time.</p>`, rod, '03'));

    // ── LIDERANÇA E DECISÃO ──
    const LS = L.LIDERANCA;
    const Ld = A.lideranca;
    if (Ld.base) {
      const difs = ['D','I','S','C'].map(k => ({ k, d: Ld.desejado[k] - Ld.atual[k] }));
      const sobe = difs.slice().sort((a, b) => b.d - a.d)[0];
      const desce = difs.slice().sort((a, b) => a.d - b.d)[0];
      const atualTopo = ['D','I','S','C'].sort((a, b) => Ld.atual[b] - Ld.atual[a])[0];
      paginas.push(pg('Liderança e decisão', 'Estilo de liderança do time',
        'Como o grupo tende a conduzir hoje e para onde sente que precisa ir',
        `<div class="graf-card">${G.barras(['D','I','S','C'].map(k => ({
            rotulo: LS[k].estilo.replace('Liderança ', ''), a: Ld.atual[k], b: Ld.desejado[k], cor: F[k].cor })),
          { max: 60, legendaA: 'Hoje', legendaB: 'O que o contexto pede' })}</div>
        <table class="tb">
          <thead><tr><th>Estilo</th><th style="text-align:right">Hoje</th><th style="text-align:right">O que o contexto pede</th><th style="text-align:right">Diferença</th></tr></thead>
          <tbody>${['D','I','S','C'].map(k => {
            const d = Ld.desejado[k] - Ld.atual[k];
            return `<tr><td><b style="color:${F[k].cor}">${esc(LS[k].estilo)}</b></td>
              <td style="text-align:right">${Ld.atual[k]}%</td><td style="text-align:right">${Ld.desejado[k]}%</td>
              <td style="text-align:right;font-weight:700">${d > 0 ? '+' : ''}${d}</td></tr>`; }).join('')}</tbody>
        </table>
        <div class="box"><b>Hoje o time conduz mais pela ${esc(LS[atualTopo].estilo.toLowerCase())}.</b>
        ${sobe.d >= 3
          ? ' O grupo sente que precisaria de mais ' + esc(LS[sobe.k].estilo.toLowerCase()) +
            (desce.d <= -3 ? ' e de menos ' + esc(LS[desce.k].estilo.toLowerCase()) : '') +
            '. Quando muita gente aponta a mesma direção, o pedido costuma ser do contexto, não de cada pessoa: vale perguntar à liderança se é isso mesmo que ela espera do time.'
          : ' O que o contexto pede está próximo de como o time já conduz: não há pressão coletiva por outro estilo.'}</div>`,
        rod, '04'));
    }

    const amb = [], desg = [];
    A.topoDim.forEach(k => {
      L.CARREIRA[k].ambientes.forEach(x => { if (amb.length < 6 && amb.indexOf(x) < 0) amb.push(x); });
      L.CARREIRA[k].desgasta.forEach(x => { if (desg.length < 6 && desg.indexOf(x) < 0) desg.push(x); });
    });
    const dc = A.decisao;
    const quad = [
      { t:'Rápida e racional',     k:['D'] , d:'Decide cedo, pelo dado e pelo resultado.' },
      { t:'Rápida e relacional',   k:['I'] , d:'Decide cedo, pela leitura das pessoas.' },
      { t:'Ponderada e relacional',k:['S'] , d:'Espera consenso e pesa o impacto nas pessoas.' },
      { t:'Ponderada e racional',  k:['C'] , d:'Espera a informação completa e o critério.' }
    ].map(q => Object.assign(q, { quem: pessoas.filter(p => q.k.indexOf(p.resultado.perfil.primario) >= 0)
                                               .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }));
    paginas.push(pg('Liderança e decisão', 'Como o time decide',
      'Tendência de decisão do grupo e de cada pessoa',
      `<div class="duocol">
        <div class="duocol-c"><div class="duocol-t">Racional ou relacional</div>
          <div class="barra-tr"><div class="barra-f" style="width:${dc.racional}%;background:var(--umber)"></div></div>
          <p class="capx-d" style="margin-top:8px">Racional ${dc.racional}% · relacional ${dc.emocional}%.
          A decisão do grupo tende a ser <b>${esc(dc.eixo1)}</b>.</p></div>
        <div class="duocol-c"><div class="duocol-t">Rápida ou ponderada</div>
          <div class="barra-tr"><div class="barra-f" style="width:${dc.rapida}%;background:var(--gold)"></div></div>
          <p class="capx-d" style="margin-top:8px">Rápida ${dc.rapida}% · ponderada ${dc.ponderada}%.
          O ritmo tende a ser <b>${esc(dc.eixo2)}</b>.</p></div>
      </div>
      <p class="obs" style="margin:10px 0 4px">Racional soma as médias Dominante e Analítico; relacional
      soma Influente e Estável. Rápida soma Dominante e Influente; ponderada soma Estável e Analítico.</p>

      <div class="secao"><span>Como cada pessoa tende a decidir</span></div>
      <table class="tb">
        <thead><tr><th>Tendência</th><th>Quem</th></tr></thead>
        <tbody>${quad.map(q => `<tr>
          <td style="width:42%"><b>${esc(q.t)}</b><br><span style="font-size:12.5px;color:var(--ink3)">${esc(q.d)}</span></td>
          <td>${q.quem.length ? q.quem.map(p => esc(p.nome.split(' ')[0])).join(', ') : '<span style="color:var(--ink3)">ninguém no time</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div class="box"><b>Por que isso importa.</b> Boa parte do atrito em reunião não é sobre o que
      decidir, é sobre quando a decisão está madura. Quem decide rápido lê a espera como travamento;
      quem pondera lê a pressa como descuido. Combinar antes quanto de informação cada tipo de decisão
      exige resolve a maior parte desse desgaste.</div>`, rod, '04'));

    paginas.push(pg('Liderança e decisão', 'Onde o time rende mais',
      'O ambiente que favorece o desempenho do grupo e o que o desgasta',
      `<div class="secao"><span>Ambiente favorável</span></div>
      <p class="obs" style="margin-bottom:10px">Pelas duas dimensões mais fortes do grupo,
      ${esc(F[A.topoDim[0]].estilo)} e ${esc(F[A.topoDim[1]].estilo)}.</p>
      <div class="duocol">
        <div class="duocol-c duocol-ok"><div class="duocol-t">Onde o grupo rende</div>
          ${amb.map(x => `<div class="duocol-i"><span>+</span><span>${esc(x)}</span></div>`).join('')}</div>
        <div class="duocol-c duocol-no"><div class="duocol-t">O que desgasta o grupo</div>
          ${desg.map(x => `<div class="duocol-i"><span>−</span><span>${esc(x)}</span></div>`).join('')}</div>
      </div>
      <div class="box" style="margin-top:12px"><b>Use junto com a página de quem destoa.</b> O ambiente
      favorável descreve a maioria. Para quem tem afinidade baixa com o time, o que desgasta o grupo
      pode ser exatamente o que faz essa pessoa render.</div>`, rod, '04'));

    if (A.pressao.length) {
      const altos = A.pressao.filter(x => x.iia >= 60);
      const lista = A.pressao.slice(0, 10);
      paginas.push(pg('Liderança e decisão', 'Quem o ambiente mais pressiona',
        'Distância entre o perfil natural de cada pessoa e o que ela sente que o contexto pede',
        `<table class="tb">
          <thead><tr><th>Pessoa</th><th>Natural</th><th>O que o contexto pede</th><th style="text-align:right">IIA</th></tr></thead>
          <tbody>${lista.map(x => `<tr>
            <td><b>${esc(x.p.nome)}</b></td><td>${esc(x.nat)}</td><td>${esc(x.ad)}</td>
            <td style="text-align:right;font-weight:700;color:${x.iia >= 60 ? 'var(--terra)' : 'var(--ink2)'}">${x.iia} · ${esc(D.faixaIndice(x.iia).toLowerCase())}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${A.pressao.length > 10 ? `<p class="obs">Aparecem as 10 pessoas com IIA mais alto, de ${A.pressao.length}.</p>` : ''}
        <div class="box"><b>${altos.length
          ? (altos.length === 1 ? 'Uma pessoa está' : altos.length + ' pessoas estão') + ' com IIA alto ou muito alto.'
          : 'Ninguém está com IIA alto.'}</b>
        ${altos.length
          ? ' É sinal de que a função pede um comportamento bem diferente do natural dessa pessoa, e adaptação longa em muitas frentes é uma das causas conhecidas de desgaste. Também pode ser autocrítica elevada, comum em perfis Dominante e Analítico. A conversa individual é que separa uma coisa da outra.'
          : ' Nenhum avaliado sente que o contexto pede um perfil muito distante do seu: a maior parte do grupo está em funções coerentes com o próprio estilo.'}</div>`,
        rod, '04'));
    }

    // ── ÍNDICES DO TIME ──
    paginas.push(pg('Leitura da resposta', 'Índices médios do time',
      'O que a forma de responder diz sobre o grupo',
      `<div class="painel">
        ${['ITA','IPM','IDA','IPS','IIA'].map(k => `<div class="painel-c">
          <div class="painel-s">${k}</div>
          <div class="painel-v">${A.indices[k] == null ? '—' : A.indices[k]}</div>
          <div class="painel-tr"><div class="painel-f" style="width:${A.indices[k] == null ? 0 : A.indices[k]}%"></div></div>
          <div class="painel-f2">${A.indices[k] == null ? 'sem base' : esc(D.faixaIndice(A.indices[k]))}</div>
        </div>`).join('')}
      </div>
      ${A.importados.length ? `<p style="font-size:12.5px;line-height:1.5;margin:6px 0 0"><b>Base dos índices.</b>
        ${A.importados.length === 1 ? 'Uma avaliação veio' : A.importados.length + ' avaliações vieram'}
        de relatório de outra plataforma: nelas só o IIA é comparável. Os demais são a média de quem
        respondeu a avaliação completa aqui.</p>` : ''}
      <div class="secao"><span>Como ler estes números no grupo</span></div>
      <ul class="lista">
        <li><b>IPS alto no time inteiro</b> costuma indicar cultura em que admitir limitação é
            arriscado. Vale olhar como o erro é tratado ali.</li>
        <li><b>IIA alto no time inteiro</b> indica que o ambiente pede de todos um comportamento
            diferente do natural. É desgaste coletivo, não característica individual.</li>
      </ul>
      <table class="tb" style="margin-top:6px">
        <thead><tr><th>Índice</th><th>O que mede no grupo</th><th>Faixa do time</th></tr></thead>
        <tbody>
          <tr><td><b>ITA</b></td><td>Consistência entre o que o time escolhe e o quanto se atribui</td>
              <td>${fx(A.indices.ITA)}</td></tr>
          <tr><td><b>IPM</b></td><td>Quanto o grupo reconhece ter o que desenvolver</td>
              <td>${fx(A.indices.IPM)}</td></tr>
          <tr><td><b>IDA</b></td><td>Distância entre a escolha forçada e a autoavaliação livre</td>
              <td>${fx(A.indices.IDA)}</td></tr>
          <tr><td><b>IPS</b></td><td>Tendência do grupo a marcar só o lado favorável</td>
              <td>${fx(A.indices.IPS)}</td></tr>
          <tr><td><b>IIA</b></td><td>Quanto o ambiente pede comportamento diferente do natural</td>
              <td>${fx(A.indices.IIA)}</td></tr>
        </tbody>
      </table>

      <div class="box"><b>Atenção ao usar.</b> Estes índices descrevem como o grupo respondeu, não a
      qualidade das pessoas. Não devem ser usados para comparar indivíduos entre si nem para
      ranquear desempenho.</div>`, rod, '05'));

    // ── O QUE O TIME QUER REDUZIR ──
    if (A.baseF4) {
      const totF4 = A.porFatorF4.D + A.porFatorF4.I + A.porFatorF4.S + A.porFatorF4.C;
      const top = A.reduzir.slice(0, 10);
      paginas.push(pg('Leitura da resposta', 'O que o time quer reduzir',
        'As características que mais pessoas marcaram como excesso a moderar',
        top.length ? `<div class="dimgrid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
          ${['D','I','S','C'].map(k => `<div class="dimcell">
            <div class="dimcell-v" style="color:${F[k].cor}">${totF4 ? Math.round(A.porFatorF4[k] / totF4 * 100) : 0}%</div>
            <div class="dimcell-n"><b>${esc(F[k].estilo)}</b><br><span style="opacity:.75">${A.porFatorF4[k]} marcações</span></div>
          </div>`).join('')}
        </div>
        <table class="tb">
          <thead><tr><th>Gostaria de ser</th><th>Ligado a</th><th style="text-align:right">Pessoas</th></tr></thead>
          <tbody>${top.map(x => `<tr><td><b>${esc(x.txt)}</b></td>
            <td style="color:${F[x.fator].cor}">${esc(F[x.fator].estilo)}</td>
            <td style="text-align:right;font-weight:700">${x.qtd} de ${A.baseF4}</td></tr>`).join('')}</tbody>
        </table>
        <div class="box"><b>Como ler.</b> Cada pessoa marcou, numa lista de excessos comuns a cada estilo,
        o que gostaria de moderar em si. Característica marcada por muita gente é tema para trabalhar em
        grupo, não em conversa individual. A distribuição por estilo mostra de qual lado vêm os excessos
        que o próprio time reconhece.</div>`
        : `<div class="box"><b>Ninguém marcou característica a reduzir.</b> A fase 4 é opcional. Time inteiro
          sem marcação costuma indicar pressa no fim da avaliação ou baixa disposição a se expor, e vale
          comparar com o IPM e o IPS da página anterior.</div>`, rod, '05'));
    }

    // ── ENCERRAMENTO ──
    paginas.push(pg('Encerramento', 'O que fazer com este relatório', 'Três movimentos',
      `<div class="fim">
        <div class="fim-i"><span>01</span><div><b>Devolva ao time, não só à liderança.</b>
          Um mapa comportamental usado só por quem decide vira ferramenta de julgamento. Apresentado
          ao grupo, vira linguagem comum para tratar atrito sem personalizar.</div></div>
        <div class="fim-i"><span>02</span><div><b>Escolha uma lacuna, não seis.</b>
          A página de fragilidades mostra onde o time tem menos repertório. Comece pela que mais
          custa hoje, e defina se resolve com processo, com papel formal ou com contratação.</div></div>
        <div class="fim-i"><span>03</span><div><b>Combine o método de decisão.</b>
          A maior parte do atrito em time com estilos distantes não é sobre o que decidir, é sobre
          como decidir. Definir isso de antemão elimina grande parte do desgaste.</div></div>
        <div class="fim-i"><span>04</span><div><b>Refaça depois de mudar o time.</b>
          Entrada, saída ou troca de liderança muda a distribuição inteira. O mapa vale para a
          composição atual: revisitar a cada ciclo mantém a leitura ligada ao time que existe hoje,
          e não ao que existia quando o instrumento foi respondido.</div></div>
      </div>
      <div class="etica">
        <b>Nota técnica.</b> Este relatório agrega resultados de instrumentos de autopercepção
        comportamental respondidos individualmente. Descreve preferências declaradas, não desempenho
        observado, e não constitui avaliação psicológica. Não deve ser usado como critério de
        decisão sobre contratação, promoção ou desligamento, nem para comparar ou ranquear pessoas.
        <br><br>
        As informações são confidenciais e identificam pessoas: o compartilhamento deve seguir a
        política de privacidade da empresa e a Lei Geral de Proteção de Dados.
      </div>`, rod, '06'));

    return montar(paginas.join('\n'), empresa);
  }

  // Reaproveita o CSS do relatório individual, trocando só o miolo
  function montar(corpo, empresa) {
    const base = L.gerar(
      D.calcular({ f1:{}, f2:{}, f3:{}, f4:[] }),
      { nome:'x', modulo:'executivo' }
    );
    const css = base.slice(base.indexOf('<style>'), base.indexOf('</style>') + 8);
    const fecha = '<' + '/script>';
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Equipe · ${esc(empresa)} · AXIS</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet">
${css}
</head><body>
<div class="barra-topo no-print">
  <b>AXIS</b> <span>Relatório de Equipe · ${esc(empresa)}</span>
  <button class="btn-imp" onclick="window.print()">Salvar em PDF / Imprimir</button>
</div>
${corpo}
</body></html>`;
  }

  function baixar(pessoas, meta) {
    const html = gerar(pessoas, meta);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const d = new Date();
    const nome = 'AXIS-DISC-Equipe-' + (semAcento(meta && meta.empresa) || 'Empresa') + '-' +
      String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear() + '.html';
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    return nome;
  }

  function abrir(pessoas, meta) {
    const html = gerar(pessoas, meta);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  global.DISC_EQUIPE = { analisar, gerar, abrir, baixar };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DISC_EQUIPE;

})(typeof window !== 'undefined' ? window : globalThis);
