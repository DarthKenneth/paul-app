// =============================================================================
// withICloud.js - Expo config plugin: iCloud Documents entitlement
// Version: 1.0
// Last Updated: 2026-04-29
//
// PROJECT:      Rolodeck (project v1.5.3)
//
// ARCHITECTURE:
//   - Adds com.apple.developer.icloud-services = [CloudDocuments]
//   - Adds ubiquity-container-identifiers = [iCloud.com.ardingate.rolodeck]
//   - Adds NSUbiquitousContainers to Info.plist (required for Files app visibility)
//   - NSUbiquitousContainerIsDocumentScopePublic=false keeps files app-private
//
// CHANGE LOG:
// v1.0  2026-04-29  Claude  Initial iCloud Documents config plugin
// =============================================================================

const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

const BUNDLE_ID = 'com.ardingate.rolodeck';
const ICLOUD_CONTAINER = `iCloud.${BUNDLE_ID}`;

function withICloud(config) {
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.icloud-services'] = ['CloudDocuments'];
    c.modResults['com.apple.developer.ubiquity-container-identifiers'] = [ICLOUD_CONTAINER];
    return c;
  });

  config = withInfoPlist(config, (c) => {
    c.modResults['NSUbiquitousContainers'] = {
      [ICLOUD_CONTAINER]: {
        NSUbiquitousContainerIsDocumentScopePublic: false,
        NSUbiquitousContainerName: 'Callcard CRM',
        NSUbiquitousContainerSupportedFolderLevels: 'None',
      },
    };
    return c;
  });

  return config;
}

module.exports = withICloud;
