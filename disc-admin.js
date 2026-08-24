/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC — painel da consultora
   Convidar por e-mail, acompanhar status, liberar e ver resultado.
   Depende de disc-executivo.js e disc-executivo-ui.js.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const el  = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dt  = s => { if (!s) return '—'; const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}); };

  let convites = [];
  let moduloAtual = 'executivo';
  let empresaFiltro = '';   // '' = todas

  function raizId() { return moduloAtual === 'pessoal' ? 'disc-pess-app' : 'disc-exec-app'; }

  function msg(txt, cor) {
    const m = el('dxa-msg');
    if (!m) return;
    m.textContent = txt || '';
    m.style.color = cor || 'var(--vermelho)';
    m.style.display = txt ? 'block' : 'none';
  }

  // ── TELA ──────────────────────────────────────────────────────────────
  function render() {
    const raiz = el(raizId());
    if (!raiz) return;
    const titulo = moduloAtual === 'pessoal' ? 'DISC Pessoal' : 'DISC Executivo';
    const todos = convites.filter(c => c.modulo === moduloAtual);

    // agrupa por empresa: com varios clientes, a lista corrida vira bagunça
    const grupos = {};
    todos.forEach(c => {
      const e = (c.empresa || '').trim() || 'Sem empresa';
      (grupos[e] = grupos[e] || []).push(c);
    });
    const empresas = Object.keys(grupos).sort((a, b) => grupos[b].length - grupos[a].length);
    const lista = empresaFiltro ? (grupos[empresaFiltro] || []) : todos;

    raiz.innerHTML = `
    <div class="dx">
      <div class="dx-card">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:6px">
          <div>
            <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:19px">${titulo}</div>
            <div style="font-size:11px;color:var(--cinza);opacity:.65">Convide, acompanhe e libere os resultados</div>
          </div>
          <button class="dx-btn dx-btn-s" style="margin-left:auto" data-dxa="testar">Responder eu mesma (teste)</button>
        </div>
      </div>

      <div class="dx-card">
        <div class="dx-q">Enviar nova avaliação</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label class="dx-lbl">Nome do avaliado *</label><input class="dx-inp" id="dxa-nome" placeholder="Nome completo"></div>
          <div><label class="dx-lbl">E-mail *</label><input class="dx-inp" id="dxa-email" type="email" placeholder="email@empresa.com.br"></div>
          <div><label class="dx-lbl">Empresa</label><input class="dx-inp" id="dxa-empresa" list="dxa-empresas" placeholder="Empresa contratante">
            <datalist id="dxa-empresas">${empresas.filter(e => e !== 'Sem empresa').map(e => `<option value="${esc(e)}">`).join('')}</datalist></div>
          <div><label class="dx-lbl">Cargo</label><input class="dx-inp" id="dxa-cargo" placeholder="Cargo ou função"></div>
        </div>
        <div id="dxa-msg" style="display:none;font-size:12px;margin-top:10px"></div>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center">
          <button class="dx-btn dx-btn-p" data-dxa="enviar">Enviar convite por e-mail</button>
          <span style="font-size:11px;color:var(--cinza);opacity:.7">O avaliado recebe um link próprio e responde sem precisar de senha.</span>
        </div>
      </div>

      ${empresas.length ? `<div class="dx-card">
        <div class="dx-q">Empresas &middot; ${empresas.length}</div>
        <div class="dxa-emp">
          <button class="dxa-chip ${empresaFiltro ? '' : 'on'}" data-dxa="filtrar" data-emp="">Todas
            <span>${todos.length}</span></button>
          ${empresas.map(e => {
            const g = grupos[e];
            const fin = g.filter(c => c.status === 'finalizada').length;
            return `<button class="dxa-chip ${empresaFiltro === e ? 'on' : ''}" data-dxa="filtrar" data-emp="${esc(e)}">
              ${esc(e)}<span>${fin}/${g.length}</span></button>`;
          }).join('')}
        </div>
        ${empresaFiltro && (grupos[empresaFiltro] || []).filter(c => c.status === 'finalizada').length >= 2
          ? `<div class="dxa-eqp">
              <div>
                <b>Relatório de equipe de ${esc(empresaFiltro)}</b>
                <div style="font-size:11px;color:var(--cinza);opacity:.75;margin-top:2px">
                  ${grupos[empresaFiltro].filter(c => c.status === 'finalizada').length} avaliações finalizadas:
                  concentrações, lacunas, complementaridade e riscos do time.</div>
              </div>
              <button class="dx-btn dx-btn-p" data-dxa="equipe">Gerar relatório de equipe</button>
            </div>`
          : empresaFiltro
            ? `<div class="dxa-eqp" style="opacity:.6">
                 <div style="font-size:12px;color:var(--cinza)">O relatório de equipe precisa de pelo menos
                 <b>2 avaliações finalizadas</b> nesta empresa.</div></div>`
            : ''}
      </div>` : ''}

      <div class="dx-card">
        <div class="dx-q">${empresaFiltro ? esc(empresaFiltro) : 'Todas as avaliações'} &middot; ${lista.length}</div>
        ${lista.length ? `
        <div style="overflow-x:auto"><table class="dxa-t"><thead><tr><th>Enviado</th><th>Avaliado</th><th>Empresa</th><th>Status</th><th>Perfil</th><th>Resultado</th><th></th></tr></thead><tbody>${lista.map(linha).join('')}</tbody></table></div>` :
        `<p style="font-size:13px;color:var(--cinza);opacity:.7">Nenhuma avaliação aqui ainda.</p>`}
      </div>
    </div>`;
    ligar();
  }

  function linha(c) {
    const fin = c.status === 'finalizada';
    return `<tr><td style="white-space:nowrap">${dt(c.created_at)}</td><td><b>${esc(c.nome)}</b><div style="font-size:11px;color:var(--cinza);opacity:.7">${esc(c.email)}</div></td><td>${esc(c.empresa) || '—'}${c.cargo ? `<div style="font-size:11px;color:var(--cinza);opacity:.7">${esc(c.cargo)}</div>` : ''}</td><td><span class="dxa-b ${fin ? 'ok' : 'pend'}">${fin ? 'Finalizada' : 'Pendente'}</span></td><td>${c.sigla ? `<b style="color:var(--amarelo);font-family:'Montserrat',sans-serif">${esc(c.sigla)}</b>` : '—'}</td><td>${fin ? `<label class="dxa-sw"><input type="checkbox" data-dxa="liberar" data-id="${c.id}" ${c.liberado ? 'checked' : ''}> liberado</label>` : '—'}</td><td style="white-space:nowrap">
        ${fin ? `<button class="dxa-mini" data-dxa="ver" data-id="${c.id}">Ver resultado</button>` : ''}
        <button class="dxa-mini" data-dxa="reenviar" data-id="${c.id}">${fin && c.liberado ? 'Avisar resultado' : 'Reenviar'}</button><button class="dxa-mini" data-dxa="link" data-tk="${esc(c.token)}">Copiar link</button><button class="dxa-mini" data-dxa="excluir" data-id="${c.id}">Excluir</button></td></tr>`;
  }

  // ── AÇÕES ─────────────────────────────────────────────────────────────
  function ligar() {
    const raiz = el(raizId());
    if (!raiz) return;

    raiz.onclick = ev => {
      const t = ev.target.closest('[data-dxa]');
      if (!t) return;
      const a = t.dataset.dxa;

      if (a === 'enviar')   return enviar();
      if (a === 'testar')   return testar();
      if (a === 'ver')      return verResultado(t.dataset.id);
      if (a === 'excluir')  return excluir(t.dataset.id);
      if (a === 'reenviar') return reenviar(t.dataset.id, t);
      if (a === 'filtrar')  { empresaFiltro = t.dataset.emp || ''; return render(); }
      if (a === 'equipe')   return relatorioEquipe(t);
      if (a === 'link') {
        const url = location.origin + '/disc/' + t.dataset.tk;
        navigator.clipboard.writeText(url).then(() => {
          const o = t.textContent; t.textContent = 'Copiado ✓';
          setTimeout(() => { t.textContent = o; }, 1600);
        }).catch(() => prompt('Copie o link:', url));
      }
    };

    raiz.onchange = ev => {
      const t = ev.target.closest('[data-dxa="liberar"]');
      if (t) liberar(t.dataset.id, t.checked);
    };
  }

  async function enviar() {
    const nome = (el('dxa-nome').value || '').trim();
    const email = (el('dxa-email').value || '').trim();
    if (!nome || !email) return msg('Preencha nome e e-mail.');
    msg('Enviando...', 'var(--cinza)');
    try {
      const r = await fetch('/api/disc/convites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, email, modulo: moduloAtual,
          empresa: (el('dxa-empresa').value || '').trim(),
          cargo:   (el('dxa-cargo').value || '').trim()
        })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) return msg(j.error || 'Falha ao criar o convite.');
      const texto = j.enviado
        ? 'Convite enviado para ' + email
        : 'Convite criado, mas o e-mail falhou. Use "Copiar link" e envie manualmente.';
      const cor = j.enviado ? 'var(--verde)' : 'var(--vermelho)';
      // recarrega e REDESENHA a tabela; a mensagem volta depois do render,
      // senão ela é apagada junto com o HTML antigo.
      await carregar();
      render();
      msg(texto, cor);
    } catch (e) { msg('Erro de conexão.'); }
  }

  async function liberar(id, lib) {
    try {
      await fetch('/api/disc/convites/liberar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, liberado: lib })
      });
      const c = convites.find(x => x.id === id); if (c) c.liberado = lib;
    } catch (e) { msg('Não foi possível alterar a liberação.'); }
  }

  async function reenviar(id, btn) {
    const c = convites.find(x => x.id === id);
    if (!c) return;
    const rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Enviando...';
    try {
      const r = await fetch('/api/disc/convites/reenviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const j = await r.json();
      btn.disabled = false;
      if (!r.ok || !j.ok) { btn.textContent = rotulo; return msg(j.error || 'Falha ao reenviar.'); }
      btn.textContent = 'Enviado';
      setTimeout(() => { btn.textContent = rotulo; }, 2200);
      msg((j.liberou ? 'Aviso de resultado enviado para ' : 'Convite reenviado para ') + c.email, 'var(--verde)');
    } catch (e) {
      btn.disabled = false; btn.textContent = rotulo;
      msg('Erro de conexão.');
    }
  }

  async function relatorioEquipe(btn) {
    if (!global.DISC_EQUIPE) return msg('Gerador de equipe não carregado. Recarregue a página.');
    const rotulo = btn.textContent;
    btn.disabled = true; btn.textContent = 'Montando...';
    try {
      const r = await fetch('/api/disc/equipe?empresa=' + encodeURIComponent(empresaFiltro) +
                            '&modulo=' + moduloAtual);
      const j = await r.json();
      btn.disabled = false; btn.textContent = rotulo;
      if (!r.ok || !j.ok) return msg(j.error || 'Falha ao carregar a equipe.');
      if (!j.pessoas || j.pessoas.length < 2) return msg('São necessárias pelo menos 2 avaliações finalizadas.');
      const nome = global.DISC_EQUIPE.baixar(j.pessoas, { empresa: empresaFiltro, modulo: moduloAtual });
      msg('Relatório de equipe baixado: ' + nome, 'var(--verde)');
    } catch (e) {
      btn.disabled = false; btn.textContent = rotulo;
      msg('Erro ao gerar o relatório de equipe.');
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir esta avaliação e a resposta dela? Não tem volta.')) return;
    try {
      await fetch('/api/disc/convites/excluir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      await carregar();
    } catch (e) { msg('Não foi possível excluir.'); }
  }

  async function verResultado(id) {
    try {
      const r = await fetch('/api/disc/resultado/' + encodeURIComponent(id));
      const j = await r.json();
      if (!r.ok || !j.ok) return msg(j.error || 'Sem resultado.');
      global.discExecMostrarResultado(j.resultado, j.nome);
      const raiz = el(raizId());
      const volta = document.createElement('div');
      volta.style.cssText = 'margin-top:12px';
      volta.innerHTML = '<button class="dx-btn dx-btn-p" id="dxa-laudo">Abrir laudo completo</button>' +
        '<button class="dx-btn dx-btn-s" id="dxa-baixar" style="margin-left:8px">Baixar arquivo</button>' +
        '<button class="dx-btn dx-btn-s" id="dxa-volta" style="margin-left:8px">← Voltar à lista</button>';
      raiz.appendChild(volta);
      el('dxa-volta').onclick = render;
      const metaLaudo = {
        nome: j.nome, cargo: j.cargo, empresa: j.empresa, modulo: j.modulo,
        data: j.completed_at ? new Date(j.completed_at).toLocaleDateString('pt-BR') : ''
      };
      el('dxa-baixar').onclick = function () {
        if (!global.DISC_LAUDO) return msg('Gerador de laudo não carregado.');
        const nome = global.DISC_LAUDO.baixar(j.resultado, metaLaudo);
        msg('Arquivo baixado: ' + nome, 'var(--verde)');
      };
      el('dxa-laudo').onclick = function () {
        if (!global.DISC_LAUDO) return msg('Gerador de laudo não carregado.');
        global.DISC_LAUDO.abrir(j.resultado, metaLaudo);
      };
    } catch (e) { msg('Erro ao carregar o resultado.'); }
  }

  // A consultora responde ela mesma, sem gravar nada no banco
  function testar() {
    global.discExecIniciar({});
    const raiz = el(raizId());
    const volta = document.createElement('div');
    volta.style.cssText = 'margin-top:12px';
    volta.innerHTML = '<button class="dx-btn dx-btn-s" id="dxa-volta">← Voltar ao painel</button>';
    raiz.appendChild(volta);
    el('dxa-volta').onclick = render;
  }

  async function carregar() {
    try {
      const r = await fetch('/api/disc/convites');
      const j = await r.json();
      convites = (j && j.convites) || [];
    } catch (e) { convites = []; }
  }

  // ── CSS extra do painel ───────────────────────────────────────────────
  function css() {
    if (el('dxa-css')) return;
    const s = document.createElement('style');
    s.id = 'dxa-css';
    s.textContent = `
.dx-lbl{display:block;font-size:11px;color:var(--cinza);margin-bottom:4px}
.dx-inp{width:100%;font:inherit;font-size:13px;padding:9px 11px;border:1px solid rgba(31,31,31,.14);border-radius:8px;background:#fff}
.dx-inp:focus{outline:none;border-color:var(--amarelo)}
.dxa-emp{display:flex;flex-wrap:wrap;gap:7px}
.dxa-chip{font:inherit;font-size:12px;padding:7px 13px;border:1px solid rgba(31,31,31,.14);
          background:#fff;border-radius:20px;cursor:pointer;color:var(--cinza);display:flex;align-items:center;gap:7px}
.dxa-chip:hover{border-color:var(--amarelo)}
.dxa-chip.on{background:var(--amarelo);border-color:var(--amarelo);color:#fff;font-weight:600}
.dxa-chip span{font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;opacity:.7}
.dxa-eqp{display:flex;align-items:center;gap:14px;margin-top:14px;padding:14px 16px;
         background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.3);border-radius:10px}
.dxa-eqp button{margin-left:auto;white-space:nowrap}
.dxa-t{width:100%;border-collapse:collapse;font-size:13px}
.dxa-t th{text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--cinza);opacity:.55;padding:0 10px 8px 0;font-weight:600}
.dxa-t td{padding:10px 10px 10px 0;border-top:1px solid rgba(31,31,31,.07);vertical-align:top}
.dxa-b{font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.dxa-b.ok{background:rgba(90,138,106,.14);color:var(--verde)}
.dxa-b.pend{background:rgba(201,168,76,.16);color:#8a7028}
.dxa-sw{font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--cinza)}
.dxa-sw input{accent-color:var(--verde);cursor:pointer}
.dxa-mini{font:inherit;font-size:11px;padding:5px 9px;margin-right:4px;border:1px solid rgba(31,31,31,.14);background:#fff;border-radius:6px;cursor:pointer;color:var(--cinza)}
.dxa-mini:hover{border-color:var(--amarelo);color:var(--preto)}
@media(max-width:720px){.dx-card [style*="grid-template-columns:1fr 1fr"]{grid-template-columns:1fr !important}}
`;
    document.head.appendChild(s);
  }

  global.discAdminAbrir = async function (modulo) {
    moduloAtual = modulo === 'pessoal' ? 'pessoal' : 'executivo';
    css();
    const raiz = el(raizId());
    if (raiz) raiz.innerHTML = '<div class="dx"><div class="dx-card">Carregando...</div></div>';
    await carregar();
    render();
  };

})(typeof window !== 'undefined' ? window : globalThis);
