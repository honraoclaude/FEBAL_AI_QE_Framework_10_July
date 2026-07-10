# UI/UX — Wireframes, Component Library, Dashboards

The shipped web app (`apps/web`) implements these designs; this document is the
Figma-ready specification (tokens, components, layouts) for design handoff.

## 1. Design language

**Positioning:** premium, calm, information-dense enterprise console — closer
to Linear/Datadog than to consumer SaaS. Dark-first (light theme derives from
the same token table).

### Tokens (Figma variables)

| Token | Dark value | Usage |
|---|---|---|
| `page` | `#0d0d0d` | app background |
| `surface-1/2/3` | `#1a1a19` / `#232322` / `#2c2c2a` | cards, hovers, insets |
| `text-primary/secondary/muted` | `#ffffff` / `#c3c2b7` / `#898781` | ink hierarchy |
| `grid` / `baseline` / `border` | `#2c2c2a` / `#383835` / `rgba(255,255,255,.1)` | chart chrome, hairlines |
| `series-1…8` | `#3987e5 #199e70 #c98500 #008300 #9085e9 #e66767 #d55181 #d95926` | categorical chart palette (validated, fixed order — never cycled) |
| `status good/warning/serious/critical` | `#0ca30c #fab219 #ec835a #d03b3b` | reserved for state, never series |
| `accent` | `#3987e5` | primary actions, active nav |
| type | `system-ui` stack; 14px body; `tabular-nums` for aligned figures | |
| radius | 10px cards / 6px controls | |

Chart conventions: thin marks, 2px lines, recessive grid, hover crosshair +
tooltip on every plot, legend for ≥2 series, text always in ink tokens.

## 2. Application shell

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│  Q  QE.ai    │  Page title                Meridian Wealth · role switch │
│              ├──────────────────────────────────────────────────────────┤
│ OVERVIEW     │                                                          │
│ ◧ Dashboard  │                    page content                          │
│ ⚡ Sprint     │              (max-width 1440, 24px gutter)               │
│ ☰ Backlog    │                                                          │
│ PIPELINE     │                                                          │
│ ✎ Refinement │                                                          │
│ {} Develop.  │                                                          │
│ ✓ Testing    │                                                          │
│ ⛟ Release    │                                                          │
│ ↻ Deploy&L.  │                                                          │
│ INTELLIGENCE │                                                          │
│ ❉ AI Agents  │                                                          │
│ 📚 Knowledge │                                                          │
│ 📈 Metrics   │                                                          │
│ 🗎 Reports    │                                                          │
│ PLATFORM     │                                                          │
│ ⚙ Admin      │                                                          │
│ ☼ Settings   │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

## 3. Key screens

### Home Dashboard (`/`)
Row 1 — four **donut meters**: AI Health, Sprint Health, Release Health,
Compliance. Row 2 — four **stat tiles with sparklines**: Quality Score,
Automation %, Risk Score, Production Stability. Row 3 — Story Progress
(segmented bar with legend) + Pending Approvals queue. Row 4 — Defect Trend
and Quality/Automation trend **line charts** (crosshair + tooltip). Row 5 —
Agent Status strip (healthy/running/degraded/error counts).

### Phase workspace (`/refinement` … `/deploy-learn`, one shared layout)
1. **Header card** — workflow name, step summary, subject picker, `▶ Run`.
2. **Human Approvals panel** (amber) — approve/reject inline, role-checked.
3. **Runs table** ↔ **Pipeline visualisation** (status-dotted step chips:
   green complete, blue running, amber awaiting approval, red failed).
4. **Decision cards** — the governance envelope rendered: agent, risk badge,
   confidence meter, reasoning, recommended action, evidence list,
   prompt/LLM/knowledge versions, 👍/👎 feedback.

### Agent Health Dashboard (`/agents`)
Catalog grouped by phase; each agent card = name, status badge, description,
gatekeeper/tag chips, runs today + avg latency. Amber left border marks
gatekeepers. (Deliverable 34.)

### Metrics (`/metrics`)
Squad section (8 tiles + execution trend), Leadership section (8 tiles +
12-week quality trend), AI Predictions grid (8 cards: probability badge,
narrative, drivers).

### Reports (`/reports`)
Audit trail table (seq, kind, actor, summary, hash prefix) + chain-integrity
badge + NDJSON export; recommendation feedback table.

### Backlog (`/backlog`)
JIRA connection card (status, direction, cron, last sync) with **Sync with
JIRA** / **Incremental Sync** actions and last-run stats; backlog table.

## 4. Component library

| Component | Props / states | File |
|---|---|---|
| `StatTile` | label, value, unit, badge, children (sparkline) | `components/common.tsx` |
| `Meter` | value 0–100, auto status colour, a11y label | `components/charts.tsx` |
| `LineChart` | multi-series, crosshair, tooltip, legend, aria-label | `components/charts.tsx` |
| `Sparkline` | trend points, end-dot | `components/charts.tsx` |
| `ProgressBar` | segments + legend, 2px gaps | `components/charts.tsx` |
| `Pipeline` | run steps as status chips with arrows | `components/common.tsx` |
| `DecisionCard` | envelope rendering + feedback callbacks | `components/common.tsx` |
| `StatusBadge` / `RiskBadge` | semantic colour mapping (status colours reserved) | `components/common.tsx` |
| `Confidence` | meter + tabular % | `components/common.tsx` |
| Tables, buttons, selects, nav | `.data`, `.btn[.primary/.danger/.sm]`, `.nav-link` | `theme.css` |

## 5. Accessibility

- WCAG 2.2 AA intent: keyboard-reachable controls, `role="img"` + labels on
  charts, tooltips duplicated by tables (audit/feedback/backlog views), status
  never conveyed by colour alone (badges carry text), `tabular-nums` for data
  columns, dark palette validated against the dark surface.
