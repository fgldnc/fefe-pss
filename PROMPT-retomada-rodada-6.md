# Prompt de retomada — redesign v2 do Radar, a partir da rodada 6

Cole este bloco inteiro numa sessão nova aberta em
`C:\Users\fefe\Downloads\github\fefe-pss`. Ele é autossuficiente.

---

## REGRA DESTA SEQUÊNCIA (a usuária pediu explicitamente)

**Uma rodada por sessão quando a rodada for pesada.** Se ao terminar a rodada
que você pegou a janela de contexto já estiver comprometida, **NÃO comece a
seguinte**: escreva um prompt de retomada como este, com esta mesma regra
dentro, e entregue o link para ela abrir uma sessão nova. Foi assim que a
rodada 5 terminou e esta sessão começou.

Ela confia no seu julgamento para as decisões de desenho — não pare para
perguntar coisa que dá para decidir com o que está escrito. **Pare e pergunte
só se alguma REGRA DE NEGÓCIO parecer que precisa mudar.**

---

## 0. Leia antes de escrever qualquer linha

Nesta ordem, sem pular:

1. **`CLAUDE.md`** — é o contrato. As seções que importam agora:
   "Vocabulário visual da revisão de importação", "Regras de interface que
   valem em toda tela (redesign v2)", "Roteamento por destino",
   "Decisões de negócio escondidas em números literais" (as partes de
   **Importação de fatura** e **Parsers de extrato**) e
   "Decisões da usuária que mudam o plano original".
2. **`redesign-v2/direcoes/hibrido.html`** — a fonte da verdade visual. Abre
   do disco. **Copiar dele é o certo; reinventar não é.**
3. **`PROMPT-implementar-v2.md`** — o plano das 8 rodadas. Parcialmente
   vencido: ver a seção 2 abaixo.
4. **`ARQUITETURA-v2.md`** e **`INVENTARIO-FUNCOES.md`** — a arquitetura
   escolhida (B, "o ciclo do mês") e as 64 capacidades com arquivo:linha.

O que está `[NÃO CONFIRMADO]` em `PESQUISA-UX.md` segue não confirmado.

---

## 1. O que já está feito

**Rodada 1 — fundação.** Tokens do híbrido em `css/style.css` e
`css/components.css`; Outfit no lugar de Nunito; tema escuro removido; "cada
tela cabe numa dobra" **revogada** — a página rola. Os nomes de token antigos
viraram apelidos dos novos, e é isso que deixou o `js/` intacto.

**Rodada 2 — navegação.** `TAB_MODULES` virou `DESTINOS` em `js/app.js`: um
destino é uma LISTA de seções. `APELIDOS` mantém os ids antigos válidos como
endereço e `ANCORAS` diz a que elemento rolar. Saíram: command palette,
onboarding, botão de tema, gaveta lateral do celular. Abaixo de 900px a barra
lateral vira barra fixa no rodapé.

**Rodada 3 — Mês.** `js/mes.js`: herói · distribuição · resultado do mês ·
miniatura do fluxo · tabela única com coluna `origem` + CSV · evolução de 6
meses. `gastos.js` e `receitas.js` viraram camada de formulário + gravação.
`dashboard.js` deixou de existir.

**Rodada 4 — Adiante.** `js/adiante.js`: ajustes do mês · 3 KPIs · curva
diária · tabela dos dias com movimento. `saldos.js` virou **só cálculo**.
`timeline.js` e `previsoes.js` morreram.

**Rodada extra — Cartão.** `js/cartao.js`: resumo · contratos em aberto ·
parcelas previstas · parcelas já pagas.

**Rodada 5 — Guardado (acabou de ser feita).** `js/guardado.js`, arquivo novo,
monta `#tab-guardado` inteiro com quatro blocos: **total do patrimônio +
barra de composição · metas · onde está guardado · aportes por mês**.
- `metas.js` e `patrimonio.js` **deixaram de desenhar tela**: viraram
  `initMetas(aoMudar)`/`openMetaModal`/`openAporteMetaModal`/`excluirMeta` e
  `initPatrimonio(aoMudar)`/`openAtivoModal`/`openAporteAtivoModal`/
  `excluirAtivo`/`valorDepreciado`/`TIPO_ATIVO`.
