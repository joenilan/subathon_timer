# Shared Subathon Plan

## Summary

This document defines the production design for a shared subathon mode where two streamers run the desktop app on separate PCs, connect their own Twitch accounts, and contribute events into one shared timer.

The core requirement is not "sync a countdown." The real requirement is:

- one shared timer session
- two independent broadcaster accounts
- one merged event stream
- no duplicate rule application
- no ambiguous ownership for wheel, moderation, pause/resume, or manual edits

This plan assumes the current desktop app remains the operator-facing client. The new work adds a small shared-session service and a shared-session mode in the desktop app. The local single-streamer flow must continue to work without the service.

## Phase Tracker

This section is the implementation status source of truth for shared-subathon work. Update it in the same pass as any shared-session implementation change.

| Phase | Name | Status | Notes |
| --- | --- | --- | --- |
| 0 | Decision And Contract | Planned | Design approved only when server-authoritative shared mode is accepted. |
| 1 | Shared Session Skeleton | Planned | Create/join flow, presence, and initial page shell. |
| 2 | Shared Timer Snapshot Sync | Planned | Server-owned timer snapshot and host-owned manual controls. |
| 3 | Shared Twitch Event Ingestion | Planned | Host/guest Twitch events feed one timer through the shared service. |
| 4 | Shared Tip Ingestion | Planned | Host/guest tips feed one timer, tip providers stay tip-only. |
| 5 | Shared Wheel | Planned | Shared wheel trigger, sync, reveal, and single outcome application. |
| 6 | Hardening | Planned | Reconnect, replay, audit, and recovery coverage. |

Status values:

- `Planned`
- `In progress`
- `Blocked`
- `Completed`

Phase update rule:

- whenever a shared-session phase starts, changes scope, is blocked, or is completed, update this table and the matching phase section below in the same commit

## Product Goals

- Let two streamers join the same shared subathon session from separate PCs.
- Let each streamer connect their own Twitch account and their own tip providers.
- Merge both accounts' qualifying events into one shared timer.
- Keep the timer, activity feed, overlays, and wheel state consistent across both apps.
- Prevent duplicate time adds when the same real-world event appears through multiple providers.
- Preserve a clean fallback to the current local-only mode.

## Non-Goals

- More than two streamers in the first version.
- General team/collab support with arbitrary membership.
- Cross-provider follow/sub normalization in the first release beyond the specific duplicate protections defined here.
- Local peer-to-peer sync between the two PCs.
- Replacing the desktop app with a web app.

## Why A Shared Service Is Required

The current desktop app is intentionally local-first:

- `useTwitchSessionStore.ts` owns one broadcaster's Twitch auth/session.
- `useEventSubStore.ts` owns one live EventSub socket and one broadcaster's core subscriptions.
- `useTipSessionStore.ts` owns one local StreamElements/Streamlabs token set and local provider sockets.
- `useAppStore.ts` owns the timer, processed-event ids, wheel state, activity log, and persisted runtime.

That design is correct for a single streamer. It is not enough for a shared subathon because:

- each PC would apply rules independently
- manual actions could conflict
- event ids are only deduped locally
- the wheel and moderation outcomes would race
- one machine disconnecting could split the timer state

The shared mode therefore needs a server-authoritative session model.

## Recommended Architecture

### Roles

- Desktop client A: streamer A's app
- Desktop client B: streamer B's app
- Shared session service: authoritative session state and event ledger
- Shared session database: durable state and event history

### Authority Rules

The shared service becomes authoritative for:

- shared timer session state
- applied timer events
- shared activity feed
- wheel spin state and result state
- manual timer adjustments in shared mode
- shared rules/config in shared mode

The desktop clients remain authoritative only for:

- local Twitch login and token refresh
- local StreamElements/Streamlabs token storage
- UI preferences that are not part of the shared runtime
- local overlay presentation settings unless explicitly shared later

## How The Two Accounts Link

The cleanest first-release model is a host/guest session with an invite code.

### Host Flow

