import { useEffect, useState } from "react";
import BrandButton from "../components/BrandButton";
import CueLogo from "../components/CueLogo";

export default function IntroSequence({ onComplete }: { onComplete: () => void }) {
  const [enterReady, setEnterReady] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setEnterReady(true), reduced ? 100 : 5900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="intro-screen">
      <button className="intro-skip" onClick={onComplete}>Skip</button>
      <div className="intro-copy" aria-hidden="true">
        <span>Team Introduction</span>
        <strong>We built Cue</strong>
      </div>
      <section className="arlo-reveal" aria-label="Meet Arlo, your AI festival operations assistant">
        <div className="chaos-stage" aria-hidden="true">
          <span className="chaos-item chaos-item--rider">technical rider</span>
          <span className="chaos-item chaos-item--plot">stage plot</span>
          <span className="chaos-item chaos-item--mic">microphone</span>
          <span className="chaos-item chaos-item--schedule">schedule</span>
          <span className="chaos-item chaos-item--lighting">lighting</span>
          <span className="chaos-item chaos-item--alert">crowd alert</span>
          <div className="soundwave">
            <i /><i /><i /><i /><i />
          </div>
        </div>
        <div className="arlo-reveal__logo"><CueLogo surface="dark" /></div>
        <div className="arlo-reveal__words">
          <p className="eyebrow">Meet Arlo</p>
          <h1>Your AI festival operations assistant.</h1>
        </div>
        <BrandButton className={`intro-enter ${enterReady ? "is-ready" : ""}`} onClick={onComplete}>
          Enter Cue <span aria-hidden="true">→</span>
        </BrandButton>
      </section>
    </main>
  );
}
