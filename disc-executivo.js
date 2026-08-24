/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC EXECUTIVO — instrumento e motor de cálculo
   ───────────────────────────────────────────────────────────────────────
   Instrumento autoral da AXIS Consultorias. A arquitetura de 4 fases e a
   camada de índices derivados seguem a lógica psicométrica descrita em
   RASTREIO_ILG_DISC.md / RASTREIO_ILG_LAUDO.md; itens, capacidades e
   textos são originais da AXIS.

   ARQUITETURA
     Fase 1  ranking forçado (ipsativo)      12 grupos x 4 adjetivos
     Fase 2  escala livre de intensidade     24 afirmativas, 1 a 9
     Fase 3  eixos bipolares de desempenho   24 eixos, 1 a 21 (centro 11)
     Fase 4  características a reduzir       48 itens, opcional

   POR QUE 4 FASES: cada uma existe para ser cruzada com outra.
     F1 x F2  → IDA (discrepância) e IPS (positividade seletiva)
     F1 + F2  → mapa de capacidades ATUAL + composição do perfil
     F3       → mapa DESEJADO e exigência do meio
     F3 + F4  → IPM (pontos de melhoria)
   Um questionário de fase única não produz nenhum desses índices.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // ── FATORES ───────────────────────────────────────────────────────────
  // Nomenclatura padrão do DISC (Dominante, Influente, Estável, Analítico),
  // a mesma usada no mercado: o cliente que já fez outro teste reconhece.
  const FATORES = {
    D: { letra:'D', estilo:'Dominante', indice:'DOMINANTE', cor:'#B85C5C',
         resumo:'Foco em decisão, ritmo e resultado.' },
    I: { letra:'I', estilo:'Influente', indice:'INFLUENTE', cor:'#C9A84C',
         resumo:'Comunicação, entusiasmo e influência.' },
    S: { letra:'S', estilo:'Estável',   indice:'ESTÁVEL',   cor:'#5A8A6A',
         resumo:'Constância, escuta e cooperação.' },
    C: { letra:'C', estilo:'Analítico', indice:'ANALÍTICO', cor:'#4A7A8A',
         resumo:'Método, rigor e qualidade.' }
  };

  // ── 24 CAPACIDADES (6 por fator) ──────────────────────────────────────
  // id, nome, fator, definição e atributos (subcomponentes que aparecem no laudo)
  const CAPACIDADES = [
    // ── DOMINANTE (D) ──
    { id:'comando', nome:'Liderança', fator:'D',
      def:'Capacidade de assumir a frente, dirigir pessoas e situações e sustentar a posição sob pressão.',
      attrs:['Assumir a condução quando ninguém assume','Sustentar decisão impopular','Dar direção clara sob pressão'] },
    { id:'ousadia', nome:'Ousadia', fator:'D',
      def:'Disposição para agir diante de risco e incerteza, sem esperar garantia completa.',
      attrs:['Agir com informação incompleta','Expor-se a risco calculado','Iniciar antes da certeza'] },
    { id:'objetividade', nome:'Objetividade', fator:'D',
      def:'Capacidade de ir ao ponto, separar o essencial do acessório e decidir sem rodeio.',
      attrs:['Cortar o supérfluo','Comunicar de forma direta','Focar no que muda o resultado'] },
    { id:'urgencia', nome:'Senso de urgência', fator:'D',
      def:'Capacidade de reconhecer o que não pode esperar e agir de imediato.',
      attrs:['Reagir rápido a problema','Priorizar pelo prazo','Encurtar o tempo entre decidir e fazer'] },
    { id:'autonomia', nome:'Autonomia', fator:'D',
      def:'Capacidade de operar e decidir sem depender de validação externa.',
      attrs:['Decidir sozinho quando necessário','Assumir responsabilidade pelo próprio resultado','Trabalhar sem supervisão'] },
    { id:'competitividade', nome:'Competitividade', fator:'D',
      def:'Impulso de superar marcas, vencer disputas e elevar o próprio padrão.',
      attrs:['Buscar superar resultado anterior','Sustentar disputa sem desistir','Transformar meta em desafio pessoal'] },

    // ── INFLUENTE (I) ──
    { id:'expressividade', nome:'Expressividade', fator:'I',
      def:'Facilidade de se expor, comunicar ideias e ocupar espaço em grupo.',
      attrs:['Falar em público sem travar','Expressar ideia de forma viva','Iniciar conversa com desconhecido'] },
    { id:'entusiasmo', nome:'Entusiasmo', fator:'I',
      def:'Capacidade de gerar energia e disposição em si e nas pessoas ao redor.',
      attrs:['Contagiar o grupo','Sustentar ânimo em fase difícil','Transformar tarefa em causa'] },
    { id:'carisma', nome:'Carisma', fator:'I',
      def:'Capacidade de atrair, cativar e criar simpatia com naturalidade.',
      attrs:['Gerar simpatia rapidamente','Ser lembrado positivamente','Abrir portas pelo vínculo'] },
    { id:'articulacao', nome:'Articulação social', fator:'I',
      def:'Capacidade de construir e movimentar rede de relações a favor de um objetivo.',
      attrs:['Conectar pessoas entre si','Manter rede ativa','Acessar quem decide'] },
    { id:'persuasao', nome:'Persuasão', fator:'I',
      def:'Capacidade de influenciar posições e conduzir o outro a uma decisão.',
      attrs:['Construir argumento que convence','Negociar sem romper relação','Mudar opinião estabelecida'] },
    { id:'adaptabilidade', nome:'Adaptabilidade', fator:'I',
      def:'Facilidade de lidar com mudança, novidade e cenário não planejado.',
      attrs:['Recompor plano rapidamente','Operar bem no imprevisto','Trocar de método sem resistência'] },

    // ── ESTÁVEL (S) ──
    { id:'escuta', nome:'Escuta empática', fator:'S',
      def:'Capacidade de ouvir de verdade e compreender a perspectiva do outro antes de responder.',
      attrs:['Ouvir sem interromper','Compreender antes de julgar','Reconhecer o que o outro sente'] },
    { id:'serenidade', nome:'Serenidade', fator:'S',
      def:'Capacidade de manter calma e tempo interno estável diante de pressão e demora.',
      attrs:['Manter a calma no conflito','Tolerar ritmo mais lento','Não reagir no impulso'] },
    { id:'constancia', nome:'Constância', fator:'S',
      def:'Capacidade de sustentar esforço ao longo do tempo até concluir.',
      attrs:['Terminar o que começa','Manter ritmo sem supervisão','Insistir depois do revés'] },
    { id:'cooperacao', nome:'Cooperação', fator:'S',
      def:'Disposição para ceder, conciliar e construir acordo em vez de impor.',
      attrs:['Ceder quando faz sentido','Buscar acordo no conflito','Priorizar o resultado do grupo'] },
    { id:'apoio', nome:'Apoio', fator:'S',
      def:'Disponibilidade real para amparar e sustentar quem precisa.',
      attrs:['Estar disponível quando procurado','Sustentar quem está em dificuldade','Assumir parte da carga alheia'] },
    { id:'previsibilidade', nome:'Previsibilidade', fator:'S',
      def:'Consistência de comportamento que torna a pessoa confiável e antecipável.',
      attrs:['Agir de forma coerente ao longo do tempo','Cumprir o combinado','Ser referência estável para o time'] },

    // ── ANALÍTICO (C) ──
    { id:'rigor', nome:'Rigor analítico', fator:'C',
      def:'Capacidade de examinar com lógica, questionar premissa e decidir por evidência.',
      attrs:['Checar antes de aceitar','Separar fato de opinião','Sustentar conclusão com dado'] },
    { id:'detalhe', nome:'Atenção ao detalhe', fator:'C',
      def:'Capacidade de perceber o que escapa e evitar erro por descuido.',
      attrs:['Notar inconsistência','Revisar antes de entregar','Perceber o que os outros deixam passar'] },
    { id:'metodo', nome:'Método', fator:'C',
      def:'Capacidade de organizar processo, padronizar e manter controle do que é feito.',
      attrs:['Estruturar o caminho antes de andar','Manter registro e rastreabilidade','Padronizar o que se repete'] },
    { id:'planejamento', nome:'Planejamento', fator:'C',
      def:'Capacidade de antecipar cenário, prever obstáculo e preparar o passo seguinte.',
      attrs:['Antecipar o que pode dar errado','Sequenciar etapas','Preparar plano alternativo'] },
    { id:'cautela', nome:'Cautela', fator:'C',
      def:'Capacidade de ponderar risco e evitar exposição desnecessária.',
      attrs:['Avaliar risco antes de agir','Evitar exposição desnecessária','Pesar consequência de médio prazo'] },
    { id:'disciplina', nome:'Disciplina', fator:'C',
      def:'Capacidade de seguir o que foi definido mesmo sem vontade ou cobrança.',
      attrs:['Cumprir rotina sem cobrança','Seguir o combinado','Sustentar padrão de qualidade'] }
  ];

  const CAP_POR_ID = {};
  CAPACIDADES.forEach(c => { CAP_POR_ID[c.id] = c; });

  // ── FASE 1 — ranking forçado ──────────────────────────────────────────
  // 12 grupos x 4 adjetivos (um de cada fator). Cada capacidade aparece
  // exatamente 2 vezes → 24 capacidades x 2 = 48 slots.
  const FASE1 = [
    { g:1,  itens:[ {adj:'Decidido',      cap:'comando'},        {adj:'Comunicativo',   cap:'expressividade'}, {adj:'Sereno',        cap:'serenidade'},     {adj:'Criterioso',   cap:'rigor'} ] },
    { g:2,  itens:[ {adj:'Ousado',        cap:'ousadia'},        {adj:'Entusiasmado',   cap:'entusiasmo'},     {adj:'Constante',     cap:'constancia'},     {adj:'Detalhista',   cap:'detalhe'} ] },
    { g:3,  itens:[ {adj:'Direto',        cap:'objetividade'},   {adj:'Cativante',      cap:'carisma'},        {adj:'Conciliador',   cap:'cooperacao'},     {adj:'Metódico',     cap:'metodo'} ] },
    { g:4,  itens:[ {adj:'Ágil',          cap:'urgencia'},       {adj:'Articulado',     cap:'articulacao'},    {adj:'Disponível',    cap:'apoio'},          {adj:'Planejador',   cap:'planejamento'} ] },
    { g:5,  itens:[ {adj:'Independente',  cap:'autonomia'},      {adj:'Persuasivo',     cap:'persuasao'},      {adj:'Previsível',    cap:'previsibilidade'},{adj:'Cauteloso',    cap:'cautela'} ] },
    { g:6,  itens:[ {adj:'Competitivo',   cap:'competitividade'},{adj:'Flexível',       cap:'adaptabilidade'}, {adj:'Acolhedor',     cap:'escuta'},         {adj:'Disciplinado', cap:'disciplina'} ] },
    { g:7,  itens:[ {adj:'Determinado',   cap:'comando'},        {adj:'Expressivo',     cap:'expressividade'}, {adj:'Paciente',      cap:'serenidade'},     {adj:'Analítico',    cap:'rigor'} ] },
    { g:8,  itens:[ {adj:'Arrojado',      cap:'ousadia'},        {adj:'Motivador',      cap:'entusiasmo'},     {adj:'Persistente',   cap:'constancia'},     {adj:'Minucioso',    cap:'detalhe'} ] },
    { g:9,  itens:[ {adj:'Objetivo',      cap:'objetividade'},   {adj:'Simpático',      cap:'carisma'},        {adj:'Colaborativo',  cap:'cooperacao'},     {adj:'Organizado',   cap:'metodo'} ] },
    { g:10, itens:[ {adj:'Imediatista',   cap:'urgencia'},       {adj:'Sociável',       cap:'articulacao'},    {adj:'Prestativo',    cap:'apoio'},          {adj:'Previdente',   cap:'planejamento'} ] },
    { g:11, itens:[ {adj:'Autossuficiente',cap:'autonomia'},     {adj:'Convincente',    cap:'persuasao'},      {adj:'Consistente',   cap:'previsibilidade'},{adj:'Prudente',     cap:'cautela'} ] },
    { g:12, itens:[ {adj:'Desafiador',    cap:'competitividade'},{adj:'Adaptável',      cap:'adaptabilidade'}, {adj:'Compreensivo',  cap:'escuta'},         {adj:'Regrado',      cap:'disciplina'} ] }
  ];

  // ── FASE 2 — intensidade livre (1 a 9) ────────────────────────────────
  // 24 afirmativas, uma por capacidade. Escala livre: a pessoa pode marcar
  // o máximo em tudo. É essa liberdade que alimenta o IPS e o IDA.
  const FASE2 = [
    { cap:'comando',         txt:'Assumo naturalmente a condução quando um grupo precisa de direção.' },
    { cap:'ousadia',         txt:'Prefiro agir e corrigir no caminho a esperar ter todas as garantias.' },
    { cap:'objetividade',    txt:'Vou direto ao ponto, mesmo quando o assunto é desconfortável.' },
    { cap:'urgencia',        txt:'Quando percebo um problema, ajo imediatamente.' },
    { cap:'autonomia',       txt:'Trabalho melhor quando tenho liberdade para decidir sozinho(a).' },
    { cap:'competitividade', txt:'Me motiva superar resultados, meus ou dos outros.' },
    { cap:'expressividade',  txt:'Falo com facilidade em público e não me incomodo de aparecer.' },
    { cap:'entusiasmo',      txt:'Costumo contagiar as pessoas ao redor com minha energia.' },
    { cap:'carisma',         txt:'As pessoas costumam simpatizar comigo rapidamente.' },
    { cap:'articulacao',     txt:'Tenho facilidade para construir e manter uma rede ampla de contatos.' },
    { cap:'persuasao',       txt:'Consigo convencer pessoas e mudar posições com frequência.' },
    { cap:'adaptabilidade',  txt:'Lido bem com mudanças e situações que fogem do planejado.' },
    { cap:'escuta',          txt:'Ouço com atenção real antes de responder ou opinar.' },
    { cap:'serenidade',      txt:'Mantenho a calma mesmo sob pressão ou diante de demora.' },
    { cap:'constancia',      txt:'Termino o que começo, mesmo quando perde a novidade.' },
    { cap:'cooperacao',      txt:'Prefiro construir acordo a impor minha posição.' },
    { cap:'apoio',           txt:'Estou disponível quando alguém precisa de ajuda, mesmo sem me pedirem.' },
    { cap:'previsibilidade', txt:'As pessoas sabem o que esperar de mim: sou coerente ao longo do tempo.' },
    { cap:'rigor',           txt:'Questiono premissas e só aceito uma conclusão com evidência.' },
    { cap:'detalhe',         txt:'Percebo detalhes e inconsistências que escapam aos outros.' },
    { cap:'metodo',          txt:'Organizo processo e mantenho registro do que é feito.' },
    { cap:'planejamento',    txt:'Antecipo o que pode dar errado e preparo alternativa.' },
    { cap:'cautela',         txt:'Avalio bem o risco antes de me expor ou expor a equipe.' },
    { cap:'disciplina',      txt:'Cumpro o que foi definido mesmo sem vontade ou cobrança.' }
  ];

  // ── FASE 3 — eixos bipolares de desempenho (1 a 21, centro 11) ────────
  // Pergunta: "o que eu precisaria ajustar para ter um desempenho melhor?"
  // Centro = já está adequado. Alimenta o mapa DESEJADO e a exigência do meio.
  const FASE3 = [
    { cap:'comando',         cima:'Deveria assumir mais a frente e dirigir mais',      baixo:'Deveria dirigir menos e abrir mais espaço' },
    { cap:'ousadia',         cima:'Deveria arriscar mais',                             baixo:'Deveria arriscar menos e ir com mais calma' },
    { cap:'objetividade',    cima:'Deveria ser mais direto(a) e objetivo(a)',          baixo:'Deveria ser menos direto(a) e mais cuidadoso(a) na forma' },
    { cap:'urgencia',        cima:'Deveria agir com mais rapidez',                     baixo:'Deveria agir com menos pressa' },
    { cap:'autonomia',       cima:'Deveria decidir mais por conta própria',            baixo:'Deveria envolver mais gente nas decisões' },
    { cap:'competitividade', cima:'Deveria ser mais competitivo(a)',                   baixo:'Não estou precisando ser tão competitivo(a)' },
    { cap:'expressividade',  cima:'Deveria me expor e me comunicar mais',              baixo:'Deveria me expor menos e ser mais discreto(a)' },
    { cap:'entusiasmo',      cima:'Deveria demonstrar mais entusiasmo',                baixo:'Não estou precisando de tanto entusiasmo' },
    { cap:'carisma',         cima:'Deveria investir mais em cativar as pessoas',       baixo:'Não estou precisando ser tão cativante' },
    { cap:'articulacao',     cima:'Deveria ampliar mais minha rede de relações',       baixo:'Não estou precisando ampliar minha rede' },
    { cap:'persuasao',       cima:'Deveria ser mais persuasivo(a)',                    baixo:'Não estou precisando ser tão persuasivo(a)' },
    { cap:'adaptabilidade',  cima:'Deveria ser mais flexível com mudanças',            baixo:'Deveria ser menos flexível e sustentar mais o plano' },
    { cap:'escuta',          cima:'Deveria ouvir mais e me colocar no lugar do outro', baixo:'Deveria ouvir menos e decidir com mais independência' },
    { cap:'serenidade',      cima:'Deveria ser mais calmo(a) e paciente',              baixo:'Deveria ser menos contido(a) e reagir mais' },
    { cap:'constancia',      cima:'Deveria ter mais persistência',                     baixo:'Não estou precisando de tanta persistência' },
    { cap:'cooperacao',      cima:'Deveria ceder e conciliar mais',                    baixo:'Deveria ceder menos e sustentar mais minha posição' },
    { cap:'apoio',           cima:'Deveria me colocar mais à disposição dos outros',   baixo:'Deveria me colocar menos à disposição e cuidar mais de mim' },
    { cap:'previsibilidade', cima:'Deveria ser mais consistente e previsível',         baixo:'Não estou precisando de tanta previsibilidade' },
    { cap:'rigor',           cima:'Deveria analisar com mais rigor',                   baixo:'Não estou precisando de tanto rigor analítico' },
    { cap:'detalhe',         cima:'Deveria prestar mais atenção aos detalhes',         baixo:'Deveria me prender menos a detalhes' },
    { cap:'metodo',          cima:'Deveria ser mais organizado(a) e metódico(a)',      baixo:'Não estou precisando de tanto método' },
    { cap:'planejamento',    cima:'Deveria planejar mais antes de agir',               baixo:'Deveria planejar menos e agir com mais rapidez' },
    { cap:'cautela',         cima:'Deveria ser mais cauteloso(a)',                     baixo:'Deveria ser menos cauteloso(a) e mais audacioso(a)' },
    { cap:'disciplina',      cima:'Deveria ser mais disciplinado(a)',                  baixo:'Não estou precisando de tanta disciplina' }
  ];

  // ── FASE 4 — características a reduzir (48, opcional) ─────────────────
  // Os polos em excesso de cada fator. Alimenta o IPM.
  const FASE4 = [
    // D em excesso
    { id:'autoritario',    txt:'menos autoritário(a)',      fator:'D' },
    { id:'intimidante',    txt:'menos intimidante',         fator:'D' },
    { id:'impaciente',     txt:'menos impaciente',          fator:'D' },
    { id:'ríspido',        txt:'menos ríspido(a)',          fator:'D' },
    { id:'centralizador',  txt:'menos centralizador(a)',    fator:'D' },
    { id:'teimoso',        txt:'menos teimoso(a)',          fator:'D' },
    { id:'precipitado',    txt:'menos precipitado(a)',      fator:'D' },
    { id:'insensivel',     txt:'menos insensível',          fator:'D' },
    { id:'controlador',    txt:'menos controlador(a)',      fator:'D' },
    { id:'competitivo_ex', txt:'menos competitivo(a)',      fator:'D' },
    { id:'intolerante',    txt:'menos intolerante',         fator:'D' },
    { id:'agressivo',      txt:'menos agressivo(a)',        fator:'D' },
    // I em excesso
    { id:'disperso',       txt:'menos disperso(a)',         fator:'I' },
    { id:'falante',        txt:'menos falante',             fator:'I' },
    { id:'superficial',    txt:'menos superficial',         fator:'I' },
    { id:'desorganizado',  txt:'menos desorganizado(a)',    fator:'I' },
    { id:'impulsivo',      txt:'menos impulsivo(a)',        fator:'I' },
    { id:'inconstante',    txt:'menos inconstante',         fator:'I' },
    { id:'exibido',        txt:'menos exibido(a)',          fator:'I' },
    { id:'desatento',      txt:'menos desatento(a)',        fator:'I' },
    { id:'otimista_ex',    txt:'menos otimista demais',     fator:'I' },
    { id:'informal',       txt:'menos informal',            fator:'I' },
    { id:'esquecido',      txt:'menos esquecido(a)',        fator:'I' },
    { id:'emotivo',        txt:'menos emotivo(a)',          fator:'I' },
    // S em excesso
    { id:'acomodado',      txt:'menos acomodado(a)',        fator:'S' },
    { id:'lento',          txt:'menos lento(a)',            fator:'S' },
    { id:'passivo',        txt:'menos passivo(a)',          fator:'S' },
    { id:'permissivo',     txt:'menos permissivo(a)',       fator:'S' },
    { id:'evitativo',      txt:'menos evitativo(a) no conflito', fator:'S' },
    { id:'dependente',     txt:'menos dependente de aprovação',  fator:'S' },
    { id:'resistente',     txt:'menos resistente a mudança',fator:'S' },
    { id:'previsivel_ex',  txt:'menos previsível',          fator:'S' },
    { id:'submisso',       txt:'menos submisso(a)',         fator:'S' },
    { id:'indeciso',       txt:'menos indeciso(a)',         fator:'S' },
    { id:'conformado',     txt:'menos conformado(a)',       fator:'S' },
    { id:'reservado',      txt:'menos reservado(a)',        fator:'S' },
    // C em excesso
    { id:'perfeccionista', txt:'menos perfeccionista',      fator:'C' },
    { id:'critico',        txt:'menos crítico(a)',          fator:'C' },
    { id:'rigido',         txt:'menos rígido(a)',           fator:'C' },
    { id:'burocratico',    txt:'menos burocrático(a)',      fator:'C' },
    { id:'pessimista',     txt:'menos pessimista',          fator:'C' },
    { id:'distante',       txt:'menos distante',            fator:'C' },
    { id:'lento_decidir',  txt:'menos lento(a) para decidir', fator:'C' },
    { id:'desconfiado',    txt:'menos desconfiado(a)',      fator:'C' },
    { id:'preocupado',     txt:'menos preocupado(a)',       fator:'C' },
    { id:'detalhista_ex',  txt:'menos detalhista',          fator:'C' },
    { id:'inflexivel',     txt:'menos inflexível',          fator:'C' },
    { id:'conservador',    txt:'menos conservador(a)',      fator:'C' }
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // MOTOR DE CÁLCULO
  // ═══════════════════════════════════════════════════════════════════════

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const media = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const r1 = v => Math.round(v * 10) / 10;

  /**
   * Calcula o resultado completo.
   * @param {Object} r respostas
   *   r.f1  {1:['cap','cap','cap','cap'], ...}  ordem do 1º ao 4º por grupo
   *   r.f2  {cap: 1..9}
   *   r.f3  {cap: 1..21}
   *   r.f4  [idsMarcados]
   *   r.tempoSegundos
   */
  function calcular(r) {
    const f1 = r.f1 || {}, f2 = r.f2 || {}, f3 = r.f3 || {}, f4 = r.f4 || [];

    // ── FASE 1 → pontos por capacidade e composição do PERFIL NATURAL ──
    // 1º lugar = 4 pts ... 4º = 1 pt. Cada grupo soma 10. 12 grupos = 120.
    // Cada capacidade aparece 2x → 2 a 8 pts.
    const ptsCap = {}, ptsFator = { D:0, I:0, S:0, C:0 };
    CAPACIDADES.forEach(c => { ptsCap[c.id] = 0; });
    FASE1.forEach(grupo => {
      const ordem = f1[grupo.g] || [];
      ordem.forEach((capId, i) => {
        const p = 4 - i;                 // 4,3,2,1
        if (ptsCap[capId] === undefined) return;
        ptsCap[capId] += p;
        ptsFator[CAP_POR_ID[capId].fator] += p;
      });
    });

    // Composição = distribuição ipsativa, já soma 100 por construção
    const totalF1 = ptsFator.D + ptsFator.I + ptsFator.S + ptsFator.C || 1;
    const natural = {};
    ['D','I','S','C'].forEach(k => { natural[k] = r1(ptsFator[k] / totalF1 * 100); });

    // ── FASE 2 → intensidade declarada ──────────────────────────────────
    // capF2 em 0..100. Fator = média das suas 6 capacidades.
    const capF2 = {}, fatorF2bruto = { D:[], I:[], S:[], C:[] };
    CAPACIDADES.forEach(c => {
      const v = clamp(Number(f2[c.id]) || 5, 1, 9);
      const pct = (v - 1) / 8 * 100;
      capF2[c.id] = pct;
      fatorF2bruto[c.fator].push(pct);
    });
    const fatorF2 = {};
    ['D','I','S','C'].forEach(k => { fatorF2[k] = media(fatorF2bruto[k]); });
    // normaliza para somar 100, para poder comparar com a fase 1
    const somaF2 = fatorF2.D + fatorF2.I + fatorF2.S + fatorF2.C || 1;
    const declarado = {};
    ['D','I','S','C'].forEach(k => { declarado[k] = r1(fatorF2[k] / somaF2 * 100); });

    // ── MAPA ATUAL das 24 capacidades (0 a 100) ─────────────────────────
    // 60% ipsativo (resistente a inflação) + 40% intensidade declarada.
    const capF1 = {}, mapaAtual = {};
    CAPACIDADES.forEach(c => {
      capF1[c.id] = (ptsCap[c.id] - 2) / 6 * 100;      // 2..8 → 0..100
      mapaAtual[c.id] = Math.round(clamp(0.6 * capF1[c.id] + 0.4 * capF2[c.id], 0, 100));
    });

    // ── FASE 3 → MAPA DESEJADO e exigência do meio ──────────────────────
    // v 1..21, centro 11. delta = (v-11)/10 * 50 → -50..+50
    const mapaDesejado = {}, gap = {};
    CAPACIDADES.forEach(c => {
      const v = clamp(Number(f3[c.id]) || 11, 1, 21);
      const delta = (v - 11) / 10 * 50;
      mapaDesejado[c.id] = Math.round(clamp(mapaAtual[c.id] + delta, 0, 100));
      gap[c.id] = mapaDesejado[c.id] - mapaAtual[c.id];
    });

    // Perfil adaptado = composição do mapa desejado por fator
    const adaptadoBruto = { D:[], I:[], S:[], C:[] };
    CAPACIDADES.forEach(c => { adaptadoBruto[c.fator].push(mapaDesejado[c.id]); });
    const somaAdapt = ['D','I','S','C'].reduce((s,k) => s + media(adaptadoBruto[k]), 0) || 1;
    const adaptado = {};
    ['D','I','S','C'].forEach(k => { adaptado[k] = r1(media(adaptadoBruto[k]) / somaAdapt * 100); });

    // ── ÍNDICES DERIVADOS ───────────────────────────────────────────────

    // IPS — Positividade Seletiva: quanto se atribuiu na fase LIVRE (0..100)
    const IPS = Math.round(media(CAPACIDADES.map(c => capF2[c.id])));

    // IDA — Discrepância da Autopercepção: distância entre a FORMA do perfil
    // na fase forçada e na fase livre.
    // Normalizado contra 60 pontos de distância total. O máximo teórico (150)
    // nunca ocorre e achataria o índice; 40 saturava em 100 para qualquer
    // resposta uniforme na fase 2, que é um estilo de resposta comum demais
    // para ser tratado como extremo absoluto.
    const somaDif = ['D','I','S','C'].reduce((s,k) => s + Math.abs(natural[k] - declarado[k]), 0);
    const IDA = Math.round(clamp(somaDif / 60 * 100, 0, 100));

    // IPM — Pontos de Melhoria: média entre o gap positivo da fase 3
    // e a proporção de características marcadas na fase 4.
    const gapsPos = CAPACIDADES.map(c => Math.max(0, gap[c.id]));
    const compGap = media(gapsPos) / 50 * 100;
    const compF4  = f4.length / FASE4.length * 100;
    const IPM = Math.round(clamp((compGap + compF4) / 2, 0, 100));

    // IIA — Influência do Ambiente: o quanto o meio pede um perfil diferente
    // do natural. Distância entre perfil natural e perfil adaptado.
    const distAdapt = ['D','I','S','C'].reduce((s,k) => s + Math.abs(natural[k] - adaptado[k]), 0);
    const IIA = Math.round(clamp(distAdapt / 2 / 75 * 100, 0, 100));

    // ITA — Tendência da Autoestima: combinação ponderada.
    // (+) forças nas dimensões determinantes  (+) positividade declarada
    // (−) pontos de melhoria                  (−) discrepância
    const ranking = ['D','I','S','C'].sort((a,b) => natural[b] - natural[a]);
    const determinantes = ranking.slice(0, 2);
    const forcasDet = media(
      CAPACIDADES.filter(c => determinantes.indexOf(c.fator) >= 0).map(c => mapaAtual[c.id])
    );
    // Sem constante aditiva: a constante empurrava todo mundo para o topo e
    // comprimia a escala num intervalo estreito de "alto".
    const ITA = Math.round(clamp(
      0.45 * forcasDet + 0.30 * IPS - 0.15 * IPM - 0.10 * IDA, 0, 100
    ));

    // TCM — Tempo Consumido no Mapeamento
    const seg = Number(r.tempoSegundos) || 0;
    const TCM = {
      segundos: seg,
      minutos: Math.round(seg / 60),
      faixa: seg === 0 ? 'não medido'
           : seg < 8 * 60  ? 'muito rápido'
           : seg < 14 * 60 ? 'rápido'
           : seg <= 25 * 60 ? 'dentro do esperado'
           : 'acima do esperado',
      referencia: '14 a 25 minutos'
    };

    // ── Perfil, ranking e classificação por fator ───────────────────────
    const sigla = ranking.slice(0, 2).join('');
    const capsOrdenadas = CAPACIDADES
      .map(c => ({ id:c.id, nome:c.nome, fator:c.fator, indice:FATORES[c.fator].indice,
                   atual:mapaAtual[c.id], desejado:mapaDesejado[c.id], gap:gap[c.id] }))
      .sort((a, b) => b.atual - a.atual);

    // Faixa por fator: normatizada sobre 25% (o esperado se tudo fosse igual),
    // não sobre o percentual bruto. É isso que faz 13,7% poder ser "normal"
    // enquanto 15,8% é "muito baixo" em outro fator.
    const faixaFator = {};
    ['D','I','S','C'].forEach(k => {
      const rel = natural[k] / 25;                  // 1.0 = exatamente o esperado
      faixaFator[k] = rel >= 1.60 ? 'MUITO ALTO'
                    : rel >= 1.20 ? 'ALTO'
                    : rel >= 0.70 ? 'NORMAL'
                    : rel >= 0.45 ? 'BAIXO'
                    : 'MUITO BAIXO';
    });

    return {
      versao: 'axis-disc-exec-1.0',
      perfil: { sigla, primario: ranking[0], secundario: ranking[1], ranking },
      natural, declarado, adaptado,
      faixaFator,
      mapaAtual, mapaDesejado, gap,
      capacidades: capsOrdenadas,
      pontosFortes: capsOrdenadas.slice(0, 7),
      pontosAtencao: capsOrdenadas.slice(-5).reverse(),
      indices: { ITA, IPM, IDA, IPS, IIA, TCM },
      fase4Marcadas: f4.slice()
    };
  }

  // Faixa textual genérica para os índices 0..100
  function faixaIndice(v) {
    return v >= 80 ? 'MUITO ALTO' : v >= 60 ? 'ALTO' : v >= 40 ? 'NORMAL'
         : v >= 20 ? 'BAIXO' : 'MUITO BAIXO';
  }

  global.DISC_EXEC = {
    FATORES, CAPACIDADES, CAP_POR_ID,
    FASE1, FASE2, FASE3, FASE4,
    calcular, faixaIndice
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.DISC_EXEC;

})(typeof window !== 'undefined' ? window : globalThis);
