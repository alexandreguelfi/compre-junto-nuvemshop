"use client";

import { type FormEvent, useState } from "react";

type BillingCheckoutActionProps = {
  defaultEmail: string | null;
  disabledReason: string | null;
};

type CheckoutResponse = {
  checkoutUrl?: string;
  error?: string;
};

export function BillingCheckoutAction({ defaultEmail, disabledReason }: BillingCheckoutActionProps) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(disabledReason);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabledReason) {
      setMessage(disabledReason);
      return;
    }

    setIsSubmitting(true);
    setMessage("Criando checkout seguro no Mercado Pago...");

    try {
      const response = await fetch("/api/billing/checkout", {
        body: JSON.stringify({
          payerEmail: email,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as CheckoutResponse | null;

      if (!response.ok || !payload?.checkoutUrl) {
        setMessage(payload?.error ?? "Nao foi possivel criar o checkout agora.");
        setIsSubmitting(false);
        return;
      }

      setMessage("Checkout criado. Redirecionando...");
      window.location.href = payload.checkoutUrl;
    } catch {
      setMessage("Nao foi possivel criar o checkout agora.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 rounded-md border border-zinc-200 bg-white p-5">
      <label className="grid gap-2 text-sm font-medium text-zinc-800">
        E-mail do pagador
        <input
          autoComplete="email"
          disabled={isSubmitting || Boolean(disabledReason)}
          onChange={(event) => {
            setEmail(event.target.value);
            setMessage(disabledReason);
          }}
          required
          type="email"
          value={email}
          className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
        />
      </label>
      {message ? (
        <p
          role={disabledReason ? "alert" : "status"}
          className={
            disabledReason
              ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
              : "text-sm font-medium text-zinc-600"
          }
        >
          {message}
        </p>
      ) : null}
      <button
        disabled={isSubmitting || Boolean(disabledReason)}
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isSubmitting ? "Criando checkout..." : "Assinar agora"}
      </button>
    </form>
  );
}
