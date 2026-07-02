# Marketing Planner — Engine Specification

**Status:** Draft for approval · **Date:** 2026-07-02
**Scope:** Marketing operations only. No inventory, no SAP.
**Home:** This repository, under `/planner`, reusing the existing Astro SSR + Cloud Run + Firestore + Admin SDK + session-cookie stack.

---

## 1. Design principles

Borrowed from **Jira**: workflow-driven architecture (statuses + transitions carry all logic), transition rules (conditions / validators / post-functions), separation of workflow, permissions, and automation, immutable audit history, dashboards derived from history.

Borrowed from **ClickUp**: business-friendly hierarchy (Space → Brand → Work Item), everything-is-a-task, rich custom fields, multiple views over one dataset, templates, intake forms, dependencies, recurring items.

Improvements over both: fully admin-configurable without code deploys, mobile-first card UI, brand-centric organization for the FMCG portfolio, native multi-stage approvals, no plugin ecosystem — one engine, one deployment.

**Deliberately excluded from v1 UI (engine supports them later):** chat, whiteboards, goals/OKRs, time tracking, sprints, email integration, AI writing.

---

## 2. Hierarchy

```
Workspace (implicit — the app)
├── Spaces (departments): Marketing, Digital, Events, Sponsorship, Creative, Management
├── Brands: Young's, Real Thai, Borges, Pasta Zara, … (reuses existing Brands collection)
└── Work Items (the only unit of work)
    └── Subtasks (work items with parentId)
```

A work item always belongs to exactly one Space, and optionally one or more Brands. Brand is a dimension, not a container — one campaign can span brands.

---

## 3. Firestore data model

All new collections are planner-namespaced. Client access stays **deny-all**; every read/write goes through server routes using the Admin SDK, exactly like `admin-data.ts` today.

### 3.1 `plannerConfig/*` (singleton config docs, editable in admin panel)

| Doc | Contents |
|---|---|
| `spaces` | array of `{ id, name, icon, order, archived }` |
| `roles` | role definitions and permission grants (§10) |
| `notificationRules` | trigger → channel matrix (§9) |

### 3.2 `workItemTypes/{typeId}`

Defines a marketing-specific type (Campaign, Social Post, Video, Photography, Artwork, Product Launch, Promotion, Event, Sponsorship, Media Booking, Press Release, POSM Request, Packaging Design, Website Update, Influencer Campaign, Email Campaign, Internal Request, Market Research, Meeting, Other).

```jsonc
{
  "name": "Campaign",
  "icon": "megaphone",
  "workflowId": "wf_campaign",        // which workflow governs it
  "fieldIds": ["budget", "objective", "audience", "startDate", "endDate", "agency"],
  "templateIds": ["tpl_product_launch"],
  "archived": false
}
```

### 3.3 `customFields/{fieldId}`

```jsonc
{
  "label": "Budget (MVR)",
  "type": "number",                    // text | longtext | number | currency | date |
                                       // select | multiselect | user | brand | url | file | checkbox
  "options": [],                       // for select/multiselect
  "archived": false
}
```

Field *values* live on the work item under `fields.{fieldId}`. Requiredness is **per workflow status**, not per field (§4.3), so the same field can be optional in Draft and mandatory at Pending Approval.

### 3.4 `workflows/{workflowId}`

The heart of the engine. A workflow is a directed graph of statuses and transitions.

```jsonc
{
  "name": "Campaign workflow",
  "statuses": [
    { "id": "created",   "name": "Created",          "category": "todo",       "color": "#8b8b8b" },
    { "id": "planning",  "name": "Planning",         "category": "todo",       "color": "#3b82f6" },
    { "id": "approval",  "name": "Pending Approval", "category": "in_progress","color": "#f59e0b" },
    { "id": "approved",  "name": "Approved",         "category": "in_progress","color": "#10b981" },
    { "id": "inprogress","name": "In Progress",      "category": "in_progress","color": "#6366f1" },
    { "id": "review",    "name": "Review",           "category": "in_progress","color": "#ec4899" },
    { "id": "scheduled", "name": "Scheduled",        "category": "in_progress","color": "#14b8a6" },
    { "id": "completed", "name": "Completed",        "category": "done",       "color": "#22c55e" },
    { "id": "archived",  "name": "Archived",         "category": "done",       "color": "#525252" }
  ],
  "transitions": [
    {
      "id": "submit_for_approval",
      "name": "Submit for approval",
      "from": ["planning"],
      "to": "approval",
      "conditions": [ { "type": "role", "roles": ["marketing", "manager", "admin"] } ],
      "validators": [
        { "type": "fieldRequired", "fieldId": "budget" },
        { "type": "fieldRequired", "fieldId": "objective" },
        { "type": "descriptionRequired" }
      ],
      "postFunctions": [
        { "type": "lockEditing" },
        { "type": "startApproval", "approvalChainId": "campaign_approval" },
        { "type": "notify", "audience": "approvers", "template": "approval_requested" }
      ]
    }
    // … one entry per arrow in the graph
  ],
  "initialStatus": "created"
}
```

