# NubeSDK Compre Junto

Esta e a implementacao paralela do widget Compre Junto para storefront via NubeSDK.
O widget legado em `/widget/compre-junto.js` continua existindo apenas como fallback/demo.

## Modo diagnostico atual

O bundle publico esta temporariamente em modo diagnostico perf-safe para validar entrega, cache e montagem no PDP.

Texto renderizado no bloco diagnostico:

```text
Compre Junto NubeSDK onload #841a480 ativado
Render diagnostico com fallback direto no PDP
```

Caracteristicas do bundle atual:

- nao chama fetch/API;
- nao depende de `productId`, `storeId` ou oferta cadastrada;
- tenta primeiro o slot NubeSDK `after_product_detail_add_to_cart`;
- usa `requestIdleCallback` quando disponivel;
- usa fallback real com `setTimeout(..., 1200)`;
- usa fallback DOM direto no PDP quando o slot nao materializa o bloco;
- evita duplicidade pelo id `compre-junto-nubesdk-onload-test`;
- nao usa logs repetitivos, polling agressivo ou `MutationObserver`.

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
4. Procure pelo texto:

```text
Compre Junto NubeSDK onload #841a480 ativado
```

5. Se o texto existir no bundle do Railway mas nao aparecer na loja, investigar cache/entrega da Nuvemshop/CDN/storefront e a montagem do NubeSDK no tema.
