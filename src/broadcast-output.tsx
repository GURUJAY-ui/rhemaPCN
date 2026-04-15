import { createRoot } from "react-dom/client"
import { BroadcastCanvas } from "./broadcast-canvas"

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)
