# Admin de Ofertas Compre Junto

## Editar Oferta

No painel `/admin/ofertas`, cada oferta possui a acao `Editar`.

A tela de edicao permite alterar:

- produto sugerido/recomendado;
- produto principal onde a sugestao aparece;
- status da oferta.

Salvar uma edicao preserva a regra direcional da oferta: uma oferta `Produto A -> Produto B` nao cria automaticamente a oferta inversa `Produto B -> Produto A`.

## Ativar e Desativar

Na listagem `/admin/ofertas`, cada oferta possui um botao de status:

- ofertas ativas mostram a acao `Desativar`;
- ofertas inativas mostram a acao `Ativar`.

O status atual tambem aparece visualmente na lista como `Ativa` ou `Inativa`.

Ao ativar uma oferta, o admin valida se ja existe outra oferta ativa para o mesmo produto principal. Se existir, a ativacao e bloqueada para evitar duplicidade no storefront.

## API Publica

A API publica `/api/public/offers` deve retornar apenas ofertas ativas.

Ofertas inativas permanecem cadastradas para edicao futura, mas nao devem aparecer no PDP e nao devem renderizar o widget NubeSDK.

## Direcionalidade

As ofertas sao direcionais por padrao:

- produto principal/gatilho: onde a sugestao aparece;
- produto sugerido/recomendado: o produto exibido no bloco Compre Junto.

Para que `Produto B` recomende `Produto A`, e necessario cadastrar uma oferta explicita `Produto B -> Produto A`.
