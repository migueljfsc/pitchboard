import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  fetchAccount,
  fetchAdminStats,
  fetchAdminUser,
  startGoogleSignIn,
  type AdminStats,
  type AdminUserDetail,
  type AdminUserSummary,
} from "@/share/api";
import { sharePath } from "@/share/routes";

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

  if (stats === null) return <Notice>Loading…</Notice>;
  if (stats === "failed") return <Notice>Could not reach the server.</Notice>;
  if (stats === "denied") return <Notice>Nothing here.</Notice>;
  if (stats === "signed-out") {
    return (
      <Notice>
        Nothing here.
        <button
          type="button"
          onClick={startGoogleSignIn}
          className="mt-4 block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-900 transition hover:brightness-110"
        >
          Sign in
        </button>
      </Notice>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {selected ? (
          <UserDetail id={selected} onBack={() => setSelected(null)} />
        ) : (
          <Overview stats={stats} onSelect={setSelected} />
        )}
      </div>
    </div>
  );
}

function Overview({ stats, onSelect }: { stats: AdminStats; onSelect: (id: string) => void }) {
  const { totals, users } = stats;
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
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-ink-200">Pitchboard · usage</h1>
        <a href="/" className="text-xs text-ink-400 hover:text-ink-200">
          Back to the board
        </a>
      </header>

      <Tiles
        items={[
          ["Users", totals.users, `+${totals.signups_7d} this week · +${totals.signups_30d} in 30 days`],
          ["Active today", totals.active_1d, `${totals.active_7d} in 7 days · ${totals.active_30d} in 30`],
          ["Boards", totals.boards, `${totals.boards_created_7d} new · ${totals.boards_updated_7d} edited this week`],
          ["Published", totals.published, "live /share links"],
          ["Projects", totals.projects, null],
          ["Squad presets", totals.presets, null],
          ["Live sessions", totals.sessions, null],
          ["Stored boards", formatBytes(totals.bytes), "sum of documents"],
        ]}
      />

      <div className="mt-8 mb-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink-300">
          Accounts <span className="font-normal text-ink-500">{users.length}</span>
        </h2>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by email or name"
          className="w-64 rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-xs text-ink-200 placeholder:text-ink-500 focus:border-accent focus:outline-none"
        />
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
      <button type="button" onClick={onBack} className="mb-6 text-xs text-ink-400 hover:text-ink-200">
        ← All accounts
      </button>

      {detail === null && <p className="text-sm text-ink-400">Loading…</p>}
      {detail === "failed" && <p className="text-sm text-red-300">Could not load this account.</p>}

      {detail && detail !== "failed" && (
        <>
          <header className="mb-6">
            <h1 className="text-lg font-semibold text-ink-200">{detail.user.display_name ?? detail.user.email}</h1>
            <p className="text-xs text-ink-400">
              {detail.user.email} · joined {formatDate(detail.user.created_at)} · last login{" "}
              {formatDate(detail.user.last_login_at)} · last seen {formatDate(detail.user.last_seen_at)}
            </p>
          </header>

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
    <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-sm text-ink-300">
      {children}
    </div>
  );
}

function Tiles({ items }: { items: Array<[string, number | string, string | null]> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value, note]) => (
        <div key={label} className="rounded-lg border border-ink-700 bg-ink-800 p-3">
          <div className="text-[11px] tracking-wide text-ink-400 uppercase">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-ink-200 tabular-nums">{value}</div>
          {note && <div className="mt-1 text-[11px] text-ink-500">{note}</div>}
        </div>
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
    <div className="overflow-x-auto rounded-lg border border-ink-700">
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
              className={`border-t border-ink-700 text-ink-300 ${row.onClick ? "cursor-pointer hover:bg-ink-800" : ""}`}
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
