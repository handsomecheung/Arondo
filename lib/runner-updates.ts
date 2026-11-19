import { gt, valid } from "semver";
import { DEFAULT_RUNNER_DOWNLOAD_URL } from "./runner-update-settings";

export function getRunnerUpdate(
  runner: { version?: string; os?: string; arch?: string },
  serverVersion: string,
  template = DEFAULT_RUNNER_DOWNLOAD_URL,
): { version: string; downloadUrl: string } | null {
  const current = valid(runner.version ?? "");
  const target = valid(serverVersion);
  if (!current || !target || !gt(target, current) || !runner.os || !runner.arch) {
    return null;
  }
  const values = {
    version: target,
    os: runner.os === "darwin" ? "macos" : runner.os,
    arch: runner.arch,
  };
  return {
    version: target,
    downloadUrl: template.replace(/\$\{(version|os|arch)\}/g, (_, key: keyof typeof values) =>
      encodeURIComponent(values[key]),
    ),
  };
}
