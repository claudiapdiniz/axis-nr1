# Módulo Inspeção de Campo (foto + voz) — Especificação Técnica

**Plataforma:** AXIS Insight NR-1 (`claudiapdiniz/axis-nr1`, Railway)
**Data:** 30/07/2026
**Status:** especificação. Nenhuma linha de código deve ser escrita antes do gate comercial (seção 12).

---

## 1. O que é

Um app web de campo onde o técnico anda pela empresa, fotografa e **dita** o que vê. A IA organiza o ditado em itens estruturados por setor, classifica risco, e a plataforma gera o laudo em PDF com foto, data, responsável e assinatura. Na inspeção seguinte, o sistema compara com a anterior e mostra o que foi corrigido e o que continua aberto.

**Por que existe:** a NR-1 exige inventário de riscos, plano de ação e evidência de que a medida foi implementada. Hoje isso é feito em planilha e foto solta no WhatsApp. O comparativo entre inspeções é exatamente a prova que a fiscalização pede, e ninguém entrega isso pronto.

**Gancho de venda:** fiscalização punitiva em vigor desde 26/05/2026 (Portaria MTE 765/2025). O comprador paga por multa evitada, não por conveniência.

---

## 2. As três decisões técnicas que fazem o custo fechar

Esta é a diferença entre este módulo e a ideia de vistoria imobiliária que foi descartada. Lá, o custo de IA crescia com o uso e não cabia no preço de mercado. Aqui, não cresce.

**Decisão 1: a foto é evidência, não entrada da IA.**
Nenhuma foto passa por modelo de visão. A foto é anexada ao item, exibida no laudo e guardada no histórico. Quem descreve o problema é o técnico, pela voz. Isso elimina de uma vez o item mais caro da conta.

**Decisão 2: a transcrição é do navegador, não da API.**
Web Speech API (`SpeechRecognition`, `lang: 'pt-BR'`) roda nativa no Chrome Android e no Chrome desktop. Custo zero, funciona no celular do técnico, com campo de digitação como fallback. Não usar API de transcrição paga na v1.

**Decisão 3: a IA só estrutura texto curto.**
O único uso de modelo é transformar o texto ditado em JSON estruturado (setor, item, descrição normalizada, grau de risco, NR aplicável sugerida). É texto curto entrando e texto curto saindo. Modelo: `claude-haiku-4-5` (US$ 1,00 por milhão de tokens de entrada, US$ 5,00 de saída, contexto de 200K), suficiente para essa tarefa.

**Conta de custo por inspeção** (20 itens, uma chamada em lote por inspeção): entrada ~4.000 tokens, saída ~2.500 tokens. Isso dá **US$ 0,017 por inspeção**, cerca de **R$ 0,09** ao câmbio de ~R$ 5,40. Mesmo com 100 inspeções por mês num cliente, o custo de IA fica abaixo de R$ 10,00.

Para comparação, a versão com visão em 200 fotos por vistoria custaria entre R$ 1,50 e R$ 5,00 por vistoria só de API, contra uma receita de mercado de ~R$ 14 por vistoria. Era essa conta que inviabilizava a outra ideia.

---

## 3. Onde encaixa no que já existe

O repo canônico é `C:/Users/maste/Downloads/axis-nr1-temp` (as outras 3 cópias locais estão desatualizadas). Servidor único: `server-cloud.js`, roteamento manual por `req.url`, Postgres no Railway.

| Componente | Padrão a seguir | Referência no repo |
|---|---|---|
| Página do técnico | HTML standalone servido pelo servidor | `denuncia.html`, `escuta-ativa.html`, `ipl-avaliar.html` |
| Tabela | Postgres, criada no `initDB` | `axis_casos` (JSONB) em `server-cloud.js:287` |
| Rotas | `/api/axia/<modulo>` | `/api/axia/casos`, `/api/axia/casos/irc` |
| View no portal | `view-inspecoes` + `navTo()` + classes `.card`/`.ch`/`.cb` | `axia-portal.html`, seção Monitoramento |
| PDF | Gerado client-side via Blob URL, sem endpoint | `abrirRelatorioMRPCompleto`, `discAbrirRelatorio` |

