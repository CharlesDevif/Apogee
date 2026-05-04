/* Apogée firmware — Phase 2.2
 *
 * Emits binary TelemetryPacket (40 bytes, magic 0xAB1E, CRC-16-CCITT) at 10 Hz.
 * State machine, physics model, and command handling come in 2.3+.
 */

#include "net.h"
#include "telemetry.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <time.h>

#define BACKEND_HOST   "127.0.0.1"
#define BACKEND_PORT   5001
#define TICK_PERIOD_MS 100   /* 10 Hz */

/* Provisional fixed location until the orbit model lands in 2.4.
 * Picked Bessan (Hérault) so it matches the operator station for now. */
#define INIT_LAT_E7    433430000   /* 43.343°N */
#define INIT_LON_E7     34200000   /*  3.420°E */
#define INIT_ALT_M     400000      /* 400 km LEO */
#define INIT_BATT_MV     7400      /* 7.4 V nominal Li-ion */

static volatile sig_atomic_t g_running = 1;

static void on_sigint(int sig) {
    (void)sig;
    g_running = 0;
}

static void sleep_ms(long ms) {
    struct timespec ts;
    ts.tv_sec  = ms / 1000;
    ts.tv_nsec = (ms % 1000) * 1000000L;
    nanosleep(&ts, NULL);
}

int main(void) {
    setvbuf(stderr, NULL, _IOLBF, 0);
    fprintf(stderr, "[BOOT] apogee firmware v0.2.0\n");

    if (net_init(BACKEND_HOST, BACKEND_PORT) != 0) {
        fprintf(stderr, "[FAULT] net_init failed\n");
        return EXIT_FAILURE;
    }
    fprintf(stderr, "[BOOT] udp -> %s:%d (10 Hz, 40-byte packets)\n",
            BACKEND_HOST, BACKEND_PORT);

    signal(SIGINT,  on_sigint);
    signal(SIGTERM, on_sigint);

    TelemetryPacket pkt;
    uint32_t tick = 0;

    fprintf(stderr, "[NOMINAL] entering main loop\n");
    while (g_running) {
        telemetry_compose(&pkt,
                          APOGEE_MODE_NOMINAL,
                          tick,
                          INIT_LAT_E7,
                          INIT_LON_E7,
                          INIT_ALT_M,
                          INIT_BATT_MV,
                          0, 0, 0);
        (void)net_send(&pkt, sizeof pkt);
        tick++;
        sleep_ms(TICK_PERIOD_MS);
    }

    fprintf(stderr, "[SAFE] shutdown signal received (sent %u packets)\n", tick);
    net_close();
    return EXIT_SUCCESS;
}