1. Streamer A opens a new `Shared subathon` page.
2. Streamer A clicks `Create shared session`.
3. The desktop app requests a new session from the shared service.
4. The service returns:
   - `sessionId`
   - short invite code
   - host join token
5. Streamer A keeps the session open and copies the invite code.

### Guest Flow

1. Streamer B opens the same `Shared subathon` page.
2. Streamer B clicks `Join shared session`.
3. Streamer B enters the invite code.
4. The desktop app exchanges the invite code for a guest join token.
5. Streamer B joins the live shared session.

### Identity Binding

Joining the session is not enough. Each participant must also prove which Twitch broadcaster account they are contributing.

Recommended binding:

- the desktop app joins the shared session first
- then it sends the locally validated Twitch session identity:
  - `userId`
  - `login`
  - `displayName`
  - granted scopes summary
- the shared service stores that participant identity on the session

This means:

- host and guest are linked by invite code
- each side still uses their own Twitch auth locally
- the shared service knows exactly which broadcaster account belongs to which participant

## Shared Session Data Model

### SharedSession

- `id`
- `status`: `active | paused | ended`
- `mode`: `single | shared`
- `createdAt`
- `updatedAt`
- `hostParticipantId`
- `timerState`
- `ruleConfig`
- `wheelConfig`
- `wheelState`
- `lastAppliedSequence`

### SharedParticipant

- `id`
- `sessionId`
- `role`: `host | guest`
- `connectionStatus`
- `twitchUserId`
- `twitchLogin`
- `twitchDisplayName`
- `eventCapabilities`
- `joinedAt`
- `lastSeenAt`

### SharedTimerEvent

- `id`
- `sessionId`
- `sourceParticipantId`
- `provider`: `twitch | streamelements | streamlabs | manual | wheel`
- `providerEventId`
- `eventType`
- `occurredAt`
- `receivedAt`
- `normalizedPayload`
- `dedupeKey`
- `appliedDeltaSeconds`
- `applyStatus`

### SharedWheelSpin

- `id`
- `sessionId`
- `triggeringEventId`
- `triggeringParticipantId`
- `giftCount`
- `selectedSegmentId`
- `selectedLabel`
- `status`: `spinning | ready | applying | applied | failed | dismissed`
- `autoApply`
- `createdAt`
- `revealedAt`
- `appliedAt`

## Event Ingestion Model

### Principle

Clients should never directly mutate the shared timer in shared mode. They submit normalized events to the shared service. The shared service decides whether the event is accepted, deduped, and applied.

### Client Responsibilities

Each desktop client continues to:

- maintain its own Twitch auth locally
- keep its own EventSub socket alive
- keep its own tip-provider sockets alive
- normalize provider payloads into the app's existing event shape

But in shared mode, after local normalization:

- do not call the local `processTwitchEvent()` as the source of truth
- submit the normalized event to the shared service instead

### Server Responsibilities

The shared service:

- validates the participant is a member of the session
- builds a dedupe key
- checks whether the event is already applied
- resolves timer delta using shared rules
- applies the delta exactly once
- appends the event to the shared activity ledger
- broadcasts the updated state to both clients

## Event Source Boundaries

The shared mode should be explicit about which providers are allowed to drive which event types.

### Twitch Is Authoritative For

- follows
- subs and resubs
- cheers/bits
- gift bombs
- wheel triggers
- moderation-related outcomes

Reason:

- each streamer's desktop app is already connected to that streamer's own broadcaster account
- Twitch EventSub is the cleanest source for these channel-native events
- a follow or gift bomb on streamer A's channel should only come from streamer A's Twitch connection, not streamer B's

### StreamElements And Streamlabs Are Authoritative Only For

- tips
- donations

Reason:

- those providers are already being kept tip-only in the desktop app
- allowing them to contribute follows/subs/gifts would overlap with Twitch and create unnecessary duplicate-risk

### Practical Consequence

The shared service should accept:

- Twitch events from host
- Twitch events from guest
- tip events from host
- tip events from guest

But it should reject or ignore:

