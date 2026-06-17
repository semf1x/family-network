import asyncio
import json
import os

from pywebpush import webpush, WebPushException

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "").replace("\\n", "\n")
VAPID_CLAIMS = {"sub": "mailto:" + os.getenv("VAPID_EMAIL", "admin@kofkaweb.ru")}


def _send_sync(subscription_info: dict, payload: str):
    webpush(
        subscription_info=subscription_info,
        data=payload,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims=VAPID_CLAIMS,
    )


async def send_push(subscriptions: list, title: str, body: str, url: str = "/chats"):
    if not VAPID_PRIVATE_KEY:
        return
    payload = json.dumps({"title": title, "body": body, "url": url})
    for sub in subscriptions:
        info = {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}
        try:
            await asyncio.to_thread(_send_sync, info, payload)
        except Exception:
            pass
