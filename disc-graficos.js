/* ═══════════════════════════════════════════════════════════════════════
   AXIS DISC — GRÁFICOS EM SVG
   Gera donut, barras e radar como SVG puro, a partir dos dados.

   POR QUE SVG E NÃO Chart.js:
   - não depende de biblioteca externa: o laudo abre sem internet
   - imprime com fidelidade; canvas às vezes sai em branco no PDF
   - o arquivo do laudo fica autossuficiente, bom para arquivar e enviar
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const r2 = v => Math.round(v * 100) / 100;

  // ponto na circunferência (ângulo em graus, 0 = topo, sentido horário)
  function ponto(cx, cy, raio, graus) {
    const rad = (graus - 90) * Math.PI / 180;
    return [r2(cx + raio * Math.cos(rad)), r2(cy + raio * Math.sin(rad))];
  }

  /**
   * DONUT de composição.
   * @param {Array} fatias [{valor, cor, rotulo}]
   */
  function donut(fatias, opts) {
    const o = Object.assign({ tam: 400, raio: 170, furo: 100, fundo: '#FBF7F1',
                              centroTitulo: '', centroValor: '' }, opts || {});
    const c = o.tam / 2;
    const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
    let ang = 0;
    const partes = fatias.map(f => {
      const varre = f.valor / total * 360;
      const fim = ang + varre;
      const grande = varre > 180 ? 1 : 0;
      const [x1, y1] = ponto(c, c, o.raio, ang);
      const [x2, y2] = ponto(c, c, o.raio, fim);
      const [x3, y3] = ponto(c, c, o.furo, fim);
      const [x4, y4] = ponto(c, c, o.furo, ang);
      // rótulo no meio da fatia
      const [lx, ly] = ponto(c, c, (o.raio + o.furo) / 2, ang + varre / 2);
      const d = `M${x1},${y1} A${o.raio},${o.raio} 0 ${grande} 1 ${x2},${y2} ` +
                `L${x3},${y3} A${o.furo},${o.furo} 0 ${grande} 0 ${x4},${y4} Z`;
      ang = fim;
      return { d, cor: f.cor, lx, ly, texto: f.rotulo, mostra: varre >= 22 };
    });

    return `<svg viewBox="0 0 ${o.tam} ${o.tam}" class="g-donut" role="img">
${partes.map(p => `  <path d="${p.d}" fill="${p.cor}" stroke="${o.fundo}" stroke-width="3"/>`).join('\n')}
${partes.filter(p => p.mostra).map(p =>
  `  <text x="${p.lx}" y="${p.ly}" text-anchor="middle" dominant-baseline="central"
        fill="#fff" font-family="Montserrat,sans-serif" font-weight="800" font-size="19">${esc(p.texto)}</text>`).join('\n')}
${o.centroTitulo ? `  <text x="${c}" y="${c - 16}" text-anchor="middle" fill="#9A9086"
        font-family="Inter,sans-serif" font-weight="700" font-size="13" letter-spacing="2">${esc(o.centroTitulo)}</text>` : ''}
${o.centroValor ? `  <text x="${c}" y="${c + 22}" text-anchor="middle" fill="#201C18"
        font-family="Montserrat,sans-serif" font-weight="900" font-size="46">${esc(o.centroValor)}</text>` : ''}
</svg>`;
  }

  /**
   * BARRAS agrupadas (natural × adaptado).
   * @param {Array} grupos [{rotulo, a, b, cor}]
   */
  function barras(grupos, opts) {
    const o = Object.assign({ larg: 620, alt: 300, max: 60, corA: '#C99A2E',
                              corB: '#4A3324', legendaA: 'Natural', legendaB: 'Exigido' }, opts || {});
    const padE = 42, padB = 52, padT = 14;
    const areaL = o.larg - padE - 12, areaA = o.alt - padB - padT;
    const passo = areaL / grupos.length;
    const larguraBarra = Math.min(28, passo / 3.2);

    const eixos = [0, 20, 40, 60].filter(v => v <= o.max).map(v => {
      const y = r2(padT + areaA - (v / o.max) * areaA);
      return `  <line x1="${padE}" y1="${y}" x2="${o.larg - 12}" y2="${y}" stroke="#E4DACB" stroke-width="1"/>
  <text x="${padE - 8}" y="${y + 4}" text-anchor="end" fill="#9A9086" font-family="Inter,sans-serif" font-size="11">${v}%</text>`;
    }).join('\n');

    const barrasHtml = grupos.map((g, i) => {
      const cx = padE + passo * i + passo / 2;
      const hA = r2((g.a / o.max) * areaA), hB = r2((g.b / o.max) * areaA);
      const xA = r2(cx - larguraBarra - 3), xB = r2(cx + 3);
      const yA = r2(padT + areaA - hA), yB = r2(padT + areaA - hB);
      return `  <rect x="${xA}" y="${yA}" width="${larguraBarra}" height="${hA}" rx="4" fill="${g.cor || o.corA}"/>
  <rect x="${xB}" y="${yB}" width="${larguraBarra}" height="${hB}" rx="4" fill="${o.corB}" opacity=".55"/>
  <text x="${r2(xA + larguraBarra / 2)}" y="${yA - 6}" text-anchor="middle" fill="#6B6259" font-family="Montserrat,sans-serif" font-weight="700" font-size="11">${Math.round(g.a)}</text>
  <text x="${r2(xB + larguraBarra / 2)}" y="${yB - 6}" text-anchor="middle" fill="#6B6259" font-family="Montserrat,sans-serif" font-weight="700" font-size="11">${Math.round(g.b)}</text>
  <text x="${r2(cx)}" y="${o.alt - padB + 22}" text-anchor="middle" fill="#201C18" font-family="Inter,sans-serif" font-weight="600" font-size="12">${esc(g.rotulo)}</text>`;
    }).join('\n');

    const legY = o.alt - 12;
    return `<svg viewBox="0 0 ${o.larg} ${o.alt}" class="g-barras" role="img">
${eixos}
${barrasHtml}
  <rect x="${padE}" y="${legY - 9}" width="11" height="11" rx="3" fill="${o.corA}"/>
  <text x="${padE + 17}" y="${legY}" fill="#6B6259" font-family="Inter,sans-serif" font-size="12">${esc(o.legendaA)}</text>
  <rect x="${padE + 110}" y="${legY - 9}" width="11" height="11" rx="3" fill="${o.corB}" opacity=".55"/>
  <text x="${padE + 127}" y="${legY}" fill="#6B6259" font-family="Inter,sans-serif" font-size="12">${esc(o.legendaB)}</text>
</svg>`;
  }

  /**
   * RADAR de N eixos, com duas séries.
   * @param {Array} eixos [{rotulo, a, b, cor}]  valores 0..100
   */
  function radar(eixos, opts) {
    const o = Object.assign({ tam: 760, raio: 250, corA: '#C99A2E', corB: '#4A3324',
                              legendaA: 'Como está', legendaB: 'Como deveria estar' }, opts || {});
    const c = o.tam / 2;
    const n = eixos.length;
    const passo = 360 / n;

    // anéis de referência
    const aneis = [20, 40, 60, 80, 100].map(v => {
      const rr = r2(o.raio * v / 100);
      const pts = Array.from({ length: n }, (_, i) => ponto(c, c, rr, i * passo).join(',')).join(' ');
      return `  <polygon points="${pts}" fill="none" stroke="#E4DACB" stroke-width="${v === 100 ? 1.5 : 1}"/>`;
    }).join('\n');

    // raios e rótulos
    const raios = eixos.map((e, i) => {
      const [x, y] = ponto(c, c, o.raio, i * passo);
      const [tx, ty] = ponto(c, c, o.raio + 30, i * passo);
      const ang = i * passo;
      const anchor = (ang > 8 && ang < 172) ? 'start' : (ang > 188 && ang < 352) ? 'end' : 'middle';
      return `  <line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="#E4DACB" stroke-width="1"/>
  <text x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="central"
        fill="${e.cor || '#6B6259'}" font-family="Inter,sans-serif" font-size="12.5" font-weight="600">${esc(e.rotulo)}</text>`;
    }).join('\n');

    const poli = (chave, cor, tracejado) => {
      const pts = eixos.map((e, i) => ponto(c, c, o.raio * (e[chave] || 0) / 100, i * passo).join(',')).join(' ');
      return `  <polygon points="${pts}" fill="${cor}" fill-opacity="${tracejado ? '.06' : '.20'}"
        stroke="${cor}" stroke-width="${tracejado ? 1.6 : 2.4}" ${tracejado ? 'stroke-dasharray="6 4"' : ''}/>`;
    };
    const pontos = eixos.map((e, i) => {
      const [x, y] = ponto(c, c, o.raio * (e.a || 0) / 100, i * passo);
      return `  <circle cx="${x}" cy="${y}" r="3.2" fill="${o.corA}"/>`;
    }).join('\n');

    return `<svg viewBox="-120 -20 ${o.tam + 240} ${o.tam + 70}" class="g-radar" role="img">
${aneis}
${raios}
${poli('b', o.corB, true)}
${poli('a', o.corA, false)}
${pontos}
  <rect x="${c - 190}" y="${o.tam + 18}" width="12" height="12" rx="3" fill="${o.corA}"/>
  <text x="${c - 172}" y="${o.tam + 28}" fill="#6B6259" font-family="Inter,sans-serif" font-size="14">${esc(o.legendaA)}</text>
  <rect x="${c + 20}" y="${o.tam + 18}" width="12" height="12" rx="3" fill="${o.corB}" opacity=".5"/>
  <text x="${c + 38}" y="${o.tam + 28}" fill="#6B6259" font-family="Inter,sans-serif" font-size="14">${esc(o.legendaB)}</text>
</svg>`;
  }

  global.DISC_GRAF = { donut, barras, radar, ponto };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.DISC_GRAF;

})(typeof window !== 'undefined' ? window : globalThis);