- A **rosca "Composição" morreu** (virou barra empilhada de 10px + legenda).
  O gráfico "Aportes por mês" mudou de arquivo e continua existindo.
- O **vínculo ativo→meta** agora se nomeia dos dois lados, em texto.
- `.btn-2` **foi adicionado ao CSS** — existia no `hibrido.html` e nunca tinha
  sido copiado, então os botões secundários de Mês, Adiante e Cartão estavam
  sem contorno. Conferir se isso mudou alguma tela para pior.
- `index.html`: `#tab-metas` e `#tab-patrimonio` viraram `#tab-guardado`
  (vazio de propósito).

**Estado da navegação hoje:** Importar · Mês · Cartão · Adiante · Guardado ·
⚙ Ajustes (a engrenagem sobe para a topbar abaixo de 900px).

**Conferência pendente da usuária:** Cartão e Guardado foram testados com
dados injetados no `state` pelo navegador, **não com os dados reais dela**.

---

## 2. O que a usuária mudou no meio do caminho

Estas decisões **vencem o `PROMPT-implementar-v2.md`**. Estão em `CLAUDE.md`,
seção "Decisões da usuária que mudam o plano original".

1. **Orçamento mora em Ajustes**, não em Mês. Aplicado na rodada 3.
2. **Importar leva fatura E extrato, com DUAS ABAS EXPLÍCITAS** para trocar
   entre os dois — **não** a drop zone única que adivinha o tipo do arquivo,
   que é o que o plano original pedia. **Vale para a rodada 6, a sua.**
3. **Cartão é destino próprio.** Feito.

---

## 3. O que falta: rodadas 6, 7 e 8

### 6 — Importar (esta é a sua; é a mais pesada das três)

Hoje as duas portas estão em lugares diferentes: **a fatura em PDF entra por
um botão dentro de Mês** (`btn-import-pdf` em `js/mes.js:443`, que chama
`initPdfImport` e abre `#modal-pdf`) e **o extrato entra pelo destino
Importar** (`js/extratos.js`, que abre `#modal-extrato`).

Vira **uma tela só com duas abas explícitas** — "Fatura de cartão" e "Extrato
bancário". Na tela ficam também: o histórico de lotes, a frase de privacidade
("roda no seu navegador") e o **offset de competência da fatura**
(`localStorage.fluxo_billing_offset`, hoje na 4ª sub-aba de Configurações;
decide em que mês uma fatura INTEIRA cai, então o lugar dele é aqui).

O botão de importar fatura **sai de Mês**.

**Nada de parsing muda.** `competenciaDaFatura`, `_tolerancia`,
`_acharParcela`, a reconciliação de parcela projetada, `dedupKey`,
`detectDuplicates`, `SECTION_HEADERS` e a ordem dele — tudo intacto. Os testes
em `test/pdf-import.test.mjs` e `test/base-parser.test.mjs` fixam isso e
**nenhum pode precisar mudar**.

**O vocabulário visual da revisão já existe e está fixado no `CLAUDE.md`**
(seção "Vocabulário visual da revisão de importação"): `.mark-inferido`,
`.field-inferido`/`.field-editado`, `.row-atencao`, `.import-summary-bar`,
`.btn-atencao`, `.modal-import`, e os helpers no fim de `js/utils.js`.
**Reusar; não inventar símbolo novo.** E: **nunca bloquear o salvamento.**

**Degradação limpa autorizada, se a rodada crescer demais:** tela "Importar"
com as duas abas, a drop zone e o histórico, **abrindo os modais que já
existem**. O número de cliques do ciclo não muda. Prefira a versão em tela,
mas entregue funcionando em vez de entregar pela metade.

**Armadilha registrada:** o cabeçalho da tabela de preview do extrato está
definido **em dois lugares** — no `index.html` e na variante montada por
`_showReview()` quando o lote tem receitas. Mexeu num, mexa no outro.

### 7 — Conferir

O destino que ainda não existe: `js/conferir.js`, derivado do `state`, sem
campo novo no Firestore. Três listas, corrigíveis na própria linha:
**sem categoria · parcela projetada de competência já vencida · possível
duplicata**. Zerou tudo, o item apaga e o contador some (silêncio é o sinal
de que está tudo certo).

