import { prisma } from "@app/database";
import type { LearningQueueStatus } from "@app/types";
import { toContentSummary } from "./content-service.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * Milestone 11's structured learning queue — see SCHOOL_SEATS.md. Opt-in per child
 * (Child.structuredLearningModeEnabled); when off, this module is never consulted and a
 * child's library/playback behaves exactly as it always has.
 *
 * The decay: 3 fun videos before a learning video is due, then 2, then 1 — holding at 1 for
 * the rest of that session once it gets there. "Session" is deliberately not a concept this
 * module invents: it's scoped to one LearningQueueState row per Device, and a brand-new
 * Device row is exactly what a fresh child device-handoff session already is (see
 * child-session-service.ts's startChildDeviceSession) — so a new handoff naturally starts the
 * decay over, with no extra bookkeeping.
 */
const FUN_QUOTA_BY_STEP = [3, 2, 1];

function funQuotaForStep(stepIndex: number): number {
  return FUN_QUOTA_BY_STEP[Math.min(stepIndex, FUN_QUOTA_BY_STEP.length - 1)]!;
}

/**
 * A piece of content counts as "watched" for queue-advancement purposes once its
 * ViewingHistory completion crosses this threshold — chosen as a reasonable "they actually
 * watched it, not just clicked into it" bar; there's no pre-existing convention elsewhere in
 * this codebase to match, since nothing else gates behavior on "was this watched."
 */
export const WATCHED_COMPLETION_THRESHOLD = 90;

export class LearningGateError extends Error {
  constructor() {
    super("A learning video must be watched before more fun videos unlock");
    this.name = "LearningGateError";
  }
}

async function getOrCreateQueueState(childId: string, deviceId: string) {
  const existing = await prisma.learningQueueState.findUnique({ where: { deviceId } });
  if (existing) return existing;
  // Lazily created on first access rather than at handoff time — a child whose parent never
  // enables structured mode never gets a row at all.
  return prisma.learningQueueState.create({ data: { deviceId, childId, stepIndex: 0, funWatchedInStep: 0 } });
}

function phaseOf(state: { stepIndex: number; funWatchedInStep: number }): "FUN" | "LEARNING_REQUIRED" {
  return state.funWatchedInStep >= funQuotaForStep(state.stepIndex) ? "LEARNING_REQUIRED" : "FUN";
}

/**
 * Called from getPlaybackInfo before a child is allowed to start a piece of content. Only
 * ever blocks when structured mode AND its gate-enforcement toggle are both on for this
 * child, and a learning video is currently due — see Child.structuredLearningGateEnforced's
 * doc comment on why this is a second, independent toggle from the mode itself.
 */
export async function assertPlaybackAllowed(
  childId: string,
  deviceId: string,
  isLearningContent: boolean,
): Promise<void> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { structuredLearningModeEnabled: true, structuredLearningGateEnforced: true },
  });
  if (!child) throw new NotFoundError("Child not found");
  if (!child.structuredLearningModeEnabled || !child.structuredLearningGateEnforced) return;
  if (isLearningContent) return;

  const state = await getOrCreateQueueState(childId, deviceId);
  if (phaseOf(state) === "LEARNING_REQUIRED") {
    throw new LearningGateError();
  }
}

/**
 * Advances the decay once a piece of content's completion crosses the watched threshold —
 * called from recordPlaybackProgress. Watching a learning video always advances the step and
 * resets the fun counter, even if it was watched "early" (before the current fun quota was
 * actually met) — a child getting ahead on learning content is never penalized for it.
 */
export async function recordWatchedContent(
  childId: string,
  deviceId: string,
  isLearningContent: boolean,
): Promise<void> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { structuredLearningModeEnabled: true },
  });
  if (!child?.structuredLearningModeEnabled) return;

  const state = await getOrCreateQueueState(childId, deviceId);
  if (isLearningContent) {
    await prisma.learningQueueState.update({
      where: { deviceId },
      data: { stepIndex: Math.min(state.stepIndex + 1, FUN_QUOTA_BY_STEP.length - 1), funWatchedInStep: 0 },
    });
  } else {
    await prisma.learningQueueState.update({
      where: { deviceId },
      data: { funWatchedInStep: state.funWatchedInStep + 1 },
    });
  }
}

/** Powers GET /api/child/learning-queue — see routes/child.ts. */
export async function getLearningQueueStatus(childId: string, deviceId: string): Promise<LearningQueueStatus> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { structuredLearningModeEnabled: true, structuredLearningGateEnforced: true },
  });
  if (!child) throw new NotFoundError("Child not found");

  if (!child.structuredLearningModeEnabled) {
    return {
      enabled: false,
      gateEnforced: false,
      phase: "FUN",
      funRemainingBeforeLearning: 0,
      funCandidates: [],
      learningCandidates: [],
    };
  }

  const state = await getOrCreateQueueState(childId, deviceId);
  const phase = phaseOf(state);
  const funRemainingBeforeLearning = Math.max(0, funQuotaForStep(state.stepIndex) - state.funWatchedInStep);

  const permissions = await prisma.childContentPermission.findMany({
    where: { childId },
    include: { content: true },
  });

  const funCandidates = permissions.filter((permission) => !permission.isLearningContent);
  const learningCandidates = permissions.filter((permission) => permission.isLearningContent);

  return {
    enabled: true,
    gateEnforced: child.structuredLearningGateEnforced,
    phase,
    funRemainingBeforeLearning,
    funCandidates: funCandidates.map((permission) => toContentSummary(permission.content)),
    learningCandidates: learningCandidates.map((permission) => toContentSummary(permission.content)),
  };
}
