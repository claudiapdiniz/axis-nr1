/* ═══════════════════════════════════════════════════════════════
   AXIS Insight NR-1 · módulo /carrosseis
   Desenha as quatro variantes de slide. Todo valor vem do :root do
   slide.css: este arquivo não declara nenhuma cor, fonte, tamanho,
   entrelinha ou espacejamento próprio.
   ═══════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var raiz = null;
  function tokens() {
    if (!raiz) raiz = getComputedStyle(document.documentElement);
    return raiz;
  }
  function tk(nome) { return tokens().getPropertyValue(nome).trim(); }
  function px(nome) { return parseFloat(tk(nome)); }
  function num(nome) { return parseFloat(tk(nome)); }

  // "0.18em" no tamanho informado vira pixels para o canvas.
  function ls(nome, tamanho) {
    var v = tk(nome);
    if (v.indexOf('em') > -1) return parseFloat(v) * tamanho;
    return parseFloat(v) || 0;
  }

  function pct(nome, base) { return parseFloat(tk(nome)) / 100 * base; }

  function fonte(familia, peso, tamanho) {
    return peso + ' ' + tamanho + 'px ' + tk(familia);
  }

  // ── Quebra de linha ──────────────────────────────────────────
  // Nunca reduz o corpo. Se estourar, quem avisa é a tarja.
  function linhas(ctx, texto, largura) {
    var saida = [], paragrafos = String(texto || '').split('\n');
    for (var p = 0; p < paragrafos.length; p++) {
      var palavras = paragrafos[p].split(' '), atual = '';
      for (var i = 0; i < palavras.length; i++) {
        var teste = atual ? atual + ' ' + palavras[i] : palavras[i];
        if (ctx.measureText(teste).width > largura && atual) { saida.push(atual); atual = palavras[i]; }
        else atual = teste;
      }
      if (atual) saida.push(atual);
    }
    return saida;
  }

  function escreve(ctx, lista, tamanho, alturaLinha, cor, x, y, espacejamento) {
    ctx.fillStyle = cor;
    ctx.textAlign = 'left';
    ctx.letterSpacing = (espacejamento || 0) + 'px';
    for (var i = 0; i < lista.length; i++) { y += tamanho * alturaLinha; ctx.fillText(lista[i], x, y); }
    ctx.letterSpacing = '0px';
    return y;
  }

  // ── Peças da estrutura ───────────────────────────────────────
  function fundo(ctx, L, A) {
    ctx.fillStyle = tk('--verde-fundo');
    ctx.fillRect(0, 0, L, A);
  }

  function moldura(ctx, L, A) {
    var r = px('--recuo-moldura');
    ctx.strokeStyle = tk('--linha-moldura');
    ctx.lineWidth = 1;
    ctx.strokeRect(r + 0.5, r + 0.5, L - r * 2 - 1, A - r * 2 - 1);
  }

  // Numeral fica atrás do conteúdo, por isso é desenhado antes dele.
  function numeral(ctx, L, n) {
    var t = px('--t-numeral'), lh = num('--lh-numeral');
    // Reproduz a caixa de linha do CSS: o topo da caixa é o ponto de
    // ancoragem, e a linha de base cai dentro dela.
    var entrelinha = (t * lh - t * 1.10) / 2;
    var base = px('--numeral-topo') + entrelinha + t * 0.85;
    ctx.font = fonte('--fonte-titulo', tk('--peso-numeral'), t);
    ctx.fillStyle = tk('--verde-numeral');
    ctx.textAlign = 'right';
    ctx.fillText(String(n).padStart(2, '0'), L - px('--numeral-direita'), base);
    ctx.textAlign = 'left';
  }

  // Rótulo superior mais a régua. Devolve onde o corpo pode começar.
  function cabecalho(ctx, texto, x) {
    var t = px('--t-eyebrow');
    ctx.font = fonte('--fonte-texto', tk('--peso-eyebrow'), t);
    ctx.fillStyle = tk('--dourado');
    ctx.textAlign = 'left';
    ctx.letterSpacing = ls('--ls-eyebrow', t) + 'px';
    var base = px('--recuo-moldura') + px('--recuo-conteudo') + t;
    ctx.fillText(String(texto || '').toUpperCase(), x, base);
    ctx.letterSpacing = '0px';

    var yRegua = base + px('--regua-respiro');
    ctx.fillStyle = tk('--dourado');
    ctx.fillRect(x, yRegua, px('--regua-largura'), px('--regua-altura'));
    return yRegua + px('--regua-respiro');
  }

  function rodape(ctx, L, A, assinatura, n, total) {
    var x = px('--recuo-moldura') + px('--recuo-conteudo');
    var yLinha = A - px('--altura-rodape');

    ctx.fillStyle = tk('--linha-rodape');
    ctx.fillRect(x, yLinha, L - x * 2, 1);

    var t1 = px('--t-rodape-1'), t2 = px('--t-rodape-2');
    var base1 = yLinha + px('--rodape-respiro') + t1;

    ctx.textAlign = 'left';
    ctx.font = fonte('--fonte-texto', tk('--peso-rodape-1'), t1);
    ctx.fillStyle = tk('--rodape-neutro');
    ctx.letterSpacing = ls('--ls-rodape', t1) + 'px';
    ctx.fillText('PROGRAMA DE PREVENÇÃO DE RISCOS PSICOSSOCIAIS · NR-1', x, base1);

    ctx.font = fonte('--fonte-texto', tk('--peso-rodape-2'), t2);
    ctx.fillStyle = tk('--dourado');
    ctx.letterSpacing = ls('--ls-rodape', t2) + 'px';
    ctx.fillText(String(assinatura || '').toUpperCase(), x, base1 + px('--rodape-entrelinhas'));
    ctx.letterSpacing = '0px';

    ctx.textAlign = 'right';
    ctx.font = fonte('--fonte-texto', tk('--peso-rodape-1'), t1);
    ctx.fillStyle = tk('--rodape-neutro');
    ctx.fillText(n + '/' + total, L - x, base1);
    ctx.textAlign = 'left';
  }

  // Foto à direita, dissolvida no fundo pela mesma máscara do CSS.
  function foto(ctx, L, A, imagem) {
    if (!imagem) return;
    var largura = pct('--foto-largura', L);
    var x0 = L - largura;

    var fora = document.createElement('canvas');
    fora.width = Math.round(largura); fora.height = Math.round(A);
    var fc = fora.getContext('2d');

    var r = Math.max(largura / imagem.width, A / imagem.height);
    var lw = imagem.width * r, lh = imagem.height * r;
    fc.drawImage(imagem, (largura - lw) / 2, (A - lh) / 2, lw, lh);

    // linear-gradient(to left, #000 42%, transparent 100%): opaco da
    // direita até 42%, dissolvendo até a borda esquerda.
    var fim = parseFloat(tk('--foto-mascara-fim')) / 100;
    var g = fc.createLinearGradient(0, 0, largura, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1 - fim, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    fc.globalCompositeOperation = 'destination-in';
    fc.fillStyle = g;
    fc.fillRect(0, 0, largura, A);

    ctx.drawImage(fora, x0, 0);
  }

  // ── Corpo do slide ───────────────────────────────────────────
  function corpo(ctx, L, A, dados, opcoes) {
    var x = px('--recuo-moldura') + px('--recuo-conteudo');
    var topo = opcoes.topo;
    var baseArea = A - px('--altura-rodape');

    var tTitulo = px(opcoes.tokenTitulo);
    var lhTitulo = num('--lh-titulo');
    var lsTitulo = ls('--ls-titulo', tTitulo);
    // Com foto, o texto vai até onde a máscara ainda deixa o fundo limpo:
    // a imagem só fica opaca depois do trecho dissolvido.
    var fimMascara = parseFloat(tk('--foto-mascara-fim')) / 100;
    var limiteDaFoto = L - pct('--foto-largura', L) * (1 - fimMascara) - px('--recuo-conteudo');
    var largTitulo = opcoes.temFoto ? limiteDaFoto - x : pct('--largura-titulo', L);

    ctx.font = fonte('--fonte-titulo', tk('--peso-titulo'), tTitulo);
    ctx.letterSpacing = lsTitulo + 'px';
    var lTitulo = linhas(ctx, dados.titulo, largTitulo);
    ctx.letterSpacing = '0px';
    var altTitulo = lTitulo.length * tTitulo * lhTitulo;

    var lApoio = null, altApoio = 0, tApoio = px('--t-apoio');
    if (!opcoes.semApoio && dados.texto) {
      var largApoio = opcoes.temFoto ? limiteDaFoto - x : pct('--largura-apoio', L);
      ctx.font = fonte('--fonte-texto', tk('--peso-apoio'), tApoio);
      lApoio = linhas(ctx, dados.texto, largApoio);
      altApoio = lApoio.length * tApoio * num('--lh-apoio');
    }

    var tContato = px('--t-contato');
    var altContato = (opcoes.temContato && dados.contato) ? px('--contato-respiro') + tContato : 0;

    var altBloco = altTitulo + (lApoio ? px('--respiro-titulo-apoio') + altApoio : 0) + altContato;
    var y = topo + (baseArea - topo - altBloco) / 2;

    ctx.font = fonte('--fonte-titulo', tk('--peso-titulo'), tTitulo);
    y = escreve(ctx, lTitulo, tTitulo, lhTitulo, tk('--creme-titulo'), x, y, lsTitulo);

    if (lApoio) {
      y += px('--respiro-titulo-apoio');
      ctx.font = fonte('--fonte-texto', tk('--peso-apoio'), tApoio);
      y = escreve(ctx, lApoio, tApoio, num('--lh-apoio'), tk('--texto-apoio'), x, y, 0);
    }

    if (altContato) {
      y += px('--contato-respiro') + tContato;
      ctx.font = fonte('--fonte-texto', tk('--peso-contato'), tContato);
      ctx.fillStyle = tk('--creme-titulo');
      ctx.textAlign = 'left';
      ctx.fillText(dados.contato, x, y);
    }
  }

  // ── Variantes ────────────────────────────────────────────────
  var VARIANTES = {
    capa:     { tokenTitulo: '--t-titulo-capa',      numeral: false, foto: true,  apoio: true,  contato: false },
    conteudo: { tokenTitulo: '--t-titulo',           numeral: true,  foto: false, apoio: true,  contato: false },
    destaque: { tokenTitulo: '--t-titulo-destaque',  numeral: false, foto: false, apoio: false, contato: false },
    cta:      { tokenTitulo: '--t-titulo',           numeral: false, foto: true,  apoio: true,  contato: true }
  };

  function desenhar(canvas, dados, n, total, contexto) {
    var L = px('--canvas-largura'), A = px('--canvas-altura');
    var escala = (contexto && contexto.escala) || 2;

    canvas.width = L * escala;
    canvas.height = A * escala;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.textBaseline = 'alphabetic';

    var v = VARIANTES[dados.tipo] || VARIANTES.conteudo;
    var imagem = v.foto ? (contexto && contexto.foto) : null;

    fundo(ctx, L, A);
    if (v.numeral) numeral(ctx, L, n);
    if (imagem) foto(ctx, L, A, imagem);
    moldura(ctx, L, A);

    var assinatura = (contexto && contexto.assinatura) || '';
    var rotulo = (dados.tipo === 'capa' || dados.tipo === 'cta') ? assinatura : (dados.rotulo || 'NR-1');
    var topo = cabecalho(ctx, rotulo, px('--recuo-moldura') + px('--recuo-conteudo'));

    corpo(ctx, L, A, dados, {
      topo: topo,
      tokenTitulo: v.tokenTitulo,
      semApoio: !v.apoio,
      temContato: v.contato,
      temFoto: !!imagem
    });

    rodape(ctx, L, A, assinatura, n, total);
    return canvas;
  }

  // ── Estouro de texto ─────────────────────────────────────────
  // Não corta e não reescreve: devolve o aviso para a tela mostrar.
  function conferir(dados, n) {
    var limite = dados.tipo === 'destaque' ? num('--limite-titulo-destaque')
               : (dados.tipo === 'capa' || dados.tipo === 'cta') ? num('--limite-titulo-capa')
               : num('--limite-titulo');
    var avisos = [];
    var titulo = String(dados.titulo || '');
    if (titulo.length > limite) {
      avisos.push({
        slide: n,
        campo: 'título',
        excesso: titulo.length - limite,
        detalhe: 'Título com ' + titulo.length + ' caracteres, o limite da variante ' +
                 (dados.tipo || 'conteudo') + ' é ' + limite + '.'
      });
    }
    var apoio = String(dados.texto || '');
    if (apoio.length > num('--limite-apoio')) {
      avisos.push({
        slide: n,
        campo: 'apoio',
        excesso: apoio.length - num('--limite-apoio'),
        detalhe: 'Texto de apoio com ' + apoio.length + ' caracteres, o limite é ' + num('--limite-apoio') + '.'
      });
    }
    return avisos;
  }

  // As fontes precisam estar prontas antes de pintar, senão o PNG sai
  // com a fonte de fallback do sistema.
  function fontesProntas() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var t = tokens();
    var titulo = t.getPropertyValue('--fonte-titulo').trim();
    var texto = t.getPropertyValue('--fonte-texto').trim();
    return Promise.all([
      document.fonts.load('600 ' + px('--t-titulo') + 'px ' + titulo),
      document.fonts.load('700 ' + px('--t-numeral') + 'px ' + titulo),
      document.fonts.load('400 ' + px('--t-apoio') + 'px ' + texto),
      document.fonts.load('500 ' + px('--t-contato') + 'px ' + texto),
      document.fonts.load('600 ' + px('--t-eyebrow') + 'px ' + texto),
      document.fonts.load('700 ' + px('--t-rodape-2') + 'px ' + texto)
    ]).then(function () { return document.fonts.ready; }).catch(function () {});
  }

  global.AxisSlide = {
    desenhar: desenhar,
    conferir: conferir,
    fontesProntas: fontesProntas,
    variantes: VARIANTES
  };

})(window);
