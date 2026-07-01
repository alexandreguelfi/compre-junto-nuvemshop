"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type OfferStatusActionProps = {
  isActive: boolean;
  offerId: string;
};

export function OfferStatusAction({ isActive, offerId }: OfferStatusActionProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nextStatus = !isActive;

  async function updateStatus() {
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.set("isActive", nextStatus ? "true" : "false");

    try {
      const response = await fetch(`/api/admin/ofertas/${offerId}`, {
        body: formData,
        method: "PATCH",
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Nao foi possivel atualizar o status.");
        setIsSubmitting(false);
        return;
      }

      router.refresh();
      setIsSubmitting(false);
    } catch {
      setError("Nao foi possivel atualizar o status agora.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        disabled={isSubmitting}
        onClick={updateStatus}
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
      >
        {isSubmitting ? "Atualizando..." : nextStatus ? "Ativar" : "Desativar"}
      </button>
      {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
