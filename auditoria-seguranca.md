# Relatório de Auditoria de Segurança
## Aplicativo de Finanças Pessoais — Pré-Deploy Vercel
**Data:** Maio de 2026 | **Versão auditada:** 1.1.0 | **Auditor:** Análise automatizada + revisão manual

---

## 1. Resumo Executivo

O aplicativo é um SaaS financeiro pessoal client-side hospedado na Vercel, usando Firebase Auth + Firestore, PDF.js e Chart.js. A arquitetura é adequada para um MVP de uso pessoal e, após as correções aplicadas nesta auditoria, está apta para deploy em produção.

**Nota final de segurança:** 8,0 / 10 *(após aplicação das correções)*

Antes das correções a nota seria: **5,5 / 10**.

Os principais pontos positivos são: isolamento correto por UID no Firestore, uso de autenticação Google (sem senha própria a vazar), ausência de backend exposto, dados sensíveis nunca em localStorage. Os principais riscos corrigidos foram XSS por falta de sanitização de HTML e ausência de headers de segurança HTTP.

---

## 2. Riscos Encontrados e Corrigidos

### 🔴 ALTOS (corrigidos)

---

**RISCO-01 — XSS via innerHTML sem sanitização**
- **Arquivos:** `gastos.js`, `dashboard.js`, `patrimonio.js`, `metas.js`, `receitas.js`, `configuracoes.js`
- **Natureza:** Todos os campos de dados do usuário (descrição de transação, nome de ativo, nome de meta, nome de categoria, observações) eram inseridos diretamente em templates de `innerHTML` sem nenhum tratamento. Um nome de categoria como `<img src=x onerror=alert(1)>` seria executado como JavaScript no browser.
- **Impacto:** Alto. Embora o vetor de ataque em uso solo seja limitado (a vítima seria a própria usuária), um arquivo de backup importado por terceiros ou um PDF com conteúdo malicioso poderia disparar XSS ao renderizar a tabela.
- **Trecho problemático (exemplo):**
```javascript
// ANTES — gastos.js linha 67
<td title="${tx.notes || ''}">${tx.description || '—'}</td>

// ANTES — metas.js linha 45
<span class="meta-nome">${g.name}</span>
```
- **Correção aplicada:** Criada e exportada a função `esc()` em `app.js`, importada em todos os módulos afetados. Todos os campos de dados do usuário em `innerHTML` agora passam por `esc()`.
```javascript
// DEPOIS — app.js
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// DEPOIS — gastos.js
<td title="${esc(tx.notes || '')}">${esc(tx.description) || '—'}</td>
```

---

**RISCO-02 — Importação de backup JSON sem validação estrutural**
- **Arquivo:** `db.js`, função `importBackup()`
- **Natureza:** O arquivo JSON era aceito e gravado no Firestore diretamente, sem validar: tamanho do arquivo, estrutura do payload, tipos de dados, valores absurdos (ex: `amount: 9999999999999`), coleções não permitidas, ou prototype pollution (`__proto__`, `constructor`).
- **Impacto:** Alto. Um JSON malformado poderia corromper o banco de dados. Um JSON com `__proto__` poderia poluir o prototype do JavaScript (ataque clássico de object injection).
- **Trecho problemático:**
```javascript
// ANTES — sem nenhuma validação
const payload = JSON.parse(text);
const data = payload.data || payload;
```
- **Correção aplicada:** Função `_validateBackupPayload()` que verifica: tamanho máximo de 50 MB, presença de `__proto__`/`constructor`/`prototype`, se cada coleção é um array, limite de 50.000 itens por coleção, tipo e intervalo de `amount` em transações, tamanho máximo de campos texto. IDs com `/` (path traversal) são bloqueados antes da escrita no Firestore.

---

**RISCO-03 — Ausência de headers de segurança HTTP**
- **Arquivo:** `vercel.json` (não existia)
- **Natureza:** Sem `X-Frame-Options`, qualquer site externo poderia embutir o app em um `<iframe>` e realizar clickjacking. Sem `Content-Security-Policy`, scripts inline e de fontes não autorizadas poderiam ser injetados. Sem `Strict-Transport-Security`, ataques MITM em HTTP eram possíveis.
- **Impacto:** Alto para clickjacking; Médio para CSP e HSTS num contexto de uso pessoal.
- **Correção aplicada:** Criado `vercel.json` com os headers:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  - `Content-Security-Policy` com allowlist explícita de origens

