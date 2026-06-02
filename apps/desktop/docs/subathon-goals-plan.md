# Subathon Goals Plan

## Summary

Subathon Goals is a separate progress-tracking feature that uses the same normalized live event stream as the timer without changing timer behavior. Timer rules continue to answer "how much time should this event add?" Goals answer "which milestone rewards has the community unlocked?"

The feature should let a streamer build visible reward ladders for their subathon, choose what each ladder counts, and show progress in the app and OBS. A ladder is a list of milestone thresholds such as `100 bits = eat a bean`, `500 bits = eat an egg`, or `25 subs = karaoke song`. A ladder may be source-specific, such as subscriptions only, bits only, or tips only, because streamers sometimes need to drive a specific Twitch revenue path. Mixed-source ladders are also valid, but they must be an explicit choice, not the default assumption.

This is not Twitch's built-in Creator Goals feature. Twitch Creator Goals can be evaluated later as an optional import/display source, but the primary product here is a local custom subathon reward checklist controlled by the streamer.

## Product Goals

- Let streamers create clear subathon reward ladders before or during a stream.
- Let each ladder contain multiple milestone thresholds with concrete reward text.
- Track progress automatically from events the app already receives.
- Support source-specific ladders for subscriptions, gift subs, bits, and tips.
- Support explicit mixed-source ladders when the streamer wants one combined community progress track.
- Show completed milestones as checked-off rewards in the app and overlay.
- Keep goal tracking independent from timer additions, wheel triggers, moderation actions, and shared-session authority.
- Preserve a simple streamer workflow with no new developer credentials.

## Non-Goals

- Goals do not add or remove timer time.
- Goals do not replace the existing Rules page.
- Goals do not require Twitch Creator Goals to be configured on Twitch.
- Goals do not require StreamElements, Streamlabs, Ko-fi, or other tip providers for the first release.
- Goals do not initially create or edit Twitch channel-point rewards.
- Goals do not initially sync across shared subathon sessions until the local goal engine is stable.

## Current Event Inputs

The app already normalizes the event types needed for the first goal release:

- Twitch subscriptions
- Twitch resubscriptions
- Twitch gifted subscriptions
- Twitch gift bombs
- Twitch bits / cheers
- StreamElements tips
- Streamlabs tips

Current normalized event sources:

- `twitch-eventsub`
- `streamelements`
- `streamlabs`

Tips should remain tip-only from StreamElements and Streamlabs so provider follow/sub/gift activity does not duplicate Twitch EventSub activity.

## Source Modes

Each ladder must choose a source mode.

`single-source`

- Default mode.
- Counts exactly one earning/action type.
- Examples: "subs ladder", "bits ladder", "tips ladder".
- Best for streamers trying to reach Partner, Affiliate Plus, sponsor targets, payout thresholds, or platform-specific campaigns.

`mixed-source`

- Explicit advanced mode.
- Counts multiple selected sources into one progress track.
- Examples: "community support ladder", "any paid support unlock ladder".
- Requires conversion weights so unlike units do not get silently mixed.

The UI should make this choice obvious. A streamer should never accidentally count tips toward a subs-only ladder or count bits toward a tips-only ladder.

## Ladder Types

### Subscription Reward Ladder

Counts subscription-like events as units.

Supported events:

- `subscription`
- `resubscription`
- `gift_subscription`
- `gift_bomb`

Configuration:

- include new subscriptions
- include resubscriptions
- include gifted subscriptions
- include gift bombs
- count gift bombs by gift quantity
- optional tier weighting
- milestone thresholds and reward labels

Default:

- count all subscription-like events as one unit per subscription
- gift bombs count by gift quantity
- no tier weighting

Example milestones:

- `5 subs`: choose a new stream sound
- `25 subs`: karaoke song
- `50 subs`: horror game segment

### Bits Reward Ladder

Counts Twitch cheer bits.

Supported events:

- `cheer`

Configuration:

- milestone thresholds and reward labels
- optional minimum cheer amount
- optional include/exclude test events if test fixtures are added later

