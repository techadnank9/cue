import BrandButton from "../components/BrandButton";
import CueLogo from "../components/CueLogo";

const productionItems = [
  { key: "mic", icon: "●", label: "microphone" },
  { key: "schedule", icon: "▦", label: "schedule" },
  { key: "plot", icon: "⌁", label: "stage plot" },
  { key: "lighting", icon: "✦", label: "lighting" },
  { key: "alert", icon: "!", label: "crowd alert" },
  { key: "patch", icon: "⌘", label: "patch list" },
];

export default function IntroSequence({ onComplete }: { onComplete: () => void }) {
  return (
    <main className="intro-screen">
      <section className="arlo-reveal" aria-labelledby="meet-arlo-title">
        <p className="intro-kicker">Built for live moments.</p>

        <div className="intro-visual" aria-hidden="true">
          <div className="chaos-stage">
            {productionItems.map((item) => (
              <span className={`chaos-item chaos-item--${item.key}`} key={item.key}>
                <i>{item.icon}</i>
                {item.label}
              </span>
            ))}
            <div className="soundwave"><i /><i /><i /><i /><i /></div>
          </div>
          <div className="arlo-reveal__logo"><CueLogo surface="dark" /></div>
        </div>

        <div className="arlo-reveal__words">
          <h1 id="meet-arlo-title">Meet Arlo</h1>
          <p>The voice that keeps the festival moving.</p>
        </div>

        <div className="intro-actions">
          <BrandButton onClick={onComplete}>Enter Cue <span aria-hidden="true">→</span></BrandButton>
          <button className="intro-skip" onClick={onComplete}>Skip animation</button>
        </div>
      </section>
    </main>
  );
}
