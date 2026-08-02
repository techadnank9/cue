type CueLogoProps = {
  surface?: "dark" | "light";
  className?: string;
};

export default function CueLogo({ surface = "dark", className = "" }: CueLogoProps) {
  const src = surface === "dark" ? "/cue/cue-logo-light.png" : "/cue/cue-logo-dark.png";

  return <img src={src} alt="Cue logo" className={`cue-logo ${className}`} />;
}
