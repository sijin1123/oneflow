"""Bounded PQL parsing and SQLAlchemy compilation for workspace views."""

from __future__ import annotations

import ast
from dataclasses import dataclass
from typing import Any

from lark import Lark, Transformer, UnexpectedInput
from lark.exceptions import VisitError
from sqlalchemy import and_, case, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.member import ProjectMember
from app.models.project import Project
from app.models.user import User
from app.models.work_package import WP_CLOSED_STATUSES, WP_PRIORITIES, WP_STATUSES, WorkPackage


class PqlError(ValueError):
    """A client-safe PQL error suitable for a 422 response."""


@dataclass(frozen=True)
class Predicate:
    field: str
    operator: str
    values: tuple[str, ...]


@dataclass(frozen=True)
class BooleanExpression:
    operator: str
    children: tuple[Predicate | BooleanExpression, ...]


@dataclass(frozen=True)
class ParsedPql:
    expression: Predicate | BooleanExpression
    order_by: str | None = None
    direction: str | None = None
    limit: int | None = None

    @property
    def fields(self) -> list[str]:
        found: list[str] = []

        def visit(node: Predicate | BooleanExpression) -> None:
            if isinstance(node, Predicate):
                if node.field not in found:
                    found.append(node.field)
                return
            for child in node.children:
                visit(child)

        visit(self.expression)
        return found

    @property
    def normalized(self) -> str:
        def render(node: Predicate | BooleanExpression, parent: str | None = None) -> str:
            if isinstance(node, Predicate):
                values = ", ".join(
                    _quote(_canonical_value(node.field, value)) for value in node.values
                )
                if node.operator in {"IN", "NOT IN"}:
                    return f"{node.field} {node.operator} ({values})"
                value = _quote(_canonical_value(node.field, node.values[0]))
                return f"{node.field} {node.operator} {value}"
            text = f" {node.operator} ".join(
                render(child, node.operator) for child in node.children
            )
            return f"({text})" if parent == "AND" and node.operator == "OR" else text

        result = render(self.expression)
        if self.order_by:
            result += f" ORDER BY {self.order_by} {self.direction}"
        if self.limit is not None:
            result += f" LIMIT {self.limit}"
        return result


def _quote(value: str) -> str:
    if value.replace("_", "").replace("-", "").isalnum() and " " not in value:
        return value
    return repr(value)


def _canonical_value(field: str, value: str) -> str:
    if field in {"state", "priority"}:
        return value.lower()
    if field == "assignee" and value.casefold() in {"me", "none"}:
        return value.lower()
    return value


_GRAMMAR = r"""
start: expression order_clause? limit_clause?
?expression: or_expr
?or_expr: and_expr (OR and_expr)*
?and_expr: predicate (AND predicate)*
?predicate: field OP value                 -> compare
          | field IN values                 -> in_compare
          | field NOT IN values             -> not_in_compare
field: FIELD
values: "(" [value ("," value)*] ")"
value: ESCAPED_STRING | SINGLE_QUOTED | BARE
order_clause: ORDER BY ORDER_FIELD DIRECTION
limit_clause: LIMIT INT

FIELD.3: /title|state|priority|project|assignee/i
ORDER_FIELD.3: /updated|due|created|title|priority/i
AND.3: /AND/i
OR.3: /OR/i
NOT.3: /NOT/i
IN.3: /IN/i
ORDER.3: /ORDER/i
BY.3: /BY/i
ASC.3: /ASC/i
DESC.3: /DESC/i
LIMIT.3: /LIMIT/i
DIRECTION: ASC | DESC
OP: "!=" | "="
SINGLE_QUOTED: /'([^'\\]|\\.)*'/
BARE: /[^\s,()=!]+/
%import common.ESCAPED_STRING
%import common.INT
%import common.WS
%ignore WS
"""


