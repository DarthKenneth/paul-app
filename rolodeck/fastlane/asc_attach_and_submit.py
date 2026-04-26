#!/usr/bin/env python3
# =============================================================================
# asc_attach_and_submit.py - Find latest 1.0.0 TestFlight build, attach to
#                            1.0.0 App Store version slot, and submit for review
# Version: 1.0
# Last Updated: 2026-04-25
#
# PROJECT:      Rolodeck (project v1.0.0)
# FILES:        fastlane/asc_attach_and_submit.py  (this file)
#               fastlane/asc_submit_review.py      (handles review submission)
#               secrets/AuthKey_P54S7V43K5.p8      (ASC API key — gitignored)
#
# Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
#
# USAGE: python3 fastlane/asc_attach_and_submit.py [--wait]
#   --wait  Keep polling until the build appears (up to 60 min)
#
# CHANGE LOG:
# v1.0  2026-04-25  Claude  Initial — attach TestFlight build to 1.0.0 slot + submit
# v1.1  2026-04-25  Claude  Update for 1.1.0 slot; guard buildNum ≤ 24; fix build search
# =============================================================================

import sys, os, jwt, time, json, urllib.request, urllib.error

KEY_ID     = "P54S7V43K5"
ISSUER_ID  = "d3dc4efe-af9b-4cb7-8400-474d32d38160"
APP_ID     = "6762417306"
VERSION    = "1.1.0"
VERSION_ID = "ab94405c-1dae-4a58-9ddc-5c357b2a7fb6"
LOCALE_ID  = "76acd71a-2f91-4d0a-a479-5cd62cd2ad33"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.dirname(SCRIPT_DIR)
P8_PATH    = os.path.join(REPO_ROOT, "secrets", "AuthKey_P54S7V43K5.p8")

RELEASE_NOTES = (
    "Tap any phone number or email address on a customer card to instantly call or email them "
    "— a quick confirmation prompt keeps accidental taps from dialing."
)


def make_token(private_key):
    payload = {"iss": ISSUER_ID, "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": KEY_ID})


