# Rastrear Pontos

## Overview
Real-time TikTok Live battle overlay application for OBS. Connects to TikTok Live streams using tiktok-live-connector and displays battle information as a transparent overlay.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express + WebSocket (ws) + tiktok-live-connector
- **Real-time**: WebSocket for browser ↔ server communication
- **No database needed**: All state is in-memory and real-time

## Pages
- `/` - Home page: Enter TikTok username to connect, get overlay URL
- `/overlay?username=USER` - Transparent overlay for OBS (battle display)
- `/panel?username=USER` - Control panel for manual heart adjustments

## Key Files
- `server/tiktok-battle.ts` - TikTok Live Connector manager, battle state
- `server/routes.ts` - WebSocket server setup, message handling
- `client/src/pages/overlay.tsx` - OBS overlay with transparent background
- `client/src/pages/panel.tsx` - Control panel for manual adjustments
- `client/src/pages/home.tsx` - Connection page
- `shared/schema.ts` - Shared TypeScript types

## TikTok Events Used
- `linkMicBattle` - Battle start detection (uses `anchorInfo` map → `battleUsers` array via legacy simplifier)
- `linkMicArmies` - Score/points updates (`battleItems` is a map with `hostUserId` + `battleGroups[].points`, `battleStatus` 4/5 = round end)
- `linkMicMethod` - Link mic state changes (has `messageType`, `win` boolean, `rivalAnchorId`, `matchType`, `duration`)
- `linkMicBattlePunishFinish` - Battle punishment end (has `battleId`, `reason`), resets roundProcessed flag

## Data Structure Notes (from tiktok-live-connector TypeScript types)
- **WebcastLinkMicBattle**: `anchorInfo` is `{ [key: string]: BattleUserInfo }` map. Each `BattleUserInfo` has `user: { userId, nickName, displayId, avatarThumb }` and `tags[]`
- **WebcastLinkMicBattle**: also has `battleResult: { [key: string]: BattleResult }` with `userId`, `result`, `score` per participant
- **WebcastLinkMicArmies**: `battleItems` is `{ [key: string]: BattleUserArmies }` map. Each `BattleUserArmies` has `hostScore` (string), `anchorIdStr`, and `userArmy: BattleUserArmy[]` (each with `userId`, `score`, `nickname`, `avatarThumb`)
- **WebcastLinkMicMethod**: has `win: boolean`, `rivalAnchorId: string`, `userId: string`, `anchorLinkmicId: string`, `matchType: number`, `duration: number`, `messageType`
- **WebcastLinkMicBattlePunishFinish**: has `battleId: string`, `reason: Reason`, `channelId: string`, `opUid: string`
- `roundProcessed` flag prevents duplicate heart deduction per round
- `seenRoundInProgress` flag requires seeing at least one non-terminal armies event (status != 4/5) before allowing heart deduction, preventing premature deductions when connecting mid-battle
- `extractPoints()` prefers `hostScore`, falls back to summing `userArmy[].score`, then `battleGroups[].points`

## WebSocket Messages
- `connect` - Connect to TikTok live
- `disconnect` - Disconnect
- `battle_state` - State broadcast to all clients
- `adjust_hearts` - Manual heart adjustment
- `reset_hearts` - Reset hearts to 5
- `reset_battle` - Reset entire battle state

## Overlay Configuration (localStorage-based)
- **Heart color**: `localStorage.heartColor` - CSS color for active hearts (default `#ff0000`), applied via `--heart-color` CSS var
- **Layout mode**: `localStorage.overlayLayout` - `horizontal` (default), `vertical`, or `stacked` - adds class `layout-{mode}` to `#overlay`
- **Transparent background**: `localStorage.overlayTransparent` - `"true"` removes overlay background via `body.overlay-transparent` class
- **Defeated effect**: Participants with 0 hearts get `.defeated` class (grayed out, 40% opacity)
- Config panel: floating box injected in `/panel` page (bottom-right corner) with color picker, layout selector, and transparent toggle
- Overlay syncs config every 1.5s and on `overlay-config` window event
