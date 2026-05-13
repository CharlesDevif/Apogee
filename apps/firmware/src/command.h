#ifndef APOGEE_COMMAND_H
#define APOGEE_COMMAND_H

#include "state_machine.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef enum {
    CMD_OUTCOME_OK            = 0,  /* command accepted and executed */
    CMD_OUTCOME_REBOOT        = 1,  /* caller must re-init state */
    CMD_OUTCOME_BAD_PACKET    = 2,
    CMD_OUTCOME_WRONG_TYPE    = 3,
    CMD_OUTCOME_WRONG_APID    = 4,
    CMD_OUTCOME_BAD_CRC       = 5,
    CMD_OUTCOME_BAD_PUS       = 6,
    CMD_OUTCOME_UNKNOWN_SVC   = 7,
    CMD_OUTCOME_REJECTED      = 8,  /* state machine refused */
    CMD_OUTCOME_BAD_PAYLOAD   = 9,
    CMD_OUTCOME_BAD_HMAC      = 10, /* MAC mismatch — auth failed */
    CMD_OUTCOME_REPLAY        = 11, /* seq <= last accepted */
} CommandOutcome;

/* Decode a CCSDS Space Packet TC and apply it to the state machine.
 * `out_seq` receives the TC sequence count for downstream ack reporting. */
CommandOutcome command_handle(const uint8_t *buf, size_t len,
                              StateMachine *sm,
                              uint16_t *out_seq);

const char *command_outcome_name(CommandOutcome o);

/* Reset anti-replay state. Call on REBOOT — the firmware loses its memory
 * of the last accepted sequence number along with everything else. */
void command_reset_replay_state(void);

#endif /* APOGEE_COMMAND_H */
