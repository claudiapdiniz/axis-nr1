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
    user:      process.env.GMAIL_USER || '',
    pass:      process.env.GMAIL_PASS || '',
    fromName:  process.env.FROM_NAME  || 'AXIS Consultoria',
    serverUrl: SERVER_URL
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
  const nodemailer = require('nodemailer');
  // Usar configuração explícita de SMTP para compatibilidade com Railway
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,           // TLS via STARTTLS
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
    json(200, {
      configured: !!(cfg.user && cfg.pass),
      user: cfg.user || '',
      serverUrl: SERVER_URL
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
