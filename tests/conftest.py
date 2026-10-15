"""Shared fixtures."""

from collections.abc import Generator
from pathlib import Path
from unittest.mock import patch

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.atrium.const import DOMAIN

FAKE_BUNDLE = "console.log('atrium test bundle');\n"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Let Home Assistant load integrations from custom_components/."""


@pytest.fixture(autouse=True)
def frontend_dir(tmp_path: Path) -> Generator[Path]:
    """Serve a stand-in bundle so tests do not depend on a frontend build."""
    directory = tmp_path / "frontend"
    directory.mkdir()
    (directory / "atrium.js").write_text(FAKE_BUNDLE)
    with patch("custom_components.atrium.FRONTEND_PATH", directory):
        yield directory


@pytest.fixture
async def setup_atrium(hass: HomeAssistant) -> MockConfigEntry:
    """A loaded Atrium entry."""
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="Atrium")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry
