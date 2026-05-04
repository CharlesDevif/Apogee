#include "ccsds.h"
#include "crc16.h"

#include <string.h>

/* All multi-byte fields are big-endian (network order) per CCSDS. */

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

static uint16_t get_u16_be(const uint8_t *p) {
    return (uint16_t)((uint16_t)p[0] << 8) | (uint16_t)p[1];
}

size_t ccsds_pack_primary_header(uint8_t *buf, size_t buf_len,
                                 uint8_t type, bool sec_hdr,
                                 uint16_t apid, uint16_t seq_count,
                                 uint16_t data_length_minus_1) {
    if (buf_len < CCSDS_PRIMARY_HEADER_SIZE) return 0;

    /* word 0 : VER(3) | T(1) | S(1) | APID(11) */
    uint16_t w0 = (uint16_t)((CCSDS_PVN & 0x07u) << 13);
    w0 |= (uint16_t)((type & 0x01u) << 12);
    w0 |= (uint16_t)((sec_hdr ? 1u : 0u) << 11);
    w0 |= (uint16_t)(apid & 0x07FFu);

    /* word 1 : SEQF(2) | SEQ(14) */
    uint16_t w1 = (uint16_t)((CCSDS_SEQF_UNSEGMENTED & 0x03u) << 14);
    w1 |= (uint16_t)(seq_count & 0x3FFFu);

    put_u16_be(&buf[0], w0);
    put_u16_be(&buf[2], w1);
    put_u16_be(&buf[4], data_length_minus_1);
    return CCSDS_PRIMARY_HEADER_SIZE;
}

size_t ccsds_pack_pus_tm_secondary(uint8_t *buf, size_t buf_len,
                                   uint8_t service, uint8_t subtype,
                                   uint32_t cuc_seconds) {
    if (buf_len < CCSDS_PUS_TM_SEC_HDR_SIZE) return 0;
    buf[0] = PUS_VERSION_C;
    buf[1] = service;
    buf[2] = subtype;
    put_u32_be(&buf[3], cuc_seconds);
    return CCSDS_PUS_TM_SEC_HDR_SIZE;
}

size_t ccsds_pack_pus_tc_secondary(uint8_t *buf, size_t buf_len,
                                   uint8_t ack_flags,
                                   uint8_t service, uint8_t subtype) {
    if (buf_len < CCSDS_PUS_TC_SEC_HDR_SIZE) return 0;
    buf[0] = PUS_VERSION_C;
    buf[1] = ack_flags;
    buf[2] = service;
    buf[3] = subtype;
    return CCSDS_PUS_TC_SEC_HDR_SIZE;
}

size_t ccsds_append_crc(uint8_t *buf, size_t buf_len, size_t packet_len) {
    if (buf_len < packet_len + CCSDS_CRC_SIZE) return 0;
    uint16_t crc = crc16_ccitt(buf, packet_len);
    put_u16_be(&buf[packet_len], crc);
    return packet_len + CCSDS_CRC_SIZE;
}

bool ccsds_parse_primary_header(const uint8_t *buf, size_t buf_len,
                                CcsdsPrimaryHeader *out) {
    if (buf_len < CCSDS_PRIMARY_HEADER_SIZE) return false;
    uint16_t w0 = get_u16_be(&buf[0]);
    uint16_t w1 = get_u16_be(&buf[2]);
    uint16_t pdl = get_u16_be(&buf[4]);

    out->version       = (uint8_t)((w0 >> 13) & 0x07u);
    out->type          = (uint8_t)((w0 >> 12) & 0x01u);
    out->sec_hdr_flag  = ((w0 >> 11) & 0x01u) != 0u;
    out->apid          = (uint16_t)(w0 & 0x07FFu);
    out->seq_flags     = (uint8_t)((w1 >> 14) & 0x03u);
    out->seq_count     = (uint16_t)(w1 & 0x3FFFu);
    out->data_length   = (uint16_t)(pdl + 1u);
    return out->version == CCSDS_PVN;
}

bool ccsds_parse_pus_tc_secondary(const uint8_t *buf, size_t buf_len,
                                  CcsdsPusTcSecondaryHeader *out) {
    if (buf_len < CCSDS_PUS_TC_SEC_HDR_SIZE) return false;
    out->pus_version = buf[0];
    out->ack_flags   = buf[1];
    out->service     = buf[2];
    out->subtype     = buf[3];
    return out->pus_version == PUS_VERSION_C;
}

bool ccsds_verify_crc(const uint8_t *buf, size_t packet_len) {
    if (packet_len < CCSDS_CRC_SIZE) return false;
    size_t body = packet_len - CCSDS_CRC_SIZE;
    uint16_t expected = crc16_ccitt(buf, body);
    uint16_t got = get_u16_be(&buf[body]);
    return expected == got;
}
