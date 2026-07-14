from sqlalchemy import select

from app.models import User, UserProjectDirectoryPreferences

PATH = "/api/v1/me/project-directory-preferences"
DEFAULT = {
    "columns": [
        "work_package_count",
        "open_work_package_count",
        "overdue_count",
        "member_count",
    ],
    "sort_key": "default",
    "sort_direction": "asc",
    "layout": "grid",
    "updated_at": None,
    "is_default": True,
}


async def test_project_directory_preferences_defaults_normalize_and_persist(client):
    assert (await client.get(PATH)).json() == DEFAULT

    body = {
        "columns": ["member_count", "overdue_count", "member_count"],
        "sort_key": "name",
        "sort_direction": "desc",
        "layout": "list",
    }
    response = await client.put(PATH, json=body)
    assert response.status_code == 200
    assert response.json() | {"updated_at": None} == {
        **body,
        "columns": ["member_count", "overdue_count"],
        "updated_at": None,
        "is_default": False,
    }
    assert (await client.get(PATH)).json() == response.json()

    empty = {**body, "columns": [], "sort_key": "health", "layout": "grid"}
    assert (await client.put(PATH, json=empty)).json()["columns"] == []
    assert (await client.get(PATH)).json()["columns"] == []


async def test_project_directory_preferences_reject_unknown_values(client):
    valid = {
        "columns": ["member_count"],
        "sort_key": "default",
        "sort_direction": "asc",
        "layout": "grid",
    }
    for invalid in (
        {**valid, "columns": ["secret"]},
        {**valid, "sort_key": "secret"},
        {**valid, "sort_direction": "sideways"},
        {**valid, "layout": "wall"},
    ):
        assert (await client.put(PATH, json=invalid)).status_code == 422


async def test_project_directory_preferences_are_owner_scoped_and_cascade(client, app):
    async with app.state.sessionmaker() as session, session.begin():
        other = User(email="preferences-other@oneflow.local", display_name="Other")
        session.add(other)
        await session.flush()
        other_id = other.id
        session.add(
            UserProjectDirectoryPreferences(
                user_id=other_id,
                columns=[],
                sort_key="name",
                sort_direction="desc",
                layout="list",
            )
        )

    assert (await client.get(PATH)).json() == DEFAULT

    async with app.state.sessionmaker() as session, session.begin():
        other = (await session.execute(select(User).where(User.id == other_id))).scalar_one()
        await session.delete(other)
    async with app.state.sessionmaker() as session:
        stored = (
            await session.execute(
                select(UserProjectDirectoryPreferences).where(
                    UserProjectDirectoryPreferences.user_id == other_id
                )
            )
        ).scalar_one_or_none()
        assert stored is None


async def test_project_directory_preferences_are_last_write_wins(client):
    first = {
        "columns": ["member_count"],
        "sort_key": "name",
        "sort_direction": "asc",
        "layout": "list",
    }
    second = {
        "columns": ["overdue_count"],
        "sort_key": "health",
        "sort_direction": "desc",
        "layout": "grid",
    }
    assert (await client.put(PATH, json=first)).status_code == 200
    assert (await client.put(PATH, json=second)).status_code == 200
    stored = (await client.get(PATH)).json()
    assert {key: stored[key] for key in second} == second
    assert stored["is_default"] is False
