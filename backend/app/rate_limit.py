"""A small in-memory sliding-window rate limiter.

Why our own and not a library: the app is a single process, limits are per user (most
libraries key on the IP), and about sixty lines are easy to read and to test with a fake clock.

How it works: for every (scope, key) pair, such as ("feedback", "42"), it remembers the times of
the recent hits. A request is allowed when fewer than `limit` hits happened in the last `window`
seconds. When several rules apply to one request (a per-user and a global one), either all of
them record the hit or none does, so a request refused by the global cap does not use up the
user's own budget.

Limitations, on purpose: the state lives in this process only. A restart resets every counter,
and several workers would each count separately. Moving to several workers means moving this
state to Redis (or a database).
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Request

from .config import parse_rate, settings
from .error_handling import ApiError

SWEEP_EVERY_CALLS = 1000


@dataclass(frozen=True)
class Rule:
    scope: str  # what is being limited, e.g. "feedback"
    key: str  # who is limited: a user id, a client IP, or "all"
    limit: int
    window: float  # seconds


class RateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._hits: dict[tuple[str, str], tuple[float, deque[float]]] = {}
        self._calls = 0

    def check(self, *rules: Rule) -> int | None:
        """Record one hit against every rule, unless one of them is used up.

        Returns None when the request is allowed, otherwise the number of seconds after which
        it would be allowed (nothing is recorded in that case)."""
        now = self._clock()
        with self._lock:
            self._calls += 1
            if self._calls % SWEEP_EVERY_CALLS == 0:
                self._sweep(now)

            retry_after = 0.0
            blocked = False
            queues: list[deque[float]] = []
            for rule in rules:
                _, hits = self._hits.get((rule.scope, rule.key), (rule.window, deque()))
                self._hits[(rule.scope, rule.key)] = (rule.window, hits)
                while hits and hits[0] <= now - rule.window:
                    hits.popleft()
                if rule.limit <= 0 or len(hits) >= rule.limit:
                    blocked = True
                    wait = rule.window if not hits else hits[0] + rule.window - now
                    retry_after = max(retry_after, wait)
                queues.append(hits)

            if blocked:
                return max(1, math.ceil(retry_after))
            for hits in queues:
                hits.append(now)
            return None

    def _sweep(self, now: float) -> None:
        """Forget keys whose hits have all expired, so one-off clients do not pile up."""
        for key, (window, hits) in list(self._hits.items()):
            while hits and hits[0] <= now - window:
                hits.popleft()
            if not hits:
                del self._hits[key]

    def tracked_keys(self) -> int:
        with self._lock:
            return len(self._hits)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._calls = 0


limiter = RateLimiter()


def make_rule(scope: str, key: str | int, rate: str) -> Rule | None:
    """Turn a setting such as "10/hour" into a Rule; an empty setting means no limit."""
    if not rate.strip():
        return None
    limit, window = parse_rate(rate)
    return Rule(scope, str(key), limit, window)


def enforce(*rules: Rule | None) -> None:
    """Raise 429 (with Retry-After) when any rule is used up. Does nothing when rate limiting
    is switched off (RATE_LIMIT_ENABLED=false, used by the test suite)."""
    if not settings.rate_limit_enabled:
        return
    active = [rule for rule in rules if rule is not None]
    if not active:
        return
    retry_after = limiter.check(*active)
    if retry_after is not None:
        raise ApiError(
            429,
            "Too many requests. Please try again later.",
            code="rate_limited",
            headers={"Retry-After": str(retry_after)},
        )


def client_ip(request: Request) -> str:
    """The caller's address. Behind a reverse proxy this is the proxy's address unless uvicorn
    runs with --proxy-headers and --forwarded-allow-ips set to the proxy (see the README)."""
    return request.client.host if request.client else "unknown"
