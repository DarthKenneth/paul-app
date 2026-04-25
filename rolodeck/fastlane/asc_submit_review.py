#!/usr/bin/env python3
# =============================================================================
# asc_submit_review.py - Submit the current VERSION to App Store review via ASC API
# Version: 1.1
# Last Updated: 2026-04-25
#
# PROJECT:      Rolodeck (project v1.0.0)
# FILES:        fastlane/asc_submit_review.py  (this file — ASC submission script)
#               fastlane/Fastfile              (calls this via sh action)
#               secrets/AuthKey_P54S7V43K5.p8 (ASC API private key — gitignored)
#
# Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
#
# ARCHITECTURE:
#   Called by `fastlane ios submit_review`. Steps:
#     1. Reads VERSION file to get the current version string
#     2. Finds the PREPARE_FOR_SUBMISSION appStoreVersion for that version
#     3. Finds the en-US localization ID for that version
#     4. PATCHes whatsNew (release notes) onto the localization
#     5. PATCHes releaseType to AFTER_APPROVAL (auto-release on approval)
#     6. POSTs a new reviewSubmission for the app
#     7. POSTs a reviewSubmissionItem linking the version to the submission
#     8. PATCHes the submission with submitted=true to trigger the review
#   Requires: pip install PyJWT cryptography
#
# CHANGE LOG:
# v1.0  2026-04-25  Claude  Initial — direct ASC API review submission
# v1.1  2026-04-25  Claude  Accept DEVELOPER_REJECTED state in version search so
#                            a rejected version can be re-submitted without recreating
# =============================================================================

import sys, os, jwt, time, json, textwrap, urllib.request, urllib.error

# ── Config ────────────────────────────────────────────────────────────────────

KEY_ID      = "P54S7V43K5"
ISSUER_ID   = "d3dc4efe-af9b-4cb7-8400-474d32d38160"
APP_ID      = "6762417306"

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT   = os.path.dirname(SCRIPT_DIR)
P8_PATH     = os.path.join(REPO_ROOT, "secrets", "AuthKey_P54S7V43K5.p8")
VERSION_FILE = os.path.join(REPO_ROOT, "VERSION")

# ── Helpers ───────────────────────────────────────────────────────────────────

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
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body}", file=sys.stderr)
        raise

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    version = open(VERSION_FILE).read().strip()
    print(f"Submitting iOS {version} for App Store review...")

    with open(P8_PATH) as f:
        private_key = f.read()

    pk = private_key  # shorthand for api() calls

    # 1. Find the submittable version (PREPARE_FOR_SUBMISSION or DEVELOPER_REJECTED)
    print("Step 1: Finding App Store version...")
    versions = api("GET",
        f"https://api.appstoreconnect.apple.com/v1/apps/{APP_ID}/appStoreVersions"
        f"?filter[platform]=IOS"
        f"&filter[versionString]={version}"
        f"&fields[appStoreVersions]=versionString,appVersionState",
        private_key=pk)["data"]

    SUBMITTABLE = {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED"}
    version_obj = next(
        (v for v in versions if v["attributes"]["appVersionState"] in SUBMITTABLE),
        None
    )
    if not version_obj:
        states = [v["attributes"]["appVersionState"] for v in versions]
        print(f"  No submittable version found for {version}. States: {states}")
        print("  EAS may still be uploading the build — wait a moment and retry.")
        sys.exit(1)

    version_id = version_obj["id"]
    print(f"  ✓ Found version {version} ({version_id})")

    # 2. Find the en-US localization
    print("Step 2: Finding en-US localization...")
    locs = api("GET",
        f"https://api.appstoreconnect.apple.com/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations"
        f"?fields[appStoreVersionLocalizations]=locale,whatsNew",
        private_key=pk)["data"]

    loc = next((l for l in locs if l["attributes"]["locale"] == "en-US"), None)
    if not loc:
        print("  No en-US localization found.", file=sys.stderr)
        sys.exit(1)
    locale_id = loc["id"]
    print(f"  ✓ Found locale {locale_id}")

    # 3. Set release notes (required before submission)
    print("Step 3: Setting release notes...")
    release_notes = f"Bug fixes and improvements for version {version}."
    if len(sys.argv) > 1:
        release_notes = " ".join(sys.argv[1:])
    api("PATCH",
        f"https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{locale_id}",
        {"data": {"id": locale_id, "type": "appStoreVersionLocalizations",
                  "attributes": {"whatsNew": release_notes}}},
        private_key=pk)
    print(f"  ✓ Release notes: {release_notes}")

    # 4. Set automatic release on approval
    print("Step 4: Setting AFTER_APPROVAL release type...")
    api("PATCH",
        f"https://api.appstoreconnect.apple.com/v1/appStoreVersions/{version_id}",
        {"data": {"id": version_id, "type": "appStoreVersions",
                  "attributes": {"releaseType": "AFTER_APPROVAL"}}},
        private_key=pk)
    print("  ✓ Set to release automatically on approval")

    # 5. Create review submission
    print("Step 5: Creating review submission...")
    sub = api("POST",
        "https://api.appstoreconnect.apple.com/v1/reviewSubmissions",
        {"data": {"type": "reviewSubmissions",
                  "attributes": {"platform": "IOS"},
                  "relationships": {"app": {"data": {"id": APP_ID, "type": "apps"}}}}},
        private_key=pk)
    sub_id = sub["data"]["id"]
    print(f"  ✓ Submission created: {sub_id}")

    # 6. Add version to submission
    print("Step 6: Adding version to submission...")
    api("POST",
        "https://api.appstoreconnect.apple.com/v1/reviewSubmissionItems",
        {"data": {"type": "reviewSubmissionItems",
                  "relationships": {
                      "reviewSubmission": {"data": {"id": sub_id, "type": "reviewSubmissions"}},
                      "appStoreVersion":  {"data": {"id": version_id, "type": "appStoreVersions"}}}}},
        private_key=pk)
    print("  ✓ Version added to submission")

    # 7. Submit for review
    print("Step 7: Submitting for review...")
    api("PATCH",
        f"https://api.appstoreconnect.apple.com/v1/reviewSubmissions/{sub_id}",
        {"data": {"id": sub_id, "type": "reviewSubmissions",
                  "attributes": {"submitted": True}}},
        private_key=pk)
    print("  ✓ Submitted for review!")
    print()
    print(f"iOS {version} is now in Apple's review queue.")
    print("You'll get an email when it's approved (usually 1–2 days for first submission).")

if __name__ == "__main__":
    main()
