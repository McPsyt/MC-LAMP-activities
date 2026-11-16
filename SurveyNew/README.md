# SurveyNew (`lamp.survey_new`)

A modern survey activity for MindCheck (mindLAMP) with branching logic, 18 question types, scoring,
alerts, translations, answer piping and randomised options — plus a **standalone single-file Survey
Builder** that researchers use to author surveys and publish them to the server.

- **Activity:** React 19 + Vite 8 + Tailwind CSS v4 + shadcn/ui (zinc theme by default). It is built into
  one self-contained, ASCII-only HTML file that the dashboard and phone apps load like every other activity.
- **Builder:** the same renderer plus an editor. It is one HTML file
  ([`release/survey-builder.html`](release/survey-builder.html)) that runs offline by double-clicking it.
- Non-technical users should read the collaborator guide (a separate shared document), not this README.

```
src/survey/      framework-free core: schema, conditions, visibility, scoring, piping, payload, legacy conversion, i18n
src/renderer/    shared React renderer (SurveyRunner + one input component per question type)
src/activity/    activity entry: host bridge (postMessage) + App
src/builder/     builder app (editor, preview, import/export, LAMP API client + publish)
src/templates/   example surveys (medication EMA, PHQ-9, GAD-7, daily check-in, all types)
src/styles/      Tailwind entry points + themes.css + themes/registry.ts
dev/host.html    parent-app simulator (mirrors dashboard EmbeddedActivity) for dev and E2E tests
tests/           Vitest unit + component tests (jsdom), fake LAMP server
e2e/             Playwright UI tests (phone emulation + builder from file://)
```

## Building

You need Node >= 22.12. This machine has no system Node; one was installed with micromamba:

