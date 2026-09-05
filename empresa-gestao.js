/* ═══════════════════════════════════════════════════════════════════════
   AXIS — AÇÕES DE GESTÃO

   Aba Gestão da ficha da empresa. Registra o que a direção e as
   lideranças fizeram no dia a dia: reunião de metas, feedback, plano de
   desenvolvimento, reconhecimento, advertência.

   Serve para dois momentos. No primeiro, a empresa acompanha se as
   lideranças estão conduzindo pessoas ou apenas cobrando número. No
   segundo, quando a cobrança de resultado é questionada como assédio, é
   este histórico que mostra o que foi dito, quando, com que apoio e com
   ciência de quem recebeu.

   Nada aqui se apaga: editar guarda a versão anterior e cancelar apenas
   muda o status, com motivo. Documento que some quando incomoda não
   vale como evidência.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const TIPOS = ['Advertência', 'Feedback', 'Orientação', 'Plano de desenvolvimento',
                 'Reconhecimento', 'Reunião de metas'];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dia = s => {
    if (!s) return '';
    const d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s);
    return isNaN(d) ? String(s) : d.toLocaleDateString('pt-BR');
  };
  const hora = s => {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const val = id => (document.getElementById(id) || {}).value || '';

  let ctx = { empId:'', empNome:'', alvoId:'tab-content', api:'/api/empresa/acoes-gestao', token:'' };
  let itens = [];
  let resumo = null;
  let filtro = 'Todas';
  let aberto = '';        // id do registro expandido
  let form = false;       // formulário de novo lançamento visível

  // A mesma tela roda no painel da consultora e no portal da empresa, que
  // têm folhas de estilo diferentes. Card e botão existem nos dois; chip,
  // campo de formulário e título de card, não. Estes vêm daqui, com nome
  // próprio, para a tela ficar igual nos dois lugares.
  function estilo() {
    if (document.getElementById('ag-css')) return;
    const s = document.createElement('style');
    s.id = 'ag-css';
    s.textContent = `
      .ag-ct{font-weight:700;font-size:13px}
      .ag-chip{display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;
        background:rgba(201,168,76,.16);border:1px solid rgba(201,168,76,.35);
        font-size:11px;line-height:1.4;white-space:nowrap}
      .ag-fc{width:100%;padding:9px 12px;border:1.5px solid rgba(203,184,166,.5);border-radius:7px;
        font-family:inherit;font-size:13px;background:#fff;color:inherit}
      .ag-fc:focus{outline:none;border-color:rgba(201,168,76,.9)}
      textarea.ag-fc{resize:vertical;min-height:70px}`;
    document.head.appendChild(s);
  }

  // opts: { api, token }. O portal manda o token da sessão da empresa na
  // query, que é como todas as rotas /api/axia/ se identificam.
  async function render(empId, empNome, alvoId, opts) {
    const o = opts || {};
    ctx = {
      empId: empId || '', empNome: empNome || '', alvoId: alvoId || 'tab-content',
      api: o.api || '/api/empresa/acoes-gestao', token: o.token || ''
    };
    filtro = 'Todas'; aberto = ''; form = false;
    estilo();
    const alvo = document.getElementById(ctx.alvoId);
    if (!alvo) return;
    alvo.innerHTML = '<div style="padding:20px;font-size:13px;opacity:.7">Carregando as ações de gestão...</div>';
    await carregar();
    pintar();
  }

  function endereco() {
    const q = [];
    if (ctx.token) q.push('token=' + encodeURIComponent(ctx.token));
    if (ctx.empId) q.push('company_id=' + encodeURIComponent(ctx.empId));
    if (ctx.empNome) q.push('empresa=' + encodeURIComponent(ctx.empNome));
    return ctx.api + (q.length ? '?' + q.join('&') : '');
  }

  async function carregar() {
    try {
      const r = await fetch(endereco());
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { itens = []; resumo = null; return j.error || 'Não consegui ler os registros.'; }
      itens = j.itens || [];
      resumo = j.resumo || null;
      return '';
    } catch (e) { itens = []; resumo = null; return 'Erro de conexão.'; }
  }

  async function enviar(corpo) {
    const r = await fetch(endereco(), {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(Object.assign({ company_id: ctx.empId, empresa: ctx.empNome }, corpo))
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || 'Não consegui gravar.');
    itens = j.itens || itens;
    resumo = j.resumo || resumo;
    return j;
  }

  // ── TELA ──────────────────────────────────────────────────────────────
  function pintar() {
    const alvo = document.getElementById(ctx.alvoId);
    if (!alvo) return;
    const lista = filtro === 'Todas' ? itens : itens.filter(i => i.tipo === filtro);

    alvo.innerHTML = `
      ${topo()}
      ${form ? formulario() : ''}
      <div class="card">
        <div class="ch" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="ag-ct">Histórico</div>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            ${['Todas'].concat(TIPOS).map(t => `
              <span class="ag-chip" data-filtro="${esc(t)}" style="cursor:pointer;${t === filtro
                ? 'background:var(--preto);color:var(--bege)' : ''}">${esc(t)}</span>`).join('')}
          </div>
        </div>
        <div class="cb">${lista.length ? linhas(lista) : vazio()}</div>
      </div>`;

    ligar(alvo);
  }

  function topo() {
    const r = resumo || { total:0, no_ano:0, ultimos_30:0, pct_ciencia:0, responsaveis:0 };
    const num = (n, rot) => `<div style="text-align:center;min-width:88px">
      <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:22px">${n}</div>
      <div style="font-size:10px;letter-spacing:.6px;text-transform:uppercase;opacity:.55">${rot}</div>
    </div>`;
    return `<div class="card" style="margin-bottom:16px"><div class="cb">
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:230px">
          <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;opacity:.55">Ações de gestão</div>
          <div style="font-size:12px;opacity:.8;line-height:1.6;margin-top:6px;max-width:520px">
            O que a direção e as lideranças conduziram com a equipe. Cada lançamento guarda data,
            autor, conteúdo e ciência de quem recebeu.
          </div>
        </div>
        ${num(r.no_ano, 'no ano')}
        ${num(r.ultimos_30, 'últimos 30 dias')}
        ${num(r.pct_ciencia + '%', 'com ciência')}
        ${num(r.responsaveis, r.responsaveis === 1 ? 'responsável' : 'responsáveis')}
        <button class="btn btn-p btn-sm" data-novo="1">${form ? 'Fechar' : '+ Nova ação'}</button>
      </div>
    </div></div>`;
  }

  function vazio() {
    return `<div style="font-size:13px;opacity:.75;line-height:1.7">
      Nenhuma ação registrada ainda${filtro === 'Todas' ? '' : ' em ' + esc(filtro).toLowerCase()}.
      O primeiro lançamento já começa a formar o histórico da empresa.
    </div>`;
  }

  function linhas(lista) {
    return `<div style="display:flex;flex-direction:column">
      ${lista.map(i => {
        const cancelado = i.status === 'cancelado';
        return `<div style="border-bottom:1px solid rgba(203,184,166,.18)">
          <div data-abrir="${esc(i.id)}" style="display:flex;gap:12px;align-items:center;padding:11px 2px;cursor:pointer;${cancelado ? 'opacity:.5' : ''}">
            <div style="font-size:12px;opacity:.7;white-space:nowrap;min-width:78px">${esc(dia(i.data))}</div>
            <div style="min-width:150px"><span class="ag-chip">${esc(i.tipo)}</span></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px">${esc(i.colaborador || 'Equipe')}
                <span style="font-weight:400;opacity:.6">por ${esc(i.responsavel || 'Direção')}</span></div>
              <div style="font-size:11px;opacity:.65;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${esc((i.contexto || i.conversa || '').slice(0, 110))}</div>
            </div>
            <div style="font-size:11px;white-space:nowrap;${cancelado ? '' : i.ciencia_em ? 'color:var(--verde)' : 'color:var(--amarelo)'}">
              ${cancelado ? 'Cancelado' : i.ciencia_em ? 'Ciência registrada' : 'Sem ciência'}</div>
            <div style="font-size:11px;opacity:.5">${aberto === i.id ? '▲' : '▼'}</div>
          </div>
          ${aberto === i.id ? detalhe(i) : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function detalhe(i) {
    const campo = (rot, txt, largo) => txt ? `<div style="${largo ? 'grid-column:1 / -1;' : ''}margin-bottom:12px">
      <div style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;opacity:.55;margin-bottom:4px">${rot}</div>
      <div style="font-size:13px;line-height:1.65">${esc(txt)}</div></div>` : '';
    return `<div style="background:rgba(201,168,76,.06);border-radius:8px;padding:16px;margin:0 0 12px">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
        <b style="font-size:13px">${esc(i.id)}</b>
        <span style="font-size:11px;opacity:.6">${esc(i.tipo)} registrado por ${esc(i.criado_por || 'AXIS')} em ${esc(hora(i.criado_em))}</span>
        <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          ${i.status === 'cancelado' ? '' : i.ciencia_em ? '' :
            `<button class="btn btn-s btn-sm" data-ciencia="${esc(i.id)}">Registrar ciência</button>`}
          ${i.status === 'cancelado' ? '' : `<button class="btn btn-s btn-sm" data-cancelar="${esc(i.id)}">Cancelar registro</button>`}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 22px">
        ${campo('Data da ação', dia(i.data))}
        ${campo('Responsável', i.responsavel)}
        ${campo('Colaborador', i.colaborador)}
        ${campo('Setor', i.setor)}
        ${campo('Contexto da cobrança', i.contexto, true)}
        ${campo('O que foi conversado', i.conversa, true)}
        ${campo('Combinados e prazo', i.combinados, true)}
        ${campo('Suporte oferecido', i.suporte)}
        ${campo('Anexos', i.anexos)}
        ${campo('Ciência do colaborador', i.ciencia_em ? 'Confirmada em ' + dia(i.ciencia_em) : 'Ainda não registrada')}
        ${i.status === 'cancelado' ? campo('Cancelamento', i.cancelado_motivo, true) : ''}
      </div>
      <div style="font-size:11px;opacity:.6;line-height:1.7;border-top:1px solid rgba(203,184,166,.25);padding-top:10px;margin-top:4px">
        <b>Trilha de auditoria.</b> Gravado em ${esc(hora(i.criado_em))}.
        ${(i.historico || []).length
          ? (i.historico || []).map(h => `<br>${esc(hora(h.em))}: ${esc(h.o_que)} (${esc(h.por)})`).join('')
          : ' Nenhuma alteração posterior.'}
        <br>NR-1, item 1.5: documentar as ações de gestão é parte do gerenciamento de riscos psicossociais.
      </div>
    </div>`;
  }

  function formulario() {
    const hoje = new Date().toISOString().slice(0, 10);
    const linha = (id, rot, ph, largo) => `<div style="${largo ? 'grid-column:1 / -1;' : ''}margin-bottom:12px">
      <label style="display:block;font-size:11px;opacity:.7;margin-bottom:5px">${rot}</label>
      ${largo
        ? `<textarea class="ag-fc" id="${id}" rows="3" placeholder="${ph}" style="width:100%;resize:vertical"></textarea>`
        : `<input class="ag-fc" id="${id}" placeholder="${ph}" style="width:100%">`}
    </div>`;
    return `<div class="card" style="margin-bottom:16px;border:1px solid rgba(201,168,76,.4)">
      <div class="ch"><div class="ag-ct">Nova ação de gestão</div></div>
      <div class="cb">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 22px">
          <div style="margin-bottom:12px">
            <label style="display:block;font-size:11px;opacity:.7;margin-bottom:5px">Data da ação</label>
            <input class="ag-fc" type="date" id="ag-data" value="${hoje}" style="width:100%">
          </div>
          <div style="margin-bottom:12px">
            <label style="display:block;font-size:11px;opacity:.7;margin-bottom:5px">Tipo</label>
            <select class="ag-fc" id="ag-tipo" style="width:100%">
              ${TIPOS.map(t => `<option value="${esc(t)}"${t === 'Feedback' ? ' selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          ${linha('ag-responsavel', 'Quem conduziu', 'Direção, ou o nome da liderança')}
          ${linha('ag-colaborador', 'Com quem', 'Nome do colaborador, código ou Equipe')}
          ${linha('ag-setor', 'Setor', 'Atendimento, produção, administrativo')}
          ${linha('ag-anexos', 'Anexos', 'Relatório de indicadores, ata assinada')}
          ${linha('ag-contexto', 'Contexto da cobrança', 'O motivo objetivo, com o número quando houver', true)}
          ${linha('ag-conversa', 'O que foi conversado', 'O que foi dito, onde e de que forma', true)}
          ${linha('ag-combinados', 'Combinados e prazo', 'O que ficou acertado e quando será medido de novo', true)}
          ${linha('ag-suporte', 'Suporte oferecido', 'Treinamento, mudança de escala, acompanhamento', true)}
        </div>
        <div id="ag-erro" style="display:none;font-size:12px;color:var(--vermelho);margin-bottom:10px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-p btn-sm" data-salvar="1">Gravar registro</button>
          <button class="btn btn-s btn-sm" data-novo="1">Cancelar</button>
        </div>
        <div style="font-size:11px;opacity:.6;line-height:1.7;margin-top:12px">
          Escreva o que aconteceu, não o que a pessoa é. Fato, número e combinado sustentam uma
          defesa; adjetivo sobre a pessoa enfraquece.
        </div>
      </div>
    </div>`;
  }

  // ── EVENTOS ───────────────────────────────────────────────────────────
  // Um único ouvinte no container: a tela é repintada inteira a cada ação,
  // e listener por botão sumiria junto com o HTML antigo.
  function ligar(alvo) {
    alvo.onclick = async ev => {
      const t = ev.target.closest('[data-filtro],[data-novo],[data-salvar],[data-abrir],[data-ciencia],[data-cancelar]');
      if (!t) return;

      if (t.dataset.filtro) { filtro = t.dataset.filtro; return pintar(); }
      if (t.dataset.novo)   { form = !form; return pintar(); }
      if (t.dataset.abrir)  { aberto = aberto === t.dataset.abrir ? '' : t.dataset.abrir; return pintar(); }

      if (t.dataset.salvar) {
        const erro = document.getElementById('ag-erro');
        const corpo = {
          acao:'criar', data: val('ag-data'), tipo: val('ag-tipo'),
          responsavel: val('ag-responsavel'), colaborador: val('ag-colaborador'),
          setor: val('ag-setor'), anexos: val('ag-anexos'), contexto: val('ag-contexto'),
          conversa: val('ag-conversa'), combinados: val('ag-combinados'), suporte: val('ag-suporte')
        };
        if (!corpo.conversa.trim()) {
          erro.style.display = 'block';
          erro.textContent = 'Descreva o que foi conversado. É esse campo que sustenta o registro.';
          return;
        }
        t.disabled = true; t.textContent = 'Gravando...';
        try {
          const j = await enviar(corpo);
          form = false; aberto = j.registro ? j.registro.id : '';
          pintar();
          if (global.showNotif) global.showNotif('Ação de gestão registrada.');
        } catch (e) {
          t.disabled = false; t.textContent = 'Gravar registro';
          erro.style.display = 'block'; erro.textContent = e.message;
        }
        return;
      }

      if (t.dataset.ciencia) {
        // A ciência costuma acontecer no mesmo dia da conversa, mas nem
        // sempre é lançada no sistema naquele dia. Por isso a data vem
        // sugerida e pode ser corrigida: a data que vale é a do fato.
        const reg = itens.find(i => i.id === t.dataset.ciencia) || {};
        const sugerida = dia(reg.data) || dia(new Date().toISOString());
        const resp = prompt('Em que data o colaborador tomou ciência?\n\nFormato dia/mês/ano.', sugerida);
        if (resp === null) return;
        const m = String(resp).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!m) return alert('Data inválida. Use o formato dia/mês/ano, como 20/05/2026.');
        t.disabled = true; t.textContent = 'Registrando...';
        try {
          await enviar({ acao:'ciencia', id: t.dataset.ciencia, ciencia_em: `${m[3]}-${m[2]}-${m[1]}T12:00:00` });
          pintar();
        } catch (e) { t.disabled = false; t.textContent = 'Registrar ciência'; alert(e.message); }
        return;
      }

      if (t.dataset.cancelar) {
        const motivo = prompt('Por que este registro está sendo cancelado?\n\nO registro não é apagado: fica marcado como cancelado, com o motivo e a data.');
        if (!motivo || !motivo.trim()) return;
        t.disabled = true;
        try { await enviar({ acao:'cancelar', id: t.dataset.cancelar, motivo: motivo.trim() }); pintar(); }
        catch (e) { t.disabled = false; alert(e.message); }
      }
    };
  }

  global.AXIS_GESTAO = { render, tipos: () => TIPOS.slice() };

})(window);