- follow/sub/gift style activity coming from StreamElements or Streamlabs
- wheel-trigger attempts from tip providers

This keeps the event model simple:

- Twitch drives Twitch-style channel events
- tip providers drive money/tip events only
- both participants contribute to one timer

## Dedupe Strategy

This is the highest-risk part of the feature and must be designed before implementation.

### Hard Rule

Every event must have a stable dedupe key before it can affect the shared timer.

### What Dedupe Is Actually For

In shared mode, dedupe is mainly for transport and retry safety, not because one viewer action should count for both streamers.

Examples of the real duplication risks:

- a client reconnects and resubmits a previously seen event
- the shared service receives the same normalized event twice
- a provider replay/test surface emits the same tip more than once
- a moderation apply path retries after partial failure

Examples that are not the main problem:

- one viewer follows streamer A and somehow that same follow should count for streamer B
- one viewer's Twitch gift bomb naturally appearing on both streamers' Twitch EventSub sockets

Those should not happen if each client only listens to its own broadcaster account.

### Twitch Events

For EventSub events, prefer provider-native ids or message metadata when available. Candidate dedupe inputs:

- subscription/event id from EventSub payload
- broadcaster user id
- event type
- occurrence timestamp
- target user id if applicable

### Tip Providers

Tip providers stay tip-only in shared mode just like the current single-streamer desktop app. They must not be used to drive follows, subs, or gift bombs.

Tip dedupe key should include:

- provider
- participant broadcaster id
- provider donation/tip id if available
- occurrence timestamp
- display name / login
- amount
- currency

### Cross-Provider Dupes

The first shared-mode release should not try to infer "this StreamElements tip and this Streamlabs tip are really the same payment." That will create false positives. Treat those as separate sources unless there is a provider-native cross reference.

### Replay/Test Events

Provider-side test events should be allowed only when marked as tests and only if the session is explicitly in a testing mode. They must never be eligible for permanent timer changes in a live shared session unless the product explicitly adds a shared testing workflow.

## Shared-Session UI And UX

This feature needs finished product UX, not a debug console or raw transport panel.

### Main Entry Point

Add a dedicated `Shared Session` page in the desktop app.

That page should cover:

- shared mode explanation
- current session state
- host controls
- guest join flow
- participant presence
- linked broadcaster accounts
- shared event health

### Primary States

#### Not In Shared Session

Show two clear actions:

- `Create Shared Session`
- `Join Shared Session`

Support copy should explain one thing plainly:

- each streamer connects their own Twitch account on their own PC
- both sets of events feed one timer once joined

#### Creating Session

Use a modal or focused setup card for:

- session name or title if we want it
- invite code generation
- copy/share invite button
- host account verification summary

#### Joining Session

Use a modal for:

- entering invite code
- validating code
- showing which host/session is being joined
- confirming the guest broadcaster account before final join

#### Connected Session

Show a finished shared-session control surface with:

- session title / session code
- host vs guest badge
- participant cards for both streamers
- connected/disconnected presence state
- Twitch linked account summary for each participant
- tip-provider readiness summary for each participant
- shared timer status summary

### Recommended Layout

For the first production pass, keep the page structured as:

1. shared-session header
2. participant status row
3. shared runtime control panel
4. event-source health panel
5. recent shared activity panel

Do not bury shared status inside the existing `Connections` page only. It deserves its own surface.

### Modal Use

Modals are appropriate for:

- create-session confirmation
- join-session code entry
- leave-session confirmation
- end-session confirmation
- reconnect/reclaim-session flow

Do not use a modal for the entire day-to-day shared-session experience. The ongoing state should live on a full page.

### UX Rules

- Host and guest status must be visually obvious.
- Each participant card must show exactly which Twitch account is linked.
- Shared-mode errors must say which side is unhealthy:
  - host Twitch disconnected
  - guest Twitch disconnected
  - host tips disconnected
  - guest tips disconnected
- If one side disconnects, the UI should say the session is still running, not imply total failure.
- If guest permissions are limited, say that directly in the UI instead of hiding controls without explanation.

