// ═══════════════════════════════════════════════════════════════
// AXIS Insight NR-1 — Servidor NUVEM (Railway.app)
// Dados persistidos em PostgreSQL · Email via variáveis de ambiente
// URL permanente · Sem tunnel · Roda 24h
// ═══════════════════════════════════════════════════════════════
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

// ── Cliente Anthropic (inicializado sob demanda) ──────────────────
function getAnthropicClient() {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) throw new Error('CLAUDE_API_KEY não configurada nas variáveis de ambiente.');
  return new Anthropic({ apiKey: key });
}

// ── Histórico de conversas IA (em memória, TTL 2h) ────────────────
const _iaConversas = new Map();
setInterval(() => {
  const cutoff = Date.now() - 7200000;
  for (const [id, c] of _iaConversas) { if (c.updatedAt < cutoff) _iaConversas.delete(id); }
}, 3600000);

// ── Rate limiter simples (em memória) ────────────────────────────
const _rateLimitStore = new Map();
function checkRateLimit(ip, key, maxReqs, windowMs) {
  const now = Date.now();
  const storeKey = `${ip}:${key}`;
  const entry = _rateLimitStore.get(storeKey);
  if (!entry || now > entry.resetAt) {
    _rateLimitStore.set(storeKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxReqs) return false;
  entry.count++;
  return true;
}
// Limpar entradas expiradas a cada hora
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateLimitStore) { if (now > v.resetAt) _rateLimitStore.delete(k); }
}, 3600000);

// ── Autenticação de administrador ────────────────────────────────
function requireAdminAuth(req) {
  const adminToken = process.env.ADMIN_API_TOKEN;
  if (!adminToken) return true; // sem token configurado → acesso livre (compatibilidade)
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return token === adminToken;
}

