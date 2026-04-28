#!/usr/bin/env python3
# =============================================================================
# asc_fix_availability.py - Fix app territory availability via ASC API
# Version: 1.2
# Last Updated: 2026-04-25
#
# PROJECT:      Rolodeck (project v1.0.0)
# FILES:        fastlane/asc_fix_availability.py  (this file)
#               secrets/AuthKey_P54S7V43K5.p8     (ASC API key — gitignored)
#
# Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
#
# CHANGE LOG:
# v1.0  2026-04-25  Claude  Initial — tried territories + appAvailabilityTerritories types
# v1.1  2026-04-25  Claude  Try JSON:API lid pattern (rejected by API)
# v1.2  2026-04-25  Claude  Probe pricing + v2 app availability + appAvailability v1 PATCH
# =============================================================================

import sys, os, jwt, time, json, urllib.request, urllib.error

KEY_ID    = "P54S7V43K5"
ISSUER_ID = "d3dc4efe-af9b-4cb7-8400-474d32d38160"
APP_ID    = "6762417306"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT  = os.path.dirname(SCRIPT_DIR)
P8_PATH    = os.path.join(REPO_ROOT, "secrets", "AuthKey_P54S7V43K5.p8")

def make_token(private_key):
    payload = {"iss": ISSUER_ID, "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": KEY_ID})

def api(method, url, body=None, private_key=None, raise_on_error=True):
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
        print(f"  HTTP {e.code}: {body_str[:1000]}", file=sys.stderr)
        if raise_on_error:
            raise
        return None

def main():
    with open(P8_PATH) as f:
        pk = f.read()

    BASE = "https://api.appstoreconnect.apple.com"

    # Step 1: Get territories
    print("Step 1: Getting territories...")
    t_resp = api("GET", f"{BASE}/v1/territories?limit=200", private_key=pk)
    all_territories = t_resp["data"]
    all_ids = [t["id"] for t in all_territories]
    print(f"  {len(all_ids)} territories")

    # Step 2: Check existing price schedule
    print("\nStep 2: Checking price schedule...")
    ps = api("GET", f"{BASE}/v1/apps/{APP_ID}/pricePoints?filter[territory]=USA&limit=5",
             private_key=pk, raise_on_error=False)
    if ps:
        pts = ps.get("data", [])
        print(f"  Price points available for USA: {len(pts)}")
        if pts:
            print(f"  First point: id={pts[0]['id']}, attrs={pts[0]['attributes']}")

    # Check if app has a price schedule
    sched = api("GET", f"{BASE}/v2/appPriceSchedules/{APP_ID}",
                private_key=pk, raise_on_error=False)
    if sched:
        print(f"  Price schedule: {json.dumps(sched.get('data', {}).get('attributes', {}), indent=4)}")
    else:
        print("  No price schedule found (or endpoint error)")

    # Step 3: Try setting free price schedule (USD base territory, free tier)
    print("\nStep 3: Setting free price schedule...")
    # Apple free tier point for USA is typically "USA0" or similar; try to get exact ID
    pts_resp = api("GET",
        f"{BASE}/v1/apps/{APP_ID}/pricePoints?filter[territory]=USA&filter[customerPrice]=0&limit=5",
        private_key=pk, raise_on_error=False)
    if pts_resp and pts_resp.get("data"):
        free_pt = pts_resp["data"][0]
        free_pt_id = free_pt["id"]
        print(f"  Free price point ID: {free_pt_id}")

        sched_create = api("POST", f"{BASE}/v2/appPriceSchedules",
            {"data": {
                "type": "appPriceSchedules",
                "relationships": {
                    "app": {"data": {"id": APP_ID, "type": "apps"}},
                    "baseTerritory": {"data": {"id": "USA", "type": "territories"}},
                    "manualPrices": {"data": [
                        {"type": "appPrices", "lid": "0"}
                    ]}
                }
            },
            "included": [{
                "type": "appPrices",
                "lid": "0",
                "attributes": {"startDate": None},
                "relationships": {
                    "appPricePoint": {"data": {"id": free_pt_id, "type": "appPricePoints"}}
                }
            }]},
            private_key=pk, raise_on_error=False)
        if sched_create:
            print(f"  ✓ Price schedule created: {sched_create['data']['id']}")
        else:
            print("  Price schedule creation failed (may already exist)")
    else:
        print("  Could not find free price point")

    # Step 4: Check v2 app data for availability relationship
    print("\nStep 4: Checking v2 app availability relationships...")
    app2 = api("GET", f"{BASE}/v1/apps/{APP_ID}?include=availableTerritories&limit=5",
               private_key=pk, raise_on_error=False)
    if app2:
        incl = app2.get("included", [])
        print(f"  Included territories: {len(incl)}")
        if incl:
            print(f"  First territory: {incl[0]}")
        rels = app2["data"].get("relationships", {})
        print(f"  Relationships keys: {list(rels.keys())}")

    # Step 5: GET /v2/apps/{id} to see appAvailability relationship
    app_v2 = api("GET", f"{BASE}/v2/apps/{APP_ID}",
                 private_key=pk, raise_on_error=False)
    if app_v2:
        rels_v2 = app_v2["data"].get("relationships", {})
        print(f"\n  v2 App relationship keys: {list(rels_v2.keys())}")
        avail_rel = rels_v2.get("appAvailability", {})
        print(f"  appAvailability rel: {avail_rel}")
        avail_rel_v2 = rels_v2.get("appAvailabilityV2", {})
        print(f"  appAvailabilityV2 rel: {avail_rel_v2}")
    else:
        print("  v2 app endpoint failed")

    # Step 6: Try fetching appAvailabilityV2 link if present
    if app_v2:
        rels_v2 = app_v2["data"].get("relationships", {})
        for rel_name in ["appAvailabilityV2", "appAvailability"]:
            rel = rels_v2.get(rel_name, {})
            links = rel.get("links", {})
            related_url = links.get("related")
            if related_url:
                print(f"\nStep 6: Fetching {rel_name} from {related_url}...")
                av = api("GET", related_url, private_key=pk, raise_on_error=False)
                if av:
                    print(f"  Data: {json.dumps(av.get('data', {}), indent=2)[:500]}")

    print("\nDone. Check results above.")

if __name__ == "__main__":
    main()
