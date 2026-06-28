# Plano MVP - Compre Junto Nuvemshop

Status: planejamento inicial  
Projeto: app externo Nuvemshop "Compre Junto"  
Data base: 2026-06-28

## 1. Visao geral

O Compre Junto sera um aplicativo externo para lojistas Nuvemshop configurarem ofertas de produtos complementares exibidas na pagina de produto da loja. O painel administrativo sera proprio, em Next.js, e a experiencia na loja sera renderizada com NubeSDK desde o inicio.

O MVP deve resolver a configuracao, sincronizacao e exibicao de recomendacoes simples, sem desconto, sem criacao de produto-kit e sem alteracao direta de estoque. O app deve ser construido com isolamento por `storeId`, OAuth Nuvemshop, webhooks obrigatorios de privacidade/LGPD e logs sem dados sensiveis.

## 2. Problema resolvido

Lojistas querem aumentar o ticket medio recomendando itens complementares no momento de maior intencao de compra: a pagina do produto. Hoje, configurar esse tipo de oferta manualmente pode exigir alteracao de tema, scripts customizados ou processos operacionais pouco confiaveis.

O app resolve esse problema ao permitir que o lojista selecione um produto principal, associe produtos recomendados e publique um bloco "Compre junto" sem mexer em estoque, pedidos, descontos ou estrutura de produto.

## 3. Publico-alvo

- Lojistas Nuvemshop que vendem produtos complementares ou acessorios.
- Operacoes pequenas e medias que precisam de uma configuracao simples, sem depender de desenvolvedor.
- Lojas que querem aumentar ticket medio com recomendacoes editoriais controladas pelo lojista.
- Nichos com forte relacao entre produto principal e acessorios, como moda, cosmeticos, pet, casa, eletronicos, papelaria e presentes.

## 4. Escopo MVP

- App externo com painel proprio em Next.js.
- OAuth Nuvemshop para instalacao, autorizacao e obtencao de `access_token`.
- Armazenamento seguro da instalacao por loja, sempre isolado por `storeId`.
- Sincronizacao inicial do catalogo de produtos e variantes.
- Atualizacao incremental do catalogo via webhooks de produto quando disponivel.
- Cadastro, edicao, listagem e ativacao/inativacao de ofertas "Compre Junto".
- Cada oferta deve conter:
  - produto principal;
  - lista de produtos recomendados;
  - titulo personalizado;
  - status ativo/inativo.
- Exibicao do bloco "Compre junto" na loja usando NubeSDK.
- Adicao dos produtos recomendados ao carrinho pelo comprador via recursos oficiais do NubeSDK.
- Tratamento de estados basicos: sem oferta, produtos indisponiveis, erro ao adicionar ao carrinho e sucesso.
- Logs tecnicos sem dados sensiveis.
- Endpoints publicos HTTPS para OAuth, NubeSDK, webhooks e suporte a homologacao.

## 5. Fora do escopo

- Desconto no combo.
- Criacao de produto-kit.
- Alteracao direta de estoque.
- Billing, assinatura ou cobranca via Mercado Pago.
- Regras automaticas de recomendacao por IA.
- Recomendacoes baseadas em historico individual do comprador.
- Edicao de tema ou injecao de scripts legados.
- Sincronizacao de pedidos.
- Checkout customizado.
- Relatorios avancados de conversao.
- Multi-idioma completo fora do necessario para a primeira publicacao.

## 6. Fluxo do lojista

1. Lojista instala o app pela Nuvemshop.
2. Nuvemshop redireciona para a URL de callback com `code` e `state`.
3. App valida `state`, troca o `code` por `access_token` e identifica o `storeId`.
4. App cria ou atualiza a instalacao da loja no banco.
5. App registra webhooks necessarios, incluindo eventos de produto, desinstalacao e privacidade/LGPD.
6. App inicia sincronizacao do catalogo da loja.
7. Lojista acessa o painel externo.
8. Lojista escolhe o produto principal.
9. Lojista escolhe os produtos recomendados.
10. Lojista define o titulo do bloco, por exemplo "Compre junto".
11. Lojista ativa a oferta.
12. App passa a disponibilizar a configuracao para o script NubeSDK daquela loja.

