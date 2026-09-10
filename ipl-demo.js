// ── Lideranças 360° (IPL) — avaliação de demonstração ────────────
// A conta de vitrine abria o módulo vazio, e quem entra pelo cartão de
// visita não consegue criar nada (a escrita é bloqueada no modo
// demonstração). Este arquivo semeia UMA avaliação fictícia completa na
// empresa da vitrine: 9 avaliadores, as 32 respostas de cada um, os
// índices e o laudo. Assim o card mostra o IPL e o botão "Ver Relatório"
// abre o documento de verdade, sem gastar chamada de IA e sem depender
// de ninguém responder.
//
// O gestor avaliado é fictício. Os números foram desenhados para contar
// a história que a NR-1 pede: o time cala o que sente, e o que ele cala
// aparece nas dimensões de apoio, feedback e reconhecimento.

const CODIGO_DEMO = 'IPL-2026-DEMO01';
const GESTOR = { nome: 'Rafael Antunes', cargo: 'Coordenador de Operações', setor: 'Operações' };

// Mesma ordem e mesmos pesos do motor em server-cloud.js.
const DIMENSOES = ['comunicacao', 'confianca', 'apoio', 'metas', 'feedback', 'justica', 'reconhecimento', 'desenvolvimento'];
const PESOS = { superior: 0.20, par: 0.20, subordinado: 0.40, auto: 0.20 };

// Pontos por dimensão (escala 0 a 20) de cada avaliador, na ordem acima.
// Os desvios dentro de cada grupo somam zero, então a média do grupo é
// exatamente o perfil de base.
const BASE = {
  subordinado: [13, 12,  9, 14,  8, 13,  9, 10],
  par:         [15, 14, 12, 16, 11, 15, 11, 13],
  superior:    [16, 15, 13, 18, 12, 16, 13, 14],
  auto:        [18, 17, 16, 19, 16, 18, 15, 17]
};
const DESVIOS = {
  subordinado: [
    [ 1,  1,  0,  0, -1,  0,  1,  0],
    [-1,  0,  1,  1,  0, -1,  0,  1],
    [ 0, -1, -1,  0,  1,  1, -1,  0],
    [ 1,  0,  0, -1,  0,  0,  1, -1],
    [-1,  0,  0,  0,  0,  0, -1,  0]
  ],
  par: [
    [ 1,  0, -1,  0,  1,  0,  0,  1],
    [-1,  0,  1,  0, -1,  0,  0, -1]
  ],
  superior: [[0, 0, 0, 0, 0, 0, 0, 0]],
  auto:     [[0, 0, 0, 0, 0, 0, 0, 0]]
};

// Um bloco de 4 perguntas que soma exatamente os pontos da dimensão,
// com as notas distribuídas de forma inteira entre 1 e 5.
function bloco(pontos) {
  const p = Math.max(4, Math.min(20, pontos));
  const base = Math.floor(p / 4), resto = p % 4;
  return [0, 1, 2, 3].map(i => base + (i < resto ? 1 : 0));
}
function respostasDe(pontosPorDimensao) {
  const r = {};
  pontosPorDimensao.forEach((pontos, d) => {
    bloco(pontos).forEach((nota, i) => { r['q' + (d * 4 + i + 1)] = nota; });
  });
  return r;
}
function classifDimensao(p) {
  if (p >= 17) return '⭐ Excelente';
  if (p >= 13) return '✅ Bom';
  if (p >= 9)  return '⚠️ Atenção';
  return '🔴 Crítico';
}
function classifGeral(s) {
  if (s >= 80) return '🌟 Liderança Inspiradora';
  if (s >= 60) return '✅ Liderança em Desenvolvimento';
  if (s >= 40) return '⚠️ Liderança em Alerta';
  return '🔴 Liderança em Crise';
}
// Tira o ícone do começo da classificação para usar dentro da frase.
const semIcone = t => String(t).replace(/^\S+\s/, '');