// ── Axis Autoconhecimento helpers ─────────────────────────────
function acHash(pwd) { return crypto.createHash('sha256').update(pwd+'::axis_auto_2025').digest('hex'); }
function acId(p)     { return `${p}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function acToken()   { return crypto.randomBytes(24).toString('hex'); }
function acTempPwd() {
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'Axis@'+Array.from({length:4},()=>c[Math.floor(Math.random()*c.length)]).join('');
}

const PORT = process.env.PORT || 5500;
const DIR  = __dirname;

// URL pública permanente vinda do Railway
const SERVER_URL = (process.env.SERVER_URL || '').replace(/\/$/, '');

// ── PostgreSQL ────────────────────────────────────────────────
// Usar URL pública primeiro (mais confiável), fallback para interna
const DB_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: DB_URL,
  ssl: DB_URL ? { rejectUnauthorized: false } : false
});

function discGenerateAnalysis(scores, clientName) {
  const firstName = clientName.split(' ')[0];
  const total = 24;
  const dims = ['D','I','S','C'];
  const names = {D:'Dominante',I:'Influente',S:'Estável',C:'Analítico'};
  const sorted = dims.slice().sort((a,b)=>(scores[b]||0)-(scores[a]||0));
  const prim = sorted[0], sec = sorted[1];
  const primPct = Math.round((scores[prim]||0)/total*100);
  const secPct  = Math.round((scores[sec ]||0)/total*100);

  const descs = {
    D: `Você age com rapidez, foca em resultados e não tem medo de liderar. Sua energia vai direto ao ponto — enfrenta desafios de frente, decide com objetividade e tem alta tolerância a pressão. A impaciência com processos lentos e o impulso de controlar situações podem ser pontos de atenção no trabalho em equipe.`,
    I: `Você conecta pessoas, inspira pelo entusiasmo e tem facilidade natural de comunicação. Seu perfil brilha em ambientes colaborativos, apresentações e influência. A tendência à dispersão e à necessidade de aprovação podem dificultar a entrega quando o trabalho exige foco solitário e rigor técnico.`,
    S: `Você traz estabilidade, consistência e lealdade para os ambientes em que participa. Trabalha bem em equipe, escuta genuinamente e mantém a harmonia mesmo sob tensão. A resistência a mudanças bruscas e a dificuldade de impor limites podem ser pontos de desenvolvimento pessoal.`,
    C: `Você analisa antes de agir, preza pela qualidade e organiza o pensamento com precisão. Seu perfil se destaca na resolução de problemas complexos, processos estruturados e tomada de decisão baseada em dados. O perfeccionismo e a hesitação diante da incerteza podem travar a ação quando o contexto exige velocidade.`
  };

  const combs = {
    DI:`${firstName} combina determinação com influência. Você lidera pelo exemplo e pela energia — impõe seu ritmo ao mesmo tempo em que conquista as pessoas ao redor. Forte comunicador(a), sabe quando pressionar e quando envolver.`,
    DС:`${firstName} combina foco em resultado com precisão analítica. Você age com velocidade sem abrir mão da qualidade. É exigente consigo e com os outros — e isso gera resultados consistentes quando equilibrado com empatia.`,
    DS:`${firstName} combina liderança com paciência — uma combinação rara. Você direciona com firmeza, mas sem atropelar as pessoas. Inspira confiança porque é direto(a) sem ser duro(a).`,
    ID:`${firstName} mistura influência com ação. Você motiva, comunica e age — tudo com alta intensidade. Ótimo(a) para ambientes dinâmicos onde relacionamento e performance caminham juntos.`,
    IS:`${firstName} é o coração da equipe. Você conecta, acolhe e mantém o ambiente seguro para todos. Sua liderança é afetiva — as pessoas te seguem porque confiam em você, não porque você impõe.`,
    IC:`${firstName} combina persuasão com dados. Você convence com entusiasmo, mas sustenta seus argumentos com fatos. Forte em apresentações, negociações e projetos que exigem comunicação técnica.`,
    SD:`${firstName} é estável com capacidade de agir quando necessário. Você costuma manter a calma, mas quando precisa tomar o comando, faz com segurança. Confiável e consistente.`,
    SI:`${firstName} é a essência do cuidado relacional. Você apoia, escuta e engaja — com calor humano genuíno. Em ambientes colaborativos, sua presença equilibra e une.`,
    SC:`${firstName} combina lealdade com precisão. Você segue processos com disciplina, entrega com qualidade e mantém a harmonia. Um(a) parceiro(a) de trabalho extremamente confiável.`,
    CD:`${firstName} une rigor técnico com senso de urgência. Você analisa rápido, decide com dados e age antes que os outros entendam o que aconteceu. Excelente para funções estratégicas de alta complexidade.`,
    CI:`${firstName} tem o melhor dos dois mundos: precisão e comunicação. Você transforma dados complexos em mensagens claras — e isso é um talento valioso em qualquer contexto.`,
    CS:`${firstName} é cuidadoso(a) e consistente. Você entrega com qualidade, respeita processos e evita conflitos desnecessários. Confiável e metódico(a) — a pessoa que o time precisa para fechar ciclos.`
  };

  const combKey = prim+sec;
  const combAlt = sec+prim;
  const combText = combs[combKey] || combs[combAlt] || `${firstName} apresenta perfil predominantemente ${names[prim]} com influência ${names[sec]}.`;

  const forca = {D:['Tomada de decisão rápida','Liderança natural','Alta tolerância a pressão','Foco em resultados','Iniciativa e proatividade'],I:['Comunicação expressiva','Capacidade de motivar pessoas','Criatividade e entusiasmo','Facilidade em construir rapport','Influência positiva em grupos'],S:['Consistência e confiabilidade','Paciência e escuta ativa','Lealdade e comprometimento','Capacidade de suportar rotina','Habilidade de mediar conflitos'],C:['Atenção aos detalhes','Pensamento analítico','Organização e método','Rigor na qualidade das entregas','Capacidade de planejamento']};
  const atencao = {D:['Impaciência com processos','Tendência ao controle','Dificuldade de delegar','Pode parecer insensível sob pressão'],I:['Dispersão e dificuldade de foco','Necessidade de aprovação','Impulsividade verbal','Dificuldade de concluir tarefas sozinho(a)'],S:['Resistência a mudanças','Dificuldade de impor limites','Pode acumular tensão sem comunicar','Tendência a evitar conflito'],C:['Perfeccionismo paralisante','Excesso de análise antes de decidir','Dificuldade de lidar com ambiguidade','Pode parecer frio(a) emocionalmente']};
  const comunicacao = {D:'Comunicação direta, objetiva e assertiva. Prefere mensagens curtas e focadas em ação. Vai direto ao ponto.',I:'Comunicação expressiva, emotiva e entusiasmada. Usa narrativas, histórias e emoção para conectar.',S:'Comunicação calma, acolhedora e diplomática. Escuta mais do que fala. Prefere conversas com profundidade.',C:'Comunicação precisa, estruturada e baseada em dados. Evita rodeios e prioriza clareza técnica.'};
  const pressao = {D:'Sob pressão tende a acelerar ainda mais, tomar o controle da situação e agir de forma impulsiva. Pode se tornar mais controlador(a) e intolerante com quem não acompanha seu ritmo.',I:'Sob pressão tende a falar mais, buscar validação e se dispersar em múltiplas frentes. A sociabilidade pode se transformar em evitação do problema real.',S:'Sob pressão tende ao silêncio, absorve o impacto internamente e evita confrontos. Pode acumular tensão sem sinalizar o que está sentindo.',C:'Sob pressão tende ao hiperanálise, busca mais dados antes de agir e pode travar diante de incertezas. O medo de errar pode paralisar a decisão.'};
  const decisao = {D:'Decide rápido, com base no instinto e no resultado esperado. Não precisa de consenso — decide e comunica.',I:'Decide com base no impacto nas pessoas e no entusiasmo pelo caminho. Prefere processos colaborativos e validados socialmente.',S:'Decide com cautela, ouvindo todos os envolvidos e buscando harmonia. Não gosta de decisões unilaterais ou impostas.',C:'Decide com base em dados, lógica e análise. Precisa de informação suficiente antes de agir — e quando age, age com segurança.'};
  const ambiente = {D:'Ambientes desafiadores, com autonomia e metas claras. Trabalha bem sozinho(a) ou liderando equipes focadas em performance.',I:'Ambientes colaborativos, dinâmicos e com espaço para expressão. Precisa de interação social frequente e reconhecimento público.',S:'Ambientes estáveis, com relações de confiança e previsibilidade. Prefere rotinas consistentes e equipes com vínculos sólidos.',C:'Ambientes organizados, com processos claros e espaço para reflexão. Trabalha melhor com autonomia técnica e liberdade para analisar.'};
  const desen = {D:'• Desenvolver empatia e escuta ativa\n• Praticar a delegação sem perder o controle\n• Trabalhar a tolerância com ritmos diferentes\n• Cultivar pausas antes de decidir em situações de alta pressão',I:'• Desenvolver disciplina e foco em projetos de longo prazo\n• Aprender a receber críticas sem personalizar\n• Praticar conclusão de ciclos antes de iniciar novos\n• Fortalecer a autovalidação interna',S:'• Desenvolver assertividade e comunicação de necessidades\n• Praticar a exposição gradual a mudanças\n• Aprender a discordar de forma respeitosa\n• Construir limites saudáveis nos relacionamentos',C:'• Desenvolver tolerância à ambiguidade\n• Aprender a agir mesmo com informação incompleta\n• Praticar a conexão emocional em interações interpessoais\n• Cultivar a celebração de conquistas — não apenas a crítica ao que faltou'};

  const scoreLine = dims.map(d=>`${names[d]}: ${scores[d]||0} pts (${Math.round((scores[d]||0)/total*100)}%)`).join(' | ');

  return `RELATÓRIO PERFIL COMPORTAMENTAL — AXIS IA\nCliente: ${clientName}\n\n═══ COMPOSIÇÃO DO PERFIL ═══\n${scoreLine}\n\nPERFIL PREDOMINANTE: ${names[prim]} (${primPct}%)\nPERFIL SECUNDÁRIO: ${names[sec]} (${secPct}%)\nCOMBINAÇÃO: ${names[prim]}+${names[sec]}\n\n═══ DESCRIÇÃO DO PERFIL ═══\n${descs[prim]}\n\n═══ COMBINAÇÃO COMPORTAMENTAL ═══\n${combText}\n\n═══ PRINCIPAIS FORÇAS ═══\n${forca[prim].map(f=>'• '+f).join('\n')}\n\n═══ PONTOS DE ATENÇÃO ═══\n${atencao[prim].map(a=>'• '+a).join('\n')}\n\n═══ FORMA DE COMUNICAÇÃO ═══\n${comunicacao[prim]}\n\n═══ COMO REAGE SOB PRESSÃO ═══\n${pressao[prim]}\n\n═══ COMO TOMA DECISÕES ═══\n${decisao[prim]}\n\n═══ AMBIENTE IDEAL ═══\n${ambiente[prim]}\n\n═══ RECOMENDAÇÕES DE DESENVOLVIMENTO ═══\n${desen[prim]}\n\nEste relatório foi gerado pela plataforma AXIS IA com base no Perfil Comportamental DISC. Destina-se ao uso de autoconhecimento e desenvolvimento pessoal. Não substitui avaliação psicológica clínica.`;
}

function ciGenerateAnalysis(scores, clientName) {
  const firstName = clientName.split(' ')[0];
  const total = scores.total || Object.entries(scores).filter(([k])=>k!=='total').reduce((a,[,v])=>a+v,0);
  const overallLabel = total>=130?'🟢 Criança Interior Nutrita':total>=100?'🟡 Criança Interior Parcialmente Ferida':total>=70?'🟠 Criança Interior Ferida':'🔴 Criança Interior Profundamente Ferida';
  const dimCls = s=>s>=24?'Saudável':s>=18?'Atenção':s>=12?'Fragilizada':'Crítica';
  const DN = {seguranca:'Segurança Emocional',validacao:'Validação Emocional',pertencimento:'Pertencimento',identidade:'Identidade Autêntica',crianca_atual:'Criança Interior Atual'};
  const DT = {seguranca:'Bowlby + Winnicott',validacao:'Winnicott',pertencimento:'Freud + Bowlby',identidade:'Winnicott',crianca_atual:'Jung'};

  const dimLines = Object.entries(DN).map(([k,n])=>`• ${n} (${DT[k]}): ${scores[k]||0}/30 pts — ${dimCls(scores[k]||0)}`).join('\n');

  const impactos = [];
  if ((scores.seguranca||0)<18||(scores.validacao||0)<18) impactos.push('Medo de abandono e dificuldade de confiança nas relações');
  if ((scores.validacao||0)<18) impactos.push('Necessidade intensa de aprovação externa');
  if ((scores.identidade||0)<18) impactos.push('Dificuldade de colocar limites e tendência a agradar');
  if ((scores.pertencimento||0)<18) impactos.push('Padrão de rejeição e insegurança no pertencimento a grupos');
  if ((scores.crianca_atual||0)<18) impactos.push('Autossabotagem e dificuldade de sentir prazer e merecimento');
  if (impactos.length===0) impactos.push('Nenhum impacto crítico identificado — padrão emocional saudável');

  return `RELATÓRIO CRIANÇA INTERIOR — AXIS IA\nCliente: ${clientName}\n\nRESULTADO GERAL: ${total}/150 pts\nCLASSIFICAÇÃO: ${overallLabel}\n\n─── RESUMO EXECUTIVO ───\n${firstName} apresenta um estado de Criança Interior classificado como "${overallLabel.replace(/[🟢🟡🟠🔴]/g,'').trim()}". O protocolo avaliou 5 dimensões fundamentais do desenvolvimento emocional com base em Winnicott (40%), Freud (30%), Jung (20%) e Bowlby (10%).\n\n─── PONTUAÇÃO POR DIMENSÃO ───\n${dimLines}\n\n─── ESTADO DA CRIANÇA INTERIOR ───\n${total>=130?`${firstName} demonstra boa integração emocional. A Criança Interior encontra-se nutrida, com capacidade de conexão consigo mesma, expressão autêntica e segurança emocional desenvolvida.`:total>=100?`${firstName} apresenta áreas de saúde emocional alternadas com zonas de ferida não resolvida. A Criança Interior está parcialmente nutrida, mas carrega marcas que influenciam as relações atuais.`:total>=70?`${firstName} apresenta padrões significativos de ferida emocional. A Criança Interior manifesta necessidades não atendidas que impactam diretamente os relacionamentos, a autoestima e a capacidade de intimidade.`:`${firstName} apresenta sinais de ferida emocional profunda. A Criança Interior carrega marcas intensas de falta de segurança, validação e pertencimento que estruturam padrões repetitivos de sofrimento.`}\n\n─── ANÁLISE DE SEGURANÇA EMOCIONAL (Bowlby + Winnicott) ───\nPontuação: ${scores.seguranca||0}/30 — ${dimCls(scores.seguranca||0)}\n${(scores.seguranca||0)>=24?'A base de segurança emocional está bem estabelecida. '+firstName+' interiorizou a experiência de ser protegido(a) e amparado(a), o que permite maior capacidade de regulação emocional e confiança nas relações.':((scores.seguranca||0)>=18?'A segurança emocional está presente, mas com lacunas. Há experiências de cuidado interrompido ou inconsistente que podem gerar ansiedade nas relações atuais.':((scores.seguranca||0)>=12?'A segurança emocional se encontra fragilizada. Experiências de abandono, negligência emocional ou inconsistência do cuidado na infância deixaram marcas que influenciam a capacidade de confiar e ser cuidado(a).':'A segurança emocional encontra-se em estado crítico. Há forte indicação de ausência de base segura na infância, o que estrutura padrões profundos de hipervigilância, medo do abandono e dificuldade de intimidade.'))}\n\n─── ANÁLISE DE VALIDAÇÃO EMOCIONAL (Winnicott) ───\nPontuação: ${scores.validacao||0}/30 — ${dimCls(scores.validacao||0)}\n${(scores.validacao||0)>=24?'As emoções foram majoritariamente acolhidas e validadas. '+firstName+' pôde desenvolver o Verdadeiro Self com liberdade para expressar sentimentos autenticamente.':((scores.validacao||0)>=18?'A validação emocional existiu de forma parcial. Há indicativos de momentos em que as emoções foram minimizadas, o que pode ter gerado desenvolvimento do Falso Self como estratégia de proteção.':'A validação emocional foi significativamente limitada. O desenvolvimento do Falso Self como adaptação ao ambiente é provável. '+firstName+' pode apresentar dificuldade para identificar e expressar emoções genuínas.')}\n\n─── ANÁLISE DE PERTENCIMENTO (Freud + Bowlby) ───\nPontuação: ${scores.pertencimento||0}/30 — ${dimCls(scores.pertencimento||0)}\n${(scores.pertencimento||0)>=24?firstName+' desenvolveu sólido sentido de pertencimento. A experiência de ser amado(a), aceito(a) e valorizado(a) criou base para relações seguras e identidade coesa.':((scores.pertencimento||0)>=18?'O pertencimento foi experimentado de forma parcial. Pode haver padrão de busca por aceitação e aprovação como herança das experiências infantis de inclusão inconsistente.':'O sentido de pertencimento encontra-se comprometido. Há forte indicativo de experiências de rejeição, exclusão ou invisibilidade que estruturam o medo de não ser aceito(a) e de não merecer amor.')}\n\n─── ANÁLISE DE IDENTIDADE AUTÊNTICA (Winnicott) ───\nPontuação: ${scores.identidade||0}/30 — ${dimCls(scores.identidade||0)}\n${(scores.identidade||0)>=24?firstName+' apresenta boa expressão da identidade autêntica. Consegue dizer não, colocar limites e expressar sentimentos verdadeiros sem necessidade intensa de aprovação.':((scores.identidade||0)>=18?'A identidade autêntica está em desenvolvimento. Há tendência a ajustar a expressão pessoal às expectativas externas em determinados contextos.':'A identidade autêntica encontra-se suprimida pelo Falso Self. '+firstName+' pode apresentar dificuldade significativa de colocar limites, expressar discordância e mostrar sua verdadeira essência por medo de rejeição ou conflito.')}\n\n─── ANÁLISE DA CRIANÇA INTERIOR ATUAL (Jung) ───\nPontuação: ${scores.crianca_atual||0}/30 — ${dimCls(scores.crianca_atual||0)}\n${(scores.crianca_atual||0)>=24?firstName+' mantém contato saudável com sua Criança Interior. Consegue se divertir, sonhar, sentir que merece felicidade e cuidar de si com compaixão — sinais de integração e vitalidade psíquica.':((scores.crianca_atual||0)>=18?'A conexão com a Criança Interior está presente mas limitada. Pode haver dificuldade de sentir prazer sem culpa ou de acreditar no próprio merecimento em determinadas áreas.':'A Criança Interior encontra-se profundamente desconectada. '+firstName+' pode apresentar padrões de autossabotagem, dificuldade de sentir prazer, culpa ao se cuidar e baixo sentido de merecimento — reflexo de feridas emocionais não integradas.')}\n\n─── POSSÍVEIS IMPACTOS ATUAIS ───\n${impactos.map(i=>'• '+i).join('\n')}\n\n─── INFLUÊNCIA TEÓRICA ───\n• Winnicott (40%): Verdadeiro Self, Falso Self, Holding, Ambiente Facilitador\n• Freud (30%): Formação da personalidade, padrões relacionais, mecanismos de defesa\n• Jung (20%): Criança Interior como arquétipo, conexão com a alma criativa\n• Bowlby (10%): Teoria do Apego, base segura, padrões de vínculo\n\n─── RECOMENDAÇÕES TERAPÊUTICAS ───\n${total>=130?'• Fortalecer práticas de autocuidado e criatividade\n• Aprofundar o contato com os valores e propósito pessoal\n• Explorar áreas com pontuação em "Atenção" de forma preventiva\n• Trabalhar gratidão e consolidação dos recursos internos já desenvolvidos':total>=100?'• Mapear as dimensões em "Atenção" e "Fragilizada" como pontos de trabalho terapêutico\n• Trabalhar a integração do Falso Self onde identificado\n• Fortalecer a capacidade de colocar limites e expressar necessidades\n• Explorar histórias familiares que estruturaram os padrões identificados\n• Técnicas de reparentalização interna são indicadas':'• Reparentalização interna como foco principal do processo terapêutico\n• Trabalho com a criança interior ferida: escrita, cartas para a criança, meditações guiadas\n• Identificar e ressignificar as narrativas centrais de não merecimento e rejeição\n• Fortalecer a capacidade de pedir ajuda e receber cuidado\n• Trabalho com limites e identidade autêntica\n• Considerar abordagens somáticas para integração das memórias de ativação emocional'}\n\nEste relatório foi gerado pela plataforma AXIS IA e destina-se ao uso terapêutico exclusivo da profissional responsável. Baseado em protocolo desenvolvido a partir das teorias de Winnicott, Freud, Jung e Bowlby.`;
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  // ── Axis Autoconhecimento — tabelas isoladas ─────────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS ac_results (id TEXT PRIMARY KEY, test_type TEXT DEFAULT 'linguagens', scores TEXT NOT NULL, ranking TEXT NOT NULL, percentages TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), created_by TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_invites (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, token TEXT UNIQUE NOT NULL, test_id TEXT DEFAULT 'linguagens', status TEXT DEFAULT 'pending', expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_client_tests (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, invite_id TEXT, test_id TEXT DEFAULT 'linguagens', status TEXT DEFAULT 'not_started', started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_answers (id TEXT PRIMARY KEY, client_test_id TEXT NOT NULL, phase_number INT, category TEXT, position INT, score INT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_results (id TEXT PRIMARY KEY, client_test_id TEXT NOT NULL, client_id TEXT NOT NULL, scores_json TEXT, ranking_json TEXT, ai_analysis TEXT, pdf_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  // Novas tabelas v2
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_modules (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, icon TEXT DEFAULT '🧠', status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_module_permissions (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, module_id TEXT NOT NULL, invite_id TEXT, status TEXT DEFAULT 'active', allow_result_view BOOLEAN DEFAULT true, allow_retake BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW(), completed_at TIMESTAMPTZ)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_questions (id TEXT PRIMARY KEY, module_id TEXT NOT NULL, question TEXT NOT NULL, category TEXT, order_index INT, weight INT DEFAULT 1, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_reports (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, module_id TEXT, client_test_id TEXT, result_id TEXT, client_name TEXT, module_name TEXT, scores_json TEXT, ranking_json TEXT, ai_analysis TEXT, therapist_notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_report_files (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, file_type TEXT DEFAULT 'pdf', file_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  // Evoluir axis_auto_invites sem perder dados existentes
  await pool.query(`ALTER TABLE axis_auto_invites ADD COLUMN IF NOT EXISTS module_id TEXT`);
  await pool.query(`ALTER TABLE axis_auto_invites ADD COLUMN IF NOT EXISTS allow_result_view BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE axis_auto_invites ADD COLUMN IF NOT EXISTS allow_retake BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE axis_auto_invites ADD COLUMN IF NOT EXISTS created_by TEXT`);
  // Correção 9: campos extras no cadastro de clientes
  await pool.query(`ALTER TABLE axis_auto_clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
  await pool.query(`ALTER TABLE axis_auto_clients ADD COLUMN IF NOT EXISTS observacoes TEXT`);
  await pool.query(`ALTER TABLE axis_auto_clients ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true`);
  // Tabela para tokens de redefinição de senha
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_auto_password_resets (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // ── Índices para queries frequentes ─────────────────────────
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_results_client ON axis_auto_results(client_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_results_test ON axis_auto_results(client_test_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_client_tests_client ON axis_auto_client_tests(client_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_client_tests_invite ON axis_auto_client_tests(invite_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_answers_test ON axis_auto_answers(client_test_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_invites_client ON axis_auto_invites(client_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_invites_token ON axis_auto_invites(token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_mod_perms_client ON axis_auto_module_permissions(client_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_clients_email ON axis_auto_clients(email)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_clients_status ON axis_auto_clients(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_reports_client ON axis_auto_reports(client_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ac_reports_result ON axis_auto_reports(result_id)`);
  await acSeedModules();
  await acSeedCIQuestions();
  console.log('✅ Banco de dados pronto.');
}

async function acSeedModules() {
  const mods = [
    ['mod_ling',   'Linguagens de Valorização','linguagens-valorizacao',  'Identifique como você prefere receber amor e reconhecimento',                     '💬','active'],
    ['mod_disc',   'Perfil Comportamental',   'disc',                    'Descubra seus padrões de ação, comunicação e tomada de decisão',                   '🧭','active'],
    ['mod_apego',  'Estilo de Apego',          'estilo-apego',            'Compreenda seus padrões de vínculo emocional',                                    '🔗','coming_soon'],
    ['mod_crianca','Criança Interior',          'crianca-interior',        'Identifique necessidades emocionais não atendidas e padrões formados na infância','🌟','active'],
    ['mod_dep',    'Dependência Emocional',     'dependencia-emocional',   'Identifique padrões de dependência nos relacionamentos',                          '🌀','coming_soon'],
    ['mod_auto',   'Autoestima e Autovalor',    'autoestima-autovalor',    'Avalie sua relação com sua própria imagem e valor pessoal',                       '⭐','coming_soon'],
    ['mod_cren',   'Crenças Limitantes',        'crencas-limitantes',      'Mapeie crenças que bloqueiam seu crescimento',                                    '🧩','coming_soon'],
    ['mod_perf',   'Perfil Emocional',          'perfil-emocional',        'Entenda como você processa e expressa emoções',                                   '🎭','coming_soon'],
    ['mod_ie',     'Inteligência Emocional',    'inteligencia-emocional',  'Meça suas competências emocionais',                                               '🧠','coming_soon']
  ];
  for (const [id,name,slug,desc,icon,status] of mods) {
    await pool.query(`INSERT INTO axis_auto_modules (id,name,slug,description,icon,status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2,slug=$3,description=$4,icon=$5,status=$6`,[id,name,slug,desc,icon,status]);
  }
}

async function acSeedCIQuestions() {
  const questions = [
    // Dimensão 1 — Segurança Emocional (Bowlby + Winnicott)
    {id:'ci_q1', mod:'mod_crianca', cat:'seguranca', ord:1, q:'Quando criança eu me sentia protegido(a) pelos adultos responsáveis.'},
    {id:'ci_q2', mod:'mod_crianca', cat:'seguranca', ord:2, q:'Eu sentia que podia confiar nas pessoas que cuidavam de mim.'},
    {id:'ci_q3', mod:'mod_crianca', cat:'seguranca', ord:3, q:'Eu me sentia seguro(a) dentro da minha casa.'},
    {id:'ci_q4', mod:'mod_crianca', cat:'seguranca', ord:4, q:'Eu acreditava que seria ajudado(a) quando precisasse.'},
    {id:'ci_q5', mod:'mod_crianca', cat:'seguranca', ord:5, q:'Minhas emoções eram acolhidas.'},
    {id:'ci_q6', mod:'mod_crianca', cat:'seguranca', ord:6, q:'Eu sentia que tinha alguém disponível para me proteger.'},
    // Dimensão 2 — Validação Emocional (Winnicott)
    {id:'ci_q7',  mod:'mod_crianca', cat:'validacao', ord:1, q:'Eu podia demonstrar tristeza sem ser criticado(a).'},
    {id:'ci_q8',  mod:'mod_crianca', cat:'validacao', ord:2, q:'Eu podia expressar medo sem ser ridicularizado(a).'},
    {id:'ci_q9',  mod:'mod_crianca', cat:'validacao', ord:3, q:'Eu me sentia ouvido(a) pelos adultos.'},
    {id:'ci_q10', mod:'mod_crianca', cat:'validacao', ord:4, q:'Minhas opiniões eram respeitadas.'},
    {id:'ci_q11', mod:'mod_crianca', cat:'validacao', ord:5, q:'Eu me sentia importante para minha família.'},
    {id:'ci_q12', mod:'mod_crianca', cat:'validacao', ord:6, q:'Eu recebia incentivo emocional.'},
    // Dimensão 3 — Pertencimento (Freud + Bowlby)
    {id:'ci_q13', mod:'mod_crianca', cat:'pertencimento', ord:1, q:'Eu sentia que fazia parte da minha família.'},
    {id:'ci_q14', mod:'mod_crianca', cat:'pertencimento', ord:2, q:'Eu me sentia aceito(a) como era.'},
    {id:'ci_q15', mod:'mod_crianca', cat:'pertencimento', ord:3, q:'Eu sentia que era amado(a).'},
    {id:'ci_q16', mod:'mod_crianca', cat:'pertencimento', ord:4, q:'Eu me sentia incluído(a).'},
    {id:'ci_q17', mod:'mod_crianca', cat:'pertencimento', ord:5, q:'Eu sentia que minha presença era valorizada.'},
    {id:'ci_q18', mod:'mod_crianca', cat:'pertencimento', ord:6, q:'Eu acreditava que era importante para as pessoas próximas.'},
    // Dimensão 4 — Identidade Autêntica (Winnicott)
    {id:'ci_q19', mod:'mod_crianca', cat:'identidade', ord:1, q:'Tenho facilidade para dizer não.'},
    {id:'ci_q20', mod:'mod_crianca', cat:'identidade', ord:2, q:'Consigo expressar minha opinião sem medo.'},
    {id:'ci_q21', mod:'mod_crianca', cat:'identidade', ord:3, q:'Não preciso agradar todos ao meu redor.'},
    {id:'ci_q22', mod:'mod_crianca', cat:'identidade', ord:4, q:'Consigo demonstrar meus sentimentos verdadeiros.'},
    {id:'ci_q23', mod:'mod_crianca', cat:'identidade', ord:5, q:'Não escondo quem realmente sou.'},
    {id:'ci_q24', mod:'mod_crianca', cat:'identidade', ord:6, q:'Consigo colocar limites saudáveis.'},
    // Dimensão 5 — Criança Interior Atual (Jung)
    {id:'ci_q25', mod:'mod_crianca', cat:'crianca_atual', ord:1, q:'Consigo me divertir sem culpa.'},
    {id:'ci_q26', mod:'mod_crianca', cat:'crianca_atual', ord:2, q:'Tenho sonhos e objetivos pessoais.'},
    {id:'ci_q27', mod:'mod_crianca', cat:'crianca_atual', ord:3, q:'Acredito que mereço ser feliz.'},
    {id:'ci_q28', mod:'mod_crianca', cat:'crianca_atual', ord:4, q:'Consigo me tratar com carinho e compaixão.'},
    {id:'ci_q29', mod:'mod_crianca', cat:'crianca_atual', ord:5, q:'Mantenho contato com minha criatividade.'},
    {id:'ci_q30', mod:'mod_crianca', cat:'crianca_atual', ord:6, q:'Consigo cuidar emocionalmente de mim mesmo(a).'}
  ];
  for (const q of questions) {
    await pool.query(`INSERT INTO axis_auto_questions (id,module_id,question,category,order_index,active) VALUES ($1,$2,$3,$4,$5,true) ON CONFLICT (id) DO UPDATE SET question=$3,category=$4,order_index=$5`,
      [q.id, q.mod, q.q, q.cat, q.ord]);
  }
}

async function loadData() {
  try {
    const r = await pool.query('SELECT value FROM kv_store WHERE key = $1', ['axis_data']);
    if (r.rows.length > 0) return JSON.parse(r.rows[0].value);
  } catch(e) { console.error('loadData erro:', e.message); }
  return { convites: [], respostas: [], pesquisas: [], empresas: [], colaboradores: [], respostasRH: [] };
}

async function saveData(data) {
  await pool.query(
    'INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    ['axis_data', JSON.stringify(data)]
  );
}

// ── Config de email (variáveis de ambiente) ───────────────────
function loadEmailConfig() {
  return {
    user:       process.env.GMAIL_USER    || '',
    pass:       process.env.GMAIL_PASS    || '',
    fromName:   process.env.FROM_NAME     || 'AXIS Consultoria',
    resendKey:  process.env.RESEND_API_KEY || '',  // preferido no Railway
    fromEmail:  process.env.FROM_EMAIL    || '',   // ex: axis@axisconsultorias.com.br
    serverUrl:  SERVER_URL
  };
}

// ── Template HTML do email ─────────────────────────────────────
function buildEmailHtml({ nome, titulo, link, empresa, isResend }) {
  const agora = new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const bannerReenvio = isResend ? `
  <div style="background:#B85C5C;color:white;padding:14px 20px;text-align:center;font-size:13px;font-weight:700;letter-spacing:.3px">
    🔄 LINK ATUALIZADO — USE ESTE EMAIL, IGNORE OS ANTERIORES<br>
    <span style="font-size:11px;font-weight:400;opacity:.85">Enviado em ${agora}</span>
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif}
  .wrap{max-width:600px;margin:32px auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  .header{background:#1F1F1F;padding:24px 32px}
  .header-brand{font-weight:900;font-size:22px;color:#D8C7B8}
  .header-brand span{color:#C9A84C}
  .header-sub{font-size:11px;color:rgba(216,199,184,.5);letter-spacing:2px;text-transform:uppercase;margin-top:3px}
  .body{padding:36px 40px}
  .greeting{font-size:16px;color:#333;margin-bottom:20px}
  .greeting strong{color:#1F1F1F}
  .invite-text{font-size:15px;color:#555;margin-bottom:28px;line-height:1.6}
  .btn-wrap{text-align:center;margin-bottom:20px}
  .btn{display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700}
  .link-box{background:#f5f5f3;border-radius:6px;padding:12px 16px;margin-bottom:24px;text-align:center}
  .link-box p{margin:0 0 6px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px}
  .link-box a{font-size:12px;color:#1976D2;word-break:break-all}
  .divider{border:none;border-top:1px solid #eee;margin:24px 0}
  .closing{font-size:14px;color:#555;line-height:1.8}
  .closing strong{color:#1F1F1F;font-size:15px;display:block;margin-top:4px}
  .footer{background:#f9f9f9;padding:14px 40px;text-align:center;border-top:1px solid #eee}
  .footer p{font-size:11px;color:#aaa;margin:0}
  .footer a{color:#C9A84C;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  ${bannerReenvio}
  <div class="header">
    <div class="header-brand">AXIS <span>Insight</span> NR-1</div>
    <div class="header-sub">Riscos Psicossociais · NR-1/2025</div>
  </div>
  <div class="body">
    <p class="greeting">Olá <strong>${nome}</strong></p>
    <p class="invite-text">
      ${isResend
        ? 'Seu link de acesso foi atualizado. Use o botão abaixo para responder o questionário.'
        : `Você está convidado(a) a responder o <strong>Mapeamento de Riscos Psicossociais</strong>${titulo ? `<br><em style="font-size:13px;color:#888">${titulo}</em>` : ''}`
      }
    </p>
    <div class="btn-wrap">
      <a href="${link}" class="btn">▶ Acessar Questionário</a>
    </div>
    <div class="link-box">
      <p>Se o botão não funcionar, copie e cole este link:</p>
      <a href="${link}">${link}</a>
    </div>
    <hr class="divider">
    <p class="closing">
      Atenciosamente,
      <strong>${empresa || 'AXIS Consultoria'}</strong>
    </p>
  </div>
  <div class="footer">
    <p>Enviado via <a href="#">AXIS Insight NR-1</a> · Clau Diniz · ${agora}</p>
  </div>
</div>
</body></html>`;
}

// ── Enviar email ───────────────────────────────────────────────
async function sendEmail({ to, toName, subject, html, config }) {
  // ── Opção 1: Resend.com (HTTP API — funciona no Railway Trial) ──
  if (config.resendKey) {
    const fromEmail = config.fromEmail || 'onboarding@resend.dev';
    const fromLabel = `"${config.fromName || 'AXIS Consultoria'}" <${fromEmail}>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromLabel,
        to: [`"${toName}" <${to}>`],
        subject,
        html
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || JSON.stringify(result));
    return result;
  }

  // ── Opção 2: Gmail SMTP (funciona local, bloqueado no Railway Trial) ──
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: false }
  });
  return transporter.sendMail({
    from: `"${config.fromName || 'AXIS Consultoria'}" <${config.user}>`,
    to: `"${toName}" <${to}>`,
    subject, html
  });
}

// ── Ler body de request ────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// ── Servidor HTTP ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url    = req.url.split('?')[0];
  const params = new URLSearchParams(req.url.split('?')[1] || '');

  function json(code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  // ── GET /api/server-info ─────────────────────────────────────
  if (url === '/api/server-info') {
    json(200, {
      publicUrl:   SERVER_URL,
      serverUrl:   SERVER_URL,
      tunnelAtivo: true,
      cloud:       true,
      port:        PORT
    });
    return;
  }

  // ── POST /api/send-email ─────────────────────────────────────
  if (req.method === 'POST' && url === '/api/send-email') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'email', 50, 3600000))
      return json(429, { ok: false, error: 'Muitas requisições. Tente novamente em 1 hora.' });
    const data = await readBody(req);
    if (!data.email || !data.nome) return json(400, { ok: false, error: 'email e nome são obrigatórios.' });
    const config = loadEmailConfig();
    if (!config.resendKey && (!config.user || !config.pass))
      return json(400, { ok: false, error: 'Email não configurado. Verifique as variáveis de ambiente.' });
    try {
      const html = buildEmailHtml({ nome: data.nome, titulo: data.titulo, link: data.link, empresa: data.empresa, isResend: data.isResend });
      await sendEmail({ to: data.email, toName: data.nome, subject: data.subject || 'Convite — Mapeamento de Riscos Psicossociais', html, config });
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: 'Erro ao enviar e-mail. Tente novamente.' }); }
    return;
  }

  // ── POST /api/save-email-config ──────────────────────────────
  // Na nuvem, config vem de env vars — este endpoint apenas confirma
  if (req.method === 'POST' && url === '/api/save-email-config') {
    json(200, { ok: true, info: 'Na versão nuvem, configure via variáveis de ambiente no Railway.' });
    return;
  }

  // ── GET /api/email-config-status ─────────────────────────────
  if (url === '/api/email-config-status') {
    const cfg = loadEmailConfig();
    const viaResend = !!cfg.resendKey;
    const viaSmtp   = !!(cfg.user && cfg.pass);
    json(200, {
      configured:  viaResend || viaSmtp,
      mode:        viaResend ? 'resend' : (viaSmtp ? 'smtp' : 'none'),
      user:        cfg.user || '',
      fromEmail:   cfg.fromEmail || (viaResend ? 'onboarding@resend.dev' : cfg.user),
      serverUrl:   SERVER_URL
    });
    return;
  }

  // ── POST /api/admin-login ─────────────────────────────────────
  if (req.method === 'POST' && url === '/api/admin-login') {
    const {password} = await readBody(req);
    const adminToken = process.env.ADMIN_API_TOKEN;
    if (!adminToken) return json(200, {ok: true, token: ''}); // sem auth → acesso livre
    if (!password || password.trim() !== adminToken) return json(401, {ok: false, error: 'Senha incorreta. Verifique o token de administrador.'});
    return json(200, {ok: true, token: adminToken});
  }

  // ── POST /api/sync-data ──────────────────────────────────────
  if (req.method === 'POST' && url === '/api/sync-data') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const incoming = await readBody(req);
      const current  = await loadData();
      // SEGURANÇA: nunca sobrescreve arrays do servidor com arrays vazios (bug destrutivo)
      const merged = { ...current };
      for (const [key, val] of Object.entries(incoming)) {
        if (Array.isArray(val) && Array.isArray(current[key])) {
          if (val.length > 0) merged[key] = val;
          // se incoming vazio, mantém dados do servidor
        } else if (val !== null && val !== undefined) {
          merged[key] = val;
        }
      }
      await saveData(merged);
      json(200, { ok: true });
    } catch(e) { json(500, { erro: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/get-convite?token=TOKEN ─────────────────────────
  if (url === '/api/get-convite') {
    const token = params.get('token');
    if (!token) return json(400, { ok: false, error: 'Token obrigatório.' });
    try {
      const data  = await loadData();
      const convite  = data.convites?.find(c => c.token === token);
      const pesquisa = convite ? data.pesquisas?.find(p => p.id === convite.pesquisaId) : null;
      const empresa  = pesquisa ? data.empresas?.find(e => e.id === pesquisa.empresaId) : null;
      if (!convite || !pesquisa) return json(404, { ok: false, error: 'Token inválido ou pesquisa encerrada.' });
      json(200, { ok: true, convite, pesquisa, empresa });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── POST /api/save-response ──────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  // AXIS IA — Portal Empresa Cliente
  // ══════════════════════════════════════════════════════════════

  // ── Helpers Axis IA ───────────────────────────────────────────
  async function getAxiaSession(token) {
    if (!token) return null;
    const d = await loadData();
    const session = (d.axiaSessions || {})[token];
    if (!session) return null;
    if (Date.now() - session.createdAt > 28800000) return null; // 8h
    return (d.axiaCompanies || []).find(c => c.id === session.companyId) || null;
  }

  // ── POST /api/axia/login ──────────────────────────────────────
  if (req.method === 'POST' && url === '/api/axia/login') {
    try {
      const { email, password } = await readBody(req);
      if (!email || !password) return json(400, { ok: false, error: 'E-mail e senha são obrigatórios.' });
      const d = await loadData();
      const co = (d.axiaCompanies || []).find(c => c.email === email);
      if (!co) return json(401, { ok: false, error: 'E-mail ou senha inválidos.' });
      // Suporte a bcrypt (novo) e plaintext (legado — migra automaticamente)
      let senhaOk = false;
      if (co.password && co.password.startsWith('$2b$')) {
        senhaOk = await bcrypt.compare(password, co.password);
      } else {
        senhaOk = (co.password === password);
        if (senhaOk) {
          // Migrar para bcrypt automaticamente
          const idx = d.axiaCompanies.findIndex(c => c.id === co.id);
          d.axiaCompanies[idx].password = await bcrypt.hash(password, 12);
          await saveData(d);
        }
      }
      if (!senhaOk) return json(401, { ok: false, error: 'E-mail ou senha inválidos.' });
      const token = crypto.randomBytes(24).toString('hex');
      if (!d.axiaSessions) d.axiaSessions = {};
      Object.keys(d.axiaSessions).forEach(t => { if (Date.now() - d.axiaSessions[t].createdAt > 28800000) delete d.axiaSessions[t]; });
      d.axiaSessions[token] = { companyId: co.id, createdAt: Date.now() };
      await saveData(d);
      const { password: _p, ...safe } = co;
      json(200, { ok: true, token, company: safe });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/me?token=T ──────────────────────────────────
  if (url === '/api/axia/me') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const { password: _p, ...safe } = co;
    json(200, { ok: true, company: safe });
    return;
  }

  // ── POST /api/axia/admin/impersonate (admin abre portal de empresa) ─
  if (req.method === 'POST' && url === '/api/axia/admin/impersonate') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const { companyId } = await readBody(req);
    const d = await loadData();
    const co = (d.axiaCompanies || []).find(c => c.id === companyId);
    if (!co) return json(404, { ok: false, error: 'Empresa não encontrada.' });
    const token = 'adm_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    if (!d.axiaSessions) d.axiaSessions = {};
    d.axiaSessions[token] = { companyId: co.id, createdAt: Date.now(), isAdminAccess: true };
    await saveData(d);
    json(200, { ok: true, token, companyName: co.name });
    return;
  }

  // ── POST /api/axia/admin/company (admin cria/edita empresa) ───
  if (req.method === 'POST' && url === '/api/axia/admin/company') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const body = await readBody(req);
    if (!body.name) return json(400, { ok: false, error: 'Nome da empresa é obrigatório.' });
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
      return json(400, { ok: false, error: 'E-mail inválido.' });
    // Hashear senha se fornecida em plaintext
    if (body.password && !body.password.startsWith('$2b$')) {
      body.password = await bcrypt.hash(body.password, 12);
    }
    const d = await loadData();
    if (!d.axiaCompanies) d.axiaCompanies = [];
    const idx = d.axiaCompanies.findIndex(c => c.id === body.id);
    if (idx >= 0) {
      d.axiaCompanies[idx] = { ...d.axiaCompanies[idx], ...body };
    } else {
      d.axiaCompanies.push({
        ...body,
        id: body.id || `co_${Date.now()}`,
        createdAt: new Date().toISOString(),
        accessStatus: 'nao_enviado',
        accessSentAt: null,
        accessLastSentAt: null
      });
    }
    await saveData(d);
    json(200, { ok: true });
    return;
  }

  // ── GET /api/axia/companies (admin lista empresas) ────────────
  if (url === '/api/axia/companies') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const d = await loadData();
    const employees = d.axiaEmployees || [];
    const surveys   = d.axiaSurveys   || [];
    const companies = (d.axiaCompanies || []).map(c => ({
      id:               c.id,
      name:             c.name,
      email:            c.email,
      plan:             c.plan,
      createdAt:        c.createdAt,
      accessStatus:     c.accessStatus || 'nao_enviado',
      accessSentAt:     c.accessSentAt || null,
      accessLastSentAt: c.accessLastSentAt || null,
      hasPassword:      !!c.password,
      tempPassword:     c.password || null,   // needed for admin "copy credentials"
      employeeCount:    employees.filter(e => e.companyId === c.id).length,
      surveyCount:      surveys.filter(s => s.companyId === c.id).length
    }));
    json(200, { ok: true, companies });
    return;
  }

  // ── POST /api/axia/admin/reset-password ───────────────────────
  if (req.method === 'POST' && url === '/api/axia/admin/reset-password') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { companyId, newPassword } = await readBody(req);
      if (!companyId || !newPassword) return json(400, { ok: false, error: 'companyId e newPassword obrigatórios.' });
      const d = await loadData();
      const idx = (d.axiaCompanies || []).findIndex(c => c.id === companyId);
      if (idx < 0) return json(404, { ok: false, error: 'Empresa não encontrada.' });
      d.axiaCompanies[idx].password = await bcrypt.hash(newPassword, 12);
      d.axiaCompanies[idx].accessStatus = 'nao_enviado';
      await saveData(d);
      json(200, { ok: true, tempPassword: newPassword });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── POST /api/axia/admin/send-access ──────────────────────────
  if (req.method === 'POST' && url === '/api/axia/admin/send-access') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'email', 50, 3600000))
      return json(429, { ok: false, error: 'Muitas requisições. Tente novamente em 1 hora.' });
    const { companyId, forceNewPassword } = await readBody(req);
    if (!companyId) return json(400, { ok: false, error: 'companyId obrigatório.' });
    const d = await loadData();
    const idx = (d.axiaCompanies || []).findIndex(c => c.id === companyId);
    if (idx < 0) return json(404, { ok: false, error: 'Empresa não encontrada.' });
    const co = d.axiaCompanies[idx];

    // Gerar senha temporária se não existir, estiver hashada ou forçar nova
    let tempPass = co.password;
    const isHashed = tempPass && tempPass.startsWith('$2b$');
    if (!tempPass || isHashed || forceNewPassword) {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
      const rand6 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      tempPass = `Axis@${rand6}`;
      d.axiaCompanies[idx].password = await bcrypt.hash(tempPass, 12);
    }

    const portalLink = `${SERVER_URL}/axia-portal.html`;
    const isResend   = !!co.accessSentAt;

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#F5F5F3;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:40px 0">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
    <!-- Header -->
    <tr><td style="background:#1F1F1F;padding:28px 40px">
      <div style="font-family:'Segoe UI',sans-serif;font-weight:900;font-size:22px;color:#D8C7B8">AXIS <span style="color:#C9A84C">IA</span></div>
      <div style="font-size:11px;color:#999;letter-spacing:2px;text-transform:uppercase;margin-top:3px">Portal de Pesquisa Psicossocial</div>
    </td></tr>
    <!-- Body -->
    <tr><td style="padding:36px 40px">
      <h2 style="font-size:20px;font-weight:700;color:#1F1F1F;margin:0 0 8px">Olá, ${co.name}!</h2>
      <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px">
        ${isResend ? 'Seu acesso ao <strong>Axis IA</strong> foi atualizado. Use as credenciais abaixo para entrar na plataforma.' : 'Sua empresa foi cadastrada na plataforma <strong>Axis IA</strong>. Use as credenciais abaixo para acessar o portal e iniciar a gestão de riscos psicossociais.'}
      </p>

      <!-- Credenciais -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;border-radius:10px;margin-bottom:28px">
        <tr><td style="padding:24px 28px">
          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:6px">Link de Acesso</div>
            <a href="${portalLink}" style="color:#C9A84C;font-size:14px;font-weight:600;word-break:break-all">${portalLink}</a>
          </div>
          <div style="margin-bottom:16px">
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:6px">Login</div>
            <div style="font-size:14px;font-weight:600;color:#1F1F1F">${co.email}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#999;margin-bottom:6px">Senha Temporária</div>
            <div style="font-size:18px;font-weight:800;color:#1F1F1F;letter-spacing:2px;background:white;display:inline-block;padding:8px 16px;border-radius:6px;border:2px solid #C9A84C">${tempPass}</div>
          </div>
        </td></tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        <tr><td align="center">
          <a href="${portalLink}" style="display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">▶ Acessar o Portal</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#888;line-height:1.7;margin:0 0 20px">
        Ao acessar pela primeira vez, recomendamos alterar sua senha. Dentro da plataforma você poderá:
      </p>
      <ul style="font-size:13px;color:#555;line-height:2;padding-left:20px;margin:0 0 28px">
        <li>Cadastrar colaboradores</li>
        <li>Enviar pesquisas de riscos psicossociais</li>
        <li>Acompanhar respostas em tempo real</li>
        <li>Gerar relatórios por fator</li>
        <li>Visualizar o diagnóstico AXIS Score</li>
      </ul>

      <p style="font-size:13px;color:#555;margin:0">Atenciosamente,<br>
        <strong style="color:#1F1F1F">Clau Diniz</strong><br>
        <span style="color:#888">Especialista em Riscos Psicossociais e NR-1</span><br>
        <span style="color:#C9A84C;font-weight:700">Axis Consultorias</span>
      </p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#F5F5F3;padding:20px 40px;text-align:center">
      <p style="font-size:11px;color:#bbb;margin:0">Este e-mail foi enviado automaticamente pela plataforma Axis IA.<br>Em caso de dúvidas, entre em contato com a Axis Consultorias.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

    const cfg = loadEmailConfig();
    try {
      await sendEmail({
        to: co.email,
        toName: co.name,
        subject: isResend ? `Seu acesso ao Axis IA foi atualizado` : `Seu acesso ao Axis IA foi criado`,
        html,
        config: cfg
      });
      const now = new Date().toISOString();
      d.axiaCompanies[idx].accessStatus      = isResend ? 'reenviado' : 'enviado';
      d.axiaCompanies[idx].accessSentAt      = co.accessSentAt || now;
      d.axiaCompanies[idx].accessLastSentAt  = now;
      await saveData(d);
      json(200, { ok: true, email: co.email, isResend });
    } catch (e) {
      d.axiaCompanies[idx].accessStatus = 'erro';
      await saveData(d);
      json(200, { ok: false, error: `Não foi possível enviar o acesso. Erro: ${e.message}` });
    }
    return;
  }

  // ── GET /api/axia/departments?token=T ────────────────────────
  const DEPT_DEFAULTS = ['Administrativo','Comercial','Financeiro','RH','Operacional','Produção','Atendimento','Gestão','Liderança','Outros'];
  const POS_DEFAULTS  = ['Auxiliar','Assistente','Analista','Coordenador','Supervisor','Gerente','Diretor','Sócio','Atendente','Vendedor','Operador','Técnico','Outros'];

  if (req.method !== 'POST' && url === '/api/axia/departments') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const d = await loadData();
    if (!d.axiaDepartments) d.axiaDepartments = [];
    let depts = d.axiaDepartments.filter(x => x.companyId === co.id);
    if (!depts.length) {
      depts = DEPT_DEFAULTS.map((name, i) => ({ id: `dept_${co.id}_${i}`, companyId: co.id, name, active: true, createdAt: new Date().toISOString() }));
      d.axiaDepartments.push(...depts);
      await saveData(d);
    }
    json(200, { ok: true, departments: depts });
    return;
  }

  // ── POST /api/axia/departments?token=T ───────────────────────
  if (req.method === 'POST' && url === '/api/axia/departments') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const body = await readBody(req);
      const d = await loadData();
      if (!d.axiaDepartments) d.axiaDepartments = [];
      if (body.action === 'delete') {
        if (!body.id) return json(400, { ok: false, error: 'id obrigatório.' });
        d.axiaDepartments = d.axiaDepartments.filter(x => !(x.companyId === co.id && x.id === body.id));
      } else if (body.action === 'toggle') {
        if (!body.id) return json(400, { ok: false, error: 'id obrigatório.' });
        const i = d.axiaDepartments.findIndex(x => x.companyId === co.id && x.id === body.id);
        if (i >= 0) d.axiaDepartments[i].active = !d.axiaDepartments[i].active;
      } else {
        if (!body.name) return json(400, { ok: false, error: 'Nome do departamento obrigatório.' });
        const dept = { companyId: co.id, active: true, createdAt: new Date().toISOString(), ...body, id: body.id || `dept_${Date.now()}` };
        const i = d.axiaDepartments.findIndex(x => x.companyId === co.id && x.id === dept.id);
        if (i >= 0) d.axiaDepartments[i] = dept; else d.axiaDepartments.push(dept);
      }
      await saveData(d);
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/positions?token=T ──────────────────────────
  if (req.method !== 'POST' && url === '/api/axia/positions') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const d = await loadData();
    if (!d.axiaPositions) d.axiaPositions = [];
    let positions = d.axiaPositions.filter(x => x.companyId === co.id);
    if (!positions.length) {
      positions = POS_DEFAULTS.map((name, i) => ({ id: `pos_${co.id}_${i}`, companyId: co.id, name, active: true, createdAt: new Date().toISOString() }));
      d.axiaPositions.push(...positions);
      await saveData(d);
    }
    json(200, { ok: true, positions });
    return;
  }

  // ── POST /api/axia/positions?token=T ─────────────────────────
  if (req.method === 'POST' && url === '/api/axia/positions') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const body = await readBody(req);
      const d = await loadData();
      if (!d.axiaPositions) d.axiaPositions = [];
      if (body.action === 'delete') {
        if (!body.id) return json(400, { ok: false, error: 'id obrigatório.' });
        d.axiaPositions = d.axiaPositions.filter(x => !(x.companyId === co.id && x.id === body.id));
      } else if (body.action === 'toggle') {
        if (!body.id) return json(400, { ok: false, error: 'id obrigatório.' });
        const i = d.axiaPositions.findIndex(x => x.companyId === co.id && x.id === body.id);
        if (i >= 0) d.axiaPositions[i].active = !d.axiaPositions[i].active;
      } else {
        if (!body.name) return json(400, { ok: false, error: 'Nome do cargo obrigatório.' });
        const pos = { companyId: co.id, active: true, createdAt: new Date().toISOString(), ...body, id: body.id || `pos_${Date.now()}` };
        const i = d.axiaPositions.findIndex(x => x.companyId === co.id && x.id === pos.id);
        if (i >= 0) d.axiaPositions[i] = pos; else d.axiaPositions.push(pos);
      }
      await saveData(d);
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/employees?token=T ──────────────────────────
  if (req.method !== 'POST' && url === '/api/axia/employees') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const d = await loadData();
    json(200, { ok: true, employees: (d.axiaEmployees || []).filter(e => e.companyId === co.id) });
    return;
  }

  // ── POST /api/axia/employees?token=T ─────────────────────────
  if (req.method === 'POST' && url === '/api/axia/employees') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
    const body = await readBody(req);
    const d = await loadData();
    if (!d.axiaEmployees) d.axiaEmployees = [];
    const now = new Date().toISOString();
    if (body.action === 'delete') {
      d.axiaEmployees = d.axiaEmployees.filter(e => !(e.companyId === co.id && e.id === body.id));
    } else if (body.action === 'import') {
      const depts = (d.axiaDepartments || []).filter(x => x.companyId === co.id);
      const poss  = (d.axiaPositions  || []).filter(x => x.companyId === co.id);
      let newDepts = 0, newPoss = 0;
      (body.employees || []).forEach(emp => {
        // auto-create dept if needed
        if (emp.setor && !depts.find(x => x.name === emp.setor)) {
          const nd = { id: `dept_${Date.now()}_${Math.random().toString(36).slice(2)}`, companyId: co.id, name: emp.setor, active: true, createdAt: now };
          if (!d.axiaDepartments) d.axiaDepartments = [];
          d.axiaDepartments.push(nd); depts.push(nd); newDepts++;
        }
        if (emp.cargo && !poss.find(x => x.name === emp.cargo)) {
          const np = { id: `pos_${Date.now()}_${Math.random().toString(36).slice(2)}`, companyId: co.id, name: emp.cargo, active: true, createdAt: now };
          if (!d.axiaPositions) d.axiaPositions = [];
          d.axiaPositions.push(np); poss.push(np); newPoss++;
        }
        d.axiaEmployees.push({ ...emp, id: `emp_${Date.now()}_${Math.random().toString(36).slice(2)}`, companyId: co.id, status: 'ativo', createdAt: now, updatedAt: now });
      });
      await saveData(d);
      json(200, { ok: true, imported: (body.employees||[]).length, newDepts, newPoss });
      return;
    } else {
      const emp = { ...body, companyId: co.id, id: body.id || `emp_${Date.now()}`, updatedAt: now };
      if (!emp.createdAt) emp.createdAt = now;
      const i = d.axiaEmployees.findIndex(e => e.id === emp.id && e.companyId === co.id);
      if (i >= 0) d.axiaEmployees[i] = emp; else d.axiaEmployees.push(emp);
    }
    await saveData(d);
    json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── POST /api/axia/survey?token=T (cria + envia pesquisa) ─────
  if (req.method === 'POST' && url === '/api/axia/survey') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'email', 50, 3600000))
      return json(429, { ok: false, error: 'Muitas requisições. Tente novamente em 1 hora.' });
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
    const body = await readBody(req);
    if (!body.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0)
      return json(400, { ok: false, error: 'Lista de destinatários obrigatória.' });
    const d = await loadData();
    if (!d.axiaSurveys) d.axiaSurveys = [];
    const surveyId = `sv_${Date.now()}`;
    const survey = { id: surveyId, companyId: co.id, name: body.name || `Pesquisa ${new Date().toLocaleDateString('pt-BR')}`, createdAt: new Date().toISOString(), status: 'ativo', sentTo: [] };
    const config = loadEmailConfig();
    let sent = 0, errors = 0;
    for (const emp of (body.recipients || [])) {
      const t = `r_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      survey.sentTo.push({ empId: emp.id, surveyToken: t, sentAt: new Date().toISOString(), status: 'enviado' });
      try {
        const link = `${SERVER_URL}/pesquisa/${t}`;
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
  <tr><td style="background:#1F1F1F;padding:24px 32px">
    <p style="margin:0;font-size:20px;font-weight:900;color:#D8C7B8">AXIS <span style="color:#C9A84C">IA</span></p>
    <p style="margin:4px 0 0;font-size:10px;color:rgba(216,199,184,0.5);letter-spacing:2px;text-transform:uppercase">Pesquisa de Riscos Psicossociais</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 12px;font-size:16px;color:#1F1F1F">Olá, <strong>${emp.name}</strong></p>
    <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.7">Você foi convidado(a) a participar da <strong>Pesquisa de Riscos Psicossociais</strong> promovida por <strong>${co.name}</strong>.<br>Suas respostas são <strong>totalmente confidenciais</strong> — os resultados são apresentados apenas de forma agrupada.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
      <tr><td align="center">
        <a href="${link}" style="display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:15px;font-weight:700">▶ Responder Pesquisa</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#999999;text-align:center">Se o botão não abrir, copie e cole o link abaixo no seu navegador:</p>
    <p style="margin:0;font-size:13px;color:#1976D2;text-align:center;word-break:break-all;font-family:monospace">${link}</p>
  </td></tr>
  <tr><td style="background:#F9F9F9;padding:14px 32px;border-top:1px solid #EEEEEE;text-align:center">
    <p style="margin:0;font-size:11px;color:#AAAAAA">Enviado via <strong>AXIS IA</strong> · ${co.name}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
        await sendEmail({ to: emp.email, toName: emp.name, subject: `Pesquisa de Riscos Psicossociais – ${co.name}`, html, config });
        sent++;
      } catch(e) { errors++; console.error('Email axia error:', e.message); }
    }
    d.axiaSurveys.push(survey);
    await saveData(d);
    json(200, { ok: true, surveyId, sent, errors });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/surveys?token=T ────────────────────────────
  if (url === '/api/axia/surveys') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const d = await loadData();
      const surveys = (d.axiaSurveys || []).filter(s => s.companyId === co.id).map(s => ({
        id: s.id, name: s.name, createdAt: s.createdAt, status: s.status,
        sent: s.sentTo.length,
        responded: s.sentTo.filter(r => r.status === 'respondido').length
      }));
      json(200, { ok: true, surveys });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/validate-token?t=T (página do colaborador) ──
  if (url === '/api/axia/validate-token') {
    const t = params.get('t');
    if (!t) return json(400, { ok: false, error: 'Token obrigatório.' });
    try {
      const d = await loadData();
      for (const sv of (d.axiaSurveys || [])) {
        const rec = sv.sentTo.find(r => r.surveyToken === t);
        if (rec) {
          if (rec.status === 'respondido') return json(400, { ok: false, error: 'Você já respondeu esta pesquisa.' });
          const co = (d.axiaCompanies || []).find(c => c.id === sv.companyId);
          return json(200, { ok: true, surveyName: sv.name, companyName: co?.name || '' });
        }
      }
      json(404, { ok: false, error: 'Link inválido ou expirado.' });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── POST /api/axia/respond (público — sem auth, usa surveyToken) ─
  if (req.method === 'POST' && url === '/api/axia/respond') {
    try {
      const { surveyToken, answers } = await readBody(req);
      if (!surveyToken) return json(400, { ok: false, error: 'Token obrigatório.' });
      if (!answers || typeof answers !== 'object') return json(400, { ok: false, error: 'Respostas obrigatórias.' });
      const d = await loadData();
      let found = false;
      for (const sv of (d.axiaSurveys || [])) {
        const rec = sv.sentTo.find(r => r.surveyToken === surveyToken);
        if (rec) {
          if (rec.status === 'respondido') return json(400, { ok: false, error: 'Já respondido.' });
          rec.status = 'respondido'; rec.respondedAt = new Date().toISOString();
          if (!d.axiaResponses) d.axiaResponses = [];
          d.axiaResponses.push({ id: `resp_${Date.now()}`, surveyId: sv.id, companyId: sv.companyId, answers, createdAt: new Date().toISOString() });
          found = true; break;
        }
      }
      if (!found) return json(404, { ok: false, error: 'Link inválido.' });
      await saveData(d);
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/results?token=T&surveyId=ID ─────────────────
  if (url === '/api/axia/results') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
    const surveyId = params.get('surveyId');
    const d = await loadData();
    const resps = (d.axiaResponses || []).filter(r => r.companyId === co.id && (!surveyId || r.surveyId === surveyId));
    if (resps.length < 5) return json(200, { ok: true, insufficient: true, count: resps.length, minRequired: 5 });
    const FACTORS = ['assedio','sobrecarga','reconhecimento','clima','autonomia','pressao','seguranca','comunicacao','equilibrio','lideranca'];
    const agg = {};
    FACTORS.forEach(f => {
      const vals = resps.map(r => r.answers[f]).filter(v => v != null);
      agg[f] = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*20) : null;
    });
    const vals = Object.values(agg).filter(v=>v!=null);
    json(200, { ok: true, count: resps.length, overallScore: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : null, factors: agg });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET/POST /api/axia/action-plan?token=T ───────────────────
  if (url === '/api/axia/action-plan' || (req.method === 'POST' && url === '/api/axia/action-plan')) {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const d = await loadData();
      if (req.method === 'POST') {
        const body = await readBody(req);
        if (!d.axiaActionPlans) d.axiaActionPlans = [];
        if (body.action === 'delete') { d.axiaActionPlans = d.axiaActionPlans.filter(p=>!(p.id===body.id&&p.companyId===co.id)); }
        else {
          const plan = { ...body, companyId: co.id, id: body.id || `ap_${Date.now()}` };
          const i = d.axiaActionPlans.findIndex(p=>p.id===plan.id&&p.companyId===co.id);
          if (i>=0) d.axiaActionPlans[i]=plan; else d.axiaActionPlans.push(plan);
        }
        await saveData(d);
        json(200, { ok: true }); return;
      }
      json(200, { ok: true, plans: (d.axiaActionPlans||[]).filter(p=>p.companyId===co.id) });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ══════════════════════════════════════════════════════════════

  if (req.method === 'POST' && url === '/api/save-response') {
    try {
      const body = await readBody(req);
      if (!body.resposta) return json(400, { ok: false, error: 'resposta obrigatória.' });
      const data = await loadData();
      if (!data.respostasRH) data.respostasRH = [];
      data.respostasRH.push(body.resposta);
      if (body.conviteId) {
        const c = data.convites?.find(x => x.id === body.conviteId);
        if (c) c.respondido = true;
      }
      await saveData(data);
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/get-responses?pesquisaId=ID ─────────────────────
  if (url === '/api/get-responses') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const pesquisaId = params.get('pesquisaId');
    if (!pesquisaId) return json(400, { ok: false, error: 'pesquisaId obrigatório.' });
    try {
      const data = await loadData();
      const respostas = (data.respostasRH || []).filter(r => r.pesquisaId === pesquisaId);
      const convites  = (data.convites   || []).filter(c => c.pesquisaId === pesquisaId);
      json(200, { ok: true, respostas, convites });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/all-data ────────────────────────────────────────
  if (url === '/api/all-data') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      json(200, { ok: true, data: await loadData() });
    } catch(e) { json(500, { erro: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── POST /api/import-data ────────────────────────────────────
  if (req.method === 'POST' && url === '/api/import-data') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const incoming = await readBody(req);
      await saveData(incoming);
      json(200, { ok: true });
    } catch(e) { json(500, { erro: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ══ AXIS AUTOCONHECIMENTO — CLIENTES ════════════════════════════

  // ── GET /autoconhecimento/redefinir-senha/:token ─────────────
  if (url.startsWith('/autoconhecimento/redefinir-senha/')) {
    const resetToken = decodeURIComponent(url.split('/autoconhecimento/redefinir-senha/')[1].split('?')[0]);
    fs.readFile(path.join(DIR, 'autoconhecimento-portal.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(404); res.end('Página não encontrada.'); return; }
      const out = html.replace('</head>', `<script>window._RESET_TOKEN=${JSON.stringify(resetToken)};</script>\n</head>`);
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(out);
    }); return;
  }

  // ── POST /api/ac/request-password-reset ──────────────────────
  if (req.method === 'POST' && url === '/api/ac/request-password-reset') {
    const {email} = await readBody(req);
    const SAFE_MSG = 'Se este e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.';
    // Retorna sempre a mesma mensagem (segurança — não revela se e-mail existe)
    json(200, {ok:true, message: SAFE_MSG});
    if (!email) return;
    try {
      const r = await pool.query("SELECT * FROM axis_auto_clients WHERE email=$1 AND status!='inactive'",[email.toLowerCase()]);
      if (!r.rows.length) return;
      const cl = r.rows[0];
      const token = acToken();
      const expiresAt = new Date(Date.now() + 30*60*1000).toISOString(); // 30 min
      await pool.query('INSERT INTO axis_auto_password_resets (id,client_id,token,expires_at) VALUES ($1,$2,$3,$4)',
        [acId('rst'), cl.id, token, expiresAt]);
      const resetLink = `${SERVER_URL}/autoconhecimento/redefinir-senha/${token}`;
      const config = loadEmailConfig();
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:32px 16px">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden">
  <tr><td style="background:#1F1F1F;padding:24px 32px">
    <p style="margin:0;font-size:20px;font-weight:900;color:#D8C7B8;font-family:Arial,sans-serif">AXIS <span style="color:#C9A84C">IA</span></p>
    <p style="margin:4px 0 0;font-size:10px;color:rgba(216,199,184,.5);letter-spacing:2px;text-transform:uppercase">Autoconhecimento</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 12px;font-size:16px;color:#1F1F1F">Olá, <strong>${cl.name.split(' ')[0]}</strong></p>
    <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7">Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.<br><br>Este link expira em <strong>30 minutos</strong>.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
      <tr><td align="center"><a href="${resetLink}" style="display:inline-block;background:#C9A84C;color:#1F1F1F;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:15px;font-weight:700">🔑 Redefinir Minha Senha</a></td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center">Se não foi você, ignore este e-mail.</p>
    <p style="margin:0;font-size:12px;color:#1976D2;text-align:center;word-break:break-all;font-family:monospace">${resetLink}</p>
  </td></tr>
  <tr><td style="background:#F9F9F9;padding:14px 32px;border-top:1px solid #EEE;text-align:center">
    <p style="margin:0;font-size:11px;color:#AAA">Enviado via <strong>AXIS IA</strong> — este link expira em 30 min</p>
  </td></tr>
</table></td></tr></table></body></html>`;
      try { await sendEmail({to:cl.email, toName:cl.name, subject:'Redefinição de senha — Axis Autoconhecimento', html, config}); }
      catch(em){ console.error('Reset email error:', em.message); }
    } catch(e){ console.error('Reset request error:', e.message); }
    return;
  }

  // ── GET /api/ac/validate-reset-token/:token ───────────────────
  if (req.method !== 'POST' && url.startsWith('/api/ac/validate-reset-token/')) {
    const token = decodeURIComponent(url.split('/api/ac/validate-reset-token/')[1]);
    try {
      const r = await pool.query('SELECT * FROM axis_auto_password_resets WHERE token=$1 AND used_at IS NULL', [token]);
      if (!r.rows.length) return json(404, {ok:false, error:'Link inválido.'});
      if (new Date(r.rows[0].expires_at) < new Date()) return json(400, {ok:false, error:'Link expirado. Solicite um novo.'});
      json(200, {ok:true});
    } catch(e){ json(500,{ok:false,error:e.message}); } return;
  }

  // ── POST /api/ac/reset-password ───────────────────────────────
  if (req.method === 'POST' && url === '/api/ac/reset-password') {
    const {token, newPassword} = await readBody(req);
    if (!token || !newPassword) return json(400,{ok:false,error:'Dados incompletos.'});
    if (newPassword.length < 6) return json(400,{ok:false,error:'A senha deve ter pelo menos 6 caracteres.'});
    try {
      const r = await pool.query('SELECT * FROM axis_auto_password_resets WHERE token=$1 AND used_at IS NULL', [token]);
      if (!r.rows.length) return json(404,{ok:false,error:'Link inválido.'});
      if (new Date(r.rows[0].expires_at) < new Date()) return json(400,{ok:false,error:'Link expirado. Solicite um novo.'});
      await pool.query('UPDATE axis_auto_clients SET password_hash=$1, must_change_password=false WHERE id=$2',
        [acHash(newPassword), r.rows[0].client_id]);
      await pool.query('UPDATE axis_auto_password_resets SET used_at=NOW() WHERE token=$1', [token]);
      json(200,{ok:true,message:'Senha redefinida com sucesso!'});
    } catch(e){ json(500,{ok:false,error:e.message}); } return;
  }

  // ── POST /api/ac/check-reset-email ──────────────────────────
  if (req.method === 'POST' && url === '/api/ac/check-reset-email') {
    const {email} = await readBody(req);
    if (!email) return json(400,{ok:false,error:'Informe o e-mail.'});
    try {
      const r = await pool.query("SELECT id FROM axis_auto_clients WHERE LOWER(email)=LOWER($1) AND status!='inactive'",[email.trim()]);
      if (!r.rows.length) return json(200,{ok:false,error:'E-mail não encontrado. Verifique o endereço informado.'});
      json(200,{ok:true});
    } catch(e){ json(500,{ok:false,error:e.message}); } return;
  }

  // ── POST /api/ac/reset-password-direct ──────────────────────
  if (req.method === 'POST' && url === '/api/ac/reset-password-direct') {
    const {email, newPassword} = await readBody(req);
    if (!email || !newPassword) return json(400,{ok:false,error:'Dados incompletos.'});
    if (newPassword.length < 6) return json(400,{ok:false,error:'A senha deve ter pelo menos 6 caracteres.'});
    try {
      const r = await pool.query("SELECT id FROM axis_auto_clients WHERE LOWER(email)=LOWER($1) AND status!='inactive'",[email.trim()]);
      if (!r.rows.length) return json(404,{ok:false,error:'E-mail não encontrado.'});
      await pool.query('UPDATE axis_auto_clients SET password_hash=$1, must_change_password=false WHERE id=$2',
        [acHash(newPassword), r.rows[0].id]);
      json(200,{ok:true,message:'Senha redefinida com sucesso!'});
    } catch(e){ json(500,{ok:false,error:e.message}); } return;
  }

  // ── GET /autoconhecimento/... → serve portal do cliente ──────
  if (url.startsWith('/autoconhecimento/acesso/') || url === '/autoconhecimento/cliente' || url.startsWith('/autoconhecimento/linguagens') || url.startsWith('/autoconhecimento/meus-resultados')) {
    const token = url.startsWith('/autoconhecimento/acesso/') ? decodeURIComponent(url.split('/autoconhecimento/acesso/')[1].split('?')[0]) : '';
    fs.readFile(path.join(DIR, 'autoconhecimento-portal.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(404); res.end('Página não encontrada.'); return; }
      const out = token ? html.replace('</head>', `<script>window._AC_TOKEN=${JSON.stringify(token)};</script>\n</head>`) : html;
      res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8' }); res.end(out);
    }); return;
  }

  // ── POST /api/ac/clients ─────────────────────────────────────
  if (req.method === 'POST' && url === '/api/ac/clients') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const b = await readBody(req);
    if (!b.name || !b.email) return json(400, {ok:false, error:'Nome e e-mail obrigatórios.'});
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return json(400, {ok:false, error:'E-mail inválido.'});
    if (b.name.length > 100) return json(400, {ok:false, error:'Nome muito longo.'});
    try {
      const ex = await pool.query('SELECT id FROM axis_auto_clients WHERE email=$1',[b.email.toLowerCase()]);
      if (ex.rows.length) return json(409, {ok:false, error:'E-mail já cadastrado.'});
      const id = acId('ac'); const tmp = acTempPwd();
      await pool.query('INSERT INTO axis_auto_clients (id,name,email,phone,password_hash,observacoes,created_by,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, b.name, b.email.toLowerCase(), b.phone||'', acHash(tmp), b.observacoes||'', b.createdBy||'admin', true]);
      // Correção 5: enviar e-mail de boas-vindas automaticamente
      const config = loadEmailConfig();
      const firstName = b.name.split(' ')[0];
      const welcomeHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:32px 16px">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden">
  <tr><td style="background:#1F1F1F;padding:24px 32px">
    <p style="margin:0;font-size:20px;font-weight:900;color:#D8C7B8;font-family:Arial,sans-serif">AXIS <span style="color:#C9A84C">IA</span></p>
    <p style="margin:4px 0 0;font-size:10px;color:rgba(216,199,184,0.5);letter-spacing:2px;text-transform:uppercase">Autoconhecimento</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 16px;font-size:16px;color:#1F1F1F">Olá, <strong>${firstName}</strong> 👋</p>
    <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.7">Você foi cadastrado(a) na plataforma <strong>Axis Autoconhecimento</strong>. Quando sua avaliação for liberada, você receberá um link para acessar.</p>
    <div style="background:#F5F5F3;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="margin:0 0 8px;font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px">Seus dados de acesso</p>
      <p style="margin:0 0 4px;font-size:14px"><strong>E-mail:</strong> ${b.email.toLowerCase()}</p>
      <p style="margin:0;font-size:14px"><strong>Senha temporária:</strong> <span style="font-family:monospace;background:#fff;padding:2px 8px;border-radius:4px;border:1px solid #ddd">${tmp}</span></p>
    </div>
    <p style="margin:0;font-size:12px;color:#999;text-align:center">Você receberá um novo e-mail com o link quando sua avaliação for liberada.</p>
  </td></tr>
  <tr><td style="background:#F9F9F9;padding:14px 32px;border-top:1px solid #EEE;text-align:center">
    <p style="margin:0;font-size:11px;color:#AAA">Enviado via <strong>AXIS IA</strong> — Autoconhecimento</p>
  </td></tr>
</table></td></tr></table></body></html>`;
      try {
        await sendEmail({to:b.email.toLowerCase(),toName:b.name,subject:'Convite para Avaliação — Axis Autoconhecimento',html:welcomeHtml,config});
      } catch(em){ console.error('Welcome email:', em.message); }
      json(200, {ok:true, id, tempPassword:tmp, emailSent:true});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/clients ──────────────────────────────────────
  if (req.method !== 'POST' && url === '/api/ac/clients') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const statusFilter = params.get('status') || 'active';
    try {
      const whereClause = statusFilter === 'all' ? '' : statusFilter === 'inactive' ? "WHERE c.status='inactive'" : "WHERE c.status!='inactive'";
      const r = await pool.query(`SELECT c.id,c.name,c.email,c.phone,c.status,c.observacoes,c.created_at, COUNT(DISTINCT ct.id) as test_count, COUNT(DISTINCT CASE WHEN ct.status='completed' THEN ct.id END) as completed_count FROM axis_auto_clients c LEFT JOIN axis_auto_client_tests ct ON ct.client_id=c.id ${whereClause} GROUP BY c.id,c.name,c.email,c.phone,c.status,c.observacoes,c.created_at ORDER BY c.created_at DESC`);
      json(200, {ok:true, clients:r.rows});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── POST /api/ac/clients/set-status ──────────────────────────
  if (req.method === 'POST' && url === '/api/ac/clients/set-status') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const {clientId, status} = await readBody(req);
    if (!['active','inactive'].includes(status)) return json(400,{ok:false,error:'Status inválido.'});
    try {
      await pool.query('UPDATE axis_auto_clients SET status=$1 WHERE id=$2',[status,clientId]);
      json(200,{ok:true});
    } catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── DELETE /api/ac/clients/:id ───────────────────────────────
  if (req.method === 'DELETE' && url.startsWith('/api/ac/clients/')) {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientId = url.split('/api/ac/clients/')[1];
    try {
      // Verificar se tem dados históricos
      const hasData = await pool.query('SELECT 1 FROM axis_auto_client_tests WHERE client_id=$1 LIMIT 1',[clientId]);
      if (hasData.rows.length) return json(409,{ok:false,error:'Este cliente possui histórico. Use Inativar para preservar os dados.'});
      await pool.query('DELETE FROM axis_auto_invites WHERE client_id=$1',[clientId]);
      await pool.query('DELETE FROM axis_auto_module_permissions WHERE client_id=$1',[clientId]);
      await pool.query('DELETE FROM axis_auto_clients WHERE id=$1',[clientId]);
      json(200,{ok:true});
    } catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── POST /api/ac/clients/reset-password ──────────────────────
  if (req.method === 'POST' && url === '/api/ac/clients/reset-password') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const {clientId} = await readBody(req);
    const tmp = acTempPwd();
    try {
      const r = await pool.query('UPDATE axis_auto_clients SET password_hash=$1 WHERE id=$2 RETURNING id',[acHash(tmp),clientId]);
      if (!r.rows.length) return json(404, {ok:false, error:'Cliente não encontrado.'});
      json(200, {ok:true, tempPassword:tmp});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/modules ──────────────────────────────────────
  if (req.method !== 'POST' && url === '/api/ac/modules') {
    try { const r=await pool.query('SELECT * FROM axis_auto_modules ORDER BY created_at'); json(200,{ok:true,modules:r.rows}); }
    catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── POST /api/ac/module-permissions ──────────────────────────
  if (req.method === 'POST' && url === '/api/ac/module-permissions') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const b=await readBody(req);
    const id=acId('perm');
    try {
      await pool.query(`INSERT INTO axis_auto_module_permissions (id,client_id,module_id,invite_id,allow_result_view,allow_retake) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id,b.clientId,b.moduleId,b.inviteId||null,b.allowResultView!==false,b.allowRetake||false]);
      json(200,{ok:true,id});
    } catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── GET /api/ac/module-permissions ───────────────────────────
  if (req.method !== 'POST' && url === '/api/ac/module-permissions') {
    const cId=params.get('clientId');
    if(!cId) return json(400,{ok:false,error:'clientId obrigatório'});
    try {
      const r=await pool.query(`SELECT p.*,m.name as module_name,m.slug,m.icon,m.description FROM axis_auto_module_permissions p LEFT JOIN axis_auto_modules m ON m.id=p.module_id WHERE p.client_id=$1 ORDER BY p.created_at DESC`,[cId]);
      json(200,{ok:true,permissions:r.rows});
    } catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── POST /api/ac/invite ──────────────────────────────────────
  if (req.method === 'POST' && url === '/api/ac/invite') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const b = await readBody(req);
    const token = acToken(); const id = acId('inv');
    const moduleId = b.moduleId || 'mod_ling';
    const allowResultView = b.allowResultView !== false;
    const allowRetake = b.allowRetake || false;
    try {
      // Map moduleId to test slug for backwards compat
      const testId = moduleId === 'mod_crianca' ? 'crianca-interior' : moduleId === 'mod_disc' ? 'disc' : 'linguagens';
      await pool.query('INSERT INTO axis_auto_invites (id,client_id,token,test_id,module_id,allow_result_view,allow_retake,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id, b.clientId, token, testId, moduleId, allowResultView, allowRetake, b.expiresAt||null, 'admin']);
      // Also create module permission
      await pool.query(`INSERT INTO axis_auto_module_permissions (id,client_id,module_id,invite_id,allow_result_view,allow_retake) VALUES ($1,$2,$3,$4,$5,$6)`,
        [acId('perm'), b.clientId, moduleId, id, allowResultView, allowRetake]);
      json(200, {ok:true, token, link:`${SERVER_URL}/autoconhecimento/acesso/${token}`, inviteId:id});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/invites ──────────────────────────────────────
  if (req.method !== 'POST' && url.startsWith('/api/ac/invites')) {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const cId = params.get('clientId');
    try {
      const q = cId ? 'SELECT * FROM axis_auto_invites WHERE client_id=$1 ORDER BY created_at DESC' : 'SELECT i.*,c.name as client_name FROM axis_auto_invites i JOIN axis_auto_clients c ON c.id=i.client_id ORDER BY i.created_at DESC LIMIT 100';
      const r = await pool.query(q, cId?[cId]:[]);
      json(200, {ok:true, invites:r.rows});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/invite-info/:token ───────────────────────────
  if (req.method !== 'POST' && url.startsWith('/api/ac/invite-info/')) {
    const token = decodeURIComponent(url.split('/api/ac/invite-info/')[1]);
    try {
      const r = await pool.query(`SELECT i.*,c.name as client_name,c.email as client_email, m.name as module_name,m.slug as module_slug,m.icon as module_icon FROM axis_auto_invites i JOIN axis_auto_clients c ON c.id=i.client_id LEFT JOIN axis_auto_modules m ON m.id=i.module_id WHERE i.token=$1`,[token]);
      if (!r.rows.length) return json(404, {ok:false, error:'Link inválido ou expirado.'});
      const inv = r.rows[0];
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) return json(400, {ok:false, error:'Link expirado.'});
      json(200, {ok:true, clientName:inv.client_name, clientEmail:inv.client_email, testId:inv.test_id, inviteId:inv.id, status:inv.status,
        moduleId:inv.module_id||'mod_ling', moduleName:inv.module_name||'Linguagens de Valorização',
        moduleSlug:inv.module_slug||'linguagens-valorizacao', moduleIcon:inv.module_icon||'💬',
        allowResultView:inv.allow_result_view!==false, allowRetake:inv.allow_retake||false});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── POST /api/ac/client-login ────────────────────────────────
  if (req.method === 'POST' && url === '/api/ac/client-login') {
    const {email, password} = await readBody(req);
    if (!email || !password) return json(400, { ok: false, error: 'E-mail e senha são obrigatórios.' });
    try {
      const r = await pool.query('SELECT * FROM axis_auto_clients WHERE email=$1',[email.toLowerCase()]);
      if (!r.rows.length || r.rows[0].password_hash !== acHash(password)) return json(401,{ok:false,error:'E-mail ou senha inválidos.'});
      const cl = r.rows[0]; const sessionToken = acToken();
      const d = await loadData();
      if (!d.acClientSessions) d.acClientSessions = {};
      Object.keys(d.acClientSessions).forEach(t=>{ if(Date.now()-d.acClientSessions[t].createdAt>86400000) delete d.acClientSessions[t]; });
      d.acClientSessions[sessionToken] = {clientId:cl.id, createdAt:Date.now()};
      await saveData(d);
      json(200, {ok:true, token:sessionToken, clientId:cl.id, clientName:cl.name, clientEmail:cl.email});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/client-dashboard?s=TOKEN ─────────────────────
  if (req.method !== 'POST' && url === '/api/ac/client-dashboard') {
    const s = params.get('s');
    const d = await loadData();
    const sess = (d.acClientSessions||{})[s];
    if (!sess || Date.now()-sess.createdAt>86400000) return json(401,{ok:false,error:'Sessão inválida.'});
    try {
      const inv = await pool.query(`
        SELECT i.id, i.test_id, i.module_id, i.status, i.allow_result_view, i.allow_retake, i.created_at,
               COALESCE(m.name, i.test_id) as module_name, COALESCE(m.slug, i.test_id) as module_slug,
               COALESCE(m.icon,'💬') as module_icon,
               ct.id as test_instance_id, ct.status as test_status, ct.started_at, ct.completed_at,
               r.id as result_id, r.scores_json, r.ranking_json
        FROM axis_auto_invites i
        LEFT JOIN axis_auto_modules m ON m.id = i.module_id
        LEFT JOIN axis_auto_client_tests ct ON ct.invite_id = i.id AND ct.client_id = $1
        LEFT JOIN axis_auto_results r ON r.client_test_id = ct.id
        WHERE i.client_id = $1 ORDER BY i.created_at DESC
      `,[sess.clientId]);
      json(200, {ok:true, tests:inv.rows, clientId:sess.clientId});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── POST /api/ac/client-test/save-phase (salva fase imediatamente) ──
  if (req.method === 'POST' && url === '/api/ac/client-test/save-phase') {
    const {s, clientTestId, phase, answers} = await readBody(req);
    const d = await loadData(); const sess = (d.acClientSessions||{})[s];
    if (!sess) return json(401,{ok:false,error:'Sessão inválida.'});
    try {
      // Substituir respostas desta fase (upsert por phase_number)
      await pool.query('DELETE FROM axis_auto_answers WHERE client_test_id=$1 AND phase_number=$2',[clientTestId,phase]);
      for (const a of (answers||[])) {
        await pool.query('INSERT INTO axis_auto_answers (id,client_test_id,phase_number,category,position,score) VALUES ($1,$2,$3,$4,$5,$6)',
          [acId('ans'),clientTestId,phase,a.category,a.position,a.score]);
      }
      json(200,{ok:true,phase,saved:answers?.length||0});
    } catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── GET /api/ac/client-test/progress?s=S&testId=ID ──────────
  if (req.method !== 'POST' && url === '/api/ac/client-test/progress') {
    const s = params.get('s'); const testId = params.get('testId');
    const d = await loadData(); const sess = (d.acClientSessions||{})[s];
    if (!sess) return json(401,{ok:false,error:'Sessão inválida.'});
    try {
      const r = await pool.query(
        'SELECT phase_number,category,position,score FROM axis_auto_answers WHERE client_test_id=$1 ORDER BY phase_number,position',
        [testId]
      );
      json(200,{ok:true,answers:r.rows,count:r.rows.length});
    } catch(e){json(500,{ok:false,error:e.message});} return;
  }

  // ── POST /api/ac/client-test/start ───────────────────────────
  if (req.method === 'POST' && url === '/api/ac/client-test/start') {
    const {s, inviteId} = await readBody(req);
    const d = await loadData(); const sess = (d.acClientSessions||{})[s];
    if (!sess) return json(401,{ok:false,error:'Sessão inválida.'});
    try {
      const inv = await pool.query('SELECT * FROM axis_auto_invites WHERE id=$1 AND client_id=$2',[inviteId,sess.clientId]);
      if (!inv.rows.length) return json(404,{ok:false,error:'Convite não encontrado.'});
      const testId = acId('ct');
      await pool.query('INSERT INTO axis_auto_client_tests (id,client_id,invite_id,test_id,status,started_at) VALUES ($1,$2,$3,$4,$5,NOW())',[testId,sess.clientId,inviteId,inv.rows[0].test_id,'in_progress']);
      await pool.query("UPDATE axis_auto_invites SET status='in_progress' WHERE id=$1",[inviteId]);
      json(200, {ok:true, clientTestId:testId});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── POST /api/ac/client-test/complete ────────────────────────
  if (req.method === 'POST' && url === '/api/ac/client-test/complete') {
    const {s, clientTestId, scores, ranking, answers} = await readBody(req);
    const d = await loadData(); const sess = (d.acClientSessions||{})[s];
    if (!sess) return json(401,{ok:false,error:'Sessão inválida.'});
    try {
      if (answers&&answers.length) for (const a of answers) await pool.query('INSERT INTO axis_auto_answers (id,client_test_id,phase_number,category,position,score) VALUES ($1,$2,$3,$4,$5,$6)',[acId('ans'),clientTestId,a.phase,a.category,a.position,a.score]);
      const rId = acId('res');
      await pool.query('INSERT INTO axis_auto_results (id,client_test_id,client_id,scores_json,ranking_json) VALUES ($1,$2,$3,$4,$5)',[rId,clientTestId,sess.clientId,JSON.stringify(scores),JSON.stringify(ranking)]);
      await pool.query("UPDATE axis_auto_client_tests SET status='completed',completed_at=NOW() WHERE id=$1",[clientTestId]);
      await pool.query("UPDATE axis_auto_invites SET status='completed' WHERE id=(SELECT invite_id FROM axis_auto_client_tests WHERE id=$1)",[clientTestId]);
      json(200, {ok:true, resultId:rId});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/admin-results ────────────────────────────────
  if (req.method !== 'POST' && url === '/api/ac/admin-results') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const r = await pool.query(`
        SELECT r.id, r.scores_json, r.ranking_json, r.ai_analysis, r.created_at,
               c.name as client_name, c.email as client_email, c.phone,
               ct.id as client_test_id, ct.test_id, ct.status, ct.started_at, ct.completed_at,
               COALESCE(m.name, ct.test_id) as module_name,
               COALESCE(m.icon, '💬') as module_icon,
               COALESCE(m.slug, ct.test_id) as module_slug
        FROM axis_auto_results r
        JOIN axis_auto_clients c ON c.id = r.client_id
        JOIN axis_auto_client_tests ct ON ct.id = r.client_test_id
        LEFT JOIN axis_auto_invites i ON i.id = ct.invite_id
        LEFT JOIN axis_auto_modules m ON m.id = i.module_id
        ORDER BY r.created_at DESC
      `);
      json(200, {ok:true, results:r.rows});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── GET /api/ac/client-answers/:testId ───────────────────────
  if (req.method !== 'POST' && url.startsWith('/api/ac/client-answers/')) {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const testId = url.split('/api/ac/client-answers/')[1];
    try {
      const r = await pool.query(`
        SELECT a.phase_number, a.category, a.position, a.score, a.created_at,
               c.name as client_name, c.email as client_email,
               COALESCE(m.name, ct.test_id) as module_name
        FROM axis_auto_answers a
        JOIN axis_auto_client_tests ct ON ct.id = a.client_test_id
        JOIN axis_auto_clients c ON c.id = ct.client_id
        LEFT JOIN axis_auto_invites i ON i.id = ct.invite_id
        LEFT JOIN axis_auto_modules m ON m.id = i.module_id
        WHERE a.client_test_id = $1
        ORDER BY a.phase_number, a.position
      `, [testId]);
      json(200, {ok:true, answers:r.rows, count:r.rows.length});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── POST /api/ac/admin-ai-analysis ───────────────────────────
  if (req.method === 'POST' && url === '/api/ac/admin-ai-analysis') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const {resultId} = await readBody(req);
    try {
      const r = await pool.query(`
        SELECT r.*, c.name as client_name, c.email as client_email,
               ct.test_id, COALESCE(m.slug, ct.test_id) as module_slug,
               COALESCE(m.name, ct.test_id) as module_name
        FROM axis_auto_results r
        JOIN axis_auto_clients c ON c.id = r.client_id
        JOIN axis_auto_client_tests ct ON ct.id = r.client_test_id
        LEFT JOIN axis_auto_invites i ON i.id = ct.invite_id
        LEFT JOIN axis_auto_modules m ON m.id = i.module_id
        WHERE r.id = $1
      `, [resultId]);
      if (!r.rows.length) return json(404,{ok:false,error:'Resultado não encontrado.'});
      const row = r.rows[0];
      const ranking = JSON.parse(row.ranking_json||'[]');
      const scores = JSON.parse(row.scores_json||'{}');
      const MAX = 50;
      const isCI   = (row.module_slug === 'crianca-interior' || row.test_id === 'crianca-interior');
      const isDisc = (row.module_slug === 'disc' || row.test_id === 'disc' || ['D','I','S','C'].includes(ranking[0]));
      let analysis;
      if (isCI) {
        analysis = ciGenerateAnalysis(scores, row.client_name);
      } else if (isDisc) {
        analysis = discGenerateAnalysis(scores, row.client_name);
      } else {
        const CN = {afirmacao:'Palavras de Afirmação',tempo:'Tempo de Qualidade',servico:'Atos de Serviço',presentes:'Presentes',toque:'Toque Afetivo'};
        const top = ranking.map((k,i)=>`${i+1}° ${CN[k]||k}: ${scores[k]||0} pts (${Math.round((scores[k]||0)/50*100)}%)`).join('\n');
        analysis = `ANÁLISE — LINGUAGENS DE VALORIZAÇÃO E RECONHECIMENTO\nCliente: ${row.client_name}\n\nLINGUAGEM PRINCIPAL: ${CN[ranking[0]]||ranking[0]} (${Math.round((scores[ranking[0]]||0)/50*100)}%)\nSEGUNDA LINGUAGEM: ${CN[ranking[1]]||ranking[1]} (${Math.round((scores[ranking[1]]||0)/50*100)}%)\n\nRANKING COMPLETO:\n${top}\n\nINTERPRETAÇÃO:\nO perfil de ${row.client_name.split(' ')[0]} indica que se sente mais valorizado(a) e reconhecido(a) principalmente através de ${CN[ranking[0]]||ranking[0]}, seguida de ${CN[ranking[1]]||ranking[1]}. Esse padrão foi identificado de forma consistente em 10 situações diferentes (família, amizades, trabalho e relacionamento), o que aumenta a confiabilidade do diagnóstico.\n\nSUGESTÕES:\n• Priorize ações que envolvam ${CN[ranking[0]]||ranking[0]} no contexto terapêutico\n• Explore como a ausência desta linguagem impacta o bem-estar emocional\n• Trabalhe a consciência do próprio padrão de reconhecimento\n\nEste relatório foi gerado automaticamente. Aprofunde com acompanhamento individualizado.`;
      }
      await pool.query('UPDATE axis_auto_results SET ai_analysis=$1 WHERE id=$2',[analysis,resultId]);
      // Salvar também em axis_auto_reports para acesso permanente
      const rpId = acId('rpt');
      await pool.query(
        `INSERT INTO axis_auto_reports (id,client_id,module_id,result_id,client_test_id,client_name,module_name,scores_json,ranking_json,ai_analysis)
         SELECT $1, r.client_id, i.module_id, r.id, r.client_test_id, c.name,
                COALESCE(m.name, ct.test_id), r.scores_json, r.ranking_json, $2
         FROM axis_auto_results r
         JOIN axis_auto_clients c ON c.id=r.client_id
         JOIN axis_auto_client_tests ct ON ct.id=r.client_test_id
         LEFT JOIN axis_auto_invites i ON i.id=ct.invite_id
         LEFT JOIN axis_auto_modules m ON m.id=i.module_id
         WHERE r.id=$3
         ON CONFLICT DO NOTHING`,
        [rpId, analysis, resultId]
      );
      json(200, {ok:true, analysis});
    } catch(e) { json(500, {ok:false, error:e.message}); } return;
  }

  // ── POST /api/axia/admin/send-email-ac ───────────────────────
  if (req.method === 'POST' && url === '/api/axia/admin/send-email-ac') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'email', 50, 3600000))
      return json(429, { ok: false, error: 'Muitas requisições. Tente novamente em 1 hora.' });
    const {to, name, link, customHtml} = await readBody(req);
    if (!to || !name) return json(400, { ok: false, error: 'to e name são obrigatórios.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(400, { ok: false, error: 'E-mail de destino inválido.' });
    const config = loadEmailConfig();
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:32px 16px">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
  <tr><td style="background:#1F1F1F;padding:24px 32px">
    <p style="margin:0;font-size:20px;font-weight:900;color:#D8C7B8;font-family:Arial,sans-serif">AXIS <span style="color:#C9A84C">IA</span></p>
    <p style="margin:4px 0 0;font-size:10px;color:rgba(216,199,184,0.5);letter-spacing:2px;text-transform:uppercase">Autoconhecimento</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 12px;font-size:16px;color:#1F1F1F">Olá, <strong>${name}</strong></p>
    <p style="margin:0 0 24px;font-size:14px;color:#555555;line-height:1.7">Você foi convidado(a) a responder uma avaliação de autoconhecimento.<br>Acesse com o <strong>e-mail</strong> e <strong>senha</strong> que foram compartilhados com você.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
      <tr><td align="center"><a href="${link}" style="display:inline-block;background:#C9A84C;color:#1F1F1F;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:15px;font-weight:700">▶ Acessar Avaliação</a></td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;color:#999999;text-align:center">Se o botão não abrir, copie e cole no navegador:</p>
    <p style="margin:0;font-size:13px;color:#1976D2;text-align:center;word-break:break-all;font-family:monospace">${link}</p>
  </td></tr>
  <tr><td style="background:#F9F9F9;padding:14px 32px;border-top:1px solid #EEEEEE;text-align:center">
    <p style="margin:0;font-size:11px;color:#AAAAAA">Enviado via <strong>AXIS IA</strong> — Autoconhecimento</p>
  </td></tr>
</table></td></tr></table></body></html>`;
    try {
      const finalHtml = customHtml || html;
      const subject = customHtml ? 'Nova senha — Axis Autoconhecimento' : 'Sua avaliação de Autoconhecimento — AXIS IA';
      await sendEmail({ to, toName: name, subject, html: finalHtml, config });
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── POST /api/ac/save-result (Axis Autoconhecimento — isolado) ─
  if (req.method === 'POST' && url === '/api/ac/save-result') {
    const body = await readBody(req);
    const id = 'ac_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    try {
      await pool.query(
        'INSERT INTO ac_results (id, test_type, scores, ranking, percentages) VALUES ($1,$2,$3,$4,$5)',
        [id, body.testType || 'linguagens', JSON.stringify(body.scores || {}), JSON.stringify(body.ranking || []), JSON.stringify(body.percentages || {})]
      );
      json(200, { ok: true, id });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /api/ac/results (Axis Autoconhecimento — isolado) ────
  if (req.method !== 'POST' && url === '/api/ac/results') {
    try {
      const r = await pool.query('SELECT * FROM ac_results ORDER BY created_at DESC LIMIT 50');
      json(200, { ok: true, results: r.rows });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ══ IA INSIGHTS — CLAUDE API ════════════════════════════════════

  const IA_SYSTEM_PROMPT = `Você é um especialista sênior em Saúde Mental no Trabalho e Riscos Psicossociais com foco na NR-1/2025 (Norma Regulamentadora 1 do Ministério do Trabalho e Emprego do Brasil).

Seus conhecimentos incluem:
- NR-1/2025: Gerenciamento de Riscos Ocupacionais (GRO) e Programa de Gerenciamento de Riscos (PGR)
- COPSOQ III: Copenhagen Psychosocial Questionnaire — instrumento validado de avaliação de riscos psicossociais
- Modelo Demanda-Controle de Karasek-Theorell (1990): alta tensão, trabalho ativo, trabalho passivo, baixa tensão
- Fatores de risco psicossocial: assédio moral/sexual, sobrecarga, reconhecimento, clima organizacional, autonomia, pressão/metas, segurança, comunicação, equilíbrio vida-trabalho, liderança
- Legislação trabalhista brasileira relacionada: CLT, Lei 14.457/2022 (CIPA), Resolução CFP 013/2022
- Intervenções organizacionais baseadas em evidências para redução de riscos psicossociais

Responda sempre em português brasileiro. Seja preciso, profissional e orientado à prática. Quando identificar riscos críticos (especialmente assédio ou alta tensão), alerte explicitamente sobre obrigações legais.`;

  // ── POST /api/ia-insights/chat ───────────────────────────────────
  if (req.method === 'POST' && url === '/api/ia-insights/chat') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ia', 30, 3600000))
      return json(429, { ok: false, error: 'Limite de 30 mensagens por hora atingido.' });
    try {
      const { conversaId, mensagem, contexto } = await readBody(req);
      if (!mensagem || !mensagem.trim()) return json(400, { ok: false, error: 'mensagem é obrigatória.' });

      const id = conversaId || `conv_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
      let historico = _iaConversas.get(id)?.messages || [];

      // Adiciona contexto de pesquisa/empresa ao primeiro turno
      let msgUsuario = mensagem.trim();
      if (historico.length === 0 && contexto) {
        msgUsuario = `[Contexto da sessão]\n${contexto}\n\n[Pergunta]\n${msgUsuario}`;
      }
      historico.push({ role: 'user', content: msgUsuario });

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: IA_SYSTEM_PROMPT,
        messages: historico.slice(-20) // mantém últimas 20 mensagens para não estourar tokens
      });

      const resposta = response.content[0].text;
      historico.push({ role: 'assistant', content: resposta });
      _iaConversas.set(id, { messages: historico, updatedAt: Date.now() });

      json(200, { ok: true, resposta, conversaId: id });
    } catch(e) {
      console.error('IA chat error:', e.message);
      json(500, { ok: false, error: e.message.includes('API_KEY') ? 'CLAUDE_API_KEY não configurada.' : 'Erro ao consultar IA. Tente novamente.' });
    }
    return;
  }

  // ── POST /api/ia-insights/analyze-survey ─────────────────────────
  if (req.method === 'POST' && url === '/api/ia-insights/analyze-survey') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ia', 30, 3600000))
      return json(429, { ok: false, error: 'Limite de requisições IA atingido.' });
    try {
      const { pesquisaId, respostas, empresa, titulo, scores } = await readBody(req);
      if (!pesquisaId) return json(400, { ok: false, error: 'pesquisaId obrigatório.' });

      const nRespondentes = respostas ? respostas.length : 0;
      const scoresTexto = scores ? Object.entries(scores)
        .filter(([k]) => k !== 'geral')
        .map(([k,v]) => `  - ${k}: ${v}/100`)
        .join('\n') : 'Scores não disponíveis';

      const prompt = `Analise os dados desta pesquisa de Mapeamento de Riscos Psicossociais (MRP) realizada com base no COPSOQ III e NR-1/2025:

EMPRESA: ${empresa || 'Não informada'}
PESQUISA: ${titulo || 'Mapeamento NR-1'}
RESPONDENTES: ${nRespondentes}
SCORE GERAL: ${scores?.geral || 'N/A'}/100

SCORES POR DIMENSÃO:
${scoresTexto}

RESPOSTAS BRUTAS (primeiras 10):
${JSON.stringify((respostas || []).slice(0, 10), null, 2)}

Com base nesses dados, responda APENAS com um JSON válido (sem markdown, sem explicações fora do JSON) neste formato exato:
{
  "riscos_identificados": ["risco 1", "risco 2", ...],
  "severidade": "CRÍTICO|ALTO|MÉDIO|BAIXO",
  "perguntas_estrategicas": ["pergunta 1", "pergunta 2", "pergunta 3", "pergunta 4", "pergunta 5"],
  "recomendacoes": ["recomendação 1", "recomendação 2", ...],
  "oportunidades": ["oportunidade 1", "oportunidade 2", ...]
}`;

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: IA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      });

      let analise;
      try {
        const raw = response.content[0].text.trim();
        // Remove possível markdown code block
        const jsonStr = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        analise = JSON.parse(jsonStr);
      } catch(pe) {
        analise = { texto_livre: response.content[0].text };
      }

      json(200, { ok: true, pesquisaId, analise });
    } catch(e) {
      console.error('IA analyze error:', e.message);
      json(500, { ok: false, error: e.message.includes('API_KEY') ? 'CLAUDE_API_KEY não configurada.' : 'Erro ao analisar pesquisa.' });
    }
    return;
  }

  // ── POST /api/ia-insights/generate-report ────────────────────────
  if (req.method === 'POST' && url === '/api/ia-insights/generate-report') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ia', 30, 3600000))
      return json(429, { ok: false, error: 'Limite de requisições IA atingido.' });
    try {
      const { pesquisaId, analisePrevia, empresa, titulo, scores, nRespondentes } = await readBody(req);
      if (!pesquisaId) return json(400, { ok: false, error: 'pesquisaId obrigatório.' });

      const dataAtual = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const analiseTexto = analisePrevia ? JSON.stringify(analisePrevia, null, 2) : 'Análise prévia não disponível';

      const prompt = `Gere um relatório profissional completo de Mapeamento de Riscos Psicossociais (MRP) para entrega ao cliente, no formato Markdown.

DADOS DA PESQUISA:
- Empresa: ${empresa || 'Não informada'}
- Título: ${titulo || 'Mapeamento NR-1'}
- Data: ${dataAtual}
- Respondentes: ${nRespondentes || 'N/A'}
- Score Geral: ${scores?.geral || 'N/A'}/100

ANÁLISE PRÉVIA (IA):
${analiseTexto}

Gere o relatório com EXATAMENTE estas seções em Markdown:

# Relatório de Mapeamento de Riscos Psicossociais
## 1. Sumário Executivo
## 2. Achados Principais
## 3. Matriz de Risco
## 4. Recomendações Prioritárias
## 5. Próximos Passos
## 6. Base Legal (NR-1/2025)

O relatório deve ser profissional, detalhado e pronto para apresentação ao cliente. Use linguagem técnica mas acessível. Inclua referências à NR-1/2025 e COPSOQ III onde pertinente.`;

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: IA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      });

      json(200, { ok: true, pesquisaId, relatorio: response.content[0].text });
    } catch(e) {
      console.error('IA report error:', e.message);
      json(500, { ok: false, error: e.message.includes('API_KEY') ? 'CLAUDE_API_KEY não configurada.' : 'Erro ao gerar relatório.' });
    }
    return;
  }

  // ── GET /pesquisa/:token (link público para colaborador) ─────
  if (url.startsWith('/pesquisa/')) {
    const t = decodeURIComponent(url.slice('/pesquisa/'.length).split('?')[0]);
    fs.readFile(path.join(DIR, 'axia-responder.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      // Injeta o token no HTML para que não dependa de query string
      const injected = html.replace('</head>', `<script>window._SURVEY_TOKEN=${JSON.stringify(t)};</script>\n</head>`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);
    });
    return;
  }

  // ── Quiz público NR-1 para Escolas — sem autenticação ────────
  if (url === '/quiz-escolas') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'public', 'quiz-escolas.html')).pipe(res);
    return;
  }

  // ── Servir arquivos estáticos ─────────────────────────────────
  let filePath = path.join(DIR, url === '/' ? 'AXIS_NR1_MVP.html' : url);
  fs.readFile(filePath, (err, fileData) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mimeMap = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fileData);
  });
});

// ── Iniciar ────────────────────────────────────────────────────
initDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ AXIS Insight NR-1 — NUVEM ONLINE');
    console.log(`   🌐  URL: ${SERVER_URL || 'https://seu-app.railway.app'}`);
    console.log(`   🖥  Porta: ${PORT}`);
    console.log('   📧  Email: ' + (process.env.GMAIL_USER || '⚠️ GMAIL_USER não configurado'));
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  });
}).catch(e => {
  console.error('❌ Erro ao conectar ao banco:', e.message);
  process.exit(1);
});
