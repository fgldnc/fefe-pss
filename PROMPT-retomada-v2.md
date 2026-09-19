# Prompt de retomada — redesign v2 do Radar

> **Antes de escrever qualquer linha de código: leia a seção 5 e me dê o
> resumo que ela pede.** Eu quero saber o que as rodadas que faltam vão fazer
> antes de você começar a próxima.

---

## 0. Leia antes de escrever qualquer linha

Nesta ordem, e sem pular:

1. **`CLAUDE.md`** — é o contrato. As seções que importam agora são
   "Regras de interface que valem em toda tela (redesign v2)",
   "Roteamento por destino", "A tela Mês", "Vocabulário visual de Adiante",
   "A tela Cartão", "Decisões de negócio escondidas em números literais" e
   "Decisões da usuária que mudam o plano original".
2. **`redesign-v2/direcoes/hibrido.html`** — a fonte da verdade visual. Abre
   direto do disco. **Copiar dele é o certo; reinventar não é.**
3. **`PROMPT-implementar-v2.md`** — o plano das 8 rodadas e os critérios de
   aceitação. Está parcialmente vencido: ver a seção 2 abaixo.
4. **`ARQUITETURA-v2.md`** e **`INVENTARIO-FUNCOES.md`** — a arquitetura
   escolhida (B, "o ciclo do mês") e as 64 capacidades com arquivo:linha.

O que está `[NÃO CONFIRMADO]` em `PESQUISA-UX.md` segue não confirmado.

---

## 1. O que já está feito

**Rodada 1 — fundação.** Tokens do híbrido em `css/style.css` e
`css/components.css`; Outfit no lugar de Nunito; tema escuro removido; a regra
"cada tela cabe numa dobra" **revogada** — a página rola. Os nomes de token
antigos viraram apelidos dos novos, e é isso que deixou o `js/` intacto.

**Rodada 2 — navegação.** `TAB_MODULES` (11 abas) virou `DESTINOS` em
`js/app.js`: um destino é uma LISTA de seções. `APELIDOS` mantém os ids antigos
válidos como endereço e `ANCORAS` diz a que elemento rolar dentro do destino.
Saíram: command palette, onboarding, botão de tema, gaveta lateral do celular.
Abaixo de 900px a barra lateral vira barra fixa no rodapé.

**Rodada 3 — Mês.** `js/mes.js`: herói · distribuição · resultado do mês ·
miniatura do fluxo · tabela única com coluna `origem` + CSV · evolução de 6
meses. `gastos.js` e `receitas.js` viraram camada de formulário + gravação.
`dashboard.js` deixou de existir.

**Rodada 4 — Adiante.** `js/adiante.js`: ajustes do mês · 3 KPIs · curva diária
· tabela dos dias com movimento. `saldos.js` virou **só cálculo** (as quatro
funções puras que `test/saldos.test.mjs` fixa). `timeline.js` e `previsoes.js`
morreram. O dia de vencimento saiu de Configurações.

**Rodada extra — CARTÃO (feita, pedida pela usuária depois da rodada 4).**
`js/cartao.js`, destino novo: **resumo · contratos em aberto · parcelas
previstas · parcelas já pagas**. `_contratos()` e `_parcelas()` saíram de
`js/adiante.js` inteiras; "parcelas já pagas" é o bloco novo — antes essa
informação não existia em tela nenhuma. `.adiante-tabela-rolagem` virou
`.tabela-folha` (é de duas telas agora), e no celular **Ajustes saiu da barra
de baixo e subiu para a topbar** (`.nav-topo`), porque com Cartão são 5
destinos na barra.

**Estado da navegação hoje:** Importar · Mês · Cartão · Adiante · Guardado ·
⚙ Ajustes. Conferir ainda não está na barra (entra na rodada 7, com o módulo).

**Conferência pendente:** o Cartão foi testado com dados injetados no `state`
pelo navegador, não com os dados reais da usuária — ela ainda precisa olhar.

---

## 2. O que a usuária mudou no meio do caminho

Estas decisões **vencem o `PROMPT-implementar-v2.md`**. Estão registradas em
`CLAUDE.md`, seção "Decisões da usuária que mudam o plano original".

1. **Orçamento mora em Ajustes**, não em Mês. Aplicado na rodada 3.
2. **Importar leva fatura E extrato, com duas abas explícitas** para trocar
   entre os dois — não a drop zone única que adivinha o tipo do arquivo, que é
   o que o plano pedia. Vale para a rodada 6.
3. **Cartão é destino próprio.** Feito.

---

## 3. O que falta: rodadas 5 a 8

