# Aerona YunoHost portal tile icon

The `assets/aerona-portal-icon.png` asset is a 512 × 512 version of the dashboard's water-drop-plus icon, designed for the YunoHost user-portal tile.

## One-off installation

After pulling the current repository on the YunoHost server, copy the PNG to YunoHost's application-logo directory:

```bash
cd ~/aerona-webapp
git pull
sudo cp assets/aerona-portal-icon.png /usr/share/yunohost/applogos/aerona-portal-icon.png
```

Locate the portal configuration that contains the Redirect tile label:

```bash
sudo grep -R -n -C 5 'Aerona heat pump' /etc/yunohost/portal/
```

Open the matching JSON file, find the `Aerona Heat Pump` tile, and replace its existing `logo` URL with:

```json
"logo": "/yunohost/sso/applogos/aerona-portal-icon.png"
```

Refresh the YunoHost portal in the browser. The icon change does not alter the Aerona app, its Docker container or its reverse proxy.

## Maintenance note

YunoHost can regenerate portal JSON after application changes. If the icon returns to the Redirect default after a YunoHost app installation or upgrade, repeat the JSON edit. A persistent hook can be added later if this becomes bothersome.
