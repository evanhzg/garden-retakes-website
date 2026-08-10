# REEEETAKES design conventions

This is the implementation reference for new pages and components. It records
the system already used by the homepage, player profiles, and the admin panel;
new work should compose these primitives rather than introduce a parallel visual
language.

## Design intent

The site is **Modernist utility UI**: direct, data-led, high-contrast, and
square. The visual vocabulary is one warm neutral ramp, one hot accent, strong
rules, and tabular figures. It should feel like a clear scoreboard and control
room, not a glossy game launcher.

- Use sharp corners. `--radius-sm`, `--radius-md`, and `--radius-lg` are all
  `0px`; do not add rounded cards, pills, or floating glass treatments.
- Prefer structure over decoration: divider rules, grids, compact labels, and
  measured whitespace are the primary hierarchy tools.
- Use a single semantic accent at a time. Accent means selected, primary,
  live, or action-required; it must not become general decoration.
- Use colour in addition to text/icon/state, never as the only indication of
  an error, a selected tab, a side, or a live status.

The active source of truth is [app/globals.css](../app/globals.css). It
contains earlier rules followed by newer system overrides, so append scoped
rules near the relevant current system section rather than reviving old
rounded/gradient styles.

## Foundations

### Colour and themes

Always use semantic tokens rather than raw hexadecimal values in application UI.

| Purpose | Token | Light | Dark |
| --- | --- | --- | --- |
| Page ground | `--color-bg` | `#f3f2f2` | `#1a1918` |
| Raised surface | `--color-surface` | `#eae9e9` | `#232120` |
| Main copy | `--color-text` | `#201e1d` | `#f3f2f2` |
| Divider/rule | `--color-divider` | text at 40% | text at 28% |
| Primary accent | `--color-accent` | `#ec3013` | `#ff4a28` |
| Secondary accent | `--color-accent-2` | `#e15b47` | `#ef6853` |

Neutral and accent ramps (`--color-neutral-100` through `-900`,
`--color-accent-100` through `-900`) are available when a semantic surface or
state needs more than the base tokens. The `.dark` class reverses the neutral
reading; do not hard-code light-only text or background colours.

Legacy aliases such as `--bg`, `--panel`, `--text`, `--muted`, and `--accent`
remain for older routes. New code should use `--color-*` tokens, except where a
component must preserve an existing legacy class exactly.

The signed-in user can choose an accent via `data-accent` on `html`. Primary
buttons and selected controls should therefore use `--btn-primary-bg`,
`--btn-primary-bg-hover`, and `--btn-primary-ink`, not a fixed orange.

### Typography and numbers

`Archivo` is the body and heading family; `JetBrains Mono` is reserved for
figures. The root layout exposes them as `--font-heading`, `--font-body`, and
`--font-mono`.

| Role | Default |
| --- | --- |
| Body | 15px / 1.55, `--font-body` |
| H1 | 42px, 800, 1.12 |
| H2 | 32px, 800, 1.12 |
| H3 | 25px, 800, 1.12 |
| H4 | 20px, 800, 1.12 |
| Eyebrow/caption | 10–13px, uppercase, `.kicker`/`.cap` styling |
| Scores, ELO, K/D, dates, Steam IDs | `.num` or `.mono` |

Use `tabular-nums` for any value that can change or aligns in a column. Large
profile figures use `.pro-stat-v`; homepage/admin figures use their local
figure classes but keep the same mono/tabular treatment. Keep labels concise,
uppercase only when they are metadata, and make a numeric value the visual
lead.

### Spacing, rules, and elevation

Use the 4px spacing scale: `--space-1` 4px, `--space-2` 8px,
`--space-3` 12px, `--space-4` 16px, `--space-6` 24px, and `--space-8` 32px.
For page-level breathing room, use the established clamps rather than fixed
desktop padding.

- `--page-pad: clamp(24px, 5vw, 80px)` is the standard horizontal page gutter.
- `2px solid var(--color-divider)` separates major profile/home groups.
- `1px solid var(--color-divider)` separates controls, tables, and compact
  cards.
- Shadows (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) are restrained. Use
  them only where a surface needs elevation; rules are the default separator.
