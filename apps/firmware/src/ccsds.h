#ifndef APOGEE_CCSDS_H
#define APOGEE_CCSDS_H

/* CCSDS Space Packet Protocol (133.0-B-2) + minimal PUS-C secondary header.
 * Big-endian on the wire. See docs/PROTOCOL.md for the field-level rationale.
 *
 * This module manipulates raw byte buffers only. No allocation. No dependency
 * outside the standard library. Portable as-is to STM32/POSIX/anything. */

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* --- Sizes -------------------------------------------------------------- */

#define CCSDS_PRIMARY_HEADER_SIZE   6u
#define CCSDS_PUS_TM_SEC_HDR_SIZE   7u   /* PVN+STYP+SUBTYPE + 4B CUC time */
#define CCSDS_PUS_TC_SEC_HDR_SIZE   4u   /* PVN + ACK + STYP + SUBTYPE */
#define CCSDS_CRC_SIZE              2u

/* --- Field values ------------------------------------------------------- */

#define CCSDS_PVN                   0u   /* version 1 of the packet standard */
#define CCSDS_TYPE_TM               0u
#define CCSDS_TYPE_TC               1u
#define CCSDS_SEQF_UNSEGMENTED      3u   /* 0b11 — standalone packet */

#define PUS_VERSION_C               0x10u

/* --- Apogée APIDs ------------------------------------------------------- */

#define APOGEE_APID_HK              0x100u  /* TM — housekeeping reports */
#define APOGEE_APID_EVENT           0x101u  /* TM — events */
#define APOGEE_APID_ACK             0x102u  /* TM — TC verification */
#define APOGEE_APID_TC              0x200u  /* TC — uplink commands */

/* --- PUS service / subtype catalog -------------------------------------- */

#define PUS_SERVICE_VERIFICATION    1u
#define PUS_VERIF_ACCEPT_OK         1u
#define PUS_VERIF_ACCEPT_FAIL       2u

#define PUS_SERVICE_HOUSEKEEPING    3u
#define PUS_HK_REPORT               25u

#define PUS_SERVICE_EVENT           5u
#define PUS_EVENT_INFO              1u
#define PUS_EVENT_HIGH              4u

#define PUS_SERVICE_FUNCTION        8u
#define PUS_FUNCTION_CALL           1u

#define PUS_SERVICE_TEST            17u
#define PUS_TEST_REQUEST            1u
#define PUS_TEST_REPORT             2u

/* --- Function IDs (used inside Service 8/1 payloads) -------------------- */

#define APOGEE_FN_SET_MODE          0x01u
#define APOGEE_FN_REBOOT            0x02u

/* --- Encoding ----------------------------------------------------------- */

/* Pack the 6-byte primary header. data_length is the size of everything that
 * follows the primary header MINUS 1 (per CCSDS convention). Returns
 * CCSDS_PRIMARY_HEADER_SIZE on success, 0 if buf_len too small. */
size_t ccsds_pack_primary_header(uint8_t *buf, size_t buf_len,
                                 uint8_t type, bool sec_hdr,
                                 uint16_t apid, uint16_t seq_count,
                                 uint16_t data_length_minus_1);

/* Pack the 7-byte PUS-C TM secondary header. Returns size or 0 on overflow. */
size_t ccsds_pack_pus_tm_secondary(uint8_t *buf, size_t buf_len,
                                   uint8_t service, uint8_t subtype,
                                   uint32_t cuc_seconds);

/* Pack the 4-byte PUS-C TC secondary header. ack_flags reserved for future
 * use (set to 0 for now in MVP). */
size_t ccsds_pack_pus_tc_secondary(uint8_t *buf, size_t buf_len,
                                   uint8_t ack_flags,
                                   uint8_t service, uint8_t subtype);

/* Compute CRC-16-CCITT-FALSE over the full packet (excluding the trailing
 * CRC) and append it big-endian. Returns total packet size or 0 on overflow. */
size_t ccsds_append_crc(uint8_t *buf, size_t buf_len, size_t packet_len);

/* --- Decoding ----------------------------------------------------------- */

typedef struct {
    uint8_t  version;
    uint8_t  type;            /* 0=TM, 1=TC */
    bool     sec_hdr_flag;
    uint16_t apid;
    uint8_t  seq_flags;
    uint16_t seq_count;
    uint16_t data_length;     /* = (PDL field) + 1, real bytes after PH */
} CcsdsPrimaryHeader;

typedef struct {
    uint8_t pus_version;
    uint8_t ack_flags;
    uint8_t service;
    uint8_t subtype;
} CcsdsPusTcSecondaryHeader;

/* Returns true on success and fills out. Does not validate semantic content. */
bool ccsds_parse_primary_header(const uint8_t *buf, size_t buf_len,
                                CcsdsPrimaryHeader *out);

bool ccsds_parse_pus_tc_secondary(const uint8_t *buf, size_t buf_len,
                                  CcsdsPusTcSecondaryHeader *out);

/* Verify the trailing CRC-16-CCITT of a complete packet of size packet_len. */
bool ccsds_verify_crc(const uint8_t *buf, size_t packet_len);

#endif /* APOGEE_CCSDS_H */
