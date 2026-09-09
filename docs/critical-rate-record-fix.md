# Correção crítica: rate limit e envio de fluxo — 9 de setembro de 2026

## Estado da entrega

- Projeto Firebase: `cim-normatel-ac5b7`.
- Projeto Vercel: `fluxo_criticos`.
- Produção: https://fluxocriticos.vercel.app.
- Deploy final: `dpl_EwsCRyEoVnMqKWk4X93giqpJm98K` (CLI, código local corrigido).
- Preview validado: `dpl_3N9jERhM2nPjNWk1shioc5x2KjcX`, READY; POST autenticado pela proteção Vercel em `/api/auth/abuse-check` retornou `{"ok":true}`.
- Regras Firestore publicadas com sucesso depois de 63 testes de emulador.

O deploy automático do Git `dpl_6chGm1AzAN6B5CvrvKqQ4ZV6onJ4`, commit `d263887`, substituiu a publicação corrigida anterior e voltou a expor o limite antigo. A publicação CLI deste relatório restaurou o código corrigido. Enquanto este conjunto não estiver no Git, qualquer novo push em `main` pode reverter novamente a produção.

## Erro 1: HTTP 429 em `/api/auth/abuse-check`

### Causa comprovada

A política de cadastro permitia somente **5 requisições por IP durante uma hora**. O IP vinha do cabeçalho confiável `x-vercel-forwarded-for`, mas todos os colaboradores atrás do mesmo NAT/rede corporativa dividiam a mesma chave. O contador por e-mail já existia, porém o teto do IP bloqueava endereços diferentes depois da quinta tentativa. Logs Vercel mostraram sete respostas 429 no deploy anterior.

Não havia duplicidade `onClick` + `onSubmit`: o formulário usa apenas `onSubmit`, chama `preventDefault()`, possui trava síncrona em `submitLock` e desabilita o botão durante o envio. `OPTIONS` é rejeitado antes do limitador. O armazenamento Upstash é adequado a funções serverless e o reset do fixed window está em milissegundos conforme o retorno da biblioteca; o fallback em memória é usado somente fora de produção.

### Correção

- Cadastro: 5 tentativas por identidade de e-mail/HMAC por hora e teto emergencial de 60 por rede por hora.
- Recuperação: 5 por identidade e 100 por rede por hora, em namespaces separados do cadastro.
- Endereço de e-mail nunca é armazenado como chave ou logado: a chave usa HMAC com `RATE_LIMIT_HASH_SECRET`.
- Se o cabeçalho de rede não for válido, não existe balde global `unknown`; o limite por conta continua obrigatório.
- Falha de Upstash fecha o gate com 503, diferenciada de cota realmente esgotada.
- 429 devolve `Retry-After`, `retryAfterSeconds` e código interno `app/rate-limited`.
- A interface converte o atraso em segundos/minutos. `auth/too-many-requests` continua reservado ao bloqueio do próprio Firebase, com mensagem diferente.
- Logs informam somente fluxo, escopo, status e atraso; não contêm e-mail, senha, token ou hash de identidade.

Prova de produção com endereços `example.invalid`: o mesmo endereço retornou `200, 200, 200, 200, 200, 429`; a sexta resposta trouxe `Retry-After: 3054`. Outro endereço na mesma rede retornou 200, e a recuperação para o primeiro endereço retornou 200 porque usa outro contador. O teste do navegador confirmou uma requisição ao gate no primeiro clique; cadastro repetido elevou a contagem para duas, como esperado.

## Erro 2: `firestore.operation.failed`

### Operação e código

A operação crítica é a transação:

`settings/recordCounter_AAAA + records/{draftId} + approvals/{draftId} + logs/{autoId}`

O código Firebase reproduzido quando um componente não satisfaz as regras é `firestore/permission-denied`. Como a escrita é atômica, o SDK informa a rejeição do commit inteiro. O caso relacionado aos campos mostrados no console é a criação do log: as regras exigem que `actorId`, `actorName` e `actorRole` coincidam com o UID e o perfil Firestore autenticados. Um ator divergente foi rejeitado no emulador e a transação inteira, incluindo contador, registro e aprovação, foi revertida.

A cadeia corrigida relê o perfil no servidor antes do envio e usa os identificadores internos estáveis `admin`, `gerente`, `tecnico` e `visualizador`. “Técnico de Operações” permanece apenas como rótulo visual. O Técnico ativo pode ler registros, criar fluxo e editar somente seus próprios envios; Visualizador continua sem acesso a `/records/new`.

O log agora usa `serverTimestamp()`. As regras exigem `createdAt == request.time`, além de nome/cargo/UID canônicos, e proíbem edição/exclusão do histórico. O conversor transforma o Timestamp em ISO somente depois da leitura para manter as telas existentes. A transação continua indivisível: falha no registro, aprovação ou auditoria não consome o número nem deixa documento parcial.

