# Homologacao tecnica — Compre Junto

Este e o texto-fonte para revisao humana antes da proxima atualizacao do FAQ em PDF. O PDF existente nao foi alterado.

## 1. Escopos finais

O aplicativo usa somente:

- `read_products`: listar produtos no painel, validar o produto principal e consultar produto sugerido, variantes, disponibilidade, precos, imagens e URL publica;
- `write_scripts`: consultar e associar scripts previamente criados no Portal de Parceiros quando eles nao forem auto-instalaveis;
- nenhuma permissao de escrita de produtos, variantes ou categorias.

`write_products` nao e solicitado, usado ou necessario. O app nao cria kits como produtos, nao altera catalogo, estoque ou preco e adiciona itens existentes ao carrinho pelas APIs oficiais do storefront.

## 2. Diagnostico anterior ao marco

Antes desta revisao, o repositorio continha os dois artefatos, mas eles nao eram mantidos automaticamente como um par:

- o bundle NubeSDK vinha de `storefront-nube/src/main.tsx` e gerava `public/nube/compre-junto.js`;
- o legado era servido em `/widget/compre-junto.js`;
- `POST /api/admin/scripts/register` aceitava um unico `scriptId`, selecionava globalmente a loja mais recentemente atualizada e associava apenas esse script;
- o parametro do registro apontava para o legado; criar, versionar, publicar e ativar o NubeSDK sempre dependeu do Portal;
- o endpoint publico ja filtrava ofertas por tenant, mas painel, catalogo e registro ainda podiam escolher outra instalacao por `findFirst` global;
- o NubeSDK nao reagia a `location:updated` e uma consulta sem oferta deixava a tentativa travada;
- o legado tinha poucas fontes para detectar IDs, exibicao simplificada e nenhum lock comum com o NubeSDK;
- bloqueio comercial, oferta ausente/inativa, produto divergente e falha de contexto convergiam para ausencia silenciosa.

Para “Short Curto em Sarja Delave com Barra Dobrada Branco | Loja da Lu”, nao e possivel determinar uma causa unica apenas pelo repositorio, sem os dados do Portal e da instalacao. As causas mais provaveis eram:

1. versao NubeSDK nao publicada/ativada ou ainda em cache no Portal/CDN;
2. oferta criada em outra instalacao devido a selecao global da loja;
3. `productId` salvo diferente do ID real do PDP;
4. trial/assinatura sem entitlement, produzindo `offer:null`;
5. contexto NubeSDK tardio ou troca de PDP via SPA sem nova avaliacao.

Os logs e o modo de diagnostico agora distinguem esses casos.

## 3. Compatibilidade simultanea

### NubeSDK

- bundle: `/nube/compre-junto.js`;
- fonte atual: `storefront-nube/src/main.ts`;
- contexto: `state.store.id` e `state.location.page.data.product.id`;
- slot: `after_product_detail_add_to_cart`;
- carrinho: `nube.send("cart:add", ...)` com produtos e variantes principal e sugerida;
- retorno: `cart:add:success`, `cart:add:fail` e timeout de 8 segundos;
- SPA: nova avaliacao em `page:loaded` e `location:updated`, com limpeza do slot ao sair/trocar de produto;
- listeners de carrinho e variante somente depois de existir oferta renderizavel.

### Temas legados

- script: `/widget/compre-junto.js`;
- nao depende de NubeSDK ou jQuery;
- prioriza atributos e parametros explicitos, depois objeto oficial `LS`, global da plataforma quando disponivel e hooks `data-store`;
- deriva a origem da API da URL do script, nunca da URL da loja;
- insere perto do botao/formulario do produto; o final do `body` nao e o primeiro fallback;
- exibe principal, sugerido, imagens e precos retornados pela mesma API;
- nao tenta simular uma operacao atomica de dois itens com chamadas sequenciais: como isso pode deixar carrinho parcial em temas legados, o fallback seguro sempre leva ao produto recomendado sem alterar o carrinho;
- reage a `popstate`, `hashchange`, `pageshow` e mudancas de DOM em navegacao dinamica.

### Deduplicacao

Os runtimes compartilham:

