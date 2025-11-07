function validateEnvVar(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  // Remove any surrounding quotes that might be present
  value = value.replace(/^['"](.*)['"]$/, "$1");
  if (name.includes("URL")) {
    try {
      new URL(value); // Validate URL format
    } catch {
      throw new Error(`Invalid URL in environment variable ${name}: ${value}`);
    }
  }
  return value;
}

const config = {
  // @ts-ignore
  axiomToken: validateEnvVar(import.meta.env.VITE_AXIOM_TOKEN, "VITE_AXIOM_TOKEN"),
  // @ts-ignore
  axiomOrgId: validateEnvVar(import.meta.env.VITE_AXIOM_ORG_ID, "VITE_AXIOM_ORG_ID"),
  // @ts-ignore
  axiomDataset: validateEnvVar(import.meta.env.VITE_AXIOM_DATASET, "VITE_AXIOM_DATASET"),
  // PostHog config

  posthogKey: validateEnvVar(
    // @ts-ignore
    import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
    "VITE_PUBLIC_POSTHOG_KEY"
  ),
  posthogHost: validateEnvVar(
    // @ts-ignore
    import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    "VITE_PUBLIC_POSTHOG_HOST"
  ),
} as const;

// Type-safe config getter
export function getConfig<T extends keyof typeof config>(key: T): (typeof config)[T] {
  return config[key];
}
