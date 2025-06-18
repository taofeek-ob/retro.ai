import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL || "https://astute-pheasant-798.convex.cloud"
);

createRoot(document.getElementById("root")!).render(
  <ConvexAuthProvider client={convex}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ConvexAuthProvider>,
);
