from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.user import User


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def authenticate(self, email: str, password: str) -> User | None:
        user = self.db.scalar(select(User).where(User.email == email))
        if user is None:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user
