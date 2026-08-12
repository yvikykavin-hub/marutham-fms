export interface TurnOwner {
  name: string;
  days: number;
  isMe: boolean;
}

export interface TurnStatus {
  isMyTurn: boolean;
  ownerName: string;
  ownerIsMe: boolean;
  turnStartTime: Date;
  turnEndTime: Date;
  hoursRemaining: number;
  daysRemaining: number;
  endsToday: boolean;
  endingSoon: boolean;
  justStarted: boolean;
  nextOwnerName: string;
  nextTurnStartTime: Date;
  hoursUntilMyNextTurn: number;
}

export interface ScheduleEntry {
  ownerName: string;
  isMe: boolean;
  startTime: Date;
  endTime: Date;
  isCurrent: boolean;
  isPast: boolean;
  isFuture: boolean;
}

// Build participants from motor data
export function buildParticipants(
  startOwner: string,
  startOwnerDays: number,
  partners: Array<{ name: string; days: number }>
): TurnOwner[] {
  return [
    { name: startOwner, days: startOwnerDays, isMe: startOwner === "me" },
    ...partners.map((p) => ({ name: p.name, days: p.days, isMe: false })),
  ];
}

// Calculate current turn status
export function calculateCurrentTurn(
  startDate: string,
  startOwner: string,
  startOwnerDays: number,
  partners: Array<{ name: string; days: number }>
): TurnStatus | null {
  if (!startDate || !startOwner) return null;

  const participants = buildParticipants(startOwner, startOwnerDays, partners);
  if (participants.length === 0) return null;

  // Turn ALWAYS starts/ends at 6 PM
  const firstTurnStart = new Date(startDate);
  firstTurnStart.setHours(18, 0, 0, 0);

  const now = new Date();
  let currentStart = new Date(firstTurnStart);
  let participantIndex = 0;
  let iterations = 0;

  while (iterations < 1000) {
    const participant = participants[participantIndex % participants.length];

    // Duration is in fractional days (e.g. 0.5 = 12 hours) when a turn was
    // configured in hours rather than whole days, so the end time is
    // computed in milliseconds rather than via Date#setDate — which
    // truncates fractional arguments to whole days. Whole-day turns still
    // snap their handover to 6 PM; turns shorter than a day end exactly
    // on time instead.
    const turnEnd = new Date(currentStart.getTime() + participant.days * 24 * 60 * 60 * 1000);
    if (participant.days >= 1) {
      turnEnd.setHours(18, 0, 0, 0);
    }

    if (now < turnEnd) {
      // Found current turn!
      const msRemaining = turnEnd.getTime() - now.getTime();
      const hoursRemaining = msRemaining / (1000 * 60 * 60);
      const daysRemaining = Math.floor(hoursRemaining / 24);

      const endsToday = turnEnd.toDateString() === now.toDateString();

      const endingSoon = hoursRemaining <= 2;

      // Just started = within 12 hours of turn start. Clamped at 0 so a
      // turn scheduled to start in the future (now < currentStart) never
      // reads as "just started" — only a turn that has actually begun does.
      const msSinceStart = now.getTime() - currentStart.getTime();
      const hoursSinceStart = msSinceStart / (1000 * 60 * 60);
      const justStarted = hoursSinceStart >= 0 && hoursSinceStart <= 12;

      // Get next turn info
      const nextIndex = (participantIndex + 1) % participants.length;
      const nextParticipant = participants[nextIndex];

      // Find when my next turn is
      let myNextTurnStart: Date = turnEnd;

      if (participant.isMe) {
        // Already my turn - find the next time it's me again, starting
        // the search from the person right after this turn.
        let si = nextIndex;
        let ss = new Date(turnEnd);
        for (let i = 0; i < 100; i++) {
          const sp = participants[si % participants.length];
          const se = new Date(ss.getTime() + sp.days * 24 * 60 * 60 * 1000);
          if (sp.days >= 1) {
            se.setHours(18, 0, 0, 0);
          }
          if (sp.isMe) {
            myNextTurnStart = ss;
            break;
          }
          ss = se;
          si++;
        }
      } else {
        // Not my turn - find when it next becomes mine.
        let si = participantIndex;
        let ss = new Date(currentStart);
        for (let i = 0; i < 100; i++) {
          const sp = participants[si % participants.length];
          const se = new Date(ss.getTime() + sp.days * 24 * 60 * 60 * 1000);
          if (sp.days >= 1) {
            se.setHours(18, 0, 0, 0);
          }
          if (sp.isMe && ss > now) {
            myNextTurnStart = ss;
            break;
          }
          ss = se;
          si++;
        }
      }

      const hoursUntilMyNextTurn = participant.isMe ? 0 : (myNextTurnStart.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        isMyTurn: participant.isMe,
        ownerName: participant.name,
        ownerIsMe: participant.isMe,
        turnStartTime: currentStart,
        turnEndTime: turnEnd,
        hoursRemaining,
        daysRemaining,
        endsToday,
        endingSoon,
        justStarted,
        nextOwnerName: nextParticipant.name,
        nextTurnStartTime: turnEnd,
        hoursUntilMyNextTurn,
      };
    }

    currentStart = new Date(turnEnd);
    participantIndex++;
    iterations++;
  }

  return null;
}

