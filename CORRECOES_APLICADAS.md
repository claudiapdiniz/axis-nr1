# CORRECOES_APLICADAS — AXIS NR-1
Data: 2026-06-10

---

## GRUPO 1 — SEGURANÇA CRÍTICA

### [C-01] Endpoints admin sem autenticação
**Arquivo:** `server-cloud.js`
- Criada função `requireAdminAuth(req)` que valida o header `Authorization: Bearer <ADMIN_API_TOKEN>`
- Se `ADMIN_API_TOKEN` não estiver definido, a verificação é ignorada (compatibilidade com ambientes sem token)
- Rotas protegidas: `/api/sync-data`, `/api/all-data`, `/api/import-data`, `/api/axia/admin/*`, `/api/axia/companies`, `/api/get-responses`, `/api/ac/clients`, `/api/ac/clients/set-status`, `/api/ac/clients/:id` (DELETE), `/api/ac/clients/reset-password`, `/api/ac/module-permissions` (POST), `/api/ac/invite`, `/api/ac/invites`, `/api/ac/admin-results`, `/api/ac/client-answers/:testId`, `/api/ac/admin-ai-analysis`

**Arquivo:** `AXIS_NR1_MVP.html`
- Adicionado interceptor global de `fetch` que injeta automaticamente `Authorization: Bearer <token>` em todas as chamadas `/api/`
- Adicionada função `initAdminAuth()` que detecta automaticamente se autenticação está ativa (testa sem token → se 401, solicita o token)
- Token armazenado em `localStorage('axis_admin_token')`

### [C-02] /api/all-data exposta
**Arquivo:** `server-cloud.js`
- Rota mantida (necessária para `loadDataFromServer()` no frontend)
- Protegida com `requireAdminAuth(req)` — retorna 401 sem token válido

### [C-03] Sync destrutivo localStorage → servidor
**Arquivo:** `server-cloud.js`
- Lógica de merge em `/api/sync-data`: nunca sobrescreve array do servidor com array vazio
- Se `incoming[key]` for array vazio e `current[key]` já tiver dados → mantém dados do servidor

**Arquivo:** `AXIS_NR1_MVP.html`
- `syncDataToServer()` refatorado: só inclui chaves no payload se o array local tiver elementos (`length > 0`)
- Se todos os arrays estiverem vazios, a função retorna sem fazer chamada de rede

### [C-05] Senhas em texto plano
**Arquivo:** `server-cloud.js`
- Adicionada dependência `bcryptjs` (instalada via `npm install`)
- `/api/axia/login`: detecta se a senha armazenada começa com `$2b$` (hash bcrypt) ou não; se for texto plano e a senha estiver correta → migra automaticamente para hash; próximo login já usa bcrypt
- `/api/axia/admin/reset-password`: armazena nova senha como hash bcrypt
- `/api/axia/admin/send-access`: gera senha aleatória, envia texto plano por e-mail, armazena hash; se senha já for hash → gera nova senha
- `/api/axia/admin/company` POST: se `body.password` não for hash bcrypt → aplica `bcrypt.hash()` antes de salvar

### [S-02] Rate limiting em rotas de e-mail
**Arquivo:** `server-cloud.js`
- Criado rate limiter em memória (Map + TTL) — sem dependência de Express
- Limite: 50 requisições por hora por IP
- Rotas protegidas: `/api/send-email`, `/api/axia/survey`, `/api/axia/admin/send-access`, `/api/axia/admin/send-email-ac`
- Limpeza automática do store a cada hora (evita vazamento de memória)

---

## GRUPO 2 — PROBLEMAS FUNCIONAIS

### [F-01] Dashboard com tabelas vazias em browser novo
**Arquivo:** `AXIS_NR1_MVP.html`
- Adicionada função `loadDataFromServer()` que chama `/api/all-data` na inicialização
- Popula o localStorage com dados do servidor para as chaves: `empresas`, `pesquisas`, `convitesRH`, `colaboradores`, `axiaCompanies`, `axiaEmployees`, `axiaSurveys`, `axiaResults`, `axiaActionPlans`
- Estratégia: só sobrescreve chave se o servidor tiver dados iguais ou mais completos que o localStorage
- Chamada automática em `autoDetectServerUrl()` após detecção da URL do servidor

### [F-02] IA Insights lendo localStorage vazio
**Arquivo:** `AXIS_NR1_MVP.html`
- Corrigido indiretamente pela mesma função `loadDataFromServer()` do [F-01]
- Após o carregamento inicial, `DB.filter('respostas', ...)` e `DB.pesquisas()` leem do localStorage já populado com dados do servidor

### [F-03] "Carregando..." infinito no Autoconhecimento
**Arquivo:** `AXIS_NR1_MVP.html`
- Adicionado `if (!r.ok) throw new Error('HTTP ' + r.status)` após cada `fetch()` nas funções de load:
  - `acLoadRelatorios()` — linha após `fetch('/api/ac/admin-results')`
  - `acLoadHistorico()` — dentro do `Promise.all`, em ambas as chamadas `.then(r => ...)`
  - `acLoadClientes()` — linha após `fetch('/api/ac/clients?...')`
  - `acLoadResClientes()` — linha após `fetch('/api/ac/admin-results')`
