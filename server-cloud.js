// ═══════════════════════════════════════════════════════════════
// AXIS Insight NR-1 — Servidor NUVEM (Railway.app)
// Dados persistidos em PostgreSQL · Email via variáveis de ambiente
// URL permanente · Sem tunnel · Roda 24h
// ═══════════════════════════════════════════════════════════════
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

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

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  console.log('✅ Banco de dados pronto.');
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
    const data = await readBody(req);
    const config = loadEmailConfig();
    if (!config.user || !config.pass)
      return json(400, { ok: false, error: 'Email não configurado. Verifique as variáveis de ambiente.' });
    try {
      const html = buildEmailHtml({ nome: data.nome, titulo: data.titulo, link: data.link, empresa: data.empresa, isResend: data.isResend });
      await sendEmail({ to: data.email, toName: data.nome, subject: data.subject || 'Convite — Mapeamento de Riscos Psicossociais', html, config });
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
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

  // ── POST /api/sync-data ──────────────────────────────────────
  if (req.method === 'POST' && url === '/api/sync-data') {
    const incoming = await readBody(req);
    const current  = await loadData();
    const merged   = { ...current, ...incoming };
    await saveData(merged);
    json(200, { ok: true });
    return;
  }

  // ── GET /api/get-convite?token=TOKEN ─────────────────────────
  if (url === '/api/get-convite') {
    const token = params.get('token');
    const data  = await loadData();
    const convite  = data.convites?.find(c => c.token === token);
    const pesquisa = convite ? data.pesquisas?.find(p => p.id === convite.pesquisaId) : null;
    const empresa  = pesquisa ? data.empresas?.find(e => e.id === pesquisa.empresaId) : null;
    if (!convite || !pesquisa) return json(404, { ok: false, error: 'Token inválido ou pesquisa encerrada.' });
    json(200, { ok: true, convite, pesquisa, empresa });
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
    const { email, password } = await readBody(req);
    const d = await loadData();
    const co = (d.axiaCompanies || []).find(c => c.email === email && c.password === password);
    if (!co) return json(401, { ok: false, error: 'E-mail ou senha inválidos.' });
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    if (!d.axiaSessions) d.axiaSessions = {};
    // limpar sessões expiradas
    Object.keys(d.axiaSessions).forEach(t => { if (Date.now() - d.axiaSessions[t].createdAt > 28800000) delete d.axiaSessions[t]; });
    d.axiaSessions[token] = { companyId: co.id, createdAt: Date.now() };
    await saveData(d);
    const { password: _p, ...safe } = co;
    json(200, { ok: true, token, company: safe });
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

  // ── POST /api/axia/admin/company (admin cria/edita empresa) ───
  if (req.method === 'POST' && url === '/api/axia/admin/company') {
    const body = await readBody(req);
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
    const { companyId, newPassword } = await readBody(req);
    if (!companyId || !newPassword) return json(400, { ok: false, error: 'companyId e newPassword obrigatórios.' });
    const d = await loadData();
    const idx = (d.axiaCompanies || []).findIndex(c => c.id === companyId);
    if (idx < 0) return json(404, { ok: false, error: 'Empresa não encontrada.' });
    d.axiaCompanies[idx].password = newPassword;
    d.axiaCompanies[idx].accessStatus = 'nao_enviado'; // precisa reenviar com nova senha
    await saveData(d);
    json(200, { ok: true, tempPassword: newPassword });
    return;
  }

  // ── POST /api/axia/admin/send-access ──────────────────────────
  if (req.method === 'POST' && url === '/api/axia/admin/send-access') {
    const { companyId, forceNewPassword } = await readBody(req);
    if (!companyId) return json(400, { ok: false, error: 'companyId obrigatório.' });
    const d = await loadData();
    const idx = (d.axiaCompanies || []).findIndex(c => c.id === companyId);
    if (idx < 0) return json(404, { ok: false, error: 'Empresa não encontrada.' });
    const co = d.axiaCompanies[idx];

    // Gerar senha temporária se não existir ou forçar nova
    let tempPass = co.password;
    if (!tempPass || forceNewPassword) {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
      const rand6 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      tempPass = `Axis@${rand6}`;
      d.axiaCompanies[idx].password = tempPass;
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
    const body = await readBody(req);
    const d = await loadData();
    if (!d.axiaDepartments) d.axiaDepartments = [];
    if (body.action === 'delete') {
      d.axiaDepartments = d.axiaDepartments.filter(x => !(x.companyId === co.id && x.id === body.id));
    } else if (body.action === 'toggle') {
      const i = d.axiaDepartments.findIndex(x => x.companyId === co.id && x.id === body.id);
      if (i >= 0) d.axiaDepartments[i].active = !d.axiaDepartments[i].active;
    } else {
      const dept = { companyId: co.id, active: true, createdAt: new Date().toISOString(), ...body, id: body.id || `dept_${Date.now()}` };
      const i = d.axiaDepartments.findIndex(x => x.companyId === co.id && x.id === dept.id);
      if (i >= 0) d.axiaDepartments[i] = dept; else d.axiaDepartments.push(dept);
    }
    await saveData(d);
    json(200, { ok: true });
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
    const body = await readBody(req);
    const d = await loadData();
    if (!d.axiaPositions) d.axiaPositions = [];
    if (body.action === 'delete') {
      d.axiaPositions = d.axiaPositions.filter(x => !(x.companyId === co.id && x.id === body.id));
    } else if (body.action === 'toggle') {
      const i = d.axiaPositions.findIndex(x => x.companyId === co.id && x.id === body.id);
      if (i >= 0) d.axiaPositions[i].active = !d.axiaPositions[i].active;
    } else {
      const pos = { companyId: co.id, active: true, createdAt: new Date().toISOString(), ...body, id: body.id || `pos_${Date.now()}` };
      const i = d.axiaPositions.findIndex(x => x.companyId === co.id && x.id === pos.id);
      if (i >= 0) d.axiaPositions[i] = pos; else d.axiaPositions.push(pos);
    }
    await saveData(d);
    json(200, { ok: true });
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
    return;
  }

  // ── POST /api/axia/survey?token=T (cria + envia pesquisa) ─────
  if (req.method === 'POST' && url === '/api/axia/survey') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const body = await readBody(req);
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
        const link = `${SERVER_URL}/axia-responder.html?t=${t}`;
        const html = `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:32px"><div style="max-width:600px;margin:0 auto;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)"><div style="background:#1F1F1F;padding:24px 32px"><div style="font-weight:900;font-size:20px;color:#D8C7B8">AXIS <span style="color:#C9A84C">IA</span></div><div style="font-size:11px;color:rgba(216,199,184,.5);letter-spacing:2px;text-transform:uppercase;margin-top:3px">Riscos Psicossociais</div></div><div style="padding:36px 40px"><p style="font-size:16px;color:#333">Olá, <strong>${emp.name}</strong></p><p style="font-size:14px;color:#555;line-height:1.6">Você foi convidado(a) a participar da <strong>Pesquisa de Riscos Psicossociais</strong> da sua empresa.<br><br>Suas respostas são <strong>totalmente confidenciais</strong> e serão utilizadas apenas de forma agrupada para diagnóstico organizacional.</p><div style="text-align:center;margin:28px 0"><a href="${link}" style="display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700">▶ Responder Pesquisa</a></div><div style="background:#f5f5f3;border-radius:6px;padding:12px 16px;text-align:center"><p style="margin:0 0 6px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1px">Link direto:</p><a href="${link}" style="font-size:12px;color:#1976D2;word-break:break-all">${link}</a></div></div><div style="background:#f9f9f9;padding:14px 40px;text-align:center;border-top:1px solid #eee"><p style="font-size:11px;color:#aaa;margin:0">Enviado via <strong>AXIS IA</strong> · ${co.name}</p></div></div></body></html>`;
        await sendEmail({ to: emp.email, toName: emp.name, subject: `Pesquisa de Riscos Psicossociais – ${co.name}`, html, config });
        sent++;
      } catch(e) { errors++; console.error('Email axia error:', e.message); }
    }
    d.axiaSurveys.push(survey);
    await saveData(d);
    json(200, { ok: true, surveyId, sent, errors });
    return;
  }

  // ── GET /api/axia/surveys?token=T ────────────────────────────
  if (url === '/api/axia/surveys') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
    const d = await loadData();
    const surveys = (d.axiaSurveys || []).filter(s => s.companyId === co.id).map(s => ({
      id: s.id, name: s.name, createdAt: s.createdAt, status: s.status,
      sent: s.sentTo.length,
      responded: s.sentTo.filter(r => r.status === 'respondido').length
    }));
    json(200, { ok: true, surveys });
    return;
  }

  // ── GET /api/axia/validate-token?t=T (página do colaborador) ──
  if (url === '/api/axia/validate-token') {
    const t = params.get('t');
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
    return;
  }

  // ── POST /api/axia/respond (público — sem auth, usa surveyToken) ─
  if (req.method === 'POST' && url === '/api/axia/respond') {
    const { surveyToken, answers } = await readBody(req);
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
    return;
  }

  // ── GET /api/axia/results?token=T&surveyId=ID ─────────────────
  if (url === '/api/axia/results') {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
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
    return;
  }

  // ── GET/POST /api/axia/action-plan?token=T ───────────────────
  if (url === '/api/axia/action-plan' || (req.method === 'POST' && url === '/api/axia/action-plan')) {
    const co = await getAxiaSession(params.get('token'));
    if (!co) return json(401, { ok: false, error: 'Sessão inválida.' });
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
    return;
  }

  // ══════════════════════════════════════════════════════════════

  if (req.method === 'POST' && url === '/api/save-response') {
    const body = await readBody(req);
    const data = await loadData();
    if (!data.respostasRH) data.respostasRH = [];
    data.respostasRH.push(body.resposta);
    if (body.conviteId) {
      const c = data.convites?.find(x => x.id === body.conviteId);
      if (c) c.respondido = true;
    }
    await saveData(data);
    json(200, { ok: true });
    return;
  }

  // ── GET /api/get-responses?pesquisaId=ID ─────────────────────
  if (url === '/api/get-responses') {
    const pesquisaId = params.get('pesquisaId');
    const data = await loadData();
    const respostas = (data.respostasRH || []).filter(r => r.pesquisaId === pesquisaId);
    const convites  = (data.convites   || []).filter(c => c.pesquisaId === pesquisaId);
    json(200, { ok: true, respostas, convites });
    return;
  }

  // ── GET /api/all-data ────────────────────────────────────────
  if (url === '/api/all-data') {
    json(200, { ok: true, data: await loadData() });
    return;
  }

  // ── POST /api/import-data ────────────────────────────────────
  // Importar dados do localStorage do admin para o banco na nuvem
  if (req.method === 'POST' && url === '/api/import-data') {
    const incoming = await readBody(req);
    await saveData(incoming);
    json(200, { ok: true });
    return;
  }

  // ── Servir arquivos estáticos ─────────────────────────────────
  let filePath = path.join(DIR, url === '/' ? 'AXIS_NR1_MVP.html' : url);
  fs.readFile(filePath, (err, fileData) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg' }[ext] || 'application/octet-stream';
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
