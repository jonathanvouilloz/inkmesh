#!/usr/bin/env bash
# Print the current quick tunnel URL (phase A); it changes at every tunnel restart.
journalctl --user -u inkmesh-tunnel -o cat --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
