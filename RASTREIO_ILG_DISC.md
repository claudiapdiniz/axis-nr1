# RASTREIO — ILG Performance · DISC "Perfil Gerencial"

> Referência estrutural para o módulo DISC Profissional da AXIS.
> Capturado ao vivo na plataforma em 2026-08-24, conta Claudia Diniz (BASIC START MRP).
> **Uso:** a ESTRUTURA (fases, mecânica, escalas, eixos, índices) é referência de engenharia.
> Os ITENS e TEXTOS de laudo da ILG são autorais deles: a AXIS escreve os seus próprios,
> ancorados no material clínico já validado. Decisão confirmada pela Clau em 2026-08-24.

---

## 1. PLATAFORMA

Sidebar ILG:
- **INÍCIO**: Dashboard, Agenda
- **AVALIAÇÕES**: Autoconhecimento ▸ (Linguagem de valorização · Perfil Gerencial), Pesquisas Excluídas
- **CONTEÚDO**: Central multimídia ▸, Vídeos tutoriais
- **NEGÓCIOS**: Compras ▸, Licenças ▸

Topbar: saldo de **Créditos** · Empresas · idioma PT-BR · conta.

Dashboard: saudação + data, botões "Atualizar índices" e "Personalizar".
Cards de KPI: Avaliação média (x/10), Tarefas concluídas, Objetivos concluídos, Sessões ativas,
Tarefas ativas, Objetivos ativos. Widgets: "Convites e notificações" (Rejeitar / Responder o
questionário) e "Meu Perfil Gerencial". Abaixo: Sessões, Atalhos (Transferir/Comprar créditos).

**Modelo de negócio:** o consultor convida por e-mail (remetente = nome do consultor);
o avaliado responde; a tela final diz *"O resultado será liberado pelo(a) profissional que
lhe convidou"*. Liberação do resultado é ato do consultor, não automática. Consome créditos.

O produto DISC deles chama-se **Perfil Gerencial**. Rota interna: `perfilcomportamental`.
- Teste: `/evolving/research/test/perfilcomportamental/{token}`
- Pós-conclusão: `/evolving/declarar/perfilcomportamental`

**Stack observada:** jQuery + jQuery UI (sliders), Alpine.js, Bootstrap, SweetAlert2.
Motor único compartilhado, comentário no fonte: *"DISC — motor compartilhado do questionário V3
(Gerencial · Pessoal · Básico · Research/convite · generic_link)"*. Cada fluxo define seu próprio
`insert_test(Test)`. **Confirma que a ILG usa o mesmo motor para versão Gerencial e Pessoal**,
que é exatamente a divisão dos dois cards da AXIS (DISC Executivo / DISC Pessoal).

---

## 2. ARQUITETURA DO QUESTIONÁRIO — 4 FASES

Barra de progresso: `Fase N/4` + percentual (0% → 50% → 75% → 100%) + 4 segmentos visuais.
Rodapé fixo por fase com contador próprio + botões Voltar / Continuar (Finalizar na fase 4).

| Fase | Mede | Formato | Escala | Itens | Contador | Obrigatória |
|---|---|---|---|---|---|---|
| 1 | Autopercepção (perfil natural) | Ranking forçado (ipsativo) | ordinal 1º a 4º | 10 grupos × 4 adjetivos | "N / 10 · grupos ordenados" | sim |
| 2 | Autopercepção (intensidade) | Régua horizontal | 1 a 9, centro 5 | 15 afirmativas | "N / 15 · respondidas" | sim |
| 3 | Percepção do entorno / gap de desempenho | Régua **vertical** bipolar | 1 a 21, centro 11 | 24 eixos nomeados | "N / 24 · ajustadas" | não (centro = já está bom) |
| 4 | Pontos a reduzir | Checklist múltipla | binário | 52 características | "N selecionados" | **opcional** |

**Insight de engenharia:** as 4 fases não são redundantes, são triangulação.
F1 = perfil natural por escolha forçada (evita aquiescência).
F2 = intensidade por escala Likert-9 (permite grau).
F3 = gap percebido entre como está e como deveria estar (a única que olha para fora).
F4 = pontos negativos, opcional, para não forçar autocrítica falsa.

### Fase 1 — instrução literal
> "Lembre-se: Os adjetivos que você posicionar nas partes superiores dos campos serão aqueles
> que mais descrevem a sua personalidade."
> "De cima para baixo, como mais me identifico em cada grupo:"

