#include "state_machine.h"

#include <stdio.h>

/* BOOT lasts 20 ticks at 10 Hz = 2 s, per spec. */
#define BOOT_TICKS 20

static const char *MODE_NAMES[] = {
    [APOGEE_MODE_SAFE]    = "SAFE",
    [APOGEE_MODE_NOMINAL] = "NOMINAL",
    [APOGEE_MODE_COMMS]   = "COMMS",
    [APOGEE_MODE_FAULT]   = "FAULT",
    [APOGEE_MODE_BOOT]    = "BOOT",
};

const char *sm_mode_name(ApogeeMode mode) {
    if ((unsigned)mode < (sizeof MODE_NAMES / sizeof MODE_NAMES[0]) &&
        MODE_NAMES[mode] != NULL) {
        return MODE_NAMES[mode];
    }
    return "UNKNOWN";
}

static void enter_mode(StateMachine *sm, ApogeeMode next) {
    if (sm->mode == next) return;
    fprintf(stderr, "[%s -> %s] transition at tick %u\n",
            sm_mode_name(sm->mode), sm_mode_name(next), sm->total_ticks);
    sm->mode = next;
    sm->tick_in_mode = 0;
}

void sm_init(StateMachine *sm) {
    sm->mode         = APOGEE_MODE_BOOT;
    sm->tick_in_mode = 0;
    sm->total_ticks  = 0;
    fprintf(stderr, "[BOOT] state machine initialized\n");
}

void sm_tick(StateMachine *sm) {
    sm->total_ticks++;
    sm->tick_in_mode++;

    if (sm->mode == APOGEE_MODE_BOOT && sm->tick_in_mode >= BOOT_TICKS) {
        enter_mode(sm, APOGEE_MODE_SAFE);
    }
}

bool sm_request_mode(StateMachine *sm, ApogeeMode requested) {
    /* BOOT is auto-only — never enter externally. */
    if (requested == APOGEE_MODE_BOOT) return false;

    /* From BOOT, no manual transitions allowed; wait for the auto-step. */
    if (sm->mode == APOGEE_MODE_BOOT) return false;

    /* SAFE: accept SET_MODE, can move to NOMINAL or stay SAFE. */
    if (sm->mode == APOGEE_MODE_SAFE) {
        if (requested == APOGEE_MODE_NOMINAL ||
            requested == APOGEE_MODE_SAFE ||
            requested == APOGEE_MODE_FAULT) {
            enter_mode(sm, requested);
            return true;
        }
        return false;
    }

    /* NOMINAL accepts any non-BOOT mode. */
    if (sm->mode == APOGEE_MODE_NOMINAL) {
        enter_mode(sm, requested);
        return true;
    }

    /* COMMS behaves like NOMINAL for now. */
    if (sm->mode == APOGEE_MODE_COMMS) {
        enter_mode(sm, requested);
        return true;
    }

    /* FAULT: per spec, only manual transition back to SAFE. */
    if (sm->mode == APOGEE_MODE_FAULT) {
        if (requested == APOGEE_MODE_SAFE) {
            enter_mode(sm, requested);
            return true;
        }
        return false;
    }

    return false;
}
