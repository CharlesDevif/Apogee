/* Apogée firmware — Phase 2.3
 *
 * State machine: BOOT (auto 2s) -> SAFE -> NOMINAL -> COMMS / FAULT.
 * Telemetry emitted at 10 Hz reflects the current mode.
 */

#include "net.h"
#include "physics.h"
#include "state_machine.h"
#include "telemetry.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <time.h>

#define BACKEND_HOST   "127.0.0.1"
#define BACKEND_PORT   5001
#define TICK_PERIOD_MS 100   /* 10 Hz */
#define DT_SEC         (TICK_PERIOD_MS / 1000.0)

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

    StateMachine    sm;
    PhysicsState    phys;
    TelemetryPacket pkt;
    sm_init(&sm);
    physics_init(&phys);

    /* Demo timeline: hold SAFE for 3s after BOOT, then auto-promote to NOMINAL.
     * Once command channel is wired (2.6) the operator drives mode changes. */
    bool nominal_kicked = false;

    fprintf(stderr, "[BOOT] entering main loop @ 10 Hz\n");
    while (g_running) {
        sm_tick(&sm);

        if (!nominal_kicked &&
            sm.mode == APOGEE_MODE_SAFE &&
            sm.tick_in_mode >= 30) {
            sm_request_mode(&sm, APOGEE_MODE_NOMINAL);
            nominal_kicked = true;
        }

        physics_tick(&phys, sm.mode, DT_SEC);

        telemetry_compose(&pkt,
                          sm.mode,
                          sm.total_ticks,
                          phys.lat_e7,
                          phys.lon_e7,
                          phys.alt_m,
                          phys.battery_mv,
                          phys.roll10, phys.pitch10, phys.yaw10);
        (void)net_send(&pkt, sizeof pkt);

        sleep_ms(TICK_PERIOD_MS);
    }

    fprintf(stderr, "[SHUTDOWN] mode=%s ticks=%u\n",
            sm_mode_name(sm.mode), sm.total_ticks);
    net_close();
    return EXIT_SUCCESS;
}