```bash
micromamba create -p ~/.local/envs/node24 -c conda-forge nodejs=24   # once
export PATH=~/.local/envs/node24/bin:$PATH
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server. Open `/dev/host.html` to run surveys inside the parent simulator, and `/builder.html` for the builder. |
| `npm run build` | Builds the activity to `build/index.html` as a single file, then checks it is ASCII-only and loads nothing external. |
| `../build.sh SurveyNew/` (from the repo root) | Standard pipeline. Produces `dist/in/surveynew.html` and `dist/out/surveynew.html.b64`. |
| `npm run build:builder` | Builds `release/survey-builder.html`. Commit it so collaborators can download it. |
| `npm test` | Unit and component tests. |
| `npm run test:e2e` | Builds, then runs Playwright: Pixel 7 and iPhone 14 emulation plus builder tests. Run `npx playwright install chromium` first. |
| `npm run test:visual` | Optional screenshot baselines. Add `--update-snapshots` to refresh them. Also writes `docs/screenshots/`. |
| `npm run analyze` | Shows which packages take space in the activity bundle. |

The activity bundle must stay **pure ASCII**. The dashboard decodes activities with `atob()` (Latin-1),
so any UTF-8 byte (Chinese UI strings, emoji) would be garbled. Rolldown's `output.charset: "ascii"`
handles this, and `scripts/check-bundle.mjs` enforces it. The activity bundle is about 670 KB; the old
Survey was 657 KB.

## Deploying (server side, done by you)

1. Run `./build.sh SurveyNew/`, then commit `dist/` to `main`.
2. Register the ActivitySpec `lamp.survey_new` with
   `executable: "https://raw.githubusercontent.com/McPsyt/MC-LAMP-activities/main/dist/out/surveynew.html.b64"`.
   The spec isn't in the dashboard's `demoActivities` fallback map, so `executable` is required.
3. Register it **without** a `settings` JSON Schema. The dashboard then shows no settings form and leaves
   builder-published settings alone when researchers edit the name or schedule (the editor re-fetches
   settings from the server, see `MC-LAMP-dashboard/.../Activity.tsx`).

## Parent-app protocol (unchanged from other activities)

- **In:** one `message` event on iframe load:
  `{activity: {id, name, settings, ...}, configuration: {language}, autoCorrect, noBack}`.
  The bridge (`src/activity/bridge.ts`) listens before React mounts. It accepts `data.activity ?? data`
  and ignores unrelated messages.
- **Submit:** `window.parent.postMessage(JSON.stringify(result), "*")`. `result.timestamp` is always truthy.
- **Close:** `window.parent.postMessage(null, "*")`. The close button is hidden when `noBack` is set.
- **Resume:** progress is kept in `localStorage["surveynew-progress-<activityId>"]`. It expires after the
  configured hours (default 12) and is ignored if the survey's questions changed.

## Survey definition (`activity.settings`)

```jsonc
{
  "schemaVersion": 1, "id": "medication_ema", "version": "3",
  "title": {"en": "Medication check-in", "fr": "Suivi des médicaments"},  // any text can be a {lang: text} map
  "defaultLanguage": "en", "languages": ["en", "fr"],
  "intro": {"title": "...", "body": "..."}, "completion": {"title": "...", "body": "..."},
  "options": {"layout": "question|section|single", "showProgress": true, "showQuestionNumbers": false,
              "allowBackNavigation": true, "autoAdvance": false, "confirmExit": true,
              "resume": {"enabled": true, "expiresAfterHours": 12}},
  "appearance": {"theme": "zinc", "mode": "light|dark|system", "radius": "none|sm|md|lg|xl"},
  "questions": [
    {"id": "dose_taken", "type": "boolean", "text": "Did you already take your first dose of medication?"},
    {"id": "dose_time", "type": "time", "text": "At what time?",
     "showIf": {"question": "dose_taken", "op": "eq", "value": "Yes"}}
  ],
  "scores": [{"id": "total", "label": "Total", "method": "sum|mean|count", "questions": ["q1", "grid"]}],
  "alerts": [{"id": "si", "when": {"question": "q9", "op": "gt", "value": 0}, "title": "...", "message": "...",
              "severity": "info|warning|critical", "timing": "immediate|submit"}]
}
```

The full TypeScript types are in [`src/survey/schema.ts`](src/survey/schema.ts).

- **Text** is Markdown (bold, italic, links, lists, quotes, images). Raw HTML is never rendered.
- **Piping:** `{{question_id}}` (or `{{grid.row}}`) inserts an earlier answer as the participant saw it.

### Question types and what gets saved

| type | saved value |
|---|---|
| `single`, `dropdown`, `likert` (presets `agree5`, `agree7`, `frequency4` (PHQ wording, 0-3), `frequency5`, `satisfaction5`, or custom options) | option value. With `allowOther`, the value is `"other"` and an extra `(Other)` slice holds the typed text. |
| `multiple` (`minSelected`, `maxSelected`, `exclusive` options) | array of option values |
| `boolean` | `"Yes"` / `"No"` |
| `matrix` (rows + one shared scale) | one slice per row |
| `ranking` | array of values in ranked order |
| `slider`, `vas` (0-100), `rating` (NRS), `faces` (1..3/5/7), `number`, `duration` (minutes) | number |
| `short`, `text` | trimmed string |
| `date` / `time` / `datetime` | `YYYY-MM-DD` / `HH:mm` (24h) / `YYYY-MM-DDTHH:mm:00±hh:mm` |
| `info`, `section` | nothing (display only; `section` starts a screen in the `section` layout) |

### Logic

```
Condition = {all:[...]} | {any:[...]} | {not: C}
          | {question: "id" | "matrixId.rowId" | "id.other", op, value}
          | {score: "id", op, value}
