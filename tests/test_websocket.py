"""Tests for the WebSocket API."""

from typing import Any

from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.typing import WebSocketGenerator


async def _call(client: Any, msg_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    await client.send_json({"id": msg_id, **payload})
    return await client.receive_json()


async def test_info(
    hass: HomeAssistant, setup_atrium: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    """Version and frontend hash are reported."""
    client = await hass_ws_client(hass)
    msg = await _call(client, 1, {"type": "atrium/info"})
    assert msg["success"]
    assert msg["result"]["frontend_hash"] == setup_atrium.runtime_data.frontend_hash
    assert msg["result"]["version"] == setup_atrium.runtime_data.version


async def test_settings_roundtrip(
    hass: HomeAssistant, setup_atrium: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    """Layout and user settings are stored and returned."""
    client = await hass_ws_client(hass)
    msg = await _call(client, 1, {"type": "atrium/settings/get"})
    assert msg["result"] == {"layout": {}, "user": {}}

    layout = {"hidden": ["light.kitchen"], "order": {"office": ["light.b", "light.a"]}}
    assert (await _call(client, 2, {"type": "atrium/settings/set_layout", "layout": layout}))[
        "success"
    ]
    assert (
        await _call(
            client, 3, {"type": "atrium/settings/set_user", "settings": {"favorites": ["light.a"]}}
        )
    )["success"]

    msg = await _call(client, 4, {"type": "atrium/settings/get"})
    assert msg["result"] == {"layout": layout, "user": {"favorites": ["light.a"]}}


async def test_layout_needs_admin(
    hass: HomeAssistant,
    setup_atrium: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """Non-admins may change their own settings but not the shared layout."""
    client = await hass_ws_client(hass, hass_read_only_access_token)
    msg = await _call(client, 1, {"type": "atrium/settings/set_layout", "layout": {"hidden": []}})
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"

    msg = await _call(
        client, 2, {"type": "atrium/settings/set_user", "settings": {"favorites": []}}
    )
    assert msg["success"]


async def test_user_settings_are_private(
    hass: HomeAssistant,
    setup_atrium: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """One user's settings are not returned to another user."""
    admin = await hass_ws_client(hass)
    await _call(
        admin, 1, {"type": "atrium/settings/set_user", "settings": {"favorites": ["light.x"]}}
    )

    other = await hass_ws_client(hass, hass_read_only_access_token)
    msg = await _call(other, 1, {"type": "atrium/settings/get"})
    assert msg["result"]["user"] == {}


async def test_subscribe_pushes_changes(
    hass: HomeAssistant, setup_atrium: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    """Subscribers get the current settings and every layout change."""
    client = await hass_ws_client(hass)
    msg = await _call(client, 1, {"type": "atrium/settings/subscribe"})
    assert msg["success"]
    event = await client.receive_json()
    assert event["event"] == {"layout": {}, "user": {}}

    other = await hass_ws_client(hass)
    await _call(other, 1, {"type": "atrium/settings/set_layout", "layout": {"hidden": ["light.a"]}})
    event = await client.receive_json()
    assert event["id"] == 1
    assert event["event"]["layout"] == {"hidden": ["light.a"]}


async def test_not_loaded(
    hass: HomeAssistant, setup_atrium: MockConfigEntry, hass_ws_client: WebSocketGenerator
) -> None:
    """Commands answer with an error while the entry is unloaded."""
    assert await hass.config_entries.async_unload(setup_atrium.entry_id)
    client = await hass_ws_client(hass)
    msg = await _call(client, 1, {"type": "atrium/info"})
    assert not msg["success"]
    assert msg["error"]["code"] == "not_loaded"


async def test_users_list(
    hass: HomeAssistant,
    setup_atrium: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_admin_user: Any,
) -> None:
    """Admins get the people who can log in, without system users."""
    client = await hass_ws_client(hass)
    msg = await _call(client, 1, {"type": "atrium/users"})
    assert msg["success"]
    ids = {u["id"] for u in msg["result"]}
    assert hass_admin_user.id in ids
    assert all(set(u) == {"id", "name", "is_admin"} for u in msg["result"])
    system = [u for u in await hass.auth.async_get_users() if u.system_generated]
    assert not ids & {u.id for u in system}


async def test_users_needs_admin(
    hass: HomeAssistant,
    setup_atrium: MockConfigEntry,
    hass_ws_client: WebSocketGenerator,
    hass_read_only_access_token: str,
) -> None:
    """Non-admins cannot list users."""
    client = await hass_ws_client(hass, hass_read_only_access_token)
    msg = await _call(client, 1, {"type": "atrium/users"})
    assert not msg["success"]
    assert msg["error"]["code"] == "unauthorized"
