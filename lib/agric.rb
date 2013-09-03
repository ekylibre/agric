require "agric/version"
require "agric/engine" if defined?(::Rails)
# require 'compass'
require 'pathname'

module Agric

  def self.root
    Pathname.new(File.expand_path(__FILE__)).dirname.dirname
  end

  def self.compass_extension_path
    root.join("lib", "agric", "compass")
  end

  autoload :Compiler, 'agric/compiler'
end

# Compass registration
# Compass::Frameworks.register('agric', :path => Agric.compass_extension_path)