---

### 🟡 MÉDIOS (corrigidos)

---

**RISCO-04 — Importação de PDF sem limite de tamanho**
- **Arquivo:** `pdf-import.js`
- **Natureza:** Qualquer arquivo era aceito. Um PDF de 2 GB travaria o browser completamente (DoS local). A verificação de MIME type usava apenas `file.type`, que é declarado pelo browser baseado na extensão — um arquivo `.pdf` renomeado com conteúdo diferente passaria.
- **Correção aplicada:** Limite de 20 MB adicionado antes de qualquer processamento. Verificação de MIME type mantida como primeira linha de defesa.
```javascript
const PDF_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
if (file.size > PDF_MAX_BYTES) { toast('O PDF excede o limite de 20 MB.', 'error'); return; }
```

---

**RISCO-05 — CSS Injection via `cat.color` em `style=`**
- **Arquivo:** `gastos.js`, `receitas.js`, `configuracoes.js`
- **Natureza:** A cor da categoria (input do usuário via `<input type="color">`) era interpolada diretamente em atributos `style`. Embora `<input type="color">` no browser só aceite cores hex válidas, um backup JSON importado poderia conter `color: "red; background:url(javascript:..."`.
- **Impacto:** Baixo a médio — CSS injection raramente escapa para XSS em navegadores modernos, mas pode alterar o visual da aplicação.
- **Correção aplicada:** `cat.color` agora passa por `esc()` antes de entrar em `style=`.

---

**RISCO-06 — `window._FB` exposto globalmente**
- **Arquivo:** `index.html`
- **Natureza:** O objeto `window._FB` expõe as referências ao Firebase SDK (auth, db, métodos de coleção) no escopo global do browser, acessível via console por qualquer script da página.
- **Impacto:** Médio. Não expõe a chave privada nem permite acesso a dados de outros usuários (as Firestore Rules bloqueiam isso), mas facilita que scripts maliciosos injetados por extensões do browser chamem `window._FB.addDoc()` diretamente.
- **Avaliação:** Esta é uma limitação arquitetural do uso de Firebase SDK com módulos ES sem bundler. Para um MVP pessoal de uso solo, o risco é aceitável. A mitigação completa exigiria um bundler (Vite/Webpack) para encapsular as referências.
- **Status:** Aceito como risco de MVP. Documentado para mitigação futura.

---

**RISCO-07 — Ausência de `.gitignore`**
- **Arquivo:** `.gitignore` (não existia)
- **Natureza:** Sem `.gitignore`, arquivos como `.env`, arquivos de backup `.json` com dados financeiros reais, ou arquivos de sistema (`.DS_Store`) poderiam ser commitados acidentalmente no repositório GitHub público.
- **Correção aplicada:** Criado `.gitignore` cobrindo `.env*`, `*.json` (exceto `package.json`), `.DS_Store`, `node_modules/`.

---

### 🟢 BAIXOS (verificados, sem ação necessária)

---

**RISCO-08 — Firebase API Key exposta no código-fonte**
- **Arquivo:** `index.html`
- **Natureza:** A `apiKey` do Firebase é visível no HTML público.
- **Avaliação:** Isso é **comportamento esperado e seguro** para Firebase. A `apiKey` do Firebase não é uma credencial secreta — ela identifica o projeto mas não concede acesso aos dados. O acesso é controlado 100% pelas Firestore Security Rules e pelo Firebase Auth. O Google documenta explicitamente que essa chave pode ser pública. **Nenhuma ação necessária.**

---

**RISCO-09 — Isolamento de dados entre usuários**
- **Verificação:** Toda leitura e escrita usa o `uid` do usuário autenticado como parte do path do Firestore: `users/{uid}/colecao`.
- **Regras do Firestore verificadas:**
```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```
- **Avaliação:** Correto. Um usuário autenticado não consegue ler nem escrever dados de outro usuário. **Sem vulnerabilidade.**

---

**RISCO-10 — Uso de `localStorage`**
- **Verificação:** Pesquisa em todos os arquivos JS por `localStorage`, `sessionStorage`.
- **Resultado:** Nenhum uso encontrado. Dados sensíveis não são persistidos localmente. **Sem vulnerabilidade.**

---

**RISCO-11 — PDF.js execução de scripts**
- **Verificação:** PDF.js por design não executa JavaScript embutido em PDFs. O parser extrai apenas conteúdo de texto das páginas.
- **Avaliação:** Seguro. **Sem vulnerabilidade.**

