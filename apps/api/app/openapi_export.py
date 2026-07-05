"""Dump the FastAPI OpenAPI schema as JSON to stdout.

Used by scripts/gen-openapi-types.sh to generate the TypeScript contract types
in packages/shared. Building the schema needs no DB connection.
"""

import json

from app.core.config import Settings
from app.main import create_app


def export() -> str:
    # Minimal settings so schema generation never touches env/DB specifics.
    settings = Settings(
        env="development",
        database_url="postgresql+asyncpg://x:x@localhost:5432/oneflow",
        test_database_url="postgresql+asyncpg://x:x@localhost:5432/oneflow_test",
    )
    app = create_app(settings)
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False, sort_keys=True)


if __name__ == "__main__":
    print(export())
