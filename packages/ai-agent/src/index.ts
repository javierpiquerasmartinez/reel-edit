import {
  EditCommandSchema,
  type DispatchResult,
  type EditorSession,
} from "@reel-edit/editor-core";

export function dispatchAgentEditCommand(
  session: EditorSession,
  untrustedCommand: unknown,
): DispatchResult {
  const parsed = EditCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    return {
      applied: false,
      reason: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  return session.dispatch(parsed.data);
}
