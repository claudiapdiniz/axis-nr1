/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC — RELATÓRIO DE EQUIPE
   O laudo individual responde "como esta pessoa age". Este responde
   "como este time funciona junto": onde há concentração, onde há lacuna,
   quem cobre quem, e onde o atrito é estrutural e não pessoal.

   Reaproveita o CSS e a paginação do laudo individual (disc-laudo.js).
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const D = global.DISC_EXEC || (typeof require === 'function' ? require('./disc-executivo.js') : null);
  const L = global.DISC_LAUDO || (typeof require === 'function' ? require('./disc-laudo.js') : null);
  if (!D || !L) { console.error('[disc-equipe] dependências não carregadas'); return; }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const med = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;

  // ── ANÁLISE DO TIME ───────────────────────────────────────────────────
  function analisar(pessoas) {
    const F = D.FATORES;
    const n = pessoas.length;

    // distribuição de perfis predominantes
    const predominante = { D:0, I:0, S:0, C:0 };
    pessoas.forEach(p => { predominante[p.resultado.perfil.primario]++; });

    // média do time por dimensão
    const dim = {};
    ['D','I','S','C'].forEach(k => { dim[k] = med(pessoas.map(p => p.resultado.natural[k])); });

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
    const ausentes = ['D','I','S','C'].filter(k => predominante[k] === 0 && dim[k] < 22);
    const concentradas = ['D','I','S','C'].filter(k => predominante[k] / n >= 0.6);

    // pares mais complementares e mais parecidos
    const pares = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pessoas[i].resultado.natural, b = pessoas[j].resultado.natural;
      const dist = ['D','I','S','C'].reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);
      pares.push({ a: pessoas[i], b: pessoas[j], dist });
    }
    pares.sort((x, y) => y.dist - x.dist);

    // índices médios do time
    const indices = {};
    ['ITA','IPM','IDA','IPS','IIA'].forEach(k => {
      indices[k] = med(pessoas.map(p => p.resultado.indices[k]));
    });

    return { n, predominante, dim, caps, forcasTime, lacunasTime, ausentes,
             concentradas, pares, indices };
  }

  // ── PÁGINAS ───────────────────────────────────────────────────────────
  let _n = 1;
  function pg(cap, titulo, sub, corpo, rodape) {
    _n++;
    return `<section class="pagina">
      <header class="ph"><span class="ph-cap">${esc(cap)}</span><span class="ph-marca">AXIS</span></header>
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
      <div class="capa-top"><div class="capa-marca">AXIS</div><div class="capa-sub">Avaliação Comportamental</div></div>
      <div class="capa-meio">
        <div class="capa-et">Relatório de equipe</div>
        <h1 class="capa-t">${esc(empresa)}</h1>
        <div class="capa-sigla">${A.n}</div>
        <div class="capa-perfil">${A.n === 1 ? 'avaliado' : 'pessoas avaliadas'}</div>
      </div>
      <div class="capa-base">
        <table class="capa-tb">
          <tr><td>Empresa</td><td><b>${esc(empresa)}</b></td></tr>
          <tr><td>Avaliados</td><td>${A.n}</td></tr>
          <tr><td>Instrumento</td><td>DISC ${meta.modulo === 'pessoal' ? 'Pessoal' : 'Executivo'}</td></tr>
          <tr><td>Data</td><td>${esc(meta.data || new Date().toLocaleDateString('pt-BR'))}</td></tr>
        </table>
        <p class="capa-conf">Documento confidencial. Contém informação comportamental de pessoas
        identificadas e deve ser tratado conforme a política de privacidade da empresa.</p>
      </div>
    </section>`);

    // ── COMPOSIÇÃO DO TIME ──
    paginas.push(pg('Composição do time', 'Como este time se distribui',
      'Perfil predominante de cada pessoa e média do grupo',
      `<div class="dimgrid" style="grid-template-columns:repeat(4,1fr)">
        ${['D','I','S','C'].map(k => `<div class="dimcell">
          <div class="dimcell-v" style="color:${F[k].cor}">${A.predominante[k]}</div>
          <div class="dimcell-n">${esc(F[k].estilo)}<br><span style="opacity:.7">média ${A.dim[k]}%</span></div>
          <div class="dimcell-tr"><div class="dimcell-f" style="width:${A.n ? A.predominante[k] / A.n * 100 : 0}%;background:${F[k].cor}"></div></div>
        </div>`).join('')}
      </div>
      <p class="obs" style="margin-top:8px">O número grande é quantas pessoas têm aquela dimensão como
      predominante. A porcentagem é a média do time naquela dimensão.</p>

      <div class="secao"><span>Quem é quem</span></div>
      <table class="tb">
        <thead><tr><th>Pessoa</th><th>Cargo</th><th>Perfil</th>
          <th>Dom.</th><th>Infl.</th><th>Est.</th><th>Anal.</th></tr></thead>
        <tbody>${pessoas.map(p => {
          const r = p.resultado;
          return `<tr>
            <td><b>${esc(p.nome)}</b></td>
            <td style="font-size:10pt;color:var(--cinza2)">${esc(p.cargo) || '—'}</td>
            <td><b style="color:${F[r.perfil.primario].cor};font-family:'Montserrat',sans-serif">${esc(r.perfil.sigla)}</b></td>
            ${['D','I','S','C'].map(k => `<td${r.perfil.primario === k ? ' style="font-weight:700"' : ''}>${Math.round(r.natural[k])}%</td>`).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table>`, rod));

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
      d:'Ninguém no time tem ' + F[k].estilo + ' como dimensão predominante, e a média do grupo é baixa. ' +
        (k === 'D' ? 'Falta quem assuma a frente e decida quando ninguém quer decidir.'
        : k === 'I' ? 'Falta quem comunique para fora e mobilize as pessoas.'
        : k === 'S' ? 'Falta quem sustente o ritmo e cuide da relação quando aperta.'
        : 'Falta quem cheque o detalhe e evite o erro caro.')
    }));
    if (!alertas.length) alertas.push({ tipo:'ok', t:'Distribuição equilibrada',
      d:'Nenhuma dimensão concentra a maioria do time e nenhuma está ausente. É a configuração ' +
        'com maior chance de cobrir cenários diferentes, e a que mais exige método de decisão ' +
        'combinado, porque as pessoas divergem por estilo e não por conteúdo.' });

    paginas.push(pg('Composição do time', 'Concentrações e lacunas',
      'O que a distribuição deste time facilita e o que ela deixa descoberto',
      `${alertas.map(a => `<div class="duocol-c ${a.tipo === 'lacuna' ? 'duocol-no' : a.tipo === 'ok' ? 'duocol-ok' : ''}"
          style="margin-bottom:12px${a.tipo === 'concentracao' ? ';border-left-color:var(--amarelo);background:rgba(201,168,76,.07)' : ''}">
        <div class="duocol-t">${esc(a.t)}</div>
        <div style="font-size:11pt;line-height:1.55;color:var(--cinza)">${esc(a.d)}</div>
      </div>`).join('')}
      <div class="box"><b>Como usar esta página.</b> Concentração não é defeito: é a assinatura do
      time e costuma explicar por que ele é bom no que é bom. O problema aparece quando a
      concentração encontra um cenário que pede justamente a dimensão ausente. Nesses momentos,
      a saída é procedimento, não personalidade: combinar de antemão quem faz o papel que falta.</div>`, rod));

    // ── FORÇAS E LACUNAS DE CAPACIDADE ──
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
      <div class="box"><b>Amplitude</b> é a distância entre a pessoa com maior e menor nota. Amplitude
      alta numa força do time significa que ela está concentrada em poucos: se essas pessoas saem
      de cena, a capacidade sai junto.</div>`, rod));

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
        </div></div>`).join('')}`, rod));

    // ── COMPLEMENTARIDADE ──
    const maisComp = A.pares.slice(0, 3);
    const maisPar = A.pares.slice(-3).reverse();
    paginas.push(pg('Dinâmica do time', 'Quem complementa quem',
      'Pares mais distantes e mais parecidos em estilo',
      `<div class="secao"><span>Maior complementaridade</span></div>
      <p class="obs">Estilos distantes cobrem cenários diferentes. Rendem muito juntos e é onde o
      atrito costuma aparecer, porque a divergência é de forma, não de conteúdo.</p>
      ${maisComp.map(p => `<div class="capx"><div class="capx-b">
        <div class="capx-h"><b>${esc(p.a.nome)} + ${esc(p.b.nome)}</b>
          <span class="capx-v" style="color:var(--amarelo)">${Math.round(p.dist)}</span></div>
        <p class="capx-d">${esc(p.a.resultado.perfil.sigla)} com ${esc(p.b.resultado.perfil.sigla)}.
        ${p.dist > 60 ? 'Distância alta: combine explicitamente como as decisões conjuntas serão tomadas.'
                      : 'Distância moderada: complementaridade natural, com atrito administrável.'}</p>
      </div></div>`).join('')}
      <div class="secao"><span>Maior semelhança</span></div>
      <p class="obs">Estilos próximos se entendem rápido e compartilham o mesmo ponto cego.</p>
      ${maisPar.map(p => `<div class="capx"><div class="capx-b">
        <div class="capx-h"><b>${esc(p.a.nome)} + ${esc(p.b.nome)}</b>
          <span class="capx-v" style="color:var(--cinza2)">${Math.round(p.dist)}</span></div>
        <p class="capx-d">${esc(p.a.resultado.perfil.sigla)} com ${esc(p.b.resultado.perfil.sigla)}. Convivência fácil, contraditório baixo.</p>
      </div></div>`).join('')}`, rod));

    // ── ÍNDICES DO TIME ──
    paginas.push(pg('Leitura da resposta', 'Índices médios do time',
      'O que a forma de responder diz sobre o grupo',
      `<div class="painel">
        ${['ITA','IPM','IDA','IPS','IIA'].map(k => `<div class="painel-c">
          <div class="painel-s">${k}</div>
          <div class="painel-v">${A.indices[k]}</div>
          <div class="painel-tr"><div class="painel-f" style="width:${A.indices[k]}%"></div></div>
          <div class="painel-f2">${esc(D.faixaIndice(A.indices[k]))}</div>
        </div>`).join('')}
      </div>
      <div class="secao"><span>Como ler estes números no grupo</span></div>
      <ul class="lista">
        <li><b>IPS alto no time inteiro</b> costuma indicar cultura em que admitir limitação é
            arriscado. Vale olhar como o erro é tratado ali.</li>
        <li><b>IIA alto no time inteiro</b> indica que o ambiente pede de todos um comportamento
            diferente do natural. É desgaste coletivo, não característica individual.</li>
        <li><b>IPM alto</b> em muitas pessoas mostra time consciente do que precisa desenvolver:
            terreno favorável para um programa de desenvolvimento.</li>
      </ul>
      <div class="box"><b>Atenção ao usar.</b> Estes índices descrevem como o grupo respondeu, não a
      qualidade das pessoas. Não devem ser usados para comparar indivíduos entre si nem para
      ranquear desempenho.</div>`, rod));

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
      </div>
      <div class="etica">
        <b>Nota técnica.</b> Este relatório agrega resultados de instrumentos de autopercepção
        comportamental respondidos individualmente. Descreve preferências declaradas, não desempenho
        observado, e não constitui avaliação psicológica. Não deve ser usado como critério de
        decisão sobre contratação, promoção ou desligamento, nem para comparar ou ranquear pessoas.
        <br><br>
        As informações são confidenciais e identificam pessoas: o compartilhamento deve seguir a
        política de privacidade da empresa e a Lei Geral de Proteção de Dados.
      </div>`, rod));

    return montar(paginas.join('\n'), empresa);
  }

  // Reaproveita o CSS do laudo individual, trocando só o miolo
  function montar(corpo, empresa) {
    const base = L.gerar(
      D.calcular({ f1:{}, f2:{}, f3:{}, f4:[] }),
      { nome:'x', modulo:'executivo' }
    );
    const css = base.slice(base.indexOf('<style>'), base.indexOf('</style>') + 8);
    const fecha = '<' + '/script>';
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Equipe — ${esc(empresa)} — AXIS</title>
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
