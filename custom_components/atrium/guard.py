"""Keep thermostats under the household's control.

Admins set rules per thermostat in the shared layout (``layout["guards"]``):

- ``lock`` / ``lockMode``: a child lock (``switch`` or ``lock`` entity) that is
  switched back on at once (``always``) or after ``relockMinutes``
  (``relock``) whenever someone releases it.
- ``keepMode``: when the thermostat is switched to its own program (HVAC mode
  ``auto`` or a schedule preset), the previous mode is restored.

Runs in Home Assistant, so it works while no dashboard is open.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
import logging
import time
from typing import Any

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import (
    CALLBACK_TYPE,
    Event,
    EventStateChangedData,
    HomeAssistant,
    State,
    callback,
)
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_call_later, async_track_state_change_event

from .const import DOMAIN, SIGNAL_SETTINGS_UPDATED
from .store import AtriumStore

_LOGGER = logging.getLogger(__name__)

EVENT_GUARD = "atrium_guard"
# Logbook's event; fired directly so Atrium does not depend on the logbook.
EVENT_LOGBOOK_ENTRY = "logbook_entry"

# The thermostat's own program, as opposed to the target the household sets.
SELF_HVAC_MODES = frozenset({"auto"})
SELF_PRESETS = frozenset({"auto", "schedule", "program", "programme"})

DEFAULT_RELOCK_MINUTES = 10
MAX_RELOCK_MINUTES = 24 * 60
# A device or automation that keeps fighting back must not cause a loop.
MAX_CORRECTIONS = 5
CORRECTION_WINDOW = 600  # seconds

_IGNORED = (STATE_UNAVAILABLE, STATE_UNKNOWN)

_MESSAGES = {
    "en": {
        "locked": "switched the child lock back on",
        "mode": "set the thermostat back from its own program to {mode}",
        "preset": "set the thermostat back from its own program to {mode}",
    },
    "de": {
        "locked": "hat die Kindersicherung wieder eingeschaltet",
        "mode": "hat das Thermostat vom eigenen Programm zurück auf {mode} gestellt",
        "preset": "hat das Thermostat vom eigenen Programm zurück auf {mode} gestellt",
    },
}


@dataclass(frozen=True)
class GuardRule:
    """What to enforce for one thermostat."""

    climate: str
    lock: str | None
    lock_mode: str | None  # "always" | "relock" | None
    relock_minutes: int
    keep_mode: bool


def parse_rules(raw: Any) -> dict[str, GuardRule]:
    """Rules from the layout; anything malformed is skipped, never trusted."""
    rules: dict[str, GuardRule] = {}
    if not isinstance(raw, dict):
        return rules
    for climate, cfg in raw.items():
        if (
            not isinstance(climate, str)
            or not climate.startswith("climate.")
            or not isinstance(cfg, dict)
        ):
            continue
        lock = cfg.get("lock")
        if not isinstance(lock, str) or lock.split(".", 1)[0] not in ("switch", "lock"):
            lock = None
        lock_mode = cfg.get("lockMode")
        if lock_mode not in ("always", "relock") or lock is None:
            lock_mode = None
        minutes = cfg.get("relockMinutes", DEFAULT_RELOCK_MINUTES)
        if not isinstance(minutes, int | float) or isinstance(minutes, bool):
            minutes = DEFAULT_RELOCK_MINUTES
        minutes = int(min(max(minutes, 1), MAX_RELOCK_MINUTES))
        keep_mode = cfg.get("keepMode") is True
        if lock_mode or keep_mode:
            rules[climate] = GuardRule(climate, lock, lock_mode, minutes, keep_mode)
    return rules


def is_unlocked(state: State | None) -> bool:
    """Whether a child lock entity is released."""
    if state is None:
        return False
    if state.domain == "lock":
        return state.state in ("unlocked", "open")
    return state.state == "off"


class HeatingGuard:
    """Watches child locks and thermostat modes and puts them back."""

    def __init__(self, hass: HomeAssistant, store: AtriumStore) -> None:
        self._hass = hass
        self._store = store
        self._rules: dict[str, GuardRule] = {}
        self._unsubs: list[CALLBACK_TYPE] = []
        self._timers: dict[str, CALLBACK_TYPE] = {}
        self._corrections: dict[str, deque[float]] = {}
        self._warned: set[str] = set()
        self._stop_settings: Callable[[], None] | None = None

    @property
    def rules(self) -> dict[str, GuardRule]:
        """The rules in force."""
        return dict(self._rules)

    @callback
    def async_start(self) -> None:
        """Apply the stored rules and follow later changes."""
        self._stop_settings = async_dispatcher_connect(
            self._hass, SIGNAL_SETTINGS_UPDATED, self._settings_changed
        )
        self._apply(self._store.layout.get("guards"))

    @callback
    def async_stop(self) -> None:
        """Stop watching (entry unloaded)."""
        if self._stop_settings:
            self._stop_settings()
            self._stop_settings = None
        self._clear()

    @callback
    def _settings_changed(self, user_id: str | None) -> None:
        if user_id is None:
            self._apply(self._store.layout.get("guards"))

    @callback
    def _clear(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        for cancel in self._timers.values():
            cancel()
        self._timers.clear()

    @callback
    def _apply(self, raw: Any) -> None:
        rules = parse_rules(raw)
        if rules == self._rules and self._unsubs:
            return
        self._clear()
        self._rules = rules
        locks = {r.lock: r for r in rules.values() if r.lock and r.lock_mode}
        modes = [r.climate for r in rules.values() if r.keep_mode]
        if locks:
            self._unsubs.append(
                async_track_state_change_event(self._hass, list(locks), self._lock_changed)
            )
        if modes:
            self._unsubs.append(
                async_track_state_change_event(self._hass, modes, self._mode_changed)
            )
        # Enforce what is already wrong now, e.g. a lock released while HA was down.
        for lock, rule in locks.items():
            if is_unlocked(self._hass.states.get(lock)):
                self._unlocked(rule)

    # ---- child lock ----

    def _rule_for_lock(self, entity_id: str) -> GuardRule | None:
        return next((r for r in self._rules.values() if r.lock == entity_id and r.lock_mode), None)

    @callback
    def _lock_changed(self, event: Event[EventStateChangedData]) -> None:
        rule = self._rule_for_lock(event.data["entity_id"])
        new = event.data["new_state"]
        if rule is None or new is None or new.state in _IGNORED:
            return
        if is_unlocked(new):
            self._unlocked(rule)
        elif cancel := self._timers.pop(rule.lock or "", None):
            cancel()

    @callback
    def _unlocked(self, rule: GuardRule) -> None:
        lock = rule.lock
        if lock is None:
            return
        if rule.lock_mode == "always":
            self._relock(lock)
            return
        if lock in self._timers:
            return

        @callback
        def later(_now: Any) -> None:
            self._timers.pop(lock, None)
            if is_unlocked(self._hass.states.get(lock)):
                self._relock(lock)

        self._timers[lock] = async_call_later(self._hass, rule.relock_minutes * 60, later)

    @callback
    def _relock(self, lock: str) -> None:
        if not self._allowed(lock):
            return
        domain = lock.split(".", 1)[0]
        service = "lock" if domain == "lock" else "turn_on"
        self._hass.async_create_task(
            self._hass.services.async_call(domain, service, {"entity_id": lock}, blocking=False)
        )
        self._report(lock, "locked")

    # ---- thermostat mode ----

    @callback
    def _mode_changed(self, event: Event[EventStateChangedData]) -> None:
        entity_id = event.data["entity_id"]
        old, new = event.data["old_state"], event.data["new_state"]
        rule = self._rules.get(entity_id)
        if rule is None or not rule.keep_mode or old is None or new is None:
            return
        if old.state in _IGNORED or new.state in _IGNORED:
            return
        if new.state in SELF_HVAC_MODES and old.state not in SELF_HVAC_MODES:
            if self._allowed(entity_id):
                self._call_climate(entity_id, "set_hvac_mode", {"hvac_mode": old.state})
                self._report(entity_id, "mode", old.state)
            return
        new_preset = new.attributes.get("preset_mode")
        old_preset = old.attributes.get("preset_mode")
        if (
            new_preset in SELF_PRESETS
            and old_preset not in SELF_PRESETS
            and isinstance(old_preset, str)
            and self._allowed(entity_id)
        ):
            self._call_climate(entity_id, "set_preset_mode", {"preset_mode": old_preset})
            self._report(entity_id, "preset", old_preset)

    @callback
    def _call_climate(self, entity_id: str, service: str, data: dict[str, Any]) -> None:
        self._hass.async_create_task(
            self._hass.services.async_call(
                "climate", service, {"entity_id": entity_id, **data}, blocking=False
            )
        )

    # ---- shared ----

    def _allowed(self, entity_id: str) -> bool:
        """At most MAX_CORRECTIONS per entity within CORRECTION_WINDOW."""
        now = time.monotonic()
        recent = self._corrections.setdefault(entity_id, deque())
        while recent and now - recent[0] > CORRECTION_WINDOW:
            recent.popleft()
        if len(recent) >= MAX_CORRECTIONS:
            if entity_id not in self._warned:
                self._warned.add(entity_id)
                _LOGGER.warning(
                    "%s keeps changing back; Atrium pauses correcting it for a few minutes",
                    entity_id,
                )
            return False
        self._warned.discard(entity_id)
        recent.append(now)
        return True

    @callback
    def _report(self, entity_id: str, action: str, mode: str | None = None) -> None:
        lang = "de" if self._hass.config.language.startswith("de") else "en"
        message = _MESSAGES[lang][action].format(mode=mode or "")
        self._hass.bus.async_fire(
            EVENT_LOGBOOK_ENTRY,
            {"name": "Atrium", "message": message, "domain": DOMAIN, "entity_id": entity_id},
        )
        self._hass.bus.async_fire(
            EVENT_GUARD, {"entity_id": entity_id, "action": action, "mode": mode}
        )
