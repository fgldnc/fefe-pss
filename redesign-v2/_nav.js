/* Mockups: navegação, cabeçalho e botão de tema, repetidos em toda tela.
   Script CLÁSSICO de propósito — não ES module: o navegador bloqueia módulo
   carregado de file://, e a exigência é que os mockups abram sem servidor.
   O app real monta a navegação no index.html, como sempre. */
(function () {
  var TELAS = [
    ['01-importar.html', '1', 'Importar', ''],
    ['02-conferir.html', '2', 'Conferir', '7'],
    ['03-mes.html',      '3', 'Mês',      ''],
    ['04-adiante.html',  '4', 'Adiante',  ''],
    ['05-ajustes.html',  '',  'Ajustes',  ''],
  ];

  window.montarShell = function (titulo) {
    var aqui = location.pathname.split('/').pop();
    var nav = '<nav class="nav">'
      + '<div class="brand"><span class="brand-mark">◈</span><span class="brand-name">Radar</span></div>'
      + TELAS.map(function (t) {
          return '<a class="nav-item" href="' + t[0] + '"' + (t[0] === aqui ? ' aria-current="page"' : '') + '>'
            + '<span class="nav-num">' + (t[1] || '⚙') + '</span><span>' + t[2] + '</span>'
            + (t[3] ? '<span class="nav-badge">' + t[3] + '</span>' : '') + '</a>';
        }).join('')
      + '<div class="nav-foot"><span class="nav-avatar">F</span>'
      + '<span style="font-size:12.5px;color:var(--text-2)">Fernanda</span></div></nav>';

    var head = '<header class="head"><h1>' + titulo + '</h1>'
      + '<div class="month"><button class="btn btn-icon" aria-label="Mês anterior">‹</button>'
      + '<b>setembro / 26</b>'
      + '<button class="btn btn-icon" aria-label="Próximo mês">›</button></div>'
      + '<button class="btn btn-ghost btn-sm" id="tema">Tema claro</button></header>';

    document.getElementById('nav-slot').outerHTML = nav;
    document.getElementById('head-slot').outerHTML = head;

    document.getElementById('tema').addEventListener('click', function () {
      var claro = document.documentElement.getAttribute('data-theme') === 'light';
      document.documentElement.setAttribute('data-theme', claro ? 'dark' : 'light');
      this.textContent = claro ? 'Tema claro' : 'Tema escuro';
    });
  };
})();