// Monta os avaliadores e reproduz o mesmo cálculo do motor: média do
// grupo por dimensão, ponderação por tipo, IPL de 0 a 100.
function montar() {
  const avaliadores = [];
  Object.keys(BASE).forEach(tipo => {
    DESVIOS[tipo].forEach(desvio => {
      const pontos = BASE[tipo].map((p, i) => p + desvio[i]);
      avaliadores.push({ tipo, pontos, respostas: respostasDe(pontos) });
    });
  });

  const mediaTipoDim = {}, contadores = {};
  Object.keys(BASE).forEach(tipo => {
    const grupo = avaliadores.filter(a => a.tipo === tipo);
    contadores[tipo] = grupo.length;
    mediaTipoDim[tipo] = DIMENSOES.map((_, d) =>
      grupo.reduce((s, a) => s + a.pontos[d], 0) / grupo.length);
  });

  const dimensoes = {}; let total = 0;
  DIMENSOES.forEach((key, d) => {
    let pond = 0, pesos = 0;
    Object.keys(PESOS).forEach(tipo => {
      if (contadores[tipo] > 0) { pond += mediaTipoDim[tipo][d] * PESOS[tipo]; pesos += PESOS[tipo]; }
    });
    const p = pesos > 0 ? pond / pesos : 0;
    total += p;
    dimensoes[key] = { pontos: Math.round(p * 10) / 10, classificacao: classifDimensao(p) };
  });

  const perspectiva = tipo => Math.round(
    (mediaTipoDim[tipo].reduce((s, v) => s + v, 0) / (DIMENSOES.length * 20)) * 100);
  const ipl = Math.round((total / (DIMENSOES.length * 20)) * 100);

  return {
    avaliadores, dimensoes, ipl, classificacao: classifGeral(ipl), contadores,
    iplSub: perspectiva('subordinado'), iplPar: perspectiva('par'),
    iplSup: perspectiva('superior'), iplAuto: perspectiva('auto')
  };
}

