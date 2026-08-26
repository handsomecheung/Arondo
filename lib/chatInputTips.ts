export interface ChatInputTip {
  text: string;
  existingSessionOnly?: boolean;
}

export const CHAT_INPUT_TIPS: ChatInputTip[] = [
  { text: "Tip: Type @ to reference a file or directory." },
  { text: "Tip: Type ! to run a saved script or a shell command." },
  { text: "Tip: Type !, then choose Select… to run a file." },
  { text: "Tip: Use + to upload a file, send later, or schedule a message." },
  { text: "Tip: Press Tab to complete a command from the menu." },
  { text: "Tip: Press Ctrl/Cmd + Enter to insert a new line." },
  { text: "Tip: Type / to browse agent commands.", existingSessionOnly: true },
  { text: "Tip: Use /new, /rename, or /delete to manage this session.", existingSessionOnly: true },
  { text: "Tip: Use /review for an independent code review.", existingSessionOnly: true },
  { text: "Tip: Use /btw to ask an independent side question.", existingSessionOnly: true },
];
