# Carteira

App web pessoal (um único usuário) para controlar cripto, ações e FIIs, com metas de alocação e planos de DCA. Interface em português do Brasil. O app nunca executa ordens nem movimenta dinheiro.

## Comandos

- `npm run dev` — app em http://localhost:5173 (`/design` mostra tokens e componentes, sem login)
- `npm run lint` · `npm run typecheck` · `npm test` — rodar os três ao fim de cada etapa
- `npm run test:db` — sobe um Postgres temporário, aplica as migrations e testa views, seed e RLS (precisa de `initdb`/`psql` instalados; não usa Docker)
- `npm run build` — build de produção com PWA

## Stack (não trocar sem perguntar)

Vite + React + TypeScript strict + Tailwind v4 + vite-plugin-pwa. Radix UI só como primitivo (dialog, popover, select, tabs); todo o visual é nosso, sem shadcn. TanStack Query, React Router, Zod. decimal.js no front e `numeric` no Postgres: nunca float para dinheiro. Supabase (Postgres, Auth por senha + link por e-mail, RLS, Edge Functions em Deno, pg_cron). Vitest. Gráficos em SVG próprio ou HTML/CSS (Recharts não é usado).

## Onde fica cada coisa

- `src/lib/calc/` — contas puras e testadas (câmbio, preço médio, simulador de aporte, DCA, agrupamento da carteira, cenário do BTC). Nenhuma conta dentro de componente.
- `src/lib/format/` — formato brasileiro (R$ 1.234,56 · 12,5%), sempre por aqui.
- `src/lib/data.ts` — única porta para o Supabase: leitura com Zod, numeric vira Decimal, escritas.
- `src/lib/live.ts` e `live-context.tsx` — preço ao vivo da Binance; as telas leem a carteira por `usePortfolio()`.
- `src/components/ui.tsx` — componentes; `src/components/BarChart.tsx` — barras de ganho ou perda em SVG próprio; `src/index.css` — tokens.
- `src/lib/calc/reconcile.ts` e `src/features/ReconcileDialog.tsx` — conferência de saldos com a corretora; `src/lib/calc/evolution.ts` e `src/routes/Evolucao.tsx` — evolução do patrimônio.
- `src/routes/` — telas; `src/features/` — formulário de lançamento e derivações de tela.
- `supabase/migrations/` — schema, RLS, views `v_positions` e `v_allocation`, seed, cron.
- `supabase/functions/` — `update-prices`, `daily-snapshot`, `asset-lookup`, `push`; lógica pura em `update-prices/quotes.ts`, `push/webpush.ts` e `push/reminder.ts` (testadas pelo Vitest).
- `src/lib/push.ts`, `src/features/ReminderForm.tsx` e `public/push-sw.js` — lembrete diário por notificação.

## Regras de negócio (cada uma tem teste)

1. Preço médio ponderado com taxas somadas ao custo. Venda e saída reduzem a quantidade e não mudam o preço médio. Zerar a posição reinicia o preço médio. `transfer_in` e `reward` (rendimento) contam como compra, `transfer_out` como venda. O custo é calculado três vezes, na moeda de cotação, em BRL e em USD, sempre convertendo cada lançamento pelo `fx_rate_to_brl` dele; "investido" em reais nunca usa o câmbio de hoje. A mesma regra existe em SQL (`avg_cost` em `v_positions`) e em TS (`computePosition`); mudar uma exige mudar a outra.
2. Cada lançamento guarda moeda original e câmbio do dia. `fx_rate_to_brl` é sempre R$ por US$ 1, mesmo em lançamento em reais. Totais usam o câmbio atual.
3. Simulador de aporte: alvo sobre (patrimônio + aporte), só ativos abaixo da meta, divisão proporcional ao que falta, nunca sugere venda, soma exatamente o aporte (centavos restantes vão para os maiores déficits).
4. DCA: valor por execução = total × % ÷ nº de execuções. Semanal = a cada 7 dias, `floor(duração / 7)` vezes. Execução não feita continua pendente e aparece em "Atrasadas". Execuções são geradas ao criar o plano.
5. Marcar execução como feita abre o formulário de compra com o valor previsto. O dono informa o total pago e a quantidade recebida, como no comprovante; o preço unitário é calculado (total ÷ quantidade), nunca digitado, e a quantidade nunca vem pré-preenchida com estimativa.
6. IR (fase 2): limites e alíquotas em tabela editável, com o aviso "confira com um contador".

## Decisões tomadas onde o pedido era ambíguo

