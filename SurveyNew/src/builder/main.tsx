import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/builder.css"
import { BuilderApp } from "./BuilderApp"
import { loadDraft, startAutosave, useBuilder } from "./store"

const draft = loadDraft()
if (draft?.survey) useBuilder.getState().load(draft.survey, draft.meta, draft.linked)
startAutosave()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BuilderApp firstRun={!draft} />
  </StrictMode>,
)
