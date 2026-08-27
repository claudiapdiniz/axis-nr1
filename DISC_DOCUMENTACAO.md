# MÓDULO DISC — AXIS
Documentação técnica e de produto. Última atualização: 25/08/2026.

---

## 1. O QUE É

Avaliação comportamental vendida a empresas, em duas versões:
**DISC Executivo** (liderança e gestão) e **DISC Pessoal** (relações e autoconhecimento).

Instrumento autoral da AXIS. A arquitetura de quatro fases e a camada de índices
derivados seguem a lógica psicométrica rastreada na ILG Performance em 24/08/2026;
os itens, as capacidades e os textos são originais.

Onde fica: painel `AXIS_NR1_MVP.html` → menu lateral → **Análise** → **DISC** →
cards *DISC Executivo* e *DISC Pessoal*.

---

## 2. ARQUIVOS

| Arquivo | Papel |
|---|---|
| `disc-executivo.js` | Instrumento (itens) + motor de cálculo. Roda no navegador **e** no servidor (CommonJS) |
| `disc-executivo-ui.js` | Telas das 4 fases, resultado, rascunho local e sincronia |
| `disc-admin.js` | Painel da consultora: convidar, acompanhar, reenviar, liberar, ver, baixar |
| `disc-laudo.js` | Laudo individual, 36 páginas, HTML com CSS de impressão A4 |
| `disc-laudo-equipe.js` | Relatório de equipe, 8 páginas |
| `disc-responder.html` | Página do avaliado, servida em `/disc/{token}` |
| `disc-importar-ilg.js` | Leitura do laudo da ILG em PDF e conversão para o formato daqui |
| `RASTREIO_ILG_*.md/json` | O rastreio da plataforma de referência |

Tudo na raiz do repo `claudiapdiniz/axis-nr1`, servido pelo `server-cloud.js`.

---

## 3. O INSTRUMENTO

Quatro fases. Cada uma existe para ser **cruzada com outra**: é o cruzamento que
produz os índices, e nenhum questionário de fase única consegue gerá-los.

| Fase | Formato | Escala | Itens |
|---|---|---|---|
| 1 | Ranking forçado (ipsativo) | 1º ao 4º | 12 grupos × 4 adjetivos |
| 2 | Régua de intensidade (normativa) | 1 a 9 | 24 afirmativas |
| 3 | Eixos bipolares de desempenho | 1 a 21, centro 11 | 24 eixos |
| 4 | Características a reduzir (opcional) | binário | 48 itens |

**Fase 3: o centro é resposta válida** ("já está adequado"). O botão nunca trava
nessa fase, e os eixos não tocados vão explícitos como 11 no envio.

### Fatores
Nomenclatura padrão do DISC, a pedido da Clau:
**D = Dominante · I = Influente · S = Estável · C = Analítico**

### 24 capacidades (6 por fator)
- **Dominante**: Liderança · Ousadia · Objetividade · Senso de urgência · Independência · Dinamismo
- **Influente**: Extroversão · Entusiasmo e motivação · Carisma · Sociabilidade · Persuasão · Flexibilidade com mudanças
- **Estável**: Empatia · Paciência · Persistência · Conciliação e consentimento · Apoio e disponibilidade · Estabilidade
- **Analítico**: Racionalidade · Detalhismo · Organização e controle · Planejamento · Prudência · Disciplina

Os `id` internos são antigos (`comando`, `autonomia`, `escuta`…). **Nunca renomear id**:
as respostas gravadas apontam para ele. Renomear só o campo `nome`.

---

## 4. O MOTOR

`DISC_EXEC.calcular({f1, f2, f3, f4, tempoSegundos})`

- **Perfil natural**: fase 1. Pontos 4/3/2/1 por posição; 12 grupos somam 120; a
  distribuição já sai em percentual e soma 100.
- **Mapa atual (0–100)**: 60% fase 1 + 40% fase 2. A fase 1 pesa mais porque resiste
  à inflação: para colocar um adjetivo em primeiro, outro vai para último.
- **Mapa desejado**: fase 3 aplicada sobre o atual.
- **Faixa por fator**: normalizada sobre 25% (o esperado se as quatro fossem iguais),
  não sobre o percentual bruto.

