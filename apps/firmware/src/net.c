#include "net.h"

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>

static int sock_fd = -1;
static struct sockaddr_in backend_addr;

int net_init(const char *remote_host, int remote_port, int local_port) {
    sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock_fd < 0) {
        perror("[NET] socket");
        return -1;
    }

    /* Bind a local port so we can also receive telecommands. */
    struct sockaddr_in local_addr;
    memset(&local_addr, 0, sizeof local_addr);
    local_addr.sin_family      = AF_INET;
    local_addr.sin_port        = htons((uint16_t)local_port);
    local_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(sock_fd, (const struct sockaddr *)&local_addr,
             sizeof local_addr) < 0) {
        perror("[NET] bind");
        close(sock_fd);
        sock_fd = -1;
        return -1;
    }

    /* Make recvfrom non-blocking so the main loop can poll without stalling. */
    int flags = fcntl(sock_fd, F_GETFL, 0);
    if (flags < 0 || fcntl(sock_fd, F_SETFL, flags | O_NONBLOCK) < 0) {
        perror("[NET] fcntl O_NONBLOCK");
        close(sock_fd);
        sock_fd = -1;
        return -1;
    }

    memset(&backend_addr, 0, sizeof backend_addr);
    backend_addr.sin_family = AF_INET;
    backend_addr.sin_port   = htons((uint16_t)remote_port);
    if (inet_pton(AF_INET, remote_host, &backend_addr.sin_addr) <= 0) {
        perror("[NET] inet_pton");
        close(sock_fd);
        sock_fd = -1;
        return -1;
    }
    return 0;
}

int net_send(const void *data, size_t len) {
    if (sock_fd < 0) return -1;
    ssize_t sent = sendto(sock_fd, data, len, 0,
                          (const struct sockaddr *)&backend_addr,
                          sizeof backend_addr);
    if (sent < 0) {
        perror("[NET] sendto");
        return -1;
    }
    return 0;
}

ssize_t net_recv_nonblock(void *buf, size_t max_len) {
    if (sock_fd < 0) return -1;
    ssize_t n = recvfrom(sock_fd, buf, max_len, 0, NULL, NULL);
    if (n < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) return 0;
        perror("[NET] recvfrom");
        return -1;
    }
    return n;
}

void net_close(void) {
    if (sock_fd >= 0) {
        close(sock_fd);
        sock_fd = -1;
    }
}