- Saldos e preço médio nunca são digitados: vêm de `transactions`.
- Metas são gravadas em conjuntos (mesmo `valid_from`) pela função `set_targets`, que exige soma 100%. Vale o conjunto mais recente; os anteriores ficam como histórico. Metas por ativo e por classe são conjuntos independentes.
- Ativo sem meta aparece como "fora da meta" e nunca recebe sugestão de compra (caso do AVAX).
- "Pagar com": ao registrar uma compra, o app pode lançar junto a saída do caixa ou da stablecoin, para o patrimônio não contar duas vezes. `dca_plans.funding_asset_id` guarda de onde sai o dinheiro do plano.
- `prices` tem uma linha por ativo ou por par de câmbio (`fx_pair = 'USD-BRL'`). Sem cotação gravada, a view usa o preço do último lançamento (`price_origin = 'last_tx'`) e a tela avisa.
- Variação do dia = soma da variação de 24h de cada ativo; não inclui a variação do dólar.
- Preço ao vivo: `src/lib/live.ts` aplica as cotações da Binance por cima de `v_positions` e refaz a alocação com a mesma conta de `v_allocation` (mudar uma exige mudar a outra). O câmbio ao vivo é o par USDTBRL, tratando 1 USDT como US$ 1. Sem conexão, valem os preços gravados pelo servidor.
- "Gerar plano pelo que falta": o dinheiro disponível é todo o caixa (classe `cash`) mais a parte das stablecoins acima da meta delas (sem meta, conta inteira). Compra o déficit de cada ativo que não é caixa nem stablecoin, reduz na proporção se o disponível não cobrir; o que sobra fica de reserva. Execução abaixo de US$ 10 vira semanal ou compra única.
- A execução de DCA acompanha o lançamento por gatilho no banco (`sync_dca_execution`): criar o lançamento marca como feita, excluir devolve para pendente. O front não atualiza `dca_executions.status` para isso.
- Preços do servidor a cada 5 minutos, que é o que cabe nas 10.000 chamadas mensais do CoinGecko Demo. Com a aba aberta, o app relê o banco a cada minuto; os pares da Binance mudam a cada segundo.
- Ordem no preço médio: lançamentos do mesmo ativo na mesma data e no mesmo instante contam entradas antes de saídas (`v_positions`, migration `20261116000100`). Quem chama `computePosition` (TS) deve passar a mesma ordem.
- Conferir com a corretora: o dono digita a quantidade que a corretora mostra; a diferença vira `transfer_in`/`transfer_out` com preço 0 ("Ajuste de saldo conforme a corretora"), sem mexer no custo. Campo vazio = não confere (ex.: BP e CARDS ficam na Phantom).
- Evolução: um ponto por dia a partir de `snapshots` (23:55). O dono achou confuso o gráfico de duas linhas (patrimônio e custo, eixo sem zero) e escolheu em 17/11 barras de ganho ou perda por dia (valor − investido) a partir do zero: verde acima, vermelho abaixo, rótulo com sinal em cada barra. Verde e vermelho não se separam para daltonismo, então a direção da barra e o sinal carregam a informação, nunca só a cor. SVG próprio (Recharts continua fora).
- Aviso de lançamento repetido no formulário: mesmo ativo, tipo, data e quantidade de um lançamento existente.
- Investido pelo câmbio da compra (pedido do dono em 17/11): `cost_brl`/`cost_usd` em `v_positions` são históricos; `live.ts` não os reconverte. Troca entre criptos (USDT→USDC, USDC→BTC) usa o valor do dia da troca como custo novo, como a Receita trata. `recompute_snapshot_costs()` recalcula o custo de snapshots antigos. As posições de 11/11 (seed) usam câmbio 5,05 e preço de mercado do dia, não o custo real.
- Rendimentos (pedido do dono em 17/11): tipo `reward`, entrada sem custo, separado de correção. `v_positions.reward_qty` soma o recebido; a Carteira mostra "Rendimentos recebidos" a preço de hoje. Na conferência com a corretora, saldo a mais entra como rendimento por padrão.
- Lembrete diário (pedido do dono em 17/11): Web Push próprio (RFC 8291/8292, só WebCrypto). Chaves VAPID geradas pela função `push` na primeira chamada e guardadas no Vault (`store_vapid_keys`, `vapid_private_jwk` só para service_role). pg_cron `send-reminders` a cada hora; avisa quem tem `settings.reminder_hour` igual à hora de Brasília e compra pendente ou atrasada. Inscrições em `push_subscriptions` (por aparelho); 404/410 apaga. No iPhone só funciona no app da tela inicial (iOS 16.4+); a permissão é pedida no toque, com a chave pública já carregada.
- Editar plano muda só nome e origem do dinheiro. Para mudar valores, criar outro plano.
- Tabela extra `settings` (moeda principal, tema).
- Login: principal é e-mail + senha (`signInWithPassword`); a senha é definida em Ajustes (`setPassword`, com reautenticação por código se o Supabase pedir). Reserva: `signInWithOtp` com `shouldCreateUser: false` manda o link por e-mail e o dono cola o link (ou um código) no app; `parseLoginInput` (`src/lib/auth-link.ts`) tira o `token` e o app chama `verifyOtp({ token_hash, type })`. Motivo: no iPhone o link abre no Safari, que não passa a sessão para o app da tela inicial, e os modelos de e-mail do Supabase não podem ser editados sem SMTP próprio (o padrão não traz código).
- B3 só é buscada em dia útil das 10h às 18h30 de Brasília (feriados não são tratados). O câmbio USD-BRL vem do CoinGecko (bitcoin em reais ÷ bitcoin em dólares), 24 horas, na mesma chamada das cotações; brapi e AwesomeAPI são reservas.
- Número digitado: vírgula é decimal ("1.234,56"); sem vírgula, o ponto é decimal ("0.5"). Em campos de valor e preço (`parseMoneyBR`), ponto em grupos de três é milhar ("100.000" = cem mil); em quantidade, não.
- Carteira em dois níveis (`src/lib/calc/segments.ts`): Cripto (Bitcoin, Altcoins, Stablecoins), Bolsa (Ações, FIIs, ETFs) e Caixa. Bitcoin é reconhecido pelo ID do CoinGecko. As classes do banco não mudaram.
- Simulação (`src/lib/calc/scenario.ts`): cada ativo se move multiplicador × variação do BTC, com piso de −100%. Padrão: Bitcoin 1, altcoin 1,5, demais 0; o dono edita por ativo (`assets.btc_beta`). O câmbio fica fixo. A tela sempre diz que é hipótese, não previsão.

