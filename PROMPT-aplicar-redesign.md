# PROMPT — aplicar o redesign no app (sessão nova)

Cole o bloco abaixo numa sessão limpa do Claude Code, na raiz do repositório
`fefe-pss`. Ele é autossuficiente: não presuma que a sessão nova conhece o
projeto nem as decisões tomadas até aqui.

---

## Contexto

Você vai **aplicar no app** um redesign que já foi projetado e aprovado. O
projeto inteiro está em `/redesign`, em mockups estáticos que abrem por duplo
clique. Nenhum arquivo do app foi tocado até agora — `index.html`, `css/` e
`js/` estão como sempre estiveram.

**Leia, nesta ordem, antes de escrever qualquer linha:**

1. `CLAUDE.md` — restrições de arquitetura e as regras de negócio escondidas em
   números literais. Tudo ali continua valendo.
2. `ROTEIRO-REDESIGN.md` — estado do redesign entre sessões, o que já foi feito
   nas rodadas 1 a 4 e o que está marcado como "não mexer".
3. `redesign/index.html` — índice dos mockups, com as regras de leitura.
4. `redesign/_radar.css` e `redesign/_shell.js` — onde estão os tokens, os
   componentes e o acabamento dos gráficos. Os comentários explicam o porquê de
   cada decisão; preserve esse registro ao portar.

## O que foi aprovado

**Etapa 1 — paleta** (`redesign/01-paleta.html`). Variação **A, "Galo"**:
preto, branco e grafites, **sem nenhum acento cromático no chrome**. A ação
primária é o próprio contraste — botão preto no tema claro, branco no escuro.
Cor na tela passa a significar sempre alguma coisa: receita, gasto, inferido,
ou série categórica de gráfico. **Nada de azul em nenhum papel.** Contraste
WCAG conferido: nenhum par abaixo do mínimo nos dois temas.

**Etapa 2 — navegação** (`redesign/02-navegacao.html`). As 11 abas reagrupadas
por horizonte de tempo, em quatro grupos: **Este mês** (Visão do mês, Gastos,
Receitas, Extratos) · **O que vem** (Fluxo de Caixa, Orçamento) · **Longo
prazo** (Metas, Patrimônio) · **Registro** (Timeline, Relatórios,
Configurações). Nenhuma aba some ou funde. `Dashboard` passa a chamar-se
**Visão do mês**. Mais 5 atalhos novos entre abas, listados no mockup.

**Etapa 3 — telas** (`redesign/03-*.html`). Uma por aba, com os estados vazio,
carregando e com dados, e os dois modais de importação.

## As cinco regras que não podem se perder na implementação

1. **A página nunca rola.** Toda tela cabe numa dobra só. Quando a lista é
   maior que o espaço, quem rola é a *região* — a tabela dentro do card, a
   grade de cards — nunca a página. A faixa de números do topo fica sempre
   visível. No celular a página rola, porque não há dobra que caiba tudo.
   No CSS isso é o bloco "CABER NUMA TELA SÓ" de `redesign/_radar.css`.

2. **Fonte Nunito, e número não usa monoespaçada.** A JetBrains Mono fazia o
   app parecer terminal. A coluna de valores continua alinhada por
   `font-variant-numeric: tabular-nums lining-nums`, não por fonte de largura
   fixa. Monoespaçada sobra só para referência de código.

3. **Toda tela abre com uma frase de o que fazer e como**, com a ação em
   negrito, e cada bloco principal tem uma linha de apoio abaixo do título.
   O texto exato está em cada mockup (`intro:` na chamada de `mount`, e
   `<p class="card-sub">` nos blocos). Copie os textos, não reescreva.

4. **Âmbar significa uma coisa só:** o app deduziu isto e você precisa
   conferir. Linha classificada por regra **não recebe marca nenhuma** —
   silêncio é o sinal de que está tudo bem. O vocabulário
   `.mark-inferido` / `.field-inferido` / `.field-editado` / `.row-atencao`
   já existe em `css/components.css` e está documentado no `CLAUDE.md`.

