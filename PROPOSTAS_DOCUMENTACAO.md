# Módulo de Propostas Comerciais

Documentação técnica. Construído em 25/08/2026, no ar no Railway.
Repo: `claudiapdiniz/axis-nr1`, cópia canônica local `Downloads/axis-nr1-temp`.

## 1. O problema que originou o módulo

A proposta da Studio Sabino & Souza tinha sido feita como artifact do Claude, com botão de aceite que gravava o estado republicando a própria página (`window.claude.use("artifact")` + `artifact.publish`).

Isso só funciona para quem é **dono** do artifact. Quando o cliente clicasse em "Aceitar", o publish falhava e o código caía no fallback "este aceite ficou registrado apenas nesta tela". O mesmo valia para o cadastro de colaboradores e para a data sugerida de reunião. Ou seja: a parte interativa da proposta morria justamente do lado do cliente.

Além disso, aquela proposta levava dentro dela o link `axia-portal.html?admin=1&t=adm_...`, que é o token de impersonation gerado por `/api/axia/admin/impersonate`. Ele entra no portal da empresa sem senha e com `isAdminAccess=1`, o que desliga o `ativarModoProspect()`. Não é eterno (`getAxiaSession` derruba sessões de `axiaSessions` com mais de 8h), mas nunca deve ir para o cliente.

**Regra que ficou:** proposta para cliente nunca leva token de impersonation. O link de demonstração correto é `/vitrine`, que é somente leitura.

## 2. Arquivos

| Arquivo | Papel |
|---|---|
| `server-cloud.js` | Tabela, rotas públicas e rotas admin (bloco "PROPOSTAS COMERCIAIS") |
| `proposta.html` | Página que o cliente abre, servida em `/proposta/TOKEN` |
| `propostas-admin.html` | Painel da consultora |
| `AXIS_NR1_MVP.html` | Item "Propostas" no menu, grupo SISTEMA, abre em aba nova |

## 3. Banco

Tabela `axis_propostas`, criada no fim do `initDB`.

| Coluna | Observação |
|---|---|
| `id`, `token` | `prop_...` e `p_<32 hex>`. O token é o que vai na URL |
| `company_id` | Opcional. Vincula a uma empresa de `axiaCompanies`. É o que libera a importação de colaboradores |
| `cliente`, `contato`, `email` | Dados do destinatário |
| `titulo`, `resumo`, `contexto` | Cabeçalho e seção de abertura. `contexto` vazio não renderiza a seção |
| `escopo`, `etapas` | JSONB, lista de `{titulo, texto, widget}` |
| `valor`, `valor_nota`, `condicoes` | Bloco de investimento. `valor` nulo mostra "A combinar" |
| `validade` | DATE. **Nulo significa sem prazo** |
| `status` | `rascunho`, `enviada`, `aceita`, `recusada`, `arquivada` |
| `aceita_por`, `aceita_em`, `aceita_ip` | Registro do aceite |
| `reuniao_data`, `observacao` | O que o cliente respondeu na etapa da devolutiva |
| `colaboradores` | JSONB, lista de `{nome, email, setor, cargo, em}` |
| `aberturas`, `primeira_abertura`, `ultima_abertura` | Rastreio |
| `enviada_em`, `importada_em` | Envio por e-mail e importação de colaboradores |

## 4. Rotas

### Públicas (o token é a credencial)

| Rota | O que faz |
|---|---|
| `GET /api/proposta/:token` | Devolve a proposta e conta uma abertura. `?preview=1` não conta |
| `POST /api/proposta/:token/aceite` | Grava status, nome, data e IP. Dispara e-mail |
| `POST /api/proposta/:token/colaborador` | Acrescenta um colaborador. Recusa e-mail repetido. Teto de 300 |
| `POST /api/proposta/:token/reuniao` | Grava data sugerida e observação. Dispara e-mail |

Rate limit de 60 POST por hora por IP. Proposta arquivada devolve 410. Proposta vencida ou já aceita recusa novo aceite com 409.

### Admin (`Authorization: Bearer ADMIN_API_TOKEN`)

| Rota | O que faz |
|---|---|
| `GET /api/admin/propostas` | Lista tudo, mais as empresas para o seletor de vínculo |
| `POST /api/admin/propostas` | Cria (sem `id`) ou edita (com `id`) |
| `POST /api/admin/propostas/enviar` | Manda o link por e-mail para o contato, via Resend |
| `POST /api/admin/propostas/status` | Troca o status. Voltar para `enviada` ou `rascunho` **apaga o aceite** |
| `POST /api/admin/propostas/excluir` | Remove a linha. O link morre e o registro do aceite vai junto |
| `POST /api/admin/propostas/importar` | Joga os colaboradores em `axiaEmployees` da empresa vinculada, criando setor e cargo que faltarem e pulando e-mail que já existe |

### Página

`GET /proposta/:token` serve `proposta.html`. O JS lê o token do próprio caminho.