op = eq neq in notIn contains notContains gt gte lt lte answered unanswered
```

- `showIf` may only reference earlier questions. Hiding cascades: if A hides B, anything that depends on
  B is hidden too.
- Answers to hidden questions are kept while the participant edits, but submitted as `null` and listed
  in `static_data.skipped`.
- `endSurveyIf` skips everything after the question once it is true.
- Comparisons ignore case; times and dates compare in chronological order.

## Result format

```jsonc
{
  "timestamp": 1763300000000, "duration": 41250,
  "temporal_slices": [   // one per answerable item, definition order, same shape for every response
    {"item": "Did you already take your first dose of medication?", "value": "No", "type": null, "level": null, "duration": 5200},
    {"item": "At what time?", "value": null, "type": null, "level": null, "duration": 0}
  ],
  "static_data": {
    "survey": {"schema": 1, "id": "medication_ema", "version": "3"},
    "language": "fr-FR",
    "answers": {"dose_taken": "No"},          // by question id: use this for analysis across versions
    "skipped": ["dose_time"],                 // hidden by branching / ended early
    "scores": {"total": 12}, "alerts": ["si"],
    "option_order": {"q4": ["c", "a", "b"]},  // only for randomised questions
    "terminated_at": "consent",               // only when endSurveyIf ended the survey
    "resumed": false
  }
}
```

- `item` is always the **default-language, un-piped** question text. Dashboard views match slices by
  `item`, so it must not depend on the participant's language.
- The dashboard overwrites `timestamp`, `duration` and `activity`.
- Legacy `warnings` are now in-survey `alerts` (`static_data.alerts`). The dashboard's own warning
  dialog only works for array-shaped settings.

## Theming

Tokens are shadcn/ui CSS variables (OKLCH) in [`src/styles/themes.css`](src/styles/themes.css).

- Zinc is on `:root`.
- The other presets are `[data-theme="x"]` blocks, with `[data-theme="x"].dark` for dark mode: slate,
  stone, neutral, blue, green, violet, rose, orange.

To add a theme:

1. Copy a token block from ui.shadcn.com/themes or tweakcn.com into `themes.css` as
   `[data-theme="mine"] {...}` and `[data-theme="mine"].dark {...}`.
2. Add `{id: "mine", label: "Mine", swatch: "..."}` to [`src/styles/themes/registry.ts`](src/styles/themes/registry.ts).

Surveys choose `appearance.theme`, `mode` and `radius`. The activity sets `data-theme`, `data-radius`
and `.dark` on `<html>`. The builder preview sets them on the phone frame, and portals render inside it
(see `src/lib/portal.tsx`).

## Builder ↔ server

`src/builder/server/lampApi.ts` uses plain `fetch` with HTTP Basic auth. The server's `cors()` allows
any origin, including `file://`.

| Builder action | API call |
|---|---|
| Studies | `GET /researcher/me/study`. Admin accounts get a researcher picker: `GET /researcher`, then `/researcher/:id/study`. |
| List | `GET /study/:id/activity?ignore_binary=true`, filtered to `lamp.survey_new` |
| Open | `GET /activity/:id` |
| **Publish (in place)** | `PUT /activity/:id {settings}` only. The server's partial update keeps name, schedule and notification ids. |
| Create | `POST /study/:id/activity`, then `PUT /type/:id/attachment/lamp.dashboard.activity_details/me` (same as the dashboard does) |
| History | `lamp.survey_new.history` attachment, written **before** the settings PUT. Keeps the last 20 versions. |

Publish runs in this order:

1. Validation.
2. Conflict check: has the server copy changed since it was opened?
3. Change summary with breaking-change warnings.
4. Version bump.
5. History write.
6. PUT.
7. Re-fetch to verify.

Credentials are held in memory, or in sessionStorage if "Stay signed in until I close this tab" is
ticked. They are never written to drafts or exports.

## UI translations

The UI is bundled in en, es, fr, de, da, it, hi, ko, zh-CN and zh-HK (`src/survey/i18n/`). Except for a
few strings reused from the old Survey, the non-English UI strings are **machine-translated and should
be reviewed by native speakers**. This applies especially to the PHQ/GAD frequency wording, which should
match the official translated instruments.
