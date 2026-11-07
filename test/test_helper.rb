# Configure Rails Environment
ENV['RAILS_ENV'] = 'test'

# Propshaft computes its asset paths at boot and skips missing directories, so
# app/assets/builds must exist before the app boots (clean checkouts, CI).
require 'fileutils'
FileUtils.mkdir_p(File.expand_path('../dummy/app/assets/builds', __FILE__))

require File.expand_path('../dummy/config/environment.rb', __FILE__)
require 'rails/test_help'

# Build dartsass entrypoints (application.css, legacy.css) so integration
# tests can request them. Same thing apps do with `rails dartsass:build`.
# (dartsass:install is intentionally skipped: its app:template scaffolding
# was removed in Rails 8 and the exe downloads its binary on first build.)
require 'rake'
require 'fileutils'
Dummy::Application.load_tasks
FileUtils.mkdir_p(Dummy::Application.root.join('app/assets/builds'))
Rake::Task['dartsass:build'].invoke

# The build above runs after boot, so force Propshaft to rescan asset
# paths (covers clean checkouts where builds/ did not exist at boot).
load_path = Rails.application.assets.load_path
load_path.send(:clear_cache)
load_path.send(:seed_cache)

Rails.backtrace_cleaner.remove_silencers!