## 7. Fluxo do comprador

1. Comprador acessa uma pagina de produto na loja.
2. O NubeSDK identifica o produto atual e consulta ou recebe a configuracao aplicavel.
3. Se existir oferta ativa para aquele produto, o bloco "Compre junto" e exibido em um slot de pagina de produto.
4. Comprador visualiza produtos recomendados, precos e disponibilidade basica.
5. Comprador seleciona os itens recomendados desejados.
6. Comprador clica para adicionar recomendados ao carrinho.
7. O app usa evento oficial do NubeSDK para adicionar itens ao carrinho.
8. Comprador recebe feedback de sucesso ou falha.
9. Carrinho segue o fluxo normal da Nuvemshop, sem desconto automatico e sem produto-kit.

## 8. Arquitetura tecnica sugerida

- Frontend/painel: Next.js para painel externo do lojista.
- Backend: rotas server-side do proprio Next.js ou camada API separada, mantendo segredo OAuth apenas no servidor.
- Banco de dados: relacional, com `storeId` como chave de isolamento em todas as tabelas multi-tenant.
- Integracao Nuvemshop API:
  - OAuth authorization code;
  - leitura de produtos e variantes;
  - registro e recebimento de webhooks.
- Storefront: pacote/script NubeSDK do app para renderizar a interface na loja.
- Sincronizacao:
  - carga inicial paginada de produtos;
  - jobs assíncronos para evitar timeout;
  - atualizacao incremental por webhooks `product/created`, `product/updated` e `product/deleted`.
- Seguranca:
  - `access_token` criptografado em repouso;
  - `client_secret` apenas em variavel de ambiente;
  - validacao de `state` no OAuth;
  - validacao de assinatura/HMAC dos webhooks;
  - logs sem tokens, e-mails de clientes, telefones ou documentos.
- Observacao Next.js:
  - antes de implementar codigo, ler a documentacao local exigida em `node_modules/next/dist/docs/`, conforme `AGENTS.md` deste projeto.

## 9. Modelos de banco sugeridos

### `stores`

- `id`
- `store_id` unico da Nuvemshop
- `name`
- `domain`
- `country`
- `status`
- `installed_at`
- `uninstalled_at`
- `created_at`
- `updated_at`

### `oauth_installations`

- `id`
- `store_id`
- `access_token_encrypted`
- `scope`
- `token_type`
- `last_authorized_at`
- `created_at`
- `updated_at`

### `products`

- `id`
- `store_id`
- `nuvemshop_product_id`
- `name`
- `handle`
- `thumbnail_url`
- `published`
- `deleted_at`
- `last_synced_at`
- `raw_updated_at`
- `created_at`
- `updated_at`

### `product_variants`

- `id`
- `store_id`
- `product_id`
- `nuvemshop_variant_id`
- `sku`
- `name`
- `price`
- `promotional_price`
- `stock`
- `available`
- `deleted_at`
- `last_synced_at`
- `created_at`
- `updated_at`

### `bundle_offers`

- `id`
- `store_id`
- `main_product_id`
- `title`
- `status`
- `sort_order`
- `created_at`
- `updated_at`

### `bundle_offer_items`

- `id`
- `store_id`
- `bundle_offer_id`
- `recommended_product_id`
- `recommended_variant_id`
- `position`
- `created_at`
- `updated_at`

### `catalog_sync_jobs`

- `id`
- `store_id`
- `status`
- `started_at`
- `finished_at`
- `cursor`
- `error_code`
- `error_message_sanitized`
- `created_at`
- `updated_at`

### `webhook_events`

- `id`
- `store_id`
- `event`
- `external_resource_id`
- `hmac_valid`
- `processed_at`
- `status`
- `payload_hash`
- `created_at`

### `audit_logs`

- `id`
- `store_id`
- `actor_type`
- `action`
- `entity_type`
- `entity_id`
- `metadata_sanitized`
- `created_at`

## 10. Rotas principais

### Painel do lojista

- `GET /` - entrada ou redirecionamento para painel.
- `GET /login` - inicio de login/autenticacao do lojista via fluxo Nuvemshop.
- `GET /dashboard` - resumo do app e status da sincronizacao.
- `GET /offers` - lista de ofertas.
- `GET /offers/new` - criacao de oferta.
- `GET /offers/:id` - edicao de oferta.
- `GET /products` - consulta/pesquisa de produtos sincronizados.
- `GET /settings` - configuracoes basicas, status da integracao e suporte.

