import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Bloom dashboard root element was not found.");
}

createRoot(root).render(<App />);
