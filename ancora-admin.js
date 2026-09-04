/* ═══════════════════════════════════════════════════════════════════════
   AXIS ÂNCORA PROFISSIONAL — painel da consultora
   Convidar por e-mail, acompanhar quem respondeu, liberar e ler o
   resultado. Depende de ancora-profissional.js apenas no servidor: aqui
   o conteúdo das âncoras chega junto do resultado.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const el  = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dt  = s => { if (!s) return '—'; const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}); };
  const chaveEmp = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  let convites = [];
  let cadastro = [];
  let empSel = '';
  let filtro = '';
  let aberto = null;   // id do convite com o resultado aberto

  async function carregarCadastro() {
    try {
      const r = await fetch('/api/empresas/lista');
      const j = await r.json();
      if (j && j.ok) cadastro = j.empresas || [];
    } catch (e) { cadastro = []; }
  }

  function empresaEscolhida() {
    if (empSel === '__outra' || !empSel) {
      const i = el('anc-empresa-livre');
      return { nome: i ? (i.value || '').trim() : '', company_id: null };
    }
    const c = cadastro.find(x => String(x.id) === String(empSel));
    return c ? { nome: c.nome, company_id: c.id } : { nome: '', company_id: null };
  }

  function msg(txt, cor) {
    const m = el('anc-msg');
    if (!m) return;
    m.textContent = txt || '';
    m.style.color = cor || 'var(--cinza)';
    m.style.display = txt ? 'block' : 'none';
  }

  // ── Casca da tela ───────────────────────────────────────────────────
  // Estilo proprio do modulo. As classes da plataforma (card, fc, btn)
  // sao reaproveitadas; aqui entra so o que nao existe la.
  function estilo() {
    if (document.getElementById('anc-css')) return;
    const s = document.createElement('style');
    s.id = 'anc-css';
    s.textContent = [
      '.anc-lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.65;margin-bottom:5px}',
      '.anc-sec{border:1.5px solid rgba(203,184,166,.6);background:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .18s}',
      '.anc-sec:hover{border-color:var(--preto);background:#faf8f5}'
    ].join('');
    document.head.appendChild(s);
  }

  function casca() {
    return `
    <div style="margin-bottom:18px">
      <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:22px">Âncora Profissional</div>
      <div style="font-size:13px;opacity:.72;margin-top:3px;line-height:1.6;max-width:620px">
        Mapeia o que a pessoa não abre mão na carreira e compara com o que a função de hoje entrega.
        A distância entre os dois é o índice de desalinhamento, que é o que liga este módulo ao inventário da NR-1.
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Novo convite</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">
        <div>
          <label class="anc-lbl">Empresa</label>
          <select id="anc-empresa" class="fc"></select>
          <input id="anc-empresa-livre" class="fc" placeholder="Nome da empresa" style="margin-top:8px;display:none">
        </div>
        <div><label class="anc-lbl">Nome de quem vai responder</label><input id="anc-nome" class="fc" placeholder="Nome completo"></div>
        <div><label class="anc-lbl">E-mail</label><input id="anc-email" class="fc" type="email" placeholder="email@empresa.com.br"></div>
        <div><label class="anc-lbl">Cargo</label><input id="anc-cargo" class="fc" placeholder="Opcional"></div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn-p" id="anc-criar">Enviar convite</button>
        <span id="anc-msg" style="font-size:13px;display:none"></span>
      </div>
      <div style="font-size:12px;opacity:.65;margin-top:10px;line-height:1.6">
        A pessoa recebe o link por e-mail e precisa digitar um código de 6 dígitos para abrir. É esse código que registra quem respondeu.
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <h3 style="font-size:15px;font-weight:700;margin:0">Convites</h3>
      <select id="anc-filtro" class="fc" style="width:auto;min-width:200px"></select>
      <span style="font-size:12px;opacity:.6" id="anc-contagem"></span>
    </div>
    <div id="anc-lista"></div>`;
  }

  function opcoesEmpresa() {
    const s = el('anc-empresa');
    if (!s) return;
    const nomes = cadastro.slice().sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity:'base' }));
    s.innerHTML = '<option value="">Selecione a empresa</option>' +
      nomes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('') +
      '<option value="__outra">Outra empresa, digitar</option>';
    s.value = empSel;
    s.onchange = () => {
      empSel = s.value;
      el('anc-empresa-livre').style.display = empSel === '__outra' ? 'block' : 'none';
    };

    const f = el('anc-filtro');
    const daLista = [];
    convites.forEach(c => {
      const k = chaveEmp(c.empresa);
      if (k && !daLista.some(x => x.k === k)) daLista.push({ k, nome: c.empresa });
    });
    daLista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity:'base' }));
    f.innerHTML = '<option value="">Todas as empresas</option>' +
      daLista.map(x => `<option value="${esc(x.k)}">${esc(x.nome)}</option>`).join('');
    f.value = filtro;
    f.onchange = () => { filtro = f.value; renderLista(); };
  }

  // ── Lista ───────────────────────────────────────────────────────────
  function renderLista() {
    const alvo = el('anc-lista');
    if (!alvo) return;
    const itens = convites.filter(c => c.status !== 'excluido' && (!filtro || chaveEmp(c.empresa) === filtro));
    el('anc-contagem').textContent = itens.length
      ? itens.length + ' convite' + (itens.length > 1 ? 's' : '') + ', ' +
        itens.filter(c => c.status === 'finalizada').length + ' respondido' +
        (itens.filter(c => c.status === 'finalizada').length !== 1 ? 's' : '')
      : '';

    if (!itens.length) {
      alvo.innerHTML = `<div class="card" style="text-align:center;padding:30px;opacity:.6;font-size:14px">
        Nenhum convite ainda. O primeiro se cria no formulário acima.</div>`;
      return;
    }

    alvo.innerHTML = itens.map(c => {
      const fez = c.status === 'finalizada';
      const cor = fez ? 'var(--verde,#5A8A6A)' : 'var(--amarelo,#C9A84C)';
      const ida = c.ida === null || c.ida === undefined ? null : c.ida;
      return `
      <div class="card" style="margin-bottom:10px;padding:16px 18px">
        <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
          <div style="min-width:220px">
            <div style="font-weight:700;font-size:15px">${esc(c.nome)}</div>
            <div style="font-size:12.5px;opacity:.7;margin-top:2px">
              ${esc(c.empresa || 'Sem empresa')}${c.cargo ? ' · ' + esc(c.cargo) : ''}
            </div>
            <div style="font-size:12px;opacity:.55;margin-top:4px">${esc(c.email)}</div>
          </div>
          <div style="text-align:right;min-width:170px">
            <span style="display:inline-block;background:${cor};color:#1F1F1F;border-radius:100px;padding:3px 12px;font-size:11px;font-weight:800;letter-spacing:.4px">
              ${fez ? 'RESPONDIDO' : 'PENDENTE'}
            </span>
            <div style="font-size:11.5px;opacity:.6;margin-top:6px">
              ${fez ? dt(c.completed_at) : 'enviado em ' + dt(c.created_at)}
            </div>
            ${ida !== null ? `<div style="font-size:12px;margin-top:6px"><strong>IDA ${ida}</strong> · ${esc(c.idaNivel || '')}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="anc-sec" data-acao="link" data-id="${esc(c.id)}">Copiar link</button>
          ${fez ? `<button class="anc-sec" data-acao="ver" data-id="${esc(c.id)}">${aberto === c.id ? 'Fechar resultado' : 'Ver resultado'}</button>` : ''}
          ${fez ? `<button class="anc-sec" data-acao="liberar" data-id="${esc(c.id)}" data-lib="${c.liberado ? '1' : '0'}">
                     ${c.liberado ? 'Ocultar do avaliado' : 'Liberar para o avaliado'}</button>` : ''}
          <button class="anc-sec" data-acao="excluir" data-id="${esc(c.id)}" style="opacity:.6">Excluir</button>
        </div>
        <div id="anc-res-${esc(c.id)}"></div>
      </div>`;
    }).join('');

    alvo.querySelectorAll('button[data-acao]').forEach(b => {
      b.onclick = () => acao(b.dataset.acao, b.dataset.id, b.dataset);
    });
    if (aberto) {
      const c = itens.find(x => x.id === aberto);
      if (c) mostrarResultado(c.id);
    }
  }

  async function acao(nome, id, dados) {
    const c = convites.find(x => x.id === id);
    if (!c) return;
    if (nome === 'link') {
      try { await navigator.clipboard.writeText(c.link); msg('Link copiado.', 'var(--verde,#5A8A6A)'); }
      catch (e) { window.prompt('Copie o link:', c.link); }
      return;
    }
    if (nome === 'ver') { aberto = (aberto === id ? null : id); renderLista(); return; }
    if (nome === 'liberar') {
      const novo = dados.lib !== '1';
      await fetch('/api/ancora/convites/liberar', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id, liberado: novo })
      });
      await carregar();
      return;
    }
    if (nome === 'excluir') {
      if (!window.confirm('Excluir o convite de ' + c.nome + '? A resposta dele sai da lista.')) return;
      await fetch('/api/ancora/convites/excluir', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id })
      });
      await carregar();
    }
  }

  // ── Resultado na tela ───────────────────────────────────────────────
  async function mostrarResultado(id) {
    const caixa = el('anc-res-' + id);
    if (!caixa) return;
    caixa.innerHTML = '<div style="padding:14px 0;font-size:13px;opacity:.6">Carregando o resultado...</div>';
    let d;
    try {
      const r = await fetch('/api/ancora/resultado?id=' + encodeURIComponent(id));
      d = await r.json();
    } catch (e) { d = { ok:false, error:'Falha de conexão.' }; }
    if (!d.ok) { caixa.innerHTML = `<div style="padding:12px 0;font-size:13px;color:#B85C5C">${esc(d.error || 'Não consegui carregar.')}</div>`; return; }

    const res = d.resultado, conteudo = d.conteudo || [];
    const porId = {}; conteudo.forEach(a => { porId[a.id] = a; });
    const maior = Math.max.apply(null, res.ancoras.map(a => a.pontos));

    const linhas = res.ancoras.map(a => `
      <div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;gap:10px">
          <span><strong>${a.posicao}.</strong> ${esc(a.nome)}
            ${a.prioridade ? `<span style="font-size:10.5px;background:rgba(201,168,76,.2);border-radius:100px;padding:1px 7px;margin-left:5px">escolha ${a.prioridade}</span>` : ''}
          </span>
          <span style="white-space:nowrap"><strong>${a.pontos}</strong>${a.oferta !== null ? ` · função ${a.oferta}` : ''}</span>
        </div>
        <div style="background:#eae5de;border-radius:4px;height:8px;position:relative">
          <div style="height:8px;border-radius:4px;background:${esc(a.cor)};width:${Math.round(a.pontos / (maior || 100) * 100)}%"></div>
          ${a.oferta !== null ? `<div title="o que a função entrega" style="position:absolute;top:-3px;left:calc(${a.oferta}% - 1px);width:2px;height:14px;background:#1F1F1F;opacity:.55"></div>` : ''}
        </div>
      </div>`).join('');

    const alertas = (res.alertas || []).map(a => `
      <div style="background:rgba(184,92,92,.08);border:1px solid rgba(184,92,92,.25);border-radius:9px;padding:11px 13px;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;margin-bottom:3px">${esc(a.nome)}: a função entrega ${a.oferta} de 100</div>
        <div style="font-size:12.5px;opacity:.8;line-height:1.6">${esc(a.leitura)}</div>
      </div>`).join('');

    const detalhe = res.ancoras.slice(0, 3).map(a => {
      const c = porId[a.id] || {};
      return `
      <div style="border-top:1px solid #ece8e2;padding-top:12px;margin-top:12px">
        <div style="font-weight:700;font-size:14px;margin-bottom:5px">${a.posicao}. ${esc(a.nome)} · ${a.pontos}/100</div>
        <div style="font-size:13px;opacity:.82;line-height:1.65;margin-bottom:7px">${esc(c.definicao || '')}</div>
        <div style="font-size:12.5px;opacity:.72;line-height:1.6"><strong>Leitura de risco:</strong> ${esc(c.riscoNR1 || '')}</div>
      </div>`;
    }).join('');

    caixa.innerHTML = `
      <div style="border-top:1px solid #ece8e2;margin-top:14px;padding-top:14px">
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.6">Desalinhamento</div>
            <div style="font-size:22px;font-weight:800">${res.ida === null ? '—' : res.ida}
              <span style="font-size:13px;font-weight:600;opacity:.75">${esc(res.idaNivel || '')}</span></div>
          </div>
          <div style="flex:1;min-width:220px;font-size:12.5px;opacity:.78;line-height:1.6;align-self:center">${esc(res.idaNota || '')}</div>
        </div>
        ${linhas}
        <div style="font-size:11.5px;opacity:.55;margin:10px 0 16px">A barra colorida é o quanto a âncora importa. O traço escuro é o quanto a função de hoje entrega.</div>
        ${alertas ? `<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.6;margin-bottom:7px">Alertas de risco psicossocial</div>${alertas}` : ''}
        ${detalhe}
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
          <button class="anc-sec" id="anc-laudo-ver-${esc(id)}">Ver laudo completo</button>
          <button class="anc-sec" id="anc-laudo-baixar-${esc(id)}">Baixar laudo</button>
        </div>
        <div style="font-size:11.5px;opacity:.55;margin-top:14px;line-height:1.6">
          Respondido em ${dt(d.avaliado.respondidoEm)} · ${Math.round((d.tempoSegundos || 0) / 60)} minutos · protocolo ${esc(d.versao || '')}.
          As faixas de classificação são convenção de leitura da AXIS e não pontos de corte validados.
          Modelo de âncoras de carreira de Edgar Schein; itens e textos da AXIS.
        </div>
      </div>`;

    // O laudo é o mesmo documento em A4 que abre para ler e que baixa para
    // arquivar. Sem ANCORA_LAUDO carregado, os botões saem da tela em vez
    // de ficarem ali quebrados.
    const meta = {
      id, nome: d.avaliado.nome, empresa: d.avaliado.empresa, cargo: d.avaliado.cargo,
      data: d.avaliado.respondidoEm, versao: d.versao,
      minutos: Math.round((d.tempoSegundos || 0) / 60)
    };
    const bVer = el('anc-laudo-ver-' + id), bBaixar = el('anc-laudo-baixar-' + id);
    if (!global.ANCORA_LAUDO) {
      if (bVer) bVer.remove();
      if (bBaixar) bBaixar.remove();
    } else {
      if (bVer) bVer.onclick = () => global.ANCORA_LAUDO.abrir(res, conteudo, meta);
      if (bBaixar) bBaixar.onclick = () => global.ANCORA_LAUDO.baixar(res, conteudo, meta);
    }
  }

  // ── Criar convite ───────────────────────────────────────────────────
  async function criar() {
    const emp = empresaEscolhida();
    const nome = (el('anc-nome').value || '').trim();
    const email = (el('anc-email').value || '').trim();
    const cargo = (el('anc-cargo').value || '').trim();
    if (!nome || !email) { msg('Preencha nome e e-mail.', '#B85C5C'); return; }
    const b = el('anc-criar');
    b.disabled = true; msg('Enviando...');
    try {
      const r = await fetch('/api/ancora/convites', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ nome, email, cargo, empresa: emp.nome, company_id: emp.company_id })
      });
      const j = await r.json();
      if (!j.ok) { msg(j.error || 'Não consegui criar o convite.', '#B85C5C'); return; }
      el('anc-nome').value = ''; el('anc-email').value = ''; el('anc-cargo').value = '';
      msg(j.enviado ? 'Convite enviado para ' + email + '.'
                    : 'Convite criado, mas o e-mail não saiu. Copie o link na lista e mande pela mão.',
          j.enviado ? 'var(--verde,#5A8A6A)' : '#B85C5C');
      await carregar();
    } catch (e) {
      msg('Falha de conexão.', '#B85C5C');
    } finally { b.disabled = false; }
  }

  async function carregar() {
    try {
      const r = await fetch('/api/ancora/convites');
      const j = await r.json();
      convites = (j && j.ok) ? (j.itens || []) : [];
    } catch (e) { convites = []; }
    opcoesEmpresa();
    renderLista();
  }

  async function abrir() {
    const raiz = el('ancora-app');
    if (!raiz) return;
    estilo();
    raiz.innerHTML = casca();
    el('anc-criar').onclick = criar;
    await carregarCadastro();
    await carregar();
  }

  global.ancoraAdminAbrir = abrir;

})(window);