UI: duas colunas. Esquerda "ADJETIVOS" (contador restante), direita "MINHA ORDEM" (N/4),
com rótulo "↑ MAIS ME DESCREVE!" no topo e "↓ MENOS ME DESCREVE!" na base.
Clicar move o adjetivo para a ordem, com badge numerado e setas ↑↓ para reordenar.
Não há como remover por clique depois de posicionado. Os 10 grupos ficam na mesma página.

### Fase 2 — instrução literal
> "Leia atentamente cada uma das afirmativas abaixo; Abaixo de cada afirmativa existe uma régua
> com um cursor móvel posicionado inicialmente no centro; Clique em cima do cursor, posicionando-o
> à esquerda ou à direita, definindo o quanto você se identifica com cada afirmativa."

Âncoras: esquerda **"Não tem nada a ver comigo!"** · direita **"Tem tudo a ver comigo!"**
Pergunta guia: *"O quanto me identifico com as afirmativas apresentadas abaixo:"*

### Fase 3 — instrução literal
> "Esta fase da pesquisa leva em consideração a sua percepção de como as pessoas do seu convívio
> avaliam o seu desempenho; (...) Se para determinado comportamento você acredita que o seu
> desempenho já está bom o suficiente, apenas deixe o cursor na posição inicial."

Pergunta guia: *"O que eu deveria ou precisaria ser para ter um melhor desempenho?"*
Grade de 3 colunas, cada cartão com ilustração + régua vertical + frase no topo e frase na base.

### Fase 4 — instrução literal
> "Nesta última fase da pesquisa é apresentada uma lista de características negativas que podem ou
> não representar pontos de melhoria a serem desenvolvidos; (...) A marcação nesta fase é opcional.
> Mas se lembre que ninguém é perfeito e quem mais ganha com o processo de autoconhecimento é você mesmo!"

Pergunta guia: *"Para ter um melhor desempenho, acredito que as pessoas gostariam que eu fosse menos:"*
Grade de 4 colunas de checkboxes.

---

## 3. MODELO DE DADOS (objeto `Test` no cliente)

```
time, has_feedback, convidados, invitation,
list_1 … list_10          → fase 1, array ordenado de 4 chaves de adjetivo
slider_1 … slider_15      → fase 2, inteiro 1–9
{eixo}_should × 24        → fase 3, inteiro 1–21
(checkboxes fase 4 por id)→ fase 4, binário
```

Envio: `insert_test(Test)` via AJAX, com redirect ao final.

---

## 4. FASE 1 — 10 grupos × 4 adjetivos (chave interna = rótulo)

| G | | | | |
|---|---|---|---|---|
| 1 | fast=Rápido | selfdisciplined=Autodisciplinado | contagious=Contagiante | balanced=Equilibrado |
| 2 | motivator=Motivador | ohreally=Sério | calm=Calmo | direct=Direto |
| 3 | excited=Entusiasmado | rational=Racional | demanding=Exigente | need=Preciso |
| 4 | conciliator=Conciliador | dynamic=Dinâmico | humorous=Bem humorado | focused=Concentrado |
| 5 | independent=Independente | prudent=Prudente | planner=Planejador | charismatic=Carismático |
| 6 | comprehensive=Compreensivo | sociable=Sociável | audacious=Audacioso | logical=Lógico |
| 7 | expressive=Expressivo | criterious=Criterioso | firm=Firme | modest=Modesto |
| 8 | organized=Organizado | persuasive=Persuasivo | persistent=Persistente | nice=Agradável |
| 9 | emotional=Emotivo | conservative=Conservador | perfectionist=Perfeccionista | energetic=Enérgico |
| 10 | tolerant=Tolerante | commander=Comandante | observer=Observador | funny=Divertido |

**Leitura DISC (inferência, validar contra o relatório):** cada grupo traz um adjetivo de cada fator.
Ex. G1: fast=D, contagious=I, balanced=S, selfdisciplined=C.
G10: commander=D, funny=I, tolerant=S, observer=C.
Ordem de exibição embaralhada entre grupos (não é sempre D-I-S-C).

---

## 5. FASE 2 — 15 afirmativas (régua 1–9)

1. Considero-me uma pessoa ousada, competitiva e que gosta de desafios. *(D)*
2. Gosto de ouvir opiniões, compartilhar decisões e de fazer planos que costumo seguir com calma e perseverança até o fim. *(S)*
3. Sou minucioso e gosto de tempo para entregar o que faço com precisão. *(C)*
4. Sou do tipo empolgante, amigável e descontraído que gosta de interagir e expressar suas ideias. *(I)*
5. Geralmente eu tenho calma e paciência para lidar com as pessoas ao meu redor. *(S)*
6. Gosto de comandar as situações e pessoas ao meu redor. *(D)*
7. Sou disciplinado e gosto de todos os procedimentos muito bem discriminados para ter o controle das situações. *(C)*
8. Minha performance é muito melhor em ambientes dinâmicos e sem rotinas. *(I/D)*
9. Sou conhecido por motivar pessoas com dinamismo e muito diálogo. *(I)*
10. Sou um bom ouvinte e tenho facilidade para me colocar no lugar do outro. *(S)*
11. Sou do tipo carismático e convenço as pessoas com frequência e facilidade. *(I)*
12. Prefiro tomar decisões sozinho(a) e rapidamente. *(D)*
13. Trabalho bem melhor sozinho em silêncio e sem agitação. *(C)*
14. Estou sempre atento aos prazos, oportunidades e costumo agir imediatamente quando um problema acontece ou está para acontecer. *(D/C)*
15. Costumo lidar bem com situações imprevistas e mudanças não planejadas. *(I, invertido p/ S e C)*

Fatores entre parênteses são inferência minha pela redação, ainda **não confirmados**.

---

## 6. FASE 3 — 24 eixos nomeados (régua vertical 1–21, centro 11)

O nome do eixo vem na classe CSS do slider. **Esta é a espinha dorsal do modelo de competências da ILG.**

| # | eixo interno | polo ↑ (subir) | polo ↓ (descer) |
|---|---|---|---|
| 1 | empathy | Deveria ouvir mais e me colocar no lugar do outro | Deveria ouvir menos e agir com mais individualidade |
| 2 | detail | Deveria prestar mais atenção aos detalhes | Deveria me preocupar menos com detalhes e ser mais direto |
| 3 | daring | Deveria ser mais ousado e arriscar mais | Deveria ser mais cauteloso |
| 4 | conciliation_consent | Deveria ser mais conciliador e ceder mais | Deveria ser mais enérgico e rígido |
| 5 | dynamism | Deveria agir com mais dinamismo | Deveria agir com mais tranquilidade |
| 6 | persuasion | Deveria ser mais convincente | Não estou precisando ser tão convincente |
| 7 | prudence | Deveria ser mais prudente | Deveria ser mais audacioso e aventureiro |
| 8 | enthusiasm_motivation | Deveria ser mais motivado e entusiasmado | Não estou precisando de tanto entusiasmo |
| 9 | rationality | Deveria agir de forma mais racional | Não estou precisando ser tão racional |
| 10 | patience | Deveria ser mais calmo e paciente | Deveria ser mais inquieto e agitado |
| 11 | subject | Deveria ser mais disciplinado | Não estou precisando de tanta disciplina |
| 12 | sociability | Deveria ser mais sociável e comunicativo | Não estou precisando ser tão sociável e comunicativo |
| 13 | flexibility_change | Deveria ter mais flexibilidade com mudanças | Não estou precisando ser tão flexível com mudanças |
| 14 | objectivity | Deveria ser mais objetivo | Não estou precisando de tanta objetividade |
| 15 | planning | Deveria planejar mais antes de agir | Deveria planejar menos e agir com mais rapidez |
| 16 | organization_control | Deveria ser organizado e ter controle de minhas ações | Não estou precisando de tanta organização e controle |
| 17 | command_firmness | Deveria comandar com mais pulso firme | Não estou precisando ser tão comandante |
| 18 | persistence | Deveria ter mais perseverança | Não estou precisando de tanta perseverança |
| 19 | charisma | Deveria ser mais carismático | Não estou precisando ser tão carismático |
| 20 | sense_urgency | Deveria ter mais agilidade e senso de urgência | Não estou precisando de tanta agilidade |
| 21 | stability | Deveria ser mais equilibrado e consistente | Não estou precisando ser tão equilibrado |
| 22 | extroversion | Deveria ser mais extrovertido e me expor mais | Poderia me expor menos e deveria ser mais discreto |
| 23 | independence | Deveria agir de forma mais independente | Deveria agir mais com a ajuda de pessoas |
| 24 | concentration_accuracy | Deveria ter mais concentração e precisão | Não estou precisando ser tão concentrado e preciso |

**Padrão observado:** dois tipos de eixo.
- **Bipolar verdadeiro** (1,2,3,4,5,7,10,15,22,23): os dois polos são comportamentos opostos reais.
- **Unipolar com saturação** (6,8,9,11,12,13,14,16,17,18,19,20,21,24): o polo de baixo é
  "não estou precisando de tanto X". Mede excesso, não o oposto.

