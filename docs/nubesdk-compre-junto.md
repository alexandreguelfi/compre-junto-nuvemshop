# NubeSDK Compre Junto

Esta é a primeira implementação paralela do widget Compre Junto para storefront via NubeSDK.
O widget legado em `/widget/compre-junto.js` continua existindo como fallback/demo.

## Modo diagnóstico temporário

O bundle atual está em modo diagnóstico de renderização fixa. Ele não consulta API, não depende de
`productId`, não depende de `storeId` e não renderiza oferta real.

Texto renderizado:

- "Compre Junto NubeSDK ativo"
- "Renderização de teste"

Objetivo: confirmar se o Partner Portal, o formato do bundle e os slots do NubeSDK estão funcionando
antes de reativar a lógica dinâmica de oferta.

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

## Slot usado

Slot principal: `after_product_detail_add_to_cart`

Slot fallback de diagnóstico: `after_product_detail_price`

Motivo: o bloco "Compre junto" aparece na página de produto logo após a área principal de compra,
perto do botão de adicionar ao carrinho, sem depender de seletores do tema ou manipulação direta de DOM.

O slot fallback ajuda a diferenciar problema de slot específico de problema de bundle/configuração.

## Contexto usado

O entrypoint NubeSDK lê:

- `state.location.page.type` para confirmar página de produto;
- `state.location.page.data.product.id` como `productId`;
- `state.store.id` como `storeId`.

Com esses dados, consulta:

```text
https://compre-junto-nuvemshop-production.up.railway.app/api/public/offers?productId=...&storeId=...
```

Se a resposta for `offer:null`, o slot é limpo e nada é renderizado.

Se houver oferta, o slot renderiza:

- título: "Compre junto";
- texto: "Combine este produto com:";
- nome do produto sugerido;
- botão "Ver produto sugerido".

## Navegação

O NubeSDK expõe `browser.navigate` para rotas relativas. Por isso o endpoint público também retorna:

```json
{
  "suggestedProduct": {
    "id": "353199744",
    "name": "Produto C",
    "url": "https://loja.exemplo/produtos/produto-c/",
    "path": "/produtos/produto-c/"
  }
}
```

Quando `path` existe, o botão chama `nube.getBrowserAPIs().navigate(path)`.
Quando `path` não existe, o botão fica desabilitado de forma segura.

## Como testar com NubeSDK DevTools

1. Rode o app principal, se quiser testar contra API local.
2. Rode `npm run build:nube` para gerar o bundle.
3. Sirva o arquivo `public/nube/compre-junto.js` em uma URL acessível pelo navegador, por exemplo
   usando um servidor estático com CORS.
4. Abra o NubeSDK DevTools/Local Mode no ambiente da Nuvemshop.
5. Informe a URL do bundle local ou de produção.
6. Acesse uma página de produto que tenha oferta ativa.

Para teste em produção, use diretamente:

```text
https://compre-junto-nuvemshop-production.up.railway.app/nube/compre-junto.js
```

## Pendências

- Validar visualmente o slot em temas reais com NubeSDK DevTools.
- Confirmar no Partner Portal a configuração de app que usa NubeSDK.
- Confirmar se a publicação NubeSDK substitui o Script API legado ou se ambos podem conviver durante homologação.
- Evoluir o CTA para add-to-cart oficial via NubeSDK em etapa futura.
