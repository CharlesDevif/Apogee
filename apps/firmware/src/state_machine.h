#ifndef APOGEE_STATE_MACHINE_H
#define APOGEE_STATE_MACHINE_H

#include "telemetry.h"

#include <stdbool.h>
#include <stdint.h>

/* Per-spec transitions (see docs/APOGEE_BRIEF.md §5):
 *   BOOT     — initialization, automatic transition to SAFE after 2s
 *   SAFE     — degraded mode, only basic telemetry, only SET_MODE accepted
 *   NOMINAL  — operational, all commands accepted
 *   COMMS    — privileged comms mode (placeholder for V1+)
 *   FAULT    — error state, manual transition only back to SAFE
 *
 * No automatic NOMINAL <-> FAULT transition in MVP — FAULT is entered only
 * via test command. */

typedef struct {
    ApogeeMode mode;
    uint32_t   tick_in_mode;
    uint32_t   total_ticks;
} StateMachine;

void sm_init(StateMachine *sm);

/* Run one tick. Handles BOOT->SAFE auto-transition. */
void sm_tick(StateMachine *sm);

/* Request a mode change. Returns true if accepted, false if forbidden. */
bool sm_request_mode(StateMachine *sm, ApogeeMode requested);

const char *sm_mode_name(ApogeeMode mode);

#endif /* APOGEE_STATE_MACHINE_H */
