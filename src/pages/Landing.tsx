import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Box,
  Clapperboard,
  FileJson,
  Film,
  Link2,
  MousePointer2,
  Play,
  Presentation,
  Share2,
  Snowflake,
  Spline,
  Users,
} from "lucide-react";
import { SPORT_IDS, type BoardDoc, type PitchView, type Sport } from "@/board/types";
import { createBoardDoc, sidesFor } from "@/formations";
import { SPORT_TEMPLATES, buildTemplate, type TemplateId } from "@/formations/templates";
import { LiveBoard } from "@/components/LiveBoard";
import { heroBoard } from "@/pages/landingBoards";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { LogoMark, Wordmark } from "@/components/Logo";
import { SportIcon } from "@/components/SportMenu";
import { BAR_BUTTON, BAR_DIVIDER, BAR_PRIMARY } from "@/components/ui/bar";
import { useI18n } from "@/i18n/context";
import { useAccount } from "@/lib/useAccount";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { APP_PATH, HOME_PATH, cameHome } from "@/share/routes";
import { cn } from "@/lib/utils";
import { CoffeeLink } from "@/components/CoffeeLink";

const TILTED: PitchView = { half: "full", rotated: true, tilt: true };
/** The attacking half, turned to lie wide, so a card shows the press rather than a strip of it. */
const RIGHT_HALF: PitchView = { half: "right", rotated: true };

/** Every way a board leaves the app, for the share card. The samples are illustrations. */
const SHARE_WAYS = [
  { icon: Link2, key: "landing.share.live", sample: "/share/k7m2q9xd" },
  { icon: Snowflake, key: "landing.share.snapshot", sample: "/app#d=eJyrVkrOz0..." },
  { icon: FileJson, key: "landing.share.file", sample: "counter-attack.json" },
  { icon: Presentation, key: "landing.share.present", sample: null },
] as const;

/** How long the sports card shows each court before moving to the next. */
const SPORT_CYCLE_MS = 4500;

/**
 * The front door, for a visitor who is not signed in (D118).
 *
 * Every board on it is a real document played by the real renderer — the page is a
 * demonstration of the app rather than a description of it. Signed-in visitors never see it:
 * `main.tsx` sends them to the editor before it mounts, and this page does the same if the
 * account answers after it has.
 */
export function Landing() {
  const { t } = useI18n();
  const { account } = useAccount();

  useEffect(() => {
    if (account && !cameHome()) window.location.replace(APP_PATH);
  }, [account]);

  const boards = useBoards();

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden bg-ink-900 text-ink-200 [scroll-behavior:smooth]">
      <Backdrop />

      <nav className="sticky top-0 z-30 border-b border-white/[0.04] bg-ink-900/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <a href={HOME_PATH} className="rounded-lg">
            <Wordmark name={t("app.name")} />
          </a>
          <div className="ml-6 hidden items-center gap-1 md:flex">
            <a href="#features" className={BAR_BUTTON}>
              {t("landing.nav.features")}
            </a>
            <a href="#how" className={BAR_BUTTON}>
              {t("landing.nav.how")}
            </a>
          </div>
          {/* The same end as the editor's bar: the way in, then the language, then the coffee. */}
          <div className="ml-auto flex items-center gap-1.5">
            <a href={APP_PATH} className={BAR_PRIMARY}>
              {t("landing.nav.open")}
              <ArrowRight size={13} />
            </a>
            <span className={BAR_DIVIDER} />
            <LocaleSwitch />
            <span className={BAR_DIVIDER} />
            <CoffeeLink />
          </div>
        </div>
      </nav>

      <Hero doc={boards.hero} />
      <Features boards={boards} />
      <HowItWorks />
      <FinalCall />
      <Footer />
    </div>
  );
}

// ------------------------------------------------------------------ boards

/** The documents the page plays, named in the reader's language. */
function useBoards() {
  const { t } = useI18n();
  return useMemo(() => {
    const labels = (id: TemplateId) => ({
      board: t(`template.${id}`),
      scene: (n: number) => t("doc.scene", { n }),
    });
    // Templates drop the formation's links, since a shape pulled apart by a move is noise on
    // a board meant for editing. On a page meant to show links off, one side keeps them.
    const withLinksOf = (doc: BoardDoc, side: 0 | 1): BoardDoc => {
      const seeded = createBoardDoc(...sidesFor(doc.sport));
      const players = new Set(doc.teams[side].players.map((p) => p.id));
      const links = seeded.links.filter((l) => l.members.every((m) => players.has(m)));
      return { ...doc, links };
    };
    return {
      hero: heroBoard({ board: t("landing.hero.boardName"), scene: (n) => t("doc.scene", { n }) }),
      press: withLinksOf(buildTemplate("press", labels("press")), 0),
      tilt: buildTemplate("buildUp", labels("buildUp")),
      sports: Object.fromEntries(
        SPORT_IDS.map((sport) => {
          const id: TemplateId = SPORT_TEMPLATES[sport][0];
          return [sport, buildTemplate(id, labels(id))];
        }),
      ) as Record<Sport, BoardDoc>,
    };
  }, [t]);
}

