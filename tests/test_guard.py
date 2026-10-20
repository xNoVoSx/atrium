"""Tests for the thermostat guard (child lock, thermostat's own program)."""

from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.atrium.guard import EVENT_GUARD, parse_rules

CLIMATE = "climate.kids"
LOCK = "switch.kids_child_lock"


def _set_guards(entry: MockConfigEntry, guards: dict[str, Any]) -> None:
    entry.runtime_data.store.async_set_layout({"guards": guards})


async def test_parse_rules_skips_malformed() -> None:
    """Only well-formed rules for climate entities survive."""
    rules = parse_rules(
        {
            CLIMATE: {"lock": LOCK, "lockMode": "relock", "relockMinutes": 99999, "keepMode": True},
            "light.x": {"keepMode": True},
            "climate.bad_lock": {"lock": "light.y", "lockMode": "always"},
            "climate.nothing": {},
            "climate.str": "x",
        }
    )
    assert list(rules) == [CLIMATE]
    assert rules[CLIMATE].relock_minutes == 24 * 60
    assert parse_rules(None) == {}


async def test_lock_always(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """A released child lock is switched on again at once."""
    calls = async_mock_service(hass, "switch", "turn_on")
    events = async_capture_events(hass, EVENT_GUARD)
    hass.states.async_set(LOCK, "on")
    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "always"}})
    await hass.async_block_till_done()
    assert not calls

    hass.states.async_set(LOCK, "off")
    await hass.async_block_till_done()
    assert [c.data["entity_id"] for c in calls] == [LOCK]
    assert events[0].data["action"] == "locked"

    # unavailable is not a release
    hass.states.async_set(LOCK, "unavailable")
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_lock_released_while_away(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """A lock that is already off when the rule is set is locked right away."""
    calls = async_mock_service(hass, "switch", "turn_on")
    hass.states.async_set(LOCK, "off")
    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "always"}})
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_relock_after_minutes(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """With relock, the lock goes back on after the set minutes, not before."""
    calls = async_mock_service(hass, "switch", "turn_on")
    hass.states.async_set(LOCK, "on")
    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "relock", "relockMinutes": 5}})
    await hass.async_block_till_done()

    hass.states.async_set(LOCK, "off")
    await hass.async_block_till_done()
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=4))
    await hass.async_block_till_done()
    assert not calls
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=6))
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_relock_cancelled_when_locked(
    hass: HomeAssistant, setup_atrium: MockConfigEntry
) -> None:
    """Locking by hand before the time is up cancels the timer."""
    calls = async_mock_service(hass, "switch", "turn_on")
    hass.states.async_set(LOCK, "on")
    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "relock", "relockMinutes": 5}})
    await hass.async_block_till_done()
    hass.states.async_set(LOCK, "off")
    await hass.async_block_till_done()
    hass.states.async_set(LOCK, "on")
    await hass.async_block_till_done()
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=10))
    await hass.async_block_till_done()
    assert not calls


async def test_lock_entity(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """Child locks exposed as lock entities are locked with lock.lock."""
    calls = async_mock_service(hass, "lock", "lock")
    hass.states.async_set("lock.kids", "locked")
    _set_guards(setup_atrium, {CLIMATE: {"lock": "lock.kids", "lockMode": "always"}})
    await hass.async_block_till_done()
    hass.states.async_set("lock.kids", "unlocked")
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_keep_mode(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """Switching to the thermostat's own program restores the previous mode."""
    calls = async_mock_service(hass, "climate", "set_hvac_mode")
    hass.states.async_set(CLIMATE, "heat")
    _set_guards(setup_atrium, {CLIMATE: {"keepMode": True}})
    await hass.async_block_till_done()

    hass.states.async_set(CLIMATE, "auto")
    await hass.async_block_till_done()
    assert calls[0].data == {"entity_id": CLIMATE, "hvac_mode": "heat"}

    # off is the household's choice (e.g. heating season over): left alone
    hass.states.async_set(CLIMATE, "off")
    await hass.async_block_till_done()
    assert len(calls) == 1


async def test_keep_preset(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """A schedule preset is replaced by the preset that was set before."""
    calls = async_mock_service(hass, "climate", "set_preset_mode")
    hass.states.async_set(CLIMATE, "heat", {"preset_mode": "manual"})
    _set_guards(setup_atrium, {CLIMATE: {"keepMode": True}})
    await hass.async_block_till_done()
    hass.states.async_set(CLIMATE, "heat", {"preset_mode": "auto"})
    await hass.async_block_till_done()
    assert calls[0].data == {"entity_id": CLIMATE, "preset_mode": "manual"}


async def test_no_endless_fight(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """Something that keeps unlocking is corrected only a few times."""
    calls = async_mock_service(hass, "switch", "turn_on")
    hass.states.async_set(LOCK, "on")
    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "always"}})
    await hass.async_block_till_done()
    for _ in range(10):
        hass.states.async_set(LOCK, "off")
        await hass.async_block_till_done()
        hass.states.async_set(LOCK, "on")
        await hass.async_block_till_done()
    assert len(calls) == 5


async def test_rules_removed(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """Without rules nothing is touched; unloading stops the guard."""
    calls = async_mock_service(hass, "switch", "turn_on")
    hass.states.async_set(LOCK, "on")
    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "always"}})
    _set_guards(setup_atrium, {})
    await hass.async_block_till_done()
    hass.states.async_set(LOCK, "off")
    await hass.async_block_till_done()
    assert not calls

    _set_guards(setup_atrium, {CLIMATE: {"lock": LOCK, "lockMode": "always"}})
    assert await hass.config_entries.async_unload(setup_atrium.entry_id)
    hass.states.async_set(LOCK, "on")
    hass.states.async_set(LOCK, "off")
    await hass.async_block_till_done()
    assert len(calls) == 1  # only the immediate lock when the rule was set again
