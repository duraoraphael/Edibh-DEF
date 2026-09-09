# Autenticação e permissões — 9 de setembro de 2026

> Relatório histórico da primeira investigação. A situação de produção, os perfis e a implementação de login foram atualizados na execução seguinte: consulte [Correção de login/cadastro em produção](auth-signup-production-fix.md). As afirmações abaixo sobre ausência de publicação e ausência de contas órfãs descrevem somente a primeira consulta.

Correções feitas no código local, preservando as alterações de anexos que já estavam no workspace. Não houve publicação, alteração de senha, exclusão de usuário, gravação em registros de produção ou mudança das regras nesta investigação.

## Diagnóstico e limites da evidência

| Item | Resultado verificado |
| --- | --- |
| Produção | Vercel `fluxo_criticos`, domínio `fluxocriticos.vercel.app`, implantação consultada `dpl_BV2mjeCAwW9BYByH4pc5azUEPQm6`. |
| Firebase | `cim-normatel-ac5b7`. As seis configurações públicas no JavaScript servido coincidem com `.env.local`; os seis nomes também existem no ambiente Production da Vercel. Valores de segredos não foram exportados para este relatório. |
| Faturamento | Cloud Billing retornou `billingEnabled: true`. Não é necessário ativar faturamento com base nesta evidência. Não equivale a auditoria de faturas ou cotas. |
| Authentication | E-mail/senha habilitado; 22 usuários, todos com senha e perfil correspondente. Nenhuma conta desativada, nenhum e-mail duplicado, nenhuma divergência de UID entre Authentication e os 22 documentos de usuário. |
| Perfis | 6 administradores legados, 12 técnicos legados, 1 visualizador legado e 3 técnicos ativos. Status ausente continua aceito como legado; status pendente/inativo/rejeitado bloqueia acesso interno. |
| Regras publicadas | Firestore e Storage coincidem com os arquivos locais consultados no início desta execução. O bundle publicado contém os quatro campos de associação da sequência exigidos pelas regras. Não foi comprovada divergência de deploy/regras. |
| App Check | A consulta de serviços não retornou configuração de serviços; a site key opcional não existe no ambiente local examinado. Não foi desativado App Check. Essa resposta isolada não prova o estado de todas as modalidades de enforcement. |
| Logs Vercel | Amostra de runtime das últimas 24 horas consultada: rotas com HTTP 200. Não continha o código Firebase da tentativa de login relatada. Escritas diretas do SDK em Firestore/Storage não passam pelas funções Vercel. |
| Navegador do usuário | Runtime de Browser retornou zero navegadores conectados. Console/Network da sessão afetada e Brave Shields não puderam ser inspecionados. |

**Login:** a causa comprovada da mensagem enganosa é `/api/auth/login-check`: qualquer resposta negativa de Identity Toolkit era convertida para HTTP 401 e `auth/invalid-credential`, sem registrar o código original. Erros 403/500 da própria rota também viravam credenciais inválidas no frontend; HTTP 503 virava excesso de tentativas. Além disso, backend e SDK recebiam versões diferentes do e-mail: somente o backend normalizava. Esses defeitos foram corrigidos. **Não é possível afirmar qual código o Firebase retornou na tentativa histórica, nem que a senha informada estava correta**, pois o código antigo descartava a evidência e a sessão afetada não foi disponibilizada.

**Permissão reproduzida:** ao editar um fluxo próprio já `pendente`, o técnico regravava `approvals/{recordId}` com `status: pendente`. A regra de atualização de aprovações permite ao técnico a transição `reajuste → pendente`; não autoriza essa regravação. O emulador reproduziu `permission-denied` com a transação antiga, e a transação corrigida passou. Em um fluxo já aprovado, o código antigo também tentava devolver `records/{recordId}` a `pendente`; a edição agora preserva o status e a decisão existente.

**Envio de fluxo novo:** passou nos emuladores usando as regras publicadas, nos perfis admin, gerente e técnico, inclusive contas legadas. Portanto, não atribuo a falha histórica de um fluxo novo à mesma causa da edição sem evidência. O novo diagnóstico informa a etapa da falha; a reprodução com a sessão afetada continua necessária se o problema persistir após publicar.

## Alterações

