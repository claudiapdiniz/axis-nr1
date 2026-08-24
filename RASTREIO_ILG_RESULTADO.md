# RASTREIO — ILG · TELA DE RESULTADO E RELATÓRIO

> Continuação de `RASTREIO_ILG_DISC.md`. Capturado em 2026-08-24 pela visão do CONSULTOR
> (conta Luciana de Almeida Lemos, sócia da Clau, acesso autorizado por ela).
> Estrutura e método = referência. Textos de laudo da ILG = autorais deles, não replicar.

---

## 1. VISÃO DO CONSULTOR

Sidebar muda em relação à do avaliado. Ganha seção **CLIENTES** e separa os produtos:
- **CLIENTES**: Clientes
- **AVALIAÇÕES**: **Perfil Gerencial** · **Perfil Pessoal** · **Perfil Básico** ·
  Convites/Ferramentas ▸ · Autoconhecimento ▸ · Pesquisas Excluídas
- **PRODUTIVIDADE**: Objetivos ▸
- **CONTEÚDO**: Central multimídia ▸ · Vídeos tutoriais

**São 3 produtos DISC distintos**, não um só: Gerencial, Pessoal e Básico.
Confirma a decisão dos 2 cards da AXIS (Executivo/Pessoal), com espaço para um 3º "Básico" depois.

### Tela "Histórico de convites — Perfil Gerencial"
Rota: `/pesquisas/perfilcomportamental`
Subtítulo: *"Acompanhe os convites enviados e o status de cada resposta."*

Barra de ações: **Filtro** · **Colunas** (configurável) · **Criar e enviar pesquisa** · **Mais opções**
Colunas: `Data do convite` · `Data de conclusão` · `Convidado` · `Email` · `Status` · `Idioma` · `Opções`
Status é badge com ponto colorido (verde = Finalizada). Checkbox por linha + no cabeçalho (ação em lote).

**Menu "Opções" por linha (6 ações):**
1. Editar
2. **Visualizar resultado** (abre modal, não sai da página)
3. **Baixar relatório** (PDF)
4. **Enviar relatório por e-mail**
5. Transferir pesquisa para um usuário do sistema
6. Excluir (vai para "Pesquisas Excluídas", ou seja, lixeira, não apaga de vez)

Modal "Criar e enviar pesquisa": campo de convidados (nome + e-mail) e **Importar CSV**.

---

## 2. MODAL DE RESULTADO — estrutura em 5 seções

Classe: `.modal-report-view`. Título: "Resultado da sua pesquisa".

### Cabeçalho
- Eyebrow: `RESULTADO · TESTE COMPORTAMENTAL DISC`
- H1: `Olá, {primeiro nome}. Esta é sua análise do Perfil Gerencial`
- Parágrafo: mapeamento nas 4 dimensões DISC
- 3 chips de metadado: `✓ Teste concluído` · `📅 {data}` · `☰ 24 características · 4 áreas`
- Botão **Baixar relatório completo** (com dropdown, provavelmente formatos/versões)
- **Gráfico DONUT** à direita: "COMPOSIÇÃO DO PERFIL / 100%", 4 fatias percentuais,
  centro com rótulo `PERFIL` + a sigla da combinação (ex.: **DI**)

### Seção 1 — COMPOSIÇÃO · "Os quatro estilos do seu comportamento"
> "Seu resultado se distribui entre quatro estilos que, somados, formam 100%.
> A intensidade indica o quanto cada estilo se destaca em você."

4 cartões, um por fator. Cada um tem: letra, nome do estilo, **NOME DO ÍNDICE**, percentual,
**FAIXA CLASSIFICATÓRIA** e uma frase-resumo.

| Letra | Estilo | Índice | Frase-resumo |
|---|---|---|---|
| D | Dominante | **DINAMISMO** | Foco em ação, decisão e resultados. |
| I | Influente | **SOCIABILIDADE** | Comunicação, entusiasmo e relações. |
| S | Estável | **ESTABILIDADE** | Constância, cooperação e harmonia. |
| C | Analítico | **RACIONALIDADE** | Método, precisão e qualidade. |