// ── Laudo ────────────────────────────────────────────────────────
// Escrito à mão, no mesmo formato que a IA entrega (markdown leve, sem
// travessão, com a observação ética no fim). A versão do administrador
// acrescenta a leitura do núcleo comportamental.
function laudo(c, empresaNome, incluirNucleo) {
  const n = GESTOR.nome, prim = n.split(' ')[0];
  const d = c.dimensoes;
  const gap = c.iplAuto - c.iplSub;
  const nucleo = !incluirNucleo ? '' : `
## Seção 8: Núcleo comportamental (análise psicanalítica aplicada)

A distância entre o que ${prim} vê e o que a equipe vive costuma ter uma função defensiva. Na leitura junguiana, a sombra do líder orientado a resultado é a indiferença afetiva: aquilo que ele não reconhece em si, a dificuldade de sustentar o desconforto do outro, aparece projetado como "time sensível demais" ou "gente que não aguenta pressão". A sombra não se resolve com técnica, ela se resolve com nomeação.

Na leitura de Goleman e da neurociência afetiva, cada conversa em que o colaborador levanta um problema e recebe uma solução imediata sem acolhimento ativa o sistema límbico antes do córtex pré-frontal. A pessoa registra ameaça, não apoio. Repetido por meses, o efeito espelho neuronal faz a equipe reproduzir a mesma frieza entre pares, e o clima que ${prim} descreve como profissional é, na prática, um clima de contenção emocional.

Na leitura de Bass, o padrão que emerge dos dados é o de liderança transacional madura: entrega, organiza, cumpre. O salto para a liderança transformacional depende de uma variável que ${prim} ainda não exercita, a consideração individualizada, que é exatamente a dimensão de Apoio Emocional com ${d.apoio.pontos} pontos.

Na leitura de Dilts, a crença limitante que sustenta o quadro é reconhecível na fala típica desse perfil: se eu me aproximar demais, perco autoridade. Enquanto essa crença estiver ativa, qualquer ferramenta de escuta vira protocolo vazio. O trabalho de desenvolvimento começa por ela, e não pela agenda.
`;

  return `## Seção 1: Resultado geral

${n} alcançou um IPL de ${c.ipl} pontos em 100, classificado como ${semIcone(c.classificacao)}. O resultado reúne a percepção de ${c.avaliadores.length} avaliadores: ${c.contadores.subordinado} subordinados, ${c.contadores.par} pares, ${c.contadores.superior} superior e a autoavaliação, todos respondendo às mesmas 32 perguntas do protocolo AXIS IA.

Um IPL nessa faixa indica uma liderança que funciona e que ainda não ressoa. Na leitura de Goleman, ${prim} entrega resultado por competência técnica e organização, não por vínculo. A equipe cumpre porque a estrutura é clara, não porque se sente sustentada. É uma liderança eficiente no curto prazo e frágil sob pressão prolongada.

O que mais chama atenção não é a nota geral. É a diferença entre quem olha de cima e quem olha de baixo. ${prim} se avalia em ${c.iplAuto} pontos, o superior imediato o avalia em ${c.iplSup}, os pares em ${c.iplPar} e os subordinados em ${c.iplSub}. A liderança que ${prim} acredita exercer e a liderança que a equipe recebe são duas experiências diferentes.

## Seção 2: Classificação da liderança

Na tipologia de Bass, o perfil de ${n} é predominantemente transacional: metas claras, combinados cumpridos, correção rápida do desvio. A dimensão de Clareza de Metas, com ${d.metas.pontos} pontos, é a mais alta do conjunto e confirma isso. Ninguém na equipe tem dúvida sobre o que precisa ser entregue.

O que separa esse perfil da liderança transformacional é a consideração individualizada, a capacidade de enxergar a pessoa antes da função. As três dimensões mais baixas do relatório, Apoio Emocional com ${d.apoio.pontos}, Feedback e Desenvolvimento com ${d.feedback.pontos} e Reconhecimento com ${d.reconhecimento.pontos}, são exatamente as que compõem esse eixo.

Pelo modelo SCARF, de David Rock, a equipe de ${prim} tem previsibilidade (Certeza) e regras iguais para todos (Justiça), e carece de Status, o reconhecimento do valor de cada um, e de Relacionamento, o senso de pertencimento. O cérebro trata a falta desses dois domínios como ameaça, e a resposta à ameaça no ambiente de trabalho não é o confronto. É o silêncio.

Esse é o ponto que conecta o relatório à NR-1. O silêncio da equipe em reunião não é sinal de acordo, é o indicador mais precoce de risco psicossocial que existe.

## Seção 3: Como cada grupo enxerga ${prim}

**Superior imediato, ${c.iplSup} pontos.** A visão de cima é a mais generosa depois da autoavaliação, e é coerente com o que chega até lá: entrega no prazo, indicadores em ordem, pouca escalada de conflito. O superior avalia o produto da liderança, não o processo. Isso explica por que problemas de clima costumam ser descobertos tarde.

**Pares, ${c.iplPar} pontos.** Os pares veem ${prim} como um profissional confiável e um interlocutor direto. A leitura intermediária sugere que a dificuldade dele com o cuidado interpessoal também aparece na horizontal, embora sem o custo emocional que a assimetria de poder produz.

**Subordinados, ${c.iplSub} pontos.** É a perspectiva mais baixa e a que mais pesa no índice, com 40 por cento do cálculo, porque é quem convive com a liderança todos os dias. A equipe reconhece a organização e a coerência de ${prim}, e não encontra nele um lugar seguro para dizer que está sobrecarregada.

**Autoavaliação, ${c.iplAuto} pontos, e o GAP.** ${prim} se avalia ${gap} pontos acima da própria equipe. Em termos freudianos, há projeção: a intenção é tomada como efeito. ${prim} sabe que se importa e conclui que a equipe sente esse cuidado. Ninguém confirmou isso para ele, e ninguém vai confirmar espontaneamente.

## Seção 4: Análise detalhada por dimensão

**Comunicação Clara, ${d.comunicacao.pontos} pontos, ${semIcone(d.comunicacao.classificacao)}.** A informação circula e as decisões são explicadas. O ponto de atenção é a direção: a comunicação de ${prim} é eficiente de cima para baixo e pouco permeável de baixo para cima.

**Confiança e Transparência, ${d.confianca.pontos} pontos, ${semIcone(d.confianca.classificacao)}.** ${prim} cumpre o que promete, e isso sustenta o índice. A transparência sobre decisões difíceis, quando o resultado é ruim, ainda é preservada em excesso, o que a equipe lê como distância.

**Apoio Emocional, ${d.apoio.pontos} pontos, ${semIcone(d.apoio.classificacao)}.** É a dimensão mais crítica e a de conexão mais direta com o fator suporte social da NR-1. A equipe recebe solução, não acolhimento. Quem traz um problema pessoal recebe uma resposta operacional e aprende a não trazer de novo.

**Clareza de Metas, ${d.metas.pontos} pontos, ${semIcone(d.metas.classificacao)}.** O maior ativo de ${prim}. Todos sabem o que se espera deles, e essa previsibilidade protege o time de uma parte relevante do estresse ocupacional.

**Feedback e Desenvolvimento, ${d.feedback.pontos} pontos, ${semIcone(d.feedback.classificacao)}.** O feedback existe quando algo dá errado e desaparece quando dá certo. A equipe vive em correção permanente, sem referência de progresso.

**Justiça e Equidade, ${d.justica.pontos} pontos, ${semIcone(d.justica.classificacao)}.** Não há indício de favorecimento nem de tratamento desigual. É uma base sólida sobre a qual as demais dimensões podem ser reconstruídas.

**Reconhecimento, ${d.reconhecimento.pontos} pontos, ${semIcone(d.reconhecimento.classificacao)}.** O esforço da equipe é tratado como obrigação cumprida. A ausência de reconhecimento é o preditor isolado mais forte de desengajamento e de saída voluntária.

**Desenvolvimento da Equipe, ${d.desenvolvimento.pontos} pontos, ${semIcone(d.desenvolvimento.classificacao)}.** Há delegação de tarefa e pouca delegação de responsabilidade. As pessoas executam bem e crescem devagar.

## Seção 5: O ponto cego de ${prim}

O GAP de ${gap} pontos entre a autoavaliação e a percepção dos subordinados é o dado mais importante deste relatório. Ele não indica má-fé, indica ausência de espelho. Ninguém devolveu a ${prim} o efeito real do seu jeito de liderar.

Jung chamaria de sombra aquilo que ${prim} não reconhece em si e que a equipe sente todos os dias. Enquanto essa parte permanecer fora do campo de consciência, qualquer esforço de melhoria será direcionado ao lugar errado, porque ${prim} vai continuar aperfeiçoando aquilo que já faz bem.

Há um agravante estrutural: quanto mais baixo o Apoio Emocional, menor a chance de alguém dizer a verdade ao líder. O ponto cego se autoalimenta. É exatamente por isso que uma avaliação anônima e agregada como esta produz informação que nenhuma reunião de equipe produziria.

A boa notícia é que ponto cego se corrige com dado, e o dado agora existe.

## Seção 6: Impacto psicossocial na equipe, conexão com a NR-1

As três dimensões mais baixas de ${prim} coincidem com fatores de risco psicossocial previstos na NR-1: suporte social insuficiente, ausência de reconhecimento e baixa clareza sobre desenvolvimento. Não são questões de clima, são fatores de risco que a empresa tem obrigação legal de inventariar e tratar.

O padrão esperado para um time nessa configuração é conhecido: aumento de queixas somáticas, absenteísmo curto e repetido, queda de iniciativa e rotatividade concentrada entre os profissionais mais qualificados, que são os que têm alternativa.

Do ponto de vista documental, o cruzamento entre o IPL de ${prim} e o ISEP do setor de ${GESTOR.setor} deve entrar no inventário de riscos como evidência de nexo entre estilo de liderança e sofrimento da equipe, com a medida de controle correspondente registrada no plano de ação.

## Seção 7: Perfil de liderança

O arquétipo predominante de ${n} é o do Guardião: o líder que protege a operação, sustenta o padrão e absorve a pressão que vem de cima sem repassar caos para baixo. É um perfil valioso e cansativo, porque concentra em uma pessoa o que deveria ser distribuído.

Nos seis estilos de Goleman, ${prim} opera bem no estilo dirigente e no estilo marcador de ritmo, e usa pouco o estilo afiliativo e o coaching. São justamente os dois estilos que constroem vínculo e desenvolvimento, e os dois que faltam nos números.

A transição possível para ${prim} é do Guardião para o Mentor. Ela não exige que ele deixe de ser exigente, exige que a exigência passe a vir acompanhada de presença.
${nucleo}
## Seção ${incluirNucleo ? '9' : '8'}: Plano de Desenvolvimento Individual

**Fase 1, Consciência, semanas 1 a 3.** Objetivo: encarar o GAP de ${gap} pontos sem defesa. Ferramentas: leitura do relatório com apoio da consultoria e registro diário de uma situação em que a intenção pode não ter chegado como cuidado. Marcador: ${prim} consegue descrever com as próprias palavras o que a equipe sente. Fundamento: autoconsciência de Goleman.

**Fase 2, Reconhecimento, semanas 4 a 8.** Objetivo: elevar a dimensão de Reconhecimento, hoje em ${d.reconhecimento.pontos}. Ferramenta: um reconhecimento específico e nominal por semana para cada pessoa da equipe, dito sobre o comportamento e não sobre o resultado. Marcador: a equipe passa a citar exemplos de reconhecimento recebidos. Fundamento: domínio Status do modelo SCARF.

**Fase 3, Transformação, semanas 9 a 16.** Objetivo: reconstruir o Apoio Emocional, hoje em ${d.apoio.pontos}. Ferramentas: conversa individual quinzenal de 30 minutos sem pauta operacional e treino de escuta sem solução, em que ${prim} pergunta antes de resolver. Marcador: alguém da equipe traz espontaneamente um problema pessoal. Fundamento: consideração individualizada de Bass.

**Fase 4, Consolidação, semanas 17 a 24.** Objetivo: transformar feedback pontual em ciclo de desenvolvimento. Ferramentas: plano individual por pessoa, com uma competência em foco e revisão mensal. Marcador: cada membro da equipe sabe dizer em que está evoluindo. Fundamento: estilo coaching de Goleman.

**Fase 5, Influência, semanas 25 a 36.** Objetivo: sustentar o ganho e reaplicar a avaliação 360°. Ferramentas: repetição do IPL e comparação dimensão a dimensão. Marcador: GAP abaixo de 15 pontos e IPL dos subordinados acima de 70. Fundamento: liderança transformacional consolidada.

## Seção ${incluirNucleo ? '10' : '9'}: Recomendações práticas

**Conversa de devolutiva com a equipe.** ${prim} apresenta ao time o que o relatório mostrou, sem justificar e sem procurar autor. É estratégico porque quebra, no primeiro movimento, o ciclo de silêncio que produziu o GAP de ${gap} pontos. Começar nos primeiros 30 dias.

**Ritual de escuta quinzenal.** Trinta minutos por pessoa, sem pauta de entrega. A dimensão de Apoio Emocional em ${d.apoio.pontos} não sobe com discurso, sobe com frequência de presença.

**Regra dos três antes de um.** Antes de propor a solução, fazer três perguntas. Ataca diretamente o padrão que a equipe descreve como falta de acolhimento.

**Reconhecimento nominal e específico.** Trocar bom trabalho, pessoal por você conduziu aquela negociação com firmeza e cuidado. O reconhecimento genérico não é registrado pelo cérebro como reconhecimento.

**Feedback de progresso, não só de desvio.** Com Feedback em ${d.feedback.pontos} pontos, a equipe só ouve ${prim} quando erra. Estabelecer um retorno positivo específico por semana por pessoa.

**Delegar responsabilidade, não apenas tarefa.** Escolher duas pessoas e transferir a decisão, não a execução. É o caminho para tirar Desenvolvimento da Equipe dos ${d.desenvolvimento.pontos} pontos atuais.

**Transparência sobre o difícil.** Compartilhar também a decisão que deu errado. Confiança em ${d.confianca.pontos} sustenta esse movimento, e ele eleva a percepção de proximidade sem custo de autoridade.

**Canal anônimo ativo entre ciclos.** Manter o Relato Seguro disponível para que o time não precise esperar a próxima avaliação para falar.

**Repetir o IPL em seis meses.** Sem nova medição, o desenvolvimento vira intenção. A comparação dimensão a dimensão é o que prova o avanço para a empresa e para o próprio ${prim}.

## Seção ${incluirNucleo ? '11' : '10'}: Síntese final

${prim}, seu IPL de ${c.ipl} pontos diz que você é um líder confiável. Sua equipe sabe o que fazer, sabe o que se espera dela e não teme injustiça. Isso não é pouco, e é o alicerce sobre o qual o resto se constrói.

O que os dados também dizem é que sua equipe não sabe se pode contar com você quando o problema não é de trabalho. Você se avalia em ${c.iplAuto} e eles te avaliam em ${c.iplSub}. Essa diferença de ${gap} pontos não é falha de caráter, é falta de espelho. Ninguém te disse, porque o próprio ambiente que você criou tornou difícil dizer.

Você não precisa mudar quem é. Precisa acrescentar. A exigência que você já tem, somada à presença que ainda falta, é o que separa o líder que as pessoas obedecem do líder que as pessoas seguem.

Comece pelo mais simples e mais desconfortável: pergunte, e aguente o silêncio até alguém responder de verdade.

${empresaNome ? 'Relatório emitido para ' + empresaNome + ' pela plataforma AXIS IA.' : ''}

⚠️ OBSERVAÇÃO ÉTICA: Este relatório é uma avaliação de percepção de liderança baseada no Protocolo AXIS IA, IPL, desenvolvido por Clau Diniz. Os resultados refletem a percepção dos avaliadores no período indicado e não constituem diagnóstico psicológico, avaliação de desempenho formal ou laudo clínico. Os dados devem ser utilizados exclusivamente para desenvolvimento individual e organizacional, conforme os princípios éticos do CFP e a legislação trabalhista vigente (CLT e NR-1/MTE). O anonimato dos avaliadores individuais é protegido: apenas médias agregadas por grupo são apresentadas.`;
}