### Índices derivados
| Sigla | O que mede | De onde vem |
|---|---|---|
| **ITA** | Tendência da autoestima | Combinação ponderada |
| **IPM** | Pontos de melhoria | Fase 3 + fase 4 |
| **IDA** | Discrepância da autopercepção | Fase 1 × fase 2 |
| **IPS** | Positividade seletiva | Só fase 2 |
| **IIA** | Influência do ambiente | Natural × adaptado |
| **TCM** | Tempo consumido | Metadado |

Calibrado em 7 cenários de resposta. **Validação real:** a Clau respondeu os dois
instrumentos em 24/08. ILG deu DI 35,5/35,0/15,8/13,7; AXIS deu DI 39/29/20/12.
Mesmo perfil, mesma ordem, com itens totalmente diferentes.

---

## 5. FLUXO COMERCIAL

```
Consultora convida por e-mail
   → avaliado responde em /disc/{token}, sem senha
   → ao terminar NÃO vê o resultado
   → consultora acompanha o status no painel
   → consultora libera com um interruptor
   → só então o avaliado vê o resultado no mesmo link
```

É esse controle que sustenta a venda: o resultado é entregue pela consultora,
não pelo sistema.

**O cálculo roda no servidor.** O navegador só envia as respostas cruas.

### Tabelas
- `axis_disc_convites` — id, token, modulo, nome, email, empresa, cargo, status,
  liberado, rascunho (JSONB), created_at, completed_at
- `axis_disc_respostas` — convite_id, respostas (JSONB), resultado (JSONB), tempo

### Rotas
| Método | Rota | Uso |
|---|---|---|
| POST | `/api/disc/convites` | Cria convite e envia e-mail |
| GET | `/api/disc/convites` | Lista para o painel |
| POST | `/api/disc/convites/reenviar` | Reenvia convite ou avisa resultado |
| POST | `/api/disc/convites/liberar` | Libera o resultado |
| POST | `/api/disc/convites/excluir` | Remove convite e resposta |
| GET | `/api/disc/resultado/:id` | Resultado para a consultora |
| GET | `/api/disc/equipe?empresa=&modulo=` | Agrega o time |
| GET | `/api/disc/sessao/:token` | O avaliado abre o link |
| POST | `/api/disc/rascunho` | Salva parcial (troca de dispositivo) |
| POST | `/api/disc/responder` | Recebe e **calcula no servidor** |
| GET | `/disc/:token` | Serve a página do avaliado |

### Rascunho em duas camadas
- **localStorage**: recarregar, fechar aba, cair a internet. Instantâneo.
- **Servidor**: trocar de aparelho. Grava na hora ao mudar de fase e, dentro da
  fase, no máximo a cada 12 segundos. Ao fechar a aba usa `sendBeacon`.
- Na volta vence o mais recente. O rascunho é apagado no envio final.

---

## 6. LAUDO INDIVIDUAL — 36 páginas, 9 capítulos

Capa · Sumário · **01** Fundamentos (o que mede, base científica, escolha forçada
vs escala livre, escopo, referências e LGPD) · **02** Composição · **03** Natural e
adaptado · **04** Mapa das 24 · **05** Pontos fortes (uma página cada, com
comparativo e perguntas de devolutiva) · **06** Demais capacidades · **07**
Liderança · **08** Carreira e motivadores · **09** Índices gerais · Encerramento.

**Totalmente determinístico**: não depende de IA. Há ganchos `nar.*` no gerador
para a narrativa do Claude entrar como camada extra.

Botão no painel (ver e baixar) e na tela do avaliado quando liberado.
Nome do arquivo: `AXIS-DISC-Executivo-Nome-Empresa-DD-MM-AAAA.html`

---

## 7. RELATÓRIO DE EQUIPE — 8 páginas

Distribuição dos perfis · quem é quem · concentrações e lacunas do grupo com o
risco de cada uma · 6 maiores forças com **amplitude** (se está concentrada em
poucos, sai da empresa junto com eles) · 6 fragilidades dizendo se há quem cubra ·
pares mais complementares e mais parecidos · índices médios · encerramento.

**É o que muda a venda:** empresa não compra laudo por pessoa, compra o mapa do time.

No painel: chips por empresa com contador de finalizadas. A faixa do relatório só
aparece com **duas ou mais** avaliações finalizadas naquela empresa.

**Abre na tela, não baixa.** Desde 26/08/2026 o relatório de equipe e o laudo
individual abrem dentro da plataforma, em página inteira, com Imprimir, Baixar
arquivo e Fechar (Esc fecha). A impressão sai do próprio documento, que já traz o
CSS A4, então tela e folha são iguais. Baixar continua existindo, virou opção.