Default:

- count raw bits

Example milestones:

- `100 bits`: eat a bean
- `500 bits`: eat an egg
- `1,000 bits`: add a punishment wheel segment

### Tips Reward Ladder

Counts tip amount from connected tip providers.

Supported events:

- `tip` from Streamlabs
- `tip` from StreamElements

Configuration:

- milestone thresholds and reward labels
- currency display
- provider filter: any, Streamlabs only, StreamElements only
- optional minimum tip amount

Default:

- count accepted tip amount from either connected tip provider
- display the currency provided by the event when possible

Tips should be implemented after subscriptions and bits because provider stability and additional services may change. Existing Streamlabs and StreamElements support is enough for the first tip pass; Ko-fi or other providers should be separate follow-up integrations.

Example milestones:

- `$5`: add one challenge card
- `$25`: hot sauce shot
- `$100`: chat chooses next game

### Mixed Support Reward Ladder

Counts selected event types into a single weighted unit.

Supported inputs:

- subscriptions
- gift subscriptions
- gift bombs
- bits
- tips

Configuration:

- display unit label, such as "points" or "support credits"
- conversion weights per source
- selected sources
- optional per-source caps
- milestone thresholds and reward labels

Default:

- not enabled by default
- must be created intentionally from an advanced ladder type

Example weights:

- 1 subscription = 1 point
- 100 bits = 1 point
- $5 tips = 1 point

Example milestones:

- `10 support points`: streamer wears a silly hat
- `25 support points`: bonus wheel spin
- `69 support points`: chat picks a challenge

## Twitch Platform Features

Twitch Creator Goals should not be implemented for this rollout. Twitch's Creator Goals API returns active Twitch-side goals, and Twitch recommends EventSub for real-time Creator Goal updates. That is useful for displaying Twitch goals, but it does not cover local custom reward ladders like `100 bits = eat a bean`, mixed provider ladders, or streamer-authored milestone checklists.

Channel Points custom reward redemptions and Custom Power-up redemptions are available through EventSub. These are useful future inputs, but they should not be part of the first goals implementation because they require more scope/UX decisions:

- which rewards should count
- whether redemptions should be fulfilled or merely observed
- whether power-ups should count as bits, separate paid actions, or custom goal units
- how to avoid confusing channel points with paid support goals

Reference docs for possible future research:

- Twitch Creator Goals API: https://dev.twitch.tv/docs/api/goals
- Twitch EventSub reference: https://dev.twitch.tv/docs/eventsub/eventsub-reference/
- Twitch EventSub subscription types: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/

Twitch Creator Goals import is not part of the rollout plan. It duplicates a Twitch-native feature and does not solve the custom reward-ladder use case this app is building.

## Tip Provider Expansion Research

Streamlabs and StreamElements are the supported tip inputs for the first goals release because they already provide user-facing socket tokens that can be pasted into the desktop app without extra hosting.

Additional providers were evaluated with the same normal-user rule: a streamer should not need to run a public server, configure a tunnel, register a developer app, or understand webhook hosting just to count tips.

Provider findings:

| Provider | Category | Realtime path | User setup shape | Recommendation |
| --- | --- | --- | --- |
| Streamlabs | Creator support | Socket API token | Paste dashboard token | Supported now |
| StreamElements | Creator support | JWT/socket token | Paste dashboard token | Supported now |
| TipeeeStream | Creator support | Socket.io with account API key | Paste API key, connect socket | Good future candidate |
| Pally.gg | Creator support | WebSocket with dashboard API key | Paste API key and optional page slug | Good future candidate, but WebSocket feed is currently marked beta |
| Fourthwall | Creator support / commerce | Webhooks; can route alerts through Streamlabs/StreamElements | Direct integration requires public webhook URL | Defer direct support; existing Streamlabs/StreamElements alert routing can be evaluated separately |
| TreatStream | Creator support / treats | OAuth plus socket token | Requires app/client setup and token flow | Lower priority unless user demand is strong |
| DeStream | Creator support | OAuth plus donation WebSocket | Requires OAuth/client setup | Lower priority unless user demand is strong |
| Buy Me a Coffee | Creator support | Webhooks | Requires public webhook URL | Defer until hosted bridge exists |
| Ko-fi | Creator support | Webhooks for payment data | Requires public webhook URL | Defer until hosted bridge exists |
| Patreon | Membership support | OAuth/webhooks for memberships | Requires webhook/OAuth flow | Separate membership-support feature, not first tip-goals pass |
| Tiltify | Charity/fundraiser | Charity fundraising API | Campaign-specific setup | Separate charity-goal feature |
| DonorDrive | Charity/fundraiser | Public fundraising API | Event/participant/team-specific setup | Separate charity-goal feature |

