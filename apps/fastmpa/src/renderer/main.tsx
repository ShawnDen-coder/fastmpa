import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DesktopShell } from "./app/desktop-shell.js";

const root = document.getElementById("root");
if (!root) throw new Error("Renderer root element is missing");

createRoot(root).render(
  <StrictMode>
    <DesktopShell />
  </StrictMode>,
);
