require "agric/version"
require "agric/engine" if defined?(::Rails)

require 'pathname'

module Agric

  def self.root
    Pathname.new(File.expand_path(__FILE__)).dirname.dirname
  end

  autoload :Compiler, 'agric/compiler'
end
