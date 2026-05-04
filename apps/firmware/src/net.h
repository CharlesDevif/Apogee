#ifndef APOGEE_NET_H
#define APOGEE_NET_H

#include <stddef.h>
#include <sys/types.h>

/* Initialize a UDP endpoint bound to `local_port` for receiving telecommands,
 * and pre-configured to send telemetry to `remote_host:remote_port`.
 * Returns 0 on success, -1 on error (errno set, message logged). */
int net_init(const char *remote_host, int remote_port, int local_port);

/* Send a datagram to the configured backend. Returns 0 on success. */
int net_send(const void *data, size_t len);

/* Non-blocking receive. Returns:
 *   > 0  : number of bytes received
 *   = 0  : no datagram pending
 *   < 0  : error (errno set) */
ssize_t net_recv_nonblock(void *buf, size_t max_len);

void net_close(void);

#endif /* APOGEE_NET_H */
