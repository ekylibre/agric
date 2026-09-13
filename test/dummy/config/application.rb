require File.expand_path('../boot', __FILE__)

require 'rails'
require 'action_controller/railtie'

# propshaft + dartsass-rails are loaded via Bundler.require below
# (requiring their railtie files directly breaks load order)
Bundler.require(:default, :development)

module Dummy
  class Application < Rails::Application
    config.encoding = 'utf-8'
    config.eager_load = false
    config.secret_key_base = 'dummy-test-secret-key-base'

    config.active_support.deprecation = :stderr

    # serve dartsass output like a modern app does
    config.assets.paths << File.expand_path('../../app/assets/builds', __dir__)

    # the test suite rebuilds dartsass entrypoints after boot (see
    # test_helper.rb); rescan asset paths on each request so the
    # Propshaft server never serves stale builds
    config.assets.sweep_cache = true

    # dartsass entrypoints under test (mirrors a modern app setup)
    config.dartsass.builds = {
      'application.scss' => 'application.css',
      'legacy.sass' => 'legacy.css'
    }
  end
end
