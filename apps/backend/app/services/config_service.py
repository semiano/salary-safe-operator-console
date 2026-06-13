from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.config import GlobalSetting, RunConfig


AUTO_ACCEPT_MATCH_THRESHOLD_KEY = "auto_accept_match_threshold"
DEFAULT_AUTO_ACCEPT_MATCH_THRESHOLD = 87.0


def _normalize_threshold(value: object) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return DEFAULT_AUTO_ACCEPT_MATCH_THRESHOLD
    if not parsed == parsed:  # NaN guard
        return DEFAULT_AUTO_ACCEPT_MATCH_THRESHOLD
    return max(0.0, min(100.0, parsed))


class ConfigService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_run_config(self, case_id: UUID, name: str, config_json: dict) -> RunConfig:
        config = RunConfig(case_id=case_id, name=name, config_json=config_json)
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        return config

    def list_run_configs(self, case_id: UUID | None = None) -> list[RunConfig]:
        stmt = select(RunConfig).order_by(RunConfig.created_at.desc())
        if case_id is not None:
            stmt = stmt.where(RunConfig.case_id == case_id)
        return list(self.db.scalars(stmt).all())

    def get_auto_accept_match_threshold(self) -> float:
        setting = self._get_global_setting(AUTO_ACCEPT_MATCH_THRESHOLD_KEY)
        if setting is None:
            return DEFAULT_AUTO_ACCEPT_MATCH_THRESHOLD
        raw_value = setting.value_json.get("value") if isinstance(setting.value_json, dict) else None
        return _normalize_threshold(raw_value)

    def set_auto_accept_match_threshold(self, threshold: float) -> float:
        normalized = _normalize_threshold(threshold)
        setting = self._get_global_setting(AUTO_ACCEPT_MATCH_THRESHOLD_KEY)
        if setting is None:
            setting = GlobalSetting(
                setting_key=AUTO_ACCEPT_MATCH_THRESHOLD_KEY,
                value_json={"value": normalized},
            )
            self.db.add(setting)
        else:
            setting.value_json = {"value": normalized}
        self.db.commit()
        return normalized

    def _get_global_setting(self, setting_key: str) -> GlobalSetting | None:
        stmt = select(GlobalSetting).where(GlobalSetting.setting_key == setting_key)
        return self.db.scalars(stmt).first()
