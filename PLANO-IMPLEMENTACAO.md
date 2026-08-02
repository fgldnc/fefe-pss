# Plano de implementação — fefe-pss

Prompts prontos para colar no Claude Code, na ordem. Cada bloco é autocontido: pode ser colado numa sessão nova sem contexto anterior.

**Regras gerais antes de começar**

- Rode tudo em uma branch: `git checkout -b auditoria-2026-08`.
- Faça um backup pelo próprio app (Configurações → Exportar) antes das etapas 6, 7 e 8.
- Commit ao fim de cada etapa. Se uma etapa quebrar algo, `git revert` só dela.
- As etapas 0 a 5 não alteram dado existente. Da 6 em diante, alteram como o dado é lido.

| Etapa | O que | Risco de dado | Tempo |
|---|---|---|---|
| 0 | `CLAUDE.md` do projeto | nenhum | 5 min |
| 1 | Publicar regras do Firestore | nenhum | 15 min |
| 2 | Calibrar o parser com a fatura real | nenhum | 30 min |
| 3 | Trocar `pdf-import.js` | nenhum (só importações novas) | 20 min |
| 4 | Listeners + recarga do Firestore | nenhum | 30 min |
| 5 | CSP, cache, `.gitignore` | nenhum | 30 min |
| 6 | Dedupe de extrato + `_parseGenerico` | **médio** | 45 min |
| 7 | Competência unificada | **alto** | 1 h |
| 8 | `saveBudgets` em batch | baixo | 20 min |
| 9 | Acessibilidade | nenhum | 45 min |
| 10 | Testes dos parsers | nenhum | 2 h |

---

## Etapa 0 — Memória do projeto

Faz o Claude Code parar de redescobrir a arquitetura a cada sessão. Vale os 5 minutos.

```
Leia todos os arquivos de js/, css/, index.html, vercel.json e RELATORIO-AUDITORIA.md deste projeto e crie um CLAUDE.md na raiz.

O CLAUDE.md deve conter, de forma enxuta:
- O que é o app: controle financeiro pessoal, JavaScript puro com ES modules, sem build step, sem npm install, hospedado na Vercel, Firebase Auth (Google) + Firestore.
- Restrições de arquitetura que qualquer alteração precisa respeitar: nenhum framework, nenhum bundler, nenhuma dependência nova sem justificar por que não dá pra resolver com o que já existe. PDF.js e Chart.js vêm de CDN e já estão refletidos na CSP do vercel.json.
- Mapa de uma linha por arquivo de js/.
- Convenções observadas no código: state global exportado de utils.js; esc() obrigatório em toda interpolação de innerHTML; toast() para feedback; módulos de aba exportam uma função render*; app.js carrega abas com import() dinâmico para evitar dependência circular.
- Onde ficam as decisões de negócio hoje escondidas em números literais, apontando arquivo e linha.

Não invente informação que não esteja no código. Se algo não der pra determinar lendo os arquivos, escreva "VERIFICAR" em vez de supor.
```

---

## Etapa 1 — Regras do Firestore

É o único item com risco real de exposição de dados. Faça primeiro.

O arquivo `firestore.rules` já está na raiz. A publicação é manual (o Claude Code não tem acesso ao console do Firebase):

1. Abra o Console do Firebase → projeto `fefe-df577` → Firestore Database → Regras.
2. Cole o conteúdo de `firestore.rules`, publique.
3. Teste: faça login no app e confirme que dashboard, gastos e extratos carregam. Se algo quebrar, o erro no console diz qual coleção foi negada.

Depois, para limpar o que ficou pendente:

```
No index.html, o objeto firebaseConfig tem a propriedade databaseURL apontando para o Realtime Database (https://fefe-df577-default-rtdb.firebaseio.com). Verifique lendo TODOS os arquivos de js/ se o Realtime Database é usado em algum lugar do app — procure por getDatabase, ref(, onValue, set( do RTDB.

Se não for usado em lugar nenhum, remova a linha databaseURL do firebaseConfig e me diga que removeu.
Se for usado em algum lugar, NÃO remova e me mostre onde.

Não mexa em nenhuma outra propriedade do firebaseConfig — a apiKey do Firebase é um identificador público de projeto e deve continuar onde está.
```

