import { WebcastPushConnection } from "tiktok-live-connector";
import type { BattleState, BattleParticipant } from "@shared/schema";
import { log } from "./index";

export class TikTokBattleManager {
  private connections: Map<string, WebcastPushConnection> = new Map();
  private states: Map<string, BattleState> = new Map();
  private listeners: Map<string, Set<(state: BattleState) => void>> = new Map();
  private roundProcessed: Map<string, boolean> = new Map();
  private winnerTimers: Map<string, NodeJS.Timeout> = new Map();
  private battleStartTime: Map<string, number> = new Map();
  private battleMode: Map<string, number> = new Map();
  private currentBattleId: Map<string, string> = new Map();
  private armiesReceivedForBattle: Map<string, boolean> = new Map();
  private seenRoundInProgress: Map<string, boolean> = new Map();

  getState(username: string): BattleState {
    return this.states.get(username) || {
      isConnected: false,
      isBattleActive: false,
      participantA: null,
      participantB: null,
      roundWinner: null,
      username,
    };
  }

  private setState(username: string, update: Partial<BattleState>) {
    const current = this.getState(username);
    const newState = { ...current, ...update };
    this.states.set(username, newState);
    this.broadcast(username, newState);
  }

  private broadcast(username: string, state: BattleState) {
    const subs = this.listeners.get(username);
    if (subs) {
      subs.forEach((cb) => cb(state));
    }
  }

  private setRoundWinner(username: string, winner: string) {
    const existing = this.winnerTimers.get(username);
    if (existing) clearTimeout(existing);

    this.setState(username, { roundWinner: winner });

    const timer = setTimeout(() => {
      this.setState(username, { roundWinner: null });
      this.winnerTimers.delete(username);
    }, 5000);
    this.winnerTimers.set(username, timer);
  }

  subscribe(username: string, callback: (state: BattleState) => void) {
    if (!this.listeners.has(username)) {
      this.listeners.set(username, new Set());
    }
    this.listeners.get(username)!.add(callback);
    callback(this.getState(username));
  }

  unsubscribe(username: string, callback: (state: BattleState) => void) {
    this.listeners.get(username)?.delete(callback);
  }

