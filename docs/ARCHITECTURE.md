# FastMPA V1 Architecture

FastMPA V1 keeps execution in Runtime and exposes the product through the
UI-independent Application interface in `apps/fastmpa`.

## Final architecture

```mermaid
flowchart LR
    TUI[Ink + React TUI]
    CLI[Commander CLI]
    APP[FastMpaApplication\ncommands, snapshots, subscriptions]
    CORE[agent-core\nTurn / Model / Tool protocols]
    RUNTIME[agent-runtime\nRun / queue / lease / recovery\nScheduler / approval / audit]
    WORKSPACE[workspace\nconversation / message / attention\nboard / schedule facts]
    DB[(SQLite\nshared application state)]
    EXT[Skills / MCP / platform adapters\nfuture extension boundary]

    TUI --> APP
    CLI --> APP
    APP --> CORE
    APP --> RUNTIME
    APP --> WORKSPACE
    RUNTIME --> CORE
    RUNTIME --> DB
    WORKSPACE --> DB
    EXT --> RUNTIME
```

## Task execution sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as TUI / CLI
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
        App->>WS: append assistant message
        App->>WS: advance ReadCursor projection
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
