"""
CLI script to securely provision an Administrator user in TaskFlow MongoDB.

Usage:
    python scripts/create_admin.py --name "Admin Name" --email "admin@example.com" --password "SecurePass123"
    OR interactively:
    python scripts/create_admin.py
"""

import argparse
import asyncio
import getpass
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend root is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from bson import ObjectId
from pymongo import AsyncMongoClient
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import USERS_COLLECTION
from app.models.enums import UserRole


async def provision_admin(name: str, email: str, password: str) -> None:
    normalized_email = email.strip().lower()
    trimmed_name = name.strip()

    if not trimmed_name:
        print("[ERROR] Name cannot be empty.", file=sys.stderr)
        sys.exit(1)

    if not normalized_email or "@" not in normalized_email:
        print("[ERROR] A valid email address is required.", file=sys.stderr)
        sys.exit(1)

    if len(password) < 8:
        print("[ERROR] Password must be at least 8 characters long.", file=sys.stderr)
        sys.exit(1)

    client = AsyncMongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client[settings.MONGODB_DB_NAME]

    try:
        # Check if user already exists
        existing_user = await db[USERS_COLLECTION].find_one({"email": normalized_email})
        now = datetime.now(timezone.utc)
        pwd_hash = get_password_hash(password)

        if existing_user:
            print(f"[INFO] User with email '{normalized_email}' already exists. Promoting to ADMIN...")
            await db[USERS_COLLECTION].update_one(
                {"_id": existing_user["_id"]},
                {
                    "$set": {
                        "name": trimmed_name or existing_user.get("name"),
                        "password_hash": pwd_hash,
                        "role": UserRole.ADMIN.value,
                        "updated_at": now,
                    }
                },
            )
            print(f"[SUCCESS] User '{normalized_email}' successfully updated and granted ADMIN privileges.")
            print(f"         User ID: {existing_user['_id']}")
        else:
            new_id = ObjectId()
            admin_doc = {
                "_id": new_id,
                "name": trimmed_name,
                "email": normalized_email,
                "password_hash": pwd_hash,
                "role": UserRole.ADMIN.value,
                "created_at": now,
                "updated_at": now,
            }
            await db[USERS_COLLECTION].insert_one(admin_doc)
            print(f"[SUCCESS] Administrator user '{normalized_email}' successfully created.")
            print(f"         Admin ID: {new_id}")
            print(f"         Role: {UserRole.ADMIN.value}")
    finally:
        await client.close()


def main():
    parser = argparse.ArgumentParser(
        description="Provision an Administrator account in TaskFlow MongoDB."
    )
    parser.add_argument("--name", type=str, help="Full name of the administrator")
    parser.add_argument("--email", type=str, help="Email address of the administrator")
    parser.add_argument("--password", type=str, help="Password for the administrator")

    args = parser.parse_args()

    name = args.name
    email = args.email
    password = args.password

    if not name:
        name = input("Enter admin name: ").strip()

    if not email:
        email = input("Enter admin email: ").strip()

    if not password:
        password = getpass.getpass("Enter admin password (min 8 characters): ").strip()
        confirm_password = getpass.getpass("Confirm admin password: ").strip()
        if password != confirm_password:
            print("[ERROR] Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    asyncio.run(provision_admin(name=name, email=email, password=password))


if __name__ == "__main__":
    main()
