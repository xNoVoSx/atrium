"""Atrium: a modular dashboard panel for Home Assistant."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.loader import async_get_integration

from . import websocket
from .const import (
    DOMAIN,
    FRONTEND_DIR,
    FRONTEND_FILE,
    PANEL_ELEMENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL,
)
from .guard import HeatingGuard
from .store import AtriumStore

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

FRONTEND_PATH = Path(__file__).parent / FRONTEND_DIR


@dataclass
class AtriumData:
    """Runtime data of the loaded entry."""

    store: AtriumStore
    guard: HeatingGuard
    version: str
    frontend_hash: str


type AtriumConfigEntry = ConfigEntry[AtriumData]


def _file_hash(path: Path) -> str:
    """Short content hash of the frontend file; part of its URL to bust caches."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register what must exist once per Home Assistant run."""
    websocket.async_register(hass)
    # Static paths cannot be unregistered, so this lives outside the entry.
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(FRONTEND_PATH), cache_headers=False)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: AtriumConfigEntry) -> bool:
    """Load settings and add the panel to the sidebar."""
    store = AtriumStore(hass)
    await store.async_load()
    integration = await async_get_integration(hass, DOMAIN)
    try:
        frontend_hash = await hass.async_add_executor_job(_file_hash, FRONTEND_PATH / FRONTEND_FILE)
    except FileNotFoundError as err:
        # Happens with a source checkout that was never built.
        raise ConfigEntryError(
            f"Frontend file {FRONTEND_DIR}/{FRONTEND_FILE} is missing; "
            "install a release or build the frontend"
        ) from err
    guard = HeatingGuard(hass, store)
    entry.runtime_data = AtriumData(
        store=store, guard=guard, version=str(integration.version), frontend_hash=frontend_hash
    )
    guard.async_start()
    entry.async_on_unload(guard.async_stop)

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL}/{FRONTEND_FILE}?v={frontend_hash}",
        embed_iframe=False,
        require_admin=False,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: AtriumConfigEntry) -> bool:
    """Remove the panel; settings stay stored."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return True


async def async_remove_entry(hass: HomeAssistant, entry: AtriumConfigEntry) -> None:
    """Delete stored settings when the integration is removed."""
    await AtriumStore(hass).async_remove()
