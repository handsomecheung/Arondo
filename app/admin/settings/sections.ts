export const adminSettingsSections = [
  {
    slug: "sessions-and-files",
    title: "Session & File Settings",
    description:
      "Manage session retention, automation visibility, and hidden files.",
  },
  {
    slug: "agent-models",
    title: "Agent Models & Defaults",
    description: "Configure available models and defaults for each agent.",
  },
  {
    slug: "automodel",
    title: "Automodel & LLM API Keys",
    description: "Configure automatic model selection and provider API keys.",
  },
  {
    slug: "web-push",
    title: "Web Push Notifications",
    description: "Set the server VAPID contact email for push delivery.",
  },
  {
    slug: "agent-commands",
    title: "Default Agent Commands",
    description: "Manage default slash commands and their instructions.",
  },
  {
    slug: "global-rules",
    title: "Global Agent Rules",
    description: "Edit shared agent rules and choose which runners sync them.",
  },
  {
    slug: "system-tokens",
    title: "System Access Tokens",
    description: "Manage access tokens for administrators and users.",
  },
  {
    slug: "runner-tokens",
    title: "Runner Tokens",
    description: "Manage dedicated authentication tokens for runner machines.",
  },
  {
    slug: "runner-access",
    title: "Runner Access Control",
    description: "Choose which users can access each runner.",
  },
] as const;
