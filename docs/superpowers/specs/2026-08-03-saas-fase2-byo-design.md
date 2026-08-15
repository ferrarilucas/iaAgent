# SaaS Fase 2 — BYO (chave de IA do próprio usuário)

**Data:** 2026-08-03
**Status:** Design aprovado — plano de implementação a seguir
**Spec pai:** `docs/superpowers/specs/2026-08-01-saas-migration-design.md`

## Contexto e objetivo

A Fase 1 entregou a fundação multi-tenant: tabela `subscriptions`, trial de 7 dias, porteiro
no agente e configuração de IA resolvida por requisição. O `resolveAiConfig` já recebe o
`aiMode` da assinatura, mas ainda devolve sempre a chave da plataforma — o ponto de extensão
está pronto e vazio.

Esta fase preenche esse ponto. Ela deixou de ser a terceira e passou a ser a segunda porque o
**trial passou a exigir chave própria**: a nossa IA é exclusiva de quem paga. Com isso, o BYO
virou pré-requisito de qualquer pessoa conseguir usar o produto — não dá para cobrar por algo
que ninguém consegue experimentar.

Consequência econômica da decisão: nunca pagamos IA de quem não paga. Consequência de
produto: existe uma criação de API key entre a pessoa e a primeira resposta do agente. A
fricção é atenuada pelo free tier do Google AI Studio, que faz o trial custar zero para o
usuário.

## Decisões tomadas

- **Múltiplos provedores** (Google, Anthropic, OpenAI), não apenas Gemini.
- **Degradação graciosa** quando o provedor do usuário não suporta a mídia enviada — mensagem
  determinística, sem transcrição de compensação (transcrever pela nossa conta furaria o
  modelo econômico da fase).
- **Chave configurada só pelo painel**, nunca por WhatsApp.
- **Sem seletor de modelo** nesta fase; padrão por provedor.
- Trial passa a nascer com `aiMode: "byo"`.

## 1. Modelo de dados

Tabela nova em `packages/db`:

```
ai_credentials
  id              uuid pk
  user_id         uuid notnull UNIQUE -> users(id) on delete cascade
  provider        ai_provider notnull            -- google | anthropic | openai
  encrypted_key   text notnull
  model           text                            -- null = padrão do provedor
  status          ai_credential_status notnull default 'nao_checada'
                                                  -- nao_checada | valida | invalida | sem_quota
  last_checked_at timestamptz
  created_at      timestamptz notnull default now()
  updated_at      timestamptz notnull default now()
```

Uma chave por usuário (`user_id` UNIQUE). Suportar várias chaves simultâneas não tem caso de
uso hoje e multiplicaria a lógica de seleção.

## 2. Criptografia

**AES-256-GCM**, com o valor persistido num formato versionado:

```
v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
```

O prefixo de versão custa nada agora e é o que torna possível rotacionar chave ou trocar
algoritmo depois sem ter que adivinhar o significado de cada linha existente.

A chave-mestra vem de `AI_CREDENTIALS_KEY` (32 bytes em base64), **sem valor default**: se
faltar ou for inválida, o boot falha alto. Isso é o oposto deliberado do que decidimos para
`SUBSCRIPTIONS_ENABLED` — lá um typo numa flag inerte não pode derrubar o agente; aqui, subir
sem chave de criptografia significaria gravar segredo em claro, e isso precisa quebrar
ruidosamente.

Regras invioláveis: a chave em claro nunca é logada (nem dentro de mensagem de erro), nunca
retorna ao cliente, e só é decifrada no servidor no momento do uso.

## 3. Pacote novo: `packages/ai`

O `buildModel` mora hoje em `apps/agent/src/agent/ai-config.ts`, e isso deixa de funcionar
nesta fase: **o `apps/web` também precisa construir modelo**, porque validar a chave do
usuário é fazer uma chamada real ao provedor. Extrair é a mesma justificativa que criou o
`packages/whatsapp`.

Conteúdo:

- `providers.ts` — catálogo: id, rótulo, modelo padrão, capacidades, como validar.
- `capabilities.ts` — a matriz e o mapeamento tipo-de-mensagem → capacidade.
- `crypto.ts` — `encryptKey` / `decryptKey` no formato versionado.
- `model.ts` — construção do `LanguageModel` a partir de provedor + modelo + chave.

O `apps/agent` passa a importar daqui. O `ai-config.ts` **permanece existindo** e fica com uma
responsabilidade só: `resolveAiConfig`, que precisa de acesso ao banco (para ler a credencial)
e por isso não pertence a um pacote sem dependência de dados. Catálogo, capacidades, cripto e
construção de modelo saem todos para `packages/ai`.

## 4. Matriz de capacidades

Capacidades: `texto`, `foto`, `pdf`, `audio`, `video`.

| Provedor | texto | foto | pdf | audio | video |
|---|:---:|:---:|:---:|:---:|:---:|
| google | ✅ | ✅ | ✅ | ✅ | ✅ |
| anthropic | ✅ | ✅ | ✅ | ❌ | ❌ |
| openai | ✅ | ✅ | ❌ | ❌ | ❌ |

A tabela acima é o ponto de partida e **precisa ser conferida contra a documentação atual de
cada provedor no momento da implementação** — capacidades multimodais mudam rápido. A matriz
é dado, não lógica: corrigir uma linha não deve exigir mudar código.