---

## Etapa 2 — Calibrar o parser de coluna com a sua fatura

Sem isso, os limiares de `pdf-layout.js` são um chute educado. Faça o dump antes de trocar o arquivo.

**Não precisa de console.** Existe uma página de diagnóstico pronta em `ferramentas/dump-fatura.html`. Ela lê a fatura só no seu navegador — nada é enviado para servidor e nada entra no Firestore.

### 2.1 — Antes de tudo: subir a correção da CSP

O erro vermelho que apareceu no seu console (`worker-src ... blob:`) é um bug de verdade, não do seu comando. O `vercel.json` não autorizava o PDF.js a criar o worker dele, então o navegador cai num "fake worker" que processa tudo na thread principal — lento, e capaz de travar a aba numa fatura grande. Já corrigi o `vercel.json`.

1. Faça commit e push da branch. A Vercel publica sozinha.
2. Espere o deploy terminar (painel da Vercel, bolinha verde).

### 2.2 — Abrir a página de diagnóstico

Abra no navegador, trocando pela URL do seu deploy:

```
https://fefe-pss.vercel.app/ferramentas/dump-fatura.html
```

Precisa ser pela URL da Vercel. Abrir o arquivo com duplo clique na pasta não funciona: o navegador bloqueia módulos JavaScript em arquivo local.

### 2.3 — Rodar

1. Clique na área tracejada e escolha o PDF da fatura.
2. A página processa sozinha e já abre na página 2 (onde ficam os lançamentos no Itaú).
3. Leia a faixa colorida no meio da tela:
   - **verde** — as colunas foram separadas certo. Pode ir para o passo 4.
   - **vermelha** — ainda tem linha misturando as duas colunas.
   - **amarela** — só uma coluna encontrada.
