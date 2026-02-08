import { z } from "zod";

export const battleParticipantSchema = z.object({
  anchorId: z.string().default(""),
  uniqueId: z.string(),
  nickname: z.string(),
  profilePictureUrl: z.string(),
  points: z.number().default(0),
  hearts: z.number().default(5),
});

export type BattleParticipant = z.infer<typeof battleParticipantSchema>;

export const battleStateSchema = z.object({
  isConnected: z.boolean().default(false),
  isBattleActive: z.boolean().default(false),
  participantA: battleParticipantSchema.nullable().default(null),
  participantB: battleParticipantSchema.nullable().default(null),
  roundWinner: z.string().nullable().default(null),
  username: z.string().default(""),
});

export type BattleState = z.infer<typeof battleStateSchema>;

export interface WSMessage {
  type: "battle_state" | "connect" | "disconnect" | "adjust_hearts" | "reset_hearts" | "reset_battle";
  payload?: any;
}

export const connectSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export type ConnectPayload = z.infer<typeof connectSchema>;

export const users = undefined;
export type InsertUser = { username: string; password: string };
export type User = { id: string; username: string; password: string };
