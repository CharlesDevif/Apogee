/* Apogée firmware — Phase 2.6
 *
 * CCSDS Space Packet Protocol + minimal PUS-C subset.
 *  - Downlink: PUS 3/25 housekeeping reports @ 10 Hz on UDP/5001 (TM, APID 0x100)
 *  - Uplink:   PUS 17/1 ping, PUS 8/1 SET_MODE/REBOOT on UDP/5002 (TC, APID 0x200)
 *
 * The state machine is now operator-driven: BOOT auto-transitions to SAFE,
 * everything beyond is a telecommand decision. */

#include "command.h"
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
#include <sys/types.h>

#define BACKEND_HOST   "127.0.0.1"
#define BACKEND_PORT   5001
#define LOCAL_TC_PORT  5002
#define TICK_PERIOD_MS 100   /* 10 Hz */
#define DT_SEC         (TICK_PERIOD_MS / 1000.0)
#define TC_BUF_SIZE    256u

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
    fprintf(stderr, "[BOOT] apogee firmware v0.3.0\n");

    if (net_init(BACKEND_HOST, BACKEND_PORT, LOCAL_TC_PORT) != 0) {
        fprintf(stderr, "[FAULT] net_init failed\n");
        return EXIT_FAILURE;
    }
    fprintf(stderr,
            "[BOOT] tm udp -> %s:%d (CCSDS PUS 3/25 @ 10 Hz, %u B)\n",
            BACKEND_HOST, BACKEND_PORT, (unsigned)APOGEE_HK_PACKET_SIZE);
    fprintf(stderr,
            "[BOOT] tc udp listen on 127.0.0.1:%d (APID 0x200)\n",
            LOCAL_TC_PORT);

    signal(SIGINT,  on_sigint);
    signal(SIGTERM, on_sigint);

    StateMachine sm;
    PhysicsState phys;
    uint8_t      tm_buf[APOGEE_HK_PACKET_SIZE];
    uint8_t      ack_buf[APOGEE_ACK_FAIL_SIZE];
    uint8_t      tc_buf[TC_BUF_SIZE];
    sm_init(&sm);
    physics_init(&phys);

    fprintf(stderr, "[BOOT] entering main loop @ 10 Hz\n");
    while (g_running) {
        sm_tick(&sm);

        /* --- Receive any pending telecommand (one per tick is enough). --- */
        ssize_t n = net_recv_nonblock(tc_buf, sizeof tc_buf);
        if (n > 0) {
            uint16_t seq = 0;
            CommandOutcome outcome = command_handle(tc_buf, (size_t)n, &sm, &seq);
            fprintf(stderr, "[TC] seq=%u outcome=%s\n",
                    (unsigned)seq, command_outcome_name(outcome));

            bool ok = (outcome == CMD_OUTCOME_OK || outcome == CMD_OUTCOME_REBOOT);
            size_t ack_len = telemetry_compose_ack(ack_buf, sizeof ack_buf,
                                                   ok, (uint8_t)outcome,
                                                   APOGEE_APID_TC, seq);
            if (ack_len > 0) (void)net_send(ack_buf, ack_len);

            if (outcome == CMD_OUTCOME_REBOOT) {
                fprintf(stderr, "[TC] REBOOT — re-init state\n");
                sm_init(&sm);
                physics_init(&phys);
                command_reset_replay_state();
            }
        }

        /* --- Physics + downlink TM. --- */
        physics_tick(&phys, sm.mode, DT_SEC);

        size_t pkt_len = telemetry_compose_hk(tm_buf, sizeof tm_buf,
                                              sm.mode,
                                              sm.total_ticks,
                                              phys.lat_e7,
                                              phys.lon_e7,
                                              phys.alt_m,
                                              phys.battery_mv,
                                              phys.roll10, phys.pitch10, phys.yaw10);
        if (pkt_len > 0) (void)net_send(tm_buf, pkt_len);

        sleep_ms(TICK_PERIOD_MS);
    }

    fprintf(stderr, "[SHUTDOWN] mode=%s ticks=%u\n",
            sm_mode_name(sm.mode), sm.total_ticks);
    net_close();
    return EXIT_SUCCESS;
}
