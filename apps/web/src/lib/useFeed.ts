import { useEffect, useState } from "react";
import type { Feed } from "./feed.ts";

/**
 * Live when an API answers, recorded otherwise.
 *
 * The dashboard polls the API's feed; when none is reachable (a static deploy,
 * a demo without the server running) it shows the calls recorded from Base
 * Sepolia, and says so in the header.
 */

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const POLL_MS = 3000;

export type FeedState =
  | { status: "loading" }
  | { status: "ready"; feed: Feed; source: "live" | "recorded" }
  | { status: "error"; message: string };

async function load(url: string): Promise<Feed> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const feed = (await res.json()) as Feed;
  if (!Array.isArray(feed.calls)) throw new Error(`${url} is not a Dispatch feed`);
  return feed;
}

export function useFeed(): FeedState {
  const [state, setState] = useState<FeedState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const feed = await load(`${API}/v1/feed`);
        if (!cancelled) setState({ status: "ready", feed, source: "live" });
        timer = setTimeout(tick, POLL_MS);
      } catch {
        try {
          const feed = await load("/recorded-feed.json");
          if (!cancelled) setState((s) => (s.status === "ready" && s.source === "live" ? s : { status: "ready", feed, source: "recorded" }));
        } catch (err) {
          if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
        }
        // Keep trying: the API may come up after the page does.
        timer = setTimeout(tick, POLL_MS * 3);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return state;
}
