"use client";

import { Fragment, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { RoomState } from "@/lib/types";
import { Button } from "@/components/jklm/button";
import { avatarUrl } from "@/lib/avatar";
import { usePhaseCountdown } from "./use-phase-countdown";
import { IntroFrame } from "./intro-frame";

interface TiebreakerIntroViewProps {
  roomState: RoomState;
  userId: string;
  onLeave: () => void;
}

const TOTAL_INTRO_SECONDS = 6;

export function TiebreakerIntroView({
  roomState,
  userId,
  onLeave,
}: TiebreakerIntroViewProps) {
  const secondsLeft = usePhaseCountdown(roomState.phaseEndsAt);
  const elapsed = TOTAL_INTRO_SECONDS - secondsLeft;
  const slide = elapsed < 2 ? 0 : elapsed < 4 ? 1 : 2;

  const reduce = useReducedMotion();

  const tiedIds = roomState.tiebreakerPlayers ?? [];
  const tiedPlayers = useMemo(
    () =>
      tiedIds
        .map((uid) => roomState.players.find((p) => p.userId === uid))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    [tiedIds, roomState.players]
    
  );

  const isContestant = tiedIds.includes(userId);
  const countdownNumber = Math.max(1, Math.ceil(secondsLeft));

  return (
    <>
      <div className="absolute top-4 left-4 z-10">
        <Button variant="neutral" size="sm" onClick={onLeave}>
          ← Leave
        </Button>
      </div>

      <IntroFrame
        slide={slide}
        totalSlides={3}
        backdrop="bg-pink/40"
        decorations={["⚡", "⚔️", "⚡", "🔥", "⚔️", "⚡"]}
        accent="bg-pink"
      >
        {slide === 0 && (
          <div className="py-8">
            <motion.div
              initial={reduce ? false : { scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 12 }}
              className="mb-3 inline-block text-7xl"
              aria-hidden="true"
            >
              ⚔️
            </motion.div>

            <motion.h1
              initial={reduce ? false : { y: 30, opacity: 0 }}
              animate={
                reduce
                  ? { opacity: 1 }
                  : {
                      y: 0,
                      opacity: 1,
                      // Subtle shake to convey drama
                      x: [0, -4, 4, -3, 3, 0],
                    }
              }
              transition={{
                y: { type: "spring", stiffness: 240, damping: 14, delay: 0.15 },
                opacity: { duration: 0.3, delay: 0.15 },
                x: { duration: 0.5, delay: 0.5 },
              }}
              className="font-heading text-5xl font-bold uppercase tracking-tight sm:text-7xl"
            >
              Tiebreaker!
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.7 }}
              className="mt-3 font-heading text-base text-ink/70"
            >
              sudden death · last one standing wins
            </motion.p>
          </div>
        )}

        {slide === 1 && (
          <div className="py-6">
            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="mb-3 font-heading text-sm font-semibold uppercase tracking-wide text-ink/60"
            >
              contestants
            </motion.p>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: { delayChildren: 0.1, staggerChildren: 0.18 },
                },
              }}
              className="flex flex-wrap items-center justify-center gap-4 sm:gap-6"
            >
              {tiedPlayers.map((p, i) => (
                <Fragment key={p.userId}>
                  <motion.div
                    variants={{
                      hidden: reduce
                        ? { opacity: 1 }
                        : {
                            opacity: 0,
                            // Even-indexed enters from left, odd from right
                            x: i % 2 === 0 ? -40 : 40,
                            scale: 0.6,
                          },
                      visible: {
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        transition: {
                          type: "spring",
                          stiffness: 240,
                          damping: 16,
                        },
                      },
                    }}
                    className="flex flex-col items-center"
                  >
                    <motion.div
                      animate={
                        reduce
                          ? undefined
                          : {
                              boxShadow: [
                                "6px 6px 0 0 rgb(244 114 182)",
                                "8px 8px 0 0 rgb(244 114 182)",
                                "6px 6px 0 0 rgb(244 114 182)",
                              ],
                            }
                      }
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="h-24 w-24 overflow-hidden rounded-full border-[4px] border-ink bg-white"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarUrl(p.avatarSeed || p.userId)}
                        alt={`${p.name} avatar`}
                        className="h-full w-full"
                      />
                    </motion.div>
                    <span className="mt-2 max-w-[8rem] truncate font-heading text-base font-bold uppercase tracking-wide">
                      {p.name}
                    </span>
                    <span className="font-heading text-[10px] font-bold uppercase tracking-wide text-ink/50">
                      {roomState.scores[p.userId] ?? 0} pts
                    </span>
                  </motion.div>

                  {i < tiedPlayers.length - 1 && (
                    <motion.span
                      variants={{
                        hidden: reduce
                          ? { opacity: 1 }
                          : { opacity: 0, scale: 0, rotate: -180 },
                        visible: {
                          opacity: 1,
                          scale: 1,
                          rotate: 0,
                          transition: {
                            type: "spring",
                            stiffness: 320,
                            damping: 14,
                          },
                        },
                      }}
                      className="rounded-full border-[3px] border-ink bg-pink px-3 py-1 font-heading text-2xl font-bold uppercase tracking-wide shadow-chunky-sm"
                      aria-hidden="true"
                    >
                      VS
                    </motion.span>
                  )}
                </Fragment>
              ))}
            </motion.div>

            {isContestant && (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + tiedPlayers.length * 0.18 }}
                className="mt-6 inline-flex items-center gap-2 rounded-full border-[3px] border-ink bg-pink px-4 py-1 font-heading text-sm font-bold uppercase tracking-wide shadow-chunky-sm"
              >
                <span aria-hidden="true">🔥</span>
                You&apos;re in
              </motion.div>
            )}
          </div>
        )}

        {slide === 2 && (
          <div className="py-8">
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="font-heading text-sm font-semibold uppercase tracking-wide text-ink/60"
            >
              round starts in
            </motion.p>

            <motion.div
              key={countdownNumber}
              initial={reduce ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? undefined : { scale: 1.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 16 }}
              className={`mt-3 font-heading text-9xl font-bold tabular-nums ${
                countdownNumber === 1 ? "text-pink" : "text-ink"
              }`}
              aria-live="polite"
            >
              {countdownNumber}
            </motion.div>

            <div
              className="mx-auto mt-8 h-3 max-w-md overflow-hidden rounded-full border-[3px] border-ink bg-cream"
              aria-hidden="true"
            >
              <motion.div
                initial={false}
                animate={{
                  width: `${((TOTAL_INTRO_SECONDS - secondsLeft) / TOTAL_INTRO_SECONDS) * 100}%`,
                }}
                transition={{ ease: "linear", duration: 0.25 }}
                className="h-full bg-pink"
              />
            </div>
          </div>
        )}
      </IntroFrame>
    </>
  );
}
