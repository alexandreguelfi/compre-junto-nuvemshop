# NubeSDK Compre Junto

Esta é a implementação paralela do widget Compre Junto para storefront via NubeSDK.
O widget legado em `/widget/compre-junto.js` continua existindo apenas como fallback/demo.

## Modo diagnóstico dinâmico do #7880

O bundle atual está temporariamente em modo diagnóstico dinâmico visível para isolar a falha
entre leitura de state, identificação de produto/loja, chamada da API pública e renderização
da oferta real.

A versão fixa anterior confirmou que o `#7880 Compre Junto NubeSDK` executa sozinho, sem o
script legado `#7884`. Portanto, este modo volta a ler dados do NubeSDK, mas mantém um bloco
de diagnóstico visível no storefront.

## O que aparece na loja

O bloco diagnóstico mostra:

- `Compre Junto NubeSDK diagnóstico`;
- slot usado;
- `pageType` detectado;
- `productId` detectado;
- `storeId` detectado;
- endpoint chamado;
- status da oferta: `aguardando`, `offer encontrada`, `offer null` ou `erro`;
- campos ausentes, quando houver;
- erro de fetch, quando houver;
- produto sugerido, quando a oferta vier válida.

Quando a oferta existe, o slot principal também renderiza o widget real:

- título: `Compre junto`;
- texto: `Combine este produto com:`;
- nome do produto sugerido;
- botão `Ver produto sugerido`.

## State lido

O entrypoint lê o state do NubeSDK sem usar DOM direto:

- `state.location.page.type` como `pageType`;
- `state.location.page.data.product.id` como `productId`;
- `state.store.id` como `storeId`.

Também há fallback defensivo para `page.data.product_id` e `page.data.id`, apenas para diagnosticar
diferenças de formato em runtime.

## Endpoint chamado

Quando `productId` e `storeId` existem, o bundle chama:

```text
https://compre-junto-nuvemshop-production.up.railway.app/api/public/offers?productId=...&storeId=...
```

Se faltar `productId` ou `storeId`, o fetch não é chamado e o bloco mostra o campo ausente.

Se a resposta for `offer:null`, o bloco permanece visível com status `offer null`.

Se houver oferta, o bloco mostra `offer encontrada` e renderiza o widget real no slot principal.

## Navegação

O botão `Ver produto sugerido` usa:

```ts
nube.getBrowserAPIs().navigate(offer.suggestedProduct.path)
```

Como o NubeSDK aceita rota relativa, o botão só fica ativo quando `suggestedProduct.path`
existe e começa com `/`. Se não houver `path`, o botão fica desabilitado.

## Build

```bash
npm run build:nube
```

O build usa `tsup` e gera:

```text
public/nube/compre-junto.js
```

Em produção, o bundle fica disponível em:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

O comando principal `npm run build` também executa `npm run build:nube` antes do `next build`.

## Entry Point

O entrypoint exporta:

```ts
export function App(nube: NubeSDK)
```

Esse formato segue o template oficial usado para gerar bundle NubeSDK com `tsup` em ESM.

## Slots usados no diagnóstico

O bundle renderiza temporariamente em três slots para priorizar visibilidade:

- `after_product_detail_add_to_cart`;
- `after_product_detail_price`;
- `before_product_detail_add_to_cart`.

O widget real, quando existe oferta, aparece apenas no slot principal:

```text
after_product_detail_add_to_cart
```

## Logs seguros

Além do bloco visível, o console recebe logs sem token e sem dados sensíveis:

- script iniciado;
- state lido;
- fetch não chamado por campos ausentes;
- endpoint chamado;
- resultado da oferta;
- resultado ignorado por state mais recente.

## Como testar no Partner Portal

1. Confirme que o script legado `#7884 Compre Junto Widget` está desativado.
2. Confirme que somente o `#7880 Compre Junto NubeSDK` está ativo.
3. No `#7880`, use a URL de produção do bundle:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

4. Publique/instale a nova versão do script no Partner Portal.
5. Acesse uma página de produto e force recarregamento completo.
6. Interaja com a página se o evento ativo continuar como `onfirstinteraction`.
7. Verifique o bloco `Compre Junto NubeSDK diagnóstico`.

## Próximo passo depois do diagnóstico

Quando o diagnóstico mostrar onde está a falha:

- se `productId` ou `storeId` vierem ausentes, ajustar a leitura do state;
- se o endpoint for chamado e voltar `offer null`, investigar filtros da API pública;
- se houver erro de fetch, investigar CORS/conectividade/status HTTP;
- se aparecer `offer encontrada`, remover o bloco diagnóstico e manter apenas o widget real.

## Pendências

- Confirmar visualmente qual slot é melhor no tema real.
- Remover o diagnóstico visível depois que a lógica dinâmica estiver validada.
- Evoluir o CTA para add-to-cart oficial via NubeSDK em etapa futura.