### API interna do app

- `GET /api/auth/nuvemshop/callback` - callback OAuth.
- `POST /api/sync/catalog` - dispara sincronizacao manual ou reprocessamento.
- `GET /api/products` - lista produtos para o painel.
- `GET /api/offers` - lista ofertas.
- `POST /api/offers` - cria oferta.
- `PATCH /api/offers/:id` - atualiza oferta.
- `PATCH /api/offers/:id/status` - ativa/inativa oferta.
- `DELETE /api/offers/:id` - remove oferta quando permitido.

### Storefront/NubeSDK

- `GET /api/storefront/config` - retorna configuracao publica minima para o NubeSDK, filtrada por `storeId` e produto atual.
- `GET /nube/app.js` ou equivalente - artefato publico do app NubeSDK, conforme empacotamento escolhido.

### Webhooks

- `POST /api/webhooks/nuvemshop` - entrada consolidada para webhooks de produto e app.
- `POST /api/webhooks/store-redact` - solicitacao de exclusao de dados da loja.
- `POST /api/webhooks/customers-redact` - solicitacao de exclusao de dados de consumidor.
- `POST /api/webhooks/customers-data-request` - solicitacao de relatorio de dados de consumidor.

### Suporte e legal

- `GET /privacy` - politica de privacidade.
- `GET /support` - suporte para lojistas.
- `GET /terms` - termos de uso, se necessario para publicacao.
- `GET /health` - status tecnico simples, sem expor dados sensiveis.

## 11. Integracoes Nuvemshop necessarias

- Portal de Parceiros:
  - criacao do app;
  - definicao de URLs publicas;
  - configuracao de callback OAuth;
  - configuracao de URL do painel;
  - configuracao de URL de preferencias;
  - configuracao de politica de privacidade;
  - configuracao de suporte;
  - configuracao dos webhooks obrigatorios de privacidade.
- OAuth:
  - fluxo authorization code;
  - validacao de `state`;
  - troca de `code` por `access_token`;
  - uso do `user_id`/`store_id` como identificador da loja.
- API de produtos:
  - escopo minimo previsto: `read_products`;
  - leitura paginada de produtos, variantes, imagens e informacoes necessarias para exibicao.
- Webhooks de catalogo:
  - `product/created`;
  - `product/updated`;
  - `product/deleted`.
- Webhooks de ciclo do app:
  - `app/uninstalled`;
  - avaliar `app/suspended` e `app/resumed` se o modelo de publicacao exigir.
- Webhooks LGPD/privacidade:
  - `store/redact`;
  - `customers/redact`;
  - `customers/data_request`.
- Requisitos gerais da API:
  - enviar `Authorization: Bearer`;
  - enviar `User-Agent` com nome do app e contato;
  - respeitar rate limit;
  - tratar paginacao;
  - tratar respostas 4xx/5xx com retries seguros quando aplicavel.

## 12. Uso previsto do NubeSDK

- Renderizar o bloco "Compre junto" em slots oficiais de pagina de produto, com preferencia inicial por:
  - `after_product_detail_add_to_cart`; ou
  - `before_product_detail_add_to_cart`, se a experiencia ficar melhor no tema testado.
- Evitar manipulacao direta de DOM e scripts legados.
- Usar estado/eventos oficiais para identificar contexto da pagina e atualizar a interface.
- Usar `cart:add` para adicionar produtos recomendados ao carrinho.
- Ouvir eventos de sucesso/falha de carrinho, como `cart:add:success` e `cart:add:fail`, para feedback visual.
- Usar componentes e tokens do NubeSDK para preservar compatibilidade visual entre temas.
- Testar em multiplos temas e tamanhos de tela durante a homologacao.
- Manter payload publico minimo: apenas dados necessarios para exibir recomendacoes e adicionar itens ao carrinho.

## 13. Riscos tecnicos

