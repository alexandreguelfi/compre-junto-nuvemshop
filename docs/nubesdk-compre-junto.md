# NubeSDK Compre Junto

Esta e a implementacao paralela do widget Compre Junto para storefront via NubeSDK.
O widget legado em `/widget/compre-junto.js` continua existindo apenas como fallback/demo.

## Comportamento dinamico atual

O bundle publico em `/nube/compre-junto.js` agora renderiza a oferta ativa de Compre Junto no PDP.

Fluxo no storefront:

- le o produto atual pelo contexto NubeSDK (`location.page.data.product`);
- le a loja atual pelo contexto NubeSDK (`store.id`);
- busca a oferta ativa em `GET /api/public/offers?productId=...&storeId=...`;
- renderiza produto principal, produto recomendado, precos individuais e preco combinado quando os precos estao disponiveis;
- tenta primeiro o slot NubeSDK `after_product_detail_add_to_cart`;
- usa `requestIdleCallback` quando disponivel;
- usa fallback real com `setTimeout(..., 1200)`;
- evita duplicidade pelo id `compre-junto-nubesdk-onload-test`;
- preserva logs pontuais sem tokens/secrets em falhas de consulta/renderizacao;
- nao usa polling agressivo ou `MutationObserver`.

O fallback diagnostico nao foi removido: ele aparece apenas em modo seguro/dev, por exemplo com `cj_debug=1`, `compre_junto_debug=1`, `nubesdk_debug=1` ou em localhost. Se nao houver oferta ativa em modo normal, o bundle nao renderiza bloco.

O CTA de fallback abre o produto recomendado quando ha URL/path disponivel. A primeira versao do botao `Adicionar conjunto ao carrinho` usa o evento oficial NubeSDK `cart:add`, sem endpoint proprio e sem manipulacao direta de DOM.

## Validacao producao pos-3eda2ef

Em 2026-07-01, apos o commit `3eda2ef`, foi validado o fluxo dinamico real no PDP:

```text
https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-a-1dgkr/
```

Resultado do bundle publico no Railway:

- `https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js` respondeu HTTP 200;
- o arquivo servido contem `Compre junto`;
- o arquivo servido contem `/api/public/offers`;
- o arquivo servido contem `Ver produto recomendado`;
- o arquivo servido contem `Compre Junto NubeSDK em modo diagnostico`;
- o arquivo servido nao contem o diagnostico fixo antigo `Compre Junto NubeSDK onload otimizado ativo`.

Resultado observado no PDP, sem parametros de debug e depois de primeira interacao:

- o slot NubeSDK `after_product_detail_add_to_cart` foi montado;
- o storefront renderizou o diagnostico antigo `Compre Junto NubeSDK onload otimizado ativo`;
- o storefront renderizou o subtitulo antigo `Render diagnostico com fallback direto no PDP`;
- o bloco dinamico `Compre junto` nao apareceu;
- as linhas `Produto principal` e `Produto recomendado` nao apareceram;
- o CTA `Ver produto recomendado` nao apareceu no PDP;
- o fallback seguro/dev novo `Compre Junto NubeSDK em modo diagnostico` nao apareceu;
- nao foram observados erros ou warnings criticos no console durante a validacao.

Uma segunda visita com `?validacao=3eda2ef`, sem ativar `cj_debug`, repetiu o mesmo resultado: o slot ficou com `data-nubesdk-mounted="true"` e texto do diagnostico antigo.

Produto principal identificado no DOM do PDP:

```text
productId: 352962585
variantId: 1550777338
nome: Produto A
preco: R$10,00
```

Resultado do endpoint publico de ofertas:

- `GET /api/public/offers?productId=352962585&storeId=7901767` respondeu HTTP 200 com oferta ativa;
- `GET /api/public/offers?productId=352962585` tambem respondeu HTTP 200 com oferta ativa;
- `GET /api/public/offers?productId=352962585&storeId=23147500` respondeu HTTP 200 com `offer: null`, indicando que `23147500` provavelmente e versao/cache do storefront, nao o id real da loja.