### Shared Activity Feed

The shared activity feed should visibly tag which participant produced the event.

Examples:

- `Host · Follow · viewername`
- `Guest · Tier 1 sub · viewername`
- `Host · Streamlabs tip · $5.00`

Without that, the shared timer will feel opaque and debugging live issues will be harder than it needs to be.

### Shared Testing UX

If we add shared test flows later, keep them obviously separate from live actions.

Recommended rules:

- shared test actions must be labeled `Test`
- test events must be visually distinct in the shared activity feed
- test events must never silently apply a live moderation outcome

### Visual Standard

The shared-session page should match the desktop app's production look:

- no debug tables as the primary UI
- no raw JSON in the user-facing surface
- no developer terms like `session token`, `transport ack`, or `event ledger` exposed unless behind an advanced diagnostics area

The user-facing product language should stay operational and simple:

- connected
- waiting for guest
- reconnect required
- shared timer active
- host controls only

## Shared Rules And Config Ownership

In shared mode, the rules and wheel config need one owner to avoid silent conflict.

### Recommended First Release

- Host owns shared rules, wheel config, and manual timer controls.
- Guest can contribute provider events but cannot edit shared runtime config.

Optional later expansion:

- add explicit permission levels
- allow guest moderation controls
- allow co-owner mode

## Wheel Behavior In Shared Mode

### Trigger Scope

Match the current behavior reference:

- wheel is triggered only by Twitch gift bombs
- tip providers do not trigger wheel behavior

### Authority

Only the shared service should decide that a gift bomb caused a wheel spin.

### Flow

1. Participant client receives a qualifying Twitch gift-bomb event.
2. Client submits the normalized event to the shared service.
3. Shared service dedupes and applies the gift-bomb timer delta.
4. Shared service evaluates wheel eligibility using shared wheel config.
5. Shared service creates one shared wheel spin record.
6. Both clients receive the same wheel spin state.
7. Overlays render the same spin/result.
8. Shared service applies the outcome once.

### Moderation Outcomes

For timeout outcomes, do not let both clients race to timeout the same user.

Recommended first release:

- host client executes moderation calls
- shared service marks the wheel spin as `applying`
- host client reports success/failure back
- shared service finalizes the outcome and activity log

This avoids duplicate moderation attempts and keeps one accountable execution path.

## Pause/Resume/Manual Adjustments

These are shared runtime actions and must not remain local in shared mode.

Recommended first release:

- host only:
  - start
  - pause
  - reset
  - manual add/subtract
  - rules edit
  - wheel config edit
- guest:
  - observe everything
  - contribute provider events

## Overlay Behavior

The overlay runtime should continue to render from app state, but in shared mode the app state must be populated from the shared-session state rather than local-only event application.

Both clients should be able to show:

- the same shared timer
- the same shared reason popup
- the same shared wheel spin/result
- the same shared activity timeline

This does not require shared overlay transform settings in the first release. Each streamer can keep their own local placement and scale.

## Connectivity And Reconnect Behavior

### Requirements

- if one client disconnects, the shared session keeps running
- if both disconnect, the session state remains durable on the server
- reconnecting clients should receive a complete snapshot plus any active wheel/result state

### Recommended Transport

Use a single shared-session WebSocket from the desktop app to the shared service for:

- state snapshots
- incremental updates
- participant presence
- shared wheel state
- optimistic action acknowledgements

Do not try to stitch this together from polling.

## Security Model

### What Stays Local

- Twitch access/refresh tokens
- StreamElements token
- Streamlabs token
- native secure session storage

### What Goes To The Shared Service

- session membership tokens
- participant identity metadata
- normalized non-secret event payloads
- shared timer and wheel state

The shared service should never require raw Twitch or tip-provider secrets for the first release if the clients already ingest provider events locally.

## Suggested Implementation Shape In This Repo

### New Components

- `apps/shared-session-service/`
  - small service for shared sessions
  - websocket + REST endpoints
  - session database
