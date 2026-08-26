/* ═══════════════════════════════════════════════════════════════════════
   AXIS — INVENTÁRIO DA EMPRESA

   Tudo que a AXIS já fez para uma empresa, reunido em uma página: o que
   foi entregue, o que foi medido, quem respondeu o quê e quando. Serve
   para a consultora chegar na reunião sabendo o histórico inteiro, e é a
   base do que será publicado no portal do cliente.

   Os módulos guardam a empresa de dois jeitos (id cadastrado e nome
   digitado), então quem faz o casamento é o servidor, em /api/empresa/dossie.
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const dia = s => {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d) ? String(s) : d.toLocaleDateString('pt-BR');
  };

  let cache = null;       // último dossiê carregado
  let publicados = {};    // chave tipo|ref -> item publicado no portal
  let ctx = { empId:'', empNome:'', alvoId:'tab-content' };

  const chavePub = (tipo, ref) => tipo + '|' + (ref == null ? '' : ref);

  async function render(empId, empNome, alvoId) {
    ctx = { empId: empId || '', empNome: empNome || '', alvoId: alvoId || 'tab-content' };
    const alvo = document.getElementById(ctx.alvoId);
    if (!alvo) return;
    alvo.innerHTML = '<div style="padding:20px;font-size:13px;opacity:.7">Reunindo o histórico da empresa...</div>';
    try {
      const [r, rp] = await Promise.all([
        fetch('/api/empresa/dossie?company_id=' + encodeURIComponent(ctx.empId) +
              '&empresa=' + encodeURIComponent(ctx.empNome)),
        fetch('/api/empresa/publicados?empresa=' + encodeURIComponent(ctx.empNome))
      ]);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        alvo.innerHTML = '<div style="padding:20px;font-size:13px;color:#c62828">' +
          esc(j.error || j.erro || 'Não consegui montar o inventário') + ' (código ' + r.status + ').</div>';
        return;
      }
      publicados = {};
      try {
        const jp = await rp.json();
        if (jp && jp.ok) (jp.itens || []).forEach(i => { publicados[chavePub(i.tipo, i.ref_id)] = i; });
      } catch (e) {}
      cache = j;
      alvo.innerHTML = tela(j);
      ligar(alvo);
    } catch (e) {
      alvo.innerHTML = '<div style="padding:20px;font-size:13px;color:#c62828">Erro de conexão ao montar o inventário.</div>';
    }
  }

  // ── PUBLICAR NO PORTAL ────────────────────────────────────────────────
  // Só o que a consultora ligar aqui aparece para o cliente. Relato seguro,
  // escuta e casos não têm interruptor: são sigilosos e ficam de fora.
  function ligar(alvo) {
    alvo.onchange = async ev => {
      const t = ev.target.closest('[data-pub]');
      if (!t) return;
      const tipo = t.dataset.pub, ref = t.dataset.ref || '', ligar = t.checked;
      const linha = t.closest('.inv-item');
      const aviso = linha ? linha.querySelector('.inv-aviso') : null;
      const diz = (txt, cor) => { if (aviso) { aviso.textContent = txt || ''; aviso.style.color = cor || 'var(--cinza)'; } };
      t.disabled = true; diz(ligar ? 'Publicando...' : 'Removendo...');
      try {
        const r = await fetch('/api/empresa/publicar', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ empresa: ctx.empNome, company_id: ctx.empId, tipo, ref_id: ref,
                                 titulo: t.dataset.titulo || '', detalhe: t.dataset.detalhe || '',
                                 modulo: t.dataset.modulo || 'executivo', publicar: ligar })
        });
        const j = await r.json().catch(() => ({}));
        t.disabled = false;
        if (!r.ok || !j.ok) { t.checked = !ligar; return diz(j.error || 'Não consegui publicar.', 'var(--vermelho)'); }
        if (ligar) publicados[chavePub(tipo, ref)] = { tipo, ref_id: ref };
        else delete publicados[chavePub(tipo, ref)];
        diz(ligar ? 'No portal da empresa' : '', 'var(--verde)');
      } catch (e) { t.disabled = false; t.checked = !ligar; diz('Erro de conexão.', 'var(--vermelho)'); }
    };
  }

  function tela(j) {
    if (!j.total) {
      return `<div class="card"><div class="cb" style="font-size:13px;opacity:.75">
        Ainda não há registro de nenhum trabalho para <b>${esc(j.empresa.nome)}</b>.
        Convites, relatórios, avaliações e propostas aparecem aqui automaticamente.
      </div></div>`;
    }

    // Ordem alfabética é regra da plataforma. Vale para os blocos; dentro de
    // cada um, os itens seguem por data, porque ali o que importa é o quando.
    const alfa = (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity:'base' });
    const abertos = j.blocos.filter(b => !b.sigilo).sort(alfa);
    const sigilosos = j.blocos.filter(b => b.sigilo).sort(alfa);

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="cb" style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">
          <div>
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;opacity:.55">Inventário de</div>
            <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:18px">${esc(j.empresa.nome)}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:22px;flex-wrap:wrap">
            ${j.blocos.map(b => `<div style="text-align:center">
              <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:20px">${b.itens.length}</div>
              <div style="font-size:10px;letter-spacing:.6px;text-transform:uppercase;opacity:.55">${esc(b.titulo)}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>

      ${abertos.map(cartao).join('')}

      ${sigilosos.length ? `
        <div class="card" style="margin-top:20px;border:1px solid rgba(198,40,40,.35)">
          <div class="cb" style="font-size:12px;line-height:1.6">
            <b>Registros com sigilo.</b> O que vem abaixo foi dito por pessoas que receberam
            promessa de anonimato. Fica aqui para a sua condução do caso e não vai para o portal
            da empresa com conteúdo: lá entra apenas o número, a categoria e o prazo.
          </div>
        </div>
        ${sigilosos.map(cartao).join('')}` : ''}

      ${j.avisos && j.avisos.length ? `<div class="card" style="margin-top:16px"><div class="cb" style="font-size:11px;opacity:.6">
        Não consegui ler: ${j.avisos.map(esc).join(' · ')}</div></div>` : ''}
    `;
  }

  // Blocos cujos itens podem ir para o portal do cliente, e com que tipo.
  const PUBLICAVEL = { relatorios: 'relatorio' };

  function cartao(b) {
    const tipoPub = PUBLICAVEL[b.chave];
    const equipe = b.chave === 'disc';
    return `<div class="card" style="margin-bottom:14px">
      <div class="ch"><div class="ct">${esc(b.titulo)} <span class="chip" style="margin-left:6px">${b.itens.length}</span></div></div>
      <div class="cb">
        ${equipe ? cartaoEquipe() : ''}
        <div style="display:flex;flex-direction:column">
          ${b.itens.map(i => {
            const pub = tipoPub && publicados[chavePub(tipoPub, i.id)];
            return `<div class="inv-item" style="display:flex;gap:12px;align-items:center;padding:9px 2px;border-bottom:1px solid rgba(203,184,166,.18)">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px">${esc(i.titulo)}</div>
                <div style="font-size:11px;opacity:.65;margin-top:2px">${esc(i.detalhe || '')}</div>
                <div class="inv-aviso" style="font-size:11px;margin-top:2px;color:var(--verde)">${pub ? 'No portal da empresa' : ''}</div>
              </div>
              <div style="font-size:11px;opacity:.6;white-space:nowrap">${esc(dia(i.data))}</div>
              ${tipoPub && i.publicavel ? `<label style="display:flex;gap:6px;align-items:center;font-size:11px;white-space:nowrap;cursor:pointer">
                <input type="checkbox" data-pub="${tipoPub}" data-ref="${esc(i.id)}" data-titulo="${esc(i.titulo)}"
                       data-detalhe="${esc(i.detalhe || '')}" ${pub ? 'checked' : ''}> no portal</label>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
  }

  // O relatório de equipe não é um item da lista: é gerado a partir de todas
  // as avaliações finalizadas da empresa. Por isso tem interruptor próprio.
  function cartaoEquipe() {
    const pub = publicados[chavePub('disc-equipe', 'executivo')];
    return `<div class="inv-item" style="display:flex;gap:12px;align-items:center;padding:10px 12px;margin-bottom:10px;background:rgba(201,168,76,.07);border-radius:8px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">Relatório de equipe</div>
        <div style="font-size:11px;opacity:.65;margin-top:2px">Monta o mapa do time com todas as avaliações finalizadas desta empresa.</div>
        <div class="inv-aviso" style="font-size:11px;margin-top:2px;color:var(--verde)">${pub ? 'No portal da empresa' : ''}</div>
      </div>
      <label style="display:flex;gap:6px;align-items:center;font-size:11px;white-space:nowrap;cursor:pointer">
        <input type="checkbox" data-pub="disc-equipe" data-ref="executivo" data-modulo="executivo" ${pub ? 'checked' : ''}> no portal</label>
    </div>`;
  }

  global.AXIS_INVENTARIO = { render, ultimo: () => cache };

})(window);
