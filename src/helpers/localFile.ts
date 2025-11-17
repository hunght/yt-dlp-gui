const normalizeLocalPath = (inputPath: string | null | undefined): string => {
  if (!inputPath) return "";

  let normalized = inputPath.replace(/\\/g, "/");

  if (normalized.startsWith("file://")) {
    normalized = normalized.replace(/^file:\/\//, "");
  }

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  return normalized;
};

export const toLocalFileUrl = (inputPath: string | null | undefined): string => {
  const normalized = normalizeLocalPath(inputPath);
  if (!normalized) return "";
  return `local-file://${encodeURI(normalized)}`;
};
