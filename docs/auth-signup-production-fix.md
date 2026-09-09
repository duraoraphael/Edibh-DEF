# Login e cadastro: correção publicada em 9 de setembro de 2026

Aplicação publicada em https://fluxocriticos.vercel.app, implantação Vercel `dpl_36CwDQc7PzBR7hntF1snhzjdftTu`, estado READY. Regras Firestore publicadas no projeto `cim-normatel-ac5b7`. Fluxos reais validados com contas descartáveis no Chrome e Brave. Este documento substitui o diagnóstico de autenticação do relatório anterior; os achados anteriores sobre edição de registros continuam documentados nele.

## Causas comprovadas e limites

**Cadastro:** Authentication e perfil Firestore são operações separadas. O fluxo podia criar a conta sem concluir o perfil, não oferecia reparo e convertia falhas em mensagem genérica. A auditoria desta execução encontrou 22 contas Auth e 19 perfis: três UIDs sem documento. Repetir cadastro de uma conta existente produz `auth/email-already-in-use`; autenticar essa conta pode funcionar e a etapa seguinte falhar pela ausência do perfil. Reproduzimos esse estado em integração e produção com uma conta descartável. Não há evidência suficiente para atribuir a ausência dos três documentos reais a uma tentativa histórica específica: a consulta anterior tinha 22 perfis.

Também foi observado HTTP 429 em `/api/auth/abuse-check` nos logs Vercel. Esse bloqueio legítimo de tentativas era escondido pela mensagem genérica de cadastro. Os limites continuam ativos e agora a interface diferencia bloqueio temporário de falha de autenticação ou perfil.

**Login:** `/api/auth/login-check` autenticava a senha no servidor e o cliente autenticava novamente no Firebase. Respostas diferentes eram convertidas em credenciais inválidas, inclusive falhas que não demonstravam senha incorreta. Agora a rota verifica origem, entrada e limite de tentativas; somente o SDK faz a autenticação. A senha não é enviada à rota. O serviço distingue `auth.signInWithEmailAndPassword` de `firestore.users.ensureProfile`; perfil ausente é reconstruído com privilégios mínimos, e perfil incompleto é preservado e encaminhado para reparo administrativo. A interface não considera ausência de aprovação uma senha inválida.

Não foi recuperado o código Firebase da tentativa histórica do usuário, descartado pela implementação antiga. Não afirmamos que sua senha estava certa ou errada. As causas acima são defeitos comprovados, estados observados e reproduções controladas, não uma reconstrução especulativa dos eventos.

**Domínio:** `fluxocriticos.vercel.app` não constava nos Authorized domains. Foi acrescentado preservando os domínios existentes, e a recuperação agora usa `https://fluxocriticos.vercel.app/login` como URL de retorno. Isso corrige a configuração da recuperação; não prova que o domínio ausente causava todo login por senha.

## Código e regras

| Arquivo | Alteração |
| --- | --- |
| `src/lib/user-profile.ts` | Contrato único de perfil inicial e transação idempotente: cria somente documento ausente do próprio UID, nunca sobrescreve cargo/aprovação existentes. |
| `src/lib/auth-service.ts` | Serviços de cadastro, login, recuperação e reparo com etapas identificadas, e-mail normalizado e prazo de conclusão. Perfil é criado antes da atualização opcional do display name. |
| `src/lib/auth-context.tsx` | Bloqueio de operação simultânea, espera do perfil antes do redirecionamento, limpeza de assinatura/estado por UID, prazo para leitura e auditoria sem travar login/logout. |
| `src/lib/auth-errors.ts` | Mensagens específicas e seguras para código Firebase, indisponibilidade, limite, rede, perfil incompleto e permissão. Logs técnicos contêm etapa/código, sem senha ou token. |
| `src/app/api/auth/login-check/route.ts` | Uma autenticação SDK por tentativa; gate mantém origem e limites: 30 tentativas/IP e 10/conta por 15 minutos, incluindo sucessos. Falha do limitador retorna 503; bloqueio retorna 429. |
| Páginas de login, cadastro e recuperação | Normalização, validação, bloqueio síncrono de envio duplicado e mensagens reais; alterações da primeira execução preservadas. |
| `src/lib/access-policy.ts`, layout do Dashboard | Validação de perfil/UID/e-mail/cargo; pendentes aguardam aprovação; perfil ausente pode ser recuperado. Visualizador permanece limitado a Dashboard e Histórico. |
| `src/types/index.ts`, página de usuários | Campos `uid` e `approved`; alterações administrativas mantêm `status` e `approved` consistentes, inclusive perfis legados. |
| `firestore.rules` | Criação do próprio perfil com UID correspondente, visualizador, pendente, approved false e timestamp do servidor para o contrato novo. Cliente não muda UID/cargo/aprovação. Atualização administrativa valida UID imutável e consistência status/approved. |
| `scripts/repair-auth-profiles.mjs` | Auditoria por padrão; reparo de ausentes com precondição `exists:false`, sem sobrescrever dados. Casos ambíguos exigem revisão. |
| Testes, `firebase.json`, `package.json` | Emulador Auth/Firestore/Storage, regressões reais do serviço, regras e rotas; testes de produção optativos. |
| `.vercelignore` | Exclui ambientes, credenciais locais, recuperação, logs, testes e caches do upload Vercel. |