Nesta ordem, **uma por vez**:

- **5 — Guardado.** Hoje o destino empilha duas telas antigas (`metas.js` e
  `patrimonio.js`), cada uma com o markup dela no `index.html`. Vira uma tela
  só, no vocabulário v2. Regra que não muda: **o app não guarda histórico de
  valor de ativo** — o segundo gráfico é "Aportes por mês", não "patrimônio mês
  a mês"; desenhar a curva do passado seria inventar número.
- **6 — Importar.** Fatura em PDF (`pdf-import.js`, hoje entra por um botão de
  Mês) e extrato (`extratos.js`) no mesmo destino, com **duas abas explícitas**.
  O vocabulário visual da revisão de importação já existe e está fixado no
  `CLAUDE.md`: reusar, não inventar símbolo novo.
- **7 — Conferir.** O destino que ainda não existe: `js/conferir.js`. É ele que
  põe o sexto item na barra de navegação.
- **8 — Ajustes.** Categorias, regras, backup/restore, preferências, conta e o
  orçamento, que já mora lá. Lembrar: **`configuracoes.js` monta a seção
  inteira** — markup de Configurações no `index.html` não tem efeito nenhum.

---

## 4. Como trabalhar (a usuária foi explícita)

- **Uma rodada por vez, terminando com o app funcionando.** Não começar a
  seguinte sem ela ver a anterior.
- **Conferir, não supor.** Contraste se roda, largura se mede, rolagem
  horizontal se testa no navegador. Foi assim que apareceram, nas rodadas
  anteriores: a topbar que não grudava, o `<thead>` declarado preso e que não
  estava, as larguras de coluna em `style=` que a media query não conseguia
  encolher.
- **Comentário em português explicando o PORQUÊ, não o quê.**
- **Atualizar o `CLAUDE.md` ao fim de cada rodada.**
- **Se alguma regra de negócio parecer que precisa mudar, pare e pergunte.**

### Critérios de aceitação (toda rodada)

```bash
node redesign-v2/direcoes/contraste-hibrido.mjs   # "Tudo passa no mínimo exigido"
node --test test/*.test.mjs                        # 68/68, e nenhum teste pode precisar mudar
```

- Sem rolagem horizontal em 1420, 1120, 1000, 900 e 375px
  (`document.documentElement.scrollWidth <= innerWidth`).
- Nenhum azul em `css/` nem em `js/`, em papel nenhum.
- Todo `innerHTML` com dado externo passa por `esc()`.
- Gráfico lê cor por `getComputedStyle`, nunca HEX literal.
- Coluna de valor com `tabular-nums` e centavos sempre visíveis.
- Larguras de coluna **no CSS**, nunca em `style=`.
- As telas renderizam sem erro no console.

### Três armadilhas já pagas, não caia de novo

1. **`overflow` em contêiner de tabela mata o `<thead>` sticky.** Nenhum
   overflow, `table-layout: fixed`, larguras no CSS, `overflow-wrap: break-word`.
2. **`esconde-sm` tem que ir no `<th>` E no `<td>`**, senão as colunas
   desalinham no celular.
3. **O `top` do `<thead>` sticky é `var(--topbar-h)`, não 0.**

### Como testar sem login

Não dá para logar com Google no preview. O caminho usado nas rodadas 3, 4 e no
Cartão: subir o servidor (`preview_start`; há uma entrada por porta em
`.claude/launch.json` — 4321, 4322 e 4323 — use uma livre), esconder
`.login-screen`, mostrar `#app` e injetar dados no `state` pelo próprio módulo:
`const u = await import('/js/utils.js')` devolve a MESMA instância que o app
usa, então mutar `u.state` e chamar `switchTab()` re-renderiza com os dados de
teste. **Isso não substitui a conferência dela com os dados reais** — diga isso
no fim da rodada.

---

## 5. A PRIMEIRA COISA A FAZER nesta sessão

A usuária pediu explicitamente: **antes de começar a rodada 5, resuma para ela
o que cada rodada que falta vai fazer.** Em português, curto, uma seção por
rodada (5 Guardado · 6 Importar · 7 Conferir · 8 Ajustes), dizendo em cada uma:

- **o que muda na tela** que ela vai ver;
- **o que sai, se sair alguma coisa** (tela, card ou capacidade) e por quê;
- **o que ela precisa decidir**, se houver decisão pendente.

Leia os arquivos da seção 0 antes de escrever esse resumo — ele tem que bater
com o que está no plano, não com o que parece razoável. **Espere a resposta
dela** antes de mexer em código.
