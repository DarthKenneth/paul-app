import ExpoModulesCore
import Foundation

public class IcloudContainerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("IcloudContainer")

    // Returns the iCloud Documents folder path, or nil if iCloud is not
    // available (user not signed in, simulator without iCloud, no entitlement).
    // Creates the Documents sub-folder if it doesn't exist yet.
    AsyncFunction("getContainerPath") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let fm = FileManager.default
        guard let containerURL = fm.url(forUbiquityContainerIdentifier: nil) else {
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

    // Synchronous check — safe to call on JS thread.
    Function("isAvailable") { () -> Bool in
      return FileManager.default.ubiquityIdentityToken != nil
    }
  }
}