O diagnóstico `firestore.operation.failed` passou a conter, com limites de segurança: `code`, `message`, `name`, operação, coleção, caminhos de documentos, UID e cargo. E-mails e tokens são removidos, payload do formulário/anexo não é enviado ao console.

Upload e Firestore não são uma única transação. O fluxo grava intenção local antes do upload, espera Storage, persiste o rascunho e somente depois finaliza o registro. Falha definitiva compensa o objeto recém-enviado; falha ambígua mantém o marcador para “Recuperar arquivos pendentes”. A recuperação aceita somente o UID atual, o mesmo `draftId` e caminhos dentro de `attachments/{uid}/`, consulta o servidor e não vincula arquivo a outro registro.

### Prova de produção

Foi criado um Técnico descartável de UID `NsvDEHUDE8fKKUnMExTyua4tliG3` e o registro descartável `codex-record-8b8cc906-05fd-4e2a-b7bd-9a97ea40a7ea`. A transação atribuiu temporariamente `219/2026` e foram lidos novamente:

- registro principal com o número correto;
- aprovação pendente com o mesmo número/autor;
- log `Criado`, cargo interno `tecnico` e timestamp Firestore;
- PNG no Storage, 33 bytes, acessível pelo proprietário.

Após a verificação, foram removidos somente esse usuário Auth, perfil, registro, aprovação, log e anexo. Como não ocorreu outra reserva concorrente, o contador foi restaurado com precondição de `updateTime`; `219/2026` não foi consumido pelo teste.

## Testes

- 15 testes de autenticação/rate limit.
- 5 testes de segurança, incluindo expiração real do fixed window.
- 63 testes com emuladores Auth, Firestore e Storage.
- 15 testes de upload/recuperação.
- 19 testes de e-mail, numeração, URLs de anexo e XSS.
- Total de testes Node/emulador desta execução: **117 aprovados**.
- TypeScript, ESLint e build de produção aprovados.
- 4 testes Playwright locais passaram; o limite global do comando encerrou apenas o teardown do servidor depois dos testes, sem falha de caso funcional.
- Produção Chrome: passou em 23,3 s, com `signups=2`, `logins=3`, `signupGates=2`, `resetGates=1`; a primeira criação confirmou `signupGates=1`.
- Produção Edge: passou em 29,8 s.
- Produção Brave em perfil isolado: passou em 20,8 s.
- Preview: build concluído e gate serverless respondeu 200 com origem do próprio Preview. O fluxo Auth completo não foi repetido nessa URL temporária porque ela não integra a lista permanente de Authorized domains; a validação completa foi feita no domínio de produção autorizado.
- As contas descartáveis dos navegadores foram removidas após conferir cada UID.

Formatos JPG, PNG, WEBP e PDF passaram no Storage/emulador. Também passaram envio sem anexo, falha de upload, compensação após rejeição Firestore, falha de auditoria com rollback, incremento concorrente, reenvio idempotente, recuperação pendente, sessão expirada, conta pendente e usuário sem permissão.

## Reconciliação de perfis

Durante a verificação final, o UID `HMRYpC1VgNXpq3ZsjycPOLyE0q33` voltou a aparecer no Authentication sem perfil, apesar de ter sido reconciliado anteriormente. Ele foi restaurado novamente com precondição `exists:false`, cargo `visualizador`, status `pendente` e `approved:false`. Não existe política TTL na coleção `users`, e nenhuma limpeza descartável desta execução usou esse UID. A causa da segunda exclusão permanece externa ao código localizado ou exige auditoria administrativa do projeto.

A auditoria posterior terminou sem perfis ausentes, perfis sem Auth, perfis incompletos ou divergência de UID. Um administrador deve confirmar a identidade desse UID e decidir cargo/aprovação. Não restaurar privilégios por suposição.

## Arquivos desta correção

- `src/app/api/auth/abuse-check/route.ts`
- `src/lib/rate-limit.ts`
- `src/lib/auth-errors.ts`
- páginas de login, cadastro e recuperação
- `src/lib/forms.ts`
- `src/lib/firestore-helpers.ts`
- `src/app/(dashboard)/records/new/page.tsx`
- `firestore.rules`
- testes de autenticação, segurança, regras, upload e produção
- scripts de sondagem/reconciliação em `scripts/`

Não houve abertura pública de Firestore ou Storage, mudança de senha real, migração de serviço ou alteração automática de cargos existentes.

## Ação pendente

O código está ativo em produção, mas o deploy foi feito a partir de uma árvore local marcada como `gitDirty`. É necessário commitar e enviar essas alterações ao `main`; sem isso, o próximo deploy automático do Git pode substituir a correção, como já aconteceu nesta investigação. O skill de publicação exige aprovação explícita antes de executar `git push`.