  async connect(username: string): Promise<BattleState> {
    if (this.connections.has(username)) {
      return this.getState(username);
    }

    const tiktok = new WebcastPushConnection(username, {
      processInitialData: true,
      enableExtendedGiftInfo: false,
    });

    this.connections.set(username, tiktok);

    tiktok.on("connected", (state: any) => {
      log(`Connected to TikTok live: ${username} (room ${state?.roomId})`, "tiktok");
      this.setState(username, { isConnected: true, username });
    });

    tiktok.on("disconnected", () => {
      log(`Disconnected from TikTok live: ${username}`, "tiktok");
      this.setState(username, { isConnected: false });
    });

    tiktok.on("error", (err: any) => {
      log(`TikTok error for ${username}: ${err?.message || err}`, "tiktok");
    });

    tiktok.on("linkMicBattle", (data: any) => {
      log(`linkMicBattle for ${username}: action=${data?.action} battleId=${data?.battleId}`, "tiktok");
      try {
        const currentState = this.getState(username);

        let userA: any = null;
        let userB: any = null;

        if (data?.anchorInfo) {
          const anchorKeys = Object.keys(data.anchorInfo);
          const anchors = Object.values(data.anchorInfo) as any[];
          if (anchors.length >= 2) {
            userA = extractBattleUserInfo(anchors[0], anchorKeys[0]);
            userB = extractBattleUserInfo(anchors[1], anchorKeys[1]);
          }
        }

        if (!userA && data?.battleUsers) {
          const bu = data.battleUsers;
          if (Array.isArray(bu) && bu.length >= 2) {
            userA = {
              anchorId: bu[0]?.uniqueId || bu[0]?.userId || "",
              uniqueId: bu[0]?.uniqueId || bu[0]?.displayId || "",
              nickname: bu[0]?.nickname || bu[0]?.nickName || bu[0]?.uniqueId || "",
              profilePictureUrl: bu[0]?.profilePictureUrl || extractAvatarUrl(bu[0]?.avatarThumb) || "",
            };
            userB = {
              anchorId: bu[1]?.uniqueId || bu[1]?.userId || "",
              uniqueId: bu[1]?.uniqueId || bu[1]?.displayId || "",
              nickname: bu[1]?.nickname || bu[1]?.nickName || bu[1]?.uniqueId || "",
              profilePictureUrl: bu[1]?.profilePictureUrl || extractAvatarUrl(bu[1]?.avatarThumb) || "",
            };
          }
        }

        log(`Battle participants: A=${userA?.nickname} anchorId=${userA?.anchorId} pic=${userA?.profilePictureUrl ? "yes" : "no"}, B=${userB?.nickname} anchorId=${userB?.anchorId} pic=${userB?.profilePictureUrl ? "yes" : "no"}`, "tiktok");

        const newAnchorA = userA?.anchorId || userA?.uniqueId || "";
        const newAnchorB = userB?.anchorId || userB?.uniqueId || "";
        const prevAnchorA = currentState.participantA?.anchorId || currentState.participantA?.uniqueId || "";
        const prevAnchorB = currentState.participantB?.anchorId || currentState.participantB?.uniqueId || "";

        const hasBothNewAnchors = newAnchorA.length > 0 && newAnchorB.length > 0;
        const hasBothPrevAnchors = prevAnchorA.length > 0 && prevAnchorB.length > 0;

        const sameOpponents = hasBothNewAnchors && hasBothPrevAnchors && (
          (newAnchorA === prevAnchorA && newAnchorB === prevAnchorB) ||
          (newAnchorA === prevAnchorB && newAnchorB === prevAnchorA)
        );

        log(`Battle opponent check: same=${sameOpponents} newA=${newAnchorA} newB=${newAnchorB} prevA=${prevAnchorA} prevB=${prevAnchorB}`, "tiktok");

        const modeHearts = this.battleMode.get(username) || 5;
        let heartsA = modeHearts;
        let heartsB = modeHearts;

        if (sameOpponents && currentState.participantA && currentState.participantB) {
          if (newAnchorA === prevAnchorA) {
            heartsA = currentState.participantA.hearts;
            heartsB = currentState.participantB.hearts;
          } else {
            heartsA = currentState.participantB.hearts;
            heartsB = currentState.participantA.hearts;
          }
        }

        const participantA: BattleParticipant = {
          anchorId: userA?.anchorId || "",
          uniqueId: userA?.uniqueId || "Player A",
          nickname: userA?.nickname || userA?.uniqueId || "Player A",
          profilePictureUrl: userA?.profilePictureUrl || "",
          points: 0,
          hearts: heartsA,
        };

        const participantB: BattleParticipant = {
          anchorId: userB?.anchorId || "",
          uniqueId: userB?.uniqueId || "Player B",
          nickname: userB?.nickname || userB?.uniqueId || "Player B",
          profilePictureUrl: userB?.profilePictureUrl || "",
          points: 0,
          hearts: heartsB,
        };

        this.roundProcessed.set(username, !sameOpponents);
        this.battleStartTime.set(username, Date.now());
        this.armiesReceivedForBattle.set(username, false);
        this.seenRoundInProgress.set(username, false);
        const newBattleId = data?.battleId || "";
        if (newBattleId) {
          this.currentBattleId.set(username, newBattleId);
        }
        log(`Battle start: roundProcessed=${!sameOpponents} (sameOpponents=${sameOpponents}) battleId=${newBattleId}`, "tiktok");

        const existingTimer = this.winnerTimers.get(username);
        if (existingTimer) {
          clearTimeout(existingTimer);
          this.winnerTimers.delete(username);
        }

        this.setState(username, {
          isBattleActive: true,
          participantA,
          participantB,
          roundWinner: null,
        });
      } catch (e: any) {
        log(`Error processing linkMicBattle: ${e.message}`, "tiktok");
      }
    });

    tiktok.on("linkMicArmies", (data: any) => {
      try {
        const currentState = this.getState(username);
        if (!currentState.participantA || !currentState.participantB) return;

        const battleItems = data?.battleItems || {};
        const battleStatus = data?.battleStatus ?? 0;

        let pointsA = currentState.participantA.points;
        let pointsB = currentState.participantB.points;
        let picA = currentState.participantA.profilePictureUrl;
        let picB = currentState.participantB.profilePictureUrl;

        if (typeof battleItems === "object" && !Array.isArray(battleItems)) {
          const itemKeys = Object.keys(battleItems);

          log(`linkMicArmies status=${battleStatus} keys=[${itemKeys.join(",")}] anchorA=${currentState.participantA.anchorId} anchorB=${currentState.participantB.anchorId}`, "tiktok");

          const anchorIdA = currentState.participantA.anchorId;
          const anchorIdB = currentState.participantB.anchorId;

          let itemForA: any = null;
          let itemForB: any = null;

          if (anchorIdA || anchorIdB) {
            for (const key of itemKeys) {
              const item = battleItems[key];
              const itemAnchor = item?.anchorIdStr || "";
              if (itemAnchor === anchorIdA || key === anchorIdA) {
                itemForA = item;
              } else if (itemAnchor === anchorIdB || key === anchorIdB) {
                itemForB = item;
              }
            }
          }

          if (itemForA && !itemForB && anchorIdB) {
            log(`linkMicArmies SKIPPED: found A but not B (anchorB=${anchorIdB}) - likely stale/partial event`, "tiktok");
            return;
          }
          if (!itemForA && itemForB && anchorIdA) {
            log(`linkMicArmies SKIPPED: found B but not A (anchorA=${anchorIdA}) - likely stale/partial event`, "tiktok");
            return;
          }

          if (!itemForA || !itemForB) {
            log(`linkMicArmies anchor match incomplete: foundA=${!!itemForA} foundB=${!!itemForB}`, "tiktok");
          }

          if (!itemForA && !itemForB && itemKeys.length >= 2) {
            const eventAnchorIds = itemKeys.map(k => battleItems[k]?.anchorIdStr || k);

            const matchesA = eventAnchorIds.some(id => id === anchorIdA);
            const matchesB = eventAnchorIds.some(id => id === anchorIdB);
            const bothMatch = (anchorIdA && anchorIdB) ? (matchesA && matchesB) : false;

            if (bothMatch) {
              itemForA = battleItems[itemKeys[0]];
              itemForB = battleItems[itemKeys[1]];

              if (anchorIdA && itemForB?.anchorIdStr === anchorIdA) {
                const tmp = itemForA;
                itemForA = itemForB;
                itemForB = tmp;
              } else if (anchorIdB && itemForA?.anchorIdStr === anchorIdB) {
                const tmp = itemForA;
                itemForA = itemForB;
                itemForB = tmp;
              }
            } else if (!anchorIdA && !anchorIdB) {
              itemForA = battleItems[itemKeys[0]];
              itemForB = battleItems[itemKeys[1]];
            } else {
              log(`linkMicArmies SKIPPED: event anchorIds [${eventAnchorIds.join(",")}] don't match BOTH current participants A=${anchorIdA} B=${anchorIdB} - likely stale event from previous battle`, "tiktok");
              return;
            }
          }

          if (itemForA) {
            pointsA = extractPoints(itemForA);
            if (!picA) {
              const army = itemForA?.userArmy;
              if (Array.isArray(army) && army.length > 0) {
                picA = extractAvatarUrl(army[0]?.avatarThumb) || "";
              }
            }
          }
          if (itemForB) {
            pointsB = extractPoints(itemForB);
            if (!picB) {
              const army = itemForB?.userArmy;
              if (Array.isArray(army) && army.length > 0) {
                picB = extractAvatarUrl(army[0]?.avatarThumb) || "";
              }
            }
          }
        } else if (Array.isArray(battleItems) && battleItems.length >= 2) {
          log(`linkMicArmies status=${battleStatus} (array format)`, "tiktok");
          pointsA = extractPoints(battleItems[0]);
          pointsB = extractPoints(battleItems[1]);
        }

        if (battleStatus !== 4 && battleStatus !== 5 && battleStatus > 0) {
          this.seenRoundInProgress.set(username, true);
        }

        const pointsChanged = (pointsA !== currentState.participantA.points || pointsB !== currentState.participantB.points);
        if (!this.armiesReceivedForBattle.get(username) && pointsChanged) {
          this.armiesReceivedForBattle.set(username, true);
          if (this.roundProcessed.get(username) && battleStatus !== 4 && battleStatus !== 5) {
            log(`First legitimate linkMicArmies (in-progress status=${battleStatus}) for new battle - resetting roundProcessed to false`, "tiktok");
            this.roundProcessed.set(username, false);
          } else if (this.roundProcessed.get(username)) {
            log(`First linkMicArmies has terminal status=${battleStatus} - keeping roundProcessed=true to prevent premature heart deduction`, "tiktok");
          }
        }

        const updates: Partial<BattleState> = {
          isBattleActive: true,
          participantA: { ...currentState.participantA, points: pointsA, profilePictureUrl: picA },
          participantB: { ...currentState.participantB, points: pointsB, profilePictureUrl: picB },
        };

        const battleAge = Date.now() - (this.battleStartTime.get(username) || 0);
        const roundInProgress = this.seenRoundInProgress.get(username) || false;
        if ((battleStatus === 4 || battleStatus === 5) && !this.roundProcessed.get(username) && battleAge > 8000 && roundInProgress) {
          this.roundProcessed.set(username, true);
          this.seenRoundInProgress.set(username, false);

          if (pointsA > pointsB) {
            updates.participantB = {
              ...updates.participantB!,
              hearts: Math.max(0, currentState.participantB.hearts - 1),
            };
            this.setState(username, updates);
            this.setRoundWinner(username, currentState.participantA.nickname);
          } else if (pointsB > pointsA) {
            updates.participantA = {
              ...updates.participantA!,
              hearts: Math.max(0, currentState.participantA.hearts - 1),
            };
            this.setState(username, updates);
            this.setRoundWinner(username, currentState.participantB.nickname);
          } else {
            this.setState(username, updates);
            this.setRoundWinner(username, "Empate");
          }
        } else {
          this.setState(username, updates);
        }
      } catch (e: any) {
        log(`Error processing linkMicArmies: ${e.message}`, "tiktok");
      }
    });

    tiktok.on("linkMicMethod", (data: any) => {
      try {
        const msgType = data?.messageType ?? 0;
        const win = data?.win ?? false;
        const rivalAnchorId = data?.rivalAnchorId || "0";
        const matchType = data?.matchType ?? 0;
        const duration = data?.duration ?? 0;
        const userId = data?.userId || data?.anchorLinkmicId || "0";

        log(`linkMicMethod for ${username}: messageType=${msgType} win=${win} userId=${userId} rivalAnchorId=${rivalAnchorId} matchType=${matchType} duration=${duration}`, "tiktok");

        const currentState = this.getState(username);
        if (!currentState.isBattleActive || !currentState.participantA || !currentState.participantB) return;
        if (this.roundProcessed.get(username)) return;

        const battleAge = Date.now() - (this.battleStartTime.get(username) || 0);
        if (battleAge < 8000) return;

        const anchorIdA = currentState.participantA.anchorId || "";
        const anchorIdB = currentState.participantB.anchorId || "";
        if (anchorIdA && anchorIdB) {
          const eventAnchors = [userId, rivalAnchorId].filter(id => id && id !== "0");
          if (eventAnchors.length >= 2) {
            const matchesA = eventAnchors.some(id => id === anchorIdA);
            const matchesB = eventAnchors.some(id => id === anchorIdB);
            if (!matchesA || !matchesB) {
              log(`linkMicMethod SKIPPED: event anchors [${eventAnchors.join(",")}] don't match BOTH current participants A=${anchorIdA} B=${anchorIdB} - stale event`, "tiktok");
              return;
            }
          } else if (eventAnchors.length === 1) {
            const singleAnchor = eventAnchors[0];
            if (singleAnchor !== anchorIdA && singleAnchor !== anchorIdB) {
              log(`linkMicMethod SKIPPED: single anchor ${singleAnchor} doesn't match A=${anchorIdA} or B=${anchorIdB} - stale event`, "tiktok");
              return;
            }
          }
        }

        if (win) {
          const roundInProgress = this.seenRoundInProgress.get(username) || false;
          if (!roundInProgress) {
            log(`linkMicMethod win=true SKIPPED: haven't seen in-progress armies event yet - preventing premature heart deduction`, "tiktok");
            return;
          }

          this.roundProcessed.set(username, true);
          this.seenRoundInProgress.set(username, false);

          const aPoints = currentState.participantA.points;
          const bPoints = currentState.participantB.points;

          if (aPoints > bPoints) {
            this.setState(username, {
              participantB: {
                ...currentState.participantB,
                hearts: Math.max(0, currentState.participantB.hearts - 1),
              },
            });
            this.setRoundWinner(username, currentState.participantA.nickname);
          } else if (bPoints > aPoints) {
            this.setState(username, {
              participantA: {
                ...currentState.participantA,
                hearts: Math.max(0, currentState.participantA.hearts - 1),
              },
            });
            this.setRoundWinner(username, currentState.participantB.nickname);
          } else {
            this.setRoundWinner(username, "Empate");
          }
        }
      } catch (e: any) {
        log(`Error processing linkMicMethod: ${e.message}`, "tiktok");
      }
    });

    tiktok.on("linkMicBattlePunishFinish", (data: any) => {
      const battleId = data?.battleId || "0";
      const reason = data?.reason ?? 0;
      log(`linkMicBattlePunishFinish for ${username}: battleId=${battleId} reason=${reason}`, "tiktok");

      const battleAge = Date.now() - (this.battleStartTime.get(username) || 0);
      if (battleAge < 8000) {
        log(`linkMicBattlePunishFinish SKIPPED: battle too new (${battleAge}ms) - likely stale event from previous battle`, "tiktok");
        return;
      }

      this.roundProcessed.set(username, false);
    });

    try {
      const state = await tiktok.connect();
      log(`Successfully connected to ${username}, room ${state?.roomId}`, "tiktok");
      this.setState(username, { isConnected: true, username });
      return this.getState(username);
    } catch (err: any) {
      this.connections.delete(username);
      log(`Failed to connect to ${username}: ${err?.message || err}`, "tiktok");
      throw err;
    }
  }

