import threading

import pytest

from app.config import Settings, parse_rate
from app.rate_limit import RateLimiter, Rule, make_rule


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture()
def clock():
    return FakeClock()


# --- the sliding window ------------------------------------------------------------------------


def test_requests_up_to_the_limit_pass_and_the_next_is_refused_with_a_wait_time(clock):
    limiter = RateLimiter(clock)
    rule = Rule("feedback", "42", limit=3, window=10)

    for _ in range(3):
        assert limiter.check(rule) is None
        clock.now += 1  # hits at t=0, 1, 2

    clock.now = 1009.5  # the first hit (t=0) leaves the window at t=10
    assert limiter.check(rule) == 1  # 0.5 s, rounded up to a whole second

    clock.now = 1010.0  # now the first hit has expired
    assert limiter.check(rule) is None


def test_the_window_slides_instead_of_resetting_all_at_once(clock):
    limiter = RateLimiter(clock)
    rule = Rule("x", "k", limit=2, window=10)

    assert limiter.check(rule) is None  # t=0
    clock.now += 6
    assert limiter.check(rule) is None  # t=6
    clock.now += 4  # t=10: only the first hit expired
    assert limiter.check(rule) is None  # takes the free place
    assert limiter.check(rule) is not None  # t=6 and t=10 are still inside the window


def test_a_refused_request_is_not_recorded(clock):
    limiter = RateLimiter(clock)
    rule = Rule("x", "k", limit=1, window=10)
    assert limiter.check(rule) is None
    for _ in range(5):
        assert limiter.check(rule) is not None  # hammering does not extend the wait
    clock.now += 10
    assert limiter.check(rule) is None


def test_keys_and_scopes_are_independent(clock):
    limiter = RateLimiter(clock)
    assert limiter.check(Rule("feedback", "1", 1, 60)) is None
    assert limiter.check(Rule("feedback", "1", 1, 60)) is not None
    assert limiter.check(Rule("feedback", "2", 1, 60)) is None  # another user
    assert limiter.check(Rule("upload", "1", 1, 60)) is None  # another scope


# --- several rules at once ---------------------------------------------------------------------


def test_a_request_refused_by_one_rule_does_not_use_up_the_other(clock):
    limiter = RateLimiter(clock)
    per_user = Rule("feedback", "7", limit=2, window=3600)
    shared = Rule("feedback-global", "all", limit=1, window=3600)

    assert limiter.check(per_user, shared) is None  # records on both
    assert limiter.check(per_user, shared) is not None  # the shared budget is used up

    # If that refused call had been recorded on the per-user rule, the next two calls could
    # not both pass: the user's budget of 2 would already be gone.
    assert limiter.check(per_user) is None
    assert limiter.check(per_user) is not None


def test_the_wait_is_the_longest_of_the_blocking_rules(clock):
    limiter = RateLimiter(clock)
    short = Rule("a", "k", limit=1, window=10)
    long = Rule("b", "k", limit=1, window=100)
    assert limiter.check(short, long) is None
    assert limiter.check(short, long) == 100


def test_a_limit_of_zero_blocks_everything(clock):
    assert RateLimiter(clock).check(Rule("x", "k", limit=0, window=60)) == 60


# --- housekeeping and threads ------------------------------------------------------------------


def test_expired_keys_are_swept_so_one_off_clients_do_not_pile_up(clock):
    limiter = RateLimiter(clock)
    for i in range(999):
        limiter.check(Rule("register", f"ip-{i}", limit=5, window=60))
    assert limiter.tracked_keys() == 999

    clock.now += 120  # every window has passed
    limiter.check(Rule("register", "latest", limit=5, window=60))  # call number 1000: sweeps
    assert limiter.tracked_keys() == 1


def test_concurrent_requests_never_exceed_the_limit(clock):
    limiter = RateLimiter(clock)  # the clock never moves: nothing expires
    rule = Rule("feedback", "42", limit=100, window=3600)
    allowed: list[int] = []

    def worker() -> None:
        count = sum(1 for _ in range(50) if limiter.check(rule) is None)
        allowed.append(count)

    threads = [threading.Thread(target=worker) for _ in range(8)]  # 400 attempts in all
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(allowed) == 100


# --- rate strings and settings -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("10/hour", (10, 3600)),
        (" 5 / Minute ", (5, 60)),
        ("1/second", (1, 1)),
        ("200/day", (200, 86400)),
    ],
)
def test_parse_rate(text, expected):
    assert parse_rate(text) == expected


@pytest.mark.parametrize("text", ["10", "x/hour", "10/week", "0/hour", "-1/hour", "10/hour/day", ""])
def test_parse_rate_rejects_nonsense(text):
    with pytest.raises(ValueError):
        parse_rate(text)


def test_make_rule_turns_a_setting_into_a_rule_and_empty_means_off():
    assert make_rule("feedback", 42, "10/hour") == Rule("feedback", "42", 10, 3600)
    assert make_rule("feedback-global", "all", "") is None
    assert make_rule("feedback-global", "all", "  ") is None


def test_a_typo_in_a_rate_setting_fails_at_startup():
    with pytest.raises(ValueError, match="invalid rate"):
        Settings(_env_file=None, rate_limit_login="lots")
    with pytest.raises(ValueError, match="invalid rate"):
        Settings(_env_file=None, rate_limit_upload="")  # only the global feedback cap may be empty


def test_the_global_feedback_cap_can_be_switched_off_with_an_empty_value():
    assert Settings(_env_file=None, rate_limit_feedback_global="").rate_limit_feedback_global == ""
