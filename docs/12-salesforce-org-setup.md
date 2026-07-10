# Salesforce Dev Org Setup & Using It with QE.ai

How to connect a Salesforce Developer Edition org to the QE.ai framework so
the branch-review pipeline can **execute Apex tests for real** inside an org.
(Without an org, the pipeline still works: review findings and test
generation are org-independent; only execution requires one.)

## 1. Create a free Developer Edition org (one-time, ~5 minutes)

1. Sign up at **https://developer.salesforce.com/signup** (free, no card).
2. Complete the **email verification** link Salesforce sends you — your
   password is activated there.
3. Note your **username** from the welcome email — it is *not* your email
   address (it looks like `yourname.xxxx@agentforce.com` or similar).
4. After first login, note your org's **My Domain** URL from the browser bar,
   e.g. `https://orgfarm-xxxx-dev-ed.develop.my.salesforce.com`
   (a `...lightning.force.com` URL maps to the same domain with
   `.my.salesforce.com`).

## 2. Install the Salesforce CLI

```bash
npm install -g @salesforce/cli
sf --version        # verify, e.g. @salesforce/cli/2.142.7
```

## 3. Authenticate the CLI to your org

```bash
sf org login web --set-default --alias qeai-dev \
  --instance-url https://<your-my-domain>.my.salesforce.com
```

- A browser window opens → log in with your **org username** (not email) →
  click **Allow**. If you are already logged into the org in that browser,
  it's a single Allow click.
- The session times out after a few minutes — finish signup/verification
  *before* running the command, and re-run it if it times out.
- Verify: `sf org display` → `Connected Status: Connected`.

**Gotchas we hit in practice:**

| Symptom | Cause / fix |
|---|---|
| `INVALID_LOGIN` on API login | You used your email — use the org **username**; and API (non-browser) logins additionally require a **security token** appended to the password. Prefer the browser flow. |
| `LOGIN_MUST_USE_SECURITY_TOKEN` | Username/password are correct but it's an API login. Either complete the browser flow, or reset your token (Settings → *Reset My Security Token*) and use `password+token`. |
| `AuthTimeoutError` | The login window sat open too long — just re-run the command. |

## 4. Point QE.ai at the org

Nothing to configure — the QE.ai Apex runner uses the CLI's **default org**
(that's what `--set-default` did). Confirm from the running API:

```bash
curl http://localhost:4123/api/v1/devtools/apex-test-availability
# → {"available": true, "cli": "@salesforce/cli/…", "org": "qeai-dev"}
```

If `available: false`, the response's `instructions` array tells you exactly
what's missing (CLI not on PATH, or no default org).

## 5. Use it: the full branch → review → tests → execution loop

The repo ships two demo branches so you can replay the whole story:
`demo/fee-calculator` (deliberately flawed Apex) and `fix/fee-calculator`
(the bulkified fix).

```bash
# a) Review a branch — real static analysis + real generated Apex tests
curl -X POST http://localhost:4123/api/v1/devtools/branch-review \
  -H "content-type: application/json" \
  -d '{"headRef": "demo/fee-calculator"}'
# → line-anchored findings (soql-in-loop BLOCKER, dml-in-loop BLOCKER,
#   sharing-declaration, hardcoded-id, debug-statement), verdict FAILED,
#   and FeeCalculatorTest.cls written to qeai-generated-tests/

# b) Deploy the code under test + tests to your org (standard sfdx project)
#    Complete the TODO data-setup markers in the generated test first, and
#    create any custom objects the class references (the demo needs Fee__c).
sf project deploy start --target-org qeai-dev --wait 10

# c) Execute the tests INSIDE the org through QE.ai (audited, never faked)
curl -X POST http://localhost:4123/api/v1/devtools/apex-test-run \
  -H "content-type: application/json" \
  -d '{"repoPath": "<path-to-sfdx-project>", "testClasses": ["FeeCalculatorTest"]}'
```

**What to expect on the demo branches** (verified live against a real org):

| Branch | Review | Org execution |
|---|---|---|
| `demo/fee-calculator` | 5 findings, 2 BLOCKER — *fix before merge* | `bulk200` **fails** with a genuine `System.LimitException: Too many DML statements: 151` — the org confirming the review's prediction |
| `fix/fee-calculator` | 0 findings — *approve* | **4/4 pass**, bulk test asserts ≤1 SOQL and ≤1 DML consumed |

## 6. Security notes

- Never paste your org password into chats, tickets or code. The CLI stores
  an OAuth token locally; nothing needs the password after login.
- API-style logins need a security token — treat it like a password.
- Developer orgs expire after long inactivity; log in occasionally or re-run
  step 3 if `sf org display` reports the org disconnected.
