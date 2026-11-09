import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Default: Avi's RYFF interface. Add ?classic to the URL for the previous Loopstack UI (fallback).
const root = createRoot(document.getElementById("root")!);
if (new URLSearchParams(location.search).has("classic")) {
  Promise.all([import("./index.css"), import("./ClassicApp.tsx"), import("@elevenlabs/react")]).then(([, { default: Classic }, el]) =>
    root.render(
      <StrictMode>
        <el.ConversationProvider>
          <Classic />
        </el.ConversationProvider>
      </StrictMode>,
    ),
  );
} else {
  Promise.all([import("./ryff/ryff.css"), import("./ryff/RyffApp.tsx")]).then(([, { default: Ryff }]) =>
    root.render(
      <StrictMode>
        <Ryff />
      </StrictMode>,
    ),
  );
}
