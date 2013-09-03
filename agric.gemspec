# coding: utf-8
lib = File.expand_path('../lib', __FILE__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
require 'agric/version'

Gem::Specification.new do |spec|
  spec.name          = "agric"
  spec.version       = Agric::VERSION
  spec.authors       = ["Brice Texier"]
  spec.email         = ["brice.texier@ekylibre.org"]
  spec.description   = %q{Agricultural font based on FontAwesome and Fontello tools}
  spec.summary       = %q{Agricultural font}
  spec.homepage      = "https://github.com/ekylibre/agric"
  spec.license       = "MIT"

  spec.files         = `git ls-files`.split($/)
  spec.executables   = spec.files.grep(%r{^bin/}) { |f| File.basename(f) }
  spec.test_files    = spec.files.grep(%r{^(test|spec|features)/})
  spec.require_paths = ["lib"]

  spec.add_development_dependency "bundler", "~> 1.3"
  spec.add_development_dependency "rake"
  spec.add_development_dependency "nokogiri", ">= 1.5.7"
  # spec.add_development_dependency "activesupport"

  spec.add_dependency "railties", ">= 3.2", "< 5.0"
  spec.add_dependency "sass-rails"
  # spec.add_dependency "compass-rails", ">= 0.12.0"
end