Oferta retornada para o produto atual:

```json
{
  "principalProductId": "352962585",
  "suggestedProduct": {
    "id": "352962686",
    "name": "Produto B",
    "imageUrl": null,
    "variantId": "1550778182",
    "price": "90.00",
    "compareAtPrice": "90.00",
    "promotionalPrice": null,
    "path": "/produtos/produto-b-q9rz6/",
    "url": "https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-b-q9rz6/"
  }
}
```

O campo `imageUrl` veio presente, mas `null`, porque o produto recomendado esta sem imagem propria na loja teste. O clique real do CTA dinamico no PDP nao foi validado porque o CTA nao renderizou; a URL recomendada retornada pela API respondeu HTTP 200 com titulo `Produto B`.

Conclusao desta validacao: o Railway esta servindo o bundle dinamico correto e o endpoint publico ja retorna oferta ativa enriquecida para o produto atual. O fluxo dinamico ainda nao foi validado de ponta a ponta no PDP porque a versao efetivamente executada pela Nuvemshop/storefront ainda e a diagnostica antiga. O proximo passo operacional e ativar/publicar no Nuvemshop Partners a versao do app script gerada a partir do commit `3eda2ef`, preferencialmente com URL versionada como:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js?v=3eda2ef
```

## Checkpoint dinamico com onfirst

Em 2026-07-01, depois de recriar o app script do zero no Partner Portal com o evento correto `onfirst`, o PDP abaixo passou a renderizar a versao dinamica real do Compre Junto NubeSDK:

```text
https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-a-1dgkr/
```

Resultado visual confirmado:

- bloco `Compre junto`;
- produto principal `Produto A` com preco `R$10,00`;
- produto recomendado `Produto B` com preco `R$90,00`;
- preco combinado `R$100,00`;
- CTA anterior `Ver produto recomendado`.

Oferta publica confirmada:

- `productId`: `352962585`;
- `storeId`: `7901767`;
- produto recomendado: `352962686`;
- variacao recomendada: `1550778182`;
- `imageUrl`: `null`, porque o Produto B esta sem imagem cadastrada na loja teste.

## Carrinho conjunto NubeSDK

Investigacao tecnica:

- o NubeSDK executa em Web Worker isolado, sem acesso direto ao DOM da loja;
- a API/evento oficial para adicionar item ao carrinho e `nube.send("cart:add", ...)`;
- o payload documentado usa `cart.items`, com `variant_id`, `product_id`, `quantity` e `properties` opcional;
- os eventos de retorno sao `cart:add:success` e `cart:add:fail`;
- nao foi criado endpoint novo no app para adicionar ao carrinho.

Referencia oficial consultada:

```text
https://dev.tiendanube.com/docs/applications/nube-sdk/events/cart
```

Implementacao inicial:

- o botao `Adicionar conjunto ao carrinho` so aparece quando produto principal e recomendado possuem `productId` e `variantId` numericos;
- o payload envia primeiro Produto A e depois Produto B no array `cart.items`, ambos com `quantity: 1`;
- enquanto aguarda retorno, o botao mostra `Adicionando...` e fica desabilitado;
- em sucesso, mostra `Conjunto adicionado ao carrinho.`;
- em falha ou timeout de confirmacao, mostra mensagem discreta e mantem o link `Ver produto recomendado`;
- o link para o produto recomendado continua renderizando como fallback quando ha URL/path.

## URL publica do NubeSDK

URL base correta do bundle NubeSDK:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

URL versionada recomendada para forcar refresh de cache da Nuvemshop/CDN quando o Partner Portal permitir salvar a URL:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js?v=841a480
```

Em 2026-07-01, as duas URLs responderam HTTP 200 no Railway e continham a versao diagnostica usada no checkpoint:

```text
Compre Junto NubeSDK onload #841a480 ativado
Render diagnÃ³stico com fallback direto no PDP
```

## Cadastro e publicacao do script