  disconnect(username: string) {
    const conn = this.connections.get(username);
    if (conn) {
      try {
        conn.disconnect();
      } catch {}
      this.connections.delete(username);
    }
    this.roundProcessed.delete(username);
    this.currentBattleId.delete(username);
    this.armiesReceivedForBattle.delete(username);
    this.seenRoundInProgress.delete(username);
    const timer = this.winnerTimers.get(username);
    if (timer) clearTimeout(timer);
    this.winnerTimers.delete(username);
    this.setState(username, {
      isConnected: false,
      isBattleActive: false,
      participantA: null,
      participantB: null,
      roundWinner: null,
    });
  }

  adjustHearts(username: string, side: "a" | "b", delta: number) {
    const state = this.getState(username);
    if (side === "a" && state.participantA) {
      const newHearts = Math.max(0, Math.min(10, state.participantA.hearts + delta));
      this.setState(username, {
        participantA: { ...state.participantA, hearts: newHearts },
      });
    } else if (side === "b" && state.participantB) {
      const newHearts = Math.max(0, Math.min(10, state.participantB.hearts + delta));
      this.setState(username, {
        participantB: { ...state.participantB, hearts: newHearts },
      });
    }
  }

  setBattleMode(username: string, hearts: number) {
    const count = Math.max(1, Math.min(10, hearts));
    this.battleMode.set(username, count);
    log(`Battle mode set for ${username}: ${count} hearts`, "tiktok");
  }