- ID visual `compre-junto-widget-root`;
- lease curta por `storeId:productId` em `sessionStorage`;
- marcador da tecnologia e instante da ultima confirmacao de renderizacao.

O lease so e gravado depois da renderizacao confirmada e e renovado enquanto o widget real continua presente. Lease antigo e ignorado e o runtime bloqueado tenta novamente; assim erro antes da renderizacao, recarga e navegacao A -> B -> A nao deixam bloqueio permanente. No legado, o DOM e a fonte de verdade. Detectar NubeSDK nao faz o legado desistir antes de existir uma renderizacao confirmada. O segundo runtime registra `widget_already_rendered` e nao duplica o card.

## 4. Isolamento por loja

- o callback OAuth grava sessao administrativa assinada, `HttpOnly`, `SameSite=Lax`, vinculada ao `nuvemshopStoreId` da instalacao;
- painel, ofertas, catalogo e checkout comercial resolvem por essa sessao, sem escolher a ultima loja global;
- endpoints administrativos automatizados aceitam `storeId` externo explicito e validam a loja exata;
- o storefront resolve pelo `storeId`; sem ID, aceita fallback apenas com exatamente uma instalacao conectada;
- ambiguidade falha de forma segura e nao consulta outro tenant;
- oferta sempre inclui o `storeId` interno resolvido e trigger correspondente ao `productId`;
- IDs publicos aceitam somente formato numerico limitado;
- tokens sao descriptografados apenas no servidor e nunca aparecem em resposta, diagnostico ou log.

## 5. Endpoint e diagnostico

```text
GET /api/public/offers?storeId=<LOJA>&productId=<PRODUTO>&technology=legacy|nubesdk
```

O endpoint exige acesso comercial valido, oferta ativa e trigger correspondente. Retorna os dados minimos dos produtos principal e sugerido: produto, variante disponivel, preco, promocional, comparacao, imagem, URL e path. Usa CORS de leitura e `Cache-Control: no-store`.

Codigos sanitizados incluem:

- `storefront_script_loaded`;
- `product_id_unavailable` e `store_id_unavailable`;
- `store_not_connected` e `store_ambiguous`;
- `commercial_access_denied`;
- `offer_found`, `offer_not_found`, `offer_inactive` e `trigger_product_mismatch`;
- `suggested_product_lookup_failed`;
- `widget_rendered` e `widget_already_rendered`;
- `cart_add_started`, `cart_add_success` e `cart_add_failed`.

Usar `?cj_debug=1` para diagnostico visual. Em producao, a resposta so inclui o diagnostico quando `STOREFRONT_DIAGNOSTICS_ENABLED=true`; desenvolvimento permite por padrao. O parametro nao altera trial, assinatura, tenant ou oferta e nao e bypass comercial.

O comprador normal nao ve detalhes tecnicos. Tokens, segredos, stack traces e dados de banco nao sao retornados.

`POST /api/public/storefront-events` apenas produz logs estruturados com os quatro campos acima. Ele exige JSON, limita o corpo a 1 KiB, aceita somente codigos fechados e IDs numericos, deduplica repeticoes breves em memoria e nao grava no banco. Falha de diagnostico nunca interfere no widget.

## 6. Trial e assinatura

Com `BILLING_ENFORCEMENT_ENABLED=true`, apenas `ACTIVE` ou trial valido permitem o widget. Trial expirado, pagamento pendente, cancelamento ou bloqueio retornam oferta nula e `commercial_access_denied` nos logs.

Instalacao nova inicia `trialStartedAt` e `trialEndsAt` usando `COMPRE_JUNTO_TRIAL_DAYS`. Instalacao antiga com campo ausente e reparada sem reiniciar trial ja consumido. Reinstalar nao reativa indiscriminadamente trial expirado e nenhum query parameter ignora a politica comercial.

Antes do teste, conferir administrativamente o status da loja. Se o trial estiver legitimamente expirado, regularizar a assinatura ou aplicar procedimento interno autorizado; nunca alterar por URL publica.

## 7. Registro dos dois scripts

Configuracao separada:

```text
NUVEMSHOP_LEGACY_SCRIPT_ID=<ID LEGADO>
NUVEMSHOP_NUBESDK_SCRIPT_ID=<ID NUBESDK>
```

O endpoint protegido `POST /api/admin/scripts/register`:

