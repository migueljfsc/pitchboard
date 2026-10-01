import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, RotateCw, Search } from "lucide-react";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { LogoMark, Wordmark } from "@/components/Logo";
import { BAR_BUTTON, BAR_PRIMARY } from "@/components/ui/bar";
import { EASE_OUT, enter, leave } from "@/lib/motion";
import {
  adminDeleteUser,
  ApiError,
  fetchAccount,
  fetchAdminStats,
  fetchAdminUser,
  startGoogleSignIn,
  type AdminStats,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/share/api";
import { APP_PATH, HOME_PATH, sharePath } from "@/share/routes";
import { ChartCard, ColumnChart, LineChart, Sparkline, StackedBar } from "./AdminCharts";
import {
  AMBER,
  CATEGORICAL,
  cumulative,
  DAY_S,
  fillDays,
  lastDays,
  lastWeeks,
  NEUTRAL,
  RECENCY,
  shortDate,
  usageDays,
} from "./adminData";

const WEEKS = 12;

/**
 * The operator's usage view (D108): totals, the accounts, and one account's metadata.
 *
 * English only, deliberately outside i18n — it has one reader. Every figure comes from the
 * Worker, which answers 404 to anyone else, so this page is inert without the session behind
 * it; being in the public bundle gives nothing away that the route does not already refuse.
 */
export function Admin() {
  const [stats, setStats] = useState<AdminStats | "denied" | "signed-out" | "failed" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState<"idle" | "loading" | "failed">("idle");
  const scroller = useRef<HTMLDivElement>(null);

  // A different view starts at its top, not wherever the last one was scrolled to.
  useEffect(() => scroller.current?.scrollTo({ top: 0 }), [selected]);

  const reload = () => {
    setRefresh("loading");
    fetchAdminStats()
      .then((result) => {
        setStats(result);
        setRefresh("idle");
      })
      .catch(() => setRefresh("failed"));
  };

  useEffect(() => {
    let live = true;
    fetchAdminStats()
      .then((result) => live && setStats(result))
      .catch(async (error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 404) {
          if (live) setStats("failed");
          return;
        }
        const account = await fetchAccount().catch(() => null);
        if (live) setStats(account ? "denied" : "signed-out");
      });
    return () => {
      live = false;
    };
  }, []);

  if (stats === null) {
    return (
      <Shell>
        <OverviewSkeleton />
      </Shell>
    );
  }
  if (stats === "failed") return <Notice>Could not reach the server.</Notice>;
  if (stats === "denied") return <Notice>Nothing here.</Notice>;
  if (stats === "signed-out") {
    return (
      <Notice>
        Nothing here.
        <button
          type="button"
          onClick={startGoogleSignIn}
          className={`${BAR_PRIMARY} mx-auto mt-5`}
        >
          Sign in
        </button>
      </Notice>
    );
  }

  return (
    <Shell scroller={scroller} refresh={selected ? undefined : refresh} onRefresh={reload}>
      {/* One view at a time: the list steps aside for an account, and back. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selected ?? "overview"}
          initial={{ opacity: 0, x: selected ? 16 : -16 }}
          animate={{ opacity: 1, x: 0, transition: enter }}
          exit={{ opacity: 0, x: selected ? -16 : 16, transition: leave }}
        >
          {selected ? (
            <UserDetail id={selected} onBack={() => setSelected(null)} />
          ) : (
            <Overview stats={stats} onSelect={setSelected} refresh={refresh} />
          )}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

/**
 * The page's frame: the mark back to the front door, what this page is, and the way into the
 * board — the same bar the landing page and the editor open with.
 */
function Shell({
  scroller,
  refresh,
  onRefresh,
  children,
}: {
  scroller?: React.Ref<HTMLDivElement>;
  refresh?: "idle" | "loading" | "failed";
  onRefresh?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div ref={scroller} className="h-full overflow-y-auto bg-ink-900">
      <nav className="sticky top-0 z-30 border-b border-ink-700 bg-ink-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <a href={HOME_PATH} title="Pitchboard" className="rounded-lg">
            <Wordmark name="Pitchboard" />
          </a>
          <span className="rounded-full border border-accent/25 bg-accent/[0.07] px-2 py-0.5 text-[10px] font-medium text-accent">
            Usage
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {refresh && onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refresh === "loading"}
                className={`${BAR_BUTTON} disabled:opacity-60 ${refresh === "failed" ? "text-red-300 hover:text-red-200" : ""}`}
              >
                <RotateCw size={13} className={refresh === "loading" ? "animate-spin" : undefined} />
                {refresh === "loading" ? "Refreshing…" : refresh === "failed" ? "Refresh failed · retry" : "Refresh"}
              </button>
            )}
            <a href={APP_PATH} className={BAR_BUTTON}>
              Open the board
              <ArrowRight size={13} />
            </a>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

/** Where each account was last seen, oldest bucket last; `never` is its own neutral column. */
function recency(users: AdminStats["users"]): number[] {
  const now = Date.now() / 1000;
  const limits = [1, 7, 30, 90].map((d) => d * DAY_S);
  const buckets = [0, 0, 0, 0, 0, 0];
  for (const u of users) {
    if (u.last_seen_at === null) {
      buckets[5]++;
      continue;
    }
    const age = now - u.last_seen_at;
    const i = limits.findIndex((limit) => age < limit);
    buckets[i === -1 ? 4 : i]++;
  }
  return buckets;
}

const RECENCY_LABELS = ["Today", "This week", "This month", "3 months", "Older", "Never"];

function Overview({
  stats,
  onSelect,
  refresh,
}: {
  stats: AdminStats;
  onSelect: (id: string) => void;
  refresh: "idle" | "loading" | "failed";
}) {
  const { totals, users, series, methods, usage } = stats;
  const everyone = useMemo(() => {
    const daily = (...events: string[]) => usageDays(usage, events, series.since, series.days);
    return {
      landing: daily("page.landing"),
      editor: daily("page.editor"),
      viewer: daily("page.viewer"),
      visits: daily("page.landing", "page.editor", "page.viewer"),
      exports: daily("export.mp4", "export.webm", "export.gif", "export.png"),
      shares: daily("share.snapshot", "share.live"),
      imports: daily("import.board", "import.setup", "import.tracks"),
      present: daily("present"),
      byFormat: (["mp4", "webm", "gif", "png"] as const).map((f) => lastDays(daily(`export.${f}`), series.days)),
      snapshots: lastDays(daily("share.snapshot"), 7),
      live: lastDays(daily("share.live"), 7),
      fromVideo: lastDays(daily("import.tracks"), 7),
    };
  }, [usage, series]);
  const charts = useMemo(() => {
    const signups = fillDays(series.signups, series.since, series.days);
    const boards = fillDays(series.boards, series.since, series.days);
    const weekStarts = Array.from({ length: WEEKS }, (_, w) =>
      shortDate(series.since + (series.days - (WEEKS - w) * 7) * DAY_S),
    );
    return {
      accounts: cumulative(series.usersBefore, signups),
      signupWeeks: lastWeeks(signups, WEEKS),
      boardWeeks: lastWeeks(boards, WEEKS),
      weekStarts,
      seen: recency(users),
    };
  }, [series, users]);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q),
    );
  }, [users, query]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Usage</h1>
        <p className="mt-1 text-xs text-ink-400">
          {totals.users.toLocaleString()} accounts
          {refresh === "loading" && <span className="ml-2 text-ink-500">· refreshing</span>}
        </p>
      </header>

      <Tiles
        items={[
          ["Users", totals.users, `+${totals.signups_7d} this week · +${totals.signups_30d} in 30 days`, charts.signupWeeks],
          ["Active today", totals.active_1d, `${totals.active_7d} in 7 days · ${totals.active_30d} in 30`],
          ["Boards", totals.boards, `${totals.boards_created_7d} new · ${totals.boards_updated_7d} edited this week`, charts.boardWeeks],
          ["Published", totals.published, "live /share links"],
          ["Projects", totals.projects, null],
          ["Squad presets", totals.presets, null],
          ["Live sessions", totals.sessions, null],
          ["Stored boards", formatBytes(totals.bytes), "sum of documents"],
        ]}
      />

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <ChartCard
          className="md:col-span-2"
          title="Accounts over time"
          subtitle={`All accounts, last ${series.days} days (UTC)`}
          table={charts.accounts
            .map((n, i) => [shortDate(series.since + i * DAY_S), n.toLocaleString()] as [string, string])
            .reverse()}
        >
          <LineChart values={charts.accounts} since={series.since} unit="accounts" />
        </ChartCard>

        <ChartCard
          title="Sign-ups per week"
          subtitle={`Last ${WEEKS} weeks, labelled by the week's first day`}
          table={charts.weekStarts.map((d, i) => [d, String(charts.signupWeeks[i])] as [string, string]).reverse()}
        >
          <ColumnChart values={charts.signupWeeks} labels={charts.weekStarts} colors={AMBER} unit="sign-ups" />
        </ChartCard>

        <ChartCard
          title="Boards created per week"
          subtitle={`Last ${WEEKS} weeks, labelled by the week's first day`}
          table={charts.weekStarts.map((d, i) => [d, String(charts.boardWeeks[i])] as [string, string]).reverse()}
        >
          <ColumnChart values={charts.boardWeeks} labels={charts.weekStarts} colors={AMBER} unit="boards" />
        </ChartCard>

        <ChartCard
          title="How people sign in"
          subtitle="Every account, by the sign-in methods it has"
          table={[
            ["Google only", String(methods.google)],
            ["Password only", String(methods.password)],
            ["Both", String(methods.both)],
          ]}
        >
          <StackedBar
            segments={[
              { label: "Google only", value: methods.google, color: CATEGORICAL[0] },
              { label: "Password only", value: methods.password, color: CATEGORICAL[1] },
              { label: "Both", value: methods.both, color: CATEGORICAL[2] },
            ]}
          />
        </ChartCard>

        <ChartCard
          title="Last seen"
          subtitle="Accounts by their most recent visit, to the day"
          table={RECENCY_LABELS.map((l, i) => [l, String(charts.seen[i])] as [string, string])}
        >
          <ColumnChart values={charts.seen} labels={RECENCY_LABELS} colors={[...RECENCY, NEUTRAL]} unit="accounts" />
        </ChartCard>
      </div>

      {/* Everybody's use, signed in or not (D119): what the account figures above cannot see. */}
      <div className="mt-10 mb-3">
        <h2 className="text-sm font-semibold text-ink-300">
          Everyone <span className="font-normal text-ink-500">accounts or not · last 7 days</span>
        </h2>
      </div>

      <Tiles
        items={[
          ["Landing views", lastDays(everyone.landing, 7), `${lastDays(everyone.landing, 30).toLocaleString()} in 30 days`, lastWeeks(everyone.landing, WEEKS)],
          ["Editor opens", lastDays(everyone.editor, 7), `${lastDays(everyone.editor, 30).toLocaleString()} in 30 days`, lastWeeks(everyone.editor, WEEKS)],
          ["Shared boards viewed", lastDays(everyone.viewer, 7), `${lastDays(everyone.viewer, 30).toLocaleString()} in 30 days`, lastWeeks(everyone.viewer, WEEKS)],
          ["Exports", lastDays(everyone.exports, 7), `${lastDays(everyone.exports, 30).toLocaleString()} in 30 days`, lastWeeks(everyone.exports, WEEKS)],
          ["Links shared", lastDays(everyone.shares, 7), `${everyone.snapshots} snapshot · ${everyone.live} live`],
          ["Imports", lastDays(everyone.imports, 7), `${everyone.fromVideo} from video`],
          ["Presented", lastDays(everyone.present, 7), null],
        ]}
      />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <ChartCard
          title="Visits per week"
          subtitle={`Landing, editor and shared boards, last ${WEEKS} weeks`}
          table={charts.weekStarts.map((d, i) => [d, String(lastWeeks(everyone.visits, WEEKS)[i])] as [string, string]).reverse()}
        >
          <ColumnChart values={lastWeeks(everyone.visits, WEEKS)} labels={charts.weekStarts} colors={AMBER} unit="visits" />
        </ChartCard>

        <ChartCard
          title="Exports by format"
          subtitle={`Every finished export, last ${series.days} days`}
          table={[
            ["MP4", String(everyone.byFormat[0])],
            ["WebM", String(everyone.byFormat[1])],
            ["GIF", String(everyone.byFormat[2])],
            ["PNG", String(everyone.byFormat[3])],
          ]}
        >
          <StackedBar
            segments={[
              { label: "MP4", value: everyone.byFormat[0], color: CATEGORICAL[0] },
              { label: "WebM", value: everyone.byFormat[1], color: NEUTRAL },
              { label: "GIF", value: everyone.byFormat[2], color: CATEGORICAL[1] },
              { label: "PNG", value: everyone.byFormat[3], color: CATEGORICAL[2] },
            ]}
          />
        </ChartCard>
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink-300">
          Accounts <span className="font-normal text-ink-500">{users.length}</span>
        </h2>
        <label className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by email or name"
            className="w-64 rounded-lg border border-ink-600 bg-ink-800 py-1.5 pl-8 pr-2 text-xs text-ink-200 transition placeholder:text-ink-500 focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <Table
        head={["Account", "Joined", "Last login", "Last seen", "Boards", "Published", "Projects", "Presets", "Size", "Last edit"]}
        numeric={[4, 5, 6, 7, 8]}
        rows={shown.map((u) => ({
          key: u.id,
          onClick: () => onSelect(u.id),
          cells: [
            <Account key="a" user={u} />,
            <When key="j" at={u.created_at} />,
            <When key="l" at={u.last_login_at} />,
            <When key="s" at={u.last_seen_at} />,
            u.boards,
            u.published,
            u.projects,
            u.presets,
            formatBytes(u.bytes),
            <When key="e" at={u.last_board_at} />,
          ],
        }))}
        empty="No accounts match."
      />
    </>
  );
}

function UserDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<AdminUserDetail | "failed" | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    fetchAdminUser(id)
      .then((result) => live && setDetail(result))
      .catch(() => live && setDetail("failed"));
    return () => {
      live = false;
    };
  }, [id]);

  const pathOf = (projectId: string) =>
    detail && detail !== "failed" ? projectPath(detail.projects, projectId) : "";

  return (
    <>
      <button type="button" onClick={onBack} className={`${BAR_BUTTON} group -ml-2.5 mb-6 text-ink-400`}>
        <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
        All accounts
      </button>

      {detail === null && <DetailSkeleton />}
      {detail === "failed" && <p className="text-sm text-red-300">Could not load this account.</p>}

      {detail && detail !== "failed" && (
        <>
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {detail.user.display_name ?? detail.user.email}
              </h1>
              <p className="text-xs text-ink-400">
                {detail.user.email} · joined {formatDate(detail.user.created_at)} · last login{" "}
                {formatDate(detail.user.last_login_at)} · last seen {formatDate(detail.user.last_seen_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="shrink-0 rounded-lg border border-red-500/60 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-600 hover:text-white"
            >
              Delete account
            </button>
          </header>

          <AnimatePresence>
            {deleting && (
              <DeleteAccountDialog
                email={detail.user.email}
                title="Delete this account?"
                message="This account and everything in it will be deleted. This cannot be undone."
                onDelete={async (typed) => {
                  await adminDeleteUser(id, typed);
                  // A reload rather than patching state: the totals and the list both change.
                  window.location.assign("/admin");
                }}
                onCancel={() => setDeleting(false)}
              />
            )}
          </AnimatePresence>

          <Tiles
            items={[
              ["Boards", detail.user.boards, null],
              ["Published", detail.user.published, null],
              ["Projects", detail.user.projects, null],
              ["Presets", detail.user.presets, null],
              ["Stored", formatBytes(detail.user.bytes), null],
            ]}
          />

          <Section title="Boards" count={detail.boards.length}>
            <Table
              head={["Board", "Project", "Scenes", "Size", "Version", "Published", "Created", "Updated"]}
              numeric={[2, 3, 4]}
              rows={detail.boards.map((b) => ({
                key: b.id,
                cells: [
                  b.name,
                  pathOf(b.project_id),
                  b.scenes ?? "—",
                  formatBytes(b.bytes),
                  b.version,
                  b.share_slug ? (
                    <a key="p" href={sharePath(b.share_slug)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {b.share_slug}
                    </a>
                  ) : (
                    "—"
                  ),
                  <When key="c" at={b.created_at} />,
                  <When key="u" at={b.updated_at} />,
                ],
              }))}
              empty="No boards."
            />
          </Section>

          <Section title="Projects" count={detail.projects.length}>
            <Table
              head={["Project", "Boards", "Created", "Updated"]}
              numeric={[1]}
              rows={detail.projects.map((p) => ({
                key: p.id,
                cells: [
                  pathOf(p.id),
                  detail.boards.filter((b) => b.project_id === p.id).length,
                  <When key="c" at={p.created_at} />,
                  <When key="u" at={p.updated_at} />,
                ],
              }))}
              empty="No projects."
            />
          </Section>

          <Section title="Squad presets" count={detail.presets.length}>
            <Table
              head={["Preset", "Created", "Updated"]}
              rows={detail.presets.map((r) => ({
                key: r.id,
                cells: [r.label, <When key="c" at={r.created_at} />, <When key="u" at={r.updated_at} />],
              }))}
              empty="No presets."
            />
          </Section>
        </>
      )}
    </>
  );
}

/** "Season › Away games". Walks parents with a guard, since a row is data, not a promise. */
function projectPath(projects: AdminUserDetail["projects"], id: string): string {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (let p = byId.get(id); p && !seen.has(p.id); p = p.parent_id ? byId.get(p.parent_id) : undefined) {
    seen.add(p.id);
    names.unshift(p.name);
  }
  return names.join(" › ");
}

// --- pieces -------------------------------------------------------------------------------

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-ink-900 p-8 text-center text-sm text-ink-300">
      <a href={HOME_PATH} title="Pitchboard">
        <LogoMark className="size-10" />
      </a>
      <div className="animate-fade-up">{children}</div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="skeleton mb-2 h-7 w-32" />
      <div className="skeleton mb-6 h-3 w-24" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="rounded-xl border border-ink-700 bg-ink-800 p-3">
            <div className="skeleton h-2.5 w-16" />
            <div className="skeleton mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="skeleton h-56 md:col-span-2" />
        <div className="skeleton h-56" />
        <div className="skeleton h-56" />
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="skeleton h-7 w-56" />
      <div className="skeleton mt-2 h-3 w-80" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-16" />
        ))}
      </div>
      <div className="skeleton mt-8 h-40" />
    </div>
  );
}