class _PqlTransformer(Transformer):
    def field(self, items):
        return str(items[0]).lower()

    def value(self, items):
        raw = str(items[0])
        if raw.startswith(("'", '"')):
            try:
                return ast.literal_eval(raw)
            except (SyntaxError, ValueError) as exc:
                raise PqlError("invalid quoted value") from exc
        return raw

    def values(self, items):
        return tuple(item for item in items if item is not None)

    def compare(self, items):
        return Predicate(items[0], str(items[1]), (items[2],))

    def in_compare(self, items):
        return Predicate(items[0], "IN", items[2])

    def not_in_compare(self, items):
        return Predicate(items[0], "NOT IN", items[3])

    def and_expr(self, items):
        nodes = tuple(item for item in items if not hasattr(item, "type"))
        return nodes[0] if len(nodes) == 1 else BooleanExpression("AND", nodes)

    def or_expr(self, items):
        nodes = tuple(item for item in items if not hasattr(item, "type"))
        return nodes[0] if len(nodes) == 1 else BooleanExpression("OR", nodes)

    def order_clause(self, items):
        return (str(items[2]).lower(), str(items[3]).upper())

    def limit_clause(self, items):
        return int(items[1])

    def start(self, items):
        expression = items[0]
        order_by = direction = None
        limit = None
        for item in items[1:]:
            if isinstance(item, tuple):
                order_by, direction = item
            else:
                limit = item
        return ParsedPql(expression, order_by, direction, limit)


_PARSER = Lark(_GRAMMAR, parser="lalr", transformer=_PqlTransformer())
_VALID_STATES = frozenset(("open", "completed", *WP_STATUSES))


def parse_pql(query: str) -> ParsedPql:
    if not query or not query.strip():
        raise PqlError("PQL query cannot be blank")
    if len(query) > 1000:
        raise PqlError("PQL query must be at most 1000 characters")
    try:
        parsed = _PARSER.parse(query)
    except VisitError as exc:
        cause = exc.orig_exc
        message = str(cause) if isinstance(cause, PqlError) else "invalid transformed value"
        raise PqlError(f"invalid PQL syntax: {message}") from exc
    except (UnexpectedInput, PqlError) as exc:
        raise PqlError(f"invalid PQL syntax: {exc}") from exc
    _validate_shape(parsed)
    return parsed


def _validate_shape(parsed: ParsedPql) -> None:
    predicate_count = 0

    def visit(node: Predicate | BooleanExpression) -> None:
        nonlocal predicate_count
        if isinstance(node, BooleanExpression):
            for child in node.children:
                visit(child)
            return
        predicate_count += 1
        if predicate_count > 20:
            raise PqlError("PQL supports at most 20 predicates")
        if len(node.values) > 25:
            raise PqlError("PQL lists support at most 25 values")
        if not node.values or any(not value.strip() for value in node.values):
            raise PqlError(f"{node.field} values cannot be blank")
        if node.field == "state" and any(
            value.lower() not in _VALID_STATES for value in node.values
        ):
            raise PqlError("unknown state value")
        if node.field == "priority" and any(
            value.lower() not in WP_PRIORITIES for value in node.values
        ):
            raise PqlError("unknown priority value")

    visit(parsed.expression)
    if parsed.limit is not None and not 1 <= parsed.limit <= 200:
        raise PqlError("PQL LIMIT must be between 1 and 200")


