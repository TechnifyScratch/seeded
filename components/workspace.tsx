"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Database,
  BookOpen,
  Clock,
  MessageSquare,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Activity,
  Box,
  Layers,
  Pause,
  Play,
  Check,
  AlertCircle,
  LogOut,
  Menu,
  GitBranch,
  Leaf,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { browserDb } from "@/lib/browser";
import type { Snapshot, Decision, Row, Memory } from "@/lib/domain/schema";
import MapView from "./map-view";
import Settings from "./settings";
const nav = [
  ["live", "Live"],
  ["map", "Map"],
  ["memory", "Memory"],
  ["journal", "Journal"],
  ["timeline", "Timeline"],
  ["messages", "Messages"],
] as const;
const titles: Record<string, [string, string]> = {
  live: ["Live", "Current activity and recent records."],
  map: ["Information map", "Nodes and connections."],
  memory: ["Memory", "Saved memories."],
  journal: ["Journal", "Journal entries."],
  timeline: ["Timeline", "Activity history."],
  messages: ["Messages", "Messages to and from Seeded."],
  settings: ["Settings", "Experiment settings."],
  skills: ["Skill library", "Available skills and usage."],
  environment: ["Environment", "Objects and locations."],
};
const typeNames: Record<string, string> = {
  episodic: "Episodic",
  knowledge: "Knowledge",
  salient: "Salient",
  self_model: "Self-model",
};
function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function Empty({
  icon: Icon = Database,
  title,
  description,
}: {
  icon?: typeof Database;
  title: string;
  description: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {href && (
          <Link href={href}>
            View all <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export default function Workspace({
  section,
  initial,
}: {
  section: string;
  initial: Snapshot;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const eid = data.experiment?.id;
  useEffect(() => setData(initial), [initial]);
  const refresh = useCallback(async () => {
    if (!initial.configured) return;
    const res = await fetch(`/api/state${eid ? `?experiment=${eid}` : ""}`, {
      cache: "no-store",
    });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) throw new Error("Could not refresh records");
    setData(await res.json());
  }, [eid, initial.configured, router]);
  useEffect(() => {
    const db = browserDb();
    if (!db || !eid) return;
    let timer: ReturnType<typeof setTimeout>;
    const channel = db
      .channel(`experiment-${eid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "experiment_logs",
          filter: `experiment_id=eq.${eid}`,
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            void refresh().catch(() =>
              setError("Live update interrupted. Reconnecting…"),
            );
          }, 250);
        },
      )
      .subscribe((status: string) => setConnected(status === "SUBSCRIBED"));
    const interval = setInterval(() => {
      void refresh().catch(() => setConnected(false));
    }, 15000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      void db.removeChannel(channel);
    };
  }, [eid, refresh]);
  const href = (s: string) => `/${s}${eid ? `?experiment=${eid}` : ""}`;
  async function command(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      if (["create", "demo"].includes(String(body.command))) {
        router.push(`/settings?experiment=${out.id}`);
        router.refresh();
      } else await refresh();
      setNotice("Experiment updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  const e = data.experiment;
  const [title, subtitle] = titles[section];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <Link className="brand" href={href("live")}>
          Seeded<span>.</span>
        </Link>
        <p className="brand-caption">An AI learning experiment</p>
        <div className="workspace-label">Workspace</div>
        <nav>
          {nav.map(([slug, label]) => (
            <Link
              key={slug}
              href={href(slug)}
              className={section === slug ? "nav-link selected" : "nav-link"}
              onClick={() => setMenu(false)}
            >
              {label}
              {slug === "messages" &&
                data.messages.filter((m) => m.sender_type === "seeded").length >
                  0 && (
                  <span className="nav-count">
                    {
                      data.messages.filter((m) => m.sender_type === "seeded")
                        .length
                    }
                  </span>
                )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-settings">
          <Link
            href={href("settings")}
            className={`nav-link ${section === "settings" ? "selected" : ""}`}
          >
            Settings
          </Link>
        </div>
        <div className="sidebar-bottom">
          <div className="status-line">
            <span
              className={`status-dot ${e?.status === "running" ? "running" : ""}`}
            />
            {e ? e.status.replace("_", " ") : "Not initialized"}
          </div>
          <span className="version">v1.0</span>
          <div className="user-block">
            <span className="avatar">
              {data.email ? data.role.slice(0, 2).toUpperCase() : "S"}
            </span>
            <div>
              <strong>
                {data.displayName ||
                  (data.email
                    ? data.email.endsWith("@seeded.invalid")
                      ? `Research ${data.role}`
                      : data.email.split("@")[0]
                    : "Research workspace")}
              </strong>
              <small>{data.configured ? data.role : "Setup required"}</small>
            </div>
            {data.configured ? (
              <button
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => {
                  await browserDb()?.auth.signOut();
                  router.push("/login");
                  router.refresh();
                }}
              >
                <LogOut size={15} />
              </button>
            ) : (
              <Link href="/login" aria-label="Sign in">
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{title}</strong>
          </div>
          <form
            className="global-search"
            onSubmit={(ev) => {
              ev.preventDefault();
              router.push(
                `${href("memory")}${eid ? "&" : "?"}q=${encodeURIComponent(query)}`,
              );
            }}
          >
            <Search size={16} />
            <input
              aria-label="Search memories"
              placeholder="Search"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <span className="topbar-private">
            <ShieldIcon /> Private workspace
          </span>
        </header>
        <main className={`main-content ${section === "map" ? "map-page" : ""}`}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {e?.is_demo ? "SYNTHETIC DEMONSTRATION" : "Seeded / experiment"}
              </div>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="heading-right">
              {data.experiments.length > 0 && (
                <div className="experiment-select">
                  <select
                    aria-label="Select experiment"
                    value={eid}
                    onChange={(ev) =>
                      router.push(`/${section}?experiment=${ev.target.value}`)
                    }
                  >
                    {data.experiments.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.is_demo ? "DEMO · " : ""}
                        {ex.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </div>
              )}
              <span className="connection">
                <span className={`tiny-dot ${connected ? "online" : ""}`} />
                {connected
                  ? "Live updates"
                  : data.configured
                    ? "Connecting"
                    : "Not connected"}
              </span>
            </div>
          </div>
          {error && (
            <div role="alert" className="banner error">
              <AlertCircle size={16} />
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner success">
              <Check size={16} />
              {notice}
              <button onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}
          {e?.is_demo && (
            <div className="banner demo">
              DEMO · Synthetic UI records. This experiment does not call Claude
              and is separate from real experiments.
            </div>
          )}
          {e?.last_error && (
            <div className="banner error">
              <AlertCircle size={16} />
              {e.last_error}
            </div>
          )}
          {!data.configured && section !== "settings" && (
            <div className="setup-banner">
              <div>
                <span className="setup-symbol">
                  <Leaf size={18} />
                </span>
                <span>
                  <strong>Setup needed.</strong> Connect your services to start
                  the first experiment.
                </span>
              </div>
              <Link href="/settings">
                Set up workspace <ArrowRight size={15} />
              </Link>
            </div>
          )}
          {section === "live" && (
            <>
              <div className="metrics-row">
                <div>
                  <span>Experiment status</span>
                  <strong>
                    <i
                      className={`status-dot ${e?.status === "running" ? "running" : ""}`}
                    />
                    {e ? e.status.replace("_", " ") : "Awaiting setup"}
                  </strong>
                </div>
                <div>
                  <span>Developmental day</span>
                  <strong>
                    {e ? String(e.day).padStart(2, "0") : "—"}
                    <small>{e ? "Current day" : "Not started"}</small>
                  </strong>
                </div>
                <div>
                  <span>Action budget</span>
                  <strong>
                    {e ? e.action_budget - e.actions_used : "—"}
                    <small>
                      {e
                        ? `remaining of ${e.action_budget}`
                        : "No active budget"}
                    </small>
                  </strong>
                  <div className="progress-track">
                    <span
                      style={{
                        width: e
                          ? `${(e.actions_used / e.action_budget) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <span>Recorded memories</span>
                  <strong>
                    {data.memories.length}
                    <small>in this view</small>
                  </strong>
                </div>
              </div>
              <div className="dashboard-grid">
                <div className="stack">
                  <Panel title="Current activity">
                    <div className="activity-block">
                      <div
                        className={`activity-icon ${e?.status === "running" ? "active" : ""}`}
                      >
                        <Activity size={23} />
                      </div>
                      <div>
                        <div className="eyebrow">
                          {e
                            ? e.status === "running"
                              ? "EXPERIMENT RUNNING"
                              : "EXPERIMENT STATUS"
                            : "Not started"}
                        </div>
                        <h2>
                          {e
                            ? e.status === "running"
                              ? "Running"
                              : e.status === "reflecting"
                                ? "Reflecting"
                                : e.status === "day_complete"
                                  ? "Day complete"
                                  : e.status === "stopped"
                                    ? "Experiment stopped"
                                    : "Experiment paused"
                            : "Waiting for the first cycle"}
                        </h2>
                        <p>
                          {data.actions[0]
                            ? String(
                                (
                                  data.actions[0].result as {
                                    observation?: string;
                                  }
                                )?.observation ?? "Waiting for the next cycle.",
                              )
                            : "No activity yet."}
                        </p>
                        {data.role === "admin" && e && !e.is_demo && (
                          <button
                            disabled={
                              busy || !["paused", "running"].includes(e.status)
                            }
                            onClick={() =>
                              command({
                                command:
                                  e.status === "running" ? "pause" : "resume",
                                experiment_id: e.id,
                              })
                            }
                          >
                            {e.status === "running" ? (
                              <Pause size={14} />
                            ) : (
                              <Play size={14} />
                            )}{" "}
                            {e.status === "running"
                              ? "Pause experiment"
                              : "Start / resume"}
                          </button>
                        )}
                      </div>
                    </div>
                  </Panel>
                  <DecisionPanel row={data.decision_records[0]} />
                  <MessageComposer data={data} refresh={refresh} />
                </div>
                <div className="stack">
                  <Panel title="Environment" href={href("environment")}>
                    <Environment data={data} compact />
                  </Panel>
                  <Panel title="Memory" href={href("memory")}>
                    <div className="memory-summary">
                      {Object.entries(typeNames).map(([type, label]) => (
                        <div key={type}>
                          <span>
                            <i className={`memory-dot ${type}`} />
                            {label}
                          </span>
                          <strong>
                            {
                              data.memories.filter((m) => m.type === type)
                                .length
                            }
                          </strong>
                        </div>
                      ))}
                    </div>
                    <Link className="panel-footer" href={href("skills")}>
                      <Layers size={15} /> Skill library{" "}
                      <ArrowRight size={14} />
                    </Link>
                  </Panel>
                  <Panel title="Recent events" href={href("timeline")}>
                    {data.experiment_logs.length ? (
                      <div className="recent-events">
                        {data.experiment_logs.slice(0, 5).map((l) => (
                          <div key={l.id}>
                            <time>
                              {new Date(l.created_at).toLocaleTimeString(
                                undefined,
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </time>
                            <span>{String(l.summary)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="quiet-note">
                        <Clock size={18} />
                        <p>No events yet.</p>
                      </div>
                    )}
                  </Panel>
                  <Panel title="Graph changes" href={href("map")}>
                    <div className="mini-map-summary">
                      <GitBranch size={21} />
                      <strong>{data.graph_nodes.length}</strong>
                      <span>nodes</span>
                      <strong>{data.graph_edges.length}</strong>
                      <span>relationships</span>
                    </div>
                    {data.experiment_logs
                      .filter((l) => String(l.event_type).startsWith("graph_"))
                      .slice(0, 2)
                      .map((l) => (
                        <p className="padded" key={l.id}>
                          {String(l.summary)}
                        </p>
                      ))}
                  </Panel>
                </div>
              </div>
            </>
          )}
          {section === "map" && <MapView key={eid} data={data} />}
          {section === "memory" && (
            <MemoryView key={eid} data={data} query={params.get("q") ?? ""} />
          )}
          {section === "journal" && (
            <RecordFeed
              key={`${eid}-${section}`}
              data={data}
              table="journal_entries"
            />
          )}
          {section === "timeline" && (
            <RecordFeed
              key={`${eid}-${section}`}
              data={data}
              table="experiment_logs"
            />
          )}
          {section === "messages" && (
            <div className="message-page">
              <MessageComposer data={data} refresh={refresh} />
              <RecordFeed
                key={`${eid}-${section}`}
                data={data}
                table="messages"
              />
            </div>
          )}
          {section === "skills" && <Skills data={data} />}
          {section === "environment" && (
            <section className="panel padded">
              <Environment data={data} />
              <div className="environment-list">
                {data.environment_objects.map((o) => (
                  <article key={o.id}>
                    <Box size={21} />
                    <div>
                      <h3>{String(o.name)}</h3>
                      <p>{String(o.public_description)}</p>
                      <small>
                        {String(o.location)} ·{" "}
                        {(o.available_actions as string[]).join(", ")}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {section === "settings" && (
            <Settings key={eid} data={data} command={command} busy={busy} />
          )}
          <footer className="page-footer">
            <span>Seeded</span>
            <span></span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function ShieldIcon() {
  return <span className="shield-mark">◇</span>;
}
function DecisionPanel({ row }: { row?: Row }) {
  const record = row?.record as Decision | undefined;
  return (
    <Panel title="Latest Decision Record">
      {record ? (
        <>
          <dl className="decision-table">
            {[
              ["Observed", record.observation_summary],
              ["Interpretation", record.interpretation],
              ["Considered", record.considered_options.join("\n")],
              ["Selected", record.selected_action.type.replace("_", " ")],
              ["Reason", record.decision_summary],
              ["Uncertainty", record.uncertainty],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="record-foot">
            Explicit experiment-visible summary · {date(row!.created_at)}
          </div>
        </>
      ) : (
        <>
          <div className="decision-placeholder">
            <div className="record-icon">
              <BookOpen size={24} strokeWidth={1.5} />
            </div>
            <h3>No decision recorded yet</h3>
            <p>Decision records will appear here.</p>
            <div className="record-columns">
              <span>OBSERVATION</span>
              <span>ACTION</span>
              <span>UNCERTAINTY</span>
            </div>
          </div>
          <div className="record-foot">
            Decision records are explicit summaries, not hidden
            chain-of-thought.
          </div>
        </>
      )}
    </Panel>
  );
}
function Environment({
  data,
  compact = false,
}: {
  data: Snapshot;
  compact?: boolean;
}) {
  const locations: Record<string, [number, number]> = {
    center: [5, 3],
    north: [5, 1],
    south: [5, 5],
    east: [9, 3],
    west: [1, 3],
  };
  return (
    <div className={compact ? "environment-preview" : "environment-full"}>
      <div className="env-grid">
        {Array.from({ length: 77 }, (_, i) => {
          const x = i % 11,
            y = Math.floor(i / 11);
          const objects = data.environment_objects.filter((o) => {
            const p = locations[String(o.location)];
            return p && p[0] === x && p[1] === y;
          });
          const agent =
            data.experiment &&
            locations[data.experiment.location]?.[0] === x &&
            locations[data.experiment.location]?.[1] === y;
          return (
            <div
              key={i}
              className={`${objects.length ? "occupied" : ""} ${agent ? "agent-position" : ""}`}
              title={
                objects.map((o) => String(o.name)).join(", ") ||
                (agent ? "Current location" : "Empty position")
              }
            >
              {objects.length > 0 && <Box size={compact ? 12 : 18} />}
            </div>
          );
        })}
        {!data.experiment && (
          <div className="environment-overlay">
            <Box size={18} />
            <span>No environment initialized</span>
          </div>
        )}
      </div>
      <div className="environment-caption">
        <span>
          <i className="legend-square" /> Observed objects
        </span>
        <span>{data.environment_objects.length} objects</span>
      </div>
    </div>
  );
}
function MessageComposer({
  data,
  refresh,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enabled =
    data.configured &&
    data.capabilities.some((c) => c.name === "communication" && c.enabled);
  return (
    <section className="panel message-composer">
      <h3>Observer communication</h3>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = await fetch("/api/message", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                experiment_id: data.experiment?.id,
                content,
              }),
            });
            const out = await res.json();
            if (!res.ok) throw new Error(out.error);
            setContent("");
            await refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Message failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Message to Seeded"
          placeholder={enabled ? "Message" : "Set up to send messages"}
          maxLength={2000}
          required
          disabled={!enabled}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className="primary" disabled={!enabled || busy}>
          <Send size={14} /> Send
        </button>
      </form>
      <small>
        Messages become part of the environment. They do not change the
        constitution.
      </small>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
function MemoryView({
  data,
  query: initialQuery,
}: {
  data: Snapshot;
  query: string;
}) {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const [extra, setExtra] = useState<Memory[]>([]);
  const [searchResults, setSearchResults] = useState<Memory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  useEffect(() => {
    setSearchResults([]);
    if (!query.trim() || !data.experiment) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(
        `/api/records?experiment=${data.experiment!.id}&table=memories&query=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then(async (res) => {
          if (!res.ok) throw new Error("Memory search failed");
          const out = await res.json();
          setSearchResults(out.records);
        })
        .catch((e) => {
          if (e.name !== "AbortError")
            setError("Memory search failed. Try again.");
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, data.experiment]);
  const all = [...data.memories, ...extra, ...searchResults].filter(
    (m, i, a) => a.findIndex((n) => n.id === m.id) === i,
  );
  const memories = all.filter(
    (m) =>
      (type === "all" || m.type === type) &&
      (`${m.title} ${m.content} ${m.reason_saved}`
        .toLowerCase()
        .includes(query.toLowerCase()) ||
        searchResults.some((r) => r.id === m.id)),
  );
  return (
    <>
      <div className="list-toolbar">
        <div className="tabs">
          {[["all", "All memories"], ...Object.entries(typeNames)].map(
            ([k, v]) => (
              <button
                className={type === k ? "active" : ""}
                key={k}
                onClick={() => setType(k)}
              >
                {v}
                {k === "all" && <span>{all.length}</span>}
              </button>
            ),
          )}
        </div>
        <Link
          className="button"
          href={`/skills${data.experiment ? `?experiment=${data.experiment.id}` : ""}`}
        >
          <Layers size={15} /> Skill library
        </Link>
      </div>
      <div className="search-row">
        <Search size={17} />
        <input
          aria-label="Search memory records"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
        />
        <SlidersHorizontal size={16} />
      </div>
      {memories.length ? (
        <div className="memory-list">
          {memories.map((m) => (
            <article
              className={`panel memory-record ${selected === m.id ? "expanded" : ""}`}
              key={m.id}
            >
              <button
                className="memory-record-main"
                onClick={() => setSelected(selected === m.id ? null : m.id)}
                aria-expanded={selected === m.id}
              >
                <div>
                  <span className={`type-tag ${m.type}`}>
                    {typeNames[m.type]}
                  </span>
                  <h3>{m.title}</h3>
                  <p>{m.content.slice(0, 200)}</p>
                </div>
                <div className="memory-metadata">
                  <time>{date(m.created_at)}</time>
                  <span>{Math.round(m.confidence * 100)}% confidence</span>
                  <span>Importance {Math.round(m.importance * 100)}%</span>
                  {m.archived && <span>Archived</span>}
                </div>
              </button>
              {selected === m.id && (
                <div className="memory-detail">
                  <p>{m.content}</p>
                  <h4>Why it was saved</h4>
                  <p>{m.reason_saved}</p>
                  <small>
                    Cycle {m.cycle_created ?? "Synthetic fixture"} · Recalled{" "}
                    {m.recall_count} times
                  </small>
                  <h4>Relationships</h4>
                  {data.graph_nodes
                    .filter((n) => n.reference_id === m.id)
                    .map((n) => (
                      <p key={n.id}>
                        {
                          data.graph_edges.filter(
                            (e) =>
                              e.source_node_id === n.id ||
                              e.target_node_id === n.id,
                          ).length
                        }{" "}
                        recorded connections ·{" "}
                        <Link href={`/map?experiment=${data.experiment?.id}`}>
                          Inspect on map
                        </Link>
                      </p>
                    ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={query ? "No matching memories" : "No memories yet"}
            description={
              query
                ? "Try a different search or load older records."
                : "Saved memories will appear here."
            }
          />
        </section>
      )}
      {data.configured && data.experiment && (
        <button
          className="load-more"
          disabled={busy || done}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch(
                `/api/records?experiment=${data.experiment!.id}&table=memories&offset=${all.length}`,
              );
              if (!res.ok) throw new Error("Could not load older memories");
              const out = await res.json();
              setExtra([...extra, ...out.records]);
              setDone(out.records.length < 100);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {done
            ? "All memories loaded"
            : busy
              ? "Loading"
              : "Load older memories"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function RecordFeed({
  data,
  table,
}: {
  data: Snapshot;
  table: "journal_entries" | "experiment_logs" | "messages";
}) {
  const [extra, setExtra] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const rows = [...data[table], ...extra].filter(
    (r, i, a) => a.findIndex((n) => n.id === r.id) === i,
  );
  return (
    <>
      <section className="panel record-feed">
        {rows.length ? (
          rows.map((r) => {
            const cycle = data.cycles.find((c) => c.id === r.cycle_id);
            return (
              <article key={r.id}>
                <div className="feed-marker">
                  {table === "messages" ? (
                    <MessageSquare size={15} />
                  ) : table === "journal_entries" ? (
                    <BookOpen size={15} />
                  ) : (
                    <Clock size={15} />
                  )}
                </div>
                <div className="feed-body">
                  <div className="feed-heading">
                    <strong>
                      {table === "messages"
                        ? r.sender_type === "seeded"
                          ? "Seeded"
                          : r.sender_type === "observer"
                            ? "Observer"
                            : "Environment / System"
                        : table === "journal_entries"
                          ? String(r.kind).replace("_", " ")
                          : String(r.event_type).replaceAll("_", " ")}
                    </strong>
                    <time>{date(r.created_at)}</time>
                  </div>
                  {cycle && (
                    <small>
                      Day {String(cycle.day)} · Action{" "}
                      {String(cycle.action_number)}
                    </small>
                  )}
                  <p>{String(r.content ?? r.summary ?? "")}</p>
                  {r.payload && Object.keys(r.payload as object).length > 0 ? (
                    <details>
                      <summary>Audit details</summary>
                      <pre>{JSON.stringify(r.payload, null, 2)}</pre>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <Empty
            icon={
              table === "journal_entries"
                ? BookOpen
                : table === "messages"
                  ? MessageSquare
                  : Clock
            }
            title={
              table === "journal_entries"
                ? "No journal entries yet"
                : table === "messages"
                  ? "No messages yet"
                  : "No events yet"
            }
            description={
              table === "journal_entries"
                ? "Journal entries will appear here."
                : table === "messages"
                  ? "Messages will appear here."
                  : "Activity will appear here."
            }
          />
        )}
      </section>
      {data.configured && data.experiment && (
        <button
          className="load-more"
          disabled={busy || done}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch(
                `/api/records?experiment=${data.experiment!.id}&table=${table}&offset=${rows.length}`,
              );
              if (!res.ok) throw new Error("Could not load older records");
              const out = await res.json();
              setExtra([...extra, ...out.records]);
              setDone(out.records.length < 100);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {done
            ? "All records loaded"
            : busy
              ? "Loading"
              : "Load earlier records"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function Skills({ data }: { data: Snapshot }) {
  const [tab, setTab] = useState("available");
  return (
    <>
      <div className="list-toolbar">
        <div className="tabs">
          <button
            className={tab === "available" ? "active" : ""}
            onClick={() => setTab("available")}
          >
            Available skills
          </button>
          <button
            className={tab === "used" ? "active" : ""}
            onClick={() => setTab("used")}
          >
            Usage & outcomes
          </button>
        </div>
        <span className="muted">
          Loaded on selection · Server-side instructions
        </span>
      </div>
      {tab === "available" ? (
        <div className="skills-grid">
          {data.skills.map((s) => (
            <article
              className={`panel skill-card ${!s.enabled ? "disabled-skill" : ""}`}
              key={s.id}
            >
              <div className="skill-card-top">
                <Layers size={18} />
                <span className="type-tag">
                  {s.enabled ? String(s.category) : "Excluded"}
                </span>
              </div>
              <h3>{String(s.name)}</h3>
              <p>{String(s.description)}</p>
              <small>{String(s.when_useful)}</small>
              <div className="skill-foot">
                <span>
                  {data.skill_usage.filter((u) => u.skill_id === s.id).length}{" "}
                  uses in loaded history
                </span>
                <span>{s.enabled ? "Available" : "Disabled"}</span>
              </div>
            </article>
          ))}
          {!data.skills.length && (
            <section className="panel">
              <Empty
                icon={Layers}
                title="No skills loaded"
                description="Complete setup to load the skill library."
              />
            </section>
          )}
        </div>
      ) : (
        <section className="panel record-feed">
          {data.skill_usage.length ? (
            data.skill_usage.map((u) => (
              <article key={u.id}>
                <Layers size={18} />
                <div>
                  <h3>
                    {String(
                      data.skills.find((s) => s.id === u.skill_id)?.name ??
                        "Selected skill",
                    )}
                  </h3>
                  <small>
                    {date(u.created_at)} · Cycle {String(u.cycle_id)}
                  </small>
                  <p>{String(u.reason_summary)}</p>
                  <strong>Associated outcome</strong>
                  <p>{String(u.result ?? "Awaiting subsequent action")}</p>
                  {u.duration_ms != null && (
                    <small>
                      Context duration:{" "}
                      {Math.round(Number(u.duration_ms) / 1000)}s
                    </small>
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty
              icon={Layers}
              title="No skills selected yet"
              description="Usage will appear here."
            />
          )}
        </section>
      )}
    </>
  );
}