O perfil novo contém `uid`, `name`, `email` normalizado, `role: visualizador`, `status: pendente`, `approved: false`, `createdAt` e `lastActive` com timestamp servidor. `status` continua sendo o campo de autorização; `approved` o acompanha. Compatibilidade com perfis/clientes legados sem os campos novos foi mantida. As regras não foram abertas ao público. Storage e funcionalidades de anexos existentes foram preservados.

## Contas reconciliadas

Foram criados exclusivamente os três documentos ausentes, como visualizadores pendentes, sem modificar Authentication, senhas ou documentos existentes:

- `HMRYpC1VgNXpq3ZsjycPOLyE0q33`
- `q0qw3fN09FVmaxNajg9LJ9zY6ko1`
- `uk5o9IkoCMgUPK4giPX051xyAqC3`

A auditoria final, após a limpeza dos testes, retornou listas vazias para perfis ausentes, perfis sem Auth, perfis incompletos e divergências do campo UID. Não foram encontrados e-mails duplicados ou contas desativadas no inventário inicial desta execução.

**Ação administrativa:** em Firebase Console → Authentication → Users, localizar cada UID acima e confirmar a identidade. No aplicativo → Usuários, atribuir o cargo autorizado e aprovar a conta. O reparo não presume qual cargo anterior era correto. Nenhuma outra conta real foi excluída ou teve a senha alterada.

Para auditar novamente: `node scripts/repair-auth-profiles.mjs`. O comando somente lê por padrão e salva o plano em `recovery/auth-repair`, ignorado pelo Git. `--apply-missing` cria apenas perfis ausentes verificados; não executa migração destrutiva. Se aparecer perfil com ID de e-mail, UID divergente ou perfil incompleto, revisar o UID no Authentication, preservar cópia do documento e referências antes de qualquer migração; não recriar Authentication nem excluir o documento automaticamente.

## Configurações verificadas