---

## 3. Firestore Security Rules — Revisão

As regras configuradas estão corretas para o modelo de uso solo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Pontos positivos:**
- Autenticação obrigatória (`request.auth != null`)
- Isolamento por UID (`request.auth.uid == userId`)
- Cobertura wildcard para todas as subcoleções (`{document=**}`)
- Nenhuma coleção pública acidental

**Ponto de atenção (médio prazo):** As regras não validam o schema dos documentos no lado do servidor. Um client comprometido (extensão maliciosa no browser) poderia gravar campos arbitrários. Para produção em escala, adicionar validação de tipo nas rules:
```
allow write: if request.resource.data.amount is number
          && request.resource.data.amount >= 0
          && request.resource.data.amount <= 1000000;
```

---

## 4. Checklist Pré-Deploy

| Item | Status |
|------|--------|
| Firebase Auth ativo com Google | ✅ |
| Firestore Rules com isolamento por UID | ✅ |
| Domínio da Vercel autorizado no Firebase Auth | ⚠️ Fazer após deploy |
| `vercel.json` com security headers | ✅ Criado |
| `.gitignore` cobrindo `.env` e backups | ✅ Criado |
| `esc()` aplicada em todos os `innerHTML` com dados do usuário | ✅ |
| Validação estrutural do backup JSON | ✅ |
| Limite de tamanho no upload de PDF (20 MB) | ✅ |
| Nenhum uso de `localStorage` para dados sensíveis | ✅ |
| HTTPS obrigatório (garantido pela Vercel) | ✅ |
| Credenciais Firebase sem valores reais commitadas | ✅ (estão como "COLE_AQUI") |
| Testar login Google após deploy | ⚠️ Obrigatório |
| Testar importação de backup | ⚠️ Obrigatório |
| Testar importação de PDF | ⚠️ Obrigatório |

---

## 5. Nota Final de Segurança

| Dimensão | Nota | Comentário |
|----------|------|------------|
| Autenticação | 9/10 | Google Auth bem implementado |
| Isolamento de dados | 10/10 | Firestore Rules corretas |
| XSS / Sanitização | 8/10 | Corrigido; risco residual mínimo |
| Importação de dados | 8/10 | Validação robusta adicionada |
| Headers HTTP | 9/10 | CSP + HSTS + X-Frame aplicados |
| Segredos / Credenciais | 8/10 | API key é pública por design; sem segredos reais |
| Persistência local | 10/10 | Nenhum dado sensível em localStorage |
| **GERAL** | **8,0 / 10** | Adequado para produção MVP pessoal |

---

## 6. Riscos Aceitáveis para o MVP

Estes riscos foram identificados mas são aceitáveis para um MVP de uso pessoal:

**`window._FB` global** — limitação do modelo sem bundler. Não permite acesso a dados de outros usuários; facilita apenas que scripts locais chamem o SDK. Risco baixo para uso solo.

**CSP com `unsafe-inline`** — necessário porque o Firebase SDK e Chart.js usam algumas funções inline. Sem bundler, não há como remover. Para MVP pessoal, aceitável.

**Validação de schema no Firestore Rules** — as rules atuais validam autenticação e UID mas não o tipo dos campos. Suficiente para MVP onde só a própria usuária acessa.

**MIME type do PDF via `file.type`** — verificação superficial, mas o PDF.js falha graciosamente se o conteúdo não for um PDF real.

---

## 7. Melhorias Recomendadas para Produção em Escala

Se o aplicativo evoluir para múltiplos usuários ou uso profissional:

**Curto prazo:**
- Adicionar validação de schema nas Firestore Security Rules (tipo e range dos campos)
- Migrar para bundler (Vite) para eliminar `window._FB` e `unsafe-inline` no CSP
- Adicionar rate limiting no Firestore (regras com `request.time`)

**Médio prazo:**
- Implementar Firebase App Check para garantir que só o app legítimo acessa o Firestore
- Adicionar logging de auditoria (quem acessou, quando, de qual IP) via Cloud Logging
- Criptografia client-side dos dados financeiros antes de enviar ao Firestore (para dados ultra-sensíveis)

**Longo prazo:**
- Backend leve (Cloud Functions) para validar importações de PDF antes de salvar
- Política de retenção de dados e exclusão de conta (LGPD)
- Autenticação multifator (MFA) opcional
