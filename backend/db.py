from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import get_settings

import ssl

settings = get_settings()

# Supabase requires SSL; pooler doesn't support prepared statements
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

from sqlalchemy.pool import NullPool

engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    query_cache_size=0,
    connect_args={
        "ssl": _ssl_ctx,
        "prepared_statement_cache_size": 0,
        "statement_cache_size": 0,
    },
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass



async def get_db() -> AsyncSession:
    """FastAPI dependency: yields an async DB session."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