O `IncomingMessage.kind` do `packages/whatsapp` já usa exatamente `texto | audio | foto |
video | pdf`, então o mapeamento para capacidade é direto.

Fluxo: antes de gastar qualquer chamada, o agente checa se a capacidade exigida pela mensagem
está no provedor do usuário. Se não estiver, responde determinísticamente explicando e
sugerindo trocar de provedor nas configurações.

## 5. Dois portões separados

A Fase 1 entregou `subscriptionAccess`, que responde *"esta pessoa pode usar o produto?"*.
Esta fase acrescenta um segundo portão, puro e independente, que responde *"esta pessoa tem
uma chave utilizável?"*:

```
aiCredentialGate(subscription, credential | undefined) -> string | null
```

- `aiMode === "nossa"` → `null` (a plataforma resolve).
- `aiMode === "byo"` e sem credencial → link para configurar a chave.
- `aiMode === "byo"` e `status === "invalida"` → avisa que a chave parou de funcionar.
- `aiMode === "byo"` e `status === "sem_quota"` → avisa que a cota estourou.
- caso contrário → `null`.

Manter os dois eixos separados evita estados impossíveis (“trial válido, sem chave e
cancelado”) e mantém o padrão que funcionou na Fase 1: núcleo puro, casca fina.

Ordem no `processMessage`: porteiro de assinatura → portão de credencial → checagem de
capacidade → IA. Todas as respostas de bloqueio são strings determinísticas montadas no
servidor, sem passar pelo modelo.

## 6. Tela `/app/configuracoes/ia`

- Escolher provedor, com as capacidades visíveis (“este provedor não processa áudio”).
- Colar a chave e salvar.
- Ver o status da validação.
- Trocar ou remover a chave.

A chave é **write-only**: depois de salva, a tela exibe apenas um mascarado
(`AIza••••••7f3k`) e o valor nunca volta ao navegador, em nenhuma resposta ou atributo.

Fluxo de quem está bloqueado no WhatsApp: recebe o link → loga por OTP → configura → volta a
usar. O agente precisa de uma URL para esse link: nova env `AI_CONFIG_URL`, seguindo o mesmo
padrão de `BILLING_URL` (`z.string().url()` com default, falhando alto em URL inválida). Se
uma terceira URL de painel aparecer, consolidar as três numa `PANEL_URL` base.

## 7. Validação e classificação de erro

Ao salvar, a chave é testada com uma chamada mínima e o `status` é gravado. Em uso, quando o
agente falhar, o erro é classificado para atualizar o `status` — assim a mensagem seguinte
traz a explicação certa em vez do fallback genérico.

**Esta é a parte de maior risco da fase.** Distinguir "chave inválida" de "cota estourada" de
"instabilidade momentânea" depende do formato de erro de cada provedor, que é mal documentado
e muda sem aviso. Duas regras para conter isso:

1. Classificação por **fixtures de erro real** de cada provedor, não por adivinhação.
2. Classificação **conservadora**: na dúvida, tratar como transitório. Marcar uma chave boa
   como inválida bloquearia um usuário legítimo — errar para o lado do transitório apenas
   adia o diagnóstico.

## 8. Mudanças no que já existe

- `ensureTrialSubscription` passa a criar o trial com `aiMode: "byo"` (era `"nossa"`), com o
  teste correspondente ajustado.
- `resolveAiConfig` passa a ramificar de verdade: em `byo`, decifra a credencial do usuário e
  usa provedor + modelo dele; em `nossa`, segue com a chave da plataforma.
- `AiConfig.apiKey` deixa de ser opcional. Hoje é `apiKey?: string`, e
  `createGoogleGenerativeAI({ apiKey: undefined })` **não falha** — cai silenciosamente na env
  da plataforma. Com o BYO ramificando, isso significaria um usuário sem chave válida queimar
  a chave da plataforma **funcionando normalmente**, que é o pior tipo de falha. Tornar
  obrigatório fecha a porta. (Dívida registrada no review da Fase 1.)
- A união `"nossa" | "byo"` está redigitada em quatro lugares sem derivar do banco
  (`process-message.ts` ×2, `handler.ts`, `ai-config.ts`). Como esta fase acrescenta o enum de
  provedor, é o momento de exportar os tipos a partir do schema e usá-los. (Também registrado
  no review da Fase 1.)

## 9. Testes

- **Cripto:** round-trip, formato versionado, chave-mestra errada falha, texto cifrado nunca
  igual ao claro.
- **Capacidades:** cada provedor declara o esperado; mapeamento `kind` → capacidade cobre os
  cinco tipos.
- **`aiCredentialGate`:** cada ramo, incluindo `nossa` passando direto.
- **`resolveAiConfig`:** `byo` com credencial válida usa provedor/chave do usuário; `nossa`
  usa a plataforma; `byo` sem credencial nunca cai na chave da plataforma.
- **Classificação de erro:** fixtures de cada provedor → status esperado; erro desconhecido →
  transitório.
- **Segurança:** a chave em claro não aparece em nenhuma resposta da tela nem em log.

## 10. Fora de escopo

Pagamento e checkout (Fase 3), cobertura de assinatura de espaço (Fase 4), seletor de modelo,
múltiplas chaves por usuário, rotação automática da chave-mestra, e transcrição de áudio de
compensação para provedores sem suporte.