  getBattleMode(username: string): number {
    return this.battleMode.get(username) || 5;
  }

  resetHearts(username: string, count: number = 5) {
    const hearts = Math.max(1, Math.min(10, count));
    const state = this.getState(username);
    const updates: Partial<BattleState> = {};
    if (state.participantA) {
      updates.participantA = { ...state.participantA, hearts };
    }
    if (state.participantB) {
      updates.participantB = { ...state.participantB, hearts };
    }
    this.setState(username, updates);
  }

  resetBattle(username: string) {
    this.roundProcessed.delete(username);
    this.armiesReceivedForBattle.delete(username);
    this.seenRoundInProgress.delete(username);
    this.currentBattleId.delete(username);
    const timer = this.winnerTimers.get(username);
    if (timer) clearTimeout(timer);
    this.winnerTimers.delete(username);
    this.setState(username, {
      isBattleActive: false,
      participantA: null,
      participantB: null,
      roundWinner: null,
    });
  }
}

function extractAvatarUrl(img: any): string {
  if (!img) return "";
  if (Array.isArray(img.url) && img.url.length > 0) return img.url[0];
  if (Array.isArray(img.urlList) && img.urlList.length > 0) return img.urlList[0];
  if (typeof img === "string") return img;
  return "";
}

function extractBattleUserInfo(anchor: any, anchorKey?: string) {
  const user = anchor?.user;
  if (user) {
    return {
      anchorId: user.userId || anchorKey || "",
      uniqueId: user.displayId || user.uniqueId || "",
      nickname: user.nickName || user.nickname || user.displayId || "",
      profilePictureUrl: extractAvatarUrl(user.avatarThumb) || extractAvatarUrl(user.profilePicture) || "",
    };
  }
  return {
    anchorId: anchorKey || "",
    uniqueId: anchor?.uniqueId || anchor?.displayId || "",
    nickname: anchor?.nickname || anchor?.nickName || anchor?.uniqueId || "",
    profilePictureUrl: anchor?.profilePictureUrl || extractAvatarUrl(anchor?.avatarThumb) || extractAvatarUrl(anchor?.profilePicture) || "",
  };
}

function extractPoints(item: any): number {
  const hostScore = parseInt(item?.hostScore, 10);
  if (!isNaN(hostScore) && hostScore > 0) {
    return hostScore;
  }

  if (item?.userArmy && Array.isArray(item.userArmy)) {
    let total = 0;
    for (const soldier of item.userArmy) {
      total += parseInt(soldier.score, 10) || 0;
    }
    if (total > 0) return total;
  }

  if (item?.battleGroups && Array.isArray(item.battleGroups)) {
    let total = 0;
    for (const group of item.battleGroups) {
      total += group.points || 0;
    }
    if (total > 0) return total;
  }

  return parseInt(item?.points, 10) || parseInt(item?.score, 10) || 0;
}

export const battleManager = new TikTokBattleManager();
