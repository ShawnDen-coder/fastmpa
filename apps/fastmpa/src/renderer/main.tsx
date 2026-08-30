import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App(): React.JSX.Element {
  return (
    <main className="app-shell">
      <header className="title-bar">FastMPA</header>
      <section className="welcome-card">
        <p className="eyebrow">Desktop workspace</p>
        <h1>FastMPA</h1>
        <p>
          Application host is ready. Conversations, runs, and approvals are
          coming next.
        </p>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Renderer root element is missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
