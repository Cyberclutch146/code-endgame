
import sys
import os
from sqlalchemy import create_engine

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from config import get_settings
from models import Base

def init():
    settings = get_settings()
    # Convert asyncpg URL to standard postgresql URL for sync driver
    sync_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    
    # Strip any async-specific query params
    if "?" in sync_url:
        sync_url = sync_url.split("?")[0]
        
    print("Connecting to Supabase via Sync Driver...")
    
    try:
        # Create a one-off engine for schema creation
        engine = create_engine(sync_url)
        Base.metadata.create_all(engine)
        print("SUCCESS: Database schema initialized successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR: Database initialization failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    init()
