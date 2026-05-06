CC      ?= gcc
CFLAGS  := -Wall -Wextra -std=c11

hello: hello.c
	$(CC) $(CFLAGS) hello.c -o hello

.PHONY: clean run
run: hello
	./hello

clean:
	rm -f hello
