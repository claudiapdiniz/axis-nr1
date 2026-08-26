/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC — IMPORTAÇÃO DE LAUDO EXTERNO (ILG PERFORMANCE)

   Empresa que já mapeou o time em outra plataforma não vai refazer tudo.
   Este módulo lê o PDF do laudo da ILG, converte os números para o formato
   da AXIS e devolve uma prévia para a consultora conferir antes de salvar.

   O que entra: perfil natural, adaptado e exigido nas quatro dimensões,
   mais as 24 capacidades de 0 a 100.
   O que NÃO entra: os índices próprios da AXIS (ITA, IPM, IDA, IPS) e o
   mapa desejado por capacidade, que dependem das fases 2, 3 e 4 do nosso
   instrumento. Só o IIA é derivado, porque usa exatamente os mesmos
   insumos aqui e lá: a distância entre o natural e o adaptado.

   Por isso o importado entra no RELATÓRIO DE EQUIPE, não no laudo
   individual: o laudo individual dessa pessoa é o PDF da própria ILG.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const D = global.DISC_EXEC || (typeof require === 'function' ? require('./disc-executivo.js') : null);

  // ── Correspondência de nomes ILG para o id interno da AXIS ────────────
  // Os ids NUNCA mudam: as respostas gravadas apontam para eles.
  // 23 das 24 capacidades são as mesmas nas duas plataformas; o que muda
  // é o nome de uma delas ("Comando e firmeza" lá, "Liderança" aqui).
  const MAPA_ILG = {
    'Comando e firmeza': 'comando',
    'Liderança': 'comando',
    'Ousadia': 'ousadia',
    'Objetividade': 'objetividade',
    'Senso de urgência': 'urgencia',
    'Independência': 'autonomia',
    'Dinamismo': 'competitividade',
    'Extroversão': 'expressividade',
    'Entusiasmo e motivação': 'entusiasmo',
    'Carisma': 'carisma',
    'Sociabilidade': 'articulacao',
    'Persuasão': 'persuasao',
    'Flexibilidade com mudanças': 'adaptabilidade',
    'Empatia': 'escuta',
    'Paciência': 'serenidade',
    'Persistência': 'constancia',
    'Conciliação e consentimento': 'cooperacao',
    'Apoio e disponibilidade': 'apoio',
    'Estabilidade': 'previsibilidade',
    'Racionalidade': 'rigor',
    'Detalhismo': 'detalhe',
    'Organização e controle': 'metodo',
    'Planejamento': 'planejamento',
    'Prudência': 'cautela',
    'Disciplina': 'disciplina'
  };

  // Capacidade que existe na ILG e não tem par aqui. Fica registrada como
  // informação do laudo de origem e não entra no cálculo.
  const SEM_PAR_AXIS = ['Concentração e precisão'];

  // Dimensões: a ILG usa D/I/E/A, a AXIS usa D/I/S/C.
  const DIMENSOES = [
    { ilg: 'Dominância',   axis: 'D' },
    { ilg: 'Influência',   axis: 'I' },
    { ilg: 'Estabilidade', axis: 'S' },
    { ilg: 'Conformidade', axis: 'C' }
  ];
  const COMPOSICAO = { 'DOMINANTE': 'D', 'INFLUENTE': 'I', 'ESTÁVEL': 'S', 'ANALÍTICO': 'C' };

  const n1 = v => Math.round(Number(v) * 10) / 10;
  const num = s => {
    const v = parseFloat(String(s).replace(',', '.'));
    return isFinite(v) ? v : null;
  };
  const limpa = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // ── LEITURA DO TEXTO DO PDF ───────────────────────────────────────────
  function parse(texto) {
    // Leitores de PDF diferentes devolvem o mesmo laudo com espaçamento
    // diferente: um separa "Planejamento" de "100 Pts" por tabulação, outro
    // cola os dois. Colapsar espaços repetidos deixa os dois no mesmo
    // formato antes de qualquer regra.
    const t = String(texto || '').replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ');
    const avisos = [];

    const mNome = t.match(/A V A L I A D O\s*\n([^\n]+)/);
    const mTipo = t.match(/A N Á L I S E D O\s*\n([^\n]+)/);
    const mProf = t.match(/P R O F I S S I O N A L\s*\n([^\n]+)/);
    const mData = t.match(/D A T A · P R O T O C O L O\s*\n\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})\s*·\s*([A-Za-z0-9-]+)/);
    const mPerf = t.match(/\nPerfil:\s*([^\n]+)/);

    const ehILG = /I L G P E R F O R M A N C E|ILG PERFORMANCE/.test(t);
    if (!ehILG) avisos.push('O documento não parece ser um laudo da ILG Performance. Confira os números um a um.');

    // Composição do perfil no capítulo 02 (é o perfil adaptado)
    const composicao = {};
    const reComp = /Perfil (DOMINANTE|INFLUENTE|ESTÁVEL|ANALÍTICO)[\s\S]{0,80}?([0-9]+[.,][0-9]+)\s*%/g;
    let m;
    while ((m = reComp.exec(t))) composicao[COMPOSICAO[m[1]]] = num(m[2]);

    // Natural, adaptado e exigido por dimensão (capítulo 03)
    const natural = {}, adaptado = {}, exigido = {}, flexibilidade = {}, exigenciaMeio = {};
    DIMENSOES.forEach((dim, idx) => {
      const i = t.indexOf('\n' + dim.ilg + '\n');
      if (i < 0) return;
      const j = t.indexOf('\nNatural', i);
      if (j < 0) return;
      const cabeca = t.slice(i, j);
      // O trecho traz o I.F.I em percentual e depois os três valores na
      // ordem Natural, Adaptado, Exigido. Tirando o que vem com % sobram
      // exatamente esses três.
      // Percentuais podem sair colados uns nos outros ("37.7935.01"), então
      // cada valor é lido com no máximo duas casas em vez de "tudo até o
      // próximo separador".
      const nums = (cabeca.replace(/[0-9]+[.,][0-9]+\s*%/g, ' ')
                          .match(/[0-9]{1,3}[.,][0-9]{1,2}/g) || []).map(num);
      if (nums.length >= 3) {
        natural[dim.axis]  = nums[0];
        adaptado[dim.axis] = nums[1];
        exigido[dim.axis]  = nums[2];
      }
      const ifi = (cabeca.match(/I\.F\.I\s*\n\s*([0-9]+[.,][0-9]+)\s*%/) || [])[1];
      if (ifi != null) flexibilidade[dim.axis] = num(ifi);
      const prox = DIMENSOES[idx + 1] ? t.indexOf('\n' + DIMENSOES[idx + 1].ilg + '\n', i + 1) : -1;
      const cauda = t.slice(i, prox > i ? prox : i + 1500);
      const emi = (cauda.match(/E\.M\.I\s*\n\s*([0-9]+[.,][0-9]+)\s*%/) || [])[1];
      if (emi != null) exigenciaMeio[dim.axis] = num(emi);
    });

    ['D', 'I', 'S', 'C'].forEach(k => {
      if (natural[k] == null) avisos.push('Não localizei o perfil natural da dimensão ' + k + '. Preencha à mão.');
    });

    // Conferência cruzada: o adaptado do capítulo 03 tem que bater com o
    // gráfico de composição do capítulo 02.
    ['D', 'I', 'S', 'C'].forEach(k => {
      if (composicao[k] != null && adaptado[k] != null && Math.abs(composicao[k] - adaptado[k]) > 0.6)
        avisos.push('O perfil adaptado da dimensão ' + k + ' aparece como ' + adaptado[k] +
                    ' em um ponto do laudo e ' + composicao[k] + ' em outro. Confira.');
      if (adaptado[k] == null && composicao[k] != null) adaptado[k] = composicao[k];
    });

    // As 24 capacidades, no formato "Nome    87 Pts"
    const capacidades = {};
    const extras = {};
    const naoReconhecidas = [];
    // Dependendo do leitor, o nome e a pontuação vêm separados por espaço
    // ou colados ("Ousadia100 Pts"). O nome é o menor texto possível antes
    // do número.
    const reCap = /^(.{3,45}?)[ \t]*([0-9]+(?:[.,][0-9]+)?)[ \t]*Pts[ \t]*$/gm;
    while ((m = reCap.exec(t))) {
      const nome = limpa(m[1]);
      const val = num(m[2]);
      if (val == null) continue;
      const id = MAPA_ILG[nome];
      if (id) { if (capacidades[id] == null) capacidades[id] = Math.round(val); }
      else if (SEM_PAR_AXIS.indexOf(nome) >= 0) { if (extras[nome] == null) extras[nome] = Math.round(val); }
      else if (naoReconhecidas.indexOf(nome) < 0) naoReconhecidas.push(nome);
    }

    // "Apoio e disponibilidade" existe aqui e não existe lá. Fica estimada
    // pela média das outras capacidades do mesmo fator, marcada na tela de
    // conferência para a consultora ajustar.
    const estimadas = [];
    if (D) {
      D.CAPACIDADES.filter(c => capacidades[c.id] == null).forEach(c => {
        const irmas = D.CAPACIDADES.filter(x => x.fator === c.fator && capacidades[x.id] != null)
                                   .map(x => capacidades[x.id]);
        if (irmas.length) {
          capacidades[c.id] = Math.round(irmas.reduce((a, b) => a + b, 0) / irmas.length);
          estimadas.push(c.id);
          avisos.push('A capacidade "' + c.nome + '" não existe no laudo da ILG. Ficou com a média das outras do mesmo fator (' +
                      capacidades[c.id] + '). Ajuste se quiser.');
        } else {
          avisos.push('Não localizei a capacidade "' + c.nome + '". Preencha à mão.');
        }
      });
    }
    if (naoReconhecidas.length)
      avisos.push('Capacidades do laudo sem correspondência aqui: ' + naoReconhecidas.join(', ') + '.');

    return {
      origem: {
        plataforma: ehILG ? 'ILG Performance' : 'Documento externo',
        relatorio: limpa(mTipo && mTipo[1]) || null,
        profissional: limpa(mProf && mProf[1]) || null,
        data: (mData && mData[1]) || null,
        protocolo: (mData && mData[2]) || null,
        perfilTexto: limpa(mPerf && mPerf[1]) || null
      },
      nome: limpa(mNome && mNome[1]) || null,
      natural, adaptado, exigido, composicao,
      flexibilidade, exigenciaMeio,
      capacidades, estimadas, extras, naoReconhecidas,
      avisos
    };
  }

  // ── CONVERSÃO PARA O FORMATO DA AXIS ──────────────────────────────────
  // Mesmo objeto que o motor produz, com os campos que dependem das fases
  // 2, 3 e 4 explicitamente nulos. Nada é inventado para preencher espaço.
  function montarResultado(dados) {
    if (!D) throw new Error('DISC_EXEC não carregado.');
    const natural = {}, adaptado = {};
    ['D', 'I', 'S', 'C'].forEach(k => {
      natural[k]  = n1(Number(dados.natural  && dados.natural[k])  || 0);
      adaptado[k] = n1(Number(dados.adaptado && dados.adaptado[k]) || 0);
    });

    const mapaAtual = {};
    D.CAPACIDADES.forEach(c => {
      const v = Number(dados.capacidades && dados.capacidades[c.id]);
      mapaAtual[c.id] = Math.max(0, Math.min(100, Math.round(isFinite(v) ? v : 0)));
    });

    const ranking = ['D', 'I', 'S', 'C'].sort((a, b) => natural[b] - natural[a]);
    const faixaFator = {};
    ['D', 'I', 'S', 'C'].forEach(k => {
      const rel = natural[k] / 25;
      faixaFator[k] = rel >= 1.60 ? 'MUITO ALTO'
                    : rel >= 1.20 ? 'ALTO'
                    : rel >= 0.70 ? 'NORMAL'
                    : rel >= 0.45 ? 'BAIXO'
                    : 'MUITO BAIXO';
    });

    const capsOrdenadas = D.CAPACIDADES
      .map(c => ({ id: c.id, nome: c.nome, fator: c.fator, indice: D.FATORES[c.fator].indice,
                   atual: mapaAtual[c.id], desejado: null, gap: null }))
      .sort((a, b) => b.atual - a.atual);

    // IIA: mesma fórmula do motor, mesmos insumos. É o único índice que o
    // laudo externo permite calcular sem estimar nada.
    const dist = ['D', 'I', 'S', 'C'].reduce((s, k) => s + Math.abs(natural[k] - adaptado[k]), 0);
    const IIA = Math.round(Math.max(0, Math.min(100, dist / 2 / 75 * 100)));

    return {
      versao: 'axis-disc-exec-1.0',
      importado: true,
      origemExterna: dados.origem || null,
      perfil: { sigla: ranking.slice(0, 2).join(''), primario: ranking[0],
                secundario: ranking[1], ranking: ranking },
      natural: natural, declarado: null, adaptado: adaptado,
      faixaFator: faixaFator,
      mapaAtual: mapaAtual, mapaDesejado: null, gap: null,
      capacidades: capsOrdenadas,
      pontosFortes: capsOrdenadas.slice(0, 7),
      pontosAtencao: capsOrdenadas.slice(-5).reverse(),
      indices: { ITA: null, IPM: null, IDA: null, IPS: null, IIA: IIA,
                 TCM: { segundos: 0, minutos: 0, faixa: 'não se aplica',
                        referencia: 'avaliação importada' } },
      fase4Marcadas: [],
      capacidadesEstimadas: Array.isArray(dados.estimadas) ? dados.estimadas.slice() : []
    };
  }

  const API = { parse: parse, montarResultado: montarResultado, MAPA_ILG: MAPA_ILG, SEM_PAR_AXIS: SEM_PAR_AXIS };
  global.DISC_ILG = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

})(typeof window !== 'undefined' ? window : globalThis);
