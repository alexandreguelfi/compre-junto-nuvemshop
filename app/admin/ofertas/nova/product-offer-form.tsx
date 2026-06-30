"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { NuvemshopAdminProduct } from "@/src/lib/nuvemshop/products";

type ProductOfferFormProps = {
  products: NuvemshopAdminProduct[];
  productsLoadFailed: boolean;
};

function findProduct(products: NuvemshopAdminProduct[], productId: string) {
  return products.find((product) => product.id === productId) ?? null;
}

function ProductSelect({
  label,
  onSelect,
  products,
}: {
  label: string;
  onSelect: (productId: string) => void;
  products: NuvemshopAdminProduct[];
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-800">
      {label}
      <select
        defaultValue=""
        disabled={products.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
      >
        <option value="">Selecionar produto</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name} - ID {product.id}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProductOfferForm({ products, productsLoadFailed }: ProductOfferFormProps) {
  const [suggestedProductId, setSuggestedProductId] = useState("");
  const [suggestedProductName, setSuggestedProductName] = useState("");
  const [triggerProductId, setTriggerProductId] = useState("");
  const [triggerProductName, setTriggerProductName] = useState("");

  const hasProducts = products.length > 0;
  const productsStatusText = useMemo(() => {
    if (productsLoadFailed) {
      return "Nao foi possivel carregar os produtos agora. Os campos manuais seguem disponiveis.";
    }

    if (!hasProducts) {
      return "Nenhum produto foi retornado pela Nuvemshop. Os campos manuais seguem disponiveis.";
    }

    return `${products.length} produtos carregados da Nuvemshop.`;
  }, [hasProducts, products.length, productsLoadFailed]);

  function selectSuggestedProduct(productId: string) {
    const product = findProduct(products, productId);

    setSuggestedProductId(product?.id ?? "");
    setSuggestedProductName(product?.name ?? "");
  }

  function selectTriggerProduct(productId: string) {
    const product = findProduct(products, productId);

    setTriggerProductId(product?.id ?? "");
    setTriggerProductName(product?.name ?? "");
  }

  return (
    <form action="/api/admin/ofertas" method="post" className="mt-8 grid gap-6">
      <section className="grid gap-5 rounded-md border border-zinc-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold">Produto sugerido</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">{productsStatusText}</p>
        </div>
        {hasProducts ? (
          <ProductSelect label="Escolher produto sugerido" onSelect={selectSuggestedProduct} products={products} />
        ) : null}
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          ID do produto sugerido
          <input
            name="suggestedProductId"
            onChange={(event) => setSuggestedProductId(event.target.value)}
            required
            value={suggestedProductId}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Nome do produto sugerido
          <input
            name="suggestedProductName"
            onChange={(event) => setSuggestedProductName(event.target.value)}
            required
            value={suggestedProductName}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
      </section>

      <section className="grid gap-5 rounded-md border border-zinc-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold">Produto principal</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Este e o produto onde a sugestao vai aparecer no storefront.
          </p>
        </div>
        {hasProducts ? (
          <ProductSelect label="Escolher produto principal" onSelect={selectTriggerProduct} products={products} />
        ) : null}
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          ID do produto principal
          <input
            name="triggerProductId"
            onChange={(event) => setTriggerProductId(event.target.value)}
            required
            value={triggerProductId}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Nome do produto principal
          <input
            name="triggerProductName"
            onChange={(event) => setTriggerProductName(event.target.value)}
            required
            value={triggerProductName}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
      </section>

      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Status ativa/inativa</h2>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Status
          <select
            name="isActive"
            defaultValue="true"
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          >
            <option value="true">Ativa</option>
            <option value="false">Inativa</option>
          </select>
        </label>
      </section>

      <div className="flex justify-end gap-3 border-t border-zinc-200 pt-5">
        <Link
          href="/admin/ofertas"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Salvar oferta
        </button>
      </div>
    </form>
  );
}