- Qualquer status HTTP 4xx/5xx agora dispara o bloco `catch` que mostra mensagem de erro no lugar do spinner infinito

---

## GRUPO 3 — INFRAESTRUTURA E BANCO

### [I-01] Hardcoded localhost/127.0.0.1
**Resultado:** Nenhum encontrado em `server-cloud.js` — sem alteração necessária.
- `getApiBase()` em `AXIS_NR1_MVP.html` retorna `''` em produção (correto — usa URL relativa)

### [I-02] Credenciais hardcoded / falta de .env.example
**Arquivo criado:** `.env.example`
- Documenta todas as variáveis de ambiente necessárias: `DATABASE_URL`, `DATABASE_PUBLIC_URL`, `PORT`, `SERVER_URL`, `ADMIN_API_TOKEN`, `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_NAME`, `GMAIL_USER`, `GMAIL_PASS`
- `email-config.json` já estava no `.gitignore` (sem alteração necessária)
- `server-cloud.js` já lia exclusivamente de `process.env.*` (sem alteração necessária)

### [BD-01] Índices de banco de dados ausentes
**Arquivo:** `server-cloud.js` — função `initDB()`
- Adicionados 12 índices via `CREATE INDEX IF NOT EXISTS`:
  - `idx_ac_results_client` em `axis_auto_results(client_id)`
  - `idx_ac_results_test` em `axis_auto_results(client_test_id)`
  - `idx_ac_client_tests_client` em `axis_auto_client_tests(client_id)`
  - `idx_ac_client_tests_invite` em `axis_auto_client_tests(invite_id)`
  - `idx_ac_answers_test` em `axis_auto_answers(client_test_id)`
  - `idx_ac_invites_client` em `axis_auto_invites(client_id)`
  - `idx_ac_invites_token` em `axis_auto_invites(token)`
  - `idx_ac_mod_perms_client` em `axis_auto_module_permissions(client_id)`
  - `idx_ac_clients_email` em `axis_auto_clients(email)`
  - `idx_ac_clients_status` em `axis_auto_clients(status)`
  - `idx_ac_reports_client` em `axis_auto_reports(client_id)`
  - `idx_ac_reports_result` em `axis_auto_reports(result_id)`

---

## GRUPO 4 — QUALIDADE E ESTABILIDADE

### [Q-01] try/catch faltando em rotas async
**Arquivo:** `server-cloud.js`
- Adicionado try/catch nas seguintes rotas que não tinham proteção:
  - `GET /api/get-convite`
  - `POST /api/axia/departments`
  - `POST /api/axia/positions`
  - `POST /api/axia/employees`
  - `POST /api/axia/survey`
  - `GET /api/axia/surveys`
  - `GET /api/axia/validate-token`
  - `POST /api/axia/respond`
  - `GET /api/axia/results`
  - `GET/POST /api/axia/action-plan`
  - `POST /api/save-response`
  - `GET /api/get-responses`
- Todas retornam `json(500, { ok: false, error: 'Erro interno. Tente novamente.' })` em caso de falha

### [Q-02] Validação de input faltando em rotas POST/PUT
**Arquivo:** `server-cloud.js`
- `POST /api/send-email`: valida `email` e `nome` obrigatórios (já existia, confirmado)
- `POST /api/axia/login`: valida `email` e `password` obrigatórios
- `POST /api/axia/admin/company`: valida `name` obrigatório e formato de e-mail
- `POST /api/axia/departments`: valida `name` para criação; `id` para delete/toggle
- `POST /api/axia/positions`: valida `name` para criação; `id` para delete/toggle
- `POST /api/axia/survey`: valida `recipients` como array não vazio
- `GET /api/axia/validate-token`: valida `t` obrigatório
- `POST /api/axia/respond`: valida `surveyToken` e `answers` obrigatórios
- `GET /api/get-convite`: valida `token` obrigatório
- `GET /api/get-responses`: valida `pesquisaId` obrigatório
- `POST /api/save-response`: valida `resposta` obrigatório
- `POST /api/ac/clients`: valida `name`, `email` e formato do e-mail (já existia, confirmado)
- `POST /api/ac/clients/set-status`: valida que status é `active` ou `inactive` (já existia, confirmado)
- `POST /api/ac/client-login`: valida `email` e `password` obrigatórios
- `POST /api/ac/reset-password`: valida `token`, `newPassword` e comprimento mínimo (já existia, confirmado)
- `POST /api/axia/admin/send-email-ac`: valida `to` e `name` obrigatórios, formato de e-mail

---

## Resumo de Arquivos Modificados

| Arquivo | Alterações |
|---|---|
| `server-cloud.js` | Segurança, bcrypt, rate limit, índices BD, try/catch, validações |
| `AXIS_NR1_MVP.html` | Interceptor fetch, loadDataFromServer, syncDataToServer, r.ok checks |
| `package.json` | Adicionado `bcryptjs: ^2.4.3` |
| `.env.example` | Criado (novo arquivo) |

## O que NÃO foi alterado
- Nenhum design, CSS ou layout visual
- Nenhum dado do banco de dados
- Estrutura das tabelas existentes (apenas índices adicionados)
- Rotas públicas de colaborador/cliente (login de empresa, resposta de questionário, portal do cliente)