4. Confira nas duas caixas pretas: a **Coluna 1** deve ter os lançamentos (data, estabelecimento, valor) e a **Coluna 2** deve ter "próximas faturas" e "limites de crédito". Se estiver invertido ou embaralhado, é caso de ajuste.
5. Clique em **Baixar dump para o Claude Code**. O arquivo `dump-fatura-pagina2.json` vai para a sua pasta de Downloads.
6. Mova esse arquivo para a raiz do projeto (`C:\Users\fefe\Downloads\github\fefe-pss\`) e renomeie para `tmp-dump-pagina2.json`.

Esse arquivo tem nome de estabelecimento e valor reais. O `.gitignore` já ignora `*.json`, então ele não vai para o commit — mas confirme com `git status` antes de commitar.

**Se a faixa vier verde**, pule direto para a etapa 2.5. Os limiares acertaram e não há o que calibrar.

**Se vier vermelha ou amarela**, use o prompt abaixo.

### 2.4 — Calibrar (só se a faixa não veio verde)

```
Leia js/parsers/pdf-layout.js e o arquivo tmp-dump-pagina2.json na raiz. O JSON é o dump real de page.getTextContent() da página 2 de uma fatura de cartão do Itaú, com as colunas x, y, w (largura do item), pageWidth e str.

Tarefa:
1. Escreva um script Node temporário (scripts/tmp-calibrar.mjs) que importe detectColumnBands e linesOfBand de js/parsers/pdf-layout.js, reconstrua objetos no formato que essas funções esperam a partir do dump (transform[4]=x, transform[5]=y, width=w) e imprima: as faixas de coluna detectadas, e as 30 primeiras linhas reconstruídas de cada faixa.
2. Rode o script e me mostre a saída.
3. Avalie: as faixas separam corretamente a tabela "Lançamentos: compras e saques" da coluna direita? Alguma linha ainda tem conteúdo das duas colunas fundido?
4. Se estiver errado, ajuste APENAS as constantes MIN_GAP_RATIO, EDGE_MARGIN_RATIO, BUCKET_PX, MIN_ITEMS_PER_COL ou Y_TOL_PX em js/parsers/pdf-layout.js até separar corretamente, e me explique qual valor mudou e por quê. Não mude a lógica do algoritmo sem me avisar antes.
5. Liste os cabeçalhos de seção que aparecem literalmente no dump, com a grafia exata. Compare com os regex de SECTION_HEADERS em js/pdf-import.fixed.js e me diga quais não casam.

Restrições:
- Não copie valor, estabelecimento ou número de cartão do dump para nenhum arquivo que vá pro commit. Se precisar de exemplo, use placeholder.
- Não instale nada. Use só Node nativo.
- scripts/tmp-calibrar.mjs é temporário; adicione-o ao .gitignore.
```

Depois de rodar esse prompt, volte à página `ferramentas/dump-fatura.html`, recarregue (Ctrl+Shift+R) e reprocesse a fatura. Repita até a faixa ficar verde.

### 2.5 — Conferir os cabeçalhos de seção

Rode este prompt mesmo que a faixa tenha vindo verde. Separar as colunas é metade do problema; a outra metade é reconhecer os títulos das seções.

```
Em js/pdf-import.fixed.js, ajuste os regex de SECTION_HEADERS para casarem com a grafia exata dos cabeçalhos que você encontrou no dump da fatura. Mantenha os regex tolerantes a acento e a variação de espaço, no mesmo estilo dos existentes.

Para cada regex que você alterar, mostre: o regex antigo, o novo, e a linha exata do dump que ele precisa casar (com o texto do estabelecimento substituído por placeholder).

Não altere o campo mode de nenhum cabeçalho existente sem me explicar por quê.
```

---

## Etapa 3 — Ativar o parser corrigido

```
Contexto: js/pdf-import.fixed.js é a versão corrigida de js/pdf-import.js e já foi calibrada contra uma fatura real. Ela expõe a mesma função pública initPdfImport(onDone) e depende de js/parsers/pdf-layout.js e de parseMoney de js/parsers/base-parser.js.

Tarefa:
1. Confirme, lendo os dois arquivos, que initPdfImport é a única exportação usada por js/gastos.js.
2. Renomeie js/pdf-import.js para js/pdf-import.legacy.js (mantenha no repo por enquanto) e js/pdf-import.fixed.js para js/pdf-import.js.
3. Verifique com grep que nenhum arquivo importa 'pdf-import.fixed.js' ou 'pdf-import.legacy.js'.
4. Rode uma checagem de sintaxe de todos os arquivos alterados com: node --input-type=module --check < arquivo.js
5. Me dê o diff resumido do que mudou.

Não altere a lógica de nenhum dos dois arquivos nesta etapa. É só a troca.
```

Teste manual antes do commit: importe a fatura de novo com o app em modo preview e confira, na tabela, que **não** aparecem duas linhas do mesmo estabelecimento com parcelas 01/06 e 02/06. Se aparecerem, volte à etapa 2.

Depois de uma importação bem-sucedida, apague `js/pdf-import.legacy.js`.

---

## Etapa 4 — Listeners e recarga do Firestore

```
Duas correções independentes, ambas sem alterar dado.

CORREÇÃO A — js/extratos.js, função initExtratoModal (por volta da linha 151).
Ela é chamada toda vez que o modal de extrato abre e usa cloneNode/replaceChild para limpar listeners. Isso funciona mas é frágil: perde o estado do elemento e depende de o clone preservar tudo. Na mesma função, a linha ~226 já usa o padrão correto (flag window.__extratoCheckAllBound).
Refatore initExtratoModal para: registrar TODOS os listeners uma única vez, protegidos por uma flag de módulo (let _eventsBound = false, no topo do arquivo), usando delegação de evento no container quando o elemento interno for recriado; e deixar a função só resetando o estado local (selectedBank, selectedFormat, parsedItems) e a UI a cada abertura.
Não use cloneNode/replaceChild em lugar nenhum do arquivo depois da refatoração.

CORREÇÃO B — js/app.js, função refreshCurrentTab (linha ~63).
Ela chama loadAllData() (que lê as 7 coleções inteiras do Firestore) e é acionada pelos botões de mês anterior/próximo e pelo month picker. Trocar de mês não muda dado no servidor: todas as telas filtram state por competenceMonth em memória.
Separe em duas funções: rerenderCurrentTab() que só chama switchTab, e reloadAndRerender() que chama loadAllData() antes. Troque as chamadas dos três handlers de navegação de mês para rerenderCurrentTab(). Mantenha reloadAndRerender() disponível e verifique, com grep, se algum outro ponto do código precisa dela.

Para as duas: rode node --input-type=module --check nos arquivos alterados e me mostre o diff. Não mude nenhuma outra função.
```

---

## Etapa 5 — CSP, cache e `.gitignore`

```
Três ajustes de configuração e deploy. Faça na ordem, porque o item 3 depende dos itens 1 e 2.

1. index.html tem um bloco <script type="module"> inline (linhas ~14-46) que inicializa o Firebase e monta window._FB. Mova o conteúdo desse bloco para um arquivo novo js/firebase-init.js e substitua o bloco por <script type="module" src="js/firebase-init.js"></script>, mantendo a posição no <head>. Confirme que js/firebase-init.js roda ANTES de js/app.js (que está no fim do body) e que window._FB continua sendo montado a tempo — js/auth.js tem uma função waitForFirebase com timeout de 5s que depende disso.

2. Procure em index.html e em todos os js/ por handlers inline (onclick=, onchange=, oninput=). Substitua cada um por addEventListener ou delegação de evento. Sei de pelo menos um: js/extratos.js linha ~55, num botão dentro de um template de empty-state — nesse caso, troque por um id e um querySelector com addEventListener logo depois do innerHTML.

3. Só depois de 1 e 2 estarem feitos: remova 'unsafe-inline' do script-src da CSP em vercel.json. MANTENHA 'unsafe-inline' no style-src — o app usa atributo style= em dezenas de lugares e remover isso é outro projeto.

4. Ainda no vercel.json, acrescente ao array headers regras de Cache-Control com "no-cache, must-revalidate" para /index.html, /js/(.*) e /css/(.*). Motivo: os ES modules são importados por caminho fixo sem hash de versão, então um js/ cacheado com index.html novo produz estado inconsistente. Não use no-store.

5. No .gitignore, a regra genérica *.json com exceção !package.json ignora silenciosamente qualquer JSON de configuração futuro. Substitua por regras específicas de backup: financas-backup-*.json e *-backup-*.json. Depois rode git status e confirme que nenhum arquivo novo indesejado apareceu como não rastreado.

Me mostre o diff de cada arquivo. Não altere nenhum outro header do vercel.json.
```

Depois do deploy, abra o console do browser em produção e confirme que não há erro de CSP bloqueando script.

---

## Etapa 6 — Dedupe de extrato e parser genérico

Daqui em diante, faça backup pelo app antes.

```
Duas correções nos parsers de extrato. Ambas mudam quais linhas entram e quais são marcadas como duplicata, então NÃO altere nada além do descrito.

CORREÇÃO A — js/parsers/base-parser.js, dedupKey e detectDuplicates (linhas ~71-89).
Problemas: (i) Math.abs faz uma entrada e uma saída de mesmo valor, data e descrição colidirem como duplicata, o que é um cenário real de transferência entre contas próprias; (ii) a comparação de valor é exata, então um centavo de diferença de arredondamento passa como transação nova.
Correção: incluir o campo type na chave e arredondar o valor num bucket de 5 centavos (Math.round(Math.abs(amount) * 20) / 20). Atualize detectDuplicates para passar t.type e item.type. Mantenha a assinatura de dedupKey retrocompatível com o parâmetro type opcional, e verifique com grep se algum outro arquivo chama dedupKey.

CORREÇÃO B — regex genéricos sem âncora.
Em js/pdf-import.js a função _parseGenerico (se ela ainda existir depois da etapa 3) e em js/parsers/pdf-statement-parser.js a função _genericParser (linha ~117) usam regex de data+texto+valor sem ^ e $. Elas casam qualquer par "data ... número" no meio de blocos que não são lançamentos (limites de crédito, resumo, código de barras).
Ancore os dois regex no início e no fim da linha e exija estrutura mínima: descrição entre 3 e 60 caracteres e valor com pelo menos 4 caracteres. Mantenha o comportamento de detecção de C/D.

Depois das duas: escreva um teste rápido com node --test (arquivo test/base-parser.test.mjs) cobrindo dedupKey com entrada e saída de mesmo valor, dedupKey com diferença de 1 centavo, e o regex ancorado rejeitando uma linha de "limite de crédito". Use valores e nomes de estabelecimento fictícios — nunca dado real de fatura. Rode os testes e me mostre a saída.
```

---

## Etapa 7 — Competência unificada

A mais arriscada: muda os totais históricos do dashboard. Backup obrigatório, e confira um mês fechado antes e depois.

```
Contexto: hoje existem três critérios diferentes para responder "este lançamento é deste mês?".
- js/db.js, allExpensesOfMonth (linha ~150): gasto de cartão usa competenceMonth; gasto de extrato usa date.slice(0,7).
- js/db.js, incomesOfMonth (linha ~194): aceita month, ou competenceMonth, ou date.slice(0,7).
- js/utils.js, _expensesFallback (linha ~126): repete a mistura.
Efeito: uma compra de 28/07 com competência agosto aparece em agosto na aba Gastos e em julho se tiver vindo pelo extrato. Dashboard e relatórios não batem entre si.

Tarefa, em duas partes. Faça a parte 1, me mostre o resultado, e só depois faça a parte 2.

PARTE 1 — diagnóstico, sem alterar código.
Escreva um script Node temporário que leia um arquivo de backup JSON exportado pelo app (eu vou colocar em tmp-backup.json na raiz) e me diga, para os últimos 6 meses: quantos lançamentos mudariam de mês se o critério passasse a ser "competenceMonth se existir, senão month, senão date.slice(0,7)", e qual o delta em reais no total de cada mês. Não escreva nada no Firestore. Adicione o script e o tmp-backup.json ao .gitignore.

PARTE 2 — só depois de eu aprovar os números.
Crie em js/utils.js duas funções exportadas:
  export function competenceOf(tx) — retorna tx.competenceMonth || tx.month || (tx.date || '').slice(0, 7)
  export function isOfMonth(tx, month) — retorna competenceOf(tx) === month
Substitua os filtros de mês em allExpensesOfMonth, incomesOfMonth, _expensesFallback, txOfMonth e em qualquer outro ponto que faça comparação de mês diretamente, por isOfMonth. Use grep para achar todos: procure por competenceMonth ===, .slice(0, 7) === e i.month ===.
NÃO altere nenhum dado no Firestore. A mudança é só de leitura.
Me mostre o diff completo e a lista de todos os pontos que você trocou.
```

---

## Etapa 8 — `saveBudgets` em batch

```
js/db.js, função saveBudgets (linha ~222). Hoje ela lê a coleção budgets inteira, deleta os docs do mês um a um em série, e insere os novos um a um. Salvar 12 categorias custa 1 leitura de coleção + 24 operações seriais, sem atomicidade — falha no meio deixa o mês com orçamento parcial.

Reescreva usando writeBatch (já exposto em window._FB) e IDs determinísticos no formato `${month}__${categoryId}`, de modo que o set() faça upsert e o delete prévio só seja necessário para categorias removidas. Todo o commit deve ser atômico.

Requisitos:
- Mantenha a assinatura saveBudgets(month, budgetMap) e a atualização de state.budgets[month] ao final.
- Trate o caso de mais de 450 operações dividindo em lotes, como wipeCollection já faz no mesmo arquivo.
- Lance erro claro se getUid() retornar null.
- Documentos antigos do mês com ID auto-gerado (formato legado) precisam continuar sendo apagados — não presuma que todos os docs existentes já usam o ID determinístico.

Me mostre o diff. Não altere nenhuma outra função de db.js.
```

---

## Etapa 9 — Acessibilidade

```
Cinco correções de acessibilidade, todas de baixo risco. Faça todas e me mostre um diff por arquivo.

1. Botões que só têm símbolo (✎, ✕, 🗑) têm title mas não aria-label. Adicione aria-label descritivo, incluindo o nome do item quando disponível e escapado com esc(). Ocorrências conhecidas: js/gastos.js linhas ~89-90, js/configuracoes.js linhas ~166-167, js/extratos.js linha ~74. Procure outras com grep por btn-icon-only e modal-close.

2. Em js/extratos.js, na tabela de revisão da importação (função _showReview, linhas ~464-474), os inputs e selects inline não têm rótulo acessível. Adicione aria-label em cada um (Descrição, Tipo, Categoria, Valor, e "Importar transação N" no checkbox), no mesmo padrão que js/pdf-import.js já usa na tabela de preview da fatura.

3. Nenhum modal do index.html tem semântica de diálogo. Adicione role="dialog" e aria-modal="true" em cada div.modal-overlay, e aria-labelledby apontando para o id do <h3> do modal-header (crie os ids se não existirem).

4. Em js/app.js, dentro do DOMContentLoaded, adicione um handler global de teclado que feche todos os .modal-overlay:not(.hidden) quando a tecla Escape for pressionada. Cuidado para não conflitar com o handler de Escape do command palette que já existe no mesmo arquivo — o palette deve continuar tendo prioridade quando estiver aberto.

5. No index.html, adicione scope="col" em todos os <th> de cabeçalho de tabela.

Não mude nenhuma classe de CSS nem o layout visual.
```

---

## Etapa 10 — Testes dos parsers

Última porque é a que menos dói adiar, e a que mais economiza tempo depois.

```
O projeto não tem nenhum teste. Crie uma suíte usando APENAS node --test nativo (sem npm install, sem framework), cobrindo as funções puras dos parsers.

Estrutura: test/*.test.mjs, importando diretamente dos módulos de js/.

Cobertura mínima:
- js/parsers/base-parser.js → parseMoney: formato BR com milhar, formato BR sem milhar, valor sem centavos (1.234 deve dar 1234, não 1.234), negativo com sinal, negativo entre parênteses, string vazia, null, valor com prefixo R$.
- js/parsers/base-parser.js → parseDate: DD/MM/AAAA, DD/MM/AA, AAAAMMDD, AAAA-MM-DD, formato americano MM/DD ambíguo, entrada inválida.
- js/parsers/base-parser.js → dedupKey e detectDuplicates: entrada vs saída de mesmo valor, diferença de 1 centavo.
- js/parsers/base-parser.js → autoClassify: uma regra de usuário com regex inválido não pode quebrar a classificação; regra de usuário tem prioridade sobre a padrão.
- js/parsers/pdf-layout.js → detectColumnBands: página de uma coluna devolve uma faixa; página com duas colunas separadas por uma vala larga devolve duas faixas; itens que formam uma faixa com menos de MIN_ITEMS_PER_COL não geram coluna.
- js/pdf-import.js → _tolerancia (exporte-a se ainda for privada): 1 parcela dá o piso, 6 parcelas dá 0.06, 200 parcelas fica no teto de 1.00.

Restrições:
- Nunca use valor, estabelecimento ou número de cartão de fatura real. Use placeholders como "ESTABELECIMENTO A" e valores redondos inventados.
- Para detectColumnBands, construa os itens de teste programaticamente com coordenadas sintéticas. Não use dump de fatura real.
- Se precisar exportar uma função hoje privada para testá-la, exporte, mas não mude o comportamento dela.
- Adicione ao README.md uma linha explicando como rodar: node --test test/
```

---

## Depois de tudo

```
Leia o git log desta branch e o RELATORIO-AUDITORIA.md. Atualize o CHANGELOG-review.md com uma entrada nova descrevendo o que foi corrigido nesta rodada, em formato ação + resultado, uma linha por correção, agrupadas por tipo (bug, segurança, performance, acessibilidade).

Depois, atualize o RELATORIO-AUDITORIA.md marcando cada achado como RESOLVIDO, PARCIAL ou PENDENTE, com uma linha justificando. Não apague nenhum achado.

Seja preciso sobre o que foi de fato verificado em uso real versus o que só passou em teste. Não afirme ganho de performance que não foi medido.
```
