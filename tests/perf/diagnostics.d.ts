// The QA build's read-only diagnostics (src/main.ts), as the perf specs read them.
type CapivaraInspect = { snapshot?: { phase: string }; renderState: { loading: boolean }; renderedFrames: number; renderDensity?: number; renderer?: { drawCalls: number } };
interface Window { __capivara?: { inspect(): CapivaraInspect } }