No codigo atual, o endpoint `POST /api/admin/scripts/register` usa a Scripts API da Nuvemshop para associar um `script_id` ja existente no Partner Portal a uma loja.

Esse endpoint:

- exige `scriptId` no corpo da requisicao;
- nao envia uma URL NubeSDK direta para a Nuvemshop;
- informa `widgetUrl` apenas em `query_params`;
- aponta esse `widgetUrl` para o widget legado `/widget/compre-junto.js`, nao para `/nube/compre-junto.js`.

Portanto, a URL do bundle NubeSDK exibido no storefront deve ser salva/publicada no Partner Portal da Nuvemshop, no cadastro do app script NubeSDK. Nao ha hoje, neste repositorio, um endpoint que atualize diretamente a URL publica do app script NubeSDK no Partner Portal.

## Verificacao Railway

Em 2026-07-01, a URL publica do Railway respondeu HTTP 200 e serviu o bundle com o texto:

```text
Compre Junto NubeSDK onload #841a480 ativado
```

URL verificada:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

Conclusao: o Railway esta servindo a versao correta do arquivo estatico em `/nube/compre-junto.js`.
Se o storefront da loja continuar exibindo uma versao antiga ou nao montar o bloco, o cache restante esta no lado da Nuvemshop/CDN/storefront ou no momento de disparo configurado do app script.

## Verificacao PDP loja teste

Em 2026-07-01, o PDP abaixo foi verificado durante o diagnostico:

```text
https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-a-1dgkr/
```

Evidencias observadas no storefront:

- `location.pathname` estava em `/produtos/produto-a-1dgkr/`;
- o console encontrou apenas um script CDN da Nuvemshop em `dcdn-us.mitiendanube.com/assets/stores/js/...js?v=23147500`;
- esse script CDN nao continha `Compre Junto NubeSDK onload #841a480 ativado`;
- esse script CDN nao continha `Render diagnÃ³stico com fallback direto no PDP`;
- a pagina nao renderizou nenhum texto de Compre Junto.

Conclusao: o storefront da loja teste ainda nao esta injetando o bundle atual do app NubeSDK servido pelo Railway. Neste ponto, o problema nao esta na logica do widget nem no arquivo estatico do Railway; esta na publicacao/injecao/cache do app script pela Nuvemshop/CDN/storefront.

Proximo passo operacional no Nuvemshop Partners:

1. Abrir o cadastro do app script NubeSDK ativo para a loja teste.
2. Confirmar se a URL publicada e exatamente `/nube/compre-junto.js`.
3. Salvar/publicar novamente usando a URL versionada `https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js?v=841a480`.
4. Se o storefront continuar carregando apenas o bundle CDN antigo, reinstalar o app na loja teste ou solicitar limpeza/refresh de cache do app script no suporte/Partners da Nuvemshop.

## Checkpoint ativacao NubeSDK no PDP

Depois de ativar no portal/Nuvemshop a versao `Compre Junto NubeSDK onload #841a480 #7917`, o PDP da loja teste passou a renderizar o card diagnostico no storefront.

PDP confirmado:

```text
https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-a-1dgkr/
```

Resultado visual confirmado no storefront:

```text
Compre Junto NubeSDK onload otimizado ativo
Render diagnostico com fallback direto no PDP
```

Conclusao do checkpoint: o problema anterior nao estava no Railway, no arquivo publico `/nube/compre-junto.js` ou na renderizacao basica do bundle. A causa era a versao NubeSDK atualizada criada no portal, mas ainda sem ativacao/publicacao efetiva para a loja teste.

## Endpoint publico de ofertas

O storefront consulta:

```text
GET /api/public/offers?productId=<produto-principal>&storeId=<loja>
```

Resposta esperada quando existe oferta ativa:

```json
{
  "offer": {
    "principalProductId": "123",
    "suggestedProduct": {
      "id": "456",
      "name": "Produto complementar",
      "path": "/produtos/produto-complementar/",
      "url": "https://loja/produtos/produto-complementar/",
      "imageUrl": "https://...",
      "variantId": "789",
      "price": "29.90",
      "compareAtPrice": null,
      "promotionalPrice": null
    }
  }
}
```

