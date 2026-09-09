# Fotos e gravação de registros — 9 de setembro de 2026

Correções implementadas no código local. Não foi publicado um novo deployment nem alteradas as regras em produção nesta execução. A validação funcional ocorreu com SDK real e regras nos emuladores; não equivale a teste da interface com a sessão do usuário no Brave.

## Diagnóstico comprovado

| Item | Evidência e conclusão |
| --- | --- |
| Produção | Projeto Vercel `fluxo_criticos`, domínio `fluxocriticos.vercel.app`, deployment consultado `dpl_BV2mjeCAwW9BYByH4pc5azUEPQm6`, estado READY. |
| Configuração cliente | O JavaScript servido em `/login` aponta para Firebase `cim-normatel-ac5b7`, bucket `cim-normatel-ac5b7.firebasestorage.app`. Project ID, authDomain, appId e sender ID coincidem com o ambiente local e com os metadados consultados. Nenhuma troca para Supabase. |
| Bucket | API Google Cloud retornou 200: bucket existente, pertencente ao número de projeto esperado, região US-EAST1. API Firebase Storage lista o mesmo bucket vinculado. |
| Faturamento | `billingEnabled: true` na API Cloud Billing. Não há evidência atual que justifique pedir ativação de cobrança. A consulta não verifica a situação de cada fatura ou limite financeiro da conta. |
| APIs | Storage, Firebase Storage, Firestore, Identity Toolkit e Secure Token constam habilitadas. |
| App Check | A listagem de serviços retornou objeto vazio, sem configuração de enforcement nessa resposta. A variável opcional de site key não está presente no `.env.local` examinado. Não foi desativada nenhuma proteção. |
| Regras | Fontes publicadas de Firestore e Storage eram idênticas às locais antes da correção. Storage usava `allow write` com `request.resource.size`; DELETE não tem `request.resource`, logo não era autorizado. |
| HTTP 402 | Não reproduzido. Início autenticado de upload resumível retornou 200 e a sessão foi cancelada com 200, sem arquivo persistido. Essa prova usou OAuth administrativo, não a sessão Firebase Auth do usuário; não demonstra que as regras aceitam aquele usuário. Não foi possível recuperar o corpo da resposta 402 histórica. |
| Consulta anônima | GET de listagem e de objeto inexistente retornou 403 com corpo `{"error":{"code":403,"message":"Permission denied."}}`. É esperado para acesso não autorizado, não prova suspensão do bucket. |
| Logs | Vercel: build concluído e amostra de runtime de 24h com respostas 200. Cloud Logging: consulta `severity>=ERROR` desde 01/09/2026 retornou sem entradas. Logs de dados podem não estar habilitados; ausência de logs não prova ausência de falhas. |
| ERR_BLOCKED_BY_CLIENT | Mensagem relatada indica bloqueio do lado do cliente, mas Brave Shields, extensão, antivírus, DNS e proxy não puderam ser discriminados sem o navegador conectado. A CSP publicada já permitia os endpoints Firestore/Storage. O projeto já forçava long polling; a configuração foi mantida, sem alegar que resolve bloqueador. |
| Caminhos de imagens temporárias | Não pertencem à aplicação. Não foram incorporados ao código. |

