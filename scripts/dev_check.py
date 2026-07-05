#!/usr/bin/env python3
import os
import sys
import socket
import urllib.request
import json
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect

# Terminal colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log_status(name, success, message=""):
    color = GREEN if success else RED
    symbol = "✅" if success else "❌"
    print(f"{symbol} {BLUE}{name:<25}{RESET} : {color}{message}{RESET}")

def log_status_yellow(name, success, message):
    color = GREEN if success else YELLOW
    symbol = "✅" if success else "⚠"
    print(f"{symbol} {BLUE}{name:<25}{RESET} : {color}{message}{RESET}")

def check_backend():
    url = "http://127.0.0.1:8000/health"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                log_status("Backend Health Check", True, f"Active ({data.get('status', 'healthy')})")
                return True
            else:
                log_status("Backend Health Check", False, f"Status code {response.status}")
                return False
    except Exception as e:
        log_status("Backend Health Check", False, f"Offline ({str(e)})")
        return False

def check_env():
    load_dotenv()
    use_mock = os.getenv("USE_MOCK_MCP", "true").lower() == "true"
    swiggy_env = os.getenv("SWIGGY_ENV", "mock")
    encrypt_key = os.getenv("ENCRYPTION_KEY", "")
    client_id = os.getenv("SWIGGY_CLIENT_ID", "")
    client_secret = os.getenv("SWIGGY_CLIENT_SECRET", "")
    redirect_uri = os.getenv("SWIGGY_REDIRECT_URI", "")
    frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")

    print(f"\n{BLUE}--- Environment Variables Check ---{RESET}")
    print(f"  APP_ENV            : {os.getenv('APP_ENV', 'development')}")
    print(f"  USE_MOCK_MCP       : {use_mock}")
    print(f"  SWIGGY_ENV         : {swiggy_env}")
    print(f"  FRONTEND_BASE_URL  : {frontend_base}")
    
    if encrypt_key:
        log_status("Encryption Key Check", True, "Configured (masked)")
    else:
        log_status("Encryption Key Check", False, "Missing! Credentials cannot be decrypted securely.")

    if not use_mock:
        if client_id and client_secret and redirect_uri:
            log_status("Swiggy Staging Config", True, "All credentials configured")
        else:
            log_status("Swiggy Staging Config", False, "Missing staging client credentials!")
    else:
        log_status_yellow("Swiggy Staging Config", False, "Mock mode active (Staging credentials not required)")

def check_db():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL", "sqlite:///./nutriorder.db")
    print(f"\n{BLUE}--- Database Schema Check ---{RESET}")
    print(f"  DATABASE_URL       : {db_url}")
    
    try:
        engine = create_engine(db_url)
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        expected_tables = [
            "users", "swiggy_tokens", "user_profiles", "order_sessions",
            "order_events", "nutrition_entries", "delivery_addresses", "order_feedbacks"
        ]
        
        missing = []
        for table in expected_tables:
            if table in tables:
                log_status(f"Schema Table '{table}'", True, "Exists")
            else:
                log_status(f"Schema Table '{table}'", False, "Missing!")
                missing.append(table)
                
        if not missing:
            log_status("Database Integrity", True, "All tables present and valid")
        else:
            log_status("Database Integrity", False, f"Missing tables: {', '.join(missing)}")
            
    except Exception as e:
        log_status("Database Connection", False, f"Failed to connect: {str(e)}")

def main():
    print(f"{BLUE}========================================{RESET}")
    print(f"{BLUE}       NutriOrder AI Dev Status        {RESET}")
    print(f"{BLUE}========================================{RESET}")
    
    # 1. Backend
    print(f"\n{BLUE}--- Backend Availability Check ---{RESET}")
    backend_ok = check_backend()
    
    # 2. Frontend Ports
    print(f"\n{BLUE}--- Frontend Port Diagnostics ---{RESET}")
    for port, name in [(3000, "Frontend Default"), (3001, "Frontend Staging"), (3002, "Frontend Fallback")]:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                result = s.connect_ex(("127.0.0.1", port))
                if result == 0:
                    log_status(f"Port {port} ({name})", True, "Active and listening")
                else:
                    log_status_yellow(f"Port {port} ({name})", False, "Inactive")
        except Exception:
            log_status(f"Port {port} ({name})", False, "Error checking")
            
    # 3. Environment Variables
    check_env()
    
    # 4. Database
    check_db()
    print(f"\n{BLUE}========================================{RESET}")

if __name__ == "__main__":
    main()