**Atenção nos dois pontos onde já houve bug:**
1. Template literal com `</script>` literal dentro quebra o bloco. Sempre escapar com `${'</script>'}`.
2. O tema do `axia-portal.html` é CLARO (`--preto:#1F1F1F --amarelo:#C9A84C --bege:#D8C7B8 --fundo:#F5F5F3`). Não confundir com o mockup de tema escuro que usa `--gold/--bg`.

---

## 4. O problema de armazenamento de foto (resolver antes de codar)

`axia_relatorios` guarda PDF em **base64 no Postgres**, com o comentário explícito no código: *"base64 no Postgres porque o filesystem do Railway é efêmero"*. Limite atual de 11 MB por upload (`server-cloud.js:1348`).

Isso funciona para 1 PDF por empresa. **Não funciona para inspeção**, que gera de 20 a 40 fotos por visita. A 200 KB por foto comprimida, são 4 a 8 MB por inspeção, direto no banco. Doze inspeções e o Postgres do Railway vira o gargalo e o custo.

**Solução para a v1, nesta ordem:**

1. **Compressão obrigatória no cliente antes do upload.** Canvas, redimensionar para 1280px no lado maior, JPEG qualidade 0.7. Reduz uma foto de celular de ~4 MB para ~180 KB. Isso não é opcional.
2. **Storage de objeto, não Postgres.** Usar Supabase Storage (a conta já existe e é usada no AXIS FIT e no AXIS Transfer). O Postgres guarda só a URL e os metadados. Free tier de 1 GB comporta cerca de 160 inspeções com 30 fotos cada.
3. Se por algum motivo o Supabase não puder ser usado, o fallback é base64 no Postgres **com teto rígido de 30 fotos por inspeção**, e migração planejada. Não é o caminho recomendado.

---

## 5. Modelo de dados

Uma tabela, JSONB, seguindo o padrão do `axis_casos`:

```sql
CREATE TABLE IF NOT EXISTS axis_inspecoes (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  dados       JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inspecoes_company ON axis_inspecoes(company_id);
```

Shape do `dados`:

```json
{
  "titulo": "Inspeção de Segurança, setor produção",
  "responsavel": { "nome": "", "cargo": "", "registro": "" },
  "data_inspecao": "2026-08-05",
  "status": "rascunho | finalizada",
  "inspecao_anterior_id": null,
  "assinatura_base64": null,
  "itens": [
    {
      "id": "it_01",
      "setor": "Produção",
      "descricao_ditada": "extintor do corredor com carga vencida",
      "descricao_normalizada": "Extintor de incêndio com carga vencida no corredor de acesso",
      "risco": "alto",
      "nr_sugerida": "NR-23",
      "foto_url": "https://...",
      "status": "aberto | corrigido | reincidente",
      "prazo": "2026-08-20",
      "responsavel_acao": ""
    }
  ]
}
```

Campos `risco`, `nr_sugerida` e `descricao_normalizada` vêm da IA. Todos são **editáveis pelo técnico antes de finalizar**. A IA sugere, o responsável técnico assina. Isso não é detalhe de UX, é o que sustenta a validade do laudo.

---

## 6. Rotas

| Método | Rota | Função |
|---|---|---|
| GET | `/api/axia/inspecoes?companyId=` | Lista inspeções da empresa |
| GET | `/api/axia/inspecoes/:id` | Carrega uma inspeção |
| POST | `/api/axia/inspecoes` | Cria ou atualiza (upsert por id) |
| POST | `/api/axia/inspecoes/estruturar` | Recebe texto ditado, devolve itens estruturados (chama a API) |
| POST | `/api/axia/inspecoes/finalizar` | Trava a inspeção, grava assinatura, calcula comparativo |
| GET | `/api/axia/inspecoes/link` | Gera link tokenizado para o técnico em campo |

A chamada à API da Anthropic fica **no servidor**, nunca no cliente. A chave nunca vai para o HTML.

---

## 7. Fluxo do técnico (`inspecao.html`)

