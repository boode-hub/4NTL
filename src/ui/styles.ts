/**
 * Card styles. They live inside the card's shadow root, so the page's CSS can't
 * leak in and ours can't leak out. Kept as a string so the content script stays
 * a single injectable file.
 */
export const CARD_CSS = /* css */ `
:host { all: initial; }

.card {
  --bg: #ffffff;
  --fg: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --subtle: #f1f5f9;
  --accent: #0369a1;
  --malicious: #dc2626; --malicious-bg: #fee2e2; --malicious-fg: #991b1b;
  --suspicious: #d97706; --suspicious-bg: #fef3c7; --suspicious-fg: #92400e;
  --clean: #16a34a; --clean-bg: #dcfce7; --clean-fg: #166534;
  --unknown: #64748b; --unknown-bg: #f1f5f9; --unknown-fg: #334155;

  box-sizing: border-box;
  width: 320px;
  max-height: calc(100vh - 16px);
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.08);
  font: 13px/1.4 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  text-align: left;
  animation: enter 120ms ease-out;
}
.card *, .card *::before, .card *::after { box-sizing: border-box; }
.card.inline { width: 100%; max-height: none; border: 0; border-radius: 0; box-shadow: none; animation: none; }

@media (prefers-color-scheme: dark) {
  .card {
    --bg: #111827;
    --fg: #e5e7eb;
    --muted: #9ca3af;
    --border: #273244;
    --subtle: #1f2937;
    --accent: #7dd3fc;
    --malicious: #f87171; --malicious-bg: rgba(248, 113, 113, 0.16); --malicious-fg: #fca5a5;
    --suspicious: #fbbf24; --suspicious-bg: rgba(251, 191, 36, 0.16); --suspicious-fg: #fcd34d;
    --clean: #4ade80; --clean-bg: rgba(74, 222, 128, 0.14); --clean-fg: #86efac;
    --unknown: #9ca3af; --unknown-bg: rgba(156, 163, 175, 0.16); --unknown-fg: #d1d5db;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.3);
  }
}

@keyframes enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }

.header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid var(--border);
}
.title { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ioc {
  flex: 1; min-width: 0;
  font: 12.5px/1.4 ui-monospace, 'Cascadia Mono', Consolas, 'SF Mono', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  user-select: all;
}
.type {
  flex: none;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--muted);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 0 5px;
}
.icon-btn {
  flex: none; display: inline-grid; place-items: center;
  width: 26px; height: 26px; padding: 0;
  border: 0; border-radius: 6px; background: transparent; color: var(--muted);
  cursor: pointer;
}
.icon-btn:hover { background: var(--subtle); color: var(--fg); }
.icon-btn:focus-visible, .btn:focus-visible, .choice:focus-visible, .link:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 1px;
}
.icon-btn svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

.provider { padding: 10px 12px 12px; }
.provider + .provider { border-top: 1px solid var(--border); }
.provider-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.provider-name { font-weight: 600; font-size: 12px; color: var(--muted); }

.pill {
  font-size: 11px; font-weight: 700; letter-spacing: 0.02em;
  padding: 2px 8px; border-radius: 999px;
  background: var(--unknown-bg); color: var(--unknown-fg);
}
.v-malicious .pill { background: var(--malicious-bg); color: var(--malicious-fg); }
.v-suspicious .pill { background: var(--suspicious-bg); color: var(--suspicious-fg); }
.v-clean .pill { background: var(--clean-bg); color: var(--clean-fg); }

.headline { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px; margin-top: 4px; }
.headline-value { font-size: 22px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; }
.v-malicious .headline-value { color: var(--malicious); }
.v-suspicious .headline-value { color: var(--suspicious); }
.v-clean .headline-value { color: var(--clean); }
.headline-caption { color: var(--muted); font-size: 12px; }

.gauge { height: 4px; margin-top: 6px; border-radius: 2px; background: var(--subtle); overflow: hidden; }
.gauge-fill { height: 100%; border-radius: 2px; background: var(--unknown); }
.v-malicious .gauge-fill { background: var(--malicious); }
.v-suspicious .gauge-fill { background: var(--suspicious); }
.v-clean .gauge-fill { background: var(--clean); }

.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.tag { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--subtle); }

.facts { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 8px 0 0; font-size: 12px; }
.facts dt { color: var(--muted); white-space: nowrap; }
.facts dd { margin: 0; overflow-wrap: anywhere; }

.message { margin: 6px 0 0; font-size: 12.5px; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; min-height: 22px; }
.meta { color: var(--muted); font-size: 11.5px; }
.actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.link { color: var(--accent); font-size: 12px; font-weight: 500; text-decoration: none; border-radius: 3px; }
.link:hover { text-decoration: underline; }
.btn {
  font: inherit; font-size: 12px; font-weight: 500;
  padding: 2px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--fg); cursor: pointer;
}
.btn:hover { background: var(--subtle); }

.skeleton { display: grid; gap: 6px; margin-top: 8px; }
.skeleton span {
  height: 10px; border-radius: 4px;
  background: linear-gradient(90deg, var(--subtle) 25%, var(--border) 50%, var(--subtle) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}
.skeleton span:nth-child(1) { width: 45%; height: 18px; }
.skeleton span:nth-child(2) { width: 85%; }
.skeleton span:nth-child(3) { width: 65%; }

.notice { padding: 12px; }
.notice-text { margin: 0; color: var(--muted); }
.choices { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
.choice {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--fg); cursor: pointer; text-align: left;
}
.choice:hover { background: var(--subtle); }

@media (prefers-reduced-motion: reduce) {
  .card, .skeleton span { animation: none; }
}
`;
