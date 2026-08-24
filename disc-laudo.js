/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC — LAUDO COMPLETO
   Gera o relatório em HTML pronto para impressão A4 / PDF.

   Estrutura em 9 capítulos. O laudo funciona INTEIRO sem IA: toda a
   estrutura, os números, os gráficos e as leituras por faixa são
   determinísticos. Se houver narrativas geradas por Claude, elas entram
   como camada extra nos pontos marcados. Falha de IA nunca quebra o laudo.

   CUIDADO: dentro de template literal, tag de fechamento de script precisa
   ser escrita como ${'<' + '/script>'}, senão encerra o bloco da página.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const D = global.DISC_EXEC || (typeof require === 'function' ? require('./disc-executivo.js') : null);
  if (!D) { console.error('[disc-laudo] motor não carregado'); return; }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pct = v => Math.round(v) + '%';

  // ── FAIXAS INTERPRETATIVAS ────────────────────────────────────────────
  function faixaCap(v) {
    return v >= 85 ? { r:'MUITO ALTO', t:'É uma marca registrada do seu comportamento. Aparece mesmo quando você não pensa nela.' }
         : v >= 65 ? { r:'ALTO',       t:'Você recorre a isso com frequência e com bom domínio.' }
         : v >= 40 ? { r:'MODERADO',   t:'Você aciona quando a situação pede, mas não é o seu caminho automático.' }
         : v >= 20 ? { r:'BAIXO',      t:'Aparece pouco no seu dia a dia. Exige esforço consciente.' }
         :           { r:'MUITO BAIXO',t:'Praticamente ausente do seu repertório espontâneo.' };
  }

  // Leitura de cada índice por faixa. Texto muda conforme o valor.
  const LEITURA_INDICE = {
    ITA: {
      nome: 'Índice de Tendência da Autoestima',
      oque: 'Combina as suas forças nas dimensões predominantes com o quanto você se atribui e o quanto reconhece ter a desenvolver.',
      faixas: [
        [80, 'Autoimagem muito positiva. Ponto de atenção: autoconfiança alta demais pode reduzir a escuta de crítica e a percepção de risco.'],
        [60, 'Autoimagem positiva e consistente. Você se reconhece nas suas forças sem negar o que falta.'],
        [40, 'Autoimagem equilibrada, com reconhecimento realista de forças e limitações.'],
        [20, 'Autoimagem contida. Você tende a subestimar as próprias forças, o que pode custar oportunidades.'],
        [0,  'Autoimagem crítica. Vale investigar se a severidade consigo mesmo não está maior do que os fatos justificam.']
      ]
    },
    IPM: {
      nome: 'Índice de Pontos de Melhoria',
      oque: 'Soma o que você indicou precisar ajustar na fase 3 com as características que marcou para reduzir na fase 4.',
      faixas: [
        [80, 'Você aponta muitos pontos a desenvolver ao mesmo tempo. Priorizar dois ou três rende mais do que atacar tudo.'],
        [60, 'Agenda de desenvolvimento significativa e consciente.'],
        [40, 'Agenda de desenvolvimento equilibrada e realista.'],
        [20, 'Poucos ajustes apontados. Ou você está bem calibrado ao contexto, ou está sendo pouco crítico.'],
        [0,  'Quase nenhum ajuste apontado. Vale confrontar com a percepção de pares e liderança antes de concluir.']
      ]
    },
    IDA: {
      nome: 'Índice de Discrepância da Autopercepção',
      oque: 'Compara como você se apresentou na fase em que era obrigado a escolher com a fase em que era livre para marcar tudo.',
      faixas: [
        [80, 'Discrepância alta entre as duas fases. Quando obrigado a escolher, o seu perfil ficou nítido; quando livre, você marcou alto em quase tudo. Pode indicar desejo de se apresentar de forma mais completa do que a realidade, ou pouca clareza sobre as próprias preferências.'],
        [60, 'Discrepância acima do esperado. Vale reler o resultado com atenção às dimensões em que os dois retratos mais divergiram.'],
        [40, 'Discrepância dentro do esperado. As duas formas de responder contam uma história parecida.'],
        [20, 'Baixa discrepância. Alta consistência entre a escolha forçada e a livre.'],
        [0,  'Consistência quase perfeita entre as duas fases. Resultado confiável.']
      ]
    },
    IPS: {
      nome: 'Índice de Positividade Seletiva',
      oque: 'O quanto você se atribuiu de características positivas na fase em que era livre para marcar tudo.',
      faixas: [
        [80, 'Você se atribuiu quase o máximo em quase tudo. Isso infla o retrato e reduz o contraste entre as dimensões: o instrumento compensa isso dando mais peso à fase de escolha forçada.'],
        [60, 'Atribuição generosa, mas ainda com diferenciação entre as dimensões.'],
        [40, 'Atribuição equilibrada, com bom contraste entre o que é e o que não é seu.'],
        [20, 'Atribuição contida. Você reconhece poucas características como fortemente suas.'],
        [0,  'Atribuição muito contida. Pode indicar autocrítica severa ou momento de baixa confiança.']
      ]
    },
    IIA: {
      nome: 'Índice de Influência do Ambiente',
      oque: 'A distância entre o seu comportamento natural e o comportamento que você acredita que o seu contexto exige.',
      faixas: [
        [80, 'O contexto pede um comportamento muito diferente do seu natural. Isso custa energia todos os dias e é uma das principais causas de desgaste em posição de liderança.'],
        [60, 'O contexto pede ajustes relevantes. Vale mapear quais dimensões exigem mais adaptação e por quanto tempo isso é sustentável.'],
        [40, 'Adaptação dentro do esperado para qualquer posição de responsabilidade.'],
        [20, 'Boa aderência entre o seu natural e o que o contexto pede.'],
        [0,  'Aderência alta. Você atua muito próximo do seu comportamento espontâneo, o que preserva energia.']
      ]
    }
  };

  function leituraIndice(sigla, v) {
    const cfg = LEITURA_INDICE[sigla];
    if (!cfg) return { nome: sigla, oque: '', txt: '' };
    const f = cfg.faixas.find(x => v >= x[0]) || cfg.faixas[cfg.faixas.length - 1];
    return { nome: cfg.nome, oque: cfg.oque, txt: f[1] };
  }

  // ── LIDERANÇA por fator predominante ──────────────────────────────────
  const LIDERANCA = {
    D: { estilo:'Liderança Diretiva',
         como:'Você lidera pela decisão. Dá direção, assume a responsabilidade do rumo e não trava diante de risco. A equipe sabe para onde ir.',
         fortes:['Decide rápido e destrava o time','Sustenta posição impopular quando é necessário','Assume a responsabilidade em vez de dividir a culpa','Rende bem em crise e virada'],
         limites:['Pode decidir sozinho o que ganharia com discussão','Ritmo alto pode ser lido como pressão constante','Impaciência com quem processa mais devagar','Corre o risco de calar o time sem perceber'],
         dicas:['Peça a opinião antes de anunciar a decisão, não depois','Diga o "porquê" junto com o "o quê": o time entrega melhor','Reconheça em público, corrija em particular','Combine prazos com quem executa, em vez de fixá-los sozinho']
    },
    I: { estilo:'Liderança Inspiradora',
         como:'Você lidera pelo vínculo e pela energia. Mobiliza, comunica bem e faz as pessoas quererem participar.',
         fortes:['Engaja e sustenta o ânimo em fase difícil','Comunica visão de forma que gruda','Abre portas e conecta pessoas','Cria ambiente onde se fala com liberdade'],
         limites:['Pode privilegiar a relação sobre a cobrança necessária','Muitas frentes abertas e poucas concluídas','Dificuldade de dar retorno duro','Pode confundir entusiasmo com alinhamento real'],
         dicas:['Feche o combinado por escrito: o entusiasmo não substitui o acordo','Separe momentos de mobilizar e de cobrar','Pratique o retorno difícil sem adoçar a ponto de sumir a mensagem','Conclua um ciclo antes de abrir o próximo']
    },
    S: { estilo:'Liderança Sustentadora',
         como:'Você lidera pela constância e pela escuta. Cria segurança, e as pessoas confiam porque você é previsível no melhor sentido.',
         fortes:['Constrói confiança que se sustenta no tempo','Escuta de verdade antes de decidir','Segura a equipe em período de pressão','Baixa rotatividade sob a sua gestão'],
         limites:['Pode adiar conversa difícil por evitar conflito','Tolera desempenho baixo por tempo demais','Resistência a mudança de rumo abrupta','Pode ceder além do que o resultado permite'],
         dicas:['Trate o conflito cedo: adiar aumenta o custo','Estabeleça o padrão mínimo e cobre com clareza','Prepare o time para mudanças em vez de absorver sozinho','Reserve para si o que você reserva para os outros']
    },
    C: { estilo:'Liderança Técnica',
         como:'Você lidera pelo rigor e pela qualidade. Define padrão, evita erro caro e sustenta decisão com evidência.',
         fortes:['Decide com base em dado, não em impressão','Antecipa risco que os outros não veem','Estabelece padrão de qualidade que eleva o time','Confiável na entrega e no detalhe'],
         limites:['Pode atrasar decisão esperando informação completa','Padrão alto pode virar cobrança desproporcional','Pouca expressão emocional pode ser lida como distância','Dificuldade de delegar o que não sai do seu jeito'],
         dicas:['Defina qual decisão exige 100% e qual exige 70% de informação','Diga o que está bom, não só o que falta','Explique o critério para o time reproduzir sem você','Delegue com padrão combinado em vez de refazer depois']
    }
  };

  // ── CARREIRA por fator ────────────────────────────────────────────────
  const CARREIRA = {
    D: { ambientes:['Autonomia real para decidir','Meta clara e liberdade de caminho','Ritmo acelerado, resultado visível','Espaço para assumir a frente'],
         motivadores:['Autonomia','Desafio e superação','Resultado mensurável','Autoridade sobre o próprio escopo'],
         areas:['Direção e gestão executiva','Comercial e expansão','Operações sob pressão','Empreendedorismo e novos negócios'],
         desgasta:['Depender de aprovação para tudo','Processo longo sem justificativa','Ambiente lento e sem meta','Microgestão'] },
    I: { ambientes:['Contato constante com pessoas','Espaço para comunicar e influenciar','Variedade e projetos novos','Reconhecimento visível'],
         motivadores:['Reconhecimento','Relações e pertencimento','Variedade e novidade','Liberdade de expressão'],
         areas:['Comercial e relacionamento','Marketing e comunicação','Treinamento e desenvolvimento','Liderança de equipes grandes'],
         desgasta:['Trabalho isolado e silencioso','Rotina repetitiva','Ambiente formal e fechado','Falta de retorno sobre o próprio trabalho'] },
    S: { ambientes:['Estabilidade e previsibilidade','Relações de confiança duradouras','Mudança anunciada com antecedência','Sentido de contribuição'],
         motivadores:['Segurança','Harmonia nas relações','Contribuir com o outro','Pertencimento a um time'],
         areas:['Gestão de pessoas e RH','Atendimento e suporte','Operações estáveis','Áreas de cuidado e saúde'],
         desgasta:['Mudança brusca e sem aviso','Conflito aberto e permanente','Cobrança agressiva','Competição interna entre pares'] },
    C: { ambientes:['Critério claro e regra definida','Tempo para entregar com qualidade','Trabalho que exige precisão','Reconhecimento pela excelência'],
         motivadores:['Qualidade e excelência','Domínio técnico','Clareza de critério','Autonomia sobre o método'],
         areas:['Controladoria, finanças e auditoria','Qualidade, processos e compliance','Jurídico e regulatório','Engenharia, dados e tecnologia'],
         desgasta:['Prazo que inviabiliza qualidade','Decisão sem dado','Ambiguidade de regra e escopo','Improviso constante'] }
  };

  // ── TOMADA DE DECISÃO ─────────────────────────────────────────────────
  function tomadaDecisao(r) {
    const n = r.natural;
    const racional = n.C + n.D, emocional = n.I + n.S;
    const rapida = n.D + n.I, ponderada = n.S + n.C;
    const eixo1 = racional > emocional + 10 ? 'mais racional, apoiada em fato e lógica'
                : emocional > racional + 10 ? 'mais relacional, considerando o impacto nas pessoas'
                : 'equilibrada entre o dado e o impacto nas pessoas';
    const eixo2 = rapida > ponderada + 10 ? 'rápida, com tolerância a decidir sem ter tudo'
                : ponderada > rapida + 10 ? 'ponderada, buscando segurança antes de decidir'
                : 'de velocidade variável, conforme o peso da decisão';
    return { eixo1, eixo2, racional, emocional, rapida, ponderada };
  }

  // ── PÁGINA ────────────────────────────────────────────────────────────
  let _n = 0;
  function pg(cap, titulo, sub, corpo, opts) {
    _n++;
    const o = opts || {};
    return `<section class="pagina${o.cls ? ' ' + o.cls : ''}">
      <header class="ph"><span class="ph-cap">${esc(cap)}</span><span class="ph-marca">AXIS</span></header>
      ${titulo ? `<h2 class="pt">${esc(titulo)}</h2>` : ''}
      ${sub ? `<p class="ps">${esc(sub)}</p>` : ''}
      <div class="pc">${corpo}</div>
      <footer class="pf"><span>${esc(o.rodape || '')}</span><span class="pf-n">${_n}</span></footer>
    </section>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GERADOR
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * @param {Object} r  resultado do DISC_EXEC.calcular
   * @param {Object} meta {nome, empresa, cargo, data, modulo}
   * @param {Object} nar narrativas opcionais geradas por IA
   */
  function gerar(r, meta, nar) {
    _n = 0;
    meta = meta || {}; nar = nar || {};
    const F = D.FATORES;
    const nome = meta.nome || 'Avaliado';
    const primeiro = String(nome).split(' ')[0];
    const P = r.perfil.primario, S2 = r.perfil.secundario;
    const dec = tomadaDecisao(r);
    const titulo = meta.modulo === 'pessoal' ? 'DISC Pessoal' : 'DISC Executivo';

    const caps = r.capacidades;                 // já vem ordenado do maior ao menor
    const fortes = caps.slice(0, 7);
    const demais = caps.slice(7);

    const paginas = [];

    // ── CAPA ──
    paginas.push(`<section class="pagina capa">
      <div class="capa-top"><div class="capa-marca">AXIS</div><div class="capa-sub">Avaliação Comportamental</div></div>
      <div class="capa-meio">
        <div class="capa-et">Laudo completo</div>
        <h1 class="capa-t">${esc(titulo)}</h1>
        <div class="capa-sigla">${esc(r.perfil.sigla)}</div>
        <div class="capa-perfil">${esc(F[P].estilo)} com ${esc(F[S2].estilo)}</div>
      </div>
      <div class="capa-base">
        <table class="capa-tb">
          <tr><td>Avaliado</td><td><b>${esc(nome)}</b></td></tr>
          ${meta.cargo ? `<tr><td>Cargo</td><td>${esc(meta.cargo)}</td></tr>` : ''}
          ${meta.empresa ? `<tr><td>Empresa</td><td>${esc(meta.empresa)}</td></tr>` : ''}
          <tr><td>Data</td><td>${esc(meta.data || new Date().toLocaleDateString('pt-BR'))}</td></tr>
          <tr><td>Instrumento</td><td>4 fases · 24 capacidades · 6 índices</td></tr>
        </table>
        <p class="capa-conf">Documento confidencial. Destina-se exclusivamente ao avaliado e ao profissional responsável pela devolutiva.</p>
      </div>
    </section>`);

    // ── SUMÁRIO ──
    const sumario = [
      ['01','Fundamentos','O que mede, base científica e limites de uso'],
      ['02','Composição do perfil','As quatro dimensões e como se combinam em você'],
      ['03','Natural e adaptado','Quem você é e o que o seu contexto pede'],
      ['04','Mapa de autodesempenho','As 24 capacidades, como estão e como deveriam estar'],
      ['05','Pontos fortes','As sete capacidades em que você mais se destaca'],
      ['06','Demais capacidades','As outras dezessete, com leitura individual'],
      ['07','Liderança','Estilo, forças, limites e como extrair o seu melhor'],
      ['08','Carreira e motivadores','Ambientes, motivadores e o que desgasta'],
      ['09','Índices gerais','As seis leituras que cruzam as fases entre si']
    ];
    paginas.push(pg('Sumário', 'Sumário', 'O que você vai encontrar neste laudo',
      `<div class="sum">${sumario.map(([n,t,d]) => `
        <div class="sum-i"><span class="sum-n">${n}</span><div><div class="sum-t">${esc(t)}</div><div class="sum-d">${esc(d)}</div></div></div>`).join('')}</div>
       <div class="box" style="margin-top:26px">
         <b>Como ler este laudo.</b> Nenhuma dimensão é melhor que outra. O instrumento não mede
         capacidade, inteligência ou caráter: mede <b>preferência de comportamento</b>, ou seja,
         o caminho que você toma quando não precisa pensar. Preferência não é limite: você pode
         atuar fora dela, apenas custa mais energia.
       </div>`));

    // ── CAP 01 · FUNDAMENTOS ──
    paginas.push(pg('Capítulo 01 · Fundamentos', 'O que este instrumento mede',
      'Preferência de comportamento, não capacidade nem caráter',
      `<p>O modelo de quatro dimensões comportamentais tem origem no trabalho de William Moulton Marston,
        publicado em 1928. Marston observou que o comportamento das pessoas varia em dois eixos: como cada
        um percebe o ambiente, favorável ou desafiador, e como reage a ele, agindo sobre o meio ou
        adaptando-se a ele. Do cruzamento desses eixos nascem quatro padrões.</p>
      <div class="grid2">
        ${['D','I','S','C'].map(k => `<div class="fcard" style="border-left:4px solid ${F[k].cor}">
          <div class="fcard-l" style="color:${F[k].cor}">${k}</div>
          <div class="fcard-n">${esc(F[k].estilo)}</div>
          <div class="fcard-r">${esc(F[k].resumo)}</div></div>`).join('')}
      </div>
      <h3>Três coisas que este laudo não é</h3>
      <ul class="lista">
        <li><b>Não é teste de inteligência nem de competência técnica.</b> Duas pessoas com o mesmo perfil
          podem ter desempenhos muito diferentes.</li>
        <li><b>Não é diagnóstico psicológico.</b> Não avalia saúde mental, transtorno ou sofrimento psíquico.</li>
        <li><b>Não é sentença.</b> Perfil comportamental muda com contexto, fase de vida e desenvolvimento
          deliberado. Este laudo retrata um momento.</li>
      </ul>`, { rodape: 'AXIS · ' + titulo }));

    paginas.push(pg('Capítulo 01 · Fundamentos', 'Como a sua resposta virou este laudo',
      'Quatro fases que se cruzam entre si',
      `<p>O questionário tem quatro fases, e elas não são repetição. Cada uma existe para ser
        <b>cruzada com outra</b>. É esse cruzamento que produz os índices do capítulo 09, que nenhum
        questionário de fase única consegue gerar.</p>
      <table class="tb">
        <thead><tr><th>Fase</th><th>Formato</th><th>O que revela</th></tr></thead>
        <tbody>
          <tr><td><b>1</b></td><td>Ordenação forçada de 12 grupos de 4 adjetivos</td>
            <td>O seu perfil natural. Como você é obrigado a escolher, o retrato sai nítido e resiste
                à tentação de dizer sim para tudo.</td></tr>
          <tr><td><b>2</b></td><td>24 afirmativas em régua de 1 a 9</td>
            <td>A intensidade que você atribui a si. Aqui você era livre para marcar alto em tudo, e
                essa liberdade é justamente o que revela o estilo de resposta.</td></tr>
          <tr><td><b>3</b></td><td>24 eixos de ajuste de desempenho</td>
            <td>O que o seu contexto pede. Gera o mapa desejado e a medida de quanto o ambiente exige
                de você.</td></tr>
          <tr><td><b>4</b></td><td>Características a reduzir, opcional</td>
            <td>O que você reconhece como excesso. Alimenta a agenda de desenvolvimento.</td></tr>
        </tbody>
      </table>
      <div class="box">
        <b>Por que a fase 1 pesa mais.</b> Quando alguém pode concordar com tudo, tende a se descrever
        de forma mais completa do que é. A ordenação forçada não permite isso: para colocar um adjetivo
        em primeiro, outro precisa ir para último. Por isso a composição do seu perfil vem principalmente
        dela, e a fase 2 entra como intensidade e como medida de consistência.
      </div>`, { rodape: 'AXIS · ' + titulo }));

    // ── CAP 01 · BASE TÉCNICA ──
    paginas.push(pg('Capítulo 01 · Fundamentos', 'Base técnica e científica',
      'De onde vem o modelo e o que a literatura sustenta',
      `<h3>Origem do modelo</h3>
      <p>O modelo de quatro dimensões foi proposto por <b>William Moulton Marston</b> em
      <i>Emotions of Normal People</i> (1928). Marston era doutor em Psicologia por Harvard e
      propôs descrever o comportamento de pessoas <b>sem patologia</b>, o que na época era
      incomum: a psicologia da personalidade estava voltada ao estudo do transtorno.</p>
      <p>Marston não construiu um instrumento de medida. A transformação do modelo teórico em
      questionário aplicável veio depois, principalmente com <b>Walter V. Clarke</b>, que nos anos
      1940 desenvolveu a Activity Vector Analysis usando listas de adjetivos, e com
      <b>John G. Geier</b>, que nos anos 1970 estruturou o formato de escolha forçada que se
      tornou padrão na área.</p>

      <h3>Escolha forçada: por que este formato</h3>
      <p>A fase 1 usa <b>medida ipsativa</b>, em que o respondente ordena alternativas em vez de
      pontuar cada uma isoladamente. A literatura psicométrica registra que esse formato
      <b>reduz o viés de desejabilidade social</b> e o viés de aquiescência, a tendência de
      concordar com o que é apresentado. Em contrapartida, medida ipsativa produz escores
      <b>relativos dentro da pessoa</b>, e não comparáveis entre pessoas.</p>
      <p>É por isso que este instrumento não usa só a escolha forçada. A fase 2 aplica escala
      <b>normativa</b> (Likert de 9 pontos), em que cada item é respondido de forma independente.
      A combinação dos dois formatos permite o que nenhum dos dois sozinho permite: comparar o
      retrato forçado com o retrato livre e medir a <b>consistência</b> da própria resposta.
      É essa comparação que gera os índices do capítulo 09.</p>

      <div class="box"><b>O que este instrumento não afirma.</b> Não há, na literatura, consenso
      sobre validade preditiva de instrumentos DISC para desempenho profissional. Este laudo
      descreve <b>preferências comportamentais autorrelatadas</b>. Não prevê resultado, não mede
      competência técnica e não deve ser usado como critério único de decisão sobre pessoas.</div>`,
      { rodape: 'AXIS · ' + titulo }));

    paginas.push(pg('Capítulo 01 · Fundamentos', 'Escopo do instrumento',
      'O que este laudo mede, e o que exige outro instrumento',
      `<h3>Natureza da medida</h3>
      <p>Este laudo é resultado de um <b>instrumento de autopercepção comportamental</b>. Ele
      registra como a pessoa descreve o próprio comportamento, e trata esse relato como um dado
      legítimo: preferência declarada é informação útil para desenvolvimento, desde que lida
      como preferência, e não como medida objetiva de desempenho.</p>
      <p>A distinção importa na hora de decidir o que fazer com o resultado. Comportamento
      observado, desempenho entregue e potencial de crescimento são três coisas diferentes, e
      cada uma pede a sua própria fonte de evidência.</p>

      <table class="tb">
        <thead><tr><th>Pergunta</th><th>Instrumento adequado</th></tr></thead>
        <tbody>
          <tr><td>Como esta pessoa prefere agir?</td><td><b>Este laudo</b></td></tr>
          <tr><td>Como ela é percebida por quem convive com ela?</td><td>Avaliação 360 graus</td></tr>
          <tr><td>Ela entregou o resultado combinado?</td><td>Avaliação de desempenho</td></tr>
          <tr><td>Ela domina a técnica da função?</td><td>Prova técnica ou avaliação prática</td></tr>
          <tr><td>Há sofrimento psíquico envolvido?</td><td>Avaliação clínica com profissional habilitado</td></tr>
        </tbody>
      </table>

      <h3>Onde este laudo rende mais</h3>
      <ul class="lista">
        <li>Conversa de desenvolvimento individual e plano de ação</li>
        <li>Preparação de líderes para adaptar comunicação, delegação e retorno</li>
        <li>Leitura de complementaridade e de atrito entre estilos numa equipe</li>
        <li>Diálogo de carreira, ancorado em motivadores e ambiente de maior aderência</li>
      </ul>

      <h3>Onde ele deve entrar acompanhado</h3>
      <p>Em decisões que afetam a vida profissional de alguém, como seleção, promoção ou
      movimentação, o perfil comportamental é <b>um insumo entre outros</b>, nunca o critério
      isolado. A prática recomendada é combiná-lo com evidência de desempenho e com avaliação
      técnica da função. Este instrumento não integra o sistema de testes psicológicos
      regulamentado pelo Conselho Federal de Psicologia e não substitui avaliação psicológica.</p>

      <h3>Referências</h3>
      <div class="refs">
        <p>MARSTON, W. M. <i>Emotions of Normal People</i>. Londres: Kegan Paul, Trench, Trubner &amp; Co., 1928.</p>
        <p>CLARKE, W. V. <i>The Construction of an Industrial Selection Personality Test</i>.
           Journal of Psychology, 1956.</p>
        <p>GEIER, J. G. <i>Personal Profile System</i>. Minneapolis: Performax Systems, 1979.</p>
        <p>CONSELHO FEDERAL DE PSICOLOGIA. <i>Resolução CFP nº 09/2018</i>. Brasília, 2018.</p>
        <p>BRASIL. <i>Lei nº 13.709/2018</i> (Lei Geral de Proteção de Dados Pessoais).</p>
      </div>

      <div class="box"><b>Proteção de dados.</b> As respostas que originaram este laudo foram
      coletadas mediante convite nominal e são tratadas conforme a LGPD. O documento é
      confidencial e o seu compartilhamento é decisão do avaliado e do profissional responsável.</div>`,
      { rodape: 'AXIS · ' + titulo }));

    // ── CAP 02 · COMPOSIÇÃO ──
    paginas.push(pg('Capítulo 02 · Composição do perfil', `Perfil ${r.perfil.sigla}`,
      `${F[P].estilo} como dimensão predominante, ${F[S2].estilo} como apoio`,
      `<div class="hero2">
        <div><canvas id="g-donut" width="300" height="300"></canvas></div>
        <div>${r.perfil.ranking.map(k => `
          <div class="barra">
            <div class="barra-top"><b style="color:${F[k].cor}">${k} · ${esc(F[k].estilo)}</b>
              <span class="barra-v">${pct(r.natural[k])}</span></div>
            <div class="barra-tr"><div class="barra-f" style="width:${r.natural[k]}%;background:${F[k].cor}"></div></div>
            <div class="barra-f2">${esc(r.faixaFator[k])}</div>
          </div>`).join('')}</div>
      </div>
      ${nar.perfil ? `<div class="narr">${nar.perfil}</div>` :
        `<h3>O que a sua combinação indica</h3>
         <p>${esc(primeiro)} apresenta predominância em <b>${esc(F[P].estilo)}</b> (${pct(r.natural[P])}),
         com <b>${esc(F[S2].estilo)}</b> (${pct(r.natural[S2])}) como dimensão de apoio. Na prática,
         isso significa que o seu comportamento espontâneo é organizado principalmente por
         ${esc(F[P].resumo.toLowerCase().replace(/\.$/, ''))}, apoiado por
         ${esc(F[S2].resumo.toLowerCase().replace(/\.$/, ''))}.</p>
         <p>As dimensões menos presentes, <b>${esc(F[r.perfil.ranking[2]].estilo)}</b>
         (${pct(r.natural[r.perfil.ranking[2]])}) e <b>${esc(F[r.perfil.ranking[3]].estilo)}</b>
         (${pct(r.natural[r.perfil.ranking[3]])}), não são ausências de capacidade: são caminhos que
         você percorre com esforço consciente, e não por automatismo.</p>`}
      <div class="box"><b>Leitura da faixa.</b> A classificação não é sobre o percentual bruto: ela
        compara a sua distribuição com o esperado se as quatro dimensões fossem iguais (25% cada).
        Por isso 20% pode ser "normal" numa dimensão e "baixo" em outra distribuição.</div>`,
      { rodape: 'AXIS · ' + titulo }));

    // ── CAP 03 · NATURAL x ADAPTADO ──
    const distIIA = r.indices.IIA;
    paginas.push(pg('Capítulo 03 · Natural e adaptado', 'Quem você é e o que o contexto pede',
      'A distância entre os dois é o que custa energia',
      `<div class="hero2">
        <div><canvas id="g-adapt" width="320" height="300"></canvas></div>
        <div>
          <table class="tb">
            <thead><tr><th>Dimensão</th><th>Natural</th><th>Exigido</th><th>Ajuste</th></tr></thead>
            <tbody>${['D','I','S','C'].map(k => {
              const d = Math.round(r.adaptado[k] - r.natural[k]);
              return `<tr><td><b style="color:${F[k].cor}">${esc(F[k].estilo)}</b></td>
                <td>${pct(r.natural[k])}</td><td>${pct(r.adaptado[k])}</td>
                <td class="${d > 4 ? 'up' : d < -4 ? 'dn' : ''}">${d > 0 ? '+' : ''}${d} p.p.</td></tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>
      <h3>Índice de Influência do Ambiente: ${distIIA}/100 · ${D.faixaIndice(distIIA)}</h3>
      <p>${esc(leituraIndice('IIA', distIIA).txt)}</p>
      ${nar.adaptado ? `<div class="narr">${nar.adaptado}</div>` : ''}
      <div class="box"><b>Por que isso importa.</b> Agir fora do comportamento natural é possível e
        muitas vezes necessário. O problema não é adaptar-se, é adaptar-se muito, em muitas frentes e
        por tempo indeterminado. Quando a distância é grande e permanente, o custo aparece como
        cansaço que não passa no fim de semana.</div>`,
      { rodape: 'AXIS · ' + titulo }));

    // ── CAP 04 · MAPA ──
    paginas.push(pg('Capítulo 04 · Mapa de autodesempenho', 'As 24 capacidades',
      'Como você acredita que está e como acredita que deveria estar',
      `<div style="text-align:center"><canvas id="g-radar" width="520" height="520"></canvas></div>
       <p class="leg"><span class="leg-a"></span> Como está &nbsp;&nbsp;
          <span class="leg-b"></span> Como deveria estar</p>
       <p>Cada capacidade recebe nota de 0 a 100. Quanto mais distante do centro, mais a capacidade
       aparece no seu dia a dia. A linha tracejada é o que você indicou que precisaria ajustar para
       ter um desempenho melhor: onde ela se afasta da linha cheia, existe uma agenda de
       desenvolvimento reconhecida por você mesmo.</p>`,
      { rodape: 'AXIS · ' + titulo }));

    // tabela das 24 ordenadas, em duas páginas de 12
    for (let i = 0; i < 24; i += 12) {
      const bloco = caps.slice(i, i + 12);
      paginas.push(pg('Capítulo 04 · Mapa de autodesempenho',
        i === 0 ? 'As 24 capacidades, da maior para a menor' : 'As 24 capacidades · continuação',
        i === 0 ? 'Posição, nota atual e ajuste indicado' : '',
        `<table class="tb tb-cap">
          <thead><tr><th>#</th><th>Capacidade</th><th>Dimensão</th><th>Atual</th><th>Desejado</th><th>Ajuste</th></tr></thead>
          <tbody>${bloco.map((c, j) => `<tr>
            <td class="num">${i + j + 1}</td>
            <td><b>${esc(c.nome)}</b></td>
            <td><span class="tag" style="color:${F[c.fator].cor};border-color:${F[c.fator].cor}44">${esc(F[c.fator].estilo)}</span></td>
            <td><div class="mini"><div class="mini-f" style="width:${c.atual}%;background:${F[c.fator].cor}"></div></div><span class="mini-v">${c.atual}</span></td>
            <td>${c.desejado}</td>
            <td class="${c.gap > 4 ? 'up' : c.gap < -4 ? 'dn' : ''}">${c.gap > 0 ? '+' : ''}${c.gap}</td>
          </tr>`).join('')}</tbody>
        </table>`, { rodape: 'AXIS · ' + titulo }));
    }

    // ── CAP 05 · PONTOS FORTES (uma página por capacidade) ──
    fortes.forEach((c, i) => {
      const info = D.CAP_POR_ID[c.id], fx = faixaCap(c.atual);
      paginas.push(pg('Capítulo 05 · Pontos fortes', esc(c.nome),
        `${i + 1}º ponto forte · Dimensão ${F[c.fator].estilo}`,
        `<div class="capbox">
          <div class="capbox-v" style="color:${F[c.fator].cor}">${c.atual}<span>/100</span></div>
          <div><div class="capbox-f">${fx.r}</div><div class="capbox-t">${esc(fx.t)}</div></div>
        </div>
        <h3>O que é</h3><p>${esc(info.def)}</p>
        <h3>Como aparece em você</h3>
        <ul class="lista">${info.attrs.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
        ${nar['cap_' + c.id] ? `<div class="narr">${nar['cap_' + c.id]}</div>` : ''}
        <h3>O outro lado</h3>
        <p>Toda força carrega o seu custo. ${esc(info.nome)} em ${c.atual}/100 significa que este
        comportamento aparece com muita frequência, inclusive quando a situação não pede. Vale observar
        se, em alguma relação ou contexto, ele já está sendo lido como excesso.</p>
        ${c.gap !== 0 ? `<div class="box"><b>Você indicou ajuste.</b> Mesmo sendo um ponto forte, você
          apontou que ${c.gap > 0 ? 'precisaria de mais' : 'não está precisando de tanto'} nesta
          capacidade (${c.gap > 0 ? '+' : ''}${c.gap} pontos). Isso costuma revelar mais sobre a exigência
          do contexto do que sobre a capacidade em si.</div>` : ''}`,
        { rodape: 'AXIS · ' + titulo }));
    });

    // ── CAP 06 · DEMAIS CAPACIDADES (quatro por página) ──
    // Distribui por igual em vez de blocos fixos: com 17 capacidades e 4 por
    // pagina sobrava uma sozinha na ultima folha, o que fica orfao e feio.
    // 17 vira 5+4+4+4; o calculo se ajusta sozinho se o numero mudar.
    const PG = Math.ceil(demais.length / 5);
    const base = Math.floor(demais.length / PG), resto = demais.length % PG;
    let cursor = 0;
    for (let p = 0; p < PG; p++) {
      const tam = base + (p < resto ? 1 : 0);
      const bloco = demais.slice(cursor, cursor + tam);
      const i = cursor;
      cursor += tam;
      paginas.push(pg('Capítulo 06 · Demais capacidades',
        i === 0 ? 'As demais capacidades' : 'Demais capacidades · continuação',
        i === 0 ? 'Leitura individual, da mais presente para a menos presente' : '',
        bloco.map((c, j) => {
          const info = D.CAP_POR_ID[c.id], fx = faixaCap(c.atual);
          return `<div class="capx">
            <div class="capx-n">${String(i + j + 8).padStart(2, '0')}</div>
            <div class="capx-b">
              <div class="capx-h">
                <b>${esc(c.nome)}</b>
                <span class="tag" style="color:${F[c.fator].cor};border-color:${F[c.fator].cor}44">${esc(F[c.fator].estilo)}</span>
                <span class="capx-fx">${fx.r}</span>
                <span class="capx-v" style="color:${F[c.fator].cor}">${c.atual}</span>
              </div>
              <div class="capx-tr"><div class="capx-f" style="width:${c.atual}%;background:${F[c.fator].cor}"></div>${
                c.desejado !== c.atual ? `<div class="capx-alvo" style="left:${c.desejado}%"></div>` : ''}</div>
              <p class="capx-d">${esc(info.def)}</p>
              <div class="capx-a">${info.attrs.map(a => `<span>${esc(a)}</span>`).join('')}</div>
              ${c.gap > 4 ? `<div class="capx-gap">Você indicou que precisaria desenvolver esta capacidade: +${c.gap} pontos</div>`
                : c.gap < -4 ? `<div class="capx-gap">Você indicou que não precisa de tanto disto: ${c.gap} pontos</div>` : ''}
            </div>
          </div>`;
        }).join('') +
        (i === 0 ? '<div class="capx-leg">A marca clara na barra indica o nível que você mesmo apontou como adequado.</div>' : ''),
        { rodape: 'AXIS · ' + titulo }));
    }

    // ── CAP 07 · LIDERANÇA ──
    const L = LIDERANCA[P];
    const capsDim = caps.filter(c => c.fator === P);
    paginas.push(pg('Capítulo 07 · Liderança', esc(L.estilo), 'Como você conduz pessoas',
      `<p class="destaque">${esc(L.como)}</p>
       ${nar.lideranca ? `<div class="narr">${nar.lideranca}</div>` : ''}
       <div class="secao"><span>As capacidades que sustentam o seu estilo</span></div>
       <div class="dimgrid">
         ${capsDim.map(c => `<div class="dimcell">
           <div class="dimcell-v" style="color:${F[P].cor}">${c.atual}</div>
           <div class="dimcell-n">${esc(c.nome)}</div>
           <div class="dimcell-tr"><div class="dimcell-f" style="width:${c.atual}%;background:${F[P].cor}"></div></div>
         </div>`).join('')}
       </div>
       <div class="secao"><span>Forças e limites deste estilo</span></div>
       <div class="grid2">
         <div class="lbox lbox-ok"><h4>O que este estilo entrega</h4>
           <ul class="lista">${L.fortes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
         <div class="lbox lbox-at"><h4>O que este estilo custa</h4>
           <ul class="lista">${L.limites.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
       </div>
       <div class="box"><b>Nenhum estilo é melhor que outro.</b> O que existe é adequação ao momento
       da equipe. Um time novo pede direção; um time maduro pede espaço. A pergunta útil não é
       "qual é o meu estilo", é "o que este time precisa agora que eu não estou dando".</div>`,
      { rodape: 'AXIS · ' + titulo }));

    paginas.push(pg('Capítulo 07 · Liderança', 'Como extrair o melhor de você',
      'Esta página é para quem lidera você',
      `<p>Se você tem um gestor, um sócio ou um conselho, compartilhe esta página. Ela descreve o que
        faz alguém com o seu perfil render mais, e o que o desgasta sem necessidade.</p>
       <div class="duocol">
         <div class="duocol-c duocol-ok">
           <div class="duocol-t">O que funciona</div>
           ${L.dicas.map((x, n) => `<div class="duocol-i"><span>${n + 1}</span>${esc(x)}</div>`).join('')}
         </div>
         <div class="duocol-c duocol-no">
           <div class="duocol-t">O que desgasta</div>
           ${CARREIRA[P].desgasta.map((x, n) => `<div class="duocol-i"><span>${n + 1}</span>${esc(x)}</div>`).join('')}
         </div>
       </div>
       <div class="secao"><span>Como dar retorno a você</span></div>
       <p class="destaque">${P === 'D' ? 'Direto, objetivo e sem rodeio. Vá ao ponto e traga o dado. Rodeio é lido como falta de clareza.'
          : P === 'I' ? 'Com contexto e conversa. Comece pelo que está funcionando, seja específico no que precisa mudar e deixe espaço para resposta.'
          : P === 'S' ? 'Com calma e em particular. Retorno duro em público trava. Dê tempo entre a conversa e a cobrança da mudança.'
          : 'Com critério e evidência. Traga o caso concreto e o padrão esperado. Crítica genérica não é acionável.'}</p>`,
      { rodape: 'AXIS · ' + titulo }));

    // ── CAP 08 · CARREIRA ──
    const CR = CARREIRA[P], CR2 = CARREIRA[S2];
    const motivadores = CR.motivadores.concat(CR2.motivadores.slice(0, 2));
    paginas.push(pg('Capítulo 08 · Carreira e motivadores', 'O que te move',
      'Motivadores, ambiente e áreas de maior aderência',
      `${nar.carreira ? `<div class="narr">${nar.carreira}</div>` : ''}
       <div class="secao"><span>Os seus motivadores</span></div>
       <div class="motgrid">
         ${motivadores.map((m, n) => `<div class="motcell">
           <div class="motcell-n">${String(n + 1).padStart(2, '0')}</div>
           <div class="motcell-t">${esc(m)}</div></div>`).join('')}
       </div>
       <div class="secao"><span>Ambiente em que você rende mais</span></div>
       <div class="listgrid">
         ${CR.ambientes.map(x => `<div class="listcell">${esc(x)}</div>`).join('')}
       </div>
       <div class="secao"><span>Áreas de maior aderência</span></div>
       <div class="listgrid">
         ${CR.areas.map(x => `<div class="listcell">${esc(x)}</div>`).join('')}
       </div>
       <p class="obs" style="margin-top:10px">Aderência de perfil não substitui formação, experiência
       nem interesse. A lista indica onde o seu comportamento espontâneo encontra menos atrito,
       não onde você deve trabalhar.</p>`,
      { rodape: 'AXIS · ' + titulo }));

    paginas.push(pg('Capítulo 08 · Carreira e motivadores', 'Como você decide',
      'Forma e velocidade da sua tomada de decisão',
      `<div class="grid2">
        <div class="dbox"><h4>Forma</h4><p>Sua decisão tende a ser <b>${esc(dec.eixo1)}</b>.</p>
          <div class="eixo"><span>Relacional</span><div class="eixo-tr">
            <div class="eixo-p" style="left:${Math.round(dec.racional)}%"></div></div><span>Racional</span></div></div>
        <div class="dbox"><h4>Velocidade</h4><p>Sua decisão tende a ser <b>${esc(dec.eixo2)}</b>.</p>
          <div class="eixo"><span>Ponderada</span><div class="eixo-tr">
            <div class="eixo-p" style="left:${Math.round(dec.rapida)}%"></div></div><span>Rápida</span></div></div>
      </div>
      ${nar.decisao ? `<div class="narr">${nar.decisao}</div>` : ''}
      <div class="secao"><span>O que isso significa na prática</span></div>
      <div class="duocol">
        <div class="duocol-c duocol-ok"><div class="duocol-t">Onde este padrão acerta</div>
          ${(dec.rapida > dec.ponderada
            ? ['Ambiente que muda rápido e pune a demora','Crise, virada e situação sem manual',
               'Decisão reversível, em que testar custa menos que analisar','Destravar time parado esperando definição']
            : ['Decisão de alto custo ou irreversível','Contexto que exige previsão de risco',
               'Situação com muita informação a integrar','Ambiente em que erro caro é inaceitável'])
            .map((x, n) => `<div class="duocol-i"><span>${n + 1}</span>${esc(x)}</div>`).join('')}
        </div>
        <div class="duocol-c duocol-no"><div class="duocol-t">Onde ele custa caro</div>
          ${(dec.rapida > dec.ponderada
            ? ['Decisão irreversível tomada sem segunda opinião','Alternativa boa descartada por pressa',
               'Time sem tempo de acompanhar o raciocínio','Retrabalho por pular a etapa de checagem']
            : ['Oportunidade perdida por excesso de análise','Time parado esperando a sua definição',
               'Busca de certeza total onde ela não existe','Ser lido como indeciso, mesmo estando certo'])
            .map((x, n) => `<div class="duocol-i"><span>${n + 1}</span>${esc(x)}</div>`).join('')}
        </div>
      </div>
      <div class="box">${dec.rapida > dec.ponderada
        ? '<b>Um ajuste prático.</b> Separe as decisões em dois grupos: as que têm volta e as que não têm. Para o segundo grupo, imponha a si mesmo uma pausa e uma segunda opinião antes de fechar.'
        : '<b>Um ajuste prático.</b> Defina de antemão quanto de informação é suficiente para decidir em cada tipo de assunto. Sem esse limite combinado com você mesmo, a busca por certeza não tem fim.'}</div>`,
      { rodape: 'AXIS · ' + titulo }));

    // ── CAP 09 · ÍNDICES ──
    const ordemIdx = ['ITA','IPM','IDA','IPS','IIA'];
    paginas.push(pg('Capítulo 09 · Índices gerais', 'As seis leituras que cruzam as fases',
      'O que só aparece comparando uma fase com a outra',
      `<table class="tb">
        <thead><tr><th>Índice</th><th>Leitura</th><th>Valor</th><th>Faixa</th></tr></thead>
        <tbody>${ordemIdx.map(k => `<tr>
          <td><b>${k}</b></td><td>${esc(LEITURA_INDICE[k].nome)}</td>
          <td><b>${r.indices[k]}</b>/100</td><td>${esc(D.faixaIndice(r.indices[k]))}</td></tr>`).join('')}
          <tr><td><b>TCM</b></td><td>Tempo Consumido no Mapeamento</td>
            <td><b>${r.indices.TCM.minutos}</b> min</td><td>${esc(r.indices.TCM.faixa)}</td></tr>
        </tbody></table>
      <div class="box"><b>Para que servem.</b> Os índices não medem o seu perfil: medem a
      <b>qualidade e a consistência da sua resposta</b>. São eles que dizem se o retrato pode ser lido
      literalmente ou se pede cautela na interpretação.</div>`,
      { rodape: 'AXIS · ' + titulo }));

    const FAIXAS_ESC = [
      { r:'MUITO BAIXO', a:0,  b:20 }, { r:'BAIXO', a:20, b:40 },
      { r:'NORMAL', a:40, b:60 }, { r:'ALTO', a:60, b:80 }, { r:'MUITO ALTO', a:80, b:100 }
    ];

    function blocoTempo() {
      const t = r.indices.TCM;
      const leitura = t.segundos === 0
        ? 'O tempo não foi medido nesta aplicação. Isso não afeta o cálculo do perfil, apenas esta leitura.'
        : t.minutos < 8
          ? 'Tempo bem abaixo da referência. Respostas muito rápidas podem indicar leitura superficial dos itens. Vale confrontar o resultado com a sua percepção antes de decidir a partir dele.'
          : t.minutos > 25
            ? 'Tempo acima da referência. Pode indicar cuidado e reflexão, ou interrupções durante a resposta. Nenhum dos dois invalida o resultado.'
            : 'Tempo dentro do esperado, o que reforça a confiabilidade do retrato.';
      return `<div class="idx2">
        <div class="idx2-h">
          <div><div class="idx2-sig">TCM</div><div class="idx2-nome">Tempo Consumido no Mapeamento</div></div>
          <div class="idx2-vv"><b>${t.minutos}</b><span> min</span><div class="idx2-fx">${esc(t.faixa.toUpperCase())}</div></div>
        </div>
        <p class="idx2-o"><b>O que mede.</b> O tempo total gasto para concluir as quatro fases.
        A referência para este instrumento é de ${esc(t.referencia)}.</p>
        <p class="idx2-l">${esc(leitura)}</p>
        <p class="idx2-o" style="margin-top:8px">Tempo curto não invalida um resultado, assim como
        tempo longo não o valida. É mais um sinal a considerar junto com os demais índices.</p>
      </div>`;
    }

    function blocoIndice(k) {
      if (k === 'TCM') return blocoTempo();
      const v = r.indices[k], li = leituraIndice(k, v), fx = D.faixaIndice(v);
      return `<div class="idx2">
        <div class="idx2-h">
          <div><div class="idx2-sig">${k}</div><div class="idx2-nome">${esc(li.nome)}</div></div>
          <div class="idx2-vv"><b>${v}</b><span>/100</span><div class="idx2-fx">${esc(fx)}</div></div>
        </div>
        <div class="regua">
          ${FAIXAS_ESC.map(f => `<div class="regua-f ${f.r === fx ? 'on' : ''}">
            <span class="regua-r">${f.r}</span></div>`).join('')}
          <div class="regua-m" style="left:${v}%"></div>
        </div>
        <p class="idx2-o"><b>O que mede.</b> ${esc(li.oque)}</p>
        <p class="idx2-l">${esc(li.txt)}</p>
        ${nar['idx_' + k] ? `<div class="narr">${nar['idx_' + k]}</div>` : ''}
      </div>`;
    }

    // TCM entra como sexto bloco: com 5 sobrava um sozinho na última folha.
    const blocos = ordemIdx.concat(['TCM']);
    for (let i = 0; i < blocos.length; i += 2) {
      const par = blocos.slice(i, i + 2);
      paginas.push(pg('Capítulo 09 · Índices gerais',
        i === 0 ? 'Leitura índice a índice' : 'Índices gerais · continuação',
        i === 0 ? 'Onde o seu resultado caiu em cada escala' : '',
        par.map(blocoIndice).join(''), { rodape: 'AXIS · ' + titulo }));
    }

    // ── TEMPO + ENCERRAMENTO ──
    paginas.push(pg('Encerramento', 'Como usar este laudo', 'Três movimentos práticos',
      `<div class="fim">
        <div class="fim-i"><span>01</span><div><b>Confirme com quem convive com você.</b>
          Mostre os pontos fortes e as capacidades menos presentes para duas ou três pessoas que
          trabalham com você. Onde elas concordarem, você tem certeza. Onde discordarem, você tem
          a conversa mais útil do processo.</div></div>
        <div class="fim-i"><span>02</span><div><b>Escolha duas capacidades, não dez.</b>
          A tabela do capítulo 04 mostra onde você mesmo indicou maior distância entre o que é e o que
          precisaria ser. Comece pelas duas de maior distância que também importam para o seu momento.</div></div>
        <div class="fim-i"><span>03</span><div><b>Releia em seis meses.</b>
          Perfil comportamental não é fixo. Refazer a avaliação depois de um ciclo mostra o que mudou
          por desenvolvimento e o que mudou por exigência do ambiente.</div></div>
      </div>
      <div class="etica">
        <b>Nota técnica e ética.</b> Este laudo é resultado de um instrumento de autopercepção:
        retrata como ${esc(primeiro)} se descreve, não uma medida objetiva de comportamento. Os conteúdos são hipóteses de trabalho: ganham valor quando confrontados com a
        percepção de quem convive com ${esc(primeiro)} e com evidência de desempenho. Para decisões
        sobre pessoas, use este laudo como um insumo entre outros, conforme o escopo descrito no
        capítulo 01.
        <br><br>
        Instrumento desenvolvido pela AXIS Consultorias. Documento confidencial.
      </div>`, { rodape: 'AXIS · ' + titulo, cls: 'fimpg' }));

    // ── DADOS PARA OS GRÁFICOS ──
    const dados = {
      donut: { labels: r.perfil.ranking.map(k => F[k].estilo),
               data: r.perfil.ranking.map(k => r.natural[k]),
               cores: r.perfil.ranking.map(k => F[k].cor) },
      adapt: { labels: ['D','I','S','C'].map(k => F[k].estilo),
               nat: ['D','I','S','C'].map(k => r.natural[k]),
               ada: ['D','I','S','C'].map(k => r.adaptado[k]) },
      radar: { labels: D.CAPACIDADES.map(c => c.nome),
               atual: D.CAPACIDADES.map(c => r.mapaAtual[c.id]),
               desejado: D.CAPACIDADES.map(c => r.mapaDesejado[c.id]) }
    };

    return montarHTML(paginas.join('\n'), dados, nome, titulo);
  }

  // ── HTML + CSS de impressão ───────────────────────────────────────────
  function montarHTML(corpo, dados, nome, titulo) {
    const fechaScript = '<' + '/script>';
    return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>${esc(titulo)} — ${esc(nome)} — AXIS</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap" rel="stylesheet">
<style>
:root{--preto:#1F1F1F;--cinza:#4A4A4A;--cinza2:#8A8A8A;--amarelo:#C9A84C;--bege:#D8C7B8;
      --linha:#E6E3DC;--fundo:#F5F5F3;--verde:#5A8A6A;--vermelho:#B85C5C}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#9a9a98;color:var(--preto);font-size:15pt;line-height:1.7}
.pagina{width:190mm;min-height:277mm;background:#fff;margin:8mm auto;padding:16mm 15mm 14mm;
        position:relative;display:flex;flex-direction:column;box-shadow:0 2px 14px rgba(0,0,0,.25)}
.ph{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--linha);
    padding-bottom:6px;margin-bottom:16px}
.ph-cap{font-size:10.5pt;letter-spacing:1.6px;text-transform:uppercase;color:var(--cinza2)}
.ph-marca{font-family:'Montserrat',sans-serif;font-weight:800;font-size:11.5pt;color:var(--amarelo);letter-spacing:1px}
.pt{font-family:'Montserrat',sans-serif;font-weight:800;font-size:28.5pt;line-height:1.2;margin-bottom:3px}
.ps{font-size:14pt;color:var(--cinza2);margin-bottom:16px}
.pc{flex:1}
.pf{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--linha);
    padding-top:6px;margin-top:14px;font-size:10.5pt;color:var(--cinza2)}
.pf-n{font-family:'Montserrat',sans-serif;font-weight:700;color:var(--amarelo)}
h3{font-family:'Montserrat',sans-serif;font-size:16pt;margin:16px 0 7px}
h4{font-family:'Montserrat',sans-serif;font-size:14pt;margin-bottom:6px}
p{margin-bottom:9px;text-align:justify}
.destaque{font-size:16.5pt;line-height:1.65;color:var(--preto);border-left:3px solid var(--amarelo);
          padding-left:14px;margin-bottom:14px;text-align:left}
.obs{font-size:12.5pt;color:var(--cinza2)}
.lista{margin:0 0 10px 16px}
.lista li{margin-bottom:5px}
.box{background:var(--fundo);border-left:3px solid var(--amarelo);padding:14px 17px;margin:16px 0;font-size:13pt}
.narr{background:#FCFAF4;border:1px solid #EDE4CC;border-radius:6px;padding:14px 16px;margin:14px 0}
.narr p{margin-bottom:8px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.hero2{display:grid;grid-template-columns:300px 1fr;gap:22px;align-items:center;margin-bottom:16px}
/* capa */
.capa{background:var(--preto);color:#fff;justify-content:space-between;padding:22mm 18mm}
.capa-marca{font-family:'Montserrat',sans-serif;font-weight:800;font-size:25.5pt;color:var(--bege);letter-spacing:1px}
.capa-sub{font-size:9pt;letter-spacing:3px;text-transform:uppercase;color:var(--amarelo);margin-top:2px}
.capa-et{font-size:9pt;letter-spacing:3px;text-transform:uppercase;color:var(--amarelo);margin-bottom:8px}
.capa-t{font-family:'Montserrat',sans-serif;font-weight:800;font-size:37pt;line-height:1.05;color:#fff}
.capa-sigla{font-family:'Montserrat',sans-serif;font-weight:800;font-size:73.5pt;color:var(--amarelo);
            line-height:1;margin:14px 0 4px}
.capa-perfil{font-size:16pt;color:var(--bege)}
.capa-tb{width:100%;font-size:12.5pt;border-collapse:collapse}
.capa-tb td{padding:6px 0;border-bottom:1px solid rgba(216,199,184,.18);color:var(--bege)}
.capa-tb td:first-child{width:110px;color:rgba(216,199,184,.55);text-transform:uppercase;font-size:8.5pt;letter-spacing:1.2px}
.capa-conf{font-size:9pt;color:rgba(216,199,184,.5);margin-top:14px;text-align:left}
/* sumario */
.sum-i{display:flex;gap:14px;padding:9px 0;border-bottom:1px solid var(--linha)}
.sum-n{font-family:'Montserrat',sans-serif;font-weight:800;font-size:15pt;color:var(--amarelo);width:32px}
.sum-t{font-weight:600;font-size:14.5pt}
.sum-d{font-size:12.5pt;color:var(--cinza2)}
/* fatores */
.fcard{background:var(--fundo);padding:11px 13px;border-radius:0 6px 6px 0}
.fcard-l{font-family:'Montserrat',sans-serif;font-weight:800;font-size:17.5pt;line-height:1}
.fcard-n{font-weight:600;margin:2px 0 3px}
.fcard-r{font-size:12.5pt;color:var(--cinza)}
.barra{margin-bottom:13px}
.barra-top{display:flex;justify-content:space-between;font-size:12.5pt;margin-bottom:4px}
.barra-v{font-family:'Montserrat',sans-serif;font-weight:700}
.barra-tr{height:9px;background:var(--linha);border-radius:9px;overflow:hidden}
.barra-f{height:9px;border-radius:9px}
.barra-f2{font-size:8.5pt;letter-spacing:1px;color:var(--cinza2);margin-top:3px}
/* tabelas */
.tb{width:100%;border-collapse:collapse;font-size:13pt;margin:10px 0}
.tb th{text-align:left;font-size:10.5pt;letter-spacing:1.2px;text-transform:uppercase;color:var(--cinza2);
       padding:0 8px 6px 0;border-bottom:1px solid var(--linha);font-weight:600}
.tb td{padding:7px 8px 7px 0;border-bottom:1px solid var(--linha);vertical-align:middle}
.tb-cap .num{font-family:'Montserrat',sans-serif;font-weight:700;color:var(--amarelo);width:22px}
.tag{font-size:10.5pt;padding:2px 7px;border:1px solid;border-radius:20px;white-space:nowrap}
.mini{display:inline-block;width:58px;height:6px;background:var(--linha);border-radius:6px;overflow:hidden;vertical-align:middle}
.mini-f{height:6px;border-radius:6px}
.mini-v{font-family:'Montserrat',sans-serif;font-weight:700;font-size:10.5pt;margin-left:6px}
.up{color:var(--vermelho);font-weight:600}
.dn{color:var(--verde);font-weight:600}
/* capacidade */
.capbox{display:flex;align-items:center;gap:18px;background:var(--fundo);padding:14px 18px;border-radius:6px;margin-bottom:6px}
.capbox-v{font-family:'Montserrat',sans-serif;font-weight:800;font-size:39pt;line-height:1}
.capbox-v span{font-size:15pt;color:var(--cinza2)}
.capbox-f{font-size:10.5pt;letter-spacing:1.4px;font-weight:700;color:var(--cinza)}
.capbox-t{font-size:13pt;color:var(--cinza)}
.capx{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--linha)}
.capx:last-of-type{border-bottom:none}
.capx-n{font-family:'Montserrat',sans-serif;font-weight:800;font-size:15pt;color:var(--linha);
        line-height:1;padding-top:2px;width:26px;flex-shrink:0}
.capx-b{flex:1;min-width:0}
.capx-h{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.capx-h b{font-size:15pt;letter-spacing:-.1px}
.capx-fx{font-size:8pt;letter-spacing:1.2px;color:var(--cinza2);margin-left:auto}
.capx-v{font-family:'Montserrat',sans-serif;font-weight:800;font-size:16pt;line-height:1;min-width:30px;text-align:right}
.capx-tr{height:4px;background:var(--linha);border-radius:4px;position:relative;margin-bottom:6px}
.capx-f{height:4px;border-radius:4px}
.capx-alvo{position:absolute;top:-3px;width:2px;height:10px;background:var(--cinza2);opacity:.5;border-radius:2px}
.capx-d{font-size:12.5pt;color:var(--cinza);margin-bottom:5px;text-align:left;line-height:1.5}
.capx-a{display:flex;flex-wrap:wrap;gap:4px}
.capx-a span{font-size:11pt;color:var(--cinza2);background:var(--fundo);padding:2px 7px;border-radius:20px}
.capx-gap{font-size:11.5pt;color:var(--amarelo);margin-top:5px;font-weight:600}
.capx-leg{font-size:9pt;color:var(--cinza2);text-align:center;margin-top:10px;font-style:italic}
/* secoes e grids premium */
.secao{display:flex;align-items:center;gap:10px;margin:18px 0 10px}
.secao span{font-family:'Montserrat',sans-serif;font-weight:700;font-size:8.5pt;letter-spacing:1.6px;
            text-transform:uppercase;color:var(--cinza2);white-space:nowrap}
.secao:after{content:'';flex:1;height:1px;background:var(--linha)}
.dimgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.dimcell{background:var(--fundo);border-radius:6px;padding:10px 12px}
.dimcell-v{font-family:'Montserrat',sans-serif;font-weight:800;font-size:22pt;line-height:1}
.dimcell-n{font-size:12pt;color:var(--cinza);margin:2px 0 6px;line-height:1.3;min-height:22px}
.dimcell-tr{height:3px;background:#DDD9D1;border-radius:3px}
.dimcell-f{height:3px;border-radius:3px}
.duocol{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px}
.duocol-c{border-radius:6px;padding:12px 14px}
.duocol-ok{background:rgba(90,138,106,.06);border-left:3px solid var(--verde)}
.duocol-no{background:rgba(184,92,92,.05);border-left:3px solid var(--vermelho)}
.duocol-t{font-family:'Montserrat',sans-serif;font-weight:700;font-size:12.5pt;margin-bottom:8px}
.duocol-i{display:flex;gap:9px;font-size:12.5pt;line-height:1.45;margin-bottom:7px;color:var(--cinza)}
.duocol-i span{font-family:'Montserrat',sans-serif;font-weight:800;font-size:9pt;color:var(--cinza2);
               flex-shrink:0;width:12px}
.motgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.motcell{border:1px solid var(--linha);border-radius:6px;padding:10px 12px}
.motcell-n{font-family:'Montserrat',sans-serif;font-weight:800;font-size:11.5pt;color:var(--amarelo);line-height:1}
.motcell-t{font-size:13pt;font-weight:600;margin-top:3px;line-height:1.3}
.listgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.listcell{font-size:13pt;background:var(--fundo);border-radius:5px;padding:8px 12px;color:var(--cinza);
          border-left:2px solid var(--bege)}
/* lideranca */
.lbox{border-radius:6px;padding:13px 15px}
.lbox-ok{background:rgba(90,138,106,.07);border-left:3px solid var(--verde)}
.lbox-at{background:rgba(184,92,92,.06);border-left:3px solid var(--vermelho)}
.lbox .lista{font-size:13pt}
/* carreira */
.chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:6px}
.chip{font-size:10.5pt;background:var(--fundo);padding:6px 12px;border-radius:20px}
.chip b{color:var(--amarelo);font-family:'Montserrat',sans-serif;margin-right:4px}
.dbox{background:var(--fundo);border-radius:6px;padding:13px 15px}
.eixo{display:flex;align-items:center;gap:8px;font-size:9pt;color:var(--cinza2);margin-top:10px}
.eixo-tr{flex:1;height:5px;background:#DDD;border-radius:5px;position:relative}
.eixo-p{position:absolute;top:-4px;width:13px;height:13px;border-radius:50%;background:var(--amarelo);
        transform:translateX(-50%);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}
/* indices */
.idx2{border:1px solid var(--linha);border-radius:8px;padding:16px 18px;margin-bottom:14px}
.idx2-h{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
.idx2-sig{font-family:'Montserrat',sans-serif;font-weight:800;font-size:10.5pt;color:var(--amarelo);letter-spacing:1.5px}
.idx2-nome{font-family:'Montserrat',sans-serif;font-weight:700;font-size:15.5pt;margin-top:1px}
.idx2-vv{text-align:right;line-height:1}
.idx2-vv b{font-family:'Montserrat',sans-serif;font-weight:800;font-size:34.5pt;color:var(--amarelo)}
.idx2-vv span{font-size:12.5pt;color:var(--cinza2)}
.idx2-fx{font-size:8.5pt;letter-spacing:1.2px;color:var(--cinza);font-weight:700;margin-top:3px}
.regua{display:flex;gap:2px;position:relative;margin-bottom:14px;padding-bottom:14px}
.regua-f{flex:1;height:7px;background:var(--linha);border-radius:2px;position:relative}
.regua-f.on{background:var(--amarelo)}
.regua-r{position:absolute;top:10px;left:0;right:0;text-align:center;font-size:8.5pt;
         letter-spacing:.4px;color:var(--cinza2);white-space:nowrap}
.regua-f.on .regua-r{color:var(--preto);font-weight:700}
.regua-m{position:absolute;top:-4px;width:3px;height:15px;background:var(--preto);border-radius:3px;
         transform:translateX(-50%);border:1px solid #fff}
.idx2-o{font-size:12.5pt;color:var(--cinza);margin-bottom:7px}
.idx2-l{font-size:13pt;margin-bottom:0}
.idxbig{margin:8px 0 18px}
.idxbig-v{font-family:'Montserrat',sans-serif;font-weight:800;font-size:50.5pt;color:var(--amarelo);line-height:1}
.idxbig-tr{height:11px;background:var(--linha);border-radius:11px;overflow:hidden;margin:8px 0 4px}
.idxbig-f{height:11px;border-radius:11px;background:var(--amarelo)}
.idxbig-esc{display:flex;justify-content:space-between;font-size:8.5pt;color:var(--cinza2)}
/* fim */
.fim-i{display:flex;gap:14px;margin-bottom:16px}
.fim-i span{font-family:'Montserrat',sans-serif;font-weight:800;font-size:17.5pt;color:var(--amarelo);width:34px}
.etica{background:var(--fundo);border-radius:6px;padding:16px 18px;font-size:12pt;color:var(--cinza);
       line-height:1.7;margin-top:18px}
.refs{font-size:12pt;color:var(--cinza);line-height:1.7}
.refs p{margin-bottom:6px;text-align:left;padding-left:16px;text-indent:-16px}
.leg{text-align:center;font-size:12.5pt;color:var(--cinza2);margin-top:6px}
.leg-a,.leg-b{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:4px}
.leg-a{background:var(--amarelo)}
.leg-b{background:#4A7A8A}
canvas{max-width:100%}
/* impressao */
@page{size:A4;margin:0}
@media print{
  body{background:#fff}
  .pagina{margin:0;box-shadow:none;page-break-after:always;width:210mm;min-height:297mm;padding:16mm 15mm 14mm}
  .capa{padding:22mm 18mm}
  .fimpg{page-break-after:auto}
  .no-print{display:none !important}
}
.barra-topo{position:fixed;top:0;left:0;right:0;background:var(--preto);color:#fff;padding:10px 18px;
            display:flex;align-items:center;gap:12px;z-index:99;font-size:11pt}
.barra-topo b{font-family:'Montserrat',sans-serif;color:var(--amarelo)}
.btn-imp{margin-left:auto;background:var(--amarelo);color:var(--preto);border:none;padding:8px 18px;
         border-radius:5px;font:inherit;font-weight:700;cursor:pointer}
body{padding-top:44px}
@media print{body{padding-top:0}}
</style></head>
<body>
<div class="barra-topo no-print">
  <b>AXIS</b> <span>${esc(titulo)} · ${esc(nome)}</span>
  <button class="btn-imp" onclick="window.print()">Salvar em PDF / Imprimir</button>
</div>
${corpo}
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js">${fechaScript}
<script>
(function(){
  var D = ${JSON.stringify(dados)};
  function pronto(){
    if (typeof Chart === 'undefined') { setTimeout(pronto, 120); return; }
    Chart.defaults.font.family = 'Inter';
    Chart.defaults.animation = false;
    var d1 = document.getElementById('g-donut');
    if (d1) new Chart(d1, { type:'doughnut',
      data:{ labels:D.donut.labels, datasets:[{ data:D.donut.data, backgroundColor:D.donut.cores, borderWidth:0 }] },
      options:{ cutout:'60%', responsive:false,
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, font:{size:10} } } } } });

    var d2 = document.getElementById('g-adapt');
    if (d2) new Chart(d2, { type:'bar',
      data:{ labels:D.adapt.labels, datasets:[
        { label:'Natural', data:D.adapt.nat, backgroundColor:'#C9A84C' },
        { label:'Exigido pelo contexto', data:D.adapt.ada, backgroundColor:'#4A7A8A' }] },
      options:{ responsive:false, scales:{ y:{ beginAtZero:true, max:60, ticks:{font:{size:9}} },
        x:{ ticks:{font:{size:9}} } },
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:9, font:{size:10} } } } } });

    var d3 = document.getElementById('g-radar');
    if (d3) new Chart(d3, { type:'radar',
      data:{ labels:D.radar.labels, datasets:[
        { label:'Como está', data:D.radar.atual, borderColor:'#C9A84C',
          backgroundColor:'rgba(201,168,76,.18)', borderWidth:2, pointRadius:2 },
        { label:'Como deveria estar', data:D.radar.desejado, borderColor:'#4A7A8A',
          backgroundColor:'rgba(74,122,138,.08)', borderWidth:1.5, borderDash:[4,3], pointRadius:1.5 }] },
      options:{ responsive:false,
        scales:{ r:{ min:0, max:100, ticks:{ stepSize:20, font:{size:7} },
                     pointLabels:{ font:{size:8} } } },
        plugins:{ legend:{ display:false } } } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pronto);
  else pronto();
})();
${fechaScript}
</body></html>`;
  }

  function abrir(r, meta, nar) {
    const html = gerar(r, meta, nar);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  global.DISC_LAUDO = { gerar, abrir, faixaCap, leituraIndice, LIDERANCA, CARREIRA };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DISC_LAUDO;

})(typeof window !== 'undefined' ? window : globalThis);
