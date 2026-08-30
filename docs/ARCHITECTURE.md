# FastMPA V1 Architecture

FastMPA V1 keeps execution in Runtime and exposes the product through the
UI-independent Application interface in `apps/fastmpa`.

## Final architecture

```mermaid
flowchart LR
    DESKTOP[Electron Desktop]
    MAIN[Electron Main + Preload]
    RENDERER[React Renderer]
    APP[FastMpaApplication\ncommands, snapshots, subscriptions]
    CORE[agent-core\nTurn / Model / Tool protocols]
    RUNTIME[agent-runtime\nRun / queue / lease / recovery\nTooling / approval / audit]
    WORKSPACE[workspace\nWorkspace / conversation / message / attention\nboard / schedule facts]
    DB[(SQLite\nshared application state)]
    LOG[(fastmpa.log\nJSONL + 500-entry ring)]
    EXT[Application Orchestrator\nWorkspace facts → Runtime enqueue]
    PROJ[CompletionProjector\nreply + cursor + receipt]

    DESKTOP --> MAIN
    MAIN --> APP
    RENDERER --> MAIN
    APP --> CORE
    APP --> RUNTIME
    APP --> WORKSPACE
    RUNTIME --> CORE
    RUNTIME --> DB
    WORKSPACE --> DB
    EXT --> RUNTIME
    APP --> PROJ
    PROJ --> WORKSPACE
    PROJ --> DB
    APP --> LOG
    RUNTIME --> LOG
```

## Task execution sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as Desktop Renderer
    participant App as Application
    participant WS as Workspace
    participant RT as Runtime Worker
    participant Model as Model + Tools
    participant DB as SQLite

    User->>UI: submit task
    UI->>App: dispatch(submit)
    App->>WS: save message, agent and conversation
    App->>RT: enqueueIdempotent(runId, context)
    RT->>DB: persist queued Run
    App->>RT: run(runId)
    RT->>DB: claim lease and set running
    RT->>Model: execute Turn
    alt read-only or completed execution
        Model-->>RT: result
        RT->>DB: persist result and completed state
        App->>PROJ: project reply + ReadCursor + receipt
        PROJ->>DB: one SQLite transaction
    else write operation
        Model-->>RT: approval required
        RT->>DB: persist waiting Run and Approval(runId)
        UI-->>User: show approval dialog
        User->>UI: approve or reject
        UI->>App: dispatch approval command
        App->>RT: validate runId and resume or cancel
        RT->>Model: continue Turn
    end
    App-->>UI: snapshot and events
```

## Run lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued
    queued --> running: lease acquired
    running --> completed: Turn done
    running --> waiting: approval required
    running --> blocked: blocked by policy or dependency
    running --> failed: non-retryable failure
    running --> retrying: retryable failure
    retrying --> queued: retry scheduled
    waiting --> queued: approval accepted / resume
    waiting --> cancelled: approval rejected
    blocked --> queued: dependency resolved / resume
    queued --> cancelled: user cancels
    waiting --> cancelled: user cancels
    blocked --> cancelled: user cancels
    completed --> [*]
    failed --> [*]
    cancelled --> [*]
```

The persisted Run is the only execution lease. Workspace `ReadCursor` is a
durable projection of completed message work and is replayed during Application
startup to compensate for an interrupted projection.

## Continuous workspace model

`Workspace` is a durable collaboration fact with an immutable ID and mutable
display name. It is not a directory and does not own Runtime execution queues.
`Conversation` is the continuous-dialogue boundary; each submitted turn still
creates one persisted `Run`. Application snapshots may be filtered by
`workspaceId` and `conversationId`, so the Renderer can switch selection without
loading unrelated messages or runs into the active view. Historical records are
backfilled with a Workspace record when SQLite starts; the legacy `default`
workspace is displayed as `Default Workspace`.

Application logs are an independent observation stream. The root Pino logger
tees structured JSONL to the absolute `fastmpa.log` path and a bounded
500-entry in-memory buffer. Log subscribers update only the log panel; message
and model content is not emitted as log context.

The panel can set a minimum level with `1`–`4` and toggle current-Run filtering
with `Ctrl+E`; `Ctrl+L` collapses it without changing the composer.

The workspace Renderer keeps selection and unsent queue state locally. Selection
changes request a filtered Application snapshot; submitted turns are serialized
by Application on `workspaceId:conversationId`, so switching the visible
conversation does not cancel background work or mix its history into another
conversation.

Snapshots also include the selected Workspace's Attention summary. Unsent
composer entries are process-local; attempting to exit while they exist asks
for confirmation and never writes them as durable messages.

When a Run is waiting for approval, the Application coordinator keeps that
conversation's queue occupied until the approval is resolved. Other
conversations remain independent.
