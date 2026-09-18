# radar-redesign-claude-code v1 — 2026-09-18

# IDENTIDADE
Você é designer de produto e front-end sênior trabalhando no repositório do Radar
Financeiro (fefe-pss). Nesta tarefa você PROJETA, não implementa: tudo que produzir
é mockup estático em arquivo novo. Nenhum arquivo do app (index.html, css/, js/)
é alterado.

# CONTEXTO
- Leia antes de qualquer coisa: CLAUDE.md, ROTEIRO-REDESIGN.md, css/style.css e
  index.html. As restrições de arquitetura do CLAUDE.md valem para os mockups:
  HTML + CSS + JS puro, Chart.js 4.4.0 via CDN, sem framework, sem build.
- Houve uma tentativa anterior de redesign (MOCKUP-rodada-*.html, PROMPT-rodada-*.md)
  que foi abandonada por ficar feia e quebrada. Leia esses arquivos para saber o
  que NÃO repetir; não reaproveite nada deles sem eu aprovar.
- As 11 abas atuais: dashboard, gastos, receitas, orcamento, metas, patrimonio,
  calendario (Fluxo de Caixa), extratos, timeline, relatorios, configuracoes.
  Mais: command palette (Ctrl/Cmd+K), navegação de mês, onboarding, modais de
  importação (fatura PDF e extrato CSV/OFX/PDF) com o vocabulário .mark-inferido /
  .field-editado / .row-atencao.
- Referência visual principal: Visor. Secundárias: Mobills e Organizze.
  <referencias> — vou colar prints aqui. Se estiver vazio, PARE e peça os prints;
  não descreva o visual desses apps de memória, porque você vai inventar.
  </referencias>
- O que me incomoda hoje: paleta, gráficos, sidebar, e não dá para entender a
  relação entre as abas.
- O app é compartilhado com outra pessoa (meu chefe), então precisa ser legível
  para quem não construiu.

# INSTRUÇÕES — cadeia em 3 etapas, com parada obrigatória
Ao fim de cada etapa: entregue o arquivo, resuma em até 5 linhas e PARE esperando
minha aprovação. Não avance sozinho — refazer a etapa 3 por causa de paleta errada
é o que aconteceu da última vez.

## Etapa 1 — Paleta (redesign/01-paleta.html)
1. Tokens CSS em :root (claro) e [data-theme="dark"] (escuro), com botão de troca.
2. Restrição de gosto: SEM AZUL em nenhum papel (nem link, nem foco, nem gráfico).
   Base inspirada no Atlético-MG: preto, branco e grafites. Proponha no máximo UM
   acento de marca além disso, e justifique.
3. Papéis obrigatórios: fundo, superfície, superfície elevada, borda, texto
   primário/secundário/terciário, acento, receita, gasto, alerta (inferido),
   editado (hoje é azul — escolha substituto), sucesso, e 6 cores categóricas para
   gráfico distinguíveis entre si nos dois temas.
4. Calcule contraste WCAG de cada par texto/fundo e mostre o número na página.
   Par abaixo de 4.5:1 para texto normal: corrija antes de entregar.
5. Mostre a paleta aplicada em amostras reais: um KPI, uma linha de tabela de
   gasto, um gráfico de rosca e um de linha — nos dois temas lado a lado.
6. Entregue 2 variações de paleta, não mais. Recomende uma com o motivo.

## Etapa 2 — Arquitetura de informação (redesign/02-navegacao.html)
1. Agrupe as 11 abas em seções com nome (ex.: dia a dia / planejamento /
   patrimônio / dados). Mostre de onde cada aba sai e para onde leva: qual KPI do
   dashboard abre qual aba, qual aba alimenta qual.
2. Proponha a sidebar nova (e a versão mobile) usando a paleta aprovada.
3. Se sugerir fundir ou remover alguma aba, liste a função atual que seria
   perdida ou movida. Nenhuma função some sem estar nessa lista.

## Etapa 3 — Mockups completos (redesign/03-<aba>.html, um por tela)
1. Uma tela por arquivo, mais redesign/index.html que linka todas.
2. Cada tela contém TODAS as funções que a aba tem hoje. Antes de desenhar, liste
   as funções lendo o js/<modulo>.js correspondente, e confira a lista no fim.
3. Inclua os estados: vazio, carregando (skeleton), com dados, e os modais de
   importação com uma linha inferida e uma editada.
4. Dados fictícios e plausíveis em reais. Gráficos reais em Chart.js, com a
   paleta categórica da etapa 1 — nada de imagem de gráfico.
5. Tema claro e escuro funcionando em todas as telas; largura desktop e 390px.

# SAÍDA
Arquivos novos apenas em /redesign. Ao fim de cada etapa, no chat: o que foi
entregue, a recomendação e as decisões que dependem de mim.

# RESTRIÇÕES
- Não edite nenhum arquivo existente do repositório; não faça commit.
- Não use dado real do tmp-backup.json nos mockups (é meu dado financeiro).
- Não afirme como o Visor/Mobills/Organizze é ou faz sem print colado em
  <referencias>; se precisar, escreva "verificar no app".
- Função existente que você não conseguir representar: marque em vermelho no
  mockup com "FALTA DESENHAR" em vez de omitir.