// -------------------------------------------------------------------- hero

function Hero({ doc }: { doc: BoardDoc }) {
  const { t } = useI18n();
  return (
    <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pt-24">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-accent animate-fade-up">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          {t("landing.hero.eyebrow")}
        </span>

        {/* Drawn at once, not animated in: it is what the page is measured by as it loads, and
            what a crawler or a tab opened in the background has to be able to read. */}
        <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl">
          {/* Each line balanced on its own, so a wrapped one splits evenly. */}
          <span className="block text-balance">{t("landing.hero.title")}</span>
          <span className="block text-balance bg-gradient-to-r from-accent via-amber-200 to-accent bg-clip-text text-transparent">
            {t("landing.hero.title2")}
          </span>
        </h1>

        <p
          className="mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-ink-300 sm:text-lg"
          style={{ animationDelay: "120ms" }}
        >
          {t("landing.hero.lead")}
        </p>

        <div className="mt-8 flex animate-fade-up flex-wrap items-center gap-3" style={{ animationDelay: "200ms" }}>
          <a href={APP_PATH} className={cn(BAR_PRIMARY, "group px-5 py-3 text-sm")}>
            {t("landing.hero.cta")}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <a href="#features" className={cn(BAR_BUTTON, "px-4 py-3 text-sm")}>
            <Play size={14} />
            {t("landing.hero.more")}
          </a>
        </div>
      </div>

      <figure className="relative animate-fade-up" style={{ animationDelay: "160ms" }}>
        <div
          aria-hidden
          className="absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgb(251_191_36/0.18),transparent)] blur-2xl"
        />
        <div className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-ink-800 to-ink-900 p-3 shadow-2xl shadow-black/60 ring-1 ring-white/[0.03]">
          <div className="mb-3 flex items-center gap-1.5 px-1">
            <span className="size-2.5 rounded-full bg-ink-600" />
            <span className="size-2.5 rounded-full bg-ink-600" />
            <span className="size-2.5 rounded-full bg-ink-600" />
            <span className="ml-3 truncate font-mono text-[11px] text-ink-500">{doc.name}</span>
          </div>
          <LiveBoard
            doc={doc}
            view={RIGHT_HALF}
            label={t("landing.hero.board")}
            still={0.6}
            className="aspect-[11/8] w-full"
          />
        </div>
        <figcaption className="mt-3 text-center text-xs text-ink-500">{t("landing.hero.caption")}</figcaption>
      </figure>
    </section>
  );
}

// ---------------------------------------------------------------- features