- Mudancas ou exigencias novas na homologacao Nuvemshop.
- Uso incorreto de escopos, pedindo permissoes alem do necessario.
- Rate limit durante sincronizacao inicial de catalogos grandes.
- Webhooks entregues fora de ordem ou mais de uma vez, exigindo idempotencia.
- Produtos ou variantes removidos da loja ainda referenciados por ofertas ativas.
- Divergencia entre disponibilidade sincronizada e disponibilidade real no momento da compra.
- Falha ao validar HMAC de webhooks por leitura incorreta do corpo bruto.
- Exposicao acidental de `access_token` em logs.
- Bloco NubeSDK exibido em local visualmente ruim em determinados temas.
- Adicao parcial ao carrinho quando comprador seleciona varios recomendados.
- Dependencia de URLs publicas HTTPS estaveis para homologacao.
- Implementacao em Next.js sem validar previamente as convencoes desta versao do projeto.

## 14. Checklist de homologacao

- [ ] App criado no Portal de Parceiros Nuvemshop.
- [ ] URLs publicas HTTPS configuradas.
- [ ] OAuth funcionando a partir da instalacao pela Nuvemshop.
- [ ] `state` do OAuth validado contra CSRF.
- [ ] `storeId` isolado em todas as consultas e tabelas.
- [ ] `access_token` armazenado criptografado.
- [ ] Escopos limitados ao minimo necessario, inicialmente `read_products`.
- [ ] API usando `User-Agent` com nome do app e contato.
- [ ] Sincronizacao de produtos com paginacao e respeito a rate limit.
- [ ] Webhooks de produto registrados.
- [ ] Webhooks LGPD configurados e respondendo com 2xx quando processados.
- [ ] Webhook `app/uninstalled` tratado.
- [ ] Assinatura/HMAC dos webhooks validada.
- [ ] Logs sem tokens, dados pessoais de clientes, telefones ou documentos.
- [ ] Politica de privacidade publicada.
- [ ] URL de suporte publicada.
- [ ] NubeSDK usado para storefront.
- [ ] Nenhuma injecao de script legado ou manipulacao direta de DOM.
- [ ] Bloco "Compre junto" testado em loja demo.
- [ ] Adicao ao carrinho testada com sucesso e falha.
- [ ] Produto indisponivel/removido tratado sem quebrar a pagina.
- [ ] Build de producao executado com variaveis seguras.
- [ ] Diagrama de sequencia preparado para homologacao.
- [ ] Video demo preparado com instalacao, login, criacao de oferta, exibicao na loja e reinstalacao.

## 15. Roadmap fase 2

- Descontos configuraveis por oferta, se aprovado no desenho tecnico e de produto.
- Regras automaticas por categoria, tag, colecao ou faixa de preco.
- Priorizacao de ofertas por margem, estoque ou campanha.
- Analytics de visualizacao, clique, adicao ao carrinho e conversao.
- Teste A/B de titulo, ordem e quantidade de recomendados.
- Importacao/exportacao de ofertas via CSV.
- Sugestoes automaticas baseadas em pedidos historicos, caso os escopos e a politica de privacidade sejam ampliados.
- Multi-idioma para publicacao em outras geografias.
- Templates visuais do bloco "Compre junto".
- Recomendacoes tambem no carrinho.
- Billing e planos pagos.
- Onboarding guiado para primeira oferta.
- Alertas de ofertas quebradas por produto removido ou indisponivel.

## Referencias oficiais para validacao

- DevHub Nuvemshop: https://dev.tiendanube.com/pt/
- API Nuvemshop: https://tiendanube.github.io/api-documentation/intro
- Autenticacao OAuth: https://tiendanube.github.io/api-documentation/authentication
- Webhooks: https://tiendanube.github.io/api-documentation/resources/webhook
- Homologacao: https://dev.tiendanube.com/pt/docs/homologation/overview
- Requisitos obrigatorios de homologacao: https://dev.tiendanube.com/pt/docs/homologation/requirements
- NubeSDK: https://dev.tiendanube.com/pt/docs/applications/nube-sdk/overview
- Slots storefront do NubeSDK: https://dev.tiendanube.com/pt/docs/applications/nube-sdk/slots/storefront-slots
- Eventos do NubeSDK: https://dev.tiendanube.com/pt/docs/applications/nube-sdk/events/overview
