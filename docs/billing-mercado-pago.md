# Billing Mercado Pago - Compre Junto Pro

## Objetivo

O billing do Compre Junto Pro registra assinatura por loja usando Mercado Pago, com preco padrao de R$ 49,00/mes e trial configuravel. A cobranca usa a nossa conta/chave Mercado Pago, nunca credencial do lojista.

O deploy inicial deve manter `BILLING_ENFORCEMENT_ENABLED=false` para validar checkout e webhook sem derrubar a loja demo nem o MVP NubeSDK ja funcional.

## Variaveis de ambiente

- `MERCADO_PAGO_ACCESS_TOKEN`: access token da nossa aplicacao Mercado Pago.
- `MERCADOPAGO_WEBHOOK_SECRET`: secret do webhook Mercado Pago. Em producao, webhook sem secret configurado e rejeitado.
- `COMPRE_JUNTO_MP_PLAN_ID`: plano Mercado Pago existente. Obrigatorio para criar checkout nesta primeira versao segura.
- `COMPRE_JUNTO_PRICE`: preco mensal. Padrao: `49`.
- `COMPRE_JUNTO_TRIAL_DAYS`: dias de trial. Padrao: `7`.
- `BILLING_ENFORCEMENT_ENABLED`: feature flag de bloqueio comercial. Padrao seguro: `false`.

## Modelo de dados

A tabela `BillingSubscription` registra:

- loja (`storeId`);
- provider `MERCADO_PAGO`;
- `providerSubscriptionId`;
- `providerPlanId`;
- status interno;
- status externo do Mercado Pago;
- `initPoint`/`checkoutUrl`;
- fim de trial;
- fim do periodo atual;
- cancelamento.

Status internos:

- `TRIAL`;
- `ACTIVE`;
- `PENDING`;
- `PAST_DUE`;
- `CANCELED`;
- `BLOCKED`.

## Fluxo de checkout

1. O admin acessa `/admin/billing`.
2. A tela mostra o plano Compre Junto Pro, preco, status atual e modo da feature flag.
3. O botao "Assinar agora" chama `POST /api/billing/checkout`.
4. A rota identifica a loja conectada, exige e-mail do pagador e cria a assinatura no Mercado Pago com `POST https://api.mercadopago.com/preapproval` usando `COMPRE_JUNTO_MP_PLAN_ID`.
5. A resposta salva `providerSubscriptionId` e `initPoint`.
6. O navegador redireciona o lojista para o checkout do Mercado Pago.

## Webhook

A rota `POST /api/mercadopago/webhook` recebe eventos do Mercado Pago.

Com `MERCADOPAGO_WEBHOOK_SECRET` configurado, a rota valida:

- header `x-signature`;
- header `x-request-id`;
- `data.id` da notificacao.

Depois da validacao, a rota consulta `GET https://api.mercadopago.com/preapproval/{id}` antes de atualizar o status local. O payload recebido nao e usado como fonte final de verdade.

Eventos sao registrados em `WebhookEvent` com `provider=mercado_pago`, sem tokens ou dados de cartao.

## Feature flag

Com `BILLING_ENFORCEMENT_ENABLED=false`:

- admin segue utilizavel;
- criacao, edicao e ativacao de ofertas seguem liberadas;
- `/api/public/offers` continua retornando ofertas ativas normalmente;
- banners e `/admin/billing` mostram status de billing em modo teste.

Com `BILLING_ENFORCEMENT_ENABLED=true`:

- loja sem `TRIAL` ou `ACTIVE` nao cria, edita ou ativa ofertas;
- ofertas existentes continuam visiveis no admin;
- `/api/public/offers` retorna sem oferta para loja sem acesso, evitando quebra do NubeSDK;
- `/admin/billing` continua acessivel para regularizacao.

## Como ativar em producao

1. Configurar `MERCADO_PAGO_ACCESS_TOKEN`.
2. Configurar `MERCADOPAGO_WEBHOOK_SECRET`.
3. Configurar `COMPRE_JUNTO_MP_PLAN_ID`, se o plano for gerenciado no Mercado Pago.
4. Validar checkout em `/admin/billing`.
5. Validar que o webhook atualiza a assinatura para `ACTIVE`.
6. Somente depois disso, alterar `BILLING_ENFORCEMENT_ENABLED=true`.

## Observacoes

- O widget NubeSDK e o bundle `public/nube/compre-junto.js` nao fazem parte deste fluxo.
- O plano configurado no Mercado Pago deve refletir o preco e o trial definidos para o Compre Junto Pro.
- A API publica segue retornando vazio, e nao erro fatal, quando o enforcement bloquear uma loja.
- A assinatura e direcional por loja, nao por oferta individual.
