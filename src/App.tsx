import { useState } from "react";
import FanGuide from "./FanGuide";
import GlobalVoiceWidget from "./GlobalVoiceWidget";
import CueLogo from "./components/CueLogo";
import ArloCrew from "./screens/ArloCrew";
import IntroSequence from "./screens/IntroSequence";
import RoleSelection from "./screens/RoleSelection";
import EventsQueue from "./screens/EventsQueue";

type View = "intro" | "events" | "roles" | "crew" | "fan";

function ArloFan({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className="product-shell product-shell--fan">
      <header className="product-header">
        <button
          className="product-header__logo"
          onClick={onSwitch}
          aria-label="Return to experience selection"
        >
          <CueLogo surface="dark" />
        </button>
        <div className="product-header__title">
          <strong>Arlo Fan</strong>
          <span>Your live festival guide</span>
        </div>
        <button className="switch-view" onClick={onSwitch}>Switch view</button>
      </header>
      <FanGuide />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("intro");

  if (view === "intro") {
    return <IntroSequence onComplete={() => setView("events")} />;
  }

  if (view === "events") {
    return <EventsQueue onEnterOps={() => setView("roles")} />;
  }

  if (view === "roles") {
    return <RoleSelection onSelect={(role) => setView(role)} />;
  }

  if (view === "crew") {
    return (
      <>
        <ArloCrew onSwitch={() => setView("roles")} />
        <GlobalVoiceWidget activeTab="ops" />
      </>
    );
  }

  return (
    <>
      <ArloFan onSwitch={() => setView("roles")} />
      <GlobalVoiceWidget activeTab="fan" />
    </>
  );
}
