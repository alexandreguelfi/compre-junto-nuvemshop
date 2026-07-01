"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { NuvemshopAdminProduct } from "@/src/lib/nuvemshop/products";

type ProductOfferFormProps = {
  action?: string;
  initialValues?: ProductOfferInitialValues;
  submitLabel?: string;
  submitMethod?: "POST" | "PATCH";
  submittingLabel?: string;
  products: NuvemshopAdminProduct[];
  productsLoadFailed: boolean;
  successRedirect?: string;
};

type FormMessage = {
  kind: "error" | "success";
  text: string;
};

export type ProductOfferInitialValues = {
  isActive: boolean;
  suggestedProductId: string;
  suggestedProductName: string;
  triggerProductId: string;
  triggerProductName: string;
};

const OFFER_FORM_MESSAGES = {
  missingFields: "Preencha todos os itens obrigatórios para salvar a oferta.",
  missingSuggestedName: "Informe o nome do produto sugerido para continuar.",
  missingSuggestedProduct: "Selecione o produto sugerido para continuar.",
  missingTriggerName: "Informe o nome do produto principal para continuar.",
  missingTriggerProduct: "Selecione o produto principal para continuar.",
  sameProduct: "Escolha produtos diferentes para criar uma oferta Compre Junto.",
  saveFailed: "Nao foi possivel salvar a oferta.",
  saveFailedRetry: "Nao foi possivel salvar a oferta agora. Tente novamente.",
  saving: "Validacoes ok. Salvando oferta...",
  saved: "Oferta salva. Redirecionando...",
};

function findProduct(products: NuvemshopAdminProduct[], productId: string) {
  return products.find((product) => product.id === productId) ?? null;
}

function ProductSelect({
  label,
  onSelect,
  products,
  value,
}: {
  label: string;
  onSelect: (productId: string) => void;
  products: NuvemshopAdminProduct[];
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-zinc-800">
      {label}
      <select
        disabled={products.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        value={value}
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

export function ProductOfferForm({
  action = "/api/admin/ofertas",
  initialValues,
  products,
  productsLoadFailed,
  submitLabel = "Salvar oferta",
  submitMethod = "POST",
  submittingLabel = "Salvando...",
  successRedirect = "/admin/ofertas?created=1",
}: ProductOfferFormProps) {
  const [suggestedProductId, setSuggestedProductId] = useState(initialValues?.suggestedProductId ?? "");
  const [suggestedProductName, setSuggestedProductName] = useState(initialValues?.suggestedProductName ?? "");
  const [triggerProductId, setTriggerProductId] = useState(initialValues?.triggerProductId ?? "");
  const [triggerProductName, setTriggerProductName] = useState(initialValues?.triggerProductName ?? "");
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messageRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (message?.kind !== "error") {
      return;
    }

    messageRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    messageRef.current?.focus({
      preventScroll: true,
    });
  }, [message]);

  function getClientValidationError() {
    const missingTriggerProduct = !triggerProductId.trim();
    const missingTriggerName = Boolean(triggerProductId.trim()) && !triggerProductName.trim();
    const missingSuggestedProduct = !suggestedProductId.trim();
    const missingSuggestedName = Boolean(suggestedProductId.trim()) && !suggestedProductName.trim();
    const missingItems = [
      missingTriggerProduct,
      missingTriggerName,
      missingSuggestedProduct,
      missingSuggestedName,
    ].filter(Boolean).length;

    if (missingItems > 1) {
      return OFFER_FORM_MESSAGES.missingFields;
    }

    if (missingTriggerProduct) {
      return OFFER_FORM_MESSAGES.missingTriggerProduct;
    }

    if (missingTriggerName) {
      return OFFER_FORM_MESSAGES.missingTriggerName;
    }

    if (missingSuggestedProduct) {
      return OFFER_FORM_MESSAGES.missingSuggestedProduct;
    }

    if (missingSuggestedName) {
      return OFFER_FORM_MESSAGES.missingSuggestedName;
    }

    if (hasSameProduct) {
      return OFFER_FORM_MESSAGES.sameProduct;
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
    setMessage({ kind: "success", text: OFFER_FORM_MESSAGES.saving });

    try {
      const response = await fetch(form.action, {
        body: formData,
        method: submitMethod,
      });

      if (response.redirected) {
        setMessage({ kind: "success", text: OFFER_FORM_MESSAGES.saved });
        window.location.href = response.url;
        return;
      }

      const payload = (await response.json().catch(() => null)) as { error?: string; redirect?: string } | null;

      if (!response.ok) {
        setMessage({
          kind: "error",
          text: payload?.error ?? OFFER_FORM_MESSAGES.saveFailed,
        });
        setIsSubmitting(false);
        return;
      }

      setMessage({ kind: "success", text: OFFER_FORM_MESSAGES.saved });
      window.location.href = payload?.redirect ?? successRedirect;
    } catch {
      setMessage({ kind: "error", text: OFFER_FORM_MESSAGES.saveFailedRetry });
      setIsSubmitting(false);
    }
  }

  return (
    <form action={action} method="post" noValidate onSubmit={handleSubmit} className="mt-8 grid gap-6">
      {message ? (
        <div
          aria-live="polite"
          ref={messageRef}
          role={message.kind === "error" ? "alert" : "status"}
          tabIndex={-1}
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
          <ProductSelect
            label="Escolher produto sugerido"
            onSelect={selectSuggestedProduct}
            products={products}
            value={suggestedProductId}
          />
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
          <ProductSelect
            label="Escolher produto principal"
            onSelect={selectTriggerProduct}
            products={products}
            value={triggerProductId}
          />
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
            {OFFER_FORM_MESSAGES.sameProduct}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Status ativa/inativa</h2>
        <label className="grid gap-2 text-sm font-medium text-zinc-800">
          Status
          <select
            name="isActive"
            onChange={(event) => {
              setMessage(null);
              setIsActive(event.target.value !== "false");
            }}
            value={isActive ? "true" : "false"}
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
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