**Rule vocabulary (v1):**

- **Conditions** (who may see/fire the transition): `role`, `assignee`, `reporter`, `spaceMember`.
- **Validators** (may it fire): `fieldRequired`, `descriptionRequired`, `attachmentRequired`, `dueDateRequired`, `subtasksDone`, `approvalComplete`.
- **Post-functions** (what happens after): `assignUser`, `assignRole`, `setField`, `setDueDate` (relative, e.g. +7d), `lockEditing`, `unlockEditing`, `startApproval`, `createWorkItems` (from template), `notify`, `webhook`, `archiveAssets`.

Statuses hold **no logic** — everything lives on transitions. This is the single most important Jira idea and it is non-negotiable.

### 3.5 `approvalChains/{chainId}`

Multi-stage approvals, decoupled from the workflow (a transition post-function *starts* a chain; a validator on the exit transition requires it complete).

```jsonc
{
  "name": "Campaign approval",
  "stages": [
    { "name": "Marketing Manager", "approverRoles": ["manager"],  "mode": "any" },
    { "name": "Management",        "approverRoles": ["management"], "mode": "all" }
  ],
  "onReject": "return_to_planning"   // transitionId fired on rejection
}
```

Per-item approval state lives on the work item (`approval` map: current stage, decisions with uid + timestamp + comment). Modes: `any` (one approver suffices), `all`, `majority`.

### 3.6 `workItems/{itemId}` — the one object

```jsonc
{
  "typeId": "campaign",
  "workflowId": "wf_campaign",      // snapshot at creation; workflow edits don't break in-flight items
  "title": "Real Thai Ramadan Campaign",
  "description": "…",               // rich text (markdown)
  "spaceId": "marketing",
  "brandIds": ["real-thai"],
  "status": "planning",
  "assigneeUids": ["…"],
  "reporterUid": "…",
  "watcherUids": ["…"],
  "priority": "high",               // low | normal | high | urgent
  "labels": ["ramadan", "social"],
  "fields": { "budget": 25000, "objective": "…" },   // custom field values
  "parentId": null,                  // subtask support
  "dependsOn": ["itemId1"],          // dependency engine (§7)
  "blocks": ["itemId2"],             // maintained symmetrically server-side
  "startDate": null, "dueDate": null,
  "approval": { "chainId": "…", "stageIndex": 0, "decisions": [], "state": "pending" },
  "locked": false,
  "recurrence": null,                // RRULE string for recurring items
  "templateOrigin": "tpl_product_launch",
  "createdAt": …, "updatedAt": …, "completedAt": null, "archivedAt": null,
  "searchTokens": ["real", "thai", "ramadan", …]     // prefix search support
}
```

Subcollections per item: `comments/`, `attachments/` (Storage-backed, same pattern as product images), `activity/` (§11).

### 3.7 `automations/{automationId}`

Trigger → conditions → actions, evaluated server-side after every mutation.

```jsonc
{
  "name": "On campaign approved, spawn creative tasks",
  "trigger": { "type": "statusEntered", "statusId": "approved", "typeIds": ["campaign"] },
  "conditions": [ { "type": "fieldEquals", "fieldId": "needsCreative", "value": true } ],
  "actions": [
    { "type": "createWorkItems", "templateId": "tpl_creative_bundle", "linkAsSubtasks": true },
    { "type": "assignRole", "role": "creative" },
    { "type": "setDueDate", "relativeDays": 14 },
    { "type": "notify", "audience": "assignees", "template": "work_assigned" }
  ],
  "enabled": true
}
```

Triggers (v1): `statusEntered`, `itemCreated`, `fieldChanged`, `dueDateApproaching` (cron), `approvalDecided`, `commentAdded`. Actions reuse the post-function vocabulary. Loop protection: automation-initiated mutations carry a depth counter, max 3.

