/**
 * Helper for multi-user threads.
 *
 * When multiple people share a single thread, wrap each user message in a
 * <turn> tag so the agent can distinguish speakers. All participants use
 * the same resourceId (keyed on the conversation, not the user) and the
 * same threadId.
 *
 * Example usage in agent instructions:
 *
 *   Every user message is wrapped in a <turn> tag:
 *
 *     <turn author_id="u_alice" author_name="Alice" functional_role="editor">
 *     ...message text...
 *     </turn>
 *
 *   Rules:
 *   1. Address users by their author_name.
 *   2. Respect functional_role.
 *   3. When attributing past statements, read author_name from the <turn> tag.
 *   4. Do not echo the <turn> tags back at the user.
 */

export type Speaker = {
  id: string;
  name: string;
  role: string;
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function asUserTurn(speaker: Speaker, text: string): { role: "user"; content: string } {
  const id = escapeAttr(speaker.id);
  const name = escapeAttr(speaker.name);
  const role = escapeAttr(speaker.role);
  return {
    role: "user",
    content: `<turn author_id="${id}" author_name="${name}" functional_role="${role}">\n${text}\n</turn>`,
  };
}
