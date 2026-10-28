import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function AppShell() {
  return (
    <>
      <Navbar />
      <main className="page-animate" style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
