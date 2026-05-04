#include "telemetry.h"

#include <time.h>

static uint16_t hk_seq  = 0;  /* per-APID 14-bit sequence counter, mod 16384 */
static uint16_t ack_seq = 0;

static uint32_t now_unix_seconds(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (uint32_t)ts.tv_sec;
}

static void put_u16_be(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v >> 8);
    p[1] = (uint8_t)(v & 0xFFu);
}

static void put_u32_be(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)((v >> 24) & 0xFFu);
    p[1] = (uint8_t)((v >> 16) & 0xFFu);
    p[2] = (uint8_t)((v >> 8) & 0xFFu);
    p[3] = (uint8_t)(v & 0xFFu);
}

static void put_i16_be(uint8_t *p, int16_t v) {
    put_u16_be(p, (uint16_t)v);
}

static void put_i32_be(uint8_t *p, int32_t v) {
    put_u32_be(p, (uint32_t)v);
}

size_t telemetry_compose_hk(uint8_t *buf, size_t buf_len,
                            ApogeeMode mode,
                            uint32_t tick_count,
                            int32_t lat_e7,
                            int32_t lon_e7,
                            uint32_t alt_m,
                            uint16_t battery_mv,
                            int16_t roll10,
                            int16_t pitch10,
                            int16_t yaw10) {
    if (buf_len < APOGEE_HK_PACKET_SIZE) return 0;

    /* Body length minus 1, per CCSDS PDL convention. */
    const uint16_t body_len =
        (uint16_t)(CCSDS_PUS_TM_SEC_HDR_SIZE + APOGEE_HK_PAYLOAD_SIZE +
                   CCSDS_CRC_SIZE);

    size_t off = 0;

    off += ccsds_pack_primary_header(buf + off, buf_len - off,
                                     CCSDS_TYPE_TM, true,
                                     APOGEE_APID_HK, hk_seq,
                                     (uint16_t)(body_len - 1u));
    hk_seq = (uint16_t)((hk_seq + 1u) & 0x3FFFu);

    off += ccsds_pack_pus_tm_secondary(buf + off, buf_len - off,
                                       PUS_SERVICE_HOUSEKEEPING,
                                       PUS_HK_REPORT,
                                       now_unix_seconds());

    /* HK payload — see telemetry.h for the layout. */
    uint8_t *p = buf + off;
    p[0] = (uint8_t)mode;
    put_u16_be(&p[1], battery_mv);
    put_i32_be(&p[3], lat_e7);
    put_i32_be(&p[7], lon_e7);
    put_u32_be(&p[11], alt_m);
    put_i16_be(&p[15], roll10);
    put_i16_be(&p[17], pitch10);
    put_i16_be(&p[19], yaw10);
    put_u32_be(&p[21], tick_count);
    off += APOGEE_HK_PAYLOAD_SIZE;

    return ccsds_append_crc(buf, buf_len, off);
}

size_t telemetry_compose_ack(uint8_t *buf, size_t buf_len,
                             bool success, uint8_t failure_code,
                             uint16_t tc_apid, uint16_t tc_seq) {
    const size_t payload_len = success ? 4u : 5u;
    const size_t total = CCSDS_PRIMARY_HEADER_SIZE +
                         CCSDS_PUS_TM_SEC_HDR_SIZE +
                         payload_len + CCSDS_CRC_SIZE;
    if (buf_len < total) return 0;

    const uint16_t body_len =
        (uint16_t)(CCSDS_PUS_TM_SEC_HDR_SIZE + payload_len + CCSDS_CRC_SIZE);

    size_t off = 0;
    off += ccsds_pack_primary_header(buf + off, buf_len - off,
                                     CCSDS_TYPE_TM, true,
                                     APOGEE_APID_ACK, ack_seq,
                                     (uint16_t)(body_len - 1u));
    ack_seq = (uint16_t)((ack_seq + 1u) & 0x3FFFu);

    off += ccsds_pack_pus_tm_secondary(buf + off, buf_len - off,
                                       PUS_SERVICE_VERIFICATION,
                                       success ? PUS_VERIF_ACCEPT_OK
                                               : PUS_VERIF_ACCEPT_FAIL,
                                       now_unix_seconds());

    /* Reconstruct the 16-bit Packet ID and Sequence Control words of the
     * referenced TC (per PUS-C convention). */
    uint16_t tc_pkt_id =
        (uint16_t)((CCSDS_TYPE_TC & 0x01u) << 12) |
        (uint16_t)(1u << 11) |        /* sec hdr present on our TCs */
        (uint16_t)(tc_apid & 0x07FFu);
    uint16_t tc_seq_ctl =
        (uint16_t)((CCSDS_SEQF_UNSEGMENTED & 0x03u) << 14) |
        (uint16_t)(tc_seq & 0x3FFFu);

    uint8_t *p = buf + off;
    put_u16_be(&p[0], tc_pkt_id);
    put_u16_be(&p[2], tc_seq_ctl);
    if (!success) p[4] = failure_code;
    off += payload_len;

    return ccsds_append_crc(buf, buf_len, off);
}