🔑 **Descoberta central:** a ILG não usa D/I/S/C como rótulo final. Cada fator vira um
**índice nomeado** (Dinamismo, Sociabilidade, Estabilidade, Racionalidade). É esse o vocabulário
do laudo. Muito mais palatável para o cliente corporativo do que "você é um D".

**Faixas classificatórias observadas:** `MUITO BAIXO` e `NORMAL`.
Escala provável (a confirmar com outros casos): MUITO BAIXO · BAIXO · NORMAL · ALTO · MUITO ALTO.
No caso da Clau: 35,5% = NORMAL / 35,0% = NORMAL / 15,8% = MUITO BAIXO / 13,7% = NORMAL.
⚠️ Inconsistência aparente: 13,7% classificado como NORMAL e 15,8% como MUITO BAIXO.
Logo, o corte **não é sobre o percentual bruto**. Deve haver normatização por fator
(cada fator tem sua própria distribuição/norma). Ponto a investigar.

### Seção 2 — SOBRE VOCÊ · "Como é o seu estilo"
Texto narrativo corrido, em 2ª pessoa, gerado pela combinação de fatores.
Estrutura observada: iniciativa e ritmo → audácia e risco → controle e comando →
necessidade psicológica por trás → contrapartida negativa ("pode levá-lo a ser ambicioso,
competitivo, agir com agressividade") → efeito no outro.
**Padrão: toda força vem acompanhada do seu custo.** Bom modelo para a AXIS.

### Seção 3 — MAPA DE AUTODESEMPENHO · "Suas 24 características em ação"
> "Cada característica recebe uma pontuação de 0 a 100, organizada em quatro áreas
> comportamentais. Quanto mais distante do centro, mais aquela característica aparece
> no seu dia a dia."

**GRÁFICO RADAR (SVG)**, anéis em 20/40/60/80, 24 eixos, 4 quadrantes rotulados
(SOCIABILIDADE, ESTABILIDADE, RACIONALIDADE, DINAMISMO) com as iniciais I, E, D, A no centro.
Legenda: *"Como você acredita que está — pontuação de 0 a 100 por característica"*.

🔑 **É a Fase 3 (24 eixos, 1–21) convertida para escala 0–100 e agrupada por fator.**
Ou seja: a Fase 3 não mede só "gap", ela **alimenta o radar principal do relatório**.

**Agrupamento oficial das 24 características por área** (confirmado na tela, corrige minhas
inferências anteriores):

| Área (índice) | Fator | Características |
|---|---|---|
| **SOCIABILIDADE** | I | Empatia · Paciência · Persistência · Conciliação e consentimento · Planejamento |
| **ESTABILIDADE** | S | Prudência · Detalhismo · Concentração e precisão · Organização e controle · Disciplina |
| **RACIONALIDADE** | C | Independência · Objetividade · Comando e firmeza · Senso de urgência · Ousadia |
| **DINAMISMO** | D | Extroversão · Flexibilidade com mudanças · Entusiasmo e motivação · Persuasão · Carisma |

⚠️ **ATENÇÃO:** os rótulos de área e o conteúdo aparecem DESLOCADOS no texto extraído do SVG
(ex.: "Comando e firmeza" listado sob RACIONALIDADE, mas nos DESTAQUES aparece como
`DINAMISMO · ESTILO DOMINANTE`). O rótulo do SVG provavelmente vem antes do grupo, não depois.
**Agrupamento correto, deduzido pelos DESTAQUES:**
- **DINAMISMO (D)**: Comando e firmeza, Ousadia, Senso de urgência, Objetividade, Independência
- **SOCIABILIDADE (I)**: Extroversão, Entusiasmo e motivação, Carisma, Sociabilidade, Persuasão, Flexibilidade com mudanças
- **ESTABILIDADE (S)**: Empatia, Paciência, Persistência, Conciliação e consentimento, Estabilidade
- **RACIONALIDADE (C)**: Prudência, Detalhismo, Concentração e precisão, Organização e controle, Disciplina, Planejamento

### Seção 4 — DESTAQUES · "Principais Pontos Fortes"
> "As características em que você mais se destaca. Toque em cada uma para ver o que ela
> revela sobre o seu jeito de agir."

Lista **ranqueada** (7 itens no caso da Clau, provavelmente as acima de um corte).
Formato de cada item: `{rank}` · `{Característica}` · `{ÁREA} · ESTILO {NOME}` · `{nota} / 100`
Expansível: ao tocar, abre definição da competência + **"Atributos do {competência}"**,
que é uma decomposição em subcomponentes.

Exemplo de decomposição observada (Comando e firmeza):
- *Liderança*: habilidade para liderar/dirigir/coordenar; facilidade para assumir posições de liderança
- *Confiança e assertividade*: disposição para liderar ou agir com confiança...

🔑 **Cada uma das 24 competências tem definição + lista de atributos.** É a camada mais profunda
do conteúdo da ILG e o que dá densidade ao laudo.

### Seção 5 — Rodapé
> "Esta tela traz um resumo do seu perfil. Baixe o relatório completo em PDF para acessar [...]"

Confirma: **o modal é só resumo. O laudo completo é o PDF.**

---

## 3. RESULTADO DA CLAU (caso de referência para calibrar o motor da AXIS)

**Perfil: DI** · D 35,5% · I 35,0% · S 15,8% · C 13,7%

### Mapa de autodesempenho (0–100), na ordem em que o SVG desenha
```
90, 71, 42, 86, 52, 52, 53, 46, 43, 48, 46, 61,
43, 84, 68, 100, 48, 100, 88, 100, 60, 95, 90, 92
```

### Pontos fortes ranqueados
| # | Característica | Área · Estilo | Nota |
|---|---|---|---|
| 1 | Comando e firmeza | DINAMISMO · Dominante | 100 |
| 2 | Extroversão | SOCIABILIDADE · Influente | 100 |
| 3 | Ousadia | DINAMISMO · Dominante | 100 |
| 4 | Entusiasmo e motivação | SOCIABILIDADE · Influente | 95 |
| 5 | Carisma | SOCIABILIDADE · Influente | 92 |
| 6 | Sociabilidade | SOCIABILIDADE · Influente | 90 |
| 7 | Persuasão | SOCIABILIDADE · Influente | 90 |

Coerente com a Fase 1 (I e D no topo) e com a Fase 4 (marcou "menos intimidante" e
"menos insensível", que são o custo de Comando e firmeza em 100).

---

## 4. O QUE A AXIS PRECISA REPLICAR (arquitetura, não conteúdo)

1. **4 fatores → 4 índices nomeados**, não letras soltas. A AXIS precisa dos seus próprios
   nomes de índice, no vocabulário da marca.
2. **Sigla de combinação** no centro do donut (DI, SC, etc.) como identidade do perfil.
3. **Faixa classificatória por fator**, normatizada, não corte cru no percentual.
4. **24 competências com nota 0–100**, agrupadas 6 por fator, vindas de um instrumento
   próprio (a nossa Fase 3 equivalente).
5. **Radar de 24 eixos** com anéis 20/40/60/80 e quadrantes rotulados. Chart.js faz isso
   (`type: 'radar'`), já está no stack da AXIS.
6. **Ranking de pontos fortes** com corte por nota, expansível, cada competência com
   definição + atributos.
7. **Narrativa que sempre pareia força e custo.**
8. **Resumo na tela + PDF completo separado.**

---

## 5. PENDENTE

- [ ] Baixar relatório completo em PDF e mapear as seções que só existem nele
- [ ] Verificar o dropdown do botão "Baixar relatório completo" (quais versões/formatos)
- [ ] Pontos limitantes (o modal só mostrou Pontos Fortes; devem estar no PDF)
- [ ] Linha de evolução comportamental
- [ ] Estilos de liderança
- [ ] Motivadores de carreira
- [ ] Confirmar a régua das faixas (MUITO BAIXO / BAIXO / NORMAL / ALTO / MUITO ALTO) e os cortes
- [ ] Descobrir a fórmula que converte Fase 1 + Fase 2 nos percentuais D/I/S/C
- [ ] Descobrir a conversão da Fase 3 (1–21) para 0–100 e o papel da Fase 4