### 3.8 `templates/{templateId}`

A frozen work-item tree (item + subtasks + field defaults + checklist + relative dates). "New Product Launch" = one click → whole structure instantiated.

### 3.9 `intakeForms/{formId}`

Public-to-staff request forms (ClickUp's best idea). A form maps form fields → a work item type + defaults. Sales fills "Marketing Support Request" → item appears in Marketing space, already typed, categorized, and in workflow. v1: forms available to any logged-in staff; anonymous external forms deferred.

---

## 4. Workflow engine (server module `src/lib/planner/workflow.ts`)

The engine is one pure function plus an executor:

```
requestTransition(item, transitionId, actor)
  1. Load workflow (item.workflowId)
  2. Find transition; verify item.status ∈ transition.from
  3. Evaluate conditions(actor)      → 403 if any fail
  4. Evaluate validators(item)       → 422 with field-level errors if any fail
  5. Firestore transaction: set status, run inline post-functions (setField, assign, lock)
  6. Append activity entry (§11)
  7. Enqueue async post-functions (notify, webhook, createWorkItems)
  8. Evaluate automations for statusEntered
```

**Direct status edits are forbidden.** The only way an item changes status is `requestTransition`. This guarantee is what makes the audit trail and reports trustworthy.

### 4.3 Per-status required fields

`workflows.statuses[].requiredFieldIds` — enforced by the generic `fieldRequired` validator on every transition *into* that status. The admin panel renders this as a simple matrix (status × field).

---

## 5. Views (all read the same `workItems` query layer)

| View | Notes |
|---|---|
| **Kanban** | Columns = status *categories* or explicit status→column mapping per Space (Jira's board mapping: many statuses, few columns). Drag = `requestTransition`; invalid targets render disabled with the failing validator as tooltip. |
| **Calendar** | Month/week; items plotted by startDate–dueDate. The content-calendar view for social posts. |
| **Timeline (Gantt-lite)** | Horizontal bars per item, dependency arrows. Management's view. |
| **List/Table** | Sortable, filterable, inline-editable for unlocked fields, bulk actions. |
| **Workload** | Items grouped by assignee with counts + overdue flags. |
| **Brand view** | Any view filtered to one brand — a saved filter, not a separate system. |
| **My Work** | Everything assigned to or awaiting approval from the current user. |

Saved filters (`space + brand + type + status + assignee + label + date range`) are shareable URLs.

---

## 6. Approvals UX

- "Pending Approval" items surface in the approver's **My Work** with one-tap Approve / Reject / Comment.
- Rejection requires a comment and fires the chain's `onReject` transition.
- Full decision history (who, when, comment) rendered on the item's Approvals tab and frozen into activity log.

---

## 7. Dependencies & subtasks

- `dependsOn` / `blocks` maintained symmetrically in one transaction.
- Link types (v1): *blocks / blocked by*, *relates to*, *duplicates*. (Jira's full vocabulary later.)
- Validator `dependenciesDone` available for transitions (e.g., Artwork can't enter In Progress until Photography is Completed).
- Subtask progress rolls up: parent shows n/m done; optional validator `subtasksDone` gates parent completion.

---

## 8. Work item detail — tabs

Overview (fields + description) · Subtasks · Discussion (comments, @mentions) · Files · Approvals · Activity. Mobile-first: card layout, bottom-sheet transitions menu.

---

## 9. Notifications

Events: assigned, mentioned, comment on watched item, transition on watched item, approval requested, approval decided, due soon (24h cron), overdue.

Channels (v1): **in-app inbox** (Firestore `notifications/{uid}/items`) + **email** (Cloud Run job or Firebase Extensions / SMTP). Later: Teams webhook, push. Per-user channel preferences in `users/{uid}.notificationPrefs`.

---

## 10. Roles & permissions

Extends the existing custom-claims model. `scripts/create-admin.mjs` grows into `scripts/set-role.mjs` setting `role: "<roleId>"` (and keeps `admin: true` for the existing admin panel).

Roles (configurable in `plannerConfig/roles`): `admin`, `manager`, `management`, `marketing`, `creative`, `agency`, `readonly`.

Permission keys per role: `createItem`, `editItem`, `deleteItem`, `archiveItem`, `assign`, `comment`, `uploadFile`, `approve`, `manageConfig`, `export`. Space-level overrides (e.g., agency sees only Creative space, only items where they're assignee).

Middleware: `/planner/*` and `/api/planner/*` require a valid session (reuse `verifyAdminSession`, relaxed to accept any planner role, not just `admin: true`). `manageConfig` gates the admin/config UI.

---

## 11. Activity log (immutable audit)

`workItems/{id}/activity/{entryId}`: `{ ts, actorUid, kind, payload }` where kind ∈ `created | transition | fieldChanged | commentAdded | fileAdded | approvalDecision | automationRun | assigned | …`.

Written **inside** the same transaction as the mutation. Never updated, never deleted. Everything downstream — reports, dashboards, "what happened to this campaign" — derives from this stream. Nothing can disappear.

---

## 12. Dashboard

Server-rendered cards (matching the existing admin panel aesthetic): my items · pending my approval · due this week · overdue · campaign health by brand · workload by assignee · throughput (items completed per week, from activity) · budget committed vs. field sums. Widgets are config-driven (`plannerConfig/dashboard`) so layout is editable without deploys.

---

## 13. Admin configuration panel (`/planner/settings`)

The improvement over Jira: everything below editable by a `manageConfig` role, zero deploys.

Work item types · custom fields · workflow editor (status list + transition table with rule pickers; graphical graph editor is a later luxury) · required-fields matrix · approval chains · automations (trigger/condition/action builder) · templates (build an item tree, save as template) · intake forms · roles & permissions · notification rules · spaces.

Config mutations are themselves activity-logged (`plannerConfig` audit subcollection).

---

## 14. Integration with this repo

```
src/pages/planner/…            SSR pages (board, calendar, list, item/[id], settings/…)
src/pages/api/planner/…        JSON routes (items CRUD, transition, comment, approve, config)
src/lib/planner/
  ├── types.ts                 all interfaces above
  ├── data.ts                  Admin-SDK reads/writes (pattern: admin-data.ts)
  ├── workflow.ts              transition engine (§4)
  ├── approvals.ts             chain evaluation
  ├── automations.ts           trigger evaluation + action executor
  ├── activity.ts              audit writer
  └── notify.ts                notification fan-out
src/middleware.ts              add /planner gate (any planner role)
scripts/set-role.mjs           provision role claims
scripts/seed-planner.mjs       default workflows, types, fields, roles
```

Constraints preserved: no client-side Firestore (rules stay deny-all), strict types exported from one module, `npm run check` gates every change. Cron triggers (due-soon, recurrence) via Cloud Scheduler → authenticated Cloud Run endpoint.

**Firestore indexes:** composite indexes on `workItems` for `(spaceId, status, dueDate)`, `(assigneeUids array-contains, status)`, `(brandIds array-contains, status, dueDate)`. Add to `firestore.indexes.json` and deploy with rules.

---

## 15. Build order (full engine, sequenced so each phase ships something usable)

| Phase | Delivers | Why this order |
|---|---|---|
| **1. Core** | types, data layer, seed script, item CRUD, workflow engine + transitions with validators/conditions/post-functions, activity log, List view, item detail (Overview/Discussion/Files/Activity) | The engine first — everything else plugs into it |
| **2. Views** | Kanban (drag = transition), Calendar, My Work, saved filters | Daily-driver UX |
| **3. Approvals + roles** | approval chains, role claims, permission checks, approver UX | Unlocks real campaign flow |
| **4. Automations + templates** | automation engine, template instantiation, subtasks, dependencies, intake forms | The "no manual work" layer |
| **5. Config panel** | settings UI for types/fields/workflows/chains/automations/roles | Converts developer-owned config into admin-owned |
| **6. Polish** | Timeline view, Workload, dashboard widgets, notifications (email), recurrence | Management candy |

Each phase ends with `npm run check` + vitest coverage on the engine modules (workflow transition matrix is highly unit-testable — pure functions over config).

---

## 16. What was consciously left out (and where it would bolt on)

- **Teams/Slack notifications** → new channel in `notify.ts`, config-only afterward.
- **Anonymous external intake forms** → public route + rate limiting; engine unchanged.
- **Media/DAM library, Google Drive sync** → `attachments` already Storage-backed; a library view is a query, Drive sync is a Cloud Run job.
- **Performance analytics (reach/ROI ingestion)** → custom fields now; dedicated `metrics` subcollection later.
- **Goals, time tracking, sprints, chat, whiteboards** → deliberately never, unless the business demands it.
