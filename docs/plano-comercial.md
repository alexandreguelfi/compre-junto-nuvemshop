# Plano comercial

## Plano

- Nome: Compre Junto Pro
- Preço: R$ 49/mês
- Trial: 7 dias grátis

## Status comerciais

- `TRIALING`: loja dentro do teste grátis.
- `ACTIVE`: loja pagante/liberada.
- `EXPIRED`: teste grátis vencido sem plano ativo.
- `CANCELED`: acesso comercial cancelado.

## Regra de trial

O trial começa na instalação/autorização da loja. Se a loja já existir e ainda não tiver datas de trial,
as datas são inicializadas uma única vez.

Para lojas que já estavam instaladas antes da criação desta camada comercial, a migration inicializa
um trial de 7 dias a partir da implantação da regra, evitando bloqueio imediato do MVP já validado.

## Comportamento após vencimento

Enquanto a loja estiver `ACTIVE`, o app fica liberado.

Enquanto a loja estiver `TRIALING` e dentro do prazo de 7 dias, o app fica liberado.

Se o trial vencer e a loja não estiver `ACTIVE`, o app considera a loja bloqueada:

- o admin continua acessível para visualizar informações e ofertas existentes;
- a criação de novas ofertas fica bloqueada com mensagem controlada;
- o endpoint público retorna `{ "offer": null }`, sem expor status financeiro ao storefront.

## Cobrança futura

Ainda não há cobrança automática. A próxima etapa comercial deve integrar um checkout, por exemplo
Mercado Pago, e atualizar o status comercial da loja para `ACTIVE` após confirmação de pagamento.
