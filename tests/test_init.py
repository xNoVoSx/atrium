"""Tests for setup and unload."""

from pathlib import Path

from homeassistant.components.frontend import DATA_PANELS
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.atrium.const import DOMAIN, PANEL_URL_PATH


async def test_setup_registers_panel(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """The panel is in the sidebar and loads the bundle by content hash."""
    assert setup_atrium.state is ConfigEntryState.LOADED
    panel = hass.data[DATA_PANELS][PANEL_URL_PATH]
    assert panel.component_name == "custom"
    custom = panel.config["_panel_custom"]
    assert custom["name"] == "atrium-panel"
    assert (
        custom["module_url"]
        == f"/atrium_static/atrium.js?v={setup_atrium.runtime_data.frontend_hash}"
    )
    assert panel.require_admin is False


async def test_unload_removes_panel(hass: HomeAssistant, setup_atrium: MockConfigEntry) -> None:
    """Unloading takes the panel out of the sidebar."""
    assert await hass.config_entries.async_unload(setup_atrium.entry_id)
    await hass.async_block_till_done()
    assert setup_atrium.state is ConfigEntryState.NOT_LOADED
    assert PANEL_URL_PATH not in hass.data[DATA_PANELS]


async def test_hash_follows_file_content(
    hass: HomeAssistant, setup_atrium: MockConfigEntry, frontend_dir: Path
) -> None:
    """A changed bundle gets a new URL after reloading the entry."""
    old = setup_atrium.runtime_data.frontend_hash
    (frontend_dir / "atrium.js").write_text("console.log('new build');\n")
    assert await hass.config_entries.async_reload(setup_atrium.entry_id)
    await hass.async_block_till_done()
    assert setup_atrium.runtime_data.frontend_hash != old


async def test_missing_bundle_fails_setup(hass: HomeAssistant, frontend_dir: Path) -> None:
    """A source checkout without a build does not load half-way."""
    (frontend_dir / "atrium.js").unlink()
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_ERROR
    assert PANEL_URL_PATH not in hass.data.get(DATA_PANELS, {})