Agrupamento provável por fator DISC:
- **D**: daring, dynamism, objectivity, command_firmness, sense_urgency, independence
- **I**: persuasion, enthusiasm_motivation, sociability, charisma, extroversion, flexibility_change
- **S**: empathy, conciliation_consent, patience, persistence, stability
- **C**: detail, prudence, rationality, subject, planning, organization_control, concentration_accuracy

---

## 7. FASE 4 — características a reduzir (52 checkboxes)

Formato do id: `less_{caracteristica}`. Amostra confirmada:
`less_intimidating` (menos intimidante), `less_authoritarian` (menos autoritário),
`less_accommodated` (menos acomodado), `less_predictable` (menos previsível),
`less_playful` (menos brincalhão), `less_undisciplined` (menos indisciplinado),
`less_moody` (menos mal humorado), `less_repressed` (menos reprimido).

Lista completa capturada em `RASTREIO_ILG_FASE4.json`.

**Leitura:** são os polos negativos/exagerados de cada fator. "Intimidante" e "autoritário" = D em
excesso; "brincalhão" = I em excesso; "acomodado" e "previsível" = S em excesso;
"reprimido" e "indisciplinado" = C (excesso e falta).

---

## 8. RESPOSTAS DA CLAU (caso de teste real, para validar o motor da AXIS)

### Fase 1 — ordem escolhida (1º = mais descreve)
```
G1  contagious, fast, selfdisciplined, balanced
G2  motivator, direct, ohreally, calm
G3  excited, demanding, rational, need
G4  dynamic, humorous, conciliator, focused
G5  independent, charismatic, prudent, planner
G6  audacious, sociable, comprehensive, logical
G7  expressive, firm, criterious, modest
G8  persistent, persuasive, nice, organized
G9  energetic, conservative, emotional, perfectionist
G10 commander, funny, tolerant, observer
```
Padrão: **I e D disputando o topo, C acima de S**, contraste alto.

### Fase 2 — valores 1–9
```
1:9  2:9  3:1  4:9  5:9  6:9  7:1  8:9
9:9  10:9 11:9 12:9 13:9 14:9 15:1
```
⚠️ Sem valores intermediários (só 9 e 1). Sinalizado à Clau, que autorizou seguir assim.
Contradições internas presentes (8 vs 15; 12/6 vs 2/10; 13 vs 4/9): a ILG provavelmente
usa isso para índice de consistência. Ponto a observar no relatório.

### Fase 3 — valores 1–21 (centro 11)
```
empathy 14 · detail 14 · daring 8 · conciliation_consent 8 · dynamism 7 · persuasion 7
prudence 15 · enthusiasm_motivation 6 · rationality 14 · patience 14
concentration_accuracy 11 · charisma 11 · sociability 10 · flexibility_change 10
objectivity 13 · planning 14 · organization_control 13 · command_firmness 13
persistence 11 · subject 14 · sense_urgency 9 · stability 12 · extroversion 9 · independence 13
```
21 de 24 ajustadas; persistence, charisma e concentration_accuracy deixadas no centro
(= "já está bom"), intencionalmente.

### Fase 4
(preencher ao concluir)

---

## 9. PENDENTE

- [ ] Fase 4: seleção final da Clau
- [ ] Tela de resultado: quais índices, nomes exatos, escalas, faixas de corte
- [ ] Gráficos: tipos, eixos, séries
- [ ] Relatório narrativo: ordem das seções e granularidade
- [ ] Linha de evolução comportamental
- [ ] Pontos fortes e limitantes: de onde saem (fator, combinação ou índice)
- [ ] Estilos de liderança e motivadores de carreira
- [ ] Área do consultor: comparativos e gestão de avaliados

---

## 10. NOTA TÉCNICA — defeito na plataforma da ILG (2026-08-24)

O motor de interação **não inicializava** neste fluxo: o script esperava um evento de carga que já
havia ocorrido, então `initStage1`, `initSliders2`, `initSliders3` e `initCheckboxes` nunca rodavam.
Resultado: nem clique nem arraste funcionavam em nenhuma fase, para qualquer usuário nesse caminho.

Contornado reinjetando o bloco do próprio motor com as funções internas exportadas
(`window.__pc`), e chamando a inicialização e a navegação de fase manualmente.
As respostas seguem sendo registradas pelo motor original, sem adulteração de valor.

**Lição para a AXIS:** amarrar a inicialização do questionário a um estado verificado do DOM, não a
um evento de ciclo de vida. Se `document.readyState` já for `complete`, inicializar direto.
