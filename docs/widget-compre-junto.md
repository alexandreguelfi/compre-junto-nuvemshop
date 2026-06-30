# Widget Compre Junto

Use este snippet na pagina de produto da loja para renderizar o bloco publico do Compre Junto:

```html
<div id="compre-junto-widget"></div>
<script
  src="https://compre-junto-nuvemshop-production.up.railway.app/widget/compre-junto.js"
  data-product-id="2001"
  data-store-id="7901767"
></script>
```

O `data-product-id` deve ser o ID do produto principal. O `data-store-id` e o ID publico da loja na
Nuvemshop e ajuda a manter isolamento quando houver mais de uma loja conectada.

Se existir uma oferta ativa para o produto, o script renderiza um bloco simples com titulo, produto sugerido
e o CTA inicial. Se nao existir oferta ativa ou ocorrer erro de rede, o script nao renderiza nada.