**Decisão já tomada, para você não reabrir:** Conferir entra como **item fixo
da barra, sempre visível**, mesmo vazio — são 6 destinos na barra (Importar ·
Conferir · Mês · Cartão · Adiante · Guardado) com Ajustes na topbar no
celular. A 375px isso dá ~62px por alvo, acima do mínimo de toque.
Navegação previsível vale mais que 10px, e o estado vazio da tela já é bom.
É reversível se ela olhar e não gostar.

### 8 — Ajustes

Categorias · regras de classificação (regex) · orçamento (que já mora lá) ·
backup/restore · conta. **Somem**: `js/relatorios.js` inteiro (seis
relatórios fixos para uma pessoa; cada tabela já exporta o seu CSV), as
estatísticas de armazenamento, e o wipe de coleção **da interface** (a função
fica em `db.js`). São as três únicas capacidades que somem de verdade em toda
a sequência — **confirme com ela antes de apagar**, é a única pergunta
pendente do plano.

**Armadilha:** `configuracoes.js` **monta a seção inteira por JS** — a
`<section>` no `index.html` é vazia de propósito. Editar markup de
Configurações no HTML não tem efeito nenhum.

---

## 4. Como trabalhar

- **Uma rodada por vez, terminando com o app funcionando.**
- **Conferir, não supor.** Contraste se roda, largura se mede, rolagem
  horizontal se testa no navegador.
- **Comentário em português explicando o PORQUÊ, não o quê.**
- **Atualizar o `CLAUDE.md` ao fim da rodada.**
- **Se alguma regra de negócio parecer que precisa mudar, pare e pergunte.**

### Critérios de aceitação (toda rodada)

```bash
node redesign-v2/direcoes/contraste-hibrido.mjs   # "Tudo passa no mínimo exigido"
node --test test/*.test.mjs                        # 68/68, e nenhum teste pode precisar mudar
```

- Sem rolagem horizontal em 1420, 1120, 1000, 900 e 375px.
- Nenhum azul em `css/` nem em `js/`, em papel nenhum.
- Todo `innerHTML` com dado externo passa por `esc()`.
- Gráfico lê cor por `getComputedStyle`, nunca HEX literal.
- Coluna de valor com `tabular-nums` e centavos sempre visíveis.
- Larguras de coluna **no CSS**, nunca em `style=`.
- As telas renderizam sem erro no console.

### Quatro armadilhas já pagas, não caia de novo

1. **`overflow` em contêiner de tabela mata o `<thead>` sticky.** Nenhum
   overflow, `table-layout: fixed`, larguras no CSS, `overflow-wrap: break-word`.
2. **`esconde-sm` tem que ir no `<th>` E no `<td>`**, senão as colunas
   desalinham no celular.
3. **O `top` do `<thead>` sticky é `var(--topbar-h)`, não 0.**
4. **`.ir` é um quadrado de 28px para o glifo "↗".** Texto dentro dele quebra
   em três linhas. Botão de texto pequeno precisa de classe própria (foi o que
   aconteceu com `.guardado-toggle` na rodada 5).

### Como testar sem login

Não dá para logar com Google no preview. O caminho usado nas rodadas 3, 4, 5 e
no Cartão:

1. `preview_start` — há uma entrada por porta em `.claude/launch.json`
   (4321, 4322, 4323, 4324). Use uma livre e adicione outra se precisar.
2. No navegador: esconder `.login-screen`, mostrar `#app`, e injetar dados
   pelo próprio módulo — `const u = await import('/js/utils.js')` devolve a
   MESMA instância que o app usa, então mutar `u.state` e chamar
   `switchTab('importar')` re-renderiza com os dados de teste.
3. Para medir rolagem horizontal, **use `resize_window` de verdade**: encolher
   o `#app` por JS não faz o `<canvas>` do Chart.js refluir e dá falso
   positivo (aconteceu na rodada 5).
4. Se `computer:screenshot` devolver imagem congelada ou meia pintada, é o
   pane, não a página: confira por `get_page_text` e por medição no DOM.

**Isso NÃO substitui a conferência dela com os dados reais** — diga isso no
fim da rodada.
