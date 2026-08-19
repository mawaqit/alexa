import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import { App } from "./App";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    {/* "user" defers to prefers-reduced-motion: transform-driven animations
        (springs, slides, scales) collapse to instant everywhere in the app;
        opacity fades still play. One switch instead of threading a
        useReducedMotion() check through every component. */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
