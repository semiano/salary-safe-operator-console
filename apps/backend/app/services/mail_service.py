"""Transactional email service.

Reads configuration from environment variables.  All environment variables
default to empty / disabled so the service is safe to use without any SMTP
configuration — it will simply log instead of sending.

Environment variables
---------------------
MAIL_PROVIDER       smtp | sendgrid  (default: smtp)
SMTP_HOST           SMTP server hostname
SMTP_PORT           SMTP port (default: 587)
SMTP_USER           SMTP username / login
SMTP_PASSWORD       SMTP password
MAIL_FROM           From address  (default: noreply@salarysafe.dev)
MAIL_OVERRIDE_ADDRESS  When set, ALL outbound mail is redirected here
MAIL_OVERRIDE_ENABLED  true | false  (default: false)
"""

from __future__ import annotations

import logging
import os
import smtplib
import socket
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _flag(key: str, default: bool = False) -> bool:
    val = _env(key).lower()
    if val in {"1", "true", "yes", "on"}:
        return True
    if val in {"0", "false", "no", "off"}:
        return False
    return default


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_mime(to: str, subject: str, body_html: str) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["From"] = _env("MAIL_FROM", "noreply@salarysafe.dev")
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html"))
    return msg


def _send_via_smtp(msg: MIMEMultipart, to: str) -> None:
    host = _env("SMTP_HOST")
    if not host:
        logger.info("MAIL | no SMTP_HOST configured — would have sent to %s: %s", to, msg["Subject"])
        return

    port = int(_env("SMTP_PORT", "587"))
    user = _env("SMTP_USER")
    password = _env("SMTP_PASSWORD")

    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.sendmail(msg["From"], [to], msg.as_string())
        logger.info("MAIL | sent to %s via SMTP: %s", to, msg["Subject"])
    except (smtplib.SMTPException, socket.error) as exc:
        logger.warning("MAIL | SMTP error sending to %s: %s", to, exc)


# ── Public API ────────────────────────────────────────────────────────────────

def send_email(to: str, subject: str, body_html: str) -> None:
    """Send a transactional email.

    If MAIL_OVERRIDE_ADDRESS is set and MAIL_OVERRIDE_ENABLED is true the
    recipient is replaced with the override address and the original recipient
    is prepended to the subject so emails are visible in a shared inbox during
    QA / staging.
    """
    override_address = _env("MAIL_OVERRIDE_ADDRESS")
    override_enabled = _flag("MAIL_OVERRIDE_ENABLED", default=False)

    effective_to = to
    effective_subject = subject

    if override_address and override_enabled:
        effective_subject = f"[OVERRIDE → {to}] {subject}"
        effective_to = override_address
        logger.info("MAIL | override active — redirecting %s to %s", to, effective_to)

    msg = _build_mime(effective_to, effective_subject, body_html)
    _send_via_smtp(msg, effective_to)


# ── Email templates ───────────────────────────────────────────────────────────

def send_bid_invitation(
    *,
    candidate_name: str,
    candidate_email: str,
    role_title: str,
    apply_url: str,
    company_name: str = "Hiring Team",
) -> None:
    """Send a bid invitation email to a candidate."""
    subject = f"You've been invited to submit a salary bid — {role_title}"
    body = f"""
    <html><body style="font-family: sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #019529;">You've been invited to submit a bid</h2>
      <p>Hi {candidate_name or "there"},</p>
      <p>
        <strong>{company_name}</strong> has invited you to submit your salary expectations
        for the <strong>{role_title}</strong> role using SalarySafe.
      </p>
      <p style="margin: 24px 0;">
        <a href="{apply_url}"
           style="background:#019529;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Submit My Bid
        </a>
      </p>
      <p style="font-size:12px;color:#888;">Or copy this link: {apply_url}</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
      <p style="font-size:12px;color:#aaa;">
        This invitation was sent via SalarySafe. If you didn't expect this email, you can safely ignore it.
      </p>
    </body></html>
    """
    send_email(to=candidate_email, subject=subject, body_html=body)


def send_bid_response(
    *,
    candidate_name: str,
    candidate_email: str,
    role_title: str,
    decision: str,
    response_message: str | None,
    company_name: str = "Hiring Team",
) -> None:
    """Send the hiring decision / response message to a candidate."""
    if decision == "accepted":
        subject = f"Great news regarding your bid for {role_title}"
        opener = "We're pleased to let you know that your bid has been accepted."
    elif decision == "rejected":
        subject = f"Update on your bid for {role_title}"
        opener = "Thank you for taking the time to submit your bid. After careful review, we're unable to move forward at this time."
    else:
        subject = f"An update on your bid for {role_title}"
        opener = "We have an update regarding your salary bid."

    message_block = (
        f'<blockquote style="border-left:3px solid #e4e4e7;margin:16px 0;padding:8px 16px;color:#555;">'
        f"{response_message}"
        f"</blockquote>"
        if response_message
        else ""
    )

    body = f"""
    <html><body style="font-family: sans-serif; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1B1035;">Update on your bid — {role_title}</h2>
      <p>Hi {candidate_name or "there"},</p>
      <p>{opener}</p>
      {message_block}
      <p>Thank you for using SalarySafe.</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
      <p style="font-size:12px;color:#aaa;">
        This message was sent via SalarySafe on behalf of {company_name}.
      </p>
    </body></html>
    """
    send_email(to=candidate_email, subject=subject, body_html=body)
