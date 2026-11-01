import Image from "next/image";

/**
 * Fixed star positions/delays/sizes — deliberately no Math.random() anywhere here, so the
 * sparkle/drift pattern is pixel-identical on every page load, not just "similar looking."
 */
const STARS: Array<{ top: string; left: string; size: string; delaySeconds: number }> = [
  { top: "4%", left: "10%", size: "1.75rem", delaySeconds: 0 },
  { top: "12%", left: "85%", size: "1.25rem", delaySeconds: 0.8 },
  { top: "45%", left: "2%", size: "1.5rem", delaySeconds: 1.6 },
  { top: "60%", left: "92%", size: "2rem", delaySeconds: 2.4 },
  { top: "85%", left: "15%", size: "1.25rem", delaySeconds: 3.2 },
  { top: "90%", left: "78%", size: "1.5rem", delaySeconds: 4 },
];

export function WatchingWiseHero() {
  return (
    <div className="hero-mascot-stage relative mx-auto w-full max-w-md select-none">
      {STARS.map((star) => (
        <span
          key={`${star.top}-${star.left}`}
          aria-hidden="true"
          className="hero-star"
          style={{ top: star.top, left: star.left, fontSize: star.size, animationDelay: `${star.delaySeconds}s` }}
        >
          ★
        </span>
      ))}
      <Image
        src="/watchingwise-hero.png"
        alt="WatchingWise.com — parent-controlled video learning platform"
        width={1254}
        height={1254}
        priority
        className="hero-mascot-image relative z-10 h-auto w-full rounded-3xl"
      />
    </div>
  );
}
