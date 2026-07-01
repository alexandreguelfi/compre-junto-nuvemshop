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

## URL publica do NubeSDK

URL base correta do bundle NubeSDK:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

URL versionada recomendada para forcar refresh de cache da Nuvemshop/CDN quando o Partner Portal permitir salvar a URL:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js?v=841a480
```

Em 2026-07-01, as duas URLs responderam HTTP 200 no Railway e continham:

```text
Compre Junto NubeSDK onload #841a480 ativado
Render diagnóstico com fallback direto no PDP
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
- esse script CDN nao continha `Render diagnóstico com fallback direto no PDP`;
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
