import uuid

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from app.models.document import ProjectDocument


def document_visible_clause(user_id: uuid.UUID) -> ColumnElement[bool]:
    return or_(
        ProjectDocument.visibility == "shared",
        and_(ProjectDocument.visibility == "private", ProjectDocument.author_id == user_id),
    )


def document_is_visible(document: ProjectDocument, user_id: uuid.UUID) -> bool:
    return document.visibility == "shared" or (
        document.visibility == "private" and document.author_id == user_id
    )
