import { createRoot } from "react-dom/client";
import "../styles/tokens.css";
import "../styles/app.css";
import { watchInstall } from "../lib/prefs";
import { App } from "./App";

watchInstall();
createRoot(document.getElementById("root")!).render(<App />);