/** A figure counting up to its value, and on to the next when a refresh changes it. */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: reduced ? 0 : 0.9,
      ease: EASE_OUT,
      onUpdate: setShown,
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduced]);
  return <>{Math.round(shown).toLocaleString()}</>;
}

/** Label, value, an optional note, and an optional weekly trend drawn under it. */
type Tile = [string, number | string, string | null, number[]?];

function Tiles({ items }: { items: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value, note, trend], i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: i * 0.04 }}
          className="rounded-xl border border-ink-700 bg-gradient-to-b from-ink-800 to-ink-800/60 p-3 transition-colors duration-300 hover:border-ink-600"
        >
          <div className="text-[11px] text-ink-400">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
            {typeof value === "number" ? <CountUp value={value} /> : value}
          </div>
          {note && <div className="mt-1 text-[11px] text-ink-500">{note}</div>}
          {trend && <Sparkline values={trend} />}
        </motion.div>
      ))}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-ink-300">
        {title} <span className="font-normal text-ink-500">{count}</span>
      </h2>
      {children}
    </section>
  );
}

interface Row {
  key: string;
  cells: React.ReactNode[];
  onClick?: () => void;
}

function Table({ head, rows, numeric = [], empty }: { head: string[]; rows: Row[]; numeric?: number[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-ink-500">{empty}</p>;
  const align = (i: number) => (numeric.includes(i) ? "text-right tabular-nums" : "text-left");
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-700">
      <table className="w-full text-xs">
        <thead className="bg-ink-800 text-ink-400">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium whitespace-nowrap ${align(i)}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              onClick={row.onClick}
              className={`border-t border-ink-700 text-ink-300 transition-colors ${row.onClick ? "cursor-pointer hover:bg-ink-800 hover:text-white" : ""}`}
            >
              {row.cells.map((cell, i) => (
                <td key={i} className={`px-3 py-2 whitespace-nowrap ${align(i)}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Account({ user }: { user: AdminUserSummary }) {
  return (
    <div>
      <div className="text-ink-200">{user.email}</div>
      {user.display_name && <div className="text-ink-500">{user.display_name}</div>}
    </div>
  );
}

/** Relative for scanning, the exact moment on hover. */
function When({ at }: { at: number | null }) {
  if (at === null) return <span className="text-ink-500">—</span>;
  return <span title={new Date(at * 1000).toLocaleString()}>{ago(at)}</span>;
}

function ago(at: number): string {
  const s = Math.max(0, Date.now() / 1000 - at);
  if (s < 60) return "just now";
  if (s < 60 * 60) return `${Math.floor(s / 60)}m ago`;
  if (s < 24 * 60 * 60) return `${Math.floor(s / 3600)}h ago`;
  if (s < 60 * 24 * 60 * 60) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(at);
}

function formatDate(at: number | null): string {
  return at === null ? "never" : new Date(at * 1000).toLocaleDateString();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