1. Abre o link tokenizado no celular. Sem login, só token, igual ao padrão do `axia-responder.html`.
2. Escolhe o setor (lista vem de `axiaEmployees.setor` da empresa, com opção de digitar novo).
3. Tela única de captura, repetida por item:
   - Botão grande de foto (`<input type="file" accept="image/*" capture="environment">`)
   - Botão de microfone que ativa o `SpeechRecognition`, com o texto aparecendo em tempo real e campo editável abaixo
   - Botão "próximo item"
4. Ao final, "Finalizar inspeção": envia todos os textos numa chamada só para `/estruturar`, mostra a lista estruturada para revisão e edição.
5. Assinatura em canvas (`signature pad`, mesma técnica já usada nas assinaturas do relatório de evidências).
6. Envia. Fica offline-tolerante: rascunho salvo em `localStorage` a cada item, sincroniza quando houver rede.

**Fora de escopo da v1:** app nativo, sync offline completo com fila de retry, reconhecimento de dano por imagem, múltiplos técnicos na mesma inspeção ao mesmo tempo.

---

## 8. O comparativo (o diferencial real)

Ao finalizar, o servidor busca a inspeção anterior da mesma empresa e mesmo setor e classifica cada item:

- **Corrigido:** item existia antes, não aparece agora. Entra no laudo como evidência positiva.
- **Reincidente:** item existia antes e aparece de novo. Sobe automaticamente um grau de risco.
- **Novo:** não existia antes.

O casamento entre itens é por **similaridade de texto normalizado dentro do mesmo setor**, não por id. Na v1, comparação simples de tokens em comum acima de um limiar. Se ficar impreciso, a v2 pode usar a própria IA para o pareamento, com custo desprezível pelo mesmo motivo da seção 2.

Isso alimenta direto o `/api/axia/action-plan`, que já existe.

---

## 9. Relatório PDF

Gerado client-side, Blob URL, mesmo padrão do MRP e do DISC. Estrutura:

1. Capa: empresa, período, responsável técnico, logo AXIS
2. Resumo: total de itens, distribuição por grau de risco, taxa de correção desde a inspeção anterior
3. Inventário de riscos: tabela por setor, com foto miniatura, descrição, risco, NR
4. Plano de ação: item, medida, prazo, responsável
5. Comparativo: corrigidos, reincidentes, novos
6. Declaração técnica e assinaturas

CSS de impressão A4 já padronizado no repo: `@page { size: A4; margin: 12mm 10mm }`, `.page` em 718px na tela, `table-layout: fixed`.

---

## 10. Esforço

| Frente | Estimativa |
|---|---|
| `inspecao.html` (captura, voz, foto, assinatura) | 1,5 a 2 dias |
| Rotas + tabela + integração Anthropic + Supabase Storage | 1 dia |
| View `view-inspecoes` no portal | 0,5 dia |
| Gerador de PDF | 1 a 1,5 dia |
| Comparativo entre inspeções | 0,5 dia |
| **Total** | **4,5 a 6 dias de trabalho concentrado** |

---

## 11. Preço

Regra fixa daqui em diante, definida a partir do erro de precificação do AXIS FIT (R$ 2.000 pagamento único com infra recorrente):

- **Implantação:** R$ 3.500 a R$ 6.000, conforme número de setores e unidades
- **Mensalidade obrigatória:** R$ 250 a R$ 450, contrato de 12 meses, cobrindo infra, storage, IA e suporte
- **Sem a mensalidade, não assinar.** O custo recorrente real (Railway + Supabase + API) fica entre R$ 60 e R$ 120 por cliente por mês. A margem está na mensalidade, não na implantação.

---

## 12. Gate comercial (ler antes de abrir o editor)

Este documento é material de venda, não ordem de construção. O congelamento de 90 dias aceito em 08/07/2026 continua valendo até outubro.

**Não escrever código antes de pelo menos uma destas condições:**

1. Uma empresa assinou proposta com entrada paga, **ou**
2. Existe reunião marcada onde este módulo é o objeto da proposta e o cliente pediu para ver funcionando.

**O que pode ser feito agora, sem violar o congelamento:** usar as seções 1, 2 e 8 deste documento como argumento de venda, e demonstrar o fluxo com a plataforma NR-1 que já está no ar.

Se a demonstração exigir uma tela, o caminho mais barato é um protótipo estático de uma página só, sem backend, sem IA, sem banco. Meia hora de trabalho, não seis dias.