- `src/lib/auth-errors.ts`: normalização única do e-mail, classificação segura de erros, distinção de indisponibilidade/limite/credencial e prazo para chamadas à API. Nenhuma transformação da senha.
- `src/app/api/auth/login-check/route.ts`: captura códigos técnicos de Identity Toolkit sem e-mail, senha ou token; falhas de configuração/serviço deixam de alimentar o contador de senhas incorretas. Mantidos origem, limitação de tentativas e comportamento fechado quando o limitador está indisponível.
- `src/app/api/auth/abuse-check/route.ts`: mesma normalização e validação de modalidade por propriedade própria.
- `src/lib/auth-context.tsx`: normalização em login/cadastro/recuperação, limpeza do perfil ao trocar de sessão, descarte de eventos de outro UID, log de falha na leitura do perfil e propagação de falhas reais da recuperação. Usuário inexistente/desativado continua sem exposição na recuperação.
- `src/app/(auth)/login/page.tsx`, `signup/page.tsx`, `forgot-password/page.tsx`: bloqueio síncrono de duplo envio e normalização antes da validação HTML. Mensagens de login e recuperação corrigidas. Cadastro mantém mensagem genérica e diagnóstico técnico.
- `src/lib/access-policy.ts` e `src/app/(dashboard)/layout.tsx`: política explícita de aprovação; perfil ausente ou inválido mostra recuperação, sem montar telas internas.
- `src/lib/forms.ts`: edição preserva status, autor e aprovação; criação/edição gravam log obrigatório na mesma transação. Visualizador acessa somente Dashboard e Histórico; `/records` não concede acesso implícito a `/records/new`; perfis desconhecidos falham fechados.
- `src/app/(dashboard)/records/new/page.tsx`: atualização de token, releitura do perfil no servidor, diagnóstico por etapa, espera da leitura inicial antes de editar e proteção contra rascunho persistido por outra conta. Rascunho sem número aberto por `?id=` segue a criação sequencial. Edição comum mostra “Salvar alterações” e não notifica aprovadores como se fosse um novo envio.
- `src/lib/firestore-helpers.ts`: imports de tipos explícitos e resolução compatível com os testes reais do helper de log.
- `firebase.json`, `package.json`, `tests/support/alias-loader.mjs`: emulador Auth e comandos de teste.
- `tests/auth-errors.test.ts`, `tests/login-route.test.ts`, `tests/auth-emulator.test.ts`, `tests/record-upload.integration.test.ts`: regressões de autenticação, perfis, transações, PDF, log, edição e rota.
- `scripts/auth-permission-audit.mjs`: auditoria de produção somente leitura, sem imprimir dados pessoais ou credenciais. Fontes das regras são salvas em `recovery/auth-audit`, já ignorado pelo Git.

As alterações anteriores em `storage.rules`, upload, tipos, proxy e testes foram preservadas. **Não foi necessário flexibilizar ou republicar regras para corrigir a edição.** Não existe login Microsoft nem formulário público implementado neste projeto; as rotas internas exigem autenticação e aprovação. RH utiliza o perfil administrativo existente, sem criar um novo cargo implícito.

## Consistência e envio

A aplicação envia anexos quando o usuário os seleciona e os vincula ao rascunho. Esse comportamento existente foi preservado. Ao finalizar, espera as operações pendentes, valida sessão/perfil, e grava registro, sequência, aprovação e log atomicamente. Uma falha no log cancela a transação inteira. Tentativas repetidas de criação com o mesmo ID conservam o número já atribuído.

Storage e Firestore não oferecem uma transação conjunta. A compensação/journal de uploads existente foi preservada e testada: falha definitiva permite limpar arquivo recém-enviado; falha ambígua mantém a intenção de recuperação até conferir o estado no servidor. Rascunhos e arquivos associados a rascunhos não são apagados ao falhar a aprovação. Não se deve limpar os dados locais do navegador enquanto houver recuperação pendente. Notificações seguem auxiliares/best-effort; não substituem o log obrigatório.