Quando nao ha oferta ativa, a resposta segue:

```json
{
  "offer": null
}
```

## Build

```bash
npm run build:nube
```

O build usa `tsup` e gera:

```text
public/nube/compre-junto.js
```

O comando principal tambem regenera o bundle NubeSDK:

```bash
npm run build
```

## Entry Point

O entrypoint exporta:

```ts
export function App(nube: NubeSDK)
```

Esse formato segue o template usado para gerar bundle NubeSDK com `tsup` em ESM.

## Como testar no storefront

1. Confirme que o app script ativo aponta para o bundle NubeSDK publico.
2. Acesse uma pagina de produto, por exemplo `/produtos/.../`.
3. Se o app script estiver configurado como `onfirstinteraction`, interaja com a pagina para disparar o script.
4. Com oferta ativa cadastrada para o produto principal, procure pelo titulo:

```text
Compre junto
```

5. Confirme que o bloco exibe produto principal, produto recomendado e preco combinado.
6. Clique em `Adicionar conjunto ao carrinho` e confirme que o carrinho recebe as duas variacoes com quantidade 1.
7. Se o evento de carrinho falhar, confirme que o link `Ver produto recomendado` continua visivel.
8. Se precisar diagnosticar sem oferta ativa, use uma URL com `?cj_debug=1` e procure pelo bloco `Compre Junto NubeSDK em modo diagnostico`.

## Checkpoint - Carrinho conjunto validado no PDP

Data: 01/07/2026

PDP testado:
https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-a-1dgkr/

Resultado validado:
- O widget dinâmico "Compre junto" renderizou no PDP.
- Produto principal: Produto A - R,00.
- Produto recomendado: Produto B - R,00.
- Preço combinado exibido: R,00.
- O botão de carrinho conjunto executou via NubeSDK cart:add.
- Após o clique, o widget exibiu "Conjunto adicionado".
- A mensagem "Conjunto adicionado ao carrinho." apareceu.
- O carrinho foi conferido e continha Produto A + Produto B adicionados corretamente.
- O link "Ver produto recomendado" permaneceu disponível como fallback.

Conclusão:
A primeira versão segura do carrinho conjunto via NubeSDK funcionou no PDP e no carrinho da loja demo.

Pendências futuras:
- Configurar/desenhar regra de desconto real.
- Adicionar imagem no Produto B para melhorar a apresentação visual.
- Revisar otimização de performance do bundle, pois a Nuvemshop aprovou o script, mas informou que o impacto ficou no limite.
- Avaliar melhoria visual/UX do widget antes da homologação final.

## Checkpoint - Carrinho conjunto validado no PDP

Data: 01/07/2026

PDP testado:
https://lojadedemonstracaodeaplic2.lojavirtualnuvem.com.br/produtos/produto-a-1dgkr/

Resultado validado:
- O widget dinâmico "Compre junto" renderizou no PDP.
- Produto principal: Produto A - R,00.
- Produto recomendado: Produto B - R,00.
- Preço combinado exibido: R,00.
- O botão de carrinho conjunto executou via NubeSDK cart:add.
- Após o clique, o widget exibiu "Conjunto adicionado".
- A mensagem "Conjunto adicionado ao carrinho." apareceu.
- O carrinho foi conferido e continha Produto A + Produto B adicionados corretamente.
- O link "Ver produto recomendado" permaneceu disponível como fallback.

Conclusão:
A primeira versão segura do carrinho conjunto via NubeSDK funcionou no PDP e no carrinho da loja demo.

Pendências futuras:
- Configurar regra de desconto real.
- Adicionar imagem no Produto B para melhorar a apresentação visual.
- Revisar otimização de performance do bundle, pois a Nuvemshop aprovou o script, mas informou que o impacto ficou no limite.
- Melhorar visual/UX do widget antes da homologação final.
