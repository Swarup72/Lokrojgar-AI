
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import "./AppShell.css";

export function AppShell() {
  return (
    <div className="app-shell">
      {/* Permanently visible left sidebar */}
      <Navbar />

      {/* All website pages */}
      <div className="app-shell-content">
        <main className="app-shell-main page-animate" id="main-content">
          <Outlet />
        </main>

        {/* Footer remains to the right of sidebar */}
        <Footer />
      </div>
    </div>
  );
}
