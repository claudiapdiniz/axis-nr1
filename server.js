// ═══════════════════════════════════════════════════════════════
// AXIS Insight NR-1 — Servidor Local + Túnel Público
// Serve o HTML + API de email + API de dados compartilhados
// + Túnel localtunnel para acesso de qualquer lugar na internet
// ═══════════════════════════════════════════════════════════════
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const PORT = process.env.PORT || 5500;
const DIR  = __dirname;
const DATA_FILE = path.join(DIR, 'axis-data.json');

// URL pública atual (definida após o túnel abrir)
let _publicUrl = null;
let _tunnelAtivo = false;

// ── Detectar IP local da rede ───────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ── Carregar / salvar dados compartilhados ──────────────────────
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { convites: [], respostas: [], pesquisas: [], empresas: [] }; }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Carregar config de email ────────────────────────────────────
function loadEmailConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'email-config.json'), 'utf8')); }
  catch { return null; }
}
function saveEmailConfig(cfg) {
  fs.writeFileSync(path.join(DIR, 'email-config.json'), JSON.stringify(cfg, null, 2));
}

// ── Iniciar túnel ──────────────────────────────────────────────
async function iniciarTunel() {
  const cfg = loadEmailConfig() || {};

  // ── Tentativa 1: ngrok com domínio estático (URL nunca muda) ──
  if (cfg.ngrokToken) {
    try {
      const ngrok = require('@ngrok/ngrok');
      console.log('🌍 Conectando ngrok (URL permanente)...');
      const opts = { addr: PORT, authtoken: cfg.ngrokToken };
      if (cfg.ngrokDomain) opts.domain = cfg.ngrokDomain;
      const listener = await ngrok.forward(opts);
      _publicUrl = listener.url();
      _tunnelAtivo = true;
      cfg.serverUrl = _publicUrl;
      saveEmailConfig(cfg);
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('✅ AXIS Insight NR-1 — ONLINE (ngrok)');
      console.log(`   📱  URL PERMANENTE: ${_publicUrl}`);
      console.log('   Esta URL nunca muda. Links funcionam para sempre.');
      console.log('═══════════════════════════════════════════════════════');
      return;
    } catch(e) {
      console.log('⚠️  ngrok falhou:', e.message, '— tentando tunnelmole...');
    }
  }

  // ── Tentativa 2: tunnelmole (sem tela de aviso, link direto) ──
  try {
    const { tunnelmole } = require('tunnelmole');
    console.log('🌍 Abrindo túnel (tunnelmole)...');
    const url = await tunnelmole({ port: PORT });
    if (!url) throw new Error('URL não retornada');
    _publicUrl = url;
    _tunnelAtivo = true;

    // Verificar se URL mudou e reenviar emails automaticamente
    const urlAnterior = cfg.serverUrl;
    cfg.serverUrl = _publicUrl;
    saveEmailConfig(cfg);

    if (urlAnterior && urlAnterior !== _publicUrl && cfg.user && cfg.pass) {
      const data = loadData();
      const pendentes = (data.convites || []).filter(c => !c.respondido);
      if (pendentes.length > 0) {
        console.log(`🔄 URL mudou. Reenviando link para ${pendentes.length} colaborador(es)...`);
        setTimeout(() => autoReenviarPendentes(pendentes, data, _publicUrl, cfg), 3000);
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ AXIS Insight NR-1 — ONLINE');
    console.log(`   🖥  Local:    http://localhost:${PORT}`);
    console.log(`   📱  Internet: ${_publicUrl}`);
    console.log('   ✔  Sem tela de bloqueio para colaboradores.');
    console.log('   🔄  Links atualizados automaticamente por email.');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    return;

  } catch (e) {
    console.log('⚠️  tunnelmole falhou:', e.message, '— tentando localtunnel...');
  }

  // ── Tentativa 3: localtunnel (fallback, pode ter tela de aviso) ──
  try {
    const localtunnel = require('localtunnel');
    console.log('🌍 Abrindo túnel (localtunnel)...');
    const tunnel = await localtunnel({ port: PORT });
    _publicUrl = tunnel.url;
    _tunnelAtivo = true;

    const urlAnterior = cfg.serverUrl;
    cfg.serverUrl = _publicUrl;
    saveEmailConfig(cfg);

    if (urlAnterior && urlAnterior !== _publicUrl && cfg.user && cfg.pass) {
      const data = loadData();
      const pendentes = (data.convites || []).filter(c => !c.respondido);
      if (pendentes.length > 0) {
        console.log(`🔄 URL mudou. Reenviando link para ${pendentes.length} colaborador(es)...`);
        setTimeout(() => autoReenviarPendentes(pendentes, data, _publicUrl, cfg), 3000);
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ AXIS Insight NR-1 — ONLINE (localtunnel)');
    console.log(`   🖥  Local:    http://localhost:${PORT}`);
    console.log(`   📱  Internet: ${_publicUrl}`);
    console.log('   ⚠️  Colaboradores podem ver tela de aviso ao abrir o link.');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    tunnel.on('close', () => {
      _publicUrl = null; _tunnelAtivo = false;
      setTimeout(iniciarTunel, 3000);
    });
    tunnel.on('error', () => {});

  } catch (e) {
    console.log('⚠️  Túnel não disponível. Usando apenas rede local.');
    const localIP = getLocalIP();
    console.log(`✅  AXIS NR-1: http://localhost:${PORT}  |  rede: http://${localIP}:${PORT}`);
  }
}

// ── Reenviar emails automaticamente quando URL muda ─────────────
async function autoReenviarPendentes(pendentes, data, novaUrl, cfg) {
  let ok = 0, erros = 0;
  for (let i = 0; i < pendentes.length; i++) {
    const convite = pendentes[i];
    const pesquisa = data.pesquisas?.find(p => p.id === convite.pesquisaId);
    const empresa  = pesquisa ? data.empresas?.find(e => e.id === pesquisa.empresaId) : null;
    const link = novaUrl.replace(/\/$/, '') + '/?q=' + convite.token;
    try {
      const html = buildEmailHtml({ nome: convite.nome, titulo: pesquisa?.titulo, link, empresa: empresa?.nome, isResend: true });
      await sendEmail({
        to: convite.email, toName: convite.nome,
        subject: `🔄 LINK ATUALIZADO — Questionário AXIS NR-1 · ${new Date().toLocaleString('pt-BR')}`,
        html, config: cfg
      });
      console.log(`  ✅ Link atualizado: ${convite.nome} <${convite.email}>`);
      ok++;
    } catch(e) {
      console.log(`  ❌ Falhou: ${convite.email} — ${e.message}`);
      erros++;
    }
    if (i < pendentes.length - 1) await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`🎉 Reenvio concluído: ${ok} enviado(s), ${erros} erro(s).`);
}

// ── Template HTML do email ──────────────────────────────────────
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
  .header{background:#1F1F1F;padding:24px 32px;text-align:left}
  .header-brand{font-family:Arial,sans-serif;font-weight:900;font-size:22px;color:#D8C7B8;letter-spacing:-0.5px}
  .header-brand span{color:#C9A84C}
  .header-sub{font-size:11px;color:rgba(216,199,184,.5);letter-spacing:2px;text-transform:uppercase;margin-top:3px}
  .body{padding:36px 40px}
  .greeting{font-size:16px;color:#333;margin-bottom:20px}
  .greeting strong{color:#1F1F1F}
  .invite-text{font-size:15px;color:#C9622A;margin-bottom:28px;line-height:1.6}
  .btn-wrap{text-align:center;margin-bottom:20px}
  .btn{display:inline-block;background:#1F1F1F;color:#D8C7B8;text-decoration:none;padding:14px 36px;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:.3px}
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
      ${isResend ? 'Seu link de acesso foi atualizado. Use o botão abaixo para acessar o questionário.' : 'Você está convidado(a) a responder o questionário de: <strong>Mapeamento de Riscos Psicossociais</strong>'}
      ${titulo && !isResend ? `<br><em style="font-size:13px;color:#888">${titulo}</em>` : ''}
      ${titulo && isResend ? `<br><em style="font-size:13px;color:#888">${titulo}</em>` : ''}
    </p>
    <div class="btn-wrap">
      <a href="${link}" class="btn">▶ Acessar Questionário</a>
    </div>
    <div class="link-box">
      <p>Se o botão não funcionar, copie e cole este link no navegador:</p>
      <a href="${link}">${link}</a>
    </div>
    <hr class="divider">
    <p class="closing">
      Atenciosamente,
      <strong>${empresa || 'AXIS Consultoria'}</strong>
    </p>
  </div>
  <div class="footer">
    <p>Enviado via plataforma <a href="#">AXIS Insight NR-1</a> · Clau Diniz · ${agora}</p>
  </div>
</div>
</body></html>`;
}

// ── Enviar email via Nodemailer ─────────────────────────────────
async function sendEmail({ to, toName, subject, html, config }) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.user, pass: config.pass }
  });
  return transporter.sendMail({
    from: `"${config.fromName || 'AXIS Consultoria'}" <${config.user}>`,
    to: `"${toName}" <${to}>`,
    subject,
    html
  });
}

// ── Ler body de request ─────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve({}); } });
    req.on('error', reject);
  });
}

// ── Servidor HTTP ───────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];
  const params = new URLSearchParams(req.url.split('?')[1] || '');

  function json(code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  // ── GET /api/server-info ──────────────────────────────────────
  if (url === '/api/server-info') {
    const localIP = getLocalIP();
    const cfg = loadEmailConfig();
    const savedUrl = cfg?.serverUrl || '';
    json(200, {
      localIP,
      port: PORT,
      publicUrl: _publicUrl,
      tunnelAtivo: _tunnelAtivo,
      serverUrl: _publicUrl || savedUrl || `http://${localIP}:${PORT}`,
      autoUrl: `http://${localIP}:${PORT}`
    });
    return;
  }

  // ── POST /api/send-email ──────────────────────────────────────
  if (req.method === 'POST' && url === '/api/send-email') {
    const data = await readBody(req);
    const config = loadEmailConfig();
    if (!config || !config.user || !config.pass)
      return json(400, { ok: false, error: 'Email não configurado. Configure nas Configurações da plataforma.' });
    try {
      const html = buildEmailHtml({ nome: data.nome, titulo: data.titulo, link: data.link, empresa: data.empresa, isResend: data.isResend });
      await sendEmail({ to: data.email, toName: data.nome, subject: data.subject || `Convite — Mapeamento de Riscos Psicossociais`, html, config });
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── POST /api/save-email-config ───────────────────────────────
  if (req.method === 'POST' && url === '/api/save-email-config') {
    const cfg = await readBody(req);
    try {
      // Preservar a publicUrl do túnel ativo se não foi enviada
      const existing = loadEmailConfig() || {};
      const merged = { ...existing, ...cfg };
      if (_publicUrl && !cfg.serverUrl) merged.serverUrl = _publicUrl;
      saveEmailConfig(merged);
      json(200, { ok: true });
    } catch(e) { json(500, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /api/email-config-status ─────────────────────────────
  if (url === '/api/email-config-status') {
    const cfg = loadEmailConfig();
    json(200, {
      configured: !!(cfg && cfg.user && cfg.pass),
      user: cfg?.user || '',
      serverUrl: _publicUrl || cfg?.serverUrl || ''
    });
    return;
  }

  // ── POST /api/sync-data ───────────────────────────────────────
  if (req.method === 'POST' && url === '/api/sync-data') {
    const incoming = await readBody(req);
    const current = loadData();
    const merged = { ...current, ...incoming };
    saveData(merged);
    json(200, { ok: true });
    return;
  }

  // ── GET /api/get-convite?token=TOKEN ──────────────────────────
  if (url === '/api/get-convite') {
    const token = params.get('token');
    const data = loadData();
    const convite = data.convites?.find(c => c.token === token);
    const pesquisa = convite ? data.pesquisas?.find(p => p.id === convite.pesquisaId) : null;
    const empresa  = pesquisa ? data.empresas?.find(e => e.id === pesquisa.empresaId) : null;
    if (!convite || !pesquisa) return json(404, { ok: false, error: 'Token inválido ou pesquisa encerrada.' });
    json(200, { ok: true, convite, pesquisa, empresa });
    return;
  }

  // ── POST /api/save-response ───────────────────────────────────
  if (req.method === 'POST' && url === '/api/save-response') {
    const body = await readBody(req);
    const data = loadData();
    if (!data.respostasRH) data.respostasRH = [];
    data.respostasRH.push(body.resposta);
    if (body.conviteId) {
      const c = data.convites?.find(x => x.id === body.conviteId);
      if (c) c.respondido = true;
    }
    saveData(data);
    json(200, { ok: true });
    return;
  }

  // ── GET /api/get-responses?pesquisaId=ID ──────────────────────
  if (url === '/api/get-responses') {
    const pesquisaId = params.get('pesquisaId');
    const data = loadData();
    const respostas = (data.respostasRH || []).filter(r => r.pesquisaId === pesquisaId);
    const convites  = (data.convites   || []).filter(c => c.pesquisaId === pesquisaId);
    json(200, { ok: true, respostas, convites });
    return;
  }

  // ── GET /api/all-data ─────────────────────────────────────────
  if (url === '/api/all-data') {
    json(200, { ok: true, data: loadData() });
    return;
  }

  // ── Servir arquivos estáticos ─────────────────────────────────
  let filePath = path.join(DIR, url === '/' ? 'AXIS_NR1_MVP.html' : url);
  fs.readFile(filePath, (err, fileData) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fileData);
  });
});

// Iniciar servidor em todas as interfaces, depois abrir túnel
server.listen(PORT, '0.0.0.0', () => {
  iniciarTunel(); // abre túnel após servidor estar pronto
});
