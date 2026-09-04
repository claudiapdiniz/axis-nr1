/* ═══════════════════════════════════════════════════════════════════════
   AXIS ÂNCORA PROFISSIONAL — instrumento e motor de cálculo
   ───────────────────────────────────────────────────────────────────────
   O modelo das 8 âncoras de carreira é de Edgar Schein (1928 a 2023),
   publicado desde 1978 e de uso livre mediante atribuição. Os nomes e as
   definições das âncoras seguem o modelo original. Os itens, os textos de
   devolutiva e toda a camada de índices são autorais da AXIS: o
   questionário original de Schein é licenciado comercialmente pela
   editora dele e não é usado aqui.

   ARQUITETURA
     Fase 1  importância declarada     40 itens (5 por âncora), 0 a 100
     Fase 2  oferta do trabalho atual   8 itens (1 por âncora), 0 a 100
     Fase 3  priorização forçada        escolher e ordenar as 3 principais

   POR QUE 3 FASES: a fase 1 sozinha diz o que a pessoa valoriza, e isso
   qualquer teste de carreira entrega. O que a AXIS entrega a mais é o
   cruzamento com a fase 2: a distância entre o que a pessoa precisa e o
   que a função de hoje devolve. Essa distância é o Índice de
   Desalinhamento (IDA), e é por ele que este módulo conversa com a NR-1.
   Âncora não atendida por tempo prolongado aparece como desmotivação,
   presenteísmo, conflito com a liderança e pedido de demissão, que são
   justamente os desfechos que o inventário de riscos psicossociais tem
   de explicar. A fase 3 existe para desempatar: em escala livre muita
   gente marca tudo alto, e a escolha forçada revela o que fica quando é
   preciso abrir mão.

   ATENÇÃO SOBRE OS CORTES: as faixas de classificação abaixo são
   convenção de leitura da AXIS, definidas por coerência interna do
   instrumento. Não são pontos de corte validados em amostra brasileira.
   Enquanto o estudo de calibração não existir, o laudo diz isso.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const VERSAO = 'ANCORA_v1.0';

  // ── AS 8 ÂNCORAS ──────────────────────────────────────────────────────
  // Nomes e definições conforme o modelo de Schein. Características,
  // profissões, motivadores e leitura de risco são textos da AXIS.
  const ANCORAS = [
    {
      id: 'TF', nome: 'Competência Técnica ou Funcional', cor: '#4A3324',
      resumo: 'Ser muito bom em um ofício específico e ser reconhecido por isso.',
      definicao: 'A pessoa se define pelo domínio de um conteúdo. O que a sustenta é a profundidade, não o cargo. Ela quer ser a referência que os outros procuram quando o problema exige conhecimento de verdade, e tende a recusar caminhos que a afastem da prática do ofício.',
      caracteristicas: [
        'Mede o próprio valor pelo nível de domínio que alcançou',
        'Prefere aprofundar no que já faz a recomeçar em outra área',
        'Recusa promoção que a tire da prática técnica',
        'Quer ser consultada como especialista, não como chefe',
        'Escolhe onde trabalhar pelo tanto que vai aprender',
        'Se incomoda com decisão tomada por quem não domina o assunto'
      ],
      profissoes: 'Carreiras de especialista: engenharia, tecnologia, saúde, jurídico, pesquisa, perícia, ofícios técnicos e artísticos de alta exigência.',
      motivadores: [
        { titulo: 'Profundidade', texto: 'Precisa de trabalho que exija o que ela sabe de mais difícil. Tarefa simples demais, por tempo longo, faz essa pessoa desligar.',
          perguntas: 'O seu trabalho de hoje usa o que você tem de melhor tecnicamente? Você tem aprendido algo novo no ofício nos últimos meses?' },
        { titulo: 'Reconhecimento pela competência', texto: 'Quer ser reconhecida pelo que domina, e não pelo tempo de casa ou pela posição no organograma.',
          perguntas: 'As pessoas te procuram pelo que você sabe? Quem decide na sua área entende do assunto?' },
        { titulo: 'Carreira sem virar gestão', texto: 'Precisa de um caminho de crescimento que não obrigue a virar gestora para ganhar mais.',
          perguntas: 'Existe trilha de especialista onde você está? Crescer aí significa parar de fazer o que você gosta?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como desqualificação percebida e perda de sentido: a pessoa executa abaixo da própria capacidade, sente que o conhecimento dela não é usado e passa a evitar exposição. Costuma vir junto de conflito com liderança que decide sem base técnica.'
    },
    {
      id: 'GG', nome: 'Competência em Gestão Geral', cor: '#B5482F',
      resumo: 'Liderar pessoas, integrar áreas e responder pelo resultado do conjunto.',
      definicao: 'A pessoa se realiza coordenando. Quer subir até onde a decisão acontece, gosta de juntar partes que não se falam e aceita responder pelo que o time entrega. Especializar demais a incomoda, porque restringe a visão do negócio.',
      caracteristicas: [
        'Se realiza integrando esforços de pessoas diferentes',
        'Quer chegar onde a decisão final é tomada',
        'Aceita responder pelo resultado do time, não só pelo próprio',
        'Encara conversa difícil como parte do trabalho',
        'Quer entender o negócio inteiro, não apenas a própria área',
        'Tolera bem ambiguidade e informação incompleta'
      ],
      profissoes: 'Gestão de área e de operação, direção, gerência comercial e industrial, coordenação de projetos, cargos executivos.',
      motivadores: [
        { titulo: 'Alcance da decisão', texto: 'Precisa de autoridade compatível com a responsabilidade que carrega. Responder por resultado sem poder decidir é o desenho que mais adoece esse perfil.',
          perguntas: 'Você decide sobre aquilo pelo qual é cobrado? O que hoje depende de aprovação que atrasa o seu trabalho?' },
        { titulo: 'Time sob a sua condução', texto: 'Realiza-se ao formar e conduzir pessoas, e sente falta disso quando trabalha sozinha.',
          perguntas: 'Você tem alguém para desenvolver? Existe caminho para você assumir mais pessoas?' },
        { titulo: 'Visão do todo', texto: 'Precisa enxergar como as partes se conectam. Trancada em um recorte estreito, perde o interesse.',
          perguntas: 'Você entende como a sua área afeta o resultado da empresa? Participa das conversas onde o rumo é definido?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como frustração de progressão e disputa por espaço. O risco maior é o desenho clássico de alta exigência com baixo controle: cobram o resultado e não entregam a autoridade, combinação associada a sobrecarga e adoecimento.'
    },
    {
      id: 'AU', nome: 'Autonomia e Independência', cor: '#2F6B4F',
      resumo: 'Definir o próprio modo de trabalhar, sem alguém dizendo como.',
      definicao: 'O que essa pessoa não abre mão é da liberdade de método. Ela pode até trabalhar duro e sob pressão, desde que decida o caminho. Regra excessiva, controle de horário e supervisão próxima corroem a motivação dela mesmo quando gosta do conteúdo do trabalho.',
      caracteristicas: [
        'Quer decidir como e quando faz o trabalho',
        'Se incomoda com norma que não entende o motivo',
        'Aceita ganhar menos em troca de liberdade',
        'Trabalha melhor sem supervisão próxima',
        'Prefere responder por si a depender de aprovação',
        'Tende a criar o próprio jeito de fazer, mesmo onde há padrão'
      ],
      profissoes: 'Consultoria, profissional liberal, pesquisa, criação, vendas por resultado, carreiras autônomas e trabalho remoto por entrega.',
      motivadores: [
        { titulo: 'Liberdade de método', texto: 'Precisa combinar o que entrega, não como entrega. Microgestão é o que mais rápido a faz querer sair.',
          perguntas: 'Você escolhe como faz o seu trabalho? Quantas aprovações existem entre a sua ideia e a execução dela?' },
        { titulo: 'Contrato por resultado', texto: 'Funciona bem quando a régua é o entregue, e mal quando a régua é a presença.',
          perguntas: 'Você é avaliada pelo resultado ou pelo horário? O controle que existe aí faz sentido para o seu tipo de trabalho?' },
        { titulo: 'Espaço próprio', texto: 'Precisa de um território onde a decisão é dela, mesmo que pequeno.',
          perguntas: 'Existe alguma parte do trabalho que é sua para decidir? Você teria como ampliar essa parte?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como conflito com regra e com chefia, resistência a processo e desgaste em ambiente muito controlado. É a âncora que mais reage a excesso de controle, um dos fatores que a NR-1 pede para inventariar.'
    },
    {
      id: 'SE', nome: 'Segurança e Estabilidade', cor: '#3F5E7A',
      resumo: 'Previsibilidade, vínculo longo e tranquilidade financeira.',
      definicao: 'Essa pessoa organiza a carreira em torno da estabilidade. Prefere o caminho previsível ao caminho promissor, valoriza benefício e vínculo duradouro, e sente desconforto real diante de mudança e de risco. Não é falta de ambição, é outra prioridade.',
      caracteristicas: [
        'Pesa estabilidade acima de cargo e de salário maior',
        'Prefere plano de carreira previsível a oportunidade arriscada',
        'Considera benefício e futuro ao avaliar proposta',
        'Se incomoda com troca frequente de empresa',
        'Escolhe o caminho seguro quando a alternativa é incerta',
        'Fica leal a quem lhe dá segurança'
      ],
      profissoes: 'Serviço público, grandes empresas estabelecidas, setores regulados, cargos de rotina consolidada e carreira por tempo.',
      motivadores: [
        { titulo: 'Previsibilidade', texto: 'Precisa saber o que vem pela frente. Reestruturação sem informação é o que mais desestabiliza esse perfil.',
          perguntas: 'Você sabe o que esperar do seu trabalho nos próximos meses? A empresa comunica mudança com antecedência?' },
        { titulo: 'Vínculo de longo prazo', texto: 'Investe na relação e espera reciprocidade. Rotatividade alta ao redor a afeta mesmo quando o cargo dela não está em risco.',
          perguntas: 'Você se imagina aí daqui a cinco anos? A empresa demonstra que conta com você?' },
        { titulo: 'Segurança financeira', texto: 'Remuneração e benefício não são detalhe, são a base sobre a qual ela decide o resto.',
          perguntas: 'A sua renda cobre com folga os seus compromissos? O pacote de benefícios te protege de fato?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como insegurança no emprego, um dos fatores psicossociais mais consistentemente ligados a ansiedade na literatura. Em cenário de mudança organizacional, esse é o perfil que adoece primeiro e é o que mais se beneficia de comunicação clara.'
    },
    {
      id: 'CE', nome: 'Criatividade Empreendedora', cor: '#C99A2E',
      resumo: 'Criar algo próprio, que exista porque essa pessoa fez existir.',
      definicao: 'O motor aqui é construir. Não basta melhorar o que já está de pé nem realizar o projeto de outra pessoa: essa âncora pede autoria. Aceita risco, inclusive financeiro, e costuma ter mais ideias do que tempo para tocar todas.',
      caracteristicas: [
        'Quer construir algo que leve a própria marca',
        'Prefere começar do zero a aprimorar o que existe',
        'Aceita risco financeiro para ver a ideia de pé',
        'Tem mais ideias do que tempo para executar',
        'Se cansa quando o projeto vira rotina',
        'Mede sucesso pelo que criou, não pelo cargo que ocupa'
      ],
      profissoes: 'Empreendedorismo, sociedade em negócio próprio, criação de produto, inovação, franquias e áreas de novos negócios.',
      motivadores: [
        { titulo: 'Autoria', texto: 'Precisa que exista algo com a digital dela. Executar o projeto alheio, por melhor que seja, não preenche.',
          perguntas: 'O que existe hoje porque você criou? Você tem espaço para propor e tocar coisas suas?' },
        { titulo: 'Risco tolerado', texto: 'Precisa de ambiente onde tentar e errar seja possível. Cultura punitiva com erro trava esse perfil por completo.',
          perguntas: 'O que acontece aí quando uma tentativa não dá certo? Você tem recurso para testar antes de ter certeza?' },
        { titulo: 'Ritmo de novidade', texto: 'Se cansa do que virou rotina e precisa de frentes novas para não perder o interesse.',
          perguntas: 'Quanto do seu trabalho hoje é repetição? Existe uma frente nova no seu horizonte?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como tédio, dispersão e projetos abandonados pela metade. O risco típico deste perfil é o oposto do comum: não é a falta de trabalho, é a autoexploração, porque a pessoa assume mais do que cabe e não reconhece o limite como problema.'
    },
    {
      id: 'SD', nome: 'Serviço e Dedicação a uma Causa', cor: '#6B4A7A',
      resumo: 'Trabalhar por algo que melhore a vida de alguém.',
      definicao: 'Essa pessoa precisa que o trabalho signifique. Ela escolhe pela causa e pelos valores, e o desalinhamento ético pesa mais nela do que salário e cargo. Trabalho que só gera lucro, para ela, esvazia.',
      caracteristicas: [
        'Precisa sentir que o trabalho melhora a vida de alguém',
        'Recusa cargo em empresa cujos valores não aceita',
        'Escolhe pela causa antes do salário',
        'Se esvazia quando o trabalho não tem propósito visível',
        'Quer que a profissão sirva a algo maior que ela',
        'Cobra coerência entre o discurso e a prática da empresa'
      ],
      profissoes: 'Saúde, educação, assistência social, terceiro setor, sustentabilidade, direitos humanos, segurança e áreas de impacto.',
      motivadores: [
        { titulo: 'Sentido visível', texto: 'Precisa enxergar quem é beneficiado pelo que ela faz. Trabalho a muitas camadas de distância do destinatário final desmotiva.',
          perguntas: 'Você consegue ver quem se beneficia do seu trabalho? Com que frequência tem contato com esse efeito?' },
        { titulo: 'Coerência da empresa', texto: 'O discurso precisa bater com a prática. Incoerência entre valor declarado e conduta real é o que mais rápido a afasta.',
          perguntas: 'A empresa faz o que diz que faz? Você já foi solicitada a fazer algo que contraria o que você acredita?' },
        { titulo: 'Contribuição reconhecida', texto: 'Quer que a contribuição seja vista como contribuição, e não apenas como produtividade.',
          perguntas: 'O valor do que você faz é reconhecido além do número? A causa aparece na conversa do dia a dia?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como esvaziamento de sentido, que é um dos componentes do burnout na formulação de Maslach. É também o perfil mais exposto ao sofrimento moral, quando a pessoa é levada a agir contra o que acredita.'
    },
    {
      id: 'PD', nome: 'Puro Desafio', cor: '#8C3B3B',
      resumo: 'Vencer o que parecia impossível, e depois procurar o próximo.',
      definicao: 'O que move essa pessoa é a dificuldade em si. O conteúdo importa menos que o tamanho do obstáculo. Ela procura problemas insolúveis, adversários difíceis e metas que os outros acham fora de alcance, e perde o interesse assim que a coisa fica fácil.',
      caracteristicas: [
        'É atraída justamente pelo problema que ninguém resolveu',
        'Perde o interesse quando a tarefa fica fácil',
        'Gosta de disputa e não se contenta com o segundo lugar',
        'Procura obstáculo maior mesmo quando já está bem',
        'Se move por superar a própria marca',
        'Fica leal a quem lhe oferece desafio constante'
      ],
      profissoes: 'Recuperação de operação em crise, vendas complexas, alta competição, cirurgia e especialidades críticas, esporte de rendimento, consultoria de virada.',
      motivadores: [
        { titulo: 'Desafio contínuo', texto: 'Precisa de um obstáculo à frente o tempo todo. Estabilidade prolongada, para esse perfil, é tédio.',
          perguntas: 'Qual é o desafio que está na sua frente agora? Quando foi a última vez que você fez algo que parecia grande demais?' },
        { titulo: 'Autossuperação', texto: 'O adversário principal costuma ser ela mesma, e precisa de régua para medir a própria evolução.',
          perguntas: 'Você tem como medir a sua evolução aí? Existe marca sua a ser superada?' },
        { titulo: 'Reconhecimento pela conquista', texto: 'Quer ser reconhecida pelo feito difícil, não pelo esforço constante.',
          perguntas: 'As suas conquistas são vistas? Quem sabe o tamanho do que você resolveu?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece como inquietação e saída precoce. Quando é atendida em excesso, vira o risco oposto e mais grave: essa pessoa aceita carga acima do sustentável porque enxerga cada demanda como desafio pessoal, e costuma ser a última a reconhecer exaustão.'
    },
    {
      id: 'EV', nome: 'Estilo de Vida', cor: '#5A7D6E',
      resumo: 'O trabalho precisa caber na vida, e não o contrário.',
      definicao: 'Essa pessoa não separa carreira de vida pessoal: ela quer que as duas avancem juntas. Não é falta de comprometimento, é uma exigência de integração. Ela pode trabalhar muito, desde que a forma do trabalho respeite o resto do que ela valoriza.',
      caracteristicas: [
        'Avalia proposta pelo efeito na vida pessoal',
        'Recusa mudança que desorganize a família',
        'Valoriza flexibilidade acima de cargo maior',
        'Quer crescer sem abrir mão de vínculos',
        'Procura empresa que trate pessoas como pessoas',
        'Espera reconhecimento também em tempo e flexibilidade'
      ],
      profissoes: 'Trabalho remoto e híbrido, autonomia com horário próprio, franquias, carreiras com jornada previsível e organizações com política real de flexibilidade.',
      motivadores: [
        { titulo: 'Flexibilidade real', texto: 'Precisa de acordo sobre quando e onde trabalha, e não de política escrita que ninguém usa.',
          perguntas: 'A flexibilidade que existe aí é praticada de verdade? Você consegue ajustar o trabalho quando a vida exige?' },
        { titulo: 'Fronteira preservada', texto: 'Precisa que o trabalho tenha hora de acabar. Disponibilidade permanente destrói essa âncora.',
          perguntas: 'Você é acionada fora do horário? Consegue desconectar no fim do dia e no fim de semana?' },
        { titulo: 'Evolução equilibrada', texto: 'Quer progredir na carreira sem que as outras áreas da vida fiquem paradas ou em dívida.',
          perguntas: 'Crescer aí custaria o quê da sua vida pessoal? Esse preço é aceitável para você?' }
      ],
      riscoNR1: 'Quando não é atendida, aparece diretamente como conflito trabalho e família, fator psicossocial reconhecido e de leitura obrigatória no inventário. Costuma se manifestar antes em irritabilidade e queda de sono do que em queda de entrega.'
    }
  ];

  const POR_ID = {};
  ANCORAS.forEach(a => { POR_ID[a.id] = a; });

  // ── FASE 1: 40 itens de importância (5 por âncora) ────────────────────
  // Primeira pessoa, tempo presente, linguagem de quem responde no celular.
  // A ordem embaralhada é definida no cliente, não aqui.
  const ITENS = [
    { id:'TF1', ancora:'TF', texto:'Quero ser a pessoa que os outros procuram quando o assunto exige domínio de verdade.' },
    { id:'TF2', ancora:'TF', texto:'Prefiro me aprofundar no que já faço bem a mudar de área e começar do zero.' },
    { id:'TF3', ancora:'TF', texto:'Uma promoção que me afaste da parte técnica do trabalho me interessa pouco.' },
    { id:'TF4', ancora:'TF', texto:'Sinto orgulho quando entrego algo que poucas pessoas saberiam entregar.' },
    { id:'TF5', ancora:'TF', texto:'Escolho onde trabalhar pelo tanto que vou aprender no ofício.' },

    { id:'GG1', ancora:'GG', texto:'Realizo-me quando faço áreas diferentes trabalharem juntas.' },
    { id:'GG2', ancora:'GG', texto:'Quero chegar a uma posição em que a decisão final passe por mim.' },
    { id:'GG3', ancora:'GG', texto:'Prefiro responder pelo resultado do time a responder apenas pelo meu.' },
    { id:'GG4', ancora:'GG', texto:'Encarar conversa difícil com pessoas faz parte do trabalho que eu quero.' },
    { id:'GG5', ancora:'GG', texto:'Interessa-me entender o negócio inteiro, e não somente a minha parte dele.' },

    { id:'AU1', ancora:'AU', texto:'Preciso decidir como faço o meu trabalho, mesmo quando o prazo é apertado.' },
    { id:'AU2', ancora:'AU', texto:'Excesso de regra me faz querer sair, ainda que eu goste do que faço.' },
    { id:'AU3', ancora:'AU', texto:'Aceito ganhar menos em troca de mandar no meu próprio tempo.' },
    // AU4 trocado: a redação anterior, sobre supervisão próxima, media o
    // mesmo que AU5. Esta versão cobre controle sobre a própria agenda,
    // faceta que não estava em nenhum outro item da âncora.
    { id:'AU4', ancora:'AU', texto:'Prefiro escolher as minhas prioridades do dia a receber uma lista pronta.' },
    { id:'AU5', ancora:'AU', texto:'Prefiro responder por mim a depender da aprovação de outra pessoa.' },

    { id:'SE1', ancora:'SE', texto:'Saber que o emprego é estável pesa mais para mim do que o cargo que ele tem.' },
    { id:'SE2', ancora:'SE', texto:'Prefiro um plano de carreira previsível a uma oportunidade arriscada.' },
    { id:'SE3', ancora:'SE', texto:'Penso em benefícios e em futuro quando avalio uma proposta de trabalho.' },
    { id:'SE4', ancora:'SE', texto:'Trocar de empresa com frequência me deixa desconfortável.' },
    { id:'SE5', ancora:'SE', texto:'Diante da dúvida, escolho o caminho seguro em vez do caminho incerto.' },

    { id:'CE1', ancora:'CE', texto:'Quero construir algo que leve a minha marca.' },
    { id:'CE2', ancora:'CE', texto:'Tenho mais ideias de projeto ou de negócio do que tempo para tocar todas.' },
    { id:'CE3', ancora:'CE', texto:'Começar algo do nada me anima mais do que melhorar o que já existe.' },
    { id:'CE4', ancora:'CE', texto:'Aceito correr risco financeiro para ver uma ideia minha de pé.' },
    { id:'CE5', ancora:'CE', texto:'Realizar o projeto de outra pessoa não me basta.' },

    { id:'SD1', ancora:'SD', texto:'Preciso sentir que o meu trabalho melhora a vida de alguém.' },
    { id:'SD2', ancora:'SD', texto:'Recusaria um cargo melhor em uma empresa cujos valores eu não aceito.' },
    { id:'SD3', ancora:'SD', texto:'Escolho onde trabalhar pela causa, antes de escolher pelo salário.' },
    { id:'SD4', ancora:'SD', texto:'Trabalho que serve apenas para gerar lucro me deixa vazio.' },
    { id:'SD5', ancora:'SD', texto:'Quero que a minha profissão sirva a algo maior do que eu.' },

    { id:'PD1', ancora:'PD', texto:'Problema que ninguém conseguiu resolver é o que mais me atrai.' },
    { id:'PD2', ancora:'PD', texto:'Quando a tarefa fica fácil, eu perco o interesse por ela.' },
    { id:'PD3', ancora:'PD', texto:'Gosto de disputa e não me contento com o segundo lugar.' },
    { id:'PD4', ancora:'PD', texto:'Procuro obstáculos maiores mesmo quando já estou bem onde estou.' },
    { id:'PD5', ancora:'PD', texto:'O que me move é superar a minha própria marca.' },

    { id:'EV1', ancora:'EV', texto:'O trabalho precisa caber na vida que eu quero levar.' },
    { id:'EV2', ancora:'EV', texto:'Recusaria uma promoção que me obrigasse a mudar de cidade.' },
    { id:'EV3', ancora:'EV', texto:'Flexibilidade de horário vale mais para mim do que um cargo maior.' },
    { id:'EV4', ancora:'EV', texto:'Quero crescer na carreira sem abrir mão da família e dos amigos.' },
    { id:'EV5', ancora:'EV', texto:'Avalio uma proposta pensando no efeito dela na minha vida pessoal.' }
  ];

  // ── FASE 2: 8 itens de oferta do trabalho atual ───────────────────────
  // Mesma escala de 0 a 100, pergunta invertida: não é o que eu quero, é o
  // que o meu trabalho de hoje me dá. É esta fase que permite o IDA.
  const OFERTA = [
    { ancora:'TF', texto:'Espaço para exercer e aprofundar a sua especialidade.' },
    { ancora:'GG', texto:'Poder de decisão sobre pessoas, recursos e rumo do trabalho.' },
    { ancora:'AU', texto:'Liberdade para definir como, quando e onde você trabalha.' },
    { ancora:'SE', texto:'Previsibilidade, estabilidade e segurança financeira.' },
    { ancora:'CE', texto:'Espaço para criar coisas novas e tocar ideias suas.' },
    { ancora:'SD', texto:'Sentido e contribuição para algo maior do que a tarefa.' },
    { ancora:'PD', texto:'Desafios reais, do tamanho que te tira da zona confortável.' },
    { ancora:'EV', texto:'Equilíbrio entre o trabalho e o resto da sua vida.' }
  ];

  // ── FAIXAS DE LEITURA ─────────────────────────────────────────────────
  // Convenção da AXIS, não ponto de corte validado. Ver aviso no topo.
  const FAIXA_ANCORA = [
    { min:75, rotulo:'Dominante',  nota:'Orienta as escolhas de carreira desta pessoa.' },
    { min:55, rotulo:'Relevante',  nota:'Pesa nas decisões, sem ser determinante.' },
    { min:35, rotulo:'Secundária', nota:'Considerada, mas cede diante das outras.' },
    { min:0,  rotulo:'Periférica', nota:'Praticamente não entra na conta.' }
  ];
  const FAIXA_IDA = [
    { min:51, nivel:'Crítico',      nota:'A função de hoje contraria o que sustenta esta pessoa. Situação de risco para adoecimento e para saída.' },
    { min:31, nivel:'Desalinhado', nota:'Distância grande entre o que a pessoa precisa e o que o trabalho devolve. Exige conversa e ajuste de função.' },
    { min:16, nivel:'Atenção',      nota:'Desalinhamento moderado, do tipo que se acumula em silêncio. Vale acompanhar.' },
    { min:0,  nivel:'Alinhado',     nota:'O trabalho atual entrega, em boa medida, aquilo que move esta pessoa.' }
  ];

  function faixa(tabela, valor) {
    for (const f of tabela) if (valor >= f.min) return f;
    return tabela[tabela.length - 1];
  }

  // ── MOTOR ─────────────────────────────────────────────────────────────
  // respostas = {
  //   itens:      { TF1: 0..100, ... }   40 valores
  //   oferta:     { TF: 0..100, ... }     8 valores
  //   prioridade: ['PD','CE','TF']        as 3 escolhidas, em ordem
  // }
  // O bônus da priorização é pequeno de propósito: ele desempata quem
  // marcou tudo alto na escala livre, sem reescrever o resultado.
  const BONUS = [6, 4, 2];
  // Abaixo disso, a função praticamente não entrega aquela âncora.
  const LIMITE_OFERTA = 30;

  function calcular(respostas) {
    const r = respostas || {};
    const itens = r.itens || {};
    const oferta = r.oferta || {};
    const prioridade = Array.isArray(r.prioridade) ? r.prioridade.slice(0, 3) : [];

    const faltando = ITENS.filter(i => typeof itens[i.id] !== 'number');
    if (faltando.length) throw new Error('Faltam ' + faltando.length + ' respostas na fase 1.');
    if (prioridade.length !== 3) throw new Error('Escolha as 3 âncoras principais.');

    const resultado = ANCORAS.map(a => {
      const meus = ITENS.filter(i => i.ancora === a.id).map(i => Math.max(0, Math.min(100, Number(itens[i.id]))));
      const bruto = meus.reduce((x, y) => x + y, 0) / meus.length;
      const pos = prioridade.indexOf(a.id);
      const pontos = Math.round(Math.min(100, bruto + (pos >= 0 ? BONUS[pos] : 0)));
      const ofertaA = typeof oferta[a.id] === 'number' ? Math.max(0, Math.min(100, Math.round(Number(oferta[a.id])))) : null;
      // Só o gap positivo conta: receber mais do que se precisa não adoece.
      const gap = ofertaA === null ? null : Math.max(0, pontos - ofertaA);
      const f = faixa(FAIXA_ANCORA, pontos);
      return { id:a.id, nome:a.nome, cor:a.cor, resumo:a.resumo,
               pontos, bruto: Math.round(bruto), prioridade: pos >= 0 ? pos + 1 : null,
               oferta: ofertaA, gap, faixa: f.rotulo, faixaNota: f.nota };
    });

    resultado.sort((x, y) => y.pontos - x.pontos || prioridadeDesempate(x, y));
    resultado.forEach((x, i) => { x.posicao = i + 1; });

    const top3 = resultado.slice(0, 3);
    // IDA: média dos gaps das 3 principais, com peso 3, 2 e 1. A âncora
    // que mais importa é a que mais pesa quando não é atendida.
    let ida = null, idaFaixa = null;
    const pesos = [3, 2, 1];
    const comGap = top3.filter(a => a.gap !== null);
    if (comGap.length === 3) {
      const soma = top3.reduce((acc, a, i) => acc + a.gap * pesos[i], 0);
      ida = Math.round(soma / (3 + 2 + 1));
      idaFaixa = faixa(FAIXA_IDA, ida);
    }

    return {
      versao: VERSAO,
      ancoras: resultado,
      top3: top3.map(a => a.id),
      ida,
      idaNivel: idaFaixa ? idaFaixa.nivel : null,
      idaNota: idaFaixa ? idaFaixa.nota : null,
      // Maior gap fora do top 3: às vezes o que adoece não é a âncora
      // principal, é uma secundária completamente ignorada pela função.
      gapMaior: resultado.filter(a => a.gap !== null).sort((x, y) => y.gap - x.gap)[0] || null,
      // Alerta de oferta, que é leitura diferente do IDA de propósito. O
      // IDA olha só as 3 principais, porque é ele que explica escolha de
      // carreira. Mas âncora com oferta muito baixa adoece mesmo quando é
      // secundária: Estilo de Vida em 20 é conflito trabalho e família, e
      // Segurança em 20 é insegurança no emprego, dois fatores que o
      // inventário da NR-1 tem de registrar independentemente do ranking.
      alertas: resultado
        .filter(a => a.oferta !== null && a.oferta <= LIMITE_OFERTA)
        .sort((x, y) => x.oferta - y.oferta)
        .slice(0, 3)
        .map(a => ({ id:a.id, nome:a.nome, oferta:a.oferta, posicao:a.posicao,
                     leitura: POR_ID[a.id].riscoNR1 }))
    };
  }

  function prioridadeDesempate(x, y) {
    const a = x.prioridade || 99, b = y.prioridade || 99;
    return a - b;
  }

  const API = { VERSAO, ANCORAS, POR_ID, ITENS, OFERTA, FAIXA_ANCORA, FAIXA_IDA, calcular };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.AXIS_ANCORA = API;

})(typeof window !== 'undefined' ? window : globalThis);
