#include "command.h"
#include "ccsds.h"

#include <stdio.h>

const char *command_outcome_name(CommandOutcome o) {
    switch (o) {
    case CMD_OUTCOME_OK:          return "OK";
    case CMD_OUTCOME_REBOOT:      return "REBOOT";
    case CMD_OUTCOME_BAD_PACKET:  return "BAD_PACKET";
    case CMD_OUTCOME_WRONG_TYPE:  return "WRONG_TYPE";
    case CMD_OUTCOME_WRONG_APID:  return "WRONG_APID";
    case CMD_OUTCOME_BAD_CRC:     return "BAD_CRC";
    case CMD_OUTCOME_BAD_PUS:     return "BAD_PUS";
    case CMD_OUTCOME_UNKNOWN_SVC: return "UNKNOWN_SVC";
    case CMD_OUTCOME_REJECTED:    return "REJECTED";
    case CMD_OUTCOME_BAD_PAYLOAD: return "BAD_PAYLOAD";
    }
    return "?";
}

static CommandOutcome handle_function_call(const uint8_t *payload, size_t len,
                                           StateMachine *sm) {
    if (len < 1) return CMD_OUTCOME_BAD_PAYLOAD;
    uint8_t fn = payload[0];

    if (fn == APOGEE_FN_SET_MODE) {
        if (len < 2) return CMD_OUTCOME_BAD_PAYLOAD;
        uint8_t requested = payload[1];
        if (requested > APOGEE_MODE_BOOT) return CMD_OUTCOME_BAD_PAYLOAD;
        return sm_request_mode(sm, (ApogeeMode)requested)
                   ? CMD_OUTCOME_OK
                   : CMD_OUTCOME_REJECTED;
    }

    if (fn == APOGEE_FN_REBOOT) {
        return CMD_OUTCOME_REBOOT;
    }

    return CMD_OUTCOME_UNKNOWN_SVC;
}

CommandOutcome command_handle(const uint8_t *buf, size_t len,
                              StateMachine *sm,
                              uint16_t *out_seq) {
    *out_seq = 0;

    CcsdsPrimaryHeader ph;
    if (!ccsds_parse_primary_header(buf, len, &ph)) {
        return CMD_OUTCOME_BAD_PACKET;
    }
    if (ph.type != CCSDS_TYPE_TC) return CMD_OUTCOME_WRONG_TYPE;
    if (ph.apid != APOGEE_APID_TC) return CMD_OUTCOME_WRONG_APID;
    *out_seq = ph.seq_count;

    /* Total packet size announced by the primary header.
     * data_length already accounts for the +1 convention. */
    size_t expected = (size_t)CCSDS_PRIMARY_HEADER_SIZE + ph.data_length;
    if (expected != len) return CMD_OUTCOME_BAD_PACKET;
    if (!ccsds_verify_crc(buf, len)) return CMD_OUTCOME_BAD_CRC;

    if (!ph.sec_hdr_flag) return CMD_OUTCOME_BAD_PUS;
    const uint8_t *sec_buf = buf + CCSDS_PRIMARY_HEADER_SIZE;
    size_t after_ph = len - CCSDS_PRIMARY_HEADER_SIZE;

    CcsdsPusTcSecondaryHeader sec;
    if (!ccsds_parse_pus_tc_secondary(sec_buf, after_ph, &sec)) {
        return CMD_OUTCOME_BAD_PUS;
    }

    const uint8_t *payload = sec_buf + CCSDS_PUS_TC_SEC_HDR_SIZE;
    size_t payload_len = after_ph - CCSDS_PUS_TC_SEC_HDR_SIZE - CCSDS_CRC_SIZE;

    /* PING: Service 17/1 — no payload. */
    if (sec.service == PUS_SERVICE_TEST && sec.subtype == PUS_TEST_REQUEST) {
        return CMD_OUTCOME_OK;
    }

    /* Function call: Service 8/1. */
    if (sec.service == PUS_SERVICE_FUNCTION && sec.subtype == PUS_FUNCTION_CALL) {
        return handle_function_call(payload, payload_len, sm);
    }

    return CMD_OUTCOME_UNKNOWN_SVC;
}
