
import asyncio
import sys
import os

# Add parent directory to path so we can import backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db import engine, Base
import models  # Register models

async def init():
    print(f"Connecting to: {engine.url.render_as_string(hide_password=True)}")
    print("Creating tables in Supabase...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("SUCCESS: Tables created or already exist.")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to initialize database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(init())
