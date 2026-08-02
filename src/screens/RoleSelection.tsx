import BrandButton from "../components/BrandButton";
import CueLogo from "../components/CueLogo";

type Experience = "crew" | "fan";

export default function RoleSelection({ onSelect }: { onSelect: (experience: Experience) => void }) {
  return (
    <main className="role-screen">
      <div className="role-screen__brand"><CueLogo surface="dark" /></div>
      <section className="role-panel" aria-labelledby="role-heading">
        <p className="eyebrow">Cue</p>
        <h1 id="role-heading">Choose your experience</h1>
        <p className="role-panel__intro">One festival, two simple ways to stay in the moment.</p>
        <div className="role-grid">
          <article className="role-card role-card--crew">
            <span className="role-card__icon" aria-hidden="true">✦</span>
            <div>
              <h2>Arlo Crew</h2>
              <p>For festival organizers and production teams</p>
            </div>
            <BrandButton onClick={() => onSelect("crew")}>
              Enter Arlo Crew <span aria-hidden="true">→</span>
            </BrandButton>
          </article>
          <article className="role-card role-card--fan">
            <span className="role-card__icon" aria-hidden="true">♪</span>
            <div>
              <h2>Arlo Fan</h2>
              <p>For festival attendees</p>
            </div>
            <BrandButton tone="secondary" onClick={() => onSelect("fan")}>
              Enter Arlo Fan <span aria-hidden="true">→</span>
            </BrandButton>
          </article>
        </div>
        <p className="role-panel__note">Choose the view that fits your day. You can switch anytime.</p>
      </section>
    </main>
  );
}