Decision for the next implementation pass:

- keep Streamlabs and StreamElements as the supported providers for the first release
- shortlist TipeeeStream and Pally.gg as the next desktop-friendly creator-support providers to prototype
- keep Fourthwall, TreatStream, and DeStream as lower-priority creator-support candidates because they add webhook or OAuth complexity
- add a separate charity/fundraiser source category for Tiltify and DonorDrive instead of mixing charity donations into normal tips
- do not add Buy Me a Coffee, Ko-fi, Fourthwall direct webhooks, or Patreon until the app has an official hosted bridge or clean first-party realtime path
- do not ask normal users to configure tunnels, webhook relays, or developer infrastructure
- do not scrape/parse provider Twitch chat alerts as goal payments
- keep the goal engine provider-agnostic so new providers can normalize into the same `tip` event shape later

Goal source categories should stay distinct:

- `tips` means creator support/tips that go to the streamer or creator team.
- `charity` or `fundraising` should mean money raised for an external charity campaign.
- Mixed ladders should only include charity/fundraiser input when the streamer explicitly enables it.
- Overlay and chat copy should say `raised` for charity goals, not `tipped`, to avoid misleading viewers.
- Charity history entries should identify the campaign/provider separately from creator tip history.

Reference docs:

- Ko-fi API/webhook help: https://help.ko-fi.com/hc/en-us/articles/360004162298-Does-Ko-fi-have-an-API-or-webhook
- Ko-fi Twitch chat alerts help: https://help.ko-fi.com/hc/en-us/articles/4411251874193-Connect-Ko-fi-to-Twitch-for-chat-alerts-and-more
- Buy Me a Coffee webhooks FAQ: https://help.buymeacoffee.com/en/articles/8210728-faq-on-webhooks
- TipeeeStream Socket.io docs: https://api.tipeeestream.com/api-doc/socketio
- Pally.gg WebSockets docs: https://docs.pally.gg/advanced/websockets
- Fourthwall webhooks docs: https://docs.fourthwall.com/webhooks/getting-started
- TreatStream API details: https://treatstream.com/api/details
- Patreon API docs: https://docs.patreon.com/
- DonorDrive Public API docs: https://github.com/DonorDrive/PublicAPI

## Data Model Draft

```ts
type GoalSourceMode = 'single-source' | 'mixed-source'

type GoalSourceType =
  | 'subscriptions'
  | 'bits'
  | 'tips'
  | 'charity'
  | 'mixed-support'

type GoalLadderStatus = 'active' | 'paused' | 'archived'

type GoalMilestoneStatus = 'locked' | 'completed' | 'skipped'

interface SubathonGoalLadder {
  id: string
  title: string
  description?: string
  status: GoalLadderStatus
  sourceMode: GoalSourceMode
  sourceType: GoalSourceType
  currentAmount: number
  unitLabel: string
  milestones: SubathonGoalMilestone[]
  createdAt: string
  config: SubathonGoalLadderConfig
}

interface SubathonGoalMilestone {
  id: string
  thresholdAmount: number
  rewardTitle: string
  rewardDescription?: string
  status: GoalMilestoneStatus
  completedAt?: string
}
```

Goal progress should be persisted independently from timer runtime state. Completed milestones should stay completed unless the streamer manually reopens, skips, or resets them.