- desktop shared-session client layer under:
  - `apps/desktop/src/lib/sharedSession/`
- desktop shared-session store:
  - `apps/desktop/src/state/useSharedSessionStore.ts`
- new page:
  - `apps/desktop/src/pages/SharedSessionPage.tsx`

### Existing Desktop Stores

#### Keep Mostly Local

- `useTwitchSessionStore.ts`
- `useEventSubStore.ts`
- `useTipSessionStore.ts`

#### Shared-Mode Adaptation Required

- `useAppStore.ts`
  - current local timer authority must become mode-aware
  - in shared mode, local event handlers submit to shared service instead of applying directly

## Recommended Rollout Phases

### Phase 0: Decision And Contract

Status: `Planned`

Deliverables:

- this design doc
- shared-session event contract
- exact owner/guest permission scope
- explicit decision that host executes moderation outcomes

Stop/go decision:

- only proceed if "server-authoritative shared mode" is acceptable

### Phase 1: Shared Session Skeleton

Status: `Planned`

Deliverables:

- shared-session service scaffold
- session create/join flow
- participant presence
- desktop shared-session page
- polished host/guest UI states for create, join, connected, and reconnect-required

No timer mutation yet.

### Phase 2: Shared Timer Snapshot Sync

Status: `Planned`

Deliverables:

- shared timer state on the server
- host-only manual pause/resume/add/subtract routed through server
- both clients render the same timer snapshot

Still no provider ingestion.

### Phase 3: Shared Twitch Event Ingestion

Status: `Planned`

Deliverables:

- participant clients submit normalized Twitch events
- server dedupes and applies them
- merged shared activity feed

Only after this phase should the shared timer feel real.

### Phase 4: Shared Tip Ingestion

Status: `Planned`

Deliverables:

- participant-local StreamElements/Streamlabs tip events submitted to server
- server dedupe and apply
- shared tip activity feed

Keep providers tip-only.

### Phase 5: Shared Wheel

Status: `Planned`

Deliverables:

- server-owned wheel trigger and selection
- synced spin state to both clients
- host-executed moderation outcomes
- single application path for wheel results

### Phase 6: Hardening

Status: `Planned`

Deliverables:

- reconnect/replay
- event ledger audit tools
- session close/recover flows
- test harnesses for duplicate prevention

## Risks

### Highest Risk

- duplicate event application
- split-brain timer state
- moderation outcomes executing twice
- one client applying local changes while shared mode expects server authority

### Medium Risk

- reconnect edge cases during active wheel states
- tip-provider test/replay behavior differing from real events
- latency causing the two apps to feel out of sync

### Lower Risk

- invite-code UX
- page-level controls and copy

## Test Plan

### Automated

- session create/join contract tests
- event dedupe tests
- timer apply-once tests
- reconnect snapshot replay tests
- shared wheel single-apply tests
- moderation outcome ownership tests

### Manual

- host and guest connect from separate machines
- each streamer triggers a qualifying Twitch event
- both apps show the same timer and activity result
- guest disconnects and reconnects during live session
- host disconnects and reconnects during live session
- gift bomb triggers exactly one wheel spin and one outcome application
- tip providers only affect tips and do not duplicate Twitch follows/subs/gifts

## Open Questions

- Should the guest be able to trigger manual timer actions later, or stay read-only forever?
- Should the shared activity feed mark which streamer contributed each event visibly in the UI?
- Should chat announcements come from host only, or from both broadcasters independently?
- Should each streamer keep their own wheel overlay placement while sharing the runtime state?
- Do we want a shared-session recovery code or admin panel if both clients close unexpectedly?

## Recommendation

Proceed only if the product accepts this constraint:

- shared mode needs a real shared-session service

That is the correct design. Trying to sync this peer-to-peer or by merging two local timers after the fact will be fragile, especially once wheel moderation outcomes are involved.

If implementation proceeds, the right first build is not "full shared subathon." The right first build is:

- create/join shared session
- shared timer snapshot
- host-owned manual controls

That proves the architecture before any live-provider ingestion is added.
