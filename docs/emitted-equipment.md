# Equipamentos emitidos — acompanhamento mensal

Seção do Dashboard: `src/components/dashboard/emitted-equipment-section.tsx`.
Regras de cálculo (puras e testadas): `src/lib/emitted-equipment.ts`.

## Regra de contabilização

O sistema **não possui um campo específico de "data de emissão"**. A regra abaixo foi inferida do fluxo existente e precisa ser confirmada pelo negócio:

- **Evento de emissão** = um registro (fluxo) enviado. O número `NNN/AAAA` só é atribuído no envio.
- **Conta eventos, não equipamentos únicos.** O mesmo equipamento com dois fluxos conta 2 (o card "Total" mostra também quantos equipamentos distintos há).
- **Fora da contagem:** `rascunho`, `rejeitado` (mesma regra do card "Total" já existente) e registros removidos (`deletedAt`).
- **Data usada:** campo do tipo `data` do formulário (`recordDateKey`, a mesma data usada pelos demais gráficos do Dashboard); `createdAt` só como fallback legado. É uma data de calendário (`AAAA-MM-DD`), então não há deslocamento de fuso no agrupamento mensal.

Cards, gráfico e tabela usam as mesmas funções, portanto os totais coincidem.

## Indicadores

- Total no período selecionado (ano + mês, ou "Todos os meses").
- Emitidos no mês atual (mês corrente real).
- Emitidos no ano selecionado.
- Variação mensal: mês atual vs. anterior (janeiro compara com dezembro do ano anterior). Mês anterior zerado → "Novo" (ou "0%" se ambos zero), sem divisão por zero.

## Escopo e permissões

A seção recebe os registros já carregados pelo Dashboard (mesma query, mesmas regras do Firestore) e respeita os filtros do Dashboard exceto ano/mês/período, que ela controla. Nenhuma query, endpoint ou escrita nova.

## Limitação conhecida (desempenho)

O backend é o Firestore acessado direto do navegador, sem servidor próprio; o Dashboard já carrega todos os registros por `onSnapshot`. A agregação é feita em memória sobre esse conjunto (memoizada, paginação de 10 linhas). Agregação no servidor/índices exigiria um backend (Cloud Functions ou Admin SDK) ou contadores mensais materializados — não implementado.

## Testes

- `npm run test:emitted` — regras (8 testes de unidade).
- `npx playwright test --config tests/dashboard.playwright.config.ts` — Dashboard real com Firebase falso (requer `npm run build` antes).