---

## 7B. IMPORTAÇÃO DE LAUDO JÁ EXISTENTE

Empresa que já mapeou o time em outra plataforma não refaz tudo para comprar o
relatório de equipe. No painel, ao lado de *Enviar convite por e-mail*, há
**Importar laudo já existente**: anexa o PDF, o servidor lê, a consultora
confere na tela e só então grava.

**O que o PDF da ILG entrega**: perfil natural, adaptado e exigido nas quatro
dimensões, e as 24 capacidades de 0 a 100. 23 capacidades são as mesmas dos dois
lados; "Comando e firmeza" lá é "Liderança" aqui. "Apoio e disponibilidade" não
existe lá e entra estimada pela média das outras do mesmo fator, marcada na tela
para ajuste. "Concentração e precisão" existe lá e não tem par aqui: fica
registrada e não entra no cálculo.

**O que não vem**: ITA, IPM, IDA, IPS e o mapa desejado por capacidade dependem
das fases 2, 3 e 4 e ficam nulos. Só o **IIA** é derivado, porque usa os mesmos
insumos nas duas metodologias (distância entre natural e adaptado). O relatório
de equipe calcula a média de cada índice só sobre quem tem o índice, e diz na
página o que ficou de fora. Nada é inventado para preencher espaço.

**Base do perfil.** O laudo traz dois conjuntos de percentuais e eles classificam
diferente: o que a empresa conhece como "o perfil do fulano" é o do gráfico de
composição (adaptado), enquanto o natural é a essência. A tela de conferência
deixa escolher qual dos dois vira o perfil aqui, com o do laudo como padrão, para
o relatório de equipe não contradizer o documento que o cliente já tem na mão.

**A importada não tem link nem liberação**: o laudo individual dela continua sendo
o PDF de origem. Entra na lista como *Importada*, com a origem e o protocolo, e
conta no relatório de equipe. A rota de liberar recusa avaliação importada.

Leitor de PDF: `pdf-parse@1.1.1`, JavaScript puro, sem dependência nativa. A v2
foi descartada de propósito: exige Node 20.16+ e traz `@napi-rs/canvas`, risco
desnecessário para o deploy do servidor inteiro. Testado nos 11 laudos reais da
ILG (Básico, Gerencial e Pessoal), com as quatro dimensões somando 100 e as 24
capacidades lidas em todos.

| Método | Rota | Uso |
|---|---|---|
| POST | `/api/disc/importar/ler` | Lê o PDF e devolve a prévia. Não grava |
| POST | `/api/disc/importar` | Grava o que a consultora conferiu |

Colunas novas em `axis_disc_convites`: `origem` (`axis` ou `importado`) e
`origem_ref` (plataforma e protocolo de origem). Em `axis_disc_respostas`, o
campo `respostas` guarda o que saiu do PDF e o que foi conferido, lado a lado.

---

## 8. REGRAS DE LAYOUT E IMPRESSÃO

Aprendidas na marra em 24/08:

1. **Tela e folha impressa precisam ter a mesma medida** (210×297mm). Com larguras
   diferentes o texto reflui e o branco do PDF não aparece na tela.
2. **Verificar com as regras REAIS de impressão**: caixa de altura fixa e
   `scrollHeight > clientHeight`. Altura mínima deixa a página crescer em silêncio
   além do A4 e a verificação mente.
3. **Nada de página com item órfão.** Distribuir por igual, não em blocos fixos.
4. **Fonte generosa**: corpo em 15pt.
5. **Página cheia com DADO, não com texto enchendo linguiça**: comparativos, médias,
   painéis, perguntas que variam por faixa.
6. Métrica de aceite: nenhuma página estourando, branco médio abaixo de ~40px.
7. **Sem ícone e sem emoji.** Só o nome.

---

## 9. ARMADILHAS JÁ PAGAS

- **CSS base não injetado no painel.** As regras `.dx-card`/`.dx-q`/`.dx-btn` viviam
  no `injetarCSS()` do questionário; o painel nunca as carregava e a tela aparecia
  toda grudada (padding e margem zero). Exposto como `window.discExecCSS`.
- **Redesenho jogava a pessoa para o topo.** `render()` chamava `scrollTo(0,0)`
  sempre. Agora só sobe ao topo quando MUDA de fase.