The first implemented source types are subscriptions, bits, tips, and mixed support. Charity/fundraiser input is a planned source category and should not be merged into normal tips when implemented.

## Runtime Rules

- Every incoming normalized event gets offered to the goals engine after it is accepted by the relevant provider/Twitch path.
- The goals engine must have its own dedupe ledger so replayed provider events or reconnect bursts do not double-count.
- A disabled timer rule must not prevent a ladder from tracking that event. Example: bits can be disabled for timer additions but still count toward a bits ladder.
- Provider non-tip events from Streamlabs or StreamElements must continue to be ignored for goals to avoid duplicate Twitch counts.
- Test events should be visibly marked in activity and should not mutate production goal progress unless a dedicated "allow test events" setting is enabled for preview/testing.
- Manual progress adjustments should require a reason field and should appear in goal history.
- Crossing multiple thresholds from one event should complete every crossed milestone in order.
- The streamer must be able to mark a reward as skipped or reopen it if something was completed by mistake.

## UI Plan

### Goals Page

Primary sections:

- Goal board: active ladders with milestone checklists, progress, status, and source labels.
- Quick add: create common ladders without entering a complex editor.
- Ladder editor: full configuration for thresholds, reward text, source mode, source filters, and display settings.
- History rail: recent goal progress, completions, and manual adjustments.

Required production behavior:

- No placeholder goals.
- Empty state should explain reward ladders and offer one clear create action.
- Source-specific ladders should show a clear badge such as `Subs only`, `Bits only`, or `Tips only`.
- Charity ladders should use language such as `Charity raised` or `Fundraiser progress`, not `Tips only`.
- Mixed ladders should show the conversion rules directly on the card.
- Mixed ladders should make charity/fundraiser inclusion explicit because charity donations may not be appropriate for personal streamer rewards.
- Completed milestones should have a strong checked-off visual treatment without hiding the reward.
- Milestones should be sortable by threshold and editable without requiring JSON.

### Goals Overlay

Initial overlay:

- compact list of active ladders
- progress bars with current and target values
- completion celebration state
- configurable position, scale, and visibility from the Overlays page

Later overlay options:

- current featured goal only
- full checklist
- recently completed goals strip

## Chat Announcements

Milestone completion announcements should be optional.

Default:

- off until the user enables them

Recommended first message:

```text
Goal unlocked: {rewardTitle} at {threshold} {unitLabel}
```

This should reuse the existing Twitch chat-send path if available. It must not announce test-event completions unless test announcements are explicitly enabled.

## Shared-Session Considerations

Shared goals should come after the local goals feature is stable. When added, the shared-session service must be authoritative for shared goal progress for the same reason it is authoritative for shared timer state.

Shared-session rules:

- each participant submits only their own local events
- the service dedupes by source, broadcaster, event id, and goal id
- shared goal state broadcasts to every participant
- mixed-source conversion rules live on the shared session
- host controls ladder creation/editing unless co-host editing is explicitly added

Do not implement shared goals as peer-to-peer state sync.

## Rollout Phases

| Phase | Status | Scope |
| --- | --- | --- |
| 0 | Complete | Finalized ladder/milestone data model, source modes, dedupe keys, and persistence shape. |
| 1 | Complete | Implemented local ladder engine with tests for subscriptions, gift bombs, bits, threshold crossing, and dedupe. |
| 2 | Complete | Added persisted goals store and manual progress adjustment history. |
| 3 | Complete | Built production Goals page with create/edit/complete/reset ladder and milestone flows. |
| 4 | Complete | Fed Twitch subscription, gift, and bits events into local goals without changing timer behavior. |
| 5 | Complete | Added Goals overlay and overlay runtime sync. |
| 6 | Complete | Added optional milestone completion chat announcements. |
| 7 | Complete | Added Streamlabs and StreamElements tip progress tracking. |
| 8 | Complete | Evaluated Ko-fi and other tipping providers; deferred webhook-only providers until a clean hosted bridge or first-party realtime path exists. |
| 9 | Skipped | Twitch Creator Goals import is not needed for custom subathon reward ladders. |
| 10 | Planned | Prototype additional creator-support providers, starting with TipeeeStream and then Pally.gg if the beta WebSocket feed is stable enough. |
| 11 | Planned | Add charity/fundraiser goal source support for providers such as Tiltify and DonorDrive, separate from normal tips. |
| 12 | Planned | Evaluate Channel Points and Custom Power-up goal inputs. |
| 13 | Planned | Add shared-session goal authority after local goals are proven stable. |

