import { createRoot } from "react-dom/client";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Task Tracker requires a root element.");
}

createRoot(root).render(
  <main className="p-8">
    <h1 className="text-2xl font-semibold">Task Tracker</h1>
  </main>,
);
