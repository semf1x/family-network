import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging

logger = logging.getLogger(__name__)


async def send_verification_code(to_email: str, code: str):
    username = os.getenv("MAIL_USERNAME")
    password = os.getenv("MAIL_PASSWORD")
    mail_from = os.getenv("MAIL_FROM") or username
    host = os.getenv("MAIL_HOST", "smtp.gmail.com")
    port = int(os.getenv("MAIL_PORT", "587"))

    print(f"\n{'='*40}\n[EMAIL] Verification code for {to_email}: {code}\n{'='*40}\n")

    if not username or not password:
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Код подтверждения — Семейная сеть"
    msg["From"] = mail_from
    msg["To"] = to_email

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:4px">Семейная сеть</h2>
      <p style="color:#555;margin-top:0">Только для своих</p>
      <p>Ваш код подтверждения:</p>
      <div style="font-size:36px;font-weight:700;letter-spacing:12px;padding:20px 0;text-align:center;
                  background:#f4f4f5;border-radius:10px;margin:16px 0">
        {code}
      </div>
      <p style="color:#888;font-size:13px">Код действителен 10 минут. Не передавайте его никому.</p>
    </div>
    """

    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=host,
        port=port,
        username=username,
        password=password,
        start_tls=True,
    )
