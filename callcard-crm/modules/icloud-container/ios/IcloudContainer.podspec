require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'IcloudContainer'
  s.version        = package['version']
  s.summary        = package['description']
  s.license        = package['license']
  s.author         = 'ArdinGate Studios LLC'
  s.homepage       = 'https://studios.ardingate.com'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.source_files   = '*.swift'
  s.dependency 'ExpoModulesCore'
end
