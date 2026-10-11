import { useState } from "react";
import { CallsPanel } from "./components/CallsPanel.tsx";
import { Explainers } from "./components/Explainers.tsx";
import { FlowGraph } from "./components/FlowGraph.tsx";
import { Header } from "./components/Header.tsx";
import { HirePanel } from "./components/HirePanel.tsx";
import { Narration } from "./components/Narration.tsx";
import { OutcomePanel } from "./components/OutcomePanel.tsx";
import { Panel } from "./components/Panel.tsx";
import { PaymentPanel } from "./components/PaymentPanel.tsx";
import { ReceiptsPanel } from "./components/ReceiptsPanel.tsx";
import { StatTiles } from "./components/StatTiles.tsx";
import { TranscriptPanel } from "./components/TranscriptPanel.tsx";
import type { Feed } from "./lib/feed.ts";
import { useFeed } from "./lib/useFeed.ts";

function Dashboard({ feed, source }: { feed: Feed; source: "live" | "recorded" }) {
  const [picked, setPicked] = useState<string | undefined>();
  // Follow the newest call unless one was picked by hand.
  const call = feed.calls.find((c) => c.id === picked) ?? feed.calls[0];
  const number = call ? feed.calls.length - feed.calls.indexOf(call) : 0;
  const latest = feed.calls[0];

  return (
    <div className="mx-auto flex max-w-[1760px] flex-col gap-3 p-5">
      <Header feed={feed} source={source} />
      <StatTiles feed={feed} />
      <Narration call={latest} number={feed.calls.length} />
      <div className="grid gap-3 xl:h-[470px] xl:grid-cols-12">
        <div className="flex min-h-0 min-w-0 xl:col-span-3"><CallsPanel calls={feed.calls} selectedId={call?.id} onSelect={setPicked} /></div>
        <Panel className="xl:col-span-5" title="How a paid call moves" subtitle="Sign in AUSD · settle on Base · ElevenLabs makes the call · unused minutes come back">
          <FlowGraph call={call} />
        </Panel>
        <div className="flex min-h-0 min-w-0 xl:col-span-4"><TranscriptPanel call={call} number={number} /></div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <OutcomePanel call={call} number={number} />
        <PaymentPanel feed={feed} call={call} number={number} />
        <ReceiptsPanel feed={feed} />
      </div>
      <Explainers />
      <HirePanel feed={feed} />
      <footer className="pb-2 text-center text-[11px] text-muted">
        AUSD {feed.asset.address} on {feed.network.name} · updated {new Date(feed.generatedAt).toLocaleTimeString()}
      </footer>
    </div>
  );
}

export function App() {
  const state = useFeed();
  if (state.status === "loading") return <p className="p-8 text-sm text-muted">Loading calls…</p>;
  if (state.status === "error") {
    return (
      <div className="m-8 max-w-2xl rounded-xl border border-line bg-surface p-5">
        <h1 className="font-semibold" style={{ color: "var(--color-critical)" }}>Could not load any calls</h1>
        <p className="mt-1 text-sm text-ink-2">{state.message}</p>
        <p className="mt-2 text-sm text-muted">Start the API with npm run api, or export a recorded feed with npm run export:feed.</p>
      </div>
    );
  }
  return <Dashboard feed={state.feed} source={state.source} />;
}