5. **Gráfico é canvas e não resolve `var(--…)`.** Toda cor passada ao Chart.js
   vem resolvida por `getComputedStyle` antes, e o gráfico é refeito quando o
   tema muda. Já houve regressão no app por passar `var(--accent-primary)`
   direto. As funções `chartBase()`, `linha()` e `fade()` de
   `redesign/_shell.js` concentram o acabamento — porte-as.

## Decisões que mudam código existente — confirme antes de aplicar

- **`.field-editado` deixa de ser azul.** Passa a ser neutro de alto contraste
  (preto no claro, branco no escuro), borda de 2px. "Editado" vira ênfase, não
  cor, e assim não disputa com o âmbar do inferido nem com a ação primária.
- **`.fx-hoje` deixa de ser ciano** no Fluxo de Caixa, porque ciano é azul.
  Vira ênfase neutra: fundo elevado mais borda forte à esquerda da linha.
- **`--gold` desaparece.** Hoje é idêntico a `--warning` (`#fbbf24`), e a
  rodada 4 já proibiu ouro no Fluxo de Caixa. Dois nomes para a mesma cor é
  como se perde a disciplina do âmbar.

## O que está marcado como NOVO e ainda não foi aprovado para implementar

Abra o painel **Conferência** de cada mockup (botão na barra cinza do topo).
As linhas marcadas `NOVO` são proposta, não estado atual do app. Duas em
especial **não devem entrar sem a Fefe aprovar**:

- **Patrimônio** ganhou dois gráficos (composição e evolução) que a aba não tem
  hoje. O `ROTEIRO-REDESIGN.md` marca essa aba como "não mexer".
- **Timeline** ganhou um card "Contratos em aberto", que agrupa parcelas do
  mesmo contrato. Ataca um problema real registrado no roteiro, mas é função
  nova.

Existe **uma** função sem desenho, marcada em vermelho no mockup do dashboard:
o estado de erro de `_guard()`. Decidir a mensagem antes de implementar.

## Restrições de arquitetura — valem integralmente

- Sem framework, sem bundler, sem build step. A UI é `innerHTML` +
  `addEventListener`, módulos importados por caminho relativo fixo.
- Chart.js 4.4.0 e PDF.js vêm de CDN e **já estão na CSP de `vercel.json:24`**.
  Trocar de CDN ou de biblioteca exige editar a CSP junto.
- `js/utils.js` não importa nenhum outro módulo do projeto.
- `js/app.js` só carrega os módulos de aba por `import()` dinâmico.
- `esc()` obrigatório em toda interpolação de `innerHTML`.
- Firestore só via `window._FB`, através dos helpers de `js/db.js`.
- Dependência nova precisa justificar por que não dá para resolver com o que já
  existe.

> Atenção: `redesign/_shell.js` é **script clássico**, não ES module — os
> mockups precisam abrir por duplo clique e o Chrome bloqueia `import` sobre
> `file://`. O app real é ES module e continua sendo. Não copie essa parte.

## Como trabalhar

Aplique **em rodadas pequenas, uma aba por vez**, na ordem abaixo, e pare para
a Fefe conferir no app entre cada uma:

1. **Tokens e tipografia** (`css/style.css`, `css/components.css`) — a paleta A
   e a Nunito, sem mexer em estrutura de tela. É a rodada que muda tudo
   visualmente com o menor risco de quebrar comportamento.
2. **Sidebar e rótulos** (`index.html`, `js/app.js`) — os quatro grupos novos e
   o rename de Dashboard para Visão do mês.
3. **A regra de caber na dobra** — o shell (`.app` / `.screen`) e as tabelas
   que passam a rolar por dentro.
4. **Visão do mês** — é a tela mais reestruturada; vale sozinha.
5. **Fluxo de Caixa, Gastos, Extratos** — as três que mexem no vocabulário de
   importação.
6. O resto das abas.
7. Os 5 atalhos novos entre abas.

Regra do roteiro que continua valendo: **bug antes de design, sempre.** Se
aparecer um bug no caminho, corrija primeiro e trate o design como rodada
separada — design aplicado sobre dado errado espalha o erro.

Ao terminar cada rodada, atualize o `ROTEIRO-REDESIGN.md` com o que entrou.
