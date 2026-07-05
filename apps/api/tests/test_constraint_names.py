"""CHECK constraint names must match the model metadata (fable5 audit, DB #1).

Guards against the double-prefix regression: migrations must name CHECK constraints
so the real DB name equals what the naming convention renders for the model, or a
future ALTER-by-name migration breaks.
"""

from sqlalchemy import CheckConstraint, text

import app.models  # noqa: F401 — register every model on Base.metadata
from app.db.base import Base


def _model_check_names() -> set[str]:
    names: set[str] = set()
    for tbl in Base.metadata.tables.values():
        for c in tbl.constraints:
            if isinstance(c, CheckConstraint) and c.name:
                names.add(c.name)
    return names


async def test_db_check_constraint_names_match_models(app):
    async with app.state.sessionmaker() as session:
        rows = (
            (await session.execute(text("SELECT conname FROM pg_constraint WHERE contype = 'c'")))
            .scalars()
            .all()
        )
    db_names = set(rows)

    # No double-prefixed leftovers from the original convention bug.
    assert not [n for n in db_names if n.startswith("ck_") and "_ck_" in n]

    # Every CHECK the models declare exists in the database under its canonical name.
    missing = _model_check_names() - db_names
    assert not missing, f"model CHECK constraints missing from DB: {sorted(missing)}"
