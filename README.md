# Carteira

App web pessoal, instalável no celular (PWA), para acompanhar cripto, ações e FIIs numa carteira só: o que comprar hoje, a distância de cada ativo até a meta e quanto rendeu.

## Rodar no computador

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

Abra http://localhost:5173. A página `/design` mostra todos os componentes nos temas claro e escuro e não precisa de login.

Verificações: `npm run lint`, `npm run typecheck`, `npm test` e `npm run test:db` (testa o banco num Postgres temporário, sem Docker).

## Configurar o Supabase

1. Crie um projeto novo no Supabase, separado dos outros.
2. Aplique as migrations com a CLI:
   ```bash
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   ```
   A migration `..._cron.sql` precisa da URL do projeto no Vault. Rode antes, no SQL Editor:
   ```sql
   select vault.create_secret('https://SEU_REF.supabase.co', 'project_url');
   ```
   O segredo que autentica o cron é gerado pela própria migration e fica só no banco.
3. Grave as chaves das APIs como secrets das funções (nunca no `.env` do front) e publique as funções:
   ```bash
   npx supabase secrets set COINGECKO_API_KEY=... BRAPI_TOKEN=...
   npx supabase functions deploy update-prices daily-snapshot asset-lookup
   ```
4. Em Authentication > URL Configuration, coloque a URL do app (a da Vercel e `http://localhost:5173`) em Site URL e Redirect URLs.
5. Entre no app com seu e-mail (link mágico). Na tela Hoje, toque em "Carregar minha carteira de 11/11/2026".
6. Depois do primeiro login, desative novos cadastros em Authentication > Sign In / Providers, para o app ficar só seu.
7. Em Ajustes > Ativos, confira os IDs do CoinGecko de BP (`backpack`) e CARDS (`collector-crypt`): foram preenchidos sem consulta à API e precisam de confirmação.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` compila e publica a cada push.

1. Em Settings > Pages, troque **Source** para **GitHub Actions**.
2. Em Settings > Secrets and variables > Actions > aba **Variables**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (valores públicos do projeto Supabase).
3. No Supabase, em Authentication > URL Configuration, inclua `https://SEU_USUARIO.github.io/NassaCapital/`.

O site do Pages é público, mas só mostra a tela de login: os dados ficam no Supabase, protegidos por RLS.

## Publicar na Vercel

Importe o repositório na Vercel (framework Vite), defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente e publique. Para o link mágico e as rotas funcionarem ao recarregar a página, o `vercel.json` já redireciona tudo para `index.html`.

No celular, abra o endereço e use "Adicionar à tela de início".

## Como os preços chegam

O pg_cron chama a função `update-prices` a cada 5 minutos. Ela busca cripto e o dólar no CoinGecko (o dia todo) e B3 na brapi (só em horário de pregão) e grava em `prices`. Se uma fonte falha ou devolve limite (429), o último preço bom continua valendo. Uma vez por dia, `daily-snapshot` grava o patrimônio por classe em `snapshots`.

Os ativos com par na Binance (campo "Par na Binance" em Ajustes) acompanham o preço de mercado em tempo real: o navegador abre o canal público de cotações da Binance, que não usa chave. As chaves do CoinGecko e da brapi nunca vão para o navegador.
