# NubeSDK Compre Junto

Esta é a implementação paralela do widget Compre Junto para storefront via NubeSDK.
O widget legado em `/widget/compre-junto.js` continua existindo apenas como fallback/demo.

## Modo RESET diagnóstico v6

O bundle atual está temporariamente em modo RESET diagnóstico v6.

Objetivo: provar se o Partner Portal está entregando a nova versão ativa do script `#7880 Compre Junto NubeSDK`.

Nesta versão, o entrypoint NubeSDK:

- não lê state;
- não chama fetch;
- não depende de `productId`;
- não depende de `storeId`;
- não depende de oferta cadastrada;
- não usa `window`, `document`, DOM direto, `querySelector`, `innerHTML` ou jQuery.

Texto renderizado:

```text
Compre Junto NubeSDK RESET v6
Teste limpo sem legado
```

Logs seguros esperados:

- `Compre Junto NubeSDK RESET v6 bootstrap`;
- `Compre Junto NubeSDK RESET v6 render enviado`.

Se esse texto aparecer na loja com somente o `#7880` ativo, o Partner Portal está entregando a nova versão do bundle.

Se esse texto não aparecer, o problema está fora da lógica dinâmica do app: versão ativa do Partner Portal, cache,
evento configurado, URL do bundle, instalação do script ou entrega do NubeSDK no storefront.

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

## Slots usados no RESET

O bundle renderiza temporariamente em três slots para maximizar a chance de visualização:

- `after_product_detail_add_to_cart`;
- `after_product_detail_price`;
- `before_product_detail_add_to_cart`.

## Como testar no Partner Portal

1. Confirme que somente o `#7880 Compre Junto NubeSDK` está ativo.
2. No `#7880`, use a URL de produção do bundle:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

3. Publique/instale a nova versão do script no Partner Portal.
4. Confirme que a nova versão ficou ativa.
5. Acesse uma página de produto e force recarregamento completo.
6. Interaja com a página se o evento ativo continuar como `onfirstinteraction`.
7. Procure pelo texto:

```text
Compre Junto NubeSDK RESET v6
```

## Próximo passo depois do RESET

Depois que o RESET v6 aparecer na loja, reativar a versão dinâmica em etapas:

1. ler o state do NubeSDK;
2. confirmar página de produto;
3. detectar `productId`;
4. detectar `storeId`;
5. chamar `/api/public/offers`;
6. renderizar a oferta real;
7. navegar para `suggestedProduct.path`.