A exigência geral de plano Blaze para Cloud Storage está documentada pelo [Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). Isso não basta para atribuir o 402 histórico ao plano, especialmente diante de faturamento habilitado e upload de diagnóstico aceito agora. As diferenças entre detecção automática e long polling forçado estão na [referência oficial](https://firebase.google.com/docs/reference/js/firestore.firestoresettings).

## Correções

- `src/lib/upload-policy.ts`: valida MIME, extensão e tamanho (maior que zero e menor que 20 MiB); mantém os documentos já permitidos, além de JPG/PNG/WEBP/GIF; gera caminhos sem nome original ou chave de formulário; prazo de espera e classificação de falhas definitivas versus resultado incerto.
- `src/lib/attachment-upload.ts`: confirma sessão, aguarda upload resumível real e URL, cancela em falhas, tenta compensação e registra intenção de recuperação no navegador antes do upload. Exclusão exige usuário atual e caminho próprio.
- `src/app/(dashboard)/records/new/page.tsx`: trava síncrona de upload/envio, serialização dos uploads e autosaves, tratamento de erro em todos os caminhos, prazos de espera, links para anexos, remoção/substituição de arquivos e recuperação explícita. Campos não mudam durante upload/envio. Seletores são limpos para permitir selecionar o mesmo arquivo novamente após falha.
- `src/lib/forms.ts`: mensagem específica para Storage 402/faturamento/cota e conectividade; criação idempotente por ID do rascunho na mesma transação que grava número, registro e aprovação. Uma repetição concorrente não consome outro número.
- `src/proxy.ts`: remove curingas desnecessários de conexão e frame; mantém endpoints exatos de Firebase, autenticação e reCAPTCHA. CSP continua ativa.
- `storage.rules`: separa create/update de delete; upload de anexo exige conta aprovada e não visualizadora; exclusão continua restrita ao dono. Nenhum bucket foi tornado público.
- `src/types/index.ts`: caminho opcional no anexo, preservando referências legadas.
- `package.json` e testes: nova suíte de upload e integração; IDs dos emuladores alinhados e execução sequencial para não misturar regras/fixtures de suítes distintas.

O autosave agora lê o registro numa transação antes de escrever: preserva autor, data e status já confirmados; um autosave atrasado de criação não pode rebaixar um envio a rascunho. Esse caminho também deixa de depender do `setDoc` direto usado anteriormente pelo autosave, mas não elimina a necessidade de liberar os endpoints do Firebase no navegador/rede.

## Recuperação e consistência

Upload concluído é vinculado a um rascunho antes do envio definitivo. Falha da aprovação mantém um rascunho válido, com referências reais, para nova tentativa. Rejeição definitiva da gravação do anexo restaura o estado anterior e tenta remover o objeto recém-criado.

Timeout não cancela uma transação Firebase e não significa rollback. Nesse caso o objeto é preservado: apagar imediatamente poderia quebrar um registro confirmado cujo reconhecimento se perdeu. O rascunho local e as chaves `edibh_upload_<uid>_<id>` permitem reconciliar depois. Em **Registros → Novo** ou no registro afetado em edição, clique **Recuperar arquivos pendentes**. A recuperação lê o servidor, mantém arquivos referenciados, sincroniza referências locais pendentes ou exclui arquivos sem referência. Se a conexão/permissão falhar, conserva a intenção para nova tentativa.

Não limpe os dados do navegador enquanto houver recuperação pendente. Esse mecanismo é local ao navegador/usuário; não é um serviço de coleta global de órfãos entre dispositivos. Referências de outros autores são apenas desvinculadas, sem excluir seus objetos.

## Testes executados

| Teste solicitado | Resultado |
| --- | --- |
| Login real do usuário | Pendente: nenhum navegador conectado e nenhuma sessão do usuário disponibilizada. Autorização testada com identidades emuladas; testes existentes do limitador de login passaram. |
| Registro sem foto | Passou no emulador com helper real. |
| JPG, PNG e WEBP | Passaram upload/URL/gravação/releitura/download/exclusão nos emuladores. Fixtures exercitam transporte e metadados, não decodificação visual da imagem. |
| Arquivo inválido, vazio e acima do limite | Passaram testes de validação; MIME proibido também rejeitado pelas regras. |
| Upload interrompido | Cancelamento e compensação exercitados com falha simulada; interrupção física da rede no navegador ainda pendente. |
| Falha Storage e obtenção de URL | Passaram testes com SDK simulado; listener finalizado e compensação verificados. |
| Falha Firestore após upload | Passou integração: registro rejeitado não existe e objeto é excluído na compensação. |
| Atualização de página | Releitura no servidor passou; recarga visual e recuperação pela interface ainda pendentes. |
| Visualização/download | Download de bytes passou; link adicionado; renderização visual no navegador pendente. |
| Exclusão | Passou para dono; negada para outro usuário e anônimo. |
| Duplo envio | Criação concorrente com mesmo ID retorna um único número nos emuladores. |
| Brave Shields ativo/inativo, privada, Chrome/Edge sem extensões | Não executados: runtime de Browser listou zero navegadores. Para conectar Chrome/Edge, instalar a extensão em Settings → Computer use. |
| Local/Vercel | SDK local/emuladores testados; produção consultada por HTTP/API e logs. Fluxo autenticado na interface Vercel pendente. |
| TypeScript, lint, build | Passaram. O primeiro build foi impedido pela rede ao baixar Inter; a execução com acesso à rede passou. |
| Console/Network | Respostas HTTP e logs descritos acima; console e Network da sessão Brave não acessíveis. |

**77 testes passaram:** 39 de regras/integração, 15 de upload e 23 existentes (e-mail, segurança, URLs e numeração). Avisos do Node sobre APIs experimentais dos testes e tipo de módulo não são falhas. Erros PERMISSION_DENIED em testes negativos são esperados.

Comandos:

```powershell
npm run typecheck
npm run lint
npm run test:upload
npm run test:rules
npm run build
```

Os emuladores exigem Java 21+. Nesta máquina foi preparado um runtime portátil em `recovery/java21`; o Java do sistema não foi substituído:

```powershell
$env:JAVA_HOME = (Resolve-Path 'recovery/java21/jdk-21.0.12.1+1-jre').Path
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
npm run test:rules
```

## Publicação e variáveis

No projeto Vercel **fluxo_criticos → Settings → Environment Variables**, conferir para Production e Preview os nomes abaixo, sem copiar credenciais administrativas para variáveis públicas:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY  (opcional; somente se App Check estiver configurado)
NEXT_PUBLIC_SITE_URL                    (se houver domínio personalizado)
```

Os seis nomes legados `FIREBASE_*` equivalentes já são aceitos pelo `next.config.ts`; nenhuma variável nova obrigatória foi introduzida. Não definir publicamente service account ou chaves Firebase Admin. Variáveis já usadas por e-mail e rate limiting devem ser preservadas.

1. Revisar o diff e executar os comandos acima.
2. Publicar as regras corrigidas: `npx firebase deploy --only storage --project cim-normatel-ac5b7`. Firestore rules não mudaram. Confirmar em **Firebase Console → projeto → Storage → Rules** que create/update e delete estão separados.
3. Publicar a revisão pelo fluxo Git/Vercel existente. As configurações Firebase são inseridas no build: alteração de variável exige novo deployment.
4. Conferir **Vercel → fluxo_criticos → Deployments → deployment → Build Logs/Runtime Logs** e testar primeiro com uma conta aprovada de teste.
5. Repetir JPG/PNG/WEBP, sem foto, inválido, acima de 20 MiB, interrupção, reload, download, remoção e tentativa dupla no local e na URL publicada. Confirmar que o registro só recebe confirmação depois da gravação e que seu status não volta a rascunho.

## Se o 402 reaparecer

Não alterar billing por suposição: hoje está habilitado e a sessão resumível de diagnóstico foi aceita.

1. **Brave → F12 → Network → Preserve log → requisição `firebasestorage.googleapis.com` → Response**: registrar status, corpo completo, horário e nome do bucket. Não compartilhar Authorization, cookies nem URLs com tokens de download.
2. **Firebase Console → CIM-Normatel → Usage and billing → Details & settings**: conferir plano Blaze. Se estiver Spark e o corpo indicar necessidade de cobrança, o proprietário deve aprovar e vincular uma conta de faturamento válida.
3. **Google Cloud Console → selecionar CIM-Normatel → Billing → Account management/Payment overview**: verificar vínculo, suspensão e problema de pagamento apontado pela resposta.
4. **Firebase → Build → Storage → Files**: confirmar o bucket exato. **Google Cloud → Cloud Storage → Buckets** confirma existência; **APIs & Services → Enabled APIs & services → Cloud Storage/Firebase Storage → Quotas & System Limits** permite investigar cota, quando aplicável.
5. Repetir com usuário autenticado e aprovado. Confirmar início/finalização 200, URL obtida e gravação no Firestore. Um 403 deve ser investigado como autorização/regras/App Check, não reinterpretado como 402.

## Se o Brave continuar bloqueando

Testar a mesma conta e arquivo: Shields ativo; depois clicar no leão e desativar Shields **somente para esse site**; janela privada; Chrome/Edge sem extensões. Comparar Network/Console. Se só mudar com Shields, restaurar proteções e ajustar a exceção necessária para o site. Se persistir em todos, investigar extensões, antivírus, DNS e proxy. Não desativar proteção globalmente.

Domínios essenciais: `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `firestore.googleapis.com`, `firebasestorage.googleapis.com`; App Check/reCAPTCHA apenas se configurados. Bloqueio CSP aparece explicitamente no Console; `ERR_BLOCKED_BY_CLIENT` sozinho não identifica qual componente bloqueou a chamada.

## Backup

Repositório estava sem alterações no início, no commit `7e33b4011575d481fca092f794b2be7d17273672`. Cópias dos arquivos principais anteriores estão em `recovery/upload-fix-before`, com extensão `.bak` para não entrarem na compilação. O diretório recovery é ignorado pelo Git. `RTK.md` referenciado pelas instruções não foi encontrado na raiz nem nos diretórios superiores consultados.

Verificação final adicional: a API de configuração da Web App retornou 200; API key pública, authDomain, projectId, storageBucket, messagingSenderId e appId coincidem com os valores locais. Somente o resultado da comparação foi impresso.

Ocorrência de diagnóstico: `firebase login:list --json` retornou tokens da sessão CLI na saída da ferramenta. Esses valores não foram incorporados ao código ou a este relatório. Renove/revogue essa sessão no ambiente local (`firebase logout`, seguido de `firebase login`) e, se necessário, revise o acesso do Firebase CLI na segurança da Conta Google. Não compartilhe a saída bruta desse comando.
