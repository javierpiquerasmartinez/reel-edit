# 06: BYOK AI Copilot Agent with Atomic Batch Tool Calling

**What to build:** Deliver the `ai-agent` package and the right-hand AI Copilot panel where creators configure their own API key (BYOK for OpenAI, Anthropic, or Google Gemini stored locally in browser storage) and instruct an AI editing agent via natural language chat or 1-click workflow chips. The AI inspects the current **Timeline**, **Silence Regions**, and **Transcript** and executes multi-step human-equivalent edits by calling the 9 deterministic **Edit Commands** grouped into a single reversible **Batch Command**.

**Blocked by:** 02: Clip Framing (Cover/Contain), Punch-in Zoom & Opening Hook Reordering, 03: Audio Waveform Visualization & Algorithmic Silence Region Removal, 04: Hybrid Speech Transcription, Source-Anchored Captions & Text-Based Video Editing, 05: Animated Caption Presets, Curated Fonts & Word Emphasis Styling

**Status:** ready-for-agent

- [ ] Creators can select their AI provider (OpenAI, Anthropic, or Google Gemini) and save their API key in browser `localStorage`/`sessionStorage` without any backend server intermediary.
- [ ] The AI Copilot panel provides 1-click workflow chips (e.g., *"Clean silences + Hormozi captions + Emphasize keywords"*, *"Create opening Hook + Punch-in zooms"*, *"Cut filler/repeated takes from script"*) as well as free-form natural language chat.
- [ ] The `ai-agent` orchestrator supplies the LLM with a structured summary of the **Timeline** (**Clips**, **Silence Regions**, **Transcript** with **Word Timings**, and current **Caption Preset**) and exposes all 9 **Edit Commands** (`splitClip`, `deleteClips`, `trimClip`, `reorderClip`/`duplicateClipAsHook`, `setClipTransform`, `removeSilences`, `deleteWordRange`, `updateWords`, `updateCaptionStyle`) as `Zod`-validated tool definitions.
- [ ] All tool calls returned by the LLM in a single turn are validated and dispatched onto `EditorSession` as one atomic **Batch Command**, immediately updating the `9:16` player and **Timeline**.
- [ ] The chat UI displays summary badges for every **Edit Command** executed in the turn and includes a 1-click *"Undo AI turn"* action (also triggered by `Cmd/Ctrl+Z`) that reverts the entire **Batch Command** at once.
- [ ] Automated tests at the `ai-agent` → `EditorSession` seam verify multi-tool execution, schema validation, and single-step **Batch Command** undo/redo using mocked LLM tool-call responses.
