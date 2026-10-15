// How much a user sees. "simple" is calm and large (few widgets, no
// categories), "standard" is the everyday view, "expert" shows everything.
// Admins assign a level per user; editing rights stay with Home Assistant's
// admin flag.

import { withoutKey } from "../util/object";

export const LEVELS = ["simple", "standard", "expert"] as const;
export type Level = (typeof LEVELS)[number];

export const levelRank = (level: Level): number => LEVELS.indexOf(level);

/** True when something meant for `min` shows for a user with `level`. */
export const levelAllows = (level: Level, min: Level | undefined): boolean =>
  !min || levelRank(level) >= levelRank(min);

export const isLevel = (value: unknown): value is Level =>
  typeof value === "string" && (LEVELS as readonly string[]).includes(value);

interface LevelLayout {
  levels?: Record<string, Level>;
  /** Users may pick their own level in the settings (default true). */
  levelChoice?: boolean;
}

/**
 * The level of a user: the user's own choice (when allowed), else the one an
 * admin assigned, else expert for admins and standard for everyone else.
 */
export function userLevel(
  layout: Record<string, unknown> | undefined,
  user: Record<string, unknown> | undefined,
  userId: string | undefined,
  isAdmin: boolean,
): Level {
  const l = (layout ?? {}) as LevelLayout;
  const own = user?.level;
  if (l.levelChoice !== false && isLevel(own)) return own;
  const assigned = userId ? l.levels?.[userId] : undefined;
  if (isLevel(assigned)) return assigned;
  return isAdmin ? "expert" : "standard";
}

export function setUserLevel(raw: Record<string, unknown>, userId: string, level: Level | null) {
  const l = raw as LevelLayout;
  const levels = withoutKey({ ...l.levels }, userId);
  if (level) levels[userId] = level;
  return { ...raw, levels };
}

export const levelChoiceAllowed = (raw: Record<string, unknown> | undefined) =>
  (raw as LevelLayout | undefined)?.levelChoice !== false;
