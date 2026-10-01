import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { SPORT_IDS, type BoardDoc, type PitchView, type Sport } from "@/board/types";
import { createBoardDoc, sidesFor } from "@/formations";
import { SPORT_TEMPLATES, buildTemplate, type TemplateId } from "@/formations/templates";
import { LiveBoard } from "@/components/LiveBoard";
import { heroBoard } from "@/pages/landingBoards";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { Wordmark } from "@/components/Logo";
import { SportIcon } from "@/components/SportMenu";
import { BAR_BUTTON, BAR_DIVIDER, BAR_PRIMARY } from "@/components/ui/bar";
import { useI18n } from "@/i18n/context";
import { useAccount } from "@/lib/useAccount";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { APP_PATH, HOME_PATH, cameHome } from "@/share/routes";
import { cn } from "@/lib/utils";
import { CoffeeLink } from "@/components/CoffeeLink";

/**
 * The headline's cut: the face at its widest and heaviest, set tight, like a touchline board.
 * Pass it to `cn` after any text size, which would otherwise merge its leading away.
 */
const DISPLAY = "font-extrabold font-stretch-semi-expanded leading-[0.98] tracking-[-0.02em]";

const FULL: PitchView = { half: "full", rotated: false };
const TILTED: PitchView = { half: "full", rotated: true, tilt: true };
/** The attacking half, turned to lie wide, so a card shows the press rather than a strip of it. */
const RIGHT_HALF: PitchView = { half: "right", rotated: true };

/** Every way a board leaves the app, for the sharing list. The samples are illustrations. */
const SHARE_WAYS = [
  { key: "landing.share.live", sample: "/share/k7m2q9xd" },
  { key: "landing.share.snapshot", sample: "/app#d=eJyrVkrOz0..." },
  { key: "landing.share.file", sample: "counter-attack.json" },
  { key: "landing.share.present", sample: null },
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

/**
 * The headline at full width in the face's widest cut, then the board as wide as the page —
 * no frame around it: it is the app drawing, not a picture of the app.
 */
function Hero({ doc }: { doc: BoardDoc }) {
  const { t } = useI18n();
  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 lg:pt-20">
      {/* Drawn at once, not animated in: it is what the page is measured by as it loads, and
          what a crawler or a tab opened in the background has to be able to read. */}
      <h1 className={cn("text-[clamp(2.5rem,6vw,5rem)] text-white", DISPLAY)}>
        {/* Each line balanced on its own, so a wrapped one splits evenly. */}
        <span className="block text-balance">{t("landing.hero.title")}</span>
        <span className="block text-balance text-ink-400">{t("landing.hero.title2")}</span>
      </h1>

      <div className="mt-8 grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <p className="max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">{t("landing.hero.lead")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={APP_PATH} className={cn(BAR_PRIMARY, "group px-5 py-3 text-sm")}>
            {t("landing.hero.cta")}
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </a>
          <a href="#features" className={cn(BAR_BUTTON, "px-4 py-3 text-sm")}>
            {t("landing.hero.more")}
          </a>
        </div>
      </div>

      <figure className="mt-12 animate-fade-up">
        <LiveBoard
          doc={doc}
          view={FULL}
          label={t("landing.hero.board")}
          still={0.6}
          className="aspect-[146/100] w-full"
        />
        <figcaption className="mt-3 text-xs text-ink-500">{t("landing.hero.caption")}</figcaption>
      </figure>
    </section>
  );
}

// ---------------------------------------------------------------- features

function Features({ boards }: { boards: ReturnType<typeof useBoards> }) {
  const { t } = useI18n();
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="max-w-2xl">
        <h2 className={cn("text-4xl text-white sm:text-5xl", DISPLAY)}>{t("landing.features.title")}</h2>
        <p className="mt-4 text-ink-300">{t("landing.features.lead")}</p>
      </div>

      <div className="mt-16 flex flex-col gap-20 lg:gap-24">
        <Row title={t("landing.feature.links.title")} body={t("landing.feature.links.body")}>
          <LiveBoard
            doc={boards.press}
            view={RIGHT_HALF}
            still={0.5}
            label={t("landing.feature.links.board")}
            className="aspect-[9/7] w-full"
          />
        </Row>

        <Row flip title={t("landing.feature.tilt.title")} body={t("landing.feature.tilt.body")}>
          <LiveBoard
            doc={boards.tilt}
            view={TILTED}
            still={0.6}
            label={t("landing.feature.tilt.board")}
            className="aspect-[16/10] w-full"
          />
        </Row>

        <Row title={t("landing.feature.sports.title")} body={t("landing.feature.sports.body")}>
          <SportCycle docs={boards.sports} />
        </Row>
      </div>

      <div className="mt-24 grid gap-12 border-t border-ink-700 pt-12 md:grid-cols-3 md:gap-8">
        <Point title={t("landing.feature.export.title")} body={t("landing.feature.export.body")} />
        <Point title={t("landing.feature.share.title")} body={t("landing.feature.share.body")}>
          <dl className="mt-5 flex flex-col gap-3">
            {SHARE_WAYS.map(({ key, sample }) => (
              <div key={key}>
                <dt className="flex min-w-0 items-baseline gap-2 text-sm font-medium text-white">
                  {t(key)}
                  {sample && <span className="truncate font-mono text-[11px] font-normal text-ink-500">{sample}</span>}
                </dt>
                <dd className="text-sm text-ink-400">{t(`${key}.hint`)}</dd>
              </div>
            ))}
          </dl>
        </Point>
        <Point title={t("landing.feature.video.title")} body={t("landing.feature.video.body")} />
      </div>
    </section>
  );
}

/** A feature beside the board that shows it, the board on alternate sides down the page. */
function Row({
  title,
  body,
  flip = false,
  children,
}: {
  title: string;
  body: string;
  flip?: boolean;
  children: ReactNode;
}) {
  return (
    <Reveal className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
      <div className={cn("lg:col-span-4", flip && "lg:order-last")}>
        <h3 className="text-2xl font-semibold tracking-tight text-white">{title}</h3>
        <p className="mt-3 leading-relaxed text-ink-300">{body}</p>
      </div>
      <div className="lg:col-span-8">{children}</div>
    </Reveal>
  );
}

function Point({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-300">{body}</p>
      {children}
    </div>
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
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[16/10] w-full">
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

/** Three steps in order, numbered because they are a sequence. */
function HowItWorks() {
  const { t } = useI18n();
  const steps = ([1, 2, 3] as const).map((n) => ({ title: t(`landing.how.${n}.title`), body: t(`landing.how.${n}.body`) }));
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <h2 className={cn("text-4xl text-white sm:text-5xl", DISPLAY)}>{t("landing.how.title")}</h2>
      <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {steps.map((step, i) => (
          <li key={step.title} className="border-t border-ink-600 pt-6">
            <span aria-hidden className={cn("block text-6xl text-ink-600", DISPLAY)}>
              {i + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-300">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// -------------------------------------------------------------- the close

function FinalCall() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6">
      <div className="border-t border-ink-700 pt-16">
        <h2 className={cn("max-w-3xl text-balance text-4xl text-white sm:text-5xl", DISPLAY)}>
          {t("landing.cta.title")}
        </h2>
        <p className="mt-5 max-w-xl text-ink-300">{t("landing.cta.body")}</p>
        <a href={APP_PATH} className={cn(BAR_PRIMARY, "group mt-8 inline-flex px-6 py-3 text-sm")}>
          {t("landing.hero.cta")}
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-ink-700">
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