function Features({ boards }: { boards: ReturnType<typeof useBoards> }) {
  const { t } = useI18n();
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {t("landing.features.title")}
        </h2>
        <p className="mt-4 text-ink-300">{t("landing.features.lead")}</p>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        <Card
          className="md:col-span-2"
          icon={<Spline size={16} />}
          title={t("landing.feature.links.title")}
          body={t("landing.feature.links.body")}
        >
          <LiveBoard
            doc={boards.press}
            view={RIGHT_HALF}
            still={0.5}
            label={t("landing.feature.links.board")}
            className="aspect-[16/9] w-full"
          />
        </Card>

        <Card
          icon={<Box size={16} />}
          title={t("landing.feature.tilt.title")}
          body={t("landing.feature.tilt.body")}
        >
          <LiveBoard
            doc={boards.tilt}
            view={TILTED}
            still={0.6}
            label={t("landing.feature.tilt.board")}
            className="min-h-64 w-full flex-1"
          />
        </Card>

        <Card
          icon={<Users size={16} />}
          title={t("landing.feature.sports.title")}
          body={t("landing.feature.sports.body")}
        >
          <SportCycle docs={boards.sports} />
        </Card>

        <Card
          icon={<Film size={16} />}
          title={t("landing.feature.export.title")}
          body={t("landing.feature.export.body")}
        >
          <div className="flex h-full min-h-32 items-center justify-center gap-3">
            {["MP4", "GIF", "PNG"].map((format) => (
              <span
                key={format}
                className="rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 font-mono text-sm font-semibold text-white shadow-lg shadow-black/30 transition-transform hover:-translate-y-1"
              >
                {format}
              </span>
            ))}
          </div>
        </Card>

        <Card
          icon={<Share2 size={16} />}
          title={t("landing.feature.share.title")}
          body={t("landing.feature.share.body")}
        >
          <ul className="flex flex-col gap-2">
            {SHARE_WAYS.map(({ icon: Icon, key, sample }) => (
              <li
                key={key}
                className="flex items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 transition-colors hover:border-accent/40"
              >
                <Icon size={14} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="shrink-0 text-xs font-medium text-white">{t(key)}</span>
                    {sample && <span className="truncate font-mono text-[10px] text-ink-500">{sample}</span>}
                  </span>
                  <span className="block truncate text-[11px] text-ink-400">{t(`${key}.hint`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          className="md:col-span-3"
          icon={<Clapperboard size={16} />}
          title={t("landing.feature.video.title")}
          body={t("landing.feature.video.body")}
        />
      </div>
    </section>
  );
}

function Card({
  icon,
  title,
  body,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-ink-800/80 to-ink-800/30 p-5 transition-colors duration-300 hover:border-accent/25",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-48 rounded-full bg-accent/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
          {icon}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-300">{body}</p>
      {children && <div className="mt-5 flex flex-1 flex-col justify-center">{children}</div>}
    </Reveal>
  );
}

/** One court at a time, each playing its sport's first template, with the sports named below. */
function SportCycle({ docs }: { docs: Record<Sport, BoardDoc> }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const sport = SPORT_IDS[index];

  useEffect(() => {
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % SPORT_IDS.length), SPORT_CYCLE_MS);
    return () => window.clearTimeout(timer);
  }, [index]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] w-full">
        <AnimatePresence initial={false}>
          <motion.div
            key={sport}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: DURATION.slow, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DURATION.base } }}
            className="absolute inset-0"
          >
            <LiveBoard doc={docs[sport]} still={0.5} label={t("landing.feature.sports.board")} className="h-full w-full" />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {SPORT_IDS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setIndex(i)}
            aria-pressed={i === index}
            title={t(`sport.${s}`)}
            aria-label={t(`sport.${s}`)}
            className={cn(
              "relative isolate flex size-8 items-center justify-center rounded-lg transition",
              i === index ? "text-ink-900" : "text-ink-400 hover:text-white",
            )}
          >
            {i === index && (
              <motion.span
                layoutId="landing-sport"
                className="absolute inset-0 -z-10 rounded-lg bg-accent"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <SportIcon sport={s} className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ how it works

function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    { icon: <Users size={18} />, title: t("landing.how.1.title"), body: t("landing.how.1.body") },
    { icon: <MousePointer2 size={18} />, title: t("landing.how.2.title"), body: t("landing.how.2.body") },
    { icon: <Play size={18} />, title: t("landing.how.3.title"), body: t("landing.how.3.body") },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <Reveal className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t("landing.how.title")}</h2>
      </Reveal>
      <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-6">
        <span aria-hidden className="absolute left-[16.7%] right-[16.7%] top-6 hidden h-px bg-gradient-to-r from-accent/60 via-accent/30 to-accent/60 md:block" />
        {steps.map((step, i) => (
          <Reveal key={step.title} className="relative flex flex-col items-center text-center">
            <span className="relative flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-ink-800 text-accent shadow-[0_0_24px_-6px_rgb(251_191_36/0.5)]">
              {step.icon}
              <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-accent font-mono text-[10px] font-bold text-ink-900">
                {i + 1}
              </span>
            </span>
            <h3 className="mt-5 text-base font-semibold text-white">{step.title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-300">{step.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

// -------------------------------------------------------------- the close

function FinalCall() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Reveal className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-ink-800 via-ink-800 to-ink-900 px-6 py-16 text-center sm:px-12">
        <div
          aria-hidden
          className="absolute inset-x-0 -top-40 mx-auto h-80 max-w-xl rounded-full bg-accent/20 blur-3xl"
        />
        <PitchLines className="absolute inset-0 h-full w-full text-white/[0.04]" />
        <div className="relative">
          <LogoMark className="mx-auto size-12" />
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t("landing.cta.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-300">{t("landing.cta.body")}</p>
          <a href={APP_PATH} className={cn(BAR_PRIMARY, "group mt-8 inline-flex px-6 py-3 text-sm")}>
            {t("landing.hero.cta")}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-white/[0.05]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-xs text-ink-500 sm:px-6">
        <Wordmark name={t("app.name")} />
        <span>{t("landing.footer.note")}</span>
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitch />
          <span className={BAR_DIVIDER} />
          <CoffeeLink />
        </div>
      </div>
    </footer>
  );
}

// ------------------------------------------------------------------ pieces

/**
 * Rises into place as it scrolls into view, in a browser that can tie an animation to scrolling
 * (`.reveal`, CSS only). Anywhere else — and for a crawler, a reader who asked for less motion,
 * or a tab opened in the background — it is simply there.
 */
function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("reveal", className)}>{children}</div>;
}

/** The page's light: two soft glows and the faint lines of a pitch, fixed behind everything. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_-5%,rgb(251_191_36/0.10),transparent_70%),radial-gradient(45%_45%_at_0%_25%,rgb(34_197_94/0.08),transparent_70%)]" />
      <PitchLines className="absolute left-1/2 top-0 h-[90vh] w-[140vw] max-w-none -translate-x-1/2 text-white/[0.035] [mask-image:radial-gradient(60%_60%_at_50%_30%,black,transparent)]" />
    </div>
  );
}

function PitchLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 105 68" preserveAspectRatio="xMidYMid slice" fill="none" className={className}>
      <g stroke="currentColor" strokeWidth="0.25">
        <rect x="0.5" y="0.5" width="104" height="67" />
        <line x1="52.5" y1="0.5" x2="52.5" y2="67.5" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="0.5" y="13.84" width="16.5" height="40.32" />
        <rect x="88" y="13.84" width="16.5" height="40.32" />
        <rect x="0.5" y="24.84" width="5.5" height="18.32" />
        <rect x="99" y="24.84" width="5.5" height="18.32" />
      </g>
    </svg>
  );
}
