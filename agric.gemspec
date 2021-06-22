# coding: utf-8
lib = File.expand_path('../lib', __FILE__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
require 'agric/version'

Gem::Specification.new do |spec|
  spec.name          = 'agric'
  spec.version       = Agric::VERSION
  spec.authors       = ['Brice Texier']
  spec.email         = ['brice.texier@ekylibre.org']
  spec.description   = 'Agricultural font based on FontAwesome and Fontello tools'
  spec.summary       = 'Agricultural font'
  spec.homepage      = 'https://github.com/ekylibre/agric'
  spec.license       = 'MIT'

  spec.files         = `git ls-files app lib LICENSE.txt README.md`.split($INPUT_RECORD_SEPARATOR)
  spec.executables   = spec.files.grep(%r{^bin/}) { |f| File.basename(f) }
  spec.test_files    = spec.files.grep(%r{^(test|spec|features)/})
  spec.require_paths = ['lib']

  spec.add_development_dependency "bundler", ">= 2.2.10"
  spec.add_development_dependency 'rake'

  spec.add_dependency 'railties', '>= 3.2', '< 6'
  spec.add_dependency 'sassc-rails', '~> 2'
end