- Firebase esperado: `cim-normatel-ac5b7`; seis valores públicos do bundle comparados com a configuração local. Não há configuração concorrente encontrada. Inicialização SDK usa app compartilhado.
- Email/senha habilitado; Cloud Billing retornou `billingEnabled: true`. As APIs Auth e Firestore responderam às operações reais. Não foi necessária alteração de plano.
- Authorized domains contém localhost, domínios Firebase existentes e agora `fluxocriticos.vercel.app`. URLs arbitrárias de Preview não foram autorizadas em massa.
- Seis `NEXT_PUBLIC_FIREBASE_*`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` e `RATE_LIMIT_HASH_SECRET` existem na Vercel para Production e Preview. Development utiliza `.env.local`; esses nomes não estavam associados ao ambiente Development remoto. Não é necessário mudá-lo para o site publicado funcionar. Para usar `vercel env pull` no futuro, configurar Development em Vercel → projeto fluxo_criticos → Settings → Environment Variables, usando os mesmos valores locais autorizados, mantendo segredos somente no servidor.
- O deploy CLI executou novo build e ativou o alias de produção. Testes reais passaram nessa publicação.
- CSP permite os endpoints Firebase necessários; não foi comprovado bloqueio de CSP ou App Check. Consulta App Check não retornou serviços e não há site key opcional na configuração local examinada. Nenhuma proteção foi desativada.
- `experimentalForceLongPolling: true` já existia em `src/lib/firebase.ts`; não foi introduzido como correção especulativa nesta execução.
- O arquivo temporário de imagem ausente não pertence ao site e não foi incorporado ao projeto.

## Evidências de teste

| Verificação | Resultado |
| --- | --- |
| `npm run test:rules` | 62 testes passaram: regras Firestore/Storage, Auth SDK e integração real dos serviços com emuladores. |
| `npm run test:auth` | 9 passaram: classificação de erros e gate de login, incluindo 429/503 e ausência de segunda autenticação. |
| `npm run test:upload` | 15 passaram. |
| Suites de segurança, e-mail, numeração, URL de anexo e XSS | 23 passaram. Total Node nesta execução: 109. |
| TypeScript, lint, build | Passaram; build Vercel também passou. |
| Playwright local Chromium | 4 passaram. |
| Chrome produção, contexto isolado sem extensões do usuário | Fluxo completo passou em 44,2 s. |
| Brave produção, contexto isolado | Fluxo passou em 21,5 s; cadastro duplicado foi omitido nesta repetição, já comprovado no Chrome, para respeitar o limite de cadastro por IP. |

O teste de produção verificou cadastro e documento efetivamente persistido, UID/cargo/status/approved/timestamp, sessão após recarga, logout, senha incorreta, login correto pendente, recuperação de senha, reparo após exclusão apenas do perfil descartável, aprovação administrativa do UID descartável e Dashboard após recarga. No Chrome também validou cadastro repetido. Contagem Network: uma chamada Firebase por tentativa de login; três tentativas por execução bem-sucedida. Nenhuma exceção `pageerror` nos fluxos aprovados. Respostas negativas intencionais, como senha errada, não são tratadas como console limpo.

Usuário desativado, sessão revogada/renovação do token, perfil sem Authentication, tentativa de autoaprovação, UID incorreto e preservação de perfil aprovado/incompleto foram cobertos nos emuladores; não foram simulados em contas reais.

A primeira execução Brave passou pelo cadastro e verificação do perfil, mas a asserção após recarga excedeu cinco segundos. A espera de asserção foi ajustada para 35 segundos, compatível com o prazo de 25 segundos da aplicação; a repetição passou. Não foi necessário mudar código de produção por esse resultado.

UIDs descartáveis removidos após confirmar a identidade exata: `HjwzPShcv4V4AoTQdgJsR923FuJ2` (sonda inicial), `Wl4VKucLbVRALtZLFT6MowSTnCI2` (Chrome), `1CsN5Qt8vKWyJq1xW9FRPonCUTR2` (primeira execução Brave), `VlGs15QbN5QFAZjLjLvGdcnEF3f2` (Brave aprovado). A limpeza dos testes de interface removeu somente os perfis, contas e logs vinculados ao respectivo UID descartável.

### Limites de validação ainda existentes

- Brave foi testado em contexto automatizado limpo. Não foi comprovado o estado dos Shields nem feita a comparação explícita ligado/desligado apenas para o domínio. A sessão afetada do usuário não estava conectada ao runtime de Browser; suas extensões e o `ERR_BLOCKED_BY_CLIENT` histórico não foram reproduzidos. Não considerar essa parte da matriz concluída.
- Os contextos isolados não reutilizam a sessão do usuário; não equivalem a comprovar manualmente a janela anônima do perfil afetado.
- Recuperação em produção teve requisição aceita e confirmação na interface; a conta de teste usa `example.invalid`, portanto não houve verificação de entrega em caixa postal nem abertura do link real. O emulador comprovou emissão de código de recuperação. Para validar entrega, usar uma caixa controlada pelo responsável em Esqueci minha senha e abrir o link recebido.

Para completar a comparação no Brave do usuário: no domínio de produção, testar login de uma conta autorizada com Shields ativo; depois usar o ícone do leão e desativar somente para esse site, repetir e restaurar o estado anterior. Se falhar, registrar host/caminho bloqueado e código técnico da etapa, sem copiar senhas, tokens ou corpos de autenticação.

## Publicação e continuidade

Já executado: `firebase deploy --only firestore:rules --project cim-normatel-ac5b7` e deploy CLI Vercel de produção. Não há publicação pendente para estas correções. A implantação anterior era `dpl_BV2mjeCAwW9BYByH4pc5azUEPQm6`.

Os arquivos locais ainda não foram commitados nem enviados ao Git. Registrar as alterações revisadas no repositório antes de um futuro deploy por Git, para que ele não publique o código anterior. Não sobrescrever as outras alterações preexistentes do workspace.

Para repetir: executar typecheck, lint, testes e build; publicar as regras se houver alterações; executar `npx vercel deploy --prod` no projeto vinculado e aguardar READY. O teste optativo é `npx playwright test --config scripts/auth-live.config.mjs`; usa a sessão administrativa Firebase CLI, cria conta descartável e limpa somente o UID confirmado. Para Brave, definir `AUTH_TEST_BROWSER=brave`. Respeitar os limites reais de cadastro; `AUTH_TEST_SKIP_DUPLICATE=1` omite somente a repetição de e-mail já testada. Não remover limitadores para repetir testes.