## Implementation Notes

Phase 1 added the pure local goal ladder engine:

- `apps/desktop/src/lib/goals/types.ts`
- `apps/desktop/src/lib/goals/engine.ts`
- `apps/desktop/src/lib/goals/engine.test.ts`

Current engine behavior:

- source-specific ladders reject unrelated event types
- Twitch subscription ladders only count Twitch EventSub subscription events
- tip ladders only count Streamlabs or StreamElements tip events
- gift bombs count by gift quantity by default
- mixed ladders require explicit conversion weights
- accepted events are deduped with a goal-owned event ledger
- test events are blocked from production progress by default
- one event can complete multiple crossed milestones in order

Phase 2 added the persistent goals store:

- `apps/desktop/src/state/useGoalsStore.ts`
- `apps/desktop/src/state/useGoalsStore.test.ts`

Current store behavior:

- creates, updates, archives, deletes, resets, and hydrates reward ladders
- records manual progress adjustments in goal history
- records milestone completion, skip, reopen, and reset history
- applies accepted goal events through the local engine without double-counting duplicates
- persists ladders and history through native app snapshot version 7
- keeps goal persistence separate from timer rules and timer history

Live Twitch and current tip-provider event wiring is complete through Phases 4 and 7.

Phase 3 added the production Goals page:

- `apps/desktop/src/pages/GoalsPage.tsx`
- `/goals` route in the app shell
- sidebar navigation entry and page title
- page-level styling in `apps/desktop/src/index.css`

Current page behavior:

- creates source-specific or mixed reward ladders
- edits ladder title, description, source mode, unit label, conversion weights, and milestones
- shows active ladders with progress bars, next reward, and checked-off milestones
- supports manual progress adjustments with required reasons
- supports milestone skip/reopen, ladder reset, archive, and archived delete flows
- shows recent goal history

The page still uses manual progress until live Twitch subscription/bits wiring lands in Phase 4.

Phase 4 added local Twitch EventSub goal ingestion:

- `apps/desktop/src/hooks/useEventSubLifecycle.ts`
- `apps/desktop/src/components/RuntimeLifecycle.test.tsx`

Current EventSub behavior:

- local reward ladders receive normalized Twitch EventSub events before timer rule filtering
- disabled timer rules do not block goal progress
- subscription, resubscription, gifted sub, gift bomb, and cheer events can advance matching ladders
- follow, raid, chat command, and unrelated Twitch events do not advance support ladders
- goal-owned dedupe still prevents duplicate progress even under reconnect or React development behavior
- shared-session goal authority remains deferred until Phase 13, so shared-mode Twitch event handling continues through the shared-session service path

Phase 5 added the Goals overlay:

- `apps/desktop/src/components/GoalsOverlaySurface.tsx`
- `apps/desktop/src/overlays/GoalsOverlayPage.tsx`
- `/overlay/goals` React route
- `/overlay/goals` native loopback route
- Goals overlay transform controls in Overlay Studio
- goal ladder payload sync through `syncOverlayRuntime`

Current overlay behavior:

- displays up to four active reward ladders
- shows current amount, progress bar, visible milestones, completion state, and next unlock
- provides a studio preview when no live ladders exist
- supports position and scale controls like the other overlays
- keeps React overlay routes and Tauri loopback overlay HTML aligned

Phase 6 added optional Twitch chat announcements:

