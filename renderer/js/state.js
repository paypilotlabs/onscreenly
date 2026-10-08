// Renderer state shared across modules. Values that more than one module
// reassigns live here so every module sees the same current value.
export const state = {
  settings: null,
  publikState: null,
  whisperOverview: null,
  aiEl: null,
  caretEl: null,
  responseCount: 0,
  lastRun: null, // { mode, text } of the latest answer, for "Try again"
  transcriptInterimEl: null
};
