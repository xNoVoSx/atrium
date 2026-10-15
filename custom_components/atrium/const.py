"""Constants for Atrium."""

from typing import Final

DOMAIN: Final = "atrium"

PANEL_URL_PATH: Final = "atrium"
PANEL_ELEMENT: Final = "atrium-panel"
PANEL_TITLE: Final = "Atrium"
PANEL_ICON: Final = "mdi:view-dashboard-variant"

STATIC_URL: Final = "/atrium_static"
FRONTEND_DIR: Final = "frontend"
FRONTEND_FILE: Final = "atrium.js"

STORAGE_KEY: Final = "atrium.settings"
STORAGE_VERSION: Final = 1
STORAGE_SAVE_DELAY: Final = 1  # seconds

SIGNAL_SETTINGS_UPDATED: Final = "atrium_settings_updated"
