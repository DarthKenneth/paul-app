fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

### release

```sh
[bundle exec] fastlane release
```

Submit iOS for review AND promote Android draft to production

----


## iOS

### ios submit_review

```sh
[bundle exec] fastlane ios submit_review
```

Submit the current VERSION build from TestFlight for App Store review

----


## Android

### android promote_production

```sh
[bundle exec] fastlane android promote_production
```

Promote the production-track draft to a full 100% rollout

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
