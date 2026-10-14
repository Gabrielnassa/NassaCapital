# Meu DCA

Web app estático para acompanhar um **DCA semanal em cripto**, a **reserva de emergência** e uma **meta de compra** (lataria do carro). É feito só com HTML, CSS e JavaScript puro, sem framework, sem build e sem backend. Foi pensado para o iPhone e tem tema claro/escuro automático.

## O que o app faz

| Aba | Para que serve |
| --- | --- |
| **Início** | Valor total em US$ e R$, valor investido, resultado %, data da próxima compra (toda segunda, a partir da data de início), gráfico de rosca com % atual × % alvo e a lista de ativos com quantidade, preço atual, preço médio, resultado e desvio do alvo. O desvio aparece como "no alvo" se estiver dentro de ±2 p.p. e fica vermelho acima de ±10 p.p. |
| **Comprar** | Registra a compra da semana com a data, a cotação do dólar (já preenchida) e, para cada ativo com alvo > 0, o valor em US$ e o preço pago (já preenchido com o preço atual). A quantidade é calculada sozinha. O botão **Sugerir divisão** divide o aporte semanal entre os ativos *abaixo* do alvo, proporcional ao déficit, sem vender nada. |
| **Reserva** | Saldo da reserva de emergência, barra até a meta, quantos meses de gastos ela cobre, previsão de quando fecha e quanto guardar por mês. Registra depósitos e retiradas (com descrição opcional), corrige o saldo quando ele diverge do banco e mantém o histórico de movimentações. Excluir uma movimentação corrige o saldo. |
| **Metas** | Barras de progresso da reserva e da lataria com previsão do mês em que cada meta fecha. Você **lança entradas e saídas** em cada meta e o app soma sozinho no saldo. O botão **Lançar sobra** distribui a sobra do mês entre reserva e lataria de uma vez. Há também o fluxo do mês, a correção manual de saldos (registrada como ajuste) e a lista de lançamentos. |
| **Histórico** | Lista das compras (da mais nova para a mais antiga), com botão de excluir e exportação em CSV para o Imposto de Renda. |
| **Ajustes** | Aporte semanal, data da 1ª compra, alocação alvo (precisa somar 100%), renda, gastos, metas, % da sobra para a reserva, posição inicial de cada ativo, backup e "apagar tudo". |

### Ativos e preços

BTC, ETH, SOL, RENDER e AVAX. Os preços vêm da API pública da [CoinGecko](https://www.coingecko.com/) (`/api/v3/simple/price`). A cotação USD/BRL é o preço do BTC em BRL dividido pelo preço em USD. Se a API falhar, o app usa os últimos preços salvos e mostra a data/hora deles.

Alocação alvo padrão: BTC 50%, ETH 25%, SOL 15%, RENDER 10%, AVAX 0%. Alvo 0% quer dizer "fora do plano, não comprar mais".

### Cálculos

- Quantidade total = posição inicial + soma das compras
- Custo total = custo inicial + soma dos valores comprados
- Preço médio = custo ÷ quantidade
- Déficit (Sugerir divisão) = alvo% × (total atual + aporte) − valor atual. O arredondamento é feito em centavos e mantém o total exato.
- Sobra do mês = renda − gastos − (aporte semanal × dólar × 52 ÷ 12). Enquanto a reserva não fecha, X% da sobra vai para ela e o resto para a lataria. Depois, toda a sobra vai para a lataria.

### CSV para o IR

Separador `;`, vírgula decimal e BOM (abre direto no Excel em português). Colunas: `data;ativo;valor_usd;preco_usd;quantidade;dolar_brl;valor_brl`.

## Privacidade

- **Este repositório é público e não contém nenhum dado pessoal.** O código traz apenas valores padrão genéricos.
- Todos os dados (plano, compras, metas) ficam **somente no `localStorage` do seu navegador**. Nada é enviado a nenhum servidor. A única chamada externa é a consulta de preços na CoinGecko, que não leva nenhum dado seu.
- Para carregar o seu plano, use **Ajustes → Importar backup** com o seu arquivo JSON (por exemplo `meu-plano.json`). **Não suba esse arquivo para o GitHub.** O `.gitignore` já ignora `meu-plano.json` e `*-backup*.json` por segurança.
- Também dá para carregar o plano por um **link de importação**: `https://<site>/#importar=<JSON em base64url>`. O que vem depois de `#` fica só no seu aparelho: o navegador não envia esse trecho ao servidor e ele não fica no GitHub. Cada link é importado uma vez por navegador. Se você adicionar a página à tela de início com o link aberto, o app instalado também importa o plano na primeira vez que abrir. Guarde esse link como guardaria o arquivo de backup.
- Exporte um backup de vez em quando. Limpar os dados do Safari apaga os dados do app.

### Formato do backup

```json
{
  "config": { "weeklyUSD": 50, "startDate": "2026-01-05",
              "targets": { "BTC": 50, "ETH": 25, "SOL": 15, "RENDER": 10, "AVAX": 0 },
              "renda": 0, "gastos": 0, "metaReserva": 0, "metaLataria": 0, "split": 50 },
  "initial": { "BTC": { "qty": 0, "cost": 0 } },
  "purchases": [ { "id": "abc", "date": "2026-01-05", "fx": 5.4,
                   "items": { "BTC": { "usd": 25, "price": 100000, "qty": 0.00025 } } } ],
  "goals": { "reserva": 0, "lataria": 0, "updatedAt": null },
  "goalLog": [ { "id": "r1", "date": "2026-10-14", "goal": "reserva", "type": "dep", "amount": 500, "note": "" } ]
}
```

## Publicar no GitHub Pages

1. Envie `index.html`, `style.css`, `app.js` e `README.md` para a branch `main`, na raiz do repositório.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
4. Em **Branch**, selecione `main` e a pasta `/ (root)`. Clique em **Save**.
5. Depois de 1 ou 2 minutos, o site fica em `https://<seu-usuário>.github.io/<nome-do-repositório>/`.

## Adicionar à tela de início do iPhone

1. Abra o link do app no **Safari**.
2. Toque no botão **Compartilhar** (o quadrado com a seta para cima).
3. Escolha **Adicionar à Tela de Início** e toque em **Adicionar**.
4. Abra pelo ícone. O app roda em tela cheia.
5. Vá em **Ajustes → Importar backup** e escolha o seu `meu-plano.json` (pelo app Arquivos).

> No iPhone, os dados do app instalado na tela de início ficam separados dos dados do Safari. Importe o backup pelo ícone instalado.

No Android (Chrome): menu ⋮ → **Adicionar à tela inicial**.
