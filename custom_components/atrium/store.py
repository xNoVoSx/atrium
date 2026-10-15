"""Persistent settings for Atrium, kept in Home Assistant's storage."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, TypedDict

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .const import SIGNAL_SETTINGS_UPDATED, STORAGE_KEY, STORAGE_SAVE_DELAY, STORAGE_VERSION


class StoredData(TypedDict):
    """Shape of the stored document."""

    # Shared by everyone, changed by admins: overrides of the automatic layout.
    layout: dict[str, Any]
    # Per user, keyed by user id: personal preferences such as favorites.
    users: dict[str, dict[str, Any]]


def _empty() -> StoredData:
    return {"layout": {}, "users": {}}


class AtriumStore:
    """Loads, changes and saves the settings, and announces every change."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[StoredData] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: StoredData = _empty()

    async def async_load(self) -> None:
        """Read the stored document, or start empty."""
        if (stored := await self._store.async_load()) is not None:
            self._data = {
                "layout": stored.get("layout", {}),
                "users": stored.get("users", {}),
            }

    @property
    def layout(self) -> dict[str, Any]:
        """A copy of the shared layout overrides."""
        return deepcopy(self._data["layout"])

    def user_settings(self, user_id: str) -> dict[str, Any]:
        """A copy of one user's preferences."""
        return deepcopy(self._data["users"].get(user_id, {}))

    @callback
    def async_set_layout(self, layout: dict[str, Any]) -> None:
        """Replace the shared layout overrides."""
        self._data["layout"] = deepcopy(layout)
        self._changed(user_id=None)

    @callback
    def async_set_user_settings(self, user_id: str, settings: dict[str, Any]) -> None:
        """Replace one user's preferences."""
        self._data["users"][user_id] = deepcopy(settings)
        self._changed(user_id=user_id)

    async def async_remove(self) -> None:
        """Delete the stored document (integration removed)."""
        await self._store.async_remove()

    @callback
    def _changed(self, user_id: str | None) -> None:
        self._store.async_delay_save(lambda: self._data, STORAGE_SAVE_DELAY)
        async_dispatcher_send(self._hass, SIGNAL_SETTINGS_UPDATED, user_id)
