from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.case import CaseParty, NegotiationCase


class CaseService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_case(
        self,
        *,
        title: str,
        description: str | None,
        status: str,
        jurisdiction: str | None,
        currency: str,
        created_by: UUID | None,
        tenant_id: UUID,
        candidate_public: dict,
        candidate_confidential: dict,
        company_public: dict,
        company_confidential: dict,
    ) -> NegotiationCase:
        case = NegotiationCase(
            title=title,
            description=description,
            status=status,
            jurisdiction=jurisdiction,
            currency=currency,
            created_by=created_by,
            tenant_id=tenant_id,
        )
        self.db.add(case)
        self.db.flush()

        self.db.add_all(
            [
                CaseParty(
                    case_id=case.id,
                    party_type="candidate",
                    public_payload=candidate_public,
                    confidential_payload=candidate_confidential,
                ),
                CaseParty(
                    case_id=case.id,
                    party_type="company",
                    public_payload=company_public,
                    confidential_payload=company_confidential,
                ),
            ]
        )
        self.db.commit()
        return self.get_case(case.id)

    def list_cases(self) -> list[NegotiationCase]:
        stmt = select(NegotiationCase).options(selectinload(NegotiationCase.parties)).order_by(NegotiationCase.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_case(self, case_id: UUID) -> NegotiationCase | None:
        stmt = select(NegotiationCase).where(NegotiationCase.id == case_id).options(selectinload(NegotiationCase.parties))
        return self.db.scalar(stmt)

    def update_case(
        self,
        case: NegotiationCase,
        *,
        title: str | None,
        description: str | None,
        status: str | None,
        jurisdiction: str | None,
        currency: str | None,
        operator_guidance: str | None,
        candidate_public: dict | None,
        candidate_confidential: dict | None,
        company_public: dict | None,
        company_confidential: dict | None,
    ) -> NegotiationCase:
        if title is not None:
            case.title = title
        if description is not None:
            case.description = description
        if status is not None:
            case.status = status
        if jurisdiction is not None:
            case.jurisdiction = jurisdiction
        if currency is not None:
            case.currency = currency
        if operator_guidance is not None:
            case.operator_guidance = operator_guidance

        parties = {party.party_type: party for party in case.parties}
        candidate_party = parties.get("candidate")
        company_party = parties.get("company")

        if candidate_party is not None:
            if candidate_public is not None:
                candidate_party.public_payload = candidate_public
            if candidate_confidential is not None:
                candidate_party.confidential_payload = candidate_confidential

        if company_party is not None:
            if company_public is not None:
                company_party.public_payload = company_public
            if company_confidential is not None:
                company_party.confidential_payload = company_confidential

        self.db.commit()
        return self.get_case(case.id)
