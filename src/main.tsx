import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { invoke } from "@tauri-apps/api/core"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip.tsx"
import { hydrateSettings } from "@/stores/settings-store"
import { hydrateBibleStore, initBiblePersistence } from "@/stores/bible-store"

// Render the UI immediately so the app appears faster,
// then hydrate persisted state and reset the backend in the background.
const rootElement = document.getElementById("root")!
createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)

Promise.allSettled([
  invoke("stop_transcription").catch(() => {}),
  hydrateSettings(),
  hydrateBibleStore(),
])
  .then(() => initBiblePersistence())
  .catch(() => {
    // Ignore hydration failures; app should still launch with defaults.
  })