async def validate_pql_values(session: AsyncSession, user: User, parsed: ParsedPql) -> None:
    """Validate referenced projects within the caller's visible member scope."""

    project_values: set[str] = set()
    assignee_values: set[str] = set()

    def collect(node: Predicate | BooleanExpression) -> None:
        if isinstance(node, Predicate):
            if node.field == "project":
                project_values.update(value.casefold() for value in node.values)
            elif node.field == "assignee":
                assignee_values.update(
                    value.casefold()
                    for value in node.values
                    if value.casefold() not in {"me", "none"}
                )
            return
        for child in node.children:
            collect(child)

    collect(parsed.expression)
    if project_values:
        rows = (
            await session.execute(
                select(func.lower(Project.key), func.lower(Project.name))
                .distinct()
                .join(ProjectMember, ProjectMember.project_id == Project.id)
                .where(ProjectMember.user_id == user.id, Project.archived_at.is_(None))
                .where(
                    or_(
                        func.lower(Project.key).in_(project_values),
                        func.lower(Project.name).in_(project_values),
                    )
                )
            )
        ).all()
        found_projects = {
            value
            for key, name in rows
            for value in (key, name)
            if value in project_values
        }
        missing_projects = project_values - found_projects
        if missing_projects:
            raise PqlError(f"unknown project value: {sorted(missing_projects)[0]}")
    if assignee_values:
        visible_membership = aliased(ProjectMember)
        found_assignees = set(
            (
                await session.execute(
                    select(func.lower(User.display_name))
                    .distinct()
                    .join(ProjectMember, ProjectMember.user_id == User.id)
                    .join(Project, Project.id == ProjectMember.project_id)
                    .where(
                        ProjectMember.project_id.in_(
                            select(visible_membership.project_id).where(
                                visible_membership.user_id == user.id
                            )
                        ),
                        Project.archived_at.is_(None),
                        func.lower(User.display_name).in_(assignee_values),
                    )
                )
            ).scalars()
        )
        missing_assignees = assignee_values - found_assignees
        if missing_assignees:
            raise PqlError(f"unknown assignee value: {sorted(missing_assignees)[0]}")


def compile_pql(parsed: ParsedPql, user: User, assignee: Any):
    """Compile the already parsed PQL AST to SQLAlchemy expressions only."""

    def state_clause(value: str):
        normalized = value.lower()
        if normalized == "open":
            return WorkPackage.status.not_in(WP_CLOSED_STATUSES)
        if normalized == "completed":
            return WorkPackage.status.in_(WP_CLOSED_STATUSES)
        return WorkPackage.status == normalized

    def atom(field: str, value: str):
        normalized = value.casefold()
        if field == "title":
            return func.lower(WorkPackage.subject) == normalized
        if field == "state":
            return state_clause(value)
        if field == "priority":
            return WorkPackage.priority == normalized
        if field == "project":
            return or_(
                func.lower(Project.key) == normalized,
                func.lower(Project.name) == normalized,
            )
        if normalized == "me":
            return WorkPackage.assignee_id == user.id
        if normalized == "none":
            return WorkPackage.assignee_id.is_(None)
        return func.lower(assignee.display_name) == normalized

    def compile_node(node: Predicate | BooleanExpression):
        if isinstance(node, BooleanExpression):
            children = [compile_node(child) for child in node.children]
            return and_(*children) if node.operator == "AND" else or_(*children)
        atoms = [atom(node.field, value) for value in node.values]
        if node.operator in {"=", "IN"}:
            return atoms[0] if node.operator == "=" else or_(*atoms)
        if node.operator == "!=":
            return not_(atoms[0])
        return and_(*(not_(item) for item in atoms))

    return compile_node(parsed.expression)


def pql_ordering(parsed: ParsedPql):
    if not parsed.order_by:
        return None
    column = {
        "updated": WorkPackage.updated_at,
        "due": WorkPackage.due_date,
        "created": WorkPackage.created_at,
        "title": WorkPackage.subject,
        "priority": case(
            (WorkPackage.priority == "urgent", 0),
            (WorkPackage.priority == "high", 1),
            (WorkPackage.priority == "medium", 2),
            (WorkPackage.priority == "low", 3),
            (WorkPackage.priority == "none", 4),
            else_=5,
        ),
    }[parsed.order_by]
    primary = column.asc() if parsed.direction == "ASC" else column.desc()
    if parsed.order_by == "due":
        return (primary.nulls_last(), WorkPackage.id.asc())
    return (primary, WorkPackage.id.asc())
