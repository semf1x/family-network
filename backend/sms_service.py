import os
import httpx

async def send_sms_code(to_phone: str, code: str):
    print(f"\n{'='*40}\n[SMS] Код верификации для {to_phone}: {code}\n{'='*40}\n")

    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_FROM_NUMBER")

    if not all([sid, token, from_num]):
        return

    async with httpx.AsyncClient() as client:
        await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
            data={"From": from_num, "To": to_phone, "Body": f"Ваш код верификации в Семейной сети: {code}"},
            auth=(sid, token),
        )
