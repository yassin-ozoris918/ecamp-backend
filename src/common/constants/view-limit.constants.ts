/**
 * Number of seconds of actual video playback required before a view is counted.
 * This is tracked on the frontend via cumulative play-time (not wall-clock time),
 * so seeking, pausing, and buffering do not contribute.
 *
 * Keep this as the single source of truth — do not hard-code 10 anywhere else.
 */
export const VIEW_COUNT_THRESHOLD_SECONDS = 10;
