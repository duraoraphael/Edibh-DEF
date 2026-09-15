# Redefinição de senha — validação em 10/09/2026

O link existente em `src/app/(auth)/login/page.tsx` abre `/forgot-password`. O formulário chama `useAuth().resetPassword`, que usa `resetAccountPassword` e a instância `auth` de `src/lib/firebase.ts`. Não havia botão desconectado: o envio nativo já existia, mas faltavam validação no serviço, mensagens específicas e diagnóstico restrito ao desenvolvimento. Não foi comprovada uma falha de configuração no projeto atual.

## Alteração

- Validação antes de qualquer requisição; normalização com trim/minúsculas; espaços internos tornam o endereço inválido.
- `sendPasswordResetEmail` usa a instância existente e preserva o retorno para `/login` da origem atual.
- Mantidos a proteção contra abuso e o bloqueio síncrono por ref, com restauração em `finally`.
- O envio aguarda o SDK, sem liberar prematuramente o bloqueio por um timeout artificial.
- Mensagem neutra solicitada, erros amigáveis e aviso de que as senhas do Google/Microsoft não são alteradas.
- Erros de conta inexistente/desabilitada recebem a mesma confirmação neutra. Nenhuma consulta pública de provedores ou existência da conta foi adicionada.
- Login, cadastro, provedores e regras Firestore não foram alterados.

## Evidências

- `npm run lint`, `npm run typecheck`, `npm run build`: passaram. O build precisou de acesso de rede para baixar Inter do Google Fonts.
- `npm run test:auth`: 15 testes passaram.
- `npx playwright test --config scripts/password-reset.config.mjs`: 10 testes passaram contra o build local, usando respostas controladas do Firebase/API. Cobrem navegação pelo link existente, envio normalizado, vazio/inválido/espaços, submissões repetidas, invalid-email, excesso de solicitações, operação desabilitada, erro desconhecido, conta ausente, falha de rede e restauração do botão.
- `npx firebase emulators:exec --only auth --project demo-upload-fix "node --experimental-strip-types --experimental-test-module-mocks --import ./tests/support/register.mjs --test tests/password-reset-emulator.test.ts"`: passou. Conta cadastrada no emulador, código nativo validado, senha redefinida, nova senha aceita, antiga rejeitada e código usado não reutilizável. O emulador não entrega e-mail real.
- Produção `https://fluxocriticos.vercel.app`: login HTTP 200, navegação pelo link existente e um envio real ao endereço autorizado pelo usuário. Uma chamada `accounts:sendOobCode`, seguida da confirmação “Verifique seu e-mail”. Isso valida a versão já publicada; este trabalho ainda não foi implantado.
- Recebimento real, abertura da página hospedada, troca da senha e login real: aguardam confirmação do titular. A resposta de sucesso não comprova entrega ou existência da conta.

## Firebase Console

Consulta administrativa somente de leitura com `node scripts/password-reset-audit.mjs` confirmou no projeto `cim-normatel-ac5b7`:

- **Authentication → Sign-in method → E-mail/senha:** habilitado, com senha obrigatória. Necessário ao acesso por senha.
- **Authentication → Templates → Password reset / Redefinição de senha:** template presente. A ação aponta para `https://cim-normatel-ac5b7.firebaseapp.com/__/auth/action`, a página nativa de gerenciamento. Revisar remetente, idioma e conteúdo nesse menu caso o e-mail não chegue ou esteja inadequado; não é necessário criar outra página no site.
- **Authentication → Settings → Authorized domains:** `localhost`, `fluxocriticos.vercel.app`, `cim-normatel-ac5b7.firebaseapp.com` e `cim-normatel-ac5b7.web.app` presentes. O domínio de retorno precisa estar autorizado porque o envio inclui uma URL `/login` na origem atual.

Nenhuma ativação ou inclusão de domínio necessária foi encontrada para os endereços acima. Se usar domínio próprio ou outra URL de preview Vercel, abrir o último menu, clicar **Add domain** e cadastrar o hostname exato, sem protocolo/caminho. Não foi identificado outro domínio de produção no repositório.

Referências oficiais: [estado e domínio de retorno](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions), [templates de e-mail](https://support.google.com/firebase/answer/7000714).

O arquivo `RTK.md` referenciado nas instruções não foi encontrado na raiz nem nas buscas locais realizadas.
