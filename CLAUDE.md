# Carteira

App web pessoal (um único usuário) para controlar cripto, ações e FIIs, com metas de alocação e planos de DCA. Interface em português do Brasil. O app nunca executa ordens nem movimenta dinheiro.

## Comandos

- `npm run dev` — app em http://localhost:5173 (`/design` mostra tokens e componentes, sem login)
- `npm run lint` · `npm run typecheck` · `npm test` — rodar os três ao fim de cada etapa
- `npm run test:db` — sobe um Postgres temporário, aplica as migrations e testa views, seed e RLS (precisa de `initdb`/`psql` instalados; não usa Docker)
- `npm run build` — build de produção com PWA

## Stack (não trocar sem perguntar)

Vite + React + TypeScript strict + Tailwind v4 + vite-plugin-pwa. Radix UI só como primitivo (dialog, popover, select, tabs); todo o visual é nosso, sem shadcn. TanStack Query, React Router, Zod. decimal.js no front e `numeric` no Postgres: nunca float para dinheiro. Supabase (Postgres, Auth por magic link, RLS, Edge Functions em Deno, pg_cron). Vitest. Recharts entra na fase 2 (gráfico de evolução); no MVP as barras são HTML/CSS.

## Onde fica cada coisa

- `src/lib/calc/` — contas puras e testadas (câmbio, preço médio, simulador de aporte, DCA). Nenhuma conta dentro de componente.
- `src/lib/format/` — formato brasileiro (R$ 1.234,56 · 12,5%), sempre por aqui.
- `src/lib/data.ts` — única porta para o Supabase: leitura com Zod, numeric vira Decimal, escritas.
- `src/lib/live.ts` e `live-context.tsx` — preço ao vivo da Binance; as telas leem a carteira por `usePortfolio()`.
- `src/components/ui.tsx` — componentes; `src/index.css` — tokens.
- `src/routes/` — telas; `src/features/` — formulário de lançamento e derivações de tela.
- `supabase/migrations/` — schema, RLS, views `v_positions` e `v_allocation`, seed, cron.
- `supabase/functions/` — `update-prices`, `daily-snapshot`, `asset-lookup`; lógica pura em `update-prices/quotes.ts` (testada pelo Vitest).

## Regras de negócio (cada uma tem teste)

1. Preço médio ponderado com taxas somadas ao custo. Venda e saída reduzem a quantidade e não mudam o preço médio. Zerar a posição reinicia o preço médio. `transfer_in` conta como compra, `transfer_out` como venda. A mesma regra existe em SQL (`avg_cost`) e em TS (`computePosition`); mudar uma exige mudar a outra.
2. Cada lançamento guarda moeda original e câmbio do dia. `fx_rate_to_brl` é sempre R$ por US$ 1, mesmo em lançamento em reais. Totais usam o câmbio atual.
3. Simulador de aporte: alvo sobre (patrimônio + aporte), só ativos abaixo da meta, divisão proporcional ao que falta, nunca sugere venda, soma exatamente o aporte (centavos restantes vão para os maiores déficits).
4. DCA: valor por execução = total × % ÷ nº de execuções. Semanal = a cada 7 dias, `floor(duração / 7)` vezes. Execução não feita continua pendente e aparece em "Atrasadas". Execuções são geradas ao criar o plano.
5. Marcar execução como feita abre o formulário de compra preenchido; o dono confirma ou corrige.
6. IR (fase 2): limites e alíquotas em tabela editável, com o aviso "confira com um contador".

## Decisões tomadas onde o pedido era ambíguo

- Saldos e preço médio nunca são digitados: vêm de `transactions`.
- Metas são gravadas em conjuntos (mesmo `valid_from`) pela função `set_targets`, que exige soma 100%. Vale o conjunto mais recente; os anteriores ficam como histórico. Metas por ativo e por classe são conjuntos independentes.
- Ativo sem meta aparece como "fora da meta" e nunca recebe sugestão de compra (caso do AVAX).
- "Pagar com": ao registrar uma compra, o app pode lançar junto a saída do caixa ou da stablecoin, para o patrimônio não contar duas vezes. `dca_plans.funding_asset_id` guarda de onde sai o dinheiro do plano.
- `prices` tem uma linha por ativo ou por par de câmbio (`fx_pair = 'USD-BRL'`). Sem cotação gravada, a view usa o preço do último lançamento (`price_origin = 'last_tx'`) e a tela avisa.
- Variação do dia = soma da variação de 24h de cada ativo; não inclui a variação do dólar.
- Preço ao vivo: `src/lib/live.ts` aplica as cotações da Binance por cima de `v_positions` e refaz a alocação com a mesma conta de `v_allocation` (mudar uma exige mudar a outra). O câmbio ao vivo é o par USDTBRL, tratando 1 USDT como US$ 1. Sem conexão, valem os preços gravados pelo servidor.
- "Gerar plano pelo que falta": usa o caixa (classe `cash`), compra o déficit inteiro de cada ativo que não é caixa nem stablecoin, reduz na proporção se o caixa não cobrir; o que sobra fica de reserva. Execução abaixo de US$ 10 vira semanal ou compra única.
- Editar plano muda só nome e origem do dinheiro. Para mudar valores, criar outro plano.
- Tabela extra `settings` (moeda principal, tema).
- B3 só é buscada em dia útil das 10h às 18h30 de Brasília (feriados não são tratados). O câmbio USD-BRL vem do CoinGecko (bitcoin em reais ÷ bitcoin em dólares), 24 horas, na mesma chamada das cotações; brapi e AwesomeAPI são reservas.
- Número digitado: vírgula é decimal ("1.234,56"); sem vírgula, o ponto é decimal ("0.5").

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

MVP (etapas 1 a 6) escrito. Fase 2 (Proventos, Evolução, IR) e fase 3 (Binance somente leitura, importação da B3, alertas) só quando o dono pedir. As pendências de publicação estão no README.