- **Navegador segurava JS antigo por horas.** Resolvido com `Cache-Control: no-cache`
  para `.js/.html/.css` no handler de estáticos do `server-cloud.js`.
- **Arquivo HTML já enviado não se atualiza.** Se aparecer nome antigo de capacidade,
  conferir se não é um download velho antes de procurar bug.
- **Média do time e contagem de pessoas na mesma linha confundem quem lê.** A
  consultora leu o relatório da Fique Bem Seguros e concluiu que a conta estava
  errada ao ver "19%" ao lado de "0 pessoas". São medidas diferentes: média da
  dimensão e quantas pessoas a acionam primeiro. Hoje o relatório tem a página
  *Como ler estes números* logo após a capa, e rotula cada medida.
- **Arredondar médias uma a uma quebra o total.** 19,4 + 23,0 + 28,7 + 28,9 dá
  100, mas arredondado vira 20+23+29+29 = 101. A distribuição da sobra pelo maior
  resto (`arredondarSomando100`) resolve, e vale para qualquer percentual que
  precise fechar.
- **Limiar solto contradiz a régua do instrumento.** O texto de lacuna chamava de
  "média baixa" um valor de 19%, porque usava um corte próprio de 22%. A régua do
  DISC é 25% como esperado e 0,70 disso (17,5%) como limite do baixo. Todo texto
  interpretativo tem que usar a mesma régua do cálculo, senão o laudo se contradiz
  na frente do cliente.
- **Inicialização não pode depender de evento de ciclo de vida.** Foi o defeito que
  travou a plataforma da ILG. Aqui se checa `document.readyState`.
- **`disc-graficos.js` ficou fora do painel e da página do avaliado.** Sem ele,
  `disc-laudo.js` e `disc-laudo-equipe.js` abortam na primeira linha e nem se
  registram. A tela só dizia "gerador não carregado". Descoberto em 26/08/2026,
  na primeira vez que o relatório de equipe foi gerado de verdade.
- **A rota `/api/disc/equipe` lia a query da variável errada.** O handler faz
  `const url = req.url.split('?')[0]`, e a rota tentava extrair `?empresa=` de
  `url`. A empresa chegava sempre vazia e a resposta era "empresa obrigatória"
  em qualquer chamada. Usar `params`, que já vem pronto do `req.url` inteiro.
- **Mensagem de erro longe do botão é erro invisível.** A `msg()` escrevia só no
  card do formulário, no alto da página; a faixa do relatório fica bem abaixo e o
  clique parecia não fazer nada. Toda ação precisa devolver resposta onde a pessoa
  está olhando.
- **Nunca mande "recarregue a página" sem dizer o que faltou.** Foi essa mensagem
  genérica que escondeu o `disc-graficos.js` ausente. Hoje o painel nomeia a
  dependência e mostra o código HTTP.

---

## 10. PENDENTE

- [x] **Teste real no Postgres** do relatório de equipe e do agrupamento por empresa.
      Feito em 26/08/2026 com a Fique Bem Seguros: seis laudos da ILG importados,
      agrupados na mesma empresa e relatório gerado na tela. Dois defeitos apareceram
      só aqui, os dois na seção 9 (gráficos fora do painel e query da rota de equipe).
- [ ] **Narrativa por IA no laudo.** Ganchos prontos. É o diferencial que a ILG não tem:
      eles montam texto de catálogo por perfil, a AXIS pode gerar a partir dos índices.
- [ ] **DISC Pessoal com conteúdo próprio.** A infraestrutura já separa por módulo e
      funciona, mas hoje serve o conteúdo do Executivo. Faltam os 48 adjetivos, 24
      afirmativas e 24 eixos no vocabulário de relações.
- [ ] Calibração com amostra real. As faixas são fundamentadas, não validadas.
- [ ] Relatório de equipe com time grande (15+): a tabela "quem é quem" passa de uma página.

---

## 11. LIMITE LEGAL

A AXIS **não tem psicólogo responsável**. O laudo traz o capítulo *Escopo do
instrumento*, com tom de rigor técnico, não de advertência: uma tabela que associa
cada pergunta ao instrumento adequado (perfil / 360 / desempenho / prova técnica /
avaliação clínica) e a orientação de usar o laudo como **um insumo entre outros**
em decisões sobre pessoas. Isso protege a Clau e ainda abre venda das outras camadas.