1. resolve uma loja exata pela sessao ou pelo `storeId` enviado;
2. executa `GET /scripts`;
3. compara separadamente os IDs;
4. executa `POST /scripts` apenas para associacoes ausentes;
5. retorna por runtime `registered`, `already_registered`, `configuration_missing` ou `failed`.

Os IDs oficiais sao lidos somente de `NUVEMSHOP_LEGACY_SCRIPT_ID` e `NUVEMSHOP_NUBESDK_SCRIPT_ID`; o payload nao pode substitui-los. A listagem de associacoes e paginada e uma falha de associacao e reportada por runtime sem impedir a tentativa do outro.

Isso automatiza apenas a associacao de scripts nao auto-instalaveis ja existentes. Continuam manuais no Portal:

- criar as duas entradas e escolher o runtime correto;
- informar/upload da versao legada e URL/versao do bundle NubeSDK;
- selecionar local `store`, evento aprovado (preferencialmente `onfirstinteraction`) e politica auto-instalavel;
- publicar/ativar a versao;
- copiar os dois IDs para o ambiente;
- confirmar a ativacao de scripts auto-instalaveis.

A API publica nao cria ou publica versoes. Nao afirmar que ambos estao configurados no Portal ate concluir essa verificacao.

## 8. Procedimento exato de reinstalacao e teste

1. No Portal, confirmar `read_products` e `write_scripts`; manter `write_products` desmarcado.
2. Confirmar duas entradas publicadas e ativas: legado e NubeSDK.
3. Confirmar URLs/versoes e IDs separados no ambiente do app.
4. Se nao auto-instalaveis, chamar o endpoint protegido com o `storeId` e conferir o resultado individual.
5. Desinstalar o app da loja de homologacao.
6. Instalar novamente por `/api/nuvemshop/install` e concluir OAuth, criando a sessao assinada correta.
7. No painel, conferir ID numerico da loja e status comercial/trial.
8. Criar a oferta, selecionar exatamente o “Short Curto...” como principal e outro produto como sugerido.
9. Ativar a oferta e anotar os IDs numericos.
10. Abrir exatamente a URL publica do principal em janela anonima, primeiro sem debug.
11. Confirmar um unico card, os dois produtos, precos e fallback do recomendado.
12. No NubeSDK, adicionar o conjunto e confirmar as duas variantes com quantidade 1; no legado, confirmar que o link recomendado navega sem alterar o carrinho.
13. Se nao aparecer, repetir com `?cj_debug=1` e confrontar o codigo com os logs.
14. Navegar para outro produto sem recarregar, quando houver SPA, e confirmar limpeza/substituicao.
15. Repetir em um tema legado e um tema NubeSDK.

## 9. Checklist de evidencias

- captura dos escopos, com `write_products` desmarcado;
- captura das duas entradas, runtime, evento, status e versao/URL;
- resultado do registro individual sem token;
- captura da oferta ativa e IDs dos produtos;
- video do PDP com um unico widget;
- video/captura do carrinho com as duas variantes;
- evidencia em tema legado e NubeSDK;
- teste SPA sem widget antigo;
- codigo sanitizado se houver falha;
- status comercial/trial da instalacao;
- resultados de testes, lint, typecheck e build.

## 10. Pontos para o proximo FAQ

- justificativa de `read_products` e `write_scripts`;
- confirmacao de que nao existe `write_products`;
- diferenca e coexistencia entre legado e NubeSDK;
- lock contra duplicidade;
- identificacao do produto principal correto;
- carrinho e fallback do recomendado;
- modo de diagnostico autorizado;
- interferencia de trial/assinatura;
- limites da Scripts API versus Portal;
- publicacao/versionamento para distinguir cache de falha de oferta.

## 11. Estado desta entrega

A implementacao e os testes automatizados do repositorio foram concluidos. A criacao/publicacao das entradas no Portal, a reinstalacao e a validacao real na Loja da Lu continuam pendentes de execucao humana. Nao ha evidencia nesta entrega de que o widget ou o carrinho NubeSDK ja foram validados nessa loja ou em todos os temas. O PDF existente permanece intocado e sua eventual regeneracao continua pendente de revisao humana deste Markdown.