// Generate schedule entries — last 3 days (past) through next 30 days (future)
export function generateSchedule(
  startDate: string,
  startOwner: string,
  startOwnerDays: number,
  partners: Array<{ name: string; days: number }>,
  displayNameMap?: Record<string, string>
): ScheduleEntry[] {
  if (!startDate || !startOwner) return [];

  const participants = buildParticipants(startOwner, startOwnerDays, partners);
  if (participants.length === 0) return [];

  const firstTurnStart = new Date(startDate);
  firstTurnStart.setHours(18, 0, 0, 0);

  const now = new Date();

  // Show last 3 days + next 30 days
  const showFrom = new Date(now);
  showFrom.setDate(showFrom.getDate() - 3);
  showFrom.setHours(0, 0, 0, 0);

  const showUntil = new Date(now);
  showUntil.setDate(showUntil.getDate() + 30);
  showUntil.setHours(23, 59, 59, 999);

  const entries: ScheduleEntry[] = [];
  let currentStart = new Date(firstTurnStart);
  let participantIndex = 0;
  let iterations = 0;

  while (iterations < 1000) {
    const participant = participants[participantIndex % participants.length];

    // Duration is in fractional days (e.g. 0.5 = 12 hours) when a turn was
    // configured in hours rather than whole days, so the end time is
    // computed in milliseconds rather than via Date#setDate — which
    // truncates fractional arguments to whole days. Whole-day turns still
    // snap their handover to 6 PM; turns shorter than a day end exactly
    // on time instead.
    const turnEnd = new Date(currentStart.getTime() + participant.days * 24 * 60 * 60 * 1000);
    if (participant.days >= 1) {
      turnEnd.setHours(18, 0, 0, 0);
    }

    // Stop if we're past our display window
    if (currentStart > showUntil) break;

    // Only include if in display window
    if (turnEnd > showFrom) {
      const isCurrent = now >= currentStart && now < turnEnd;
      const isPast = turnEnd <= now;
      const isFuture = currentStart > now;

      // Get display name
      const displayName = participant.isMe ? "me" : displayNameMap?.[participant.name] || participant.name;

      entries.push({
        ownerName: displayName,
        isMe: participant.isMe,
        startTime: new Date(currentStart),
        endTime: new Date(turnEnd),
        isCurrent,
        isPast,
        isFuture,
      });
    }

    currentStart = new Date(turnEnd);
    participantIndex++;
    iterations++;
  }

  return entries;
}

// Format turn end time string
export function formatTurnEndTime(endTime: Date, language: string): string {
  const L = (en: string, ta: string) => (language === "ta" ? ta : en);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = endTime.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const dateStr = endTime.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  if (endTime.toDateString() === now.toDateString()) {
    return L(`today at ${timeStr}`, `இன்று ${timeStr}`);
  } else if (endTime.toDateString() === tomorrow.toDateString()) {
    return L(`tomorrow at ${timeStr}`, `நாளை ${timeStr}`);
  } else {
    return L(`${dateStr} at ${timeStr}`, `${dateStr} ${timeStr}`);
  }
}

// Format next turn start time string — the next person's turn starts 1
// minute after the current turn ends (6:01 PM, not 6:00 PM), so this never
// reads as if two turns start/end at the exact same instant.
export function formatNextTurnStartTime(endTime: Date, language: string): string {
  const L = (en: string, ta: string) => (language === "ta" ? ta : en);

  const startTime = new Date(endTime);
  startTime.setMinutes(startTime.getMinutes() + 1);

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = startTime.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const dateStr = startTime.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  if (startTime.toDateString() === now.toDateString()) {
    return L(`today at ${timeStr}`, `இன்று ${timeStr}`);
  } else if (startTime.toDateString() === tomorrow.toDateString()) {
    return L(`tomorrow at ${timeStr}`, `நாளை ${timeStr}`);
  } else {
    return L(`${dateStr} at ${timeStr}`, `${dateStr} ${timeStr}`);
  }
}

// Get next turn info
export function getNextTurnInfo(
  startDate: string,
  startOwner: string,
  startOwnerDays: number,
  partners: Array<{ name: string; days: number }>
): {
  nextOwner: string;
  nextOwnerIsMe: boolean;
  startTime: Date;
  hoursUntil: number;
} | null {
  const status = calculateCurrentTurn(startDate, startOwner, startOwnerDays, partners);
  if (!status) return null;

  const participants = buildParticipants(startOwner, startOwnerDays, partners);
  const now = new Date();

  let currentStart = new Date(startDate);
  currentStart.setHours(18, 0, 0, 0);
  let participantIndex = 0;

  for (let i = 0; i < 1000; i++) {
    const participant = participants[participantIndex % participants.length];
    // Duration is in fractional days (e.g. 0.5 = 12 hours) when a turn was
    // configured in hours rather than whole days, so the end time is
    // computed in milliseconds rather than via Date#setDate — which
    // truncates fractional arguments to whole days. Whole-day turns still
    // snap their handover to 6 PM; turns shorter than a day end exactly
    // on time instead.
    const turnEnd = new Date(currentStart.getTime() + participant.days * 24 * 60 * 60 * 1000);
    if (participant.days >= 1) {
      turnEnd.setHours(18, 0, 0, 0);
    }

    if (now >= currentStart && now < turnEnd) {
      // This is current turn - next is after this
      const nextIndex = (participantIndex + 1) % participants.length;
      const nextParticipant = participants[nextIndex];

      return {
        nextOwner: nextParticipant.name,
        nextOwnerIsMe: nextParticipant.isMe,
        startTime: turnEnd,
        hoursUntil: (turnEnd.getTime() - now.getTime()) / (1000 * 60 * 60),
      };
    }

    currentStart = new Date(turnEnd);
    participantIndex++;
  }

  return null;
}
