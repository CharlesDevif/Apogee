#include "command.h"
#include "auth.h"
#include "ccsds.h"

#include <stdint.h>
#include <stdio.h>

/* Highest TC sequence number we have accepted since boot. -1 means none. */
static int32_t s_last_tc_seq = -1;

void command_reset_replay_state(void) {
    s_last_tc_seq = -1;
}

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
    case CMD_OUTCOME_BAD_HMAC:    return "BAD_HMAC";
    case CMD_OUTCOME_REPLAY:      return "REPLAY";
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

    /* TC layout after CRC check:
     *   [ PH 6 ][ PUS 4 ][ Payload N ][ MAC 16 ][ CRC 2 ]
     * Verify the MAC over everything before it. */
    const size_t fixed = CCSDS_PRIMARY_HEADER_SIZE +
                         CCSDS_PUS_TC_SEC_HDR_SIZE +
                         APOGEE_TC_MAC_LEN + CCSDS_CRC_SIZE;
    if (len < fixed) return CMD_OUTCOME_BAD_PACKET;

    const size_t mac_off = len - CCSDS_CRC_SIZE - APOGEE_TC_MAC_LEN;
    uint8_t expected_mac[APOGEE_TC_MAC_LEN];
    auth_mac(buf, mac_off, expected_mac);
    if (!auth_mac_equal(expected_mac, buf + mac_off)) {
        return CMD_OUTCOME_BAD_HMAC;
    }

    /* Anti-replay — only after MAC succeeds, otherwise an attacker could
     * lock us out by spamming high-seq garbage. */
    if (s_last_tc_seq >= 0 && (int32_t)ph.seq_count <= s_last_tc_seq) {
        return CMD_OUTCOME_REPLAY;
    }
    s_last_tc_seq = (int32_t)ph.seq_count;

    if (!ph.sec_hdr_flag) return CMD_OUTCOME_BAD_PUS;
    const uint8_t *sec_buf = buf + CCSDS_PRIMARY_HEADER_SIZE;
    size_t after_ph = len - CCSDS_PRIMARY_HEADER_SIZE;

    CcsdsPusTcSecondaryHeader sec;
    if (!ccsds_parse_pus_tc_secondary(sec_buf, after_ph, &sec)) {
        return CMD_OUTCOME_BAD_PUS;
    }

    const uint8_t *payload = sec_buf + CCSDS_PUS_TC_SEC_HDR_SIZE;
    size_t payload_len =
        after_ph - CCSDS_PUS_TC_SEC_HDR_SIZE - APOGEE_TC_MAC_LEN - CCSDS_CRC_SIZE;

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