// Cria a avaliação de demonstração se a empresa da vitrine ainda não
// tiver nenhuma. Devolve true quando semeou.
async function garantirIPLDemo(pool, { empresaId, empresaNome }) {
  const jaExiste = await pool.query(
    'SELECT 1 FROM avaliacoes_ipl WHERE codigo_avaliacao = $1 OR empresa_id = $2 LIMIT 1',
    [CODIGO_DEMO, empresaId]
  );
  if (jaExiste.rows.length) return false;

  const c = montar();
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 21 * 86400000);

  const ins = await pool.query(
    `INSERT INTO avaliacoes_ipl (
       empresa_id, empresa_nome, gestor_nome, gestor_cargo, gestor_setor, codigo_avaliacao,
       periodo_inicio, periodo_fim,
       convidados_subordinados, convidados_pares, convidados_superiores,
       total_avaliadores, qtd_subordinados, qtd_pares, qtd_superiores, qtd_auto,
       ipl_score, ipl_subordinados, ipl_pares, ipl_superiores, ipl_auto,
       gap_auto_subordinados, classificacao_ipl, pontuacoes_dimensoes,
       relatorio_gestor, relatorio_admin, status, flag_risco_critico,
       relatorio_gerado_em, gerando
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,'relatorio_gerado',FALSE,NOW(),FALSE)
     RETURNING id`,
    [
      empresaId, empresaNome, GESTOR.nome, GESTOR.cargo, GESTOR.setor, CODIGO_DEMO,
      inicio.toISOString().slice(0, 10), hoje.toISOString().slice(0, 10),
      6, 3, 1,
      c.avaliadores.length, c.contadores.subordinado, c.contadores.par, c.contadores.superior, c.contadores.auto,
      c.ipl, c.iplSub, c.iplPar, c.iplSup, c.iplAuto,
      c.iplAuto - c.iplSub, c.classificacao, JSON.stringify(c.dimensoes),
      laudo(c, empresaNome, false), laudo(c, empresaNome, true)
    ]
  );
  const avaliacaoId = ins.rows[0].id;

  for (const a of c.avaliadores) {
    const pontuacoes = {};
    DIMENSOES.forEach((key, i) => {
      pontuacoes[key] = { pontos: a.pontos[i], classificacao: classifDimensao(a.pontos[i]) };
    });
    await pool.query(
      'INSERT INTO respostas_ipl (avaliacao_id, tipo_avaliador, respostas, pontuacoes_dimensoes) VALUES ($1,$2,$3,$4)',
      [avaliacaoId, a.tipo, JSON.stringify(a.respostas), JSON.stringify(pontuacoes)]
    );
  }
  return true;
}

module.exports = { garantirIPLDemo, montar, laudo, CODIGO_DEMO, GESTOR };
