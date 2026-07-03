# NutriOrder AI - Swiggy Staging Credential Integration Checklist

This guide outlines the steps to transition NutriOrder AI from the mock development environment to the live Swiggy Builders Club staging environment.

---

## 🛠️ Step 1: Obtain Swiggy Staging Credentials
You must obtain the following parameters from the Swiggy Builders Club console:
* **Client ID**: Unique app ID.
* **Client Secret**: App authentication secret.
* **Redirect URI**: Configured callback endpoint (e.g. `http://localhost:8000/auth/callback`).
* **Staging Base URL**: The Swiggy staging API endpoint domain.

---

## ⚙️ Step 2: Configure Environment Variables
Update the `.env` file in your repository root directory with the following variables:

```bash
# 1. Disable mock MCP execution
USE_MOCK_MCP=false

# 2. Configure app environments
APP_ENV=staging
SWIGGY_ENV=staging

# 3. OAuth credentials
SWIGGY_CLIENT_ID=your_staging_client_id_here
SWIGGY_CLIENT_SECRET=your_staging_client_secret_here
SWIGGY_REDIRECT_URI=http://localhost:8000/auth/callback
SWIGGY_MCP_BASE_URL=https://mcp-staging.swiggy.com/food

# 4. Database parameters (Ensure staging DB is accessible)
DATABASE_URL=sqlite:///./nutriorder.db

# 5. Token encryption key (Ensure this is configured for DB storage)
ENCRYPTION_KEY=your_32_byte_hex_encryption_key_here

# 6. Checkout locks
ALLOW_PLACE_ORDER=true
```

---

## 🔒 Step 3: Run Staging Configuration Check
1. Start your backend server:
   ```bash
   python -m backend.main
   ```
2. Query the Swiggy Status endpoint:
   ```bash
   curl http://localhost:8000/auth/swiggy/status
   ```
3. Verify the JSON response contains:
   * `"use_mock_mcp": false`
   * `"database_connected": true`
   * `"encryption_key_configured": true`
   * `"client_id_configured": true`
   * `"client_secret_configured": true`

If all of these properties are `true`, the backend wrapper is fully prepared to handle live OAuth queries and Swiggy API request signatures!

---

## 🧪 Step 4: Staging Integration Test Validation
Run the integration test suite to verify token loading and decryption against the new staging parameters:

```bash
.venv/bin/python run_tests.py
```

Ensure all integration tests pass cleanly before deploying changes to staging containers.
