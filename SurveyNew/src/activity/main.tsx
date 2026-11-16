// The bridge must start listening before anything else: the host posts the launch message on iframe load.
import "./bridge"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/activity.css"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
