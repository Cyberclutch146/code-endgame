
import asyncio
import sys
import os

# Add parent directory to path so we can import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from sqlalchemy import text
from db import engine

async def test():
    print("Testing DB connection...")
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
            tables = [r[0] for r in res]
            print(f"Connection OK. Tables: {tables}")
    except Exception as e:
        print(f"DB Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
