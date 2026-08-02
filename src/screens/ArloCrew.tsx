import { useState } from "react";
import BackstageOps from "../BackstageOps";
import CueLogo from "../components/CueLogo";
import ShowConsole from "./ShowConsole";

export default function ArloCrew({ onSwitch }: { onSwitch: () => void }) {
  const [section, setSection] = useState<"site" | "show">("site");

  return (
    <div className="product-shell">
      <header className="product-header">
        <button className="product-header__logo" onClick={onSwitch} aria-label="Return to experience selection"><CueLogo surface="dark" /></button>
        <div className="product-header__title"><strong>Arlo Crew</strong><span>Outside Lands Operations</span></div>
        <button className="switch-view" onClick={onSwitch}>Switch view</button>
      </header>
      <nav className="crew-nav" aria-label="Arlo Crew sections">
        <button className={section === "site" ? "is-active" : ""} onClick={() => setSection("site")}>Festival overview</button>
        <button className={section === "show" ? "is-active" : ""} onClick={() => setSection("show")}>Show operations</button>
      </nav>
      <main>{section === "site" ? <BackstageOps /> : <ShowConsole />}</main>
    </div>
  );
}