A autorização usa `users/{uid}.role` e `status`, não custom claims. Não há Firebase Admin no frontend, nem necessidade de conta de serviço para a correção. A coerência entre criação e contador continua protegida por `getAfter`, conforme a [documentação de transações do Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions). A classificação dos retornos usa a [referência REST do Firebase Auth](https://firebase.google.com/docs/reference/rest/auth).

## Validação executada

| Cenário | Resultado |
| --- | --- |
| Login válido, senha incorreta, usuário inexistente | Passou com SDK Firebase emulado; backend também testado com respostas controladas. |
| Conta desativada e sessão revogada | Passou no emulador; refresh do token e novo login rejeitados. |
| Recuperação | Passou: código de redefinição gerado somente no emulador, sem e-mail real enviado. Entrega na caixa postal de produção não testada. |
| Aprovação/legado/pendente | Passou nos perfis admin, gerente e técnico; pendente negado. Inativo/rejeitado também cobertos nas regras. |
| Sem anexo e JPG/PNG/WEBP/PDF | Passou: upload, gravação, releitura do servidor, download e exclusão autorizada. Fixtures exercitam bytes e MIME, não decodificação visual de imagens. |
| Técnico edita próprio/nega outro | Passou. Regravação antiga de aprovação foi rejeitada e edição corrigida aceita. |
| Gerente/RH administrativo | Criação com admin e gerente passou; regras de aprovação/rejeição existentes passaram. |
| Visualizador/anônimo | Criação negada; rota de criação negada ao Visualizador; dados internos protegidos contra anônimo. |
| Log, aprovação e duplicidade | Transação com log passou; ator inválido aborta criação; mesmo ID não recebe outro número. |
| Recarregamento | Releitura real do documento no servidor passou. Recarga da tela autenticada com o navegador do usuário permanece pendente. |
| TypeScript, lint e build de produção | Passaram; lint final sem avisos. |
| Testes Node | 98 passaram: 51 emulador/regras/integração + 9 autenticação/API + 15 upload + 23 regressões existentes. |
| Interface Playwright | 12 casos cobertos em Chromium, Firefox e WebKit. Execução conjunta: 11 passaram e 1 falhou por erro interno do Firefox; o caso isolado passou na repetição com 1 worker. Primeira tentativa dentro do sandbox também teve falha gráfica ao iniciar Firefox. |
| Brave Shields ativo/inativo; Chrome/Edge do usuário | Não executados por ausência de navegador conectado. Chromium automatizado não equivale a validar essas sessões. |
| Produção autenticada | Auditoria de configuração/regras/bundle executada; login e envio com a conta afetada não executados. |

Comandos para repetir:

```powershell
npm run typecheck
npm run lint
npm run test:auth
npm run test:upload
$env:JAVA_HOME = (Resolve-Path 'recovery/java21/jdk-21.0.12.1+1-jre').Path
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
npm run test:rules
npm run build
npx playwright test --reporter=line --workers=2 --global-timeout=90000
```

Em outra máquina, instalar Java 21+ em vez de usar esse caminho portátil local. Nenhum teste emulador usa o projeto real.

## Publicação e ações restantes

1. Publicar o código revisado no projeto Vercel **fluxo_criticos** pelo fluxo habitual de commit/PR/deploy. Não houve publicação nesta execução. O workspace contém alterações anteriores; revisar o conjunto antes do commit.
2. Conferir em Production/Preview os nomes abaixo. As variáveis obrigatórias já estavam presentes na Production consultada. Não é necessário trocar o projeto Firebase nem ativar Blaze novamente.

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RATE_LIMIT_HASH_SECRET
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY  (opcional, somente com App Check configurado)
NEXT_PUBLIC_SITE_URL                    (opcional para domínio personalizado)
```

Preservar variáveis existentes de e-mail e integrações. Nenhum segredo Admin deve receber prefixo `NEXT_PUBLIC_`. Alteração de configuração pública exige novo build.

3. As regras publicadas já correspondiam às locais auditadas; esta correção não exige nova regra. Se outro ambiente tiver regras diferentes, comparar antes e usar o projeto explícito ao publicar regras: `firebase deploy --only firestore:rules,storage --project cim-normatel-ac5b7`.
4. Entrar com a conta afetada. Se a senha realmente estiver incorreta, usar **Esqueci minha senha** e concluir o link recebido; nenhuma senha existente foi alterada pelo agente. Se falhar, consultar `auth.login-check.failed` na Vercel e o código seguro no console. Não enviar senha, token nem HAR com credenciais.
5. Criar um fluxo sem arquivo e outro com JPG/PNG/PDF/WEBP; conferir Histórico, numeração, aprovação e log; recarregar e confirmar persistência. Editar um fluxo próprio em análise e outro em reajuste. Confirmar que edição simples preserva a decisão e não gera nova solicitação.
6. Repetir com técnico, gerente/admin e Visualizador; confirmar que contas pendentes continuam na tela de aprovação. Se aparecer rascunho de outra conta, usar **Iniciar novo fluxo**; o documento e os dados locais antigos são preservados.
7. Repetir em Brave com Shields ligado/desligado e Chrome/Edge sem extensões. Para acompanhamento pelo agente, conectar o navegador em **Settings → Computer use**. Registrar horário e etapa da falha, sem credenciais.

O domínio Vercel não aparece nos `authorizedDomains` consultados do Auth. Não atribuo o erro de senha a isso: não há OAuth/redirect Microsoft nem URL personalizada de continuação implementados. Antes de habilitar um desses fluxos, adicionar o domínio real em Firebase Authentication → Settings → Authorized domains e configurar o provedor correspondente.

O arquivo `RTK.md` referenciado pelas instruções não estava na raiz. Nenhum caminho temporário de imagem do Codex foi incluído no projeto.