## 5. Widgets por etapa

Cada etapa pode ter um recurso interativo, no campo `widget`:

- `colaboradores`: formulário de cadastro mais a tabela do que já foi cadastrado
- `plataforma`: botão para `/vitrine`, a demonstração somente leitura
- `reuniao`: data sugerida para a devolutiva mais campo de observação

Etapa sem widget é só texto.

## 6. E-mails

Todos via Resend, com o remetente já configurado no servidor.

| Quando | Para quem |
|---|---|
| Aceite | Clau (`ADMIN_EMAIL`, padrão `claudiap.diniz@gmail.com`) e cópia para o cliente, se houver e-mail cadastrado |
| Primeiro colaborador cadastrado | Clau. Só o primeiro, para não virar enxurrada |
| Data ou observação enviada | Clau |
| Envio do link | Cliente, disparado pelo botão do painel |

O envio falha em silêncio: o registro no banco já aconteceu, e derrubar a resposta do cliente por causa de e-mail seria trocar o certo pelo acessório. Se o e-mail não chegar, o painel mostra o mesmo dado.

## 7. Como usar

1. Painel geral, menu SISTEMA, **Propostas**. Ele entra sozinho se você já entrou no painel principal nesse navegador, porque reaproveita `localStorage.axis_admin_token`.
2. **Preencher com o modelo NR-1** traz os 4 itens de escopo e as 5 etapas do MRP.
3. Preencher cliente, contato, e-mail e valor. Deixar **Válida até** em branco para proposta sem prazo.
4. Vincular a empresa, se ela já existir na plataforma. É isso que libera o botão de importar colaboradores.
5. Salvar. O link aparece na lista, com Copiar link, Pré-visualizar, Editar, Enviar por e-mail.

Depois de salvar, o formulário é zerado de propósito.

## 8. Limites e comportamentos que não são bugs

- Escopo e etapas: no máximo 12 itens cada, o excedente é descartado no servidor.
- Tamanhos: resumo 900 caracteres, contexto 3000, texto de item 900, observação do cliente 2000. Texto maior é cortado sem aviso.
- Proposta em `rascunho` já responde no link. O status serve para organizar, não trava o cliente.
- O aceite é registro com data, hora e IP. Não é assinatura eletrônica com certificado.
- As aberturas contam quem carrega a página e deixa o JS rodar. Prévia de link do WhatsApp não conta, porque robô de prévia não executa JS.
- **Excluir apaga o aceite junto.** Para encerrar sem perder histórico, use Arquivar.

## 9. Correções aplicadas no mesmo dia

- **Formulário não era limpo depois de salvar**, então a proposta seguinte herdava em silêncio os campos da anterior, inclusive a data em "Válida até". Foi assim que uma proposta criada sem prazo apareceu vencida. Agora o formulário zera e a lista mostra "válida até" quando existe prazo.
- Painel estava no dourado antigo (`#c9a227` sobre `#111`). Passou para a paleta oficial da v4.1: Forest 700 com os dois brilhos radiais, dourado médio como acento, creme no texto e Cormorant Garamond nos títulos.
- Item do menu movido de PRINCIPAL para SISTEMA.
- Painel passou a reaproveitar o token do painel principal, em vez de pedir a senha de novo.

## 10. Trabalho relacionado feito na mesma sessão (documentos do portal)

Não faz parte do módulo de propostas, mas foi corrigido junto:

- A lista "Já enviados" do modal de anexar documento (`relAnsCarregarLista` em `AXIS_NR1_MVP.html`) filtrava `tipo === 'ansiedade'`. Plano de ação, diagnóstico, mapeamento e liderança subiam para o portal do cliente e nunca apareciam ali, ou seja, não tinham como ser excluídos. Agora lista todos, com o tipo ao lado da data.
- `axia-portal.html` ganhou **Excluir documento** na barra do visualizador, ao lado de Imprimir e Exportar PDF. Aparece só com Modo Admin ativo e com o token de administrador no navegador (`podeExcluirDoc()`), e o servidor confere o token de novo em `/api/axia/admin/relatorio-delete`: a trava não depende da tela.

## 11. Como foi verificado

- `node --check` no servidor e nos blocos de script das telas.
- Página do cliente e painel testados ponta a ponta contra servidor de mock: cadastro de colaborador com recusa de e-mail repetido, envio de data e observação, aceite, login do painel, modelo, criar, editar, salvar e trocar status.
- Em produção: tabela criada (token inexistente devolve "Proposta não encontrada", não erro de banco), painel serve 200, rota admin recusa quem não tem token, e a Clau criou, editou e excluiu propostas de verdade.

## 12. Commits

`02cfb68` módulo, `9618b38` paleta v4.1, `7dc2d54` menu em Sistema, `10e2761` token reaproveitado, `b3ce849` formulário limpo, `4f869a7` lista de documentos completa, `d9fb527` excluir documento pelo portal.
