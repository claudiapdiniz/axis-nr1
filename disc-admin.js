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
  let impPrevia = null;     // laudo externo lido, aguardando conferência

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
        <div style="display:flex;align-items:center;gap:14px">
          <div>
            <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:19px">${titulo}</div>
            <div style="font-size:11px;color:var(--cinza);opacity:.65">Convide, acompanhe e libere os resultados</div>
          </div>
          <button class="dx-btn dx-btn-s" style="margin-left:auto" data-dxa="testar">Responder eu mesma (teste)</button>
        </div>
      </div>

      <div class="dx-card">
        <div class="dx-q">Enviar nova avaliação</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 20px">
          <div><label class="dx-lbl">Nome do avaliado *</label><input class="dx-inp" id="dxa-nome" placeholder="Nome completo"></div>
          <div><label class="dx-lbl">E-mail *</label><input class="dx-inp" id="dxa-email" type="email" placeholder="email@empresa.com.br"></div>
          <div><label class="dx-lbl">Empresa</label><input class="dx-inp" id="dxa-empresa" list="dxa-empresas" placeholder="Empresa contratante">
            <datalist id="dxa-empresas">${empresas.filter(e => e !== 'Sem empresa').map(e => `<option value="${esc(e)}">`).join('')}</datalist></div>
          <div><label class="dx-lbl">Cargo</label><input class="dx-inp" id="dxa-cargo" placeholder="Cargo ou função"></div>
        </div>
        <div id="dxa-msg" style="display:none;font-size:12px;margin-top:10px"></div>
        <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="dx-btn dx-btn-p" data-dxa="enviar">Enviar convite por e-mail</button>
          <button class="dx-btn dx-btn-s" data-dxa="importar">Importar laudo já existente</button>
          <input type="file" id="dxa-arq" accept="application/pdf,.pdf" style="display:none">
        </div>
        <div style="font-size:11px;color:var(--cinza);opacity:.7;margin-top:8px;line-height:1.5">
          O convite manda um link próprio, sem senha. A importação lê o PDF de uma avaliação
          que a pessoa já fez em outra plataforma e traz os números para o relatório de equipe.
        </div>
      </div>

      ${impPrevia ? cardImportacao() : ''}

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
    const imp = c.origem === 'importado';
    // Importada não tem link nem resultado para liberar: o laudo individual
    // dela é o PDF da plataforma de origem.
    return `<tr><td style="white-space:nowrap">${dt(c.created_at)}</td><td><b>${esc(c.nome)}</b><div style="font-size:11px;color:var(--cinza);opacity:.7">${esc(c.email) || 'sem e-mail'}</div></td><td>${esc(c.empresa) || '—'}${c.cargo ? `<div style="font-size:11px;color:var(--cinza);opacity:.7">${esc(c.cargo)}</div>` : ''}</td><td><span class="dxa-b ${fin ? 'ok' : 'pend'}">${imp ? 'Importada' : (fin ? 'Finalizada' : 'Pendente')}</span>${imp && c.origem_ref ? `<div style="font-size:10px;color:var(--cinza);opacity:.7;margin-top:3px">${esc(c.origem_ref)}</div>` : ''}</td><td>${c.sigla ? `<b style="color:var(--amarelo);font-family:'Montserrat',sans-serif">${esc(c.sigla)}</b>` : '—'}</td><td>${imp ? '<span style="font-size:11px;color:var(--cinza);opacity:.7">laudo de origem</span>' : (fin ? `<label class="dxa-sw"><input type="checkbox" data-dxa="liberar" data-id="${c.id}" ${c.liberado ? 'checked' : ''}> liberado</label>` : '—')}</td><td style="white-space:nowrap">
        ${fin && !imp ? `<button class="dxa-mini" data-dxa="ver" data-id="${c.id}">Ver resultado</button>` : ''}
        ${imp ? '' : `<button class="dxa-mini" data-dxa="reenviar" data-id="${c.id}">${fin && c.liberado ? 'Avisar resultado' : 'Reenviar'}</button><button class="dxa-mini" data-dxa="link" data-tk="${esc(c.token)}">Copiar link</button>`}<button class="dxa-mini" data-dxa="excluir" data-id="${c.id}">Excluir</button></td></tr>`;
  }

  // ── IMPORTAÇÃO DE LAUDO EXTERNO ───────────────────────────────────────
  // A pessoa já fez a avaliação em outra plataforma. Lemos o PDF, a
  // consultora confere na tela e só então grava. Nada entra no banco sem
  // passar por esta conferência.

  const CAPS = () => (global.DISC_EXEC && global.DISC_EXEC.CAPACIDADES) || [];
  const FAT  = () => (global.DISC_EXEC && global.DISC_EXEC.FATORES) || {};

  function fatoresDaBase(base) {
    const p = impPrevia.previa;
    const temAd = p.adaptado && Object.keys(p.adaptado).length === 4;
    const de = (base === 'natural' || !temAd) ? p.natural : p.adaptado;
    const o = {};
    ['D','I','S','C'].forEach(k => { o[k] = (de && de[k] != null) ? Number(de[k]) : 0; });
    return o;
  }

  function siglaDe(f) {
    return ['D','I','S','C'].sort((a, b) => f[b] - f[a]).slice(0, 2).join('');
  }

  function cardImportacao() {
    const p = impPrevia.previa;
    const o = p.origem || {};
    const f = impPrevia.fatores;
    const soma = ['D','I','S','C'].reduce((s, k) => s + (Number(f[k]) || 0), 0);
    const porFator = { D:[], I:[], S:[], C:[] };
    CAPS().forEach(c => porFator[c.fator].push(c));

    return `<div class="dx-card" style="border:1px solid rgba(201,162,39,.45)">
      <div class="dx-q">Conferir laudo importado</div>
      <div style="font-size:12px;color:var(--cinza);opacity:.8;line-height:1.6;margin-bottom:14px">
        Origem: <b>${esc(o.plataforma || 'documento externo')}</b>${o.relatorio ? ' · ' + esc(o.relatorio) : ''}${o.data ? ' · ' + esc(o.data) : ''}${o.protocolo ? ' · protocolo ' + esc(o.protocolo) : ''}<br>
        Arquivo: ${esc(impPrevia.arquivo)}${o.perfilTexto ? '<br>Perfil declarado no laudo: <b>' + esc(o.perfilTexto) + '</b>' : ''}
      </div>

      ${p.avisos && p.avisos.length ? `<div style="background:rgba(201,162,39,.10);border-left:3px solid var(--amarelo);padding:10px 12px;font-size:12px;line-height:1.6;margin-bottom:14px">
        ${p.avisos.map(a => esc(a)).join('<br>')}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 20px">
        <div><label class="dx-lbl">Nome do avaliado *</label><input class="dx-inp" id="dxa-imp-nome" value="${esc(impPrevia.nome)}"></div>
        <div><label class="dx-lbl">E-mail</label><input class="dx-inp" id="dxa-imp-email" type="email" value="${esc(impPrevia.email)}" placeholder="opcional"></div>
        <div><label class="dx-lbl">Empresa *</label><input class="dx-inp" id="dxa-imp-empresa" value="${esc(impPrevia.empresa)}" placeholder="É ela que agrupa o relatório de equipe"></div>
        <div><label class="dx-lbl">Cargo</label><input class="dx-inp" id="dxa-imp-cargo" value="${esc(impPrevia.cargo)}"></div>
      </div>

      <div class="dx-q" style="margin-top:20px;font-size:13px">Perfil nas quatro dimensões</div>
      <div style="font-size:11px;color:var(--cinza);opacity:.75;line-height:1.6;margin-bottom:10px">
        O laudo traz dois conjuntos de percentuais. O que a empresa conhece como "o perfil da pessoa"
        é o do gráfico de composição. O perfil natural é a essência medida na origem.
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:12px">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input type="radio" name="dxa-imp-base" data-dxa="imp-base" value="laudo" ${impPrevia.base === 'laudo' ? 'checked' : ''}>
          Como aparece no laudo</label>
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
          <input type="radio" name="dxa-imp-base" data-dxa="imp-base" value="natural" ${impPrevia.base === 'natural' ? 'checked' : ''}>
          Perfil natural da origem</label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${['D','I','S','C'].map(k => `<div>
          <label class="dx-lbl">${k} · ${esc((FAT()[k] || {}).estilo || '')}</label>
          <input class="dx-inp" type="number" step="0.01" min="0" max="100" data-dxa="imp-fator" data-k="${k}" value="${f[k]}">
        </div>`).join('')}
      </div>
      <div style="font-size:12px;margin-top:8px;color:var(--cinza)">
        Soma: <b id="dxa-imp-soma">${Math.round(soma * 10) / 10}</b> (precisa dar 100) &nbsp;·&nbsp;
        Perfil que será gravado: <b id="dxa-imp-sigla" style="color:var(--amarelo)">${siglaDe(f)}</b>
      </div>

      <div class="dx-q" style="margin-top:20px;font-size:13px">As 24 capacidades, de 0 a 100</div>
      ${['D','I','S','C'].map(k => `
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--cinza);opacity:.6;margin:12px 0 6px">${esc((FAT()[k] || {}).estilo || k)}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px 14px">
          ${porFator[k].map(c => `<div>
            <label class="dx-lbl" style="font-size:10px">${esc(c.nome)}${impPrevia.estimadas.indexOf(c.id) >= 0 ? ' (estimada)' : ''}</label>
            <input class="dx-inp" type="number" min="0" max="100" data-dxa="imp-cap" data-id="${c.id}" value="${impPrevia.caps[c.id] != null ? impPrevia.caps[c.id] : ''}"
              style="${impPrevia.estimadas.indexOf(c.id) >= 0 ? 'border-color:var(--amarelo)' : ''}">
          </div>`).join('')}
        </div>`).join('')}

      <div id="dxa-imp-msg" style="display:none;font-size:12px;margin-top:12px"></div>
      <div style="margin-top:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="dx-btn dx-btn-p" data-dxa="imp-salvar">Salvar avaliação importada</button>
        <button class="dx-btn dx-btn-s" data-dxa="imp-cancelar">Cancelar</button>
        <span style="font-size:11px;color:var(--cinza);opacity:.7">Entra no relatório de equipe. O laudo individual dela continua sendo o PDF de origem.</span>
      </div>
    </div>`;
  }

  function impMsg(txt, cor) {
    const m = el('dxa-imp-msg');
    if (!m) return;
    m.textContent = txt || '';
    m.style.color = cor || 'var(--vermelho)';
    m.style.display = txt ? 'block' : 'none';
  }

  function atualizarResumoImp() {
    const f = impPrevia.fatores;
    const soma = ['D','I','S','C'].reduce((s, k) => s + (Number(f[k]) || 0), 0);
    const s = el('dxa-imp-soma'), g = el('dxa-imp-sigla');
    if (s) s.textContent = Math.round(soma * 10) / 10;
    if (g) g.textContent = siglaDe(f);
  }

  function abrirArquivo() {
    const inp = el('dxa-arq');
    if (!inp) return;
    inp.value = '';
    inp.onchange = () => { if (inp.files && inp.files[0]) lerLaudo(inp.files[0]); };
    inp.click();
  }

  function lerLaudo(file) {
    if (!/\.pdf$/i.test(file.name)) return msg('Envie o PDF do laudo.');
    if (file.size > 15 * 1024 * 1024) return msg('PDF muito grande. Limite de 15 MB.');
    msg('Lendo o laudo...', 'var(--cinza)');
    const fr = new FileReader();
    fr.onerror = () => msg('Não consegui abrir o arquivo.');
    fr.onload = async () => {
      try {
        const r = await fetch('/api/disc/importar/ler', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf_base64: String(fr.result).split(',')[1] || '' })
        });
        const j = await r.json();
        if (!r.ok || !j.ok) return msg(j.error || 'Não consegui ler este PDF.');
        const p = j.previa;
        impPrevia = {
          previa: p,
          arquivo: file.name,
          base: (p.adaptado && Object.keys(p.adaptado).length === 4) ? 'laudo' : 'natural',
          nome: p.nome || (el('dxa-nome') ? (el('dxa-nome').value || '').trim() : ''),
          email: el('dxa-email') ? (el('dxa-email').value || '').trim() : '',
          empresa: el('dxa-empresa') ? (el('dxa-empresa').value || '').trim() : '',
          cargo: el('dxa-cargo') ? (el('dxa-cargo').value || '').trim() : '',
          caps: Object.assign({}, p.capacidades),
          estimadas: p.estimadas || [],
          fatores: null
        };
        impPrevia.fatores = fatoresDaBase(impPrevia.base);
        render();
        msg('');
        const c = el('dxa-imp-nome');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) { msg('Erro de conexão ao ler o laudo.'); }
    };
    fr.readAsDataURL(file);
  }

  function guardarCamposImp() {
    if (!impPrevia) return;
    ['nome','email','empresa','cargo'].forEach(k => {
      const i = el('dxa-imp-' + k);
      if (i) impPrevia[k] = (i.value || '').trim();
    });
  }

  async function salvarImportado() {
    guardarCamposImp();
    const p = impPrevia;
    if (!p.nome) return impMsg('Preencha o nome.');
    if (!p.empresa) return impMsg('Preencha a empresa: é ela que agrupa o relatório de equipe.');
    const soma = ['D','I','S','C'].reduce((s, k) => s + (Number(p.fatores[k]) || 0), 0);
    if (soma < 95 || soma > 105) return impMsg('As quatro dimensões precisam somar 100. Hoje somam ' + (Math.round(soma * 10) / 10) + '.');
    const faltando = CAPS().filter(c => !isFinite(Number(p.caps[c.id])));
    if (faltando.length) return impMsg('Faltou preencher: ' + faltando.map(c => c.nome).join(', ') + '.');

    // o outro conjunto de percentuais entra como perfil adaptado: é dele que
    // sai o IIA, a distância entre o natural e o que o meio pede
    const outro = fatoresDaBase(p.base === 'natural' ? 'laudo' : 'natural');
    impMsg('Salvando...', 'var(--cinza)');
    try {
      const r = await fetch('/api/disc/importar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: p.nome, email: p.email, empresa: p.empresa, cargo: p.cargo,
          modulo: moduloAtual, base: p.base,
          natural: p.fatores, adaptado: outro,
          capacidades: p.caps, estimadas: p.estimadas,
          origem: p.previa.origem, lido: p.previa
        })
      });
      const j = await r.json();
      if (!r.ok || !j.ok) return impMsg(j.error || 'Falha ao salvar.');
      const nome = p.nome;
      impPrevia = null;
      await carregar();
      render();
      msg(nome + ' entrou como avaliação importada, perfil ' + j.sigla + '.', 'var(--verde)');
    } catch (e) { impMsg('Erro de conexão.'); }
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
      if (a === 'importar') return abrirArquivo();
      if (a === 'imp-salvar')   return salvarImportado();
      if (a === 'imp-cancelar') { impPrevia = null; return render(); }
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
      const lib = ev.target.closest('[data-dxa="liberar"]');
      if (lib) return liberar(lib.dataset.id, lib.checked);
      const base = ev.target.closest('[data-dxa="imp-base"]');
      if (base && impPrevia) {
        guardarCamposImp();
        impPrevia.base = base.value === 'natural' ? 'natural' : 'laudo';
        impPrevia.fatores = fatoresDaBase(impPrevia.base);
        return render();
      }
    };

    // Digitação na tela de conferência: guarda no estado para não perder o
    // que foi corrigido se a tela for redesenhada.
    raiz.oninput = ev => {
      if (!impPrevia) return;
      const f = ev.target.closest('[data-dxa="imp-fator"]');
      if (f) { impPrevia.fatores[f.dataset.k] = f.value === '' ? 0 : Number(f.value); return atualizarResumoImp(); }
      const c = ev.target.closest('[data-dxa="imp-cap"]');
      if (c) { impPrevia.caps[c.dataset.id] = c.value === '' ? null : Number(c.value); return; }
      const campo = ev.target.closest('#dxa-imp-nome, #dxa-imp-email, #dxa-imp-empresa, #dxa-imp-cargo');
      if (campo) impPrevia[campo.id.replace('dxa-imp-', '')] = campo.value;
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
.dx-lbl{display:block;font-size:11.5px;font-weight:600;letter-spacing:.2px;color:var(--cinza);margin-bottom:7px}
.dx-inp{width:100%;font:inherit;font-size:14px;padding:12px 14px;border:1px solid rgba(31,31,31,.13);border-radius:9px;background:#fff;transition:border-color .15s}
.dx-inp:focus{outline:none;border-color:var(--amarelo);box-shadow:0 0 0 3px rgba(201,168,76,.12)}
.dxa-emp{display:flex;flex-wrap:wrap;gap:9px}
.dxa-chip{font:inherit;font-size:13px;padding:10px 17px;border:1px solid rgba(31,31,31,.13);
          background:#fff;border-radius:22px;cursor:pointer;color:var(--cinza);display:flex;align-items:center;gap:9px;transition:all .15s}
.dxa-chip:hover{border-color:var(--amarelo)}
.dxa-chip.on{background:var(--amarelo);border-color:var(--amarelo);color:#fff;font-weight:600}
.dxa-chip span{font-family:'Montserrat',sans-serif;font-weight:700;font-size:11px;opacity:.7}
.dxa-eqp{display:flex;align-items:center;gap:18px;margin-top:20px;padding:20px 22px;
         background:rgba(201,168,76,.07);border:1px solid rgba(201,168,76,.28);border-radius:12px}
.dxa-eqp button{margin-left:auto;white-space:nowrap}
.dxa-t{width:100%;border-collapse:collapse;font-size:13px}
.dxa-t th{text-align:left;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--cinza);opacity:.5;padding:0 14px 12px 0;font-weight:700}
.dxa-t td{padding:16px 14px 16px 0;border-top:1px solid rgba(31,31,31,.07);vertical-align:middle}
.dxa-b{font-size:10.5px;font-weight:700;padding:5px 11px;border-radius:20px;white-space:nowrap;letter-spacing:.3px}
.dxa-b.ok{background:rgba(90,138,106,.14);color:var(--verde)}
.dxa-b.pend{background:rgba(201,168,76,.16);color:#8a7028}
.dxa-sw{font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;color:var(--cinza)}
.dxa-sw input{accent-color:var(--verde);cursor:pointer}
.dxa-mini{font:inherit;font-size:11.5px;padding:7px 12px;margin:0 5px 5px 0;border:1px solid rgba(31,31,31,.13);background:#fff;border-radius:7px;cursor:pointer;color:var(--cinza);transition:all .15s}
.dxa-mini:hover{border-color:var(--amarelo);color:var(--preto)}
@media(max-width:720px){.dx-card [style*="grid-template-columns:1fr 1fr"]{grid-template-columns:1fr !important}}
`;
    document.head.appendChild(s);
  }

  global.discAdminAbrir = async function (modulo) {
    moduloAtual = modulo === 'pessoal' ? 'pessoal' : 'executivo';
    if (global.discExecCSS) global.discExecCSS();   // regras base .dx-*
    css();
    const raiz = el(raizId());
    if (raiz) raiz.innerHTML = '<div class="dx"><div class="dx-card">Carregando...</div></div>';
    await carregar();
    render();
  };

})(typeof window !== 'undefined' ? window : globalThis);