- `.hr` is the standard 2px horizontal rule.

## Application shell and layout

`RootLayout` establishes the global shell:

1. `NavBar` sits above the app content.
2. `.layout-wrapper` fills the remaining viewport.
3. `.main-content` is the single desktop scroll container.
4. `main.container` holds route content; `SiteFooter` follows inside the same
   scroll region.

Do not create a second independent scroll area for ordinary pages. The body is
intentionally non-scrolling on desktop. Do not reintroduce a centred global
max-width: `.container` is full width, and pages own their internal measure.

Use `.measure` only for reading-oriented content. Use `.full-bleed` only as a
direct `main.container` child when a band intentionally reaches both page
edges, and wrap its inner content in `.full-bleed-inset` to restore
`--page-pad`. Never solve a full-bleed layout with a random negative margin.

### Responsive rules

Components are fluid first. Existing major collapse points are 900/860px for
navigation and two-column content, 720px for overflow safeguards, 640px for
compact controls, and 560px for dense profile/inventory layouts. Prefer
`repeat(auto-fit, minmax(...))`, `minmax(0, 1fr)`, `clamp()`, wrapping flex
rows, and horizontal table wrappers.

On narrow viewports, wide tables live in `.table-wrap`, `.pro-tablewrap`, or
`.adm-scroll`; do not shrink data columns until they become illegible. The
admin navigation becomes a compact horizontal group at 860px. Test at a
desktop width, 860px, 720px, and 375–480px before shipping a new page.

## Reusable primitives

Use these classes/components before making a local variant.

| Need | Use | Convention |
| --- | --- | --- |
| Primary action | `.btn.btn-primary` | Accent fill, primary action only |
| Secondary action | `.btn.btn-secondary` | Divider outline, neutral action |
| Tertiary action | `.btn.btn-ghost` | Accent text, no persistent border |
| Compact/icon action | `.btn.small` / `.btn-icon` | Preserve accessible text/`aria-label` |
| Text field | `.field` + `.input` | Visible label; `.input` focus style is built in |
| Segmented control | `.seg` + `.seg-opt` | Native input remains in the label |
| Selectable filter | `.chip`, `.chip.active` | Group in `.chip-row` or `.pro-filters` |
| Neutral content unit | `.card` | Compact, surface-backed; not a substitute for every section |
| Data table | `.table` inside an overflow wrapper | Uppercase headers, numeric columns right-aligned |
| Empty state | `.empty-hint` | Explain the state and offer the next valid action |
| Avatar | `AvatarImage` + size class | Fixed crop; do not use ad-hoc image dimensions |
| Toast/error notice | Existing admin/profile notice classes | Keep status text concise and use live regions where dynamic |

Buttons are `inline-flex`, 14px heading weight, and sharp. A new control must
have a real button/link semantic, a keyboard focus state, and a disabled state
only when the action is temporarily unavailable. Do not style a `div` as a
button.

## Homepage conventions

The homepage is a sequence of distinct, evidence-led sections, not a generic
card grid. It uses homepage-specific components under `components/home/`:
hero/server state, season vote, marquee, standout/podium, clips, stats,
season update, modes, skins, and final CTA.

- Keep a `home-block` as a meaningful narrative unit; its top margin is
  `clamp(48px, 7vw, 96px)`.
- Use `.home-block-head` plus a short `.home-block-lead` (max 62ch) before
  dense content.
- Major home figures are concise and real. If data is unavailable, show an
  honest empty/loading state rather than a fabricated metric.
- Use grids for figures and previews (`.home-figures`, `.home-clips`,
  `.home-split`); the split collapses at 860px.
- Hover motion is subtle: outline/accent change or a 2px lift. It must not be
  essential to understanding a card.

## Profile conventions

`/profile` and `/players/[steamId]` share `ProfileHero` and `ProfileStats`.
They must remain the same information architecture; ownership changes controls
and data source, not the layout. `ProfileHero` owns identity, headline figures,
loadout, social links, and owner-only controls. `ProfileStats` owns its
accessible tabbed analysis area.

- Start with `.pro-hero`; profile sections use `.pro-section` and a ruled
  `.pro-section-head`.
