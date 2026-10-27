import { getAppSettings } from "./store";

export async function getShowAutomationSessions(): Promise<boolean> {
  return (await getAppSettings()).showAutomationSessions === true;
}
