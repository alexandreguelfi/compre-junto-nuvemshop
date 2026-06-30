"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";

import type { NuvemshopAdminProduct } from "@/src/lib/nuvemshop/products";

type ProductOfferFormProps = {
  products: NuvemshopAdminProduct[];
  productsLoadFailed: boolean;
};

type FormMessage = {
  kind: "error" | "success";
  text: string;
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
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasProducts = products.length > 0;
  const hasSameProduct =
    Boolean(suggestedProductId.trim()) &&
    Boolean(triggerProductId.trim()) &&
    suggestedProductId.trim() === triggerProductId.trim();
  const productsStatusText = useMemo(() => {
    if (productsLoadFailed) {
      return "Nao foi possivel carregar os produtos agora. Os campos manuais seguem disponiveis.";
    }

    if (!hasProducts) {
      return "Nenhum produto foi retornado pela Nuvemshop. Os campos manuais seguem disponiveis.";
    }

    return `${products.length} produtos carregados da Nuvemshop.`;
  }, [hasProducts, products.length, productsLoadFailed]);

  function getClientValidationError() {
    if (!triggerProductId.trim()) {
      return "Informe o ID do produto principal.";
    }

    if (!triggerProductName.trim()) {
      return "Informe o nome do produto principal.";
    }

    if (!suggestedProductId.trim()) {
      return "Informe o ID do produto sugerido.";
    }

    if (!suggestedProductName.trim()) {
      return "Informe o nome do produto sugerido.";
    }

    if (hasSameProduct) {
      return "O produto principal e o produto sugerido devem ser diferentes.";
    }

    return null;
  }

  function selectSuggestedProduct(productId: string) {
    const product = findProduct(products, productId);

    setMessage(null);
    setSuggestedProductId(product?.id ?? "");
    setSuggestedProductName(product?.name ?? "");
  }

  function selectTriggerProduct(productId: string) {
    const product = findProduct(products, productId);

    setMessage(null);
    setTriggerProductId(product?.id ?? "");
    setTriggerProductName(product?.name ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = getClientValidationError();

    if (validationError) {
      setMessage({ kind: "error", text: validationError });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSubmitting(true);
    setMessage({ kind: "success", text: "Validacoes ok. Salvando oferta..." });

    try {
      const response = await fetch(form.action, {
        body: formData,
        method: "POST",
      });

      if (response.redirected) {
        setMessage({ kind: "success", text: "Oferta salva. Redirecionando..." });
        window.location.href = response.url;
        return;
      }

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload?.error ?? "Nao foi possivel salvar a oferta.",
        });
        setIsSubmitting(false);
        return;
      }

      setMessage({ kind: "success", text: "Oferta salva. Redirecionando..." });
      window.location.href = "/admin/ofertas?created=1";
    } catch {
      setMessage({ kind: "error", text: "Nao foi possivel salvar a oferta agora. Tente novamente." });
      setIsSubmitting(false);
    }
  }

  return (
    <form action="/api/admin/ofertas" method="post" noValidate onSubmit={handleSubmit} className="mt-8 grid gap-6">
      {message ? (
        <div
          aria-live="polite"
          role={message.kind === "error" ? "alert" : "status"}
          className={
            message.kind === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          }
        >
          {message.text}
        </div>
      ) : null}

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
            onChange={(event) => {
              setMessage(null);
              setSuggestedProductId(event.target.value);
            }}
            required
            value={suggestedProductId}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Nome do produto sugerido
          <input
            name="suggestedProductName"
            onChange={(event) => {
              setMessage(null);
              setSuggestedProductName(event.target.value);
            }}
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
            onChange={(event) => {
              setMessage(null);
              setTriggerProductId(event.target.value);
            }}
            required
            value={triggerProductId}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Nome do produto principal
          <input
            name="triggerProductName"
            onChange={(event) => {
              setMessage(null);
              setTriggerProductName(event.target.value);
            }}
            required
            value={triggerProductName}
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900"
          />
        </label>
        {hasSameProduct ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            O produto principal e o produto sugerido devem ser diferentes.
          </p>
        ) : null}
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
          disabled={isSubmitting}
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {isSubmitting ? "Salvando..." : "Salvar oferta"}
        </button>
      </div>
    </form>
  );
}
