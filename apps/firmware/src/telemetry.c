#include "telemetry.h"
#include "crc16.h"

#include <string.h>
#include <time.h>

static uint64_t now_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    return (uint64_t)ts.tv_sec * 1000000ULL + (uint64_t)ts.tv_nsec / 1000ULL;
}

void telemetry_compose(TelemetryPacket *out,
                       ApogeeMode mode,
                       uint32_t tick_count,
                       int32_t lat_e7,
                       int32_t lon_e7,
                       uint32_t alt_m,
                       uint16_t battery_mv,
                       int16_t roll10,
                       int16_t pitch10,
                       int16_t yaw10) {
    memset(out, 0, sizeof *out);
    out->magic         = APOGEE_TM_MAGIC;
    out->version       = APOGEE_TM_VERSION;
    out->mode          = (uint8_t)mode;
    out->tick_count    = tick_count;
    out->timestamp_us  = now_us();
    out->lat_e7        = lat_e7;
    out->lon_e7        = lon_e7;
    out->alt_m         = alt_m;
    out->battery_mv    = battery_mv;
    out->attitude_deg[0] = roll10;
    out->attitude_deg[1] = pitch10;
    out->attitude_deg[2] = yaw10;

    /* CRC covers everything except the trailing crc16 field itself. */
    const size_t crc_offset = sizeof *out - sizeof out->crc16;
    out->crc16 = crc16_ccitt((const uint8_t *)out, crc_offset);
}
