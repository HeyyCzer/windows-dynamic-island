"""Dynamic Island client (standard library only).

    from island import notify, activity, remove
    notify("Treino finalizado", subtitle="loss 0.031", icon="check", color="#30D158")
"""
import json
import os
import urllib.parse
import urllib.request

BASE_URL = f"http://127.0.0.1:{os.environ.get('DYNAMIC_ISLAND_PORT') or os.environ.get('WINDOWS_ISLAND_PORT', '5199')}"


def _call(method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE_URL + path, data=data, method=method,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=3) as res:
        return json.loads(res.read() or b"null")


def notify(title, subtitle=None, icon="bell", color=None, duration=5, action=None):
    """Transient notification that briefly expands the island."""
    body = {"title": title, "subtitle": subtitle, "icon": icon, "color": color, "duration": duration, "action": action}
    return _call("POST", "/notify", {k: v for k, v in body.items() if v is not None})


def activity(id, title=None, subtitle=None, icon="info", color=None, progress=None, duration=None, priority=50):
    """Create or update a live activity. Call again with the same id to update it."""
    body = {"id": id, "title": title, "subtitle": subtitle, "icon": icon, "color": color,
            "progress": progress, "duration": duration, "priority": priority}
    return _call("POST", "/activity", {k: v for k, v in body.items() if v is not None})


def remove(id):
    return _call("DELETE", f"/activity/{urllib.parse.quote(id)}")


if __name__ == "__main__":
    import time

    for step in range(11):
        activity("py-train", title="Treinando modelo", icon="code", color="#BF5AF2", progress=step / 10)
        time.sleep(0.3)
    remove("py-train")
    notify("Training finished", subtitle="Accuracy: 98.2%", icon="check", color="#30D158")
