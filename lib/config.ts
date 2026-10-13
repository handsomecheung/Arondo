import path from "path";
import os from "os";

export function getConfigDir(): string {
  return process.env.ARONDO_CONFIG_DIR
    ? path.resolve(process.env.ARONDO_CONFIG_DIR)
    : path.join(os.homedir(), ".arondo");
}

export type InnerRunnerQuotaMethod = "AUTO" | "LLM";

export function getInnerRunnerQuotaMethod(): InnerRunnerQuotaMethod {
  const val = process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD?.trim().toUpperCase();
  if (!val || val === "AUTO") {
    return "AUTO";
  }
  if (val === "LLM") {
    return "LLM";
  }
  throw new Error(
    `Invalid ARONDO_INNER_RUNNER_QUOTA_METHOD: "${process.env.ARONDO_INNER_RUNNER_QUOTA_METHOD}". Allowed values are "AUTO" or "LLM".`,
  );
}

export type InnerAutomodelMethod = "LLM" | "DM";

export function getInnerAutomodelMethod(): InnerAutomodelMethod {
  const val = process.env.ARONDO_INNER_AUTOMODEL_METHOD?.trim().toUpperCase();
  if (!val || val === "DM") {
    return "DM";
  }
  if (val === "LLM") {
    return "LLM";
  }
  throw new Error(
    `Invalid ARONDO_INNER_AUTOMODEL_METHOD: "${process.env.ARONDO_INNER_AUTOMODEL_METHOD}". Allowed values are "LLM" or "DM".`,
  );
}

