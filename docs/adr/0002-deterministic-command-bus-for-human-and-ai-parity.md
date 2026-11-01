# Deterministic command bus for human and AI editing parity

All changes to the Timeline are executed exclusively through a shared catalog of typed, reversible Edit Commands rather than separate UI state mutations and AI video generation pipelines. Both manual UI controls and LLM tool calls dispatch the same Edit Commands against the non-destructive Timeline, ensuring predictable results, unified Undo/Redo history, and zero drift between what a human can edit and what the AI agent can automate.
