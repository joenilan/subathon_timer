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

## Dedupe Strategy

This is the highest-risk part of the feature and must be designed before implementation.

### Hard Rule

Every event must have a stable dedupe key before it can affect the shared timer.

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

Deliverables:

- this design doc
- shared-session event contract
- exact owner/guest permission scope
- explicit decision that host executes moderation outcomes

Stop/go decision:

- only proceed if "server-authoritative shared mode" is acceptable

### Phase 1: Shared Session Skeleton

Deliverables:

- shared-session service scaffold
- session create/join flow
- participant presence
- desktop shared-session page

No timer mutation yet.

### Phase 2: Shared Timer Snapshot Sync

Deliverables:

- shared timer state on the server
- host-only manual pause/resume/add/subtract routed through server
- both clients render the same timer snapshot

Still no provider ingestion.

### Phase 3: Shared Twitch Event Ingestion

Deliverables:

- participant clients submit normalized Twitch events
- server dedupes and applies them
- merged shared activity feed

Only after this phase should the shared timer feel real.

### Phase 4: Shared Tip Ingestion

Deliverables:

- participant-local StreamElements/Streamlabs tip events submitted to server
- server dedupe and apply
- shared tip activity feed

Keep providers tip-only.

### Phase 5: Shared Wheel

Deliverables:

- server-owned wheel trigger and selection
- synced spin state to both clients
- host-executed moderation outcomes
- single application path for wheel results

### Phase 6: Hardening

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
