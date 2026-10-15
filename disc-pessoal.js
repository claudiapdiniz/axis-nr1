/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC PESSOAL — itens do instrumento
   ───────────────────────────────────────────────────────────────────────
   Mesmo motor, mesmas 24 capacidades e mesmos índices do DISC Executivo
   (disc-executivo.js). Só muda o que a pessoa lê: o vocabulário sai do
   trabalho e da liderança e vai para relações, família, amizade e vida
   pessoal.

   REGRA QUE NÃO PODE QUEBRAR: cada slot aponta para a MESMA capacidade
   do slot correspondente no Executivo (grupo g da fase 1, cap da fase 2 e
   da fase 3). O motor calcula pela capacidade, então os resultados dos
   dois módulos continuam comparáveis e o servidor valida igual.
   A fase 4 entra no cálculo só pela quantidade marcada (48 itens nos dois).
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // ── FASE 1 — 12 grupos x 4 adjetivos (D, I, S, C nessa ordem) ─────────
  const FASE1 = [
    { g:1,  itens:[ {adj:'Firme',          cap:'comando'},        {adj:'Espontâneo',     cap:'expressividade'}, {adj:'Tranquilo',     cap:'serenidade'},     {adj:'Ponderado',    cap:'rigor'} ] },
    { g:2,  itens:[ {adj:'Aventureiro',    cap:'ousadia'},        {adj:'Animado',        cap:'entusiasmo'},     {adj:'Fiel',          cap:'constancia'},     {adj:'Observador',   cap:'detalhe'} ] },
    { g:3,  itens:[ {adj:'Franco',         cap:'objetividade'},   {adj:'Encantador',     cap:'carisma'},        {adj:'Conciliador',   cap:'cooperacao'},     {adj:'Organizado',   cap:'metodo'} ] },
    { g:4,  itens:[ {adj:'Rápido',         cap:'urgencia'},       {adj:'Enturmado',      cap:'articulacao'},    {adj:'Prestativo',    cap:'apoio'},          {adj:'Previdente',   cap:'planejamento'} ] },
    { g:5,  itens:[ {adj:'Independente',   cap:'autonomia'},      {adj:'Convincente',    cap:'persuasao'},      {adj:'Confiável',     cap:'previsibilidade'},{adj:'Cauteloso',    cap:'cautela'} ] },
    { g:6,  itens:[ {adj:'Ambicioso',      cap:'competitividade'},{adj:'Flexível',       cap:'adaptabilidade'}, {adj:'Acolhedor',     cap:'escuta'},         {adj:'Disciplinado', cap:'disciplina'} ] },
    { g:7,  itens:[ {adj:'Decidido',       cap:'comando'},        {adj:'Expansivo',      cap:'expressividade'}, {adj:'Paciente',      cap:'serenidade'},     {adj:'Racional',     cap:'rigor'} ] },
    { g:8,  itens:[ {adj:'Destemido',      cap:'ousadia'},        {adj:'Alegre',         cap:'entusiasmo'},     {adj:'Persistente',   cap:'constancia'},     {adj:'Atento',       cap:'detalhe'} ] },
    { g:9,  itens:[ {adj:'Direto',         cap:'objetividade'},   {adj:'Simpático',      cap:'carisma'},        {adj:'Pacificador',   cap:'cooperacao'},     {adj:'Metódico',     cap:'metodo'} ] },
    { g:10, itens:[ {adj:'Ágil',           cap:'urgencia'},       {adj:'Sociável',       cap:'articulacao'},    {adj:'Generoso',      cap:'apoio'},          {adj:'Planejador',   cap:'planejamento'} ] },
    { g:11, itens:[ {adj:'Autossuficiente',cap:'autonomia'},      {adj:'Persuasivo',     cap:'persuasao'},      {adj:'Coerente',      cap:'previsibilidade'},{adj:'Prudente',     cap:'cautela'} ] },
    { g:12, itens:[ {adj:'Competitivo',    cap:'competitividade'},{adj:'Adaptável',      cap:'adaptabilidade'}, {adj:'Empático',      cap:'escuta'},         {adj:'Regrado',      cap:'disciplina'} ] }
  ];

  // ── FASE 2 — 24 afirmativas, régua de 1 a 9 ───────────────────────────
  const FASE2 = [
    { cap:'comando',         txt:'Nas decisões da família ou entre amigos, costumo ser quem dá a palavra final.' },
    { cap:'ousadia',         txt:'Topo experiências novas mesmo sem saber bem como vão terminar.' },
    { cap:'objetividade',    txt:'Digo o que penso, mesmo quando a conversa fica desconfortável.' },
    { cap:'urgencia',        txt:'Quando algo me incomoda numa relação, resolvo na hora em vez de deixar para depois.' },
    { cap:'autonomia',       txt:'Prefiro resolver a minha vida sozinho(a) a depender da ajuda de alguém.' },
    { cap:'competitividade', txt:'Gosto de ganhar, até em jogo ou discussão entre amigos.' },
    { cap:'expressividade',  txt:'Falo com facilidade sobre o que sinto e penso, mesmo com quem acabei de conhecer.' },
    { cap:'entusiasmo',      txt:'Costumo animar as pessoas ao meu redor, até nos dias difíceis.' },
    { cap:'carisma',         txt:'As pessoas costumam gostar de mim logo no primeiro contato.' },
    { cap:'articulacao',     txt:'Mantenho contato com muitos amigos e gosto de juntar pessoas.' },
    { cap:'persuasao',       txt:'Consigo fazer quem está perto de mim mudar de ideia.' },
    { cap:'adaptabilidade',  txt:'Quando os planos mudam de última hora, sigo bem com a novidade.' },
    { cap:'escuta',          txt:'Quando alguém desabafa comigo, escuto até o fim antes de dar opinião.' },
    { cap:'serenidade',      txt:'Mantenho a calma quando uma discussão esquenta.' },
    { cap:'constancia',      txt:'Sustento os meus compromissos e projetos pessoais mesmo depois que a empolgação passa.' },
    { cap:'cooperacao',      txt:'Numa briga, prefiro chegar a um acordo a ter razão.' },
    { cap:'apoio',           txt:'Sou a pessoa que os outros procuram quando precisam de ajuda.' },
    { cap:'previsibilidade', txt:'Quem convive comigo sabe como vou reagir: sou igual em qualquer situação.' },
    { cap:'rigor',           txt:'Antes de acreditar no que me contam, procuro confirmar se é verdade.' },
    { cap:'detalhe',         txt:'Reparo em detalhes que passam despercebidos para quem está comigo.' },
    { cap:'metodo',          txt:'Mantenho a minha casa, as minhas contas e a minha rotina organizadas.' },
    { cap:'planejamento',    txt:'Planejo com antecedência viagens, gastos e os passos importantes da minha vida.' },
    { cap:'cautela',         txt:'Penso bem nas consequências antes de tomar uma decisão pessoal importante.' },
    { cap:'disciplina',      txt:'Cumpro o que prometi a mim mesmo(a), como exercício, dieta ou estudo, mesmo sem vontade.' }
  ];

  // ── FASE 3 — 24 eixos, 1 a 21, centro 11 = "já está adequado" ─────────
  // Pergunta: o que eu precisaria ajustar para viver e me relacionar melhor?
  const FASE3 = [
    { cap:'comando',         cima:'Deveria tomar mais a frente nas decisões da minha vida', baixo:'Deveria deixar os outros decidirem mais' },
    { cap:'ousadia',         cima:'Deveria arriscar mais e sair da zona de conforto',      baixo:'Deveria arriscar menos e ir com mais calma' },
    { cap:'objetividade',    cima:'Deveria dizer o que penso com mais clareza',            baixo:'Deveria ser mais delicado(a) na forma de falar' },
    { cap:'urgencia',        cima:'Deveria resolver as coisas mais rápido, sem adiar',     baixo:'Deveria ter menos pressa e dar tempo ao tempo' },
    { cap:'autonomia',       cima:'Deveria depender menos dos outros',                     baixo:'Deveria aceitar mais ajuda e dividir mais as decisões' },
    { cap:'competitividade', cima:'Deveria lutar mais pelo que quero',                     baixo:'Deveria competir menos com quem está perto de mim' },
    { cap:'expressividade',  cima:'Deveria mostrar mais o que sinto',                      baixo:'Deveria me expor menos e ser mais reservado(a)' },
    { cap:'entusiasmo',      cima:'Deveria demonstrar mais alegria e empolgação',          baixo:'Deveria conter um pouco a empolgação' },
    { cap:'carisma',         cima:'Deveria investir mais em criar vínculos',               baixo:'Deveria me preocupar menos em agradar' },
    { cap:'articulacao',     cima:'Deveria cultivar mais amizades e contatos',             baixo:'Deveria ter menos contatos e aprofundar os que já tenho' },
    { cap:'persuasao',       cima:'Deveria defender melhor as minhas ideias',              baixo:'Deveria insistir menos para convencer os outros' },
    { cap:'adaptabilidade',  cima:'Deveria aceitar melhor as mudanças de plano',           baixo:'Deveria manter mais o que foi combinado' },
    { cap:'escuta',          cima:'Deveria ouvir mais e me colocar no lugar do outro',     baixo:'Deveria ouvir menos a opinião alheia e confiar mais em mim' },
    { cap:'serenidade',      cima:'Deveria ter mais calma e paciência',                    baixo:'Deveria reagir mais e engolir menos' },
    { cap:'constancia',      cima:'Deveria ser mais persistente com o que começo',         baixo:'Deveria largar mais rápido o que já não faz sentido' },
    { cap:'cooperacao',      cima:'Deveria ceder mais para manter a paz',                  baixo:'Deveria ceder menos e me posicionar mais' },
    { cap:'apoio',           cima:'Deveria estar mais presente para quem precisa de mim',  baixo:'Deveria cuidar mais de mim e menos dos outros' },
    { cap:'previsibilidade', cima:'Deveria ser mais constante no humor e nas atitudes',    baixo:'Deveria sair mais da rotina e me permitir mudar' },
    { cap:'rigor',           cima:'Deveria pensar com mais lógica antes de reagir',        baixo:'Deveria analisar menos e sentir mais' },
    { cap:'detalhe',         cima:'Deveria prestar mais atenção aos detalhes',             baixo:'Deveria me prender menos a detalhes' },
    { cap:'metodo',          cima:'Deveria organizar melhor a minha rotina e a minha casa',baixo:'Deveria relaxar mais com a organização' },
    { cap:'planejamento',    cima:'Deveria planejar mais a minha vida',                    baixo:'Deveria planejar menos e viver mais o presente' },
    { cap:'cautela',         cima:'Deveria ter mais cuidado antes de confiar ou decidir',  baixo:'Deveria ser menos desconfiado(a) e arriscar mais' },
    { cap:'disciplina',      cima:'Deveria ter mais disciplina comigo mesmo(a)',           baixo:'Deveria me cobrar menos e me permitir mais' }
  ];

  // ── FASE 4 — 48 características a reduzir (opcional) ──────────────────
  const FASE4 = [
    // D em excesso
    { id:'p_mandao',       txt:'menos mandão(ona)',              fator:'D' },
    { id:'p_explosivo',    txt:'menos explosivo(a)',             fator:'D' },
    { id:'p_impaciente',   txt:'menos impaciente',               fator:'D' },
    { id:'p_grosseiro',    txt:'menos grosseiro(a)',             fator:'D' },
    { id:'p_controlador',  txt:'menos controlador(a)',           fator:'D' },
    { id:'p_teimoso',      txt:'menos teimoso(a)',               fator:'D' },
    { id:'p_precipitado',  txt:'menos precipitado(a)',           fator:'D' },
    { id:'p_frio',         txt:'menos frio(a)',                  fator:'D' },
    { id:'p_briguento',    txt:'menos briguento(a)',             fator:'D' },
    { id:'p_orgulhoso',    txt:'menos orgulhoso(a)',             fator:'D' },
    { id:'p_exigente_out', txt:'menos exigente com os outros',   fator:'D' },
    { id:'p_dono_razao',   txt:'menos dono(a) da razão',         fator:'D' },
    // I em excesso
    { id:'p_disperso',     txt:'menos disperso(a)',              fator:'I' },
    { id:'p_falante',      txt:'menos falante',                  fator:'I' },
    { id:'p_superficial',  txt:'menos superficial',              fator:'I' },
    { id:'p_desorganizado',txt:'menos desorganizado(a)',         fator:'I' },
    { id:'p_impulsivo',    txt:'menos impulsivo(a)',             fator:'I' },
    { id:'p_inconstante',  txt:'menos inconstante',              fator:'I' },
    { id:'p_exibido',      txt:'menos exibido(a)',               fator:'I' },
    { id:'p_distraido',    txt:'menos distraído(a)',             fator:'I' },
    { id:'p_exagerado',    txt:'menos exagerado(a)',             fator:'I' },
    { id:'p_carente',      txt:'menos carente de atenção',       fator:'I' },
    { id:'p_esquecido',    txt:'menos esquecido(a)',             fator:'I' },
    { id:'p_dramatico',    txt:'menos dramático(a)',             fator:'I' },
    // S em excesso
    { id:'p_acomodado',    txt:'menos acomodado(a)',             fator:'S' },
    { id:'p_lento',        txt:'menos lento(a)',                 fator:'S' },
    { id:'p_passivo',      txt:'menos passivo(a)',               fator:'S' },
    { id:'p_permissivo',   txt:'menos permissivo(a)',            fator:'S' },
    { id:'p_evitativo',    txt:'menos evitativo(a) nas brigas',  fator:'S' },
    { id:'p_aprovacao',    txt:'menos dependente de aprovação',  fator:'S' },
    { id:'p_resistente',   txt:'menos resistente a mudança',     fator:'S' },
    { id:'p_rotina',       txt:'menos preso(a) à rotina',        fator:'S' },
    { id:'p_submisso',     txt:'menos submisso(a)',              fator:'S' },
    { id:'p_indeciso',     txt:'menos indeciso(a)',              fator:'S' },
    { id:'p_conformado',   txt:'menos conformado(a)',            fator:'S' },
    { id:'p_calado',       txt:'menos calado(a) sobre o que sinto', fator:'S' },
    // C em excesso
    { id:'p_perfeccionista',txt:'menos perfeccionista',          fator:'C' },
    { id:'p_critico',      txt:'menos crítico(a)',               fator:'C' },
    { id:'p_rigido',       txt:'menos rígido(a)',                fator:'C' },
    { id:'p_autocobranca', txt:'menos exigente comigo mesmo(a)', fator:'C' },
    { id:'p_pessimista',   txt:'menos pessimista',               fator:'C' },
    { id:'p_distante',     txt:'menos distante',                 fator:'C' },
    { id:'p_lento_decidir',txt:'menos lento(a) para decidir',    fator:'C' },
    { id:'p_desconfiado',  txt:'menos desconfiado(a)',           fator:'C' },
    { id:'p_preocupado',   txt:'menos preocupado(a)',            fator:'C' },
    { id:'p_detalhista',   txt:'menos detalhista',               fator:'C' },
    { id:'p_inflexivel',   txt:'menos inflexível',               fator:'C' },
    { id:'p_fechado',      txt:'menos fechado(a)',               fator:'C' }
  ];

  // ── Textos de tela que mudam no Pessoal ───────────────────────────────
  const TEXTOS = {
    subtitulo:   'Avaliação comportamental para autoconhecimento e relações',
    fase3Nome:   'Relações',
    fase3Desc:   '24 ajustes que você faria para viver e se relacionar melhor',
    fase3Pergunta: 'o que você precisaria ajustar para viver e se relacionar melhor?',
    fase4Motivo: 'para você viver e se relacionar melhor',
    fase4Titulo: 'Para viver e me relacionar melhor, eu deveria ser:'
  };

  global.DISC_PESSOAL = { FASE1, FASE2, FASE3, FASE4, TEXTOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DISC_PESSOAL;

})(typeof window !== 'undefined' ? window : globalThis);
