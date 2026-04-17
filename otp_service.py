"""
VibeMatch OTP Service (Updated)
Handles OTP generation, storage, and delivery via SMS (Twilio) and Email (SMTP).
Includes automatic fallbacks to console for development.
"""

import random
import time
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

# Load .env at the very beginning
load_dotenv()

# Setup logging to see what's happening in your terminal
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- In-memory OTP Store ---
# Using a dictionary to store OTPs: { "identifier": {"code": "1234", "expires_at": 1712510000} }
_otp_store: dict[str, dict] = {}
OTP_EXPIRY_SECONDS = 300  # 5 minutes


def generate_otp() -> str:
    """Generate a random 4-digit OTP."""
    return str(random.randint(1000, 9999))


def store_otp(identifier: str, code: str):
    """Store OTP with expiry timestamp."""
    _otp_store[identifier] = {
        "code": code,
        "expires_at": time.time() + OTP_EXPIRY_SECONDS,
    }
    logger.info(f"✅ OTP Stored for {identifier}. Expires in 5m.")


def verify_stored_otp(identifier: str, code: str) -> bool:
    """Verify an OTP code. Returns True if valid and not expired."""
    entry = _otp_store.get(identifier)
    
    if not entry:
        logger.warning(f"❌ No OTP found for {identifier}")
        return False
    
    # Check if expired
    if time.time() > entry["expires_at"]:
        logger.warning(f"⏰ OTP for {identifier} has expired.")
        del _otp_store[identifier]
        return False
        
    # Check if code matches
    if entry["code"] != code:
        logger.warning(f"🚫 Incorrect code entered for {identifier}")
        return False
    
    # Success - Delete OTP so it can't be used twice (Security)
    del _otp_store[identifier]
    return True


def send_otp_email(email: str, code: str) -> bool:
    """Send OTP via SMTP (Gmail) or print to terminal if not configured."""
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    pwd = os.getenv("SMTP_PASSWORD")

    if not all([host, user, pwd]):
        print(f"\n--- 📧 EMAIL FALLBACK ---")
        print(f"To: {email}\nCode: {code}")
        print(f"--------------------------\n")
        return True

    try:
        msg = MIMEMultipart()
        msg["Subject"] = f"{code} is your VibeMatch code"
        msg["From"] = user
        msg["To"] = email
        
        body = f"Your VibeMatch verification code is: {code}"
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, pwd)
            server.send_message(msg)
        logger.info(f"📧 Email sent successfully to {email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


def send_otp_sms(phone: str, code: str) -> bool:
    """Send OTP via Twilio or print to terminal if not configured."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_num = os.getenv("TWILIO_PHONE_NUMBER")

    if not all([sid, token, from_num]):
        print(f"\n--- 📱 SMS FALLBACK ---")
        print(f"To: {phone}\nCode: {code}")
        print(f"-------------------------\n")
        return True

    try:
        # Import inside the function so it doesn't crash if library is missing
        from twilio.rest import Client
        client = Client(sid, token)
        
        # Ensure correct formatting for India (+91)
        to_num = phone if phone.startswith("+") else f"+91{phone}"
        
        client.messages.create(
            body=f"Your VibeMatch code: {code}",
            from_=from_num,
            to=to_num
        )
        logger.info(f"📱 SMS sent successfully to {phone}")
        return True
    except ImportError:
        logger.error("Twilio library not installed. Run 'pip install twilio'")
        return False
    except Exception as e:
        logger.error(f"Twilio Error: {e}")
        return False


def send_otp_to_both(email: str, phone: str, code: str) -> str: # ✅ 1. Add 'code' here
    """Receives one OTP and tries to send via both channels."""
    # code = generate_otp() # ❌ 2. COMMENT OUT OR DELETE THIS LINE
    
    # Now it uses the code passed from main.py
    store_otp(email, code)
    store_otp(phone, code)
    
    # Attempt deliveries
    send_otp_email(email, code)
    send_otp_sms(phone, code)
    
    return code