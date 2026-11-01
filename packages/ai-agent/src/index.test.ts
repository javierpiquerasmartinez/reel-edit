import { describe, expect, test } from "vitest";
import { EditorSession } from "@reel-edit/editor-core";
import { dispatchAgentEditCommand } from "./index.js";

describe("ai-agent command bus adapter", () => {
  test("validates untrusted tool payload and dispatches valid Edit Command onto EditorSession", () => {
    const session = EditorSession.fromSourceMedia({
      id: "source-1",
      fileName: "intro.mp4",
      durationMs: 8000,
      width: 1080,
      height: 1920,
    });

    const invalidResult = dispatchAgentEditCommand(session, {
      type: "unknownCommand",
    });
    expect(invalidResult.applied).toBe(false);

    const validResult = dispatchAgentEditCommand(session, {
      type: "splitClip",
      timelineTimeMs: 3000,
    });
    expect(validResult.applied).toBe(true);
    expect(session.getState().timeline.clips).toHaveLength(2);
  });
});
