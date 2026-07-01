import path from "path";
import os from "os";

export function getConfigDir(): string {
  return process.env.ARONDO_CONFIG_DIR
    ? path.resolve(process.env.ARONDO_CONFIG_DIR)
    : path.join(os.homedir(), ".arondo");
}
