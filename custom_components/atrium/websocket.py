"""WebSocket API used by the Atrium panel."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
import voluptuous as vol

from .const import DOMAIN, SIGNAL_SETTINGS_UPDATED

if TYPE_CHECKING:
    from . import AtriumData

ERR_NOT_LOADED = "not_loaded"


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the commands; they stay registered for the lifetime of HA."""
    websocket_api.async_register_command(hass, ws_info)
    websocket_api.async_register_command(hass, ws_settings_get)
    websocket_api.async_register_command(hass, ws_settings_set_layout)
    websocket_api.async_register_command(hass, ws_settings_set_user)
    websocket_api.async_register_command(hass, ws_settings_subscribe)


def _data(hass: HomeAssistant) -> AtriumData | None:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0].runtime_data if entries else None


def _settings_payload(data: AtriumData, user_id: str) -> dict[str, Any]:
    return {"layout": data.store.layout, "user": data.store.user_settings(user_id)}


@websocket_api.websocket_command({vol.Required("type"): "atrium/info"})
@callback
def ws_info(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Version of the integration and of the served frontend file."""
    if (data := _data(hass)) is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Atrium is not loaded")
        return
    connection.send_result(
        msg["id"], {"version": data.version, "frontend_hash": data.frontend_hash}
    )


@websocket_api.websocket_command({vol.Required("type"): "atrium/settings/get"})
@callback
def ws_settings_get(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Shared layout plus the calling user's own settings."""
    if (data := _data(hass)) is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Atrium is not loaded")
        return
    connection.send_result(msg["id"], _settings_payload(data, connection.user.id))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "atrium/settings/set_layout", vol.Required("layout"): dict}
)
@callback
def ws_settings_set_layout(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Replace the shared layout overrides (admins only)."""
    if (data := _data(hass)) is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Atrium is not loaded")
        return
    data.store.async_set_layout(msg["layout"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "atrium/settings/set_user", vol.Required("settings"): dict}
)
@callback
def ws_settings_set_user(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Replace the calling user's own settings."""
    if (data := _data(hass)) is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Atrium is not loaded")
        return
    data.store.async_set_user_settings(connection.user.id, msg["settings"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): "atrium/settings/subscribe"})
@callback
def ws_settings_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Push the settings now and after every change that concerns this user."""
    if (data := _data(hass)) is None:
        connection.send_error(msg["id"], ERR_NOT_LOADED, "Atrium is not loaded")
        return
    user_id = connection.user.id

    @callback
    def forward(changed_user: str | None) -> None:
        # Layout changes concern everyone; user changes only their owner.
        if changed_user is not None and changed_user != user_id:
            return
        if (current := _data(hass)) is not None:
            connection.send_event(msg["id"], _settings_payload(current, user_id))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_SETTINGS_UPDATED, forward
    )
    connection.send_result(msg["id"])
    connection.send_event(msg["id"], _settings_payload(data, user_id))
