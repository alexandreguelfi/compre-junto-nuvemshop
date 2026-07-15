export type StorefrontScriptKind = "legacy" | "nubesdk";

export type StorefrontScriptConfig = {
  kind: StorefrontScriptKind;
  queryParams: Record<string, unknown>;
  scriptId: string;
};

export type StorefrontScriptRegistrationPlan = StorefrontScriptConfig & {
  action: "already_registered" | "register";
};

export function readOfficialScriptId(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : null;
}

export function planScriptRegistrations(
  configs: StorefrontScriptConfig[],
  registeredScriptIds: Iterable<string>,
): StorefrontScriptRegistrationPlan[] {
  const registered = new Set(registeredScriptIds);

  return configs.map((config) => ({
    ...config,
    action: registered.has(config.scriptId) ? "already_registered" : "register",
  }));
}

export function readRegisteredScriptIds(value: unknown): string[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { result?: unknown }).result)
      ? (value as { result: unknown[] }).result
      : [];

  return records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const id = (record as { id?: unknown }).id;
    return typeof id === "string" || typeof id === "number" ? [String(id)] : [];
  });
}

export function hasAnotherScriptsPage(value: unknown, page: number, perPage: number): boolean {
  if (Array.isArray(value)) return value.length === perPage;
  if (!value || typeof value !== "object") return false;
  const record = value as { result?: unknown; total?: unknown };
  const resultCount = Array.isArray(record.result) ? record.result.length : 0;
  if (typeof record.total === "number" && Number.isFinite(record.total)) return page * perPage < record.total;
  return resultCount === perPage;
}