def api(method, url, body=None, private_key=None):
    token = make_token(private_key)
    data  = json.dumps(body).encode() if body else None
    req   = urllib.request.Request(
        url, data=data, method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_str = e.read().decode()
        print(f"  HTTP {e.code}: {body_str[:800]}", file=sys.stderr)
        raise


def find_build(pk, wait=False):
    """Find the latest VALID 1.0.0 iOS build uploaded by the current EAS run.
    Uses preReleaseVersions endpoint which reliably filters by version + platform.
    Guards against picking up old builds by requiring buildNum > 23 (last known build).
    """
    BASE = "https://api.appstoreconnect.apple.com"
    deadline = time.time() + (3600 if wait else 60)
    attempt  = 0

    while time.time() < deadline:
        attempt += 1
        if attempt > 1:
            print(f"  Waiting 60s for build to appear... (attempt {attempt})")
            sys.stdout.flush()
            time.sleep(60)

        try:
            # Find the preReleaseVersion record for 1.0.0/IOS, then get its builds
            prv_resp = api("GET",
                f"{BASE}/v1/preReleaseVersions"
                f"?filter[app]={APP_ID}"
                f"&filter[version]={VERSION}"
                f"&filter[platform]=IOS"
                f"&limit=1",
                private_key=pk)
            prvs = prv_resp.get("data", [])
        except Exception as e:
            print(f"  preReleaseVersions query failed: {e}")
            sys.stdout.flush()
            continue

        if not prvs:
            print(f"  No preReleaseVersion for {VERSION}/IOS yet...")
            sys.stdout.flush()
            if not wait:
                return None
            continue

        prv_id = prvs[0]["id"]

        try:
            builds_resp = api("GET",
                f"{BASE}/v1/preReleaseVersions/{prv_id}/builds"
                f"?limit=10"
                f"&fields[builds]=version,uploadedDate,processingState",
                private_key=pk)
            builds = builds_resp.get("data", [])
        except Exception as e:
            print(f"  Builds query failed: {e}")
            sys.stdout.flush()
            continue

        if not builds:
            print(f"  preReleaseVersion {VERSION}/IOS exists but no builds yet...")
            sys.stdout.flush()
            if not wait:
                return None
            continue

        for b in builds:
            a   = b["attributes"]
            num = int(a.get("version", 0))
            state = a.get("processingState", "?")
            print(f"  Build {b['id'][:8]}... buildNum={num} state={state} uploaded={a.get('uploadedDate','?')[:19]}")
            sys.stdout.flush()
            if num <= 24:
                print(f"  Skipping build #{num} — it's an old build (≤23), waiting for new one...")
                sys.stdout.flush()
                continue
            if state == "VALID":
                return b["id"]
            if state == "FAILED":
                print(f"  Build #{num} FAILED processing — cannot use.", file=sys.stderr)
                return None
            # PROCESSING or IN_BETA_TESTING — keep waiting
            print(f"  Build #{num} is still {state}, will retry...")
            sys.stdout.flush()
            break

        if not wait:
            return None

        if not wait:
            return None

    print("  Timed out waiting for build.", file=sys.stderr)
    return None


def main():
    wait = "--wait" in sys.argv

    with open(P8_PATH) as f:
        pk = f.read()

    BASE = "https://api.appstoreconnect.apple.com"

    # 1. Find a valid 1.0.0 build in TestFlight
    print(f"Step 1: Looking for {VERSION} build in TestFlight{' (will wait up to 60 min)' if wait else ''}...")
    build_id = find_build(pk, wait=wait)
    if not build_id:
        print(f"\nNo valid {VERSION} build found yet. Run again with --wait once the EAS build completes.")
        sys.exit(1)
    print(f"  ✓ Found build: {build_id}")

    # 2. Attach build to the 1.0.0 version slot
    print(f"\nStep 2: Attaching build to {VERSION} version slot...")
    api("PATCH",
        f"{BASE}/v1/appStoreVersions/{VERSION_ID}",
        {"data": {"id": VERSION_ID, "type": "appStoreVersions",
                  "relationships": {"build": {"data": {"id": build_id, "type": "builds"}}}}},
        private_key=pk)
    print("  ✓ Build attached")

    # 3. Set release notes (re-confirm)
    print("\nStep 3: Confirming release notes...")
    api("PATCH",
        f"{BASE}/v1/appStoreVersionLocalizations/{LOCALE_ID}",
        {"data": {"id": LOCALE_ID, "type": "appStoreVersionLocalizations",
                  "attributes": {"whatsNew": RELEASE_NOTES}}},
        private_key=pk)
    print(f"  ✓ Notes: {RELEASE_NOTES[:80]}...")

    # 4. Create review submission
    print("\nStep 4: Creating review submission...")
    sub = api("POST",
        f"{BASE}/v1/reviewSubmissions",
        {"data": {"type": "reviewSubmissions",
                  "attributes": {"platform": "IOS"},
                  "relationships": {"app": {"data": {"id": APP_ID, "type": "apps"}}}}},
        private_key=pk)
    sub_id = sub["data"]["id"]
    print(f"  ✓ Submission: {sub_id}")

    # 5. Add version to submission
    print("\nStep 5: Adding version to submission...")
    api("POST",
        f"{BASE}/v1/reviewSubmissionItems",
        {"data": {"type": "reviewSubmissionItems",
                  "relationships": {
                      "reviewSubmission": {"data": {"id": sub_id, "type": "reviewSubmissions"}},
                      "appStoreVersion":  {"data": {"id": VERSION_ID, "type": "appStoreVersions"}}}}},
        private_key=pk)
    print("  ✓ Version added")

    # 6. Submit for review
    print("\nStep 6: Submitting for review...")
    api("PATCH",
        f"{BASE}/v1/reviewSubmissions/{sub_id}",
        {"data": {"id": sub_id, "type": "reviewSubmissions",
                  "attributes": {"submitted": True}}},
        private_key=pk)
    print("  ✓ Submitted!")
    print()
    print(f"iOS {VERSION} is now in Apple's review queue.")


if __name__ == "__main__":
    main()
