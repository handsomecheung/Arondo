export const DEFAULT_RUNNER_DOWNLOAD_URL =
  "https://github.com/handsomecheung/Arondo/releases/download/v${version}/arondo-runner-${os}-${arch}";

export function getRunnerDownloadUrlError(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return "Runner download URL must be a non-empty string.";
  }
  const expanded = value.trim().replace(/\$\{(version|os|arch)\}/g, "example");
  if (/[<>]/.test(expanded) || expanded.includes("${")) {
    return "Only ${version}, ${os}, and ${arch} placeholders are supported.";
  }
  const invalidUrl = "Runner download URL must be an absolute HTTP or HTTPS URL.";
  if (!/^https?:\/\//i.test(expanded)) return invalidUrl;
  try {
    const url = new URL(expanded);
    if (url.protocol === "https:" || url.protocol === "http:") return;
  } catch {
    return invalidUrl;
  }
  return invalidUrl;
}
