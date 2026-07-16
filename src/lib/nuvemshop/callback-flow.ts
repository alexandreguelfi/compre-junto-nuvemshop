export type NuvemshopCallbackInput = {
  code: string | null;
  error: string | null;
  errorDescriptionPresent: boolean;
  state: string | null;
};

type SafeLogDetails = Record<string, string | number | boolean | null>;

type NuvemshopToken = {
  accessToken: string;
  scopes: string[];
  storeId: string;
};

type Installation = {
  accessTokenCiphertext: string;
  scopes: string[];
  storeId: string;
};

export type NuvemshopCallbackDependencies = {
  createSuccessResponse: (providerStoreId: string) => Response;
  encryptAccessToken: (accessToken: string) => string;
  exchangeCode: (code: string) => Promise<NuvemshopToken>;
  getSafeErrorDetails: (error: unknown) => SafeLogDetails;
  logFailure: (stage: string, details?: SafeLogDetails) => void;
  saveInstallation: (installation: Installation) => Promise<void>;
  validateState: (state: string) => boolean;
};

type SavedStore = {
  commercialStatus: string;
  createdAt: Date;
  id: string;
  installedAt: Date | null;
  nuvemshopStoreId: string;
  trialEndsAt: Date | null;
  trialStartedAt: Date | null;
  updatedAt: Date;
};

type StoreUpsertArgs = {
  where: { nuvemshopStoreId: string };
  create: {
    accessTokenCiphertext: string;
    commercialStatus: "TRIALING";
    disconnectedAt: null;
    nuvemshopStoreId: string;
    scopes: string[];
    status: "CONNECTED";
    trialEndsAt: Date;
    trialStartedAt: Date;
  };
  update: {
    accessTokenCiphertext: string;
    disconnectedAt: null;
    scopes: string[];
    status: "CONNECTED";
  };
  select: {
    commercialStatus: true;
    createdAt: true;
    id: true;
    installedAt: true;
    nuvemshopStoreId: true;
    trialEndsAt: true;
    trialStartedAt: true;
    updatedAt: true;
  };
};

type StoreRepository = {
  update: (args: {
    where: { id: string };
    data: { trialEndsAt: Date; trialStartedAt: Date };
  }) => Promise<unknown>;
  upsert: (args: StoreUpsertArgs) => Promise<SavedStore>;
};

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function safeProviderError(error: string): string {
  const normalized = error.trim().toLowerCase();
  const knownErrors = new Set(["access_denied", "invalid_request", "server_error", "temporarily_unavailable"]);

  return knownErrors.has(normalized) ? normalized : "unknown_provider_error";
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function upsertNuvemshopInstallation(
  repository: StoreRepository,
  installation: Installation,
  trialDays: number,
  now = new Date(),
): Promise<SavedStore> {
  const savedStore = await repository.upsert({
    where: {
      nuvemshopStoreId: installation.storeId,
    },
    create: {
      nuvemshopStoreId: installation.storeId,
      accessTokenCiphertext: installation.accessTokenCiphertext,
      commercialStatus: "TRIALING",
      disconnectedAt: null,
      scopes: installation.scopes,
      status: "CONNECTED",
      trialEndsAt: addDays(now, trialDays),
      trialStartedAt: now,
    },
    update: {
      accessTokenCiphertext: installation.accessTokenCiphertext,
      disconnectedAt: null,
      scopes: installation.scopes,
      status: "CONNECTED",
    },
    select: {
      commercialStatus: true,
      createdAt: true,
      id: true,
      installedAt: true,
      nuvemshopStoreId: true,
      trialEndsAt: true,
      trialStartedAt: true,
      updatedAt: true,
    },
  });

  if (!savedStore.trialStartedAt || !savedStore.trialEndsAt) {
    const trialStartedAt = savedStore.trialStartedAt ?? savedStore.installedAt ?? savedStore.createdAt;

    await repository.update({
      where: {
        id: savedStore.id,
      },
      data: {
        trialEndsAt: savedStore.trialEndsAt ?? addDays(trialStartedAt, trialDays),
        trialStartedAt,
      },
    });
  }

  return savedStore;
}

export async function handleNuvemshopCallback(
  input: NuvemshopCallbackInput,
  dependencies: NuvemshopCallbackDependencies,
): Promise<Response> {
  if (input.error !== null) {
    dependencies.logFailure("provider_error", {
      errorDescription: input.errorDescriptionPresent ? "present" : "missing",
      providerError: safeProviderError(input.error),
      state: input.state === null ? "missing" : "present",
    });

    return jsonError("Nuvemshop authorization was not completed.", 400);
  }

  if (!input.code) {
    dependencies.logFailure("missing_code", {
      state: input.state === null ? "missing" : "present",
    });

    return jsonError("Missing Nuvemshop authorization code.", 400);
  }

  if (input.state !== null && !dependencies.validateState(input.state)) {
    dependencies.logFailure("invalid_state", {
      state: "present",
    });

    return jsonError("Invalid Nuvemshop installation state.", 400);
  }

  let token: NuvemshopToken;

  try {
    token = await dependencies.exchangeCode(input.code);
  } catch (error) {
    dependencies.logFailure("token_exchange", {
      state: input.state === null ? "missing" : "present",
      ...dependencies.getSafeErrorDetails(error),
    });

    return jsonError("Unable to exchange Nuvemshop authorization code.", 502);
  }

  let accessTokenCiphertext: string;

  try {
    accessTokenCiphertext = dependencies.encryptAccessToken(token.accessToken);
  } catch {
    dependencies.logFailure("token_encryption", {
      storeId: token.storeId,
    });

    return jsonError("Unable to secure Nuvemshop access token.", 500);
  }

  try {
    await dependencies.saveInstallation({
      accessTokenCiphertext,
      scopes: token.scopes,
      storeId: token.storeId,
    });
  } catch (error) {
    dependencies.logFailure("store_upsert", {
      hasAccessToken: true,
      scopesCount: token.scopes.length,
      storeId: token.storeId,
      ...dependencies.getSafeErrorDetails(error),
    });

    return jsonError("Unable to save Nuvemshop store installation.", 500);
  }

  try {
    return dependencies.createSuccessResponse(token.storeId);
  } catch {
    dependencies.logFailure("redirect", {
      storeId: token.storeId,
    });

    return jsonError("Nuvemshop installation saved, but redirect failed.", 500);
  }
}
