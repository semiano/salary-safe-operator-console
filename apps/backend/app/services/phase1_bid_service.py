import json
import random
import string
from datetime import datetime, timezone
from uuid import UUID


def _generate_invitation_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=6))

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.case import NegotiationCase, Phase1Bid, Phase1BidEvent

SUBMISSION_STATUS_SUBMITTED = "applicant_bid_submitted"
SUBMISSION_STATUS_SENT = "response_sent"
SUBMISSION_STATUS_INVITATION_PENDING = "invitation_pending"
DECISION_PENDING = "pending"
DECISION_ACCEPTED = "accepted"
DECISION_REJECTED = "rejected"


def _normalize_match_score(raw_value: object) -> float | None:
    try:
        value = float(raw_value)
    except (TypeError, ValueError):
        return None
    if not value == value:  # NaN guard
        return None
    return max(0.0, min(100.0, value))


class Phase1BidService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_case(self, case_id: UUID) -> NegotiationCase | None:
        return self.db.get(NegotiationCase, case_id)

    def _require_case(self, case_id: UUID) -> NegotiationCase:
        case = self.db.get(NegotiationCase, case_id)
        if case is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job listing not found")
        return case

    def list_all(self) -> list[Phase1Bid]:
        stmt = select(Phase1Bid).options(selectinload(Phase1Bid.case)).order_by(Phase1Bid.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def list_for_case(self, case_id: UUID) -> list[Phase1Bid]:
        stmt = select(Phase1Bid).where(Phase1Bid.case_id == case_id).order_by(Phase1Bid.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def list_open_for_case(self, case_id: UUID) -> list[Phase1Bid]:
        stmt = (
            select(Phase1Bid)
            .where(Phase1Bid.case_id == case_id)
            .where(Phase1Bid.submission_status == SUBMISSION_STATUS_SUBMITTED)
            .order_by(Phase1Bid.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def list_history(self, bid_id: UUID) -> list[Phase1BidEvent]:
        stmt = (
            select(Phase1BidEvent)
            .where(Phase1BidEvent.bid_id == bid_id)
            .order_by(Phase1BidEvent.created_at.desc())
        )
        return list(self.db.scalars(stmt).all())

    def get_last_status_change_map(self, bid_ids: list[UUID]) -> dict[UUID, datetime]:
        """Return the latest status event timestamp per bid id."""
        if not bid_ids:
            return {}
        stmt = (
            select(Phase1BidEvent.bid_id, func.max(Phase1BidEvent.created_at))
            .where(Phase1BidEvent.bid_id.in_(bid_ids))
            .where(Phase1BidEvent.category == "status")
            .group_by(Phase1BidEvent.bid_id)
        )
        return {bid_id: ts for bid_id, ts in self.db.execute(stmt).all() if ts is not None}

    def get_bid(self, bid_id: UUID) -> Phase1Bid | None:
        return self.db.get(Phase1Bid, bid_id)

    def create_bid(
        self,
        *,
        case_id: UUID,
        applicant_identifier: str,
        salary_min: float,
        salary_max: float,
        insurance_importance_rank: int,
        pto_importance_rank: int,
        wfh_importance_rank: int,
    ) -> Phase1Bid:
        case = self._require_case(case_id)
        bid = Phase1Bid(
            case_id=case_id,
            tenant_id=case.tenant_id,
            applicant_identifier=applicant_identifier,
            salary_min=salary_min,
            salary_max=salary_max,
            insurance_importance_rank=insurance_importance_rank,
            pto_importance_rank=pto_importance_rank,
            wfh_importance_rank=wfh_importance_rank,
            submission_status=SUBMISSION_STATUS_SUBMITTED,
            decision_status=DECISION_PENDING,
            response_message="",
            received_at=datetime.now(timezone.utc),
        )
        self.db.add(bid)
        self._append_event(
            bid,
            category="status",
            event_type="bid_created",
            title="Bid created",
            detail="Bid was created directly by an operator.",
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def default_response_message(self, bid: Phase1Bid, decision_status: str, decision_reason: str | None) -> str:
        if decision_status == DECISION_ACCEPTED:
            return (
                "We are pleased to share that your Phase 1 bid was accepted. "
                f"{decision_reason or 'Our team determined your compensation and preference profile aligns with this role.'}"
            )
        return (
            "Thank you for your Phase 1 bid submission. At this time, your bid was not selected. "
            f"{decision_reason or 'The requested package was outside current role constraints.'}"
        )

    def update_decision(
        self,
        *,
        bid: Phase1Bid,
        decision_status: str,
        match_score: float | None,
        decision_reason: str | None,
        response_message: str | None,
    ) -> Phase1Bid:
        self._ensure_not_sent(bid)
        self._ensure_candidate_submission_exists(bid)
        previous_status = bid.decision_status
        bid.decision_status = decision_status
        if match_score is not None:
            bid.match_score = _normalize_match_score(match_score)
        bid.decision_reason = decision_reason

        if response_message is not None and response_message.strip():
            bid.response_message = response_message.strip()
        elif previous_status in {DECISION_ACCEPTED, DECISION_REJECTED} and decision_status in {DECISION_ACCEPTED, DECISION_REJECTED} and previous_status != decision_status:
            bid.response_message = ""
        else:
            bid.response_message = self.default_response_message(bid, decision_status, decision_reason)

        changed = previous_status != decision_status
        self._append_event(
            bid,
            category="status",
            event_type="decision_updated",
            title="Decision updated" if changed else "Decision reviewed",
            detail=(
                f"Decision changed from {previous_status} to {decision_status}."
                if changed
                else f"Decision remained {decision_status}."
            ),
            payload={
                "previous_decision_status": previous_status,
                "decision_status": decision_status,
                "decision_reason": decision_reason,
                "match_score": bid.match_score,
            },
        )

        self.db.commit()
        self.db.refresh(bid)
        return bid

    def update_response_message(self, *, bid: Phase1Bid, response_message: str) -> Phase1Bid:
        self._ensure_not_sent(bid)
        previous_message = bid.response_message
        bid.response_message = response_message.strip()
        self._append_event(
            bid,
            category="message",
            event_type="response_message_updated",
            title="Response message updated",
            detail="Final response draft was edited.",
            payload={
                "previous_length": len(previous_message or ""),
                "current_length": len(bid.response_message or ""),
            },
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def update_bid_fields(
        self,
        *,
        bid: Phase1Bid,
        candidate_name: str | None,
        candidate_email: str | None,
        salary_min: float,
        salary_max: float,
        insurance_importance_rank: int,
        pto_importance_rank: int,
        wfh_importance_rank: int,
    ) -> Phase1Bid:
        """Admin override: update candidate-submitted fields on a bid."""
        if candidate_name is not None:
            bid.candidate_name = candidate_name
        if candidate_email is not None:
            bid.candidate_email = candidate_email
        bid.salary_min = salary_min
        bid.salary_max = salary_max
        bid.insurance_importance_rank = insurance_importance_rank
        bid.pto_importance_rank = pto_importance_rank
        bid.wfh_importance_rank = wfh_importance_rank
        # If this was a pending invitation, mark it as submitted now
        if bid.submission_status == SUBMISSION_STATUS_INVITATION_PENDING:
            bid.submission_status = SUBMISSION_STATUS_SUBMITTED
            bid.candidate_submitted_at = datetime.now(timezone.utc)
            self._append_event(
                bid,
                category="status",
                event_type="candidate_submission_recorded",
                title="Candidate submission recorded",
                detail="Bid moved from invitation pending to submitted.",
            )
        self._append_event(
            bid,
            category="status",
            event_type="bid_fields_updated",
            title="Bid fields updated",
            detail="An operator edited candidate bid fields.",
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def send_response(self, bid: Phase1Bid) -> Phase1Bid:
        self._ensure_not_sent(bid)
        self._ensure_candidate_submission_exists(bid)
        if bid.decision_status not in {DECISION_ACCEPTED, DECISION_REJECTED}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Decision must be accepted or rejected before sending response")
        if not bid.response_message.strip():
            bid.response_message = self.default_response_message(bid, bid.decision_status, bid.decision_reason)

        bid.submission_status = SUBMISSION_STATUS_SENT
        bid.sent_at = datetime.now(timezone.utc)
        self._append_event(
            bid,
            category="status",
            event_type="bid_closed",
            title="Bid closed",
            detail=f"Final response sent with decision {bid.decision_status}.",
            payload={"decision_status": bid.decision_status},
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def apply_bulk_decisions(self, *, bids: list[Phase1Bid], decisions_payload: dict[str, dict]) -> tuple[int, list[UUID]]:
        updated_ids: list[UUID] = []
        for bid in bids:
            payload = decisions_payload.get(str(bid.id))
            if payload is None:
                continue

            decision_status = str(payload.get("decision_status", "")).strip().lower()
            if decision_status not in {DECISION_ACCEPTED, DECISION_REJECTED}:
                continue

            decision_reason = payload.get("decision_reason")
            if decision_reason is not None:
                decision_reason = str(decision_reason).strip()

            match_score = _normalize_match_score(payload.get("match_score"))

            response_message = payload.get("response_message")
            if response_message is not None:
                response_message = str(response_message).strip()

            if not self._has_candidate_submission(bid):
                continue

            bid.decision_status = decision_status
            bid.match_score = match_score
            bid.decision_reason = decision_reason
            bid.response_message = response_message or self.default_response_message(bid, decision_status, decision_reason)
            self._append_event(
                bid,
                category="status",
                event_type="decision_updated",
                title="Decision updated",
                detail=f"Decision set to {decision_status} by bulk AI matching.",
                payload={
                    "decision_status": decision_status,
                    "decision_reason": decision_reason,
                    "match_score": match_score,
                    "source": "bulk_llm",
                },
            )
            updated_ids.append(bid.id)

        if updated_ids:
            self.db.commit()
            for bid in bids:
                if bid.id in updated_ids:
                    self.db.refresh(bid)
        return (len(updated_ids), updated_ids)

    def parse_bulk_decisions_json(self, content: str) -> dict[str, dict]:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return {}
            try:
                payload = json.loads(content[start : end + 1])
            except json.JSONDecodeError:
                return {}

        decisions = payload.get("decisions")
        if not isinstance(decisions, list):
            return {}

        results: dict[str, dict] = {}
        for item in decisions:
            if not isinstance(item, dict):
                continue
            bid_id = item.get("bid_id")
            if bid_id is None:
                continue
            results[str(bid_id)] = item
        return results

    def parse_generated_bids_json(self, content: str) -> list[dict]:
        try:
            payload = json.loads(content)
        except json.JSONDecodeError:
            start = content.find("{")
            end = content.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return []
            try:
                payload = json.loads(content[start : end + 1])
            except json.JSONDecodeError:
                return []

        bids = payload.get("bids")
        if not isinstance(bids, list):
            return []

        parsed: list[dict] = []
        for item in bids:
            if not isinstance(item, dict):
                continue

            identifier = str(item.get("applicant_identifier", "")).strip()
            salary_min = item.get("salary_min")
            salary_max = item.get("salary_max")
            insurance_rank = item.get("insurance_importance_rank")
            pto_rank = item.get("pto_importance_rank")
            wfh_rank = item.get("wfh_importance_rank")

            try:
                salary_min_value = float(salary_min)
                salary_max_value = float(salary_max)
                insurance_rank_value = int(insurance_rank)
                pto_rank_value = int(pto_rank)
                wfh_rank_value = int(wfh_rank)
            except (TypeError, ValueError):
                continue

            if not identifier:
                continue
            if salary_min_value <= 0 or salary_max_value < salary_min_value:
                continue
            if insurance_rank_value not in {1, 2, 3}:
                continue
            if pto_rank_value not in {1, 2, 3}:
                continue
            if wfh_rank_value not in {1, 2, 3}:
                continue

            parsed.append(
                {
                    "applicant_identifier": identifier,
                    "candidate_name": str(item.get("candidate_name", "")).strip() or None,
                    "candidate_email": str(item.get("candidate_email", "")).strip() or None,
                    "salary_min": salary_min_value,
                    "salary_max": salary_max_value,
                    "insurance_importance_rank": insurance_rank_value,
                    "pto_importance_rank": pto_rank_value,
                    "wfh_importance_rank": wfh_rank_value,
                }
            )
        return parsed

    def create_generated_bids(self, *, case_id: UUID, bid_payloads: list[dict]) -> list[Phase1Bid]:
        case = self._require_case(case_id)
        existing_identifiers = {
            row[0].strip().lower()
            for row in self.db.execute(select(Phase1Bid.applicant_identifier).where(Phase1Bid.case_id == case_id)).all()
            if isinstance(row[0], str)
        }

        created: list[Phase1Bid] = []
        for payload in bid_payloads:
            email_like_identifier = self._coerce_to_email(payload["applicant_identifier"])
            identifier = self._make_unique_identifier(email_like_identifier, existing_identifiers)
            existing_identifiers.add(identifier.strip().lower())

            bid = Phase1Bid(
                case_id=case_id,
                tenant_id=case.tenant_id,
                applicant_identifier=identifier,
                candidate_email=payload.get("candidate_email") or identifier,
                candidate_name=payload.get("candidate_name"),
                is_invitation=True,
                salary_min=payload["salary_min"],
                salary_max=payload["salary_max"],
                insurance_importance_rank=payload["insurance_importance_rank"],
                pto_importance_rank=payload["pto_importance_rank"],
                wfh_importance_rank=payload["wfh_importance_rank"],
                submission_status=SUBMISSION_STATUS_SUBMITTED,
                decision_status=DECISION_PENDING,
                response_message="",
                received_at=datetime.now(timezone.utc),
                candidate_submitted_at=datetime.now(timezone.utc),
            )
            self.db.add(bid)
            created.append(bid)

        if created:
            self.db.commit()
            for bid in created:
                self.db.refresh(bid)
        return created

    def _make_unique_identifier(self, requested_identifier: str, existing_identifiers: set[str]) -> str:
        candidate = requested_identifier.strip()
        if not candidate:
            candidate = "applicant@example.com"

        normalized = candidate.lower()
        if normalized not in existing_identifiers:
            return candidate

        if "@" in candidate:
            local, domain = candidate.split("@", 1)
            suffix = 2
            while True:
                next_value = f"{local}+fresh{suffix}@{domain}"
                if next_value.lower() not in existing_identifiers:
                    return next_value
                suffix += 1

        suffix = 2
        while True:
            next_value = f"{candidate}-{suffix}"
            if next_value.lower() not in existing_identifiers:
                return next_value
            suffix += 1

    def _coerce_to_email(self, requested_identifier: str) -> str:
        candidate = requested_identifier.strip().lower()
        if not candidate:
            return "applicant@example.com"

        if "@" in candidate:
            return candidate

        filtered = "".join(ch if ch.isalnum() or ch in {".", "_", "-"} else "." for ch in candidate)
        filtered = filtered.strip("._-")
        if not filtered:
            filtered = "applicant"
        return f"{filtered}@example.com"

    def create_simulated_submission(
        self,
        *,
        case_id: UUID,
        candidate_name: str,
        candidate_email: str,
        salary_min: float,
        salary_max: float,
        insurance_importance_rank: int,
        pto_importance_rank: int,
        wfh_importance_rank: int,
    ) -> Phase1Bid:
        """Create a fully-submitted invite-style bid without sending an invitation link."""
        case = self._require_case(case_id)
        bid = Phase1Bid(
            case_id=case_id,
            tenant_id=case.tenant_id,
            applicant_identifier=candidate_email,
            candidate_email=candidate_email,
            candidate_name=candidate_name,
            is_invitation=True,
            salary_min=salary_min,
            salary_max=salary_max,
            insurance_importance_rank=insurance_importance_rank,
            pto_importance_rank=pto_importance_rank,
            wfh_importance_rank=wfh_importance_rank,
            submission_status=SUBMISSION_STATUS_SUBMITTED,
            decision_status=DECISION_PENDING,
            response_message="",
            received_at=datetime.now(timezone.utc),
            candidate_submitted_at=datetime.now(timezone.utc),
        )
        self.db.add(bid)
        self._append_event(
            bid,
            category="status",
            event_type="simulated_submission_created",
            title="Simulated submission created",
            detail="An admin created a simulated candidate bid.",
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def create_invitation(
        self,
        *,
        case_id: UUID,
        candidate_email: str,
        candidate_name: str | None,
    ) -> Phase1Bid:
        """Create a placeholder bid invitation — candidate fills the form later via token URL."""
        case = self._require_case(case_id)
        bid = Phase1Bid(
            case_id=case_id,
            tenant_id=case.tenant_id,
            applicant_identifier=candidate_email,
            candidate_email=candidate_email,
            candidate_name=candidate_name,
            is_invitation=True,
            invitation_code=_generate_invitation_code(),
            # Placeholder values; overwritten when candidate submits
            salary_min=0.0,
            salary_max=0.0,
            insurance_importance_rank=1,
            pto_importance_rank=1,
            wfh_importance_rank=1,
            submission_status=SUBMISSION_STATUS_INVITATION_PENDING,
            decision_status=DECISION_PENDING,
            response_message="",
            received_at=datetime.now(timezone.utc),
        )
        self.db.add(bid)
        self._append_event(
            bid,
            category="status",
            event_type="invitation_created",
            title="Invitation created",
            detail="Invitation sent to candidate.",
            payload={
                "candidate_email": candidate_email,
                "candidate_name": candidate_name,
            },
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def resend_invitation(self, *, bid: Phase1Bid) -> Phase1Bid:
        """Regenerate invitation_code so a fresh code can be sent to the candidate.
        Resets submission_status back to invitation_pending if the bid has not yet been responded to."""
        if bid.submission_status == SUBMISSION_STATUS_SENT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot resend an invitation after a response has already been sent.",
            )
        bid.invitation_code = _generate_invitation_code()
        bid.submission_status = SUBMISSION_STATUS_INVITATION_PENDING
        bid.received_at = datetime.now(timezone.utc)
        self._append_event(
            bid,
            category="status",
            event_type="invitation_resent",
            title="Invitation re-sent",
            detail="A new invitation code was issued to the candidate.",
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def revoke_bid(self, *, bid: Phase1Bid) -> None:
        """Permanently delete a bid/invitation record."""
        self.db.delete(bid)
        self.db.commit()

    def get_bid_by_token(self, token: UUID) -> Phase1Bid | None:
        stmt = select(Phase1Bid).where(Phase1Bid.token == token)
        return self.db.scalars(stmt).first()

    def submit_candidate_bid(
        self,
        *,
        bid: Phase1Bid,
        salary_min: float,
        salary_max: float,
        insurance_importance_rank: int,
        pto_importance_rank: int,
        wfh_importance_rank: int,
    ) -> Phase1Bid:
        if bid.submission_status != SUBMISSION_STATUS_INVITATION_PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This bid has already been submitted")
        bid.salary_min = salary_min
        bid.salary_max = salary_max
        bid.insurance_importance_rank = insurance_importance_rank
        bid.pto_importance_rank = pto_importance_rank
        bid.wfh_importance_rank = wfh_importance_rank
        bid.submission_status = SUBMISSION_STATUS_SUBMITTED
        bid.candidate_submitted_at = datetime.now(timezone.utc)
        self._append_event(
            bid,
            category="status",
            event_type="candidate_submitted_bid",
            title="Candidate submitted bid",
            detail="Candidate completed invitation and submitted salary expectations.",
            payload={
                "salary_min": bid.salary_min,
                "salary_max": bid.salary_max,
                "insurance_importance_rank": bid.insurance_importance_rank,
                "pto_importance_rank": bid.pto_importance_rank,
                "wfh_importance_rank": bid.wfh_importance_rank,
            },
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def submit_candidate_revision(
        self,
        *,
        bid: Phase1Bid,
        salary_min: float,
        salary_max: float,
        insurance_importance_rank: int,
        pto_importance_rank: int,
        wfh_importance_rank: int,
    ) -> Phase1Bid:
        """Apply the candidate's one-time revised bid and reset the determination.

        Enforces the single-revision rule and that a final response has not
        already been dispatched.
        """
        if bid.submission_status == SUBMISSION_STATUS_SENT:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A final response has already been sent for this application",
            )
        if bid.submission_status != SUBMISSION_STATUS_SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This application cannot be revised in its current state",
            )
        if bid.revision_count >= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already used your one-time revision",
            )

        bid.salary_min = salary_min
        bid.salary_max = salary_max
        bid.insurance_importance_rank = insurance_importance_rank
        bid.pto_importance_rank = pto_importance_rank
        bid.wfh_importance_rank = wfh_importance_rank
        bid.revision_count += 1
        # Reset the determination so the AI re-evaluates the revised bid.
        bid.decision_status = DECISION_PENDING
        bid.match_score = None
        bid.decision_reason = None
        bid.response_message = ""
        bid.candidate_submitted_at = datetime.now(timezone.utc)
        self._append_event(
            bid,
            category="status",
            event_type="candidate_revised_bid",
            title="Candidate revised bid",
            detail="Candidate used their one-time revision to update salary expectations.",
            payload={
                "salary_min": bid.salary_min,
                "salary_max": bid.salary_max,
                "insurance_importance_rank": bid.insurance_importance_rank,
                "pto_importance_rank": bid.pto_importance_rank,
                "wfh_importance_rank": bid.wfh_importance_rank,
                "revision_count": bid.revision_count,
            },
        )
        self.db.commit()
        self.db.refresh(bid)
        return bid

    def log_message_event(
        self,
        *,
        bid: Phase1Bid,
        event_type: str,
        title: str,
        detail: str,
        payload: dict | None = None,
    ) -> None:
        self._append_event(
            bid,
            category="message",
            event_type=event_type,
            title=title,
            detail=detail,
            payload=payload,
        )
        self.db.commit()

    def _append_event(
        self,
        bid: Phase1Bid,
        *,
        category: str,
        event_type: str,
        title: str,
        detail: str | None,
        payload: dict | None = None,
    ) -> None:
        # Attach via relationship so SQLAlchemy can resolve bid_id even for new, unflushed bids.
        self.db.add(
            Phase1BidEvent(
                bid=bid,
                case_id=bid.case_id,
                tenant_id=bid.tenant_id,
                category=category,
                event_type=event_type,
                title=title,
                detail=detail,
                payload_json=payload,
            )
        )

    def get_bid_stats_for_cases(self, case_ids: list[UUID]) -> dict[str, dict]:
        """Return {case_id_str: {invitations_sent, bids_received}} for each requested case."""
        if not case_ids:
            return {}
        stmt = select(Phase1Bid).where(Phase1Bid.case_id.in_(case_ids))
        all_bids = list(self.db.scalars(stmt).all())
        results: dict[str, dict] = {str(cid): {"invitations_sent": 0, "bids_received": 0} for cid in case_ids}
        for bid in all_bids:
            key = str(bid.case_id)
            if key not in results:
                continue
            if bid.is_invitation:
                results[key]["invitations_sent"] += 1
                if bid.submission_status != SUBMISSION_STATUS_INVITATION_PENDING:
                    results[key]["bids_received"] += 1
        return results

    def verify_invitation_code(self, bid: Phase1Bid, code: str) -> bool:
        """Return True if the code matches (or no code is set on this bid)."""
        if bid.invitation_code is None:
            return True
        return code.strip().upper() == bid.invitation_code.upper()

    def _ensure_not_sent(self, bid: Phase1Bid) -> None:
        if bid.submission_status == SUBMISSION_STATUS_SENT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot modify a bid after response is sent")

    def _has_candidate_submission(self, bid: Phase1Bid) -> bool:
        """Infer whether a bid payload exists without depending on a single status literal."""
        if bid.candidate_submitted_at is not None:
            return True

        has_salary_range = bid.salary_min > 0 and bid.salary_max >= bid.salary_min
        return has_salary_range and bid.submission_status != SUBMISSION_STATUS_INVITATION_PENDING

    def _ensure_candidate_submission_exists(self, bid: Phase1Bid) -> None:
        if self._has_candidate_submission(bid):
            return
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot accept, reject, or send a response before the candidate submits a bid",
        )
