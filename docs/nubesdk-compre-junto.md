# NubeSDK Compre Junto

Esta é a implementação paralela do widget Compre Junto para storefront via NubeSDK.
O widget legado em `/widget/compre-junto.js` continua existindo apenas como fallback/demo.

## Modo diagnóstico fixo do #7880

O bundle atual está temporariamente em modo diagnóstico fixo para isolar a execução do script
`#7880 Compre Junto NubeSDK` sem depender do script legado `#7884`.

Nesta versão, o entrypoint NubeSDK não lê state, não consulta API e não depende de oferta cadastrada.
Ele apenas tenta renderizar um bloco fixo nos slots de produto.

Texto renderizado:

```text
Compre Junto NubeSDK #7880 ativo
Teste isolado sem script legado
```

Logs seguros esperados no console do ambiente NubeSDK:

- `Compre Junto NubeSDK #7880 bootstrap`;
- `Tentando renderizar slot`;
- nome do slot usado;
- `Renderização diagnóstica enviada`.

Se esse bloco aparecer com somente o `#7880` ativo no Partner Portal, o bundle, o export,
o evento de carregamento e ao menos um slot estão funcionando. Nesse caso, o próximo passo é
reativar a lógica dinâmica gradualmente: state, página de produto, `productId`, `storeId`, fetch
e renderização da oferta.

Se o bloco não aparecer com somente o `#7880` ativo, o problema provavelmente está em configuração
do Partner Portal, evento de carregamento, URL do bundle, formato aceito para NubeSDK ou slot.

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

O bundle tenta renderizar temporariamente em três slots:

- `after_product_detail_add_to_cart`;
- `after_product_detail_price`;
- `before_product_detail_add_to_cart`.

Motivo: testar mais de uma área de produto sem usar seletores do tema, DOM direto, `window`,
`document`, `querySelector`, `innerHTML` ou jQuery.

## Como testar no Partner Portal

1. Confirme que o script legado `#7884 Compre Junto Widget` está desativado.
2. Confirme que somente o `#7880 Compre Junto NubeSDK` está ativo.
3. No `#7880`, use a URL de produção do bundle:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

4. Publique/instale a nova versão do script no Partner Portal.
5. Acesse uma página de produto e force recarregamento completo.
6. Procure pelo texto:

```text
Compre Junto NubeSDK #7880 ativo
```

## Próximo passo depois do diagnóstico

Depois que o bloco fixo aparecer usando apenas o `#7880`, reativar a versão dinâmica em etapas:

1. ler o state do NubeSDK;
2. confirmar página de produto;
3. detectar `productId`;
4. detectar `storeId`;
5. chamar `/api/public/offers`;
6. renderizar a oferta real;
7. navegar para `suggestedProduct.path`.

## Pendências

- Confirmar visualmente qual slot aparece no tema real.
- Confirmar no Partner Portal se o evento `onfirstinteraction` é suficiente para o teste ou se
  vale criar uma versão `onload` do NubeSDK.
- Reativar a lógica dinâmica somente depois que o diagnóstico fixo provar execução isolada do `#7880`.
