import ExpoModulesCore
import Foundation

// Native bridge: surfaces the iCloud Documents folder path to JavaScript so
// the Callcard CRM cross-device sync can read/write its data file there.
//
// The container identifier is passed explicitly (matches the entitlement
// declared by withICloud.js); using nil here would return whatever container
// happens to be first if multiple are configured.
public class IcloudContainerModule: Module {
  private static let CONTAINER_ID = "iCloud.com.ardingate.rolodeck"

  public func definition() -> ModuleDefinition {
    Name("IcloudContainer")

    // Returns the iCloud Documents folder path, or nil if iCloud is not
    // available (user not signed in, simulator without iCloud, no entitlement,
    // or iCloud Drive disabled). Creates the Documents sub-folder if missing.
    AsyncFunction("getContainerPath") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let fm = FileManager.default
        guard let containerURL = fm.url(forUbiquityContainerIdentifier: IcloudContainerModule.CONTAINER_ID) else {
          promise.resolve(nil)
          return
        }
        let docsURL = containerURL.appendingPathComponent("Documents")
        if !fm.fileExists(atPath: docsURL.path) {
          try? fm.createDirectory(at: docsURL, withIntermediateDirectories: true, attributes: nil)
        }
        promise.resolve(docsURL.path)
      }
    }

    // Synchronous availability probe. Checks BOTH that the user is signed
    // into iCloud (ubiquityIdentityToken) AND that the ubiquity container is
    // actually reachable (iCloud Drive enabled, entitlement present). The
    // identity-token-only check used to mark iCloud as "available" even when
    // the container would fail to mount.
    Function("isAvailable") { () -> Bool in
      let fm = FileManager.default
      guard fm.ubiquityIdentityToken != nil else { return false }
      return fm.url(forUbiquityContainerIdentifier: IcloudContainerModule.CONTAINER_ID) != nil
    }
  }
}
