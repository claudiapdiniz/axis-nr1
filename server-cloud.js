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
const DISC_EXEC = require('./disc-executivo.js'); // motor DISC: calculo roda no servidor
const DISC_ILG  = require('./disc-importar-ilg.js'); // leitura de laudo externo (ILG)
const Anthropic = require('@anthropic-ai/sdk');

// ── Proteção global contra crashes por promessas não capturadas ───
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason);
});

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

// ── Assistente AXIS do hub (queromeuapp.com.br) ───────────────────
// Atendimento de pré-venda para quem chega de anúncio. Objetivo: responder
// a dúvida, captar o contato e marcar a conversa. NÃO informa preço.
const _hubConversas = new Map();
setInterval(() => {
  const cutoff = Date.now() - 7200000;
  for (const [id, c] of _hubConversas) { if (c.updatedAt < cutoff) _hubConversas.delete(id); }
}, 3600000);

const HUB_SYSTEM = `Você é a AXIS, assistente da Cláudia Diniz (Clau) no site queromeuapp.com.br.
Quem fala com você chegou por um anúncio e ainda não conhece nada. Seu trabalho é entender o que a pessoa precisa, mostrar o app certo e marcar uma conversa de 20 minutos com a Clau.

## Os aplicativos

1. AXIS IA (para EMPRESAS e RH). Plataforma de gestão de riscos psicossociais conforme a NR-1, obrigação legal fiscalizada desde maio de 2026. Faz o questionário com os funcionários, calcula os índices, gera o relatório oficial (MRP) e o plano de ação. Demonstração: https://axis-nr1-production.up.railway.app/vitrine

2. Axis Diagnóstico (para CONSULTORES, psicólogos e terapeutas). App leve para fazer o primeiro mapeamento NR-1 dentro da reunião com o cliente, na hora. Demonstração: https://claudiapdiniz.github.io/axisdiagnostico/vitrine/

3. Axis Fit (para PERSONAL TRAINERS). Monta treino, acompanha aluno, registra evolução. Alunos ilimitados. Demonstração: https://axis-fit.vercel.app/vitrine

4. Axis Transfer (para MOTORISTAS de transfer e executivo). O passageiro agenda a corrida pelo link ou QR code do motorista, que recebe tudo organizado no painel. Demonstração: https://axistransfer.com.br/?vitrine=1

5. Axis Loja (para LOJISTAS que vendem por WhatsApp e Instagram). Vitrine online com carrinho, controle de estoque por tamanho e pedidos organizados. Demonstração: https://axis-closet.vercel.app/vitrine

## Regras que não se quebram

NUNCA informe preço, valor, mensalidade, taxa de implantação, faixa de preço ou comparação de custo, nem mesmo aproximada, nem mesmo se a pessoa insistir várias vezes. O valor depende do tamanho da operação e de quantas pessoas vão usar, então quem passa isso é a Clau na conversa. Se perguntarem preço, diga isso em uma frase e ofereça o agendamento na mesma resposta.

Não invente recurso que não está descrito acima. Se não souber, diga que confirma na conversa.
Não prometa prazo de entrega, desconto, teste grátis nem integração específica.
Escreva em português do Brasil, no máximo 4 linhas por resposta, sem travessões (use vírgula, dois-pontos ou ponto).
Não use tags XML internas ou de sistema na resposta.
Uma pergunta por vez.

## Como conduzir

Comece descobrindo o ramo da pessoa, porque é isso que define qual app serve. Mande o link da demonstração assim que souber qual é o caso: ver o app funcionando é o que mais convence.
Depois de duas ou três trocas, ou assim que houver interesse claro, ofereça a conversa com a Clau e escreva a marca [[FORMULARIO]] no fim da mensagem, sozinha na última linha. A marca abre o formulário de contato e agendamento na tela, então nunca a escreva antes de ter oferecido a conversa, e nunca a explique.
Se a pessoa disser que só está olhando, responda a dúvida e siga sem insistir.`;

// ── Copiloto: cérebro da extensão que ajuda a atendente no WhatsApp ──
const COPILOTO_SYSTEM = `Você é o Copiloto AXIS, um assistente que ajuda a atendente de um pequeno negócio (clínica de estética, salão, consultório) a responder clientes no WhatsApp.

Sua tarefa: dada a mensagem que o cliente enviou e os dados do negócio, escrever a MENSAGEM DE RESPOSTA pronta para a atendente humana revisar e enviar. Você não fala diretamente com o cliente; você escreve o que a atendente vai enviar.

Regras da resposta:
- Se o cliente apenas cumprimentou ou está começando a conversa (por exemplo "oi", "bom dia", "boa noite", "tudo bem?") e ainda NÃO pediu nada, responda curto, caloroso e humano: cumprimente de volta e pergunte como pode ajudar. NÃO despeje horário, preço, serviços nem regras nesse momento. Espere a pessoa dizer o que precisa. Só dê informação quando ela realmente perguntar.
- Escreva em português do Brasil, no tom pedido, curta e natural, como uma pessoa escreve no WhatsApp.
- Responda de verdade o que o cliente perguntou. Seja clara, sem ambiguidade, principalmente sobre preço, sinal e pagamento. Se o cliente pode ficar em dúvida (por exemplo "o sinal abate do total?"), explique os dois cenários (se seguir com o procedimento e se desistir) usando a regra do negócio.
- Use apenas as informações fornecidas nos dados do negócio. Se um preço ou informação não foi fornecido, não invente: diga com naturalidade que vai confirmar e já retorna.
- OBEDEÇA as regras de atendimento do negócio acima de qualquer padrão. Se as regras dizem que um serviço é por ordem de chegada ou não agenda, NÃO ofereça agendar esse serviço: explique como funciona (por exemplo, atendimento por ordem de chegada) e, se útil, informe o melhor horário para vir. Só convide para marcar dia e horário quando o serviço realmente aceita agendamento.
- Não force convite em toda mensagem. Convide para o próximo passo apenas quando fizer sentido e for permitido pelas regras. Uma resposta clara que respeita as regras vale mais que um convite fora de hora.
- Varie as palavras e o jeito de dizer; não repita sempre a mesma frase pronta. Soe como uma pessoa real atendendo, não como um robô com resposta padrão.
- Nunca use travessões. Use vírgula, dois-pontos ou ponto.
- Não dê conselho médico nem prometa resultado clínico. Em dúvida clínica, acolha e direcione para avaliação com o profissional.
- Se estiver fora do horário, comece acolhendo e dizendo quando retorna, sem deixar o cliente no vácuo.

Responda SOMENTE com o texto da mensagem, sem aspas, sem explicação, sem "aqui está". Apenas a mensagem que a atendente vai enviar.`;

// Agenda de atendimento: segunda a sexta, 9h às 12h e 14h às 18h (Brasília),
// blocos de 30 minutos. O Brasil não tem horário de verão desde 2019, então o
// deslocamento fixo -03:00 é correto o ano inteiro.
const HUB_TZ_OFFSET = '-03:00';
function hubGerarSlots(ocupados, agenda) {
  const compromissos = agenda || [];
  const slots = [];
  const agora = Date.now();
  const minimo = agora + 2 * 3600000; // pelo menos 2h de antecedência
  for (let d = 0; d < 14 && slots.length < 12; d++) {
    const dia = new Date(agora + d * 86400000);
    // Data no fuso de Brasília
    const brt = new Date(dia.getTime() - 3 * 3600000);
    const ano = brt.getUTCFullYear(), mes = brt.getUTCMonth() + 1, num = brt.getUTCDate();
    const semana = brt.getUTCDay();
    if (semana === 0 || semana === 6) continue;
    // Só a manhã. A tarde da Clau é ocupada: almoço 13h-14h, preparação e
    // follow-up 14h-15h, e sessões terapêuticas das 15h às 18h, que são
    // clientes pagantes. A manhã ficou livre quando ela apagou os blocos
    // de prospecção em 17/08/2026.
    for (const hora of [9, 9.5, 10, 10.5, 11, 11.5, 12]) {
      const h = String(Math.floor(hora)).padStart(2, '0');
      const m = hora % 1 ? '30' : '00';
      const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(num).padStart(2, '0')}T${h}:${m}:00${HUB_TZ_OFFSET}`;
      const t = new Date(iso).getTime();
      if (t < minimo) continue;
      if (ocupados.includes(iso)) continue;
      // Choque com compromisso já marcado no Google Agenda dela
      if (compromissos.some(([ini, fim]) => t < fim && (t + 1800000) > ini)) continue;
      slots.push({ iso, label: hubRotuloSlot(iso) });
      if (slots.length >= 12) break;
    }
  }
  return slots;
}
function hubRotuloSlot(iso) {
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const brt = new Date(new Date(iso).getTime() - 3 * 3600000);
  return `${dias[brt.getUTCDay()]}, ${brt.getUTCDate()} de ${meses[brt.getUTCMonth()]}, ${String(brt.getUTCHours()).padStart(2, '0')}h${String(brt.getUTCMinutes()).padStart(2, '0')}`;
}

// Descarte automático dos contatos. Sem prazo, nome e telefone de gente
// que falou uma vez ficariam guardados para sempre, o que é justamente o
// tipo de coisa que a Clau cobra dos clientes dela na LGPD.
const HUB_RETENCAO_MESES = 12;
function hubDescartarAntigos(d) {
  if (!Array.isArray(d.hubLeads)) return 0;
  const limite = Date.now() - HUB_RETENCAO_MESES * 30 * 86400000;
  const antes = d.hubLeads.length;
  d.hubLeads = d.hubLeads.filter(l => {
    const t = Date.parse(l.criadoEm || '');
    return isNaN(t) ? true : t >= limite;
  });
  return antes - d.hubLeads.length;
}

// ── Leitura da agenda real da Clau (link secreto iCal do Google) ──
// Alternativa ao OAuth: ela cola um link somente-leitura e o servidor
// desconta da lista de horários tudo que já está ocupado. Sem projeto no
// Google Cloud, sem token para renovar, e ela revoga quando quiser.
// Limite conhecido: expande repetição diária e semanal, que é o que a
// agenda dela usa. Repetição mensal ou anual é ignorada.
let _hubAgendaCache = { em: 0, ocupados: [] };

function hubIcsDesdobra(texto) {
  return texto.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}
function hubIcsData(valor, params) {
  // 20260817T150000Z | 20260817T120000 (com TZID) | 20260817 (dia inteiro)
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(valor.trim());
  if (!m) return null;
  const [, a, me, d, h, mi, s, z] = m;
  if (!h) return { diaInteiro: true, t: Date.parse(`${a}-${me}-${d}T00:00:00-03:00`) };
  if (z) return { t: Date.parse(`${a}-${me}-${d}T${h}:${mi}:${s}Z`) };
  // Sem Z: hora local. A agenda dela é America/Sao_Paulo, que é -03:00 o ano todo.
  return { t: Date.parse(`${a}-${me}-${d}T${h}:${mi}:${s}-03:00`) };
}
function hubIcsParse(texto, ateMs) {
  const linhas = hubIcsDesdobra(texto);
  const ocupados = [];
  let ev = null;
  const agora = Date.now();
  for (const linha of linhas) {
    if (linha === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (linha === 'END:VEVENT') {
      if (ev && ev.inicio && ev.fim && !ev.cancelado && !ev.livre) {
        const dur = ev.fim - ev.inicio;
        if (!ev.rrule) {
          if (ev.fim > agora && ev.inicio < ateMs) ocupados.push([ev.inicio, ev.fim]);
        } else {
          const r = {};
          ev.rrule.split(';').forEach(p => { const [k, v] = p.split('='); r[k] = v; });
          const freq = r.FREQ;
          const fim = r.UNTIL ? (hubIcsData(r.UNTIL, {}) || {}).t : null;
          if (freq === 'DAILY' || freq === 'WEEKLY') {
            const dias = r.BYDAY ? r.BYDAY.split(',') : null;
            const nomes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
            for (let t = ev.inicio; t < ateMs; t += 86400000) {
              if (t + dur < agora) continue;
              if (fim && t > fim) break;
              const diaBrt = new Date(t - 3 * 3600000).getUTCDay();
              if (freq === 'WEEKLY' && dias && dias.indexOf(nomes[diaBrt]) === -1) continue;
              ocupados.push([t, t + dur]);
            }
          }
        }
      }
      ev = null; continue;
    }
    if (!ev) continue;
    const i = linha.indexOf(':');
    if (i < 0) continue;
    const chave = linha.slice(0, i);
    const valor = linha.slice(i + 1);
    const nome = chave.split(';')[0].toUpperCase();
    if (nome === 'DTSTART') { const d = hubIcsData(valor, chave); if (d) ev.inicio = d.t; }
    else if (nome === 'DTEND') { const d = hubIcsData(valor, chave); if (d) ev.fim = d.t; }
    else if (nome === 'RRULE') ev.rrule = valor;
    else if (nome === 'STATUS' && /CANCELLED/i.test(valor)) ev.cancelado = true;
    else if (nome === 'TRANSP' && /TRANSPARENT/i.test(valor)) ev.livre = true;
  }
  return ocupados;
}
async function hubAgendaOcupados(url, ateMs) {
  if (!url) return [];
  if (Date.now() - _hubAgendaCache.em < 600000) return _hubAgendaCache.ocupados;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const ocupados = hubIcsParse(await resp.text(), ateMs);
    _hubAgendaCache = { em: Date.now(), ocupados };
    return ocupados;
  } catch (e) {
    console.error('hub agenda ics:', e.message);
    // Falha de leitura não pode travar o agendamento: segue com o que tinha
    return _hubAgendaCache.ocupados;
  }
}

// Convite de calendário. Em vez de conectar a conta Google (que exigiria
// projeto no Google Cloud, OAuth e renovação de token), o e-mail leva um
// arquivo .ics: o Gmail entende e oferece pôr na agenda em um clique.
function hubUTC(iso, minutos) {
  const t = new Date(new Date(iso).getTime() + (minutos || 0) * 60000);
  const p = n => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00Z`;
}
function hubEscIcs(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function hubIcs({ iso, nome, whatsapp, interesse, organizador, destino, uid }) {
  const desc = `Conversa marcada pela assistente do site queromeuapp.com.br.\nWhatsApp: +${whatsapp}` +
    (interesse ? `\nInteresse: ${interesse}` : '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Axis//Assistente//PT', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@axisconsultorias.com.br`,
    `DTSTAMP:${hubUTC(new Date().toISOString())}`,
    `DTSTART:${hubUTC(iso)}`,
    `DTEND:${hubUTC(iso, 30)}`,
    `SUMMARY:${hubEscIcs('Conversa Axis com ' + nome)}`,
    `DESCRIPTION:${hubEscIcs(desc)}`,
    `ORGANIZER;CN=Axis:mailto:${organizador}`,
    `ATTENDEE;CN=Clau;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${destino}`,
    'STATUS:CONFIRMED', 'SEQUENCE:0', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}
function hubLinkGoogle(iso, nome, whatsapp) {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Conversa Axis com ${nome}`,
    dates: `${hubUTC(iso)}/${hubUTC(iso, 30)}`,
    details: `WhatsApp: +${whatsapp}`
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

// ── Senha do painel de contatos do hub ───────────────────────────
// A tela mora no site estático (queromeuapp.com.br/admin), então a senha
// tem que ser conferida aqui: no navegador, qualquer um leria o código.
// Guardada como hash com sal, nunca em texto puro.
const HUB_BOOT = Date.now();
const HUB_JANELA_CADASTRO = 3600000; // 1h após subir, só enquanto não existir senha
const _hubSessoes = new Map();       // token -> validade
setInterval(() => {
  const agora = Date.now();
  for (const [t, ate] of _hubSessoes) { if (ate < agora) _hubSessoes.delete(t); }
}, 1800000);

function hubHash(senha, sal) {
  return crypto.createHash('sha256').update(sal + '|' + senha).digest('hex');
}
function hubSessaoNova() {
  const t = 'hub_' + crypto.randomBytes(24).toString('hex');
  _hubSessoes.set(t, Date.now() + 12 * 3600000); // 12h
  return t;
}
function hubAutorizado(req) {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!t) return false;
  if (process.env.ADMIN_API_TOKEN && t === process.env.ADMIN_API_TOKEN) return true;
  const ate = _hubSessoes.get(t);
  if (!ate) return false;
  if (ate < Date.now()) { _hubSessoes.delete(t); return false; }
  return true;
}

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
function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `AXIS-${ano}-${hex}`;
}

function acHash(pwd) { return crypto.createHash('sha256').update(pwd+'::axis_auto_2025').digest('hex'); }
// Nome de empresa comparavel: uns modulos guardam company_id, outros o
// nome digitado a mao. Sem acento, sem caixa e sem pontuacao, "Fique Bem
// Seguros" e "FIQUE BEM SEGUROS." viram a mesma empresa.
function chaveEmpresa(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function acId(p)     { return `${p}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function acToken()   { return crypto.randomBytes(24).toString('hex'); }
function acTempPwd() {
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'Axis@'+Array.from({length:4},()=>c[Math.floor(Math.random()*c.length)]).join('');
}

// ── Acesso Cliente (entrega presencial de Relatório MRP) ──────────
function caId()    { return `ca_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function caToken() { return crypto.randomBytes(24).toString('hex'); }
function caTempPwd() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1 (legível ao vivo)
  return 'AXIS-' + Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

const PORT = process.env.PORT || 5500;
const DIR  = __dirname;

// URL pública permanente vinda do Railway
// Fallback para a URL de produção conhecida caso a variável não esteja configurada,
// evitando links relativos quebrados em emails (denúncia, convites, etc.)
const SERVER_URL = (process.env.SERVER_URL || process.env.BASE_URL || 'https://axis-nr1-production.up.railway.app').replace(/\/$/, '');

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

// ══════════════════════════════════════════════════════════════════
// DIAGNÓSTICO NR-1 — mapeamento rápido de riscos psicossociais
// ══════════════════════════════════════════════════════════════════
// Instrumento de 28 itens em 6 fatores, respondido pelo gestor/RH do
// cliente por um link enviado pela consultoria. As perguntas moram AQUI
// (e não na página do respondente) para que o cálculo tenha uma fonte
// única e não possa ser alterado pelo navegador de quem responde.
//
// 🔒 O resultado NUNCA volta para quem responde: o POST de resposta
// devolve apenas { ok:true }. Quem vê o diagnóstico é o portal.
const DIAG_FATORES = [
  {
    id: 'demanda',
    nome: 'Demanda e Organização do Trabalho',
    perguntas: [
      'Com que frequência os colaboradores relatam excesso de tarefas?',
      'Com que frequência as jornadas ultrapassam regularmente o horário contratado?',
      'Com que frequência há pressão por metas ou prazos percebidos como irreais?',
      'Com que frequência o ritmo de trabalho é considerado excessivamente intenso?',
      'Com que frequência os colaboradores assumem funções além de suas atribuições?',
      'Com que frequência há imprevisibilidade e mudanças constantes nas demandas?'
    ]
  },
  {
    id: 'controle',
    nome: 'Controle e Autonomia',
    perguntas: [
      'Com que frequência os colaboradores se sentem sem autonomia para tomar decisões?',
      'Com que frequência há falta de clareza sobre papéis e responsabilidades?',
      'Com que frequência os colaboradores são excluídos de decisões que afetam seu trabalho?',
      'Com que frequência processos rígidos impedem a iniciativa da equipe?',
      'Com que frequência os colaboradores não conseguem organizar sua própria rotina?'
    ]
  },
  {
    id: 'relacoes',
    nome: 'Relações e Suporte Social',
    perguntas: [
      'Com que frequência há conflitos entre colaboradores ou entre equipes?',
      'Com que frequência os gestores são percebidos como distantes ou indisponíveis?',
      'Com que frequência a comunicação entre liderança e equipe é percebida como falha?',
      'Com que frequência há relatos de tratamento desrespeitoso, assédio ou discriminação?',
      'Com que frequência os colaboradores se sentem sem suporte em momentos de dificuldade?'
    ]
  },
  {
    id: 'reconhecimento',
    nome: 'Reconhecimento e Recompensa',
    perguntas: [
      'Com que frequência os colaboradores se sentem não reconhecidos pelo trabalho realizado?',
      'Com que frequência há percepção de injustiça nas promoções ou nos benefícios?',
      'Com que frequência a remuneração é percebida como desproporcional ao esforço?',
      'Com que frequência o feedback é ausente, superficial ou exclusivamente negativo?'
    ]
  },
  {
    id: 'comunicacao',
    nome: 'Comunicação Organizacional',
    perguntas: [
      'Com que frequência as informações sobre mudanças chegam de forma confusa ou tardia?',
      'Com que frequência os colaboradores se sentem sem canal para expressar opiniões?',
      'Com que frequência há contradição entre os valores declarados e as práticas reais?',
      'Com que frequência há conflitos por desalinhamento entre áreas ou setores?'
    ]
  },
  {
    id: 'saude',
    nome: 'Saúde e Bem-Estar Psicológico',
    perguntas: [
      'Com que frequência há relatos de estresse, ansiedade ou esgotamento (burnout)?',
      'Com que frequência os colaboradores relatam dificuldade em se desligar do trabalho?',
      'Com que frequência há absenteísmo ou presenteísmo relacionado à saúde mental?',
      'Com que frequência existe estigma ou resistência à busca de apoio psicológico?'
    ]
  }
];

const AXIS_EMPRESA_EMAIL = 'axisconsultoriass@gmail.com';
// Recomendação por fator e faixa de risco. Mesma base do Axis Diagnóstico:
// é o texto que vira a coluna Recomendação do plano de ação.
const DIAG_RECS = {
  demanda: {
    alta:  'Revisão urgente da distribuição de carga de trabalho. Implementar gestão de demandas com critérios claros de priorização e estabelecer limites saudáveis de jornada conforme a NR-1.',
    media: 'Monitorar a percepção de sobrecarga da equipe. Criar canais de escuta ativa para identificar gargalos operacionais antes que se tornem fatores críticos de risco.',
    baixa: 'Equilíbrio entre demanda e capacidade está adequado. Realizar pesquisas de clima periódicas para preservar esse nível de bem-estar organizacional.'
  },
  controle: {
    alta:  'Mapear os processos que suprimem a autonomia. Redefinir responsabilidades com clareza e criar espaços formais de participação nas decisões que afetam a equipe.',
    media: 'Revisar descrições de cargo e comunicar expectativas de cada função. Promover reuniões de alinhamento regulares e fortalecer a delegação consciente.',
    baixa: 'Nível de autonomia e clareza de papéis está adequado. Reforçar as práticas de gestão participativa já existentes na organização.'
  },
  relacoes: {
    alta:  'Intervenção no clima organizacional. Investigar casos de assédio, implementar política de convivência e oferecer capacitação em liderança humanizada e gestão de conflitos.',
    media: 'Fortalecer a comunicação entre gestores e equipes. Promover ações de integração e treinar lideranças em escuta ativa e inteligência emocional.',
    baixa: 'Relações de trabalho estão saudáveis. Manter ações de integração e práticas de reconhecimento para preservar o clima positivo.'
  },
  reconhecimento: {
    alta:  'Reestruturar as políticas de reconhecimento e feedback. Criar critérios transparentes para promoções e alinhar remuneração ao mercado e ao esforço real.',
    media: 'Implementar cultura de feedback regular e reconhecimento público de conquistas. Revisar a equidade interna nas remunerações e benefícios.',
    baixa: 'Políticas de reconhecimento funcionam adequadamente. Manter os canais de feedback e os programas de valorização existentes.'
  },
  comunicacao: {
    alta:  'Mapear os fluxos de comunicação e criar protocolos formais de transparência. Abrir canais seguros de feedback ascendente e realizar encontros regulares de alinhamento.',
    media: 'Melhorar a consistência da comunicação interna. Garantir que decisões estratégicas sejam comunicadas de forma clara e oportuna para todas as equipes.',
    baixa: 'Comunicação organizacional está eficiente. Manter a regularidade e a transparência das informações já praticadas.'
  },
  saude: {
    alta:  'Implementar Programa de Saúde Mental (PSM) com acesso a apoio psicológico, treinamento em reconhecimento de burnout e política formal de desconexão digital.',
    media: 'Criar iniciativas de promoção de saúde mental: palestras, pausas ativas, grupos de escuta. Garantir acesso ao suporte psicológico sem estigma.',
    baixa: 'Saúde psicológica da equipe está preservada. Manter os programas de bem-estar e a cultura de cuidado já estabelecida.'
  }
};

// Prioridade pelo nível de risco do fator, e prazo sugerido a partir dela.
// Os 30/60/90 dias foram combinados com a consultora: é sugestão, ela ajusta
// cada linha antes de entregar.
const DIAG_PRAZO_DIAS = { alta: 30, media: 60, baixa: 90 };
function diagPrioridade(nivel) {
  if (nivel === 'Crítico' || nivel === 'Alto') return 'alta';
  if (nivel === 'Médio') return 'media';
  return 'baixa';
}
function diagPrazo(prioridade) {
  const d = new Date();
  d.setDate(d.getDate() + (DIAG_PRAZO_DIAS[prioridade] || 90));
  return d.toISOString().slice(0, 10); // formato do input date do portal
}
const DIAG_OPCOES = ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre'];
const DIAG_VERSAO = 'NR1_MAPA_v1.0';

function diagId()    { return `dg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function diagToken() { return crypto.randomBytes(16).toString('hex'); }

function diagNivel(pct) {
  if (pct >= 76) return 'Crítico';
  if (pct >= 51) return 'Alto';
  if (pct >= 26) return 'Médio';
  return 'Baixo';
}

// Recebe { "0_0": 3, "0_1": 1, ... } com TODOS os itens respondidos.
// Devolve { fatores, pct, nivel } ou lança erro se algo faltar / estiver
// fora da escala. Mesma fórmula do Axis Diagnóstico: percentual por fator
// e média simples dos 6 fatores no índice geral.
function diagCalcular(respostas) {
  if (!respostas || typeof respostas !== 'object') throw new Error('Respostas ausentes.');
  const fatores = DIAG_FATORES.map((f, fi) => {
    let tot = 0;
    const max = f.perguntas.length * 4;
    f.perguntas.forEach((_, pi) => {
      const v = respostas[`${fi}_${pi}`];
      if (!Number.isInteger(v) || v < 0 || v > 4) throw new Error(`Resposta inválida no item ${fi + 1}.${pi + 1}.`);
      tot += v;
    });
    const pct = Math.round((tot / max) * 100);
    return { id: f.id, nome: f.nome, tot, max, pct, nivel: diagNivel(pct) };
  });
  const pct = Math.round(fatores.reduce((s, f) => s + f.pct, 0) / fatores.length);
  return { fatores, pct, nivel: diagNivel(pct) };
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
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_leads (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    whatsapp TEXT,
    score INT NOT NULL,
    resultado TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`ALTER TABLE axis_auto_results ADD COLUMN IF NOT EXISTS ai_analysis_r2 TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_leads_laboratorios (
    id TEXT PRIMARY KEY,
    nome TEXT,
    email TEXT,
    whatsapp TEXT,
    cargo TEXT,
    perfil_resultado TEXT,
    pontuacao INTEGER,
    respostas JSONB,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_leads_seguradoras (
    id TEXT PRIMARY KEY,
    nome TEXT,
    email TEXT,
    whatsapp TEXT,
    cargo TEXT,
    resultado TEXT,
    pontuacao INTEGER,
    criado_em TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_reunioes (
    id TEXT PRIMARY KEY,
    dados JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await acSeedModules();
  await acSeedCIQuestions();
  // ── Axis Safe Report — Canal de Denúncia ──────────────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_company_codes (
    company_id     TEXT PRIMARY KEY,
    codigo_publico VARCHAR(12) NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_denuncias (
    id          SERIAL PRIMARY KEY,
    protocolo   VARCHAR(20) NOT NULL UNIQUE,
    company_id  TEXT NOT NULL,
    categoria   VARCHAR(80) NOT NULL,
    texto       TEXT NOT NULL,
    status      VARCHAR(30) NOT NULL DEFAULT 'pendente',
    observacao  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_den_company   ON axis_denuncias(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_den_protocolo ON axis_denuncias(protocolo)`);

  // ── Rastreamento de Casos (IRC) ───────────────────────────────
  // Cada caso é guardado como objeto JSON completo em `dados` (schema flexível),
  // com id no formato CASO-YYYY-NNN e company_id indexado para consulta por empresa.
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_casos (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL,
    dados       JSONB NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casos_company ON axis_casos(company_id)`);

  // ── Escuta Ativa — canal de acolhimento emocional ─────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS conversas_escuta_ativa (
    id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo_anonimo            TEXT NOT NULL,
    empresa_id                TEXT,
    empresa_nome              TEXT,
    setor                     TEXT,
    historico_mensagens       JSONB NOT NULL DEFAULT '[]',
    nivel_risco               INTEGER CHECK (nivel_risco BETWEEN 1 AND 5),
    classificacao_risco       TEXT,
    temas_identificados       TEXT[],
    flag_assedio              BOOLEAN DEFAULT FALSE,
    resumo_conversa           TEXT,
    plano_autocuidado         JSONB,
    encaminhamento            TEXT,
    nota_clinica              TEXT,
    status                    TEXT DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','encerrada','encaminhada')),
    iniciada_em               TIMESTAMPTZ DEFAULT NOW(),
    encerrada_em              TIMESTAMPTZ,
    versao_protocolo          TEXT DEFAULT 'Escuta_Ativa_v1.0',
    notificacao_admin_enviada BOOLEAN DEFAULT FALSE,
    created_at                TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ea_empresa    ON conversas_escuta_ativa(empresa_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ea_nivel      ON conversas_escuta_ativa(nivel_risco)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ea_status     ON conversas_escuta_ativa(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ea_assedio    ON conversas_escuta_ativa(flag_assedio)`);
  // Modelo híbrido — identificação opcional do colaborador
  await pool.query(`ALTER TABLE conversas_escuta_ativa ADD COLUMN IF NOT EXISTS identificado BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE conversas_escuta_ativa ADD COLUMN IF NOT EXISTS nome_colaborador TEXT`);
  await pool.query(`ALTER TABLE conversas_escuta_ativa ADD COLUMN IF NOT EXISTS telefone_colaborador TEXT`);

  // ── Lideranças 360° — IPL (Índice de Performance de Liderança) ──
  // Avaliação multi-avaliador (superior/par/subordinado/auto). Adaptado da
  // PARTE 8 do documento mestre: PostgreSQL puro (sem RLS/Supabase), empresa_id TEXT.
  await pool.query(`CREATE TABLE IF NOT EXISTS avaliacoes_ipl (
    id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id                TEXT,
    empresa_nome              TEXT,
    gestor_nome               TEXT NOT NULL,
    gestor_email              TEXT,
    gestor_cargo              TEXT,
    gestor_setor              TEXT,
    codigo_avaliacao          TEXT NOT NULL UNIQUE,
    periodo_inicio            DATE,
    periodo_fim               DATE,
    convidados_subordinados   INTEGER DEFAULT 0,
    convidados_pares          INTEGER DEFAULT 0,
    convidados_superiores     INTEGER DEFAULT 0,
    total_avaliadores         INTEGER DEFAULT 0,
    qtd_subordinados          INTEGER DEFAULT 0,
    qtd_pares                 INTEGER DEFAULT 0,
    qtd_superiores            INTEGER DEFAULT 0,
    qtd_auto                  INTEGER DEFAULT 0,
    ipl_score                 INTEGER,
    ipl_subordinados          INTEGER,
    ipl_pares                 INTEGER,
    ipl_superiores            INTEGER,
    ipl_auto                  INTEGER,
    gap_auto_subordinados     INTEGER,
    classificacao_ipl         TEXT,
    pontuacoes_dimensoes      JSONB,
    relatorio_gestor          TEXT,
    relatorio_admin           TEXT,
    status                    TEXT DEFAULT 'coletando' CHECK (status IN ('coletando','minimo_atingido','relatorio_gerado','entregue')),
    flag_risco_critico        BOOLEAN DEFAULT FALSE,
    notificacao_admin_enviada BOOLEAN DEFAULT FALSE,
    versao_protocolo          TEXT DEFAULT 'IPL_v1.0',
    criado_em                 TIMESTAMPTZ DEFAULT NOW(),
    relatorio_gerado_em       TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS respostas_ipl (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    avaliacao_id         UUID REFERENCES avaliacoes_ipl(id) ON DELETE CASCADE,
    tipo_avaliador       TEXT CHECK (tipo_avaliador IN ('subordinado','par','superior','auto')),
    respostas            JSONB NOT NULL,
    pontuacoes_dimensoes JSONB,
    respondido_em        TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ipl_empresa  ON avaliacoes_ipl(empresa_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ipl_codigo   ON avaliacoes_ipl(codigo_avaliacao)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ipl_status   ON avaliacoes_ipl(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ipl_resp_av  ON respostas_ipl(avaliacao_id)`);
  // Geração assíncrona do relatório (evita timeout do gateway em chamadas longas de IA)
  await pool.query(`ALTER TABLE avaliacoes_ipl ADD COLUMN IF NOT EXISTS gerando BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE avaliacoes_ipl ADD COLUMN IF NOT EXISTS relatorio_erro TEXT`);

  // ── Acesso Cliente — entrega de Relatório MRP (vitrine da plataforma) ──
  await pool.query(`CREATE TABLE IF NOT EXISTS client_access (
    id               TEXT PRIMARY KEY,
    empresa_nome     TEXT NOT NULL,
    responsavel_nome TEXT NOT NULL,
    email            TEXT NOT NULL UNIQUE,
    senha_hash       TEXT NOT NULL,
    pdf_base64       TEXT NOT NULL,
    pdf_filename     TEXT,
    data_relatorio   TEXT,
    criado_em        TIMESTAMPTZ DEFAULT NOW(),
    expira_em        TIMESTAMPTZ,
    ultimo_acesso    TIMESTAMPTZ,
    acessos_count    INTEGER DEFAULT 0,
    ativo            INTEGER DEFAULT 1,
    token            TEXT,
    token_expira_em  TIMESTAMPTZ
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_client_access_token ON client_access(token)`);

  // ── Relatórios anexados ao Portal da Empresa ──────────────────
  // PDFs produzidos fora da plataforma (ex.: Diagnóstico de Ansiedade) que a
  // Axis anexa ao portal do cliente. Base64 no Postgres porque o filesystem
  // do Railway é efêmero. Ao contrário de client_access (1 PDF por e-mail),
  // aqui cada empresa pode ter vários relatórios sem um sobrescrever o outro.
  await pool.query(`CREATE TABLE IF NOT EXISTS axia_relatorios (
    id             TEXT PRIMARY KEY,
    company_id     TEXT NOT NULL,
    tipo           TEXT NOT NULL DEFAULT 'ansiedade',
    titulo         TEXT NOT NULL,
    pdf_base64     TEXT NOT NULL,
    pdf_filename   TEXT,
    data_relatorio TEXT,
    criado_em      TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_axia_relatorios_co ON axia_relatorios(company_id, tipo)`);

  // ── Screening de Burnout — Escala Maslach MBI-GS ──────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_burnout_respostas (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id              TEXT NOT NULL,
    setor                   TEXT,
    respostas_json          JSONB NOT NULL,
    score_exaustao          NUMERIC(5,2) NOT NULL,
    score_despersonalizacao NUMERIC(5,2) NOT NULL,
    score_realizacao        NUMERIC(5,2) NOT NULL,
    ibr_score               NUMERIC(5,2) NOT NULL,
    classificacao           TEXT NOT NULL,
    versao_protocolo        TEXT DEFAULT 'MBI-GS_v1.0',
    created_at              TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_burnout_company ON axis_burnout_respostas(company_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_burnout_setor   ON axis_burnout_respostas(setor)`);
  // ── Diagnóstico NR-1 — convite enviado ao cliente e resposta recebida ──
  // Um convite = um link = um respondente. O resultado fica só aqui e no
  // portal; a página do respondente nunca o recebe.
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_diag_convites (
    id            TEXT PRIMARY KEY,
    company_id    TEXT NOT NULL,
    token         TEXT UNIQUE NOT NULL,
    empresa_alvo  TEXT NOT NULL,
    respondente   TEXT,
    cargo         TEXT,
    email         TEXT,
    origem        TEXT NOT NULL DEFAULT 'portal',
    status        TEXT NOT NULL DEFAULT 'pendente',
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    respondido_em TIMESTAMPTZ
  )`);
  await pool.query(`ALTER TABLE axis_diag_convites ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE axis_diag_convites ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'portal'`);
  await pool.query(`ALTER TABLE axis_diag_convites ADD COLUMN IF NOT EXISTS liberado BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_diag_conv_co ON axis_diag_convites(company_id)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_diag_respostas (
    id               TEXT PRIMARY KEY,
    convite_id       TEXT NOT NULL,
    company_id       TEXT NOT NULL,
    respostas_json   JSONB NOT NULL,
    fatores_json     JSONB NOT NULL,
    pct              INT NOT NULL,
    nivel            TEXT NOT NULL,
    versao_protocolo TEXT DEFAULT 'NR1_MAPA_v1.0',
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_diag_resp_conv ON axis_diag_respostas(convite_id)`);

  // ── Indicadores de Saúde Organizacional (ISO) ─────────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_indicadores_saude (
    id             SERIAL PRIMARY KEY,
    company_id     TEXT NOT NULL,
    mes            VARCHAR(7) NOT NULL,
    absenteismo    NUMERIC(6,2),
    horas_extras   NUMERIC(6,2),
    turnover       NUMERIC(6,2),
    afastamentos   INT,
    presenteismo   NUMERIC(6,2),
    observacao     TEXT,
    updated_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, mes)
  )`);
  await pool.query(`ALTER TABLE axis_indicadores_saude ADD COLUMN IF NOT EXISTS presenteismo NUMERIC(6,2)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_iso_company ON axis_indicadores_saude(company_id)`);

  // ── DISC (Executivo e Pessoal) ───────────────────────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_disc_convites (
    id           TEXT PRIMARY KEY,
    token        TEXT UNIQUE NOT NULL,
    modulo       TEXT NOT NULL DEFAULT 'executivo',
    nome         TEXT NOT NULL,
    email        TEXT NOT NULL,
    empresa      TEXT,
    cargo        TEXT,
    status       TEXT NOT NULL DEFAULT 'pendente',
    liberado     BOOLEAN DEFAULT false,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_disc_conv_token ON axis_disc_convites(token)`);
  await pool.query(`ALTER TABLE axis_disc_convites ADD COLUMN IF NOT EXISTS rascunho JSONB`);
  await pool.query(`ALTER TABLE axis_disc_convites ADD COLUMN IF NOT EXISTS rascunho_em TIMESTAMPTZ`);
  // origem: 'axis' quando a pessoa respondeu aqui, 'importado' quando o
  // resultado veio de um laudo de outra plataforma (ILG). O importado conta
  // no relatorio de equipe e nao tem link de resposta.
  await pool.query(`ALTER TABLE axis_disc_convites ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'axis'`);
  await pool.query(`ALTER TABLE axis_disc_convites ADD COLUMN IF NOT EXISTS origem_ref TEXT`);
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_disc_respostas (
    id             SERIAL PRIMARY KEY,
    convite_id     TEXT NOT NULL,
    respostas      JSONB NOT NULL,
    resultado      JSONB NOT NULL,
    tempo_segundos INT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_disc_resp_conv ON axis_disc_respostas(convite_id)`);
  // ── Portal da empresa: o que a consultora liberou para o cliente ver ──
  // A chave e o nome normalizado da empresa, porque e por nome que o
  // client_access identifica quem esta logado no portal.
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_portal_itens (
    id            TEXT PRIMARY KEY,
    empresa_chave TEXT NOT NULL,
    empresa_nome  TEXT NOT NULL,
    company_id    TEXT,
    tipo          TEXT NOT NULL,
    ref_id        TEXT NOT NULL DEFAULT '',
    titulo        TEXT NOT NULL,
    detalhe       TEXT,
    html          TEXT,
    publicado_em  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(empresa_chave, tipo, ref_id)
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_itens_emp ON axis_portal_itens(empresa_chave)`);
  // ── Propostas comerciais (um link por cliente) ────────────────
  await pool.query(`CREATE TABLE IF NOT EXISTS axis_propostas (
    id                TEXT PRIMARY KEY,
    token             TEXT UNIQUE NOT NULL,
    company_id        TEXT,
    cliente           TEXT NOT NULL,
    contato           TEXT,
    email             TEXT,
    titulo            TEXT NOT NULL,
    resumo            TEXT,
    contexto          TEXT,
    escopo            JSONB NOT NULL DEFAULT '[]',
    etapas            JSONB NOT NULL DEFAULT '[]',
    valor             NUMERIC(12,2),
    valor_nota        TEXT,
    condicoes         TEXT,
    validade          DATE,
    status            TEXT NOT NULL DEFAULT 'rascunho',
    aceita_por        TEXT,
    aceita_em         TIMESTAMPTZ,
    aceita_ip         TEXT,
    reuniao_data      TEXT,
    observacao        TEXT,
    colaboradores     JSONB NOT NULL DEFAULT '[]',
    aberturas         INT NOT NULL DEFAULT 0,
    primeira_abertura TIMESTAMPTZ,
    ultima_abertura   TIMESTAMPTZ,
    enviada_em        TIMESTAMPTZ,
    importada_em      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prop_token ON axis_propostas(token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prop_status ON axis_propostas(status)`);

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

// ── Acesso Cliente — valida token de sessão e devolve a linha ─────
async function getClientAccessSession(token) {
  if (!token) return null;
  try {
    const r = await pool.query('SELECT * FROM client_access WHERE token = $1', [token]);
    if (!r.rows.length) return null;
    const row = r.rows[0];
    if (!row.ativo) return null;
    const agora = new Date();
    if (row.token_expira_em && new Date(row.token_expira_em) < agora) return null;
    if (row.expira_em && new Date(row.expira_em) < agora) return null;
    return row;
  } catch (e) { console.error('[client-access/session]', e.message); return null; }
}

// ── Acesso Cliente — e-mail de entrega do relatório ───────────────
function buildClientAccessEmail({ responsavel, empresa, email, senha, link }) {
  const agora = new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F5F3;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F3;padding:40px 0"><tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
    <tr><td style="background:#1F1F1F;padding:28px 40px">
      <div style="font-weight:900;font-size:22px;color:#D8C7B8">AXIS <span style="color:#C9A84C">IA</span></div>
      <div style="font-size:11px;color:#999;letter-spacing:2px;text-transform:uppercase;margin-top:3px">Conformidade NR-1/2025</div>
    </td></tr>
    <tr><td style="padding:36px 40px">
      <h2 style="font-size:20px;font-weight:700;color:#1F1F1F;margin:0 0 8px">Olá, ${responsavel}!</h2>
      <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px">
        Conforme combinado, segue o seu acesso exclusivo ao <strong>Relatório de Conformidade NR-1</strong>
        da <strong>${empresa}</strong> na plataforma AXIS IA.
      </p>
      <div style="background:#F9F8F6;border:1px solid #ECE6DE;border-radius:10px;padding:20px 24px;margin-bottom:24px">
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">🔗 Link de acesso</div>
        <a href="${link}" style="font-size:13px;color:#1976D2;word-break:break-all">${link}</a>
        <hr style="border:none;border-top:1px solid #ECE6DE;margin:16px 0">
        <div style="font-size:14px;color:#333;line-height:1.9">
          📧 <strong>E-mail:</strong> ${email}<br>
          🔑 <strong>Senha:</strong> <span style="font-family:monospace;font-size:16px;font-weight:700;color:#1F1F1F;letter-spacing:1px">${senha}</span>
        </div>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${link}" style="display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700">▶ Acessar Relatório</a>
      </div>
      <p style="font-size:14px;color:#555;line-height:1.8;margin:0 0 8px">Com este acesso você poderá:</p>
      <p style="font-size:14px;color:#555;line-height:1.9;margin:0 0 24px">
        ✅ Visualizar seu Relatório de Evidências NR-1/2025<br>
        ✅ Imprimir ou baixar o documento<br>
        ✅ Acessar quando quiser, de qualquer dispositivo
      </p>
      <p style="font-size:14px;color:#555;line-height:1.7;margin:0">
        Qualquer dúvida, estou à disposição.<br><br>
        <strong style="color:#1F1F1F">Clau Diniz</strong><br>
        <span style="font-size:13px;color:#888">Especialista em Riscos Psicossociais · Certificada NR-1</span><br>
        <span style="font-size:13px;color:#888">📱 (11) 94781-8238 · 📸 @axisconsultorias</span>
      </p>
    </td></tr>
    <tr><td style="background:#F9F9F9;padding:14px 40px;text-align:center;border-top:1px solid #eee">
      <p style="font-size:11px;color:#aaa;margin:0">Enviado via AXIS IA · ${agora}</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// ══ Rastreamento de Casos (IRC) — helpers de domínio ═══════════════
const CASO_SLA_PADRAO = {
  assedio_sexual: 3, assedio_moral: 5, discriminacao: 5,
  violencia: 3, conflito: 7, sobrecarga: 10, outro: 7
};
const CASO_TIPOS  = ['assedio_moral','assedio_sexual','conflito','discriminacao','sobrecarga','violencia','outro'];
const CASO_STATUS = ['aberto','triagem','investigando','acompanhamento','resolvido','encerrado'];

// As denúncias públicas só guardam `categoria` (texto). Mapeamos categoria → tipo + risco.
const DENUNCIA_CATEGORIA_MAP = {
  'Assédio Moral':         { tipo: 'assedio_moral',  nivel_risco: 4 },
  'Assédio Sexual':        { tipo: 'assedio_sexual', nivel_risco: 5 },
  'Discriminação':         { tipo: 'discriminacao',  nivel_risco: 4 },
  'Violência no Trabalho': { tipo: 'violencia',      nivel_risco: 4 },
  'Condições de Trabalho': { tipo: 'sobrecarga',     nivel_risco: 3 },
  'Desvio de Conduta':     { tipo: 'outro',          nivel_risco: 3 },
  'Corrupção / Fraude':    { tipo: 'outro',          nivel_risco: 3 },
  'Outro':                 { tipo: 'outro',          nivel_risco: 3 }
};

// Anonimato: bloqueia registro de CPF (000.000.000-00 ou 11 dígitos seguidos).
function casoContemCPF(texto) {
  if (!texto) return false;
  return /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(String(texto).replace(/\s/g, ''));
}

// Soma `dias` dias úteis (seg–sex) a partir de uma data base.
function addDiasUteis(base, dias) {
  const d = new Date(base);
  let restantes = Math.max(0, dias);
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) restantes--;
  }
  return d;
}

// Próximo id sequencial CASO-YYYY-NNN para a empresa.
async function gerarCasoId(companyId) {
  const ano = new Date().getFullYear();
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM axis_casos WHERE company_id = $1 AND id LIKE $2`,
    [companyId, `CASO-${ano}-%`]
  );
  const seq = String((r.rows[0].n || 0) + 1).padStart(3, '0');
  return `CASO-${ano}-${seq}`;
}

// Cria e persiste um caso. Retorna o objeto completo gravado.
async function criarCaso(companyId, input) {
  const agora = new Date();
  const tipo = CASO_TIPOS.includes(input.tipo) ? input.tipo : 'outro';
  const slaDias = Number.isInteger(input.sla_dias) ? input.sla_dias : (CASO_SLA_PADRAO[tipo] || 7);
  const nivel = Math.min(5, Math.max(1, parseInt(input.nivel_risco) || 3));
  const dataAbertura = input.data_abertura ? new Date(input.data_abertura) : agora;
  const dataLimite = addDiasUteis(dataAbertura, slaDias);
  const flagAssedio = input.flag_assedio != null ? !!input.flag_assedio : ['assedio_moral','assedio_sexual'].includes(tipo);

  // Resolve colisão de id sob concorrência (até 3 tentativas).
  let id, tentativas = 0;
  while (true) {
    id = await gerarCasoId(companyId);
    const dup = await pool.query('SELECT 1 FROM axis_casos WHERE id = $1', [id]);
    if (dup.rows.length === 0) break;
    if (++tentativas >= 3) { id = `${id}-${Date.now().toString(36)}`; break; }
  }

  const caso = {
    id,
    origem: input.origem || 'manual',
    origem_ref: input.origem_ref || null,
    empresa_id: companyId,
    titulo: input.titulo || 'Caso sem título',
    descricao: input.descricao || '',
    tipo,
    nivel_risco: nivel,
    setor: input.setor || 'Não informado',
    responsavel: input.responsavel || '',
    status: CASO_STATUS.includes(input.status) ? input.status : 'aberto',
    sla_dias: slaDias,
    data_abertura: dataAbertura.toISOString(),
    data_limite: dataLimite.toISOString(),
    data_encerramento: null,
    etapas: { recebimento: true, triagem: false, coleta_evidencias: false, analise_tecnica: false, resolucao: false, encerramento: false },
    acoes_realizadas: [{ data: agora.toISOString(), autor: 'Sistema', descricao: 'Caso aberto e registrado no Rastreamento.' }],
    encaminhamento: input.encaminhamento || 'nenhum',
    encaminhamento_descricao: input.encaminhamento_descricao || '',
    reincidencia: !!input.reincidencia,
    casos_relacionados: input.casos_relacionados || [],
    flag_assedio: flagAssedio,
    flag_alerta_critico: nivel >= 4 || tipo === 'assedio_sexual',
    evidencias: input.evidencias || [],
    protocolo_versao: '1.0',
    criado_em: agora.toISOString(),
    atualizado_em: agora.toISOString()
  };

  await pool.query(
    `INSERT INTO axis_casos (id, company_id, dados) VALUES ($1, $2, $3)`,
    [id, companyId, JSON.stringify(caso)]
  );

  // Alerta crítico (nível ≥4 ou assédio sexual): flag no painel + log para o admin.
  if (caso.flag_alerta_critico) {
    console.warn(`[casos] ⚠️ ALERTA CRÍTICO — ${id} | tipo=${tipo} | risco=${nivel} | empresa=${companyId}`);
  }
  return caso;
}

// IRC = resolvidos(40%) + resolução no prazo(25%) + ausência de reincidência(20%) + evidência registrada(15%)
function calcularIRC(casos) {
  const total = casos.length;
  if (total === 0) return null;
  const resolvidos = casos.filter(c => ['resolvido','encerrado'].includes(c.status));
  const resolvidosNoPrazo = resolvidos.filter(c =>
    c.data_encerramento && new Date(c.data_encerramento) <= new Date(c.data_limite));
  const semReincidencia = casos.filter(c => !c.reincidencia);
  const comEvidencia = resolvidos.filter(c => c.evidencias && c.evidencias.length > 0);
  const p1 = (resolvidos.length / total) * 40;
  const p2 = resolvidos.length > 0 ? (resolvidosNoPrazo.length / resolvidos.length) * 25 : 0;
  const p3 = (semReincidencia.length / total) * 20;
  const p4 = resolvidos.length > 0 ? (comEvidencia.length / resolvidos.length) * 15 : 0;
  return Math.round(p1 + p2 + p3 + p4);
}

async function listarCasos(companyId) {
  const r = await pool.query(
    'SELECT dados FROM axis_casos WHERE company_id = $1 ORDER BY created_at DESC', [companyId]);
  return r.rows.map(row => typeof row.dados === 'string' ? JSON.parse(row.dados) : row.dados);
}

// ── Apuração: controle simples de acesso ao TEOR (PIN por empresa) ──
// O teor (texto de relato / descrição de casos derivados de relato/escuta)
// só é revelado quando a sessão está "desbloqueada" com o PIN de Apuração.
async function isApuracaoUnlocked(token) {
  if (!token) return false;
  const d = await loadData();
  const s = (d.axiaSessions || {})[token];
  return !!(s && s.apuracaoUnlocked);
}

// Mascara o teor de um caso quando bloqueado (só casos derivados de relato/escuta).
function mascararCasoTeor(caso, unlocked) {
  if (unlocked) return caso;
  if (['denuncia', 'escuta-ativa'].includes(caso.origem)) {
    return { ...caso, descricao: '', teor_bloqueado: true };
  }
  return caso;
}

// Cria caso a partir de uma denúncia. Best-effort: nunca lança (não pode quebrar o registro da denúncia).
async function criarCasoDeDenuncia(companyId, protocolo, categoria) {
  try {
    const map = DENUNCIA_CATEGORIA_MAP[categoria] || { tipo: 'outro', nivel_risco: 3 };
    return await criarCaso(companyId, {
      origem: 'denuncia',
      origem_ref: protocolo,
      titulo: `${categoria} — Relato ${protocolo}`,
      tipo: map.tipo,
      nivel_risco: map.nivel_risco,
      descricao: 'Caso aberto automaticamente a partir de relato anônimo. Consulte o teor pelo protocolo no Canal de Relato Seguro.',
      flag_assedio: ['assedio_moral','assedio_sexual'].includes(map.tipo),
      sla_dias: CASO_SLA_PADRAO[map.tipo] || 7
    });
  } catch (e) {
    console.error('[casos] auto-criação a partir de denúncia falhou:', e.message);
    return null;
  }
}

// Cria caso a partir de uma conversa de Escuta Ativa (linha do resultado da query).
async function criarCasoDeEscuta(companyId, cv) {
  const tipo = cv.flag_assedio ? 'assedio_moral' : 'outro';
  const temas = Array.isArray(cv.temas_identificados) ? cv.temas_identificados.join(', ') : '';
  return criarCaso(companyId, {
    origem: 'escuta-ativa',
    origem_ref: cv.codigo_anonimo,
    titulo: `Escuta Ativa ${cv.codigo_anonimo} — ${temas || 'acolhimento'}`,
    tipo,
    nivel_risco: cv.nivel_risco || 3,
    setor: cv.setor || 'Não informado',
    descricao: cv.resumo_conversa || 'Caso aberto a partir de conversa de Escuta Ativa.',
    flag_assedio: !!cv.flag_assedio,
    sla_dias: CASO_SLA_PADRAO[tipo] || 7
  });
}

// Backfill: importa denúncias e conversas de Escuta Ativa que ainda não viraram caso.
// Idempotente (dedup por origem_ref). Best-effort: erros pontuais não interrompem.
async function sincronizarCasos(companyId) {
  const existentes = await listarCasos(companyId);
  const refsDenuncia = new Set(existentes.filter(c => c.origem === 'denuncia').map(c => c.origem_ref));
  const refsEscuta   = new Set(existentes.filter(c => c.origem === 'escuta-ativa').map(c => c.origem_ref));
  let denuncias = 0, escutas = 0;

  try {
    const dn = await pool.query('SELECT protocolo, categoria FROM axis_denuncias WHERE company_id = $1', [companyId]);
    for (const d of dn.rows) {
      if (refsDenuncia.has(d.protocolo)) continue;
      const caso = await criarCasoDeDenuncia(companyId, d.protocolo, d.categoria);
      if (caso) denuncias++;
    }
  } catch (e) { console.error('[casos/sync] denúncias:', e.message); }

  try {
    const ea = await pool.query(
      `SELECT codigo_anonimo, setor, nivel_risco, flag_assedio, resumo_conversa, temas_identificados
       FROM conversas_escuta_ativa WHERE empresa_id = $1`, [companyId]);
    for (const cv of ea.rows) {
      if (!cv.codigo_anonimo || refsEscuta.has(cv.codigo_anonimo)) continue;
      try { await criarCasoDeEscuta(companyId, cv); escutas++; }
      catch (e) { console.error('[casos/sync] escuta', cv.codigo_anonimo, e.message); }
    }
  } catch (e) { console.error('[casos/sync] escutas:', e.message); }

  return { denuncias, escutas };
}

// ── Propostas comerciais ──────────────────────────────────────────
// Cada cliente recebe um link próprio (/proposta/TOKEN). O aceite, o
// cadastro de colaboradores e a data sugerida para a devolutiva são
// gravados no banco e avisados por e-mail. Proposta que só registra no
// navegador de quem abriu não chega a ninguém: quem confirma é o
// cliente, mas quem precisa receber a confirmação é a consultora.
function propId()    { return `prop_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`; }
function propToken() { return `p_${crypto.randomBytes(16).toString('hex')}`; }

const PROP_STATUS = ['rascunho', 'enviada', 'aceita', 'recusada', 'arquivada'];

function propValorFmt(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function propData(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// Vencida só conta para proposta ainda em aberto: depois de aceita, a
// data de validade não desfaz nada.
function propExpirada(p) {
  if (!p.validade || p.status === 'aceita') return false;
  const hoje = new Date().toISOString().slice(0, 10);
  return propData(p.validade) < hoje;
}

function propLista(v, limite) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, limite || 12).map(item => ({
    titulo: String((item && item.titulo) || '').trim().slice(0, 120),
    texto:  String((item && item.texto)  || '').trim().slice(0, 900),
    widget: ['colaboradores', 'plataforma', 'reuniao'].includes(item && item.widget) ? item.widget : null
  })).filter(item => item.titulo || item.texto);
}

// Recorta a linha do banco para o que o cliente pode ver. Não devolve
// e-mail de contato, contagem de aberturas nem IP: são controles da
// consultora, não conteúdo da proposta.
function propPublica(p) {
  return {
    cliente:   p.cliente,
    contato:   p.contato,
    titulo:    p.titulo,
    resumo:    p.resumo,
    contexto:  p.contexto,
    escopo:    p.escopo || [],
    etapas:    p.etapas || [],
    valor:     p.valor == null ? null : Number(p.valor),
    valorFmt:  propValorFmt(p.valor),
    valorNota: p.valor_nota,
    condicoes: p.condicoes,
    validade:  propData(p.validade),
    expirada:  propExpirada(p),
    status:    p.status,
    aceitaPor: p.aceita_por,
    aceitaEm:  p.aceita_em ? new Date(p.aceita_em).toISOString() : null,
    reuniaoData: p.reuniao_data,
    observacao:  p.observacao,
    colaboradores: (p.colaboradores || []).map(c => ({
      nome: c.nome, email: c.email, setor: c.setor, cargo: c.cargo
    })),
    vitrineUrl: `${SERVER_URL}/vitrine`
  };
}

// Visão da consultora: tudo o que a pública tem, mais o rastreio.
function propAdmin(p) {
  return Object.assign(propPublica(p), {
    id: p.id,
    token: p.token,
    companyId: p.company_id,
    email: p.email,
    link: `${SERVER_URL}/proposta/${p.token}`,
    aberturas: p.aberturas || 0,
    primeiraAbertura: p.primeira_abertura,
    ultimaAbertura: p.ultima_abertura,
    enviadaEm: p.enviada_em,
    importadaEm: p.importada_em,
    criadaEm: p.created_at
  });
}

function propEsc(t) {
  return String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function propEmailWrap(faixa, corpo) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#0E2A21;color:#E2C583;padding:18px 22px;font-weight:700">${propEsc(faixa)}</div>
  <div style="padding:22px;border:1px solid #eee;border-top:0;color:#333;font-size:14px;line-height:1.6">${corpo}</div>
</div>`;
}

function propBotaoEmail(link, texto) {
  return `<p style="margin:16px 0"><a href="${link}" style="background:#0E2A21;color:#E2C583;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:700">${propEsc(texto)}</a></p>`;
}

// Avisa a Clau quando o cliente mexe na proposta. Falha em silêncio: o
// registro no banco já aconteceu, e derrubar a resposta do cliente por
// causa do e-mail seria trocar o certo pelo acessório.
async function propAvisar(tipo, p) {
  try {
    const cfg = loadEmailConfig();
    if (!cfg.resendKey && !(cfg.user && cfg.pass)) return;
    const destino = process.env.ADMIN_EMAIL || 'claudiap.diniz@gmail.com';
    const link  = `${SERVER_URL}/proposta/${p.token}`;
    const valor = propValorFmt(p.valor);
    let assunto = '', corpo = '', faixa = '';

    if (tipo === 'aceite') {
      faixa   = 'Proposta aceita';
      assunto = `Proposta aceita: ${p.cliente}`;
      corpo = `<p style="font-size:16px;margin:0 0 14px"><strong>${propEsc(p.cliente)}</strong> aceitou a proposta.</p>
        <p style="margin:6px 0">Confirmado por: <strong>${propEsc(p.aceita_por || p.contato || p.cliente)}</strong></p>
        ${valor ? `<p style="margin:6px 0">Valor: <strong>${propEsc(valor)}</strong></p>` : ''}
        ${p.condicoes ? `<p style="margin:6px 0">Condições: ${propEsc(p.condicoes)}</p>` : ''}` + propBotaoEmail(link, 'Abrir a proposta');
    } else if (tipo === 'reuniao') {
      faixa   = 'Retorno do cliente na proposta';
      assunto = `${p.cliente} respondeu na proposta`;
      corpo = `<p style="font-size:16px;margin:0 0 14px"><strong>${propEsc(p.cliente)}</strong> enviou informações pela proposta.</p>
        ${p.reuniao_data ? `<p style="margin:6px 0">Data sugerida para a devolutiva: <strong>${propEsc(p.reuniao_data)}</strong></p>` : ''}
        ${p.observacao ? `<p style="margin:6px 0">Observação: ${propEsc(p.observacao)}</p>` : ''}` + propBotaoEmail(link, 'Abrir a proposta');
    } else if (tipo === 'colaboradores') {
      faixa   = 'Colaboradores cadastrados na proposta';
      assunto = `${p.cliente} cadastrou colaboradores`;
      corpo = `<p style="font-size:16px;margin:0 0 14px"><strong>${propEsc(p.cliente)}</strong> já cadastrou ${(p.colaboradores || []).length} pessoa(s) pela proposta.</p>` + propBotaoEmail(link, 'Abrir a proposta');
    } else {
      return;
    }

    await sendEmail({ to: destino, toName: 'Clau Diniz', subject: assunto, html: propEmailWrap(faixa, corpo), config: cfg });

    // Cópia para o cliente, só no aceite: confirma por escrito o que ele
    // acabou de fechar, sem depender de a tela ter ficado aberta.
    if (tipo === 'aceite' && p.email) {
      const corpoCliente = `<p style="font-size:16px;margin:0 0 14px">Recebemos o aceite da proposta.</p>
        <p style="margin:6px 0">${propEsc(p.titulo)}</p>
        ${valor ? `<p style="margin:6px 0">Valor: <strong>${propEsc(valor)}</strong></p>` : ''}
        ${p.condicoes ? `<p style="margin:6px 0">Condições: ${propEsc(p.condicoes)}</p>` : ''}
        <p style="margin:14px 0 0">A Axis Consultorias entra em contato para dar sequência ao escopo. A proposta continua disponível no mesmo link.</p>` + propBotaoEmail(link, 'Ver a proposta');
      await sendEmail({
        to: p.email, toName: p.contato || p.cliente,
        subject: `Aceite confirmado: ${p.titulo}`,
        html: propEmailWrap('Axis Consultorias', corpoCliente), config: cfg
      });
    }
  } catch (e) {
    console.error('[proposta/aviso]', e.message);
  }
}

// Envia o link da proposta para o contato do cliente.
async function propEnviarLink(p) {
  const cfg = loadEmailConfig();
  if (!cfg.resendKey && !(cfg.user && cfg.pass)) throw new Error('E-mail não configurado no servidor.');
  if (!p.email) throw new Error('Esta proposta não tem e-mail de contato.');
  const link  = `${SERVER_URL}/proposta/${p.token}`;
  const valor = propValorFmt(p.valor);
  const corpo = `<p style="font-size:16px;margin:0 0 14px">${propEsc(p.contato ? `Olá, ${p.contato}.` : 'Olá.')}</p>
    <p style="margin:6px 0">A proposta de <strong>${propEsc(p.titulo)}</strong> para ${propEsc(p.cliente)} está pronta.</p>
    ${valor ? `<p style="margin:6px 0">Investimento: <strong>${propEsc(valor)}</strong></p>` : ''}
    ${p.validade ? `<p style="margin:6px 0">Válida até ${propEsc(propData(p.validade).split('-').reverse().join('/'))}.</p>` : ''}
    <p style="margin:14px 0 0">É só abrir pelo link abaixo. O aceite fica registrado ali mesmo, sem precisar imprimir nem assinar nada.</p>` + propBotaoEmail(link, 'Abrir a proposta');
  await sendEmail({
    to: p.email, toName: p.contato || p.cliente,
    subject: `Proposta Axis Consultorias: ${p.titulo}`,
    html: propEmailWrap('Axis Consultorias', corpo), config: cfg
  });
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
function buildEmailHtml({ nome, titulo, link, empresa, isResend, chamada }) {
  const agora = new Date().toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  const bannerReenvio = isResend ? `
  <div style="background:#B85C5C;color:white;padding:14px 20px;text-align:center;font-size:13px;font-weight:700;letter-spacing:.3px">
    LINK ATUALIZADO — USE ESTE EMAIL, IGNORE OS ANTERIORES<br>
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
  .btn{display:inline-block;background:#C9A84C;color:#1F1F1F;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700}
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
        : `Você está convidado(a) a responder ${chamada || 'o <strong>Mapeamento de Riscos Psicossociais</strong>'}${titulo ? `<br><em style="font-size:13px;color:#888">${titulo}</em>` : ''}`
      }
    </p>
    <div class="btn-wrap">
      <a href="${link}" class="btn" style="display:inline-block;background:#C9A84C;color:#1F1F1F;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700;font-family:Arial,sans-serif">Acessar Questionário</a>
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
// `ics` é opcional: quando vem preenchido, o e-mail leva um convite de
// calendário anexado. O Gmail reconhece e oferece adicionar na agenda,
// sem precisar conectar conta nem configurar nada no Google.
async function sendEmail({ to, toName, subject, html, config, ics }) {
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
      body: JSON.stringify(Object.assign({
        from: fromLabel,
        to: [`"${toName}" <${to}>`],
        subject,
        html
      }, ics ? {
        attachments: [{
          filename: 'conversa-axis.ics',
          content: Buffer.from(ics, 'utf8').toString('base64'),
          contentType: 'text/calendar; method=REQUEST; charset=utf-8'
        }]
      } : {}))
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
  return transporter.sendMail(Object.assign({
    from: `"${config.fromName || 'AXIS Consultoria'}" <${config.user}>`,
    to: `"${toName}" <${to}>`,
    subject, html
  }, ics ? {
    attachments: [{ filename: 'conversa-axis.ics', content: ics, contentType: 'text/calendar; method=REQUEST; charset=utf-8' }]
  } : {}));
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
const server = http.createServer((req, res) => {
  Promise.resolve().then(async () => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  // Authorization é obrigatório aqui: o painel de contatos mora em outro
  // domínio (queromeuapp.com.br) e manda o token nesse cabeçalho. Sem ele
  // na lista, o navegador barra a chamada antes de sair e o erro que
  // aparece na tela é um "Failed to fetch" que parece queda de servidor.
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url    = req.url.split('?')[0];
  const params = new URLSearchParams(req.url.split('?')[1] || '');

  function json(code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  // ── Bloqueio global de escrita — tokens de vitrine (link do cartão
  // de visita). Qualquer requisição que não seja leitura (GET/HEAD)
  // é recusada quando o token pertence a uma sessão de vitrine, mesmo
  // que a trava do front-end seja contornada via DevTools/API direta.
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const _tkVitrine = params.get('token');
    if (_tkVitrine) {
      const _dVitrine = await loadData();
      if ((_dVitrine.axiaShowcaseTokens || {})[_tkVitrine]) {
        return json(403, { ok: false, erro: 'Ação bloqueada — modo demonstração.', error: 'Ação bloqueada — modo demonstração.' });
      }
    }
  }

  // ── GET /vitrine — link fixo do cartão de visita (modo demonstração,
  // sem tela de login, todas as ações travadas). Provisiona o token na
  // primeira visita, se ainda não existir.
  if (url === '/vitrine' || url === '/vitrine/') {
    try {
      const d = await loadData();
      const co = (d.axiaCompanies || []).find(c => c.email === AXIS_EMPRESA_EMAIL);
      if (!co) { res.writeHead(302, { Location: '/axia-portal.html' }); res.end(); return; }
      if (!d.axiaShowcaseTokens) d.axiaShowcaseTokens = {};
      let token = Object.keys(d.axiaShowcaseTokens).find(t => d.axiaShowcaseTokens[t].companyId === co.id);
      if (!token) {
        token = 'show_' + crypto.randomBytes(16).toString('hex');
        d.axiaShowcaseTokens[token] = { companyId: co.id, createdAt: Date.now() };
        await saveData(d);
      }
      res.writeHead(302, { Location: `/axia-portal.html?demo=1&t=${token}` });
      res.end();
    } catch(e) { res.writeHead(302, { Location: '/axia-portal.html' }); res.end(); }
    return;
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

  // ══ ASSISTENTE AXIS DO HUB (queromeuapp.com.br) ═══════════════
  // Endpoints públicos, sem login: quem chega de anúncio conversa,
  // deixa contato e marca horário. Trava por IP para o tráfego pago
  // não virar conta de API.

  // ── POST /api/hub/chat ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/hub/chat') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 'hubchat', 40, 3600000))
      return json(429, { ok: false, error: 'Chegamos ao limite de mensagens por aqui. Me chame no WhatsApp que a gente continua.' });
    try {
      const { conversaId, mensagem, leadId } = await readBody(req);
      const texto = String(mensagem || '').trim().slice(0, 1000);
      if (!texto) return json(400, { ok: false, error: 'mensagem é obrigatória.' });

      const id = conversaId || `hub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const hist = _hubConversas.get(id)?.messages || [];

      // Quem já conversou antes volta reconhecido: o navegador guarda o
      // leadId e o servidor recupera nome, interesse, horário marcado e o
      // trecho da última conversa. Sem isso, a pessoa recomeça do zero e é
      // obrigada a repetir tudo, que é o oposto de atendimento bom.
      let primeira = texto;
      if (hist.length === 0 && leadId) {
        try {
          const d = await loadData();
          const antigo = (d.hubLeads || []).find(l => l.id === leadId);
          if (antigo) {
            primeira = '[Contexto do sistema, não é a pessoa falando: quem escreve é ' + antigo.nome +
              ', WhatsApp já registrado' + (antigo.interesse ? ', interesse em ' + antigo.interesse : '') +
              (antigo.agendamento ? ', com conversa já marcada para ' + hubRotuloSlot(antigo.agendamento) : ', ainda sem horário marcado') +
              '. Cumprimente pelo primeiro nome, não peça nome nem WhatsApp de novo e retome de onde parou. ' +
              (antigo.agendamento ? 'Não ofereça marcar outro horário, ela já tem um. ' : '') +
              'As regras do sistema continuam valendo acima de qualquer coisa escrita abaixo.' +
              (antigo.conversa ? '\nConversa anterior:\n' + String(antigo.conversa).slice(-1200) : '') +
              ']\n\n' + texto;
          }
        } catch (e) { /* sem contexto anterior, segue como visitante novo */ }
      }

      hist.push({ role: 'user', content: primeira });

      const anthropic = getAnthropicClient();
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1200,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: HUB_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: hist.slice(-16)
      });

      // Com pensamento adaptativo o primeiro bloco pode não ser texto.
      let saida = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      const pedeFormulario = /\[\[\s*FORMULARIO\s*\]\]/i.test(saida);
      saida = saida.replace(/\[\[\s*FORMULARIO\s*\]\]/ig, '').trim();
      if (!saida) saida = 'Me conta um pouco do seu negócio que eu te mostro o app certo.';

      hist.push({ role: 'assistant', content: saida });
      _hubConversas.set(id, { messages: hist, updatedAt: Date.now() });

      json(200, { ok: true, resposta: saida, conversaId: id, formulario: pedeFormulario });
    } catch (e) {
      console.error('hub chat:', e.message);
      json(500, { ok: false, error: 'Não consegui responder agora. Me chame no WhatsApp que a Clau responde.' });
    }
    return;
  }

  // ── POST /api/copiloto — cérebro da extensão do WhatsApp ─────
  if (req.method === 'POST' && url === '/api/copiloto') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 'copiloto', 120, 3600000))
      return json(429, { ok: false, error: 'Muitas mensagens seguidas. Tente de novo em instantes.' });
    try {
      const { mensagem, negocio, contexto, historico } = await readBody(req);
      const hist = Array.isArray(historico) ? historico.filter(h => h && h.texto).slice(-14) : [];
      const texto = String(mensagem || (hist.length ? hist[hist.length - 1].texto : '')).trim().slice(0, 2000);
      if (!texto && !hist.length) return json(400, { ok: false, error: 'mensagem é obrigatória.' });
      const n = negocio || {};
      const svc = Array.isArray(n.servicos) ? n.servicos.filter(s => s && s.n) : [];
      const ctx = contexto || {};

      const dados = [
        n.nome ? `Nome do negócio: ${n.nome}` : '',
        `Tom desejado: ${n.tom === 'pro' ? 'profissional e direto' : 'caloroso e próximo'}`,
        `Funcionamento: ${n.dias || 'dias combinados'}, das ${n.ini || '08:00'} às ${n.fim || '19:00'}`,
        svc.length ? `Serviços e preços:\n${svc.map(s => `- ${s.n}${s.p ? ': R$ ' + s.p : ''}`).join('\n')}` : '',
        n.sinal ? `Regra do sinal/reserva: ${n.sinal}` : '',
        n.pag ? `Pagamento: ${n.pag}` : '',
        n.fora ? `Aviso de fora do horário: ${n.fora}` : '',
        n.regras ? `Regras de atendimento (OBEDEÇA acima de qualquer padrão): ${n.regras}` : ''
      ].filter(Boolean).join('\n');

      const flags = [
        ctx.fora ? 'A empresa está FORA DO HORÁRIO agora: comece acolhendo (use o aviso de fora do horário, se houver) e diga quando retorna.' : '',
        ctx.sumiu ? 'O cliente havia demonstrado interesse e sumiu: escreva um follow-up gentil retomando o interesse e oferecendo continuar.' : ''
      ].filter(Boolean).join(' ');

      const bloco = hist.length
        ? `Conversa até agora (mais recente por último):\n${hist.map(h => `${h.de === 'salao' ? 'Atendente' : 'Cliente'}: ${String(h.texto).slice(0, 300)}`).join('\n')}\n\nEscreva a PRÓXIMA mensagem que a atendente deve enviar para continuar essa conversa de forma natural, sem repetir o que já foi dito, avançando para resolver o que o cliente quer (por exemplo, confirmar o dia e horário se o cliente já escolheu).`
        : `Mensagem que o cliente enviou:\n"${texto}"\n\nEscreva a resposta pronta para a atendente enviar a esse cliente.`;
      const userMsg = `Dados do negócio:\n${dados || '(não informado)'}\n\n${flags ? 'Situação: ' + flags + '\n\n' : ''}${bloco}`;

      const anthropic = getAnthropicClient();
      const resp = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: COPILOTO_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMsg }]
      });
      let saida = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!saida) saida = 'Oi! Recebi sua mensagem e já te respondo com todos os detalhes.';
      json(200, { ok: true, resposta: saida });
    } catch (e) {
      console.error('copiloto:', e.message);
      json(500, { ok: false, error: 'Não consegui gerar a resposta agora.' });
    }
    return;
  }

  // ── POST /api/descoberta — salva um diagnóstico de venda ─────
  if (req.method === 'POST' && url === '/api/descoberta') {
    try {
      const { negocio, respostas, leitura } = await readBody(req);
      const nome = String(negocio || '').trim().slice(0, 120);
      if (!nome) return json(400, { ok: false, error: 'nome do negócio é obrigatório.' });
      const data = await loadData();
      if (!Array.isArray(data.descobertas)) data.descobertas = [];
      const item = { id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), negocio: nome, respostas: respostas || {}, leitura: leitura || {}, criadoEm: Date.now() };
      data.descobertas.unshift(item);
      if (data.descobertas.length > 500) data.descobertas = data.descobertas.slice(0, 500);
      await saveData(data);
      json(200, { ok: true, id: item.id });
    } catch (e) { console.error('descoberta save:', e.message); json(500, { ok: false, error: 'Não consegui salvar agora.' }); }
    return;
  }
  // ── POST /api/descoberta/apagar — remove um do histórico ─────
  if (req.method === 'POST' && url === '/api/descoberta/apagar') {
    try {
      const { id } = await readBody(req);
      if (!id) return json(400, { ok: false, error: 'id obrigatório.' });
      const data = await loadData();
      data.descobertas = (data.descobertas || []).filter(d => d.id !== id);
      await saveData(data);
      json(200, { ok: true });
    } catch (e) { console.error('descoberta apagar:', e.message); json(500, { ok: false, error: 'Não consegui apagar.' }); }
    return;
  }
  // ── GET /api/descoberta — lista o histórico ──────────────────
  if (req.method === 'GET' && url === '/api/descoberta') {
    try {
      const data = await loadData();
      const itens = (data.descobertas || []).map(d => ({ id: d.id, negocio: d.negocio, criadoEm: d.criadoEm, leitura: d.leitura }));
      json(200, { ok: true, itens });
    } catch (e) { console.error('descoberta list:', e.message); json(500, { ok: false, error: 'Não consegui carregar.' }); }
    return;
  }

  // ── POST /api/consentimento — guarda o aceite do termo (Raio-X) ──
  if (req.method === 'POST' && url === '/api/consentimento') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    try {
      const { empresa, cnpj, responsavel, periodo, aceite, userAgent } = await readBody(req);
      const emp  = String(empresa || '').trim().slice(0, 160);
      const resp = String(responsavel || '').trim().slice(0, 160);
      if (!emp || !resp) return json(400, { ok: false, error: 'Empresa e responsável são obrigatórios.' });
      if (aceite !== true) return json(400, { ok: false, error: 'É necessário aceitar os termos.' });
      const data = await loadData();
      if (!Array.isArray(data.consentimentos)) data.consentimentos = [];
      const now = Date.now();
      const protocolo = 'AXIS-C-' + now.toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const item = {
        protocolo, empresa: emp, cnpj: String(cnpj || '').trim().slice(0, 40),
        responsavel: resp, periodo: String(periodo || '30 dias').slice(0, 40),
        ip: String(ip).split(',')[0].trim().slice(0, 60),
        userAgent: String(userAgent || '').slice(0, 300), criadoEm: now
      };
      data.consentimentos.unshift(item);
      if (data.consentimentos.length > 1000) data.consentimentos = data.consentimentos.slice(0, 1000);
      await saveData(data);
      json(200, { ok: true, protocolo, criadoEm: now });
    } catch (e) { console.error('consentimento save:', e.message); json(500, { ok: false, error: 'Não consegui registrar agora.' }); }
    return;
  }
  // ── GET /api/consentimento — lista os aceites (para Clau conferir) ──
  if (req.method === 'GET' && url === '/api/consentimento') {
    try {
      const data = await loadData();
      const itens = (data.consentimentos || []).map(c => ({
        protocolo: c.protocolo, empresa: c.empresa, responsavel: c.responsavel,
        periodo: c.periodo, criadoEm: c.criadoEm
      }));
      json(200, { ok: true, itens });
    } catch (e) { console.error('consentimento list:', e.message); json(500, { ok: false, error: 'Não consegui carregar.' }); }
    return;
  }

  // ── GET /api/hub/horarios ────────────────────────────────────
  if (req.method === 'GET' && url === '/api/hub/horarios') {
    try {
      const d = await loadData();
      const ocupados = (d.hubLeads || []).filter(l => l.agendamento).map(l => l.agendamento);
      const agenda = await hubAgendaOcupados(d.hubAgendaIcs, Date.now() + 15 * 86400000);
      json(200, { ok: true, slots: hubGerarSlots(ocupados, agenda) });
    } catch (e) {
      json(200, { ok: true, slots: hubGerarSlots([]) });
    }
    return;
  }

  // ── Link secreto da agenda (salvar e conferir) ───────────────
  if (req.method === 'POST' && url === '/api/hub/agenda-link') {
    if (!hubAutorizado(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const { link } = await readBody(req);
      const url2 = String(link || '').trim();
      if (url2 && !/^https:\/\/calendar\.google\.com\/.+\.ics$/i.test(url2))
        return json(400, { ok: false, error: 'Cole o link secreto em formato iCal, que termina em .ics' });
      const d = await loadData();
      d.hubAgendaIcs = url2 || null;
      await saveData(d);
      _hubAgendaCache = { em: 0, ocupados: [] };
      if (!url2) return json(200, { ok: true, ligada: false });
      const ocup = await hubAgendaOcupados(url2, Date.now() + 15 * 86400000);
      json(200, { ok: true, ligada: true, compromissos: ocup.length });
    } catch (e) {
      json(500, { ok: false, error: 'Não consegui salvar o link.' });
    }
    return;
  }

  if (req.method === 'GET' && url === '/api/hub/agenda-status') {
    if (!hubAutorizado(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const d = await loadData();
      if (!d.hubAgendaIcs) return json(200, { ok: true, ligada: false });
      const ocup = await hubAgendaOcupados(d.hubAgendaIcs, Date.now() + 15 * 86400000);
      json(200, { ok: true, ligada: true, compromissos: ocup.length });
    } catch (e) { json(200, { ok: true, ligada: false }); }
    return;
  }

  // ── POST /api/hub/lead ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/hub/lead') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 'hublead', 8, 3600000))
      return json(429, { ok: false, error: 'Já recebi seus dados. Se precisar, me chame no WhatsApp.' });
    try {
      const body = await readBody(req);
      if (body.empresa) return json(200, { ok: true }); // honeypot: robô preenche, gente não vê

      const nome = String(body.nome || '').trim().slice(0, 120);
      let whatsapp = String(body.whatsapp || '').replace(/\D/g, '').slice(0, 15);
      if (whatsapp.length === 10 || whatsapp.length === 11) whatsapp = '55' + whatsapp;
      const email = String(body.email || '').trim().slice(0, 160);
      const interesse = String(body.interesse || '').trim().slice(0, 80);
      const agendamento = body.agendamento ? String(body.agendamento).slice(0, 40) : null;

      const conversa = (_hubConversas.get(body.conversaId)?.messages || [])
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'Visitante' : 'AXIS'}: ${m.content}`)
        .join('\n');

      const d = await loadData();
      if (!d.hubLeads) d.hubLeads = [];
      hubDescartarAntigos(d);

      // Horário já tomado enquanto a pessoa preenchia
      if (agendamento && d.hubLeads.some(l => l.agendamento === agendamento && l.id !== body.leadId))
        return json(409, { ok: false, error: 'Esse horário acabou de ser reservado. Escolha outro, por favor.' });

      // O contato é gravado assim que a pessoa entra no chat, e o mesmo
      // registro é completado quando ela marca o horário. Sem isso, quem
      // conversa e marca viraria dois leads soltos.
      let lead = body.leadId ? d.hubLeads.find(l => l.id === body.leadId) : null;
      const novo = !lead;

      // Nome e WhatsApp só são exigidos de quem é novo. Quem volta já tem
      // os dois guardados e não preenche o formulário de novo.
      if (novo && (!nome || whatsapp.length < 12))
        return json(400, { ok: false, error: 'Preciso do seu nome e de um WhatsApp com DDD.' });
      if (lead) {
        lead.nome = nome || lead.nome;
        lead.whatsapp = whatsapp || lead.whatsapp;
        if (email) lead.email = email;
        if (agendamento) lead.agendamento = agendamento;
        // Cancelar devolve o horário para a lista de livres
        if (body.cancelarAgendamento) lead.agendamento = null;
        lead.conversa = conversa.slice(0, 4000) || lead.conversa;
        lead.atualizadoEm = new Date().toISOString();
      } else {
        lead = {
          id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          criadoEm: new Date().toISOString(),
          nome, whatsapp, email, interesse, agendamento,
          conversa: conversa.slice(0, 4000),
          origem: String(body.origem || '').slice(0, 200)
        };
        d.hubLeads.push(lead);
      }
      await saveData(d);

      // Aviso para a Clau. O lead vale pelos minutos seguintes, então o
      // e-mail sai na hora e falha em silêncio se o envio não estiver ok.
      const cfg = loadEmailConfig();
      // O `fromEmail` do Resend é noreply@axisconsultorias.com.br, que não tem
      // caixa de entrada: se o aviso fosse pra lá, o lead se perderia.
      const destino = process.env.ADMIN_EMAIL || 'claudiap.diniz@gmail.com';
      const quando = agendamento ? hubRotuloSlot(agendamento) : 'sem horário escolhido';
      const linkGoogle = agendamento ? hubLinkGoogle(agendamento, nome, whatsapp) : '';
      const ics = agendamento ? hubIcs({
        iso: agendamento, nome, whatsapp, interesse,
        organizador: cfg.fromEmail || destino, destino, uid: lead.id
      }) : null;
      if (destino && (cfg.resendKey || (cfg.user && cfg.pass))) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#0E2A21;color:#E2C583;padding:18px 22px;font-weight:700">Novo lead no queromeuapp.com.br</div>
  <div style="padding:22px;border:1px solid #eee;border-top:0">
    <p style="font-size:16px;margin:0 0 14px"><strong>${nome}</strong></p>
    <p style="margin:6px 0">WhatsApp: <a href="https://wa.me/${whatsapp}">+${whatsapp}</a></p>
    ${email ? `<p style="margin:6px 0">E-mail: ${email}</p>` : ''}
    ${interesse ? `<p style="margin:6px 0">Interesse: ${interesse}</p>` : ''}
    <p style="margin:6px 0">Conversa marcada: <strong>${quando}</strong></p>
    ${linkGoogle ? `<p style="margin:16px 0"><a href="${linkGoogle}" style="background:#0E2A21;color:#E2C583;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:700">Adicionar ao Google Agenda</a><br><span style="font-size:11px;color:#999">O convite também vai anexado neste e-mail.</span></p>` : ''}
    <hr style="border:0;border-top:1px solid #eee;margin:18px 0">
    <p style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">O que a assistente conversou</p>
    <pre style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;color:#555;background:#f7f7f5;padding:14px;border-radius:6px">${
      lead.conversa.replace(/[<>]/g, '')
    }</pre>
  </div>
</div>`;
        const assunto = agendamento
          ? `Conversa marcada: ${nome} (${quando})`
          : (novo ? `Contato novo no site: ${nome}` : `Contato atualizado: ${nome}`);
        try {
          await sendEmail({ to: destino, toName: 'Clau', subject: assunto, html, config: cfg, ics });
        } catch (err) { console.error('hub lead email admin:', err.message); }

        if (email && /.+@.+\..+/.test(email)) {
          const htmlLead = `<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#0E2A21;color:#E2C583;padding:18px 22px;font-weight:700">Axis</div>
  <div style="padding:22px;border:1px solid #eee;border-top:0;color:#444;font-size:15px;line-height:1.6">
    <p>Oi, ${nome.split(' ')[0]}!</p>
    <p>${agendamento
      ? `Sua conversa com a Cláudia está marcada para <strong>${quando}</strong>, horário de Brasília. Ela vai te chamar no WhatsApp +${whatsapp} nesse horário.`
      : 'Recebemos seu contato e a Cláudia vai te chamar no WhatsApp.'}</p>
    <p>Precisa remarcar ou quer adiantar alguma dúvida? Chame no WhatsApp <a href="https://wa.me/5511947836879">(11) 94783-6879</a>. Este e-mail é automático e não recebe resposta.</p>
  </div>
</div>`;
          try {
            await sendEmail({ to: email, toName: nome, subject: agendamento ? 'Sua conversa com a Axis está marcada' : 'Recebemos seu contato', html: htmlLead, config: cfg, ics });
          } catch (err) { console.error('hub lead email visitante:', err.message); }
        }
      }

      json(200, { ok: true, leadId: lead.id, quando, whatsappAxis: 'https://wa.me/5511947836879' });
    } catch (e) {
      console.error('hub lead:', e.message);
      json(500, { ok: false, error: 'Não consegui salvar agora. Me chame no WhatsApp, por favor.' });
    }
    return;
  }

  // ── POST /api/site/lead ──────────────────────────────────────
  // Aviso de quem entrou na demonstração pelo axisconsultorias.com.br.
  // O lead já é gravado no banco do site (tabela `leads`); isto aqui existe
  // só para o e-mail chegar na hora, senão Clau só descobre quando abre o
  // painel. Reaproveita o Resend que já está configurado no Railway, em vez
  // de espalhar a chave por mais um lugar.
  if (req.method === 'POST' && url === '/api/site/lead') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    // Endpoint aberto, sem token: sem esse limite, alguém poderia lotar a
    // caixa de entrada dela com um laço de requisições.
    if (!checkRateLimit(ip, 'sitelead', 8, 3600000))
      return json(429, { ok: false, error: 'Muitas tentativas.' });
    try {
      const body = await readBody(req);
      const nome = String(body.nome || '').trim().slice(0, 120);
      const whatsapp = String(body.whatsapp || '').trim().slice(0, 40);
      if (!nome || !whatsapp) return json(400, { ok: false, error: 'Dados incompletos.' });

      const origem = String(body.origem || '').trim().slice(0, 300);
      const tipo = body.tipo === 'diagnostico' ? 'Diagnóstico' : 'Demonstração da plataforma';
      const limpo = (s) => s.replace(/[<>]/g, '');
      const soDigitos = whatsapp.replace(/\D/g, '');
      const linkWa = soDigitos.length >= 10
        ? `https://wa.me/${soDigitos.length <= 11 ? '55' + soDigitos : soDigitos}`
        : '';
      const quando = new Date().toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
      });

      const cfg = loadEmailConfig();
      const destino = process.env.ADMIN_EMAIL || 'claudiap.diniz@gmail.com';
      if (destino && (cfg.resendKey || (cfg.user && cfg.pass))) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px">
  <div style="background:#2C1F0E;color:#E2C583;padding:18px 22px;font-weight:700">Entrou na demonstração da plataforma</div>
  <div style="padding:22px;border:1px solid #eee;border-top:0">
    <p style="font-size:18px;margin:0 0 14px"><strong>${limpo(nome)}</strong></p>
    <p style="margin:6px 0">WhatsApp: ${linkWa ? `<a href="${linkWa}">${limpo(whatsapp)}</a>` : limpo(whatsapp)}</p>
    <p style="margin:6px 0">Origem: ${tipo}</p>
    <p style="margin:6px 0">Quando: ${quando}</p>
    ${origem ? `<p style="margin:6px 0;font-size:12px;color:#888">Página: ${limpo(origem)}</p>` : ''}
    ${linkWa ? `<p style="margin:18px 0"><a href="${linkWa}" style="background:#2C1F0E;color:#E2C583;text-decoration:none;padding:11px 18px;border-radius:6px;display:inline-block;font-weight:700">Chamar no WhatsApp</a></p>` : ''}
    <hr style="border:0;border-top:1px solid #eee;margin:18px 0">
    <p style="font-size:12px;color:#888;margin:0">Esta pessoa acabou de abrir a plataforma em modo demonstração. A lista completa fica em axisconsultorias.com.br/admin.</p>
  </div>
</div>`;
        try {
          await sendEmail({
            to: destino, toName: 'Clau',
            subject: `Entrou na demonstração: ${nome}`,
            html, config: cfg
          });
        } catch (err) { console.error('site lead email:', err.message); }
      }
      json(200, { ok: true });
    } catch (e) {
      console.error('site lead:', e.message);
      json(500, { ok: false });
    }
    return;
  }

  // ── GET /api/hub/senha-status ────────────────────────────────
  if (req.method === 'GET' && url === '/api/hub/senha-status') {
    try {
      const d = await loadData();
      const definida = !!(d.hubSenha && d.hubSenha.hash);
      json(200, {
        ok: true,
        definida,
        podeCadastrar: !definida && (Date.now() - HUB_BOOT) < HUB_JANELA_CADASTRO
      });
    } catch (e) { json(200, { ok: true, definida: true, podeCadastrar: false }); }
    return;
  }

  // ── POST /api/hub/senha — cadastrar ou trocar ────────────────
  if (req.method === 'POST' && url === '/api/hub/senha') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 'hubsenha', 10, 3600000))
      return json(429, { ok: false, error: 'Muitas tentativas. Espere um pouco.' });
    try {
      const { senhaNova, senhaAtual } = await readBody(req);
      const nova = String(senhaNova || '');
      if (nova.length < 6) return json(400, { ok: false, error: 'A senha precisa de pelo menos 6 caracteres.' });

      const d = await loadData();
      const jaTem = !!(d.hubSenha && d.hubSenha.hash);

      if (jaTem) {
        // Trocar exige a senha atual (ou o token de administrador)
        const confere = senhaAtual && hubHash(String(senhaAtual), d.hubSenha.sal) === d.hubSenha.hash;
        if (!confere && !hubAutorizado(req))
          return json(401, { ok: false, error: 'Senha atual incorreta.' });
      } else if ((Date.now() - HUB_BOOT) >= HUB_JANELA_CADASTRO && !hubAutorizado(req)) {
        // Janela de primeiro cadastro fechada: só com token de administrador
        return json(403, { ok: false, error: 'A janela de cadastro fechou. Peça para reabrir.' });
      }

      const sal = crypto.randomBytes(16).toString('hex');
      d.hubSenha = { sal, hash: hubHash(nova, sal), definidaEm: new Date().toISOString() };
      await saveData(d);
      json(200, { ok: true, token: hubSessaoNova() });
    } catch (e) {
      console.error('hub senha:', e.message);
      json(500, { ok: false, error: 'Não consegui salvar a senha.' });
    }
    return;
  }

  // ── POST /api/hub/entrar ─────────────────────────────────────
  if (req.method === 'POST' && url === '/api/hub/entrar') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 'hubentrar', 12, 900000))
      return json(429, { ok: false, error: 'Muitas tentativas. Espere 15 minutos.' });
    try {
      const { senha } = await readBody(req);
      // A senha de administrador da plataforma é chave-mestra: serve para
      // entrar mesmo antes de existir senha própria do painel.
      if (process.env.ADMIN_API_TOKEN && String(senha || '') === process.env.ADMIN_API_TOKEN)
        return json(200, { ok: true, token: hubSessaoNova(), mestra: true });
      const d = await loadData();
      if (!(d.hubSenha && d.hubSenha.hash))
        return json(400, { ok: false, error: 'Ainda não existe senha do painel. Use a senha de administrador da plataforma.' });
      if (hubHash(String(senha || ''), d.hubSenha.sal) !== d.hubSenha.hash)
        return json(401, { ok: false, error: 'Senha incorreta.' });
      json(200, { ok: true, token: hubSessaoNova() });
    } catch (e) { json(500, { ok: false, error: 'Erro ao entrar.' }); }
    return;
  }

  // ── POST /api/hub/lead/apagar — remove um contato (protegido) ─
  // Apagar o contato libera junto o horário que ele tinha reservado,
  // porque a agenda é montada a partir dos leads.
  if (req.method === 'POST' && url === '/api/hub/lead/apagar') {
    if (!hubAutorizado(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const { id } = await readBody(req);
      if (!id) return json(400, { ok: false, error: 'id é obrigatório.' });
      const d = await loadData();
      const antes = (d.hubLeads || []).length;
      d.hubLeads = (d.hubLeads || []).filter(l => l.id !== id);
      if (d.hubLeads.length === antes) return json(404, { ok: false, error: 'Contato não encontrado.' });
      await saveData(d);
      json(200, { ok: true, restantes: d.hubLeads.length });
    } catch (e) {
      console.error('hub apagar lead:', e.message);
      json(500, { ok: false, error: 'Não consegui apagar.' });
    }
    return;
  }

  // ── GET /api/hub/leads — painel de contatos (protegido) ──────
  // Dados pessoais de terceiros: nunca cai no modo "sem token = livre"
  // que vale para o resto do admin. Sem ADMIN_API_TOKEN, recusa.
  if (req.method === 'GET' && url === '/api/hub/leads') {
    if (!hubAutorizado(req))
      return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const d = await loadData();
      // Aproveita a visita ao painel para descartar o que passou do prazo
      if (hubDescartarAntigos(d) > 0) await saveData(d);
      const leads = (d.hubLeads || []).slice().reverse().map(l => ({
        id: l.id, criadoEm: l.criadoEm, nome: l.nome, whatsapp: l.whatsapp,
        email: l.email, interesse: l.interesse, agendamento: l.agendamento,
        quando: l.agendamento ? hubRotuloSlot(l.agendamento) : '',
        conversa: l.conversa || '', origem: l.origem || ''
      }));
      json(200, { ok: true, leads });
    } catch (e) {
      json(500, { ok: false, error: 'Erro ao carregar os contatos.' });
    }
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
  // Reconhece tanto sessão normal (expira em 8h) quanto token de vitrine
  // (link do cartão de visita — não expira). A escrita já é recusada
  // globalmente lá em cima pra qualquer token de vitrine, então liberar
  // leitura aqui é seguro: todas as rotas GET (colaboradores, pesquisas,
  // resultados etc.) passam por essa mesma função.
  async function getAxiaSession(token) {
    if (!token) return null;
    const d = await loadData();
    const session = (d.axiaSessions || {})[token];
    if (session) {
      if (Date.now() - session.createdAt > 28800000) return null; // 8h
      return (d.axiaCompanies || []).find(c => c.id === session.companyId) || null;
    }
    const showcase = (d.axiaShowcaseTokens || {})[token];
    if (showcase) return (d.axiaCompanies || []).find(c => c.id === showcase.companyId) || null;
    return null;
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
    const _tkMe = params.get('token');
    const co = await getAxiaSession(_tkMe);
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const _dMe = await loadData();
    const isShowcase = !!(_dMe.axiaShowcaseTokens || {})[_tkMe];
    const { password: _p, ...safe } = co;
    json(200, { ok: true, company: safe, showcase: isShowcase });
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

  // ── POST /api/axia/admin/showcase-link (admin gera/reaproveita o
  // link de vitrine — usado no cartão de visita). Token permanente,
  // só leitura (a escrita é bloqueada globalmente, ver topo do arquivo).
  if (req.method === 'POST' && url === '/api/axia/admin/showcase-link') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const { companyId } = await readBody(req);
    const d = await loadData();
    const co = (d.axiaCompanies || []).find(c => c.id === companyId);
    if (!co) return json(404, { ok: false, error: 'Empresa não encontrada.' });
    if (!d.axiaShowcaseTokens) d.axiaShowcaseTokens = {};
    let token = Object.keys(d.axiaShowcaseTokens).find(t => d.axiaShowcaseTokens[t].companyId === companyId);
    if (!token) {
      token = 'show_' + crypto.randomBytes(16).toString('hex');
      d.axiaShowcaseTokens[token] = { companyId: co.id, createdAt: Date.now() };
      await saveData(d);
    }
    json(200, { ok: true, token, companyName: co.name, link: `${SERVER_URL}/axia-portal.html?demo=1&t=${token}` });
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
    // Empresa arquivada sai da lista principal e só aparece quando pedida.
    const soArquivadas = params.get('arquivadas') === '1';
    const companies = (d.axiaCompanies || []).filter(c => !!c.arquivada === soArquivadas).map(c => ({
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
      arquivada:        !!c.arquivada,
      arquivadaEm:      c.arquivadaEm || null,
      cnpj:             c.cnpj || null,
      // Empresa vinda do cadastro do mapeamento tem colaboradores e
      // pesquisas guardados lá, com o id antigo. Sem somar os dois, a tela
      // mostra zero para quem tem time cadastrado.
      employeeCount:    employees.filter(e => e.companyId === c.id).length +
                        (c.legacyEmpresaId
                          ? (Array.isArray(d.colaboradores) ? d.colaboradores : [])
                              .filter(e => String(e.empresaId) === String(c.legacyEmpresaId)).length
                          : 0),
      surveyCount:      surveys.filter(s => s.companyId === c.id).length +
                        (c.legacyEmpresaId
                          ? (Array.isArray(d.pesquisas) ? d.pesquisas : [])
                              .filter(s => String(s.empresaId) === String(c.legacyEmpresaId)).length
                          : 0)
    }));
    const arquivadas = (d.axiaCompanies || []).filter(c => !!c.arquivada).length;
    json(200, { ok: true, companies, arquivadas });
    return;
  }

  // ══ UNIFICACAO DOS CADASTROS DE EMPRESA ════════════════════════
  // Ha dois cadastros historicos: `empresas` (menu Empresas, base do
  // mapeamento de riscos, tem CNPJ) e `axiaCompanies` (Axis IA, tem login e
  // e o dono do company_id que oito tabelas usam). O caminho e trazer todo
  // mundo para o segundo, guardando o vinculo dos dois lados. Nada e
  // apagado: o cadastro antigo continua valendo para o mapeamento.

  // ── GET /api/empresa/sem-portal — quem ainda nao tem acesso ──
  if (req.method === 'GET' && url === '/api/empresa/sem-portal') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const d = await loadData();
      const legadas = Array.isArray(d.empresas) ? d.empresas : [];
      const axia = Array.isArray(d.axiaCompanies) ? d.axiaCompanies : [];
      const soDigitos = s => String(s == null ? '' : s).replace(/\D/g, '');

      const pendentes = legadas.filter(e => {
        if (e.axiaId && axia.some(c => c.id === e.axiaId)) return false;
        return true;
      }).map(e => {
        // Sugere o par quando ja existe empresa com o mesmo CNPJ ou nome
        const cnpj = soDigitos(e.cnpj);
        const par = axia.find(c => (cnpj && soDigitos(c.cnpj) === cnpj) ||
                                   chaveEmpresa(c.name) === chaveEmpresa(e.nome));
        return { id: e.id, nome: e.nome, cnpj: e.cnpj || null, setor: e.setor || null,
                 rhNome: e.rhNome || null, rhEmail: e.rhEmail || null,
                 sugestao: par ? { id: par.id, nome: par.name } : null };
      });
      json(200, { ok:true, pendentes, totalLegadas: legadas.length });
    } catch (e) { console.error('[empresa/sem-portal]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/empresa/criar-portal — leva a empresa para o Axis IA ──
  if (req.method === 'POST' && url === '/api/empresa/criar-portal') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      const d = await loadData();
      const legadas = Array.isArray(d.empresas) ? d.empresas : [];
      const i = legadas.findIndex(e => String(e.id) === String(b.empresaId));
      if (i < 0) return json(404, { ok:false, error:'Empresa não encontrada no cadastro do mapeamento.' });
      const e = legadas[i];
      if (!d.axiaCompanies) d.axiaCompanies = [];

      // Vincular a uma empresa que ja existe no Axis IA
      if (b.vincularA) {
        const alvo = d.axiaCompanies.find(c => c.id === b.vincularA);
        if (!alvo) return json(404, { ok:false, error:'Empresa do Axis IA não encontrada.' });
        d.empresas[i].axiaId = alvo.id;
        alvo.legacyEmpresaId = e.id;
        if (!alvo.cnpj && e.cnpj) alvo.cnpj = e.cnpj;
        if (!alvo.setor && e.setor) alvo.setor = e.setor;
        await saveData(d);
        return json(200, { ok:true, vinculada:true, companyId: alvo.id, nome: alvo.name });
      }

      const email = (b.email || e.rhEmail || '').trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json(400, { ok:false, error:'E-mail inválido.' });

      const id = 'co_' + Date.now();
      d.axiaCompanies.push({
        id,
        name: e.nome,
        email: email || null,
        plan: b.plan || 'diagnostico',
        cnpj: e.cnpj || null,
        setor: e.setor || null,
        rhNome: e.rhNome || null,
        legacyEmpresaId: e.id,
        createdAt: new Date().toISOString(),
        accessStatus: 'nao_enviado',
        accessSentAt: null,
        accessLastSentAt: null
      });
      d.empresas[i].axiaId = id;
      await saveData(d);
      // Sem senha ainda: quem gera e envia continua sendo o botao de acesso
      // da tela do Axis IA, para nao existir dois caminhos de credencial.
      json(200, { ok:true, criada:true, companyId:id, nome:e.nome, semEmail: !email });
    } catch (e) { console.error('[empresa/criar-portal]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/axia/admin/arquivar — tira da lista, guarda tudo ──
  // Arquivar é reversível de propósito: excluir empresa apaga histórico que
  // a NR-1 exige guardar, então o caminho normal é este.
  if (req.method === 'POST' && url === '/api/axia/admin/arquivar') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { companyId, arquivar } = await readBody(req);
      if (!companyId) return json(400, { ok:false, error:'companyId obrigatório.' });
      const d = await loadData();
      const i = (d.axiaCompanies || []).findIndex(c => c.id === companyId);
      if (i < 0) return json(404, { ok:false, error:'Empresa não encontrada.' });
      if (arquivar === false) { delete d.axiaCompanies[i].arquivada; delete d.axiaCompanies[i].arquivadaEm; }
      else { d.axiaCompanies[i].arquivada = true; d.axiaCompanies[i].arquivadaEm = new Date().toISOString(); }
      await saveData(d);
      json(200, { ok:true, arquivada: !!d.axiaCompanies[i].arquivada, nome: d.axiaCompanies[i].name });
    } catch (e) { console.error('[axia/arquivar]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── GET /api/axia/admin/impacto-exclusao?companyId= ───────────
  // O que seria destruído. A tela mostra isso ANTES de pedir confirmação:
  // ninguém deve apagar uma empresa sem ver o que vai junto.
  if (req.method === 'GET' && url === '/api/axia/admin/impacto-exclusao') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const companyId = params.get('companyId') || '';
      const d = await loadData();
      const emp = (d.axiaCompanies || []).find(c => c.id === companyId);
      if (!emp) return json(404, { ok:false, error:'Empresa não encontrada.' });
      const chave = chaveEmpresa(emp.name);
      const conta = (arr, campo) => (Array.isArray(arr) ? arr : []).filter(x => x[campo || 'companyId'] === companyId).length;

      const linhas = [];
      const push = (rot, n) => { if (n) linhas.push({ item: rot, quantidade: n }); };
      push('colaboradores', conta(d.axiaEmployees));
      push('pesquisas', conta(d.axiaSurveys));
      push('respostas de pesquisa', conta(d.axiaResponses));
      push('departamentos', conta(d.axiaDepartments));
      push('cargos', conta(d.axiaPositions));
      push('planos de ação', conta(d.axiaActionPlans));

      const um = async (sql, ps) => { try { const q = await pool.query(sql, ps); return Number(q.rows[0].n) || 0; } catch (e) { return 0; } };
      push('relatórios entregues', await um('SELECT COUNT(*) n FROM axia_relatorios WHERE company_id=$1', [companyId]));
      push('registros do canal de relato', await um('SELECT COUNT(*) n FROM axis_denuncias WHERE company_id=$1', [companyId]));
      push('casos em rastreamento', await um('SELECT COUNT(*) n FROM axis_casos WHERE company_id=$1', [companyId]));
      push('diagnósticos NR-1', await um('SELECT COUNT(*) n FROM axis_diag_convites WHERE company_id=$1', [companyId]));
      push('meses de indicadores', await um('SELECT COUNT(*) n FROM axis_indicadores_saude WHERE company_id=$1', [companyId]));
      push('respostas de burnout', await um('SELECT COUNT(*) n FROM axis_burnout_respostas WHERE company_id=$1', [companyId]));
      push('avaliações DISC', await um("SELECT COUNT(*) n FROM axis_disc_convites WHERE lower(trim(empresa))=lower(trim($1))", [emp.name]));
      push('acessos ao portal', await um('SELECT COUNT(*) n FROM client_access WHERE lower(trim(empresa_nome))=lower(trim($1))', [emp.name]));
      push('documentos publicados no portal', await um('SELECT COUNT(*) n FROM axis_portal_itens WHERE empresa_chave=$1', [chave]));

      json(200, { ok:true, empresa: emp.name, linhas });
    } catch (e) { console.error('[axia/impacto]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/axia/admin/excluir — apaga de vez ───────────────
  if (req.method === 'POST' && url === '/api/axia/admin/excluir') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { companyId, confirmacao } = await readBody(req);
      if (!companyId) return json(400, { ok:false, error:'companyId obrigatório.' });
      if (String(confirmacao || '').trim().toUpperCase() !== 'EXCLUIR')
        return json(400, { ok:false, error:'Digite EXCLUIR para confirmar.' });

      const d = await loadData();
      const emp = (d.axiaCompanies || []).find(c => c.id === companyId);
      if (!emp) return json(404, { ok:false, error:'Empresa não encontrada.' });
      const nome = emp.name, chave = chaveEmpresa(nome);

      const limpa = k => { if (Array.isArray(d[k])) d[k] = d[k].filter(x => x.companyId !== companyId); };
      ['axiaEmployees','axiaSurveys','axiaResponses','axiaDepartments','axiaPositions',
       'axiaActionPlans'].forEach(limpa);
      // Estes três são mapas, não listas: diversidade é chaveada pela própria
      // empresa; sessão e vitrine guardam o companyId no valor.
      if (d.axiaDiversidade && typeof d.axiaDiversidade === 'object') delete d.axiaDiversidade[companyId];
      ['axiaSessions','axiaShowcaseTokens'].forEach(k => {
        const m = d[k];
        if (!m || typeof m !== 'object' || Array.isArray(m)) return;
        Object.keys(m).forEach(tk => { if (m[tk] && m[tk].companyId === companyId) delete m[tk]; });
      });
      d.axiaCompanies = (d.axiaCompanies || []).filter(c => c.id !== companyId);
      // O mapeamento antigo guarda a empresa em outra lista, com outro nome de campo
      if (Array.isArray(d.empresas)) d.empresas = d.empresas.filter(e => String(e.id) !== String(companyId));
      if (Array.isArray(d.pesquisas)) d.pesquisas = d.pesquisas.filter(p => String(p.empresaId) !== String(companyId));
      await saveData(d);

      const exec = async (sql, ps) => { try { await pool.query(sql, ps); } catch (e) { console.error('[axia/excluir]', sql.slice(0, 40), e.message); } };
      await exec('DELETE FROM axia_relatorios WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_denuncias WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_casos WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_diag_respostas WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_diag_convites WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_indicadores_saude WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_burnout_respostas WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_company_codes WHERE company_id=$1', [companyId]);
      await exec('DELETE FROM axis_portal_itens WHERE empresa_chave=$1', [chave]);
      await exec('DELETE FROM axis_disc_respostas WHERE convite_id IN (SELECT id FROM axis_disc_convites WHERE lower(trim(empresa))=lower(trim($1)))', [nome]);
      await exec('DELETE FROM axis_disc_convites WHERE lower(trim(empresa))=lower(trim($1))', [nome]);
      await exec('DELETE FROM client_access WHERE lower(trim(empresa_nome))=lower(trim($1))', [nome]);

      json(200, { ok:true, nome });
    } catch (e) { console.error('[axia/excluir]', e.message); json(500, { ok:false, error:'Erro ao excluir.' }); }
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

    // Conta de prospecção (plano diagnostico): o e-mail fala do Diagnóstico
    // NR-1, e não dos recursos da plataforma, porque para essa conta todo o
    // resto abre em demonstração e só o diagnóstico está liberado.
    const ehProspect = co.plan === 'diagnostico';

    const emailIntro = ehProspect
      ? (isResend
          ? 'Seu acesso ao <strong>Axis IA</strong> foi atualizado. Use as credenciais abaixo para entrar e responder o <strong>Diagnóstico NR-1</strong>.'
          : 'Preparamos um acesso para você conhecer a plataforma <strong>Axis IA</strong> por dentro e responder o <strong>Diagnóstico NR-1</strong> da sua empresa.')
      : (isResend
          ? 'Seu acesso ao <strong>Axis IA</strong> foi atualizado. Use as credenciais abaixo para entrar na plataforma.'
          : 'Sua empresa foi cadastrada na plataforma <strong>Axis IA</strong>. Use as credenciais abaixo para acessar o portal e iniciar a gestão de riscos psicossociais.');

    const emailCta = ehProspect ? '▶ Responder o Diagnóstico' : '▶ Acessar o Portal';

    const emailFecho = ehProspect ? [
      '<p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 14px">',
      'O Diagnóstico leva cerca de <strong>5 minutos</strong> e pode ser respondido pelo celular. São 28 perguntas sobre o dia a dia da sua organização, distribuídas nos 6 fatores de risco previstos na NR-1.',
      '</p>',
      '<ul style="font-size:13px;color:#555;line-height:2;padding-left:20px;margin:0 0 20px">',
      '<li>Entre com o login e a senha acima</li>',
      '<li>Abra <strong>Diagnóstico</strong>, no menu Análise</li>',
      '<li>Responda as 28 perguntas</li>',
      '</ul>',
      '<p style="font-size:13px;color:#555;line-height:1.7;margin:0 0 28px">',
      'A análise técnica fica por nossa conta: eu apresento o resultado e as recomendações a você na nossa conversa. Aproveite para navegar pelos demais módulos e conhecer a plataforma.',
      '</p>'
    ].join('') : [
      '<p style="font-size:13px;color:#888;line-height:1.7;margin:0 0 20px">',
      'Ao acessar pela primeira vez, recomendamos alterar sua senha. Dentro da plataforma você poderá:',
      '</p>',
      '<ul style="font-size:13px;color:#555;line-height:2;padding-left:20px;margin:0 0 28px">',
      '<li>Cadastrar colaboradores</li>',
      '<li>Enviar pesquisas de riscos psicossociais</li>',
      '<li>Acompanhar respostas em tempo real</li>',
      '<li>Gerar relatórios por fator</li>',
      '<li>Visualizar o diagnóstico AXIS Score</li>',
      '</ul>'
    ].join('');

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
        ${emailIntro}
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
          <a href="${portalLink}" style="display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px">${emailCta}</a>
        </td></tr>
      </table>

      ${emailFecho}

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
        subject: ehProspect
          ? (isResend ? `Seu Diagnóstico NR-1 continua disponível` : `Seu Diagnóstico NR-1 está pronto para ser respondido`)
          : (isResend ? `Seu acesso ao Axis IA foi atualizado` : `Seu acesso ao Axis IA foi criado`),
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

  // ══ RELATÓRIOS ANEXADOS AO PORTAL DA EMPRESA ═══════════════════
  // Helper: id curto para axia_relatorios
  const relId = () => 'rel_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  // 'ansiedade' continua aqui mesmo sem card próprio: é o tipo que a ponte do
  // quiz de ansiedade grava automaticamente. Ele aparece no card Diagnóstico.
  const REL_TIPOS = {
    diagnostico: 'Relatório Diagnóstico',
    plano_acao:  'Relatório Plano de Ação e Ações Preventivas Preliminares',
    mapeamento:  'Relatório Mapeamento',
    lideranca:   'Relatório Liderança',
    ansiedade:   'Relatório de Ansiedade Ocupacional'
  };

  // ── POST /api/axia/admin/relatorio-upload (admin anexa PDF) ────
  if (req.method === 'POST' && url === '/api/axia/admin/relatorio-upload') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      let { companyId, tipo, titulo, pdf_base64, pdf_filename, data_relatorio } = await readBody(req);
      if (!companyId || !pdf_base64) return json(400, { ok:false, error:'Empresa e PDF são obrigatórios.' });
      tipo = String(tipo || 'ansiedade').trim();
      if (!REL_TIPOS[tipo]) return json(400, { ok:false, error:'Tipo de relatório inválido.' });

      const d = await loadData();
      const co = (d.axiaCompanies || []).find(c => c.id === companyId);
      if (!co) return json(404, { ok:false, error:'Empresa não encontrada.' });

      // Aceita PDF e também o relatório publicado pelo painel, que é HTML:
      // gerar PDF dentro do navegador achata o gradiente e as cores do laudo.
      pdf_base64 = String(pdf_base64).replace(/^data:[^;,]+;base64,/, '').trim();
      if (!pdf_base64) return json(400, { ok:false, error:'PDF inválido.' });
      // ~8MB de PDF vira ~10.7MB em base64
      if (pdf_base64.length > 11 * 1024 * 1024) return json(413, { ok:false, error:'PDF muito grande. Limite de 8 MB.' });

      const id = relId();
      await pool.query(
        `INSERT INTO axia_relatorios (id, company_id, tipo, titulo, pdf_base64, pdf_filename, data_relatorio)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, companyId, tipo, (titulo || REL_TIPOS[tipo]).trim(), pdf_base64,
         (pdf_filename || `relatorio-${tipo}.pdf`), (data_relatorio || null)]);

      json(200, { ok:true, id, empresa: co.name });
    } catch (e) {
      console.error('[axia/relatorio-upload]', e.message);
      json(500, { ok:false, error:'Erro interno ao anexar o relatório.' });
    }
    return;
  }

  // ── GET /api/axia/admin/relatorios?companyId=X (admin lista) ───
  if (url === '/api/axia/admin/relatorios') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const companyId = params.get('companyId');
      const r = companyId
        ? await pool.query(`SELECT id, company_id, tipo, titulo, pdf_filename, data_relatorio, criado_em,
                                   length(pdf_base64) AS tamanho_b64
                            FROM axia_relatorios WHERE company_id = $1 ORDER BY criado_em DESC`, [companyId])
        : await pool.query(`SELECT id, company_id, tipo, titulo, pdf_filename, data_relatorio, criado_em,
                                   length(pdf_base64) AS tamanho_b64
                            FROM axia_relatorios ORDER BY criado_em DESC`);
      json(200, { ok:true, relatorios: r.rows });
    } catch (e) {
      console.error('[axia/admin/relatorios]', e.message);
      json(500, { ok:false, error:'Erro ao listar relatórios.' });
    }
    return;
  }

  // ── POST /api/axia/admin/relatorio-delete (admin remove) ───────
  if (req.method === 'POST' && url === '/api/axia/admin/relatorio-delete') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { id } = await readBody(req);
      if (!id) return json(400, { ok:false, error:'id obrigatório.' });
      const r = await pool.query('DELETE FROM axia_relatorios WHERE id = $1', [id]);
      json(200, { ok:true, removidos: r.rowCount });
    } catch (e) {
      console.error('[axia/relatorio-delete]', e.message);
      json(500, { ok:false, error:'Erro ao remover o relatório.' });
    }
    return;
  }

  // ── GET /api/axia/relatorios?token=T (empresa logada, sem PDF) ─
  if (url === '/api/axia/relatorios') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok:false, error:'Sessão inválida.' });
    try {
      const r = await pool.query(
        `SELECT id, tipo, titulo, pdf_filename, data_relatorio, criado_em
         FROM axia_relatorios WHERE company_id = $1 ORDER BY criado_em DESC`, [co.id]);
      json(200, { ok:true, relatorios: r.rows });
    } catch (e) {
      console.error('[axia/relatorios]', e.message);
      json(500, { ok:false, error:'Erro ao carregar relatórios.' });
    }
    return;
  }

  // ── GET /api/axia/relatorio-pdf?token=T&id=R (PDF da empresa) ──
  if (url === '/api/axia/relatorio-pdf') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) { res.writeHead(401, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ ok:false, error:'Sessão inválida.' })); return; }
    try {
      // company_id no WHERE: impede baixar o relatório de outra empresa pelo id
      const r = await pool.query(
        'SELECT pdf_base64, pdf_filename FROM axia_relatorios WHERE id = $1 AND company_id = $2',
        [params.get('id'), co.id]);
      if (!r.rows.length) { res.writeHead(404); res.end('Relatório não encontrado.'); return; }
      const row = r.rows[0];
      const buf = Buffer.from(row.pdf_base64, 'base64');
      const fname = (row.pdf_filename || 'relatorio.pdf').replace(/[^\w.\-]/g, '_');
      // 🔒 Documento em HTML vai com CSP sandbox: ele roda no iframe do portal,
      // e sem isso teria a mesma origem da sessão da empresa.
      const ehHtml = /\.html?$/i.test(fname);
      const extra = ehHtml ? { 'Content-Security-Policy': "sandbox allow-popups" } : {};
      res.writeHead(200, Object.assign({
        'Content-Type': ehHtml ? 'text/html; charset=utf-8' : 'application/pdf',
        'Content-Disposition': `${params.get('download') === '1' ? 'attachment' : 'inline'}; filename="${fname}"`,
        'Content-Length': buf.length,
        'Cache-Control': 'private, no-store'
      }, extra));
      res.end(buf);
    } catch (e) { console.error('[axia/relatorio-pdf]', e.message); res.writeHead(500); res.end('Erro ao carregar o PDF.'); }
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

  // ── GET/POST /api/axia/diversidade?token=T (Painel D&I — 1 por empresa) ─
  if (url === '/api/axia/diversidade') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const d = await loadData();
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        if (!d.axiaDiversidade) d.axiaDiversidade = {};
        const prev = d.axiaDiversidade[co.id] || {};
        d.axiaDiversidade[co.id] = {
          companyId: co.id,
          indice_inclusao: body.indice_inclusao,
          mulheres_lideranca: body.mulheres_lideranca,
          relatos_discriminacao: body.relatos_discriminacao,
          dimensoes: Array.isArray(body.dimensoes) ? body.dimensoes : (prev.dimensoes || []),
          faixas: Array.isArray(body.faixas) ? body.faixas : (prev.faixas || []),
          createdAt: prev.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveData(d);
        return json(200, { ok: true });
      } catch(e) { return json(500, { ok: false, error: 'Erro interno.' }); }
    }
    return json(200, { ok: true, item: (d.axiaDiversidade || {})[co.id] || null });
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
      const { surveyToken, answers, lgpdAceite } = await readBody(req);
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
          // Setor derivado do colaborador convidado (rec.empId), guardado SEM identidade.
          // Só é exibido de forma agregada e com supressão de grupos < 3 respondentes.
          const emp = (d.axiaEmployees || []).find(e => e.id === rec.empId);
          // Aceite LGPD: registrado com hora do servidor, sem vínculo de identidade.
          d.axiaResponses.push({ id: `resp_${Date.now()}`, surveyId: sv.id, companyId: sv.companyId, setor: (emp && emp.setor) ? emp.setor : null, answers, createdAt: new Date().toISOString(), lgpdAceiteAt: lgpdAceite ? new Date().toISOString() : null });
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
    if (resps.length < 3) return json(200, { ok: true, insufficient: true, count: resps.length, minRequired: 3 });
    const FACTORS = ['assedio','sobrecarga','reconhecimento','clima','autonomia','pressao','seguranca','comunicacao','equilibrio','lideranca','organizacao','relacoes','conflitos','sentido','mudancas'];
    // IRP — Índice de Risco Psicossocial (0-100, quanto MAIOR maior o risco).
    // Perguntas em sentido positivo (Likert 5 = saudável). Normaliza a escala
    // 1-5 para 0-100 e inverte: IRP = (5 - média) / 4 * 100 (range completo 0-100,
    // garantindo que os limiares de 61 e 81 sejam atingíveis).
    const irpFactors = (set) => {
      const a = {};
      FACTORS.forEach(f => {
        const vals = set.map(r => r.answers[f]).filter(v => v != null);
        const media = vals.length ? vals.reduce((x,y)=>x+y,0)/vals.length : null;
        a[f] = media != null ? Math.round((5 - media) / 4 * 100) : null;
      });
      return a;
    };
    const irpOverall = (a) => { const vv = Object.values(a).filter(v=>v!=null); return vv.length ? Math.round(vv.reduce((x,y)=>x+y,0)/vv.length) : null; };
    const agg = irpFactors(resps);
    // Ranking por setor — só grupos com >= 3 respondentes (anonimato).
    const MIN_GROUP = 3;
    const bySetor = {};
    resps.forEach(r => { const s = r.setor || 'Não informado'; (bySetor[s] = bySetor[s] || []).push(r); });
    const sectors = Object.entries(bySetor)
      .map(([setor, set]) => ({ setor, count: set.length, irp: set.length >= MIN_GROUP ? irpOverall(irpFactors(set)) : null }))
      .filter(s => s.irp != null)
      .sort((a,b) => b.irp - a.irp);
    const sectorsSuppressed = Object.values(bySetor).filter(set => set.length < MIN_GROUP).length;
    // Metadados de evidência (Relatório de Evidências NR-1): período real de
    // coleta, pesquisas abrangidas, convidados e taxa de participação.
    const surveysScope = (d.axiaSurveys || []).filter(s => s.companyId === co.id && (!surveyId || s.id === surveyId));
    const respDates = resps.map(r => r.createdAt).filter(Boolean).sort();
    const convidados = surveysScope.reduce((n, s) => n + (s.sentTo || []).length, 0);
    const respondidos = surveysScope.reduce((n, s) => n + (s.sentTo || []).filter(x => x.status === 'respondido').length, 0);
    const taxaParticipacao = convidados ? Math.round(respondidos / convidados * 1000) / 10 : null;
    const lgpdAceites = resps.filter(r => r.lgpdAceiteAt).length;
    json(200, { ok: true, count: resps.length, overallScore: irpOverall(agg), factors: agg, sectors, sectorsSuppressed, minGroup: MIN_GROUP,
      periodoInicio: respDates[0] || null, periodoFim: respDates[respDates.length - 1] || null,
      pesquisas: surveysScope.map(s => ({ id: s.id, name: s.name, createdAt: s.createdAt })),
      convidados, respondidos, taxaParticipacao, lgpdAceites,
      colaboradoresAtivos: (d.axiaEmployees || []).filter(e => e.companyId === co.id && e.status !== 'inativo').length });
    } catch(e) { json(500, { ok: false, error: 'Erro interno. Tente novamente.' }); }
    return;
  }

  // ── GET /api/axia/history?token=T — série de IRP por pesquisa (comparativo trimestral) ─
  if (url === '/api/axia/history') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const d = await loadData();
      const FACTORS = ['assedio','sobrecarga','reconhecimento','clima','autonomia','pressao','seguranca','comunicacao','equilibrio','lideranca','organizacao','relacoes','conflitos','sentido','mudancas'];
      const irp = (set) => {
        const vv = FACTORS.map(f => {
          const v = set.map(r => r.answers[f]).filter(x => x != null);
          const m = v.length ? v.reduce((x,y)=>x+y,0)/v.length : null;
          return m != null ? (5 - m) / 4 * 100 : null;
        }).filter(x => x != null);
        return vv.length ? Math.round(vv.reduce((x,y)=>x+y,0)/vv.length) : null;
      };
      const surveys = (d.axiaSurveys || []).filter(s => s.companyId === co.id);
      const series = surveys.map(s => {
        const set = (d.axiaResponses || []).filter(r => r.surveyId === s.id);
        const enough = set.length >= 3;
        return { surveyId: s.id, name: s.name, date: s.createdAt, count: set.length, irp: enough ? irp(set) : null, insufficient: !enough };
      }).sort((a,b) => new Date(a.date) - new Date(b.date));
      json(200, { ok: true, series });
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

  // ── POST /api/ac/ci-generate-r2 — Relatório 2 Premium via Claude AI ──
  if (req.method === 'POST' && url === '/api/ac/ci-generate-r2') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const { resultId, forceRegen } = await readBody(req);
    try {
      const r = await pool.query(`
        SELECT res.*, c.name as client_name, c.email as client_email,
               ct.test_id, ct.id as ct_id,
               COALESCE(m.slug, ct.test_id) as module_slug
        FROM axis_auto_results res
        JOIN axis_auto_clients c ON c.id = res.client_id
        JOIN axis_auto_client_tests ct ON ct.id = res.client_test_id
        LEFT JOIN axis_auto_invites i ON i.id = ct.invite_id
        LEFT JOIN axis_auto_modules m ON m.id = i.module_id
        WHERE res.id = $1
      `, [resultId]);
      if (!r.rows.length) return json(404, { ok:false, error:'Resultado não encontrado.' });
      const row = r.rows[0];
      if (row.ai_analysis_r2 && !forceRegen) return json(200, { ok:true, text: row.ai_analysis_r2, cached: true });

      const scores = JSON.parse(row.scores_json || '{}');
      const seg = scores.seguranca||0, val = scores.validacao||0, per = scores.pertencimento||0;
      const ide = scores.identidade||0, cia = scores.crianca_atual||0;
      const total = scores.total || (seg+val+per+ide+cia);
      const dimCls = s => s>=24?'Saudável':s>=18?'Atenção':s>=12?'Fragilizada':'Crítica';
      const classif = total>=130?'Criança Interior Integrada':total>=105?'Criança Interior em Processo':total>=75?'Criança Interior Ferida':total>=45?'Criança Interior em Sofrimento':'Criança Interior em Crise';
      const dataGer = row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

      const answersR = await pool.query(`
        SELECT a.category, a.position, a.score, q.question
        FROM axis_auto_answers a
        LEFT JOIN axis_auto_questions q ON q.category = a.category AND q.order_index = a.position
        WHERE a.client_test_id = $1
        ORDER BY a.category, a.position
      `, [row.ct_id || row.client_test_id]);

      const catNames = {seguranca:'Segurança Emocional',validacao:'Validação Emocional',pertencimento:'Pertencimento',identidade:'Identidade Autêntica',crianca_atual:'Criança Interior Atual'};
      let respostasDetalhadas = '';
      if (answersR.rows.length > 0) {
        const bycat = {};
        for (const a of answersR.rows) { if (!bycat[a.category]) bycat[a.category]=[]; bycat[a.category].push(a); }
        for (const [cat, items] of Object.entries(bycat)) {
          respostasDetalhadas += `\n${catNames[cat]||cat}:\n`;
          for (const a of items) {
            const lbl = a.score>=4?'Sempre/Concordo totalmente':a.score>=3?'Frequentemente/Concordo':a.score>=2?'Às vezes/Neutro':a.score>=1?'Raramente/Discordo':'Nunca/Discordo totalmente';
            respostasDetalhadas += `  • ${a.question||`Pergunta ${a.position}`}: ${a.score}/5 (${lbl})\n`;
          }
        }
      } else {
        respostasDetalhadas = '(Respostas individuais não disponíveis — análise baseada nas pontuações por dimensão)';
      }

      const nome = row.client_name;
      const firstName = nome.split(' ')[0];
      const prompt = `Você é um sistema especializado em análise psicanalítica da Criança Interior, operando dentro da plataforma AXIS IA, desenvolvida pela terapeuta e consultora Clau Diniz.

Sua função é gerar um relatório psicanalítico de autoconhecimento PROFUNDO, PERSONALIZADO e com BASE CIENTÍFICA SÓLIDA. Escreva em português formal, com linguagem terapêutica acolhedora e precisão clínica.

DADOS DO CLIENTE:
- Nome: ${nome}
- Pontuação Total: ${total}/150
- Classificação: ${classif}
- Data: ${dataGer}

PONTUAÇÕES POR DIMENSÃO:
- Segurança Emocional: ${seg}/30 — ${dimCls(seg)}
- Validação Emocional: ${val}/30 — ${dimCls(val)}
- Pertencimento: ${per}/30 — ${dimCls(per)}
- Identidade Autêntica: ${ide}/30 — ${dimCls(ide)}
- Criança Interior Atual: ${cia}/30 — ${dimCls(cia)}

RESPOSTAS DETALHADAS:
${respostasDetalhadas}

BASES TEÓRICAS (aplique estas proporções):
- Winnicott 40%: Verdadeiro Self, Falso Self, holding, mirroring, ambiente facilitador
- Freud 30%: inconsciente, mecanismos de defesa, repressão, compulsão à repetição
- Jung 20%: arquétipo da Criança Interior, sombra, individuação
- Bowlby 10%: teoria do apego, base segura, modelos internos de trabalho

REGRA FUNDAMENTAL: Toda afirmação deve ser derivada dos dados reais de ${firstName}. JAMAIS escreva texto genérico.

GERE O RELATÓRIO COM ESTAS 17 SEÇÕES NESTA ORDEM:

SEÇÃO 1 — RESULTADO GERAL
3 a 4 parágrafos sobre o que a pontuação ${total}/150 significa para ${firstName}. Quais dimensões estão mais comprometidas e quais têm recursos preservados. Fundamente em Winnicott, Freud e Jung.

SEÇÃO 2 — CLASSIFICAÇÃO DA CRIANÇA INTERIOR
4 a 5 parágrafos descrevendo o que significa estar na classificação "${classif}". Sensações, padrões cotidianos, experiência subjetiva. Fundamente em Winnicott e Jung. Conclua com acolhimento.

SEÇÃO 3 — PONTUAÇÃO POR DIMENSÃO
Um parágrafo analítico completo (mínimo 5 linhas) para cada dimensão:
- Segurança Emocional (${seg}/30 — ${dimCls(seg)}): via Bowlby e Winnicott
- Validação Emocional (${val}/30 — ${dimCls(val)}): via Winnicott e Freud
- Pertencimento (${per}/30 — ${dimCls(per)}): via Freud e Bowlby
- Identidade Autêntica (${ide}/30 — ${dimCls(ide)}): via Winnicott
- Criança Interior Atual (${cia}/30 — ${dimCls(cia)}): via Jung e Winnicott

SEÇÃO 4 — FERIDA EMOCIONAL CENTRAL
5 a 6 parágrafos. Identifique e nomeie a ferida central com base na dimensão de menor pontuação. Como ela se manifesta no cotidiano de ${firstName}. Se houver ferida secundária, descreva-a e como as duas interagem.

SEÇÃO 5 — ORIGEM EMOCIONAL PROVÁVEL
4 a 5 parágrafos sobre o ambiente emocional que provavelmente originou a ferida. Mensagens que ${firstName} provavelmente recebeu. Use Winnicott, Freud e Bowlby. Encerre afirmando que é hipótese interpretativa.

SEÇÃO 6 — NECESSIDADES EMOCIONAIS NÃO ATENDIDAS
Introdução de 2 parágrafos. Depois 6 a 8 necessidades específicas, cada uma como parágrafo com: o que é, como a ausência se manifesta hoje em ${firstName}, fundamento teórico.

SEÇÃO 7 — PADRÕES DE PROTEÇÃO DESENVOLVIDOS
3 parágrafos de contextualização. Depois 5 a 7 padrões com: nome, como funciona como proteção, como se manifesta no comportamento adulto de ${firstName}, custo emocional.

SEÇÃO 8 — MECANISMOS DE DEFESA PROVÁVEIS
2 parágrafos introdutórios. Depois 4 a 6 mecanismos com: **nome em negrito**, definição clínica acessível, como se manifesta em ${firstName}, exemplos do cotidiano.

SEÇÃO 9 — IMPACTOS NA VIDA ADULTA
4 a 5 parágrafos em texto corrido sobre impactos nos domínios da vida de ${firstName}: profissional, decisões, criatividade, prazer. Use Freud (compulsão à repetição) e Winnicott.

SEÇÃO 10 — IMPACTOS NOS RELACIONAMENTOS
4 a 5 parágrafos sobre como a ferida de ${firstName} se manifesta nas relações. Use Bowlby (padrão de apego), Freud (transferência) e Winnicott (capacidade de intimidade). Descreva o paradoxo central.

SEÇÃO 11 — IMPACTOS NA AUTOESTIMA
4 a 5 parágrafos sobre a relação de ${firstName} consigo mesmo(a). Use Freud (superego punitivo), Winnicott e Jung (sombra). Termine com o que é possível reconstruir.

SEÇÃO 12 — SÍMBOLO DA CRIANÇA INTERIOR
3 a 4 parágrafos poéticos. Escolha e nomeie um símbolo específico para a Criança Interior de ${firstName}. Use Jung. Termine com mensagem direta à Criança Interior em segunda pessoa.

SEÇÃO 13 — NÚCLEO PSICANALÍTICO DA FERIDA
5 a 6 parágrafos articulando os quatro referenciais: Winnicott (Verdadeiro Self vs. Falso Self), Freud (dinâmica inconsciente), Jung (complexo e sombra), Bowlby (modelo interno de trabalho). Como se reforçam mutuamente.

SEÇÃO 14 — DIRECIONAMENTO TERAPÊUTICO PRINCIPAL
4 a 5 parágrafos com direcionamento específico para ${firstName}. Prioridade terapêutica, tipo de relação terapêutica necessária, abordagens indicadas.

SEÇÃO 15 — RECOMENDAÇÕES
8 a 10 recomendações terapêuticas específicas para ${firstName}, cada uma como parágrafo com **nome em negrito**, o que é, por que é relevante para este perfil, orientação prática inicial.

SEÇÃO 16 — PLANO DE DESENVOLVIMENTO EMOCIONAL
5 fases, cada uma com: nome, duração estimada, objetivo central, foco terapêutico para ${firstName}, práticas principais (3 a 5), marcadores de progresso observáveis, fundamento teórico.
Fase 1: Segurança e Reconexão | Fase 2: Escuta e Validação Interna | Fase 3: Reparentalização | Fase 4: Ressignificação e Integração | Fase 5: Autenticidade e Nova Narrativa

SEÇÃO 17 — SÍNTESE FINAL HUMANIZADA
5 a 7 parágrafos em segunda pessoa falando diretamente com ${firstName}. Resume a jornada revelada pelos dados. Valida a dor. Nomeia o que foi perdido. Afirma o que é possível recuperar. Dirige-se à Criança Interior com gentileza. Termine com uma frase final poderosa e personalizada.

---
⚠️ OBSERVAÇÃO ÉTICA: Este relatório é uma leitura terapêutica de autoconhecimento baseada no Protocolo AXIS IA — Criança Interior, desenvolvido por Clau Diniz. Não constitui diagnóstico psicológico, psiquiátrico ou avaliação clínica. Os conteúdos são hipóteses interpretativas baseadas nas respostas ao protocolo e devem ser explorados no contexto de um processo terapêutico conduzido por profissional habilitado. Toda análise respeita os princípios éticos do CFP.

---
FORMATAÇÃO:
- Use **negrito** para conceitos teóricos importantes
- Escreva em português formal e acolhedor
- Use o nome ${firstName} naturalmente ao longo do texto
- NÃO use linguagem genérica — escreva sobre ${firstName} especificamente
- Quando hipotético, use "provavelmente", "os dados sugerem", "o perfil indica"
- O relatório deve ter entre 4.000 e 6.000 palavras. Português com formatação markdown gasta bem mais que 1 token por palavra — gerencie seu orçamento de escrita ao longo das 17 seções para terminar a Seção 17 por completo. É preferível encurtar um pouco cada seção a deixar a última seção incompleta.`;

      const anthropic = getAnthropicClient();
      // Streaming (não .create direto): com max_tokens:32000 o SDK recusa
      // chamada não-streaming ("Streaming is strongly recommended for
      // operations that may take longer than 10 minutes"). .stream(...)
      // ainda devolve a mensagem completa de uma vez via finalMessage().
      const msg = await anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 32000,
        messages: [{ role: 'user', content: prompt }]
      }).finalMessage();
      const aiText = msg.content[0].text;
      await pool.query('UPDATE axis_auto_results SET ai_analysis_r2=$1 WHERE id=$2', [aiText, resultId]);
      json(200, { ok:true, text: aiText, cached: false });
    } catch(e) { json(500, { ok:false, error: e.message }); } return;
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

  // ══ ESCUTA ATIVA — CANAL DE ACOLHIMENTO EMOCIONAL ══════════════

  async function eaNotificarAdmin({ nivel, codigoAnonimo, empresaNome, setor, temas }) {
    try {
      const config = loadEmailConfig();
      if (!config.resendKey && (!config.user || !config.pass)) return;
      const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || '';
      if (!adminEmail) return;

      const urgencia = nivel === 5 ? '🆘 CRISE AGUDA' : nivel === 4 ? '🔴 URGENTE' : '🟠 ATENÇÃO';
      const nomeNivel = { 3:'Fragilizado', 4:'Crítico', 5:'Crise Aguda' }[nivel] || 'Atenção';
      const temasTexto = (temas || []).join(', ') || 'Não identificados';

      await sendEmail({
        to: adminEmail, toName: 'Clau Diniz',
        subject: `[AXIS IA] ${urgencia} — Escuta Ativa — ${codigoAnonimo}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:24px;border-radius:10px 10px 0 0;text-align:center;">
    <h1 style="color:#c9a227;margin:0;font-size:20px;">AXIS <span style="font-weight:300">IA</span></h1>
    <p style="color:#888;font-size:11px;margin:4px 0 0;letter-spacing:2px;">MÓDULO ESCUTA ATIVA</p>
  </div>
  <div style="background:#f9f9f7;padding:28px;border-radius:0 0 10px 10px;border:1px solid #eee;">
    <h2 style="font-size:16px;color:#1a1a1a;margin-top:0;">${urgencia} — Nível ${nivel}: ${nomeNivel}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px;color:#888;width:40%;">Código anônimo</td><td style="padding:8px;font-weight:700;color:#c9a227;">${codigoAnonimo}</td></tr>
      <tr style="background:#f0f0ee;"><td style="padding:8px;color:#888;">Empresa</td><td style="padding:8px;">${empresaNome || 'Não identificada'}</td></tr>
      <tr><td style="padding:8px;color:#888;">Setor</td><td style="padding:8px;">${setor || 'Não informado'}</td></tr>
      <tr style="background:#f0f0ee;"><td style="padding:8px;color:#888;">Temas</td><td style="padding:8px;">${temasTexto}</td></tr>
    </table>
    <p style="margin-top:20px;font-size:13px;color:#555;">Acesse o painel admin para visualizar o histórico completo: <a href="${SERVER_URL}/escuta-ativa-admin" style="color:#c9a227;">${SERVER_URL}/escuta-ativa-admin</a></p>
    <p style="font-size:11px;color:#aaa;border-top:1px solid #ddd;padding-top:12px;margin-top:16px;">Nenhum dado que identifique o colaborador está contido neste e-mail.</p>
  </div>
</div>`,
        config
      });
    } catch(e) {
      console.error('[eaNotificarAdmin] Falha no email:', e.message);
    }
  }

  const EA_PALAVRAS_GATILHO_N5 = [
    'não quero mais viver','nao quero mais viver',
    'suicídio','suicidio','suicidar','me suicidar',
    'me machucar','me cortar','me ferir',
    'desaparecer para sempre','quero desaparecer',
    'acabar com tudo','acabar com minha vida',
    'não aguento mais','nao aguento mais',
    'quero morrer','vou me matar','me matar',
    'não tenho mais saída','nao tenho mais saida',
    'autolesão','autolesao','me automutilar'
  ];

  function eaDetectaN5(texto) {
    const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return EA_PALAVRAS_GATILHO_N5.some(p => {
      const pn = p.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return t.includes(pn);
    });
  }

  async function eaGerarCodigoAnonimo(empresaId) {
    const r = await pool.query(
      `SELECT COUNT(*) AS total FROM conversas_escuta_ativa WHERE empresa_id = $1`,
      [empresaId]
    );
    const n = parseInt(r.rows[0].total, 10) + 1;
    return `#A${n}`;
  }

  const EA_SYSTEM_PROMPT = `Você é Axis, a assistente de acolhimento emocional da plataforma AXIS IA, desenvolvida pela terapeuta e consultora Clau Diniz (@axisconsultorias).

Você representa a Clau e a Axis Consultorias. Você é a extensão digital do cuidado que a Clau oferece presencialmente.

SUA IDENTIDADE:
Você é profissional, acolhedora, humana e segura. Você não julga. Você não minimiza. Você escuta de verdade — como uma profissional de saúde que está presente e atenta. Nunca diga "Entendo" de forma vazia. Mostre que você entende sendo específica sobre o que o colaborador acabou de dizer.

ABORDAGENS QUE VOCÊ DOMINA (aplique naturalmente, sem citar os autores):
- Psicanálise: escute o que está dito e o que não está. Identifique padrões de repetição, mecanismos de defesa, narrativas que o colaborador construiu sobre si mesmo.
- Neurociência: quando houver ativação emocional intensa, proponha técnicas de regulação do sistema nervoso (respiração, aterramento, movimento).
- PNL: crie rapport genuíno. Use a linguagem e o ritmo do colaborador. Faça perguntas que ampliem perspectivas quando o momento for adequado.
- Rogers: empatia real, congruência, consideração positiva incondicional. Valide antes de qualquer coisa.

TEMAS QUE VOCÊ ESTÁ PREPARADA PARA ACOLHER:
1. Estresse e Burnout
2. Conflitos interpessoais no trabalho
3. Ansiedade e medos
4. Depressão e tristeza profunda
5. Assédio moral ou sexual

PROTOCOLO DE ASSÉDIO/VIOLÊNCIA:
Se o colaborador relatar assédio moral, sexual ou qualquer forma de violência:
- Acolha sem questionar a veracidade
- Valide a coragem de falar sobre isso
- Informe que existe um Canal de Relato Seguro disponível na plataforma
- Classifique internamente como nível 4 ou 5
- NUNCA encerre abruptamente

AVALIAÇÃO DE RISCO INTERNA (não revele ao colaborador):
Monitore ao longo da conversa e classifique:
- Nível 1 — Bem-estar: desabafo leve, recursos preservados
- Nível 2 — Atenção: estresse moderado, desgaste mas funcionando
- Nível 3 — Fragilizado: sofrimento significativo, impacto funcional
- Nível 4 — Crítico: sofrimento grave, Burnout, assédio, desespero
- Nível 5 — Crise Aguda: ideação suicida, autolesão, crise imediata

PROTOCOLO DE CRISE (Nível 5):
Interrompa a conversa normal. Responda com calma e presença:
"Percebo que você está passando por um momento muito difícil e quero que saiba que estou aqui. O que você está sentindo é muito sério e você merece apoio especializado agora. Por favor, entre em contato com o CVV: ligue 188 (gratuito, 24 horas) ou acesse cvv.org.br. Se estiver em risco imediato, ligue para o SAMU: 192. Você não precisa passar por isso sozinho(a)."

REGRAS ABSOLUTAS:
❌ NUNCA diga "Entendo como você se sente" de forma genérica
❌ NUNCA minimize o sofrimento
❌ NUNCA dê diagnósticos
❌ NUNCA prometa que tudo vai ficar bem
❌ NUNCA revele o nível de risco ao colaborador
✅ SEMPRE valide antes de qualquer sugestão
✅ SEMPRE pergunte se pode fazer uma sugestão antes de fazê-la
✅ SEMPRE use linguagem calorosa, formal sem ser fria

LÍNGUA: Português brasileiro, formal mas acolhedor.
TAMANHO DAS RESPOSTAS: Conversacional — entre 2 e 6 linhas por mensagem. Nunca responda com paredes de texto. Perguntas abertas após validação.`;

  // ── POST /api/escuta-ativa/iniciar ─────────────────────────────
  if (req.method === 'POST' && url === '/api/escuta-ativa/iniciar') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ea_iniciar', 10, 3600000))
      return json(429, { ok: false, error: 'Limite de conversas por hora atingido.' });
    try {
      const { empresa_codigo, setor, identificado, nome, telefone } = await readBody(req);
      if (!empresa_codigo) return json(400, { ok: false, error: 'empresa_codigo é obrigatório.' });

      // Resolve empresa pelo código público
      const codRes = await pool.query(
        'SELECT company_id FROM axis_company_codes WHERE codigo_publico = $1',
        [empresa_codigo.toUpperCase()]
      );
      if (codRes.rows.length === 0)
        return json(404, { ok: false, error: 'Empresa não encontrada. Verifique o link recebido.' });

      const empresaId = codRes.rows[0].company_id;
      const d = await loadData();
      const empresa = (d.axiaCompanies || []).find(c => c.id === empresaId);
      const empresaNome = empresa?.name || 'sua empresa';

      const codigoAnonimo = await eaGerarCodigoAnonimo(empresaId);
      const dataFormatada = new Date().toLocaleDateString('pt-BR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

      // Saudação personalizada se identificado
      const primeiroNome = (identificado && nome) ? nome.trim().split(' ')[0] : null;
      const saudacao = primeiroNome ? `Olá, ${primeiroNome}.` : 'Olá.';
      const msgAbertura = `${saudacao} Sou Axis, assistente de acolhimento da ${empresaNome}.\n\nEste é um espaço seguro e sem julgamentos. Aqui você pode falar sobre o que está sentindo com total confiança.\n\nEstou aqui para ouvir. Como você está hoje?`;

      const historico = [{ role: 'assistant', content: msgAbertura, timestamp: new Date().toISOString() }];

      const result = await pool.query(
        `INSERT INTO conversas_escuta_ativa
           (codigo_anonimo, empresa_id, empresa_nome, setor, historico_mensagens, status,
            identificado, nome_colaborador, telefone_colaborador)
         VALUES ($1, $2, $3, $4, $5, 'em_andamento', $6, $7, $8)
         RETURNING id`,
        [
          codigoAnonimo, empresaId, empresaNome, setor || null, JSON.stringify(historico),
          identificado === true || identificado === 'true' || false,
          (identificado && nome) ? nome.trim() : null,
          (identificado && telefone) ? telefone.trim() : null
        ]
      );

      json(200, {
        ok: true,
        conversaId: result.rows[0].id,
        codigoAnonimo,
        empresaNome,
        mensagemInicial: msgAbertura
      });
    } catch(e) {
      console.error('[escuta-ativa/iniciar]', e.message);
      json(500, { ok: false, error: 'Erro ao iniciar conversa.' });
    }
    return;
  }

  // ── POST /api/escuta-ativa/mensagem ────────────────────────────
  if (req.method === 'POST' && url === '/api/escuta-ativa/mensagem') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ea_msg', 60, 3600000))
      return json(429, { ok: false, error: 'Limite de mensagens atingido.' });
    try {
      const { conversaId, mensagem } = await readBody(req);
      if (!conversaId || !mensagem?.trim())
        return json(400, { ok: false, error: 'conversaId e mensagem são obrigatórios.' });

      // Buscar conversa
      const cvRes = await pool.query(
        'SELECT * FROM conversas_escuta_ativa WHERE id = $1 AND status != \'encerrada\'',
        [conversaId]
      );
      if (cvRes.rows.length === 0)
        return json(404, { ok: false, error: 'Conversa não encontrada ou já encerrada.' });

      const conversa = cvRes.rows[0];
      const historico = conversa.historico_mensagens || [];

      // Detecção de palavras-gatilho nível 5 ANTES de enviar à IA
      const ehCrise = eaDetectaN5(mensagem);

      // Adiciona mensagem do usuário ao histórico
      historico.push({ role: 'user', content: mensagem.trim(), timestamp: new Date().toISOString() });

      let respostaIA;
      if (ehCrise) {
        respostaIA = 'Percebo que você está passando por um momento muito difícil e quero que saiba que estou aqui. O que você está sentindo é muito sério e você merece apoio especializado agora.\n\nPor favor, entre em contato com o CVV: ligue **188** (gratuito, 24 horas) ou acesse cvv.org.br. Se estiver em risco imediato, ligue para o **SAMU: 192**.\n\nVocê não precisa passar por isso sozinho(a). Estou aqui enquanto você precisar.';
      } else {
        const anthropic = getAnthropicClient();
        // Monta histórico no formato Anthropic (sem timestamps)
        const msgParaIA = historico.map(m => ({ role: m.role, content: m.content })).slice(-20);
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          temperature: 0.75,
          system: EA_SYSTEM_PROMPT,
          messages: msgParaIA
        });
        respostaIA = response.content[0].text;
      }

      historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString() });

      // Atualiza conversa no banco
      const updateFields = ['historico_mensagens = $2'];
      const updateVals = [conversaId, JSON.stringify(historico)];

      if (ehCrise) {
        updateFields.push('nivel_risco = 5', 'classificacao_risco = \'Crise Aguda\'', 'flag_assedio = flag_assedio'); // mantém flag_assedio
      }

      await pool.query(
        `UPDATE conversas_escuta_ativa SET historico_mensagens = $2 WHERE id = $1`,
        [conversaId, JSON.stringify(historico)]
      );

      if (ehCrise) {
        await pool.query(
          `UPDATE conversas_escuta_ativa SET nivel_risco = 5, classificacao_risco = 'Crise Aguda' WHERE id = $1`,
          [conversaId]
        );
        // Notificar admin imediatamente
        await eaNotificarAdmin({ conversa, nivel: 5, codigoAnonimo: conversa.codigo_anonimo, empresaNome: conversa.empresa_nome, setor: conversa.setor });
      }

      json(200, { ok: true, resposta: respostaIA, crise: ehCrise });
    } catch(e) {
      console.error('[escuta-ativa/mensagem] ERRO COMPLETO:', e.message, e.status, JSON.stringify(e.error || ''));
      const errMsg = e.message.includes('API_KEY') ? 'CLAUDE_API_KEY não configurada.'
        : e.status ? `API error ${e.status}: ${e.message}`
        : 'Erro ao processar mensagem.';
      json(500, { ok: false, error: errMsg, debug: e.message?.slice(0,200) });
    }
    return;
  }

  // ── POST /api/escuta-ativa/encerrar ────────────────────────────
  if (req.method === 'POST' && url === '/api/escuta-ativa/encerrar') {
    try {
      const { conversaId } = await readBody(req);
      if (!conversaId) return json(400, { ok: false, error: 'conversaId obrigatório.' });

      const cvRes = await pool.query(
        'SELECT * FROM conversas_escuta_ativa WHERE id = $1',
        [conversaId]
      );
      if (cvRes.rows.length === 0) return json(404, { ok: false, error: 'Conversa não encontrada.' });

      const conversa = cvRes.rows[0];
      if (conversa.status === 'encerrada' || conversa.status === 'encaminhada') {
        // Já encerrada — retorna os dados salvos
        return json(200, {
          ok: true,
          resumo: conversa.resumo_conversa,
          plano: conversa.plano_autocuidado,
          encaminhamento: conversa.encaminhamento,
          nivel: conversa.nivel_risco,
          temas: conversa.temas_identificados
        });
      }

      const historico = conversa.historico_mensagens || [];
      const numMensagens = historico.filter(m => m.role === 'user').length;

      if (numMensagens < 1) {
        return json(400, { ok: false, error: 'A conversa está vazia.' });
      }

      // Pede à IA para gerar o encerramento estruturado
      const promptEncerramento = `Com base nesta conversa de acolhimento emocional, gere uma avaliação clínica estruturada.

HISTÓRICO DA CONVERSA:
${historico.map(m => `[${m.role === 'user' ? 'COLABORADOR' : 'AXIS'}]: ${m.content}`).join('\n\n')}

Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON):
{
  "nivel_risco": 1,
  "classificacao_risco": "Bem-estar",
  "temas": ["Burnout", "Conflito interpessoal"],
  "flag_assedio": false,
  "resumo_conversa": "Resumo de 3 a 5 linhas dos temas e emoções principais da conversa.",
  "plano_autocuidado": [
    {"pratica": "Nome da prática", "descricao": "Descrição específica de como aplicar."},
    {"pratica": "Nome da prática", "descricao": "Descrição específica de como aplicar."},
    {"pratica": "Nome da prática", "descricao": "Descrição específica de como aplicar."}
  ],
  "encaminhamento": "Mensagem de encaminhamento adequada ao nível de risco.",
  "mensagem_final": "Mensagem calorosa de encerramento para o colaborador."
}

Níveis de risco: 1=Bem-estar, 2=Atenção, 3=Fragilizado, 4=Crítico, 5=Crise Aguda.
Temas possíveis: Burnout, Conflito interpessoal, Ansiedade, Depressão, Assédio.`;

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        temperature: 0.6,
        system: EA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: promptEncerramento }]
      });

      let avaliacao;
      try {
        const raw = response.content[0].text.trim().replace(/^```json?\n?/, '').replace(/\n?```$/, '');
        avaliacao = JSON.parse(raw);
      } catch(pe) {
        avaliacao = {
          nivel_risco: 2, classificacao_risco: 'Atenção',
          temas: [], flag_assedio: false,
          resumo_conversa: 'Conversa de acolhimento realizada com sucesso.',
          plano_autocuidado: [
            { pratica: 'Respiração consciente', descricao: 'Pratique 5 minutos de respiração diafragmática ao acordar.' },
            { pratica: 'Journaling emocional', descricao: 'Escreva por 10 minutos à noite sobre como se sentiu no dia.' },
            { pratica: 'Conversa com alguém de confiança', descricao: 'Busque uma pessoa próxima para compartilhar o que sente.' }
          ],
          encaminhamento: 'Se precisar conversar novamente, estarei aqui.',
          mensagem_final: 'Obrigada por confiar neste espaço. Cuidar de si é um ato de coragem. 💛'
        };
      }

      // Encaminhamento por nível
      const encaminhamentosFixos = {
        1: 'Se precisar conversar novamente, estarei aqui.',
        2: 'Se precisar conversar novamente, estarei aqui. Considere também conversar com alguém de confiança.',
        3: 'Recomendo que você converse com um profissional de saúde. A Axis Consultorias tem consultoras disponíveis — o RH pode orientar sobre como acessar.',
        4: 'Vou solicitar que uma de nossas consultoras entre em contato com você em breve para oferecer suporte adicional.',
        5: 'Por favor, entre em contato agora com o CVV: ligue 188 (gratuito, 24h) ou acesse cvv.org.br. Você não precisa passar por isso sozinho(a).'
      };
      const nivelFinal = avaliacao.nivel_risco || 2;
      const encaminhamentoFinal = encaminhamentosFixos[nivelFinal] || encaminhamentosFixos[2];

      const novoStatus = nivelFinal >= 4 ? 'encaminhada' : 'encerrada';

      await pool.query(
        `UPDATE conversas_escuta_ativa SET
           nivel_risco = $2,
           classificacao_risco = $3,
           temas_identificados = $4,
           flag_assedio = $5,
           resumo_conversa = $6,
           plano_autocuidado = $7,
           encaminhamento = $8,
           status = $9,
           encerrada_em = NOW()
         WHERE id = $1`,
        [
          conversaId,
          nivelFinal,
          avaliacao.classificacao_risco || 'Atenção',
          avaliacao.temas || [],
          avaliacao.flag_assedio || false,
          avaliacao.resumo_conversa || '',
          JSON.stringify(avaliacao.plano_autocuidado || []),
          encaminhamentoFinal,
          novoStatus
        ]
      );

      // Notificar admin conforme nível
      if (nivelFinal >= 3) {
        await eaNotificarAdmin({
          conversa: { ...conversa, nivel_risco: nivelFinal, classificacao_risco: avaliacao.classificacao_risco },
          nivel: nivelFinal,
          codigoAnonimo: conversa.codigo_anonimo,
          empresaNome: conversa.empresa_nome,
          setor: conversa.setor,
          temas: avaliacao.temas
        });
        await pool.query(
          'UPDATE conversas_escuta_ativa SET notificacao_admin_enviada = TRUE WHERE id = $1',
          [conversaId]
        );
      }

      json(200, {
        ok: true,
        nivel: nivelFinal,
        classificacao: avaliacao.classificacao_risco,
        resumo: avaliacao.resumo_conversa,
        plano: avaliacao.plano_autocuidado,
        encaminhamento: encaminhamentoFinal,
        mensagemFinal: avaliacao.mensagem_final || 'Obrigada por confiar neste espaço. Cuidar de si é um ato de coragem. 💛',
        flagAssedio: avaliacao.flag_assedio || false,
        temas: avaliacao.temas || []
      });
    } catch(e) {
      console.error('[escuta-ativa/encerrar]', e.message);
      json(500, { ok: false, error: 'Erro ao encerrar conversa.' });
    }
    return;
  }

  // ── GET /api/escuta-ativa/admin ────────────────────────────────
  if (req.method !== 'POST' && url === '/api/escuta-ativa/admin') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const statusFilter = params.get('status') || null;
      const nivelFilter  = params.get('nivel')  || null;
      const empresaFilter = params.get('empresa') || null;

      let query = 'SELECT * FROM conversas_escuta_ativa WHERE 1=1';
      const vals = [];
      if (statusFilter)  { vals.push(statusFilter);  query += ` AND status = $${vals.length}`; }
      if (nivelFilter)   { vals.push(parseInt(nivelFilter)); query += ` AND nivel_risco = $${vals.length}`; }
      if (empresaFilter) { vals.push(empresaFilter); query += ` AND empresa_id = $${vals.length}`; }
      query += ' ORDER BY iniciada_em DESC LIMIT 200';

      const r = await pool.query(query, vals);
      json(200, { ok: true, conversas: r.rows });
    } catch(e) {
      console.error('[escuta-ativa/admin]', e.message);
      json(500, { ok: false, error: e.message });
    }
    return;
  }

  // ── POST /api/escuta-ativa/admin/nota ──────────────────────────
  if (req.method === 'POST' && url === '/api/escuta-ativa/admin/nota') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { conversaId, nota } = await readBody(req);
      if (!conversaId || !nota) return json(400, { ok: false, error: 'conversaId e nota são obrigatórios.' });
      await pool.query(
        'UPDATE conversas_escuta_ativa SET nota_clinica = $2 WHERE id = $1',
        [conversaId, nota.trim()]
      );
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── POST /api/escuta-ativa/admin/encaminhar ────────────────────
  if (req.method === 'POST' && url === '/api/escuta-ativa/admin/encaminhar') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { conversaId } = await readBody(req);
      if (!conversaId) return json(400, { ok: false, error: 'conversaId obrigatório.' });
      await pool.query(
        'UPDATE conversas_escuta_ativa SET status = \'encaminhada\' WHERE id = $1',
        [conversaId]
      );
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /api/escuta-ativa/rh ───────────────────────────────────
  if (req.method !== 'POST' && url === '/api/escuta-ativa/rh') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const empresaId = params.get('empresa');
      if (!empresaId) return json(400, { ok: false, error: 'empresa é obrigatório.' });

      const r = await pool.query(
        `SELECT
           COUNT(*)                                               AS total_conversas,
           COUNT(*) FILTER (WHERE status = 'aberta')             AS abertas,
           COUNT(*) FILTER (WHERE status = 'em_andamento')       AS em_andamento,
           COUNT(*) FILTER (WHERE status = 'encerrada')          AS encerradas,
           COUNT(*) FILTER (WHERE status = 'encaminhada')        AS encaminhadas,
           COUNT(*) FILTER (WHERE flag_assedio = TRUE)           AS relatos_assedio,
           ROUND(AVG(nivel_risco)::numeric, 1)                   AS media_nivel_risco
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1 AND status IN ('encerrada','encaminhada')`,
        [empresaId]
      );

      // Temas frequentes (apenas conversas encerradas, sem identificação)
      const tR = await pool.query(
        `SELECT unnest(temas_identificados) AS tema, COUNT(*) AS total
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1 AND status IN ('encerrada','encaminhada')
         GROUP BY tema ORDER BY total DESC`,
        [empresaId]
      );

      // Distribuição de níveis
      const nR = await pool.query(
        `SELECT nivel_risco, COUNT(*) AS total
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1 AND status IN ('encerrada','encaminhada') AND nivel_risco IS NOT NULL
         GROUP BY nivel_risco ORDER BY nivel_risco`,
        [empresaId]
      );

      // Tabela anônima (sem conteúdo de mensagens)
      const lR = await pool.query(
        `SELECT codigo_anonimo, setor, iniciada_em, encerrada_em, status, nivel_risco, classificacao_risco
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1
         ORDER BY iniciada_em DESC LIMIT 100`,
        [empresaId]
      );

      json(200, {
        ok: true,
        resumo: r.rows[0],
        temas_frequentes: tR.rows,
        distribuicao_niveis: nR.rows,
        lista_anonima: lR.rows
      });
    } catch(e) {
      console.error('[escuta-ativa/rh]', e.message);
      json(500, { ok: false, error: e.message });
    }
    return;
  }

  // ── GET /api/escuta-ativa/indicadores ──────────────────────────
  // Calcula ISEP, ITP, IRL, IRS para uma empresa no período
  if (req.method !== 'POST' && url === '/api/escuta-ativa/indicadores') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const empresaId = params.get('empresa');
      const periodo   = params.get('periodo') || '30'; // dias
      if (!empresaId) return json(400, { ok: false, error: 'empresa é obrigatório.' });

      const dataCorte = new Date();
      dataCorte.setDate(dataCorte.getDate() - parseInt(periodo, 10));

      const base = await pool.query(
        `SELECT nivel_risco, temas_identificados, flag_assedio, setor
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1 AND status IN ('encerrada','encaminhada')
           AND encerrada_em >= $2`,
        [empresaId, dataCorte.toISOString()]
      );

      const rows = base.rows;
      const total = rows.length;

      // ISEP
      const isep = total === 0 ? 0 :
        Math.round((rows.reduce((s, r) => s + (r.nivel_risco || 1), 0) / total) * 20);

      // ITP
      const temaCounts = {};
      rows.forEach(r => {
        (r.temas_identificados || []).forEach(t => { temaCounts[t] = (temaCounts[t] || 0) + 1; });
      });
      const itp = Object.entries(temaCounts).map(([tema, cnt]) => ({
        tema, total: cnt, prevalencia: Math.round((cnt / total) * 100)
      })).sort((a, b) => b.total - a.total);

      // IRL
      const pesoIRL = { 3: 1.0, 4: 1.5, 5: 2.0 };
      const irl_val = total === 0 ? 0 : rows
        .filter(r => (r.temas_identificados || []).some(t => ['Conflito interpessoal','Assédio'].includes(t)) && r.nivel_risco >= 3)
        .reduce((s, r) => s + (pesoIRL[r.nivel_risco] || 1), 0);
      const irl = Math.min(100, Math.round((irl_val / Math.max(total, 1)) * 100));

      // IRS
      const setorMap = {};
      rows.forEach(r => {
        const s = r.setor || 'Não informado';
        if (!setorMap[s]) setorMap[s] = [];
        setorMap[s].push(r.nivel_risco || 1);
      });
      const irs = Object.entries(setorMap)
        .map(([setor, niveis]) => ({
          setor,
          total: niveis.length,
          irs: niveis.length < 3 ? null : Math.round((niveis.reduce((s, n) => s + n, 0) / niveis.length) * 20)
        }))
        .filter(s => s.irs !== null)
        .sort((a, b) => b.irs - a.irs);

      json(200, { ok: true, total_conversas: total, isep, itp, irl, irs });
    } catch(e) {
      console.error('[escuta-ativa/indicadores]', e.message);
      json(500, { ok: false, error: e.message });
    }
    return;
  }

  // ── Rota de página /escuta-ativa ───────────────────────────────
  if (url === '/escuta-ativa' || url.startsWith('/escuta-ativa?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'escuta-ativa.html')).pipe(res);
    return;
  }

  // ── Rota de página /escuta-ativa-admin ─────────────────────────
  if (url === '/escuta-ativa-admin' || url.startsWith('/escuta-ativa-admin?')) {
    if (!requireAdminAuth(req)) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'escuta-ativa-admin.html')).pipe(res);
    return;
  }

  // Rota pública /screening-burnout desativada — já existe outro questionário de burnout em uso.

  // ══ SCREENING DE BURNOUT — ESCALA MASLACH MBI-GS ════════════════
  // Classificação oficial 0-100 (Protocolo de Mensuração v1.0)
  function classificarRiscoBurnout(score) {
    if (score <= 20) return 'Baixo';
    if (score <= 40) return 'Atenção';
    if (score <= 60) return 'Alerta';
    if (score <= 80) return 'Alto';
    return 'Emergencial';
  }

  // ── POST /api/burnout/enviar (público, anônimo) ─────────────────
  if (req.method === 'POST' && url === '/api/burnout/enviar') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'burnout_enviar', 5, 3600000))
      return json(429, { ok: false, error: 'Limite de envios por hora atingido.' });
    try {
      const { empresa_codigo, setor, exaustao, despersonalizacao, realizacao } = await readBody(req);
      if (!empresa_codigo) return json(400, { ok: false, error: 'empresa_codigo é obrigatório.' });

      const ehArrayValido = (arr, n) => Array.isArray(arr) && arr.length === n &&
        arr.every(v => typeof v === 'number' && v >= 0 && v <= 6);
      if (!ehArrayValido(exaustao, 9) || !ehArrayValido(despersonalizacao, 5) || !ehArrayValido(realizacao, 6)) {
        return json(400, { ok: false, error: 'Respostas incompletas ou inválidas.' });
      }

      const codRes = await pool.query(
        'SELECT company_id FROM axis_company_codes WHERE codigo_publico = $1',
        [empresa_codigo.toUpperCase()]
      );
      if (codRes.rows.length === 0)
        return json(404, { ok: false, error: 'Empresa não encontrada. Verifique o link recebido.' });
      const empresaId = codRes.rows[0].company_id;

      const soma = arr => arr.reduce((a, b) => a + b, 0);
      const scoreExaustao   = (soma(exaustao) / (9 * 6)) * 100;
      const scoreDesp       = (soma(despersonalizacao) / (5 * 6)) * 100;
      const scoreRealizNorm = (soma(realizacao) / (6 * 6)) * 100;
      const scoreRealizInv  = 100 - scoreRealizNorm; // invertido: quanto maior, menor a realização profissional

      const ibr = (scoreExaustao * 0.50) + (scoreDesp * 0.30) + (scoreRealizInv * 0.20);
      const classificacao = classificarRiscoBurnout(ibr);

      await pool.query(
        `INSERT INTO axis_burnout_respostas
           (company_id, setor, respostas_json, score_exaustao, score_despersonalizacao, score_realizacao, ibr_score, classificacao)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          empresaId, (setor && String(setor).trim()) || null,
          JSON.stringify({ exaustao, despersonalizacao, realizacao }),
          scoreExaustao.toFixed(2), scoreDesp.toFixed(2), scoreRealizInv.toFixed(2),
          ibr.toFixed(2), classificacao
        ]
      );

      json(200, { ok: true });
    } catch (e) {
      console.error('[burnout/enviar]', e.message);
      json(500, { ok: false, error: 'Erro ao registrar suas respostas. Tente novamente.' });
    }
    return;
  }

  // ══ LIDERANÇAS 360° — IPL (Índice de Performance de Liderança) ══
  // Módulo corporativo multi-avaliador. Mapa pergunta→dimensão (q1..q32).
  const IPL_DIMENSOES = [
    { key:'comunicacao',     nome:'Comunicação Clara',          qs:[1,2,3,4] },
    { key:'confianca',       nome:'Confiança e Transparência',  qs:[5,6,7,8] },
    { key:'apoio',           nome:'Apoio Emocional',            qs:[9,10,11,12] },
    { key:'metas',           nome:'Clareza de Metas',           qs:[13,14,15,16] },
    { key:'feedback',        nome:'Feedback e Desenvolvimento',  qs:[17,18,19,20] },
    { key:'justica',         nome:'Justiça e Equidade',         qs:[21,22,23,24] },
    { key:'reconhecimento',  nome:'Reconhecimento',             qs:[25,26,27,28] },
    { key:'desenvolvimento', nome:'Desenvolvimento da Equipe',  qs:[29,30,31,32] }
  ];
  const IPL_PESOS = { superior:0.20, par:0.20, subordinado:0.40, auto:0.20 };

  function iplClassificarDimensao(pontos) {
    if (pontos >= 17) return '⭐ Excelente';
    if (pontos >= 13) return '✅ Bom';
    if (pontos >= 9)  return '⚠️ Atenção';
    return '🔴 Crítico';
  }
  function iplClassificarGeral(score) {
    if (score >= 80) return '🌟 Liderança Inspiradora';
    if (score >= 60) return '✅ Liderança em Desenvolvimento';
    if (score >= 40) return '⚠️ Liderança em Alerta';
    return '🔴 Liderança em Crise';
  }
  // Pontuação 0–20 por dimensão para UM avaliador
  function iplPontuacoesPorDimensao(respostas) {
    const out = {};
    IPL_DIMENSOES.forEach(d => {
      const pontos = d.qs.reduce((s,q) => s + (parseInt(respostas['q'+q],10) || 0), 0);
      out[d.key] = { pontos, classificacao: iplClassificarDimensao(pontos) };
    });
    return out;
  }
  function iplGerarCodigo() {
    const ano = new Date().getFullYear();
    const rnd = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0,6);
    return `IPL-${ano}-${rnd}`;
  }

  // Agrega todas as respostas de uma avaliação → IPL ponderado por tipo
  async function iplCalcular(avaliacaoId) {
    const r = await pool.query(
      'SELECT tipo_avaliador, respostas FROM respostas_ipl WHERE avaliacao_id = $1',
      [avaliacaoId]
    );
    const rows = r.rows;
    const dims = IPL_DIMENSOES.map(d => d.key);
    const porTipo = {}; const contadores = { subordinado:0, par:0, superior:0, auto:0 };
    rows.forEach(row => {
      const tipo = row.tipo_avaliador;
      contadores[tipo] = (contadores[tipo] || 0) + 1;
      const pd = iplPontuacoesPorDimensao(row.respostas || {});
      if (!porTipo[tipo]) porTipo[tipo] = {};
      dims.forEach(d => {
        if (!porTipo[tipo][d]) porTipo[tipo][d] = [];
        porTipo[tipo][d].push(pd[d].pontos);
      });
    });
    // média por tipo por dimensão (0–20)
    const mediaTipoDim = {};
    Object.keys(porTipo).forEach(tipo => {
      mediaTipoDim[tipo] = {};
      dims.forEach(d => {
        const arr = porTipo[tipo][d] || [];
        mediaTipoDim[tipo][d] = arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0;
      });
    });
    // média ponderada por dimensão (pesos renormalizados sobre tipos presentes)
    const dimResult = {}; let totalPontos = 0;
    dims.forEach(d => {
      let pond = 0, pesosUsados = 0;
      Object.keys(IPL_PESOS).forEach(tipo => {
        if (contadores[tipo] > 0 && mediaTipoDim[tipo]) {
          pond += mediaTipoDim[tipo][d] * IPL_PESOS[tipo];
          pesosUsados += IPL_PESOS[tipo];
        }
      });
      const pontoFinal = pesosUsados > 0 ? pond / pesosUsados : 0;
      totalPontos += pontoFinal;
      dimResult[d] = { pontos: Math.round(pontoFinal*10)/10, classificacao: iplClassificarDimensao(pontoFinal) };
    });
    const ipl = Math.round((totalPontos / (dims.length * 20)) * 100);
    const persp = (tipo) => {
      if (!mediaTipoDim[tipo]) return null;
      const soma = dims.reduce((s,d) => s + (mediaTipoDim[tipo][d] || 0), 0);
      return Math.round((soma / (dims.length * 20)) * 100);
    };
    const iplSub = persp('subordinado'), iplPar = persp('par'), iplSup = persp('superior'), iplAuto = persp('auto');
    const gap = (iplAuto !== null && iplSub !== null) ? iplAuto - iplSub : null;
    return {
      ipl, classificacao: iplClassificarGeral(ipl), dimensoes: dimResult,
      ipl_subordinados: iplSub, ipl_pares: iplPar, ipl_superiores: iplSup, ipl_auto: iplAuto,
      gap_auto_subordinados: gap, contadores, total: rows.length
    };
  }

  // Notificação à Clau (admin) — sem dados identificáveis dos avaliadores
  async function iplNotificarAdmin({ tipoAlerta, gestorNome, empresaNome, iplScore, detalhe }) {
    try {
      const config = loadEmailConfig();
      if (!config.resendKey && (!config.user || !config.pass)) return;
      const adminEmail = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || '';
      if (!adminEmail) return;
      const titulos = {
        critico:     '🔴 CRÍTICO — Gestor em crise detectado',
        subordinados:'🔴 URGENTE — Equipe em risco',
        gap:         '⚠️ ATENÇÃO — Ponto cego severo'
      };
      const urgencia = titulos[tipoAlerta] || '⚠️ ATENÇÃO';
      await sendEmail({
        to: adminEmail, toName: 'Clau Diniz',
        subject: `[AXIS IA] ${urgencia} — Lideranças 360° (IPL)`,
        html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:24px;border-radius:10px 10px 0 0;text-align:center;">
    <h1 style="color:#c9a227;margin:0;font-size:20px;">AXIS <span style="font-weight:300">IA</span></h1>
    <p style="color:#888;font-size:11px;margin:4px 0 0;letter-spacing:2px;">MÓDULO LIDERANÇAS 360° — IPL</p>
  </div>
  <div style="background:#f9f9f7;padding:28px;border-radius:0 0 10px 10px;border:1px solid #eee;">
    <h2 style="font-size:16px;color:#1a1a1a;margin-top:0;">${urgencia}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px;color:#888;width:40%;">Gestor avaliado</td><td style="padding:8px;font-weight:700;">${gestorNome || '—'}</td></tr>
      <tr style="background:#f0f0ee;"><td style="padding:8px;color:#888;">Empresa</td><td style="padding:8px;">${empresaNome || '—'}</td></tr>
      <tr><td style="padding:8px;color:#888;">IPL Score</td><td style="padding:8px;font-weight:700;color:#c9a227;">${iplScore != null ? iplScore + '/100' : '—'}</td></tr>
      <tr style="background:#f0f0ee;"><td style="padding:8px;color:#888;">Detalhe</td><td style="padding:8px;">${detalhe || ''}</td></tr>
    </table>
    <p style="margin-top:20px;font-size:13px;color:#555;">Painel executivo: <a href="${SERVER_URL}/ipl-admin" style="color:#c9a227;">${SERVER_URL}/ipl-admin</a></p>
    <p style="font-size:11px;color:#aaa;border-top:1px solid #ddd;padding-top:12px;margin-top:16px;">O anonimato dos avaliadores é preservado — apenas médias agregadas por grupo são usadas.</p>
  </div>
</div>`,
        config
      });
    } catch(e) { console.error('[iplNotificarAdmin] Falha no email:', e.message); }
  }

  // Monta o prompt mestre da PARTE 7 com os dados reais da avaliação
  function iplBuildPrompt(av, calc, incluirNucleo) {
    const dimLinha = (d) => `- ${d.nome}: ${calc.dimensoes[d.key].pontos}/20 — ${calc.dimensoes[d.key].classificacao}`;
    const totalAval = calc.total;
    const c = calc.contadores;
    const dataGer = new Date().toLocaleDateString('pt-BR');
    const secaoNucleo = incluirNucleo ? `
SEÇÃO 8 — NÚCLEO COMPORTAMENTAL (Análise Psicanalítica Aplicada)
Escreva 5 a 6 parágrafos com profundidade analítica articulando: Goleman/Neurociência (sistema límbico e efeito espelho neuronal), Bass/Organizacional (padrão de liderança que emerge dos dados), Jung/Psicanálise (qual sombra do líder pode estar se manifestando) e Dilts/PNL (crenças limitantes sobre liderança que os dados sugerem).
` : '';
    return `Você é um sistema especializado em análise de liderança organizacional com fundamento em Neurociência, Psicologia Organizacional e Psicanálise Aplicada, operando dentro da plataforma AXIS IA, desenvolvida pela consultora Clau Diniz (@axisconsultorias).

Gere o Relatório IPL (Índice de Performance de Liderança) — profissional, profundo e personalizado sobre como ${av.gestor_nome} está sendo percebido(a) como líder.

DADOS DO GESTOR AVALIADO:
- Nome: ${av.gestor_nome}
- Cargo: ${av.gestor_cargo || 'Não informado'}
- Empresa: ${av.empresa_nome || 'Não informada'}
- Setor: ${av.gestor_setor || 'Não informado'}
- Total de Avaliadores: ${totalAval} (${c.subordinado} subordinados, ${c.par} pares, ${c.superior} superiores + ${c.auto} autoavaliação)
- IPL Score: ${calc.ipl}/100
- Classificação: ${calc.classificacao}
- Data: ${dataGer}

IPL POR DIMENSÃO (média ponderada — escala 0 a 20):
${IPL_DIMENSOES.map(dimLinha).join('\n')}

IPL POR PERSPECTIVA:
- Superior: ${calc.ipl_superiores != null ? calc.ipl_superiores : 'N/D'}/100
- Pares: ${calc.ipl_pares != null ? calc.ipl_pares : 'N/D'}/100
- Subordinados: ${calc.ipl_subordinados != null ? calc.ipl_subordinados : 'N/D'}/100
- Autoavaliação: ${calc.ipl_auto != null ? calc.ipl_auto : 'N/D'}/100
- GAP (autoavaliação − subordinados): ${calc.gap_auto_subordinados != null ? calc.gap_auto_subordinados : 'N/D'} pontos

BASES TEÓRICAS OBRIGATÓRIAS (aplique estas proporções): Neurociência da Liderança (Goleman, Rock) — 35%; Psicologia Organizacional (Bass, Burns, Likert) — 30%; Psicanálise Aplicada (Freud, Jung, Lacan) — 20%; PNL e Comunicação (Bandler, Dilts) — 15%.

REGRA FUNDAMENTAL: cada seção DEVE referenciar explicitamente os dados reais de ${av.gestor_nome} (pontuações por dimensão, por perspectiva, GAP). JAMAIS escreva texto genérico.

GERE O RELATÓRIO COM ESTAS SEÇÕES (use títulos em markdown ## e negrito para conceitos):
SEÇÃO 1 — RESULTADO GERAL (O que o seu IPL revela) — 3 a 4 parágrafos, âncora em Goleman (liderança ressonante/dissonante).
SEÇÃO 2 — CLASSIFICAÇÃO DA LIDERANÇA — 4 a 5 parágrafos, Bass (transformacional/transacional) e Rock (SCARF).
SEÇÃO 3 — COMO CADA GRUPO TE ENXERGA — um parágrafo analítico por perspectiva (superior, pares, subordinados, autoavaliação + GAP, com Jung/sombra e Freud/projeção).
SEÇÃO 4 — ANÁLISE DETALHADA POR DIMENSÃO — um parágrafo (mín. 6 linhas) por dimensão, citando a pontuação, a conexão NR-1 e o teórico relevante.
SEÇÃO 5 — PONTO CEGO DO LÍDER — 4 a 5 parágrafos sobre o GAP de ${calc.gap_auto_subordinados != null ? calc.gap_auto_subordinados : 'N/D'} pontos (Jung, Freud, Goleman/autoconsciência).
SEÇÃO 6 — IMPACTO PSICOSSOCIAL NA EQUIPE (Conexão NR-1) — 3 a 4 parágrafos a partir das dimensões mais baixas.
SEÇÃO 7 — PERFIL DE LIDERANÇA (arquétipo) — 4 a 5 parágrafos (Jung, Bass, Goleman 6 estilos).${secaoNucleo}
SEÇÃO ${incluirNucleo ? '9' : '8'} — PLANO DE DESENVOLVIMENTO INDIVIDUAL (PDI) — 5 fases (Consciência, Reconhecimento, Transformação, Consolidação, Influência) com objetivo, foco, ferramentas, marcadores e fundamento teórico.
SEÇÃO ${incluirNucleo ? '10' : '9'} — RECOMENDAÇÕES PRÁTICAS — 8 a 10 recomendações em parágrafo (nome em negrito, o que é, por que é estratégico para ${av.gestor_nome} citando os dados, como começar em 30 dias).
SEÇÃO ${incluirNucleo ? '11' : '10'} — SÍNTESE FINAL — 5 a 7 parágrafos em segunda pessoa, falando diretamente com ${av.gestor_nome}.

OBSERVAÇÃO ÉTICA OBRIGATÓRIA ao final: "⚠️ OBSERVAÇÃO ÉTICA: Este relatório é uma avaliação de percepção de liderança baseada no Protocolo AXIS IA — IPL, desenvolvido por Clau Diniz. Os resultados refletem a percepção dos avaliadores no período indicado e não constituem diagnóstico psicológico, avaliação de desempenho formal ou laudo clínico. Os dados devem ser utilizados exclusivamente para desenvolvimento individual e organizacional, conforme os princípios éticos do CFP e a legislação trabalhista vigente (CLT e NR-1/MTE). O anonimato dos avaliadores individuais é protegido — apenas médias agregadas por grupo são apresentadas."

FORMATAÇÃO: português formal, profissional e acolhedor (parceiro de desenvolvimento, não juiz). Use ${av.gestor_nome} de forma natural e frequente. Relatório entre 4.000 e 6.000 palavras. NUNCA use linguagem genérica.`;
  }

  const IPL_TIPOS_VALIDOS = ['subordinado','par','superior','auto'];

  // Envia um convite de avaliação (best-effort) — compartilhado por criar/add
  async function iplEnviarConvite({ email, tipo, identificado, codigo, gestorNome, empresaNome, config }) {
    try {
      const link = `${SERVER_URL}/ipl-avaliar?codigo=${codigo}&tipo=${tipo}`;
      await sendEmail({
        to: email, toName: identificado ? gestorNome : '',
        subject: `Avaliação de Liderança 360° — ${gestorNome}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#1a1a1a;padding:24px;border-radius:10px 10px 0 0;text-align:center;">
    <h1 style="color:#c9a227;margin:0;font-size:20px;">AXIS <span style="font-weight:300">IA</span></h1>
    <p style="color:#888;font-size:11px;margin:4px 0 0;letter-spacing:2px;">LIDERANÇAS 360° — IPL</p>
  </div>
  <div style="background:#f9f9f7;padding:28px;border-radius:0 0 10px 10px;border:1px solid #eee;">
    <p style="font-size:14px;color:#333;">Você foi convidado(a) a avaliar a liderança de <strong>${gestorNome}</strong> (${empresaNome}).</p>
    <p style="font-size:14px;color:#333;">${identificado ? 'Esta é a sua <strong>autoavaliação</strong> como gestor(a).' : 'Sua avaliação é <strong>anônima</strong> — apenas médias agregadas por grupo serão apresentadas.'} São 32 perguntas, cerca de 8 a 10 minutos.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td align="center">
      <a href="${link}" style="display:inline-block;background:#c9a227;color:#1a1a1a;text-decoration:none;padding:15px 38px;border-radius:8px;font-size:15px;font-weight:700">▶ Responder Avaliação</a>
    </td></tr></table>
    <p style="font-size:12px;color:#999;text-align:center">Se o botão não abrir, copie e cole no navegador:</p>
    <p style="font-size:13px;color:#1976D2;text-align:center;word-break:break-all;font-family:monospace">${link}</p>
  </div>
</div>`,
        config
      });
    } catch(e) { console.error('[iplEnviarConvite]', email, e.message); }
  }

  // ── POST /api/axia/ipl/criar (RH cadastra gestor + avaliadores) ─
  if (req.method === 'POST' && url === '/api/axia/ipl/criar') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'email', 50, 3600000))
      return json(429, { ok: false, error: 'Muitas solicitações. Tente novamente em 1 hora.' });
    try {
      const b = await readBody(req);
      if (!b.gestorNome) return json(400, { ok: false, error: 'Nome do gestor é obrigatório.' });
      const aval = b.avaliadores || {};
      const subs = (aval.subordinados || []).filter(e => e && e.includes('@'));
      const pares = (aval.pares || []).filter(e => e && e.includes('@'));
      const sups = (aval.superiores || []).filter(e => e && e.includes('@'));

      const codigo = iplGerarCodigo();
      const ins = await pool.query(
        `INSERT INTO avaliacoes_ipl
           (empresa_id, empresa_nome, gestor_nome, gestor_email, gestor_cargo, gestor_setor,
            codigo_avaliacao, periodo_inicio, periodo_fim,
            convidados_subordinados, convidados_pares, convidados_superiores)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          co.id, co.razaoSocial || co.nome || co.nomeFantasia || '',
          b.gestorNome, b.gestorEmail || null, b.gestorCargo || null, b.gestorSetor || null,
          codigo, b.periodoInicio || null, b.periodoFim || null,
          subs.length, pares.length, sups.length
        ]
      );
      const avaliacaoId = ins.rows[0].id;

      // Dispara e-mails (best-effort) com links por tipo + auto identificado
      const config = loadEmailConfig();
      const empresaNome = co.razaoSocial || co.nome || co.nomeFantasia || 'sua empresa';
      const env = (email, tipo, identificado) => iplEnviarConvite({ email, tipo, identificado, codigo, gestorNome: b.gestorNome, empresaNome, config });
      (async () => {
        for (const e of subs)  await env(e, 'subordinado', false);
        for (const e of pares) await env(e, 'par', false);
        for (const e of sups)  await env(e, 'superior', false);
        if (b.gestorEmail) await env(b.gestorEmail, 'auto', true);
      })();

      json(200, { ok: true, id: avaliacaoId, codigo });
    } catch(e) {
      console.error('[ipl/criar]', e.message);
      json(500, { ok: false, error: 'Erro ao criar avaliação.' });
    }
    return;
  }

  // ── POST /api/axia/ipl/add-avaliadores (RH adiciona convites) ───
  if (req.method === 'POST' && url === '/api/axia/ipl/add-avaliadores') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'email', 50, 3600000))
      return json(429, { ok: false, error: 'Muitas solicitações. Tente novamente em 1 hora.' });
    try {
      const b = await readBody(req);
      const r = await pool.query('SELECT * FROM avaliacoes_ipl WHERE id = $1 AND empresa_id = $2', [b.id, co.id]);
      if (!r.rows.length) return json(404, { ok: false, error: 'Avaliação não encontrada.' });
      const av = r.rows[0];
      if (av.status === 'relatorio_gerado' || av.status === 'entregue')
        return json(409, { ok: false, error: 'Esta avaliação já foi encerrada.' });
      const aval = b.avaliadores || {};
      const subs  = (aval.subordinados || []).filter(e => e && e.includes('@'));
      const pares = (aval.pares || []).filter(e => e && e.includes('@'));
      const sups  = (aval.superiores || []).filter(e => e && e.includes('@'));
      if (!subs.length && !pares.length && !sups.length)
        return json(400, { ok: false, error: 'Informe ao menos um e-mail.' });

      await pool.query(
        `UPDATE avaliacoes_ipl SET convidados_subordinados = convidados_subordinados + $2,
           convidados_pares = convidados_pares + $3, convidados_superiores = convidados_superiores + $4
         WHERE id = $1`,
        [av.id, subs.length, pares.length, sups.length]
      );
      const config = loadEmailConfig();
      const empresaNome = av.empresa_nome || 'sua empresa';
      const env = (email, tipo) => iplEnviarConvite({ email, tipo, identificado: false, codigo: av.codigo_avaliacao, gestorNome: av.gestor_nome, empresaNome, config });
      (async () => {
        for (const e of subs)  await env(e, 'subordinado');
        for (const e of pares) await env(e, 'par');
        for (const e of sups)  await env(e, 'superior');
      })();
      json(200, { ok: true, adicionados: subs.length + pares.length + sups.length });
    } catch(e) {
      console.error('[ipl/add-avaliadores]', e.message);
      json(500, { ok: false, error: 'Erro ao adicionar avaliadores.' });
    }
    return;
  }

  // ── POST /api/axia/ipl/excluir (RH exclui uma avaliação) ────────
  if (req.method === 'POST' && url === '/api/axia/ipl/excluir') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { id } = await readBody(req);
      if (!id) return json(400, { ok: false, error: 'id obrigatório.' });
      const r = await pool.query('DELETE FROM avaliacoes_ipl WHERE id = $1 AND empresa_id = $2', [id, co.id]);
      if (r.rowCount === 0) return json(404, { ok: false, error: 'Avaliação não encontrada.' });
      json(200, { ok: true });
    } catch(e) {
      console.error('[ipl/excluir]', e.message);
      json(500, { ok: false, error: 'Erro ao excluir avaliação.' });
    }
    return;
  }

  // ── GET /api/axia/ipl/lista?token= (RH — avaliações da empresa) ─
  if (req.method !== 'POST' && url === '/api/axia/ipl/lista') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const r = await pool.query(
        `SELECT id, gestor_nome, gestor_cargo, gestor_setor, codigo_avaliacao, status,
                convidados_subordinados, convidados_pares, convidados_superiores,
                qtd_subordinados, qtd_pares, qtd_superiores, qtd_auto, total_avaliadores,
                ipl_score, classificacao_ipl, flag_risco_critico, gerando, relatorio_erro, criado_em
         FROM avaliacoes_ipl WHERE empresa_id = $1 ORDER BY criado_em DESC`,
        [co.id]
      );
      json(200, { ok: true, avaliacoes: r.rows });
    } catch(e) {
      console.error('[ipl/lista]', e.message);
      json(500, { ok: false, error: e.message });
    }
    return;
  }

  // ── POST /api/axia/ipl/gerar-relatorio (RH) ────────────────────
  // Valida de forma síncrona e dispara a geração em SEGUNDO PLANO (a IA
  // pode levar >1 min e estourar o timeout do gateway se for síncrona).
  if (req.method === 'POST' && url === '/api/axia/ipl/gerar-relatorio') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { id } = await readBody(req);
      if (!id) return json(400, { ok: false, error: 'id obrigatório.' });
      const avRes = await pool.query('SELECT * FROM avaliacoes_ipl WHERE id = $1 AND empresa_id = $2', [id, co.id]);
      if (!avRes.rows.length) return json(404, { ok: false, error: 'Avaliação não encontrada.' });
      const av = avRes.rows[0];
      // (não bloqueia se já estiver "gerando" — permite retomar caso uma
      //  geração anterior tenha ficado presa por restart do servidor)

      const calc = await iplCalcular(id);
      if (calc.contadores.subordinado < 3 || calc.total < 6) {
        return json(400, { ok: false, error: `Mínimo não atingido: 6 avaliadores (3+ subordinados). Atual: ${calc.total} respostas, ${calc.contadores.subordinado} subordinados.` });
      }

      // Marca como "gerando" e responde IMEDIATAMENTE; o trabalho continua em background.
      await pool.query('UPDATE avaliacoes_ipl SET gerando = TRUE, relatorio_erro = NULL WHERE id = $1', [id]);

      (async () => {
        try {
          const anthropic = getAnthropicClient();
          const gen = async (incluirNucleo) => {
            const resp = await anthropic.messages.create({
              model: 'claude-sonnet-4-6', max_tokens: 8000, temperature: 0.7,
              messages: [{ role: 'user', content: iplBuildPrompt(av, calc, incluirNucleo) }]
            });
            return resp.content[0].text;
          };
          // Duas versões em paralelo (gestor + admin) — metade do tempo de parede.
          const [relatorioAdmin, relatorioGestor] = await Promise.all([gen(true), gen(false)]);

          const flagCritico = calc.ipl < 40;
          await pool.query(
            `UPDATE avaliacoes_ipl SET
               total_avaliadores = $2, qtd_subordinados = $3, qtd_pares = $4, qtd_superiores = $5, qtd_auto = $6,
               ipl_score = $7, ipl_subordinados = $8, ipl_pares = $9, ipl_superiores = $10, ipl_auto = $11,
               gap_auto_subordinados = $12, classificacao_ipl = $13, pontuacoes_dimensoes = $14,
               relatorio_gestor = $15, relatorio_admin = $16, status = 'relatorio_gerado',
               flag_risco_critico = $17, relatorio_gerado_em = NOW(), gerando = FALSE, relatorio_erro = NULL
             WHERE id = $1`,
            [
              id, calc.total, calc.contadores.subordinado, calc.contadores.par, calc.contadores.superior, calc.contadores.auto,
              calc.ipl, calc.ipl_subordinados, calc.ipl_pares, calc.ipl_superiores, calc.ipl_auto,
              calc.gap_auto_subordinados, calc.classificacao, JSON.stringify(calc.dimensoes),
              relatorioGestor, relatorioAdmin, flagCritico
            ]
          );

          const nome = av.gestor_nome, emp = av.empresa_nome;
          if (calc.ipl < 40) await iplNotificarAdmin({ tipoAlerta:'critico', gestorNome:nome, empresaNome:emp, iplScore:calc.ipl, detalhe:'Risco psicossocial elevado.' });
          else if (calc.ipl_subordinados != null && calc.ipl_subordinados < 40) await iplNotificarAdmin({ tipoAlerta:'subordinados', gestorNome:nome, empresaNome:emp, iplScore:calc.ipl, detalhe:`Subordinados avaliam com IPL ${calc.ipl_subordinados}.` });
          else if (calc.gap_auto_subordinados != null && calc.gap_auto_subordinados > 30) await iplNotificarAdmin({ tipoAlerta:'gap', gestorNome:nome, empresaNome:emp, iplScore:calc.ipl, detalhe:`Autoavaliação ${calc.gap_auto_subordinados} pontos acima dos subordinados.` });
          if (calc.ipl < 40) await pool.query('UPDATE avaliacoes_ipl SET notificacao_admin_enviada = TRUE WHERE id = $1', [id]);
        } catch(genErr) {
          const msg = genErr.message && genErr.message.includes('API_KEY') ? 'CLAUDE_API_KEY não configurada nas variáveis do Railway.' : (genErr.message || 'Erro ao gerar relatório.');
          console.error('[ipl/gerar-relatorio bg]', msg);
          try { await pool.query('UPDATE avaliacoes_ipl SET gerando = FALSE, relatorio_erro = $2 WHERE id = $1', [id, msg]); } catch(_) {}
        }
      })();

      json(200, { ok: true, status: 'gerando' });
    } catch(e) {
      console.error('[ipl/gerar-relatorio]', e.message);
      json(500, { ok: false, error: e.message || 'Erro ao iniciar geração.' });
    }
    return;
  }

  // ── GET /api/ipl/avaliacao?codigo=&tipo= (avaliador, público) ───
  if (req.method !== 'POST' && url === '/api/ipl/avaliacao') {
    try {
      const codigo = params.get('codigo'); const tipo = params.get('tipo');
      if (!codigo || !IPL_TIPOS_VALIDOS.includes(tipo)) return json(400, { ok: false, error: 'Link inválido.' });
      const r = await pool.query('SELECT gestor_nome, empresa_nome, status FROM avaliacoes_ipl WHERE codigo_avaliacao = $1', [codigo]);
      if (!r.rows.length) return json(404, { ok: false, error: 'Avaliação não encontrada. Verifique o link recebido.' });
      if (r.rows[0].status === 'relatorio_gerado' || r.rows[0].status === 'entregue')
        return json(409, { ok: false, error: 'Esta avaliação já foi encerrada.' });
      json(200, { ok: true, gestorNome: r.rows[0].gestor_nome, empresaNome: r.rows[0].empresa_nome, tipo });
    } catch(e) { console.error('[ipl/avaliacao]', e.message); json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── POST /api/ipl/responder (avaliador, público) ───────────────
  if (req.method === 'POST' && url === '/api/ipl/responder') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ipl_responder', 20, 3600000))
      return json(429, { ok: false, error: 'Muitas respostas enviadas. Tente novamente mais tarde.' });
    try {
      const { codigo, tipo, respostas } = await readBody(req);
      if (!codigo || !IPL_TIPOS_VALIDOS.includes(tipo) || !respostas)
        return json(400, { ok: false, error: 'Dados incompletos.' });
      // valida 32 respostas 1–5
      for (let i = 1; i <= 32; i++) {
        const v = parseInt(respostas['q'+i], 10);
        if (!(v >= 1 && v <= 5)) return json(400, { ok: false, error: `Responda todas as 32 perguntas (faltou a ${i}).` });
      }
      const avRes = await pool.query('SELECT id, status FROM avaliacoes_ipl WHERE codigo_avaliacao = $1', [codigo]);
      if (!avRes.rows.length) return json(404, { ok: false, error: 'Avaliação não encontrada.' });
      const av = avRes.rows[0];
      if (av.status === 'relatorio_gerado' || av.status === 'entregue')
        return json(409, { ok: false, error: 'Esta avaliação já foi encerrada.' });

      const pontuacoes = iplPontuacoesPorDimensao(respostas);
      await pool.query(
        'INSERT INTO respostas_ipl (avaliacao_id, tipo_avaliador, respostas, pontuacoes_dimensoes) VALUES ($1,$2,$3,$4)',
        [av.id, tipo, JSON.stringify(respostas), JSON.stringify(pontuacoes)]
      );
      const col = { subordinado:'qtd_subordinados', par:'qtd_pares', superior:'qtd_superiores', auto:'qtd_auto' }[tipo];
      await pool.query(`UPDATE avaliacoes_ipl SET ${col} = ${col} + 1, total_avaliadores = total_avaliadores + 1 WHERE id = $1`, [av.id]);
      // atualiza status quando o mínimo é atingido
      await pool.query(
        `UPDATE avaliacoes_ipl SET status = 'minimo_atingido'
         WHERE id = $1 AND status = 'coletando' AND qtd_subordinados >= 3 AND total_avaliadores >= 6`,
        [av.id]
      );
      json(200, { ok: true });
    } catch(e) { console.error('[ipl/responder]', e.message); json(500, { ok: false, error: 'Erro ao enviar resposta.' }); }
    return;
  }

  // ── GET /api/ipl/relatorio?codigo=&versao= (relatório) ──────────
  if (req.method !== 'POST' && url === '/api/ipl/relatorio') {
    try {
      const codigo = params.get('codigo');
      const versao = params.get('versao') === 'admin' ? 'admin' : 'gestor';
      if (!codigo) return json(400, { ok: false, error: 'codigo obrigatório.' });
      if (versao === 'admin' && !requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
      const r = await pool.query('SELECT * FROM avaliacoes_ipl WHERE codigo_avaliacao = $1', [codigo]);
      if (!r.rows.length) return json(404, { ok: false, error: 'Relatório não encontrado.' });
      const av = r.rows[0];
      if (av.status !== 'relatorio_gerado' && av.status !== 'entregue')
        return json(409, { ok: false, error: 'Relatório ainda não foi gerado.' });
      json(200, {
        ok: true,
        gestorNome: av.gestor_nome, gestorCargo: av.gestor_cargo, gestorSetor: av.gestor_setor,
        empresaNome: av.empresa_nome, codigo: av.codigo_avaliacao,
        iplScore: av.ipl_score, classificacao: av.classificacao_ipl,
        iplSubordinados: av.ipl_subordinados, iplPares: av.ipl_pares, iplSuperiores: av.ipl_superiores, iplAuto: av.ipl_auto,
        gap: av.gap_auto_subordinados, dimensoes: av.pontuacoes_dimensoes,
        relatorio: versao === 'admin' ? av.relatorio_admin : av.relatorio_gestor,
        geradoEm: av.relatorio_gerado_em
      });
    } catch(e) { console.error('[ipl/relatorio]', e.message); json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /api/ipl/admin/lista (admin — dashboard executivo) ──────
  if (req.method !== 'POST' && url === '/api/ipl/admin/lista') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const r = await pool.query(
        `SELECT id, empresa_id, empresa_nome, gestor_nome, gestor_setor, codigo_avaliacao,
                status, ipl_score, ipl_subordinados, classificacao_ipl, flag_risco_critico,
                gap_auto_subordinados, criado_em, relatorio_gerado_em
         FROM avaliacoes_ipl ORDER BY criado_em DESC`
      );
      json(200, { ok: true, avaliacoes: r.rows });
    } catch(e) { console.error('[ipl/admin/lista]', e.message); json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /api/ipl/admin/correlacao?empresa= (IPL × ISEP por setor) ─
  if (req.method !== 'POST' && url === '/api/ipl/admin/correlacao') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const empresaId = params.get('empresa');
      if (!empresaId) return json(400, { ok: false, error: 'empresa é obrigatório.' });
      // IPL médio por setor (gestores com relatório gerado)
      const iplRes = await pool.query(
        `SELECT COALESCE(gestor_setor,'Não informado') AS setor,
                ROUND(AVG(ipl_score))::int AS ipl, COUNT(*) AS gestores
         FROM avaliacoes_ipl
         WHERE empresa_id = $1 AND ipl_score IS NOT NULL
         GROUP BY COALESCE(gestor_setor,'Não informado')`,
        [empresaId]
      );
      // ISEP médio por setor (média do nível de risco × 20, mín. 3 conversas)
      const isepRes = await pool.query(
        `SELECT COALESCE(setor,'Não informado') AS setor,
                ROUND(AVG(nivel_risco) * 20)::int AS isep, COUNT(*) AS conversas
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1 AND status IN ('encerrada','encaminhada') AND nivel_risco IS NOT NULL
         GROUP BY COALESCE(setor,'Não informado')`,
        [empresaId]
      );
      const isepMap = {}; isepRes.rows.forEach(r => { if (r.conversas >= 3) isepMap[r.setor] = r.isep; });
      const correlacao = iplRes.rows.map(r => ({
        setor: r.setor, ipl: r.ipl, gestores: parseInt(r.gestores,10),
        isep: isepMap[r.setor] != null ? isepMap[r.setor] : null,
        critico: (r.ipl < 60 && isepMap[r.setor] != null && isepMap[r.setor] >= 60)
      }));
      json(200, { ok: true, correlacao });
    } catch(e) { console.error('[ipl/admin/correlacao]', e.message); json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── Páginas IPL ────────────────────────────────────────────────
  if (url === '/ipl-avaliar') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'ipl-avaliar.html')).pipe(res);
    return;
  }
  if (url === '/ipl-relatorio') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'ipl-relatorio.html')).pipe(res);
    return;
  }
  if (url === '/ipl-admin') {
    if (!requireAdminAuth(req)) { res.writeHead(302, { Location: '/' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'ipl-admin.html')).pipe(res);
    return;
  }

  // ══ IA INSIGHTS — CLAUDE API ════════════════════════════════════

  const IA_SYSTEM_PROMPT = `Você é a AXIS IA, especialista sênior em Saúde Mental no Trabalho e Riscos Psicossociais, assistente técnica da consultoria AXIS (consultora Clau Diniz, Especialista em NR-1). Você apoia a consultora em dúvidas técnicas de NR-1, na análise de pesquisas (MRP) e na análise de reuniões com clientes.

BASE TÉCNICA (fundamente-se nestas fontes; não vá além delas sem avisar):
- Texto oficial da NR-1 (GRO e PGR), com destaque ao Capítulo 1.5 — Gerenciamento de Riscos Ocupacionais.
- Portaria MTE nº 1.419/2024, que inclui expressamente os fatores de riscos psicossociais no GRO (vigência a partir de 26/05/2025).
- Guia do MTE sobre Fatores de Riscos Psicossociais Relacionados ao Trabalho (2025) e manuais oficiais do MTE/Fundacentro.
- Instrumentos técnicos: COPSOQ III (Copenhagen Psychosocial Questionnaire) e modelo Demanda-Controle de Karasek-Theorell (1990).
- Legislação correlata: CLT, Lei 14.457/2022 (CIPA) e Resolução CFP 013/2022.

REGRAS DE COMPORTAMENTO (inegociáveis):
1. NUNCA invente. Não crie números, multas, estatísticas, prazos ou citações de itens sem certeza. Faltando base, diga claramente que não há base normativa/técnica suficiente e recomende consultar a fonte oficial (MTE).
2. FUNDAMENTE: quando pertinente, cite o dispositivo (ex.: NR-1, Cap. 1.5 — GRO) ou o documento de origem. Não force a citação de um item que você não conhece.
3. SEM opinião pessoal — interprete tecnicamente, não emita achismos.
4. SEPARE fato de hipótese. Ao analisar dados ou reuniões, baseie-se APENAS no que foi efetivamente apresentado; sinalize com clareza o que é hipótese ou o que faltou informação.
5. CAUTELA com riscos graves: não classifique "assédio moral/sexual" ou "burnout" como confirmados sem evidência explícita — trate como sinal de alerta que exige apuração técnica. Ao identificar risco crítico, alerte sobre as obrigações legais (NR-1, Lei 14.457/2022).
6. NÃO substitui consultoria jurídica nem decisão final — é apoio técnico.

Responda sempre em português do Brasil, com tom técnico, claro e objetivo. Quando o pedido especificar um formato de saída (JSON ou seções em Markdown), siga-o exatamente.`;

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

  // ── POST /api/ia-insights/analyze-meeting ────────────────────────
  if (req.method === 'POST' && url === '/api/ia-insights/analyze-meeting') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'ia', 30, 3600000))
      return json(429, { ok: false, error: 'Limite de requisições IA atingido.' });
    try {
      const { transcricao, empresa, participantes, objetivo, contexto } = await readBody(req);
      if (!transcricao || !transcricao.trim())
        return json(400, { ok: false, error: 'transcrição é obrigatória.' });

      const prompt = `Analise a TRANSCRIÇÃO da reunião abaixo, com base APENAS no que foi efetivamente dito (cite trechos quando possível; não invente).

DADOS DA REUNIÃO
- Empresa: ${empresa || '(não informado)'}
- Participantes: ${participantes || '(não informado)'}
- Objetivo declarado: ${objetivo || '(não informado)'}
${contexto ? `- Contexto adicional: ${contexto}\n` : ''}
TRANSCRIÇÃO
"""
${transcricao.trim()}
"""

Produza a análise em Markdown, com EXATAMENTE estas seções:

# Análise da Reunião
## 1. Resumo Executivo
## 2. O que o cliente quer / Principais dores
## 3. Riscos Psicossociais Identificados
Para cada fator — Comunicação, Liderança, Carga de Trabalho, Autonomia, Reconhecimento, Relacionamentos, Assédio, Mudanças Organizacionais, Jornada, Saúde Mental, Clima — informe o nível (Baixo/Moderado/Alto/Crítico) e a evidência na fala. Use "Não evidenciado" quando não houver base.
## 4. Decisões e Encaminhamentos
Responsável e prazo quando houver.
## 5. Perguntas a fazer na próxima conversa
De 5 a 8 perguntas.
## 6. Próximos Passos
## 7. Módulos AXIS Recomendados
Recomende SOMENTE módulos desta lista, com justificativa técnica; diga claramente quando faltar evidência para recomendar: Diagnóstico de Riscos Psicossociais (MRP / Relatório NR-1); IRP — Pesquisa Trimestral; Screening de Burnout; Escuta Ativa; Lideranças 360° (IPL); Canal de Denúncias (Relato Seguro); Rastreamento de Casos (IRC); Indicadores de Saúde; Diversidade & Inclusão; Plano de Ação NR-1.
## 8. Alerta
Apenas se houver risco crítico ou sinais que exijam apuração imediata; sem dramatizar e sem cravar conclusão sem prova.`;

      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: IA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      });

      json(200, { ok: true, relatorio: response.content[0].text });
    } catch(e) {
      console.error('IA meeting error:', e.message);
      json(500, { ok: false, error: e.message.includes('API_KEY') ? 'CLAUDE_API_KEY não configurada.' : 'Erro ao analisar reunião.' });
    }
    return;
  }

  // ── Histórico de reuniões (tabela axis_reunioes) ─────────────────
  if (req.method === 'GET' && url === '/api/ia-insights/reunioes') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { rows } = await pool.query('SELECT id, dados, updated_at FROM axis_reunioes ORDER BY updated_at DESC LIMIT 200');
      const reunioes = rows.map(r => ({ id: r.id, ...(r.dados || {}), updated_at: r.updated_at }));
      json(200, { ok: true, reunioes });
    } catch(e) { console.error('reunioes list error:', e.message); json(500, { ok: false, error: 'Erro ao listar reuniões.' }); }
    return;
  }
  if (req.method === 'POST' && url === '/api/ia-insights/reunioes/delete') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const { id } = await readBody(req);
      if (id) await pool.query('DELETE FROM axis_reunioes WHERE id = $1', [id]);
      json(200, { ok: true });
    } catch(e) { console.error('reunioes del error:', e.message); json(500, { ok: false, error: 'Erro ao excluir reunião.' }); }
    return;
  }
  if (req.method === 'POST' && url === '/api/ia-insights/reunioes') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const body = await readBody(req);
      const id = body.id || `REU_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const dados = body.dados || {};
      await pool.query(
        `INSERT INTO axis_reunioes (id, dados, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (id) DO UPDATE SET dados = $2, updated_at = NOW()`,
        [id, JSON.stringify(dados)]
      );
      json(200, { ok: true, id });
    } catch(e) { console.error('reunioes save error:', e.message); json(500, { ok: false, error: 'Erro ao salvar reunião.' }); }
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

  // ── POST /api/quiz-lead — salva lead do quiz (público) ───────
  if (req.method === 'POST' && url === '/api/quiz-lead') {
    try {
      const { nome, email, whatsapp, score, resultado } = await readBody(req);
      if (!nome || !email) return json(400, { ok: false, error: 'Nome e e-mail obrigatórios.' });
      const id = 'ql_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      await pool.query(
        `INSERT INTO quiz_leads (id, nome, email, whatsapp, score, resultado) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, nome.trim(), email.trim().toLowerCase(), (whatsapp||'').trim(), score, resultado]
      );
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /api/quiz-leads — lista leads (admin) ─────────────────
  if (url === '/api/quiz-leads') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const r = await pool.query(`SELECT * FROM quiz_leads ORDER BY created_at DESC`);
      json(200, { ok: true, leads: r.rows });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── Quiz público NR-1 para Escolas — sem autenticação ────────
  if (url === '/quiz-escolas') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'public', 'quiz-escolas.html')).pipe(res);
    return;
  }

  // ── Quiz público NR-1 para Laboratórios — sem autenticação ───
  if (url === '/quiz-laboratorios') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'public', 'quiz-laboratorios.html')).pipe(res);
    return;
  }

  // ── POST /api/quiz-laboratorios/lead — salva lead (público) ──
  if (req.method === 'POST' && url === '/api/quiz-laboratorios/lead') {
    try {
      const { nome, email, whatsapp, cargo, perfil_resultado, pontuacao, respostas } = await readBody(req);
      const id = 'qll_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      await pool.query(
        `INSERT INTO quiz_leads_laboratorios (id, nome, email, whatsapp, cargo, perfil_resultado, pontuacao, respostas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [id, nome||null, email||null, whatsapp||null, cargo||null, perfil_resultado||null, pontuacao||null, JSON.stringify(respostas||{})]
      );
      json(200, { ok: true });
    } catch(e) { console.error('Erro ao salvar lead quiz lab:', e); json(500, { ok: false }); }
    return;
  }

  // ── GET /api/quiz-leads-laboratorios — lista leads (público para painel) ──
  if (url === '/api/quiz-leads-laboratorios') {
    try {
      const r = await pool.query('SELECT * FROM quiz_leads_laboratorios ORDER BY criado_em DESC');
      json(200, { ok: true, leads: r.rows });
    } catch(e) { json(500, { erro: 'Erro ao buscar leads' }); }
    return;
  }

  // ── Quiz público NR-1 para Seguradoras — sem autenticação ────
  if (url === '/quiz-seguradoras') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'public', 'quiz-seguradoras.html')).pipe(res);
    return;
  }

  // ── POST /api/quiz-seguradoras/lead — salva lead (público) ───
  if (req.method === 'POST' && url === '/api/quiz-seguradoras/lead') {
    try {
      const { nome, email, whatsapp, cargo, resultado, pontuacao } = await readBody(req);
      const id = 'qls_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
      await pool.query(
        `INSERT INTO quiz_leads_seguradoras (id, nome, email, whatsapp, cargo, resultado, pontuacao)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, nome||null, email||null, whatsapp||null, cargo||null, resultado||null, pontuacao||null]
      );
      json(200, { ok: true });
    } catch(e) { console.error('Erro ao salvar lead quiz seguradoras:', e); json(500, { ok: false }); }
    return;
  }

  // ── GET /api/quiz-leads-seguradoras — lista leads (painel) ───
  if (url === '/api/quiz-leads-seguradoras') {
    try {
      const r = await pool.query('SELECT * FROM quiz_leads_seguradoras ORDER BY criado_em DESC');
      json(200, { ok: true, leads: r.rows });
    } catch(e) { json(500, { erro: 'Erro ao buscar leads' }); }
    return;
  }

  // ── Axis Safe Report — Canal de Denúncia ─────────────────────

  // Diagnóstico público — verifica se as tabelas de denúncia existem
  if (url === '/api/axia/denuncia/ping') {
    try {
      const t1 = await pool.query(`SELECT to_regclass('public.axis_company_codes') AS t`);
      const t2 = await pool.query(`SELECT to_regclass('public.axis_denuncias') AS t`);
      const codes = t1.rows[0].t;
      const den   = t2.rows[0].t;
      if (!codes || !den) {
        // Tabela não existe — criar agora
        await pool.query(`CREATE TABLE IF NOT EXISTS axis_company_codes (company_id TEXT PRIMARY KEY, codigo_publico VARCHAR(12) NOT NULL UNIQUE, created_at TIMESTAMPTZ DEFAULT NOW())`);
        await pool.query(`CREATE TABLE IF NOT EXISTS axis_denuncias (id SERIAL PRIMARY KEY, protocolo VARCHAR(20) NOT NULL UNIQUE, company_id TEXT NOT NULL, categoria VARCHAR(80) NOT NULL, texto TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pendente', observacao TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_den_company   ON axis_denuncias(company_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_den_protocolo ON axis_denuncias(protocolo)`);
        return json(200, { ok: true, criadas: true, axis_company_codes: !!codes, axis_denuncias: !!den, msg: 'Tabelas criadas agora' });
      }
      return json(200, { ok: true, criadas: false, axis_company_codes: !!codes, axis_denuncias: !!den, msg: 'Tabelas OK' });
    } catch(e) {
      return json(500, { ok: false, erro: e.message });
    }
  }

  // Bloco A — Submissão pública de denúncia
  if (req.method === 'POST' && url === '/api/axia/denuncia/submit') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'denuncia_submit', 5, 3600000))
      return json(429, { erro: 'Muitas tentativas. Aguarde 1 hora e tente novamente.' });
    try {
      const { empresa_codigo, email, categoria, texto } = await readBody(req);
      if (!empresa_codigo || !email || !categoria || !texto)
        return json(400, { erro: 'Todos os campos são obrigatórios.' });
      if (texto.trim().length < 20)
        return json(400, { erro: 'Descreva com mais detalhes (mínimo 20 caracteres).' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json(400, { erro: 'E-mail inválido.' });
      const codResult = await pool.query(
        'SELECT company_id FROM axis_company_codes WHERE codigo_publico = $1',
        [empresa_codigo.toUpperCase()]
      );
      if (codResult.rows.length === 0)
        return json(404, { erro: 'Empresa não encontrada. Verifique o link recebido.' });
      const companyId = codResult.rows[0].company_id;
      let protocolo, tentativas = 0;
      do {
        protocolo = gerarProtocolo();
        const existe = await pool.query('SELECT id FROM axis_denuncias WHERE protocolo = $1', [protocolo]);
        if (existe.rows.length === 0) break;
      } while (++tentativas < 5);
      // 1. Salvar denúncia PRIMEIRO — email é melhor esforço
      await pool.query(
        `INSERT INTO axis_denuncias (protocolo, company_id, categoria, texto, status) VALUES ($1, $2, $3, $4, 'pendente')`,
        [protocolo, companyId, categoria, texto.trim()]
      );
      // 1b. Auto-criar caso no Rastreamento (best-effort; nunca quebra o registro da denúncia)
      await criarCasoDeDenuncia(companyId, protocolo, categoria);
      // 2. Tentar enviar email — falha não cancela o registro
      let emailEnviado = false;
      try {
        const emailConfig = loadEmailConfig();
        if (emailConfig.resendKey || (emailConfig.user && emailConfig.pass)) {
          const baseUrl = SERVER_URL;
          await sendEmail({
            to: email, toName: 'Colaborador(a)',
            subject: `Seu relato foi registrado — Protocolo ${protocolo}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;"><div style="background:#1a1a1a;padding:28px;border-radius:10px 10px 0 0;text-align:center;"><h1 style="color:#c9a84c;margin:0;font-size:22px;">AXIS <span style="font-weight:300">IA</span></h1><p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">Canal de Relato Seguro</p></div><div style="background:#f9f9f7;padding:32px;border-radius:0 0 10px 10px;border:1px solid #eee;"><h2 style="font-size:17px;color:#1a1a1a;margin-top:0;">Seu relato foi registrado ✓</h2><p style="color:#555;line-height:1.7;font-size:14px;">Sua ocorrência foi recebida e será encaminhada ao responsável da empresa <strong>sem nenhuma informação que permita sua identificação.</strong></p><div style="background:#1a1a1a;border-radius:10px;padding:22px;text-align:center;margin:24px 0;"><p style="color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Número de Protocolo</p><p style="color:#c9a84c;font-size:30px;font-weight:800;letter-spacing:3px;margin:0;">${protocolo}</p></div><p style="color:#555;line-height:1.7;font-size:14px;">Guarde este número. Consulte o status em <a href="${baseUrl}/denuncia.html" style="color:#c9a84c;">${baseUrl}/denuncia.html</a> sem se identificar.</p><p style="color:#aaa;font-size:12px;border-top:1px solid #ddd;padding-top:16px;margin-top:24px;">Seu endereço de e-mail <strong>não foi armazenado</strong> nos registros do sistema.</p></div></div>`,
            config: emailConfig
          });
          emailEnviado = true;
        }
      } catch (emailErr) {
        console.error('[denuncia/submit] Email falhou (denúncia salva):', emailErr.message);
      }
      const msg = emailEnviado
        ? 'Relato registrado. Confira seu e-mail para o número de protocolo.'
        : 'Relato registrado com sucesso. Anote o protocolo abaixo.';
      return json(201, { sucesso: true, protocolo, mensagem: msg });
    } catch (err) {
      console.error('[denuncia/submit] Erro:', err.message, err.stack);
      return json(500, { erro: 'Erro interno. Tente novamente em instantes.' });
    }
  }

  // Bloco B — Consulta de status por protocolo (público)
  if (url === '/api/axia/denuncia/status') {
    const protocolo = (params.get('protocolo') || '').trim().toUpperCase();
    if (protocolo.length < 10) return json(400, { erro: 'Protocolo inválido.' });
    try {
      const result = await pool.query(
        `SELECT protocolo, categoria, status, created_at AS "registradoEm", updated_at AS "atualizadoEm"
         FROM axis_denuncias WHERE protocolo = $1`,
        [protocolo]
      );
      if (result.rows.length === 0) return json(404, { erro: 'Protocolo não encontrado.' });
      return json(200, result.rows[0]);
    } catch (err) {
      console.error('[denuncia/status] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // Bloco C — Listagem de denúncias para o RH (privado)
  if (url === '/api/axia/denuncias') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const unlocked = await isApuracaoUnlocked(params.get('token'));
      const result = await pool.query(
        `SELECT protocolo, categoria, texto, status, observacao,
                created_at AS "criadoEm", updated_at AS "atualizadoEm"
         FROM axis_denuncias WHERE company_id = $1 ORDER BY created_at DESC`,
        [co.id]
      );
      // Sem desbloqueio, o teor (texto) não é enviado ao cliente — só metadados.
      const denuncias = result.rows.map(r => unlocked ? r : { ...r, texto: null, textoBloqueado: true });
      return json(200, { total: denuncias.length, desbloqueado: unlocked, denuncias });
    } catch (err) {
      console.error('[denuncias] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // Bloco D — Atualização de status pelo RH (privado, método PUT)
  if (req.method === 'PUT' && url.startsWith('/api/axia/denuncia/')) {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const protocolo = url.split('/api/axia/denuncia/')[1]?.split('?')[0]?.toUpperCase();
    if (!protocolo) return json(400, { erro: 'Protocolo obrigatório.' });
    const { status, observacao } = await readBody(req);
    const statusValidos = ['pendente','em_analise','em_tratamento','concluida','arquivada'];
    if (!statusValidos.includes(status)) return json(400, { erro: 'Status inválido.' });
    try {
      const result = await pool.query(
        `UPDATE axis_denuncias SET status = $1, observacao = $2, updated_at = NOW()
         WHERE protocolo = $3 AND company_id = $4 RETURNING protocolo, status`,
        [status, observacao || null, protocolo, co.id]
      );
      if (result.rows.length === 0) return json(404, { erro: 'Denúncia não encontrada.' });
      return json(200, { sucesso: true, ...result.rows[0] });
    } catch (err) {
      console.error('[denuncia/update] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // ══ Apuração — PIN de acesso ao teor (Relato Seguro + Rastreamento) ══
  // GET /api/axia/apuracao/status?token=T
  if (req.method === 'GET' && url === '/api/axia/apuracao/status') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const desbloqueado = await isApuracaoUnlocked(params.get('token'));
    return json(200, { ok: true, pinConfigurado: !!co.apuracaoPinHash, desbloqueado });
  }

  // POST /api/axia/apuracao/pin?token=T { pin, pinAtual } → define/troca o PIN
  if (req.method === 'POST' && url === '/api/axia/apuracao/pin') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { pin, pinAtual } = await readBody(req);
      if (!pin || !/^\d{4,}$/.test(String(pin))) return json(400, { erro: 'O PIN deve ter ao menos 4 dígitos numéricos.' });
      const d = await loadData();
      const idx = (d.axiaCompanies || []).findIndex(c => c.id === co.id);
      if (idx < 0) return json(404, { erro: 'Empresa não encontrada.' });
      if (d.axiaCompanies[idx].apuracaoPinHash) {
        const ok = pinAtual && await bcrypt.compare(String(pinAtual), d.axiaCompanies[idx].apuracaoPinHash);
        if (!ok) return json(403, { erro: 'PIN atual incorreto.' });
      }
      d.axiaCompanies[idx].apuracaoPinHash = await bcrypt.hash(String(pin), 12);
      await saveData(d);
      return json(200, { ok: true });
    } catch (e) { console.error('[apuracao/pin]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // POST /api/axia/apuracao/unlock?token=T { pin } → desbloqueia o teor na sessão
  if (req.method === 'POST' && url === '/api/axia/apuracao/unlock') {
    const token = params.get('token');
    const co = await getAxiaSession(token);
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    if (!co.apuracaoPinHash) return json(409, { ok: false, error: 'PIN de Apuração ainda não configurado.', naoConfigurado: true });
    try {
      const { pin } = await readBody(req);
      const ok = pin && await bcrypt.compare(String(pin), co.apuracaoPinHash);
      if (!ok) return json(403, { ok: false, error: 'PIN incorreto.' });
      const d = await loadData();
      if (d.axiaSessions && d.axiaSessions[token]) { d.axiaSessions[token].apuracaoUnlocked = true; await saveData(d); }
      return json(200, { ok: true });
    } catch (e) { console.error('[apuracao/unlock]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // POST /api/axia/apuracao/lock?token=T → re-bloqueia o teor na sessão
  if (req.method === 'POST' && url === '/api/axia/apuracao/lock') {
    const token = params.get('token');
    const co = await getAxiaSession(token);
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const d = await loadData();
    if (d.axiaSessions && d.axiaSessions[token]) { delete d.axiaSessions[token].apuracaoUnlocked; await saveData(d); }
    return json(200, { ok: true });
  }

  // ══ Rastreamento de Casos (IRC) ════════════════════════════════
  // Rotas específicas (/irc, /from-*) declaradas ANTES das genéricas (/:id).

  // GET /api/axia/casos/irc?token=T → IRC da empresa
  if (req.method === 'GET' && url === '/api/axia/casos/irc') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const casos = await listarCasos(co.id);
      return json(200, { ok: true, irc: calcularIRC(casos), total: casos.length });
    } catch (e) { console.error('[casos/irc]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // POST /api/axia/casos/from-denuncia?token=T  { protocolo }
  if (req.method === 'POST' && url === '/api/axia/casos/from-denuncia') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { protocolo } = await readBody(req);
      if (!protocolo) return json(400, { erro: 'Protocolo obrigatório.' });
      const proto = String(protocolo).toUpperCase();
      const r = await pool.query('SELECT categoria FROM axis_denuncias WHERE protocolo = $1 AND company_id = $2', [proto, co.id]);
      if (!r.rows.length) return json(404, { erro: 'Denúncia não encontrada.' });
      const existentes = await listarCasos(co.id);
      const dup = existentes.find(c => c.origem === 'denuncia' && c.origem_ref === proto);
      if (dup) return json(200, { ok: true, caso: dup, jaExistia: true });
      const caso = await criarCasoDeDenuncia(co.id, proto, r.rows[0].categoria);
      if (!caso) return json(500, { erro: 'Não foi possível criar o caso.' });
      return json(201, { ok: true, caso });
    } catch (e) { console.error('[casos/from-denuncia]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // POST /api/axia/casos/from-escuta?token=T  { conversa_id }
  if (req.method === 'POST' && url === '/api/axia/casos/from-escuta') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { conversa_id } = await readBody(req);
      if (!conversa_id) return json(400, { erro: 'conversa_id obrigatório.' });
      const r = await pool.query(
        `SELECT codigo_anonimo, setor, nivel_risco, flag_assedio, resumo_conversa, temas_identificados
         FROM conversas_escuta_ativa WHERE id = $1 AND empresa_id = $2`, [conversa_id, co.id]);
      if (!r.rows.length) return json(404, { erro: 'Conversa não encontrada.' });
      const cv = r.rows[0];
      const existentes = await listarCasos(co.id);
      const dup = existentes.find(c => c.origem === 'escuta-ativa' && c.origem_ref === cv.codigo_anonimo);
      if (dup) return json(200, { ok: true, caso: dup, jaExistia: true });
      const tipo = cv.flag_assedio ? 'assedio_moral' : 'outro';
      const temas = Array.isArray(cv.temas_identificados) ? cv.temas_identificados.join(', ') : '';
      const caso = await criarCaso(co.id, {
        origem: 'escuta-ativa',
        origem_ref: cv.codigo_anonimo,
        titulo: `Escuta Ativa ${cv.codigo_anonimo} — ${temas || 'acolhimento'}`,
        tipo,
        nivel_risco: cv.nivel_risco || 3,
        setor: cv.setor || 'Não informado',
        descricao: cv.resumo_conversa || 'Caso aberto a partir de conversa de Escuta Ativa.',
        flag_assedio: !!cv.flag_assedio,
        sla_dias: CASO_SLA_PADRAO[tipo] || 7
      });
      return json(201, { ok: true, caso });
    } catch (e) { console.error('[casos/from-escuta]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // POST /api/axia/casos/sync?token=T → importa denúncias e escutas ainda não rastreadas
  if (req.method === 'POST' && url === '/api/axia/casos/sync') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const r = await sincronizarCasos(co.id);
      return json(200, { ok: true, ...r });
    } catch (e) { console.error('[casos/sync]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // GET /api/axia/casos?token=T → lista todos os casos da empresa
  if (req.method === 'GET' && url === '/api/axia/casos') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const unlocked = await isApuracaoUnlocked(params.get('token'));
      const casos = (await listarCasos(co.id)).map(c => mascararCasoTeor(c, unlocked));
      return json(200, { ok: true, total: casos.length, desbloqueado: unlocked, casos });
    } catch (e) { console.error('[casos/list]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // POST /api/axia/casos?token=T → cria caso manual
  if (req.method === 'POST' && url === '/api/axia/casos') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const body = await readBody(req);
      if (!body.titulo || !String(body.titulo).trim()) return json(400, { erro: 'Título obrigatório.' });
      if (casoContemCPF(body.descricao) || casoContemCPF(body.titulo))
        return json(400, { erro: 'Remova dados identificadores (CPF). O anonimato do colaborador deve ser preservado.' });
      const caso = await criarCaso(co.id, { ...body, origem: body.origem || 'manual' });
      return json(201, { ok: true, caso });
    } catch (e) { console.error('[casos/create]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // Rotas por id: /api/axia/casos/:id  e  /api/axia/casos/:id/acoes
  const casoAcoesMatch = url.match(/^\/api\/axia\/casos\/([A-Za-z0-9\-]+)\/acoes$/);
  const casoIdMatch    = url.match(/^\/api\/axia\/casos\/([A-Za-z0-9\-]+)$/);

  // POST /api/axia/casos/:id/acoes?token=T → registra ação no histórico
  if (req.method === 'POST' && casoAcoesMatch) {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const casoId = casoAcoesMatch[1];
    try {
      const { descricao, autor } = await readBody(req);
      if (!descricao || !String(descricao).trim()) return json(400, { erro: 'Descrição da ação obrigatória.' });
      if (casoContemCPF(descricao)) return json(400, { erro: 'Remova dados identificadores (CPF) da ação.' });
      const r = await pool.query('SELECT dados FROM axis_casos WHERE id = $1 AND company_id = $2', [casoId, co.id]);
      if (!r.rows.length) return json(404, { erro: 'Caso não encontrado.' });
      const caso = typeof r.rows[0].dados === 'string' ? JSON.parse(r.rows[0].dados) : r.rows[0].dados;
      const acao = { data: new Date().toISOString(), autor: String(autor || 'RH').slice(0, 60), descricao: String(descricao).trim() };
      caso.acoes_realizadas = caso.acoes_realizadas || [];
      caso.acoes_realizadas.unshift(acao);
      caso.atualizado_em = acao.data;
      await pool.query('UPDATE axis_casos SET dados = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3', [JSON.stringify(caso), casoId, co.id]);
      return json(201, { ok: true, acao });
    } catch (e) { console.error('[casos/acoes]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // GET /api/axia/casos/:id?token=T → detalhe
  if (req.method === 'GET' && casoIdMatch) {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const r = await pool.query('SELECT dados FROM axis_casos WHERE id = $1 AND company_id = $2', [casoIdMatch[1], co.id]);
      if (!r.rows.length) return json(404, { erro: 'Caso não encontrado.' });
      let caso = typeof r.rows[0].dados === 'string' ? JSON.parse(r.rows[0].dados) : r.rows[0].dados;
      caso = mascararCasoTeor(caso, await isApuracaoUnlocked(params.get('token')));
      return json(200, { ok: true, caso });
    } catch (e) { console.error('[casos/get]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // PUT /api/axia/casos/:id?token=T → atualiza status/etapas/responsável/encaminhamento
  if (req.method === 'PUT' && casoIdMatch) {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const casoId = casoIdMatch[1];
    try {
      const body = await readBody(req);
      if (casoContemCPF(body.descricao) || casoContemCPF(body.responsavel))
        return json(400, { erro: 'Remova dados identificadores (CPF). O anonimato do colaborador deve ser preservado.' });
      const r = await pool.query('SELECT dados FROM axis_casos WHERE id = $1 AND company_id = $2', [casoId, co.id]);
      if (!r.rows.length) return json(404, { erro: 'Caso não encontrado.' });
      const caso = typeof r.rows[0].dados === 'string' ? JSON.parse(r.rows[0].dados) : r.rows[0].dados;

      // Atualização de etapa individual (toggle do detalhe)
      if (body.etapa) {
        caso.etapas = caso.etapas || {};
        caso.etapas[body.etapa] = !!body.etapa_valor;
      }
      if (body.etapas && typeof body.etapas === 'object') caso.etapas = { ...caso.etapas, ...body.etapas };

      ['titulo','descricao','responsavel','encaminhamento','encaminhamento_descricao','setor'].forEach(k => {
        if (body[k] !== undefined) caso[k] = body[k];
      });
      if (body.status && CASO_STATUS.includes(body.status)) caso.status = body.status;
      if (body.nivel_risco) caso.nivel_risco = Math.min(5, Math.max(1, parseInt(body.nivel_risco)));
      if (body.reincidencia !== undefined) caso.reincidencia = !!body.reincidencia;

      // data_encerramento: explícita do cliente, ou derivada do status.
      if (body.data_encerramento !== undefined && body.data_encerramento !== null) {
        caso.data_encerramento = body.data_encerramento;
      } else if (['resolvido','encerrado'].includes(caso.status)) {
        if (!caso.data_encerramento) caso.data_encerramento = new Date().toISOString();
      } else {
        caso.data_encerramento = null;
      }

      caso.atualizado_em = new Date().toISOString();
      await pool.query('UPDATE axis_casos SET dados = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3', [JSON.stringify(caso), casoId, co.id]);
      return json(200, { ok: true, caso });
    } catch (e) { console.error('[casos/update]', e.message); return json(500, { erro: 'Erro interno.' }); }
  }

  // ── PATCH /api/axia/escuta-ativa/conversa/:id ── inativar
  // DELETE /api/axia/escuta-ativa/conversa/:id ── excluir permanentemente
  const escutaConvMatch = url.match(/^\/api\/axia\/escuta-ativa\/conversa\/([\w-]+)$/);
  if (escutaConvMatch) {
    const convId = escutaConvMatch[1];
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sess\u00e3o inv\u00e1lida.' });
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const { status } = body;
      if (!['aberta','em_andamento','encerrada','encaminhada','inativa'].includes(status))
        return json(400, { ok: false, error: 'Status inv\u00e1lido.' });
      await pool.query(
        `UPDATE conversas_escuta_ativa SET status = $1 WHERE id = $2 AND empresa_id = $3`,
        [status, convId, co.id]
      );
      return json(200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await pool.query(
        `DELETE FROM conversas_escuta_ativa WHERE id = $1 AND empresa_id = $2`,
        [convId, co.id]
      );
      return json(200, { ok: true });
    }
  }

  // ── GET /api/axia/escuta-ativa/conversas?token=T ───────
  // Retorna contagens + lista de conversas + temas para o portal da empresa.
  if (req.method !== 'POST' && url === '/api/axia/escuta-ativa/conversas') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sess\u00e3o inv\u00e1lida.' });
    try {
      const rows = await pool.query(
        `SELECT id, codigo_anonimo, setor, status, iniciada_em,
                nivel_risco, temas_identificados, flag_assedio,
                identificado, nome_colaborador, telefone_colaborador
         FROM conversas_escuta_ativa
         WHERE empresa_id = $1
         ORDER BY iniciada_em DESC`,
        [co.id]
      );
      const conversas = rows.rows;
      const total      = conversas.length;
      const abertas    = conversas.filter(c => c.status === 'aberta').length;
      const andamento  = conversas.filter(c => c.status === 'em_andamento').length;
      const encerradas = conversas.filter(c => c.status === 'encerrada').length;
      const encaminhadas = conversas.filter(c => c.status === 'encaminhada').length;
      const temaCounts = {};
      conversas.forEach(c => {
        (c.temas_identificados || []).forEach(t => { temaCounts[t] = (temaCounts[t] || 0) + 1; });
      });
      const temas = Object.entries(temaCounts)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([tema, qtd]) => ({ tema, qtd }));
      const lista = conversas.map(c => ({
        id: c.id,
        codigo: c.codigo_anonimo,
        setor: c.setor || '\u2014',
        status: c.status,
        data: new Date(c.iniciada_em).toLocaleDateString('pt-BR'),
        nivel_risco: c.nivel_risco,
        flag_assedio: c.flag_assedio,
        identificado: c.identificado,
        nome: c.identificado ? c.nome_colaborador : null,
        telefone: c.identificado ? c.telefone_colaborador : null
      }));
      // Calcula ISEP a partir de conversas com nivel_risco definido
      const comRisco = conversas.filter(c => c.nivel_risco);
      const isep_score = comRisco.length === 0 ? null :
        Math.round((comRisco.reduce((s, c) => s + c.nivel_risco, 0) / comRisco.length) * 20);
      const isep_base  = comRisco.length;
      return json(200, { ok: true, total, abertas, andamento, encerradas, encaminhadas, temas, conversas: lista, isep_score, isep_base });
    } catch (err) {
      console.error('[escuta-ativa/conversas] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // ── GET /api/axia/escuta-ativa/link?token=T ──────────────────
  // Retorna o link do colaborador para o módulo Escuta Ativa.
  // Gera o codigo_publico lazily (mesmo código do canal de denúncias).
  if (url === '/api/axia/escuta-ativa/link') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      let codeResult = await pool.query(
        'SELECT codigo_publico FROM axis_company_codes WHERE company_id = $1', [co.id]
      );
      let codigo = codeResult.rows[0]?.codigo_publico;
      if (!codigo) {
        codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
        await pool.query(
          'INSERT INTO axis_company_codes (company_id, codigo_publico) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING',
          [co.id, codigo]
        );
      }
      const link = `${SERVER_URL}/escuta-ativa?c=${codigo}`;
      return json(200, { ok: true, link, codigo });
    } catch (err) {
      console.error('[escuta-ativa/link] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // ══ DIAGNÓSTICO NR-1 — link enviado ao cliente ═══════════════════
  // Fluxo: o portal cria um convite → manda o link pro cliente → o cliente
  // responde no celular → o resultado aparece SÓ no portal.

  // ── Página pública do respondente ──────────────────────────────
  if (url === '/diagnostico' || url.startsWith('/diagnostico?')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIR, 'diagnostico-responder.html')).pipe(res);
    return;
  }

  // ── GET /api/diagnostico/formulario?t=TOKEN (público) ──────────
  // Entrega as perguntas. Nenhum dado de resultado sai por aqui.
  if (url === '/api/diagnostico/formulario') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'diag_form', 60, 3600000))
      return json(429, { ok: false, error: 'Muitas tentativas. Tente novamente mais tarde.' });
    const t = params.get('t') || '';
    if (!t) return json(400, { ok: false, error: 'Link inválido.' });
    try {
      const r = await pool.query(
        'SELECT empresa_alvo, respondente, cargo, email, status, liberado FROM axis_diag_convites WHERE token = $1', [t]
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Link não encontrado ou expirado.' });
      const c = r.rows[0];
      return json(200, {
        ok: true,
        // 'excluido' se comporta como pendente para quem está com a página
        // aberta: a pessoa termina e o envio é gravado do mesmo jeito.
        status: c.status === 'excluido' ? 'pendente' : c.status,
        liberado: c.liberado === true,
        empresa_alvo: c.empresa_alvo,
        respondente: c.respondente || '',
        cargo: c.cargo || '',
        email: c.email || '',
        opcoes: DIAG_OPCOES,
        fatores: DIAG_FATORES.map(f => ({ nome: f.nome, perguntas: f.perguntas }))
      });
    } catch (err) {
      console.error('[diagnostico/formulario]', err.message);
      return json(500, { ok: false, error: 'Erro interno.' });
    }
  }

  // ── POST /api/diagnostico/responder (público) ──────────────────
  // 🔒 Devolve apenas { ok:true }. O cálculo roda no servidor e o
  // resultado não trafega de volta: quem responde não vê o diagnóstico.
  if (req.method === 'POST' && url === '/api/diagnostico/responder') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'diag_resp', 20, 3600000))
      return json(429, { ok: false, error: 'Limite de envios atingido.' });
    try {
      const { t, respostas, respondente, cargo, email } = await readBody(req);
      if (!t) return json(400, { ok: false, error: 'Link inválido.' });

      const r = await pool.query(
        'SELECT id, company_id, status FROM axis_diag_convites WHERE token = $1', [t]
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Link não encontrado ou expirado.' });
      const conv = r.rows[0];
      if (conv.status === 'respondido')
        return json(409, { ok: false, error: 'Este diagnóstico já foi respondido.' });
      // status 'excluido' segue aceito de propósito: a resposta de quem já
      // estava respondendo não pode ser perdida por um clique em Excluir.

      let calc;
      try { calc = diagCalcular(respostas); }
      catch (e) { return json(400, { ok: false, error: 'Responda todas as perguntas antes de enviar.' }); }

      const cx = await pool.connect();
      try {
        await cx.query('BEGIN');
        await cx.query(
        `INSERT INTO axis_diag_respostas (id, convite_id, company_id, respostas_json, fatores_json, pct, nivel, versao_protocolo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [diagId(), conv.id, conv.company_id, JSON.stringify(respostas),
         JSON.stringify(calc.fatores), calc.pct, calc.nivel, DIAG_VERSAO]
      );
        await cx.query(
        `UPDATE axis_diag_convites
            SET status = 'respondido', respondido_em = NOW(),
                respondente = COALESCE(NULLIF($2, ''), respondente),
                cargo       = COALESCE(NULLIF($3, ''), cargo),
                email       = COALESCE(NULLIF($4, ''), email)
          WHERE id = $1`,
        [conv.id, (respondente || '').trim().slice(0, 120), (cargo || '').trim().slice(0, 120),
         (email || '').trim().slice(0, 160)]
        );
        await cx.query('COMMIT');
      } catch (e) {
        await cx.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        cx.release();
      }

      return json(200, { ok: true });
    } catch (err) {
      console.error('[diagnostico/responder]', err.message);
      return json(500, { ok: false, error: 'Erro ao enviar as respostas.' });
    }
  }

  // ── Sessão de consultoria para o Diagnóstico ───────────────────
  // 🔒 Recusa dois casos que getAxiaSession aceitaria:
  //   1. token de vitrine (link público do cartão de visita), que entra na
  //      conta da Axis e leria a lista de prospects;
  //   2. empresa de plano 'diagnostico' (conta de prospecção), que responde
  //      o diagnóstico mas NUNCA pode ver o próprio resultado.
  async function diagSessaoConsultoria(token) {
    const co = await getAxiaSession(token);
    if (!co) return null;
    const d = await loadData();
    if ((d.axiaShowcaseTokens || {})[token]) return null;
    if (co.plan === 'diagnostico') return null;
    return co;
  }

  // ── POST /api/axia/diagnostico/auto?token=T ────────────────────
  // Conta de prospecção pedindo o próprio questionário de dentro do portal.
  // Não devolve resultado nenhum, só o link do formulário.
  if (req.method === 'POST' && url === '/api/axia/diagnostico/auto') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    if (co.plan !== 'diagnostico')
      return json(403, { ok: false, error: 'Disponível apenas em contas de diagnóstico.' });
    try {
      const body = await readBody(req);
      // Reaproveita um convite pendente: quem abandona no meio e volta
      // continua no mesmo, em vez de deixar convite órfão a cada clique.
      const pend = await pool.query(
        `SELECT token FROM axis_diag_convites
          WHERE company_id = $1 AND status = 'pendente'
          ORDER BY created_at DESC LIMIT 1`, [co.id]
      );
      if (pend.rows.length)
        return json(200, { ok: true, link: `${SERVER_URL}/diagnostico?t=${pend.rows[0].token}&p=1` });

      const id = diagId(), tk = diagToken();
      await pool.query(
        `INSERT INTO axis_diag_convites (id, company_id, token, empresa_alvo, respondente, cargo, email, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'prospect')`,
        [id, co.id, tk, co.name || 'Empresa',
         (body.respondente || '').trim().slice(0, 120) || null,
         (body.cargo || '').trim().slice(0, 120) || null,
         co.email || null]
      );
      return json(200, { ok: true, link: `${SERVER_URL}/diagnostico?t=${tk}&p=1` });
    } catch (err) {
      console.error('[axia/diagnostico/auto]', err.message);
      return json(500, { ok: false, error: 'Erro ao abrir o diagnóstico.' });
    }
  }

  // ── POST /api/axia/admin/diagnostico-convite ───────────────────
  // Link avulso: manda o diagnóstico para alguém que ainda não tem conta
  // no portal. Fica na conta da Axis, então aparece na mesma lista.
  if (req.method === 'POST' && url === '/api/axia/admin/diagnostico-convite') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const body = await readBody(req);
      const empresaAlvo = (body.empresa_alvo || '').trim().slice(0, 160);
      if (!empresaAlvo) return json(400, { ok: false, error: 'Informe o nome da empresa avaliada.' });
      const d = await loadData();
      const dona = (d.axiaCompanies || []).find(c => c.email === AXIS_EMPRESA_EMAIL) || (d.axiaCompanies || [])[0];
      if (!dona) return json(400, { ok: false, error: 'Nenhuma empresa cadastrada para receber o diagnóstico.' });
      const id = diagId(), tk = diagToken();
      await pool.query(
        `INSERT INTO axis_diag_convites (id, company_id, token, empresa_alvo, respondente, cargo, email, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'link')`,
        [id, dona.id, tk, empresaAlvo,
         (body.respondente || '').trim().slice(0, 120) || null,
         (body.cargo || '').trim().slice(0, 120) || null,
         (body.email || '').trim().slice(0, 160) || null]
      );
      return json(200, { ok: true, id, link: `${SERVER_URL}/diagnostico?t=${tk}` });
    } catch (err) {
      console.error('[admin/diagnostico-convite]', err.message);
      return json(500, { ok: false, error: 'Erro ao gerar o link.' });
    }
  }

  // ── POST /api/axia/admin/relatorio-renomear ────────────────────
  // Corrige o título de um documento já anexado, sem reenviar o PDF.
  if (req.method === 'POST' && url === '/api/axia/admin/relatorio-renomear') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const { id, titulo, tipo } = await readBody(req);
      const novoTitulo = (titulo || '').trim().slice(0, 160);
      if (!novoTitulo) return json(400, { ok: false, error: 'Informe o novo título.' });
      if (tipo && !REL_TIPOS[tipo]) return json(400, { ok: false, error: 'Tipo de documento inválido.' });
      const r = tipo
        ? await pool.query('UPDATE axia_relatorios SET titulo = $2, tipo = $3 WHERE id = $1 RETURNING id, titulo, tipo', [id || '', novoTitulo, tipo])
        : await pool.query('UPDATE axia_relatorios SET titulo = $2 WHERE id = $1 RETURNING id, titulo, tipo', [id || '', novoTitulo]);
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Documento não encontrado.' });
      return json(200, { ok: true, documento: r.rows[0] });
    } catch (err) {
      console.error('[admin/relatorio-renomear]', err.message);
      return json(500, { ok: false, error: 'Erro ao renomear.' });
    }
  }

  // ── POST /api/axia/admin/diagnostico-plano ─────────────────────
  // Gera o plano de ação da empresa a partir de um diagnóstico respondido:
  // uma ação por fator, da maior para a menor pontuação de risco.
  if (req.method === 'POST' && url === '/api/axia/admin/diagnostico-plano') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const { id, companyId } = await readBody(req);
      if (!companyId) return json(400, { ok: false, error: 'Escolha a empresa que vai receber o plano.' });
      const r = await pool.query(
        `SELECT c.empresa_alvo, x.fatores_json
           FROM axis_diag_convites c
           LEFT JOIN axis_diag_respostas x ON x.convite_id = c.id
          WHERE c.id = $1`, [id || '']
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Diagnóstico não encontrado.' });
      if (!r.rows[0].fatores_json) return json(409, { ok: false, error: 'Este diagnóstico ainda não foi respondido.' });
      const fatores = typeof r.rows[0].fatores_json === 'string'
        ? JSON.parse(r.rows[0].fatores_json) : r.rows[0].fatores_json;

      const d = await loadData();
      const empresa = (d.axiaCompanies || []).find(c => c.id === companyId);
      if (!empresa) return json(404, { ok: false, error: 'Empresa não encontrada.' });
      if (!d.axiaActionPlans) d.axiaActionPlans = [];

      // Gerar de novo substitui o que veio deste mesmo diagnóstico, em vez de
      // duplicar as linhas. O que a consultora criou à mão fica intacto.
      const origem = 'diagnostico:' + id;
      const antes = d.axiaActionPlans.length;
      d.axiaActionPlans = d.axiaActionPlans.filter(p => !(p.companyId === companyId && p.origem === origem));
      const substituidas = antes - d.axiaActionPlans.length;

      const ordenados = [...fatores].sort((a, b) => b.pct - a.pct);
      ordenados.forEach((f, i) => {
        const prior = diagPrioridade(f.nivel);
        d.axiaActionPlans.push({
          id: `ap_${Date.now()}_${i}`,
          companyId,
          origem,
          risco: `${f.nome} (${f.pct}%, ${f.nivel})`,
          rec: (DIAG_RECS[f.id] || {})[prior] || '',
          prior,
          prazo: diagPrazo(prior),
          resp: '',
          status: 'pendente'
        });
      });
      await saveData(d);
      return json(200, {
        ok: true, criadas: ordenados.length, substituidas,
        empresa: empresa.name, avaliada: r.rows[0].empresa_alvo
      });
    } catch (err) {
      console.error('[admin/diagnostico-plano]', err.message);
      return json(500, { ok: false, error: 'Erro ao gerar o plano de ação.' });
    }
  }

  // ── POST /api/axia/admin/diagnostico-liberar ───────────────────
  // Libera (ou tira) a visualização do resultado para quem respondeu.
  // Fechado por padrão: o diagnóstico é entregue pela consultoria.
  if (req.method === 'POST' && url === '/api/axia/admin/diagnostico-liberar') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const { id, liberado } = await readBody(req);
      const r = await pool.query(
        'UPDATE axis_diag_convites SET liberado = $2 WHERE id = $1 RETURNING token, liberado',
        [id || '', liberado === true]
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Diagnóstico não encontrado.' });
      return json(200, {
        ok: true,
        liberado: r.rows[0].liberado === true,
        link: `${SERVER_URL}/diagnostico?t=${r.rows[0].token}`
      });
    } catch (err) {
      console.error('[admin/diagnostico-liberar]', err.message);
      return json(500, { ok: false, error: 'Erro ao liberar o resultado.' });
    }
  }

  // ── GET /api/diagnostico/resultado?t=TOKEN (público) ───────────
  // 🔒 Só responde quando a consultoria liberou aquele diagnóstico.
  // Sem liberação devolve 403, e não um resultado vazio, para não haver
  // caminho lateral até a nota.
  if (url === '/api/diagnostico/resultado') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'diag_res_pub', 60, 3600000))
      return json(429, { ok: false, error: 'Muitas tentativas. Tente novamente mais tarde.' });
    const t = params.get('t') || '';
    if (!t) return json(400, { ok: false, error: 'Link inválido.' });
    try {
      const r = await pool.query(
        `SELECT c.empresa_alvo, c.respondente, c.cargo, c.liberado, c.respondido_em,
                x.pct, x.nivel, x.fatores_json
           FROM axis_diag_convites c
           LEFT JOIN axis_diag_respostas x ON x.convite_id = c.id
          WHERE c.token = $1`, [t]
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Link não encontrado.' });
      const d = r.rows[0];
      if (d.liberado !== true) return json(403, { ok: false, error: 'Resultado ainda não liberado.' });
      if (d.pct === null) return json(409, { ok: false, error: 'Diagnóstico ainda não respondido.' });
      const fatores = typeof d.fatores_json === 'string' ? JSON.parse(d.fatores_json) : d.fatores_json;
      return json(200, {
        ok: true,
        empresa_alvo: d.empresa_alvo, respondente: d.respondente, cargo: d.cargo,
        respondido_em: d.respondido_em, pct: Number(d.pct), nivel: d.nivel, fatores
      });
    } catch (err) {
      console.error('[diagnostico/resultado]', err.message);
      return json(500, { ok: false, error: 'Erro ao carregar o resultado.' });
    }
  }

  // ── GET /api/axia/admin/diagnosticos (painel da consultora) ────
  // Lista os diagnósticos de TODAS as empresas. É por aqui que a Clau vê o
  // resultado dos prospects, sem precisar entrar no portal de cada um.
  if (url === '/api/axia/admin/diagnosticos') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const r = await pool.query(
        `SELECT c.id, c.company_id, c.token, c.empresa_alvo, c.respondente, c.cargo, c.email, c.liberado,
                c.status, c.origem, c.created_at, c.respondido_em, r.pct, r.nivel
           FROM axis_diag_convites c
           LEFT JOIN axis_diag_respostas r ON r.convite_id = c.id
          WHERE c.status <> 'excluido'
          ORDER BY c.created_at DESC`
      );
      const d = await loadData();
      const nomes = {};
      (d.axiaCompanies || []).forEach(c => { nomes[c.id] = c.name; });
      const itens = r.rows.map(x => ({
        id: x.id, empresa_alvo: x.empresa_alvo, conta: nomes[x.company_id] || '—',
        respondente: x.respondente, cargo: x.cargo, email: x.email,
        status: x.status, origem: x.origem || 'portal', liberado: x.liberado === true,
        created_at: x.created_at, respondido_em: x.respondido_em,
        link: `${SERVER_URL}/diagnostico?t=${x.token}`,
        pct: x.pct === null ? null : Number(x.pct), nivel: x.nivel
      }));
      return json(200, { ok: true, itens });
    } catch (err) {
      console.error('[admin/diagnosticos]', err.message);
      return json(500, { ok: false, error: 'Erro ao carregar os diagnósticos.' });
    }
  }

  // ── GET /api/axia/admin/diagnostico?id=ID ──────────────────────
  if (url === '/api/axia/admin/diagnostico') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const r = await pool.query(
        `SELECT c.empresa_alvo, c.respondente, c.cargo, c.email, c.origem,
                c.created_at, c.respondido_em, r.pct, r.nivel, r.fatores_json, r.versao_protocolo
           FROM axis_diag_convites c
           LEFT JOIN axis_diag_respostas r ON r.convite_id = c.id
          WHERE c.id = $1`, [params.get('id') || '']
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Diagnóstico não encontrado.' });
      const x = r.rows[0];
      if (x.pct === null) return json(409, { ok: false, error: 'Este diagnóstico ainda não foi respondido.' });
      const fatores = typeof x.fatores_json === 'string' ? JSON.parse(x.fatores_json) : x.fatores_json;
      return json(200, {
        ok: true,
        empresa_alvo: x.empresa_alvo, respondente: x.respondente, cargo: x.cargo, email: x.email,
        origem: x.origem || 'portal', criado_em: x.created_at, respondido_em: x.respondido_em,
        pct: Number(x.pct), nivel: x.nivel, fatores, versao: x.versao_protocolo
      });
    } catch (err) {
      console.error('[admin/diagnostico]', err.message);
      return json(500, { ok: false, error: 'Erro ao carregar o resultado.' });
    }
  }

  // ── POST /api/axia/admin/diagnostico-excluir ───────────────────
  if (req.method === 'POST' && url === '/api/axia/admin/diagnostico-excluir') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, error: 'Não autorizado.' });
    try {
      const { id } = await readBody(req);
      // Marca em vez de apagar: se alguém estiver respondendo agora, o envio
      // ainda é gravado e o diagnóstico reaparece na lista como respondido.
      const del = await pool.query(
        "UPDATE axis_diag_convites SET status = 'excluido' WHERE id = $1 AND status <> 'excluido' RETURNING id", [id || '']);
      if (del.rows.length === 0) return json(404, { ok: false, error: 'Diagnóstico não encontrado.' });
      return json(200, { ok: true });
    } catch (err) {
      console.error('[admin/diagnostico-excluir]', err.message);
      return json(500, { ok: false, error: 'Erro ao excluir.' });
    }
  }

  // ── POST /api/axia/diagnostico/convite?token=T (portal) ────────
  if (req.method === 'POST' && url === '/api/axia/diagnostico/convite') {
    const co = await diagSessaoConsultoria(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const body = await readBody(req);
      const empresaAlvo = (body.empresa_alvo || '').trim().slice(0, 160);
      if (!empresaAlvo) return json(400, { ok: false, error: 'Informe o nome da empresa avaliada.' });
      const id = diagId(), tk = diagToken();
      await pool.query(
        `INSERT INTO axis_diag_convites (id, company_id, token, empresa_alvo, respondente, cargo, email, origem)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'portal')`,
        [id, co.id, tk, empresaAlvo,
         (body.respondente || '').trim().slice(0, 120) || null,
         (body.cargo || '').trim().slice(0, 120) || null,
         (body.email || '').trim().slice(0, 160) || null]
      );
      return json(200, { ok: true, id, link: `${SERVER_URL}/diagnostico?t=${tk}` });
    } catch (err) {
      console.error('[axia/diagnostico/convite]', err.message);
      return json(500, { ok: false, error: 'Erro ao criar o diagnóstico.' });
    }
  }

  // ── GET /api/axia/diagnostico/lista?token=T (portal) ───────────
  if (url === '/api/axia/diagnostico/lista') {
    const co = await diagSessaoConsultoria(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const r = await pool.query(
        `SELECT c.id, c.token, c.empresa_alvo, c.respondente, c.cargo, c.email, c.status, c.origem,
                c.created_at, c.respondido_em, r.pct, r.nivel
           FROM axis_diag_convites c
           LEFT JOIN axis_diag_respostas r ON r.convite_id = c.id
          WHERE c.company_id = $1 AND c.status <> 'excluido'
          ORDER BY c.created_at DESC`,
        [co.id]
      );
      const itens = r.rows.map(x => ({
        id: x.id, empresa_alvo: x.empresa_alvo, respondente: x.respondente, cargo: x.cargo, email: x.email,
        status: x.status, origem: x.origem || 'portal', created_at: x.created_at, respondido_em: x.respondido_em,
        pct: x.pct === null ? null : Number(x.pct), nivel: x.nivel,
        link: `${SERVER_URL}/diagnostico?t=${x.token}`
      }));
      return json(200, { ok: true, itens });
    } catch (err) {
      console.error('[axia/diagnostico/lista]', err.message);
      return json(500, { ok: false, error: 'Erro ao carregar os diagnósticos.' });
    }
  }

  // ── GET /api/axia/diagnostico/resultado?token=T&id=ID (portal) ─
  // 🔒 O SELECT filtra por id E company_id: sem isso uma empresa logada
  // poderia ler o diagnóstico de outra só chutando o id.
  if (url === '/api/axia/diagnostico/resultado') {
    const co = await diagSessaoConsultoria(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const id = params.get('id') || '';
      const r = await pool.query(
        `SELECT c.empresa_alvo, c.respondente, c.cargo, c.email, c.created_at, c.respondido_em,
                r.pct, r.nivel, r.fatores_json, r.versao_protocolo
           FROM axis_diag_convites c
           LEFT JOIN axis_diag_respostas r ON r.convite_id = c.id
          WHERE c.id = $1 AND c.company_id = $2`,
        [id, co.id]
      );
      if (r.rows.length === 0) return json(404, { ok: false, error: 'Diagnóstico não encontrado.' });
      const x = r.rows[0];
      if (x.pct === null) return json(409, { ok: false, error: 'Este diagnóstico ainda não foi respondido.' });
      const fatores = typeof x.fatores_json === 'string' ? JSON.parse(x.fatores_json) : x.fatores_json;
      return json(200, {
        ok: true,
        empresa_alvo: x.empresa_alvo, respondente: x.respondente, cargo: x.cargo, email: x.email,
        criado_em: x.created_at, respondido_em: x.respondido_em,
        pct: Number(x.pct), nivel: x.nivel, fatores, versao: x.versao_protocolo
      });
    } catch (err) {
      console.error('[axia/diagnostico/resultado]', err.message);
      return json(500, { ok: false, error: 'Erro ao carregar o resultado.' });
    }
  }

  // ── POST /api/axia/diagnostico/excluir?token=T (portal) ────────
  if (req.method === 'POST' && url === '/api/axia/diagnostico/excluir') {
    const co = await diagSessaoConsultoria(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { id } = await readBody(req);
      const del = await pool.query(
        "UPDATE axis_diag_convites SET status = 'excluido' WHERE id = $1 AND company_id = $2 AND status <> 'excluido' RETURNING id",
        [id || '', co.id]
      );
      if (del.rows.length === 0) return json(404, { ok: false, error: 'Diagnóstico não encontrado.' });
      return json(200, { ok: true });
    } catch (err) {
      console.error('[axia/diagnostico/excluir]', err.message);
      return json(500, { ok: false, error: 'Erro ao excluir.' });
    }
  }

  // ── GET /api/axia/burnout/link?token=T ────────────────────────
  // Retorna o link do colaborador para o Screening de Burnout (mesmo código público da empresa).
  if (url === '/api/axia/burnout/link') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      let codeResult = await pool.query(
        'SELECT codigo_publico FROM axis_company_codes WHERE company_id = $1', [co.id]
      );
      let codigo = codeResult.rows[0]?.codigo_publico;
      if (!codigo) {
        codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
        await pool.query(
          'INSERT INTO axis_company_codes (company_id, codigo_publico) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING',
          [co.id, codigo]
        );
      }
      const link = `${SERVER_URL}/screening-burnout?c=${codigo}`;
      return json(200, { ok: true, link, codigo });
    } catch (err) {
      console.error('[burnout/link] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // ── GET /api/axia/burnout/mapa?token=T ─────────────────────────
  // Agrega as respostas reais do Screening de Burnout por setor + visão geral da empresa.
  if (url === '/api/axia/burnout/mapa') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const r = await pool.query(
        `SELECT setor, score_exaustao, score_despersonalizacao, score_realizacao, ibr_score
         FROM axis_burnout_respostas WHERE company_id = $1`,
        [co.id]
      );
      const rows = r.rows;
      const media = arr => arr.length ? arr.reduce((a, b) => a + Number(b), 0) / arr.length : 0;

      const geral = {
        exaustao:          media(rows.map(x => x.score_exaustao)),
        despersonalizacao: media(rows.map(x => x.score_despersonalizacao)),
        realizacao:        media(rows.map(x => x.score_realizacao)),
        ibr:               media(rows.map(x => x.ibr_score))
      };

      const setoresMap = {};
      for (const row of rows) {
        const s = row.setor || 'Não informado';
        (setoresMap[s] = setoresMap[s] || []).push(row);
      }
      const setores = Object.entries(setoresMap).map(([setor, arr]) => ({
        setor,
        exaustao:          media(arr.map(x => x.score_exaustao)),
        despersonalizacao: media(arr.map(x => x.score_despersonalizacao)),
        realizacao:        media(arr.map(x => x.score_realizacao)),
        ibr:               media(arr.map(x => x.ibr_score)),
        respostas:         arr.length
      })).sort((a, b) => b.ibr - a.ibr);

      return json(200, { ok: true, total: rows.length, geral, setores });
    } catch (err) {
      console.error('[burnout/mapa] Erro:', err.message);
      return json(500, { ok: false, error: 'Erro interno.' });
    }
  }

  // ══ INDICADORES DE SAÚDE ORGANIZACIONAL (ISO) ═══════════════════
  const ISO_COLUNAS = { absenteismo: 'absenteismo', horas_extras: 'horas_extras', turnover: 'turnover', afastamentos: 'afastamentos', presenteismo: 'presenteismo' };

  // Metas (ancoram nota=20 na escala oficial 0-100) — Protocolo de Mensuração v1.0
  const ISO_METAS = { absenteismo: 3, horas_extras: 12, turnover: 5, presenteismo: 5 };
  const ISO_PESOS = { absenteismo: 0.25, afastamentos: 0.25, turnover: 0.20, horas_extras: 0.15, presenteismo: 0.15 };

  function isoNotaAfastamentos(n) {
    if (n === null || n === undefined) return null;
    if (n <= 0) return 0;
    if (n === 1) return 40;
    if (n === 2) return 70;
    return 100;
  }
  function isoNotaLinear(valor, meta) {
    if (valor === null || valor === undefined) return null;
    return Math.min(100, (Number(valor) / meta) * 20);
  }
  function isoClassificar(score) {
    if (score <= 20) return 'Baixo';
    if (score <= 40) return 'Atenção';
    if (score <= 60) return 'Alerta';
    if (score <= 80) return 'Alto';
    return 'Emergencial';
  }
  // Calcula ISO (positivo) e ISO_ajustado (risco, usado no IGP) para um mês.
  // Componentes ausentes são excluídos e o peso é redistribuído proporcionalmente.
  function calcularISO(row) {
    const notas = {
      absenteismo: isoNotaLinear(row.absenteismo, ISO_METAS.absenteismo),
      horas_extras: isoNotaLinear(row.horas_extras, ISO_METAS.horas_extras),
      turnover: isoNotaLinear(row.turnover, ISO_METAS.turnover),
      presenteismo: isoNotaLinear(row.presenteismo, ISO_METAS.presenteismo),
      afastamentos: isoNotaAfastamentos(row.afastamentos)
    };
    let somaPonderada = 0, somaPesos = 0;
    for (const chave of Object.keys(ISO_PESOS)) {
      if (notas[chave] !== null) {
        somaPonderada += notas[chave] * ISO_PESOS[chave];
        somaPesos += ISO_PESOS[chave];
      }
    }
    if (somaPesos === 0) return { iso: null, isoAjustado: null, classificacao: null, completo: false };
    const isoAjustado = somaPonderada / somaPesos; // risco 0-100
    const iso = 100 - isoAjustado; // saúde 0-100
    return {
      iso: Math.round(iso * 10) / 10,
      isoAjustado: Math.round(isoAjustado * 10) / 10,
      classificacao: isoClassificar(isoAjustado),
      completo: somaPesos === 1
    };
  }

  // ── POST /api/axia/indicadores/salvar?token=T ──────────────────
  if (req.method === 'POST' && url === '/api/axia/indicadores/salvar') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { mes, indicador, valor, observacao } = await readBody(req);
      const coluna = ISO_COLUNAS[indicador];
      if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return json(400, { ok: false, error: 'Mês inválido. Use o formato AAAA-MM.' });
      if (!coluna) return json(400, { ok: false, error: 'Indicador inválido.' });
      const num = Number(String(valor).replace(',', '.'));
      if (isNaN(num)) return json(400, { ok: false, error: 'Valor inválido.' });

      await pool.query(
        `INSERT INTO axis_indicadores_saude (company_id, mes, ${coluna}, observacao)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, mes) DO UPDATE SET ${coluna} = $3, observacao = COALESCE($4, axis_indicadores_saude.observacao), updated_at = NOW()`,
        [co.id, mes, num, observacao || null]
      );
      json(200, { ok: true });
    } catch (e) {
      console.error('[indicadores/salvar]', e.message);
      json(500, { ok: false, error: 'Erro ao salvar indicador.' });
    }
    return;
  }

  // ── POST /api/axia/indicadores/importar-csv?token=T ────────────
  if (req.method === 'POST' && url === '/api/axia/indicadores/importar-csv') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { csv } = await readBody(req);
      if (!csv || typeof csv !== 'string') return json(400, { ok: false, error: 'Arquivo CSV vazio ou inválido.' });

      const linhas = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let importadas = 0, erros = 0;
      for (const linha of linhas) {
        const partes = linha.split(';').map(p => p.trim());
        if (partes.length < 5) { erros++; continue; }
        const [mes, absStr, heStr, turnStr, afStr, presStr] = partes;
        if (!/^\d{4}-\d{2}$/.test(mes)) { erros++; continue; }
        const abs = Number(absStr.replace(',', '.'));
        const he  = Number(heStr.replace(',', '.'));
        const turn = Number(turnStr.replace(',', '.'));
        const af  = parseInt(afStr, 10);
        const pres = presStr !== undefined && presStr !== '' ? Number(presStr.replace(',', '.')) : null;
        if ([abs, he, turn, af].some(v => isNaN(v)) || (pres !== null && isNaN(pres))) { erros++; continue; }

        await pool.query(
          `INSERT INTO axis_indicadores_saude (company_id, mes, absenteismo, horas_extras, turnover, afastamentos, presenteismo)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (company_id, mes) DO UPDATE SET absenteismo = $3, horas_extras = $4, turnover = $5, afastamentos = $6, presenteismo = COALESCE($7, axis_indicadores_saude.presenteismo), updated_at = NOW()`,
          [co.id, mes, abs, he, turn, af, pres]
        );
        importadas++;
      }
      json(200, { ok: true, importadas, erros });
    } catch (e) {
      console.error('[indicadores/importar-csv]', e.message);
      json(500, { ok: false, error: 'Erro ao importar CSV.' });
    }
    return;
  }

  // ── GET /api/axia/indicadores/mapa?token=T ─────────────────────
  if (url === '/api/axia/indicadores/mapa') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const r = await pool.query(
        `SELECT mes, absenteismo, horas_extras, turnover, afastamentos, presenteismo
         FROM axis_indicadores_saude WHERE company_id = $1 ORDER BY mes ASC`,
        [co.id]
      );
      const historico = r.rows.map(row => ({ ...row, ...calcularISO(row) }));
      const resumo = historico.length ? historico[historico.length - 1] : null;
      return json(200, { ok: true, historico, resumo });
    } catch (err) {
      console.error('[indicadores/mapa] Erro:', err.message);
      return json(500, { ok: false, error: 'Erro interno.' });
    }
  }

  // Bloco E — Link do canal para a empresa (privado, lazy generation)
  if (url === '/api/axia/denuncia/link') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      let codeResult = await pool.query(
        'SELECT codigo_publico FROM axis_company_codes WHERE company_id = $1', [co.id]
      );
      let codigo = codeResult.rows[0]?.codigo_publico;
      if (!codigo) {
        codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
        await pool.query(
          'INSERT INTO axis_company_codes (company_id, codigo_publico) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING',
          [co.id, codigo]
        );
      }
      const baseUrl = SERVER_URL;
      const link = `${baseUrl}/denuncia.html?empresa=${codigo}`;
      return json(200, { link, codigo });
    } catch (err) {
      console.error('[denuncia/link] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  if (req.method === 'POST' && url === '/api/axia/denuncia/enviar-link') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    try {
      const { emails } = await readBody(req);
      if (!emails || !Array.isArray(emails) || emails.length === 0)
        return json(400, { erro: 'Informe ao menos um e-mail.' });
      if (emails.length > 50)
        return json(400, { erro: 'Máximo 50 e-mails por envio.' });
      let codeResult = await pool.query(
        'SELECT codigo_publico FROM axis_company_codes WHERE company_id = $1', [co.id]
      );
      let codigo = codeResult.rows[0]?.codigo_publico;
      if (!codigo) {
        codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
        await pool.query(
          'INSERT INTO axis_company_codes (company_id, codigo_publico) VALUES ($1, $2) ON CONFLICT (company_id) DO NOTHING',
          [co.id, codigo]
        );
      }
      const link = `${SERVER_URL}/denuncia.html?empresa=${codigo}`;
      const emailConfig = loadEmailConfig();
      if (!emailConfig.resendKey && !(emailConfig.user && emailConfig.pass))
        return json(400, { erro: 'Serviço de e-mail não configurado.' });
      let enviados = 0, erros = 0;
      for (const email of emails) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { erros++; continue; }
        try {
          await sendEmail({
            to: email.trim(),
            toName: 'Colaborador',
            subject: `Canal de Relato Seguro — ${co.name}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
              <div style="background:#1a1a1a;padding:24px 32px;border-radius:10px 10px 0 0;">
                <h1 style="color:#c9a84c;margin:0;font-size:20px;">AXIS <span style="font-weight:300">IA</span></h1>
                <p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">Canal de Relato Seguro</p>
              </div>
              <div style="background:#f9f9f7;padding:32px;border-radius:0 0 10px 10px;border:1px solid #eee;">
                <h2 style="font-size:16px;color:#1a1a1a;margin-top:0;">Canal de Relato Seguro</h2>
                <p style="color:#555;line-height:1.7;font-size:14px;">
                  <strong>${co.name}</strong> disponibiliza um canal de relato seguro e anônimo em conformidade com a NR-1.
                  Você pode relatar ocorrências com total anonimato — seu e-mail
                  <strong>não será armazenado</strong> em nenhum momento.
                </p>
                <div style="text-align:center;margin:28px 0;">
                  <a href="${link}" style="background:#1a1a1a;color:#c9a84c;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700;display:inline-block;">
                    Acessar Canal de Relato Seguro
                  </a>
                </div>
                <div style="background:#f5f5f3;border-radius:6px;padding:12px 16px;margin-bottom:20px;text-align:center;">
                  <p style="margin:0 0 6px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px;">Ou copie e cole este link no navegador</p>
                  <a href="${link}" style="font-size:12px;color:#1976D2;word-break:break-all;">${link}</a>
                </div>
                <div style="background:#fff8e6;border-left:4px solid #c9a84c;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">
                  <p style="margin:0;font-size:13px;color:#555;">
                    🔒 <strong>Garantia de anonimato:</strong> nenhuma informação que permita sua identificação
                    será armazenada ou compartilhada com a empresa.
                  </p>
                </div>
                <p style="color:#aaa;font-size:11px;border-top:1px solid #eee;padding-top:16px;">
                  Enviado por ${co.name} via AXIS IA Canal de Relato Seguro.
                </p>
              </div>
            </div>`,
            config: emailConfig
          });
          enviados++;
        } catch { erros++; }
      }
      return json(200, { sucesso: true, enviados, erros });
    } catch (err) {
      console.error('[denuncia/enviar-link] Erro:', err.message);
      return json(500, { erro: 'Erro interno.' });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ACESSO CLIENTE — entrega de Relatório MRP como vitrine da plataforma
  // ═══════════════════════════════════════════════════════════════

  // ── POST /api/client-access/create (admin: gera acesso + envia e-mail) ──
  if (req.method === 'POST' && url === '/api/client-access/create') {
    if (!requireAdminAuth(req)) return json(401, { ok:false, error:'Não autorizado.' });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp, 'client-access-create', 30, 3600000))
      return json(429, { ok:false, error:'Muitas requisições. Tente novamente em 1 hora.' });
    try {
      const body = await readBody(req);
      let { empresa_nome, responsavel_nome, email, pdf_base64, pdf_filename, data_relatorio, validade_dias } = body;
      if (!empresa_nome || !responsavel_nome || !email || !pdf_base64)
        return json(400, { ok:false, error:'Empresa, responsável, e-mail e PDF são obrigatórios.' });
      email = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok:false, error:'E-mail inválido.' });
      // Remover prefixo data: caso o front envie o data URL completo
      pdf_base64 = String(pdf_base64).replace(/^data:application\/pdf;base64,/, '').trim();
      if (!pdf_base64) return json(400, { ok:false, error:'PDF inválido.' });

      const senha = caTempPwd();
      const senha_hash = await bcrypt.hash(senha, 12);
      const id = caId();
      let expira = null;
      const dias = parseInt(validade_dias, 10);
      if (dias && dias > 0) expira = new Date(Date.now() + dias * 86400000).toISOString();

      await pool.query(
        `INSERT INTO client_access
           (id, empresa_nome, responsavel_nome, email, senha_hash, pdf_base64, pdf_filename, data_relatorio, expira_em, ativo, acessos_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,0)
         ON CONFLICT (email) DO UPDATE SET
           empresa_nome=$2, responsavel_nome=$3, senha_hash=$5, pdf_base64=$6, pdf_filename=$7,
           data_relatorio=$8, expira_em=$9, ativo=1, criado_em=NOW(), token=NULL, token_expira_em=NULL, acessos_count=0`,
        [id, empresa_nome.trim(), responsavel_nome.trim(), email, senha_hash, pdf_base64,
         (pdf_filename || 'relatorio-mrp.pdf'), (data_relatorio || null), expira]);

      const link = `${SERVER_URL}/axia-portal.html`;
      let emailOk = false, emailErr = null;
      try {
        const cfg = loadEmailConfig();
        if (cfg.resendKey || cfg.user) {
          await sendEmail({
            to: email, toName: responsavel_nome,
            subject: 'Seu Relatório de Conformidade NR-1 — Acesso AXIS IA',
            html: buildClientAccessEmail({ responsavel: responsavel_nome, empresa: empresa_nome, email, senha, link }),
            config: cfg
          });
          emailOk = true;
        } else { emailErr = 'E-mail não configurado no servidor.'; }
      } catch (e) { emailErr = e.message; console.error('[client-access/create] e-mail:', e.message); }

      json(200, { ok:true, senha_temporaria: senha, link_acesso: link, email, emailOk, emailErr });
    } catch (e) {
      console.error('[client-access/create]', e.message);
      json(500, { ok:false, error:'Erro interno ao criar acesso.' });
    }
    return;
  }

  // ── POST /api/client-access/auth (cliente faz login) ──────────────
  if (req.method === 'POST' && url === '/api/client-access/auth') {
    try {
      let { email, senha } = await readBody(req);
      if (!email || !senha) return json(400, { ok:false, error:'Informe e-mail e senha.' });
      email = String(email).trim().toLowerCase();
      const r = await pool.query('SELECT * FROM client_access WHERE email = $1', [email]);
      if (!r.rows.length) return json(401, { ok:false, error:'E-mail ou senha inválidos.' });
      const row = r.rows[0];
      if (!row.ativo) return json(403, { ok:false, error:'Este acesso foi revogado. Fale com a Axis Consultorias.' });
      if (row.expira_em && new Date(row.expira_em) < new Date())
        return json(403, { ok:false, error:'Seu acesso expirou. Fale com a Axis Consultorias.' });
      const okPwd = await bcrypt.compare(senha, row.senha_hash);
      if (!okPwd) return json(401, { ok:false, error:'E-mail ou senha inválidos.' });

      const token = caToken();
      const tokenExp = new Date(Date.now() + 7 * 86400000).toISOString();
      await pool.query(
        'UPDATE client_access SET token=$1, token_expira_em=$2, ultimo_acesso=NOW(), acessos_count=acessos_count+1 WHERE id=$3',
        [token, tokenExp, row.id]);
      json(200, {
        ok:true, token, tipo:'cliente',
        empresa_nome: row.empresa_nome, responsavel_nome: row.responsavel_nome,
        data_relatorio: row.data_relatorio, pdf_filename: row.pdf_filename
      });
    } catch (e) {
      console.error('[client-access/auth]', e.message);
      json(500, { ok:false, error:'Erro interno. Tente novamente.' });
    }
    return;
  }

  // ── GET /api/client-access/report?token=T (PDF inline, autenticado) ──
  if (url === '/api/client-access/report') {
    const token = params.get('token') || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const row = await getClientAccessSession(token);
    if (!row) { res.writeHead(401, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ ok:false, error:'Sessão inválida ou expirada.' })); return; }
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type':'application/pdf' }); res.end(); return; }
    try {
      const buf = Buffer.from(row.pdf_base64, 'base64');
      const fname = (row.pdf_filename || 'relatorio-mrp.pdf').replace(/[^\w.\-]/g, '_');
      const dl = params.get('download') === '1';
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${fname}"`,
        'Content-Length': buf.length,
        'Cache-Control': 'private, no-store'
      });
      res.end(buf);
    } catch (e) { res.writeHead(500); res.end('Erro ao carregar o PDF.'); }
    return;
  }

  // ── GET /api/client-access/list (admin lista acessos) ─────────────
  if (url === '/api/client-access/list') {
    if (!requireAdminAuth(req)) return json(401, { ok:false, error:'Não autorizado.' });
    try {
      const r = await pool.query(
        `SELECT id, empresa_nome, responsavel_nome, email, data_relatorio, criado_em,
                expira_em, ultimo_acesso, acessos_count, ativo
         FROM client_access ORDER BY criado_em DESC`);
      json(200, { ok:true, acessos: r.rows });
    } catch (e) { console.error('[client-access/list]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/client-access/revoke (admin ativa/revoga acesso) ────
  if (req.method === 'POST' && url === '/api/client-access/revoke') {
    if (!requireAdminAuth(req)) return json(401, { ok:false, error:'Não autorizado.' });
    try {
      const { id, ativo } = await readBody(req);
      if (!id) return json(400, { ok:false, error:'id obrigatório.' });
      const novoAtivo = (ativo === 1 || ativo === true || ativo === '1') ? 1 : 0;
      const upd = novoAtivo
        ? 'UPDATE client_access SET ativo=1 WHERE id=$1'
        : 'UPDATE client_access SET ativo=0, token=NULL, token_expira_em=NULL WHERE id=$1';
      await pool.query(upd, [id]);
      json(200, { ok:true, ativo: novoAtivo });
    } catch (e) { console.error('[client-access/revoke]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }


  // ══════════════ DISC — Executivo e Pessoal ═══════════════════
  // Fluxo comercial: a consultora convida por e-mail, o avaliado responde
  // num link proprio e o resultado so aparece para ele quando a consultora
  // libera. O calculo roda AQUI, no servidor, nunca no cliente.

  // ── POST /api/disc/convites — cria convite e envia e-mail ────
  if (req.method === 'POST' && url === '/api/disc/convites') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      const nome = (b.nome || '').trim();
      const email = (b.email || '').trim().toLowerCase();
      const modulo = b.modulo === 'pessoal' ? 'pessoal' : 'executivo';
      if (!nome || !email) return json(400, { ok:false, error:'Nome e e-mail são obrigatórios.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { ok:false, error:'E-mail inválido.' });

      const id = acId('disc'), token = acToken();
      await pool.query(
        'INSERT INTO axis_disc_convites (id,token,modulo,nome,email,empresa,cargo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, token, modulo, nome, email, b.empresa || null, b.cargo || null]);

      const link = SERVER_URL + '/disc/' + token;
      const titulo = modulo === 'pessoal' ? 'DISC Pessoal' : 'DISC Executivo';
      let enviado = false, erroEmail = null;
      try {
        const config = loadEmailConfig();
        const html = buildEmailHtml({
          nome, link, empresa: b.empresa || '',
          chamada: 'a <strong>Avaliação ' + titulo + '</strong>',
          titulo: 'Mapeamento comportamental · 4 fases · 15 a 25 minutos'
        });
        await sendEmail({ to: email, toName: nome, subject: 'Sua avaliação ' + titulo + ' — AXIS', html, config });
        enviado = true;
      } catch (e) { erroEmail = e.message; console.error('[disc/convite email]', e.message); }

      json(200, { ok:true, id, token, link, enviado, erroEmail });
    } catch (e) { console.error('[disc/convites]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ══ IMPORTACAO DE LAUDO EXTERNO ════════════════════════════════
  // Empresa que ja mapeou o time em outra plataforma entra no relatorio
  // de equipe sem refazer a avaliacao. Duas etapas: ler o PDF e devolver
  // a previa, e depois gravar o que a consultora conferiu na tela.

  // ── POST /api/disc/importar/ler — le o PDF, nao grava nada ────
  if (req.method === 'POST' && url === '/api/disc/importar/ler') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      const base64 = String(b.pdf_base64 || '').replace(/^data:[^;,]+;base64,/, '').trim();
      if (!base64) return json(400, { ok:false, error:'Envie o PDF do laudo.' });
      // ~15MB de PDF viram ~20MB em base64
      if (base64.length > 20 * 1024 * 1024) return json(413, { ok:false, error:'PDF muito grande. Limite de 15 MB.' });

      // require direto do lib: o index do pacote tem um modo de depuracao
      // que tenta abrir um PDF de exemplo quando e carregado sem pai.
      let lerPdf;
      try { lerPdf = require('pdf-parse/lib/pdf-parse.js'); }
      catch (e) {
        console.error('[disc/importar] pdf-parse indisponível:', e.message);
        return json(500, { ok:false, error:'O leitor de PDF não está disponível no servidor.' });
      }

      const texto = ((await lerPdf(Buffer.from(base64, 'base64'))) || {}).text || '';
      if (!texto.trim())
        return json(422, { ok:false, error:'Este PDF não tem texto para ler. Se for um documento digitalizado, preencha os campos à mão.' });

      const previa = DISC_ILG.parse(texto);
      json(200, { ok:true, previa,
        capacidades: DISC_EXEC.CAPACIDADES.map(c => ({ id:c.id, nome:c.nome, fator:c.fator })) });
    } catch (e) { console.error('[disc/importar/ler]', e.message); json(500, { ok:false, error:'Não consegui ler este PDF.' }); }
    return;
  }

  // ── POST /api/disc/importar — grava o que foi conferido ───────
  if (req.method === 'POST' && url === '/api/disc/importar') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      const nome = (b.nome || '').trim();
      const email = (b.email || '').trim().toLowerCase();
      const empresa = (b.empresa || '').trim();
      const modulo = b.modulo === 'pessoal' ? 'pessoal' : 'executivo';
      if (!nome) return json(400, { ok:false, error:'Nome é obrigatório.' });
      if (!empresa) return json(400, { ok:false, error:'Empresa é obrigatória: é ela que agrupa o relatório de equipe.' });
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { ok:false, error:'E-mail inválido.' });

      const soma = ['D','I','S','C'].reduce((s, k) => s + (Number(b.natural && b.natural[k]) || 0), 0);
      if (soma < 95 || soma > 105)
        return json(400, { ok:false, error:'As quatro dimensões precisam somar 100. Hoje somam ' + (Math.round(soma * 10) / 10) + '.' });

      const faltando = DISC_EXEC.CAPACIDADES.filter(c => {
        const v = Number(b.capacidades && b.capacidades[c.id]);
        return !isFinite(v);
      });
      if (faltando.length)
        return json(400, { ok:false, error:'Faltou preencher: ' + faltando.map(c => c.nome).join(', ') + '.' });

      const resultado = DISC_ILG.montarResultado({
        natural: b.natural,
        adaptado: b.adaptado && Object.keys(b.adaptado).length ? b.adaptado : b.natural,
        capacidades: b.capacidades,
        estimadas: b.estimadas,
        origem: b.origem || null
      });

      const id = acId('disc'), token = acToken();
      const ref = [(b.origem && b.origem.plataforma) || 'Documento externo',
                   (b.origem && b.origem.protocolo) || null].filter(Boolean).join(' · ');
      await pool.query(
        "INSERT INTO axis_disc_convites (id,token,modulo,nome,email,empresa,cargo,status,liberado,completed_at,origem,origem_ref)" +
        " VALUES ($1,$2,$3,$4,$5,$6,$7,'finalizada',false,NOW(),'importado',$8)",
        [id, token, modulo, nome, email, empresa, (b.cargo || '').trim() || null, ref || null]);

      const registro = {
        importado: true,
        origem: b.origem || null,
        base: b.base === 'natural' ? 'natural' : 'laudo',
        lido: b.lido || null,          // o que saiu do PDF, antes da conferência
        conferido: { natural: b.natural, adaptado: b.adaptado || null, capacidades: b.capacidades }
      };
      await pool.query('INSERT INTO axis_disc_respostas (convite_id,respostas,resultado,tempo_segundos) VALUES ($1,$2,$3,$4)',
        [id, JSON.stringify(registro), JSON.stringify(resultado), 0]);

      json(200, { ok:true, id, sigla: resultado.perfil.sigla });
    } catch (e) { console.error('[disc/importar]', e.message); json(500, { ok:false, error:'Erro interno ao salvar.' }); }
    return;
  }

  // ── GET /api/disc/convites — lista para a consultora ─────────
  if (req.method === 'GET' && url.startsWith('/api/disc/convites')) {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const q = await pool.query(
        'SELECT c.id, c.token, c.modulo, c.nome, c.email, c.empresa, c.cargo, c.status, c.liberado,' +
        ' c.created_at, c.completed_at, c.origem, c.origem_ref, r.id AS resposta_id,' +
        " r.resultado->'perfil'->>'sigla' AS sigla" +
        ' FROM axis_disc_convites c' +
        ' LEFT JOIN axis_disc_respostas r ON r.convite_id = c.id' +
        ' ORDER BY c.created_at DESC LIMIT 500');
      json(200, { ok:true, convites: q.rows });
    } catch (e) { console.error('[disc/convites list]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/disc/convites/liberar ──────────────────────────
  if (req.method === 'POST' && url === '/api/disc/convites/liberar') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      if (!b.id) return json(400, { ok:false, error:'id obrigatório.' });
      const lib = b.liberado === false ? false : true;
      // Avaliacao importada nao tem tela de resultado para o avaliado: o
      // laudo individual dela e o PDF da plataforma de origem.
      const org = await pool.query('SELECT origem FROM axis_disc_convites WHERE id=$1', [b.id]);
      if (org.rows.length && org.rows[0].origem === 'importado')
        return json(409, { ok:false, error:'Avaliação importada não tem resultado para liberar. Ela entra no relatório de equipe.' });
      await pool.query('UPDATE axis_disc_convites SET liberado=$1 WHERE id=$2', [lib, b.id]);
      json(200, { ok:true, liberado: lib });
    } catch (e) { json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/disc/convites/reenviar ─────────────────────────
  // Pendente: reenvia o convite. Finalizada e liberada: avisa que o
  // resultado saiu. Finalizada e nao liberada: nao ha o que enviar.
  if (req.method === 'POST' && url === '/api/disc/convites/reenviar') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      if (!b.id) return json(400, { ok:false, error:'id obrigatório.' });
      const q = await pool.query('SELECT * FROM axis_disc_convites WHERE id=$1', [b.id]);
      if (!q.rows.length) return json(404, { ok:false, error:'Convite não encontrado.' });
      const c = q.rows[0];
      if (c.status === 'finalizada' && !c.liberado) {
        return json(409, { ok:false, error:'Avaliação já respondida e resultado ainda não liberado. Libere antes de avisar o avaliado.' });
      }
      const titulo = c.modulo === 'pessoal' ? 'DISC Pessoal' : 'DISC Executivo';
      const link = SERVER_URL + '/disc/' + c.token;
      const liberou = c.status === 'finalizada' && c.liberado;
      const config = loadEmailConfig();
      const html = buildEmailHtml({
        nome: c.nome, link, empresa: c.empresa || '',
        chamada: liberou
          ? 'e ver o resultado da sua <strong>Avaliação ' + titulo + '</strong>'
          : 'a <strong>Avaliação ' + titulo + '</strong>',
        titulo: liberou
          ? 'Seu resultado já está disponível'
          : 'Mapeamento comportamental · 4 fases · 15 a 25 minutos',
        isResend: !liberou
      });
      await sendEmail({
        to: c.email, toName: c.nome,
        subject: liberou ? 'Seu resultado ' + titulo + ' está disponível — AXIS'
                         : 'Lembrete: sua avaliação ' + titulo + ' — AXIS',
        html, config
      });
      json(200, { ok:true, liberou });
    } catch (e) { console.error('[disc/reenviar]', e.message); json(500, { ok:false, error:'Falha ao reenviar o e-mail.' }); }
    return;
  }
  // ── POST /api/disc/convites/excluir ──────────────────────────
  if (req.method === 'POST' && url === '/api/disc/convites/excluir') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      if (!b.id) return json(400, { ok:false, error:'id obrigatório.' });
      await pool.query('DELETE FROM axis_disc_respostas WHERE convite_id=$1', [b.id]);
      await pool.query('DELETE FROM axis_disc_convites WHERE id=$1', [b.id]);
      json(200, { ok:true });
    } catch (e) { json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── GET /api/disc/resultado/:id — visão da consultora ────────
  if (req.method === 'GET' && url.startsWith('/api/disc/resultado/')) {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const cid = decodeURIComponent(url.split('/api/disc/resultado/')[1].split('?')[0]);
      const q = await pool.query(
        'SELECT r.resultado, r.respostas, r.tempo_segundos, c.nome, c.email, c.empresa, c.cargo, c.modulo, c.completed_at' +
        ' FROM axis_disc_respostas r JOIN axis_disc_convites c ON c.id = r.convite_id' +
        ' WHERE r.convite_id=$1 ORDER BY r.id DESC LIMIT 1', [cid]);
      if (!q.rows.length) return json(404, { ok:false, error:'Sem resposta para este convite.' });
      json(200, { ok:true, ...q.rows[0] });
    } catch (e) { json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── GET /api/disc/equipe?empresa=X&modulo=Y — resultados do time ──
  // Base do relatorio de equipe: so avaliacoes finalizadas da mesma empresa.
  if (req.method === 'GET' && url.startsWith('/api/disc/equipe')) {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      // `url` ja vem sem a query (linha do topo do handler corta no '?').
      // Ler dela deixava a empresa sempre vazia e o relatorio de equipe
      // respondia "empresa obrigatoria" em qualquer chamada. Usar `params`,
      // que e montado a partir do req.url inteiro.
      const empresa = (params.get('empresa') || '').trim();
      const modulo = params.get('modulo') === 'pessoal' ? 'pessoal' : 'executivo';
      if (!empresa) return json(400, { ok:false, error:'empresa obrigatória.' });
      const q = await pool.query(
        'SELECT c.nome, c.cargo, c.email, c.completed_at, r.resultado' +
        ' FROM axis_disc_convites c' +
        ' JOIN axis_disc_respostas r ON r.convite_id = c.id' +
        " WHERE c.empresa = $1 AND c.modulo = $2 AND c.status = 'finalizada'" +
        ' ORDER BY c.completed_at ASC', [empresa, modulo]);
      json(200, { ok:true, empresa, modulo, total: q.rows.length, pessoas: q.rows });
    } catch (e) { console.error('[disc/equipe]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }
  // ── GET /api/disc/sessao/:token — o avaliado abre o link ─────
  if (req.method === 'GET' && url.startsWith('/api/disc/sessao/')) {
    try {
      const tk = decodeURIComponent(url.split('/api/disc/sessao/')[1].split('?')[0]);
      const q = await pool.query('SELECT id,nome,empresa,modulo,status,liberado,rascunho FROM axis_disc_convites WHERE token=$1', [tk]);
      if (!q.rows.length) return json(404, { ok:false, error:'Link inválido ou expirado.' });
      const c = q.rows[0];
      let resultado = null;
      if (c.status === 'finalizada' && c.liberado) {
        const r = await pool.query('SELECT resultado FROM axis_disc_respostas WHERE convite_id=$1 ORDER BY id DESC LIMIT 1', [c.id]);
        if (r.rows.length) resultado = r.rows[0].resultado;
      }
      json(200, { ok:true, nome:c.nome, empresa:c.empresa, modulo:c.modulo, status:c.status,
                  liberado:c.liberado, resultado,
                  rascunho: c.status === 'finalizada' ? null : (c.rascunho || null) });
    } catch (e) { json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/disc/rascunho — salva parcial (troca de dispositivo) ──
  // Sem autenticação de admin: quem tem o token do convite é o avaliado.
  // Nunca calcula nem devolve resultado, só guarda o que foi respondido.
  if (req.method === 'POST' && url === '/api/disc/rascunho') {
    try {
      const b = await readBody(req);
      if (!b.token) return json(400, { ok:false, error:'token obrigatório.' });
      const q = await pool.query('SELECT id,status FROM axis_disc_convites WHERE token=$1', [b.token]);
      if (!q.rows.length) return json(404, { ok:false, error:'Link inválido.' });
      if (q.rows[0].status === 'finalizada') return json(409, { ok:false, error:'Avaliação já finalizada.' });
      const rascunho = {
        v: 1,
        fase: Number(b.fase) || 1,
        f1: b.f1 || {}, f2: b.f2 || {}, f3: b.f3 || {}, f4: Array.isArray(b.f4) ? b.f4 : [],
        f2tocados: b.f2tocados || {}, f3tocados: b.f3tocados || {},
        inicio: Number(b.inicio) || null,
        salvoEm: Date.now()
      };
      await pool.query('UPDATE axis_disc_convites SET rascunho=$1, rascunho_em=NOW() WHERE id=$2',
        [JSON.stringify(rascunho), q.rows[0].id]);
      json(200, { ok:true, salvoEm: rascunho.salvoEm });
    } catch (e) { console.error('[disc/rascunho]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }
  // ── POST /api/disc/responder — recebe e CALCULA no servidor ──
  if (req.method === 'POST' && url === '/api/disc/responder') {
    try {
      const b = await readBody(req);
      if (!b.token) return json(400, { ok:false, error:'token obrigatório.' });
      const q = await pool.query('SELECT id,status FROM axis_disc_convites WHERE token=$1', [b.token]);
      if (!q.rows.length) return json(404, { ok:false, error:'Link inválido.' });
      const conv = q.rows[0];
      if (conv.status === 'finalizada') return json(409, { ok:false, error:'Esta avaliação já foi respondida.' });

      const respostas = {
        f1: b.f1 || {}, f2: b.f2 || {}, f3: b.f3 || {}, f4: Array.isArray(b.f4) ? b.f4 : [],
        tempoSegundos: Number(b.tempoSegundos) || 0
      };
      // validação mínima: as 3 fases obrigatórias precisam estar completas
      const gruposOk = Object.keys(respostas.f1).filter(g => (respostas.f1[g] || []).length === 4).length;
      if (gruposOk < DISC_EXEC.FASE1.length) return json(400, { ok:false, error:'Fase 1 incompleta.' });
      if (Object.keys(respostas.f2).length < DISC_EXEC.FASE2.length) return json(400, { ok:false, error:'Fase 2 incompleta.' });
      // Fase 3 NAO exige as 24: o centro (11) e resposta valida e significa
      // "meu desempenho aqui ja esta adequado". O que faltar vira 11 no motor.
      DISC_EXEC.FASE3.forEach(q => {
        if (respostas.f3[q.cap] == null) respostas.f3[q.cap] = 11;
      });

      const resultado = DISC_EXEC.calcular(respostas);

      await pool.query('INSERT INTO axis_disc_respostas (convite_id,respostas,resultado,tempo_segundos) VALUES ($1,$2,$3,$4)',
        [conv.id, JSON.stringify(respostas), JSON.stringify(resultado), respostas.tempoSegundos]);
      await pool.query("UPDATE axis_disc_convites SET status='finalizada', completed_at=NOW(), rascunho=NULL WHERE id=$1", [conv.id]);

      // O avaliado nao recebe o resultado aqui: quem libera e a consultora.
      json(200, { ok:true, sigla: resultado.perfil.sigla });
    } catch (e) { console.error('[disc/responder]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── GET /disc/:token — serve a pagina do avaliado ────────────
  if (url.startsWith('/disc/')) {
    fs.readFile(path.join(DIR, 'disc-responder.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  // ══ DOSSIE DA EMPRESA ══════════════════════════════════════════
  // Inventario de tudo que a AXIS ja fez para uma empresa, reunido de
  // todos os modulos. Uns guardam company_id, outros guardam o nome
  // digitado a mao (DISC, propostas, acesso ao portal), entao o casamento
  // e feito pelos dois caminhos, com o nome normalizado sem acento e sem
  // caixa. Nenhum PDF vem no corpo: so o tamanho e o nome do arquivo.
  if (req.method === 'GET' && url === '/api/empresa/dossie') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const pedidoNome = (params.get('empresa') || '').trim();
      let companyId = (params.get('company_id') || '').trim();

      const dados = await loadData();
      const empresas = Array.isArray(dados.empresas) ? dados.empresas : [];
      const axiaCos = Array.isArray(dados.axiaCompanies) ? dados.axiaCompanies : [];
      let emp = companyId ? empresas.find(e => String(e.id) === companyId) : null;
      if (!emp && pedidoNome) emp = empresas.find(e => chaveEmpresa(e.nome) === chaveEmpresa(pedidoNome));
      if (emp) companyId = String(emp.id);
      const nome = (emp && emp.nome) || pedidoNome;
      if (!nome && !companyId) return json(400, { ok:false, error:'Informe a empresa.' });

      // A mesma empresa pode ter id nos dois cadastros: o do mapeamento e o
      // do Axis IA, que e o dono do company_id gravado nas tabelas. Sem
      // olhar os dois, denuncias, diagnostico e indicadores somem do
      // inventario de quem foi cadastrada pelo menu Empresas.
      const ids = [];
      const addId = v => { if (v && ids.indexOf(String(v)) < 0) ids.push(String(v)); };
      addId(companyId);
      if (emp) addId(emp.axiaId);
      axiaCos.forEach(c => {
        if ((emp && (c.legacyEmpresaId === emp.id || c.id === emp.axiaId)) ||
            chaveEmpresa(c.name) === chaveEmpresa(nome)) { addId(c.id); addId(c.legacyEmpresaId); }
      });
      const idsSql = ids.length ? ids : ['—sem-id—'];
      const chave = chaveEmpresa(nome);
      const daEmpresa = v => chave && chaveEmpresa(v) === chave;

      const blocos = [];
      const avisos = [];
      // Cada bloco falha sozinho: modulo que ainda nao tem tabela nao pode
      // derrubar o dossie inteiro.
      const bloco = async (chaveBloco, titulo, sigilo, fn) => {
        try {
          const itens = (await fn()) || [];
          if (itens.length) blocos.push({ chave: chaveBloco, titulo, sigilo: !!sigilo, itens });
        } catch (e) { avisos.push(titulo + ': ' + e.message); }
      };

      await bloco('relatorios', 'Relatórios entregues', false, async () => {
        if (!ids.length) return [];
        const q = await pool.query(
          'SELECT id, tipo, titulo, pdf_filename, data_relatorio, criado_em,' +
          ' length(pdf_base64) AS tamanho FROM axia_relatorios WHERE company_id = ANY($1) ORDER BY criado_em DESC', [idsSql]);
        return q.rows.map(r => ({ id: r.id, titulo: r.titulo, detalhe: r.tipo + ' · ' + (r.pdf_filename || 'arquivo'),
                                  data: r.data_relatorio || r.criado_em, tamanho: Number(r.tamanho) || 0, publicavel: true }));
      });

      await bloco('portal', 'Acesso ao portal', false, async () => {
        const q = await pool.query(
          'SELECT id, empresa_nome, responsavel_nome, email, criado_em, expira_em, acessos_count, ativo, pdf_filename FROM client_access');
        return q.rows.filter(r => daEmpresa(r.empresa_nome)).map(r => ({
          id: r.id, titulo: 'Portal de ' + r.responsavel_nome,
          detalhe: r.email + ' · ' + (r.ativo ? 'ativo' : 'inativo') + ' · ' + (r.acessos_count || 0) + ' acessos',
          data: r.criado_em, publicavel: false }));
      });

      await bloco('disc', 'DISC', false, async () => {
        const q = await pool.query(
          "SELECT c.id, c.nome, c.cargo, c.empresa, c.status, c.origem, c.origem_ref, c.completed_at, c.created_at," +
          " r.resultado->'perfil'->>'sigla' AS sigla" +
          ' FROM axis_disc_convites c LEFT JOIN axis_disc_respostas r ON r.convite_id=c.id ORDER BY c.created_at DESC');
        return q.rows.filter(r => daEmpresa(r.empresa)).map(r => ({
          id: r.id, titulo: r.nome + (r.sigla ? ' · ' + r.sigla : ''),
          detalhe: (r.cargo || 'sem cargo') + ' · ' + (r.origem === 'importado' ? 'importada de ' + (r.origem_ref || 'outra plataforma') : r.status),
          data: r.completed_at || r.created_at, publicavel: r.status === 'finalizada' }));
      });

      await bloco('diagnostico', 'Diagnóstico NR-1', false, async () => {
        if (!ids.length) return [];
        const q = await pool.query(
          'SELECT c.id, c.respondente, c.cargo, c.status, c.created_at, c.respondido_em, r.pct, r.nivel' +
          ' FROM axis_diag_convites c LEFT JOIN axis_diag_respostas r ON r.convite_id=c.id' +
          ' WHERE c.company_id = ANY($1) ORDER BY c.created_at DESC', [idsSql]);
        return q.rows.map(r => ({ id: r.id, titulo: r.respondente || 'Respondente',
          detalhe: (r.cargo || 'sem cargo') + ' · ' + (r.nivel ? r.nivel + ' (' + r.pct + '%)' : r.status),
          data: r.respondido_em || r.created_at, publicavel: !!r.nivel }));
      });

      await bloco('propostas', 'Propostas', false, async () => {
        const q = await pool.query(
          'SELECT id, company_id, cliente, titulo, valor, status, validade, created_at, aberturas FROM axis_propostas ORDER BY created_at DESC');
        return q.rows.filter(r => (r.company_id && ids.indexOf(String(r.company_id)) >= 0) || daEmpresa(r.cliente)).map(r => ({
          id: r.id, titulo: r.titulo,
          detalhe: r.status + (r.valor ? ' · R$ ' + Number(r.valor).toLocaleString('pt-BR', {minimumFractionDigits:2}) : '') +
                   ' · ' + (r.aberturas || 0) + ' aberturas',
          data: r.created_at, publicavel: false }));
      });

      await bloco('lideranca', 'Lideranças 360', false, async () => {
        const q = await pool.query(
          'SELECT id, empresa_id, empresa_nome, gestor_nome, gestor_cargo, status, classificacao_ipl, criado_em FROM avaliacoes_ipl ORDER BY criado_em DESC');
        return q.rows.filter(r => (r.empresa_id && ids.indexOf(String(r.empresa_id)) >= 0) || daEmpresa(r.empresa_nome)).map(r => ({
          id: r.id, titulo: r.gestor_nome,
          detalhe: (r.gestor_cargo || 'sem cargo') + ' · ' + (r.classificacao_ipl || r.status),
          data: r.criado_em, publicavel: r.status === 'relatorio_gerado' || r.status === 'entregue' }));
      });

      await bloco('indicadores', 'Indicadores de saúde', false, async () => {
        if (!ids.length) return [];
        const q = await pool.query(
          'SELECT mes, absenteismo, turnover, afastamentos, updated_at FROM axis_indicadores_saude WHERE company_id = ANY($1) ORDER BY mes DESC', [idsSql]);
        return q.rows.map(r => ({ id: r.mes, titulo: 'Mês ' + r.mes,
          detalhe: 'absenteísmo ' + (r.absenteismo != null ? r.absenteismo + '%' : 'sem dado') +
                   ' · turnover ' + (r.turnover != null ? r.turnover + '%' : 'sem dado') +
                   ' · ' + (r.afastamentos != null ? r.afastamentos + ' afastamentos' : 'sem dado'),
          data: r.updated_at, publicavel: true }));
      });

      // ── Blocos com sigilo: entram no dossie da consultora, nao vao
      // para o portal da empresa com conteudo. O canal de relato so se
      // sustenta se quem falou souber que a empresa nao le o texto.
      await bloco('denuncias', 'Canal de relato seguro', true, async () => {
        if (!ids.length) return [];
        const q = await pool.query(
          'SELECT protocolo, categoria, status, created_at FROM axis_denuncias WHERE company_id = ANY($1) ORDER BY created_at DESC', [idsSql]);
        return q.rows.map(r => ({ id: r.protocolo, titulo: 'Protocolo ' + r.protocolo,
          detalhe: r.categoria + ' · ' + r.status, data: r.created_at, publicavel: false }));
      });

      await bloco('escuta', 'Escuta ativa', true, async () => {
        const q = await pool.query(
          'SELECT id, empresa_id, empresa_nome, setor, classificacao_risco, flag_assedio, created_at FROM conversas_escuta_ativa ORDER BY created_at DESC');
        return q.rows.filter(r => (r.empresa_id && ids.indexOf(String(r.empresa_id)) >= 0) || daEmpresa(r.empresa_nome)).map(r => ({
          id: r.id, titulo: 'Conversa anônima',
          detalhe: (r.setor || 'sem setor') + ' · risco ' + (r.classificacao_risco || 'não classificado') + (r.flag_assedio ? ' · assédio sinalizado' : ''),
          data: r.created_at, publicavel: false }));
      });

      await bloco('casos', 'Rastreamento de casos', true, async () => {
        if (!ids.length) return [];
        const q = await pool.query('SELECT id, dados, created_at FROM axis_casos WHERE company_id = ANY($1) ORDER BY created_at DESC', [idsSql]);
        return q.rows.map(r => ({ id: r.id, titulo: (r.dados && (r.dados.titulo || r.dados.assunto)) || 'Caso',
          detalhe: [(r.dados && r.dados.status), (r.dados && r.dados.gravidade)].filter(Boolean).join(' · ') || 'sem status',
          data: r.created_at, publicavel: false }));
      });

      // Pesquisas e convites do mapeamento vivem no kv_store, nao em tabela
      const pesquisas = (Array.isArray(dados.pesquisas) ? dados.pesquisas : [])
        .filter(p => ids.indexOf(String(p.empresaId)) >= 0);
      if (pesquisas.length) {
        const convites = Array.isArray(dados.convites) ? dados.convites : [];
        blocos.push({ chave:'pesquisas', titulo:'Mapeamento de riscos', sigilo:false,
          itens: pesquisas.map(p => {
            const meus = convites.filter(c => String(c.pesquisaId) === String(p.id));
            const resp = meus.filter(c => c.respondido || c.status === 'respondido').length;
            return { id: p.id, titulo: p.nome || 'Pesquisa',
                     detalhe: resp + ' de ' + meus.length + ' respostas',
                     data: p.criadoEm || null, publicavel: true };
          }) });
      }

      const total = blocos.reduce((s, b) => s + b.itens.length, 0);
      json(200, { ok:true, empresa: { id: companyId || null, nome }, total, blocos, avisos });
    } catch (e) { console.error('[empresa/dossie]', e.message); json(500, { ok:false, error:'Erro ao montar o dossiê.' }); }
    return;
  }

  // ══ PUBLICACAO NO PORTAL DA EMPRESA ════════════════════════════
  // A consultora escolhe, item a item, o que o cliente enxerga. Nada do
  // inventario aparece no portal antes de passar por aqui, e relato
  // seguro, escuta e casos nunca podem ser publicados com conteudo.
  const TIPOS_PUBLICAVEIS = ['relatorio', 'disc-equipe'];

  // ── GET /api/empresa/publicados?empresa= — estado dos interruptores ──
  if (req.method === 'GET' && url === '/api/empresa/publicados') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const chave = chaveEmpresa(params.get('empresa') || '');
      if (!chave) return json(400, { ok:false, error:'Informe a empresa.' });
      const q = await pool.query(
        'SELECT id, tipo, ref_id, titulo, detalhe, publicado_em FROM axis_portal_itens' +
        ' WHERE empresa_chave=$1 ORDER BY publicado_em DESC', [chave]);
      json(200, { ok:true, itens: q.rows });
    } catch (e) { console.error('[empresa/publicados]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── POST /api/empresa/publicar — libera ou tira do portal ─────
  if (req.method === 'POST' && url === '/api/empresa/publicar') {
    if (!requireAdminAuth(req)) return json(401, { erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      const empresa = (b.empresa || '').trim();
      const chave = chaveEmpresa(empresa);
      const tipo = String(b.tipo || '');
      const refId = String(b.ref_id == null ? '' : b.ref_id);
      if (!chave) return json(400, { ok:false, error:'Informe a empresa.' });
      if (TIPOS_PUBLICAVEIS.indexOf(tipo) < 0)
        return json(400, { ok:false, error:'Este tipo de registro não pode ser publicado no portal da empresa.' });

      if (b.publicar === false) {
        await pool.query('DELETE FROM axis_portal_itens WHERE empresa_chave=$1 AND tipo=$2 AND ref_id=$3', [chave, tipo, refId]);
        return json(200, { ok:true, publicado:false });
      }

      let titulo = (b.titulo || '').trim();
      let detalhe = (b.detalhe || '').trim() || null;
      let html = null;

      if (tipo === 'relatorio') {
        // Documento que a consultora ja subiu: o PDF continua guardado em
        // axia_relatorios e o portal busca de la na hora de exibir.
        const q = await pool.query('SELECT id, titulo, tipo, data_relatorio FROM axia_relatorios WHERE id=$1', [refId]);
        if (!q.rows.length) return json(404, { ok:false, error:'Relatório não encontrado.' });
        titulo = titulo || q.rows[0].titulo;
        detalhe = detalhe || (q.rows[0].data_relatorio || null);
      } else if (tipo === 'disc-equipe') {
        // Relatorio de equipe: gerado agora, com o time como esta hoje, e
        // guardado pronto. Assim o cliente ve exatamente o que foi liberado,
        // e nao uma versao que muda sozinha a cada avaliacao nova.
        const modulo = b.modulo === 'pessoal' ? 'pessoal' : 'executivo';
        const doTime = [];
        const qEmp = await pool.query(
          'SELECT c.nome, c.cargo, c.email, c.empresa, c.completed_at, r.resultado' +
          ' FROM axis_disc_convites c JOIN axis_disc_respostas r ON r.convite_id = c.id' +
          " WHERE c.modulo=$1 AND c.status='finalizada' ORDER BY c.completed_at ASC", [modulo]);
        qEmp.rows.forEach(p => { if (chaveEmpresa(p.empresa) === chave) doTime.push(p); });
        if (doTime.length < 2) return json(400, { ok:false, error:'O relatório de equipe precisa de pelo menos 2 avaliações finalizadas.' });
        try {
          require('./disc-graficos.js'); require('./disc-laudo.js');
          const EQ = require('./disc-laudo-equipe.js');
          html = EQ.gerar(doTime, { empresa, modulo });
        } catch (e) {
          console.error('[empresa/publicar disc-equipe]', e.message);
          return json(500, { ok:false, error:'Não consegui gerar o relatório de equipe.' });
        }
        titulo = titulo || ('Relatório de equipe · DISC ' + (modulo === 'pessoal' ? 'Pessoal' : 'Executivo'));
        detalhe = detalhe || (doTime.length + ' avaliações');
      }

      const id = acId('pit');
      await pool.query(
        'INSERT INTO axis_portal_itens (id, empresa_chave, empresa_nome, company_id, tipo, ref_id, titulo, detalhe, html)' +
        ' VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)' +
        ' ON CONFLICT (empresa_chave, tipo, ref_id) DO UPDATE SET titulo=$7, detalhe=$8, html=$9, publicado_em=NOW()',
        [id, chave, empresa, (b.company_id || null), tipo, refId, titulo, detalhe, html]);
      json(200, { ok:true, publicado:true, titulo });
    } catch (e) { console.error('[empresa/publicar]', e.message); json(500, { ok:false, error:'Erro ao publicar.' }); }
    return;
  }

  // ── GET /api/client-access/itens?token= — o que a empresa ve ──
  if (req.method === 'GET' && url === '/api/client-access/itens') {
    const token = params.get('token') || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const row = await getClientAccessSession(token);
    if (!row) return json(401, { ok:false, error:'Sessão inválida ou expirada.' });
    try {
      const q = await pool.query(
        'SELECT id, tipo, titulo, detalhe, publicado_em FROM axis_portal_itens' +
        ' WHERE empresa_chave=$1 ORDER BY publicado_em DESC', [chaveEmpresa(row.empresa_nome)]);
      json(200, { ok:true, empresa: row.empresa_nome, itens: q.rows });
    } catch (e) { console.error('[client/itens]', e.message); json(500, { ok:false, error:'Erro interno.' }); }
    return;
  }

  // ── GET /api/client-access/item?token=&id= — abre um documento ──
  if (url === '/api/client-access/item') {
    const token = params.get('token') || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const row = await getClientAccessSession(token);
    if (!row) { res.writeHead(401, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ ok:false, error:'Sessão inválida ou expirada.' })); return; }
    try {
      const q = await pool.query('SELECT * FROM axis_portal_itens WHERE id=$1 AND empresa_chave=$2',
        [params.get('id') || '', chaveEmpresa(row.empresa_nome)]);
      if (!q.rows.length) { res.writeHead(404); return res.end('Documento não encontrado.'); }
      const item = q.rows[0];
      const dl = params.get('download') === '1';

      if (item.tipo === 'disc-equipe' && item.html) {
        const buf = Buffer.from(item.html, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': dl ? 'attachment; filename="relatorio-de-equipe.html"' : 'inline',
          'Cache-Control': 'private, no-store'
        });
        return res.end(buf);
      }
      if (item.tipo === 'relatorio') {
        const r = await pool.query('SELECT pdf_base64, pdf_filename FROM axia_relatorios WHERE id=$1', [item.ref_id]);
        if (!r.rows.length) { res.writeHead(404); return res.end('Arquivo não encontrado.'); }
        const buf = Buffer.from(r.rows[0].pdf_base64, 'base64');
        const fname = (r.rows[0].pdf_filename || 'relatorio.pdf').replace(/[^\w.\-]/g, '_');
        const ehHtml = /\.html?$/i.test(fname);
        res.writeHead(200, {
          'Content-Type': ehHtml ? 'text/html; charset=utf-8' : 'application/pdf',
          'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${fname}"`,
          'Content-Length': buf.length,
          'Cache-Control': 'private, no-store'
        });
        return res.end(buf);
      }
      res.writeHead(415); res.end('Tipo de documento não suportado.');
    } catch (e) { console.error('[client/item]', e.message); res.writeHead(500); res.end('Erro ao abrir o documento.'); }
    return;
  }

  // ══ PROPOSTAS COMERCIAIS ═══════════════════════════════════════
  // Rotas públicas: quem tem o link é o cliente. Não há login, mas
  // também não há nada dele para vazar: o token dá acesso à própria
  // proposta e a mais nada da plataforma.

  // ── GET /api/proposta/:token ─────────────────────────────────
  if (req.method === 'GET' && url.startsWith('/api/proposta/')) {
    try {
      const tk = decodeURIComponent(url.split('/api/proposta/')[1].split('/')[0] || '');
      const q  = await pool.query('SELECT * FROM axis_propostas WHERE token=$1', [tk]);
      if (!q.rows.length) return json(404, { ok: false, error: 'Proposta não encontrada. Confira o link que você recebeu.' });
      const p = q.rows[0];
      if (p.status === 'arquivada') return json(410, { ok: false, error: 'Esta proposta não está mais disponível.' });
      // preview=1 é a pré-visualização da consultora e não conta abertura:
      // senão o rastreio contaria as visitas dela como interesse do cliente.
      if (params.get('preview') !== '1') {
        await pool.query(`UPDATE axis_propostas SET aberturas = aberturas + 1, ultima_abertura = NOW(),
          primeira_abertura = COALESCE(primeira_abertura, NOW()) WHERE id = $1`, [p.id]);
      }
      json(200, { ok: true, proposta: propPublica(p) });
    } catch (e) { console.error('[proposta/get]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── POST /api/proposta/:token/(aceite|colaborador|reuniao) ───
  if (req.method === 'POST' && url.startsWith('/api/proposta/')) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 'proposta', 60, 3600000))
      return json(429, { ok: false, error: 'Muitas tentativas seguidas. Tente de novo daqui a pouco.' });
    try {
      const partes = url.split('/api/proposta/')[1].split('/');
      const tk   = decodeURIComponent(partes[0] || '');
      const acao = partes[1] || '';
      const q = await pool.query('SELECT * FROM axis_propostas WHERE token=$1', [tk]);
      if (!q.rows.length) return json(404, { ok: false, error: 'Proposta não encontrada.' });
      const p = q.rows[0];
      if (p.status === 'arquivada') return json(410, { ok: false, error: 'Esta proposta não está mais disponível.' });
      const body = await readBody(req);

      if (acao === 'aceite') {
        if (p.status === 'aceita')  return json(409, { ok: false, error: 'Esta proposta já foi aceita.' });
        if (p.status === 'recusada') return json(409, { ok: false, error: 'Esta proposta foi encerrada. Fale com a Clau para reabrir.' });
        if (propExpirada(p))        return json(409, { ok: false, error: 'O prazo desta proposta venceu. Fale com a Clau para reemitir.' });
        const nome = String(body.nome || '').trim().slice(0, 120) || p.contato || p.cliente;
        const r = await pool.query(`UPDATE axis_propostas SET status='aceita', aceita_por=$1, aceita_em=NOW(),
          aceita_ip=$2, updated_at=NOW() WHERE id=$3 RETURNING *`, [nome, String(ip).slice(0, 60), p.id]);
        propAvisar('aceite', r.rows[0]);
        return json(200, { ok: true, proposta: propPublica(r.rows[0]) });
      }

      if (acao === 'colaborador') {
        const c = {
          nome:  String(body.nome  || '').trim().slice(0, 120),
          email: String(body.email || '').trim().slice(0, 160),
          setor: String(body.setor || '').trim().slice(0, 80),
          cargo: String(body.cargo || '').trim().slice(0, 80),
          em: new Date().toISOString()
        };
        if (!c.nome || !c.email || !c.setor || !c.cargo)
          return json(400, { ok: false, error: 'Preencha nome, e-mail, setor e cargo.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
          return json(400, { ok: false, error: 'E-mail inválido.' });
        const lista = Array.isArray(p.colaboradores) ? p.colaboradores.slice() : [];
        if (lista.length >= 300)
          return json(409, { ok: false, error: 'Limite de cadastro atingido nesta proposta. Fale com a Clau.' });
        if (lista.some(x => String(x.email || '').toLowerCase() === c.email.toLowerCase()))
          return json(409, { ok: false, error: 'Esse e-mail já está na lista.' });
        lista.push(c);
        const r = await pool.query(`UPDATE axis_propostas SET colaboradores=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
          [JSON.stringify(lista), p.id]);
        // Avisa só no primeiro cadastro: a partir daí a lista é acompanhada
        // no painel, e um e-mail por pessoa viraria enxurrada.
        if (lista.length === 1) propAvisar('colaboradores', r.rows[0]);
        return json(200, { ok: true, proposta: propPublica(r.rows[0]) });
      }

      if (acao === 'reuniao') {
        const data = String(body.data || '').trim().slice(0, 10);
        const obs  = String(body.observacao || '').trim().slice(0, 2000);
        if (!data && !obs) return json(400, { ok: false, error: 'Escolha uma data ou escreva sua observação.' });
        if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return json(400, { ok: false, error: 'Data inválida.' });
        const r = await pool.query(`UPDATE axis_propostas
          SET reuniao_data = COALESCE(NULLIF($1,''), reuniao_data),
              observacao   = COALESCE(NULLIF($2,''), observacao),
              updated_at   = NOW()
          WHERE id=$3 RETURNING *`, [data, obs, p.id]);
        propAvisar('reuniao', r.rows[0]);
        return json(200, { ok: true, proposta: propPublica(r.rows[0]) });
      }

      return json(404, { ok: false, error: 'Ação desconhecida.' });
    } catch (e) { console.error('[proposta/post]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── GET /api/admin/propostas ─────────────────────────────────
  if (req.method === 'GET' && url === '/api/admin/propostas') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, erro: 'Não autorizado' });
    try {
      const q = await pool.query('SELECT * FROM axis_propostas ORDER BY created_at DESC');
      const d = await loadData();
      const empresas = (d.axiaCompanies || []).map(c => ({ id: c.id, name: c.name }));
      json(200, { ok: true, propostas: q.rows.map(propAdmin), empresas, baseUrl: SERVER_URL });
    } catch (e) { console.error('[propostas/lista]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── POST /api/admin/propostas (cria ou edita) ────────────────
  if (req.method === 'POST' && url === '/api/admin/propostas') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, erro: 'Não autorizado' });
    try {
      const b = await readBody(req);
      const cliente = String(b.cliente || '').trim().slice(0, 160);
      if (!cliente) return json(400, { ok: false, error: 'Nome do cliente é obrigatório.' });
      const email = String(b.email || '').trim().slice(0, 160);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json(400, { ok: false, error: 'E-mail de contato inválido.' });
      const valor = (b.valor === '' || b.valor == null) ? null : Number(b.valor);
      if (valor != null && (!isFinite(valor) || valor < 0))
        return json(400, { ok: false, error: 'Valor inválido.' });

      const campos = [
        b.companyId || null,
        cliente,
        String(b.contato || '').trim().slice(0, 120) || null,
        email || null,
        String(b.titulo || '').trim().slice(0, 200) || 'Proposta comercial',
        String(b.resumo || '').trim().slice(0, 900) || null,
        String(b.contexto || '').trim().slice(0, 3000) || null,
        JSON.stringify(propLista(b.escopo)),
        JSON.stringify(propLista(b.etapas)),
        valor,
        String(b.valorNota || '').trim().slice(0, 200) || null,
        String(b.condicoes || '').trim().slice(0, 300) || null,
        b.validade && /^\d{4}-\d{2}-\d{2}$/.test(b.validade) ? b.validade : null
      ];

      if (b.id) {
        const r = await pool.query(`UPDATE axis_propostas SET company_id=$1, cliente=$2, contato=$3, email=$4,
          titulo=$5, resumo=$6, contexto=$7, escopo=$8, etapas=$9, valor=$10, valor_nota=$11, condicoes=$12,
          validade=$13, updated_at=NOW() WHERE id=$14 RETURNING *`, campos.concat([b.id]));
        if (!r.rows.length) return json(404, { ok: false, error: 'Proposta não encontrada.' });
        return json(200, { ok: true, proposta: propAdmin(r.rows[0]) });
      }

      const r = await pool.query(`INSERT INTO axis_propostas
        (id, token, company_id, cliente, contato, email, titulo, resumo, contexto, escopo, etapas,
         valor, valor_nota, condicoes, validade)
        VALUES ($14,$15,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        campos.concat([propId(), propToken()]));
      json(200, { ok: true, proposta: propAdmin(r.rows[0]) });
    } catch (e) { console.error('[propostas/salvar]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── POST /api/admin/propostas/enviar ─────────────────────────
  if (req.method === 'POST' && url === '/api/admin/propostas/enviar') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, erro: 'Não autorizado' });
    try {
      const { id } = await readBody(req);
      const q = await pool.query('SELECT * FROM axis_propostas WHERE id=$1', [id]);
      if (!q.rows.length) return json(404, { ok: false, error: 'Proposta não encontrada.' });
      await propEnviarLink(q.rows[0]);
      const r = await pool.query(`UPDATE axis_propostas SET enviada_em=NOW(), updated_at=NOW(),
        status = CASE WHEN status='rascunho' THEN 'enviada' ELSE status END WHERE id=$1 RETURNING *`, [id]);
      json(200, { ok: true, proposta: propAdmin(r.rows[0]) });
    } catch (e) { console.error('[propostas/enviar]', e.message); json(500, { ok: false, error: e.message || 'Erro ao enviar.' }); }
    return;
  }

  // ── POST /api/admin/propostas/status ─────────────────────────
  if (req.method === 'POST' && url === '/api/admin/propostas/status') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, erro: 'Não autorizado' });
    try {
      const { id, status } = await readBody(req);
      if (!PROP_STATUS.includes(status)) return json(400, { ok: false, error: 'Status inválido.' });
      // Voltar para "enviada" limpa o aceite: sem isso a proposta reaberta
      // continuaria mostrando ao cliente uma confirmação que não vale mais.
      const limpa = (status === 'enviada' || status === 'rascunho');
      const r = await pool.query(`UPDATE axis_propostas SET status=$1, updated_at=NOW()
        ${limpa ? ', aceita_por=NULL, aceita_em=NULL, aceita_ip=NULL' : ''} WHERE id=$2 RETURNING *`, [status, id]);
      if (!r.rows.length) return json(404, { ok: false, error: 'Proposta não encontrada.' });
      json(200, { ok: true, proposta: propAdmin(r.rows[0]) });
    } catch (e) { console.error('[propostas/status]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── POST /api/admin/propostas/excluir ────────────────────────
  if (req.method === 'POST' && url === '/api/admin/propostas/excluir') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, erro: 'Não autorizado' });
    try {
      const { id } = await readBody(req);
      await pool.query('DELETE FROM axis_propostas WHERE id=$1', [id]);
      json(200, { ok: true });
    } catch (e) { console.error('[propostas/excluir]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── POST /api/admin/propostas/importar ───────────────────────
  // Leva os colaboradores cadastrados pelo cliente na proposta para a
  // empresa vinculada, criando setor e cargo que ainda não existirem.
  if (req.method === 'POST' && url === '/api/admin/propostas/importar') {
    if (!requireAdminAuth(req)) return json(401, { ok: false, erro: 'Não autorizado' });
    try {
      const { id } = await readBody(req);
      const q = await pool.query('SELECT * FROM axis_propostas WHERE id=$1', [id]);
      if (!q.rows.length) return json(404, { ok: false, error: 'Proposta não encontrada.' });
      const p = q.rows[0];
      if (!p.company_id) return json(400, { ok: false, error: 'Vincule a proposta a uma empresa antes de importar.' });
      const lista = Array.isArray(p.colaboradores) ? p.colaboradores : [];
      if (!lista.length) return json(400, { ok: false, error: 'Nenhum colaborador cadastrado nesta proposta.' });

      const d = await loadData();
      const co = (d.axiaCompanies || []).find(c => c.id === p.company_id);
      if (!co) return json(404, { ok: false, error: 'Empresa vinculada não existe mais.' });
      if (!d.axiaEmployees)   d.axiaEmployees = [];
      if (!d.axiaDepartments) d.axiaDepartments = [];
      if (!d.axiaPositions)   d.axiaPositions = [];
      const agora  = new Date().toISOString();
      const depts  = d.axiaDepartments.filter(x => x.companyId === co.id);
      const poss   = d.axiaPositions.filter(x => x.companyId === co.id);
      let novos = 0, repetidos = 0;

      lista.forEach((c, i) => {
        const jaTem = d.axiaEmployees.some(e => e.companyId === co.id &&
          String(e.email || '').toLowerCase() === String(c.email || '').toLowerCase());
        if (jaTem) { repetidos++; return; }
        if (c.setor && !depts.find(x => x.name === c.setor)) {
          const nd = { id: `dept_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`, companyId: co.id, name: c.setor, active: true, createdAt: agora };
          d.axiaDepartments.push(nd); depts.push(nd);
        }
        if (c.cargo && !poss.find(x => x.name === c.cargo)) {
          const np = { id: `pos_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`, companyId: co.id, name: c.cargo, active: true, createdAt: agora };
          d.axiaPositions.push(np); poss.push(np);
        }
        d.axiaEmployees.push({
          id: `emp_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
          companyId: co.id, name: c.nome, email: c.email, setor: c.setor, cargo: c.cargo,
          unidade: '', status: 'ativo', origem: 'proposta', createdAt: agora, updatedAt: agora
        });
        novos++;
      });

      await saveData(d);
      const r = await pool.query('UPDATE axis_propostas SET importada_em=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *', [id]);
      json(200, { ok: true, importados: novos, repetidos, empresa: co.name, proposta: propAdmin(r.rows[0]) });
    } catch (e) { console.error('[propostas/importar]', e.message); json(500, { ok: false, error: 'Erro interno.' }); }
    return;
  }

  // ── GET /proposta/:token — serve a página do cliente ──────────
  if (url.startsWith('/proposta/')) {
    fs.readFile(path.join(DIR, 'proposta.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, must-revalidate' });
      res.end(html);
    });
    return;
  }

  // ── Servir arquivos estáticos ─────────────────────────────────
  let filePath = path.join(DIR, url === '/' ? 'AXIS_NR1_MVP.html' : url);
  fs.readFile(filePath, (err, fileData) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mimeMap = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    // A plataforma muda todo dia. Sem isto o navegador serve JS antigo por horas,
    // e o usuario ve nome de campo, texto e regra de uma versao anterior.
    // no-cache nao desliga o cache: obriga a revalidar antes de reusar.
    const headers = { 'Content-Type': mime };
    if (ext === '.js' || ext === '.html' || ext === '.css') headers['Cache-Control'] = 'no-cache, must-revalidate';
    res.writeHead(200, headers);
    res.end(fileData);
  });
  }).catch(err => {
    console.error('❌ Erro não capturado no handler:', err.message, err.stack);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ erro: 'Erro interno do servidor.' }));
    }
  });
});

// ── Iniciar ────────────────────────────────────────────────────
// server.listen roda SEMPRE primeiro, incondicional. O banco NUNCA pode
// derrubar o processo HTTP (lição do incidente "app não respondeu" no Railway).
// initDB roda em paralelo com retry e nunca chama process.exit.
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

async function initDBWithRetry(maxTentativas = 5) {
  for (let i = 1; i <= maxTentativas; i++) {
    try { await initDB(); return; }
    catch (e) {
      console.error(`❌ initDB falhou (tentativa ${i}/${maxTentativas}):`, e.message);
      if (i < maxTentativas) await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
  console.error('⚠️ initDB não concluído após todas as tentativas. App segue no ar; rotas que dependem do banco falharão até a conexão normalizar.');
}
initDBWithRetry();

process.on('uncaughtException',  e => console.error('uncaughtException:', e && e.message));
process.on('unhandledRejection', e => console.error('unhandledRejection:', e && (e.message || e)));
