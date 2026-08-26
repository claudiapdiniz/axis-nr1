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

  let cache = null;   // último dossiê carregado

  async function render(empId, empNome, alvoId) {
    const alvo = document.getElementById(alvoId || 'tab-content');
    if (!alvo) return;
    alvo.innerHTML = '<div style="padding:20px;font-size:13px;opacity:.7">Reunindo o histórico da empresa...</div>';
    try {
      const r = await fetch('/api/empresa/dossie?company_id=' + encodeURIComponent(empId || '') +
                            '&empresa=' + encodeURIComponent(empNome || ''));
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        alvo.innerHTML = '<div style="padding:20px;font-size:13px;color:#c62828">' +
          esc(j.error || j.erro || 'Não consegui montar o inventário') + ' (código ' + r.status + ').</div>';
        return;
      }
      cache = j;
      alvo.innerHTML = tela(j);
    } catch (e) {
      alvo.innerHTML = '<div style="padding:20px;font-size:13px;color:#c62828">Erro de conexão ao montar o inventário.</div>';
    }
  }

  function tela(j) {
    if (!j.total) {
      return `<div class="card"><div class="cb" style="font-size:13px;opacity:.75">
        Ainda não há registro de nenhum trabalho para <b>${esc(j.empresa.nome)}</b>.
        Convites, relatórios, avaliações e propostas aparecem aqui automaticamente.
      </div></div>`;
    }

    const abertos = j.blocos.filter(b => !b.sigilo);
    const sigilosos = j.blocos.filter(b => b.sigilo);

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

  function cartao(b) {
    return `<div class="card" style="margin-bottom:14px">
      <div class="ch"><div class="ct">${esc(b.titulo)} <span class="chip" style="margin-left:6px">${b.itens.length}</span></div></div>
      <div class="cb">
        <div style="display:flex;flex-direction:column">
          ${b.itens.map(i => `<div style="display:flex;gap:12px;align-items:baseline;padding:9px 2px;border-bottom:1px solid rgba(203,184,166,.18)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px">${esc(i.titulo)}</div>
              <div style="font-size:11px;opacity:.65;margin-top:2px">${esc(i.detalhe || '')}</div>
            </div>
            <div style="font-size:11px;opacity:.6;white-space:nowrap">${esc(dia(i.data))}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  global.AXIS_INVENTARIO = { render, ultimo: () => cache };

})(window);