- `apps/desktop/src/lib/goals/chat.ts`
- `apps/desktop/src/lib/goals/chat.test.ts`
- `apps/desktop/src/hooks/useEventSubLifecycle.ts`
- `apps/desktop/src/pages/GoalsPage.tsx`

Current announcement behavior:

- chat announcements default off and can be enabled from the Goals page
- accepted events announce only when they complete at least one new milestone
- duplicate, ignored, and default-blocked test events do not produce announcement messages
- multiple milestones completed by one event are combined into one Twitch chat message
- messages reuse the existing Helix chat-send path and require the saved Twitch session to include `user:write:chat`
- announcement failure is non-blocking and never rolls back goal progress

Phase 7 added local tip-provider goal ingestion:

- `apps/desktop/src/hooks/useTipSessionLifecycle.ts`
- `apps/desktop/src/components/RuntimeLifecycle.test.tsx`

Current tip goal behavior:

- Streamlabs and StreamElements normalized tip events are fed into local reward ladders before timer rule filtering
- disabled timer tip rules do not block tip goal progress
- only normalized provider `tip` events count toward tip ladders or mixed-support tip inputs
- provider non-tip events remain ignored by the goal engine
- shared-session tip event handling remains on the shared-session service path until shared goals land in Phase 13
- optional milestone chat announcements also apply to accepted tip events

Phase 8 evaluated additional tip providers:

- TipeeeStream is a strong future candidate because it exposes realtime Socket.io events using an account API key.
- Pally.gg is a strong future candidate because it exposes realtime WebSocket support-payment events using a dashboard API key, but the feed is currently marked beta.
- Buy Me a Coffee, Ko-fi, Fourthwall direct webhooks, and Patreon are deferred because they require a public webhook listener or hosted bridge.
- TreatStream and DeStream have realtime paths but require OAuth/client setup, so they are lower priority for this desktop-first app.
- Charity platforms such as Tiltify and DonorDrive should be handled as a separate Phase 11 charity-goals feature rather than mixed into general tip goals.
- Provider Twitch chat alerts are not used as a data source because chat-message parsing is not a reliable payment event API.
- Future providers must either expose a normal user token/socket path or be handled through an official hosted bridge owned by the app.
- Streamlabs and StreamElements remain the supported tip providers for the first goals release.

## Test Plan

Unit tests:

- subscription ladder increments by one per included subscription event
- gift bomb increments by gift quantity
- bits ladder increments by raw bit count
- tips ladder increments by amount and preserves currency display
- source-specific ladders reject unrelated events
- mixed ladders apply explicit conversion weights
- crossing a threshold completes the matching milestone
- crossing multiple thresholds completes every crossed milestone in order
- duplicate event ids do not double-count
- disabled timer rules do not block goal progress
- provider non-tip events do not count as subscription/bit goals
- completed milestones do not complete twice

Runtime tests:

- event replay after reconnect does not duplicate goal progress
- manual adjustment history persists
- test events are ignored by production progress by default
- overlay receives current ladder progress and milestone completion state
- enabled chat announcements send one message for newly completed milestones

Manual validation:

- create subs-only ladder and trigger subscription/gift test events
- create bits-only ladder with thresholds such as 100, 500, and 1,000 bits
- trigger a cheer event large enough to cross multiple thresholds
- create mixed ladder and verify conversion text is visible before saving
- complete a milestone and confirm the overlay celebration
- enable chat announcements, complete a milestone from a real event, and confirm the Twitch message appears after the unlock
- restart app and confirm goals, progress, and history persist

## Acceptance Criteria

- Streamers can create source-specific reward ladders without touching timer rules.
- Ladders progress from live events already supported by the app.
- A disabled timer action can still count toward a ladder if the ladder includes that source.
- Tip providers only count tips, not provider-replayed follows/subs/gifts.
- The UI makes mixed-source ladders explicit and understandable.
- The overlay can show active ladder progress and checked-off milestones in OBS.
- Test events do not mutate real goal progress unless explicitly enabled.
- Twitch chat announcements are opt-in and never fire for ignored or duplicate events.