## Design (seguir à risca)

Referência: Mercury, Linear, terminal de corretora. Ferramenta de trabalho densa e sóbria.

- Fundo neutro quente (claro `#F7F6F3`, escuro `#111110`). Uma única cor de destaque: verde-petróleo (`--accent`). Alta e baixa em verde e vermelho dessaturados, sempre com sinal + ou −.
- IBM Plex Sans + IBM Plex Mono. Todo número em mono, `tabular-nums` (classe `.num`), alinhado à direita em tabelas.
- Bordas de 1px, raio de 4 a 6px, quase sem sombra. Linhas de tabela de 36px. Hierarquia por peso e cor do texto, não por caixas.
- Barra lateral estreita no desktop; barra inferior com Hoje, Carteira, DCA e Mais no celular. A tela Hoje cabe inteira no celular.
- Ícones Lucide de 16px só onde ajudam. Transições de 120 a 150ms. Estado vazio = uma frase + um botão.
- PROIBIDO: gradientes, glassmorphism, neon, emoji, ícone em círculo colorido, cards com sombra grande ou raio de 16px+, número gigante sozinho em card, pizza ou donut, animação de entrada, contador animado, textos como "Bem-vindo de volta!", "Insights" ou "Sua jornada", Inter como única fonte.
- Componente novo entra primeiro em `/design`, nos dois temas.

## Segurança

- RLS em todas as tabelas; `prices` e `snapshots` só são escritas pelas Edge Functions (service role); `targets` só pela função `set_targets`.
- Nenhuma chave de API no front nem no git. As chaves do CoinGecko e da brapi ficam em secrets das Edge Functions. O segredo do cron é gerado no banco e fica no Vault; as funções conferem por `is_cron_secret`. As variáveis `VITE_*` são públicas por natureza.
- Chamadas que usam chave (CoinGecko, brapi) são sempre pelo servidor, nunca do navegador. Cripto é identificada pelo ID do CoinGecko, nunca só pelo ticker.
- Exceção pedida pelo dono em 12/11/2026: o navegador abre um WebSocket público da Binance (sem chave) para preço ao vivo. O par (`assets.binance_symbol`, ex.: BTCUSDT) é explícito por ativo, nunca deduzido do ticker.

## Estado

MVP (etapas 1 a 6) escrito. Evolução (fase 2) feita a pedido do dono em 16/11; investido histórico, rendimentos e lembrete diário em 17/11. Fase 2 restante (Proventos, IR) e fase 3 (Binance somente leitura, importação da B3, alertas de meta) só quando o dono pedir. As pendências de publicação estão no README.