- Use `.pro-headline` for primary metrics and `.pro-stat` / `.pro-stat-v` /
  `.pro-stat-k` / `.pro-stat-sub` for label/value groups.
- Season and ranked-round controls use `SeasonFilters`. Keep the page's
  existing surrounding section and spacing; the component only owns the query
  links.
- Player/pro legacy performance panels use `PerformanceMeters`, which retains
  their existing `.meter`, `.track`, `.fill`, and `.sparkline` structure.
- Use `.pro-tabs` with `role="tablist"`, proper selected/control relationships,
  and a matching `role="tabpanel"` for progressive detail.
- Put any wide history/map table in `.pro-tablewrap`; right-align numeric cells
  with `.r` and set them in `.num`.
- Profile loadout uses the inventory slot definition; do not duplicate weapon
  slot constants in a profile page.

## Admin conventions

Admin is a task console, not a marketing page. `AdminPanel` is the coordinated
shell: navigation state is URL-backed, role filtering hides inaccessible
sections, and the content area starts with `.adm-head`.

- Use `.adm-shell` for sidebar + content. It is two columns on desktop and a
  single compact navigation flow at 860px.
- Add a new destination to the `SECTIONS` definition in `AdminPanel`, including
  a short action-oriented label, a concise hint, an icon, and minimum role.
- Put owner/moderator restrictions in both UI and server authorization. Hidden
  UI is guidance, never the security boundary.
- The overview uses `.adm-cards` for small triage tiles. A tile with a target
  tab is a real `<button>` with `.is-link`; attention needs the `.attention`
  state plus explanatory copy.
- Use `.adm-strip` for compact contextual facts/actions and `.adm-freeze` for
  blocking server-wide states. Destructive/irreversible actions state their
  consequence in a confirmation first.
- Tables use `.adm-scroll` and `.table`; preserve its explicit overflow and
  mobile min-width protections. Put action buttons in `.adm-actions`.
- Dynamic messages use the existing toast/live-region conventions. Do not
  silently change an operational state.

## Motion and accessibility

The site provides reduced motion through both the OS setting and the user
override on `html[data-motion]`. New animation must be optional under
`prefers-reduced-motion: reduce` and `data-motion="off"`. Existing motion is
short and functional: fade/slide entry, small hover lift, marquee, and status
pulse. Avoid continuous decorative animation.

- Keep `:focus-visible` visible; the global default is a 2px accent outline.
- Every icon-only button needs an `aria-label` and useful title where helpful.
- Use labels for inputs; `.sr-only` is available for compact admin controls.
- Tabs, drawers, menus, and modals need the appropriate ARIA relationship plus
  Escape/outside-click behaviour where the existing pattern uses it.
- Respect semantic headings and do not skip levels merely for visual size.
- Use `aria-live="polite"` for asynchronous confirmation/error text.

## New-page recipe

1. Place the route inside the existing root shell; begin with normal page
   padding, or intentionally use the full-bleed pattern.
2. Define the page question and choose a section hierarchy before choosing
   cards. Lead with the decision, status, or metric a user came for.
3. Compose `.btn`, `.chip`, `.table`, `.card`, and shared domain components
   before adding a one-off component or CSS class.
4. Keep data-facing numbers mono, tables horizontally safe, and all actions
   keyboard accessible.
5. Build the desktop layout fluidly, then verify the 860px, 720px, and narrow
   phone behaviours.
6. Check light/dark theme, a user accent, reduced motion, empty/loading/error
   states, long names, large values, and unauthorised state where relevant.

## Refactoring policy

Extract a component when markup and behavioural rules repeat in two or more
places and should evolve together. Preserve its rendered class structure when
the existing CSS is route-specific; refactoring is not permission for an
unrequested visual redesign. Prefer narrow domain components (for example,
`SeasonFilters` and `PerformanceMeters`) over an overly generic "UI factory."

Before changing an existing shared primitive, search its class names throughout
the repository, check the final CSS override order in `app/globals.css`, and
verify the homepage, own profile, public profile, pro profile if affected, and
admin at their relevant breakpoints.
